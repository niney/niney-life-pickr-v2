---
topic: project-overview
last_compiled: 2026-05-09
sources_count: 10
status: active
aliases: [monorepo, life-pickr, niney, root, turbo, pnpm-workspace, admin-discover, panel-side-toggle, batch-crawl, naver-search-results, panelPrefsStore, captcha-aware-capture]
---

# project-overview — 모노레포 개요

루트 레벨에서 본 niney-life-pickr-v2 — "선택을 대신 골라주는 서비스" — 의 구조, 워크플로, 공통 규칙을 한 페이지로 정리한다. 공개 영역(사용자 대상 페이지) 과 어드민 영역(운영 도구) 으로 나뉘며, 양쪽 모두 단일 백엔드를 공유한다. 개별 모듈에 대한 자세한 내용은 각 토픽 문서로.

## Purpose [coverage: high — 4 sources]

선택이 고민될 때 대신 골라주는 서비스다. 핵심 도메인은 두 축으로 갈린다:

- **선택 도우미(Pick)** — 사용자가 선택지(`options`)를 등록해 두면, API가 무작위 결과를 골라 `PickResult`로 기록한다. 식당이 등록되어 있으면 분석 점수(만족도/긍정 비율)를 가중치로 쓰는 `smart-pick` 가 활성된다.
- **맛집 분석** — 어드민이 네이버 플레이스 식당을 크롤링하고 리뷰를 LLM으로 분석해 메뉴 통계 트리까지 빌드한다 ([crawl](crawl.md), [ai](ai.md), [menu-grouping](menu-grouping.md), [analytics](analytics.md)). 어드민의 진입 경로가 두 갈래 — 단건 placeId 입력 (`/admin/restaurants`) 과 키워드 검색→다중 선택 일괄 등록 (`/admin/discover`, 신규). 결과물은 공개 페이지에서 비로그인 사용자가 그대로 본다.

세 개의 클라이언트가 동일 백엔드를 공유한다:
- **friendly** — Fastify + Prisma + SQLite 백엔드 ([friendly](friendly.md))
- **web** — Vite + React 19 SPA. 공개 영역(`/`, `/restaurants`) + 어드민 콘솔(`/admin/*`) 두 레이아웃이 한 SPA 안에 공존
- **mobile** — Expo SDK 52 + React Native 0.76 앱 (맛집 탭은 있으나 어드민 UI 없음 — 의도)

공개 영역은 비로그인 호출 가능 — 데이터 자체는 admin 이 본 것과 차이가 없고 (운영 메타만 제거), 사용자 정책상 그대로 노출한다.

## Architecture [coverage: high — 8 sources]

pnpm workspaces + Turborepo 기반 모노레포.

