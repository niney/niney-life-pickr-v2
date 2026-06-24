---
concept: 로직 공유 / UI 플랫폼 분기
last_compiled: 2026-06-25
topics_connected: [shared, web, mobile, project-overview, utils, map, settlement, review-search, review-clustering]
status: active
---

# 로직 공유 / UI 플랫폼 분기

## Pattern

이 모노레포는 web과 mobile에서 **로직(API 클라이언트, React Query 훅, Zustand 스토어, 디자인 토큰)은 공유**하지만 **UI 렌더링은 플랫폼별로 분기**시킨다. `@repo/shared/ui/<Component>/` 디렉터리마다 4개 파일 — `Component.types.ts` (공통 props), `Component.tsx` (재export 셔틀), `Component.web.tsx` (DOM 구현), `Component.native.tsx` (RN 구현) — 가 한 묶음. Vite는 `.web.tsx`를, Metro는 `.native.tsx`를 번들러가 자동 선택한다. Tamagui나 react-native-web 같은 통합 솔루션은 의도적으로 거부했다 (TECH_STACK.md "의도적으로 제외" 표).

## Instances

- **2026-05-07** in [[../topics/shared]]: 8개 UI 프리미티브(Button, Divider, ErrorBanner, Input, Screen, SegmentedControl, Stack, Text) 모두 동일한 4-file quad 패턴. 디자인 토큰(`design/tokens.ts`)은 공통, 적용은 각 플랫폼 파일에서 다르게 (web → CSS 변수, native → StyleSheet).
- **2026-05-07** in [[../topics/web]]: shared UI 프리미티브 + 별도로 `~/components/ui/`에 shadcn-style 로컬 UI(button.tsx, card.tsx, table.tsx 등). 어드민 콘솔처럼 web-only인 화면은 shared를 거치지 않고 로컬 컴포넌트로 직조.
- **2026-05-07** in [[../topics/mobile]]: shared UI 프리미티브 + expo-router로 RN-native 네비게이션 트리. 어드민 UI는 의도적으로 빠져 있음.
- **2026-05-07** in [[../topics/project-overview]]: TECH_STACK.md "의도적으로 제외" 표에서 Tamagui/RN-Web 거부 명시 — "UI 통합 복잡도 > 이득". CLAUDE.md도 "플랫폼별 UI는 각각 `apps/web`, `apps/mobile`에" 규칙 명시.
- **2026-05-14** in [[../topics/mobile]]: quad 패턴이 작동하려면 Metro resolver 가 플랫폼별 확장자를 우선 탐색해야 한다는 사실 표면화. 커스텀 `resolveRequest` 가 `./Foo.js` → `.ts`/`.tsx` 만 시도하던 시점에 native 빌드에서 `Comp.tsx`(=`.web` 셔틀)가 픽돼 `<h1>` Invariant 가 떴다. iOS → `.ios.tsx` → `.native.tsx` → `.tsx`, web → `.web.tsx` → `.tsx` 순서로 시도하도록 수정. 셔틀(`Comp.tsx`)이 `.web.tsx` 를 그대로 재export 하는 현재 구현에선 이 우선순위가 곧 quad 패턴의 작동 보장.
- **2026-05-19** in [[../topics/shared]] / [[../topics/mobile]] / [[../topics/utils]] (`useUserLocation` 웹/네이티브 페어 + `@repo/utils/geo`): 같은 패턴이 **훅 레벨**로 확장. [packages/shared/src/hooks/useUserLocation.ts](../../packages/shared/src/hooks/useUserLocation.ts) 는 브라우저 `navigator.geolocation` + `Permissions API` 기반, [apps/mobile/src/hooks/useUserLocationNative.ts](../../apps/mobile/src/hooks/useUserLocationNative.ts) 는 `expo-location` 기반. 인터페이스(`UserLocationState`: `{ status, coords, refetch }`) 가 같아 호출자(`PublicRestaurantsMap`/`PublicRestaurantsWebMap`) 가 import 만 다르고 코드는 동일. 공통 로직(좌표 → bbox 변환, 한국 영토 체크) 은 `@repo/utils/geo` 의 `computeBboxAround`/`isInKorea` 로 떼어내 양쪽 훅 호출자가 같이 소비. 인프라(navigator vs expo-location) 가 달라 한 줄 셔틀로 못 합쳐도, 인터페이스 동형 + 공통 산술 추출로 "분기 비용" 을 흡수.
- **2026-05-19** in [[../topics/mobile]] / [[../topics/map]] (`PublicRestaurantsWebMap.native.tsx` + `publicRestaurantsMapHtml.ts` + `.web.tsx` quad 변형): 패턴의 **극단 인스턴스** — RN 이 OpenLayers 를 네이티브로 카리지 못해서, 네이티브는 WebView 안에 HTML(vworld WMTS + OpenLayers + 마커 클릭 → `window.ReactNativeWebView.postMessage` 브릿지) 을 통째로 주입. Expo Web 은 `.web.tsx` 가 web 컴포넌트(`PublicRestaurantsMap`) 를 그대로 재사용. 한 컴포넌트가 (1) 모바일 네이티브에서 WebView, (2) Expo Web 에서 web 컴포넌트, (3) Vite 웹에서 같은 web 컴포넌트 — 세 빌드에서 다른 인프라로 같은 표현을 낸다. UI 분기 경계가 컴포넌트 안의 한 글자가 아니라 **번들 자체** 일 수 있음을 보여준다.
- **2026-05-28** in [[../topics/web]] / [[../topics/mobile]] / [[../topics/shared]] / [[../topics/settlement]] (정산 Step1/2/3/4 + Round\* 편집 컴포넌트 + tabs-layout web/native + storage adapter 주입): 패턴이 **도메인 단위 듀얼 구현**으로 확장 — 정산 플로우의 같은 단계가 web `Step*.tsx` 는 다이얼로그/모달로, mobile `Step*.tsx` 는 바텀시트로 따로 작성. 같은 store 훅(`@repo/shared/stores`) 을 소비해 데이터 모델은 1개, UI 프리미티브만 두 갈래. `RoundDiscountEditor` / `RoundCategoryAdjuster` / `RoundExceptionsEditor` / `MultiReceiptSplit*` / `SettlementBreakdownTable` 도 같은 듀얼 구현 — 한 데이터 셰이프, 두 표현. 또 `tabs-layout.tsx` (native, `react-native-bottom-tabs` 직접) vs `tabs-layout.web.tsx` (custom React tabs) — 라이브러리가 네이티브 전용이라 web 빌드는 같은 컴포넌트 이름 surface 로 다시 작성. 그리고 **새 sub-pattern: storage adapter 주입** — `settlementDraftStore` (zustand) 가 자체 persist 미들웨어를 들고 있지 않고, 진입점에서 storage 를 주입 (`setSettlementDraftStorage(adapter)`). web 은 자동으로 sessionStorage, mobile 은 AsyncStorage 어댑터를 등록. 같은 store 코드 한 벌, 두 persistence layer — **파일 확장자 분기(`.web.tsx`/`.native.tsx`)에 더해 "런타임 의존성 주입" 이 분기 도구로 추가됐다는 점에서 quad 패턴의 자매 패턴**. zustand 가 빌드 시 분기되기 어려운 시나리오(import.meta · AsyncStorage 가 web 빌드에 들어가면 깨짐) 를 주입으로 우회 — quad 가 "번들러가 알아서 픽" 이라면 storage adapter 주입은 "엔트리 파일이 명시적으로 등록" 모델.

