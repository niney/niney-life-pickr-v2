---
topic: shared
last_compiled: 2026-05-07
sources_count: 24
status: active
aliases: [react-query, zustand, design-tokens, ui-primitives, "@repo/shared"]
---

# shared — FE 공통 패키지

## 1. Purpose [coverage: high — 3 sources]

`@repo/shared`는 web과 mobile에서 동시에 사용되는 프론트엔드 공통 코드를 모아둔 워크스페이스
패키지다. 책임 영역은 다음과 같다.

- 타입 안전한 fetch 래퍼와 도메인별 API 함수 (auth, picks, admin, crawl)
- TanStack Query 훅 (서버 상태)
- Zustand 인증 스토어 (클라이언트 상태)
- 디자인 토큰·테마·`ThemeProvider`·CSS 변수 변환
- 플랫폼 분기형 UI 프리미티브 (Button, Input, Stack, Text, Divider, ErrorBanner, Screen, SegmentedControl)
- 공용 상수 (`APP_NAME`, React Query staleTime/gcTime)

빌드 산출물 없이 `src/index.ts`를 그대로 노출(`"main": "./src/index.ts"`)하므로
Turborepo 컨슈머는 별도 빌드 단계 없이 TS 소스를 바로 import한다.

## 2. Architecture [coverage: high — 8 sources]

