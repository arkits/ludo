// Board layout constants
export const BOARD_SIZE = 52; // squares on main track
export const HOME_COLUMN_SIZE = 6; // 5 squares + 1 finish position in home column
export const SAFE_ZONES = [0, 8, 13, 21, 26, 34, 39, 47] as const; // Safe zone positions (start positions + star squares)

export type PlayerColor = "red" | "blue" | "green" | "yellow";

export interface Token {
  id: number;
  position: number; // -1 = in home base, 0-51 = on main track, 52-57 = in home column (52-56 = squares, 57 = finished)
  isHome: boolean;
  isFinished: boolean;
}

export interface Player {
  playerId: string;
  nickname: string;
  color: PlayerColor;
  tokens: Token[];
  isReady: boolean;
  playerIndex: number;
  isBot: boolean;
}

// Starting positions for each color (where they enter the main track)
// Board layout: Red=top-left, Green=top-right, Yellow=bottom-right, Blue=bottom-left
export const START_POSITIONS: Record<PlayerColor, number> = {
  red: 0,
  green: 13,
  yellow: 26,
  blue: 39,
};

// Home entry positions - the position AFTER which a token enters home column
// When a token lands on or passes this position, they can enter their home column
// Each color enters home one position before their start position (after going full lap)
export const HOME_ENTRY: Record<PlayerColor, number> = {
  red: 51,    // Red enters home after position 51 (one before position 0)
  green: 12,  // Green enters home after position 12 (one before position 13)
  yellow: 25, // Yellow enters home after position 25 (one before position 26)
  blue: 38,   // Blue enters home after position 38 (one before position 39)
};

/**
 * Roll dice (1-6)
 */
export function rollDice(): number {
  return Math.floor(Math.random() * 6) + 1;
}

/**
 * Initialize tokens for a player
 */
export function initializeTokens(): Token[] {
  return Array.from({ length: 4 }, (_, i) => ({
    id: i,
    position: -1, // -1 means in starting area
    isHome: true,
    isFinished: false,
  }));
}

/**
 * Calculate new position after moving
 * Returns null if the move is invalid (e.g., would exceed home column)
 */
export function calculateNewPosition(
  color: PlayerColor,
  currentPosition: number,
  steps: number
): number | null {
  if (currentPosition === -1) {
    // Token is in home base, can only move if rolled 6
    return steps === 6 ? START_POSITIONS[color] : null;
  }

  // Token is in home column (positions 52-56, with 57 being finish)
  if (currentPosition >= 52) {
    const homePosition = currentPosition - 52; // 0-5 within home column
    const newHomePosition = homePosition + steps;
    
    // Check for exact landing on finish (position 57 = finished)
    if (newHomePosition === HOME_COLUMN_SIZE - 1) {
      return 52 + newHomePosition; // Position 57 = finished
    }
    
    // Can move forward in home column but not exceed finish
    if (newHomePosition < HOME_COLUMN_SIZE - 1) {
      return 52 + newHomePosition;
    }
    
    // Would exceed finish - invalid move
    return null;
  }

  // Token is on main track (positions 0-51)
  const startPos = START_POSITIONS[color];
  const homeEntry = HOME_ENTRY[color];
  
  // Calculate distance traveled from start position
  const distanceFromStart = (currentPosition - startPos + BOARD_SIZE) % BOARD_SIZE;
  const newDistanceFromStart = distanceFromStart + steps;
  
  // Calculate distance to home entry from start
  const homeEntryDistance = (homeEntry - startPos + BOARD_SIZE) % BOARD_SIZE;
  
  // Check if we should enter home column
  // We enter home when we've traveled past our home entry point (which is homeEntryDistance steps from start)
  if (newDistanceFromStart > homeEntryDistance) {
    // We're entering or moving through home column
    const stepsIntoHome = newDistanceFromStart - homeEntryDistance - 1;
    
    // Check if we land exactly on finish or before
    if (stepsIntoHome === HOME_COLUMN_SIZE - 1) {
      return 52 + stepsIntoHome; // Position 57 = finished
    }
    
    if (stepsIntoHome < HOME_COLUMN_SIZE - 1) {
      return 52 + stepsIntoHome; // Position 52-56 = in home column
    }
    
    // Would exceed finish - invalid move
    return null;
  }
  
  // Normal movement on main track
  const newPosition = (currentPosition + steps) % BOARD_SIZE;
  return newPosition;
}

