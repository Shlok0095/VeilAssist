// Copyright (c) 2026 ShadowAssist. All rights reserved.
// Unauthorized copying or distribution is prohibited.

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  root: path.join(__dirname, 'renderer'),
  base: './',
  server: {
    fs: {
      allow: [path.join(__dirname, 'renderer'), __dirname],
    },
  },
  build: {
    outDir: path.join(__dirname, 'out'),
    emptyOutDir: true,
    /** Match modern Chromium in Electron — smaller, faster-to-parse output than ES5 legacy. */
    target: 'es2022',
    rollupOptions: {
      input: {
        'overlay/index': path.join(__dirname, 'renderer', 'overlay', 'index.html'),
        'settings/index': path.join(__dirname, 'renderer', 'settings', 'index.html'),
        'onboarding/index': path.join(__dirname, 'renderer', 'onboarding', 'index.html'),
        'consent/index': path.join(__dirname, 'renderer', 'consent', 'index.html'),
        'quit-confirm/index': path.join(__dirname, 'renderer', 'quit-confirm', 'index.html'),
        'meeting-toast/index': path.join(__dirname, 'renderer', 'meeting-toast', 'index.html'),
        'launcher/index': path.join(__dirname, 'renderer', 'launcher', 'index.html'),
        'global-chat/index': path.join(__dirname, 'renderer', 'global-chat', 'index.html'),
      },
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react-dom')) return 'vendor-react'
          if (id.includes('node_modules/react/')) return 'vendor-react'
          if (id.includes('node_modules/scheduler')) return 'vendor-react'
          if (id.includes('node_modules/highlight.js')) return 'vendor-hljs'
        },
      },
    },
  },
})
