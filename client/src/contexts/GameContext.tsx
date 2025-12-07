import { createContext, useContext, useEffect, useReducer } from 'react';
import type { ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import type { GameRoom } from '../types/game';
import { calculateValidMoves } from '../utils/gameLogic';

interface GameState {
  socket: Socket | null;
  room: GameRoom | null;
  currentPlayerId: string | null;
  error: string | null;
  validMoves: number[];
  isConnected: boolean;
  isRollingDice: boolean;
}

type GameAction =
  | { type: 'SET_SOCKET'; payload: Socket }
  | { type: 'SET_ROOM'; payload: GameRoom }
  | { type: 'SET_CURRENT_PLAYER'; payload: string }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_VALID_MOVES'; payload: number[] }
  | { type: 'SET_CONNECTED'; payload: boolean }
  | { type: 'SET_ROLLING_DICE'; payload: boolean }
  | { type: 'CLEAR_ROOM' };

interface GameContextType {
  state: GameState;
  createRoom: (nickname: string, password?: string) => void;
  joinRoom: (roomId: string, nickname: string, password?: string) => void;
  leaveRoom: () => void;
  startGame: () => void;
  rollDice: () => void;
  moveToken: (tokenId: number) => void;
  endTurn: () => void;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'SET_SOCKET':
      return { ...state, socket: action.payload };
    case 'SET_ROOM':
      return { ...state, room: action.payload, error: null };
    case 'SET_CURRENT_PLAYER':
      return { ...state, currentPlayerId: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'SET_VALID_MOVES':
      return { ...state, validMoves: action.payload };
    case 'SET_CONNECTED':
      return { ...state, isConnected: action.payload };
    case 'SET_ROLLING_DICE':
      return { ...state, isRollingDice: action.payload };
    case 'CLEAR_ROOM':
      return { ...state, room: null, validMoves: [], isRollingDice: false };
    default:
      return state;
  }
}

const initialState: GameState = {
  socket: null,
  room: null,
  currentPlayerId: null,
  error: null,
  validMoves: [],
  isConnected: false,
  isRollingDice: false
};

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(gameReducer, initialState);

  useEffect(() => {
    // Initialize socket connection
    const socket = io(import.meta.env.VITE_SERVER_URL || 'http://localhost:3001', {
      transports: ['websocket', 'polling']
    });

    socket.on('connect', () => {
      console.log('Connected to server');
      dispatch({ type: 'SET_CONNECTED', payload: true });
      dispatch({ type: 'SET_SOCKET', payload: socket });

      // Auto-join room if room ID is in URL
      const urlParams = new URLSearchParams(window.location.search);
      const roomIdFromUrl = urlParams.get('room');
      const storedNickname = localStorage.getItem('ludo_nickname');
      const storedPassword = localStorage.getItem(`ludo_password_${roomIdFromUrl}`);

      if (roomIdFromUrl && storedNickname && socket.id) {
        // Auto-join the room
        socket.emit('join-room', {
          roomId: roomIdFromUrl.toUpperCase(),
          nickname: storedNickname,
          password: storedPassword || undefined
        });
      }
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from server');
      dispatch({ type: 'SET_CONNECTED', payload: false });
    });

    socket.on('error', (data: { message: string }) => {
      console.error('Socket error:', data.message);
      dispatch({ type: 'SET_ERROR', payload: data.message });
      // Clear error after 5 seconds
      setTimeout(() => {
        dispatch({ type: 'SET_ERROR', payload: null });
      }, 5000);
    });

    socket.on('room-created', (data: { roomId: string; room: GameRoom }) => {
      if (socket.id) {
        dispatch({ type: 'SET_CURRENT_PLAYER', payload: socket.id });
      }
      dispatch({ type: 'SET_ROOM', payload: data.room });
      // Update URL with room ID
      const url = new URL(window.location.href);
      url.searchParams.set('room', data.roomId);
      window.history.pushState({}, '', url.toString());
      // Store password if provided
      const tempPassword = sessionStorage.getItem('ludo_temp_password');
      if (tempPassword) {
        localStorage.setItem(`ludo_password_${data.roomId}`, tempPassword);
        sessionStorage.removeItem('ludo_temp_password');
      }
    });

    socket.on('room-joined', (data: { room: GameRoom }) => {
      if (socket.id) {
        dispatch({ type: 'SET_CURRENT_PLAYER', payload: socket.id });
      }
      dispatch({ type: 'SET_ROOM', payload: data.room });
      // Update URL with room ID
      const url = new URL(window.location.href);
      url.searchParams.set('room', data.room.roomId);
      window.history.pushState({}, '', url.toString());
    });

    socket.on('player-joined', (data: { room: GameRoom }) => {
      dispatch({ type: 'SET_ROOM', payload: data.room });
    });

    socket.on('player-left', (data: { room: GameRoom }) => {
      dispatch({ type: 'SET_ROOM', payload: data.room });
    });

    socket.on('game-started', (data: { room: GameRoom }) => {
      dispatch({ type: 'SET_ROOM', payload: data.room });
    });

    socket.on('game-state-updated', (data: { room: GameRoom }) => {
      dispatch({ type: 'SET_ROOM', payload: data.room });
    });

    socket.on('dice-rolling-started', () => {
      // All players see the dice rolling animation
      dispatch({ type: 'SET_ROLLING_DICE', payload: true });
    });

    socket.on('dice-rolled', (data: { diceValue: number; room: GameRoom }) => {
      // Stop rolling animation - result is ready
      dispatch({ type: 'SET_ROLLING_DICE', payload: false });
      
      dispatch({ type: 'SET_ROOM', payload: data.room });
      // Calculate valid moves for current player
      if (data.room.isPlayerTurn && data.room.currentPlayer && socket.id && socket.id === data.room.currentPlayer.id) {
        const validMoves = calculateValidMoves(data.room.currentPlayer, data.diceValue);
        dispatch({ type: 'SET_VALID_MOVES', payload: validMoves });
        
        // Auto-end turn if no valid moves
        if (validMoves.length === 0) {
          setTimeout(() => {
            socket.emit('end-turn');
          }, 1500); // Give user time to see they have no moves
        }
      } else {
        dispatch({ type: 'SET_VALID_MOVES', payload: [] });
      }
    });

    socket.on('token-moved', (data: { room: GameRoom }) => {
      dispatch({ type: 'SET_ROOM', payload: data.room });
      dispatch({ type: 'SET_VALID_MOVES', payload: [] });
    });

    socket.on('turn-ended', (data: { room: GameRoom }) => {
      dispatch({ type: 'SET_ROOM', payload: data.room });
      dispatch({ type: 'SET_VALID_MOVES', payload: [] });
    });

    socket.on('game-finished', (data: { room: GameRoom }) => {
      dispatch({ type: 'SET_ROOM', payload: data.room });
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const createRoom = (nickname: string, password?: string) => {
    if (state.socket) {
      // Store nickname in localStorage
      localStorage.setItem('ludo_nickname', nickname);
      // Store password temporarily to use after room creation
      if (password) {
        sessionStorage.setItem('ludo_temp_password', password);
      }
      state.socket.emit('create-room', { nickname, password });
    }
  };

  const joinRoom = (roomId: string, nickname: string, password?: string) => {
    if (state.socket) {
      // Store nickname and password in localStorage
      localStorage.setItem('ludo_nickname', nickname);
      if (password) {
        localStorage.setItem(`ludo_password_${roomId.toUpperCase()}`, password);
      }
      state.socket.emit('join-room', { roomId, nickname, password });
    }
  };

  const leaveRoom = () => {
    if (state.socket && state.room) {
      state.socket.emit('leave-room', { roomId: state.room.roomId });
      dispatch({ type: 'CLEAR_ROOM' });
      // Remove room ID from URL
      const url = new URL(window.location.href);
      url.searchParams.delete('room');
      window.history.pushState({}, '', url.toString());
    }
  };

  const startGame = () => {
    if (state.socket) {
      state.socket.emit('start-game');
    }
  };

  const rollDice = () => {
    if (state.socket) {
      // Don't set rolling state here - let the server event control it for all players
      state.socket.emit('roll-dice');
    }
  };

  const moveToken = (tokenId: number) => {
    if (state.socket) {
      state.socket.emit('move-token', { tokenId });
    }
  };

  const endTurn = () => {
    if (state.socket) {
      state.socket.emit('end-turn');
    }
  };

  return (
    <GameContext.Provider
      value={{
        state,
        createRoom,
        joinRoom,
        leaveRoom,
        startGame,
        rollDice,
        moveToken,
        endTurn
      }}
    >
      {children}
    </GameContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useGame() {
  const context = useContext(GameContext);
  if (context === undefined) {
    throw new Error('useGame must be used within a GameProvider');
  }
  return context;
}


