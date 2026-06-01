---
topic: mobile
last_compiled: 2026-06-01
sources_count: 53
status: active
aliases: [expo, react-native, expo-router, eas, ios, android, expo-web, rn-web, native-tabs, dev-client, webview-map, vworld-html, r8-minify, swift-concurrency-plugin, restaurants-tab, bottom-sheet-detail, scroll-snap-hero, notch-fade, marker-fly-zoom, reanimated-worklet, production-build, env-production, release-build, eas-env, settlement-mobile, 정산-모바일, mobile-settlement-wizard, SettlementWizard, ContactPickerSheet, MenuPickerSheet, RestaurantPickerSheet, MultiReceiptSplitSheet, settlementPrefsStore, deep-link, universal-links, app-links, applinks, intentFilters, DEEP_LINK_SETUP, lifepickr-scheme, tabs-layout-web, lucide-inline-svg, expo-web-lan-ip, ios-back-title-fix, headerBackTitle, zustand-import-meta, storage-adapter-injection, AsyncStorage-draft, share-settlements-token, useTabBarHeight, tab-bar-inset, bottom-tab-bleed, awesome-gallery, react-native-awesome-gallery, lightbox-gallery, pinch-zoom, double-tap-zoom, swipe-to-close, virtualized-reviews, review-infinite-scroll, ReviewsControls, single-flatlist-detail, row-discriminated-union, hero-hide-on-tab, scrollToOffset-hero, thumbUrl, thumbnail-proxy, pstatic-proxy, eslint-react-compiler, react-compiler-lint, flatlist-virtualization, contacts-flatlist, history-flatlist, lightbox-shared, png-asset-compression, short-share-path, enable-applinks-flag]
---

# mobile — Expo + React Native 앱

**2026-06-01 변경 흡수 — perf + 빌드 인프라 라운드.** (1) **네이버 이미지 썸네일 프록시** — 신규 [thumbUrl.ts](../../apps/mobile/src/lib/thumbUrl.ts) 가 네이버 phinf 원본(최대 ~1.5MB)을 friendly `/media/thumbnail` 프록시(sharp 리사이즈 + 디스크 캐시) 경유로 바꿔 다운로드를 ~98% 줄인다(80×80 원본 1,538,044B → w=240 24,987B). 웹은 이미 `reviewThumbnailUrl` 로 같은 프록시를 썼는데 앱만 원본을 그대로 받고 있던 격차를 메움. [PublicRestaurantCard](../../apps/mobile/src/components/PublicRestaurantCard.tsx)·[InfoTab](../../apps/mobile/src/components/restaurantDetail/InfoTab.tsx)·[PhotosTab](../../apps/mobile/src/components/restaurantDetail/PhotosTab.tsx)·[PublicRestaurantDetail hero](../../apps/mobile/src/components/restaurantDetail/PublicRestaurantDetail.tsx)·[ReviewCard](../../apps/mobile/src/components/restaurantDetail/shared/ReviewCard.tsx) 적용. (2) **목록 FlatList 가상화** — 단골([contacts.tsx](../../apps/mobile/app/settlement/contacts.tsx))·정산 이력([history.tsx](../../apps/mobile/app/settlement/history.tsx)) 의 `ScrollView` 를 `FlatList` 로 바꿔 보이는 행만 렌더(`ContactRow`/`SessionRow`/`DraftRow` 추출). (3) **ESLint + React Compiler 진단 룰** — 신규 [eslint.config.mjs](../../apps/mobile/eslint.config.mjs) 가 `@repo/config/eslint/react` 를 확장하고 React Compiler bailout 룰(`set-state-in-effect`/`set-state-in-render`/`refs`/`immutability`)을 `warn` 으로 도입(기존 코드 강제 변경 없이 회귀 가시화). (4) **Lightbox 공용화** — 라이트박스가 `restaurantDetail/Lightbox.tsx` 에서 [components/Lightbox.tsx](../../apps/mobile/src/components/Lightbox.tsx) 로 승격(PhotosTab·ReviewCard 가 `~/components/Lightbox` import). (5) **단골 수정 시트 폼 초기화 → key 리마운트** — `<ContactEditSheet key={editing?.id ?? 'closed'}>` 로 contact 가 바뀌면 시트를 통째 리마운트해 prop→state 동기화 useEffect 를 제거. (6) **정적 에셋 PNG 무손실 압축**(~946KB 절감 — `assets/icon.png`/`adaptive-icon.png`/`splash.png`/`splash-logo.png`). (7) **운영** — `app.config.ts` 의 deep-link path 가 `/share/settlements` → **`/s/`**(짧은 공유 경로) 로 바뀌고, iOS `associatedDomains` 가 `EXPO_PUBLIC_ENABLE_APPLINKS === '1'` 깃발 뒤로(무료 Apple 팀은 Associated Domains capability 미지원).

**2026-05-31 변경 흡수 — 맛집 상세를 단일 FlatList 스크롤 루트로 재구성(가상화 리뷰 무한 스크롤) + 리뷰 라이트박스 라이브러리 교체(핀치/더블탭/쓸어내려 닫기) + 하단 네이티브 탭바 인셋(`useTabBarHeight`).** 식당 상세([PublicRestaurantDetail](../../apps/mobile/src/components/restaurantDetail/PublicRestaurantDetail.tsx))의 스크롤 루트가 `ScrollView` → **단일 `FlatList`** 로 바뀌었다. 행을 `Row` discriminated union(`hero`/`tabbar`(sticky)/`tab`/`review-controls`/`review`/`review-loading`/`review-empty`/`review-footer`)으로 펼쳐, 리뷰 탭일 때만 카드가 행 단위로 나뉘어 **가상화 + `onEndReached` 무한 스크롤**(`useRestaurantPublicReviews` `fetchNextPage`)이 걸린다. 이전 `ReviewsTab.tsx`(자체 "더보기" 버튼)는 삭제되고, 필터/정렬 칩만 떼어낸 [ReviewsControls.tsx](../../apps/mobile/src/components/restaurantDetail/ReviewsControls.tsx) 가 신규. 시트 주입 prop 도 `Scroller`(BottomSheetScrollView) → **`List`**(BottomSheetFlatList) 로 교체. 탭을 누르면 hero 를 가린 위치(`heroH`)로 `scrollToOffset({ animated: true })` — hero 를 숨기고 콘텐츠를 최대 노출(`contentContainerStyle.minHeight = heroH + screenH` 로 짧은 탭에서도 스크롤 가능 보장). 리뷰 라이트박스([Lightbox.tsx](../../apps/mobile/src/components/Lightbox.tsx))는 직접 만든 FlatList 캐러셀을 버리고 **[react-native-awesome-gallery](../../apps/mobile/package.json)**(`^0.4.3`)로 교체 — 페이징·핀치/더블탭 줌·줌 패닝·아래로 쓸어내려 닫기·탭 닫기를 한 번에 처리(줌↔페이징↔닫기 제스처 충돌 조율을 라이브러리에 위임), RN Modal 이 앱 루트와 분리된 네이티브 계층이라 내부 제스처가 동작하도록 `GestureHandlerRootView` 로 감쌌다. 하단 네이티브 탭바(`react-native-bottom-tabs`)가 scene 을 풀블리드로 깔고 인셋을 자동으로 안 잡아줘 마지막 콘텐츠가 탭바 뒤로 가리던 문제를, [useTabBarHeight.ts](../../apps/mobile/src/hooks/useTabBarHeight.ts)(native) / [.web.ts](../../apps/mobile/src/hooks/useTabBarHeight.web.ts)(web) 페어가 탭바 높이(홈 인디케이터 inset 포함)를 읽어 home/profile/restaurants/상세의 `contentContainerStyle.paddingBottom` 에 더해 해결([platform-ui-split](../concepts/platform-ui-split.md) 의 훅 레벨 인스턴스).

**2026-05-28 변경 흡수 — 정산 도메인 모바일 통째 구현 + Universal Links / App Links + Expo Web 안정화 + iOS 백 버튼 라벨 fix.** 이전 컴파일까지 "정산은 모바일 미구현 — 웹만" 이었던 항목이 이번 라운드에 **풀 구현**으로 뒤집혔다. 식당 상세 → 정산하기 CTA → 4단계 위저드 → 결과 → 공유 토큰까지 RN 네이티브 + bottom-sheet 패턴으로 모두 들어왔다. 공유 링크는 iOS Universal Links + Android App Links 로 설치 단말이면 앱이 직접 가로채고, 미설치 단말은 동일 URL 의 웹 SPA 가 폴백한다. Expo Web 쪽은 (1) native-only `react-native-bottom-tabs` 가 web 번들에 들어가 깨지던 회귀를 `tabs-layout.tsx` / `tabs-layout.web.tsx` 셔틀로 분리, (2) zustand 의 `import.meta.env` 가 `<script defer>` 컨텍스트에서 SyntaxError 내는 회귀를 babel 플러그인으로 치환, (3) 폰에서 LAN IP 로 Expo Web 에 붙으면 friendly API URL 도 같은 LAN IP 로 자동 추종(friendly CORS RFC1918 자동 허용과 짝)으로 모두 잡혔다. iOS Stack 의 자동 back title 이 `(tabs)` 같은 디렉터리명을 라벨로 노출하던 회귀는 루트 Stack 의 `headerBackButtonDisplayMode: 'minimal'` 로 글로벌 차단.

**2026-05-25 변경 — 운영 빌드 가이드 + .env.production 자동 로드 + MenuGrid 반응형 컬럼 + map 카테고리 아이콘 흡수.** 운영용 API URL(`https://ninelife.kr`)을 production 모드에서 자동으로 박기 위해 [.env.production](../../apps/mobile/.env.production) 을 Git 에 포함했고, Release/EAS/실기기 빌드 절차를 별도 문서 [docs/production-build.md](../../apps/mobile/docs/production-build.md) 로 분리. WebMap 컴포넌트군은 [map.md](map.md) 가 다루는 카테고리 아이콘 8종 + variant 통합을 흡수했다.

