---
topic: transit
type: codebase
last_compiled: 2026-10-26
sources_count: 62
status: active
aliases: [upstream-guard, lib/upstream-guard, DailyQuota, UpstreamCooldown, PerClientDailyBudget, UPSTREAM_REQUEST_BUDGET_MS, UPSTREAM_MIN_RETRY_WINDOW_MS, COOLDOWN_BASE_MS, SERVICE_BLOCK_BASE_MS, retryAfterSec, seoulDateKey, 공통-업스트림-가드, 서비스별-쿼터-버킷, 실패-쿨다운, 쿨다운-기준-시각, IP-하루-미스-예산, 요청-시간-예산, 한-벌-마운트, single-mount, DESKTOP_SUBBAR, EMPTY_STATIONS, followStation, followGroup, listHidden-favorites, polling-false, useDebounced, MAP_POOL_MAX, BusPage.test, SubwayPage.test, 좌표-없는-식당-주차, transit, 대중교통, 버스-지하철-통합, 통합-레이어, TransitTabs, TransitFavoritesSection, CrossSearchSection, SubwayCrossSection, BusCrossSection, TransitCrossToggleChip, transitMapViewport, transitFavExpandStore, transitCrossShowStore, 통합-즐겨찾기, 통합-주변, 통합-검색, 크로스-검색, cross-search, 겸표시, overlay-marker, overlayMarkers, onOverlaySelect, x-subway, x-bus, marker-prefix, poolKey, transit-desktop, transit-mobile, map-instance-pool, 지도-인스턴스-풀, viewport-carryover, 뷰포트-이어보기, A안, D안, dual-mount, 이중-마운트, 데스크톱-모바일-동시마운트, submittedQ, 제출-게이트, quota-proportional, 쿼터-비례, deep-link-symmetry, 딥링크-대칭, SubwayNearbyBusSection, 주변-버스-정류장, 13차, 14차, 15차, 집중-모드, retry-pause, be-무변경, sheet-pattern, 시트-골격, 모바일-시트, 맛집-v2-시트, BottomSheet, useMapSheets, SHEET_PEEK_HEIGHT, listSnap, detailSnap, subBar, setSubBar, usePublicLayout, map-bottom-inset, useIsDesktopXl, useMediaQuery, enableDynamicSizing, SNAP_POINTS, TransitMapView, transitMapBridge, transitMapHtml, markerIcons, fixedScale, useAlightAlert, TransitFloatingHeader, setNotificationHandler, 가는-법, 가는법-탭, TransitTab, 주차, 주차-섹션, parking, /parking, ParkingNearbySection, ParkingSummaryLine, PARKING_RESTAURANT_RADIUS_M, useParkingLotNearby, useRestaurantParkingReviews, parking-reviews, availableTabs, 사이드바-주차, fitToCoords, belowInset, fitToCoords-belowInset, TransitMapView-등산-재사용]
---

# transit — 버스↔지하철 통합 레이어(웹 대중교통 화면 골격 + 앱 대중교통 화면 연결)

**2026-10-10~10-26 변경 흡수 — 대중교통 기능 자체는 무변경, 앱 WebView 지도 `TransitMapView` 에 옵션 하나(작업 트리, 커밋 전)**: 앱 등산 화면([app/hiking](../../apps/mobile/app/hiking/index.tsx))이 대중교통이 만든 WebView 지도를 그대로 재사용하면서 `fitToCoords(coords, padding, { belowInset })` 를 더했다 — `belowInset` 이면 [transitMapHtml.ts](../../apps/mobile/src/components/transit/transitMapHtml.ts) 가 `view.fit` 아래 패딩에 마지막 `setViewInset` 높이(바텀시트가 덮는 만큼)를 더해 영역을 시트 위 보이는 곳에 맞춘다([transitMapBridge.ts](../../apps/mobile/src/components/transit/transitMapBridge.ts) 명령 타입·[useTransitMapSync.ts](../../apps/mobile/src/components/transit/useTransitMapSync.ts) 핸들 타입·native/web 호스트 각 한 줄). 옵션이 없으면 종전과 같아 앱 대중교통의 근처 빠른 선택 `fitToCoords(quickMapCoords, 72)` 는 그대로다. 브리지·소비처 구조는 [mobile](mobile.md) 의 WebView 지도 브리지 절.

**2026-10-05~10-10 변경 흡수 — 웹 대중교통 두 페이지를 한 벌만 마운트하고 보이지 않는 폴링을 끄다(`086e4510`) + 실시간 외부 API 공통 가드 `lib/upstream-guard`(`fd957320`) + 좌표 없는 식당 가는 법 탭 주차 평가(`008e0081`)**: (1) **한 벌 마운트** — [BusPage](../../apps/web/src/routes/BusPage.tsx)·[SubwayPage](../../apps/web/src/routes/SubwayPage.tsx)가 CSS 이중 마운트(`hidden xl:flex` / `xl:hidden`)를 버리고 [useIsDesktopXl](../../apps/web/src/lib/useMediaQuery.ts) JS 분기로 지도(OL 인스턴스·차량/열차 tween)·패널(지하철 1초 카운트다운 tick)·시트를 한 벌만 마운트한다(일상지도·집값·주차와 같은 패턴). 지도 `<section>` 은 두 분기에서 같은 자리(둘째 자식)라 폭이 xl 경계를 넘어도 OL 인스턴스·따라가기 상태가 남는다. 바텀시트는 모바일에서만 마운트돼 데스크톱의 숨은 시트가 걸던 `html overflow` 락이 사라졌다. 데스크톱 subBar 는 내용 없는 자리표시 `DESKTOP_SUBBAR`(`<span hidden />`) — `null` 로 두면 상단바 구분선이 일상지도·집값처럼 1px 얇아져서 종전 모양을 지키려고 남겼다. `poolKey` 는 여전히 `transit-desktop`/`transit-mobile` 로 나누지만 이유가 "동시 마운트 두 인스턴스가 한 map 을 다툼" 에서 "탭 전환 때 같은 레이아웃끼리 이어받기" 로 바뀌었다. (2) **헛요청·마커 재생성 축소** — `near` 를 원문 문자열 키로 `useMemo`, 빈 결과를 모듈 상수(`EMPTY_STATIONS`·`EMPTY_NEAR_STATIONS`·`EMPTY_VEHICLES`, 지하철 `EMPTY_GROUPS`, shared 즐겨찾기 훅의 `EMPTY_*`)로 고정해 도착 30초·위치 15초 폴링 리렌더마다 마커 배열이 새로 만들어지고 `fitToMarkers` 가 재발화해 지도가 끌려가던 것을 끊었다. 두 지도 래퍼의 마커 memo 의존도 `selectedStId`/`selectedId` 에서 "따라가기 대상"(`followStation`/`followGroup`)으로 좁혔다 — 선택 강조는 MapCanvas 가 feature 2개만 다시 칠한다([map](map.md) `eb24c6e5` 차분 동기화). 통합 즐겨찾기 섹션은 모바일 목록 시트가 상세 시트 뒤에 숨은 동안 만들지 않는다(`favoritesSection = hasFavorites && (isDesktop || !listHidden)` — 펼쳐 둔 행의 도착 미리보기가 안 보이는 곳에서 30초 폴링하던 것), 지하철 도착 폴링은 시간표·길찾기 뷰에서 쉰다(`useSubwayStationArrivals(stn, { polling })`, 돌아오면 즉시 1회 재조회), 지하철 라이브 검색은 `useDeferredValue` → 200ms [useDebounced](../../apps/web/src/lib/useDebounced.ts). 테스트 [BusPage.test](../../apps/web/src/routes/BusPage.test.tsx) 6건·[SubwayPage.test](../../apps/web/src/routes/SubwayPage.test.tsx) 7건(한 벌 마운트·도착 쿼리 구독자 1·폴링 휴지·디바운스·리렌더 뒤 fit 재발화 없음). (3) **BE 공통 가드** — 버스·지하철·대기·날씨(+AWS)·바다 프록시가 새 [lib/upstream-guard.ts](../../apps/friendly/src/lib/upstream-guard.ts)의 일일 쿼터 버킷(서비스·오퍼레이션별, 재시도 포함)·실패 쿨다운(키 30초→5분, 인증·한도는 서비스 전체 5분→1시간)·IP 하루 미스 예산(지하철)·요청 시간 예산 8초를 쓴다. 6개 토픽 중 **가드 구조 설명은 이 문서 Architecture 의 "실시간 외부 API 공통 가드" 절이 본거지**이고, 도메인별 배분·입력 화이트리스트·수치는 [bus](bus.md)·[subway](subway.md)·[air-quality](air-quality.md)·[weather](weather.md)·[sea](sea.md), 라이브러리 소유는 [friendly](friendly.md)(컨셉 [quota-proportional-loading](../concepts/quota-proportional-loading.md) 의 "2026-10 확장 — 5번째 층"). 통합 레이어에 주는 의미는 "쿼터 비례 원칙"의 BE 쪽 안전망이다 — 크로스 검색·옴니박스가 버스 검색 몫을 다 태워도 도착(510)·위치(240) 버킷은 남는다. 대중교통 계약 변화는 지하철 429(IP 예산)·쿨다운 503 문구, 버스 검색·노선 상세의 분당 60 프리셋뿐(URL·컴포넌트 계약 무변경). (4) **`008e0081`(2026-10-10)** — 좌표 없는 식당도 '가는 법' 탭이 리뷰 주차 평가·팁·다이닝코드 시설을 보여 줘 아래 Gotchas 의 "홈 요약 → 빈 탭" 어긋남이 풀렸다.

**2026-09-24~09-26 변경 흡수 — 식당 '가는 법' 탭에 주차 섹션, 사이드바 '주차' 메뉴가 대중교통 바로 다음에(`2ff2c31`, 2026-09-25)**: 대중교통 레이어 자체(BusPage/SubwayPage·통합 컴포넌트·스토어·지도 풀)는 무변경. (1) 식당 상세 '가는 법' 탭([TransitTab](../../apps/web/src/components/restaurant/detail/TransitTab.tsx))이 버스(500m)·지하철(1.5km) 섹션 아래에 세 번째 섹션 [ParkingNearbySection](../../apps/web/src/components/restaurant/detail/ParkingSection.tsx)을 단다 — 리뷰 요약의 '주차' 관점 긍·부정·중립 건수와 '주차'가 든 팁 상위 5개(canonical 전 출처의 `status='done'` 요약 집계, [parking.service.ts](../../apps/friendly/src/modules/parking/parking.service.ts) `getRestaurantReviews`), 다이닝코드 시설에 '주차'가 있으면 한 줄, 반경 300m(`PARKING_RESTAURANT_RADIUS_M`) 주차장 5곳(실시간 혼잡 단계 색 점·여석·요금 규칙). 행을 누르면 `/parking?ll=&z=17&sel=<id>`, 헤더 '주차 페이지에서 보기'는 `sel` 없이. 홈 탭 '영업 정보' 끝에 한 줄 요약 `ParkingSummaryLine`(같은 조회 키라 RQ 캐시 공유) — 누르면 '가는 법' 탭으로 전환. `420a6be`(2026-09-26)에서 [HomeTab](../../apps/web/src/components/restaurant/detail/HomeTab.tsx)에 선택 prop `availableTabs` 가 생겨, '가는 법' 탭이 없는 어드민 상세에선 이 줄이 누를 수 없는 정보 줄로 그려진다(공개 상세는 그대로). (2) [PublicSidebar](../../apps/web/src/components/PublicSidebar.tsx)·[PublicTopBar](../../apps/web/src/components/PublicTopBar.tsx) NAV 에 `{ to: '/parking', label: '주차' }` 가 '대중교통' 바로 다음에 들어갔다 — '대중교통'의 `match: ['/bus', '/subway']` 는 그대로다(주차는 대중교통의 서브탭이 아니라 독립 메뉴, [PLAN-parking](../../docs/PLAN-parking.md) 결정 "일상지도 레이어가 아니라 별도 메뉴"). [ParkingPage](../../apps/web/src/routes/ParkingPage.tsx)는 대중교통의 CSS 이중 마운트가 아니라 일상지도·집값과 같은 `useIsDesktopXl` JS 분기(지도 한 장) + `useMapSheets` 시트 골격을 쓴다. 도메인 세부는 [parking](parking.md). 대중교통 BE·계약 변경 0 — `bus.route.ts`·`subway.route.ts`·두 즐겨찾기 라우트는 한국어 `summary`/`description` 만 붙었다(`1b621c4`, 동작 무변경 → [api-docs](api-docs.md)).

