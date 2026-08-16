---
topic: subway
type: codebase
last_compiled: 2026-08-17
source_count: 68
status: active
aliases: [seoul-subway, subway-api, swopen-api, swopenAPI, realtimeStationArrival, realtimePosition, subwayStationMaster, SearchSTNTimeTableByIDService, SearchSTNBySubwayLineInfo, subway-station-search, subway-arrivals, subway-positions, subway-line-detail, subway-timetable, subway-congestion, subway-path, subway-favorites, station-name-grouping, groupStations, subway-line-order, fr-code, branch-section, loop-section, subway-verify, verify-subway-lines, subwayId, statnId-mismatch, realtimeName-override, dongmyeong-station, train-interpolation, locateTrain, subwayPosition, vehiclePill, transit-tabs, transit-cross, transit-map-pool, subway-dijkstra, SUBWAY_API_KEY, SEOUL_OPEN_API_KEY, INFO-200, ERROR-337, plan-b-station-id]
---

# subway

서울시 수도권 전철 공공 API 두 포털(실시간 `swopenAPI.seoul.go.kr` + 정적 `openapi.seoul.go.kr:8088`)을 friendly 가 프록시하고, **웹**(`apps/web`)이 역 검색·실시간 도착·주변 역·호선 보기·실시간 열차 추적·시간표·혼잡도·경로 탐색을 그리는 도메인. 자매 토픽 [bus](bus.md)의 검증된 설계(어댑터 규율·쿼터 게이트·즐겨찾기 하이브리드·지도 어댑터·URL-as-truth)를 이식하되, 지하철 고유의 구조적 차이(로컬 DB 검색·GPS 없는 열차 위치·노선 형상 API 부재)에 맞게 재설계했다. **버스와 하나의 '대중교통' 통합 페이지**(`/bus` + `/subway` 탭)로 묶여 있다. ~~앱에는 지하철 화면이 없다~~ → 2026-07 이후 **앱(`apps/mobile`)에도 대중교통 화면**(버스·지하철 통합, 탑승 모드·하차 알림 포함)이 있다 — [transit](transit.md)/[mobile](mobile.md) 참조.

**2026-07-25~08-17 변경 흡수 — 노선 실형상(OSM) + 데이터 픽스 + UWP export + 시간표 캐시/스모크 견고화**:
- **실형상 적재·서빙(`c9c5235`, 마이그레이션 `20260724140939_add_subway_line_shape`)** — 역 좌표 직선 연결이던 폴리라인을 실제 선로 기하로. `SubwayLineShape`(lineId+branchKey → path/stationS anchor) 모델 + [load-subway-shapes](../../apps/friendly/scripts/load-subway-shapes.ts)(Overpass route relation → way 체인 조립 → 역 투영 anchor, 키 불필요). 단일 운행계통이 전 구간을 못 덮는 노선(4호선·경의선)은 역 커버리지 set-cover union 폴백 — 26개 section 중 25개 성공, GTX-A 만 직선 폴백. 조립 순수 로직은 [subway-shape.service.ts](../../apps/friendly/src/modules/subway/subway-shape.service.ts)(6호선 응암 루프 재방문 처리 포함). 계약은 `SubwayLineSection`/`SubwayPathLeg` 에 **optional** path/stationS — 미시드 환경은 기존 직선 폴백(하위호환). 경로 legs 는 탑승~하차 실형상 슬라이스(순환 시임 랩 포함). 산출물은 ODbL — 지도 attribution 에 © OpenStreetMap 표기. 시드 순서: load:subway-stations → line-orders → shapes.
- **순서·좌표 데이터 픽스(`83cee9a`)** — FR_CODE 삽입역(A042 마곡나루 등) 재해석(normalizeInserted: prefix 그룹 지배 자릿수보다 긴 코드는 num+sub 분해 — 기존엔 노선 끝에 밀려 공항철도 폴리라인 지그재그) + 업스트림 좌표 大오차 예외 보정(KNOWN_COORD_OVERRIDES: 인천공항2터미널 1.1km·청산 1.6km, OSM 실측 대조). 재적재 필요.
- **UWP(NineyWeather) export(`afb3bd0`+`56d871b`)** — [export-subway-master-for-uwp.ts](../../apps/friendly/scripts/export-subway-master-for-uwp.ts): 가공 완료된 SubwayStation/SubwayLineStation/SubwayCongestion 을 JSON 3파일로 덤프(DB만 읽음, 업스트림 0콜) — 별도 UWP 앱의 Assets 번들 원천.
- **시간표 빈 blob 짧은 TTL + 업스트림 데이터셋 결손(`81ccb6d`)** — ⚠️ 2026-08-17 관측: 서울시 시간표 API 가 에러 없이 **전 역·전 요일 0행** 반환(강남·시청·성수·서울역 교차 확인). 30일 캐시가 이 빈 응답을 굳히지 않도록 coverage:false blob 은 `SUBWAY_TIMETABLE_EMPTY_TTL_MS`(6h)로 자가 회복. live 스모크는 coverage:false 를 외부 상태로 warn+skip. subway.test.ts 시드 정리를 beforeAll 에서도 실행 — 크래시한 이전 실행의 잔여 시드가 "주변 역" 정확 개수 단언을 깨던 것의 자가 치유.
- **대중교통 5xx 진단 로깅(`d3af987`)** — subway 라우트 catch 8벌이 [lib/reply-upstream-error](../../apps/friendly/src/lib/reply-upstream-error.ts) 로 통합, 5xx 시 upstreamUrl(키 마스킹)/upstreamCode/responseSnippet warn 기록.

커밋 히스토리상 1차(탭+역 검색+지도)부터 15차(검색 크로스 섹션)까지 진행됐고, 이 문서는 그 최신 코드 기준이다. 차수별 로드맵·사용자 결정·프로브 체크리스트의 원문은 [docs/PLAN-subway.md](../../docs/PLAN-subway.md)에 있다(계획 시점 기록 — 실제 진행은 커밋이 진실). 계획상 **9차(환승·출구)는 아직 구현되지 않았다** — TAGO 지하철정보(15098554) 게이트웨이 반영 대기.

## Purpose [coverage: high — 8 sources]

지하철 도메인은 웹에서 다음을 제공한다: (1) **역 찾기** — 라이브 키워드 검색(타이핑 즉시, [SubwayStationList](../../apps/web/src/components/subway/SubwayStationList.tsx)) 또는 좌표 기반 주변 역(Geolocation·지도 재검색), (2) **실시간 도착정보** — 선택 역의 호선별 도착 열차 30초 폴링 + `recptnDt` 기준 1초 카운트다운([SubwayArrivalPanel](../../apps/web/src/components/subway/SubwayArrivalPanel.tsx)), (3) **호선 보기 + 실시간 열차 추적** — 선택 호선의 근사 폴리라인·경유역 위에 실시간 열차를 얹고(GPS 없이 역간 보간으로 좌표 재구성), 알약을 탭하면 카메라가 따라간다, (4) **부가 정보** — 역 시간표·첫차/막차(8차)·시간대별 혼잡도(10차)·역→역 경로 탐색(11차)·주변 버스 정류장 연계(12차).

