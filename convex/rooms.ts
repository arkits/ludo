import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { initializeTokens } from "./gameLogic";
import { canStartGame, canJoinRoom, isAuthorized } from "./validators";
import { hashPassword, verifyPassword } from "./password";
import type { PlayerColor } from "./gameLogic";

const BOT_HANDOFF_MS = 1500;
const MAX_NICKNAME_LENGTH = 20;
const ROOM_FINISHED_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const ROOM_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Generate a unique room ID
 */
function generateRoomId(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

/**
 * Trim and cap a nickname, falling back to `fallback` if the result is empty.
 */
function sanitizeNickname(nickname: string | undefined, fallback: string): string {
  const trimmed = (nickname ?? "").trim().slice(0, MAX_NICKNAME_LENGTH);
  return trimmed || fallback;
}

/**
 * Query room by roomId. Returns a sanitized view: the room without
 * passwordHash, and players without authToken (both are secrets that must
 * never reach clients).
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

    const sanitizedRoom = {
      _id: room._id,
      _creationTime: room._creationTime,
      roomId: room.roomId,
      maxPlayers: room.maxPlayers,
      gameState: room.gameState,
      currentPlayerIndex: room.currentPlayerIndex,
      diceValue: room.diceValue,
      hasRolledDice: room.hasRolledDice,
      consecutiveSixes: room.consecutiveSixes,
      lastMove: room.lastMove,
      moveHistory: room.moveHistory,
      winnerId: room.winnerId,
      createdAt: room.createdAt,
      // passwordHash intentionally omitted - never sent to clients
    };

    const sanitizedPlayers = players.map((p) => ({
      _id: p._id,
      _creationTime: p._creationTime,
      roomId: p.roomId,
      playerId: p.playerId,
      nickname: p.nickname,
      color: p.color,
      tokens: p.tokens,
      isReady: p.isReady,
      playerIndex: p.playerIndex,
      isBot: p.isBot,
      // authToken intentionally omitted - never sent to clients
    }));

    return { room: sanitizedRoom, players: sanitizedPlayers };
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
    authToken: v.string(),
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
      passwordHash = await hashPassword(args.password);
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
      consecutiveSixes: 0,
      lastMove: null,
      winnerId: null,
      createdAt: Date.now(),
    });

    const authToken = crypto.randomUUID();

    // Add creator as first player
    await ctx.db.insert("players", {
      roomId,
      playerId: args.playerId,
      nickname: sanitizeNickname(args.nickname, "Player1"),
      color: "red", // Will be reassigned when game starts
      tokens: [],
      isReady: false,
      playerIndex: 0,
      isBot: false,
      authToken,
    });

    return { roomId, authToken };
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
      authToken: v.string(),
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
      const isValid = await verifyPassword(args.password, room.passwordHash);
      if (!isValid) {
        return { success: false as const, error: "Invalid password" };
      }
    }

    // Check if player already in room. A returning member who lost their
    // locally-stored authToken would otherwise be locked out permanently
    // (every mutation rejects, and joinRoom refuses to re-issue). Re-issue
    // a fresh token when the caller has proven what they can: the room
    // password (verified above), or the seat never had a token (legacy).
    const existingPlayer = existingPlayers.find((p) => p.playerId === args.playerId);
    if (existingPlayer) {
      const canRecover =
        !(existingPlayer.isBot ?? false) &&
        (room.passwordHash !== null || !existingPlayer.authToken);
      if (canRecover) {
        const authToken = crypto.randomUUID();
        await ctx.db.patch(existingPlayer._id, { authToken });
        return { success: true as const, authToken };
      }
      return { success: false as const, error: "You are already in this room" };
    }

    // Validate join
    const validation = canJoinRoom(room, existingPlayers);
    if (!validation.valid) {
      return { success: false as const, error: validation.error || "Cannot join room" };
    }

    // Assign the new player the first color not already taken - do NOT
    // touch other players' colors (they may have picked one deliberately).
    const colors: PlayerColor[] = ["red", "blue", "green", "yellow"];
    const takenColors = existingPlayers.map((p) => p.color);
    const availableColor = colors.find((c) => !takenColors.includes(c)) || "red";

    const authToken = crypto.randomUUID();
    const playerIndex = existingPlayers.length;
    await ctx.db.insert("players", {
      roomId: args.roomId,
      playerId: args.playerId,
      nickname: sanitizeNickname(args.nickname, `Player${playerIndex + 1}`),
      color: availableColor,
      tokens: [],
      isReady: false,
      playerIndex,
      isBot: false,
      authToken,
    });

    return { success: true as const, authToken };
  },
});

/**
 * Leave a room
 */
export const leaveRoom = mutation({
  args: {
    roomId: v.string(),
    playerId: v.string(),
    authToken: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_roomId", (q) => q.eq("roomId", args.roomId))
      .first();

    // Find player
    const player = await ctx.db
      .query("players")
      .withIndex("by_roomId_and_playerId", (q) =>
        q.eq("roomId", args.roomId).eq("playerId", args.playerId)
      )
      .first();

    if (!player || !isAuthorized(player, args.authToken)) {
      return null;
    }

    if (room && room.gameState === "playing") {
      // Mid-game: removing the player doc would corrupt playerIndex/
      // currentPlayerIndex bookkeeping. Instead, convert them to a bot so
      // the game can continue without them.
      await ctx.db.patch(player._id, { isBot: true, authToken: undefined });

      // During play, playerIndex values are packed 0..n-1 (no mid-game
      // deletions), so comparing indexes directly avoids re-querying the
      // whole player list just to find whose turn it is.
      if (player.playerIndex === room.currentPlayerIndex) {
        await ctx.scheduler.runAfter(BOT_HANDOFF_MS, internal.game.botPlay, {
          roomId: args.roomId,
        });
      }

      return null;
    }

    // Waiting room (or no room found): delete the player and re-pack
    // playerIndex values for the remaining players.
    await ctx.db.delete(player._id);

    const remainingPlayers = await ctx.db
      .query("players")
      .withIndex("by_roomId", (q) => q.eq("roomId", args.roomId))
      .collect();
    remainingPlayers.sort((a, b) => a.playerIndex - b.playerIndex);

    for (let i = 0; i < remainingPlayers.length; i++) {
      if (remainingPlayers[i].playerIndex !== i) {
        await ctx.db.patch(remainingPlayers[i]._id, { playerIndex: i });
      }
    }

    if (remainingPlayers.length === 0 && room) {
      // Delete room if empty
      await ctx.db.delete(room._id);
    }

    return null;
  },
});

/**
 * Update player info (name and/or color) in waiting room
 */
export const updatePlayer = mutation({
  args: {
    roomId: v.string(),
    playerId: v.string(),
    nickname: v.optional(v.string()),
    color: v.optional(v.union(v.literal("red"), v.literal("blue"), v.literal("green"), v.literal("yellow"))),
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

    // Only allow changes in waiting state
    if (room.gameState !== "waiting") {
      return { success: false as const, error: "Cannot change settings after game has started" };
    }

    // Find the player
    const player = await ctx.db
      .query("players")
      .withIndex("by_roomId_and_playerId", (q) =>
        q.eq("roomId", args.roomId).eq("playerId", args.playerId)
      )
      .first();

    if (!player) {
      return { success: false as const, error: "Player not found" };
    }

    if (!isAuthorized(player, args.authToken)) {
      return { success: false as const, error: "Unauthorized" };
    }

    // Build update object
    const updates: { nickname?: string; color?: PlayerColor } = {};

    if (args.nickname !== undefined) {
      const trimmed = args.nickname.trim();
      if (trimmed) {
        updates.nickname = trimmed.slice(0, MAX_NICKNAME_LENGTH);
      }
    }

    if (args.color !== undefined) {
      // Check if color is already taken by another player
      const allPlayers = await ctx.db
        .query("players")
        .withIndex("by_roomId", (q) => q.eq("roomId", args.roomId))
        .collect();

      const colorTaken = allPlayers.some(
        (p) => p.playerId !== args.playerId && p.color === args.color
      );

      if (colorTaken) {
        return { success: false as const, error: "This color is already taken" };
      }

      updates.color = args.color;
    }

    // Apply updates
    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(player._id, updates);
    }

    return { success: true as const };
  },
});

