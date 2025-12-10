// Board layout constants
export const BOARD_SIZE = 52; // squares per path
export const HOME_SIZE = 6; // squares in home triangle
export const SAFE_ZONES = [0, 8, 13, 21, 26, 34, 39, 47] as const; // Safe zone positions

export type PlayerColor = "red" | "blue" | "green" | "yellow";

export interface Token {
  id: number;
  position: number; // -1 = home, 0-51 = on board, 100+ = finished
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
}

// Starting positions for each color (where they enter the board)
export const START_POSITIONS: Record<PlayerColor, number> = {
  red: 0,
  blue: 13,
  green: 26,
  yellow: 39,
};

// Home entry positions (where tokens enter their home triangle)
export const HOME_ENTRY: Record<PlayerColor, number> = {
  red: 50,
  blue: 11,
  green: 24,
  yellow: 37,
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
 */
export function calculateNewPosition(
  color: PlayerColor,
  currentPosition: number,
  steps: number
): number | null {
  if (currentPosition === -1) {
    // Token is in home, can only move if rolled 6
    return steps === 6 ? START_POSITIONS[color] : null;
  }

  if (currentPosition >= 100) {
    // Token is in home triangle
    const homePosition = currentPosition - 100;
    if (homePosition + steps < HOME_SIZE) {
      return 100 + homePosition + steps;
    }
    return null; // Would exceed home triangle
  }

  // Token is on main board
  const homeEntry = HOME_ENTRY[color];
  let newPosition = currentPosition + steps;

  // Check if we've passed our home entry
  if (currentPosition < homeEntry && newPosition >= homeEntry) {
    // Entering home triangle
    const excess = newPosition - homeEntry;
    if (excess < HOME_SIZE) {
      return 100 + excess;
    }
    return null; // Would exceed home triangle
  }

  // Normal movement around the board
  if (newPosition >= BOARD_SIZE) {
    // Wrapped around the board
    newPosition = newPosition % BOARD_SIZE;
  }

  return newPosition;
}

/**
 * Get valid moves for a player based on dice roll
 */
export function getValidMoves(
  _players: Player[],
  player: Player,
  diceValue: number
): number[] {
  const validTokenIds: number[] = [];

  // If rolled 6, can move token from home to start
  if (diceValue === 6) {
    const homeTokens = player.tokens.filter((t) => t.isHome && !t.isFinished);
    if (homeTokens.length > 0) {
      validTokenIds.push(...homeTokens.map((t) => t.id));
    }
  }

  // Check tokens on board
  const boardTokens = player.tokens.filter((t) => !t.isHome && !t.isFinished);
  for (const token of boardTokens) {
    const newPosition = calculateNewPosition(player.color, token.position, diceValue);
    if (newPosition !== null) {
      validTokenIds.push(token.id);
    }
  }

  return validTokenIds;
}

/**
 * Check if a token captures an opponent's token
 * Returns updated players array with captures applied
 */
export function checkCapture(
  players: Player[],
  movingPlayer: Player,
  position: number
): Player[] {
  // Can't capture on safe zones
  const boardPosition = position < 100 ? position : null;
  if (boardPosition !== null && (SAFE_ZONES as readonly number[]).includes(boardPosition)) {
    return players;
  }

  // Can't capture in home triangle
  if (position >= 100) {
    return players;
  }

  // Check all other players' tokens
  return players.map((player) => {
    if (player.playerId === movingPlayer.playerId) {
      return player;
    }

    const updatedTokens = player.tokens.map((token) => {
      if (token.position === position && !token.isHome && !token.isFinished) {
        // Capture! Send token back to home
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
): { updatedPlayer: Player; updatedPlayers: Player[] } | null {
  const token = player.tokens[tokenId];
  if (!token) return null;

  // Check if move is valid
  const validMoves = getValidMoves(players, player, diceValue);
  if (!validMoves.includes(tokenId)) {
    return null;
  }

  let newPosition: number | null = null;

  if (token.isHome && diceValue === 6) {
    // Move token from home to start
    newPosition = START_POSITIONS[player.color];
  } else if (!token.isHome) {
    // Move token on board
    newPosition = calculateNewPosition(player.color, token.position, diceValue);
    if (newPosition === null) return null;
  }

  if (newPosition === null) return null;

  // Check for captures (before updating position)
  let updatedPlayers = checkCapture(players, player, newPosition);

  // Find the updated player after captures
  const updatedPlayerBeforeMove = updatedPlayers.find(
    (p) => p.playerId === player.playerId
  );
  if (!updatedPlayerBeforeMove) return null;

  // Update token position
  const updatedTokens = updatedPlayerBeforeMove.tokens.map((t) => {
    if (t.id === tokenId) {
      const updatedToken = {
        ...t,
        position: newPosition!,
        isHome: t.isHome && diceValue !== 6 ? t.isHome : false,
      };

      // Check if token finished
      if (newPosition! >= 100 && newPosition! < 100 + HOME_SIZE) {
        const homePos = newPosition! - 100;
        if (homePos === HOME_SIZE - 1) {
          return {
            ...updatedToken,
            isFinished: true,
          };
        }
      }

      return updatedToken;
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

  return { updatedPlayer, updatedPlayers };
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