버스 도메인을 관통하는 제약이 "서울시 개발계정 일 한도"였다면, 지하철에는 **결정적 완화**가 있다: 역사마스터(수도권 ~784행)를 friendly DB 에 전량 적재해 두어 **검색·주변·노선·경로·혼잡도가 전부 로컬 조회(업스트림 0콜)**로 완결된다. 그래서 검색이 라이브(타이핑 즉시)일 수 있다. **쿼터를 쓰는 것은 실시간(도착·열차 위치)과 시간표 수집뿐**이고, 이들도 15초 마이크로 캐시 + in-flight 합류 + 일일 쿼터(기본 900)로 방어한다.

접근 정책은 버스·맛집 공개 지도와 동일하다: 검색·도착·주변·노선·위치·시간표·혼잡도·경로는 **비로그인 공개**, **즐겨찾기만 로그인 필요**(소유자 스코프). 실시간 라우트는 `SUBWAY_API_KEY`, 시간표는 `SEOUL_OPEN_API_KEY` 가 비어 있으면 그 라우트만 503 을 내고(검색 등 로컬 조회는 정상), 마스터 미적재면 검색이 503("load:subway-stations 실행 필요").

## Architecture [coverage: high — 11 sources]

한 방향 레이어드 파이프라인이다. 어댑터가 두 포털의 JSON 을 정규화하고, 서비스가 로컬 조회·캐시·쿼터를 얹고, 라우트가 HTTP 상태로 변환하고, 계약(zod)이 FE/BE 를 컴파일 타임에 묶고, shared 가 API·훅·store 를, 웹 컴포넌트가 UI 를 담당한다. 순수 로직(그룹핑·경로·순서·혼잡·보정·보간)은 서비스/스크립트에서 떼어내 단위 테스트 대상 순수 함수로 둔다.

```
웹 /subway (SubwayPage — q/near/stn/line/to URL 동기화, TransitTabs 로 /bus 와 통합)
  ├─ 좌: SubwayStationList | (배타 패널) SubwayTimetable > SubwayPathPanel > SubwayArrivalPanel
  └─ 우: SubwayStationsMap → MapCanvas (vworld OL, poolKey 로 탭 전환 재사용)
     │    · 역 마커/환승 이중링 · 호선 폴리라인 · 경유역 점 · 열차 알약(rAF 보간) · 겸표시 오버레이
  @repo/shared: useSubway.ts (검색/주변/도착/위치/노선/시간표/혼잡/경로) · useSubwayFavorites.ts · subwayFavoriteStore.ts
  @repo/utils : subwayLine.ts (SUBWAY_LINES 상수) · subwayMarker.ts · subwayPosition.ts (역간 보간) · vehiclePill.ts · routePath.ts
     │  ↕ @repo/api-contract: schemas/subway.ts · schemas/subway-favorite.ts · routes.ts(Routes.Subway)
     ▼
  friendly: subway.route.ts / subway-favorite.route.ts               (HTTP 레이어, autoload)
            subway.service.ts (로컬 조회 + 실시간 프록시 + 쿼터/캐시/그래프)
            subway-master.service.ts (마스터 정규화 + 역명 그룹핑) · subway-path.service.ts (다익스트라)
            subway-line-order.service.ts (FR_CODE 순서) · subway-congestion.service.ts · subway-verify.service.ts
            subway-api.adapter.ts (두 포털 HTTP 코어 + 타입드 래퍼 5종 + 에러 클래스)
     ▼
  http://swopenAPI.seoul.go.kr/api/subway/{KEY}/json/{svc}/{s}/{e}/{역명|호선명}   (실시간, SUBWAY_API_KEY)
  http://openapi.seoul.go.kr:8088/{KEY}/json/{svc}/{s}/{e}/{...}                    (정적, SEOUL_OPEN_API_KEY)
```

### 두 포털 + 3종 API 키

버스가 한 포털(`ws.bus.go.kr`) 3개 서비스였다면, 지하철은 **두 포털 + 세 번째 계정**을 쓴다. 키가 **URL path 세그먼트**에 실리는 게 버스(쿼리스트링)와의 근본 차이다.

| 포털 (data.go.kr / data.seoul.go.kr) | 오퍼레이션 | 키 | 쓰임 |
|---|---|---|---|
| **swopenAPI** (실시간) | `realtimeStationArrival/0/30/{역명}` | `SUBWAY_API_KEY` | 역 도착정보(전 호선 1콜) |
| | `realtimePosition/0/100/{호선명}` | `SUBWAY_API_KEY` | 호선 전체 열차 위치 |
| **openapi.seoul.go.kr:8088** (정적) | `subwayStationMaster/1/1000` | `SEOUL_OPEN_API_KEY` | 역사마스터(784행, 적재용) |
| | `SearchSTNTimeTableByIDService/1/500/{역코드}/{요일}/{상하}` | `SEOUL_OPEN_API_KEY` | 역 시간표(1~9호선) |
| | `SearchSTNBySubwayLineInfo` | `SEOUL_OPEN_API_KEY` | 노선별 역 순서(FR_CODE, 적재용) |
| **odcloud** (data.go.kr 파일데이터) | 서울교통공사 혼잡도 15071311 | `BUS_API_KEY` | 시간대별 혼잡도(1~8호선, 적재용) |

- swopenAPI 실시간 키(`SUBWAY_API_KEY`)와 openapi 일반 인증키(`SEOUL_OPEN_API_KEY`)는 **서로 호환되지 않는다** — 발급처(data.seoul.go.kr 열린데이터광장)는 같아도 별개 키다([env.ts](../../apps/friendly/src/config/env.ts) 주석).
- 혼잡도는 별도 계정이 아니라 **버스의 `BUS_API_KEY`(data.go.kr)를 재사용**한다 — 같은 포털이라 버스 어댑터의 `toServiceKeyPart`(Encoding 키 raw 직결)까지 이식했다([load-subway-congestion.ts](../../apps/friendly/scripts/load-subway-congestion.ts)). 8차 시간표도 TAGO 후보를 두고 `BUS_API_KEY` 폴백을 계획했으나, 프로브 결과 서울시 openapi 소스로 확정돼 `SEOUL_OPEN_API_KEY` 만 쓴다.
- 어댑터는 키가 path 에 실리므로 `fetchUrl`(키 평문)과 `requestUrl`(`***` 마스킹본)을 **같은 템플릿에서 병렬 생성**한다 — URL 에서 키를 사후 치환하지 않는다(누락 위험). 예외 메시지도 `scrubKey` 로 한 번 더 지운다(이중 안전망).

### 내부 ID 체계 — 플랜 B (`${lineId}:${name}`)

이 도메인의 **가장 근본적인 설계 결정**이다. 프로브 실측(2026-07-06): 역사마스터의 `BLDN_ID`(4자리 역코드)는 실시간 API 의 `statnId`(10자리)와 **불일치** — 조인 키로 못 쓴다. 그래서 마스터의 `statnId` 를 PK 로 삼는 대신, 내부 stationId 를 **`${lineId}:${name}` 합성**(예 `1002:강남`)으로 만들고(플랜 B), 실시간 조회를 **역명 기반**으로 완결한다. `lineId` 는 실시간 `subwayId`(4자리) 체계를 그대로 쓴다(마스터의 39종 `ROUTE` 표기는 적재 시 이 lineId 로 접는다).

이 합성 ID 는 콜론·한글을 포함해 URL 에선 인코딩되므로, 라우트 등록은 도착/시간표/혼잡도/즐겨찾기 전부 `decodeURIComponent(Routes.Subway.xxx(':stationId'))` 트릭으로 fastify 파라미터 패턴을 복원한다(경로 구조는 여전히 Routes 단일 소스에서 파생).

