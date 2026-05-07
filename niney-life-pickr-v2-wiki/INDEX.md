# niney-life-pickr-v2 Knowledge Base

Last compiled: 2026-05-07
Total topics: 10 | Total concepts: 6 | Mode: codebase

선택을 대신 골라주는 서비스 — pnpm + Turborepo 모노레포(Fastify API + Vite web + Expo mobile)의 컴파일된 위키. 처음 본다면 [project-overview](topics/project-overview.md) → 관심 토픽 순서로 읽는 것을 권장.

## Topics

| Topic | Also Known As | Sources | Last Updated | Status |
|-------|--------------|---------|-------------|--------|
| [project-overview](topics/project-overview.md) | monorepo, life-pickr, niney, root, turbo, pnpm-workspace | 7 | 2026-05-07 | active |
| [friendly](topics/friendly.md) | fastify-api, backend, prisma-server, jwt-auth, restaurant-module, summary-module | 36 | 2026-05-07 | active |
| [crawl](topics/crawl.md) | naver-place, scraping, playwright, sse-jobs, job-queue | 10 | 2026-05-07 | active |
| [ai](topics/ai.md) | llm, ollama, ollama-cloud, llm-provider, ai-keys, ai-test, completion, completeBatch | 15 | 2026-05-07 | active |
| [web](topics/web.md) | vite, react, web-app, frontend-web, admin-restaurants, active-job-panel | 28 | 2026-05-07 | active |
| [mobile](topics/mobile.md) | expo, react-native, expo-router, eas, ios, android | 15 | 2026-05-07 | active |
| [api-contract](topics/api-contract.md) | zod, schemas, ssot, contracts, @repo/api-contract, restaurant-schemas | 12 | 2026-05-07 | active |
| [shared](topics/shared.md) | react-query, zustand, design-tokens, ui-primitives, @repo/shared, summary-sse-manager, active-crawl-job-store | 31 | 2026-05-07 | active |
| [utils](topics/utils.md) | @repo/utils, pure-functions, helpers, slugify, pick-random | 5 | 2026-05-07 | active |
| [config](topics/config.md) | @repo/config, tsconfig, eslint, code-style | 8 | 2026-05-07 | active |

## Concepts

| Concept | Connects | Last Updated |
|---------|----------|-------------|
| [zod-ssot-buildless](concepts/zod-ssot-buildless.md) | api-contract, friendly, shared, web, mobile, utils, project-overview, ai | 2026-05-07 |
| [sse-token-auth](concepts/sse-token-auth.md) | friendly, crawl, shared, web | 2026-05-07 |
| [platform-ui-split](concepts/platform-ui-split.md) | shared, web, mobile, project-overview | 2026-05-07 |
| [workspace-package-resolution](concepts/workspace-package-resolution.md) | api-contract, friendly, shared, web, project-overview | 2026-05-07 |
| [stream-driven-cache-merge](concepts/stream-driven-cache-merge.md) | crawl, friendly, shared, web | 2026-05-07 |
| [in-memory-singleton-gates](concepts/in-memory-singleton-gates.md) | ai, crawl, friendly, shared | 2026-05-07 |

## How to navigate

- **새 작업 시작** → [project-overview](topics/project-overview.md)에서 디렉터리 지도와 워크플로 파악
- **백엔드 작업** → [friendly](topics/friendly.md), 크롤링 관련이면 [crawl](topics/crawl.md), LLM 관련이면 [ai](topics/ai.md)
- **맛집 도메인** (DB 영속화 + 다중 크롤 + AI 요약) → [crawl](topics/crawl.md) → [friendly](topics/friendly.md) (restaurant/summary 모듈) → [shared](topics/shared.md) → [web](topics/web.md) 순으로 흐름 따라가기
- **웹/모바일 변경** → [web](topics/web.md) 또는 [mobile](topics/mobile.md), 로직 공유 시 [shared](topics/shared.md)
- **스키마 추가** → [api-contract](topics/api-contract.md) (반드시 여기에 zod로 — CLAUDE.md 규칙)
- **`@repo/*` import 에러로 막힐 때** → [workspace-package-resolution](concepts/workspace-package-resolution.md)의 디버깅 순서 따라가기
- **SSE/캐시 머지 패턴** → [stream-driven-cache-merge](concepts/stream-driven-cache-merge.md), 동시성 제어는 [in-memory-singleton-gates](concepts/in-memory-singleton-gates.md)
- **횡단 패턴** → [concepts/](concepts/) 디렉터리 — Zod SSOT 인프라, SSE 인증, UI 플랫폼 분기, workspace 패키지 해결, 스트림 캐시 머지, 인메모리 게이트

## Recent Changes

- **2026-05-07** (재컴파일): 맛집 도메인 통합 — DB 영속화·다중 크롤 큐·SSE 멀티플렉싱 변경 흡수. `crawl`/`friendly`/`shared`/`web`/`api-contract` 5개 토픽 갱신. 신규 컨셉 2개: `stream-driven-cache-merge` (SSE 페이로드 직접 머지로 detail GET 회피), `in-memory-singleton-gates` (Redis 없이 모듈 싱글턴 + FIFO로 cap·순서·통합 모두 처리). `sse-token-auth`에 멀티플렉싱 endpoint instance 추가.
- **2026-05-07** (재컴파일): `ai` 토픽 신규 추가 (Ollama Cloud 통합 + 어드민 키/테스트 UI). `friendly`, `api-contract`, `shared`, `web` 토픽 갱신 (AI 라우트·스키마·훅·페이지 흡수). 컨셉 `workspace-package-resolution` 신규 추가 — vite/esbuild의 namespace re-export·pnpm `injected`·autoload 우회 패턴 정리. `zod-ssot-buildless` 컨셉에 ai instance 추가.
- **2026-05-07** (초기): 9개 토픽 + 3개 컨셉 생성. `wiki-init` 권장 설정으로 시작 (`mode: codebase`, `deep_scan: false`, `auto_update: prompt`).
