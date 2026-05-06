---
topic: project-overview
last_compiled: 2026-05-07
sources_count: 6
status: active
aliases: [monorepo, life-pickr, niney, root, turbo, pnpm-workspace]
---

# project-overview — 모노레포 개요

루트 레벨에서 본 niney-life-pickr-v2 — "선택을 대신 골라주는 서비스" — 의 구조, 워크플로, 공통 규칙을 한 페이지로 정리한다. 개별 모듈에 대한 자세한 내용은 각 토픽 문서로.

## Purpose [coverage: high — 3 sources]

선택이 고민될 때 대신 골라주는 서비스다. 핵심 도메인은 "Pick" — 사용자가 선택지(`options`)를 등록해 두면, API가 무작위 결과를 골라 `PickResult`로 기록한다. 어드민은 네이버 플레이스 식당 데이터를 크롤링해 시드/추천 데이터로 활용한다 (자세한 건 [crawl 토픽](crawl.md)).

세 개의 클라이언트가 동일 백엔드를 공유한다:
- **friendly** — Fastify + Prisma + SQLite 백엔드
- **web** — Vite + React 19 SPA (어드민 콘솔 포함)
- **mobile** — Expo SDK 52 + React Native 0.76 앱 (어드민 UI 없음 — 의도)

## Architecture [coverage: high — 6 sources]

pnpm workspaces + Turborepo 기반 모노레포.

```
niney-life-pickr-v2/
├── apps/
│   ├── friendly/          Fastify 백엔드 → friendly 토픽
│   ├── web/               Vite + React SPA → web 토픽
│   └── mobile/            Expo + RN 앱 → mobile 토픽
├── packages/
│   ├── api-contract/      Zod SSOT → api-contract 토픽
│   ├── shared/            FE 공통 (API/hooks/store/UI) → shared 토픽
│   ├── utils/             순수 유틸 → utils 토픽
│   └── config/            tsconfig + ESLint 공유 → config 토픽
├── pnpm-workspace.yaml    apps/* + packages/*
├── turbo.json             dev / build / typecheck / lint / test 파이프라인
├── tsconfig.base.json     루트 TS 베이스 (ES2022, strict, noUncheckedIndexedAccess)
├── CLAUDE.md              에이전트 가이드 (이 위키와 함께 본다)
└── TECH_STACK.md          전체 기술 스택 명세
```

빌드 의존 관계: turbo가 `^build` 종속을 자동 추적한다. `dev` 태스크는 캐시 비활성화 + persistent로 워치 모드 유지.

## Talks To [coverage: high — 5 sources]

내부 패키지 의존 그래프 (단방향 — 순환 금지):

```
api-contract  ← 의존 ←  friendly, shared
shared        ← 의존 ←  web, mobile
utils         ← 의존 ←  friendly, web, mobile, shared (순수 함수만)
config        ← 의존 ←  모든 워크스페이스 (tsconfig/eslint)
```

런타임 통신:
- web → friendly (`VITE_API_URL`, dev에선 Vite proxy `/api` → `:3000`)
- mobile → friendly (`EXPO_PUBLIC_API_URL`, 빌드 시점 주입)
- friendly → SQLite 파일 (`apps/friendly/data/dev.db`)
- friendly → 네이버 플레이스 (Playwright)

스키마 1개 변경으로 FE/BE 모두 컴파일 타임 불일치 감지 — 자세한 건 [api-contract 토픽](api-contract.md).

## API Surface [coverage: medium — 2 sources]

루트 `package.json`이 노출하는 명령어 (turbo 위임):

| 명령 | 동작 |
|---|---|
| `pnpm dev` | 전체 dev (web + mobile + friendly 동시) |
| `pnpm dev:api` | friendly만 (`http://localhost:3000`, docs `/docs`) |
| `pnpm dev:web` | web만 (`http://localhost:5173`) |
| `pnpm dev:mobile` | Expo Dev Tools |
| `pnpm build` / `typecheck` / `lint` / `test` | 전체 turbo 태스크 |
| `pnpm format` | Prettier (semi, singleQuote, trailingComma=all, printWidth=100) |
| `pnpm clean` | turbo clean + node_modules 제거 |
| `pnpm --filter <name> ...` | 특정 워크스페이스 명령 위임 |