**2026-08-17~08-30 변경 흡수 — 웹 모바일 레이아웃을 맛집 v2 시트 골격으로 통일(`e84e4b9`) + 앱 시트·브리지 소폭 변경(`fdb6ab9`·`e348032`·`563890a`·`9f39d53`)**: (1) **웹(`e84e4b9`, 2026-08-22)** — [BusPage](../../apps/web/src/routes/BusPage.tsx)·[SubwayPage](../../apps/web/src/routes/SubwayPage.tsx)의 모바일(=웹 xl 미만) 블록이 "검색바 고정 / 지도 / 리스트 38dvh 세로 적층"에서 **맛집 v2 와 같은 지도+바텀시트 골격**으로 바뀌었다: 탭+검색행은 상단바 `subBar`(`usePublicLayout().setSubBar`, `useLayoutEffect` 등록/해제, `xl:hidden` 래퍼라 데스크톱 헤더 높이 불변)로 올라가고 정류장/역 선택 중엔 검색행을 접어 헤더를 215→98px 로 회수, 지도는 `fixed inset-x-0 bottom-0`(`top: headerHeight`) 배경, 목록은 3-snap [BottomSheet](../../apps/web/src/components/sheet/BottomSheet.tsx)(`zIndex 20`), 정류장(`stId`)/역(`stn`)이 잡히면 도착·시간표·길찾기 패널이 상세 시트(`zIndex 25`, `key=stId|stn`)로 얹힌다. 두 시트의 스냅 조율은 신규 [useMapSheets](../../apps/web/src/components/sheet/useMapSheets.ts) — `useMapSheets(stId !== null, { initialListSnap })`, 검색어(버스 ≥2자·지하철 ≥1자)나 주변 모드로 진입하면 `half`, 아니면 `peek`; 검색 제출·내 주변·재검색 뒤 `peek` 이면 `half` 로 승격. 지도 하단 컨트롤(따라가기 pill·레이어 토글)은 `--map-bottom-inset`(=`SHEET_PEEK_HEIGHT` 120px) 만큼 올라와 peek 시트에 안 가린다. **데스크톱 블록·CSS 이중 마운트·`poolKey` 분리는 무변경**(루트 높이만 `xl:` 한정 — 모바일은 auto 라 시트 full 에서 body 스크롤로 주소창 minify). `BottomSheet` 자체는 `restaurant-v2/` 에서 `sheet/` 로 승격된 것(내용 무변경)이고 시트 패턴 상세(dual-mode·스크롤 락)는 [web](web.md) 담당. 같은 커밋의 일상지도는 CSS 이중 마운트 대신 JS 분기([useIsDesktopXl](../../apps/web/src/lib/useMediaQuery.ts))를 택해 지도 한 장만 둔다 — 대중교통은 기존 구조를 유지해 두 방식이 공존한다([life-map](life-map.md)). (2) **앱** — [transit.tsx](../../apps/mobile/app/(tabs)/transit.tsx)의 목록·상세 시트에 `enableDynamicSizing={false}`(`fdb6ab9`, 지도 시트 6개 중 대중교통 몫 2개): gorhom v5 가 콘텐츠 높이 스냅 지점을 끼워 넣어 `SNAP_POINTS ['20%','50%','100%']` 가 4지점이 되고 `animatedIndex` 2 가 full 이 아닌 중간에 걸려 플로팅 헤더 보간(1.5→2)이 엉뚱한 위치에서 끝나던 것을 고정. [transitMapBridge](../../apps/mobile/src/components/transit/transitMapBridge.ts)·[transitMapHtml](../../apps/mobile/src/components/transit/transitMapHtml.ts)·[useTransitMapSync](../../apps/mobile/src/components/transit/useTransitMapSync.ts)에 `BridgeMarker.fixedScale`·`setMarkers.icons`(아이콘 사전, `markerIcons` prop)이 붙었지만(`e348032`) 대중교통 자체 동작은 무변경 — 대기·일상지도 앱 화면이 같은 WebView 지도(`TransitMapView`)를 재사용하기 위한 확장이다(지도 관점은 [map](map.md), 브리지 절 자체는 [mobile](mobile.md) — 이 문서는 링크만). `pointerEvents` prop→`style.pointerEvents` 이관(`563890a`, RN 신 API), [useAlightAlert](../../apps/mobile/src/components/transit/useAlightAlert.ts)의 `Notifications.setNotificationHandler` 는 [app/_layout.tsx](../../apps/mobile/app/_layout.tsx) 루트 1회 설정으로 이동(`9f39d53` — 식사 알림과 공용, `shouldPresentMealReminder` 가 `kind !== 'meal-reminder'` 면 true 라 하차 알림 배너는 그대로). BE·계약 변경 0.

**2026-07-10~25 변경 흡수 — 앱(`apps/mobile`) 대중교통 화면이 웹을 추월**: 이 문서의 본문은 웹 통합 레이어 기준이지만, 7월 중순 이후 앱 대중교통 화면([mobile](mobile.md) 의 transit.tsx + useTransitScreen + WebView 지도)이 대거 확장돼 **앱에만 있는 기능**이 생겼다. 요약(전부 BE·계약 무변경, 상세는 커밋 본문): ① **최근 검색 자동완성(`6867d66`)** — 모드별 검색어 10·선택 장소 20 을 AsyncStorage zustand 로 로컬 저장(NFC 정규화), 선택 장소만 좌표 스냅샷 기록·재선택 시 스냅샷 복원 후 도착만 최신 조회. ② **내 위치 근처 빠른 선택(`48ab6a0`)** — 헤더 근처 액션이 버스 500m·지하철 1.5km 를 한 카드로(각 최대 3), 반대편 정류장 오선택 방지를 위해 자동 선택 없음. ③ **탑승 모드(`481846d`)** — reducer 최상위 pinned 상태로 따라가던 차량이 검색·모드전환·뒤로가기에도 유지(usePinnedVehicle 상시 폴링, 명시 종료/운행 종료만 해제), 차량 탭=즉시 탑승. ④ **탑승 상세(`916d71e`)** — 핀 차량의 실시간 상세 패널(버스: 정차/주행·차량번호판·앞으로 지날 정류장 / 지하철: 현재역·급행/막차·이후 역), locateTrain 의 구간 판정을 resolveTrainSection 으로 분리해 지도 보간과 단일 판정. ⑤ **하차 지점(`ddb2a8e`)** — '앞으로 지나요' 행에서 하차 지정 → 그 역 도착정보에 내 차량(trainNo/vehId)을 조인해 카운트다운, 도착정보 미포착 시 위치 기반 N번째 폴백. ⑥ **하차 알림(`1d2a101`)** — 백그라운드 폴링 중단을 '감지'가 아닌 '예약'으로 우회: 실측(도착정보 잔여초) > 추정(남은 정차 수 × 평균 소요) 2단계 근거로 로컬 알림을 도착 90초 전 예약, 폴링마다 재예약(expo-notifications, CNG prebuild 필요). ⑦ UX 픽스 3건 — Detail 시트 드래그 닫힘 방지(`caf58ec`)·길찾기 키보드 시트 연동(`b0399d0`)·따라가기 칩이 시트에 가리던 것(`5660811`, animatedPosition 앵커 + zIndex 40). ⑧ **실형상 렌더(`a13eadc`)** — [subway](subway.md) 실형상을 앱 지도에서 폴리라인·열차 보간(stationS anchor)으로 소비 + 노선 casing. 웹 쪽 신규는 **식당 상세 "가는 법" 탭(`fa8f067`)** — 주변 정류장 500m·지하철역 1.5km 로컬 조회 즉시 로드 + 행 선택 시만 인라인 도착(섹션당 1개, 30초 폴링), 딥링크 `/bus?near=&stId=`·`/subway?near=&stn=` 재사용([web](web.md)).

버스(`/bus`)와 지하철(`/subway`)이라는 두 완성 도메인을 **하나의 "대중교통" 경험**으로 잇는 **웹 FE 통합 레이어**(+ 위 흡수분처럼 앱 대중교통 화면이 별도로 존재). 새 백엔드·새 라우트·새 테이블이 없다 — 세 축(즐겨찾기·주변·검색)의 크로스와 연속된 지도 경험 전부가 **기존 API·훅의 FE 조합**이다(계약 변경 0). 커밋 히스토리상 지도 연속성(A안 뷰포트 이어보기 `de382a0` → D안 인스턴스 풀 `4128d6b`)이 먼저 깔리고, 그 위에 통합 13차(즐겨찾기 `6a3e337`) → 14차(주변 겸표시 `8a48b49`) → 15차(검색 크로스 `dd1a9fe`)가 쌓였다. 지하철→버스 단방향 연계인 지하철 12차(`79a800b`, [SubwayNearbyBusSection](../../apps/web/src/components/subway/SubwayNearbyBusSection.tsx))가 통합의 딥링크 계약을 처음 확립한 씨앗이다. 계획·사용자 결정 4건은 [PLAN-transit-unified.md](../../docs/PLAN-transit-unified.md). 각 도메인 자체는 [bus](bus.md)·[subway](subway.md), 지도 인프라는 [map](map.md).

## Purpose [coverage: high — 6 sources]

대중교통 레이어가 제공하는 것은 "버스와 지하철을 한 몸처럼 쓰는 느낌"이다. 구체적으로 네 가지가 두 페이지에 대칭으로 얹힌다:

1. **탭 2개 + 연속된 지도** — [TransitTabs](../../apps/web/src/components/transit/TransitTabs.tsx)가 `/bus`·`/subway`를 슬림한 서브탭으로 묶고, 탭 전환 시 지도가 기본 뷰로 리셋되지 않고 **마지막 보던 위치·타일을 그대로 이어**본다(뷰포트 이어보기 + 지도 인스턴스 풀링).
2. **통합 즐겨찾기(13차)** — 양 탭 초기화면 최상단에 버스 정류장 / 정류장×노선 / 지하철 역 / 역×호선 4종을 **한 목록**으로. 항목을 펼치면 그때 도착 미리보기.
3. **통합 주변 겸표시(14차)** — 버스 탭 주변 모드에 지하철역을, 지하철 탭 주변 모드에 정류장을 지도에 함께 표시. 우상단 토글 칩으로 on/off.
4. **통합 검색 크로스(15차)** — 각 탭 검색 결과 하단에 상대 도메인 결과("지하철역 N건"/"정류장 N건") + 상대 탭 딥링크.

이 레이어를 관통하는 **단 하나의 설계 대원칙은 "BE 신규 없음"**이다 — 세 크로스 축 전부가 이미 있는 훅(`useBus*`/`useSubway*`)의 조합이며 서버·계약·DB 를 건드리지 않는다([PLAN "설계 대원칙"](../../docs/PLAN-transit-unified.md)). 두 번째 제약은 상속된 것이다: 버스 도메인의 **서울시 일 1,000건 쿼터**([bus](bus.md) — 2026-10-05 부터 서버가 검색 60·도착 510·위치 240·노선 90 버킷으로 나눠 센다)가 통합 UX 에도 그대로 흘러, "쿼터 소비가 사용자 의도·업스트림 비용에 비례"하도록 각 크로스의 발화 시점이 서로 다르게 조율된다(아래 Key Decisions 절).

별도 홈 탭·신규 라우트를 만들지 않은 것도 의도다 — 통합은 **기존 두 페이지 위에 얹는 섹션·오버레이**로만 존재하고, URL 계약(`q`/`stId`/`stn`/`near`/`routeId`/`line`)은 무변경이다. 이 **웹 통합 레이어**(TransitTabs·크로스·통합 즐겨찾기·겸표시·시트 골격)는 `apps/web` 에만 있다 — 앱(`apps/mobile`)은 별도의 대중교통 화면을 갖되(상단 흡수 문단·[mobile](mobile.md)) 이 컴포넌트를 공유하지 않는다.

