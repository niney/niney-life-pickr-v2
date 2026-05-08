---
topic: shared
last_compiled: 2026-05-09
sources_count: 37
status: active
aliases: [react-query, zustand, design-tokens, ui-primitives, "@repo/shared"]
---

# shared — FE 공통 패키지

## 1. Purpose [coverage: high — 5 sources]

`@repo/shared`는 web과 mobile에서 동시에 사용되는 프론트엔드 공통 코드를 모아둔 워크스페이스
패키지다. 어드민(인증 필요)과 공개(비로그인 허용) 두 모드를 모두 한 패키지에서 다루며,
컨슈머는 `apps/web`(어드민 + 공개 + 로그인 페이지)과 `apps/mobile`(어드민 게이트)이다.
책임 영역은 다음과 같다.

- 타입 안전한 fetch 래퍼와 도메인별 API 함수 (auth, picks, admin, crawl, restaurant,
  menu-grouping, analytics, ai, settings-map). 어드민/공개 라우트가 같은 `apiFetch` 위에 얹힌다.
- TanStack Query 훅 (서버 상태) — 메뉴 그룹핑/전역 머지 잡 SSE 훅 + 공개 맛집 리스트/상세/
  인사이트/지도 설정 훅 포함
- Zustand 스토어 (인증, 활성 크롤 잡)
- 프로세스 전역 SSE 매니저 싱글톤 (요약 진행률 + review 분석 멀티플렉싱)
- 잡 단위 SSE 라이프사이클 훅 (그룹핑/전역 머지 — 매니저를 쓰지 않고 hook 자체가
  EventSource 를 직접 들고 백오프 재연결 관리)
- 디자인 토큰·테마·`ThemeProvider`·CSS 변수 변환
- 플랫폼 분기형 UI 프리미티브 (Button, Input, Stack, Text, Divider, ErrorBanner, Screen, SegmentedControl)
- 공용 상수 (`APP_NAME`, React Query staleTime/gcTime)

빌드 산출물 없이 `src/index.ts`를 그대로 노출(`"main": "./src/index.ts"`)하므로
Turborepo 컨슈머는 별도 빌드 단계 없이 TS 소스를 바로 import한다.

## 2. Architecture [coverage: high — 16 sources]

```
packages/shared/src/
├── index.ts                # barrel: 모든 하위 모듈 re-export
├── api/
│   ├── client.ts           # apiFetch + ApiError + configureApi (토큰 게터 주입)
│   ├── auth.api.ts
│   ├── picks.api.ts
│   ├── admin.api.ts
│   ├── crawl.api.ts        # SSE 엔드포인트 URL 빌더 포함
│   ├── restaurant.api.ts   # 어드민 list/getByPlaceId/delete + 공개 publicList/publicByPlaceId/publicInsights + buildSummaryEventsUrl
│   ├── menu-grouping.api.ts# 식당 단위 그룹핑 + 잡 시작/스냅샷 + buildGroupingJobEventsUrl
│   ├── analytics.api.ts    # overview / global-menus / category-tree + 전역 머지 잡 + buildGlobalMergeJobEventsUrl
│   ├── settings-map.api.ts # 어드민 list/update/remove/getSecret + 공개 publicConfig (Routes.SettingsMap 단일 소스)
│   └── ai.api.ts           # LLM provider 관리 + complete/completeBatch
├── hooks/
│   ├── useAuth.ts          # useCurrentUser, useLogin, useRegister, useLogout
│   ├── usePicks.ts         # 쿼리키 팩토리 + CRUD + useRandomPick
│   ├── useAdmin.ts
│   ├── useCrawl.ts         # useCrawlJobStream (EventSource reducer + persistedCount/lastBatch)
│   ├── useRestaurant.ts    # 어드민 list/byPlaceId/delete + summary SSE 구독 + 공개 useRestaurantsPublic / useRestaurantPublic / useRestaurantPublicInsights
│   ├── summarySseManager.ts# 프로세스 전역 SSE 싱글톤 (멀티플렉싱)
│   ├── useMenuGrouping.ts  # ranking/group/status/createJob + useGroupingJob (자체 EventSource + 백오프)
│   ├── useAnalytics.ts     # overview/globalMenus/categoryTree + useStartGlobalMerge + useGlobalMergeJob (chunk 진행)
│   ├── useSettingsMap.ts   # 어드민 providers/secret + 공개 useMapPublicConfig
│   └── useAi.ts            # provider CRUD + complete/test/models
├── stores/
│   ├── authStore.ts            # Zustand: user / token / isGuest
│   └── activeCrawlJobStore.ts  # Zustand: jobs by jobId (멀티 슬롯)
├── design/
│   ├── tokens.ts           # palette, light/darkColors, space, radius, typography, duration
│   ├── theme.ts            # Theme 인터페이스 + lightTheme/darkTheme/themes
│   ├── cssVars.ts          # themeToCssVars / applyCssVars (web 전용 헬퍼)
│   ├── ThemeProvider.tsx   # React Context + useTheme
│   └── index.ts
├── ui/
│   ├── index.ts            # 8개 컴포넌트 재노출
│   └── <Component>/
│       ├── <C>.types.ts    # Props 타입 (공유)
│       ├── <C>.tsx         # 공용 진입점 (현재 .web.tsx로 위임)
│       ├── <C>.web.tsx     # DOM 구현
│       ├── <C>.native.tsx  # React Native 구현
│       └── index.ts
└── constants/
    └── index.ts
```

API 함수 모듈과 React Query 훅 모듈은 1:1 페어로 분리된다. 함수 모듈(`*.api.ts`)은
querystring 빌더와 `apiFetch` 호출만 담당하고, 훅 모듈(`use*.ts`)은 캐시 키·`enabled`·
`placeholderData`·`staleTime`·invalidate 정책 등 React Query 레이어를 책임진다. 어드민과
공개 함수는 같은 모듈에 공존하지만(`restaurant.api.ts`의 `list`/`publicList` 등) 컨슈머는
훅 이름으로 모드를 식별한다 — `useRestaurantList`(어드민) vs `useRestaurantsPublic`(공개).

`apiFetch`의 자동 토큰 첨부는 모드를 구분하지 않는다 — 토큰이 있으면 모든 요청에
`Authorization: Bearer <token>`이 붙고, 없으면 헤더 없이 나간다. 공개 라우트는 토큰이
있어도 그대로 통과(서버가 무시), 없어도 그대로 통과. `onUnauthorized` 콜백은 401 응답
때만 발동되는데 공개 라우트는 401 을 보내지 않으므로 비로그인 상태에서 공개 페이지를
오가도 세션 정리/리다이렉트가 트리거되지 않는다.

훅 레이어는 `useQueryClient`로 TanStack Query 캐시를 직접 패치하는 패턴을 광범위하게 쓴다
(SSE 이벤트 → 리스트/상세 캐시 inline merge). `summarySseManager`는 React 바깥의 모듈
싱글톤이라 어떤 컴포넌트가 mount/unmount되든 동일한 단일 EventSource를 공유한다.