- **2026-05-31** in [[../topics/mobile]] (`useTabBarHeight.ts` / `.web.ts` 페어): 훅 레벨 분기의 **가장 깨끗한 인스턴스**. 두 파일이 시그니처(`(): number`)·본문(`tabBarHeight || insets.bottom`)까지 동일하고 오직 import 한 줄만 다르다 — native 는 `react-native-bottom-tabs` 의 `BottomTabBarHeightContext`, web 은 `@react-navigation/bottom-tabs` 의 동명 context (web 탭바는 JS 구현 `tabs-layout.web.tsx` 라 그쪽 context). `useUserLocation`(인프라가 navigator vs expo-location 로 본문까지 다름)보다 한 단계 더 얇은 분기 — 같은 개념(탭바 높이)을 두 라이브러리가 각자 제공할 때, 본문이 같아도 native-only import 가 web 번들에 새지 않게 `.web.ts` 형제로 떼어내는 것이 핵심. `react-native-bottom-tabs` 가 web 번들을 깨뜨리는 `tabs-layout.tsx`/`.web.tsx` 셔틀과 같은 회피(2026-05-28 인스턴스)가 훅으로 번진 셈.

- **2026-06-01** in [[../topics/mobile]] / [[../topics/web]] / [[../topics/map]] (네이버 썸네일 프록시 + "내 위치" 회복 동형): 두 개의 얇은 분기 인스턴스. (1) [apps/mobile/src/lib/thumbUrl.ts](../../apps/mobile/src/lib/thumbUrl.ts) 가 네이버 CDN(`*.pstatic.net`) 이미지를 friendly `/media/thumbnail` 프록시로 감싸 ~98% 다운로드 절감 — 웹의 동명 변환 로직과 같은 결의 **플랫폼 무관 URL 변환 유틸**(인프라가 아니라 문자열 변환이라 분기 자체가 가장 얇음, 공통화 후보). (2) 앱 `PublicRestaurantsWebMap.native` 의 "내 위치" 버튼이 denied/unavailable 에서 비활성 대신 silent refetch + Alert/openSettings 회복 경로 — 웹 `MyLocationButton`(denied/insecure 구분 callout)과 **동형 UX**. 같은 사용자 약속을 두 플랫폼이 각자 인프라로 충족하는, 인터페이스 동형 분기의 연속.

