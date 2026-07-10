import { useMemo } from 'react';
import * as THREE from 'three';
import { CELL, BOARD_HALF } from './worldCoords';
import { makeGrainTexture } from './textures';
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

export default function Board3D() {
  const cells = useMemo(() => buildCells(), []);
  const paperTex = useMemo(() => makeGrainTexture('#f5f0dd'), []);
  const woodTex = useMemo(() => makeGrainTexture('#5c3d2e', { noise: 26 }), []);
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

      {/* Home bases: colored quadrant + white disc + 4 recessed wells */}
      {HOME_BASES.map(({ color, col, row }) => {
        const cx = col + 3 - 7.5;
        const cz = row + 3 - 7.5;
        const c = TOKEN_COLORS[color];
        const wells: Array<[number, number]> = [
          [-0.8, -0.8],
          [0.8, -0.8],
          [-0.8, 0.8],
          [0.8, 0.8],
        ];
        return (
          <group key={color} position={[cx, BOARD_TOP, cz]}>
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
