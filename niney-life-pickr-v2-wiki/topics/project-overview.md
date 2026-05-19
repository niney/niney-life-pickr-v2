---
topic: project-overview
last_compiled: 2026-05-19
sources_count: 19
status: active
aliases: [monorepo, life-pickr, niney, root, turbo, pnpm-workspace, admin-discover, admin-auto-discover, panel-side-toggle, batch-crawl, naver-search-results, panelPrefsStore, captcha-aware-capture, mobile-ux, body-scroll, sticky-containing-block, terminology, web-mobile-app, expo-web, diningcode, catchtable, canonical-restaurant, multi-source, auto-dc-merge, sse-heartbeat, stale-summary-cleanup, crawl-job-log, summary-queued-cancelled, summary-resume, app-level-singleton-plugin, mobile-native-tabs, dev-client, webview-vworld, location-first-entry, public-reviews-pagination]
---

# project-overview — 모노레포 개요

**2026-05-19 변경 흡수** — 다섯 큰 줄기로 흡수: (1) **잡 단계별 영속 로그 시스템** — `CrawlJobLog` 테이블 + `JobLogService` 가 모든 크롤+요약 단계를 pino + DB + 두 SSE(jobRegistry / summaryEventsBus) 로 동시 fan-out, `(jobId, seq)` 로 dedup. 어드민이 잡 진행 중 [진행도]/[로그] 탭 + 상세 페이지 "크롤 로그" 아코디언으로 실시간/과거 로그 통합 조회. (2) **요약 라이프사이클 6 상태** — `ReviewSummaryStatus` enum 이 queued/pending/running/done/failed/cancelled 6종. `queued` 가 큐잉 즉시 박혀 chain 휘발 윈도우를 ms 로 줄임 (이전 사고: placeId=36668856 가 446 리뷰 중 56 만 done, 381 missing). `cancelled` 는 어드민 "요약 중지" 결과 — 별도 "요약 재개" 라우트가 cancelled→queued flip. 부팅 시 `cleanupStaleReviewSummaries` + `rescheduleStaleSummaries` 가 stale 행 정리 + 자동 재큐잉 (server_restart errorCode). (3) **`plugins/summaries.ts` 전역 singleton 패턴** — SummaryService/JobLogService/AiConfigService 셋을 `fastify-plugin` 으로 app.decorate, 라우트별 인스턴스 분리 시 발생하던 cancel/chain race 해소. (4) **공개 맛집 위치 기반 첫 진입 + WebView 지도** — `useUserLocation` (웹) / `useUserLocationNative` (앱) + `@repo/utils/geo` 의 `computeBboxAround`/`isInKorea`. 모바일은 RN 안의 WebView 안 vworld HTML 주입 패턴 — RN 가 OpenLayers 네이티브 비호환 회피. (5) **모바일 v2 리빌드 + 공개 웹 v2** — 모바일은 네이티브 탭바 + dev client 워크플로 + 맛집 탭 통합(지도+바텀시트+상세 in-sheet) + R8 minify + Swift concurrency plugin. 웹은 `/restaurants-v2` 라우트 + restaurant-v2/BottomSheet + detail/ 디렉터리 — 모바일과 같은 컴포넌트 트리 공유. 공개 리뷰는 첫 페이지만 detail 동봉 + 추가 페이지 별도 endpoint 로 분리.

루트 레벨에서 본 niney-life-pickr-v2 — "선택을 대신 골라주는 서비스" — 의 구조, 워크플로, 공통 규칙을 한 페이지로 정리한다. 공개 영역(사용자 대상 페이지) 과 어드민 영역(운영 도구) 으로 나뉘며, 양쪽 모두 단일 백엔드를 공유한다. 개별 모듈에 대한 자세한 내용은 각 토픽 문서로.

