/**
 * Telegram update routing.
 *
 * `handleUpdate` takes every side effect it needs as a dependency, so the
 * whole router can be exercised in tests with a stub Bot API and stub
 * mutations, with no network and no Convex runtime (see webhook.test.ts).
 */

import type { TelegramApi, MessageTarget } from "./api";
import {
  renderMatchText,
  renderMatchKeyboard,
  parseCallbackData,
  boardUrl,
  type BoardLink,
  type MatchView,
} from "./render";
import { generateRoomId } from "../roomId";

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
  /** Present for messages the bot posted. */
  message?: TelegramMessage;
  /** Present instead of `message` when the button is on an inline result. */
  inline_message_id?: string;
}

export interface TelegramInlineQuery {
  id: string;
  from: TelegramFrom;
  query: string;
}

export interface TelegramChosenInlineResult {
  result_id: string;
  from: TelegramFrom;
  inline_message_id?: string;
  query: string;
}

export interface TelegramUpdate {
  update_id?: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
  inline_query?: TelegramInlineQuery;
  chosen_inline_result?: TelegramChosenInlineResult;
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
  createInlineLobby(
    inlineMessageId: string,
    userId: number,
    nickname: string,
    preferredRoomId?: string
  ): Promise<{ roomId: string }>;
  /** Publicly reachable JPEG shown on the inline invite. */
  inviteImageUrl: string;
}

/** The id of the single inline result the bot offers. */
export const INLINE_NEW_GAME = "ludo_new_game";

const helpText = (botUsername: string) =>
  [
    "🎲 Ludo",
    "",
    "/ludo — start a game in this chat",
    "/play — play solo against bots",
    "",
    `Or type @${botUsername} in any chat to start a game without adding the bot to it.`,
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
  target: MessageTarget
): Promise<void> {
  const view = await deps.matchView(roomId);
  if (!view) return;

  await deps.api.editMessageBody({
    target,
    text: renderMatchText(view),
    replyMarkup: renderMatchKeyboard(view, deps.boardLink),
  });
}

/**
 * Offer a single "start a game" result.
 *
 * Two things here are load-bearing rather than decorative:
 *
 * 1. The result MUST carry a reply_markup. Telegram only reports
 *    inline_message_id in chosen_inline_result when the posted message has an
 *    inline keyboard, and without that id the message can never be edited -
 *    the game would be stranded on its placeholder caption forever.
 * 2. The roomId is chosen here rather than when the result is picked, so the
 *    button points at the right game from the first frame. The game is created
 *    under this id if it is still free; chosen_inline_result re-renders the
 *    keyboard either way, so a collision self-corrects.
 */
async function handleInlineQuery(
  deps: UpdateHandlerDeps,
  query: TelegramInlineQuery
): Promise<void> {
  const candidateRoomId = generateRoomId();
  const who = displayNameFrom(query.from);

  await deps.api.answerInlineQuery({
    inlineQueryId: query.id,
    // Per-user and uncached: the result creates a game keyed to whoever picks
    // it, so it must never be served from another user's cache.
    isPersonal: true,
    cacheTime: 0,
    results: [
      {
        type: "photo",
        id: `${INLINE_NEW_GAME}:${candidateRoomId}`,
        photo_url: deps.inviteImageUrl,
        thumbnail_url: deps.inviteImageUrl,
        photo_width: 640,
        photo_height: 360,
        title: "Start a game of Ludo",
        description: "Up to 4 players — no need to add the bot to the chat",
        caption: `🎲 ${who} started a game of Ludo\n\nSetting up…`,
        reply_markup: {
          inline_keyboard: [
            [{ text: "🎮 Open board", url: boardUrl(deps.boardLink, candidateRoomId) }],
          ],
        },
      },
    ],
  });
}

/**
 * The user picked the inline result and Telegram posted it on their behalf.
 * This is the only moment the bot learns the inline_message_id, and the only
 * handle it will ever have on that message.
 */
async function handleChosenInlineResult(
  deps: UpdateHandlerDeps,
  chosen: TelegramChosenInlineResult
): Promise<void> {
  const [kind, preferredRoomId] = chosen.result_id.split(":");
  if (kind !== INLINE_NEW_GAME) return;

  // Absent when the result carried no inline keyboard, or when inline feedback
  // is disabled in BotFather. Either way the message can never be edited, so
  // the game would be unreachable - better to create nothing.
  if (!chosen.inline_message_id) {
    console.error(
      "chosen_inline_result had no inline_message_id: the result needs a " +
        "reply_markup, and /setinlinefeedback must be enabled"
    );
    return;
  }

  const { roomId } = await deps.createInlineLobby(
    chosen.inline_message_id,
    chosen.from.id,
    displayNameFrom(chosen.from),
    preferredRoomId || undefined
  );

  await rerender(deps, roomId, {
    kind: "inline",
    inlineMessageId: chosen.inline_message_id,
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
      await deps.api.sendMessage({
        chatId: message.chat.id,
        text: helpText(deps.boardLink.botUsername),
      });
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

  // A callback carries either `message` (bot-posted) or `inline_message_id`
  // (posted through inline mode) - never both.
  const target: MessageTarget | null = query.message
    ? {
        kind: "chat",
        chatId: query.message.chat.id,
        messageId: query.message.message_id,
      }
    : query.inline_message_id
      ? { kind: "inline", inlineMessageId: query.inline_message_id }
      : null;

  if (!parsed || !target) {
    await answer();
    return;
  }

  const { action, roomId } = parsed;
  // callback_query.from is authenticated by Telegram, so this id can be
  // trusted as the acting user without any further proof.
  const userId = query.from.id;

  if (action === "new") {
    await answer();
    if (query.message) {
      await openLobby(deps, query.message.chat);
    }
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
    await rerender(deps, roomId, target);
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

  if (update.inline_query) {
    await handleInlineQuery(deps, update.inline_query);
    return;
  }

  if (update.chosen_inline_result) {
    await handleChosenInlineResult(deps, update.chosen_inline_result);
    return;
  }

  if (update.message) {
    await handleMessage(deps, update.message);
  }
}