## Data [coverage: medium — 3 sources]

데이터 흐름 (단일 진실의 원천):

```
packages/api-contract (Zod schema)
     │ 검증+OpenAPI         │ 타입+fetch
     ▼                      ▼
  friendly                @repo/shared
  (Fastify)               (API client/hooks)
                           │           │
                           ▼           ▼
                          web        mobile
```

영속 데이터: SQLite 파일 (`apps/friendly/data/dev.db`), Prisma 마이그레이션. 클라이언트 토큰: web은 `localStorage` `lp:token`, mobile은 AsyncStorage `lp:token`.

## Key Decisions [coverage: high — 5 sources]

CLAUDE.md / TECH_STACK.md에 명시된 핵심 결정.

| 결정 | 이유 |
|---|---|
| **pnpm + Turbo + Node 22 LTS** | 디스크/속도/엄격성 + 캐싱 + 최신 LTS |
| **Zod SSOT (api-contract)** | FE/BE 동기화 — 빌드 없는 src export로 tsx/Vite/Metro 모두 호환 |
| **SQLite + Prisma** | MVP 규모엔 충분 — WAL, Litestream으로 운영 백업 가능 |
| **Vite 6 + React 19** (web) | SEO/SSR 불필요한 SPA → 단순화 |
| **Expo SDK 52 + RN 0.76 newArch + React 18** (mobile) | EAS Build/Update + 최신 RN 안정화. RN 0.77+에서 React 19 가능 |
| **TanStack Query + Zustand** | Redux 대비 보일러플레이트 ↓, 서버 상태와 클라 상태 분리 |
| **로직만 공유, UI는 플랫폼별** | Tamagui/RN-Web 통합 복잡도가 이득보다 큼 — `@repo/shared`로 로직만 공유 |
| **Docker 없음** (개발) | SQLite 파일 DB라 컨테이너 불필요 — DX 손해 |
| **Redis 없음** | 단일 인스턴스 + lru-cache로 충분 — 수평 확장 시점에 도입 |
| **Vitest** | Jest 대비 ESM/TS 친화적 |
| **Fastify 5** | Express 대비 성능/타입/플러그인 모델 우위 |

`tsconfig.base.json`은 `strict + noUncheckedIndexedAccess + verbatimModuleSyntax + isolatedModules` — 엄격 모드 풀스택.

## Gotchas [coverage: medium — 3 sources]

- **패키지 간 순환 의존 금지** — `shared → api-contract`는 OK, 반대는 금지 (CLAUDE.md)
- **공유 스키마는 반드시 `@repo/api-contract`에 zod로** — 직접 `apps/friendly`에 정의하면 web/mobile이 못 쓴다
- **Prisma DLL 락 (Windows)** — `db:generate` / `db:migrate` 전에 friendly dev 서버를 끈다. tsx watch가 살아 있으면 `EPERM ... query_engine-windows.dll.node` 에러
- **첫 관리자 만들기** — 회원가입은 항상 `role=USER`. 승격은 CLI: `pnpm --filter friendly promote-admin you@example.com`. 모바일엔 어드민 UI 없음 (의도)
- **HANDOFF 문서는 git에 넣지 말 것** — `docs/HANDOFF-*.md`는 untracked 유지
- **버전 매트릭스** — web은 React 19, mobile은 React 18 — `@repo/shared`가 React 18+ peer로 양쪽 호환

## Sources [coverage: high — 6 sources]

- [README.md](../../README.md)
- [CLAUDE.md](../../CLAUDE.md)
- [TECH_STACK.md](../../TECH_STACK.md)
- [package.json](../../package.json)
- [pnpm-workspace.yaml](../../pnpm-workspace.yaml)
- [turbo.json](../../turbo.json)
- [tsconfig.base.json](../../tsconfig.base.json)
