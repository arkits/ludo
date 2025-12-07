import { GameRoom, Player } from '../models/GameRoom';
import { LudoEngine } from './ludoEngine';

export class GameValidators {
  /**
   * Validate if a player can roll dice
   */
  static canRollDice(room: GameRoom, playerId: string): { valid: boolean; error?: string } {
    if (room.gameState !== 'playing') {
      return { valid: false, error: 'Game is not in progress' };
    }

    const currentPlayer = room.players[room.currentPlayerIndex];
    if (!currentPlayer || currentPlayer.id !== playerId) {
      return { valid: false, error: 'Not your turn' };
    }

    if (room.hasRolledDice) {
      return { valid: false, error: 'You have already rolled the dice' };
    }

    return { valid: true };
  }

  /**
   * Validate if a player can move a token
   */
  static canMoveToken(
    room: GameRoom,
    playerId: string,
    tokenId: number,
    diceValue: number
  ): { valid: boolean; error?: string } {
    if (room.gameState !== 'playing') {
      return { valid: false, error: 'Game is not in progress' };
    }

    const currentPlayer = room.players[room.currentPlayerIndex];
    if (!currentPlayer || currentPlayer.id !== playerId) {
      return { valid: false, error: 'Not your turn' };
    }

    if (!room.hasRolledDice) {
      return { valid: false, error: 'You must roll the dice first' };
    }

    if (room.diceValue !== diceValue) {
      return { valid: false, error: 'Invalid dice value' };
    }

    const token = currentPlayer.tokens[tokenId];
    if (!token) {
      return { valid: false, error: 'Invalid token' };
    }

    const validMoves = LudoEngine.getValidMoves(room, currentPlayer, diceValue);
    if (!validMoves.includes(tokenId)) {
      return { valid: false, error: 'Invalid move' };
    }

    return { valid: true };
  }

  /**
   * Validate if a player can end their turn
   */
  static canEndTurn(room: GameRoom, playerId: string): { valid: boolean; error?: string } {
    if (room.gameState !== 'playing') {
      return { valid: false, error: 'Game is not in progress' };
    }

    const currentPlayer = room.players[room.currentPlayerIndex];
    if (!currentPlayer || currentPlayer.id !== playerId) {
      return { valid: false, error: 'Not your turn' };
    }

    if (!room.hasRolledDice) {
      return { valid: false, error: 'You must roll the dice first' };
    }

    // If rolled 6, player must move if possible
    if (room.diceValue === 6 && room.hasRolledDice) {
      const validMoves = LudoEngine.getValidMoves(room, currentPlayer, room.diceValue);
      if (validMoves.length > 0) {
        return { valid: false, error: 'You must move a token when you roll 6' };
      }
    }

    return { valid: true };
  }

  /**
   * Validate if game can be started
   */
  static canStartGame(room: GameRoom): { valid: boolean; error?: string } {
    if (room.gameState !== 'waiting') {
      return { valid: false, error: 'Game has already started' };
    }

    if (room.players.length < 2) {
      return { valid: false, error: 'Need at least 2 players to start' };
    }

    if (room.players.length > 4) {
      return { valid: false, error: 'Maximum 4 players allowed' };
    }

    return { valid: true };
  }

  /**
   * Validate room join
   */
  static canJoinRoom(room: GameRoom, password?: string): { valid: boolean; error?: string } {
    if (room.gameState === 'playing') {
      return { valid: false, error: 'Game is already in progress' };
    }

    if (room.players.length >= room.maxPlayers) {
      return { valid: false, error: 'Room is full' };
    }

    return { valid: true };
  }
}

