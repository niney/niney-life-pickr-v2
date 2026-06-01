---
topic: config
last_compiled: 2026-05-31
sources_count: 13
status: active
aliases: ["@repo/config", tsconfig, eslint, code-style]
---

# config — 공유 tsconfig + ESLint

## Purpose [coverage: high — 6 sources]

`@repo/config` — 모든 워크스페이스가 extends/spread 하는 TypeScript / ESLint 공통 베이스. 4개의 tsconfig 프리셋(base, node, react, react-native)과 3개의 ESLint 프리셋(base, node, react)을 노출한다. 코드 자체는 들어 있지 않고 설정 파일만.

15차 라운드에서 ESLint 인프라가 전면 연결됐다: web / friendly / api-contract / mobile 네 워크스페이스의 `eslint.config.mjs` 가 모두 이 패키지의 프리셋을 확장해 `turbo lint` 가 **4/4 green** 을 달성했다. 그 결과 `eslint/base.js` 는 모노레포 전체 lint 규칙의 SSOT(single source of truth)가 됐다 — `lint` 스크립트를 가진 워크스페이스는 정확히 이 4개뿐(`apps/web`, `apps/friendly`, `apps/mobile`, `packages/api-contract`)이며 모두 base 를 거쳐 같은 TS 규칙을 공유한다.

## Architecture [coverage: high — 13 sources]

```
packages/config/
├── package.json                   // exports — tsconfig/* + eslint/* + lint 의존성
├── typescript/
│   ├── base.json                  // ES2022 + strict + noUncheckedIndexedAccess + verbatimModuleSyntax
│   ├── node.json                  // base + types: ['node']
│   ├── react.json                 // base + DOM lib + jsx: react-jsx
│   └── react-native.json          // base + jsx: react-jsx + allowJs + types: ['react-native']
└── eslint/
    ├── base.js                    // js.recommended + tseslint.recommended + 4개 룰 + ignores
    ├── node.js                    // base + NodeJS global
    └── react.js                   // base + react-hooks(v7) + react-refresh
```

import 경로는 `@repo/config/tsconfig/{base,node,react,react-native}.json` 또는 `@repo/config/eslint/{base,node,react}`.

**컨슈머 4개의 확장 방식** (각 워크스페이스 루트 `eslint.config.mjs`):

| 워크스페이스 | spread 하는 프리셋 | 추가 레이어 |
|---|---|---|
| [apps/web](../../apps/web/eslint.config.mjs) | `@repo/config/eslint/react` | react-hooks v7 진단 룰 8종 warn 강등 + `no-empty: warn` + `consistent-type-imports: warn` 강등 + `**/*.js` ignore(stale 빌드 산출물) |
| [apps/friendly](../../apps/friendly/eslint.config.mjs) | `@repo/config/eslint/node` | `no-useless-assignment`/`no-useless-escape`/`prefer-const`/`consistent-type-imports` warn 강등 + `prisma/migrations/**` ignore |
| [packages/api-contract](../../packages/api-contract/eslint.config.mjs) | `@repo/config/eslint/base` | `dist/**`/`node_modules/**` ignore 만 (순수 zod 패키지) |
| [apps/mobile](../../apps/mobile/eslint.config.mjs) | `@repo/config/eslint/react` | `no-require-imports: off`(RN 에셋/조건부 모듈 `require()` 관용) + React Compiler 진단 룰 4종 warn + `.expo/**`/`babel.config.js`/`metro.config.js` ignore |

각 컨슈머가 프리셋을 spread 한 뒤 자기 코드 사정에 맞춰 룰을 **warn 으로 강등**하는 패턴이 일관된다 — base 의 `consistent-type-imports: error` 를 web/friendly 가 다시 warn 으로 낮추는 식. 신규 코드 회귀 방지(가시성)는 유지하되 기존 코드를 강제로 깨지 않는 점진 도입 전략.

## Talks To [coverage: medium — 4 sources]

