---
topic: web
last_compiled: 2026-08-30
sources_count: 191
status: active
aliases: [vite, react, web-app, frontend-web, AirQualityPage, air-quality-page, WeatherPage, weather-page, LifeMapPage, life-map-page, MealPage, meal-page, MealRecommendTab, MealPreferenceTab, MealPhotoImg, AccountMenu, account-menu, MyLocationChip, my-location-chip, top-bar-width-budget, 폭예산, nav-order, sidebar-account, useMapSheets, map-sheets, sheet-pattern, map-sheet-shell, useMediaQuery, useIsDesktopXl, map-bottom-inset, flyTo-bottomInset, fixedScale, marker-style-cache, AdminFoodPage, admin-food, admin-restaurant-search, ai-purpose-5, meal-photo, meal-recommend, compareReviewRecencyDesc, visitedAt-desc, handleUnauthorizedForCurrentSession, 401-current-session, lifeMapPrefsStore, lifeMapRecentStore, LifeGoToBox, LifeLayerBar, LifeNearbyList, LifeDetailCard, LifeMapView, AirNearbySection, AirStationsMap, AirHourStrip, AirHistoryChart, AirPrimitives, WeatherMeteogram, WeatherDailyStrip, WeatherNowHero, air-series-token, weather-temp-token, web-tests-77, matchMedia-mock, MapCanvas-mock, admin-discover, admin-auto-discover, admin-diningcode, admin-catchtable, panel-side-toggle, batch-crawl, naver-search-results, panelPrefsStore, usePanelSide, mobile-ux, route-split, korean-ime, lightbox-snap, body-scroll-mobile, ios-zoom-fix, canonical-merge, merge-proposal-queue, sticky-action-bar, fused-detail, show-on-map-button, restaurants-v2, bottom-sheet, joblog-tab, restaurant-crawl-logs-section, summary-cancel-button, summary-resume-button, public-restaurant-list-split, location-based-first-entry, public-reviews-pagination, settlement, settlement-stepper, settlement-share, settlement-history, ContactsPage, ai-purpose, card-padding-fix, lightbox-dvh, map-zoom-label-toggle, settlement-rounds, N차, Step2Rounds, RoundDiscountEditor, RoundCategoryAdjuster, RoundExceptionsEditor, SettlementBreakdownTable, MultiReceiptSplitDialog, RestaurantSearchDialog, confirm-dialog, settlementPrefsStore, tailwind-dark-v4, single-field-participant, alias-toggle, multi-select-bulk-delete, ai-models-preview, z-30-sticky, breakdown-matrix, copy-attendances, 1차와동일, exclude-default-toggle, home-ranking-link, lightbox-portal, createPortal, sticky-stacking-context-trap, lightbox-backdrop-close, my-location-guide, geolocation-permission-change, insecure-context-http, code-splitting, route-lazy, AdminRoutes, manualChunks, codeSplitting-groups, vite8, rolldown, react-memo, interaction-hot-path, setQueryData-batch-merge, lightbox-promoted, eslint-web, react-compiler-lint, s-token-route, og-proxy, dark-mode-web, theme-store, lp-theme, MapLayerControl, midnight-layer, satellite-layer, vworld-dark, MyLocationButton, soft-tonal-variant, tonal-button, tonal-badge, detail-CategoryTree, insight-tip-filter, menu-filter, lightbox-thumbnail, card-borderless-tab, review-photo-fullwidth, card-click-flyto, card-doubleclick-zoom, flyToZoomIn, SubwayPage, subway-web, subway-station-search, subway-arrival-panel, subway-path-panel, subway-timetable, subway-congestion, SubwayLineBadge, SubwayStationsMap, SubwayNearbyBusSection, TransitTabs, transit-unified, TransitFavoritesSection, CrossSearchSection, TransitCrossToggleChip, transitFavExpandStore, transitCrossShowStore, transitMapViewport, ol-map-pooling, poolKey, overlayMarkers, tsconfig-noEmit, stale-js-emit, admin-scheduler-ui, ScheduleSection, cron-preset, schedule-sse, admin-category-tree-collapsed, AskTab, review-qa, review-ask, ReviewAskToaster, ResummarizeToaster, global-toaster, sonner, ClusterTopics, review-clusters, aspect-summary, InsightsTab, ModelPickerPopup, model-picker, AdminReviewSearchPage, review-search, rag-ops, AdminLogsPage, AdminLogRunDetailPage, AdminLogSettingsPage, operation-runs, joblog, log-retention, AdminTablingPage, AdminTablingTestPage, tabling, AdminTelegramPage, telegram-config, AdminAiUsagePage, LlmUsagePanel, llm-telemetry, ai-usage, RegionStatsPanel, RegionStatsMap, choropleth, sigungu-geo, region-stats, RandomCrawlSection, random-crawl, share-url-r, seo-preview, ask-tab, admin-test-accordion, BusPage, bus-web, bus-station-search, bus-nearby-mode, near-param, bus-favorites, bus-arrival-panel, bus-route-tracking, bus-vehicle-marker, map-marker-icon, VehicleMarker, follow-vehicle, MenuTab-groups, menuGroups, representative-menu-preview, review-noise-aspect, cluster-noise-fallback]
---

# web — Vite + React 웹 앱

**2026-08-17~08-30 변경 흡수 — 공개 라우트 4종(`/air` 대기정보 · `/weather` 날씨 · `/life-map` 일상지도 · `/me/meals` 내 식단) + 상단바 폭 예산·계정 메뉴·날씨/대기 통합 "내 위치" 칩 + 모바일 시트 패턴 통일(맛집 v2 → 버스·지하철·일상지도, `components/sheet/`) + 어드민(맛집 통합 검색 `q`·음식 카탈로그 `/admin/food`·AI 용도 5종·리뷰 최신순) + 테스트 13파일/77건**(apps/web 변경 75파일, `5e25cc0`·`0d72380`·`7340743`…`4fd6e22`):
- **공개 라우트 4종** — [App.tsx](../../apps/web/src/App.tsx) 에 `AirQualityPage`(`7340743`·`c6ac640`·`a4284aa`)·`WeatherPage`(`37e0db0`·`7704f8c`·`17f281a`)·`LifeMapPage`(`1d92acb`·`a21de10`·`4fd6e22`)·`MealPage`(`233c5a9`+`2e41e63`…`fd371d9`, `RequireUser`) 모두 `React.lazy`. 대기·날씨는 한 페이지에 공공 API 오퍼레이션별 섹션을 펼치는 "예시 페이지" 골격(`AirSection` eyebrow = 원천 오퍼레이션명, 날씨가 대기 프리미티브를 그대로 재사용), 일상지도는 OL 지도 한 장 + 패널/시트, 식단은 조회 전용 5탭(기록·달력·통계·추천·설정 — 입력은 앱). 컴포넌트 디렉터리 `components/{air(15)·weather(12)·life-map(8)}/` + `routes/meal/(5)`, 스토어 `lifeMapPrefsStore`(`lp:life-map-prefs` v2)·`lifeMapRecentStore`(`lp:life-map-recent`). 도메인은 [air-quality](air-quality.md)/[weather](weather.md)/[life-map](life-map.md)/[meal](meal.md) — 여기선 페이지 골격·URL state·스토어·테스트만. **넷 다 앱에도 대응 화면이 있다**(`e348032`·`88751cd`, [mobile](mobile.md)) — 아래 19차 서술의 "버스·지하철 웹 전용"도 2026-07 이후 앱 대중교통 화면이 생겨 더는 사실이 아니다(본문 정정).
- **상단바·사이드바 재설계(`9e197d3`·`4d35a57`·`69ed65f`·`a062e7d`)** — 공개 NAV 순서 홈·맛집·대중교통·일상지도·**날씨→대기질**(`69ed65f`)·식단(로그인만). [PublicTopBar](../../apps/web/src/components/PublicTopBar.tsx) 에 **폭 예산** 주석·구현: `<md` 는 [≡][로고]···[칩]만(테마·로그인/계정은 [PublicSidebar](../../apps/web/src/components/PublicSidebar.tsx) 하단 `md:hidden` 블록으로), `md~lg` + 테마·계정 메뉴, `lg+` NAV 가로 펼침 + 칩 확장, `xl+` 계정 트리거에 이메일. 넘치면 버튼 대신 칩이 줄어들도록 왼쪽 묶음 `shrink-0`/오른쪽·칩 `min-w-0`. 신규 [AccountMenu](../../apps/web/src/components/AccountMenu.tsx)(이메일·내 정산·관리자·로그아웃 디스클로저 — 바깥 클릭·ESC·선택으로 닫힘, 헤드리스 라이브러리 없음). [MyLocationChip](../../apps/web/src/components/weather/MyLocationChip.tsx) 은 저장한 내 위치(로그인 서버/게스트 로컬 — [air-quality](air-quality.md))의 날씨·대기를 **알약 하나, 링크 둘**(`/weather?ll=` · `/air?sido=&station=`)로, 자료 없는 세그먼트는 조용히 빠짐(통합지수 결측 시 PM 등급 폴백은 shared 훅 `useMyLocationGlance` — `4d35a57`). 테스트 3+3+4건.
- **시트 패턴 통일(`e84e4b9`)** — `restaurant-v2/BottomSheet.tsx` → [sheet/BottomSheet.tsx](../../apps/web/src/components/sheet/BottomSheet.tsx)(R100) + 신규 [sheet/useMapSheets.ts](../../apps/web/src/components/sheet/useMapSheets.ts)(목록/상세 두 시트 스냅 조율 — 상세 열리면 목록 스냅 기억→peek·숨김, 상세 half, 닫히면 복원; 렌더 중 파생이라 첫 프레임부터 half) + [lib/useMediaQuery.ts](../../apps/web/src/lib/useMediaQuery.ts)(`useIsDesktopXl`). `RestaurantsV2Page`·`BusPage`·`SubwayPage`·`LifeMapPage` 네 지도 페이지의 모바일이 같은 골격 — 상단바 subBar(탭·검색행)/헤더 아래 fixed 지도(`--map-bottom-inset`)/목록 시트(peek 120)/상세 시트(half, z 25). `MapCanvas.flyTo(..., { bottomInset })`·`fixedScale`·마커 Style 캐시(6000) 확장, `MapLayerControl`·따라가기 배지는 `--map-bottom-inset` 만큼 위로. [docs/mobile-public-restaurant-ux-v2.md](../../docs/mobile-public-restaurant-ux-v2.md) 표 갱신.
- **어드민** — [AdminRestaurantsPage](../../apps/web/src/routes/admin/AdminRestaurantsPage.tsx) 통합 검색(`5e25cc0` — `?q=` URL, `useRestaurantList({ q })` → `GET /api/v1/admin/restaurants?q=`, 가게명·카테고리·Place ID, 서버 응답 단축은 `9ccbe52` [friendly](friendly.md)). 신규 [AdminFoodPage](../../apps/web/src/routes/admin/AdminFoodPage.tsx)(`/admin/food`, `d53fbe3`·`31c56f7` — 어드민 청크 안 2차 lazy, 적재 잡 cron·통계·병합 충돌·인식 품질·카탈로그 표/인라인 편집/수기 등록, 테스트 7건; 도메인 [food](food.md)). [AdminAiKeysPage](../../apps/web/src/routes/admin/AdminAiKeysPage.tsx) 용도 5종(`cc8399a` — `meal-photo`·`meal-recommend` 추가), [AdminLogsPage](../../apps/web/src/routes/admin/AdminLogsPage.tsx) `FEATURE_LABEL` +3. `0d72380` 리뷰 최신순 — 크롤 배치 `setQueryData` 머지 뒤 `compareReviewRecencyDesc`(@repo/utils) 정렬, 어드민 상세 정렬 기본 `visitedAt-desc`(`fetchedAt-asc` 제거).
- **곁다리** — [main.tsx](../../apps/web/src/main.tsx) 401 처리가 `handleUnauthorizedForCurrentSession`(요청 시점 토큰 = 현재 토큰일 때만 `cancelQueries`+`queryClient.clear()`+`setMealDraftPrincipal(null)`+`clearSession` 같은 JS turn — `9f39d53`·`fd371d9`), [LoginPage](../../apps/web/src/routes/LoginPage.tsx) 게스트 진입 전 식단 draft principal 비움, [MyLocationButton](../../apps/web/src/components/restaurant/MyLocationButton.tsx) `timeout` 상태 분기(`67f14cf`), [tailwind.css](../../apps/web/src/styles/tailwind.css) `--air-series-1/2`·`--weather-temp/precip` 차트 계열색 토큰(라이트/다크 쌍).
- **테스트 13파일/77건** — 22차 29건 → 신규 PublicTopBar 3·PublicSidebar 3·MyLocationChip 4·AirNearbySection 6·WeatherPage 6·LifeMapPage 8(데스크톱 5 + `matchMedia` 목으로 모바일 시트 3)·MealPage 11·AdminFoodPage 7. 공통 기법: `MapCanvas` 를 `vi.mock`(forwardRef + no-op 핸들), `ResizeObserver` 스텁, sonner 목, 가짜 `EventSource`, MSW `onUnhandledRequest:'error'` 유지.

**2026-08-16~17 변경 흡수 — 웹 테스트 인프라 신설(vitest 4 + RTL + MSW, 24건) + vote 3화면 + 홈 확장(슬롯 픽·내 주변·즐겨찾기 스트립·가는 법 탭)**:
- **테스트 인프라(`716f4d8`·`bad1b9b`)** — apps/web 에 러너가 처음 생겼다. 별도 vitest.config 없이 **[vite.config.ts](../../apps/web/vite.config.ts) 에 test 필드 병합**(react 단일 인스턴스 강제 alias 를 테스트도 물려받아야 Invalid hook call 이 안 난다), web 은 Vite 8 이라 vitest **4.x**(다른 워크스페이스는 2.x). [src/test/setup.ts](../../apps/web/src/test/setup.ts) 함정: `@testing-library/jest-dom/vitest` 서브패스는 자기 위치에서 vitest 를 해석해 **엉뚱한 인스턴스의 expect 를 확장**한다(Invalid Chai property) — `expect.extend(matchers)` 직접 호출로 회피. MSW 는 [src/test/msw.ts](../../apps/web/src/test/msw.ts) 공용 server + **기본 핸들러 없음** + `onUnhandledRequest:'error'` — 각 테스트가 기대 요청을 명시하게 하는 정책(마운트 요청 회귀 감지를 겸함). 현재 29건: vote 3화면 20 + SmartPickSection 내 주변 게이트 4(geolocation/permissions 를 defineProperty 스텁, findBy 존재가 아니라 **waitFor(enabled 전이)** 로 대기) + [useMapResearch 타이밍 계약 5](../../apps/web/src/test/useMapResearch.test.ts)(`df9fcbd` — 지도 재검색 파이프라인의 shared 승격과 함께 처음 붙은 안전망: 첫 이탈 즉시 발사·간격 내 연속 이동 마지막 좌표 트레일링 1회·줌 부족 수동 강등·임계 이내 무발동·기준점 없음 비활성. 훅 정의는 [shared](shared.md)지만 shared 는 node 환경이라 훅 렌더 테스트는 소비처 web 에 둔다).
- **vote 3화면(`8951b31`+`6a3a022`)** — `/vote/new`(RequireUser, 검색·즐겨찾기에서 후보 2~8 선택)·`/vote/:token`(비로그인 투표, 15초 폴링)·VoteResultView(동점 슬롯 연출 + "결과 바로 보기" 탈출구 + 방장 전용 마감 크래시 복구 배너). 도메인은 [vote](vote.md).
- **홈 확장(7월, `fd8f1d3`·`56b1c22`·`4ec57c1`)** — "오늘 뭐 먹지?" 슬롯머신 픽(공개 smart-pick 개방, CSS transition + transitionend — useEffect 없음, picked:null 이면 클라 균등 폴백+뱃지, prefers-reduced-motion 시 릴 생략), 즐겨찾기 스트립 + "즐겨찾기에서 뽑기" 모드, **📍 내 주변 칩**(useUserLocation `auto:false` — 홈 진입만으로 권한 prompt 금지, poolReady 가드로 좌표 대기/placeholder 전환 중 낡은 풀 굴림 방지, 결과 카드 거리는 클라 haversine). 식당 상세 **"가는 법" 탭(`fa8f067`)** — [transit](transit.md) 참조.
- 곁다리 — 즐겨찾기 별 sticky 헤더 위 페인트 픽스(`e0c8975`, 카드 z-auto 스태킹 컨텍스트 함정), ImgWithFallback 실패 리셋 렌더 중 파생(8차), 검색 `useDebounced`(300ms) 공용 훅.

**2026-07-07 변경 흡수 — 대중교통 통합: 신규 `/subway` 전철 페이지(웹 전용) + `/bus`와 TransitTabs 서브탭 + 통합 즐겨찾기·주변 겸표시·검색 크로스(13~15차) + OL 지도 인스턴스 풀링(탭 전환 플래시 제거) + tsconfig noEmit 명시.** (1) **전철 페이지** — 신규 `/subway` 공개 라우트([SubwayPage](../../apps/web/src/routes/SubwayPage.tsx), `React.lazy`). 역 라이브 검색 + 주변(`near`) + 실시간 도착(30초) + 노선 추적(경유역 폴리라인·실시간 열차 알약·따라가기) + 역 시간표 + 시간대별 혼잡도 + 길찾기(경로 탐색 패널) + 즐겨찾기를 URL 쿼리(`q`/`stn`/`lineId`/`near`)에 동기화해 딥링크 복원. 컴포넌트는 [components/subway/](../../apps/web/src/components/subway/) (SubwayStationList·SubwayStationsMap·SubwayArrivalPanel·SubwayPathPanel·SubwayTimetable·SubwayLineBadge·SubwayNearbyBusSection + congestionUtils/timetableUtils). **앱(apps/mobile)은 미구현 — 버스와 동일하게 현재 웹 전용.** 도메인은 [subway](subway.md). (2) **TransitTabs 서브탭** — [components/transit/TransitTabs.tsx](../../apps/web/src/components/transit/TransitTabs.tsx) 가 `/bus`+`/subway` 를 "대중교통" 하나로 묶고, [PublicSidebar](../../apps/web/src/components/PublicSidebar.tsx)/[PublicTopBar](../../apps/web/src/components/PublicTopBar.tsx) 네비의 "버스"→"대중교통"(lucide `Bus`, `match: ['/bus','/subway']` 로 두 경로 활성 판정). (3) **통합 즐겨찾기 홈(13차)** — [TransitFavoritesSection](../../apps/web/src/components/transit/TransitFavoritesSection.tsx) 이 버스 정류장/정류장×노선 + 지하철 역/역×호선 4종을 양 탭 초기화면 공용 한 목록으로(도메인별 BusFavoriteSection/SubwayFavoriteSection 대체·삭제). 펼침(단일 아코디언) 시에만 도착 미리보기 30초 폴링. 펼침 상태는 [transitFavExpandStore](../../apps/web/src/stores/transitFavExpandStore.ts)(zustand, persist 없음) — 데스크톱/모바일이 CSS 숨김(`hidden xl:flex`/`xl:hidden`)으로 **동시 마운트**라 로컬 state 면 두 인스턴스가 갈라지므로 스토어로 승격, 같은 항목 펼쳐 같은 queryKey 구독 → React Query dedupe 로 네트워크 1회. (4) **주변 겸표시(14차)** — 버스 탭에 지하철역(청록·환승 이중링), 지하철 탭에 정류장(파랑) 마커를 함께. [MapCanvas](../../apps/web/src/components/restaurant/MapCanvas.tsx) 에 fit 제외 오버레이 레이어(`overlayMarkers`, opt-in — 별도 VectorSource 라 fitToMarkers extent 를 안 넓힘) 신설. 토글 칩([TransitCrossToggleChip](../../apps/web/src/components/transit/TransitCrossToggleChip.tsx))은 [transitCrossShowStore](../../apps/web/src/stores/transitCrossShowStore.ts)(persist `lp:transit-cross-show`, 기본 on) 하나로 양 탭·양 레이아웃 공유. (5) **검색 크로스 섹션(15차)** — 각 탭 검색 결과 하단에 상대 도메인 크로스([CrossSearchSection](../../apps/web/src/components/transit/CrossSearchSection.tsx) — 버스 탭 "지하철역 N건" 자동/지하철 탭 "정류장 N건" 제출 게이트). 검색 UX 통일: "타이핑=가능한 곳만 즉시, Enter·검색 버튼=이 검색어로 상대 도메인까지 확정" 한 문법을 양 탭에(지하철 검색바에 검색 버튼·IME 229 가드 추가). (6) **OL 지도 인스턴스 풀링(D안, `4128d6b`)** — 탭 전환=라우트 언마운트라 지도가 재생성돼 타일 재로드 플래시가 남던 것을, MapCanvas 언마운트 시 OL `Map` 을 파괴하지 않고 모듈 풀에 보관→다음 마운트가 `setTarget` 으로 이어받아 타일 캐시·뷰포트·레이어 선택 통째 유지. `poolKey` prop opt-in(미지정 식당·어드민 지도는 기존 동작 — 공용 컴포넌트 회귀 차단), 데스크톱/모바일 동시 마운트라 `transit-desktop`/`transit-mobile` 2키로 분리. (7) **tsconfig noEmit 명시(`01afd2d`)** — [tsconfig.json](../../apps/web/tsconfig.json) 에 `noEmit: true` 추가 — 타입체크 전용이고 번들은 Vite 가 담당하는데 tsc 가 `src` 옆에 `.js` 를 토해내던 사고(과거 일괄 emit 흔적 101개 정리)를 원천 차단(base 에 composite/references 없어 충돌 없음, `.gitignore` 2차 방어 유지). 대중교통 도메인 내부는 [transit](transit.md)/[subway](subway.md)/[bus](bus.md) — 아래는 **웹 UI/라우팅 관점**.

**2026-07-06 변경 흡수 — 19차: 서울시 버스 정류장 페이지(신규·공개, **웹 전용**) + 메뉴 그룹 렌더(그룹 섹션별) + 어드민 리뷰검색 "전부-노이즈 = 관점집계" 표기 수정.** (1) **버스 페이지** — 신규 `/bus` 공개 라우트([BusPage](../../apps/web/src/routes/BusPage.tsx), `React.lazy`). 정류장 검색 + 주변(`near`) + 실시간 도착정보(30초) + 노선 추적(형상 폴리라인·실시간 차량 마커·따라가기) + 즐겨찾기를 URL 쿼리(`q`/`stId`/`routeId`/`near`)에 동기화해 새로고침·공유·딥링크로 복원. 컴포넌트는 [components/bus/](../../apps/web/src/components/bus/) (BusStationList·BusStationsMap·BusArrivalPanel·BusFavoriteSection·BusFavoriteStar). 네비는 [PublicSidebar](../../apps/web/src/components/PublicSidebar.tsx) + [PublicTopBar](../../apps/web/src/components/PublicTopBar.tsx) 양쪽에 "버스"(lucide `Bus`). [MapCanvas](../../apps/web/src/components/restaurant/MapCanvas.tsx) 에 `MapMarker.icon`(data URL 직접) + `VehicleMarker` 전용 애니메이션 레이어 확장 — 식당 지도를 버스가 재사용. **앱(apps/mobile)은 미구현 — 현재 웹 전용.** 도메인(서울시 API 프록시·캐시·훅·계약)은 [bus](bus.md). (2) **메뉴 그룹 렌더** — [MenuTab](../../apps/web/src/components/restaurant/detail/MenuTab.tsx) 이 `detail.menuGroups` 를 그룹 섹션별로(그룹수·개수 헤더), [HomeTab](../../apps/web/src/components/restaurant/detail/HomeTab.tsx) 이 미리보기 '대표 메뉴'에서 '대표메뉴' 그룹을 우선. 도메인은 [menu-grouping](menu-grouping.md). (3) **어드민 리뷰검색 노이즈 표기** — [AdminReviewSearchPage](../../apps/web/src/routes/admin/AdminReviewSearchPage.tsx) 가 군집 "전부 노이즈"를 실패가 아니라 정상(공개는 관점집계 폴백)으로 — sky "관점집계" 배지 + 안내. 상세는 [review-clustering](review-clustering.md).

**2026-06-25 변경 흡수 — 18차: 공개 리뷰 QA(Ask 탭 + RAG) + 군집 토픽 분석 + 단건 재요약/질문 답변 전역 토스트 + 어드민 운영 콘솔 대폭 확장(리뷰 문맥검색·작업 로그·테이블링·텔레그램·LLM 사용량·지역 통계·자동 발굴 스케줄러) + 공유/SEO 짧은 URL `/r/:placeId`.** (1) **공개 상세 Ask 탭** — `tabs.ts` 에 `ask`(질문) 탭 신설(홈/분석/메뉴/리뷰/질문/사진/정보 7탭). [`AskTab`](../../apps/web/src/components/restaurant/detail/AskTab.tsx) 이 리뷰 근거 RAG QA — `useReviewQaReady`(LLM 호출 없는 ready 게이트) + `useReviewAskStore`(진행/결과 전역·영속) + 추천 질문 칩 + 확신도 배지·근거 인용·검증 제외 안내. (2) **분석 탭 군집 토픽** — [`InsightsTab`](../../apps/web/src/components/restaurant/detail/InsightsTab.tsx) 이 [`ClusterTopics`](../../apps/web/src/components/restaurant/detail/ClusterTopics.tsx)(`useRestaurantClusters` — tone 색 라벨·크기 막대, 전부 노이즈면 관점별 긍/부/중립 폴백) + `CategoryTree` 임베드. (3) **전역 토스트 watcher** — App 레벨 상주 [`ResummarizeToaster`](../../apps/web/src/components/ResummarizeToaster.tsx)(단건 재요약 sentiment 델타) + [`ReviewAskToaster`](../../apps/web/src/components/ReviewAskToaster.tsx)(질문 답변 완료 → '더보기' = Ask 탭 복귀) + sonner `<Toaster theme={themeMode}>` — 답이 느려 탭/페이지를 떠나도 결과를 놓치지 않게. [`ModelPickerPopup`](../../apps/web/src/components/restaurant/detail/ModelPickerPopup.tsx)(계열별 모델 칩 portal 팝업 — 단건 재요약·AI 키 공용). (4) **어드민 운영 콘솔 확장** — `AdminReviewSearchPage`(리뷰 문맥검색/enrich+군집+RAG 운영), `AdminLogsPage`/`AdminLogRunDetailPage`/`AdminLogSettingsPage`(작업 로그 통합 — feature별 run + 스텝 로그 + 보존기간), `AdminTablingPage`/`AdminTablingTestPage`(테이블링 — 다이닝코드와 동형), `AdminTelegramPage`(설정>텔레그램), `AdminAiUsagePage` + 어드민 전역 floating [`LlmUsagePanel`](../../apps/web/src/components/admin/LlmUsagePanel.tsx)(`useLlmTelemetry` SSE), `AdminHomePage`에 [`RegionStatsPanel`](../../apps/web/src/components/admin/RegionStatsPanel.tsx)(막대/표/지도 — `RegionStatsMap` choropleth+버블), `AdminAnalyticsPage`에 [`RandomCrawlSection`](../../apps/web/src/routes/admin/RandomCrawlSection.tsx)(자동 발굴 스케줄러). 사이드바 "테스트" 아코디언 그룹 + 신규 leaf 메뉴(AI 사용량/리뷰 문맥검색/테이블링/로그). (5) **공유/SEO `/r/:placeId`** — RestaurantsV2Page 를 부모로 재사용해 리스트만 숨기고 지도+상세 표시(서버 OG 미리보기 → 사람은 `/r` SPA). 각 도메인 내부 로직은 별도 토픽([review-search](review-search.md)/[review-clustering](review-clustering.md)/[analytics](analytics.md)/[schedule](schedule.md)/[random-crawl](random-crawl.md)/[crawl](crawl.md)) — 아래는 **웹 UI/라우팅 관점**.

**2026-06-06 변경 흡수 — 17차: 웹 다크 모드(localStorage 테마 스토어 + tailwind `@custom-variant dark` 명시 binding + vworld midnight/위성 레이어 토글) + soft tonal 색 variant(badge/button) + 분석 인터랙션(메뉴·방문팁 클릭 → 리뷰 필터, 메뉴 썸네일 → 라이트박스) + 상세 탭 카드 테두리 제거·리뷰 사진 풀폭(앱 통일) + 목록 카드 클릭=지도 이동/더블클릭=확대 + AdminAnalyticsPage 스케줄러 UI 통합.** (1) **다크 모드** — `lp:theme` localStorage 영속 [`useThemeStore`](../../apps/web/src/stores/theme.ts)(`light`/`dark` + `toggle`, `ThemeToggle` 가 `html.dark` 토글) + [tailwind.css](../../apps/web/src/styles/tailwind.css) 의 `@custom-variant dark` 명시 binding. vworld 지도가 테마를 따라 일반(`Base`)↔야간(`midnight`)으로 전환 + 좌하단 신규 [MapLayerControl.tsx](../../apps/web/src/components/restaurant/MapLayerControl.tsx)(일반/다크/위성 토글). 앱과는 디자인 토큰(@repo/shared)만 공유하고 저장소·구현은 분리([platform-ui-split](../concepts/platform-ui-split.md) 의 새 인스턴스). 지도 코어 상세는 [map](map.md). (2) **신규 컴포넌트** — `MapLayerControl`, [MyLocationButton.tsx](../../apps/web/src/components/restaurant/MyLocationButton.tsx)("내 위치" — 공개·어드민 발견 지도 공용, denied/insecure 구분 callout), [detail/CategoryTree.tsx](../../apps/web/src/components/restaurant/detail/CategoryTree.tsx)(식당별 메뉴 카테고리 트리). (3) **soft tonal variant** — [badge.tsx](../../apps/web/src/components/ui/badge.tsx)/[button.tsx](../../apps/web/src/components/ui/button.tsx) 에 blue/amber/violet/green/red/teal 6색 추가(무테두리+틴트배경, 토큰은 tailwind.css), 맛집·분석 어드민에 일괄 적용. (4) **분석 인터랙션** — 분석 탭 카테고리 트리 + 인기 메뉴/방문팁 클릭 → 해당 리뷰만 필터 + 메뉴 썸네일 탭 → 라이트박스. (5) **상세 탭 카드 테두리 제거 + 리뷰 사진 풀폭**(앱 통일). (6) **목록 카드 클릭=지도 fly-to / 더블클릭=확대**(`flyToZoomIn`) — 공개 + 어드민 발견 통일. (7) **AdminAnalyticsPage 스케줄러 UI** — cron preset/커스텀 + 다음 실행 preview + 지금 실행 + 이력 + live SSE(도메인은 [schedule](schedule.md)). 어드민 카테고리 트리 기본 접힘.

**2026-06-01 변경 흡수 — perf 라운드 (코드 스플리팅 + 핫패스 memo + 배치 setQueryData 머지) + Lightbox 공용화 + ESLint 인프라 연결.** (1) **라우트 코드 스플리팅** — [App.tsx](../../apps/web/src/App.tsx) 가 공개 진입(`/`, `/login`)과 셸(`PublicLayout`)만 메인 번들에 두고, 무거운 라우트(`RestaurantsPage`/`RestaurantsV2Page`/`RestaurantDetailRoute`/정산 5개 페이지/어드민 전체)를 `React.lazy` + 최상위 `<Suspense fallback={PageFallback}>` 로 분할. 어드민 16개 페이지 + OpenLayers(`ol`) 를 끌어오는 식당/정산 페이지가 메인 청크에서 빠져 익명 사용자가 받는 첫 청크가 대폭 작아진다. 어드민은 신규 [AdminRoutes.tsx](../../apps/web/src/routes/admin/AdminRoutes.tsx) 로 서브트리를 한 모듈로 묶어 단일 lazy 청크. [vite.config.ts](../../apps/web/vite.config.ts) 는 Vite 8 / Rolldown 의 `codeSplitting.groups` 로 vendor 청크 4개(`ol`/`react-vendor`/`query`/`radix`) 고정. (2) **interaction 핫패스 React.memo** — `PublicRestaurantCard` 가 `memo` 로 호버 시 80개 카드 통째 리렌더 차단, `AdminDiningcodePage` 의 `ResultCard` 가 `memo` + `toggleOne` 안정 `useCallback` 으로 체크박스/SSE 틱 시 해당 카드만 리렌더. (3) **크롤 배치 setQueryData 머지** — `AdminCrawlTestPage` 가 `visitor_batch` SSE 마다 `stream.lastPersistedBatch` 를 detail 캐시(`['restaurant', placeId]`)에 `setQueryData` 직접 머지(post-dedup 서버 id 그대로, 신규만 prepend) — 배치마다 리뷰 리스트 전체 re-GET 을 없앤다([stream-driven-cache-merge.md](../concepts/stream-driven-cache-merge.md) 의 새 인스턴스). (4) **Lightbox 공용화** — `components/restaurant/detail/Lightbox.tsx` → [components/Lightbox.tsx](../../apps/web/src/components/Lightbox.tsx) 로 승격(정산·상세 공용), `PhotosTab`/`shared.tsx` 가 `~/components/Lightbox` 로 import. portal/backdrop 닫기 동작은 아래 그대로. (5) **ESLint 연결** — 신규 [eslint.config.mjs](../../apps/web/eslint.config.mjs)(`@repo/config/eslint/react` flat config, React Compiler 진단 룰 warn) + `package.json` `lint` 스크립트 — `turbo lint` 합류(eslint ^10, vite ^8). (6) 다이닝코드 메뉴 컴포넌트의 Rules of Hooks 위반 수정.

**2026-05-31 변경 흡수 — 홈 랭킹 행 클릭 → 상세 진입 + 상세 리뷰 라이트박스 잘림(portal) / 바깥 클릭 닫기 + "내 위치" 버튼 권한·HTTP 막다른 길 해소.** (1) `HomePage` 의 `RankingRow` 가 `<Link to="/restaurants-v2/:placeId">` 로 감싸져 랭킹 한 줄을 누르면 신버전 맛집 레이아웃 상세로 진입 (Link 라 Cmd/Ctrl+클릭 새 탭·키보드 포커스 유지, hover 배경 강조). (2) 공개 맛집 상세 리뷰 라이트박스([components/Lightbox.tsx](../../apps/web/src/components/Lightbox.tsx) — 이번 라운드에 detail/ 에서 승격)가 `createPortal(…, document.body)` 로 빠졌다 — 데스크톱 상세는 `[리스트|상세|지도]` 3-컬럼이고 각 컬럼이 `position: sticky` 라 저마다 stacking context 를 만들어, `z-50` 이 상세 컬럼 안에서만 유효해 DOM 뒤의 지도 컬럼이 이미지 오른쪽을 덮어 잘렸다. body 로 빼면 컬럼 context 밖이라 전체 화면을 정상으로 덮는다. 더해 어두운 backdrop 클릭으로도 닫기 — `pointerdown` 좌표를 기록해 `click` 시 이동거리 10px 초과면 스와이프/드래그로 보고 닫지 않아(캐러셀 스와이프 끝의 click 으로 의도치 않게 닫히는 것 방지), 이미지·버튼 클릭도 제외. (3) `PublicRestaurantsMap` 의 "내 위치" 버튼([PublicRestaurantsMap.tsx](../../apps/web/src/components/restaurant/PublicRestaurantsMap.tsx))이 `denied`(권한 차단)와 `unavailable` 중 평문 HTTP(`insecure`)를 구분 — 둘 다 비활성 대신 클릭 시 해제 방법 callout 을 띄우고, denied 는 refetch 도 같이 걸어 사용자가 이미 설정을 풀어뒀으면 즉시 재시도(설정을 푸는 즉시 `useUserLocation` 의 permission `change` 구독이 자동 반영해 클릭조차 안 해도 버튼이 살아남). 손쓸 수 없는 진짜 미지원 `unavailable` 만 비활성 유지. 권한/HTTP 판정 로직 자체는 [shared.md](shared.md) 의 `useUserLocation`.

