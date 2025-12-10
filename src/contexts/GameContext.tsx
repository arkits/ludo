import { createContext, useContext, useEffect, useReducer, useState, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { GameRoom, Player } from '../types/game';
import { calculateValidMoves } from '../utils/gameLogic';
import type { Doc } from '../../convex/_generated/dataModel';

// Generate or retrieve player ID
function getOrCreatePlayerId(): string {
  let playerId = localStorage.getItem('ludo_playerId');
  if (!playerId) {
    playerId = crypto.randomUUID();
    localStorage.setItem('ludo_playerId', playerId);
  }
  return playerId;
}

interface GameState {
  room: GameRoom | null;
  currentPlayerId: string | null;
  error: string | null;
  validMoves: number[];
  isRollingDice: boolean;
  roomId: string | null;
}

type GameAction =
  | { type: 'SET_ROOM'; payload: GameRoom | null }
  | { type: 'SET_CURRENT_PLAYER'; payload: string }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_VALID_MOVES'; payload: number[] }
  | { type: 'SET_ROLLING_DICE'; payload: boolean }
  | { type: 'SET_ROOM_ID'; payload: string | null }
  | { type: 'CLEAR_ROOM' };

interface GameContextType {
  state: GameState;
  createRoom: (nickname: string, password?: string) => Promise<void>;
  joinRoom: (roomId: string, nickname: string, password?: string) => Promise<void>;
  leaveRoom: () => Promise<void>;
  startGame: () => Promise<void>;
  rollDice: () => Promise<void>;
  moveToken: (tokenId: number) => Promise<void>;
  endTurn: () => Promise<void>;
  updatePlayer: (nickname?: string, color?: 'red' | 'blue' | 'green' | 'yellow') => Promise<void>;
  addBot: () => Promise<void>;
  removeBot: (botPlayerId: string) => Promise<void>;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'SET_ROOM':
      return { ...state, room: action.payload, error: null };
    case 'SET_CURRENT_PLAYER':
      return { ...state, currentPlayerId: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'SET_VALID_MOVES':
      return { ...state, validMoves: action.payload };
    case 'SET_ROLLING_DICE':
      return { ...state, isRollingDice: action.payload };
    case 'SET_ROOM_ID':
      return { ...state, roomId: action.payload };
    case 'CLEAR_ROOM':
      return { ...state, room: null, validMoves: [], isRollingDice: false, roomId: null };
    default:
      return state;
  }
}

const initialState: GameState = {
  room: null,
  currentPlayerId: null,
  error: null,
  validMoves: [],
  isRollingDice: false,
  roomId: null,
};

// Transform Convex data to GameRoom format
function transformRoomData(
  roomData: Doc<"rooms"> | null | undefined,
  players: Doc<"players">[] | null | undefined,
  currentPlayerId: string | null
): GameRoom | null {
  if (!roomData || !players) return null;

  const transformedPlayers: Player[] = players.map((p) => ({
    id: p.playerId,
    nickname: p.nickname,
    color: p.color,
    tokens: p.tokens,
    isReady: p.isReady,
    isBot: p.isBot ?? false,
  }));

  const currentPlayer = transformedPlayers[roomData.currentPlayerIndex] || null;
  const isPlayerTurn = currentPlayer?.id === currentPlayerId;

  const winner = roomData.winnerId
    ? transformedPlayers.find((p) => p.id === roomData.winnerId) || null
    : null;

  return {
    roomId: roomData.roomId,
    maxPlayers: roomData.maxPlayers,
    players: transformedPlayers,
    gameState: roomData.gameState,
    currentPlayerIndex: roomData.currentPlayerIndex,
    diceValue: roomData.diceValue,
    hasRolledDice: roomData.hasRolledDice,
    lastMove: roomData.lastMove,
    moveHistory: roomData.moveHistory ?? [],
    winner,
    isPlayerTurn,
    currentPlayer,
  };
}

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(gameReducer, initialState);
  const [playerId] = useState(() => getOrCreatePlayerId());

  // Get roomId from URL or state
  const urlParams = new URLSearchParams(window.location.search);
  const roomIdFromUrl = urlParams.get('room');
  const currentRoomId = state.roomId || roomIdFromUrl;

  // Query room data
  const roomData = useQuery(
    api.rooms.getRoom,
    currentRoomId ? { roomId: currentRoomId } : 'skip'
  );

  // Mutations
  const createRoomMutation = useMutation(api.rooms.createRoom);
  const joinRoomMutation = useMutation(api.rooms.joinRoom);
  const leaveRoomMutation = useMutation(api.rooms.leaveRoom);
  const startGameMutation = useMutation(api.rooms.startGame);
  const updatePlayerMutation = useMutation(api.rooms.updatePlayer);
  const addBotMutation = useMutation(api.rooms.addBot);
  const removeBotMutation = useMutation(api.rooms.removeBot);
  const rollDiceMutation = useMutation(api.game.rollDiceMutation);
  const moveTokenMutation = useMutation(api.game.moveTokenMutation);
  const endTurnMutation = useMutation(api.game.endTurn);

  // Refs for functions to avoid dependency issues
  const endTurnRef = useRef<(() => Promise<void>) | null>(null);
  const joinRoomRef = useRef<((roomId: string, nickname: string, password?: string) => Promise<void>) | null>(null);

  // Set current player ID
  useEffect(() => {
    dispatch({ type: 'SET_CURRENT_PLAYER', payload: playerId });
  }, [playerId]);

  // Transform and set room data when it changes
  useEffect(() => {
    if (roomData) {
      const transformed = transformRoomData(roomData.room, roomData.players, playerId);
      
      // Check if player is already in the room (for reconnection scenarios)
      const isPlayerInRoom = roomData.players.some((p) => p.playerId === playerId);
      
      // Only set room if player is already in it (they've explicitly joined before)
      // OR if we already have a roomId set (meaning they just joined via the form)
      if (isPlayerInRoom || state.roomId) {
        dispatch({ type: 'SET_ROOM', payload: transformed });
        // Set roomId if we have it from URL and player is in room
        if (!state.roomId && roomIdFromUrl && isPlayerInRoom) {
          dispatch({ type: 'SET_ROOM_ID', payload: roomIdFromUrl });
        }
      } else {
        // Player is not in room - don't show room, let them use the Lobby form
        dispatch({ type: 'SET_ROOM', payload: null });
      }

      // Calculate valid moves for current player (only if player is in room)
      if (isPlayerInRoom && transformed && transformed.isPlayerTurn && transformed.currentPlayer && transformed.hasRolledDice) {
        const validMoves = calculateValidMoves(transformed.currentPlayer, transformed.diceValue);
        dispatch({ type: 'SET_VALID_MOVES', payload: validMoves });

        // Auto-end turn if no valid moves
        if (validMoves.length === 0 && transformed.diceValue !== 6) {
          setTimeout(() => {
            if (transformed && endTurnRef.current) {
              endTurnRef.current();
            }
          }, 1500);
        }
      } else {
        dispatch({ type: 'SET_VALID_MOVES', payload: [] });
      }
    } else if (currentRoomId) {
      // Room query returned null but we have a roomId - room might not exist
      dispatch({ type: 'SET_ROOM', payload: null });
    }
  }, [roomData, playerId, currentRoomId, endTurnRef, roomIdFromUrl, state.roomId]);

  const createRoom = useCallback(async (nickname: string, password?: string) => {
    try {
      // Store nickname
      localStorage.setItem('ludo_nickname', nickname);
      if (password) {
        sessionStorage.setItem('ludo_temp_password', password);
      }

      const result = await createRoomMutation({
        nickname,
        password: password || null,
        playerId,
      });

      if (result.roomId) {
        dispatch({ type: 'SET_ROOM_ID', payload: result.roomId });
        // Update URL
        const url = new URL(window.location.href);
        url.searchParams.set('room', result.roomId);
        window.history.pushState({}, '', url.toString());
        // Store password if provided
        if (password) {
          localStorage.setItem(`ludo_password_${result.roomId}`, password);
          sessionStorage.removeItem('ludo_temp_password');
        }
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      dispatch({ type: 'SET_ERROR', payload: errorMessage || 'Failed to create room' });
      setTimeout(() => {
        dispatch({ type: 'SET_ERROR', payload: null });
      }, 5000);
    }
  }, [createRoomMutation, playerId]);

  const joinRoom = useCallback(async (roomId: string, nickname: string, password?: string) => {
    try {
      // Store nickname and password
      localStorage.setItem('ludo_nickname', nickname);
      if (password) {
        localStorage.setItem(`ludo_password_${roomId.toUpperCase()}`, password);
      }

      const result = await joinRoomMutation({
        roomId: roomId.toUpperCase(),
        nickname,
        password: password || null,
        playerId,
      });

      if (result.success) {
        dispatch({ type: 'SET_ROOM_ID', payload: roomId.toUpperCase() });
        // Update URL
        const url = new URL(window.location.href);
        url.searchParams.set('room', roomId.toUpperCase());
        window.history.pushState({}, '', url.toString());
      } else {
        dispatch({ type: 'SET_ERROR', payload: result.error });
        setTimeout(() => {
          dispatch({ type: 'SET_ERROR', payload: null });
        }, 5000);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      dispatch({ type: 'SET_ERROR', payload: errorMessage || 'Failed to join room' });
      setTimeout(() => {
        dispatch({ type: 'SET_ERROR', payload: null });
      }, 5000);
    }
  }, [joinRoomMutation, playerId]);

  // Update ref
  useEffect(() => {
    joinRoomRef.current = joinRoom;
  }, [joinRoom]);

  const leaveRoom = useCallback(async () => {
    if (!state.roomId) return;

    try {
      await leaveRoomMutation({
        roomId: state.roomId,
        playerId,
      });

      dispatch({ type: 'CLEAR_ROOM' });
      // Remove room ID from URL
      const url = new URL(window.location.href);
      url.searchParams.delete('room');
      window.history.pushState({}, '', url.toString());
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      dispatch({ type: 'SET_ERROR', payload: errorMessage || 'Failed to leave room' });
      setTimeout(() => {
        dispatch({ type: 'SET_ERROR', payload: null });
      }, 5000);
    }
  }, [leaveRoomMutation, state.roomId, playerId]);

  const startGame = useCallback(async () => {
    if (!state.roomId) return;

    try {
      const result = await startGameMutation({
        roomId: state.roomId,
        playerId,
      });

      if (!result.success) {
        dispatch({ type: 'SET_ERROR', payload: result.error });
        setTimeout(() => {
          dispatch({ type: 'SET_ERROR', payload: null });
        }, 5000);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      dispatch({ type: 'SET_ERROR', payload: errorMessage || 'Failed to start game' });
      setTimeout(() => {
        dispatch({ type: 'SET_ERROR', payload: null });
      }, 5000);
    }
  }, [startGameMutation, state.roomId, playerId]);

  const rollDice = useCallback(async () => {
    if (!state.roomId) return;

    try {
      // Start rolling animation
      dispatch({ type: 'SET_ROLLING_DICE', payload: true });

      const result = await rollDiceMutation({
        roomId: state.roomId,
        playerId,
      });

      // Stop rolling animation after a delay (simulate server delay)
      setTimeout(() => {
        dispatch({ type: 'SET_ROLLING_DICE', payload: false });
      }, 1200);

      if (!result.success) {
        dispatch({ type: 'SET_ROLLING_DICE', payload: false });
        dispatch({ type: 'SET_ERROR', payload: result.error });
        setTimeout(() => {
          dispatch({ type: 'SET_ERROR', payload: null });
        }, 5000);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      dispatch({ type: 'SET_ROLLING_DICE', payload: false });
      dispatch({ type: 'SET_ERROR', payload: errorMessage || 'Failed to roll dice' });
      setTimeout(() => {
        dispatch({ type: 'SET_ERROR', payload: null });
      }, 5000);
    }
  }, [rollDiceMutation, state.roomId, playerId]);

  const moveToken = useCallback(async (tokenId: number) => {
    if (!state.roomId) return;

    try {
      const result = await moveTokenMutation({
        roomId: state.roomId,
        playerId,
        tokenId,
      });

      if (!result.success) {
        dispatch({ type: 'SET_ERROR', payload: result.error });
        setTimeout(() => {
          dispatch({ type: 'SET_ERROR', payload: null });
        }, 5000);
      } else {
        // Clear valid moves after moving
        dispatch({ type: 'SET_VALID_MOVES', payload: [] });
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      dispatch({ type: 'SET_ERROR', payload: errorMessage || 'Failed to move token' });
      setTimeout(() => {
        dispatch({ type: 'SET_ERROR', payload: null });
      }, 5000);
    }
  }, [moveTokenMutation, state.roomId, playerId]);

  const endTurn = useCallback(async () => {
    if (!state.roomId) return;

    try {
      const result = await endTurnMutation({
        roomId: state.roomId,
        playerId,
      });

      if (!result.success) {
        dispatch({ type: 'SET_ERROR', payload: result.error });
        setTimeout(() => {
          dispatch({ type: 'SET_ERROR', payload: null });
        }, 5000);
      } else {
        // Clear valid moves after ending turn
        dispatch({ type: 'SET_VALID_MOVES', payload: [] });
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      dispatch({ type: 'SET_ERROR', payload: errorMessage || 'Failed to end turn' });
      setTimeout(() => {
        dispatch({ type: 'SET_ERROR', payload: null });
      }, 5000);
    }
  }, [endTurnMutation, state.roomId, playerId]);

  // Update ref
  useEffect(() => {
    endTurnRef.current = endTurn;
  }, [endTurn]);

  const updatePlayer = useCallback(async (nickname?: string, color?: 'red' | 'blue' | 'green' | 'yellow') => {
    if (!state.roomId) return;

    try {
      const result = await updatePlayerMutation({
        roomId: state.roomId,
        playerId,
        nickname,
        color,
      });

      if (!result.success) {
        dispatch({ type: 'SET_ERROR', payload: result.error });
        setTimeout(() => {
          dispatch({ type: 'SET_ERROR', payload: null });
        }, 5000);
      } else {
        // Update localStorage if nickname changed
        if (nickname) {
          localStorage.setItem('ludo_nickname', nickname);
        }
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      dispatch({ type: 'SET_ERROR', payload: errorMessage || 'Failed to update player' });
      setTimeout(() => {
        dispatch({ type: 'SET_ERROR', payload: null });
      }, 5000);
    }
  }, [updatePlayerMutation, state.roomId, playerId]);

  const addBot = useCallback(async () => {
    if (!state.roomId) return;

    try {
      const result = await addBotMutation({
        roomId: state.roomId,
        playerId,
      });

      if (!result.success) {
        dispatch({ type: 'SET_ERROR', payload: result.error });
        setTimeout(() => {
          dispatch({ type: 'SET_ERROR', payload: null });
        }, 5000);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      dispatch({ type: 'SET_ERROR', payload: errorMessage || 'Failed to add bot' });
      setTimeout(() => {
        dispatch({ type: 'SET_ERROR', payload: null });
      }, 5000);
    }
  }, [addBotMutation, state.roomId, playerId]);

  const removeBot = useCallback(async (botPlayerId: string) => {
    if (!state.roomId) return;

    try {
      const result = await removeBotMutation({
        roomId: state.roomId,
        playerId,
        botPlayerId,
      });

      if (!result.success) {
        dispatch({ type: 'SET_ERROR', payload: result.error });
        setTimeout(() => {
          dispatch({ type: 'SET_ERROR', payload: null });
        }, 5000);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      dispatch({ type: 'SET_ERROR', payload: errorMessage || 'Failed to remove bot' });
      setTimeout(() => {
        dispatch({ type: 'SET_ERROR', payload: null });
      }, 5000);
    }
  }, [removeBotMutation, state.roomId, playerId]);

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
        endTurn,
        updatePlayer,
        addBot,
        removeBot,
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