/**
 * Check if a position has a block (2+ tokens of the same player)
 */
export function hasBlock(players: Player[], position: number, excludePlayerId?: string): { hasBlock: boolean; blockingPlayerId: string | null } {
  // Blocks only exist on main track (0-51)
  if (position < 0 || position >= 52) {
    return { hasBlock: false, blockingPlayerId: null };
  }

  for (const player of players) {
    if (excludePlayerId && player.playerId === excludePlayerId) continue;
    
    const tokensAtPosition = player.tokens.filter(
      (t) => t.position === position && !t.isHome && !t.isFinished
    );
    
    if (tokensAtPosition.length >= 2) {
      return { hasBlock: true, blockingPlayerId: player.playerId };
    }
  }
  
  return { hasBlock: false, blockingPlayerId: null };
}

/**
 * Check if path is blocked by opponent's block
 */
export function isPathBlocked(
  players: Player[],
  player: Player,
  fromPosition: number,
  toPosition: number
): boolean {
  // Only check blocks on main track
  if (fromPosition < 0 || fromPosition >= 52) return false;
  
  // Calculate the number of steps (accounting for wrap-around)
  const steps = toPosition >= fromPosition 
    ? toPosition - fromPosition 
    : (52 - fromPosition) + toPosition;
  
  // Check each position along the path (excluding start, including end)
  for (let i = 1; i <= steps; i++) {
    const checkPos = (fromPosition + i) % 52;
    
    // If we're entering home column, stop checking main track
    if (checkPos === toPosition && toPosition >= 52) break;
    
    const { hasBlock: blocked, blockingPlayerId } = hasBlock(players, checkPos);
    
    // Can pass through own blocks, but not opponents'
    if (blocked && blockingPlayerId !== player.playerId) {
      return true;
    }
  }
  
  return false;
}

/**
 * Check if moving in home column would jump over own pieces
 */
export function wouldJumpOwnTokenInHomeColumn(
  player: Player,
  tokenId: number,
  fromPosition: number,
  toPosition: number
): boolean {
  // Only applies in home column (positions 52-57)
  if (fromPosition < 52 || toPosition < 52) return false;
  
  const fromHomePos = fromPosition - 52;
  const toHomePos = toPosition - 52;
  
  // Check each position between from and to (exclusive of from, inclusive of to)
  for (let pos = fromHomePos + 1; pos < toHomePos; pos++) {
    const absolutePos = 52 + pos;
    const tokenAtPos = player.tokens.find(
      (t) => t.id !== tokenId && t.position === absolutePos && !t.isFinished
    );
    if (tokenAtPos) {
      return true; // Would jump over own token
    }
  }
  
  return false;
}

/**
 * Get valid moves for a player based on dice roll
 */
export function getValidMoves(
  players: Player[],
  player: Player,
  diceValue: number
): number[] {
  const validTokenIds: number[] = [];

  // If rolled 6, can move token from home base to start
  if (diceValue === 6) {
    const homeTokens = player.tokens.filter((t) => t.isHome && !t.isFinished);
    if (homeTokens.length > 0) {
      const startPos = START_POSITIONS[player.color];
      
      // Check if start position is blocked by opponent
      const { hasBlock: blocked, blockingPlayerId } = hasBlock(players, startPos);
      
      // Can move out if: no block, or block is our own
      if (!blocked || blockingPlayerId === player.playerId) {
        validTokenIds.push(...homeTokens.map((t) => t.id));
      }
    }
  }

  // Check tokens on board (main track or home column)
  const boardTokens = player.tokens.filter((t) => !t.isHome && !t.isFinished);
  for (const token of boardTokens) {
    const newPosition = calculateNewPosition(player.color, token.position, diceValue);
    if (newPosition === null) continue;
    
    // Check if path is blocked by opponent's block (only on main track)
    if (token.position < 52 && newPosition < 52) {
      if (isPathBlocked(players, player, token.position, newPosition)) {
        continue; // Can't pass through opponent's block
      }
    }
    
    // Check if destination has opponent's block
    if (newPosition < 52) {
      const { hasBlock: blocked, blockingPlayerId } = hasBlock(players, newPosition);
      if (blocked && blockingPlayerId !== player.playerId) {
        continue; // Can't land on opponent's block
      }
    }
    
    // Check if would jump over own token in home column
    if (token.position >= 52 && newPosition >= 52) {
      if (wouldJumpOwnTokenInHomeColumn(player, token.id, token.position, newPosition)) {
        continue; // Can't jump over own pieces in home column
      }
    }
    
    // Check if entering home column and would jump over own pieces
    if (token.position < 52 && newPosition >= 52) {
      // When entering home column, check if any own token is in the way
      const homeStartPos = 52;
      if (wouldJumpOwnTokenInHomeColumn(player, token.id, homeStartPos - 1, newPosition)) {
        continue;
      }
    }
    
    validTokenIds.push(token.id);
  }

  return validTokenIds;
}

