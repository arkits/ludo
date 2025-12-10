import { useEffect, useRef } from 'react';
import {
  AmbientLight,
  BoxGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  EdgesGeometry,
  Euler,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  Scene,
  ShadowMaterial,
  Vector3,
  WebGLRenderer,
} from 'three';
import './Dice.css';

interface DiceProps {
  value: number;
  isRolling?: boolean;
  show?: boolean;
}

type RollPhase = 'idle' | 'rolling' | 'settling';

const FACE_VALUES = [3, 4, 1, 6, 2, 5]; // +X, -X, +Y, -Y, +Z, -Z

function clampValue(value: number) {
  return value >= 1 && value <= 6 ? value : 1;
}

function createPipTexture(value: number) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    return new CanvasTexture(canvas);
  }

  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, '#ffffff');
  gradient.addColorStop(1, '#e8e8e3');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = '#d1d1cc';
  ctx.lineWidth = size * 0.04;
  ctx.strokeRect(
    ctx.lineWidth / 2,
    ctx.lineWidth / 2,
    size - ctx.lineWidth,
    size - ctx.lineWidth
  );

  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = size * 0.04;

  const pipPatterns: Record<number, Array<[number, number]>> = {
    1: [[0.5, 0.5]],
    2: [
      [0.3, 0.3],
      [0.7, 0.7],
    ],
    3: [
      [0.3, 0.3],
      [0.5, 0.5],
      [0.7, 0.7],
    ],
    4: [
      [0.3, 0.3],
      [0.7, 0.3],
      [0.3, 0.7],
      [0.7, 0.7],
    ],
    5: [
      [0.3, 0.3],
      [0.7, 0.3],
      [0.5, 0.5],
      [0.3, 0.7],
      [0.7, 0.7],
    ],
    6: [
      [0.3, 0.25],
      [0.7, 0.25],
      [0.3, 0.5],
      [0.7, 0.5],
      [0.3, 0.75],
      [0.7, 0.75],
    ],
  };

  ctx.fillStyle = '#151515';
  pipPatterns[value]?.forEach(([x, y]) => {
    ctx.beginPath();
    ctx.arc(x * size, y * size, size * 0.07, 0, Math.PI * 2);
    ctx.fill();
  });

  const texture = new CanvasTexture(canvas);
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

function createDiceMaterials() {
  return FACE_VALUES.map(
    (faceValue) =>
      new MeshStandardMaterial({
        map: createPipTexture(faceValue),
        roughness: 0.35,
        metalness: 0.08,
        color: new Color('#f7f7f2'),
      })
  );
}

function orientationForValue(value: number) {
  const safeValue = clampValue(value);
  const quat = new Quaternion();

  switch (safeValue) {
    case 1:
      quat.identity();
      break;
    case 2:
      quat.setFromEuler(new Euler(-Math.PI / 2, 0, 0));
      break;
    case 3:
      quat.setFromEuler(new Euler(0, 0, Math.PI / 2));
      break;
    case 4:
      quat.setFromEuler(new Euler(0, 0, -Math.PI / 2));
      break;
    case 5:
      quat.setFromEuler(new Euler(Math.PI / 2, 0, 0));
      break;
    case 6:
      quat.setFromEuler(new Euler(Math.PI, 0, 0));
      break;
    default:
      quat.identity();
      break;
  }

  return quat;
}