**2026-05-28 변경 흡수** — 정산 라우트가 **N차(차수) 모델**로 통째 리라이트:
`Step2Source.tsx`/`ParticipantEditDialog.tsx` 삭제 + `Step2Rounds.tsx` 신규 + 차수별
편집기(`RoundDiscountEditor`/`RoundExceptionsEditor`/`RoundCategoryAdjuster`) + 다중
영수증 분할 다이얼로그(`MultiReceiptSplitDialog`) + 식당 검색 다이얼로그
(`RestaurantSearchDialog`) + 정산표 매트릭스(`SettlementBreakdownTable`). Step1 은
단일 이름 필드 + 별칭 토글로 단순화 + Enter 로 다음 행 추가 + 새 행 기본 exclude
토글(`settlementPrefsStore` localStorage 영속). `useSettlementDraftAutoSync` /
`useSettlementDraftHydrate` 로 서버 임시저장 자동 동기화 — `/me/settlements` 상단에
"이어 입력" 행 추가. 결과/공유 헤더 z-index 10→30 (sticky 정산표 헤더와 충돌 fix) +
데스크톱 2-column 정산표 sticky. `confirm-dialog.tsx` 공용화로 인라인 `confirm()`/
`window.confirm` 점진 대체. Tailwind v4 dark variant 명시 binding
(`@custom-variant dark (&:where(.dark, .dark *))`) — `.dark` 클래스 토글 방식이라
v4 기본(미디어쿼리)으로는 안 됨. `AdminAiKeysPage` 모델 미리보기(`usePreviewModels`)
+ 모바일 카드 레이아웃 정돈. 추가: `/me/settlements/new` 라우트(식당 없이 독립
진입 — Step2 에서 1차 식당 검색 강제), `/restaurants/:placeId/settle/:id/edit`
(같은 SettlementNewPage 가 id 받으면 edit 모드).

**2026-05-25 변경** — 정산 라우트 15+ 파일 통째 신규 (`routes/settlement/`) +
라이트박스/지도/카드 패딩 UI 버그 3건 수정 + AI provider `purpose` (chat / image)
카드 분리. 정산 UI 패턴(4-step Stepper, Step1→Step3 점프, 공유 토큰 read-only,
참여자 수정 다이얼로그, 영수증 미리보기 JWT 우회) 만 web 토픽에서 다루고, 도메인
자체는 [settlement.md](settlement.md) 위임. `CardContent` 기본 `pt-0` 제거 + `Lightbox`
mount instant + dvh + slide w-full + `MapCanvas` declutter 해제 + 줌 14 라벨 토글.

**2026-05-19 변경** — 요약 운영 UI (중지/재개 + 7배지 + JobLogTab + RestaurantCrawlLogsSection) +
공개 맛집 v2 (`/restaurants-v2` + BottomSheet) + 위치 기반 첫 진입 + 공개 리뷰
페이지네이션 분리 + 공개 사이드바/탑바.

## Purpose [coverage: high — 10 sources]

`apps/web/`는 Life Pickr 서비스의 브라우저용 SPA다. 세 가지 사용 흐름을 한
번들 안에 담는다.

- **공개 사용자 화면** — 로그인 없이 누구나 접근 가능한 맛집 탐색 영역.
  - `/` HomePage — AI 분석된 리뷰의 긍정/부정 비율로 정렬한 식당 랭킹
  - `/restaurants` RestaurantsPage — 네이버 지도 패턴의 풀 뷰포트 검색 UI
  - `/restaurants-v2/:placeId?` — 모바일 시트 v2
  - **`/r/:placeId`** — 공유/SEO 대표 URL (리스트 숨기고 지도+상세부터)
  - 공개 맛집 상세 7탭: 홈/분석/메뉴/리뷰/**질문(Ask·RAG)**/사진/정보
  - **`/bus`** — 서울시 버스 정류장 검색·실시간 도착·노선 추적 (19차 신규. 처음엔 웹 전용이었으나 앱 대중교통 화면이 2026-07 에 생겨 지금은 양쪽 — [bus](bus.md))
  - **`/subway`** — 수도권 전철 역 검색·실시간 도착·노선 추적·시간표·혼잡도·길찾기 (`/bus`와 "대중교통" 서브탭으로 묶임, 앱도 있음 — [subway](subway.md))
  - **`/life-map`** — 일상지도: 전국 CCTV·공중화장실·병의원을 OL 지도 한 장에(뷰포트 점/셀 + 주변 목록 + 상세, 지역 이동 옴니박스). 24차 신규, 앱 화면도 있음 — [life-map](life-map.md)
  - **`/weather`** — 기상청 단기·중기예보 예시 페이지(실황·6시간·3일 메테오그램·열흘·중기전망·해상·발표 정보). 24차 신규 — [weather](weather.md)
  - **`/air`** — 에어코리아 대기정보 예시 페이지(측정소 지금·지도/내 주변·추이·시도 현황·전국 비교·나쁨 이상·예보·주간예보). 24차 신규 — [air-quality](air-quality.md)
  - 공개 NAV 순서(상단바 lg+ 가로 / 그 아래 드로어): 홈 · 맛집 · 대중교통 · 일상지도 · **날씨 · 대기질**(`69ed65f` 로 날씨가 앞) · 식단(로그인만)
  - `/login` LoginPage — 이메일 로그인 + 회원가입 + 게스트 진입
- **로그인 사용자 도구** — `RequireUser` 가드 (역할 무관).
  - `/restaurants/:placeId/settle/new|/:id|/:id/edit` — 정산 입력/결과/편집 (N차)
  - `/me/settlements`, `/me/settlements/new` — 정산 이력 + 식당 없이 독립 진입
  - `/me/contacts` — 단골 관리
  - **`/me/meals`** — 내 식단 조회 전용(기록·달력·통계·추천·설정 5탭). 기록(사진 인식)은 앱에서만 — [meal](meal.md)
  - `/s/:token` — 공유 토큰 read-only (인증 X, PublicLayout 밖)
- **어드민 콘솔** — `/admin/*`. 역할이 `ADMIN`인 계정만 접근. 운영 도구가 18차에
  대폭 확장됨:
  - 사용자/역할 + 어드민 홈 **지역 통계 위젯**(시/도·시군구 분포 — 막대/표/choropleth 지도)
  - canonical 단위 맛집 관리(병합·분리·삭제) + 다이닝코드/**테이블링** 정식 크롤링
  - 테스트(아코디언 그룹): 네이버 / 캐치테이블 / 다이닝코드 / 테이블링 / AI
  - 맛집 발견(네이버 PC 지도) + 맛집 자동 발견(AI 키워드 → 직렬 크롤)
  - AI 분석 관리(정규화→머지 스케줄러 + **자동 발굴 스케줄러**)
  - **음식 카탈로그**(`/admin/food`, 24차 — 공공 데이터 적재 잡·통계·병합 충돌·인식 품질·카탈로그 편집, [food](food.md))
  - **리뷰 문맥검색**(enrich + 군집 + RAG 운영), **작업 로그**(feature별 run + 스텝 로그 —
    24차에 `food-import`·`meal-recognition`·`meal-recommendation` 라벨 추가),
    **AI 사용량**(LLM 텔레메트리 — 전역 floating 패널 + 상세 페이지)
  - 설정: AI 키(`usePreviewModels` 모델 미리보기, 용도 5종 chat/image/log-analysis/**meal-photo**/**meal-recommend**) / 지도 키 / **텔레그램** / **로그 보존**
  - 등록 맛집 목록에 **통합 검색**(`?q=` — 가게명·카테고리·Place ID, 24차 `5e25cc0`)

`apps/mobile`(React Native)와 동일한 백엔드(`apps/friendly`)를 바라보며,
공통 도메인 로직은 `@repo/shared`에서 끌어 쓴다. 공개 페이지는 사용자
대상 — 디자인은 Pretendard + 네이버 지도 톤. 어드민은 운영 도구 — shadcn
디폴트 + system-ui.

## Architecture [coverage: high — 125 sources]

### 빌드 / 런타임

- **Vite 8 + Rolldown + `@vitejs/plugin-react`** — 정적 SPA 번들러. 번들러가
  esbuild/Rollup 에서 Rolldown 으로 — 객체형 `manualChunks` 대신
  `build.rollupOptions.output.codeSplitting.groups` 로 vendor 청크를 고정한다
  ([vite.config.ts](../../apps/web/vite.config.ts)).
- **React 19 + react-dom 19** — `createRoot`/`StrictMode`로 마운트.
- **TypeScript** (`@repo/config/tsconfig/react.json` 확장).
- 경로 별칭 `~/* → ./src/*`, extensions 우선 `.web.tsx`/`.web.ts`.
  `react`/`react-dom` 은 root `node_modules` 카피로 alias 강제 + `dedupe`
  (`react`/`react-dom`/`@tanstack/react-query`/`zustand`) — 워크스페이스 패키지가
  자기 카피를 끌어와 "Invalid hook call" 나는 걸 막는다.
- jsDelivr Pretendard variable + `lp:theme` localStorage FOUC 방지.
- **OpenLayers 10.9** — vworld JS SDK 대신 WMTS 직접. `ol` 은 식당/어드민 청크가
  공유하므로 codeSplitting 의 단일 `ol` vendor 청크로 모은다.
- **Tailwind v4** — `@custom-variant dark (&:where(.dark, .dark *))` 명시 binding
  ([tailwind.css](../../apps/web/src/styles/tailwind.css)). 이 한 줄이 없으면 v4
  기본(미디어쿼리 `prefers-color-scheme`)이 발동해 `.dark` 클래스 토글 방식과
  엇갈리고 `dark:bg-*` 같은 모든 utility 가 시스템 다크 사용자한테만 작동한다.
- **ESLint flat config** — [eslint.config.mjs](../../apps/web/eslint.config.mjs) 가
  `@repo/config/eslint/react` 를 펼치고 React Compiler 진단 룰(`set-state-in-effect`/
  `rules-of-hooks`/`purity` 등)을 `warn` 으로 도입. web 은 Vite babel 에 React
  Compiler 를 켜지 않았지만, 룰은 "메모이즈 가능한 코드인지"를 보는 것이라 품질·향후
  도입 대비로 유효(`config.md` 의 base 와 한 묶음). `**/*.js`(tsc stale 산출물) 는
  대상 제외. `pnpm --filter web lint` = `eslint .` 가 `turbo lint` 에 합류.

### 코드 스플리팅 — 라우트 lazy + vendor 청크 [신규 — perf]

[App.tsx](../../apps/web/src/App.tsx) 가 첫 로드 바이트를 줄이는 코드 스플리팅의
중심. 메인 번들에는 공개 진입(`/` `HomePage`, `/login` `LoginPage`)과 셸
(`PublicLayout`)만 남기고 나머지는 모두 `React.lazy`:

- `RestaurantsPage` / `RestaurantsV2Page` / `RestaurantDetailRoute` — `ol`(지도)을
  끌어오는 무거운 식당 페이지.
- 정산 5개 — `SettlementHistoryPage` / `ContactsPage` / `SettlementNewPage` /
  `SettlementResultPage` / `SharedSettlementPage`.
- 공개 공공데이터 페이지 — `BusPage` / `SubwayPage` / **`AirQualityPage`** / **`WeatherPage`** /
  **`LifeMapPage`**(OL 지도) + 로그인 전용 **`MealPage`**(24차 — 모두 `lazy(() => import(...).then((m) => ({ default: m.X })))` 명명 export 형태).
- 어드민 전체 — `lazy(() => import('./routes/admin/AdminRoutes'))` 단일 청크. 그 안에서
  **`AdminFoodPage` 만 한 번 더 `lazy`**(24차 `d53fbe3`) — 적재 잡·카탈로그 표·통계는 이
  페이지 전용이라 다른 어드민 페이지 진입 비용에 얹지 않는다. 폴백은 어드민 레이아웃
  안쪽 본문만 도는 `SectionFallback`(스피너).

최상위 `<Suspense fallback={<PageFallback/>}>`(중앙 스피너 — 페이지 자체 로딩
상태와 같은 모양이라 청크 로드→데이터 로드 전환 시 화면이 안 튄다)로 감싼다.
nested 상세(`/restaurants/:placeId`)는 부모 페이지가 `<Outlet>` 을 *자체*
`<Suspense>` 로 감싸 목록을 깜빡이지 않고 상세 패널만 로딩 표시한다
([RestaurantsPage.tsx](../../apps/web/src/routes/RestaurantsPage.tsx),
[RestaurantsV2Page.tsx](../../apps/web/src/routes/RestaurantsV2Page.tsx)).

[AdminRoutes.tsx](../../apps/web/src/routes/admin/AdminRoutes.tsx) — 어드민 전체
페이지 + `AdminLayout` 을 한 모듈로 모아 App 에서 1회만 lazy import. App 에
`path="/admin/*"` 로 마운트되므로 내부 라우트는 모두 `/admin` 기준 상대 경로
(`index === /admin`, `discover`/`auto-discover`/`restaurants`/`restaurants/:placeId`/
`crawl-test`/`catchtable-test`/`diningcode-test`/`tabling-test`/`diningcode`/`tabling`/
`analytics`/**`food`**(24차)/`ai-usage`/`logs`/`logs/:runId`/`ai-test`/`review-search`).
`settings` 는 자식 라우트를 갖는 중첩 레이아웃(`ai-keys`/`map`/`telegram`/`logs` 탭 +
`index` → `ai-keys` redirect). `Navigate` target 만 절대 경로 유지(옛 북마크 호환 —
`/admin/ai-keys` → `/admin/settings/ai-keys`). 18차에 `ai-usage`/`logs`/`review-search`/
`tabling`/`tabling-test` 라우트 + `settings/telegram`·`settings/logs` 탭 추가.

vendor 청크는 [vite.config.ts](../../apps/web/vite.config.ts) 의
`codeSplitting.groups` 4개로 고정 — `ol`(지도), `react-vendor`(react/react-dom/
react-router/scheduler), `query`(@tanstack), `radix`(@radix-ui). 자동 분할 위에
vendor 만 추가로 묶어, 앱 코드만 바뀌어도 벤더 캐시가 유지된다.

### 라우팅

`react-router-dom` v7을 `BrowserRouter`로 사용한다
([App.tsx](../../apps/web/src/App.tsx)). 셸은 두 갈래로 분기. 식당/정산/어드민
요소는 모두 `React.lazy`(위 코드 스플리팅 참조).

| Path | Element | Wrapper |
| --- | --- | --- |
| `/` | `HomePage` | `PublicLayout` |
| `/restaurants` | `RestaurantsPage` (Outlet 포함, lazy) | `PublicLayout` |
| `/restaurants/:placeId` | `RestaurantDetailRoute` → `PublicRestaurantDetail` (lazy) | ↑ (nested, 자체 Suspense) |
| `/restaurants-v2/:placeId?` | `RestaurantsV2Page` (Outlet, BottomSheet, lazy) | `PublicLayout` |
| **`/r/:placeId?`** | `RestaurantsV2Page` (공유/SEO — 리스트 숨김, 지도+상세, lazy) | `PublicLayout` |
| **`/bus`** | `BusPage` (버스 정류장 검색·도착·노선 추적 — lazy; 모바일은 시트 패턴) | `PublicLayout` |
| **`/subway`** | `SubwayPage` (전철 역 검색·도착·노선 추적·시간표·혼잡·길찾기 — lazy; 모바일은 시트 패턴) | `PublicLayout` |
| **`/air`** | `AirQualityPage` (에어코리아 대기정보 — `?sido=&station=&term=&code=`, lazy) | `PublicLayout` |
| **`/weather`** | `WeatherPage` (기상청 단기·중기예보 — `?p=지점id` 또는 `?ll=lat,lng`, `?sea=`, lazy) | `PublicLayout` |
| **`/life-map`** | `LifeMapPage` (전국 CCTV·화장실·병의원 지도 — `?ll=&z=&sel=layer:id`, lazy, OL) | `PublicLayout` |
| **`/me/meals`** | `MealPage` (내 식단 조회 — 기록/달력/통계/추천/설정, lazy) | `PublicLayout` + `RequireUser` |
| `/me/settlements` | `SettlementHistoryPage` (lazy) | `PublicLayout` + `RequireUser` |
| `/me/contacts` | `ContactsPage` (단골 관리, lazy) | `PublicLayout` + `RequireUser` |
| `/restaurants/:placeId/settle/new` | `SettlementNewPage` (4-step, N차, lazy) | `RequireUser` (단독) |
| **`/me/settlements/new`** | `SettlementNewPage` (식당 없이 진입) | `RequireUser` (단독) |
| `/restaurants/:placeId/settle/:id` | `SettlementResultPage` (저장 후 보기, lazy) | `RequireUser` (단독) |
| **`/restaurants/:placeId/settle/:id/edit`** | `SettlementNewPage` (edit 모드) | `RequireUser` (단독) |
| **`/s/:token`** | `SharedSettlementPage` (read-only, lazy) | (단독, 인증 X) |
| `/login` | `LoginPage` | (단독) |
| `/admin/*` | `AdminRoutes` (어드민 전체 단일 lazy 청크) | `RequireAdmin` |

`RequireUser` 는 token 만 보고 role 검사 X (정산은 USER 도 사용). `RequireAdmin` 은
역할까지 검증. 두 가드 모두 [App.tsx](../../apps/web/src/App.tsx) 안에 정의.

> **공유 토큰 SPA 경로가 `/share/settlements/:token` → `/s/:token` 으로 짧아졌다.**
> `/share/settlements/*` 는 이제 SPA 라우트가 아니라 **OG 미리보기 / 정산표 PNG**
> (Fastify 가 서버 렌더) 경로다 — dev 에서 [vite.config.ts](../../apps/web/vite.config.ts)
> 가 `/share/settlements` 를 백엔드(`:3000`)로 프록시하고, prod 는 nginx 가 동일
> prefix 를 Fastify 로 보낸다. 카카오톡 등에 링크를 붙이면 그 OG HTML 의 `og:image`
> 가 PNG 카드를 띄우고, 사람이 클릭하면 그 안의 링크가 `/s/:token` SPA 로 보낸다.
> 정산 공유 OG 렌더의 서버 쪽은 [settlement.md](settlement.md), [friendly.md](friendly.md).

`/me/settlements/new` 는 식당 없는 진입 — Step2 의 1차 차수 카드가 빈 식당으로
열려 사용자가 검색 다이얼로그로 직접 1차 식당을 고르게 한다.
`/restaurants/:placeId/settle/:id/edit` 는 같은 `SettlementNewPage` 가 `id` 가
있으면 edit 모드 — 저장된 세션을 fetch 해 draft 로 hydrate 후 4-step 진입.

### 정산 라우트 트리 [refactor — N차 모델로 리라이트]

`src/routes/settlement/` 가 차수(N차) 모델로 통째 리라이트. 한 정산 세션이
여러 차수(`rounds[]`)를 갖고, 각 차수가 자체 식당·source·discount·exceptions·
attendances 를 보관. web 토픽에서는 라우트 등록 + UI 패턴만 다루고, 도메인
(분배 규칙·서버 스키마·draftStore·`calculateMultiRoundShares`) 은
[settlement.md](settlement.md) 참조.

```
src/routes/settlement/
├── SettlementNewPage.tsx          # 4-step stepper 셸 (create/edit 분기 + draft hydrate)
├── Step1Participants.tsx          # 참여자 입력 (단일 필드 + 별칭 토글 + Enter 새 행)
├── Step2Rounds.tsx                # [NEW] 차수 카드 N개 — 식당/source/할인/제외/영수증
├── Step3Edit.tsx                  # 항목 편집 — 차수 탭으로 전환
├── Step4Review.tsx                # 분배 미리보기 + 저장 (fromDraftId 동시 정리)
├── SettlementResultPage.tsx       # 결과 — 좌(요약/차수별) + 우(sticky 정산표) 2-col
├── SettlementHistoryPage.tsx      # /me/settlements — 임시저장 + 완료 + 다중 삭제
├── SharedSettlementPage.tsx       # /share/settlements/:token — read-only (수정됨 배지)
├── ContactsPage.tsx               # /me/contacts — 단골 관리
├── ContactEditDialog.tsx          # 단골 한 명 편집
├── ContactPickerDialog.tsx        # 다중 선택 참여자 추가
├── ContactSuggestions.tsx         # 이름 입력 자동완성 드롭다운
├── RestaurantSearchDialog.tsx     # [NEW] 차수별 식당 선택 다이얼로그
├── MenuPickerDialog.tsx           # Step3 메뉴 추가 모달
├── MultiReceiptSplitDialog.tsx    # [NEW] 한 사진의 N개 영수증 분할 추출
├── RoundDiscountEditor.tsx        # [NEW] 차수별 할인 amount+category
├── RoundExceptionsEditor.tsx      # [NEW] 차수별 참여자 exclude override
├── RoundCategoryAdjuster.tsx      # [NEW] 분담 다듬기 — leftover 받을 사람 + 100/1000원 반올림
├── SettlementBreakdownTable.tsx   # [NEW] 참여자 × (차수×카테고리) 매트릭스
├── SettlementShareDialog.tsx      # 공유 토큰 생성/취소 + Copy/Web Share
└── SettlementCards.tsx            # 결과 페이지 공용 카드 — 차수별 + 수정됨 배지
```

삭제됨 (이전 컴파일에는 있었음):

- `Step2Source.tsx` — 직접 입력/영수증 단일 분기는 N차 모델에 흡수. 각
  차수 카드가 자체 source(MANUAL/RECEIPT) 를 갖는다.
- `ParticipantEditDialog.tsx` — 결과 페이지의 참여자 수정은 `/settle/:id/edit`
  진입(전체 4-step 재진입) 으로 통합. 인라인 다이얼로그 패턴 폐기.

### Step1Participants — 단일 필드 + 별칭 토글

이전: 이름 + 별명 두 칸 항상 노출. 지금: 기본 단일 "이름" 필드만,
같은 이름의 다른 사람을 구분하거나 단골에서 별칭이 같이 채워진 경우만
"+ 별칭" 으로 두 번째 칸 펼침. 95% 단순 케이스를 한 칸으로 끝낸다.

- Enter 로 다음 행 추가 + `nameRefs` Map 으로 새 행 input 에 focus 이동
  (`pendingFocusId` state + 다음 render 의 useEffect 가 ref 호출).
- 새 행의 기본 exclude (술/비주류/안주) 는
  [`settlementPrefsStore`](../../apps/web/src/stores/settlementPrefsStore.ts)
  가 localStorage 영속. 사용자가 매번 "비주류 제외" 토글하는 부담을 줄임.
  단골에서 추가하면 단골값이 우선이라 이 기본값은 무시.
- 자동완성 — 이름 input focus 시 `ContactSuggestions` 드롭다운 (해당 행
  하나만, `focusedClientId` 로 1개만 추적).

### Step2Rounds — 차수 카드 N개 [신규 — 핵심 UX]

[`Step2Rounds.tsx`](../../apps/web/src/routes/settlement/Step2Rounds.tsx) 가
이번 라운드의 중심 UX. 한 차수 = 한 카드, 카드 안에:

- **식당** — `RestaurantSearchDialog` 로 검색 후 선택. 식당 미선택이면 다른
  필드 비활성.
- **source 라디오** — MANUAL(직접 입력) / RECEIPT(영수증 사진). RECEIPT 선택
  시 사진 업로드 → 추출 → items prefill.
- **다중 영수증 분할** — 카드 외부 "한 사진에 영수증 N개" 버튼이 차수가
  2 개 이상이고 모든 차수에 식당이 잡혀 있을 때만 활성. `MultiReceiptSplitDialog`
  열림.
- **할인** — `RoundDiscountEditor` (amount + category, 단일).
- **제외 override** — `RoundExceptionsEditor` (마스터 exclude 와 별도, 차수별
  override).
- **참석자 토글** — 마스터 참여자 목록을 모두 노출, 체크박스로 차수별 참석
  결정. "1차와 동일" 버튼이 `copyRoundAttendancesFrom(round.clientId, '1차')`
  으로 1차 참석자 그대로 복사 — 4차 5차에서 같은 사람들이 계속 가는 경우 빠름.

차수 추가/삭제 + 최대 10차 enforced (zod schema). `+ 차수 추가` 가 식당 검색
다이얼로그를 먼저 띄우고 그 식당으로 새 차수 push.

게이팅: `rounds.length > 0 && rounds.every(r => r.source !== null)` 이면 다음
단계로. 한 차수라도 source 가 미정이면 Step3 진입 금지.

### Step3Edit — 차수 탭 + 항목 편집

[`Step3Edit.tsx`](../../apps/web/src/routes/settlement/Step3Edit.tsx) — 차수가
여러 개면 상단 sticky 탭으로 전환. 차수별로 기존 단일 차수 편집기와 같은
UI (`amount` × `name` × `category` × 삭제). `RoundDiscountEditor` 가 카드
하단에 같이 들어가 항목 추가/삭제 도중에도 할인을 바로 조정 가능.

영수증 미리보기는 차수별 `receiptPreviewToken` → `previewBlob` fetch →
`URL.createObjectURL` 패턴 그대로 (JWT 헤더 필요해 `<img src>` 직접 불가).

### Step4Review — 미리보기 + 저장 + draft 정리

[`Step4Review.tsx`](../../apps/web/src/routes/settlement/Step4Review.tsx) —
FE 에서 `calculateMultiRoundShares` 호출해 차수×참여자 분배를 즉시 계산해
보여준다 (서버도 저장 시 동일 계산 다시 — 단일 source of truth). 저장은
`useCreateSettlement({ fromDraftId })` 또는 `useUpdateSettlement(editingId)`.
`fromDraftId` 가 있으면 서버가 같은 트랜잭션 안에서 임시저장 draft 도 정리한다.

미리보기 도중 풀 초과 같은 invalid 상태도 calculator 의 `max(0)` 클램프로
그릴 수 있게 — 저장은 zod refine 에서 한 번 더 차단.

`RoundCategoryAdjuster` 가 차수별 카드에 들어가 1원 단위 잔여가 발생한
카테고리만 노출하고, "받을 사람" 선택 + 100/1000원 반올림 토글을 제공.
round(unit) 이 인원수로 떨어지는 unit 만 추천 칩 활성 — 안 떨어지면 회색.

### SettlementBreakdownTable — 정산표 매트릭스 [신규]

[`SettlementBreakdownTable.tsx`](../../apps/web/src/routes/settlement/SettlementBreakdownTable.tsx)
— 행 = 마스터 참여자, 열 = (차수 × 사용된 카테고리 + 차수 소계) × N차 + 총계.
하단에 합계 행. 이름·총계·합계 행은 `sticky left-0` / `sticky right-0` / `sticky bottom-0`
+ `z-10` 으로 가로 스크롤 시에도 보이게. 데스크톱(lg+) 에선
`SettlementResultPage` 가 2-column 레이아웃의 우측 sticky 패널로 띄워 좌측
스크롤 중에도 항상 정산표가 보인다 (`lg:sticky lg:top-[60px]`).

사용 카테고리만 컬럼 노출 — UNCATEGORIZED 가 한 번도 안 쓰였으면 컬럼 자체
빠진다. 데이터는 `calculateMultiRoundShares` 의 `perRound[].perCategoryShares` 를
매트릭스로 전개. 비참석/제외자는 0 = 빈 셀.

### SettlementResultPage — 차수별 카드 + sticky 정산표

[`SettlementResultPage.tsx`](../../apps/web/src/routes/settlement/SettlementResultPage.tsx)
— 헤더 `sticky top-0 z-30` (이전 z-10 → BreakdownTable 의 z-10 sticky 셀과
충돌해 헤더가 표 아래로 깔리던 회귀 fix). 데스크톱(lg+) 좌(요약·참여자·차수별
영수증/항목) + 우(정산표 sticky) 2컬럼. 모바일은 1컬럼 stack — 정산표는 가로
스크롤.

각 차수 카드: warning(분배 검증 실패 등) + 영수증 미리보기(RECEIPT 일 때) +
RoundItemsCard. 헤더 액션 = [이력] · [수정] · [공유] · [삭제]. "수정됨" 배지는
서버의 `updatedAt > createdAt` 기준으로 SettlementCards 가 표시.

### SettlementHistoryPage — 임시저장 + 완료 + 다중 삭제 [refactor]

[`SettlementHistoryPage.tsx`](../../apps/web/src/routes/settlement/SettlementHistoryPage.tsx)
— 1페이지 상단에 **"이어 입력" 임시저장 행** (`useListSettlementDrafts(true)`,
`PublicLayout` 안이라 PublicTopBar 도 같이 보임). 그 아래 완료된 정산 카드 리스트.
다중 선택 checkbox + 일괄 삭제 sticky 액션바 + 단건 휴지통 버튼 + 페이지/사이즈
변경 시 선택 자동 초기화. 삭제 확인은 신규 `ConfirmDialog` (이전엔 인라인
`confirm()` — focus/styling 문제 + async/cancel 불가).

일괄 삭제는 라운드트립 N번이지만 `useDeleteSettlement` 가 onSuccess 마다
invalidate → react-query 가 debounce → 마지막 한 번만 refetch.

### SharedSettlementPage — read-only + 수정됨 배지

[`SharedSettlementPage.tsx`](../../apps/web/src/routes/settlement/SharedSettlementPage.tsx)
— `/share/settlements/:token`. PublicLayout 밖 라우트라 TopBar 없음. 차수별
카드 렌더(영수증 미리보기는 서버가 응답에서 제외), 수정됨 배지 노출. 헤더는
`sticky top-0 z-30` 동일 패턴.

### ConfirmDialog 공용 컴포넌트 [신규]

[`components/ui/confirm-dialog.tsx`](../../apps/web/src/components/ui/confirm-dialog.tsx)
— fixed overlay + 외부 헤드리스 라이브러리 없이 ESC/배경 클릭 닫기, confirm/
cancel 두 버튼, `variant='destructive'` 일 때 confirm 버튼 빨강. `pending` prop 으로
액션 중 disable + 스피너. 인라인 `window.confirm()`/`window.alert()` 잔존을 점진적
대체 — 모바일에서 confirm() 의 폰트/포커스 이슈 + async/await 흐름과 어색하던 게
계기. 단 SettlementResultPage 의 삭제 confirm 은 아직 `window.confirm` (점진 마이그레이션).

### AdminAiKeysPage — 모델 미리보기

[`AdminAiKeysPage.tsx`](../../apps/web/src/routes/admin/AdminAiKeysPage.tsx) —
저장 전에 API 키만 입력한 상태에서 "모델 미리보기" 버튼을 누르면
`usePreviewModels(providerId, { apiKey, baseUrl })` (신규) 가 라이브로 모델
목록을 가져와 dropdown 에 채운다. 사용자가 모델을 골라 저장 — 저장 후엔
기존 `useProviderModels` 가 저장된 키로 다시 가져와 같은 dropdown 유지.

모바일 카드 레이아웃 정돈: 컬럼 collapse 순서, 버튼 정렬, 비밀번호 마스킹.
`{id, purpose}` 페어 단위 카드 + "다른 용도 추가" 패턴은 2026-05-25 라운드부터
유지.

### interaction 핫패스 memo / 공용 Lightbox [신규 — perf/공용화]

리스트가 큰 화면의 인터랙션 리렌더를 `memo` + 안정 콜백으로 잘라낸다:

- [`PublicRestaurantCard`](../../apps/web/src/components/restaurant/PublicRestaurantCard.tsx)
  가 `memo` — 카드 호버 시 부모(목록 페이지)가 `hoveredPlaceId` 변경으로 리렌더돼도
  호버된 카드만 props 가 바뀌고 나머지(≤80개)는 bail-out. 부모는
  [`PublicRestaurantList`](../../apps/web/src/components/restaurant/PublicRestaurantList.tsx)
  가 인라인 클로저 없이 안정 콜백(`placeId` 인자형)을 그대로 넘겨 memo 가 실제로 동작.
- [`AdminDiningcodePage`](../../apps/web/src/routes/admin/AdminDiningcodePage.tsx) 의
  `ResultCard` 가 `memo` + `toggleOne` 을 `useCallback([])`(함수형 업데이터라 deps 빔)
  으로 안정화 — 체크박스 토글/일괄저장 SSE 틱마다 잡에 속한 카드(`jobItem` 변경)만
  리렌더, `jobItem=null` 카드는 그대로.

라이트박스는 [`components/restaurant/detail/Lightbox.tsx`](../../apps/web/src/components/restaurant/detail/) →
[`components/Lightbox.tsx`](../../apps/web/src/components/Lightbox.tsx) 로 승격 (정산·상세
공용). 옛 경로는 삭제됨 —
[`PhotosTab`](../../apps/web/src/components/restaurant/detail/PhotosTab.tsx),
[`shared.tsx`](../../apps/web/src/components/restaurant/detail/shared.tsx) 가
`~/components/Lightbox` 로 import. portal(`createPortal(document.body)`) + scroll-snap
캐러셀 + dvh + backdrop pointerdown-거리 닫기 동작은 그대로(아래 Key Decisions).

### 다크 모드 — 테마 스토어 + 지도 레이어 [신규 — 17차]

웹 자체 다크 모드. [`useThemeStore`](../../apps/web/src/stores/theme.ts)(zustand) 가
`mode: 'light' | 'dark'` + `setMode`/`toggle` 을 들고 `lp:theme` localStorage 에
영속. 초기값은 `document.documentElement.classList.contains('dark')` 를 읽어
`index.html` 의 FOUC 방지 인라인 스크립트(`lp:theme` → `<html class="dark">`)와
일치시킨다. `ThemeToggle` 이 토글하면 `.dark` 클래스가 붙고, tailwind.css 의
`@custom-variant dark (&:where(.dark, .dark *))` 가 `dark:*` utility 를 발동.

[`MapCanvas`](../../apps/web/src/components/restaurant/MapCanvas.tsx) 가
`useThemeStore` 를 구독해 vworld 베이스 레이어를 테마에 맞춰 선택
(`layerForTheme`: light→`Base`, dark→`midnight`). 좌하단 신규
[`MapLayerControl`](../../apps/web/src/components/restaurant/MapLayerControl.tsx)
이 일반(`Base`)/다크(`midnight`)/위성(`Satellite`) 를 수동 토글 —
`userPickedLayerRef` 가 한 번 수동 선택되면 이후 테마 변경에 더 끌려가지 않는다.
레이어 변경은 **map 재생성 없이** `tileSourceRef.setUrl(buildVworldTileUrl(...))`
로 URL 만 교체 + `vectorSource.changed()` 로 마커 라벨만 재평가(`isDarkBaseRef` =
midnight/satellite 일 때 라벨 흰 글자 + 어두운 외곽선으로 반전). `layerControl`
prop 으로 컨트롤 노출 on/off(기본 true). 지도 코어 상세는 [map](map.md), 앱과의
디자인 토큰 공유는 [shared](shared.md) / [mobile](mobile.md).

### "내 위치" 버튼 공용화 — MyLocationButton [신규 — 17차]

[`MyLocationButton.tsx`](../../apps/web/src/components/restaurant/MyLocationButton.tsx)
가 공개 맛집 지도(`PublicRestaurantsMap`)와 어드민 발견 지도(`DiscoverMap`)에서
공유된다 (2026-05-31 라운드에 `PublicRestaurantsMap` 인라인으로 들어갔던 분기를
별도 컴포넌트로 추출 + 어드민에도 적용). `status`(`UserLocationStatus`) + `onClick`
(refetch) 두 props. denied(권한 차단)·insecure(`window.isSecureContext === false`,
평문 HTTP)는 비활성 대신 클릭 시 해제 방법 callout; pending 만 disabled; 나머지
unavailable 은 재시도 여지. 바깥 클릭(`document mousedown`)으로 callout 닫기. 판정
로직 자체는 [shared](shared.md) 의 `useUserLocation`.

### soft tonal 색 variant — badge/button [신규 — 17차]

[`badge.tsx`](../../apps/web/src/components/ui/badge.tsx) /
[`button.tsx`](../../apps/web/src/components/ui/button.tsx) 에 blue/amber/violet/
green/red/teal 6색 tonal variant 추가 — 무테두리 + 옅은 틴트 배경 + 같은 hue
텍스트. 색 토큰은 [tailwind.css](../../apps/web/src/styles/tailwind.css) 의
`--tonal-{color}-bg` / `-bg-hover` / `-fg`(oklch, `:root` 라이트 + `.dark` 다크
한 쌍). 맛집 어드민(`AdminRestaurantsPage`/`AdminRestaurantDetailPage`)·병합
(`CanonicalMergePanel`/`MergeProposalQueue`)·AI 분석 관리(`AdminAnalyticsPage`)에
일괄 적용 — outline/default 액션 버튼을 의미별 색으로 구분.

### 상세 분석 인터랙션 — 팁/메뉴 클릭 필터 + 카테고리 트리 + 라이트박스 [신규 — 17차]

[`PublicRestaurantDetail`](../../apps/web/src/components/restaurant/detail/PublicRestaurantDetail.tsx)
가 `tipFilter`/`menuFilter` state 를 들고(동시 1개만 활성 — 한쪽 고르면 다른
쪽 해제, 식당 변경 시에만 리셋) 탭 간 공유:

- **분석 탭(`InsightsTab`)** — 신규 `CategoryTree`(식당별 메뉴 카테고리 멘션 트리,
  `useRestaurantPublicCategoryTree(placeId)` 별도 endpoint, roots 비면 섹션 숨김,
  루트 depth 0 만 기본 펼침) + 인기 메뉴/방문팁(`AiSummary`)이 클릭 가능한 `<button>`
  으로 — 누르면 `onSelectTip`/`onSelectMenu` 가 reviews 탭으로 전환 + 그 term 으로
  리뷰 필터.
- **메뉴 탭(`MenuTab`)** — 메뉴 클릭 시 동일 필터.
- **리뷰 탭(`ReviewsTab`)** — `tip`/`menu` prop 으로 필터된 리뷰만 + `onClearTip`/
  `onClearMenu` 칩.
- **메뉴 썸네일 → 라이트박스** — 메뉴 썸네일 탭 시 공용 `~/components/Lightbox` 확대.

### 상세 탭 카드 테두리 제거 + 리뷰 사진 풀폭 (앱 통일) [17차]

`HomeTab`/`InfoTab`/`InsightsTab`/`ReviewsTab` 등에서 리스트 항목의 카드
`border` + `rounded-md` 를 제거하고 `divide-y divide-border`(구분선만) + 풀폭
패딩으로 — 앱(`apps/mobile`)의 탭 카드 스타일과 통일. 리뷰 사진도 카드 안 박스
대신 풀폭. [mobile](mobile.md) 참조.

### 목록 카드 클릭=지도 이동 / 더블클릭=확대 [17차]

[`PublicRestaurantCard`](../../apps/web/src/components/restaurant/PublicRestaurantCard.tsx)
에 `onZoom(placeId)` prop 추가 — `onClick` = 선택(지도 fly-to), `onDoubleClick`
= 확대. [`PublicRestaurantList`](../../apps/web/src/components/restaurant/PublicRestaurantList.tsx)
가 `onZoomItem` 으로 전달. 지도 쪽은 [`MapCanvas`](../../apps/web/src/components/restaurant/MapCanvas.tsx)
에 신규 imperative `flyToZoomIn(lat, lng, minZoom)` — fly-to 와 같지만 최소
`minZoom` 까지만 확대(이미 더 확대돼 있으면 줌 유지·중심만 이동, 줌아웃 안 함).
공개(`RestaurantsPage`/`RestaurantsV2Page`/`PublicRestaurantsMap`) + 어드민 발견
(`AdminDiscoverPage`/`DiscoverMap`/`DiscoverPanel`)에 통일 적용.

### AdminAnalyticsPage — 자동 실행 스케줄러 UI [신규 — 17차]

[`AdminAnalyticsPage`](../../apps/web/src/routes/admin/AdminAnalyticsPage.tsx) 에
`ScheduleSection` 통합 — 주기마다 "미분류 식당 정규화 → 전역 머지"를 자동 실행.
- **cron preset/커스텀** — 친화 프리셋 4개(매일 3시/정오/6시간마다/매시간) + 커스텀
  직접 입력. preset 에 없는 cron 이면 자동 커스텀 모드.
- **다음 실행 preview** — `useSchedulePreview(cron, tz, true)` 가 valid 여부 + 다음
  실행 시각.
- **활성/비활성 토글 + 지금 실행** — `useUpdateScheduleConfig` / `useRunScheduleNow`.
- **이력 + live SSE** — `useScheduleRuns`(inflightRunId) + `useScheduleRunEvents`
  로 진행 중 run 의 실시간 진척 + `ScheduleStatusChip`(done/failed/running/skipped/
  interrupted). 설정은 서버 DB 영속(재시작 유지).

스케줄러 도메인(서버 cron 등록·run 모델·SSE)은 [schedule](schedule.md). 어드민
카테고리 트리는 기본 접힘으로 변경(과도한 노출 방지).

### 공개 상세 Ask 탭 — 리뷰 RAG QA [신규 — 18차]

[`tabs.ts`](../../apps/web/src/components/restaurant/detail/tabs.ts) 에 `ask`(질문)
탭이 추가돼 공개 상세가 7탭(홈/분석/메뉴/리뷰/**질문**/사진/정보)이 됐다.
[`AskTab`](../../apps/web/src/components/restaurant/detail/AskTab.tsx) 은 식당 리뷰를
근거로 AI 가 답하는 RAG QA:

