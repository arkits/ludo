import { describe, it, expect } from "vitest";
import {
  renderMatchText,
  renderMatchKeyboard,
  renderTurnPing,
  parseCallbackData,
  boardUrl,
  type MatchView,
  type SeatView,
} from "./render";

const LINK = { botUsername: "LudoTestBot", appShortName: "play" };

function seat(overrides: Partial<SeatView> = {}): SeatView {
  return { nickname: "Ada", color: "red", isBot: false, finishedTokens: 0, ...overrides };
}

function view(overrides: Partial<MatchView> = {}): MatchView {
  return {
    roomId: "ABC123",
    gameState: "waiting",
    maxPlayers: 4,
    seats: [],
    currentPlayerIndex: 0,
    winnerNickname: null,
    ...overrides,
  };
}

describe("renderMatchText — lobby", () => {
  it("says nobody has joined an empty lobby", () => {
    expect(renderMatchText(view())).toContain("No one has joined yet.");
  });

  it("counts seats against the maximum", () => {
    const text = renderMatchText(view({ seats: [seat(), seat({ color: "blue" })] }));

    expect(text).toContain("2/4 players");
  });

  it("prompts for more players below the minimum", () => {
    expect(renderMatchText(view({ seats: [seat()] }))).toContain("2 players needed");
  });

  it("offers Start once enough players are seated", () => {
    const text = renderMatchText(
      view({ seats: [seat(), seat({ nickname: "Sam", color: "blue" })] })
    );

    expect(text).toContain("Start to begin");
  });

  it("marks bots", () => {
    const text = renderMatchText(
      view({ seats: [seat({ nickname: "Bot 1", isBot: true })] })
    );

    expect(text).toContain("🤖");
  });

  it("does not show progress in the lobby, where no one has moved", () => {
    expect(renderMatchText(view({ seats: [seat()] }))).not.toContain("home");
  });
});

describe("renderMatchText — in play", () => {
  const playing = view({
    gameState: "playing",
    seats: [
      seat({ nickname: "Ada", finishedTokens: 2 }),
      seat({ nickname: "Sam", color: "blue", finishedTokens: 1 }),
    ],
    currentPlayerIndex: 1,
  });

  it("marks whose turn it is, and only theirs", () => {
    const lines = renderMatchText(playing).split("\n");
    const marked = lines.filter((l) => l.includes("← turn"));

    expect(marked).toHaveLength(1);
    expect(marked[0]).toContain("Sam");
  });

  it("shows each player's progress", () => {
    const text = renderMatchText(playing);

    expect(text).toContain("Ada — 2/4 home");
    expect(text).toContain("Sam — 1/4 home");
  });
});

describe("renderMatchText — finished", () => {
  it("announces the winner", () => {
    const text = renderMatchText(
      view({
        gameState: "finished",
        seats: [seat({ finishedTokens: 4 })],
        winnerNickname: "Ada",
      })
    );

    expect(text).toContain("🏆 Ada wins!");
  });

  it("does not mark a turn once the game is over", () => {
    const text = renderMatchText(
      view({ gameState: "finished", seats: [seat()], winnerNickname: "Ada" })
    );

    expect(text).not.toContain("← turn");
  });

  // A game that was ended or abandoned has no winner, and must not claim
  // "Nobody wins!" as though it played to a result.
  it("reports an ended game without inventing a result", () => {
    const text = renderMatchText(
      view({ gameState: "finished", seats: [seat()], winnerNickname: null })
    );

    expect(text).toContain("Game over");
    expect(text).not.toContain("wins!");
    expect(text).toContain("Ended before anyone got home.");
  });
});

describe("renderMatchKeyboard", () => {
  it("always puts the board link last in the lobby", () => {
    const rows = renderMatchKeyboard(view({ seats: [seat()] }), LINK);
    const last = rows[rows.length - 1];

    expect(last[0].url).toBe("https://t.me/LudoTestBot/play?startapp=ABC123");
  });

  it("hides Start until the minimum is met", () => {
    const rows = renderMatchKeyboard(view({ seats: [seat()] }), LINK);
    const labels = rows.flat().map((b) => b.text);

    expect(labels).not.toContain("▶️ Start");
  });

  it("shows Start once two players are seated", () => {
    const rows = renderMatchKeyboard(
      view({ seats: [seat(), seat({ color: "blue" })] }),
      LINK
    );

    expect(rows.flat().map((b) => b.text)).toContain("▶️ Start");
  });

  it("hides + Bot when the lobby is full", () => {
    const seats = [
      seat(),
      seat({ color: "blue" }),
      seat({ color: "green" }),
      seat({ color: "yellow" }),
    ];
    const rows = renderMatchKeyboard(view({ seats }), LINK);

    expect(rows.flat().map((b) => b.text)).not.toContain("+ Bot");
  });

  it("offers the board link once play starts", () => {
    const rows = renderMatchKeyboard(view({ gameState: "playing" }), LINK);

    expect(rows.flat().some((b) => b.url?.includes("startapp=ABC123"))).toBe(true);
  });

  // Without this an abandoned match sits in the chat forever, with no control
  // other than waiting for someone to win.
  it("always offers a way out of a game in play", () => {
    const rows = renderMatchKeyboard(view({ gameState: "playing" }), LINK);

    expect(rows.flat().map((b) => b.callback_data)).toContain("end:ABC123");
  });

  it("offers a way to cancel a lobby that never started", () => {
    const rows = renderMatchKeyboard(view({ seats: [seat()] }), LINK);

    expect(rows.flat().map((b) => b.callback_data)).toContain("end:ABC123");
  });

  it("drops the end control once the game is over", () => {
    const rows = renderMatchKeyboard(view({ gameState: "finished" }), LINK);

    expect(rows.flat().map((b) => b.callback_data)).not.toContain("end:ABC123");
  });

  it("offers a new game when finished", () => {
    const rows = renderMatchKeyboard(view({ gameState: "finished" }), LINK);

    expect(rows[0][0].callback_data).toBe("new:");
  });
});

describe("renderTurnPing", () => {
  it("mentions the player by user id rather than @handle", () => {
    const ping = renderTurnPing("Ada", 42);

    expect(ping.text).toBe("Ada, it's your turn 🎲");
    expect(ping.entities[0]).toEqual({
      type: "text_mention",
      offset: 0,
      length: 3,
      user: { id: 42, first_name: "Ada" },
    });
  });

  it("spans exactly the name, so the mention highlights correctly", () => {
    const ping = renderTurnPing("Ada Lovelace", 42);
    const entity = ping.entities[0];

    expect(ping.text.slice(entity.offset, entity.offset + entity.length)).toBe(
      "Ada Lovelace"
    );
  });
});

describe("parseCallbackData", () => {
  it("splits action from room id", () => {
    expect(parseCallbackData("join:ABC123")).toEqual({
      action: "join",
      roomId: "ABC123",
    });
  });

  it("handles an action with an empty room id", () => {
    expect(parseCallbackData("new:")).toEqual({ action: "new", roomId: "" });
  });

  it("handles an action with no separator", () => {
    expect(parseCallbackData("new")).toEqual({ action: "new", roomId: "" });
  });

  it("rejects empty or malformed data", () => {
    expect(parseCallbackData("")).toBeNull();
    expect(parseCallbackData(":ABC123")).toBeNull();
  });
});

describe("boardUrl", () => {
  it("builds a direct Mini App link carrying the match id", () => {
    expect(boardUrl(LINK, "XYZ789")).toBe(
      "https://t.me/LudoTestBot/play?startapp=XYZ789"
    );
  });
});
