import { describe, it, expect } from 'vitest';
import {
  getValidMoves,
  isPathBlocked,
  wouldJumpOwnTokenInHomeColumn,
  calculateNewPosition,
  moveToken,
  checkCapture,
  SAFE_ZONES,
  HOME_ENTRY,
  type Player,
  type Token,
} from './gameLogic';

function makeToken(id: number, position: number, overrides: Partial<Token> = {}): Token {
  return {
    id,
    position,
    isHome: position === -1,
    isFinished: position === 57,
    ...overrides,
  };
}

function makePlayer(
  playerId: string,
  color: Player['color'],
  tokens: Token[],
  overrides: Partial<Player> = {}
): Player {
  return {
    playerId,
    nickname: playerId,
    color,
    tokens,
    isReady: true,
    playerIndex: 0,
    isBot: false,
    ...overrides,
  };
}

// Pad a token list out to 4 tokens (all parked at home) so player shapes
// look like real in-game players.
function withHomeFiller(tokens: Token[]): Token[] {
  const result = [...tokens];
  for (let id = 0; id < 4; id++) {
    if (!result.some((t) => t.id === id)) {
      result.push(makeToken(id, -1));
    }
  }
  return result.sort((a, b) => a.id - b.id);
}

describe('wouldJumpOwnTokenInHomeColumn (home-entry jump check)', () => {
  it('detects a jump when entering the home column from the main track', () => {
    const player = makePlayer('red', 'red', withHomeFiller([makeToken(0, 54)]));
    // Token 1 moving from main-track position 50 to home-column position 56
    // would pass over token 0 sitting at home-column position 54.
    expect(wouldJumpOwnTokenInHomeColumn(player, 1, 50, 56)).toBe(true);
  });

  it('does not report a jump when nothing is in the way', () => {
    const player = makePlayer('red', 'red', withHomeFiller([]));
    expect(wouldJumpOwnTokenInHomeColumn(player, 1, 50, 56)).toBe(false);
  });

  it('excludes moves in getValidMoves that would jump an own token entering home', () => {
    // Red token 0 already sits in the home column at index 2 (position 54).
    // Red token 1 is on the main track at 50 and rolls a 6, which would
    // land it at home-column index 4 (position 56), jumping over token 0.
    const tokens = withHomeFiller([makeToken(0, 54), makeToken(1, 50)]);
    const red = makePlayer('red', 'red', tokens);
    const validMoves = getValidMoves([red], red, 6);
    expect(validMoves).not.toContain(1);
  });

  it('still applies the same jump check for a move fully inside the home column', () => {
    const player = makePlayer('red', 'red', withHomeFiller([makeToken(0, 54)]));
    // Moving token 1 (also already in the home column) from 52 to 56 would
    // jump over token 0 at 54.
    expect(wouldJumpOwnTokenInHomeColumn(player, 1, 52, 56)).toBe(true);
  });
});

describe('isPathBlocked when entering the home column', () => {
  it('blocks a move that would cross an opponent block on the way to HOME_ENTRY', () => {
    // Red's HOME_ENTRY is 51. A red token at 48 rolling a 6 travels through
    // 49, 50, 51 before turning into the home column. Blue has a block
    // (2+ tokens) sitting on 50, directly in that path.
    const red = makePlayer('red', 'red', withHomeFiller([makeToken(0, 48)]));
    const blue = makePlayer('blue', 'blue', withHomeFiller([makeToken(0, 50), makeToken(1, 50)]));

    expect(isPathBlocked([red, blue], red, 48, 54)).toBe(true);

    const validMoves = getValidMoves([red, blue], red, 6);
    expect(validMoves).not.toContain(0);
  });

  it('allows the move when the main-track path into home is clear', () => {
    const red = makePlayer('red', 'red', withHomeFiller([makeToken(0, 48)]));
    expect(isPathBlocked([red], red, 48, 54)).toBe(false);

    const validMoves = getValidMoves([red], red, 6);
    expect(validMoves).toContain(0);
  });

  it('does not block on a square beyond the color HOME_ENTRY square', () => {
    // Put the "block" one square after red's HOME_ENTRY (51) - it should be
    // irrelevant since the path only runs up to and including 51.
    const red = makePlayer('red', 'red', withHomeFiller([makeToken(0, 48)]));
    const blue = makePlayer('blue', 'blue', withHomeFiller([makeToken(0, 0), makeToken(1, 0)]));
    expect(isPathBlocked([red, blue], red, 48, 54)).toBe(false);
  });
});

