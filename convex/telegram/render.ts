/**
 * Pure rendering of the single chat message that represents a Telegram match.
 *
 * That one message is the lobby before the game starts and the live status
 * board afterwards - it is edited in place, never replaced. Because edits do
 * not generate notifications, an actively played game produces no chat noise.
 *
 * Everything here is pure so the exact text and keyboard for any game state
 * can be asserted directly (see render.test.ts).
 */

import type { InlineKeyboard, MessageEntity } from "./api";

export type PlayerColor = "red" | "blue" | "green" | "yellow";

export interface SeatView {
  nickname: string;
  color: PlayerColor;
  isBot: boolean;
  /** Tokens that have reached home, 0-4. */
  finishedTokens: number;
}

export interface MatchView {
  roomId: string;
  gameState: "waiting" | "playing" | "finished";
  maxPlayers: number;
  seats: SeatView[];
  currentPlayerIndex: number;
  winnerNickname: string | null;
}

export interface BoardLink {
  botUsername: string;
  appShortName: string;
}

const COLOR_DOT: Record<PlayerColor, string> = {
  red: "🔴",
  blue: "🔵",
  green: "🟢",
  yellow: "🟡",
};

/** Fewest seats a Ludo match can start with. */
export const MIN_PLAYERS = 2;

/** Seats a Telegram match can hold. */
export const MAX_PLAYERS = 4;

export function boardUrl(link: BoardLink, roomId: string): string {
  return `https://t.me/${link.botUsername}/${link.appShortName}?startapp=${roomId}`;
}

function seatLine(seat: SeatView, marker: string, showProgress: boolean): string {
  const bot = seat.isBot ? " 🤖" : "";
  const progress = showProgress ? ` — ${seat.finishedTokens}/4 home` : "";
  return `${COLOR_DOT[seat.color]} ${seat.nickname}${bot}${progress}${marker}`;
}

export function renderMatchText(match: MatchView): string {
  const lines: string[] = [];

  if (match.gameState === "waiting") {
    lines.push(`🎲 Ludo — ${match.seats.length}/${match.maxPlayers} players`);
    lines.push("");
    if (match.seats.length === 0) {
      lines.push("No one has joined yet.");
    } else {
      for (const seat of match.seats) {
        lines.push(seatLine(seat, "", false));
      }
    }
    lines.push("");
    lines.push(
      match.seats.length < MIN_PLAYERS
        ? `Tap Join — ${MIN_PLAYERS} players needed to start.`
        : "Tap Join to take a seat, or Start to begin."
    );
    return lines.join("\n");
  }

  if (match.gameState === "finished") {
    // A finished game with no winner was ended or abandoned rather than won,
    // so it must not claim "Nobody wins!" as though it played to a result.
    lines.push(
      match.winnerNickname ? `🏆 ${match.winnerNickname} wins!` : "🎲 Game over"
    );
    lines.push("");
    for (const seat of match.seats) {
      lines.push(seatLine(seat, "", true));
    }
    if (!match.winnerNickname) {
      lines.push("");
      lines.push("Ended before anyone got home.");
    }
    return lines.join("\n");
  }

  lines.push("🎲 Ludo — in play");
  lines.push("");
  match.seats.forEach((seat, index) => {
    lines.push(seatLine(seat, index === match.currentPlayerIndex ? "  ← turn" : "", true));
  });
  return lines.join("\n");
}

export function renderMatchKeyboard(match: MatchView, link: BoardLink): InlineKeyboard {
  const open = { text: "🎮 Open board", url: boardUrl(link, match.roomId) };

  if (match.gameState === "waiting") {
    const rows: InlineKeyboard = [
      [
        { text: "Join", callback_data: `join:${match.roomId}` },
        { text: "Leave", callback_data: `leave:${match.roomId}` },
      ],
    ];

    const secondRow = [];
    if (match.seats.length < match.maxPlayers) {
      secondRow.push({ text: "+ Bot", callback_data: `addbot:${match.roomId}` });
    }
    if (match.seats.length >= MIN_PLAYERS) {
      secondRow.push({ text: "▶️ Start", callback_data: `start:${match.roomId}` });
    }
    if (secondRow.length > 0) {
      rows.push(secondRow);
    }

    rows.push([open, { text: "✕ Cancel", callback_data: `end:${match.roomId}` }]);
    return rows;
  }

  if (match.gameState === "finished") {
    return [[{ text: "🎲 New game", callback_data: "new:" }]];
  }

  // A game in play needs a way out: without this an abandoned match sits in
  // the chat forever with no control other than waiting for someone to win.
  return [[open, { text: "🏳 End game", callback_data: `end:${match.roomId}` }]];
}

/**
 * The turn ping. Not every Telegram account has a username, so the mention is
 * a `text_mention` entity carrying the numeric user id - that works for any
 * account and needs no @handle.
 */
export function renderTurnPing(
  nickname: string,
  telegramUserId: number
): { text: string; entities: MessageEntity[] } {
  return {
    text: `${nickname}, it's your turn 🎲`,
    entities: [
      {
        type: "text_mention",
        offset: 0,
        length: nickname.length,
        user: { id: telegramUserId, first_name: nickname },
      },
    ],
  };
}

export function parseCallbackData(data: string): { action: string; roomId: string } | null {
  const separator = data.indexOf(":");
  if (separator === -1) {
    return data ? { action: data, roomId: "" } : null;
  }
  const action = data.slice(0, separator);
  if (!action) return null;
  return { action, roomId: data.slice(separator + 1) };
}
