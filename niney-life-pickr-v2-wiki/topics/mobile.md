---
topic: mobile
last_compiled: 2026-05-07
sources_count: 15
status: active
aliases: [expo, react-native, expo-router, eas, ios, android]
---

# mobile — Expo + React Native 앱

## Purpose [coverage: high — 4 sources]

`apps/mobile/`는 일반 사용자용 Life Pickr 앱이다. "고민될 땐, 대신 골라드릴게요" — 사용자가 등록한 Pick 목록 중 하나를 랜덤으로 뽑아주는 모바일 인터페이스가 핵심이다 ([login.tsx](../../apps/mobile/app/(auth)/login.tsx), [home.tsx](../../apps/mobile/app/(tabs)/home.tsx)).

App config의 표시명은 `Life Pickr`, slug `life-pickr`, 번들 ID `com.niney.lifepickr` (iOS/Android 공통) ([app.config.ts](../../apps/mobile/app.config.ts)). 게스트 모드와 이메일 가입/로그인 두 진입로를 제공하며, 게스트는 Pick 저장이 불가하다고 명시적으로 안내한다 ([home.tsx](../../apps/mobile/app/(tabs)/home.tsx), [profile.tsx](../../apps/mobile/app/(tabs)/profile.tsx)).

**관리자 UI는 의도적으로 모바일에 없다** — 어드민(매장/메뉴/리뷰 크롤 등)은 web 전용이다.

## Architecture [coverage: high — 6 sources]

스택은 다음과 같다 ([package.json](../../apps/mobile/package.json), [app.config.ts](../../apps/mobile/app.config.ts)):

- **Expo SDK 52** (`expo: ~52.0.0`)
- **React Native 0.76.5** + **New Architecture 활성화** (`newArchEnabled: true`)
- **expo-router 4.0.14** — 파일 기반 라우팅 (`main: "expo-router/entry"`)
- **React 18.3.1** (RN 0.76 호환을 위한 상한선)
- **TanStack Query 5.62**, **Zustand 5**, **react-native-reanimated 3.16**, **react-native-gesture-handler 2.20**

### 라우팅 트리 (expo-router 파일 기반)

```
app/
├── _layout.tsx          ← 루트: GestureHandler + ThemeProvider + QueryClient + bootstrap
├── index.tsx            ← 토큰/게스트 상태 보고 (auth) 또는 (tabs)로 Redirect
├── (auth)/
│   ├── _layout.tsx      ← Stack, header 숨김
│   └── login.tsx        ← 로그인/회원가입 SegmentedControl + 게스트 진입
└── (tabs)/
    ├── _layout.tsx      ← Tabs (홈/프로필)
    ├── home.tsx         ← Pick 리스트 + 랜덤 픽
    └── profile.tsx      ← 사용자 정보 + 로그아웃
```

루트 레이아웃은 비동기 `bootstrapApi()`가 끝날 때까지 `null`을 반환하여 splash를 유지하고, 준비되면 `GestureHandlerRootView` → `ThemeProvider mode="light"` → `QueryClientProvider` → `Stack` 구조로 마운트한다 ([_layout.tsx](../../apps/mobile/app/_layout.tsx)). QueryClient는 `@repo/shared`의 `QUERY_STALE_TIME`/`QUERY_GC_TIME` 상수와 `retry: 1`을 사용한다.

`app.config.ts`에서 `experiments.typedRoutes: true`로 라우트 타입 안전성을 켰고, `plugins: ['expo-router']`만 명시한다.

### Metro 모노레포 설정

`metro.config.js`는 pnpm + workspace를 위한 비표준 설정이 다수다 ([metro.config.js](../../apps/mobile/metro.config.js)):

- `watchFolders = [workspaceRoot]` — 모노레포 루트까지 감시
- `nodeModulesPaths` — 앱 로컬 + 워크스페이스 루트 + `node_modules/.pnpm/node_modules` (pnpm이 hoist한 transitive deps 위치)
- `disableHierarchicalLookup = true` + `unstable_enableSymlinks = true` + `unstable_enablePackageExports = true`
- `blockList`로 `.claude/`, `.git/`, `.turbo/`, `.expo/` 제외
- 커스텀 `resolveRequest` — `@repo/*` 패키지가 `"type": "module"` + TS NodeNext 규약에 따라 `.js` 접미사로 import한 상대경로를 실제 `.ts`/`.tsx` 소스로 매핑

Babel은 `babel-preset-expo` + `react-native-reanimated/plugin`만 사용한다 ([babel.config.js](../../apps/mobile/babel.config.js)).

