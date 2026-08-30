---
topic: weather
last_compiled: 2026-08-30
sources_count: 74
status: active
aliases: [날씨, weather, 기상청, KMA, kma-api, 단기예보, 중기예보, VilageFcstInfoService, MidFcstInfoService, 15084084, 15059468, getUltraSrtNcst, getUltraSrtFcst, getVilageFcst, getFcstVersion, getMidFcst, getMidLandFcst, getMidTa, getMidSeaFcst, 초단기실황, 초단기예보, 중기전망, 중기해상예보, 기상청 API허브, apihub, AWS, 방재기상관측, nph-aws2_min, stn_inf, KmaApiError, KmaApiHubError, WeatherService, AwsService, kma-api.adapter, kma-apihub.adapter, latLngToKmaGrid, LCC 격자, nx-ny, base_time, 발표 슬롯 캐시, NO_DATA 폴백, KMA_API_KEY, KMA_APIHUB_KEY, weatherRegions, WEATHER_PLACES, 구·군 지점, regId, tmFc, WeatherPage, WeatherNowHero, WeatherMeteogram, WeatherDailyStrip, WeatherSeaSection, MyLocationChip, MyLocationCard, useWeather, useWeatherNowcast, useWeatherAws, useMyLocationGlance, mergeDailyRows, weatherUpstreamMessage, weatherGlyph, 내 위치, 상단바 알약, 홈 내 위치 카드]
---

# weather — 기상청 단기·중기예보 + API허브 AWS 관측 보강 날씨 (웹 `/weather` · 앱 `/weather` · 저장한 내 위치 글랜스)

**2026-08-21~08-30 신설 — 기상청 두 포털을 friendly 가 프록시하고 웹·앱·상단바/홈 카드·식단 추천이 소비하는 날씨 도메인**: 공공데이터포털 단기예보(`VilageFcstInfoService_2.0`, 15084084) 4개 + 중기예보(`MidFcstInfoService`, 15059468) 4개 오퍼레이션을 5개 읽기 엔드포인트로 묶은 웹 `/weather` 페이지가 `37e0db0` 로 들어왔고(발표 슬롯 단위 캐시·NO_DATA 1회 폴백·stale·일일 쿼터, `@repo/utils` 격자 LCC 변환·지점표 172개), 같은 날 광역시 구·군 74 지점 추가 + 대기질과 "내 위치" 저장소 동기화(`7704f8c`), 상단바 내 위치 칩을 날씨·대기 통합 알약으로 교체(`9e197d3`), 공개 메뉴에서 날씨를 대기질 앞으로(`69ed65f`), 기상청 API허브(apihub.kma.go.kr) AWS 방재기상관측 **매분** 자료로 "지금" 보강(`17f281a`)이 이어졌다. 08-22 에는 앱에 날씨 화면 + 홈 "내 위치" 카드가 합류하며 파생값·열흘 병합·에러 문구가 `@repo/shared` 로 승격됐고(`e348032`), 앱 3일 시간별 칸에 기온 막대(`563890a`), 상단바 폭 예산 정리로 칩의 폭별 단계 노출·측정값 없음 시 대기 세그먼트 생략(`a062e7d`), 앱 지점 모달 iOS 이중 상단 여백 수정(`5f5f0e3`)이 붙었다. 식단 추천은 `acb3206` 부터 이 모듈의 `WeatherService.getNowcast` 를 서버 안에서 직접 호출해 실측 기온·강수를 가중치에 쓴다([meal](meal.md)). DB 테이블은 없다 — 전부 메모리 캐시.

## Purpose [coverage: high — 7 sources]

"지금 어디 날씨가 어떤가" 를 **공개·비로그인**으로 보여주는 도메인. 소비자는 넷이다: (1) 웹 [`/weather`](../../apps/web/src/routes/WeatherPage.tsx) — 실황+6시간, 3일 시간별 메테오그램, 열흘(단기+중기 병합), 중기전망, 중기해상, 발표 정보, 코드표·출처를 한 화면에, (2) 앱 [`/weather`](../../apps/mobile/app/weather/index.tsx) — 같은 훅·같은 지점 규칙으로 세로 카드, (3) **저장한 내 위치 글랜스** — 웹 상단바 [MyLocationChip](../../apps/web/src/components/weather/MyLocationChip.tsx)·앱 홈 [MyLocationCard](../../apps/mobile/src/components/home/MyLocationCard.tsx)가 저장 위치 한 곳의 기온·상태·우산(+대기 등급)을 상주 표시, (4) [식단 추천](meal.md) 서버 — 좌표가 오면 초단기실황 기온·강수를 계절 추정 대신 실측으로 쓴다.

설계를 관통하는 제약은 두 가지다. 첫째, **data.go.kr 개발계정 일 10,000건(서비스별)** — 서버가 발표 시각(base) 단위로 캐시해 같은 격자를 몇 명이 보든 **발표 슬롯당 업스트림 1콜**로 만들고([weather.service.ts](../../apps/friendly/src/modules/weather/weather.service.ts) `DEFAULT_DAILY_UPSTREAM_LIMIT = 9000`, 두 서비스 합산 in-memory 카운터), 클라이언트는 10~60분 조용한 폴링을 해도 된다. 둘째, 업스트림 응답이 전부 **문자열 세로 행**(category/fcstDate/fcstTime/fcstValue, 강수량은 `"1mm 미만"` 같은 범주 문자열)이라 서버가 시각별 가로 행으로 접고 숫자를 정규화한 형태만 계약한다([schemas/weather.ts](../../packages/api-contract/src/schemas/weather.ts)).

키는 `KMA_API_KEY` 가 비면 **`BUS_API_KEY` 폴백**(같은 data.go.kr 계정 키 1개 — 서비스별 활용신청만 추가) — 둘 다 비면 날씨 라우트 전부 503. API허브 키(`KMA_APIHUB_KEY`)는 별개 포털 발급이며 비어 있으면 AWS 보강만 `enabled=false`(200)로 조용히 꺼진다([env.ts](../../apps/friendly/src/config/env.ts), [.env.example](../../apps/friendly/.env.example)).

## Architecture [coverage: high — 14 sources]

에어코리아([air-quality](air-quality.md))와 같은 한 방향 레이어드 파이프라인이다 — 저수준 어댑터가 봉투를 해석하고, 서비스가 캐시·쿼터·정규화를 얹고, 라우트가 HTTP 상태로 바꾸고, 계약(zod)이 FE/BE 를 묶고, shared 가 API·훅·파생값을, utils 가 격자·시각·코드표·지점표를, 웹/앱이 UI 를 맡는다.

```
웹 /weather (WeatherPage — ?p=지점id | ?ll=lat,lng | ?sea=해역 URL 진실)      앱 /weather (Selection auto|place|coords 상태)
  ① WeatherNowHero(+AwsLine) ② WeatherMeteogram(SVG) ③ WeatherDailyStrip        WeatherPlaceBar/Picker → WeatherNowCard →
  ④ 중기전망(권역/전국 Segmented) ⑤ WeatherSeaSection ⑥ WeatherVersions ⑦ Legend    HourlyCard(가로 칸) → DailyCard → OutlookCard → SeaCard(접힘)
  상단바 MyLocationChip ─┐                                                       홈 MyLocationCard ─┐
                         └─ useMyLocationGlance (저장한 내 위치 1곳 → 날씨+대기 파생값) ─┘
     │
  @repo/shared : weather.api.ts(6) · useWeather.ts(6 훅) · useMyLocationGlance.ts · weather/weatherDaily.ts(mergeDailyRows)
                 weather/weatherMessages.ts · stores/airLocationStore.ts + hooks/useAirLocation.ts(내 위치, 대기와 공유)
  @repo/utils  : weather.ts(LCC 격자·KST base·코드표·강수 문자열·16방위·상태 키) · weatherRegions.ts(245 지점·10 육상·12 해역) · dateLabel.ts
     │  ↕ @repo/api-contract: schemas/weather.ts · routes.ts(Routes.Weather 6)
     ▼
  friendly modules/weather: weather.route.ts (6 GET, 공개, RATE.transitRealtime 60/분, replyUpstreamError 502/503)
        ├ weather.service.ts  (슬롯 캐시 + in-flight 합류 + stale + 일일 쿼터 + 접기/정규화)  ── kma-api.adapter.ts (8 오퍼레이션, JSON 봉투)
        └ aws.service.ts      (지점 24h·전국 매분 2분 캐시, 최근접 N곳)                       ── kma-apihub.adapter.ts (typ01 텍스트 표, EUC-KR)
     ▼                                                                                         ▼
  https://apis.data.go.kr/1360000/{VilageFcstInfoService_2.0|MidFcstInfoService}/<op>    https://apihub.kma.go.kr/api/typ01/{url/stn_inf.php|cgi-bin/url/nph-aws2_min}
  (식단 추천 meal-recommendation.route.ts 도 WeatherService 를 별도 인스턴스로 생성해 getNowcast 직접 호출)
```

