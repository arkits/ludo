import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { createTelegramApi } from "./telegram/api";
import { botToken, boardLink, webhookSecret, isConfigured } from "./telegram/config";
import { constantTimeEquals } from "./telegram/verify";
import { handleUpdate, type TelegramUpdate } from "./telegram/webhook";
import type { MatchView } from "./telegram/render";

const http = httpRouter();

/**
 * Telegram webhook.
 *
 * Register with:
 *   https://api.telegram.org/bot<TOKEN>/setWebhook
 *     ?url=https://<deployment>.convex.site/telegram/webhook
 *     &secret_token=<TELEGRAM_WEBHOOK_SECRET>
 *
 * Telegram echoes that secret back in a header on every request, which is the
 * only thing distinguishing a real update from anyone who guesses this URL.
 */
const telegramWebhook = httpAction(async (ctx, request) => {
  const expectedSecret = webhookSecret();
  if (!expectedSecret) {
    console.error("TELEGRAM_WEBHOOK_SECRET is not set; refusing all updates");
    return new Response("Not configured", { status: 503 });
  }

  const presented = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
  if (!constantTimeEquals(presented, expectedSecret)) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!isConfigured()) {
    console.error("TELEGRAM_BOT_TOKEN or TELEGRAM_BOT_USERNAME is not set");
    return new Response("Not configured", { status: 503 });
  }

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    // Malformed body: 200 anyway, or Telegram will retry it forever.
    return new Response("OK", { status: 200 });
  }

  const api = createTelegramApi(botToken());

  try {
    await handleUpdate(update, {
      api,
      boardLink: boardLink(),

      createLobby: (chatId, chatType) =>
        ctx.runMutation(internal.telegram.match.createLobby, { chatId, chatType }),

      setLobbyMessage: async (roomId, messageId) => {
        await ctx.runMutation(internal.telegram.match.setLobbyMessage, {
          roomId,
          messageId,
        });
      },

      joinLobby: (roomId, userId, nickname) =>
        ctx.runMutation(internal.telegram.match.joinLobby, {
          roomId,
          telegramUserId: userId,
          nickname,
        }),

      leaveLobby: (roomId, userId) =>
        ctx.runMutation(internal.telegram.match.leaveLobby, {
          roomId,
          telegramUserId: userId,
        }),

      addBot: (roomId, userId) =>
        ctx.runMutation(internal.telegram.match.addBotToLobby, {
          roomId,
          telegramUserId: userId,
        }),

      startMatch: (roomId, userId) =>
        ctx.runMutation(internal.telegram.match.startMatch, {
          roomId,
          telegramUserId: userId,
        }),

      matchView: async (roomId) => {
        const snapshot = await ctx.runQuery(internal.telegram.match.matchView, {
          roomId,
        });
        return (snapshot?.view ?? null) as MatchView | null;
      },
    });
  } catch (error) {
    // Never return non-200 for a handler bug: Telegram would redeliver the
    // same update indefinitely, repeating whatever partial effect it had.
    console.error("telegram update handler failed:", error);
  }

  return new Response("OK", { status: 200 });
});

http.route({
  path: "/telegram/webhook",
  method: "POST",
  handler: telegramWebhook,
});

export default http;
