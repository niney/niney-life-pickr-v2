---
topic: shared
last_compiled: 2026-05-15
sources_count: 40
status: active
aliases: [react-query, zustand, design-tokens, ui-primitives, "@repo/shared", useNaverSearch, "crawlApi.search", naver-search-hook, useCanonical, canonical-api, diningcode-bulk-save, useDiningcodeBulkSaveJob]
---

# shared — FE 공통 패키지

## 1. Purpose [coverage: high — 5 sources]

`@repo/shared`는 web과 mobile에서 동시에 사용되는 프론트엔드 공통 코드를 모아둔 워크스페이스
패키지다. 어드민(인증 필요)과 공개(비로그인 허용) 두 모드를 모두 한 패키지에서 다루며,
컨슈머는 `apps/web`(어드민 + 공개 + 로그인 페이지)과 `apps/mobile`(어드민 게이트)이다.
책임 영역은 다음과 같다.

- 타입 안전한 fetch 래퍼와 도메인별 API 함수 (auth, picks, admin, crawl, restaurant,
  canonical, menu-grouping, analytics, ai, settings-map). 어드민/공개 라우트가 같은 `apiFetch` 위에 얹힌다.
- TanStack Query 훅 (서버 상태) — 메뉴 그룹핑/전역 머지/다이닝코드 일괄 저장 잡 SSE 훅 +
  공개 맛집 리스트/상세/인사이트/지도 설정 훅 + 캐노니컬(병합/분리/제안 큐) 훅 포함
- Zustand 스토어 (인증, 활성 크롤 잡, 활성 그룹핑/전역 머지/DC 일괄 저장 잡)
- 프로세스 전역 SSE 매니저 싱글톤 (요약 진행률 + review 분석 멀티플렉싱 — placeId + canonicalId 두 키 종류 동시)
- 잡 단위 SSE 라이프사이클 훅 (그룹핑/전역 머지/DC 일괄 저장 — 매니저를 쓰지 않고 hook 자체가
  EventSource 를 직접 들고 백오프 재연결 관리)
- 디자인 토큰·테마·`ThemeProvider`·CSS 변수 변환
- 플랫폼 분기형 UI 프리미티브 (Button, Input, Stack, Text, Divider, ErrorBanner, Screen, SegmentedControl)
- 공용 상수 (`APP_NAME`, React Query staleTime/gcTime)

빌드 산출물 없이 `src/index.ts`를 그대로 노출(`"main": "./src/index.ts"`)하므로
Turborepo 컨슈머는 별도 빌드 단계 없이 TS 소스를 바로 import한다.

## 2. Architecture [coverage: high — 18 sources]

```
packages/shared/src/
├── index.ts                # barrel: 모든 하위 모듈 re-export
├── api/
│   ├── client.ts           # apiFetch + ApiError + configureApi (토큰 게터 주입)
│   ├── auth.api.ts
│   ├── picks.api.ts
│   ├── admin.api.ts
│   ├── crawl.api.ts        # start/list/cancel/search + catchtable*/diningcode* + DC bulk-save 잡 + buildJobEventsUrl + buildDiningcodeBulkSaveEventsUrl
│   ├── restaurant.api.ts   # 어드민 list/ranking/getByPlaceId/delete/reanalyze + 공개 publicList/publicByPlaceId/publicInsights + buildSummaryEventsUrl({placeIds, canonicalIds})
│   ├── canonical.api.ts    # candidates/merge/split/dismissSuggestion/proposals(list/run/accept/reject)/delete (신규)
│   ├── menu-grouping.api.ts# 식당 단위 그룹핑 + 잡 시작/스냅샷 + buildGroupingJobEventsUrl
│   ├── analytics.api.ts    # overview / global-menus / category-tree + 전역 머지 잡 + buildGlobalMergeJobEventsUrl
│   ├── settings-map.api.ts # 어드민 list/update/remove/getSecret + 공개 publicConfig (Routes.SettingsMap 단일 소스)
│   └── ai.api.ts           # LLM provider 관리 + complete/completeBatch
├── hooks/
│   ├── useAuth.ts          # useCurrentUser, useLogin, useRegister, useLogout
│   ├── usePicks.ts         # 쿼리키 팩토리 + CRUD + useRandomPick
│   ├── useAdmin.ts
│   ├── useCrawl.ts         # useStartCrawl/useCrawlJobs/useCancelCrawl/useNaverSearch + useCrawlJobStream + useCatchtable*/useDiningcode* + DC bulk-save 잡 훅
│   ├── useRestaurant.ts    # 어드민 list/ranking/byPlaceId/delete/reanalyze + 공개 useRestaurantsPublic/useRestaurantPublic/useRestaurantPublicInsights + canonical 기반 list summary SSE 구독
│   ├── useCanonical.ts     # candidates/merge/split/dismiss + proposals(list/run/accept/reject) + delete (신규)
│   ├── summarySseManager.ts# 프로세스 전역 SSE 싱글톤 (place + canonical 두 키 멀티플렉싱)
│   ├── useMenuGrouping.ts  # ranking/group/status/createJob + useGroupingJob (자체 EventSource + 백오프)
│   ├── useAnalytics.ts     # overview/globalMenus/categoryTree + useStartGlobalMerge + useGlobalMergeJob (chunk 진행)
│   ├── useSettingsMap.ts   # 어드민 providers/secret + 공개 useMapPublicConfig
│   └── useAi.ts            # provider CRUD + complete/test/models
├── stores/
│   ├── authStore.ts                       # Zustand: user / token / isGuest
│   ├── activeCrawlJobStore.ts             # Zustand: jobs by jobId (멀티 슬롯)
│   ├── activeGroupingJobStore.ts          # Zustand + persist: jobId (단일 슬롯, localStorage)
│   ├── activeGlobalMergeJobStore.ts       # Zustand + persist: jobId (단일 슬롯, localStorage)
│   └── activeDiningcodeBulkSaveJobStore.ts# Zustand + persist: jobId (단일 슬롯, localStorage, 신규)
├── design/ … (불변)
├── ui/ … (불변)
└── constants/ …
```

