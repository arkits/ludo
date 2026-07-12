import { mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { rollDice, moveToken, checkWin, getValidMoves, chooseBotMove } from "./gameLogic";
import { canRollDice, canMoveToken, canEndTurn, toPlayer, isAuthorized } from "./validators";
import type { Player } from "./gameLogic";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

// Bot pacing: slow enough that humans can follow the dice roll, the token
// animation, and the turn handoff on the client.
const BOT_HANDOFF_MS = 1500; // delay before a bot starts (or continues) its turn
const BOT_ACTION_MS = 2000; // delay between a bot's roll and its move

// Cap on the number of entries kept in room.moveHistory, to keep the room
// document from growing without bound over a long game.
const MAX_MOVE_HISTORY = 50;

/**
 * Schedule botPlay for the player at `playerIndex`, if they're a bot.
 */
async function scheduleBotIfNeeded(
  ctx: MutationCtx,
  roomId: string,
  players: Doc<"players">[],
  playerIndex: number,
  delayMs: number
): Promise<void> {
  const nextPlayer = players[playerIndex];
  if (nextPlayer && (nextPlayer.isBot ?? false)) {
    await ctx.scheduler.runAfter(delayMs, internal.game.botPlay, { roomId });
  }
}

/**
 * Roll the dice for the current player and persist the result, handling the
 * "three consecutive sixes forfeits the turn" rule. Shared by the human
 * rollDiceMutation and the bot's auto-play loop so both behave identically.
 */
async function applyRollToRoom(
  ctx: MutationCtx,
  room: Doc<"rooms">,
  players: Doc<"players">[]
): Promise<{ diceValue: number; thirdSix: boolean }> {
  const diceValue = rollDice();
  let consecutiveSixes = room.consecutiveSixes ?? 0;
  let thirdSix = false;

  if (diceValue === 6) {
    consecutiveSixes += 1;

    if (consecutiveSixes >= 3) {
      thirdSix = true;
      const nextPlayerIndex = (room.currentPlayerIndex + 1) % players.length;
      // Single patch: advance the turn and clear all dice state, so the
      // third six is never visible to clients and the DB never ends up
      // holding a stale diceValue of 6.
      await ctx.db.patch(room._id, {
        hasRolledDice: false,
        diceValue: 0,
        consecutiveSixes: 0,
        currentPlayerIndex: nextPlayerIndex,
      });

      await scheduleBotIfNeeded(ctx, room.roomId, players, nextPlayerIndex, BOT_HANDOFF_MS);
      return { diceValue, thirdSix };
    }
  } else {
    consecutiveSixes = 0;
  }

  await ctx.db.patch(room._id, {
    diceValue,
    hasRolledDice: true,
    consecutiveSixes,
  });

  return { diceValue, thirdSix };
}

/**
 * Move a token for `currentPlayerDoc`, persist the resulting token
 * positions, move history, win state, and turn advancement. Shared by the
 * human moveTokenMutation and the bot's auto-play loop.
 */
async function applyMoveAndAdvance(
  ctx: MutationCtx,
  room: Doc<"rooms">,
  players: Doc<"players">[],
  currentPlayerDoc: Doc<"players">,
  tokenId: number
): Promise<{ success: true; captured: boolean } | { success: false; error: string }> {
  const currentPlayer: Player = toPlayer(currentPlayerDoc);
  const allPlayers: Player[] = players.map(toPlayer);

  const result = moveToken(allPlayers, currentPlayer, tokenId, room.diceValue);
  if (!result) {
    return { success: false, error: "Failed to move token" };
  }

  // Update all players in database
  for (const updatedPlayer of result.updatedPlayers) {
    const playerDoc = players.find((p) => p.playerId === updatedPlayer.playerId);
    if (playerDoc) {
      await ctx.db.patch(playerDoc._id, {
        tokens: updatedPlayer.tokens,
      });
    }
  }

  // Store last move and add to (capped) history
  const movedPlayer = result.updatedPlayers.find((p) => p.playerId === currentPlayer.playerId);
  const movedToken = movedPlayer?.tokens.find((t) => t.id === tokenId);
  if (movedPlayer && movedToken) {
    const fromPosition = currentPlayer.tokens.find((t) => t.id === tokenId)?.position ?? -1;
    const moveEntry = {
      playerId: currentPlayer.playerId,
      playerNickname: currentPlayer.nickname,
      playerColor: currentPlayer.color,
      tokenId,
      fromPosition,
      toPosition: movedToken.position,
      captured: result.captured,
      timestamp: Date.now(),
    };

    const currentHistory = room.moveHistory ?? [];
    await ctx.db.patch(room._id, {
      lastMove: {
        playerId: currentPlayer.playerId,
        tokenId,
        fromPosition,
        toPosition: movedToken.position,
        captured: result.captured,
      },
      moveHistory: [...currentHistory, moveEntry].slice(-MAX_MOVE_HISTORY),
    });
  }

  // Check for win
  const winnerPlayer = result.updatedPlayers.find((p) => checkWin(p));
  if (winnerPlayer) {
    await ctx.db.patch(room._id, {
      gameState: "finished",
      winnerId: winnerPlayer.playerId,
      consecutiveSixes: 0,
    });
    return { success: true, captured: result.captured };
  }

  if (room.diceValue === 6) {
    // Rolling a 6 grants another turn to the same player.
    await ctx.db.patch(room._id, { hasRolledDice: false });
    await scheduleBotIfNeeded(ctx, room.roomId, players, room.currentPlayerIndex, BOT_HANDOFF_MS);
  } else {
    const nextPlayerIndex = (room.currentPlayerIndex + 1) % result.updatedPlayers.length;
    await ctx.db.patch(room._id, {
      currentPlayerIndex: nextPlayerIndex,
      hasRolledDice: false,
      diceValue: 0,
      consecutiveSixes: 0,
    });
    await scheduleBotIfNeeded(ctx, room.roomId, players, nextPlayerIndex, BOT_HANDOFF_MS);
  }

  return { success: true, captured: result.captured };
}

/**
 * Roll dice for current player
 */
export const rollDiceMutation = mutation({
  args: {
    roomId: v.string(),
    playerId: v.string(),
    authToken: v.optional(v.string()),
  },
  returns: v.union(
    v.object({
      success: v.literal(true),
      diceValue: v.number(),
      thirdSix: v.boolean(), // Indicates if this was the third consecutive 6
    }),
    v.object({
      success: v.literal(false),
      error: v.string(),
    })
  ),
  handler: async (ctx, args) => {
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_roomId", (q) => q.eq("roomId", args.roomId))
      .first();

    if (!room) {
      return { success: false as const, error: "Room not found" };
    }

    const players = await ctx.db
      .query("players")
      .withIndex("by_roomId", (q) => q.eq("roomId", args.roomId))
      .collect();

    players.sort((a, b) => a.playerIndex - b.playerIndex);

    const playerDoc = players.find((p) => p.playerId === args.playerId);
    if (!playerDoc || !isAuthorized(playerDoc, args.authToken)) {
      return { success: false as const, error: "Unauthorized" };
    }

    // Validate
    const validation = canRollDice(room, players, args.playerId);
    if (!validation.valid) {
      return { success: false as const, error: validation.error || "Cannot roll dice" };
    }

    const { diceValue, thirdSix } = await applyRollToRoom(ctx, room, players);

    return { success: true as const, diceValue, thirdSix };
  },
});

/**
 * Move a token
 */
export const moveTokenMutation = mutation({
  args: {
    roomId: v.string(),
    playerId: v.string(),
    tokenId: v.number(),
    authToken: v.optional(v.string()),
  },
  returns: v.union(
    v.object({
      success: v.literal(true),
      captured: v.boolean(),
    }),
    v.object({
      success: v.literal(false),
      error: v.string(),
    })
  ),
  handler: async (ctx, args) => {
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_roomId", (q) => q.eq("roomId", args.roomId))
      .first();

    if (!room) {
      return { success: false as const, error: "Room not found" };
    }

    const players = await ctx.db
      .query("players")
      .withIndex("by_roomId", (q) => q.eq("roomId", args.roomId))
      .collect();

    players.sort((a, b) => a.playerIndex - b.playerIndex);

    const playerDoc = players.find((p) => p.playerId === args.playerId);
    if (!playerDoc || !isAuthorized(playerDoc, args.authToken)) {
      return { success: false as const, error: "Unauthorized" };
    }

    // Validate
    const validation = canMoveToken(room, players, args.playerId, args.tokenId, room.diceValue);
    if (!validation.valid) {
      return { success: false as const, error: validation.error || "Cannot move token" };
    }

    // Find current player
    const currentPlayerDoc = players[room.currentPlayerIndex];
    if (!currentPlayerDoc) {
      return { success: false as const, error: "Current player not found" };
    }

    return applyMoveAndAdvance(ctx, room, players, currentPlayerDoc, args.tokenId);
  },
});

/**
 * End turn
 */
export const endTurn = mutation({
  args: {
    roomId: v.string(),
    playerId: v.string(),
    authToken: v.optional(v.string()),
  },
  returns: v.union(
    v.object({
      success: v.literal(true),
    }),
    v.object({
      success: v.literal(false),
      error: v.string(),
    })
  ),
  handler: async (ctx, args) => {
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_roomId", (q) => q.eq("roomId", args.roomId))
      .first();

    if (!room) {
      return { success: false as const, error: "Room not found" };
    }

    const players = await ctx.db
      .query("players")
      .withIndex("by_roomId", (q) => q.eq("roomId", args.roomId))
      .collect();

    players.sort((a, b) => a.playerIndex - b.playerIndex);

    const playerDoc = players.find((p) => p.playerId === args.playerId);
    if (!playerDoc || !isAuthorized(playerDoc, args.authToken)) {
      return { success: false as const, error: "Unauthorized" };
    }

    // Validate
    const validation = canEndTurn(room, players, args.playerId);
    if (!validation.valid) {
      return { success: false as const, error: validation.error || "Cannot end turn" };
    }

    // Advance to next player and reset consecutive sixes
    const nextPlayerIndex = (room.currentPlayerIndex + 1) % players.length;
    await ctx.db.patch(room._id, {
      currentPlayerIndex: nextPlayerIndex,
      hasRolledDice: false,
      diceValue: 0,
      consecutiveSixes: 0,
    });

    await scheduleBotIfNeeded(ctx, args.roomId, players, nextPlayerIndex, BOT_HANDOFF_MS);

    return { success: true as const };
  },
});

/**
 * Internal mutation to handle bot auto-play
 */
export const botPlay = internalMutation({
  args: {
    roomId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_roomId", (q) => q.eq("roomId", args.roomId))
      .first();

    if (!room || room.gameState !== "playing") {
      return null;
    }

    const players = await ctx.db
      .query("players")
      .withIndex("by_roomId", (q) => q.eq("roomId", args.roomId))
      .collect();

    players.sort((a, b) => a.playerIndex - b.playerIndex);

    const currentPlayerDoc = players[room.currentPlayerIndex];
    if (!currentPlayerDoc || !(currentPlayerDoc.isBot ?? false)) {
      return null; // Not a bot's turn
    }

    // If bot hasn't rolled dice yet, roll it
    if (!room.hasRolledDice) {
      const { thirdSix } = await applyRollToRoom(ctx, room, players);

      if (!thirdSix) {
        // Schedule next bot action (move or end turn)
        await ctx.scheduler.runAfter(BOT_ACTION_MS, internal.game.botPlay, {
          roomId: args.roomId,
        });
      }
      return null;
    }

    // Bot has rolled dice, now choose a move
    const currentPlayer: Player = toPlayer(currentPlayerDoc);
    const allPlayers: Player[] = players.map(toPlayer);
    const validMoves = getValidMoves(allPlayers, currentPlayer, room.diceValue);

    if (validMoves.length === 0) {
      // No valid moves, end turn
      const nextPlayerIndex = (room.currentPlayerIndex + 1) % players.length;
      await ctx.db.patch(room._id, {
        currentPlayerIndex: nextPlayerIndex,
        hasRolledDice: false,
        diceValue: 0,
        consecutiveSixes: 0,
      });

      await scheduleBotIfNeeded(ctx, args.roomId, players, nextPlayerIndex, BOT_HANDOFF_MS);
      return null;
    }

    // Choose the best move
    const tokenId = chooseBotMove(allPlayers, currentPlayer, room.diceValue);
    if (tokenId === null) {
      return null;
    }

    await applyMoveAndAdvance(ctx, room, players, currentPlayerDoc, tokenId);

    return null;
  },
});
