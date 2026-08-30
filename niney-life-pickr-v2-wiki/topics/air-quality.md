---
topic: air-quality
last_compiled: 2026-08-30
sources_count: 87
status: active
aliases: [대기정보, 대기질, 공기질, 에어코리아, ArpltnInforInqireSvc, MsrstnInfoInqireSvc, 15073861, 15073877, 통합대기환경지수, CAI, khaiGrade, 미세먼지, PM2.5, 측정소정보, 대기질예보, AirQualityService, AirKoreaApiAuthError, useAirNearbyStations, useAirLocation, airLocationStore, AirUserLocation, air_user_locations, 내-위치, MyLocationChip, MyLocationCard, useMyLocationGlance, probe:airkorea, AIRKOREA_API_KEY, dmX-dmY, 전남광주]
---

# air-quality — 에어코리아 대기정보(측정·예보·측정소 지도) + 내 위치 저장·상단바/홈 칩

**2026-08-21~08-30 신설 — 에어코리아 5+1 오퍼레이션 프록시 → 웹 `/air` → 내 위치 저장·통합 칩 → 앱 합류**: 한국환경공단 에어코리아 대기오염정보 API(data.go.kr 15073861, `ArpltnInforInqireSvc`) 5개 오퍼레이션을 friendly 가 프록시하고 웹 `/air` 가 한 화면에 전부 펼치는 "예시 페이지"로 시작했다(`7340743`, 전 계층 44파일). 이 API 엔 측정소 좌표가 없어 별도의 측정소정보 API(15073877, `MsrstnInfoInqireSvc`)를 붙여 지도·검색·내 주변을 서버 24시간 캐시 위에서 로컬 계산한다(`c6ac640` — 신청 전엔 합성 픽스처, 승인 뒤 실응답 673개소 발췌 픽스처 `638a572`). 좌표 1곳을 **내 대기 위치**로 저장(게스트 로컬 persist / 로그인 서버 1행 하이브리드, `a4284aa`)해 모든 공개 페이지 상단바에 가장 가까운 측정소의 등급 칩을 띄우고, 통합지수 결측 시 PM2.5→PM10 폴백(`4d35a57`)·공용 측위 훅의 간헐 TIMEOUT 수정(`67f14cf`)·'선택 측정소 저장'(`aa3a09e`)·10분 조용한 갱신(`26947ba`)을 거쳐 날씨와 합쳐진 통합 알약 [MyLocationChip](../../apps/web/src/components/weather/MyLocationChip.tsx)이 됐다(`9e197d3`, `AirLocationChip` 삭제). 저장 단위는 날씨 페이지와 통일돼 source `place` 가 추가되고 '지도에서 직접 지정'(`manual`) UI 는 제거됐으며(`7704f8c`), 상단바 폭 예산 정리로 `<sm` 축약 표기·측정값 없음 시 대기 세그먼트 생략이 들어갔다(`a062e7d`). 2026-08-22 **앱**에 `/air` 화면·홈 `MyLocationCard`(`e348032`, 공용 파생 훅 `useMyLocationGlance` 승격), 측정소 지도·30/90일 등급 막대(`563890a`), 24시간 띠 축 라벨 수정(`5f5f0e3`)이 더해져 2026-08-17 경의 "앱 연동은 제외" 결정이 뒤집혔다. 날씨 절반(기상청)은 [weather](weather.md), 일상지도는 [life-map](life-map.md).

## Purpose [coverage: high — 9 sources]

세 가지를 제공한다. (1) **대기정보 화면** — 웹 `/air`([AirQualityPage](../../apps/web/src/routes/AirQualityPage.tsx))·앱 `/air`([app/air/index.tsx](../../apps/mobile/app/air/index.tsx)): 선택 측정소의 지금(통합대기환경지수 CAI 히어로 + 6항목 타일 + 24시간 등급 띠), 24시간/30일/90일 추이, 시도 측정소 현황·전국 시도 비교, 나쁨 이상 측정소, 대기질 예보통보(PM10/PM2.5/O3 × 오늘·내일·모레 19권역), 초미세먼지 주간예보(D+3~D+6), 등급 기준·출처. (2) **측정소 지도·내 주변·검색** — 전국 측정소 좌표에 현재 CAI 등급색 마커, 측정소명/주소 검색, 좌표 기준 가까운 측정소(현재 측정값 조인). (3) **내 위치(저장 지점)** — 사용자가 고른 좌표 1곳을 저장하고 웹 상단바 [MyLocationChip](../../apps/web/src/components/weather/MyLocationChip.tsx)·앱 홈 [MyLocationCard](../../apps/mobile/src/components/home/MyLocationCard.tsx)가 그 지점의 날씨(기온·상태·우산)와 공기(등급·PM2.5)를 상주 표시한다. 이 저장 위치는 대기 전용이 아니라 **날씨 페이지·일상지도·식단 추천(날씨 결합)이 함께 읽는 단일 원천**이다 — `useAirLocation` 소비자: 웹 [WeatherPage](../../apps/web/src/routes/WeatherPage.tsx)·[LifeMapPage](../../apps/web/src/routes/LifeMapPage.tsx)·[MealRecommendTab](../../apps/web/src/routes/meal/MealRecommendTab.tsx), 앱 `weather/index.tsx`·`life-map/index.tsx`.

설계를 관통하는 제약은 두 가지다. **개발계정 일 500건 쿼터**(서비스 기본 한도 450) — 시도별은 '전국' 1콜을 캐시해 17개 시도 팬아웃을 1콜로 접고, 측정소 좌표는 24시간 캐시, 모든 키가 TTL 캐시 + in-flight 합류 + last-known stale 폴백 위에 있어 페이지 1회 로드 ≈ 5콜, 이후 TTL 동안 0콜. **업스트림 실측 결함 흡수** — 2026-07 광주·전남 행정통합으로 `sidoName` 이 `'전남광주'` 합본이고 개별 '광주' 조회가 게이트웨이 타임아웃을 내는 것, `InformCode` 필터 무시, 자정 `"24:00"` 표기, 결측 `"-"`/`null`/`'통신장애'` Flag 혼재, 첫 호출 ~절반의 504 SERVICETIMEOUT 을 전부 서버가 정규화한다. 접근 정책은 버스/지하철과 같다: 조회 8라우트는 **비로그인 공개**(분당 60 레이트리밋), 내 위치 서버 저장분만 Bearer 인증. 키가 비면 503 으로 기능이 꺼진다.

## Architecture [coverage: high — 30 sources]

