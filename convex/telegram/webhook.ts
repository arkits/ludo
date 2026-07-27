/**
 * Telegram update routing.
 *
 * `handleUpdate` takes every side effect it needs as a dependency, so the
 * whole router can be exercised in tests with a stub Bot API and stub
 * mutations, with no network and no Convex runtime (see webhook.test.ts).
 */

import type { TelegramApi } from "./api";
import {
  renderMatchText,
  renderMatchKeyboard,
  parseCallbackData,
  type BoardLink,
  type MatchView,
} from "./render";

export interface TelegramChat {
  id: number;
  type: string;
}

export interface TelegramFrom {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
}

export interface TelegramMessage {
  message_id: number;
  chat: TelegramChat;
  from?: TelegramFrom;
  text?: string;
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramFrom;
  data?: string;
  message?: TelegramMessage;
}

export interface TelegramUpdate {
  update_id?: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

export interface LobbyResult {
  ok: boolean;
  message: string;
}

export interface UpdateHandlerDeps {
  api: TelegramApi;
  boardLink: BoardLink;
  createLobby(
    chatId: number,
    chatType: "private" | "group" | "supergroup"
  ): Promise<{ ok: true; roomId: string } | { ok: false; message: string }>;
  setLobbyMessage(roomId: string, messageId: number): Promise<void>;
  joinLobby(roomId: string, userId: number, nickname: string): Promise<LobbyResult>;
  leaveLobby(roomId: string, userId: number): Promise<LobbyResult>;
  addBot(roomId: string, userId: number): Promise<LobbyResult>;
  startMatch(roomId: string, userId: number): Promise<LobbyResult>;
  matchView(roomId: string): Promise<MatchView | null>;
}

const HELP_TEXT = [
  "🎲 *Ludo*",
  "",
  "/ludo — start a game in this chat",
  "/play — play solo against bots",
].join("\n");

function displayNameFrom(from: TelegramFrom): string {
  const full = [from.first_name, from.last_name].filter(Boolean).join(" ").trim();
  return (full || from.username || `Player ${from.id}`).slice(0, 20);
}

/**
 * Commands arrive as `/ludo` in private chats but `/ludo@YourBot` in groups.
 * Returns the bare command name, lowercased, or null if the text is not one.
 */
export function parseCommand(text: string | undefined): string | null {
  if (!text || !text.startsWith("/")) return null;
  const firstToken = text.trim().split(/\s+/)[0];
  const withoutSlash = firstToken.slice(1);
  const withoutMention = withoutSlash.split("@")[0];
  return withoutMention.toLowerCase() || null;
}

function isGroup(chatType: string): chatType is "group" | "supergroup" {
  return chatType === "group" || chatType === "supergroup";
}

/** Post a brand new lobby message and record which message it is. */
async function openLobby(
  deps: UpdateHandlerDeps,
  chat: TelegramChat
): Promise<void> {
  if (!isGroup(chat.type)) {
    await deps.api.sendMessage({
      chatId: chat.id,
      text: "Ludo needs a group chat to play with friends. Tap below for a solo game against bots.",
      replyMarkup: [
        [
          {
            text: "🎮 Play solo",
            url: `https://t.me/${deps.boardLink.botUsername}/${deps.boardLink.appShortName}`,
          },
        ],
      ],
    });
    return;
  }

  const created = await deps.createLobby(chat.id, chat.type);
  if (!created.ok) {
    await deps.api.sendMessage({ chatId: chat.id, text: created.message });
    return;
  }

  const view = await deps.matchView(created.roomId);
  if (!view) return;

  const messageId = await deps.api.sendMessage({
    chatId: chat.id,
    text: renderMatchText(view),
    replyMarkup: renderMatchKeyboard(view, deps.boardLink),
  });

  if (messageId !== null) {
    await deps.setLobbyMessage(created.roomId, messageId);
  }
}

/** Re-render an existing lobby/status message in place. */
async function rerender(
  deps: UpdateHandlerDeps,
  roomId: string,
  chatId: number,
  messageId: number
): Promise<void> {
  const view = await deps.matchView(roomId);
  if (!view) return;

  await deps.api.editMessageText({
    chatId,
    messageId,
    text: renderMatchText(view),
    replyMarkup: renderMatchKeyboard(view, deps.boardLink),
  });
}

async function handleMessage(
  deps: UpdateHandlerDeps,
  message: TelegramMessage
): Promise<void> {
  const command = parseCommand(message.text);
  if (!command) return;

  switch (command) {
    case "ludo":
    case "new":
      await openLobby(deps, message.chat);
      return;

    case "play":
    case "solo":
      await deps.api.sendMessage({
        chatId: message.chat.id,
        text: "Play Ludo solo against bots 🎲",
        replyMarkup: [
          [
            {
              text: "🎮 Play solo",
              url: `https://t.me/${deps.boardLink.botUsername}/${deps.boardLink.appShortName}`,
            },
          ],
        ],
      });
      return;

    case "start":
    case "help":
      await deps.api.sendMessage({ chatId: message.chat.id, text: HELP_TEXT });
      return;

    default:
      return;
  }
}

async function handleCallbackQuery(
  deps: UpdateHandlerDeps,
  query: TelegramCallbackQuery
): Promise<void> {
  // Whatever happens below, the query must be answered or the user's button
  // spins forever in the client.
  const answer = async (text?: string) => {
    await deps.api.answerCallbackQuery({ callbackQueryId: query.id, text });
  };

  const parsed = query.data ? parseCallbackData(query.data) : null;
  if (!parsed || !query.message) {
    await answer();
    return;
  }

  const { action, roomId } = parsed;
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  // callback_query.from is authenticated by Telegram, so this id can be
  // trusted as the acting user without any further proof.
  const userId = query.from.id;

  if (action === "new") {
    await answer();
    await openLobby(deps, query.message.chat);
    return;
  }

  let result: LobbyResult;
  switch (action) {
    case "join":
      result = await deps.joinLobby(roomId, userId, displayNameFrom(query.from));
      break;
    case "leave":
      result = await deps.leaveLobby(roomId, userId);
      break;
    case "addbot":
      result = await deps.addBot(roomId, userId);
      break;
    case "start":
      // Host-only; enforced server-side in match.startMatch, not here.
      result = await deps.startMatch(roomId, userId);
      break;
    default:
      await answer();
      return;
  }

  await answer(result.message);

  if (result.ok) {
    await rerender(deps, roomId, chatId, messageId);
  }
}

export async function handleUpdate(
  update: TelegramUpdate,
  deps: UpdateHandlerDeps
): Promise<void> {
  if (update.callback_query) {
    await handleCallbackQuery(deps, update.callback_query);
    return;
  }

  if (update.message) {
    await handleMessage(deps, update.message);
  }
}
