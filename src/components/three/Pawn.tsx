import { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { PlayerColor } from '../../types/game';
import { computePathPlan, type PathPlan, type TokenState } from '../../utils/tokenPath';
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
  plan: PathPlan;
  start: number; // clock seconds at start; -1 = not started
}

export default function Pawn({
  token,
  color,
  playerId,
  isValidMove,
  isCurrentPlayer,
  reducedMotion,
  onClick,
}: PawnProps) {
  const group = useRef<THREE.Group>(null!);
  const mat = useRef<THREE.MeshStandardMaterial>(null!);
  const geometry = useMemo(() => pawnGeometry(), []);
  const clock = useRef(0);
  const anim = useRef<Anim | null>(null);
  const prevToken = useRef<TokenState>(token);
  const [hovered, setHovered] = useState(false);

  const c = TOKEN_COLORS[color];
  const clickable = isValidMove && isCurrentPlayer;

  const restPoint = useMemo(
    () => computePathPlan(color, token, token).points[0],
    [color, token]
  );

  useFrame((_, dt) => {
    clock.current += dt;
    const g = group.current;
    if (!g) return;

    // Detect server-state change → build a path plan. If a newer change
    // interrupts a running animation, the new plan starts from the last
    // authoritative state, so the pawn always converges on the server.
    if (
      prevToken.current.position !== token.position ||
      prevToken.current.isHome !== token.isHome ||
      prevToken.current.isFinished !== token.isFinished
    ) {
      const plan = computePathPlan(color, prevToken.current, token);
      anim.current = reducedMotion || plan.kind === 'none' ? null : { plan, start: -1 };
      prevToken.current = token;
    }

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
      const glow = clickable
        ? 0.55 + Math.sin(clock.current * 4) * 0.25
        : hovered && clickable
          ? 0.4
          : 0;
      mat.current.emissiveIntensity = THREE.MathUtils.lerp(
        mat.current.emissiveIntensity,
        glow,
        Math.min(1, dt * 8)
      );
    }
  });

  return (
    <group
      ref={group}
      onClick={(e) => {
        e.stopPropagation();
        if (clickable) onClick(playerId, token.id);
      }}
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
