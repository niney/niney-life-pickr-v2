// vitest/config 의 defineConfig — vite 설정을 그대로 쓰면서 test 필드까지
// 타입이 잡힌다. 별도 vitest.config.ts 를 두지 않는 이유는 아래 resolve.alias
// (react 단일 인스턴스 강제)를 테스트에서도 반드시 물려받아야 하기 때문.
//
// package.json 의 dev/build/preview 는 `--config vite.config.ts` 로 이 파일을 명시한다. Vite 는
// vite.config.js 를 .ts 보다 먼저 찾는데, 예전 `tsc -b` 가 흘린 vite.config.js(gitignore 됨)가 서버에
// 남아 있으면 이 파일의 변경이 조용히 무시된다(2026-10 운영 빌드가 그 상태였던 것으로 추정).
import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

// 첫 로드 가드 — 엔트리가 정적으로 닿는 청크(= index.html 이 preload 하는 것)에 three 가 끼면 빌드를
// 멈추고, zod 가 끼면 경고한다. 둘 다 한 번씩 조용히 새어 들어간 적이 있다:
//   - three(1MB): 청크 그룹 정규식에 공용 패키지(zustand)가 섞여 엔트리가 three 청크를 정적 import.
//   - zod(55kB)+스키마: 엔트리 경로의 스토어·API 클라이언트가 스키마 파일의 상수를 값으로 import.
//     (api-contract 의 constants.ts 머리 주석 — FE 가 값으로 쓰는 상수는 거기 둔다.)
const firstLoadGuard = (): Plugin => ({
  name: 'lp:first-load-guard',
  apply: 'build',
  generateBundle(_options, bundle) {
    interface ChunkLike {
      type: string;
      fileName: string;
      isEntry?: boolean;
      imports?: string[];
      modules?: Record<string, unknown>;
    }
    const chunks = (Object.values(bundle) as ChunkLike[]).filter((c) => c.type === 'chunk');
    const byFile = new Map(chunks.map((c) => [c.fileName, c]));
    const entry = chunks.find((c) => c.isEntry);
    if (!entry) return;
    const reached = new Set<string>();
    const stack = [entry.fileName];
    while (stack.length > 0) {
      const file = stack.pop()!;
      if (reached.has(file)) continue;
      reached.add(file);
      for (const dep of byFile.get(file)?.imports ?? []) stack.push(dep);
    }
    const chunksWith = (re: RegExp): string[] =>
      [...reached].filter((f) => Object.keys(byFile.get(f)?.modules ?? {}).some((id) => re.test(id)));
    const three = chunksWith(/[\\/]node_modules[\\/]three[\\/]/);
    if (three.length > 0) {
      this.error(
        `첫 로드에 three 가 들어갔습니다(${three.join(', ')}). 3D 밖에서도 쓰는 패키지가 three 청크 그룹에 섞였는지 확인하세요.`,
      );
    }
    const zod = chunksWith(/[\\/]node_modules[\\/]zod[\\/]/);
    if (zod.length > 0) {
      this.warn(
        `첫 로드에 zod 가 들어갔습니다(${zod.join(', ')}). 엔트리 경로가 @repo/api-contract 의 스키마 파일에서 값을 import 하는지 확인하세요 — 상수는 constants.ts 에 둡니다.`,
      );
    }
  },
});

export default defineConfig({
  plugins: [react(), tailwindcss(), firstLoadGuard()],
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
            // GeoJSON 파서(ol/format)와 그것만 쓰는 GeometryCollection 은 뺀다 — 배경 면 레이어(범죄 통계)를 켰을
            // 때와 어드민 지역 통계에서만 필요해, 그룹에 두면 모든 지도 페이지가 함께 받는다. 빼 두면 동적 import
            // (lib/useSigunguGeo) 쪽 청크(약 10kB)로 떨어진다.
            { name: 'ol', test: /[\\/]node_modules[\\/]ol[\\/](?!format[\\/]|geom[\\/]GeometryCollection)/ },
            // zustand(+use-sync-external-store)는 엔트리의 스토어와 R3F 가 함께 쓴다. 여기 넣지 않으면
            // Rolldown 이 그룹에 잡힌 모듈의 의존성까지 그 그룹으로 끌어가(includeDependenciesRecursively)
            // three 청크에 실리고, 엔트리가 three 청크(1MB)를 정적 import 하게 된다 — 첫 로드 2,059kB 실측.
            {
              name: 'react-vendor',
              test: /[\\/]node_modules[\\/](react-router-dom|react-router|react-dom|react|scheduler|zustand|use-sync-external-store)[\\/]/,
            },
            { name: 'query', test: /[\\/]node_modules[\\/]@tanstack[\\/]/ },
            { name: 'radix', test: /[\\/]node_modules[\\/]@radix-ui[\\/]/ },
            // 타로·사주 3D(three + R3F + drei + postprocessing) — 무대 lazy 청크만 참조하는 큰 벤더.
            // 3D 밖에서도 쓰는 패키지(zustand, @use-gesture — 지도 시트)는 넣지 않는다: 하나라도 들어가면
            // 그걸 쓰는 청크가 three 를 정적으로 끌어온다. 빌드 후 dist/index.html 의 modulepreload 에
            // three-*.js 가 없어야 정상.
            {
              name: 'three',
              test: /[\\/]node_modules[\\/](three|@react-three|postprocessing|n8ao|maath|its-fine|@monogrid|three-stdlib|three-mesh-bvh|meshline|camera-controls|detect-gpu|troika-.*|stats-gl|stats\.js|suspend-react|react-use-measure|glsl-noise|hls\.js|@mediapipe|tunnel-rat|utility-types|webgl-sdf-generator|bidi-js)[\\/]/,
            },
            // 둘 이상의 청크가 함께 쓰는 lucide 아이콘을 한 청크로. 자동 분할은 공유 아이콘마다 1kB 미만
            // 청크를 하나씩 만들어(139개 중 62개) 라우트 진입 요청 수를 불린다 — 맛집 상세 21 → 10 실측.
            { name: 'icons', test: /[\\/]node_modules[\\/]lucide-react[\\/]/, minShareCount: 2 },
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
      // 타로 공유 이미지(satori) — HTML(/tarot/s/<token>)은 dev 에선 Vite 가 SPA 로 서빙하고
      // 이미지만 friendly 로. prod 는 nginx `^~ /tarot/s/` 가 둘 다 friendly 로 보낸다.
      '^/tarot/s/[^/]+/image\\.png': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      // 사주 공유 이미지 — 타로와 동일 패턴(prod 는 nginx `^~ /saju-c/s/`).
      '^/saju-c/s/[^/]+/image\\.png': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/share/settlements': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      // smartly(apps/smartly, Python) — 어드민 '메뉴판 AI 테스트' 전용. 로컬 체험 서버라 운영 nginx 에는 없다.
      '/smartly-api': {
        target: 'http://127.0.0.1:8700',
        changeOrigin: true,
      },
    },
  },
  test: {
    // 컴포넌트 렌더 검증이라 DOM 이 필요하다(friendly/utils 는 node 환경).
    environment: 'jsdom',
    // globals 를 켜지 않는다 — friendly 와 동일하게 describe/it/expect 를 명시
    // import 한다. 대신 RTL 자동 cleanup 이 전역 afterEach 에 의존하므로
    // setup 에서 직접 등록한다.
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
