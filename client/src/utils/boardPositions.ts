import type { PlayerColor } from '../types/game';

const BOARD_SIZE = 600;
const CELL_SIZE = BOARD_SIZE / 15; // 40px per cell
const HOME_BASE_SIZE = CELL_SIZE * 6; // 240px

// Classic Ludo board layout (15x15 grid):
// - 52 squares in a cross-shaped path
// - Red: top-left corner, starts at position 0
// - Green: top-right corner, starts at position 13  
// - Yellow: bottom-right corner, starts at position 26
// - Blue: bottom-left corner, starts at position 39
// - Each color has 5 squares in their home column leading to center

// Main track positions (52 squares, clockwise starting from red's starting square)
// The track forms a loop around the board on the outer edge of the cross

// Helper to convert grid coordinates to pixel coordinates (center of cell)
function gridToPixel(col: number, row: number): { x: number; y: number } {
  return {
    x: col * CELL_SIZE + CELL_SIZE / 2,
    y: row * CELL_SIZE + CELL_SIZE / 2
  };
}

// Pre-computed track positions for a standard 52-square Ludo path
// Following clockwise direction starting from red's entry point
const TRACK_POSITIONS: Array<{ x: number; y: number }> = (() => {
  const positions: Array<{ x: number; y: number }> = [];
  
  // Red's path segment (positions 0-12): from red start going up and around to green's area
  // Position 0: Red start square (col 1, row 6)
  positions.push(gridToPixel(1, 6)); // 0 - Red start
  positions.push(gridToPixel(2, 6)); // 1
  positions.push(gridToPixel(3, 6)); // 2
  positions.push(gridToPixel(4, 6)); // 3
  positions.push(gridToPixel(5, 6)); // 4
  positions.push(gridToPixel(6, 5)); // 5
  positions.push(gridToPixel(6, 4)); // 6
  positions.push(gridToPixel(6, 3)); // 7
  positions.push(gridToPixel(6, 2)); // 8
  positions.push(gridToPixel(6, 1)); // 9
  positions.push(gridToPixel(6, 0)); // 10
  positions.push(gridToPixel(7, 0)); // 11
  positions.push(gridToPixel(8, 0)); // 12
  
  // Green's path segment (positions 13-25): from green start going right and down
  positions.push(gridToPixel(8, 1)); // 13 - Green start
  positions.push(gridToPixel(8, 2)); // 14
  positions.push(gridToPixel(8, 3)); // 15
  positions.push(gridToPixel(8, 4)); // 16
  positions.push(gridToPixel(8, 5)); // 17
  positions.push(gridToPixel(9, 6)); // 18
  positions.push(gridToPixel(10, 6)); // 19
  positions.push(gridToPixel(11, 6)); // 20
  positions.push(gridToPixel(12, 6)); // 21
  positions.push(gridToPixel(13, 6)); // 22
  positions.push(gridToPixel(14, 6)); // 23
  positions.push(gridToPixel(14, 7)); // 24
  positions.push(gridToPixel(14, 8)); // 25
  
  // Yellow's path segment (positions 26-38): from yellow start going down and left
  positions.push(gridToPixel(13, 8)); // 26 - Yellow start
  positions.push(gridToPixel(12, 8)); // 27
  positions.push(gridToPixel(11, 8)); // 28
  positions.push(gridToPixel(10, 8)); // 29
  positions.push(gridToPixel(9, 8)); // 30
  positions.push(gridToPixel(8, 9)); // 31
  positions.push(gridToPixel(8, 10)); // 32
  positions.push(gridToPixel(8, 11)); // 33
  positions.push(gridToPixel(8, 12)); // 34
  positions.push(gridToPixel(8, 13)); // 35
  positions.push(gridToPixel(8, 14)); // 36
  positions.push(gridToPixel(7, 14)); // 37
  positions.push(gridToPixel(6, 14)); // 38
  
  // Blue's path segment (positions 39-51): from blue start going left and up
  positions.push(gridToPixel(6, 13)); // 39 - Blue start
  positions.push(gridToPixel(6, 12)); // 40
  positions.push(gridToPixel(6, 11)); // 41
  positions.push(gridToPixel(6, 10)); // 42
  positions.push(gridToPixel(6, 9)); // 43
  positions.push(gridToPixel(5, 8)); // 44
  positions.push(gridToPixel(4, 8)); // 45
  positions.push(gridToPixel(3, 8)); // 46
  positions.push(gridToPixel(2, 8)); // 47
  positions.push(gridToPixel(1, 8)); // 48
  positions.push(gridToPixel(0, 8)); // 49
  positions.push(gridToPixel(0, 7)); // 50
  positions.push(gridToPixel(0, 6)); // 51 - Back to before red start
  
  return positions;
})();