API 함수 모듈과 React Query 훅 모듈은 1:1 페어로 분리된다. 함수 모듈(`*.api.ts`)은
querystring 빌더와 `apiFetch` 호출만 담당하고, 훅 모듈(`use*.ts`)은 캐시 키·`enabled`·
`placeholderData`·`staleTime`·invalidate 정책 등 React Query 레이어를 책임진다. 어드민과
공개 함수는 같은 모듈에 공존하지만(`restaurant.api.ts`의 `list`/`publicList` 등) 컨슈머는
훅 이름으로 모드를 식별한다 — `useRestaurantList`(어드민) vs `useRestaurantsPublic`(공개).

**캐노니컬 도메인 신규** ([canonical.api.ts](../../packages/shared/src/api/canonical.api.ts) +
[useCanonical.ts](../../packages/shared/src/hooks/useCanonical.ts)) — 같은 가게의 Naver / DC
source 를 하나로 묶는 canonical 모델을 다룬다. 훅 셋: `useCanonicalCandidates`(모달 open 시만
fetch), `useMergeCanonical`, `useSplitCanonical`, `useDismissCanonicalSuggestion`,
`useCanonicalProposals`(30s `refetchInterval` 폴링, 15s `staleTime`), `useRunCanonicalProposals`,
`useAcceptCanonicalProposal`, `useRejectCanonicalProposal`, `useDeleteCanonical`. 모든 mutation
의 onSuccess 는 영향 받는 캐시(`['restaurant', 'list']` / `['canonical', 'candidates']` /
`['canonical', 'proposals']`)를 prefix 매치로 invalidate.

**다이닝코드 도메인 확장** ([crawl.api.ts](../../packages/shared/src/api/crawl.api.ts) +
[useCrawl.ts](../../packages/shared/src/hooks/useCrawl.ts)) — 캐치테이블 + 다이닝코드 검증
페이지와 정식 등록 흐름을 모두 같은 `crawlApi` 안에서 처리. 함수: `catchtableSearch/Shop/Menus/
ReviewOverview`, `diningcodeSearch/Shop/ShopReviews/ShopSave`, `diningcodeRegistered`,
`diningcodeBulkSaveStart/Get/Cancel` + `buildDiningcodeBulkSaveEventsUrl`. 훅:
`useCatchtableSearch/Shop/Menus/ReviewOverview`, `useDiningcodeSearch/Shop/Reviews`,
`useSaveDiningcodeShop`, `useDiningcodeRegistered`, `useStartDiningcodeBulkSave`,
`useCancelDiningcodeBulkSave`, **`useDiningcodeBulkSaveJob`**.

**`useDiningcodeBulkSaveJob(jobId)` 동작** — `useGroupingJob` 패턴을 그대로 답습.
1. `useQuery(['crawl', 'diningcode-bulk-save', jobId])` 가 GET snapshot — 404 면 `activeStore.clear()`
   호출 후 `null` 반환 (잡이 서버에서 만료 시 stale jobId 가 store 에 남지 않게).
2. `useEffect` 안에서 `buildDiningcodeBulkSaveEventsUrl(jobId)` 로 토큰 주입된 URL 만든 뒤
   `new EventSource(url)`. 세 이벤트 `addEventListener`:
   - `'snapshot'` — `qc.setQueryData` 로 전체 교체, `retryRef = 0`.
   - `'item'` — 매칭 vRid 행 머지 + `doneCount/failedCount/skippedCount` 재계산.
   - `'done'` — state·finishedAt 갱신 후 `closedRef = true; es.close()` + 세 캐시
     (`['crawl', 'diningcode-registered']`, `['restaurant', 'list']`, `['canonical', 'proposals']`)
     invalidate.
3. `onerror` 시 백오프 `Math.min(30_000, 1000 * 2 ** retryRef.current)` (1s → 2s → 4s → 8s →
   16s → 30s cap) 으로 재연결. `closedRef` true 면 모든 reconnect 차단.
4. cleanup 에서 `cancelled = true` + `closedRef = true` + 백오프 타이머 clear + ES close.

**SSE 매니저 확장** — `summarySseManager` 가 이전엔 placeId 단일 키였는데 이번에 `SubscriptionKey`
를 union `{ kind: 'place'; placeId } | { kind: 'canonical'; canonicalId }` 로 확장. 서버는
두 종류 키를 한 connection 에서 받아 각 이벤트마다 canonicalId / placeId 양쪽 태그를 흘려보내고,
매니저는 들어온 이벤트를 양쪽 구독자 set 에 dispatch. `lastSnapshotByCanonical` 과
`lastSnapshotByPlace` 두 Map 으로 키 종류별 replay 캐시 분리. DC source 도 canonical 키로
구독하면 라이브 진행 배지가 갱신된다 (리스트 화면 — `useRestaurantListSummaryEvents` 가
canonicalId[] 받음). 디테일 페이지(`useRestaurantSummaryEvents(placeId)`) 는 Naver 전용 라우트라
place 키로 구독.

`apiFetch`의 자동 토큰 첨부는 모드를 구분하지 않는다 — 토큰이 있으면 모든 요청에
`Authorization: Bearer <token>`이 붙고, 없으면 헤더 없이 나간다. 공개 라우트는 토큰이
있어도 그대로 통과(서버가 무시), 없어도 그대로 통과. `onUnauthorized` 콜백은 401 응답
때만 발동.