## Architecture [coverage: high — 18 sources]

통합은 백엔드 파이프라인이 아니라 **두 페이지 컴포넌트(BusPage/SubwayPage)가 공유하는 FE 조립 규약**이다. 층이 아니라 축으로 이해하는 게 맞다.

```
대중교통 = TransitTabs[ 버스 | 지하철 ]  (NavLink 라우팅 + active prop 강조)
  │
  ├─ /bus     → BusPage      ─┐  각 페이지 = useIsDesktopXl JS 분기로 한 벌만 마운트(2026-10-05~)
  └─ /subway  → SubwayPage   ─┘  데스크톱 = 탭 + 좌패널(400px) + 지도, subBar 는 빈 자리표시
                                 모바일 = subBar(탭+검색행) + fixed 지도 + 목록/상세 BottomSheet
                                          (useMapSheets 가 스냅 조율 — 2026-08-22 맛집 v2 골격)
                                 (~2026-10-05: 두 레이아웃을 CSS 숨김으로 "동시 마운트" — 아래 절)

 ① 연속된 지도 경험 (지도가 리셋되지 않음)
    A안 transitMapViewport  — 모듈 싱글턴 1개(양 탭 공유). moveend 저장 / 마운트 복원
    D안 mapPool (MapCanvas) — poolKey "transit-desktop"·"transit-mobile" 각각 재사용
                              언마운트 시 OL Map 을 파괴 않고 풀 보관 → setTarget 이어받기

 ② 통합 즐겨찾기 (TransitFavoritesSection)  — 양 탭 초기화면 공용, 4종 한 목록
      펼침 상태 = transitFavExpandStore(zustand, 단일 아코디언 — 언마운트 뒤 복원)
      도착 미리보기 = useBus/SubwayStationArrivals (펼친 1행만 enabled)
      모바일 목록 시트가 상세 시트 뒤에 숨은 동안엔 섹션 자체를 만들지 않음(2026-10-05)

 ③ 통합 주변 겸표시 (MapCanvas.overlayMarkers + TransitCrossToggleChip)
      상대 도메인 마커 = 기존 nearby 훅 재사용, id prefix "x-subway:"/"x-bus:"
      토글 = transitCrossShowStore(zustand persist, 양 탭 공유)

 ④ 통합 검색 크로스 (CrossSearchSection: SubwayCrossSection / BusCrossSection)
      상대 도메인 검색 = useSubway/BusStationSearch, 행 클릭 → 상대 탭 딥링크(q+선택)

 상태 배치: 스토어(펼침 — 재마운트 복원 · 겸표시 토글 — 탭 공유) · 페이지 state(submittedQ·시트 스냅) · 풀 키(레이아웃별)
 재료 전부 @repo/shared 기존 훅 — 통합 레이어의 BE·계약·DB 변경 0
   (도메인 서비스 쪽 공통 가드는 friendly lib/upstream-guard — 아래 "실시간 외부 API 공통 가드" 절)
```

### 연속된 지도 경험 — A안 + D안 이중 안전망

탭 전환은 라우트 언마운트라 지도가 매번 재생성돼 두 종류의 리셋이 생긴다: **뷰포트 리셋**(기본 뷰로)과 **타일 재로드 플래시**. 두 문제를 다른 도구로 각각 막고, 서로의 빈틈을 메운다.

- **A안 — 뷰포트 이어보기** ([transitMapViewport.ts](../../apps/web/src/components/transit/transitMapViewport.ts)): 버스·지하철 **공용 모듈 싱글턴 1개**(탭별 분리 아님)에 마지막 중심·줌을 저장. 저장은 각 지도 어댑터의 `moveend`(`onViewportSync`), 복원은 마운트 시 `initialCenter` 로. 새로고침/직접 진입에는 소실(모듈 스코프) — 의도된 동작. 딥링크·선택 flyTo·검색 fit 규칙은 무변경(저장 뷰포트는 '지시 없을 때'의 시작점).
- **D안 — OL 인스턴스 풀** ([MapCanvas.tsx](../../apps/web/src/components/restaurant/MapCanvas.tsx) `mapPool`): `poolKey` 를 준 MapCanvas 는 언마운트 시 OL Map 을 파괴하지 않고 모듈 풀에 보관 → 다음 마운트가 `setTarget` 으로 이어받아 **타일 캐시·뷰포트·레이어 선택을 통째 유지**. A안만으론 못 막던 타일 플래시가 사라진다.

둘은 **보완재**다: 풀이 살아 있으면(SPA 내 탭 왕복) D안이 뷰포트째 잇고, 풀이 빈 상태(새로고침/직접 진입)면 A안 저장값이 `initialCenter` 로 복원한다. `poolKey` 미지정(식당·어드민 지도)은 두 메커니즘 모두 손대지 않아 **공용 컴포넌트 회귀가 원천 차단**된다. **(2026-10-05 `eb24c6e5`)** 풀은 이제 상한 `MAP_POOL_MAX = 3`(가장 오래 안 쓴 것부터 dispose)이고 풀 키를 쓰는 지도가 대중교통 2개 외에 `air`·`sea`·`parking`·일상지도·집값까지 있어, 다른 지도 페이지 서너 곳을 거쳐 돌아오면 대중교통 지도는 새로 만들어진다(A안 저장 뷰포트가 그때 시작점 — [map](map.md)).

### 이중 마운트 → 한 벌 마운트 (2026-10-05 `086e4510`)

~2026-10-05 BusPage/SubwayPage 는 데스크톱(`hidden xl:flex`)과 모바일(`xl:hidden`) 레이아웃을 **CSS 로만 숨겨 항상 둘 다 마운트**했다. 페이지당 지도·섹션·훅이 2 인스턴스씩 살아, 상태 설계가 그 전제를 따랐다 — 네트워크는 RQ dedupe 로 1콜, 로컬 state 는 갈라지므로 공유가 필요한 펼침·겸표시 토글은 zustand 스토어로 승격, 지도 풀은 두 지도가 한 map 을 다투지 않게 `transit-desktop`/`transit-mobile` 로 분리. 비용도 컸다: 지도 OL 인스턴스·차량/열차 tween·지하철 1초 카운트다운 tick 이 두 벌로 돌았고, 데스크톱 폭에서도 숨은 모바일 BottomSheet 가 `html overflow` 락을 걸었다.

2026-10-05 부터 두 페이지는 [useIsDesktopXl](../../apps/web/src/lib/useMediaQuery.ts) **JS 분기로 한 벌만** 그린다(2026-08-22 일상지도가 먼저 택한 방식 — [life-map](life-map.md)). 구조:

- 데스크톱: `{isDesktop && <TransitTabs/>}` + `<aside w-[400px]>`(목록 또는 도착/시간표/길찾기 패널) + 지도 `<section className="relative flex-1">`. subBar 는 `DESKTOP_SUBBAR`(`<span hidden />`) — 내용 없는 자리표시를 등록해야 종전처럼 상단바 아래 구분선이 subBar 래퍼 몫 1px 더 남는다.
- 모바일: subBar(탭+검색행) + 지도 `<section className="fixed inset-x-0 bottom-0 z-0">`(`top: headerHeight`, `--map-bottom-inset`) + `{!isDesktop && <BottomSheet …/>}` 목록·상세 시트.
- 지도 `<section>` 은 두 분기에서 **같은 자리(부모의 둘째 자식)** 라 창 폭이 xl 경계를 넘어도 React 가 같은 엘리먼트로 보고 OL 인스턴스·따라가기 상태를 유지한다(className·style 만 바뀜).
- 스토어는 남았지만 이유가 바뀌었다 — `transitFavExpandStore` 는 섹션이 초기 화면에만 마운트돼 '← 목록'·탭 전환 때마다 다시 서므로 펼침을 **복원**하려고, `transitCrossShowStore` 는 버스↔지하철 **탭 사이 공유**(+persist)를 위해. `useMapSheets` 는 원래부터 페이지 state 다.
- 풀 키는 레이아웃별 그대로(`poolKey={isDesktop ? 'transit-desktop' : 'transit-mobile'}`) — 이제 동시 사용 충돌이 아니라 "탭 전환 때 같은 레이아웃의 지도를 이어받기" 단위다.

### 모바일 시트 골격 (2026-08-22) — 맛집 v2 와 공용

모바일(xl 미만) 블록은 세 층이다. **① 상단바 subBar** — `TransitTabs` + `BusStationSearchBar`/`SubwayStationSearchBar` 를 `usePublicLayout().setSubBar` 로 통합 sticky 헤더에 등록(`useLayoutEffect`, 언마운트 시 `null`). 정류장/역이 선택되면 검색행을 빼 헤더를 215→98px 로 줄인다. `headerHeight` 는 [PublicTopBar](../../apps/web/src/components/PublicTopBar.tsx)가 ResizeObserver 로 실측해 [PublicLayout](../../apps/web/src/components/PublicLayout.tsx) 컨텍스트로 내려주므로 subBar 내용이 바뀌면 시트 `topOffset`·지도 `top` 이 함께 따라온다. **② fixed 지도** — `fixed inset-x-0 bottom-0 z-0`, `top: headerHeight`, `--map-bottom-inset: 120px`. `poolKey="transit-mobile"` 은 그대로. **③ 시트 2장** — 목록 [BottomSheet](../../apps/web/src/components/sheet/BottomSheet.tsx)(`snap=listSnap`, `hidden`/`disableScrollLock = listHidden`, `zIndex 20`, `data-testid="bus-list-sheet"`/`"subway-list-sheet"`) + 선택 시 상세 시트(`key=stId|stn`, `snap=detailSnap`, `zIndex 25`, `data-testid="*-detail-sheet"`). 2026-10-05 부터 두 시트는 `!isDesktop` 일 때만 마운트되고, 목록 시트가 숨은(`listHidden`) 동안엔 그 안의 통합 즐겨찾기 섹션도 만들지 않는다(숨은 시트도 마운트돼 있어 펼친 행의 도착 미리보기가 계속 폴링하던 것). 상세 시트 안에 버스는 `arrivalPanel`(없으면 "선택한 정류장이 현재 결과에 없습니다"/"불러오는 중" + ← 목록 버튼), 지하철은 기존 배타 패널(`panelContent` = 시간표 > 길찾기 > 도착)이 그대로 들어간다.

스냅 규칙은 [useMapSheets](../../apps/web/src/components/sheet/useMapSheets.ts) 한 곳이다: 상세가 열리면(detailOpen false→true) 목록 스냅을 기억하고 `peek`(숨김)으로, 상세는 `half` 로 진입; 닫히면 목록을 기억한 스냅으로 복원. 전이는 setState-during-render 라 상세 시트가 첫 프레임부터 half 다. 대중교통이 더한 규칙 두 가지 — `initialListSnap`(검색어·주변 모드 딥링크 진입이면 `half`, 아니면 지도 먼저 `peek`)과 **행동 뒤 승격**(검색 제출·내 주변·이 위치에서 재검색 핸들러가 `setListSnap(s => s === 'peek' ? 'half' : s)` — 결과가 바로 보이게, 이미 half/full 이면 유지). 지도 하단 컨트롤은 `bottom-[calc(0.75rem+var(--map-bottom-inset,0px))]` 로 시트 위에 뜬다(따라가기 pill 은 각 지도 래퍼, 레이어 토글은 [MapLayerControl](../../apps/web/src/components/restaurant/MapLayerControl.tsx)). `MapCanvas.flyTo` 의 `bottomInset` 옵션은 일상지도만 쓰고 대중교통 래퍼는 아직 안 넘긴다(Gotchas 절).

### 세 크로스 축의 발화 대칭