### 어댑터 — 두 포털, 두 봉투 규율

[kma-api.adapter.ts](../../apps/friendly/src/modules/weather/kma-api.adapter.ts)(data.go.kr): `callKmaApi(base, op, params)` 한 벌 위에 타입드 래퍼 8종. 봉투 해석은 에어코리아 어댑터와 같은 규율 — 정상 `response.header.resultCode '00'` / **`'03' NO_DATA` 는 에러가 아니라 `noData:true` 빈 결과**(아직 생성 전 슬롯·없는 날짜, body 없음) / 게이트웨이 오류 `OpenAPI_ServiceResponse.cmmMsgHeader.returnReasonCode` 중 `20~33`(키 미등록 30 은 실측 HTTP 403)은 `KmaApiAuthError`(503), `04/05`(게이트웨이 타임아웃)·HTTP 5xx·JSON 파싱 실패는 700ms 뒤 **1회 재시도** 후 `KmaApiError`(502). 요청 URL 은 키를 `***` 로 마스킹한 `requestUrl` 로만 보관, 에러 메시지도 `scrubKey`. serviceKey 인코딩 함정(Encoding 키 이중 인코딩)은 [bus 어댑터](bus.md)의 `toServiceKeyPart` 를 그대로 import 한다. `KMA_PAGE_SIZE = 1000`(단기예보 한 base 최대 14항목 × ~70시각 ≈ 900행 → 항상 1페이지), 타임아웃 20초.

| 오퍼레이션 | 파라미터 | 실측(2026-08-21 16:05 KST, 서울 60,127) | 픽스처 |
|---|---|---|---|
| `getUltraSrtNcst` 초단기실황 | base_date/base_time/nx/ny | 8항목(T1H RN1 UUU VVV REH PTY VEC WSD) 1시각, base 1500 | `ultra-ncst.json` |
| `getUltraSrtFcst` 초단기예보 | 〃 | 11항목 × 6시각 = 66행(POP·LGT 포함), base 1530 | `ultra-fcst.json` |
| `getVilageFcst` 단기예보 | 〃 | 14항목 × ~70시각 = 798행, base 1400 | `vilage.json`(168KB) |
| `getFcstVersion` 예보버전 | ftype ODAM/VSRT/SHRT + basedatetime | `version "YYYYMMDDHHmmss"` 1행 | `version-{odam,vsrt,shrt}.json` |
| `getMidFcst` 중기전망 | stnId + tmFc | `wfSv` 텍스트 1행 | `mid-fcst.json` |
| `getMidLandFcst` 중기육상 | regId + tmFc | `rnSt4Am…rnSt10` / `wf4Am…wf10` 가로 1행 | `mid-land.json` |
| `getMidTa` 중기기온 | regId + tmFc | `taMin4/Low/High … taMax10High` | `mid-ta.json` |
| `getMidSeaFcst` 중기해상 | regId + tmFc | `wf4Am…` + 파고 `wh4AAm(최저)/wh4BAm(최고) … wh10A/B` | `mid-sea.json` |

중기 계열은 **한 행에 D+n 필드가 가로로** 실리고 2026 현재 **D+4~D+10 만** 온다(D+3 필드 없음). 어댑터는 `regId` 외 필드를 키→값 맵(`fields`)으로 보존하고 어떤 day 범위가 왔는지는 서비스가 키 존재로 판정한다(`toMidRow`).

[kma-apihub.adapter.ts](../../apps/friendly/src/modules/weather/kma-apihub.adapter.ts)(API허브): 응답이 JSON 이 아니라 **typ01 텍스트 표**('#' 주석/헤더 줄 + 공백·콤마 구분 행)라 `parseKmaTextTable` 이 **마지막 '#' 헤더 줄에서 열 이름을 읽어 위치로 매핑**한다(문서 순서 하드코딩 없음 — 열 추가/순서 변경에 버팀). 헤더 후보 판정은 "영문 토큰만 2개 이상"(설명 줄은 `:`·한글, 단위 줄은 `m/s` 의 `/` 때문에 탈락), `STN` 을 포함한 줄 우선, 실측 stn_inf 헤더에 `STN` 이 두 번(지점번호·관할) 나와 중복 이름은 `STN#2`. 실측 본문은 **EUC-KR** 이라 `res.text()` 대신 `arrayBuffer` + `TextDecoder('euc-kr')`. 결측 센티널(`-99.9`/`-999.0` 등 9로만 이뤄진 음수)은 `kmaNumOrNull` 이 null 로(영하 `-3.5`·`-19.9` 는 숫자 유지). 오류는 JSON `{"result":{"status":403|404,"message"}}` — 401/403/404 는 `KmaApiHubAuthError`(503, "활용신청이 필요한 API 입니다" 포함), 5xx 1회 재시도. 래퍼 2종: `getAwsStations(tm)` = `url/stn_inf.php?inf=AWS&stn=0&tm&help=1`, `getAwsMinute(tm2, stn)` = `cgi-bin/url/nph-aws2_min?tm2&stn&disp=1&help=1`(TM STN WD1 WS1 WDS WSS WD10 WS10 TA RE RN-15m RN-60m RN-12H RN-DAY HM PA PS TD).

### WeatherService — 발표 슬롯 캐시

[weather.service.ts](../../apps/friendly/src/modules/weather/weather.service.ts)는 에어코리아 서비스 골격(키 단위 메모리 캐시 + in-flight 합류 + last-known stale 폴백 + 일일 쿼터)을 그대로 쓰되 **TTL 만 "다음 발표 시각까지" 로 동적**이다. `cached(key, staleMaxMs, load)` 가 TTL 히트 → 만료 엔트리 스윕 → in-flight 합류 → `loadInto` 순으로 돌고, 로더가 `{data, ttlMs}` 를 함께 돌려준다: 정상이면 `kmaNextBaseAvailableAt`/`kmaNextMidTmFcAt`(utils) − now(하한 `MIN_TTL_MS` 30초), 폴백·NO_DATA 면 `min(정상, WEATHER_SHORT_TTL_MS 5분)` — 새 슬롯이 올라오면 곧 갈아탄다. 실패 시 last-known 이 `staleMaxMs` 안이면 `stale:true` 로 서빙(실황·버전 3h / 단기 6h / 중기 24h), 아니면 throw.

`fetchWithFallback(kind, base, …)`: `consumeQuota` → 요청 슬롯 호출 → `noData && rows 0` 이면 `kmaPrevBase`(실황·초단기 −1h, 단기 −3h)로 **1회만** 재호출(`fallback:true`, 쿼터 1 더 소비). 응답 `base` 는 요청값이 아니라 **행이 스스로 밝힌 baseDate/baseTime 우선**(`rowBase`). 중기는 `fetchMidWithFallback` 이 `kmaMidTmFc`(06/18시) → 비면 `kmaPrevMidTmFc` — 단, 육상·기온 **둘 다** 비었을 때만 이전 발표분으로(전망만 비면 전망 없음).

