import { useEffect, useMemo, useState } from 'react';
import './Dice.css';

interface DiceProps {
  value: number;
  isRolling?: boolean;
  show?: boolean;
}

type Rotation = { x: number; y: number; z: number };

function clampValue(value: number) {
  return value >= 1 && value <= 6 ? value : 1;
}

// Map each face so the requested value ends up on top.
function rotationForValue(value: number): Rotation {
  switch (clampValue(value)) {
    case 1:
      return { x: 0, y: 0, z: 0 };
    case 2:
      return { x: 0, y: 0, z: 90 };
    case 3:
      return { x: -90, y: 0, z: 0 };
    case 4:
      return { x: 90, y: 0, z: 0 };
    case 5:
      return { x: 0, y: 0, z: -90 };
    case 6:
      return { x: 180, y: 0, z: 0 };
    default:
      return { x: 0, y: 0, z: 0 };
  }
}

function randomTurns(base: number, extra: number) {
  return base + 360 * extra;
}

function renderDots(value: number) {
  const patterns: Record<number, Array<{ row: number; col: number }>> = {
    1: [{ row: 2, col: 2 }],
    2: [
      { row: 1, col: 1 },
      { row: 3, col: 3 },
    ],
    3: [
      { row: 1, col: 1 },
      { row: 2, col: 2 },
      { row: 3, col: 3 },
    ],
    4: [
      { row: 1, col: 1 },
      { row: 1, col: 3 },
      { row: 3, col: 1 },
      { row: 3, col: 3 },
    ],
    5: [
      { row: 1, col: 1 },
      { row: 1, col: 3 },
      { row: 2, col: 2 },
      { row: 3, col: 1 },
      { row: 3, col: 3 },
    ],
    6: [
      { row: 1, col: 1 },
      { row: 1, col: 2 },
      { row: 1, col: 3 },
      { row: 3, col: 1 },
      { row: 3, col: 2 },
      { row: 3, col: 3 },
    ],
  };

  const dots = patterns[value] || [];

  return (
    <div className="dots">
      {dots.map((dot, idx) => (
        <span
          key={`${value}-${idx}`}
          className="dot"
          style={{
            gridColumn: dot.col,
            gridRow: dot.row,
          }}
        />
      ))}
    </div>
  );
}

export default function Dice({ value, isRolling = false, show = true }: DiceProps) {
  const safeValue = clampValue(value);
  const [rotation, setRotation] = useState<Rotation>(() => rotationForValue(safeValue));

  const targetRotation = useMemo(() => rotationForValue(safeValue), [safeValue]);

  useEffect(() => {
    if (!show) return;

    if (isRolling) {
      // Add random whole spins so the animation looks natural but lands correctly.
      const spinsX = randomTurns(720, Math.floor(Math.random() * 3));
      const spinsY = randomTurns(720, Math.floor(Math.random() * 3));
      const spinsZ = randomTurns(360, Math.floor(Math.random() * 2));
      const frame = window.requestAnimationFrame(() =>
        setRotation({
          x: targetRotation.x + spinsX,
          y: targetRotation.y + spinsY,
          z: targetRotation.z + spinsZ,
        })
      );
      return () => window.cancelAnimationFrame(frame);
    } else {
      // Snap to the final orientation after rolling completes.
      const timer = window.setTimeout(() => setRotation(targetRotation), 60);
      return () => window.clearTimeout(timer);
    }
  }, [isRolling, targetRotation, show]);

  if (!show) {
    return null;
  }

  const showResult = !isRolling && safeValue > 0;

  return (
    <div className="dice-wrapper" aria-label={`Dice showing ${safeValue}`}>
      <div className={`dice-stage ${isRolling ? 'rolling' : 'settled'}`}>
        <div
          className="dice"
          style={{
            transform: `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg) rotateZ(${rotation.z}deg)`,
          }}
        >
          <div className="face face-1">{renderDots(1)}</div>
          <div className="face face-2">{renderDots(2)}</div>
          <div className="face face-3">{renderDots(3)}</div>
          <div className="face face-4">{renderDots(4)}</div>
          <div className="face face-5">{renderDots(5)}</div>
          <div className="face face-6">{renderDots(6)}</div>
        </div>
      </div>
      {showResult && <div className="dice-value-display">{safeValue}</div>}
    </div>
  );
}