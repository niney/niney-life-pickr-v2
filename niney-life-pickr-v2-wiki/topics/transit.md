---
topic: transit
type: codebase
last_compiled: 2026-08-17
source_count: 24
status: active
aliases: [transit, 대중교통, 버스-지하철-통합, 통합-레이어, TransitTabs, TransitFavoritesSection, CrossSearchSection, SubwayCrossSection, BusCrossSection, TransitCrossToggleChip, transitMapViewport, transitFavExpandStore, transitCrossShowStore, 통합-즐겨찾기, 통합-주변, 통합-검색, 크로스-검색, cross-search, 겸표시, overlay-marker, overlayMarkers, onOverlaySelect, x-subway, x-bus, marker-prefix, poolKey, transit-desktop, transit-mobile, map-instance-pool, 지도-인스턴스-풀, viewport-carryover, 뷰포트-이어보기, A안, D안, dual-mount, 이중-마운트, 데스크톱-모바일-동시마운트, submittedQ, 제출-게이트, quota-proportional, 쿼터-비례, deep-link-symmetry, 딥링크-대칭, SubwayNearbyBusSection, 주변-버스-정류장, 13차, 14차, 15차, 집중-모드, retry-pause, be-무변경]
---

# transit

**2026-07-10~25 변경 흡수 — 앱(`apps/mobile`) 대중교통 화면이 웹을 추월**: 이 문서의 본문은 웹 통합 레이어 기준이지만, 7월 중순 이후 앱 대중교통 화면([mobile](mobile.md) 의 transit.tsx + useTransitScreen + WebView 지도)이 대거 확장돼 **앱에만 있는 기능**이 생겼다. 요약(전부 BE·계약 무변경, 상세는 커밋 본문): ① **최근 검색 자동완성(`6867d66`)** — 모드별 검색어 10·선택 장소 20 을 AsyncStorage zustand 로 로컬 저장(NFC 정규화), 선택 장소만 좌표 스냅샷 기록·재선택 시 스냅샷 복원 후 도착만 최신 조회. ② **내 위치 근처 빠른 선택(`48ab6a0`)** — 헤더 근처 액션이 버스 500m·지하철 1.5km 를 한 카드로(각 최대 3), 반대편 정류장 오선택 방지를 위해 자동 선택 없음. ③ **탑승 모드(`481846d`)** — reducer 최상위 pinned 상태로 따라가던 차량이 검색·모드전환·뒤로가기에도 유지(usePinnedVehicle 상시 폴링, 명시 종료/운행 종료만 해제), 차량 탭=즉시 탑승. ④ **탑승 상세(`916d71e`)** — 핀 차량의 실시간 상세 패널(버스: 정차/주행·차량번호판·앞으로 지날 정류장 / 지하철: 현재역·급행/막차·이후 역), locateTrain 의 구간 판정을 resolveTrainSection 으로 분리해 지도 보간과 단일 판정. ⑤ **하차 지점(`ddb2a8e`)** — '앞으로 지나요' 행에서 하차 지정 → 그 역 도착정보에 내 차량(trainNo/vehId)을 조인해 카운트다운, 도착정보 미포착 시 위치 기반 N번째 폴백. ⑥ **하차 알림(`1d2a101`)** — 백그라운드 폴링 중단을 '감지'가 아닌 '예약'으로 우회: 실측(도착정보 잔여초) > 추정(남은 정차 수 × 평균 소요) 2단계 근거로 로컬 알림을 도착 90초 전 예약, 폴링마다 재예약(expo-notifications, CNG prebuild 필요). ⑦ UX 픽스 3건 — Detail 시트 드래그 닫힘 방지(`caf58ec`)·길찾기 키보드 시트 연동(`b0399d0`)·따라가기 칩이 시트에 가리던 것(`5660811`, animatedPosition 앵커 + zIndex 40). ⑧ **실형상 렌더(`a13eadc`)** — [subway](subway.md) 실형상을 앱 지도에서 폴리라인·열차 보간(stationS anchor)으로 소비 + 노선 casing. 웹 쪽 신규는 **식당 상세 "가는 법" 탭(`fa8f067`)** — 주변 정류장 500m·지하철역 1.5km 로컬 조회 즉시 로드 + 행 선택 시만 인라인 도착(섹션당 1개, 30초 폴링), 딥링크 `/bus?near=&stId=`·`/subway?near=&stn=` 재사용([web](web.md)).