> **용어 (Terminology) — 프로젝트 단일 규약** (CLAUDE.md 의 "용어" 섹션을 그대로 반영):
> - **웹** = `apps/web` (Vite + React 19 SPA, 공개 + 어드민 두 레이아웃)
> - **앱** = `apps/mobile` (Expo + RN 앱). 플랫폼 별로는 **iOS앱**, **Android앱**, **Expo Web** (RN-Web 출력)
> - **모바일** = **웹**의 작은 화면(반응형 레이아웃)만 지칭 — 앱 가리키지 않음. 앱을 가리킬 땐 항상 "앱"
> - **모바일 단말** = 휴대전화로 **웹** 접속한 상태
> - 식별자(슬러그·디렉터리·스크립트·커밋 스코프) `mobile` / `web` 은 그대로 유지 — 디렉터리 슬러그 기준이라 변경 없음
> 자세한 규칙: [schema.md Terminology](../schema.md#terminology--웹--앱--모바일), [CLAUDE.md 용어](../../CLAUDE.md#용어).

## Purpose [coverage: high — 4 sources]

선택이 고민될 때 대신 골라주는 서비스다. 핵심 도메인은 두 축으로 갈린다:

- **선택 도우미(Pick)** — 사용자가 선택지(`options`)를 등록해 두면, API가 무작위 결과를 골라 `PickResult`로 기록한다. 식당이 등록되어 있으면 분석 점수(만족도/긍정 비율)를 가중치로 쓰는 `smart-pick` 가 활성된다.
- **맛집 분석** — 어드민이 다양한 출처에서 식당을 크롤링하고 리뷰를 LLM으로 분석해 메뉴 통계 트리까지 빌드한다 ([crawl](crawl.md), [ai](ai.md), [menu-grouping](menu-grouping.md), [analytics](analytics.md)). 출처는 3종 — **네이버 플레이스 / 다이닝코드 / 캐치테이블**. 어드민의 진입 경로는 네 갈래 — 단건 placeId 입력 (`/admin/restaurants`), 키워드 검색→다중 선택 일괄 등록 (`/admin/discover`), 다이닝코드 일괄 저장 (`/admin/diningcode`), **AI 자동 발견** (`/admin/auto-discover` — 영역명 한 줄 + 카테고리 + 목표 수 만으로 키워드 8개 자동 생성 → 다중 검색·dedupe → 그룹 5병렬 직렬 크롤·등록. 자세한 건 [auto-discover](auto-discover.md)). 결과물은 공개 페이지에서 비로그인 사용자가 그대로 본다.

세 개의 클라이언트가 동일 백엔드를 공유한다:
- **friendly** — Fastify + Prisma + SQLite 백엔드 ([friendly](friendly.md))
- **웹** (`apps/web`) — Vite + React 19 SPA. 공개 영역(`/`, `/restaurants`, `/restaurants/:placeId`) + 어드민 콘솔(`/admin/*`) 두 레이아웃이 한 SPA 안에 공존
- **앱** (`apps/mobile`) — Expo SDK 52 + React Native 0.76. 맛집 탭은 있으나 어드민 UI 없음 — 의도

공개 영역은 비로그인 호출 가능 — 데이터 자체는 어드민이 본 것과 차이가 없고 (운영 메타만 제거), 사용자 정책상 그대로 노출한다.

## Architecture [coverage: high — 9 sources]

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
├── CLAUDE.md              에이전트 가이드 (이 위키와 함께 본다) — "용어" 섹션 포함
└── TECH_STACK.md          전체 기술 스택 명세
```

### 출처 3종 + canonical 그룹핑 레이어 (신규)

크롤 출처가 한 개에서 셋으로 늘어나면서 "출처 가로지르는 같은 가게" 문제가 생겼다. 해결 구조:

```
Naver Place ──┐
Diningcode  ──┼──→ Restaurant (source, sourceId)  ──→  CanonicalRestaurant (N:1)
Catchtable  ──┘     ^                                    ^
                    │                                    │
                    각 출처 행 하나씩                     같은 가게 묶음 (어드민 수락 시에만)
```

- `Restaurant` 는 `(source, sourceId)` 로 unique — 네이버는 `source='naver'` 이고 `sourceId=placeId`, 다이닝코드/캐치테이블은 자체 id 사용 + `placeId=null`
- 같은 가게의 다른 출처 행들은 `canonicalId` 를 공유 — 마이그레이션 직후엔 모든 Restaurant 가 자기 전용 Canonical 을 가지고(1:1), merge 수락 시 점진적으로 N:1 로 압축됨
- **자동 DC 머지 후크 (C안 정착, 신규)** — Naver 크롤 done 직후 `tryAutoMatchDiningcode` 가 좌표 기반 DC 후보(200m 반경)를 점수화해 임계 통과(nameScore ≥ AUTO_DC_NAME_THRESHOLD, distance ≤ AUTO_DC_DISTANCE_THRESHOLD_M, 차순위와 점수 격차 ≥ AUTO_DC_TIE_GAP) 시 **자동으로 DC 저장 + canonical 머지**까지 수행. 이전 "수동 확정만" 정책에서 한 단계 진화 — 잘못된 머지의 복구 비용이 큰 케이스만 사람 컨펌으로 남기는 절충
- **검토 큐는 임계 못 넘는 케이스 fallback** — score ≥ 0.45 이되 자동 임계까지는 못 닿는 후보는 `CanonicalMergeProposal` 큐로. 머지 큐 자동 적재 트리거 — (a) 새 출처 등록 후크 자동, (b) 어드민 수동 "병합 후보 찾기" 버튼

자세한 모델·매칭 로직: [friendly](friendly.md), [canonical](canonical.md).

### 백엔드 도메인 맵 (`apps/friendly/src/modules/`)

| 도메인 | 역할 | 위키 |
|---|---|---|
| `auth` | 회원가입 / 로그인 / JWT | — |
| `user` | 프로필 / 관리자 role 토글 | — |
| `picks` | 선택지 등록 + 무작위 픽 | — |
| `crawl` | 네이버 플레이스 / 다이닝코드 / 캐치테이블 크롤 (Playwright + 어댑터별 분기, Naver done 후 자동 DC 매칭+머지 후크 포함) | [crawl](crawl.md) |
| **`auto-discover`** | AI 키워드 8개 → 다중 검색 → 그룹 5병렬 자동 발견 잡 (신규) | [auto-discover](auto-discover.md) |
| `ai` | LLM 라우팅 (요약/분석/그룹핑/머지) | [ai](ai.md) |
| `summary` | 리뷰 단위 분석 v4 (메뉴 멘션 + 태그) | [ai](ai.md) |
| `restaurant` | 어드민 식당 CRUD + 공개 list/detail/insights/ranking | — |
| **`canonical`** | 출처 가로지르는 같은 가게 묶기 + 머지 제안 큐 (신규) | [canonical](canonical.md) |
| `media` | 리뷰 사진/동영상 + 썸네일 프록시 | [media](media.md) |
| `menu-grouping` | 식당별 메뉴 정규화 (synonym → canonical) | [menu-grouping](menu-grouping.md) |
| `analytics` | 전역 메뉴 머지 + 카테고리 path + 통계 트리 | [analytics](analytics.md) |
| `settings` | 외부 SDK 키 — 현재 `map.route.ts`만 (vworld) | — |
| `admin` / `health` | 어드민 메타 / 헬스체크 | — |

빌드 의존 관계: turbo가 `^build` 종속을 자동 추적한다. `dev` 태스크는 캐시 비활성화 + persistent로 워치 모드 유지.

### 공개 vs 어드민 분리 정책

라우트 prefix 한 줄로 가른다 — 백엔드의 모든 어드민 엔드포인트는 `/api/v1/admin/*` 아래에 모이고, 그 외는 공개. `app.requireAdmin` 가드도 `admin/` prefix 라우트에만 붙는다. 일부 도메인은 같은 service 메서드를 공개/어드민 양쪽에서 부르되 라우트만 두 벌 둔다 (예: `RestaurantService.getInsights` ← `Routes.Restaurant.publicInsights` + `Routes.Restaurant.insights`). FE도 같은 정책으로 갈린다:

| 영역 | 레이아웃 | 라우트 | 가드 |
|---|---|---|---|
| 공개 | `PublicLayout` (TopBar + 모바일 사이드바) | `/`, `/restaurants`, `/restaurants/:placeId` | 없음 |
| 인증 진입 | (단독) | `/login` | 없음 |
| 어드민 | `AdminLayout` (좌측 사이드바 — 홈 / 맛집 발견 / **맛집 자동 발견** / 맛집 / 다이닝코드 / AI 분석 관리 / 네이버·다이닝코드·캐치테이블 크롤링 테스트 / AI 테스트 / 설정) | `/admin/*` | `RequireAdmin` (token + role=ADMIN) |

공개 영역은 Pretendard 변수 폰트 + 텍스트 사이즈 시프트가 적용되고(`font-pretendard` + `--text-*` CSS 변수), 어드민은 시스템 폰트 fallback 그대로 둔다 — 운영자 시야 부담을 줄이기 위해 한정적으로만 적용.

### 어드민 발견 페이지 흐름 (`/admin/discover` — 네이버 출처)

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

발견 리스트 카드는 노출 행마다 같은 canonical 의 **다이닝코드 형제 행을 합산해** 표시한다 — `totalReviews / summaryPending·Running·Done·Failed / analyzedCount / positive·negative·neutralCount` 두 출처 합산, 평균 점수는 가중평균. 응답 행 키는 Naver placeId 그대로라 라우팅/캐시/UI 스키마 변경 없음. SSE snapshot 이 합산 카운트를 덮어쓰지 않도록 후속 패치도 포함. 또한 행 호버 자동 지도 이동은 **"지도" 버튼 클릭 트리거로 변경** — 모바일 터치에서 호버가 의도와 다르게 발화하던 문제 해결.

상세 패널은 **Naver + 다이닝코드 융합 detail** 을 보여준다 — 백엔드 `restaurant.merge.ts` (신규, 순수 함수 모음) 가 canonical 그룹의 Naver 행 + DC 형제들을 단일 detail 로 머지해 응답하면, FE 는 `PublicRestaurantDetail` 컴포넌트 그대로 렌더. 필드별 머지 규칙: rating/reviewCount/phone/address 는 Naver 우선·없으면 DC, businessHours 는 DC summary 우선, menus 는 Naver 비어 있을 때만 DC, photos/reviews 는 두 출처 합치고 dedup, descTags/facilities/scoreDetail/wordcloud 는 DC 전용이라 항상 노출. canonical 정책 진화의 다음 단계 ([canonical](canonical.md)).

### 어드민 자동 발견 페이지 (`/admin/auto-discover` — AI 키워드 → 다중 검색 → 그룹 5병렬, 신규)

영역명 한 줄("강남역") + 카테고리 칩 + 목표 수만 입력하면 한 번의 잡으로 끝나는 페이지. 흐름:

```
입력: { area, categories[], targetCount } → POST /admin/auto-discover/jobs (즉시 jobId 반환)
   ▼ (백그라운드 SSE 스트림)
Phase 1: generating_keywords — AI(ollama-cloud, JSON schema 강제) 가 정확히 8개 생성 (부족 시 fallback 보충)
   ▼
Phase 2: searching — 키워드 8개 Promise.all 병렬 네이버 지도 검색 + placeId dedupe + 이미 등록은 skipped
   ▼
Phase 3: crawling — 남은 후보를 5개 단위 그룹으로, 그룹 직렬 + 그룹 내 5병렬 Naver Place 크롤·등록
   ▼ (newlyRegistered >= targetCount 면 조기 종료)
markFinished('done'|'cancelled'|'failed')
```

actor 당 잡은 1 개 제한 (다이닝코드 bulk-save 와 의도적으로 다른 결정 — 무거운 파이프라인 한 줄). 자세한 건 [auto-discover](auto-discover.md).

### 다이닝코드 어드민 페이지 (`/admin/diningcode` — 정식)

다이닝코드 출처를 위한 **정식 어드민 페이지** — 기존 `/admin/diningcode-test` (검증용) 와 별도로 분리. 둘 다 유지 — 테스트 페이지는 어댑터 점검/회귀용으로 살려 두고, 정식 페이지는 운영자가 실제로 등록을 돌리는 동선. 일괄 저장은 **SSE 스트림**으로 진행률 + 실패 사유를 흘려보내는데, 이 패턴은 `menu-grouping` 의 잡 스트리밍을 차용했다. 자세한 라우트·정책: [crawl](crawl.md).

## Talks To [coverage: high — 6 sources]

내부 패키지 의존 그래프 (단방향 — 순환 금지):

```
api-contract  ← 의존 ←  friendly, shared
shared        ← 의존 ←  web, mobile
utils         ← 의존 ←  friendly, web, mobile, shared (순수 함수만)
config        ← 의존 ←  모든 워크스페이스 (tsconfig/eslint)
```

런타임 통신:
- 웹 → friendly (`VITE_API_URL`, dev에선 Vite proxy `/api` → `:3000`; `server.host: true` 로 LAN/모바일 단말에서도 dev 서버 접근)
- 앱 → friendly (`EXPO_PUBLIC_API_URL`, 빌드 시점 주입)
- friendly → SQLite 파일 (`apps/friendly/data/dev.db`)
- friendly → 네이버 플레이스 / 다이닝코드 / 캐치테이블 (Playwright + 출처별 어댑터)
- friendly → 네이버 CDN (`/api/v1/media/thumbnail` 프록시 — 호스트 allowlist) → [media](media.md)
- friendly → LLM provider (요약/분석/그룹핑/머지) — [ai](ai.md)
- 웹 → vworld WMTS (`https://api.vworld.kr/req/wmts/1.0.0/{KEY}/{LAYER}/{z}/{y}/{x}.png`) — OpenLayers 가 직접 타일 fetch. 백엔드 경유 안 함
- 웹 → jsDelivr CDN (Pretendard 변수 폰트 — 공개 페이지 한정)

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
| `pnpm dev:mobile:local` / `:prod` | 앱 dev 서버 + API URL 변형 (local LAN / prod 분기) |
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
    ├── crawl/* .................... 크롤 잡 + SSE (출처 3종 분기, Naver done 후 자동 DC 매칭 후크)
    ├── auto-discover/* ............ AI 키워드 → 다중 검색 → 그룹 5병렬 자동 발견 잡 (신규)
    ├── ai/* ....................... LLM 호출 + provider 키
    ├── analytics/* ................ 그룹핑 잡 + 글로벌 머지 + 카테고리 트리
    ├── canonical/* ................ 머지 제안 큐 / 수락·거절
    ├── settings/map ............... 지도 SDK 키 (admin)
    └── restaurants/* .............. 어드민 식당 CRUD + 인사이트 + smart-pick + summary SSE (heartbeat 15s + idle timeout)
```

### 웹 라우트 트리 (요약)

```
PublicLayout
  /                          HomePage (랭킹, 게스트 가능)
  /restaurants               RestaurantsPage (네이버 지도식 풀 뷰포트)
    /restaurants/:placeId    RestaurantDetailRoute (nested Outlet)
  /login                     LoginPage (단독, 레이아웃 없음)
AdminLayout (RequireAdmin 가드)
  /admin                     AdminHomePage
  /admin/discover            AdminDiscoverPage (네이버 검색·다중 등록)
  /admin/auto-discover       AdminAutoDiscoverPage (AI 키워드 → 다중 검색 → 그룹 5병렬, 신규)
  /admin/diningcode          AdminDiningcodeShopPage (다이닝코드 정식, SSE 일괄 저장)
  /admin/diningcode-test     AdminDiningcodeTestPage (검증용 — 유지)
  /admin/catchtable-test     AdminCatchtableTestPage (검증용)
  /admin/restaurants         AdminRestaurantsPage / .../:placeId
  /admin/canonical           AdminCanonicalPage (머지 제안 큐)
  /admin/analytics           AdminAnalyticsPage
  /admin/crawl-test          AdminCrawlTestPage / .../:jobId
  /admin/ai-test             AdminAiTestPage
  /admin/settings            AdminSettingsPage (탭 컨테이너 — ai-keys / map)
```

옛 `/admin/ai-keys` 북마크는 `/admin/settings/ai-keys` 로 redirect. 공개 상세는 옛 `?placeId=xxx` 모달 패턴을 **버리고** 별도 라우트(`/restaurants/:placeId`)로 분리 — 모바일 body 스크롤 + 탭 history 를 위한 결정 ([mobile UX docs](../../docs/mobile-public-restaurant-ux.md)).

## Data [coverage: high — 6 sources]

데이터 흐름 (단일 진실의 원천):

```
packages/api-contract (Zod schema)
     │ 검증+OpenAPI         │ 타입+fetch
     ▼                      ▼
  friendly                @repo/shared
  (Fastify)               (API client/hooks)
                           │           │
                           ▼           ▼
                          웹          앱
```

영속 데이터: SQLite 파일 (`apps/friendly/data/dev.db`), Prisma 마이그레이션. 클라이언트 토큰: 웹은 `localStorage` `lp:token`, 앱은 AsyncStorage `lp:token`. 이외 웹 localStorage: `lp:panelPrefs` — 페이지별 사이드 패널 좌/우 위치 (`panelPrefsStore` Zustand 영속).

### 도메인 테이블 그룹 (전 15개)

| 그룹 | 테이블 (카운트만 — 자세한 모델은 friendly/canonical/analytics 토픽) |
|---|---|
| 사용자 (3) | `User`, `Pick`, `PickResult` |
| 외부 SDK 키 (2) | `LlmProviderConfig`, `MapProviderConfig` |
| **canonical (2) 신규** | `CanonicalRestaurant`, `CanonicalMergeProposal` |
| 식당/크롤 (3) | `Restaurant` (← `(source, sourceId)` unique + `canonicalId` FK), `VisitorReview`, `ReviewSummary` |
| 분석 v4 — 리뷰 단위 (2) | `MenuMention`, `ReviewTag` |
| 메뉴 그룹핑 — 식당별 (1) | `MenuCanonical` |
| 전역 머지 + 통계 (2) | `GlobalMenuCanonical`, `GlobalMenuCanonicalLink` |

`Restaurant` 의 스키마 확장 요점:
- `source String @default("naver")` + `sourceId String` — `@@unique([source, sourceId])` 로 출처별 식별
- `placeId String? @unique` — 공개 `/restaurants/:placeId` 라우트 호환 보존 (네이버만 채워지고 나머지 출처는 null)
- `canonicalId String` (NOT NULL) — `CanonicalRestaurant` FK

`CanonicalMergeProposal` 은 `(canonicalAId, canonicalBId)` unique (cuid 사전순 정규화) + `status: open|accepted|rejected|superseded` — 어드민이 수동 처리. 자세한 모델·인덱스: [friendly](friendly.md), [canonical](canonical.md).

### 분석 LLM 파이프라인 (3단계)

```
크롤 (출처 3종)
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

## Key Decisions [coverage: high — 11 sources]

CLAUDE.md / TECH_STACK.md / 도메인 토픽에 명시된 핵심 결정.

| 결정 | 이유 |
|---|---|
| **용어 규약 — 웹 / 앱 / 모바일 분리 (신규)** | "모바일"의 모호함 제거. 웹은 `apps/web`, 앱은 `apps/mobile`, "모바일"은 웹의 반응형만. 코드 식별자(`mobile`/`web` 슬러그)는 그대로 — 디렉터리 슬러그 기준. CLAUDE.md 의 "용어" 섹션이 단일 출처 |
| **출처 3종 + canonical 1:N 묶음 (신규)** | 크롤 출처 확장 (Naver + 다이닝코드 + 캐치테이블). `Restaurant.(source, sourceId)` unique 로 출처별 행 분리, `CanonicalRestaurant` 가 같은 가게 묶음. `placeId @unique nullable` 로 공개 URL 호환 유지 |
| **C안 — 자동 DC 머지 정착 (갱신)** | Naver 크롤 done 직후 `tryAutoMatchDiningcode` 가 좌표 200m 반경 DC 후보를 점수화해 nameScore/distance/tie-gap 임계 통과 시 **DC 저장 + canonical 머지를 자동 수행**. 이전 "수동 확정만" 정책에서 한 단계 진화 — 명백히 같은 가게의 케이스는 운영자 손을 거치지 않게. 임계 못 넘는 케이스는 silent skip 후 `CanonicalMergeProposal` 큐가 fallback. 잘못된 머지의 복구 비용이 큰 케이스만 사람 컨펌 |
| **AI 자동 발견 — 영역명 한 줄로 N건 신규 등록 (신규)** | `/admin/auto-discover` — area + 카테고리 + targetCount 만 받아 AI 가 키워드 8개 생성 → 다중 검색 + dedupe → 그룹 5병렬 직렬 크롤. actor 당 잡은 1개 제한 (무거운 파이프라인 한 줄). 기존 `/admin/discover` 의 수동 흐름은 그대로, 별도 메뉴로 추가 |
| **MAX_CONCURRENT_PER_ACTOR 3 → 5 (갱신)** | auto-discover 의 그룹 크기 5와 정렬. 어드민 발견 페이지의 다중 선택 일괄 등록도 5병렬을 받게 됨. 기존 in-flight dedup + FIFO 큐 두 layer 그대로 |
| **부팅 시 stale 요약 행 정리 (신규)** | `cleanupStaleReviewSummaries` 가 서버 부팅 직후 `ReviewSummary.status in ('pending','running')` 행을 `failed + errorCode='server_restart'` 로 마킹. 단일 인스턴스 가정 하에서 부팅 시점엔 실행 중인 요약 작업이 없으므로 stale. 기존 재요약 경로(backfillForRestaurant) 와 자연 호환 — 다음 큐가 그대로 잡음 |
| **SSE liveness 패턴 — heartbeat 15s + idle timeout (신규)** | summary/crawl/auto-discover/analytics SSE 모두 15s heartbeat 코멘트 + idle timeout 으로 서버 다운 자동 감지. 어드민 진행률이 영원히 "진행중" 으로 묶이는 사고 방지 |
| **AdminDiningcodePage 정식 / 테스트 페이지 둘 다 유지 (신규)** | 정식 페이지(`/admin/diningcode`)는 운영자 일괄 등록 동선 + SSE 진행률 (menu-grouping 패턴 차용). 테스트 페이지(`/admin/diningcode-test`)는 어댑터 회귀·검증용으로 별도 유지 |
| **공개 영역 도입 — 사용자 대상 페이지 vs 어드민 운영 도구 분리** | 분석 결과(랭킹/메뉴 통계)는 본래 사용자가 보라고 만든 자산. SPA 안에서 `PublicLayout` / `AdminLayout` 두 묶음으로 나누고, 공개는 비로그인 가능 |
| **공개 API 별도 라우트 (`/api/v1/restaurants/public/*`)** | admin 라우트와 service 메서드는 공유하되 라우트만 분리 — admin 회귀 위험 0. 공개 응답에서 운영 메타(요약 진행 상태/모델/에러)만 제거된 평탄화 스키마 사용 |
| **어드민 발견 = 검색·등록 통합 마커 + 다중 선택 일괄 크롤링** | 단건 placeId 입력 외 키워드 진입이 필요. 네이버 PC 지도 직접 fetch 는 ncaptcha 차단 → Playwright 페이지로 응답 가로채기. 검색 빨강 / 등록 회색 마커 통합, 다중 선택은 직렬 await + 시작 거부 placeId 체크 보존. 상세는 공개 `PublicRestaurantDetail` 재사용 (Naver+DC 융합) |
| **발견 리스트 카드 = canonical 단위 합산 (신규)** | 노출 행마다 같은 canonical 의 DC 형제를 합산해 totalReviews/summary*/positive·negative·neutralCount 두 출처 합. 평균 점수는 가중평균. 응답 행 키는 Naver placeId 그대로 — UI/캐시 변경 없음. SSE snapshot 이 합산 카운트를 덮어쓰지 않도록 별도 패치 |
| **발견 리스트 행 호버 자동 이동 → "지도" 버튼 클릭 (신규)** | 데스크탑 호버 트리거는 모바일 터치에서 의도와 다르게 발화. 식당명 라인 우측에 명시적 "지도" 버튼을 두고 그쪽 클릭만 hoveredPlaceId 갱신 — 모바일/터치 호환 |
| **공개 상세 = Naver + 다이닝코드 융합 (신규)** | 어드민 발견 상세 패널도 같은 컴포넌트(`PublicRestaurantDetail`) 재사용. 백엔드 `restaurant.merge.ts` (순수 함수 모음) 가 canonical 그룹의 Naver 행 + DC 형제들을 단일 detail 로 머지 — 필드별 하드코딩 규칙(rating/phone/address Naver 우선, businessHours DC 우선, photos/reviews 합치고 dedup, descTags/wordcloud DC 전용) |
| **actor 단위 rate-limit 제거** | `crawl.service.ts` 의 `RATE_LIMIT_WINDOW_MS` + `lastCallByActor: Map` 삭제. spam 방어는 in-flight dedup + `MAX_CONCURRENT_PER_ACTOR=5` FIFO 큐 두 layer 로 충분 (3 → 5 갱신, auto-discover 그룹 크기와 정렬) |
| **패널 좌/우 토글 = 페이지별 namespace + xl+ 한정** | `panelPrefsStore` Zustand + localStorage `lp:panelPrefs`. xl(>=1280) 미만은 풀블리드라 토글 비노출 |
| **vworld JS SDK 거부, OpenLayers + WMTS 직접 호출** | vworld JS SDK 의 도메인 화이트리스트 부담 회피. WMTS 타일 엔드포인트는 키만 검증. `ol@^10.7.0` 한 의존만 추가 |
| **공개 키 노출 = admin secret 과 보안 등급 동등** | WMTS 키는 어차피 클라사이드 자원(브라우저 Network 탭 노출). 가드 토글이 보안에 무의미하므로 라우트 분리만으로 처리 |
| **Pretendard 공개 한정 + 텍스트 시프트 전역** | 일반 사용자는 Pretendard 가독성에 익숙. 어드민은 system-ui fallback |
| **`ImgWithFallback` 공용 컴포넌트** | 네이버 CDN 의 Referer 검사 회피 — `referrerPolicy=no-referrer` + `onError` placeholder 한 묶음 |
| **모바일 UX = body 스크롤 + 라우트 분리 + sticky containing block 규율** | 공개 맛집 페이지에서 정착시킨 프로젝트 차원의 모바일 패턴 묶음. 자세한 7개 규칙은 별도 sub-section ↓ |
| **pnpm + Turbo + Node 22 LTS** | 디스크/속도/엄격성 + 캐싱 + 최신 LTS |
| **Zod SSOT (api-contract)** | FE/BE 동기화 — 빌드 없는 src export로 tsx/Vite/Metro 모두 호환 |
| **SQLite + Prisma** | MVP 규모엔 충분 — WAL, Litestream으로 운영 백업 가능 |
| **Vite 6 + React 19** (웹) | SEO/SSR 불필요한 SPA → 단순화 |
| **TanStack Query + Zustand** | Redux 대비 보일러플레이트 ↓, 서버/클라 상태 분리 |
| **로직만 공유, UI는 플랫폼별** | Tamagui/RN-Web 통합 복잡도가 이득보다 큼 |
| **분석은 수동 LLM 트리거 우선** | 비용 예측 가능성 + 재현성 |
| **`*_VERSION` 상수로 stale 판정** | 프롬프트/스키마 변경 시 상수만 올려도 재실행 대상이 자동 식별됨 |
| **통계 트리는 `categoryPath` 단일 컬럼 + 메모리 빌더** | 별도 트리 테이블 없음 — 단순함 + 빠른 재구성 |
| **Docker / Redis 없음** | SQLite 파일 DB라 컨테이너 불필요. 단일 인스턴스 + lru-cache 로 충분 |

`tsconfig.base.json`은 `strict + noUncheckedIndexedAccess + verbatimModuleSyntax + isolatedModules` — 엄격 모드 풀스택.

### 모바일 UX 규율 (프로젝트 차원) [coverage: high — 1 doc + 8 source files]

전체 명세는 [docs/mobile-public-restaurant-ux.md](../../docs/mobile-public-restaurant-ux.md). 공개 `/restaurants` + `/restaurants/:placeId` 에서 정착시켰지만 **공개·어드민 양쪽에 동일하게 적용되는 프로젝트 규율**이다 — 새 모바일 화면을 만들 땐 이 7개 규칙을 기본으로 따른다.

1. **모바일 = body 스크롤** — 페이지 자체를 `fixed inset-0` 풀스크린 모달로 만들지 않는다. 모바일 브라우저(iOS Safari / Android Chrome) 의 URL bar collapse 가 동작하려면 document/window 자체가 스크롤되어야 한다. 상세 화면이 필요하면 모달 대신 **라우트 분리**.
2. **sticky element 는 wrapping 금지** — wrapping div 가 sticky containing block 을 자기 boundary 로 묶어 본문 스크롤 시 함께 사라진다. 분기는 sticky element 자체 className 에서.
3. **sticky 묶음은 `overflow:auto` 컨테이너 밖에 둔다** — `overflow-y:auto` div 안에 sticky 를 두면 자체 sticky containing block 이 형성되는데, 모바일에서 그 div 가 실제 scroll 되지 않으면 sticky 가 깨진다.
4. **`100vh` 대신 `100dvh`** — iOS Safari 의 dynamic viewport 와 합치 — 잘림 회피.
5. **탭 상태는 URL 의 일부, push 로 전환** — `?tab=menu`. `replace` 옵션 사용 금지.
6. **한글 IME 대응** — URL/상위 state 와 sync 되는 controlled input 은 `compositionStart/End` + 로컬 `draft` state 필수.
7. **scroll-to-top 환경 자동 분기** — `scrollHeight > clientHeight + 1` 로 자체 scroll 가능 여부 판정해 `scrollRef.scrollTo` (admin/xl+ 자체 scroll 컨테이너) vs `window.scrollTo` (모바일 body 스크롤) 갈라타기.
8. **iOS Safari focus zoom 회피** — `input`/`textarea`/`select` 의 font-size ≥ 16px.

부가 — dev 서버에서 모바일 단말 테스트하려면 `apps/web/vite.config.ts` 의 `server.host: true` 가 LAN IP 노출을 켠다.

## Gotchas [coverage: medium — 7 sources]

- **"모바일" 단어의 의미 (재강조)** — 한국어 본문에서 "모바일" 단독은 **웹의 반응형**만 가리킨다. `apps/mobile` 의 Expo 앱을 지칭하고 싶을 땐 항상 "앱". 코드 식별자/스크립트의 `mobile` 슬러그는 디렉터리 이름이라 그대로
- **출처별 행이 분리됨 — `(source, sourceId)` unique** — 같은 가게라도 출처가 다르면 Restaurant 행이 따로 생긴다. Naver 크롤 done 후크가 임계 통과 시 자동 DC 매칭+머지를 시도하므로 명백한 동일 가게는 자동 묶임. 임계 못 넘으면 silent skip → `CanonicalMergeProposal` 큐에 검토 대기로 남음
- **자동 DC 머지 임계 — silent skip 케이스** — `tryAutoMatchDiningcode` 는 nameScore / 50m / 차순위 격차 세 임계 중 하나라도 못 넘으면 그냥 return. 별도 알림 없음. 누락된 머지는 `ProposalService` 검토 큐(`/admin/canonical`) 가 fallback 으로 잡음 — 거기 안 보이면 search 가 200m 반경 안에서 DC 후보 자체를 못 찾은 경우
- **`placeId` 는 nullable (네이버 외 출처는 null)** — 공개 라우트 `/restaurants/:placeId` 는 네이버 행에만 해당. 다이닝코드/캐치테이블 행은 URL 직링크 미지원 (현 시점) — 공개 노출은 canonical 묶음을 거치게 될 가능성 있음
- **패키지 간 순환 의존 금지** — `shared → api-contract`는 OK, 반대는 금지
- **공유 스키마는 반드시 `@repo/api-contract`에 zod로** — 직접 `apps/friendly`에 정의하면 웹/앱이 못 쓴다
- **vworld 키 미등록 시 placeholder** — 공개 `/restaurants` 페이지는 `useMapPublicConfig` 가 404 면 "지도 키가 등록되지 않았습니다" placeholder 로 fallback
- **공개 list 의 `q` 쿼리는 LIKE 기반 (인덱스 없음)** — 식당 수가 1k+ 로 늘면 별도 검색 인덱스(FTS5 등) 재고 필요
- **공개 list 의 bbox 필터는 메모리 처리** — Prisma where 가 아닌 enriched 후 `.filter()`. 좌표가 `snapshotJson` 안에 있어 SQL 단계에서 못 자른다
- **ncaptcha — 네이버 PC 지도 검색 직접 fetch 차단** — 어드민 발견은 Playwright 페이지를 띄워 그 페이지의 captcha 토큰 + 세션 쿠키로 응답 가로채는 방식
- **OpenLayers `ol/ol.css` import 필수** — 마커가 안 보이거나 어택 영역이 망가지면 보통 이 import 빠진 게 원인
- **Prisma DLL 락 (Windows)** — `db:generate` / `db:migrate` 전에 friendly dev 서버를 끈다
- **첫 관리자 만들기** — 회원가입은 항상 `role=USER`. 승격은 CLI: `pnpm --filter friendly promote-admin you@example.com`. 앱엔 어드민 UI 없음 (의도)
- **분석 단계 실행 순서 강제** — 리뷰 분석 → 식당별 그룹핑 → 전역 머지. 앞 단계가 stale이면 뒤 단계 결과가 흔들린다
- **공개 영역에도 분석 stale 그대로 노출** — 별도 stale 배지 없음. 운영 정책으로 처리
- **모바일 sticky 함정 (재강조)** — sticky 가 깨질 때 99%는 (a) wrapping div 로 containing block 묶임 또는 (b) `overflow:auto` 컨테이너 안에 둠
- **부팅 직후 stale 요약 행은 자동으로 failed 처리** — 어드민 진행률에서 "요약 진행중" 으로 보이는 행이 서버 재시작 후엔 `errorCode='server_restart'` 의 failed 상태로 바뀐다. 기존 backfillForRestaurant 경로가 이 행을 다음 큐에서 pending 으로 되돌려 다시 잡음
- **자동 발견 잡은 actor 당 1 개 제한** — `auto-discover` 는 무거운 파이프라인(AI+검색+크롤 한 줄)이라 동시 1개. 다이닝코드 bulk-save 의 다중 동시와 의도적으로 다름. 두 번째 잡을 같은 actor 가 시작하려면 첫 번째 종료/취소가 필요
- **HANDOFF 문서는 git에 넣지 말 것** — `docs/HANDOFF-*.md`는 untracked 유지
- **버전 매트릭스** — 웹은 React 19, 앱은 React 18 — `@repo/shared`가 React 18+ peer로 양쪽 호환
- **앱 Expo Web 은 SPA 모드 고정** — `web.output: 'single'`. 정적 사전렌더(`'static'`)는 워크스페이스 두 React 사본 환경에서 SSR 500

## Sources [coverage: high — 18 sources]

- [README.md](../../README.md)
- [CLAUDE.md](../../CLAUDE.md) — "용어" 섹션 포함
- [TECH_STACK.md](../../TECH_STACK.md)
- [package.json](../../package.json)
- [pnpm-workspace.yaml](../../pnpm-workspace.yaml)
- [turbo.json](../../turbo.json)
- [tsconfig.base.json](../../tsconfig.base.json)
- [apps/friendly/prisma/schema.prisma](../../apps/friendly/prisma/schema.prisma) — `CanonicalRestaurant`, `CanonicalMergeProposal`, `Restaurant.(source, sourceId)`
- [packages/api-contract/src/routes.ts](../../packages/api-contract/src/routes.ts)
- [packages/api-contract/src/schemas/crawl.ts](../../packages/api-contract/src/schemas/crawl.ts) — 출처 3종 스키마
- [apps/web/src/routes/admin/AdminDiningcodeShopPage.tsx](../../apps/web/src/routes/admin/AdminDiningcodeShopPage.tsx)
- [apps/web/src/routes/admin/AdminDiscoverPage.tsx](../../apps/web/src/routes/admin/AdminDiscoverPage.tsx)
- [apps/web/src/routes/admin/AdminAutoDiscoverPage.tsx](../../apps/web/src/routes/admin/AdminAutoDiscoverPage.tsx) — 자동 발견 페이지 (신규)
- [apps/web/src/components/admin/AdminLayout.tsx](../../apps/web/src/components/admin/AdminLayout.tsx) — 사이드바 NAV (자동 발견 추가)
- [apps/web/src/components/admin/discover/DiscoverPanel.tsx](../../apps/web/src/components/admin/discover/DiscoverPanel.tsx) — 행 "지도" 버튼 (호버 → 클릭 트리거 갱신)
- [apps/web/src/stores/panelPrefsStore.ts](../../apps/web/src/stores/panelPrefsStore.ts)
- [apps/friendly/src/modules/auto-discover/auto-discover.service.ts](../../apps/friendly/src/modules/auto-discover/auto-discover.service.ts) — 신규
- [apps/friendly/src/modules/auto-discover/auto-discover.route.ts](../../apps/friendly/src/modules/auto-discover/auto-discover.route.ts) — 신규 (SSE heartbeat 15s)
- [apps/friendly/src/modules/auto-discover/auto-discover-registry.ts](../../apps/friendly/src/modules/auto-discover/auto-discover-registry.ts) — 신규
- [apps/friendly/src/modules/auto-discover/auto-discover.prompts.ts](../../apps/friendly/src/modules/auto-discover/auto-discover.prompts.ts) — 키워드 8개 생성 프롬프트
- [apps/friendly/src/modules/restaurant/restaurant.merge.ts](../../apps/friendly/src/modules/restaurant/restaurant.merge.ts) — Naver+DC 융합 순수 함수 모음 (신규)
- [apps/friendly/src/modules/crawl/crawl.service.ts](../../apps/friendly/src/modules/crawl/crawl.service.ts) — `tryAutoMatchDiningcode` 자동 매칭+머지 후크
- [apps/friendly/src/modules/crawl/job-registry.ts](../../apps/friendly/src/modules/crawl/job-registry.ts) — `MAX_CONCURRENT_PER_ACTOR = 5` (3 → 5 갱신)
- [apps/friendly/src/modules/summary/summary.service.ts](../../apps/friendly/src/modules/summary/summary.service.ts) — `cleanupStaleReviewSummaries` 부팅 cleanup (신규)
- [apps/friendly/src/server.ts](../../apps/friendly/src/server.ts) — 부팅 시 cleanup 호출
- [apps/friendly/src/modules/crawl/adapters/naver-search.playwright.adapter.ts](../../apps/friendly/src/modules/crawl/adapters/naver-search.playwright.adapter.ts)
- [docs/menu-hierarchy.md](../../docs/menu-hierarchy.md)
- [docs/mobile-public-restaurant-ux.md](../../docs/mobile-public-restaurant-ux.md)
- [apps/web/src/App.tsx](../../apps/web/src/App.tsx)
- [apps/web/vite.config.ts](../../apps/web/vite.config.ts) — `server.host: true` LAN/모바일 단말 dev 접근
- 토픽 — [auto-discover](auto-discover.md), [friendly](friendly.md), [web](web.md), [api-contract](api-contract.md), [analytics](analytics.md), [menu-grouping](menu-grouping.md), [media](media.md), [ai](ai.md), [map](map.md), [crawl](crawl.md), [canonical](canonical.md)
