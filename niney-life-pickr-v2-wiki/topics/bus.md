---
topic: bus
type: codebase
last_compiled: 2026-10-10
sources_count: 66
status: active
aliases: [BUS_QUOTA_LIMITS, BusQuotaBucket, 버스-쿼터-버킷, search-60, arrivals-510, positions-240, route-90, BUS_ROUTE_NOT_FOUND_TTL_MS, BusRouteNotFoundError, routeNotFound, routeInflight, 노선-없음-네거티브-캐시, upstream-guard, UpstreamCooldown, 실패-쿨다운, stationinfo, buspos, busRouteInfo, recordFailure, cooldownError, UPSTREAM_REQUEST_BUDGET_MS, BUS_DEBOUNCE_MS, useSettledBusQuery, TRAILING_JAMO, 낱자모-대기, EMPTY_VEHICLES, followStation, BusPage.test, 한-벌-마운트, seoul-bus, seoul-bus-api, ws-bus-go-kr, DATA_GO_KR_API_KEY, data-go-kr-key, 공공데이터포털-인증키, bus-station-search, getStationByName, getStationByPos, getStationByUid, getBusPosByRouteSt, getBusPosByRtid, getRoutePath, getStaionByRoute, getRouteInfo, bus-arrivals, bus-positions, bus-route-detail, bus-route-shape, bus-nearby-cell, nearby-cell-cache, bus-favorites, favorite-hybrid, toLatLng, serviceKey-encoding, service-key-double-encoding, bus-vehicle-pill, vehicle-marker, vehicle-interpolation, route-path-follow, bus-follow-toggle, busRouteTypeColor, daily-upstream-quota, negative-caching, virtual-station, arsId-zero, tmX-tmY-wgs84, transit-unified, transit-favorites, unified-favorites, transit-cross-search, subway-cross-section, cross-station-overlay, overlay-markers, x-subway-deeplink, transit-cross-show, transit-map-viewport, map-instance-pool, poolKey, transit-desktop-mobile, vehicle-pill-shared, transit-tabs, bus-list-sheet, bus-detail-sheet, BottomSheet, useMapSheets, sheet-pattern, 시트-골격, subBar, map-bottom-inset, 일부만-표시, truncated-inline]
---

# bus — 서울시 버스 정보 API 프록시 + 웹 정류장·도착·노선·실시간 차량 화면

서울시 버스 정보 API(`ws.bus.go.kr`)를 friendly 가 프록시하고, **웹**(`apps/web`)이 정류장 검색·실시간 도착정보·노선 보기·실시간 차량 추적을 그리는 도메인. ~~앱에는 버스 화면이 없다~~ → 2026-07 이후 **앱(`apps/mobile`)에도 대중교통 화면**(버스·지하철 통합)이 있다 — [transit](transit.md)/[mobile](mobile.md) 참조.

**2026-10-05 변경 흡수 — 일일 쿼터 900 을 오퍼레이션 버킷으로 쪼개고 실패 쿨다운·'노선 없음' 네거티브 캐시를 두다(`fd957320`) + 웹 한 벌 마운트·마커 재생성 축소·옴니박스 버스 검색 450ms(`086e4510`)**: 발견 원문은 [PLAN-perf-2-findings](../../docs/PLAN-perf-2-findings.md) E-1(가짜 `busRouteId` 300회 = 스텁 900콜로 전 사용자 도착·위치가 하루 정지, 같은 가짜 id 5회 = 15쿼터)·E-V2(장애 중 매 폴링이 재호출 — 정류소 10곳 30초 폴링 60분 장애면 시도 900·45분에 소진·복구 뒤에도 자정까지 503). 공통 부품 구조는 [transit](transit.md) 의 "실시간 외부 API 공통 가드" 절, 라이브러리 소유는 [friendly](friendly.md). 버스 몫: (1) **쿼터 버킷** — 단일 카운터 `DEFAULT_DAILY_UPSTREAM_LIMIT = 900`(삭제)·`consumeQuota` 를 `BUS_QUOTA_LIMITS = { search: 60, arrivals: 510, positions: 240, route: 90 }`(합 900, `DailyQuota`)로. 배분은 화면 호출 모형 — 도착은 정류소 패널이 열린 동안 30초 폴링(15초 마이크로캐시라 패널당 분당 ≈2콜), 위치는 노선 추적 때만 15초(≈4콜)이고 추적은 도착 세션 일부라 세션 평균 도착 2 : 위치 1, 검색·노선은 처음 보는 키만 업스트림이라 작게. 업스트림 실한도는 data.go.kr 서비스별(정류소정보·버스위치·노선정보 각 1,000)이라 stationinfo(검색 60 + 도착 510 = 570)도 넘지 않는다. 운영 전체 요청이 하루 ≈700건(2026-05~10 로그 10.4만 건)이라 버스 몫은 버킷보다 한참 작다 — 서비스 주석이 "오퍼레이션별 호출 수가 쌓이면 비율을 보정" 하라고 남겼다. 테스트 주입은 `dailyLimit`(전 버킷 같은 값)·`dailyLimits`(버킷별 우선). (2) **실패 쿨다운** — `UpstreamCooldown` 서비스 단위 `'stationinfo' | 'buspos' | 'busRouteInfo'`(활용신청 단위), 키는 `search:<keyword>`·`arrivals:<arsId>`·`positions:<…>`·`route:<id>`. `BusApiError` 만 기록하고 `BusApiAuthError` 면 그 서비스 전체(정류소정보가 막혀도 버스위치는 산다). 쿨다운 중 검색·노선은 만료 DB 캐시를 `stale`, 도착·위치는 10분 내 last-known 을 `stale:true`, 없으면 업스트림·쿼터 없이 503 "서울시 버스 API 가 응답하지 않아 잠시 조회를 멈췄습니다. N초 뒤 다시 시도해 주세요.". 시뮬레이션 60분 장애 시도 900 → 150회(커밋 본문). (3) **노선 상세** — 기본정보 0건을 내부 `BusRouteNotFoundError` 로 구분해 `routeNotFound`(LRU 2,000, 값 = 풀리는 시각, `BUS_ROUTE_NOT_FOUND_TTL_MS` 24h)에 넣고, 그동안 같은 id 는 업스트림·쿼터 없이 502(계약 유지); 같은 id 동시 요청은 `routeInflight` 로 3콜 수집 한 번에 합류; 3콜분 확보는 `quota.consume('route', now, 3)` 한 번. (4) **레이트리밋** — 전역 1000/분뿐이던 `stationSearch`·`routeDetail` 에 `RATE.transitRealtime`(60/분)을 걸고, `routeDetail` 에 외부 문서용 `description`("없는 노선은 502 이고, 같은 id 는 24시간 동안 업스트림을 다시 부르지 않는다")을 달았다. (5) **어댑터 타임아웃** 10초 → 공용 `UPSTREAM_REQUEST_BUDGET_MS` 8초(재시도 없음 그대로, `clearTimeout` 은 여전히 본문 읽기 뒤). (6) **웹(`086e4510`)** — [BusPage](../../apps/web/src/routes/BusPage.tsx)가 `useIsDesktopXl` 로 지도·패널·시트를 한 벌만 마운트(구조·근거는 [transit](transit.md)), `near` 를 원문 문자열 키로 memo, 빈 `items`·`nearItems`·`vehicles` 를 `EMPTY_*` 모듈 상수로 — 도착 30초·위치 15초 폴링 리렌더마다 마커 전량 재생성·`fitToMarkers` 재발화로 지도가 끌려가던 것; [BusStationsMap](../../apps/web/src/components/bus/BusStationsMap.tsx) 마커 memo 의존을 `selectedStId` 에서 `followStation`(따라가기 중일 때의 대상 정류장)으로 좁혀 평소 선택 변경은 마커 배열을 건드리지 않는다. 일상지도 옴니박스 [LifeGoToBox](../../apps/web/src/components/life-map/LifeGoToBox.tsx)의 버스 검색만 450ms(`BUS_DEBOUNCE_MS`) + 끝 글자가 낱자모(`/[ㄱ-ㅎㅏ-ㅣ]$/`)면 예약 안 함(`useSettledBusQuery`) — `search` 버킷 60 을 중간 접두어로 태우지 않게(앱 [LifeGoToModal](../../apps/mobile/src/components/lifeMap/LifeGoToModal.tsx)은 250ms 그대로). 테스트: [bus.test.ts](../../apps/friendly/src/modules/bus/bus.test.ts) 52건(버킷 분리·가짜 노선 네거티브·노선 in-flight·쿨다운 30초·서비스 차단 5건 신설), [BusPage.test](../../apps/web/src/routes/BusPage.test.tsx) 6건.

**2026-09-02 변경 흡수 — data.go.kr 인증키를 `DATA_GO_KR_API_KEY` 하나로 통일(`3d9dfed`)**: 버스가 처음 도입한 `BUS_API_KEY` 는 그동안 에어코리아·기상청·심평원·음식 영양성분이 "비우면 `BUS_API_KEY` 폴백" 으로 빌려 쓰는 사실상의 계정 공용 키였다. 집값(국토부 실거래가·K-apt·건축HUB)까지 같은 키를 쓰게 되자 [env.ts](../../apps/friendly/src/config/env.ts)가 `BUS_API_KEY`·`AIRKOREA_API_KEY`·`KMA_API_KEY`·`HIRA_API_KEY`·`FOOD_API_KEY` 다섯 항목을 **`DATA_GO_KR_API_KEY` 하나**로 접었다 — 폴백 체인 자체가 사라지고, [bus.route.ts](../../apps/friendly/src/modules/bus/bus.route.ts)는 `new BusService(app.prisma, { serviceKey: env.DATA_GO_KR_API_KEY })`, [bus.service.ts](../../apps/friendly/src/modules/bus/bus.service.ts)의 503 문구 4곳·[probe-bus-api.ts](../../apps/friendly/scripts/probe-bus-api.ts)·라우트/라이브 테스트의 `vi.hoisted` 주입(`'test-bus-key'` 플레이스홀더는 유지)이 전부 새 이름을 읽는다. 데이터셋마다 **활용신청만 추가**하면 같은 키로 부르고, 미신청 데이터셋은 `30 등록되지 않은 서비스키`(키가 틀린 게 아니다)·경로 버전 불일치는 `12` 라는 판독 규칙이 [.env.example](../../apps/friendly/.env.example) 한 곳에 모였다. ⚠️ 운영 `.env` 의 `BUS_API_KEY` 는 **더 이상 읽히지 않는다**(zod 기본 `''` → 버스 라우트 전부 503) — 배포 전 이름을 바꿔야 한다. 같은 커밋으로 `toServiceKeyPart` 소비처에 집값 어댑터 2개가 더해져 cross-module import 가 6파일이 됐다(아래 Talks To).

