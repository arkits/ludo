import type { BoardLink } from "./render";

/**
 * Telegram configuration, read from the Convex deployment environment.
 * Set with `npx convex env set <NAME> <value>` - never bundled into the client.
 */

export function botToken(): string {
  return process.env.TELEGRAM_BOT_TOKEN ?? "";
}

/** Shared secret Telegram echoes back on every webhook request. */
export function webhookSecret(): string {
  return process.env.TELEGRAM_WEBHOOK_SECRET ?? "";
}

/**
 * Where the "Open board" button points: `t.me/<botUsername>/<appShortName>`.
 * Both come from BotFather - the username from /newbot, the short name from
 * /newapp. Neither has a default: a guessed short name produces a link that
 * looks fine and silently goes nowhere, which is worse than refusing to run.
 */
export function boardLink(): BoardLink {
  return {
    botUsername: process.env.TELEGRAM_BOT_USERNAME ?? "",
    appShortName: process.env.TELEGRAM_APP_SHORT_NAME ?? "",
  };
}

export function isConfigured(): boolean {
  const link = boardLink();
  return botToken() !== "" && link.botUsername !== "" && link.appShortName !== "";
}