버스(`/bus`)와 지하철(`/subway`)이라는 두 완성 도메인을 **하나의 "대중교통" 경험**으로 잇는 **웹 FE 통합 레이어**(+ 위 흡수분처럼 앱 대중교통 화면이 별도로 존재). 새 백엔드·새 라우트·새 테이블이 없다 — 세 축(즐겨찾기·주변·검색)의 크로스와 연속된 지도 경험 전부가 **기존 API·훅의 FE 조합**이다(계약 변경 0). 커밋 히스토리상 지도 연속성(A안 뷰포트 이어보기 `de382a0` → D안 인스턴스 풀 `4128d6b`)이 먼저 깔리고, 그 위에 통합 13차(즐겨찾기 `6a3e337`) → 14차(주변 겸표시 `8a48b49`) → 15차(검색 크로스 `dd1a9fe`)가 쌓였다. 지하철→버스 단방향 연계인 지하철 12차(`79a800b`, [SubwayNearbyBusSection](../../apps/web/src/components/subway/SubwayNearbyBusSection.tsx))가 통합의 딥링크 계약을 처음 확립한 씨앗이다. 계획·사용자 결정 4건은 [PLAN-transit-unified.md](../../docs/PLAN-transit-unified.md). 각 도메인 자체는 [bus](bus.md)·[subway](subway.md), 지도 인프라는 [map](map.md).

## Purpose [coverage: high — 6 sources]

대중교통 레이어가 제공하는 것은 "버스와 지하철을 한 몸처럼 쓰는 느낌"이다. 구체적으로 네 가지가 두 페이지에 대칭으로 얹힌다:

1. **탭 2개 + 연속된 지도** — [TransitTabs](../../apps/web/src/components/transit/TransitTabs.tsx)가 `/bus`·`/subway`를 슬림한 서브탭으로 묶고, 탭 전환 시 지도가 기본 뷰로 리셋되지 않고 **마지막 보던 위치·타일을 그대로 이어**본다(뷰포트 이어보기 + 지도 인스턴스 풀링).
2. **통합 즐겨찾기(13차)** — 양 탭 초기화면 최상단에 버스 정류장 / 정류장×노선 / 지하철 역 / 역×호선 4종을 **한 목록**으로. 항목을 펼치면 그때 도착 미리보기.
3. **통합 주변 겸표시(14차)** — 버스 탭 주변 모드에 지하철역을, 지하철 탭 주변 모드에 정류장을 지도에 함께 표시. 우상단 토글 칩으로 on/off.
4. **통합 검색 크로스(15차)** — 각 탭 검색 결과 하단에 상대 도메인 결과("지하철역 N건"/"정류장 N건") + 상대 탭 딥링크.

