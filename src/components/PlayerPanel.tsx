import type { Player } from '../types/game';
import './PlayerPanel.css';

interface PlayerPanelProps {
  player: Player;
  isCurrentTurn: boolean;
  isYou: boolean;
}

export default function PlayerPanel({ player, isCurrentTurn, isYou }: PlayerPanelProps) {
  const finishedCount = player.tokens.filter(t => t.isFinished).length;
  const onBoardCount = player.tokens.filter(t => !t.isHome && !t.isFinished).length;

  return (
    <div className={`player-panel player-${player.color} ${isCurrentTurn ? 'current-turn' : ''}`}>
      <div className="player-header">
        <div className="player-color-indicator" />
        <span className="player-name">
          {player.nickname}
          {isYou && <span className="you-badge">You</span>}
        </span>
        {isCurrentTurn && <span className="turn-indicator">●</span>}
      </div>
      <div className="player-stats">
        <div className="stat">
          <span className="stat-label">Finished:</span>
          <span className="stat-value">{finishedCount}/4</span>
        </div>
        <div className="stat">
          <span className="stat-label">On Board:</span>
          <span className="stat-value">{onBoardCount}</span>
        </div>
      </div>
    </div>
  );
}