반면 **잡 단위 SSE 훅**(`useGroupingJob`, `useGlobalMergeJob`)은 매니저를 거치지 않고
훅 인스턴스 안에서 직접 `EventSource` 라이프사이클을 들고 있다. 잡 하나당 한 페이지에서
하나만 띄우는 일회성 흐름이라 멀티플렉싱이 필요 없고, `closedRef`/`retryRef`로 재연결과
종단 처리만 깔끔하게 다루면 충분하기 때문.

각 UI 컴포넌트는 `*.types.ts`로 props 계약을 단일 소스로 두고, 플랫폼 번들러가
파일 확장자 해석으로 구현체를 골라간다 (Vite/Webpack은 `.web.tsx`, Metro는
`.native.tsx`). `tsconfig.json`은 `@repo/config/tsconfig/react.json`을 상속한다.

## 3. Talks To [coverage: high — 6 sources]

- 의존성: `@repo/api-contract` (zod 스키마/타입/`Routes` 상수), `@repo/utils`,
  `@tanstack/react-query`, `zustand`.
- peerDependencies: `react >=18.0.0`, `react-native >=0.76.0` (옵셔널).
  → web은 React 19, mobile은 React 18 + RN 0.76 양쪽을 만족한다.
- 컨슈머:
  - `apps/web` — 어드민 콘솔(맛집/메뉴/분석/AI/지도 설정), 공개 맛집 페이지(랭킹/지도/식당
    상세 — 비로그인 허용), 로그인/회원가입 페이지. 동일한 `@repo/shared` 인스턴스 위에서
    `useRestaurantList`(어드민)와 `useRestaurantsPublic`(공개)이 한 SPA 안에 공존.
  - `apps/mobile` — 어드민 게이트. 로그인 후 ADMIN 역할 통과해야 식당/메뉴 탭이 열림.
    공개 훅도 export 는 되지만 현재 모바일 UI 는 어드민 흐름만 사용.
- 외부:
  - `apiFetch`로 [friendly](friendly.md) API에 HTTP. 어드민/공개 라우트 모두 같은 클라이언트.
  - `useCrawlJobStream`은 friendly의 SSE 엔드포인트(`Routes.Crawl.jobEvents`)에 EventSource로 접속.
  - `summarySseManager`는 friendly의 `/admin/restaurants/summary-events`(=`Routes.Restaurant.summaryEvents`)에 단일 EventSource로 멀티플렉싱 접속. 브라우저 탭당 최대 한 개의 연결만 유지.
  - `useGroupingJob`은 `Routes.Analytics.groupingJobEvents(jobId)`에, `useGlobalMergeJob`은 `Routes.Analytics.globalMergeJobEvents(jobId)`에 각각 잡 하나당 EventSource 하나로 접속. 자세한 잡 라이프사이클은 [menu-grouping](menu-grouping.md), [analytics](analytics.md) 참고.
  - `aiApi`는 friendly의 `/api/v1/admin/ai/*` 라우트.
  - `settingsMapApi`는 friendly의 `Routes.SettingsMap.list/provider/secret`(어드민) 과
    `Routes.SettingsMap.publicConfig`(공개) 라우트.
- UI 측 사용처는 [web](web.md) 참조 — 본 문서는 로직 계약까지만 다룬다.

## 4. API Surface [coverage: high — 22 sources]

**API 클라이언트 (`api/`)**
- `configureApi(cfg)`, `getApiConfig()`, `apiFetch<T>(path, init)`, `ApiError`
- `authApi`: `register`, `login`, `me`, `logout`
- `picksApi`: `list`, `getById`, `create`, `update`, `remove`, `random`
- `adminApi`: `listUsers`, `setRole`
- `crawlApi`: `start`, `list`, `cancel` + `buildJobEventsUrl(jobId)` (SSE URL — `?token=` 인증)
- `restaurantApi`:
  - 어드민: `list`, `ranking(query?)`, `getByPlaceId(placeId)`, `getSummaryStatus(placeId)`, `delete(placeId)` + `buildSummaryEventsUrl(placeIds: string[])` (string 배열 → `?placeId=A&placeId=B&...&token=<jwt>`)
  - **공개 (신규)**: `publicList(query?)` (q/category/bbox/sort/limit/offset → `URLSearchParams`로 쿼리스트링), `publicByPlaceId(placeId)` (`Routes.Restaurant.publicByPlaceId`), `publicInsights(placeId)` (`Routes.Restaurant.publicInsights`)
- `menuGroupingApi`: `groupForRestaurant(placeId)`, `getRanking(placeId, query?)` (sort/minMentions 옵션 → 쿼리스트링), `getRestaurantsStatus()`, `createGroupingJob({ placeIds })`, `getGroupingJob(jobId)` + `buildGroupingJobEventsUrl(jobId)` (SSE — `?token=`)
- `analyticsApi`: `overview()`, `globalMenus(query?)` (q/category/sort/minMentions/limit/includeUnlinked → 쿼리스트링), `categoryTree()`, `startGlobalMerge({ full })`, `getGlobalMergeJob(jobId)` + `buildGlobalMergeJobEventsUrl(jobId)`
- `settingsMapApi`:
  - 어드민: `list`, `update(id, input)`, `remove(id)`, `getSecret(id)`
  - **공개 (신규)**: `publicConfig()` — 키 미등록 시 404. 호출자가 `ApiError.statusCode` 로 분기해 placeholder 표출.
  - 모든 path 는 `Routes.SettingsMap.list/provider/secret/publicConfig` 사용. (이전의 모듈
    상단 `PREFIX` 상수는 제거됐음 — 라우트 상수 단일 소스로 일원화.)
- `aiApi`: `complete`, `completeBatch`, `listProviders`, `updateProvider(id, input)`, `deleteProvider(id)` (→ 204 void), `testProvider(id, model?)`, `listModels(id)`. 모든 path는 모듈 상단 상수 `AI_PREFIX = '/api/v1/admin/ai'`로 하드코드.

**React Query 훅 (`hooks/`)**
- 인증: `useCurrentUser`, `useLogin`, `useRegister`, `useLogout`
- 픽: `usePicks`, `usePick`, `useCreatePick`, `useUpdatePick`, `useDeletePick`, `useRandomPick`
- 어드민: `useAdminUsers`, `useSetUserRole`
- 크롤: `useStartCrawl`, `useCrawlJobs`, `useCancelCrawl`, `useCrawlJobStream`
- 맛집 어드민: `useRestaurantList`, `useRestaurantRanking(query?)`, `useRestaurantByPlaceId(placeId)`, `useDeleteRestaurant`, `useRestaurantSummaryEvents(placeId)`, `useRestaurantListSummaryEvents(placeIds[])`
- **맛집 공개 (신규)**:
  - `useRestaurantsPublic(query)` — 공개 맛집 리스트. queryKey 는 의미 있는 6 필드만
    (`['restaurant', 'public', 'list', q ?? '', category ?? '', bbox ?? '', sort ?? 'recent', limit ?? 60, offset ?? 0]`).
    `placeholderData: (prev) => prev` 로 깜빡임 방지, `staleTime: 30_000`. URL 동기화로
    바뀐 query 가 자주 갱신되어도 디바운스/탭 전환에 견딜 수 있게 설계.
  - `useRestaurantPublic(placeId: string | null)` — 공개 식당 상세. `enabled: !!placeId`,
    `staleTime: 60_000`. placeId 가 null/빈 문자열이면 비활성(패널 닫힘).
  - `useRestaurantPublicInsights(placeId: string | null)` — 인사이트(메뉴/감정/긍부 통계).
    `enabled: !!placeId`, `staleTime: 60_000`. 키 모양은 `['restaurant', 'public', 'insights', placeId]`.