```
packages/shared/src/
├── index.ts                # barrel: 모든 하위 모듈 re-export
├── api/
│   ├── client.ts           # apiFetch + ApiError + configureApi (토큰 게터 주입)
│   ├── auth.api.ts
│   ├── picks.api.ts
│   ├── admin.api.ts
│   └── crawl.api.ts        # SSE 엔드포인트 URL 빌더 포함
├── hooks/
│   ├── useAuth.ts          # useCurrentUser, useLogin, useRegister, useLogout
│   ├── usePicks.ts         # 쿼리키 팩토리 + CRUD + useRandomPick
│   ├── useAdmin.ts
│   └── useCrawl.ts         # useCrawlJobStream (EventSource reducer)
├── stores/
│   └── authStore.ts        # Zustand: user / token / isGuest
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

각 UI 컴포넌트는 `*.types.ts`로 props 계약을 단일 소스로 두고, 플랫폼 번들러가
파일 확장자 해석으로 구현체를 골라간다 (Vite/Webpack은 `.web.tsx`, Metro는
`.native.tsx`). `tsconfig.json`은 `@repo/config/tsconfig/react.json`을 상속한다.

## 3. Talks To [coverage: high — 4 sources]

- 의존성: `@repo/api-contract` (zod 스키마/타입/`Routes` 상수), `@repo/utils`,
  `@tanstack/react-query`, `zustand`.
- peerDependencies: `react >=18.0.0`, `react-native >=0.76.0` (옵셔널).
  → web은 React 19, mobile은 React 18 + RN 0.76 양쪽을 만족한다.
- 컨슈머: `apps/web` (Vite + React 19), `apps/mobile` (RN 0.76 + React 18).
- 외부: `apiFetch`로 friendly API에 HTTP, `useCrawlJobStream`은 friendly의
  SSE 엔드포인트(`Routes.Crawl.jobEvents`)에 EventSource로 접속.

## 4. API Surface [coverage: high — 12 sources]

**API 클라이언트 (`api/`)**
- `configureApi(cfg)`, `getApiConfig()`, `apiFetch<T>(path, init)`, `ApiError`
- `authApi`: `register`, `login`, `me`, `logout`
- `picksApi`: `list`, `getById`, `create`, `update`, `remove`, `random`
- `adminApi`: `listUsers`, `setRole`
- `crawlApi`: `start`, `list`, `cancel` + `buildJobEventsUrl(jobId)` (SSE URL — `EventSource`가 헤더를 못 실으니 `?token=`으로 인증 토큰 전달)

**React Query 훅 (`hooks/`)**
- 인증: `useCurrentUser`, `useLogin`, `useRegister`, `useLogout`
- 픽: `usePicks`, `usePick`, `useCreatePick`, `useUpdatePick`, `useDeletePick`, `useRandomPick`
- 어드민: `useAdminUsers`, `useSetUserRole`
- 크롤: `useStartCrawl`, `useCrawlJobs`, `useCancelCrawl`, `useCrawlJobStream`

**Zustand 스토어 (`stores/`)**
- `useAuthStore`: `user`, `token`, `isGuest` + `setSession`, `setUser`, `enterGuest`, `clearSession`

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

## 5. Data [coverage: high — 3 sources]

**Auth 상태 모양** (`stores/authStore.ts`)
```ts
interface AuthState {
  user: User | null;        // @repo/api-contract User
  token: string | null;     // JWT bearer
  isGuest: boolean;         // 게스트 모드 진입 여부
}
```
역할(role)은 `User` 타입 안에 포함된다 (`@repo/api-contract`).

**토큰 저장**은 `@repo/shared` 책임이 아니다. 각 앱이 부팅 시 `configureApi({
baseUrl, getToken, onUnauthorized })`로 게터/콜백을 주입한다.
- web: `localStorage` 기반
- mobile: `AsyncStorage` 기반
`apiFetch`는 매 요청마다 `await config.getToken?.()`을 호출해 `Authorization:
Bearer <token>` 헤더를 합성한다. 401 응답이면 `onUnauthorized` 콜백을 발동시켜
앱이 세션 정리/리다이렉트를 수행하도록 한다.

**클라이언트 캐시**는 TanStack Query가 전적으로 관리한다. `usePicks`는
`['picks', 'list']`/`['picks', 'detail', id]` 쿼리키 팩토리를 사용하고, 변경 훅은
`invalidateQueries`로 캐시를 갱신한다. 별도 로컬 캐시는 없다.

**SSE 스트림 상태** (`useCrawlJobStream`)는 reducer로 관리하며 `seq`로 중복 이벤트를
드롭하고, `done`/`error` 종단 이벤트에서 클라이언트가 직접 `EventSource.close()`를
호출해 브라우저 자동 재연결을 막는다.

## 6. Key Decisions [coverage: high — 4 sources]

- **상태관리는 Zustand** — `CLAUDE.md`/TECH_STACK 가이드라인에 따라 Redux 대신 Zustand 채택. 인증처럼 전역 동기 상태에만 사용하고 서버 상태는 TanStack Query에 위임.
- **서버 상태는 TanStack Query** — 쿼리 무효화 패턴으로 mutation 후 캐시 갱신.
- **zod 타입 기반 fetch 래퍼** — `apiFetch`는 `ErrorResponseSchema.safeParse`로 서버 에러 형태를 검증해 일관된 `ApiError`로 변환. 요청/응답 타입은 `@repo/api-contract`에서만 정의.
- **로직은 공유, UI는 플랫폼 분리** — Tamagui 같은 통합 UI 솔루션을 도입하지 않고 (TECH_STACK 결정), 각 컴포넌트를 `.web.tsx` / `.native.tsx`로 쪼갠다. 공용 props는 `*.types.ts` 한 곳에만 두어 시그니처가 갈라지는 것을 방지.
- **빌드 없는 소스 노출** — `package.json`이 `src/index.ts`를 그대로 main/types로 가리키므로 모노레포 컨슈머는 워크스페이스 링크만으로 즉시 사용. dist 산출물 없음.
- **유연한 React peer** — `react >=18` peer로 web의 React 19와 mobile의 React 18을 동시에 만족.
- **SSE 토큰은 쿼리스트링** — `EventSource`가 커스텀 헤더를 보낼 수 없어 `?token=` 방식으로 우회 (`buildJobEventsUrl`).
- **중복 이벤트 방어** — SSE 재연결 시 서버가 `Last-Event-ID`로 리플레이하면 reducer가 `seq <= lastSeq`인 이벤트를 무시.

## 7. Gotchas [coverage: high — 4 sources]

- **확장자 해석 의존** — UI 프리미티브가 동작하려면 Vite/Webpack는 `.web.tsx`, Metro는 `.native.tsx`를 우선 해석하도록 설정돼 있어야 한다. 한 파일을 잘못 이름 붙이거나 번들러 resolver 설정이 풀리면 한쪽 플랫폼이 즉시 깨진다.
- **React 18 하한선 고정** — peer가 `react >=18.0.0`. mobile이 RN 0.76 + React 18을 쓰는 한 절대 React 17 이하로 내릴 수 없다.
- **순환 의존 금지** — `@repo/shared → @repo/api-contract` 방향만 허용. 반대 방향이 생기면 `CLAUDE.md` 규칙 위반이며 빌드 그래프가 꼬인다.
- **토큰 영속화는 앱 책임** — `@repo/shared`는 `getToken` 게터만 받는다. 토큰을 어디에 어떻게 저장할지는 각 앱의 `api-setup`이 담당. shared 안에서 `localStorage`를 직접 부르면 mobile에서 터지고, `AsyncStorage`를 직접 부르면 web에서 터진다.
- **`configureApi` 호출 누락** — 앱 부팅 시점에 `configureApi({ baseUrl, getToken, onUnauthorized })`를 안 부르면 `baseUrl`이 빈 문자열이라 모든 fetch가 동일 origin으로 새는 형태로 조용히 실패한다.
- **`Button.tsx` 진입점은 현재 `.web.tsx`를 다시 export** — 공유 진입점이 사실상 web 구현을 가리키므로, 번들러가 확장자 우선순위를 올바르게 잡아야 native에서 정상 분기한다.
- **`applyCssVars`는 `HTMLElement` 인자 필요** — RN에는 `HTMLElement`가 없다. CSS 변수 헬퍼는 web 전용 코드 경로에서만 호출할 것.

## 8. Sources [coverage: high — 24 sources]

- [packages/shared/package.json](../../packages/shared/package.json)
- [packages/shared/tsconfig.json](../../packages/shared/tsconfig.json)
- [packages/shared/src/index.ts](../../packages/shared/src/index.ts)
- [packages/shared/src/api/client.ts](../../packages/shared/src/api/client.ts)
- [packages/shared/src/api/auth.api.ts](../../packages/shared/src/api/auth.api.ts)
- [packages/shared/src/api/picks.api.ts](../../packages/shared/src/api/picks.api.ts)
- [packages/shared/src/api/admin.api.ts](../../packages/shared/src/api/admin.api.ts)
- [packages/shared/src/api/crawl.api.ts](../../packages/shared/src/api/crawl.api.ts)
- [packages/shared/src/hooks/useAuth.ts](../../packages/shared/src/hooks/useAuth.ts)
- [packages/shared/src/hooks/usePicks.ts](../../packages/shared/src/hooks/usePicks.ts)
- [packages/shared/src/hooks/useAdmin.ts](../../packages/shared/src/hooks/useAdmin.ts)
- [packages/shared/src/hooks/useCrawl.ts](../../packages/shared/src/hooks/useCrawl.ts)
- [packages/shared/src/stores/authStore.ts](../../packages/shared/src/stores/authStore.ts)
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
