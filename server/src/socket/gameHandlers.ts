import { Socket } from 'socket.io';
import { GameRoom, Player } from '../models/GameRoom';
import { LudoEngine } from '../game/ludoEngine';
import { GameValidators } from '../game/validators';
import { RoomHandlers } from './roomHandlers';

export class GameHandlers {
  constructor(
    private roomHandlers: RoomHandlers,
    private getRoomForSocket: (socket: Socket) => GameRoom | null
  ) {}

  /**
   * Broadcast game state to all players in room
   */
  private broadcastGameState(socket: Socket, room: GameRoom): void {
      room.players.forEach((player) => {
        const roomData = this.roomHandlers.sanitizeRoom(room, player.id);
        socket.to(player.id).emit('game-state-updated', {
          room: {
            ...roomData,
            isPlayerTurn: room.players[room.currentPlayerIndex]?.id === player.id,
            currentPlayer: room.players[room.currentPlayerIndex]
              ? this.roomHandlers.sanitizePlayer(room.players[room.currentPlayerIndex])
              : null
          }
        });
      });

      // Also send to sender
      const senderData = this.roomHandlers.sanitizeRoom(room, socket.id);
      socket.emit('game-state-updated', {
        room: {
          ...senderData,
          isPlayerTurn: room.players[room.currentPlayerIndex]?.id === socket.id,
          currentPlayer: room.players[room.currentPlayerIndex]
            ? this.roomHandlers.sanitizePlayer(room.players[room.currentPlayerIndex])
            : null
        }
      });
  }

  /**
   * Handle game start
   */
  handleStartGame(socket: Socket): void {
    try {
      const room = this.getRoomForSocket(socket);
      if (!room) {
        socket.emit('error', { message: 'You are not in a room' });
        return;
      }

      // Check if player is room creator (first player)
      if (room.players[0].id !== socket.id) {
        socket.emit('error', { message: 'Only room creator can start the game' });
        return;
      }

      const validation = GameValidators.canStartGame(room);
      if (!validation.valid) {
        socket.emit('error', { message: validation.error });
        return;
      }

      // Start the game
      const started = LudoEngine.startGame(room);
      if (!started) {
        socket.emit('error', { message: 'Failed to start game' });
        return;
      }

      // Broadcast game started
      socket.to(room.roomId).emit('game-started', {
        room: this.roomHandlers.sanitizeRoom(room, socket.id)
      });

      socket.emit('game-started', {
        room: this.roomHandlers.sanitizeRoom(room, socket.id)
      });

      // Broadcast initial game state
      this.broadcastGameState(socket, room);

      console.log(`Game started in room ${room.roomId}`);
    } catch (error) {
      console.error('Error starting game:', error);
      socket.emit('error', { message: 'Failed to start game' });
    }
  }

  /**
   * Handle dice roll
   */
  handleRollDice(socket: Socket): void {
    try {
      const room = this.getRoomForSocket(socket);
      if (!room) {
        socket.emit('error', { message: 'You are not in a room' });
        return;
      }

      const validation = GameValidators.canRollDice(room, socket.id);
      if (!validation.valid) {
        socket.emit('error', { message: validation.error });
        return;
      }

      // Roll dice
      const diceValue = LudoEngine.rollDice();
      room.diceValue = diceValue;
      room.hasRolledDice = true;

      // First, broadcast that dice rolling has started (to all clients including sender)
      socket.to(room.roomId).emit('dice-rolling-started', {
        playerId: socket.id
      });

      socket.emit('dice-rolling-started', {
        playerId: socket.id
      });

      // After animation duration (1200ms), broadcast the result to everyone
      setTimeout(() => {
        // Broadcast dice roll result
        socket.to(room.roomId).emit('dice-rolled', {
          playerId: socket.id,
          diceValue,
          room: this.roomHandlers.sanitizeRoom(room, socket.id)
        });

        socket.emit('dice-rolled', {
          playerId: socket.id,
          diceValue,
          room: this.roomHandlers.sanitizeRoom(room, socket.id)
        });

        // Broadcast updated game state
        this.broadcastGameState(socket, room);

        console.log(`Player ${socket.id} rolled ${diceValue} in room ${room.roomId}`);
      }, 1200);
    } catch (error) {
      console.error('Error rolling dice:', error);
      socket.emit('error', { message: 'Failed to roll dice' });
    }
  }

