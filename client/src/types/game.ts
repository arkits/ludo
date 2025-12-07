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
  winner: Player | null;
  isPlayerTurn: boolean;
  currentPlayer: Player | null;
}

