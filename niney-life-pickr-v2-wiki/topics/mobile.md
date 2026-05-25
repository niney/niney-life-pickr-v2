---
topic: mobile
last_compiled: 2026-05-25
sources_count: 22
status: active
aliases: [expo, react-native, expo-router, eas, ios, android, expo-web, rn-web, native-tabs, dev-client, webview-map, vworld-html, r8-minify, swift-concurrency-plugin, restaurants-tab, bottom-sheet-detail, scroll-snap-hero, notch-fade, marker-fly-zoom, reanimated-worklet, production-build, env-production, release-build, eas-env]
---

# mobile — Expo + React Native 앱

**2026-05-25 변경 흡수 — 운영 빌드 가이드 + .env.production 자동 로드 + MenuGrid 반응형 컬럼 + map 카테고리 아이콘 흡수.** 운영용 API URL(`https://nlpp.easypcb.co.kr`)을 production 모드에서 자동으로 박기 위해 [.env.production](../../apps/mobile/.env.production) 을 Git 에 포함했고, Release/EAS/실기기 빌드 절차를 별도 문서 [docs/production-build.md](../../apps/mobile/docs/production-build.md) 로 분리. WebMap 컴포넌트군은 [map.md](map.md) 가 다루는 카테고리 아이콘 8종 + variant 통합을 흡수했다.

**2026-05-14 ~ 2026-05-19 대규모 리빌드** — apps/mobile 가 사실상 새 앱으로 재구성. 다섯 큰 줄기:

