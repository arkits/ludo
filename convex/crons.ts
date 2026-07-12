import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Garbage-collect stale rooms once a day: rooms that finished more than 24
// hours ago, or any room older than 7 days regardless of state.
crons.interval(
  "cleanup old rooms",
  { hours: 24 },
  internal.rooms.cleanupOldRooms,
  {}
);

export default crons;
