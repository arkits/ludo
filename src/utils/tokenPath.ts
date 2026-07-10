import type { PlayerColor } from '../types/game';
import {
  getSquareCoordinates,
  getHomePosition,
  getFinishedPosition,
  HOME_ENTRY_POSITIONS,
} from './boardPositions';

export interface TokenState {
  id: number;
  position: number;
  isHome: boolean;
  isFinished: boolean;
}

export interface PathPlan {
  kind: 'hops' | 'fly' | 'none';
  points: Array<{ x: number; y: number }>;
}

// One movement step for a color: advance on the 52-square track,
// divert into the home column (52..56, 57 = finished) at the entry square.
export function nextStep(color: PlayerColor, position: number): number {
  if (position >= 52) return position + 1;
  if (position === HOME_ENTRY_POSITIONS[color]) return 52;
  return (position + 1) % 52;
}

function coordsFor(color: PlayerColor, state: TokenState): { x: number; y: number } {
  if (state.isHome) return getHomePosition(color, state.id);
  if (state.isFinished) return getFinishedPosition(color, state.id);
  return getSquareCoordinates(state.position, color);
}

export function computePathPlan(
  color: PlayerColor,
  prev: TokenState,
  next: TokenState
): PathPlan {
  const same =
    prev.isHome === next.isHome &&
    prev.isFinished === next.isFinished &&
    prev.position === next.position;
  if (same) return { kind: 'none', points: [coordsFor(color, next)] };

  const from = coordsFor(color, prev);
  const to = coordsFor(color, next);

  // Captured: fly straight back to the home well.
  if (!prev.isHome && next.isHome) return { kind: 'fly', points: [from, to] };

  // Leaving home: single hop onto the start square.
  if (prev.isHome && !next.isHome) return { kind: 'hops', points: [from, to] };

  // Track/home-column movement: enumerate intermediate squares.
  const points: Array<{ x: number; y: number }> = [from];
  let pos = prev.position;
  const target = next.isFinished ? 57 : next.position;
  let guard = 0;
  while (pos !== target && guard < 57) {
    pos = nextStep(color, pos);
    points.push(pos === 57 && next.isFinished ? to : getSquareCoordinates(pos, color));
    guard++;
  }
  if (pos !== target) return { kind: 'fly', points: [from, to] }; // fallback: snap-fly
  return { kind: 'hops', points };
}