```
웹 /air  AirQualityPage (sido/station/term/code URL 동기화)      앱 /air  app/air/index.tsx (Stack 화면, 선택은 로컬 state)
  ① 지금  AirStationHero + AirHourStrip                             AirStationBar(측정소 탭→AirStationPicker 모달 · GPS · 내 위치 저장 · 새로고침)
  ②-a 측정소 지도·내 주변  AirNearbySection ▸ AirStationsMap        ① AirNowCard + AirHourStrip | AirDailyStrip(30/90일 등급 막대)
  ② 추이  AirHistoryChart(SVG, 표 쌍둥이)  ③ 시도 현황 AirSidoTable   ②-a AirStationsMapCard(TransitMapView WebView)  ② AirNearbyCard
  ④ 전국 비교 AirSidoCompare  ⑤ 나쁨 이상 AirBadStations              ③ AirForecastCard ④ AirWeeklyCard ⑤ AirBadStationsCard ⑥ AirSidoCompareCard
  ⑥ 예보 AirForecastSection  ⑦ 주간예보 AirWeeklySection  ⑧ AirLegend
상단바 MyLocationChip ══════ useMyLocationGlance(공용 파생값) ══════ 앱 홈 MyLocationCard
        │                                                              │
  @repo/shared  useAirQuality.ts(훅 8) · useAirLocation.ts(하이브리드) · airLocationStore.ts(게스트 persist, 주입형 storage)
                air-quality.api.ts(8) · air-location.api.ts(3) · useUserLocation.ts(웹 측위)   [앱은 useUserLocationNative]
  @repo/utils   airQuality.ts(CAI 구간표·파서·시도 어휘·이미지 라벨러) · airMarker.ts(등급색 마커 SVG 10종 + 저장 위치 보라 점)
        │  ↕ @repo/api-contract  schemas/air-quality.ts · routes.ts(Routes.AirQuality 9)
        ▼
  friendly  air-quality.route.ts(공개 GET 8, RATE.transitRealtime) / air-location.route.ts(인증 GET·PUT·DELETE)
            air-quality.service.ts(키 단위 TTL 캐시 · in-flight 합류 · stale 폴백 · Asia/Seoul 일일 쿼터) / air-location.service.ts(Prisma upsert 1행)
            airkorea-api.adapter.ts(callAirKoreaApi + callAllPages + 타입드 래퍼 6)
        ▼
  https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/<op>?serviceKey=…&returnType=json   (대기오염정보 15073861, 5 op)
  https://apis.data.go.kr/B552584/MsrstnInfoInqireSvc/getMsrstnList                        (측정소정보 15073877, 별도 활용신청)
```

### 외부 API 6종 — 엔드포인트·캐시·쿼터

| 서비스 | 오퍼레이션 (파라미터) | 서비스 캐시 키 · TTL / stale 상한 | 쿼터 소비 | 라우트 |
|---|---|---|---|---|
| 대기오염정보 15073861 | `getCtprvnRltmMesureDnsty` (`sidoName=전국 ver=1.5 numOfRows=1000`) — 673개소·≈340KB 1페이지 | `sido:전국` · 10분 / 3시간 | 1 (요청 시도 무관 — 서버가 `airSidoMatches` 로 거른다) | `GET /air/sido/:sidoName` |
| | `getMsrstnAcctoRltmMesureDnsty` (`stationName dataTerm=DAILY\|MONTH\|3MONTH ver=1.5`) | `station:<NFC명>:<term>` · 10분 / 3시간 | DAILY·MONTH 1, **3MONTH 3**(≈2,200행 = 3페이지, `MAX_PAGES=3` 초과분 절단) | `GET /air/stations/:stationName/history?term=` |
| | `getUnityAirEnvrnIdexSnstiveAboveMsrstnList` | `bad-stations` · 10분 / 3시간 | 1 | `GET /air/bad-stations` |
| | `getMinuDustFrcstDspth` (`searchDate ver=1.1 numOfRows=100`, InformCode 미전송) | `forecast:<date>` 또는 `forecast:auto:<KST오늘>` · 20분 / 24시간 | 1 (+ 자동 모드에서 당일 0건이면 전일 폴백 1) | `GET /air/forecast?date=` |
| | `getMinuDustWeekFrcstDspth` (`searchDate numOfRows=10`) | `weekly:<date>` / `weekly:auto:<KST오늘>` · 60분 / 24시간 | 1 (+ 전일 폴백 1) | `GET /air/forecast/weekly?date=` |
| 측정소정보 15073877 | `getMsrstnList` (파라미터 없음) — 673개소 1페이지 | `stations` · **24시간 / 7일** | 1 | `GET /air/stations`, `/air/stations/nearby`, `/air/stations/search` 가 전부 이 캐시 위에서 로컬 계산(업스트림 0콜) |

상수는 [air-quality.service.ts](../../apps/friendly/src/modules/air-quality/air-quality.service.ts) 상단: `AIR_MEASURE_TTL_MS=10분`·`AIR_MEASURE_STALE_MAX_MS=3h`·`AIR_FORECAST_TTL_MS=20분`·`AIR_WEEKLY_TTL_MS=60분`·`AIR_FORECAST_STALE_MAX_MS=24h`·`AIR_STATIONS_TTL_MS=24h`·`AIR_STATIONS_STALE_MAX_MS=7d`·`AIR_STATION_SEARCH_MAX=30`·`DEFAULT_DAILY_UPSTREAM_LIMIT=450`.

### 어댑터 — 봉투 해석·재시도·키 마스킹

[airkorea-api.adapter.ts](../../apps/friendly/src/modules/air-quality/airkorea-api.adapter.ts)는 두 서비스가 같은 봉투(`response.header.resultCode` + `body.items`)와 같은 게이트웨이 오류 모델(`OpenAPI_ServiceResponse.cmmMsgHeader.returnReasonCode`)을 쓰므로 `callAirKoreaApi(op, params, opts, base)` 하나에 base URL 만 분기한다. 실측(프로브 2026-08-21) 기반 규칙:
- **serviceKey 이중 인코딩 함정** — data.go.kr Encoding 키(`%XX`)를 `URLSearchParams` 에 넣으면 30 에러. 버스 어댑터의 [toServiceKeyPart](../../apps/friendly/src/modules/bus/bus-api.adapter.ts)를 그대로 import 해 첫 파라미터로 붙이고, 로깅용 `requestUrl` 은 `serviceKey=***` 마스킹본만 보관·`scrubKey` 로 예외 메시지의 평문 키도 봉인.
- **게이트웨이 코드 분류** — `20/21/22/30/31/32/33`(키 미등록·권한·일일한도) → `AirKoreaApiAuthError`(**503**, 우리 측 설정 이슈); `04/05`(HTTP_ERROR/SERVICETIMEOUT) 및 HTTP 5xx·5xx JSON 파싱 실패 → **1회 재시도**(700ms 뒤) 후 `AirKoreaApiError`(502). `resultCode '03'` NODATA 는 빈 결과. 데이터 없음은 원래 200 + `totalCount 0`.
- **타임아웃 20초**(`FETCH_TIMEOUT_MS`, 버스/지하철 10초의 2배) — 게이트웨이 자체 504 가 ~10초 뒤에 오므로 10초로 끊으면 재시도 기회조차 없다. caller 가 `signal` 을 주면 자체 타이머를 만들지 않는다(라이브 테스트는 25초).
- `callAllPages` 가 `totalCount` 까지 `numOfRows=1000` 페이지를 이어 받되 `MAX_PAGES=3` 에서 절단(쿼터 보호). 원시 행은 전부 문자열 그대로(`RawAirMeasureRow` 29키, 결측 `"-"` 포함) — 정규화는 서비스 몫.

### 서비스 — 캐시 골격과 정규화

버스/지하철 실시간 캐시 골격 이식(측정 주기에 맞춰 TTL 만 길다). `cached(key, ttl, staleMax, load)`: TTL 내 히트는 `fetchedAt` 보존 → 미스 시 stale 상한을 넘긴 엔트리만 청소(만료 엔트리는 stale 재료로 남긴다) → 같은 키 in-flight 가 있으면 합류 → `loadInto` 가 `consumeQuota` 후 호출, 실패하면 staleMax 내 last-known 을 `stale:true` 로. 쿼터는 모든 오퍼레이션이 공유하는 단일 메모리 카운터(`{dateKey, count}`, `Intl.DateTimeFormat('en-CA', Asia/Seoul)` 로 KST 날짜 경계), 초과면 소비 없이 503 throw(캐시 레이어가 catch 해 stale 폴백). 정규화: `toMeasureItem`(문자열 → 숫자/등급 1~4/Flag), `foldDaily`(MONTH·3MONTH 를 `dataTime` 날짜 기준 일평균 — `"24:00"` 행이 전일에 묶여 에어코리아 01~24시 관행과 일치, 결측 제외, 항목별 반올림 자릿수), `toForecastItems`(코드 필터 PM10/PM25/O3 + 최신 발표 → 코드 → 대상일 정렬 + `parseAirDustImage` 로 imageUrl1~9 유효 슬롯만), `toWeeklyResult`(`frcstOne~Four` → 날짜 오름차순 + `splitAirReliability`), **`toStationInfoItem`** — 아래 좌표 판정.

