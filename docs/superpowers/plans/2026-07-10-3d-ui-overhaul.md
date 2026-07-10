# 3D Ludo UI Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the SVG Ludo board with a full-screen react-three-fiber 3D scene (wooden vintage board, pawn tokens, in-scene tossed dice, animated hops), plus turn-handoff transitions, slower bot pacing, a compact full-bleed HUD, and screen crossfades.

**Architecture:** All game logic and Convex sync stay untouched. New `src/components/three/` components consume the same props as today's `GameBoard`. Coordinates reuse `src/utils/boardPositions.ts` (600×600 px grid) mapped to world units (40 px = 1 unit, centered at origin). Token move animation is computed client-side by diffing successive server states into waypoint paths.

**Tech Stack:** React 19, Vite, Convex, three, @react-three/fiber, @react-three/drei, vitest (new, for path-logic unit tests).

## Global Constraints

- Keep the vintage palette: paper `#f5f5dc`, wood browns (`#5c3d2e`–`#8b4513`), token colors from `GameBoard.tsx` `COLORS` map (red `#e74c3c`, green `#27ae60`, yellow `#f1c40f`, blue `#3498db`).
- No external assets/CDNs — procedural canvas textures only.
- Respect `prefers-reduced-motion`: instant token placement, no camera drift, dice appears settled.
- Mobile + desktop responsive; canvas is full-bleed under HTML HUD overlays.
- Server (`convex/`) changes limited to scheduler delays in `convex/game.ts`.
- Spec: `docs/superpowers/specs/2026-07-10-3d-ui-overhaul-design.md`.

---

### Task 1: Dependencies + vitest setup

**Files:**
- Modify: `package.json`

**Interfaces:**
- Produces: `three`, `@react-three/fiber`, `@react-three/drei` importable; `npm test` runs vitest.

- [ ] **Step 1: Install dependencies**

```bash
npm install three @react-three/fiber @react-three/drei
npm install -D @types/three vitest
```

- [ ] **Step 2: Add test script**

In `package.json` scripts add: `"test": "vitest run"`.

- [ ] **Step 3: Verify build still works**

Run: `npm run build` — Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add three/r3f/drei and vitest"
```

---

### Task 2: Move-path utility (TDD)

Computes the waypoint list a token travels through between two server states.

**Files:**
- Create: `src/utils/tokenPath.ts`
- Test: `src/utils/tokenPath.test.ts`

**Interfaces:**
- Consumes: `getSquareCoordinates`, `getHomePosition`, `getFinishedPosition`, `HOME_ENTRY_POSITIONS`, `START_POSITIONS` from `./boardPositions`; `TokenState` shape `{ id, position, isHome, isFinished }`.
- Produces:
  - `type PathPlan = { kind: 'hops' | 'fly' | 'none'; points: Array<{x: number; y: number}> }` (points in 600×600 board pixels, first point = origin, last = destination)
  - `computePathPlan(color: PlayerColor, prev: TokenState, next: TokenState): PathPlan`
  - `nextStep(color: PlayerColor, position: number): number` (one movement step: track advance, home-column entry, home-column advance)

- [ ] **Step 1: Write failing tests**

```ts
// src/utils/tokenPath.test.ts
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
    expect(nextStep('red', 51)).toBe(52);   // red entry after 51
    expect(nextStep('blue', 12)).toBe(52);  // blue entry after 12
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
    // malformed prev/next should not loop forever
    const plan = computePathPlan('red', t(0), t(51));
    expect(plan.points.length).toBeLessThanOrEqual(58);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npx vitest run src/utils/tokenPath.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// src/utils/tokenPath.ts
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
    points.push(
      pos === 57 && next.isFinished
        ? to
        : getSquareCoordinates(pos, color)
    );
    guard++;
  }
  if (pos !== target) return { kind: 'fly', points: [from, to] }; // fallback: snap-fly
  return { kind: 'hops', points };
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/utils/tokenPath.test.ts` — Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/tokenPath.ts src/utils/tokenPath.test.ts
git commit -m "feat: add token move path computation"
```

---

### Task 3: World-coordinate helper + procedural textures (TDD for coords)

**Files:**
- Create: `src/components/three/worldCoords.ts`
- Create: `src/components/three/textures.ts`
- Test: `src/components/three/worldCoords.test.ts`

**Interfaces:**
- Produces:
  - `pxToWorld(p: {x: number; y: number}, yUp?: number): [number, number, number]` — 600×600 board px → world `[x, y, z]`; 40 px = 1 unit; board centered at origin; px y maps to world z.
  - `CELL = 1`, `BOARD_HALF = 7.5` constants.
  - `makeGrainTexture(base: string, opts?: {noise?: number; repeat?: number}): THREE.CanvasTexture` — subtle speckled paper/wood grain.

- [ ] **Step 1: Write failing test**

```ts
// src/components/three/worldCoords.test.ts
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
```

- [ ] **Step 2: Run test, verify fail**

Run: `npx vitest run src/components/three/worldCoords.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// src/components/three/worldCoords.ts
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
```

```ts
// src/components/three/textures.ts
import * as THREE from 'three';

// Subtle speckle grain over a base color; used for paper cells and wood frame.
export function makeGrainTexture(
  base: string,
  opts: { noise?: number; repeat?: number } = {}
): THREE.CanvasTexture {
  const { noise = 14, repeat = 2 } = opts;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  const img = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * noise;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/components/three` — Expected: PASS. (`textures.ts` is exercised visually later; it touches `document`, so no unit test.)

- [ ] **Step 5: Commit**

```bash
git add src/components/three/worldCoords.ts src/components/three/worldCoords.test.ts src/components/three/textures.ts
git commit -m "feat: add 3D world coordinate mapping and grain textures"
```

---

### Task 4: Static 3D board (frame, tiles, bases, center)

**Files:**
- Create: `src/components/three/Board.tsx`
- Create: `src/components/three/boardModel.ts`

**Interfaces:**
- Consumes: `pxToWorld`, `CELL`, `BOARD_HALF`, `makeGrainTexture`.
- Produces: `<Board3D />` — self-contained static board group centered at origin, top surface at `y = 0.15` exported as `BOARD_TOP = 0.15` from `boardModel.ts`. Also exports `TOKEN_COLORS: Record<PlayerColor, {main: string; dark: string; light: string}>` (copied from current `GameBoard.tsx`) and `CellSpec`/`buildCells()` describing every tile (position px, color, kind) so Board rendering is data-driven.