- 컨슈머: `lint` 스크립트를 가진 4개 워크스페이스(web/friendly/api-contract/mobile)의 `eslint.config.mjs` 가 프리셋을 spread, 그리고 모든 앱·패키지의 `tsconfig.json` 이 tsconfig 프리셋 중 하나를 extends.
- 루트 [package.json](../../package.json) 의 `"lint": "turbo lint"` 가 4개 워크스페이스 lint 를 fan-out — `turbo lint` 4/4 green.
- 의존(`@repo/config` 의 `dependencies` 로 직접 보유, 더 이상 컨슈머가 peer 로 각자 설치하지 않음): `@eslint/js@^10.0.1`, `eslint-plugin-react-hooks@^7.1.1`, `eslint-plugin-react-refresh@^0.5.2`, `typescript-eslint@^8.60.0`.

## API Surface [coverage: high — 13 sources]

`package.json` exports 맵:

| 서브패스 | 실체 |
|---|---|
| `@repo/config/tsconfig/base.json` | ES2022 + strict 풀스택 베이스 |
| `@repo/config/tsconfig/node.json` | `+ types: ['node']` |
| `@repo/config/tsconfig/react.json` | `+ DOM lib`, `jsx: react-jsx`, `useDefineForClassFields` |
| `@repo/config/tsconfig/react-native.json` | `+ jsx: react-jsx`, `allowJs`, `types: ['react-native']` |
| `@repo/config/eslint/base` | flat config — js + tseslint recommended + 4룰 + ignores |
| `@repo/config/eslint/node` | base + `globals.NodeJS` |
| `@repo/config/eslint/react` | base + `react-hooks`(v7) + `react-refresh` |

`eslint/base.js` 가 정의하는 4개 핵심 룰:

| 룰 | 설정 | 의도 |
|---|---|---|
| `@typescript-eslint/no-unused-vars` | `warn`, `argsIgnorePattern: '^_'` | 미사용 변수, `_` 접두 인자 허용 |
| `@typescript-eslint/consistent-type-imports` | `error` | `import type` 강제 (verbatimModuleSyntax 호응) |
| `no-console` | `warn`, `allow: ['warn','error']` | `console.log` 잔존 방지 |
| `no-undef` | `off` | TS 컴파일러가 미정의 식별자를 잡으므로 끔(typescript-eslint 공식 권장) — RN 글로벌(`__DEV__`, `requestAnimationFrame` 등) 오탐도 함께 제거 |

`base.js` 의 ignores: `dist/**`, `build/**`, `.turbo/**`, `node_modules/**`.

## Data [coverage: low — 0 sources]

런타임 상태 없음 — 정적 설정만.

## Key Decisions [coverage: high — 7 sources]

- **strict + `noUncheckedIndexedAccess`** — 인덱스 접근 결과를 `T | undefined`로 강제. 모노레포 전체가 이 모드로 통일
- **`verbatimModuleSyntax`** — `import type` 명시 강제 (트랜스파일러 친화적)
- **`isolatedModules`** — 파일 단위 트랜스파일 보장 (Vite/tsx/esbuild에 필요)
- **`moduleResolution: Bundler`** — 번들러 시대 권장. Node 직접 실행 코드는 NodeNext로 별도 처리해도 됨 (friendly tsconfig 참고)
- **Flat config (ESLint 9)** — legacy `.eslintrc` 미사용. `tseslint.configs.recommended` + `react-hooks.configs.recommended.rules`
- **`no-console: warn` (allow warn/error)** — `console.log` 잔존 방지
- **`@typescript-eslint/consistent-type-imports: error`** — `import type` 사용 강제 (verbatimModuleSyntax와 호응). 단, web/friendly 컨슈머는 기존 코드 사정으로 다시 `warn` 강등(`--fix` 로 대부분 해소)
- **`no-undef: off`** — TS 가 미정의 식별자를 더 정확히 잡으므로 ESLint 의 `no-undef` 를 끈다(typescript-eslint 공식 권장). 부수 효과로 RN 글로벌 오탐 제거
- **lint 의존성을 `@repo/config` 가 직접 소유** — `@eslint/js`/`typescript-eslint`/`react-hooks`/`react-refresh` 를 패키지의 `dependencies` 로 끌어와 컨슈머가 peer 로 각자 버전을 맞출 필요 없이 한 곳에서 핀
- **base 가 모노레포 lint SSOT** — 15차에 4개 워크스페이스가 모두 프리셋을 확장하면서, base.js 한 곳을 바꾸면 전 워크스페이스 TS 규칙이 동기화. `turbo lint` 4/4 green
- **앱(mobile)은 React Compiler 진단 룰 레이어 추가** — react-hooks v7 recommended 에 포함된 Compiler bailout 진단 룰(`set-state-in-effect`/`set-state-in-render`/`refs`/`immutability` 등)을 warn 으로 도입. `set-state-in-effect`/`set-state-in-render` 는 프로젝트의 "useEffect 회피·파생 상태는 렌더 중 계산" 원칙과 직결. web 도 같은 룰을 추가 도입(Vite babel 에 Compiler 는 아직 안 켰지만 "메모이즈 가능한 코드인지" 정적 검사로 유효)

