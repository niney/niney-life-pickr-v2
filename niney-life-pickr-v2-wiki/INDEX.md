# niney-life-pickr-v2 Knowledge Base

Last compiled: 2026-05-09
Total topics: 13 | Total concepts: 8 | Mode: codebase

선택을 대신 골라주는 서비스 — pnpm + Turborepo 모노레포(Fastify API + Vite web + Expo mobile)의 컴파일된 위키. 처음 본다면 [project-overview](topics/project-overview.md) → 관심 토픽 순서로 읽는 것을 권장. 사용자 대상 공개 페이지(`/`, `/restaurants`)와 어드민 운영 도구가 한 SPA 안에 분리되어 있다.

## Topics

| Topic | Also Known As | Sources | Last Updated | Status |
|-------|--------------|---------|-------------|--------|
| [project-overview](topics/project-overview.md) | monorepo, life-pickr, niney, root, turbo, pnpm-workspace, public-admin-split, MapProviderConfig | 9 | 2026-05-09 | active |
| [friendly](topics/friendly.md) | fastify-api, backend, prisma-server, jwt-auth, restaurant-module, summary-module, media-module, analytics-module, menu-grouping-module, settings-module, thumbnail-proxy, MapSettingsService, public-restaurants-routes | 55 | 2026-05-09 | active |
| [crawl](topics/crawl.md) | naver-place, scraping, playwright, sse-jobs, job-queue, visitor-videos, review-sort | 11 | 2026-05-08 | active |
| [ai](topics/ai.md) | llm, ollama, ollama-cloud, llm-provider, ai-keys, ai-test, completion, completeBatch, structured-output, json-schema, num_ctx, retry-backoff, analysis-version, menu-grouping-version, global-merge-version | 17 | 2026-05-09 | active |
| [menu-grouping](topics/menu-grouping.md) | menu-canonical, restaurant-menu-normalization, menusGroup, menusRanking, grouping-job, MENU_GROUPING_VERSION, unmappedMenus, GlobalCompareBadge | 9 | 2026-05-09 | active |
| [analytics](topics/analytics.md) | global-menu-merge, global-menu-canonical, categoryPath, category-tree, GLOBAL_MERGE_VERSION, two-pass-merge, normalizeCategoryPath, AdminAnalyticsPage, GlobalMenuStat | 11 | 2026-05-09 | active |
| [map](topics/map.md) | vworld, openlayers, wmts, map-canvas, vworld-map, public-restaurants-map, MapProviderConfig, settings-map, /admin/settings/map | 18 | 2026-05-09 | active |
| [web](topics/web.md) | vite, react, web-app, frontend-web, public-page, restaurants-page, PublicLayout, PublicRestaurantList, PublicRestaurantDetail, MapCanvas, ImgWithFallback, admin-restaurants, admin-analytics, ai-analysis-management, AdminMapKeysPage, AdminSettingsPage, /admin/settings, active-job-panel, video-modal, sentiment-badge, MenuRankingSection, GlobalCompareBadge, CategoryTreeSection, pretendard | 50 | 2026-05-09 | active |
| [mobile](topics/mobile.md) | expo, react-native, expo-router, eas, ios, android, restaurant-tab, MenuRankingCard | 19 | 2026-05-09 | active |
| [api-contract](topics/api-contract.md) | zod, schemas, ssot, contracts, @repo/api-contract, restaurant-schemas, public-restaurant-schemas, RestaurantPublicListItem, RestaurantPublicDetail, MapProviderPublicConfig, visitor-review-video, review-analysis, MenuRankingItem, GlobalMenuStat, CategoryTreeNode, z-lazy | 15 | 2026-05-09 | active |
| [shared](topics/shared.md) | react-query, zustand, design-tokens, ui-primitives, @repo/shared, useRestaurantsPublic, useRestaurantPublic, useMapPublicConfig, summary-sse-manager, useMenuRanking, useGroupingJob, useGlobalMergeJob, useCategoryTree | 37 | 2026-05-09 | active |
| [utils](topics/utils.md) | @repo/utils, pure-functions, helpers, slugify, pick-random, reviewThumbnailUrl, thumbnail-proxy-helper | 6 | 2026-05-08 | active |
| [config](topics/config.md) | @repo/config, tsconfig, eslint, code-style | 8 | 2026-05-07 | active |

## Concepts

