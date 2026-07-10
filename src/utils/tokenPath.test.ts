import { describe, it, expect } from 'vitest';
import { computePathPlan, nextStep } from './tokenPath';
import { getSquareCoordinates, getHomePosition } from './boardPositions';

const t = (position: number, isHome = false, isFinished = false) =>
  ({ id: 0, position, isHome, isFinished });

describe('nextStep', () => {
  it('advances along the track', () => {
    expect(nextStep('red', 5)).toBe(6);
  });
  it('wraps the track at 51', () => {
    expect(nextStep('blue', 51)).toBe(0);
  });
  it('enters the home column at the color home entry', () => {
    expect(nextStep('red', 51)).toBe(52);
    expect(nextStep('blue', 12)).toBe(52);
  });
  it('advances within the home column', () => {
    expect(nextStep('green', 54)).toBe(55);
  });
});

describe('computePathPlan', () => {
  it('returns none when nothing changed', () => {
    expect(computePathPlan('red', t(4), t(4)).kind).toBe('none');
  });
  it('hops out of home to the start square', () => {
    const plan = computePathPlan('red', t(-1, true), t(0));
    expect(plan.kind).toBe('hops');
    expect(plan.points).toHaveLength(2);
    expect(plan.points[0]).toEqual(getHomePosition('red', 0));
    expect(plan.points[1]).toEqual(getSquareCoordinates(0, 'red'));
  });
  it('hops through each intermediate square', () => {
    const plan = computePathPlan('red', t(2), t(6));
    expect(plan.kind).toBe('hops');
    // 2 -> 3 -> 4 -> 5 -> 6 : origin + 4 hops
    expect(plan.points).toHaveLength(5);
    expect(plan.points[2]).toEqual(getSquareCoordinates(4, 'red'));
  });
  it('crosses from track into home column', () => {
    const plan = computePathPlan('blue', t(11), t(53));
    // 11 -> 12 -> 52 -> 53
    expect(plan.points).toHaveLength(4);
    expect(plan.points[2]).toEqual(getSquareCoordinates(52, 'blue'));
  });
  it('flies back home when captured', () => {
    const plan = computePathPlan('green', t(20), t(-1, true));
    expect(plan.kind).toBe('fly');
    expect(plan.points).toHaveLength(2);
    expect(plan.points[1]).toEqual(getHomePosition('green', 0));
  });
  it('caps runaway paths defensively', () => {
    const plan = computePathPlan('red', t(0), t(51));
    expect(plan.points.length).toBeLessThanOrEqual(58);
  });
});
