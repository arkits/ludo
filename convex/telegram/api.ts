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

export interface EditMessageTextArgs {
  chatId: number;
  messageId: number;
  text: string;
  replyMarkup?: InlineKeyboard;
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

    async editMessageText({ chatId, messageId, text, replyMarkup }) {
      const result = await call("editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text,
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
  };
}