```
niney-life-pickr-v2/
├── apps/
│   ├── friendly/          Fastify 백엔드 → friendly 토픽
│   ├── web/               Vite + React SPA (공개 + 어드민) → web 토픽
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

### 백엔드 도메인 맵 (`apps/friendly/src/modules/`)

| 도메인 | 역할 | 위키 |
|---|---|---|
| `auth` | 회원가입 / 로그인 / JWT | — |
| `user` | 프로필 / 관리자 role 토글 | — |
| `picks` | 선택지 등록 + 무작위 픽 | — |
| `crawl` | 네이버 플레이스 Playwright 크롤 | [crawl](crawl.md) |
| `ai` | LLM 라우팅 (요약/분석/그룹핑/머지) | [ai](ai.md) |
| `summary` | 리뷰 단위 분석 v4 (메뉴 멘션 + 태그) | [ai](ai.md) |
| `restaurant` | 어드민 식당 CRUD + 공개 list/detail/insights/ranking | — |
| `media` | 리뷰 사진/동영상 + 썸네일 프록시 | [media](media.md) |
| **`menu-grouping`** | 식당별 메뉴 정규화 (synonym → canonical) | [menu-grouping](menu-grouping.md) |
| **`analytics`** | 전역 메뉴 머지 + 카테고리 path + 통계 트리 | [analytics](analytics.md) |
| **`settings`** | 외부 SDK 키 — 현재 `map.route.ts`만 (vworld) | — |
| `admin` / `health` | 어드민 메타 / 헬스체크 | — |

빌드 의존 관계: turbo가 `^build` 종속을 자동 추적한다. `dev` 태스크는 캐시 비활성화 + persistent로 워치 모드 유지.

### 공개 vs 어드민 분리 정책

라우트 prefix 한 줄로 가른다 — 백엔드의 모든 어드민 엔드포인트는 `/api/v1/admin/*` 아래에 모이고, 그 외는 공개. `app.requireAdmin` 가드도 `admin/` prefix 라우트에만 붙는다. 일부 도메인은 같은 service 메서드를 공개/어드민 양쪽에서 부르되 라우트만 두 벌 둔다 (예: `RestaurantService.getInsights` ← `Routes.Restaurant.publicInsights` + `Routes.Restaurant.insights`). FE도 같은 정책으로 갈린다:

| 영역 | 레이아웃 | 라우트 | 가드 |
|---|---|---|---|
| 공개 | `PublicLayout` (TopBar + 모바일 사이드바) | `/`, `/restaurants` | 없음 |
| 인증 진입 | (단독) | `/login` | 없음 |
| 어드민 | `AdminLayout` (좌측 사이드바 7항목 — 홈 / **맛집 발견** / 맛집 / AI 분석 관리 / 크롤링 테스트 / AI 테스트 / 설정) | `/admin/*` | `RequireAdmin` (token + role=ADMIN) |

공개 영역은 Pretendard 변수 폰트 + 텍스트 사이즈 시프트가 적용되고(`font-pretendard` + `--text-*` CSS 변수), 어드민은 시스템 폰트 fallback 그대로 둔다 — 운영자 시야 부담을 줄이기 위해 한정적으로만 적용.

### 어드민 발견 페이지 흐름 (`/admin/discover`, 신규)

키워드 → 다중 선택 → 일괄 크롤 한 번에 처리하는 진입점이다. 흐름:

```
검색어 입력
   ▼
naver-search.playwright.adapter (Playwright 페이지로 응답 가로채기 — 직접 fetch 는 ncaptcha 차단)
   ▼
검색 결과 마커(빨강 primary) + 등록된 가게 마커(회색 muted) 통합 — 같은 placeId 면 등록 우선
   ▼
다중 선택 (등록된 placeId 는 체크박스 비활성)
   ▼
직렬 await 루프로 BE 크롤 시작 (Promise.allSettled 병렬은 큐에 막혀 1개만 통과)
   ▼
시작 거부된 placeId 는 체크 상태 보존 → 재시도 편의
   ▼
선택 항목은 우측 상세 컬럼에서 PublicRestaurantDetail 재사용으로 미리보기
```

URL state 는 `?q=&bbox=&tab=&placeId=` — useSearchParams 직접 read/write. 검색당 ~1.1초.

## Talks To [coverage: high — 6 sources]

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
- friendly → 네이버 CDN (`/api/v1/media/thumbnail` 프록시 — 호스트 allowlist) → [media](media.md)
- friendly → LLM provider (요약/분석/그룹핑/머지) — [ai](ai.md)
- **web → vworld WMTS** (`https://api.vworld.kr/req/wmts/1.0.0/{KEY}/{LAYER}/{z}/{y}/{x}.png`) — OpenLayers 가 직접 타일 fetch. 백엔드 경유 안 함
- web → jsDelivr CDN (Pretendard 변수 폰트 — 공개 페이지 한정)

스키마 1개 변경으로 FE/BE 모두 컴파일 타임 불일치 감지 — 자세한 건 [api-contract 토픽](api-contract.md).

## API Surface [coverage: high — 4 sources]

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

### 백엔드 라우트 트리 (요약)

```
/api/v1
├── auth/* ......................... 회원가입 / 로그인 / 내 정보
├── picks/* ........................ 선택 / 픽 결과
├── media/thumbnail ................ 네이버 CDN 프록시 (공개)
├── settings/map/public ............ vworld WMTS 키 (공개) ← 신규
├── restaurants/
│   ├── ranking .................... 공개 랭킹 (긍정/부정 비율)
│   ├── public ..................... 공개 리스트 (좌표 + 썸네일 + AI 통계) ← 신규
│   ├── public/:placeId ............ 공개 상세 (운영 메타 제거) ← 신규
│   └── public/:placeId/insights ... 공개 인사이트 ← 신규
├── health
└── admin/
    ├── crawl/* .................... 크롤 잡 + SSE
    ├── ai/* ....................... LLM 호출 + provider 키
    ├── analytics/* ................ 그룹핑 잡 + 글로벌 머지 + 카테고리 트리
    ├── settings/map ............... 지도 SDK 키 (admin) ← 신규
    └── restaurants/* .............. 어드민 식당 CRUD + 인사이트 + smart-pick + summary SSE
```

### web 라우트 트리

```
PublicLayout
  /                   HomePage (랭킹, 게스트 가능)
  /restaurants        RestaurantsPage (네이버 지도식 풀 뷰포트) ← 신규
                      └─ ?q=&category=&sort=&bbox=&placeId= URL state
  /login              LoginPage (단독, 레이아웃 없음)
AdminLayout (RequireAdmin 가드)
  /admin              AdminHomePage
  /admin/discover     AdminDiscoverPage (검색 + 다중 선택 + 일괄 크롤) ← 신규
                      └─ ?q=&bbox=&tab=&placeId= URL state
  /admin/restaurants  AdminRestaurantsPage / .../:placeId
  /admin/analytics    AdminAnalyticsPage (4섹션, ?menu=/?category= deep-link)
  /admin/crawl-test   AdminCrawlTestPage / .../:jobId
  /admin/ai-test      AdminAiTestPage
  /admin/settings     AdminSettingsPage (탭 컨테이너) ← 신규
    ├─ ai-keys        AdminAiKeysPage (이전 /admin/ai-keys 에서 이전됨)
    └─ map            AdminMapKeysPage (vworld 키 등록/도메인 화이트리스트 메모) ← 신규
```

옛 `/admin/ai-keys` 북마크는 `/admin/settings/ai-keys` 로 redirect — 사이드바도 "AI 키" → "설정"으로 통합.

## Data [coverage: high — 5 sources]

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

영속 데이터: SQLite 파일 (`apps/friendly/data/dev.db`), Prisma 마이그레이션. 클라이언트 토큰: web은 `localStorage` `lp:token`, mobile은 AsyncStorage `lp:token`. 이외 web localStorage: `lp:panelPrefs` — 페이지별 사이드 패널 좌/우 위치 (`panelPrefsStore` Zustand 영속).

### 도메인 테이블 그룹

| 그룹 | 테이블 |
|---|---|
| 사용자 | `User`, `Pick`, `PickResult` |
| 외부 SDK 키 | `LlmProviderConfig`, **`MapProviderConfig`** |
| 식당/크롤 | `Restaurant`, `VisitorReview`, `ReviewSummary`, … |
| 분석 v4 (리뷰 단위) | `MenuMention`, `ReviewTag` |
| 메뉴 그룹핑 (식당별) | `MenuCanonical` |
| 전역 머지 + 통계 | `GlobalMenuCanonical`, `GlobalMenuCanonicalLink` |

`MapProviderConfig` 는 `LlmProviderConfig` 와 거의 같은 모양 — `provider` 유니크 키 + `apiKey` + `domains`(메모) + `updatedAt`/`updatedById`. 다만 LLM 고유 옵션(model, maxConcurrent, baseUrl)은 빠진 단순화 버전이고 env fallback 도 없다 (vworld 키는 도메인 화이트리스트와 짝지어야 해서 .env 기본값 개념이 어색). 마이그레이션은 `20260508173216_add_map_provider_configs`. 통계 트리는 별도 테이블 없이 `GlobalMenuCanonical.categoryPath`(예: `한식 > 면류 > 칼국수`) **단일 컬럼 + 메모리 빌더**로 구성한다 — 단순함 우선. 자세한 모델은 [analytics](analytics.md), [menu-grouping](menu-grouping.md).

### 분석 LLM 파이프라인 (3단계)

```
크롤(crawl)
   ▼
1) 리뷰 단위 분석 (summary v4)        → menu_mentions + review_tags
   ▼  (수동 트리거)
2) 식당별 메뉴 그룹핑 (menu-grouping) → menu_canonicals
   ▼  (수동 트리거)
3) 전역 머지 + 카테고리 path (analytics) → global_menu_canonicals(+links)
   ▼
통계 트리 활성 (categoryPath 기준 메모리 빌더)
   ▼
공개 영역 노출 (랭킹·인사이트·식당 카드)
```

각 단계는 독립된 `*_VERSION` 상수(예: `ANALYSIS_VERSION`, `MENU_GROUPING_VERSION`, `GLOBAL_MERGE_VERSION`)를 들고 있다. 프롬프트/스키마가 바뀌면 상수를 올려서 기존 산출물을 자동으로 **stale**로 표시 — 재실행 대상 식별 단순화. 메뉴 계층 자체에 대한 결정은 `docs/menu-hierarchy.md` 참고 (구현 완료 상태로 보존).

## Key Decisions [coverage: high — 8 sources]

CLAUDE.md / TECH_STACK.md / 도메인 토픽에 명시된 핵심 결정.

| 결정 | 이유 |
|---|---|
| **공개 영역 도입 — 사용자 대상 페이지 vs 어드민 운영 도구 분리** | 분석 결과(랭킹/메뉴 통계)는 본래 사용자가 보라고 만든 자산. SPA 안에서 `PublicLayout` / `AdminLayout` 두 묶음으로 나누고, 공개는 비로그인 가능 |
| **공개 API 별도 라우트 (`/api/v1/restaurants/public/*`)** | admin 라우트와 service 메서드는 공유하되 라우트만 분리 — admin 회귀 위험 0. 공개 응답에서 운영 메타(요약 진행 상태/모델/에러)만 제거된 평탄화 스키마 사용 |
| **어드민 발견 = 검색·등록 통합 마커 + 다중 선택 일괄 크롤링** | 단건 placeId 입력 외에 키워드 진입이 필요. 네이버 PC 지도 직접 fetch 는 ncaptcha 봇 보호로 차단(`pageId === 'ncaptcha-all-search-no-result'`) → Playwright 페이지를 띄워 응답 가로채기(naver-search.playwright.adapter, 검색당 ~1.1초). 검색 빨강 / 등록 회색 마커를 같은 지도에 합치고(같은 placeId 면 등록 우선), 다중 선택은 직렬 await 루프 + 시작 거부된 placeId 는 체크 상태 보존(병렬은 BE 큐에 막혀 1개만 통과). 상세는 공개 `/restaurants` 와 동일한 list/detail/map 3-column 패턴으로 `PublicRestaurantDetail` 그대로 재사용 |
| **actor 단위 rate-limit 제거** | `crawl.service.ts` 의 `RATE_LIMIT_WINDOW_MS` + `lastCallByActor: Map` + 검사 블록 모두 삭제. 어드민 발견의 정상 사용 패턴이 "다중 선택 → 한 번에 N개 시작" 인데, 응답이 수 ms 안에 떨어지는 환경에서 어떤 윈도우 길이여도 둘째부터 막혀 1개만 통과되던 구조 자체가 잘못 자리한 셈. spam 방어는 두 layer (in-flight dedup `findInFlightByPlace` + `MAX_CONCURRENT_PER_ACTOR=3` FIFO 큐) 로 충분. `error: 'rate_limited'` enum 만 backward-compat 으로 잔존 (service 가 emit 하지 않음) |
| **패널 좌/우 토글 = 페이지별 namespace + xl+ 한정** | `apps/web/src/stores/panelPrefsStore.ts` (Zustand 단일 store + localStorage `lp:panelPrefs` 영속). `PanelKey = 'admin.discover' \| 'public.restaurants'` 로 페이지별 namespace 독립. `usePanelSide(key)` selector hook 이 `[side, toggle]` 튜플 제공. 기본값 `admin.discover: 'right'` / `public.restaurants: 'left'`. xl(>=1280) 미만은 풀블리드라 토글 ⇄ 버튼 자체 비노출. 컨테이너 `flex-row-reverse` + aside `border-l` ↔ `border-r` swap 으로 구현. `MapCanvas` 의 `ResizeObserver` 가 패널 size 변경 시 OL `updateSize()` 자동 reflow |
| **vworld JS SDK 거부, OpenLayers + WMTS 직접 호출** | vworld JS SDK 는 도메인 화이트리스트 검증을 강제하지만 WMTS 타일 엔드포인트는 키만 검증 — 운영/로컬 도메인 분리 부담 회피. `ol@^10.7.0` 한 의존만 추가 |
| **공개 키 노출 = admin secret 과 보안 등급 동등** | WMTS 키는 어차피 클라사이드 자원(브라우저 Network 탭에 노출). `/api/v1/settings/map/public` 가드를 빼도 보안 등급은 동일 — 라우트만 admin guard 우회용으로 분리 |
| **Pretendard 공개 한정 + 텍스트 시프트 전역** | 일반 사용자는 Pretendard 가독성에 익숙(국내 서비스 표준). 어드민은 system-ui fallback. Tailwind v4 의 `--text-*` 변수만 1px씩 시프트(12→13/14→15/...) — spacing/icon 은 그대로라 레이아웃 비례 안 깨짐 |
| **`ImgWithFallback` 공용 컴포넌트** | 네이버 CDN(ldb-phinf.pstatic.net 등)은 Referer 검사로 hotlink 차단. `referrerPolicy=no-referrer` + `onError` placeholder 한 묶음을 어드민/공개 양쪽에서 그대로 사용 |
| **pnpm + Turbo + Node 22 LTS** | 디스크/속도/엄격성 + 캐싱 + 최신 LTS |
| **Zod SSOT (api-contract)** | FE/BE 동기화 — 빌드 없는 src export로 tsx/Vite/Metro 모두 호환 |
| **SQLite + Prisma** | MVP 규모엔 충분 — WAL, Litestream으로 운영 백업 가능 |
| **Vite 6 + React 19** (web) | SEO/SSR 불필요한 SPA → 단순화 |
| **TanStack Query + Zustand** | Redux 대비 보일러플레이트 ↓, 서버/클라 상태 분리 |
| **로직만 공유, UI는 플랫폼별** | Tamagui/RN-Web 통합 복잡도가 이득보다 큼 |
| **분석은 수동 LLM 트리거 우선** | 비용 예측 가능성 + 재현성 — 어드민이 "AI 분석 관리"에서 단계별 실행 |
| **`*_VERSION` 상수로 stale 판정** | 프롬프트/스키마 변경 시 상수만 올려도 재실행 대상이 자동 식별됨 |
| **통계 트리는 `categoryPath` 단일 컬럼 + 메모리 빌더** | 별도 트리 테이블 없음 — 단순함 + 빠른 재구성 |
| **Docker / Redis 없음** | SQLite 파일 DB라 컨테이너 불필요. 단일 인스턴스 + lru-cache 로 충분 |

`tsconfig.base.json`은 `strict + noUncheckedIndexedAccess + verbatimModuleSyntax + isolatedModules` — 엄격 모드 풀스택.

## Gotchas [coverage: medium — 5 sources]

- **패키지 간 순환 의존 금지** — `shared → api-contract`는 OK, 반대는 금지 (CLAUDE.md)
- **공유 스키마는 반드시 `@repo/api-contract`에 zod로** — 직접 `apps/friendly`에 정의하면 web/mobile이 못 쓴다
- **vworld 키 미등록 시 placeholder** — 공개 `/restaurants` 페이지는 `useMapPublicConfig` 가 404 면 "지도 키가 등록되지 않았습니다" placeholder 로 fallback. 운영 시작 직후 admin 이 `/admin/settings/map` 에서 키를 등록해야 지도가 켜진다
- **공개 list 의 `q` 쿼리는 LIKE 기반 (인덱스 없음)** — `RestaurantService.getPublicList` 가 `name`/`category` 에 `contains` 로 OR 한다. SQLite 풀 테이블 스캔이라 식당 수가 1k+ 로 늘면 별도 검색 인덱스(FTS5 등) 재고 필요. 현재 규모에서는 충분
- **공개 list 의 bbox 필터는 메모리 처리** — Prisma where 가 아닌 enriched 후 `.filter()` (snapshotJson 안에 좌표가 있어 SQL 단계에서 못 자른다). 식당 수가 늘면 좌표를 `Restaurant` 컬럼으로 정규화해야 함
- **ncaptcha-all-search-no-result — 네이버 PC 지도 검색 직접 fetch 차단** — 같은 BrowserContext 외부에서 호출하면 `pageId === 'ncaptcha-all-search-no-result'` 응답으로 captcha 화면이 떨어진다. 어드민 발견은 Playwright 페이지를 띄워 그 페이지의 captcha 토큰 + 세션 쿠키를 활용해 응답을 가로채는 방식 — `naver-search.playwright.adapter` 가 이를 캡슐화
- **지도 키 환경변수 fallback 없음** — `MapSettingsService` 는 첫 등록 시 `apiKey` 가 없으면 거절. AI provider 와 달리 .env 기본값을 두지 않는다 (도메인 화이트리스트와 1:1 자원)
- **OpenLayers `ol/ol.css` import 필수** — 마커가 안 보이거나 어택 영역이 망가지면 보통 이 import 빠진 게 원인
- **Prisma DLL 락 (Windows)** — `db:generate` / `db:migrate` 전에 friendly dev 서버를 끈다. tsx watch가 살아 있으면 `EPERM ... query_engine-windows.dll.node` 에러
- **첫 관리자 만들기** — 회원가입은 항상 `role=USER`. 승격은 CLI: `pnpm --filter friendly promote-admin you@example.com`. 모바일엔 어드민 UI 없음 (의도)
- **분석 단계 실행 순서 강제** — 리뷰 분석 → 식당별 그룹핑 → 전역 머지. 앞 단계가 stale이면 뒤 단계는 결과가 흔들린다 ([analytics](analytics.md))
- **공개 영역에도 분석 stale 그대로 노출** — 별도 stale 배지는 없음. 어드민이 갱신을 미루면 공개 사용자가 보는 인사이트도 그대로 stale. 운영 정책으로 처리 (자동 트리거 안 함)
- **HANDOFF 문서는 git에 넣지 말 것** — `docs/HANDOFF-*.md`는 untracked 유지
- **버전 매트릭스** — web은 React 19, mobile은 React 18 — `@repo/shared`가 React 18+ peer로 양쪽 호환

## Sources [coverage: high — 10 sources]

- [README.md](../../README.md)
- [CLAUDE.md](../../CLAUDE.md)
- [TECH_STACK.md](../../TECH_STACK.md)
- [package.json](../../package.json)
- [pnpm-workspace.yaml](../../pnpm-workspace.yaml)
- [turbo.json](../../turbo.json)
- [tsconfig.base.json](../../tsconfig.base.json)
- [apps/friendly/prisma/schema.prisma](../../apps/friendly/prisma/schema.prisma)
- [packages/api-contract/src/routes.ts](../../packages/api-contract/src/routes.ts)
- [apps/web/src/routes/admin/AdminDiscoverPage.tsx](../../apps/web/src/routes/admin/AdminDiscoverPage.tsx)
- [apps/web/src/stores/panelPrefsStore.ts](../../apps/web/src/stores/panelPrefsStore.ts)
- [apps/friendly/src/modules/crawl/adapters/naver-search.playwright.adapter.ts](../../apps/friendly/src/modules/crawl/adapters/naver-search.playwright.adapter.ts)
- [docs/menu-hierarchy.md](../../docs/menu-hierarchy.md)
- 토픽 — [friendly](friendly.md), [web](web.md), [api-contract](api-contract.md), [analytics](analytics.md), [menu-grouping](menu-grouping.md), [media](media.md), [ai](ai.md)
