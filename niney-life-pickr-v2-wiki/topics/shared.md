---
topic: shared
last_compiled: 2026-05-07
sources_count: 31
status: active
aliases: [react-query, zustand, design-tokens, ui-primitives, "@repo/shared"]
---

# shared — FE 공통 패키지

## 1. Purpose [coverage: high — 3 sources]

`@repo/shared`는 web과 mobile에서 동시에 사용되는 프론트엔드 공통 코드를 모아둔 워크스페이스
패키지다. 책임 영역은 다음과 같다.

- 타입 안전한 fetch 래퍼와 도메인별 API 함수 (auth, picks, admin, crawl, restaurant, ai)
- TanStack Query 훅 (서버 상태)
- Zustand 스토어 (인증, 활성 크롤 잡)
- 프로세스 전역 SSE 매니저 싱글톤 (요약 진행률 멀티플렉싱)
- 디자인 토큰·테마·`ThemeProvider`·CSS 변수 변환
- 플랫폼 분기형 UI 프리미티브 (Button, Input, Stack, Text, Divider, ErrorBanner, Screen, SegmentedControl)
- 공용 상수 (`APP_NAME`, React Query staleTime/gcTime)

빌드 산출물 없이 `src/index.ts`를 그대로 노출(`"main": "./src/index.ts"`)하므로
Turborepo 컨슈머는 별도 빌드 단계 없이 TS 소스를 바로 import한다.

## 2. Architecture [coverage: high — 12 sources]

