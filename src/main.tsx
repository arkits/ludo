import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { inject } from '@vercel/analytics'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'
import { GameProvider } from './contexts/GameContext.tsx'
import { ConvexProvider, ConvexReactClient } from 'convex/react'

// Initialize Vercel Web Analytics
inject()

// Registered here rather than injected into every HTML entry, so the Telegram
// Mini App document (telegram.html) never gets a service worker.
registerSW({ immediate: true })

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConvexProvider client={convex}>
      <GameProvider>
        <App />
      </GameProvider>
    </ConvexProvider>
  </StrictMode>,
)