훅 레이어는 `useQueryClient`로 TanStack Query 캐시를 직접 패치하는 패턴을 광범위하게 쓴다
(SSE 이벤트 → 리스트/상세 캐시 inline merge). `summarySseManager`는 React 바깥의 모듈
싱글톤이라 어떤 컴포넌트가 mount/unmount되든 동일한 단일 EventSource를 공유한다.

반면 **잡 단위 SSE 훅**(`useGroupingJob`, `useGlobalMergeJob`, `useDiningcodeBulkSaveJob`)은
매니저를 거치지 않고 훅 인스턴스 안에서 직접 `EventSource` 라이프사이클을 들고 있다. 잡
하나당 한 페이지에서 하나만 띄우는 일회성 흐름이라 멀티플렉싱이 필요 없고,
`closedRef`/`retryRef`로 재연결과 종단 처리만 깔끔하게 다루면 충분.

각 UI 컴포넌트는 `*.types.ts`로 props 계약을 단일 소스로 두고, 플랫폼 번들러가
파일 확장자 해석으로 구현체를 골라간다 (Vite/Webpack은 `.web.tsx`, Metro는
`.native.tsx`). `tsconfig.json`은 `@repo/config/tsconfig/react.json`을 상속.

## 3. Talks To [coverage: high — 7 sources]

- 의존성: `@repo/api-contract` (zod 스키마/타입/`Routes` 상수 + `recomputeCanonicalAggregates` 유틸), `@repo/utils`,
  `@tanstack/react-query`, `zustand` + `zustand/middleware` (persist).
- peerDependencies: `react >=18.0.0`, `react-native >=0.76.0` (옵셔널).
- 컨슈머:
  - `apps/web` — 어드민 콘솔(맛집/메뉴/분석/AI/지도 설정 + **발견 페이지** + **다이닝코드 검증/정식 페이지** + **캐치테이블 검증 페이지**), 공개 맛집 페이지, 로그인.
  - `apps/mobile` — 어드민 게이트.
- 외부:
  - `apiFetch`로 [friendly](friendly.md) API에 HTTP.
  - `useCrawlJobStream` → `Routes.Crawl.jobEvents` EventSource.
  - `useDiningcodeBulkSaveJob` → `Routes.Crawl.diningcodeBulkSaveJobEvents(jobId)` EventSource (token query 인증).
  - `summarySseManager` → `Routes.Restaurant.summaryEvents` 단일 EventSource. placeId / canonicalId 두 키 종류 멀티플렉싱.
  - `useGroupingJob` → `Routes.Analytics.groupingJobEvents(jobId)`, `useGlobalMergeJob` → `Routes.Analytics.globalMergeJobEvents(jobId)`.
  - `canonicalApi` → friendly의 `Routes.Canonical.*` (candidates/merge/split/dismissSuggestion/proposals/proposalsRun/proposalAccept/proposalReject/delete).
- UI 측 사용처는 [web](web.md) 참조.

## 4. API Surface [coverage: high — 25 sources]

**API 클라이언트 (`api/`)**
- `configureApi(cfg)`, `getApiConfig()`, `apiFetch<T>(path, init)`, `ApiError`
- `authApi`: `register`, `login`, `me`, `logout`
- `picksApi`: `list`, `getById`, `create`, `update`, `remove`, `random`
- `adminApi`: `listUsers`, `setRole`
- `crawlApi`:
  - 네이버: `start`, `list`, `cancel`, `search({ q, bbox? })` + `buildJobEventsUrl(jobId)`
  - **캐치테이블 (확장)**: `catchtableSearch`, `catchtableShop(shopRef)`, `catchtableShopMenus(shopRef)`, `catchtableShopReviewOverview(shopRef)`
  - **다이닝코드 (확장)**: `diningcodeSearch`, `diningcodeShop(vRid)`, `diningcodeShopReviews(vRid, page)`, `diningcodeShopSave(vRid)` (DB 저장 + AI 큐잉 동기 응답), `diningcodeRegistered(vRids[])` (등록 배지 일괄)
  - **DC 일괄 저장 잡 (신규)**: `diningcodeBulkSaveStart(input)`, `diningcodeBulkSaveGet(jobId)`, `diningcodeBulkSaveCancel(jobId)` + `buildDiningcodeBulkSaveEventsUrl(jobId)` (SSE URL, `?token=`)
- `restaurantApi`:
  - 어드민: `list`, `ranking(query?)`, `getByPlaceId(placeId)`, `getSummaryStatus(placeId)`, `delete(placeId)`, `reanalyze(placeId)`
  - 공개: `publicList(query?)`, `publicByPlaceId(placeId)`, `publicInsights(placeId)`
  - SSE URL: **`buildSummaryEventsUrl({ placeIds?, canonicalIds? })`** — 시그니처가 객체로 변경됨. 두 키 종류 동시에 `?placeId=...&canonicalId=...` 로 직렬화.
- **`canonicalApi` (신규)**: `candidates(canonicalId)`, `merge(input)`, `split(canonicalId, input)`, `dismissSuggestion(canonicalId)`, `listProposals()`, `runProposals()`, `acceptProposal(proposalId, input)`, `rejectProposal(proposalId)`, `delete(canonicalId)`. 모두 `Routes.Canonical.*` 사용.
- `menuGroupingApi`: `groupForRestaurant(placeId)`, `getRanking(placeId, query?)`, `getRestaurantsStatus()`, `createGroupingJob({ placeIds })`, `getGroupingJob(jobId)` + `buildGroupingJobEventsUrl(jobId)`
- `analyticsApi`: `overview()`, `globalMenus(query?)`, `categoryTree()`, `startGlobalMerge({ full })`, `getGlobalMergeJob(jobId)` + `buildGlobalMergeJobEventsUrl(jobId)`
- `settingsMapApi`: 어드민 `list/update/remove/getSecret` + 공개 `publicConfig`
- `aiApi`: `complete`, `completeBatch`, `listProviders`, `updateProvider`, `deleteProvider`, `testProvider`, `listModels`