정규화는 순수 함수로 export 돼 테스트가 직접 부른다: `pivotByTime`(세로 행 → `(fcstDate,fcstTime)` 별 category 맵, `kmaFcstTimeToIso` 로 `at`) → `toNowcastNow`(8항목) / `toUltraHours`(11) / `toForecastHours`(14, PCP·SNO 는 `parseKmaPrecipText`) → `foldForecastDays`: 날짜별로 TMN/TMX 행(06시/15시에만 실림)이 있으면 그 값, 없으면 남은 시각 TMP 의 min/max + `tmnFromHours/tmxFromHours` 플래그, 오전(<12)/오후 반나절 대표는 `foldHalf`(강수형태 = 0 제외 최빈, 하늘 = 가장 흐린 값 4>3>1, 강수확률 = 최대), `partial = 24시각 미만`, 마지막 날이 "00시 한 칸"(전날 24시 표기)뿐이면 일별에서 제거. 중기는 `toMidLandDays/toMidTaDays/toMidSeaDays` 가 `MID_DAYS 3..10` 을 돌며 키 존재로 am/pm(D+4~7) vs all(D+8~10)을 가르고 날짜는 `kmaYmdAddDays(tmFc 날짜, d)`.

### AwsService — 격자 실황을 "가장 가까운 관측소의 지금 값"으로

[aws.service.ts](../../apps/friendly/src/modules/weather/aws.service.ts): 업스트림 호출은 두 종류뿐이고 **둘 다 전국 1콜**이라 좌표별 캐시가 없다 — 지점 정보 `AWS_STATIONS_TTL_MS` 24h(stale 7일), 전국 매분 관측 `AWS_MINUTE_TTL_MS` **2분**(stale 30분), 각자 단일 엔트리 + in-flight 합류. 실측(2026-08-21)에서 매분 자료는 2~4분 늦게 들어오고 **아직 없는 분을 물으면 빈 응답이 아니라 전 지점 `-99.9` 자리표시 행**이 오므로, `AWS_MINUTE_LAG_OFFSETS = [2, 5, 8]` — 현재−2분부터 묻고 값 있는 행이 `max(1, ceil(10%))` 미만이면 −5·−8분으로 물러난다(최대 3콜, 전부 비어도 마지막 응답 채택 → 값 null). 같은 지점 여러 행이면 가장 늦은 tm. `getNearby(lat,lng,radiusM,limit)` 는 지점표를 `haversineM` 으로 거르고 거리순 `limit` 개, 관측 시각이 `AWS_OBS_MAX_AGE_MS` 20분보다 오래면 값을 전부 null 로(결측·통신 장애 표시용). 지점 행은 위·경도 범위(lat 32~40, lon 123~133)로 축 검증. `enabled = authKey.length > 0` — 키 없으면 업스트림 호출 없이 `{enabled:false, items:[]}`.

### 계약·shared·utils

패키지 자체의 빌드·해석 규율은 [api-contract](api-contract.md)·[shared](shared.md)·[utils](utils.md). 날씨가 더한 것:

- [schemas/weather.ts](../../packages/api-contract/src/schemas/weather.ts): `WeatherGridQuery`(nx 1~149, ny 1~253) · `WeatherBase{date,time,at}` · `WeatherPrecip{text,value,none}` · `WeatherNowcastResult{grid, ncstBase, now(8), ultraBase, hours[6](11), ncstFallback, ultraFallback, fetchedAt, stale}` · `WeatherForecastResult{base, fallback, hours[], days[](tmn/tmx/FromHours/popMax/am/pm/partial), total}` · `WeatherVersionsResult` · `WeatherMidQuery{land, ta: /^\d{2}[A-Z]\d{5}$/, stn?: /^\d{3}$/}` · `WeatherMidResult{tmFc, announcedAt, fallback, land, ta, outlook}` · `WeatherMidSeaQuery/Result` · `WeatherAwsQuery{lat 33~39, lng 124~132, radius 1000~50000 기본 15000, limit 1~10 기본 3}` · `WeatherAwsResult{enabled, center, items[], tm, fetchedAt, stale}`. 캐시성 응답 공통 = `fetchedAt` + `stale` + 사용한 `base`.
- [weather.api.ts](../../packages/shared/src/api/weather.api.ts) 6 함수 · [useWeather.ts](../../packages/shared/src/hooks/useWeather.ts) 6 훅(아래 표) · [useMyLocationGlance.ts](../../packages/shared/src/hooks/useMyLocationGlance.ts)(저장 위치 → `latLngToKmaGrid` → `useWeatherNowcast` + `useAirNearbyStations(limit 1, radius 50km)` → `{label, weather{tempC, condition, ncstHour, popMax, wet}, air{grade, gradeSource khai→pm25→pm10, pm25, station}}`, 우산 = 앞 6시간 강수형태 있음 또는 `GLANCE_RAIN_POP_THRESHOLD` 60% 이상) · [weatherDaily.ts](../../packages/shared/src/weather/weatherDaily.ts) `mergeDailyRows(shortDays, mid)`(같은 날짜는 단기 우선, 최대 11행) · [weatherMessages.ts](../../packages/shared/src/weather/weatherMessages.ts) `weatherUpstreamMessage`(503 키 없음/일일 한도 · 502 무응답 · 429 과요청).
- [utils/weather.ts](../../packages/utils/src/weather.ts): **LCC DFS 격자** 상수 `RE 6371.00877km · GRID 5km · SLAT1 30° · SLAT2 60° · OLON 126° · OLAT 38° · XO 43 · YO 136` → `latLngToKmaGrid`/`kmaGridToLatLng`(실측 12개 시도 대표 좌표가 공식표와 일치 — 서울 60,127 · 부산 98,76 · 대구 89,90 …). KST 산술은 Intl 없이 "UTC ms + 9h" 뒤 `getUTC*`(DST 없음, Hermes 안전). 발표 기준: 실황 매시 정각 +10분 제공(`kmaUltraNcstBase`, 분<10 이면 직전 시), 초단기 매시 30분 생성 +45분 제공(`kmaUltraFcstBase`), 단기 `KMA_VILAGE_BASE_HOURS [2,5,8,11,14,17,20,23]` +10분(`kmaVilageBase`, 02:10 전은 전날 23시), 중기 `kmaMidTmFc` 06/18시(06시 전은 전날 18시) + `kmaPrevBase/kmaPrevMidTmFc/kmaNextBaseAvailableAt/kmaNextMidTmFcAt`. 코드표 `KMA_SKY_LABEL{1 맑음,3 구름많음,4 흐림}` · `KMA_PTY_LABEL{0~7; 5·6·7 은 초단기만, 4 소나기는 단기만}` · `KMA_CATEGORIES` 17항목(출처 오퍼레이션·단위). `parseKmaPrecipText`: `없음/0 → 0·none`, `1mm 미만 → 0.5`, `30.0~50.0mm → 하한`, `50.0mm 이상 → 그 값`. `kmaWindDirection16`(기상청 가이드 `(VEC+11.25)/22.5`), `kmaWindStrength`(<4 약함 / <9 약간 강함 / <14 강함). 상태 키 `KmaConditionKey` 10종(clear/partly/cloudy/rain/sleet/snow/shower/drizzle/flurry/unknown) — `kmaCondition(sky, pty)`(강수형태 우선)과 중기 문구용 `kmaConditionFromText`. `kmaIsDaytimeHour` 06~18시 낮 근사.
- [utils/weatherRegions.ts](../../packages/utils/src/weatherRegions.ts): `WEATHER_MID_LAND_REGIONS` 10 권역(각 중기전망 `stnId` 1:1, 전국 `WEATHER_MID_NATION_STN_ID '108'`) · `WEATHER_MID_SEA_REGIONS` 12 해역 · `WEATHER_SIDOS` 17 · `WEATHER_PLACES` = 시·군 `CITY_ROWS` **171**(중기기온 regId 가 곧 id; 실호출로 응답 확인한 코드만) + 광역시·특별시 구·군 `DISTRICT_ROWS` **74**(구청 좌표, id `${소속 regId}-${이름}`, 중기 코드가 없어 소속 광역시 중기기온 지점을 씀, 강화군만 자체 코드 11B20101) = **245**. `nearestWeatherPlace`(haversine 최근접 + 거리) · `weatherPlacesBySido` · `weatherDefaultPlaceOfSido`(광역시는 시청 행) · `weatherPlaceLabel`("서울 양천구") · `searchWeatherPlaces`. 기본 지점 `WEATHER_DEFAULT_PLACE_ID '11B10101'`(서울).
- [utils/dateLabel.ts](../../packages/utils/src/dateLabel.ts): `todayKst`(= `kmaTodayIsoDate`) · `relativeDayLabel`(오늘/내일/모레/M/D) · `formatYmdWithWeekday` — 날씨·대기 웹·앱 공용(웹 `airGrade.ts` 는 재수출).

