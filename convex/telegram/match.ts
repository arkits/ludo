import { action, internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { allocateRoomId } from "../roomId";
import { initializeTokens } from "../gameLogic";
import { canStartGame } from "../validators";
import { verifyInitData, displayName } from "./verify";
import { botToken } from "./config";
import { scheduleTurnHooks, nextTurnStamp } from "./hooks";
import { MAX_PLAYERS, MIN_PLAYERS } from "./render";
import type { PlayerColor } from "../gameLogic";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

const COLORS: PlayerColor[] = ["red", "blue", "green", "yellow"];

const chatTypeValidator = v.union(
  v.literal("private"),
  v.literal("group"),
  v.literal("supergroup")
);

/** Result shape shared by every lobby button. `message` is shown as a toast. */
const actionResult = v.object({
  ok: v.boolean(),
  message: v.string(),
});

function sortedPlayers(players: Doc<"players">[]): Doc<"players">[] {
  return [...players].sort((a, b) => a.playerIndex - b.playerIndex);
}

async function loadMatch(
  ctx: MutationCtx,
  roomId: string
): Promise<{ room: Doc<"rooms">; players: Doc<"players">[] } | null> {
  const room = await ctx.db
    .query("rooms")
    .withIndex("by_roomId", (q) => q.eq("roomId", roomId))
    .first();
  if (!room || !room.telegram) return null;

  const players = await ctx.db
    .query("players")
    .withIndex("by_roomId", (q) => q.eq("roomId", roomId))
    .collect();

  return { room, players: sortedPlayers(players) };
}

function firstFreeColor(players: Doc<"players">[]): PlayerColor {
  const taken = players.map((p) => p.color);
  return COLORS.find((c) => !taken.includes(c)) ?? "red";
}

/**
 * Re-pack playerIndex to 0..n-1. Only safe while the game is still in the
 * lobby - once play starts, currentPlayerIndex depends on these values.
 */
async function repackPlayerIndexes(
  ctx: MutationCtx,
  roomId: string
): Promise<void> {
  const remaining = sortedPlayers(
    await ctx.db
      .query("players")
      .withIndex("by_roomId", (q) => q.eq("roomId", roomId))
      .collect()
  );

  for (let i = 0; i < remaining.length; i++) {
    if (remaining[i].playerIndex !== i) {
      await ctx.db.patch(remaining[i]._id, { playerIndex: i });
    }
  }
}

/**
 * The view the chat message is rendered from, plus the bits notify.ts needs
 * to actually deliver it.
 */
export const matchView = internalQuery({
  args: { roomId: v.string() },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_roomId", (q) => q.eq("roomId", args.roomId))
      .first();
    if (!room || !room.telegram) return null;

    const players = sortedPlayers(
      await ctx.db
        .query("players")
        .withIndex("by_roomId", (q) => q.eq("roomId", args.roomId))
        .collect()
    );

    const winner = room.winnerId
      ? players.find((p) => p.playerId === room.winnerId)
      : undefined;

    const currentSeat = players[room.currentPlayerIndex];

    return {
      view: {
        roomId: room.roomId,
        gameState: room.gameState,
        maxPlayers: room.maxPlayers,
        seats: players.map((p) => ({
          nickname: p.nickname,
          color: p.color,
          isBot: p.isBot ?? false,
          finishedTokens: p.tokens.filter((t) => t.isFinished).length,
        })),
        currentPlayerIndex: room.currentPlayerIndex,
        winnerNickname: winner?.nickname ?? null,
      },
      telegram: room.telegram,
      turnStartedAt: room.turnStartedAt,
      currentSeat: currentSeat
        ? {
            nickname: currentSeat.nickname,
            isBot: currentSeat.isBot ?? false,
            telegramUserId: currentSeat.telegramUserId,
            playerIndex: currentSeat.playerIndex,
          }
        : null,
    };
  },
});

/**
 * Create a lobby for a chat. Returns null if that chat already has a match
 * that has not finished - one live game per chat keeps the "which message is
 * the real one" problem from ever arising.
 */
export const createLobby = internalMutation({
  args: {
    chatId: v.number(),
    chatType: chatTypeValidator,
  },
  returns: v.union(
    v.object({ ok: v.literal(true), roomId: v.string() }),
    v.object({ ok: v.literal(false), message: v.string() })
  ),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("rooms")
      .withIndex("by_telegram_chat", (q) => q.eq("telegram.chatId", args.chatId))
      .collect();

    const live = existing.find((r) => r.gameState !== "finished");
    if (live) {
      return {
        ok: false as const,
        message: "This chat already has a Ludo game in progress.",
      };
    }

    const roomId = await allocateRoomId(ctx);

    await ctx.db.insert("rooms", {
      roomId,
      passwordHash: null,
      maxPlayers: MAX_PLAYERS,
      gameState: "waiting",
      currentPlayerIndex: 0,
      diceValue: 0,
      hasRolledDice: false,
      consecutiveSixes: 0,
      lastMove: null,
      winnerId: null,
      createdAt: Date.now(),
      telegram: {
        chatId: args.chatId,
        chatType: args.chatType,
      },
    });

    return { ok: true as const, roomId };
  },
});

