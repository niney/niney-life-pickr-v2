# CLAUDE.md

Claude Code를 위한 프로젝트 가이드.

## 프로젝트 개요

**niney-life-pickr-v2** — 선택을 대신 골라주는 서비스 (web + mobile + API 모노레포).

기술 스택 전체 명세는 [TECH_STACK.md](TECH_STACK.md).

## 핵심 규칙

### 1. 공유 스키마는 `@repo/api-contract`에 추가

FE/BE 모두 사용하는 타입/검증 로직은 반드시 `packages/api-contract/src/schemas/`에
**zod 스키마**로 정의한다. 그 뒤 `src/index.ts`에서 re-export.

- friendly: `fastify-type-provider-zod`가 자동 검증 + OpenAPI 생성
- web/mobile: `@repo/shared`의 API 함수가 동일 타입으로 호출

### 2. 공유 FE 로직은 `@repo/shared`에

- API 클라이언트 (`src/api/`)
- React Query 훅 (`src/hooks/`)
- Zustand 스토어 (`src/stores/`)

플랫폼별 UI는 각각 `apps/web`, `apps/mobile`에.

### 3. 패키지 import 경로

- `@repo/api-contract` — 스키마/타입
- `@repo/shared` — FE 공통
- `@repo/utils` — 순수 유틸
- 앱 내부: `~/*` 별칭 사용

### 4. Fastify 모듈 구조

`apps/friendly/src/modules/<domain>/`
- `*.route.ts` — HTTP 레이어 (autoload)
- `*.service.ts` — 비즈니스 로직
- `*.test.ts` — Vitest (`app.inject()` 사용)

### 5. DB

- SQLite (`apps/friendly/data/dev.db`)
- Prisma ORM
- 스키마 변경: `pnpm --filter friendly db:migrate`

## 안 되는 것

- **Docker 추가하지 말 것** (SQLite라 불필요)
- **Redis 사용 금지** (단일 인스턴스 + lru-cache로 충분)
- **패키지 간 순환 의존 금지** (shared → api-contract ✅, 반대는 ❌)

## 명령어

```bash
pnpm dev              # 전체 dev
pnpm dev:api          # friendly만
pnpm dev:web          # web만
pnpm dev:mobile       # mobile만
pnpm typecheck        # 전체 타입체크
pnpm test             # 전체 테스트
pnpm --filter <name>  # 특정 워크스페이스만
```
