import type { Doc } from "./_generated/dataModel";
import { getValidMoves } from "./gameLogic";
import type { Player } from "./gameLogic";

export type GameRoom = Doc<"rooms">;
export type GamePlayer = Doc<"players">;

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Convert a stored player document to the plain `Player` shape used by the
 * game engine (convex/gameLogic.ts).
 */
export function toPlayer(doc: GamePlayer): Player {
  return {
    playerId: doc.playerId,
    nickname: doc.nickname,
    color: doc.color,
    tokens: doc.tokens,
    isReady: doc.isReady,
    playerIndex: doc.playerIndex,
    isBot: doc.isBot ?? false,
  };
}

/**
 * Check that the caller's auth token matches the token stored on the
 * player document. Players created before authTokens existed have no
 * `authToken` and are treated as authorized for backward compatibility.
 * Bots are never authorized for external callers — they are driven only
 * by the internal botPlay scheduler, which does not go through this check.
 */
export function isAuthorized(player: GamePlayer, authToken?: string): boolean {
  if (player.isBot ?? false) return false;
  if (!player.authToken) return true;
  return player.authToken === authToken;
}

/**
 * Validate if a player can roll dice
 */
export function canRollDice(
  room: GameRoom,
  players: GamePlayer[],
  playerId: string
): ValidationResult {
  if (room.gameState !== "playing") {
    return { valid: false, error: "Game is not in progress" };
  }

  const currentPlayer = players[room.currentPlayerIndex];
  if (!currentPlayer || currentPlayer.playerId !== playerId) {
    return { valid: false, error: "Not your turn" };
  }

  if (room.hasRolledDice) {
    return { valid: false, error: "You have already rolled the dice" };
  }

  return { valid: true };
}

/**
 * Validate if a player can move a token
 */
export function canMoveToken(
  room: GameRoom,
  players: GamePlayer[],
  playerId: string,
  tokenId: number,
  diceValue: number
): ValidationResult {
  if (room.gameState !== "playing") {
    return { valid: false, error: "Game is not in progress" };
  }

  const currentPlayer = players[room.currentPlayerIndex];
  if (!currentPlayer || currentPlayer.playerId !== playerId) {
    return { valid: false, error: "Not your turn" };
  }

  if (!room.hasRolledDice) {
    return { valid: false, error: "You must roll the dice first" };
  }

  if (room.diceValue !== diceValue) {
    return { valid: false, error: "Invalid dice value" };
  }

  const token = currentPlayer.tokens.find((t) => t.id === tokenId);
  if (!token) {
    return { valid: false, error: "Invalid token" };
  }

  // Convert GamePlayer to Player for getValidMoves
  const player: Player = toPlayer(currentPlayer);
  const allPlayers: Player[] = players.map(toPlayer);

  const validMoves = getValidMoves(allPlayers, player, diceValue);
  if (!validMoves.includes(tokenId)) {
    return { valid: false, error: "Invalid move" };
  }

  return { valid: true };
}

/**
 * Validate if a player can end their turn
 */
export function canEndTurn(
  room: GameRoom,
  players: GamePlayer[],
  playerId: string
): ValidationResult {
  if (room.gameState !== "playing") {
    return { valid: false, error: "Game is not in progress" };
  }

  const currentPlayer = players[room.currentPlayerIndex];
  if (!currentPlayer || currentPlayer.playerId !== playerId) {
    return { valid: false, error: "Not your turn" };
  }

  if (!room.hasRolledDice) {
    return { valid: false, error: "You must roll the dice first" };
  }

  // If rolled 6, player must move if possible
  if (room.diceValue === 6 && room.hasRolledDice) {
    const player: Player = toPlayer(currentPlayer);
    const allPlayers: Player[] = players.map(toPlayer);

    const validMoves = getValidMoves(allPlayers, player, room.diceValue);
    if (validMoves.length > 0) {
      return { valid: false, error: "You must move a token when you roll 6" };
    }
  }

  return { valid: true };
}

/**
 * Validate if game can be started
 */
export function canStartGame(room: GameRoom, players: GamePlayer[]): ValidationResult {
  if (room.gameState !== "waiting") {
    return { valid: false, error: "Game has already started" };
  }

  if (players.length < 2) {
    return { valid: false, error: "Need at least 2 players to start" };
  }

  if (players.length > 4) {
    return { valid: false, error: "Maximum 4 players allowed" };
  }

  return { valid: true };
}

/**
 * Validate room join
 */
export function canJoinRoom(
  room: GameRoom,
  players: GamePlayer[]
): ValidationResult {
  if (room.gameState === "playing") {
    return { valid: false, error: "Game is already in progress" };
  }

  if (players.length >= room.maxPlayers) {
    return { valid: false, error: "Room is full" };
  }

  return { valid: true };
}
