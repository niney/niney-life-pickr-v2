---
concept: workspace 패키지 해결 체인 (injected → vite prebundle → namespace re-export)
last_compiled: 2026-06-25
topics_connected: [friendly, shared, web, api-contract, project-overview, mobile, review-search, review-clustering]
status: active
---

# workspace 패키지 해결 체인

## Pattern

이 모노레포는 `@repo/*` 패키지를 빌드 없이 `src/*.ts`로 직접 노출한다(→ [zod-ssot-buildless](./zod-ssot-buildless.md)). 이 약속이 동작하려면 패키지가 컨슈머의 런타임에 도달하기까지 거치는 **여러 단계의 해결 체인**이 모두 정상이어야 한다. 그런데 이 체인의 어느 한 군데가 깨지면 증상이 컨슈머 쪽에서 일관되게 나타나고, 같은 디버깅 패턴이 friendly·shared·web 어디서나 반복된다.

체인의 단계:
1. **pnpm `injected: true` (lock 파일)** — workspace 패키지를 symlink로 마운트할지, 실제 복사로 inject할지 결정.
2. **번들러 resolve** — vite/Vitest는 `.js` ESM import를 `.ts` 소스로 매핑해야 함 (`extensionAlias`). esbuild prebundle이 `export * as` namespace re-export의 inner export를 잃을 수 있음.
3. **autoload 우회** — fastify-autoload나 동적 `import()`는 vite resolve를 우회 → 통합 테스트는 별도 minimal app으로 등록.

체인이 깨질 때 즉시 보이는 증상은 단지 한 가지 import 에러지만, 진짜 원인은 위 단계 중 하나다. 같은 디버깅 절차를 매번 반복하지 않으려면 체인을 인지하고 있어야 한다.

## Instances

- **2026-05-07** in [api-contract](../topics/api-contract.md): `export * as Routes from './routes.js'` 형태의 namespace re-export. `Routes.Ai.complete` 같은 깊은 접근이 vite esbuild prebundle을 거치면서 `Routes.Ai`가 `undefined`로 나옴. friendly route 코드가 `TypeError: Cannot read properties of undefined (reading 'complete')`로 부팅 실패. 우회: `import { Routes } from '@repo/api-contract'; const AiRoutes = Routes.Ai;` (지역 변수에 한 번 받기).
- **2026-05-07** in [shared](../topics/shared.md): `aiApi`가 `Routes.Ai.providers` 사용 시 web 측에서 같은 `undefined` 증상. 우회: 모듈 상단에 `const AI_PREFIX = '/api/v1/admin/ai'`로 path 하드코드. SSOT 약속을 일부 양보.
- **2026-05-07** in [friendly](../topics/friendly.md): `vitest.config.ts`에 `resolve.extensionAlias: { '.js': ['.ts','.js'] }` + `server.deps.inline: [/^@repo\//]` 추가. 그래야 vitest가 `'./env.js'` import를 `env.ts`로 해소하고 workspace 패키지도 inline transform. 별개로 fastify-autoload는 dynamic `import()`라 vite resolve를 우회 → ai 통합 테스트는 `buildApp()` 대신 minimal Fastify 인스턴스로 plugin/route 직접 register.
- **2026-05-07** in [web](../topics/web.md): vite dev 서버가 deps prebundle을 캐싱 — workspace 패키지에 새 export가 추가되어도 옛 prebundle을 들고 있어 `does not provide an export named 'X'` 에러. 해결: `apps/web/node_modules/.vite/` 삭제 + dev 재시작.
- **2026-05-07** in [project-overview](../topics/project-overview.md): pnpm `injected: true`가 lock에서 빠지면 `apps/*/node_modules/@repo/*`가 symlink가 아닌 실제 복사로 마운트됨 → workspace 소스 변경이 컨슈머에 자동 반영되지 않아 수동 `cp`로 동기화. AI 모듈 작업 도중 lock이 `dependenciesMeta` 7줄을 잃으면서 이 증상 재현됨.
- **2026-05-28** in [mobile](../topics/mobile.md) (`apps/mobile/babel.config.js` — `replaceImportMeta` plugin): Expo Web 번들이 `@repo/shared` 와 직간접 의존인 zustand 의 ESM 빌드(`zustand/esm/middleware.mjs`) 를 끌어오는데, 그 안의 `import.meta.env` 가 일반 `<script defer>` 컨텍스트에서 SyntaxError 를 냄 (`<script type="module">` 아님). Metro/babel-preset-expo 는 `import.meta` 를 변환하지 않으므로 커스텀 babel plugin (`MetaProperty` visitor) 가 `import.meta` 를 `{ env: { MODE: 'production' } }` 객체 리터럴로 치환. 부수효과로 zustand devtools 가 prod 경로로 평가돼 비활성 — native 에서도 무해. **체인의 또 다른 단계가 표면화** — quad 패턴(`.web.tsx`/`.native.tsx`) 만으로는 풀리지 않고 **ESM-only 의존성이 비-ESM 스크립트 컨텍스트에 떨어질 때** babel transform 으로 흡수해야 함. 같은 디버깅 절차 — "어느 단계가 깨진 건가" 를 추적해 babel transform 으로 끝냄.