**React Query 훅 (`hooks/`)**
- 인증: `useCurrentUser`, `useLogin`, `useRegister`, `useLogout`
- 픽: `usePicks`, `usePick`, `useCreatePick`, `useUpdatePick`, `useDeletePick`, `useRandomPick`
- 어드민: `useAdminUsers`, `useSetUserRole`
- 크롤 네이버: `useStartCrawl`, `useCrawlJobs`, `useCancelCrawl`, `useCrawlJobStream`, `useNaverSearch(q, bbox)`
- **크롤 캐치테이블**: `useCatchtableSearch({ q, offset?, limit?, contractedOnly? })`(staleTime 60s), `useCatchtableShop(shopRef)`(5분), `useCatchtableShopMenus(shopRef, enabled)`(10분), `useCatchtableShopReviewOverview(shopRef)`(10분)
- **크롤 다이닝코드**: `useDiningcodeSearch({ q, from?, size?, order?, lat?, lng?, distance? })`(60s), `useDiningcodeShop(vRid)`(5분), `useDiningcodeShopReviews(vRid, page, enabled?)`(5분), `useSaveDiningcodeShop()` (mutation), `useDiningcodeRegistered(vRids)`(30s, 빈 배열 disabled)
- **DC 일괄 저장 잡**: `useStartDiningcodeBulkSave()` (onSuccess 시 store.setJobId + setQueryData), `useCancelDiningcodeBulkSave()`, **`useDiningcodeBulkSaveJob(jobId)`** (query + SSE + 백오프)
- 맛집 어드민: `useRestaurantList`, `useRestaurantRanking(query?)`, `useRestaurantByPlaceId(placeId)`, `useDeleteRestaurant`, `useReanalyzeRestaurant`, `useRestaurantSummaryEvents(placeId)`, `useRestaurantListSummaryEvents(canonicalIds[])`, `useRestaurantListSummaryEventsByPlaceIds(placeIds[])` (공개 발견 페이지용)
- 맛집 공개: `useRestaurantsPublic(query, { alwaysRefetchOnMount? })`, `useRestaurantPublic(placeId)`, `useRestaurantPublicInsights(placeId)`
- **캐노니컬 (신규)**: `useCanonicalCandidates(canonicalId | null)`(staleTime 30s, null=disabled), `useMergeCanonical()`, `useSplitCanonical()`, `useDismissCanonicalSuggestion()`, `useCanonicalProposals(enabled?)`(staleTime 15s + **refetchInterval 30_000 자동 폴링**), `useRunCanonicalProposals()`, `useAcceptCanonicalProposal()`, `useRejectCanonicalProposal()`, `useDeleteCanonical()`
- 메뉴 그룹핑: `useMenuRanking`, `useGroupForRestaurant`, `useGroupingRestaurantsStatus`, `useCreateGroupingJob`, `useGroupingJob`
- 분석: `useAnalyticsOverview`, `useGlobalMenus`, `useCategoryTree`, `useStartGlobalMerge`, `useGlobalMergeJob`
- 지도: `useMapProviders`, `useUpdateMapProvider`, `useDeleteMapProvider`, `useMapProviderSecret`, `useMapPublicConfig`
- AI: `useCompleteAi`, `useCompleteBatchAi`, `useProviders`, `useUpdateProvider`, `useDeleteProvider`, `useTestProvider`, `useProviderModels`

**SSE 매니저 (`hooks/summarySseManager.ts`)**
- `summarySseManager.subscribe(key: SubscriptionKey, handlers)` — `key` 가 `{ kind: 'place'; placeId }` 또는 `{ kind: 'canonical'; canonicalId }` union.
- 이벤트: `snapshot` (canonicalId + 옵션 placeId 태그) / `review`. 들어온 이벤트는 양쪽 키 구독자 set 에 dispatch.
- `lastSnapshotByCanonical` / `lastSnapshotByPlace` 두 Map 으로 키 종류별 replay 캐시.

**잡 단위 SSE 훅** (매니저 미사용)
- `useGroupingJob(jobId)` — snapshot/item/done, 백오프 1s→30s, done 시 `restaurants-status` + `ranking` invalidate.
- `useGlobalMergeJob(jobId)` — snapshot/chunk(`doneChunks += 1`, `totalChunks = max(prev, doneChunks)`)/done, done 시 `analytics.overview` + `global-menus` invalidate.
- **`useDiningcodeBulkSaveJob(jobId)` (신규)** — snapshot(전체 교체) / item(vRid 매칭 + 카운트 재계산) / done(state·finishedAt + 세 캐시 invalidate). 백오프 동일 (`1s → 2s → 4s → 8s → 16s → 30s cap`). GET snapshot 404 → `ApiError.statusCode === 404` → `activeStore.clear()` 호출 후 `null` 반환.
- 세 훅 모두 `closedRef`/`retryRef`/cleanup 패턴 동일. `jobId` null 이면 effect 비활성.

**Zustand 스토어 (`stores/`)**
- `useAuthStore`: `user`, `token`, `isGuest` + `setSession`, `setUser`, `enterGuest`, `clearSession`
- `useActiveCrawlJobStore`: `jobs: Record<jobId, ActiveCrawlJob>` (멀티 슬롯, persist 없음)
- `useActiveGroupingJobStore`: `jobId | null` + `setJobId`, `clear` — `lp:activeGroupingJob` 로 localStorage persist
- `useActiveGlobalMergeJobStore`: `jobId | null` + `setJobId`, `clear` — `lp:activeGlobalMergeJob` localStorage persist
- **`useActiveDiningcodeBulkSaveJobStore` (신규)**: `jobId | null` + `setJobId`, `clear` — `lp:activeDiningcodeBulkSaveJob` localStorage persist