/**
 * Add a bot to the room (host only)
 */
export const addBot = mutation({
  args: {
    roomId: v.string(),
    playerId: v.string(), // Host's player ID
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

    if (room.gameState !== "waiting") {
      return { success: false as const, error: "Cannot add bots after game has started" };
    }

    // Get existing players
    const players = await ctx.db
      .query("players")
      .withIndex("by_roomId", (q) => q.eq("roomId", args.roomId))
      .collect();

    players.sort((a, b) => a.playerIndex - b.playerIndex);

    // Check if player is the host (first player)
    if (players.length === 0 || players[0].playerId !== args.playerId) {
      return { success: false as const, error: "Only the host can add bots" };
    }

    if (!isAuthorized(players[0], args.authToken)) {
      return { success: false as const, error: "Unauthorized" };
    }

    // Check if room is full
    if (players.length >= room.maxPlayers) {
      return { success: false as const, error: "Room is full" };
    }

    // Generate bot ID and name
    const botId = `bot_${crypto.randomUUID()}`;
    const botNumber = players.filter((p) => p.isBot ?? false).length + 1;
    const botName = `Bot ${botNumber}`;

    // Get available color
    const colors: PlayerColor[] = ["red", "blue", "green", "yellow"];
    const takenColors = players.map((p) => p.color);
    const availableColor = colors.find((c) => !takenColors.includes(c)) || "red";

    // Add bot (no authToken - bots are only ever driven by internal.game.botPlay)
    const playerIndex = players.length;
    await ctx.db.insert("players", {
      roomId: args.roomId,
      playerId: botId,
      nickname: botName,
      color: availableColor,
      tokens: [],
      isReady: true, // Bots are always ready
      playerIndex,
      isBot: true,
    });

    return { success: true as const };
  },
});

