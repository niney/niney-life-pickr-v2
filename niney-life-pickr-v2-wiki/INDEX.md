# niney-life-pickr-v2 Knowledge Base

Last compiled: 2026-05-07
Total topics: 9 | Total concepts: 3 | Mode: codebase

선택을 대신 골라주는 서비스 — pnpm + Turborepo 모노레포(Fastify API + Vite web + Expo mobile)의 컴파일된 위키. 처음 본다면 [project-overview](topics/project-overview.md) → 관심 토픽 순서로 읽는 것을 권장.

## Topics

| Topic | Also Known As | Sources | Last Updated | Status |
|-------|--------------|---------|-------------|--------|
| [project-overview](topics/project-overview.md) | monorepo, life-pickr, niney, root, turbo, pnpm-workspace | 7 | 2026-05-07 | active |
| [friendly](topics/friendly.md) | fastify-api, backend, prisma-server, jwt-auth | 26 | 2026-05-07 | active |
| [crawl](topics/crawl.md) | naver-place, scraping, playwright, sse-jobs | 9 | 2026-05-07 | active |
| [web](topics/web.md) | vite, react, web-app, frontend-web | 22 | 2026-05-07 | active |
| [mobile](topics/mobile.md) | expo, react-native, expo-router, eas, ios, android | 15 | 2026-05-07 | active |
| [api-contract](topics/api-contract.md) | zod, schemas, ssot, contracts, @repo/api-contract | 10 | 2026-05-07 | active |
| [shared](topics/shared.md) | react-query, zustand, design-tokens, ui-primitives, @repo/shared | 24 | 2026-05-07 | active |
| [utils](topics/utils.md) | @repo/utils, pure-functions, helpers, slugify, pick-random | 5 | 2026-05-07 | active |
| [config](topics/config.md) | @repo/config, tsconfig, eslint, code-style | 8 | 2026-05-07 | active |

## Concepts

| Concept | Connects | Last Updated |
|---------|----------|-------------|
| [zod-ssot-buildless](concepts/zod-ssot-buildless.md) | api-contract, friendly, shared, web, mobile, utils, project-overview | 2026-05-07 |
| [sse-token-auth](concepts/sse-token-auth.md) | friendly, crawl, shared, web | 2026-05-07 |
| [platform-ui-split](concepts/platform-ui-split.md) | shared, web, mobile, project-overview | 2026-05-07 |

## How to navigate

- **새 작업 시작** → [project-overview](topics/project-overview.md)에서 디렉터리 지도와 워크플로 파악
- **백엔드 작업** → [friendly](topics/friendly.md), 크롤링 관련이면 [crawl](topics/crawl.md)
- **웹/모바일 변경** → [web](topics/web.md) 또는 [mobile](topics/mobile.md), 로직 공유 시 [shared](topics/shared.md)
- **스키마 추가** → [api-contract](topics/api-contract.md) (반드시 여기에 zod로 — CLAUDE.md 규칙)
- **횡단 패턴** → [concepts/](concepts/) 디렉터리 — Zod SSOT 인프라, SSE 인증, UI 플랫폼 분기 패턴

## Recent Changes

- **2026-05-07**: 초기 컴파일 — 9개 토픽 + 3개 컨셉 생성. `wiki-init` 권장 설정으로 시작 (`mode: codebase`, `deep_scan: false`, `auto_update: prompt`).
