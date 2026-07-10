import type { PlayerColor } from '../../types/game';

export const BOARD_TOP = 0.15; // y of the playing surface

export const TOKEN_COLORS: Record<PlayerColor, { main: string; dark: string; light: string }> = {
  red: { main: '#e74c3c', dark: '#c0392b', light: '#f5b7b1' },
  green: { main: '#27ae60', dark: '#1e8449', light: '#a9dfbf' },
  yellow: { main: '#f1c40f', dark: '#d4ac0d', light: '#f9e79f' },
  blue: { main: '#3498db', dark: '#2980b9', light: '#aed6f1' },
};

export interface CellSpec {
  key: string;
  col: number; // 0..14 grid
  row: number;
  color: string;
  kind: 'track' | 'homeCol' | 'start' | 'safe';
  arrow?: 'up' | 'down' | 'left' | 'right';
}

// Mirrors the SVG layout in the legacy GameBoard: the cross of track cells,
// four home columns, start cells with arrows, safe-star cells.
export function buildCells(): CellSpec[] {
  const cells: CellSpec[] = [];
  const paper = '#f7f3e3';
  const push = (
    col: number,
    row: number,
    color: string,
    kind: CellSpec['kind'],
    arrow?: CellSpec['arrow']
  ) => cells.push({ key: `${col}-${row}`, col, row, color, kind, arrow });

  // Vertical arms (cols 6..8, rows 0..5 and 9..14)
  for (let row = 0; row < 6; row++) {
    push(6, row, row === 1 ? TOKEN_COLORS.red.main : paper, row === 1 ? 'start' : 'track', row === 1 ? 'right' : undefined);
    if (row > 0) push(7, row, TOKEN_COLORS.red.main, 'homeCol');
    push(8, row, paper, 'track');
  }
  for (let row = 9; row < 15; row++) {
    push(6, row, paper, 'track');
    if (row < 14) push(7, row, TOKEN_COLORS.yellow.main, 'homeCol');
    push(8, row, row === 13 ? TOKEN_COLORS.yellow.main : paper, row === 13 ? 'start' : 'track', row === 13 ? 'left' : undefined);
  }
  // Horizontal arms (rows 6..8, cols 0..5 and 9..14)
  for (let col = 0; col < 6; col++) {
    push(col, 6, paper, 'track');
    if (col > 0) push(col, 7, TOKEN_COLORS.blue.main, 'homeCol');
    push(col, 8, col === 1 ? TOKEN_COLORS.blue.main : paper, col === 1 ? 'start' : 'track', col === 1 ? 'up' : undefined);
  }
  for (let col = 9; col < 15; col++) {
    push(col, 6, col === 13 ? TOKEN_COLORS.green.main : paper, col === 13 ? 'start' : 'track', col === 13 ? 'down' : undefined);
    if (col < 14) push(col, 7, TOKEN_COLORS.green.main, 'homeCol');
    push(col, 8, paper, 'track');
  }
  // Arm-end corner cells the loops above skip (track positions 11, 24, 37, 50)
  push(7, 0, paper, 'track');
  push(14, 7, paper, 'track');
  push(7, 14, paper, 'track');
  push(0, 7, paper, 'track');

  // Safe cells get stars (same squares as the SVG board)
  const safes: Array<[number, number]> = [[2, 6], [8, 2], [12, 8], [6, 12]];
  for (const [c, r] of safes) {
    const cell = cells.find((x) => x.col === c && x.row === r);
    if (cell) cell.kind = 'safe';
  }
  return cells;
}

export const HOME_BASES: Array<{ color: PlayerColor; col: number; row: number }> = [
  { color: 'red', col: 0, row: 0 },
  { color: 'green', col: 9, row: 0 },
  { color: 'blue', col: 0, row: 9 },
  { color: 'yellow', col: 9, row: 9 },
];
