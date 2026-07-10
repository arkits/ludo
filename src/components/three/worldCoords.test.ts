import { describe, it, expect } from 'vitest';
import { pxToWorld, BOARD_HALF } from './worldCoords';

describe('pxToWorld', () => {
  it('maps board center to origin', () => {
    expect(pxToWorld({ x: 300, y: 300 })).toEqual([0, 0, 0]);
  });
  it('maps top-left cell center to the -x/-z corner', () => {
    const [x, y, z] = pxToWorld({ x: 20, y: 20 });
    expect(x).toBeCloseTo(-7);
    expect(y).toBe(0);
    expect(z).toBeCloseTo(-7);
  });
  it('applies elevation', () => {
    expect(pxToWorld({ x: 300, y: 300 }, 0.5)[1]).toBe(0.5);
  });
  it('exports half-board extent', () => {
    expect(BOARD_HALF).toBe(7.5);
  });
});