### 좌표 축 판정 — 필드명 불신(dmX/dmY)

측정소정보 문서는 `dmX`=위도, `dmY`=경도라 하지만 과거 버전은 TM 좌표였고 축이 뒤집힌 사례도 있어 **값 범위로 재판정**한다: `(dmX, dmY)` 가 (33~39, 124~132) 면 lat/lng, 뒤집혀 있으면 교정, 둘 다 아니면 `null`(지도엔 안 그리고 목록엔 남는다). 계약 `AirStationInfoItem.lat/lng` 도 같은 범위를 zod 로 강제(`z.number().min(33).max(39)` / `min(124).max(132)`). 승인 후 실측(`638a572`, 673개소)은 문서대로 dmX 위도·dmY 경도 WGS84 였고 `stationCode` 키는 오지만 **전부 null** — 그래서 실응답 발췌 [msrstn-list.json](../../apps/friendly/src/modules/air-quality/__fixtures__/msrstn-list.json)과 축 뒤집힘(과천시청)·결측 `"-"`(이도동)을 일부러 넣은 합성 [msrstn-list.synthetic.json](../../apps/friendly/src/modules/air-quality/__fixtures__/msrstn-list.synthetic.json)을 둘 다 유지한다. 업스트림의 근접측정소(TM 좌표 입력) 오퍼레이션과 proj4 변환은 쓰지 않는다 — 전량 캐시 + `haversineM` 로컬 계산이 쿼터 0 이고 더 단순하다. 라이브 스모크가 승인 후 첫 50행의 축을 검증한다.

### 내 위치 — 저장 지점 하나가 날씨·대기를 함께 구동

[useAirLocation](../../packages/shared/src/hooks/useAirLocation.ts)이 단일 인터페이스(`location / isLoading / isSaving / save / clear`)로 웹·앱 공용: 게스트(`!token`)는 [airLocationStore](../../packages/shared/src/stores/airLocationStore.ts)(zustand persist `air-location-v1`, [injectableStorage](../../packages/shared/src/stores/injectableStorage.ts) 주입형 — 웹 localStorage 자동, 앱은 [api-setup.ts](../../apps/mobile/src/lib/api-setup.ts)에서 `setAirLocationStorage(AsyncStorage)`), 로그인은 서버 `GET/PUT/DELETE /air/location` 을 React Query(`['air','location']`, staleTime 60s)로. **병합은 union 이 아니라 서버 우선** — 값이 1개라 로그인 직후 서버 조회 성공 && 서버 비어 있음 && 게스트 값 있음일 때만 PUT 1회(성공 시 게스트 clear, 실패 시 로컬 유지·재시도, 서버에 값이 있으면 게스트 값은 버리지 않고 둬 로그아웃 시 복귀). 별도 sync 라우트 없음.

저장 단위는 **좌표(지점) + 표시 라벨 + source**이고 "가장 가까운 측정소"는 저장하지 않는다 — 조회 때마다 `/air/stations/nearby?limit=1&radius=50000` 으로 해석해 측정소 신설·폐지에 자동 대응한다. source 어휘 `AIR_LOCATION_SOURCES = ['geolocation','manual','station','place']`: `geolocation` = GPS 좌표(라벨은 가까운 측정소명 또는 앱은 가까운 날씨 지점명), `station` = 선택 측정소 좌표 그대로(거리 0m 라 항상 그 측정소로 해석), `place` = 날씨 페이지의 시·군·구 지점, `manual` = 제거된 '지도에서 직접 지정' 호환용. [useMyLocationGlance](../../packages/shared/src/hooks/useMyLocationGlance.ts)가 이 위치 하나로 `useWeatherNowcast(latLngToKmaGrid)` + `useAirNearbyStations(limit 1, 50km)` 를 묶어 `{ location, label, weather{tempC, condition, wet, popMax, ncstHour…}, air{grade, gradeSource, pm10, pm25, station, ok} }` 파생값을 내고, 웹 칩과 앱 카드는 문구·링크·색만 맡는다. 대기 등급은 `khaiGrade → pm25Grade → pm10Grade` 순 폴백(`gradeSource` 로 출처 표기), 측정소는 있어도 측정값이 없으면 `ok=false` 로 세그먼트 자체를 뺀다("● -" 금지). `GLANCE_RAIN_POP_THRESHOLD=60`, `GLANCE_AIR_RADIUS_M=50_000`.

### 웹 화면

[AirQualityPage](../../apps/web/src/routes/AirQualityPage.tsx)는 URL(`?sido&station&term&code`)이 유일한 진실(버스/지하철 규율 — `setSearchParams` 함수형 1회·replace). URL 에 시도·측정소가 없으면 저장 위치의 가장 가까운 측정소(`useAirNearbyStations(limit 1, 50km)` → `airSidoMatches` 로 시도 옵션 역산)로, 그것도 없으면 `'서울'` 첫 측정소. 차트 항목·전국 비교 항목은 공유 가치가 낮아 로컬 state. 섹션 8개는 [AirSection](../../apps/web/src/components/air/AirPrimitives.tsx)이 **원천 오퍼레이션명 eyebrow**(예: `getMsrstnAcctoRltmMesureDnsty · 측정소별 실시간 측정정보`)를 달아 "어느 API 에서 나왔나"를 사실로 적는다. 페이지 서명 요소는 [AirHourStrip](../../apps/web/src/components/air/AirHourStrip.tsx)(PM10·PM2.5·O₃ 3행 × 24칸 등급색 띠, 날짜 경계선, 라벨은 날짜 시작 칸에 M/D·그 외 H시). [AirHistoryChart](../../apps/web/src/components/air/AirHistoryChart.tsx)는 인라인 SVG(라이브러리 없음, 단일 축 — PM10·PM2.5 만 2계열, 나머지는 단일 계열 + 보통/나쁨 경계 점선), ResizeObserver 로 픽셀 폭, 1/2/2.5/5×10ᵏ 눈금, 호버 크로스헤어 + ←/→ 키보드 + `<details>` 표 쌍둥이. 색은 [airGrade.ts](../../apps/web/src/components/air/airGrade.ts)(Tailwind 클래스 `dot/tint/ink` + `@repo/utils AIR_GRADE_HEX`)와 [tailwind.css](../../apps/web/src/styles/tailwind.css)의 `--air-series-1/2`(라이트 `#2a78d6/#eb6834`, 다크 `#3f86dc/#de6f3f` — 날씨 페이지가 기온/강수색으로 재사용). [AirNearbySection](../../apps/web/src/components/air/AirNearbySection.tsx)은 위치를 **버튼을 눌렀을 때만** 요청(`useUserLocation({ auto:false })`), 검색 250ms 디바운스(상위 8건 표시), 내 주변 반경 20km·5곳(기준점: 이번 GPS > 저장 지점), 내 위치 카드('선택 측정소 저장' / '현재 위치(GPS) 저장' / 해제, 이미 저장된 측정소면 '저장됨'), 활용신청 전(503 + 메시지에 `30`)은 [AirStationsErrorBlock](../../apps/web/src/components/air/AirNearbySection.tsx)이 키 설정이 아니라 **활용신청 안내**로 분기. [AirStationsMap](../../apps/web/src/components/air/AirStationsMap.tsx)은 [MapCanvas](../../apps/web/src/components/restaurant/MapCanvas.tsx)에 `poolKey="air"`·`overlayMarkers`(내 위치 파란 점·저장 위치 보라 점, fit 제외)·등급×선택 10종 아이콘을 모듈 레벨에서 미리 만들어(OL 아이콘 캐시) 673개 마커, 라벨은 선택·내 주변만(전부 라벨은 과밀), 한반도 남부 중심 줌 7 → 선택 시 줌 11. 네비는 [PublicSidebar](../../apps/web/src/components/PublicSidebar.tsx)·[PublicTopBar](../../apps/web/src/components/PublicTopBar.tsx)의 '대기질'(날씨 뒤, `d18b1e9`), 라우트는 [App.tsx](../../apps/web/src/App.tsx)의 lazy `/air`.