**UI / 디자인 / 상수** — 변경 없음 (기존 8 컴포넌트, `palette/lightColors/darkColors/space/radius/typography/duration`, `APP_NAME` / `QUERY_STALE_TIME` / `QUERY_GC_TIME`).

## 5. Data [coverage: high — 11 sources]

**Auth 상태 모양** (`stores/authStore.ts`)
```ts
interface AuthState {
  user: User | null;
  token: string | null;
  isGuest: boolean;
}
```

**Active crawl job 상태** — 기존 동일. 멀티 슬롯 `jobs: Record<jobId, ActiveCrawlJob>`.

**Active DC bulk-save job 상태 (신규)** (`stores/activeDiningcodeBulkSaveJobStore.ts`)
```ts
interface ActiveDiningcodeBulkSaveJobState {
  jobId: string | null;
  setJobId: (jobId: string | null) => void;
  clear: () => void;
}
```
- zustand `persist` middleware + `createJSONStorage` 로 `lp:activeDiningcodeBulkSaveJob` 키에
  localStorage 직렬화. SSR / RN 환경 안전 — `typeof window === 'undefined'` 면 noop 어댑터 주입.
- `activeGroupingJobStore` / `activeGlobalMergeJobStore` 와 동일 패턴 (단일 슬롯). 어드민이
  다른 페이지로 이동했다가 돌아와도 진행 카드가 살아 있도록.
- 자동 정리는 훅 책임 — `useDiningcodeBulkSaveJob` 의 GET snapshot 404 → `clear()`.

**토큰 저장**은 `@repo/shared` 책임 아님. 각 앱이 `configureApi({ baseUrl, getToken, onUnauthorized })`로 게터/콜백 주입.

**클라이언트 캐시** — TanStack Query 가 전적으로 관리.
- 픽: `['picks', 'list']` / `['picks', 'detail', id]`
- 크롤 네이버: `useCrawlJobs` → `['crawl', 'jobs']`. `useNaverSearch(q, bbox)` → `['crawl', 'search', q, bbox]` (staleTime 30s).
- **크롤 캐치테이블**:
  - `useCatchtableSearch` → `['crawl', 'catchtable-search', q, offset, limit, contractedOnly]` (60s)
  - `useCatchtableShop` → `['crawl', 'catchtable-shop', shopRef]` (5분)
  - `useCatchtableShopMenus` → `['crawl', 'catchtable-shop-menus', shopRef]` (10분)
  - `useCatchtableShopReviewOverview` → `['crawl', 'catchtable-shop-review-overview', shopRef]` (10분)
- **크롤 다이닝코드**:
  - `useDiningcodeSearch` → `['crawl', 'diningcode-search', q, from, size, order, lat, lng, distance]` (60s)
  - `useDiningcodeShop` → `['crawl', 'diningcode-shop', vRid]` (5분)
  - `useDiningcodeShopReviews` → `['crawl', 'diningcode-shop-reviews', vRid, page]` (5분)
  - `useDiningcodeRegistered` → `['crawl', 'diningcode-registered', vRids.join(',')]` (30s)
- **DC 일괄 저장 잡** (신규): `['crawl', 'diningcode-bulk-save', jobId]`. `useStartDiningcodeBulkSave` 의 onSuccess 가 응답 snapshot 을 같은 키에 `setQueryData` + store.setJobId 동시. `useDiningcodeBulkSaveJob` 은 GET 으로 한 번 더 채우고 이후 SSE 가 라이브로 머지. done 시 세 캐시 (`['crawl', 'diningcode-registered']`, `['restaurant', 'list']`, `['canonical', 'proposals']`) prefix 무효화.
- 어드민 맛집: `['restaurant', 'list']`, `['restaurant', placeId]`. **공개 맛집** 키 모양 변경 없음 (`['restaurant', 'public', 'list', q, category, bbox, sort, limit, offset]` / `['restaurant', 'public', 'detail', placeId]` / `['restaurant', 'public', 'insights', placeId]`).
- **공개 list summary 패치 추가** — `useRestaurantListSummaryEvents` 가 어드민 list 행에 `restaurantApi`의 `recomputeCanonicalAggregates(sources)` 로 canonical 집계까지 재계산해서 행 교체. 공개 list 캐시는 placeId 가 있을 때만 (=Naver source) `setQueriesData` prefix 매치로 동시 패치.
- **캐노니컬 (신규)**:
  - `useCanonicalCandidates(canonicalId)` → `['canonical', 'candidates', canonicalId]` (30s, null 이면 disabled).
  - `useCanonicalProposals` → `['canonical', 'proposals']` (staleTime 15s + `refetchInterval: 30_000` 자동 폴링).
  - mutation 들의 onSuccess invalidate 정책:
    - merge / accept / delete / split → `['restaurant', 'list']` + `['canonical', 'candidates']` (+ accept/delete 는 `['canonical', 'proposals']` 도)
    - dismissSuggestion → `['restaurant', 'list']`
    - runProposals / rejectProposal → `['canonical', 'proposals']`
- 메뉴 그룹핑 / 분석 / 지도 / AI 캐시 키 — 기존과 동일 (변경 없음).

**ReviewSummary 분석 필드 머지** — 기존과 동일. `useRestaurantSummaryEvents` 의 `onReview` 가
`summary` 객체를 통째로 교체(`startedAt` 만 보존). 단 **placeId 가 자기 것이 아닌 review 는
무시** (`if (ev.placeId !== placeId) return`) — 같은 canonical 의 DC review 도 stream 으로 들어
오지만 디테일 캐시는 Naver 단일이라 본인 placeId 만 머지.

**SSE last-snapshot 캐시** — 매니저가 `lastSnapshotByCanonical` + `lastSnapshotByPlace` 두 Map
유지. 새 구독자가 붙으면 키 종류에 맞는 쪽에서 동기적으로 replay.