- 메뉴 그룹핑: `useMenuRanking(placeId, query?)`, `useGroupForRestaurant`, `useGroupingRestaurantsStatus`, `useCreateGroupingJob`, `useGroupingJob(jobId)`
- 분석: `useAnalyticsOverview`, `useGlobalMenus(query?)`, `useCategoryTree`, `useStartGlobalMerge`, `useGlobalMergeJob(jobId)`
- 지도 설정 어드민: `useMapProviders`, `useUpdateMapProvider`, `useDeleteMapProvider`, `useMapProviderSecret(id, enabled?)`
- **지도 설정 공개 (신규)**: `useMapPublicConfig(enabled = true)` — `['settings', 'map', 'public']`,
  `staleTime: Infinity`, `gcTime: Infinity`(키는 자주 안 바뀜), `retry: false`(404 = 키 미등록은 정상 상태이므로 자동 재시도 없음).
- AI: `useCompleteAi`, `useCompleteBatchAi`, `useProviders`, `useUpdateProvider`, `useDeleteProvider`, `useTestProvider`, `useProviderModels(id, enabled?)`

**SSE 매니저 (`hooks/summarySseManager.ts`)**
- `summarySseManager.subscribe(placeId, { onSnapshot, onReview })` → `unsubscribe()` 함수 반환. 컴포넌트가 직접 부르기보다 위 두 훅을 통해 사용한다.
- 이벤트 타입: `snapshot` (placeId 단위 카운트 갱신) + `review` (개별 리뷰 분석 결과 — text/model + sentiment/sentimentScore/satisfactionScore/menus/tips/keywords).

**잡 단위 SSE 훅** (매니저 미사용 — 각 훅이 EventSource 를 직접 관리)
- `useGroupingJob(jobId)` — 이벤트: `snapshot`(전체 교체) / `item`(placeId 매칭 row 머지 + done/failed/skipped 카운트 재계산) / `done`(state·finishedAt 갱신 후 `es.close()` + `restaurants-status` & `ranking` 캐시 invalidate).
- `useGlobalMergeJob(jobId)` — 이벤트: `snapshot` / `chunk`(`doneChunks +1`, `totalChunks = max(prev, doneChunks)` 동적 max — payload 의 progress 자체는 사용하지 않고 카운트만 증가) / `done`(state·finalGroupCount·finishedAt 갱신 후 `analytics.overview` & `global-menus` invalidate).
- 두 훅 모두 동일한 백오프: `Math.min(30_000, 1000 * 2 ** retry)` → 1s → 2s → 4s → 8s → 16s → 30s cap. `retryRef` 는 `snapshot` 도착 시 0으로 리셋. `closedRef = true` 가 되면(`done` 이벤트 또는 unmount) 모든 재연결을 차단.
- 둘 다 `jobId` 가 null 이면 effect 자체가 비활성. cleanup 에서 `cancelled = true` + `closedRef = true` + 타이머 clear + `EventSource.close()` 일괄 처리.

**Zustand 스토어 (`stores/`)**
- `useAuthStore`: `user`, `token`, `isGuest` + `setSession`, `setUser`, `enterGuest`, `clearSession`
- `useActiveCrawlJobStore`: `jobs: Record<jobId, ActiveCrawlJob>` + `add(job)`, `remove(jobId)`, `resolvePlaceId(jobId, placeId)`. `ActiveCrawlJob = { jobId, placeId | null, mode, source: 'list-row' | 'new' }`.

**UI 컴포넌트 (`ui/`)**
- `Button`, `Input`, `Stack`, `Text`, `SegmentedControl`, `Divider`, `ErrorBanner`, `Screen`
- 각 컴포넌트는 `<Name>Props`/variant 타입도 함께 export (예: `ButtonProps`, `ButtonVariant`, `ButtonSize`)

**디자인 (`design/`)**
- 토큰: `palette`, `lightColors`, `darkColors`, `space`, `radius`, `typography`, `duration`
- 타입: `ColorTokens`, `SpaceTokens`, `RadiusTokens`, `TypographyTokens`
- 테마: `Theme`, `lightTheme`, `darkTheme`, `themes`
- React: `ThemeProvider`, `useTheme`
- web 헬퍼: `themeToCssVars(theme)`, `applyCssVars(theme, target)`

**상수 (`constants/`)**
- `APP_NAME = 'Life Pickr'`, `QUERY_STALE_TIME = 60_000`, `QUERY_GC_TIME = 300_000`

## 5. Data [coverage: high — 9 sources]

**Auth 상태 모양** (`stores/authStore.ts`)
```ts
interface AuthState {
  user: User | null;        // @repo/api-contract User
  token: string | null;     // JWT bearer
  isGuest: boolean;         // 게스트 모드 진입 여부
}
```
역할(role)은 `User` 타입 안에 포함된다 (`@repo/api-contract`).

**Active crawl job 상태 모양** (`stores/activeCrawlJobStore.ts`)
```ts
interface ActiveCrawlJobState {
  jobs: Record<string /* jobId */, ActiveCrawlJob>;
}
```
멀티 슬롯이라 list 페이지와 detail 페이지가 동일한 jobs 맵을 공유한다 — 어느 쪽에서 잡을
띄우든 다른 쪽에서도 즉시 인라인 패널이 보인다. New-URL 잡은 `placeId: null`로 시작했다가
SSE `partial` 이벤트로 placeId가 떨어지면 `resolvePlaceId(jobId, placeId)`가 호출돼
`source`가 `'new' → 'list-row'`로 플립된다.

**토큰 저장**은 `@repo/shared` 책임이 아니다. 각 앱이 부팅 시 `configureApi({
baseUrl, getToken, onUnauthorized })`로 게터/콜백을 주입한다.
- web: `localStorage` 기반
- mobile: `AsyncStorage` 기반

`apiFetch`는 매 요청마다 `await config.getToken?.()`을 호출해 토큰이 있으면
`Authorization: Bearer <token>` 헤더를 합성하고, 없으면 헤더 자체를 안 붙인다. 공개
라우트는 어느 쪽이든 통과(서버가 토큰을 무시). 401 응답이면 `onUnauthorized` 콜백을
발동시켜 앱이 세션 정리/리다이렉트를 수행하도록 한다 — 공개 라우트는 401 을 보내지 않으므로
비로그인 상태에서 공개 페이지를 돌아다녀도 세션이 흔들리지 않는다.