- **2026-06**(17차) in [[../topics/mobile]] / [[../topics/web]] / [[../topics/shared]] / [[../topics/map]] (다크 모드 — 테마 저장소 플랫폼 분리 + 지도 다크 전략 동형): 패턴의 **저장소 물리 분리 + 공통 토큰 공유** 인스턴스로, settlement storage-adapter 주입(2026-05-28)과 같은 결의 "런타임/저장소 분리, 공통 토큰 공유". 테마 모드(`'light'|'dark'|'system'`) 영속화를 플랫폼별로 **물리적으로 다른 저장소**에 둔다 — 앱은 AsyncStorage `'lp:themeMode'`([apps/mobile/src/lib/themeStore.ts](../../apps/mobile/src/lib/themeStore.ts), zustand + `useResolvedThemeMode` 가 `system` 일 때 `useColorScheme` 와 결합), 웹은 자체 localStorage 스토어(`apps/web/src/stores/theme.ts`). 두 저장소가 충돌하지 않고 공유되는 것은 오직 `@repo/shared` 의 design 토큰([packages/shared/src/design/tokens.ts](../../packages/shared/src/design/tokens.ts)) — "값(토큰)은 1벌, 저장/적용 인프라는 N벌". 앱 themeStore 는 zustand persist 의 async rehydrate 타이밍 대신 bootstrap 에서 `await hydrate()` 로 한 번 당겨와 스플래시 동안 모드 확정(잘못된 테마 플래시 방지) — settlementPrefsStore 와 같은 수동 hydrate 패턴. **지도 다크는 같은 표현 다른 인프라**의 또 다른 사례: 웹은 OpenLayers `tileSource.setUrl(buildVworldTileUrl(...))`([apps/web/src/components/restaurant/MapCanvas.tsx](../../apps/web/src/components/restaurant/MapCanvas.tsx), 같은 URL 이면 skip 해 깜빡임 방지) 로 타일 소스를 바꾸고, 앱은 WebView 안 HTML 에 `window.__setMode(mode)` 를 `injectJavaScript` 로 주입([apps/mobile/src/components/publicRestaurantsMapHtml.ts](../../apps/mobile/src/components/publicRestaurantsMapHtml.ts) 의 `tileSource.setUrl(darkBg ? DARK_TILE_URL : BASE_TILE_URL)`, 같은 모드면 no-op) — 둘 다 "OpenLayers 타일 URL 을 다크/라이트로 스왑" 이라는 **같은 표현**이지만 한쪽은 직접 OL 호출, 한쪽은 WebView 브릿지 주입. 2026-05-19 의 PublicRestaurantsWebMap quad(WebView vs web 컴포넌트)가 다크 모드 런타임 전환까지 확장된 셈 — WebView 재마운트 없이 `__setMode` 한 번으로 테마 토글.

