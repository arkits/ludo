import { describe, it, expect, beforeEach, vi } from "vitest";
import { handleUpdate, parseCommand, type UpdateHandlerDeps } from "./webhook";
import type { MatchView } from "./render";

const BOARD_LINK = { botUsername: "LudoTestBot", appShortName: "play" };

function waitingView(overrides: Partial<MatchView> = {}): MatchView {
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

function seat(nickname: string, color: MatchView["seats"][number]["color"]) {
  return { nickname, color, isBot: false, finishedTokens: 0 };
}

function makeDeps(overrides: Partial<UpdateHandlerDeps> = {}) {
  const sent: Array<{ chatId: number; text: string }> = [];
  const edited: Array<{ chatId: number; messageId: number; text: string }> = [];
  const answered: Array<{ callbackQueryId: string; text?: string }> = [];

  const deps: UpdateHandlerDeps = {
    api: {
      sendMessage: vi.fn(async (args) => {
        sent.push({ chatId: args.chatId, text: args.text });
        return 555;
      }),
      editMessageText: vi.fn(async (args) => {
        edited.push({ chatId: args.chatId, messageId: args.messageId, text: args.text });
        return true;
      }),
      answerCallbackQuery: vi.fn(async (args) => {
        answered.push({ callbackQueryId: args.callbackQueryId, text: args.text });
      }),
    },
    boardLink: BOARD_LINK,
    createLobby: vi.fn(async () => ({ ok: true as const, roomId: "ABC123" })),
    setLobbyMessage: vi.fn(async () => {}),
    joinLobby: vi.fn(async () => ({ ok: true, message: "You're in 🎲" })),
    leaveLobby: vi.fn(async () => ({ ok: true, message: "You've left the game." })),
    addBot: vi.fn(async () => ({ ok: true, message: "Bot added 🤖" })),
    startMatch: vi.fn(async () => ({ ok: true, message: "Game on 🎲" })),
    matchView: vi.fn(async () => waitingView()),
    ...overrides,
  };

  return { deps, sent, edited, answered };
}

function groupMessage(text: string, chatId = -100) {
  return {
    message: {
      message_id: 1,
      chat: { id: chatId, type: "supergroup" },
      from: { id: 7, first_name: "Ada" },
      text,
    },
  };
}

function callback(data: string, userId = 7) {
  return {
    callback_query: {
      id: "cbq-1",
      from: { id: userId, first_name: "Ada", last_name: "Lovelace" },
      data,
      message: {
        message_id: 555,
        chat: { id: -100, type: "supergroup" },
      },
    },
  };
}

describe("parseCommand", () => {
  it("parses a bare command", () => {
    expect(parseCommand("/ludo")).toBe("ludo");
  });

  it("strips the @botname suffix groups add", () => {
    expect(parseCommand("/ludo@LudoTestBot")).toBe("ludo");
  });

  it("ignores arguments after the command", () => {
    expect(parseCommand("/ludo now please")).toBe("ludo");
  });

  it("lowercases", () => {
    expect(parseCommand("/LUDO")).toBe("ludo");
  });

  it("returns null for ordinary chat text", () => {
    expect(parseCommand("hello")).toBeNull();
    expect(parseCommand(undefined)).toBeNull();
  });
});

describe("handleUpdate — /ludo in a group", () => {
  it("creates a lobby and posts the join message", async () => {
    const { deps, sent } = makeDeps();

    await handleUpdate(groupMessage("/ludo"), deps);

    expect(deps.createLobby).toHaveBeenCalledWith(-100, "supergroup");
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toContain("Ludo");
    expect(sent[0].text).toContain("0/4");
  });

  it("records which message is the lobby, so later edits find it", async () => {
    const { deps } = makeDeps();

    await handleUpdate(groupMessage("/ludo"), deps);

    expect(deps.setLobbyMessage).toHaveBeenCalledWith("ABC123", 555);
  });

  it("reports the reason when a chat already has a live game", async () => {
    const { deps, sent } = makeDeps({
      createLobby: vi.fn(async () => ({
        ok: false as const,
        message: "This chat already has a Ludo game in progress.",
      })),
    });

    await handleUpdate(groupMessage("/ludo"), deps);

    expect(sent[0].text).toBe("This chat already has a Ludo game in progress.");
    expect(deps.setLobbyMessage).not.toHaveBeenCalled();
  });

  it("does not record a lobby message when the send failed", async () => {
    const { deps } = makeDeps();
    deps.api.sendMessage = vi.fn(async () => null);

    await handleUpdate(groupMessage("/ludo"), deps);

    expect(deps.setLobbyMessage).not.toHaveBeenCalled();
  });

  it("offers a solo game instead when used in a private chat", async () => {
    const { deps, sent } = makeDeps();

    await handleUpdate(
      {
        message: {
          message_id: 1,
          chat: { id: 7, type: "private" },
          from: { id: 7, first_name: "Ada" },
          text: "/ludo",
        },
      },
      deps
    );

    expect(deps.createLobby).not.toHaveBeenCalled();
    expect(sent[0].text).toContain("solo");
  });

  it("ignores non-command chatter", async () => {
    const { deps, sent } = makeDeps();

    await handleUpdate(groupMessage("just talking about ludo"), deps);

    expect(sent).toHaveLength(0);
    expect(deps.createLobby).not.toHaveBeenCalled();
  });
});

describe("handleUpdate — lobby buttons", () => {
  let harness: ReturnType<typeof makeDeps>;

  beforeEach(() => {
    harness = makeDeps();
  });

  it("seats the user who tapped Join, using their Telegram display name", async () => {
    await handleUpdate(callback("join:ABC123"), harness.deps);

    expect(harness.deps.joinLobby).toHaveBeenCalledWith("ABC123", 7, "Ada Lovelace");
  });

  it("answers the callback query so the button stops spinning", async () => {
    await handleUpdate(callback("join:ABC123"), harness.deps);

    expect(harness.answered).toEqual([{ callbackQueryId: "cbq-1", text: "You're in 🎲" }]);
  });

  it("re-renders the lobby message in place after a successful join", async () => {
    harness.deps.matchView = vi.fn(async () =>
      waitingView({ seats: [seat("Ada", "red")] })
    );

    await handleUpdate(callback("join:ABC123"), harness.deps);

    expect(harness.edited).toHaveLength(1);
    expect(harness.edited[0].messageId).toBe(555);
    expect(harness.edited[0].text).toContain("Ada");
    expect(harness.edited[0].text).toContain("1/4");
  });

  it("does not re-render when the action was rejected", async () => {
    harness.deps.joinLobby = vi.fn(async () => ({
      ok: false,
      message: "You're already in this game.",
    }));

    await handleUpdate(callback("join:ABC123"), harness.deps);

    expect(harness.answered[0].text).toBe("You're already in this game.");
    expect(harness.edited).toHaveLength(0);
  });

  it("routes Leave, + Bot and Start to their own handlers", async () => {
    await handleUpdate(callback("leave:ABC123"), harness.deps);
    await handleUpdate(callback("addbot:ABC123"), harness.deps);
    await handleUpdate(callback("start:ABC123"), harness.deps);

    expect(harness.deps.leaveLobby).toHaveBeenCalledWith("ABC123", 7);
    expect(harness.deps.addBot).toHaveBeenCalledWith("ABC123", 7);
    expect(harness.deps.startMatch).toHaveBeenCalledWith("ABC123", 7);
  });

  it("passes the tapping user's id through, so host checks see the real actor", async () => {
    await handleUpdate(callback("start:ABC123", 999), harness.deps);

    expect(harness.deps.startMatch).toHaveBeenCalledWith("ABC123", 999);
  });

  it("surfaces a rejected Start as a toast without changing the message", async () => {
    harness.deps.startMatch = vi.fn(async () => ({
      ok: false,
      message: "Only Ada can start this game.",
    }));

    await handleUpdate(callback("start:ABC123", 999), harness.deps);

    expect(harness.answered[0].text).toBe("Only Ada can start this game.");
    expect(harness.edited).toHaveLength(0);
  });

  it("opens a fresh lobby for the New game button", async () => {
    await handleUpdate(callback("new:"), harness.deps);

    expect(harness.deps.createLobby).toHaveBeenCalledWith(-100, "supergroup");
    expect(harness.sent).toHaveLength(1);
  });

  it("still answers an unrecognised callback", async () => {
    await handleUpdate(callback("bogus:ABC123"), harness.deps);

    expect(harness.answered).toHaveLength(1);
    expect(harness.edited).toHaveLength(0);
  });

  it("answers a callback carrying no data at all", async () => {
    await handleUpdate(
      {
        callback_query: {
          id: "cbq-2",
          from: { id: 7, first_name: "Ada" },
          message: { message_id: 555, chat: { id: -100, type: "supergroup" } },
        },
      },
      harness.deps
    );

    expect(harness.answered).toEqual([{ callbackQueryId: "cbq-2", text: undefined }]);
  });
});

describe("handleUpdate — empty updates", () => {
  it("does nothing for an update with neither message nor callback", async () => {
    const { deps, sent, edited, answered } = makeDeps();

    await handleUpdate({ update_id: 1 }, deps);

    expect(sent).toHaveLength(0);
    expect(edited).toHaveLength(0);
    expect(answered).toHaveLength(0);
  });
});
