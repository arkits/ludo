import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  handleUpdate,
  parseCommand,
  INLINE_NEW_GAME,
  type UpdateHandlerDeps,
} from "./webhook";
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

type EditRecord = {
  target: NonNullable<Parameters<UpdateHandlerDeps['api']['editMessageText']>[0]>['target'];
  text: string;
};

function makeDeps(overrides: Partial<UpdateHandlerDeps> = {}) {
  const sent: Array<{ chatId: number; text: string }> = [];
  const edited: EditRecord[] = [];
  const answered: Array<{ callbackQueryId: string; text?: string }> = [];
  const inlineAnswers: Array<{ inlineQueryId: string; ids: string[]; isPersonal?: boolean; cacheTime?: number }> = [];

  const deps: UpdateHandlerDeps = {
    api: {
      sendMessage: vi.fn(async (args) => {
        sent.push({ chatId: args.chatId, text: args.text });
        return 555;
      }),
      editMessageText: vi.fn(async (args) => {
        edited.push({ target: args.target, text: args.text });
        return true;
      }),
      answerCallbackQuery: vi.fn(async (args) => {
        answered.push({ callbackQueryId: args.callbackQueryId, text: args.text });
      }),
      answerInlineQuery: vi.fn(async (args) => {
        inlineAnswers.push({
          inlineQueryId: args.inlineQueryId,
          ids: args.results.map((r: { id: string }) => r.id),
          isPersonal: args.isPersonal,
          cacheTime: args.cacheTime,
        });
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
    createInlineLobby: vi.fn(async () => ({ roomId: "INL456" })),
    ...overrides,
  };

  return { deps, sent, edited, answered, inlineAnswers };
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
    expect(harness.edited[0].target).toEqual({
      kind: "chat",
      chatId: -100,
      messageId: 555,
    });
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

describe("handleUpdate — inline mode", () => {
  const inlineQuery = {
    inline_query: { id: "iq-1", from: { id: 7, first_name: "Ada" }, query: "" },
  };

  it("offers a single start-a-game result", async () => {
    const { deps, inlineAnswers } = makeDeps();

    await handleUpdate(inlineQuery, deps);

    expect(inlineAnswers).toHaveLength(1);
    expect(inlineAnswers[0].inlineQueryId).toBe("iq-1");
    expect(inlineAnswers[0].ids).toEqual([INLINE_NEW_GAME]);
  });

  it("never lets a result be cached or shared between users", async () => {
    const { deps, inlineAnswers } = makeDeps();

    await handleUpdate(inlineQuery, deps);

    expect(inlineAnswers[0].isPersonal).toBe(true);
    expect(inlineAnswers[0].cacheTime).toBe(0);
  });

  it("creates a game seated to whoever picked the result", async () => {
    const { deps } = makeDeps();

    await handleUpdate(
      {
        chosen_inline_result: {
          result_id: INLINE_NEW_GAME,
          from: { id: 7, first_name: "Ada", last_name: "Lovelace" },
          inline_message_id: "inline-abc",
          query: "",
        },
      },
      deps
    );

    expect(deps.createInlineLobby).toHaveBeenCalledWith("inline-abc", 7, "Ada Lovelace");
  });

  it("replaces the placeholder message with the real lobby", async () => {
    const { deps, edited } = makeDeps();

    await handleUpdate(
      {
        chosen_inline_result: {
          result_id: INLINE_NEW_GAME,
          from: { id: 7, first_name: "Ada" },
          inline_message_id: "inline-abc",
          query: "",
        },
      },
      deps
    );

    expect(edited).toHaveLength(1);
    expect(edited[0].target).toEqual({ kind: "inline", inlineMessageId: "inline-abc" });
    expect(edited[0].text).toContain("Ludo");
  });

  // Without /setinlinefeedback the id never arrives and the message could
  // never be edited, leaving an unreachable game.
  it("creates nothing when inline feedback is disabled", async () => {
    const { deps, edited } = makeDeps();

    await handleUpdate(
      {
        chosen_inline_result: {
          result_id: INLINE_NEW_GAME,
          from: { id: 7, first_name: "Ada" },
          query: "",
        },
      },
      deps
    );

    expect(deps.createInlineLobby).not.toHaveBeenCalled();
    expect(edited).toHaveLength(0);
  });

  it("ignores a chosen result it did not offer", async () => {
    const { deps } = makeDeps();

    await handleUpdate(
      {
        chosen_inline_result: {
          result_id: "something_else",
          from: { id: 7, first_name: "Ada" },
          inline_message_id: "inline-abc",
          query: "",
        },
      },
      deps
    );

    expect(deps.createInlineLobby).not.toHaveBeenCalled();
  });

  // A callback from an inline message has inline_message_id and no `message`.
  it("handles a Join tapped on an inline message", async () => {
    const { deps, edited, answered } = makeDeps();

    await handleUpdate(
      {
        callback_query: {
          id: "cbq-9",
          from: { id: 99, first_name: "Sam" },
          data: "join:INL456",
          inline_message_id: "inline-abc",
        },
      },
      deps
    );

    expect(deps.joinLobby).toHaveBeenCalledWith("INL456", 99, "Sam");
    expect(answered[0].text).toBe("You're in 🎲");
    expect(edited[0].target).toEqual({ kind: "inline", inlineMessageId: "inline-abc" });
  });

  it("answers an inline callback carrying neither message nor inline id", async () => {
    const { deps, answered, edited } = makeDeps();

    await handleUpdate(
      {
        callback_query: { id: "cbq-10", from: { id: 7, first_name: "Ada" }, data: "join:X" },
      },
      deps
    );

    expect(answered).toHaveLength(1);
    expect(edited).toHaveLength(0);
    expect(deps.joinLobby).not.toHaveBeenCalled();
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