/** Record which chat message is this match's lobby / status board. */
export const setLobbyMessage = internalMutation({
  args: { roomId: v.string(), messageId: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const match = await loadMatch(ctx, args.roomId);
    if (!match || !match.room.telegram) return null;

    await ctx.db.patch(match.room._id, {
      telegram: { ...match.room.telegram, lobbyMessageId: args.messageId },
    });
    return null;
  },
});

export const joinLobby = internalMutation({
  args: {
    roomId: v.string(),
    telegramUserId: v.number(),
    nickname: v.string(),
  },
  returns: actionResult,
  handler: async (ctx, args) => {
    const match = await loadMatch(ctx, args.roomId);
    if (!match) return { ok: false, message: "That game no longer exists." };

    const { room, players } = match;

    if (room.gameState !== "waiting") {
      return { ok: false, message: "That game has already started." };
    }

    const already = players.find((p) => p.telegramUserId === args.telegramUserId);
    if (already) {
      return { ok: false, message: "You're already in this game." };
    }

    if (players.length >= room.maxPlayers) {
      return { ok: false, message: "The game is full." };
    }

    await ctx.db.insert("players", {
      roomId: args.roomId,
      playerId: `tg_${args.telegramUserId}`,
      nickname: args.nickname,
      color: firstFreeColor(players),
      tokens: [],
      isReady: true,
      playerIndex: players.length,
      isBot: false,
      // Issued now so claimSeat has something to hand the Mini App. Identity
      // is proven by initData at the door; this token carries it from there.
      authToken: crypto.randomUUID(),
      telegramUserId: args.telegramUserId,
    });

    return { ok: true, message: "You're in 🎲" };
  },
});

export const leaveLobby = internalMutation({
  args: { roomId: v.string(), telegramUserId: v.number() },
  returns: actionResult,
  handler: async (ctx, args) => {
    const match = await loadMatch(ctx, args.roomId);
    if (!match) return { ok: false, message: "That game no longer exists." };

    if (match.room.gameState !== "waiting") {
      return { ok: false, message: "You can't leave once the game has started." };
    }

    const seat = match.players.find((p) => p.telegramUserId === args.telegramUserId);
    if (!seat) return { ok: false, message: "You're not in this game." };

    await ctx.db.delete(seat._id);
    await repackPlayerIndexes(ctx, args.roomId);

    return { ok: true, message: "You've left the game." };
  },
});

export const addBotToLobby = internalMutation({
  args: { roomId: v.string(), telegramUserId: v.number() },
  returns: actionResult,
  handler: async (ctx, args) => {
    const match = await loadMatch(ctx, args.roomId);
    if (!match) return { ok: false, message: "That game no longer exists." };

    const { room, players } = match;

    if (room.gameState !== "waiting") {
      return { ok: false, message: "That game has already started." };
    }

    // Anyone seated may add a bot; an empty lobby has no host yet, so the
    // first person to act is allowed to.
    const isSeated = players.some((p) => p.telegramUserId === args.telegramUserId);
    if (players.length > 0 && !isSeated) {
      return { ok: false, message: "Join the game first." };
    }

    if (players.length >= room.maxPlayers) {
      return { ok: false, message: "The game is full." };
    }

    const botNumber = players.filter((p) => p.isBot ?? false).length + 1;

    await ctx.db.insert("players", {
      roomId: args.roomId,
      playerId: `bot_${crypto.randomUUID()}`,
      nickname: `Bot ${botNumber}`,
      color: firstFreeColor(players),
      tokens: [],
      isReady: true,
      playerIndex: players.length,
      isBot: true,
      // No authToken: bots are driven only by internal.game.botPlay.
    });

    return { ok: true, message: "Bot added 🤖" };
  },
});

