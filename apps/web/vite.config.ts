import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        // Where the dev server forwards /api (the API's own address, not VITE_API_URL)
        target: process.env['VITE_PROXY_TARGET'] ?? 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