- [ ] **Step 1: Implement the board model data**

```ts
// src/components/three/boardModel.ts
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
  color: string;              // fill
  kind: 'track' | 'homeCol' | 'start' | 'safe';
  arrow?: 'up' | 'down' | 'left' | 'right';
}

// Mirrors the SVG layout in GameBoard.tsx: the cross of track cells,
// four home columns, start cells with arrows, safe-star cells.
export function buildCells(): CellSpec[] {
  const cells: CellSpec[] = [];
  const paper = '#f7f3e3';
  const push = (col: number, row: number, color: string, kind: CellSpec['kind'], arrow?: CellSpec['arrow']) =>
    cells.push({ key: `${col}-${row}`, col, row, color, kind, arrow });

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
  // Safe cells get stars (same squares as SVG board)
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
```

- [ ] **Step 2: Implement the Board component**

```tsx
// src/components/three/Board.tsx
import { useMemo } from 'react';
import * as THREE from 'three';
import { CELL, BOARD_HALF } from './worldCoords';
import { makeGrainTexture } from './textures';
import { BOARD_TOP, TOKEN_COLORS, buildCells, HOME_BASES } from './boardModel';

const gridToWorld = (col: number, row: number): [number, number] => [
  col - 7, // col * CELL + CELL/2 - BOARD_HALF
  row - 7,
];

function starShape(size = 0.22): THREE.Shape {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? size : size / 2;
    const a = (i * Math.PI) / 5 - Math.PI / 2;
    const x = r * Math.cos(a);
    const y = r * Math.sin(a);
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  s.closePath();
  return s;
}

function arrowShape(size = 0.22): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(size, 0);
  s.lineTo(-size, -size);
  s.lineTo(-size, size);
  s.closePath();
  return s;
}

const ARROW_ROT: Record<string, number> = {
  right: 0,
  down: -Math.PI / 2,
  left: Math.PI,
  up: Math.PI / 2,
};

export default function Board3D() {
  const cells = useMemo(buildCells, []);
  const paperTex = useMemo(() => makeGrainTexture('#f5f0dd'), []);
  const woodTex = useMemo(() => makeGrainTexture('#5c3d2e', { noise: 26 }), []);
  const star = useMemo(() => new THREE.ExtrudeGeometry(starShape(), { depth: 0.02, bevelEnabled: false }), []);
  const arrow = useMemo(() => new THREE.ExtrudeGeometry(arrowShape(), { depth: 0.02, bevelEnabled: false }), []);

  return (
    <group>
      {/* Wooden base slab + raised frame */}
      <mesh position={[0, -0.25, 0]} receiveShadow castShadow>
        <boxGeometry args={[BOARD_HALF * 2 + 1.6, 0.8, BOARD_HALF * 2 + 1.6]} />
        <meshStandardMaterial map={woodTex} roughness={0.75} metalness={0.05} />
      </mesh>
      {/* Paper playing field */}
      <mesh position={[0, BOARD_TOP - 0.06, 0]} receiveShadow>
        <boxGeometry args={[BOARD_HALF * 2, 0.12, BOARD_HALF * 2]} />
        <meshStandardMaterial map={paperTex} color="#f5f5dc" roughness={0.9} />
      </mesh>

      {/* Track / home-column tiles, slightly raised */}
      {cells.map((c) => {
        const [x, z] = gridToWorld(c.col, c.row);
        return (
          <group key={c.key} position={[x, BOARD_TOP, z]}>
            <mesh receiveShadow>
              <boxGeometry args={[CELL * 0.96, 0.06, CELL * 0.96]} />
              <meshStandardMaterial color={c.color} roughness={0.85} />
            </mesh>
            {c.kind === 'safe' && (
              <mesh geometry={star} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.035, 0]}>
                <meshStandardMaterial color="#ffffff" roughness={0.6} />
              </mesh>
            )}
            {c.arrow && (
              <mesh
                geometry={arrow}
                rotation={[-Math.PI / 2, 0, ARROW_ROT[c.arrow]]}
                position={[0, 0.035, 0]}
              >
                <meshStandardMaterial color="#ffffff" roughness={0.6} />
              </mesh>
            )}
          </group>
        );
      })}

      {/* Home bases: colored quadrant + white disc + 4 recessed wells */}
      {HOME_BASES.map(({ color, col, row }) => {
        const cx = col + 3 - 7.5 + 0.5; // center of the 6x6 quadrant
        const cz = row + 3 - 7.5 + 0.5;
        const c = TOKEN_COLORS[color];
        const wells: Array<[number, number]> = [
          [-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8],
        ];
        return (
          <group key={color} position={[cx - 0.5, BOARD_TOP, cz - 0.5]}>
            <mesh receiveShadow>
              <boxGeometry args={[6 * 0.98, 0.08, 6 * 0.98]} />
              <meshStandardMaterial color={c.light} roughness={0.85} />
            </mesh>
            <mesh position={[0, 0.05, 0]} receiveShadow>
              <cylinderGeometry args={[1.9, 1.9, 0.04, 48]} />
              <meshStandardMaterial color="#ffffff" roughness={0.8} />
            </mesh>
            {wells.map(([wx, wz], i) => (
              <mesh key={i} position={[wx, 0.075, wz]} receiveShadow>
                <cylinderGeometry args={[0.42, 0.42, 0.02, 32]} />
                <meshStandardMaterial color={c.main} roughness={0.7} />
              </mesh>
            ))}
          </group>
        );
      })}

      {/* Center temple: 4 colored sloped triangles */}
      {(['red', 'green', 'yellow', 'blue'] as const).map((color, i) => {
        // Triangles point at center; base along each inner edge of the 3x3 center.
        const rot = [0, -Math.PI / 2, Math.PI, Math.PI / 2][i]; // red top, green right, yellow bottom, blue left
        return (
          <group key={color} rotation={[0, rot, 0]}>
            <mesh position={[0, BOARD_TOP + 0.02, -1]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
              <coneGeometry args={[1.5, 0.9, 4, 1]} />
              <meshStandardMaterial color={TOKEN_COLORS[color].main} roughness={0.7} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}
```