export const startMatch = internalMutation({
  args: { roomId: v.string(), telegramUserId: v.number() },
  returns: actionResult,
  handler: async (ctx, args) => {
    const match = await loadMatch(ctx, args.roomId);
    if (!match) return { ok: false, message: "That game no longer exists." };

    const { room, players } = match;

    const host = players[0];
    if (!host) return { ok: false, message: "Nobody has joined yet." };
    if (host.telegramUserId !== args.telegramUserId) {
      return { ok: false, message: `Only ${host.nickname} can start this game.` };
    }

    const validation = canStartGame(room, players);
    if (!validation.valid) {
      return { ok: false, message: validation.error ?? "Can't start yet." };
    }
    if (players.length < MIN_PLAYERS) {
      return { ok: false, message: `Need at least ${MIN_PLAYERS} players.` };
    }

    for (const player of players) {
      await ctx.db.patch(player._id, { tokens: initializeTokens() });
    }

    const turnStartedAt = nextTurnStamp(room);
    await ctx.db.patch(room._id, {
      gameState: "playing",
      currentPlayerIndex: 0,
      hasRolledDice: false,
      diceValue: 0,
      consecutiveSixes: 0,
      turnStartedAt,
    });

    if (players[0].isBot ?? false) {
      await ctx.scheduler.runAfter(1000, internal.game.botPlay, { roomId: args.roomId });
    }

    // Arms the idle checks for the very first turn. Without this a game could
    // start and immediately deadlock on a player who never opens the board.
    await scheduleTurnHooks(ctx, room, players, 0, turnStartedAt);

    return { ok: true, message: "Game on 🎲" };
  },
});

/**
 * Hand a stalled seat to the bot AI. Called by the idle escalation once a
 * player has been pinged and still has not moved.
 *
 * The seat keeps its identity, so the player can take it back simply by
 * reopening the board - see claimSeatInternal.
 */
export const handoffToBot = internalMutation({
  args: { roomId: v.string(), playerIndex: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const match = await loadMatch(ctx, args.roomId);
    if (!match) return null;

    const seat = match.players[args.playerIndex];
    if (!seat || (seat.isBot ?? false)) return null;

    await ctx.db.patch(seat._id, { isBot: true, authToken: undefined });
    await ctx.scheduler.runAfter(1000, internal.game.botPlay, { roomId: args.roomId });

    return null;
  },
});

/**
 * Seat lookup for a verified Telegram user. Reclaims the seat if idle
 * escalation had handed it to the AI.
 */
export const claimSeatInternal = internalMutation({
  args: { roomId: v.string(), telegramUserId: v.number() },
  returns: v.union(
    v.object({
      seated: v.literal(true),
      roomId: v.string(),
      playerId: v.string(),
      authToken: v.string(),
      reclaimed: v.boolean(),
    }),
    v.object({ seated: v.literal(false), roomId: v.string(), reason: v.string() })
  ),
  handler: async (ctx, args) => {
    const match = await loadMatch(ctx, args.roomId);
    if (!match) {
      return { seated: false as const, roomId: args.roomId, reason: "Game not found" };
    }

    const seat = match.players.find((p) => p.telegramUserId === args.telegramUserId);
    if (!seat) {
      return {
        seated: false as const,
        roomId: args.roomId,
        reason: "You don't have a seat in this game",
      };
    }

    // A seat handed to the AI after a stall is reclaimed on reopen. Any
    // botPlay already scheduled for it becomes a no-op, because botPlay
    // returns early unless the current seat is still a bot.
    const reclaimed = seat.isBot ?? false;
    const authToken = seat.authToken ?? crypto.randomUUID();

    if (reclaimed || !seat.authToken) {
      await ctx.db.patch(seat._id, { isBot: false, authToken });
    }

    return {
      seated: true as const,
      roomId: args.roomId,
      playerId: seat.playerId,
      authToken,
      reclaimed,
    };
  },
});

/**
 * Find this user's unfinished solo match, or create one.
 *
 * Reusing an unfinished match means closing and reopening the Mini App
 * resumes the game rather than silently discarding it.
 */
