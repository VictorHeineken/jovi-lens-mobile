import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // .env lives at the repo root (shared with the backend and the native
  // app), not in web/ — point Vite's env loading there instead of its
  // default (this file's own directory).
  envDir: '../',
  server: {
    host: '127.0.0.1',
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: false,
      },
    },
  },
});
