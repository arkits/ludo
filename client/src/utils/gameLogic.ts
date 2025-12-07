import type { Player } from '../types/game';

export function getValidMoves(player: Player, diceValue: number): number[] {
  const validMoves: number[] = [];

  // If rolled 6, can move token from home
  if (diceValue === 6) {
    const homeTokens = player.tokens.filter(t => t.isHome && !t.isFinished);
    validMoves.push(...homeTokens.map(t => t.id));
  }

  // Check tokens on board
  const boardTokens = player.tokens.filter(t => !t.isHome && !t.isFinished);
  validMoves.push(...boardTokens.map(t => t.id));

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

