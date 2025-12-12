import { useEffect, useState, useCallback } from 'react';
import './Dice.css';

interface DiceProps {
  value: number;
  isRolling?: boolean;
  show?: boolean;
}

export default function Dice({ value, isRolling = false, show = true }: DiceProps) {
  const [displayValue, setDisplayValue] = useState(value);
  const [animationComplete, setAnimationComplete] = useState(true);

  // Separate effect for rolling animation
  useEffect(() => {
    if (!isRolling) return;

    // Show random values during roll
    const interval = setInterval(() => {
      setDisplayValue(Math.floor(Math.random() * 6) + 1);
    }, 100);

    return () => clearInterval(interval);
  }, [isRolling]);

  // Separate effect to handle animation completion
  const handleAnimationEnd = useCallback(() => {
    setDisplayValue(value);
    setAnimationComplete(true);
  }, [value]);

  useEffect(() => {
    if (!isRolling) {
      const timeout = setTimeout(handleAnimationEnd, 100);
      return () => clearTimeout(timeout);
    } else {
      // Only update via timeout to avoid synchronous setState
      const timeout = setTimeout(() => setAnimationComplete(false), 0);
      return () => clearTimeout(timeout);
    }
  }, [isRolling, handleAnimationEnd]);

  if (!show) {
    return null;
  }

  // Only show result when animation is complete and not rolling
  const showResult = !isRolling && animationComplete;

  return (
    <div className="dice-wrapper">
      <div className={`dice-3d ${isRolling ? 'rolling' : 'settled'}`}>
        <div className="dice-cube">
          <div className="dice-face front">{renderDots(displayValue)}</div>
          <div className="dice-face back">{renderDots(displayValue)}</div>
          <div className="dice-face right">{renderDots(displayValue)}</div>
          <div className="dice-face left">{renderDots(displayValue)}</div>
          <div className="dice-face top">{renderDots(displayValue)}</div>
          <div className="dice-face bottom">{renderDots(displayValue)}</div>
        </div>
      </div>
      {(showResult && value > 0 || isRolling) && (
        <div key={showResult ? 'result' : 'rolling'} className="dice-value-display">
          {showResult ? value : "..."}
        </div>
      )}
    </div>
  );
}

function renderDots(value: number) {
  const dots = getDiceDots(value);
  return (
    <div className="dots-container">
      {dots.map((dot, index) => (
        <div
          key={index}
          className="dice-dot"
          style={{
            gridColumn: dot.col,
            gridRow: dot.row
          }}
        />
      ))}
    </div>
  );
}

function getDiceDots(value: number): Array<{ row: number; col: number }> {
  const patterns: Record<number, Array<{ row: number; col: number }>> = {
    1: [{ row: 2, col: 2 }],
    2: [{ row: 1, col: 1 }, { row: 3, col: 3 }],
    3: [{ row: 1, col: 1 }, { row: 2, col: 2 }, { row: 3, col: 3 }],
    4: [
      { row: 1, col: 1 },
      { row: 1, col: 3 },
      { row: 3, col: 1 },
      { row: 3, col: 3 }
    ],
    5: [
      { row: 1, col: 1 },
      { row: 1, col: 3 },
      { row: 2, col: 2 },
      { row: 3, col: 1 },
      { row: 3, col: 3 }
    ],
    6: [
      { row: 1, col: 1 },
      { row: 1, col: 2 },
      { row: 1, col: 3 },
      { row: 3, col: 1 },
      { row: 3, col: 2 },
      { row: 3, col: 3 }
    ]
  };

  return patterns[value] || [];
}

