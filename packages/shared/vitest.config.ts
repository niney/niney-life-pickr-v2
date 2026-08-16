import { defineConfig } from 'vitest/config';

// shared 의 플랫폼 비의존 로직(스토어·순수 헬퍼) 단위 테스트. React 컴포넌트를
// 렌더하지 않으므로 node 환경으로 충분하다 — 화면 렌더가 필요한 검증은
// apps/web 쪽 테스트(jsdom)가 담당한다.
export default defineConfig({
  resolve: {
    // 소스가 ESM `.js` import(moduleResolution Bundler + verbatimModuleSyntax)라
    // `.js` 를 `.ts` 로 먼저 해석하게 한다(friendly/utils 설정과 동일).
    extensionAlias: { '.js': ['.ts', '.js'] },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    server: {
      // 위 extensionAlias 가 @repo/* 내부의 `.js` 재export 에도 적용되도록 인라인.
      // 안 하면 네임스페이스 import 가 undefined 로 돌아온다(friendly 와 동일 근거).
      deps: { inline: [/^@repo\//] },
    },
  },
});
