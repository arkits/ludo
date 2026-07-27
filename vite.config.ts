import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const entry = (file: string) => fileURLToPath(new URL(file, import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        // The web app.
        main: entry('./index.html'),
        // The Telegram Mini App - a separate document so web visitors never
        // download the Telegram SDK and no shared component has to branch on
        // which surface it is running in.
        telegram: entry('./telegram.html'),
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Registered explicitly from src/main.tsx instead of being injected
      // into every HTML entry. A service worker inside the Telegram webview
      // is close to impossible for a user to clear - there is no hard
      // refresh - so the Mini App must never get one.
      injectRegister: null,
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      manifest: {
        name: 'Ludo - Classic Board Game Online',
        short_name: 'Ludo',
        description: 'Play Ludo online with friends! The classic board game experience in your browser.',
        theme_color: '#4a5568',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Keep the Mini App document out of the precache entirely.
        globIgnores: ['**/telegram.html'],
        // The SPA fallback would otherwise answer a navigation to
        // /telegram.html with the precached index.html shell, booting the web
        // app inside Telegram.
        navigateFallbackDenylist: [/^\/telegram\.html$/],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      }
    })
  ],
})