**SSE 스트림 상태** (`useCrawlJobStream`) — 기존 동일 (reducer + seq dedup + done/error 시 직접
close).

## 6. Key Decisions [coverage: high — 18 sources]

- **상태관리는 Zustand**, **서버 상태는 TanStack Query**.
- **공개 훅 placeholderData / staleTime 30s / queryKey 좁히기** — 기존 결정 유지.
- **`useNaverSearch` 디바운스는 호출자 책임**.
- **`useMapPublicConfig` staleTime/gcTime Infinity + retry false**.
- **`settings-map` Routes 단일 소스 / AI 만 모듈 상수 PREFIX**.
- **`apiFetch` 토큰 자동 첨부는 공개 라우트에 무해**.
- **Summary SSE 는 싱글톤 매니저로 멀티플렉싱** — HTTP/1.1 6 connection cap 회피.
- **Summary 매니저 키 union — place + canonical 두 종류 한 connection** — 리스트는 canonical 키로
  구독해서 DC source 까지 라이브 진행 배지 갱신, 디테일은 place 키로 구독해 Naver 단일 행 분석.
  서버는 한 SSE 안에 두 키 종류 모두 받아 풀고, 매니저는 들어온 이벤트의 canonicalId + placeId
  양쪽 태그로 구독자 set 양쪽에 dispatch — 결과적으로 같은 canonical 의 DC review 가 도착해도
  리스트 행은 갱신되지만 Naver 디테일 캐시는 placeId 비교로 안전하게 스킵한다.
- **잡 단위 SSE 는 매니저를 쓰지 않는다** — `useGroupingJob` / `useGlobalMergeJob` /
  **`useDiningcodeBulkSaveJob` (신규)**. 잡 하나당 한 페이지에서 하나만 띄우는 일회성 흐름이라
  멀티플렉싱 불필요. 모두 같은 패턴(`closedRef`/`retryRef` + cleanup) 으로 정렬 — 한 훅을 읽으면
  나머지 두 훅의 동작도 즉시 이해 가능.
- **`useDiningcodeBulkSaveJob` 은 useGroupingJob 패턴을 그대로 답습** — query(snapshot) +
  EventSource(`'snapshot'` / `'item'` / `'done'` addEventListener) + 1s→30s 백오프 재연결.
  코드를 통째로 닮게 둔 이유는 (a) 백오프/cleanup 같은 미묘한 곳을 한 곳에서만 검증해도
  되도록, (b) 새로운 잡 타입이 생길 때 carbon-copy 로 시작할 수 있도록.
- **잡 GET snapshot 404 → activeStore.clear** — `useDiningcodeBulkSaveJob` / `useGroupingJob` 둘
  다 GET 실패가 `ApiError.statusCode === 404` 면 `clearActive()` 호출. 서버가 잡 레지스트리에서
  만료시킨 stale jobId 가 store 에 남아 무한 SSE 재연결 loop 도는 걸 차단. 다른 에러는 그대로
  throw — 일시적 네트워크 에러를 잡 만료로 오인하지 않게 statusCode 명시 비교.
- **잡 done 후 cleanup 책임 분할** — hook 은 캐시 invalidate 만 책임지고 (`['crawl',
  'diningcode-registered']` / `['restaurant', 'list']` / `['canonical', 'proposals']` 무효화),
  store.clear (진행 카드 닫기) 는 **페이지 컴포넌트가 결정**. 잡이 끝나도 어드민이 결과를
  확인할 때까지 진행 카드를 띄워둘 수 있고, 60초 자동 닫힘 같은 UX 정책은 페이지 레이어가
  타이머로 처리. (hook 이 자동 clear 하면 done 직후 카드가 사라져서 결과를 못 봄.)
- **잡 SSE 백오프** — `1s → 2s → 4s → 8s → 16s → 30s cap` 세 훅 공통. snapshot 도착 시 retry 0
  리셋, done 또는 unmount 시 `closedRef = true` 로 모든 reconnect 차단.
- **잡 mutation onSuccess 가 snapshot 을 미리 박는다** — `useStartDiningcodeBulkSave` /
  `useCreateGroupingJob` / `useStartGlobalMerge` 모두 응답 snapshot 을 `setQueryData(['...',
  'job', jobId], snap)` 로 즉시 캐시 반영. 진행 카드 mount 즉시 첫 화면이 채워져 있다.
- **`useCanonicalProposals` 는 30s 폴링 자동 trigger** — `refetchInterval: 30_000` + `staleTime:
  15_000`. 다른 어드민이 새 가게를 등록해 큐가 채워지는 경우를 페이지를 켜둔 채 인지할 수
  있게. SSE 로 빼지 않은 이유 — 큐 변경 빈도가 낮고(분 단위), 폴링 한 줄로 충분.
- **`useCanonicalCandidates` 는 모달 open 시만 fetch** — `enabled: !!canonicalId`. 행마다 자동
  prefetch 하지 않음 — 모달 열기 전엔 후보 비싸게 안 구함. staleTime 30s 로 같은 canonical 모
  달 빠르게 껐다 켜도 캐시 hit.
- **DC bulk-save persist 패턴** — `activeGroupingJobStore` 와 동일하게 zustand `persist` +
  `createJSONStorage` 로 `lp:*` 네임스페이스 localStorage 키. 새로고침/탭 전환 후에도 진행 카드
  복귀. SSR/RN noop 어댑터로 안전.
- **list 캐시 패치 — canonical 집계 재계산** — `useRestaurantListSummaryEvents` 의 snapshot
  핸들러가 행의 sources[].summary* 필드를 갈아끼운 뒤 `recomputeCanonicalAggregates(sources)`
  를 호출해 행 레벨 합계(`totalReviews`, `summaryDone` 등)를 다시 계산. 서버가 매번 집계를
  push 하지 않아도 클라이언트에서 일관 유지. 공개 list 는 source 단일이라 그냥 row 자체 필드만
  갈아끼움.
