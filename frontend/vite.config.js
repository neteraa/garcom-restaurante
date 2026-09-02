import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../backend/static',
    emptyOutDir: true,
  },
  server: {
    port: 8012,
    host: '0.0.0.0',
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:8011',
      '/ws': {
        target: 'ws://localhost:8011',
        ws: true,
        rewriteWsOrigin: true,
      },
      '/ws/kitchen': {
        target: 'ws://localhost:8011',
        ws: true,
        rewriteWsOrigin: true,
      },
    },
  },
})
