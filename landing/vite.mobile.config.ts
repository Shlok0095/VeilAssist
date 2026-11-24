import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/** Standalone mobile interview bundle — packaged into the Android APK (not the marketing site). */
export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: 'dist-mobile',
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, 'mobile.html'),
    },
  },
  define: {
    'import.meta.env.VITE_MOBILE_APK': JSON.stringify('true'),
    'import.meta.env.VITE_API_ORIGIN': JSON.stringify(
      process.env.VITE_API_ORIGIN || 'https://veilassist-web.vercel.app',
    ),
  },
})
