import { useEffect, useRef } from 'react';
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
  const polar = useRef(0.62); // radians from vertical
  const t = useRef(0);

  useEffect(() => {
    const el = gl.domElement;
    const down = (e: PointerEvent) => {
      drag.current = {
        active: true,
        x: e.clientX,
        y: e.clientY,
        az: azimuth.current,
        po: polar.current,
      };
    };
    const move = (e: PointerEvent) => {
      if (!drag.current.active) return;
      azimuth.current = THREE.MathUtils.clamp(
        drag.current.az - (e.clientX - drag.current.x) * 0.004,
        -0.5,
        0.5
      );
      polar.current = THREE.MathUtils.clamp(
        drag.current.po - (e.clientY - drag.current.y) * 0.003,
        0.35,
        1.15
      );
    };
    const up = () => {
      drag.current.active = false;
    };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (camera instanceof THREE.PerspectiveCamera) camera.clearViewOffset();
    };
  }, [gl, camera]);

  useFrame((_, dt) => {
    t.current += dt;
    // Fit board: pull back further on narrow screens.
    const aspect = size.width / size.height;
    // Fit the board (half-extent ~8.3 incl. frame) in the vertical fov,
    // which is the constraint on landscape screens; widen for portrait.
    const fovRad = (36 * Math.PI) / 180;
    const fit = 8.6 / Math.tan(fovRad / 2) / 2; // ≈ 13.2 at target, doubled margin below
    const dist = aspect > 1 ? fit * 1.95 : (fit * 1.95) / Math.min(aspect * 1.15, 1);
    const idle =
      reducedMotion || drag.current.active ? 0 : Math.sin(t.current * 0.25) * 0.045;
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

    // Pixel-space pan: shift the rendered frame up so the board sits higher
    // in the viewport, clear of the floating controls bar docked at the
    // bottom. Unlike nudging the lookAt target, this shift is exact in
    // screen pixels regardless of camera distance or aspect ratio.
    if (camera instanceof THREE.PerspectiveCamera) {
      const shiftPx = Math.round(size.height * 0.1);
      const fullHeight = size.height + shiftPx;
      camera.setViewOffset(size.width, fullHeight, 0, shiftPx, size.width, size.height);
      camera.updateProjectionMatrix();
    }
  });

  return null;
}
