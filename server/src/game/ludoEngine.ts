import { GameRoom, Player, Token, PlayerColor } from '../models/GameRoom';

export class LudoEngine {
  // Board layout constants
  static readonly BOARD_SIZE = 52; // squares per path
  static readonly HOME_SIZE = 6; // squares in home triangle
  static readonly SAFE_ZONES = [0, 8, 13, 21, 26, 34, 39, 47]; // Safe zone positions

  // Starting positions for each color (where they enter the board)
  static readonly START_POSITIONS: Record<PlayerColor, number> = {
    red: 0,
    blue: 13,
    green: 26,
    yellow: 39
  };

  // Home entry positions (where tokens enter their home triangle)
  static readonly HOME_ENTRY: Record<PlayerColor, number> = {
    red: 50,
    blue: 11,
    green: 24,
    yellow: 37
  };

  /**
   * Roll dice (1-6)
   */
  static rollDice(): number {
    return Math.floor(Math.random() * 6) + 1;
  }

  /**
   * Initialize tokens for a player
   */
  static initializeTokens(color: PlayerColor): Token[] {
    return Array.from({ length: 4 }, (_, i) => ({
      id: i,
      position: -1, // -1 means in starting area
      isHome: true,
      isFinished: false
    }));
  }

  /**
   * Get valid moves for a player based on dice roll
   */
  static getValidMoves(room: GameRoom, player: Player, diceValue: number): number[] {
    const validTokenIds: number[] = [];

    // If rolled 6, can move token from home to start
    if (diceValue === 6) {
      const homeTokens = player.tokens.filter(t => t.isHome && !t.isFinished);
      if (homeTokens.length > 0) {
        validTokenIds.push(...homeTokens.map(t => t.id));
      }
    }

    // Check tokens on board
    const boardTokens = player.tokens.filter(t => !t.isHome && !t.isFinished);
    for (const token of boardTokens) {
      const newPosition = this.calculateNewPosition(player.color, token.position, diceValue);
      if (newPosition !== null) {
        validTokenIds.push(token.id);
      }
    }

    return validTokenIds;
  }

  /**
   * Calculate new position after moving
   */
  static calculateNewPosition(color: PlayerColor, currentPosition: number, steps: number): number | null {
    if (currentPosition === -1) {
      // Token is in home, can only move if rolled 6
      return steps === 6 ? this.START_POSITIONS[color] : null;
    }

    if (currentPosition >= 100) {
      // Token is in home triangle
      const homePosition = currentPosition - 100;
      if (homePosition + steps < this.HOME_SIZE) {
        return 100 + homePosition + steps;
      }
      return null; // Would exceed home triangle
    }

    // Token is on main board
    const startPos = this.START_POSITIONS[color];
    const homeEntry = this.HOME_ENTRY[color];
    let newPosition = currentPosition + steps;

    // Check if we've passed our home entry
    if (currentPosition < homeEntry && newPosition >= homeEntry) {
      // Entering home triangle
      const excess = newPosition - homeEntry;
      if (excess < this.HOME_SIZE) {
        return 100 + excess;
      }
      return null; // Would exceed home triangle
    }

    // Normal movement around the board
    if (newPosition >= this.BOARD_SIZE) {
      // Wrapped around the board
      newPosition = newPosition % this.BOARD_SIZE;
    }

    return newPosition;
  }

  /**
   * Move a token
   */
  static moveToken(room: GameRoom, player: Player, tokenId: number, diceValue: number): boolean {
    const token = player.tokens[tokenId];
    if (!token) return false;

    // Check if move is valid
    const validMoves = this.getValidMoves(room, player, diceValue);
    if (!validMoves.includes(tokenId)) {
      return false;
    }

    const oldPosition = token.position;
    let newPosition: number | null = null;

    if (token.isHome && diceValue === 6) {
      // Move token from home to start
      newPosition = this.START_POSITIONS[player.color];
      token.isHome = false;
    } else if (!token.isHome) {
      // Move token on board
      newPosition = this.calculateNewPosition(player.color, token.position, diceValue);
      if (newPosition === null) return false;

      if (newPosition >= 100) {
        // Entered home triangle
        token.isHome = false; // Already on board
      }
    }

    if (newPosition === null) return false;

    // Check for captures
    this.checkCapture(room, player, newPosition);

    // Update token position
    token.position = newPosition;
    
    // Check if token finished
    if (newPosition >= 100 && newPosition < 100 + this.HOME_SIZE) {
      const homePos = newPosition - 100;
      if (homePos === this.HOME_SIZE - 1) {
        token.isFinished = true;
      }
    }

    // Store last move
    room.lastMove = {
      playerId: player.id,
      tokenId,
      fromPosition: oldPosition,
      toPosition: newPosition
    };

    return true;
  }

  /**
   * Check if a token captures an opponent's token
   */
  static checkCapture(room: GameRoom, movingPlayer: Player, position: number): void {
    // Can't capture on safe zones
    const boardPosition = position < 100 ? position : null;
    if (boardPosition !== null && this.SAFE_ZONES.includes(boardPosition)) {
      return;
    }

    // Can't capture in home triangle
    if (position >= 100) {
      return;
    }

    // Check all other players' tokens
    for (const player of room.players) {
      if (player.id === movingPlayer.id) continue;

      for (const token of player.tokens) {
        if (token.position === position && !token.isHome && !token.isFinished) {
          // Capture! Send token back to home
          token.position = -1;
          token.isHome = true;
          break;
        }
      }
    }
  }

  /**
   * Check if a player has won
   */
  static checkWin(player: Player): boolean {
    return player.tokens.every(token => token.isFinished);
  }

  /**
   * Advance to next player's turn
   */
  static nextTurn(room: GameRoom): void {
    room.currentPlayerIndex = (room.currentPlayerIndex + 1) % room.players.length;
    room.hasRolledDice = false;
    room.diceValue = 0;
  }

  /**
   * Start the game
   */
  static startGame(room: GameRoom): boolean {
    if (room.players.length < 2 || room.players.length > 4) {
      return false;
    }

    // Initialize all players' tokens
    for (const player of room.players) {
      player.tokens = this.initializeTokens(player.color);
    }

    room.gameState = 'playing';
    room.currentPlayerIndex = 0;
    room.hasRolledDice = false;
    room.diceValue = 0;

    return true;
  }

  /**
   * Assign colors to players in order
   */
  static assignColors(players: Player[]): void {
    const colors: PlayerColor[] = ['red', 'blue', 'green', 'yellow'];
    players.forEach((player, index) => {
      player.color = colors[index];
    });
  }
}