### 웹 — URL 이 유일한 진실

셸(PublicLayout·TopBar 폭 예산·테스트 인프라 MSW)은 [web](web.md), 여기서는 날씨 페이지 구조만. [WeatherPage.tsx](../../apps/web/src/routes/WeatherPage.tsx) `resolveLocation(p, ll, saved)`: `?ll=lat,lng` → `?p=지점id` → (둘 다 없고) 저장한 내 위치 → 서울. 지점이면 청사 좌표→격자 + 소속 중기 구역/기온 지점, 임의 좌표(GPS·저장 위치)면 격자는 정확히, 중기예보·표시명은 `nearestWeatherPlace` 기준("내 위치 · 서울 양천구 기준 (1.2km)"). `savedHere` 는 좌표 차 0.0005°(≈50m) 이내. 해역은 `?sea=`, 없으면 권역별 기본(`DEFAULT_SEA_BY_LAND` — 서울·인천·경기 → 서해중부 12A20000, 부산·울산·경남 → 남해동부 …). 시도→지점 2단 `<select>`(광역시 시청 행은 "서울 (전체)"), "내 위치"(`acquirePosition` 10초·2회), "저장한 내 위치(라벨)" 바로가기, "이 지점을 내 위치로 저장"(라벨 항상 채움 — 지점이면 그 이름, 좌표면 최근접 지점 이름; source `place`/`geolocation`) / "저장됨·해제". 전국 전망은 토글했을 때만 `useWeatherMid(land, ta, '108')` 을 추가로 켠다. 컴포넌트: [WeatherNowHero](../../apps/web/src/components/weather/WeatherNowHero.tsx)(56px 기온 히어로 + 타일 4 + `AwsLine` + 6시간 띠, 상태 아이콘은 **초단기 첫 시각 sky + 실황 pty** — 실황엔 하늘상태가 없다), [WeatherMeteogram](../../apps/web/src/components/weather/WeatherMeteogram.tsx)(SVG 소형 다중 — 아이콘 행 → 기온 선 → 강수확률 막대 + 강수량 글자, 호버/←→ 크로스헤어 툴팁 + `<details>` 표 쌍둥이, `useElementWidth` ResizeObserver), [WeatherDailyStrip](../../apps/web/src/components/weather/WeatherDailyStrip.tsx)(열흘 — 오전/오후·하루 아이콘, 전 기간 공통 축 기온 막대, 중기 `±오차`), [WeatherSeaSection](../../apps/web/src/components/weather/WeatherSeaSection.tsx)(해역 `<select>` + 오전/오후 파고 표), [WeatherVersions](../../apps/web/src/components/weather/WeatherVersions.tsx)(사용 중 base vs `getFcstVersion` 파일 생성 시각, 직전 발표분/저장본 비고), [WeatherLegend](../../apps/web/src/components/weather/WeatherLegend.tsx)(코드표·category 표·갱신 주기·공공누리 제1유형 출처 링크), [WeatherPrimitives](../../apps/web/src/components/weather/WeatherPrimitives.tsx)(`WeatherStaleNote`·`WeatherFallbackNote`·`Segmented`; 섹션/상태 블록은 대기의 `AirSection`/`AirStateBlock` 재사용), [weatherIcons.tsx](../../apps/web/src/components/weather/weatherIcons.tsx)(lucide 표 DAY/NIGHT + 톤 — 렌더 중 컴포넌트 생성 금지), [weatherFormat.ts](../../apps/web/src/components/weather/weatherFormat.ts)·[weatherDaily.ts](../../apps/web/src/components/weather/weatherDaily.ts)(utils/shared 재수출 + `tempTicks` 눈금·폭 훅). 차트 색은 [tailwind.css](../../apps/web/src/styles/tailwind.css)의 `--weather-temp`/`--weather-precip` = 대기 시리즈 토큰 별칭. 라우트는 [App.tsx](../../apps/web/src/App.tsx) lazy `/weather`, 메뉴는 [PublicSidebar](../../apps/web/src/components/PublicSidebar.tsx)·[PublicTopBar](../../apps/web/src/components/PublicTopBar.tsx) NAV `홈 · 맛집 · 대중교통 · 일상지도 · 날씨 · 대기질 (· 식단)`.

### 앱 — 같은 규칙, 세로 카드

앱 셸·`common/Cards`(Card/CardTitle/Note/StateBlock/Tile)·다크 모드·스토리지 주입 인프라는 [mobile](mobile.md), 여기서는 날씨 화면 구조만. [app/weather/index.tsx](../../apps/mobile/app/weather/index.tsx): expo-router 파일 라우트. 지점은 URL 이 아니라 `Selection`(`auto | place | coords`) 상태 — 딥링크 `p`/`ll` 은 초기값으로만 읽고, `auto` 는 **매 렌더 해석**(저장 위치가 로그인 서버에서 늦게 올 수 있어서). GPS 는 `useUserLocationNative` + `isInKorea` 검사(밖이면 Alert). 카드: [WeatherPlaceBar](../../apps/mobile/src/components/weather/WeatherPlaceBar.tsx)(지점 탭 → [WeatherPlacePicker](../../apps/mobile/src/components/weather/WeatherPlacePicker.tsx) 모달: 내 위치(GPS)/저장한 내 위치 두 줄 + 시도 칩 + 지점 목록, iOS pageSheet 는 상단 inset 을 더하지 않음) + 내 위치/저장 토글/새로고침 아이콘, [WeatherNowCard](../../apps/mobile/src/components/weather/WeatherNowCard.tsx)(웹 히어로 이식 + AWS 줄 + 6시간), [WeatherHourlyCard](../../apps/mobile/src/components/weather/WeatherHourlyCard.tsx)(SVG 대신 60px 가로 `FlatList` 칸, 기온 막대는 전 기간 축 — 강수형태 있거나 확률 60%↑면 파랑, 30%↑는 확률 글자만 파랑), [WeatherDailyCard](../../apps/mobile/src/components/weather/WeatherDailyCard.tsx)(세로 행, 공용 `mergeDailyRows`), [WeatherOutlookCard](../../apps/mobile/src/components/weather/WeatherOutlookCard.tsx)(권역/전국 `SegmentedControl`), [WeatherSeaCard](../../apps/mobile/src/components/weather/WeatherSeaCard.tsx)(**기본 접힘**, 펼치면 해역 칩). 예보 버전·코드표는 앱에서 생략(출처 한 줄). 아이콘은 [weatherGlyph.ts](../../apps/mobile/src/lib/weatherGlyph.ts)(`KmaConditionKey` → MaterialCommunityIcons 글리프 DAY/NIGHT + 라이트/다크 톤, 새 의존성 없음) → [WeatherGlyph](../../apps/mobile/src/components/weather/WeatherGlyph.tsx). pull-to-refresh 는 `['weather']` 전체 invalidate. 홈 [MyLocationCard](../../apps/mobile/src/components/home/MyLocationCard.tsx)는 저장 위치가 없으면 "내 위치로 설정"(권한 → `nearestWeatherPlace` 이름을 라벨로 `geolocation` 저장) / "지점 고르기"(→ `/weather`), 있으면 [날씨 세그먼트 → /weather] | [대기 세그먼트 → /air] + 일상지도 진입 행. 탭은 늘리지 않았다(홈 허브). 게스트 저장분은 [api-setup.ts](../../apps/mobile/src/lib/api-setup.ts)의 `setAirLocationStorage(AsyncStorage)` 주입으로 유지.