### 앱 화면

[app/air/index.tsx](../../apps/mobile/app/air/index.tsx)는 탭이 아니라 Stack 화면('대기정보', 홈 카드에서 진입 — 탭을 늘리지 않는 홈 허브 결정). 데이터 훅·등급 규칙은 shared/utils 공용이고 화면만 세로 카드: [AirStationBar](../../apps/mobile/src/components/air/AirStationBar.tsx)(측정소 탭 → [AirStationPicker](../../apps/mobile/src/components/air/AirStationPicker.tsx) 모달 = 시도 칩 + 측정소 목록·등급 배지, GPS·'이 측정소를 내 위치로 저장' 토글·새로고침 아이콘) → [AirNowCard](../../apps/mobile/src/components/air/AirNowCard.tsx) + 24시간/30일/90일 세그먼트([AirHourStrip](../../apps/mobile/src/components/air/AirHourStrip.tsx) / [AirDailyStrip](../../apps/mobile/src/components/air/AirDailyStrip.tsx) — SVG 대신 View 막대, 좋음/보통 상한 점선, 최소 축 = 보통 상한) → [AirStationsMapCard](../../apps/mobile/src/components/air/AirStationsMapCard.tsx)(대중교통 [TransitMapView](../../apps/mobile/src/components/transit/TransitMapView.native.tsx) WebView 재사용, `markerIcons` 아이콘 사전 `@air:<grade>:<b|s>` 10종 — 수천 마커가 data URL 을 반복하지 않게 `e348032` 가 브리지에 `setMarkers.icons` 를 추가) → [AirNearbyCard](../../apps/mobile/src/components/air/AirNearbyCard.tsx) → [AirForecastCard](../../apps/mobile/src/components/air/AirForecastCard.tsx)(권역×대상일 표를 "대상일 → 권역 칩"으로 접음) → [AirWeeklyCard](../../apps/mobile/src/components/air/AirWeeklyCard.tsx) → [AirBadStationsCard](../../apps/mobile/src/components/air/AirBadStationsCard.tsx) → [AirSidoCompareCard](../../apps/mobile/src/components/air/AirSidoCompareCard.tsx). 선택은 로컬 state(초기값은 router 파라미터 `sido/station`), pull-to-refresh 가 `['air']` 전체 invalidate. 측위는 [useUserLocationNative](../../apps/mobile/src/hooks/useUserLocationNative.ts)(expo-location, 5초, `isInKorea` 검사, 거부 시 설정 열기 Alert). 색은 [airGradeColor.ts](../../apps/mobile/src/lib/airGradeColor.ts)(`AIR_GRADE_HEX` + 알파 `26` 틴트). 홈 [MyLocationCard](../../apps/mobile/src/components/home/MyLocationCard.tsx)는 [home.tsx](../../apps/mobile/app/(tabs)/home.tsx) listHeader 첫 카드 — 저장 위치 없으면 "내 위치로 설정"(권한 → `nearestWeatherPlace` 이름으로 `geolocation` 저장) / "지점 고르기"(→ /weather), 있으면 [날씨 → /weather | 대기 → /air] 두 탭 영역 + 일상지도 진입 행.

## Talks To [coverage: high — 14 sources]

- **에어코리아 대기오염정보 API** (`https://apis.data.go.kr/B552584/ArpltnInforInqireSvc`, HTTPS GET, `returnType=json`) — friendly 만 호출. **측정소정보 API** (`…/MsrstnInfoInqireSvc/getMsrstnList`) — 같은 계정 키지만 **활용신청이 따로** 필요(미신청이면 게이트웨이 30 → 503). 둘 다 [probe-airkorea-api.ts](../../apps/friendly/scripts/probe-airkorea-api.ts)(`pnpm --filter friendly probe:airkorea [측정소명]`, 7~8콜, 원문을 `data/airkorea-probe/*.json` 에 덤프 — gitignore)로 실측했고 `__fixtures__` 는 그 축약본이다.
- **키 체인** — [env.ts](../../apps/friendly/src/config/env.ts) `AIRKOREA_API_KEY`(기본 `''`), 비면 라우트가 `BUS_API_KEY` 로 폴백(data.go.kr 는 계정당 키 1개 — 활용신청만 추가하면 같은 키). 둘 다 비면 `AirQualityService.requireKey()` 가 503. 라이브 테스트·프로브도 같은 폴백 순서. [.env.example](../../apps/friendly/.env.example) 에 항목·쿼터·프로브 명령 기재. 컨셉 [db-config-env-fallback](../concepts/db-config-env-fallback.md)과 달리 DB 행 없이 env 전용.
- **friendly 공용 인프라** — `*.route.ts` autoload([app.ts](../../apps/friendly/src/app.ts), `dirNameRoutePrefix:false`), [RATE.transitRealtime](../../apps/friendly/src/plugins/rate-limit.ts)(분당 60 — 캐시 미스 키를 바꿔 가며 쿼터를 태우는 남용 방지), [replyUpstreamError](../../apps/friendly/src/lib/reply-upstream-error.ts)(502/503 을 라우트가 직접 응답 + 키 마스킹 URL·업스트림 코드 warn 로깅 — 전역 error-handler 가 5xx 를 500 으로 뭉개기 때문), `app.authenticate`(내 위치 3라우트), Prisma(`airUserLocation`).
- **`@repo/api-contract`** — [schemas/air-quality.ts](../../packages/api-contract/src/schemas/air-quality.ts)·`Routes.AirQuality`. 한글 경로 세그먼트(`/air/sido/:sidoName`)는 빌더가 `encodeURIComponent` 하므로 라우트 등록 시 `decodeURIComponent` 로 되돌린다(지하철 관례). 컨셉 [zod-ssot-buildless](../concepts/zod-ssot-buildless.md).
- **`@repo/shared`** — `airQualityApi`·`airLocationApi`·훅 8종·`useAirLocation`·`useMyLocationGlance`·`airLocationStore`·`useUserLocation`. 글랜스는 [useWeatherNowcast](../../packages/shared/src/hooks/useWeather.ts)(`refetchOnWindowFocus` 옵션은 `9e197d3` 가 칩 때문에 추가)와 [weather](weather.md) 의 `latLngToKmaGrid` 를 호출한다.
- **`@repo/utils`** — [airQuality.ts](../../packages/utils/src/airQuality.ts)(어댑터·서비스·웹·앱이 같은 파서·등급표를 공유 — 서버가 `airDataTimeToIso/airAnnouncedToIso/parseAirRegionGrades/splitAirReliability/parseAirDustImage/airSidoFromAddr/airSidoMatches` 를, 클라가 `airGradeFromValue/AIR_SIDO_OPTIONS/formatAirValue` 를 쓴다), [airMarker.ts](../../packages/utils/src/airMarker.ts)(`markerFrame.ts` 공용 핀/원 규격 — 식당·버스·지하철 마커와 라벨 offset·축소 스케일 동일), `haversineM`·`formatDistanceM`·`formatRelativeMin`·`isInKorea`·`nearestWeatherPlace`·`todayKst`(웹 `airGrade.ts` 가 재수출).
- **map** — 웹은 vworld [MapCanvas](../../apps/web/src/components/restaurant/MapCanvas.tsx)(`useMapPublicConfig` 키 404 면 placeholder, `poolKey='air'` 인스턴스 풀링, `overlayMarkers`), 앱은 대중교통 WebView 지도 브리지. 지도 인프라는 [map](map.md)·[transit](transit.md).
- **weather / life-map / meal** — 같은 `useAirLocation` 저장 위치를 읽는다. 날씨 페이지는 URL 이 없으면 저장 위치로 열리고 `place` 로 저장하며 헤더에 '내 위치(라벨)' 표기·해제([weather](weather.md), `7704f8c`); 일상지도는 초기 중심([life-map](life-map.md)); 식단 추천은 날씨 결합용 좌표([meal](meal.md), `acb3206`).
- **auth** — `useAuthStore` 토큰 유무가 게스트/서버 모드 분기. 401 로 세션이 끊기면 게스트 모드로 자연 폴백(버스 즐겨찾기와 동일).

