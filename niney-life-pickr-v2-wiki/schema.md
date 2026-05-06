---
name: niney-life-pickr-v2
mode: codebase
last_updated: 2026-05-07
---

# Wiki Schema

이 위키의 토픽 / 컨셉 명명 규약과 구조의 source of truth. 컴파일러는 이 파일을 보고 새 토픽을 만들 때 기존 슬러그를 우선 재사용한다.

## Conventions

- **Topic slug** — 워크스페이스 디렉터리명 또는 모듈 경계 기준 lowercase-kebab-case. 모노레포의 경우 `apps/<name>`/`packages/<name>` 디렉터리명을 그대로 사용. 도메인 단위로 더 좁히려면 `crawl`처럼 모듈명 단독 슬러그도 허용 (단, 충분한 양 + 활발한 활동이 있을 때).
- **Concept slug** — 패턴을 설명하는 짧은 구문 (`zod-ssot-buildless`, `sse-token-auth`). "결정의 결과"가 아니라 "결정 자체"가 슬러그가 되도록.
- **링크 스타일** — markdown (`[label](path.md)`). 위키 외부(루트, 소스)로 가는 링크는 상대 경로 `../../...`.
- **언어** — 본문은 한국어, 코드/식별자는 영어 그대로.
- **Coverage 태그** — 모든 섹션 헤딩에 `[coverage: high|medium|low — N sources]` 필수. 5+ sources = high, 2–4 = medium, 0–1 = low. Sources 섹션은 늘 high.

## Topics

| Slug | 범위 | 핵심 위치 |
|---|---|---|
| `project-overview` | 모노레포 전체 — 디렉터리, 워크플로, 공통 결정 | `README.md`, `CLAUDE.md`, `TECH_STACK.md`, 루트 설정 파일 |
| `friendly` | Fastify 백엔드 (crawl·ai 제외) | `apps/friendly/` |
| `crawl` | Naver Place 크롤러 모듈 | `apps/friendly/src/modules/crawl/` |
| `ai` | LLM 통합 (Ollama Cloud) — provider config DB, 어댑터, 병렬 요청, admin UI 연동 | `apps/friendly/src/modules/ai/`, `packages/api-contract/src/schemas/ai.ts`, `apps/web/src/routes/admin/AdminAi*Page.tsx` |
| `web` | Vite + React 19 SPA | `apps/web/` |
| `mobile` | Expo 52 + RN 0.76 앱 | `apps/mobile/` |
| `api-contract` | `@repo/api-contract` Zod 스키마 SSOT | `packages/api-contract/` |
| `shared` | `@repo/shared` FE 공통 (API/hooks/store/UI) | `packages/shared/` |
| `utils` | `@repo/utils` 순수 헬퍼 | `packages/utils/` |
| `config` | `@repo/config` tsconfig + ESLint 베이스 | `packages/config/` |

## Concepts

| Slug | 연결 토픽 | 패턴 한 줄 |
|---|---|---|
| `zod-ssot-buildless` | api-contract, friendly, shared, web, mobile, utils, project-overview, ai | Zod 스키마 SSOT는 빌드 없는 src export와 한 묶음 — 스키마 1개 변경 → 모든 컨슈머 컴파일 타임 동기화 |
| `sse-token-auth` | friendly, crawl, shared, web | EventSource 헤더 한계 → SSE만 `?token=` 쿼리 인증 + Pino 로거에서 정규식 리덕션 |
| `platform-ui-split` | shared, web, mobile, project-overview | 로직은 `@repo/shared`로 공유, UI는 `.web.tsx` / `.native.tsx`로 플랫폼 분기 — Tamagui/RN-Web 거부 |
| `workspace-package-resolution` | api-contract, friendly, shared, web, project-overview | `@repo/*` 컨슈머 도달 체인 — pnpm `injected` → vite extensionAlias → esbuild prebundle namespace re-export → autoload 우회. 한 단계 깨지면 컨슈머 import 에러로 일관 출몰 |

## Topic Structure (article sections)

`.wiki-compiler.json`의 `article_sections`에 정의된 codebase 모드 8개 섹션. 모든 토픽 문서는 이 순서·이름을 유지한다.

1. **Purpose** — 모듈/서비스가 하는 일과 의존자
2. **Architecture** — 키 파일·구조·진입점
3. **Talks To** — 의존, 통신 패턴, 인터-서비스 호출
4. **API Surface** — 노출 엔드포인트·익스포트 함수·인터페이스
5. **Data** — 테이블·컬렉션·큐·캐시·상태
6. **Key Decisions** — 왜 이렇게 만들었나 (ADR/README 발췌)
7. **Gotchas** — 알려진 이슈·엣지 케이스·실패 모드
8. **Sources** — 기여한 모든 소스 파일 백링크

## Evolution Log

- **2026-05-07** — 초기 스키마 생성. 9개 토픽(project-overview, friendly, crawl, web, mobile, api-contract, shared, utils, config) + 3개 컨셉(zod-ssot-buildless, sse-token-auth, platform-ui-split)으로 시작. Codebase 모드, deep_scan=false. 사용자가 토픽/컨셉을 추가·이름 변경하려면 이 표를 직접 편집한 뒤 `/wiki-compile`을 다시 돌리면 된다.
- **2026-05-07** — `ai` 토픽 추가 (Ollama Cloud 통합 + 어드민 키/테스트 UI 도입과 함께). `workspace-package-resolution` 컨셉 추가 — AI 모듈 작업 중 `Routes.Ai` namespace re-export 우회·`vitest.config` extensionAlias·workspace symlink 깨짐을 정리하면서 cross-cutting 함정으로 식별됨. `zod-ssot-buildless`의 연결 토픽에 `ai` 추가 (같은 SSOT 패턴이 신규 도메인에서도 그대로 적용됨).