describe('basic block landing/passing rules on the main track', () => {
  it('blocks passing through an opponent block on the main track', () => {
    const red = makePlayer('red', 'red', withHomeFiller([makeToken(0, 10)]));
    const blue = makePlayer('blue', 'blue', withHomeFiller([makeToken(0, 12), makeToken(1, 12)]));

    expect(isPathBlocked([red, blue], red, 10, 14)).toBe(true);
    const validMoves = getValidMoves([red, blue], red, 4);
    expect(validMoves).not.toContain(0);
  });

  it('blocks landing directly on an opponent block', () => {
    const red = makePlayer('red', 'red', withHomeFiller([makeToken(0, 10)]));
    const blue = makePlayer('blue', 'blue', withHomeFiller([makeToken(0, 13), makeToken(1, 13)]));

    const validMoves = getValidMoves([red, blue], red, 3);
    expect(validMoves).not.toContain(0);
  });

  it('allows passing through your own block', () => {
    const tokens = withHomeFiller([makeToken(0, 10), makeToken(1, 12), makeToken(2, 12)]);
    const red = makePlayer('red', 'red', tokens);

    expect(isPathBlocked([red], red, 10, 14)).toBe(false);
    const validMoves = getValidMoves([red], red, 4);
    expect(validMoves).toContain(0);
  });
});

describe('home column exact-finish and overshoot', () => {
  it('lands exactly on the finish square', () => {
    // Home column index 4 (position 56) + 1 step = index 5 = finish (57).
    expect(calculateNewPosition('red', 56, 1)).toBe(57);
  });

  it('rejects a move that overshoots the finish square', () => {
    expect(calculateNewPosition('red', 56, 3)).toBeNull();
  });

  it('excludes an overshooting move from getValidMoves', () => {
    const red = makePlayer('red', 'red', withHomeFiller([makeToken(0, 56)]));
    const validMoves = getValidMoves([red], red, 3);
    expect(validMoves).not.toContain(0);
  });

  it('includes an exact-finish move in getValidMoves and moveToken finishes the token', () => {
    const red = makePlayer('red', 'red', withHomeFiller([makeToken(0, 56)]));
    const validMoves = getValidMoves([red], red, 1);
    expect(validMoves).toContain(0);

    const result = moveToken([red], red, 0, 1);
    expect(result).not.toBeNull();
    const movedToken = result!.updatedPlayer.tokens.find((t) => t.id === 0);
    expect(movedToken?.position).toBe(57);
    expect(movedToken?.isFinished).toBe(true);
  });
});

describe('capture behavior on safe zones', () => {
  it('does not capture a lone opponent token sitting on a safe zone', () => {
    const safeZone = SAFE_ZONES[1]; // 8
    const red = makePlayer('red', 'red', withHomeFiller([]));
    const blue = makePlayer('blue', 'blue', withHomeFiller([makeToken(0, safeZone)]));

    const updated = checkCapture([red, blue], red, safeZone);
    const blueToken = updated.find((p) => p.playerId === 'blue')!.tokens.find((t) => t.id === 0);
    expect(blueToken?.isHome).toBe(false);
    expect(blueToken?.position).toBe(safeZone);
  });

  it('captures a lone opponent token on a non-safe square', () => {
    const nonSafePosition = 10;
    expect((SAFE_ZONES as readonly number[]).includes(nonSafePosition)).toBe(false);

    const red = makePlayer('red', 'red', withHomeFiller([]));
    const blue = makePlayer('blue', 'blue', withHomeFiller([makeToken(0, nonSafePosition)]));

    const updated = checkCapture([red, blue], red, nonSafePosition);
    const blueToken = updated.find((p) => p.playerId === 'blue')!.tokens.find((t) => t.id === 0);
    expect(blueToken?.isHome).toBe(true);
    expect(blueToken?.position).toBe(-1);
  });

  it('never captures inside the home column', () => {
    const homeColumnPosition = HOME_ENTRY.red + 2; // arbitrary sentinel > 52
    const red = makePlayer('red', 'red', withHomeFiller([]));
    const blue = makePlayer('blue', 'blue', withHomeFiller([makeToken(0, 53)]));

    const updated = checkCapture([red, blue], red, 53);
    const blueToken = updated.find((p) => p.playerId === 'blue')!.tokens.find((t) => t.id === 0);
    expect(blueToken?.isHome).toBe(false);
    expect(homeColumnPosition).toBeGreaterThan(52); // sanity check on the fixture
  });
});
