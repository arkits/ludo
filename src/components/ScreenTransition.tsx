import type { ReactNode } from 'react';
import './ScreenTransition.css';

// Fades + scales its children in whenever screenKey changes (the key remounts
// the wrapper, restarting the CSS animation).
export default function ScreenTransition({
  screenKey,
  children,
}: {
  screenKey: string;
  children: ReactNode;
}) {
  return (
    <div key={screenKey} className="screen-transition">
      {children}
    </div>
  );
}
