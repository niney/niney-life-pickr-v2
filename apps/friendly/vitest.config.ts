import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Load .env into process.env for tests. tsx watch uses --env-file at runtime,
// but vitest invokes node directly so we need to populate env ourselves.
// Existing values are not overwritten — caller can shadow via shell env.
const __dirname = dirname(fileURLToPath(import.meta.url));
try {
  const content = readFileSync(resolve(__dirname, '.env'), 'utf-8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key] !== undefined) continue;
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    process.env[key] = value;
  }
} catch {
  // Tests that don't need env will still run; ones that do will fail loudly.
}

export default defineConfig({
  resolve: {
    // The codebase uses ESM-style `.js` imports (per moduleResolution: Bundler
    // with verbatimModuleSyntax). Tell the resolver to try `.ts` first when
    // it sees a `.js` import, so test runs can find the actual sources.
    extensionAlias: { '.js': ['.ts', '.js'] },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // 단일 dev.db 를 공유하기 때문에 파일 병렬 실행은 안전하지 않다 — 한 테스트가
    // restaurant.deleteMany 로 cascade 삭제 중일 때 다른 파일의 read 가
    // 중간 상태를 잡아 "Field review is required ... got null" 같은 오류가
    // 단속적으로 발생한다. 격리된 DB 인스턴스를 따로 안 쓰는 한 직렬화가
    // 가장 단순하고 안정적인 보호선.
    fileParallelism: false,
    server: {
      // Inline workspace packages so the extensionAlias above also applies
      // to imports inside @repo/*. Otherwise their `*.js` re-exports stay
      // unresolved and namespace imports come back undefined.
      // @fastify/autoload uses dynamic import to load plugins/routes at
      // runtime — without inlining it goes through Node's resolver which
      // doesn't know about extensionAlias, so `import './foo.js'` fails to
      // resolve `foo.ts`. Inlining routes those imports through Vite's
      // pipeline.
      deps: { inline: [/^@repo\//, '@fastify/autoload'] },
    },
  },
});
