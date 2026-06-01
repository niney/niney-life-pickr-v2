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
  build: {
    rollupOptions: {
      output: {
        // Vite 8 의 번들러는 Rolldown — 객체형 manualChunks 대신 codeSplitting.groups
        // 사용. 첫 로드 바이트 절감은 라우트 lazy 가 담당하고, 여기선 vendor 청크를
        // 고정해 앱 코드만 바뀌어도 벤더 캐시가 유지되게 한다(automatic 분할은 그대로
        // 유지되며 아래 group 은 그 위에 vendor 만 추가로 묶는다). ol 은 식당/어드민
        // 청크가 공유하므로 단일 vendor 청크로 모은다.
        codeSplitting: {
          groups: [
            { name: 'ol', test: /[\\/]node_modules[\\/]ol[\\/]/ },
            {
              name: 'react-vendor',
              test: /[\\/]node_modules[\\/](react-router-dom|react-router|react-dom|react|scheduler)[\\/]/,
            },
            { name: 'query', test: /[\\/]node_modules[\\/]@tanstack[\\/]/ },
            { name: 'radix', test: /[\\/]node_modules[\\/]@radix-ui[\\/]/ },
          ],
        },
      },
    },
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      // 정산 카드 이미지(+OG 미리보기)는 Fastify 루트 경로에서 나온다. dev 에서도
      // 백엔드에 닿도록 프록시. prod 는 nginx 가 동일 prefix 를 Fastify 로 보낸다.
      '/share/settlements': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