| 축 | 컴포넌트 | 상대 도메인 조회 | 발화 시점 | 쿼터(서버 버킷, 2026-10-05~) |
|---|---|---|---|---|
| 즐겨찾기(13차) | [TransitFavoritesSection](../../apps/web/src/components/transit/TransitFavoritesSection.tsx) | `useBus/SubwayStationArrivals` | **펼침 시에만**(단일 아코디언, 섹션이 보일 때만 마운트) | 15초 마이크로캐시 미스당 1콜 — 버스 `arrivals` 510 / 지하철 `realtime` 900 + IP 150 |
| 주변(14차) | `overlayMarkers` + [TransitCrossToggleChip](../../apps/web/src/components/transit/TransitCrossToggleChip.tsx) | `useSubway/BusNearbyStations` | 주변 모드 진입 시(토글 off 여도 조회) | 0 — 둘 다 로컬 DB(버스는 2026-07-13 마스터 적재 이후) |
| 검색(15차) | [CrossSearchSection](../../apps/web/src/components/transit/CrossSearchSection.tsx) | `useSubway/BusStationSearch` | 버스탭→지하철 자동 / 지하철탭→버스 **제출 시** | 지하철 0 / 버스 30일 DB 캐시 미스당 1콜 — `search` 60 |

### 실시간 외부 API 공통 가드 — `lib/upstream-guard.ts` (2026-10-05 `fd957320`)

통합 레이어 자체는 BE 를 건드리지 않지만, 그 "쿼터 비례" 설계가 기대는 서버 방어선이 이번 라운드에 공용 라이브러리 하나로 모였다. 버스·지하철·대기·날씨(+API허브 AWS)·바다 서비스가 같은 부품을 쓰므로 구조는 여기 한 곳에 적고, 각 도메인 토픽엔 배분·화이트리스트·수치만 둔다. 계기는 [PLAN-perf-2](../../docs/PLAN-perf-2.md) 6차(E-1·E-2·E-4·E-6·E-7·E-8·E-V2·C-5, 원문 [findings](../../docs/PLAN-perf-2-findings.md) "E — 실시간 외부 API·폴러") — 무인증 수백 회로 공유 일일 쿼터를 태워 전 사용자 실시간을 자정까지 멈출 수 있었고(버스 가짜 노선 id 300회, 대기 가짜 측정소 150회, 지하철 역명 순회 15분), 업스트림 장애 동안 폴링이 매번 재호출해 짧은 장애가 하루치 503 으로 번졌으며(E-V2 시뮬레이션: 버스 10곳 60분 장애 = 시도 900·쿼터 소진), 운영 p95 20~40초는 업스트림 타임아웃을 그대로 기다린 결과였다. [lib/upstream-guard.ts](../../apps/friendly/src/lib/upstream-guard.ts)(149줄) 부품 넷:

| 부품 | 동작 | 상수 |
|---|---|---|
| `DailyQuota<B>` | 버킷(업스트림 서비스·오퍼레이션)별 KST 날짜 카운터. `consume(bucket, now, calls)` 는 `calls` 만큼 **한 번에** 확보하고 초과면 소비 없이 throw(호출측이 stale 폴백), `record` 는 이미 나간 어댑터 재시도를 한도와 무관하게 사후 가산 | 날짜 경계 `seoulDateKey`(`Intl` en-CA Asia/Seoul) |
| `UpstreamCooldown` | 실패한 키는 `retryAt` 까지 업스트림·쿼터 없이 last-known 또는 503. 키 백오프 30초→1→2→4→5분(상한), 성공하면 리셋. 인증·일일한도 오류(`serviceWide`)는 어떤 키로 불러도 같은 답이라 **그 업스트림 서비스 전체**를 5분→10→20→40→60분 차단. 키 기록은 LRU 5,000 | `COOLDOWN_BASE_MS 30s`·`COOLDOWN_MAX_MS 5m`·`SERVICE_BLOCK_BASE_MS 5m`·`SERVICE_BLOCK_MAX_MS 60m`, 안내 문구용 `retryAfterSec` |
| `PerClientDailyBudget` | IP(`clientKey(req)`)별 하루 업스트림 **미스** 예산 — 캐시 히트는 세지 않는다. CORS `*`·IP 분산에는 약한 보조 수단(LRU 10,000 클라이언트) | 지하철만 사용 |
| 요청 시간 예산 | 요청 1건(어댑터 재시도 포함)의 상한. 재시도는 남은 시간이 `700ms + UPSTREAM_MIN_RETRY_WINDOW_MS` 보다 적으면 건너뛴다. 끊긴 요청은 서비스가 stale·쿨다운으로 받는다 | `UPSTREAM_REQUEST_BUDGET_MS 8s`·`UPSTREAM_MIN_RETRY_WINDOW_MS 2s` |

도메인별 적용(쿨다운 단위는 data.go.kr·포털의 **활용신청 단위**와 맞춘다):

| 서비스 | 쿼터 버킷(일) | 쿨다운 서비스 단위 · 서비스 차단 조건 | 입력·캐시 방어 | 시간 예산 |
|---|---|---|---|---|
| [bus](bus.md) | `search 60 · arrivals 510 · positions 240 · route 90`(합 900) | `stationinfo`·`buspos`·`busRouteInfo` · `BusApiAuthError` | '노선 없음' 24h 네거티브 캐시 + 노선 in-flight, 검색·노선 상세 60/분 | 1콜 8초(재시도 없음) |
| [subway](subway.md) | `realtime 900`·`openapi 900`(종전 그대로) + IP `realtime 150 · timetable 40`(429) | `swopen`·`openapi` · `INFO-100` 인증, `ERROR-337` 일일 트래픽 초과 | — | 1콜 8초 |
| [air-quality](air-quality.md) | `realtime 100 · forecast 30 · weekly 30 · stations 30 · history 260`(합 450) | `arpltn`(15073861)·`msrstn`(15073877) · `AirKoreaApiAuthError`(20~33) | 측정소명 화이트리스트(404), 날짜 clamp, 시계열 LRU 300(서빙 형태), 발표 주기 TTL | 8초(남으면 1회 재시도) |
| [weather](weather.md) | `vilage 7,500 · mid 1,500`(합 9,000) | `vilage`·`mid` · `KmaApiAuthError` / AWS `apihub` · `KmaApiHubAuthError` | 중기 구역·지점 화이트리스트(400), 캐시 32MB 바이트 LRU, `app.weather` 단일 인스턴스 | 8초 / API허브 시도당 5초 |
| [sea](sea.md) | `forecast 2,000 · tide 2,000`(신설) | 데이터셋 경로(`KHOA_PATHS[…]`) · 게이트웨이 503(20~33) | 물때 날짜 KST 오늘-2~+10(계약 400), 물때 LRU 3,000 | 페이지당 8초(시도당 5초) |

공통 규율: (a) 쿼터는 캐시 미스가 확정된 뒤 업스트림 직전에만 소비하고, **우리 카운터 소진은 업스트림 실패가 아니라 쿨다운하지 않는다**(`e instanceof <도메인>ApiError` 일 때만 `failure`). (b) 재시도도 업스트림 1콜이라 대기·날씨·바다 어댑터가 `onRetry` 콜백으로 같은 버킷에 `record` 한다(예전엔 카운터 밖이라 실사용이 카운터보다 컸다 — E-8). (c) 어댑터는 호출측이 `signal` 을 주면 자체 타이머·예산을 쓰지 않는다(프로브·라이브 테스트 전용 — 서비스 경로는 `signal` 을 넘기지 않는다). (d) 쿨다운 503 문구는 모두 "…가 응답하지 않아 잠시 조회를 멈췄습니다. N초 뒤 다시 시도해 주세요." 형식이라 외부 문서 [docs/api/README.md](../../docs/api/README.md) 오류 표의 503 예시가 그것이다. 단일 인스턴스 메모리라 재시작하면 카운터가 0 부터다 — 업스트림 실한도보다 여유를 둔 값이라 하루 한두 번 재시작은 흡수된다(파일 머리 주석). 컨셉은 [quota-proportional-loading](../concepts/quota-proportional-loading.md)(이 가드가 "2026-10 확장 — 5번째 층" 으로 흡수됨), 상위 맥락은 [in-memory-singleton-gates](../concepts/in-memory-singleton-gates.md), 대기·날씨 캐시의 바이트 상한은 [bounded-byte-caches](../concepts/bounded-byte-caches.md).

## Talks To [coverage: high — 17 sources]

- **[bus](bus.md) 도메인** — 정류장 검색/주변/도착 훅(`useBusStationSearch`·`useBusNearbyStations`·`useBusStationArrivals`), 즐겨찾기(`useBusFavorites`), 마커 빌더(`buildBusStopMarkerDataUrl`), 딥링크(`/bus?stId=&routeId=&near=`). 통합의 모든 "버스 쪽"이 여기서 온다.
- **[subway](subway.md) 도메인** — 역 검색/주변/도착 훅(`useSubwayStationSearch`·`useSubwayNearbyStations`·`useSubwayStationArrivals`), 즐겨찾기(`useSubwayFavorites`), 마커 빌더(`buildSubwayStationMarkerDataUrl`), 딥링크(`/subway?stn=&near=`). 12차 [SubwayNearbyBusSection](../../apps/web/src/components/subway/SubwayNearbyBusSection.tsx)이 지하철→버스 연계의 원형.
- **[map](map.md) 도메인 (MapCanvas)** — 통합이 MapCanvas 에 **두 확장을 추가**했다: (1) `poolKey` 인스턴스 풀링, (2) `overlayMarkers`/`onOverlaySelect` fit 제외 오버레이 레이어. 두 지도 래퍼([BusStationsMap](../../apps/web/src/components/bus/BusStationsMap.tsx)·[SubwayStationsMap](../../apps/web/src/components/subway/SubwayStationsMap.tsx))가 이 prop 을 페이지에서 받아 넘긴다. 지도 인프라 전반은 [map](map.md).
- **[shared](shared.md) 훅 (재사용, 신규 0)** — 통합은 새 API 클라이언트·훅을 추가하지 않는다. 양 도메인의 기존 훅을 한 페이지에서 함께 호출할 뿐(각 훅은 "페이지당 1회" 규칙 — 로그인 직후 게스트 병합 부수효과 때문. BusPage 가 `useBusFavorites`+`useSubwayFavorites` 를 각 1회).
- **네비게이션** — [PublicSidebar](../../apps/web/src/components/PublicSidebar.tsx)·[PublicTopBar](../../apps/web/src/components/PublicTopBar.tsx)의 "대중교통" 항목이 `to: '/bus'`, `match: ['/bus', '/subway']` — 한 메뉴가 두 라우트를 대표해 어느 탭에 있어도 활성. 2026-09-25(`2ff2c31`)부터 바로 다음 항목이 '주차'(`/parking`, 사이드바 아이콘 `SquareParking`)라 순서가 홈·맛집·대중교통·주차·일상지도·집값·여행·날씨·바다·대기질·타로·사주(C)·사주(G)·식단(14개)이다 — '주차'는 `match` 없이 자기 경로만 활성.
- **식당 상세 '가는 법' 탭 — 대중교통 페이지 밖의 대중교통 훅 소비처(`fa8f067`)이자 [parking](parking.md) 과의 접점** — [TransitTab](../../apps/web/src/components/restaurant/detail/TransitTab.tsx)은 통합 레이어를 쓰지 않고 `useBusNearbyStations`(500m)·`useSubwayNearbyStations`(1.5km)·도착 훅을 직접 호출하며, 딥링크는 `/bus?near=&stId=`·`/subway?near=&stn=`(아래 표). 2026-09-25 세 번째 섹션 [ParkingNearbySection](../../apps/web/src/components/restaurant/detail/ParkingSection.tsx)이 붙었다 — `useRestaurantParkingReviews(placeId)`(staleTime 30분, `retry: false`) + `useParkingLotNearby(lat, lng, { radius: 300, limit: 5 })`(staleTime 2분·5분 `refetchInterval` — 버스·지하철 nearby 가 staleTime 60초·폴링 없음인 것과 달리 실시간 여석 단계를 싣기 때문). 둘 다 로컬 DB·폴러 메모리 조회라 업스트림 0콜이어서 탭 진입 즉시 로드해도 쿼터 비례 원칙(싼 것은 자동)과 맞는다. 홈 탭 한 줄 요약 [HomeTab](../../apps/web/src/components/restaurant/detail/HomeTab.tsx) `ParkingSummaryLine` 이 같은 키로 조회해 캐시를 공유하므로 **상세를 열기만 해도(홈 탭) 주차 조회 2건이 나간다**. 섹션 구성·주차 페이지 세부는 [parking](parking.md), 결정 표는 [PLAN-parking](../../docs/PLAN-parking.md) "맛집: 가는 법 탭 '주차' 섹션 + 홈 탭 한 줄 요약".
- **라우트** — [App.tsx](../../apps/web/src/App.tsx)가 `/bus`·`/subway` 를 PublicLayout 아래 공개 라우트로(비로그인, 맛집과 동일 정책), 각각 `React.lazy` 청크로 분할.
- **zustand 스토어** — [transitFavExpandStore](../../apps/web/src/stores/transitFavExpandStore.ts)(펼침, 비영속)·[transitCrossShowStore](../../apps/web/src/stores/transitCrossShowStore.ts)(겸표시 토글, `localStorage` persist). 도입 때는 이중 마운트 인스턴스 간 공유가 이유였고, 2026-10-05 한 벌 마운트 뒤로는 펼침 = 섹션 재마운트 뒤 복원, 토글 = 탭 사이 공유가 이유다(각 스토어 머리 주석이 같이 바뀌었다).
- **[friendly](friendly.md) 공통 가드(2026-10-05)** — [lib/upstream-guard.ts](../../apps/friendly/src/lib/upstream-guard.ts)(+[upstream-guard.test.ts](../../apps/friendly/src/lib/upstream-guard.test.ts) 5건: 버킷 분리·일부 소비 없음·재시도 가산·KST 리셋 / 키 백오프·서비스 차단 / IP 예산). 통합 레이어가 직접 import 하지는 않고 [bus.service.ts](../../apps/friendly/src/modules/bus/bus.service.ts)·[subway.service.ts](../../apps/friendly/src/modules/subway/subway.service.ts)가 쓴다. 지하철 라우트의 IP 키는 [rate-limit.ts](../../apps/friendly/src/plugins/rate-limit.ts) `clientKey`(레이트리밋과 같은 CF-Connecting-IP 기준).

