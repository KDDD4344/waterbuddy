/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

// WaterBuddy web app: React + TypeScript, installable as a PWA.
// The service worker (src/sw.ts) precaches the whole app, 3D scenes included, so it works
// offline, and shows reminders sent by web push (Phase 6).
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: 'WaterBuddy',
        short_name: 'WaterBuddy',
        description: 'Fill Pip’s bottle today. Get a postcard tomorrow.',
        lang: 'en-IN',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#F2EFE7',
        theme_color: '#0E3A49',
        categories: ['health', 'lifestyle'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2,glb}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024
      },
      devOptions: { enabled: false }
    })
  ],
  // The app imports sourced facts from the repo-level content/ folder.
  server: { port: 5175, strictPort: false, fs: { allow: ['.', '../../content'] } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    // Tests must not depend on a developer's local .env.
    env: { VITE_API_URL: '' }
  }
});