- **ready 게이트** — 탭 열릴 때 `useReviewQaReady(placeId)` 만 조회(LLM 호출 없음).
  enrich 안 된 식당은 "리뷰 분석이 준비되지 않았어요" 안내만, 준비된 식당은 근거
  리뷰 건수 노출.
- **질문/답변 전역 store** — `useReviewAskStore`(zustand + localStorage)가 진행 중
  요청(`inFlight`)·식당별 마지막 Q&A(`lastByPlace` — 최근 ~20개 영속)·에러를 보관.
  탭/페이지를 떠나도 살아남고 재진입 시 즉시 복원. 영속 복원된 '지난 답변'은
  `freshThisSession` 으로 구분해 "지난번 답변" 안내.
- **추천 질문 칩** — 주차/웨이팅/대표메뉴 등 ~29개 SUGGESTED 칩 클릭 = 즉시 질문.
  답변은 LLM 3콜(15초+)이라 pending 동안 "다른 화면 봐도 완료되면 알려드릴게요" 안내.
- **답변 렌더** — 확신도 배지(high/medium/low/none) + 본문 + 검증 가드레일(근거 부족
  N건 제외) + `<details>` 근거 리뷰 인용(rating·본문). 도메인은 [review-search](review-search.md).

### 분석 탭 군집 토픽 + 카테고리 트리 [신규 — 18차]

[`InsightsTab`](../../apps/web/src/components/restaurant/detail/InsightsTab.tsx)(분석
탭)이 [`ClusterTopics`](../../apps/web/src/components/restaurant/detail/ClusterTopics.tsx)
를 임베드 — `useRestaurantClusters(placeId)`(5분 캐시) 의 배치 군집 결과를
`clusters.data?.ready === true` 일 때만 조건부 렌더, 읽기만 한다(상호작용 없음):

- **군집 토픽** — 비슷한 문맥 리뷰를 묶은 라벨·카운트·대표리뷰. tone(positive/
  negative/mixed/neutral) 색 dot + 한글 라벨, 막대 너비 = 군집 크기 / 최대 군집.
- **관점별 폴백** — 토픽 군집이 안 잡히는(전부 노이즈) 식당은 `AspectSummary`
  (관점별 👍/👎/중립 누적 막대)로 폴백. 그것도 없으면 섹션 미표시.
- 17차의 `CategoryTree`(`useRestaurantPublicCategoryTree`) + 인기 메뉴/방문팁 클릭
  필터도 그대로. 군집 도메인은 [review-clustering](review-clustering.md).

### 전역 토스트 watcher — 재요약 / 질문 답변 [신규 — 18차]

비동기 결과(단건 재요약·공개 질문)가 탭/페이지 이탈에도 사용자에게 닿도록 **App
레벨에 상주하는 render-null watcher** 둘 + sonner `<Toaster>` 하나
([App.tsx](../../apps/web/src/App.tsx)):

- **sonner `<Toaster position="bottom-center" richColors theme={themeMode}>`** —
  `useThemeStore` 의 mode 를 받아 다크/라이트 배경 동기화. 실제 토스트 렌더는 이게 함.
- [`ResummarizeToaster`](../../apps/web/src/components/ResummarizeToaster.tsx) —
  `useResummarizeWatcher({ onResult })` 로 진행 중 단건 재요약을 지켜보다 완료 시
  토스트. 재분류로 리뷰가 현재 필터(예: 부정)에서 사라지기 직전 SSE 가 실어온
  새 분석을 "부정 → 긍정" 델타 + 만족도 + 모델로 보여준다. ReviewsTab 을 떠나도 동작.
- [`ReviewAskToaster`](../../apps/web/src/components/ReviewAskToaster.tsx) —
  `useReviewAskStore` 의 `completion`(seq 추적으로 중복 방지)을 구독, 답변 완료 시
  토스트 + '더보기'/'다시 보기' 액션 = `navigate('/restaurants/:placeId?tab=ask')`.
  **지금 그 식당 Ask 탭을 보고 있으면 토스트 생략**(화면에 이미 결과 — `window.location`
  을 직접 읽어 useLocation 구독 회피).

### ModelPickerPopup — 계열별 모델 선택 팝업 [신규 — 18차]

[`ModelPickerPopup`](../../apps/web/src/components/restaurant/detail/ModelPickerPopup.tsx)
— 단건 리뷰 재요약(ReviewsTab)과 설정>AI 키 화면 공용. `createPortal(document.body)`
(Lightbox 와 동일 — sticky 3-컬럼 stacking context 회피) + ESC 닫기 + 배경 클릭 닫기.
모델을 평면 리스트가 아니라 `groupModelsByFamily` 로 계열별 sticky 헤더 + 칩으로 묶어
보여준다. `models` prop 주입 시 자체 fetch 안 함, 미지정이면 저장된 `ollama-cloud`/
`chat` 키로 `useProviderModels` 직접 fetch(팝업 열릴 때만). 고르면 `onSelect(model)` →
호출자가 재요약 트리거.

### 어드민 콘솔 확장 — 신규 페이지 군 [신규 — 18차]

어드민 운영 페이지가 대폭 늘었다. 각 도메인 내부 로직은 별도 토픽이 다루고, 여기선
**페이지가 무엇을 렌더하고 어떤 hook 을 소비하는지**만.

- **리뷰 문맥검색** [`AdminReviewSearchPage`](../../apps/web/src/routes/admin/AdminReviewSearchPage.tsx)
  (`/admin/review-search`) — review-search/RAG 정식 운영 콘솔. 식당 선택 후
  **enrich**(관점+문맥+임베딩 영속) → **군집 실행** → **RAG 질문 테스트**(근거 인용·
  확신도·검증)를 한 화면에서. hooks: `useReviewSearchRestaurants`/`useEnrichReviews`/
  `useReviewEnrichBg`·`useReviewEnrichEvents`·`useReviewEnrichStatus`·`useReviewEnrichPending`/
  `useRunClustering`·`useClusterStatus`·`useClusterBg`·`useClusterPending`/`useReviewAsk`.
  standalone 시맨틱/관점 검색 UI 는 제거(검색은 RAG 내부에서만). 도메인은 [review-search](review-search.md).
- **작업 로그** [`AdminLogsPage`](../../apps/web/src/routes/admin/AdminLogsPage.tsx)
  (`/admin/logs`) — 모든 기능(crawl/summary/menu-grouping/settlement-extraction/
  auto-discover/schedule/global-merge/diningcode-bulk-save/random-crawl)의 run 을
  feature·status 필터 + Pager 로. `useOperationRuns`. 행 클릭 →
  [`AdminLogRunDetailPage`](../../apps/web/src/routes/admin/AdminLogRunDetailPage.tsx)
  (`/admin/logs/:runId`) — run 메타 + 무한 스크롤 스텝 로그(`useOperationRunLogs` +
  `flattenOperationLogPages`) + 리포트(severity) + `useAnalyzeRun`(실패 run 분석).
  `FEATURE_LABEL`/`RunStatusBadge`/`triggerLabel` 을 export 해 상세도 재사용.
  설정>로그 [`AdminLogSettingsPage`](../../apps/web/src/routes/admin/AdminLogSettingsPage.tsx)
  은 보존기간(1~365일, 매일 04시 정리) `useLogConfig`/`useUpdateLogConfig`.
- **테이블링** [`AdminTablingPage`](../../apps/web/src/routes/admin/AdminTablingPage.tsx)
  (`/admin/tabling`) + [`AdminTablingTestPage`](../../apps/web/src/routes/admin/AdminTablingTestPage.tsx)
  (`/admin/tabling-test`) — 다이닝코드 정식/테스트와 **동형 구조**. 검색 + 일괄 저장 잡
  (`useActiveTablingBulkSaveJobStore`/`useStartTablingBulkSave`/`useCancelTablingBulkSave`/
  `useTablingBulkSaveJob`) + 등록 목록(`useTablingRegistered`) + 단건 저장(`useSaveTablingShop`).
- **텔레그램** [`AdminTelegramPage`](../../apps/web/src/routes/admin/AdminTelegramPage.tsx)
  (`/admin/settings/telegram`) — 봇 토큰·chat-id 설정(`useTelegramConfig`/
  `useUpdateTelegramConfig`/`useDeleteTelegramConfig`/`useTestTelegram`/
  `useResolveTelegramChatId`), source 배지(db/env/none). 자동 발굴 후보 전송에 쓰인다.
- **AI 사용량** [`AdminAiUsagePage`](../../apps/web/src/routes/admin/AdminAiUsagePage.tsx)
  (`/admin/ai-usage`) — `useLlmTelemetry(true)` SSE 스냅샷을 큰 지면에 펼침(인메모리
  집계라 서버 재시작 시 리셋). 아래 floating 패널과 같은 React Query 캐시 공유.

### LlmUsagePanel — 어드민 전역 floating 사용량 패널 [신규 — 18차]

[`LlmUsagePanel`](../../apps/web/src/components/admin/LlmUsagePanel.tsx) 이
`AdminLayout` 최하단에 상주 — 어드민 어느 페이지에서나 떠 있다. `useLlmTelemetry(true)`
SSE 로 계정 동시성 게이트(inflight/limit/queued)·purpose별 게이트·진행 중 호출·
1분/5분/1시간 윈도우 집계·누적을 보여준다. 접힘(pill) ↔ 펼침 + 4코너 순환은
localStorage(`lp:llmUsagePanel:collapsed`/`-corner`)로 영속. connected dot(SSE 연결)·
busy ping 애니메이션. `/admin/ai-usage` 상세로 가는 링크. 도메인은 [ai](ai.md).

### 지역 통계 위젯 — 막대/표/choropleth [신규 — 18차]

어드민 홈([`AdminHomePage`](../../apps/web/src/routes/admin/AdminHomePage.tsx))에
[`RegionStatsPanel`](../../apps/web/src/components/admin/RegionStatsPanel.tsx) 위젯이
들어갔다 — 등록 가게의 시/도·시군구 분포. `useRegionStats` 1콜로 받아 3뷰 토글:

- **막대** — 시/도 레벨에서 행 클릭 = 그 시/도의 시군구로 드릴다운(ChevronLeft 로 복귀).
- **표** — 모든 시군구를 가게 수 내림차순 평탄화 + 비율 막대.
- **지도** — [`RegionStatsMap`](../../apps/web/src/components/admin/RegionStatsMap.tsx)
  (OpenLayers 직접 — `MapCanvas` 와 별개). 3 모드: `bubble`(시군구 중심 sqrt-스케일
  원+숫자), `markers`(가게별 점), `choropleth`(시군구 경계 색칠). choropleth 경계
  GeoJSON 은 [public/sigungu-geo.json](../../apps/web/public/sigungu-geo.json) 에서
  **지연 fetch**(메인 번들 영향 0), 카운트는 가게 좌표의 **point-in-polygon** 으로
  매겨 명칭 매칭 불필요. vworld 타일은 테마(light→Base/dark→midnight)를 따른다.
  GeoJSON 은 [build-sigungu-geo.mjs](../../apps/web/scripts/build-sigungu-geo.mjs) 가
  KOSTAT 2018 경계를 mapshaper 로 4% 단순화·필드 정리해 ~560KB 로 생성(빌드타임 1회).

### RandomCrawlSection — 자동 발굴 스케줄러 [신규 — 18차]

[`RandomCrawlSection`](../../apps/web/src/routes/admin/RandomCrawlSection.tsx) 이
[`AdminAnalyticsPage`](../../apps/web/src/routes/admin/AdminAnalyticsPage.tsx) 의
`ScheduleSection`(17차 정규화→머지 스케줄러) 옆에 추가됐다 — "맛집 자동 발굴" 운영
카드. 설정 시각마다 지역을 (랜덤/고정) 골라 검색 → 후보를 텔레그램으로 보내고,
사용자가 버튼으로 고른 가게만 크롤. cron 프리셋(일별 4개) + 커스텀 + `useRandomCrawlPreview`
다음 실행 미리보기 + 활성 토글/지금 실행(`useUpdateRandomCrawlConfig`/`useRunRandomCrawlNow`)
+ live 진행(`useRandomCrawlRunEvents`) + 이력(`useRandomCrawlRuns`). 지역 선택은 시/도·
시군구·동 각각 "랜덤/고정" — 부모가 랜덤이면 자식 고정 불가(cascade `normalizeRegion`).
지역 트리는 `useRegionTree`/`useRegionDongs`. 텔레그램 미설정이면 회차 자동 건너뜀
경고. 도메인은 [random-crawl](random-crawl.md), 스케줄 공통은 [schedule](schedule.md).

### 공유/SEO `/r/:placeId` — 리스트 없는 지도+상세 [신규 — 18차]

[`RestaurantsV2Page`](../../apps/web/src/routes/RestaurantsV2Page.tsx) 가 `/restaurants-v2`
와 `/r` 두 라우트의 부모를 겸한다(`useMatch('/r/:placeId')` → `isShareRoute`). 공유
라우트에서는 **리스트 패널을 숨기고 지도 + 상세만** 표시:

- `isShareRoute` 면 좌측 리스트 `aside` 미렌더, panelSide 강제 left, 위치 기반 자동
  bbox·"내 위치" 비활성(받는 사람 위치로 흔들리지 않게).
- 상세 1건은 `useRestaurantPublic` 으로 받아 지도에 표시할 list-item 형태로 변환해
  `mapItems` 에 prepend(목록 fetch 와 무관하게 그 식당이 지도에 찍히도록).
- [`RestaurantDetailRoute`](../../apps/web/src/routes/RestaurantDetailRoute.tsx) 가
  `/r/:placeId` 도 처리 — 닫기는 `/restaurants-v2`(목록)로, 상세 전용 `?tab=` query 는
  목록으로 안 넘긴다. 서버 OG 미리보기/PNG 는 [friendly](friendly.md) — 봇은 OG HTML,
  사람은 `/r` SPA. 정산 공유(`/s/:token`) 와는 별개 경로.

### 버스 정류장 페이지 — 웹 라우트/네비/지도 캔버스 [신규 — 19차]

서울시 버스 정류장 검색·실시간 도착·노선 추적 페이지가 공개(비로그인)로
추가됐다. **19차 당시엔 웹 전용이었지만 2026-07 에 앱 대중교통 화면(`apps/mobile/app/(tabs)/transit.tsx`)이 생겨 지금은 양쪽에 있다**([mobile](mobile.md)). 도메인(서울시 API
프록시·캐시·계약·훅)은 [bus](bus.md), 여기선 웹 관점(라우트·네비·URL state·지도
캔버스)만 다룬다.

- **라우트** — `/bus` 를 `PublicLayout` 아래 등록([App.tsx](../../apps/web/src/App.tsx)),
  다른 무거운 라우트처럼 `React.lazy`(BusPage). 맛집과 동일한 공개 정책(가드 없음).
- **네비** — [PublicSidebar](../../apps/web/src/components/PublicSidebar.tsx) 와
  [PublicTopBar](../../apps/web/src/components/PublicTopBar.tsx) 양쪽 NAV 에 "버스"
  (lucide `Bus`) 항목 — 홈(`/`)/맛집(`/restaurants-v2`)과 나란히.
- **URL = state** — [BusPage](../../apps/web/src/routes/BusPage.tsx) 가 검색어(`q`)·
  선택 정류장(`stId`)·선택 노선(`routeId`)·주변 좌표(`near`)를 `useSearchParams` 로
  URL 에 동기화(모두 `replace`). 새로고침·공유·딥링크가 같은 화면으로 복원되고,
  주변 좌표를 URL 에 담아 재진입 시 Geolocation 재요청 없이 복원한다. `q` 와 `near`
  는 배타(키워드 vs 주변 모드). 지도 자동 재조회 좌표(`autoNear`)만 로컬 state.
- **레이아웃** — 데스크톱(xl+)은 좌 검색 패널(400px) + 우 지도, 모바일은 검색바
  고정 / 지도 / 리스트 세로 적층. 정류장 선택 시 좌패널(또는 하단 영역)이 도착정보
  뷰([BusArrivalPanel](../../apps/web/src/components/bus/BusArrivalPanel.tsx))로 전환
  ('← 목록' 복귀). 루트 높이는 `usePublicLayout` 의 실측 헤더 높이를 뺀
  `calc(100dvh - Npx)` 로 고정해 지도/리스트가 내부 스크롤만.
- **검색은 제출형** — 서울시 개발계정 일 한도 보호 정책이 UX 까지 관통. onChange
  검색이 아니라 Enter/버튼 제출만 서버를 때린다
  ([BusStationSearchBar](../../apps/web/src/components/bus/BusStationList.tsx) — form
  제출 + 한글 IME `isComposing`/`keyCode 229` 가드). 강제 새로고침은 키워드 모드만.
- **즐겨찾기** — 게스트/로그인 하이브리드(`useBusFavorites` — BusPage 에서 1회 호출,
  로그인 직후 게스트 저장분 서버 병합도 이 훅이 담당). 정류장·노선 별 토글
  ([BusFavoriteStar](../../apps/web/src/components/bus/BusFavoriteStar.tsx) — 행
  버튼의 형제로 배치해 버튼 중첩 회피), 초기 화면(q/near/선택 없음)에서만
  `BusFavoriteSection` 노출(2026-07-07 13차에 통합 즐겨찾기
  [TransitFavoritesSection](../../apps/web/src/components/transit/TransitFavoritesSection.tsx) 으로 대체·삭제 — [transit](transit.md)).

지도 캔버스 확장 — 식당용 공용 [MapCanvas](../../apps/web/src/components/restaurant/MapCanvas.tsx)
를 포크 없이 확장해 버스가 얹는다:

- **`MapMarker.icon`** — 마커에 `icon?: { src; selectedSrc }`(data URL 직접) 옵션이
  추가됐다. 지정 시 `variant`/`categoryKey` 빌더 대신 그 이미지를 쓴다 — 식당이
  아닌 버스 정류장 아이콘(표지판/선택)·경유지 점·내 위치 파란 점을 같은 마커
  파이프라인에 태운다(규격은 식당 마커와 동일 26×26 원 / 32×48 핀이어야 라벨
  offset·축소 스케일이 유효). 마커 이미지 data URL 은 [utils](utils.md) 빌더.
- **`VehicleMarker` 전용 레이어** — 정류장 마커와 분리된 실시간 차량 애니메이션
  레이어(선택·라벨 개념 없음). 폴링 간 이전→새 위치를 노선 형상(`via` 웨이포인트)
  으로 등속 보간하고, 진행 방향 화살표(`bearingDeg`)·정차/주행 알약·"따라가기"
  (카메라 추적) 토글을 붙인다.
  [BusStationsMap](../../apps/web/src/components/bus/BusStationsMap.tsx) 이 노선 형상
  index 와 정류소 seq 로 차량 s(호길이)를 계산해 도로 슬라이스를 잘라 넘긴다(형상/
  보간 유틸 `createRoutePathIndex`/`projectOnRoutePath`/`sliceRoutePath`/
  `bearingAtRoutePathS` 는 [utils](utils.md)). 자동 재조회(패닝 종료 시 지도 중심으로
  주변 재조회)·주변 마커 누적(`accumRef`)도 이 컴포넌트가 담당.
- vworld 키 로딩/미등록(404)/에러 3분기는 `PublicRestaurantsMap` 과 동일 정책(문구만
  버스용).

### 메뉴 그룹 렌더 — MenuTab 그룹 섹션 + HomeTab 대표메뉴 우선 [신규 — 19차]

메뉴 데이터가 그룹(카테고리) 구조를 가지면서 공개 상세가 그룹 단위로 렌더한다.
그룹 스키마·머지·소스 등 도메인은 [menu-grouping](menu-grouping.md), 여기선 web 렌더만.

- **MenuTab** — [MenuTab](../../apps/web/src/components/restaurant/detail/MenuTab.tsx)
  이 `detail.menuGroups`(빈 그룹 제외)가 있으면 그룹 섹션별로 렌더 — 상단
  "총 N개 · M개 그룹" 헤더 + 그룹마다 이름·개수(`group.menus.length`) + `MenuGrid`.
  `menuGroups` 가 비면 기존 평면 `detail.menus` 렌더로 폴백(그룹 없는 식당 호환).
- **HomeTab 미리보기** — [HomeTab](../../apps/web/src/components/restaurant/detail/HomeTab.tsx)
  이 미리보기 '대표 메뉴'에서 `menuGroups` 중 이름이 `'대표메뉴'` 인 그룹을 우선
  (`representativeMenus`), 없으면 전체 `menus` 에서 앞 `HOME_MENU_PREVIEW` 개.

### 어드민 리뷰검색 — "전부 노이즈 = 관점집계"(실패 아님) [수정 — 19차]

[AdminReviewSearchPage](../../apps/web/src/routes/admin/AdminReviewSearchPage.tsx) 의
식당별 군집 상태 배지가, 군집이 "전부 노이즈"로 잡히는 식당을 **실패로 표시하던
것을 정상(관점집계 폴백)으로** 바꿨다. `item.lastReason` 이 '노이즈' 를 포함하고
미군집이면 `noiseFallback` — 빨강 대신 sky "관점집계" 배지 + "토픽 없음 — 공개는
관점집계로 표시" 안내. 공개 분석 탭이 군집 없을 때 `AspectSummary`(관점별 누적)로
폴백하는 것과 짝(위 "분석 탭 군집 토픽" 18차 `ClusterTopics`). 계산 오류·리뷰 부족
등 실제 조치가 필요한 사유만 빨강으로 남긴다. 군집 도메인은
[review-clustering](review-clustering.md).

### 어드민 사이드바 — 테스트 아코디언 그룹 [18차]

[`AdminLayout`](../../apps/web/src/components/admin/AdminLayout.tsx) 의 NAV 가 leaf
+ **그룹(children)** 혼합으로 확장. "테스트" 그룹(Beaker)이 네이버/캐치테이블/
다이닝코드/테이블링/AI 5개 하위를 아코디언으로 묶는다 — 현재 경로가 그룹 하위면
자동 펼침, 접힌(md collapsed) 사이드바에서 그룹 클릭 시 사이드바를 펼치며 그룹을 연다.
신규 leaf: AI 사용량(Activity)·리뷰 문맥검색(MessagesSquare)·테이블링 크롤링
(CalendarClock)·로그(ScrollText). [`AdminTopBar`](../../apps/web/src/components/admin/AdminTopBar.tsx)
는 "일반 화면으로" + `ThemeToggle` 상시 노출, 어드민 발견 모바일 상세에서만 hideOnMobile.
설정은 자식 탭 레이아웃([`AdminSettingsPage`](../../apps/web/src/routes/admin/AdminSettingsPage.tsx))
— AI 키/지도/텔레그램/로그 4탭.

### 공개 셸 재설계 — 상단바 폭 예산 · 계정 메뉴 · 통합 "내 위치" 칩 [신규 — 24차]

공개 페이지가 4개 늘고 상단바에 날씨·대기 칩이 들어오면서 한 줄짜리 상단바가 넘치기
시작했다 — 넘치면 오른쪽 끝(테마·계정)이 화면 밖으로 밀리고 **문서가 가로 스크롤**되며,
그러면 `fixed inset-x-0` 레이어(맛집 지도·시트)까지 문서 폭을 따라 커진다. `a062e7d` 가
[PublicTopBar](../../apps/web/src/components/PublicTopBar.tsx) 상단에 **폭 예산(실측)** 을
주석으로 박고 브레이크포인트별로 담는 것을 나눴다:

| 폭 | 상단바에 남는 것 | 내려가는 것 |
| --- | --- | --- |
| `<md` | [≡ 햄버거][로고] ··· [내 위치 칩(~170px)] | 테마·로그인/계정 → [PublicSidebar](../../apps/web/src/components/PublicSidebar.tsx) 하단(`md:hidden` 블록, `data-testid="sidebar-account"`) |
| `md~lg` | + `ThemeToggle` + `AccountMenu`/로그인 버튼(`hidden md:flex`) | NAV 는 아직 드로어 |
| `lg+` | + NAV 가로(`hidden lg:flex`; 768px 에선 NAV 와 칩이 같이 못 들어간다) + 칩이 하늘 상태·PM2.5 까지 펼침(~340px) | 햄버거 `lg:hidden` |
| `xl+` | 계정 메뉴 트리거에 이메일(`hidden xl:inline`, `max-w-[12rem]` 말줄임) | — |

그래도 넘치는 경우(아주 좁은 폭·긴 라벨)엔 버튼이 밀려나는 대신 **칩이 줄어들게** —
왼쪽 묶음은 `shrink-0`, 오른쪽 묶음·칩은 `min-w-0`(칩 자체도 `max-w-[22rem]`·`overflow-hidden`).
NAV 는 `NavItem[]` 상수 하나를 상단바·드로어가 공유하는 모양 그대로: 홈(`end`)·맛집·대중교통
(`match: ['/bus','/subway']`)·일상지도·날씨·대기질·식단(`requiresAuth` — 비로그인·게스트는 숨김).
드로어는 NAV 만 `overflow-y-auto` 로 스크롤해 가로 모드 등 낮은 화면에서도 하단 계정 블록이
밀려나지 않게 했다. 맛집 상세(`/restaurants/:placeId`·`/r/:placeId`)에서 모바일 상단바를 숨기는
`hideOnMobile`, subBar 슬롯 + `ResizeObserver` 헤더 높이 측정은 v2 때 그대로.

- **[AccountMenu](../../apps/web/src/components/AccountMenu.tsx)** [신규] — 이메일 + 버튼
  2~3개를 가로로 늘어놓던 것을 버튼 하나로 접는다(lg 1024px 에서 NAV·칩과 겹쳐 넘쳤다).
  `CircleUserRound` + 이메일(xl+) + chevron 트리거(`aria-haspopup`/`aria-expanded`/`aria-controls`
  + `useId`), 패널(`w-60`, `data-testid="account-menu"`)에 이메일 머리·내 정산(`/me/settlements`)·
  관리자(`/admin`, ADMIN 만)·구분선·로그아웃. 바깥 `mousedown`·ESC·항목 선택으로 닫힘 —
  `ConfirmDialog` 와 같은 결로 헤드리스 라이브러리 없이. 드로어 하단 블록은 같은 항목을
  세로 리스트로(항목 클릭 시 `onClose`).
- **[MyLocationChip](../../apps/web/src/components/weather/MyLocationChip.tsx)** [신규,
  `9e197d3`] — 저장한 내 위치(대기·날씨 페이지에서 저장, 로그인 서버/게스트 로컬 —
  [air-quality](air-quality.md))가 없으면 `null`(강요 없음). 있으면 **알약 하나에 링크 둘**:
  왼쪽 `[📍라벨 ☁기온 상태 ☂]` → `/weather?ll=lat,lng`(`data-testid="weather-location-chip"`),
  오른쪽 `[●등급 PM2.5]` → `/air?sido=&station=`(`air-location-chip`; 가장 가까운 측정소의
  시도를 `AIR_SIDO_OPTIONS`/`airSidoMatches` 로 역매핑). 경계선 없이 가운뎃점(`before:content-['·']`)
  으로만 나눠 한 알약으로 읽히게, 위치 이름은 앞에 한 번만. 폭별 단계 노출: `<sm` 라벨·소수점
  없이 `[📍 ☁26° · ●좋음]`(360px 에서 '매우나쁨'까지 ~190px), `sm+` 라벨(`max-w-[6.5rem]`)·기온
  소수 1자리, `lg+` 하늘 상태 글자·PM2.5 수치. 파생값(기온·상태·우산·등급·가장 가까운 측정소)은
  앱 홈 카드와 공용 훅 `useMyLocationGlance({ refetchOnWindowFocus: true })`([shared](shared.md))
  — 통합지수 결측 시 PM2.5·PM10 등급 폴백(`4d35a57`)과 10분 조용한 갱신(`26947ba`)도 훅 쪽.
  한쪽 자료를 못 받으면 **그 세그먼트만 조용히 빠지고** 알약은 남는다 — 대기는 측정소가 없을
  때뿐 아니라 측정소는 있어도 등급이 없을 때도 빠진다(업스트림 장애 때 "● -" 를 남기지 않음,
  사정은 `title` 툴팁에만). `WeatherConditionIcon`(weatherIcons) + `airGradeStyle`(airGrade) 재사용.
- **테스트** — [PublicTopBar.test](../../apps/web/src/components/PublicTopBar.test.tsx) 3건(로그아웃
  구조·ADMIN 계정 메뉴 열기/ESC/바깥 클릭·USER 관리자 항목 없음), [PublicSidebar.test](../../apps/web/src/components/PublicSidebar.test.tsx)
  3건(하단 계정 블록·항목 클릭 시 `onClose`·USER), [MyLocationChip.test](../../apps/web/src/components/weather/MyLocationChip.test.tsx)
  4건(없으면 null · 두 링크 href/격자 nx,ny/limit=1 · 우산 없음/실황 없음/측정소 없음 · 측정값
  없음이면 "-" 미표시). 폭별 숨김은 CSS 라 jsdom 에선 안 보고 구조·링크·역할만 본다.