## API Surface [coverage: high — 8 sources]

| 메서드 | 경로 (`/api/v1`) | 인증 | 레이트 | 비고 |
|---|---|---|---|---|
| GET | `/air/sido/:sidoName` | 공개 | 60/분 | '전국' 캐시 필터. 구 라벨(광주/전남)도 통합 라벨에 포함 매칭. 매칭 0건은 404 가 아니라 빈 `items` |
| GET | `/air/stations/:stationName/history?term=DAILY\|MONTH\|3MONTH` | 공개 | 60/분 | 기본 DAILY(시간별 원본, `unit:'hour'`), MONTH/3MONTH 는 일평균(`unit:'day'`). `latest` = 최신 시간 행. 허용 외 term 400 |
| GET | `/air/bad-stations` | 공개 | 60/분 | CAI 나쁨 이상 측정소 + `addr` 앞머리로 추정한 `sidoName` |
| GET | `/air/forecast?date=YYYY-MM-DD` | 공개 | 60/분 | 생략 시 KST 오늘 → 0건이면 전일 폴백(명시 date 는 폴백 없음). 3코드 전부 반환(FE 필터). 형식 불일치 400 |
| GET | `/air/forecast/weekly?date=` | 공개 | 60/분 | 발표일 기준 1행. 오후 발표라 오전엔 전일 폴백. 없으면 `presentedAt null, days []` |
| GET | `/air/stations` | 공개 | 60/분 | 전국 측정소 좌표·주소·측정항목(24h 캐시). 미신청 503(메시지에 `30`) |
| GET | `/air/stations/nearby?lat&lng&radius&limit` | 공개 | 60/분 | lat 33~39·lng 124~132 강제, radius 500~50,000(기본 10,000), limit 1~20(기본 5). `dist` 오름차순 + `measure`(전국 실시간 조인, 동명 측정소는 주소 시도 ↔ 측정 sidoName 매칭) |
| GET | `/air/stations/search?q=` | 공개 | 60/분 | 1~30자 NFC. 이름 앞머리 → 이름 포함 → 주소 포함, 상위 30(`total` 은 절단 전) |
| GET / PUT / DELETE | `/air/location` | **Bearer** | — | 소유자 1행. PUT 덮어쓰기(`lat/lng/label≤40/source`), DELETE 멱등(deleteMany). 응답은 항상 변경 후 상태 `{ location \| null }` |

에러: 400 은 zod 자동, 502 = `AirKoreaApiError`(업스트림 실패), 503 = 키 미설정·`AirKoreaApiAuthError`(인증 20/30 등)·일일 쿼터 소진(`AirQualityServiceError`). 모든 캐시성 응답에 `fetchedAt`(ISO) + `stale`(last-known 서빙 중) 공통 필드.

**FE 표면**: `airQualityApi.{sidoRealtime, stationHistory, badStations, forecast, stations, nearbyStations, searchStations, weeklyForecast}` / `airLocationApi.{get, upsert, remove}` · 훅 `useAirSidoRealtime(sido|null)`·`useAirStationHistory(name|null, term)`·`useAirBadStations()`·`useAirForecast(date?)`·`useAirStations()`·`useAirNearbyStations(lat|null, lng|null, {radius, limit, refetchOnWindowFocus})`·`useAirStationSearch(q)`·`useAirWeeklyForecast(date?)` · `useAirLocation()` · `useMyLocationGlance({refetchOnWindowFocus})` · `setAirLocationStorage(storage)`. 유틸 export 는 Architecture 참조.

## Data [coverage: high — 9 sources]

**DB** — 마이그레이션 [20260821060230_add_air_user_location](../../apps/friendly/prisma/migrations/20260821060230_add_air_user_location/migration.sql): `air_user_locations`(`userId` TEXT PK → `users.id` cascade, `lat/lng` REAL, `label` TEXT?, `source` TEXT, `createdAt`, `updatedAt`). Prisma `AirUserLocation`([schema.prisma](../../apps/friendly/prisma/schema.prisma), `User.airLocation?` 1:1). source 는 SQLite 문자열이고 계약이 검증 — 서비스 `toItem` 이 미지 값을 `manual` 로 접는다. 대기 측정·예보·측정소는 **DB 없음**(전부 메모리 캐시).

**서버 메모리 캐시** — `AirQualityService` 인스턴스 1개(라우트 플러그인 생성) 안의 `Map<string, {data, fetchedAt, expiresAt, staleMaxMs}>` + `inflight Map` + `quota {dateKey, count}`. 키·TTL 은 Architecture 표. 단일 인스턴스 전제(CLAUDE.md, Redis 없음) — 재시작하면 캐시·쿼터 카운터가 함께 초기화된다.

**React Query 키** — `['air','sido',sido]`·`['air','station',name,term]`·`['air','bad-stations']`·`['air','forecast',date|'auto']`·`['air','forecast','weekly',…]`·`['air','stations']`(staleTime·gcTime 24h, `retry:false`)·`['air','stations','nearby',lat4,lng4,radius,limit]`(좌표 소수 4자리 스냅 ≈11m, GPS 흔들림에 키가 갈라지지 않게)·`['air','stations','search',q]`(24h)·`['air','location']`(60s). 측정 계열은 staleTime 5분 + `refetchInterval` 10분(`refetchIntervalInBackground` 기본 false → 비활성 탭 중단) + `placeholderData: prev`(시도/측정소 전환 시 이전 화면 디밍 유지). 예보 15분·주간 30분. 페이지 새로고침은 `invalidateQueries(['air'])`.

**게스트 스토어** — `airLocationStore`: persist name `air-location-v1`, version 1, `partialize: {location}`, `setLocation(body)` 가 `updatedAt` 을 찍어 서버 저장분과 같은 형태. 주입 시 `bindRehydrate` 로 재복원(앱 entry 는 모듈 평가 뒤에 주입되므로).

**화면 상태** — 웹: URL `sido/station/term/code`(term 기본 DAILY·code 기본 PM10 은 URL 에서 제거), 로컬 `metric`(차트)·`compareMetric`. 앱: `sel: {kind:'auto'} | {kind:'station', sido, station}`, `term`, `dailyMetric`, `gps`, `code`, `compareMetric`, `pickerOpen`.

## Key Decisions [coverage: high — 16 sources]