## Talks To [coverage: high — 11 sources]

- **기상청(data.go.kr) 2 서비스** — `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/*`, `…/MidFcstInfoService/*`, HTTPS GET + `dataType=JSON`. 서버 전용(키 노출 금지) — 브라우저·앱은 friendly 만 본다.
- **기상청 API허브** — `https://apihub.kma.go.kr/api/typ01/url/stn_inf.php`, `…/typ01/cgi-bin/url/nph-aws2_min`, `authKey` 쿼리. API 별로 API허브에서 따로 활용신청해야 하며 미신청은 403 → 503. 프로브 주석에 `url/awsh.php`(AWS 시간자료)·`url/kma_sfctm2.php`(ASOS 시간자료)가 실존 경로로 기록돼 있고 `url/kma_aws2.php` 는 404(없음).
- **[bus](bus.md) 어댑터** — `toServiceKeyPart` 재사용(data.go.kr serviceKey 이중 인코딩 함정). `BUS_API_KEY` 폴백은 같은 계정 키라서.
- **[friendly](friendly.md) 공통** — `replyUpstreamError`(5xx 를 warn 로깅 + 502/503 직접 응답, 전역 error-handler 가 5xx 를 500 으로 뭉개는 문제 우회), `RATE.transitRealtime`(분당 60 — 캐시 미스 키를 바꿔 가며 쿼터를 태우는 남용 방어), `lib/narrow`(`coerceStrOrNull/intOrNull/numOrNull/isObject`). 라우트는 `*.route.ts` autoload.
- **[air-quality](air-quality.md) 와 "내 위치" 공유** — 저장소는 하나: [airLocationStore](../../packages/shared/src/stores/airLocationStore.ts)(게스트 zustand persist `air-location-v1`, 주입형 storage) + [useAirLocation](../../packages/shared/src/hooks/useAirLocation.ts)(로그인 서버 값 우선, 로그인 직후 서버가 비어 있으면 게스트분 PUT 1회). 날씨가 저장하는 출처 `place` 는 `7704f8c` 에서 계약(`air-quality.ts`)과 서버 매핑([air-location.service.ts](../../apps/friendly/src/modules/air-quality/air-location.service.ts))에 추가됐다. 웹 날씨 페이지는 대기의 `AirSection`/`AirStateBlock`/`airGrade` 재수출·차트 색 토큰을 그대로 쓴다. 글랜스 훅은 대기 `useAirNearbyStations` 도 함께 부른다.
- **[meal](meal.md) 식단 추천** — [meal-recommendation.route.ts](../../apps/friendly/src/modules/meal-recommendation/meal-recommendation.route.ts)가 `new WeatherService({serviceKey: KMA_API_KEY || BUS_API_KEY})` 를 **자기 인스턴스로** 만들고 `latLngToKmaGrid` → `getNowcast(nx, ny)` → `{tempC: t1h, rain: pty > 0}` 를 추천 deps 로 넘긴다(실패·키 없음 → null, 추천은 계절 추정으로 진행; 기온은 5℃ 단위로 뭉개 캐시 키). 세부는 meal 토픽.
- **utils 공통** — `haversineM`(geo), `formatDistanceM`, `formatRelativeMin`, `parseLatLngParam`, `isInKorea`(앱 GPS 검사).
- **웹/앱 셸** — 웹 `PublicTopBar` 가 `MyLocationChip` 을 상주시키고(모바일 폭에서는 칩만 남김 — `a062e7d`), 앱 `(tabs)/home.tsx` 가 `MyLocationCard` 를 홈 상단에 둔다. 앱 GPS 는 `useUserLocationNative`, 웹은 shared `acquirePosition`.

## API Surface [coverage: high — 6 sources]

| 메서드 | 경로 | 쿼리 | 응답 | 업스트림 콜(캐시 미스) |
|---|---|---|---|---|
| GET | `/api/v1/weather/nowcast` | `nx, ny` | `WeatherNowcastResult` — 실황 8항목 + 초단기 6시각 | 2 (+폴백 시 각 1) |
| GET | `/api/v1/weather/forecast` | `nx, ny` | `WeatherForecastResult` — 시각별 ~70 + 일별 요약 | 1 (+1) |
| GET | `/api/v1/weather/versions` | — | `WeatherVersionsResult` — ODAM/VSRT/SHRT 버전·기준 | 3 |
| GET | `/api/v1/weather/mid` | `land, ta[, stn]` | `WeatherMidResult` — 중기육상 + 중기기온 (+전망) D+4~D+10 | 2~3 (+2~3) |
| GET | `/api/v1/weather/mid/sea` | `regId` | `WeatherMidSeaResult` — 해역 날씨·파고 | 1 (+1) |
| GET | `/api/v1/weather/aws` | `lat, lng[, radius, limit]` | `WeatherAwsResult` — 최근접 관측소 N곳 매분 값, `enabled` | 지점 1(24h) + 매분 1~3(2분) |

전부 공개·비로그인, `RATE.transitRealtime`(60/분), 400 은 zod(격자·regId 형식·좌표 범위·limit), 502 업스트림 실패, 503 키 미설정·인증(30 등)·일일 한도·API허브 활용신청 오류. AWS 는 키가 없을 때 503 이 아니라 `enabled:false` 200.

shared 훅(React Query, `placeholderData` 로 지점 전환 시 이전 화면 디밍 유지):

| 훅 | queryKey | staleTime / refetchInterval |
|---|---|---|
| `useWeatherNowcast(nx, ny, {refetchOnWindowFocus?})` | `['weather','nowcast',nx,ny]` | 5분 / 10분 (칩·카드만 focus 재조회 on) |
| `useWeatherForecast(nx, ny)` | `['weather','forecast',nx,ny]` | 10분 / 30분 |
| `useWeatherVersions()` | `['weather','versions']` | 5분 / 10분 |
| `useWeatherMid(land, ta, stn?)` | `['weather','mid',land,ta,stn]` | 30분 / 60분 |
| `useWeatherMidSea(regId)` | `['weather','mid-sea',regId]` | 30분 / 60분 |
| `useWeatherAws(lat, lng, {radius?, limit?})` | `['weather','aws',lat4,lng4,…]`(소수 4자리 스냅 ≈11m) | 2분 / 5분 |

`useMyLocationGlance({refetchOnWindowFocus?})` → `MyLocationGlance{location, label, weather, air}` + 상수 `GLANCE_RAIN_POP_THRESHOLD 60`, `GLANCE_AIR_RADIUS_M 50000`, `GLANCE_AIR_GRADE_SOURCE_LABEL`. utils export: `latLngToKmaGrid/kmaGridToLatLng/isValidKmaGrid`, `kmaUltraNcstBase/kmaUltraFcstBase/kmaVilageBase/kmaMidTmFc/kmaPrev*/kmaNext*`, `KMA_SKY_LABEL/KMA_PTY_LABEL/KMA_CATEGORIES`, `parseKmaPrecipText`, `kmaWindDirection16/kmaWindStrength`, `kmaCondition/kmaConditionFromText/kmaConditionIsWet/KMA_CONDITION_LABEL`, `formatKmaTemp/formatKmaHourLabel/formatKmaBaseLabel/formatKmaTmFcLabel`, `kmaIsDaytimeHour`, 지점표 `WEATHER_*`/`weatherPlace*`/`nearestWeatherPlace/searchWeatherPlaces`. 스크립트: `pnpm --filter friendly probe:kma [-- --nx 60 --ny 127 --ta 11B10101 --land 11B00000 --sea 12A20000]`(8 오퍼레이션 실호출, 원문을 `data/kma-probe/*.json` 덤프 — `apps/friendly/data/*` gitignore), `probe:kma-apihub`(지점·매분·범위·시간자료 5 URL 실호출, `data/kma-apihub-probe/*.txt`).