- **2026-06**(18차) in [[../topics/review-clustering]] / [[../topics/web]] / [[../topics/mobile]] / [[../topics/shared]] (`ClusterTopics` 동형 컴포넌트 + 전부-노이즈 폴백): 군집 관점 토픽을 보여주는 `ClusterTopics` 가 웹([apps/web/src/components/restaurant/detail/ClusterTopics.tsx](../../apps/web/src/components/restaurant/detail/ClusterTopics.tsx)) / 앱([apps/mobile/src/components/restaurantDetail/shared/ClusterTopics.tsx](../../apps/mobile/src/components/restaurantDetail/shared/ClusterTopics.tsx)) **동형 컴포넌트**로 따로 작성된 듀얼 구현. 도메인 훅(`useRestaurantClusters`)만 `@repo/shared` 로 공유하고 **표현(렌더링)만 분기** — 정산 Step\*(2026-05-28)과 같은 "한 데이터 셰이프, 두 표현" 의 연장. 추가 결: **전부 노이즈일 때 `aspectSummary` 폴백** — 군집이 전부 노이즈로 떨어지면(소형 식당 등) 양쪽 컴포넌트가 관점집계(aspectSummary)로 폴백해 분석 탭이 항상 콘텐츠를 채운다. 이 클라이언트 폴백은 서버 폴백(전부 노이즈 시 관점집계로 폴백)과 **짝** — 한 약속("분석 탭은 비지 않는다")을 서버·웹·앱 세 곳이 같은 의미로 충족.
- **2026-06**(18차) in [[../topics/settlement]] / [[../topics/web]] / [[../topics/mobile]] / [[../topics/shared]] (`RoundGroupSplitEditor` 세부 분배 + `RoundGroupSplitNote` 구조적 subtyping): 정산 라운드의 그룹/잔수 세부 분배 편집기 `RoundGroupSplitEditor` 가 분배 로직 전부를 `@repo/shared` SSOT 로 두고 **표현만 동형 분기** — 웹은 사람×그룹 매트릭스([apps/web/src/routes/settlement/RoundGroupSplitEditor.tsx](../../apps/web/src/routes/settlement/RoundGroupSplitEditor.tsx)), 앱은 그룹 카드 세로 스택([apps/mobile/src/components/settlement/RoundGroupSplitEditor.tsx](../../apps/mobile/src/components/settlement/RoundGroupSplitEditor.tsx)). 2026-05-28 의 `Round*` 듀얼 구현(Discount/Category/Exceptions)에 그룹 분배가 합류. 곁들여 `RoundGroupSplitNote` 는 `SettlementSessionType` 과 `SharedSettlementSessionType` 을 **구조적 subtyping** 으로 받아 owner/shared 두 경로를 **단일 컴포넌트**로 처리 — 분기를 줄이는 반대 방향의 인스턴스(플랫폼이 아니라 세션 종류를 타입 호환으로 합침).
- **2026-06**(18차) in [[../topics/review-search]] / [[../topics/web]] / [[../topics/mobile]] / [[../topics/shared]] (비동기 질문 알림 UI 분기 — 본체는 [[cross-tab-async-job-toast]]): 비동기 리뷰 질문(QA) 결과 알림에서 `reviewAskStore`(`@repo/shared` 공유)는 한 벌, **알림 UI 만 플랫폼별** — 웹은 `ReviewAskToaster`(sonner 토스트), 앱은 `ReviewAskBanner`(reanimated 자작, 앱엔 sonner 같은 토스트 인프라가 없어 직접 구현). UI 분기 측면만 보면 이 패턴의 또 다른 "스토어 1벌 + 표현 N벌" 인스턴스지만, 이 인스턴스의 **본체는 신규 컨셉 [[cross-tab-async-job-toast]]** (탭 간 비동기 작업 결과를 토스트로 전파하는 메커니즘) — 자세한 맥락은 그쪽 참조.

## What This Means

이 패턴은 두 가지 가치 판단을 코드에 박아 둔다:

