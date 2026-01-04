import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Mathison UI - Vite Configuration
 *
 * ARCHITECTURE NOTE:
 * This UI is designed for the kernel-mac desktop interface (beams, chat, models).
 * It does NOT target mathison-server (the canonical product API for jobs/governance).
 *
 * Servers:
 * - mathison-server (port 3000): Canonical product API - jobs, memory, governance
 * - kernel-mac (port 3001): Desktop/development UI backend - beams, chat, llama
 *
 * The proxy targets kernel-mac since the UI endpoints (beams, chat, etc.) are
 * specific to that server.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
