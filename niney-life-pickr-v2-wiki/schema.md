---
name: niney-life-pickr-v2
mode: codebase
last_updated: 2026-05-14

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
| `menu-grouping` | 식당 단위 메뉴 표기 변형 → canonical 그룹 LLM 정규화 + 순위/긍부 통계 + batch 잡 SSE | `apps/friendly/src/modules/menu-grouping/` |
| `analytics` | 식당 가로지르기 글로벌 메뉴 머지 + 카테고리 트리(`categoryPath`) + 통계 API + admin 운영 UI | `apps/friendly/src/modules/analytics/`, `packages/api-contract/src/schemas/analytics.ts`, `apps/web/src/routes/admin/AdminAnalyticsPage.tsx` |
| `map` | vworld 지도 통합 — OpenLayers + WMTS 직접 호출, DB-backed 키 (`MapProviderConfig`), 어드민 단일 마커 + 공개 다중 마커 양쪽 사용 | `apps/web/src/components/restaurant/{MapCanvas,VWorldMap,PublicRestaurantsMap}.tsx`, `apps/web/src/lib/vworld.ts`, `apps/friendly/src/modules/settings/`, `packages/api-contract/src/schemas/settings-map.ts` |
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
| `stream-driven-cache-merge` | crawl, friendly, shared, web | SSE 이벤트가 머지 가능한 완성된 페이로드를 동봉 → `setQueryData`로 직접 패치, follow-up GET 0회 |
| `in-memory-singleton-gates` | ai, crawl, friendly, shared, menu-grouping, analytics | 외부 큐/Redis 없이 모듈 싱글턴 + in-memory FIFO로 동시성 제어 — AI cap, 크롤 큐, persistTail, SSE 매니저, 잡 registry 모두 같은 모양 |
| `versioned-llm-prompts` | ai, friendly, menu-grouping, analytics | 도메인 별 `*_VERSION` 상수 + DB 컬럼 + UI stale 배지 + 수동 재실행 — 프롬프트/스키마 변경을 데이터와 조약처럼 다룬다 (`ANALYSIS_VERSION=4`, `MENU_GROUPING_VERSION=1`, `GLOBAL_MERGE_VERSION=2`) |
| `public-admin-route-split` | friendly, api-contract, shared, web, map, project-overview | 공개/어드민 같은 데이터에 가드만 토글하지 않고 라우트·스키마·훅을 페어로 분리 — 어드민 회귀 위험 0, 캐싱 정책 분리, 운영 메타 의도적 제거 (`Routes.X.list` 옆 `publicList`, `RestaurantListItem` 옆 `RestaurantPublicListItem`, `useRestaurantList` 옆 `useRestaurantsPublic`) |

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
- **2026-05-07** — 맛집 도메인 (DB 영속화 + AI 요약 + 다중 크롤 + SSE 멀티플렉싱) 통합으로 `crawl`/`friendly`/`shared`/`web`/`api-contract` 5개 토픽 갱신. 신규 컨셉 2개: `stream-driven-cache-merge` (SSE 페이로드 직접 머지로 detail GET 회피), `in-memory-singleton-gates` (Redis 없이 모듈 싱글턴 + FIFO로 cap·순서·통합 모두 처리). `sse-token-auth`에 멀티플렉싱 `summaryEvents` instance 추가.
- **2026-05-08** — 미디어/요약 강화 (썸네일 프록시·동영상 분리·구조화 분석·재시도/백오프) 통합으로 `crawl`/`friendly`/`ai`/`api-contract`/`web`/`shared`/`utils` 7개 토픽 갱신. 신규 토픽·컨셉 없음 (기존 구조에 자연스럽게 흡수). 컨셉 2개에 신규 인스턴스 추가: `stream-driven-cache-merge`에 `VisitorReview.videos`·요약 분석 필드(SSE 페이로드 확장만으로 머지 인프라는 동일) / `in-memory-singleton-gates`에 placeId별 summary run 직렬화·Ollama 429 슬롯-보유 백오프(외부 게이트와 내부 회복 분리). `friendly`에 신규 media 모듈 (`/api/v1/media/thumbnail` Naver CDN 호스트 allowlist + sharp + 디스크 캐시) 흡수. `summary` 모듈은 활동량이 크지만 아직 friendly 내부 모듈로 유지 — 별도 토픽 분리는 다음 라운드에서 재평가.
- **2026-05-09** — 메뉴 분석 파이프라인 확장 (식당 단위 그룹핑 + 식당 가로지르기 글로벌 머지 + 카테고리 트리). 신규 토픽 2개: `menu-grouping` (식당당 1회 LLM 호출로 메뉴 표기 변형 정규화 + 순위/긍부 통계 + batch 잡 SSE), `analytics` (전역 메뉴 머지 두-패스 + categoryPath 단일 컬럼 + 메모리 트리 빌더 + 검색·필터 API). 갱신 토픽 7개: `friendly`(두 모듈 흡수 + summary v4 traits + getInsights MenuCanonical 기반), `api-contract`(menu-grouping/analytics 스키마 + Routes.Analytics + 첫 z.lazy 재귀 `CategoryTreeNode`), `shared`(잡 단위 SSE 훅 2개 — 공유 매니저 없이 hook 안에서 EventSource 라이프사이클 직접 관리), `web`(AdminAnalyticsPage 4섹션 + `?menu=`/`?category=` URL 동기화 useEffect 회피 + MenuRankingSection 비교 위젯 deep-link), `mobile`(맛집 탭 + 식당 상세 라우트 + MenuRankingCard, ADMIN gated), `ai`(LLM 컨슈머 3부류로 확장, 도메인별 VERSION 차이만), `project-overview`(3단계 분석 파이프라인 + 5개 신규 테이블). 신규 컨셉 1개: `versioned-llm-prompts` (`*_VERSION` 상수 + DB 컬럼 + UI 배지 + 수동 재실행 — 3 도메인이 같은 모양). 기존 컨셉 4개에 신규 인스턴스 추가: `in-memory-singleton-gates`(잡 registry 두 종 — multi-job actor 격리 / single-job inflight 가드), `sse-token-auth`(잡 SSE 두 엔드포인트), `stream-driven-cache-merge`(useGroupingJob/useGlobalMergeJob 의 snapshot+chunk/item 머지), `zod-ssot-buildless`(첫 z.lazy 재귀 + SSE event payload 개별 스키마). `docs/menu-hierarchy.md`(구현 완료 문서로 보존).
- **2026-05-09** — 공개 사용자 페이지 도입 (사용자 대상 맛집 탐색) + vworld 지도 통합. 신규 토픽 1개: `map` (vworld JS SDK 거부 → OpenLayers + WMTS XYZ 타일 직접 호출, 도메인 화이트리스트 회피, `MapProviderConfig` DB-backed 키, `MapCanvas`/`VWorldMap`/`PublicRestaurantsMap` 어드민·공개 양쪽 사용). 갱신 토픽 5개: `friendly`(공개 라우트 3개 + settings 모듈 신규, `getPublicList`/`getPublicDetail` 분리), `api-contract`(`RestaurantPublicListQuery/Item/Result` + `PublicReviewAnalysis`/`PublicVisitorReview`/`RestaurantPublicDetail` + `MapProviderPublicConfig` zod 페어 신규), `shared`(`useRestaurantsPublic`/`useRestaurantPublic`/`useRestaurantPublicInsights`/`useMapPublicConfig` + `restaurantApi.public*`/`settingsMapApi.publicConfig`), `web`(공개 `/restaurants` 풀 뷰포트 3-column + 5탭 상세 패널 `panel/`→`detail/` 명명 정리 + `MapCanvas`/`PublicRestaurants*` 컴포넌트 + URL state 동기화 + `ImgWithFallback` 공용화 referrer-policy 회피 + Pretendard 공개 한정 + 텍스트 시프트 전역 + `/admin/settings` 탭 통합 + `AdminMapKeysPage`), `project-overview`(공개 vs 어드민 분리 정책 정착 + `MapProviderConfig` 테이블 + `ol@^10.7.0` 의존성). 신규 컨셉 1개: `public-admin-route-split` (공개/어드민 가드만 토글하지 않고 라우트·스키마·훅 페어 분리 — `Routes.X.publicList` ↔ `Routes.X.list`, `RestaurantPublicListItem` ↔ `RestaurantListItem`, `useRestaurantsPublic` ↔ `useRestaurantList`. 어드민 회귀 위험 0, 운영 메타 의도적 제거, 캐싱 정책 분리). 기존 컨셉 1개에 신규 인스턴스 추가: `zod-ssot-buildless`(map 도메인 4종 스키마 + 공개 맛집 페어 6종이 같은 SSOT 모델로 흡수 — 신규 토픽이 늘어도 컨슈머 4-5개가 컴파일 타임 동기화).
- **2026-05-14** — 모바일 UX 대규모 정비 (공개 맛집 + 어드민 발견 + 관리자 페이지). 신규 토픽·컨셉 0개 — 모든 변경 `web` + `project-overview` 두 토픽으로 흡수. 갱신 토픽 2개. 신규 knowledge file 1개: `docs/mobile-public-restaurant-ux.md` (모바일 sticky·body 스크롤 패턴의 SSOT 문서). 핵심 패턴: (1) 모바일 = body 스크롤 / xl+ = sticky 컬럼 — `/restaurants` 와 `/admin/discover` 양쪽 동일 구조, (2) `/restaurants/:placeId` 별도 라우트 + URL `?tab=` 푸시 라우팅 — 모바일 뒤로가기 = 이전 탭, (3) sticky element wrapping 금지 / `overflow:auto` 컨테이너 밖 sticky — containing block 트랩 회피, (4) `100vh` → `100dvh`, (5) 한글 IME `compositionStart/End` + 로컬 draft state — controlled value 가 미완성 조합 덮어쓰는 "ㅇ으음" 회피, (6) Lightbox 네이티브 scroll-snap 캐러셀 (JS swipe 핸들러 제거 — 브라우저 momentum/snap 활용), (7) iOS Safari focus 자동 줌 차단 — Input 컴포넌트 `text-base sm:text-sm` + `@media (max-width:639px)` 글로벌 `font-size:16px` 룰, (8) Card 컴포넌트 모바일 `p-4 sm:p-6` (콘텐츠 가용 폭 ~12% 회수), (9) 리뷰 카드 LLM 분석 풀 노출 — 메뉴별 좌측 sentiment stripe + tips muted 박스 + keywords 칩 + SatisfactionChip(컬러 도트 + 1~5 점수), 이미지 `h-56 sm:h-64` 가로 스냅 캐러셀 + 클릭 → Lightbox, (10) 관리자 모바일 — AdminLayout `<md` fixed 드로어 + backdrop / `md+` sticky aside, AdminTopBar 햄버거 + "일반 화면으로" 우측 이전, AdminDiscoverPage 패널/지도 토글 + 검색 탭 selection > 0 시 토글 자동 `bottom-20` 상승 (sticky 크롤바 위로). 신규 컨셉 0개 — 모바일 UX 패턴은 `web` 한 토픽에 닫혀 있어 (3+ 토픽 연결 임계 미달) 컨셉화 미평가. `docs/mobile-public-restaurant-ux.md` 가 그 SSOT 역할. 기존 컨셉 신규 인스턴스 없음 — 라우트 분리는 어드민/공개 페어가 아닌 내부 list/detail 분리라 `public-admin-route-split` 와 다른 결.
- **2026-05-09 (follow-up)** — 어드민 발견 페이지 도입 (`/admin/discover` — Playwright 기반 네이버 PC 지도 검색 + 다중 선택 일괄 크롤링 + 좌/우 패널 토글). 신규 토픽·컨셉 0개 — 모두 기존 토픽으로 흡수. 갱신 토픽 7개: `crawl`(`naver-search.playwright.adapter.ts` 신규 — captcha-aware capture / `searchPlaces()` 메서드 + GET `/admin/crawl/search` / **actor 단위 rate-limit 완전 제거** — `RATE_LIMIT_WINDOW_MS` 상수·`lastCallByActor: Map`·검사 블록 모두 삭제), `friendly`(crawl 모듈 변경 흡수 + 검색 어댑터 별도 Browser 인스턴스), `api-contract`(`NaverSearchResult` / `CrawlSearchQuery` / `CrawlSearchResult` + `Routes.Crawl.search` zod 페어 신규), `shared`(`useNaverSearch(q, bbox)` + `crawlApi.search` 신규), `web`(`AdminDiscoverPage` + `DiscoverMap`/`DiscoverPanel` 컴포넌트 + `/admin/discover` 라우트 + AdminLayout "맛집 발견" 메뉴 신규 / `panelPrefsStore` + `usePanelSide(key)` 좌/우 토글 어드민 발견 + 공개 맛집 양쪽 적용 / `MapCanvas` `MapMarker.variant: 'primary' | 'muted'` + `ResizeObserver` 자동 reflow / `RestaurantsPage` 좌/우 토글 적용), `map`(MapCanvas variant 핀 색 분기 + ResizeObserver 자동 reflow), `project-overview`(어드민 발견 페이지 정책 + actor rate-limit 제거 정책 + 패널 좌/우 토글 namespace 정책). 기존 컨셉 3개에 신규 인스턴스 추가: `in-memory-singleton-gates`(잘못된 게이트 제거 학습 — 윈도우 기반 rate-limit 은 다중 시작 패턴과 충돌, 게이트가 dedup + max_concurrent 두 layer 로 충분하면 윈도우는 빼라), `public-admin-route-split`(페어 경계 흐림 첫 사례 — 어드민 발견이 공개 hook `useRestaurantsPublic` + `PublicRestaurantDetail` 컴포넌트를 차용. 어드민 응답 셋이 좌표를 노출 안 해서 — 분리의 합당성을 흔들지 않음), `zod-ssot-buildless`(검색 스키마 페어 추가 — `source: z.enum(['playwright'])` 어댑터 fallback 노출 enum). source 6 추가 (`naver-search.playwright.adapter.ts` / `dev-capture-search.ts` / `AdminDiscoverPage.tsx` / `DiscoverMap.tsx` / `DiscoverPanel.tsx` / `panelPrefsStore.ts`).