**2026-08-22 변경 흡수 — 웹 모바일(=웹 작은 화면) 레이아웃을 공통 시트 골격으로 이전(`e84e4b9`)**: [BusPage](../../apps/web/src/routes/BusPage.tsx)의 모바일 블록이 "검색바 / 지도 / 리스트 38dvh 세로 적층"에서 맛집 v2·지하철·일상지도와 같은 **상단바 subBar + fixed 지도 + 바텀시트 2장** 골격으로 바뀌었다 — `TransitTabs`+`BusStationSearchBar` 는 상단바 subBar 로(정류장 선택 중엔 검색행을 접어 헤더 215→98px), 지도는 `fixed` 배경(`poolKey="transit-mobile"`·이중 마운트 유지), `BusStationListBody` 는 목록 [BottomSheet](../../apps/web/src/components/sheet/BottomSheet.tsx)(`data-testid="bus-list-sheet"`, `zIndex 20`), `stId` 가 잡히면 `BusArrivalPanel` 이 상세 시트(`key=stId`, `data-testid="bus-detail-sheet"`, `zIndex 25`)로 얹힌다. 스냅 조율은 [useMapSheets](../../apps/web/src/components/sheet/useMapSheets.ts) — 검색어 ≥2자·주변 모드로 진입하면 목록 `half` 시작, 제출·내 주변·재검색 뒤 `peek` 이면 `half` 로 승격, 상세가 열리면 목록은 peek·숨김. [BusStationList](../../apps/web/src/components/bus/BusStationList.tsx)의 "결과가 많아 일부만 표시합니다" 별도 줄은 메타 행 인라인 `· 일부만 표시`(title "서버가 100건으로 절단했습니다")로 접혔고, [BusStationsMap](../../apps/web/src/components/bus/BusStationsMap.tsx)의 따라가기/다시 따라가기 pill 은 `bottom-[calc(0.75rem+var(--map-bottom-inset,0px))]` 로 peek 시트(120px) 위에 뜬다. 데스크톱 블록·URL 계약(`q`/`stId`/`routeId`/`near`)·BE 는 무변경. 골격 규약(subBar·스냅 규칙·React Compiler 훅 순서·이중 마운트 함정)은 [transit](transit.md), 시트 컴포넌트 자체(dual-mode·스크롤 락)는 [web](web.md).

**2026-08-17 변경 흡수 — 지도 재검색 파이프라인 shared 승격(`df9fcbd`)**: [BusStationsMap](../../apps/web/src/components/bus/BusStationsMap.tsx) 의 인라인 ~50줄(사용자 패닝 종료 추적 + 자동 재조회 트레일링 스로틀 1.2s + 수동 "이 위치에서 재검색" 버튼 판정)이 `@repo/shared` [useMapResearch](../../packages/shared/src/hooks/useMapResearch.ts) 호출로 교체됐다(버스 임계 300m·z15 유지, 동작 동일 — 웹 SubwayStationsMap·앱 transit 훅과 3곳 문자 단위 중복이던 것). 타이밍 계약 테스트 5건은 [web](web.md), 훅 상세는 [shared](shared.md).

**2026-07-13 변경 흡수 — 서울시 API 전면 503 장애를 계기로 한 장애 내성 재설계(`b0c4f0a`) + 15초 마이크로캐시(7차, `bc2db00`) + 5xx 진단 로깅(`d3af987`)**:
- **주변 정류장 — 근본 해결(지하철 nearby 와 동일 설계로 전환)**: 열린데이터광장 busStopLocationXyInfo 마스터(11,248행)를 `BusStation` 에 적재하는 `load:bus-stations` 신설(+`BusMasterSync` 이력, ID 체계 실측 검증 — STOPS_NO=stId, NODE_ID=arsId). `getNearbyStations` 가 **로컬 바운딩박스 조회(업스트림 0콜)** 로 전환 — 장애·쿼터·키 무관, 미적재는 503 안내, 가상정류장(arsId '0') 제외. **셀 캐시 경로 폐기**: `bus_nearby_cells`/`hits` 테이블 드랍, `getStationsByPos` 어댑터 dead code 제거. 계약 nearby source 에 'db' 추가. 아래 본문의 "주변 셀 캐시" 서술은 **역사 기록**이다.
- **도착·위치 — last-known stale 폴백**: 15초 마이크로캐시(7차 — `realtimeCache` + in-flight 합류, 쿼터는 캐시 미스 직전에만 소비)의 마지막 성공본을 보관, 업스트림 실패·쿼터 소진 시 10분 이내면 `stale:true` 로 서빙(초과 시 기존 502/503). 계약 BusArrivals/PositionsResult 에 stale 필드. 웹은 stale 배너("서울시 버스 API 장애 — ○분 전 정보")·5xx 원인 문구 표시.
- **5xx 진단 로깅**: bus 라우트 catch 5벌이 [lib/reply-upstream-error](../../apps/friendly/src/lib/reply-upstream-error.ts) 로 통합 — upstreamUrl(키 마스킹)/upstreamCode/responseSnippet 을 warn 기록(운영에서 "request completed 502" 만으론 원인 구분 불가하던 것). bus live 스모크는 업스트림 5xx 를 skip(지하철 ERROR-337 전례).
- ⚠️ 운영: 버스위치 API 키(15000332) **2026-12-27 만료 예정** — 포털 연장 필요(코드 무관). 커밋 히스토리상 1차(정류장 검색+지도)부터 8차(실시간 따라가기 토글+대상 강조)까지가 버스 단독 단계였고, 이후 버스는 지하철과 함께 **대중교통(버스+지하철) 통합 화면**으로 접혔다 — `/bus` 와 `/subway` 가 상단 서브탭([TransitTabs](../../apps/web/src/components/transit/TransitTabs.tsx))으로 오가고, 초기 화면의 즐겨찾기·주변 겸표시·검색 결과 하단이 양 도메인을 함께 다룬다. 그 통합 라운드가 이 문서에 반영된 델타다(2026-07-07 기준): **통합 즐겨찾기**(도메인별 `BusFavoriteSection` **삭제** → [TransitFavoritesSection](../../apps/web/src/components/transit/TransitFavoritesSection.tsx) 로 대체), **주변 겸표시**(주변 모드에 지하철역 오버레이 마커), **크로스 검색**(검색 결과 하단 상대 도메인 섹션), **탭 전환 지도 이어보기**(뷰포트 이어보기 A안 + OL 인스턴스 풀링 D안). 지하철 쪽 짝·통합 화면의 공용 규약은 [transit](transit.md)·[subway](subway.md) 토픽. 1~2차의 WHY·API 키 체인·활용신청 현황은 `docs/HANDOFF-bus-station-search.md`(로컬 전용 — 리포에 없음)에 정리돼 있으나 그 문서는 2차까지만 다룬다.

## Purpose [coverage: high — 6 sources]

버스 도메인은 세 가지를 웹에서 제공한다: (1) **정류장 찾기** — 키워드 검색([BusStationList](../../apps/web/src/components/bus/BusStationList.tsx)) 또는 좌표 기반 주변 정류장(Geolocation·지도 재검색), (2) **실시간 도착정보** — 선택 정류장의 노선별 도착 메시지("곧 도착", "12분후[4번째 전]") 30초 폴링, (3) **노선 보기 + 실시간 차량 추적** — 선택 노선의 형상 폴리라인·경유 정류소·기본정보 위에 전체 운행 차량을 15초 폴링으로 얹고, 차량 알약을 탭하면 카메라가 그 버스를 따라간다.

이 도메인 설계 전체를 관통하는 단 하나의 제약은 **서울시 개발계정 일 1,000건 호출 한도**(data.go.kr 서비스별)다. 그 제약이 백엔드(30일 DB 캐시·로컬 정류장 마스터(2026-07-13~, 그전엔 셀 격자 캐시)·오퍼레이션별 일일 쿼터 버킷과 실패 쿨다운(2026-10-05~, 그전엔 단일 카운터)·in-flight 합류·네거티브 캐싱)부터 프론트(제출형 검색·`document.visibilityState` 가드 폴링·선택 시에만 조회)까지 관통한다. `ws.bus.go.kr` 는 **평문 HTTP 전용이고 CORS 도 없어** 브라우저가 직접 못 부른다 — friendly 프록시가 필수 인프라인 이유다.

접근 정책은 맛집 공개 지도와 동일하다: 검색·도착·위치·노선은 **비로그인 공개**, **즐겨찾기만 로그인 필요**(소유자 스코프). `DATA_GO_KR_API_KEY`(data.go.kr 계정 공용 키 — 2026-09-02 `3d9dfed` 이전 이름 `BUS_API_KEY`)가 비어 있으면 모든 버스 라우트가 503 을 내고 기능이 비활성화된다.

## Architecture [coverage: high — 11 sources]

한 방향 레이어드 파이프라인이다. 저수준 어댑터가 서울시 XML 을 정규화하고, 서비스가 캐시·쿼터·정규화를 얹고, 라우트가 HTTP 상태로 변환하고, 계약(zod)이 FE/BE 를 컴파일 타임에 묶고, shared 가 API·훅·store 를, 웹 컴포넌트가 UI 를 담당한다.

