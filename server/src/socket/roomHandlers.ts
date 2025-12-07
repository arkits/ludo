import { Socket } from 'socket.io';
import { GameRoomManager, GameRoom, Player } from '../models/GameRoom';
import { LudoEngine } from '../game/ludoEngine';

export class RoomHandlers {
  constructor(private roomManager: GameRoomManager) {}

  /**
   * Generate a unique room ID
   */
  private generateRoomId(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  /**
   * Handle room creation
   */
  handleCreateRoom(socket: Socket, nickname: string, password?: string): void {
    try {
      // Generate unique room ID
      let roomId = this.generateRoomId();
      while (this.roomManager.getRoom(roomId)) {
        roomId = this.generateRoomId();
      }

      // Create room
      const room = this.roomManager.createRoom(roomId, password);

      // Add creator as first player
      const player: Player = {
        id: socket.id,
        nickname: nickname || `Player${room.players.length + 1}`,
        color: 'red', // Will be reassigned when game starts
        tokens: [],
        isReady: false
      };

      room.players.push(player);
      socket.join(roomId);

      // Send room details to creator
      socket.emit('room-created', {
        roomId,
        room: this.sanitizeRoom(room, socket.id)
      });

      console.log(`Room ${roomId} created by ${socket.id}`);
    } catch (error) {
      console.error('Error creating room:', error);
      socket.emit('error', { message: 'Failed to create room' });
    }
  }

  /**
   * Handle room joining
   */
  handleJoinRoom(socket: Socket, roomId: string, nickname: string, password?: string): void {
    try {
      const room = this.roomManager.getRoom(roomId);

      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }

      // Validate password
      if (!this.roomManager.verifyPassword(room, password || '')) {
        socket.emit('error', { message: 'Invalid password' });
        return;
      }

      // Check if room is full
      if (room.players.length >= room.maxPlayers) {
        socket.emit('error', { message: 'Room is full' });
        return;
      }

      // Check if game has started
      if (room.gameState === 'playing') {
        socket.emit('error', { message: 'Game has already started' });
        return;
      }

      // Check if player already in room
      if (room.players.some(p => p.id === socket.id)) {
        socket.emit('error', { message: 'You are already in this room' });
        return;
      }

      // Add player to room
      const player: Player = {
        id: socket.id,
        nickname: nickname || `Player${room.players.length + 1}`,
        color: 'red', // Will be reassigned when game starts
        tokens: [],
        isReady: false
      };

      room.players.push(player);
      socket.join(roomId);

      // Assign colors
      LudoEngine.assignColors(room.players);

      // Notify all players in room
      socket.to(roomId).emit('player-joined', {
        player: this.sanitizePlayer(player),
        room: this.sanitizeRoom(room, socket.id)
      });

      // Send room details to joining player
      socket.emit('room-joined', {
        room: this.sanitizeRoom(room, socket.id)
      });

      console.log(`Player ${socket.id} joined room ${roomId}`);
    } catch (error) {
      console.error('Error joining room:', error);
      socket.emit('error', { message: 'Failed to join room' });
    }
  }

  /**
   * Handle player leaving room
   */
  handleLeaveRoom(socket: Socket, roomId: string): void {
    try {
      const room = this.roomManager.getRoom(roomId);
      if (!room) return;

      // Remove player from room
      room.players = room.players.filter(p => p.id !== socket.id);
      socket.leave(roomId);

      // If room is empty, delete it after a delay
      if (room.players.length === 0) {
        setTimeout(() => {
          const checkRoom = this.roomManager.getRoom(roomId);
          if (checkRoom && checkRoom.players.length === 0) {
            this.roomManager.deleteRoom(roomId);
            console.log(`Room ${roomId} deleted (empty)`);
          }
        }, 60000); // 1 minute delay
      } else {
        // Notify remaining players
        socket.to(roomId).emit('player-left', {
          playerId: socket.id,
          room: this.sanitizeRoom(room, socket.id)
        });
      }

      console.log(`Player ${socket.id} left room ${roomId}`);
    } catch (error) {
      console.error('Error leaving room:', error);
    }
  }

  /**
   * Handle player ready status
   */
  handlePlayerReady(socket: Socket, roomId: string, isReady: boolean): void {
    try {
      const room = this.roomManager.getRoom(roomId);
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }

      const player = room.players.find(p => p.id === socket.id);
      if (!player) {
        socket.emit('error', { message: 'You are not in this room' });
        return;
      }

      player.isReady = isReady;

      // Broadcast to all players in room
      socket.to(roomId).emit('player-ready', {
        playerId: socket.id,
        isReady,
        room: this.sanitizeRoom(room, socket.id)
      });

      socket.emit('player-ready', {
        playerId: socket.id,
        isReady,
        room: this.sanitizeRoom(room, socket.id)
      });
    } catch (error) {
      console.error('Error setting player ready:', error);
      socket.emit('error', { message: 'Failed to set ready status' });
    }
  }

  /**
   * Get room for a socket
   */
  getRoomForSocket(socket: Socket): GameRoom | null {
    const rooms = Array.from(socket.rooms);
    for (const roomId of rooms) {
      if (roomId !== socket.id) {
        const room = this.roomManager.getRoom(roomId);
        if (room) return room;
      }
    }
    return null;
  }

  /**
   * Sanitize room data (remove sensitive info, add player-specific data)
   */
  sanitizeRoom(room: GameRoom, playerId: string): any {
    return {
      roomId: room.roomId,
      maxPlayers: room.maxPlayers,
      players: room.players.map(p => this.sanitizePlayer(p)),
      gameState: room.gameState,
      currentPlayerIndex: room.currentPlayerIndex,
      diceValue: room.diceValue,
      hasRolledDice: room.hasRolledDice,
      lastMove: room.lastMove,
      winner: room.winner ? this.sanitizePlayer(room.winner) : null,
      isPlayerTurn: room.players[room.currentPlayerIndex]?.id === playerId,
      currentPlayer: room.players[room.currentPlayerIndex]
        ? this.sanitizePlayer(room.players[room.currentPlayerIndex])
        : null
    };
  }

  /**
   * Sanitize player data
   */
  sanitizePlayer(player: Player): any {
    return {
      id: player.id,
      nickname: player.nickname,
      color: player.color,
      tokens: player.tokens,
      isReady: player.isReady
    };
  }
}