- **2026-08-22 앱 화면 합류 — "앱 연동 제외" 결정 번복**(`e348032`·`563890a`·`5f5f0e3`): 2026-08-17 경엔 대기 기능을 웹 전용으로 두기로 했으나, 훅·계약·유틸이 이미 플랫폼 중립이라 화면만 세로 카드로 이식하는 비용이 낮았고 날씨·일상지도와 함께 "홈 내 위치 카드 → 상세 화면" 허브가 필요했다. 탭은 늘리지 않고 Stack 화면으로. 30/90일은 SVG 선 차트 대신 등급색 View 막대(라이브러리 없이 "어느 날이 나빴나"), 측정소 지도는 대중교통 WebView 지도를 카드 높이로 재사용. 파생값은 `useMyLocationGlance` 로 승격해 웹 칩도 같은 훅을 쓴다.
- **2026-08-22 칩 폭 예산·측정값 없음 처리**(`a062e7d`): `<sm` 은 `[📍 ☁26° ☂ · ●좋음]`(라벨·소수점 숨김, 360px 에서 '매우나쁨'까지 ~190px), `sm+` 라벨(6.5rem 말줄임)·소수 1자리, `lg+` 하늘 상태·PM2.5 수치. 측정소는 있어도 등급을 낼 수 없으면 대기 세그먼트를 통째로 생략 — 칩은 경고하는 자리가 아니다.
- **2026-08-21 날씨·대기 통합 알약**(`9e197d3`): 저장 위치 하나에 칩 둘(AirLocationChip + 날씨)을 두면 라벨이 두 번 반복되고 두 반쪽이 따로 논다 → 알약 하나에 왼쪽(라벨+날씨 → `/weather?ll=`)·오른쪽(등급 → `/air?sido&station`) 두 링크, 경계선 대신 가운뎃점. 앞 6시간 강수형태 또는 확률 ≥60% 면 우산.
- **2026-08-21 저장 단위 통일 — 측정소/날씨 지점/GPS, '지도에서 직접 지정' 제거**(`7704f8c`): 날씨 페이지가 같은 저장소를 쓰게 되자 두 페이지가 같은 단위로 고르게 해 동기화를 단순하게 유지. source `place` 추가, `manual` 은 저장된 값 호환용으로만 남김. 저장된 측정소를 보면 '저장됨' 표시.
- **2026-08-21 10분 조용한 갱신, 칩만 `refetchOnWindowFocus`**(`26947ba`): 원천이 매시 정각(+10~20분 반영)이라 분 단위 폴링은 낭비. 서버 10분 캐시 뒤라 업스트림 추가 호출 0, 최악 지연 ≈20분. 상주 표시(칩·카드)만 탭 복귀 재조회를 켠다 — 오래 떠났다 돌아온 탭의 즉시 최신화.
- **2026-08-21 '선택 측정소 저장'(source `station`)**(`aa3a09e`): GPS 좌표를 저장하면 가장 가까운 측정소로 재해석되는데 영등포구·양천구가 같은 2.0km 인 경우 사용자가 고른 양천구가 아니라 영등포구가 칩에 떴다. 선택 측정소의 좌표를 그대로 저장하면 거리 0m 라 항상 그 측정소.
- **2026-08-21 통합지수 결측 → PM2.5 → PM10 등급 폴백**(`4d35a57`): CAI 는 한 항목만 결측이어도 비어(실측 673개소 중 84곳) 칩이 '-' 였다. 폴백 등급을 쓰되 툴팁·앱 카드에 어느 등급인지(`통합지수/PM2.5/PM10`) 적는다.
- **2026-08-21 공용 측위 훅 수정 — 명시 요청 10초 + TIMEOUT 1회 재시도, 캐시 5분**(`67f14cf`): 실측(Windows/Chrome WiFi) 콜드 측위 5,062ms·직후 두 번째 fresh 요청 10초 초과·캐시 히트 0ms. 5초 단발이던 `useUserLocation` 이 간헐 TIMEOUT(code 3)을 'unavailable' 로 뭉개 재시도 유도도 못 했다. 마운트 자동 요청은 5초 단발 유지(진입 직후 화면 튐 방지), `maximumAge` 60s→5분, 새 상태 `'timeout'`, 코어 `acquirePosition` 분리로 가짜 geolocation 계약 테스트. 버스/지하철은 직접 호출 10초라 영향 없었다.
- **2026-08-21 내 위치 = 좌표 저장, 해석은 조회 시**(`a4284aa`): 측정소명을 저장하면 신설·폐지·개명에 깨진다. 좌표만 저장하고 `nearby?limit=1` 로 매번 해석. 하이브리드는 버스 즐겨찾기 미러지만 값이 1개라 union 대신 서버 우선·게스트 1회 업로드.
- **2026-08-21 측정소정보 API 별도 도입 — TM 근접측정소 오퍼레이션 안 씀**(`c6ac640`): 대기오염정보엔 좌표가 없다. 전량(≈650) 24시간 캐시 + 로컬 haversine 이 근접측정소 API(TM 좌표 입력, 호출당 쿼터) + proj4 보다 단순하고 쿼터 0. dmX/dmY 는 값 범위로 판정(문서 불신). 신청 전엔 화면이 '활용신청 안내'를 띄우게 503 메시지의 코드 30 을 FE 가 해석.
- **2026-08-21 초기 설계**(`7340743`): ① 시도별은 '전국' 1콜 캐시 후 `airSidoMatches` 포함 매칭 — 쿼터 17→1 + 2026-07 통합 라벨 '전남광주'·개별 '광주' 타임아웃 우회, 선택지도 통합 라벨(`AIR_SIDO_OPTIONS` 17종, 라벨 '광주·전남'). ② 게이트웨이 05/04·5xx **1회 재시도** — 버스/지하철 어댑터의 "재시도 없음" 규율에서 의도적으로 벗어난 지점(첫 호출 ~절반이 504 라 재시도 없이는 콜드 캐시 첫 화면이 자주 깨진다), 타임아웃 20초. ③ `InformCode` 미전송(업스트림이 무시하고 3종을 다 준다 — FE 가 코드 탭으로 나눈다). ④ 예보·주간예보 자동 모드 전일 폴백(명시 date 는 폴백 없음). ⑤ 키는 `AIRKOREA_API_KEY` → `BUS_API_KEY` 폴백. ⑥ 일일 한도 기본 450(500 에서 여유), 3MONTH 는 3콜로 계산. ⑦ 차트는 라이브러리 없이 인라인 SVG + 표 쌍둥이(툴팁이 유일 경로가 되지 않게), 등급색은 에어코리아 관행(파랑/초록/노랑/빨강)을 빌리되 항상 글자와 함께.

## Gotchas [coverage: high — 12 sources]