Note for the implementer: the center-triangle approach above (rotated cones) is a
starting point — if it looks wrong in the browser, replace with four
`ExtrudeGeometry` triangles (`Shape` with points `(±1.5, 0)` and `(0, 1.5)` laid
flat at `y = BOARD_TOP + 0.02`, one per rotation). Correct visual: four flat
colored triangles filling the 3×3 center, apexes meeting at origin.

- [ ] **Step 3: Visual check (temporary harness)**

Temporarily render `<Board3D/>` in a `<Canvas>` in `App.tsx` (or wait for Task 5's scene). If checking now: wrap in `<Canvas camera={{position:[0,14,10], fov:40}}><ambientLight intensity={0.8}/><directionalLight position={[6,12,4]}/><Board3D/></Canvas>`, run `npm run dev`, verify: cross-shaped track, colored home columns, 4 quadrant bases with wells, center triangles. Revert the harness.

- [ ] **Step 4: Commit**

```bash
git add src/components/three/Board.tsx src/components/three/boardModel.ts
git commit -m "feat: add static 3D ludo board"
```

---

### Task 5: Scene shell — camera, lights, full-bleed canvas

**Files:**
- Create: `src/components/three/BoardScene.tsx`
- Create: `src/components/three/CameraRig.tsx`
- Create: `src/hooks/useReducedMotion.ts`

**Interfaces:**
- Consumes: `Board3D`.
- Produces:
  - `<BoardScene players currentPlayerColor validMoves onTokenClick diceValue isRollingDice activeCorner />` — same player props shape as old `GameBoard` (`GameBoardProps`), plus dice props and `activeCorner: PlayerColor | null` for camera nudge/rim light. Renders `<Canvas>` filling its parent.
  - `useReducedMotion(): boolean`
  - `CameraRig` — internal; drag/touch orbit clamped to azimuth ±0.5 rad, polar 0.35–1.15 rad, idle drift unless reduced motion, eases toward active player's corner.

- [ ] **Step 1: Implement useReducedMotion**

```ts
// src/hooks/useReducedMotion.ts
import { useSyncExternalStore } from 'react';

const query = '(prefers-reduced-motion: reduce)';

export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(query);
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => window.matchMedia(query).matches
  );
}
```

- [ ] **Step 2: Implement CameraRig**

```tsx
// src/components/three/CameraRig.tsx
import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { PlayerColor } from '../../types/game';

// Corner directions (world x/z sign) per player color, matching board quadrants.
const CORNER: Record<PlayerColor, [number, number]> = {
  red: [-1, -1],
  green: [1, -1],
  blue: [-1, 1],
  yellow: [1, 1],
};

interface Props {
  activeCorner: PlayerColor | null;
  reducedMotion: boolean;
}

export default function CameraRig({ activeCorner, reducedMotion }: Props) {
  const { camera, size, gl } = useThree();
  const drag = useRef({ active: false, x: 0, y: 0, az: 0, po: 0 });
  const azimuth = useRef(0);
  const polar = useRef(0.72); // radians from vertical
  const t = useRef(0);

  // Pointer orbit (attached once)
  const bound = useRef(false);
  if (!bound.current) {
    bound.current = true;
    const el = gl.domElement;
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', (e) => {
      drag.current = { active: true, x: e.clientX, y: e.clientY, az: azimuth.current, po: polar.current };
    });
    window.addEventListener('pointermove', (e) => {
      if (!drag.current.active) return;
      azimuth.current = THREE.MathUtils.clamp(
        drag.current.az - (e.clientX - drag.current.x) * 0.004, -0.5, 0.5);
      polar.current = THREE.MathUtils.clamp(
        drag.current.po - (e.clientY - drag.current.y) * 0.003, 0.35, 1.15);
    });
    window.addEventListener('pointerup', () => { drag.current.active = false; });
  }

  useFrame((_, dt) => {
    t.current += dt;
    // Fit board: pull back further on narrow screens.
    const aspect = size.width / size.height;
    const dist = aspect > 1 ? 19 : 19 / Math.min(aspect * 1.15, 1);
    const idle = reducedMotion || drag.current.active ? 0 : Math.sin(t.current * 0.25) * 0.045;
    // Nudge toward active player's corner.
    const corner = activeCorner ? CORNER[activeCorner] : [0, 0];
    const targetAz = azimuth.current + idle + corner[0] * 0.1;
    const po = polar.current;
    const target = new THREE.Vector3(
      Math.sin(targetAz) * Math.sin(po) * dist,
      Math.cos(po) * dist,
      Math.cos(targetAz) * Math.sin(po) * dist + corner[1] * 0.6
    );
    camera.position.lerp(target, reducedMotion ? 1 : Math.min(1, dt * 2.5));
    camera.lookAt(0, 0, 0);
  });

  return null;
}
```

- [ ] **Step 3: Implement BoardScene (board only for now; pawns/dice added in later tasks)**

```tsx
// src/components/three/BoardScene.tsx
import { Canvas } from '@react-three/fiber';
import { ContactShadows } from '@react-three/drei';
import type { PlayerColor } from '../../types/game';
import Board3D from './Board';
import CameraRig from './CameraRig';
import { TOKEN_COLORS } from './boardModel';
import { useReducedMotion } from '../../hooks/useReducedMotion';

export interface ScenePlayer {
  id: string;
  nickname: string;
  color: PlayerColor;
  tokens: Array<{ id: number; position: number; isHome: boolean; isFinished: boolean }>;
}

export interface BoardSceneProps {
  players: ScenePlayer[];
  currentPlayerColor: PlayerColor | null;
  validMoves: number[];
  onTokenClick: (playerId: string, tokenId: number) => void;
  diceValue: number;
  isRollingDice: boolean;
  activeCorner: PlayerColor | null;
}

export default function BoardScene(props: BoardSceneProps) {
  const reducedMotion = useReducedMotion();
  const rim = props.activeCorner ? TOKEN_COLORS[props.activeCorner].main : '#ffffff';

  return (
    <Canvas shadows dpr={[1, 2]} camera={{ fov: 36, position: [0, 14, 12], near: 0.1, far: 100 }}>
      <ambientLight intensity={0.55} />
      <directionalLight
        position={[8, 14, 6]}
        intensity={1.2}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
      />
      {/* Rim light tinted to the active player */}
      <pointLight position={[0, 6, -12]} intensity={0.5} color={rim} />
      <Board3D />
      <ContactShadows position={[0, -0.64, 0]} opacity={0.45} scale={24} blur={2.2} far={4} />
      <CameraRig activeCorner={props.activeCorner} reducedMotion={reducedMotion} />
    </Canvas>
  );
}
```

- [ ] **Step 3b: WebGL failure fallback**

Wrap the `<Canvas>` in an error boundary-free guard: before rendering, check
`document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl')`;
if null, render `<div className="webgl-error">This game needs WebGL — please update your browser.</div>` instead of the Canvas (style it with the existing vintage panel look; a plain centered message is fine).

- [ ] **Step 4: Wire a temporary render + visual check**

In `App.tsx` game-play branch, temporarily replace `<GameBoard …>` with `<div style={{position:'absolute', inset:0}}><BoardScene players={state.room.players} currentPlayerColor={state.room.currentPlayer?.color || null} validMoves={validMoves} onTokenClick={handleTokenClick} diceValue={state.room.diceValue} isRollingDice={state.isRollingDice} activeCorner={state.room.currentPlayer?.color || null}/></div>` (layout is finalized in Task 9). Run `npm run dev`, create a room with bots, verify the 3D board renders, camera drifts, drag orbits within limits.

- [ ] **Step 5: Commit**

```bash
git add src/components/three/BoardScene.tsx src/components/three/CameraRig.tsx src/hooks/useReducedMotion.ts src/App.tsx
git commit -m "feat: add 3D board scene with camera rig and lighting"
```

---

### Task 6: Pawns with hop/fly animation and click handling

**Files:**
- Create: `src/components/three/Pawn.tsx`
- Modify: `src/components/three/BoardScene.tsx` (render pawns)

**Interfaces:**
- Consumes: `computePathPlan`, `PathPlan`, `TokenState` from `../../utils/tokenPath`; `pxToWorld`; `BOARD_TOP`, `TOKEN_COLORS`.
- Produces: `<Pawn token color playerId isValidMove isCurrentPlayer reducedMotion onClick />`. Pawn animates itself when `token` changes; snaps if a newer change arrives mid-animation (interrupt-safe: always animates toward latest server state); pulses emissive + lifts when `isValidMove && isCurrentPlayer`.

- [ ] **Step 1: Implement Pawn**

```tsx
// src/components/three/Pawn.tsx
import { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { PlayerColor } from '../../types/game';
import { computePathPlan, type TokenState } from '../../utils/tokenPath';
import { pxToWorld } from './worldCoords';
import { BOARD_TOP, TOKEN_COLORS } from './boardModel';

const HOP_SECS = 0.24;
const HOP_HEIGHT = 0.55;
const FLY_SECS = 0.7;
const FLY_HEIGHT = 2.2;

// Classic pawn profile via lathe.
function pawnGeometry(): THREE.LatheGeometry {
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0.32, 0),
    new THREE.Vector2(0.3, 0.06),
    new THREE.Vector2(0.14, 0.18),
    new THREE.Vector2(0.11, 0.4),
    new THREE.Vector2(0.2, 0.52),
    new THREE.Vector2(0.09, 0.6),
    new THREE.Vector2(0.17, 0.76),
    new THREE.Vector2(0.12, 0.9),
    new THREE.Vector2(0, 0.95),
  ];
  return new THREE.LatheGeometry(pts, 24);
}

interface PawnProps {
  token: TokenState;
  color: PlayerColor;
  playerId: string;
  isValidMove: boolean;
  isCurrentPlayer: boolean;
  reducedMotion: boolean;
  onClick: (playerId: string, tokenId: number) => void;
}

interface Anim {
  plan: ReturnType<typeof computePathPlan>;
  start: number; // elapsed seconds at start
}

export default function Pawn({ token, color, playerId, isValidMove, isCurrentPlayer, reducedMotion, onClick }: PawnProps) {
  const group = useRef<THREE.Group>(null!);
  const mat = useRef<THREE.MeshStandardMaterial>(null!);
  const geometry = useMemo(pawnGeometry, []);
  const clock = useRef(0);
  const anim = useRef<Anim | null>(null);
  const prevToken = useRef<TokenState>(token);
  const [hovered, setHovered] = useState(false);

  const c = TOKEN_COLORS[color];
  const clickable = isValidMove && isCurrentPlayer;

  // Detect server-state change → build a path plan (render-time, ref-guarded).
  if (
    prevToken.current.position !== token.position ||
    prevToken.current.isHome !== token.isHome ||
    prevToken.current.isFinished !== token.isFinished
  ) {
    const plan = computePathPlan(color, prevToken.current, token);
    anim.current = reducedMotion || plan.kind === 'none' ? null : { plan, start: -1 };
    prevToken.current = token;
  }

  const restPoint = useMemo(() => {
    const plan = computePathPlan(color, token, token); // kind 'none' → destination point
    return plan.points[plan.points.length - 1];
  }, [color, token]);

  useFrame((_, dt) => {
    clock.current += dt;
    const g = group.current;
    if (!g) return;

    if (anim.current) {
      if (anim.current.start < 0) anim.current.start = clock.current;
      const { plan } = anim.current;
      const elapsed = clock.current - anim.current.start;

      if (plan.kind === 'fly') {
        const t = Math.min(elapsed / FLY_SECS, 1);
        const [ax, , az] = pxToWorld(plan.points[0]);
        const [bx, , bz] = pxToWorld(plan.points[1]);
        g.position.set(
          THREE.MathUtils.lerp(ax, bx, t),
          BOARD_TOP + Math.sin(t * Math.PI) * FLY_HEIGHT,
          THREE.MathUtils.lerp(az, bz, t)
        );
        if (t >= 1) anim.current = null;
      } else {
        const segs = plan.points.length - 1;
        const total = segs * HOP_SECS;
        const t = Math.min(elapsed / total, 1);
        const f = t * segs;
        const i = Math.min(Math.floor(f), segs - 1);
        const ft = f - i;
        const [ax, , az] = pxToWorld(plan.points[i]);
        const [bx, , bz] = pxToWorld(plan.points[i + 1]);
        g.position.set(
          THREE.MathUtils.lerp(ax, bx, ft),
          BOARD_TOP + Math.sin(ft * Math.PI) * HOP_HEIGHT,
          THREE.MathUtils.lerp(az, bz, ft)
        );
        if (t >= 1) anim.current = null;
      }
      return;
    }

    // At rest: sit on destination; pulse-lift if selectable.
    const [x, , z] = pxToWorld(restPoint);
    const lift = clickable ? 0.12 + Math.sin(clock.current * 4) * 0.06 : 0;
    g.position.set(x, BOARD_TOP + lift, z);
    // Finished tokens sink slightly and shrink.
    const s = token.isFinished ? 0.7 : 1;
    g.scale.setScalar(THREE.MathUtils.lerp(g.scale.x, s, Math.min(1, dt * 6)));
    if (mat.current) {
      const glow = clickable ? 0.55 + Math.sin(clock.current * 4) * 0.25 : hovered && clickable ? 0.4 : 0;
      mat.current.emissiveIntensity = THREE.MathUtils.lerp(mat.current.emissiveIntensity, glow, Math.min(1, dt * 8));
    }
  });

  return (
    <group
      ref={group}
      onClick={(e) => { e.stopPropagation(); if (clickable) onClick(playerId, token.id); }}
      onPointerOver={() => clickable && setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      <mesh geometry={geometry} castShadow>
        <meshStandardMaterial
          ref={mat}
          color={c.main}
          emissive={c.light}
          emissiveIntensity={0}
          roughness={0.35}
          metalness={0.08}
        />
      </mesh>
    </group>
  );
}
```

- [ ] **Step 2: Render pawns in BoardScene**

In `BoardScene.tsx`, inside `<Canvas>` after `<Board3D />` add:

```tsx
{props.players.map((player) =>
  player.tokens.map((token) => (
    <Pawn
      key={`${player.id}-${token.id}`}
      token={token}
      color={player.color}
      playerId={player.id}
      isValidMove={props.validMoves.includes(token.id) && player.color === props.currentPlayerColor}
      isCurrentPlayer={player.color === props.currentPlayerColor}
      reducedMotion={reducedMotion}
      onClick={props.onTokenClick}
    />
  ))
)}
```

(Import `Pawn`.) Note: `validMoves` are token ids of the *current* player only, hence the color guard.

- [ ] **Step 3: Visual check**

`npm run dev`, room with 2 bots, start game. Verify: 16 pawns sit in wells; your valid pawns pulse/lift after rolling; clicking moves; moved pawns hop square-by-square; captured pawns arc back home; bot pawns animate too.

- [ ] **Step 4: Run unit tests + lint**

Run: `npm test && npm run lint` — Expected: PASS/clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/three/Pawn.tsx src/components/three/BoardScene.tsx
git commit -m "feat: add animated 3D pawns with hop and capture flights"
```

---

### Task 7: In-scene 3D dice toss

**Files:**
- Create: `src/components/three/Dice3D.tsx`
- Modify: `src/components/three/BoardScene.tsx` (render dice)
- Modify: `src/components/GameControls.tsx` + `src/components/GameControls.css` (drop old CSS dice, keep button + numeric result)
- Delete: `src/components/Dice.tsx`, `src/components/Dice.css`

**Interfaces:**
- Consumes: `BOARD_TOP`; props `{ value: number; isRolling: boolean; reducedMotion: boolean }`.
- Produces: `<Dice3D value isRolling reducedMotion />` rendered inside BoardScene. Behavior: hidden at rest → on `isRolling` true, drops tumbling above board center → when `isRolling` false with `value ≥ 1`, settles with correct face up over ~0.3 s, lingers 1 s, fades out. Reduced motion: appears settled for 1.2 s, no tumble.

- [ ] **Step 1: Implement Dice3D**

```tsx
// src/components/three/Dice3D.tsx
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { BOARD_TOP } from './boardModel';

const SIZE = 1.1;
const REST_Y = BOARD_TOP + SIZE / 2 + 0.03;

// Face → euler that puts that face up.
// Textures assigned: +x=3, -x=4, +y=1, -y=6, +z=2, -z=5 (opposites sum to 7).
const FACE_UP: Record<number, [number, number, number]> = {
  1: [0, 0, 0],
  2: [-Math.PI / 2, 0, 0],
  3: [0, 0, Math.PI / 2],
  4: [0, 0, -Math.PI / 2],
  5: [Math.PI / 2, 0, 0],
  6: [Math.PI, 0, 0],
};

const PIPS: Record<number, Array<[number, number]>> = {
  1: [[0, 0]],
  2: [[-1, -1], [1, 1]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [-1, 1], [1, -1], [1, 1]],
  5: [[-1, -1], [-1, 1], [0, 0], [1, -1], [1, 1]],
  6: [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 0], [1, 1]],
};