```
웹 /bus (BusPage — q/stId/routeId/near URL 동기화, useIsDesktopXl 한 벌 마운트 2026-10-05~) ── TransitTabs(버스↔지하철)
  ├─ 좌: BusStationList(+crossSearchContent 슬롯) | BusArrivalPanel   (모바일은 목록/상세 BottomSheet)
  │       └ 초기 화면: TransitFavoritesSection(버스+지하철 공용) · SubwayCrossSection(크로스 검색)
  └─ 우: BusStationsMap → MapCanvas (vworld OL + 차량 애니 + 폴리라인 + 겸표시 오버레이)
     │      poolKey = isDesktop ? 'transit-desktop' : 'transit-mobile' (탭 전환 인스턴스 풀링 D안)
     │      overlayMarkers=지하철역(x-subway:) · TransitCrossToggleChip(표시 토글)
     │
  @repo/shared: useBus.ts (검색/주변/도착/위치/노선) · useBusFavorites.ts · busFavoriteStore.ts
                useSubwayNearbyStations · useSubwayFavorites (겸표시·통합 즐겨찾기용)
  @repo/utils : busMarker.ts (마커 SVG, 차량 알약은 vehiclePill.ts 위임) · markerFrame.ts
                routePath.ts (형상 투영) · buildSubwayStationMarkerDataUrl (겸표시 아이콘)
  apps/web    : transit/ (TransitTabs · TransitFavoritesSection · CrossSearchSection ·
                TransitCrossToggleChip · transitMapViewport(A안) ) · stores/transitCrossShowStore
     │  ↕ @repo/api-contract: schemas/bus.ts · schemas/bus-favorite.ts · routes.ts(Routes.Bus)
     ▼
  friendly: bus.route.ts / bus-favorite.route.ts  (HTTP 레이어, 업스트림 GET 4 = RATE.transitRealtime 60/분 — 검색·노선은 2026-10-05~)
            bus.service.ts / bus-favorite.service.ts (캐시·쿼터 버킷·실패 쿨다운·네거티브 캐시·정규화)
              └ lib/upstream-guard.ts (DailyQuota·UpstreamCooldown — 공용, transit 토픽에 구조)
            bus-api.adapter.ts (callBusApi + 타입드 래퍼 9종, 1콜 8초)
     ▼
  http://ws.bus.go.kr/api/rest/{stationinfo|buspos|busRouteInfo}/<op>   (평문 HTTP, CORS 없음)
```

### 서울시 3종 API 키 체인

세 개의 별도 data.go.kr 서비스가 식별자 체인으로 이어진다 — 단절 없이 검색 → 도착 → 위치 → 노선으로 흐른다.

| 서비스 (data.go.kr) | 오퍼레이션 | 산출 식별자 | 쓰임 |
|---|---|---|---|
| **정류소정보조회 15000303** | `stationinfo/getStationByName` | `stId`(9자리)·`arsId`(5자리)·좌표 | 키워드 검색 |
| | `stationinfo/getStationByPos` | 위 + `dist` | 좌표 기반 주변 정류장 |
| | `stationinfo/getStationByUid` | `busRouteId`·`staOrd`·`vehId`·도착메시지 | 실시간 도착정보 |
| **버스위치정보조회 15000332** | `buspos/getBusPosByRouteSt` | 구간 차량 `tmX/tmY`·`sectOrd`·`stopFlag` | 구간 차량 위치 |
| | `buspos/getBusPosByRtid` | 노선 전체 차량(+`gpsX/gpsY`) | 노선 전체 차량 |
| **노선정보조회 15000193** | `busRouteInfo/getRoutePath` | 형상 점 `no`+좌표 | 노선 폴리라인 |
| | `busRouteInfo/getStaionByRoute` | 경유 정류소 `seq`·`station`·`direction`·`transYn` | 경유 정류소 |
| | `busRouteInfo/getRouteInfo` | `busRouteAbrv`·`routeType`·기점/종점·배차·운행시간·운수사 | 노선 기본정보 |

도착정보는 별도의 **버스도착정보조회 15000314** 데이터셋이 있으나 `getStationByUid` 로 완결되므로 쓰지 않는다. `getStaionByRoute` 는 서울시 원문 오타('Staion') 그대로 호출한다 — 어댑터가 오타를 보존한다([bus-api.adapter.ts](../../apps/friendly/src/modules/bus/bus-api.adapter.ts) line 553).

### 좌표 정규화 — 필드명 불신, 값 범위 판정

서울시 응답은 좌표계가 필드마다 섞여 있다 — `tmX/tmY` 필드명에 실제로는 WGS84 경위도, `posX/posY` 에 GRS80 TM, `getBusPosByRtid`·`busRouteInfo` 는 `gpsX/gpsY` 에 WGS84. 필드명을 믿지 않고 `toLatLng` 가 후보 쌍 `[tmX,tmY]→[gpsX,gpsY]→[posX,posY]` 를 순회하며 **WGS84 한국 값 범위(lat 33~39, lng 124~132)에 드는 첫 쌍을 채택**한다. WGS84 쌍이 항상 존재하므로 proj4(TM→WGS84 변환)가 불필요하다 — probe:bus 실측(2026-07-02/04)으로 확정했다. 이 값 범위는 계약의 zod 제약(`z.number().min(33).max(39)`)과 코드 상수가 동일해, TM 값이 새면 직렬화에서 막힌다.

### 실시간 레이어 — 폴링 + 클라이언트 보간 (SSE 아님)

실시간 도착·위치는 **SSE 가 아니라 React Query `refetchInterval` 폴링**이다(도착 30초, 위치 15초). `refetchIntervalInBackground` 기본 false 라 탭이 비활성이면 폴링이 자동 중단돼 쿼터를 아낀다. 15초 간격의 위치 점프를 부드럽게 잇기 위해 [MapCanvas](../../apps/web/src/components/restaurant/MapCanvas.tsx)가 클라이언트에서 **등속 tween 보간**을 하고, 노선 형상이 있으면 [routePath.ts](../../packages/utils/src/routePath.ts)로 도로를 따라가는 경유 웨이포인트(`via`)를 계산해 직선이 아닌 도로 위로 이동시킨다.

### 기능 단계 (1~8차)

| 차수 | 내용 | 대표 커밋 |
|---|---|---|
| 1차 | 정류장 키워드 검색 + 지도 | (초기) |
| 2차 | 실시간 도착정보 + 지도 버스 위치 | |
| 3차 | 좌표 기반 주변 정류장 + 지도 재검색·자동 조회(셀 캐시) | |
| 4차 | 즐겨찾기 (게스트 로컬 + 로그인 서버 하이브리드) | |
| 5차 | 노선 보기 (폴리라인 + 경유 정류소 + 운행정보) | `b471d5f` |
| 6차 | 실시간 차량 마커(노선번호 알약 + 이동 보간) + 노선 형상 따라가기 | `c15be28`·`f757817` |
| 7차 | 노선 전체 차량 + 진행 방향 화살표 | `dbf211a` |
| 8차 | 실시간 따라가기 토글(카메라 추적) + 대상 강조 | `e878288` |

8차 이후는 버스 단독이 아니라 **대중교통(버스+지하철) 통합** 트랙이라 번호 체계가 지하철과 공유된다(지하철 1~12차 뒤 통합 13~15차). 버스 화면을 건드린 통합 라운드:

| 라운드 | 버스 쪽 변경 | 대표 커밋 |
|---|---|---|
| 탭 전환 뷰포트 이어보기(A안) | `BusStationsMap` 이 `transitMapViewport` 싱글턴에서 초기 뷰 복원 + moveend 저장 | `de382a0` |
| 지도 D안 — OL 인스턴스 풀링 | `poolKey` opt-in 으로 탭 전환 타일 플래시 제거(`transit-desktop`/`transit-mobile`) | `4128d6b` |
| 통합 13차 — 통합 즐겨찾기 홈 | `BusFavoriteSection` 삭제 → `TransitFavoritesSection`(버스+지하철 공용) | `6a3e337` |
| 통합 14차 — 주변 겸표시 | 주변 모드에 지하철역 오버레이 마커(`overlayMarkers`, `x-subway:` 딥링크) | `8a48b49` |
| 통합 15차 — 크로스 검색 | 검색 결과 하단 `SubwayCrossSection`(제출 q 자동 크로스) + 리스트 `crossSearchContent` 슬롯 | `dd1a9fe` |

통합 화면 전반(공용 스토어·탭·양방향 딥링크 대칭)은 [transit](transit.md), 지하철 쪽 짝은 [subway](subway.md).

## Talks To [coverage: high — 21 sources]

