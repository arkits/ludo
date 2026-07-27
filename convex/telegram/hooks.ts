import { internal } from "../_generated/api";
import { IDLE_PING_MS } from "./idle";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/**
 * Bookkeeping every turn change in a Telegram match needs. Shared by the turn
 * engine (convex/game.ts) and match start (convex/telegram/match.ts) so a game
 * can never begin without its idle checks armed.
 *
 * Web rooms have no `telegram` field and skip all of it.
 */

/**
 * The next value for `room.turnStartedAt`.
 *
 * Forced strictly upward rather than read raw from the clock: this is the
 * fingerprint scheduled idle checks compare against, and two turn changes
 * landing in the same millisecond would otherwise be indistinguishable,
 * making a stale check look current.
 */
export function nextTurnStamp(room: Doc<"rooms">): number {
  return Math.max(Date.now(), (room.turnStartedAt ?? 0) + 1);
}

export async function scheduleTurnHooks(
  ctx: MutationCtx,
  room: Doc<"rooms">,
  players: Doc<"players">[],
  nextPlayerIndex: number,
  turnStartedAt: number
): Promise<void> {
  if (!room.telegram) return;

  // A solo match has no chat presence: no message to edit, and nobody kept
  // waiting if the player wanders off. Skipping here avoids scheduling two
  // functions per turn that would only return early anyway.
  if (room.telegram.chatType === "private") return;

  await ctx.scheduler.runAfter(0, internal.telegram.notify.refreshBoard, {
    roomId: room.roomId,
  });

  // Only a human can stall. A bot seat is already being driven by botPlay,
  // and pinging it would be nonsense.
  const nextPlayer = players[nextPlayerIndex];
  if (!nextPlayer || (nextPlayer.isBot ?? false)) return;

  await ctx.scheduler.runAfter(IDLE_PING_MS, internal.telegram.notify.checkIdle, {
    roomId: room.roomId,
    expectedTurnStartedAt: turnStartedAt,
    stage: "ping",
  });
}