- **2026-06**(18차) in [[../topics/review-search]] / [[../topics/review-clustering]] / [[../topics/shared]] ([packages/shared/src/api/review-search.api.ts](../../packages/shared/src/api/review-search.api.ts) · [review-clustering.api.ts](../../packages/shared/src/api/review-clustering.api.ts) — 경로 하드코딩): 두 새 API 클라이언트가 `Routes.*` namespace 를 안 쓰고 엔드포인트 경로를 직접 하드코딩한다. 이유는 2026-05-07 의 vite esbuild prebundle 이 `export * as` namespace re-export 의 inner export 를 드롭하는 함정 회피 — `aiApi` 가 이미 `AI_PREFIX` 하드코드로 같은 우회를 쓰던 관례를 따랐다. 체인의 "namespace re-export 우회" 단계의 새 인스턴스 — SSOT 약속을 경로 한 줄만큼 양보하는 패턴이 review-search/review-clustering 으로 번졌다.

## What This Means

빌드 없는 src export([zod-ssot-buildless](./zod-ssot-buildless.md))가 "스키마 한 곳만 고치면 된다"는 약속을 지키려면, 그 아래에 깔린 도구 체인 — pnpm 인젝션, vite/esbuild resolve, tsconfig `moduleResolution: "Bundler"`, fastify-autoload — 가 모두 같은 가정에 동의하고 있어야 한다. 하나라도 깨지면 약속이 일부만 지켜진다.

이 concept이 알려주는 것:

1. **buildless의 비용은 도구 사이의 합의에 매달려 있다** — vite는 `.js` import를 `.ts`로 알아서 풀어야 하고, esbuild는 namespace re-export를 보존해야 하며, pnpm은 symlink를 유지해야 한다. 합의가 깨지면 컨슈머 측에서 정체불명의 import 에러로 보일 뿐, 어느 단계가 원인인지는 추적해야 안다.
2. **디버깅 순서가 정해져 있다** — workspace 패키지 import 에러를 만나면 (a) `node_modules/@repo/X`가 symlink인지(`Get-Item ... | Select LinkType`), (b) `.vite` 캐시 삭제 후 재시도, (c) namespace import는 변수에 받기, (d) `vitest.config.ts`의 `extensionAlias`/`server.deps.inline` 확인. 새 함정 만나면 이 절차에 한 단계 추가.
3. **autoload는 별도 트랙** — fastify-autoload는 vite의 module graph 밖이라 통합 테스트는 minimal app 패턴으로. 이를 모르고 `buildApp()`을 그대로 쓰면 `Cannot find module './env.js'` 같은 에러가 plugin에서 터진다.
4. **체인이 또 늘었다 — Expo Web ↔ ESM-only 의존성** (2026-05-28). 같은 워크스페이스 패키지(`@repo/shared`) 가 web (Vite) 과 mobile (Metro + Expo Web) 양쪽에서 소비되는데, mobile 의 Expo Web 빌드는 ESM-only 의존성(zustand `import.meta.env`) 을 비-ESM `<script defer>` 컨텍스트에 떨궈 SyntaxError 가 났다. quad 패턴은 컴포넌트 분기지 의존성 transform 까지는 못 한다 — `babel.config.js` 에 `replaceImportMeta` plugin 추가가 해결책. 새 빌드 타깃이 늘어날 때마다 같은 체인을 다시 검증해야 한다는 원칙이 또 확인됨.

이 패턴이 깨질 위험:
- pnpm 메이저 업그레이드 시 `injected` 동작이 바뀌면 lock 파일을 읽는 다른 워크플로(예: CI의 `pnpm install --frozen-lockfile`)가 다른 결과를 낳을 수 있음
- vite 7+ 에서 `extensionAlias` 동작이 바뀌면 vitest 설정 재조정 필요
- 새 빌드 도구(turborepo의 다른 모드, rolldown 등) 도입 시 같은 체인을 다시 검증해야 함
- 새 namespace re-export(예: 추후 `export * as Models from './models.js'`)가 추가되면 또 같은 우회 필요 — 가능하면 named export로 바꾸자

## Sources

- [api-contract](../topics/api-contract.md)
- [friendly](../topics/friendly.md)
- [shared](../topics/shared.md)
- [web](../topics/web.md)
- [project-overview](../topics/project-overview.md)
- [mobile](../topics/mobile.md)
- [review-search](../topics/review-search.md)
- [review-clustering](../topics/review-clustering.md)
