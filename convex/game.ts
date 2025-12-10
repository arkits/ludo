import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { rollDice, moveToken, checkWin } from "./gameLogic";
import { canRollDice, canMoveToken, canEndTurn } from "./validators";
import type { Player } from "./gameLogic";

/**
 * Roll dice for current player
 */
export const rollDiceMutation = mutation({
  args: {
    roomId: v.string(),
    playerId: v.string(),
  },
  returns: v.union(
    v.object({
      success: v.literal(true),
      diceValue: v.number(),
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

    // Validate
    const validation = canRollDice(room, players, args.playerId);
    if (!validation.valid) {
      return { success: false as const, error: validation.error || "Cannot roll dice" };
    }

    // Roll dice
    const diceValue = rollDice();

    // Update room
    await ctx.db.patch(room._id, {
      diceValue,
      hasRolledDice: true,
    });

    return { success: true as const, diceValue };
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

    // Convert to Player type for game logic
    const currentPlayer: Player = {
      playerId: currentPlayerDoc.playerId,
      nickname: currentPlayerDoc.nickname,
      color: currentPlayerDoc.color,
      tokens: currentPlayerDoc.tokens,
      isReady: currentPlayerDoc.isReady,
      playerIndex: currentPlayerDoc.playerIndex,
    };

    const allPlayers: Player[] = players.map((p) => ({
      playerId: p.playerId,
      nickname: p.nickname,
      color: p.color,
      tokens: p.tokens,
      isReady: p.isReady,
      playerIndex: p.playerIndex,
    }));

    // Move token
    const result = moveToken(allPlayers, currentPlayer, args.tokenId, room.diceValue);
    if (!result) {
      return { success: false as const, error: "Failed to move token" };
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

    // Store last move
    const movedPlayer = result.updatedPlayers.find((p) => p.playerId === args.playerId);
    if (movedPlayer) {
      const token = movedPlayer.tokens[args.tokenId];
      if (token) {
        await ctx.db.patch(room._id, {
          lastMove: {
            playerId: args.playerId,
            tokenId: args.tokenId,
            fromPosition: currentPlayer.tokens[args.tokenId]?.position ?? -1,
            toPosition: token.position,
          },
        });
      }
    }

    // Check for win
    const winnerPlayer = result.updatedPlayers.find((p) => checkWin(p));
    if (winnerPlayer) {
      await ctx.db.patch(room._id, {
        gameState: "finished",
        winnerId: winnerPlayer.playerId,
      });
    } else {
      // If rolled 6, player gets another turn (don't advance)
      if (room.diceValue === 6) {
        await ctx.db.patch(room._id, {
          hasRolledDice: false,
        });
      } else {
        // Advance to next player
        const nextPlayerIndex = (room.currentPlayerIndex + 1) % result.updatedPlayers.length;
        await ctx.db.patch(room._id, {
          currentPlayerIndex: nextPlayerIndex,
          hasRolledDice: false,
          diceValue: 0,
        });
      }
    }

    return { success: true as const };
  },
});

/**
 * End turn
 */
export const endTurn = mutation({
  args: {
    roomId: v.string(),
    playerId: v.string(),
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

    // Validate
    const validation = canEndTurn(room, players, args.playerId);
    if (!validation.valid) {
      return { success: false as const, error: validation.error || "Cannot end turn" };
    }

    // Advance to next player
    const nextPlayerIndex = (room.currentPlayerIndex + 1) % players.length;
    await ctx.db.patch(room._id, {
      currentPlayerIndex: nextPlayerIndex,
      hasRolledDice: false,
      diceValue: 0,
    });

    return { success: true as const };
  },
});