## Talks To [coverage: high — 3 sources]

- **[`@repo/api-contract`](api-contract.md)** — zod 스키마/타입 (workspace dep)
- **[`@repo/shared`](shared.md)** — API 클라이언트 (`configureApi`), React Query 훅 (`useLogin`, `useRegister`, `useLogout`, `useCurrentUser`, `usePicks`, `useRandomPick`), Zustand 스토어 (`useAuthStore`), UI 컴포넌트 (`Screen`, `Stack`, `Text`, `Button`, `Input`, `SegmentedControl`, `Divider`, `ErrorBanner`), `ThemeProvider`, `QUERY_STALE_TIME`/`QUERY_GC_TIME` 상수
- **[`@repo/utils`](utils.md)** — 순수 유틸 (workspace dep)
- **[friendly](friendly.md) 백엔드** — `EXPO_PUBLIC_API_URL` 환경변수로 baseUrl 주입. `app.config.ts`의 `extra.apiUrl`에 `process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000'` 으로 박혀, 런타임에 `Constants.expoConfig?.extra?.apiUrl`로 읽어 `configureApi({ baseUrl })`에 전달 ([api-setup.ts](../../apps/mobile/src/lib/api-setup.ts), [.env.example](../../apps/mobile/.env.example))

## API Surface [coverage: high — 6 sources]

expo-router 파일 트리가 곧 라우트다.

| Route | File | 설명 |
|-------|------|------|
| `/` | [`app/index.tsx`](../../apps/mobile/app/index.tsx) | `useAuthStore`의 `token`/`isGuest` 보고 `/(tabs)/home` 또는 `/(auth)/login`로 Redirect |
| `/(auth)/login` | [`app/(auth)/login.tsx`](../../apps/mobile/app/(auth)/login.tsx) | 로그인/회원가입 SegmentedControl, 게스트 "바로 시작하기" 버튼 |
| `/(tabs)/home` | [`app/(tabs)/home.tsx`](../../apps/mobile/app/(tabs)/home.tsx) | `usePicks()` 리스트, 카드별 "랜덤 픽!" → `useRandomPick()` mutation, 게스트는 안내 화면 |
| `/(tabs)/profile` | [`app/(tabs)/profile.tsx`](../../apps/mobile/app/(tabs)/profile.tsx) | `useCurrentUser()` 이메일 표시, `useLogout()` 버튼 |

`(auth)`/`(tabs)`는 expo-router의 group(URL에 영향 없는 폴더). 루트 Stack에서 `headerShown: false`로 헤더를 숨기고, `(tabs)` 내부는 `Tabs` 컴포넌트가 한국어 타이틀(`홈`, `프로필`)을 렌더한다.

## Data [coverage: high — 2 sources]

- **인증 토큰**: `@react-native-async-storage/async-storage`에 `lp:token` 키로 저장. 게스트 플래그는 `lp:guest='1'` ([api-setup.ts](../../apps/mobile/src/lib/api-setup.ts))
- **로컬 DB 없음** — SQLite/WatermelonDB 등 미사용
- **서버 상태**: TanStack Query (`@tanstack/react-query 5.62`) — staleTime/gcTime은 `@repo/shared` 상수, retry 1회

부트스트랩 흐름 ([api-setup.ts](../../apps/mobile/src/lib/api-setup.ts)):
1. AsyncStorage에서 토큰/게스트 플래그 읽어 `useAuthStore` 초기 상태 hydrate
2. `useAuthStore.subscribe`로 토큰 변경 시 AsyncStorage write/remove 자동 동기화
3. `configureApi({ baseUrl, getToken: () => cachedToken, onUnauthorized: () => clearSession() })` 호출 — 401 응답 시 자동 로그아웃

## Key Decisions [coverage: high — 4 sources]

