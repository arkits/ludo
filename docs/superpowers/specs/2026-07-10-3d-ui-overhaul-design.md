# 3D Game UI Overhaul — Design

**Date:** 2026-07-10
**Status:** Approved by user

## Goal

Replace the flat SVG game board with a full-screen WebGL 3D scene while keeping the
polished vintage board-game aesthetic. Improve animations (token movement, dice,
turn handoff), use the whole viewport on desktop and mobile, and add smooth
transitions between screens.

## Scope

In scope: the in-game screen (board, tokens, dice, controls, sidebar), turn/bot
pacing, and screen-to-screen transitions. Out of scope: lobby/waiting-room visual
redesign (they only get entry/exit transitions), game rules, Convex schema.

## Stack

- Add `three`, `@react-three/fiber`, `@react-three/drei`.
- All game logic, Convex sync, and grid coordinate math (`src/utils/boardPositions.ts`)
  stay as-is. The 3D board consumes the same props as today's `GameBoard`.
- Accepted trade-off: ~300–400 KB gzipped bundle increase; requires WebGL
  (universal on modern browsers).

## Architecture

New components (old `GameBoard.tsx`/`Token.tsx` SVG path removed once verified):

- `src/components/three/BoardScene.tsx` — full-bleed `<Canvas>`; camera, lights,
  contact shadows. Perspective camera tilted ~50°, gentle idle drift, limited
  drag/touch orbit, auto-fits board to viewport.
- `src/components/three/Board.tsx` — static board meshes: beveled wooden frame,
  extruded cell tiles in the vintage palette, embossed safe-square stars and start
  arrows, home bases with recessed token wells, raised center triangles. Procedural
  canvas textures for wood/paper grain (no external assets).
- `src/components/three/Pawn.tsx` — lathe-geometry pawn per token. Valid-move pawns
  pulse emissive glow and lift slightly; clicks via R3F raycasting call the existing
  `onTokenClick`.
- `src/components/three/Dice3D.tsx` — die lives in the scene. On roll it is tossed
  onto the board center with a keyframed tumble (no physics engine) that settles with
  the correct face up, lingers a beat, fades out. HUD keeps the Roll button + numeric
  result.
- `src/components/three/useTokenAnimation.ts` — tracks previous token positions and
  animates moves cell-by-cell along the real path with hop arcs. Captures: captured
  pawn pops up and flies back to its home well. Finish: spin-and-sink celebration.

Coordinates: reuse `boardPositions.ts` pixel grid (600×600) mapped onto the 3D board
plane (1 px → world units), so no duplicate layout math.

## Turn transitions

- Animated banner ("Bot 1's turn") sweeps in tinted with the player's color.
- Board rim light and controls-bar tint shift to the active player's color.
- Camera nudges subtly toward the active player's corner.
- Bot pacing lives server-side in `convex/game.ts` scheduler delays: roll visible
  ~1.2 s → move (client animates) → ~1.8 s pause → handoff, so humans can follow.

## Layout (full-screen, responsive)

- Canvas is full-bleed; the viewport is the game.
- Player panels become compact color-coded chips: docked left on desktop, a strip
  across the top on mobile.
- Move history becomes a collapsible drawer.
- Controls float in a bottom bar; header slims to a floating strip.
- HUD keeps the vintage cardboard/paper materials, tightened up.

## Page transitions

Lobby → waiting room → game: crossfade + gentle scale via a small CSS transition
wrapper. Error banner/toasts get spring easings.

## Accessibility / degradation

- `prefers-reduced-motion`: instant token placement, no camera drift, no dice toss
  (die appears settled).
- If WebGL context creation fails, show a plain message; no SVG fallback is kept
  (YAGNI).

## Error handling

- Token animation state is derived from server state; if an animation is interrupted
  by a newer server update, snap to the latest authoritative positions.
- Dice animation is cosmetic; the rolled value always comes from the server.

## Testing

- Drive the real app in a browser: create room, add bots, play several turns;
  verify token hops, captures, dice toss, turn banners, and bot pacing.
- Verify desktop and mobile-sized viewports.
- `npm run build` + lint clean; old SVG board code removed.
