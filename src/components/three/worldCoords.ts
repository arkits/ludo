const PX_PER_CELL = 40;
const BOARD_PX = 600;

export const CELL = 1;
export const BOARD_HALF = BOARD_PX / PX_PER_CELL / 2; // 7.5

export function pxToWorld(
  p: { x: number; y: number },
  yUp = 0
): [number, number, number] {
  return [(p.x - BOARD_PX / 2) / PX_PER_CELL, yUp, (p.y - BOARD_PX / 2) / PX_PER_CELL];
}
