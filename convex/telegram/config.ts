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

/**
 * Where the front end is served. Convex has no way to discover this on its
 * own - the deployment knows the bot and the Mini App short name, but nothing
 * about the site hosting them - so it defaults to this project's production
 * domain and can be overridden per deployment with TELEGRAM_SITE_URL.
 */
const DEFAULT_SITE_URL = "https://ludo.archit.xyz";

/**
 * The JPEG shown on the inline invite. Telegram fetches this URL server-side,
 * so it must be publicly reachable, absolute, and actually JPEG - a PNG is
 * rejected. Served from public/telegram-invite.jpg.
 */
export function inviteImageUrl(): string {
  const base = (process.env.TELEGRAM_SITE_URL || DEFAULT_SITE_URL).replace(/\/+$/, "");
  return `${base}/telegram-invite.jpg`;
}

export function isConfigured(): boolean {
  const link = boardLink();
  return botToken() !== "" && link.botUsername !== "" && link.appShortName !== "";
}
