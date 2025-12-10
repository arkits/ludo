import { mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { rollDice, moveToken, checkWin, getValidMoves, chooseBotMove } from "./gameLogic";
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

    // Validate
    const validation = canRollDice(room, players, args.playerId);
    if (!validation.valid) {
      return { success: false as const, error: validation.error || "Cannot roll dice" };
    }

    // Roll dice
    const diceValue = rollDice();

    // Track consecutive 6s
    let consecutiveSixes = room.consecutiveSixes ?? 0;
    let thirdSix = false;
    
    if (diceValue === 6) {
      consecutiveSixes += 1;
      
      // If this is the third consecutive 6, end turn immediately
      if (consecutiveSixes >= 3) {
        thirdSix = true;
        const nextPlayerIndex = (room.currentPlayerIndex + 1) % players.length;
        await ctx.db.patch(room._id, {
          diceValue,
          hasRolledDice: true,
          consecutiveSixes: 0,
          currentPlayerIndex: nextPlayerIndex,
        });
        
        // Reset hasRolledDice for next player
        await ctx.db.patch(room._id, {
          hasRolledDice: false,
          diceValue: 0,
        });

        // Schedule bot play if next player is a bot
        const nextPlayer = players[nextPlayerIndex];
        if (nextPlayer && (nextPlayer.isBot ?? false)) {
          await ctx.scheduler.runAfter(800, internal.game.botPlay, {
            roomId: args.roomId,
          });
        }
        
        return { success: true as const, diceValue, thirdSix };
      }
    } else {
      consecutiveSixes = 0;
    }

    // Update room
    await ctx.db.patch(room._id, {
      diceValue,
      hasRolledDice: true,
      consecutiveSixes,
    });

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
      isBot: currentPlayerDoc.isBot ?? false,
    };

    const allPlayers: Player[] = players.map((p) => ({
      playerId: p.playerId,
      nickname: p.nickname,
      color: p.color,
      tokens: p.tokens,
      isReady: p.isReady,
      playerIndex: p.playerIndex,
      isBot: p.isBot ?? false,
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
            captured: result.captured,
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
        consecutiveSixes: 0,
      });
    } else {
      // If rolled 6, player gets another turn (but don't reset consecutive count - it's already tracked)
      if (room.diceValue === 6) {
        await ctx.db.patch(room._id, {
          hasRolledDice: false,
        });
        // If current player is a bot, schedule another roll
        if (currentPlayerDoc.isBot ?? false) {
          await ctx.scheduler.runAfter(800, internal.game.botPlay, {
            roomId: args.roomId,
          });
        }
      } else {
        // Advance to next player and reset consecutive sixes
        const nextPlayerIndex = (room.currentPlayerIndex + 1) % result.updatedPlayers.length;
        await ctx.db.patch(room._id, {
          currentPlayerIndex: nextPlayerIndex,
          hasRolledDice: false,
          diceValue: 0,
          consecutiveSixes: 0,
        });
        // Schedule bot play if next player is a bot
        const nextPlayer = players[nextPlayerIndex];
        if (nextPlayer && (nextPlayer.isBot ?? false)) {
          await ctx.scheduler.runAfter(800, internal.game.botPlay, {
            roomId: args.roomId,
          });
        }
      }
    }

    return { success: true as const, captured: result.captured };
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

    // Advance to next player and reset consecutive sixes
    const nextPlayerIndex = (room.currentPlayerIndex + 1) % players.length;
    await ctx.db.patch(room._id, {
      currentPlayerIndex: nextPlayerIndex,
      hasRolledDice: false,
      diceValue: 0,
      consecutiveSixes: 0,
    });

    // Schedule bot play if next player is a bot
    const nextPlayer = players[nextPlayerIndex];
    if (nextPlayer && (nextPlayer.isBot ?? false)) {
      await ctx.scheduler.runAfter(800, internal.game.botPlay, {
        roomId: args.roomId,
      });
    }

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

    // Convert to Player type
    const currentPlayer: Player = {
      playerId: currentPlayerDoc.playerId,
      nickname: currentPlayerDoc.nickname,
      color: currentPlayerDoc.color,
      tokens: currentPlayerDoc.tokens,
      isReady: currentPlayerDoc.isReady,
      playerIndex: currentPlayerDoc.playerIndex,
      isBot: currentPlayerDoc.isBot ?? false,
    };

    const allPlayers: Player[] = players.map((p) => ({
      playerId: p.playerId,
      nickname: p.nickname,
      color: p.color,
      tokens: p.tokens,
      isReady: p.isReady,
      playerIndex: p.playerIndex,
      isBot: p.isBot ?? false,
    }));

    // If bot hasn't rolled dice yet, roll it
    if (!room.hasRolledDice) {
      const diceValue = rollDice();

      // Track consecutive 6s
      let consecutiveSixes = room.consecutiveSixes ?? 0;
      let thirdSix = false;

      if (diceValue === 6) {
        consecutiveSixes += 1;

        // If this is the third consecutive 6, end turn immediately
        if (consecutiveSixes >= 3) {
          thirdSix = true;
          const nextPlayerIndex = (room.currentPlayerIndex + 1) % players.length;
          await ctx.db.patch(room._id, {
            diceValue,
            hasRolledDice: false,
            consecutiveSixes: 0,
            currentPlayerIndex: nextPlayerIndex,
          });

          // Schedule next bot if needed
          const nextPlayer = players[nextPlayerIndex];
          if (nextPlayer && (nextPlayer.isBot ?? false)) {
            await ctx.scheduler.runAfter(800, internal.game.botPlay, {
              roomId: args.roomId,
            });
          }
          return null;
        }
      } else {
        consecutiveSixes = 0;
      }

      // Update room with dice roll
      await ctx.db.patch(room._id, {
        diceValue,
        hasRolledDice: true,
        consecutiveSixes,
      });

      if (!thirdSix) {
        // Schedule next bot action (move or end turn)
        await ctx.scheduler.runAfter(1000, internal.game.botPlay, {
          roomId: args.roomId,
        });
      }
      return null;
    }

    // Bot has rolled dice, now choose a move
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

      // Schedule next bot if needed
      const nextPlayer = players[nextPlayerIndex];
      if (nextPlayer && (nextPlayer.isBot ?? false)) {
        await ctx.scheduler.runAfter(800, internal.game.botPlay, {
          roomId: args.roomId,
        });
      }
      return null;
    }

    // Choose the best move
    const tokenId = chooseBotMove(allPlayers, currentPlayer, room.diceValue);
    if (tokenId === null) {
      return null;
    }

    // Execute the move
    const result = moveToken(allPlayers, currentPlayer, tokenId, room.diceValue);
    if (!result) {
      return null;
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
    const movedPlayer = result.updatedPlayers.find((p) => p.playerId === currentPlayer.playerId);
    if (movedPlayer) {
      const token = movedPlayer.tokens[tokenId];
      if (token) {
        await ctx.db.patch(room._id, {
          lastMove: {
            playerId: currentPlayer.playerId,
            tokenId,
            fromPosition: currentPlayer.tokens[tokenId]?.position ?? -1,
            toPosition: token.position,
            captured: result.captured,
          },
        });
      }
    }

    // Check for win
    const winnerPlayer = result.updatedPlayers.find((p) => 
      p.tokens.every((t) => t.isFinished)
    );
    
    if (winnerPlayer) {
      await ctx.db.patch(room._id, {
        gameState: "finished",
        winnerId: winnerPlayer.playerId,
        consecutiveSixes: 0,
      });
      return null;
    }

    // If rolled 6, bot gets another turn
    if (room.diceValue === 6) {
      await ctx.db.patch(room._id, {
        hasRolledDice: false,
      });
      // Schedule another roll
      await ctx.scheduler.runAfter(800, internal.game.botPlay, {
        roomId: args.roomId,
      });
    } else {
      // Advance to next player
      const nextPlayerIndex = (room.currentPlayerIndex + 1) % result.updatedPlayers.length;
      await ctx.db.patch(room._id, {
        currentPlayerIndex: nextPlayerIndex,
        hasRolledDice: false,
        diceValue: 0,
        consecutiveSixes: 0,
      });

      // Schedule next bot if needed
      const nextPlayer = players[nextPlayerIndex];
      if (nextPlayer && (nextPlayer.isBot ?? false)) {
        await ctx.scheduler.runAfter(800, internal.game.botPlay, {
          roomId: args.roomId,
        });
      }
    }

    return null;
  },
});