## Data [coverage: high — 6 sources]

**DB 없음** — `schema.prisma` 에 Weather/Aws 모델이 없다(그렙 결과 없음). 상태는 전부 프로세스 메모리와 클라이언트다.

| 저장소 | 키 | TTL / 보존 |
|---|---|---|
| `WeatherService.cache` (Map) | `nowcast:${nx},${ny}` · `forecast:${nx},${ny}` · `versions` · `mid:${land}:${ta}:${stn ?? '-'}` · `mid-sea:${regId}` | TTL = 다음 발표 제공 시각까지(하한 30초), 폴백/NO_DATA 5분. stale 허용 실황·버전 3h / 단기 6h / 중기 24h(만료 엔트리는 다음 `cached` 호출 때 스윕) |
| `WeatherService.quota` | `{dateKey: Asia/Seoul YYYY-MM-DD, count}` | 일 9,000(두 서비스 합산), 자정 KST 리셋, 인스턴스 로컬 |
| `AwsService.stationsCache` / `minuteCache` | 단일 엔트리 각 1개 (`byStn` Map) | 24h(stale 7일) / 2분(stale 30분) |
| 클라 RQ 캐시 | `['weather', …]` 위 표 | 페이지 새로고침 = `invalidateQueries(['weather'])` |
| 내 위치(게스트) | zustand persist `air-location-v1`(`{lat,lng,label,source,updatedAt}`) — 웹 localStorage / 앱 AsyncStorage 주입 | 로그인 시 서버 `AirLocation` 행([air-quality](air-quality.md)) 우선 |
| 웹 URL | `?p=<지점 id>` · `?ll=<lat>,<lng>`(소수 5자리) · `?sea=<regId>` | replace 갱신, 새로고침/공유 복원 |
| 앱 화면 상태 | `Selection`, `seaOverride`, `outlookScope`, 시도 칩(모달 열 때마다 초기화 `key`) | 컴포넌트 수명 |

픽스처 [`__fixtures__/`](../../apps/friendly/src/modules/weather/__fixtures__/)(11개)는 2026-08-21 16:05 KST `probe:kma` 실응답 원문(서울 60,127, 중기 11B00000/11B10101/108/12A20000) + `no-data.json`(`resultCode "03"` body 없음). AWS 픽스처는 [aws.test.ts](../../apps/friendly/src/modules/weather/aws.test.ts) 안에 인라인 — 실응답을 EUC-KR 디코드해 축약한 stn_inf 3지점(400 양천구 · 401 종로 · 887 관악, `STN` 두 번) + nph-aws2_min 정상/자리표시 두 형태.

## Key Decisions [coverage: high — 10 sources]

- **2026-08-22 앱 화면은 새 탭 대신 홈 카드 + 스택 화면, 로직은 shared 로 승격(`e348032`, `563890a`)** — 웹 칩과 앱 카드가 같은 파생값을 쓰도록 `useMyLocationGlance` 를, 열흘 병합 `mergeDailyRows` 와 에러 문구 `weatherUpstreamMessage` 를 shared 로, 발표 시각 라벨·날짜 라벨을 utils 로 올리고 웹은 기존 경로에서 재수출(호환). 앱 3일 시간별은 SVG 메테오그램 이식 대신 가로 칸 + 기온 막대(전 기간 축) — 차트 라이브러리 없이 오르내림을 읽게. 해상은 접힘, 버전·코드표는 생략. 아이콘은 이미 번들에 있는 MaterialCommunityIcons 로 lucide 표를 미러.
- **2026-08-22 상단바 칩은 폭별 단계 노출, 자료 없으면 세그먼트 생략(`a062e7d`)** — 모바일(웹 <sm)은 `[📍 ☁26° ☂ · ●좋음]`(라벨·소수점은 aria/title 로), sm+ 라벨·소수 1자리, lg+ 상태 글자·PM2.5. 측정소는 있어도 등급이 없으면(업스트림 장애) 대기 세그먼트를 빼 "● -" 를 남기지 않는다 — 칩은 경고하는 자리가 아니다.
- **2026-08-21 AWS 는 실황을 덮지 않고 나란히, 어긋날 때만 배지(`17f281a`)** — 격자 실황(5km·정시·+10분 지연)과 관측소 1분 값은 성격이 달라 대체가 아니라 보강. ① 관측소가 최근 15분 강수(`rn15m>0` 또는 `re=1`)를 잡았는데 실황 강수형태가 없음 → "실황 반영 전 강수 감지", ② 기온 차 ≥2℃ → 고도·위치 국지 차이 표기. 키·활용신청이 없으면 **503 이 아니라 `enabled=false` 200** — 선택 기능이라 페이지가 조용히 생략. 열 이름은 헤더 줄에서 읽는다(활용신청 승인 전에 짠 어댑터라 실응답을 못 본 채 열 순서를 박을 수 없었고, 결과적으로 열 추가에도 버팀).
- **2026-08-21 통합 알약 — 저장한 내 위치 하나로 날씨·대기 동시 구동(`9e197d3`)** — `AirLocationChip` 을 흡수해 알약 하나에 두 링크(왼쪽 `/weather?ll=`, 오른쪽 `/air?sido&station`), 라벨은 앞에 한 번, 경계선 대신 가운뎃점. 우산 = 앞 6시간 강수형태 있거나 확률 ≥60%. 10분 조용한 갱신 + 탭 복귀 재조회(`refetchOnWindowFocus` 옵션은 상주 표시에서만 켠다).
- **2026-08-21 광역시 구·군 74 지점 + 내 위치 저장소 통일(`7704f8c`)** — 좌표→지점 매칭이 구 단위가 되어 초기 "광역시 반경 규칙"을 제거(양천구 좌표가 광명시청으로 새던 문제). 날씨는 대기와 같은 저장소에 `place` 출처로 저장하고 라벨을 항상 채운다(상단바 툴팁·대기 카드가 같은 라벨). 대기의 "지도에서 직접 지정"은 제거(`manual` 은 호환용). 용어 "내 위치(날씨·대기 공통)" 통일. `/weather` 는 URL 이 없으면 저장 위치로 열린다 — 대기 페이지가 저장 위치의 최근접 측정소로 열리는 것과 같은 규율.
- **2026-08-21 발표 슬롯이 캐시 단위(`37e0db0`)** — 기상청 자료는 발표 시각이 곧 버전이므로 TTL 을 고정값이 아니라 "다음 슬롯 제공 시각까지" 로 계산(에어코리아 골격 재사용, TTL 만 동적). 새 슬롯이 아직 없으면(NO_DATA) 한 슬롯 이전으로 **1회만** 폴백하고 짧게(5분) 캐시해 곧 갈아탄다. 응답 `base` 는 요청값이 아니라 데이터가 밝힌 값(진단·테스트가 자료 시각을 본다). 격자 변환은 **클라이언트**(utils)가 하고 서버는 `nx,ny` 만 받는다 — 격자가 캐시 키라 같은 격자 사용자가 캐시를 공유한다. 서울시 버스 키 폴백은 data.go.kr 계정당 키가 하나라서.
- **2026-08-21 지점표는 실호출로 응답을 확인한 코드만(`37e0db0`)** — 군위 11H10603(2023 대구 편입, NO_DATA) 제외, 순천시 11F20405 는 순천 11F20603 과 중복 제외, 강화 11B20101 은 인천 구·군 행으로 편입, 옹진군(군청이 미추홀구)은 백령도가 대표. 좌표는 VWorld 검색 + 수동 보정 ±1km — 5km 격자가 흡수한다.
- **2026-08-21 강수량 범주 문자열은 원문 표시 + 보수적 수치(`37e0db0`)** — "1mm 미만" 0.5, 범위는 하한, "이상"은 그 값 — 차트·정렬용 대표값이지 관측값이 아님을 `WeatherPrecip{text,value,none}` 로 계약에 남긴다.
- **2026-08-21 중기예보는 D+4~D+10 만, D+3 은 단기가 담당** — 업스트림이 D+3 필드를 더 이상 주지 않는다(픽스처 `rnSt4Am…`). 열흘 병합은 날짜 키로 이어 붙이되 같은 날짜는 단기 우선. 서비스·계약(`day` min 3)은 D+3 이 다시 와도 받도록 키 존재로 판정.
- **2026-08-21 공개 메뉴 순서(`69ed65f`)** — 날씨를 대기질 앞에(사용 빈도). 이후 `1d92acb` 로 일상지도가 날씨 앞에 끼어 현재 `홈 · 맛집 · 대중교통 · 일상지도 · 날씨 · 대기질`.