## API Surface [coverage: high — 12 sources]

통합의 "표면"은 HTTP/zod 가 아니라 **① 도메인 간 딥링크 URL 계약, ② 컴포넌트 props, ③ 공유 스토어, ④ MapCanvas 확장 prop**이다.

**① 도메인 간 딥링크 계약 (통합의 진짜 API):**

| 출발 → 도착 | URL | 도입 |
|---|---|---|
| 지하철 도착패널 → 버스 | `/bus?near={lat,lng}&stId={stId}` | 12차 SubwayNearbyBusSection |
| 버스 겸표시 클릭 → 지하철 | `/subway?near={lat,lng}&stn={stationId}` | 14차(12차 대칭) |
| 지하철 겸표시 클릭 → 버스 | `/bus?near={lat,lng}&stId={stId}` | 14차 |
| 버스 크로스검색 행 → 지하철 | `/subway?q={q}&stn={id}` / 더보기 `/subway?q={q}` | 15차 |
| 지하철 크로스검색 행 → 버스 | `/bus?q={q}&stId={stId}` / 더보기 `/bus?q={q}` | 15차 |
| 통합 즐겨찾기 이동(상대) | `/subway?stn=` · `/bus?stId=[&routeId=]` | 13차 |
| 식당 '가는 법' 버스·지하철 섹션 → 버스/지하철 | `/bus?near={lat,lng}[&stId=]` · `/subway?near={lat,lng}[&stn=]`(선택 행이 있으면 함께) | `fa8f067`(2026-07) |
| 식당 '가는 법' 주차 섹션 → 주차 | 행 `/parking?ll={lat,lng}&z=17&sel={lotId}` · 헤더 버튼 `/parking?ll={lat,lng}&z=17` (좌표는 `roundCoord` 5자리) | `2ff2c31`(2026-09-25) — 대중교통 URL 계약이 아니라 [ParkingPage](../../apps/web/src/routes/ParkingPage.tsx) 계약(`t`·`ll`·`z`·`sel`, [parking](parking.md)) |

원칙: **새 URL 시맨틱을 만들지 않는다.** 자기 도메인 이동은 in-page 핸들러(동일 URL 계약) 재사용, 상대 도메인은 `navigate`. `near` 는 현재 기준점을 그대로 넘겨 상대 탭도 주변 모드로 이어진다.

**② 마커 네임스페이스 prefix:** 겸표시 마커 id 는 `x-subway:{stationId}` / `x-bus:{stId}`. 지도 클릭 핸들러(`handleMarkerSelect`)가 `id.startsWith('x-')` 를 **다른 무시/선택 로직보다 먼저** 가로채 `onOverlaySelect`(상대 탭 딥링크)로 보낸다. 기존 특수 id(`veh-`/`train-`/`my-location`/`path-`/`xfer-`)와 무충돌.

**③ 컴포넌트 props:**

| 컴포넌트 | 핵심 props | 역할 |
|---|---|---|
| `TransitTabs` | `active: 'bus'\|'subway'` | 서브탭(NavLink + active 강조) |
| `TransitFavoritesSection` | `bus: BusFavoritesApi`, `subway: SubwayFavoritesApi`, `onNavigate(TransitFavTarget)` | 4종 통합 즐겨찾기 + 펼침 도착 미리보기 |
| `SubwayCrossSection` / `BusCrossSection` | `q: string` | 확정 검색어로 상대 도메인 크로스 조회 |
| `TransitCrossToggleChip` | `label`, `visible` | 지도 우상단 겸표시 on/off 칩 |
| `SubwayNearbyBusSection` | `lat`, `lng` | 지하철 도착패널 하단 접이식 주변 정류장(12차) |

`TransitFavTarget` 은 4종 판별 유니온(`bus-station`/`bus-route`/`subway-station`/`subway-line`) — 페이지가 kind 로 in-page vs navigate 를 분기.

**④ MapCanvas 확장 prop (`overlayMarkers`/`poolKey`):**

- `overlayMarkers?: MapMarker[]` — 자기 도메인 마커(`markers`) **아래 전용 VectorLayer**. `fitToMarkers` extent 에서 제외(별도 소스)돼 겸표시가 화면을 넓히지 않는다. z순서: 노선(routeLine) → **겸표시(overlay)** → 정류장(marker) → 차량(vehicle). 미지정/빈 배열이면 식당·어드민 지도는 기존 동작 완전 동일.
- `onOverlaySelect?(id)` — 오버레이 마커 클릭 채널(래퍼가 `x-` prefix 감지 시 호출).
- `poolKey?: string` — 지정 시 이 키로 OL Map 을 모듈 풀에 보관/재사용. 마운트 수명 동안 불변으로 간주(deps 제외). 같은 키를 동시에 두 MapCanvas 가 쓰면 안 됨 → 대중교통은 `transit-desktop`/`transit-mobile` 로 분리(2026-10-05 한 벌 마운트 뒤로는 `isDesktop ? … : …` 로 레이아웃에 맞는 키 하나만 넘긴다). 풀 상한 3(`eb24c6e5`).

**⑤ 서버 응답 계약 변화(2026-10-05 `fd957320` — 통합 레이어가 그대로 받아 표시만 하는 것):** 지하철 도착·위치는 IP 하루 미스 150회, 시간표는 40회를 넘으면 **429**(`app.httpErrors.tooManyRequests`, 문구 "오늘 이 네트워크에서 지하철 실시간 정보를 너무 많이 조회했습니다…"), 실패 쿨다운 중 last-known 이 없으면 **503**("…잠시 조회를 멈췄습니다. N초 뒤…"). 버스 `stationSearch`·`routeDetail` 은 `RATE.transitRealtime`(60/분) 프리셋이 새로 걸렸다(그전엔 전역 1000/분). 웹 QueryClient 는 같은 날 `3d294304` 로 4xx 를 재시도하지 않으므로 429 는 곧바로 오류 상태가 된다([web](web.md)).

**공유 스토어 인터페이스:**

```ts
// transitFavExpandStore (비영속 — 소멸성 UI 상태)
{ expandedKey: string | null; toggle(key): void; collapse(): void }   // 단일 아코디언

// transitCrossShowStore (persist 'lp:transit-cross-show' — 사용자 선택)
{ show: boolean; toggle(): void; setShow(v): void }                    // 기본 on

// transitMapViewport (모듈 싱글턴 — persist 아님)
saveTransitViewport(v: {lat,lng,zoom}) / readTransitViewport(): TransitViewport | null
```

## Data [coverage: high — 9 sources]

**통합 레이어는 새 DB 테이블·prisma 스키마·마이그레이션이 0이다** (BE 무변경 원칙). "데이터"는 전부 클라이언트 측 상태와 **재사용되는 기존 캐시**다.

**클라이언트 상태 3계층 (수명별):**

| 저장소 | 대상 | 수명 | 이유 |
|---|---|---|---|
| **localStorage persist** | `transitCrossShowStore`(겸표시 토글) | 재방문 후에도 | 사용자 선택이라 기억(13차 관례 + persist) |
| **모듈 싱글턴/스토어(비영속)** | `transitFavExpandStore`(펼침), `transitMapViewport`(뷰포트), `mapPool`(OL 인스턴스, 상한 3) | 모듈 수명(새로고침 시 소실) | 소멸성 UI/전환 상태 — 새로고침엔 접힘·기본 뷰로 |
| **페이지 state** | `submittedQ`(확정 검색어), `autoNear`(자동 재조회 좌표), `pendingFollow`, `listSnap`/`detailSnap`(useMapSheets, 2026-08-22) 등 | 페이지 마운트 | 페이지가 렌더하는 데스크톱/모바일 분기가 같이 읽는다(도입 땐 이중 마운트 두 자식 공유가 이유), URL 오염 회피(시트 스냅은 URL 에 안 싣는다) |
| **모듈 상수(안정 참조, 2026-10-05)** | `EMPTY_STATIONS`·`EMPTY_NEAR_STATIONS`·`EMPTY_VEHICLES`(BusPage), `EMPTY_GROUPS`(SubwayPage), shared `useBus/SubwayFavorites` 의 `EMPTY_*`, `DESKTOP_SUBBAR` | 모듈 수명 | 빈 결과에 매 렌더 새 `[]` 를 내리면 지도 마커 memo·fit effect 가 폴링 리렌더마다 다시 돈다 |

**재사용 캐시 (통합이 새로 만들지 않음):** 크로스 조회는 전부 기존 캐시에 얹힌다 — 지하철 검색/주변은 **로컬 DB(쿼터 0)**, 버스 검색은 **30일 DB 캐시**(미스는 `search` 버킷 60/일), 버스 주변은 **로컬 정류장 마스터**(2026-07-13 `b0c4f0a` 이후 — 그전엔 0.005° 셀 격자 DB 캐시), 도착은 **15초 서버 마이크로캐시 + in-flight**(버스는 10분 last-known stale, 지하철은 stale 없음). 상세는 [bus](bus.md) 의 Data 절·[subway](subway.md). 같은 `queryKey` 를 여러 컴포넌트가 구독하면 React Query 가 1회로 dedupe 하지만, 2026-10-05 한 벌 마운트 뒤로는 도착 쿼리 구독자 자체가 하나다([SubwayPage.test](../../apps/web/src/routes/SubwayPage.test.tsx) 가 단언).

**즐겨찾기 데이터** 도 통합이 아니라 각 도메인 소유다: `useBusFavorites`/`useSubwayFavorites`(게스트 zustand persist + 로그인 서버 하이브리드). TransitFavoritesSection 은 두 훅의 반환을 **읽어 병합만** 한다 — 4종을 도메인 단위 concat(버스 정류장→노선 → 지하철 역→호선). 각 도메인 목록은 서버가 `createdAt` 오름차순으로 내려주지만 **항목별 `createdAt` 이 계약에 노출되지 않아** 도메인 간 진짜 시간순 인터리브는 불가(Gotchas 절). 두 훅은 서버 목록이 아직 없을 때(로그인 첫 조회 중) 빈 배열을 모듈 상수로 돌려준다(2026-10-05 — [useBusFavorites](../../packages/shared/src/hooks/useBusFavorites.ts)·[useSubwayFavorites](../../packages/shared/src/hooks/useSubwayFavorites.ts)).

## Key Decisions [coverage: high — 15 sources]