- **서울시 버스 API (`http://ws.bus.go.kr/api/rest/...`)** — 평문 HTTP, GET, `serviceKey` + 파라미터 쿼리스트링. XML 응답을 `fast-xml-parser` 로 파싱. friendly 만 호출하고 브라우저는 직접 접근하지 않는다(CORS 없음).
- **friendly DB (Prisma/SQLite)** — `bus_stations`·`bus_station_searches`·`bus_station_search_hits`·`bus_favorite_stations`·`bus_favorite_routes`·`bus_route_shapes`(+ 2026-07-13 드랍된 `bus_nearby_cells`·`bus_nearby_cell_hits`). 상세는 Data 절.
- **[friendly](friendly.md) 공통 가드(2026-10-05)** — [lib/upstream-guard.ts](../../apps/friendly/src/lib/upstream-guard.ts)의 `DailyQuota`(버킷 4개)·`UpstreamCooldown`(서비스 3개)·`retryAfterSec`(쿨다운 503 문구)·`UPSTREAM_REQUEST_BUDGET_MS`(어댑터 8초). 그전 버스 서비스에 있던 `seoulDateKey` 날짜 포맷터도 이 파일로 옮겨 공용이 됐다. 부품 구조·다른 도메인 배분 비교는 [transit](transit.md) 의 "실시간 외부 API 공통 가드" 절. 레이트리밋 프리셋 `RATE.transitRealtime` 은 [rate-limit.ts](../../apps/friendly/src/plugins/rate-limit.ts).
- **map 도메인 (vworld)** — [BusStationsMap](../../apps/web/src/components/bus/BusStationsMap.tsx)이 `useMapPublicConfig` 로 vworld 공개 키를 받아 [MapCanvas](../../apps/web/src/components/restaurant/MapCanvas.tsx)에 넘긴다. 키 미등록(404)이면 placeholder. MapCanvas 의 차량 애니 레이어·`followVehicleId`·`routeLine` prop 은 버스가 처음 도입한 확장이고, 통합 라운드에서 `overlayMarkers`(fit 제외 겸표시 레이어)·`poolKey`(탭 전환 인스턴스 풀링) prop 이 더해졌다. 지도 인프라 전반·풀링/오버레이 상세는 [map](map.md).
- **`@repo/api-contract`** — `schemas/bus.ts`·`schemas/bus-favorite.ts`·`Routes.Bus`. zod SSOT 로 FE/BE 타입 일치(컨셉 [zod-ssot-buildless](../concepts/zod-ssot-buildless.md)).
- **`@repo/shared`** — `busApi`·`busFavoriteApi`(API 클라이언트), `useBus`·`useBusFavorites`(React Query 훅), `busFavoriteStore`(zustand persist). 통합 화면 때문에 BusPage 가 지하철 훅 `useSubwayNearbyStations`(겸표시 조회, 로컬 DB 라 쿼터 0)·`useSubwayFavorites`(통합 즐겨찾기)도 함께 호출한다 — 각 훅 페이지당 1회 규칙.
- **transit 공용 UI/스토어 (`apps/web/src/components/transit`, `stores`)** — [TransitTabs](../../apps/web/src/components/transit/TransitTabs.tsx)(서브탭), [TransitFavoritesSection](../../apps/web/src/components/transit/TransitFavoritesSection.tsx)(양 도메인 즐겨찾기 홈), [CrossSearchSection](../../apps/web/src/components/transit/CrossSearchSection.tsx)의 `SubwayCrossSection`(검색 결과 하단 크로스), [TransitCrossToggleChip](../../apps/web/src/components/transit/TransitCrossToggleChip.tsx)(겸표시 표시 토글), [transitCrossShowStore](../../apps/web/src/stores/transitCrossShowStore.ts)(겸표시 on/off persist), [transitMapViewport](../../apps/web/src/components/transit/transitMapViewport.ts)(탭 전환 뷰포트 싱글턴). 버스·지하철 양 탭이 공유 — 규약은 [transit](transit.md).
- **`@repo/utils`** — `busMarker.ts`(마커/알약/화살표/점 SVG), `markerFrame.ts`(식당 마커와 공용 핀/원 골격), `routePath.ts`(형상 투영·슬라이스·방위각). 차량 알약·방향 다트 기하 코어는 [vehiclePill.ts](../../packages/utils/src/vehiclePill.ts) 로 추출돼 지하철 열차 마커와 공용이다 — `busMarker.ts` 는 기존 `buildBusVehiclePill*`/`buildBusVehicleDir*` 이름을 그대로 export 하되 바이트 동일 산출로 위임한다(호출처 무변경).
- **auth (`authStore` / `app.authenticate`)** — 즐겨찾기 라우트만 Bearer 인증. 401 로 세션이 끊기면 훅이 자연히 게스트 모드로 폴백. 공개/소유자 라우트 분리는 컨셉 [public-admin-route-split](../concepts/public-admin-route-split.md)의 "소유자 vs 공개" 결과 같은 결.
- **probe:bus 스크립트** — [scripts/probe-bus-api.ts](../../apps/friendly/scripts/probe-bus-api.ts). 코드에 박힌 추정(키 형태·좌표계·headerCd·JSON 지원)을 실응답으로 확정하는 1회성 진단 도구(`pnpm --filter friendly probe:bus [키워드]`). `env.ts` 전체 검증을 거치지 않고 `process.env.DATA_GO_KR_API_KEY` 만 직접 읽는다(2026-09-02 부터 — 이전엔 `BUS_API_KEY`).
- **`toServiceKeyPart` 공유 의존(2026-08~09)** — [bus-api.adapter.ts](../../apps/friendly/src/modules/bus/bus-api.adapter.ts)의 data.go.kr Encoding 키 raw 직결 헬퍼가 이제 **5개 모듈·6파일**에서 cross-module import 된다: [air-quality/airkorea-api.adapter.ts](../../apps/friendly/src/modules/air-quality/airkorea-api.adapter.ts)·[weather/kma-api.adapter.ts](../../apps/friendly/src/modules/weather/kma-api.adapter.ts)·[food/food-api.adapter.ts](../../apps/friendly/src/modules/food/food-api.adapter.ts)·[life-map/hira-hospital.adapter.ts](../../apps/friendly/src/modules/life-map/hira-hospital.adapter.ts)·집값 [housing/rtms.adapter.ts](../../apps/friendly/src/modules/housing/rtms.adapter.ts)·[housing/datago-json.adapter.ts](../../apps/friendly/src/modules/housing/datago-json.adapter.ts)(2026-08-30 `254fb76`). 버스 어댑터의 이 함수를 손보면(특히 `%XX` 판정) 대기·날씨·음식·병의원 적재·집값 실거래 수집까지 함께 움직인다([air-quality](air-quality.md)·[weather](weather.md)·[food](food.md)·[life-map](life-map.md)·[housing](housing.md)). 키 값도 2026-09-02 부터 전부 같은 `DATA_GO_KR_API_KEY` 다 — 활용신청만 데이터셋별.
- **일상지도 옴니박스 소비처(2026-08-21)** — [LifeGoToBox](../../apps/web/src/components/life-map/LifeGoToBox.tsx)(웹)·[LifeGoToModal](../../apps/mobile/src/components/lifeMap/LifeGoToModal.tsx)(앱)이 `useBusStationSearch` 를 타이핑 디바운스로 호출한다 — 대중교통 화면의 제출 게이트와 달리 2자 이상 입력이 멈출 때마다 발화(`useSubwayStationSearch`·`useLifeMapSearch` 와 나란히). 서버 30일 검색 캐시에 없는 새 키워드는 서울시 쿼터(2026-10-05 부터 `search` 버킷 하루 60)를 소비하므로 옴니박스 사용량이 곧 버스 검색 몫 소비다([life-map](life-map.md)). 디바운스는 웹이 2026-10-05 부터 버스만 **450ms**(`BUS_DEBOUNCE_MS`) + 끝 글자가 낱자모(`TRAILING_JAMO = /[ㄱ-ㅎㅏ-ㅣ]$/`)인 동안은 예약하지 않음(`useSettledBusQuery` — 직전 검색어 유지, 타이머는 외부 시스템 동기화라 effect), 지하철·지역 검색은 250ms(`REMOTE_DEBOUNCE_MS`) 그대로. 앱 `LifeGoToModal` 은 버스도 250ms·낱자모 대기 없음(웹만 바뀜).

## API Surface [coverage: high — 10 sources]

**HTTP — 공개 라우트 ([bus.route.ts](../../apps/friendly/src/modules/bus/bus.route.ts), 인증 없음):**

| 라우트 | 쿼리/파라미터 | 응답 | 캐시 | 쿼터 버킷(일) · 쿨다운 서비스 |
|---|---|---|---|---|
| `GET Routes.Bus.stationSearch` | `q`(2~50자, NFC), `force`(bool) | `BusStationSearchResult` | DB 30일(실패·쿨다운 시 만료본 stale) | `search` 60 · stationinfo |
| `GET Routes.Bus.stationsNearby` | `lat`·`lng`(WGS84), `radius`(50~1000, 기본 500) | `BusNearbyResult` | 로컬 정류장 마스터(`source:'db'`, 2026-07-13~ — 그전 셀 격자 30일) | 0(업스트림 없음) |
| `GET Routes.Bus.stationArrivals(:arsId)` | `arsId`(1~5자리, '0' 금지) | `BusArrivalsResult` | 15초 마이크로캐시 + in-flight, 10분 last-known stale | `arrivals` 510 · stationinfo |
| `GET Routes.Bus.busPositions(:busRouteId)` | `startOrd`/`endOrd`(둘 다 또는 둘 다 생략) | `BusPositionsResult` | 15초 마이크로캐시 + in-flight, 10분 last-known stale | `positions` 240 · buspos |
| `GET Routes.Bus.routeDetail(:busRouteId)` | — | `BusRouteDetailResult` | DB 30일 + in-flight, '노선 없음' 24h 네거티브(LRU 2,000) | `route` 90(요청당 3) · busRouteInfo |

업스트림을 부르는 네 라우트(검색·도착·위치·노선)는 `RATE.transitRealtime`(IP 60/분) — `stationSearch`·`routeDetail` 은 2026-10-05 에 프리셋이 새로 걸렸다(그전 전역 1000/분만, E-1). 로컬 DB 만 읽는 `stationsNearby` 는 전역 한도뿐이다. 버킷이 바닥나면 그 기능만 503("서울시 버스 API 일일 호출 한도를 소진해…", 캐시가 있으면 stale)이고 다른 버킷은 산다. 쿨다운 중이면 업스트림·쿼터 없이 stale 또는 503("…잠시 조회를 멈췄습니다. N초 뒤…").

**HTTP — 즐겨찾기 라우트 ([bus-favorite.route.ts](../../apps/friendly/src/modules/bus/bus-favorite.route.ts), Bearer 인증 필수):**

| 라우트 | 메서드 | 응답 |
|---|---|---|
| `Routes.Bus.favorites` | GET | `BusFavoritesResult`(전체 목록) |
| `Routes.Bus.favoriteStation(:stId)` | PUT / DELETE | `BusFavoritesResult`(변경 후 전체 목록) |
| `Routes.Bus.favoriteRoute(:stId, :busRouteId)` | PUT / DELETE | `BusFavoritesResult` |
| `Routes.Bus.favoritesSync` | POST | `BusFavoritesResult`(union 병합 후) |

변경 계열(PUT/DELETE/sync)은 diff 대신 **변경 후 전체 목록**을 반환해 클라이언트가 캐시를 통째로 교체한다. DELETE 는 `deleteMany` 로 멱등, PUT 은 신규 추가 시에만 상한(`BUS_FAVORITES_MAX = 100`) 검사(초과 시 400).

라우트는 error-handler 플러그인이 `statusCode >= 500` 을 일괄 500 으로 뭉개므로, 의미 있는 **502(업스트림 실패)·503(키 미설정·인증 실패·쿼터 소진)** 은 핸들러가 직접 `reply.code().send()` 로 응답한다(공용 `ErrorResponseSchema` 등록).

**Zod 계약 ([bus.ts](../../packages/api-contract/src/schemas/bus.ts) · [bus-favorite.ts](../../packages/api-contract/src/schemas/bus-favorite.ts)):**

| Schema | 형태 요약 |
|---|---|
| `BusStationSearchQuery` | `{ q(NFC transform, 2~50), force(union bool/'true'/'false') }` |
| `BusStationItem` | `{ stId, arsId, name, lat(33~39), lng(124~132) }` |
| `BusStationSearchResult` / `BusNearbyResult` | `{ items, total, fetchedAt, source: 'cache'\|'api'\|'stale' }` |
| `BusNearbyQuery` / `BusNearbyItem` | `lat/lng/radius(coerce)` / `BusStationItem + dist` |
| `BusArrivalsParams` | `arsId` regex `^\d{1,5}$` + `'0'` refine 거부 |
| `BusArrivalItem` / `BusArrivalEntry` | `{ busRouteId, routeName, staOrd\|null, first/second }` / `{ vehId\|null, message }` |
| `BusPositionsQuery` | `startOrd`/`endOrd` 페어 refine(둘 다/둘 다 생략) + 구간 ≤ 50 |
| `BusPositionItem` | `{ vehId, plainNo\|null, lat, lng, sectOrd\|null, stopFlag\|null }` |
| `BusRouteDetailResult` | `{ busRouteId, info, path[], stations[], fetchedAt, source }` |
| `BusRouteInfo` | `{ routeName, routeType, st/edStationName, lengthKm\|null, termMin\|null, first/lastBusTime\|null, corpName\|null }` |
| `BusRouteStationItem` | `{ seq, stId, arsId, name, lat, lng, direction, isTurnPoint }` |
| `BusFavoriteStationItem` / `BusFavoriteRouteItem` | 정류장 스냅샷 / `+ busRouteId·routeName·stationName` |

