import type { Player } from '../types/game';
import { getValidMoves as serverGetValidMoves } from '../../convex/gameLogic';
import type { Player as ServerPlayer } from '../../convex/gameLogic';

/**
 * This module used to be a drifted duplicate of the server's rule engine
 * (convex/gameLogic.ts) - it ignored opponent blocks entirely, which meant
 * the UI would highlight moves the server would reject, and a player who
 * rolled a 6 whose only moves were block-obstructed could get soft-locked
 * (the client's canEndTurn disabled the End Turn button because it thought
 * a move existed).
 *
 * convex/gameLogic.ts has no server-only imports, so it's safe to import
 * directly from the client. This file is now a thin adapter: it maps the
 * client `Player` shape (which uses `id`) to the server `Player` shape
 * (which uses `playerId`) and delegates to the real engine, passing ALL
 * players so block logic applies exactly like it does on the server.
 */

function toServerPlayer(player: Player): ServerPlayer {
  return {
    playerId: player.id,
    nickname: player.nickname,
    color: player.color,
    tokens: player.tokens,
    isReady: player.isReady,
    playerIndex: 0,
    isBot: player.isBot,
  };
}

/**
 * Get the list of valid token ids for `currentPlayer` given `diceValue`,
 * taking every player's tokens (for block/capture logic) into account.
 */
export function calculateValidMoves(
  allPlayers: Player[],
  currentPlayer: Player,
  diceValue: number
): number[] {
  const serverPlayers = allPlayers.map(toServerPlayer);
  const serverCurrentPlayer =
    serverPlayers.find((p) => p.playerId === currentPlayer.id) ?? toServerPlayer(currentPlayer);
  return serverGetValidMoves(serverPlayers, serverCurrentPlayer, diceValue);
}

/**
 * Whether the current player is allowed to end their turn right now.
 */
export function canEndTurn(
  allPlayers: Player[],
  currentPlayer: Player,
  diceValue: number,
  hasRolledDice: boolean
): boolean {
  if (!hasRolledDice) return false;

  // If rolled 6, must move if a valid move exists.
  if (diceValue === 6) {
    const validMoves = calculateValidMoves(allPlayers, currentPlayer, diceValue);
    return validMoves.length === 0;
  }

  return true;
}