- **Expo (bare RN 아님)** — EAS Build/Update 사용 위해 ([eas.json](../../apps/mobile/eas.json)에 development/preview/production 3개 채널 정의, `appVersionSource: 'remote'`, production은 `autoIncrement: true`)
- **expo-router 4 파일 기반** — `react-navigation`을 직접 imperative하게 쓰지 않고 파일 트리로 표현. `experiments.typedRoutes`로 타입 안전성 확보
- **React 18.3.1 고정** — RN 0.76의 React 18 ceiling 때문. web은 React 19를 쓰지만 모바일은 RN 0.77+가 나와야 React 19로 갈 수 있음
- **New Architecture 활성화** — `newArchEnabled: true` (Fabric/TurboModules)
- **관리자 UI는 web 전용** — 모바일은 사용자 기능만. 매장/메뉴/리뷰 크롤 어드민은 web에 존재
- **공통 로직은 `@repo/shared`, UI는 플랫폼별** — `useLogin`/`useRandomPick`/`useAuthStore` 같은 훅·스토어는 공유하지만, `home.tsx`/`profile.tsx`는 `react-native`의 `View`/`Text`/`FlatList`/`StyleSheet`를 직접 사용. 단 `login.tsx`는 `@repo/shared`의 RN 호환 컴포넌트(`Screen`, `Button`, `Input` 등)를 사용
- **게스트 우선 진입** — 로그인 화면 최상단의 "바로 시작하기 →" 버튼이 가장 큰 primary CTA, 로그인/회원가입은 그 아래 ([login.tsx](../../apps/mobile/app/(auth)/login.tsx))

## Gotchas [coverage: high — 4 sources]

- **Metro 모노레포 설정 필수** — `watchFolders`, `disableHierarchicalLookup`, `unstable_enableSymlinks`, `unstable_enablePackageExports`, `nodeModulesPaths`에 `.pnpm/node_modules` 포함, 그리고 `.js` → `.ts/.tsx` 매핑 커스텀 resolver 가 모두 빠지면 pnpm 심볼릭 링크 + `@repo/*` workspace deps가 깨진다 ([metro.config.js](../../apps/mobile/metro.config.js))
- **`EXPO_PUBLIC_API_URL`은 빌드 타임에 박힌다** — `app.config.ts`에서 `process.env`를 읽어 `extra.apiUrl`로 굳히고, 런타임은 `Constants.expoConfig?.extra?.apiUrl`만 본다. URL 바꾸려면 dev 서버/EAS 재빌드 필요
- **React 18 vs web React 19 불일치는 의도적** — RN 0.76의 ceiling. `@repo/shared`는 양쪽 React 버전과 호환되도록 peer dep로 처리되어 있어야 함
- **루트 layout이 `bootstrapApi` 끝날 때까지 `null` 반환** — splash 뒤에 흰 화면이 잠깐 보이지 않게 하려면 `expo-splash-screen`의 hide 타이밍을 이 ready 시점과 맞춰야 함 (현재 코드에는 명시적 SplashScreen.hideAsync 호출 없음 — Expo 기본 동작에 의존)
- **Pick 목록은 `usePicks()` Query, 결과는 로컬 `useState`** — 랜덤 픽 결과(`result`)는 query 캐시가 아니라 컴포넌트 state라 화면 이동 시 사라짐 ([home.tsx](../../apps/mobile/app/(tabs)/home.tsx))
- **`noUncheckedIndexedAccess: true`** — tsconfig에서 켜져 있어 배열/객체 인덱스 접근이 `T | undefined`로 좁혀진다 ([tsconfig.json](../../apps/mobile/tsconfig.json))

## Sources [coverage: high — 15 sources]

- [apps/mobile/package.json](../../apps/mobile/package.json)
- [apps/mobile/app.config.ts](../../apps/mobile/app.config.ts)
- [apps/mobile/metro.config.js](../../apps/mobile/metro.config.js)
- [apps/mobile/babel.config.js](../../apps/mobile/babel.config.js)
- [apps/mobile/eas.json](../../apps/mobile/eas.json)
- [apps/mobile/tsconfig.json](../../apps/mobile/tsconfig.json)
- [apps/mobile/.env.example](../../apps/mobile/.env.example)
- [apps/mobile/app/_layout.tsx](../../apps/mobile/app/_layout.tsx)
- [apps/mobile/app/index.tsx](../../apps/mobile/app/index.tsx)
- [apps/mobile/app/(auth)/_layout.tsx](../../apps/mobile/app/(auth)/_layout.tsx)
- [apps/mobile/app/(auth)/login.tsx](../../apps/mobile/app/(auth)/login.tsx)
- [apps/mobile/app/(tabs)/_layout.tsx](../../apps/mobile/app/(tabs)/_layout.tsx)
- [apps/mobile/app/(tabs)/home.tsx](../../apps/mobile/app/(tabs)/home.tsx)
- [apps/mobile/app/(tabs)/profile.tsx](../../apps/mobile/app/(tabs)/profile.tsx)
- [apps/mobile/src/lib/api-setup.ts](../../apps/mobile/src/lib/api-setup.ts)
