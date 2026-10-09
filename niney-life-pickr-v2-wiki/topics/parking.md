---
topic: parking
last_compiled: 2026-10-10
sources_count: 87
status: active
aliases: [주차, parking, /parking, 주차 메뉴, 주차장, 공영주차장, 전기차 충전소, 충전소, EV, 충전기, 공항 주차, 공항 주차장, ParkingPage, ParkingLot, ParkingOccupancyStat, ParkingSync, EvStation, EvCharger, parking_lots, parking_occupancy_stats, parking_syncs, ev_stations, ev_chargers, 20260925071552_add_parking, 15012896, tn_pubr_prkplce_info_api, 전국주차장정보표준데이터, GetParkInfo, GetParkingInfo, OA-13122, 서울 공영주차장 안내, 시영 실시간 주차대수, 15158689, parking-congestion, 한국공항공사, KAC, 15095047, StatusOfParking, getTrackingParking, 인천공항, IIAC, 15076352, EvCharger API, getChargerInfo, getChargerStatus, 한국환경공단, KOTSA, 15099883, 한국교통안전공단 주차정보, load:parking-lots, load:ev-chargers, status:parking, --std-json, --sources, --zcode, PARKING_LIVE_CRON, EV_STATUS_CRON, SEOUL_OPEN_API_KEY, DATA_GO_KR_API_KEY, RATE.parkingRead, parkingRead, Routes.Parking, ParkingLiveService, EvStatusPoller, ParkingService, EvService, ParkingServiceError, ParkingApiError, parking-api.adapter, parking-master.service, parking-live.service, ev-master.service, ev-status.service, callDataGoKr, callSeoulOpen, callSeoulOpenAll, interpretDataGoKr, canonKeys, normalizeStdParkingRows, normalizeSeoulParkingRows, seoulExcludedOper, dropParkingDuplicates, replaceParkingLots, parseSeoulLiveRows, parseKacRows, parseIncheonRows, kstToIso, buildAirportList, airportLotKey, recordHistory, getPattern, usualNow, normalizeEvChargerItems, fetchAllEvChargers, replaceEvChargers, parseEvStatusRows, applyEvStatus, UPDATE FROM, 혼잡 이력, 평소 혼잡도, 요일×시간, 실시간 여석, 혼잡 단계, 여유 보통 혼잡 만차, 충전기 상태, 예상 요금, estimateParkingFee, formatParkingFeeRule, parkingLevelOf, parkingKstSlot, parkingDayKindKst, isParkingOpenAt, normalizeParkingName, isEvChargerFast, evStationLevel, evKindLabel, PARKING_AIRPORTS, PARKING_TABS, PARKING_POINT_MIN_ZOOM, EV_POINT_MIN_ZOOM, PARKING_POINTS_MAX, PARKING_PATTERN_MIN_SAMPLES, PARKING_FULL_RATIO, PARKING_NEARBY_RADIUS_M, PARKING_RESTAURANT_RADIUS_M, PARKING_FEE_ESTIMATE_MINUTES, EV_CHARGER_TYPE_LABEL, EV_STAT_LABEL, parkingMarker, buildParkingLotMarkerDataUrl, buildEvStationMarkerDataUrl, buildParkingAirportMarkerDataUrl, buildParkingCellMarkerDataUrl, parkingApi, useParkingStatus, useParkingLotPoints, useParkingLotNearby, useParkingLotDetail, useEvPoints, useEvNearby, useEvDetail, useParkingAirports, useRestaurantParkingReviews, parkingPrefsStore, lp:parking-prefs, ParkingMapView, ParkingTabBar, ParkingLists, ParkingDetails, PatternChart, ParkingFooter, parkingFormat, parkingMarkers, poolKey parking, ParkingSection, ParkingNearbySection, ParkingSummaryLine, parking-reviews, 가는 법 주차, 홈 한 줄 요약, deploy.sh 9, parking_data, parking_status, PLAN-parking, onListen 폴러, 한국교통안전공단, 교통안전공단, Parking_v1, B553881, PrkSttusInfo, PrkOprInfo, PrkRealtimeInfo, kotsa-master.service, kotsa-sigungu, KOTSA_SIGUNGU, fetchKotsaPage, KOTSA_OPS, KOTSA_PAGE_SIZE, KOTSA_CALL_GAP_MS, KOTSA_PARKING_BASE, createCallSpacer, PER_SECOND_RETRY_DELAY_MS, LIMITED_NUMBER_OF_SERVICE_REQUESTS_PER_SECOND_EXCEEDS_ERROR, 초당 한도, collectKotsaSigungu, slimKotsaCollected, normalizeKotsaSigungu, kotsaOperationFields, KotsaReport, markKotsaPlaceholderCoords, dedupeKotsaRows, matchParkingDuplicates, KOTSA_SAME_NAME_RADIUS_M, 대표 좌표, 입구 좌표, 원천 결함, 옛 행정코드, sanitizeParkingFeeRule, isMonthlyOnlyFee, isStdPermitOnly, 요금 정리, 요금 규칙 비정상, 등록 차량 전용, 거주자 우선 주차 구획, RESIDENT_ONLY_NAME, --kotsa-dump, --kotsa-json, --kotsa-codes, kotsa=, kotsaDup, kotsaSelfDup, map-cells, cellGrid, pointsSpanOk, cellKeyOf, cellResultSize, CELL_CACHE_MAX_UNITS, MAP_CELLS_MAX, POINTS_MAX_TILES, getStatusAt, noteStatusAt, onApplied, evStatusAt, POLLED_CACHE_CONTROL, TRUSTED_RESPONSE_ROUTES, 20261005030000_ev_station_covering_index, 충전소 커버링 인덱스, E-V1, E-5, E-9, E-10, VIEWPORT_GC_MS, ParkingPageBody, parking-waiting-location, useInViewOnce, perMarker]
---

# parking — 주차(/parking: 주차장·전기차 충전소·공항 3탭 + 맛집 '가는 법' 주차 정보)

**2026-10-05~10-10 변경 흡수 — 한국교통안전공단(KOTSA) 공영 주차장 보강 + 요금 이상치·등록 차량 전용 정리 + 지도 셀 상한·충전소 커버링 인덱스 + 웹 헛조회 축소(`007ac899`·`36f07eb3`·`e5a45348`·`5655abbc`·`008e0081`)**: (1) **KOTSA 15099883 심의승인(2026-10-05 확인)** — `load:parking-lots` 기본 원천이 `std,seoul,kotsa` 셋이 됐다. 새 [kotsa-master.service.ts](../../apps/friendly/src/modules/parking/kotsa-master.service.ts) 가 시군구(옛 행정코드 251곳 — [kotsa-sigungu.ts](../../apps/friendly/src/modules/parking/kotsa-sigungu.ts))마다 시설(`PrkSttusInfo_v1`) 첫 페이지 + 운영정보(`PrkOprInfo_v1`, 공영이 끝나는 위치 + 50행)를 **순차 350ms 간격**(`createCallSpacer` — 초당 한도가 가이드 30tps 보다 훨씬 낮다)으로 ≈470콜(실측 4분 20초) 받고, **공영 + 요금 구분 있는 행만** 정규화해 서울·표준데이터와 겹치지 않는 **새 곳만** 더한다. 입구 좌표가 없거나 이름 다른 3곳 이상이 한 점에 몰린 "대표 좌표"는 주소로 지오코딩(서울 구영과 같은 캐시)하고 못 찾으면 뺀다. KOTSA 좌표는 입구라 기존 원천과 100~300m 어긋나 **이름이 정확히 같으면 300m 까지** 같은 곳(`KOTSA_SAME_NAME_RADIUS_M`)으로 보고, 겹침 판정은 격자 이웃 칸만 보는 `matchParkingDuplicates` 로 바꿨다. **실시간(`PrkRealtimeInfo`)은 쓰지 않는다** — 시설과 이어지는 858행이 1시간 관측 동안 값 변화 0(같은 시간 서울 API 종묘 1,055→1,029). 로컬 10-05: 공영 13,645행 → 8,656곳 중 기존과 같은 곳 6,605 → **새로 2,051곳**, 전체 20,219곳. (2) **요금 정리·등록 차량 전용**(`36f07eb3`, 10-10) — 원천 공통 `sanitizeParkingFeeRule`(기본 시간 0분인데 기본요금이 있거나 기본·추가 요금이 시간당 2만 원 초과면 시간 요금 전체를 정보 없음, 1일권·월정액은 둔다)이 KOTSA 전용 "30분 1만 원" 상한을 대체했고, 표준데이터는 월정액만 + 이름·비고 '…전용' 인 등록 차량 전용 27곳을 뺀다(`isStdPermitOnly`). KOTSA 거주자 구획은 이름 + **월정액만일 때만** 뺀다(94 → 90). 로컬 재적재(10-10, `parking_syncs` 최신 행으로 확인): **20,261곳 = 서울 836 · 표준 17,357 · KOTSA 2,068**(좌표 19,501). (3) **조회 성능**(`5655abbc`, 성능 2차 E-V1·E-5·E-9·E-10) — 셀 모드는 공용 [map-cells.ts](../../apps/friendly/src/lib/map-cells.ts) 의 `cellGrid`(열×행 6,000 초과면 줌을 낮춰 셀을 키움·국내 clamp), 점 모드 폭은 1.5° 고정 대신 **요청 줌의 32타일**(`pointsSpanOk`), 셀 LRU 는 셀 수 기준 바이트 상한. 충전소는 `(lat,lng,availableCount,hasFast,parkingFree,limited)` **커버링 인덱스**(마이그레이션 `20261005030000_ev_station_covering_index`)로 필터 셀 403~610 → 66~124ms, '사용 가능만' 셀도 `statusAt` 을 키에 넣어 캐시, 주변 조회는 2단계(id·좌표 → 상위 id 만 전 컬럼), 주차 `status` 는 `EvService` 의 `statusAt` 메모를 공유(폴러가 반영 직후 갱신), `status`·`airports` 에 `Cache-Control: public, max-age=60`. (4) **웹**(`eb24c6e5`·`086e4510`·`03bc43f0`·`14f48e16`) — 뷰포트 조회에 AbortSignal·points `gcTime` 60초, 로그인 사용자는 저장 위치 응답 전엔 지도를 띄우지 않음(서울시청으로 먼저 받았다 다시 받지 않게), 셀 버블은 사전 래스터화 제외(`perMarker`), 홈 탭 주차 한 줄은 '영업 정보' 가 화면에 들어온 뒤에만 조회. (5) `008e0081` — 좌표 없는 식당의 '가는 법' 탭도 리뷰 주차 평가·팁·다이닝코드 시설을 보여 준다. (6) `e5a45348` — 계약 enum 6종 ↔ utils 목록 동일성 테스트. (7) 하단 푸터에 교통안전공단 수·출처, `status:parking` 에 `kotsa=`, deploy 는 `kotsa=0` 이면 한 번 재적재, [docs/api/README.md](../../docs/api/README.md) §6 에 주차 절이 생겼다. `fd957320`(실시간 외부 API 쿼터 가드)은 주차를 건드리지 않는다 — 주차는 요청 경로 업스트림이 0이다.

**2026-09-24~09-26 변경 흡수 — 신규 토픽. 주차 메뉴 한 커밋(`2ff2c31`, 2026-09-25) + 테스트 훅 한도(`5d7b686`, 09-25) + 어드민 상세의 홈 요약 줄(`420a6be`, 09-26)**: 사이드바 '대중교통' 바로 다음에 **'주차'(`/parking`)** 메뉴가 생겼다 — 지도 한 장 + 패널(웹 작은 화면은 바텀시트)에 탭 **주차장 | 충전소 | 공항**. 주차장은 전국주차장정보표준데이터(data.go.kr **15012896**)와 서울 열린데이터 공영주차장 안내(`GetParkInfo`)를 정규화·겹침 접기해 로컬 `ParkingLot` 로 적재하고(로컬 18,168곳 = 서울 835 + 표준 17,333), 서울 시영주차장은 **5분 실시간 폴러**(`GetParkingInfo`)가 여석·혼잡 단계를 서버 메모리에 두면서 **요일×시간 혼잡 이력**(`ParkingOccupancyStat`)을 지금부터 쌓는다. 충전소는 한국환경공단 **15076352** 를 충전소 단위로 접어 `EvStation`/`EvCharger`(99,850곳·515,263기)로 적재하고 **10분 상태 폴러**가 최근 10분 변경분만 반영한다. 공항은 한국공항공사 **15158689**(13개 공항) + 인천공항 **15095047** 을 같은 5분 폴러가 받는다. 맛집 상세 '가는 법' 탭에는 주차 섹션(리뷰 '주차' 관점·팁, 다이닝코드 시설, 반경 300m 주차장), 홈 탭에는 한 줄 요약이 붙었다. **요청 경로의 업스트림 호출은 0** — 주차장·충전소는 로컬 DB, 실시간은 폴러 메모리이고, 폴러는 `onListen` 에서만 시작한다(`export:openapi`·inject 테스트가 업스트림을 부르지 않게). `5d7b686` 은 `parking.test.ts` 의 개별 180초 훅 한도를 전역 `hookTimeout` 60초로 대체했고, `420a6be` 는 `ParkingSummaryLine` 의 `onOpen` 을 선택 prop 으로 바꿔 '가는 법' 탭이 없는 어드민 맛집 상세에서는 누를 수 없는 정보 줄로 그린다. **앱(`apps/mobile`)은 미구현**, KOTSA 주차정보(**15099883**)는 심의승인 대기라 계약·스키마에 `'kotsa'` 자리만 있다(2026-10-05 승인·연결 — 위 문단). 설계·결정 문서는 [PLAN-parking.md](../../docs/PLAN-parking.md).

## Purpose [coverage: high — 17 sources]

"지금 이 근처에 댈 곳이 있나, 얼마인가, 지금 자리가 있나" 를 **비로그인 공개**로 답하는 도메인이다. 질문을 세 탭으로 나눈다([ParkingPage.tsx](../../apps/web/src/routes/ParkingPage.tsx), [ParkingTabBar.tsx](../../apps/web/src/components/parking/ParkingTabBar.tsx)).

- **주차장**(`?t` 생략 = `lot`, 기본 탭) — 표준데이터·서울 공영·KOTSA 공영을 합친 로컬 2만여 곳에서 지도 중심 1km 안 주차장 최대 15곳을 거리순으로, `공영 · 노외 · 유료 · 기본 5분 430원 · 추가 5분 430원` 같은 한 줄과 함께 보여 준다. 상세는 오늘(KST 요일 구분) 운영시간과 지금 운영 중 여부, 요금 규칙·일 최대·1일권·월 정기권, **1·2·3시간 예상 요금**, 평일·토·일공휴일 운영시간, 결제·관리 기관·출처. 서울 시영(실시간 연계)이면 **실시간 여석 + 혼잡 단계(여유·보통·혼잡·만차)** 와 **오늘 요일의 24시간 평소 혼잡도 막대**가 더 붙는다. 필터 칩은 `무료만`·`공영만`·`실시간 여석`.
- **충전소**(`t=ev`) — 지도 중심 1km 안 전기차 충전소(급속/완속 기수·운영기관·사용 가능 대수·주차료 무료·이용 제한). 상세는 충전기마다 타입·용량(kW)·상태(사용 가능 / 충전 중 "N분 전부터" / 통신 이상 / 운영 중지 / 점검 중 / 예약 중 / 미확인)와 층(지상·지하 N층). 필터 칩은 `지금 사용 가능`·`급속`·`주차료 무료`·`누구나 이용`.
- **공항**(`t=airport`) — 인천 + 한국공항공사 13곳 = 14개 공항을 지도 중심에서 거리순으로, 공항 전체 점유 단계·주차장 수·만차 수. 상세는 주차장별(인천은 T1/T2 터미널 묶음) `현재/면수`·점유율 막대·"평소 이 시간 N%" 세로선([ParkingDetails.tsx](../../apps/web/src/components/parking/ParkingDetails.tsx)).

같은 데이터를 **맛집 공개 상세**에도 붙인다 — '가는 법' 탭([TransitTab.tsx](../../apps/web/src/components/restaurant/detail/TransitTab.tsx))의 버스·지하철 아래 세 번째 섹션, 그리고 홈 탭([HomeTab.tsx](../../apps/web/src/components/restaurant/detail/HomeTab.tsx)) '영업 정보' 의 주소 줄 아래 한 줄("리뷰: 주차 불편한 편 · 신정4동길(구) 133m · 무료", [ParkingSection.tsx](../../apps/web/src/components/restaurant/detail/ParkingSection.tsx)).

원천은 모두 공공 API 다. KOTSA 만 심의승인(2026-10-05 승인 확인)이고 나머지는 개발계정 자동승인이다([PLAN-parking.md](../../docs/PLAN-parking.md) §데이터 원천·§KOTSA, [.env.example](../../apps/friendly/.env.example), [parking-api.adapter.ts](../../apps/friendly/src/modules/parking/parking-api.adapter.ts)):

| 원천 | 엔드포인트 | 쓰임 | 규모(PLAN 실측) |
|---|---|---|---|
| 전국주차장정보표준데이터 15012896 | `http://api.data.go.kr/openapi/tn_pubr_prkplce_info_api` | 주차장 마스터(전국 공영 위주) | 1.9만 곳, 좌표 96%·요금 72%, 1,000행/콜 → ~19콜 |
| 서울 공영주차장 안내 `GetParkInfo` | `http://openapi.seoul.go.kr:8088/<키>/json/GetParkInfo/…` | 주차장 마스터(서울) | 850곳(2,189행 — 노상은 구획마다 행), 좌표는 시영뿐 → 지오코딩 |
| 서울 시영 실시간 `GetParkingInfo` | 같은 서버 `GetParkingInfo` | 실시간 여석 + 마스터 보충 | 122곳(109곳 연계), 1콜 전량 |
| 한국공항공사 주차장 혼잡도 15158689 | `https://apis.data.go.kr/B551178/parking-congestion/info` | 공항 실시간 | 13개 공항 25개 주차장, 좌표 없음 |
| 인천공항 주차 정보 15095047 | `https://apis.data.go.kr/B551177/StatusOfParking/getTrackingParking` | 공항 실시간 | 19개 구역, 개발 1,000건/일 |
| 전기차 충전소 15076352 | `https://apis.data.go.kr/B552584/EvCharger/getChargerInfo`·`getChargerStatus` | 충전소 마스터 + 상태 | 충전기 52.5만 기, 개발 1,000건/일, 공공누리 1유형 |
| 한국교통안전공단 주차정보 15099883 | `https://apis.data.go.kr/B553881/Parking_v1/PrkSttusInfo_v1`(시설)·`PrkOprInfo_v1`(운영) | 주차장 마스터 보강(**공영만**, 서울·표준과 겹치지 않는 새 곳) | 시설 = 운영 1,767,934행(대부분 민영 부설), 공영 13,645행 → 새 곳 2,068(10-10). 시군구 251곳 ≈470콜, 개발 1만/일, 초당 한도 낮음. 실시간(`PrkRealtimeInfo`, 787,238행)은 안 씀 |

키는 계정 공용 `DATA_GO_KR_API_KEY`(KOTSA 포함) 와 서울 열린데이터 "일반 인증키" `SEOUL_OPEN_API_KEY`(지하철 역사마스터와 같은 키) 둘뿐이다.

의존자: 웹 `/parking`([App.tsx](../../apps/web/src/App.tsx) lazy 라우트, [PublicSidebar.tsx](../../apps/web/src/components/PublicSidebar.tsx)·[PublicTopBar.tsx](../../apps/web/src/components/PublicTopBar.tsx) NAV 에서 '대중교통' 다음, 아이콘 `SquareParking`) · 맛집 공개 상세의 '가는 법'·홈 탭 · 어드민 맛집 상세의 홈 탭(`420a6be` — 정보 줄) · 운영 [deploy.sh](../../deploy.sh) `parking_data`·메뉴 9 · 외부 API 문서 [endpoints.md](../../docs/api/endpoints.md) `## parking` 절(9개 라우트, 전부 공개 — [api-docs](api-docs.md))과 `007ac899` 부터 수기 [README.md](../../docs/api/README.md) §6 '주차' 절(원천 셋·id 콜론 인코딩·`live` null·요금 `null` ≠ 0원, `36f07eb3` 이 "비정상 시간 요금은 `null`" 을 더함). **앱에는 주차 화면·훅 사용처가 없다**(`apps/mobile` 의 `parkingApi`/`useParking*` 사용 0 — [PLAN-parking.md](../../docs/PLAN-parking.md) "웹 먼저, 앱은 다음 단계").

## Architecture [coverage: high — 50 sources]

```
원천(요청 경로 밖)
  data.go.kr ─ 15012896 tn_pubr_prkplce_info_api (평문 http) ─────── load:parking-lots (수동 / deploy parking_data)
             ─ 15099883 KOTSA Parking_v1 PrkSttusInfo·PrkOprInfo ── load:parking-lots (시군구 251곳 순차 350ms 간격 ≈470콜)
             ─ 15158689 KAC parking-congestion/info ─┐
             ─ 15095047 IIAC getTrackingParking ─────┤ ParkingLiveService  PARKING_LIVE_CRON "*/5 * * * *" (onListen 에서만)
  openapi.seoul.go.kr:8088 ─ GetParkingInfo (122행) ─┘   └ 서울 1 + 공항 2 = 5분마다 3콜(원천마다 하루 288콜)
                           ─ GetParkInfo (2,189행) ──────── load:parking-lots (+ GetParkingInfo 로 보충)
  data.go.kr ─ 15076352 getChargerInfo (9,999행×~53콜) ─── load:ev-chargers
             ─ 15076352 getChargerStatus (period=10) ───── EvStatusPoller  EV_STATUS_CRON "*/10 * * * *" (onListen 에서만)
  VWorld 지오코더(설정>지도 키, LifeGeocodeCache 공유) ─── load:parking-lots 의 서울 좌표 결측 행 + KOTSA 입구 좌표 결측·대표 좌표 행

friendly modules/parking  (autoload *.route.ts, prefix /api/v1)
  parking-api.adapter.ts   callDataGoKr(listKey·attempts) · fetchKotsaPage · createCallSpacer · callSeoulOpen(All) — API 별 봉투 해석,
                           인증 503 / 그 밖 502, 1회 재시도(초당 한도는 2.5초 쉬고), 키 마스킹
  parking-master.service   normalizeStd/SeoulParkingRows(+ sanitizeParkingFeeRule · isStdPermitOnly) → (지오코딩: 스크립트)
                           → matchParkingDuplicates/dropParkingDuplicates(격자 이웃 칸) → replaceParkingLots
  kotsa-master.service     collectKotsaSigungu → normalizeKotsaSigungu(공영 + 요금 구분) → markKotsaPlaceholderCoords · dedupeKotsaRows
  kotsa-sigungu.ts         KOTSA_SIGUNGU — 옛 행정코드 251곳
  ev-master.service        fetchAllEvChargers → normalizeEvChargerItems(충전소 단위 접기) → replaceEvChargers
  parking-live.service     ParkingLiveService — 메모리(lots Map · airportLots) + recordHistory(UPSERT) + getPattern · usualNow
  ev-status.service        EvStatusPoller → parseEvStatusRows → applyEvStatus(UPDATE … FROM + 충전소 칸 재집계) → onApplied(at)
  parking.service          ParkingService — status(evStatusAt 공유) · points/cells(map-cells + 바이트 상한 LRU) · nearby · detail(+pattern)
                           · airports · restaurantReviews
  ev.service               EvService — points/cells(map-cells, 커버링 인덱스) · nearby(2단계) · detail(+chargers) · getStatusAt(1분 메모)·noteStatusAt
  parking.route.ts         GET 9개 (RATE.parkingRead 240/분 — status 만 전역 백스톱), status·airports Cache-Control 60초,
                           onListen→start / onClose→stop, evPoller.onApplied → ev.noteStatusAt
  lib/map-cells.ts         cellGrid(셀 상한 6,000·국내 clamp) · pointsSpanOk(32타일) · CELL_CACHE_MAX_UNITS — 일상지도·집값과 공유([friendly](friendly.md))
  app.ts                   TRUSTED_RESPONSE_ROUTES — lots/ev points 200 은 운영에서 zod 대신 JSON.stringify(X-6)
  DB: parking_lots · parking_occupancy_stats · parking_syncs · ev_stations(커버링 인덱스) · ev_chargers (FK 없음)

@repo/api-contract schemas/parking.ts(377줄) · Routes.Parking      @repo/utils parking.ts(코드표·계산) · parkingMarker.ts(SVG)
@repo/shared parking.api.ts(parkingApi) · useParking.ts(훅 9)

웹 /parking  ParkingPage(저장 위치 대기 게이트) → ParkingPageBody — URL ?t · ?ll&z · ?sel, 필터 = parkingPrefsStore(persist)
   ParkingMapView(MapCanvas poolKey 'parking') · ParkingTabBar · ParkingLists · ParkingDetails(PatternChart) · ParkingFooter
   parkingMarkers(마커 id·아이콘 캐시) · parkingFormat(문구 헬퍼)
   xl↑: 좌측 400px 패널(LifeGoToBox → 탭+필터 → 목록|상세 → 푸터) + 지도
   xl↓: subBar(LifeGoToBox bar + 탭) + fixed 지도 + 목록 시트(z20, 필터 칩·푸터) + 상세 시트(z25) — useMapSheets
맛집 상세  TransitTab → ParkingNearbySection(가는 법 세 번째 섹션 — 좌표 없으면 리뷰 정보만)
          HomeTab → ParkingSummaryLine(한 줄, onOpen 선택, enabled = '영업 정보' 화면 진입 — useInViewOnce)
```