**FE hooks ([useBus.ts](../../packages/shared/src/hooks/useBus.ts) · [useBusFavorites.ts](../../packages/shared/src/hooks/useBusFavorites.ts)):**

- `useBusStationSearch(q)` — `enabled = 2~50자`, `staleTime 24h`. 제출형(호출자가 Enter/버튼으로 확정).
- `useBusNearbyStations(lat, lng, radius?)` — 좌표 키 소수 4자리 스냅(≈11m), `staleTime 60s`.
- `useBusStationsRefresh()` — `force=true` 뮤테이션. 성공 시 `cancelQueries` 후 `setQueryData` 로 같은 키 직접 교체.
- `useBusStationArrivals(arsId)` — `enabled = arsId && arsId!=='0'`, `refetchInterval 30s`, `staleTime 0`.
- `useBusPositions(busRouteId)` — `refetchInterval 15s`. 노선 전체(`getBusPosByRtid`) 조회.
- `useBusRouteDetail(busRouteId)` — `staleTime 24h`, 폴링 없음(형상 정적).
- `useBusFavorites()` — 게스트/로그인 하이브리드 단일 인터페이스(아래 Key Decisions 절). 서버 목록이 아직 없을 때 빈 배열을 모듈 상수(`EMPTY_STATIONS`·`EMPTY_ROUTES`)로 돌려준다(2026-10-05 — 소비처 memo·effect 가 렌더마다 다시 돌지 않게).

**마커 SVG 빌더 ([busMarker.ts](../../packages/utils/src/busMarker.ts)):**

```ts
buildBusStopMarkerDataUrl(selected)         // 파란 정류장 핀/원 (markerFrame 공용 골격)
buildBusVehiclePillDataUrl({ label, color, stopped?, highlighted? })  // 노선번호 알약(꼬리 끝=좌표)
buildBusVehicleDirDataUrl(color)            // 진행 방향 다트(북 기준, 지도가 방위각 회전)
buildBusRouteStopDotDataUrl(color)          // 경유 정류소 작은 점(16×16)
buildMyLocationMarkerDataUrl()              // 파란 점(조회 기준점)
busRouteTypeColor(routeType)                // 1공항/2마을/3간선/4지선/5순환/6광역 → 색
```

차량 알약(`buildBusVehiclePill*`)·방향 다트(`buildBusVehicleDir*`)는 이제 자체 구현이 아니라 [vehiclePill.ts](../../packages/utils/src/vehiclePill.ts)의 `buildVehiclePill*`/`buildVehicleDir*` 를 그대로 재수출한 것이다(`BusVehiclePillOptions = VehiclePillOptions`). 지하철 열차 마커가 같은 규격을 쓰면서 기하 코어를 공용화했고, 산출 SVG 는 바이트 동일이라 `BusStationsMap` 의 알약 memo·OL 아이콘 캐시 동작은 바뀌지 않는다.

**형상 투영 유틸 ([routePath.ts](../../packages/utils/src/routePath.ts)):** `createRoutePathIndex(points)` → `projectOnRoutePath(index, p, sMin?, sMax?)`(호길이 s 윈도우 투영) / `pointAtRoutePathS` / `bearingAtRoutePathS`(전진 접선 방위각) / `sliceRoutePath(s0, s1)`(경유 웨이포인트).

## Data [coverage: high — 8 sources]

전부 [schema.prisma](../../apps/friendly/prisma/schema.prisma)에 정의되고 마이그레이션 4개로 쌓였다.

**정류장 캐시** ([20260612102026_add_bus_station_cache](../../apps/friendly/prisma/migrations/20260612102026_add_bus_station_cache/migration.sql)):
- `BusStation`(`bus_stations`) — **PK = `stId`**(9자리 고유 ID). `arsId='0'` 가상정류장이 여럿이라 `arsId` 는 PK/unique 불가. 좌표는 어댑터가 WGS84 정규화한 값만 저장. `@@index([arsId])`.
- `BusStationSearch`(`bus_station_searches`) — `keyword`(trim+NFC) unique, `fetchedAt`. 빈 결과도 행을 남긴다(네거티브 캐싱).
- `BusStationSearchHit`(`bus_station_search_hits`) — 검색↔정류소 조인, `rank` 로 서울시 응답 순서 보존. `@@id([searchId, stId])`.

**주변 셀 캐시 — ⚠️ 폐기됨(2026-07-13 `b0c4f0a`, 테이블 드랍·마스터 로컬화로 대체. 아래는 역사 기록)** ([20260704074500_add_bus_nearby_cell_cache](../../apps/friendly/prisma/migrations/20260704074500_add_bus_nearby_cell_cache/migration.sql)):
- `BusNearbyCell`(`bus_nearby_cells`) — `cellKey`(예: `"37.495,127.025"`) unique. 쿼리 좌표를 **0.005°≈550m 격자**에 스냅해 셀 단위로 캐싱. 업스트림은 셀 중심에서 고정 반경 1500m 로 1회 수집해, 셀 내 어떤 쿼리(반경 ≤1000m)에도 재사용. `dist` 는 지점마다 달라 저장하지 않고 서빙 시 정류소 좌표로 재계산.
- `BusNearbyCellHit`(`bus_nearby_cell_hits`) — 셀↔정류소 조인, `rank`. `@@id([cellId, stId])`.

**즐겨찾기** ([20260704120000_bus_favorites](../../apps/friendly/prisma/migrations/20260704120000_bus_favorites/migration.sql)):
- `BusFavoriteStation`(`bus_favorite_stations`) — `(userId, stId)` unique. 정류장 스냅샷(`name/lat/lng`) 저장.
- `BusFavoriteRoute`(`bus_favorite_routes`) — `(userId, stId, busRouteId)` unique. `routeName/stationName/arsId/lat/lng` 스냅샷.
- **캐시 테이블 `BusStation` 을 FK 로 참조하지 않는다** — 도입 당시 그건 전 정류장 마스터가 아니라 검색/주변 조회로 우연히 캐시된 부분집합이라, FK 로 묶으면 캐시 정리가 즐겨찾기를 깨뜨렸다. 2026-07-13 `load:bus-stations` 로 마스터(11,248행)가 적재된 뒤에도 재적재가 즐겨찾기를 깨지 않도록 FK 없음을 유지한다(스냅샷 내성 — 지하철과 같은 규율).

**노선 상세** ([20260704130000_bus_route_shapes](../../apps/friendly/prisma/migrations/20260704130000_bus_route_shapes/migration.sql)):
- `BusRouteShape`(`bus_route_shapes`) — **PK = `busRouteId`**. 정규화된 `{ info, path, stations }` JSON 을 `payload` 한 컬럼에. 노선 단위 원자 조회라 정규화 테이블 없이 blob. `getRoutePath` 는 1,986점(141번)까지 나오지만 형상이 정적이라 30일 캐시로 감당.

**게스트 로컬 저장** ([busFavoriteStore.ts](../../packages/shared/src/stores/busFavoriteStore.ts)) — 비로그인 즐겨찾기는 zustand persist(`name: 'bus-favorites-v1'`). 웹은 `localStorage` 자동, 앱은 `setBusFavoriteStorage(AsyncStorage)` 주입(reviewAskStore 와 같은 lazy resolver 패턴). 등록순 배열, 상한 100(`BUS_FAVORITES_MAX` — 2026-10-05 `da755684` 로 스키마 파일에서 zod 없는 [constants.ts](../../packages/api-contract/src/constants.ts)로 옮겨져 FE 스토어가 값으로 import 해도 zod 가 첫 로드에 실리지 않는다).

**서버 메모리 상태(`BusService` 인스턴스, 라우트 플러그인당 1개)** — DB 밖에 남는 것. 재시작하면 전부 초기화(단일 인스턴스 전제, Redis 금지).

| 필드 | 키 | 상한·수명 |
|---|---|---|
| `inflight` (Map) | 검색 키워드 | 진행 중에만 |
| `realtimeCache` / `realtimeInflight` (Map) | `arrivals:<arsId>` · `positions:<busRouteId>:<start>:<end>` | 15초 TTL, 만료 엔트리는 last-known 재료로 남기고 미스 때 10분(stale 상한) 넘긴 것만 청소 |
| `routeInflight` (Map) | `busRouteId` | 진행 중에만(2026-10-05) |
| `routeNotFound` (LRU 2,000) | `busRouteId` → 풀리는 시각 ms | 24h(2026-10-05) |
| `quota` (`DailyQuota`) | `search`·`arrivals`·`positions`·`route` | KST 자정 리셋(2026-10-05 — 그전 `{dateKey, count}` 하나) |
| `cooldown` (`UpstreamCooldown`) | `stationinfo|search:…` 등 키 LRU 5,000 + 서비스 3개 | 키 30초→5분 백오프 / 서비스 5분→1시간, 성공 시 리셋(2026-10-05) |

## Key Decisions [coverage: high — 10 sources]