- **측정소정보 API(15073877) 는 활용신청이 따로** — 같은 계정 키라도 신청 전엔 게이트웨이 30 → 503. 웹은 "키 설정"이 아니라 "활용신청" 안내로 분기하지만 앱은 일반 오류 문구만 낸다(`AirStationsMapCard` 503 → `StateBlock` error). 승인 반영까지 수십 분~반나절.
- **출처 표기 유형이 웹·앱에서 다르다** — 웹 [AirLegend](../../apps/web/src/components/air/AirLegend.tsx)는 "공공누리 제3유형(출처표시·변경금지)", 앱 [air/index.tsx](../../apps/mobile/app/air/index.tsx) 푸터는 "공공누리 제1유형". 어느 쪽이 데이터셋의 실제 이용허락 유형인지 포털에서 확인해 맞춰야 한다.
- **`schema.prisma` 의 `AirUserLocation.source` 주석이 낡았다** — `'geolocation' | 'manual'` 이라 적혀 있지만 계약은 `station`·`place` 까지 4종(`aa3a09e`·`7704f8c`). DB 는 문자열이라 동작엔 영향 없고 서비스 `toItem` 이 4종을 접는다.
- **서비스 인스턴스가 라우트당 1개라 테스트가 캐시 순서에 묶인다** — [air-quality.test.ts](../../apps/friendly/src/modules/air-quality/air-quality.test.ts)는 인증 실패(503)를 캐시 전 첫 테스트에서 검증해야 stale 폴백이 끼어들지 않고, 502 검증은 앞 describe 에서 성공본이 캐시된 `bad-stations` 대신 별도 키(예보 명시 날짜 `2000-01-01`)를 쓴다. TTL/stale/쿼터 경계는 서비스를 직접 만들어 `now`·`dailyLimit` 주입으로 제어(가짜 타이머 없음). `env.ts` 가 모듈 로드 시 파싱하므로 `vi.hoisted` 로 `AIRKOREA_API_KEY` 를 먼저 심는다.
- **라이브 스모크 skip 조건** — [airkorea-api.live.test.ts](../../apps/friendly/src/modules/air-quality/airkorea-api.live.test.ts)는 `AIRKOREA_API_KEY || BUS_API_KEY` 가 비었거나 `'test-air-key'`/`'test-bus-key'` 면 `describe.skipIf`, 실행 중에도 `AirKoreaApiAuthError`(미승인)·코드 04/05·5xx·fetch 실패·aborted·파싱 실패는 코드 결함이 아니라 `ctx.skip()`. 쿼터를 아끼려 3~4콜만 쓰고 caller 시그널 25초.
- **`stationCode` 는 측정소정보에선 항상 null, 시도별(ver 1.5)에선 채워진다** — 지도 마커·조인은 `stationName` 키. 동명 측정소는 주소 시도 ↔ 측정 `sidoName` 매칭으로 고르고 없으면 첫 후보.
- **'전국' 응답은 673행·≈340KB·수 초** — 첫 화면이 느린 이유. 콜드 캐시 첫 호출 ~절반이 504 라 재시도 1회가 필수이며 20초 타임아웃과 짝이다. 쿼터 카운터는 실패해도 호출 직전에 증가한다(시도 자체가 한도를 소모).
- **`"24:00"` 은 익일 00:00 이지만 일평균 묶음은 전일** — `airDataTimeToIso` 는 날짜를 넘기고, `foldDaily` 는 `dataTime` 원문 날짜로 묶는다(에어코리아 01~24시 관행). 띠 축 라벨은 "24시" 를 그대로 둬 하루 경계를 드러낸다.
- **웹과 앱의 측위 훅이 다르다** — 웹 `useUserLocation`(명시 10초+재시도, `'timeout'` 상태, Permissions API change 구독), 앱 `useUserLocationNative`(expo-location 5초, `'timeout'` 없음, 자동 mount fetch 없음 — WebView/reanimated 충돌 이력). 앱 GPS 실패는 Alert + 설정 열기.
- **앱 지도 `flyToZoomIn` 은 600ms 지연** — WebView 지도 ready 뒤 명령이 큐잉되지 않아 선택 측정소 이동을 `setTimeout` 으로 늦춘다([AirStationsMapCard](../../apps/mobile/src/components/air/AirStationsMapCard.tsx)). 앱 [AirHourStrip](../../apps/mobile/src/components/air/AirHourStrip.tsx) 축 라벨은 플렉스 칸 안에서 "8.." 로 잘려 칸 행 폭을 `onLayout` 으로 재서 절대 배치, 날짜·마지막 라벨 2칸 이내 정기 라벨 생략(`5f5f0e3`).
- **게스트 → 서버 병합은 서버가 비었을 때만** — 서버에 값이 있으면 게스트 값은 조용히 무시된다(버리지도 않는다). `mergedRef` 는 로그아웃 시 리셋. 병합 실패 시 로컬 유지·다음 조회에서 재시도.
- **예보 `imageUrl8/9` 는 디렉터리로 끝나는 빈 슬롯**(`https://www.airkorea.or.kr/dustImage/`) — 어댑터는 비어 있지 않은 값을 전부 수집(9개)하고 `parseAirDustImage` 가 확장자 없는 URL 을 버려 7장이 된다. `ver=1.1` 이어야 애니메이션 gif(`imageUrl7~9`)가 온다.
- **HANDOFF/PLAN 문서 없음** — 이 기능은 커밋 메시지와 코드 주석이 유일한 WHY 기록이다(`docs/` 에 대기 전용 문서 없음).

## Sources [coverage: high — 87 sources]

**friendly**
- [apps/friendly/src/modules/air-quality/air-quality.route.ts](../../apps/friendly/src/modules/air-quality/air-quality.route.ts) — 공개 GET 8
- [apps/friendly/src/modules/air-quality/air-quality.service.ts](../../apps/friendly/src/modules/air-quality/air-quality.service.ts) — 캐시·쿼터·정규화·좌표 축 판정
- [apps/friendly/src/modules/air-quality/air-quality.test.ts](../../apps/friendly/src/modules/air-quality/air-quality.test.ts) — 22건(라우트 15 + 서비스 캐시·stale·쿼터·폴백·in-flight 7)
- [apps/friendly/src/modules/air-quality/airkorea-api.adapter.ts](../../apps/friendly/src/modules/air-quality/airkorea-api.adapter.ts)
- [apps/friendly/src/modules/air-quality/airkorea-api.adapter.test.ts](../../apps/friendly/src/modules/air-quality/airkorea-api.adapter.test.ts) — 15건(URL/키 3·게이트웨이 분류/재시도 4·래퍼 8)
- [apps/friendly/src/modules/air-quality/airkorea-api.live.test.ts](../../apps/friendly/src/modules/air-quality/airkorea-api.live.test.ts) — 4건(키 없으면 describe skip, 외부 상태는 ctx.skip)
- [apps/friendly/src/modules/air-quality/air-location.route.ts](../../apps/friendly/src/modules/air-quality/air-location.route.ts) · [air-location.service.ts](../../apps/friendly/src/modules/air-quality/air-location.service.ts) · [air-location.test.ts](../../apps/friendly/src/modules/air-quality/air-location.test.ts) — 4건(401·CRUD 멱등·소유자 스코프·400)
- [apps/friendly/src/modules/air-quality/__fixtures__/](../../apps/friendly/src/modules/air-quality/__fixtures__/) — 10파일: `sido-all.json`(전국 실응답 8행 발췌, 통신장애 행 포함) · `station-daily.json`(강남구 DAILY 7행, "24:00" 포함) · `bad-stations.json`(3행) · `forecast.json`(4행, imageUrl1~9) · `weekly.json`(1행, 신뢰도) · `empty.json`(주간예보 당일 미발표 실응답) · `gateway-auth-error.json`(30) · `gateway-timeout.json`(05) · `msrstn-list.json`(측정소정보 실응답 673개소 중 5행) · `msrstn-list.synthetic.json`(문서 샘플 기반 합성 — 축 뒤집힘·결측 분기)
- [apps/friendly/scripts/probe-airkorea-api.ts](../../apps/friendly/scripts/probe-airkorea-api.ts) · [apps/friendly/package.json](../../apps/friendly/package.json) — `probe:airkorea`
- [apps/friendly/prisma/migrations/20260821060230_add_air_user_location/migration.sql](../../apps/friendly/prisma/migrations/20260821060230_add_air_user_location/migration.sql) · [apps/friendly/prisma/schema.prisma](../../apps/friendly/prisma/schema.prisma) — `AirUserLocation`
- [apps/friendly/src/config/env.ts](../../apps/friendly/src/config/env.ts) · [apps/friendly/.env.example](../../apps/friendly/.env.example) — `AIRKOREA_API_KEY`, `BUS_API_KEY` 폴백
- [apps/friendly/src/app.ts](../../apps/friendly/src/app.ts)(autoload) · [apps/friendly/src/plugins/rate-limit.ts](../../apps/friendly/src/plugins/rate-limit.ts)(`RATE.transitRealtime`) · [apps/friendly/src/lib/reply-upstream-error.ts](../../apps/friendly/src/lib/reply-upstream-error.ts) · [apps/friendly/src/modules/bus/bus-api.adapter.ts](../../apps/friendly/src/modules/bus/bus-api.adapter.ts)(`toServiceKeyPart`)

