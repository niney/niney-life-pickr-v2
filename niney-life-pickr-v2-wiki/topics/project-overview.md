---
topic: project-overview
last_compiled: 2026-05-14
sources_count: 11
status: active
aliases: [monorepo, life-pickr, niney, root, turbo, pnpm-workspace, admin-discover, panel-side-toggle, batch-crawl, naver-search-results, panelPrefsStore, captcha-aware-capture, mobile-ux, body-scroll, sticky-containing-block, terminology, web-mobile-app, expo-web]
---

# project-overview — 모노레포 개요

루트 레벨에서 본 niney-life-pickr-v2 — "선택을 대신 골라주는 서비스" — 의 구조, 워크플로, 공통 규칙을 한 페이지로 정리한다. 공개 영역(사용자 대상 페이지) 과 어드민 영역(운영 도구) 으로 나뉘며, 양쪽 모두 단일 백엔드를 공유한다. 개별 모듈에 대한 자세한 내용은 각 토픽 문서로.

> **용어 (Terminology)** — 이 위키와 코드베이스 전반에서:
> - **웹** = `apps/web` (Vite + React 19 SPA)
> - **앱** = `apps/mobile` (Expo + RN 앱) — 통합 호칭. 플랫폼별로 **iOS앱**, **Android앱**, **Expo Web** (RN-Web 출력)
> - **모바일** = **웹**의 작은 화면(반응형 레이아웃)만 지칭. `apps/mobile`을 가리킬 땐 항상 "앱"
> - 식별자(슬러그·디렉터리·스크립트) `mobile` / `web` 은 그대로 유지
> 자세한 규칙: [schema.md Terminology](../schema.md#terminology--웹--앱--모바일), [CLAUDE.md 용어](../../CLAUDE.md#용어).

## Purpose [coverage: high — 4 sources]

선택이 고민될 때 대신 골라주는 서비스다. 핵심 도메인은 두 축으로 갈린다:

- **선택 도우미(Pick)** — 사용자가 선택지(`options`)를 등록해 두면, API가 무작위 결과를 골라 `PickResult`로 기록한다. 식당이 등록되어 있으면 분석 점수(만족도/긍정 비율)를 가중치로 쓰는 `smart-pick` 가 활성된다.
- **맛집 분석** — 어드민이 네이버 플레이스 식당을 크롤링하고 리뷰를 LLM으로 분석해 메뉴 통계 트리까지 빌드한다 ([crawl](crawl.md), [ai](ai.md), [menu-grouping](menu-grouping.md), [analytics](analytics.md)). 어드민의 진입 경로가 두 갈래 — 단건 placeId 입력 (`/admin/restaurants`) 과 키워드 검색→다중 선택 일괄 등록 (`/admin/discover`). 결과물은 공개 페이지에서 비로그인 사용자가 그대로 본다.

세 개의 클라이언트가 동일 백엔드를 공유한다:
- **friendly** — Fastify + Prisma + SQLite 백엔드 ([friendly](friendly.md))
- **web** — Vite + React 19 SPA. 공개 영역(`/`, `/restaurants`, `/restaurants/:placeId`) + 어드민 콘솔(`/admin/*`) 두 레이아웃이 한 SPA 안에 공존
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
| 공개 | `PublicLayout` (TopBar + 모바일 사이드바) | `/`, `/restaurants`, `/restaurants/:placeId` | 없음 |
| 인증 진입 | (단독) | `/login` | 없음 |
| 어드민 | `AdminLayout` (좌측 사이드바 7항목 — 홈 / **맛집 발견** / 맛집 / AI 분석 관리 / 크롤링 테스트 / AI 테스트 / 설정) | `/admin/*` | `RequireAdmin` (token + role=ADMIN) |

공개 영역은 Pretendard 변수 폰트 + 텍스트 사이즈 시프트가 적용되고(`font-pretendard` + `--text-*` CSS 변수), 어드민은 시스템 폰트 fallback 그대로 둔다 — 운영자 시야 부담을 줄이기 위해 한정적으로만 적용.

### 어드민 발견 페이지 흐름 (`/admin/discover`)

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
- web → friendly (`VITE_API_URL`, dev에선 Vite proxy `/api` → `:3000`; `server.host: true` 로 LAN/모바일 단말에서도 dev 서버 접근)
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
| `pnpm dev` | 전체 dev (웹 + 앱 + friendly 동시) |
| `pnpm dev:api` | friendly만 (`http://localhost:3000`, docs `/docs`) |
| `pnpm dev:web` | 웹만 (`http://localhost:5173`, LAN host 노출) |
| `pnpm dev:mobile` | 앱 (Expo Dev Tools — turbo가 stdin을 패스스루하지 않아 `i`/`a` 인터랙티브 키는 안 먹음) |
| `pnpm dev:ios` / `pnpm dev:android` | 앱 iOS/Android 시뮬레이터 직행 (turbo 우회: `pnpm --filter mobile ios`/`android`) |
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
├── settings/map/public ............ vworld WMTS 키 (공개)
├── restaurants/
│   ├── ranking .................... 공개 랭킹 (긍정/부정 비율)
│   ├── public ..................... 공개 리스트 (좌표 + 썸네일 + AI 통계)
│   ├── public/:placeId ............ 공개 상세 (운영 메타 제거)
│   └── public/:placeId/insights ... 공개 인사이트
├── health
└── admin/
    ├── crawl/* .................... 크롤 잡 + SSE
    ├── ai/* ....................... LLM 호출 + provider 키
    ├── analytics/* ................ 그룹핑 잡 + 글로벌 머지 + 카테고리 트리
    ├── settings/map ............... 지도 SDK 키 (admin)
    └── restaurants/* .............. 어드민 식당 CRUD + 인사이트 + smart-pick + summary SSE
```

### web 라우트 트리

```
PublicLayout
  /                          HomePage (랭킹, 게스트 가능)
  /restaurants               RestaurantsPage (네이버 지도식 풀 뷰포트 — list + Outlet + map)
                             └─ ?q=&category=&sort=&bbox= URL state
    /restaurants/:placeId    RestaurantDetailRoute (nested, Outlet 자리에)
                             └─ ?tab=home|menu|reviews|info|... URL state (push)
  /login                     LoginPage (단독, 레이아웃 없음)
AdminLayout (RequireAdmin 가드)
  /admin                     AdminHomePage
  /admin/discover            AdminDiscoverPage (검색 + 다중 선택 + 일괄 크롤)
                             └─ ?q=&bbox=&tab=&placeId= URL state
  /admin/restaurants         AdminRestaurantsPage / .../:placeId
  /admin/analytics           AdminAnalyticsPage (4섹션, ?menu=/?category= deep-link)
  /admin/crawl-test          AdminCrawlTestPage / .../:jobId
  /admin/ai-test             AdminAiTestPage
  /admin/settings            AdminSettingsPage (탭 컨테이너)
    ├─ ai-keys               AdminAiKeysPage
    └─ map                   AdminMapKeysPage
```

옛 `/admin/ai-keys` 북마크는 `/admin/settings/ai-keys` 로 redirect — 사이드바도 "AI 키" → "설정"으로 통합. 공개 상세는 옛 `?placeId=xxx` 모달 패턴을 **버리고** 별도 라우트(`/restaurants/:placeId`)로 분리 — 모바일 body 스크롤 + 탭 history 를 위한 결정 ([mobile UX docs](../../docs/mobile-public-restaurant-ux.md)).

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

영속 데이터: SQLite 파일 (`apps/friendly/data/dev.db`), Prisma 마이그레이션. 클라이언트 토큰: 웹은 `localStorage` `lp:token`, 앱은 AsyncStorage `lp:token`. 이외 웹 localStorage: `lp:panelPrefs` — 페이지별 사이드 패널 좌/우 위치 (`panelPrefsStore` Zustand 영속).

### 도메인 테이블 그룹

| 그룹 | 테이블 |
|---|---|
| 사용자 | `User`, `Pick`, `PickResult` |
| 외부 SDK 키 | `LlmProviderConfig`, **`MapProviderConfig`** |
| 식당/크롤 | `Restaurant`, `VisitorReview`, `ReviewSummary`, … |
| 분석 v4 (리뷰 단위) | `MenuMention`, `ReviewTag` |
| 메뉴 그룹핑 (식당별) | `MenuCanonical` |
| 전역 머지 + 통계 | `GlobalMenuCanonical`, `GlobalMenuCanonicalLink` |

`MapProviderConfig` 는 `LlmProviderConfig` 와 거의 같은 모양 — `provider` 유니크 키 + `apiKey` + `domains`(메모) + `updatedAt`/`updatedById`. 다만 LLM 고유 옵션(model, maxConcurrent, baseUrl)은 빠진 단순화 버전이고 env fallback 도 없다. 통계 트리는 별도 테이블 없이 `GlobalMenuCanonical.categoryPath`(예: `한식 > 면류 > 칼국수`) **단일 컬럼 + 메모리 빌더**로 구성한다 — 단순함 우선. 자세한 모델은 [analytics](analytics.md), [menu-grouping](menu-grouping.md).

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

각 단계는 독립된 `*_VERSION` 상수(예: `ANALYSIS_VERSION`, `MENU_GROUPING_VERSION`, `GLOBAL_MERGE_VERSION`)를 들고 있다. 프롬프트/스키마가 바뀌면 상수를 올려서 기존 산출물을 자동으로 **stale**로 표시 — 재실행 대상 식별 단순화.

## Key Decisions [coverage: high — 9 sources]

CLAUDE.md / TECH_STACK.md / 도메인 토픽에 명시된 핵심 결정.

| 결정 | 이유 |
|---|---|
| **공개 영역 도입 — 사용자 대상 페이지 vs 어드민 운영 도구 분리** | 분석 결과(랭킹/메뉴 통계)는 본래 사용자가 보라고 만든 자산. SPA 안에서 `PublicLayout` / `AdminLayout` 두 묶음으로 나누고, 공개는 비로그인 가능 |
| **공개 API 별도 라우트 (`/api/v1/restaurants/public/*`)** | admin 라우트와 service 메서드는 공유하되 라우트만 분리 — admin 회귀 위험 0. 공개 응답에서 운영 메타(요약 진행 상태/모델/에러)만 제거된 평탄화 스키마 사용 |
| **어드민 발견 = 검색·등록 통합 마커 + 다중 선택 일괄 크롤링** | 단건 placeId 입력 외 키워드 진입이 필요. 네이버 PC 지도 직접 fetch 는 ncaptcha 차단 → Playwright 페이지로 응답 가로채기. 검색 빨강 / 등록 회색 마커 통합, 다중 선택은 직렬 await + 시작 거부 placeId 체크 보존. 상세는 공개 `PublicRestaurantDetail` 재사용 |
| **actor 단위 rate-limit 제거** | `crawl.service.ts` 의 `RATE_LIMIT_WINDOW_MS` + `lastCallByActor: Map` 삭제. spam 방어는 in-flight dedup + `MAX_CONCURRENT_PER_ACTOR=3` FIFO 큐 두 layer 로 충분 |
| **패널 좌/우 토글 = 페이지별 namespace + xl+ 한정** | `panelPrefsStore` Zustand + localStorage `lp:panelPrefs`. `PanelKey = 'admin.discover' \| 'public.restaurants'` 페이지별 독립. xl(>=1280) 미만은 풀블리드라 토글 비노출 |
| **vworld JS SDK 거부, OpenLayers + WMTS 직접 호출** | vworld JS SDK 의 도메인 화이트리스트 부담 회피 — WMTS 타일 엔드포인트는 키만 검증. `ol@^10.7.0` 한 의존만 추가 |
| **공개 키 노출 = admin secret 과 보안 등급 동등** | WMTS 키는 어차피 클라사이드 자원(브라우저 Network 탭 노출). 가드 토글이 보안에 무의미하므로 라우트 분리만으로 처리 |
| **Pretendard 공개 한정 + 텍스트 시프트 전역** | 일반 사용자는 Pretendard 가독성에 익숙(국내 서비스 표준). 어드민은 system-ui fallback. Tailwind v4 의 `--text-*` 변수만 1px씩 시프트 |
| **`ImgWithFallback` 공용 컴포넌트** | 네이버 CDN 의 Referer 검사 회피 — `referrerPolicy=no-referrer` + `onError` placeholder 한 묶음 |
| **모바일 UX = body 스크롤 + 라우트 분리 + sticky containing block 규율** (신규) | 공개 맛집 페이지에서 정착시킨 프로젝트 차원의 모바일 패턴 묶음. 상세는 별도 sub-section ↓ |
| **pnpm + Turbo + Node 22 LTS** | 디스크/속도/엄격성 + 캐싱 + 최신 LTS |
| **Zod SSOT (api-contract)** | FE/BE 동기화 — 빌드 없는 src export로 tsx/Vite/Metro 모두 호환 |
| **SQLite + Prisma** | MVP 규모엔 충분 — WAL, Litestream으로 운영 백업 가능 |
| **Vite 6 + React 19** (web) | SEO/SSR 불필요한 SPA → 단순화 |
| **TanStack Query + Zustand** | Redux 대비 보일러플레이트 ↓, 서버/클라 상태 분리 |
| **로직만 공유, UI는 플랫폼별** | Tamagui/RN-Web 통합 복잡도가 이득보다 큼 |
| **분석은 수동 LLM 트리거 우선** | 비용 예측 가능성 + 재현성 |
| **`*_VERSION` 상수로 stale 판정** | 프롬프트/스키마 변경 시 상수만 올려도 재실행 대상이 자동 식별됨 |
| **통계 트리는 `categoryPath` 단일 컬럼 + 메모리 빌더** | 별도 트리 테이블 없음 — 단순함 + 빠른 재구성 |
| **Docker / Redis 없음** | SQLite 파일 DB라 컨테이너 불필요. 단일 인스턴스 + lru-cache 로 충분 |

`tsconfig.base.json`은 `strict + noUncheckedIndexedAccess + verbatimModuleSyntax + isolatedModules` — 엄격 모드 풀스택.

### 모바일 UX 규율 (프로젝트 차원) [coverage: high — 1 doc + 8 source files]

전체 명세는 [docs/mobile-public-restaurant-ux.md](../../docs/mobile-public-restaurant-ux.md). 공개 `/restaurants` + `/restaurants/:placeId` 에서 정착시켰지만 **공개·어드민 양쪽에 동일하게 적용되는 프로젝트 규율**이다 — 새 모바일 화면을 만들 땐 이 7개 규칙을 기본으로 따른다.

1. **모바일 = body 스크롤** — 페이지 자체를 `fixed inset-0` 풀스크린 모달로 만들지 않는다. 모바일 브라우저(iOS Safari / Android Chrome) 의 URL bar collapse 가 동작하려면 document/window 자체가 스크롤되어야 한다. 페이지 내부 `overflow-y:auto` 컨테이너 스크롤로는 트리거되지 않음. 상세 화면이 필요하면 모달 대신 **라우트 분리** (`/restaurants/:placeId` nested Outlet) 로.
2. **sticky element 는 wrapping 금지** — `<div className="hidden xl:block"><PublicTopBar /></div>` 같은 wrapping div 가 sticky containing block 을 자기 boundary 로 묶어 본문 스크롤 시 함께 사라진다. 분기는 sticky element 자체 className 에서 (`'sticky top-0 ...', hideOnMobile && 'hidden xl:flex'`).
3. **sticky 묶음은 `overflow:auto` 컨테이너 밖에 둔다** — `overflow-y:auto` div 안에 sticky 를 두면 자체 sticky containing block 이 형성되는데, 모바일에서 그 div 가 실제 scroll 되지 않으면(부모 height 없음 + body 스크롤 구조) sticky 가 깨진다. 식당명+탭바 묶음을 본문 div 의 sibling 으로 둔 이유.
4. **`100vh` 대신 `100dvh`** — iOS Safari 의 dynamic viewport (URL bar collapse 시 변화) 와 합치 — 잘림 회피. 단 admin/xl+ 풀-뷰포트 컬럼 패턴에선 그대로 의미 있음.
5. **탭 상태는 URL 의 일부, push 로 전환** — `?tab=menu`. `setSearchParams(...)` 는 기본 push — 모바일 뒤로가기 1회 = 직전 탭 복귀. `replace` 옵션 사용 금지(뒤로가기로 화면 통째 닫혀 사용자 기대 어긋남). `PublicRestaurantDetail` 은 `tab`/`onChangeTab` 을 **optional** 로 받아 라우트(URL sync) / 어드민 패널(내부 state) 양쪽 호환.
6. **한글 IME 대응** — URL/상위 state 와 sync 되는 controlled input 은 `compositionStart/End` + 로컬 `draft` state 필수. composition 중에는 상위 sync 보류, `compositionEnd` 에서 한 번에 commit. 안 하면 URL→re-render 가 미완성 조합을 덮어써 "ㅇ으음" 같은 깨짐 발생.
7. **scroll-to-top 환경 자동 분기** — `scrollHeight > clientHeight + 1` 로 자체 scroll 가능 여부 판정해 `scrollRef.scrollTo` (admin/xl+ 자체 scroll 컨테이너) vs `window.scrollTo` (모바일 body 스크롤) 갈라타기. 같은 컴포넌트가 두 환경에서 동작하게 하는 핵심 트릭.
8. **iOS Safari focus zoom 회피** — `input`/`textarea`/`select` 의 font-size ≥ 16px (`text-base` on mobile, 또는 global CSS rule). 모바일에서 포커스 시 자동 zoom-in 되는 동작 차단.

부가 — dev 서버에서 모바일 단말 테스트하려면 `apps/web/vite.config.ts` 의 `server.host: true` 가 LAN IP 노출을 켠다.

## Gotchas [coverage: medium — 6 sources]

- **패키지 간 순환 의존 금지** — `shared → api-contract`는 OK, 반대는 금지 (CLAUDE.md)
- **공유 스키마는 반드시 `@repo/api-contract`에 zod로** — 직접 `apps/friendly`에 정의하면 웹/앱이 못 쓴다
- **vworld 키 미등록 시 placeholder** — 공개 `/restaurants` 페이지는 `useMapPublicConfig` 가 404 면 "지도 키가 등록되지 않았습니다" placeholder 로 fallback. 운영 시작 직후 admin 이 `/admin/settings/map` 에서 키를 등록해야 지도가 켜진다
- **공개 list 의 `q` 쿼리는 LIKE 기반 (인덱스 없음)** — 식당 수가 1k+ 로 늘면 별도 검색 인덱스(FTS5 등) 재고 필요. 현재 규모에서는 충분
- **공개 list 의 bbox 필터는 메모리 처리** — Prisma where 가 아닌 enriched 후 `.filter()`. 좌표가 `snapshotJson` 안에 있어 SQL 단계에서 못 자른다
- **ncaptcha-all-search-no-result — 네이버 PC 지도 검색 직접 fetch 차단** — 어드민 발견은 Playwright 페이지를 띄워 그 페이지의 captcha 토큰 + 세션 쿠키로 응답 가로채는 방식 (`naver-search.playwright.adapter`)
- **지도 키 환경변수 fallback 없음** — `MapSettingsService` 는 첫 등록 시 `apiKey` 가 없으면 거절. AI provider 와 달리 .env 기본값 없음
- **OpenLayers `ol/ol.css` import 필수** — 마커가 안 보이거나 어택 영역이 망가지면 보통 이 import 빠진 게 원인
- **Prisma DLL 락 (Windows)** — `db:generate` / `db:migrate` 전에 friendly dev 서버를 끈다
- **첫 관리자 만들기** — 회원가입은 항상 `role=USER`. 승격은 CLI: `pnpm --filter friendly promote-admin you@example.com`. 앱엔 어드민 UI 없음 (의도)
- **분석 단계 실행 순서 강제** — 리뷰 분석 → 식당별 그룹핑 → 전역 머지. 앞 단계가 stale이면 뒤 단계 결과가 흔들린다 ([analytics](analytics.md))
- **공개 영역에도 분석 stale 그대로 노출** — 별도 stale 배지 없음. 운영 정책으로 처리 (자동 트리거 안 함)
- **모바일 sticky 함정 (재강조)** — sticky 가 깨질 때 99%는 (a) wrapping div 로 containing block 묶임 또는 (b) `overflow:auto` 컨테이너 안에 둠 — 둘 다 `docs/mobile-public-restaurant-ux.md` 의 2·3번 규칙 위반. 부모 chain 을 따라가며 sticky/overflow 를 잡는 부모를 찾는다
- **HANDOFF 문서는 git에 넣지 말 것** — `docs/HANDOFF-*.md`는 untracked 유지
- **버전 매트릭스** — 웹은 React 19, 앱은 React 18 — `@repo/shared`가 React 18+ peer로 양쪽 호환. 앱의 Metro 는 `extraNodeModules` 로 react/react-dom을 앱 로컬 사본으로 강제 — 워크스페이스에 두 사본이 공존하므로 같은 번들에 새어 들어오면 `$$typeof` 불일치 ([mobile 토픽 Gotchas](mobile.md#gotchas-coverage-high--6-sources))
- **앱 Expo Web 은 SPA 모드 고정** — `web.output: 'single'`. 정적 사전렌더(`'static'`) 는 워크스페이스 두 React 사본 환경에서 expo-router 의 `renderToString` 이 SSR 500 을 낸다. 앱 브라우저 미리보기 용도라 SSR 불요 ([mobile › Architecture › Expo Web](mobile.md#expo-web-rn-web-출력-coverage-high--1-source))

## Sources [coverage: high — 11 sources]

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
- [docs/mobile-public-restaurant-ux.md](../../docs/mobile-public-restaurant-ux.md) ← 신규
- [apps/web/src/App.tsx](../../apps/web/src/App.tsx)
- [apps/web/src/components/PublicTopBar.tsx](../../apps/web/src/components/PublicTopBar.tsx)
- [apps/web/src/routes/RestaurantsPage.tsx](../../apps/web/src/routes/RestaurantsPage.tsx)
- [apps/web/src/routes/RestaurantDetailRoute.tsx](../../apps/web/src/routes/RestaurantDetailRoute.tsx)
- [apps/web/src/components/restaurant/detail/PublicRestaurantDetail.tsx](../../apps/web/src/components/restaurant/detail/PublicRestaurantDetail.tsx)
- [apps/web/vite.config.ts](../../apps/web/vite.config.ts) — `server.host: true` LAN/모바일 단말 dev 접근
- 토픽 — [friendly](friendly.md), [web](web.md), [api-contract](api-contract.md), [analytics](analytics.md), [menu-grouping](menu-grouping.md), [media](media.md), [ai](ai.md), [map](map.md)