### 공개 라우트 4종 — 대기정보 · 날씨 · 일상지도 · 내 식단 [신규 — 24차]

네 페이지 모두 `PublicLayout` 아래 `React.lazy`. 도메인 로직(서버 프록시·캐시·계약·훅)은
각 토픽에 두고 여기선 **페이지 골격 · URL state · 컴포넌트 디렉터리 · 스토어 · 테스트**만.

**대기정보 [`AirQualityPage`](../../apps/web/src/routes/AirQualityPage.tsx)** (`/air`,
`7340743`→`c6ac640`→`a4284aa`) — 에어코리아 대기오염정보 API 5개 오퍼레이션 + 측정소정보
API 로 "보여줄 수 있는 것"을 섹션 ①~⑧로 한 화면에 펼친 **예시 페이지** 골격. 상단 컨트롤
(시도 셀렉트·측정소 셀렉트·갱신 라벨·새로고침 = `invalidateQueries(['air'])`)이 아래 모든
섹션의 범위. URL 이 유일한 진실(`sido`·`station`·`term`·`code`; 기본값 DAILY/PM10 은 URL 에서
제거, 유효하지 않은 값은 기본값으로 읽되 URL 은 안 건드림; 차트 항목·전국 비교 항목은 공유
가치가 낮아 로컬 state). URL 에 시도·측정소가 없고 **저장한 내 위치**가 있으면
`useAirNearbyStations(lat, lng, { limit: 1, radius: 50_000 })` 로 가장 가까운 측정소를 기본 선택
(상단바 칩과 같은 해석). 측정소 전환 중엔 `isPlaceholderData` 면 디밍, 그 상태에서 실패하면
이전 측정소 값을 계속 보여주는 대신 에러 블록. 업스트림 에러 문구는 `ApiError.statusCode`
503(키 없음/일일 한도)·502·429 분기(`upstreamMessage`). [components/air/](../../apps/web/src/components/air/):

| 파일 | 역할 |
| --- | --- |
| `AirPrimitives.tsx` | 섹션 카드(`AirSection` — 제목 + **원천 오퍼레이션명 eyebrow**, `aside` 슬롯) · 상태 블록(`AirStateBlock` loading/error/empty) · `AirStaleNote`. 날씨 페이지도 그대로 재사용 |
| `AirStationHero.tsx` | 선택 측정소 지금 — 통합지수 히어로(≥48px) + 6항목 타일(농도·단위·등급·Flag 경고) |
| `AirHourStrip.tsx` | 24시간 등급 띠(서명 요소) — 시간별 등급색 칸, 날짜 경계선, 값은 title |
| `AirHistoryChart.tsx` | 인라인 SVG 선 차트(라이브러리 없음, 단일 축 — PM10·PM2.5 2계열/나머지 단일), 호버 크로스헤어 + ←/→ 키보드 + 표로 보기 |
| `AirSidoTable.tsx` | 시도 측정소 현황 — 요약 타일·측정망 필터·정렬 표, 행 클릭 = 측정소 선택 |
| `AirSidoCompare.tsx` | 전국 응답(673개소)을 시도 평균 가로 막대로, 막대 클릭 = 시도 전환 |
| `AirBadStations.tsx` | 통합지수 나쁨 이상 측정소 — 시도(주소 앞머리)로 묶은 칩 |
| `AirForecastSection.tsx` | 예보통보 — 항목 탭 → 발표 시각 → 대상일별 19권역 등급 그리드 + 원문 + 예측모델 이미지 |
| `AirWeeklySection.tsx` | 초미세먼지 주간예보 D+3~D+6 권역 × 4일 그리드 |
| `AirStationsMap.tsx` | 전국 측정소 지도(`MapCanvas`) — 좌표 + 현재 등급색 마커(등급 0~4 × 선택 10종 모듈 레벨 data URL), 내 위치·저장 위치는 `overlayMarkers`(fit 제외) |
| `AirNearbySection.tsx` (+test 6) | 측정소 지도·내 주변·검색·**내 위치 저장**(선택 측정소 저장 `station` / GPS 저장 `geolocation`) — `useUserLocation({ auto: false })`(버튼 눌렀을 때만 권한), 검색은 서버 캐시 로컬 검색이라 250ms 디바운스 즉시. `AirStationsErrorBlock` 이 인증 30(활용신청 전) 503 을 키 설정이 아닌 활용신청 안내로 분기 |
| `AirLegend.tsx` | CAI 등급 구간표 + 공공누리 출처표시 + 오퍼레이션 목록 |
| `airGrade.ts` / `airOptions.ts` | 등급 색(에어코리아 파랑/초록/노랑/빨강 관행, 항상 글자와 함께) · `todayKst` 등 재수출(`@repo/utils` 로 승격) / 차트·예보 탭 상수(react-refresh 경계 유지용으로 컴포넌트 파일 밖) |

**날씨 [`WeatherPage`](../../apps/web/src/routes/WeatherPage.tsx)** (`/weather`, `37e0db0`→
`7704f8c`→`17f281a`) — 기상청 단기예보 4 + 중기예보 4 오퍼레이션을 섹션 ①~⑦(지금·3일
시간별·열흘·중기전망·해상·발표 정보·코드표)로. **대기 프리미티브(`AirSection`/`AirStateBlock`)
를 그대로 쓰고** 기상청 고유 문구(stale/폴백 띠)·`Segmented` 만 [WeatherPrimitives](../../apps/web/src/components/weather/WeatherPrimitives.tsx).
지점 해석 `resolveLocation(p, ll, saved)`: `?ll=` 좌표(GPS/저장 위치) → 격자는 좌표로 정확히,
중기예보·표시명은 가장 가까운 지점(거리 표기); `?p=` 지점 id(시·군 + 광역시 구·군) → 청사
좌표 → 격자 + 소속 중기 구역; 둘 다 없고 저장 위치가 있으면 그 좌표(`fromSaved`); 최후
`WEATHER_DEFAULT_PLACE_ID`(서울). 시도→지점 2단 셀렉트, "내 위치"(`acquirePosition({ timeout:
10_000, maxTries: 2 })` — 실패 상태 denied/timeout/unavailable 안내), **"이 지점을 내 위치로
저장"/저장됨·해제**(`useAirLocation.save({ label, source: 'place' | 'geolocation' })` — 대기·상단바
칩과 같은 저장소, `savedHere` 는 좌표 ≈50m 근사), 다른 지점 보는 중엔 "저장한 내 위치(라벨)"
바로가기. 해역 기본값은 육상 권역 → `DEFAULT_SEA_BY_LAND` 표, 사용자가 바꾸면 `?sea=`. 전국
전망(`stnId 108`)은 토글했을 때만 조회(업스트림 2콜 추가). AWS 매분 관측(`useWeatherAws(lat,
lng, { limit: 2, radius: 15_000 })`)은 서버 키가 없으면 `enabled=false` 로 조용히 생략.
[components/weather/](../../apps/web/src/components/weather/):

| 파일 | 역할 |
| --- | --- |
| `WeatherNowHero.tsx` | 초단기실황 히어로(기온 ≥48px) + 초단기예보 6시간 띠 + AWS "근처 관측소" 줄. 풍향 도 → 16방위 + 화살표 |
| `WeatherMeteogram.tsx` | 3일 시간별 메테오그램(서명 요소) — [아이콘 행]→[기온 선]→[강수확률 막대 + 강수량 글자] x 공유 소형 다중(이중 축 아님), 호버·←/→·표 쌍둥이 |
| `WeatherDailyStrip.tsx` | 열흘 — 단기 일별 요약(오늘~D+3) + 중기(D+4~D+10) 병합 한 줄, 공통 기온 축 막대, 중기 오차 ± |
| `WeatherSeaSection.tsx` | 해역 선택 + 날짜별 날씨·파고 표 |
| `WeatherVersions.tsx` | 이 화면이 쓰는 발표분(base) + `getFcstVersion` 파일 생성 시각, 폴백/저장본 여부 |
| `WeatherLegend.tsx` | SKY/PTY 코드표 · category 표 · 공공누리 제1유형 출처 |
| `weatherIcons.tsx` | 하늘+강수형태 → lucide 아이콘 표(낮/밤 06~19시 근사, 렌더 중 컴포넌트 생성 금지 — 모듈 상수) |
| `weatherFormat.ts` / `weatherDaily.ts` | 발표 시각 포맷·업스트림 문구·열흘 병합은 `@repo/utils`/`@repo/shared` 로 승격(앱 날씨 화면 공용) — 웹 경로 호환 재수출 + 컨테이너 폭 측정 훅만 잔존 |
| `MyLocationChip.tsx` (+test 4) | 상단바 통합 칩(위 공개 셸 절) |

**일상지도 [`LifeMapPage`](../../apps/web/src/routes/LifeMapPage.tsx)** (`/life-map`,
`1d92acb`→`a21de10` 지역 이동→`e84e4b9` 시트→`4fd6e22` 병의원) — 전국 CCTV·공중화장실·병의원을
OL 지도 **한 장(인스턴스 1개)** + 패널. URL 이 진실: `?ll=lat,lng&z=줌`(뷰포트 — 사용자 이동
`onViewportChangeEnd` 만 URL 반영, 모든 변경 `onViewportSync` 는 250ms 디바운스 후 조회 키)
+ `?sel=layer:id`(선택 — 상세는 별도 조회, 점 응답엔 최소 필드뿐). 레이어 on/off·CCTV 설치목적·
화장실 편의(AND)·병의원 종별 필터는 [lifeMapPrefsStore](../../apps/web/src/stores/lifeMapPrefsStore.ts)
(persist `lp:life-map-prefs`, v1→v2 migrate 로 병의원 레이어 기본 켬). 진입 중심은 마운트 1회
결정 URL → 저장한 내 위치(`useAirLocation` — 날씨·대기와 공유; 로그인 서버 조회가 늦게
오면 사용자가 안 움직였을 때만 1회 flyTo) → 서울시청, 기본 줌 15. 켜진 레이어별
`useLifeMapPoints({ layer, bbox, zoom, filters })` 3개(셀 모드면 "N 이상 확대" 힌트,
`truncated` 면 "일부만 표시"), 주변 목록 `useLifeMapNearby(activeTab, center, { radius: 화장실
1000/CCTV 500/병의원 1000m, limit: 15 })` 는 지도 중심 기준, 꺼진 레이어 탭이면 켜진 쪽으로
보이되 사용자 탭 선택은 보존. 내 위치는 버튼으로만(`useUserLocation({ auto: false })`,
`isInKorea` 가드). **레이아웃 분기는 CSS 이중 마운트가 아니라 `useIsDesktopXl()`(JS)** —
지도·패널을 한 벌만 두고 시트는 모바일에서만 마운트한다(데스크톱에 시트가 숨어 있으면
html overflow 락이 따라온다). 지도 `<section>` 은 두 분기에서 같은 자리(첫 자식)라 폭이 바뀌어도
OL 인스턴스를 다시 만들지 않는다. 데스크톱(xl+) = 좌 패널 400px(지역 이동 · 레이어/필터 ·
주변 목록 또는 상세 · 푸터) / 우 지도, `calc(100dvh - headerHeight)`. 모바일 = 아래 시트 패턴 절.
[components/life-map/](../../apps/web/src/components/life-map/):

| 파일 | 역할 |
| --- | --- |
| `LifeMapView.tsx` | `MapCanvas` 한 장에 CCTV 점/셀 + 화장실·병의원 원/핀을 한 소스로(화장실·병의원을 뒤에 넣어 위에), 내 위치(파란)·저장 위치(보라) 오버레이, `MyLocationButton`, 키 게이트 3분기(대기·버스 지도와 같은 정책), 로딩·힌트 |
| `lifeMapMarkers.ts` | 서버 점/셀 → `MapMarker`. 아이콘 data URL 모듈 레벨 1회, 셀 버블은 건수 키 메모이즈, `fixedScale` 사용 |
| `LifeGoToBox.tsx` | "지역 이동" 옴니박스 — 입력 없음: 저장 위치·최근 본 위치·시도 칩→시·군·구 칩(로컬 245지점); 입력 중: 행정구역(로컬 즉시)·지하철역(`useSubwayStationSearch`)·버스정류장(`useBusStationSearch`)·주소/장소(`useLifeMapSearch` VWorld 프록시, 250ms, 서버 키 없으면 섹션 숨김). 종류별 줌(시도 11·시 13·구 14·역/정류장 16·주소 17), ↑↓/Enter/Esc. `variant: 'panel'`(데스크톱 — 열리면 패널 본문 자리) / `'bar'`(모바일 subBar — 한 줄 + 드롭다운) |
| `LifeLayerBar.tsx` | 레이어 토글 + 필터 칩(맛집 카테고리 칩과 동일 모양). `section: 'all' \| 'layers' \| 'filters'` 로 일부만 — 모바일은 토글을 subBar 에, 필터 행을 시트 안에 |
| `LifeNearbyList.tsx` | 주변 목록 탭(화장실/CCTV/병의원) + 행 클릭 = 선택 + flyTo. `filters` 슬롯이 머리 행 바로 아래 — peek 엔 머리 행만, half 부터 필터 칩 |
| `LifeDetailCard.tsx` | 선택 상세(화장실 개방시간·변기·편의·관리기관 / CCTV 목적·대수·화소·방면·보관일수 / 병의원 종별·연락처·개설일·의사수) + '← 목록' |
| `LifeMapFooter.tsx` | 범례 + 적재 상태(`useLifeMapStatus` — 건수·지오코딩·기준일) + 출처(localdata.go.kr·심평원, VWorld 지오코더) |
| `lifeMapFormat.ts` | 개방시간 라벨 `@repo/utils` 승격 재수출 |

[lifeMapRecentStore](../../apps/web/src/stores/lifeMapRecentStore.ts)(persist `lp:life-map-recent`)
는 옴니박스에서 고른 곳을 최대 8개(같은 라벨·≈50m 좌표는 앞으로 끌어올림). 테스트
[LifeMapPage.test](../../apps/web/src/routes/LifeMapPage.test.tsx) 8건 — 데스크톱 5(레이어·필터·
푸터 + 서울시청 기준 주변 / 행 클릭 → 상세 / CCTV 탭·설치목적이 요청 파라미터에 / 지역 이동
섹션·URL ll/z·최근 기록 / 저장 위치가 진입 중심) + **모바일 시트 3**(`window.matchMedia` 를
`matches:false` 목으로 바꿔 `useIsDesktopXl` 을 false 로: subBar 에 지역 이동 + 레이어 토글·
목록 시트에 목록/필터/푸터 / 행 클릭 → 상세 시트 별도·← 목록 / 드롭다운 열려도 목록 시트
유지). `MapCanvas` 목은 뷰포트를 올리지 않으므로 points 요청은 나가지 않는다(뷰포트 없음 =
비활성).

**내 식단 [`MealPage`](../../apps/web/src/routes/meal/MealPage.tsx)** (`/me/meals`, `RequireUser`,
`233c5a9` 기록·달력·통계 → `2e41e63` 추천·중요도 → `29fac09`·`1837f25`·`9f39d53`·`fd371d9`) —
"기록은 앱에서 사진으로 남기고, 여기서는 모아 보고 분석" 안내가 머리에 있는 **조회 전용**
5탭(로컬 state, URL 없음). 기록 탭 `useInfiniteMealEntries({ limit: 30, q, from, to, slot, mealType,
source })` + 날짜 머리글 + "더 보기"(opaque `nextCursor`), 달력 탭 `useMealCalendar(month)` +
날짜 선택 시 `useMealEntries({ from, to, limit: 20 })`, 통계 탭 `useMealStats(from, to)`(1주/1달/
3달, 타일·주간 인사이트·추천 반응·분류별 막대·날짜별 끼니 — 막대는 div 폭, 차트 라이브러리
없음 관례; 주식 영양 근거가 부족하면 하루 평균 숨김). [MealRecommendTab](../../apps/web/src/routes/meal/MealRecommendTab.tsx)
— `useMealRecommendationContext`/`useMealRecommendations(5)`/`useCreateMealRecommendation`(추천받기
`force:false`, 다시 추천 `force:true`)/`useMealRecommendationFeedback`(👍👎)/
`useMealRecommendationEvent`(`shown` 이벤트를 `platform:'web'` 으로 1회 — `shownEventIds` ref)/
`useFoodRestaurants`(파는 곳 찾기 → `/restaurants-v2/:placeId`)/`useAirLocation`(날씨 연동 —
[weather](weather.md) 교차). [MealPreferenceTab](../../apps/web/src/routes/meal/MealPreferenceTab.tsx)
— 가중치 7축 슬라이더(0~5) + `MEAL_WEIGHT_PRESETS` + 절대 제외/알레르기/덜 선호/선호 + 끼니·
식사 유형, `useMealPreference`/`useUpdateMealPreference` + 내보내기 `useExportMealData`/전체 삭제
`useDeleteAllMealData`(확인 문구 `MEAL_DATA_DELETE_CONFIRMATION`). [MealPhotoImg](../../apps/web/src/routes/meal/MealPhotoImg.tsx)
— 사진은 JWT 가 필요해 `<img src>` 직접 불가, `useMealPhotoUrl(token, { variant })` 가 blob →
objectURL(언마운트 해제)(정산 영수증 미리보기와 같은 함정). 테스트 [MealPage.test](../../apps/web/src/routes/meal/MealPage.test.tsx)
11건(탭별 요청 계약 + cursor 유지 + 썸네일 인증 fetch + 추천 force/피드백/즉시 반영 + 설정 PUT/
프리셋). 도메인은 [meal](meal.md).

### 지도 + 바텀시트 화면 골격 공유 — `sheet/` · `useMapSheets` · `useMediaQuery` [신규 — 24차]

`e84e4b9` 가 맛집 v2 에서만 쓰던 모바일 시트 패턴을 **네 지도 페이지의 공통 골격**으로
끌어올렸다. 이전 대중교통 모바일은 "검색바 고정 / 지도(`min-h-[40dvh]`) / 리스트(`h-[38dvh]`)
세로 적층"이라 지도도 목록도 작았고, 정류장 선택 시 리스트 영역이 도착 패널로 통째 교체됐다.

- **[sheet/BottomSheet.tsx](../../apps/web/src/components/sheet/BottomSheet.tsx)** —
  `restaurant-v2/` 에서 R100 이동(내용 동일: dual-mode fixed/scroll, 3-snap peek/half/full,
  `TRANSITION_MS` 220, 기본 `peekHeight` 140/`halfRatio` 0.55, `disableScrollLock`·`hidden`·
  `zIndex` props). 옛 경로 import 는 빌드 실패.
- **[sheet/useMapSheets.ts](../../apps/web/src/components/sheet/useMapSheets.ts)** [신규] —
  목록 + 상세 두 시트의 스냅 조율을 훅으로: `useMapSheets(detailOpen, { initialListSnap = 'peek',
  detailEnterSnap = 'half' })` → `{ listSnap, setListSnap, detailSnap, setDetailSnap, listHidden }`.
  상세가 열리면(false→true) 목록 스냅을 기억해 두고 peek(숨김 대기), 상세는 half; 닫히면 기억한
  스냅으로 복원. 전이는 **렌더 중 파생(setState-during-render, `prevOpen` 비교)** — effect 로
  미루면 상세 시트가 직전 스냅(full 등)으로 한 프레임 튄다. 페이지는 목록 시트에
  `hidden`/`disableScrollLock = listHidden`(상세 시트가 스크롤 락을 갖는다)을 준다. 상수
  `SHEET_PEEK_HEIGHT = 120`·`SHEET_HALF_RATIO = 0.55`, `sheetHalfInset(headerHeight) =
  round(max(0, innerHeight − headerHeight) × 0.55)` — 상세 시트가 half 로 덮는 아래 높이를
  `flyTo` 의 `bottomInset` 으로 넘겨 지점이 시트 아래로 숨지 않게. RestaurantsV2Page 의 로컬
  `snapBeforeDetailRef` + `prevPlaceIdRef` effect 를 이 훅으로 대체.
- **[lib/useMediaQuery.ts](../../apps/web/src/lib/useMediaQuery.ts)** [신규] —
  `useSyncExternalStore` 로 `matchMedia` 를 React 상태로. `useIsDesktopXl()` = `(min-width: 80rem)`
  (Tailwind `xl` 1280px, 공개 지도 페이지가 데스크톱 3-column 과 모바일 시트를 가르는 기준),
  `matchMedia` 없는 환경(jsdom·SSR)은 `fallback = true`(데스크톱). 지도 인스턴스·패널을 한 벌만
  두고 싶은 페이지(일상지도)가 CSS 이중 마운트 대신 쓴다.
- **공통 골격(모바일 `xl` 미만)** — ① 탭·검색행은 `usePublicLayout().setSubBar` 로 상단바
  subBar(통합 sticky 헤더)에 등록(`useLayoutEffect`, 언마운트 시 null; `xl:hidden` 래퍼라 데스크톱
  헤더 높이엔 영향 없음. 정류장/역 선택 중엔 검색행을 접어 공간 회수) ② 지도는 헤더 아래
  `fixed inset-x-0 bottom-0` 배경(`top: headerHeight`) + CSS 변수 `--map-bottom-inset:
  SHEET_PEEK_HEIGHT` ③ 목록 `BottomSheet`(z 20, `topOffset = headerHeight`, `peekHeight 120`)
  ④ 선택되면 상세 `BottomSheet`(z 25, `key = stId|stn|selectedMarkerId` 로 항목 바뀌면 재마운트)
  ⑤ 루트는 데스크톱만 `xl:h-[calc(100dvh-var(--header-h))]` 로 고정 — 모바일은 auto 라야 시트가
  full 일 때 body 스크롤(주소창 minify)이 동작한다. 검색 제출·주변·재검색 핸들러가
  `setListSnap(s => s === 'peek' ? 'half' : s)` 로 결과를 바로 보이게, 검색어/주변 모드 딥링크
  진입은 `initialListSnap: 'half'`(버스 `q.length >= 2`, 지하철 `>= 1`). `useMapSheets` 는 **`useState`
  선언들보다 앞에** 둔다(React Compiler 메모 검증이 뒤에 두면 setter 들을 반응값으로 본다).
- **적용** — [RestaurantsV2Page](../../apps/web/src/routes/RestaurantsV2Page.tsx)(훅 교체 +
  `--map-bottom-inset`), [BusPage](../../apps/web/src/routes/BusPage.tsx)/[SubwayPage](../../apps/web/src/routes/SubwayPage.tsx)
  (subBar = `TransitTabs` + `Bus/SubwayStationSearchBar`; 데스크톱 탭은 `hidden xl:block`; 상세
  시트 = `BusArrivalPanel`/`panelContent`, 없으면 `selectedMissing` 안내 + ← 목록; 데스크톱/모바일
  지도는 여전히 CSS 동시 마운트라 `poolKey` `transit-desktop`/`transit-mobile` 분리 유지),
  [LifeMapPage](../../apps/web/src/routes/LifeMapPage.tsx)(JS 분기 — 시트는 모바일에서만 마운트,
  subBar = `LifeGoToBox variant="bar"` + `LifeLayerBar section="layers"`).
- **[MapCanvas](../../apps/web/src/components/restaurant/MapCanvas.tsx) 확장** —
  `flyTo/flyToZoomIn(lat, lng, zoom, { bottomInset })` → `centerWithBottomInset` 이
  `inset/2 × resolution` 만큼 중심을 남쪽으로 밀어 지점이 "보이는 영역"의 세로 가운데에;
  `MapMarker.fixedScale`(`1d92acb` — 줌 축소 `SMALL_ICON_SCALE`·라벨 숨김 건너뜀, 크기 자체가
  의미인 12px 점·숫자 새긴 집계 버블용); **마커 Style 캐시** `markerStyleCache`(입력 키 =
  icon src/selectedSrc·categoryKey·variant·selected·compact·label·darkBg, 상한 6000 넘으면 통째
  비움) — OL 은 매 프레임 style function 을 부르므로 CCTV 수천 feature 면 프레임마다
  Style/Icon 을 수천 개 새로 만들어 메인 스레드가 수 초 멈추던 것을 막는다.
- **지도 위 컨트롤 inset** — [MapLayerControl](../../apps/web/src/components/restaurant/MapLayerControl.tsx)
  과 버스·지하철 "따라가는 중"/"다시 따라가기" 배지([BusStationsMap](../../apps/web/src/components/bus/BusStationsMap.tsx)/
  [SubwayStationsMap](../../apps/web/src/components/subway/SubwayStationsMap.tsx))가
  `bottom-[calc(0.75rem+var(--map-bottom-inset,0px))]` — 지도 래퍼가 변수를 주면 peek 시트 위로
  올라오고, 안 주면(데스크톱·어드민) 0. 검색바의 "결과가 많아 일부만 표시" 별도 문단은
  건수 행 인라인 `· 일부만 표시`(title "서버가 100건으로 절단")로 접어 subBar 높이를 아꼈다
  ([BusStationList](../../apps/web/src/components/bus/BusStationList.tsx)/[SubwayStationList](../../apps/web/src/components/subway/SubwayStationList.tsx)).
- 설계 문서 [docs/mobile-public-restaurant-ux-v2.md](../../docs/mobile-public-restaurant-ux-v2.md)
  의 파일 표가 `sheet/` 승격을 반영. 앱의 대응물(플로팅 헤더 + 시트, `enableDynamicSizing=false`)은
  [mobile](mobile.md).

### 어드민 갱신 — 맛집 통합 검색 · 음식 카탈로그 · AI 용도 5종 · 리뷰 최신순 [24차]

- **[AdminRestaurantsPage](../../apps/web/src/routes/admin/AdminRestaurantsPage.tsx) 통합
  검색(`5e25cc0`, 2026-08-17)** — 등록 맛집 카드 헤더에 `role="search"` 폼(가게명·카테고리·
  Place ID, `maxLength 120`, ✕ 초기화). 제출 시 `?q=` URL + `page` 리셋(`updateParams({ q, page:
  null })`), `useRestaurantList({ q, limit, offset, sort })` → `GET /api/v1/admin/restaurants?q=`
  (`RestaurantListQuery.q` `trim().min(1).max(120)`; 통합 가게 + 출처를 함께 매칭 — 서버 응답
  단축 `9ccbe52` 은 [friendly](friendly.md)). 입력 draft 는 `{ urlQuery, value }` 한 state —
  뒤로/앞으로·공유 URL 로 `q` 가 바뀌면 effect 로 재설정하지 않고 `urlQuery !== searchQuery` 면
  URL 값을 즉시 표시(렌더 중 파생). 제목 "검색 결과 N개"·빈 결과 "검색 초기화" 분기.
- **[AdminFoodPage](../../apps/web/src/routes/admin/AdminFoodPage.tsx)** [신규, `/admin/food`,
  `d53fbe3`→`31c56f7`] — 1,795줄 단일 파일에 섹션 5개: `ImportJobSection`(cron 프리셋 매월 1일
  04:00 = 기본 `0 4 1 * *`/매주 월/매일 + 커스텀, `useFoodImportPreview` 다음 실행, 소스
  체크(`FoodImportSource.options`; 외부 API 소스 `mfds-nutrition`/`mfds-recipe`/`mafra-recipe` 는
  `apiConfigured` 배지), 지금 실행 `useRunFoodImportNow`(기본 body 없음, 오버라이드 켜면 현재
  선택 소스·분류), 이력 `useFoodImportRuns`, 진행 중 run 은 `useFoodImportRunEvents` SSE 로
  단계·소스·진행률) · `StatsSection`(`useFoodAdminStats` 타일 + 막대) · `MergeConflictSection`
  (`useFoodMergeConflicts({ status: 'open', limit: 20 })` + `useResolveFoodMergeConflict`
  keep/accept/dismiss) · `RecognitionQualitySection`(`useFoodRecognitionQuality`, 모델 필터
  300ms 디바운스) · `CatalogSection`(`useFoodAdminList` — 검색 300ms 디바운스·필터·정렬,
  페이지 크기 25/50/100 기본 50, 9열 표, `EditRow` 인라인 편집은 바뀐 필드만 PATCH·분류 비우기
  `null`, `CreateDialog`(Radix Dialog) 수기 등록 409 → "이미 있는 음식명" 토스트). 사이드바
  "음식 카탈로그"(`Soup`)는 AI 분석 관리 다음. 테스트 [AdminFoodPage.test](../../apps/web/src/routes/admin/AdminFoodPage.test.tsx)
  7건 — 마운트만으로 7요청이 나가 기본 핸들러를 다 깔고, sonner 목·가짜 `EventSource`. 도메인
  ([food](food.md)) 재서술 없음.
- **[AdminAiKeysPage](../../apps/web/src/routes/admin/AdminAiKeysPage.tsx) 용도 5종(`cc8399a`)**
  — `PURPOSE_ORDER = ['chat','image','log-analysis','meal-photo','meal-recommend']`(`PURPOSE_META`
  가 `Record<LlmProviderPurposeType>` 이라 계약 enum 에 용도가 늘면 typecheck 가 잡는다). 키는 여전히
  chat row 에만, 나머지 용도는 상속. `meal-photo` = 식단 사진 인식 비전 모델(placeholder
  `gemma4:31b`), `meal-recommend` = 식단 추천 텍스트 모델(`gpt-oss:120b`). [ai](ai.md).
- **[AdminLogsPage](../../apps/web/src/routes/admin/AdminLogsPage.tsx)** — `FEATURE_LABEL` 에
  `food-import`(음식 카탈로그 적재)·`meal-recognition`·`meal-recommendation` 추가(상세 페이지가
  같은 export 를 쓰므로 한 곳). [logs](logs.md).
- **리뷰 업데이트 누락·최신순(`0d72380`, 2026-08-17)** — 크롤 배치 `setQueryData` 머지가 신규
  리뷰를 prepend 만 하던 것을 `[...fresh, ...prev.reviews].sort(compareReviewRecencyDesc)`
  (@repo/utils — 상세 API 와 같은 방문일 비교자)로 정렬([AdminCrawlTestPage](../../apps/web/src/routes/admin/AdminCrawlTestPage.tsx)·
  [ActiveJobPanel](../../apps/web/src/components/restaurant/ActiveJobPanel.tsx)).
  [AdminRestaurantDetailPage](../../apps/web/src/routes/admin/AdminRestaurantDetailPage.tsx)
  정렬 모드가 `visitedAt-desc`(기본, 같은 비교자)/`fetchedAt-desc`/별점 — 로컬 `visitedSortKey`
  ("YY.M.D" 정규화)와 `fetchedAt-asc`(수집 순서 = 최신순이라는 옛 가정) 제거. [HomeTab](../../apps/web/src/components/restaurant/detail/HomeTab.tsx)
  주석: `reviewsFirstPage` 는 방문일 최신순 첫 페이지. 서버 쪽은 [crawl](crawl.md).

### 세션 정리 · 게스트 진입 · 차트 토큰 · 내 위치 timeout [24차]

- **[main.tsx](../../apps/web/src/main.tsx) 401 = "현재 세션의 401 일 때만" 정리** (`9f39d53`·
  `fd371d9`) — `QueryClient` 생성을 `configureApi` 앞으로 옮기고 `onUnauthorized(requestToken)` 이
  `handleUnauthorizedForCurrentSession({ requestToken, getCurrentToken, onCurrentSessionUnauthorized })`
  ([shared](shared.md))를 거친다: 요청 시점 토큰이 지금 토큰과 같을 때만 `cancelQueries()` →
  `queryClient.clear()` → `setMealDraftPrincipal(null)` → `clearSession()` 을 **같은 JS turn** 에서
  — 계정 전환 직후 도착한 이전 계정의 늦은 401 이 새 세션을 지우지 못하게, 그리고 비우는 사이
  다른 계정 상태가 끼어들지 않게. [LoginPage](../../apps/web/src/routes/LoginPage.tsx) 게스트
  진입도 `setMealDraftPrincipal(null)` 을 기다린 뒤 `enterGuest()`(식단 draft namespace 는
  [meal](meal.md)).
- **[MyLocationButton](../../apps/web/src/components/restaurant/MyLocationButton.tsx)
  `timeout`(`67f14cf`)** — `UserLocationStatus` 에 `timeout`(권한은 있는데 측위가 늦음, 훅이 1회
  재시도한 뒤) 이 생겨 버튼은 살려 두고 문구만 "위치 측정이 오래 걸렸어요 — 다시 시도".
  17차의 denied/insecure/unavailable/pending 분기는 그대로.
- **[tailwind.css](../../apps/web/src/styles/tailwind.css) 차트 계열색 토큰** — `--air-series-1
  #2a78d6`/`--air-series-2 #eb6834`(다크 `#3f86dc`/`#de6f3f`; dataviz 검증기로 라이트 `#fcfcfb`·
  다크 `#353535` 표면에서 CVD ΔE·명도·대비 통과), 날씨는 의미 별칭 `--weather-temp: var(--air-series-2)`
  (난색)·`--weather-precip: var(--air-series-1)`(한색). 17차 `--tonal-*` 과 같은 `:root`+`.dark` 쌍.

### 웹 테스트 인프라 현황 — 13파일 77건 [갱신 — 24차]

22차의 5파일 29건(vote 3화면 20 + SmartPickSection 4 + useMapResearch 5)에서 **13파일 77건**으로. 러너·
setup·MSW 정책(`onUnhandledRequest: 'error'`, 기본 핸들러 없음)은 22차 그대로. 파일별:
AirNearbySection 6 · PublicSidebar 3 · PublicTopBar 3 · SmartPickSection 4 · MyLocationChip 4 ·
AdminFoodPage 7 · LifeMapPage 8 · MealPage 11 · VoteNewPage 7 · VotePage 9 · VoteResultView 4 ·
WeatherPage 6 · useMapResearch 5. 이번 라운드에 굳어진 기법: OL 은 jsdom 에서 돌지 않으니
`vi.mock('~/components/restaurant/MapCanvas')` 로 `forwardRef` + `useImperativeHandle` no-op 핸들
(`flyTo`/`flyToZoomIn`/`fitToMarkers`/`fitToCoords`)만 채운 자리표시자; `ResizeObserver` 스텁
(메테오그램·subBar 폭 측정); `window.matchMedia` 목으로 `useIsDesktopXl` 분기 강제; sonner 는
`vi.mock` 으로 호출만 검증(`<Toaster>` 애니메이션 타이밍에 안 묶임); SSE 는 가짜 `EventSource`
로 snapshot/progress/done 을 직접 흘림; 게스트 저장 위치는 `useAirLocationStore.setState` 로 심고
`useAuthStore.setState` 로 로그인/역할 전환.

### 모바일 UX 규율 / 공개 셸 / 어드민 셸

[이전 라운드 컴파일 동일 — `PublicLayout`, `AdminLayout`, 모바일
body 스크롤 + 100dvh + 한글 IME, 어드민 발견/자동 발견 카드, 다이닝코드 정식/
검증 페이지, 캐치테이블 테스트, canonical 그룹핑 + Scissors 분리 + MergeProposalQueue,
RestaurantsV2 BottomSheet 등 — 모두 그대로]. 자세한 내용은
[이전 컴파일 본 참고]. (어드민 라우트 등록만 `AdminRoutes.tsx` 로 이전 — 위 코드
스플리팅 참조.)

## Talks To [coverage: high — 42 sources]