## Gotchas [coverage: high — 10 sources]

- **`WeatherService` 인스턴스가 둘** — weather 라우트와 [meal-recommendation.route.ts](../../apps/friendly/src/modules/meal-recommendation/meal-recommendation.route.ts)가 각자 `new WeatherService(...)` 를 만든다. 캐시·in-flight·일일 쿼터 카운터가 **인스턴스별**이라 같은 격자도 두 번 묻고, "9,000 합산" 은 인스턴스 안에서만 참이다(실제 상한은 2×9,000 까지 갈 수 있음). 쿼터·캐시 모두 메모리라 재시작하면 리셋(단일 인스턴스 전제).
- **쿼터는 호출 전에 센다** — NO_DATA 폴백은 2콜, 버전은 3콜, 중기는 2~3콜(폴백 시 두 배), 전국 전망 토글은 캐시 키에 `stn` 이 들어가 **육상·기온까지 다시** 2~3콜. 캐시 미스 키(격자·구역)를 바꿔 가며 태우는 남용의 방어선은 `RATE.transitRealtime` 60/분뿐.
- **실황엔 하늘상태가 없다** — 히어로·칩·카드의 상태 아이콘은 초단기예보 첫 시각 `sky` + 실황 `pty`. 초단기예보가 비면(매시 45분 전) 아이콘이 `unknown` 이 될 수 있다. 실황도 매시 10분 전엔 직전 시각 — 화면의 "관측 HH:00" 라벨을 믿을 것.
- **오늘의 TMN/TMX 는 없다** — 단기예보 일 최저/최고는 06시/15시 행에만 실려, 발표 뒤 시각만 남은 오늘은 TMP min/max 로 근사(`tmnFromHours` → "남은 시각 기준"). 마지막 날 00시 한 칸은 일별에서 제거된다.
- **AWS 매분 자료의 "현재 분"은 자리표시 행** — 전 지점 `-99.9` 가 와서 값이 있는 것처럼 파싱되면 안 된다. 서비스가 −2/−5/−8분으로 물러나므로 캐시 미스 한 번에 업스트림 최대 3콜. 관측이 20분 넘게 오래되면 값이 null 로 내려가고 화면은 "최근 관측값이 없습니다". 본문은 EUC-KR — `res.text()` 로 읽으면 지점명이 깨진다. stn_inf 는 공백 구분(끝 주소에 공백), nph-aws2_min 은 콤마 구분 + 끝 `,=`.
- **API허브는 API 마다 활용신청** — 미신청이면 403 "활용신청이 필요한 API 입니다" → 503(`KmaApiHubAuthError`). 키가 아예 없으면 503 이 아니라 `enabled=false` — 두 상태를 혼동하지 말 것. 라우트 테스트는 앱의 `AwsService` 가 전국 자료를 2분 캐시하므로 **실패 분기를 성공 호출보다 먼저** 돌린다([aws.test.ts](../../apps/friendly/src/modules/weather/aws.test.ts) 주석).
- **`env.ts` 는 모듈 로드 시점에 파싱** — 라우트 테스트는 `vi.hoisted` 로 `KMA_API_KEY`/`KMA_APIHUB_KEY` 를 `buildApp` import 전에 넣어야 503 으로 죽지 않는다([weather.test.ts](../../apps/friendly/src/modules/weather/weather.test.ts)). 어댑터는 `vi.mock` 부분 모킹(파서·에러 클래스는 실구현).
- **웹은 한국 밖 좌표를 거르지 않는다** — 앱은 `isInKorea` 로 Alert, 웹 `?ll=` 은 그대로 격자 변환 → 격자가 1~149/1~253 밖이면 400, AWS 도 lat 33~39/lng 124~132 밖이면 400 → 섹션 에러 문구로 떨어진다.
- **저장 위치 판정은 좌표 근사** — `savedHere` 는 0.0005°(≈50m). 칩 링크 `?ll=` 은 소수 5자리라 왕복해도 같은 판정이지만, 지점 저장(`place`) 뒤 같은 지점을 `?p=` 로 열어도 좌표가 같아 "저장됨" 으로 뜬다(의도).
- **`placeholderData` 분기** — 지점 전환 중 이전 자료가 남아 있으므로 에러 표시는 `isError && (!data || isPlaceholderData)` 로 가른다(웹·앱 동일). jsdom 엔 `ResizeObserver` 가 없어 메테오그램 테스트는 스텁을 심는다.
- **낮/밤 아이콘은 06~19시 근사** — 일출·일몰 API 미연동([weatherIcons.tsx](../../apps/web/src/components/weather/weatherIcons.tsx)·[weatherGlyph.ts](../../apps/mobile/src/lib/weatherGlyph.ts) 주석). 프로브 주석에 남은 미사용 후보: API허브 `awsh.php`(AWS 시간자료)·`kma_sfctm2.php`(ASOS 시간자료).
- **앱은 URL 동기화가 없다** — 딥링크 `p`/`ll` 은 초기값뿐, 이후 선택은 화면 상태. 홈 카드 탭은 파라미터 없이 `/weather` 로 가고 화면이 `auto` 로 저장 위치를 해석한다(저장 위치가 서버에서 늦게 오면 잠깐 서울로 보였다가 바뀔 수 있다).
- **테스트 규모** — friendly `weather.test.ts` 15건(라우트 8 + 서비스 슬롯 폴백·TTL·stale·in-flight·쿼터 6 + `foldForecastDays` 1) + `aws.test.ts` 9건(파서 2 + 라우트 3 + 서비스 4), utils `weather.test.ts` 37건(격자 12 + 발표 시각 7 + 강수 문자열 9 + 바람·상태 4 + 지점표 5), 웹 `WeatherPage.test.tsx` 6건(MSW) + `MyLocationChip.test.tsx` 4건. 앱 화면 테스트는 없다.

## Sources [coverage: high — 74 sources]