**클라이언트 캐시**는 TanStack Query가 전적으로 관리한다.
- `usePicks`는 `['picks', 'list']` / `['picks', 'detail', id]` 쿼리키 팩토리.
- 어드민 맛집: `useRestaurantList` → `['restaurant', 'list']`, `useRestaurantByPlaceId(placeId)` → `['restaurant', placeId]`. summary SSE 훅이 두 키를 모두 직접 `setQueryData`로 패치한다 (snapshot은 list 캐시, review는 detail 캐시).
- **공개 맛집** (since 2026-05-09):
  - `useRestaurantsPublic(query)` → `['restaurant', 'public', 'list', q ?? '', category ?? '', bbox ?? '', sort ?? 'recent', limit ?? 60, offset ?? 0]` — 6-튜플(고정 prefix 3개 포함 9요소). 기본값을 키 안에서 직접 채우므로 query 객체 identity 가 매번 새로 만들어져도 동일한 캐시키로 매핑.
  - `useRestaurantPublic(placeId)` → `['restaurant', 'public', 'detail', placeId]`. `staleTime: 60_000`.
  - `useRestaurantPublicInsights(placeId)` → `['restaurant', 'public', 'insights', placeId]`. `staleTime: 60_000`.
- `useDeleteRestaurant`는 onSuccess에서 `['restaurant', 'list']`를 invalidate하고 `['restaurant', placeId]`를 removeQueries로 비운다. (공개 캐시는 영향 없음 — 어드민 흐름 한정.)
- `useProviders`는 `['ai', 'providers']`. `useUpdateProvider` / `useDeleteProvider`가 onSuccess에서 `qc.invalidateQueries({ queryKey: ['ai', 'providers'] })` 호출.
- `useProviderModels(id, enabled)`는 `['ai', 'providers', id, 'models']` — `staleTime: 60_000`, `retry: false`로 베스트-에포트 fetch (실패해도 에러 토스트 없이 빈 결과). UI 자동완성용 datalist에만 쓰이고 사용자가 직접 모델 id 입력 가능.

**메뉴 그룹핑 캐시 키** (since 2026-05-09, [useMenuGrouping.ts](../../packages/shared/src/hooks/useMenuGrouping.ts))
- `useMenuRanking` → `['menu-grouping', 'ranking', placeId, sort ?? 'mentions', minMentions ?? 1]`
  · placeId 가 null 이면 enabled=false. 404 응답은 `ApiError` 로 잡아 `null` 데이터로 환산(아직 그룹핑 안 된 식당).
- `useGroupingRestaurantsStatus` → `['menu-grouping', 'restaurants-status']`
- `useGroupingJob(jobId)` → `['menu-grouping', 'job', jobId]`
  · `useCreateGroupingJob` 의 onSuccess 가 잡 시작 직후 같은 키에 snapshot 을 미리 `setQueryData` 로 박아 둔다. 이어서 `useGroupingJob` 이 mount 되면 GET 으로 한 번 더 채운 뒤 SSE 가 라이브로 머지.
- `useGroupForRestaurant` (단일 식당 분류 mutation) onSuccess: `['menu-grouping', 'ranking', placeId]` 와 `['menu-grouping', 'restaurants-status']` 둘 다 invalidate.
- `useGroupingJob` 의 `done` 이벤트 도착 시: `['menu-grouping', 'restaurants-status']` 와 `['menu-grouping', 'ranking']` (prefix 매치 — 어떤 placeId 들이 영향받았는지 정확히 모르므로) 둘 다 invalidate. 결과적으로 잡이 끝나는 순간 관리자 테이블과 모든 식당 차트가 재조회된다.

**분석 캐시 키** (since 2026-05-09, [useAnalytics.ts](../../packages/shared/src/hooks/useAnalytics.ts))
- `useAnalyticsOverview` → `['analytics', 'overview']`
- `useGlobalMenus(query?)` → `['analytics', 'global-menus', q ?? '', category ?? '', sort ?? 'mentions', minMentions ?? 5, limit ?? 50, !!includeUnlinked]` — 8-튜플. 카테고리 트리에서 노드를 클릭해 `category` 만 갈아끼우면 자동 refetch.
- `useCategoryTree` → `['analytics', 'category-tree']`
- `useGlobalMergeJob(jobId)` → `['analytics', 'global-merge-job', jobId]`. `useStartGlobalMerge` 가 onSuccess 에서 같은 키에 snapshot 을 선반영. 409(이미 진행 중) 등 에러는 `onError` 가 그냥 throw 하므로 caller 가 처리.
- `useGlobalMergeJob` 의 `done` 이벤트 도착 시 `['analytics', 'overview']` 와 `['analytics', 'global-menus']` invalidate (둘 다 prefix). UI 가 잡 끝난 직후 새 통계로 자동 전환.

**지도 설정 캐시 키** ([useSettingsMap.ts](../../packages/shared/src/hooks/useSettingsMap.ts))
- 어드민: `useMapProviders` → `['settings', 'map', 'providers']`. `useMapProviderSecret(id, enabled)` → `['settings', 'map', 'secret', id]`(`staleTime: Infinity`, `gcTime: Infinity`).
- **공개**: `useMapPublicConfig(enabled = true)` → `['settings', 'map', 'public']`. `staleTime: Infinity`, `gcTime: Infinity`(키는 자주 안 바뀜), `retry: false`(404 = 키 미등록은 정상 상태이므로 자동 재시도 없음). 어드민 쪽 mutation(`useUpdateMapProvider`/`useDeleteMapProvider`)은 어드민 키만 invalidate 하고 `['settings', 'map', 'public']` 은 건드리지 않으므로, 어드민 페이지에서 키를 갱신한 뒤 공개 페이지가 새 키를 보려면 호출자가 명시적으로 invalidate 필요.

**ReviewSummary 분석 필드 머지** ([useRestaurant.ts](../../packages/shared/src/hooks/useRestaurant.ts))
- `useRestaurantSummaryEvents`의 `onReview` 콜백이 detail 캐시(`['restaurant', placeId]`)에 inline 머지하는 review 객체에는 텍스트/모델 외 분석 필드가 포함된다:
  - `sentiment` — `'positive' | 'negative' | 'neutral'`
  - `sentimentScore` — number (서버 LLM 출력)
  - `satisfactionScore` — number
  - `menus`, `tips`, `keywords` — 문자열 배열
- 직렬화는 friendly의 SSE `review` 이벤트(`RestaurantSummaryReviewEventType`)와 동일하며, `RestaurantDetailType.reviews[].summary` 모양으로 그대로 들어간다.

