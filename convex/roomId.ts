import type { MutationCtx } from "./_generated/server";

/**
 * Generate a room ID. Shared by web rooms (convex/rooms.ts) and Telegram
 * matches (convex/telegram/match.ts) so the two can never drift apart on
 * format or collision handling.
 */
export function generateRoomId(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

/** Generate a room ID that no existing room is using. */
export async function allocateRoomId(ctx: MutationCtx): Promise<string> {
  let roomId = generateRoomId();
  let existing = await ctx.db
    .query("rooms")
    .withIndex("by_roomId", (q) => q.eq("roomId", roomId))
    .first();

  while (existing) {
    roomId = generateRoomId();
    existing = await ctx.db
      .query("rooms")
      .withIndex("by_roomId", (q) => q.eq("roomId", roomId))
      .first();
  }

  return roomId;
}