- [apps/friendly/src/modules/weather/weather.route.ts](../../apps/friendly/src/modules/weather/weather.route.ts)
- [apps/friendly/src/modules/weather/weather.service.ts](../../apps/friendly/src/modules/weather/weather.service.ts)
- [apps/friendly/src/modules/weather/weather.test.ts](../../apps/friendly/src/modules/weather/weather.test.ts) — 15건
- [apps/friendly/src/modules/weather/kma-api.adapter.ts](../../apps/friendly/src/modules/weather/kma-api.adapter.ts)
- [apps/friendly/src/modules/weather/kma-apihub.adapter.ts](../../apps/friendly/src/modules/weather/kma-apihub.adapter.ts)
- [apps/friendly/src/modules/weather/aws.service.ts](../../apps/friendly/src/modules/weather/aws.service.ts)
- [apps/friendly/src/modules/weather/aws.test.ts](../../apps/friendly/src/modules/weather/aws.test.ts) — 9건(인라인 텍스트 픽스처)
- [apps/friendly/src/modules/weather/__fixtures__/](../../apps/friendly/src/modules/weather/__fixtures__/) — 11개: `ultra-ncst.json`(8행) · `ultra-fcst.json`(66행) · `vilage.json`(798행) · `version-odam.json` · `version-vsrt.json` · `version-shrt.json` · `mid-fcst.json` · `mid-land.json` · `mid-ta.json` · `mid-sea.json` · `no-data.json`
- [apps/friendly/scripts/probe-kma-api.ts](../../apps/friendly/scripts/probe-kma-api.ts)
- [apps/friendly/scripts/probe-kma-apihub.ts](../../apps/friendly/scripts/probe-kma-apihub.ts)
- [apps/friendly/package.json](../../apps/friendly/package.json) — `probe:kma`, `probe:kma-apihub`
- [apps/friendly/src/config/env.ts](../../apps/friendly/src/config/env.ts) — `KMA_API_KEY`, `KMA_APIHUB_KEY`
- [apps/friendly/.env.example](../../apps/friendly/.env.example)
- [apps/friendly/src/plugins/rate-limit.ts](../../apps/friendly/src/plugins/rate-limit.ts) — `RATE.transitRealtime`
- [apps/friendly/src/lib/reply-upstream-error.ts](../../apps/friendly/src/lib/reply-upstream-error.ts)
- [apps/friendly/src/modules/meal-recommendation/meal-recommendation.route.ts](../../apps/friendly/src/modules/meal-recommendation/meal-recommendation.route.ts) — 별도 `WeatherService` 인스턴스
- [apps/friendly/src/modules/air-quality/air-location.service.ts](../../apps/friendly/src/modules/air-quality/air-location.service.ts) — `place` 출처 매핑
- [packages/api-contract/src/schemas/weather.ts](../../packages/api-contract/src/schemas/weather.ts)
- [packages/api-contract/src/routes.ts](../../packages/api-contract/src/routes.ts) — `Routes.Weather`
- [packages/api-contract/src/index.ts](../../packages/api-contract/src/index.ts)
- [packages/shared/src/api/weather.api.ts](../../packages/shared/src/api/weather.api.ts)
- [packages/shared/src/hooks/useWeather.ts](../../packages/shared/src/hooks/useWeather.ts)
- [packages/shared/src/hooks/useMyLocationGlance.ts](../../packages/shared/src/hooks/useMyLocationGlance.ts)
- [packages/shared/src/hooks/useAirLocation.ts](../../packages/shared/src/hooks/useAirLocation.ts)
- [packages/shared/src/stores/airLocationStore.ts](../../packages/shared/src/stores/airLocationStore.ts)
- [packages/shared/src/weather/weatherDaily.ts](../../packages/shared/src/weather/weatherDaily.ts)
- [packages/shared/src/weather/weatherMessages.ts](../../packages/shared/src/weather/weatherMessages.ts)
- [packages/shared/src/index.ts](../../packages/shared/src/index.ts)
- [packages/utils/src/weather.ts](../../packages/utils/src/weather.ts)
- [packages/utils/src/weather.test.ts](../../packages/utils/src/weather.test.ts) — 37건
- [packages/utils/src/weatherRegions.ts](../../packages/utils/src/weatherRegions.ts)
- [packages/utils/src/dateLabel.ts](../../packages/utils/src/dateLabel.ts)
- [packages/utils/src/index.ts](../../packages/utils/src/index.ts)
- [apps/web/src/routes/WeatherPage.tsx](../../apps/web/src/routes/WeatherPage.tsx)
- [apps/web/src/routes/WeatherPage.test.tsx](../../apps/web/src/routes/WeatherPage.test.tsx) — 6건
- [apps/web/src/components/weather/MyLocationChip.tsx](../../apps/web/src/components/weather/MyLocationChip.tsx)
- [apps/web/src/components/weather/MyLocationChip.test.tsx](../../apps/web/src/components/weather/MyLocationChip.test.tsx) — 4건
- [apps/web/src/components/weather/WeatherNowHero.tsx](../../apps/web/src/components/weather/WeatherNowHero.tsx)
- [apps/web/src/components/weather/WeatherMeteogram.tsx](../../apps/web/src/components/weather/WeatherMeteogram.tsx)
- [apps/web/src/components/weather/WeatherDailyStrip.tsx](../../apps/web/src/components/weather/WeatherDailyStrip.tsx)
- [apps/web/src/components/weather/WeatherSeaSection.tsx](../../apps/web/src/components/weather/WeatherSeaSection.tsx)
- [apps/web/src/components/weather/WeatherVersions.tsx](../../apps/web/src/components/weather/WeatherVersions.tsx)
- [apps/web/src/components/weather/WeatherLegend.tsx](../../apps/web/src/components/weather/WeatherLegend.tsx)
- [apps/web/src/components/weather/WeatherPrimitives.tsx](../../apps/web/src/components/weather/WeatherPrimitives.tsx)
- [apps/web/src/components/weather/weatherFormat.ts](../../apps/web/src/components/weather/weatherFormat.ts)
- [apps/web/src/components/weather/weatherIcons.tsx](../../apps/web/src/components/weather/weatherIcons.tsx)
- [apps/web/src/components/weather/weatherDaily.ts](../../apps/web/src/components/weather/weatherDaily.ts) — shared 재수출
- [apps/web/src/App.tsx](../../apps/web/src/App.tsx) — `/weather` lazy 라우트
- [apps/web/src/components/PublicSidebar.tsx](../../apps/web/src/components/PublicSidebar.tsx) — 메뉴 순서
- [apps/web/src/components/PublicTopBar.tsx](../../apps/web/src/components/PublicTopBar.tsx) — NAV + `MyLocationChip` 상주
- [apps/web/src/styles/tailwind.css](../../apps/web/src/styles/tailwind.css) — `--weather-temp`/`--weather-precip`
- [apps/mobile/app/weather/index.tsx](../../apps/mobile/app/weather/index.tsx)
- [apps/mobile/src/components/weather/WeatherNowCard.tsx](../../apps/mobile/src/components/weather/WeatherNowCard.tsx)
- [apps/mobile/src/components/weather/WeatherHourlyCard.tsx](../../apps/mobile/src/components/weather/WeatherHourlyCard.tsx)
- [apps/mobile/src/components/weather/WeatherDailyCard.tsx](../../apps/mobile/src/components/weather/WeatherDailyCard.tsx)
- [apps/mobile/src/components/weather/WeatherOutlookCard.tsx](../../apps/mobile/src/components/weather/WeatherOutlookCard.tsx)
- [apps/mobile/src/components/weather/WeatherSeaCard.tsx](../../apps/mobile/src/components/weather/WeatherSeaCard.tsx)
- [apps/mobile/src/components/weather/WeatherPlaceBar.tsx](../../apps/mobile/src/components/weather/WeatherPlaceBar.tsx)
- [apps/mobile/src/components/weather/WeatherPlacePicker.tsx](../../apps/mobile/src/components/weather/WeatherPlacePicker.tsx)
- [apps/mobile/src/components/weather/WeatherGlyph.tsx](../../apps/mobile/src/components/weather/WeatherGlyph.tsx)
- [apps/mobile/src/lib/weatherGlyph.ts](../../apps/mobile/src/lib/weatherGlyph.ts)
- [apps/mobile/src/components/home/MyLocationCard.tsx](../../apps/mobile/src/components/home/MyLocationCard.tsx)
- [apps/mobile/app/(tabs)/home.tsx](../../apps/mobile/app/(tabs)/home.tsx) — 홈 카드 배치
- [apps/mobile/src/lib/api-setup.ts](../../apps/mobile/src/lib/api-setup.ts) — `setAirLocationStorage(AsyncStorage)`