export const createSoloMatchInternal = internalMutation({
  args: {
    telegramUserId: v.number(),
    nickname: v.string(),
    botCount: v.number(),
  },
  returns: v.object({
    roomId: v.string(),
    playerId: v.string(),
    authToken: v.string(),
    resumed: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("rooms")
      .withIndex("by_telegram_chat", (q) => q.eq("telegram.chatId", args.telegramUserId))
      .collect();

    const live = existing.find(
      (r) => r.gameState !== "finished" && r.telegram?.chatType === "private"
    );

    if (live) {
      const seat = await ctx.db
        .query("players")
        .withIndex("by_roomId_and_telegramUserId", (q) =>
          q.eq("roomId", live.roomId).eq("telegramUserId", args.telegramUserId)
        )
        .first();

      if (seat) {
        const authToken = seat.authToken ?? crypto.randomUUID();
        if (seat.authToken !== authToken || (seat.isBot ?? false)) {
          await ctx.db.patch(seat._id, { isBot: false, authToken });
        }
        return {
          roomId: live.roomId,
          playerId: seat.playerId,
          authToken,
          resumed: true,
        };
      }
    }

    const botCount = Math.min(Math.max(Math.trunc(args.botCount), 1), MAX_PLAYERS - 1);
    const roomId = await allocateRoomId(ctx);
    const turnStartedAt = Date.now();

    await ctx.db.insert("rooms", {
      roomId,
      passwordHash: null,
      maxPlayers: botCount + 1,
      gameState: "playing",
      currentPlayerIndex: 0,
      diceValue: 0,
      hasRolledDice: false,
      consecutiveSixes: 0,
      lastMove: null,
      winnerId: null,
      createdAt: Date.now(),
      // A solo match has a chat (the private one) but no message: there is
      // nothing to coordinate, so notify.ts skips it entirely.
      telegram: {
        chatId: args.telegramUserId,
        chatType: "private",
      },
      turnStartedAt,
    });

    const authToken = crypto.randomUUID();
    await ctx.db.insert("players", {
      roomId,
      playerId: `tg_${args.telegramUserId}`,
      nickname: args.nickname,
      color: COLORS[0],
      tokens: initializeTokens(),
      isReady: true,
      playerIndex: 0,
      isBot: false,
      authToken,
      telegramUserId: args.telegramUserId,
    });

    for (let i = 0; i < botCount; i++) {
      await ctx.db.insert("players", {
        roomId,
        playerId: `bot_${crypto.randomUUID()}`,
        nickname: `Bot ${i + 1}`,
        color: COLORS[i + 1],
        tokens: initializeTokens(),
        isReady: true,
        playerIndex: i + 1,
        isBot: true,
      });
    }

    return { roomId, playerId: `tg_${args.telegramUserId}`, authToken, resumed: false };
  },
});

/**
 * Explicit result types for the two public actions. Convex actions that call
 * a mutation from their own module need an annotated return type, or the
 * inferred type becomes circular through the generated api.
 */
export type ClaimSeatResult =
  | {
      seated: true;
      roomId: string;
      playerId: string;
      authToken: string;
      reclaimed: boolean;
    }
  | { seated: false; roomId: string; reason: string };

export type SoloMatchResult =
  | {
      ok: true;
      roomId: string;
      playerId: string;
      authToken: string;
      resumed: boolean;
    }
  | { ok: false; reason: string };

/**
 * Exchange verified `initData` for a seat's auth token.
 *
 * This is the one place Telegram identity enters the system. Everything
 * afterwards uses the existing per-seat authToken, so no existing mutation had
 * to learn about Telegram.
 *
 * An action rather than a mutation because Web Crypto is guaranteed available
 * in the action runtime; mutations run in a deterministic environment that
 * should not be relied on for crypto.subtle.
 */
export const claimSeat = action({
  args: { initData: v.string(), matchId: v.string() },
  returns: v.union(
    v.object({
      seated: v.literal(true),
      roomId: v.string(),
      playerId: v.string(),
      authToken: v.string(),
      reclaimed: v.boolean(),
    }),
    v.object({ seated: v.literal(false), roomId: v.string(), reason: v.string() })
  ),
  handler: async (ctx, args): Promise<ClaimSeatResult> => {
    const verified = await verifyInitData(args.initData, botToken());

    if (!verified.ok) {
      return { seated: false, roomId: args.matchId, reason: verified.error };
    }

    return await ctx.runMutation(internal.telegram.match.claimSeatInternal, {
      roomId: args.matchId,
      telegramUserId: verified.data.user.id,
    });
  },
});

/** Start (or resume) a solo game against bots. */
export const createSoloMatch = action({
  args: { initData: v.string(), botCount: v.number() },
  returns: v.union(
    v.object({
      ok: v.literal(true),
      roomId: v.string(),
      playerId: v.string(),
      authToken: v.string(),
      resumed: v.boolean(),
    }),
    v.object({ ok: v.literal(false), reason: v.string() })
  ),
  handler: async (ctx, args): Promise<SoloMatchResult> => {
    const verified = await verifyInitData(args.initData, botToken());

    if (!verified.ok) {
      return { ok: false, reason: verified.error };
    }

    const result: {
      roomId: string;
      playerId: string;
      authToken: string;
      resumed: boolean;
    } = await ctx.runMutation(internal.telegram.match.createSoloMatchInternal, {
      telegramUserId: verified.data.user.id,
      nickname: displayName(verified.data.user),
      botCount: args.botCount,
    });

    return { ok: true, ...result };
  },
});
