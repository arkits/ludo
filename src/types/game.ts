export type PlayerColor = 'red' | 'blue' | 'green' | 'yellow';

export type GameState = 'waiting' | 'playing' | 'finished';

export interface Token {
  id: number;
  position: number;
  isHome: boolean;
  isFinished: boolean;
}

export interface Player {
  id: string;
  nickname: string;
  color: PlayerColor;
  tokens: Token[];
  isReady: boolean;
  isBot: boolean;
}

export interface MoveHistoryEntry {
  playerId: string;
  playerNickname: string;
  playerColor: PlayerColor;
  tokenId: number;
  fromPosition: number;
  toPosition: number;
  captured: boolean;
  timestamp: number;
}

export interface GameRoom {
  roomId: string;
  maxPlayers: number;
  players: Player[];
  gameState: GameState;
  currentPlayerIndex: number;
  diceValue: number;
  hasRolledDice: boolean;
  lastMove: {
    playerId: string;
    tokenId: number;
    fromPosition: number;
    toPosition: number;
  } | null;
  moveHistory: MoveHistoryEntry[];
  winner: Player | null;
  isPlayerTurn: boolean;
  currentPlayer: Player | null;
}