function faceTexture(value: number): THREE.CanvasTexture {
  const s = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = s;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#faf6ea';
  ctx.fillRect(0, 0, s, s);
  ctx.fillStyle = '#2d2318';
  for (const [px, py] of PIPS[value]) {
    ctx.beginPath();
    ctx.arc(s / 2 + px * s * 0.24, s / 2 + py * s * 0.24, s * 0.09, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

interface Props {
  value: number;
  isRolling: boolean;
  reducedMotion: boolean;
}

type Phase = 'hidden' | 'tumbling' | 'settling' | 'resting' | 'fading';

export default function Dice3D({ value, isRolling, reducedMotion }: Props) {
  const group = useRef<THREE.Group>(null!);
  const phase = useRef<Phase>('hidden');
  const phaseT = useRef(0);
  const spin = useRef(new THREE.Vector3(5, 7, 4));
  const opacity = useRef(0);
  const materials = useMemo(
    // BoxGeometry material order: +x, -x, +y, -y, +z, -z
    () => [3, 4, 1, 6, 2, 5].map((v) =>
      new THREE.MeshStandardMaterial({ map: faceTexture(v), roughness: 0.4, transparent: true, opacity: 0 })),
    []
  );

  const wasRolling = useRef(false);
  if (isRolling && !wasRolling.current) {
    phase.current = reducedMotion ? 'resting' : 'tumbling';
    phaseT.current = 0;
    spin.current.set(4 + Math.random() * 5, 6 + Math.random() * 5, 3 + Math.random() * 4);
  }
  if (!isRolling && wasRolling.current && value >= 1) {
    phase.current = reducedMotion ? 'resting' : 'settling';
    phaseT.current = 0;
  }
  wasRolling.current = isRolling;

  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    phaseT.current += dt;
    const t = phaseT.current;

    switch (phase.current) {
      case 'hidden':
        opacity.current = Math.max(0, opacity.current - dt * 3);
        break;
      case 'tumbling': {
        opacity.current = Math.min(1, opacity.current + dt * 6);
        const drop = Math.min(t / 0.5, 1);
        g.position.set(0, THREE.MathUtils.lerp(5, REST_Y + 0.4, drop), 0);
        g.rotation.x += spin.current.x * dt;
        g.rotation.y += spin.current.y * dt;
        g.rotation.z += spin.current.z * dt;
        break;
      }
      case 'settling': {
        opacity.current = 1;
        const k = Math.min(t / 0.3, 1);
        const target = new THREE.Quaternion().setFromEuler(new THREE.Euler(...FACE_UP[value] ?? [0, 0, 0]));
        g.quaternion.slerp(target, k);
        g.position.y = THREE.MathUtils.lerp(g.position.y, REST_Y, k);
        if (k >= 1) { phase.current = 'resting'; phaseT.current = 0; }
        break;
      }
      case 'resting': {
        opacity.current = Math.min(1, opacity.current + dt * 6);
        g.position.set(0, REST_Y, 0);
        g.setRotationFromEuler(new THREE.Euler(...(FACE_UP[value] ?? FACE_UP[1])));
        if (t > (reducedMotion ? 1.2 : 1)) { phase.current = 'fading'; phaseT.current = 0; }
        break;
      }
      case 'fading':
        opacity.current = Math.max(0, opacity.current - dt * 2.5);
        if (opacity.current <= 0) phase.current = 'hidden';
        break;
    }
    for (const m of materials) m.opacity = opacity.current;
    g.visible = opacity.current > 0.01;
  });

  return (
    <group ref={group} visible={false}>
      <RoundedBox args={[SIZE, SIZE, SIZE]} radius={0.12} smoothness={3} material={materials} castShadow />
    </group>
  );
}
```

Implementer note: if `RoundedBox` doesn't accept a material array cleanly, fall back to a plain `<mesh><boxGeometry args={[SIZE,SIZE,SIZE]}/></mesh>` with `material={materials}` — acceptable visual.

- [ ] **Step 2: Render in BoardScene**

Add inside `<Canvas>`: `<Dice3D value={props.diceValue} isRolling={props.isRollingDice} reducedMotion={reducedMotion} />` (import it).

- [ ] **Step 3: Slim down GameControls**

In `GameControls.tsx`: remove `import Dice from './Dice'` and the `<div className="dice-section">…</div>` block; replace with a numeric result chip:

```tsx
<div className="dice-result" aria-live="polite">
  {isRollingDice || opponentRolling ? '…' : diceValue > 0 ? diceValue : '–'}
</div>
```

Keep the `opponentRolling` effect (it now feeds the chip and Dice3D still animates via `isRollingDice` from state). Delete `src/components/Dice.tsx` and `src/components/Dice.css`. Add to `GameControls.css`:

```css
.dice-result {
  min-width: 52px;
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Bungee Inline', cursive;
  font-size: 26px;
  color: #f5e6d3;
  background: linear-gradient(180deg, #5c3d2e, #3d2817);
  border: 2px solid #8b6f47;
  border-radius: 10px;
  box-shadow: 0 2px 6px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.12);
}
```

Remove now-unused `.dice-section` rules from `GameControls.css`.

- [ ] **Step 4: Visual check**

`npm run dev`: roll — die drops tumbling onto board center, settles showing the rolled value, fades after ~1 s. Bot rolls also show the toss. Chip shows the number.

- [ ] **Step 5: Lint + build, commit**

```bash
npm run lint && npm run build
git add -A
git commit -m "feat: in-scene 3D dice toss replacing CSS dice"
```

---

### Task 8: Turn banner + tint transitions

**Files:**
- Create: `src/components/TurnBanner.tsx`
- Create: `src/components/TurnBanner.css`
- Modify: `src/App.tsx` (render banner in game-play)

**Interfaces:**
- Consumes: `state.room.currentPlayer` (`{ nickname, color }`), `state.currentPlayerId`.
- Produces: `<TurnBanner playerName color isYou />` — sweeps in on mount/key change, auto-hides after 1.6 s. App renders it with `key={currentPlayerIndex}` so each handoff re-triggers it.

- [ ] **Step 1: Implement**

```tsx
// src/components/TurnBanner.tsx
import { useEffect, useState } from 'react';
import type { PlayerColor } from '../types/game';
import './TurnBanner.css';

const COLORS: Record<PlayerColor, string> = {
  red: '#e74c3c', green: '#27ae60', yellow: '#d4ac0d', blue: '#3498db',
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
```

```css
/* src/components/TurnBanner.css */
.turn-banner {
  position: absolute;
  top: 18%;
  left: 50%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 28px;
  border-radius: 12px;
  background: linear-gradient(180deg, rgba(61,40,23,0.95), rgba(42,27,15,0.95));
  border: 2px solid var(--turn-color);
  color: #f5e6d3;
  font-family: 'Bungee Inline', cursive;
  font-size: 20px;
  letter-spacing: 2px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.45), 0 0 24px color-mix(in srgb, var(--turn-color) 55%, transparent);
  pointer-events: none;
  z-index: 30;
  animation: turn-sweep 1.6s cubic-bezier(0.22, 1.2, 0.36, 1) both;
}
.turn-banner-chip {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--turn-color);
  box-shadow: inset 0 -2px 3px rgba(0,0,0,0.35), 0 0 8px var(--turn-color);
}
@keyframes turn-sweep {
  0%   { transform: translate(-50%, 0) translateX(-60vw) scale(0.9); opacity: 0; }
  18%  { transform: translate(-50%, 0) translateX(0) scale(1.03); opacity: 1; }
  24%  { transform: translate(-50%, 0) scale(1); }
  82%  { transform: translate(-50%, 0) scale(1); opacity: 1; }
  100% { transform: translate(-50%, 0) translateX(18vw) scale(0.95); opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .turn-banner { animation: turn-fade 1.6s ease both; }
  @keyframes turn-fade { 0%,100% { opacity: 0; } 15%,85% { opacity: 1; } }
}
```

- [ ] **Step 2: Wire into App**

In the game-play JSX (inside the stage container from Task 9, or `.game-main` if executing before Task 9):

```tsx
{state.room.currentPlayer && (
  <TurnBanner
    key={state.room.currentPlayerIndex}
    playerName={state.room.currentPlayer.nickname}
    color={state.room.currentPlayer.color}
    isYou={state.room.currentPlayer.id === state.currentPlayerId}
  />
)}
```

(Confirm `currentPlayer` exposes `id`; otherwise use `state.room.players[state.room.currentPlayerIndex]`.)

- [ ] **Step 3: Visual check**

Turn passes → banner sweeps in with the player's color; controls tint (existing `tint-*` classes) and scene rim light (Task 5) shift.

- [ ] **Step 4: Commit**

```bash
git add src/components/TurnBanner.tsx src/components/TurnBanner.css src/App.tsx
git commit -m "feat: animated turn-handoff banner"
```

---

### Task 9: Full-bleed layout + compact HUD (desktop & mobile)

**Files:**
- Modify: `src/App.tsx` (game-play markup)
- Modify: `src/App.css` (stage/HUD layout; remove old grid)
- Modify: `src/components/PlayerPanel.tsx` + `PlayerPanel.css` (compact chip variant)
- Modify: `src/components/MoveHistory.tsx` + `MoveHistory.css` (collapsible drawer)
- Modify: `src/components/GameControls.css` (floating bottom bar)
- Delete usage of `.game-sidebar`, `.game-play` grid styles.

**Interfaces:**
- Consumes: `BoardScene`, `TurnBanner`, existing `PlayerPanel`/`MoveHistory`/`GameControls`.
- Produces: game-play markup:

```tsx
<div className="game-stage">
  <div className="stage-canvas">
    <BoardScene
      players={state.room.players}
      currentPlayerColor={state.room.currentPlayer?.color || null}
      validMoves={validMoves}
      onTokenClick={handleTokenClick}
      diceValue={state.room.diceValue}
      isRollingDice={state.isRollingDice}
      activeCorner={state.room.currentPlayer?.color || null}
    />
  </div>
  {/* TurnBanner here (Task 8) */}
  <div className="hud-players">
    {state.room.players.map((player) => (
      <PlayerPanel key={player.id} compact player={player}
        isCurrentTurn={state.room?.players[state.room.currentPlayerIndex]?.id === player.id}
        isYou={player.id === state.currentPlayerId} />
    ))}
  </div>
  <MoveHistory history={state.room.moveHistory} collapsible />
  <div className="hud-controls">
    <GameControls … (unchanged props) />
  </div>
</div>
```

The header (`.game-header`) stays above but becomes a slim floating strip.

- [ ] **Step 1: App.css — stage layout**

Replace `.game-play`, `.game-sidebar`, `.game-main` blocks with:

```css
.game-stage {
  position: relative;
  flex: 1;
  min-height: 0;
}
.stage-canvas {
  position: absolute;
  inset: 0;
}
.hud-players {
  position: absolute;
  top: 12px;
  left: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 20;
}
.hud-controls {
  position: absolute;
  left: 50%;
  bottom: 14px;
  transform: translateX(-50%);
  z-index: 20;
  width: min(560px, calc(100% - 24px));
}
.game-container { padding: 0; max-width: none; }
.game-header {
  position: relative;
  z-index: 25;
  margin: 10px 12px 0;
  padding: 10px 18px;
}
@media (max-width: 768px) {
  .hud-players {
    top: 8px; left: 8px; right: 8px;
    flex-direction: row;
    flex-wrap: wrap;
    gap: 6px;
  }
  .hud-controls { bottom: 8px; }
}
```

(Keep `.app { height: 100vh }`; use `100dvh` instead of `100vh` for mobile browser chrome: `height: 100dvh;`.)

- [ ] **Step 2: PlayerPanel compact chips**

Add optional `compact?: boolean` prop. Compact render: color dot + name + `finished/4` in one pill; highlight ring + slight scale when `isCurrentTurn`.

```tsx
// PlayerPanel.tsx — add prop and branch
if (compact) {
  return (
    <div className={`player-chip player-${player.color} ${isCurrentTurn ? 'active' : ''}`}>
      <span className="chip-dot" />
      <span className="chip-name">{player.nickname}{isYou ? ' (you)' : ''}</span>
      <span className="chip-score">{player.tokens.filter(t => t.isFinished).length}/4</span>
    </div>
  );
}
```

```css
/* PlayerPanel.css additions */
.player-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-radius: 999px;
  background: linear-gradient(180deg, rgba(232,212,184,0.95), rgba(201,168,130,0.95));
  border: 2px solid rgba(93,64,55,0.35);
  font-family: 'Crimson Text', serif;
  font-weight: 600;
  color: #4a2f1a;
  font-size: 14px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  transition: transform 0.3s ease, box-shadow 0.3s ease, border-color 0.3s ease;
}
.player-chip.active { transform: scale(1.06); border-color: currentColor; }
.player-chip .chip-dot { width: 14px; height: 14px; border-radius: 50%; box-shadow: inset 0 -2px 3px rgba(0,0,0,0.3); }
.player-chip.player-red { color: #c0392b; } .player-chip.player-red .chip-dot { background: #e74c3c; }
.player-chip.player-green { color: #1e8449; } .player-chip.player-green .chip-dot { background: #27ae60; }
.player-chip.player-yellow { color: #b7950b; } .player-chip.player-yellow .chip-dot { background: #f1c40f; }
.player-chip.player-blue { color: #2471a3; } .player-chip.player-blue .chip-dot { background: #3498db; }
.player-chip.active { box-shadow: 0 4px 16px rgba(0,0,0,0.35), 0 0 12px currentColor; }
.player-chip .chip-score { margin-left: 4px; opacity: 0.8; font-size: 13px; }
```

- [ ] **Step 3: MoveHistory drawer**

Add `collapsible?: boolean` prop. When collapsible: a small "History" tab button fixed at right edge (`position: absolute; right: 12px; top: 12px; z-index: 20`), toggling a slide-in panel (`transform: translateX(100%)` → `0`, `transition: transform 0.3s ease`) reusing existing list markup. Default closed.

- [ ] **Step 4: GameControls floating bar**

In `GameControls.css`, make `.game-controls.playing` a self-contained floating bar (it previously sat in flow): keep existing vintage background but add `border-radius: 14px;` and drop any fixed widths; content lays out horizontally: dice-result chip | action button | auto-move toggle. Ensure buttons have `min-height: 44px` for touch.

- [ ] **Step 5: Visual check, desktop + mobile**

`npm run dev`: desktop — board fills viewport, chips top-left, controls float bottom-center, history drawer right. Mobile (devtools iPhone viewport) — chips wrap across top, board fits, controls reachable. No page scrolling.

- [ ] **Step 6: Lint + build + commit**

```bash
npm run lint && npm run build
git add -A
git commit -m "feat: full-bleed 3D stage with compact HUD overlays"
```

---

### Task 10: Remove old SVG board

**Files:**
- Delete: `src/components/GameBoard.tsx`, `src/components/GameBoard.css`, `src/components/Token.tsx`, `src/components/Token.css`
- Modify: `src/App.tsx` (remove imports if any remain)

- [ ] **Step 1: Delete files and stale imports**

```bash
git rm src/components/GameBoard.tsx src/components/GameBoard.css src/components/Token.tsx src/components/Token.css
```

Search for stragglers: `grep -rn "GameBoard\|components/Token" src/` — remove remaining references (WaitingRoom may render a preview board; if it imports GameBoard, replace that usage with a static image-free placeholder div or render `BoardScene` with empty handlers — implementer picks the simpler working option).

- [ ] **Step 2: Verify**

Run: `npm run lint && npm run build && npm test` — Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor: remove legacy SVG board"
```

---

### Task 11: Bot pacing (Convex)

**Files:**
- Modify: `convex/game.ts`

**Interfaces:**
- Produces: slower scheduler beats. Every `ctx.scheduler.runAfter(<ms>, internal.game.botPlay, …)` call updated: 800 → 1500 (handoff to a bot), 1000 → 2000 (bot's move after its roll). If a constant is cleaner, add `const BOT_HANDOFF_MS = 1500; const BOT_ACTION_MS = 2000;` at top of file and use them at every call site.

- [ ] **Step 1: Update delays**

Edit each `runAfter(800, internal.game.botPlay` → `runAfter(BOT_HANDOFF_MS, internal.game.botPlay` and `runAfter(1000, internal.game.botPlay` → `runAfter(BOT_ACTION_MS, internal.game.botPlay`, declaring the two constants near the imports.

- [ ] **Step 2: Verify live**

Run `npx convex dev` (or confirm it's already running) so the mutation deploys; play a bot game: each bot turn should read as roll (die toss visible) → pause → move animation → pause → handoff banner.

- [ ] **Step 3: Commit**

```bash
git add convex/game.ts
git commit -m "feat: slow bot pacing so turns are followable"
```

---

### Task 12: Screen transitions (lobby ↔ waiting ↔ game)

**Files:**
- Create: `src/components/ScreenTransition.tsx`
- Create: `src/components/ScreenTransition.css`
- Modify: `src/App.tsx`

**Interfaces:**
- Produces: `<ScreenTransition screenKey={string}>{children}</ScreenTransition>` — children fade+scale in whenever `screenKey` changes.

- [ ] **Step 1: Implement**

```tsx
// src/components/ScreenTransition.tsx
import type { ReactNode } from 'react';
import './ScreenTransition.css';

export default function ScreenTransition({ screenKey, children }: { screenKey: string; children: ReactNode }) {
  return (
    <div key={screenKey} className="screen-transition">
      {children}
    </div>
  );
}
```

```css
/* src/components/ScreenTransition.css */
.screen-transition {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  animation: screen-in 0.45s cubic-bezier(0.22, 1, 0.36, 1) both;
}
@keyframes screen-in {
  from { opacity: 0; transform: scale(0.985) translateY(8px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}
@media (prefers-reduced-motion: reduce) {
  .screen-transition { animation: none; }
}
```

- [ ] **Step 2: Wire in App.tsx**

Wrap the three screens: lobby return branch wraps `<Lobby …/>` in `<ScreenTransition screenKey="lobby">`; inside the room branch wrap the waiting/playing/finished content in `<ScreenTransition screenKey={state.room.gameState}>`.

- [ ] **Step 3: Visual check + commit**

Create room → waiting fades in; start game → game fades in; leave → lobby fades in.

```bash
git add src/components/ScreenTransition.tsx src/components/ScreenTransition.css src/App.tsx
git commit -m "feat: crossfade transitions between screens"
```

---

### Task 13: End-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Full test/lint/build**

Run: `npm test && npm run lint && npm run build` — Expected: all clean.

- [ ] **Step 2: Browser end-to-end (desktop)**

With `npm run dev` + `npx convex dev`: create room, add 2 bots, start. Verify each spec item: 3D board look, camera drift + drag orbit, dice toss on your roll and bot rolls, pawn pulse on valid moves, hop-by-hop movement, capture fly-back (engineer a capture or play until one), turn banners + tint shifts, bot pacing readable, history drawer, chips update.

- [ ] **Step 3: Browser end-to-end (mobile viewport)**

Devtools responsive mode (390×844): board fits, HUD reachable, touch orbit works, no horizontal scroll.

- [ ] **Step 4: Reduced motion**

Emulate `prefers-reduced-motion: reduce` (devtools Rendering tab): tokens snap, no camera drift, dice appears settled.

- [ ] **Step 5: Commit any fixes; final commit**

```bash
git add -A
git commit -m "fix: polish from end-to-end verification"  # only if changes
```