- **2026-10-05 레이아웃 분기를 CSS 이중 마운트에서 JS 한 벌 마운트로(`086e4510`)** — 이중 마운트는 "네트워크는 dedupe 되니 안전" 이라는 판단 위에 섰지만, 실제 비용은 네트워크가 아니라 지도 OL 인스턴스·차량/열차 rAF tween·1초 카운트다운 tick·마커 재생성이 두 벌로 도는 것과 데스크톱의 숨은 시트가 거는 스크롤 락이었다. 일상지도·집값·주차가 이미 쓰는 `useIsDesktopXl` 로 맞추고, 지도 `<section>` 을 두 분기에서 같은 트리 위치에 둬 xl 경계를 넘나드는 리사이즈에도 지도가 재생성되지 않게 했다. 데스크톱 subBar 는 `null` 이 아니라 자리표시로 — 상단바 구분선 1px 를 종전과 같게(시각 회귀 0) 지키는 쪽을 택했다.
- **2026-10-05 보이지 않는 곳의 폴링은 마운트·옵션으로 끈다(`086e4510`)** — 숨은 목록 시트의 즐겨찾기 섹션은 렌더하지 않고(펼침은 스토어라 복원), 지하철 도착은 시간표·길찾기 뷰에서 `polling: false`(쿼리는 살아 있어 그 뷰 헤더의 역명·호선은 받아 둔 응답을 읽음). 재개 시 interval 첫 틱(30초)을 기다리지 않고 `refetch({ cancelRefetch: false })` 한 번 — "쉬는 동안 묵은 정보가 30초 더 보이는" 것을 막는 외부 시스템 동기화라 effect 를 썼다(`useEffect` 회피 규율의 예외 근거를 주석에 남김).
- **2026-10-05 실시간 외부 API 방어를 서비스·오퍼레이션 버킷 + 실패 쿨다운으로 — IP 예산은 보조(`fd957320`)** — 레이트리밋(IP 60/분)만으로는 CORS `*`·IP 분산을 못 막고, 카운터 하나를 모든 기능이 나눠 쓰면 가장 싼 남용(검색어·노선 id·측정소명 순회)이 실시간 도착까지 멈춘다. 그래서 (1) 남용한 기능만 멈추도록 버킷을 업스트림 서비스·오퍼레이션별로 쪼개고, (2) 가짜 입력은 화이트리스트·네거티브 캐시·날짜 범위로 업스트림 전에 막고(쿼터 0), (3) 장애 중 재호출은 쿨다운으로 끊는다. 배분 수치는 "서비스별 결정 필요"(PLAN 6차)로 남았던 것을 화면 호출 모형으로 정했다(각 도메인 토픽). 시간 예산 8초는 운영 p95 20~40초(`/air/stations/nearby` 20.0초, `/weather/aws` 40.7초)를 끊고 stale 로 받기 위한 값.

- **2026-09-25: 주차는 대중교통의 서브탭이 아니라 NAV 의 독립 메뉴로, 식당과는 '가는 법' 탭의 섹션으로 잇는다.** 사용자 결정([PLAN-parking](../../docs/PLAN-parking.md) 결정 표 — 위치 "일상지도 레이어가 아니라 별도 메뉴 `/parking`", 맛집 "가는 법 탭 '주차' 섹션 + 홈 탭 한 줄 요약"). 그래서 [TransitTabs](../../apps/web/src/components/transit/TransitTabs.tsx)는 여전히 버스|지하철 두 탭이고, 통합 레이어(탭·스토어·지도 풀·시트)는 한 줄도 바뀌지 않았다(26차 이후 `components/transit/`·BusPage·SubwayPage 커밋 0). NAV 순서만 대중교통 바로 다음(PLAN "사이드바 주차 메뉴(대중교통 다음)") — '이동' 묶음 배치다. '가는 법' 탭은 내용상 "대중교통·차로 가는 법"이 됐지만 탭 키 `transit`·라벨 '가는 법'([tabs.ts](../../apps/web/src/components/restaurant/detail/tabs.ts) `TAB_ORDER`)은 그대로다.

- **2026-08-22: 모바일 레이아웃은 맛집 v2 시트 골격을 그대로 가져온다 — 이중 마운트 전제는 유지.** 공개 지도 페이지 4곳(맛집 v2·버스·지하철·일상지도)이 같은 "상단바 subBar + fixed 지도 + 목록/상세 바텀시트" 를 쓰도록 `BottomSheet` 를 `sheet/` 로 승격하고 목록↔상세 스냅 규칙을 `useMapSheets` 로 뽑아 맛집 v2 도 이 훅으로 교체했다(`e84e4b9`). 대중교통은 기존 CSS 이중 마운트·스토어 승격·풀 키 분리를 손대지 않고 모바일 블록의 내용물만 시트로 바꿨다 — 그래서 `useMapSheets` 도 스토어가 아니라 **페이지 state**(이중 마운트 두 자식 공유 규칙의 새 인스턴스)다. 진입 스냅은 의도에 비례: 딥링크에 검색어·`near` 가 있으면 결과를 먼저(`half`), 없으면 지도를 먼저(`peek`), 검색 제출·내 주변·재검색 뒤엔 `peek`→`half` 만 승격하고 사용자가 올려둔 full 은 건드리지 않는다. 데스크톱 블록은 무변경(루트 높이만 `xl:` 한정).

- **쿼터 비례 원칙 — 발화 시점을 업스트림 비용·사용자 의도에 맞춘다.** 세 크로스가 트리거 정책이 다른 건 우연이 아니라 각 조회의 쿼터 비용에 계산해 맞춘 것이다. (1) **도착 미리보기 = 펼침 시에만**(단일 아코디언 → 동시 폴링 1개): 버스/지하철 도착은 실시간 쿼터를 소비하므로 아코디언 펼침이라는 명시 의도에 비례. (2) **버스 크로스 검색(지하철 탭) = 제출 시에만**: 버스 검색은 서울시 API(캐시 미스 시 쿼터)라 타이핑마다 발화 금지 — Enter/검색 버튼 제출(`submittedQ`)에만. (3) **지하철 크로스 검색(버스 탭) = 제출 q 자동**: 지하철 검색은 로컬 DB(쿼터 0)라 자동 조회 무부담(버스 탭 자체가 제출형이라 q=확정값). (4) **주변 겸표시 = 주변 모드면 조회, 토글 off 여도 유지**: 지하철 nearby=로컬 DB(0), 버스 nearby=로컬 정류장 마스터(0 — 도입 당시엔 셀 캐시라 "거의 0")라 저렴 → 켤 때 즉시 표시되게 조회는 해두고 **표시만 게이팅**. 요약: 싼 것(로컬 DB)은 자동/미리, 비싼 것(외부 API)은 명시 의도(펼침·제출) 뒤에. 2026-10-05 부터는 이 원칙이 서버 쪽 버킷(위 "실시간 외부 API 공통 가드" 절)으로도 강제된다 — FE 발화 정책이 어긋나도 비싼 실시간 몫은 다른 기능에 먹히지 않는다.

- **(~2026-10-05) 이중 마운트 대응 — 공유 필요 상태만 승격.** 데스크톱/모바일 동시 마운트에서 "무엇을 어디 둘지"를 상태 종류별로 결정했다: 인스턴스 간 **공유가 필요한 UI 상태**(펼침·겸표시 토글)는 zustand 스토어로, **페이지 단위 상태**(`submittedQ`)는 페이지 state 로, **네트워크**는 RQ dedupe 에, **지도 인스턴스**는 풀 키를 레이아웃별로. 2026-10-05 한 벌 마운트로 전제가 사라졌지만 배치는 그대로 남았다 — 스토어는 재마운트 복원·탭 공유라는 다른 이유로 여전히 맞는 자리라서다(Architecture "이중 마운트 → 한 벌 마운트" 절).

- **지도 연속성은 A안+D안 이중 안전망.** 뷰포트 리셋(A안 싱글턴)과 타일 플래시(D안 인스턴스 풀)를 다른 도구로 각각 막고 서로의 빈틈(새로고침 시 풀 빈 상태 ↔ SPA 전환 시 뷰포트)을 메운다. C안(페이지 keep-alive)은 숨은 페이지가 상대 탭 URL 파라미터에 반응하는 구조 충돌로 기각([커밋 `4128d6b`](../../docs/PLAN-transit-unified.md)). 풀 재사용 시 **레이어 선택(일반/야간/위성)·사용자 선택 여부도 함께 이어받아야** 첫 렌더가 테마 기본값으로 `setUrl` 해 플래시가 재발하지 않는다(부수 효과로 위성 선택이 탭 전환 후 유지).

- **딥링크 대칭 계약 — 12차에서 확립, 14/15차로 확장.** 지하철 12차가 `/bus?near=&stId=` 로 첫 다리를 놓고, 통합 14차가 그 대칭(`/subway?near=&stn=`)을, 15차가 검색 변형(`q`+선택 전달)을 채웠다. 모든 이동이 **기존 URL 계약 재사용** — 자기 도메인은 in-page 핸들러, 상대는 navigate. `near` 를 함께 넘겨 주변 맥락이 탭을 건너 이어진다.

- **마커 네임스페이스 prefix + fit 제외 오버레이.** 겸표시를 자기 도메인 마커에 섞지 않고 `x-subway:`/`x-bus:` prefix 로 네임스페이스를 분리해, 클릭 가로채기(`startsWith('x-')`)가 선택 로직보다 앞서 상대 탭 딥링크로 라우팅한다. 겸표시는 **별도 VectorSource(overlayMarkers)** 라 `fitToMarkers` extent 를 넓히지 않아 자기 도메인 결과 기준 화면이 유지된다.

- **BE 무변경 — 기존 훅의 FE 조합만.** 세 축 전부 새 스키마·라우트·테이블 없이 이미 있는 훅을 한 페이지에서 함께 호출하는 조합이다. 부작용: 즐겨찾기 도메인 간 인터리브는 `createdAt` 미노출로 불가(도메인 단위 concat 으로 타협). 이 원칙이 "복합 경로 탐색(버스+지하철 환승)"을 스코프에서 뺀 이유이기도 하다 — 그건 노선 그래프 적재라는 BE 선행이 필요하다.

- **집중 모드 겸표시 숨김 — "화면 비우기" 정책과 일관.** 노선 보기(버스 `routeId`/지하철 `line`)·경로 탐색(`inPathView`)·따라가기 중에는 겸표시 조회·표시·토글 칩을 모두 숨긴다(`crossToggleVisible = nearMode && routeId===null` / `&& line===null && !inPathView`). 따라가기는 노선 추적 중에만 발생하므로 노선 조건으로 함께 커버된다.

- **비가시 탭 빈 상태 하드닝 — pending 을 "정보 없음"으로 오표시 않기.** 도착 미리보기의 빈 상태 문구는 **성공 응답에만** 낸다. 비가시 탭(브라우저 탭이 백그라운드거나, ~2026-10-05 이중 마운트 시절 모바일 인스턴스가 데스크톱 폭에서 숨겨진 경우)에서 React Query 가 재시도를 pause 하면 status=pending·fetchStatus=paused 로 `data` 가 없는데, 이걸 "정보 없음"으로 표시하면 오탐이다 — `!data` 는 로딩 스피너로 처리.

## Gotchas [coverage: high — 16 sources]

