---
topic: bus
type: codebase
last_compiled: 2026-07-07
source_count: 48
status: active
aliases: [seoul-bus, seoul-bus-api, ws-bus-go-kr, bus-station-search, getStationByName, getStationByPos, getStationByUid, getBusPosByRouteSt, getBusPosByRtid, getRoutePath, getStaionByRoute, getRouteInfo, bus-arrivals, bus-positions, bus-route-detail, bus-route-shape, bus-nearby-cell, nearby-cell-cache, bus-favorites, favorite-hybrid, toLatLng, serviceKey-encoding, service-key-double-encoding, bus-vehicle-pill, vehicle-marker, vehicle-interpolation, route-path-follow, bus-follow-toggle, busRouteTypeColor, daily-upstream-quota, negative-caching, virtual-station, arsId-zero, tmX-tmY-wgs84, transit-unified, transit-favorites, unified-favorites, transit-cross-search, subway-cross-section, cross-station-overlay, overlay-markers, x-subway-deeplink, transit-cross-show, transit-map-viewport, map-instance-pool, poolKey, transit-desktop-mobile, vehicle-pill-shared, transit-tabs]
---

# bus

서울시 버스 정보 API(`ws.bus.go.kr`)를 friendly 가 프록시하고, **웹**(`apps/web`)이 정류장 검색·실시간 도착정보·노선 보기·실시간 차량 추적을 그리는 도메인. **앱**(`apps/mobile`)에는 버스 화면이 없다 — 현재 웹 전용이다(검색으로 확인: `apps/mobile` 의 `bus` 매치는 전부 "business"/무관 문자열). 커밋 히스토리상 1차(정류장 검색+지도)부터 8차(실시간 따라가기 토글+대상 강조)까지가 버스 단독 단계였고, 이후 버스는 지하철과 함께 **대중교통(버스+지하철) 통합 화면**으로 접혔다 — `/bus` 와 `/subway` 가 상단 서브탭([TransitTabs](../../apps/web/src/components/transit/TransitTabs.tsx))으로 오가고, 초기 화면의 즐겨찾기·주변 겸표시·검색 결과 하단이 양 도메인을 함께 다룬다. 그 통합 라운드가 이 문서에 반영된 델타다(2026-07-07 기준): **통합 즐겨찾기**(도메인별 `BusFavoriteSection` **삭제** → [TransitFavoritesSection](../../apps/web/src/components/transit/TransitFavoritesSection.tsx) 로 대체), **주변 겸표시**(주변 모드에 지하철역 오버레이 마커), **크로스 검색**(검색 결과 하단 상대 도메인 섹션), **탭 전환 지도 이어보기**(뷰포트 이어보기 A안 + OL 인스턴스 풀링 D안). 지하철 쪽 짝·통합 화면의 공용 규약은 [transit](transit.md)·[subway](subway.md) 토픽. 1~2차의 WHY·API 키 체인·활용신청 현황은 [HANDOFF-bus-station-search.md](../../docs/HANDOFF-bus-station-search.md)에 정리돼 있으나 그 문서는 2차까지만 다룬다.

## Purpose [coverage: high — 6 sources]

버스 도메인은 세 가지를 웹에서 제공한다: (1) **정류장 찾기** — 키워드 검색([BusStationList](../../apps/web/src/components/bus/BusStationList.tsx)) 또는 좌표 기반 주변 정류장(Geolocation·지도 재검색), (2) **실시간 도착정보** — 선택 정류장의 노선별 도착 메시지("곧 도착", "12분후[4번째 전]") 30초 폴링, (3) **노선 보기 + 실시간 차량 추적** — 선택 노선의 형상 폴리라인·경유 정류소·기본정보 위에 전체 운행 차량을 15초 폴링으로 얹고, 차량 알약을 탭하면 카메라가 그 버스를 따라간다.

이 도메인 설계 전체를 관통하는 단 하나의 제약은 **서울시 개발계정 일 1,000건 호출 한도**다. 그 제약이 백엔드(30일 DB 캐시·셀 격자 캐시·일일 쿼터 카운터·in-flight 합류·네거티브 캐싱)부터 프론트(제출형 검색·`document.visibilityState` 가드 폴링·선택 시에만 조회)까지 관통한다. `ws.bus.go.kr` 는 **평문 HTTP 전용이고 CORS 도 없어** 브라우저가 직접 못 부른다 — friendly 프록시가 필수 인프라인 이유다.