**SSE last-snapshot 캐시** (`summarySseManager.lastSnapshot`)는 매니저 내부 `Map<placeId, snapshot>`. 새 구독자가 붙는 즉시 동기적으로 마지막 snapshot을 replay해주므로 UI는 첫 progress tick을 기다리지 않고 곧장 렌더 가능. placeId의 마지막 구독자가 떨어지면 해당 키도 제거된다. (※ review 이벤트는 replay되지 않음 — 매니저가 들고 있는 건 snapshot 한정.)

**SSE 스트림 상태** (`useCrawlJobStream`)는 reducer로 관리하며 `seq`로 중복 이벤트를
드롭하고, `done`/`error` 종단 이벤트에서 클라이언트가 직접 `EventSource.close()`를
호출해 브라우저 자동 재연결을 막는다. 상태에는 `persistedCount`(중복 제외 누적 삽입 수),
`lastBatch`(서버가 푸시한 최신 visitor batch 원본), `lastPersistedBatch`(DB id 부여된
삽입분)가 포함되어, 호출부가 detail 캐시에 리뷰를 inline merge할 수 있다.

## 6. Key Decisions [coverage: high — 14 sources]

- **상태관리는 Zustand** — `CLAUDE.md`/TECH_STACK 가이드라인에 따라 Redux 대신 Zustand 채택. 인증·활성 크롤 잡 같은 전역 동기 상태에만 사용하고 서버 상태는 TanStack Query에 위임.
- **서버 상태는 TanStack Query** — 쿼리 무효화 또는 `setQueryData` 직접 패치로 mutation/SSE 후 캐시 갱신.
- **공개 훅은 placeholderData 로 깜빡임 방지** — `useRestaurantsPublic` / `useRestaurantRanking` 둘 다 `placeholderData: (prev) => prev` 를 깐다. 공개 랭킹/지도는 URL 동기화 패턴이라 query 가 자주 갱신되는데(검색어 디바운스, 카테고리 토글, bbox 변경, 정렬 토글) placeholderData 가 없으면 매 키 변화마다 `data: undefined` 로 떨어져 리스트가 깜빡이거나 스크롤 위치가 튀어 오른다. prev 를 잡아두면 새 응답이 도착하기 전까지 이전 결과를 그대로 렌더해 사용자가 인터랙션을 멈추지 않아도 된다.
- **공개 훅 staleTime 30s** — 서버 자체에 60s TTL 캐시가 있어 동일 쿼리는 어차피 그 안에서 같은 결과를 돌려준다. 클라이언트는 그 절반인 30s 로 잡아 토글이 자주 바뀌어도 분당 두 번 정도만 실제 fetch 가 일어난다(나머지는 stale-while-revalidate 가 캐시 hit).
- **공개 식당 상세/인사이트는 staleTime 60s** — 사용자가 식당을 열고 닫고를 반복할 때마다 같은 placeId 의 분석 결과를 새로 받지 않게 1분 동안 fresh 로 유지. 인사이트는 LLM 비용이 들어가는 무거운 응답이라 특히 중요.
- **`useMapPublicConfig` 의 staleTime / gcTime Infinity + retry: false** — 지도 키는 어드민이 직접 갱신하지 않는 한 거의 바뀌지 않으니 한 번 받으면 세션 끝까지 캐시. 404 는 "키 미등록" = 정상 운영 상태(VWorld 키 미설정 환경) 이므로 자동 retry 를 끄고 호출자가 `query.error` 의 `ApiError.statusCode === 404` 로 분기해 placeholder 지도(예: 안내 문구) 를 노출. 이 두 옵션이 함께 가는 이유는 retry 가 켜져 있으면 미등록 환경에서 계속 같은 404 를 다시 때려 콘솔이 시끄러워지기 때문.
- **`settings-map.api.ts` 는 모듈 PREFIX 상수 제거 → Routes 단일 소스** — 이전에는 모듈 상단에 `const PREFIX = '/api/v1/admin/settings/map'` 같은 로컬 상수를 두고 그걸 path 에 박았는데, 이번에 `Routes.SettingsMap.list / provider(id) / secret(id) / publicConfig` 로 모두 일원화. `@repo/api-contract` 의 Routes 객체 한 곳만 보면 모든 path 가 보이고, FE/BE 가 동일 상수로 라우팅하므로 path drift(예: prefix 만 바꾸고 한쪽 빠뜨림) 가 원천 차단된다. AI 모듈만 namespace re-export 이슈 우회로 `AI_PREFIX` 를 별도 유지하고, 나머지(restaurant/menu-grouping/analytics/settings-map)는 모두 `Routes.*` 패턴으로 정렬.
- **`apiFetch` 의 자동 토큰 첨부는 공개 라우트에 무해** — 토큰이 있으면 모든 요청에 `Authorization` 헤더가 붙지만 공개 라우트는 서버가 헤더를 무시하고 그대로 응답하므로 어드민이 로그인한 채 공개 페이지를 봐도 동일하게 동작. 토큰이 없으면 헤더 자체를 안 붙이므로 게스트/비로그인도 그대로 통과. 공개/어드민을 라우팅 시점이 아닌 클라이언트 단에서 한 가지 fetch 래퍼로 처리할 수 있게 한 핵심 합의 — 공개 훅이 별도 fetch 클라이언트를 가지지 않는 이유.
- **`onUnauthorized` 는 401 시만 트리거 → 공개 라우트는 안전** — 공개 라우트는 권한 검사를 안 하므로 401 을 절대 보내지 않는다. 따라서 비로그인 사용자가 공개 페이지를 돌아다녀도 `onUnauthorized` 콜백(웹의 경우 토큰 정리 + 로그인 페이지 리다이렉트)이 발동하지 않고, 어드민 페이지로 직접 이동했을 때만 401 → 콜백 → 리다이렉트 흐름이 정상적으로 돈다.
- **공개 list queryKey 는 의미 있는 6 필드만** — `useRestaurantsPublic` 의 키는 `q / category / bbox / sort / limit / offset` 만 넣고, 그 외 미래 필드(예: 클라이언트 디스플레이 옵션) 는 키에 넣지 않을 계획. 모든 필드를 키에 깔면 사용자가 UI 토글 하나 바꿀 때마다 리페치가 폭증한다 — 의도적으로 좁힌 키로 안정성과 응답성을 맞춤.
- **Summary SSE 는 싱글톤 매니저로 멀티플렉싱** — HTTP/1.1의 origin당 6 connection cap에 걸리는 걸 방지하기 위해 `summarySseManager`가 프로세스 전역에서 단일 EventSource만 유지한다. 컴포넌트가 몇 개를 구독하든 실제 연결은 하나. placeId별 refcount로 구독자 수를 추적하다 0이 되면 키를 제거하고, set이 비면 EventSource를 닫는다.
- **잡 단위 SSE 는 매니저를 쓰지 않는다** — `useGroupingJob` / `useGlobalMergeJob` 은 잡 하나당 한 페이지에서 하나만 띄우는 일회성 흐름이다. 멀티플렉싱이 필요 없고, snapshot 으로 매번 전체 상태를 받을 수 있어 last-snapshot replay 도 불필요하다. 그래서 훅 자체가 `EventSource` 를 들고 `closedRef`/`retryRef` 로 라이프사이클 + 백오프만 관리. 코드가 짧고 잡별 격리가 자연스럽다.
- **잡 SSE 백오프** — `1s → 2s → 4s → 8s → 16s → 30s cap`(`Math.min(30_000, 1000 * 2 ** retry)`). `snapshot` 도착 시 retry 카운터 0 으로 리셋 → 일시적 끊김 후 재성공 시 다음 끊김부터 다시 1s 부터. `done` 이 도착하거나 unmount 되면 `closedRef.current = true` 로 모든 reconnect 차단.
- **잡 SSE done 이벤트의 invalidate 정책** — 잡이 끝나는 순간 관련 통계 캐시(그룹핑: `restaurants-status` + `ranking`, 전역 머지: `overview` + `global-menus`)를 `invalidateQueries` 로 prefix 매치 무효화. 어떤 식당/메뉴가 영향받았는지 정확한 diff 없이도 UI 가 다음 마운트/포커스에서 새 데이터를 본다.
- **chunk 진행은 카운트만** — `useGlobalMergeJob` 의 `chunk` 핸들러는 payload.progress 의 세부값을 무시하고 `doneChunks += 1`, `totalChunks = max(prev.totalChunks, doneChunks)` 로 동적 max 만 갱신. 서버가 총 chunk 수를 사전에 못 정해도 진행 바가 단조 증가하도록 보장.
- **재연결 coalescing(microtask) — summary 매니저 한정** — React StrictMode 더블 인보케이션이나 한 tick 안의 다중 subscribe/unsubscribe가 매번 reconnect를 트리거하지 않도록 `summarySseManager` 가 `queueMicrotask`로 모아 한 번만 reconnect. 잡 SSE 훅은 jobId 가 effect deps 라 자연스럽게 한 번만 connect 한다.
- **last-snapshot replay — summary 매니저 한정** — 새 구독자가 붙는 즉시 매니저가 보유한 마지막 snapshot을 동기 콜백으로 흘려준다. 잡 SSE 훅은 GET 으로 초기 스냅샷을 따로 받기 때문에 replay 가 필요 없음.
- **Mutation onSuccess 가 잡 snapshot 을 미리 박는다** — `useCreateGroupingJob` / `useStartGlobalMerge` 둘 다 응답으로 받은 snapshot 을 `setQueryData(['...', 'job', jobId], snap)` 로 즉시 캐시에 반영. UI 가 라우팅된 직후 `useGroupingJob` / `useGlobalMergeJob` 이 마운트되면 React Query GET 이 fire 하기 전에 첫 화면이 이미 채워져 있다.
- **List는 `setQueryData` 패치, Detail review는 inline merge** — summary 이벤트마다 리스트 페이지의 매칭 row 카운트만 갱신하고, review 이벤트마다 detail 캐시의 해당 review 한 건만 업데이트한다. 둘 다 invalidate를 쓰지 않아 detail GET(전체 리뷰 본문 페이로드)이 페이지 진입당 최대 1회로 억제됨.
- **분석 필드도 review 이벤트에 합승** — `sentiment/satisfactionScore/menus/tips/keywords`를 별도 채널/엔드포인트로 빼지 않고 기존 `review` SSE 이벤트에 함께 실어 단일 setQueryData로 머지. 분석이 끝나야만 review가 발행되므로 부분 상태(텍스트만 있고 분석 없음)가 클라이언트에 잠깐 보이는 일이 없다.
- **Multi-slot crawl store** — `jobs`가 jobId 키 맵이라서 다수 동시 잡을 표현 가능. list 페이지와 detail 페이지가 동일 store를 읽으므로 어느 쪽에서 띄운 잡이든 다른 쪽에서 즉시 보인다.
- **Passive list-summary subscription** — `useRestaurantListSummaryEvents`는 state를 들지 않고 캐시 패치만 하는 부수효과 전용 훅. 사용자가 진행률 패널을 unmount해도 같은 페이지에 머무는 동안 row 뱃지는 라이브로 유지.
- **zod 타입 기반 fetch 래퍼** — `apiFetch`는 `ErrorResponseSchema.safeParse`로 서버 에러 형태를 검증해 일관된 `ApiError`로 변환. 요청/응답 타입은 `@repo/api-contract`에서만 정의.
- **`apiFetch`는 body가 있을 때만 `Content-Type: application/json` 설정** — fastify는 헤더가 붙은 POST/PUT인데 body가 비어 있으면 즉시 거부한다. 이전 구현은 항상 헤더를 박아서 빈 body 호출이 깨졌다. 변경 후엔 `init.body !== undefined && init.body !== null`인 경우에만 헤더를 합성. 204 No Content 응답은 별도로 처리해 `undefined`를 반환.
- **AI path는 모듈 상수로 하드코드** — `ai.api.ts`는 `Routes.Ai` 네임스페이스 대신 모듈 상단 `const AI_PREFIX = '/api/v1/admin/ai'`를 쓴다. Vite의 esbuild prebundle이 `export * as Routes`로 묶인 inner 객체를 일부 시나리오에서 비워 떨어뜨리는 이슈 우회. 다른 도메인은 `Routes.*`를 그대로 쓰지만 AI 모듈만 명시적으로 끊어둠.
- **로직은 공유, UI는 플랫폼 분리** — Tamagui 같은 통합 UI 솔루션을 도입하지 않고, 각 컴포넌트를 `.web.tsx` / `.native.tsx`로 쪼갠다. 공용 props는 `*.types.ts` 한 곳에만 두어 시그니처가 갈라지는 것을 방지.
- **빌드 없는 소스 노출** — `package.json`이 `src/index.ts`를 그대로 main/types로 가리키므로 모노레포 컨슈머는 워크스페이스 링크만으로 즉시 사용. dist 산출물 없음.
- **유연한 React peer** — `react >=18` peer로 web의 React 19와 mobile의 React 18을 동시에 만족.
- **SSE 토큰은 쿼리스트링** — `EventSource`가 커스텀 헤더를 보낼 수 없어 `?token=` 방식으로 우회 (`buildJobEventsUrl`, `buildSummaryEventsUrl`, `buildGroupingJobEventsUrl`, `buildGlobalMergeJobEventsUrl`).
- **중복 이벤트 방어** — SSE 재연결 시 서버가 `Last-Event-ID`로 리플레이하면 reducer가 `seq <= lastSeq`인 이벤트를 무시.

