import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    port: 5173,
    // The FastAPI backend runs on :8000. ws: true proxies the live-room WebSocket too.
    proxy: { '/api': { target: 'http://localhost:8000', changeOrigin: true, ws: true } },
  },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