/**
 * Remove a bot from the room (host only)
 */
export const removeBot = mutation({
  args: {
    roomId: v.string(),
    playerId: v.string(), // Host's player ID
    botPlayerId: v.string(), // Bot to remove
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

    if (room.gameState !== "waiting") {
      return { success: false as const, error: "Cannot remove bots after game has started" };
    }

    // Get existing players
    const players = await ctx.db
      .query("players")
      .withIndex("by_roomId", (q) => q.eq("roomId", args.roomId))
      .collect();

    players.sort((a, b) => a.playerIndex - b.playerIndex);

    // Check if player is the host (first player)
    if (players.length === 0 || players[0].playerId !== args.playerId) {
      return { success: false as const, error: "Only the host can remove bots" };
    }

    if (!isAuthorized(players[0], args.authToken)) {
      return { success: false as const, error: "Unauthorized" };
    }

    // Find the bot
    const bot = players.find((p) => p.playerId === args.botPlayerId && (p.isBot ?? false));
    if (!bot) {
      return { success: false as const, error: "Bot not found" };
    }

    // Remove the bot. Its color simply becomes available again - do NOT
    // reassign remaining players' colors (they may have picked one
    // deliberately via updatePlayer).
    await ctx.db.delete(bot._id);

    // Reorder remaining players
    const remainingPlayers = players.filter((p) => p._id !== bot._id);
    for (let i = 0; i < remainingPlayers.length; i++) {
      if (remainingPlayers[i].playerIndex !== i) {
        await ctx.db.patch(remainingPlayers[i]._id, { playerIndex: i });
      }
    }

    return { success: true as const };
  },
});

/**
 * Start the game
 */
export const startGame = mutation({
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

    if (!isAuthorized(players[0], args.authToken)) {
      return { success: false as const, error: "Unauthorized" };
    }

    // Validate start
    const validation = canStartGame(room, players);
    if (!validation.valid) {
      return { success: false as const, error: validation.error || "Cannot start game" };
    }

    // Initialize tokens for all players (keep their selected colors)
    for (const player of players) {
      await ctx.db.patch(player._id, {
        tokens: initializeTokens(),
      });
    }

    // Update room state
    await ctx.db.patch(room._id, {
      gameState: "playing",
      currentPlayerIndex: 0,
      hasRolledDice: false,
      diceValue: 0,
      consecutiveSixes: 0,
    });

    // If the first player is a bot, schedule bot play
    if (players[0].isBot ?? false) {
      await ctx.scheduler.runAfter(1000, internal.game.botPlay, {
        roomId: args.roomId,
      });
    }

    return { success: true as const };
  },
});

/**
 * Internal: delete stale rooms (and their players). Used by the daily cron
 * in convex/crons.ts. Deletes rooms that are "finished" and older than 24
 * hours, or any room older than 7 days regardless of state.
 */
export const cleanupOldRooms = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    const rooms = await ctx.db.query("rooms").collect();

    for (const room of rooms) {
      const age = now - room.createdAt;
      const isStaleFinished = room.gameState === "finished" && age > ROOM_FINISHED_TTL_MS;
      const isTooOld = age > ROOM_MAX_AGE_MS;

      if (!isStaleFinished && !isTooOld) continue;

      const players = await ctx.db
        .query("players")
        .withIndex("by_roomId", (q) => q.eq("roomId", room.roomId))
        .collect();

      for (const player of players) {
        await ctx.db.delete(player._id);
      }

      await ctx.db.delete(room._id);
    }

    return null;
  },
});
