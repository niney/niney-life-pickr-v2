---
topic: mobile
last_compiled: 2026-05-14
sources_count: 19
status: active
aliases: [expo, react-native, expo-router, eas, ios, android, expo-web, rn-web]
---

# mobile — Expo + React Native 앱

> 용어: 이 토픽은 **앱**(`apps/mobile`, Expo + RN)을 다룬다. "모바일"이라는 단어는 **웹**(`apps/web`)의 작은 화면 레이아웃을 가리키는 별도 개념이므로 본문에서는 항상 "앱"으로 표기 ([schema.md Terminology](../schema.md#terminology--웹--앱--모바일)).

## Purpose [coverage: high — 5 sources]

`apps/mobile/`는 일반 사용자용 Life Pickr 앱이다. "고민될 땐, 대신 골라드릴게요" — 사용자가 등록한 Pick 목록 중 하나를 랜덤으로 뽑아주는 앱 인터페이스가 핵심이다 ([login.tsx](../../apps/mobile/app/(auth)/login.tsx), [home.tsx](../../apps/mobile/app/(tabs)/home.tsx)).

App config의 표시명은 `Life Pickr`, slug `life-pickr`, 번들 ID `com.niney.lifepickr` (iOS/Android 공통) ([app.config.ts](../../apps/mobile/app.config.ts)). 게스트 모드와 이메일 가입/로그인 두 진입로를 제공하며, 게스트는 Pick 저장이 불가하다고 명시적으로 안내한다 ([home.tsx](../../apps/mobile/app/(tabs)/home.tsx), [profile.tsx](../../apps/mobile/app/(tabs)/profile.tsx)).

추가로 **관리자(ADMIN) 한정**으로 "맛집" 탭과 식당 상세 화면을 제공한다 — 등록된 식당 리스트와 메뉴 순위(SentimentBar + 글로벌 비교 + 미분류 메뉴 분류 트리거)까지를 앱에서 직접 본다 ([restaurants.tsx](../../apps/mobile/app/(tabs)/restaurants.tsx), [restaurant/[placeId].tsx](../../apps/mobile/app/restaurant/[placeId].tsx), [MenuRankingCard.tsx](../../apps/mobile/src/components/MenuRankingCard.tsx)). 매장/메뉴/리뷰 크롤·관리 같은 본격 어드민은 여전히 웹 전용이다.

## Architecture [coverage: high — 7 sources]

스택은 다음과 같다 ([package.json](../../apps/mobile/package.json), [app.config.ts](../../apps/mobile/app.config.ts)):

- **Expo SDK 52** (`expo: ~52.0.0`)
- **React Native 0.76.5** + **New Architecture 활성화** (`newArchEnabled: true`)
- **expo-router 4.0.14** — 파일 기반 라우팅 (`main: "expo-router/entry"`)
- **React 18.3.1** (RN 0.76 호환을 위한 상한선)
- **TanStack Query 5.62**, **Zustand 5**, **react-native-reanimated 3.16**, **react-native-gesture-handler 2.20**

### 라우팅 트리 (expo-router 파일 기반)

```
app/
├── _layout.tsx              ← 루트: GestureHandler + ThemeProvider + QueryClient + bootstrap
├── index.tsx                ← 토큰/게스트 상태 보고 (auth) 또는 (tabs)로 Redirect
├── (auth)/
│   ├── _layout.tsx          ← Stack, header 숨김
│   └── login.tsx            ← 로그인/회원가입 SegmentedControl + 게스트 진입
├── (tabs)/
│   ├── _layout.tsx          ← Tabs (홈 / 맛집 / 프로필)
│   ├── home.tsx             ← Pick 리스트 + 랜덤 픽
│   ├── restaurants.tsx      ← (admin) 등록 식당 리스트
│   └── profile.tsx          ← 사용자 정보 + 로그아웃
└── restaurant/
    └── [placeId].tsx        ← (admin) 식당 상세 + MenuRankingCard
```

루트 레이아웃은 비동기 `bootstrapApi()`가 끝날 때까지 `null`을 반환하여 splash를 유지하고, 준비되면 `GestureHandlerRootView` → `ThemeProvider mode="light"` → `QueryClientProvider` → `Stack` 구조로 마운트한다 ([_layout.tsx](../../apps/mobile/app/_layout.tsx)). QueryClient는 [`@repo/shared`](shared.md)의 `QUERY_STALE_TIME`/`QUERY_GC_TIME` 상수와 `retry: 1`을 사용한다.

`app.config.ts`에서 `experiments.typedRoutes: true`로 라우트 타입 안전성을 켰고, `plugins: ['expo-router']`만 명시한다.

### 맛집 / 식당 상세 화면 [coverage: high — 3 sources]

- **`(tabs)/restaurants.tsx`** — `useCurrentUser()`로 role을 확인해 `ADMIN`이 아닐 때(또는 게스트일 때)는 안내 텍스트만 그린다. ADMIN이면 `useRestaurantList()`(admin API)로 받은 `items`를 `FlatList`로 렌더하고, 각 행은 `Pressable` → `router.push(\`/restaurant/${item.placeId}\` as never)`로 상세로 이동.
- **`restaurant/[placeId].tsx`** — `useLocalSearchParams<{ placeId: string }>()`로 받은 placeId를 `useRestaurantByPlaceId(placeId)`에 넘겨 헤더(이름/카테고리/주소/리뷰 수)를 그리고, 그 아래 `<MenuRankingCard placeId={placeId} />`를 마운트한다. 화면 헤더는 `<Stack.Screen options={{ title: '맛집 상세', headerBackTitle: '뒤로' }} />`로 라우트별로 박는다.
- **`src/components/MenuRankingCard.tsx`** — `useMenuRanking(placeId, { sort, minMentions: 2 })` 결과를 받아 정렬 칩 3종(`mentions`/`positive`/`positiveRatio` → 언급순/긍정순/긍정률)을 토글하고, 상위 5개를 `Row`로 렌더한다. 각 행은 RN flex 비율 기반 `SentimentBar`(긍정 초록 / 중립 회색 / 부정 빨강), 멘션 수, 긍정률 텍스트, 그리고 `item.global.restaurantCount > 1`일 때만 "전체 N%" 글로벌 비교 라벨을 보여준다. 6번째부터는 `+N개 더`로 접고, `unmappedMenus.length > 0`이면 노란 경고 박스 + "분류하기" 버튼이 떠 `useGroupForRestaurant().mutate(placeId)`를 트리거해 [menu-grouping](menu-grouping.md) 파이프라인으로 보낸다(분류 진행 중 disabled).

분류·랭킹 로직은 앱에 없다 — 전부 [`@repo/shared`](shared.md)의 훅이 들고 있고, mutation 성공 시 invalidate도 shared 쪽이 책임진다. 앱은 sort 상태를 `useState`로 들고, 데이터 가공은 `items.slice(0, 5)`/flex 비율 계산 정도만 한다.

### Metro 모노레포 설정 [coverage: high — 1 source]

`metro.config.js`는 pnpm + workspace + 멀티 React 버전 환경에서 동작하기 위한 비표준 설정이 다수다 ([metro.config.js](../../apps/mobile/metro.config.js)):

- `watchFolders = [workspaceRoot]` — 모노레포 루트까지 감시
- `nodeModulesPaths` — 앱 로컬 + 워크스페이스 루트 + `node_modules/.pnpm/node_modules` (pnpm이 hoist한 transitive deps 위치)
- `disableHierarchicalLookup = true` + `unstable_enableSymlinks = true` + `unstable_enablePackageExports = true`
- `blockList`로 `.claude/`, `.git/`, `.turbo/`, `.expo/` 제외
- **`extraNodeModules` — react/react-dom을 앱 로컬 사본(`apps/mobile/node_modules/react`)으로 강제 alias.** 워크스페이스에 React 19(웹/shared)와 React 18(앱) 두 사본이 공존해서 같은 번들에 두 React가 섞이면 `$$typeof` Symbol 불일치로 "Objects are not valid as a React child" 가 떴다 — 단일 사본 강제로 회피
- **커스텀 `resolveRequest` — 두 가지 작업을 한다:**
  1. `@repo/*` 패키지가 `"type": "module"` + TS NodeNext 규약에 따라 `.js` 접미사로 import한 상대 경로를 실제 `.ts`/`.tsx`로 매핑
  2. **플랫폼별 확장자 우선 탐색** — `./Foo.js` → iOS면 `.ios.tsx` → `.native.tsx` → `.tsx`, web이면 `.web.tsx` → `.tsx` 순. shared의 `Comp.tsx`(`.web` 재export 셔틀)가 native에서 잘못 픽되던 버그 회피. 이 우선순위가 곧 [platform-ui-split](../concepts/platform-ui-split.md) quad 패턴의 작동 보장

Babel은 `babel-preset-expo` + `react-native-reanimated/plugin`만 사용한다 ([babel.config.js](../../apps/mobile/babel.config.js)).

### Expo Web (RN-Web 출력) [coverage: high — 1 source]

`app.config.ts`의 `web: { bundler: 'metro', output: 'single' }` — RN-Web 출력은 **SPA 모드**다 (`'static'` 정적 사전 렌더링 모드 아님). 정적 모드는 expo-router가 Node에서 `react-dom.renderToString`을 호출하는데, 루트 node_modules에 hoist된 react-dom@19 가 앱이 번들한 React 18 element를 받으면 `$$typeof` 불일치로 SSR 500 이 떴다. SPA는 브라우저에서만 렌더하므로 충돌 없음. 모바일 개발 중 브라우저 미리보기 용도라 SSR/SEO는 불요.

`pnpm dev:mobile` 실행 후 `w` 키 또는 `pnpm --filter mobile web`으로 띄운다.

## Talks To [coverage: high — 3 sources]

- **[`@repo/api-contract`](api-contract.md)** — zod 스키마/타입 (`RestaurantListItemType`, `MenuRankingItemType`, `MenuRankingSortType` 등 신규 의존)
- **[`@repo/shared`](shared.md)** — API 클라이언트 (`configureApi`), React Query 훅 (`useLogin`, `useRegister`, `useLogout`, `useCurrentUser`, `usePicks`, `useRandomPick`, `useRestaurantList`, `useRestaurantByPlaceId`, `useMenuRanking`, `useGroupForRestaurant`), Zustand 스토어 (`useAuthStore`), UI 컴포넌트 (`Screen`, `Stack`, `Text`, `Button`, `Input`, `SegmentedControl`, `Divider`, `ErrorBanner`), `ThemeProvider`, `QUERY_STALE_TIME`/`QUERY_GC_TIME` 상수
- **[`@repo/utils`](utils.md)** — 순수 유틸 (workspace dep)
- **[friendly](friendly.md) 백엔드** — `EXPO_PUBLIC_API_URL` 환경변수로 baseUrl 주입. `app.config.ts`의 `extra.apiUrl`에 `process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000'` 으로 박혀, 런타임에 `Constants.expoConfig?.extra?.apiUrl`로 읽어 `configureApi({ baseUrl })`에 전달 ([api-setup.ts](../../apps/mobile/src/lib/api-setup.ts), [.env.example](../../apps/mobile/.env.example))

## API Surface [coverage: high — 8 sources]

expo-router 파일 트리가 곧 라우트다.

| Route | File | 설명 |
|-------|------|------|
| `/` | [`app/index.tsx`](../../apps/mobile/app/index.tsx) | `useAuthStore`의 `token`/`isGuest` 보고 `/(tabs)/home` 또는 `/(auth)/login`로 Redirect |
| `/(auth)/login` | [`app/(auth)/login.tsx`](../../apps/mobile/app/(auth)/login.tsx) | 로그인/회원가입 SegmentedControl, 게스트 "바로 시작하기" 버튼 |
| `/(tabs)/home` | [`app/(tabs)/home.tsx`](../../apps/mobile/app/(tabs)/home.tsx) | `usePicks()` 리스트, 카드별 "랜덤 픽!" → `useRandomPick()` mutation, 게스트는 안내 화면 |
| `/(tabs)/restaurants` | [`app/(tabs)/restaurants.tsx`](../../apps/mobile/app/(tabs)/restaurants.tsx) | (admin) `useRestaurantList()` 결과를 FlatList로. 행 탭 → `/restaurant/:placeId`. 비-ADMIN/게스트는 안내만 |
| `/(tabs)/profile` | [`app/(tabs)/profile.tsx`](../../apps/mobile/app/(tabs)/profile.tsx) | `useCurrentUser()` 이메일 표시, `useLogout()` 버튼 |
| `/restaurant/[placeId]` | [`app/restaurant/[placeId].tsx`](../../apps/mobile/app/restaurant/[placeId].tsx) | `useRestaurantByPlaceId()` 헤더 + `<MenuRankingCard>`. `Stack.Screen` 헤더로 "뒤로" 제공 |

`(auth)`/`(tabs)`는 expo-router의 group(URL에 영향 없는 폴더). 루트 Stack에서 `headerShown: false`로 헤더를 숨기고, `(tabs)` 내부는 `Tabs` 컴포넌트가 한국어 타이틀(`홈`, `맛집`, `프로필`)을 렌더한다. `restaurant/[placeId]`는 group 바깥의 일반 stack 라우트라 자체 `Stack.Screen`으로 헤더(`title: '맛집 상세'`, `headerBackTitle: '뒤로'`)를 켠다.

## Data [coverage: high — 2 sources]

- **인증 토큰**: `@react-native-async-storage/async-storage`에 `lp:token` 키로 저장. 게스트 플래그는 `lp:guest='1'` ([api-setup.ts](../../apps/mobile/src/lib/api-setup.ts))
- **로컬 DB 없음** — SQLite/WatermelonDB 등 미사용
- **서버 상태**: TanStack Query (`@tanstack/react-query 5.62`) — staleTime/gcTime은 [`@repo/shared`](shared.md) 상수, retry 1회. 메뉴 순위/식당 리스트/식당 상세도 동일한 query client를 공유

부트스트랩 흐름 ([api-setup.ts](../../apps/mobile/src/lib/api-setup.ts)):
1. AsyncStorage에서 토큰/게스트 플래그 읽어 `useAuthStore` 초기 상태 hydrate
2. `useAuthStore.subscribe`로 토큰 변경 시 AsyncStorage write/remove 자동 동기화
3. `configureApi({ baseUrl, getToken: () => cachedToken, onUnauthorized: () => clearSession() })` 호출 — 401 응답 시 자동 로그아웃

## Key Decisions [coverage: high — 5 sources]

- **Expo (bare RN 아님)** — EAS Build/Update 사용 위해 ([eas.json](../../apps/mobile/eas.json)에 development/preview/production 3개 채널 정의, `appVersionSource: 'remote'`, production은 `autoIncrement: true`)
- **expo-router 4 파일 기반** — `react-navigation`을 직접 imperative하게 쓰지 않고 파일 트리로 표현. `experiments.typedRoutes`로 타입 안전성 확보
- **React 18.3.1 고정** — RN 0.76의 React 18 ceiling 때문. 웹은 React 19를 쓰지만 앱은 RN 0.77+가 나와야 React 19로 갈 수 있음. 워크스페이스에 두 사본이 공존하므로 Metro `extraNodeModules` 로 앱 로컬 사본 강제 (Gotchas 참조)
- **Expo Web은 SPA 모드** — `web.output: 'single'`. 정적 사전렌더는 React 버전 충돌로 SSR 500 → SPA로 떨어뜨려 브라우저에서만 렌더 (Architecture › Expo Web 참조)
- **New Architecture 활성화** — `newArchEnabled: true` (Fabric/TurboModules)
- **본격 어드민은 웹 전용, 앱은 ADMIN read-only 보기만** — `useRestaurantList`는 admin API라 비-ADMIN/게스트는 화면 자체에서 차단(안내 텍스트). 매장 등록·리뷰 크롤·요약 트리거 같은 쓰기 액션은 웹에 둔다. 단 `MenuRankingCard`의 "분류하기" 버튼만은 예외로 mutation을 직접 호출 — 분류 결과 자체는 사용자에게 즉시 보이는 UX라 앱에서 트리거할 가치가 있음
- **메뉴 순위 비즈니스 로직은 [`@repo/shared`](shared.md)에, UI 비율 계산만 앱에** — 정렬/필터(`minMentions: 2`)/그룹핑/[menu-grouping](menu-grouping.md) invalidate는 shared 훅이, RN flex 비율(`pos`/`neu`/`100 - pos - neu`)과 sort 상태 `useState`만 앱에. 웹의 메뉴 순위 카드와 동일한 데이터 모델을 RN UI로 다시 그리는 구조
- **공통 로직은 `@repo/shared`, UI는 플랫폼별** — 훅·스토어는 공유하지만, `home.tsx`/`profile.tsx`/`restaurants.tsx`/`MenuRankingCard.tsx`는 `react-native`의 `View`/`Text`/`FlatList`/`Pressable`/`StyleSheet`를 직접 사용. `login.tsx`만 `@repo/shared`의 RN 호환 컴포넌트(`Screen`, `Button`, `Input` 등)를 사용
- **앱은 light only** — `ThemeProvider mode="light"` 고정. 웹/admin은 다크 모드 토글이 있지만 앱은 미적용이라 `MenuRankingCard` 등도 단순 inline 컬러(`#1e293b`/`#10b981`/`#ef4444`/`#fef3c7` 등)로 박혀 있음
- **게스트 우선 진입** — 로그인 화면 최상단의 "바로 시작하기 →" 버튼이 가장 큰 primary CTA, 로그인/회원가입은 그 아래 ([login.tsx](../../apps/mobile/app/(auth)/login.tsx))

## Gotchas [coverage: high — 6 sources]

- **typedRoutes는 첫 빌드 전엔 stale** — `experiments.typedRoutes: true`라도 `.expo/types/router.d.ts`가 갱신돼야 새 라우트(`/restaurant/[placeId]`)를 인식. typecheck-only 환경에서는 `router.push(\`/restaurant/${item.placeId}\` as never)`처럼 캐스트해 두고, `expo start` 한 번 돌면 자동 갱신된다 ([restaurants.tsx](../../apps/mobile/app/(tabs)/restaurants.tsx))
- **맛집 탭/상세는 admin 전용** — `useRestaurantList`가 admin API에 매여 있어, 비-ADMIN/게스트는 `restaurants.tsx`의 분기로 빈 안내만 본다. 탭 자체는 모두에게 보이는 점이 의도됨(가입 유도) — 라우트 가드는 화면 안에서만 처리
- **`MenuRankingCard`는 분류 mutation 진행 중 버튼 disabled만 처리** — pending 시 `groupMutation.isPending` → "분류 중…" 텍스트 + opacity 0.6. 실패 시 별도 토스트/에러 UI 없음. shared 훅의 invalidate에 의존
- **flex 비율 sentiment bar — total이 0이면 모두 0** — `pos`/`neu` 모두 0이 되어 마지막 세그먼트(`100 - pos - neu = 100`)가 통째로 빨강이 된다. `totalMentions === 0`일 땐 카드 자체가 "분석된 메뉴 멘션이 아직 없습니다"로 빠지지만, 개별 행 단위 total 0인 상태가 도달 가능한지는 ranking 훅의 minMentions 보장에 의존
- **글로벌 비교 라벨은 `restaurantCount > 1`일 때만** — 같은 메뉴가 여러 가게에서 잡혀야 의미가 있어, 단일 가게에서만 등장한 메뉴는 "전체 N%" 라벨이 아예 안 뜬다 ([MenuRankingCard.tsx](../../apps/mobile/src/components/MenuRankingCard.tsx))
- **Metro 모노레포 설정 필수** — `watchFolders`, `disableHierarchicalLookup`, `unstable_enableSymlinks`, `unstable_enablePackageExports`, `nodeModulesPaths`에 `.pnpm/node_modules` 포함, `.js` → `.ts/.tsx` 매핑 커스텀 resolver, 플랫폼 우선 확장자 탐색, react/react-dom alias 가 모두 한 묶음. 하나만 빠져도 pnpm 심볼릭 링크 / `@repo/*` workspace dep / 플랫폼 분기 / 단일 React 사본 중 무엇 하나가 깨진다 ([metro.config.js](../../apps/mobile/metro.config.js))
- **shared `Comp.tsx` 셔틀은 native에서 잘못 픽되기 쉽다** — `Button.tsx`처럼 `.web.tsx`만 재export하는 셔틀이 있을 때, Metro resolver가 플랫폼별 확장자(`.ios.tsx`/`.native.tsx`/`.web.tsx`)를 먼저 시도하지 않으면 native에서도 셔틀(=`.web` 구현)이 선택돼 RN 런타임에서 `h1` Invariant 같은 에러로 표면화. 새 UI 프리미티브 추가 시 quad 4-file 패턴(`.types.ts` + `.tsx` + `.web.tsx` + `.native.tsx`)을 반드시 지킬 것
- **`EXPO_PUBLIC_API_URL`은 빌드 타임에 박힌다** — `app.config.ts`에서 `process.env`를 읽어 `extra.apiUrl`로 굳히고, 런타임은 `Constants.expoConfig?.extra?.apiUrl`만 본다. URL 바꾸려면 dev 서버/EAS 재빌드 필요
- **React 18 vs 웹 React 19 불일치는 의도적이지만 같은 번들엔 한 사본만 — `extraNodeModules` 필수** — RN 0.76의 ceiling. `@repo/shared`는 양쪽 React 버전과 호환되도록 peer dep로 처리. Metro가 alias 없으면 `packages/shared/node_modules/react@19` 가 새어 들어와 `$$typeof` 불일치
- **Expo Web 정적 모드(`output: 'static'`) 는 워크스페이스 React 두 사본 환경에서 SSR 500** — expo-router 의 `renderToString` 이 Node 의 hoist 된 react-dom@19 로 React 18 element 를 렌더하다 깨진다. `output: 'single'` SPA 가 현재 상태. 정적 export 가 필요해지면 react/react-dom 을 워크스페이스 전역 단일 버전으로 정렬해야 함
- **루트 layout이 `bootstrapApi` 끝날 때까지 `null` 반환** — splash 뒤에 흰 화면이 잠깐 보이지 않게 하려면 `expo-splash-screen`의 hide 타이밍을 이 ready 시점과 맞춰야 함 (현재 코드에는 명시적 SplashScreen.hideAsync 호출 없음 — Expo 기본 동작에 의존)
- **Pick 목록은 `usePicks()` Query, 결과는 로컬 `useState`** — 랜덤 픽 결과(`result`)는 query 캐시가 아니라 컴포넌트 state라 화면 이동 시 사라짐 ([home.tsx](../../apps/mobile/app/(tabs)/home.tsx))
- **`noUncheckedIndexedAccess: true`** — tsconfig에서 켜져 있어 배열/객체 인덱스 접근이 `T | undefined`로 좁혀진다 ([tsconfig.json](../../apps/mobile/tsconfig.json))

## Sources [coverage: high — 19 sources]

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
- [apps/mobile/app/(tabs)/restaurants.tsx](../../apps/mobile/app/(tabs)/restaurants.tsx)
- [apps/mobile/app/(tabs)/profile.tsx](../../apps/mobile/app/(tabs)/profile.tsx)
- [apps/mobile/app/restaurant/[placeId].tsx](../../apps/mobile/app/restaurant/[placeId].tsx)
- [apps/mobile/src/components/MenuRankingCard.tsx](../../apps/mobile/src/components/MenuRankingCard.tsx)
- [apps/mobile/src/lib/api-setup.ts](../../apps/mobile/src/lib/api-setup.ts)
- [packages/shared/src/hooks (useRestaurantList, useRestaurantByPlaceId, useMenuRanking, useGroupForRestaurant)](../../packages/shared/src/hooks)
