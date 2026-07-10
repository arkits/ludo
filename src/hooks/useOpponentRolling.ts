import { useEffect, useRef, useState } from 'react';

// Detects an opponent's dice roll (hasRolledDice rising edge while it's not
// the local player's turn) and reports "rolling" for a short animation window.
export function useOpponentRolling(hasRolledDice: boolean, isPlayerTurn: boolean): boolean {
  const [rolling, setRolling] = useState(false);
  const prevRolled = useRef(hasRolledDice);

  useEffect(() => {
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    if (!isPlayerTurn && hasRolledDice && !prevRolled.current) {
      timers.push(setTimeout(() => setRolling(true), 0));
      timers.push(setTimeout(() => setRolling(false), 1200));
    }
    prevRolled.current = hasRolledDice;
    return () => {
      for (const t of timers) clearTimeout(t);
    };
  }, [hasRolledDice, isPlayerTurn]);

  return rolling;
}