실시간 위치(6차) 조인을 위해서는 `statnId` 가 필요한데, 이는 나중에 도착 API 관측으로 **backfill** 한다(아래 verify 보정 참조 — 644행 채움).

### 로컬 vs 실시간 vs 시간표 — 3층 캐싱/쿼터 매트릭스

버스는 모든 조회가 업스트림을 탔지만, 지하철은 데이터 성격에 따라 3층으로 갈린다.

| 층 | 라우트 | 소스 | 쿼터/캐시 |
|---|---|---|---|
| **로컬 DB** | 검색·주변·호선 상세·경로·혼잡도 | `subway_stations`/`subway_line_stations`/`subway_congestions` 조회 | **쿼터 0** (`source: 'db'`) |
| **실시간** | 도착·열차 위치 | swopenAPI 프록시 | 15초 마이크로 캐시 + in-flight 합류 + 일일 쿼터('realtime' 그룹, 기본 900). **stale 폴백 없음** |
| **시간표** | 역 시간표 | openapi 프록시 | (역×dayType) DB blob 30일 TTL(빈 blob 은 6h — 81ccb6d) + **stale 폴백** + in-flight('openapi' 쿼터, 방향 2콜 선소비) |

로컬 조회는 라이브 검색을 가능하게 한 핵심이다. 실시간은 조회역명/호선명 단위 15초 캐시로 동시 사용자 전원이 업스트림 1콜을 공유한다.

### 기능 단계 (1~15차)

| 차수 | 내용 | 대표 커밋 |
|---|---|---|
| 1차 | 대중교통 탭 + 역 라이브 검색 + 지도 + 역사마스터 적재 | `09d977b`·`b2ee4b7` (+보정 `0591a4b`) |
| 2차 | 실시간 도착 + 30초 폴링 + 카운트다운(+실시간 인프라) | `f937617`·`dfddd87` |
| 3차 | 주변 역 + 지도 자동 재조회(로컬 바운딩박스) | `142d4bc`·`259b9c8` |
| 4차 | 즐겨찾기(게스트 로컬 + 로그인 서버 하이브리드) | `8fa9785`·`0f6eb9d` |
| 5차 | 호선 보기(폴리라인 + 경유역 + 정보 카드, 지선 sections) | `ef269c4`·`9f68c26` |
| 6차 | 실시간 열차 위치 + 역간 보간 + 알약 rAF 이동 | `149add4`·`653b502` |
| 7차 | 열차 따라가기 + 도착↔지도 열차 연계 | `69f2589` |
| 8차 | 역 시간표 + 첫차/막차 + 막차 임박 뱃지 | `34e2070`·`58daa8f` |
| 10차 | 시간대별 혼잡도(1~8호선) 게이지·dot | `8264fa5`·`ed54b83` |
| 11차 | 경로 탐색(로컬 그래프 다익스트라) | `0deba19`·`8b403bf` |
| 12차 | 역 주변 버스 정류장 연계(버스 nearby 재사용) | `79a800b` |
| 13차 | 통합 즐겨찾기 홈(양 탭 공용 섹션) | `6a3e337` |
| 14차 | 주변 모드 상대 도메인 겸표시(양 탭) | `8a48b49` |
| 15차 | 검색 크로스 섹션 + 검색 UX 통일 | `dd1a9fe` |
| (지도) | 탭 전환 뷰포트 이어보기(A안) → OL 인스턴스 풀링(D안) | `de382a0`·`4128d6b` |

**9차(환승·출구)는 미구현** — TAGO 출구별 정보 게이트웨이 반영 대기(계획만 존재).

## Talks To [coverage: high — 10 sources]

