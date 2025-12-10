import type { Player } from '../types/game';
import { START_POSITIONS, HOME_ENTRY_POSITIONS } from './boardPositions';

const BOARD_SIZE = 52;
const HOME_COLUMN_SIZE = 6;

/**
 * Calculate new position after moving (simplified frontend version)
 * This is used to determine valid moves visually - actual move validation happens on backend
 */
function calculateNewPosition(
  color: 'red' | 'green' | 'yellow' | 'blue',
  currentPosition: number,
  steps: number
): number | null {
  if (currentPosition === -1) {
    return steps === 6 ? START_POSITIONS[color] : null;
  }

  // Token is in home column (positions 52-56, with 57 being finish)
  if (currentPosition >= 52) {
    const homePosition = currentPosition - 52;
    const newHomePosition = homePosition + steps;
    
    if (newHomePosition <= HOME_COLUMN_SIZE - 1) {
      return 52 + newHomePosition;
    }
    return null; // Would exceed finish
  }

  // Token is on main track
  const startPos = START_POSITIONS[color];
  const homeEntry = HOME_ENTRY_POSITIONS[color];
  
  const distanceFromStart = (currentPosition - startPos + BOARD_SIZE) % BOARD_SIZE;
  const newDistanceFromStart = distanceFromStart + steps;
  const homeEntryDistance = (homeEntry - startPos + BOARD_SIZE) % BOARD_SIZE;
  
  if (newDistanceFromStart > homeEntryDistance) {
    const stepsIntoHome = newDistanceFromStart - homeEntryDistance - 1;
    if (stepsIntoHome <= HOME_COLUMN_SIZE - 1) {
      return 52 + stepsIntoHome;
    }
    return null;
  }
  
  return (currentPosition + steps) % BOARD_SIZE;
}

export function getValidMoves(player: Player, diceValue: number): number[] {
  const validMoves: number[] = [];

  // If rolled 6, can move token from home base
  if (diceValue === 6) {
    const homeTokens = player.tokens.filter(t => t.isHome && !t.isFinished);
    if (homeTokens.length > 0) {
      validMoves.push(...homeTokens.map(t => t.id));
    }
  }

  // Check tokens on board (this is a simplified check - backend does full validation)
  const boardTokens = player.tokens.filter(t => !t.isHome && !t.isFinished);
  for (const token of boardTokens) {
    const newPosition = calculateNewPosition(player.color, token.position, diceValue);
    if (newPosition !== null) {
      validMoves.push(token.id);
    }
  }

  return validMoves;
}

export function calculateValidMoves(player: Player, diceValue: number): number[] {
  return getValidMoves(player, diceValue);
}

export function canEndTurn(player: Player, diceValue: number, hasRolledDice: boolean): boolean {
  if (!hasRolledDice) return false;
  
  // If rolled 6, must move if possible
  if (diceValue === 6) {
    const validMoves = getValidMoves(player, diceValue);
    return validMoves.length === 0;
  }
  
  return true;
}