- **`@repo/api-contract`** — N차 모델 zod 스키마:
  - `SettlementSessionType` / `SettlementRoundType` (rounds[] 추가) / `DraftRound` /
    `DraftCategoryAdjustment` / `SharedSettlementSessionType` (수정됨 배지·소유자
    필드 제거) / `calculateMultiRoundShares` (단일 round → N round 일반화) /
    `effectiveExcludes` (round override 반영).
  - 이전 라운드 schemas (canonical, diningcode, catchtable, auto-discover) 변경 없음.
- **`@repo/shared`** — 신규/확장 훅:
  - 정산 — `useSettlementDraftStore` (rounds[] 배열로 일반화 + `addRound`/
    `removeRound`/`updateRoundMeta`/`setRoundItems`/`setRoundReceipt`/
    `copyRoundAttendancesFrom`/`setCategoryAdjustment` 등 차수 API), `useCreateSettlement`
    (`fromDraftId` 옵션), `useUpdateSettlement`, `useSettlement`, `useSharedSettlement`,
    `useDeleteSettlement`, `useCreateSettlementShare`.
  - **자동 저장** [신규] — `useSettlementDraftHydrate(placeId)` (서버 draft fetch +
    store hydrate), `useSettlementDraftAutoSync({ placeId, placeNameHint, hydrated,
    initialDraftId, enabled })` (디바운스 PUT), `useListSettlementDrafts(activeOnly)`,
    `useDeleteSettlementDraft`.
  - **AI** — `usePreviewModels` (저장 전 모델 미리보기), 기존
    `useProviderModels`/`useUpdateProvider`/`useDeleteProvider`/`useTestProvider`
    그대로 (`ProviderKey` 페어 시그니처 유지).
  - **스케줄러** [신규 — 17차] — `useScheduleConfig`/`useUpdateScheduleConfig`/
    `useRunScheduleNow`/`useSchedulePreview(cron, tz, enabled)`/`useScheduleRuns`/
    `useScheduleRunEvents(enabled)` — AdminAnalyticsPage `ScheduleSection` 소비.
    도메인은 [schedule](schedule.md).
  - **분석/상세** [신규 — 17차] — `useRestaurantPublicCategoryTree(placeId)`
    (식당별 메뉴 카테고리 트리 — `CategoryTreeNodeType[]`, insights 와 별도
    endpoint). 위치는 `useUserLocation`(`UserLocationStatus` — MyLocationButton).
  - **공개 RAG / 군집 / 토스트** [신규 — 18차] — `useReviewQaReady(placeId)`(LLM 없는
    ready 게이트), `useReviewAskStore`(zustand·영속 — `ask`/`inFlight`/`lastByPlace`/
    `freshThisSession`/`completion`+seq), `useResummarizeWatcher({ onResult })`(단건
    재요약 전역 watcher), `useRestaurantClusters(placeId)`(군집+관점 폴백),
    `useProviderModels`(ModelPickerPopup) + `groupModelsByFamily`(@repo/utils).
  - **버스** [신규 — 19차] — `useBusStationSearch(q)`/`useBusStationsRefresh`(강제
    새로고침 mutation)/`useBusNearbyStations(lat, lng)`/`useBusStationArrivals(arsId)`
    (30초 폴링)/`useBusRouteDetail(routeId)`(형상+경유+기본정보, 정적이라 장기 캐시)/
    `useBusPositions(routeId)`(실시간 차량 위치)/`useBusFavorites`(게스트/로그인
    하이브리드 — BusPage 에서 단 1회 호출, 로그인 직후 게스트 저장분 서버 병합 포함).
    도메인은 [bus](bus.md).
  - **대기·날씨·내 위치** [신규 — 24차] — `useAirLocation()`(저장한 내 위치 — 로그인 서버/
    게스트 로컬 하이브리드, `location`/`save`/`clear`/`isSaving`; 상단바 칩·`/air`·`/weather`·
    `/life-map`·식단 추천이 같은 훅), `useMyLocationGlance({ refetchOnWindowFocus })`(칩 파생값 —
    앱 홈 카드 공용), `useAirSidoRealtime(sido)`/`useAirStationHistory(station, term)`/
    `useAirBadStations`/`useAirForecast`/`useAirWeeklyForecast`/`useAirStations`/
    `useAirNearbyStations(lat, lng, { limit, radius })`/`useAirStationSearch(q)`;
    `useWeatherNowcast(nx, ny)`/`useWeatherAws(lat, lng, { limit, radius })`/`useWeatherForecast(nx, ny)`/
    `useWeatherMid(landRegId, taRegId, stnId)`/`useWeatherMidSea(regId)`/`useWeatherVersions()`,
    `acquirePosition({ timeout, maxTries })`. 도메인 [air-quality](air-quality.md)/[weather](weather.md).
  - **일상지도** [신규 — 24차] — `useLifeMapPoints({ layer, bbox, zoom, filters } | null)`/
    `useLifeMapNearby(layer, lat, lng, { radius, limit, filters, enabled })`/`useLifeMapDetail(layer, id)`/
    `useLifeMapStatus()`/`useLifeMapSearch(q, limit)`(VWorld 검색 프록시) + 옴니박스가 재사용하는
    `useSubwayStationSearch`/`useBusStationSearch`, 지도 키 게이트 `useMapPublicConfig`. [life-map](life-map.md).
  - **식단·음식** [신규 — 24차] — `useInfiniteMealEntries`/`useMealEntries`/`useMealCalendar`/
    `useMealStats`/`useMealPhotoUrl(token, { variant })`/`useMealPreference`·`useUpdateMealPreference`/
    `useExportMealData`/`useDeleteAllMealData`/`useMealRecommendationContext`·`useMealRecommendations(n)`·
    `useCreateMealRecommendation`·`useMealRecommendationFeedback`·`useMealRecommendationEvent`/
    `useFoodRestaurants`, `setMealDraftPrincipal`(main·LoginPage). 어드민: `useFoodImportConfig`·
    `useUpdateFoodImportConfig`·`useRunFoodImportNow`·`useFoodImportRuns`·`useFoodImportPreview`·
    `useFoodImportRunEvents`(SSE)/`useFoodAdminStats`/`useFoodMergeConflicts`·`useResolveFoodMergeConflict`/
    `useFoodRecognitionQuality`/`useFoodAdminList`·`useUpdateFoodItem`·`useCreateFoodItem`.
    [meal](meal.md)/[food](food.md).
  - **세션·검색** [24차] — `handleUnauthorizedForCurrentSession`(401 이 현재 세션 것일 때만
    콜백 — main.tsx), `useRestaurantList({ q, limit, offset, sort })`(어드민 통합 검색).
  - **어드민 운영** [신규 — 18차] — 리뷰검색: `useReviewSearchRestaurants`/
    `useEnrichReviews`/`useReviewEnrichBg`·`useReviewEnrichEvents`·`useReviewEnrichStatus`·
    `useReviewEnrichPending`/`useRunClustering`·`useClusterStatus`·`useClusterBg`·
    `useClusterPending`/`useReviewAsk`. 로그: `useOperationRuns`/`useOperationRun`/
    `useOperationRunLogs`+`flattenOperationLogPages`/`useAnalyzeRun`/`useLogConfig`·
    `useUpdateLogConfig`. 텔레메트리: `useLlmTelemetry(true)`(LlmUsagePanel + AiUsagePage
    공유 캐시). 지역: `useRegionStats`. 텔레그램: `useTelegramConfig`/`useUpdateTelegramConfig`/
    `useDeleteTelegramConfig`/`useTestTelegram`/`useResolveTelegramChatId`. 테이블링:
    `useActiveTablingBulkSaveJobStore`/`useTablingSearch`/`useStartTablingBulkSave`/
    `useCancelTablingBulkSave`/`useTablingBulkSaveJob`/`useTablingRegistered`/`useSaveTablingShop`.
    자동 발굴: `useRandomCrawlConfig`/`useUpdateRandomCrawlConfig`/`useRunRandomCrawlNow`/
    `useRandomCrawlRuns`/`useRandomCrawlRunEvents`/`useRandomCrawlPreview` + `useRegionTree`/`useRegionDongs`.
  - 단골 — `useListContacts`, `useCreateContact`, `useUpdateContact`,
    `useDeleteContact`, `useSearchContacts`.
  - 영수증 추출 — `useUploadReceipt`, `useExtractReceipt`(splitIndex/splitTotal
    + roundIndex/roundTotal 컨텍스트 옵션), `settlementExtractionApi.previewBlob`.
  - 기존 (canonical 관리, 다이닝코드/캐치테이블 크롤, 자동 발견, 인증, 식당
    리스트, SSE) 모두 유지.
- **`@repo/utils`** — `formatWonPrice` (원화 콤마), 썸네일 프록시 헬퍼. [19차] 버스 —
  `busRouteTypeColor`(노선유형 코드 → 색), 마커 data URL 빌더
  (`buildBusStopMarkerDataUrl`/`buildBusVehiclePillDataUrl`/`buildBusVehicleDirDataUrl`/
  `buildBusRouteStopDotDataUrl`/`buildMyLocationMarkerDataUrl`), 노선 형상 유틸
  (`createRoutePathIndex`/`projectOnRoutePath`/`sliceRoutePath`/`bearingAtRoutePathS`) —
  BusStationsMap 이 차량 보간·화살표에 사용. [24차] 리뷰 정렬 `compareReviewRecencyDesc`(웹
  머지·어드민 정렬이 서버와 같은 비교자), 좌표/URL `parseLatLngParam`/`formatBbox`/`isInKorea`/
  `approxDistanceM`/`formatDistanceM`, 대기 `AIR_SIDO_OPTIONS`/`airSidoMatches`/`formatAirValue`/
  `todayKst`/`relativeDayLabel`, 날씨 지점표 `WEATHER_SIDOS`/`weatherPlaceById`/`nearestWeatherPlace`/
  `latLngToKmaGrid`/`weatherMidRegionForPlace`/`formatKmaTemp`/`formatKmaBaseLabel`, 일상지도
  `LIFE_MAP_POINT_MIN_ZOOM`/`isLifeMapLayer`/`lifeToiletOpenLabel`, 마커 `buildAirStationMarkerDataUrl`/
  `buildAirSavedLocationMarkerDataUrl`/`buildLifeToiletMarkerDataUrl`/`buildLifeHospitalMarkerDataUrl`,
  식단 라벨 `MEAL_SLOT_LABEL`/`FOOD_*_LABEL`/`summarizeMealNutrition`/`guessMealSlot`. 상세는 [utils](utils.md).
- **Zustand 스토어** — `useAuthStore`, `useActiveCrawlJobStore`, `panelPrefsStore`,
  `useActiveDiningcodeBulkSaveJobStore`, **`useActiveTablingBulkSaveJobStore`** [18차],
  `useActiveAutoDiscoverJobStore`, `useSettlementDraftStore` (sessionStorage),
  `useSettlementPrefsStore` (localStorage), `useThemeStore` (`lp:theme`),
  **`useReviewAskStore`** [18차 — 공개 질문 진행/결과 영속 + `completion` watcher 신호,
  `ReviewAskToaster`/`AskTab` 공유], **`useLifeMapPrefsStore`**(`lp:life-map-prefs` v2 — 레이어·필터
  취향)·**`useLifeMapRecentStore`**(`lp:life-map-recent` — 최근 본 위치 8) [24차, 웹 로컬], shared 의
  **`useAirLocationStore`**(게스트 저장 위치 `air-location-v1` — `useAirLocation` 하이브리드의 로컬
  절반, 테스트에서 `setState` 로 심는다) [24차]. draft vs prefs vs theme 수명·스코프가 달라 각각 분리.
- **TanStack Query 키** —
  - `['settlements', 'list', query]`, `['settlements', 'detail', id]`,
    `['settlements', 'shared', token]`, `['settlement-drafts', 'list', activeOnly]`.
  - 기존 ai-providers / ai-providers-models / preview-models, restaurants,
    diningcode/catchtable, canonical, auto-discover 그대로.
- **localStorage / sessionStorage** —
  - localStorage: `lp:token`, `lp:guest`, `lp:theme`, `lp:panelPrefs`,
    `lp:adminSidebarCollapsed`, `lp:settlementPrefs`, **`lp:llmUsagePanel:collapsed`·
    `lp:llmUsagePanel:corner`** [18차 — floating 패널 접힘/코너], **`lp:life-map-prefs`(v2)·
    `lp:life-map-recent`** [24차], shared 게스트 저장 위치 `air-location-v1` [24차], 다이닝코드/테이블링/
    자동발견 잡 id.
  - sessionStorage: 정산 draft (`settlementDraftStore` 의 persist key).
- **lucide-react** — `SplitSquareHorizontal` (다중 영수증 분할), `CopyCheck`
  (1차와 동일), `FileEdit`/`Receipt` (정산 이력 행), `History`/`Pencil`/`Share2`
  (결과 헤더 액션), `Camera`/`MapPin`/`Plus`/`Trash2` (차수 카드).
- **Tailwind v4** — `@custom-variant dark` 명시 binding (위 Architecture 참조).
- **OpenLayers / vworld WMTS / Radix UI / 백엔드 friendly** — 이전과 동일.

도메인 의미 / 분배 알고리즘은 [settlement.md](settlement.md), 크롤/SSE/분석은
[shared.md](shared.md), [crawl.md](crawl.md), [analytics.md](analytics.md) 참조.

## API Surface [coverage: high — 36 sources]

웹 앱은 HTTP 엔드포인트가 아닌 **브라우저 URL** + 재사용 컴포넌트 노출.

URL (정산 라우트가 차수 모델로 바뀌었지만 URL 자체는 동일 — 콘텐츠가 N차로):

- `/` — 공개 홈
- `/restaurants` / `/restaurants/:placeId` — 풀 뷰포트 검색 + 상세 (7탭 — `?tab=ask` 질문)
- `/restaurants-v2[/:placeId]` — 모바일 시트 v2
- **`/r[/:placeId]`** — 공유/SEO 대표 URL (리스트 숨김, 지도+상세)
- **`/bus`** / **`/subway`** — 대중교통(공개; 24차부터 모바일은 시트 패턴)
- **`/air`** — 에어코리아 대기정보 (공개, `?sido=&station=&term=DAILY|MONTH|3MONTH&code=PM10|PM25|O3` — 기본값은 URL 에서 생략)
- **`/weather`** — 기상청 날씨 (공개, `?p=지점id` 또는 `?ll=lat,lng`(GPS/저장 위치), `?sea=해역 regId`)
- **`/life-map`** — 일상지도 (공개, `?ll=lat,lng&z=줌&sel=layer:id`)
- **`/me/meals`** — 내 식단 조회 (`RequireUser`; 탭은 로컬 state, URL 없음)
- `/restaurants/:placeId/settle/new` — **정산 입력 4-step (N차)** (`RequireUser`)
- **`/me/settlements/new`** — 식당 없이 진입 (Step2 에서 1차 식당 검색)
- `/restaurants/:placeId/settle/:id` — 저장된 정산 결과 보기 (2-column sticky 정산표)
- **`/restaurants/:placeId/settle/:id/edit`** — 같은 SettlementNewPage, edit 모드
- **`/s/:token`** — 공유 토큰 read-only (수정됨 배지). 이전 `/share/settlements/:token`
  에서 짧아짐 — `/share/settlements/*` 는 이제 Fastify OG 미리보기/PNG 카드 경로
  (dev 프록시 + prod nginx).
- `/me/settlements` — 이력 (이어 입력 + 완료 + 다중 삭제)
- `/me/contacts` — 단골 관리
- `/login` — 로그인 + 회원가입 + 게스트
- `/admin/*` — discover / auto-discover / restaurants[/:placeId] / diningcode /
  **tabling** / analytics / **ai-usage** / **review-search** / **logs[/:runId]** /
  crawl-test / catchtable-test / diningcode-test / **tabling-test** / ai-test /
  settings(ai-keys / map / **telegram** / **logs**)

내부 재사용 컴포넌트 (신규/변경):

- [24차 신규] — 공개 셸 `AccountMenu`(계정 디스클로저), `weather/MyLocationChip`(날씨·대기 통합
  알약). 페이지 `routes/AirQualityPage`·`routes/WeatherPage`·`routes/LifeMapPage`·`routes/meal/
  {MealPage,MealRecommendTab,MealPreferenceTab,MealPhotoImg}`. 디렉터리 `components/air/`(15 —
  `AirPrimitives` 의 `AirSection`/`AirStateBlock`/`AirStaleNote` 는 날씨도 재사용)·`components/weather/`
  (12)·`components/life-map/`(8 — `LifeGoToBox` 옴니박스는 `variant: 'panel' | 'bar'`, `LifeLayerBar`
  는 `section: 'all' | 'layers' | 'filters'`). 시트 공용 `sheet/BottomSheet`(이동)·`sheet/useMapSheets`
  (+`SHEET_PEEK_HEIGHT`/`SHEET_HALF_RATIO`/`sheetHalfInset`)·`lib/useMediaQuery`(`useIsDesktopXl`).
  스토어 `stores/lifeMapPrefsStore`·`stores/lifeMapRecentStore`. 어드민 `routes/admin/AdminFoodPage`.
- [24차 변경] — `PublicTopBar`(폭 예산·NAV 7·subBar 유지)/`PublicSidebar`(`lg:hidden` 드로어 + 하단
  계정·테마 `md:hidden`), `MapCanvas`(`flyTo/flyToZoomIn(..., { bottomInset })`·`MapMarker.fixedScale`·
  Style 캐시), `MapLayerControl`(`--map-bottom-inset`), `RestaurantsV2Page`/`BusPage`/`SubwayPage`
  (시트 골격), `Bus/SubwayStationsMap`(따라가기 배지 inset)·`Bus/SubwayStationList`(일부만 표시
  인라인), `MyLocationButton`(`timeout`), `AdminRestaurantsPage`(`?q=` 검색), `AdminAiKeysPage`
  (용도 5종), `AdminLogsPage`(`FEATURE_LABEL` +3), `AdminRoutes`(`food` 2차 lazy)/`AdminLayout`
  (음식 카탈로그 leaf), `AdminCrawlTestPage`/`ActiveJobPanel`/`AdminRestaurantDetailPage`(리뷰
  최신순 비교자), `main.tsx`(401 현재 세션 가드)/`LoginPage`(게스트 principal), `tailwind.css`
  (차트 계열색 토큰).
- [19차 신규] — 버스 `routes/BusPage` + `components/bus/`(BusStationList[+SearchBar/
  ListBody]·BusStationsMap·BusArrivalPanel·BusFavoriteSection·BusFavoriteStar). `MapCanvas`
  에 `MapMarker.icon`(data URL) + `VehicleMarker` 전용 레이어 확장. `MenuTab`/`HomeTab`
  메뉴 그룹 렌더. `PublicSidebar`/`PublicTopBar` 에 버스 네비. `AdminReviewSearchPage`
  전부-노이즈 = 관점집계 표기.
- [18차 신규] — 공개 상세 `detail/AskTab`(RAG 질문 탭), `detail/ClusterTopics`(군집
  토픽+관점 폴백), `detail/ModelPickerPopup`(계열별 모델 선택 portal). 전역 토스트
  `ResummarizeToaster`/`ReviewAskToaster`(App 상주 render-null watcher). 어드민
  `admin/LlmUsagePanel`(전역 floating 사용량), `admin/RegionStatsPanel`/`admin/RegionStatsMap`
  (지역 통계 막대/표/choropleth), `routes/admin/RandomCrawlSection`(자동 발굴 스케줄러).
- [18차 신규 페이지] — `AdminReviewSearchPage`, `AdminLogsPage`/`AdminLogRunDetailPage`/
  `AdminLogSettingsPage`, `AdminTablingPage`/`AdminTablingTestPage`, `AdminTelegramPage`,
  `AdminAiUsagePage`.
- [18차 변경] — `tabs.ts`(`ask` 탭 추가), `InsightsTab`(ClusterTopics 임베드),
  `RestaurantsV2Page`/`RestaurantDetailRoute`(`/r` 공유 라우트 분기), `App.tsx`(토스터
  3개 마운트 + `/r` 라우트), `AdminLayout`(테스트 아코디언 + 신규 leaf + LlmUsagePanel),
  `AdminSettingsPage`(텔레그램·로그 탭), `AdminHomePage`(RegionStatsPanel), `AdminAnalyticsPage`(RandomCrawlSection).

- 정산 [신규] — `Step2Rounds`, `RoundDiscountEditor`, `RoundExceptionsEditor`,
  `RoundCategoryAdjuster`, `MultiReceiptSplitDialog`, `RestaurantSearchDialog`,
  `SettlementBreakdownTable`.
- 정산 [변경] — `Step1Participants` (단일 필드 + 별칭 토글), `Step3Edit` (차수 탭),
  `Step4Review` (multi-round + fromDraftId), `SettlementResultPage` (2-col +
  z-30 헤더), `SettlementHistoryPage` (드래프트 + 다중 삭제), `SettlementCards`
  (차수별 + 수정됨 배지), `SharedSettlementPage` (차수별 + 수정됨 배지).
- 정산 [삭제] — `Step2Source`, `ParticipantEditDialog` (N차 모델 + edit
  라우트로 흡수).
- UI 공용 — `components/ui/confirm-dialog.tsx`.
- 어드민 — `AdminAiKeysPage` "모델 미리보기" + `AdminAnalyticsPage` `ScheduleSection`.
- [신규 — 17차] — `restaurant/MapLayerControl`(레이어 토글), `restaurant/MyLocationButton`
  (공개·어드민 발견 공용 위치 버튼), `restaurant/detail/CategoryTree`(메뉴 카테고리 트리).
- [변경 — 17차] — `badge`/`button` tonal 6색 variant, 상세 탭(`HomeTab`/`InfoTab`/
  `InsightsTab`/`MenuTab`/`ReviewsTab`/`shared`) 카드 테두리 제거 + 팁/메뉴 클릭 필터,
  `MapCanvas.flyToZoomIn` imperative, `PublicRestaurantCard.onZoom`(더블클릭 확대).
- 그 외 모든 컴포넌트는 직전 라운드와 동일.

## Data [coverage: high — 17 sources]

- 로컬 DB 없음. 상태 갈래:
  - **서버 상태** — TanStack Query 캐시.
  - **클라이언트 인증** — Zustand `useAuthStore`.
  - **잡 슬롯** — Naver 크롤(`useActiveCrawlJobStore`), 다이닝코드 일괄 저장
    (`useActiveDiningcodeBulkSaveJobStore`), 자동 발견(`useActiveAutoDiscoverJobStore`).
  - **정산 draft** — `useSettlementDraftStore` (Zustand + sessionStorage). 식당
    `startFor(placeId)` 단위 보존, `startFromScratch` 로 식당 없이 시작 가능.
    서버 동기화는 `useSettlementDraftAutoSync` 가 디바운스 PUT 으로 위임.
  - **정산 prefs** [신규] — `useSettlementPrefsStore` (Zustand + localStorage).
    새 참여자 행 기본 exclude 토글만 보관. draft 와 수명이 다른 게 분리 이유.
  - **URL = state** — RestaurantsPage, RestaurantDetailRoute, AdminAnalyticsPage,
    AdminDiscoverPage, AdminRestaurantsPage (sort/page/pageSize) 가 useSearchParams.
    **BusPage** [19차] 도 q/stId/routeId/near 를 `useSearchParams`(모두 `replace`)로 —
    검색·선택·주변 좌표까지 URL 이 유일 진실(딥링크/공유 복원). 정산 페이지는 URL
    state 미사용 — step 은 page-local useState, draft 는 sessionStorage. [24차] 같은 규율
    (함수형 `setSearchParams` 1회 + `replace`, 기본값·빈 값은 키 삭제)로 **AirQualityPage**
    (`sido`/`station`/`term`/`code`), **WeatherPage**(`p`/`ll`/`sea`), **LifeMapPage**(`ll`/`z`/
    `sel=layer:id` — 뷰포트는 사용자 이동만 URL 반영, programmatic flyTo 는 호출자가 URL 을
    직접 맞춤), **AdminRestaurantsPage** `q`(+ `page` 리셋). 공유 가치가 낮은 선택(차트 항목·
    전국 비교 항목·중기전망 범위·식단 탭·목록 탭)은 로컬 state.
  - **일상지도 취향** [신규 — 24차] — `useLifeMapPrefsStore`(zustand persist `lp:life-map-prefs`,
    version 2 + migrate: 레이어 on/off `{cctv,toilet,hospital}` 기본 전부 켬 · CCTV 설치목적
    다중(빈 = 전체) · 화장실 편의 5키 AND · 병의원 종별 다중; `partialize` 로 액션 제외),
    `useLifeMapRecentStore`(`lp:life-map-recent`, 최근 본 위치 최대 8, 같은 라벨·≈50m 좌표 dedupe).
    위치·선택은 URL, 취향은 스토어 — `transitCrossShowStore` 관례.
  - **저장한 내 위치** [24차] — 웹 자체 스토어가 아니라 `@repo/shared` `useAirLocation`
    (로그인 = 서버 `/api/v1/air/location` 조회·저장·삭제, 게스트 = `useAirLocationStore` persist
    `air-location-v1`) —
    상단바 칩·대기·날씨·일상지도·식단 추천이 한 값을 본다([air-quality](air-quality.md)).
  - **세션 무효화** [24차] — 401 이 현재 세션의 것일 때만 `queryClient.cancelQueries()` →
    `clear()` → 식단 draft principal null → `clearSession()`; 이전 계정의 늦은 401 은 무시.
- **TanStack Query 키 신규** —
  - `['settlements', 'list', query]`, `['settlements', 'detail', id]`,
    `['settlements', 'shared', token]`.
  - `['settlement-drafts', 'list', activeOnly]`, `['settlement-drafts', 'detail',
    placeId]`.
  - `['ai-providers-preview-models', providerId]` (저장 전 미리보기).
- **localStorage** —
  - `lp:token`, `lp:guest`, `lp:theme`, `lp:panelPrefs`, `lp:adminSidebarCollapsed`,
    `lp:settlementPrefs` [신규], `lp:transit-cross-show`, **`lp:life-map-prefs`(version 2)·
    `lp:life-map-recent`** [24차], shared `air-location-v1`(게스트 저장 위치) [24차], 다이닝코드/자동 발견 잡 id (기존).
- **sessionStorage** — 정산 draft store (식당당 1개).
- **API 클라이언트 토큰 주입** — `configureApi({ getToken })`, 401 →
  `onUnauthorized: clearSession`.

## Key Decisions [coverage: high — 78 sources]

이전 라운드 결정(모바일 UX, 라우트 분리, AdminLayout 드로어, 풀 뷰포트
3-column, 5탭 1회 fetch, 라이트박스 단일 시퀀스, OL+WMTS, AdminDiningcode
정식/검증 분리, canonical 그룹핑, MergeProposalQueue, 자동 발견 잡 1개 + 60초 TTL,
2026-05-25 라운드의 CardContent pt-0 제거 / Lightbox mount instant / dvh /
MapCanvas declutter 해제 / AI provider {id,purpose} 페어 / AdminRestaurantsPage
서버 페이징, 정산 4-step Stepper + 영수증 미리보기 blob, 공유 토큰 read-only,
SettlementShareDialog 자동 POST 멱등)는 그대로 유지. 이번 라운드 신규/변경:

- **정산 = 차수(N차) 모델로 일반화** — 이전엔 한 정산 세션 = 한 영수증 / 한 식당.
  지금은 `rounds[]` 배열로 1차/2차/3차를 한 세션 안에 묶고, 각 차수가 자체
  식당(`placeId`/`placeName`)·source(MANUAL/RECEIPT)·할인·exception override·
  attendances 를 갖는다. `calculateMultiRoundShares` 가 단일 round 일반화의
  결과 — 1차만 있어도 같은 코드 경로. 결과 페이지가 차수별 카드 + 정산표
  매트릭스로 시각화. 1차/2차 식당이 다를 수 있어 `RestaurantSearchDialog` 가
  필수. 1차 만으로 끝나는 경우도 같은 N차 model 의 N=1 케이스라 별도 분기 없음.
- **Step2Source 삭제 + Step2Rounds 신규** — "직접 입력 / 영수증" 단일 분기는
  N차 모델에 흡수: 각 차수 카드가 자체 source 라디오. 다중 영수증 분할 같은
  새 흐름이 추가되니 단일 page 가 감당 못 하고, 차수 단위 카드가 자연스럽다.
  Step2Source 가 import 되던 모든 경로가 typecheck 로 잡혀 일괄 제거.
- **ParticipantEditDialog 삭제 + `/settle/:id/edit` 라우트 신규** — 저장 후
  참여자만 고치는 다이얼로그 패턴은 차수 모델에 안 맞는다 (어느 차수의 참석을
  바꿀지 분기가 필요). 그래서 결과 페이지의 "수정" 버튼이 같은
  `SettlementNewPage` 를 `id` 와 함께 열어 4-step 으로 재진입. session 을 fetch
  해서 draft 로 hydrate, 저장은 `useUpdateSettlement(id)`. "수정됨" 배지는
  서버의 `updatedAt > createdAt` 으로 판단해 결과 카드에 표시.
- **다중 영수증 분할 = 한 사진 N 슬라이스 × N차 매핑** — 사용자가 영수증
  여러 장을 한 컷에 찍어 올린 케이스 (테이블 위에 1차/2차/3차 영수증을 가로로
  놓고 한 번 찍음) 를 지원. `MultiReceiptSplitDialog` 가 업로드된 사진을 사용자가
  분할 개수 N(2~5) 와 "왼쪽부터 어느 차수" 매핑을 입력하면, 서버 split 옵션으로
  N 번 순차 추출 → 매핑된 차수에 적용. 사용자 인지 = "왼쪽부터 차례대로 1차/
  2차/...", 서버는 `splitIndex`/`splitTotal`/`roundIndex`/`roundTotal` 컨텍스트
  메타로 LLM 에 힌트. 진행 중 슬라이스 카운트(`done/total`) UI 표시 — N 번 LLM
  호출이라 한참 걸린다.
- **분담 다듬기 (RoundCategoryAdjuster) = leftover + round unit** — 1원 단위
  분배가 인원수로 안 나눠 떨어지는 경우의 정책. 기본은 calculator 가 첫 활성자에게
  잔여를 가산 (변하지 않은 동작). 사용자가 명시로 "받을 사람" 을 고르면 그 사람
  흡수. round unit (100/1000) 토글은 *그 unit 이 인원수로 떨어질 때만* 추천 칩
  활성화 — 안 떨어지면 회색 + 툴팁. 이렇게 두면 "1100원 부담을 5명이 균등하게"
  같은 무의미한 케이스에서 사용자가 헤매지 않는다.
- **`SettlementBreakdownTable` = 매트릭스 + sticky 셀 + 2-col 결과 페이지** —
  N차 정산은 "한 사람이 1차에 8천 / 2차에 5천 / ..." 같은 분해 표가 핵심.
  participant × (round × category) 매트릭스로 펼치고, 사용 카테고리만 컬럼
  노출 (UNCATEGORIZED 한 번도 안 쓰였으면 컬럼 자체 빠짐). 데스크톱은 결과
  페이지 우측 sticky 패널 — 좌측 스크롤 중에도 항상 보임. 모바일은 1컬럼 stack
  + 가로 스크롤. 이름·총계·합계 행은 sticky.
- **z-30 sticky 헤더** — `SettlementResultPage` / `SharedSettlementPage` 헤더가
  이전 `z-10` 에서 `z-30` 으로 상승. BreakdownTable 의 sticky 셀(`z-10`) 과
  같은 평면이라 헤더가 표 아래로 깔리던 회귀를 막는다. sticky 컨테인 관계와
  z 평면 — 한 번 sticky 가 들어가면 모든 sticky 요소의 z 를 한 번 재계산해야
  안전 (`SettlementBreakdownTable` 셀 z 도 같이 조정).
- **Tailwind v4 `@custom-variant dark` 명시 binding** — v4 의 dark variant 기본은
  `prefers-color-scheme` 미디어쿼리. 이 codebase 는 `html.dark` 클래스 토글
  방식이라 v4 기본으로는 작동하지 않는다 (CSS variable 만 토글되고
  `dark:bg-*` 등 모든 utility 가 시스템 다크 사용자한테만 작동하는 일관성
  깨진 상태). `@custom-variant dark (&:where(.dark, .dark *))` 한 줄로 binding —
  `.dark` 부모 안의 어떤 깊이의 요소에도 utility 가 발동.
- **`confirm-dialog.tsx` 공용화** — 인라인 `confirm()` 은 모바일에서 폰트/포커스
  이슈 + async/cancel/pending 흐름과 어색. fixed overlay + 두 버튼 + ESC/배경
  닫기 + `pending` 스피너 패턴으로 정리. 외부 헤드리스 라이브러리 안 끌어들이고
  내부 컴포넌트로. SettlementHistoryPage 의 단건/일괄 삭제부터 도입,
  SettlementResultPage 등 다른 잔존 `window.confirm` 은 점진 마이그레이션.
- **새 참여자 행 기본 exclude = localStorage 영속** — `useSettlementPrefsStore`
  가 새 행의 기본 exclude(주류/비주류/안주) 를 localStorage 에 영속. draft 와
  분리 — draft 는 sessionStorage(브라우저 닫으면 소멸), prefs 는 다음 정산까지
  유지. `panelPrefsStore` 와 같은 패턴. 단골에서 추가한 경우엔 단골값이 우선이라
  이 기본값은 무시 (사용자 의도가 명확한 경우 자동 적용 안 함).
- **Step1 = 단일 이름 필드 + 별칭 토글** — 이전엔 항상 이름+별명 두 칸. 95%
  케이스는 한 칸이면 충분 — 같은 이름의 다른 사람을 구분하거나 단골에서
  별칭이 같이 채워진 경우만 "+ 별칭" 으로 두 번째 칸 펼침. 충돌·중복 케이스만
  두 칸으로 명시. Enter 로 다음 행 추가 + nameRefs Map 으로 focus 이동
  (`pendingFocusId` + 다음 render useEffect — 외부 시스템(DOM focus) 동기화라
  useEffect 가 맞다).
- **"1차와 동일" 참석자 복사** — 4차/5차 같은 다차 정산에서 같은 사람들이
  계속 가는 케이스가 많다. 차수 카드에 `CopyCheck` 버튼 — `copyRoundAttendancesFrom
  (round.clientId, '1차')` 로 1차의 attendances 그대로 복사. 사용자가 매번 같은
  체크박스를 N번 누르는 부담 제거.
- **다중 선택 일괄 삭제 (SettlementHistoryPage)** — 단건 휴지통 + 다중 선택
  체크박스 + 일괄 삭제 sticky 액션바 + 페이지/사이즈 변경 시 선택 자동 초기화.
  일괄은 라운드트립 N번이지만 onSuccess 마다 invalidate → react-query 가 debounce
  → 마지막 호출에서 한 번만 refetch. 사용자가 50건씩 한 번에 정리하기 쉬워짐.
- **`AdminAiKeysPage` 모델 미리보기** — 이전엔 키 저장 → 저장된 키로 모델
  fetch → 모델 선택 → 다시 저장의 2 step. 지금은 키 입력 후 "모델 미리보기"
  버튼이 즉시 라이브 모델 목록을 가져와 dropdown 에 채운다 (`usePreviewModels`).
  사용자가 모델 고른 뒤 저장 한 번으로 끝 — 저장 전 키가 유효한지도 같은 호출에서
  검증. 모바일 카드 레이아웃은 칼럼 collapse / 버튼 정렬 / 마스킹.