## Gotchas [coverage: medium — 4 sources]

- ESLint flat config 의 ignore 는 별도 객체로 분리해야 함 — base.js 의 `ignores` 객체가 그 패턴. 각 컨슈머도 자기 ignore 를 별도 객체로 append(web 의 `**/*.js`, friendly 의 `prisma/migrations/**`, mobile 의 `.expo/**`/`babel.config.js`/`metro.config.js`)
- web 의 `**/*.js` ignore 는 tsc 가 잘못 흘린 stale 빌드 산출물(대부분 `.tsx` 짝이 있고 gitignore 됨)을 lint 대상에서 빼기 위함 — `.js` 가 의도된 소스가 아니라는 가정
- mobile 의 `@typescript-eslint/no-require-imports: off` — RN 이 에셋·조건부 네이티브 모듈을 `require()` 로 불러오는 게 관용적이라 base 의 TS 권장과 충돌
- React Compiler 진단 룰은 web/mobile 모두 **warn 으로만** 도입 — 기존 코드에 위반이 다수 잔존(앱 set-state-in-effect 등 29개). error 승격은 정리되는 대로 점진. 신규 코드 회귀 방지가 1차 목적
- `react.json` 은 `useDefineForClassFields: true` — 클래스 필드 의미가 ES 표준화되어 있다는 점 인지
- `react-native.json` 은 `allowJs: true` — RN + Metro 환경 호환을 위한 의도적 허용
- `no-undef: off` 라 순수 JS 환경에서 오타로 인한 미정의 참조는 ESLint 가 안 잡는다 — TS 컴파일(`typecheck`)에 의존. `.js` 전용 파일이 lint 만 돌고 typecheck 를 안 거치면 사각지대 가능

## Sources [coverage: high — 13 sources]

- [packages/config/package.json](../../packages/config/package.json)
- [packages/config/typescript/base.json](../../packages/config/typescript/base.json)
- [packages/config/typescript/node.json](../../packages/config/typescript/node.json)
- [packages/config/typescript/react.json](../../packages/config/typescript/react.json)
- [packages/config/typescript/react-native.json](../../packages/config/typescript/react-native.json)
- [packages/config/eslint/base.js](../../packages/config/eslint/base.js)
- [packages/config/eslint/node.js](../../packages/config/eslint/node.js)
- [packages/config/eslint/react.js](../../packages/config/eslint/react.js)
- [apps/web/eslint.config.mjs](../../apps/web/eslint.config.mjs)
- [apps/friendly/eslint.config.mjs](../../apps/friendly/eslint.config.mjs)
- [packages/api-contract/eslint.config.mjs](../../packages/api-contract/eslint.config.mjs)
- [apps/mobile/eslint.config.mjs](../../apps/mobile/eslint.config.mjs)
- [package.json](../../package.json)