**2026-05-14 ~ 2026-05-19 대규모 리빌드** — apps/mobile 가 사실상 새 앱으로 재구성. 다섯 큰 줄기:

1. **네이티브 탭바 + dev client 워크플로 전환** — `expo-router` 의 네이티브 `(tabs)` 그룹 도입 ([app/(tabs)/_layout.tsx](../../apps/mobile/app/(tabs)/_layout.tsx)). Expo Go 가 아니라 dev client 가 기본 — `dev:mobile` 이 cocoapods/gradle 자동 동기화 + `expo run:ios/android`. `EXPO_PUBLIC_API_URL` 을 `process.env` 에서 직접 읽기 (이전엔 Constants 경유 — bare 환경에서 비어버림).
2. **맛집 탭 통합 UX (네이버 지도 스타일)** — [app/(tabs)/restaurants.tsx](../../apps/mobile/app/(tabs)/restaurants.tsx) 가 풀스크린 WebView 지도 + 바텀시트 + 상세 in-sheet 단일 트리. 시트 안에 list/detail 두 시트가 적층 (`list/detail 2-sheet stack` — list 스크롤 위치 복구 패턴). 신규 컴포넌트 12+ 종: [PublicRestaurantsWebMap.native.tsx](../../apps/mobile/src/components/PublicRestaurantsWebMap.native.tsx) + [.web.tsx](../../apps/mobile/src/components/PublicRestaurantsWebMap.web.tsx) — 네이티브는 WebView 안에 [publicRestaurantsMapHtml.ts](../../apps/mobile/src/components/publicRestaurantsMapHtml.ts) 의 인라인 HTML(vworld + OpenLayers) 주입, Expo Web 은 web 컴포넌트 그대로. 마커는 카테고리별 라인 아이콘 8종 + primary/muted variant ([map.md](map.md) 참조). [RestaurantsFloatingHeader](../../apps/mobile/src/components/RestaurantsFloatingHeader.tsx) + [PublicRestaurantCard](../../apps/mobile/src/components/PublicRestaurantCard.tsx) + [NotchFade](../../apps/mobile/src/components/NotchFade.tsx) (상단 노치 페이드). 상세는 [restaurantDetail/](../../apps/mobile/src/components/restaurantDetail/) 디렉터리에 `HomeTab`/`InfoTab`/`PhotosTab`/`ReviewsControls` + `shared/MenuGrid`/`ReviewCard`. Hero scroll snap + 탭 전환 시 snap 위치 유지 — 헤더는 스크롤러 밖으로 분리.
3. **위치 기반 첫 진입** — [useUserLocationNative.ts](../../apps/mobile/src/hooks/useUserLocationNative.ts) 가 `expo-location` 으로 권한 요청 + `enableHighAccuracy:false` 좌표 → `@repo/utils` 의 `computeBboxAround(coords, 1.5km)` 로 자동 fly. "내 위치" 버튼 + 한국 밖이면 `isInKorea` 폴백.
4. **마커 fly + zoom + Reanimated 워클릿 폭주 fix** — 리스트 선택 시 지도 자동 fly + zoom in, 비선택 dot + 선택 핀 + 라벨 항상 표시. bbox 자동 계산이 매 렌더 워클릿 폭주를 일으켜 selection 채널을 marker 채널과 분리.
5. **빌드/플랫폼 최적화** — [plugins/with-android-minify.js](../../apps/mobile/plugins/with-android-minify.js) — Android release R8 minify + 리소스 shrink. [plugins/with-swift-concurrency-fix.js](../../apps/mobile/plugins/with-swift-concurrency-fix.js) — Xcode 26 + RN 0.81 호환 Swift 5 강제 config plugin. Metro 콜드 스타트·이미지 렌더링 최적화 3종.