- **`useSettlementDraftAutoSync` = 디바운스 PUT + 임시저장 hydrate** — 정산
  입력 도중 새로고침/이탈 시 복구를 위해 서버에 draft 자동 저장. 이전 라운드의
  client-only sessionStorage draft 위에 서버 동기화 레이어를 추가. `/me/settlements`
  1페이지 상단에 "이어 입력" 행으로 노출. 저장 완료(`useCreateSettlement`) 시
  `fromDraftId` 를 같이 보내 서버가 같은 트랜잭션에서 draft 도 정리한다.

- **(2026-05-31) 홈 랭킹 행 = `<Link>`, `<button>`/`onClick` 아님** — `RankingRow` 를
  `<Link to="/restaurants-v2/:placeId">` 로 감쌌다. `onClick` + `navigate` 대신 Link 라
  Cmd/Ctrl+클릭 새 탭·미들 클릭·키보드 포커스·우클릭 "새 탭에서 열기" 가 공짜로 동작.
  `placeId` 가 그대로 라우팅 키. 목적지는 `/restaurants` 가 아니라 신버전 `/restaurants-v2`
  레이아웃 — 홈에서 바로 시트형 상세로 들어간다.
- **(2026-05-31) 상세 라이트박스 = `createPortal(document.body)`** — 데스크톱 공개 상세는
  `[리스트|상세|지도]` 3-컬럼, 각 컬럼이 `position: sticky` 라 **저마다 stacking context** 를
  만든다. 라이트박스를 상세 컬럼 안에서 렌더하면 `z-50` 이 그 컬럼 context 안에서만 유효해,
  DOM 상 뒤에 오는 지도 컬럼(같은 `z:auto`)이 이미지 오른쪽을 덮어 잘렸다. `createPortal` 로
  `document.body` 에 빼면 컬럼 context 밖이라 전체 화면을 정상으로 덮는다. (기존 Gotchas 의
  "sticky containing block trap" 이 라이트박스에서 실제 회귀한 사례 + 그 해법.)
- **(2026-05-31) 라이트박스 backdrop 클릭 닫기 = pointerdown 좌표 비교** — X 버튼 외 보조
  닫기로 어두운 영역 클릭을 추가하되, 캐러셀 스와이프 끝에 발생하는 `click` 으로 의도치 않게
  닫히는 걸 막아야 한다. `pointerdown` 시 좌표를 기록하고 `click` 에서 이동거리가 10px 초과면
  스와이프/드래그로 보고 무시 (`Math.hypot`). 이미지(`IMG`)·버튼 클릭도 제외.
- **(2026-05-31) "내 위치" 버튼 = denied/insecure 는 비활성 대신 안내 callout** — 이전엔
  `denied`·`unavailable` 을 묶어 버튼을 disabled(클릭·title·재시도 전부 막힘) 했다. 지금은
  (a) `denied`(권한 차단) — 사용자가 브라우저 사이트 설정에서 직접 풀 수 있으므로 비활성하지
  않고 클릭 시 해제 방법 callout + `onClick`(refetch) 동시 — 이미 풀어뒀으면 즉시 재시도,
  (b) `insecure`(평문 HTTP — `window.isSecureContext === false`, 주로 dev/LAN 접속) — 앱에서
  못 푸니 callout 만(재시도 무의미), (c) 그 외 `unavailable`(timeout 등) — 비활성 대신 재시도
  여지, (d) `pending` 만 비활성. callout 은 바깥 클릭(`document mousedown` — 외부 시스템
  동기화라 useEffect 적합)으로 닫는다. 판정 로직은 [shared](shared.md) 의 `useUserLocation`.

- **(2026-06-01) 첫 로드 = 라우트 lazy, 캐시 안정 = vendor 청크 고정** — perf 의
  주된 레버는 **라우트 코드 스플리팅**(첫 청크에서 어드민 16페이지 + `ol` 지도 + 정산
  제거)이고, `codeSplitting.groups` 의 vendor 청크는 *바이트 절감이 아니라 캐시 안정*
  목적 — 앱 코드만 바뀌어도 `ol`/`react`/`@tanstack`/`@radix` 청크가 바뀌지 않아
  사용자가 재다운로드를 안 한다. 어드민은 `path="/admin/*"` 한 곳에 `AdminRoutes` 를
  단일 lazy 로 걸어, 익명 사용자는 어드민 코드를 0바이트 받는다. Suspense 폴백을
  페이지 자체 로딩 스피너와 같은 모양으로 맞춰 청크→데이터 전환 깜빡임 제거.
- **(2026-06-01) interaction 핫패스만 `memo` + 안정 콜백** — 전역 memo 대신 *큰 리스트
  위에서 부모 state 변경이 빈번한* 두 곳(`PublicRestaurantCard` 호버,
  `AdminDiningcodePage` `ResultCard` 체크박스/SSE)만 `memo`. 핵심 조건은 부모가
  **인라인 클로저를 끊고 안정 콜백(인자형 + `useCallback([])`)을 넘기는 것** — 안 그러면
  memo 가 매 렌더 새 함수 props 로 무력화된다. React Compiler 진단 룰(eslint warn)이
  같은 종류의 메모이즈 가능성을 코드 레벨로 본다.
- **(2026-06-01) 크롤 배치 = `setQueryData` 머지, 배치당 re-GET 0** —
  `AdminCrawlTestPage` 가 `visitor_batch` SSE 의 `stream.lastPersistedBatch`(post-dedup
  서버 id 포함)를 detail 캐시(`['restaurant', placeId]`)에 직접 머지(신규만 `summary:null`
  로 prepend, 기존 id skip). 배치마다 `invalidate` 하면 리뷰 리스트 전체를 다시 GET 하는데
  그걸 없앤다 — `useRestaurantSummaryEvents` 의 per-review 머지와 같은 모양. 최종
  `stream.result` 의 invalidate 한 번이 총계를 reconcile. ([stream-driven-cache-merge.md](../concepts/stream-driven-cache-merge.md)
  의 web 측 새 인스턴스 — 잡 SSE 외 어드민 크롤 테스트까지 같은 패턴이 번짐.)
- **(2026-06-01) Lightbox 를 `components/Lightbox.tsx` 로 승격** — 정산 영수증
  Lightbox 와 상세 사진 Lightbox 가 같은 구현(scroll-snap 캐러셀 + portal + dvh +
  backdrop 닫기)을 쓰게 되며 `detail/` 하위에 두던 걸 공용 `components/` 로 올렸다.
  옛 `components/restaurant/detail/Lightbox.tsx` 는 삭제 — import 가 남아 있으면
  typecheck 가 잡는다.
- **(2026-06-01) ESLint 인프라 web 합류** — `@repo/config/eslint/react` flat config 를
  펼치고 React Compiler 진단 룰을 `warn` 으로 도입(기존 코드 위반이 있어 우선 warn —
  회귀 방지·가시성, 점진 정리). web 은 React Compiler 를 빌드에 켜진 않았지만 룰은
  메모이즈 가능성 정적 검사라 유효. `turbo lint` 가 4 워크스페이스(web/friendly/
  api-contract/mobile) 모두 green. 자세한 base 는 [config.md](config.md).
- **(2026-06-01) 공유 SPA 경로 `/s/:token`, `/share/settlements/*` 는 서버 OG** —
  공유 링크를 메신저에 붙이면 미리보기(og:image)가 떠야 해서, `/share/settlements/*`
  를 Fastify 가 OG HTML + PNG 카드로 서버 렌더하는 경로로 비웠다. SPA 가 그 경로를
  먹으면 봇이 받는 건 빈 React 셸이라 미리보기가 안 뜬다. 그래서 사람이 보는 read-only
  SPA 는 `/s/:token` 으로 분리. dev 는 vite proxy, prod 는 nginx 가 `/share/settlements`
  를 Fastify 로 보낸다.

- **(2026-06, 17차) 웹 다크 모드 = localStorage 테마 스토어 + tailwind `@custom-variant
  dark` + vworld midnight/위성 레이어** — `useThemeStore`(`lp:theme`)가 `.dark` 클래스를
  토글하고, tailwind.css `@custom-variant dark (&:where(.dark, .dark *))` 한 줄이
  v4 의 미디어쿼리 기본을 덮어 클래스 토글 모드를 활성화(이 binding 없으면 시스템
  다크 사용자한테만 `dark:*` 발동). 지도는 `MapCanvas` 가 테마를 구독해 vworld
  `Base`↔`midnight` 자동 전환 + 좌하단 `MapLayerControl`(일반/다크/위성) 수동 토글
  — 한 번 수동 선택하면 테마에 더 끌려가지 않는다. 레이어 교체는 map 재생성 없이
  `tileSource.setUrl` + 라벨 색 반전만. **앱과는 디자인 토큰(@repo/shared)만 공유하고
  테마 저장소·구현은 플랫폼별로 분리** — 웹은 zustand+localStorage+`html.dark`,
  앱은 RN 자체 ([platform-ui-split](../concepts/platform-ui-split.md) 의 새 인스턴스).
- **(2026-06, 17차) soft tonal variant = CSS 토큰 한 쌍으로 라이트/다크 동시 정의** —
  badge/button 의 6색(blue/amber/violet/green/red/teal) 은 hex 직접이 아니라
  tailwind.css 의 `--tonal-{color}-bg/-bg-hover/-fg`(oklch) 토큰을 참조. `:root`(라이트)
  + `.dark`(다크) 두 곳에 같은 변수명으로 값만 다르게 둬, 다크 모드에서 자동으로
  어두운 틴트+밝은 글자로 뒤집힌다. 무테두리+틴트가 outline 보다 의미별 색 구분이
  명확해 어드민 액션 버튼을 일괄 교체.
- **(2026-06, 17차) 분석 인터랙션 = 팁/메뉴 클릭 → 리뷰 필터(동시 1개)** —
  `PublicRestaurantDetail` 가 `tipFilter`/`menuFilter` 두 state 를 들고 한쪽을
  고르면 다른 쪽을 해제(동시 1개만). 필터 리셋은 **식당 변경 시에만** — `?tab=` URL
  변경에 묶으면 "팁 클릭 → reviews 전환" 순간 tabProp 변경으로 필터가 즉시 풀리는
  회귀가 난다. 카테고리 트리는 insights 와 별도 endpoint(`useRestaurantPublicCategoryTree`)
  라 훅 규칙상 early-return 위에서 호출하고 roots 비면 섹션 숨김.
- **(2026-06, 17차) 카드 클릭=이동 / 더블클릭=확대 + `flyToZoomIn`(줌아웃 안 함)** —
  목록 카드의 단일 클릭은 선택(지도 fly-to), 더블클릭은 확대. `MapCanvas` 의 신규
  imperative `flyToZoomIn(lat, lng, minZoom)` 은 최소 `minZoom` 까지만 확대 — 이미
  더 확대된 상태면 줌은 유지하고 중심만 옮긴다(더블클릭으로 의도치 않게 줌아웃되는
  걸 방지). 공개·어드민 발견 지도에 통일.
- **(2026-06, 17차) 상세 탭 카드 테두리 제거·리뷰 사진 풀폭 = 앱과 통일** — 리스트
  항목의 `border`+`rounded` 박스를 `divide-y` 구분선 + 풀폭으로 — 모바일 단말에서
  카드 안 박스가 좁아 보이던 걸 앱 스타일에 맞췄다([mobile](mobile.md)).
- **(2026-06, 17차) AdminAnalyticsPage 에 스케줄러 UI 통합** — 별도 페이지가 아니라
  분석 관리 페이지 안 `ScheduleSection` — "정규화→머지" 운영을 보는 곳에서 그 주기
  자동화를 같이 설정. cron 직접 입력 부담을 친화 프리셋 4개로 낮추고, `useSchedulePreview`
  가 valid+다음 실행 시각을 미리 보여 잘못된 cron 을 저장 전 차단. 진행 중 run 은
  `useScheduleRunEvents` SSE 로 live. 서버 cron 등록·run 모델은 [schedule](schedule.md).

- **(2026-06-25, 18차) 비동기 결과는 App 레벨 전역 watcher 로 토스트** — 단건 재요약·
  공개 질문은 LLM 다중 콜이라 15초+ 걸리고, 그동안 사용자가 탭/페이지를 떠나기 쉽다.
  결과를 그 화면 컴포넌트가 들고 있으면 이탈 시 사라지므로, **App 에 render-null
  watcher 2개**(`ResummarizeToaster`·`ReviewAskToaster`)를 상주시켜 store/SSE 완료를
  지켜보다 sonner 토스트를 띄운다. ReviewAskToaster 는 '더보기'로 Ask 탭 복귀까지.
  "지금 그 식당 Ask 탭을 보고 있으면 토스트 생략"은 `window.location` 을 직접 읽어
  판정(useLocation 구독 시 매 네비게이션마다 effect 재실행·ref-during-render 발생).
- **(2026-06-25, 18차) 공개 질문 상태는 zustand·영속 store(컴포넌트 state 아님)** —
  `useReviewAskStore` 가 진행 중 요청·식당별 마지막 Q&A 를 보관·영속. AskTab 언마운트
  (탭 전환)에도 in-flight 가 살고 재진입 시 즉시 복원되며, App 의 ReviewAskToaster 가
  같은 store 의 `completion`(seq 추적)을 구독한다. `freshThisSession` 으로 "막 받은 답"
  vs "영속 복원된 지난 답"을 구분해 안내 문구만 다르게.
- **(2026-06-25, 18차) `/r/:placeId` = RestaurantsV2Page 재사용, 별 라우트 안 만듦** —
  공유/SEO 대표 URL 은 새 페이지를 짓는 대신 v2 페이지를 부모로 재사용(`useMatch('/r/:placeId')`
  → `isShareRoute`)하고 리스트만 숨겨 지도+상세를 보인다. 공유 받은 사람의 위치로 화면이
  흔들리지 않게 자동 bbox·"내 위치"를 끈다. 상세 1건을 `useRestaurantPublic` 으로 받아
  지도용 item 으로 변환해 prepend(목록 fetch 와 독립적으로 그 식당이 지도에 찍힘).
  봇은 Fastify OG HTML, 사람은 `/r` SPA — 정산 공유 `/s/:token` 과는 별개 경로.
- **(2026-06-25, 18차) choropleth 카운트 = point-in-polygon, 이름 매칭 안 함** —
  `RegionStatsMap` 의 시군구 색칠은 가게 좌표를 경계 폴리곤에 떨어뜨려 센다.
  "성남시분당구" 처럼 폴리곤이 구 단위로 쪼개지거나 시/도 명칭이 통계와 달라도 좌표만
  맞으면 되므로 명칭 차이를 신경 쓸 필요가 없다. 경계 GeoJSON 은 `public/` 에서 지연
  fetch — 대용량(~560KB)이라 src import 시 tsc 가 literal 타입 추론으로 폭주하고, 지도
  뷰 선택 시에만 받으면 메인 번들 영향이 0.
- **(2026-06-25, 18차) LLM 사용량 = 어드민 전역 floating + 상세 페이지가 캐시 공유** —
  `LlmUsagePanel`(AdminLayout 상주)과 `AdminAiUsagePage` 가 같은 `useLlmTelemetry(true)`
  SSE 스냅샷(React Query 캐시)을 본다. 패널은 한눈 게이지(동시성/누적), 페이지는 호출
  테이블까지. 인메모리 집계라 서버 재시작 시 리셋. 패널 접힘/코너는 localStorage 영속.
- **(2026-06-25, 18차) 테이블링 = 다이닝코드와 동형 페이지** — 정식(`/admin/tabling`)/
  테스트(`/admin/tabling-test`) 분리, 검색+일괄저장 잡(전용 active job store)+등록 목록+
  단건 저장 — 다이닝코드 페이지 패턴을 그대로 복제. 새 소스를 붙일 때 같은 골격을 재사용.
- **(2026-06-25, 18차) 작업 로그 = feature 통합 + 상세 재사용 export** — `AdminLogsPage`
  가 모든 기능의 run 을 한 곳에서(feature/status 필터). `FEATURE_LABEL`/`RunStatusBadge`/
  `triggerLabel`/`formatDuration` 을 export 해 `AdminLogRunDetailPage` 가 재사용 — 라벨
  매핑을 한 곳에만 둔다. 새 feature 추가 시 `FEATURE_LABEL` 한 곳만 손대면 양쪽 반영.

- **(2026-07-06, 19차) 버스는 URL 이 유일 상태 — 컴포넌트 state 최소** — BusPage 는
  q/stId/routeId/near 를 `useSearchParams`(모두 `replace`)로 URL 에 동기화해, 새로고침·
  공유·딥링크가 같은 화면으로 복원된다. 특히 주변 좌표(near)를 URL 에 담아 재진입 시
  Geolocation 재요청 없이 복원하고, 지도 자동 재조회(autoNear)만 로컬 state 로 둬
  history 오염을 막는다. q 와 near 는 배타(키워드 vs 주변). `setParam` 2회 대신 한 번의
  함수형 `setSearchParams` 로 여러 파라미터를 묶는 이유는 아래 Gotchas.
- **(2026-07-06, 19차) 버스 검색은 제출형 — 일 한도 보호가 UX 관통** — 서울시 개발계정
  일 한도 때문에 onChange 검색이 아니라 Enter/버튼 제출만 서버를 때린다. 실시간 폴링
  (도착 30초·위치)도 정류장/노선 선택 시에만. 이 정책이 shared 훅 enabled 게이트와 web
  UI(BusStationSearchBar 의 로컬 draft + form submit) 양쪽에 걸린다.
- **(2026-07-06, 19차) 버스 마커는 공용 MapCanvas 확장 — 포크 아님** — 식당용 MapCanvas 에
  `MapMarker.icon`(data URL 직접) 옵션과 `VehicleMarker` 전용 레이어를 더해 재사용한다.
  정류장/경유지 점/내 위치를 같은 마커 파이프라인에, 실시간 차량은 폴링 보간(형상 via)·
  진행 화살표·따라가기가 붙는 별도 애니메이션 레이어로. 지도 한 벌을 맛집·버스가 공유해
  vworld 키·테마·레이어 로직이 한 곳에 유지된다.
- **(2026-07-06, 19차) 버스는 처음엔 웹 전용 — 도메인은 공유 준비** — `/bus` 라우트·컴포넌트·
  네비는 apps/web 에만 두고 도메인 훅(@repo/shared)·계약(@repo/api-contract)·유틸(@repo/utils)은
  공유해 두는 순서로 만들었다. *(24차 정정: 2026-07 에 앱 대중교통 화면이 붙어 지금은
  양쪽 — 위 결정의 "공유 준비"가 실제로 재사용됐다.)* 도메인은 [bus](bus.md).
- **(2026-07-06, 19차) 메뉴 그룹 렌더 = 그룹 있으면 섹션, 없으면 평면 폴백** — MenuTab 이
  `menuGroups`(빈 그룹 제외)가 있으면 그룹 섹션별로, 없으면 기존 평면 `menus` 로 폴백.
  HomeTab 미리보기는 '대표메뉴' 그룹을 우선(그 그룹이 없으면 전체 앞 N개). 그룹 스키마·
  머지는 [menu-grouping](menu-grouping.md).
- **(2026-07-06, 19차) 군집 "전부 노이즈"는 실패가 아니라 관점집계** — AdminReviewSearchPage
  식당별 상태에서 노이즈-전부를 빨강(조치 필요)이 아니라 sky "관점집계"로 표기한다 — 공개
  분석 탭이 이 경우 AspectSummary 로 폴백하므로 정상이다. 계산 오류·리뷰 부족만 실제 조치
  대상으로 빨강 유지. → [review-clustering](review-clustering.md).

- **(2026-08-30, 24차) 일상지도 병의원 레이어 = prefs 스토어 version 2 + migrate** — 레이어를
  하나 더하면서 persist 된 `layers` 에 키가 없는 기존 사용자가 새 레이어를 못 보는 문제를
  `version: 2` + `migrate`(기본 켬, 종별 필터 전체)로 흡수. 스토어 shape 이 바뀌면 버전을
  올리는 것을 규칙으로 — 그냥 기본값만 바꾸면 이미 저장된 사용자는 영원히 옛 shape.
- **(2026-08-23, 24차) 401 은 "현재 세션의 401" 일 때만, 그리고 같은 JS turn 에서 정리** —
  계정 전환 직후 이전 계정 토큰으로 나갔던 요청의 늦은 401 이 새 세션을 지우면 안 되므로
  `handleUnauthorizedForCurrentSession` 이 요청 시점 토큰과 현재 토큰을 비교한다. 정리 순서는
  `cancelQueries` → `queryClient.clear()`(진행 query 파기) → 식단 draft principal null →
  `clearSession()` 을 한 turn 에 — 사이에 다른 계정의 로그인 상태가 끼어들지 못하게.
  private-cache 경계의 웹 측 구현([meal](meal.md) 의 principal namespace 와 짝).
- **(2026-08-22, 24차) 모바일 지도 페이지는 한 골격 — 시트 조율은 훅, 전이는 렌더 중 파생** —
  맛집 v2 의 목록/상세 두 시트 규칙(상세 열리면 목록 peek·숨김 + 상세 half, 닫히면 복원)을
  `useMapSheets` 로 빼서 대중교통·일상지도가 같은 훅을 쓴다. 전이를 effect 가 아니라
  setState-during-render 로 하는 이유는 상세 시트가 첫 프레임부터 half 여야 해서(effect 면
  직전 스냅으로 한 프레임 튐). 이전 대중교통 모바일(검색바/지도 40dvh/리스트 38dvh 세로
  적층)은 지도도 목록도 작고 선택 시 리스트가 패널로 통째 교체되던 것을, 시트로 지도를
  전면에 두고 패널을 얹는 구조로 바꿨다. 루트 높이 고정은 데스크톱만 — 모바일은 시트 full
  에서 body 스크롤(주소창 minify)이 살아야 한다. 앱의 플로팅 헤더 + 시트와 대응([mobile](mobile.md)).
- **(2026-08-22, 24차) 일상지도는 CSS 이중 마운트가 아니라 JS 분기(`useIsDesktopXl`)** —
  대중교통은 데스크톱/모바일을 `hidden xl:flex`/`xl:hidden` 으로 동시 마운트하고 지도 풀 키를
  둘로 나누지만([dual-mount-shared-state](../concepts/dual-mount-shared-state.md)), 일상지도는
  (a) OL 인스턴스를 한 개만 두고 싶고 (b) 시트가 데스크톱에 숨어 마운트되면 `BottomSheet` 의
  html overflow 락이 따라오므로 `matchMedia` 로 갈라 시트는 모바일에서만 마운트한다. 지도
  `<section>` 을 두 분기에서 같은 자리(첫 자식)에 둬 폭이 바뀌어도 리마운트가 없다. 즉
  "무거운 단일 자원 + 부수효과 있는 자식"이면 이중 마운트 결정 트리의 예외.
- **(2026-08-22, 24차) 상단바는 폭 예산으로 설계 — 넘치면 버튼이 아니라 칩이 준다** —
  공개 페이지 7개 + 내 위치 칩이 한 줄에 들어오지 않아, 브레이크포인트별로 담는 것을
  나눴다(`<md` 테마·계정은 드로어 하단으로, `lg` 부터 NAV 가로, `xl` 부터 이메일). 넘침의
  해는 "가로 스크롤 허용"이 아니라 칩 축소(`min-w-0`) — 문서가 가로로 스크롤되면 `fixed
  inset-x-0` 지도·시트 레이어까지 문서 폭을 따라 커지는 2차 피해가 있어서다. 계정은
  이메일+버튼 나열 대신 `AccountMenu` 디스클로저 하나(헤드리스 라이브러리 없이 — `ConfirmDialog`
  와 같은 결).
- **(2026-08-22, 24차) 음식 카탈로그는 어드민 청크 안에서 한 번 더 lazy** — 어드민 전체가
  이미 단일 lazy 청크지만 1,795줄짜리 적재/카탈로그 페이지는 그 페이지에서만 쓰이므로
  `AdminRoutes` 안에서 2차 `lazy` + 본문만 도는 `SectionFallback`. 다른 어드민 페이지 진입
  비용에 얹지 않는다 — 어드민 청크가 커질수록 이 패턴을 확장할 자리.
- **(2026-08-22, 24차) 식단 웹은 조회 전용, 입력은 앱** — `/me/meals` 는 기록·달력·통계·
  추천·설정만 하고 머리에 "기록은 앱에서 사진으로" 안내. 사진 촬영·오프라인 큐가 앱 소유라
  웹은 즉시 업로드/조회만 — [platform-ui-split](../concepts/platform-ui-split.md) 의 meal
  인스턴스를 라우트 수준에서 그대로 따른다. 추천 노출 이벤트는 `platform: 'web'` 으로 구분.
- **(2026-08-22, 24차) AI 용도는 `Record<enum>` 로 강제** — `AdminAiKeysPage` 의 `PURPOSE_META`
  가 `Record<LlmProviderPurposeType, …>` 이라 계약 enum 에 `meal-photo`/`meal-recommend` 가 늘자
  typecheck 가 페이지 갱신을 강제했다. `PURPOSE_ORDER` 도 전부 적는다 — 빠지면 그 용도의 모델을
  고를 UI 가 없어진다([zod-ssot-buildless](../concepts/zod-ssot-buildless.md)).
- **(2026-08-21, 24차) 대기·날씨는 "오퍼레이션 = 섹션" 예시 페이지 골격, 날씨가 대기
  프리미티브를 재사용** — 섹션 카드의 eyebrow 가 원천 API 오퍼레이션명(장식이 아니라 사실),
  선택은 URL(기본값은 키 삭제), 저장한 내 위치가 있으면 그 지점(가장 가까운 측정소/좌표)으로
  기본 진입. 날씨는 `AirSection`/`AirStateBlock` 을 그대로 쓰고 기상청 고유 띠만 추가 — 두
  공공 API 페이지가 같은 모양으로 읽힌다. 차트는 라이브러리 없이 인라인 SVG·단일 축·표 쌍둥이
  (툴팁이 유일한 경로가 아니게).
- **(2026-08-21, 24차) 저장한 내 위치 하나를 칩·대기·날씨·일상지도·식단 추천이 공유** —
  각 페이지가 자기 위치를 따로 갖지 않고 `useAirLocation`(로그인 서버/게스트 로컬 하이브리드)
  한 값을 본다. 대기는 측정소 저장·GPS 저장, 날씨는 지점 저장(`place`)으로 넣고, 칩은 그
  좌표의 날씨 + 가장 가까운 측정소 등급을 한 알약에 — 저장 위치가 없으면 칩은 아무것도 그리지
  않는다(강요 없음). [guest-server-hybrid](../concepts/guest-server-hybrid.md) 의 새 인스턴스
  (도메인은 [air-quality](air-quality.md)).
- **(2026-08-21, 24차) 칩 세그먼트는 경고 대신 탈락** — 날씨/대기 한쪽 자료가 없으면 그
  세그먼트만 조용히 빠지고 알약은 남는다. 측정소가 있어도 등급이 없으면(업스트림 장애)
  대기 세그먼트를 빼서 "● -" 를 남기지 않는다 — 칩은 경고하는 자리가 아니다, 사정은 툴팁.
- **(2026-08-21, 24차) 마커 Style 은 캐시, 작은 점은 `fixedScale`** — OL 이 매 프레임 style
  function 을 부르므로 일상지도 CCTV 수천 feature 에서 프레임마다 Style/Icon 생성 → 수 초
  멈춤. 입력 키가 같으면 같은 Style 인스턴스(OL 권장 — feature 간 공유 안전), 라벨까지 키에
  넣어 항목 수만큼만 불고 상한 6000 에서 통째 비움. 12px 점·숫자 버블은 줌 축소·라벨 숨김을
  건너뛰는 `fixedScale` — 크기 자체가 의미라서.
- **(2026-08-17, 24차) 어드민 맛집 검색 = URL `q`, draft 는 `{ urlQuery, value }` 한 state** —
  검색어도 정렬·페이지처럼 URL 이 진실(공유·뒤로가기). 입력 draft 를 URL 과 동기화하는
  useEffect 대신 "URL 이 바뀌었으면 URL 값을 보여주고, 다음 입력부터 그 URL 기준으로 잇는다"
  는 렌더 중 파생 — 뒤로/앞으로 가기에서 입력이 한 박자 늦게 따라오는 문제가 없다.
- **(2026-08-17, 24차) 리뷰 정렬은 서버와 같은 비교자, "수집 순서 = 최신순" 가정 폐기** —
  크롤 배치 `setQueryData` 머지가 prepend 만 하면 배치 경계에서 순서가 어긋나므로 머지 뒤
  `compareReviewRecencyDesc` 로 정렬(서버 상세 API 와 동일 비교자 — [stream-driven-cache-merge](../concepts/stream-driven-cache-merge.md)
  의 "머지 결과도 서버 정렬 계약을 지킨다"). 어드민 상세의 `fetchedAt-asc`(수집 순 = Naver
  최신순이라는 가정)와 로컬 `visitedSortKey` 를 지우고 `visitedAt-desc` 기본. 서버 쪽 원인은 [crawl](crawl.md).

### 기존 결정 유지

React 19, Tailwind v4 + shadcn 토큰, `@repo/shared` 경유, stream-driven cache merge,
역할 기반 가드, 다중 슬롯 잡, 재크롤 시 detail 리뷰 비우기, `fetchedAt-asc`,
비디오 프록시 정책, `MapCanvas` ResizeObserver, panelPrefsStore 페이지 namespace,
정산 Stepper 점프 게이팅 = "산출물 존재" 기준 (이번 라운드도 `participantsCount>0`/
`rounds.every(source!=null)`/`itemsCount>0` 으로 유지).

## Gotchas [coverage: high — 64 sources]

- **`Step2Source` 삭제 후 typecheck 가 잡힘** — 이전 라운드에 있던 `import { Step2Source }`
  / `'source'` step key 가 어떤 곳에 남아 있으면 tsc 가 에러 — 모든 호출처를 일괄
  제거해야 한다. step key 도 `'participants' | 'rounds' | 'edit' | 'review'` 로 바뀜.
- **`ParticipantEditDialog` 삭제 = 결과 페이지 "수정" 은 4-step 재진입** —
  이전엔 결과 페이지에서 다이얼로그 만 띄워 참여자 PATCH. 지금은 같은
  `SettlementNewPage` 가 id 와 함께 열려 4-step 으로 진입. 큰 흐름 변화라 신규
  개발자가 "왜 다이얼로그가 아니라 페이지 전환이지?" 의문이 들 수 있다.
- **다중 영수증 추출 = N 번 LLM 호출** — 한 사진 → N 분할 → N 번 vision LLM 호출이라
  한참 걸린다. `MultiReceiptSplitDialog` 가 진행 상황(`done/total` 카운트) UI 를
  명시적으로 보여줘야 사용자가 멈춘 줄 안다 — 안 그러면 30초~1분 대기 중 새로고침.
  서버는 멱등이 아니라(이미 한 슬라이스가 적용된 차수에 다시 적용해도 덮어쓰기)
  중간 취소도 의미 있게 동작해야 함.
- **영수증 swap 시 `?? null` clear** — 차수 source 를 RECEIPT → MANUAL 로 바꿀
  때 `receiptImageToken`/`receiptPreviewUrl` 등 RECEIPT 전용 필드를 명시
  `?? null` 으로 비워야 한다. 옛 토큰이 남아 있으면 결과 페이지가 RECEIPT 모드로
  잘못 렌더링 (이전 라운드 한 번 회귀했던 지점).
- **Tailwind v4 dark 변형 — `@custom-variant dark` 필수** — `(&:where(.dark, .dark *))`
  로 명시 binding 안 하면 nested `dark:bg-*` 같은 utility 가 발동하지 않는다.
  v4 기본은 미디어쿼리 — 클래스 토글 모드와 엇갈림. shadcn CSS variable 만
  토글되니까 "왜 카드 배경은 다크로 바뀌었는데 `dark:text-red-300` 만 안
  바뀌지?" 같은 미묘한 버그로 표면화.
- **`ConfirmDialog` mount-on-demand + portal 고려** — 현재 구현은 `fixed inset-0`
  fixed overlay 패턴. sticky 테이블 안에서 띄우면 sticky 컨테인 블록이 fixed
  를 자기 기준으로 잡아 클리핑할 수 있다. 결과 페이지의 sticky 컬럼 안에서 confirm
  을 띄울 경우 portal 로 body 에 mount 하는 검토 필요 (현재는 sticky 컬럼 밖에서
  호출돼 문제 안 됨).
- **공유 토큰 페이지 = `PublicLayout` 밖** — `/share/settlements/:token` 은
  `PublicLayout` 의 `<Outlet>` 자식이 아니라 별도 라우트. TopBar/사이드바 없음 —
  받는 사람이 보내는 사람의 계정 메뉴를 볼 필요 없다. 신규 페이지에서 PublicTopBar
  안 뜨는 게 버그처럼 보일 수 있으니 주의.
- **`SettlementShareDialog` 자동 POST = 멱등 가정** — 다이얼로그 open 즉시
  `useCreateSettlementShare.mutateAsync(sessionId)`. BE 가 이미 토큰이 있으면
  같은 토큰을 돌려준다는 가정에 의존 — BE 컨트랙트가 바뀌면 FE 가 무한 회전.
- **`RequireUser` ≠ `RequireAdmin`** — 정산은 USER 도 사용 가능이라 `RequireUser`
  가 token 만 보고 role 검사 X. `RequireAdmin` 라우트에 정산 페이지를 잘못 끼우면
  USER 가 진입 못 함. 두 가드 모두 [App.tsx](../../apps/web/src/App.tsx) 안 정의.
- **정산 Stepper 점프 게이팅 = "산출물 존재" 기준** — `canJumpTo` 가
  `participantsCount>0` / `rounds.every(r=>r.source!=null)` / `itemsCount>0` 셋만
  본다. "단계가 한 번이라도 활성화됐는가" 가 아니라 "현재 draft 에 그 단계의
  산출물이 살아있는가". `startFor(placeId)` 로 새 식당 진입 시 reset 되므로 식당을
  바꾸면 모든 단계가 다시 잠긴다. Step1 만 항상 활성.
- **`useSettlementDraftAutoSync` enabled = !isEdit** — edit 모드는 저장된 세션이
  source of truth 라 자동 저장 OFF. create 모드만 디바운스 PUT 발사. 두 모드를
  한 페이지가 다루므로 hook 의 `enabled` 가 isEdit 분기 정확해야 한다 — 잘못
  켜지면 편집 중인 세션 위에 draft 가 덮어 쓰일 수 있다.
- **`copyRoundAttendancesFrom` = 마스터 참여자 기준** — "1차와 동일" 은 1차의
  attended/excludes override 를 그대로 복사. 1차 이후에 추가된 마스터 참여자는
  1차에 없었으므로 새 차수에도 attendances 가 비어 있다. 사용자가 후속 차수에
서 그 참여자를 별도로 체크해야 함.
- **`MAX_ROUNDS = 10`** — zod schema enforced. UI 에서도 "+ 차수 추가" 버튼이
  10차에서 disabled. 11차 이상의 정산은 zod 가 차단.
- **다중 영수증 분할 — placeId 없는 차수는 매핑 대상 X** — 식당 미선택 차수가
  섞이면 서버 추출 요청이 실패하므로 `MultiReceiptSplitDialog` 가 placeId 있는
  차수만 후보로 노출 (`canOpenSplit = splitCandidateRounds.length >= 2`).