### 원천 어댑터 — data.go.kr 은 API 마다 봉투가 다르다

[parking-api.adapter.ts](../../apps/friendly/src/modules/parking/parking-api.adapter.ts) 한 파일이 두 계열의 봉투를 푼다(주석에 "프로브 실측 2026-09-25").

- **data.go.kr `interpretDataGoKr`** — 다섯 가지 모양을 한 함수로 받는다: 표준데이터·한국공항공사 GW 는 `{response:{header:{resultCode}, body:{items:{item:[…]}|[…], totalCount}}}`, 인천공항은 `body.items` 가 배열, 환경공단 EvCharger 는 **`response` 감싸개 없이** `{resultCode, resultMsg, totalCount, items:{item:[…]}}`, KOTSA 는 감싸개 없이 `{resultCode:'0', totalCount, <오퍼레이션 이름>:[…]}`(목록 키가 오퍼레이션마다 달라 `listKey` 인자 — `007ac899`), 게이트웨이 오류는 `OpenAPI_ServiceResponse.cmmMsgHeader.returnReasonCode` 가 **JSON 또는 XML 문자열**로 온다(XML 은 정규식으로 코드·메시지 추출). `items.item` 이 단건 객체면 배열로 감싼다.
- 결과코드: `'03'`(표준데이터의 "데이터 없음")은 빈 페이지, `00`/`0` 외는 502. 게이트웨이 인증·쿼터 코드 **20·21·22·30·31·32·33 → 503**, 나머지 → 502. **재시도 1회**(800ms 뒤) — 게이트웨이 04·05, 5xx 인데 본문이 JSON/XML 이 아닌 경우, 네트워크 오류. **초당 한도 초과**(메시지에 `PER_SECOND` — `LIMITED_NUMBER_OF_SERVICE_REQUESTS_PER_SECOND_EXCEEDS_ERROR`, 일 쿼터 초과와 같은 코드 22 라 메시지로 가른다)는 503 이지만 `retryable` + `retryAfterMs` 2,500ms 로 쉬었다 다시. 시도 횟수는 `attempts`(기본 2, KOTSA 3). 타임아웃 30초, 충전기 정보·상태 페이지(9,999행 ≈ 10MB)와 KOTSA 페이지(1만 행)는 120초.
- **`createCallSpacer(gapMs)`** — 호출 **시작 시각**을 gapMs 씩 벌리는 줄 세우기(앞 호출의 끝은 기다리지 않는다 — 호출 자체는 원래 순차). KOTSA 를 `KOTSA_CALL_GAP_MS` 350ms 로 부른다(실측: 동시 4개면 대부분 초당 한도 오류).
- **`fetchKotsaPage(key, op, {sigunguCd, pageNo, numOfRows})`** — `KOTSA_PARKING_BASE`(`…/B553881/Parking_v1`) + `/${KOTSA_OPS[op]}_v1`(`facility`=`PrkSttusInfo`, `operation`=`PrkOprInfo`), `format=2`(JSON), `sidoCd` = 시군구 코드 앞 두 자리, `numOfRows` 기본 `KOTSA_PAGE_SIZE` 1만. 2026-09-10 에 `/Parking` → `/Parking_v1` 로 바뀌었다(주석).
- 키: `toServiceKeyPart`([bus-api.adapter.ts](../../apps/friendly/src/modules/bus/bus-api.adapter.ts) 재사용 — 이미 `%XX` 인코딩돼 있으면 그대로, 아니면 `encodeURIComponent`)로 **이중 인코딩 금지**. 에러의 `requestUrl` 은 `serviceKey=***`, 메시지에서도 키 문자열을 `***` 로 지운다. 키가 비면 즉시 503.
- **서울 열린데이터 `callSeoulOpen`** — `http://openapi.seoul.go.kr:8088/<키>/json/<서비스>/<start>/<end>/`(평문 HTTP, 키가 경로에 박힘 — 로그용 URL 은 `***`). `INFO-000` 은 행, `INFO-200` 은 빈 결과, `INFO-100`(인증) → 503, 그 밖 → 502. `callSeoulOpenAll` 은 1,000행씩 최대 20페이지.
- 엔드포인트 상수: `STD_PARKING_URL`(1,000행/페이지), `KAC_PARKING_CONGESTION_URL`·`IIAC_PARKING_URL`(`numOfRows=100` 1콜), `EV_CHARGER_INFO_URL`·`EV_CHARGER_STATUS_URL`(`EV_PAGE_SIZE=9999`, 상태는 `period` 를 1~10 으로 클램프), 서울 `SEOUL_PARK_INFO='GetParkInfo'`·`SEOUL_PARKING_LIVE='GetParkingInfo'`.

### 주차장 적재 — 세 원천을 한 행 모양으로, 서울 → 표준 → KOTSA 순으로 겹침을 접는다

[parking-master.service.ts](../../apps/friendly/src/modules/parking/parking-master.service.ts) 는 "정규화는 순수 함수 + 사유별 리포트, 쓰기는 전량 교체 트랜잭션" 골격이다(일상지도·집값 마스터와 같다 — [open-data-master-load](../concepts/open-data-master-load.md)). [load-parking-lots.ts](../../apps/friendly/scripts/load-parking-lots.ts) 가 순서를 잡는다: 서울(안내 + 실시간 목록) → 표준데이터(API 또는 `--std-json` 파일) → KOTSA(시군구 251곳 수집 또는 `--kotsa-json` 저장본 → 정규화) → KOTSA 대표 좌표 지우기 → `--dry-run` 이면 리포트 + KOTSA 겹침 미리보기(좌표 있는 행만)만 → 서울·KOTSA 좌표 결측 행 지오코딩 → 위치 못 찾은 KOTSA·지오코딩 뒤에도 한 점에 몰린 KOTSA 제외 → 표준 ↔ 서울 겹침 → KOTSA 끼리 중복 → KOTSA ↔ (서울 + 표준) 겹침 → 교체. KOTSA 가 실패하면(예외) 서울·표준까지 교체하지 않고 멈춘다.

- **`canonKeys`** — 표준데이터는 오픈API(camelCase `prkplceNo`)와 포털 JSON 덤프(UPPER_SNAKE `PRKPLCE_NO`)가 같은 항목을 이름만 달리 주므로, 키를 **밑줄 제거 + 소문자**로 맞춘 뒤 읽는다. 원천의 오타 필드명(`weekdayOperColseHhmm`, `holidayCloseOpenHhmm`, `satOperOperOpenHhmm`)은 올바른 철자와 함께 두 이름 다 시도한다.
- **표준데이터 행**(`normalizeStdParkingRows`): id `std:<관리번호>`, 관리번호·이름 없으면 `droppedBadId`. 좌표는 한국 범위(위도 33~39, 경도 124~132) 밖이면 null. 요금 구분(`parseParkingFeeType` — '혼합'·'유료+무' 는 `mixed`)이 무료면 원천이 0 으로 채운 요금 칸을 비우고, 유료인데 기본 시간·요금이 0/없음이면 "정보 없음"으로 되돌린다. 같은 관리번호가 두 기관명(전남·광주 통합)으로 중복되면 **좌표 있는 쪽, 같으면 기준일 최신 쪽** 하나(`duplicates` 집계). 장애인전용구역 `pwdbsppkzoneyn` Y/N, 기준일 `referenceDate` → `YYYY-MM-DD`.
- **서울 행**(`normalizeSeoulParkingRows`): id·`liveKey` 모두 `seoul:<PKLT_CD>`, 소유는 `'public'` 고정, 주소는 지번(`ADDR`)에 '서울특별시' 접두를 붙여 `lotAddr` 로(도로명 null). `seoulExcludedOper` 가 **관광버스 전용·거주자 우선 전용**(둘 다 '시간제' 가 섞이면 남김)을 뺀다 — 실시간 폴러도 같은 규칙. **노상은 구획마다 행**(좌표만 다름)이라 코드로 접고 좌표는 평균, 면수는 행이 여럿이면 행 수, 한 행뿐이면 원천 `TPKCT` 가 1 이하일 때 null(모름). 서울 openapi 는 좌표 결측을 0 으로 준다 → 범위 검사로 null. 요금 필드는 안내(`PRK_CRG`·`PRK_HM`·`ADD_CRG`·`ADD_UNIT_TM_MNT`)와 실시간(`BSC_PRK_CRG`·`BSC_PRK_HR`·`ADD_PRK_CRG`·`ADD_PRK_HR`) 두 이름을 다 받고, 유무료는 이름 필드(`CHGD_FREE_NM`/`PAY_YN_NM` = '유료'/'무료'), 토·공휴일 무료는 `SAT_CHGD_FREE_NM`·`LHLDY_NM`, 일 최대 `DLY_MAX_CRG`(0 → null), 월정기 `MNTL_CMUT_CRG`. 안내 목록에 없고 실시간 목록에만 있는 코드는 그 행으로 보충(`liveOnlyAdded`). 기준일은 적재일.
- **요금 정리·등록 차량 전용**(`36f07eb3`, 원천 공통 — [PLAN-parking.md](../../docs/PLAN-parking.md) §요금 정리) — `sanitizeParkingFeeRule(row)` 은 **기본 시간 0분/없음인데 기본요금이 있거나**, 기본·추가 요금이 **시간당 2만 원**(`MAX_HOURLY_FEE`, 30분 1만 원)을 넘으면 `baseMin·baseFee·addMin·addFee` 를 통째로 null(1일권·월정액은 둔다)로 바꾸고 true — 표준(관리번호 접기 뒤)·서울(구획 접기 뒤)·KOTSA 모두 부르고 리포트 `feeRuleCleared` 로 센다. 실측 2026-10-10: 기본 0분 116곳('기본 0분 1,500원'), 분·시간 혼동 17곳('추가 1분 1,000원' → 1시간 예상 58,000원), KOTSA 정수 최댓값 80행 등 — 적재 결과 표준 133 · KOTSA 89 · 서울 0행, 남은 이상치 0. `isMonthlyOnlyFee` = 무료가 아니고(`feeType` null 포함) 월정액만 있고 시간 요금(기본 요금 + 기본 시간)·1일권이 없음. 표준데이터는 그 위에 이름·비고에 '…전용'(`거주자주차제 전용`·`주거지전용`·`정기차량전용` 류)이 있고 비고에 시간대(`18:00~`)가 없으면 **등록 차량 전용**(`isStdPermitOnly`)으로 뺀다(`droppedPermitOnly` — 관악구 '○○동제N공영주차장' 21 + 부산 남구 3 + 인천 학교 부설 3 = 27곳). 이름에 '거주자'·'주거지'만 든 곳(지자체 '주거지 주차장' 사업·공유 구획)은 빼지 않는다.
- **지오코딩(스크립트)** — 서울 행 중 좌표 없는 곳(시영 외 구영 등)과 KOTSA 의 입구 좌표 결측·대표 좌표 행은 [life-map-geocode.service.ts](../../apps/friendly/src/modules/life-map/life-map-geocode.service.ts) 의 `geocodeLifeRows` 로 지번 주소를 VWorld 에 묻는다 — 일상지도·집값과 **같은 `LifeGeocodeCache` 영구 캐시**라 재실행은 새 주소만 호출한다([life-map](life-map.md)). 키는 `MapSettingsService.getSecret('vworld')`(어드민 설정>지도 DB 값 우선, 없으면 `.env` `VWORLD_API_KEY` — [db-config-env-fallback](../concepts/db-config-env-fallback.md)), `--offline` 은 캐시만, `--max-calls=N` 호출 상한. `geoSource` 는 `'source'`(원천 좌표) / `'road'`·`'parcel'`(주소 지오코딩) / null. 로그는 원천별 `seoul a/b · kotsa c/d`. 서울 구영·KOTSA 주소의 결과는 저장소 압축본 `life-geocode-cache.json.gz` 로 다시 내보내(`7ff7f1de`, 104,871 → 107,161건) 운영 배포의 `life_map_data` 가 먼저 가져간다 — 운영 적재는 VWorld 를 거의 부르지 않는다.
- **겹침 접기**(`matchParkingDuplicates(primary, secondary, {sameNameRadiusM})` → `dropParkingDuplicates`, `007ac899` 에서 교체) — primary 를 **격자**(칸 한 변 = max(0.0015°, 판정 거리/85km))에 넣고 secondary 행마다 **이웃 9칸**만 보며 같은 곳으로 보이는 primary 중 **가장 가까운 것**과 짝짓는다(전국끼리도 행×행이 아니다). 같은 곳 = **25m 안**(이름 무관) 또는 **100m 안** + `normalizeParkingName`(괄호 보조어 `(시)`·`(구)`… 와 '공영/민영 주차장/타워/빌딩' 꼬리·공백 제거) 동일 또는 `nameSimilarity ≥ 0.5`, 또는 정규화 이름이 두 글자 이상이고 **정확히 같으면 `sameNameRadiusM` 까지**. 좌표 없는 secondary 행은 비교 불가라 남긴다. 쓰임 둘: ① 서울 ↔ 표준데이터 서울 행(옵션 없음 = 100m) — **표준 행을 버린다**(서울 쪽 요금·실시간이 촘촘). 2026-10-05 이전엔 서울 앵커 bbox ±0.01° 안 행을 앵커 전부와 비교했다. ② (서울 + 표준) ↔ KOTSA(`KOTSA_SAME_NAME_RADIUS_M` 300m — KOTSA 좌표는 입구라 같은 주차장도 100~300m 어긋난다, 종묘·세종로 196m·이름 같은 쌍 100~300m 309곳) — **KOTSA 행을 버리고 새 곳만** 더한다(정적 정보는 기존 원천 우선).
- **교체**(`replaceParkingLots`) — 한 트랜잭션(timeout 10분·maxWait 60초)에서 `deleteMany` → 500행 청크 `createMany` → `ParkingSync{kind:'lots', count, geocoded, detail:{std, seoul, kotsa, droppedDup, kotsaDup, kotsaSelfDup}, baseDate}` 기록(중간 상태 노출 없음). `kotsa` = 새로 더한 KOTSA 수, `kotsaDup` = 기존과 겹쳐 뺀 수, `kotsaSelfDup` = KOTSA 끼리 중복. `baseDate` 는 표준 행 기준일의 최댓값(없으면 오늘). 일상지도 상가·집값 통계는 같은 라운드에 스테이징 표 + RENAME 교체로 바뀌었지만(`5655abbc`·`fe0d59ab` — [life-map](life-map.md)·[housing](housing.md)) 주차장(2만 행)·충전기(52만 행) 교체는 **한 트랜잭션 그대로**다.

### KOTSA 공영 보강 — [kotsa-master.service.ts](../../apps/friendly/src/modules/parking/kotsa-master.service.ts)

`007ac899`(2026-10-05) + `36f07eb3`(10-10). 실측·규칙 원문은 [PLAN-parking.md](../../docs/PLAN-parking.md) §KOTSA.

- **시군구 목록**([kotsa-sigungu.ts](../../apps/friendly/src/modules/parking/kotsa-sigungu.ts) `KOTSA_SIGUNGU` 251곳) — 원천의 지역 필터는 **옛 행정코드만** 받는다(강원 42·전북 45·부천 41190·화성 41590·군위 47720 — 새 코드 51·52·41192 는 0건). 로컬 DB 의 새 코드를 옛 코드로 바꾼 후보를 시설 `totalCount` 로 대조해 확정(합 1,767,821 / 전국 1,767,934). **원천 결함**: 행정코드가 바뀐 37개 시군구(강원·전북·부천·화성·군위·옛 인천 남구 28170, ≈24만 행)는 어느 필터로 불러도 `totalCount` 만 오고 목록이 빈다 — 목록엔 남겨 두고(원천이 고치면 그대로 들어오게) 적재 로그 "원천 결함 — 건수만 오고 목록이 빈 시군구 N곳" 으로 알린다.
- **수집**(`collectKotsaSigungu(key, code, {space})`) — 시설 첫 페이지(1만 행). 시설은 관리 ID 순이라 공영(둘째 구간 111xx·112xx)이 앞쪽에 몰린다(전국 공영 13,645행이 모두 시군구 첫 페이지 안) — 페이지가 가득 차고 끝 1,000행(`KOTSA_PUBLIC_TAIL`)에도 공영이 있을 때만 다음 페이지. 운영정보는 같은 순서라 **마지막 공영 위치 + 50행**(`KOTSA_OPR_MARGIN`)만 받고, 빠진 공영이 있으면 1만 행으로 한 번 더. 공영이 없으면(원천 결함 포함) 운영은 안 부른다. 시군구당 1~3콜, 전국 ≈470콜(실측 4분 20초). `--kotsa-dump=<폴더>` 는 `slimKotsaCollected`(공영 시설 + 그 운영정보만)를 `<시군구>.json` 으로, `--kotsa-json=<폴더>` 는 그걸 읽어 API 없이 재적재.
- **정규화**(`normalizeKotsaSigungu(input, loadDate, report)` — 여러 시군구를 한 `KotsaReport` 에 누적) — `prk_manage_agent === '1'`(공영)만. 이름·ID 없음(`droppedNoName`), 한 시군구에서 10번 이상 반복되는 쓰레기 ID(`…-99999-…`, `droppedJunkId`), **요금 구분이 비면 제외**(`droppedNoFeeType` — 공영 13,645행 중 2,981행, 광주 1,949·경기 740 이 업체·아파트·교회·개인 주택 섞임), 좌표·주소 둘 다 없음(`droppedNoLocation`). 요금 구분은 실제 응답 필드 `parkng_chrge_se`(가이드 이름 `prk_chrge_se` 도 읽음) `1`=무료·`2`=유료. 행을 만든 뒤 `sanitizeParkingFeeRule` 을 **먼저** 부르고(오입력 기본요금이 시간 요금으로 보여 월정액 구획을 놓치지 않게), 이름이 `RESIDENT_ONLY_NAME`(`/주거지|업무지(?!구)|거주자/`)이고 `isMonthlyOnlyFee` 면 **거주자 우선 주차 구획**으로 뺀다(`droppedResidentOnly` 90 — 부산 동구 '수5-5(주거지)'·'초량3동-업무지7구간' 월 4만~6만 원만. 시간 요금 있는 공유 구획 '거주자우선주차 05-05' 30분 1,500원과 '동편업무지구' 공영은 남김. `36f07eb3` 이전엔 이름만으로 94행). 같은 관리 ID 가 다시 나오면(시군구를 넘어서도 — `seenIds`) 한 행만, 먼저 것에 좌표가 없고 새 것엔 있으면 바꾼다(`droppedDupId`).
- **운영정보 → 칸**(`kotsaOperationFields(opr, feeType)`) — `Monday`~`Friday`·`Saturday`·`Sunday`(비면 `Holiday`) 의 `opertn_start_time`/`opertn_end_time`('HHMMSS' → 'HH:MM'), 평일 요일끼리 다르면 월요일 기준 + 참고 "평일 요일마다 운영시간이 다름"(실측 0건), `opertn_bs_free_time` 은 참고 "기본 회차 N분 무료". 요금은 `basic_info.parking_chrge_bs_time/bs_chrge`(유료만, 둘 다 양수일 때) · `parking_chrge_adit_unit_time/adit_unit_chrge`(**추가 요금 0원이면 정보 없음** — 공영 운영정보 13,074행 중 11,200행이 '30분 900원 + 10분 0원' 꼴이라 0 으로 두면 예상 요금이 기본 요금에서 멈춘다) · `fxamt_info.parking_chrge_one_day_chrge`(1일권)·`parking_chrge_mon_unit_chrge`(월정액). 무료면 요금 칸을 비운다.
- **좌표 정리**(로더가 지오코딩 앞뒤로) — `markKotsaPlaceholderCoords(rows)` 는 이름이 다른 KOTSA 행이 **3곳 이상**(`PLACEHOLDER_MIN_ROWS`) 한 좌표(소수 6자리)에 몰리면 원천 좌표를 대표값으로 보고 지워 주소로 다시 찾게 한다(구미 35곳·대구 북구 11곳이 한 점). 지오코딩 뒤 `{includeGeocoded:true}` 로 한 번 더 — 주소도 뭉뚱그려져(대구 '○○길인근' 노상, 부산 범일동 거주자 구획) 다시 한 점에 모이면 위치를 모르는 것으로 보고 뺀다(10-05 실측 241행). 끝내 못 찾은 행(161)도 뺀다 — 좌표 없이는 기존 주차장과 겹침을 판정할 수 없다. 둘씩 붙은 구획(압구정고가1·2)은 그대로. `dedupeKotsaRows` 는 관리 ID 만 다른 같은 주차장(정규화 이름 동일·**300m** 안, 격자 이웃 칸)을 하나로 — 원천 좌표 행을 주소로 찾은 행보다 먼저 남긴다(1,312행).
- 행 모양: id `kotsa:<prk_center_id>`, `ownership 'public'`, `lotType` 은 이름에서(`parseParkingLotType`), 주소는 원천 한 칸(`prk_plce_adres`)을 `(로|길)\s*\d` 면 도로명·아니면 지번 칸으로, `totalSpaces` = `prk_cmprt_co`, 좌표 = 입구(`prk_plce_entrc_la/lo`), `phone`·`orgName`·`dayMaxFee`·`satFree`·`holFree`·`payMethods`·`disabledZone`·`liveKey` 는 null, `baseDate` = 적재일.
- **실시간은 쓰지 않는다** — 시군구로 거르면 시설과 이어지는 실시간은 전국 858행(40곳, 서울 237)뿐인데 15분 간격 5회(월요일 07:28~08:28) 관측에서 값이 하나도 안 바뀌었다(가이드의 갱신 주기 '일 1회'). 값이 바뀌는 행(전국 1만 행 중 3.5분에 110)은 `00000-19199-…` 처럼 시설에 없는 ID 라 위치를 모른다. 서울 실시간은 서울 API 그대로.

### 충전소 적재 — 충전기 52만 행을 충전소 단위로 접는다

[ev-master.service.ts](../../apps/friendly/src/modules/parking/ev-master.service.ts) + [load-ev-chargers.ts](../../apps/friendly/scripts/load-ev-chargers.ts).

- `fetchAllEvChargers` — 9,999행 페이지를 **순차**로(동시 호출 없음) 받다가 페이지가 덜 차거나 `totalCount` 에 닿으면 멈춘다(안전 상한 120페이지, 실측 ~53). `--zcode=<시도>` 는 확인용 한 시도만.
- `normalizeEvChargerItems` — `statId`·`chgerId`·`statNm` 필수(`droppedBadId`), **삭제 표시 `delYn=Y`**·**버스 전용 타입 `11`**(DC콤보2)·같은 `(statId, chgerId)` 중복 제외, 충전소를 처음 만날 때 좌표가 한국 범위 밖이면 그 행 제외(`droppedBadCoord`). 충전소(`EvStation`, id = `statId`)에 기수·급속 기수(`isEvChargerFast`)·사용 가능(stat 2)·충전 중(stat 3)·`hasFast` 를 세고, 상태 없는 충전기는 9(미확인), `statusAt` = 적재 시각.
- `replaceEvChargers` — 한 트랜잭션(timeout 30분)에서 `ev_chargers` → `ev_stations` 삭제 후 500행 청크 삽입, `ParkingSync{kind:'ev', count:충전소 수, detail:{chargers, deleted, busOnly, badCoord}}`. 주석대로 "52만 행 ≈ 수 분, 그동안 다른 쓰기는 대기"(로컬 실측 교체 21초).