- **`buildSummaryEventsUrl` 시그니처 변경 — 객체 인자** — 이전엔 `string[]` (placeIds 전용) 이었
  는데 이번에 `{ placeIds?, canonicalIds? }` 객체로 변경. 한 connection 에서 두 종류 키를 모두
  서버에 전달하기 위함. 호출자(매니저)는 키 종류별로 직접 분류해서 넘긴다.
- **Multi-slot crawl store, Passive list-summary subscription, zod 기반 fetch, body 없을 때
  Content-Type 안 붙임, AI path 하드코드, 로직/UI 플랫폼 분리, 빌드 없는 소스 노출, 유연한
  React peer, SSE 토큰은 쿼리스트링, 중복 이벤트 방어** — 모두 기존 결정 유지.

## 7. Gotchas [coverage: high — 16 sources]

- **EventSource 헤더 못 보냄 → token query 필수** — `buildJobEventsUrl`, `buildSummaryEventsUrl`,
  `buildGroupingJobEventsUrl`, `buildGlobalMergeJobEventsUrl`, **`buildDiningcodeBulkSaveEventsUrl`
  (신규)** 모두 `?token=<jwt>` 우회. URL/access log/Referer 노출 위험은 동일.
- **DC bulk-save 잡 GET 404 → activeStore.clear** — `useDiningcodeBulkSaveJob` 내부 GET 이
  `ApiError.statusCode === 404` 일 때만 `clearActive()` 호출하고 `null` 반환. 만약 다른 statusCode
  를 함부로 404 와 같은 처리로 합치면 일시적 5xx 에 stale jobId 가 store 에서 날아가 잡 진행을
  잃어버린다. statusCode 비교를 엄격히.
- **잡 done 후 store.clear 는 hook 이 안 한다** — `useDiningcodeBulkSaveJob` 의 done 핸들러는
  캐시 invalidate 만 호출하고 `activeDiningcodeBulkSaveJobStore.clear()` 는 부르지 않는다. 호출자
  (페이지 컴포넌트) 가 done 감지하여 60초 후 clear 같은 UX 결정. hook 이 자동 clear 해버리면
  done 직후 카드가 사라져 어드민이 결과를 못 본다.
- **`useDiningcodeBulkSaveJob` cleanup 순서** — `cancelled = true; closedRef = true; clearTimeout;
  es.close()` 순. 코드 수정 시 순서를 깨면 백오프 타이머가 stale connect 를 새 jobId 위로
  떨어뜨릴 수 있음.
- **`buildSummaryEventsUrl` 시그니처 변경** — 이전 `string[]` → 현재 `{ placeIds?, canonicalIds? }`.
  외부 호출자가 있다면 마이그레이션 필요. (매니저가 유일한 호출자라 영향 범위는 closed.)
- **summary 매니저 키 종류 — DC source 는 canonical 키로만** — DC 가게는 Naver 의 placeId 가
  없으므로 `place` 키로 구독해도 이벤트가 안 온다. 리스트 화면은 canonical 키로 구독해야 DC
  진행 배지가 갱신됨. `useRestaurantListSummaryEvents(canonicalIds)` 가 그렇게 동작.
  `useRestaurantListSummaryEventsByPlaceIds(placeIds)` 는 공개 발견 페이지(Naver-only 공개 list)
  전용으로 별도 분리.
- **summary `review` 이벤트 placeId 가드** — `useRestaurantSummaryEvents` 의 `onReview` 는
  `ev.placeId !== placeId` 면 무시. 같은 canonical 의 DC review 가 stream 으로 들어와도 디테일
  캐시(Naver 단일) 는 안 갱신. 코드 수정 시 이 가드를 빼면 placeId 미스매치 행에 잘못된
  reviewId 가 머지될 위험.
- **`useCanonicalProposals` 자동 폴링** — `refetchInterval: 30_000` 라 페이지가 열려 있는 한 30초
  마다 GET 발생. 백그라운드 탭에서도 React Query 가 기본적으로 stop 하지 않으므로 어드민이
  여러 탭을 켜두면 부하 증가 가능. 필요 시 `refetchIntervalInBackground: false` 추가 검토.
- **canonical mutation invalidate 범위** — `useMergeCanonical` / `useAcceptCanonicalProposal` /
  `useDeleteCanonical` 가 `['restaurant', 'list']` 를 prefix 매치 무효화. 공개 list 키
  (`['restaurant', 'public', 'list', ...]`) 는 같은 prefix 라 함께 invalidate 되지만, 의도된
  동작인지(혹은 어드민 list 만 무효화하고 싶었던 건지) 호출 시 확인 필요. 현 코드는 prefix
  매치라 둘 다 invalidate.
- **DC bulk-save 잡은 직렬 실행** — 일괄 vRid 가 백엔드에서 한 건씩 순차 처리되므로 100개 잡이
  면 5~10분 단위로 걸린다. SSE 연결이 그 시간 내내 살아 있어야 함. 네트워크 끊김에 대해 1s →
  30s cap 백오프로 견디지만, 30초 cap 에 도달한 채 오래 끊겨 있으면 done 이벤트를 놓치는 갭이
  생길 수 있음 — done 이벤트는 catch-up 메커니즘이 없어서 클라가 영원히 진행 상태로 남는 케이스
  가 이론적으로 존재. 안전망으로 페이지 컴포넌트가 일정 시간(예: 잡 시작 후 10분 + α) 후 GET
  으로 한 번 더 폴링하는 게 권장.