1. **네이티브 탭바 + dev client 워크플로 전환** — `expo-router` 의 네이티브 `(tabs)` 그룹 도입 ([app/(tabs)/_layout.tsx](../../apps/mobile/app/(tabs)/_layout.tsx)). Expo Go 가 아니라 dev client 가 기본 — `dev:mobile` 이 cocoapods/gradle 자동 동기화 + `expo run:ios/android`. `EXPO_PUBLIC_API_URL` 을 `process.env` 에서 직접 읽기 (이전엔 Constants 경유 — bare 환경에서 비어버림).
2. **맛집 탭 통합 UX (네이버 지도 스타일)** — [app/(tabs)/restaurants.tsx](../../apps/mobile/app/(tabs)/restaurants.tsx) 가 풀스크린 WebView 지도 + 바텀시트 + 상세 in-sheet 단일 트리. 시트 안에 list/detail 두 시트가 적층 (`list/detail 2-sheet stack` — list 스크롤 위치 복구 패턴). 신규 컴포넌트 12+ 종: [PublicRestaurantsWebMap.native.tsx](../../apps/mobile/src/components/PublicRestaurantsWebMap.native.tsx) + [.web.tsx](../../apps/mobile/src/components/PublicRestaurantsWebMap.web.tsx) — 네이티브는 WebView 안에 [publicRestaurantsMapHtml.ts](../../apps/mobile/src/components/publicRestaurantsMapHtml.ts) 의 인라인 HTML(vworld + OpenLayers) 주입, Expo Web 은 web 컴포넌트 그대로. 마커는 카테고리별 라인 아이콘 8종 + primary/muted variant ([map.md](map.md) 참조). [RestaurantsFloatingHeader](../../apps/mobile/src/components/RestaurantsFloatingHeader.tsx) + [PublicRestaurantCard](../../apps/mobile/src/components/PublicRestaurantCard.tsx) + [NotchFade](../../apps/mobile/src/components/NotchFade.tsx) (상단 노치 페이드). 상세는 [restaurantDetail/](../../apps/mobile/src/components/restaurantDetail/) 디렉터리에 `HomeTab`/`InfoTab`/`PhotosTab`/`ReviewsTab` + `Lightbox` + `shared/MenuGrid`/`ReviewCard`. Hero scroll snap + 탭 전환 시 snap 위치 유지 — 헤더는 스크롤러 밖으로 분리.
3. **위치 기반 첫 진입** — [useUserLocationNative.ts](../../apps/mobile/src/hooks/useUserLocationNative.ts) 가 `expo-location` 으로 권한 요청 + `enableHighAccuracy:false` 좌표 → `@repo/utils` 의 `computeBboxAround(coords, 1.5km)` 로 자동 fly. "내 위치" 버튼 + 한국 밖이면 `isInKorea` 폴백. 웹 페어 [useUserLocation](../../packages/shared/src/hooks/useUserLocation.ts) 와 디자인 동형(브라우저 navigator vs expo-location).
4. **마커 fly + zoom + Reanimated 워클릿 폭주 fix** — 리스트 선택 시 지도 자동 fly + zoom in, 비선택 dot + 선택 핀 + 라벨 항상 표시 ([fc02964](https://github.com/niney/niney-life-pickr-v2/commit/fc02964)). bbox 자동 계산이 매 렌더 워클릿 폭주를 일으켜 selection 채널을 marker 채널과 분리.
5. **빌드/플랫폼 최적화** — [plugins/with-android-minify.js](../../apps/mobile/plugins/with-android-minify.js) — Android release R8 minify + 리소스 shrink 강제. [plugins/with-swift-concurrency-fix.js](../../apps/mobile/plugins/with-swift-concurrency-fix.js) — Xcode 26 + RN 0.81 호환 Swift 5 강제 config plugin. Metro 콜드 스타트·이미지 렌더링 최적화 3종. 홈 새로고침 표시 안정화. 로그인/프로필 화면 디자인 — 홈/맛집과 동일한 safe-area 패턴.

> 용어: 이 토픽은 **앱**(`apps/mobile`, Expo + RN)을 다룬다. "모바일"이라는 단어는 **웹**(`apps/web`)의 작은 화면 레이아웃을 가리키는 별도 개념이므로 본문에서는 항상 "앱"으로 표기 ([schema.md Terminology](../schema.md#terminology--웹--앱--모바일)).

## Purpose [coverage: high — 5 sources]

`apps/mobile/`는 일반 사용자용 Life Pickr 앱이다. "고민될 땐, 대신 골라드릴게요" — 사용자가 등록한 Pick 목록 중 하나를 랜덤으로 뽑아주는 앱 인터페이스가 핵심이다 ([login.tsx](../../apps/mobile/app/(auth)/login.tsx), [home.tsx](../../apps/mobile/app/(tabs)/home.tsx)).

App config의 표시명은 `Life Pickr`, slug `life-pickr`, 번들 ID `com.niney.lifepickr` (iOS/Android 공통) ([app.config.ts](../../apps/mobile/app.config.ts)). 게스트 모드와 이메일 가입/로그인 두 진입로를 제공하며, 게스트는 Pick 저장이 불가하다고 명시적으로 안내한다 ([home.tsx](../../apps/mobile/app/(tabs)/home.tsx), [profile.tsx](../../apps/mobile/app/(tabs)/profile.tsx)).

추가로 **공개 "맛집" 탭** ([restaurants.tsx](../../apps/mobile/app/(tabs)/restaurants.tsx)) 이 풀스크린 WebView 지도 + 바텀시트로 위치 기반 식당 검색을 제공하고, ADMIN 한정으로 식당 상세 메뉴 순위(SentimentBar + 글로벌 비교 + 미분류 메뉴 분류 트리거) 화면도 노출 ([restaurant/[placeId].tsx](../../apps/mobile/app/restaurant/[placeId].tsx), [MenuRankingCard.tsx](../../apps/mobile/src/components/MenuRankingCard.tsx)). 매장/메뉴/리뷰 크롤·관리 같은 본격 어드민은 여전히 웹 전용이다. 정산 도메인은 모바일에 아직 없음 — 웹만 (참고: [settlement.md](settlement.md)).

## Architecture [coverage: high — 8 sources]

스택은 다음과 같다 ([package.json](../../apps/mobile/package.json), [app.config.ts](../../apps/mobile/app.config.ts)):

- **Expo SDK 54** (`expo: ~54.0.34`)
- **React Native 0.81.5** + **New Architecture 활성화** (`newArchEnabled: true`)
- **expo-router 6.0.23** — 파일 기반 라우팅 (`main: "expo-router/entry"`)
- **React 19.1.0** (RN 0.81 부터 React 19 ceiling 해제)
- **TanStack Query 5.62**, **Zustand 5**, **react-native-reanimated 4.1.7**, **react-native-gesture-handler 2.28**
- **react-native-bottom-tabs 1.2** — 네이티브 탭바
- **expo-image / expo-location / expo-glass-effect / expo-linear-gradient / @gorhom/bottom-sheet 5.2** 등
- **react-compiler 1.0** 활성화 (`experiments.reactCompiler: true` + `babel-plugin-react-compiler`)

### 환경변수 / API URL 해상도 [coverage: high — 3 sources]

API URL 은 [api-setup.ts](../../apps/mobile/src/lib/api-setup.ts) 의 `resolveApiUrl()` 이 다음 우선순위로 결정:

1. **`process.env.EXPO_PUBLIC_API_URL`** — Metro 가 빌드 시 인라인. Expo 가 모드별로 자동 로드하는 dotenv 파일에서 채워진다. dev 는 `.env`/`.env.local`/`.env.development`, production (release 빌드 / `expo export` / EAS production) 은 **`.env.production`** ([.env.production](../../apps/mobile/.env.production) — `EXPO_PUBLIC_API_URL=https://nlpp.easypcb.co.kr`).
2. **Metro dev 서버 호스트** — `getDevServer().url` 의 호스트(디바이스면 Mac LAN IP) 에 `:3000` 붙임. dev client / bare 진입로.
3. **localhost:3000** — 마지막 폴백 (시뮬레이터/Expo Web).

`app.config.ts` 는 더 이상 `extra.apiUrl` 로 굳히지 않는다 — `process.env` 직접 읽는 경로가 dev client 캐시 / manifest stale 에 덜 민감하기 때문 ([app.config.ts](../../apps/mobile/app.config.ts) 주석).

운영 빌드 절차는 별도 문서 [docs/production-build.md](../../apps/mobile/docs/production-build.md) 가 다룬다 — 로컬 Release (시뮬레이터/실기기), EAS Build (preview/production), `eas env` 등록, `expo export` 번들 추출, 트러블슈팅까지.

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
│   ├── restaurants.tsx      ← 공개 맛집 — 지도 + 바텀시트(list/detail 2-sheet)
│   └── profile.tsx          ← 사용자 정보 + 로그아웃
└── restaurant/
    └── [placeId].tsx        ← (admin) 식당 상세 + MenuRankingCard
```

루트 레이아웃은 비동기 `bootstrapApi()`가 끝날 때까지 `null`을 반환하여 splash를 유지하고, 준비되면 `GestureHandlerRootView` → `ThemeProvider mode="light"` → `QueryClientProvider` → `Stack` 구조로 마운트한다 ([_layout.tsx](../../apps/mobile/app/_layout.tsx)). QueryClient는 [`@repo/shared`](shared.md)의 `QUERY_STALE_TIME`/`QUERY_GC_TIME` 상수와 `retry: 1`을 사용한다.

`app.config.ts`에서 `experiments.typedRoutes: true` + `experiments.reactCompiler: true` 활성. plugins 는 `expo-router`, `expo-font`, `react-native-bottom-tabs`, `expo-location` (`locationWhenInUsePermission` 메시지 인라인), 그리고 로컬 config plugin 2종 (`./plugins/with-swift-concurrency-fix`, `./plugins/with-android-minify`).

### 맛집 / 식당 상세 화면 [coverage: high — 4 sources]

- **`(tabs)/restaurants.tsx`** — 풀스크린 WebView 지도 + `@gorhom/bottom-sheet` 2개 적층(list / detail). list 시트는 항상 mount, detail 시트는 `placeId` 가 truthy 일 때만 conditional mount. snap=`['20%', '50%', '100%']`, `topInset` 으로 검색 floating 카드 아래에서 시작. Android 하드웨어 백 가로채서 list 복귀. 첫 진입 시 [useUserLocationNative](../../apps/mobile/src/hooks/useUserLocationNative.ts) 로 권한 해결 후 사용자 좌표(한국 안) 또는 서울 폴백 ±1.5km bbox 자동 적용.
- **`restaurant/[placeId].tsx`** — admin 한정 메뉴 순위 상세. `useLocalSearchParams<{ placeId: string }>()`로 받은 placeId를 `useRestaurantByPlaceId(placeId)`에 넘겨 헤더(이름/카테고리/주소/리뷰 수)를 그리고, 그 아래 `<MenuRankingCard placeId={placeId} />`를 마운트한다. 화면 헤더는 `<Stack.Screen options={{ title: '맛집 상세', headerBackTitle: '뒤로' }} />`로 라우트별로 박는다.
- **`src/components/restaurantDetail/`** — 공개 맛집 상세 in-sheet 트리. `HomeTab`/`InfoTab`/`PhotosTab`/`ReviewsTab` + `Lightbox` + `shared/MenuGrid`/`ReviewCard`. [MenuGrid.tsx](../../apps/mobile/src/components/restaurantDetail/shared/MenuGrid.tsx) 는 행 단위 카드 (썸네일 + 이름 + 추천 배지 + 가격(`formatWonPrice`) + 설명 + insights 멘션 통계 `+pos/-neg · N회 언급`) — `flexDirection: 'row'` 단일 컬럼 리스트 (반응형 컬럼 조정 흡수).
- **`src/components/MenuRankingCard.tsx`** — `useMenuRanking(placeId, { sort, minMentions: 2 })` 결과를 받아 정렬 칩 3종(`mentions`/`positive`/`positiveRatio` → 언급순/긍정순/긍정률)을 토글하고, 상위 5개를 `Row`로 렌더한다. 각 행은 RN flex 비율 기반 `SentimentBar`(긍정 초록 / 중립 회색 / 부정 빨강), 멘션 수, 긍정률 텍스트, 그리고 `item.global.restaurantCount > 1`일 때만 "전체 N%" 글로벌 비교 라벨을 보여준다. 6번째부터는 `+N개 더`로 접고, `unmappedMenus.length > 0`이면 노란 경고 박스 + "분류하기" 버튼이 떠 `useGroupForRestaurant().mutate(placeId)`를 트리거해 [menu-grouping](menu-grouping.md) 파이프라인으로 보낸다(분류 진행 중 disabled).

분류·랭킹 로직은 앱에 없다 — 전부 [`@repo/shared`](shared.md)의 훅이 들고 있고, mutation 성공 시 invalidate도 shared 쪽이 책임진다. 앱은 sort 상태를 `useState`로 들고, 데이터 가공은 `items.slice(0, 5)`/flex 비율 계산 정도만 한다.

### Metro 모노레포 설정 [coverage: high — 1 source]

`metro.config.js`는 pnpm + workspace 환경에서 동작하기 위한 비표준 설정이 다수다 ([metro.config.js](../../apps/mobile/metro.config.js)):

- `watchFolders = [workspaceRoot]` — 모노레포 루트까지 감시
- `nodeModulesPaths` — 앱 로컬 + 워크스페이스 루트 + `node_modules/.pnpm/node_modules` (pnpm이 hoist한 transitive deps 위치)
- `disableHierarchicalLookup = true` + `unstable_enableSymlinks = true` + `unstable_enablePackageExports = true`
- `blockList`로 `.claude/`, `.git/`, `.turbo/`, `.expo/` 제외
- **커스텀 `resolveRequest` — 두 가지 작업을 한다:**
  1. `@repo/*` 패키지가 `"type": "module"` + TS NodeNext 규약에 따라 `.js` 접미사로 import한 상대 경로를 실제 `.ts`/`.tsx`로 매핑
  2. **플랫폼별 확장자 우선 탐색** — `./Foo.js` → iOS면 `.ios.tsx` → `.native.tsx` → `.tsx`, web이면 `.web.tsx` → `.tsx` 순. shared의 `Comp.tsx`(`.web` 재export 셔틀)가 native에서 잘못 픽되던 버그 회피. 이 우선순위가 곧 [platform-ui-split](../concepts/platform-ui-split.md) quad 패턴의 작동 보장

Babel은 `babel-preset-expo` + `react-native-reanimated/plugin` + `babel-plugin-react-compiler` 사용 ([babel.config.js](../../apps/mobile/babel.config.js)).

### Expo Web (RN-Web 출력) [coverage: high — 1 source]

`app.config.ts`의 `web: { bundler: 'metro', output: 'single' }` — RN-Web 출력은 **SPA 모드**다. 정적 모드(`'static'`) 는 React 19 통일 이전 SSR 호환 이슈로 인해 비활성. SPA 는 브라우저에서만 렌더하므로 충돌 없음. 모바일 개발 중 브라우저 미리보기 용도라 SSR/SEO는 불요.

`pnpm dev:mobile` 실행 후 `w` 키 또는 `pnpm --filter mobile web`으로 띄운다.

## Talks To [coverage: high — 3 sources]

- **[`@repo/api-contract`](api-contract.md)** — zod 스키마/타입 (`RestaurantListItemType`, `RestaurantPublicListItemType`, `RestaurantPublicDetailType`, `RestaurantInsightsType`, `MenuRankingItemType`, `MenuRankingSortType` 등)
- **[`@repo/shared`](shared.md)** — API 클라이언트 (`configureApi`), React Query 훅 (`useLogin`, `useRegister`, `useLogout`, `useCurrentUser`, `usePicks`, `useRandomPick`, `useRestaurantList`, `useRestaurantsPublic`, `useRestaurantByPlaceId`, `useMenuRanking`, `useGroupForRestaurant`), Zustand 스토어 (`useAuthStore`), UI 컴포넌트 (`Screen`, `Stack`, `Text`, `Button`, `Input`, `SegmentedControl`, `Divider`, `ErrorBanner`), `ThemeProvider`/`useTheme`, `QUERY_STALE_TIME`/`QUERY_GC_TIME` 상수
- **[`@repo/utils`](utils.md)** — 순수 유틸 (`computeBboxAround`, `isInKorea`, `formatWonPrice` 등)
- **[friendly](friendly.md) 백엔드** — `EXPO_PUBLIC_API_URL` 환경변수로 baseUrl 주입. dev 는 LAN/localhost 자동 추종, production 은 `.env.production` 의 `https://nlpp.easypcb.co.kr` 자동 로드 ([api-setup.ts](../../apps/mobile/src/lib/api-setup.ts), [.env.example](../../apps/mobile/.env.example), [.env.production](../../apps/mobile/.env.production))

## API Surface [coverage: high — 8 sources]

expo-router 파일 트리가 곧 라우트다.

| Route | File | 설명 |
|-------|------|------|
| `/` | [`app/index.tsx`](../../apps/mobile/app/index.tsx) | `useAuthStore`의 `token`/`isGuest` 보고 `/(tabs)/home` 또는 `/(auth)/login`로 Redirect |
| `/(auth)/login` | [`app/(auth)/login.tsx`](../../apps/mobile/app/(auth)/login.tsx) | 로그인/회원가입 SegmentedControl, 게스트 "바로 시작하기" 버튼 |
| `/(tabs)/home` | [`app/(tabs)/home.tsx`](../../apps/mobile/app/(tabs)/home.tsx) | `usePicks()` 리스트, 카드별 "랜덤 픽!" → `useRandomPick()` mutation, 게스트는 안내 화면 |
| `/(tabs)/restaurants` | [`app/(tabs)/restaurants.tsx`](../../apps/mobile/app/(tabs)/restaurants.tsx) | 공개 맛집 — 풀스크린 WebView 지도 + bottom-sheet 2개 적층 (list/detail), 위치 권한 + 자동 bbox |
| `/(tabs)/profile` | [`app/(tabs)/profile.tsx`](../../apps/mobile/app/(tabs)/profile.tsx) | `useCurrentUser()` 이메일 표시, `useLogout()` 버튼 |
| `/restaurant/[placeId]` | [`app/restaurant/[placeId].tsx`](../../apps/mobile/app/restaurant/[placeId].tsx) | (admin) `useRestaurantByPlaceId()` 헤더 + `<MenuRankingCard>`. `Stack.Screen` 헤더로 "뒤로" 제공 |

`(auth)`/`(tabs)`는 expo-router의 group(URL에 영향 없는 폴더). 루트 Stack에서 `headerShown: false`로 헤더를 숨기고, `(tabs)` 내부는 `Tabs` 컴포넌트가 한국어 타이틀(`홈`, `맛집`, `프로필`)을 렌더한다. `restaurant/[placeId]`는 group 바깥의 일반 stack 라우트라 자체 `Stack.Screen`으로 헤더(`title: '맛집 상세'`, `headerBackTitle: '뒤로'`)를 켠다.

## Data [coverage: high — 2 sources]

- **인증 토큰**: `@react-native-async-storage/async-storage`에 `lp:token` 키로 저장. 게스트 플래그는 `lp:guest='1'` ([api-setup.ts](../../apps/mobile/src/lib/api-setup.ts))
- **로컬 DB 없음** — SQLite/WatermelonDB 등 미사용
- **서버 상태**: TanStack Query (`@tanstack/react-query 5.62`) — staleTime/gcTime은 [`@repo/shared`](shared.md) 상수, retry 1회. 메뉴 순위/식당 리스트/식당 상세도 동일한 query client를 공유

부트스트랩 흐름 ([api-setup.ts](../../apps/mobile/src/lib/api-setup.ts)):
1. AsyncStorage에서 토큰/게스트 플래그 읽어 `useAuthStore` 초기 상태 hydrate
2. `useAuthStore.subscribe`로 토큰 변경 시 AsyncStorage write/remove 자동 동기화
3. `configureApi({ baseUrl, getToken: () => cachedToken, onUnauthorized: () => clearSession() })` 호출 — 401 응답 시 자동 로그아웃

## Key Decisions [coverage: high — 7 sources]

- **`.env.production` 을 Git 에 포함** — 운영 API URL(`https://nlpp.easypcb.co.kr`) 을 production 모드(`run:* --release` / `expo export` / EAS production) 에서 **자동 로드** 받기 위함. Expo 의 dotenv 규약상 `.env.production` 만 production 모드에서 자동 픽되고, 임의 파일명(예: `.env.prod`) 은 `dotenv-cli` 강제 주입 필요해 휴먼 에러 위험. 시크릿은 들어가지 않으므로 (`EXPO_PUBLIC_*` 만 인라인 — 어차피 번들에 박힘) 평문 커밋 OK.
- **운영 빌드 가이드 별도 문서** ([docs/production-build.md](../../apps/mobile/docs/production-build.md)) — Release/EAS/실기기 절차가 길고 절차마다 환경(Xcode Team, USB 디버깅, EAS env 등록) 이 달라 README 에 묻으면 묻히기 쉬워 분리. 선택 가이드 표로 "운영 변수로 빠르게 확인 → 2번", "외부 배포 → EAS" 등 의사결정 트리 제공.
- **Expo (bare RN 아님)** — EAS Build/Update 사용 위해 ([eas.json](../../apps/mobile/eas.json)에 development/preview/production 3개 채널 정의, `appVersionSource: 'remote'`, production은 `autoIncrement: true`)
- **expo-router 6 파일 기반** — `react-navigation`을 직접 imperative하게 쓰지 않고 파일 트리로 표현. `experiments.typedRoutes`로 타입 안전성 확보
- **Expo SDK 54 / React 19 / RN 0.81** — 이전 SDK 52 / RN 0.76 / React 18 라인에서 SDK 54 로 업그레이드. 웹과 React 버전 통일(둘 다 19.1) 되면서 워크스페이스 React 두 사본 공존 문제도 해소.
- **Expo Web은 SPA 모드** — `web.output: 'single'`. 모바일 개발 중 브라우저 미리보기 용도. SSR/SEO 불요.
- **New Architecture 활성화** — `newArchEnabled: true` (Fabric/TurboModules)
- **React Compiler 활성화** — `experiments.reactCompiler: true` + `babel-plugin-react-compiler` — auto-memoization. 수동 `useMemo`/`useCallback` 의존성 줄임.
- **공개 맛집 vs admin 식당 상세 분리** — `(tabs)/restaurants` 는 공개 (모두 사용 가능, 지도+바텀시트 UX), `/restaurant/[placeId]` 의 메뉴 순위 카드는 admin API 의존 (인증된 ADMIN 만 의미 있는 데이터). 본격 어드민(매장 등록·리뷰 크롤·요약 트리거 등 쓰기 액션)은 웹 전용 — 단 `MenuRankingCard`의 "분류하기" 버튼만은 예외로 mutation 직접 호출.
- **메뉴 순위 비즈니스 로직은 [`@repo/shared`](shared.md)에, UI 비율 계산만 앱에** — 정렬/필터(`minMentions: 2`)/그룹핑/[menu-grouping](menu-grouping.md) invalidate는 shared 훅이, RN flex 비율과 sort 상태 `useState`만 앱에.
- **공통 로직은 `@repo/shared`, UI는 플랫폼별** — 훅·스토어는 공유하지만, `home.tsx`/`profile.tsx`/`restaurants.tsx`/`MenuRankingCard.tsx` 등은 `react-native`의 `View`/`Text`/`FlatList`/`Pressable`/`StyleSheet`를 직접 사용. `login.tsx`만 `@repo/shared`의 RN 호환 컴포넌트 사용.
- **앱은 light only** — `ThemeProvider mode="light"` 고정. 웹/admin 은 다크 모드 토글이 있지만 앱은 미적용.
- **정산은 모바일 미구현** — 웹만. ([settlement.md](settlement.md) 참조)
- **게스트 우선 진입** — 로그인 화면 최상단의 "바로 시작하기 →" 버튼이 가장 큰 primary CTA.

## Gotchas [coverage: high — 8 sources]

- **`.env.production` 은 평문 — 시크릿 금지** — `EXPO_PUBLIC_*` 접두사 변수만 인라인 되며 어차피 빌드된 번들에서 추출 가능. API URL/도메인 정도만 OK. JWT/DB 패스워드 등 진짜 시크릿은 EAS env (`eas env:create --environment production --name ... --value ...`) 로만 — 단 그것도 `EXPO_PUBLIC_*` 접두사면 마찬가지로 번들 박힘. 진짜 시크릿은 클라이언트가 아니라 서버 측 환경변수로.
- **EAS 빌드 시 환경별 분기** — `.env.production` 은 **로컬** 빌드에서만 자동 픽. EAS 클라우드 빌드는 EAS 서버에서 도는 빌드 컨테이너가 로컬 파일을 못 읽으므로 `eas env:create --environment production` 로 별도 등록 필요 ([docs/production-build.md](../../apps/mobile/docs/production-build.md) §4). `eas env:list --environment production` 으로 확인. preview/development 환경도 별도 등록 필요.
- **`EXPO_PUBLIC_API_URL` 변경 후엔 재빌드 필수** — Metro 가 빌드 시 인라인하므로 런타임 핫스왑 불가. dev 서버는 재시작, Release/EAS 는 재빌드. 캐시 의심되면 `pnpm --filter mobile clean` 후 재시도.
- **iOS Release 실기기 — 최초 1회 Xcode Team 설정 + 폰에서 "신뢰"** — `apps/mobile/ios/mobile.xcworkspace` 열어서 Target > Signing & Capabilities > Team 선택 (무료 Apple ID 도 가능, 7일 만료). 설치 후 폰 설정 → 일반 → VPN 및 기기 관리에서 프로파일 신뢰. ios 디렉터리는 gitignored 라 CNG/prebuild 가 다시 돌면 재설정 필요 ([docs/production-build.md](../../apps/mobile/docs/production-build.md) §3).
- **Android Release 설치 — 기존 dev 빌드와 서명 충돌** — `INSTALL_FAILED_UPDATE_INCOMPATIBLE` 가 뜨면 `adb uninstall com.niney.lifepickr` 후 재설치 ([docs/production-build.md](../../apps/mobile/docs/production-build.md) 트러블슈팅).
- **typedRoutes는 첫 빌드 전엔 stale** — `experiments.typedRoutes: true`라도 `.expo/types/router.d.ts`가 갱신돼야 새 라우트(`/restaurant/[placeId]`)를 인식. typecheck-only 환경에서는 `router.push(\`/restaurant/${item.placeId}\` as never)`처럼 캐스트해 두고, `expo start` 한 번 돌면 자동 갱신된다 ([restaurants.tsx](../../apps/mobile/app/(tabs)/restaurants.tsx))
- **식당 상세(`/restaurant/[placeId]`)는 admin 전용** — `useRestaurantList`가 admin API에 매여 있어, 비-ADMIN/게스트는 분기로 빈 안내만. `(tabs)/restaurants` 자체는 공개 (모두 접근 가능). 라우트 가드는 화면 안에서만 처리.
- **`MenuRankingCard`는 분류 mutation 진행 중 버튼 disabled만 처리** — pending 시 `groupMutation.isPending` → "분류 중…" 텍스트 + opacity 0.6. 실패 시 별도 토스트/에러 UI 없음.
- **flex 비율 sentiment bar — total이 0이면 모두 0** — `pos`/`neu` 모두 0이 되어 마지막 세그먼트(`100 - pos - neu = 100`)가 통째로 빨강이 된다. `totalMentions === 0`일 땐 카드 자체가 "분석된 메뉴 멘션이 아직 없습니다"로 빠지지만, 개별 행 단위 total 0인 상태가 도달 가능한지는 ranking 훅의 minMentions 보장에 의존
- **글로벌 비교 라벨은 `restaurantCount > 1`일 때만** — 같은 메뉴가 여러 가게에서 잡혀야 의미가 있어, 단일 가게에서만 등장한 메뉴는 "전체 N%" 라벨이 아예 안 뜬다 ([MenuRankingCard.tsx](../../apps/mobile/src/components/MenuRankingCard.tsx))
- **Metro 모노레포 설정 필수** — `watchFolders`, `disableHierarchicalLookup`, `unstable_enableSymlinks`, `unstable_enablePackageExports`, `nodeModulesPaths`에 `.pnpm/node_modules` 포함, `.js` → `.ts/.tsx` 매핑 커스텀 resolver, 플랫폼 우선 확장자 탐색이 모두 한 묶음. 하나만 빠져도 pnpm 심볼릭 링크 / `@repo/*` workspace dep / 플랫폼 분기 중 무엇 하나가 깨진다 ([metro.config.js](../../apps/mobile/metro.config.js))
- **shared `Comp.tsx` 셔틀은 native에서 잘못 픽되기 쉽다** — `Button.tsx`처럼 `.web.tsx`만 재export하는 셔틀이 있을 때, Metro resolver가 플랫폼별 확장자(`.ios.tsx`/`.native.tsx`/`.web.tsx`)를 먼저 시도하지 않으면 native에서도 셔틀(=`.web` 구현)이 선택돼 RN 런타임에서 `h1` Invariant 같은 에러로 표면화. 새 UI 프리미티브 추가 시 quad 4-file 패턴(`.types.ts` + `.tsx` + `.web.tsx` + `.native.tsx`)을 반드시 지킬 것
- **루트 layout이 `bootstrapApi` 끝날 때까지 `null` 반환** — splash 뒤에 흰 화면이 잠깐 보이지 않게 하려면 `expo-splash-screen`의 hide 타이밍을 이 ready 시점과 맞춰야 함 (현재 코드에는 명시적 SplashScreen.hideAsync 호출 없음 — Expo 기본 동작에 의존)
- **Pick 목록은 `usePicks()` Query, 결과는 로컬 `useState`** — 랜덤 픽 결과(`result`)는 query 캐시가 아니라 컴포넌트 state라 화면 이동 시 사라짐 ([home.tsx](../../apps/mobile/app/(tabs)/home.tsx))
- **`noUncheckedIndexedAccess: true`** — tsconfig에서 켜져 있어 배열/객체 인덱스 접근이 `T | undefined`로 좁혀진다 ([tsconfig.json](../../apps/mobile/tsconfig.json))

## Sources [coverage: high — 22 sources]

- [apps/mobile/package.json](../../apps/mobile/package.json)
- [apps/mobile/app.config.ts](../../apps/mobile/app.config.ts)
- [apps/mobile/metro.config.js](../../apps/mobile/metro.config.js)
- [apps/mobile/babel.config.js](../../apps/mobile/babel.config.js)
- [apps/mobile/eas.json](../../apps/mobile/eas.json)
- [apps/mobile/tsconfig.json](../../apps/mobile/tsconfig.json)
- [apps/mobile/.env.example](../../apps/mobile/.env.example)
- [apps/mobile/.env.production](../../apps/mobile/.env.production)
- [apps/mobile/docs/production-build.md](../../apps/mobile/docs/production-build.md)
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
- [apps/mobile/src/components/restaurantDetail/shared/MenuGrid.tsx](../../apps/mobile/src/components/restaurantDetail/shared/MenuGrid.tsx)
- [apps/mobile/src/hooks/useUserLocationNative.ts](../../apps/mobile/src/hooks/useUserLocationNative.ts)
- [apps/mobile/src/lib/api-setup.ts](../../apps/mobile/src/lib/api-setup.ts)
- [packages/shared/src/hooks (useRestaurantList, useRestaurantsPublic, useRestaurantByPlaceId, useMenuRanking, useGroupForRestaurant)](../../packages/shared/src/hooks)