**api-contract**
- [packages/api-contract/src/schemas/air-quality.ts](../../packages/api-contract/src/schemas/air-quality.ts) · [packages/api-contract/src/routes.ts](../../packages/api-contract/src/routes.ts)(`Routes.AirQuality`) · [packages/api-contract/src/index.ts](../../packages/api-contract/src/index.ts)

**shared**
- [packages/shared/src/api/air-quality.api.ts](../../packages/shared/src/api/air-quality.api.ts) · [packages/shared/src/api/air-location.api.ts](../../packages/shared/src/api/air-location.api.ts)
- [packages/shared/src/hooks/useAirQuality.ts](../../packages/shared/src/hooks/useAirQuality.ts) · [packages/shared/src/hooks/useAirLocation.ts](../../packages/shared/src/hooks/useAirLocation.ts) · [packages/shared/src/hooks/useMyLocationGlance.ts](../../packages/shared/src/hooks/useMyLocationGlance.ts) · [packages/shared/src/hooks/useWeather.ts](../../packages/shared/src/hooks/useWeather.ts)(`useWeatherNowcast` 포커스 옵션)
- [packages/shared/src/stores/airLocationStore.ts](../../packages/shared/src/stores/airLocationStore.ts) · [packages/shared/src/stores/injectableStorage.ts](../../packages/shared/src/stores/injectableStorage.ts)
- [packages/shared/src/hooks/useUserLocation.ts](../../packages/shared/src/hooks/useUserLocation.ts) · [packages/shared/src/hooks/useUserLocation.test.ts](../../packages/shared/src/hooks/useUserLocation.test.ts) — 5건(`acquirePosition` 계약)
- [packages/shared/src/index.ts](../../packages/shared/src/index.ts)

**utils**
- [packages/utils/src/airQuality.ts](../../packages/utils/src/airQuality.ts) · [packages/utils/src/airQuality.test.ts](../../packages/utils/src/airQuality.test.ts) — 21건(CAI 구간 경계·텍스트 파서·권역 파서·시각 파서·이미지 라벨·시도 매칭·자릿수)
- [packages/utils/src/airMarker.ts](../../packages/utils/src/airMarker.ts) · [packages/utils/src/index.ts](../../packages/utils/src/index.ts)

**web**
- [apps/web/src/routes/AirQualityPage.tsx](../../apps/web/src/routes/AirQualityPage.tsx)
- [apps/web/src/components/air/AirNearbySection.tsx](../../apps/web/src/components/air/AirNearbySection.tsx) · [AirNearbySection.test.tsx](../../apps/web/src/components/air/AirNearbySection.test.tsx) — 6건(검색→선택 콜백·jsdom geolocation 스텁→내 주변 목록·선택 측정소 저장 station·위치 불가 안내·활용신청 안내 분기·502 문구)
- [apps/web/src/components/air/AirStationsMap.tsx](../../apps/web/src/components/air/AirStationsMap.tsx) · [AirStationHero.tsx](../../apps/web/src/components/air/AirStationHero.tsx) · [AirHourStrip.tsx](../../apps/web/src/components/air/AirHourStrip.tsx) · [AirHistoryChart.tsx](../../apps/web/src/components/air/AirHistoryChart.tsx) · [AirSidoTable.tsx](../../apps/web/src/components/air/AirSidoTable.tsx) · [AirSidoCompare.tsx](../../apps/web/src/components/air/AirSidoCompare.tsx) · [AirBadStations.tsx](../../apps/web/src/components/air/AirBadStations.tsx) · [AirForecastSection.tsx](../../apps/web/src/components/air/AirForecastSection.tsx) · [AirWeeklySection.tsx](../../apps/web/src/components/air/AirWeeklySection.tsx) · [AirLegend.tsx](../../apps/web/src/components/air/AirLegend.tsx) · [AirPrimitives.tsx](../../apps/web/src/components/air/AirPrimitives.tsx) · [airGrade.ts](../../apps/web/src/components/air/airGrade.ts) · [airOptions.ts](../../apps/web/src/components/air/airOptions.ts)
- [apps/web/src/components/weather/MyLocationChip.tsx](../../apps/web/src/components/weather/MyLocationChip.tsx) · [MyLocationChip.test.tsx](../../apps/web/src/components/weather/MyLocationChip.test.tsx) — 4건(미저장 시 무표시·통합 알약 링크/툴팁·세그먼트 개별 생략·측정값 없음 시 대기 생략)
- [apps/web/src/App.tsx](../../apps/web/src/App.tsx)(`/air` lazy) · [apps/web/src/components/PublicSidebar.tsx](../../apps/web/src/components/PublicSidebar.tsx) · [apps/web/src/components/PublicTopBar.tsx](../../apps/web/src/components/PublicTopBar.tsx)(칩 마운트) · [apps/web/src/styles/tailwind.css](../../apps/web/src/styles/tailwind.css)(`--air-series-*`)

**mobile(앱)**
- [apps/mobile/app/air/index.tsx](../../apps/mobile/app/air/index.tsx)
- [apps/mobile/src/components/air/AirStationBar.tsx](../../apps/mobile/src/components/air/AirStationBar.tsx) · [AirStationPicker.tsx](../../apps/mobile/src/components/air/AirStationPicker.tsx) · [AirNowCard.tsx](../../apps/mobile/src/components/air/AirNowCard.tsx) · [AirHourStrip.tsx](../../apps/mobile/src/components/air/AirHourStrip.tsx) · [AirDailyStrip.tsx](../../apps/mobile/src/components/air/AirDailyStrip.tsx) · [AirNearbyCard.tsx](../../apps/mobile/src/components/air/AirNearbyCard.tsx) · [AirStationsMapCard.tsx](../../apps/mobile/src/components/air/AirStationsMapCard.tsx) · [AirForecastCard.tsx](../../apps/mobile/src/components/air/AirForecastCard.tsx) · [AirWeeklyCard.tsx](../../apps/mobile/src/components/air/AirWeeklyCard.tsx) · [AirBadStationsCard.tsx](../../apps/mobile/src/components/air/AirBadStationsCard.tsx) · [AirSidoCompareCard.tsx](../../apps/mobile/src/components/air/AirSidoCompareCard.tsx) · [AirPrimitives.tsx](../../apps/mobile/src/components/air/AirPrimitives.tsx)
- [apps/mobile/src/lib/airGradeColor.ts](../../apps/mobile/src/lib/airGradeColor.ts) · [apps/mobile/src/components/home/MyLocationCard.tsx](../../apps/mobile/src/components/home/MyLocationCard.tsx) · [apps/mobile/app/(tabs)/home.tsx](../../apps/mobile/app/(tabs)/home.tsx)(카드 마운트) · [apps/mobile/src/lib/api-setup.ts](../../apps/mobile/src/lib/api-setup.ts)(`setAirLocationStorage(AsyncStorage)`) · [apps/mobile/src/hooks/useUserLocationNative.ts](../../apps/mobile/src/hooks/useUserLocationNative.ts)