## 7. Gotchas [coverage: high — 14 sources]

- **`useMapPublicConfig` 는 staleTime Infinity 라 키 갱신 후 invalidate 필요** — 어드민이
  `useUpdateMapProvider` 로 키를 바꿔도 그 mutation 의 onSuccess 는 어드민 키만 invalidate 하고
  `['settings', 'map', 'public']` 은 건드리지 않는다. 같은 SPA 안에서 어드민 → 공개 페이지로
  넘어가면서 새 키를 즉시 반영하려면 호출부가 명시적으로 `qc.invalidateQueries({ queryKey: ['settings', 'map', 'public'] })`
  를 부르거나 페이지 reload 가 필요. 현재는 어드민/공개 동시 사용이 드문 시나리오라 기본
  동작은 "다음 풀 reload 까지 stale" 로 둠.
- **공개 list 의 queryKey 에 모든 필드를 깔면 리페치 폭증** — `useRestaurantsPublic` 은
  의도적으로 6 필드(`q/category/bbox/sort/limit/offset`)만 키에 넣었다. 미래에 클라이언트
  전용 디스플레이 옵션(예: 카드 vs 리스트 토글, 정렬 보조 키)을 추가할 때 그것도 키에 넣으면
  토글 한 번에 새 캐시키 → 리페치가 발생한다. 진짜 서버 응답을 바꾸는 필드만 키에 추가하고,
  클라 전용 표시 상태는 별도 useState/Zustand 로 빼야 한다.
