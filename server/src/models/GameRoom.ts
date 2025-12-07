import bcrypt from 'bcrypt';

export type PlayerColor = 'red' | 'blue' | 'green' | 'yellow';

export type GameState = 'waiting' | 'playing' | 'finished';

export interface Token {
  id: number;
  position: number; // -1 = home, 0-51 = on board, 100+ = finished
  isHome: boolean;
  isFinished: boolean;
}

export interface Player {
  id: string; // socket.id
  nickname: string;
  color: PlayerColor;
  tokens: Token[];
  isReady: boolean;
}

export interface GameRoom {
  roomId: string;
  passwordHash: string | null;
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
  createdAt: Date;
}

export class GameRoomManager {
  private rooms: Map<string, GameRoom> = new Map();

  createRoom(roomId: string, password?: string): GameRoom {
    const passwordHash = password ? bcrypt.hashSync(password, 10) : null;
    
    const room: GameRoom = {
      roomId,
      passwordHash,
      maxPlayers: 4,
      players: [],
      gameState: 'waiting',
      currentPlayerIndex: 0,
      diceValue: 0,
      hasRolledDice: false,
      lastMove: null,
      winner: null,
      createdAt: new Date()
    };

    this.rooms.set(roomId, room);
    return room;
  }

  getRoom(roomId: string): GameRoom | undefined {
    return this.rooms.get(roomId);
  }

  deleteRoom(roomId: string): boolean {
    return this.rooms.delete(roomId);
  }

  verifyPassword(room: GameRoom, password: string): boolean {
    if (!room.passwordHash) return true;
    return bcrypt.compareSync(password, room.passwordHash);
  }

  getAllRooms(): GameRoom[] {
    return Array.from(this.rooms.values());
  }

  cleanupEmptyRooms(): void {
    const now = Date.now();
    const TIMEOUT = 30 * 60 * 1000; // 30 minutes

    for (const [roomId, room] of this.rooms.entries()) {
      if (room.players.length === 0 && now - room.createdAt.getTime() > TIMEOUT) {
        this.rooms.delete(roomId);
      }
    }
  }
}

