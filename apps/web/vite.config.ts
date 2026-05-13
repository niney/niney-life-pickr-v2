import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '~': path.resolve(__dirname, './src') },
    // 워크스페이스 패키지(@repo/shared 등)가 자기 node_modules 의 react 를
    // 끌고 와서 번들에 두 카피가 섞이는 경우 useMemo=null 에러가 난다.
    dedupe: ['react', 'react-dom', '@tanstack/react-query', 'zustand'],
    extensions: ['.web.tsx', '.web.ts', '.web.jsx', '.web.js', '.tsx', '.ts', '.jsx', '.js'],
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