### 실시간 폴러와 혼잡 이력 — `ParkingLiveService`

[parking-live.service.ts](../../apps/friendly/src/modules/parking/parking-live.service.ts). 단일 인스턴스 인프로세스(CLAUDE.md no-Redis) — 실시간 값은 **메모리에만**, 이력만 DB 에 누적한다.

- `start()` — `cron` 이 빈 값이면 아무것도 안 한다. croner `Cron(cron, {timezone:'Asia/Seoul', name:'parking-live', unref:true, catch:true})` 등록 + **기동 직후 1회 `pollOnce()`**(첫 cron 까지 실시간이 비지 않게). `stop()` 은 cron 정지.
- `pollOnce()` — `running` 플래그로 겹치면 건너뛴다([in-memory-singleton-gates](../concepts/in-memory-singleton-gates.md)). ① `seoulKey` 가 있으면 `GetParkingInfo` 1~1000 **1콜** → `parseSeoulLiveRows`(연계 코드 `PRK_STTS_YN` 이 `'1'`(20분 이내)·`'2'`(2시간 이내)인 행만, 버스·거주자 전용 제외, 현재 대수·면수 필수) → 원천 갱신 시각이 **2시간**(`LIVE_MAX_AGE_MS`)보다 오래된 값은 버림 → `lots` Map 통째 교체. 실패하면 warn 하고 **이전 값 유지**. ② `dataGoKrKey` 가 있으면 한국공항공사·인천을 `Promise.allSettled` 로 병렬 1콜씩 — 실패한 쪽은 이전 값을 유지하고 `airportStale=true`, 하나라도 성공하면 `airportAt` 갱신. ③ 이력 후보는 **원천 갱신이 30분(`HISTORY_MAX_AGE_MS`) 이내**인 값만(같은 값이 반복 누적되지 않게), 공항은 이번에 성공한 원천만.
- 행 해석: 서울 `NOW_PRK_VHCL_CNT`/`TPKCT`/`NOW_PRK_VHCL_UPDT_TM`('YYYY-MM-DD HH:MM:SS' KST), 한국공항공사 `airportKor`(→ `PARKING_AIRPORTS.apiName` 매칭, 모르는 공항 제외)·`parkingAirportCodeName`·`parkingOccupiedSpace`/`parkingTotalSpace`(면수 0 — 청주 제4주차장 등 — 은 값 없음)·`sysGetdate`+`sysGettime`, 인천 `floor`(구역명)·`parking`(현재 대수)·`parkingarea`(면수)·`datetm`('YYYYMMDDHHMMSS.sss'). `kstToIso` 가 세 형식을 ISO 로. `liveOf` 는 `available = max(0, 면수−현재)`, `level = parkingLevelOf(면수, 현재)`.
- **`recordHistory`** — (key, KST 요일, 시) 칸 하나당 한 행에 `$executeRaw` UPSERT: `INSERT … ON CONFLICT(key,dow,hour) DO UPDATE SET samples+1, occSum+occ, fullCount+full, updatedAt WHERE 기존 updatedAt <= 새 updatedAt − 4분`. 점유율은 초과 주차를 고려해 **0~1.5 로 자르고**, `rate ≥ 0.97`(`PARKING_FULL_RATIO`)이면 만차 표본. **같은 칸을 4분 안에 다시 쓰지 않는다**(재기동 직후 폴링·겹친 cron 이 표본을 부풀리지 않게). Prisma 가 SQLite DateTime 을 epoch ms 정수로 저장하므로 원시 SQL 도 `now().getTime()` 숫자로 쓴다. key = `seoul:<코드>` | `airport:<IATA>:<주차장명>`(`airportLotKey`).
- 조회: `isFresh`(원천 갱신 시각, 없으면 폴링 시각 기준 2시간) 통과 값만 `getLot(liveKey)`·`liveKeys()` 로 내보낸다 — 폴링이 계속 실패해 남은 낡은 값은 실시간으로 안 보인다. `getPattern(key)` = **오늘 KST 요일**의 24칸, 표본 24(`PARKING_PATTERN_MIN_SAMPLES` — 5분 폴링 × 1시간 = 12/주 → 약 두 주) 미만 칸은 `occ`·`fullRatio` null, 그 요일 행이 하나도 없으면 null. `usualNow(keys)` = 지금 (요일, 시) 칸의 평균 점유율(표본 24 이상).
- `buildAirportList` — 상수 `PARKING_AIRPORTS` 14곳 순서(인천 먼저)로, 폴링된 주차장을 붙이고 **면수 있는 주차장 합**으로 공항 대표 단계, 주차장마다 `usualOcc`.

### 충전기 상태 폴러 — `EvStatusPoller`

[ev-status.service.ts](../../apps/friendly/src/modules/parking/ev-status.service.ts). 상태를 전량 재적재하지 않고 **최근 10분 변경분만** 받는다.

- `start()` — `cron` 또는 `serviceKey` 가 비면 등록 안 함. 주차 폴러와 달리 **기동 직후 폴링이 없다**(상태가 DB 에 있으니 재기동해도 비지 않는다).
- `pollOnce()` — `running` 게이트, `evStation.count()==0`(미적재)이면 건너뜀, `getChargerStatus?period=10` 9,999행 페이지를 최대 5페이지(실측 ~1.3만 행 = 2콜). `parseEvStatusRows` 는 같은 충전기가 여러 번이면 `statUpdDt` 가 늦은 쪽.
- `applyEvStatus` — 400행 청크로 `UPDATE "ev_chargers" SET stat, statUpdDt, lastTedt=COALESCE(새 값, 기존), nowTsdt FROM (VALUES …) AS v WHERE statId/chgerId 일치`(SQLite 3.33+ `UPDATE … FROM`, VALUES 열 이름은 `column1…6`) → 바뀐 `statId` 들을 400개 청크로 `UPDATE "ev_stations" SET availableCount=(SELECT COUNT(*) … stat=2), chargingCount=(… stat=3), statusAt=<epoch ms>` 상관 서브쿼리 재집계. **모르는 충전기(적재 뒤 신설)는 무시** — 다음 `load:ev-chargers` 에서 들어온다. 실패는 warn 만(로컬 실측: 10분 폴링 1회에 ~1만 곳 갱신).
- `onApplied(at)`(`5655abbc`, E-9) — 바뀐 충전소가 1곳 이상이면 반영 시각을 콜백으로 알린다. 라우트가 `ev.noteStatusAt(at)` 을 물려 `EvService` 의 `statusAt` 메모가 폴링 직후 바로 새 값이 된다(그 시각이 곧 새 `MAX(statusAt)`).

### 조회 — 일상지도의 점/셀 규약을 그대로

[parking.service.ts](../../apps/friendly/src/modules/parking/parking.service.ts)·[ev.service.ts](../../apps/friendly/src/modules/parking/ev.service.ts). 로컬 SQLite 만 읽고, 실시간은 폴러 메모리를 합친다.

- **미적재 게이트** — `requireLots`/`requireLoaded` 가 최신 `ParkingSync(kind)` 가 없으면 `ParkingServiceError(503)` + "`pnpm --filter friendly load:parking-lots` 실행 필요"(충전소는 `load:ev-chargers`). 라우트가 `replyUpstreamError`([reply-upstream-error.ts](../../apps/friendly/src/lib/reply-upstream-error.ts))로 503/404 를 직접 응답한다(전역 error-handler 가 5xx 를 500 으로 뭉개므로 — 일상지도·집값과 같은 경로). 상세·공항·상태·리뷰는 적재 여부와 무관.
- **points / cells** — 줌(내림) ≥ `PARKING_POINT_MIN_ZOOM` **13**(충전소 `EV_POINT_MIN_ZOOM` **15**) 이고 bbox 가 **요청 줌에서 가로·세로 32타일 이하**(`pointsSpanOk` — 웹 메르카토르 타일 수, 5K 화면을 45° 돌려도 들어가는 크기)면 points(줌 값을 속여 넓은 bbox 로 점을 긁는 요청은 셀로 강등): `(lat,lng)` 인덱스 범위 `findMany take 3,001` → 3,000(`PARKING_POINTS_MAX`) 초과면 `truncated` + `count`. 점은 최소 필드(주차장 `id·lat·lng·name·feeType·level·available`, 충전소 `id·lat·lng·name·level·fast`). 2026-10-05(`5655abbc`) 이전엔 줌과 무관한 1.5° 고정 상한이었다. 일상지도·집값과 달리 커버링 COUNT 뒤 6.4만 행 초과 강등(`POINTS_DEMOTE_COUNT`)은 쓰지 않는다(`take 3,001` 로 충분). 아니면 cells: [map-cells.ts](../../apps/friendly/src/lib/map-cells.ts) `cellGrid(zoom, bbox)` — bbox 를 **국내 범위(33~39N·124~132E)로 자르고** [lifeMap.ts](../../packages/utils/src/lifeMap.ts) 의 **전국 고정 원점 격자**(`LIFE_CELL_ORIGIN` 33N·124E, `lifeCellSizeDeg` = `360/2^z/4`, 위도 0.8배)로 셀 경계에 바깥 정렬, **열×행이 6,000(`MAP_CELLS_MAX`)을 넘으면 줌을 하나씩 낮춰 셀을 키운다**(400 거부 대신 — 1080p ≈600셀·5K ≈4,000셀이라 정상 화면은 그대로) → `$queryRaw` `CAST(...) AS INTEGER` 로 `GROUP BY cx, cy`(COUNT·AVG) → 무게중심을 셀 중심 ±15% 로 클램프([life-map](life-map.md) 와 같은 SQL). E-V1 실측: 충전소 z22 전국 셀 86,163개·4.9MB(10키 힙 +77.6MB, 상한 300이면 ≈2.3GB) → 29KB, 주차장 z22 전국 16,686셀·953KB.
- **셀 LRU** 300개·10분 + **셀 수 기준 바이트 상한**(`maxSize: CELL_CACHE_MAX_UNITS` 10만 셀 ≈ 10MB, `sizeCalculation: cellResultSize` — [bounded-byte-caches](../concepts/bounded-byte-caches.md)), 키 = `cellKeyOf(grid)`(**실제로 쓴 줌**|정렬 bbox) `|필터 비트|syncId`(재적재하면 syncId 가 바뀌어 자연 무효 — 남용 요청은 낮춘 줌의 같은 키로 모인다). **`liveOnly`(주차장) 셀은 캐시하지 않는다** — 폴링마다 집합이 바뀐다. **`availableOnly`(충전소) 셀은 `5655abbc` 부터 캐시한다** — 키에 마지막 상태 반영 시각 `statusAt` 을 붙여 폴링 사이엔 재사용, 폴링 뒤엔 키가 갈린다(그 전엔 캐시 안 함). 충전소 셀 캐시 적중에도 `statusAt` 은 새 값으로.
- **충전소 커버링 인덱스**(마이그레이션 `20261005030000_ev_station_covering_index`, E-5) — 기존 `(lat,lng)` 를 `(lat, lng, availableCount, hasFast, parkingFree, limited)` 로 교체(3.05MB, 생성 0.17초). 필터를 켠 셀 집계가 99,850행 표를 행마다 랜덤 조회하던 것(`availableCount>0` 이 85% 라 필터가 행을 거의 못 줄임)이 `SEARCH USING COVERING INDEX` 가 된다 — 필터 셀 403~610 → 66~124ms. 접두가 같아 점·주변 조회도 그대로 탄다. 폴러의 `availableCount` 갱신 쓰기 증폭은 10분에 22 → 80ms 로 무시할 수준(발견 원문).
- **운영 직렬화**(`2b072b53`, X-6 — [friendly](friendly.md)) — `lots/points`·`ev/points` 의 200 은 운영에서 zod 대신 `JSON.stringify`(`app.ts` `TRUSTED_RESPONSE_ROUTES`), 테스트 환경은 두 출력이 같은지 매 응답 검사.
- **`liveOnly`** 는 `liveKey IN (폴러가 지금 신선한 값을 가진 키)` — 폴링 전이면 빈 결과. `publicOnly` = `ownership='public'`, `freeOnly` = `feeType='free'`, 충전소 `fastOnly` = `hasFast`, `freeParkingOnly` = `parkingFree=1`, `availableOnly` = `availableCount>0`, `openOnly` = `limited` 가 false 또는 null.
- **nearby** — 등거리 근사 bbox(위도 111,320m/°, 경도는 cos 위도)로 후보를 좁힌 뒤 하버사인 거리로 반경 필터·정렬, `items` 는 `limit` 까지, `total` 은 반경 안 전체. 충전소는 `5655abbc`(E-10)부터 **2단계** — 박스 안 `id·lat·lng` 만 읽어 거리 상위 `limit` 개를 고르고, 그 id 만 `IN` 으로 전 컬럼을 읽는다(강남 r=3km 박스 1,237행 전 컬럼 → 28.8 → 10.9ms, 같은 거리는 1단계 행 순서). 주차장 nearby 는 1단계 그대로(3.4ms).
- **detail** — 주차장: 행 + 메모리 실시간 + `liveKey` 가 있으면 `getPattern`. 충전소: 행 + 충전기 목록(`chgerId` 순, 원천 'yyyyMMddHHmmss' 시각 3종을 ISO 로 — `statUpdatedAt`·`lastChargeEndAt`·`chargingSince`) + `statusAt`. 충전소 `level` = `evStationLevel`(사용 가능 1기↑ available / 없고 충전 중 있으면 busy / 나머지 offline), `kindLabel` = `evKindLabel`(상세 코드 우선).
- **airports** — 폴러 스냅샷 + `usualNow` → `{airports, fetchedAt(아직 못 받았으면 null), stale}`.
- **status** — 두 `ParkingSync`(주차장 `detail` 의 `std/seoul/kotsa` → `bySource`) + 충전기 수(적재 이력 `detail.chargers` — 52만 행 COUNT 를 매번 하지 않는다) + 충전소 상태 반영 시각 + 폴러 상태(`lotCount`·`lotAt`·`airportLotCount`·`airportAt`). 상태 반영 시각은 `5655abbc`(E-9)부터 라우트가 넘긴 `evStatusAt: () => ev.getStatusAt()` — `EvService` 의 1분 메모(폴러가 `noteStatusAt` 으로 즉시 갱신)를 같이 쓴다. 그 전엔 요청마다 99,850행 `MAX(statusAt)` 집계(서비스 33ms, 인덱스 없음). 주입이 없으면(단독 생성) 직접 MAX. 다른 프로세스(`load:ev-chargers`)의 재적재는 1분 안에 따라온다.
- **맛집 리뷰 주차 집계**(`getRestaurantReviews`) — [canonical-members.ts](../../apps/friendly/src/modules/restaurant/canonical-members.ts) `resolveCanonicalMembersByPlaceId` 로 **공개 멤버**(네이버 + 다이닝코드 + 테이블링 partner 행 — 공개 리뷰 융합과 같은 규칙, [canonical](canonical.md))를 풀고(없으면 404), 그 리뷰들의 `ReviewSummary(status='done')` 에서 `aspectsJson['주차']` 극성(pos/neg/neu)을 세고, `tipsJson` 중 '주차' 가 든 40자 이하 팁을 빈도순(동률은 가나다) **상위 5**. '주차' 관점은 리뷰 검색 enrich 가 기록하는 9관점(`ASPECTS` — [retrieval.ts](../../apps/friendly/src/modules/review-search/retrieval.ts), [review-search](review-search.md))의 하나이고, 팁은 리뷰 요약 LLM 이 뽑는다([summary.service.ts](../../apps/friendly/src/modules/summary/summary.service.ts) 프롬프트 예시 "주차 협소" — [ai](ai.md)).

### 웹 `/parking` — 집값·일상지도와 같은 지도 + 패널/시트 골격

[ParkingPage.tsx](../../apps/web/src/routes/ParkingPage.tsx)(424줄) 주석대로 "레이아웃·분기·시트 조율은 집값·일상지도와 같다"([housing](housing.md), [map-sheet-shell](../concepts/map-sheet-shell.md)).

- **URL 이 진실** — `?t=ev|airport`(주차장이면 생략), `?ll=lat,lng&z=줌`(줌 5~19만 인정, 사용자 이동이 끝났을 때만 소수 5자리로 기록, `replace`), `?sel=`(탭마다 뜻이 다름 — 주차장 id·충전소 id·공항 IATA, 80자 이하). 탭을 바꾸면 `sel` 을 비운다. **필터는 URL 이 아니라** [parkingPrefsStore.ts](../../apps/web/src/stores/parkingPrefsStore.ts)(`lp:parking-prefs` v1 persist, `lotFilters`·`evFilters` 만 partialize — `housingPrefsStore` 관례).
- **진입 중심** — URL → 저장한 내 위치(`useAirLocation` — 날씨·대기·일상지도·집값과 공유, [saved-location-glance](../concepts/saved-location-glance.md)) → 서울시청(37.5665, 126.978), 줌 15. `03bc43f0`(2026-10-05)부터 바깥 `ParkingPage` 가 **저장 위치 조회 중이고 URL 에 `ll` 이 없으면** "불러오는 중…"(`data-testid="parking-waiting-location"`)만 그리고, 응답이 온 뒤 `ParkingPageBody` 에 `saved` 를 내려 지도를 띄운다 — 예전엔 로그인 사용자가 서울시청으로 타일·점·주변을 먼저 받았다가 저장 위치로 옮기며 전부 다시 받았다. 게스트는 저장 위치가 로컬이라 기다림이 없다. 그래도 늦게 오면(로그인 직후 게스트 저장분 업로드 등) 사용자가 아직 안 움직였을 때 1회 `flyTo` 는 남아 있다. `?sel` 로 진입하면 상세 좌표가 도착했을 때 1회 이동(`flownSelRef`). 지도에는 저장 위치 객체를 그대로 넘긴다(`{lat,lng}` 를 새로 만들면 렌더마다 참조가 바뀌어 오버레이를 서너 번씩 다시 그렸다).
- **조회 키** — 모든 뷰포트 변경을 250ms 디바운스(`useDebounced`)해 `formatBbox` bbox·줌으로. **지금 탭의 훅만 활성**(점·주변·상세 — 나머지는 `null`/`enabled:false`), 상태는 늘. `086e4510` 부터 점·주변 조회는 React Query 의 `signal` 을 fetch 까지 넘겨, 응답 전에 지도를 다시 움직이면 지나간 뷰포트 요청을 끊는다. 주변 목록은 지도 중심 기준 `PARKING_NEARBY_RADIUS_M`(1km)·15건. 공항 탭으로 바꿀 때 줌이 9 초과면 전국 뷰(36.1, 127.8, 줌 7)로 날아간다.
- **마커**([parkingMarkers.ts](../../apps/web/src/components/parking/parkingMarkers.ts)) — id `lot:<id>`·`ev:<id>`·`airport:<IATA>`, 셀 `cell:<lot|ev>:<응답 cells 인덱스>`(`parseParkingMarkerId`). 단계별 아이콘 data URL 을 **모듈 상수로 한 번** 만들어 공유하고, `eb24c6e5` 부터 `MapCanvas` 가 이런 공유 아이콘을 장치 픽셀 canvas 에 한 번 구워 쓴다([mapIconRaster.ts](../../apps/web/src/components/restaurant/mapIconRaster.ts)) — 셀 버블은 건수가 새겨져 셀마다 그림이 달라 `icon.perMarker: true` 로 굽기에서 뺐다. 마커 갱신은 id 기준 차분([mapMarkerSync.ts](../../apps/web/src/components/restaurant/mapMarkerSync.ts) — 사라진 것만 지우고 바뀐 것만 고친다, [map](map.md)). 셀 버블은 `layer:count` 키로 메모, 셀은 `fixedScale`. 라벨은 **주변 목록 + 선택 항목만**(주차장은 여석이 있으면 `이름 · 여석 N`), 공항은 14곳뿐이라 항상(`국제공항`/`공항` 꼬리 제거). 셀 클릭 → `flyToZoomIn(현재 줌+2)`, 공항 → `flyToZoomIn(줌 14)`, 목록 선택 → `flyTo`(웹 작은 화면은 `bottomInset: sheetHalfInset(headerHeight)`).
- **안내 칩** — 셀 모드면 "13(충전소 15) 이상 확대하면 주차장(충전소)이 하나씩 보입니다(지금 N)", 잘렸으면 "많아서 일부만 표시 중 — 더 확대해 주세요", 조회 중이면 "불러오는 중…".
- **레이아웃** — `useIsDesktopXl` JS 분기. xl 이상: 좌측 400px `aside`(LifeGoToBox — 열려 있으면 아래를 숨김 / `ParkingTabBar` 전체 / 상세 또는 목록 / `ParkingFooter`) + 우측 지도. xl 미만: `setSubBar` 에 LifeGoToBox(bar) + 탭만, 지도는 `fixed`(`--map-bottom-inset` 120px), 목록 시트(z 20 — 목록 머리 바로 아래에 필터 칩을 끼워 peek 에선 머리만 보이고 half 부터 칩이 따라온다, 푸터 포함) + 선택 시 상세 시트(z 25, `key=tab:sel`) — `useMapSheets(sel!==null)`([useMapSheets.ts](../../apps/web/src/components/sheet/useMapSheets.ts)).
- **지역 이동** — 일상지도의 [LifeGoToBox.tsx](../../apps/web/src/components/life-map/LifeGoToBox.tsx) 를 그대로(placeholder "지역·역·주소로 이동", 최근 위치 스토어 공유). **내 위치**는 버튼으로만(`useUserLocation({auto:false})`), 얻으면 줌 15 로 이동하고 상세의 "내 위치에서 N m" 거리 계산에 쓴다.
- [ParkingMapView.tsx](../../apps/web/src/components/parking/ParkingMapView.tsx) — `MapCanvas` 한 장(`poolKey='parking'` — [MapCanvas.tsx](../../apps/web/src/components/restaurant/MapCanvas.tsx) 인스턴스 풀, `eb24c6e5` 부터 풀 상한 3이라 다른 지도 페이지를 셋 넘게 오가면 가장 오래 안 쓴 인스턴스가 dispose 된다), 저장 위치(보라 점 '내 위치')·현재 위치(파란 점)는 fit 에서 빠지는 `overlayMarkers`, 지도 키 게이트(확인 중 / vworld 키 미등록 안내), 우하단 `MyLocationButton`. 도메인 마커는 페이지가 만든다([map](map.md)).
- [ParkingDetails.tsx](../../apps/web/src/components/parking/ParkingDetails.tsx) — 공용 `DetailShell`(← 목록 / 지도 중심으로). **주차장 카드**: 단계 색 점·유형 줄·면수·내 위치 거리 → 실시간 박스("여석 N / 면수 · 단계 · 실시간 N분 전 기준 · 서버가 5분마다 갱신") → pill(장애인 전용구역·토요일 무료·공휴일 무료) → 오늘(운영 중 / 운영 전·종료 / 오늘 무료) · 요금(일 최대·1일권·월 정기권) · 예상 요금(무료가 아니고 기본 요금이 있을 때만 1·2·3시간) · 운영시간 3종 + "공휴일은 따로 판정하지 않아 일요일 시간으로 봅니다." · 결제 · 참고 · 주소 · 관리(전화 `tel:`) · 출처(주소 지오코딩이면 "위치는 주소로 찾은 값") → **`PatternChart`** → 네이버 지도 자동차 길찾기(`map.naver.com/p/directions/-/lng,lat,이름/-/car`). `PatternChart` 는 오늘 요일 24막대(지금 시각만 진하게 — 시각은 카드를 연 때 한 번만 읽음, 표본 부족 칸은 옅은 짧은 막대, 호버 값, 50%·100% 헤어라인, 스크린리더 요약 "금요일 평소 가장 붐비는 시각 N시(P%)"), 준비된 칸이 0 이면 "평소 혼잡도는 실시간 값을 쌓는 중입니다(시각별 표본 max/24)". **충전소 카드**: 사용 가능 N / 기수, 충전 중·급속·완속, "상태 N분 전 반영(10분마다)", pill(주차료 무료/유료·이용 제한 — 사유·지상/지하 층), 충전기 목록(상태 색 점·급속/완속 kW·타입명·상태·충전 시작 후 경과), 이용 시간·주소·운영(전화)·안내·출처. **공항 카드**: 인천은 구역명 `T1…`/`T2…` 로 "제1/제2여객터미널" 묶음, 주차장별 점유 막대(100% 에서 자름) + 평소 점유율 세로선, 출처 문구.
- [ParkingLists.tsx](../../apps/web/src/components/parking/ParkingLists.tsx) — 주변 주차장·충전소(머리 "지도 중심 1km 안 · N곳", 에러 "적재 전일 수 있음" / 로딩 / 빈 상태 "지도를 옮기거나 필터를 풀어 보세요"), 공항 목록(지도 중심 거리순, "주차장 N곳 · 전체 P% 사용 · 만차 M곳", 머리 "HH:MM 기준 · 일부 이전 값"). [ParkingFooter.tsx](../../apps/web/src/components/parking/ParkingFooter.tsx) — 범례(색은 항상 글자와 함께), 적재 상태 한 줄(`주차장 20,261곳(서울 836 · 전국 표준 17,357 · 교통안전공단 2,068) · 실시간 여석 99곳 · N분 전 갱신` 모양 — 교통안전공단 칸은 `bySource.kotsa > 0` 일 때만, `007ac899`), 출처 문구("출처: 전국주차장정보표준데이터·한국교통안전공단 주차정보(공공데이터포털) · 서울시 공영주차장 안내·시영주차장 실시간 주차대수(서울 열린데이터광장). 요금·운영시간은 원천 신고값이라 현장과 다를 수 있습니다"). [parkingFormat.ts](../../apps/web/src/components/parking/parkingFormat.ts) — `lotTypeLine`·`feeRuleOf`(feeType 없으면 `paid` 로 계산)·`todayHours`·`lotAddress`(도로명 우선)·`naverCarDirections` — 목록·상세·식당 섹션이 같은 문구를 쓰게 한 곳에.

