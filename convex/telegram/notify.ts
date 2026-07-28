import { internalAction, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { createTelegramApi } from "./api";
import { botToken, boardLink } from "./config";
import { renderMatchText, renderMatchKeyboard, renderTurnPing } from "./render";
import { nextIdleAction, IDLE_HANDOFF_MS } from "./idle";
import type { MatchView } from "./render";
import type { MessageTarget } from "./api";

/**
 * Delivery of everything a Telegram match puts in chat: the live status board
 * and the idle turn ping.
 *
 * These are actions because they call the Bot API over the network, which
 * mutations cannot do. All the decisions they act on are made by pure code in
 * idle.ts and render.ts.
 */

/**
 * Minimum gap between two edits of the status board. Telegram tolerates about
 * one edit per second per chat; three seconds leaves comfortable headroom
 * without the board ever looking stale to a human watching the chat.
 */
const STATUS_EDIT_THROTTLE_MS = 3_000;

interface MatchSnapshot {
  view: MatchView;
  telegram: {
    chatId?: number;
    chatType: "private" | "group" | "supergroup" | "inline";
    lobbyMessageId?: number;
    inlineMessageId?: string;
    statusEditedAt?: number;
    statusText?: string;
  };
  turnStartedAt?: number;
  currentSeat: {
    nickname: string;
    isBot: boolean;
    telegramUserId?: number;
    playerIndex: number;
  } | null;
}

/**
 * Which message represents this match, if any. Solo matches have none; inline
 * matches have only an inline id, which can be edited but never replied to.
 */
export function messageTarget(
  telegram: MatchSnapshot["telegram"]
): MessageTarget | null {
  if (telegram.inlineMessageId !== undefined) {
    return { kind: "inline", inlineMessageId: telegram.inlineMessageId };
  }
  if (telegram.chatId !== undefined && telegram.lobbyMessageId !== undefined) {
    return { kind: "chat", chatId: telegram.chatId, messageId: telegram.lobbyMessageId };
  }
  return null;
}

/** Persist what we last rendered, so identical renders skip the API entirely. */
export const recordStatusEdit = internalMutation({
  args: { roomId: v.string(), text: v.string(), at: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_roomId", (q) => q.eq("roomId", args.roomId))
      .first();
    if (!room || !room.telegram) return null;

    await ctx.db.patch(room._id, {
      telegram: {
        ...room.telegram,
        statusEditedAt: args.at,
        statusText: args.text,
      },
    });
    return null;
  },
});

/**
 * Re-render the match's chat message in place.
 *
 * Scheduled on every turn change. Editing does not notify anyone, so this is
 * free from the player's point of view no matter how often it runs.
 */
export const refreshBoard = internalAction({
  args: { roomId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const snapshot = (await ctx.runQuery(internal.telegram.match.matchView, {
      roomId: args.roomId,
    })) as MatchSnapshot | null;

    if (!snapshot) return null;

    const { telegram, view } = snapshot;

    // Solo matches have a chat but no message - nothing to keep in sync.
    const target = messageTarget(telegram);
    if (!target) return null;

    const text = renderMatchText(view);

    // Identical render: skip the round trip entirely.
    if (telegram.statusText === text) return null;

    const now = Date.now();
    const elapsed = now - (telegram.statusEditedAt ?? 0);
    if (elapsed < STATUS_EDIT_THROTTLE_MS) {
      // Suppressed - schedule a trailing edit so the board never ends up
      // stuck showing an older state than the game is actually in.
      await ctx.scheduler.runAfter(
        STATUS_EDIT_THROTTLE_MS - elapsed,
        internal.telegram.notify.refreshBoard,
        { roomId: args.roomId }
      );
      return null;
    }

    const api = createTelegramApi(botToken());
    const edited = await api.editMessageText({
      target,
      text,
      replyMarkup: renderMatchKeyboard(view, boardLink()),
    });

    if (edited) {
      await ctx.runMutation(internal.telegram.notify.recordStatusEdit, {
        roomId: args.roomId,
        text,
        at: now,
      });
    }

    return null;
  },
});

/**
 * One step of idle escalation: ping a player sitting on their turn, then hand
 * their seat to the AI if they still do not move.
 *
 * `expectedTurnStartedAt` is the fingerprint captured when this check was
 * scheduled. If the turn has moved on since, the check is stale and does
 * nothing - which is why no timer ever needs cancelling.
 */
export const checkIdle = internalAction({
  args: {
    roomId: v.string(),
    expectedTurnStartedAt: v.number(),
    stage: v.union(v.literal("ping"), v.literal("handoff")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const snapshot = (await ctx.runQuery(internal.telegram.match.matchView, {
      roomId: args.roomId,
    })) as MatchSnapshot | null;

    if (!snapshot || !snapshot.currentSeat) return null;

    // A solo match cannot stall in a way that matters: there is nobody else
    // waiting, and the player is the only human.
    if (snapshot.telegram.chatType === "private") return null;

    const chatId = snapshot.telegram.chatId;

    const decision = nextIdleAction({
      gameState: snapshot.view.gameState,
      turnStartedAt: snapshot.turnStartedAt,
      expectedTurnStartedAt: args.expectedTurnStartedAt,
      stage: args.stage,
      currentSeatIsBot: snapshot.currentSeat.isBot,
      currentSeatTelegramUserId: snapshot.currentSeat.telegramUserId,
      // An inline-created match has no chat id, so there is nowhere to send.
      canPing: chatId !== undefined,
    });

    if (decision.action === "skip") return null;

    const armHandoff = () =>
      ctx.scheduler.runAfter(IDLE_HANDOFF_MS, internal.telegram.notify.checkIdle, {
        roomId: args.roomId,
        expectedTurnStartedAt: args.expectedTurnStartedAt,
        stage: "handoff" as const,
      });

    // Nothing to send, but the game still has to escalate.
    if (decision.action === "escalate") {
      await armHandoff();
      return null;
    }

    const api = createTelegramApi(botToken());
    const seat = snapshot.currentSeat;

    if (decision.action === "ping") {
      const ping = renderTurnPing(seat.nickname, seat.telegramUserId!);
      await api.sendMessage({
        chatId: chatId!,
        text: ping.text,
        entities: ping.entities,
      });
      await armHandoff();
      return null;
    }

    await ctx.runMutation(internal.telegram.match.handoffToBot, {
      roomId: args.roomId,
      playerIndex: seat.playerIndex,
    });

    // The board itself always shows the 🤖 marker after a handoff; this
    // message is a courtesy that only a chat-backed game can deliver.
    if (chatId !== undefined) {
      await api.sendMessage({
        chatId,
        text: `${seat.nickname} is away — a bot is playing their turns. They can take their seat back any time by opening the board.`,
      });
    }

    return null;
  },
});
