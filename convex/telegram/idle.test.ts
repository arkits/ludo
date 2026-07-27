import { describe, it, expect } from "vitest";
import { nextIdleAction, type IdleInput } from "./idle";

const TURN_STAMP = 1_700_000_000_000;

function input(overrides: Partial<IdleInput> = {}): IdleInput {
  return {
    gameState: "playing",
    turnStartedAt: TURN_STAMP,
    expectedTurnStartedAt: TURN_STAMP,
    stage: "ping",
    currentSeatIsBot: false,
    currentSeatTelegramUserId: 42,
    ...overrides,
  };
}

describe("nextIdleAction", () => {
  it("pings when the turn has not moved since the check was scheduled", () => {
    expect(nextIdleAction(input())).toEqual({ action: "ping" });
  });

  it("hands off at the second stage", () => {
    expect(nextIdleAction(input({ stage: "handoff" }))).toEqual({ action: "handoff" });
  });

  it("skips when the turn advanced before the timer fired", () => {
    const decision = nextIdleAction(
      input({ turnStartedAt: TURN_STAMP + 5_000 })
    );

    expect(decision).toEqual({ action: "skip", reason: "turn already advanced" });
  });

  it("skips a handoff too when the turn advanced", () => {
    const decision = nextIdleAction(
      input({ stage: "handoff", turnStartedAt: TURN_STAMP + 5_000 })
    );

    expect(decision.action).toBe("skip");
  });

  it("skips when the room has no stamp at all", () => {
    const decision = nextIdleAction(input({ turnStartedAt: undefined }));

    expect(decision).toEqual({ action: "skip", reason: "turn already advanced" });
  });

  it("skips once the game has finished", () => {
    const decision = nextIdleAction(input({ gameState: "finished" }));

    expect(decision).toEqual({ action: "skip", reason: "game is not in play" });
  });

  it("skips while the game is still in the lobby", () => {
    expect(nextIdleAction(input({ gameState: "waiting" })).action).toBe("skip");
  });

  it("skips a seat that has already been handed to the AI", () => {
    const decision = nextIdleAction(input({ currentSeatIsBot: true }));

    expect(decision).toEqual({ action: "skip", reason: "seat is already a bot" });
  });

  it("does not hand off a seat that is already a bot", () => {
    const decision = nextIdleAction(input({ stage: "handoff", currentSeatIsBot: true }));

    expect(decision.action).toBe("skip");
  });

  it("skips the ping for a seat with no Telegram identity", () => {
    const decision = nextIdleAction(input({ currentSeatTelegramUserId: undefined }));

    expect(decision).toEqual({
      action: "skip",
      reason: "seat has no Telegram user to ping",
    });
  });

  it("still hands off a seat with no Telegram identity, so play never deadlocks", () => {
    const decision = nextIdleAction(
      input({ stage: "handoff", currentSeatTelegramUserId: undefined })
    );

    expect(decision).toEqual({ action: "handoff" });
  });
});