  /**
   * Handle token movement
   */
  handleMoveToken(socket: Socket, tokenId: number): void {
    try {
      const room = this.getRoomForSocket(socket);
      if (!room) {
        socket.emit('error', { message: 'You are not in a room' });
        return;
      }

      const player = room.players.find(p => p.id === socket.id);
      if (!player) {
        socket.emit('error', { message: 'Player not found' });
        return;
      }

      const validation = GameValidators.canMoveToken(
        room,
        socket.id,
        tokenId,
        room.diceValue
      );

      if (!validation.valid) {
        socket.emit('error', { message: validation.error });
        return;
      }

      // Move token
      const moved = LudoEngine.moveToken(room, player, tokenId, room.diceValue);
      if (!moved) {
        socket.emit('error', { message: 'Failed to move token' });
        return;
      }

      // Check for win
      if (LudoEngine.checkWin(player)) {
        room.winner = player;
        room.gameState = 'finished';

        socket.to(room.roomId).emit('game-finished', {
          winner: this.roomHandlers.sanitizePlayer(player),
          room: this.roomHandlers.sanitizeRoom(room, socket.id)
        });

        socket.emit('game-finished', {
          winner: this.roomHandlers.sanitizePlayer(player),
          room: this.roomHandlers.sanitizeRoom(room, socket.id)
        });
      } else {
        // If rolled 6, player gets another turn (don't advance)
        if (room.diceValue === 6) {
          // Player can roll again
          room.hasRolledDice = false;
        } else {
          // Advance to next player
          LudoEngine.nextTurn(room);
        }
      }

      // Broadcast token moved
      socket.to(room.roomId).emit('token-moved', {
        playerId: socket.id,
        tokenId,
        move: room.lastMove,
        room: this.roomHandlers.sanitizeRoom(room, socket.id)
      });

      socket.emit('token-moved', {
        playerId: socket.id,
        tokenId,
        move: room.lastMove,
        room: this.roomHandlers.sanitizeRoom(room, socket.id)
      });

      // Broadcast updated game state
      this.broadcastGameState(socket, room);

      console.log(`Player ${socket.id} moved token ${tokenId} in room ${room.roomId}`);
    } catch (error) {
      console.error('Error moving token:', error);
      socket.emit('error', { message: 'Failed to move token' });
    }
  }

  /**
   * Handle end turn
   */
  handleEndTurn(socket: Socket): void {
    try {
      const room = this.getRoomForSocket(socket);
      if (!room) {
        socket.emit('error', { message: 'You are not in a room' });
        return;
      }

      const validation = GameValidators.canEndTurn(room, socket.id);
      if (!validation.valid) {
        socket.emit('error', { message: validation.error });
        return;
      }

      // Advance to next player
      LudoEngine.nextTurn(room);

      // Broadcast turn ended
      socket.to(room.roomId).emit('turn-ended', {
        playerId: socket.id,
        room: this.roomHandlers.sanitizeRoom(room, socket.id)
      });

      socket.emit('turn-ended', {
        playerId: socket.id,
        room: this.roomHandlers.sanitizeRoom(room, socket.id)
      });

      // Broadcast updated game state
      this.broadcastGameState(socket, room);

      console.log(`Player ${socket.id} ended turn in room ${room.roomId}`);
    } catch (error) {
      console.error('Error ending turn:', error);
      socket.emit('error', { message: 'Failed to end turn' });
    }
  }
}