- **2026-10-05(`fd957320`): 쿼터 900 은 총량 그대로 두고 오퍼레이션별 버킷으로 쪼갠다 — 남용한 기능만 멈추게.** 단일 카운터에선 레이트 프리셋조차 없던 노선 상세·검색을 무인증으로 300~900회 부르면 실시간 도착·위치까지 하루 정지했다(E-1). 프리셋(60/분)만으로는 5분이면 되는 공격이라 부족하고, IP 예산은 CORS `*`·IP 분산에 약하다 — 핵심은 카운터 분리였다(발견 원문의 수정안 (2)). 배분(검색 60·도착 510·위치 240·노선 90)은 화면 호출 모형 기준이고, 업스트림 실한도가 data.go.kr 서비스별이라 서비스 합계(stationinfo 570)도 그 안에 둔다. 같은 가짜 id 반복은 버킷보다 앞에서 24시간 네거티브 캐시로 0쿼터, 서로 다른 가짜 id 순회는 `route` 버킷 90 에서 멈춘다. 실패 쿨다운의 서비스 단위도 활용신청 단위(정류소정보·버스위치·노선정보)로 잡아 인증 오류가 버스위치까지 막지 않게 했다. 구조는 [transit](transit.md), 배분 결정은 PLAN 6차 "결정 필요: 서비스별 쿼터 배분 수치" 의 답.
- **2026-09-02(`3d9dfed`): 키 이름을 `DATA_GO_KR_API_KEY` 하나로 — 도메인별 키 + `BUS_API_KEY` 폴백 체인 폐기.** data.go.kr 는 계정당 키가 1개고 데이터셋별로 활용신청만 추가하는 구조라, 도메인마다 env 항목을 두고 "비우면 버스 키로 폴백" 하는 방식은 항목 5개가 전부 같은 값이거나 비어 있는 상태를 낳았다(집값이 세 데이터셋을 더 붙이면서 한계). 이름 하나로 접고 어디에 쓰이는지(데이터셋 번호·쿼터·프로브 명령)는 `env.ts`·`.env.example` 주석 한 곳에 목록화했다. 코드 변경은 이름 치환뿐(어댑터·캐시·쿼터 로직 무변경). 대가는 운영 `.env` 의 이름 변경이 필수라는 것.
- **serviceKey raw 직결 — URLSearchParams 금지.** data.go.kr "Encoding 키"(`%XX` 시퀀스 포함)를 `URLSearchParams` 에 넣으면 이중 인코딩돼 인증에러(`returnReasonCode 30`). `toServiceKeyPart` 가 `%XX` 있으면 raw, 없으면 `encodeURIComponent` 하고, 일반 파라미터만 `URLSearchParams` 로 처리한다. 로깅엔 키 평문 URL 을 절대 싣지 않고 `***` 마스킹본(`requestUrl`)만 남긴다.
- **좌표계는 필드명이 아니라 값 범위로 판정 — proj4 불필요.** `toLatLng` 가 WGS84 한국 범위에 드는 첫 쌍 채택. 계약 zod 범위와 상수가 동일해 코드로 강제된다. 전량 정규화 실패(`raw.length>0 && stations.length===0`)는 **TM-only 응답 신호**로 보고 502 를 내되 빈 결과로 30일 박제하지 않는다(만료 캐시 있으면 stale 우선).
- **캐시 TTL — 정적은 30일, 실시간은 15초.** 정류소 정보는 거의 안 바뀌어 검색/노선은 30일 DB 캐시(주변은 2026-07-13 부터 로컬 마스터라 캐시 개념 없음). 도착/위치는 처음엔 무캐싱 프록시였고, 2026-07-13 부터 15초 마이크로캐시 + in-flight + 10분 last-known stale(서울시 503 장애 계기). `force` 강제 갱신이라도 60초 내 재수집은 캐시로 응답(갱신 버튼 연타 방어).
- **일일 쿼터 게이트 — 인메모리 카운터(~2026-10-05 단일, 이후 오퍼레이션 버킷).** Asia/Seoul 날짜 경계로 리셋, 총량 900(개발계정 1,000에서 여유). 한도 초과 시 소비 없이 503 throw(캐시 있는 경로는 stale 폴백). 동일 키워드·노선·실시간 키 동시 요청은 in-flight 합류로 업스트림 1회만. 단일 인스턴스 전제의 모듈 싱글턴 게이트 — 컨셉 [in-memory-singleton-gates](../concepts/in-memory-singleton-gates.md)·[quota-proportional-loading](../concepts/quota-proportional-loading.md). 노선 상세는 3콜분 쿼터를 **한 번에** 확보해(`consume('route', now, 3)` — 그전엔 `consumeQuota` 3연속) 중간 소진으로 1콜만 하고 실패하는 걸 막는다.
- **즐겨찾기 하이브리드 — 게스트 로컬 + 로그인 서버.** 게스트는 `busFavoriteStore`(zustand persist), 로그인은 서버 목록을 React Query 로. 로그인 직후 게스트 저장분을 서버로 **union 병합(sync 1회)** — 서버에 없는 항목만 insert, 있으면 서버 값 유지, 상한 초과분은 조용히 skip(병합이 에러로 끊기면 안 됨). sync 는 외부 시스템 동기화라 `useBusFavorites` 가 `useEffect` 로 발사(`syncedRef` StrictMode 재진입 가드). 파생 판정(`isFavorite`)은 렌더 중 계산.
- **실시간은 폴링 — SSE 아님.** 도착 30초·위치 15초 `refetchInterval`, `refetchIntervalInBackground` false 로 탭 비활성 시 자동 중단. 위치 조회는 구간(`getBusPosByRouteSt`)에서 **노선 전체(`getBusPosByRtid`)로 전환** — 업스트림 쿼터 비용이 같고(1콜), 도착정보 `staOrd` 를 기다릴 필요 없이 노선 선택 즉시 전 차량이 뜬다.
- **클라이언트 이동 보간 + 노선 형상 따라가기.** MapCanvas 가 폴링 간 위치를 등속 tween(기본 14초)으로 잇는다. 형상이 있으면 `routePath.ts` 로 이전→현재 위치의 도로 슬라이스(`via`)를 계산해 도로를 따라 이동. 형상이 **상·하행 왕복 한 줄**(첫점≈끝점)이라 좌표만으론 두 후보가 생기는데, 차량 `sectOrd` 와 정류소 `seq` 가 같은 순번 공간임을 이용해 호길이 s 윈도우로 모호성을 푼다. 진행 방향 화살표(7차)는 형상 접선 방위각으로 회전. 따라가기(8차)는 `followVehicleId` 를 매 프레임 `setCenter` 로 추적하되, 사용자가 지도를 조작하면 `onFollowInterrupted` 로 끊고 '다시 따라가기' 칩으로 재개(followId 유지, paused 만 토글).
- **Zod SSOT — buildless.** 계약 스키마 1개 변경이 FE/BE 컨슈머를 컴파일 타임에 동기화. `fastify-type-provider-zod` 가 검증 + OpenAPI 자동 생성. 컨셉 [zod-ssot-buildless](../concepts/zod-ssot-buildless.md).
- **URL 이 유일 진실.** BusPage 가 `q`·`stId`·`routeId`·`near` 를 URL 에 동기화 — 새로고침/공유/딥링크 시 Geolocation 재요청 없이 같은 화면 복원. 자동 재조회(패닝) 좌표만 로컬 상태(URL history 오염 방지).
- **통합 즐겨찾기 — 도메인별 섹션 삭제, 양 탭 공용(13차).** 버스 정류장/정류장×노선, 지하철 역/역×호선 4종을 초기 화면 한 목록(`TransitFavoritesSection`)으로 합쳤다 — 기존 `BusFavoriteSection` 은 **삭제**(대칭적으로 `SubwayFavoriteSection` 도). BusPage 는 `useBusFavorites`+`useSubwayFavorites` 를 각 1회 호출해 이 섹션에 넘긴다(`hasFavorites` = 네 목록 합집합 비어 있지 않음). '이동'은 자기 도메인이면 in-page 핸들러(기존 URL 계약) 재사용, 상대 도메인이면 `/subway?stn=` navigate — 새 URL 시맨틱을 만들지 않는다. 정렬은 도메인 단위 concat(항목별 `createdAt` 이 계약에 미노출이라 인터리브는 후속 과제).
- **주변 겸표시 — 상대 도메인 오버레이(14차).** 주변 모드에 지하철역을 청록·환승 이중링 마커로 함께 표시한다. 조회(`useSubwayNearbyStations`)는 주변 모드 && 집중 모드(노선 보기·따라가기) 아님이면 토글 off 여도 **항상 돌린다**(지하철 nearby 는 로컬 DB 라 쿼터 0 — 켤 때 즉시 표시하려고). **표시만** `transitCrossShowStore` 로 게이팅. 마커는 `MapCanvas.overlayMarkers`(별도 소스)로 넘겨 자기 정류장 `fitToMarkers` extent 를 안 넓힌다. id 는 `x-subway:` prefix — `handleMarkerSelect` 가 `x-` 를 다른 무시/선택 로직보다 먼저 가로채 `/subway?near=..&stn=` 딥링크로 라우팅(12차 `/bus` 딥링크와 대칭).
- **크로스 검색 — 검색 모드 한정, 로컬 DB 라 제출 게이트 불필요(15차).** 버스 검색 결과 하단에 `SubwayCrossSection`(제출 q 로 지하철역 자동 크로스). 지하철 검색은 로컬 DB(쿼터 0)라 타이핑 발화를 막을 필요가 없어 **제출된 q 를 그대로 자동 조회**한다(반대로 지하철 탭의 버스 크로스는 서울시 API 라 제출 게이트 — 대칭 아님). 리스트는 `crossSearchContent` 슬롯으로 결과 목록/빈 상태 뒤에 렌더하고, 주변/초기/선택 화면엔 미표시(`!nearMode && hasQ` 에서만 넘긴다).
- **탭 전환 지도 이어보기 — 뷰포트(A안) + 인스턴스 풀링(D안).** 버스↔지하철 탭 전환은 라우트 언마운트라 지도가 재생성돼 뷰가 리셋·타일이 플래시했다. `BusStationsMap` 이 `transitMapViewport` 싱글턴에서 초기 뷰를 복원하고 `moveend` 마다 저장(A안, 검색/선택 fit·flyTo 규칙 무변경)하고, `MapCanvas.poolKey` 로 OL Map 인스턴스 자체를 풀에 보관·재사용(D안, 타일 플래시 제거)한다. 도입 땐 데스크톱·모바일 지도 래퍼가 CSS 숨김으로 **동시 마운트**라 한 풀 키를 공유하면 한쪽만 재사용돼 키를 `transit-desktop`/`transit-mobile` 로 나눴고, 2026-10-05 한 벌 마운트 뒤에도 레이아웃별 키는 유지(`poolKey={isDesktop ? … : …}` — 같은 레이아웃끼리 이어받기). 풀링 메커니즘 상세는 [map](map.md), 한 벌 마운트 근거는 [transit](transit.md).

## Gotchas [coverage: high — 11 sources]