export default function Dice({ value, isRolling = false, show = true }: DiceProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<WebGLRenderer | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const cameraRef = useRef<PerspectiveCamera | null>(null);
  const diceRef = useRef<Mesh | null>(null);
  const rafRef = useRef<number | null>(null);
  const rollStateRef = useRef<{
    phase: RollPhase;
    spinStart: number;
    spinDuration: number;
    settleStart: number;
    settleDuration: number;
    spinAxis: Vector3;
    spinSpeed: number;
    startQuat: Quaternion;
    endQuat: Quaternion;
    bounce: number;
  }>({
    phase: 'idle',
    spinStart: 0,
    spinDuration: 1100,
    settleStart: 0,
    settleDuration: 600,
    spinAxis: new Vector3(1, 1, 0.4).normalize(),
    spinSpeed: 16,
    startQuat: new Quaternion(),
    endQuat: new Quaternion(),
    bounce: 0.18,
  });

  const startRolling = () => {
    if (!diceRef.current) return;
    const state = rollStateRef.current;
    state.phase = 'rolling';
    state.spinStart = performance.now();
    state.startQuat.copy(diceRef.current.quaternion);
    state.spinAxis = new Vector3(Math.random() - 0.5, Math.random(), Math.random() - 0.5).normalize();
    state.spinSpeed = 18 + Math.random() * 6;
    state.spinDuration = 1050 + Math.random() * 200;
    state.bounce = 0.18 + Math.random() * 0.08;
  };

  const startSettling = (nextValue: number) => {
    if (!diceRef.current) return;
    const targetValue = clampValue(nextValue);
    const state = rollStateRef.current;
    state.phase = 'settling';
    state.settleStart = performance.now();
    state.settleDuration = 520 + Math.random() * 220;
    state.startQuat.copy(diceRef.current.quaternion);

    const yaw = (Math.random() - 0.5) * 0.6;
    const yawQuat = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw);
    state.endQuat.copy(orientationForValue(targetValue)).multiply(yawQuat);
  };

  useEffect(() => {
    if (!show) return undefined;
    const container = containerRef.current;
    if (!container) return undefined;

    const renderer = new WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFSoftShadowMap;

    const scene = new Scene();
    const camera = new PerspectiveCamera(30, 1, 0.1, 50);
    camera.position.set(3, 2.8, 3.2);

    const ambient = new AmbientLight(0xffffff, 0.75);
    const keyLight = new DirectionalLight(0xffffff, 0.9);
    keyLight.position.set(3, 5, 4);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 12;
    keyLight.shadow.bias = -0.0002;

    const rimLight = new DirectionalLight(0xffffff, 0.35);
    rimLight.position.set(-4, 3, -3);

    scene.add(ambient, keyLight, rimLight);

    const ground = new Mesh(
      new PlaneGeometry(6, 6),
      new ShadowMaterial({ opacity: 0.22 })
    );
    ground.receiveShadow = true;
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.55;
    scene.add(ground);

    const geometry = new BoxGeometry(1, 1, 1);
    const materials = createDiceMaterials();
    const dice = new Mesh(geometry, materials);
    dice.castShadow = true;

    const edges = new LineSegments(
      new EdgesGeometry(geometry),
      new LineBasicMaterial({ color: '#1e1e1e', linewidth: 1 })
    );
    dice.add(edges);
    scene.add(dice);

    dice.quaternion.copy(
      orientationForValue(clampValue(value)).multiply(
        new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 10)
      )
    );

    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    rendererRef.current = renderer;
    sceneRef.current = scene;
    cameraRef.current = camera;
    diceRef.current = dice;

    const resizeObserver = new ResizeObserver(() => {
      if (!container || !cameraRef.current || !rendererRef.current) return;
      const { clientWidth, clientHeight } = container;
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(clientWidth, clientHeight);
    });
    resizeObserver.observe(container);

    const animate = (time: number) => {
      const diceMesh = diceRef.current;
      const activeRenderer = rendererRef.current;
      const activeScene = sceneRef.current;
      const activeCamera = cameraRef.current;
      if (diceMesh && activeRenderer && activeScene && activeCamera) {
        const state = rollStateRef.current;

        if (state.phase === 'rolling') {
          const t = Math.min((time - state.spinStart) / state.spinDuration, 1);
          const damping = 1 - 0.4 * t;
          const spinAngle = state.spinSpeed * t * damping;
          const spinQuat = new Quaternion().setFromAxisAngle(state.spinAxis, spinAngle);
          diceMesh.quaternion.copy(state.startQuat).multiply(spinQuat);
          diceMesh.position.y = Math.sin(t * Math.PI * 2) * state.bounce * (1 - t * 0.5);
        } else if (state.phase === 'settling') {
          const t = Math.min((time - state.settleStart) / state.settleDuration, 1);
          const eased = 1 - Math.pow(1 - t, 3);
          diceMesh.quaternion.copy(state.startQuat).slerp(state.endQuat, eased);
          diceMesh.position.y = Math.sin(t * Math.PI) * 0.08 * (1 - t);
          if (t >= 1) {
            state.phase = 'idle';
            diceMesh.quaternion.copy(state.endQuat);
            diceMesh.position.y = 0;
          }
        } else {
          diceMesh.position.y *= 0.9;
        }

        activeRenderer.render(activeScene, activeCamera);
      }
      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      resizeObserver.disconnect();
      renderer.dispose();
      materials.forEach((material) => {
        material.map?.dispose();
        material.dispose();
      });
      geometry.dispose();
      edges.geometry.dispose();
      edges.material.dispose();
      renderer.domElement.remove();
    };
  }, [show, value]);

  useEffect(() => {
    if (!diceRef.current) return;
    if (isRolling) {
      startRolling();
    } else {
      startSettling(value);
    }
  }, [isRolling, value]);

  if (!show) {
    return null;
  }

  const showResult = !isRolling && value > 0;

  return (
    <div className="dice-wrapper" aria-label={`Dice showing ${value}`}>
      <div className={`dice-viewport ${isRolling ? 'rolling' : 'settled'}`} ref={containerRef} />
      {showResult && <div className="dice-value-display">{value}</div>}
    </div>
  );
}