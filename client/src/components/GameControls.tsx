import Dice from './Dice';
import './GameControls.css';

interface GameControlsProps {
  diceValue: number;
  hasRolledDice: boolean;
  isPlayerTurn: boolean;
  canEndTurn: boolean;
  isRollingDice: boolean;
  onRollDice: () => void;
  onEndTurn: () => void;
  onStartGame: () => void;
  gameState: 'waiting' | 'playing' | 'finished';
  isRoomCreator: boolean;
  canStartGame: boolean;
}

export default function GameControls({
  diceValue,
  hasRolledDice,
  isPlayerTurn,
  canEndTurn,
  isRollingDice,
  onRollDice,
  onEndTurn,
  onStartGame,
  gameState,
  isRoomCreator,
  canStartGame
}: GameControlsProps) {
  if (gameState === 'waiting') {
    return (
      <div className="game-controls">
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
      <div className="game-controls">
        <p className="game-finished">Game Finished!</p>
      </div>
    );
  }

  // Show dice only when rolling or after rolling (has rolled)
  const shouldShowDice = isRollingDice || hasRolledDice;

  return (
    <div className="game-controls">
      {shouldShowDice && (
        <div className="dice-container">
          <Dice value={diceValue} isRolling={isRollingDice} show={true} />
        </div>
      )}
      
      <div className="control-buttons">
        {isPlayerTurn && !hasRolledDice && (
          <button className="roll-dice-btn" onClick={onRollDice}>
            Roll Dice
          </button>
        )}
        
        {isPlayerTurn && hasRolledDice && canEndTurn && (
          <button className="end-turn-btn" onClick={onEndTurn}>
            End Turn
          </button>
        )}
        
        {!isPlayerTurn && (
          <p className="wait-turn-message">Waiting for your turn...</p>
        )}
      </div>
    </div>
  );
}