| Concept | Connects | Last Updated |
|---------|----------|-------------|
| [zod-ssot-buildless](concepts/zod-ssot-buildless.md) | api-contract, friendly, shared, web, mobile, utils, ai, menu-grouping, analytics, map, project-overview | 2026-05-09 |
| [public-admin-route-split](concepts/public-admin-route-split.md) | friendly, api-contract, shared, web, map, project-overview | 2026-05-09 |
| [sse-token-auth](concepts/sse-token-auth.md) | friendly, crawl, shared, web, menu-grouping, analytics | 2026-05-09 |
| [platform-ui-split](concepts/platform-ui-split.md) | shared, web, mobile, project-overview | 2026-05-07 |
| [workspace-package-resolution](concepts/workspace-package-resolution.md) | api-contract, friendly, shared, web, project-overview | 2026-05-07 |
| [stream-driven-cache-merge](concepts/stream-driven-cache-merge.md) | crawl, friendly, shared, web, menu-grouping, analytics | 2026-05-09 |
| [in-memory-singleton-gates](concepts/in-memory-singleton-gates.md) | ai, crawl, friendly, shared, menu-grouping, analytics | 2026-05-09 |
| [versioned-llm-prompts](concepts/versioned-llm-prompts.md) | ai, friendly, menu-grouping, analytics | 2026-05-09 |

## How to navigate

- **새 작업 시작** → [project-overview](topics/project-overview.md)에서 디렉터리 지도와 워크플로 파악
- **백엔드 작업** → [friendly](topics/friendly.md), 크롤링 관련이면 [crawl](topics/crawl.md), LLM 관련이면 [ai](topics/ai.md), 지도 키 관리면 [map](topics/map.md)
- **공개 사용자 페이지** (`/`, `/restaurants` — 풀 뷰포트 + 5탭 상세 + 지도) → [web](topics/web.md) → [shared](topics/shared.md) (공개 훅 `useRestaurantsPublic` 등) → [friendly](topics/friendly.md) (공개 라우트 3개) → [map](topics/map.md) (vworld 통합)
- **메뉴 분석 도메인** (분석 → 식당별 그룹핑 → 전역 머지 → 카테고리) → [menu-grouping](topics/menu-grouping.md) → [analytics](topics/analytics.md). 운영은 admin "AI 분석 관리" 페이지([web](topics/web.md))에서.
- **맛집 도메인** (DB 영속화 + 다중 크롤 + AI 요약 + 미디어 프록시) → [crawl](topics/crawl.md) → [friendly](topics/friendly.md) (restaurant/summary/media 모듈) → [shared](topics/shared.md) → [web](topics/web.md) 순으로 흐름 따라가기
- **vworld 지도 작업** (어드민 단일 마커 / 공개 다중 마커 / WMTS 키 관리) → [map](topics/map.md) — OpenLayers + WMTS 직접, JS SDK 거부 이유, 어드민/공개 키 노출 보안 등급
- **웹/모바일 변경** → [web](topics/web.md) 또는 [mobile](topics/mobile.md), 로직 공유 시 [shared](topics/shared.md)
- **스키마 추가** → [api-contract](topics/api-contract.md) (반드시 여기에 zod로 — CLAUDE.md 규칙). 공개/어드민 페어로 분리해야 하면 [public-admin-route-split](concepts/public-admin-route-split.md) 패턴 따라가기.
- **LLM 프롬프트/스키마 변경** → [versioned-llm-prompts](concepts/versioned-llm-prompts.md) — `*_VERSION` 상수 올리고 stale 데이터 처리 흐름 확인
- **`@repo/*` import 에러로 막힐 때** → [workspace-package-resolution](concepts/workspace-package-resolution.md)의 디버깅 순서 따라가기
- **SSE/캐시 머지 패턴** → [stream-driven-cache-merge](concepts/stream-driven-cache-merge.md), 동시성 제어는 [in-memory-singleton-gates](concepts/in-memory-singleton-gates.md)
- **횡단 패턴** → [concepts/](concepts/) 디렉터리 — Zod SSOT 인프라, 공개/어드민 라우트 페어 분리, SSE 인증, UI 플랫폼 분기, workspace 패키지 해결, 스트림 캐시 머지, 인메모리 게이트, LLM 프롬프트 버전

## Recent Changes