/**
 * Check if a token captures an opponent's token
 * Game rule: When a player's token lands on a spot that already has another player's token,
 * the token that was already there is moved back to its home, while the new token takes its spot.
 * 
 * Exceptions (standard Ludo rules):
 * - Cannot capture in home column (positions 52+)
 * - Cannot capture on safe zones (start positions and star squares)
 * - Cannot capture blocks (2+ tokens of the same player at the same position)
 * 
 * Returns updated players array with captures applied
 */
export function checkCapture(
  players: Player[],
  movingPlayer: Player,
  position: number
): Player[] {
  // Can't capture in home column (positions 52+)
  if (position >= 52) {
    return players;
  }

  // Can't capture on safe zones
  if ((SAFE_ZONES as readonly number[]).includes(position)) {
    return players;
  }

  // Check if there's a block at the position (2+ opponent tokens) - can't capture blocks
  const { hasBlock: blocked } = hasBlock(players, position, movingPlayer.playerId);
  if (blocked) {
    return players; // Can't capture when there's a block
  }

  // Check all other players' tokens at this position
  // If any opponent token is found, send it back to home base
  return players.map((player) => {
    if (player.playerId === movingPlayer.playerId) {
      return player; // Skip the moving player
    }

    const updatedTokens = player.tokens.map((token) => {
      // If this opponent's token is at the landing position, capture it
      if (token.position === position && !token.isHome && !token.isFinished) {
        // Capture! Send token back to home base (position -1, isHome = true)
        return {
          ...token,
          position: -1,
          isHome: true,
        };
      }
      return token;
    });

    return {
      ...player,
      tokens: updatedTokens,
    };
  });
}

/**
 * Move a token
 * Returns updated player with token moved, and updated players array with captures
 */
export function moveToken(
  players: Player[],
  player: Player,
  tokenId: number,
  diceValue: number
): { updatedPlayer: Player; updatedPlayers: Player[]; captured: boolean } | null {
  const token = player.tokens[tokenId];
  if (!token) return null;

  // Check if move is valid
  const validMoves = getValidMoves(players, player, diceValue);
  if (!validMoves.includes(tokenId)) {
    return null;
  }

  let newPosition: number | null = null;

  if (token.isHome && diceValue === 6) {
    // Move token from home base to start position
    newPosition = START_POSITIONS[player.color];
  } else if (!token.isHome) {
    // Move token on board
    newPosition = calculateNewPosition(player.color, token.position, diceValue);
    if (newPosition === null) return null;
  }

  if (newPosition === null) return null;

  // Check if this move captures an opponent (before updating position)
  let captured = false;
  if (newPosition < 52 && !(SAFE_ZONES as readonly number[]).includes(newPosition)) {
    // Check if there's exactly one opponent token at the destination (not a block)
    for (const otherPlayer of players) {
      if (otherPlayer.playerId === player.playerId) continue;
      const opponentTokensAtPos = otherPlayer.tokens.filter(
        (t) => t.position === newPosition && !t.isHome && !t.isFinished
      );
      if (opponentTokensAtPos.length === 1) {
        captured = true;
        break;
      }
    }
  }

  // Apply captures
  let updatedPlayers = checkCapture(players, player, newPosition);

  // Find the updated player after captures
  const updatedPlayerBeforeMove = updatedPlayers.find(
    (p) => p.playerId === player.playerId
  );
  if (!updatedPlayerBeforeMove) return null;

  // Update token position
  const updatedTokens = updatedPlayerBeforeMove.tokens.map((t) => {
    if (t.id === tokenId) {
      const isFinished = newPosition === 57; // Position 57 is the finish square
      
      return {
        ...t,
        position: newPosition!,
        isHome: false,
        isFinished,
      };
    }
    return t;
  });

  const updatedPlayer: Player = {
    ...updatedPlayerBeforeMove,
    tokens: updatedTokens,
  };

  // Update players array with moved player
  updatedPlayers = updatedPlayers.map((p) =>
    p.playerId === player.playerId ? updatedPlayer : p
  );

  return { updatedPlayer, updatedPlayers, captured };
}