- **실패 쿨다운의 기준 시각이 "실패 시점" 이 아니라 "조회 시작" 이다(2026-10-05 리뷰가 남긴 것, 6곳 공통 — 미수정).** 버스 `loadRealtime`·`loadRouteDetail`, 지하철 `loadRealtime`·`doCollectTimetable`, 대기·날씨 `loadInto`, AWS·바다 `cached` 가 전부 함수 첫머리에 잡은 `nowMs` 로 `cooldown.failure(…, nowMs, …)` 를 부른다. 업스트림이 매달려 시간 예산(8초)을 다 쓰고 실패하면 첫 쿨다운 30초 중 8초가 이미 지나 있어 실제로는 ≈22초만 쉰다(서비스 차단 5분 단계에선 무시할 차이). [PLAN-perf-2](../../docs/PLAN-perf-2.md) "리뷰 반영 → 남긴 것(낮음)" 에 "실패 쿨다운 기준 시각을 조회 시작이 아니라 실패 시점으로(대기·버스·지하철·날씨·AWS·바다 6곳 공통)" 로 적혀 있다. 고칠 땐 `failure(…, Date.now() 또는 this.now(), …)` 로 6곳을 같이 바꾼다.
- **IP 하루 예산(지하철)은 CGNAT·사무실 공용 IP 뒤 여러 명이면 먼저 닿는다.** `PerClientDailyBudget` 은 `clientKey(req)`(CF-Connecting-IP) 단위라 같은 통신사 NAT 뒤 사용자들이 실시간 150회를 나눠 쓴다 — 서비스 주석이 스스로 "보조 수단 — 본 방어는 일일 쿼터·실패 쿨다운" 이라고 적는다. 지하철 서비스는 예산을 전역 쿼터보다 **먼저** 소비하므로, 전역 `realtime` 900 이 바닥나 503 이 나는 요청도 그 IP 의 예산 1을 쓴다(소비 순서상의 작은 누수).
- **데스크톱 subBar 를 `null` 로 "정리" 하지 말 것(2026-10-05~).** `DESKTOP_SUBBAR`(`<span hidden />`)는 내용이 없어 보이지만 상단바가 subBar 래퍼의 구분선(1px)을 그리게 하는 자리표시다. `null` 이면 일상지도·집값처럼 구분선이 한 줄로 얇아져 대중교통만 상단바 높이가 1px 달라진다(BusPage·SubwayPage 머리 주석).
- **(2026-10-10 해소, `008e0081`) 좌표 없는 식당에선 홈 한 줄 요약이 가리키는 주차 정보가 '가는 법' 탭에 없었다.** 2026-09-25~10-10 [TransitTab](../../apps/web/src/components/restaurant/detail/TransitTab.tsx)은 `latitude`/`longitude` 가 null 이면 "좌표 정보가 없어 주변 대중교통을 찾을 수 없어요" 한 화면만 돌려줘, 리뷰 평가만으로 뜬 `ParkingSummaryLine` 을 누르면 빈 탭이 나왔다. 이제 좌표 없음 분기가 안내("…주변 대중교통·주차장을 찾을 수 없어요") 아래 [ParkingNearbySection](../../apps/web/src/components/restaurant/detail/ParkingSection.tsx)`(lat=null, lng=null)` 을 그려 리뷰 주차 평가·팁·다이닝코드 시설을 보여 주고, 주변 주차장 목록과 "주차 페이지에서 보기" 는 좌표가 있을 때만, 보여 줄 리뷰 정보도 없으면 주차 칸 자체를 그리지 않는다(ParkingSection.test +1건). 세부는 [parking](parking.md).
- **`useMapSheets` 는 페이지의 `useState` 선언들보다 앞에 호출한다.** React Compiler 의 메모 검증이 뒤에 두면 훅이 돌려주는 setter 들을 반응값으로 봐 메모가 깨진다(`e84e4b9` 커밋 메모, BusPage/SubwayPage 주석). 새 지도 페이지에 이 훅을 붙일 때도 같은 순서.
- **subBar 는 반드시 `null` 로 cleanup.** `useLayoutEffect(() => { setSubBar(node); return () => setSubBar(null); })` — 해제를 빼면 다른 공개 페이지로 이동해도 대중교통 탭·검색행이 상단바에 남는다. 내용은 `xl:hidden` 으로 감싸 데스크톱 `headerHeight` 에 안 잡히게 한다.
- **(2026-10-05 해소) 데스크톱 폭에서도 모바일 시트가 마운트돼 있었다.** ~2026-10-05 목록 `BottomSheet` 는 `xl:hidden` 으로 안 보일 뿐 `mode='fixed'` 라 데스크톱에서도 `html overflow:hidden` 락을 걸었다. 한 벌 마운트로 시트는 `!isDesktop` 일 때만 생긴다.
- **한 벌 마운트의 경계 함정 — 창 폭이 xl 을 넘나들 때.** 지도 `<section>` 은 같은 트리 위치라 살아남지만 `MapCanvas` 는 `poolKey` 를 마운트 수명 동안 불변으로 보므로, 마운트된 채 폭이 바뀌면 `poolKey` prop 이 바뀌어도 **처음 키로 반납**된다(BusPage 주석 "마운트된 채 폭이 바뀌면 처음 키로 반납된다"). 그 뒤 탭 전환에서 다른 레이아웃 키로 찾으면 풀이 비어 새로 만든다 — 플래시 한 번이지 오동작은 아니다. 반대로 패널·시트는 분기 경계에서 언마운트/마운트되므로 좌패널의 스크롤 위치·시트 스냅 같은 컴포넌트 로컬 상태는 리사이즈 때 초기화된다.
- **선택 flyTo 에 `bottomInset` 을 안 넘긴다.** 상세 시트가 half(가용 높이 55%)로 아래를 덮는데 `BusStationsMap`/`SubwayStationsMap` 의 선택 flyTo 는 중심 보정 없이 날아가 지점이 시트 밑에 숨을 수 있다. 일상지도는 `sheetHalfInset(headerHeight)` 를 넘긴다 — 대중교통에 적용하려면 두 래퍼의 flyTo 호출에 옵션만 더하면 된다([map](map.md)).
- **`--map-bottom-inset` 은 모바일 지도 fixed 래퍼에만 있다.** 컨트롤은 `var(--map-bottom-inset,0px)` 를 읽으므로 데스크톱 래퍼(변수 없음)에선 종전 위치. 값은 `SHEET_PEEK_HEIGHT` 와 같이 움직여야 peek 시트와 어긋나지 않는다.

- **(~2026-10-05) 동시 마운트가 전제 — 모든 통합 컴포넌트가 2벌씩 살았다.** 그 시절 "왜 로컬 state 로 안 두고 스토어로 올렸나" 의 답은 항상 이중 마운트였다. 지금은 페이지당 한 벌이라 새 상태를 추가할 땐 "재마운트(초기 화면 ↔ 선택·탭 전환·xl 경계 리사이즈) 뒤에도 남아야 하는가" 를 기준으로 스토어 여부를 정한다.
- **`poolKey` 는 동시 사용 금지 — 레이아웃별 키 유지.** 한 키를 두 MapCanvas 가 동시에 쓰면 한 map 을 다툰다(풀 획득은 take 시맨틱 — `delete` 로 소유권 이전, StrictMode 이중 마운트에도 한 map 공유를 막는다). 한 벌 마운트 뒤로 동시 사용 위험은 사라졌지만 `transit-desktop`/`transit-mobile` 분리는 남겼다 — 데스크톱 지도와 모바일 지도는 크기·하단 inset 이 달라 서로의 인스턴스를 이어받을 이유가 없어서다.
- **`createdAt` 미노출 → 즐겨찾기 도메인 간 인터리브 불가(후속 검토).** 4종 병합이 진짜 시간순이 아니라 도메인 단위 concat(버스→지하철)인 건 항목별 `createdAt` 이 즐겨찾기 계약에 없기 때문. 진짜 인터리브는 BE 변경(계약에 timestamp 노출)이 선행돼야 해 [PLAN](../../docs/PLAN-transit-unified.md)에서 후속 항목으로 남겼다.
- **복합 경로 탐색(버스+지하철 환승)은 장기 스코프 제외.** "어떤 것이든 되는 느낌"의 끝판인 버스↔지하철 통합 경로는 노선 그래프 적재가 선행돼야 하므로 통합 13~15차에서 명시적으로 뺐다(장기). 현재 지하철 자체 경로 탐색(`/subway?to=`)은 지하철 도메인 내부 기능이다.
- **transitMapViewport 는 새로고침에 소실 — 의도.** 모듈 싱글턴이라 새로고침/직접 진입엔 저장 뷰포트가 없다. 이땐 D안 풀도 비어 있어 각 지도의 기본 뷰/딥링크 규칙이 그대로 산다(A안은 SPA 내 탭 전환 전용 보완재).
- **지하철만 복원 시 첫 fit 억제 가드가 필요.** 저장 뷰포트로 시작한 SubwayStationsMap 은 `restoreGuardRef` 로 첫 검색 fit 1회를 억제해야 복원이 즉시 덮이지 않는다. 버스는 결과 없는 마운트(탭 전환)에선 fit 이 안 돌아 별도 억제가 불필요 — 두 어댑터의 비대칭 주의.
- **겸표시 조회는 토글 off 여도 계속 돈다(표시만 게이팅).** `crossNear` 는 `crossToggleVisible` 기준이라 토글을 꺼도 조회는 유지되고 `overlayMarkers` 만 `undefined` 로 비운다 — 켤 때 즉시 표시(쿼터 0/셀캐시라 무부담)를 위한 의도. 조회 자체를 끄려면 주변 모드를 벗어나야 한다.
- **각 즐겨찾기 훅은 "페이지당 1회"만.** `useBusFavorites`/`useSubwayFavorites` 는 로그인 직후 게스트→서버 union 병합 부수효과(useEffect, 인스턴스별 `syncedRef`)를 갖는다. TransitFavoritesSection 이 직접 호출하지 않고 **페이지가 호출해 props 로 넘기는** 이유 — 도입 땐 데스크톱/모바일 2벌이 병합을 두 번 걸어서였고, 지금은 섹션이 초기 화면·목록 시트 표시 여부에 따라 수시로 마운트/언마운트(2026-10-05 `listHidden` 게이트 포함)되므로 훅을 섹션에 두면 재마운트마다 새 인스턴스가 병합을 다시 시도한다.
- **지하철 도착 `polling: false` 는 "멈춤" 이지 "비움" 이 아니다(2026-10-05~).** 시간표·길찾기 뷰에서 쿼리는 살아 있고 받아 둔 응답(헤더의 역명·호선)이 그대로 읽힌다 — 그 뷰에서 도착 목록 숫자를 보여 주면 묵은 값이다. 도착 뷰로 돌아오는 false→true 전이에서만 즉시 1회 재조회한다(첫 마운트·역 전환은 `useQuery` 가 직접 받으므로 제외). 시간표의 '다음 열차' 강조는 이 폴링 리렌더에 얹혀 갱신되던 것이라 [SubwayTimetable](../../apps/web/src/components/subway/SubwayTimetable.tsx)이 자체 30초 tick 을 갖게 됐다.
- ~~앱 미구현 — 버스·지하철·통합 모두 웹 전용~~ → **앱에는 별도의 대중교통 화면이 있다(2026-07~).** 이 문서의 통합 컴포넌트(TransitTabs·크로스·통합 즐겨찾기·겸표시·웹 시트)는 `apps/web` 전용이고, 앱은 `app/(tabs)/transit.tsx` + WebView 지도(`TransitMapView`) + gorhom 시트로 같은 훅을 다른 UI 로 소비한다(탑승 모드·하차 알림은 앱에만 — 상단 흡수 문단). 게스트 즐겨찾기 storage 주입도 앱 entry 에 배선됨. 앱 `TransitMapView` 는 대중교통 전용이 아니다 — 대기 측정소 지도·일상지도(2026-08)에 이어 등산(2026-10-26, 작업 트리)도 쓰므로, 브리지 명령·HTML 을 고칠 땐 네 화면을 같이 본다(`fitToCoords` 의 `belowInset` 처럼 기본값이 종전 동작인 옵션으로).
- **앱 시트는 `enableDynamicSizing={false}` 고정.** gorhom v5 기본값은 콘텐츠 높이 스냅 지점을 끼워 넣어 목록이 짧을 때 지점이 4개가 된다 — `animatedIndex` 를 보간하는 플로팅 헤더·시트 배경이 full 이 아닌 곳에서 끝난다(`fdb6ab9`). 새 지도 시트를 앱에 추가하면 같은 prop 을 준다(맛집·대중교통·일상지도 6개 전부 적용).

## Sources [coverage: high — 62 sources]

**통합 컴포넌트 (web/components/transit)**
- [apps/web/src/components/transit/TransitTabs.tsx](../../apps/web/src/components/transit/TransitTabs.tsx)
- [apps/web/src/components/transit/TransitFavoritesSection.tsx](../../apps/web/src/components/transit/TransitFavoritesSection.tsx)
- [apps/web/src/components/transit/CrossSearchSection.tsx](../../apps/web/src/components/transit/CrossSearchSection.tsx)
- [apps/web/src/components/transit/TransitCrossToggleChip.tsx](../../apps/web/src/components/transit/TransitCrossToggleChip.tsx)
- [apps/web/src/components/transit/transitMapViewport.ts](../../apps/web/src/components/transit/transitMapViewport.ts)

