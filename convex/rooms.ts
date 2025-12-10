import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { initializeTokens } from "./gameLogic";
import { canStartGame, canJoinRoom } from "./validators";
import type { PlayerColor } from "./gameLogic";

/**
 * Generate a unique room ID
 */
function generateRoomId(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

/**
 * Query room by roomId
 */
export const getRoom = query({
  args: {
    roomId: v.string(),
  },
  returns: v.union(
    v.object({
      room: v.any(),
      players: v.array(v.any()),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_roomId", (q) => q.eq("roomId", args.roomId))
      .first();

    if (!room) {
      return null;
    }

    const players = await ctx.db
      .query("players")
      .withIndex("by_roomId", (q) => q.eq("roomId", args.roomId))
      .collect();

    // Sort players by playerIndex
    players.sort((a, b) => a.playerIndex - b.playerIndex);

    return { room, players };
  },
});

/**
 * Create a new game room
 */
export const createRoom = mutation({
  args: {
    nickname: v.string(),
    password: v.union(v.string(), v.null()),
    playerId: v.string(),
  },
  returns: v.object({
    roomId: v.string(),
  }),
  handler: async (ctx, args) => {
    // Generate unique room ID
    let roomId = generateRoomId();
    let existingRoom = await ctx.db
      .query("rooms")
      .withIndex("by_roomId", (q) => q.eq("roomId", roomId))
      .first();

    while (existingRoom) {
      roomId = generateRoomId();
      existingRoom = await ctx.db
        .query("rooms")
        .withIndex("by_roomId", (q) => q.eq("roomId", roomId))
        .first();
    }

    // Hash password if provided
    let passwordHash: string | null = null;
    if (args.password) {
      const hashResult = await ctx.runMutation(internal.password.hashPassword, {
        password: args.password,
      });
      passwordHash = hashResult;
    }

    // Create room
    await ctx.db.insert("rooms", {
      roomId,
      passwordHash,
      maxPlayers: 4,
      gameState: "waiting",
      currentPlayerIndex: 0,
      diceValue: 0,
      hasRolledDice: false,
      lastMove: null,
      winnerId: null,
      createdAt: Date.now(),
    });

    // Add creator as first player
    await ctx.db.insert("players", {
      roomId,
      playerId: args.playerId,
      nickname: args.nickname || `Player1`,
      color: "red", // Will be reassigned when game starts
      tokens: [],
      isReady: false,
      playerIndex: 0,
    });

    return { roomId };
  },
});

/**
 * Join a room
 */
export const joinRoom = mutation({
  args: {
    roomId: v.string(),
    nickname: v.string(),
    password: v.union(v.string(), v.null()),
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

    // Get existing players
    const existingPlayers = await ctx.db
      .query("players")
      .withIndex("by_roomId", (q) => q.eq("roomId", args.roomId))
      .collect();

    // Validate password
    if (room.passwordHash) {
      if (!args.password) {
        return { success: false as const, error: "Password required" };
      }
      const isValid = await ctx.runMutation(internal.password.verifyPassword, {
        password: args.password,
        hash: room.passwordHash,
      });
      if (!isValid) {
        return { success: false as const, error: "Invalid password" };
      }
    }

    // Check if player already in room
    const existingPlayer = existingPlayers.find((p) => p.playerId === args.playerId);
    if (existingPlayer) {
      return { success: false as const, error: "You are already in this room" };
    }

    // Validate join
    const validation = canJoinRoom(room, existingPlayers);
    if (!validation.valid) {
      return { success: false as const, error: validation.error || "Cannot join room" };
    }

    // Add player to room
    const playerIndex = existingPlayers.length;
    await ctx.db.insert("players", {
      roomId: args.roomId,
      playerId: args.playerId,
      nickname: args.nickname || `Player${playerIndex + 1}`,
      color: "red", // Will be reassigned when game starts
      tokens: [],
      isReady: false,
      playerIndex,
    });

    // Assign colors to all players
    const allPlayers = await ctx.db
      .query("players")
      .withIndex("by_roomId", (q) => q.eq("roomId", args.roomId))
      .collect();

    allPlayers.sort((a, b) => a.playerIndex - b.playerIndex);
    const colors: PlayerColor[] = ["red", "blue", "green", "yellow"];
    const coloredPlayers = allPlayers.map((player, index) => ({
      ...player,
      color: colors[index],
    }));

    // Update all players with assigned colors
    for (const player of coloredPlayers) {
      await ctx.db.patch(player._id, {
        color: player.color,
      });
    }

    return { success: true as const };
  },
});

/**
 * Leave a room
 */
export const leaveRoom = mutation({
  args: {
    roomId: v.string(),
    playerId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Find and remove player
    const player = await ctx.db
      .query("players")
      .withIndex("by_roomId_and_playerId", (q) =>
        q.eq("roomId", args.roomId).eq("playerId", args.playerId)
      )
      .first();

    if (player) {
      await ctx.db.delete(player._id);
    }

    // Check if room is empty
    const remainingPlayers = await ctx.db
      .query("players")
      .withIndex("by_roomId", (q) => q.eq("roomId", args.roomId))
      .collect();

    if (remainingPlayers.length === 0) {
      // Delete room if empty
      const room = await ctx.db
        .query("rooms")
        .withIndex("by_roomId", (q) => q.eq("roomId", args.roomId))
        .first();
      if (room) {
        await ctx.db.delete(room._id);
      }
    }

    return null;
  },
});

/**
 * Start the game
 */
export const startGame = mutation({
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

    // Get players
    const players = await ctx.db
      .query("players")
      .withIndex("by_roomId", (q) => q.eq("roomId", args.roomId))
      .collect();

    players.sort((a, b) => a.playerIndex - b.playerIndex);

    // Check if player is room creator (first player)
    if (players.length === 0 || players[0].playerId !== args.playerId) {
      return { success: false as const, error: "Only room creator can start the game" };
    }

    // Validate start
    const validation = canStartGame(room, players);
    if (!validation.valid) {
      return { success: false as const, error: validation.error || "Cannot start game" };
    }

    // Assign colors if not already assigned
    const colors: PlayerColor[] = ["red", "blue", "green", "yellow"];
    for (let i = 0; i < players.length; i++) {
      const player = players[i];
      const color = colors[i];
      await ctx.db.patch(player._id, {
        color,
        tokens: initializeTokens(),
      });
    }

    // Update room state
    await ctx.db.patch(room._id, {
      gameState: "playing",
      currentPlayerIndex: 0,
      hasRolledDice: false,
      diceValue: 0,
    });

    return { success: true as const };
  },
});