/**
 * Check if a player has won
 */
export function checkWin(player: Player): boolean {
  return player.tokens.every((token) => token.isFinished);
}

/**
 * Assign colors to players in order
 */
export function assignColors(players: Player[]): Player[] {
  const colors: PlayerColor[] = ["red", "blue", "green", "yellow"];
  return players.map((player, index) => ({
    ...player,
    color: colors[index],
  }));
}

/**
 * Choose the best move for a bot player
 * Strategy:
 * 1. If can capture an opponent, prioritize that
 * 2. If rolled 6 and can bring a token out, do it
 * 3. Move the token that is furthest along (closest to finishing)
 * 4. If no good move, move a random valid token
 */
export function chooseBotMove(
  players: Player[],
  player: Player,
  diceValue: number
): number | null {
  const validMoves = getValidMoves(players, player, diceValue);
  
  if (validMoves.length === 0) {
    return null;
  }
  
  if (validMoves.length === 1) {
    return validMoves[0];
  }

  // Score each move
  const moveScores: { tokenId: number; score: number }[] = [];
  
  for (const tokenId of validMoves) {
    const token = player.tokens[tokenId];
    if (!token) continue;
    
    let score = 0;
    
    // Calculate new position
    let newPosition: number | null = null;
    if (token.isHome && diceValue === 6) {
      newPosition = START_POSITIONS[player.color];
      score += 50; // Bonus for getting a token out
    } else if (!token.isHome && !token.isFinished) {
      newPosition = calculateNewPosition(player.color, token.position, diceValue);
    }
    
    if (newPosition !== null) {
      // Check if this move would capture an opponent
      if (newPosition < 52 && !(SAFE_ZONES as readonly number[]).includes(newPosition)) {
        for (const otherPlayer of players) {
          if (otherPlayer.playerId === player.playerId) continue;
          const opponentTokensAtPos = otherPlayer.tokens.filter(
            (t) => t.position === newPosition && !t.isHome && !t.isFinished
          );
          // Can only capture if there's exactly one opponent token (not a block)
          if (opponentTokensAtPos.length === 1) {
            score += 100; // High priority for captures
            break;
          }
        }
      }
      
      // Check if would finish
      if (newPosition === 57) {
        score += 200; // Highest priority for finishing a token
      }
      
      // Prefer moving tokens that are further along
      if (!token.isHome) {
        // Calculate progress: higher position in home column is better
        if (token.position >= 52) {
          score += 30 + (token.position - 52) * 5; // Prefer tokens closer to finish
        } else {
          // On main track - calculate distance from start
          const startPos = START_POSITIONS[player.color];
          const distanceFromStart = (token.position - startPos + BOARD_SIZE) % BOARD_SIZE;
          score += distanceFromStart / 2; // Small bonus for progress
        }
      }
      
      // Check if landing on safe zone
      if (newPosition < 52 && (SAFE_ZONES as readonly number[]).includes(newPosition)) {
        score += 10; // Small bonus for safe zones
      }
    }
    
    moveScores.push({ tokenId, score });
  }
  
  // Sort by score (highest first) and return best move
  moveScores.sort((a, b) => b.score - a.score);
  return moveScores[0]?.tokenId ?? validMoves[0];
}
