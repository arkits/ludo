import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { PlayerColor } from '../../types/game';
import { BOARD_HALF } from './worldCoords';

// Corner directions (world x/z sign) per player color, matching board quadrants.
const CORNER: Record<PlayerColor, [number, number]> = {
  red: [-1, -1],
  green: [1, -1],
  blue: [-1, 1],
  yellow: [1, 1],
};

const QUAD: Array<[number, number]> = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
];

// The printed playing field — what has to stay on screen. The wooden frame
// around it (half-extent + 0.8) is free to run off the edges.
const FIELD_HALF = BOARD_HALF;
const FIELD_Y = 0.13;

const MIN_DIST = 9;
const MAX_DIST = 80;

function positionFor(out: THREE.Vector3, dist: number, az: number, po: number, cz: number) {
  out.set(
    Math.sin(az) * Math.sin(po) * dist,
    Math.cos(po) * dist,
    Math.cos(az) * Math.sin(po) * dist + cz
  );
}

// True when the whole playing field projects inside the viewport.
function fieldVisible(cam: THREE.PerspectiveCamera, ndc: THREE.Vector3[]): boolean {
  for (let i = 0; i < 4; i++) {
    const p = ndc[i].set(QUAD[i][0] * FIELD_HALF, FIELD_Y, QUAD[i][1] * FIELD_HALF);
    p.applyMatrix4(cam.matrixWorldInverse);
    // A corner behind the camera cannot be on screen.
    if (p.z > -0.05) return false;
    p.applyMatrix4(cam.projectionMatrix);
    if (Math.abs(p.x) > 1 || Math.abs(p.y) > 1) return false;
  }
  return true;
}

interface Props {
  activeCorner: PlayerColor | null;
  reducedMotion: boolean;
  /** Width in CSS px of UI covering the stage's left edge; the board is
   *  nudged right by half of it so it sits centred in what's left. */
  leftInset: number;
}

export default function CameraRig({ activeCorner, reducedMotion, leftInset }: Props) {
  const { camera, size, gl } = useThree();
  const drag = useRef({ active: false, x: 0, y: 0, az: 0, po: 0 });
  const azimuth = useRef(0);
  const polar = useRef(0.52); // radians from vertical
  const t = useRef(0);

  const probe = useMemo(() => new THREE.PerspectiveCamera(), []);
  const ndc = useMemo(() => [0, 1, 2, 3].map(() => new THREE.Vector3()), []);
  const target = useMemo(() => new THREE.Vector3(), []);
  const fit = useRef({ key: '', dist: MAX_DIST, pan: 0 });
  const placed = useRef(false);

  // Pixel-space pan: slide the frustum window left by `pan` px, which puts the
  // board that far right on screen. The frame keeps its full size, so this
  // shifts without zooming or distorting — a wider virtual frame would scale
  // the board up and eat the fit found below.
  const applyPan = (cam: THREE.PerspectiveCamera, pan: number) => {
    cam.setViewOffset(size.width, size.height, -pan, 0, size.width, size.height);
    cam.updateProjectionMatrix();
  };

  // How the board is framed: the closest the camera can sit with the whole
  // playing field on screen, plus how far right it can then be nudged out
  // from under the sidebar for free. Both are monotonic — more distance and
  // less pan each help — so short bisections find the bounds. Panning past
  // the slack would only shrink the board, so it is capped there. Cached
  // because it only moves when the viewport or the angles do.
  const framing = (az: number, po: number, cz: number) => {
    const key = `${size.width}x${size.height}|${leftInset}|${az.toFixed(2)}|${po.toFixed(2)}|${cz}`;
    if (fit.current.key === key) return fit.current;

    if (camera instanceof THREE.PerspectiveCamera) probe.copy(camera);
    const place = (dist: number) => {
      positionFor(probe.position, dist, az, po, cz);
      probe.lookAt(0, 0, 0);
      probe.updateMatrixWorld();
      probe.matrixWorldInverse.copy(probe.matrixWorld).invert();
    };

    applyPan(probe, 0);
    let lo = MIN_DIST;
    let hi = MAX_DIST;
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      place(mid);
      if (fieldVisible(probe, ndc)) hi = mid;
      else lo = mid;
    }
    const dist = THREE.MathUtils.clamp(hi, MIN_DIST, MAX_DIST);

    place(dist);
    let panLo = 0;
    let panHi = leftInset / 2;
    for (let i = 0; i < 10 && panHi > panLo; i++) {
      const mid = (panLo + panHi) / 2;
      applyPan(probe, mid);
      if (fieldVisible(probe, ndc)) panLo = mid;
      else panHi = mid;
    }

    fit.current = { key, dist, pan: panLo };
    return fit.current;
  };

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

    const idle =
      reducedMotion || drag.current.active ? 0 : Math.sin(t.current * 0.25) * 0.045;
    // Nudge toward active player's corner.
    const corner = activeCorner ? CORNER[activeCorner] : [0, 0];
    const targetAz = azimuth.current + idle + corner[0] * 0.1;
    const po = polar.current;
    const cz = corner[1] * 0.6;

    const { dist, pan } = framing(targetAz, po, cz);
    if (camera instanceof THREE.PerspectiveCamera) applyPan(camera, pan);
    positionFor(target, dist, targetAz, po, cz);
    // Snap on the first frame so the board opens already framed, then ease.
    const ease = reducedMotion || !placed.current ? 1 : Math.min(1, dt * 2.5);
    placed.current = true;
    camera.position.lerp(target, ease);
    camera.lookAt(0, 0, 0);
  });

  return null;
}