- **공개 list 의 queryKey 에 모든 필드 깔지 말 것**, **`useRestaurantPublic` placeId null
  가드**, **`buildSummaryEventsUrl` 사용 시 키 객체 형태**, **`useNaverSearch` 빈 q 자동
  disabled**, **잡 SSE 훅 effect jobId 단일 dep**, **`useGlobalMergeJob` chunk payload.progress
  미사용**, **잡 done 이후 추가 이벤트는 무시**, **`useMenuRanking` / `useGroupingJob` /
  `useDiningcodeBulkSaveJob` 의 404 → null 패턴**, **`useGroupingRestaurantsStatus` 자동 refetch
  없음**, **8-튜플/9-튜플 기본값 변경 시 cold cache**, **재연결 짧은 갭 — summary 매니저
  한정**, **Detail 캐시 inline 패치 의존**, **Review 머지는 summary 통째 교체**, **List 캐시
  형태 변경 주의**, **`useRestaurantListSummaryEvents*` 부수효과 전용**, **활성 잡 스토어
  cleanup 호출부 책임**, **확장자 해석 의존**, **React 18 하한선**, **순환 의존 금지**, **토큰
  영속화는 앱 책임**, **`configureApi` 호출 누락**, **`Button.tsx` web 진입점**, **`applyCssVars`
  HTMLElement 필요**, **`invalidateQueries` prefix 매칭 주의**, **`testProvider`/`deleteProvider`
  빈 body** — 모두 기존 항목 유지.

## 8. Sources [coverage: high — 40 sources]

- [packages/shared/package.json](../../packages/shared/package.json)
- [packages/shared/tsconfig.json](../../packages/shared/tsconfig.json)
- [packages/shared/src/index.ts](../../packages/shared/src/index.ts)
- [packages/shared/src/api/client.ts](../../packages/shared/src/api/client.ts)
- [packages/shared/src/api/auth.api.ts](../../packages/shared/src/api/auth.api.ts)
- [packages/shared/src/api/picks.api.ts](../../packages/shared/src/api/picks.api.ts)
- [packages/shared/src/api/admin.api.ts](../../packages/shared/src/api/admin.api.ts)
- [packages/shared/src/api/crawl.api.ts](../../packages/shared/src/api/crawl.api.ts)
- [packages/shared/src/api/restaurant.api.ts](../../packages/shared/src/api/restaurant.api.ts)
- [packages/shared/src/api/canonical.api.ts](../../packages/shared/src/api/canonical.api.ts)
- [packages/shared/src/api/menu-grouping.api.ts](../../packages/shared/src/api/menu-grouping.api.ts)
- [packages/shared/src/api/analytics.api.ts](../../packages/shared/src/api/analytics.api.ts)
- [packages/shared/src/api/ai.api.ts](../../packages/shared/src/api/ai.api.ts)
- [packages/shared/src/api/settings-map.api.ts](../../packages/shared/src/api/settings-map.api.ts)
- [packages/shared/src/hooks/useAuth.ts](../../packages/shared/src/hooks/useAuth.ts)
- [packages/shared/src/hooks/usePicks.ts](../../packages/shared/src/hooks/usePicks.ts)
- [packages/shared/src/hooks/useAdmin.ts](../../packages/shared/src/hooks/useAdmin.ts)
- [packages/shared/src/hooks/useCrawl.ts](../../packages/shared/src/hooks/useCrawl.ts)
- [packages/shared/src/hooks/useRestaurant.ts](../../packages/shared/src/hooks/useRestaurant.ts)
- [packages/shared/src/hooks/useCanonical.ts](../../packages/shared/src/hooks/useCanonical.ts)
- [packages/shared/src/hooks/summarySseManager.ts](../../packages/shared/src/hooks/summarySseManager.ts)
- [packages/shared/src/hooks/useMenuGrouping.ts](../../packages/shared/src/hooks/useMenuGrouping.ts)
- [packages/shared/src/hooks/useAnalytics.ts](../../packages/shared/src/hooks/useAnalytics.ts)
- [packages/shared/src/hooks/useAi.ts](../../packages/shared/src/hooks/useAi.ts)
- [packages/shared/src/hooks/useSettingsMap.ts](../../packages/shared/src/hooks/useSettingsMap.ts)
- [packages/shared/src/stores/authStore.ts](../../packages/shared/src/stores/authStore.ts)
- [packages/shared/src/stores/activeCrawlJobStore.ts](../../packages/shared/src/stores/activeCrawlJobStore.ts)
- [packages/shared/src/stores/activeGroupingJobStore.ts](../../packages/shared/src/stores/activeGroupingJobStore.ts)
- [packages/shared/src/stores/activeGlobalMergeJobStore.ts](../../packages/shared/src/stores/activeGlobalMergeJobStore.ts)
- [packages/shared/src/stores/activeDiningcodeBulkSaveJobStore.ts](../../packages/shared/src/stores/activeDiningcodeBulkSaveJobStore.ts)
- [packages/shared/src/constants/index.ts](../../packages/shared/src/constants/index.ts)
- [packages/shared/src/design/index.ts](../../packages/shared/src/design/index.ts)
- [packages/shared/src/design/tokens.ts](../../packages/shared/src/design/tokens.ts)
- [packages/shared/src/design/theme.ts](../../packages/shared/src/design/theme.ts)
- [packages/shared/src/design/cssVars.ts](../../packages/shared/src/design/cssVars.ts)
- [packages/shared/src/design/ThemeProvider.tsx](../../packages/shared/src/design/ThemeProvider.tsx)
- [packages/shared/src/ui/index.ts](../../packages/shared/src/ui/index.ts)
- [packages/shared/src/ui/Button/Button.tsx](../../packages/shared/src/ui/Button/Button.tsx)
- [packages/shared/src/ui/Button/Button.types.ts](../../packages/shared/src/ui/Button/Button.types.ts)
- [packages/shared/src/ui/](../../packages/shared/src/ui/) (Divider, ErrorBanner, Input, Screen, SegmentedControl, Stack, Text)
- [CLAUDE.md](../../CLAUDE.md)
