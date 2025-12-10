import { useState } from 'react';
import type { PlayerColor } from '../types/game';
import './MoveHistory.css';

interface MoveHistoryEntry {
  playerId: string;
  playerNickname: string;
  playerColor: PlayerColor;
  tokenId: number;
  fromPosition: number;
  toPosition: number;
  captured: boolean;
  timestamp: number;
}

interface MoveHistoryProps {
  history: MoveHistoryEntry[];
}

export default function MoveHistory({ history }: MoveHistoryProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Show last 3 moves by default, all when expanded
  const displayedMoves = isExpanded ? history : history.slice(-3);
  const hasMoreMoves = history.length > 3;

  const getMoveDescription = (move: MoveHistoryEntry): string => {
    const from = move.fromPosition === -1 ? 'Home' : `#${move.fromPosition}`;
    const to = move.toPosition === 57 ? 'Finish' : `#${move.toPosition}`;
    
    if (move.captured) {
      return `moved token ${move.tokenId + 1} from ${from} to ${to} and captured an opponent!`;
    }
    return `moved token ${move.tokenId + 1} from ${from} to ${to}`;
  };

  if (history.length === 0) {
    return (
      <div className="move-history">
        <div className="move-history-header">
          <h3>Move History</h3>
        </div>
        <div className="move-history-content">
          <p className="no-moves">No moves yet</p>
        </div>
      </div>
    );
  }

  return (
    <div className="move-history">
      <div 
        className="move-history-header"
        onClick={() => hasMoreMoves && setIsExpanded(!isExpanded)}
        style={{ cursor: hasMoreMoves ? 'pointer' : 'default' }}
      >
        <h3>Move History</h3>
        {hasMoreMoves && (
          <span className={`expand-icon ${isExpanded ? 'expanded' : ''}`}>
            ▼
          </span>
        )}
      </div>
      
      <div className="move-history-content">
        {displayedMoves.length === 0 ? (
          <p className="no-moves">No moves yet</p>
        ) : (
          <div className="moves-list">
            {displayedMoves.map((move, index) => (
              <div key={`${move.timestamp}-${index}`} className={`move-entry player-${move.playerColor}`}>
                <div className="move-player">
                  <div className={`move-color-indicator player-${move.playerColor}`} />
                  <span className="move-player-name">{move.playerNickname}</span>
                </div>
                <p className="move-description">
                  {getMoveDescription(move)}
                  {move.captured && <span className="capture-badge">⚡</span>}
                </p>
              </div>
            ))}
          </div>
        )}
        
        {hasMoreMoves && !isExpanded && history.length > 3 && (
          <div className="show-more-hint">
            Click to see {history.length - 3} more move{history.length - 3 !== 1 ? 's' : ''}
          </div>
        )}
      </div>
    </div>
  );
}