- **서울시 실시간 swopenAPI (`http://swopenAPI.seoul.go.kr/api/subway/...`)** — 평문 HTTP, GET, 키가 path 세그먼트. JSON 응답. friendly 만 호출(브라우저 직접 접근 없음). 도착(`realtimeStationArrival`)·위치(`realtimePosition`)만 여기.
- **서울시 정적 openapi (`http://openapi.seoul.go.kr:8088/...`)** — 역사마스터·시간표·노선순서. 같은 키 path 규율·에러 모델(`RESULT.CODE`)이 swopen 과 미묘하게 달라 어댑터가 두 파서(`readSwopenStatus`/`readSeoulResult`)로 분리.
- **odcloud (`data.go.kr` 파일데이터)** — 서울교통공사 혼잡도(UDDI 지정). `BUS_API_KEY`(버스와 공용 계정)로 [load-subway-congestion.ts](../../apps/friendly/scripts/load-subway-congestion.ts)가 전량 적재.
- **friendly DB (Prisma/SQLite)** — `subway_stations`·`subway_master_syncs`·`subway_line_stations`·`subway_timetable_caches`·`subway_congestions`·`subway_favorite_stations`·`subway_favorite_lines`. 상세는 [Data](#data-coverage-high--7-sources).
- **map 도메인 (vworld)** — [SubwayStationsMap](../../apps/web/src/components/subway/SubwayStationsMap.tsx)이 `useMapPublicConfig` 로 vworld 키를 받아 [MapCanvas](../../apps/web/src/components/restaurant/MapCanvas.tsx)에 넘긴다. MapCanvas 는 버스가 도입한 확장(차량 애니 레이어·`followVehicleId`·`routeLine`)에 더해 지하철이 `overlayMarkers`(fit 제외 겸표시 레이어)와 `poolKey`(탭 전환 인스턴스 풀링)를 추가로 도입했다. 지도 인프라 전반은 [map](map.md).
- **bus 도메인** — 12차 [SubwayNearbyBusSection](../../apps/web/src/components/subway/SubwayNearbyBusSection.tsx)이 기존 `GET /bus/stations/nearby` 를 신규 API 없이 재사용하고, 14/15차가 버스 검색·주변 훅을 겸표시·크로스 섹션에 쓴다. 통합 페이지는 두 도메인을 [transit](../../apps/web/src/components/transit/TransitTabs.tsx) 셸(탭·크로스·통합 즐겨찾기·겸표시 토글)로 잇는다. 자매 토픽 [bus](bus.md).
- **`@repo/api-contract`** — `schemas/subway.ts`·`schemas/subway-favorite.ts`·`Routes.Subway`. zod SSOT([zod-ssot-buildless](../concepts/zod-ssot-buildless.md)).
- **`@repo/shared` / `@repo/utils`** — `subwayApi`/`subwayFavoriteApi`, `useSubway`/`useSubwayFavorites`, `subwayFavoriteStore`; `subwayLine`·`subwayMarker`·`subwayPosition`·`vehiclePill`·(공용)`routePath`·`markerFrame`.
- **auth (`authStore` / `app.authenticate`)** — 즐겨찾기 라우트만 Bearer 인증. 401 로 세션이 끊기면 훅이 게스트 모드로 폴백. 공개/소유자 분리는 [public-admin-route-split](../concepts/public-admin-route-split.md) 결과 같은 결.
- **프로브·적재 스크립트(6종)** — [probe-subway-api.ts](../../apps/friendly/scripts/probe-subway-api.ts)(1차 0단계 미지수 확정 ①~⑩), [load-subway-stations.ts](../../apps/friendly/scripts/load-subway-stations.ts)(마스터 적재), [verify-subway-lines.ts](../../apps/friendly/scripts/verify-subway-lines.ts)(호선 매핑 보정), [load-subway-line-orders.ts](../../apps/friendly/scripts/load-subway-line-orders.ts)(5차 순서), [probe-subway-positions.ts](../../apps/friendly/scripts/probe-subway-positions.ts)(6차 semantics 게이트), [probe-subway-timetable.ts](../../apps/friendly/scripts/probe-subway-timetable.ts)(8차 소스 판정). 코드에 박힌 추정을 실응답으로 확정하는 프로브 우선 개발 플로우([external-api-proxy-fixture](../concepts/external-api-proxy-fixture.md)).

## API Surface [coverage: high — 9 sources]

**HTTP — 공개 라우트 ([subway.route.ts](../../apps/friendly/src/modules/subway/subway.route.ts), 인증 없음):**

| 라우트 | 쿼리/파라미터 | 응답 | 소스 |
|---|---|---|---|
| `GET Routes.Subway.stationSearch` | `q`(1~50자, NFC) | `SubwayStationSearchResult` | DB(쿼터 0) |
| `GET Routes.Subway.stationsNearby` | `lat`·`lng`(WGS84), `radius`(100~3000, 기본 1500) | `SubwayNearbyResult` | DB 바운딩박스 |
| `GET Routes.Subway.stationArrivals(:stationId)` | `stationId`(`${lineId}:${name}`) | `SubwayArrivalsResult` | 실시간(15s 캐시) |
| `GET Routes.Subway.linePositions(:lineId)` | `lineId`(4자리) | `SubwayPositionsResult` | 실시간(15s 캐시) |
| `GET Routes.Subway.lineDetail(:lineId)` | `lineId`(4자리) | `SubwayLineDetailResult` | DB(순서 적재) |
| `GET Routes.Subway.stationTimetable(:stationId)` | `+ dayType`('1'/'2'/'3') | `SubwayTimetableResult` | blob 30일+stale |
| `GET Routes.Subway.stationCongestion(:stationId)` | `+ dayType` | `SubwayCongestionResult` | DB(정적 통계) |
| `GET Routes.Subway.path` | `from`·`to`(stationId, from≠to) | `SubwayPathResult` | DB 그래프 |

**HTTP — 즐겨찾기 라우트 ([subway-favorite.route.ts](../../apps/friendly/src/modules/subway/subway-favorite.route.ts), Bearer 인증 필수):**

| 라우트 | 메서드 | 응답 |
|---|---|---|
| `Routes.Subway.favorites` | GET | `SubwayFavoritesResult`(stations + lines) |
| `Routes.Subway.favoriteStation(:stationId)` | PUT / DELETE | `SubwayFavoritesResult`(변경 후 전체) |
| `Routes.Subway.favoriteLine(:stationId, :lineId)` | PUT / DELETE | `SubwayFavoritesResult` |
| `Routes.Subway.favoritesSync` | POST | `SubwayFavoritesResult`(union 병합 후) |

버스와 동일하게 변경 계열은 **변경 후 전체 목록**을 반환(diff 없이 캐시 통째 교체), DELETE 는 `deleteMany` 로 멱등, PUT 은 신규 시에만 상한(`SUBWAY_FAVORITES_MAX = 100`) 검사(초과 400). 라우트는 error-handler 가 `statusCode >= 500` 을 일괄 500 으로 뭉개므로, 의미 있는 **502(업스트림)·503(키 미설정·마스터 미적재·쿼터 소진)** 과 404(없는 역)를 핸들러가 직접 `reply.code().send()` 로 응답(공용 `ErrorResponseSchema` 등록). 미제공 노선의 시간표/혼잡도는 404 가 아니라 `coverage:false` + 200(역이 없는 게 아니므로).

**Zod 계약 ([subway.ts](../../packages/api-contract/src/schemas/subway.ts) · [subway-favorite.ts](../../packages/api-contract/src/schemas/subway-favorite.ts)):**

| Schema | 형태 요약 |
|---|---|
| `SubwayStationSearchQuery` | `q`(trim → NFC transform → refine 1~50) — min 을 transform 앞에 안 걸어 NFD 우회 방지 |
| `SubwayStationLineRef` | `{ stationId, lineId(4자리 regex), lineName, lat(33~39), lng(124~132) }` |
| `SubwayStationGroupItem` | `{ id, name, lat, lng, lines[] }` — lines ≥2 = 환승역 |
| `SubwayStationSearchResult` / `SubwayNearbyResult` | `{ items, total(절단 전), fetchedAt, source: 'db' }` (+`dist` on nearby) |
| `SubwayArrivalItem` | `{ lineId, updnLine(원문), trainLineNm, destination, trainKind, trainNo, arrivalSec\|null, arrivalMsg, arrivalCode, isLastTrain, receivedAt(recptnDt→ISO) }` |
| `SubwayTrainPositionItem` | `{ trainNo, statnId, statnNm, trainStatus(원문 '0'~'3'), updnLine('0'/'1'), destinationId/Name, expressType\|null, isLastTrain, receivedAt, lat/lng nullable }` |
| `SubwayLineSection` / `SubwayLineStationItem` | `{ branchKey, branchName\|null, stations(≥2), isLoop }` / `{ stationId, name, seq, isTransfer, lat, lng }` |
| `SubwayTimetableResult` | `{ …, coverage, directions[], source: 'cache'\|'api'\|'stale' }` — directions = `{ updn, trains[], firstTrain, lastTrain }` |
| `SubwayCongestionResult` | `{ …, coverage, directions[{updn, slots[{time,level\|null}]}], source: 'db' }` |
| `SubwayPathResult` | `{ found, from, to, legs[], transferCount, approxMinutes\|null, totalRideStations, source:'db' }` — leg = 같은 호선 연속 구간, 경계 = 환승 |
| `SubwayFavoriteStationItem` / `SubwayFavoriteLineItem` | 역 그룹 스냅샷(`lines[]`) / 역×호선 스냅샷(`stationName`) |

**FE hooks ([useSubway.ts](../../packages/shared/src/hooks/useSubway.ts) · [useSubwayFavorites.ts](../../packages/shared/src/hooks/useSubwayFavorites.ts)):**

- `useSubwayStationSearch(q)` — `enabled = 1~50자`, `staleTime 24h`, **라이브**(타이핑 즉시). `placeholderData` 로 잔상 없이 갱신. 디바운스는 호출부의 `useDeferredValue`(타이머/effect 없음).
- `useSubwayNearbyStations(lat, lng, radius=1500)` — 좌표 키 소수 4자리 스냅(≈11m), `staleTime 60s`.
- `useSubwayStationArrivals(stationId)` — `refetchInterval 30s`, `staleTime 0`, `refetchIntervalInBackground` false(탭 비활성 자동 중단).
- `useSubwayLinePositions(lineId)` — `refetchInterval 30s`(역 단위 상태라 버스 15s보다 밀도 낮음 + 쿼터).
- `useSubwayLineDetail` / `useSubwayTimetable` / `useSubwayCongestion` / `useSubwayPath` — 전부 로컬/정적 데이터라 `staleTime 24h`, 폴링 없음.
- `useSubwayFavorites()` — 게스트/로그인 하이브리드 단일 인터페이스([Key Decisions](#key-decisions-coverage-high--10-sources)).

**마커/보간 유틸 ([subwayMarker.ts](../../packages/utils/src/subwayMarker.ts) · [subwayPosition.ts](../../packages/utils/src/subwayPosition.ts) · [subwayLine.ts](../../packages/utils/src/subwayLine.ts)):**

```ts
buildSubwayStationMarkerDataUrl({ selected, transfer })   // 청록 역 마커, 환승=이중 링(markerFrame 공용 골격)
buildSubwayStopDotDataUrl(color, transfer)                // 경유역 점(16×16, 환승=도넛)
buildSubwayTrainPillDataUrl({ label, color, stopped, express, highlighted })  // 열차 알약(vehiclePill 공용, 급행='급' 접두)
buildSubwayTrainDirDataUrl(color)                         // 진행 방향 다트(지도가 방위각 회전)
SUBWAY_LINES / subwayLineColor / subwayLineName / subwayLineShortLabel / subwayLineById  // 20개 노선 상수
locateTrain(sections, item, opts) → { s, bearing }        // 역간 보간 코어(상태→세그먼트 분수)
sliceForMove(index, sPrev, sCur, {isLoop}) → via[]         // 폴링 간 도로 슬라이스(순환 짧은 호)
```

## Data [coverage: high — 7 sources]

전부 [schema.prisma](../../apps/friendly/prisma/schema.prisma)에 정의되고 마이그레이션 5개로 쌓였다. **어느 즐겨찾기·순서·혼잡도 테이블도 `SubwayStation` 을 FK 로 참조하지 않는다** — 마스터 재적재·보정이 다른 테이블을 깨지 않도록(스냅샷 내성).

**역사마스터 + 검색** ([20260706160000_add_subway_stations](../../apps/friendly/prisma/migrations/20260706160000_add_subway_stations/migration.sql)):
- `SubwayStation`(`subway_stations`) — **PK = `id`(`${lineId}:${name}`)**, `@@unique([lineId, name])`. `realtimeName`(실시간 조회명이 다를 때만, '서울역'→'서울'), `statnId`(실시간 10자리 — 관측 backfill), `stationCd`(BLDN_ID 4자리 — 시간표 조인), `frCode`(순서용, 마스터엔 없어 추후). 좌표는 어댑터가 WGS84 정규화·범위 검증한 값만. `@@index([name])`·`@@index([lineId])`.
- `SubwayMasterSync`(`subway_master_syncs`) — 적재 이력(`source`/`count`/`loadedAt`). 검색 응답의 `fetchedAt`(마스터 기준일) 산출용. verify(`source: 'line-orders'`/`'congestion'`)도 이 테이블에 소스별로 기록.
- 마스터 784행 → `ROUTE`(철도노선 39종)→`lineId` 매핑으로 **672행 적재**(실시간 미제공 5개 노선 제외), verify 보정 후 **697행**(생성 31/삭제 6, `statnId` 644 backfill, `realtimeName` 48).

**노선 순서** ([20260706180000_add_subway_line_stations](../../apps/friendly/prisma/migrations/20260706180000_add_subway_line_stations/migration.sql)):
- `SubwayLineStation`(`subway_line_stations`) — `(lineId, branchKey, seq)` 유니크. `branchKey`('main' | 지선 슬러그 'seongsu' 등), `branchName`, `stationId`(→`SubwayStation.id`, FK 없음). `isLoop` 는 컬럼이 아니라 서비스 상수(`LOOP_SECTIONS = {'1002:main'}`). [load-subway-line-orders.ts](../../apps/friendly/scripts/load-subway-line-orders.ts)가 openapi `FR_CODE` 순서로 적재.

**시간표 캐시** ([20260706190000_add_subway_timetable_caches](../../apps/friendly/prisma/migrations/20260706190000_add_subway_timetable_caches/migration.sql)):
- `SubwayTimetableCache`(`subway_timetable_caches`) — **PK = `cacheKey`(`${stationId}|${dayType}`)**. 정규화 `{ coverage, directions }` JSON 을 `payload` 한 컬럼에(원자 조회, blob). `coverage:false`(광역·경전철 또는 1~9호선인데 데이터 0)도 캐싱해 무의미 재호출 차단.

**혼잡도** ([20260707120000_add_subway_congestions](../../apps/friendly/prisma/migrations/20260707120000_add_subway_congestions/migration.sql)):
- `SubwayCongestion`(`subway_congestions`) — `(lineId, stationName, dayType, updn)` 유니크. `slots` 는 `[{time,level}]` 39슬롯(05:30~23:30 + 익일 00:00/00:30) JSON. `level` 은 정원 대비 %(좌석 만석 34%). `stationId` 는 조인 성공 시만(역번호 4자리 zero-pad ↔ `stationCd` 1차, 역명+lineId 폴백), 미조인 null. `@@index([stationId])`.

**즐겨찾기** ([20260706170000_add_subway_favorites](../../apps/friendly/prisma/migrations/20260706170000_add_subway_favorites/migration.sql)):
- `SubwayFavoriteStation`(`subway_favorite_stations`) — `(userId, stationId)` 유니크. 그룹 스냅샷(`name`/`lat`/`lng`/`lines` 콤마 결합 문자열 — SQLite 배열 컬럼 부재, 서비스 경계에서 join/split).
- `SubwayFavoriteLine`(`subway_favorite_lines`) — `(userId, stationId, lineId)` 유니크. `stationName`/`lat`/`lng` 스냅샷. `User` 로만 FK Cascade(마스터엔 FK 없음).

**게스트 로컬 저장** ([subwayFavoriteStore.ts](../../packages/shared/src/stores/subwayFavoriteStore.ts)) — 비로그인 즐겨찾기는 zustand persist. 웹은 `localStorage` 자동, 앱은 storage 주입(reviewAskStore 와 같은 lazy resolver 패턴). 등록순 배열, 상한 100.

## Key Decisions [coverage: high — 10 sources]

- **내부 ID = `${lineId}:${name}` (플랜 B).** 프로브 실측: 마스터 `BLDN_ID` ≠ 실시간 `statnId` 라 조인 불가. 합성 ID + 역명 기반 실시간 조회로 완결하고, `statnId` 는 6차 위치 조인용으로 도착 API 관측 backfill(플랜 A 였다면 statnId PK). 계약(`SubwayArrivalsParams` 등)이 이 합성 ID 를 path 로 받고 라우트는 `decodeURIComponent` 트릭으로 등록.
- **역명 그룹핑 — 동일 name + 좌표 근접(≤1km)만 환승역.** ["같은 name = 환승역"은 틀린다] — **진짜 동명이역**('양평' 5호선 vs 경의중앙선, '신촌' 2호선 vs 경의중앙선)이 존재. [groupStations](../../apps/friendly/src/modules/subway/subway-master.service.ts)가 같은 name 을 좌표 단일연결 클러스터링(`STATION_CLUSTER_RADIUS_M = 1000`)해 멀면 별개 그룹으로 분리한다. 도착 API 가 역명 키라 동명이역 응답이 섞여 오므로, 서버가 그룹의 `lineId` 집합으로 필터해 오염을 차단한다. 이 함수는 검색·도착 필터·경로 환승 간선·호선 상세 `isTransfer` 가 공용.
- **호선 매핑 보정 — 마스터 ROUTE 는 철도노선, 도착 API 가 운행계통의 정답.** 마스터 `ROUTE` 는 철도노선(경원선 등) 기준이라 경원선 구간의 경의중앙 전용역(왕십리·옥수·서빙고·응봉 등)이 1호선으로 오라벨된다. [verify-subway-lines.ts](../../apps/friendly/scripts/verify-subway-lines.ts) + [subway-verify.service.ts](../../apps/friendly/src/modules/subway/subway-verify.service.ts)가 역명 그룹당 도착 1콜로 `subwayList`/`statnList`(실제 운행계통)를 관측해, 그룹과 교집합 있는 클러스터를 **병합**(GTX-A 가 자기만 표기·안산선 분할 대응)한 뒤 extra 삭제/missing 생성/`statnId` backfill/`realtimeName` 검증한다. 관측 캐시 기반 `--apply` 라 재호출 0.
- **좌표계는 값 범위 강제 — WGS84 한국(lat 33~39, lng 124~132).** 마스터 `LAT/LOT` 는 WGS84 문자열이지만 정규화 시 범위를 강제해(밖이면 drop) 계약 zod 제약과 코드 상수를 일치시킨다(버스의 값 범위 판정과 동일 정신 — 지하철은 필드 후보 순회 없이 단일 필드 검증).
- **검색·주변·노선·경로·혼잡도 = 로컬 DB, 쿼터 0.** 역사마스터를 전량 적재해 두어 라이브 검색이 가능(`source: 'db'` 를 계약으로 명시 — 버스의 cache/api/stale 구분이 없음). 마스터 0행이면 검색이 503, 단순 무매칭은 빈 결과 200(구분).
- **실시간 인프라 — 15초 마이크로 캐시 + in-flight + 일일 쿼터(도착·위치 공유).** [subway.service.ts](../../apps/friendly/src/modules/subway/subway.service.ts)의 `fetchRealtime`/`loadRealtime` 골격을 도착(2차)·위치(6차)가 재사용. 캐시는 필터 전 raw 배열을 담아 동명이역 두 그룹이 같은 조회명 캐시를 공유. 쿼터('realtime' 그룹, Asia/Seoul 경계, 기본 900)는 캐시 미스 확정 직전에만 소비, 소진 시 소비 없이 503(실시간이라 stale 폴백 없음). 단일 인스턴스 전제 모듈 싱글턴([in-memory-singleton-gates](../concepts/in-memory-singleton-gates.md)). 운영 확장 시 도착을 일괄(ALL) 서버 폴링으로 전환하는 escape hatch 는 마이크로 캐시 뒤에 숨어 라우트/계약 무변경(계획).
- **카운트다운 기준은 `recptnDt`, fetchedAt 아님.** 공식 가이드가 "현재시각과 recptnDt 차이만큼 열차가 더 진행"을 명시하므로, `recptnToIso` 가 KST 를 `+09:00` 명시로 ISO 정규화해 계약에 싣는다 — 마이크로 캐시로 fetchedAt 이 과거여도 카운트다운이 정확.
- **열차 위치 — GPS 없는 역간 보간(6차 코어).** 실시간 위치는 현재역(`statnId`)+상태(`trainStatus`)뿐이라, 서버가 마스터 조인으로 역 좌표를 enrich(실패 null, 부가 정보)하고 FE 가 5차 순서(sections)와 조합해 [locateTrain](../../packages/utils/src/subwayPosition.ts)으로 위치를 추정한다: 상태→세그먼트 분수(`'3'전역출발 0.2 / '0'진입 0.9 / '1'도착 1.0 / '2'출발 다음세그 0.1`), 방향은 행선(`statnTid`) seq 비교 1차·`updnLine`('0'/'1') 폴백. 프로브 실증: 급행도 통과역을 statnId 로 보고(급행 Δ1=일반 Δ1), 2호선 순환은 updn 혼재라 행선 필수, 올림픽공원은 위치/도착 statnId 가 서로 달라 역명 폴백. `sliceForMove` 가 폴링 간 도로 슬라이스(순환 짧은 호), MapCanvas rAF tween(28초) 무수정 재사용.
- **노선 형상 = 역 좌표 근사 폴리라인(공공 API 부재).** 별도 path 배열 없이 `sections[].stations` 좌표를 이어 그린다. 지선(2호선 성수/신정, 5호선 마천 등)은 `FR_CODE` 로 `branchKey` 를 나눠 section 분리(단일 배열이면 지도에서 지그재그). 2호선 본선 순환은 서버가 첫 역을 끝에 복제하지 않고 FE 가 `isLoop` 로 닫는다.
- **경로 탐색 — 로컬 그래프 다익스트라(유료 API 불필요).** [subway-path.service.ts](../../apps/friendly/src/modules/subway/subway-path.service.ts): 노드=역×호선, 운행 간선=순서 인접 seq(`RIDE_SEC_PER_STATION = 120`), 환승 간선=역명 근접 그룹 내 쌍(`TRANSFER_SEC = 240`), 2호선 순환은 loop 간선(짧은 호 자동), 지선은 공용 정차역의 동일 stationId 노드 공유로 자연 반영. 비용 `(초, 환승수)` 사전순(동률이면 환승 적은 쪽). 그래프는 lazy 1회 구축(TTL 30일 + in-flight 합류), 의존성 없는 이진 힙. **선두/후미 환승 간선(출발·도착역 플랫폼 이동)은 leg·환승수·소요에서 제외** — 강남→서울역이 환승 2가 아닌 1(사당)로 상식 정합.
- **즐겨찾기 하이브리드 — 게스트 로컬 + 로그인 서버 + union 병합.** 게스트는 store, 로그인은 서버 목록을 React Query 로. 로그인 직후 게스트 저장분을 서버로 union 병합(sync 1회, 서버에 없는 것만 insert·상한 초과분 조용히 skip). sync 는 외부 시스템 동기화라 [useSubwayFavorites](../../packages/shared/src/hooks/useSubwayFavorites.ts)가 `useEffect` 로 발사(`syncedRef` StrictMode 가드), 파생 판정(`isFavorite`)은 렌더 중 계산. 버스 즐겨찾기와 미러 구조.
- **URL 이 유일 진실 — `q`/`near`/`stn`/`line`/`to`.** [SubwayPage](../../apps/web/src/routes/SubwayPage.tsx)가 이 5개를 URL 에 동기화(버스의 `q`/`stId`/`routeId`/`near` 와 1:1 대응 계보) — 새로고침/공유/딥링크 시 Geolocation 재요청 없이 복원. 자동 재조회(패닝) 좌표만 로컬 상태(`autoNear`, history 오염 방지). 단 **검색 입력값은 로컬 state 가 진실이고 URL `q` 는 쓰기 전용 미러** — URL 을 input value 에 직결하면 라우터 리렌더가 한글 IME 조합을 리셋해 첫 글자가 유실된다(실측 "강남"→"남").
- **패널 우선순위 — 시간표 > 길찾기 > 도착(배타).** 좌패널/모바일 하단이 선택 역에서 세 뷰로 전환되며, 열기 핸들러가 서로를 닫아 동시에 참이 아니다. line 추적과 길찾기(`to`)는 폴리라인 충돌로 배타.
- **탭 통합 — `/bus` + `/subway`, 라우트 전환 = 탭.** [TransitTabs](../../apps/web/src/components/transit/TransitTabs.tsx)가 슬림 행으로 배치, 지도 인스턴스는 공유하지 않되(각 페이지가 소유) **OL Map 을 모듈 풀에 보관(D안 `poolKey`)**해 탭 전환 타일 플래시를 제거한다(데스크톱/모바일 동시 마운트라 `transit-desktop`/`transit-mobile` 키 분리). A안(뷰포트 이어보기)은 풀이 빈 새로고침 복원용 보완재로 유지.
- **Zod SSOT — buildless.** 계약 1개 변경이 FE/BE 컨슈머를 컴파일 타임에 동기화, `fastify-type-provider-zod` 가 검증 + OpenAPI 자동 생성([zod-ssot-buildless](../concepts/zod-ssot-buildless.md)).

## Gotchas [coverage: high — 8 sources]

- **HTTP 200 + 본문 에러 — status 신뢰 금지.** 두 포털 모두 정상/에러/데이터없음을 본문 코드로만 구분한다. swopen 정상은 `{ errorMessage:{code:'INFO-000'}, <list>:[...] }`, 데이터 없음은 톱레벨 단독 `{ code:'INFO-200' }`, openapi 는 `RESULT.CODE`. 어댑터의 `throwIfError` 가 `INFO-000`/`INFO-200` 통과, `INFO-100` 인증실패(503), 그 외 502.
- **`INFO-200`(데이터 없음)은 에러가 아니라 정상 빈 배열.** 서울 밖 역·심야 운행종료가 여기로 떨어진다. 에러로 다루면 오탐 — FE 는 "운행 종료 또는 실시간 미제공 역" 안내로 흡수.
- **JSON 인데 숫자가 문자열로 온다.** `LAT "37.556228"`, `barvlDt "90"` 등. `numOrNull` 로 명시 변환하고, 선행 0 이 있는 코드성 값(`stationCd`)은 `strOrNull` 로 보존(버스의 `parseTagValue:false` 대응). 단건 `row`/`realtimeArrivalList` 가 객체로 떨어지는 함정은 `readSwopenList`/`readSeoulResult` 가 배열 강제.
- **`updnLine` 인코딩이 API 마다 다르다.** 도착은 텍스트('상행'/'하행'/'내선'/'외선'), 위치는 숫자문자열('0'/'1'). 서로 변환하지 않고 각각 원문 보존 — 위치의 진행 방향은 `updnLine` 이 아니라 행선(`statnTid`) seq 비교가 1차 근거.
- **`statnId` 불일치 역(위치 vs 도착).** 올림픽공원처럼 같은 역인데 두 API 의 `statnId` 가 달라, 위치 보간은 statnId 조인이 아니라 **역명(`statnNm`) 조인**으로 sections 와 맞춘다(계약에 마스터 statnId 를 안 싣는 이유).
- **동명이역 응답 오염.** '양평'/'신촌' 조회 1콜에 두 물리 역(다른 호선)이 섞여 온다 — 서버가 그룹 `lineId` 집합으로 필터. verify 는 `subwayList` 로 클러스터를 나눠 자동 분리(동명이역은 교집합 0).
- **한글 IME 조합 유실.** URL `q` 를 input value 에 직결하면 라우터 리렌더가 조합 세션을 리셋해 첫 글자가 유실("강남"→"남") — 입력 진실은 로컬 state, URL 은 쓰기 전용 미러, 초기값만 lazy initializer 로 복원(뒤로가기 등 외부 URL 변경은 input 에 역반영 안 함).
- **시간표/혼잡도 커버리지 한정.** 시간표는 **1~9호선(중전철)만**(`TIMETABLE_LINES`), 혼잡도는 **1~8호선만** 제공 — 나머지(광역·경전철·9호선 혼잡)는 `coverage:false` + 200(404 아님, "미제공" 라벨 + "정적 통계" 라벨). 시간표 `ARRIVETIME` 은 자정 넘김을 24/25시로 표기('24:46:00', '00:00:00' 미관측)라 문자열 정렬이 곧 시각 순서(0시 wraparound 없음).
- **라이브 스모크는 쿼터 초과(`ERROR-337`)를 skip.** [subway-api.live.test.ts](../../apps/friendly/src/modules/subway/subway-api.live.test.ts)가 폴링·적재로 쿼터를 소진한 날 스위트가 종일 빨개지는 것을 막되, `ERROR-337` 코드만 정밀 skip(SubwayApiError 전체를 삼키면 응답 형식 회귀까지 가려짐). 인증 실패(키 미승인/동기화 지연)도 skip. 테스트 시드는 `subwaytest-`/placeholder 키로 실호출 차단.
- **키 URL path 노출.** 키가 path 세그먼트라 쿼리파람보다 새기 쉽다 — 로그·에러·프로브 덤프 전부 `***` 마스킹(어댑터 `requestUrl` + `scrubKey` 이중, 프로브/스크립트도 동일 규율).
- **개발 함정(버스 계승).** 브랜치 전환/rebase 후 `prisma generate` 필수(client 불일치면 `prisma.subwayStation` undefined), dev DB 에 vworld 키 미등록이면 지도는 placeholder(설계된 폴백, 리스트는 동작), 포트 3000 이중 바인딩. 1차 마이그레이션은 기존 무관 drift 때문에 `migrate diff` 수기 작성 + `migrate deploy` 로 비파괴 우회했다.
- **미구현·미확정.** 9차(환승·출구)는 TAGO 게이트웨이 대기로 미구현. `SUBWAY_LINES` 의 신림선(1094)은 문헌 추정(프로브 미검증), 일부 `positionParam` 은 관례 표기 추정(주석의 `verified` 만 실검증). 실시간 미제공 역의 도착 실패는 `INFO-200` 이라 '표기 불일치로 조용히 실패'와 구분 불가 — 필요 시 전 역 1회 검증 스크립트(쿼터 ~800콜, 별도 날).
- ~~앱 미구현~~ → **앱 대중교통 화면 존재(2026-07~)** — 검색·도착·따라가기에 더해 탑승 모드·하차 지점/알림·실형상 렌더까지 앱이 앞서 있다([transit](transit.md)). 게스트 즐겨찾기 storage 주입(setSubwayFavoriteStorage)도 앱 entry 에 배선됨.

## Sources [coverage: high — 64 sources]

**백엔드 (friendly)**
- [apps/friendly/src/modules/subway/subway-api.adapter.ts](../../apps/friendly/src/modules/subway/subway-api.adapter.ts)
- [apps/friendly/src/modules/subway/subway.service.ts](../../apps/friendly/src/modules/subway/subway.service.ts)
- [apps/friendly/src/modules/subway/subway.route.ts](../../apps/friendly/src/modules/subway/subway.route.ts)
- [apps/friendly/src/modules/subway/subway-master.service.ts](../../apps/friendly/src/modules/subway/subway-master.service.ts)
- [apps/friendly/src/modules/subway/subway-path.service.ts](../../apps/friendly/src/modules/subway/subway-path.service.ts)
- [apps/friendly/src/modules/subway/subway-line-order.service.ts](../../apps/friendly/src/modules/subway/subway-line-order.service.ts)
- [apps/friendly/src/modules/subway/subway-congestion.service.ts](../../apps/friendly/src/modules/subway/subway-congestion.service.ts)
- [apps/friendly/src/modules/subway/subway-verify.service.ts](../../apps/friendly/src/modules/subway/subway-verify.service.ts)
- [apps/friendly/src/modules/subway/subway-favorite.service.ts](../../apps/friendly/src/modules/subway/subway-favorite.service.ts)
- [apps/friendly/src/modules/subway/subway-favorite.route.ts](../../apps/friendly/src/modules/subway/subway-favorite.route.ts)
- [apps/friendly/src/modules/subway/subway.test.ts](../../apps/friendly/src/modules/subway/subway.test.ts)
- [apps/friendly/src/modules/subway/subway-api.adapter.test.ts](../../apps/friendly/src/modules/subway/subway-api.adapter.test.ts)
- [apps/friendly/src/modules/subway/subway-api.live.test.ts](../../apps/friendly/src/modules/subway/subway-api.live.test.ts)
- [apps/friendly/src/modules/subway/subway-path.test.ts](../../apps/friendly/src/modules/subway/subway-path.test.ts)
- [apps/friendly/src/modules/subway/subway-line-order.test.ts](../../apps/friendly/src/modules/subway/subway-line-order.test.ts)
- [apps/friendly/src/modules/subway/subway-congestion.test.ts](../../apps/friendly/src/modules/subway/subway-congestion.test.ts)
- [apps/friendly/src/modules/subway/subway-verify.test.ts](../../apps/friendly/src/modules/subway/subway-verify.test.ts)
- [apps/friendly/src/modules/subway/subway-favorite.test.ts](../../apps/friendly/src/modules/subway/subway-favorite.test.ts)
- [apps/friendly/src/modules/subway/__fixtures__/](../../apps/friendly/src/modules/subway/__fixtures__/) (arrival/position/master/info-100/info-200/error-500 실덤프)
- [apps/friendly/src/config/env.ts](../../apps/friendly/src/config/env.ts)
- [apps/friendly/prisma/schema.prisma](../../apps/friendly/prisma/schema.prisma)

**스크립트 (friendly)**
- [apps/friendly/scripts/probe-subway-api.ts](../../apps/friendly/scripts/probe-subway-api.ts)
- [apps/friendly/scripts/load-subway-stations.ts](../../apps/friendly/scripts/load-subway-stations.ts)
- [apps/friendly/scripts/load-subway-line-orders.ts](../../apps/friendly/scripts/load-subway-line-orders.ts)
- [apps/friendly/scripts/load-subway-congestion.ts](../../apps/friendly/scripts/load-subway-congestion.ts)
- [apps/friendly/scripts/verify-subway-lines.ts](../../apps/friendly/scripts/verify-subway-lines.ts)
- [apps/friendly/scripts/probe-subway-positions.ts](../../apps/friendly/scripts/probe-subway-positions.ts)
- [apps/friendly/scripts/probe-subway-timetable.ts](../../apps/friendly/scripts/probe-subway-timetable.ts)

**마이그레이션 (friendly)**
- [20260706160000_add_subway_stations](../../apps/friendly/prisma/migrations/20260706160000_add_subway_stations/migration.sql)
- [20260706170000_add_subway_favorites](../../apps/friendly/prisma/migrations/20260706170000_add_subway_favorites/migration.sql)
- [20260706180000_add_subway_line_stations](../../apps/friendly/prisma/migrations/20260706180000_add_subway_line_stations/migration.sql)
- [20260706190000_add_subway_timetable_caches](../../apps/friendly/prisma/migrations/20260706190000_add_subway_timetable_caches/migration.sql)
- [20260707120000_add_subway_congestions](../../apps/friendly/prisma/migrations/20260707120000_add_subway_congestions/migration.sql)

**계약 (api-contract)**
- [packages/api-contract/src/schemas/subway.ts](../../packages/api-contract/src/schemas/subway.ts)
- [packages/api-contract/src/schemas/subway-favorite.ts](../../packages/api-contract/src/schemas/subway-favorite.ts)
- [packages/api-contract/src/routes.ts](../../packages/api-contract/src/routes.ts)

**공유 (shared)**
- [packages/shared/src/api/subway.api.ts](../../packages/shared/src/api/subway.api.ts)
- [packages/shared/src/api/subway-favorite.api.ts](../../packages/shared/src/api/subway-favorite.api.ts)
- [packages/shared/src/hooks/useSubway.ts](../../packages/shared/src/hooks/useSubway.ts)
- [packages/shared/src/hooks/useSubwayFavorites.ts](../../packages/shared/src/hooks/useSubwayFavorites.ts)
- [packages/shared/src/stores/subwayFavoriteStore.ts](../../packages/shared/src/stores/subwayFavoriteStore.ts)

**유틸 (utils)**
- [packages/utils/src/subwayLine.ts](../../packages/utils/src/subwayLine.ts)
- [packages/utils/src/subwayMarker.ts](../../packages/utils/src/subwayMarker.ts)
- [packages/utils/src/subwayPosition.ts](../../packages/utils/src/subwayPosition.ts)
- [packages/utils/src/subwayPosition.test.ts](../../packages/utils/src/subwayPosition.test.ts)
- [packages/utils/src/vehiclePill.ts](../../packages/utils/src/vehiclePill.ts)

**웹 (web)**
- [apps/web/src/routes/SubwayPage.tsx](../../apps/web/src/routes/SubwayPage.tsx)
- [apps/web/src/components/subway/SubwayArrivalPanel.tsx](../../apps/web/src/components/subway/SubwayArrivalPanel.tsx)
- [apps/web/src/components/subway/SubwayLineBadge.tsx](../../apps/web/src/components/subway/SubwayLineBadge.tsx)
- [apps/web/src/components/subway/SubwayStationList.tsx](../../apps/web/src/components/subway/SubwayStationList.tsx)
- [apps/web/src/components/subway/SubwayStationsMap.tsx](../../apps/web/src/components/subway/SubwayStationsMap.tsx)
- [apps/web/src/components/subway/SubwayTimetable.tsx](../../apps/web/src/components/subway/SubwayTimetable.tsx)
- [apps/web/src/components/subway/SubwayPathPanel.tsx](../../apps/web/src/components/subway/SubwayPathPanel.tsx)
- [apps/web/src/components/subway/SubwayNearbyBusSection.tsx](../../apps/web/src/components/subway/SubwayNearbyBusSection.tsx)
- [apps/web/src/components/subway/timetableUtils.ts](../../apps/web/src/components/subway/timetableUtils.ts)
- [apps/web/src/components/subway/congestionUtils.ts](../../apps/web/src/components/subway/congestionUtils.ts)
- [apps/web/src/components/transit/TransitTabs.tsx](../../apps/web/src/components/transit/TransitTabs.tsx)
- [apps/web/src/components/transit/CrossSearchSection.tsx](../../apps/web/src/components/transit/CrossSearchSection.tsx)
- [apps/web/src/components/transit/TransitFavoritesSection.tsx](../../apps/web/src/components/transit/TransitFavoritesSection.tsx)
- [apps/web/src/components/transit/TransitCrossToggleChip.tsx](../../apps/web/src/components/transit/TransitCrossToggleChip.tsx)
- [apps/web/src/components/transit/transitMapViewport.ts](../../apps/web/src/components/transit/transitMapViewport.ts)
- [apps/web/src/components/restaurant/MapCanvas.tsx](../../apps/web/src/components/restaurant/MapCanvas.tsx)
- [apps/web/src/App.tsx](../../apps/web/src/App.tsx)

**배경 문서**
- [docs/PLAN-subway.md](../../docs/PLAN-subway.md)
