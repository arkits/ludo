import type { PlayerColor } from '../types/game';
import { getSquareCoordinates, getHomePosition, getFinishedPosition } from '../utils/boardPositions';
import './Token.css';

interface TokenProps {
  token: {
    id: number;
    position: number;
    isHome: boolean;
    isFinished: boolean;
  };
  color: PlayerColor;
  playerId: string;
  isValidMove: boolean;
  isCurrentPlayer: boolean;
  onClick: (playerId: string, tokenId: number) => void;
}

export default function Token({ token, color, playerId, isValidMove, isCurrentPlayer, onClick }: TokenProps) {
  const getPosition = () => {
    if (token.isHome) {
      // Position in home area
      return getHomePosition(color, token.id);
    }
    if (token.isFinished) {
      // Position in finished area
      return getFinishedPosition(color, token.id);
    }
    // Position on board
    return getSquareCoordinates(token.position, color);
  };

  const position = getPosition();
  const colorClass = `token-${color}`;
  const clickable = isValidMove && isCurrentPlayer;

  return (
    <div
      className={`token ${colorClass} ${clickable ? 'clickable' : ''} ${token.isFinished ? 'finished' : ''}`}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        cursor: clickable ? 'pointer' : 'default'
      }}
      onClick={() => clickable && onClick(playerId, token.id)}
      title={token.isHome ? 'In home' : token.isFinished ? 'Finished' : `Position: ${token.position}`}
    >
      <div className="token-inner" />
    </div>
  );
}