- **`SettlementBreakdownTable` sticky z 평면** — 셀의 `sticky z-10` 이 결과 페이지
  헤더 `sticky z-30` 보다 낮아야 한다. 헤더가 표 아래로 깔리면 헤더의 액션 버튼이
  안 눌림. 새 sticky 요소를 추가할 때 z 평면 매번 재검토.
- **`AdminAiKeysPage` 모델 미리보기 = 저장 전 키 사용** — `usePreviewModels` 가
  사용자가 입력한 키를 그대로 백엔드로 보내 라이브 fetch. 잘못된 키면 에러 응답이
  와 노출. 키가 비어 있으면 버튼 disabled — 빈 키로 호출하지 않도록.
- **(2026-05-31) 라이트박스를 상세 컬럼 안에 두면 다시 잘린다** — `detail/Lightbox.tsx`
  는 `createPortal(document.body)` 가 필수. sticky 3-컬럼 레이아웃에서 컬럼별 stacking
  context 때문에 `z-50` 이 컬럼 안에 갇혀 지도 컬럼이 위를 덮는다. portal 을 떼거나 상세
  컬럼 내부 래퍼로 되돌리면 회귀. (Radix Dialog 등은 자체 portal 이 있어 무관하지만 이
  라이트박스는 순수 div 라 명시 portal 필요.)
- **(2026-05-31) 라이트박스 backdrop `onClick` 은 스와이프와 구분해야** — `pointerDownRef`
  좌표 비교(10px) 를 빼면 캐러셀을 스와이프하다 손을 뗀 위치에서 발생하는 click 으로
  라이트박스가 닫힌다. 이미지/버튼 타깃 제외도 같이 유지.
- **(2026-05-31) "내 위치" — `unavailable` 을 통째로 비활성하면 안 됨** — `unavailable` 은
  비-secure context(평문 HTTP)·미지원뿐 아니라 timeout/일시 실패도 포함한다. 통째 disabled
  하면 title 툴팁도 안 뜨고 재시도도 막힌다. 평문 HTTP 만 `window.isSecureContext === false`
  로 따로 분기해 안내, 나머지는 재시도 여지를 남긴다. denied 도 비활성하면 사용자가 설정을
  푼 뒤 다시 시도할 길이 막히므로 callout + refetch.
- **(2026-06-01) `AdminRoutes` 내부 라우트는 `/admin` 상대 경로** — App 에
  `path="/admin/*"` 로 마운트되므로 `AdminRoutes.tsx` 안의 `<Route path>` 는 모두
  `/admin` 기준 상대(`discover`, `settings/ai-keys` …). 절대 경로(`/admin/discover`)로
  쓰면 중첩 매칭이 깨진다. `Navigate` target 만 절대 경로 유지(옛 북마크 호환).
- **(2026-06-01) lazy 청크 + memo 는 안정 콜백 전제** — `memo` 카드(`PublicRestaurantCard`,
  `ResultCard`)는 부모가 인라인 클로저(`onClick={() => ...}` )를 넘기면 매 렌더 새 props 가
  돼 즉시 무력화된다. 반드시 인자형 콜백 + `useCallback([])`/함수형 업데이터로 안정화해야
  bail-out 이 실제로 일어난다. 새 prop 을 추가할 때도 그 prop 이 안정적인지 같이 봐야 함.
- **(2026-06-01) 크롤 배치 머지 — 최종 invalidate 가 총계 보정 역할** — `setQueryData`
  로 배치마다 신규 리뷰만 prepend 하므로, 서버 측 dedup/순서 차이로 클라 캐시 총계가
  미세하게 어긋날 수 있다. `stream.result` 도착 시의 `invalidate(['restaurant', placeId])`
  한 번이 전체를 다시 reconcile 한다 — 이 최종 invalidate 를 빼면 캐시가 영원히 부분
  상태로 남는다.
- **(2026-06-01) Lightbox 는 이제 `~/components/Lightbox`** — `detail/Lightbox.tsx` 는
  삭제됐다. 옛 경로로 import 하면 빌드 실패. 정산·상세가 같은 파일을 공유하므로 한쪽
  변경이 다른 쪽에 영향 — 변경 시 양쪽 사용처(`PhotosTab`/`shared.tsx`/정산) 확인.
- **(2026-06-01) `/s/:token` vs `/share/settlements/*` 혼동 주의** — read-only SPA 는
  `/s/:token`. `/share/settlements/*` 로 진입하면 SPA 가 잡지 않고 Fastify OG/PNG 가
  응답한다(dev 프록시·prod nginx). 공유 링크 생성 코드(`SettlementShareDialog`)가 어느
  URL 을 복사하는지 BE 컨트랙트와 맞춰야 한다 — SPA 경로와 OG 경로를 헷갈리면 미리보기가
  안 뜨거나 사람이 빈 페이지를 본다.
- **(2026-06-01) ESLint 룰은 전부 `warn`** — 기존 코드 위반(set-state-in-effect 등)이
  있어 우선 warn 으로 도입했다. `eslint .` 가 통과해도 경고가 잔존하므로 CI 가 warn 을
  error 로 격상하지 않도록 주의(점진 정리 정책). `**/*.js` 는 stale tsc 산출물이라
  대상 제외 — `.tsx` 만 lint.
- **(2026-06, 17차) `MapLayerControl` 수동 선택 후 테마 변경 무시** — `MapCanvas` 가
  `userPickedLayerRef` 로 사용자의 수동 레이어 선택을 기억한다. 한 번 토글하면 이후
  light↔dark 테마 변경에 지도 레이어가 더 따라가지 않는다(의도). "다크 모드로 바꿨는데
  지도는 그대로네?" 는 버그가 아니라 사용자가 이전에 위성/일반을 직접 골라둔 경우다.
- **(2026-06, 17차) 레이어 교체는 같은 URL `setUrl` 금지(첫 렌더 skip)** — `MapCanvas`
  의 레이어 effect 는 `layerInitRef` 로 첫 렌더를 건너뛴다. map-create effect 가 이미
  올바른 레이어로 만들었는데 같은 URL 로 `setUrl` 하면 OL 이 타일을 통째로 리프레시해
  깜빡인다. 라벨 색 반전은 `vectorSource.changed()`(재평가)만 — feature 재생성 X.
- **(2026-06, 17차) 팁/메뉴 필터 리셋은 식당 변경에만 묶어야** — `PublicRestaurantDetail`
  의 `tipFilter`/`menuFilter` 리셋을 `?tab=`(tabProp) 변경에 묶으면, controlled 모드에서
  "팁 클릭 → reviews 탭 전환" 순간 tabProp 이 바뀌며 방금 건 필터가 즉시 풀린다. 반드시
  placeId(식당) 변경만 트리거.
- **(2026-06, 17차) `useRestaurantPublicCategoryTree` 는 early-return 위에서 호출** —
  `InsightsTab` 이 `insightsLoading` early-return 을 갖는데, 카테고리 트리 훅을 그 아래
  두면 Rules of Hooks 위반. early-return 위에서 호출하고 `roots.length === 0` 이면
  섹션만 숨긴다(전역 머지가 닿은 식당만 roots 가 채워짐).
- **(2026-06, 17차) tonal variant 색은 tailwind.css 토큰 의존** — badge/button 의
  `bg-[var(--tonal-*-bg)]` 는 tailwind.css `:root`+`.dark` 에 정의된 CSS 변수를 읽는다.
  토큰을 지우거나 한쪽(라이트/다크)만 두면 그 모드에서 배경이 비어 투명/검정으로 깨진다.
  새 tonal 색 추가 시 `:root` 와 `.dark` 양쪽에 3개 변수 쌍을 모두 넣을 것.
- **(2026-06, 17차) `ScheduleSection` config draft 동기화 useEffect** — `config.data`
  도착 시 draftCron/timezone/customMode 를 동기화하는 useEffect 가 `cronExpr`/`timezone`
  deps 만 본다(`eslint-disable exhaustive-deps`). draft 가 dirty 한 상태에서 config 가
  refetch 되면 사용자 입력이 덮일 수 있으니 deps 변경 시 주의. cron 유효성은
  `useSchedulePreview` 의 `valid` 로 판단 — invalid 면 save 차단.
- **(2026-06-25, 18차) 토스터는 App 에 마운트 — Routes 안이 아님** — `ResummarizeToaster`/
  `ReviewAskToaster`/sonner `<Toaster>` 는 `<Routes>` 바깥 App 최상위에 둔다. Route 안에
  두면 페이지 전환 시 언마운트돼 진행 중 watcher 가 끊긴다. ReviewAskToaster 의 "현재 Ask
  탭이면 생략" 판정은 `useLocation` 이 아니라 `window.location` 직접 — 구독하면 매 이동마다
  effect 가 재실행돼 같은 완료를 중복 토스트할 수 있다(seq ref 로도 막지만 근본은 직접 읽기).
- **(2026-06-25, 18차) `useReviewAskStore.completion` 은 seq 로 중복 차단** — 같은 완료
  이벤트로 두 번 토스트하지 않게 `lastSeq` ref 비교 후 `clearCompletion()`. seq 없이 객체
  identity 만 보면 store 재구독/리렌더로 같은 답이 다시 토스트될 수 있다.
- **(2026-06-25, 18차) Ask 탭 ready 게이트는 LLM 안 부름** — `useReviewQaReady` 는 enrich
  여부·근거 건수만 조회(가벼움). 질문 제출(`ask`)만 LLM 3콜. 탭 진입마다 LLM 을 때리지
  않도록 ready 와 ask 를 분리 — ready 없는 식당엔 입력창 대신 안내만.
- **(2026-06-25, 18차) `ClusterTopics` 는 읽기 전용 — 군집은 배치 산출** — InsightsTab 이
  `useRestaurantClusters` 결과를 그리기만 한다. 군집이 비면(전부 노이즈) `aspectSummary`
  폴백, 그것도 없으면 섹션 자체 미표시 — "분석 탭이 비어 보이는데?"는 군집/관점 둘 다
  없는 식당이다(버그 아님). 실제 군집 실행은 어드민 `AdminReviewSearchPage`/스케줄러.
- **(2026-06-25, 18차) `ModelPickerPopup` 도 portal 필수 (Lightbox 와 동일 함정)** — 단건
  재요약이 상세 컬럼 안에서 열리는데 popup 을 컬럼 안에 두면 sticky stacking context 때문에
  지도 컬럼이 위를 덮는다. `createPortal(document.body)` 로 빼야 전체를 덮는다.
- **(2026-06-25, 18차) sigungu-geo.json 은 src import 금지** — `public/` 에 두고 런타임
  fetch(`import.meta.env.BASE_URL`). src 로 import 하면 tsc 가 거대 literal 타입을 추론해
  타입체크가 폭주하고 메인 번들에 ~560KB 가 박힌다. 갱신은 `build-sigungu-geo.mjs` 수동
  실행(빌드 파이프라인 자동 아님 — Node 18+ + npx mapshaper 필요).
- **(2026-06-25, 18차) `/r/:placeId` 와 `/restaurants-v2` 는 같은 컴포넌트 — 분기 누락 주의** —
  RestaurantsV2Page 가 두 라우트를 겸하므로 `isShareRoute` 분기를 빠뜨리면 공유 화면에
  리스트가 다시 뜨거나 받는 사람 위치로 bbox 가 흔들린다. 새 기능 추가 시 share 경로에서의
  동작을 항상 같이 확인. 닫기 경로도 `RestaurantDetailRoute` 가 `useMatch` 로 분기.
- **(2026-06-25, 18차) `LlmUsagePanel`·`AdminAiUsagePage` 는 같은 캐시 — 한쪽 변경 영향** —
  둘 다 `useLlmTelemetry(true)`. 텔레메트리 스키마/키가 바뀌면 양쪽 동시에 깨진다. 인메모리
  집계라 서버 재시작 후엔 누적이 0 으로 돌아가는 게 정상(startedAt 표기로 구분).
- **(2026-06-25, 18차) `RandomCrawlSection` region cascade — 부모 랜덤이면 자식 고정 불가** —
  `normalizeRegion` 이 위→아래로 강제(시/도 랜덤이면 시군구 자동 랜덤). UI 셀렉트도
  `disabled` 로 막지만 저장 직전 정규화가 최종 — "구를 골랐는데 저장하니 랜덤이 됨"은 시/도가
  랜덤이라 cascade 된 것. 텔레그램 미설정이면 회차가 자동 건너뜀(경고 callout).
- **(2026-07-06, 19차) 버스 `q`/`near` 는 배타 — 한쪽 세팅 시 반대편 delete 를 한 업데이트로** —
  키워드 제출/주변 진입/재검색 핸들러가 반드시 반대 파라미터(+stId/routeId)를 같은
  `setSearchParams` 함수형 업데이트로 지운다. `setParam` 을 연달아 2회 부르면 함수형 updater
  가 같은 렌더의 searchParams 를 두 번 읽어 첫 변경이 유실될 수 있어(BusPage 주석의 근거),
  한 번의 업데이트로 묶어야 한다.
- **(2026-07-06, 19차) 주변 모드 지도 마커는 누적(accumRef) — 자동 재조회 공백 방지** —
  패닝 자동 재조회로 결과가 교체될 때 이전 지점 마커까지 사라지면 이동 중 화면이 간헐적으로
  빈다. 지도(BusStationsMap/BusPage.mapItems)에는 이번 주변 세션의 합집합을 유지(리스트는
  현재 지점 결과만)하고, 명시 액션(📍/재검색)으로 URL `near` 가 바뀌면 누적을 비운다 — 안
  비우면 직후 `fitToMarkers` 가 이전 지점 마커까지 포함해 크게 줌아웃된다. 상한(600) 초과 시
  현재 결과만 남기고 리셋.
- **(2026-07-06, 19차) 노선 추적 중 `suppressFit` — 경유지 점 클릭에 줌아웃 방지** — 선택
  정류장이 활성 결과에 없어 mapItems 가 바뀌어도(즐겨찾기/노선 점 진입) 지도가 노선 전체로
  줌아웃되지 않게 `suppressFit = autoNear !== null || routeId !== null`. 선택 flyTo 는 "선택이
  바뀐 순간" 1회만(`flownStIdRef`) — items 변화를 트리거로 쓰면 주변 자동조회·폴링으로 items
  가 수시로 바뀔 때 사용자가 지도를 옮겨도 선택 정류장으로 계속 끌려간다(실측 재현 버그).
- **(2026-07-06, 19차) 가상정류장(arsId '0')은 도착정보 없음 / 죽은 stId 는 URL 유지** — 훅
  enabled 가 arsId '0' 을 차단하고 패널이 "가상정류장 — 도착정보 미제공" 안내(배지도 숨김).
  선택 stId 가 재검색으로 결과에서 사라지면 `selectedMissing` 안내만 띄우고 URL 은 건드리지
  않는다(즐겨찾기/노선 경유지 스냅샷으로 살아있을 수 있어 성급히 지우지 않음).
- **(2026-07-06, 19차) 버스 즐겨찾기 별은 행 버튼의 형제 — 버튼 중첩 회피** — 정류장/노선
  행 자체가 `<button>`(선택/추적)이라 `BusFavoriteStar` 를 그 안에 넣으면 무효 HTML. 형제로
  배치하고 별 `onClick` 은 `stopPropagation` 방어. `MapMarker.icon` 이미지는 식당 마커와
  동일 규격(26×26/32×48)이어야 라벨 offset·축소 스케일이 어긋나지 않는다.
- **(2026-08-22, 24차) `BottomSheet` 는 `~/components/sheet/`** — `restaurant-v2/BottomSheet`
  경로는 사라졌다(R100 이동). 옛 경로 import 는 빌드 실패. 목록/상세 스냅 규칙을 페이지에서
  손으로 다시 짜지 말고 `useMapSheets` — 페이지마다 다른 규칙이 생기면 통일한 의미가 없다.
- **(2026-08-22, 24차) `useMapSheets` 는 `useState` 선언들보다 앞에** — React Compiler 메모
  검증이 훅을 뒤에 두면 앞의 setter 들을 반응값으로 봐 경고. BusPage/SubwayPage 주석의 근거.
  `initialListSnap` 은 마운트 1회만 읽힌다(딥링크 진입용) — 이후 검색 제출은
  `setListSnap(s => s === 'peek' ? 'half' : s)` 로 올려야 결과가 보인다.
- **(2026-08-22, 24차) 모바일 루트 높이를 고정하면 시트 full 이 깨진다** — `xl:h-[calc(100dvh-…)]`
  처럼 데스크톱에만 고정. 모바일까지 `h-[calc(100dvh-…)]` 로 묶으면 시트가 scroll 모드로
  전환돼도 body 가 스크롤되지 않아 주소창 minify 가 안 되고 시트 하단이 잘린다.
- **(2026-08-22, 24차) 숨은 시트도 html overflow 를 잠근다** — `BottomSheet` 의 락 effect 는
  `hidden` 과 무관하게 `mode === 'fixed' && !disableScrollLock` 이면 돈다. 버스·지하철은
  데스크톱에서도 `xl:hidden` 안에 목록 시트가 마운트돼 `html.overflow = hidden` 이 걸리지만
  데스크톱 루트가 고정 높이·내부 스크롤이라 티가 나지 않을 뿐이다. **body 스크롤이 필요한
  페이지에 이 골격을 복사하면 안 된다** — 일상지도처럼 `useIsDesktopXl` 로 시트 마운트 자체를
  가르거나, 시트에 `disableScrollLock` 을 줘야 한다.
- **(2026-08-22, 24차) `--map-bottom-inset` 은 지도 래퍼에** — `MapLayerControl`·따라가기 배지는
  `var(--map-bottom-inset, 0px)` 를 읽을 뿐 스스로 시트 높이를 모른다. 모바일 fixed 지도
  래퍼(`style={{ '--map-bottom-inset': SHEET_PEEK_HEIGHT }}`)에 변수를 안 주면 컨트롤이 peek
  시트 밑에 깔린다. 데스크톱·어드민은 변수 없음 = 0 이 정상. `flyTo` 의 `bottomInset` 도 같은
  이유로 호출자가 `sheetHalfInset(headerHeight)` 를 계산해 넘긴다(데스크톱은 `undefined`).
- **(2026-08-22, 24차) 상세 시트 `key` 는 항목 id** — `key={stId|stn|selectedMarkerId}` 라 항목이
  바뀌면 시트가 재마운트돼 스크롤·스냅이 초기화된다(의도 — 이전 항목 스크롤 위치가 남지
  않게). key 를 빼면 `useMapSheets` 의 detailSnap 만 남아 스크롤이 이어진다.
- **(2026-08-22, 24차) `useIsDesktopXl` 기본은 데스크톱** — `matchMedia` 가 없으면(jsdom) `true`.
  모바일 분기를 테스트하려면 `window.matchMedia` 를 `matches: false` 로 목(LifeMapPage.test)
  — 안 하면 시트 관련 단언이 조용히 데스크톱 패널을 본다. `addEventListener`/`removeEventListener`
  까지 채워야 `useSyncExternalStore` subscribe 가 안 터진다.
- **(2026-08-22, 24차) 상단바 폭 예산은 실측 상수** — 칩 `<md` ~170px / `lg+` ~340px, NAV 는
  768px 에서 칩과 공존 불가 같은 숫자에 기대 브레이크포인트를 골랐다. NAV 항목·라벨을
  늘리거나 칩 내용을 더 펼치면 `PublicTopBar` 상단 주석의 표를 다시 실측해야 한다.
  `md+` 에서 사이드바 하단 계정 블록(`md:hidden`)과 상단바 계정 메뉴가 동시에 보이면 폭 예산
  분기가 깨진 것.
- **(2026-08-22, 24차) NAV `requiresAuth` 는 게스트도 숨긴다** — 필터가 `!!user` 라 게스트
  (`isGuest`, `user: null`)에겐 "식단" 메뉴가 없다(`/me/meals` 는 `RequireUser` 라 직접 진입도
  로그인으로). 게스트 전용 화면이 필요하면 별도 플래그.
- **(2026-08-21, 24차) 칩의 대기 세그먼트 없음 ≠ 오류** — 측정소가 없거나(`items: []`) 등급이
  없으면(`measure: null`) 세그먼트가 빠진다. "칩에 공기질이 안 보인다"는 우선 `title` 툴팁
  ("대기 자료 없음 — 가장 가까운 측정소 …")을 보라. 날씨 세그먼트는 실황이 없으면 수치만
  빠지고 라벨은 남는다.
- **(2026-08-21, 24차) 대기·날씨 placeholder 전환 중 실패는 에러로** — `isPlaceholderData` 상태에서
  refetch 가 실패했는데 이전 측정소/지점 값을 계속 보여주면 오정보라 `AirStateBlock kind="error"`
  로 떨어뜨린다. 정상 전환 중엔 `dim` 만. 이 분기를 지우면 측정소를 바꿨는데 이전 측정소
  수치가 그대로 남는다.
- **(2026-08-21, 24차) 날씨 `savedHere` 는 좌표 ≈50m 근사** — 저장 위치와 지금 지점의 위·경도
  차 `< 0.0005` 로 판정해 "저장됨/해제" vs "이 지점을 내 위치로 저장" 버튼을 가른다. 지점
  좌표가 청사 기준이라 같은 구라도 GPS 저장분과는 다른 지점으로 본다(의도).
- **(2026-08-21, 24차) 일상지도 programmatic 이동은 URL 을 직접 맞춘다** — `onViewportChangeEnd`
  는 사용자 이동만 URL 에 쓰므로 옴니박스 `handleGo`/내 위치 flyTo 는 `setParams({ ll, z })` 를
  같이 호출해야 새로고침 시 같은 곳. 저장 위치로의 1회 flyTo 는 `userMovedRef` 가 false 일 때만
  — 사용자가 먼저 움직였으면 서버 응답이 늦게 와도 끌고 가지 않는다.
- **(2026-08-21, 24차) `MapCanvas` 목은 뷰포트를 올리지 않는다** — LifeMapPage.test 의 목은
  `onViewportSync` 를 부르지 않아 `bbox` 가 null → `useLifeMapPoints(null)` 비활성 → points
  요청이 없다. points 핸들러를 안 깔아도 `onUnhandledRequest: 'error'` 가 안 터지는 이유이자,
  points 관련 단언을 이 테스트에 넣을 수 없는 이유.
- **(2026-08-21, 24차) `lifeMapPrefsStore` shape 변경 = version 올리기** — `partialize` 로 저장된
  객체에 새 키가 없으면 `migrate` 없인 영원히 옛 shape(병의원 레이어가 안 보임). 레이어/필터를
  더할 때 `version` 과 `migrate` 를 같이.
- **(2026-08-22, 24차) `AdminFoodPage` 는 마운트만으로 7요청** — 적재 설정/이력, 통계, 인식 품질,
  목록, cron 미리보기 등. 테스트는 기본 핸들러를 전부 깔아야 하고(`onUnhandledRequest:
  'error'`), 새 섹션이 요청을 더하면 테스트 기본 핸들러도 같이. SSE 는 가짜 `EventSource` 로.
- **(2026-08-22, 24차) `AdminRoutes` 안 2차 lazy 는 자체 `<Suspense>` 필수** — `food` 라우트만
  `SectionFallback` 으로 감싼다. 감싸지 않으면 App 최상위 Suspense 까지 올라가 어드민 셸
  전체가 스피너로 바뀐다.
- **(2026-08-17, 24차) 어드민 맛집 검색은 `page` 를 같이 리셋** — `updateParams({ q, page: null })`.
  q 만 바꾸면 3페이지에서 검색해 빈 결과가 나온다. 정렬 키는 유지.
- **(2026-08-17, 24차) 배치 머지 정렬은 서버 비교자 그대로** — 머지 뒤 `.sort(compareReviewRecencyDesc)`
  를 빼면 배치 경계에서 최신 리뷰가 아래로 간다. 어댑터 "수집 순 = 최신순" 가정은 더 이상
  유효하지 않다(`0d72380` 이 고친 누락의 원인 — [crawl](crawl.md)).
- **(2026-08-23, 24차) 401 콜백은 `requestToken` 을 받는다** — `configureApi.onUnauthorized` 시그니처가
  `(requestToken) => void`. 인자를 무시하고 무조건 `clearSession` 하면 계정 전환 직후 이전
  계정의 늦은 401 이 새 세션을 지운다(수정 전 동작). 반드시 `handleUnauthorizedForCurrentSession`
  경유.
- **(2026-08-21, 24차) `MyLocationButton` `timeout` 은 `unavailable` 과 다르다** — 훅이 1회 재시도까지
  한 뒤의 상태라 버튼은 살려 두고 문구만 "다시 시도". 두 상태를 합치면 17차의 "unavailable 통째
  비활성" 회귀가 되살아난다.
- **이전 라운드 함정들 유지** — sticky containing block trap, `overflow-y:auto`
  안 sticky 동작, 모바일 body 스크롤 + `100dvh`, 한글 IME 미완성 조합, Pretendard
  CDN 의존, ImgWithFallback src 변경 reset, OL apiKey 변경만 재생성, Lightbox
  글로벌 keydown, Radix Dialog 안 OL, SSE `?token` 쿼리 인증, AdminDiningcodePage
  선택 자동 초기화, DC-only canonical 행 클릭 불활성, MergeProposalQueue "전체
  다시 돌리기" 큐 비우지 않음, sticky 액션바 z-index, MAX_BULK=50, 자동 발견
  groupIndex<0 분기, 영수증 미리보기 = JWT 필요 → `<img src>` 직접 X, 그 외
  이전 라운드 다수.

## Sources [coverage: high — 191 sources]