### 맛집 상세 통합 — '가는 법' 섹션과 홈 한 줄

[ParkingSection.tsx](../../apps/web/src/components/restaurant/detail/ParkingSection.tsx) 의 두 컴포넌트가 **같은 조회 키**(`useRestaurantParkingReviews(placeId)` + `useParkingLotNearby(lat, lng, {radius: 300, limit: 5})`)를 써서 React Query 캐시를 공유한다. 2026-10-05(`14f48e16`) 이전엔 상세를 열기만 해도(홈 탭) 주차 조회 2건 + 주변 주차장 5분 폴링이 나갔고, 지금은 홈 탭이 '영업 정보' 섹션에 `useInViewOnce`([useInViewOnce.ts](../../apps/web/src/components/restaurant/detail/useInViewOnce.ts))를 걸어 그 섹션이 화면에 들어온 뒤에야 `ParkingSummaryLine` 에 `enabled=true` 를 넘긴다([transit](transit.md)).

- **`ParkingNearbySection`**(TransitTab 세 번째 섹션) — 헤더 "주차" + "주차 페이지에서 보기"(`/parking?ll=<roundCoord>&z=17`, 좌표가 있을 때만). `008e0081`(2026-10-10)부터 `lat`/`lng` 가 null 일 수 있다 — 좌표 없는 식당은 TransitTab 이 "좌표 정보가 없어 주변 대중교통·주차장을 찾을 수 없어요" 안내 **아래에** 이 섹션을 붙이고, 섹션은 리뷰 평가·팁·다이닝코드 시설만 그린다(주변 주차장 조회·목록·링크 없음 — `useParkingLotNearby` 는 좌표가 null 이라 비활성). 보여 줄 리뷰 정보도 없으면 `null`. 리뷰 언급이 있으면 평가 한 마디(`verdictOf`: 긍정 > 부정 "리뷰: 주차 편한 편", 부정 > 긍정 "…불편한 편", 같으면 "…평가 엇갈림") + "좋음 N · 아쉬움 M · 보통 K (분석 리뷰 X건 중)", 팁 칩(`주차 협소 ×3`), 다이닝코드 시설에 '주차' 가 있으면 "다이닝코드 시설 정보: 주차 가능". 아래에 반경 300m(`PARKING_RESTAURANT_RADIUS_M`) 주차장 5곳(단계 색 점·유형·요금 규칙·실시간 여석·거리) — 행을 누르면 `/parking?ll=&z=17&sel=<id>`. 없으면 "반경 300m 안에 등록된 주차장이 없어요 — 공영·표준데이터 기준이라 건물 부설주차장은 대부분 빠져 있어요".
- **`ParkingSummaryLine`**(HomeTab '영업 정보' 주소 줄 아래) — 평가 한 마디, 없으면 첫 팁(`리뷰: '주차 협소'`), 그것도 없으면 다이닝코드 "주차 가능(다이닝코드)" + 가장 가까운 주차장(`이름 거리 · 무료 · 여석 N`). 둘 다 없으면 그리지 않는다. 누르면 '가는 법' 탭으로. `420a6be` 부터 `onOpen` 이 **선택 prop** — HomeTab 의 `availableTabs` 에 `'transit'` 이 없으면(어드민 맛집 상세) 누를 수 없는 `div` 로 그린다(공개 동작은 그대로). `14f48e16` 부터 `enabled`(기본 true) 선택 prop — false 인 동안은 리뷰 집계(`placeId` 를 null 로)·주변 주차장(`enabled:false`) 둘 다 안 부르고 상세 응답만으로 아는 것(다이닝코드 "주차 가능")만 그린다. 주석은 "캐시에 이미 있으면 그 값은 그대로 쓴다" 인데 그건 주변 주차장(키 그대로 `enabled` 만 끔)만이다 — 리뷰 집계는 키가 `placeId: null` 로 바뀌어 가는 법 탭에서 받아 둔 캐시도 안 읽힌다.

### 테스트 — 백엔드 59 · utils 14 · 웹 15 (2026-10-10 기준, 2026-09-26 엔 30 · 14 · 7)

- friendly(59): [parking-api.adapter.test.ts](../../apps/friendly/src/modules/parking/parking-api.adapter.test.ts) 13(봉투 6 — GW·인천·단건·환경공단, 03/502, 게이트웨이 JSON·XML 503·04 재시도 대상, **KOTSA `listKey`**, **초당 한도는 길게 쉬고 재시도·일 한도(같은 22)는 재시도 안 함** / `callDataGoKr` 4 — Encoding 키 그대로·에러에 키 없음, 04 재시도 성공, 키 없음 503, 초당 한도 `attempts` 까지 / `fetchKotsaPage` 경로·`format=2`·1만 행, `createCallSpacer` 간격 / `callSeoulOpen` 1), [parking-master.service.test.ts](../../apps/friendly/src/modules/parking/parking-master.service.test.ts) 15(**계약 enum 6종 ↔ utils 동일성 1**(`e5a45348`), **요금 정리·등록 차량 전용 3**(`36f07eb3`), `canonKeys` 1, 표준 4, 서울 3, 겹침 3 — 기존 규칙·격자 칸 경계를 넘는 짝·`sameNameRadiusM`), [kotsa-master.service.test.ts](../../apps/friendly/src/modules/parking/kotsa-master.service.test.ts) 15(정규화 4 — 운영정보 매핑·사유별 제외·같은 ID 좌표 교체·가이드 필드명, 거주자 구획·요금 정리 2, `kotsaOperationFields` 2, `collectKotsaSigungu` 4 — 운영 +50행·빠지면 전체·다음 페이지·원천 결함 / 저장본, 대표 좌표·KOTSA 중복 3), [parking-live.service.test.ts](../../apps/friendly/src/modules/parking/parking-live.service.test.ts) 7(`kstToIso` 1, 서울 1, 공항 3, 충전기 2), [parking.test.ts](../../apps/friendly/src/modules/parking/parking.test.ts) 9(격리 DB — 미적재 503 + 적재 명령 안내, 주차장 점/셀·필터·주변·상세 평소 혼잡도·404·bbox 400, 충전소 + `applyEvStatus`, 공항 폴링 전 14곳 빈 목록, **셀 상한·점 모드 범위(z22·z21 전국 = z9 셀과 동일, SEOUL_BBOX z20 은 셀 — E-V1)**, **충전소 상태 시각 공유·사용 가능만 셀 캐시(E-9)**, **status·airports `Cache-Control` 60초(D-10)**, 맛집 리뷰 집계·404, **폴러 1회 → 메모리·이력 UPSERT·4분 안 재기록 건너뜀**). 픽스처는 "실측(2026-09-25) 응답을 줄여" 썼고, `e5a45348` 이 주차장·충전소 픽스처 반환을 Prisma 입력 타입으로 바꿨다(테스트 포함 타입체크의 id 누락 오류). 공용 [map-cells.test.ts](../../apps/friendly/src/lib/map-cells.test.ts) 6건은 [friendly](friendly.md) 몫([external-api-proxy-fixture](../concepts/external-api-proxy-fixture.md)).
- utils(14): [parking.test.ts](../../packages/utils/src/parking.test.ts) — 코드 파싱 1 · 운영시간 4(정규화·00:00~00:00/24시간·자정 넘는 운영·KST 요일) · 요금 4(올림·무료/일 최대/1일권·서울 5분 반복·문구) · 혼잡/충전기 3 · 이름/공항 2.
- 웹(15): [ParkingPage.test.tsx](../../apps/web/src/routes/ParkingPage.test.tsx) 8(MapCanvas 목 — 뷰포트를 올리지 않아 points 요청은 안 나감 / 탭·필터·푸터 + 서울시청 기준 주변, 행 클릭 → `sel` + 상세 예상 요금 "1시간 5,160원"·"3시간 15,480원"·평소 혼잡도, '무료만' 칩 → `freeOnly=1`, 충전소 탭, 공항 탭 거리순·인천 터미널 묶음·"103% 사용 · 평소 이 시간 90%", **`03bc43f0` 3 — 오버레이 배열 같은 참조·로그인 사용자 저장 위치 대기(서울시청으로 한 번도 안 물음)·URL 좌표면 안 기다림**), [ParkingSection.test.tsx](../../apps/web/src/components/restaurant/detail/ParkingSection.test.tsx) 5(가는 법 섹션 → `/parking?ll=37.527,126.864&z=17&sel=seoul%3A1`, **좌표 없는 식당 — 리뷰 정보만·주변 조회 없음, 좌표도 리뷰도 없으면 섹션 없음**(`008e0081`), 홈 한 줄 → onOpen, **`enabled=false` 동안 조회 0**(`14f48e16`)), [ParkingFooter.test.tsx](../../apps/web/src/components/parking/ParkingFooter.test.tsx) 2(교통안전공단 수·출처 / 0 이면 칸 생략).
- 커밋 본문 검증(`2ff2c31`): typecheck 통과, 웹 145·utils 389·shared 81 전체 통과, friendly 1,508 통과(그때 meal-recognition FK·restaurant 격리 DB 준비 시간 초과 2파일 실패 — 주차와 무관, `5d7b686` 이 전역 `hookTimeout` 60초 + FK 수정으로 143파일·1,522 통과), Playwright 데스크톱/모바일 캡처 콘솔 오류 없음.

## Talks To [coverage: high — 22 sources]

- **[life-map](life-map.md)** — 가장 많이 빌린다: 전국 고정 원점 셀 격자(`LIFE_CELL_ORIGIN`·`lifeCellSizeDeg`·셀 버블 크기 버킷 `lifeCountBucket`·`formatLifeCount`), 지오코더 `geocodeLifeRows` + `LifeGeocodeCache`(서울 좌표 결측 주차장 + KOTSA 입구 좌표 결측·대표 좌표 행 — 두 원천의 결과가 저장소 압축본 [life-geocode-cache.json.gz](../../apps/friendly/src/modules/life-map/data/life-geocode-cache.json.gz) 에 들어가 배포 `life_map_data` 가 먼저 가져간다, `7ff7f1de`), 지역 이동 `LifeGoToBox`·최근 위치 스토어, "미적재 503 + 적재 명령 안내"·`replyUpstreamError` 규약. PLAN 결정 1번이 "일상지도 레이어가 아니라 별도 메뉴".
- **[housing](housing.md)** — 페이지 뼈대의 직계 원본(URL `?ll&z&sel`, 진입 중심 규칙, `useIsDesktopXl` + subBar + 시트 2장, prefs persist 스토어, 레이트리밋 240/분). 차이: 집값 스케줄러는 `onReady` 에서, 주차 폴러는 `onListen` 에서 시작. 집값·일상지도와 같은 `lib/map-cells`(셀 상한·점 모드 32타일·바이트 상한 셀 캐시)를 공유하되, 집값·일상지도의 `POINTS_DEMOTE_COUNT` 강등과 `INDEXED BY` 는 주차에 없다.
- **[map](map.md)** — `MapCanvas`(`poolKey 'parking'`, `overlayMarkers`, `flyTo/flyToZoomIn` 의 `bottomInset`, `fixedScale`, `eb24c6e5` 의 id 차분 갱신·공유 아이콘 사전 래스터화·풀 상한 3 — 셀 버블은 `perMarker`), 마커 프레임 [markerFrame.ts](../../packages/utils/src/markerFrame.ts)(비선택 26px 원 / 선택 32×48 핀 — 식당·버스와 같은 규격이라 라벨 offset·축소 스케일이 그대로 유효).
- **[transit](transit.md)** — 맛집 상세 '가는 법' 탭(`TransitTab`)의 세 번째 섹션(`008e0081` 부터 좌표 없는 식당도 안내 아래에 리뷰 주차 정보), 사이드바에서 '대중교통' 바로 다음(대중교통의 서브탭이 아니라 독립 메뉴).
- **[canonical](canonical.md)** — `resolveCanonicalMembersByPlaceId` 로 리뷰 집계 대상 출처 행을 푼다(공개 리뷰 융합과 같은 멤버 규칙).
- **[review-search](review-search.md)** / **[ai](ai.md)** — '주차' 관점 극성(`ReviewSummary.aspectsJson`, 리뷰 검색 enrich)과 팁(`tipsJson`, 리뷰 요약 LLM)을 읽기만 한다. 로컬 dev DB 에는 '주차' 관점 분석이 거의 없어 식당 평가는 팁만 보인다(운영엔 있음 — 작업 기록).
- **[bus](bus.md)** — `toServiceKeyPart`(data.go.kr Encoding 키 이중 인코딩 방지)를 재사용.
- **[air-quality](air-quality.md)** — 저장한 내 위치(`useAirLocation`)를 진입 중심으로 소비.
- **[config](config.md)** — 적재 스크립트의 VWorld 지오코더 키(설정>지도 DB 우선, env 폴백).
- **[friendly](friendly.md)** — autoload 라우트, `RATE.parkingRead`, env 두 cron, `onListen` 시작 폴러, vitest `hookTimeout` 60초(`5d7b686`), 격리 DB. 2026-10-05 성능 2차 몫: 공용 [map-cells.ts](../../apps/friendly/src/lib/map-cells.ts)(`5655abbc` — 셀 상한·점 모드 32타일·셀 캐시 바이트 상한, [amplification-caps](../concepts/amplification-caps.md)), [app.ts](../../apps/friendly/src/app.ts) 의 `TRUSTED_RESPONSE_ROUTES`(lots/ev points 200 은 운영에서 `JSON.stringify` — X-6), [plugins/prisma.ts](../../apps/friendly/src/plugins/prisma.ts) 의 모든 연결 busy_timeout 30초(적재 트랜잭션 동안 폴러 쓰기가 기다리는 한도 — [sqlite-write-lock-budget](../concepts/sqlite-write-lock-budget.md)), 배포 `analyze_db`(케이스 9 끝에도). 실시간 외부 API 가드(`lib/upstream-guard`, `fd957320`)는 주차에 걸리지 않는다 — 요청 경로 업스트림이 0이고 폴러가 고정 예산이라서다.
- **[api-contract](api-contract.md)** · **[shared](shared.md)** · **[utils](utils.md)** · **[web](web.md)** — 계약 `schemas/parking.ts`·`Routes.Parking`(`e5a45348` 부터 enum 6종 ↔ utils 동일성 테스트), `parkingApi`·`useParking*`(`086e4510` 의 `signal`·`gcTime`), `parking.ts`·`parkingMarker.ts`, `/parking` 페이지·NAV, 맛집 상세 홈 탭 '영업 정보' 의 `useInViewOnce`(`14f48e16` — 주차 한 줄 조회 시점).
- **[api-docs](api-docs.md)** — 라우트 `summary`/`description` 이 [endpoints.md](../../docs/api/endpoints.md) `## parking` 과 [openapi.json](../../docs/api/openapi.json) 에 실린다(9개 전부 `x-auth: public`, 8개 `x-rate-limit` 240/분). 수기 [README.md](../../docs/api/README.md) §6 에 `007ac899` 가 '주차' 절을 넣었다(§5 한도 표·§7 출처 목록엔 아직 없음).
- **[sea](sea.md)** — 같은 라운드의 형제 지도 페이지. 바다는 적재 없이 요청 시 프록시 + 메모리 캐시, 주차는 로컬 적재 + 서버 폴러로 갈렸다.
- **[project-overview](project-overview.md)** · **[mobile](mobile.md)** — 사이드바 14메뉴 중 하나, 앱은 미구현.
- 외부: data.go.kr(표준데이터 엔드포인트는 평문 `http://api.data.go.kr`, KOTSA `B553881/Parking_v1` 은 초당 한도가 낮아 순차), 서울 열린데이터 `http://openapi.seoul.go.kr:8088`(평문, 키가 경로에), VWorld 지오코더(적재 시만), 네이버 지도 길찾기 링크(웹 → 외부 이동뿐).

## API Surface [coverage: high — 21 sources]

### HTTP — 전부 공개 GET, `tags: ['parking']` ([parking.route.ts](../../apps/friendly/src/modules/parking/parking.route.ts), 계약 [schemas/parking.ts](../../packages/api-contract/src/schemas/parking.ts), 경로 [routes.ts](../../packages/api-contract/src/routes.ts) `Routes.Parking`)

| 경로(`/api/v1` 뒤) | 입력 | 응답 핵심 | 데이터 출처 | 한도 |
|---|---|---|---|---|
| `parking/status` | — | `lots{loaded,count,bySource{std,seoul,kotsa},geocoded,baseDate,loadedAt}`(`kotsa` = KOTSA 로 새로 더한 곳, `007ac899` 부터 채워짐) · `ev{loaded,stations,chargers,loadedAt,statusAt}` · `live{lotCount,lotAt,airportLotCount,airportAt}` · `fetchedAt` | `ParkingSync` + `EvService` statusAt 메모 + 폴러 메모리 | 전역 백스톱(1000/분) · `Cache-Control: public, max-age=60` |
| `parking/lots/points` | `bbox`*(`minLng,minLat,maxLng,maxLat`) · `zoom`*(0~22, 소수 허용·서버 내림) · `publicOnly`·`freeOnly`·`liveOnly`(`1`/`0`/`true`/`false`) | `mode:'points'\|'cells'` · `items[ParkingLotPoint]` · `cells[{lat,lng,count}]` · `total` · `truncated` · `minPointZoom` · `fetchedAt`(=적재 시각) | 로컬 DB + 실시간 단계(메모리), 셀 LRU 10분(바이트 상한). 점 = 줌 13↑ + 32타일 이하, 셀은 6,000개 넘으면 줌을 낮춰 접음 | 240/분 · 미적재 503 |
| `parking/lots/nearby` | `lat`*(33~39) · `lng`*(124~132) · `radius`(100~3000, 기본 1000) · `limit`(1~30, 기본 15) · 필터 3 | `center` · `items[ParkingLotItem + dist]` · `total` · `fetchedAt` | 로컬 DB + 실시간 | 240/분 · 미적재 503 |
| `parking/lots/:id` | `id`(≤80, `std:…`/`seoul:…`/`kotsa:…` — 콜론은 인코딩) | `ParkingLotItem` + `pattern{dow, hours[24]{hour,occ,fullRatio,samples}, minSamples}`\|null | 로컬 DB + 실시간 + 이력 | 240/분 · 없으면 404 |
| `parking/ev/points` | `bbox`* · `zoom`* · `fastOnly`·`freeParkingOnly`·`availableOnly`·`openOnly` | 주차장 points 와 같은 모양(`items[{id,lat,lng,name,level,fast}]`) + `statusAt` | 로컬 DB(상태는 10분 폴러가 갱신), 커버링 인덱스, 셀 LRU(availableOnly 는 `statusAt` 키) | 240/분 · 미적재 503 |
| `parking/ev/nearby` | `lat`* · `lng`* · `radius` · `limit` · 필터 4 | `items[EvStationItem + dist]` · `total` · `fetchedAt` · `statusAt` | 로컬 DB(2단계 조회) | 240/분 · 미적재 503 |
| `parking/ev/:id` | `id`(≤40, statId) | `EvStationItem` + `chargers[{id,type,outputKw,method,fast,stat,statUpdatedAt,lastChargeEndAt,chargingSince}]` + `statusAt` | 로컬 DB | 240/분 · 없으면 404 |
| `parking/airports` | — | `airports[14]{code,name,lat,lng,total,occupied,level,lots[{name,total,occupied,rate,level,updatedAt,usualOcc}]}` · `fetchedAt`(null=아직 못 받음) · `stale` | 폴러 메모리 + 이력(평소 점유율) | 240/분 · `Cache-Control: public, max-age=60` |
| `restaurants/public/:placeId/parking-reviews` | `placeId`(≤64) | `analyzed` · `aspect{pos,neg,neu}` · `tips[{term,count}]`(최대 5) | 리뷰 분석(`ReviewSummary`) | 240/분 · 식당 없으면 404 |

- 요청 경로의 **업스트림 호출은 0** — 그래서 `RATE.parkingRead` 는 대중교통 실시간(60/분)이 아니라 일상지도·집값과 같은 **240/분**(주석 "지도 이동마다 탭당 1콜", [rate-limit.ts](../../apps/friendly/src/plugins/rate-limit.ts)). `status` 라우트만 route 프리셋이 없어 전역 백스톱(IP당 분당 1000)이다([endpoints.md](../../docs/api/endpoints.md) 한도 칸 빈칸). 같은 이유로 실시간 외부 API 가드(`upstream-guard` — 서비스별 쿼터·실패 쿨다운, `fd957320`)도 주차엔 없다.
- `status`·`airports` 는 `5655abbc`(D-10)부터 `Cache-Control: public, max-age=60`(`POLLED_CACHE_CONTROL` — 사용자 무관이고 폴러 주기 5·10분보다 짧아 엣지·브라우저가 흡수해도 된다). 점·주변·상세엔 붙지 않는다(테스트가 `lots/points` 헤더 없음을 고정).
- 쿼리 불리언은 `z.coerce.boolean` 을 쓰지 않는다('0'/'false' 도 true 가 되므로) — `FlagParam = enum['1','0','true','false'].optional()` → 미지정 false. 다른 값은 400.
- 파라미터 라우트는 `decodeURIComponent(Routes.Parking.lotDetail(':id'))` 로 등록(`:id` 가 `%3Aid` 로 인코딩되지 않게 — [tour](tour.md) 와 같은 규약). 클라이언트는 `Routes.Parking.lotDetail('seoul:171721')` → `/parking/lots/seoul%3A171721`.
- 계약은 `@repo/utils` 를 import 하지 않고 enum 을 리터럴로 다시 적는다(`ParkingOwnership`·`ParkingLotType`·`ParkingFeeType`·`ParkingSource`·`ParkingLevel`·`EvLevel`) — 순환 금지 규약.
- 외부 문서: `2ff2c31` 의 `export:openapi` 재생성으로 [endpoints.md](../../docs/api/endpoints.md) 가 183개(공개 74) → **192개(공개 83)**, [openapi.json](../../docs/api/openapi.json) +2,320줄. `parking-reviews` 도 `tags:['parking']` 라 맛집 절이 아니라 `## parking` 절에 있다.

### 스크립트 ([package.json](../../apps/friendly/package.json), 모두 `tsx --env-file=.env`)

