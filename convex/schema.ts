import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  rooms: defineTable({
    roomId: v.string(),
    passwordHash: v.union(v.string(), v.null()),
    maxPlayers: v.number(),
    gameState: v.union(v.literal("waiting"), v.literal("playing"), v.literal("finished")),
    currentPlayerIndex: v.number(),
    diceValue: v.number(),
    hasRolledDice: v.boolean(),
    consecutiveSixes: v.optional(v.number()), // Track consecutive 6s - turn ends after 3 (defaults to 0)
    lastMove: v.union(
      v.object({
        playerId: v.string(),
        tokenId: v.number(),
        fromPosition: v.number(),
        toPosition: v.number(),
        captured: v.boolean(), // Track if a capture occurred
      }),
      v.null()
    ),
    moveHistory: v.optional(v.array(
      v.object({
        playerId: v.string(),
        playerNickname: v.string(),
        playerColor: v.union(v.literal("red"), v.literal("blue"), v.literal("green"), v.literal("yellow")),
        tokenId: v.number(),
        fromPosition: v.number(),
        toPosition: v.number(),
        captured: v.boolean(),
        timestamp: v.number(),
      })
    )),
    winnerId: v.union(v.string(), v.null()),
    createdAt: v.number(),

    // Telegram matches only. The presence of this field marks a room as
    // Telegram-owned: its roomId is never surfaced in chat, and joinRoom()
    // refuses it outright so web players can never wander in.
    telegram: v.optional(
      v.object({
        chatId: v.number(),
        chatType: v.union(
          v.literal("private"),
          v.literal("group"),
          v.literal("supergroup")
        ),
        // The lobby message, which becomes the live status board once the
        // game starts. Absent for solo matches, which have no chat presence.
        lobbyMessageId: v.optional(v.number()),
        // Throttling state for status-board edits.
        statusEditedAt: v.optional(v.number()),
        statusText: v.optional(v.string()),
      })
    ),
    // Stamped on every turn advance. Doubles as the fingerprint that lets a
    // scheduled idle check detect whether the turn moved on since it was
    // scheduled, so stale timers self-invalidate (see telegram/idle.ts).
    turnStartedAt: v.optional(v.number()),
  })
    .index("by_roomId", ["roomId"])
    .index("by_telegram_chat", ["telegram.chatId"]),

  players: defineTable({
    roomId: v.string(),
    playerId: v.string(),
    nickname: v.string(),
    color: v.union(v.literal("red"), v.literal("blue"), v.literal("green"), v.literal("yellow")),
    tokens: v.array(
      v.object({
        id: v.number(),
        position: v.number(),
        isHome: v.boolean(),
        isFinished: v.boolean(),
      })
    ),
    isReady: v.boolean(),
    playerIndex: v.number(), // Order in which player joined (0 = creator)
    isBot: v.optional(v.boolean()), // Whether this player is a bot (defaults to false)
    authToken: v.optional(v.string()), // Per-player secret used to authorize mutations for this player
    telegramUserId: v.optional(v.number()), // Set for seats claimed via Telegram
  })
    .index("by_roomId", ["roomId"])
    .index("by_roomId_and_playerId", ["roomId", "playerId"])
    .index("by_roomId_and_telegramUserId", ["roomId", "telegramUserId"]),
});
