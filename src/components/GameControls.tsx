import { useEffect, useState, useRef } from 'react';
import './GameControls.css';

import Dice from './Dice';

interface GameControlsProps {
  hasRolledDice: boolean;
  isPlayerTurn: boolean;
  canEndTurn: boolean;
  isRollingDice: boolean;
  diceValue: number;
  validMoves: number[];
  onRollDice: () => void;
  onEndTurn: () => void;
  onStartGame: () => void;
  onMoveToken: (tokenId: number) => void;
  gameState: 'waiting' | 'playing' | 'finished';
  isRoomCreator: boolean;
  canStartGame: boolean;
}

export default function GameControls({
  hasRolledDice,
  isPlayerTurn,
  canEndTurn,
  isRollingDice,
  diceValue,
  validMoves,
  onRollDice,
  onEndTurn,
  onStartGame,
  onMoveToken,
  gameState,
  isRoomCreator,
  canStartGame
}: GameControlsProps) {
  const [opponentRolling, setOpponentRolling] = useState(false);
  const [autoMoveEnabled, setAutoMoveEnabled] = useState(false);
  const prevHasRolledRef = useRef(hasRolledDice);
  const rollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-move logic
  useEffect(() => {
    if (autoMoveEnabled && isPlayerTurn && hasRolledDice && !isRollingDice && validMoves.length > 0) {
      // Small delay to let user see the number
      const timer = setTimeout(() => {
        // Simple heuristic: move the first valid token. 
        // In a real game, you might want more complex logic or UI preference (e.g. safest move)
        // For now, this fulfills "tokens will automatically get moved"
        onMoveToken(validMoves[0]);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [autoMoveEnabled, isPlayerTurn, hasRolledDice, isRollingDice, validMoves, onMoveToken]);

  // Trigger animation when opponent rolls
  useEffect(() => {
    if (!isPlayerTurn && !prevHasRolledRef.current && hasRolledDice) {
      // Clear any existing timer to restart animation for new roll
      if (rollTimerRef.current) {
        clearTimeout(rollTimerRef.current);
      }

      setOpponentRolling(true);
      rollTimerRef.current = setTimeout(() => {
        setOpponentRolling(false);
        rollTimerRef.current = null;
      }, 1200);
    }
    prevHasRolledRef.current = hasRolledDice;
  }, [hasRolledDice, isPlayerTurn]);

  // Cleanup timer on unmount only
  useEffect(() => {
    return () => {
      if (rollTimerRef.current) {
        clearTimeout(rollTimerRef.current);
      }
    };
  }, []);

  // Handle spacebar to roll dice during gameplay
  useEffect(() => {
    if (gameState !== 'playing') return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't trigger if user is typing in an input, textarea, or other editable element
      const target = event.target as HTMLElement;
      const isEditableElement =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      if (isEditableElement) return;

      // Trigger spacebar actions
      if (event.code === 'Space') {
        if (isPlayerTurn && !hasRolledDice && !isRollingDice) {
          event.preventDefault();
          onRollDice();
        } else if (isPlayerTurn && hasRolledDice && canEndTurn) {
          event.preventDefault();
          onEndTurn();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [gameState, isPlayerTurn, hasRolledDice, isRollingDice, canEndTurn, onRollDice, onEndTurn]);

  if (gameState === 'waiting') {
    return (
      <div className="game-controls waiting">
        {isRoomCreator && canStartGame && (
          <button className="start-game-btn" onClick={onStartGame}>
            Start Game
          </button>
        )}
        {!canStartGame && (
          <p className="waiting-message">Waiting for players to join...</p>
        )}
        {!isRoomCreator && canStartGame && (
          <p className="waiting-message">Waiting for host to start game</p>
        )}
      </div>
    );
  }

  if (gameState === 'finished') {
    return (
      <div className="game-controls finished">
        <p className="game-finished">Game Finished!</p>
      </div>
    );
  }

  return (
    <div className="game-controls playing">
      <div className="controls-content">
        <div className="dice-section">
          <Dice value={diceValue} isRolling={isRollingDice || opponentRolling} show={true} />
        </div>

        <div className="actions-section">
          {isPlayerTurn && (!hasRolledDice || isRollingDice) && (
            <div className="action-group">
              <button
                className="roll-dice-btn"
                onClick={onRollDice}
                disabled={isRollingDice}
                title="Press Space"
              >
                {isRollingDice ? 'Rolling...' : <>Roll Dice <span className="key-hint">SPACE</span></>}
              </button>
            </div>
          )}

          {isPlayerTurn && hasRolledDice && !isRollingDice && !canEndTurn && (
            <p className="instruction-text">Move your token</p>
          )}

          {isPlayerTurn && hasRolledDice && !isRollingDice && canEndTurn && (
            <button className="end-turn-btn" onClick={onEndTurn} title="Press Space">
              End Turn <span className="key-hint">SPACE</span>
            </button>
          )}

          {!isPlayerTurn && (
            <p className="wait-turn-message">Waiting for opponent...</p>
          )}

          <div className="auto-move-toggle">
            <label className="switch">
              <input
                type="checkbox"
                checked={autoMoveEnabled}
                onChange={(e) => setAutoMoveEnabled(e.target.checked)}
              />
              <span className="slider round"></span>
            </label>
            <span className="toggle-label">Auto Move</span>
          </div>
        </div>
      </div>
    </div>
  );
}
