/**
 * The idle-escalation state machine for Telegram matches.
 *
 * When a turn starts, the room stamps `turnStartedAt` and schedules a check.
 * That stamp doubles as a fingerprint: a check that fires after the turn has
 * already moved on sees a different value and does nothing. Stale timers
 * therefore self-invalidate, and no cancellation machinery is needed.
 *
 * Pure by design - the whole escalation is decided here and merely executed by
 * convex/telegram/notify.ts.
 */

/** How long a player may sit on their turn before the chat pings them. */
export const IDLE_PING_MS = 60_000;

/** How long after the ping before their seat is handed to the bot AI. */
export const IDLE_HANDOFF_MS = 60_000;

export type IdleStage = "ping" | "handoff";

export type IdleDecision =
  | { action: "skip"; reason: string }
  | { action: "ping" }
  | { action: "handoff" };

export interface IdleInput {
  gameState: "waiting" | "playing" | "finished";
  /** The room's current stamp. */
  turnStartedAt: number | undefined;
  /** The stamp captured when this check was scheduled. */
  expectedTurnStartedAt: number;
  stage: IdleStage;
  /** Whether the seat whose turn it is has already been handed to the AI. */
  currentSeatIsBot: boolean;
  /** Absent for a seat with no Telegram identity - nobody to ping. */
  currentSeatTelegramUserId: number | undefined;
}

export function nextIdleAction(input: IdleInput): IdleDecision {
  if (input.gameState !== "playing") {
    return { action: "skip", reason: "game is not in play" };
  }

  // The turn moved on between scheduling and firing: this timer is stale.
  if (input.turnStartedAt !== input.expectedTurnStartedAt) {
    return { action: "skip", reason: "turn already advanced" };
  }

  // A bot seat is already being driven by internal.game.botPlay. Pinging it
  // would be nonsense and handing it off again would be a no-op.
  if (input.currentSeatIsBot) {
    return { action: "skip", reason: "seat is already a bot" };
  }

  if (input.stage === "ping") {
    if (input.currentSeatTelegramUserId === undefined) {
      return { action: "skip", reason: "seat has no Telegram user to ping" };
    }
    return { action: "ping" };
  }

  return { action: "handoff" };
}
