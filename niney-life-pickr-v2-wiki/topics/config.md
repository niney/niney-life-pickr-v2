---
topic: config
last_compiled: 2026-05-07
sources_count: 8
status: active
aliases: ["@repo/config", tsconfig, eslint, code-style]
---

# config — 공유 tsconfig + ESLint

## Purpose [coverage: high — 1 sources]

`@repo/config` — 모든 워크스페이스가 extends하는 TypeScript / ESLint 공통 베이스. 4개의 tsconfig 프리셋(base, node, react, react-native)과 3개의 ESLint 프리셋(base, node, react)을 노출한다. 코드 자체는 들어 있지 않고 설정 파일만.

## Architecture [coverage: high — 8 sources]

```
packages/config/
├── package.json                   // exports — tsconfig/* + eslint/*
├── typescript/
│   ├── base.json                  // ES2022 + strict + noUncheckedIndexedAccess + verbatimModuleSyntax
│   ├── node.json                  // base + types: ['node']
│   ├── react.json                 // base + DOM lib + jsx: react-jsx
│   └── react-native.json          // base + jsx: react-jsx + allowJs + types: ['react-native']
└── eslint/
    ├── base.js                    // js.recommended + tseslint.recommended + 3개 룰
    ├── node.js                    // base + NodeJS global
    └── react.js                   // base + react-hooks + react-refresh
```

import 경로는 `@repo/config/tsconfig/{base,node,react,react-native}.json` 또는 `@repo/config/eslint/{base,node,react}`.

## Talks To [coverage: medium — 1 sources]

- 컨슈머: 모든 앱·패키지의 `tsconfig.json`이 base 중 하나를 extends하고, `eslint.config.js`가 base 중 하나를 spread
- 의존: `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh` (peer로 컨슈머가 설치)

## API Surface [coverage: high — 8 sources]

`package.json` exports 맵:

| 서브패스 | 실체 |
|---|---|
| `@repo/config/tsconfig/base.json` | ES2022 + strict 풀스택 베이스 |
| `@repo/config/tsconfig/node.json` | `+ types: ['node']` |
| `@repo/config/tsconfig/react.json` | `+ DOM lib`, `jsx: react-jsx`, `useDefineForClassFields` |
| `@repo/config/tsconfig/react-native.json` | `+ jsx: react-jsx`, `allowJs`, `types: ['react-native']` |
| `@repo/config/eslint/base` | flat config — js + tseslint recommended |
| `@repo/config/eslint/node` | base + `globals.NodeJS` |
| `@repo/config/eslint/react` | base + `react-hooks` + `react-refresh` |

## Data [coverage: low — 0 sources]

런타임 상태 없음 — 정적 설정만.

## Key Decisions [coverage: high — 5 sources]

- **strict + `noUncheckedIndexedAccess`** — 인덱스 접근 결과를 `T | undefined`로 강제. 모노레포 전체가 이 모드로 통일
- **`verbatimModuleSyntax`** — `import type` 명시 강제 (트랜스파일러 친화적)
- **`isolatedModules`** — 파일 단위 트랜스파일 보장 (Vite/tsx/esbuild에 필요)
- **`moduleResolution: Bundler`** — 번들러 시대 권장. Node 직접 실행 코드는 NodeNext로 별도 처리해도 됨 (friendly tsconfig 참고)
- **Flat config (ESLint 9)** — legacy `.eslintrc` 미사용. `tseslint.configs.recommended` + `react-hooks.configs.recommended.rules`
- **`no-console: warn` (allow warn/error)** — `console.log` 잔존 방지
- **`@typescript-eslint/consistent-type-imports: error`** — `import type` 사용 강제 (verbatimModuleSyntax와 호응)

## Gotchas [coverage: low — 1 sources]

- ESLint flat config의 ignore는 별도 객체로 분리해야 함 — base.js의 `ignores` 객체가 그 패턴
- `react.json`은 `useDefineForClassFields: true` 켜져 있음 — 클래스 필드 의미가 ES 표준화되어 있다는 점 인지
- `react-native.json`은 `allowJs: true` — RN 0.76 + Metro 환경 호환을 위한 의도적 허용

## Sources [coverage: high — 8 sources]

- [packages/config/package.json](../../packages/config/package.json)
- [packages/config/typescript/base.json](../../packages/config/typescript/base.json)
- [packages/config/typescript/node.json](../../packages/config/typescript/node.json)
- [packages/config/typescript/react.json](../../packages/config/typescript/react.json)
- [packages/config/typescript/react-native.json](../../packages/config/typescript/react-native.json)
- [packages/config/eslint/base.js](../../packages/config/eslint/base.js)
- [packages/config/eslint/node.js](../../packages/config/eslint/node.js)
- [packages/config/eslint/react.js](../../packages/config/eslint/react.js)