- **placeId null 가드 누락 시 빈 string 으로 호출** — `useRestaurantPublic(placeId)` /
  `useRestaurantPublicInsights(placeId)` 는 `enabled: !!placeId` 로 비활성을 걸지만, `queryFn`
  안에서도 `if (!placeId) throw new Error('placeId required')` 로 한 번 더 막아둔다. 호출부가
  실수로 `placeId={selectedId ?? ''}` 식으로 빈 문자열을 넘기면 `enabled` 가 `false` 로 평가돼
  쿼리 자체가 안 도는 게 정상이지만, 만약 쿼리키만 `''` 로 박힌 채 어떤 코드 경로에서 강제로
  fetch 를 트리거하면 throw 가 React Query 에러로 떨어진다. UI 단에서 `placeId: string | null`
  타입을 그대로 넘기는 패턴을 유지해야 함.
- **`buildSummaryEventsUrl`은 string[] 시그니처** — 단일 placeId가 아니라 배열을 받는다. 엔드포인트도 `:placeId` path 기반이 아닌 `?placeId=A&placeId=B` 쿼리 기반(`Routes.Restaurant.summaryEvents`). 호출부는 항상 배열로 감싸 넘길 것.
- **잡 SSE 훅은 `jobId` 변경 시 effect 가 통째로 재실행** — `useEffect` deps 가 `[jobId]` 라 jobId 가 바뀌면 cleanup → 새 connect 가 일어난다. 이전 잡의 `EventSource` 는 cleanup 에서 닫히지만, 진행 중 backoff 타이머도 같이 clear 해야 stale connect 가 새 jobId 위로 안 떨어진다 — 그래서 `reconnect.id` 를 closure 로 잡아 `clearTimeout` 함. 코드 수정 시 이 cleanup 순서를 깨면 두 번째 연결이 살아남아 첫 connect 가 stale snapshot 으로 캐시를 덮을 수 있음.
- **`useGlobalMergeJob` chunk 의 `payload.progress` 는 사용되지 않음** — `void payload` 로 명시 무시한다. 추후 chunk 단위 세부 통계(예: 처리한 메뉴 수)를 보여주려면 핸들러 수정 필요. 현재는 doneChunks 카운트만 의미가 있음.
- **잡 SSE done 후 추가 이벤트는 무시됨** — `done` 핸들러가 `closedRef.current = true; es.close()` 를 호출. 만약 서버가 done 이후에도 후속 이벤트를 보낸다면 (예: 재처리 알림) 클라이언트는 못 받는다. 백엔드 계약상 done 이 확정 종단이라는 전제.
- **`useMenuRanking` / `useGroupingJob` 의 404 처리** — `ApiError.statusCode === 404` 면 `null` 을 반환해 React Query 에 정상 데이터로 흘림. throw 하지 않음. UI 는 `data === null` 을 "아직 그룹핑 없음" 상태로 분기해야 함. **공개 지도 키도 동일 패턴** — `useMapPublicConfig` 는 retry: false 로 두고, 호출부가 `query.error` 의 `ApiError.statusCode === 404` 를 보고 placeholder 분기.
- **`useGroupingRestaurantsStatus` 는 자동 refetch 없음** — 잡 done 이벤트가 invalidate 를 트리거하기 전엔 stale. SSE 가 끊긴 채 잡이 끝나면(예: 네트워크 단절 + 백오프 30s) 그 시간 동안 status 가 안 갱신될 수 있음. 백엔드 잡 시스템 자체는 유실 없이 진행하지만 클라이언트 인지가 늦어지는 케이스.
- **`useGlobalMenus` 쿼리키 8-튜플** — q/category/sort/minMentions/limit/includeUnlinked 의 기본값을 캐시키 안에서 직접 채우므로(`?? ''`, `?? 'mentions'`, ...) 호출부가 query 객체를 매번 새로 만들어도 안전하지만, 기본값을 바꾸면 캐시키 모양이 변해 기존 캐시가 즉시 cold 가 된다. **`useRestaurantsPublic` 도 같은 패턴** — 6 필드 기본값(`'' / '' / '' / 'recent' / 60 / 0`)을 변경하면 기존 캐시가 한 번에 cold 로 전환된다.
- **재연결 시 짧은 갭 — summary 매니저** — 구독 set이 변하면 `summarySseManager`가 기존 EventSource를 닫고 새 union으로 다시 연다. 사이의 짧은 비연결 구간 동안 발생한 이벤트는 손실되지만, 서버가 connect 시 초기 snapshot을 재방출하므로 카운트/상태는 다음 tick에 회복된다. (단 review 이벤트는 replay되지 않음.)
- **EventSource는 헤더를 못 실음** — 모든 SSE 빌더가 `?token=<jwt>` 로 우회. URL/access log/Referer 노출 위험이 있으므로 단명 토큰이나 별도 stream-token 발급을 고려해야 한다 (현재는 일반 JWT 그대로).
- **Detail 캐시 inline 패치 의존** — `useRestaurantSummaryEvents`는 review 이벤트가 도착할 때마다 detail 캐시를 직접 mutate한다. 만약 detail 페이지가 캐시 대신 새 GET을 강제로 트리거하면 매 review 마다 전체 리뷰 페이로드를 재다운로드하는 사고가 난다.
- **Review 머지는 `summary` 한 객체 전체를 통째로 교체** — `r.summary`를 spread하지 않고 `summary: { ...신규 필드 }`로 전부 새로 만든다(`startedAt`만 `r.summary?.startedAt ?? null`로 보존). 서버 SSE가 새 필드를 빠뜨려 보내면 클라이언트에서 그 필드는 undefined로 떨어진다.
- **List 캐시 형태 변경 주의** — snapshot 핸들러가 `prev.items[i].{summaryPending,summaryRunning,summaryDone,summaryFailed,totalReviews}`를 직접 덮는다. `RestaurantListResultType` 모양을 바꾸면 두 훅(`useRestaurantSummaryEvents`, `useRestaurantListSummaryEvents`)을 같이 맞춰야 한다.
- **`useRestaurantListSummaryEvents`는 부수효과 전용** — 반환값이 없는 `void` 훅이다. 호출부가 반환값을 데이터로 쓰려고 하면 안 되며, 캐시 패치 외엔 상태가 없다.
- **활성 잡 스토어 cleanup은 호출부 책임** — `useActiveCrawlJobStore`는 자동으로 done/error 잡을 지우지 않는다. 호출부가 SSE 종단 이벤트나 unmount 시점에 `remove(jobId)`를 명시적으로 부를 것.
- **확장자 해석 의존** — UI 프리미티브가 동작하려면 Vite/Webpack는 `.web.tsx`, Metro는 `.native.tsx`를 우선 해석하도록 설정돼 있어야 한다.
- **React 18 하한선 고정** — peer가 `react >=18.0.0`. mobile이 RN 0.76 + React 18을 쓰는 한 절대 React 17 이하로 내릴 수 없다.
- **순환 의존 금지** — `@repo/shared → @repo/api-contract` 방향만 허용.
- **토큰 영속화는 앱 책임** — `@repo/shared`는 `getToken` 게터만 받는다.
- **`configureApi` 호출 누락** — 앱 부팅 시점에 `configureApi({ baseUrl, getToken, onUnauthorized })`를 안 부르면 `baseUrl`이 빈 문자열이라 모든 fetch가 동일 origin으로 새는 형태로 조용히 실패한다. 공개 라우트도 마찬가지로 깨지므로 비로그인 사용자도 `configureApi` 가 끝난 뒤에 페이지를 보게 해야 한다.
- **`Button.tsx` 진입점은 현재 `.web.tsx`를 다시 export** — 공유 진입점이 사실상 web 구현을 가리키므로, 번들러가 확장자 우선순위를 올바르게 잡아야 native에서 정상 분기한다.
- **`applyCssVars`는 `HTMLElement` 인자 필요** — RN에는 `HTMLElement`가 없다. CSS 변수 헬퍼는 web 전용 코드 경로에서만 호출할 것.
- **`invalidateQueries` 키 매칭** — AI provider mutation은 `['ai', 'providers']`만 무효화한다. 메뉴 그룹핑/분석 invalidate 도 prefix 매치라 키 모양을 바꾸면 done 핸들러도 같이 맞춰야 함. 지도 mutation 은 어드민 캐시(`['settings', 'map', 'providers']` + `['settings', 'map', 'secret', id]`)만 invalidate 하므로 공개 캐시(`['settings', 'map', 'public']`) 동기화가 필요하면 별도로.
- **`testProvider`/`deleteProvider` 빈 body** — `aiApi.testProvider(id)`(인자 없음) 호출은 `JSON.stringify(model ? { model } : {})`로 빈 객체 `'{}'` 를 보낸다. 즉 body 가 비어있지 않으므로 `Content-Type` 헤더가 합성된다. 향후 인자 없는 POST 를 추가할 거라면 `body`를 아예 omit해야 fastify가 받는다.

