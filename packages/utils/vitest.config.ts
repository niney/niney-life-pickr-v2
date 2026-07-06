import { defineConfig } from 'vitest/config';

// utils 순수 함수 단위 테스트. 소스가 ESM `.js` import(moduleResolution Bundler +
// verbatimModuleSyntax)라 `.js` 를 `.ts` 로 먼저 해석하게 한다(friendly 설정과 동일).
export default defineConfig({
  resolve: {
    extensionAlias: { '.js': ['.ts', '.js'] },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
