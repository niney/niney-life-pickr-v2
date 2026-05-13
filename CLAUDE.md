# CLAUDE.md

Claude Code를 위한 프로젝트 가이드.

## 프로젝트 개요

**niney-life-pickr-v2** — 선택을 대신 골라주는 서비스 (웹 + 앱 + API 모노레포).

기술 스택 전체 명세는 [TECH_STACK.md](TECH_STACK.md).

## 용어

문서·커밋·대화에서 다음 용어를 일관되게 쓴다 ("모바일"과 "앱"의 모호함 제거).

| 호칭 | 가리킴 | 코드 위치 |
|---|---|---|
| **웹** | Vite + React 19 SPA (공개 페이지 + 어드민) | `apps/web` |
| **앱** | Expo + RN 앱 전체 | `apps/mobile` |
| **iOS앱** / **Android앱** | 앱의 네이티브 빌드 | `apps/mobile` (분기 파일 없음 — RN 공통) |
| **Expo Web** | 앱의 RN-Web 출력 (`expo start --web`) | `apps/mobile` |
| **모바일** | **웹**의 작은 화면 / 반응형 레이아웃 | `apps/web` 반응형 CSS |
| **모바일 단말** | 휴대전화로 **웹** 접속 | — |

- 식별자(슬러그·디렉터리·스크립트)는 그대로: `apps/mobile`, `dev:mobile`, 위키 `mobile` 토픽.
- 한국어 본문에서 "모바일"이라는 단어는 **웹의 반응형**만 지칭. 앱을 가리킬 땐 항상 "앱".
- 커밋 스코프: `(web)`/`(mobile)` 기존 유지 — 디렉터리 슬러그 기준이므로 변경 없음.

## 핵심 규칙

### 1. 공유 스키마는 `@repo/api-contract`에 추가

FE/BE 모두 사용하는 타입/검증 로직은 반드시 `packages/api-contract/src/schemas/`에
**zod 스키마**로 정의한다. 그 뒤 `src/index.ts`에서 re-export.

- friendly: `fastify-type-provider-zod`가 자동 검증 + OpenAPI 생성
- 웹/앱: `@repo/shared`의 API 함수가 동일 타입으로 호출

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
pnpm dev:web          # 웹만
pnpm dev:mobile       # 앱만 (Expo Dev Tools, 인터랙티브 키)
pnpm dev:ios          # 앱 iOS 시뮬레이터 직행
pnpm dev:android      # 앱 Android 에뮬레이터 직행
pnpm typecheck        # 전체 타입체크
pnpm test             # 전체 테스트
pnpm --filter <name>  # 특정 워크스페이스만
```
