import { useEffect, useState } from 'react';
import type { PlayerColor } from '../types/game';
import './TurnBanner.css';

const COLORS: Record<PlayerColor, string> = {
  red: '#e74c3c',
  green: '#27ae60',
  yellow: '#d4ac0d',
  blue: '#3498db',
};

interface Props {
  playerName: string;
  color: PlayerColor;
  isYou: boolean;
}

export default function TurnBanner({ playerName, color, isYou }: Props) {
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setGone(true), 1600);
    return () => clearTimeout(t);
  }, []);
  if (gone) return null;
  return (
    <div className="turn-banner" style={{ ['--turn-color' as string]: COLORS[color] }}>
      <span className="turn-banner-chip" />
      {isYou ? 'Your turn' : `${playerName}'s turn`}
    </div>
  );
}