접근 정책은 맛집 공개 지도와 동일하다: 검색·도착·위치·노선은 **비로그인 공개**, **즐겨찾기만 로그인 필요**(소유자 스코프). `BUS_API_KEY` 가 비어 있으면 모든 버스 라우트가 503 을 내고 기능이 비활성화된다.

## Architecture [coverage: high — 9 sources]

한 방향 레이어드 파이프라인이다. 저수준 어댑터가 서울시 XML 을 정규화하고, 서비스가 캐시·쿼터·정규화를 얹고, 라우트가 HTTP 상태로 변환하고, 계약(zod)이 FE/BE 를 컴파일 타임에 묶고, shared 가 API·훅·store 를, 웹 컴포넌트가 UI 를 담당한다.

```
웹 /bus (BusPage — q/stId/routeId/near URL 동기화) ── TransitTabs(버스↔지하철)
  ├─ 좌: BusStationList(+crossSearchContent 슬롯) | BusArrivalPanel
  │       └ 초기 화면: TransitFavoritesSection(버스+지하철 공용) · SubwayCrossSection(크로스 검색)
  └─ 우: BusStationsMap → MapCanvas (vworld OL + 차량 애니 + 폴리라인 + 겸표시 오버레이)
     │      poolKey='transit-desktop'|'transit-mobile' (탭 전환 인스턴스 풀링 D안)
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
  friendly: bus.route.ts / bus-favorite.route.ts  (HTTP 레이어)
            bus.service.ts / bus-favorite.service.ts (캐시·쿼터·정규화)
            bus-api.adapter.ts (callBusApi + 타입드 래퍼 9종)
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

## Talks To [coverage: high — 8 sources]

- **서울시 버스 API (`http://ws.bus.go.kr/api/rest/...`)** — 평문 HTTP, GET, `serviceKey` + 파라미터 쿼리스트링. XML 응답을 `fast-xml-parser` 로 파싱. friendly 만 호출하고 브라우저는 직접 접근하지 않는다(CORS 없음).
- **friendly DB (Prisma/SQLite)** — `bus_stations`·`bus_station_searches`·`bus_station_search_hits`·`bus_nearby_cells`·`bus_nearby_cell_hits`·`bus_favorite_stations`·`bus_favorite_routes`·`bus_route_shapes`. 상세는 [Data](#data-coverage-high--6-sources).
- **map 도메인 (vworld)** — [BusStationsMap](../../apps/web/src/components/bus/BusStationsMap.tsx)이 `useMapPublicConfig` 로 vworld 공개 키를 받아 [MapCanvas](../../apps/web/src/components/restaurant/MapCanvas.tsx)에 넘긴다. 키 미등록(404)이면 placeholder. MapCanvas 의 차량 애니 레이어·`followVehicleId`·`routeLine` prop 은 버스가 처음 도입한 확장이고, 통합 라운드에서 `overlayMarkers`(fit 제외 겸표시 레이어)·`poolKey`(탭 전환 인스턴스 풀링) prop 이 더해졌다. 지도 인프라 전반·풀링/오버레이 상세는 [map](map.md).
- **`@repo/api-contract`** — `schemas/bus.ts`·`schemas/bus-favorite.ts`·`Routes.Bus`. zod SSOT 로 FE/BE 타입 일치(컨셉 [zod-ssot-buildless](../concepts/zod-ssot-buildless.md)).
- **`@repo/shared`** — `busApi`·`busFavoriteApi`(API 클라이언트), `useBus`·`useBusFavorites`(React Query 훅), `busFavoriteStore`(zustand persist). 통합 화면 때문에 BusPage 가 지하철 훅 `useSubwayNearbyStations`(겸표시 조회, 로컬 DB 라 쿼터 0)·`useSubwayFavorites`(통합 즐겨찾기)도 함께 호출한다 — 각 훅 페이지당 1회 규칙.
- **transit 공용 UI/스토어 (`apps/web/src/components/transit`, `stores`)** — [TransitTabs](../../apps/web/src/components/transit/TransitTabs.tsx)(서브탭), [TransitFavoritesSection](../../apps/web/src/components/transit/TransitFavoritesSection.tsx)(양 도메인 즐겨찾기 홈), [CrossSearchSection](../../apps/web/src/components/transit/CrossSearchSection.tsx)의 `SubwayCrossSection`(검색 결과 하단 크로스), [TransitCrossToggleChip](../../apps/web/src/components/transit/TransitCrossToggleChip.tsx)(겸표시 표시 토글), [transitCrossShowStore](../../apps/web/src/stores/transitCrossShowStore.ts)(겸표시 on/off persist), [transitMapViewport](../../apps/web/src/components/transit/transitMapViewport.ts)(탭 전환 뷰포트 싱글턴). 버스·지하철 양 탭이 공유 — 규약은 [transit](transit.md).
- **`@repo/utils`** — `busMarker.ts`(마커/알약/화살표/점 SVG), `markerFrame.ts`(식당 마커와 공용 핀/원 골격), `routePath.ts`(형상 투영·슬라이스·방위각). 차량 알약·방향 다트 기하 코어는 [vehiclePill.ts](../../packages/utils/src/vehiclePill.ts) 로 추출돼 지하철 열차 마커와 공용이다 — `busMarker.ts` 는 기존 `buildBusVehiclePill*`/`buildBusVehicleDir*` 이름을 그대로 export 하되 바이트 동일 산출로 위임한다(호출처 무변경).
- **auth (`authStore` / `app.authenticate`)** — 즐겨찾기 라우트만 Bearer 인증. 401 로 세션이 끊기면 훅이 자연히 게스트 모드로 폴백. 공개/소유자 라우트 분리는 컨셉 [public-admin-route-split](../concepts/public-admin-route-split.md)의 "소유자 vs 공개" 결과 같은 결.
- **probe:bus 스크립트** — [scripts/probe-bus-api.ts](../../apps/friendly/scripts/probe-bus-api.ts). 코드에 박힌 추정(키 형태·좌표계·headerCd·JSON 지원)을 실응답으로 확정하는 1회성 진단 도구(`pnpm --filter friendly probe:bus [키워드]`).

## API Surface [coverage: high — 9 sources]

**HTTP — 공개 라우트 ([bus.route.ts](../../apps/friendly/src/modules/bus/bus.route.ts), 인증 없음):**

| 라우트 | 쿼리/파라미터 | 응답 | 캐시 |
|---|---|---|---|
| `GET Routes.Bus.stationSearch` | `q`(2~50자, NFC), `force`(bool) | `BusStationSearchResult` | DB 30일 |
| `GET Routes.Bus.stationsNearby` | `lat`·`lng`(WGS84), `radius`(50~1000, 기본 500) | `BusNearbyResult` | 셀 격자 30일 |
| `GET Routes.Bus.stationArrivals(:arsId)` | `arsId`(1~5자리, '0' 금지) | `BusArrivalsResult` | 무캐싱(실시간) |
| `GET Routes.Bus.busPositions(:busRouteId)` | `startOrd`/`endOrd`(둘 다 또는 둘 다 생략) | `BusPositionsResult` | 무캐싱(실시간) |
| `GET Routes.Bus.routeDetail(:busRouteId)` | — | `BusRouteDetailResult` | DB 30일 |

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
- `useBusFavorites()` — 게스트/로그인 하이브리드 단일 인터페이스(아래 [Key Decisions](#key-decisions-coverage-high--8-sources)).

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

## Data [coverage: high — 6 sources]

전부 [schema.prisma](../../apps/friendly/prisma/schema.prisma)에 정의되고 마이그레이션 4개로 쌓였다.

**정류장 캐시** ([20260612102026_add_bus_station_cache](../../apps/friendly/prisma/migrations/20260612102026_add_bus_station_cache/migration.sql)):
- `BusStation`(`bus_stations`) — **PK = `stId`**(9자리 고유 ID). `arsId='0'` 가상정류장이 여럿이라 `arsId` 는 PK/unique 불가. 좌표는 어댑터가 WGS84 정규화한 값만 저장. `@@index([arsId])`.
- `BusStationSearch`(`bus_station_searches`) — `keyword`(trim+NFC) unique, `fetchedAt`. 빈 결과도 행을 남긴다(네거티브 캐싱).
- `BusStationSearchHit`(`bus_station_search_hits`) — 검색↔정류소 조인, `rank` 로 서울시 응답 순서 보존. `@@id([searchId, stId])`.

**주변 셀 캐시** ([20260704074500_add_bus_nearby_cell_cache](../../apps/friendly/prisma/migrations/20260704074500_add_bus_nearby_cell_cache/migration.sql)):
- `BusNearbyCell`(`bus_nearby_cells`) — `cellKey`(예: `"37.495,127.025"`) unique. 쿼리 좌표를 **0.005°≈550m 격자**에 스냅해 셀 단위로 캐싱. 업스트림은 셀 중심에서 고정 반경 1500m 로 1회 수집해, 셀 내 어떤 쿼리(반경 ≤1000m)에도 재사용. `dist` 는 지점마다 달라 저장하지 않고 서빙 시 정류소 좌표로 재계산.
- `BusNearbyCellHit`(`bus_nearby_cell_hits`) — 셀↔정류소 조인, `rank`. `@@id([cellId, stId])`.

**즐겨찾기** ([20260704120000_bus_favorites](../../apps/friendly/prisma/migrations/20260704120000_bus_favorites/migration.sql)):
- `BusFavoriteStation`(`bus_favorite_stations`) — `(userId, stId)` unique. 정류장 스냅샷(`name/lat/lng`) 저장.
- `BusFavoriteRoute`(`bus_favorite_routes`) — `(userId, stId, busRouteId)` unique. `routeName/stationName/arsId/lat/lng` 스냅샷.
- **캐시 테이블 `BusStation` 을 FK 로 참조하지 않는다** — 그건 전 정류장 마스터가 아니라 검색/주변 조회로 우연히 캐시된 부분집합이라, FK 로 묶으면 캐시 정리가 즐겨찾기를 깨뜨린다.

**노선 상세** ([20260704130000_bus_route_shapes](../../apps/friendly/prisma/migrations/20260704130000_bus_route_shapes/migration.sql)):
- `BusRouteShape`(`bus_route_shapes`) — **PK = `busRouteId`**. 정규화된 `{ info, path, stations }` JSON 을 `payload` 한 컬럼에. 노선 단위 원자 조회라 정규화 테이블 없이 blob. `getRoutePath` 는 1,986점(141번)까지 나오지만 형상이 정적이라 30일 캐시로 감당.

**게스트 로컬 저장** ([busFavoriteStore.ts](../../packages/shared/src/stores/busFavoriteStore.ts)) — 비로그인 즐겨찾기는 zustand persist(`name: 'bus-favorites-v1'`). 웹은 `localStorage` 자동, 앱은 `setBusFavoriteStorage(AsyncStorage)` 주입(reviewAskStore 와 같은 lazy resolver 패턴). 등록순 배열, 상한 100.

## Key Decisions [coverage: high — 8 sources]

- **serviceKey raw 직결 — URLSearchParams 금지.** data.go.kr "Encoding 키"(`%XX` 시퀀스 포함)를 `URLSearchParams` 에 넣으면 이중 인코딩돼 인증에러(`returnReasonCode 30`). `toServiceKeyPart` 가 `%XX` 있으면 raw, 없으면 `encodeURIComponent` 하고, 일반 파라미터만 `URLSearchParams` 로 처리한다. 로깅엔 키 평문 URL 을 절대 싣지 않고 `***` 마스킹본(`requestUrl`)만 남긴다.
- **좌표계는 필드명이 아니라 값 범위로 판정 — proj4 불필요.** `toLatLng` 가 WGS84 한국 범위에 드는 첫 쌍 채택. 계약 zod 범위와 상수가 동일해 코드로 강제된다. 전량 정규화 실패(`raw.length>0 && stations.length===0`)는 **TM-only 응답 신호**로 보고 502 를 내되 빈 결과로 30일 박제하지 않는다(만료 캐시 있으면 stale 우선).
- **캐시 TTL — 정적은 30일, 실시간은 무캐싱.** 정류소 정보는 거의 안 바뀌어 검색/주변/노선은 30일 캐시. 도착/위치는 실시간이라 무캐싱 프록시(캐시가 없어 stale 폴백도 없음). `force` 강제 갱신이라도 60초 내 재수집은 캐시로 응답(갱신 버튼 연타 방어).
- **일일 쿼터 게이트 — 검색·주변·도착·위치·노선이 공유하는 단일 인메모리 카운터.** Asia/Seoul 날짜 경계로 리셋, 기본 상한 900(개발계정 1,000에서 여유). 한도 초과 시 소비 없이 503 throw(캐시 있는 경로는 stale 폴백). 동일 키워드/셀 동시 요청은 in-flight 합류로 업스트림 1회만. 단일 인스턴스 전제의 모듈 싱글턴 게이트 — 컨셉 [in-memory-singleton-gates](../concepts/in-memory-singleton-gates.md). 노선 상세는 3콜분 쿼터를 **한 번에** 소비해 중간 소진으로 1콜만 하고 실패하는 걸 막는다.
- **즐겨찾기 하이브리드 — 게스트 로컬 + 로그인 서버.** 게스트는 `busFavoriteStore`(zustand persist), 로그인은 서버 목록을 React Query 로. 로그인 직후 게스트 저장분을 서버로 **union 병합(sync 1회)** — 서버에 없는 항목만 insert, 있으면 서버 값 유지, 상한 초과분은 조용히 skip(병합이 에러로 끊기면 안 됨). sync 는 외부 시스템 동기화라 `useBusFavorites` 가 `useEffect` 로 발사(`syncedRef` StrictMode 재진입 가드). 파생 판정(`isFavorite`)은 렌더 중 계산.
- **실시간은 폴링 — SSE 아님.** 도착 30초·위치 15초 `refetchInterval`, `refetchIntervalInBackground` false 로 탭 비활성 시 자동 중단. 위치 조회는 구간(`getBusPosByRouteSt`)에서 **노선 전체(`getBusPosByRtid`)로 전환** — 업스트림 쿼터 비용이 같고(1콜), 도착정보 `staOrd` 를 기다릴 필요 없이 노선 선택 즉시 전 차량이 뜬다.
- **클라이언트 이동 보간 + 노선 형상 따라가기.** MapCanvas 가 폴링 간 위치를 등속 tween(기본 14초)으로 잇는다. 형상이 있으면 `routePath.ts` 로 이전→현재 위치의 도로 슬라이스(`via`)를 계산해 도로를 따라 이동. 형상이 **상·하행 왕복 한 줄**(첫점≈끝점)이라 좌표만으론 두 후보가 생기는데, 차량 `sectOrd` 와 정류소 `seq` 가 같은 순번 공간임을 이용해 호길이 s 윈도우로 모호성을 푼다. 진행 방향 화살표(7차)는 형상 접선 방위각으로 회전. 따라가기(8차)는 `followVehicleId` 를 매 프레임 `setCenter` 로 추적하되, 사용자가 지도를 조작하면 `onFollowInterrupted` 로 끊고 '다시 따라가기' 칩으로 재개(followId 유지, paused 만 토글).
- **Zod SSOT — buildless.** 계약 스키마 1개 변경이 FE/BE 컨슈머를 컴파일 타임에 동기화. `fastify-type-provider-zod` 가 검증 + OpenAPI 자동 생성. 컨셉 [zod-ssot-buildless](../concepts/zod-ssot-buildless.md).
- **URL 이 유일 진실.** BusPage 가 `q`·`stId`·`routeId`·`near` 를 URL 에 동기화 — 새로고침/공유/딥링크 시 Geolocation 재요청 없이 같은 화면 복원. 자동 재조회(패닝) 좌표만 로컬 상태(URL history 오염 방지).
- **통합 즐겨찾기 — 도메인별 섹션 삭제, 양 탭 공용(13차).** 버스 정류장/정류장×노선, 지하철 역/역×호선 4종을 초기 화면 한 목록(`TransitFavoritesSection`)으로 합쳤다 — 기존 `BusFavoriteSection` 은 **삭제**(대칭적으로 `SubwayFavoriteSection` 도). BusPage 는 `useBusFavorites`+`useSubwayFavorites` 를 각 1회 호출해 이 섹션에 넘긴다(`hasFavorites` = 네 목록 합집합 비어 있지 않음). '이동'은 자기 도메인이면 in-page 핸들러(기존 URL 계약) 재사용, 상대 도메인이면 `/subway?stn=` navigate — 새 URL 시맨틱을 만들지 않는다. 정렬은 도메인 단위 concat(항목별 `createdAt` 이 계약에 미노출이라 인터리브는 후속 과제).
- **주변 겸표시 — 상대 도메인 오버레이(14차).** 주변 모드에 지하철역을 청록·환승 이중링 마커로 함께 표시한다. 조회(`useSubwayNearbyStations`)는 주변 모드 && 집중 모드(노선 보기·따라가기) 아님이면 토글 off 여도 **항상 돌린다**(지하철 nearby 는 로컬 DB 라 쿼터 0 — 켤 때 즉시 표시하려고). **표시만** `transitCrossShowStore` 로 게이팅. 마커는 `MapCanvas.overlayMarkers`(별도 소스)로 넘겨 자기 정류장 `fitToMarkers` extent 를 안 넓힌다. id 는 `x-subway:` prefix — `handleMarkerSelect` 가 `x-` 를 다른 무시/선택 로직보다 먼저 가로채 `/subway?near=..&stn=` 딥링크로 라우팅(12차 `/bus` 딥링크와 대칭).
- **크로스 검색 — 검색 모드 한정, 로컬 DB 라 제출 게이트 불필요(15차).** 버스 검색 결과 하단에 `SubwayCrossSection`(제출 q 로 지하철역 자동 크로스). 지하철 검색은 로컬 DB(쿼터 0)라 타이핑 발화를 막을 필요가 없어 **제출된 q 를 그대로 자동 조회**한다(반대로 지하철 탭의 버스 크로스는 서울시 API 라 제출 게이트 — 대칭 아님). 리스트는 `crossSearchContent` 슬롯으로 결과 목록/빈 상태 뒤에 렌더하고, 주변/초기/선택 화면엔 미표시(`!nearMode && hasQ` 에서만 넘긴다).
- **탭 전환 지도 이어보기 — 뷰포트(A안) + 인스턴스 풀링(D안).** 버스↔지하철 탭 전환은 라우트 언마운트라 지도가 재생성돼 뷰가 리셋·타일이 플래시했다. `BusStationsMap` 이 `transitMapViewport` 싱글턴에서 초기 뷰를 복원하고 `moveend` 마다 저장(A안, 검색/선택 fit·flyTo 규칙 무변경)하고, `MapCanvas.poolKey` 로 OL Map 인스턴스 자체를 풀에 보관·재사용(D안, 타일 플래시 제거)한다. 데스크톱·모바일 지도 래퍼가 CSS 숨김으로 **동시 마운트**라 한 풀 키를 공유하면 한쪽만 재사용돼, 키를 `transit-desktop`/`transit-mobile` 로 나눈다. 풀링 메커니즘 상세는 [map](map.md).

## Gotchas [coverage: high — 7 sources]

- **인증 실패가 두 형태로 온다.** (1) `OpenAPI_ServiceResponse > cmmMsgHeader > returnReasonCode`, (2) `ServiceResult headerCd=7`("Key인증실패: … [인증모듈 에러코드(NN)]"). 어댑터가 둘 다 `BusApiAuthError`(503)로 분류하고, (2)는 `headerMsg` 에서 NN 을 정규식으로 뽑아 reasonCode 로 쓴다. '결과 없음'은 `headerCd=4`("결과가 없습니다.") — 에러 아니라 빈 목록.
- **`arsId='0'` 가상정류장.** 도착정보 조회 불가 — 계약이 `arsId '0'` 을 400 으로 거부하고, FE 훅(`enabled`)이 호출 자체를 막고, 리스트/패널이 번호 배지를 숨긴다. `stId` 가 진짜 식별자.
- **`vehId='0'` 은 도착예정 차량 없음.** 서비스가 null 로 정규화(`toArrivalEntry`). 메시지 자체가 없으면 항목이 없는 것.
- **`sectOrd` 순번 공간.** 도착정보 `staOrd` = 경유 정류소 `seq` = 형상 따라가기 윈도우의 축. 세 API 가 같은 순번 공간을 공유하는 게 형상 모호성 해소의 열쇠다.
- **`getBusPosByRouteSt` 응답의 `congetion`(혼잡도)은 서울시 필드명 자체가 오타** — 그대로 읽어야 함(HANDOFF 기록). 현재 코드는 이 필드를 쓰지 않는다.
- **`parseTagValue: false` 필수.** 숫자 자동 변환을 켜면 `arsId '02013'` 의 선행 0 이 소실된다. 숫자 필드는 `numOrNull` 로 명시 변환. `itemList` 는 `isArray` 로 항상 배열 강제(단건 응답이 객체로 떨어지는 함정 봉인).
- **fetch 타임아웃 사각.** `signal` 미지정 시 자체 10초 AbortController 를 걸되, `clearTimeout` 은 `res.text()` 완료 후 — fetch 직후 해제하면 헤더만 받고 본문이 매달리는 케이스(undici bodyTimeout ~300초)가 10초 보호를 못 받는다.
- **버스위치(15000332) 활용신청이 2026-12-27 만료 예정** — 운영하려면 만료 전 연장 신청 필요(HANDOFF 활용신청 표).
- **폴링 × 일 1,000건이 최대 운영 리스크.** 도착 30초 + 위치 15초 동시 폴링이면 사용자 1명이 시간당 수백 건. 탭 비활성 중단은 필수고, 운영 전 트래픽 증설 신청 검토.
- **개발 환경 함정(HANDOFF).** 포트 3000 이중 바인딩(다른 dev 서버가 잡으면 엉뚱한 404), 브랜치 전환/rebase 후 `prisma generate` 필수(client 스키마 불일치면 `prisma.busStation` undefined), dev DB 에 vworld 키 미등록이면 지도는 placeholder(설계된 폴백, 리스트는 동작).
- **데스크톱·모바일 지도는 동시 마운트 — 풀 키를 나눠야 한다.** BusPage 는 데스크톱(`hidden xl:flex`)·모바일(`xl:hidden`) 지도 래퍼를 CSS 로만 숨겨 둘 다 항상 마운트한다(`MapCanvas` 페이지당 2개 생존). 풀 키가 하나면 `take` 시맨틱상 한쪽만 재사용돼 나머지가 플래시하므로 `transit-desktop`/`transit-mobile` 로 분리했다. 같은 poolKey 를 두 MapCanvas 가 동시에 쓰면 안 된다(대중교통 탭 가정 — 한 시점에 한 레이아웃만 실제 표시).
- **겸표시는 표시만 토글, 조회는 항상.** 주변 모드 && 비집중이면 토글 off 여도 `useSubwayNearbyStations` 는 계속 돈다(로컬 DB, 쿼터 0 이라 안전 — 켤 때 즉시 표시). 서울시 API 를 쓰는 버스 nearby 와 혼동해 "off 인데 왜 조회하나" 로 읽지 말 것. 반대로 지하철 탭의 버스 겸표시는 셀 DB 캐시라 다른 비용 특성.
- **겸표시 클릭은 `x-` prefix 로 가장 먼저 가로챈다.** `handleMarkerSelect` 가 `id.startsWith('x-')` 를 차량(`veh-`)·내 위치(`my-location`) 무시 로직보다 **앞에서** 처리해 상대 탭 딥링크로 보낸다. 새 특수 마커 id 를 추가할 때 이 순서를 깨면 겸표시 클릭이 정류장 선택으로 샌다.
- **차량 알약 빌더는 vehiclePill.ts 위임 — 산출은 바이트 동일.** `busMarker.ts` 의 `buildBusVehiclePill*` 은 이제 지하철과 공용인 `vehiclePill.ts` 재수출이다. 알약 기하를 바꾸면 지하철 열차 마커에도 반영된다(공용 코어) — 버스만 바꾸려면 재수출을 끊고 분기해야 한다.
- **앱 미구현.** 버스는 웹 전용이다. 게스트 store 는 앱 storage 주입(`setBusFavoriteStorage`)까지 준비돼 있으나 앱 화면·라우트는 없다.

## Sources [coverage: high — 48 sources]

**백엔드 (friendly)**
- [apps/friendly/src/modules/bus/bus-api.adapter.ts](../../apps/friendly/src/modules/bus/bus-api.adapter.ts)
- [apps/friendly/src/modules/bus/bus.service.ts](../../apps/friendly/src/modules/bus/bus.service.ts)
- [apps/friendly/src/modules/bus/bus.route.ts](../../apps/friendly/src/modules/bus/bus.route.ts)
- [apps/friendly/src/modules/bus/bus-favorite.service.ts](../../apps/friendly/src/modules/bus/bus-favorite.service.ts)
- [apps/friendly/src/modules/bus/bus-favorite.route.ts](../../apps/friendly/src/modules/bus/bus-favorite.route.ts)
- [apps/friendly/src/modules/bus/bus.test.ts](../../apps/friendly/src/modules/bus/bus.test.ts)
- [apps/friendly/src/modules/bus/bus-api.adapter.test.ts](../../apps/friendly/src/modules/bus/bus-api.adapter.test.ts)
- [apps/friendly/src/modules/bus/bus-favorite.test.ts](../../apps/friendly/src/modules/bus/bus-favorite.test.ts)
- [apps/friendly/src/modules/bus/bus-api.live.test.ts](../../apps/friendly/src/modules/bus/bus-api.live.test.ts)
- [apps/friendly/scripts/probe-bus-api.ts](../../apps/friendly/scripts/probe-bus-api.ts)
- [apps/friendly/src/config/env.ts](../../apps/friendly/src/config/env.ts)
- [apps/friendly/.env.example](../../apps/friendly/.env.example)
- [apps/friendly/prisma/schema.prisma](../../apps/friendly/prisma/schema.prisma)
- [apps/friendly/prisma/migrations/20260612102026_add_bus_station_cache/migration.sql](../../apps/friendly/prisma/migrations/20260612102026_add_bus_station_cache/migration.sql)
- [apps/friendly/prisma/migrations/20260704074500_add_bus_nearby_cell_cache/migration.sql](../../apps/friendly/prisma/migrations/20260704074500_add_bus_nearby_cell_cache/migration.sql)
- [apps/friendly/prisma/migrations/20260704120000_bus_favorites/migration.sql](../../apps/friendly/prisma/migrations/20260704120000_bus_favorites/migration.sql)
- [apps/friendly/prisma/migrations/20260704130000_bus_route_shapes/migration.sql](../../apps/friendly/prisma/migrations/20260704130000_bus_route_shapes/migration.sql)

**계약 (api-contract)**
- [packages/api-contract/src/schemas/bus.ts](../../packages/api-contract/src/schemas/bus.ts)
- [packages/api-contract/src/schemas/bus-favorite.ts](../../packages/api-contract/src/schemas/bus-favorite.ts)
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
- [apps/web/src/routes/BusPage.tsx](../../apps/web/src/routes/BusPage.tsx)
- [apps/web/src/components/bus/BusStationsMap.tsx](../../apps/web/src/components/bus/BusStationsMap.tsx)
- [apps/web/src/components/bus/BusArrivalPanel.tsx](../../apps/web/src/components/bus/BusArrivalPanel.tsx)
- [apps/web/src/components/bus/BusFavoriteStar.tsx](../../apps/web/src/components/bus/BusFavoriteStar.tsx)
- [apps/web/src/components/bus/BusStationList.tsx](../../apps/web/src/components/bus/BusStationList.tsx) — *crossSearchContent 슬롯 추가*
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

**배경 문서**
- [docs/HANDOFF-bus-station-search.md](../../docs/HANDOFF-bus-station-search.md)