| 명령 | 하는 일 | 옵션 |
|---|---|---|
| `load:parking-lots` | 서울(`GetParkInfo` 전량 + `GetParkingInfo` 보충) + 표준데이터(오픈API ~19콜) + KOTSA(시군구 251곳 ≈470콜, 순차 350ms — 4분 20초) → 지오코딩 → 겹침 접기 → `ParkingLot` 전량 교체 + `ParkingSync(lots)` | `--sources=std,seoul,kotsa`(기본 셋 다 — 일부만 주면 나머지 원천 행은 이번 교체에서 빠진다) · `--std-json=<파일\|폴더>`(표준데이터를 포털 JSON 덤프에서 — 배열·`{data\|records\|items\|list:[…]}`·행 객체 모음, 폴더면 `*.json` 전부) · `--kotsa-dump=<폴더>`(KOTSA 공영 시설 + 운영정보를 시군구별 `<코드>.json` 으로 저장) · `--kotsa-json=<폴더>`(KOTSA 를 API 대신 저장본에서 — 규칙만 바꿔 재적재·검증) · `--kotsa-codes=11110,41360`(일부 시군구만 — 점검용, 전량 교체라 `--dry-run` 과) · `--dry-run`(수집 + 정규화 리포트 + KOTSA 겹침 미리보기만) · `--offline`(지오코더 호출 없이 캐시만 — 못 찾은 KOTSA 행은 빠진다) · `--max-calls=N` |
| `load:ev-chargers` | 환경공단 충전기 정보 전량(~53콜) → 충전소 단위 접기 → `EvStation`·`EvCharger` 전량 교체 + `ParkingSync(ev)` | `--dry-run`(DB 쓰기 없음 — 업스트림 ~53콜은 나감) · `--zcode=11`(한 시도만 — 전량 교체라 다른 시도가 빠짐) · `--max-pages=N` |
| `status:parking` | 한 줄 `ok lots=N std=S seoul=U kotsa=K geocoded=G ev=E chargers=C`(K = KOTSA 로 새로 더한 곳, `007ac899`; 예외면 `missing`) — deploy.sh 가 `stat_val` 로 키 단위 파싱 | — |

- 실패 안내: 게이트웨이 코드 30 이면 "활용신청이 안 됐거나 승인 직후 반영 대기(수십 분). 원천 하나만 문제면 `--sources` 로 나머지만 먼저(예: `--sources=std,seoul`)", 코드 22 는 메시지에 '초당' 이 있으면 "같은 키로 동시에 부르는 프로세스가 없는지 확인", 아니면 "일일 호출 한도 초과 — KOTSA 개발계정 일 1만 건" 을 찍는다([load-parking-lots.ts](../../apps/friendly/scripts/load-parking-lots.ts)). 키가 없으면 `SEOUL_OPEN_API_KEY`(→ `--sources=std`) / `DATA_GO_KR_API_KEY`(표준 → `--sources=seoul`·`--std-json`, KOTSA → `--sources=std,seoul`·`--kotsa-json`) / vworld 키(→ `--offline`) 를 각각 안내하고 멈춘다.
- 로그: 서울 "안내 N행 → 주차장 M곳(구획 행 접힘 · 버스전용 제외 · 거주자 전용 제외 · 실시간 목록 보충) · 좌표 결측 · 요금 규칙 비정상", 표준 "N곳(관리번호 중복 접힘 · 식별자 없음 · 등록 차량 전용) · 좌표 결측 · 요금 규칙 비정상", KOTSA "시설 N행 중 공영 P → M곳(운영정보 O) · 좌표 없어 주소로 찾을 곳 · 뺀 것: 요금 구분 없음 · 거주자 구획(월정액만) · 좌표·주소 없음 · 이름 없음 · 중복 ID · 쓰레기 ID · 요금 규칙 비정상" + "원천 결함 — 건수만 오고 목록이 빈 시군구 N곳: …" + 대표 좌표·미해결·재군집 제외 수, 지오코딩 "대상 → 좌표(seoul a/b · kotsa c/d | 캐시 · 호출) · 미해결 · 미시도 · 중단", 겹침 "표준데이터 서울 행 중 서울 원천과 같은 곳 N곳 제외" + "KOTSA N곳 중 서울·표준데이터와 같은 곳 M곳 제외 · 새로 더함 K", 충전소 "급속 보유 · 주차료 무료 · 지금 사용 가능".

### 환경 변수 ([env.ts](../../apps/friendly/src/config/env.ts), [.env.example](../../apps/friendly/.env.example))

| 키 | 기본 | 쓰임 |
|---|---|---|
| `PARKING_LIVE_CRON` | `"*/5 * * * *"` | 서울 시영 실시간·공항 폴러(Asia/Seoul). 빈 값이면 끔. 서버가 listen 할 때만, 테스트(`isTest`)에선 강제로 빈 값 |
| `EV_STATUS_CRON` | `"*/10 * * * *"` | 충전기 상태 폴러. 빈 값이면 끔(개발계정 일 1,000건 → 10분 간격 하루 ~290콜이 기본) |
| `DATA_GO_KR_API_KEY` | `''` | 표준데이터(적재)·KOTSA 15099883(적재만 — 심의승인, 개발 1만/일, `007ac899` 가 env·`.env.example` 주석에 추가)·공항 2종(폴러)·충전소(적재 + 폴러) — 계정 공용 키 |
| `SEOUL_OPEN_API_KEY` | `''` | 서울 공영주차장 안내(적재)·시영 실시간(폴러) — 지하철 역사마스터와 같은 "일반 인증키". 비면 서울 원천·실시간 여석이 빠진다(적재는 `--sources=std` 필요) |
| `VWORLD_API_KEY` | `''` | 적재 스크립트의 지오코더 폴백(어드민 설정>지도 값이 우선) |

### FE 공통 export ([parking.api.ts](../../packages/shared/src/api/parking.api.ts), [useParking.ts](../../packages/shared/src/hooks/useParking.ts))

| 훅 | queryKey | staleTime · refetch | enabled |
|---|---|---|---|
| `useParkingStatus()` | `['parking','status']` | 5분 · 없음 | 늘 |
| `useParkingLotPoints(params\|null)` | `['parking','lots','points', bbox, floor(zoom), 필터 비트]` | 2분 · 5분마다 · 이전 결과 placeholder · **`gcTime` 60초**(`VIEWPORT_GC_MS`) · `signal` 전달 | `params !== null` |
| `useParkingLotNearby(lat, lng, {radius, limit, filters, enabled})` | `['parking','lots','nearby', lat 4자리, lng 4자리, radius, limit, 필터 비트]` | 2분 · 5분 · placeholder · `signal` 전달 | 좌표 있음 && `enabled !== false` |
| `useParkingLotDetail(id\|null)` | `['parking','lots','detail', id]` | 2분 · 5분 | `id !== null` |
| `useEvPoints` / `useEvNearby` / `useEvDetail` | `['parking','ev', …]` 같은 모양 | 2분 · 5분(points 는 `gcTime` 60초, points·nearby 는 `signal`) | 같은 규칙 |
| `useParkingAirports(enabled=true)` | `['parking','airports']` | 2분 · 5분 | 인자 |
| `useRestaurantParkingReviews(placeId\|null)` | `['parking','restaurant-reviews', placeId]` | 30분 · 없음 · `retry: false` | `placeId !== null` |

- `parkingApi` 9함수(`status`·`lotPoints`·`lotNearby`·`lotDetail`·`evPoints`·`evNearby`·`evDetail`·`airports`·`restaurantReviews`) — 필터는 참인 키만 `=1` 로 싣고(`PARKING_LOT_FILTER_KEYS`·`EV_FILTER_KEYS` 도 export), `zoom` 은 정수로 내림. 토큰 불필요. `086e4510` 부터 points·nearby 4함수는 마지막 인자 `init?: Pick<RequestInit,'signal'>` 를 `apiFetch` 에 넘긴다.
- 점·주변을 5분마다 다시 받는 이유: 마스터는 재적재 때만 바뀌지만 점에 실린 실시간 단계(주차장 5분·충전기 10분 폴링)가 바뀐다(훅 주석). 뷰포트가 바뀌는 동안 이전 결과를 placeholder 로 유지해 마커가 깜빡이지 않게(일상지도와 같은 규율). points 결과는 bbox 가 키에 그대로 들어가 팬마다 새 쿼리가 생기고 같은 뷰포트로 정확히 돌아오는 일이 드물어 `gcTime` 을 기본 5분 → 60초로(지나간 뷰포트의 최대 3,000점씩을 쌓아 두지 않게 — 일상지도·집값과 같은 값).

### 배포 ([deploy.sh](../../deploy.sh))

- `parking_status()` = `status:parking` 한 줄. `parking_data [force]` — 상태가 `ok` 가 아니면 "(주차 테이블 없음 — 마이그레이션(케이스 2/4) 뒤에 적재됩니다)" 로 건너뛰고, `lots=0` **또는 `kotsa=0`**(`007ac899` — 원천 추가 뒤 첫 배포에서 한 번 다시) 이거나 force 면 `load:parking-lots`, `ev=0` 이거나 force 면 `load:ev-chargers`(각각 실패해도 안내만 찍고 계속 — 주차장 실패 안내는 "표준데이터·한국교통안전공단 활용신청·`SEOUL_OPEN_API_KEY` 확인. 원천 하나만 문제면 `--sources=std,seoul`"). "주차 현재" 줄에 `교통안전공단 K` 가 붙었다. 주석의 비용: 표준데이터 ~19콜 + 서울 2콜 + 서울 구영 주소 지오코딩 ~700콜 + KOTSA 시군구 251곳 ≈470콜(순차라 5분 남짓), 충전소 ~53콜(1분 남짓). **실시간·충전기 상태는 서버 폴러가 돌리므로 여기선 적재만.**
- 케이스 1·2·4 체인에 `housing_data` 뒤 `parking_data` 가 붙었다(비어 있을 때만 첫 적재). 체인에서 `life_map_data`(지오코딩 캐시 압축본이 바뀌면 `import:life-geocode`)가 `parking_data` 보다 먼저라 KOTSA·서울 구영 주소는 캐시로 풀린다. 메뉴 **9) 주차 데이터 적재/갱신** = `pull; gen; parking_data 1; analyze_db`(`analyze_db` 는 `2b072b53` 이 붙임 — 코드 배포·재기동 없음, 원천 반기·수시 갱신용, 메뉴 문구에 교통안전공단). 메뉴 범위 안내도 `[1-9]` 로.

## Data [coverage: high — 17 sources]

### Prisma 모델 5개 — 마이그레이션 `20260925071552_add_parking` + `20261005030000_ev_station_covering_index` ([schema.prisma](../../apps/friendly/prisma/schema.prisma), [migration.sql](../../apps/friendly/prisma/migrations/20260925071552_add_parking/migration.sql), [커버링 인덱스 migration.sql](../../apps/friendly/prisma/migrations/20261005030000_ev_station_covering_index/migration.sql))

FK 는 하나도 없다(재적재 내성 — 충전기도 충전소를 relation 으로 걸지 않는다).

**`ParkingLot` → `parking_lots`** (PK `id`, 인덱스 `(lat,lng)` · `(liveKey)`)

| 열 | 형 | 뜻 |
|---|---|---|
| `id` | String PK | 원천 접두 id — `std:<관리번호>` / `seoul:<주차장코드>` / `kotsa:<주차장 관리 ID>`(2026-10-05~) |
| `source` | String | `'std' \| 'seoul' \| 'kotsa'` |
| `name` | String | 주차장명 |
| `ownership` · `lotType` · `feeType` | String? | `public\|private` · `street\|offstreet\|attached`(노상·노외·부설) · `free\|paid\|mixed` — 모르면 null |
| `roadAddr` · `lotAddr` | String? | 도로명 · 지번(서울은 지번만, '서울특별시' 접두 보충) |
| `phone` · `orgName` | String? | 전화 · 관리기관(표준데이터) |
| `totalSpaces` | Int? | 면수(양수만, 서울 노상은 구획 행 수) |
| `wdOpen`·`wdClose`·`satOpen`·`satClose`·`holOpen`·`holClose` | String? | 'HH:MM'(24:00 허용) — 평일·토요일·공휴일 |
| `operDays` | String? | 운영요일 원문(표준데이터 '평일+토요일+공휴일') |
| `baseMin`·`baseFee`·`addMin`·`addFee` | Int? | 기본 시간(분)·요금(원), 추가 단위 시간·요금 — null = 정보 없음(원천이 0 으로 준 추가 요금과, `sanitizeParkingFeeRule` 이 비정상으로 본 시간 요금도 null — [unknown-vs-zero](../concepts/unknown-vs-zero.md)) |
| `dayMaxFee` · `dayPassFee` · `monthlyFee` | Int? | 일 최대(서울) · 1일권(표준) · 월 정기권 |
| `satFree` · `holFree` | Boolean? | 서울만 — 토요일·공휴일 무료 |
| `payMethods` · `note` | String? | 결제 방법(표준) · 특기사항(표준) / 운영 구분명(서울) / 생성 참고 문구(KOTSA — "평일 요일마다 운영시간이 다름"·"기본 회차 N분 무료") |
| `disabledZone` | Boolean? | 장애인전용주차구역(표준, 빈값 null) |
| `liveKey` | String? | 실시간 폴러 메모리 키 `seoul:<코드>`(서울 행만) |
| `lat` · `lng` · `geoSource` | Float? · String? | 좌표와 출처 `source\|road\|parcel`, null = 지도 미표시 |
| `baseDate` | String? | 데이터 기준일 'YYYY-MM-DD'(서울·KOTSA 는 적재일) |

**`ParkingOccupancyStat` → `parking_occupancy_stats`** (PK `(key, dow, hour)`) — 행 수 상한 = 키 수 × 168(7일 × 24시)이라 커지지 않는다.

| 열 | 형 | 뜻 |
|---|---|---|
| `key` | String | `seoul:<코드>` \| `airport:<IATA>:<주차장명>` |
| `dow` · `hour` | Int | KST 요일(0=일) · 시(0~23) |
| `samples` | Int | 누적 표본 수(5분 폴링 × 칸당 4분 가드) |
| `occSum` | Float | 점유율 합(표본마다 0~1.5 로 자름) — 평균 = `occSum/samples` |
| `fullCount` | Int | 점유율 97% 이상 표본 수 — 만차 비율 = `fullCount/samples` |
| `updatedAt` | DateTime `@updatedAt` | 4분 가드 기준 — 원시 SQL 이 epoch ms 정수로 쓴다 |

**`ParkingSync` → `parking_syncs`** (PK 자동 증가 `id`, 인덱스 `(kind, loadedAt)`) — `kind 'lots'|'ev'`, `count`(주차장 수 / 충전소 수), `geocoded`(좌표 확보 수, lots 만), `detail`(JSON — lots `{std, seoul, kotsa, droppedDup, kotsaDup, kotsaSelfDup}`(`kotsa*` 는 2026-10-05~) / ev `{chargers, deleted, busOnly, badCoord}`), `baseDate`, `loadedAt`. 조회 게이트(미적재 503)·셀 캐시 키(`syncId`)·상태 API·`status:parking` 이 모두 이 표의 최신 행을 본다.

**`EvStation` → `ev_stations`** (PK `id` = 환경공단 `statId`, 인덱스 `(lat, lng, availableCount, hasFast, parkingFree, limited)` — 2026-10-05 `(lat,lng)` 를 이 커버링 인덱스로 교체, E-5)

| 열 | 형 | 뜻 |
|---|---|---|
| `name` · `addr` · `addrDetail` · `location` | String / String? | 충전소명 · 주소 · 상세주소 · 위치 설명 |
| `lat` · `lng` | Float(필수) | 좌표 — 없거나 한국 밖이면 적재에서 제외 |
| `useTime` | String? | 이용 시간 원문('24시간 이용가능') |
| `busiId` · `operator` · `operatorCall` | String? | 운영기관 코드 · 이름(`busiNm`→`bnm`) · 전화 |
| `parkingFree` | Boolean? | 주차료 무료(Y) / 유료(N) / 모름 |
| `limited` · `limitDetail` | Boolean? · String? | 이용자 제한(Y) · 사유('거주자외 출입제한') |
| `note` | String? | 안내 |
| `kind` · `kindDetail` | String? | 충전소 구분 A0~J0 · 상세 A001~J007(B001 공영주차장 …) |
| `floorType` · `floorNum` | String? | 지상 F / 지하 B · 층 |
| `zcode` | String? | 시도 코드 |
| `chargerCount` · `fastCount` · `hasFast` | Int · Int · Boolean | 기수 · 급속 기수 · 급속 보유 |
| `availableCount` · `chargingCount` | Int | 사용 가능(stat 2) · 충전 중(stat 3) — 상태 폴러가 갱신 |
| `statusAt` | DateTime? | 마지막 상태 반영 시각(적재 시각 → 폴러, epoch ms) |

**`EvCharger` → `ev_chargers`** (PK `(statId, chgerId)` — 충전소별 조회는 PK 앞부분이 받친다): `type`(01~11 타입 코드) · `outputKw`(양수만) · `method`('단독' 등) · `fast` · `stat`(0~9) · `statUpdDt`·`lastTedt`·`nowTsdt`(원천 'yyyyMMddHHmmss' KST 문자열 그대로 — 응답 때 ISO 변환).

### 원천 필드 → 열 매핑 ([parking-master.service.ts](../../apps/friendly/src/modules/parking/parking-master.service.ts), [ev-master.service.ts](../../apps/friendly/src/modules/parking/ev-master.service.ts), [parking-live.service.ts](../../apps/friendly/src/modules/parking/parking-live.service.ts))

**주차장** — 표준데이터는 `canonKeys` 뒤의 소문자 키(API `prkplceNo`·덤프 `PRKPLCE_NO` 둘 다 `prkplceno`), `A→B` 는 A 가 없으면 B. KOTSA(`007ac899`)는 시설(`PrkSttusInfo`) 행 + 같은 관리 ID 의 운영정보(`PrkOprInfo`, 표에서 `opr.`) 행을 합치고, 요금은 유료일 때만·둘 다 양수일 때만 채운다([kotsa-master.service.ts](../../apps/friendly/src/modules/parking/kotsa-master.service.ts)).

| `ParkingLot` 열 | 표준데이터 15012896 | 서울 `GetParkInfo` → `GetParkingInfo` | KOTSA 15099883 |
|---|---|---|---|
| `id` | `std:` + `prkplceno` | `seoul:` + `PKLT_CD` | `kotsa:` + `prk_center_id` |
| `name` | `prkplcenm` | `PKLT_NM` | `prk_plce_nm` |
| `ownership` | `prkplcese`(공영/민영 파싱) | `'public'` 고정 | `'public'` 고정(`prk_manage_agent` = `1` 인 행만) |
| `lotType` | `prkplcetype` | `PKLT_KND_NM` → `PRK_TYPE_NM` | 이름에서 `parseParkingLotType` |
| `feeType` | `parkingchrgeinfo` | `CHGD_FREE_NM` → `PAY_YN_NM`('유료'/'무료') | `parkng_chrge_se` → `prk_chrge_se`(가이드 이름) — `1` 무료 · `2` 유료, 그 밖은 행 제외 |
| `roadAddr` / `lotAddr` | `rdnmadr` / `lnmadr` | null / '서울특별시 ' + `ADDR` | `prk_plce_adres` 한 칸 — '…로·…길 + 번호' 꼴이면 도로명, 아니면 지번 |
| `phone` / `orgName` | `phonenumber` / `institutionnm` → `insttnm` | `TELNO` / null | null / null |
| `totalSpaces` | `prkcmprt` | `TPKCT`(노상은 구획 행 수) | `prk_cmprt_co` |
| `wdOpen` / `wdClose` | `weekdayoperopenhhmm` / `weekdayopercolsehhmm`(원천 오타) → `weekdayoperclosehhmm` | `WD_OPER_BGNG_TM` / `WD_OPER_END_TM` | `opr.Monday.opertn_start_time` / `…end_time`(HHMMSS, 화~금이 다르면 참고 문구) |
| `satOpen` / `satClose` | `satoperoperopenhhmm`(원천 오타) → `satoperopenhhmm` / `satoperclosehhmm` | `WE_OPER_BGNG_TM` / `WE_OPER_END_TM` | `opr.Saturday.…` |
| `holOpen` / `holClose` | `holidayoperopenhhmm` / `holidaycloseopenhhmm`(원천 오타) → `holidayoperclosehhmm` | `LHLDY_BGNG` → `LHLDY_OPER_BGNG_TM` / `LHLDY` → `LHLDY_OPER_END_TM` | `opr.Sunday.…`(비면 `opr.Holiday.…`) |
| `operDays` | `operday` | null | null |
| `baseMin` / `baseFee` | `basictime` / `basiccharge` | `PRK_HM` → `BSC_PRK_HR` / `PRK_CRG` → `BSC_PRK_CRG` | `opr.basic_info.parking_chrge_bs_time` / `…bs_chrge` |
| `addMin` / `addFee` | `addunittime` / `addunitcharge` | `ADD_UNIT_TM_MNT` → `ADD_PRK_HR` / `ADD_CRG` → `ADD_PRK_CRG` | `…adit_unit_time` / `…adit_unit_chrge`(0원 → null) |
| `dayMaxFee` | null | `DLY_MAX_CRG` → `DAY_MAX_CRG`(0 → null) | null |
| `dayPassFee` | `daycmmtkt` | null | `opr.fxamt_info.parking_chrge_one_day_chrge` |
| `monthlyFee` | `monthcmmtkt` | `MNTL_CMUT_CRG` → `PRD_AMT` | `opr.fxamt_info.parking_chrge_mon_unit_chrge` |
| `satFree` / `holFree` | null | `SAT_CHGD_FREE_NM` / `LHLDY_NM` → `LHLDY_CHGD_FREE_SE_NAME` | null |
| `payMethods` / `note` | `metpay` / `spcmnt` | null / `OPER_SE_NM`(운영 구분 — 제외 규칙도 이 값) | null / 참고 문구 생성(`opertn_bs_free_time` → "기본 회차 N분 무료") |
| `disabledZone` | `pwdbsppkzoneyn`(Y/N) | null | null |
| `liveKey` | null | `seoul:` + `PKLT_CD` | null(실시간 안 씀) |
| `lat` / `lng` | `latitude` / `longitude` | `LAT` / `LOT`(구획 평균, 0 → null → 지번 지오코딩) | `prk_plce_entrc_la` / `prk_plce_entrc_lo`(입구 좌표 — 없거나 대표 좌표면 주소 지오코딩, 못 찾으면 행 제외) |
| `baseDate` | `referencedate` | 적재일 | 적재일 |

**실시간**(`ParkingLiveValue` — 면수·현재 대수·원천 갱신 시각만 읽는다)

| 원천 | 식별 → 키 | 면수 | 현재 대수 | 갱신 시각 | 거르기 |
|---|---|---|---|---|---|
| 서울 `GetParkingInfo` | `PKLT_CD` → `seoul:<코드>` | `TPKCT` | `NOW_PRK_VHCL_CNT` | `NOW_PRK_VHCL_UPDT_TM` | `PRK_STTS_YN` 1·2 만, `OPER_SE_NM` 버스·거주자 전용 제외, 2시간 넘은 값 제외 |
| 한국공항공사 15158689 | `airportKor` → IATA + `parkingAirportCodeName` → `airport:<IATA>:<이름>` | `parkingTotalSpace`(0 → null) | `parkingOccupiedSpace` | `sysGetdate` + `sysGettime` | 상수에 없는 공항 제외 |
| 인천공항 15095047 | `floor` → `airport:ICN:<구역>` | `parkingarea` | `parking` | `datetm` | 구역명 없으면 제외 |

**충전소·충전기**(환경공단 `getChargerInfo` — 문자열 `'null'` 도 null 로 본다)

| 열 | 원천 필드 |
|---|---|
| `EvStation.id` / `name` | `statId` / `statNm` |
| `addr` · `addrDetail` · `location` · `useTime` · `note` | 같은 이름 |
| `lat` / `lng` | `lat` / `lng`(충전소를 처음 만난 행 기준, 한국 밖이면 제외) |
| `busiId` / `operator` / `operatorCall` | `busiId` / `busiNm` → `bnm` / `busiCall` |
| `parkingFree` / `limited` / `limitDetail` | `parkingFree`(Y/N) / `limitYn`(Y/N) / `limitDetail` |
| `kind` · `kindDetail` · `floorType` · `floorNum` · `zcode` | 같은 이름 |
| `EvCharger.chgerId` / `type` / `outputKw` / `method` | `chgerId` / `chgerType` / `output`(양수만) / `method` |
| `stat` · `statUpdDt` · `lastTedt` · `nowTsdt` | 같은 이름(`stat` 없으면 9) — 상태 폴러(`getChargerStatus`)도 `statId`·`chgerId` 와 이 네 필드만 읽는다 |
| (제외) | `delYn=Y`, `chgerType='11'` |

