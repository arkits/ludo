import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import { GameRoomManager } from './models/GameRoom';
import { RoomHandlers } from './socket/roomHandlers';
import { GameHandlers } from './socket/gameHandlers';

const app = express();
const httpServer = createServer(app);

app.use(cors());
app.use(express.json());

const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  transports: ['websocket', 'polling']
});

// Initialize managers
const roomManager = new GameRoomManager();
const roomHandlers = new RoomHandlers(roomManager);

// Helper function to get room for socket
const getRoomForSocket = (socket: Socket) => {
  return roomHandlers.getRoomForSocket(socket);
};

const gameHandlers = new GameHandlers(roomHandlers, getRoomForSocket);

// Cleanup empty rooms every 5 minutes
setInterval(() => {
  roomManager.cleanupEmptyRooms();
}, 5 * 60 * 1000);

io.on('connection', (socket: Socket) => {
  console.log('Client connected:', socket.id);

  // Room management events
  socket.on('create-room', (data: { nickname: string; password?: string }) => {
    roomHandlers.handleCreateRoom(socket, data.nickname, data.password);
  });

  socket.on('join-room', (data: { roomId: string; nickname: string; password?: string }) => {
    roomHandlers.handleJoinRoom(socket, data.roomId, data.nickname, data.password);
  });

  socket.on('leave-room', (data: { roomId: string }) => {
    roomHandlers.handleLeaveRoom(socket, data.roomId);
  });

  socket.on('player-ready', (data: { roomId: string; isReady: boolean }) => {
    roomHandlers.handlePlayerReady(socket, data.roomId, data.isReady);
  });

  // Game events
  socket.on('start-game', () => {
    gameHandlers.handleStartGame(socket);
  });

  socket.on('roll-dice', () => {
    gameHandlers.handleRollDice(socket);
  });

  socket.on('move-token', (data: { tokenId: number }) => {
    gameHandlers.handleMoveToken(socket, data.tokenId);
  });

  socket.on('end-turn', () => {
    gameHandlers.handleEndTurn(socket);
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    // Find and remove player from their room
    const room = getRoomForSocket(socket);
    if (room) {
      roomHandlers.handleLeaveRoom(socket, room.roomId);
    }
  });
});

const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