> 용어: 이 토픽은 **앱**(`apps/mobile`, Expo + RN)을 다룬다. "모바일"이라는 단어는 **웹**(`apps/web`)의 작은 화면 레이아웃을 가리키는 별도 개념이므로 본문에서는 항상 "앱"으로 표기 ([schema.md Terminology](../schema.md#terminology--웹--앱--모바일)).

## Purpose [coverage: high — 6 sources]

`apps/mobile/`는 일반 사용자용 Life Pickr 앱이다. "고민될 땐, 대신 골라드릴게요" — 사용자가 등록한 Pick 목록 중 하나를 랜덤으로 뽑아주는 앱 인터페이스가 핵심이다 ([login.tsx](../../apps/mobile/app/(auth)/login.tsx), [home.tsx](../../apps/mobile/app/(tabs)/home.tsx)).

App config의 표시명은 `Life Pickr`, slug `life-pickr`, 번들 ID `com.niney.lifepickr` (iOS/Android 공통), URL scheme `lifepickr` ([app.config.ts](../../apps/mobile/app.config.ts)). 게스트 모드와 이메일 가입/로그인 두 진입로를 제공하며, 게스트는 Pick 저장이 불가하다고 명시적으로 안내한다.

추가로 **공개 "맛집" 탭** ([restaurants.tsx](../../apps/mobile/app/(tabs)/restaurants.tsx)) 이 풀스크린 WebView 지도 + 바텀시트로 위치 기반 식당 검색을 제공하고, ADMIN 한정으로 식당 상세 메뉴 순위(SentimentBar + 글로벌 비교 + 미분류 메뉴 분류 트리거) 화면도 노출 ([restaurant/[placeId]/index.tsx](../../apps/mobile/app/restaurant/[placeId]/index.tsx), [MenuRankingCard.tsx](../../apps/mobile/src/components/MenuRankingCard.tsx)). 매장/메뉴/리뷰 크롤·관리 같은 본격 어드민은 여전히 웹 전용이다.

**정산 도메인은 이제 앱에서도 풀 구현.** [SettlementWizard](../../apps/mobile/src/components/settlement/SettlementWizard.tsx) 4단계 + 결과 + 수정 + 공유 토큰 view + 단골 관리 + 이력까지. 웹과 동일한 [`@repo/shared`](shared.md) 훅(`useSettlement`, `useListSettlements`, `useSettlementDraft`, `useSharedSettlement`, `useSettlementContacts`, `useUploadReceipt`, `useExtractReceipt`) 위에서 RN 프리미티브 + `@gorhom/bottom-sheet` UI 만 다르게 그린다. 공유 페이지는 deep link 로 native 앱이 가로채고, 미설치 단말은 web SPA fallback. 자세한 흐름은 [settlement.md](settlement.md).

## Architecture [coverage: high — 14 sources]

스택은 다음과 같다 ([package.json](../../apps/mobile/package.json), [app.config.ts](../../apps/mobile/app.config.ts)):

- **Expo SDK 54** (`expo: ~54.0.34`) — 이번 라운드 업그레이드 없음.
- **React Native 0.81.5** + **New Architecture 활성화** (`newArchEnabled: true`)
- **expo-router 6.0.23** — 파일 기반 라우팅 (`main: "expo-router/entry"`)
- **React 19.1.0**
- **TanStack Query 5.62**, **Zustand 5**, **react-native-reanimated 4.1.7**, **react-native-gesture-handler 2.28**
- **react-native-bottom-tabs 1.2** + **@bottom-tabs/react-navigation 1.2** — 네이티브 탭바 (web 은 `@react-navigation/bottom-tabs` 로 대체, 아래 Expo Web 절 참조)
- **@gorhom/bottom-sheet 5.2** — 정산 위저드·picker 시트류의 베이스
- **react-native-awesome-gallery 0.4** — 리뷰/사진 라이트박스. 핀치/더블탭 줌 + 줌 패닝 + 페이징 + 쓸어내려 닫기를 한 컴포넌트가 처리 (gesture-handler + reanimated 위에 빌드). 직접 만든 FlatList 캐러셀 대체.
- **expo-image / expo-location / expo-image-picker / expo-glass-effect / expo-linear-gradient / expo-linking / expo-splash-screen** 등
- **react-compiler 1.0** 활성화 (`experiments.reactCompiler: true` + `babel-plugin-react-compiler`)
- **eslint 10 + @repo/config/eslint/react** — `lint: "eslint ."`. ([eslint.config.mjs](../../apps/mobile/eslint.config.mjs), 아래 lint 절)

### 환경변수 / API URL 해상도 [coverage: high — 3 sources]

API URL 은 [api-setup.ts](../../apps/mobile/src/lib/api-setup.ts) 의 `resolveApiUrl()` 이 다음 우선순위로 결정:

1. **`process.env.EXPO_PUBLIC_API_URL`** — Metro 가 빌드 시 인라인. Expo 가 모드별로 자동 로드하는 dotenv 파일에서 채워진다. dev 는 `.env`/`.env.local`/`.env.development`, production 은 **`.env.production`** ([.env.production](../../apps/mobile/.env.production) — `EXPO_PUBLIC_API_URL=https://ninelife.kr`).
2. **Web 한정 — `window.location.hostname`** — Expo Web 이 폰/태블릿에서 LAN IP(`http://192.168.x.y:8081`) 로 접속됐으면 friendly 도 같은 IP:3000 으로 자동 추론. 별도 설정 없이 같은 LAN 안에서 동작 ([friendly](friendly.md) 의 CORS RFC1918 자동 허용과 짝).
3. **Metro dev 서버 호스트** — `getDevServer().url` 의 호스트(디바이스면 Mac LAN IP) 에 `:3000` 붙임. dev client / bare 진입로.
4. **localhost:3000** — 마지막 폴백 (시뮬레이터/Expo Web localhost).

`app.config.ts` 는 더 이상 `extra.apiUrl` 로 굳히지 않는다 — `process.env` 직접 읽는 경로가 dev client 캐시 / manifest stale 에 덜 민감하기 때문 ([app.config.ts](../../apps/mobile/app.config.ts) 주석).

### 썸네일 프록시 — `thumbUrl()` [coverage: high — 5 sources]

[thumbUrl.ts](../../apps/mobile/src/lib/thumbUrl.ts) 가 네이버 phinf 원본 이미지 URL 을 friendly `/media/thumbnail` 프록시(sharp 리사이즈 + 디스크 캐시) 경유 URL 로 바꾼다. 시그니처: `thumbUrl(url, width, quality?) => string | undefined`.

- 호스트가 `*.pstatic.net` 일 때만 프록시 — 그 외(자체 호스팅·DC 등)는 **원본 URL 그대로 통과**(프록시 서버가 네이버 호스트만 allowlist 하므로). 정규식 `\.pstatic\.net$` 로 host 추출 후 검사.
- `getApiConfig().baseUrl` 이 비어있으면(설정 전) 원본 반환 — 깨진 이미지 대신 폴백.
- 실제 URL 은 `base + reviewThumbnailUrl(url, width, quality)` — `reviewThumbnailUrl` 은 [`@repo/utils`](utils.md) 의 헬퍼로 웹(`apps/web`)이 쓰는 것과 동일. 즉 같은 프록시·같은 쿼리 포맷을 웹/앱이 공유.
- 효과: 80×80 원본 1,538,044B → `w=240` 24,987B (≈ -98%).

호출처(전부 `expo-image` 의 `source` 에 직접): [PublicRestaurantCard](../../apps/mobile/src/components/PublicRestaurantCard.tsx)(w=240 카드 썸네일), [InfoTab](../../apps/mobile/src/components/restaurantDetail/InfoTab.tsx)(w=240 블로그 리뷰 썸네일), [PhotosTab](../../apps/mobile/src/components/restaurantDetail/PhotosTab.tsx)(w=400 그리드 타일), [ReviewCard](../../apps/mobile/src/components/restaurantDetail/shared/ReviewCard.tsx)(w=480 가로 스크롤 이미지), [PublicRestaurantDetail](../../apps/mobile/src/components/restaurantDetail/PublicRestaurantDetail.tsx)(w=900 hero). 라이트박스([Lightbox.tsx](../../apps/mobile/src/components/Lightbox.tsx))는 thumbUrl 을 거치지 않고 원본을 그대로 — 확대 보기라 원본 해상도가 필요.

### 앱 부트스트랩 — storage adapter 주입 [coverage: high — 2 sources]

[api-setup.ts](../../apps/mobile/src/lib/api-setup.ts) 가 **모듈 import 시점**(`bootstrapApi()` 호출 전)에 다음을 실행한다:

```ts
setSettlementDraftStorage(AsyncStorage);
```

[`@repo/shared`](shared.md) 의 settlement draft 스토어(zustand persist) 가 첫 read/write 부터 AsyncStorage 를 쓰도록 강제. 웹은 sessionStorage 가 자동이지만 앱은 명시 주입 필요. 주입이 빠지면 persist 가 silently no-op — store 는 동작하지만 앱 재실행 시 draft 가 날아간다.

이후 `bootstrapApi()` 가 await 되면서 (1) `useSettlementPrefsStore.getState().hydrate()` (fire-and-forget), (2) AsyncStorage 에서 토큰/게스트 hydrate, (3) `useAuthStore.subscribe` 로 양방향 동기화, (4) `configureApi({ baseUrl, getToken, onUnauthorized })` 까지 끝낸다.

### 라우팅 트리 (expo-router 파일 기반)

정산 도메인 라우트가 들어오면서 트리가 크게 자랐다 — `restaurant/[placeId]` 가 단일 파일에서 **디렉터리로 승격**(`restaurant/[placeId]/index.tsx`) 되어 `settle/` 하위 라우트를 품을 수 있게 됐다.

```
app/
├── _layout.tsx                          ← 루트: GestureHandler + BottomSheetModalProvider + ThemeProvider + QueryClient + bootstrap
│                                          + screenOptions.headerBackButtonDisplayMode='minimal' (iOS 백 라벨 차단)
├── index.tsx                            ← 토큰/게스트 보고 redirect
├── (auth)/
│   ├── _layout.tsx
│   └── login.tsx
├── (tabs)/
│   ├── _layout.tsx                      ← shim: ~/components/tabs-layout 재export (web 은 .web.tsx 자동 선택)
│   ├── home.tsx
│   ├── restaurants.tsx
│   └── profile.tsx                      ← 로그인 시 '정산 이력' / '내 단골' 메뉴 추가
├── restaurant/
│   └── [placeId]/                       ← [디렉터리 승격] 식당 상세 + 정산 하위 트리
│       ├── index.tsx                    ← 식당 상세 (탭형 — Home/Info/Menu/Photos/Reviews)
│       └── settle/
│           ├── new.tsx                  ← 4단계 위저드 (placeId prefill)
│           └── [id]/
│               ├── index.tsx            ← 결과 view
│               └── edit.tsx             ← 편집 모드
├── settlement/                          ← 식당 미지정 + 이력/단골 진입
│   ├── new.tsx                          ← placeless 위저드
│   ├── history.tsx                      ← useListSettlements (+ 임시저장 draft) — FlatList 가상화
│   └── contacts.tsx                     ← useSettlementContacts — FlatList 가상화
└── share/                               ← 공유 토큰 진입 (deep link 가 가로채는 경로)
    └── settlements/
        └── [token].tsx                  ← useSharedSettlement(token) — read-only view
```

루트 레이아웃 ([_layout.tsx](../../apps/mobile/app/_layout.tsx)) 은 비동기 `bootstrapApi()` 가 끝날 때까지 `null` 반환 — splash 유지. 준비되면 `GestureHandlerRootView` → `ThemeProvider mode="light"` → `QueryClientProvider` → **`BottomSheetModalProvider`** (정산 picker 시트들의 portal 호스트) → `Stack` 구조. Stack 은 `screenOptions={{ headerShown: false, headerBackButtonDisplayMode: 'minimal' }}` — 후자가 iOS 백 라벨 회귀 방지(아래 Gotchas).

`app.config.ts` 에서 `experiments.typedRoutes: true` + `experiments.reactCompiler: true` 활성. plugins 는 `expo-router`, `expo-font`, `react-native-bottom-tabs`, `expo-splash-screen`(단색 `#3916ae`), `expo-location`, **`expo-image-picker`**(영수증 사진 — 카메라+라이브러리 권한 inline), 그리고 로컬 config plugin 2종 (`./plugins/with-swift-concurrency-fix`, `./plugins/with-android-minify`).

### Universal Links / App Links 설정 [coverage: high — 2 sources]

`app.config.ts` 가 공유 정산 링크(짧은 공유 경로 `https://<WEB_HOST>/s/<token>`) 를 가로채는 capability 를 빌드 시 박는다 ([app.config.ts](../../apps/mobile/app.config.ts)):

- `WEB_HOST = (process.env.EXPO_PUBLIC_WEB_HOST || 'ninelife.kr').trim()` — env 로 dev/staging 도메인 override 가능.
- **iOS** — `associatedDomains: ['applinks:${WEB_HOST}']` 는 **`EXPO_PUBLIC_ENABLE_APPLINKS === '1'` 일 때만** 주입된다. 무료(Personal) Apple 팀은 Associated Domains capability 를 지원하지 않아 프로비저닝 프로파일 생성이 실패하므로, 로컬 무료 빌드에선 깃발을 끄고(커스텀 스킴 + 웹 fallback 은 항상 동작), EAS/유료 팀 빌드에서만 켠다. 호스트의 `/.well-known/apple-app-site-association` (friendly 가 응답) 가 iOS 검증을 통과하면 매칭 URL 이 자동으로 앱으로 라우팅.
- **Android** — `android.intentFilters: [{ action: 'VIEW', autoVerify: true, data: [{ scheme: 'https', host: WEB_HOST, pathPrefix: '/s/' }], category: ['BROWSABLE', 'DEFAULT'] }]`. `pathPrefix: '/s/'` (트레일링 슬래시까지 줘서 `/settlements` 등 `/s` 로 시작하는 다른 경로는 안 가로채고 `/s/<token>` 만 매칭). 설치 시 OS 가 `/.well-known/assetlinks.json` 자동 검증. fingerprint 매칭 시 디스앰비규에이터 없이 바로 앱 진입.
- **scheme** — `scheme: 'lifepickr'` (커스텀 URL scheme) 은 보조용으로 유지 — OAuth 콜백 등. 깃발과 무관하게 항상 동작.

서버측 `.well-known` 응답은 [friendly](friendly.md) 가 책임지고, prebuild + 재빌드 + env(`APP_TEAM_ID`, `APP_BUNDLE_ID`, `ANDROID_APP_PACKAGE`, `ANDROID_SHA256_FINGERPRINTS`) 채우기 절차는 [DEEP_LINK_SETUP.md](../../apps/mobile/DEEP_LINK_SETUP.md) 가 단계별로 정리 (Team ID 추출 / SHA-256 추출 / `pm get-app-links` / `adb shell am start` 검증 / 트러블슈팅 매트릭스).

흐름: **사용자가 카톡으로 받은 공유 링크 탭 → 앱 설치됨 → OS 의도가 앱으로 → expo-router 가 `share/settlements/[token]` 매칭 → `useSharedSettlement(token)`** . 미설치 / 검증 실패 단말은 동일 URL 의 웹 SharedSettlementPage 가 폴백 — 같은 read-only view 라 UX 안 깨짐.

### 맛집 / 식당 상세 화면 [coverage: high — 5 sources]

- **`(tabs)/restaurants.tsx`** — 풀스크린 WebView 지도 + `@gorhom/bottom-sheet` 2개 적층(list / detail). list 시트는 항상 mount, detail 시트는 `placeId` 가 truthy 일 때만 conditional mount. list 시트의 `BottomSheetFlatList` 와 detail 의 `PublicRestaurantDetail` 모두 `useTabBarHeight()` 만큼 하단 패딩.
- **`restaurant/[placeId]/index.tsx`** — 식당 상세. `useLocalSearchParams<{ placeId: string }>()` + `PublicRestaurantDetail` 컨테이너. `Stack.Screen` 으로 `headerBackTitle: '뒤로'` 명시 — 부모 Stack 의 `headerShown:false` 를 여기서만 켠다.
- **`src/components/restaurantDetail/PublicRestaurantDetail.tsx`** — 공개 맛집 상세 컨테이너. 스크롤 루트가 단일 `FlatList` (시트 모드는 `List=BottomSheetFlatList` 주입, deep-link route 는 기본 `FlatList`). 데이터 fetch(상세 + 인사이트 + **리뷰 페이지네이션**)는 여기 한 번. 행을 `Row` discriminated union 으로 펼쳐 `[hero, TabBar(sticky idx 1), ...콘텐츠]` 구성 — 비-리뷰 탭은 콘텐츠 통째로 한 행, **리뷰 탭만** controls + 카드 N행 + footer 로 펼쳐 가상화. `useRestaurantPublicReviews(detail ? placeId : null, { sentiment, sort }, reviewSeed)` 가 `detail.reviewsFirstPage` 를 seed 로 첫 페이지 즉시 + `onEndReached` → `fetchNextPage`. 탭 변경은 `scrollToOffset({ offset: heroH, animated: true })` 로 hero 숨김. hero 이미지는 `thumbUrl(hero, 900)`.
- **`restaurantDetail/ReviewsControls.tsx`** — 리뷰 sentiment 필터(전체/긍정/부정, `detail.reviewCounts` 카운트) + 정렬(최근 방문순/별점 높은순) 칩. FlatList 의 `review-controls` 행으로 렌더. 폐기된 `ReviewsTab.tsx` 에서 칩 UI 만 분리.
- **`src/components/Lightbox.tsx`** **[승격 2026-06-01]** — `react-native-awesome-gallery` 기반 풀스크린 뷰어. 이전 `restaurantDetail/Lightbox.tsx` 에서 `src/components/Lightbox.tsx` 로 승격 — PhotosTab·ReviewCard 가 `~/components/Lightbox` 로 공용 import. 페이징·핀치/더블탭 줌(`doubleTapScale=2.5`/`maxScale=6`)·줌 패닝·`onSwipeToClose`·`onTap` 닫기. `GestureHandlerRootView` 로 Modal 래핑(제스처 동작 필수). `renderItem` 의 `setImageDimensions` 로 원본 픽셀 크기를 알려야 contain 배치·줌 경계 계산이 됨. 이미지는 원본 URL(thumbUrl 미적용).
- **`restaurantDetail/shared/ReviewCard.tsx`** — 리뷰 카드(만족도 칩 + 본문 + 가로 스크롤 이미지 → Lightbox + 분석 세부). `memo(ReviewCardImpl)` — 필터/정렬 칩 변경이나 무한 스크롤 페이지 추가로 리스트가 새로 만들어져도 entry reference 동일이면 re-render 차단. 이미지 `thumbUrl(u, 480)`.
- **`src/components/restaurantDetail/`** 나머지 — `HomeTab`/`InfoTab`/`PhotosTab`/`InsightsTab` + `shared/MenuGrid`. [MenuTab.tsx](../../apps/mobile/src/components/restaurantDetail/MenuTab.tsx) — 메뉴 리스트 상단에 "🧮 이 메뉴로 정산하기" Pressable CTA. 비로그인이면 `/(auth)/login` 으로, 로그인이면 `/restaurant/[placeId]/settle/new` 로 push (typedRoutes 가 nested dynamic 인식 못 할 때 위해 `as never` 캐스트).
- **`src/components/MenuRankingCard.tsx`** — (admin 한정) `useMenuRanking(placeId)` 결과로 메뉴 순위 SentimentBar.

### `useTabBarHeight` — 하단 탭바 인셋 [coverage: medium — 2 sources]

`react-native-bottom-tabs` 는 translucent 여부와 무관하게 scene 을 풀블리드로 깔고 인셋을 직접 넣어야 한다 — 그래서 스크롤 마지막 콘텐츠가 탭바(+홈 인디케이터) 뒤로 가렸다. [useTabBarHeight.ts](../../apps/mobile/src/hooks/useTabBarHeight.ts)(native, `react-native-bottom-tabs` 의 `BottomTabBarHeightContext` 를 직접 읽음 — `useBottomTabBarHeight()` 는 탭 밖 deep-link route 에서 throw) / [.web.ts](../../apps/mobile/src/hooks/useTabBarHeight.web.ts)(web, `@react-navigation/bottom-tabs` 의 동명 context — web 탭바는 JS 구현이라) 페어가 탭바 높이를 반환. 폴백은 `??` 가 아니라 `||` — 탭 밖(`undefined`) / 측정 전 첫 프레임(Provider 초기값 `0`) 둘 다 `useSafeAreaInsets().bottom` 을 바닥값으로 잡아 첫 프레임부터 콘텐츠가 안 가린다(탭바 높이는 항상 bottom inset 을 포함하므로 `||` 가 under-pad 를 만들지 않음). 호출처: `(tabs)/home`·`(tabs)/profile`·`(tabs)/restaurants`·`PublicRestaurantDetail` 의 `contentContainerStyle.paddingBottom` + `scrollIndicatorInsets.bottom`.

### 정산 — Mobile 구현 [coverage: high — 16 sources]

[`apps/mobile/src/components/settlement/`](../../apps/mobile/src/components/settlement) — 위저드/시트/에디터 일습. 비즈니스 로직은 [`@repo/shared`](shared.md) 훅이 들고, 이 디렉터리는 RN 프리미티브 + bottom-sheet UI 만 다룬다.

- [SettlementWizard.tsx](../../apps/mobile/src/components/settlement/SettlementWizard.tsx) — 4단계 네비게이터. `placeId` prop 으로 식당 prefill, draft 는 `useSettlementDraft` 가 AsyncStorage persist.
- [Step1Participants.tsx](../../apps/mobile/src/components/settlement/Step1Participants.tsx) / [Step2Rounds.tsx](../../apps/mobile/src/components/settlement/Step2Rounds.tsx) / [Step3Edit.tsx](../../apps/mobile/src/components/settlement/Step3Edit.tsx) / [Step4Review.tsx](../../apps/mobile/src/components/settlement/Step4Review.tsx) — 웹 단계별 의미와 1:1 대응, RN 프리미티브 + 시트 호출.
- [ContactPickerSheet.tsx](../../apps/mobile/src/components/settlement/ContactPickerSheet.tsx) / [ContactSuggestions.tsx](../../apps/mobile/src/components/settlement/ContactSuggestions.tsx) — 단골(`useSettlementContacts`) 선택 시트. 웹 다이얼로그를 bottom-sheet 로 옮긴 변형.
- [MenuPickerSheet.tsx](../../apps/mobile/src/components/settlement/MenuPickerSheet.tsx) — 식당 메뉴 picker (영수증 항목 명 → 메뉴 매칭/추가).
- [RestaurantPickerSheet.tsx](../../apps/mobile/src/components/settlement/RestaurantPickerSheet.tsx) — 식당 검색 시트 (식당 미지정 진입 / 차수 추가용).
- [MultiReceiptSplitSheet.tsx](../../apps/mobile/src/components/settlement/MultiReceiptSplitSheet.tsx) — 영수증 한 장에 여러 차수가 섞여 있을 때 split.
- [RoundDiscountEditor.tsx](../../apps/mobile/src/components/settlement/RoundDiscountEditor.tsx) / [RoundCategoryAdjuster.tsx](../../apps/mobile/src/components/settlement/RoundCategoryAdjuster.tsx) / [RoundExceptionsEditor.tsx](../../apps/mobile/src/components/settlement/RoundExceptionsEditor.tsx) — 차수 단위 할인/카테고리/예외 편집.
- [SettlementBreakdownTable.tsx](../../apps/mobile/src/components/settlement/SettlementBreakdownTable.tsx) — 참여자 × (차수 × 카테고리) 매트릭스 RN 렌더.
- [SettlementShareSheet.tsx](../../apps/mobile/src/components/settlement/SettlementShareSheet.tsx) — 공유 토큰 발급 + 네이티브 share intent.

부속 store:

- [src/lib/settlementPrefsStore.ts](../../apps/mobile/src/lib/settlementPrefsStore.ts) — `newParticipantExcludes` (주류/비주류/안주 제외 체크박스의 기본값) 를 AsyncStorage 로 persist. 웹 `settlementPrefsStore` 의 RN 짝. `bootstrapApi()` 에서 `hydrate()` 호출.

정산 이력/단골 목록은 이번 라운드에 `ScrollView` → `FlatList` 가상화로 전환됐다 (아래 Data / Key Decisions 참조).

### Expo Web (RN-Web 출력) [coverage: high — 3 sources]

`app.config.ts` 의 `web: { bundler: 'metro', output: 'single' }` — SPA 모드. 두 회귀를 잡았다.

**1. native-only 라이브러리가 web 번들에 들어가 깨지던 회귀.** `app/(tabs)/_layout.tsx` 가 `@bottom-tabs/react-navigation` (`react-native-bottom-tabs` 의 RN-Navigation 어댑터) 을 직접 import 하면 그 안의 `codegenNativeComponent` 가 web 번들에 들어가 SyntaxError. 해결:

```
app/(tabs)/_layout.tsx                    ← 두 줄짜리 셔틀 — ~/components/tabs-layout 재export
src/components/tabs-layout.tsx            ← native: @bottom-tabs/react-navigation 사용
src/components/tabs-layout.web.tsx        ← web: @react-navigation/bottom-tabs (JS 구현) + inline SVG 아이콘
```

Metro 의 플랫폼 확장자 우선 탐색이 `.web.tsx` 를 자동 선택. 같은 규칙으로 `PublicRestaurantsWebMap.{native,web}.tsx`, `useTabBarHeight.{ts,web.ts}` 도 동작.

**2. Lucide 단색 라인 아이콘 inline SVG.** web 탭바 아이콘을 npm Lucide 의존 없이 [tabs-layout.web.tsx](../../apps/mobile/src/components/tabs-layout.web.tsx) 안에 SVG path 를 직접 내장. stroke=currentColor 라 React Navigation 의 active/inactive 색이 자동 적용. 컬러 이모지에 grayscale 안 먹는 OS bitmap glyph 회피.

**3. `zustand` 의 `import.meta.env` 회귀 — babel 플러그인으로 치환.** [babel.config.js](../../apps/mobile/babel.config.js) 에 inline 정의한 `replace-import-meta` 플러그인이 모든 플랫폼에서 `import.meta` 를 `{ env: { MODE: 'production' } }` 객체로 치환. zustand devtools 가 `import.meta.env?.MODE !== 'production'` 으로 dev 분기를 켜는데, web 번들이 `<script defer>` (not `type="module"`) 로 로드되는 컨텍스트에서 `import.meta` 자체가 SyntaxError 라 치환 없으면 web 부팅 자체가 실패.

`pnpm dev:mobile` 후 `w` 키 또는 `pnpm --filter mobile web` 으로 띄운다. 폰에서 LAN IP 로 접속하면 friendly 도 같은 IP 로 자동 추종 (위 환경변수 절 참조).

### Lint — ESLint + React Compiler 진단 [coverage: medium — 1 source]

[eslint.config.mjs](../../apps/mobile/eslint.config.mjs) (신규) 가 `@repo/config/eslint/react` flat config 를 그대로 확장한다. 추가 규칙:

- `@typescript-eslint/no-require-imports: 'off'` — RN 은 에셋·조건부 네이티브 모듈을 `require()` 로 부르는 게 관용적.
- **React Compiler 진단 룰** (eslint-plugin-react-hooks v7 recommended 에 포함) — `react-hooks/set-state-in-effect`, `set-state-in-render`, `refs`, `immutability` 을 **`warn`** 으로. Compiler 가 메모이즈 못 하는(bailout) 코드를 lint 단계에서 정적으로 잡아준다. 기존 코드에 위반이 남아 있어 우선 `warn` 으로 도입(회귀 방지 + 가시성, 강제 변경 X — 정리되면 `error` 승격 권장). `set-state-in-effect`/`set-state-in-render` 는 "useEffect 회피·파생 상태는 렌더 중 계산" 원칙과 직결.
- `ignores`: `dist/**`, `.expo/**`, `node_modules/**`, `babel.config.js`, `metro.config.js`.

`turbo lint` 가 web/friendly/api-contract/mobile 4/4 green — 이번 라운드에 앱이 마지막으로 ESLint 인프라에 연결됐다(자세한 베이스는 [config.md](config.md)).

### Metro 모노레포 설정 [coverage: high — 1 source]

`metro.config.js` 는 pnpm + workspace 환경에서 동작하기 위한 비표준 설정이 다수다 ([metro.config.js](../../apps/mobile/metro.config.js)):

- `watchFolders = [workspaceRoot]`
- `nodeModulesPaths` — 앱 로컬 + 워크스페이스 루트 + `node_modules/.pnpm/node_modules`
- `disableHierarchicalLookup = true` + `unstable_enableSymlinks = true` + `unstable_enablePackageExports = true`
- `blockList` 로 `.claude/`, `.git/`, `.turbo/`, `.expo/` 제외
- **커스텀 `resolveRequest`** — (1) `@repo/*` 의 `.js` 접미사 import 를 `.ts/.tsx` 로 매핑, (2) 플랫폼별 확장자 우선 탐색 (`.ios.tsx` → `.native.tsx` → `.tsx`, web 은 `.web.tsx` → `.tsx`)

Babel 은 `babel-preset-expo` + inline `replace-import-meta` 플러그인 + `react-native-reanimated/plugin` ([babel.config.js](../../apps/mobile/babel.config.js)). `babel-plugin-react-compiler` 는 preset-expo 의 experimental react-compiler 옵션 경로로.

## Talks To [coverage: high — 5 sources]

- **[`@repo/api-contract`](api-contract.md)** — zod 스키마/타입. 정산 도메인: `SharedSettlementSessionType`, `ReceiptItemCategoryType`, `SettlementSessionType`, `SettlementParticipantType`, `SettlementRoundType`, `SettlementContactType`, `SettlementDraftType`, `SettlementSessionSummaryType`. 맛집: `RestaurantPublicListItemType`, `RestaurantPublicDetailType`, `PublicVisitorReviewType`, `RestaurantPublicReviewSentimentType`, `RestaurantPublicReviewSortType`.
- **[`@repo/shared`](shared.md)** — API 클라이언트 (`configureApi`, `getApiConfig`), 인증·맛집 훅 (`useLogin`, `useRegister`, `useLogout`, `useCurrentUser`, `usePicks`, `useRandomPick`, `useRestaurantList`, `useRestaurantsPublic`, `useRestaurantPublic`, `useRestaurantPublicInsights`, `useRestaurantPublicReviews`, `useMenuRanking`, `useMapPublicConfig`), Zustand 스토어 (`useAuthStore`), UI (`Screen`, `Stack`, `Text`, `Button`, `Input`, `SegmentedControl`, `Divider`, `ErrorBanner`), `ThemeProvider`/`useTheme`/`Theme`. **정산 훅**: `useSettlement`, `useListSettlements`, `useListSettlementDrafts`, `useDeleteSettlement`, `useDeleteSettlementDraft`, `useSettlementDraft`, `useSharedSettlement`, `useSettlementContacts`, `useUpdateSettlementContact`, `useDeleteSettlementContact`, `useUploadReceipt`, `useExtractReceipt`, `setSettlementDraftStorage` (스토리지 어댑터 주입), `ApiError`.
- **[`@repo/utils`](utils.md)** — `computeBboxAround`, `isInKorea`, `formatWonPrice`, **`reviewThumbnailUrl`** (thumbUrl 이 base 와 조합), `resolveRestaurantCategoryKey`, `RestaurantCategoryKey`.
- **[friendly](friendly.md) 백엔드** — `EXPO_PUBLIC_API_URL` 로 baseUrl 주입. dev 는 LAN/localhost/web-hostname 자동 추종, production 은 `.env.production` 의 `https://ninelife.kr`. `/media/thumbnail` 썸네일 프록시 + `.well-known/{apple-app-site-association,assetlinks.json}` 응답도 friendly 가 책임.

## API Surface [coverage: high — 12 sources]

expo-router 파일 트리가 곧 라우트다.

| Route | File | 설명 |
|-------|------|------|
| `/` | [`app/index.tsx`](../../apps/mobile/app/index.tsx) | `useAuthStore` 보고 `/(tabs)/home` 또는 `/(auth)/login` 으로 Redirect |
| `/(auth)/login` | [`app/(auth)/login.tsx`](../../apps/mobile/app/(auth)/login.tsx) | 로그인/회원가입 + 게스트 진입 |
| `/(tabs)/home` | [`app/(tabs)/home.tsx`](../../apps/mobile/app/(tabs)/home.tsx) | Pick 리스트 + 랜덤 픽 |
| `/(tabs)/restaurants` | [`app/(tabs)/restaurants.tsx`](../../apps/mobile/app/(tabs)/restaurants.tsx) | 공개 맛집 — 풀스크린 WebView 지도 + 2-시트 적층 |
| `/(tabs)/profile` | [`app/(tabs)/profile.tsx`](../../apps/mobile/app/(tabs)/profile.tsx) | 사용자 정보 + 로그아웃. **로그인 시 '내 정산 이력' / '내 단골' 행** → `/settlement/history`, `/settlement/contacts` |
| `/restaurant/[placeId]` | [`app/restaurant/[placeId]/index.tsx`](../../apps/mobile/app/restaurant/[placeId]/index.tsx) | 식당 상세 (탭형 — 메뉴 탭 상단 정산 CTA) |
| `/restaurant/[placeId]/settle/new` | [`new.tsx`](../../apps/mobile/app/restaurant/[placeId]/settle/new.tsx) | 정산 신규 위저드 (placeId prefill) |
| `/restaurant/[placeId]/settle/[id]` | [`[id]/index.tsx`](../../apps/mobile/app/restaurant/[placeId]/settle/[id]/index.tsx) | 정산 결과 view |
| `/restaurant/[placeId]/settle/[id]/edit` | [`[id]/edit.tsx`](../../apps/mobile/app/restaurant/[placeId]/settle/[id]/edit.tsx) | 정산 편집 모드 |
| `/settlement/new` | [`app/settlement/new.tsx`](../../apps/mobile/app/settlement/new.tsx) | 식당 미지정 위저드 — Step2 에서 식당 검색 |
| `/settlement/history` | [`app/settlement/history.tsx`](../../apps/mobile/app/settlement/history.tsx) | `useListSettlements()` + `useListSettlementDrafts(true)` — FlatList, 헤더에 새 정산/이어 입력 draft |
| `/settlement/contacts` | [`app/settlement/contacts.tsx`](../../apps/mobile/app/settlement/contacts.tsx) | `useSettlementContacts()` 단골 검색/수정/삭제 — FlatList |
| `/share/settlements/[token]` | [`app/share/settlements/[token].tsx`](../../apps/mobile/app/share/settlements/[token].tsx) | **deep link 가로채기 대상** — `useSharedSettlement(token)` read-only view (비로그인 OK) |

`(auth)`/`(tabs)` 는 expo-router group(URL 영향 없음). 루트 Stack 은 `headerShown:false` + `headerBackButtonDisplayMode:'minimal'` 글로벌 적용 — 자식이 명시적으로 `<Stack.Screen options={{ headerShown: true, ... }} />` 로 덮어쓸 때만 헤더 노출 (식당 상세 / 정산 이력 / 단골 등).

라이브러리/유틸 export:

- `thumbUrl(url, width, quality?)` ([thumbUrl.ts](../../apps/mobile/src/lib/thumbUrl.ts)) — 네이버 phinf → friendly 썸네일 프록시 URL.
- `useTabBarHeight()` ([useTabBarHeight.ts](../../apps/mobile/src/hooks/useTabBarHeight.ts)) — 하단 탭바 높이(인셋 포함).
- `bootstrapApi()` ([api-setup.ts](../../apps/mobile/src/lib/api-setup.ts)) — 앱 부트스트랩.
- `Lightbox` ([components/Lightbox.tsx](../../apps/mobile/src/components/Lightbox.tsx)) — 공용 풀스크린 이미지 뷰어.

## Data [coverage: high — 4 sources]

- **인증 토큰**: AsyncStorage `lp:token`. 게스트는 `lp:guest='1'`.
- **정산 draft (zustand persist)**: `setSettlementDraftStorage(AsyncStorage)` 로 [`@repo/shared`](shared.md) 의 draft store 가 AsyncStorage 에 persist. 키는 shared 쪽 정의. 서버측 자동 저장 draft 는 `useListSettlementDrafts`/`useDeleteSettlementDraft` 로 이력 화면에서 관리.
- **정산 prefs**: [settlementPrefsStore.ts](../../apps/mobile/src/lib/settlementPrefsStore.ts) — AsyncStorage `lp:settlementPrefs`. `newParticipantExcludes` 만.
- **서버 상태**: TanStack Query 단일 client, staleTime/gcTime 은 [`@repo/shared`](shared.md) 상수, retry 1. 정산 도메인까지 같은 client 공유. 맛집 리뷰는 `useRestaurantPublicReviews` infiniteQuery(detail 의 `reviewsFirstPage` 를 seed).
- **이미지 캐시**: `expo-image` `cachePolicy="memory-disk"` + `recyclingKey`(원본 URL). 다운로드는 thumbUrl 프록시로 줄이고, 디스크 캐시로 재방문 0-network.

부트스트랩 흐름 ([api-setup.ts](../../apps/mobile/src/lib/api-setup.ts)):
1. **모듈 import 시점** — `setSettlementDraftStorage(AsyncStorage)` (동기 — 첫 store 접근 전 보장).
2. `bootstrapApi()` await:
   - `useSettlementPrefsStore.getState().hydrate()` 트리거 (fire-and-forget).
   - AsyncStorage 에서 토큰/게스트 hydrate.
   - `useAuthStore.subscribe` 로 양방향 sync.
   - `configureApi({ baseUrl, getToken, onUnauthorized })`.

## Key Decisions [coverage: high — 16 sources]

- **네이버 썸네일은 friendly 프록시 경유 (앱도 웹과 동일)** — 앱만 원본(최대 ~1.5MB)을 받던 격차를 `thumbUrl()` 로 메움. `*.pstatic.net` 만 프록시(allowlist), 그 외/base 미설정은 원본 폴백 — 깨진 이미지 대신 graceful degrade. 웹/앱이 `@repo/utils` 의 `reviewThumbnailUrl` 을 공유해 쿼리 포맷·프록시가 단일 SSOT.
- **목록은 FlatList 가상화** — 단골/정산 이력의 `ScrollView` 를 `FlatList` 로. 행을 별도 컴포넌트(`ContactRow`/`SessionRow`/`DraftRow`)로 추출해 (1) 보이는 행만 렌더, (2) React Compiler 가 행 단위로 메모이즈. 헤더(새 정산 버튼/draft 섹션)는 `ListHeaderComponent` 로.
- **상세는 단일 FlatList 스크롤 루트** — `Row` discriminated union 으로 리뷰만 가상화 + 무한 스크롤. 비-리뷰 탭은 한 행. `stickyHeaderIndices=[1]` 로 TabBar 고정, `minHeight = heroH + screenH` 로 짧은 탭에서도 hero 숨김 유지.
- **Lightbox 는 react-native-awesome-gallery + 공용 컴포넌트** — 직접 만든 FlatList 캐러셀로는 줌↔페이징↔닫기 제스처 충돌 조율이 까다로워 라이브러리로 대체. `restaurantDetail/Lightbox.tsx` → `components/Lightbox.tsx` 로 승격해 PhotosTab·ReviewCard 공용. 라이트박스는 원본 URL(확대라 thumbUrl 미적용).
- **단골 수정 시트는 key 리마운트로 폼 초기화** — `<ContactEditSheet key={editing?.id ?? 'closed'}>`. contact 가 바뀌면 부모가 key 로 시트를 리마운트하므로 `useState(contact?.name)` 초기값이 그대로 맞아 prop→state 동기화 useEffect 가 불필요 ([useEffect 회피 원칙](../schema.md)과 직결).
- **ESLint + React Compiler 진단을 warn 으로 도입** — 앱이 모노레포에서 마지막으로 ESLint 에 연결. bailout 룰을 `warn` 으로 두어 기존 코드 강제 변경 없이 신규 회귀만 잡고, 정리되면 `error` 승격. `turbo lint` 4/4 green.
- **정산은 mobile/web 양쪽 풀 구현** — 같은 [`@repo/shared`](shared.md) 훅 위에서 UI 만 다르게. 공유 페이지는 deep link 로 native 앱이 가로채고, 미설치 단말은 web SPA 로 동일 read-only view fallback.
- **Universal Links + App Links 패턴 + 짧은 공유 경로** — 공유 링크는 `/s/<token>` (짧은 경로). Android `intentFilters` 의 `pathPrefix: '/s/'` 가 트레일링 슬래시까지 줘서 `/s/<token>` 만 정확히 매칭. iOS `associatedDomains` 는 `EXPO_PUBLIC_ENABLE_APPLINKS === '1'` 일 때만 박는다 — 무료 Apple 팀은 capability 미지원이라 로컬 빌드에선 끈다(스킴 + 웹 fallback 은 항상 동작). 호스트는 `EXPO_PUBLIC_WEB_HOST` (기본 `ninelife.kr`). 호스트/깃발 변경 시 prebuild + 새 빌드 필요 — 네이티브 config 라 hot reload 불가. 서버측 `.well-known` 은 [friendly](friendly.md) 가 동적으로. 절차 전체는 [DEEP_LINK_SETUP.md](../../apps/mobile/DEEP_LINK_SETUP.md).
- **`tabs-layout.tsx` / `tabs-layout.web.tsx` 셔틀 분리** — `react-native-bottom-tabs` 같은 native-only 라이브러리는 web 번들에 들어가지 못한다. layout 파일은 두 줄 셔틀, 실제 구현을 `~/components/tabs-layout` 으로 옮겨 Metro 의 platform extension 우선 탐색이 native vs web 자동 선택. `useTabBarHeight.{ts,web.ts}` 도 같은 결.
- **Lucide inline SVG (web 탭 아이콘)** — Lucide npm 의존 없이 path 만 inline. stroke=currentColor 로 React Navigation 색 자동 적용. 컬러 이모지에 grayscale 안 먹는 OS 회피.
- **LAN IP 자동 추종 (Expo Web 한정)** — `window.location.hostname` 으로 friendly URL 도 같은 IP:3000 추론. friendly 의 CORS RFC1918 자동 허용과 짝이라 같은 LAN 의 폰에서 즉시 동작.
- **`setSettlementDraftStorage(AsyncStorage)` 는 모듈 import 시점에 동기 호출** — `bootstrapApi()` 의 `await` 안에 두면 첫 store 접근이 먼저 일어날 수 있어 persist 가 silently no-op. import 부수효과로 강제.
- **iOS 자동 백 라벨 글로벌 차단** — 루트 Stack 의 `screenOptions.headerBackButtonDisplayMode: 'minimal'` 로 모든 자식 라우트의 iOS 백 버튼이 chevron(<) 만. `(tabs)` 같은 group 디렉터리명이 라벨로 새는 회귀 + 최신 Apple HIG.
- **`.env.production` 을 Git 에 포함** — 운영 API URL 을 production 모드에서 자동 로드. `EXPO_PUBLIC_*` 만 인라인 — 어차피 번들에 박힘 — 평문 OK.
- **정적 PNG 에셋 무손실 압축** — `assets/icon.png`/`adaptive-icon.png`/`splash.png`/`splash-logo.png` (~946KB 절감). 번들/IPA 크기 + 콜드 스타트 디코딩 비용 절감.
- **Expo (bare RN 아님)** — EAS Build/Update 사용 위해 ([eas.json](../../apps/mobile/eas.json) 3 채널). 운영 빌드 절차 별도 문서 ([docs/production-build.md](../../apps/mobile/docs/production-build.md)).
- **Expo SDK 54 / RN 0.81 / React 19 + New Architecture + React Compiler 유지** — 이번 라운드 SDK 업그레이드 없음.
- **공통 로직은 `@repo/shared`, UI 는 플랫폼별** — 정산 도메인도 같은 원칙. Wizard step 시그너처/검증/계산은 shared 가, RN 시트/Pressable 만 mobile 이.
- **앱은 light only** — `ThemeProvider mode="light"`. **게스트 우선 진입** — 로그인 화면 최상단 "바로 시작하기 →".

## Gotchas [coverage: high — 16 sources]

- **`thumbUrl` 의 base 미설정 / 비-네이버 호스트는 원본 통과** — `getApiConfig().baseUrl` 이 아직 안 잡혔거나(부트 전) `*.pstatic.net` 이 아니면 원본 URL 을 그대로 반환한다. 의도된 폴백이지만, DC/자체 호스팅 이미지는 절대 프록시되지 않으므로 그쪽 다운로드는 안 줄어든다. 또 프록시 서버가 네이버 호스트만 allowlist(그 외 400) 하므로 호스트 매칭을 thumbUrl 이 먼저 걸러야 400 회피.
- **라이트박스는 thumbUrl 미적용 (원본 URL)** — 확대 보기라 의도적. PhotosTab/ReviewCard 가 `Lightbox images={...}` 로 넘기는 건 원본 배열이다. 썸네일 URL 을 넘기면 확대 시 흐릿해진다.
- **단골 수정 시트 — key 안 주면 stale 폼** — `<ContactEditSheet key={editing?.id ?? 'closed'}>` 의 key 가 빠지면 다른 단골을 연속으로 열 때 이전 입력값이 남는다(컴포넌트 재사용 + state 유지). prop→state 동기화 useEffect 를 안 쓰는 대가로 key 리마운트가 필수.
- **React Compiler 진단 룰은 현재 warn — 잔존 위반 존재** — `set-state-in-effect` 등 일부 위반이 코드에 남아 `warn` 으로만 보인다. 신규 코드는 위반 0 을 목표로 하되, lint 가 green 이어도 `warn` 카운트는 0 이 아닐 수 있음(`error` 가 아니라 빌드는 통과).
- **iOS Stack 의 auto back title 이 group/디렉터리명을 노출** — 라우트가 깊어지며 `(tabs)`, `[placeId]`, `settle` 디렉터리명이 그대로 iOS 백 라벨로 새던 회귀. 루트 Stack 의 `headerBackButtonDisplayMode: 'minimal'` 글로벌 적용으로 차단. 새 헤더 라우트에 명시 라벨이 필요하면 `<Stack.Screen options={{ headerBackTitle: '뒤로' }} />`.
- **`zustand` 의 `import.meta.env` 가 web 번들에서 SyntaxError** — Metro/babel-preset-expo 는 `import.meta` 를 변환하지 않고, web 출력은 `<script defer>` (not `type="module"`) 라 그대로면 부팅 실패. [babel.config.js](../../apps/mobile/babel.config.js) 의 inline `replace-import-meta` 가 모든 플랫폼에서 `{ env: { MODE: 'production' } }` 로 치환. 다른 라이브러리가 `import.meta` 를 의도하면 같은 치환에 영향.
- **iOS Universal Links 는 `EXPO_PUBLIC_ENABLE_APPLINKS=1` 안 켜면 동작 안 함** — 무료 Apple 팀 호환을 위해 기본 off. 로컬 무료 빌드에선 deep link 가 웹으로 fallback(스킴 + 웹 fallback 은 동작). 유료/EAS 빌드에서 켜야 Universal Links 매칭.
- **DEEP_LINK_SETUP 절차를 안 밟으면 deep link 가 그냥 브라우저로 fallback** — `app.config.ts` capability 만으로는 부족. (1) friendly 서버 env (`APP_TEAM_ID`/`APP_BUNDLE_ID`/`ANDROID_APP_PACKAGE`/`ANDROID_SHA256_FINGERPRINTS`), (2) `npx expo prebuild --clean`, (3) native build, (4) `pm get-app-links` / `am start` 검증. 어느 단계 빠지면 verification state 가 `unverified` 라 다이얼로그 또는 브라우저 직행. [DEEP_LINK_SETUP.md](../../apps/mobile/DEEP_LINK_SETUP.md) 트러블슈팅 매트릭스 참조.
- **`setSettlementDraftStorage` 주입 순서** — 모듈 import 시점(동기, 부수효과) 에 실행돼야 함. `bootstrapApi()` 같은 async 안에 두면 wizard 가 먼저 마운트되면서 첫 read/write 가 어댑터 주입 전에 일어나, zustand persist 가 in-memory 만 쓰고 silently 끝남 — 앱 재실행 시 draft 가 사라지는 형태로 표면화. 현재 [api-setup.ts](../../apps/mobile/src/lib/api-setup.ts) 가 모듈 최상위에서 호출.
- **`react-native-bottom-tabs` 는 native-only** — `@bottom-tabs/react-navigation` 까지 한 묶음이라 어떤 코드 경로로든 web 번들에 들어가면 `codegenNativeComponent` 가 web 에서 깨진다. 새 native-only 의존마다 `.web.tsx` 셔틀로 둘러야 함 — `tabs-layout`/`PublicRestaurantsWebMap`/`useTabBarHeight` 패턴.
- **식당 상세 디렉터리 승격 — import 경로 변경** — `app/restaurant/[placeId].tsx` 는 없다. `app/restaurant/[placeId]/index.tsx` + `settle/` 하위.
- **typedRoutes 는 첫 빌드 전엔 stale** — 새 라우트들이 `.expo/types/router.d.ts` 에 들어오기 전엔 typecheck 가 깨질 수 있다. MenuTab CTA 의 `router.push(... as never)` 캐스트가 그 때문.
- **`EXPO_PUBLIC_WEB_HOST` / `EXPO_PUBLIC_API_URL` 변경 시 재빌드 필수** — associatedDomains/intentFilters 는 네이티브 config 라 hot reload 불가, API URL 은 Metro 가 빌드 시 인라인. dev 서버 재시작, Release/EAS 는 재빌드.
- **`.env.production` 은 평문 — 시크릿 금지** — `EXPO_PUBLIC_*` 만 인라인되고 어차피 추출 가능. JWT/DB 패스워드는 서버 env 로. **EAS 클라우드 빌드는 로컬 `.env.production` 못 읽음** — `eas env:create --environment production` 로 별도 등록.
- **iOS Release 실기기 — 최초 1회 Xcode Team + 폰 "신뢰"** — `ios/` 는 gitignored 라 prebuild 가 다시 돌면 재설정 필요. **Android Release — 서명 충돌** — `INSTALL_FAILED_UPDATE_INCOMPATIBLE` → `adb uninstall com.niney.lifepickr` 후 재설치.
- **Metro 모노레포 설정은 한 묶음** — `watchFolders`, `disableHierarchicalLookup`, `unstable_enableSymlinks`, `unstable_enablePackageExports`, `.pnpm/node_modules` 포함, `.js → .ts/.tsx` 매핑, 플랫폼 확장자 우선 — 하나만 빠져도 깨진다.
- **shared `Comp.tsx` 셔틀의 native 오픽** — `Button.tsx` 처럼 `.web.tsx` 를 재export 하는 셔틀이 quad (`.types.ts` + `.tsx` + `.web.tsx` + `.native.tsx`) 패턴을 안 지키면 native 에서도 셔틀(=web 구현) 이 선택돼 `h1` Invariant.
- **루트 layout 이 `bootstrapApi` 끝까지 `null` 반환** — `expo-splash-screen` hide 타이밍이 어긋나면 잠깐 흰 화면. 현재 명시적 `SplashScreen.hideAsync` 없음.
- **`react-native-awesome-gallery` 는 RN Modal 안에서 `GestureHandlerRootView` 필수** — Modal 은 앱 루트와 분리된 네이티브 계층이라 루트의 GestureHandlerRootView 가 안 미친다. 라이트박스가 핀치/스와이프 안 먹으면 십중팔구 이 래핑 누락. 또 `renderItem` 에서 `setImageDimensions({ width, height })` (`onLoad`)를 안 부르면 갤러리가 contain 배치·줌 경계를 못 계산해 이미지가 안 보이거나 줌이 깨진다.
- **상세 FlatList 의 `contentContainerStyle.minHeight = heroH + screenH`** — 짧은 탭(Info 등)으로 바뀌어도 hero 를 가린 위치까지 스크롤 가능 + 위로 클램프되지 않아 hero 숨김 유지. 빼면 짧은 탭에서 `scrollToOffset(heroH)` 가 바닥에 막혀 hero 재노출. `heroH` 는 hero `onLayout` 측정 — 측정 전(0) 엔 snap/scroll no-op.
- **`useTabBarHeight` 폴백은 `||` (not `??`)** — 탭 밖 deep-link route 면 context `undefined`, 탭 안이라도 측정 전 첫 프레임엔 Provider 초기값 `0`. 둘 다 홈 인디케이터 inset 을 바닥값으로 잡아야 첫 프레임부터 안 가리므로 `tabBarHeight || insets.bottom`. `??` 면 `0` 을 유효값으로 받아 첫 프레임 패딩 0. 탭바 높이는 항상 bottom inset 포함이라 `||` 가 under-pad 안 만듦.
- **`useBottomTabBarHeight()` 직접 호출 금지** — 탭 네비게이터 밖(`restaurant/[placeId]` 같은 deep-link route)에서 throw. `useTabBarHeight` 는 그래서 `BottomTabBarHeightContext` 를 `useContext` 로 직접 읽는다.
- **`noUncheckedIndexedAccess: true`** — 배열/객체 인덱스가 `T | undefined`.

## Sources [coverage: high — 53 sources]

설정·빌드:
- [apps/mobile/package.json](../../apps/mobile/package.json) — *modified: react-native-awesome-gallery ^0.4.3, eslint 10 추가*
- [apps/mobile/app.config.ts](../../apps/mobile/app.config.ts) — *modified: deep-link pathPrefix /s/, associatedDomains EXPO_PUBLIC_ENABLE_APPLINKS 깃발 게이팅, expo-image-picker/expo-splash-screen plugin*
- [apps/mobile/eslint.config.mjs](../../apps/mobile/eslint.config.mjs) — *NEW (@repo/config/eslint/react + React Compiler 진단 warn)*
- [apps/mobile/metro.config.js](../../apps/mobile/metro.config.js)
- [apps/mobile/babel.config.js](../../apps/mobile/babel.config.js) — *replace-import-meta inline plugin*
- [apps/mobile/eas.json](../../apps/mobile/eas.json)
- [apps/mobile/tsconfig.json](../../apps/mobile/tsconfig.json)
- [apps/mobile/.env.example](../../apps/mobile/.env.example)
- [apps/mobile/.env.production](../../apps/mobile/.env.production)
- [apps/mobile/docs/production-build.md](../../apps/mobile/docs/production-build.md)
- [apps/mobile/DEEP_LINK_SETUP.md](../../apps/mobile/DEEP_LINK_SETUP.md)
- [apps/mobile/plugins/with-android-minify.js](../../apps/mobile/plugins/with-android-minify.js)
- [apps/mobile/plugins/with-swift-concurrency-fix.js](../../apps/mobile/plugins/with-swift-concurrency-fix.js)
- *(에셋 PNG 무손실 압축 — assets/icon.png / adaptive-icon.png / splash.png / splash-logo.png)*

라우트 (app/):
- [apps/mobile/app/_layout.tsx](../../apps/mobile/app/_layout.tsx) — *BottomSheetModalProvider + headerBackButtonDisplayMode minimal*
- [apps/mobile/app/index.tsx](../../apps/mobile/app/index.tsx)
- [apps/mobile/app/(auth)/_layout.tsx](../../apps/mobile/app/(auth)/_layout.tsx)
- [apps/mobile/app/(auth)/login.tsx](../../apps/mobile/app/(auth)/login.tsx)
- [apps/mobile/app/(tabs)/_layout.tsx](../../apps/mobile/app/(tabs)/_layout.tsx) — *shim*
- [apps/mobile/app/(tabs)/home.tsx](../../apps/mobile/app/(tabs)/home.tsx) — *useTabBarHeight 하단 패딩*
- [apps/mobile/app/(tabs)/restaurants.tsx](../../apps/mobile/app/(tabs)/restaurants.tsx) — *useTabBarHeight + List=BottomSheetFlatList 주입*
- [apps/mobile/app/(tabs)/profile.tsx](../../apps/mobile/app/(tabs)/profile.tsx) — *정산 이력 / 내 단골 메뉴 + useTabBarHeight*
- [apps/mobile/app/restaurant/[placeId]/index.tsx](../../apps/mobile/app/restaurant/[placeId]/index.tsx)
- [apps/mobile/app/restaurant/[placeId]/settle/new.tsx](../../apps/mobile/app/restaurant/[placeId]/settle/new.tsx)
- [apps/mobile/app/restaurant/[placeId]/settle/[id]/index.tsx](../../apps/mobile/app/restaurant/[placeId]/settle/[id]/index.tsx)
- [apps/mobile/app/restaurant/[placeId]/settle/[id]/edit.tsx](../../apps/mobile/app/restaurant/[placeId]/settle/[id]/edit.tsx)
- [apps/mobile/app/settlement/new.tsx](../../apps/mobile/app/settlement/new.tsx)
- [apps/mobile/app/settlement/history.tsx](../../apps/mobile/app/settlement/history.tsx) — *modified: ScrollView → FlatList 가상화 (SessionRow/DraftRow 추출)*
- [apps/mobile/app/settlement/contacts.tsx](../../apps/mobile/app/settlement/contacts.tsx) — *modified: ScrollView → FlatList 가상화 (ContactRow 추출) + ContactEditSheet key 리마운트*
- [apps/mobile/app/share/settlements/[token].tsx](../../apps/mobile/app/share/settlements/[token].tsx) — *deep link target*

컴포넌트·라이브러리:
- [apps/mobile/src/lib/thumbUrl.ts](../../apps/mobile/src/lib/thumbUrl.ts) — *NEW (네이버 phinf → friendly 썸네일 프록시, ~98% 절감)*
- [apps/mobile/src/lib/api-setup.ts](../../apps/mobile/src/lib/api-setup.ts) — *setSettlementDraftStorage + LAN IP web 추론*
- [apps/mobile/src/lib/settlementPrefsStore.ts](../../apps/mobile/src/lib/settlementPrefsStore.ts)
- [apps/mobile/src/components/tabs-layout.tsx](../../apps/mobile/src/components/tabs-layout.tsx)
- [apps/mobile/src/components/tabs-layout.web.tsx](../../apps/mobile/src/components/tabs-layout.web.tsx) — *Lucide inline SVG*
- [apps/mobile/src/components/Lightbox.tsx](../../apps/mobile/src/components/Lightbox.tsx) — *PROMOTED (was restaurantDetail/Lightbox.tsx) — react-native-awesome-gallery 공용 라이트박스*
- [apps/mobile/src/components/PublicRestaurantCard.tsx](../../apps/mobile/src/components/PublicRestaurantCard.tsx) — *modified: thumbUrl(w=240)*
- [apps/mobile/src/components/PublicRestaurantsWebMap.native.tsx](../../apps/mobile/src/components/PublicRestaurantsWebMap.native.tsx) — *modified: 내 위치 권한/HTTP UX*
- [apps/mobile/src/components/PublicRestaurantsWebMap.web.tsx](../../apps/mobile/src/components/PublicRestaurantsWebMap.web.tsx)
- [apps/mobile/src/components/publicRestaurantsMapHtml.ts](../../apps/mobile/src/components/publicRestaurantsMapHtml.ts)
- [apps/mobile/src/components/RestaurantsFloatingHeader.tsx](../../apps/mobile/src/components/RestaurantsFloatingHeader.tsx)
- [apps/mobile/src/components/NotchFade.tsx](../../apps/mobile/src/components/NotchFade.tsx)
- [apps/mobile/src/components/restaurantDetail/PublicRestaurantDetail.tsx](../../apps/mobile/src/components/restaurantDetail/PublicRestaurantDetail.tsx) — *modified: 단일 FlatList + Row union + 가상화 리뷰 무한 스크롤 + hero thumbUrl(w=900)*
- [apps/mobile/src/components/restaurantDetail/ReviewsControls.tsx](../../apps/mobile/src/components/restaurantDetail/ReviewsControls.tsx)
- [apps/mobile/src/components/restaurantDetail/InfoTab.tsx](../../apps/mobile/src/components/restaurantDetail/InfoTab.tsx) — *modified: thumbUrl(w=240) 블로그 썸네일*
- [apps/mobile/src/components/restaurantDetail/PhotosTab.tsx](../../apps/mobile/src/components/restaurantDetail/PhotosTab.tsx) — *modified: thumbUrl(w=400) + ~/components/Lightbox import*
- [apps/mobile/src/components/restaurantDetail/shared/ReviewCard.tsx](../../apps/mobile/src/components/restaurantDetail/shared/ReviewCard.tsx) — *modified: thumbUrl(w=480) + ~/components/Lightbox import*
- [apps/mobile/src/components/restaurantDetail/MenuTab.tsx](../../apps/mobile/src/components/restaurantDetail/MenuTab.tsx) — *정산하기 CTA*
- [apps/mobile/src/components/restaurantDetail/shared/MenuGrid.tsx](../../apps/mobile/src/components/restaurantDetail/shared/MenuGrid.tsx)
- [apps/mobile/src/hooks/useTabBarHeight.ts](../../apps/mobile/src/hooks/useTabBarHeight.ts) — *native — react-native-bottom-tabs context*
- [apps/mobile/src/hooks/useTabBarHeight.web.ts](../../apps/mobile/src/hooks/useTabBarHeight.web.ts) — *web — @react-navigation/bottom-tabs context*
- [apps/mobile/src/hooks/useUserLocationNative.ts](../../apps/mobile/src/hooks/useUserLocationNative.ts)
- [apps/mobile/src/components/MenuRankingCard.tsx](../../apps/mobile/src/components/MenuRankingCard.tsx)
- [apps/mobile/src/components/settlement/SettlementWizard.tsx](../../apps/mobile/src/components/settlement/SettlementWizard.tsx)
- [apps/mobile/src/components/settlement/Step1Participants.tsx](../../apps/mobile/src/components/settlement/Step1Participants.tsx)
- [apps/mobile/src/components/settlement/Step2Rounds.tsx](../../apps/mobile/src/components/settlement/Step2Rounds.tsx)
- [apps/mobile/src/components/settlement/Step3Edit.tsx](../../apps/mobile/src/components/settlement/Step3Edit.tsx) — *영수증 Lightbox*
- [apps/mobile/src/components/settlement/Step4Review.tsx](../../apps/mobile/src/components/settlement/Step4Review.tsx)
- [apps/mobile/src/components/settlement/ContactPickerSheet.tsx](../../apps/mobile/src/components/settlement/ContactPickerSheet.tsx)
- [apps/mobile/src/components/settlement/ContactSuggestions.tsx](../../apps/mobile/src/components/settlement/ContactSuggestions.tsx)
- [apps/mobile/src/components/settlement/MenuPickerSheet.tsx](../../apps/mobile/src/components/settlement/MenuPickerSheet.tsx)
- [apps/mobile/src/components/settlement/RestaurantPickerSheet.tsx](../../apps/mobile/src/components/settlement/RestaurantPickerSheet.tsx)
- [apps/mobile/src/components/settlement/MultiReceiptSplitSheet.tsx](../../apps/mobile/src/components/settlement/MultiReceiptSplitSheet.tsx) — *영수증 Lightbox*
- [apps/mobile/src/components/settlement/RoundDiscountEditor.tsx](../../apps/mobile/src/components/settlement/RoundDiscountEditor.tsx)
- [apps/mobile/src/components/settlement/RoundCategoryAdjuster.tsx](../../apps/mobile/src/components/settlement/RoundCategoryAdjuster.tsx)
- [apps/mobile/src/components/settlement/RoundExceptionsEditor.tsx](../../apps/mobile/src/components/settlement/RoundExceptionsEditor.tsx)
- [apps/mobile/src/components/settlement/SettlementBreakdownTable.tsx](../../apps/mobile/src/components/settlement/SettlementBreakdownTable.tsx)
- [apps/mobile/src/components/settlement/SettlementShareSheet.tsx](../../apps/mobile/src/components/settlement/SettlementShareSheet.tsx)
- [packages/shared/src/hooks](../../packages/shared/src/hooks) — settlement 훅 + 맛집·인증 훅