- **`.env` 의 `BUS_API_KEY` 는 2026-09-02 부터 무시된다(`3d9dfed`).** `env.ts` 스키마에서 항목이 사라져 zod 가 조용히 버리고 `DATA_GO_KR_API_KEY` 기본 `''` 로 떨어진다 — 증상은 "키가 있는데 버스 라우트 전부 503(`DATA_GO_KR_API_KEY 가 설정되지 않아…`)". 운영·로컬 `.env` 이름을 바꿔야 하고, 테스트의 `vi.hoisted` 주입·라이브 스모크 `runnable` 판정도 새 이름을 본다(플레이스홀더 `'test-bus-key'` 는 그대로).
- **인증 실패가 두 형태로 온다.** (1) `OpenAPI_ServiceResponse > cmmMsgHeader > returnReasonCode`, (2) `ServiceResult headerCd=7`("Key인증실패: … [인증모듈 에러코드(NN)]"). 어댑터가 둘 다 `BusApiAuthError`(503)로 분류하고, (2)는 `headerMsg` 에서 NN 을 정규식으로 뽑아 reasonCode 로 쓴다. '결과 없음'은 `headerCd=4`("결과가 없습니다.") — 에러 아니라 빈 목록.
- **`arsId='0'` 가상정류장.** 도착정보 조회 불가 — 계약이 `arsId '0'` 을 400 으로 거부하고, FE 훅(`enabled`)이 호출 자체를 막고, 리스트/패널이 번호 배지를 숨긴다. `stId` 가 진짜 식별자.
- **`vehId='0'` 은 도착예정 차량 없음.** 서비스가 null 로 정규화(`toArrivalEntry`). 메시지 자체가 없으면 항목이 없는 것.
- **`sectOrd` 순번 공간.** 도착정보 `staOrd` = 경유 정류소 `seq` = 형상 따라가기 윈도우의 축. 세 API 가 같은 순번 공간을 공유하는 게 형상 모호성 해소의 열쇠다.
- **`getBusPosByRouteSt` 응답의 `congetion`(혼잡도)은 서울시 필드명 자체가 오타** — 그대로 읽어야 함(HANDOFF 기록). 현재 코드는 이 필드를 쓰지 않는다.
- **`parseTagValue: false` 필수.** 숫자 자동 변환을 켜면 `arsId '02013'` 의 선행 0 이 소실된다. 숫자 필드는 `numOrNull` 로 명시 변환. `itemList` 는 `isArray` 로 항상 배열 강제(단건 응답이 객체로 떨어지는 함정 봉인).
- **fetch 타임아웃 사각.** `signal` 미지정 시 자체 AbortController(2026-10-05 부터 공용 `UPSTREAM_REQUEST_BUDGET_MS` 8초 — 그전 10초)를 걸되, `clearTimeout` 은 `res.text()` 완료 후 — fetch 직후 해제하면 헤더만 받고 본문이 매달리는 케이스(undici bodyTimeout ~300초)가 시간 상한 보호를 못 받는다. 서비스는 `signal` 을 넘기지 않으므로 이 상한이 늘 걸린다(signal 은 프로브용).
- **버스위치(15000332) 활용신청이 2026-12-27 만료 예정** — 운영하려면 만료 전 연장 신청 필요(HANDOFF 활용신청 표).
- **폴링 × 일 1,000건이 최대 운영 리스크.** 도착 30초 + 위치 15초 동시 폴링이면 사용자 1명이 시간당 수백 건(15초 마이크로캐시가 같은 키 동시 사용자를 흡수할 뿐). 2026-10-05 부터는 도착 510·위치 240 버킷이 따로라 위치 추적이 많은 날 위치만 먼저 503(캐시 있으면 10분 stale)이 되고 도착은 산다. 탭 비활성 중단은 필수고, 운영 전 트래픽 증설 신청 검토.
- **`search` 버킷은 하루 60 — 처음 보는 키워드 60개면 그날 검색이 멈춘다(2026-10-05~).** 버스 탭 제출 검색·`force` 갱신·지하철 탭의 버스 크로스 검색(`BusCrossSection`)·일상지도 옴니박스(웹 450ms·앱 250ms 디바운스)가 전부 이 60 을 나눠 쓴다. 30일 DB 캐시에 있는 키워드는 0콜이고, 소진 뒤엔 캐시된 키워드는 stale 로, 새 키워드는 503 "일일 호출 한도를 소진해…" — 옴니박스에선 빈 결과로만 보인다. 도착·위치는 영향 없음. 서비스 주석이 "운영 호출 수가 쌓이면 비율 보정" 을 남겼으니 검색 503 이 운영 로그에 보이면 배분을 다시 볼 자리다.
- **옴니박스 디바운스 검색은 제출 게이트를 우회한다(2026-08-21).** 일상지도 지역 이동 검색이 `useBusStationSearch` 를 디바운스 타이핑으로 부른다 — 훅의 `enabled`(2~50자)·`staleTime 24h`·서버 30일 캐시·in-flight 합류는 그대로지만, 캐시 미스마다 서울시 1콜이라 "한 글자씩 멈추며 치는" 입력은 키워드 수만큼 쿼터를 쓴다. 웹은 2026-10-05 부터 버스만 450ms + 조합 중 낱자모 대기로 중간 접두어("강ㄴ")를 덜 보내지만, 앱 `LifeGoToModal` 은 250ms·낱자모 대기 없음 그대로다.
- **실패 쿨다운 30초는 실제로는 ≈22초일 수 있다.** 쿨다운 기록이 조회 시작 시각 기준이라 8초 예산을 다 쓰고 실패하면 그만큼 짧다(6개 서비스 공통, 리뷰가 남긴 후속 — 세부는 [transit](transit.md) 의 Gotchas 절).
- **개발 환경 함정(HANDOFF).** 포트 3000 이중 바인딩(다른 dev 서버가 잡으면 엉뚱한 404), 브랜치 전환/rebase 후 `prisma generate` 필수(client 스키마 불일치면 `prisma.busStation` undefined), dev DB 에 vworld 키 미등록이면 지도는 placeholder(설계된 폴백, 리스트는 동작).
- **(~2026-10-05) 데스크톱·모바일 지도 동시 마운트 — 풀 키 분리의 원래 이유.** BusPage 는 데스크톱(`hidden xl:flex`)·모바일(`xl:hidden`) 지도 래퍼를 CSS 로만 숨겨 `MapCanvas` 를 페이지당 2개 살렸고, 풀 키가 하나면 `take` 시맨틱상 한쪽만 재사용돼 `transit-desktop`/`transit-mobile` 로 분리했다. 2026-10-05 `useIsDesktopXl` 한 벌 마운트로 지도는 하나뿐이고 키 분리는 레이아웃별 이어받기 단위로 남았다. 마운트된 채 창 폭이 xl 을 넘으면 지도는 살아남지만 처음 키로 반납된다([transit](transit.md) 의 Gotchas 절).
- **겸표시는 표시만 토글, 조회는 항상.** 주변 모드 && 비집중이면 토글 off 여도 `useSubwayNearbyStations` 는 계속 돈다(로컬 DB, 쿼터 0 이라 안전 — 켤 때 즉시 표시). 2026-07-13 부터는 버스 nearby 도 로컬 마스터(쿼터 0)라 지하철 탭의 버스 겸표시와 비용 특성이 같다(그전엔 셀 DB 캐시 + 미스 시 서울시 1콜).
- **겸표시 클릭은 `x-` prefix 로 가장 먼저 가로챈다.** `handleMarkerSelect` 가 `id.startsWith('x-')` 를 차량(`veh-`)·내 위치(`my-location`) 무시 로직보다 **앞에서** 처리해 상대 탭 딥링크로 보낸다. 새 특수 마커 id 를 추가할 때 이 순서를 깨면 겸표시 클릭이 정류장 선택으로 샌다.
- **차량 알약 빌더는 vehiclePill.ts 위임 — 산출은 바이트 동일.** `busMarker.ts` 의 `buildBusVehiclePill*` 은 이제 지하철과 공용인 `vehiclePill.ts` 재수출이다. 알약 기하를 바꾸면 지하철 열차 마커에도 반영된다(공용 코어) — 버스만 바꾸려면 재수출을 끊고 분기해야 한다.
- ~~앱 미구현~~ → **앱 대중교통 화면 존재(2026-07~).** 버스·지하철 통합 화면(탑승 모드·하차 알림 포함)이 `apps/mobile` 에 있다 — 이 문서의 웹 컴포넌트(BusPage·BusStationsMap·시트)는 공유하지 않고 `@repo/shared` 훅만 공유한다([transit](transit.md)·[mobile](mobile.md)). 게스트 즐겨찾기 storage 주입(`setBusFavoriteStorage`)도 앱 entry 에 배선됨.
- **모바일 시트 골격 함정(2026-08-22)** — `useMapSheets` 는 `useState` 선언들보다 앞에 호출(React Compiler 메모 검증), subBar 는 언마운트 시 `setSubBar(null)` 필수, 선택 flyTo 는 `bottomInset` 미적용이라 상세 시트(half)가 지점을 가릴 수 있다. 상세는 [transit](transit.md) 의 Gotchas 절.

## Sources [coverage: high — 66 sources]