- [apps/web/src/components/PublicTopBar.test.tsx](../../apps/web/src/components/PublicTopBar.test.tsx) — *new 24차(`a062e7d`): 상단바 3건 — 로그아웃 구조·ADMIN 계정 메뉴 열기/ESC/바깥 클릭·USER 관리자 항목 없음*
- [apps/web/src/components/PublicSidebar.test.tsx](../../apps/web/src/components/PublicSidebar.test.tsx) — *new 24차(`a062e7d`): 드로어 3건 — 하단 계정 블록(로그인 링크/이메일·내 정산·관리자·로그아웃·테마)·항목 클릭 시 onClose*
- [apps/web/src/components/AccountMenu.tsx](../../apps/web/src/components/AccountMenu.tsx) — *new 24차(`a062e7d`): 상단바 계정 디스클로저(md+) — 이메일(xl+)·내 정산·관리자·로그아웃, 바깥 클릭/ESC 닫힘, 헤드리스 라이브러리 없음*
- [apps/web/src/components/weather/MyLocationChip.tsx](../../apps/web/src/components/weather/MyLocationChip.tsx) — *new 24차(`9e197d3`·`a062e7d`): 저장한 내 위치의 날씨·대기 통합 알약(링크 둘 → /weather·/air), 폭별 단계 노출, 자료 없는 세그먼트 탈락; 파생값은 shared useMyLocationGlance*
- [apps/web/src/components/weather/MyLocationChip.test.tsx](../../apps/web/src/components/weather/MyLocationChip.test.tsx) — *new 24차: 4건 — 저장 없음 null·두 링크 href/격자/limit=1·우산/실황 없음/측정소 없음·측정값 없음 "-" 미표시*
- [apps/web/src/components/sheet/useMapSheets.ts](../../apps/web/src/components/sheet/useMapSheets.ts) — *new 24차(`e84e4b9`): 목록/상세 시트 스냅 조율 훅(렌더 중 파생) + SHEET_PEEK_HEIGHT 120/SHEET_HALF_RATIO 0.55/sheetHalfInset*
- [apps/web/src/lib/useMediaQuery.ts](../../apps/web/src/lib/useMediaQuery.ts) — *new 24차(`e84e4b9`): useSyncExternalStore 미디어쿼리 + useIsDesktopXl(80rem, jsdom 폴백 데스크톱)*
- [apps/web/src/routes/AirQualityPage.tsx](../../apps/web/src/routes/AirQualityPage.tsx) — *new 24차(`7340743`·`c6ac640`·`a4284aa`): /air 예시 페이지 — 섹션 ①~⑧, URL sido/station/term/code, 저장 위치 → 가장 가까운 측정소 기본*
- [apps/web/src/routes/WeatherPage.tsx](../../apps/web/src/routes/WeatherPage.tsx) — *new 24차(`37e0db0`·`7704f8c`·`17f281a`): /weather 예시 페이지 — 섹션 ①~⑦, 지점 해석(p/ll/저장 위치/서울), 내 위치 저장/해제, AWS 보강, 대기 프리미티브 재사용*
- [apps/web/src/routes/WeatherPage.test.tsx](../../apps/web/src/routes/WeatherPage.test.tsx) — *new 24차: 6건 — 기본 지점 한 화면·시도→지점 2단·?ll= 가장 가까운 지점·저장 위치 기본 진입·저장/바로가기·503 안내 (ResizeObserver 스텁)*
- [apps/web/src/routes/LifeMapPage.tsx](../../apps/web/src/routes/LifeMapPage.tsx) — *new 24차(`1d92acb`·`a21de10`·`e84e4b9`·`4fd6e22`): /life-map — OL 한 장 + 패널/시트, URL ll/z/sel, useIsDesktopXl JS 분기, 뷰포트 250ms 디바운스, 주변 반경 화장실1000/CCTV500/병의원1000·15건*
- [apps/web/src/routes/LifeMapPage.test.tsx](../../apps/web/src/routes/LifeMapPage.test.tsx) — *new 24차: 8건 — 데스크톱 5 + matchMedia 목 모바일 시트 3 (MapCanvas vi.mock, 뷰포트 안 올려 points 요청 없음)*
- [apps/web/src/routes/meal/MealPage.tsx](../../apps/web/src/routes/meal/MealPage.tsx) — *new 24차(`233c5a9`→`fd371d9`): /me/meals 조회 전용 5탭(기록 무한목록·달력·통계 div 막대·추천·설정)*
- [apps/web/src/routes/meal/MealPage.test.tsx](../../apps/web/src/routes/meal/MealPage.test.tsx) — *new 24차: 11건 — 탭별 요청 계약·opaque cursor·썸네일 인증 fetch·추천 force/피드백·설정 PUT/프리셋*
- [apps/web/src/routes/meal/MealRecommendTab.tsx](../../apps/web/src/routes/meal/MealRecommendTab.tsx) — *new 24차(`2e41e63`·`acb3206`·`1837f25`): 다음 끼니 추천 — 추천받기/다시 추천(force), 👍👎, shown 이벤트 platform web, 파는 곳 찾기, 날씨 연동*
- [apps/web/src/routes/meal/MealPreferenceTab.tsx](../../apps/web/src/routes/meal/MealPreferenceTab.tsx) — *new 24차: 가중치 7축 슬라이더·프리셋·제외/알레르기/선호·끼니·식사 유형 + 내보내기·전체 삭제*
- [apps/web/src/routes/meal/MealPhotoImg.tsx](../../apps/web/src/routes/meal/MealPhotoImg.tsx) — *new 24차: JWT 사진 → useMealPhotoUrl blob objectURL(<img src> 직접 불가)*
- [apps/web/src/stores/lifeMapPrefsStore.ts](../../apps/web/src/stores/lifeMapPrefsStore.ts) — *new 24차(`1d92acb`·`4fd6e22`): 레이어·CCTV 목적·화장실 편의·병의원 종별 취향 persist `lp:life-map-prefs` v2(migrate)*
- [apps/web/src/stores/lifeMapRecentStore.ts](../../apps/web/src/stores/lifeMapRecentStore.ts) — *new 24차(`a21de10`): 최근 본 위치 8개 persist `lp:life-map-recent`*
- [apps/web/src/components/air/AirPrimitives.tsx](../../apps/web/src/components/air/AirPrimitives.tsx) — *new 24차: AirSection(오퍼레이션 eyebrow)·AirStateBlock·AirStaleNote — 날씨 페이지도 재사용*
- [apps/web/src/components/air/AirStationHero.tsx](../../apps/web/src/components/air/AirStationHero.tsx) — *new 24차: 선택 측정소 통합지수 히어로 + 6항목 타일*
- [apps/web/src/components/air/AirHourStrip.tsx](../../apps/web/src/components/air/AirHourStrip.tsx) — *new 24차: 24시간 등급 띠*
- [apps/web/src/components/air/AirHistoryChart.tsx](../../apps/web/src/components/air/AirHistoryChart.tsx) — *new 24차: 인라인 SVG 시계열(단일 축, 호버/키보드/표)*
- [apps/web/src/components/air/AirSidoTable.tsx](../../apps/web/src/components/air/AirSidoTable.tsx) — *new 24차: 시도 측정소 현황 타일·필터·정렬 표*
- [apps/web/src/components/air/AirSidoCompare.tsx](../../apps/web/src/components/air/AirSidoCompare.tsx) — *new 24차: 전국 시도 평균 가로 막대*
- [apps/web/src/components/air/AirBadStations.tsx](../../apps/web/src/components/air/AirBadStations.tsx) — *new 24차: 나쁨 이상 측정소 시도별 칩*
- [apps/web/src/components/air/AirForecastSection.tsx](../../apps/web/src/components/air/AirForecastSection.tsx) — *new 24차: 예보통보 19권역 그리드 + 원문 + 모델 이미지*
- [apps/web/src/components/air/AirWeeklySection.tsx](../../apps/web/src/components/air/AirWeeklySection.tsx) — *new 24차: 주간예보 D+3~D+6 그리드*
- [apps/web/src/components/air/AirStationsMap.tsx](../../apps/web/src/components/air/AirStationsMap.tsx) — *new 24차(`c6ac640`): 전국 측정소 MapCanvas 지도 — 등급색 마커 10종 모듈 레벨, 내 위치/저장 위치 overlayMarkers*
- [apps/web/src/components/air/AirNearbySection.tsx](../../apps/web/src/components/air/AirNearbySection.tsx) — *new 24차(`c6ac640`·`a4284aa`·`aa3a09e`): 측정소 지도·내 주변·검색(250ms)·내 위치 저장(station/geolocation), 인증 30 안내 분기*
- [apps/web/src/components/air/AirNearbySection.test.tsx](../../apps/web/src/components/air/AirNearbySection.test.tsx) — *new 24차(`638a572`): 6건 — 검색 선택 콜백·내 주변 목록·선택 측정소 저장·위치 미지원 안내·503(인증 30)/502 분기*
- [apps/web/src/components/air/AirLegend.tsx](../../apps/web/src/components/air/AirLegend.tsx) — *new 24차: CAI 등급표 + 공공누리 출처*
- [apps/web/src/components/air/airGrade.ts](../../apps/web/src/components/air/airGrade.ts) — *new 24차: 등급 색 스타일 + todayKst 등 @repo/utils 재수출*
- [apps/web/src/components/air/airOptions.ts](../../apps/web/src/components/air/airOptions.ts) — *new 24차: 차트 항목·예보 탭 상수(react-refresh 경계)*
- [apps/web/src/components/weather/WeatherNowHero.tsx](../../apps/web/src/components/weather/WeatherNowHero.tsx) — *new 24차(`17f281a` AWS 줄): 실황 히어로 + 6시간 띠*
- [apps/web/src/components/weather/WeatherMeteogram.tsx](../../apps/web/src/components/weather/WeatherMeteogram.tsx) — *new 24차: 3일 메테오그램(아이콘/기온 선/강수 막대 소형 다중)*
- [apps/web/src/components/weather/WeatherDailyStrip.tsx](../../apps/web/src/components/weather/WeatherDailyStrip.tsx) — *new 24차: 열흘(단기 일별 + 중기 병합) 공통 기온 축*
- [apps/web/src/components/weather/WeatherSeaSection.tsx](../../apps/web/src/components/weather/WeatherSeaSection.tsx) — *new 24차: 해역 선택 + 날씨·파고 표*
- [apps/web/src/components/weather/WeatherVersions.tsx](../../apps/web/src/components/weather/WeatherVersions.tsx) — *new 24차: 발표분 base + getFcstVersion 생성 시각*
- [apps/web/src/components/weather/WeatherLegend.tsx](../../apps/web/src/components/weather/WeatherLegend.tsx) — *new 24차: SKY/PTY 코드표·category·출처*
- [apps/web/src/components/weather/WeatherPrimitives.tsx](../../apps/web/src/components/weather/WeatherPrimitives.tsx) — *new 24차: 기상청 stale/폴백 띠 + Segmented(섹션·상태 블록은 air 프리미티브)*
- [apps/web/src/components/weather/weatherIcons.tsx](../../apps/web/src/components/weather/weatherIcons.tsx) — *new 24차: 하늘+강수 → lucide 아이콘 표(낮/밤)*
- [apps/web/src/components/weather/weatherFormat.ts](../../apps/web/src/components/weather/weatherFormat.ts) — *new 24차: 발표 시각 포맷·업스트림 문구 재수출(utils/shared 승격) + 폭 측정 훅*
- [apps/web/src/components/weather/weatherDaily.ts](../../apps/web/src/components/weather/weatherDaily.ts) — *new 24차: 열흘 병합 @repo/shared 승격 재수출*
- [apps/web/src/components/life-map/LifeMapView.tsx](../../apps/web/src/components/life-map/LifeMapView.tsx) — *new 24차: MapCanvas 한 장에 점/셀/핀 + 오버레이 + MyLocationButton + 키 게이트·힌트*
- [apps/web/src/components/life-map/lifeMapMarkers.ts](../../apps/web/src/components/life-map/lifeMapMarkers.ts) — *new 24차: 점/셀 → MapMarker(fixedScale), 아이콘 모듈 레벨·셀 버블 건수 메모*
- [apps/web/src/components/life-map/LifeGoToBox.tsx](../../apps/web/src/components/life-map/LifeGoToBox.tsx) — *new 24차(`a21de10`): 지역 이동 옴니박스 — 저장/최근/시도·시군구 로컬, 행정구역·지하철역·버스정류장·VWorld 주소 검색, variant panel/bar*
- [apps/web/src/components/life-map/LifeLayerBar.tsx](../../apps/web/src/components/life-map/LifeLayerBar.tsx) — *new 24차: 레이어 토글 + 필터 칩, section all/layers/filters*
- [apps/web/src/components/life-map/LifeNearbyList.tsx](../../apps/web/src/components/life-map/LifeNearbyList.tsx) — *new 24차: 주변 목록 탭 + filters 슬롯(peek 머리 행/half 필터 행)*
- [apps/web/src/components/life-map/LifeDetailCard.tsx](../../apps/web/src/components/life-map/LifeDetailCard.tsx) — *new 24차: 화장실/CCTV/병의원 상세 + ← 목록*
- [apps/web/src/components/life-map/LifeMapFooter.tsx](../../apps/web/src/components/life-map/LifeMapFooter.tsx) — *new 24차: 범례·적재 상태·출처(localdata·심평원·VWorld 지오코더)*
- [apps/web/src/components/life-map/lifeMapFormat.ts](../../apps/web/src/components/life-map/lifeMapFormat.ts) — *new 24차: 개방시간 라벨 @repo/utils 재수출*
- [apps/web/src/routes/admin/AdminFoodPage.tsx](../../apps/web/src/routes/admin/AdminFoodPage.tsx) — *new 24차(`d53fbe3`·`31c56f7`): /admin/food — 적재 잡(cron 프리셋·소스·지금 실행·SSE 진행)·통계·병합 충돌·인식 품질·카탈로그 표/인라인 편집/수기 등록(1,795줄, 어드민 청크 안 2차 lazy)*
- [apps/web/src/routes/admin/AdminFoodPage.test.tsx](../../apps/web/src/routes/admin/AdminFoodPage.test.tsx) — *new 24차: 7건 — 한 화면 렌더·충돌 해결 PATCH·검색/필터/정렬 쿼리·지금 실행 오버라이드·SSE 진행·인라인 편집 diff·수기 등록 409 (sonner 목, 가짜 EventSource)*
- [apps/web/src/routes/SubwayPage.tsx](../../apps/web/src/routes/SubwayPage.tsx) — *new 2026-07-07: 수도권 전철 페이지(URL q/stn/lineId/near); modified 24차(`e84e4b9`): 모바일을 시트 패턴으로(subBar 탭+검색행, fixed 지도, 목록/상세 시트, useMapSheets)*
- [apps/web/src/components/subway/SubwayStationList.tsx](../../apps/web/src/components/subway/SubwayStationList.tsx) — *modified 24차(`e84e4b9`): '일부만 표시' 를 건수 행 인라인으로*
- [apps/web/src/components/subway/SubwayStationsMap.tsx](../../apps/web/src/components/subway/SubwayStationsMap.tsx) — *modified 24차(`e84e4b9`): 열차 따라가기 배지 bottom 에 `--map-bottom-inset`*
- [apps/web/src/test/setup.ts](../../apps/web/src/test/setup.ts) — *22차: jest-dom matchers 를 expect.extend 로 직접 확장(서브패스 인스턴스 함정 회피)*
- [apps/web/src/test/msw.ts](../../apps/web/src/test/msw.ts) — *22차: 공용 MSW server — 기본 핸들러 없음 + onUnhandledRequest 'error'*
- [apps/web/src/test/useMapResearch.test.ts](../../apps/web/src/test/useMapResearch.test.ts) — *22차: 지도 재검색 타이밍 계약 5건*
- [apps/web/src/routes/vote/VoteNewPage.test.tsx](../../apps/web/src/routes/vote/VoteNewPage.test.tsx) — *22차: 7건*
- [apps/web/src/routes/vote/VotePage.test.tsx](../../apps/web/src/routes/vote/VotePage.test.tsx) — *22차: 9건*
- [apps/web/src/routes/vote/VoteResultView.test.tsx](../../apps/web/src/routes/vote/VoteResultView.test.tsx) — *22차: 4건*
- [apps/web/src/components/restaurant/SmartPickSection.test.tsx](../../apps/web/src/components/restaurant/SmartPickSection.test.tsx) — *22차: 내 주변 게이트 4건*
- [docs/mobile-public-restaurant-ux-v2.md](../../docs/mobile-public-restaurant-ux-v2.md) — *맛집 v2 시트 UX 설계 문서; modified 24차: 파일 표에 `sheet/` 승격·useMapSheets 반영*
- [apps/web/src/routes/BusPage.tsx](../../apps/web/src/routes/BusPage.tsx) — *new 19차: 서울시 버스 정류장 페이지 (검색/주변/도착/노선추적/즐겨찾기 — URL state, lazy); modified 24차(`e84e4b9`): 모바일을 시트 패턴으로(subBar 탭+검색행, fixed 지도 `--map-bottom-inset`, 목록/상세 시트, useMapSheets initialListSnap half)*
- [apps/web/src/components/bus/BusStationList.tsx](../../apps/web/src/components/bus/BusStationList.tsx) — *new 19차: 제출형 검색바(SearchBar) + 상태 분기 본체(ListBody) + 정류장 행(거리/arsId 배지, 즐겨찾기 별); modified 24차(`e84e4b9`): '일부만 표시' 를 건수 행 인라인으로(subBar 높이 절약)*
- [apps/web/src/components/bus/BusStationsMap.tsx](../../apps/web/src/components/bus/BusStationsMap.tsx) — *new 19차: 정류장/경유지/내위치 마커 + 실시간 차량 레이어(형상 via 보간·화살표·따라가기) + 자동 재조회 (MapCanvas 위); modified 22차: 인라인 재검색 파이프라인(~50줄)을 `@repo/shared` useMapResearch 호출로 교체(`df9fcbd`); modified 24차(`e84e4b9`): 따라가기 배지 bottom 에 `--map-bottom-inset`*
- [apps/web/src/components/bus/BusArrivalPanel.tsx](../../apps/web/src/components/bus/BusArrivalPanel.tsx) — *new 19차: 선택 정류장 실시간 도착정보 + 노선정보 카드 + 노선 추적/즐겨찾기 토글*
- ~~apps/web/src/components/bus/BusFavoriteSection.tsx~~ — *new 19차: 초기 화면 즐겨찾는 정류장/버스 섹션 → 2026-07-07 13차(`6a3e337`) 통합 즐겨찾기로 대체·삭제*
- [apps/web/src/components/transit/TransitFavoritesSection.tsx](../../apps/web/src/components/transit/TransitFavoritesSection.tsx) — *new 2026-07-07(13차): 버스·지하철 통합 즐겨찾기 홈(양 탭 공용, 펼침 시 도착 미리보기) — 도메인은 [transit](transit.md)*
- [apps/web/src/components/bus/BusFavoriteStar.tsx](../../apps/web/src/components/bus/BusFavoriteStar.tsx) — *new 19차: 즐겨찾기 토글 별(행 버튼의 형제, stopPropagation)*
- [apps/web/src/components/restaurant/detail/AskTab.tsx](../../apps/web/src/components/restaurant/detail/AskTab.tsx) — *new 18차: 공개 리뷰 RAG 질문 탭 (useReviewQaReady + useReviewAskStore + 추천 칩 + 확신도·인용)*
- [apps/web/src/components/restaurant/detail/ClusterTopics.tsx](../../apps/web/src/components/restaurant/detail/ClusterTopics.tsx) — *new 18차: 리뷰 군집 토픽 + 관점별 폴백 (tone 색 라벨·크기 막대)*
- [apps/web/src/components/restaurant/detail/ModelPickerPopup.tsx](../../apps/web/src/components/restaurant/detail/ModelPickerPopup.tsx) — *new 18차: 계열별 모델 선택 portal 팝업 (단건 재요약·AI키 공용)*
- [apps/web/src/components/ResummarizeToaster.tsx](../../apps/web/src/components/ResummarizeToaster.tsx) — *new 18차: App 상주 단건 재요약 완료 토스트 watcher (sentiment 델타)*
- [apps/web/src/components/ReviewAskToaster.tsx](../../apps/web/src/components/ReviewAskToaster.tsx) — *new 18차: App 상주 질문 답변 완료 토스트 + '더보기'=Ask 탭 복귀 (seq 중복 차단)*
- [apps/web/src/routes/admin/AdminReviewSearchPage.tsx](../../apps/web/src/routes/admin/AdminReviewSearchPage.tsx) — *new 18차: 리뷰 문맥검색/RAG 운영 (enrich+군집+질문) / 19차: 전부-노이즈=관점집계(sky) 표기 수정*
- [apps/web/src/routes/admin/AdminLogsPage.tsx](../../apps/web/src/routes/admin/AdminLogsPage.tsx) — *new 18차: 작업 로그 통합 (feature·status 필터 + Pager, useOperationRuns); modified 24차: FEATURE_LABEL 에 food-import·meal-recognition·meal-recommendation*
- [apps/web/src/routes/admin/AdminLogRunDetailPage.tsx](../../apps/web/src/routes/admin/AdminLogRunDetailPage.tsx) — *new 18차: run 상세 + 무한 스텝 로그 + useAnalyzeRun*
- [apps/web/src/routes/admin/AdminLogSettingsPage.tsx](../../apps/web/src/routes/admin/AdminLogSettingsPage.tsx) — *new 18차: 로그 보존기간(1~365) 설정*
- [apps/web/src/routes/admin/AdminTablingPage.tsx](../../apps/web/src/routes/admin/AdminTablingPage.tsx) — *new 18차: 테이블링 정식 크롤 (다이닝코드 동형 — 검색+일괄저장+등록+단건)*
- [apps/web/src/routes/admin/AdminTablingTestPage.tsx](../../apps/web/src/routes/admin/AdminTablingTestPage.tsx) — *new 18차: 테이블링 테스트 페이지*
- [apps/web/src/routes/admin/AdminTelegramPage.tsx](../../apps/web/src/routes/admin/AdminTelegramPage.tsx) — *new 18차: 설정>텔레그램 봇 토큰·chat-id (source db/env/none)*
- [apps/web/src/routes/admin/AdminAiUsagePage.tsx](../../apps/web/src/routes/admin/AdminAiUsagePage.tsx) — *new 18차: LLM 사용량 상세 (useLlmTelemetry SSE, 패널과 캐시 공유)*
- [apps/web/src/components/admin/LlmUsagePanel.tsx](../../apps/web/src/components/admin/LlmUsagePanel.tsx) — *new 18차: 어드민 전역 floating 사용량 패널 (pill/코너 localStorage 영속)*
- [apps/web/src/components/admin/RegionStatsPanel.tsx](../../apps/web/src/components/admin/RegionStatsPanel.tsx) — *new 18차: 지역 통계 위젯 (막대/표/지도 토글 + 시도 드릴다운, useRegionStats)*
- [apps/web/src/components/admin/RegionStatsMap.tsx](../../apps/web/src/components/admin/RegionStatsMap.tsx) — *new 18차: OL 직접 — bubble/markers/choropleth, point-in-polygon, public GeoJSON 지연 fetch*
- [apps/web/public/sigungu-geo.json](../../apps/web/public/sigungu-geo.json) — *new 18차: 시군구 경계 GeoJSON (~560KB, choropleth 지연 fetch)*
- [apps/web/scripts/build-sigungu-geo.mjs](../../apps/web/scripts/build-sigungu-geo.mjs) — *new 18차: KOSTAT 2018 경계 → mapshaper 단순화 → sigungu-geo.json 생성*
- [apps/web/src/routes/admin/RandomCrawlSection.tsx](../../apps/web/src/routes/admin/RandomCrawlSection.tsx) — *new 18차: 자동 발굴 스케줄러 (AdminAnalyticsPage 내, cron+지역 cascade+텔레그램)*
- [apps/web/src/components/restaurant/detail/tabs.ts](../../apps/web/src/components/restaurant/detail/tabs.ts) — *modified 18차: ask(질문) 탭 추가 — 7탭*
- [apps/web/src/components/restaurant/detail/InsightsTab.tsx](../../apps/web/src/components/restaurant/detail/InsightsTab.tsx) — *modified 18차: ClusterTopics 임베드 (useRestaurantClusters) / 17차: CategoryTree + 메뉴/팁 클릭 버튼 필터 + 카드 테두리 제거*
- [apps/web/src/routes/RestaurantDetailRoute.tsx](../../apps/web/src/routes/RestaurantDetailRoute.tsx) — *modified 18차: /r/:placeId 공유 라우트 분기 (useMatch, 닫기 경로)*
- [apps/web/src/stores/theme.ts](../../apps/web/src/stores/theme.ts) — *17차: lp:theme localStorage 테마 스토어 (MapCanvas 가 구독)*
- [apps/web/src/components/restaurant/MapLayerControl.tsx](../../apps/web/src/components/restaurant/MapLayerControl.tsx) — *new 17차: 좌하단 일반/다크(midnight)/위성 레이어 토글; modified 24차(`e84e4b9`): bottom 에 `var(--map-bottom-inset, 0px)` — peek 시트 위로*
- [apps/web/src/components/restaurant/MyLocationButton.tsx](../../apps/web/src/components/restaurant/MyLocationButton.tsx) — *new 17차: "내 위치" 공용 버튼 (공개+어드민 발견), denied/insecure callout; modified 24차(`67f14cf`): timeout 상태 "다시 시도" 문구 — 일상지도 LifeMapView 도 사용*
- [apps/web/src/components/restaurant/detail/CategoryTree.tsx](../../apps/web/src/components/restaurant/detail/CategoryTree.tsx) — *new 17차: 식당별 메뉴 카테고리 트리*
- [apps/web/package.json](../../apps/web/package.json) — *modified: lint 스크립트 + eslint ^10 + vite ^8 + ol ^10.9*
- [apps/web/index.html](../../apps/web/index.html)
- [apps/web/vite.config.ts](../../apps/web/vite.config.ts) — *modified: Vite8/Rolldown codeSplitting.groups + /share/settlements OG 프록시*
- [apps/web/tsconfig.json](../../apps/web/tsconfig.json)
- [apps/web/.env.example](../../apps/web/.env.example)
- [apps/web/eslint.config.mjs](../../apps/web/eslint.config.mjs) — *new: @repo/config/eslint/react flat config + React Compiler 룰 warn*
- [apps/web/src/main.tsx](../../apps/web/src/main.tsx) — *modified 24차(`9f39d53`·`fd371d9`): onUnauthorized(requestToken) → handleUnauthorizedForCurrentSession — 현재 세션 401 만 cancelQueries+clear+식단 principal null+clearSession*
- [apps/web/src/App.tsx](../../apps/web/src/App.tsx) — *modified 24차: /air·/weather·/life-map 공개 + /me/meals(RequireUser) lazy 라우트(`7340743`·`37e0db0`·`1d92acb`·`233c5a9`) / 19차: /bus 라우트(BusPage React.lazy) / 18차: 토스터 3개(sonner+Resummarize+ReviewAsk) App 상주 + /r/:placeId 라우트 + 라우트 React.lazy + /s/:token*
- [apps/web/src/routes/admin/AdminRoutes.tsx](../../apps/web/src/routes/admin/AdminRoutes.tsx) — *modified 24차(`d53fbe3`): `food` 라우트 — 어드민 청크 안 2차 lazy + SectionFallback / 18차: ai-usage/logs/review-search/tabling 라우트 + settings 텔레그램·로그 탭 추가 (단일 lazy 청크)*
- [apps/web/src/components/Lightbox.tsx](../../apps/web/src/components/Lightbox.tsx) — *new (승격): detail/Lightbox.tsx 에서 정산·상세 공용으로 이동 — createPortal(body) + backdrop 닫기*
- [apps/web/src/routes/HomePage.tsx](../../apps/web/src/routes/HomePage.tsx) — *modified: 랭킹 행 → Link /restaurants-v2/:placeId*
- [apps/web/src/routes/LoginPage.tsx](../../apps/web/src/routes/LoginPage.tsx) — *modified 24차(`fd371d9`): 게스트 진입 전 setMealDraftPrincipal(null) 대기*
- [apps/web/src/routes/RestaurantsPage.tsx](../../apps/web/src/routes/RestaurantsPage.tsx) — *modified 17차: 카드 더블클릭=확대(flyToZoomIn) + Outlet Suspense + useCallback perf*
- [apps/web/src/routes/RestaurantsV2Page.tsx](../../apps/web/src/routes/RestaurantsV2Page.tsx) — *modified 24차(`e84e4b9`): 시트 스냅 조율을 useMapSheets 로 교체(로컬 ref/effect 제거) + `--map-bottom-inset`·SHEET_PEEK_HEIGHT / 18차: /r 공유 라우트 부모 겸용(isShareRoute — 리스트 숨김, 지도+상세) / 17차: 카드 더블클릭=확대 + Outlet Suspense*
- [docs/mobile-public-restaurant-ux.md](../../docs/mobile-public-restaurant-ux.md)
- [apps/web/src/routes/admin/AdminHomePage.tsx](../../apps/web/src/routes/admin/AdminHomePage.tsx) — *modified 18차: RegionStatsPanel 위젯 추가*
- [apps/web/src/routes/admin/AdminCrawlTestPage.tsx](../../apps/web/src/routes/admin/AdminCrawlTestPage.tsx) — *modified: visitor_batch setQueryData 머지(상세 re-GET 제거); 24차(`0d72380`): 머지 뒤 compareReviewRecencyDesc 정렬*
- [apps/web/src/routes/admin/AdminRestaurantsPage.tsx](../../apps/web/src/routes/admin/AdminRestaurantsPage.tsx) — *modified 24차(`5e25cc0`): 통합 검색 `?q=`(role=search 폼, draft {urlQuery,value} 렌더 중 파생, page 리셋) / 17차: soft tonal variant 적용*
- [apps/web/src/routes/admin/AdminRestaurantDetailPage.tsx](../../apps/web/src/routes/admin/AdminRestaurantDetailPage.tsx) — *modified 24차(`0d72380`): 리뷰 정렬 visitedAt-desc 기본(compareReviewRecencyDesc)·fetchedAt-desc, fetchedAt-asc·로컬 visitedSortKey 제거 / 17차: soft tonal variant 적용*
- [apps/web/src/routes/admin/AdminAnalyticsPage.tsx](../../apps/web/src/routes/admin/AdminAnalyticsPage.tsx) — *modified 18차: RandomCrawlSection(자동 발굴 스케줄러) 추가 / 17차: ScheduleSection + tonal variant + 카테고리 트리 기본 접힘*
- [apps/web/src/routes/admin/AdminAiKeysPage.tsx](../../apps/web/src/routes/admin/AdminAiKeysPage.tsx) — *modified 24차(`cc8399a`): 용도 5종 — meal-photo(gemma4:31b)·meal-recommend(gpt-oss:120b) 행 추가, PURPOSE_META Record 강제*
- [apps/web/src/routes/admin/AdminAiTestPage.tsx](../../apps/web/src/routes/admin/AdminAiTestPage.tsx)
- [apps/web/src/routes/admin/AdminMapKeysPage.tsx](../../apps/web/src/routes/admin/AdminMapKeysPage.tsx)
- [apps/web/src/routes/admin/AdminDiscoverPage.tsx](../../apps/web/src/routes/admin/AdminDiscoverPage.tsx) — *modified 17차: 카드 클릭=이동/더블클릭=확대 + MyLocationButton*
- [apps/web/src/routes/admin/AdminAutoDiscoverPage.tsx](../../apps/web/src/routes/admin/AdminAutoDiscoverPage.tsx)
- [apps/web/src/components/admin/auto-discover/AutoDiscoverForm.tsx](../../apps/web/src/components/admin/auto-discover/AutoDiscoverForm.tsx)
- [apps/web/src/components/admin/auto-discover/AutoDiscoverJobCard.tsx](../../apps/web/src/components/admin/auto-discover/AutoDiscoverJobCard.tsx)
- [apps/web/src/routes/admin/AdminCatchtableTestPage.tsx](../../apps/web/src/routes/admin/AdminCatchtableTestPage.tsx)
- [apps/web/src/routes/admin/AdminCatchtableShopPage.tsx](../../apps/web/src/routes/admin/AdminCatchtableShopPage.tsx)
- [apps/web/src/routes/admin/AdminDiningcodePage.tsx](../../apps/web/src/routes/admin/AdminDiningcodePage.tsx) — *modified: ResultCard memo + toggleOne useCallback*
- [apps/web/src/routes/admin/AdminDiningcodeShopPage.tsx](../../apps/web/src/routes/admin/AdminDiningcodeShopPage.tsx) — *modified: 다이닝코드 메뉴 Rules of Hooks fix*
- [apps/web/src/routes/admin/AdminDiningcodeTestPage.tsx](../../apps/web/src/routes/admin/AdminDiningcodeTestPage.tsx)
- [apps/web/src/components/admin/discover/DiscoverMap.tsx](../../apps/web/src/components/admin/discover/DiscoverMap.tsx) — *modified 17차: MyLocationButton + flyToZoomIn 더블클릭 확대*
- [apps/web/src/components/admin/discover/DiscoverPanel.tsx](../../apps/web/src/components/admin/discover/DiscoverPanel.tsx) — *modified 17차: 카드 onZoom 전달*
- [apps/web/src/stores/panelPrefsStore.ts](../../apps/web/src/stores/panelPrefsStore.ts)
- [apps/web/src/stores/settlementPrefsStore.ts](../../apps/web/src/stores/settlementPrefsStore.ts)
- [apps/web/src/components/PublicLayout.tsx](../../apps/web/src/components/PublicLayout.tsx) — *modified: perf 소폭*
- [apps/web/src/components/PublicTopBar.tsx](../../apps/web/src/components/PublicTopBar.tsx) — *modified 24차(`7340743`→`a062e7d`): 폭 예산 주석·NAV 7(일상지도·날씨·대기질·식단 requiresAuth)·날씨→대기질 순서(`69ed65f`)·MyLocationChip·AccountMenu, 테마·계정 md+ 만 / 19차: 버스 네비 항목 추가(/bus)*
- [apps/web/src/components/PublicSidebar.tsx](../../apps/web/src/components/PublicSidebar.tsx) — *modified 24차(`a062e7d`): lg:hidden 드로어 + 하단 계정·테마 블록(md:hidden), NAV 스크롤 분리, NAV 7 / 19차: 버스 네비 항목 추가(Bus 아이콘, /bus)*
- [apps/web/src/components/ImgWithFallback.tsx](../../apps/web/src/components/ImgWithFallback.tsx)
- [apps/web/src/components/admin/AdminLayout.tsx](../../apps/web/src/components/admin/AdminLayout.tsx) — *modified 24차(`d53fbe3`): '음식 카탈로그'(Soup) leaf / 18차: 테스트 아코디언 그룹 + 신규 leaf(AI 사용량/리뷰 문맥검색/테이블링/로그) + LlmUsagePanel 상주*
- [apps/web/src/components/admin/AdminTopBar.tsx](../../apps/web/src/components/admin/AdminTopBar.tsx) — *modified: ai-usage 타이틀 룰*
- [apps/web/src/routes/admin/AdminSettingsPage.tsx](../../apps/web/src/routes/admin/AdminSettingsPage.tsx) — *modified 18차: 텔레그램·로그 탭 추가 (AI키/지도/텔레그램/로그 4탭)*
- [apps/web/src/components/restaurant/ActiveJobPanel.tsx](../../apps/web/src/components/restaurant/ActiveJobPanel.tsx) — *modified 24차(`0d72380`): 배치 머지 뒤 compareReviewRecencyDesc 정렬*
- [apps/web/src/components/restaurant/sections.tsx](../../apps/web/src/components/restaurant/sections.tsx) — *modified: perf 소폭*
- [apps/web/src/components/restaurant/MenuRankingSection.tsx](../../apps/web/src/components/restaurant/MenuRankingSection.tsx)
- [apps/web/src/components/restaurant/MapCanvas.tsx](../../apps/web/src/components/restaurant/MapCanvas.tsx) — *modified 24차: flyTo/flyToZoomIn `{ bottomInset }`(`e84e4b9`) + MapMarker.fixedScale·마커 Style 캐시 6000(`1d92acb`) / 19차: MapMarker.icon(data URL 직접) + VehicleMarker 전용 레이어(버스 차량 형상 via 보간·방향 화살표·따라가기) / 17차: 테마 구독 레이어 전환(Base/midnight/satellite) + setUrl 교체 + flyToZoomIn + 라벨 반전*
- [apps/web/src/components/restaurant/VWorldMap.tsx](../../apps/web/src/components/restaurant/VWorldMap.tsx)
- [apps/web/src/components/restaurant/PublicRestaurantList.tsx](../../apps/web/src/components/restaurant/PublicRestaurantList.tsx) — *modified 17차: onZoomItem 전달(더블클릭 확대) + 안정 콜백(카드 memo 용)*
- [apps/web/src/components/restaurant/PublicRestaurantCard.tsx](../../apps/web/src/components/restaurant/PublicRestaurantCard.tsx) — *modified 17차: onZoom 더블클릭 확대 + memo(호버 시 80카드 리렌더 차단)*
- [apps/web/src/components/restaurant/PublicRestaurantsMap.tsx](../../apps/web/src/components/restaurant/PublicRestaurantsMap.tsx) — *modified 17차: MyLocationButton 추출 사용 + flyToZoomIn*
- [apps/web/src/components/restaurant/CanonicalMergePanel.tsx](../../apps/web/src/components/restaurant/CanonicalMergePanel.tsx) — *modified 17차: soft tonal variant*
- [apps/web/src/components/restaurant/MergeProposalQueue.tsx](../../apps/web/src/components/restaurant/MergeProposalQueue.tsx) — *modified 17차: soft tonal variant*
- [apps/web/src/components/restaurant/ReanalyzeFailedBadge.tsx](../../apps/web/src/components/restaurant/ReanalyzeFailedBadge.tsx)
- [apps/web/src/components/restaurant/detail/PublicRestaurantDetail.tsx](../../apps/web/src/components/restaurant/detail/PublicRestaurantDetail.tsx) — *modified 18차: ask 탭 → AskTab(restaurantName 전달) / 17차: tipFilter/menuFilter state*
- [apps/web/src/components/restaurant/detail/HomeTab.tsx](../../apps/web/src/components/restaurant/detail/HomeTab.tsx) — *modified 24차(`0d72380`): reviewsFirstPage 가 방문일 최신순이라는 주석 정정 / 19차: 미리보기 '대표메뉴' 그룹 우선(menuGroups) / 17차: onSelectTip/onSelectMenu + 카드 테두리 제거(divide-y)*
- [apps/web/src/components/restaurant/detail/MenuTab.tsx](../../apps/web/src/components/restaurant/detail/MenuTab.tsx) — *modified 19차: menuGroups 그룹 섹션별 렌더(그룹수·개수 헤더, 없으면 평면 폴백) / 17차: onSelectMenu 클릭 필터*
- [apps/web/src/components/restaurant/detail/ReviewsTab.tsx](../../apps/web/src/components/restaurant/detail/ReviewsTab.tsx) — *modified 18차: 단건 재요약 ModelPickerPopup + useResummarizeReview(admin, ResummarizeToaster 가 watch) / 17차: tip/menu 필터*
- [apps/web/src/components/restaurant/detail/PhotosTab.tsx](../../apps/web/src/components/restaurant/detail/PhotosTab.tsx) — *modified: import ~/components/Lightbox*
- ~~apps/web/src/components/restaurant/detail/Lightbox.tsx~~ — *삭제 (→ apps/web/src/components/Lightbox.tsx 로 승격)*
- [apps/web/src/components/restaurant/detail/InfoTab.tsx](../../apps/web/src/components/restaurant/detail/InfoTab.tsx) — *modified 17차: 블로그 리뷰 카드 테두리 제거(divide-y)*
- [apps/web/src/components/restaurant/detail/shared.tsx](../../apps/web/src/components/restaurant/detail/shared.tsx) — *modified 17차: AiSummary 팁 클릭 + 메뉴 썸네일 라이트박스 + import ~/components/Lightbox*
- [apps/web/src/components/sheet/BottomSheet.tsx](../../apps/web/src/components/sheet/BottomSheet.tsx) — *moved 24차(`e84e4b9`, R100): `restaurant-v2/BottomSheet.tsx` → `sheet/` — dual-mode 3-snap 시트, 맛집 v2·버스·지하철·일상지도 공용*
- [apps/web/src/components/ui/button.tsx](../../apps/web/src/components/ui/button.tsx) — *modified 17차: soft tonal 6색 variant*
- [apps/web/src/components/ui/card.tsx](../../apps/web/src/components/ui/card.tsx)
- [apps/web/src/components/ui/input.tsx](../../apps/web/src/components/ui/input.tsx)
- [apps/web/src/components/ui/table.tsx](../../apps/web/src/components/ui/table.tsx)
- [apps/web/src/components/ui/badge.tsx](../../apps/web/src/components/ui/badge.tsx) — *modified 17차: soft tonal 6색 variant*
- [apps/web/src/components/ui/pager.tsx](../../apps/web/src/components/ui/pager.tsx)
- [apps/web/src/components/ui/confirm-dialog.tsx](../../apps/web/src/components/ui/confirm-dialog.tsx)
- [apps/web/src/lib/utils.ts](../../apps/web/src/lib/utils.ts)
- ~~apps/web/src/lib/vworld.ts~~ — *2026-05-14(`3e3e545`) [packages/utils/src/vworld.ts](../../packages/utils/src/vworld.ts) 로 이동(`buildVworldTileUrl` 등 — [utils](utils.md)/[map](map.md))*
- [apps/web/src/styles/global.css](../../apps/web/src/styles/global.css)
- [apps/web/src/styles/tailwind.css](../../apps/web/src/styles/tailwind.css) — *modified 24차(`7340743`·`37e0db0`): --air-series-1/2·--weather-temp/precip 차트 계열색(라이트/다크 쌍) / 17차: --tonal-* 토큰(라이트/다크 한 쌍) + @custom-variant dark*
- [apps/web/src/components/ThemeToggle.tsx](../../apps/web/src/components/ThemeToggle.tsx) — *useThemeStore 소비(html.dark 토글) — 이번 라운드 다크 모드 진입점*
- [apps/web/src/routes/settlement/SettlementNewPage.tsx](../../apps/web/src/routes/settlement/SettlementNewPage.tsx)
- [apps/web/src/routes/settlement/Step1Participants.tsx](../../apps/web/src/routes/settlement/Step1Participants.tsx)
- [apps/web/src/routes/settlement/Step2Rounds.tsx](../../apps/web/src/routes/settlement/Step2Rounds.tsx)
- [apps/web/src/routes/settlement/Step3Edit.tsx](../../apps/web/src/routes/settlement/Step3Edit.tsx)
- [apps/web/src/routes/settlement/Step4Review.tsx](../../apps/web/src/routes/settlement/Step4Review.tsx)
- [apps/web/src/routes/settlement/SettlementResultPage.tsx](../../apps/web/src/routes/settlement/SettlementResultPage.tsx)
- [apps/web/src/routes/settlement/SettlementHistoryPage.tsx](../../apps/web/src/routes/settlement/SettlementHistoryPage.tsx)
- [apps/web/src/routes/settlement/SharedSettlementPage.tsx](../../apps/web/src/routes/settlement/SharedSettlementPage.tsx)
- [apps/web/src/routes/settlement/ContactsPage.tsx](../../apps/web/src/routes/settlement/ContactsPage.tsx)
- [apps/web/src/routes/settlement/ContactEditDialog.tsx](../../apps/web/src/routes/settlement/ContactEditDialog.tsx)
- [apps/web/src/routes/settlement/ContactPickerDialog.tsx](../../apps/web/src/routes/settlement/ContactPickerDialog.tsx)
- [apps/web/src/routes/settlement/ContactSuggestions.tsx](../../apps/web/src/routes/settlement/ContactSuggestions.tsx)
- [apps/web/src/routes/settlement/RestaurantSearchDialog.tsx](../../apps/web/src/routes/settlement/RestaurantSearchDialog.tsx)
- [apps/web/src/routes/settlement/MenuPickerDialog.tsx](../../apps/web/src/routes/settlement/MenuPickerDialog.tsx)
- [apps/web/src/routes/settlement/MultiReceiptSplitDialog.tsx](../../apps/web/src/routes/settlement/MultiReceiptSplitDialog.tsx)
- [apps/web/src/routes/settlement/RoundDiscountEditor.tsx](../../apps/web/src/routes/settlement/RoundDiscountEditor.tsx)
- [apps/web/src/routes/settlement/RoundExceptionsEditor.tsx](../../apps/web/src/routes/settlement/RoundExceptionsEditor.tsx)
- [apps/web/src/routes/settlement/RoundCategoryAdjuster.tsx](../../apps/web/src/routes/settlement/RoundCategoryAdjuster.tsx)
- [apps/web/src/routes/settlement/SettlementBreakdownTable.tsx](../../apps/web/src/routes/settlement/SettlementBreakdownTable.tsx)
- [apps/web/src/routes/settlement/SettlementShareDialog.tsx](../../apps/web/src/routes/settlement/SettlementShareDialog.tsx)
- [apps/web/src/routes/settlement/SettlementCards.tsx](../../apps/web/src/routes/settlement/SettlementCards.tsx)
