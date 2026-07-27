import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import TelegramApp from './TelegramApp.tsx'
import { ConvexProvider, ConvexReactClient } from 'convex/react'

/**
 * Entry point for the Telegram Mini App.
 *
 * Deliberately separate from src/main.tsx: web visitors never download the
 * Telegram SDK, and no shared component has to branch on whether it is running
 * inside Telegram. It also registers no service worker - a stale one inside
 * the Telegram webview is close to impossible for a user to clear, since there
 * is no hard refresh.
 */

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConvexProvider client={convex}>
      <TelegramApp />
    </ConvexProvider>
  </StrictMode>,
)