- **2026-05-09** (재컴파일): 공개 사용자 페이지 도입 (`/restaurants` 네이버 지도 스타일 풀 뷰포트 + 3-column + 5탭 상세) + vworld 지도 통합. 신규 토픽 1개 ([map](topics/map.md) — OpenLayers + WMTS 직접, `MapProviderConfig` DB 키, 어드민·공개 양쪽 사용) + 신규 컨셉 1개 ([public-admin-route-split](concepts/public-admin-route-split.md) — 공개/어드민 라우트·스키마·훅 페어 분리). 갱신 토픽 5개: [friendly](topics/friendly.md) (settings 모듈 + 공개 라우트 3개), [api-contract](topics/api-contract.md) (`RestaurantPublic*` 6종 + `MapProviderPublicConfig` zod 페어), [shared](topics/shared.md) (`useRestaurantsPublic` 등 공개 훅), [web](topics/web.md) (3-column + 5탭 detail + `MapCanvas` + `ImgWithFallback` + Pretendard + 텍스트 시프트 + `/admin/settings` 탭 통합), [project-overview](topics/project-overview.md) (공개 vs 어드민 분리 정책 정착). [zod-ssot-buildless](concepts/zod-ssot-buildless.md) 에 map + 공개 맛집 페어 인스턴스 추가. 신규 의존성 `ol@^10.7.0`. Prisma 신규 테이블 `MapProviderConfig` + 마이그레이션 `20260508173216_add_map_provider_configs`.
- **2026-05-09** (재컴파일): 메뉴 분석 파이프라인 확장 (식당 단위 그룹핑 + 글로벌 머지 + 카테고리 트리). 신규 토픽 2개 (`menu-grouping`, `analytics`) + 신규 컨셉 1개 (`versioned-llm-prompts`). `friendly`/`api-contract`/`shared`/`web`/`mobile`/`ai`/`project-overview` 7개 토픽 갱신. 컨셉 4개에 신규 인스턴스 추가 (`in-memory-singleton-gates` 잡 registry 두 종, `sse-token-auth` 잡 SSE 두 엔드포인트, `stream-driven-cache-merge` useGroupingJob/useGlobalMergeJob, `zod-ssot-buildless` 첫 z.lazy 재귀). `summary` v4 (traits 추가), `restaurant.getInsights` MenuCanonical 기반으로 갈아탐. 5개 신규 Prisma 테이블 + 4개 마이그레이션.
- **2026-05-08** (재컴파일): 미디어 프록시·동영상 분리·AI 구조화 분석·재시도/백오프 통합. `crawl`/`friendly`/`ai`/`api-contract`/`web`/`shared`/`utils` 7개 토픽 갱신. 신규 토픽·컨셉 없음. 컨셉 `stream-driven-cache-merge`에 `VisitorReview.videos`·요약 분석 필드 머지 인스턴스 추가, `in-memory-singleton-gates`에 placeId별 summary 직렬화 + Ollama 슬롯-보유 백오프 인스턴스 추가. `friendly`에 신규 media 모듈(`/api/v1/media/thumbnail`) 흡수.
- **2026-05-07** (재컴파일): 맛집 도메인 통합 — DB 영속화·다중 크롤 큐·SSE 멀티플렉싱 변경 흡수. `crawl`/`friendly`/`shared`/`web`/`api-contract` 5개 토픽 갱신. 신규 컨셉 2개: `stream-driven-cache-merge` (SSE 페이로드 직접 머지로 detail GET 회피), `in-memory-singleton-gates` (Redis 없이 모듈 싱글턴 + FIFO로 cap·순서·통합 모두 처리). `sse-token-auth`에 멀티플렉싱 endpoint instance 추가.
- **2026-05-07** (재컴파일): `ai` 토픽 신규 추가 (Ollama Cloud 통합 + 어드민 키/테스트 UI). `friendly`, `api-contract`, `shared`, `web` 토픽 갱신 (AI 라우트·스키마·훅·페이지 흡수). 컨셉 `workspace-package-resolution` 신규 추가 — vite/esbuild의 namespace re-export·pnpm `injected`·autoload 우회 패턴 정리. `zod-ssot-buildless` 컨셉에 ai instance 추가.
- **2026-05-07** (초기): 9개 토픽 + 3개 컨셉 생성. `wiki-init` 권장 설정으로 시작 (`mode: codebase`, `deep_scan: false`, `auto_update: prompt`).