**공유 스토어 (web/stores)**
- [apps/web/src/stores/transitFavExpandStore.ts](../../apps/web/src/stores/transitFavExpandStore.ts) — *존재 이유가 재마운트 뒤 펼침 복원으로 바뀜(2026-10-05 주석)*
- [apps/web/src/stores/transitCrossShowStore.ts](../../apps/web/src/stores/transitCrossShowStore.ts) — *탭 사이 공유 + persist*

**배선 — 페이지·연계**
- [apps/web/src/routes/BusPage.tsx](../../apps/web/src/routes/BusPage.tsx) — *useIsDesktopXl 한 벌 마운트·DESKTOP_SUBBAR·EMPTY_*·near memo·listHidden 즐겨찾기 게이트(2026-10-05)*
- [apps/web/src/routes/SubwayPage.tsx](../../apps/web/src/routes/SubwayPage.tsx) — *같은 한 벌 마운트 + 도착 polling 휴지 + 검색 200ms 디바운스*
- [apps/web/src/routes/BusPage.test.tsx](../../apps/web/src/routes/BusPage.test.tsx) — *6건: 한 벌 마운트·리렌더 뒤 마커 참조 유지·fit 재발화 없음·숨은 시트 즐겨찾기 미마운트*
- [apps/web/src/routes/SubwayPage.test.tsx](../../apps/web/src/routes/SubwayPage.test.tsx) — *7건: 도착 쿼리 구독자 1·시간표/길찾기 폴링 휴지·디바운스·지울 땐 즉시*
- [apps/web/src/components/subway/SubwayNearbyBusSection.tsx](../../apps/web/src/components/subway/SubwayNearbyBusSection.tsx)
- [apps/web/src/components/subway/SubwayTimetable.tsx](../../apps/web/src/components/subway/SubwayTimetable.tsx) — *'다음 열차' 강조 자체 30초 tick(2026-10-05)*
- [apps/web/src/lib/useDebounced.ts](../../apps/web/src/lib/useDebounced.ts) — *지하철 라이브 검색 200ms(useDeferredValue 대체)*
- [packages/shared/src/hooks/useSubway.ts](../../packages/shared/src/hooks/useSubway.ts) — *useSubwayStationArrivals(stationId, { polling }) — 재개 시 즉시 1회*
- [packages/shared/src/hooks/useBusFavorites.ts](../../packages/shared/src/hooks/useBusFavorites.ts) · [useSubwayFavorites.ts](../../packages/shared/src/hooks/useSubwayFavorites.ts) — *빈 서버 목록 EMPTY_* 안정 참조*

**서버 공통 가드 (2026-10-05, friendly 소유)**
- [apps/friendly/src/lib/upstream-guard.ts](../../apps/friendly/src/lib/upstream-guard.ts) — *DailyQuota·UpstreamCooldown·PerClientDailyBudget·요청 시간 예산 8초*
- [apps/friendly/src/lib/upstream-guard.test.ts](../../apps/friendly/src/lib/upstream-guard.test.ts) — *5건*
- [apps/friendly/src/modules/bus/bus.service.ts](../../apps/friendly/src/modules/bus/bus.service.ts) — *BUS_QUOTA_LIMITS 버킷·쿨다운·노선 네거티브 캐시*
- [apps/friendly/src/modules/subway/subway.service.ts](../../apps/friendly/src/modules/subway/subway.service.ts) — *IP 하루 미스 예산·쿨다운(실패 시각 기준 문제 포함)*
- [apps/friendly/src/plugins/rate-limit.ts](../../apps/friendly/src/plugins/rate-limit.ts) — *clientKey·RATE.transitRealtime*
- [docs/PLAN-perf-2.md](../../docs/PLAN-perf-2.md) — *6차·모듈 묶음 realtime·리뷰 반영 "남긴 것"(쿨다운 기준 시각)*
- [docs/PLAN-perf-2-findings.md](../../docs/PLAN-perf-2-findings.md) — *E-1·E-7·E-V2 원문*
- [docs/api/README.md](../../docs/api/README.md) — *429(지하철 IP 한도)·503(쿨다운)·공용 쿼터 서술*

**지도 (풀링·오버레이)**
- [apps/web/src/components/restaurant/MapCanvas.tsx](../../apps/web/src/components/restaurant/MapCanvas.tsx)
- [apps/web/src/components/bus/BusStationsMap.tsx](../../apps/web/src/components/bus/BusStationsMap.tsx)
- [apps/web/src/components/subway/SubwayStationsMap.tsx](../../apps/web/src/components/subway/SubwayStationsMap.tsx)

**네비게이션·라우트**
- [apps/web/src/components/PublicSidebar.tsx](../../apps/web/src/components/PublicSidebar.tsx)
- [apps/web/src/components/PublicTopBar.tsx](../../apps/web/src/components/PublicTopBar.tsx)
- [apps/web/src/App.tsx](../../apps/web/src/App.tsx)

**모바일 시트 골격 (2026-08-22, 맛집 v2 와 공용)**
- [apps/web/src/components/sheet/BottomSheet.tsx](../../apps/web/src/components/sheet/BottomSheet.tsx) — *restaurant-v2/ 에서 승격(내용 무변경), 3-snap dual-mode 시트*
- [apps/web/src/components/sheet/useMapSheets.ts](../../apps/web/src/components/sheet/useMapSheets.ts) — *목록↔상세 스냅 조율 + SHEET_PEEK_HEIGHT(120)·sheetHalfInset*
- [apps/web/src/lib/useMediaQuery.ts](../../apps/web/src/lib/useMediaQuery.ts) — *useIsDesktopXl — 2026-10-05 부터 대중교통 두 페이지도 이 JS 분기(일상지도·집값·주차와 같은 패턴)*
- [apps/web/src/components/PublicLayout.tsx](../../apps/web/src/components/PublicLayout.tsx) — *setSubBar/headerHeight 컨텍스트*
- [apps/web/src/components/restaurant/MapLayerControl.tsx](../../apps/web/src/components/restaurant/MapLayerControl.tsx) — *--map-bottom-inset 반영*
- [apps/web/src/routes/RestaurantsV2Page.tsx](../../apps/web/src/routes/RestaurantsV2Page.tsx) — *골격의 원형(맛집 v2), 같은 커밋에서 useMapSheets 로 교체*

**앱 대중교통 (apps/mobile — 이번 라운드 변경분)**
- [apps/mobile/app/(tabs)/transit.tsx](../../apps/mobile/app/(tabs)/transit.tsx) — *enableDynamicSizing=false(목록·상세 시트), pointerEvents style 이관*
- [apps/mobile/src/components/transit/TransitFloatingHeader.tsx](../../apps/mobile/src/components/transit/TransitFloatingHeader.tsx)
- [apps/mobile/src/components/transit/TransitMapView.native.tsx](../../apps/mobile/src/components/transit/TransitMapView.native.tsx) · [TransitMapView.web.tsx](../../apps/mobile/src/components/transit/TransitMapView.web.tsx) — *markerIcons prop 통과. 2026-10-26(작업 트리): 핸들 `fitToCoords` 가 `belowInset` 을 명령에 싣는다*
- [apps/mobile/src/components/transit/transitMapBridge.ts](../../apps/mobile/src/components/transit/transitMapBridge.ts) — *BridgeMarker.fixedScale, setMarkers.icons. 2026-10-26(작업 트리): `fitToCoords.belowInset?`*
- [apps/mobile/src/components/transit/transitMapHtml.ts](../../apps/mobile/src/components/transit/transitMapHtml.ts) — *아이콘 사전 치환, fixedScale 축소 제외. 2026-10-26(작업 트리): `belowInset` 이면 fit 아래 패딩 `+ viewBottomInset`*
- [apps/mobile/src/components/transit/useTransitMapSync.ts](../../apps/mobile/src/components/transit/useTransitMapSync.ts) — *2026-10-26(작업 트리): `TransitMapHandle.fitToCoords(coords, padding?, opts?)`*
- [apps/mobile/app/hiking/index.tsx](../../apps/mobile/app/hiking/index.tsx) — *2026-10-26(작업 트리): TransitMapView 네 번째 소비처(등산) — `fitToCoords(…, { belowInset: true })` 첫 사용처*
- [apps/mobile/src/components/transit/useAlightAlert.ts](../../apps/mobile/src/components/transit/useAlightAlert.ts) — *setNotificationHandler 제거(루트로 이동)*
- [apps/mobile/app/_layout.tsx](../../apps/mobile/app/_layout.tsx) — *하차·식사 알림 공용 setNotificationHandler*

**배경 문서**
- [docs/PLAN-transit-unified.md](../../docs/PLAN-transit-unified.md)
- [docs/mobile-public-restaurant-ux-v2.md](../../docs/mobile-public-restaurant-ux-v2.md) — *시트 골격 원 설계 문서(sheet/ 승격 반영)*

**식당 '가는 법' 탭·주차 연결 (2026-09-24~09-26 라운드)**
- [apps/web/src/components/restaurant/detail/TransitTab.tsx](../../apps/web/src/components/restaurant/detail/TransitTab.tsx) — *버스 500m·지하철 1.5km 섹션 + 세 번째 ParkingNearbySection, 좌표 없음 분기도 주차 평가를 그림(`008e0081`, 2026-10-10)*
- [apps/web/src/components/restaurant/detail/ParkingSection.tsx](../../apps/web/src/components/restaurant/detail/ParkingSection.tsx) — *ParkingNearbySection(lat/lng null 허용 — 리뷰 평가만)·ParkingSummaryLine(onOpen 선택), /parking 딥링크*
- [apps/web/src/components/restaurant/detail/ParkingSection.test.tsx](../../apps/web/src/components/restaurant/detail/ParkingSection.test.tsx) — *섹션 행 클릭 → 주차 페이지 sel, 요약 → 가는 법, 좌표 없음 + 리뷰 평가(+1, 2026-10-10)*
- [apps/web/src/components/restaurant/detail/HomeTab.tsx](../../apps/web/src/components/restaurant/detail/HomeTab.tsx) — *영업 정보 끝 한 줄 요약, availableTabs 선택 prop(`420a6be`)*
- [apps/web/src/components/restaurant/detail/PublicRestaurantDetail.tsx](../../apps/web/src/components/restaurant/detail/PublicRestaurantDetail.tsx) — *탭 필터는 tour 만 — 가는 법 탭은 늘 보임*
- [apps/web/src/components/restaurant/detail/tabs.ts](../../apps/web/src/components/restaurant/detail/tabs.ts) — *TAB_ORDER 'transit' = '가는 법'*
- [apps/web/src/routes/ParkingPage.tsx](../../apps/web/src/routes/ParkingPage.tsx) — *URL 계약 t·ll·z·sel, useIsDesktopXl JS 분기*
- [packages/shared/src/hooks/useParking.ts](../../packages/shared/src/hooks/useParking.ts) — *useParkingLotNearby(2분 stale·5분 폴링)·useRestaurantParkingReviews(30분)*
- [packages/utils/src/parking.ts](../../packages/utils/src/parking.ts) — *PARKING_RESTAURANT_RADIUS_M = 300*
- [apps/friendly/src/modules/parking/parking.service.ts](../../apps/friendly/src/modules/parking/parking.service.ts) — *getRestaurantReviews — canonical 전 출처 '주차' 관점·팁 상위 5*
- [apps/friendly/src/modules/bus/bus.route.ts](../../apps/friendly/src/modules/bus/bus.route.ts) — *한국어 summary/description 만 추가(`1b621c4`)*
- [apps/friendly/src/modules/subway/subway.route.ts](../../apps/friendly/src/modules/subway/subway.route.ts) — *한국어 summary/description 만 추가(`1b621c4`)*
- [docs/PLAN-parking.md](../../docs/PLAN-parking.md) — *결정 표: 별도 메뉴(대중교통 다음)·가는 법 섹션 + 홈 요약*