// Home column positions for each color (5 squares leading to center)
const HOME_COLUMNS: Record<PlayerColor, Array<{ x: number; y: number }>> = {
  red: [
    gridToPixel(7, 1),
    gridToPixel(7, 2),
    gridToPixel(7, 3),
    gridToPixel(7, 4),
    gridToPixel(7, 5),
  ],
  green: [
    gridToPixel(13, 7),
    gridToPixel(12, 7),
    gridToPixel(11, 7),
    gridToPixel(10, 7),
    gridToPixel(9, 7),
  ],
  yellow: [
    gridToPixel(7, 13),
    gridToPixel(7, 12),
    gridToPixel(7, 11),
    gridToPixel(7, 10),
    gridToPixel(7, 9),
  ],
  blue: [
    gridToPixel(1, 7),
    gridToPixel(2, 7),
    gridToPixel(3, 7),
    gridToPixel(4, 7),
    gridToPixel(5, 7),
  ],
};

// Starting positions for each color on the main track
export const START_POSITIONS: Record<PlayerColor, number> = {
  red: 0,
  green: 13,
  yellow: 26,
  blue: 39,
};

// Position where each color enters their home column
export const HOME_ENTRY_POSITIONS: Record<PlayerColor, number> = {
  red: 51,   // After completing the track, enters home at position 51
  green: 12, // After position 12, enters home
  yellow: 25, // After position 25, enters home
  blue: 38,  // After position 38, enters home
};

export function getSquareCoordinates(position: number, color?: PlayerColor): { x: number; y: number } {
  if (position < 0) {
    return { x: 0, y: 0 }; // Invalid position
  }

  // Home column positions (52-56 for each color)
  if (position >= 52 && position <= 56 && color) {
    const homeIndex = position - 52;
    if (homeIndex < HOME_COLUMNS[color].length) {
      return HOME_COLUMNS[color][homeIndex];
    }
    // Finished - return center
    return gridToPixel(7.5, 7.5);
  }

  // Main track position
  if (position < 52) {
    return TRACK_POSITIONS[position];
  }

  // Default to center
  return gridToPixel(7.5, 7.5);
}

export function getHomePosition(color: PlayerColor, tokenId: number): { x: number; y: number } {
  // Home base positions (2x2 grid in corner bases)
  const basePositions: Record<PlayerColor, { x: number; y: number }> = {
    red: { x: HOME_BASE_SIZE / 2, y: HOME_BASE_SIZE / 2 },
    green: { x: BOARD_SIZE - HOME_BASE_SIZE / 2, y: HOME_BASE_SIZE / 2 },
    blue: { x: HOME_BASE_SIZE / 2, y: BOARD_SIZE - HOME_BASE_SIZE / 2 },
    yellow: { x: BOARD_SIZE - HOME_BASE_SIZE / 2, y: BOARD_SIZE - HOME_BASE_SIZE / 2 },
  };

  const offsets = [
    { x: -CELL_SIZE * 0.8, y: -CELL_SIZE * 0.8 },
    { x: CELL_SIZE * 0.8, y: -CELL_SIZE * 0.8 },
    { x: -CELL_SIZE * 0.8, y: CELL_SIZE * 0.8 },
    { x: CELL_SIZE * 0.8, y: CELL_SIZE * 0.8 },
  ];

  const base = basePositions[color];
  const offset = offsets[tokenId] || offsets[0];

  return {
    x: base.x + offset.x,
    y: base.y + offset.y,
  };
}

export function getFinishedPosition(color: PlayerColor, tokenId: number): { x: number; y: number } {
  // Finished tokens arranged in center area
  const centerX = BOARD_SIZE / 2;
  const centerY = BOARD_SIZE / 2;
  
  // Offset based on color to place in the correct triangle
  const colorOffsets: Record<PlayerColor, { x: number; y: number }> = {
    red: { x: 0, y: -CELL_SIZE * 0.5 },
    green: { x: CELL_SIZE * 0.5, y: 0 },
    yellow: { x: 0, y: CELL_SIZE * 0.5 },
    blue: { x: -CELL_SIZE * 0.5, y: 0 },
  };

  const colorOffset = colorOffsets[color];
  
  // Small offset for each token to avoid overlap
  const tokenOffsets = [
    { x: -5, y: -5 },
    { x: 5, y: -5 },
    { x: -5, y: 5 },
    { x: 5, y: 5 },
  ];
  const tokenOffset = tokenOffsets[tokenId] || tokenOffsets[0];

  return {
    x: centerX + colorOffset.x + tokenOffset.x,
    y: centerY + colorOffset.y + tokenOffset.y,
  };
}

// Convert a position to the actual track position for a given color
export function getTrackPosition(color: PlayerColor, steps: number): number {
  const startPos = START_POSITIONS[color];
  return (startPos + steps) % 52;
}

// Check if a position is a safe square
export function isSafePosition(position: number): boolean {
  // Safe squares: start positions and star squares
  const safePositions = [0, 8, 13, 21, 26, 34, 39, 47];
  return safePositions.includes(position % 52);
}
