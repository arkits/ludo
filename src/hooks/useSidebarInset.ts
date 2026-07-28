import { useEffect, useState } from 'react';

// How much of the stage's left edge the floating sidebar covers, in CSS px.
// Mirrors `.game-container-playing .game-sidebar` in App.css — that layout
// only exists from 1025px up, below which the sidebar sits under the board.
const BREAKPOINT = 1025;
const GUTTER = 14;

function measure(): number {
  if (window.innerWidth < BREAKPOINT) return 0;
  const width = Math.min(300, Math.max(230, window.innerWidth * 0.18));
  return GUTTER + width + GUTTER;
}

export function useSidebarInset(): number {
  const [inset, setInset] = useState(measure);

  useEffect(() => {
    const update = () => setInset(measure());
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return inset;
}