```
packages/shared/src/
├── index.ts                # barrel: 모든 하위 모듈 re-export
├── api/
│   ├── client.ts           # apiFetch + ApiError + configureApi (토큰 게터 주입)
│   ├── auth.api.ts
│   ├── picks.api.ts
│   ├── admin.api.ts
│   ├── crawl.api.ts        # SSE 엔드포인트 URL 빌더 포함
│   ├── restaurant.api.ts   # list/getByPlaceId/delete + buildSummaryEventsUrl
│   └── ai.api.ts           # LLM provider 관리 + complete/completeBatch
├── hooks/
│   ├── useAuth.ts          # useCurrentUser, useLogin, useRegister, useLogout
│   ├── usePicks.ts         # 쿼리키 팩토리 + CRUD + useRandomPick
│   ├── useAdmin.ts
│   ├── useCrawl.ts         # useCrawlJobStream (EventSource reducer + persistedCount/lastBatch)
│   ├── useRestaurant.ts    # list/byPlaceId/delete + summary SSE 구독 훅
│   ├── summarySseManager.ts# 프로세스 전역 SSE 싱글톤 (멀티플렉싱)
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

훅 레이어는 `useQueryClient`로 TanStack Query 캐시를 직접 패치하는 패턴을 광범위하게 쓴다
(SSE 이벤트 → 리스트/상세 캐시 inline merge). `summarySseManager`는 React 바깥의 모듈
싱글톤이라 어떤 컴포넌트가 mount/unmount되든 동일한 단일 EventSource를 공유한다.

각 UI 컴포넌트는 `*.types.ts`로 props 계약을 단일 소스로 두고, 플랫폼 번들러가
파일 확장자 해석으로 구현체를 골라간다 (Vite/Webpack은 `.web.tsx`, Metro는
`.native.tsx`). `tsconfig.json`은 `@repo/config/tsconfig/react.json`을 상속한다.

## 3. Talks To [coverage: high — 5 sources]

- 의존성: `@repo/api-contract` (zod 스키마/타입/`Routes` 상수), `@repo/utils`,
  `@tanstack/react-query`, `zustand`.
- peerDependencies: `react >=18.0.0`, `react-native >=0.76.0` (옵셔널).
  → web은 React 19, mobile은 React 18 + RN 0.76 양쪽을 만족한다.
- 컨슈머: `apps/web` (Vite + React 19), `apps/mobile` (RN 0.76 + React 18).
- 외부:
  - `apiFetch`로 [friendly](friendly.md) API에 HTTP.
  - `useCrawlJobStream`은 friendly의 SSE 엔드포인트(`Routes.Crawl.jobEvents`)에 EventSource로 접속.
  - `summarySseManager`는 friendly의 `/admin/restaurants/summary-events`(=`Routes.Restaurant.summaryEvents`)에 단일 EventSource로 멀티플렉싱 접속. 브라우저 탭당 최대 한 개의 연결만 유지.
  - `aiApi`는 friendly의 `/api/v1/admin/ai/*` 라우트.
- UI 측 사용처는 [web](web.md) 참조 — 본 문서는 로직 계약까지만 다룬다.

## 4. API Surface [coverage: high — 16 sources]

**API 클라이언트 (`api/`)**
- `configureApi(cfg)`, `getApiConfig()`, `apiFetch<T>(path, init)`, `ApiError`
- `authApi`: `register`, `login`, `me`, `logout`
- `picksApi`: `list`, `getById`, `create`, `update`, `remove`, `random`
- `adminApi`: `listUsers`, `setRole`
- `crawlApi`: `start`, `list`, `cancel` + `buildJobEventsUrl(jobId)` (SSE URL — `EventSource`가 헤더를 못 실으니 `?token=`으로 인증 토큰 전달)
- `restaurantApi`: `list`, `getByPlaceId(placeId)`, `getSummaryStatus(placeId)`, `delete(placeId)` + `buildSummaryEventsUrl(placeIds: string[])` — **string 배열을 받아** `?placeId=A&placeId=B&...&token=<jwt>` 형태로 합쳐 단일 SSE URL 생성. 엔드포인트는 `Routes.Restaurant.summaryEvents`로 path param이 아닌 query 기반.
- `aiApi`: `complete`, `completeBatch`, `listProviders`, `updateProvider(id, input)`, `deleteProvider(id)` (→ 204 void), `testProvider(id, model?)`, `listModels(id)`. 모든 path는 모듈 상단 상수 `AI_PREFIX = '/api/v1/admin/ai'`로 하드코드.

**React Query 훅 (`hooks/`)**
- 인증: `useCurrentUser`, `useLogin`, `useRegister`, `useLogout`
- 픽: `usePicks`, `usePick`, `useCreatePick`, `useUpdatePick`, `useDeletePick`, `useRandomPick`
- 어드민: `useAdminUsers`, `useSetUserRole`
- 크롤: `useStartCrawl`, `useCrawlJobs`, `useCancelCrawl`, `useCrawlJobStream`
- 맛집: `useRestaurantList`, `useRestaurantByPlaceId(placeId)`, `useDeleteRestaurant`, `useRestaurantSummaryEvents(placeId)`, `useRestaurantListSummaryEvents(placeIds[])`
- AI: `useCompleteAi`, `useCompleteBatchAi`, `useProviders`, `useUpdateProvider`, `useDeleteProvider`, `useTestProvider`, `useProviderModels(id, enabled?)`

**SSE 매니저 (`hooks/summarySseManager.ts`)**
- `summarySseManager.subscribe(placeId, { onSnapshot, onReview })` → `unsubscribe()` 함수 반환. 컴포넌트가 직접 부르기보다 위 두 훅을 통해 사용한다.

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

## 5. Data [coverage: high — 6 sources]

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

`apiFetch`는 매 요청마다 `await config.getToken?.()`을 호출해 `Authorization:
Bearer <token>` 헤더를 합성한다. 401 응답이면 `onUnauthorized` 콜백을 발동시켜
앱이 세션 정리/리다이렉트를 수행하도록 한다.

**클라이언트 캐시**는 TanStack Query가 전적으로 관리한다.
- `usePicks`는 `['picks', 'list']` / `['picks', 'detail', id]` 쿼리키 팩토리.
- `useRestaurantList` → `['restaurant', 'list']`, `useRestaurantByPlaceId(placeId)` → `['restaurant', placeId]`. summary SSE 훅이 두 키를 모두 직접 `setQueryData`로 패치한다 (snapshot은 list 캐시, review는 detail 캐시).
- `useDeleteRestaurant`는 onSuccess에서 `['restaurant', 'list']`를 invalidate하고 `['restaurant', placeId]`를 removeQueries로 비운다.
- `useProviders`는 `['ai', 'providers']`. `useUpdateProvider` / `useDeleteProvider`가 onSuccess에서 `qc.invalidateQueries({ queryKey: ['ai', 'providers'] })` 호출.
- `useProviderModels(id, enabled)`는 `['ai', 'providers', id, 'models']` — `staleTime: 60_000`, `retry: false`로 베스트-에포트 fetch (실패해도 에러 토스트 없이 빈 결과). UI 자동완성용 datalist에만 쓰이고 사용자가 직접 모델 id 입력 가능.

**SSE last-snapshot 캐시** (`summarySseManager.lastSnapshot`)는 매니저 내부 `Map<placeId, snapshot>`. 새 구독자가 붙는 즉시 동기적으로 마지막 snapshot을 replay해주므로 UI는 첫 progress tick을 기다리지 않고 곧장 렌더 가능. placeId의 마지막 구독자가 떨어지면 해당 키도 제거된다.

**SSE 스트림 상태** (`useCrawlJobStream`)는 reducer로 관리하며 `seq`로 중복 이벤트를
드롭하고, `done`/`error` 종단 이벤트에서 클라이언트가 직접 `EventSource.close()`를
호출해 브라우저 자동 재연결을 막는다. 상태에는 `persistedCount`(중복 제외 누적 삽입 수),
`lastBatch`(서버가 푸시한 최신 visitor batch 원본), `lastPersistedBatch`(DB id 부여된
삽입분)가 포함되어, 호출부가 detail 캐시에 리뷰를 inline merge할 수 있다.

## 6. Key Decisions [coverage: high — 9 sources]

- **상태관리는 Zustand** — `CLAUDE.md`/TECH_STACK 가이드라인에 따라 Redux 대신 Zustand 채택. 인증·활성 크롤 잡 같은 전역 동기 상태에만 사용하고 서버 상태는 TanStack Query에 위임.
- **서버 상태는 TanStack Query** — 쿼리 무효화 또는 `setQueryData` 직접 패치로 mutation/SSE 후 캐시 갱신.
- **SSE는 싱글톤 매니저로 멀티플렉싱** — HTTP/1.1의 origin당 6 connection cap에 걸리는 걸 방지하기 위해 `summarySseManager`가 프로세스 전역에서 단일 EventSource만 유지한다. 컴포넌트가 몇 개를 구독하든 실제 연결은 하나. placeId별 refcount로 구독자 수를 추적하다 0이 되면 키를 제거하고, set이 비면 EventSource를 닫는다.
- **재연결 coalescing(microtask)** — React StrictMode 더블 인보케이션이나 한 tick 안의 다중 subscribe/unsubscribe가 매번 reconnect를 트리거하지 않도록 `queueMicrotask`로 모아 한 번만 reconnect. `connectGen` 카운터로 stale `buildSummaryEventsUrl()` resolve도 무시.
- **last-snapshot replay** — 새 구독자가 붙는 즉시 매니저가 보유한 마지막 snapshot을 동기 콜백으로 흘려준다. 이전 폴링 훅과 시그니처 호환을 유지하면서 첫 페인트가 비어 보이지 않도록 함.
- **List는 `setQueryData` 패치, Detail review는 inline merge** — summary 이벤트마다 리스트 페이지의 매칭 row 카운트만 갱신하고, review 이벤트마다 detail 캐시의 해당 review 한 건만 업데이트한다. 둘 다 invalidate를 쓰지 않아 detail GET(전체 리뷰 본문 페이로드)이 페이지 진입당 최대 1회로 억제됨.
- **Multi-slot crawl store** — `jobs`가 jobId 키 맵이라서 다수 동시 잡을 표현 가능. list 페이지와 detail 페이지가 동일 store를 읽으므로 어느 쪽에서 띄운 잡이든 다른 쪽에서 즉시 보인다.
- **Passive list-summary subscription** — `useRestaurantListSummaryEvents`는 state를 들지 않고 캐시 패치만 하는 부수효과 전용 훅. 사용자가 진행률 패널을 unmount해도 같은 페이지에 머무는 동안 row 뱃지는 라이브로 유지.
- **zod 타입 기반 fetch 래퍼** — `apiFetch`는 `ErrorResponseSchema.safeParse`로 서버 에러 형태를 검증해 일관된 `ApiError`로 변환. 요청/응답 타입은 `@repo/api-contract`에서만 정의.
- **`apiFetch`는 body가 있을 때만 `Content-Type: application/json` 설정** — fastify는 `Content-Type: application/json` 헤더가 붙은 POST/PUT인데 body가 비어 있으면 `Body cannot be empty when content-type is set to 'application/json'` 에러로 거부한다. 이전 구현은 항상 헤더를 박아서 `aiApi.testProvider(id)`(model 없는 호출 → `JSON.stringify({})` 보냄)나 향후 빈 body 호출이 깨졌다. 변경 후엔 `init.body !== undefined && init.body !== null`인 경우에만 헤더를 합성. 204 No Content 응답은 별도로 처리해 `undefined`를 반환.
- **AI path는 모듈 상수로 하드코드** — `ai.api.ts`는 `Routes.Ai` 네임스페이스 대신 모듈 상단 `const AI_PREFIX = '/api/v1/admin/ai'`를 쓴다. Vite의 esbuild prebundle이 `export * as Routes`로 묶인 inner 객체를 일부 시나리오에서 비워 떨어뜨리는 이슈 우회. 다른 도메인은 `Routes.*`를 그대로 쓰지만 AI 모듈만 명시적으로 끊어둠.
- **로직은 공유, UI는 플랫폼 분리** — Tamagui 같은 통합 UI 솔루션을 도입하지 않고 (TECH_STACK 결정), 각 컴포넌트를 `.web.tsx` / `.native.tsx`로 쪼갠다. 공용 props는 `*.types.ts` 한 곳에만 두어 시그니처가 갈라지는 것을 방지.
- **빌드 없는 소스 노출** — `package.json`이 `src/index.ts`를 그대로 main/types로 가리키므로 모노레포 컨슈머는 워크스페이스 링크만으로 즉시 사용. dist 산출물 없음.
- **유연한 React peer** — `react >=18` peer로 web의 React 19와 mobile의 React 18을 동시에 만족.
- **SSE 토큰은 쿼리스트링** — `EventSource`가 커스텀 헤더를 보낼 수 없어 `?token=` 방식으로 우회 (`buildJobEventsUrl`, `buildSummaryEventsUrl`).
- **중복 이벤트 방어** — SSE 재연결 시 서버가 `Last-Event-ID`로 리플레이하면 reducer가 `seq <= lastSeq`인 이벤트를 무시.

## 7. Gotchas [coverage: high — 9 sources]

- **`buildSummaryEventsUrl`은 string[] 시그니처** — 단일 placeId가 아니라 배열을 받는다. 엔드포인트도 `:placeId` path 기반이 아닌 `?placeId=A&placeId=B` 쿼리 기반(`Routes.Restaurant.summaryEvents`). 호출부는 항상 배열로 감싸 넘길 것.
- **재연결 시 짧은 갭** — 구독 set이 변하면 `summarySseManager`가 기존 EventSource를 닫고 새 union으로 다시 연다. 사이의 짧은 비연결 구간 동안 발생한 이벤트는 손실되지만, 서버가 connect 시 초기 snapshot을 재방출하므로 카운트/상태는 다음 tick에 회복된다.
- **EventSource는 헤더를 못 실음** — `summarySseManager`/`useCrawlJobStream` 모두 토큰을 URL `?token=<jwt>`에 담는다. URL/access log/Referer 노출 위험이 있으므로 단명 토큰이나 별도 stream-token 발급을 고려해야 한다 (현재는 일반 JWT 그대로).
- **Detail 캐시 inline 패치 의존** — `useRestaurantSummaryEvents`는 review 이벤트가 도착할 때마다 detail 캐시를 직접 mutate한다. 만약 detail 페이지가 캐시 대신 새 GET을 강제로 트리거하면 매 review 마다 전체 리뷰 페이로드를 재다운로드하는 사고가 난다. detail GET은 페이지 진입당 1회만 발생하도록 유지.
- **List 캐시 형태 변경 주의** — snapshot 핸들러가 `prev.items[i].{summaryPending,summaryRunning,summaryDone,summaryFailed,totalReviews}`를 직접 덮는다. `RestaurantListResultType` 모양을 바꾸면 두 훅(`useRestaurantSummaryEvents`, `useRestaurantListSummaryEvents`)을 같이 맞춰야 한다.
- **`useRestaurantListSummaryEvents`는 부수효과 전용** — 반환값이 없는 `void` 훅이다. 호출부가 반환값을 데이터로 쓰려고 하면 안 되며, 캐시 패치 외엔 상태가 없다. 진행률 텍스트가 필요한 곳에서는 `useRestaurantSummaryEvents`(상태 보유)를 따로 써야 함.
- **활성 잡 스토어 cleanup은 호출부 책임** — `useActiveCrawlJobStore`는 자동으로 done/error 잡을 지우지 않는다. 호출부가 SSE 종단 이벤트나 unmount 시점에 `remove(jobId)`를 명시적으로 부를 것.
- **확장자 해석 의존** — UI 프리미티브가 동작하려면 Vite/Webpack는 `.web.tsx`, Metro는 `.native.tsx`를 우선 해석하도록 설정돼 있어야 한다. 한 파일을 잘못 이름 붙이거나 번들러 resolver 설정이 풀리면 한쪽 플랫폼이 즉시 깨진다.
- **React 18 하한선 고정** — peer가 `react >=18.0.0`. mobile이 RN 0.76 + React 18을 쓰는 한 절대 React 17 이하로 내릴 수 없다.
- **순환 의존 금지** — `@repo/shared → @repo/api-contract` 방향만 허용. 반대 방향이 생기면 `CLAUDE.md` 규칙 위반이며 빌드 그래프가 꼬인다.
- **토큰 영속화는 앱 책임** — `@repo/shared`는 `getToken` 게터만 받는다. 토큰을 어디에 어떻게 저장할지는 각 앱의 `api-setup`이 담당. shared 안에서 `localStorage`를 직접 부르면 mobile에서 터지고, `AsyncStorage`를 직접 부르면 web에서 터진다.
- **`configureApi` 호출 누락** — 앱 부팅 시점에 `configureApi({ baseUrl, getToken, onUnauthorized })`를 안 부르면 `baseUrl`이 빈 문자열이라 모든 fetch가 동일 origin으로 새는 형태로 조용히 실패한다.
- **`Button.tsx` 진입점은 현재 `.web.tsx`를 다시 export** — 공유 진입점이 사실상 web 구현을 가리키므로, 번들러가 확장자 우선순위를 올바르게 잡아야 native에서 정상 분기한다.
- **`applyCssVars`는 `HTMLElement` 인자 필요** — RN에는 `HTMLElement`가 없다. CSS 변수 헬퍼는 web 전용 코드 경로에서만 호출할 것.
- **`invalidateQueries` 키 매칭** — AI provider mutation은 `['ai', 'providers']`만 무효화한다. `['ai', 'providers', id, 'models']`는 prefix 매칭으로 함께 무효화되지만, 만약 향후 `useProviders` 키 모양을 바꾸면(예: `['ai', 'providers', { filter }]`) `useUpdateProvider`/`useDeleteProvider`의 invalidate 키도 같이 맞춰야 한다.
- **`testProvider`/`deleteProvider` 빈 body** — `aiApi.testProvider(id)`(인자 없음) 호출은 `JSON.stringify({})`를 보내지 않고 `JSON.stringify(model ? { model } : {})`로 빈 객체를 보낸다. 즉 body는 `'{}'`라 비어있지 않으므로 `Content-Type` 헤더가 합성된다. 반면 향후 인자가 정말 없는 POST를 추가할 거라면 `body`를 아예 omit해야 fastify가 받는다 (이게 `apiFetch` 변경의 핵심 포인트).

## 8. Sources [coverage: high — 31 sources]

- [packages/shared/package.json](../../packages/shared/package.json)
- [packages/shared/tsconfig.json](../../packages/shared/tsconfig.json)
- [packages/shared/src/index.ts](../../packages/shared/src/index.ts)
- [packages/shared/src/api/client.ts](../../packages/shared/src/api/client.ts)
- [packages/shared/src/api/auth.api.ts](../../packages/shared/src/api/auth.api.ts)
- [packages/shared/src/api/picks.api.ts](../../packages/shared/src/api/picks.api.ts)
- [packages/shared/src/api/admin.api.ts](../../packages/shared/src/api/admin.api.ts)
- [packages/shared/src/api/crawl.api.ts](../../packages/shared/src/api/crawl.api.ts)
- [packages/shared/src/api/restaurant.api.ts](../../packages/shared/src/api/restaurant.api.ts)
- [packages/shared/src/api/ai.api.ts](../../packages/shared/src/api/ai.api.ts)
- [packages/shared/src/hooks/useAuth.ts](../../packages/shared/src/hooks/useAuth.ts)
- [packages/shared/src/hooks/usePicks.ts](../../packages/shared/src/hooks/usePicks.ts)
- [packages/shared/src/hooks/useAdmin.ts](../../packages/shared/src/hooks/useAdmin.ts)
- [packages/shared/src/hooks/useCrawl.ts](../../packages/shared/src/hooks/useCrawl.ts)
- [packages/shared/src/hooks/useRestaurant.ts](../../packages/shared/src/hooks/useRestaurant.ts)
- [packages/shared/src/hooks/summarySseManager.ts](../../packages/shared/src/hooks/summarySseManager.ts)
- [packages/shared/src/hooks/useAi.ts](../../packages/shared/src/hooks/useAi.ts)
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
- [packages/shared/src/ui/](../../packages/shared/src/ui/) (Divider, ErrorBanner, Input, Screen, SegmentedControl, Stack, Text — 모두 동일한 `.types.ts` + `.tsx` + `.web.tsx` + `.native.tsx` 패턴)
- [CLAUDE.md](../../CLAUDE.md)