## 8. Sources [coverage: high — 37 sources]

- [packages/shared/package.json](../../packages/shared/package.json)
- [packages/shared/tsconfig.json](../../packages/shared/tsconfig.json)
- [packages/shared/src/index.ts](../../packages/shared/src/index.ts)
- [packages/shared/src/api/client.ts](../../packages/shared/src/api/client.ts)
- [packages/shared/src/api/auth.api.ts](../../packages/shared/src/api/auth.api.ts)
- [packages/shared/src/api/picks.api.ts](../../packages/shared/src/api/picks.api.ts)
- [packages/shared/src/api/admin.api.ts](../../packages/shared/src/api/admin.api.ts)
- [packages/shared/src/api/crawl.api.ts](../../packages/shared/src/api/crawl.api.ts)
- [packages/shared/src/api/restaurant.api.ts](../../packages/shared/src/api/restaurant.api.ts)
- [packages/shared/src/api/menu-grouping.api.ts](../../packages/shared/src/api/menu-grouping.api.ts)
- [packages/shared/src/api/analytics.api.ts](../../packages/shared/src/api/analytics.api.ts)
- [packages/shared/src/api/ai.api.ts](../../packages/shared/src/api/ai.api.ts)
- [packages/shared/src/api/settings-map.api.ts](../../packages/shared/src/api/settings-map.api.ts)
- [packages/shared/src/hooks/useAuth.ts](../../packages/shared/src/hooks/useAuth.ts)
- [packages/shared/src/hooks/usePicks.ts](../../packages/shared/src/hooks/usePicks.ts)
- [packages/shared/src/hooks/useAdmin.ts](../../packages/shared/src/hooks/useAdmin.ts)
- [packages/shared/src/hooks/useCrawl.ts](../../packages/shared/src/hooks/useCrawl.ts)
- [packages/shared/src/hooks/useRestaurant.ts](../../packages/shared/src/hooks/useRestaurant.ts)
- [packages/shared/src/hooks/summarySseManager.ts](../../packages/shared/src/hooks/summarySseManager.ts)
- [packages/shared/src/hooks/useMenuGrouping.ts](../../packages/shared/src/hooks/useMenuGrouping.ts)
- [packages/shared/src/hooks/useAnalytics.ts](../../packages/shared/src/hooks/useAnalytics.ts)
- [packages/shared/src/hooks/useAi.ts](../../packages/shared/src/hooks/useAi.ts)
- [packages/shared/src/hooks/useSettingsMap.ts](../../packages/shared/src/hooks/useSettingsMap.ts)
- [packages/shared/src/stores/authStore.ts](../../packages/shared/src/stores/authStore.ts)
- [packages/shared/src/stores/activeCrawlJobStore.ts](../../packages/shared/src/stores/activeCrawlJobStore.ts)
- [packages/shared/src/constants/index.ts](../../packages/shared/src/constants/index.ts)
- [packages/shared/src/design/index.ts](../../packages/shared/src/design/index.ts)
- [packages/shared/src/design/tokens.ts](../../packages/shared/src/design/tokens.ts)
- [packages/shared/src/design/theme.ts](../../packages/shared/src/design/theme.ts)
- [packages/shared/src/design/cssVars.ts](../../packages/shared/src/design/cssVars.ts)
- [packages/shared/src/design/ThemeProvider.tsx](../../packages/shared/src/design/ThemeProvider.tsx)
- [packages/shared/src/ui/index.ts](../../packages/shared/src/ui/index.ts)
- [packages/shared/src/ui/Button/Button.tsx](../../packages/shared/src/ui/Button/Button.tsx)
- [packages/shared/src/ui/Button/Button.types.ts](../../packages/shared/src/ui/Button/Button.types.ts)
- [packages/shared/src/ui/Button/index.ts](../../packages/shared/src/ui/Button/index.ts)
- [packages/shared/src/ui/](../../packages/shared/src/ui/) (Divider, ErrorBanner, Input, Screen, SegmentedControl, Stack, Text)
- [CLAUDE.md](../../CLAUDE.md)