### 코드표·계산 — [parking.ts](../../packages/utils/src/parking.ts) (서버·웹 공용)

| 상수·함수 | 값 |
|---|---|
| `PARKING_TABS` / `PARKING_TAB_LABEL` | `lot`·`ev`·`airport` / 주차장·충전소·공항 |
| `PARKING_OWNERSHIPS` · `PARKING_LOT_TYPES` · `PARKING_FEE_TYPES` · `PARKING_SOURCES` (+ `_LABEL`) | 공영·민영 / 노상·노외·부설 / 무료·유료·일부 유료 / 전국주차장정보표준데이터·서울시 공영주차장 안내·한국교통안전공단 주차정보 |
| `parseParkingOwnership/LotType/FeeType` | 원문 포함 검사(공백 제거), 모르면 null. 요금은 '혼합' 또는 '유료'+'무' → `mixed` |
| `normalizeParkingHhmm` | 'HHMM'·'HH:MM'·'H:MM' → 'HH:MM', 24:00 허용, 24:01 이상·깨진 값 null |
| `parkingHoursKind` / `formatParkingHours` | 00:00~00:00 = `unknown`('정보 없음' — 원천이 빈 값을 0 으로), 00:00~24:00·23:59 = `allday`('24시간'), 그 밖 `range` |
| `parkingDayKindKst` | KST 요일 → `wd`/`sat`/`hol`(**일요일만 공휴일** — 공휴일 판정 안 함) |
| `parkingKstSlot` | KST `{dow, hour}` — 이력 칸 키 |
| `isParkingOpenAt` | 지금 운영 중(자정 넘는 운영 05:00~01:00 처리, 23:59 는 24:00 으로), 정보 없으면 null |
| `estimateParkingFee(rule, 분)` | 무료 0 · 기본 요금/시간 없으면 null · 기본 시간 안 = 기본 요금 · 넘으면 추가 단위 **올림** · 추가 단위가 없으면 기본 단위 반복(서울 5분 430원 → 1시간 5,160원) · **일 최대와 1일권(24시간 이하) 중 싼 쪽으로 자름** |
| `formatParkingFeeRule` | "기본 30분 1,000원 · 추가 10분 500원" / "무료" / "요금 정보 없음" |
| `PARKING_FEE_ESTIMATE_MINUTES` | `[60, 120, 180]` |
| `parkingLevelOf(면수, 현재)` | 점유율 < 0.7 `free`(여유) · < 0.9 `normal`(보통) · < 0.97 `busy`(혼잡) · 이상 `full`(만차 — 초과 주차 포함), 면수 모르면 null |
| `PARKING_LEVEL_COLOR` · `PARKING_NO_LIVE_COLOR` | `#16a34a`·`#ca8a04`·`#ea580c`·`#dc2626` · 실시간 없음 `#2563eb`(주차 표지 파랑) |
| `PARKING_FULL_RATIO` · `PARKING_PATTERN_MIN_SAMPLES` | 0.97 · 24 |
| `PARKING_POINT_MIN_ZOOM` · `EV_POINT_MIN_ZOOM` · `PARKING_POINTS_MAX` | 13(전국 ~2만 곳 — 서울 도심 z13 뷰포트(≈260km²)도 수백 점) · 15(코드 주석 "충전소 ~12만 곳 — 서울 구당 수천 기", 실적재 99,850곳) · 3,000 |
| `PARKING_NEARBY_RADIUS_M` · `PARKING_RESTAURANT_RADIUS_M` | 1,000 · 300 |
| `EV_CHARGER_TYPE_LABEL` · `EV_STAT_LABEL` | 아래 표(환경공단 가이드 v1.25 코드표) |
| `isEvChargerFast` | 용량(kW) 있으면 30 이상 = 급속, 없으면 타입 02·08 만 완속 |
| `EV_LEVELS` / `evStationLevel` / `EV_LEVEL_COLOR` | `available`(사용 가능 `#16a34a`) · `busy`(모두 충전 중 `#ea580c`) · `offline`(이용 불가·확인 필요 `#9ca3af`) |
| `EV_KIND_LABEL` · `EV_KIND_DETAIL_LABEL` | A0 공공시설 · B0 주차시설 · C0 휴게시설 · D0 관광시설 · E0 상업시설 · F0 차량정비시설 · G0 기타시설 · H0 공동주택시설 · I0 근린생활시설 · J0 교육문화시설 + 상세 56종(B001 공영주차장·C001 고속도로 휴게소·H001 아파트 …) |
| `PARKING_AIRPORTS`(14) | 아래 표 — **원천에 좌표가 없어** 활주로 기준점 근사 좌표를 상수로(전국 줌 마커용) |
| `normalizeParkingName` | '세종로 공영주차장(시)' ↔ '세종로공영주차장' 이 같은 키 — 괄호 보조어·'공영/민영 주차(장/타워/빌딩)'·기호·공백 제거 |

충전기 타입(`chgerType`, `EV_CHARGER_TYPE_LABEL` — 모르는 코드는 '기타'). 급속 판정은 타입이 아니라 용량 우선(`isEvChargerFast`):

| 타입 | 이름 | 비고 |
|---|---|---|
| 01 | DC차데모 | |
| 02 | AC완속 | 용량이 없으면 완속으로 봄 |
| 03 | DC차데모+AC3상 | |
| 04 | DC콤보 | |
| 05 | DC차데모+DC콤보 | |
| 06 | DC차데모+AC3상+DC콤보 | |
| 07 | AC3상 | |
| 08 | DC콤보(완속) | 용량이 없으면 완속으로 봄 |
| 09 | NACS | |
| 10 | DC콤보+NACS | |
| 11 | DC콤보2(버스전용) | **적재에서 제외** |

충전기 상태(`stat`, `EV_STAT_LABEL`) — 충전소 칸은 2·3 만 세고, 둘 다 0 이면 충전소 단계는 `offline`(이용 불가·확인 필요):

| 상태 | 이름 | 충전소 칸 |
|---|---|---|
| 0 | 알 수 없음 | — |
| 1 | 통신 이상 | — |
| 2 | 사용 가능 | `availableCount` |
| 3 | 충전 중 | `chargingCount` |
| 4 | 운영 중지 | — |
| 5 | 점검 중 | — |
| 6 | 예약 중 | — |
| 9 | 상태 미확인(적재 때 상태가 없으면 이 값) | — |

공항 상수(`PARKING_AIRPORTS` — `apiName` 은 한국공항공사 응답의 `airportKor` 값, 목록·공항 응답이 이 순서):

| 코드 | 이름 | 원천 | 위도 | 경도 |
|---|---|---|---|---|
| ICN | 인천국제공항 | `iiac`(인천공항 15095047, 19개 구역) | 37.4602 | 126.4407 |
| GMP | 김포국제공항 | `kac` | 37.5586 | 126.7903 |
| PUS | 김해국제공항 | `kac` | 35.1795 | 128.9381 |
| CJU | 제주국제공항 | `kac` | 33.5111 | 126.4930 |
| TAE | 대구국제공항 | `kac` | 35.8942 | 128.6589 |
| CJJ | 청주국제공항 | `kac` | 36.7166 | 127.4992 |
| KWJ | 광주공항 | `kac` | 35.1236 | 126.8086 |
| MWX | 무안국제공항 | `kac` | 34.9914 | 126.3828 |
| RSU | 여수공항 | `kac` | 34.8422 | 127.6161 |
| USN | 울산공항 | `kac` | 35.5933 | 129.3517 |
| KUV | 군산공항 | `kac` | 35.9039 | 126.6158 |
| WJU | 원주공항 | `kac` | 37.4381 | 127.9603 |
| HIN | 사천공항 | `kac` | 35.0886 | 128.0703 |
| YNY | 양양국제공항 | `kac` | 38.0614 | 128.6692 |

마커 SVG([parkingMarker.ts](../../packages/utils/src/parkingMarker.ts)): 주차장 'P'·충전소 번개·공항 비행기 아이콘을 `buildCircleMarkerSvg`(비선택)/`buildPinMarkerSvg`(선택) 프레임에. 채움색 = 주차장·공항은 실시간 단계(없으면 파랑), 충전소는 `EV_LEVEL_COLOR`. 셀 버블 `buildParkingCellMarkerDataUrl(kind, count)` = 지름 26/34/40/46(건수 버킷)·글자 10~13px, 채움 주차장 `#2563eb` / 충전소 `#0f766e`, 불투명도 0.85, 숫자는 SVG 안(저줌에선 MapCanvas 라벨이 꺼지므로).

### 규모 — 로컬 적재 실측(2026-09-25 → 10-05 → 10-10, 커밋 본문·PLAN·로컬 `parking_syncs`)

- **2026-10-10 현재(로컬 `parking_syncs` 최신 행, `36f07eb3` 재적재)**: 주차장 **20,261곳 = 서울 836 · 표준 17,357 · KOTSA 2,068**, 좌표 19,501, `droppedDup` 414(표준 ↔ 서울) · `kotsaDup` 6,591(KOTSA ↔ 기존) · `kotsaSelfDup` 1,312, `baseDate` 2026-10-01. 표준은 원천 갱신으로 행이 늘었고(17,332 → 17,357) 등록 차량 전용 27곳이 빠졌다. 요금 정리 표준 133 · KOTSA 89행, KOTSA 거주자 구획 90.
- **2026-10-05(`007ac899`)**: KOTSA 시설 1,767,934행 중 공영 13,645행 → 정규화 뒤 8,656곳(운영정보 13,074) 중 기존과 같은 곳 6,605 → **새로 2,051곳**(원천 좌표 1,597 · 주소로 찾음 454) → 전체 20,219곳(서울 836 · 표준 17,332 · KOTSA 2,051). 좌표 정리: 입구 좌표 결측 1,612행(≈16%) + 대표 좌표 행 → 1,882행 중 1,721 찾음(91%, VWorld 첫 실행 약 1,700콜 — 이후 캐시), 다시 한 점에 모인 241행·끝내 못 찾은 161행 제외, 남은 같은 좌표 쌍 36(둘씩 붙은 구획)·3곳 이상 몰린 좌표 0. 규칙을 다듬으며 로컬 재적재를 일곱 번 했다(`parking_syncs` 5~11번 행 — 새 곳 2,241 → 1,932 → 2,447 → 2,445 → 2,254(KOTSA 끼리 중복 제거 도입) → 2,126 → 2,051, 같은 KST 10-05 08:04~09:26).
- 2026-09-25: 주차장 **18,168곳** = 서울 835 + 표준 17,333(서울 겹침 **413곳** 제외), 좌표 확보 약 96%. 첫 적재는 오픈API 활용신청 반영 전이라 포털 JSON 덤프(`--std-json`)로 했고, 같은 날 표준데이터 API 승인을 확인한 뒤 **API 경로로 재적재**(19콜 → 18,167곳, 겹침 414).
- 원천 쪽 규모(조사 기록): 표준데이터 18,883행(고유 17,746 — 전남·광주 통합으로 관리번호 중복 881), 서울 안내 2,189행 = 고유 850곳(좌표는 시영 117곳뿐 → 약 733곳 지오코딩), 시영 실시간 122행(연계 109).
- 충전소 **99,850곳 / 충전기 515,263기**(53콜 43초, DB 교체 21초). 업스트림은 약 52.5만 기(PLAN — 어댑터 테스트 픽스처에 실측 `totalCount` 525,056)이고, 515,263 은 삭제 표시·버스 전용·좌표 없음·중복을 뺀 수다.
- 실시간: 서울 시영 **99곳** + 공항 **44구역**(한국공항공사 25 + 인천 19). 충전기 상태 10분 폴링 1회에 ~1만 곳 갱신.
- 이력 표 크기 상한: (99 + 44) 키 × 168 칸 ≈ 2.4만 행.

### 호출 예산(개발계정, 서버 1대 — [PLAN-parking.md](../../docs/PLAN-parking.md) §호출량)

- 주차 실시간 폴러 5분: 서울 1 + 한국공항공사 1 + 인천 1 = **원천마다 하루 288콜**.
- 충전기 상태 폴러 10분: period=10 × 2페이지 = **하루 ~288콜**(폴링당 최대 5페이지까지 허용). 전량 적재 53콜은 스크립트(수동·배포)만.
- 인천(15095047)·충전소(15076352)는 **일 1,000건** — 로컬 dev 서버도 같은 키로 폴링하면 두 배(576)지만 한도 안.
- KOTSA(15099883)는 적재 때만 ≈470콜(개발계정 **일 1만 건** — 하루 스무 번 남짓 전량 적재 가능), 폴러 없음. 초당 한도가 실제 병목이라 순차 350ms 간격.
- 끄기: `PARKING_LIVE_CRON=`·`EV_STATUS_CRON=` 빈 값.

## Key Decisions [coverage: high — 28 sources]

- **2026-10-10 비정상 시간 요금은 원천 공통 규칙으로 "정보 없음"**(`36f07eb3`) — 원천 신고값을 그대로 두면 상세 예상 요금이 엉터리가 된다('추가 1분 1,000원' → 1시간 58,000원, 정수 최댓값 2,147,483,647). 행을 버리지 않고 시간 요금 네 칸만 null 로(1일권·월정액은 둔다 — 그 값은 멀쩡한 경우가 많다), 기준은 "기본 시간 0분인데 기본요금 있음" 또는 "시간당 2만 원 초과"(공영 실측 최대 시간당 9천 원 남짓). KOTSA 에만 있던 "30분 1만 원" 상한을 이것으로 합쳐 세 원천이 같은 규칙을 쓴다. 외부 문서도 "비정상이면 기본·추가 요금 `null`" 로 고쳤다([unknown-vs-zero](../concepts/unknown-vs-zero.md) — 0원이 아니라 모름).
- **2026-10-10 등록 차량 전용은 "월정액만 + '…전용' 표기" 일 때만 뺀다**(`36f07eb3`) — 방문자가 쓸 수 없는 곳을 지도에서 빼되, 이름에 '거주자'·'주거지' 만 든 곳은 대부분 일반 공영(지자체 '주거지 주차장' 사업, 화성·전주 공유 구획, 하남 겸용 13곳, 울산 남구 '18:00~24:00 거주자우선주차 전용' 6곳)이라 이름만으로는 안 뺀다. 표준데이터는 비고(`note`)까지 보고(관악구 21곳은 비고에만 '거주자주차제 전용'), 비고에 시간대가 있으면 남긴다. KOTSA 는 비고가 없어 이름(`RESIDENT_ONLY_NAME`) + 월정액만으로 같은 판정 — 처음(10-05)엔 이름만으로 뺐다가 시간 요금 있는 공유 구획까지 빠져 10-10 에 "월정액만" 조건을 더했다(94 → 90).
- **2026-10-10 계약 enum ↔ utils 목록 동일성을 테스트로 고정**(`e5a45348`) — 계약은 utils 를 import 하지 않는 규약이라 같은 목록 6종을 두 곳에 적는다. 여행로그·음식과 같은 방식으로 `options` 를 `toEqual` 비교(값과 순서).
- **2026-10-10 좌표 없는 식당도 '가는 법' 탭에 리뷰 주차 정보**(`008e0081`) — 홈 한 줄이 리뷰 평가만으로도 떠서 누르면 빈 탭으로 가던 것을 막는다. 좌표가 필요한 부분(주변 주차장·주차 페이지 링크)만 숨긴다.
- **2026-10-05 KOTSA 는 "공영 정적 정보만" — 실시간은 뺀다**(`007ac899`, [PLAN-parking.md](../../docs/PLAN-parking.md) §KOTSA "결정(2026-10-05 사용자, 권장안)") — 승인 직후 사용자 결정은 "공영 + 실시간 연결 민영을 넣고 서울 실시간은 서울 API 유지" 였지만, 실측에서 시설과 이어지는 실시간 858행이 1시간 동안 값 변화 0(가이드 갱신 주기 '일 1회')이고 값이 바뀌는 행은 시설에 없는 ID 라 위치를 몰라 **결정 변경**: 공영 + 요금 구분 있는 행의 정적 정보(요금·운영시간)만. 원천이 실시간을 시설 ID 로 이어 주면 재검토(PLAN 후속 후보).
- **2026-10-05 KOTSA 는 기존과 겹치지 않는 새 곳만 더한다 — 정적 정보는 기존 원천 우선**(`007ac899`) — 서울·표준데이터와 같은 곳(6,605곳)은 KOTSA 행을 버린다. 표준데이터 빈 요금을 KOTSA 운영정보로 채우는 보강은 후속 후보로 남겼다. KOTSA 좌표는 입구라 같은 주차장도 100~300m 어긋나므로, 기존 규칙(25m 또는 100m + 이름 유사)에 **정규화 이름이 정확히 같으면 300m 까지**를 더했다(KOTSA 끼리 중복도 같은 300m — 주소로 찾은 필지 중심과 입구가 벌어지는 쌍 47).
- **2026-10-05 위치를 확신할 수 없는 KOTSA 행은 넣지 않는다**(`007ac899`) — 좌표 없이는 기존 주차장과의 겹침을 판정할 수 없어 중복 핀이 생긴다. 그래서 이름 다른 3곳 이상이 한 점에 몰린 원천 좌표는 대표값으로 보고 주소로 다시 찾고, 그래도 한 점에 모이거나 못 찾으면 뺀다(서울 행은 좌표 null 로 남겨 지도에만 안 보이게 하는 것과 다르다).
- **2026-10-05 KOTSA 호출은 순차 + 350ms 간격, 지역은 옛 행정코드 251곳으로 고정**(`007ac899`) — 초당 한도가 가이드(30tps)보다 훨씬 낮아 동시 4개면 대부분 거절된다. 원천이 새 행정코드(강원 51·전북 52 등)를 0건으로 돌려 로컬 DB 코드를 옛 코드로 바꿔 `totalCount` 대조로 목록을 확정했고, 결함 지역(37곳)은 목록에 남겨 원천이 고치면 그대로 들어오게 했다. 시군구 첫 페이지 + 공영 구간 운영정보만 받는 건 공영이 관리 ID 순 앞쪽에 몰린다는 실측에 기댄다(시군구당 수 MB 절약).
- **2026-10-05 겹침 판정을 격자 이웃 칸으로**(`007ac899`) — KOTSA 8천여 곳을 전국 2만 곳과 비교해야 해 앵커 bbox + 전수 비교를 `matchParkingDuplicates`(칸 한 변 ≥ 판정 거리, 이웃 9칸, 가장 가까운 짝)로 바꿨다. 서울 ↔ 표준 결과는 같다(`droppedDup` 414 유지 — 로컬 `parking_syncs`).
- **2026-10-05 셀 수는 거부 대신 셀을 키워 접고, 점 모드 폭은 줌 연동 타일 수로**(`5655abbc`, 성능 2차 E-V1 — [amplification-caps](../concepts/amplification-caps.md)) — 무인증 `zoom=22 + 전국 bbox` 수십 요청이 셀 8.6만 개·응답 4.9MB 를 개수 상한 LRU(300)에 쌓아 재시작을 부를 수 있었다. 400 으로 거부하면 정상 대형 화면을 깰 수 있어 열×행 6,000 을 넘으면 줌을 낮추고(남용 요청이 낮은 줌의 같은 키로 모인다), 셀 캐시는 셀 수 기준 바이트 상한([bounded-byte-caches](../concepts/bounded-byte-caches.md)). 1.5° 고정 점 모드 상한은 줌과 무관해 z14 에 실화면 7배 상자를 허용했으므로 32타일로. 일상지도·집값과 공용 헬퍼([friendly](friendly.md)).
- **2026-10-05 충전소 필터는 커버링 인덱스로, 상태 시각은 메모 공유로**(`5655abbc`, E-5·E-9·E-10) — statusAt 인덱스(1.48MB)는 MAX 를 0ms 로 만들지만 폴러가 충전소를 갱신할 때마다 인덱스 갱신이 붙어 **메모 공유 + 폴러 즉시 갱신**을 골랐다(발견 원문 권고). 필터 셀은 기존 `(lat,lng)` 를 같은 접두의 커버링 인덱스로 대체(별도 인덱스 추가가 아니라 교체), '사용 가능만' 셀은 `statusAt` 을 키에 넣어 폴링 사이 재사용.
- **2026-10-05 로그인 사용자는 저장 위치를 기다린 뒤 지도를 띄운다**(`03bc43f0`) — 서울시청으로 먼저 받았다가 저장 위치로 전부 다시 받는 낭비를 없애는 대신, URL 좌표가 없으면 첫 화면이 "불러오는 중…" 이다(날씨·대기와 같은 결정). URL `ll` 이 있으면 기다리지 않는다.
- **2026-10-05 홈 탭 주차 한 줄은 보일 때만 조회**(`14f48e16`) — 홈 탭 맨 아래라 대개 첫 화면 밖인데 상세를 열 때마다 조회 2건 + 5분 폴링이 나갔다. `useInViewOnce` 로 '영업 정보' 가 화면에 들어온 뒤에만.
- **2026-09-26: 홈 한 줄 요약의 `onOpen` 을 선택 prop 으로**(`420a6be`) — 어드민 맛집 상세가 공개 [HomeTab](../../apps/web/src/components/restaurant/detail/HomeTab.tsx) 을 그대로 재사용하게 되면서, 그 화면엔 '가는 법' 탭이 없다. HomeTab 에 선택 prop `availableTabs` 를 두고 `canOpen('transit')` 이 아니면 `ParkingSummaryLine` 에 `onOpen` 을 넘기지 않아 **누를 수 없는 정보 줄**로 그린다 — 공개 상세의 동작(누르면 '가는 법')은 그대로.
- **2026-09-25: 격리 DB 준비 시간은 파일별이 아니라 전역 한도로**(`5d7b686`) — `parking.test.ts` 가 처음엔 `beforeAll(…, 180_000)` 로 자기만 늘렸지만, 같은 원인(격리 DB 가 3.6GB dev.db 를 통째로 복사해 비움 — [temp-db.ts](../../apps/friendly/src/test-utils/temp-db.ts))으로 다른 파일도 간헐 실패해 [vitest.config.ts](../../apps/friendly/vitest.config.ts) `hookTimeout: 60_000` 으로 옮기고 개별 한도를 지웠다.

아래는 모두 `2ff2c31`(2026-09-25). 앞의 여섯은 [PLAN-parking.md](../../docs/PLAN-parking.md) §결정(사용자) 순서, 그 뒤는 구현 결정이다.

