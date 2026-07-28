import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { PlayerColor } from '../../types/game';
import { CELL, BOARD_HALF } from './worldCoords';
import { makeGrainTexture, makeHaloTexture } from './textures';
import { BOARD_TOP, TOKEN_COLORS, buildCells, HOME_BASES } from './boardModel';

const gridToWorld = (col: number, row: number): [number, number] => [col - 7, row - 7];

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

// Center triangle: base along shape y=+1.5 which lands on world z=-1.5
// after the -PI/2 X rotation, apex at the board center.
function centerTriangleShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-1.5, 1.5);
  s.lineTo(1.5, 1.5);
  s.lineTo(0, 0);
  s.closePath();
  return s;
}

const ARROW_ROT: Record<string, number> = {
  right: 0,
  down: -Math.PI / 2,
  left: Math.PI,
  up: Math.PI / 2,
};

interface HomeBaseProps {
  color: PlayerColor;
  col: number;
  row: number;
  active: boolean;
  reducedMotion: boolean;
  halo: THREE.Texture;
}

// Colored quadrant + white disc + 4 recessed wells. When it is this player's
// turn the quadrant breathes: the pad glows, a halo traces its border and a
// tinted light spills onto the surrounding wood.
function HomeBase({ color, col, row, active, reducedMotion, halo }: HomeBaseProps) {
  const pad = useRef<THREE.MeshStandardMaterial>(null!);
  const haloMat = useRef<THREE.MeshBasicMaterial>(null!);
  const light = useRef<THREE.PointLight>(null!);
  const clock = useRef(0);

  const cx = col + 3 - 7.5;
  const cz = row + 3 - 7.5;
  const c = TOKEN_COLORS[color];
  const wells: Array<[number, number]> = [
    [-0.8, -0.8],
    [0.8, -0.8],
    [-0.8, 0.8],
    [0.8, 0.8],
  ];

  useFrame((_, dt) => {
    clock.current += dt;
    // 0..1 breathing curve; held steady when the player prefers less motion.
    const pulse = reducedMotion ? 0.7 : 0.5 + Math.sin(clock.current * 2.2) * 0.5;
    const k = Math.min(1, dt * 6);
    if (pad.current) {
      pad.current.emissiveIntensity = THREE.MathUtils.lerp(
        pad.current.emissiveIntensity,
        active ? 0.18 + pulse * 0.3 : 0,
        k
      );
    }
    if (haloMat.current) {
      haloMat.current.opacity = THREE.MathUtils.lerp(
        haloMat.current.opacity,
        active ? 0.3 + pulse * 0.35 : 0,
        k
      );
    }
    if (light.current) {
      light.current.intensity = THREE.MathUtils.lerp(
        light.current.intensity,
        3 + pulse * 3.5,
        k
      );
    }
  });

  return (
    <group position={[cx, BOARD_TOP, cz]}>
      <mesh receiveShadow>
        <boxGeometry args={[6 * 0.98, 0.08, 6 * 0.98]} />
        <meshStandardMaterial
          ref={pad}
          color={c.light}
          emissive={c.main}
          emissiveIntensity={0}
          roughness={0.85}
        />
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
      {/* Halo, drawn additively just above the pad so it never z-fights. */}
      <mesh position={[0, 0.11, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2}>
        <planeGeometry args={[8.6, 8.6]} />
        <meshBasicMaterial
          ref={haloMat}
          map={halo}
          color={c.main}
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
      {active && (
        <pointLight
          ref={light}
          position={[0, 2.4, 0]}
          color={c.main}
          intensity={0}
          distance={9}
          decay={2}
        />
      )}
    </group>
  );
}

interface Board3DProps {
  activeCorner: PlayerColor | null;
  reducedMotion: boolean;
}

export default function Board3D({ activeCorner, reducedMotion }: Board3DProps) {
  const cells = useMemo(() => buildCells(), []);
  const paperTex = useMemo(() => makeGrainTexture('#f5f0dd'), []);
  const woodTex = useMemo(() => makeGrainTexture('#5c3d2e', { noise: 26 }), []);
  const halo = useMemo(() => makeHaloTexture(), []);
  const star = useMemo(
    () => new THREE.ExtrudeGeometry(starShape(), { depth: 0.02, bevelEnabled: false }),
    []
  );
  const arrow = useMemo(
    () => new THREE.ExtrudeGeometry(arrowShape(), { depth: 0.02, bevelEnabled: false }),
    []
  );
  const centerTri = useMemo(
    () => new THREE.ExtrudeGeometry(centerTriangleShape(), { depth: 0.04, bevelEnabled: false }),
    []
  );

  return (
    <group>
      {/* Wooden base slab + frame; its top sits slightly below the paper
          field so the two faces never z-fight. */}
      <mesh position={[0, -0.27, 0]} receiveShadow castShadow>
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
              <boxGeometry args={[CELL * 0.995, 0.05, CELL * 0.995]} />
              <meshStandardMaterial color={c.color} roughness={0.85} />
            </mesh>
            {c.kind === 'safe' && (
              <mesh geometry={star} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
                <meshStandardMaterial color="#8b6f47" roughness={0.6} />
              </mesh>
            )}
            {c.arrow && (
              <mesh
                geometry={arrow}
                rotation={[-Math.PI / 2, 0, ARROW_ROT[c.arrow]]}
                position={[0, 0.03, 0]}
              >
                <meshStandardMaterial color="#ffffff" roughness={0.6} />
              </mesh>
            )}
          </group>
        );
      })}

      {/* Home bases: the active player's quadrant glows to signal the turn */}
      {HOME_BASES.map(({ color, col, row }) => (
        <HomeBase
          key={color}
          color={color}
          col={col}
          row={row}
          active={activeCorner === color}
          reducedMotion={reducedMotion}
          halo={halo}
        />
      ))}

      {/* Center: four colored triangles meeting at the middle */}
      {(['red', 'green', 'yellow', 'blue'] as const).map((color, i) => {
        const rot = [0, -Math.PI / 2, Math.PI, Math.PI / 2][i];
        return (
          <group key={color} rotation={[0, rot, 0]}>
            <mesh
              geometry={centerTri}
              position={[0, BOARD_TOP + 0.02, 0]}
              rotation={[-Math.PI / 2, 0, 0]}
              receiveShadow
            >
              <meshStandardMaterial color={TOKEN_COLORS[color].main} roughness={0.7} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}
