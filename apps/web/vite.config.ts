import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // alias 로 react/react-dom 을 web 의 단일 카피로 강제 — packages/shared,
    // packages/utils 등이 자기 node_modules 의 react 를 끌고 와도 모두 같은
    // 인스턴스로 해석되어 "Invalid hook call / useMemo=null" 에러 방지.
    // (dedupe 만으로는 버전이 미세하게 다르면 합쳐지지 않아 두 카피가 됨.)
    alias: {
      '~': path.resolve(__dirname, './src'),
      // root 의 react/react-dom 카피로 강제 — 워크스페이스 패키지들이 각자
      // node_modules 에 다른 버전을 가지고 있어도 모두 같은 인스턴스 사용.
      react: path.resolve(__dirname, '../../node_modules/react'),
      'react-dom': path.resolve(__dirname, '../../node_modules/react-dom'),
    },
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