- **2026-09-25: 일상지도 레이어가 아니라 별도 메뉴 `/parking`**(PLAN 결정 1) — PLAN 은 결정만 적었고, 결과물은 탭 3개·탭별 필터 칩·상세 카드·실시간 폴러를 가진 독립 화면이라 일상지도의 레이어 토글(한 지도에 여러 레이어를 겹치는 모양)과 형태가 다르다. 사이드바·상단바에서 '대중교통' 바로 다음(대중교통의 서브탭이 아니라 독립 메뉴 — `match` 없음).
- **2026-09-25: 지도 한 장 + 패널, 탭 주차장 · 충전소 · 공항**(PLAN 결정 2) — 탭이 마커 소스·목록·상세·필터를 통째로 바꾸고 지도는 한 장(`poolKey 'parking'`). 탭은 URL `t`, 탭을 바꾸면 선택을 비우고 공항 탭은 전국 뷰로.
- **2026-09-25: 맛집은 '가는 법' 탭 섹션 + 홈 탭 한 줄 요약**(PLAN 결정 3) — 대중교통과 같은 "식당까지 가는 법" 맥락에 두고, 홈엔 한 줄만. 두 컴포넌트가 같은 조회 키(반경 300m·5건 + 리뷰 집계)를 써서 캐시를 공유한다. 리뷰 평가는 새 LLM 호출 없이 이미 있는 분석(`aspectsJson` '주차' 극성 + '주차' 가 든 팁)을 canonical 공개 멤버 전체에서 센다.
- **2026-09-25: 혼잡 이력은 지금부터 축적, 표시는 표본이 쌓이면 자동**(PLAN 결정 4) — 원천 API 는 현재 값만 주므로 폴러가 칸(키 × 요일 × 시)에 누적만 한다. 칸마다 24표본(≈2주)이 차야 값이 나오고 — 그 요일 행이 아예 없으면 차트 없음, 행은 있는데 찬 칸이 하나도 없으면 "쌓는 중(시각별 표본 N/24)", 일부만 찼으면 모자란 시각은 옅은 짧은 막대 — 칸이 채워지는 순간 코드 변경 없이 막대·공항 "평소 이 시간" 세로선이 나타난다.
- **2026-09-25: 체류 시간별 요금 정렬은 안 함 — 상세의 예상 요금만**(PLAN 결정 5) — PLAN 에 이유는 없다. 원천 요금 체계가 제각각(기본+추가, 5분 단위 반복, 일 최대, 1일권)이고 표준데이터 요금 보유율이 72% 라는 점이 배경으로 보인다. 대신 `estimateParkingFee` 로 상세에 1·2·3시간만.
- **2026-09-25: 웹 먼저, 앱은 다음 단계**(PLAN 머리말) — 계약·shared 훅은 플랫폼 공용으로 만들어 두었고 앱 화면만 없다.
- **2026-09-25: 실시간은 요청 프록시가 아니라 서버 폴러 + 메모리** — 대중교통처럼 요청마다 업스트림을 부르지 않고, 5분(주차)·10분(충전기) 폴러가 **사용자 수와 무관한 고정 예산**(원천마다 하루 ~288콜)으로 받아 두고 요청은 메모리·DB 만 읽는다. 덕분에 공개 라우트 한도를 240/분으로 넉넉히 줄 수 있고 인천·충전소 개발계정 1,000건/일 안에 든다([quota-proportional-loading](../concepts/quota-proportional-loading.md) 의 "정적인 것은 로컬로" 를 실시간까지 늘린 형태). 단일 인스턴스라 Redis 없이 인프로세스([in-memory-singleton-gates](../concepts/in-memory-singleton-gates.md)).
- **2026-09-25: 폴러는 `onListen` 에서만 시작** — `export:openapi`([export-openapi.ts](../../apps/friendly/scripts/export-openapi.ts) — `app.ready()` 뒤 `app.close()`, listen 없음)와 `app.inject` 테스트가 앱을 띄울 때 업스트림을 부르지 않게. 집값 갱신 스케줄러가 `onReady` 에서 시작하는 것([housing.route.ts](../../apps/friendly/src/modules/housing/housing.route.ts))과 갈린 지점이고, 테스트는 추가로 `isTest` 면 cron 을 빈 값으로 넘긴다.
- **2026-09-25: 이력은 원시 SQL UPSERT + 4분 가드** — `(key, dow, hour)` PK 한 행에 합·표본 수·만차 수만 누적(행 수 상한 = 키 × 168). 재기동 직후 폴링·겹친 cron 이 같은 칸을 연달아 세지 않게 `WHERE updatedAt <= new − 4분`, 원천이 갱신되지 않은 값(30분 초과)은 안 넣고, 초과 주차는 1.5 에서 자르고, 97% 이상을 만차 표본으로.
- **2026-09-25: 원천 접두 id + 전량 교체 + FK 없음 + 적재 이력 행** — `std:`/`seoul:`(2026-10-05 부터 `kotsa:` 도) 접두로 원천이 섞여도 id 가 안 부딪히고, 로더는 한 트랜잭션 전량 교체 + `ParkingSync` 한 행(조회 게이트·셀 캐시 키·상태 API 가 공유) — [open-data-master-load](../concepts/open-data-master-load.md) 수명주기. 다만 원본 파일을 리포에 두지 않고 **API 가 원천**이다(표준데이터만 `--std-json` 파일 대안).
- **2026-09-25: 표준데이터와 서울이 겹치면 서울을 남긴다** — 서울 원천이 요금(5분 단위·토/공휴일 무료·일 최대)과 실시간 연계 키를 갖고 있어서. 판정은 100m 안 + 이름(정규화 동일 또는 유사도 0.5) 또는 25m 안(2026-10-05 부터 격자 이웃 칸 방식, 규칙은 같다). 표준데이터의 API·포털 덤프 키 형식은 `canonKeys` 로 흡수해, **오픈API 승인 전에도 포털 파일로 먼저 적재**할 수 있게 했다(실제로 첫 적재는 파일, 같은 날 API 로 재적재).
- **2026-09-25: 충전기 상태는 변경분(period=10)만 → `UPDATE … FROM` + 충전소 칸 재집계** — 52만 행 전량을 10분마다 받는 대신 최근 10분 변경분(~1.3만 행, 2콜)만. 충전기 행은 VALUES 조인 한 문장으로, 충전소 사용 가능/충전 중 칸은 바뀐 충전소만 상관 서브쿼리로 다시 센다. 지도 필터(`availableOnly`)·단계 색이 이 칸을 읽는다. 버스 전용(타입 11)·삭제 표시는 적재에서 뺀다.
- **2026-09-25: 조회·화면 부품은 일상지도·집값 것을 재사용** — 전국 고정 원점 셀 격자와 셀 SQL, 점/셀 전환(1.5° 스팬 제한 포함 — 2026-10-05 에 32타일 상한·셀 6,000 상한으로 교체), 셀 LRU(`syncId` 키), 지오코더와 영구 캐시, `LifeGoToBox`, 지도+패널/시트 골격, 진입 중심 규칙(저장한 내 위치 — [saved-location-glance](../concepts/saved-location-glance.md)), 마커 프레임([map-sheet-shell](../concepts/map-sheet-shell.md)). 점 임계 줌만 밀도에 맞춰 주차장 13·충전소 15. 실시간이 섞이는 필터(`liveOnly`·`availableOnly`) 셀은 캐시에서 뺐다(`availableOnly` 는 2026-10-05 부터 `statusAt` 키로 캐시).
- **2026-09-25: 코드표·계산은 utils 한 곳, 계약은 리터럴 이중 정의** — 요금 추정·운영시간 해석·혼잡 단계·충전기 코드·공항 좌표를 [parking.ts](../../packages/utils/src/parking.ts) 에 두어 서버(적재·조회)와 웹(범례·필터·상세)이 같은 계산을 쓴다. 계약은 utils 를 import 하지 않는 규약이라 enum 값을 다시 적었다(주석 "같은 목록" — 동일성 테스트는 2026-10-10 `e5a45348` 에 생겼다).
- **2026-09-25: 공휴일은 판정하지 않는다** — 공휴일 달력을 두지 않고 일요일만 공휴일 운영시간으로 보며, 상세에 "공휴일은 따로 판정하지 않아 일요일 시간으로 봅니다" 를 적는다(PLAN §함정). 운영시간 `00:00~00:00` 은 정보 없음, `24:00`·`23:59` 끝은 24시간.
- **2026-09-25: 공항 좌표는 상수** — 한국공항공사 응답에 좌표가 없어 `PARKING_AIRPORTS`(14곳, 활주로 기준점 근사)로 두고 `airportKor` 이름으로 매칭한다. 인천은 원천이 달라(`source 'iiac'`) 같은 목록의 첫 행.
- **2026-09-25: 필터는 persist, 위치·탭·선택은 URL** — 공유·새로고침에 필요한 것(뷰포트·탭·선택)은 URL, 사용자 취향(무료만·급속 등)은 `lp:parking-prefs` localStorage(집값 prefs 관례).
- **2026-09-25: KOTSA 15099883 은 승인 뒤로** — 심의승인이 필요하고, 같은 원천의 파일 분석상 실시간 행 99.3% 가 더미성(실연계 ≈4.2천, 경기 편중)이라 승인 후 재프로브하기로. 계약·스키마·라벨에 `'kotsa'` 자리만 만들어 두었다(작업 기록). → 2026-10-05 승인·재프로브 뒤 공영 정적 정보만 연결(위 10-05 결정들).

## Gotchas [coverage: high — 32 sources]

**PLAN ↔ 코드 어긋남**([PLAN-parking.md](../../docs/PLAN-parking.md) 는 120줄 — §KOTSA·§요금 정리가 2026-10-05·10-10 에 붙었다. 세부는 코드가 진실)
- 적재 옵션: PLAN §구조는 `load:parking-lots [--sources=std,seoul,kotsa] [--offline] [--kotsa-dump|--kotsa-json=<폴더>]`(`007ac899` 갱신) 인데 코드엔 `--std-json=<파일|폴더>`·`--kotsa-codes=…`·`--dry-run`·`--max-calls=N` 도 있다(§KOTSA 본문엔 `--kotsa-codes` 가 있다). `load:ev-chargers` 의 `--dry-run`·`--zcode`·`--max-pages` 는 PLAN 에 없다.
- 겹침 규칙: PLAN §구조 "100m 안 + 이름 유사도(KOTSA 는 정규화 이름이 정확히 같으면 300m)" ↔ 코드는 여기에 **정규화 이름 동일**(100m)과 **25m 안이면 이름 무관**이 더 있다([parking-master.service.ts](../../apps/friendly/src/modules/parking/parking-master.service.ts) `DUP_RADIUS_M`·`DUP_NEAR_M`·`DUP_NAME_SCORE`·`KOTSA_SAME_NAME_RADIUS_M`, §KOTSA 본문은 25m 를 적었다). 2026-10-05 이전의 "서울 앵커 bbox ±0.01° 밖은 비교 생략" 은 격자 이웃 칸 방식으로 바뀌었다.
- KOTSA 대표 좌표 실측: PLAN §KOTSA "3곳 이상 몰린 좌표 63곳·**270행**" ↔ [kotsa-master.service.ts](../../apps/friendly/src/modules/parking/kotsa-master.service.ts) 머리 주석 "63곳·**283행**". PLAN §호출량에는 KOTSA 적재 ≈470콜(개발 1만/일)이 없다(§KOTSA·`.env.example` 에만).
- 서울 유무료: PLAN §함정 "GetParkInfo 유무료 코드는 Y=유료/N=무료" ↔ 코드는 Y/N 코드를 읽지 않고 **이름 필드**(`CHGD_FREE_NM`/`PAY_YN_NM` = '유료'/'무료', 토·공휴일 `SAT_CHGD_FREE_NM`/`LHLDY_NM`)만 본다 — 이름 필드가 비면 `feeType` null.
- 충전기 상태 호출량: PLAN "9,999행 × 2페이지 → 하루 ~288콜" 은 평소값이고 코드는 폴링당 **최대 5페이지**(`MAX_PAGES`)까지 받는다 — 변경이 몰리면 하루 720콜까지 가능하고, 로컬 dev 와 운영이 같은 키로 돌면 개발계정 1,000건/일을 넘길 수 있다.
- 서울 규모: PLAN "서울 공영 850곳" ↔ 적재 835곳(버스·거주자 전용 제외 뒤 실시간 목록 보충). 시영 실시간 "122곳(109곳 연계)" ↔ 로컬에서 폴러가 실제로 내보낸 곳은 99곳(작업 기록 — 차이는 연계 코드 1·2·2시간 신선도·버스/거주자 제외 필터로 보인다).

**문서·주석이 코드보다 뒤처진 곳**
- [docs/api/README.md](../../docs/api/README.md)(수기) — `007ac899` 가 §6 '지도 데이터' 에 **주차 절**을 넣었고 `36f07eb3` 이 "비정상 시간 요금은 `null`" 을 더했다. 남은 빈칸: §5 한도 표(일상지도·집값 240/분 행에 주차 없음), §7 공공데이터 출처 목록(환경공단·한국공항공사·인천국제공항공사·한국교통안전공단 없음), `status`·`airports` 의 `Cache-Control` 60초. `2ff2c31` 은 `export:openapi` 로 [endpoints.md](../../docs/api/endpoints.md)·[openapi.json](../../docs/api/openapi.json) 만 재생성했고 KOTSA 커밋들은 openapi 를 다시 만들지 않았다(계약 변경이 주석뿐이라 필요 없음 — `ParkingSource` enum 엔 처음부터 `kotsa`, [api-docs](api-docs.md)).
- 낡은 KOTSA 주석: [schema.prisma](../../apps/friendly/prisma/schema.prisma) `ParkingLot` 머리 주석 "(+ KOTSA 15099883 승인 후 'kotsa:')"·"표준데이터의 서울 행이 서울 원천과 겹치면 서울 행만 남긴 뒤", [routes.ts](../../packages/api-contract/src/routes.ts) `Parking` 주석 "주차장(표준데이터+서울)" 이 KOTSA 연결 뒤에도 그대로다. [kotsa-sigungu.ts](../../apps/friendly/src/modules/parking/kotsa-sigungu.ts) 머리 주석 "적재는 시설이 빈 시군구의 실시간·운영 호출을 건너뛴다" 의 '실시간' 은 실시간을 아예 안 부르게 된 뒤의 흔적이다.
- [ParkingSection.tsx](../../apps/web/src/components/restaurant/detail/ParkingSection.tsx) `useParkingData` 주석 "enabled=false 면 … 캐시에 이미 있으면 그 값은 그대로 쓴다" 는 주변 주차장만 맞다 — 리뷰 집계는 `placeId` 를 null 로 바꿔 키가 달라지므로 캐시를 못 읽는다.
- [docs/data-sources.md](../../docs/data-sources.md) 에 주차 원천 행·문단이 없다(같은 라운드의 침수 흔적·바다는 추가됨). README §7 이 "원천별 상세는 data-sources.md" 로 보내므로 외부 독자에겐 주차 원천·이용 조건(충전소 공공누리 1유형)이 안 보인다 — 지금은 PLAN·`.env.example`·[env.ts](../../apps/friendly/src/config/env.ts) 주석과 화면 푸터에만 있다.
- [env.ts](../../apps/friendly/src/config/env.ts) 의 `SEOUL_OPEN_API_KEY` 주석은 여전히 "openapi 정적(역사마스터) — load:subway-stations 가 사용" 뿐 — 주차 적재(`GetParkInfo`)·실시간 폴러(`GetParkingInfo`) 사용은 [.env.example](../../apps/friendly/.env.example) 에만 적혔다(이 키 줄 자체도 `2ff2c31` 이 `.env.example` 에 처음 넣었다).
- 주석 위치 어긋남: [routes.ts](../../packages/api-contract/src/routes.ts) 에서 `Parking` 블록이 `// ── 일상지도(전국 CCTV·공중화장실 CSV + 병의원 심평원 API 적재)` 설명 주석과 `export const LifeMap` 사이에 끼어 들어가 **일상지도 주석이 `Parking` 위에** 붙었고, [App.tsx](../../apps/web/src/App.tsx) 도 `{/* 일상지도(전국 CCTV·공중화장실) — 공개 페이지, OL 지도라 lazy. */}` 바로 아래가 `/parking` 라우트다. 동작 영향은 없다.
- 응답 필드 `fetchedAt` 이 세 뜻이다 — 점·주변 응답은 **적재 시각**(`ParkingSync.loadedAt`, 계약 주석), `ParkingLive.fetchedAt` 은 폴링 시각, 공항 응답은 마지막 폴링 시각(못 받았으면 null). 외부 소비자가 "데이터 신선도" 로 오해하기 쉽다.
- [useParking.ts](../../packages/shared/src/hooks/useParking.ts) `useRestaurantParkingReviews` 주석은 "404(식당 없음)는 재시도하지 않는다" 인데 `retry: false` 라 5xx·네트워크 오류도 재시도하지 않는다.
- [parking-status.ts](../../apps/friendly/scripts/parking-status.ts) 는 **어떤 예외든** `missing` 을 찍는다(주석은 "테이블 없음 — 마이그레이션 전") → deploy 의 `parking_data` 가 "(주차 테이블 없음 — 마이그레이션(케이스 2/4) 뒤에 적재됩니다)" 로 조용히 건너뛴다. DB 잠김·Prisma 클라이언트 미생성도 같은 문구가 된다.
- `applyEvStatus` 가 돌려주는 "바뀐 충전소 수" 는 상태 행의 고유 `statId` 수라 **마스터에 없는 충전소도 센다**([parking.test.ts](../../apps/friendly/src/modules/parking/parking.test.ts) 가 없는 'NOPE' 을 포함한 3 으로 고정).

**운영 함정**
- 운영 배포 = 마이그레이션 `20260925071552_add_parking` + `20261005030000_ev_station_covering_index`(인덱스 교체만, 백필 없음) + `parking_data`(케이스 2/4 가 비어 있으면 첫 적재, `kotsa=0` 이면 KOTSA 포함 재적재) + 운영 `.env` 의 `SEOUL_OPEN_API_KEY` 확인(작업 기록 — 아직 미배포. KOTSA 는 같은 계정 키 `DATA_GO_KR_API_KEY` 로 부르고, 어댑터 주석은 "개발·운영 모두 심의승인 — 2026-10-05 승인 확인"). `SEOUL_OPEN_API_KEY` 가 비면 `load:parking-lots` 기본값(`std,seoul,kotsa`)은 **서울 단계에서 예외로 전체가 멈춰** 표준·KOTSA 도 안 들어간다 — `--sources=std,kotsa` 로 따로 돌려야 한다. KOTSA 가 실패해도(미승인·일 한도·초당 한도 재시도 소진) **교체 전에 예외**라 서울·표준까지 이번 적재가 무산된다(기존 표는 그대로).
- **부분 적재는 전량 교체다** — deploy 실패 안내가 권하는 `--sources=std,seoul`, 또는 `--sources=std`·`--kotsa-codes=`·`--zcode=` 는 나머지 원천·시군구·시도 행을 지운다. 충전소 자동 적재는 `ev=0` 일 때만이라 부분 적재 뒤엔 다시 채워지지 않는다 → 원천을 고친 뒤 `./deploy.sh 9`(force) 로 전량. 주차장은 반대로 **`kotsa=0` 이 재적재 조건**이라, `--sources=std,seoul` 로 넘긴 뒤(또는 KOTSA 가 계속 실패하거나 새 곳이 0이면) **배포 케이스 1·2·4 마다 5분 남짓·≈490콜 전량 적재를 다시 시도**한다.
- **원천 결함 지역엔 KOTSA 보강이 없다** — 강원·전북·부천·화성·군위·옛 인천 남구(37개 시군구, ≈24만 행)는 원천이 `totalCount` 만 주고 목록을 비워, 그 지역 주차장은 표준데이터·서울만이다. 적재 로그 "원천 결함 — … N곳" 으로만 드러난다(PLAN 후속: 원천 문의).
- KOTSA 수집은 실측 순서에 기댄다 — 공영이 관리 ID 순 앞쪽(시군구 첫 페이지 안)에 몰리고 운영정보가 시설과 같은 순서라는 가정(`KOTSA_PUBLIC_TAIL`·`KOTSA_OPR_MARGIN`). 원천이 정렬을 바꾸면 첫 페이지 뒤 공영을 놓치거나 운영정보 재호출(1만 행)이 늘어난다. 지역 필터는 옛 행정코드라 원천이 새 코드로 바꾸면 `KOTSA_SIGUNGU` 를 다시 맞춰야 한다.
- KOTSA 초당 한도와 일 한도는 **같은 게이트웨이 코드 22** 다 — 어댑터는 메시지의 `PER_SECOND` 로 가르고(초당만 2.5초 쉬고 재시도, 기본 3회), 같은 키로 다른 프로세스(로컬 dev 적재 등)가 동시에 부르면 초당 한도가 금방 찬다.
- `--offline` 이나 VWorld 키 없이 돌리면 좌표 없는 KOTSA 행은 **빠진다**(서울 행은 좌표 null 로 남는다). 운영은 `life_map_data` 가 압축본 캐시(107,161건)를 먼저 가져와 거의 캐시로 풀리지만, `./deploy.sh 9` 단독은 압축본을 가져오지 않아 새 주소는 VWorld 로 찾는다(PLAN §KOTSA).
- 표준데이터 오픈API 는 활용신청 직후 한동안 게이트웨이 코드 30(반영 대기 수십 분)이다 — 스크립트가 안내를 찍는다. 그 사이엔 포털 JSON 덤프를 `--std-json` 으로.
- 적재 트랜잭션은 SQLite 쓰기 잠금을 오래 잡는다(충전기 교체 로컬 21초, 주석 "수 분, 그동안 다른 쓰기는 대기") — 그동안 서버 폴러의 이력 UPSERT·상태 UPDATE 와 **다른 도메인의 모든 쓰기**가 기다린다. `2b072b53` 부터 서버의 모든 연결이 busy_timeout 30초라(그 전엔 풀 대부분이 5초) 짧은 교체는 버티지만 30초를 넘으면 실패한다(폴러는 warn 후 다음 주기). 같은 라운드에 상가·집값 통계는 스테이징 표 + RENAME 교체로 락을 줄였지만 주차장·충전기 교체는 **한 트랜잭션 그대로**다([sqlite-write-lock-budget](../concepts/sqlite-write-lock-budget.md)). KOTSA 수집(4분 20초)은 트랜잭션 밖이라 락을 잡지 않는다. deploy 케이스 1·2·4 의 무중단 분기는 **옛 서버가 도는 중에** `parking_data` 를 돌린다.
- 로컬 dev 서버도 같은 `DATA_GO_KR_API_KEY`·`SEOUL_OPEN_API_KEY` 로 폴링한다 — 두 대면 호출이 두 배. 로컬에서 끄려면 `.env` 에 `PARKING_LIVE_CRON=`·`EV_STATUS_CRON=`(빈 값).
- 재기동하면 실시간 메모리가 비고 기동 직후 첫 폴링이 끝날 때까지 여석·공항이 빈다(공항 `fetchedAt` null → "아직 받지 못함"). 충전기 상태는 DB 라 안 비지만 **기동 즉시 폴링이 없어** 첫 갱신은 다음 10분 cron.
- 폴링이 계속 실패하면 이전 값을 **최대 2시간**(`isFresh`) 보여 준 뒤 실시간이 조용히 사라진다 — 공항은 `stale` 플래그가 있지만 서울 여석엔 신선도 표시가 "N분 전 기준" 문구뿐이다.
- 혼잡 이력은 **지금부터** 쌓인다 — 칸당 24표본(≈2주, 요일별이라 각 요일 칸이 따로 찬다) 전엔 상세가 "쌓는 중" 안내만(그 요일 행이 아예 없으면 차트 자리 자체가 없다), 공항 "평소 이 시간" 세로선도 없다. 공항 주차장 이름이 원천에서 바뀌면 이력 키(`airport:<IATA>:<이름>`)가 새로 시작한다.
- 로컬 dev DB 엔 리뷰 '주차' 관점 분석이 거의 없어 식당 평가는 팁만 보인다(운영엔 있음 — 작업 기록). 관점은 리뷰 검색 enrich([review-search.service.ts](../../apps/friendly/src/modules/review-search/review-search.service.ts))가 돌아야 채워진다.
- KOTSA 15099883 — 2026-09-25 저녁까지 게이트웨이 30(미신청/심의 대기), 2026-10-05 승인 확인·재프로브 → 공영 정적 정보만 연결. KOTSA 행에 실시간 여석은 없다(`liveKey` null — 실시간 데이터는 멈춰 있거나 위치 불명). 원천이 실시간을 시설 ID 로 이어 주면 재검토.
- 좌표 없는 서울 주차장(시영 외 약 733곳)과 KOTSA 의 입구 좌표 결측·대표 좌표 행(10-05 실측 454곳이 주소로 찾은 값)은 VWorld 지오코딩 값이다(`geoSource 'road'|'parcel'`, 상세 "위치는 주소로 찾은 값"). 서울은 지오코딩에 실패하면 좌표 null → 지도·주변 목록에서 빠지고 상태의 `geocoded` 만 모자란다(로컬 10-10: 20,261곳 중 좌표 19,501). KOTSA 는 실패하면 행 자체를 뺀다.
- KOTSA 좌표는 **입구**라 같은 주차장도 서울·표준 핀과 100~300m 떨어진다 — 새로 더한 곳은 겹침이 아닌 것으로 판정된 곳뿐이지만, 이름이 서로 다르게 적힌 같은 주차장이 100m 밖에 있으면 핀 두 개가 남을 수 있다(이름 같은 쌍만 300m 까지 접는다).