**백엔드 (friendly)**
- [apps/friendly/src/modules/bus/bus-api.adapter.ts](../../apps/friendly/src/modules/bus/bus-api.adapter.ts) — *1콜 8초(`UPSTREAM_REQUEST_BUDGET_MS`, 2026-10-05)*
- [apps/friendly/src/modules/bus/bus.service.ts](../../apps/friendly/src/modules/bus/bus.service.ts) — *`BUS_QUOTA_LIMITS` 버킷·쿨다운·`routeNotFound` 24h·`routeInflight`(2026-10-05)*
- [apps/friendly/src/modules/bus/bus.route.ts](../../apps/friendly/src/modules/bus/bus.route.ts) — *검색·노선 상세에 `RATE.transitRealtime`, 노선 상세 description(2026-10-05)*
- [apps/friendly/src/modules/bus/bus-favorite.service.ts](../../apps/friendly/src/modules/bus/bus-favorite.service.ts)
- [apps/friendly/src/modules/bus/bus-favorite.route.ts](../../apps/friendly/src/modules/bus/bus-favorite.route.ts)
- [apps/friendly/src/modules/bus/bus.test.ts](../../apps/friendly/src/modules/bus/bus.test.ts) — *52건(버킷 분리·가짜 노선 네거티브·노선 in-flight·쿨다운·서비스 차단 신설)*
- [apps/friendly/src/lib/upstream-guard.ts](../../apps/friendly/src/lib/upstream-guard.ts) — *공용 DailyQuota·UpstreamCooldown·retryAfterSec·seoulDateKey(2026-10-05, 구조는 transit)*
- [apps/friendly/src/lib/upstream-guard.test.ts](../../apps/friendly/src/lib/upstream-guard.test.ts) — *5건*
- [apps/friendly/src/plugins/rate-limit.ts](../../apps/friendly/src/plugins/rate-limit.ts) — *`RATE.transitRealtime` 60/분*
- [apps/friendly/src/modules/bus/bus-api.adapter.test.ts](../../apps/friendly/src/modules/bus/bus-api.adapter.test.ts)
- [apps/friendly/src/modules/bus/bus-favorite.test.ts](../../apps/friendly/src/modules/bus/bus-favorite.test.ts)
- [apps/friendly/src/modules/bus/bus-api.live.test.ts](../../apps/friendly/src/modules/bus/bus-api.live.test.ts)
- [apps/friendly/scripts/probe-bus-api.ts](../../apps/friendly/scripts/probe-bus-api.ts)
- [apps/friendly/src/config/env.ts](../../apps/friendly/src/config/env.ts) — *`DATA_GO_KR_API_KEY`(2026-09-02 `3d9dfed`, 구 `BUS_API_KEY`) + 사용처·데이터셋 번호 주석*
- [apps/friendly/.env.example](../../apps/friendly/.env.example) — *공용 키 항목 하나 + 에러코드 30/12 판독 규칙*
- [apps/friendly/prisma/schema.prisma](../../apps/friendly/prisma/schema.prisma)
- [apps/friendly/prisma/migrations/20260612102026_add_bus_station_cache/migration.sql](../../apps/friendly/prisma/migrations/20260612102026_add_bus_station_cache/migration.sql)
- [apps/friendly/prisma/migrations/20260704074500_add_bus_nearby_cell_cache/migration.sql](../../apps/friendly/prisma/migrations/20260704074500_add_bus_nearby_cell_cache/migration.sql)
- [apps/friendly/prisma/migrations/20260704120000_bus_favorites/migration.sql](../../apps/friendly/prisma/migrations/20260704120000_bus_favorites/migration.sql)
- [apps/friendly/prisma/migrations/20260704130000_bus_route_shapes/migration.sql](../../apps/friendly/prisma/migrations/20260704130000_bus_route_shapes/migration.sql)

**계약 (api-contract)**
- [packages/api-contract/src/schemas/bus.ts](../../packages/api-contract/src/schemas/bus.ts)
- [packages/api-contract/src/schemas/bus-favorite.ts](../../packages/api-contract/src/schemas/bus-favorite.ts)
- [packages/api-contract/src/constants.ts](../../packages/api-contract/src/constants.ts) — *`BUS_FAVORITES_MAX`(2026-10-05 `da755684` 로 스키마에서 이동)*
- [packages/api-contract/src/routes.ts](../../packages/api-contract/src/routes.ts)

**공유 (shared)**
- [packages/shared/src/api/bus.api.ts](../../packages/shared/src/api/bus.api.ts)
- [packages/shared/src/api/bus-favorite.api.ts](../../packages/shared/src/api/bus-favorite.api.ts)
- [packages/shared/src/hooks/useBus.ts](../../packages/shared/src/hooks/useBus.ts)
- [packages/shared/src/hooks/useBusFavorites.ts](../../packages/shared/src/hooks/useBusFavorites.ts)
- [packages/shared/src/stores/busFavoriteStore.ts](../../packages/shared/src/stores/busFavoriteStore.ts)
- [packages/shared/src/hooks/useSubway.ts](../../packages/shared/src/hooks/useSubway.ts) — *useSubwayNearbyStations(겸표시 조회)*
- [packages/shared/src/hooks/useSubwayFavorites.ts](../../packages/shared/src/hooks/useSubwayFavorites.ts) — *통합 즐겨찾기*

**유틸 (utils)**
- [packages/utils/src/busMarker.ts](../../packages/utils/src/busMarker.ts)
- [packages/utils/src/vehiclePill.ts](../../packages/utils/src/vehiclePill.ts) — *차량 알약/방향 다트 공용 코어(지하철 열차와 공유), busMarker 가 재수출*
- [packages/utils/src/markerFrame.ts](../../packages/utils/src/markerFrame.ts)
- [packages/utils/src/routePath.ts](../../packages/utils/src/routePath.ts)

**웹 (web)**
- [apps/web/src/routes/BusPage.tsx](../../apps/web/src/routes/BusPage.tsx) — *useIsDesktopXl 한 벌 마운트·`near` memo·`EMPTY_*`·숨은 목록 시트 즐겨찾기 게이트(2026-10-05)*
- [apps/web/src/routes/BusPage.test.tsx](../../apps/web/src/routes/BusPage.test.tsx) — *6건(한 벌 마운트·폴링 리렌더 뒤 마커 참조 유지·fit 재발화 없음)*
- [apps/web/src/lib/useMediaQuery.ts](../../apps/web/src/lib/useMediaQuery.ts) — *useIsDesktopXl*
- [apps/web/src/components/bus/BusStationsMap.tsx](../../apps/web/src/components/bus/BusStationsMap.tsx) — *마커 memo 의존 `followStation`(2026-10-05)*
- [apps/web/src/components/bus/BusArrivalPanel.tsx](../../apps/web/src/components/bus/BusArrivalPanel.tsx)
- [apps/web/src/components/bus/BusFavoriteStar.tsx](../../apps/web/src/components/bus/BusFavoriteStar.tsx)
- [apps/web/src/components/bus/BusStationList.tsx](../../apps/web/src/components/bus/BusStationList.tsx) — *crossSearchContent 슬롯 추가, "일부만 표시" 메타 행 인라인(2026-08-22)*
- [apps/web/src/components/sheet/BottomSheet.tsx](../../apps/web/src/components/sheet/BottomSheet.tsx) — *모바일 목록/상세 시트(2026-08-22, 맛집 v2 와 공용)*
- [apps/web/src/components/sheet/useMapSheets.ts](../../apps/web/src/components/sheet/useMapSheets.ts) — *목록↔상세 스냅 조율, SHEET_PEEK_HEIGHT*
- [apps/web/src/components/PublicLayout.tsx](../../apps/web/src/components/PublicLayout.tsx) — *setSubBar/headerHeight — 모바일 탭·검색행을 상단바로*
- [apps/web/src/components/restaurant/MapCanvas.tsx](../../apps/web/src/components/restaurant/MapCanvas.tsx) — *overlayMarkers·poolKey 확장*
- [apps/web/src/components/transit/TransitTabs.tsx](../../apps/web/src/components/transit/TransitTabs.tsx) — *버스↔지하철 서브탭*
- [apps/web/src/components/transit/TransitFavoritesSection.tsx](../../apps/web/src/components/transit/TransitFavoritesSection.tsx) — *통합 즐겨찾기 홈(BusFavoriteSection 대체)*
- [apps/web/src/components/transit/CrossSearchSection.tsx](../../apps/web/src/components/transit/CrossSearchSection.tsx) — *SubwayCrossSection(검색 결과 하단 크로스)*
- [apps/web/src/components/transit/TransitCrossToggleChip.tsx](../../apps/web/src/components/transit/TransitCrossToggleChip.tsx) — *겸표시 표시 토글 칩*
- [apps/web/src/components/transit/transitMapViewport.ts](../../apps/web/src/components/transit/transitMapViewport.ts) — *탭 전환 뷰포트 이어보기 싱글턴(A안)*
- [apps/web/src/stores/transitCrossShowStore.ts](../../apps/web/src/stores/transitCrossShowStore.ts) — *겸표시 on/off persist*
- [apps/web/src/App.tsx](../../apps/web/src/App.tsx)
- [apps/web/src/components/PublicSidebar.tsx](../../apps/web/src/components/PublicSidebar.tsx)
- [apps/web/src/components/PublicTopBar.tsx](../../apps/web/src/components/PublicTopBar.tsx)

**교차 소비처 (2026-08)**
- [apps/web/src/components/life-map/LifeGoToBox.tsx](../../apps/web/src/components/life-map/LifeGoToBox.tsx) — *일상지도 옴니박스: useBusStationSearch 를 버스만 450ms + 낱자모 대기(`useSettledBusQuery`, 2026-10-05 — 그전 250ms)*
- [apps/mobile/src/components/lifeMap/LifeGoToModal.tsx](../../apps/mobile/src/components/lifeMap/LifeGoToModal.tsx) — *앱 옴니박스, 동일 훅·250ms 그대로*
- [apps/friendly/src/modules/air-quality/airkorea-api.adapter.ts](../../apps/friendly/src/modules/air-quality/airkorea-api.adapter.ts) — *toServiceKeyPart cross-module import*
- [apps/friendly/src/modules/weather/kma-api.adapter.ts](../../apps/friendly/src/modules/weather/kma-api.adapter.ts) — *toServiceKeyPart cross-module import*
- [apps/friendly/src/modules/food/food-api.adapter.ts](../../apps/friendly/src/modules/food/food-api.adapter.ts) — *toServiceKeyPart cross-module import*
- [apps/friendly/src/modules/life-map/hira-hospital.adapter.ts](../../apps/friendly/src/modules/life-map/hira-hospital.adapter.ts) — *toServiceKeyPart cross-module import*
- [apps/friendly/src/modules/housing/rtms.adapter.ts](../../apps/friendly/src/modules/housing/rtms.adapter.ts) — *toServiceKeyPart cross-module import(집값 실거래가, 2026-08-30)*
- [apps/friendly/src/modules/housing/datago-json.adapter.ts](../../apps/friendly/src/modules/housing/datago-json.adapter.ts) — *toServiceKeyPart cross-module import(K-apt·건축HUB JSON 게이트웨이)*

**배경 문서**
- `docs/HANDOFF-bus-station-search.md` — 핸드오프 문서(커밋하지 않는 로컬 문서라 리포에 없음, 링크 제거 2026-09-26)
- [docs/PLAN-perf-2.md](../../docs/PLAN-perf-2.md) — *6차(E-1·E-V2)·모듈 묶음 realtime·리뷰 반영 "남긴 것"*
- [docs/PLAN-perf-2-findings.md](../../docs/PLAN-perf-2-findings.md) — *E-1 원문(가짜 노선 id 300회 → 전 사용자 실시간 정지)·E-V2*
- [docs/api/README.md](../../docs/api/README.md) — *공용 쿼터 서술 "버스 약 900, 기능별로 나눠 센다"·쿨다운 503*
