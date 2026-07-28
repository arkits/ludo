/**
 * Minimal Telegram Bot API client - only the handful of methods this feature
 * needs. Defined as an interface so the update router can be driven by a stub
 * in tests without any network access (see webhook.test.ts).
 */

export interface InlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export type InlineKeyboard = InlineKeyboardButton[][];

export interface MessageEntity {
  type: "text_mention";
  offset: number;
  length: number;
  user: { id: number; first_name: string };
}

export interface SendMessageArgs {
  chatId: number;
  text: string;
  replyMarkup?: InlineKeyboard;
  entities?: MessageEntity[];
}

/**
 * Which message to edit.
 *
 * A bot-posted message is addressed by chat + message id and carries plain
 * text. A message posted through inline mode only ever has an inline id - the
 * bot never learns which chat it landed in - and is always a photo, so its
 * body lives in a caption. That difference decides which Bot API method
 * applies, which is why editMessageBody dispatches on `kind`.
 */
export type MessageTarget =
  | { kind: "chat"; chatId: number; messageId: number }
  | { kind: "inline"; inlineMessageId: string };

/**
 * Renders an image above the message without the text having to contain a
 * URL. This is how a plain text message gets artwork - the alternative, a
 * photo message, would put the body in a caption and render as a thumbnail
 * grid in the inline picker with the title and description hidden.
 */
export interface LinkPreviewOptions {
  url: string;
  prefer_large_media?: boolean;
  show_above_text?: boolean;
}

export interface EditMessageTextArgs {
  target: MessageTarget;
  text: string;
  replyMarkup?: InlineKeyboard;
  /** Must be resupplied on every edit or the preview is dropped. */
  linkPreview?: LinkPreviewOptions;
}

/**
 * Article result. Renders in the picker as a list row with title, description
 * and thumbnail - the layout photo results do not get.
 */
export interface InlineQueryResultArticle {
  type: "article";
  id: string;
  title: string;
  description?: string;
  thumbnail_url?: string;
  thumbnail_width?: number;
  thumbnail_height?: number;
  input_message_content: {
    message_text: string;
    link_preview_options?: LinkPreviewOptions;
  };
  /**
   * Required, even as a placeholder: without an inline keyboard Telegram
   * omits inline_message_id from chosen_inline_result, leaving the posted
   * message impossible to edit afterwards.
   */
  reply_markup?: { inline_keyboard: InlineKeyboard };
}

export interface AnswerInlineQueryArgs {
  inlineQueryId: string;
  results: InlineQueryResultArticle[];
  /** Results are per-user and must never be cached across users. */
  isPersonal?: boolean;
  cacheTime?: number;
}

export interface AnswerCallbackQueryArgs {
  callbackQueryId: string;
  text?: string;
  showAlert?: boolean;
}

export interface TelegramApi {
  /** Returns the sent message id, or null if the send failed. */
  sendMessage(args: SendMessageArgs): Promise<number | null>;
  /** Resolves whether the edit landed. A no-op edit counts as success. */
  editMessageText(args: EditMessageTextArgs): Promise<boolean>;
  answerCallbackQuery(args: AnswerCallbackQueryArgs): Promise<void>;
  answerInlineQuery(args: AnswerInlineQueryArgs): Promise<void>;
}

/**
 * Telegram returns 400 with this description when an edit would leave the
 * message byte-identical. That is a no-op, not a failure, and treating it as
 * an error would make the status board look broken every time two consecutive
 * renders matched.
 */
const NOT_MODIFIED = "message is not modified";

interface TelegramResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
}

export function createTelegramApi(botToken: string): TelegramApi {
  const endpoint = `https://api.telegram.org/bot${botToken}`;

  async function call<T>(method: string, body: unknown): Promise<TelegramResponse<T>> {
    try {
      const response = await fetch(`${endpoint}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return (await response.json()) as TelegramResponse<T>;
    } catch (error) {
      // Never let a Telegram outage take down a game mutation. The caller
      // decides what a failed send means; for the status board it means the
      // next turn will refresh it anyway.
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, description: `Network error: ${message}` };
    }
  }

  return {
    async sendMessage({ chatId, text, replyMarkup, entities }) {
      const result = await call<{ message_id: number }>("sendMessage", {
        chat_id: chatId,
        text,
        entities,
        reply_markup: replyMarkup ? { inline_keyboard: replyMarkup } : undefined,
      });
      if (!result.ok || !result.result) {
        console.error("telegram sendMessage failed:", result.description);
        return null;
      }
      return result.result.message_id;
    },

    async editMessageText({ target, text, replyMarkup, linkPreview }) {
      const address =
        target.kind === "chat"
          ? { chat_id: target.chatId, message_id: target.messageId }
          : { inline_message_id: target.inlineMessageId };

      const result = await call("editMessageText", {
        ...address,
        text,
        link_preview_options: linkPreview,
        reply_markup: replyMarkup ? { inline_keyboard: replyMarkup } : undefined,
      });
      if (!result.ok) {
        if (result.description?.includes(NOT_MODIFIED)) {
          return true;
        }
        console.error("telegram editMessageText failed:", result.description);
        return false;
      }
      return true;
    },

    async answerCallbackQuery({ callbackQueryId, text, showAlert }) {
      // Always fire-and-check: if this never runs, the user's button spins
      // forever in the client.
      const result = await call("answerCallbackQuery", {
        callback_query_id: callbackQueryId,
        text,
        show_alert: showAlert,
      });
      if (!result.ok) {
        console.error("telegram answerCallbackQuery failed:", result.description);
      }
    },

    async answerInlineQuery({ inlineQueryId, results, isPersonal, cacheTime }) {
      const result = await call("answerInlineQuery", {
        inline_query_id: inlineQueryId,
        results,
        is_personal: isPersonal,
        cache_time: cacheTime,
      });
      if (!result.ok) {
        console.error("telegram answerInlineQuery failed:", result.description);
      }
    },
  };
}
