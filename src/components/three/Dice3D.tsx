import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { BOARD_TOP } from './boardModel';

const SIZE = 1.1;
const REST_Y = BOARD_TOP + SIZE / 2 + 0.03;

// Object-space normal of each numbered face.
// Textures assigned: +x=3, -x=4, +y=1, -y=6, +z=2, -z=5 (opposites sum to 7).
const FACE_NORMAL: Record<number, THREE.Vector3> = {
  1: new THREE.Vector3(0, 1, 0),
  2: new THREE.Vector3(0, 0, 1),
  3: new THREE.Vector3(1, 0, 0),
  4: new THREE.Vector3(-1, 0, 0),
  5: new THREE.Vector3(0, 0, -1),
  6: new THREE.Vector3(0, -1, 0),
};

const UP = new THREE.Vector3(0, 1, 0);

// Quaternion that puts the given face up (rotates its normal onto world +y).
function faceUpQuaternion(value: number): THREE.Quaternion {
  const normal = FACE_NORMAL[value] ?? FACE_NORMAL[1];
  return new THREE.Quaternion().setFromUnitVectors(normal, UP);
}

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
    () =>
      [3, 4, 1, 6, 2, 5].map(
        (v) =>
          new THREE.MeshStandardMaterial({
            map: faceTexture(v),
            roughness: 0.4,
            transparent: true,
            opacity: 0,
          })
      ),
    []
  );

  const wasRolling = useRef(false);
  const settleHeight = useRef(0.45);

  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;

    // Edge-detect roll start/end from props.
    if (isRolling && !wasRolling.current) {
      phase.current = reducedMotion ? 'hidden' : 'tumbling';
      phaseT.current = 0;
      spin.current.set(4 + Math.random() * 5, 6 + Math.random() * 5, 3 + Math.random() * 4);
    }
    if (!isRolling && wasRolling.current && value >= 1) {
      phase.current = reducedMotion ? 'resting' : 'settling';
      phaseT.current = 0;
      settleHeight.current = Math.max(g.position.y - REST_Y, 0.35);
    }
    wasRolling.current = isRolling;

    phaseT.current += dt;
    const t = phaseT.current;

    switch (phase.current) {
      case 'hidden':
        opacity.current = Math.max(0, opacity.current - dt * 3);
        break;
      case 'tumbling': {
        opacity.current = Math.min(1, opacity.current + dt * 6);
        const drop = Math.min(t / 0.5, 1);
        g.position.set(0, THREE.MathUtils.lerp(5, REST_Y + 0.55, drop), 0);
        g.rotation.x += spin.current.x * dt;
        g.rotation.y += spin.current.y * dt;
        g.rotation.z += spin.current.z * dt;
        break;
      }
      case 'settling': {
        // Damped bounce onto the board: |cos| gives repeated impacts, the
        // exponential kills each rebound; orientation converges within the
        // first fall so the correct face reads immediately.
        opacity.current = 1;
        const DURATION = 1.05;
        const k = Math.min(t / DURATION, 1);
        const bounce =
          settleHeight.current * Math.exp(-4.5 * t) * Math.abs(Math.cos(2 * Math.PI * 1.9 * t));
        g.position.set(0, REST_Y + bounce * (1 - k * 0.3), 0);
        g.quaternion.slerp(faceUpQuaternion(value), Math.min(1, dt * 9));
        if (k >= 1) {
          phase.current = 'resting';
          phaseT.current = 0;
        }
        break;
      }
      case 'resting': {
        opacity.current = Math.min(1, opacity.current + dt * 6);
        g.position.set(0, REST_Y, 0);
        g.quaternion.copy(faceUpQuaternion(value));
        if (t > (reducedMotion ? 1.2 : 1)) {
          phase.current = 'fading';
          phaseT.current = 0;
        }
        break;
      }
      case 'fading':
        opacity.current = Math.max(0, opacity.current - dt * 2.5);
        if (opacity.current <= 0) phase.current = 'hidden';
        break;
    }
    const mesh = g.children[0] as THREE.Mesh | undefined;
    if (mesh) {
      for (const m of mesh.material as THREE.MeshStandardMaterial[]) {
        m.opacity = opacity.current;
      }
      // Shadows can't fade with material opacity, so drop the shadow once
      // the die is mostly transparent instead of leaving a dark blob.
      mesh.castShadow = opacity.current > 0.55;
    }
    g.visible = opacity.current > 0.01;
  });

  return (
    <group ref={group} visible={false}>
      <mesh material={materials}>
        <boxGeometry args={[SIZE, SIZE, SIZE]} />
      </mesh>
    </group>
  );
}
