import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            // Cache all API responses with NetworkFirst (returns cached data when offline)
            urlPattern: ({ url }) => url.pathname.startsWith('/') && url.port !== '',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'chefos-api',
              networkTimeoutSeconds: 8,
              expiration: { maxEntries: 200, maxAgeSeconds: 86400 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      manifest: {
        name: 'ChefOS – Kitchen Intelligence',
        short_name: 'ChefOS',
        description: 'Professional kitchen management: recipes, inventory, events & costing.',
        theme_color: '#c8922a',
        background_color: '#141414',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    }),
  ],
})