**코드·테스트 함정**
- 폴러는 `onListen` 에서만 돈다 — `app.ready()` 만 하는 스크립트·inject 테스트에선 안 도는 게 의도다. 폴러를 테스트하려면 [parking.test.ts](../../apps/friendly/src/modules/parking/parking.test.ts) 처럼 `new ParkingLiveService({ cron: '', fetchImpl, now })` 를 만들어 `pollOnce()` 를 직접 부른다.
- **Prisma SQLite DateTime = epoch ms 정수** — 원시 SQL(`recordHistory` 의 `updatedAt`, `applyEvStatus` 의 `statusAt`)은 반드시 `getTime()` 숫자로 쓴다. ISO 문자열을 넣으면 4분 가드 비교(`updatedAt <= new − 240000`)가 깨진다.
- 서울 노상은 **구획마다 행**(면수 1)이다 — 여러 행이면 행 수가 면수, 한 행뿐이면 면수를 모른다(null). 좌표는 행 평균.
- 인천은 현재 대수가 면수를 넘는다(초과 주차) — `level 'full'`·`available 0`·`rate > 1`, 이력 점유율은 1.5 에서, 화면 막대는 100% 에서 자르고 글자는 "103% 사용" 그대로.
- 서울 실시간 목록의 관광버스 전용·거주자 전용 제외는 적재와 폴러가 같은 `seoulExcludedOper` 를 쓴다 — 규칙을 바꾸면 둘 다 바뀐다.
- 실시간이 섞이는 필터는 셀 캐시에 그대로 넣으면 안 된다 — `liveOnly` 는 폴링마다 집합이 바뀌어 캐시를 건너뛰고(폴링 전이면 빈 결과), `availableOnly` 는 `5655abbc` 부터 **마지막 상태 반영 시각을 키에** 붙여 캐시한다. 새 필터가 "폴링마다 바뀌는 조건" 이면 둘 중 하나를 골라야 한다. `statusAt` 키는 폴러가 같은 프로세스에서 `noteStatusAt` 을 불러야 바로 갈린다 — 다른 프로세스의 재적재는 `syncId` 가 바뀌어 갈린다.
- 셀 모드는 요청 줌보다 **낮은 줌으로 집계될 수 있다**(`cellGrid` — 열×행 6,000 초과) — 응답 셀이 화면 기준보다 크게 온다. 캐시 키도 실제 쓴 줌이라, z22 전국과 z9 전국이 같은 결과·같은 키다(테스트 고정). 점 모드는 32타일을 넘는 bbox 면 줌 13 이상이어도 셀이다(SEOUL_BBOX 경도 0.02° 를 z20 으로 보내면 셀).
- 계약 enum 과 utils 상수는 여전히 리터럴 이중 정의지만 **2026-10-10 `e5a45348` 부터 동일성 테스트가 있다**([parking-master.service.test.ts](../../apps/friendly/src/modules/parking/parking-master.service.test.ts) — `ParkingOwnership`·`ParkingLotType`·`ParkingFeeType`·`ParkingSource`·`ParkingLevel`·`EvLevel` 의 `options` 와 utils 목록 `toEqual`, 값·순서). 그 전엔 타입 사용처만 간접으로 막았다.
- **좌표 없는 식당**: 2026-10-10(`008e0081`) 전엔 [TransitTab.tsx](../../apps/web/src/components/restaurant/detail/TransitTab.tsx) 가 안내로 탭 전체를 대체해 리뷰 주차 평가도 안 보였고, 홈 한 줄(리뷰 평가만으로도 뜸)을 누르면 빈 탭으로 갔다. 지금은 안내 아래에 리뷰 정보만 붙는다 — 리뷰 정보도 다이닝코드 시설도 없으면 주차 칸은 여전히 없다.
- 식당 상세의 주변 주차장 조회는 `refetchInterval` 5분이라 '가는 법' 탭(또는 '영업 정보' 가 한 번 보인 홈 탭)을 열어 둔 동안 주기 조회가 계속된다(로컬 DB 라 업스트림 비용은 0). 2026-10-05(`14f48e16`) 전엔 홈 탭만 열어도 조회 2건이 나갔다([transit](transit.md)).
- `status` 라우트는 route 프리셋이 없다(전역 1000/분). 2026-10-05(`5655abbc`, E-9) 전엔 매 호출 `MAX(ev_stations.statusAt)` 를 인덱스 없이 스캔했고(서비스 33ms), 지금은 `EvService` 메모 공유 + `Cache-Control` 60초. 단 `ParkingService` 를 `evStatusAt` 없이 만들면(테스트·스크립트) 여전히 직접 MAX 를 읽는다.
- 로그인 사용자가 URL 좌표 없이 `/parking` 에 들어오면 저장 위치 응답 전까지 **지도 대신 "불러오는 중…"** 이다(`03bc43f0`) — 저장 위치 조회가 느리거나 실패하면 그만큼 첫 화면이 늦다(`useAirLocation.isLoading` 이 풀려야 본문을 그린다).
- 웹 하단 푸터 테스트([ParkingFooter.test.tsx](../../apps/web/src/components/parking/ParkingFooter.test.tsx))의 픽스처 수치(18,168 + 2,258 = 20,426, `geocoded` 17,412+)는 실측이 아니다 — 실측은 위 Data 규모 절.
- `ParkingLiveService.start()` 는 키가 둘 다 비어도 cron 을 등록한다(폴링마다 할 일 없음) — `EvStatusPoller` 는 키가 없으면 등록조차 안 한다.
- 파라미터 라우트는 `decodeURIComponent(Routes.Parking.lotDetail(':id'))` 로 등록해야 한다 — 빼먹으면 `%3Aid` 경로가 등록돼 404([tour](tour.md) 와 같은 함정). id 에 콜론이 있어(`seoul:171721`) 클라이언트는 `encodeURIComponent` 된 경로로 부른다.
- 웹 테스트는 `MapCanvas` 를 목으로 바꿔 뷰포트가 올라오지 않으므로 **points 요청이 나가지 않는다**([ParkingPage.test.tsx](../../apps/web/src/routes/ParkingPage.test.tsx) 주석) — 마커·셀 경로는 백엔드 테스트와 Playwright 캡처(커밋 본문)로만 확인됐다.

## Sources [coverage: high — 87 sources]

### friendly — parking 모듈
- [apps/friendly/src/modules/parking/parking-api.adapter.ts](../../apps/friendly/src/modules/parking/parking-api.adapter.ts) — data.go.kr·서울 열린데이터 봉투 해석(KOTSA `listKey` 포함), 503/502 분류, 1회 재시도·초당 한도 2.5초 재시도·`attempts`, 키 마스킹, 엔드포인트 상수, `fetchKotsaPage`·`createCallSpacer`·`KOTSA_*`
- [apps/friendly/src/modules/parking/parking-api.adapter.test.ts](../../apps/friendly/src/modules/parking/parking-api.adapter.test.ts) — 13건(봉투 6 · callDataGoKr 4 · KOTSA 페이지·간격 2 · callSeoulOpen 1)
- [apps/friendly/src/modules/parking/parking-master.service.ts](../../apps/friendly/src/modules/parking/parking-master.service.ts) — `canonKeys`·표준/서울 정규화·`seoulExcludedOper`·`sanitizeParkingFeeRule`·`isMonthlyOnlyFee`·`isStdPermitOnly`·`matchParkingDuplicates`(격자)·`KOTSA_SAME_NAME_RADIUS_M`·전량 교체
- [apps/friendly/src/modules/parking/parking-master.service.test.ts](../../apps/friendly/src/modules/parking/parking-master.service.test.ts) — 15건(계약 enum ↔ utils 동일성 1 · 요금 정리/등록 차량 전용 3 · 키 통일 · 표준 4 · 서울 3 · 겹침 3)
- [apps/friendly/src/modules/parking/kotsa-master.service.ts](../../apps/friendly/src/modules/parking/kotsa-master.service.ts) — KOTSA 수집(`collectKotsaSigungu`·`slimKotsaCollected`)·공영 정규화(`normalizeKotsaSigungu`·`kotsaOperationFields`·거주자 구획)·대표 좌표(`markKotsaPlaceholderCoords`)·KOTSA 끼리 중복(`dedupeKotsaRows`), 머리 주석에 실측 함정
- [apps/friendly/src/modules/parking/kotsa-master.service.test.ts](../../apps/friendly/src/modules/parking/kotsa-master.service.test.ts) — 15건(정규화 4 · 거주자 구획·요금 정리 2 · 운영정보 2 · 수집 4 · 좌표·중복 3)
- [apps/friendly/src/modules/parking/kotsa-sigungu.ts](../../apps/friendly/src/modules/parking/kotsa-sigungu.ts) — `KOTSA_SIGUNGU` 옛 행정코드 251곳, 원천 결함 지역 설명
- [apps/friendly/src/modules/parking/parking-live.service.ts](../../apps/friendly/src/modules/parking/parking-live.service.ts) — 5분 폴러·메모리 실시간·이력 UPSERT(4분 가드)·평소 혼잡도·공항 목록 조립
- [apps/friendly/src/modules/parking/parking-live.service.test.ts](../../apps/friendly/src/modules/parking/parking-live.service.test.ts) — 7건(시각 형식·서울·공항 3·충전기 2)
- [apps/friendly/src/modules/parking/parking.service.ts](../../apps/friendly/src/modules/parking/parking.service.ts) — 상태(`evStatusAt` 공유)·점/셀(map-cells·바이트 상한 LRU)·주변·상세·공항·맛집 리뷰 주차 집계
- [apps/friendly/src/modules/parking/ev-master.service.ts](../../apps/friendly/src/modules/parking/ev-master.service.ts) — 충전기 전량 페이징·충전소 단위 접기·전량 교체
- [apps/friendly/src/modules/parking/ev-status.service.ts](../../apps/friendly/src/modules/parking/ev-status.service.ts) — 10분 상태 폴러·`UPDATE … FROM`·충전소 칸 재집계·`onApplied`
- [apps/friendly/src/modules/parking/ev.service.ts](../../apps/friendly/src/modules/parking/ev.service.ts) — 충전소 점/셀(map-cells, `availableOnly` 는 `statusAt` 키)·주변(2단계)·상세·`getStatusAt` 1분 메모·`noteStatusAt`
- [apps/friendly/src/modules/parking/parking.route.ts](../../apps/friendly/src/modules/parking/parking.route.ts) — GET 9개, `onListen`/`onClose` 폴러 수명, `RATE.parkingRead`, `POLLED_CACHE_CONTROL`, 폴러 → EvService 메모 배선
- [apps/friendly/src/modules/parking/parking.test.ts](../../apps/friendly/src/modules/parking/parking.test.ts) — 9건(격리 DB — 503·주차장·충전소·공항·셀 상한/32타일·상태 시각 공유·Cache-Control·리뷰·폴러 이력)
- [apps/friendly/src/lib/map-cells.ts](../../apps/friendly/src/lib/map-cells.ts) — `cellGrid`(셀 6,000 상한·국내 clamp)·`pointsSpanOk`(32타일)·`cellKeyOf`·`cellResultSize`·`CELL_CACHE_MAX_UNITS`(일상지도·집값 공유)
- [apps/friendly/src/lib/map-cells.test.ts](../../apps/friendly/src/lib/map-cells.test.ts) — 6건(공용 헬퍼)
- [apps/friendly/src/app.ts](../../apps/friendly/src/app.ts) — `TRUSTED_RESPONSE_ROUTES`(lots/ev points 200 운영 `JSON.stringify`, X-6)

### friendly — 스크립트·DB·설정·연결
- [apps/friendly/scripts/load-parking-lots.ts](../../apps/friendly/scripts/load-parking-lots.ts) — `--sources=std,seoul,kotsa`·`--std-json`·`--kotsa-dump`·`--kotsa-json`·`--kotsa-codes`·`--dry-run`(겹침 미리보기)·`--offline`·`--max-calls`, KOTSA 순차 수집·지오코딩·대표 좌표·겹침·교체, 코드 22 초당/일 한도 안내
- [apps/friendly/scripts/load-ev-chargers.ts](../../apps/friendly/scripts/load-ev-chargers.ts) — `--dry-run`·`--zcode`·`--max-pages`
- [apps/friendly/scripts/parking-status.ts](../../apps/friendly/scripts/parking-status.ts) — `ok lots=… kotsa=… chargers=…` / `missing` 한 줄
- [apps/friendly/scripts/export-openapi.ts](../../apps/friendly/scripts/export-openapi.ts) — `app.ready()` 만(listen 없음) → 폴러 미기동
- [apps/friendly/prisma/schema.prisma](../../apps/friendly/prisma/schema.prisma) — `ParkingLot`(머리 주석 KOTSA 미갱신)·`ParkingOccupancyStat`·`ParkingSync`·`EvStation`(커버링 인덱스)·`EvCharger`
- [apps/friendly/prisma/migrations/20260925071552_add_parking/migration.sql](../../apps/friendly/prisma/migrations/20260925071552_add_parking/migration.sql) — 5표 + 인덱스 4
- [apps/friendly/prisma/migrations/20261005030000_ev_station_covering_index/migration.sql](../../apps/friendly/prisma/migrations/20261005030000_ev_station_covering_index/migration.sql) — `ev_stations_lat_lng_idx` DROP → `(lat,lng,availableCount,hasFast,parkingFree,limited)` 생성(E-5)
- [apps/friendly/src/config/env.ts](../../apps/friendly/src/config/env.ts) — `PARKING_LIVE_CRON`·`EV_STATUS_CRON`, data.go.kr 원천 주석(KOTSA 추가), `SEOUL_OPEN_API_KEY`(주석 미갱신)
- [apps/friendly/.env.example](../../apps/friendly/.env.example) — 주차 원천·쿼터 설명(KOTSA 심의승인·≈470콜·일 1만), 두 cron 기본값, `SEOUL_OPEN_API_KEY` 줄 신설
- [apps/friendly/src/plugins/prisma.ts](../../apps/friendly/src/plugins/prisma.ts) — 모든 연결 busy_timeout 30초(`socket_timeout`·`connection_limit`) — 적재 락 동안 서버 쓰기 대기 한도
- [apps/friendly/src/plugins/rate-limit.ts](../../apps/friendly/src/plugins/rate-limit.ts) — `RATE.parkingRead` 240/분, 전역 1000/분
- [apps/friendly/package.json](../../apps/friendly/package.json) — `load:parking-lots`·`load:ev-chargers`·`status:parking`
- [apps/friendly/vitest.config.ts](../../apps/friendly/vitest.config.ts) — `hookTimeout` 60초(`5d7b686`)
- [apps/friendly/src/test-utils/temp-db.ts](../../apps/friendly/src/test-utils/temp-db.ts) — dev.db 복사 후 비우는 격리 DB
- [apps/friendly/src/lib/reply-upstream-error.ts](../../apps/friendly/src/lib/reply-upstream-error.ts) — 503/404 직접 응답
- [apps/friendly/src/modules/bus/bus-api.adapter.ts](../../apps/friendly/src/modules/bus/bus-api.adapter.ts) — `toServiceKeyPart`
- [apps/friendly/src/modules/life-map/life-map-geocode.service.ts](../../apps/friendly/src/modules/life-map/life-map-geocode.service.ts) — `geocodeLifeRows`·`LifeGeocodeCache`
- [apps/friendly/src/modules/life-map/data/life-geocode-cache.json.gz](../../apps/friendly/src/modules/life-map/data/life-geocode-cache.json.gz) — 지오코딩 캐시 압축본(`7ff7f1de` 재내보내기 107,161건 — 서울 구영·KOTSA 주소 포함)
- [apps/friendly/src/modules/settings/map.service.ts](../../apps/friendly/src/modules/settings/map.service.ts) — `MapSettingsService.getSecret`(DB 우선 + env 폴백)
- [apps/friendly/src/modules/restaurant/canonical-members.ts](../../apps/friendly/src/modules/restaurant/canonical-members.ts) — `resolveCanonicalMembersByPlaceId`(공개 멤버 규칙)
- [apps/friendly/src/modules/review-search/retrieval.ts](../../apps/friendly/src/modules/review-search/retrieval.ts) — `ASPECTS` 9관점('주차' 포함)
- [apps/friendly/src/modules/review-search/review-search.service.ts](../../apps/friendly/src/modules/review-search/review-search.service.ts) — enrich 가 `ReviewSummary.aspectsJson` 기록
- [apps/friendly/src/modules/summary/summary.service.ts](../../apps/friendly/src/modules/summary/summary.service.ts) — 요약 프롬프트의 `tips`(예시 "주차 협소")
- [apps/friendly/src/modules/housing/housing.route.ts](../../apps/friendly/src/modules/housing/housing.route.ts) — 비교: 스케줄러를 `onReady` 에서 시작

### 계약·공통
- [packages/api-contract/src/schemas/parking.ts](../../packages/api-contract/src/schemas/parking.ts) — 쿼리(`FlagParam`·bbox)·점/셀·항목(id 주석에 `kotsa:`)·상세·패턴·충전소·공항·상태(`bySource.kotsa`)·리뷰 집계
- [packages/api-contract/src/routes.ts](../../packages/api-contract/src/routes.ts) — `Routes.Parking`(9경로, 일상지도 주석 위치 어긋남, "표준데이터+서울" 주석 미갱신)
- [packages/api-contract/src/index.ts](../../packages/api-contract/src/index.ts) — `schemas/parking.js` export
- [packages/utils/src/parking.ts](../../packages/utils/src/parking.ts) — 코드표·운영시간·요금 추정·혼잡 단계·충전기 코드·공항 14곳·이름 정규화
- [packages/utils/src/parking.test.ts](../../packages/utils/src/parking.test.ts) — 14건
- [packages/utils/src/parkingMarker.ts](../../packages/utils/src/parkingMarker.ts) — P·번개·비행기 마커, 셀 버블
- [packages/utils/src/lifeMap.ts](../../packages/utils/src/lifeMap.ts) — `LIFE_CELL_ORIGIN`·`lifeCellSizeDeg`·`lifeCountBucket`·`formatLifeCount`
- [packages/utils/src/markerFrame.ts](../../packages/utils/src/markerFrame.ts) — 26px 원 / 32×48 핀 프레임
- [packages/utils/src/geo.ts](../../packages/utils/src/geo.ts) — `roundCoord`(소수 5자리 — 주차 페이지 딥링크)
- [packages/utils/src/index.ts](../../packages/utils/src/index.ts) — `parking.js`·`parkingMarker.js` export
- [packages/shared/src/api/parking.api.ts](../../packages/shared/src/api/parking.api.ts) — `parkingApi` 9함수, 필터 키, points·nearby 의 `init.signal`
- [packages/shared/src/hooks/useParking.ts](../../packages/shared/src/hooks/useParking.ts) — 훅 9개(staleTime 2분·5분 refetch·placeholder, points `gcTime` 60초, `signal` 전달)
- [packages/shared/src/index.ts](../../packages/shared/src/index.ts) — api·hooks export

### 웹
- [apps/web/src/routes/ParkingPage.tsx](../../apps/web/src/routes/ParkingPage.tsx) — 저장 위치 대기 게이트(`ParkingPage` → `ParkingPageBody`)·URL 상태·진입 중심·탭별 조회·레이아웃 분기·시트
- [apps/web/src/routes/ParkingPage.test.tsx](../../apps/web/src/routes/ParkingPage.test.tsx) — 8건(+ 오버레이 참조·저장 위치 대기 2)
- [apps/web/src/components/parking/ParkingMapView.tsx](../../apps/web/src/components/parking/ParkingMapView.tsx) — `MapCanvas poolKey 'parking'`·오버레이·키 게이트
- [apps/web/src/components/parking/parkingMarkers.ts](../../apps/web/src/components/parking/parkingMarkers.ts) — 마커 id 규약·아이콘 캐시·라벨 규칙, 셀 버블 `perMarker`
- [apps/web/src/components/parking/ParkingTabBar.tsx](../../apps/web/src/components/parking/ParkingTabBar.tsx) — 탭 3 + 필터 칩(`section` 분할)
- [apps/web/src/components/parking/ParkingLists.tsx](../../apps/web/src/components/parking/ParkingLists.tsx) — 주변 주차장·충전소·공항 목록
- [apps/web/src/components/parking/ParkingDetails.tsx](../../apps/web/src/components/parking/ParkingDetails.tsx) — 주차장·충전소·공항 상세, `PatternChart`
- [apps/web/src/components/parking/ParkingFooter.tsx](../../apps/web/src/components/parking/ParkingFooter.tsx) — 범례·적재 상태(교통안전공단 수는 0 보다 클 때만)·출처
- [apps/web/src/components/parking/ParkingFooter.test.tsx](../../apps/web/src/components/parking/ParkingFooter.test.tsx) — 2건(교통안전공단 칸·출처 / 0 이면 생략)
- [apps/web/src/components/parking/parkingFormat.ts](../../apps/web/src/components/parking/parkingFormat.ts) — 문구 헬퍼·네이버 자동차 길찾기 URL
- [apps/web/src/stores/parkingPrefsStore.ts](../../apps/web/src/stores/parkingPrefsStore.ts) — `lp:parking-prefs` v1
- [apps/web/src/components/restaurant/detail/ParkingSection.tsx](../../apps/web/src/components/restaurant/detail/ParkingSection.tsx) — `ParkingNearbySection`(좌표 null 허용)·`ParkingSummaryLine`(`onOpen`·`enabled` 선택)
- [apps/web/src/components/restaurant/detail/ParkingSection.test.tsx](../../apps/web/src/components/restaurant/detail/ParkingSection.test.tsx) — 5건(+ 좌표 없는 식당 2 · `enabled=false` 1)
- [apps/web/src/components/restaurant/detail/TransitTab.tsx](../../apps/web/src/components/restaurant/detail/TransitTab.tsx) — '가는 법' 세 번째 섹션, 좌표 없으면 안내 + 리뷰 주차 정보(`008e0081`)
- [apps/web/src/components/restaurant/detail/HomeTab.tsx](../../apps/web/src/components/restaurant/detail/HomeTab.tsx) — 영업 정보 한 줄, `availableTabs`, `useInViewOnce` → `enabled`
- [apps/web/src/components/restaurant/detail/useInViewOnce.ts](../../apps/web/src/components/restaurant/detail/useInViewOnce.ts) — 한 번 화면에 들어오면 true(주차 한 줄 조회 시점)
- [apps/web/src/App.tsx](../../apps/web/src/App.tsx) — `/parking` lazy 라우트
- [apps/web/src/components/PublicSidebar.tsx](../../apps/web/src/components/PublicSidebar.tsx) — NAV '주차'(`SquareParking`)
- [apps/web/src/components/PublicTopBar.tsx](../../apps/web/src/components/PublicTopBar.tsx) — NAV '주차'
- [apps/web/src/components/restaurant/MapCanvas.tsx](../../apps/web/src/components/restaurant/MapCanvas.tsx) — `poolKey` 인스턴스 풀(상한 3)
- [apps/web/src/components/restaurant/mapMarkerSync.ts](../../apps/web/src/components/restaurant/mapMarkerSync.ts) — 마커 id 차분 갱신(`eb24c6e5`)
- [apps/web/src/components/restaurant/mapIconRaster.ts](../../apps/web/src/components/restaurant/mapIconRaster.ts) — 공유 아이콘 사전 래스터화(`perMarker` 는 제외)
- [apps/web/src/components/life-map/LifeGoToBox.tsx](../../apps/web/src/components/life-map/LifeGoToBox.tsx) — 지역 이동 옴니박스(재사용)
- [apps/web/src/components/sheet/useMapSheets.ts](../../apps/web/src/components/sheet/useMapSheets.ts) — `SHEET_PEEK_HEIGHT`·`sheetHalfInset`·시트 조율

### 문서·운영
- [docs/PLAN-parking.md](../../docs/PLAN-parking.md) — 결정 5·원천 7·호출량·구조·차수 6·§KOTSA(결정 변경·실측·좌표 정리·실시간 안 쓰는 이유·후속)·§요금 정리·등록 차량 전용·함정 4
- [docs/PLAN-perf-2.md](../../docs/PLAN-perf-2.md) — 2차(E-V1)·4차(E-5·E-9·E-10)·모듈 묶음 maps(충전소 필터 403~610 → 66~124ms)·X-6·메모리 배터리(충전소 z22 4.9MB → 29KB)
- [docs/PLAN-perf-2-findings.md](../../docs/PLAN-perf-2-findings.md) — E-V1·E-5·E-9·E-10 발견 원문(측정·수정안)
- [docs/api/endpoints.md](../../docs/api/endpoints.md) — `## parking` 9행, 192개(공개 83)
- [docs/api/openapi.json](../../docs/api/openapi.json) — 주차 9경로(`x-auth public`, `x-rate-limit` 8)
- [docs/api/README.md](../../docs/api/README.md) — §6 주차 절(`007ac899`, 비정상 요금 `null` `36f07eb3`), §5 한도·§7 출처엔 아직 없음
- [docs/data-sources.md](../../docs/data-sources.md) — 주차 원천 없음
- [deploy.sh](../../deploy.sh) — `parking_status`(`kotsa=`)·`parking_data`(`kotsa=0` 재적재)·케이스 1/2/4 체인·메뉴 9(`analyze_db`)