이 레이어를 관통하는 **단 하나의 설계 대원칙은 "BE 신규 없음"**이다 — 세 크로스 축 전부가 이미 있는 훅(`useBus*`/`useSubway*`)의 조합이며 서버·계약·DB 를 건드리지 않는다([PLAN "설계 대원칙"](../../docs/PLAN-transit-unified.md)). 두 번째 제약은 상속된 것이다: 버스 도메인의 **서울시 일 1,000건 쿼터**([bus](bus.md))가 통합 UX 에도 그대로 흘러, "쿼터 소비가 사용자 의도·업스트림 비용에 비례"하도록 각 크로스의 발화 시점이 서로 다르게 조율된다(아래 [Key Decisions](#key-decisions-coverage-high--8-sources)).

별도 홈 탭·신규 라우트를 만들지 않은 것도 의도다 — 통합은 **기존 두 페이지 위에 얹는 섹션·오버레이**로만 존재하고, URL 계약(`q`/`stId`/`stn`/`near`/`routeId`/`line`)은 무변경이다. 버스와 마찬가지로 **앱(`apps/mobile`)에는 없다 — 웹 전용**이다.

## Architecture [coverage: high — 9 sources]

통합은 백엔드 파이프라인이 아니라 **두 페이지 컴포넌트(BusPage/SubwayPage)가 공유하는 FE 조립 규약**이다. 층이 아니라 축으로 이해하는 게 맞다.

```
대중교통 = TransitTabs[ 버스 | 지하철 ]  (NavLink 라우팅 + active prop 강조)
  │
  ├─ /bus     → BusPage      ─┐  각 페이지 = 데스크톱(hidden xl:flex) + 모바일(xl:hidden)
  └─ /subway  → SubwayPage   ─┘  두 레이아웃을 CSS 숨김으로 "동시 마운트" (핵심 함정)

 ① 연속된 지도 경험 (지도가 리셋되지 않음)
    A안 transitMapViewport  — 모듈 싱글턴 1개(양 탭 공유). moveend 저장 / 마운트 복원
    D안 mapPool (MapCanvas) — poolKey "transit-desktop"·"transit-mobile" 각각 재사용
                              언마운트 시 OL Map 을 파괴 않고 풀 보관 → setTarget 이어받기

 ② 통합 즐겨찾기 (TransitFavoritesSection)  — 양 탭 초기화면 공용, 4종 한 목록
      펼침 상태 = transitFavExpandStore(zustand, 단일 아코디언)
      도착 미리보기 = useBus/SubwayStationArrivals (펼친 1행만 enabled)

 ③ 통합 주변 겸표시 (MapCanvas.overlayMarkers + TransitCrossToggleChip)
      상대 도메인 마커 = 기존 nearby 훅 재사용, id prefix "x-subway:"/"x-bus:"
      토글 = transitCrossShowStore(zustand persist, 양 탭 공유)

 ④ 통합 검색 크로스 (CrossSearchSection: SubwayCrossSection / BusCrossSection)
      상대 도메인 검색 = useSubway/BusStationSearch, 행 클릭 → 상대 탭 딥링크(q+선택)

 공유 상태 승격: 스토어(펼침·토글) · 페이지 state(submittedQ) · RQ dedupe · 풀 키 분리
 재료 전부 @repo/shared 기존 훅 — BE·계약·DB 변경 0
```

### 연속된 지도 경험 — A안 + D안 이중 안전망

탭 전환은 라우트 언마운트라 지도가 매번 재생성돼 두 종류의 리셋이 생긴다: **뷰포트 리셋**(기본 뷰로)과 **타일 재로드 플래시**. 두 문제를 다른 도구로 각각 막고, 서로의 빈틈을 메운다.

- **A안 — 뷰포트 이어보기** ([transitMapViewport.ts](../../apps/web/src/components/transit/transitMapViewport.ts)): 버스·지하철 **공용 모듈 싱글턴 1개**(탭별 분리 아님)에 마지막 중심·줌을 저장. 저장은 각 지도 어댑터의 `moveend`(`onViewportSync`), 복원은 마운트 시 `initialCenter` 로. 새로고침/직접 진입에는 소실(모듈 스코프) — 의도된 동작. 딥링크·선택 flyTo·검색 fit 규칙은 무변경(저장 뷰포트는 '지시 없을 때'의 시작점).
- **D안 — OL 인스턴스 풀** ([MapCanvas.tsx](../../apps/web/src/components/restaurant/MapCanvas.tsx) `mapPool`): `poolKey` 를 준 MapCanvas 는 언마운트 시 OL Map 을 파괴하지 않고 모듈 풀에 보관 → 다음 마운트가 `setTarget` 으로 이어받아 **타일 캐시·뷰포트·레이어 선택을 통째 유지**. A안만으론 못 막던 타일 플래시가 사라진다.

둘은 **보완재**다: 풀이 살아 있으면(SPA 내 탭 왕복) D안이 뷰포트째 잇고, 풀이 빈 상태(새로고침/직접 진입)면 A안 저장값이 `initialCenter` 로 복원한다. `poolKey` 미지정(식당·어드민 지도)은 두 메커니즘 모두 손대지 않아 **공용 컴포넌트 회귀가 원천 차단**된다.

### 이중 마운트 — 이 레이어의 중력

BusPage/SubwayPage 는 데스크톱(`hidden xl:flex`)과 모바일(`xl:hidden`) 레이아웃을 **CSS 로만 숨겨 항상 둘 다 마운트**한다(실측 기반 선택). 그래서 페이지당 지도·섹션·훅이 **2 인스턴스씩 동시 생존**한다. 이 사실이 통합 레이어의 거의 모든 상태 설계를 규정한다:

- **네트워크는 안전** — 두 인스턴스가 같은 `queryKey` 를 구독하면 React Query 가 dedupe 해 콜은 1회.
- **로컬 state 는 갈라진다** — 한쪽에서 펼치거나 토글해도 다른 쪽은 그대로. 따라서 공유가 필요한 상태(펼침·겸표시 토글)는 **zustand 스토어로 승격**하고, 페이지 단위 상태(제출 검색어)는 **페이지 state 로 두면 두 자식에 자연 공유**된다.
- **지도 풀은 키를 나눠야** — 단일 `poolKey` 면 동시 마운트된 두 지도가 한 map 을 다퉈 한쪽만 재사용된다. `transit-desktop`/`transit-mobile` 로 분리해 **페이지당 풀 엔트리 2개**(총 인스턴스 수는 종전과 동일).

### 세 크로스 축의 발화 대칭

| 축 | 컴포넌트 | 상대 도메인 조회 | 발화 시점 | 쿼터 |
|---|---|---|---|---|
| 즐겨찾기(13차) | [TransitFavoritesSection](../../apps/web/src/components/transit/TransitFavoritesSection.tsx) | `useBus/SubwayStationArrivals` | **펼침 시에만**(단일 아코디언) | 실시간 1콜/refetch |
| 주변(14차) | `overlayMarkers` + [TransitCrossToggleChip](../../apps/web/src/components/transit/TransitCrossToggleChip.tsx) | `useSubway/BusNearbyStations` | 주변 모드 진입 시(토글 off 여도 조회) | 지하철 0 / 버스 셀캐시 |
| 검색(15차) | [CrossSearchSection](../../apps/web/src/components/transit/CrossSearchSection.tsx) | `useSubway/BusStationSearch` | 버스탭→지하철 자동 / 지하철탭→버스 **제출 시** | 지하철 0 / 버스 캐시 |

## Talks To [coverage: high — 8 sources]

- **[bus](bus.md) 도메인** — 정류장 검색/주변/도착 훅(`useBusStationSearch`·`useBusNearbyStations`·`useBusStationArrivals`), 즐겨찾기(`useBusFavorites`), 마커 빌더(`buildBusStopMarkerDataUrl`), 딥링크(`/bus?stId=&routeId=&near=`). 통합의 모든 "버스 쪽"이 여기서 온다.
- **[subway](subway.md) 도메인** — 역 검색/주변/도착 훅(`useSubwayStationSearch`·`useSubwayNearbyStations`·`useSubwayStationArrivals`), 즐겨찾기(`useSubwayFavorites`), 마커 빌더(`buildSubwayStationMarkerDataUrl`), 딥링크(`/subway?stn=&near=`). 12차 [SubwayNearbyBusSection](../../apps/web/src/components/subway/SubwayNearbyBusSection.tsx)이 지하철→버스 연계의 원형.
- **[map](map.md) 도메인 (MapCanvas)** — 통합이 MapCanvas 에 **두 확장을 추가**했다: (1) `poolKey` 인스턴스 풀링, (2) `overlayMarkers`/`onOverlaySelect` fit 제외 오버레이 레이어. 두 지도 래퍼([BusStationsMap](../../apps/web/src/components/bus/BusStationsMap.tsx)·[SubwayStationsMap](../../apps/web/src/components/subway/SubwayStationsMap.tsx))가 이 prop 을 페이지에서 받아 넘긴다. 지도 인프라 전반은 [map](map.md).
- **[shared](shared.md) 훅 (재사용, 신규 0)** — 통합은 새 API 클라이언트·훅을 추가하지 않는다. 양 도메인의 기존 훅을 한 페이지에서 함께 호출할 뿐(각 훅은 "페이지당 1회" 규칙 — 로그인 직후 게스트 병합 부수효과 때문. BusPage 가 `useBusFavorites`+`useSubwayFavorites` 를 각 1회).
- **네비게이션** — [PublicSidebar](../../apps/web/src/components/PublicSidebar.tsx)·[PublicTopBar](../../apps/web/src/components/PublicTopBar.tsx)의 "대중교통" 항목이 `to: '/bus'`, `match: ['/bus', '/subway']` — 한 메뉴가 두 라우트를 대표해 어느 탭에 있어도 활성.
- **라우트** — [App.tsx](../../apps/web/src/App.tsx)가 `/bus`·`/subway` 를 PublicLayout 아래 공개 라우트로(비로그인, 맛집과 동일 정책), 각각 `React.lazy` 청크로 분할.
- **zustand 스토어** — [transitFavExpandStore](../../apps/web/src/stores/transitFavExpandStore.ts)(펼침, 비영속)·[transitCrossShowStore](../../apps/web/src/stores/transitCrossShowStore.ts)(겸표시 토글, `localStorage` persist). 이중 마운트 인스턴스 간 상태 공유가 존재 이유.

## API Surface [coverage: high — 8 sources]

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
- `poolKey?: string` — 지정 시 이 키로 OL Map 을 모듈 풀에 보관/재사용. 마운트 수명 동안 불변으로 간주(deps 제외). 같은 키를 동시에 두 MapCanvas 가 쓰면 안 됨 → 대중교통은 `transit-desktop`/`transit-mobile` 로 분리.

**공유 스토어 인터페이스:**

```ts
// transitFavExpandStore (비영속 — 소멸성 UI 상태)
{ expandedKey: string | null; toggle(key): void; collapse(): void }   // 단일 아코디언

// transitCrossShowStore (persist 'lp:transit-cross-show' — 사용자 선택)
{ show: boolean; toggle(): void; setShow(v): void }                    // 기본 on

// transitMapViewport (모듈 싱글턴 — persist 아님)
saveTransitViewport(v: {lat,lng,zoom}) / readTransitViewport(): TransitViewport | null
```

## Data [coverage: high — 6 sources]

**통합 레이어는 새 DB 테이블·prisma 스키마·마이그레이션이 0이다** (BE 무변경 원칙). "데이터"는 전부 클라이언트 측 상태와 **재사용되는 기존 캐시**다.

**클라이언트 상태 3계층 (수명별):**

| 저장소 | 대상 | 수명 | 이유 |
|---|---|---|---|
| **localStorage persist** | `transitCrossShowStore`(겸표시 토글) | 재방문 후에도 | 사용자 선택이라 기억(13차 관례 + persist) |
| **모듈 싱글턴/스토어(비영속)** | `transitFavExpandStore`(펼침), `transitMapViewport`(뷰포트), `mapPool`(OL 인스턴스) | 모듈 수명(새로고침 시 소실) | 소멸성 UI/전환 상태 — 새로고침엔 접힘·기본 뷰로 |
| **페이지 state** | `submittedQ`(확정 검색어), `autoNear`(자동 재조회 좌표), `pendingFollow` 등 | 페이지 마운트 | 이중 마운트 두 자식에 자연 공유, URL 오염 회피 |

**재사용 캐시 (통합이 새로 만들지 않음):** 크로스 조회는 전부 기존 캐시에 얹힌다 — 지하철 검색/주변은 **로컬 DB(쿼터 0)**, 버스 검색은 **30일 DB 캐시**, 버스 주변은 **0.005° 셀 격자 DB 캐시**, 도착은 **무캐싱 실시간**. 상세는 [bus Data](bus.md#data-coverage-high--6-sources)·[subway](subway.md). 동시 마운트 두 인스턴스가 같은 `queryKey` 를 구독하면 React Query 가 **1회로 dedupe** — 이게 통합의 유일한 "데이터 정합" 장치다.

**즐겨찾기 데이터** 도 통합이 아니라 각 도메인 소유다: `useBusFavorites`/`useSubwayFavorites`(게스트 zustand persist + 로그인 서버 하이브리드). TransitFavoritesSection 은 두 훅의 반환을 **읽어 병합만** 한다 — 4종을 도메인 단위 concat(버스 정류장→노선 → 지하철 역→호선). 각 도메인 목록은 서버가 `createdAt` 오름차순으로 내려주지만 **항목별 `createdAt` 이 계약에 노출되지 않아** 도메인 간 진짜 시간순 인터리브는 불가([Gotchas](#gotchas-coverage-high--7-sources)).

## Key Decisions [coverage: high — 8 sources]

- **쿼터 비례 원칙 — 발화 시점을 업스트림 비용·사용자 의도에 맞춘다.** 세 크로스가 트리거 정책이 다른 건 우연이 아니라 각 조회의 쿼터 비용에 계산해 맞춘 것이다. (1) **도착 미리보기 = 펼침 시에만**(단일 아코디언 → 동시 폴링 1개): 버스/지하철 도착은 실시간 쿼터를 소비하므로 아코디언 펼침이라는 명시 의도에 비례. (2) **버스 크로스 검색(지하철 탭) = 제출 시에만**: 버스 검색은 서울시 API(캐시 미스 시 쿼터)라 타이핑마다 발화 금지 — Enter/검색 버튼 제출(`submittedQ`)에만. (3) **지하철 크로스 검색(버스 탭) = 제출 q 자동**: 지하철 검색은 로컬 DB(쿼터 0)라 자동 조회 무부담(버스 탭 자체가 제출형이라 q=확정값). (4) **주변 겸표시 = 주변 모드면 조회, 토글 off 여도 유지**: 지하철 nearby=로컬 DB(0), 버스 nearby=셀 캐시(거의 0)라 저렴 → 켤 때 즉시 표시되게 조회는 해두고 **표시만 게이팅**. 요약: 싼 것(로컬 DB)은 자동/미리, 비싼 것(외부 API)은 명시 의도(펼침·제출) 뒤에.

- **이중 마운트 대응 — 공유 필요 상태만 승격.** 데스크톱/모바일 동시 마운트에서 "무엇을 어디 둘지"를 상태 종류별로 결정한다: 인스턴스 간 **공유가 필요한 UI 상태**(펼침·겸표시 토글)는 zustand 스토어로, **페이지 단위 상태**(`submittedQ`)는 페이지 state 로(두 자식에 자연 공유), **네트워크**는 RQ dedupe 에 맡기고, **지도 인스턴스**는 풀 키를 레이아웃별로 분리한다. 로컬 컴포넌트 state 로 두면 두 인스턴스가 갈라지는(한쪽만 펼침/토글) 버그가 난다 — 스토어 승격의 유일한 근거.

- **지도 연속성은 A안+D안 이중 안전망.** 뷰포트 리셋(A안 싱글턴)과 타일 플래시(D안 인스턴스 풀)를 다른 도구로 각각 막고 서로의 빈틈(새로고침 시 풀 빈 상태 ↔ SPA 전환 시 뷰포트)을 메운다. C안(페이지 keep-alive)은 숨은 페이지가 상대 탭 URL 파라미터에 반응하는 구조 충돌로 기각([커밋 `4128d6b`](../../docs/PLAN-transit-unified.md)). 풀 재사용 시 **레이어 선택(일반/야간/위성)·사용자 선택 여부도 함께 이어받아야** 첫 렌더가 테마 기본값으로 `setUrl` 해 플래시가 재발하지 않는다(부수 효과로 위성 선택이 탭 전환 후 유지).

- **딥링크 대칭 계약 — 12차에서 확립, 14/15차로 확장.** 지하철 12차가 `/bus?near=&stId=` 로 첫 다리를 놓고, 통합 14차가 그 대칭(`/subway?near=&stn=`)을, 15차가 검색 변형(`q`+선택 전달)을 채웠다. 모든 이동이 **기존 URL 계약 재사용** — 자기 도메인은 in-page 핸들러, 상대는 navigate. `near` 를 함께 넘겨 주변 맥락이 탭을 건너 이어진다.

- **마커 네임스페이스 prefix + fit 제외 오버레이.** 겸표시를 자기 도메인 마커에 섞지 않고 `x-subway:`/`x-bus:` prefix 로 네임스페이스를 분리해, 클릭 가로채기(`startsWith('x-')`)가 선택 로직보다 앞서 상대 탭 딥링크로 라우팅한다. 겸표시는 **별도 VectorSource(overlayMarkers)** 라 `fitToMarkers` extent 를 넓히지 않아 자기 도메인 결과 기준 화면이 유지된다.

- **BE 무변경 — 기존 훅의 FE 조합만.** 세 축 전부 새 스키마·라우트·테이블 없이 이미 있는 훅을 한 페이지에서 함께 호출하는 조합이다. 부작용: 즐겨찾기 도메인 간 인터리브는 `createdAt` 미노출로 불가(도메인 단위 concat 으로 타협). 이 원칙이 "복합 경로 탐색(버스+지하철 환승)"을 스코프에서 뺀 이유이기도 하다 — 그건 노선 그래프 적재라는 BE 선행이 필요하다.

- **집중 모드 겸표시 숨김 — "화면 비우기" 정책과 일관.** 노선 보기(버스 `routeId`/지하철 `line`)·경로 탐색(`inPathView`)·따라가기 중에는 겸표시 조회·표시·토글 칩을 모두 숨긴다(`crossToggleVisible = nearMode && routeId===null` / `&& line===null && !inPathView`). 따라가기는 노선 추적 중에만 발생하므로 노선 조건으로 함께 커버된다.

- **비가시 탭 빈 상태 하드닝 — pending 을 "정보 없음"으로 오표시 않기.** 도착 미리보기의 빈 상태 문구는 **성공 응답에만** 낸다. 비가시 탭(모바일 인스턴스가 데스크톱 폭에서 숨겨진 경우 등)에서 React Query 가 재시도를 pause 하면 status=pending·fetchStatus=paused 로 `data` 가 없는데, 이걸 "정보 없음"으로 표시하면 오탐이다 — `!data` 는 로딩 스피너로 처리.

## Gotchas [coverage: high — 7 sources]

- **동시 마운트가 전제 — 모든 통합 컴포넌트가 2벌씩 산다.** 데스크톱/모바일 레이아웃이 CSS 숨김(`hidden xl:flex`/`xl:hidden`)이라 새 섹션·훅·지도가 페이지당 2 인스턴스. "왜 로컬 state 로 안 두고 스토어로 올렸나"의 답은 항상 여기다. 새 공유 상태를 추가할 땐 **로컬 state 면 두 인스턴스가 갈라지는지** 먼저 따져야 한다.
- **`poolKey` 는 동시 사용 금지 — 반드시 레이아웃별로 분리.** 단일 키를 데스크톱·모바일 지도가 동시에 쓰면 한 map 을 다퉈 한쪽만 재사용되고 다른 쪽은 플래시가 남는다. `transit-desktop`/`transit-mobile` 분리는 선택이 아니라 필수. 풀 획득은 take 시맨틱(`delete` 로 소유권 이전)이라 StrictMode 이중 마운트에도 한 map 공유를 막는다.
- **`createdAt` 미노출 → 즐겨찾기 도메인 간 인터리브 불가(후속 검토).** 4종 병합이 진짜 시간순이 아니라 도메인 단위 concat(버스→지하철)인 건 항목별 `createdAt` 이 즐겨찾기 계약에 없기 때문. 진짜 인터리브는 BE 변경(계약에 timestamp 노출)이 선행돼야 해 [PLAN](../../docs/PLAN-transit-unified.md)에서 후속 항목으로 남겼다.
- **복합 경로 탐색(버스+지하철 환승)은 장기 스코프 제외.** "어떤 것이든 되는 느낌"의 끝판인 버스↔지하철 통합 경로는 노선 그래프 적재가 선행돼야 하므로 통합 13~15차에서 명시적으로 뺐다(장기). 현재 지하철 자체 경로 탐색(`/subway?to=`)은 지하철 도메인 내부 기능이다.
- **transitMapViewport 는 새로고침에 소실 — 의도.** 모듈 싱글턴이라 새로고침/직접 진입엔 저장 뷰포트가 없다. 이땐 D안 풀도 비어 있어 각 지도의 기본 뷰/딥링크 규칙이 그대로 산다(A안은 SPA 내 탭 전환 전용 보완재).
- **지하철만 복원 시 첫 fit 억제 가드가 필요.** 저장 뷰포트로 시작한 SubwayStationsMap 은 `restoreGuardRef` 로 첫 검색 fit 1회를 억제해야 복원이 즉시 덮이지 않는다. 버스는 결과 없는 마운트(탭 전환)에선 fit 이 안 돌아 별도 억제가 불필요 — 두 어댑터의 비대칭 주의.
- **겸표시 조회는 토글 off 여도 계속 돈다(표시만 게이팅).** `crossNear` 는 `crossToggleVisible` 기준이라 토글을 꺼도 조회는 유지되고 `overlayMarkers` 만 `undefined` 로 비운다 — 켤 때 즉시 표시(쿼터 0/셀캐시라 무부담)를 위한 의도. 조회 자체를 끄려면 주변 모드를 벗어나야 한다.
- **각 즐겨찾기 훅은 "페이지당 1회"만.** `useBusFavorites`/`useSubwayFavorites` 는 로그인 직후 게스트→서버 union 병합 부수효과(useEffect)를 갖는다. TransitFavoritesSection 이 직접 호출하지 않고 **페이지가 호출해 props 로 넘기는** 이유 — 섹션이 호출하면 데스크톱/모바일 2벌이 병합을 두 번 건다.
- **앱 미구현 — 버스·지하철·통합 모두 웹 전용.** 대중교통 레이어 전체가 `apps/web` 안에만 있다. 두 도메인의 게스트 store 는 앱 storage 주입까지 준비돼 있으나 앱 화면·라우트·통합 UI 는 없다.

## Sources [coverage: high — 17 sources]

**통합 컴포넌트 (web/components/transit)**
- [apps/web/src/components/transit/TransitTabs.tsx](../../apps/web/src/components/transit/TransitTabs.tsx)
- [apps/web/src/components/transit/TransitFavoritesSection.tsx](../../apps/web/src/components/transit/TransitFavoritesSection.tsx)
- [apps/web/src/components/transit/CrossSearchSection.tsx](../../apps/web/src/components/transit/CrossSearchSection.tsx)
- [apps/web/src/components/transit/TransitCrossToggleChip.tsx](../../apps/web/src/components/transit/TransitCrossToggleChip.tsx)
- [apps/web/src/components/transit/transitMapViewport.ts](../../apps/web/src/components/transit/transitMapViewport.ts)

**공유 스토어 (web/stores)**
- [apps/web/src/stores/transitFavExpandStore.ts](../../apps/web/src/stores/transitFavExpandStore.ts)
- [apps/web/src/stores/transitCrossShowStore.ts](../../apps/web/src/stores/transitCrossShowStore.ts)

**배선 — 페이지·연계**
- [apps/web/src/routes/BusPage.tsx](../../apps/web/src/routes/BusPage.tsx)
- [apps/web/src/routes/SubwayPage.tsx](../../apps/web/src/routes/SubwayPage.tsx)
- [apps/web/src/components/subway/SubwayNearbyBusSection.tsx](../../apps/web/src/components/subway/SubwayNearbyBusSection.tsx)

**지도 (풀링·오버레이)**
- [apps/web/src/components/restaurant/MapCanvas.tsx](../../apps/web/src/components/restaurant/MapCanvas.tsx)
- [apps/web/src/components/bus/BusStationsMap.tsx](../../apps/web/src/components/bus/BusStationsMap.tsx)
- [apps/web/src/components/subway/SubwayStationsMap.tsx](../../apps/web/src/components/subway/SubwayStationsMap.tsx)

**네비게이션·라우트**
- [apps/web/src/components/PublicSidebar.tsx](../../apps/web/src/components/PublicSidebar.tsx)
- [apps/web/src/components/PublicTopBar.tsx](../../apps/web/src/components/PublicTopBar.tsx)
- [apps/web/src/App.tsx](../../apps/web/src/App.tsx)

**배경 문서**
- [docs/PLAN-transit-unified.md](../../docs/PLAN-transit-unified.md)