1. **공유의 비용은 UI에서 가장 비싸다** — 비즈니스 로직(어떤 픽 모델, 어떤 유효성 검증)은 모든 플랫폼이 동일해야 하고, 그래서 `@repo/api-contract`/`@repo/shared`로 강제 공유된다. UI는 반대로 — 키보드 입력 처리, 햅틱, safe-area, 폰트 렌더링이 플랫폼마다 다르고, 추상화 레이어로 흡수하려 들면 양쪽 다 어색해진다. 그래서 "공유해야 할 것"과 "분기해야 할 것"의 경계를 의식적으로 그어 둠.
2. **번들러 친화적 추상화** — 빌드 시점에 확장자(`.web.tsx` vs `.native.tsx`) 해석으로 플랫폼이 결정되므로, 런타임 분기 코드(`if (Platform.OS === 'web')`) 없이도 트리셰이킹이 깨끗하다. 결과: web 번들에 RN 코드가 안 들어가고, native 번들에 DOM 코드가 안 들어간다.
3. **다른 화면은 다른 도구로** — 어드민 콘솔은 web-only이라서 shared의 cross-platform 추상화가 오히려 짐이 된다 → 로컬 shadcn 컴포넌트로. mobile은 expo-router의 file-based 라우팅을 그대로 활용. "공유 가능한 추상화"를 모든 곳에 강요하지 않음.
4. **분기 도구가 둘이 됐다 — 파일 확장자 + 런타임 주입** (2026-05-28). 기존엔 quad(`.web.tsx`/`.native.tsx`/`.tsx` 셔틀) 가 유일한 분기 메커니즘이었는데, settlement 라운드에 zustand store 의 storage adapter 주입(`setSettlementDraftStorage`) 이 추가됐다. 코드 1벌 + persistence 2 종을 entry 파일이 명시적으로 결정. 빌드 분기로는 풀리지 않는 의존성(웹의 sessionStorage 와 RN 의 AsyncStorage 는 API 비호환) 을 주입으로 흡수. 분기 점이 컴파일 타임 한 곳에서 컴파일 타임 + 런타임 두 곳으로 늘었지만, **"API/스토어 인터페이스는 1개, 구현은 N 개"** 라는 핵심 약속은 유지.

이 패턴이 깨질 수 있는 위험:
- 번들러가 확장자 우선순위를 다르게 해석할 때 — shared 의 `Comp.tsx` 가 `.web.tsx` 를 직접 재export 하는 셔틀 패턴이라, Metro 가 `./Foo.js` 를 `.tsx` 만 매핑하면 native 빌드에서도 셔틀(=`.web`)이 픽된다. `apps/mobile/metro.config.js` 의 커스텀 resolver 가 플랫폼별 확장자(`.ios.tsx`/`.native.tsx`/`.web.tsx`)를 우선 시도해야 한다 (2026-05-14 fix 참조). 누가 무심코 `Button.tsx` 에 web 구현을 넣으면 Metro 가 그걸 native 에서도 쓰게 됨 → 항상 quad 패턴 유지 필요
- React 버전 불일치 (웹 R19, 앱 R18) — `@repo/shared`가 React 18+ peer로 양쪽 호환. shared 코드가 R19-only API(예: 새 `use()` 훅)를 쓰는 순간 앱이 깨진다. **추가로** 워크스페이스에 두 React 사본이 공존하므로 같은 번들에 새어 들어오면 `$$typeof` 불일치 — 앱 Metro `extraNodeModules` 로 앱 로컬 react/react-dom 강제. Expo Web 정적 사전렌더(`output: 'static'`)는 SSR 의 hoist 된 react-dom 사본이 다른 React 사본의 element 를 받아 충돌 — 현재 `output: 'single'` SPA
- 새 UI 프리미티브 추가 시 quad 4-file 패턴 누락 가능 — 한 플랫폼만 두면 다른 쪽에서 import 시 런타임 에러

## Sources

- [[../topics/shared]]
- [[../topics/web]]
- [[../topics/mobile]]
- [[../topics/project-overview]]
- [[../topics/utils]]
- [[../topics/map]]
- [[../topics/settlement]]
- [[../topics/review-search]]
- [[../topics/review-clustering]]
