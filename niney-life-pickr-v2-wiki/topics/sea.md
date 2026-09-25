---
topic: sea
last_compiled: 2026-09-26
sources_count: 51
status: active
aliases: [바다, sea, /sea, 바다 페이지, 해양 예보, 국립해양조사원, KHOA, khoa, 1192136, 생활해양예보지수, 해양예보지수, 해수욕, 해수욕 지수, 서핑, 서핑 지수, 바다낚시, 낚시 지수, 갯벌체험, 갯벌, 바다갈라짐, 바닷길, 모세의 기적, 바다여행, 조석예보, 고·저조, 물때, 만조, 간조, 이안류, 이안류 지수, 15142484, 15142490, 15142486, 15142489, 15142485, 15142491, 15156018, 15156028, fcstBeachv2, fcstSurfingv2, fcstFishingv2, fcstMudflatv2, fcstSeaSplitv2, fcstSeaTripv2, tideFcstHghLw, GetTideFcstHghLwApiService, ripCurrent, GetRipCurrentApiService, gubun, 갯바위, predcNoonSeCd, predcYmd, totalIndex, extrSe, predcDt, predcTdlvVl, obsCode, reqDate, beachCode, obsrvnDt, lastScrCn, khoa.adapter, KhoaApiError, interpretKhoaResponse, callKhoaPage, callKhoaAll, KHOA_PATHS, KHOA_PAGE_SIZE, KHOA_BASE_URL, SeaService, SeaServiceError, toSeaSlot, groupSeaSpots, mergeSlots, latestRip, attachRips, SEA_FORECAST_TTL_MS, SEA_TIDE_TTL_MS, SEA_STALE_MAX_MS, sea.route, Routes.Sea, SeaActivity, SeaForecastQuery, SeaForecastResult, SeaSlot, SeaSpot, SeaVariant, SeaRip, SeaTideQuery, SeaTideExtreme, SeaTideResult, seaApi, useSeaForecast, useSeaTide, SEA_ACTIVITIES, SEA_ACTIVITY_LABEL, SEA_ACTIVITY_HINT, isSeaActivity, seaActivityHasPeriod, SEA_INDEX_LABEL, SEA_INDEX_COLOR, seaIndexLevelOf, seaIndexColor, SEA_RIP_LABEL, SEA_RIP_COLOR, seaRipLevelOf, isSeaRipSeason, nearestSeaTideStation, matchSeaRipBeach, seaTideKindOf, buildSeaSpotMarkerDataUrl, seaStations, SEA_TIDE_STATIONS, SEA_RIP_BEACHES, 조석 예보지점 166, 이안류 해수욕장 10, SeaPage, SeaMap, SeaSpotDetail, seaFormat, seaSlotFor, rankSeaSpots, seaSlotSummary, formatSeaDistance, variants, 어종별 지수, 등급별 지수, 7일 지수 띠, poolKey sea, DATA_GO_KR_API_KEY, 중기해상예보와 구분]
---

# sea — 바다(국립해양조사원 생활해양예보지수 6종 · 물때 · 이안류 프록시, 웹 `/sea`)

**2026-09-24~09-26 변경 흡수 — 신규 토픽, 바다 페이지(`4a2bff1`) + 외부 API 문서 summary(`1b621c4`)**: 2026-09-24 19:37 `4a2bff1` 로 "이번 주 바다 어디 갈까" 를 고르는 공개 페이지 `/sea`("바다", 사이드바 날씨 바로 다음)가 들어왔다. 국립해양조사원(KHOA)이 data.go.kr 로 내는 생활해양예보지수 6종 — 해수욕 15142484 · 서핑 15142490 · 바다낚시 15142486 · 갯벌체험 15142489 · 바다갈라짐(바닷길) 15142485 · 바다여행 15142491 — 의 7일 오전/오후 5단계 지수를 friendly `modules/sea/` 가 **활동 하나 = 전국 전량(300행 페이지 1~6장)** 으로 받아 1시간 메모리 캐시하고, 조석예보(고·저조) 15156018 은 좌표에서 가장 가까운 예보지점(utils 좌표표 166곳) × 날짜 단위로 12시간, 이안류 15156028 은 6~9월에만 해수욕 응답에 해수욕장 10곳의 최신 관측을 붙인다. 업스트림이 실패하면 12시간 안의 마지막 값을 `stale:true` 로 준다. **DB 테이블·적재 스크립트·배포 단계 없음**(API 만 — `docs/data-sources.md`). 웹은 활동 탭 × 날짜 × 오전/오후를 URL(`?a&d&p&sel`)에 두고 지도 마커색·순위 목록·지점 상세(7일 지수 띠·어종/등급 `variants` 칩·이안류·물때)를 그린다. 계약 `schemas/sea.ts`·`Routes.Sea`(forecast·tide), shared `seaApi`·`useSeaForecast`·`useSeaTide`, utils `sea.ts`·`seaStations.ts`. **앱(`apps/mobile`)은 미구현**. 같은 날 20:34 `1b621c4` 가 두 라우트에 한국어 `summary`·`description` 을 달아 `docs/api/endpoints.md` 의 `## sea` 절(공개·60/분 2행)로 외부 문서화했다([api-docs](api-docs.md)) — 동작 변경 없음. 기상청 해상 중기예보(`/weather?sea=`)와는 원천·단위·용도가 다른 별개 도메인이다([weather](weather.md)).

## Purpose [coverage: high — 9 sources]

바다 레저·나들이 계획용으로 "어느 바다가 언제 좋은가" 를 **공개·비로그인**으로 보여주는 도메인. 소비자는 지금 하나 — 웹 [`/sea`](../../apps/web/src/routes/SeaPage.tsx)(PublicLayout 아래 lazy 라우트, [App.tsx](../../apps/web/src/App.tsx)). 활동 6개 중 하나를 고르면 전국 지점의 선택 날짜·시간대 지수를 지도 마커 색과 순위 목록으로 보여 주고, 지점을 누르면 7일 × 오전/오후 지수 띠, 선택 슬롯 수치(파고·파주기·수온·기온·바람·물때 단계·날씨·개장 여부·체험/갈라짐 시각), 어종/등급별 지수, 이안류(해수욕, 6~9월), 가장 가까운 조석 예보지점의 만조·간조(물때)를 한 패널에 싣는다. 2026-09-24 `1b621c4` 이후로는 CORS 개방·`docs/api` 문서로 **다른 프로젝트가 브라우저에서 직접 부를 수 있는 공개 프록시**이기도 하다([README](../../docs/api/README.md) 6절 "바다" — 물때는 lat·lng·date 필수이고 서버가 최근접 예보지점을 고름, 이안류는 6~9월만).

원천은 전부 data.go.kr 의 국립해양조사원 API 8종 — 생활해양예보지수 6종 + 조석예보 + 이안류. 키는 계정 공용 `DATA_GO_KR_API_KEY`(날씨·대기·버스·집값·주차와 같은 값, 데이터셋마다 **활용신청만 추가** — 8건)이고, 개발계정 자동승인에 **데이터셋별 일 10,000건**(운영계정 전환은 심의)이다([env.ts](../../apps/friendly/src/config/env.ts)·[.env.example](../../apps/friendly/.env.example) 공용 키 주석). 키가 비면 두 라우트 모두 503. 예보는 하루 몇 번만 바뀌는 7일치를 매번 전량으로 주므로 **적재하지 않고 메모리 캐시 프록시**로만 운영한다([data-sources.md](../../docs/data-sources.md) "바다(/sea)도 API 만" 문단).

**[weather](weather.md) 의 해상 예보와 다른 점** — `/weather` 의 "중기해상"([WeatherSeaSection](../../apps/web/src/components/weather/WeatherSeaSection.tsx), `?sea=<regId>`)은 **기상청** 중기예보(15059468) `getMidSeaFcst` 로, 12 해역([weatherRegions.ts](../../packages/utils/src/weatherRegions.ts) `WEATHER_MID_SEA_REGIONS` — 서해북부~동해북부 8 + 대화퇴·동중국해·규슈·연해주)의 **D+4~D+10** 날씨 문구 + 파고 최저~최고(m)를 색 없이 숫자로 보여 주는 **해역 단위 기상 예보**다. `/sea` 는 **국립해양조사원**이 해수욕장·서핑 해변·낚시 포인트·갯벌 마을·바닷길 명소·해안 권역 **지점 단위**로 산출한 **활동 적합도 5단계 지수**(D+0부터 7일 — 오전/오후 구분은 앞 사흘까지, 갯벌·바닷길은 늘 하루 한 번)에 천문조 물때와 이안류 실측을 더한 **레저 판단용** 화면이다. 키 이름·`toServiceKeyPart`·`RATE.transitRealtime`·`replyUpstreamError`·메모리 캐시 골격은 같지만 모듈·캐시·계약은 완전히 따로이고, 두 화면은 서로 링크하지 않는다(메뉴에서 이웃할 뿐 — [PublicSidebar](../../apps/web/src/components/PublicSidebar.tsx) `날씨 · 바다 · 대기질`).

## Architecture [coverage: high — 20 sources]

날씨·대기와 같은 한 방향 레이어드 프록시다 — 어댑터가 봉투를 해석하고, 서비스가 캐시·정규화를 얹고, 라우트가 HTTP 상태로 바꾸고, 계약(zod)이 FE/BE 를 묶고, shared 가 API·훅을, utils 가 활동·지수·색·좌표표·마커를, 웹이 UI 를 맡는다. 날씨와 달리 **일일 쿼터 카운터와 발표 슬롯 계산이 없고**, 캐시 TTL 은 고정값(1h/12h)이다.

```
웹 /sea (SeaPage — URL ?a=활동 &d=YYYY-MM-DD &p=am|pm &sel=지점 id, 전부 replace 갱신)
  헤더: 활동 탭 6(role=tablist) · SEA_ACTIVITY_HINT · 날짜 버튼(dates) · 오전/오후(갯벌·바닷길 숨김) · 내 위치 버튼 · 갱신 HH:MM(저장본)
  본문(lg 이상: 지도 | 380px 패널, 그 아래 폭은 세로로 쌓임):
     SeaMap (MapCanvas poolKey="sea", 지수색 원/핀, 내 위치 overlay)  |  순위 <ol>(rankSeaSpots)  또는  SeaSpotDetail(sel 있을 때)
  푸터: 5단계 범례 + 체험불가·예보 없음 + 출처(국립해양조사원, 공공누리 제1유형)
     │  useSeaForecast(activity) · useSeaTide({lat,lng}, date) · useUserLocation({auto:false}) · useMapPublicConfig
  @repo/shared : api/sea.api.ts(seaApi.forecast / seaApi.tide) · hooks/useSea.ts(2 훅)
  @repo/utils  : sea.ts(활동·지수 단계·색·이안류·극치구분·최근접·마커) · seaStations.ts(조석 예보지점 166 · 이안류 해수욕장 10)
     │  ↕ @repo/api-contract: schemas/sea.ts · routes.ts(Routes.Sea 2)
     ▼
  friendly modules/sea: sea.route.ts (GET 2, 공개, RATE.transitRealtime 60/분, replyUpstreamError 502/503)
        └ sea.service.ts  (SeaService — 캐시 Map + in-flight 합류 + stale 12h · 정규화 · 지점 묶음 · variants 병합 · 이안류 부착 · 물때)
             └ khoa.adapter.ts (봉투 해석 · 20초 타임아웃 · 1회 재시도 · 300행 페이지 순회 · 키 마스킹)
     ▼
  https://apis.data.go.kr/1192136/{fcstBeachv2|fcstSurfingv2|fcstFishingv2|fcstMudflatv2|fcstSeaSplitv2|fcstSeaTripv2|tideFcstHghLw|ripCurrent}/<Op>
```

### 어댑터 — `khoa.adapter.ts`

[khoa.adapter.ts](../../apps/friendly/src/modules/sea/khoa.adapter.ts)(170줄): `KHOA_BASE_URL = 'https://apis.data.go.kr/1192136'` 에 HTTPS GET, 쿼리 `serviceKey` + `type=json`. 8 오퍼레이션이 같은 봉투를 쓴다. `interpretKhoaResponse(status, rawText, requestUrl)` 가 `{page}` 또는 `{error, retryable}` 을 돌려준다(프로브 실측 2026-09-24 기준 주석):

| 응답 | 판정 | 결과 |
|---|---|---|
| `{header:{resultCode:'00'}, body:{items:{item:[…]}, totalCount}}` | 정상 — **기상청과 달리 `response` 감싸개가 없다**. `items.item` 이 배열이든 단건 객체든 배열로 펴고, `totalCount` 가 없으면 items 길이. 숫자는 숫자·숫자 문자열이 섞여 온다 | page |
| `resultCode '03'` | 데이터 없음 | **빈 page**(에러 아님) |
| `resultCode '10'`(잘못된 값)·`'11'`(필수 파라미터 누락) 등 그 밖 | 업스트림 오류 | `KhoaApiError` 502, 재시도 없음 |
| `OpenAPI_ServiceResponse.cmmMsgHeader.returnReasonCode` 20·21·22·30·31·32·33 | 게이트웨이 인증·쿼터(미신청 키 30 은 HTTP 403 으로 옴) | `KhoaApiError` **503**, 재시도 없음 |
| 게이트웨이 04·05 | 게이트웨이 타임아웃류 | 502, **1회 재시도** |
| JSON 파싱 실패 | HTTP ≥500 이면 재시도 대상 | 502 |
| fetch 예외(네트워크·20초 abort) | — | 502, 1회 재시도 |

`callKhoaPage(path, params, opts)`: 타임아웃 20초(`AbortController` — 호출측 `signal` 을 주면 그것만), 재시도 간격 700ms, 최대 2회 시도. 평문 키가 든 URL(`toServiceKeyPart` — [bus 어댑터](../../apps/friendly/src/modules/bus/bus-api.adapter.ts)의 data.go.kr Encoding 키 이중 인코딩 회피)은 fetch 에만 쓰고, 보관·로그용 `requestUrl` 은 `serviceKey=***`, fetch 예외 메시지도 `scrubKey` 로 가린다. `KhoaApiError{statusCode(기본 502), code, requestUrl, responseText}` 는 `replyUpstreamError` 가 warn 로그에 싣는 진단 필드 이름과 맞춰져 있다. `callKhoaAll(path, params, opts, callPage?)`: `numOfRows = KHOA_PAGE_SIZE 300`(가이드 최대)·`pageNo 1..` 을 **순차로** 넘기며 누적이 `totalCount` 에 닿거나 빈 페이지가 오면 멈춘다(상한 `MAX_PAGES 20` = 6,000행). 가장 큰 바다낚시 1,750행 = 6페이지.

`KHOA_PATHS`(경로는 코드, 데이터셋 번호는 env 주석의 활동명 대응):

| 키 | 경로 | 데이터셋 |
|---|---|---|
| `beach` | `fcstBeachv2/GetFcstBeachApiServicev2` | 15142484 해수욕 |
| `surf` | `fcstSurfingv2/GetFcstSurfingApiServicev2` | 15142490 서핑 |
| `fishing` | `fcstFishingv2/GetFcstFishingApiServicev2` | 15142486 바다낚시 — `gubun`(갯바위·선상) 필수지만 값과 무관하게 같은 전량 |
| `mudflat` | `fcstMudflatv2/GetFcstMudflatApiServicev2` | 15142489 갯벌체험 |
| `seaSplit` | `fcstSeaSplitv2/GetFcstSeaSplitApiServicev2` | 15142485 바다갈라짐 |
| `seaTrip` | `fcstSeaTripv2/GetFcstSeaTripApiServicev2` | 15142491 바다여행 |
| `tide` | `tideFcstHghLw/GetTideFcstHghLwApiService` | 15156018 조석예보(고·저조) |
| `rip` | `ripCurrent/GetRipCurrentApiService` | 15156028 이안류 지수 |

### 서비스 — `sea.service.ts`

[sea.service.ts](../../apps/friendly/src/modules/sea/sea.service.ts)(329줄) `SeaService({serviceKey, callPage?, now?})` — 라우트 플러그인이 한 번 만드는 **단일 인스턴스**(날씨는 식단 추천이 `WeatherService` 를 하나 더 만들어 캐시가 둘로 갈리지만, 바다는 라우트 인스턴스 하나뿐). `callPage`·`now` 는 테스트 주입용.

**캐시** `cached(key, ttlMs, load)`: TTL 안 엔트리면 그대로 → 아니면 같은 키 in-flight Promise 에 합류(없으면 시작하고 `finally` 로 제거) → 성공 시 `{data, fetchedAt, expiresAt}` 저장 → 실패 시 이전 엔트리가 `SEA_STALE_MAX_MS`(12시간) 안이면 `stale:true` 로 서빙, 아니면 throw. 상수 `SEA_FORECAST_TTL_MS = 1h`, `SEA_TIDE_TTL_MS = 12h`, `SEA_STALE_MAX_MS = 12h`. 키가 비면 `opts()` 가 캐시보다 먼저 `SeaServiceError('DATA_GO_KR_API_KEY 가 설정되지 않았습니다', 503)`.

**`getForecast(activity)`** — 키 `forecast:${activity}`: `callKhoaAll(KHOA_PATHS[activity], fishing 이면 {gubun:'갯바위'} 아니면 {})` → `groupSeaSpots` → (beach 면) `attachRips` → `{activity, dates, spots, fetchedAt, stale}`. 활동당 한 키라 정상 상태에선 업스트림 호출이 **사용자·좌표와 무관하게 활동 6개 × 시간당 1회**로 묶인다(서비스 머리 주석: 갱신당 1~6콜, 활동 6 × 하루 24회 ≈ 300콜 — 개발계정 일 10,000건에 한참 못 미침). 단, 실패는 캐시하지 않으므로 업스트림 장애 중엔 요청마다 다시 시도한다(Gotchas).

**정규화** `toSeaSlot(activity, row)` — 활동마다 다른 원문 필드를 한 `SeaSlot` 모양으로(없는 값 null). 공통: `predcYmd`(YYYY-MM-DD 가 아니면 행을 버림) → `date`, `totalIndex` 원문 라벨 → `label` + `seaIndexLevelOf` → `level`, `predcNoonSeCd` '오전'→`am` / '오후'→`pm` / 그 밖(원문 '일' = 하루 예보) → `null`. 숫자는 `numOrNull`, 문자열은 `coerceStrOrNull` + trim([narrow.ts](../../apps/friendly/src/lib/narrow.ts)).

| 활동 | 지점명 필드 | period | variants 이름 | 수치 매핑(2026-09-24 실측 필드명) |
|---|---|---|---|---|
| beach | `bbchNm` | ○ | — | `maxWvhgt`→waveM · `avgWtem`→waterTempC · `avgArtmp`→airTempC · `maxWspd`→windMs · `opnStat`→openStatus('개장'/'폐장') |
| surf | `surfPlcNm` | ○ | `grdCn`(초급·중급·상급) | `avgWvhgt`→waveM · `avgWvpd`→wavePeriodS · `avgWspd` · `avgWtem` |
| fishing | `seafsPstnNm` | ○ | `seafsTgfshNm`(대상 어종) | `tdlvHrCn`→tidePhase(물때 단계, 예: 중조기) · `maxWvhgt` · `minWtem/maxWtem` 가운데 · `minArtmp/maxArtmp` 가운데 · `maxCrsp`→currentMs · `maxWspd` |
| mudflat | `mdftExpcnVlgNm` | ✕(항상 null) | — | `mdftExprnBgngTm/EndTm`→timeFrom/timeTo('9:00'→'09:00') · 기온 가운데 · `maxWspd` · `weather` |
| seaSplit | `splocPstnNm` | ✕ | — | `splocBgngDt/EndDt`→timeFrom/timeTo · 기온 가운데 · `maxWspd` · `weather` |
| seaTrip | `sareaDtlNm` | ○ | — | `tdlvHrCn` · `avgArtmp` · `avgWspd` · `avgWtem` · `avgWvhgt` · `avgCrsp`→currentMs · `weather` |

("가운데" = `mid(lo, hi)` — 최소·최대 평균 소수 1자리, 한쪽만 있으면 그 값. 좌표는 모든 활동 `lat`·`lot`.)

**지점 묶음** `groupSeaSpots(activity, rows)`: 지점명·`lat`·`lot` 이 없거나 슬롯이 null 인 행은 버리고, `이름|lat 4자리|lng 4자리` 키로 묶는다. 같은 이름이 좌표를 달리해 두 번 이상 나오면 id 를 `이름@lat3,lng3`(소수 3자리), 아니면 이름 그대로. 슬롯은 날짜 → 오전·오후(null 은 오전과 같은 순위) → 원문 순으로 **안정 정렬**한 뒤 `mergeSlots` — 같은 날짜·시간대 슬롯을 하나로 합치며 `variants` 를 원문 순으로 이어 붙이고, 슬롯 `level/label` 은 **가장 좋은 세부 값**(0 체험불가 < 1 매우나쁨 … < 5 매우좋음). 지점은 이름 가나다(`localeCompare(…, 'ko')`), `dates` 는 등장한 날짜 오름차순. 효과: 바다낚시 원문 1,750행 → 슬롯 ~700개, 응답 440→196KB(계약 주석·커밋 본문).

**이안류** `attachRips(spots)`: `kmaTodayIsoDate(now)` 의 KST 월이 `isSeaRipSeason`(6~9)일 때만, `SEA_RIP_BEACHES` 10곳을 **병렬**로 `{beachCode, numOfRows:'300', pageNo:'1'}` 한 장씩 → `latestRip(code, rows)`(관측 시각 `obsrvnDt` 문자열 최댓값 1행 → `{code, level: seaRipLevelOf(lastScrCn), label, observedAt, waveM: wvhgt}`) → 해수욕 지점마다 `matchSeaRipBeach(spot.name, spot)`(이름 공백 무시 일치 우선, 아니면 2km 안 최근접)로 `spot.rip` 에 붙인다. 한 곳 실패는 `catch {}` 로 그 곳만 비고 예보는 그대로. 이안류는 해수욕 캐시 엔트리 **안에** 같이 저장된다.

**물때** `getTide(lat, lng, date)`: `nearestSeaTideStation({lat, lng})`(utils, haversine) → 키 `tide:${station.code}:${date}` 12시간 → `{obsCode, reqDate: YYYYMMDD, numOfRows:'10', pageNo:'1'}` 1콜 → 행마다 `predcDt`('YYYY-MM-DD HH:MM')가 요청 날짜로 시작하고 `seaTideKindOf(extrSe)` 가 high/low 인 것만 `{time:'HH:MM', kind, levelCm: predcTdlvVl}` → 시각순. 업스트림이 다음 날 행까지 섞어 줘서(테스트 표본의 09-25 03:50 행) 날짜 필터가 필요하다. 응답 `station{code, name, lat, lng, distM}` 에 최근접 거리를 싣는다.

### 라우트 — `sea.route.ts`

[sea.route.ts](../../apps/friendly/src/modules/sea/sea.route.ts)(62줄 — `*.route.ts` autoload, [app.ts](../../apps/friendly/src/app.ts) `matchFilter`·`dirNameRoutePrefix:false`): 두 GET 모두 `config.rateLimit: RATE.transitRealtime` + `tags:['sea']` + querystring zod + `response {200, 502: ErrorResponseSchema, 503: ErrorResponseSchema}`. 핸들러는 서비스 호출을 try/catch 해 `replyUpstreamError(req, reply, e, [502, 503], '바다 예보 조회 실패' / '물때 조회 실패')` — 5xx 는 warn 로그(마스킹 URL·업스트림 코드·응답 300자) 후 직접 응답(전역 error-handler 가 5xx 를 500 으로 뭉개므로 — 날씨와 동일), 그 밖은 rethrow. 400 은 zod. `1b621c4` 에서 `summary`·`description` 만 추가됐다(API Surface).

### utils — `sea.ts` · `seaStations.ts`

[sea.ts](../../packages/utils/src/sea.ts)(124줄) — 서버 정규화·웹 표시·마커가 같은 라벨·색·순서를 쓰도록 모은 공용 규칙:

- **활동** `SEA_ACTIVITIES = ['beach','surf','fishing','mudflat','seaSplit','seaTrip']`(탭 순서 = 여름 대표 → 연중 레저 → 체험 → 여행 권역), `SEA_ACTIVITY_LABEL`(해수욕·서핑·바다낚시·갯벌체험·바닷길·바다여행), `SEA_ACTIVITY_HINT`(탭 아래 한 줄 — 예: 바닷길 "바다갈라짐(모세의 기적) 명소의 길이 열리는 시간"), `isSeaActivity`, `seaActivityHasPeriod`(갯벌·바다갈라짐만 false — 하루 한 번 체험 시각).
- **지수** `SeaIndexLevel 0|1..5`, `SEA_INDEX_LABEL{0 체험불가, 1 매우나쁨, 2 나쁨, 3 보통, 4 좋음, 5 매우좋음}`, `seaIndexLevelOf`(공백 제거 뒤 라벨 일치 — '매우 나쁨' 도 1, 모르면 null), `SEA_INDEX_COLOR{5 #0284c7 파랑 · 4 #16a34a 초록 · 3 #ca8a04 노랑 · 2 #ea580c 주황 · 1 #dc2626 빨강 · 0 #6b7280 회색 · none #9ca3af 연회색}`, `seaIndexColor(level)`(0~5 정수가 아니면 none).
- **이안류** `SeaRipLevel 1..4`, `SEA_RIP_LABEL{1 관심, 2 주의, 3 경계, 4 위험}`, `SEA_RIP_COLOR{#0284c7 · #ca8a04 · #ea580c · #dc2626}`, `seaRipLevelOf`, `isSeaRipSeason(month)` = 6~9.
- **최근접** `nearestSeaTideStation(p)` — 166곳 haversine 최소 + `distM`(반올림), `matchSeaRipBeach(name, p, maxM = 2000)`.
- **조석 극치구분** `seaTideKindOf(extrSe)` — 1 오전 고조 · 2 오전 저조 · 3 오후 고조 · 4 오후 저조 → 홀수 `high` / 짝수 `low`, 1~4 밖 null.
- **마커** `buildSeaSpotMarkerDataUrl(level, selected)` — 비선택 26×26 원 / 선택 32×48 핀([markerFrame.ts](../../packages/utils/src/markerFrame.ts) `buildCircleMarkerSvg`/`buildPinMarkerSvg` — 식당·버스·대기와 같은 프레임), 채움 = 지수색, 안쪽 흰 물결 3줄, `data:image/svg+xml` URL.

`sea.ts` 가 `export * from './seaStations.js'` 로 좌표표를 다시 내보내므로 [index.ts](../../packages/utils/src/index.ts) 에는 `./sea.js` 한 줄만 추가됐다. [seaStations.ts](../../packages/utils/src/seaStations.ts)(196줄)는 `SEA_TIDE_STATIONS` **166곳**과 `SEA_RIP_BEACHES` **10곳**의 `{code, name, lat, lng}` 표(Data 절) — 가이드 코드표에 좌표가 없어 2026-09-24 지점마다 1회 호출해 응답의 `obsvtrNm·lat·lot` 을 받아 **코드로 커밋**했다.

### 계약·shared

- [schemas/sea.ts](../../packages/api-contract/src/schemas/sea.ts)(107줄) — 스키마 목록은 API Surface. `Routes.Sea` 는 [routes.ts](../../packages/api-contract/src/routes.ts) 날씨 블록 바로 다음.
- [sea.api.ts](../../packages/shared/src/api/sea.api.ts): `seaApi.forecast(activity)` · `seaApi.tide(lat, lng, date)`(좌표는 소수 5자리로 직렬화), `apiFetch`(토큰 불필요).
- [useSea.ts](../../packages/shared/src/hooks/useSea.ts): `useSeaForecast(activity)`(stale 30분·재조회 60분, **placeholderData 없음** — 활동 전환 시 이전 활동 지점을 들고 있지 않음) · `useSeaTide(point, date)`(point·date 둘 다 있을 때만, 키 좌표 소수 3자리 ≈100m, stale 6시간 — 천문조 계산값).

### 웹 — `SeaPage` + `components/sea/*`

[SeaPage.tsx](../../apps/web/src/routes/SeaPage.tsx)(251줄): **URL 이 상태**. `a` 가 활동이 아니면 beach. `d` 는 응답 `dates` 에 있으면 그 날, 없으면 오늘(KST `todayKst`)이 있으면 오늘, 아니면 첫 날. `p` 는 am/pm 이 아니면 **지금 KST 12시 이후면 pm**(`isAfternoonKst`). `sel` = 지점 id. 모든 갱신은 `setParams(prev => patch, {replace:true})`(활동 탭은 `sel` 만 지우고 `d`·`p` 는 유지). 헤더: 제목·설명, 활동 탭(`role=tablist`·`aria-selected`), 힌트, 날짜 버튼(`relativeDayLabel` — 오늘/내일/모레/M/D, title 에 요일), 오전/오후 세그먼트(갯벌·바닷길은 숨김), "내 위치로 거리 보기 / 내 위치 갱신"(`useUserLocation({auto:false})` — 누를 때만 측위), "갱신 HH:MM"(`fetchedAt` KST) + stale 이면 "(저장본)". 본문은 `max-w-6xl` 문서형 페이지 안 `lg:grid-cols-[minmax(0,1fr)_380px]` — 지도 상자(360px, lg 600px) | 패널(lg 600px 세로 스크롤). 패널: 로딩 문구 → `sel` 이 순위 안에 있으면 `SeaSpotDetail`(`key=spot.id`), 아니면 순위 `<ol data-testid="sea-list">`(순번·지수색 점·이름·라벨 또는 '예보 없음'·거리·한 줄 요약, 0건이면 "예보 지점이 없습니다."). 에러는 문구 하나("바다 예보를 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요."). 푸터: 5단계 범례 + "체험불가·예보 없음" + "바다낚시·서핑은 어종·등급 중 가장 좋은 지수로 색칠", 출처 khoa.go.kr 링크·공공누리 제1유형·"물때는 가장 가까운 조석 예보지점 기준이라 실제 지점과 수십 분 차이 날 수 있습니다".

[seaFormat.ts](../../apps/web/src/components/sea/seaFormat.ts)(순수 함수, 테스트 대상): `seaSlotFor(spot, activity, date, period)` — 오전/오후 없는 활동은 그날 첫 슬롯, 있으면 같은 시간대 → 없으면 그날 첫 슬롯(= D+3 이후 '일' 슬롯). `rankSeaSpots(spots, activity, date, period, me)` — 지수 높은 순(없음은 −1 로 맨 뒤, 체험불가 0 은 그 앞), 같으면 내 위치가 있을 때 가까운 순(`approxDistanceM` 등거리 근사), 그다음 이름. `seaSlotSummary(activity, slot)` — 갯벌·바닷길은 "체험/갈라짐 HH:MM~HH:MM" 먼저, 이어 파고·주기·수온(수온이 없을 때만 기온)·바람·물때 단계·날씨·개장 여부를 ` · ` 로. `formatSeaDistance` — 1km 미만 m, 10km 미만 소수 1자리 km, 그 이상 정수 km.

[SeaMap.tsx](../../apps/web/src/components/sea/SeaMap.tsx): VWorld 키를 `useMapPublicConfig`([useSettingsMap.ts](../../packages/shared/src/hooks/useSettingsMap.ts) — 404 = 키 미등록 → "지도 키(vworld)가 설정되지 않아 지도를 표시할 수 없습니다" 안내)로 받아 [MapCanvas](../../apps/web/src/components/restaurant/MapCanvas.tsx)(OpenLayers)에 `markers`(지수 단계 7종 원/핀 아이콘을 모듈 로드 시 한 번 생성) + `overlayMarkers`(내 위치 — fit 범위 밖 보조 레이어, 클릭 무시) + `poolKey="sea"`(언마운트해도 OL Map 을 풀에 보관해 재진입 시 타일·뷰포트 유지) + `initialCenter {lat 36.0, lng 127.8, zoom 7}`(남한 해안 전체)을 넘긴다. 라벨은 선택 지점 + 순위 상위 3곳 중 '좋음' 이상만(해안선에 지점이 몰려 전부 달면 겹친다). 선택이 바뀌면 `flyToZoomIn(lat, lng, 11)`(줌아웃 안 함) — 선택 지점 좌표 문자열만 deps 로 잡아 날짜·시간대 전환으로는 다시 날지 않는다(지도는 외부 시스템이라 effect).

[SeaSpotDetail.tsx](../../apps/web/src/components/sea/SeaSpotDetail.tsx): 이름·"내 위치에서 N km"·'목록' 버튼 → **7일 지수 띠**(열 = 날짜, 오전/오후가 있으면 위아래 두 칸, 하루 예보면 두 칸 높이 한 칸 — 누르면 URL `d`·`p` 갱신, 선택 칸에 링) → 선택 슬롯 카드(날짜 + 오전/오후/하루, 라벨 알약, 요약 또는 '세부 수치 없음', `variants` 칩 — `aria-label` '어종별 지수'(낚시)/'등급별 지수'(서핑)) → 이안류 줄(4단계 색 알약 + "HH:MM 관측") → 물때(`useSeaTide` — "· ○○ 기준(거리)" + 만조(하늘색)/간조(호박색) 칩 `HH:MM` + cm, 없으면 "이 날짜의 물때 예보가 없습니다.").

## Talks To [coverage: high — 19 sources]

- **국립해양조사원(data.go.kr)** — `https://apis.data.go.kr/1192136/<서비스>/<오퍼레이션>`, HTTPS GET, `serviceKey` + `type=json` + `numOfRows`/`pageNo`(+ 오퍼레이션별 `gubun`·`obsCode`·`reqDate`·`beachCode`). 서버 전용(키 노출 금지) — 브라우저는 friendly 만 본다. 8 데이터셋 각각 활용신청이 필요하고 미신청은 게이트웨이 30(HTTP 403) → 503.
- **[bus](bus.md) 어댑터** — `toServiceKeyPart` import. 2026-09-26 현재 이 헬퍼를 src 모듈 9개 파일(날씨·대기·음식·집값 2·일상지도·여행·주차·바다)이 가져다 쓰는 data.go.kr 공통 다리다.
- **[friendly](friendly.md) 공통** — `replyUpstreamError`([reply-upstream-error.ts](../../apps/friendly/src/lib/reply-upstream-error.ts) — 5xx warn + 502/503 직접 응답), `RATE.transitRealtime`(`{max: 60, timeWindow: '1 minute'}` — [rate-limit.ts](../../apps/friendly/src/plugins/rate-limit.ts)), `lib/narrow`(`coerceStrOrNull`·`intOrNull`·`numOrNull`·`isObject`), 모듈 autoload, env `DATA_GO_KR_API_KEY`([env.ts](../../apps/friendly/src/config/env.ts)).
- **[utils](utils.md)** — 도메인 표 `sea.ts`/`seaStations.ts` 외에 [geo.ts](../../packages/utils/src/geo.ts) `haversineM`(서버 최근접 지점·이안류 매칭)·`approxDistanceM`(웹 목록 거리), [weather.ts](../../packages/utils/src/weather.ts) `kmaTodayIsoDate`(= [dateLabel.ts](../../packages/utils/src/dateLabel.ts) 의 `todayKst` 재수출 — 서버는 이안류 기간 월 판정, 웹은 "오늘"), `relativeDayLabel`·`formatYmdWithWeekday`(날씨·대기와 같은 날짜 문구), [busMarker.ts](../../packages/utils/src/busMarker.ts) `buildMyLocationMarkerDataUrl`, `markerFrame`.
- **[shared](shared.md)** — `apiFetch`, [useUserLocation.ts](../../packages/shared/src/hooks/useUserLocation.ts)(`auto:false` 라 마운트 때 측위하지 않고 버튼이 `refetch` — 명시 요청은 10초 + TIMEOUT 1회 재시도, 비보안 컨텍스트는 `unavailable`), `useMapPublicConfig`([useSettingsMap.ts](../../packages/shared/src/hooks/useSettingsMap.ts), staleTime ∞·retry 없음).
- **[map](map.md)** — [MapCanvas](../../apps/web/src/components/restaurant/MapCanvas.tsx)(OL + VWorld 타일, `overlayMarkers`·`poolKey`·`flyToZoomIn`). 지도+바텀시트 골격([map-sheet-shell](../concepts/map-sheet-shell.md))은 **쓰지 않는다** — 문서형 페이지 안의 고정 높이 지도 상자.
- **[weather](weather.md)** — 원천·모듈이 따로(Purpose). 공유하는 것은 utils 날짜 헬퍼와 friendly 공통 다리뿐이고, "저장한 내 위치"([saved-location-glance](../concepts/saved-location-glance.md) — 날씨·대기·일상지도·주차의 기본 위치)도 쓰지 않는다.
- **[api-docs](api-docs.md)** — `1b621c4` summary/description → [endpoints.md](../../docs/api/endpoints.md) `## sea` 절 · [openapi.json](../../docs/api/openapi.json)(`x-auth: public`, `x-rate-limit {max 60, timeWindow '1 minute'}`), [README](../../docs/api/README.md) 오류 규약("공공 API 프록시(날씨·대기·버스·지하철·바다)는 업스트림이 실패해도 마지막 성공값을 `stale: true` 로")·한도 표("실시간 교통·날씨·대기·바다 60/분")·도메인 개요·출처 표기(국립해양조사원 — 공공누리 유형 확인). CORS 개방으로 다른 origin 의 브라우저가 직접 호출할 수 있다.
- **[web](web.md) 셸** — [App.tsx](../../apps/web/src/App.tsx) lazy `/sea`(PublicLayout, `/weather` 다음 줄), [PublicSidebar](../../apps/web/src/components/PublicSidebar.tsx) `{to:'/sea', label:'바다', icon: Waves}` · [PublicTopBar](../../apps/web/src/components/PublicTopBar.tsx) NAV(lg 이상에서만 보임) — 날씨 다음, 대기질 앞. 2026-09-26 현재 사이드바 순서 `홈 · 맛집 · 대중교통 · 주차 · 일상지도 · 집값 · 여행 · 날씨 · 바다 · 대기질 · 타로 · 사주(C) · 사주(G) · 식단(로그인)`.
- **앱** — 연결 없음(`apps/mobile` 에 sea API·훅·utils 사용처 0).

## API Surface [coverage: high — 13 sources]

| 메서드 | 경로 | 쿼리 | 응답 | 업스트림 콜(캐시 미스) | 서버 캐시 |
|---|---|---|---|---|---|
| GET | `/api/v1/sea/forecast` | `activity`* = `beach`·`surf`·`fishing`·`mudflat`·`seaSplit`·`seaTrip` | `SeaForecastResult{activity, dates[], spots[], fetchedAt, stale}` | 활동 전량 1~6페이지 순차(+ 6~9월 beach 는 이안류 10콜 병렬) | 활동별 1h, 실패 시 12h 안 stale |
| GET | `/api/v1/sea/tide` | `lat`* 32~39 · `lng`* 124~132(`z.coerce.number`) · `date`* `YYYY-MM-DD` | `SeaTideResult{station{code,name,lat,lng,distM}, date, extremes[], fetchedAt, stale}` | 1 | 예보지점×날짜 12h, 실패 시 12h 안 stale |

둘 다 공개·비로그인, `RATE.transitRealtime` 60/분. 400 = zod(없는 활동·좌표 범위 밖·날짜 형식 — `sea.test.ts` 가 `activity=ski`·`lat=10`·`date=20260924` 로 확인), 502 = 업스트림 오류 코드·네트워크·JSON 실패, 503 = 키 미설정·게이트웨이 인증/쿼터(20~33). 생성 문서([openapi.json](../../docs/api/openapi.json))는 `tags ['sea']`·`x-auth: public`·`x-rate-limit`·응답 200/502/503 을 싣고(400 은 목록에 없음), [endpoints.md](../../docs/api/endpoints.md) `## sea` 두 행의 설명은 라우트 `summary` 그대로 — "활동별 생활해양예보지수(지점 × 7일) — 국립해양조사원 API 프록시, 1시간 캐시" / "좌표에서 가장 가까운 조석 예보지점의 하루 만조·간조(물때) — 국립해양조사원, 12시간 캐시". `description` 은 activity 값 목록·"beach 는 6~9월에 해수욕장 이안류 최신 관측을 덧붙인다" / "lat·lng(WGS84)·date(YYYY-MM-DD) 모두 필수. 전국 조석 예보지점 166곳 중 최근접 지점을 서버가 고른다".

계약([schemas/sea.ts](../../packages/api-contract/src/schemas/sea.ts), [index.ts](../../packages/api-contract/src/index.ts) `export * from './schemas/sea.js'`):

- `SeaActivity` = enum 6 · `SeaForecastQuery{activity}`.
- `SeaVariant{name, level: int 0~5 | null, label | null}` — 바다낚시 대상 어종·서핑 등급별 지수(원문 순). 나머지 활동은 빈 배열.
- `SeaSlot{date(YYYY-MM-DD 정규식), period: 'am'·'pm' | null, variants[], level: int 0~5 | null, label | null, waveM, wavePeriodS, waterTempC, airTempC, windMs, currentMs (number | null), tidePhase, weather, openStatus, timeFrom, timeTo (string | null)}` — 세부가 있으면 `level/label` 은 세부 중 가장 좋은 값(지도 색·목록 정렬용).
- `SeaRip{code, level: int 1~4 | null, label | null, observedAt, waveM | null}`.
- `SeaSpot{id(활동 안에서 유일), name, lat, lng, slots[], rip: SeaRip | null}` · `SeaForecastResult{activity, dates: string[], spots[], fetchedAt, stale}`.
- `SeaTideQuery{lat coerce 32~39, lng coerce 124~132, date 정규식}` · `SeaTideExtreme{time 'HH:MM'(KST), kind 'high'·'low', levelCm | null}` · `SeaTideResult{station{code, name, lat, lng, distM int}, date, extremes[], fetchedAt, stale}`.
- `Routes.Sea = { forecast: '/api/v1/sea/forecast', tide: '/api/v1/sea/tide' }`([routes.ts](../../packages/api-contract/src/routes.ts)).

응답 모양 예시(값은 `sea.test.ts`·`SeaPage.test.tsx` 표본 — 2026-09-24 실측 행을 줄인 것, 생략은 `…`):

```jsonc
// GET /api/v1/sea/forecast?activity=beach   (9월 — 이안류 제공 기간)
{
  "activity": "beach",
  "dates": ["2026-09-24", "…"],
  "spots": [{
    "id": "대천해수욕장", "name": "대천해수욕장", "lat": 36.30555, "lng": 126.51601,
    "slots": [
      { "date": "2026-09-24", "period": "am", "variants": [], "level": 5, "label": "매우좋음",
        "waveM": 0.1, "wavePeriodS": null, "waterTempC": 22.9, "airTempC": 22.9, "windMs": 3.5, "currentMs": null,
        "tidePhase": null, "weather": null, "openStatus": "폐장", "timeFrom": null, "timeTo": null }
      // … 날짜 → 오전·오후 순. D+3 이후는 원문 '일' → "period": null 슬롯 하나
    ],
    "rip": { "code": "DAECHON", "level": 1, "label": "관심", "observedAt": "2026-09-24 11:55", "waveM": 0.1 }
  }],
  "fetchedAt": "2026-09-24T03:00:00.000Z",
  "stale": false
}
// fishing 슬롯 하나 — 어종 행 3개가 variants 로 합쳐지고 슬롯 지수는 가장 좋은 세부(농어 매우좋음)
{ "date": "2026-09-24", "period": "am", "level": 5, "label": "매우좋음", "waveM": 0.1,
  "variants": [ { "name": "감성돔", "level": 3, "label": "보통" }, { "name": "농어", "level": 5, "label": "매우좋음" },
                { "name": "참돔", "level": 2, "label": "나쁨" } ], "…": "…" }
// GET /api/v1/sea/tide?lat=37.452&lng=126.592&date=2026-09-24   (최근접 인천 DT_0001, 약 21m)
{
  "station": { "code": "DT_0001", "name": "인천", "lat": 37.45194, "lng": 126.59222, "distM": 21 },
  "date": "2026-09-24",
  "extremes": [
    { "time": "03:18", "kind": "high", "levelCm": 754 },
    { "time": "09:45", "kind": "low", "levelCm": 231 },
    { "time": "15:34", "kind": "high", "levelCm": 732 }
  ],
  "fetchedAt": "…", "stale": false
}
```

(대천의 예보 좌표와 이안류 `DAECHON` 좌표는 약 780m 떨어져 있지만 이름 공백 무시 일치가 먼저라 붙는다.)

shared([sea.api.ts](../../packages/shared/src/api/sea.api.ts)·[useSea.ts](../../packages/shared/src/hooks/useSea.ts), [index.ts](../../packages/shared/src/index.ts) 가 둘 다 재수출):

| 훅 | queryKey | 옵션 |
|---|---|---|
| `useSeaForecast(activity)` | `['sea','forecast',activity]` | staleTime 30분 · refetchInterval 60분 · placeholderData 없음 |
| `useSeaTide(point, date)` | `['sea','tide',lat.toFixed(3),lng.toFixed(3),date]` | `enabled` = point·date 둘 다 · staleTime 6시간 |

utils export([sea.ts](../../packages/utils/src/sea.ts)): `SEA_ACTIVITIES`·`SeaActivity`·`SEA_ACTIVITY_LABEL`·`SEA_ACTIVITY_HINT`·`isSeaActivity`·`seaActivityHasPeriod` / `SeaIndexLevel`·`SEA_INDEX_LABEL`·`seaIndexLevelOf`·`SEA_INDEX_COLOR`·`seaIndexColor` / `SeaRipLevel`·`SEA_RIP_LABEL`·`SEA_RIP_COLOR`·`seaRipLevelOf`·`isSeaRipSeason` / `nearestSeaTideStation`·`matchSeaRipBeach`·`seaTideKindOf`·`buildSeaSpotMarkerDataUrl` / 재수출 `SeaTideStation`·`SEA_TIDE_STATIONS`·`SeaRipBeach`·`SEA_RIP_BEACHES`. 웹 테스트 id: `sea-list`·`sea-detail`·`sea-detail-slot`·`sea-detail-rip`·`sea-detail-tide`·`sea-footer`([SeaPage.tsx](../../apps/web/src/routes/SeaPage.tsx)·SeaSpotDetail). 스크립트·어드민 라우트는 없다.

## Data [coverage: high — 9 sources]

**DB 없음** — `schema.prisma` 에 Sea/Khoa 모델이 없고 마이그레이션·적재 스크립트·`deploy.sh` 단계도 없다([data-sources.md](../../docs/data-sources.md) "원본 파일·적재 없이 서버가 … 메모리 캐시"). 상태는 전부 프로세스 메모리·코드 상수·클라이언트다.

| 저장소 | 키 | TTL / 보존 |
|---|---|---|
| `SeaService.cache` (Map) | `forecast:<activity>`(6개) · `tide:<obsCode>:<YYYY-MM-DD>` | 예보 1h · 물때 12h. 실패 시 마지막 값을 12h 안 stale. **만료 엔트리 스윕·크기 상한 없음**(프로세스 수명 동안 남음) |
| `SeaService.inflight` (Map) | 같은 키 | 로드 중에만 |
| 이안류 | 해수욕 예보 엔트리 안의 `spot.rip` | 해수욕 예보와 같이 1h(stale 이면 최대 12h) |
| 클라 RQ 캐시 | `['sea','forecast',a]` · `['sea','tide',lat3,lng3,date]` | 30분 stale / 60분 재조회 · 6h stale |
| 웹 URL | `?a=<activity>&d=<YYYY-MM-DD>&p=<am·pm>&sel=<spot id>` | replace 갱신, 새로고침·공유 복원 |
| 코드 상수 | `SEA_TIDE_STATIONS` 166 · `SEA_RIP_BEACHES` 10 ([seaStations.ts](../../packages/utils/src/seaStations.ts)) | 2026-09-24 수집·커밋, 재수집 스크립트 없음 |

**좌표표** — `SEA_TIDE_STATIONS` 166곳: 코드 접두 `DT_` 62 · `SO_` 101 · `IE_` 3(이어도·신안가거초·옹진소청초 — 해양과학기지), 위도 32.12(이어도) ~ 38.50(대진항), 경도 124.59(신안가거초) ~ 131.87(독도), 동명 지점 없음. 물때 쿼리 범위(lat 32~39 · lng 124~132)는 이 표를 전부 덮는다. `SEA_RIP_BEACHES` 10곳(이름은 '대천 해수욕장' 처럼 띄어 씀 — 예보의 '대천해수욕장' 과는 공백 무시 비교로 맞춘다):

| code | 이름 | lat | lng |
|---|---|---|---|
| `DAECHON` | 대천 해수욕장 | 36.30559 | 126.50729 |
| `GORAEBUL` | 고래불 해수욕장 | 36.59722 | 129.41111 |
| `GYEONGPO` | 경포 해수욕장 | 37.80088 | 128.90947 |
| `HAE` | 해운대 해수욕장 | 35.15867 | 129.16035 |
| `IMRANG` | 임랑 해수욕장 | 35.31841 | 129.2644 |
| `JUNGMUN` | 중문 해수욕장 | 33.24501 | 126.40944 |
| `MANGSANG` | 망상 해수욕장 | 37.593 | 129.09 |
| `NAKSAN` | 낙산 해수욕장 | 38.118 | 128.63138 |
| `SOKCHO` | 속초 해수욕장 | 38.19058 | 128.60135 |
| `SONGJUNG` | 송정 해수욕장 | 35.1785 | 129.19978 |

서해는 대천 한 곳, 제주는 중문 한 곳이고 나머지 8곳은 동해·부산권이다 — 그 밖 해수욕장엔 이안류 줄이 없다.

**지수 단계·색**(utils [sea.ts](../../packages/utils/src/sea.ts) — 서버 `level` 판정, 웹 목록 점·라벨 글자색·띠·범례, 지도 마커가 같은 표):

| level | 원문 라벨(`totalIndex`) | 색 |
|---|---|---|
| 5 | 매우좋음 | `#0284c7` 파랑 |
| 4 | 좋음 | `#16a34a` 초록 |
| 3 | 보통 | `#ca8a04` 노랑 |
| 2 | 나쁨 | `#ea580c` 주황 |
| 1 | 매우나쁨 | `#dc2626` 빨강 |
| 0 | 체험불가(갯벌 등) | `#6b7280` 회색 |
| null | 모르는 라벨·결측 | `#9ca3af` 연회색 |

이안류(`lastScrCn`)는 방향이 반대인 4단계 — 1 관심 `#0284c7` → 2 주의 `#ca8a04` → 3 경계 `#ea580c` → 4 위험 `#dc2626`(숫자가 클수록 위험), 라벨을 모르면 연회색(`seaIndexColor(null)`).

**규모(2026-09-24 실측 — 커밋 본문·코드 주석·작업 기록)**: 바다낚시 원문 1,750행(300행 × 6페이지) → 지점 묶음 후 슬롯 ~700 → 응답 440→196KB(friendly 는 `@fastify/compress` 를 쓰지 않으므로 앱 레벨 압축 전 크기). 이안류는 5분 간격 관측 ~230행/일 → 한 페이지(300행)에 담기고 최신 1행만 쓴다. 물때는 `numOfRows 10` 한 페이지(다음 날 행이 섞여 와 날짜로 거름). 시각 표기: 응답 `fetchedAt` 은 ISO, 물때 `time` 은 KST `HH:MM`, 이안류 `observedAt` 은 원문 `YYYY-MM-DD HH:MM` 그대로. 테스트 표본은 [sea.test.ts](../../apps/friendly/src/modules/sea/sea.test.ts) 의 인라인 행(실응답을 줄인 것 — 대천해수욕장 `lat 36.30555 / lot 126.51601`, 가거도 낚시 어종 3종, 인천 `DT_0001` 극치 4행 등)뿐이고 `__fixtures__` 폴더는 없다.

## Key Decisions [coverage: high — 17 sources]

- **2026-09-24 외부 API 문서에 싣기(`1b621c4`)** — 두 라우트에 한국어 `summary`(캐시 시간까지 명시)·`description`(activity 값 목록·이안류 6~9월 / lat·lng·date 필수·166곳 최근접)을 달아 [endpoints.md](../../docs/api/endpoints.md) `## sea` 절과 [README](../../docs/api/README.md) 도메인 개요로 공개. 동작 변경 없음. 어드민 라우트가 아니므로 CORS 개방(`origin:'*'`, credentials false) 대상이다 — 세부 정책은 [api-docs](api-docs.md).
- **2026-09-24 별도 메뉴 `/sea` "바다", 날씨 바로 다음, 웹 먼저(`4a2bff1`)** — 같은 날의 물 관련 데이터 조사(1번 서울 침수흔적도 → [housing](housing.md)·[life-map](life-map.md) `ad48f96`, 2번 국립해양조사원 바다지수) 2번을 사용자가 "종합적으로 추천하는 안으로 진행" 하라고 해 구현자가 정한 설계(작업 기록): 날씨 페이지의 섹션이나 일상지도 레이어가 아니라 독립 메뉴. 앱은 다음 단계로 미룸(미구현).
- **적재 대신 프록시 + 메모리 캐시** — 7일 예보가 매일 통째로 바뀌고 요청마다 전량을 주므로 DB·적재 스크립트를 두지 않는다. [data-sources.md](../../docs/data-sources.md) 에 "바다(/sea)도 API 만" 으로, 키·데이터셋·쿼터는 [env.ts](../../apps/friendly/src/config/env.ts)·[.env.example](../../apps/friendly/.env.example) 공용 키 목록에 한 항목으로 기록.
- **활동 단위 전량 캐시 — 쿼터가 사용자 수와 무관** — 업스트림이 지점 필터 없이 전국 전량을 주므로 활동 하나를 캐시 엔트리 하나(1h)로. 갱신당 1~6콜 × 활동 6 × 24회 ≈ 300콜/일(서비스 주석; 6~9월엔 해수욕 갱신마다 이안류 10콜이 별도 데이터셋에 더해짐)이라 개발계정 일 10,000건으로 충분 → 운영계정 전환(심의)은 불필요하다고 판단(작업 기록). [quota-proportional-loading](../concepts/quota-proportional-loading.md) 의 "팬아웃 붕괴"(대기 '전국' 1콜 캐시) 계열이다. 대신 bus·대기·날씨가 둔 **일일 쿼터 카운터는 두지 않았다**(→ Gotchas).
- **물때는 서버가 최근접 예보지점을 고르고 "지점 × 날짜" 로 캐시** — 캐시 키가 좌표가 아니라 지점 코드라 같은 해안의 사용자·지점들이 캐시를 공유하고, 천문조 계산값이라 하루 안 바뀌어 12시간. 클라이언트 키도 좌표 3자리(≈100m)로 묶는다([useSea.ts](../../packages/shared/src/hooks/useSea.ts) 주석).
- **지점 좌표표를 코드로 커밋** — 조석예보 가이드 코드표와 이안류 해수욕장 코드에 좌표가 없어 2026-09-24 지점별 1회 호출로 166 + 10곳 좌표를 모아 utils([seaStations.ts](../../packages/utils/src/seaStations.ts))에 두었다. 서버(최근접·이안류 매칭)와 웹이 같은 표를 본다. 지점이 늘면 다시 모은다는 방침([data-sources.md](../../docs/data-sources.md)).
- **세부(어종·등급) 행은 슬롯 하나의 `variants` 로** — 같은 지점·날짜·시간대의 파고·수온 등은 세부마다 같아 슬롯에 한 번만 싣고 지수만 세부별로([schemas/sea.ts](../../packages/api-contract/src/schemas/sea.ts) 주석) → 바다낚시 응답 440→196KB. 슬롯 대표 지수(지도 색·순위)는 **가장 좋은 세부** — "그 지점에서 뭐라도 좋은가" 기준이고, 푸터 범례에 "바다낚시·서핑은 어종·등급 중 가장 좋은 지수로 색칠" 로 밝힌다.
- **바다낚시는 `gubun=갯바위` 한 번만** — 필수 파라미터지만 값(갯바위·선상)과 무관하게 같은 1,750행이 온다(2026-09-24 실측, [khoa.adapter.ts](../../apps/friendly/src/modules/sea/khoa.adapter.ts) `KHOA_PATHS` 주석) — 두 번 부르지 않는다.
- **하루 예보는 `period: null`** — 원문 '일'(D+3 이후 하루 한 번 예보)을 오전/오후에 억지로 복제하지 않고 null 로 두어, 상세 띠가 그날을 두 칸 높이 한 칸으로 그린다. 갯벌·바다갈라짐은 원래 하루 한 번 체험 시각이라 항상 null(`seaActivityHasPeriod`).
- **이안류는 보조 정보** — 6~9월에만, 해수욕 응답에 덧붙이고 한 곳 실패는 무시(예보 전체를 막지 않음). 이름(공백 무시) 일치 우선, 없으면 2km 안 최근접([sea.ts](../../packages/utils/src/sea.ts) `matchSeaRipBeach`).
- **동명 지점은 좌표로 구분** — 원문 지점명이 id 이되, 같은 이름이 다른 좌표로 나오면 `이름@lat3,lng3` 접미(계약 `SeaSpot.id` 주석 "활동 안에서 유일").
- **활동 전환 시 이전 화면을 들고 있지 않는다** — `useSeaForecast` 에 `placeholderData` 를 주지 않는다(지점 집합이 달라 섞이면 오해). 지점 전환 중 이전 자료를 디밍해 두는 [weather](weather.md) 와 반대 선택.
- **URL 이 상태(`?a&d&p&sel`)** — 공유·새로고침 복원. 기본 시간대는 지금 KST 오전/오후, 기본 날짜는 오늘([SeaPage.tsx](../../apps/web/src/routes/SeaPage.tsx)).
- **내 위치는 명시 요청만** — `useUserLocation({auto:false})`: 거리 표시와 동률 정렬 보조일 뿐이라 자동 측위도, 저장한 내 위치 연동도 없다.
- **지도 라벨 최소화** — 선택 지점 + 순위 상위 3곳 중 '좋음' 이상만 이름표(해안선에 지점이 몰려 전부 달면 겹친다, [SeaMap.tsx](../../apps/web/src/components/sea/SeaMap.tsx) 주석). 카메라는 선택 좌표가 바뀔 때만 이동.
- **레이트리밋은 실시간 대중교통 프리셋 60/분, 502/503 은 라우트가 직접** — 캐시 미스 키(좌표·날짜)를 바꿔 가며 쿼터를 태우는 남용 방어([sea.route.ts](../../apps/friendly/src/modules/sea/sea.route.ts) 주석, [rate-limit.ts](../../apps/friendly/src/plugins/rate-limit.ts)). 상태 코드는 날씨와 같은 `replyUpstreamError`([reply-upstream-error.ts](../../apps/friendly/src/lib/reply-upstream-error.ts)).
- **색 램프** — 매우좋음 파랑(#0284c7) → 좋음 초록 → 보통 노랑 → 나쁨 주황 → 매우나쁨 빨강(#dc2626), 체험불가 회색·결측 연회색. 이안류 4단계도 같은 hex 계열(관심 파랑 → 위험 빨강). 다음 날 들어온 [주차](parking.md)(`2ff2c31`) 혼잡 단계 `PARKING_LEVEL_COLOR`(여유·보통·혼잡·만차)가 같은 초록·노랑·주황·빨강 hex 를 쓴다([parking.ts](../../packages/utils/src/parking.ts)) — 단계형 지수 색이 utils 에서 사실상 공용 팔레트가 됐다.

## Gotchas [coverage: high — 18 sources]

- **일일 쿼터 카운터가 없다** — [bus.service.ts](../../apps/friendly/src/modules/bus/bus.service.ts)(900)·[air-quality.service.ts](../../apps/friendly/src/modules/air-quality/air-quality.service.ts)(450)·[weather.service.ts](../../apps/friendly/src/modules/weather/weather.service.ts)(9,000)는 서비스 메모리에 `DEFAULT_DAILY_UPSTREAM_LIMIT` 카운터를 두고 넘으면 stale 이나 503 으로 막는데 `SeaService` 엔 없다. 방어선은 IP당 60/분뿐이다. 특히 `/sea/tide` 는 `date` 를 형식(정규식)만 검사해 임의 날짜 × 최근접 지점(166곳)을 바꿔 가며 부르면 요청마다 새 캐시 키 = 업스트림 1콜이다(IP 하나로 분당 60, 하루 최대 86,400 > 데이터셋 한도 10,000). `1b621c4` CORS 개방 뒤 [PLAN-perf-security.md](../../docs/PLAN-perf-security.md) #42 번복 기록이 "남는 위험은 비용(LLM·업스트림 쿼터 소진 — IP 분산으로 IP당 한도가 약해짐)" 이라 적은 바로 그 경우다. 한도가 소진되면 게이트웨이 20~33 계열(어댑터 주석 "인증·쿼터") → 503 이 되고, 이미 캐시된 활동은 12시간까지 stale 로 버틴다. 물때 캐시에는 만료 스윕·크기 상한도 없어 이런 키가 프로세스 수명 동안 쌓인다(날씨는 다음 `cached` 호출 때 만료 엔트리를 스윕).
- **이안류는 최대 1시간(stale 이면 12시간) 늦다** — 5분 간격 관측이지만 해수욕 예보 캐시 엔트리에 묶여 1시간마다 갱신되고, 화면([SeaSpotDetail.tsx](../../apps/web/src/components/sea/SeaSpotDetail.tsx))은 `observedAt.slice(11)` 로 **시:분만** 보여 날짜가 없다(stale 이면 어제 관측도 "HH:MM 관측"). 이안류 호출 실패는 로그 없이 `catch {}` 로 삼키므로 15156028 활용신청 누락·만료도 조용히 "이안류 없음" 으로 보인다. 10월~5월엔 호출 자체를 하지 않는다(`sea.test.ts` 가 10월 시각으로 호출 0 을 확인).
- **캐시 만료 직후 첫 요청은 업스트림을 기다린다** — stale-while-revalidate 가 아니다: 만료되면 로드해 성공하면 새 값, **실패해야** 이전 값을 stale 로 준다. 바다낚시는 300행 6페이지를 **순차**로(각 20초 타임아웃·1회 재시도) 받으므로 업스트림이 느린 날엔 첫 요청이 수 초~수십 초 걸린다. 같은 키 동시 요청은 in-flight 로 합류해 콜이 늘지는 않는다. 그리고 **실패는 캐시하지 않는다** — stale 로 응답해도 엔트리의 `expiresAt` 을 늘리지 않으므로, 업스트림 장애 동안엔 in-flight 가 끝날 때마다 다음 요청이 다시 로드를 시도하고 매번 타임아웃(20초 × 2 + 700ms)을 기다린 뒤에야 stale 을 받는다(12시간이 지나면 그마저 502/503).
- **D+3 이후 하루 예보는 활동을 가리지 않는다** — 코드 주석·계약은 "해수욕·바다여행은 D+3 이후 원문 '일'" 만 적었지만 작업 기록(2026-09-24 실측)은 서핑·낚시도 D+3 이후 하루 예보라고 한다. 정규화는 활동과 무관하게 '오전'/'오후' 외 값을 null 로 두므로 안전하다. 웹은 그런 날 오전/오후 토글이 효과가 없다(`seaSlotFor` 가 그날 첫 슬롯으로 폴백 — [seaFormat.ts](../../apps/web/src/components/sea/seaFormat.ts)).
- **'03' 데이터 없음은 에러가 아니다** — 빈 결과로 받아 목록이 "예보 지점이 없습니다." 가 된다. 반대로 미신청 키(30)는 HTTP 403 과 함께 게이트웨이 봉투로 오므로 status 가 아니라 본문으로 판정해야 503 이 된다([khoa.adapter.ts](../../apps/friendly/src/modules/sea/khoa.adapter.ts)).
- **`gubun` 은 값이 무시돼도 보내야 한다** — 빠지면 `'11'`(필수 파라미터 누락) → 502. 서비스가 낚시일 때만 `'갯바위'` 를 붙이고 테스트가 이를 확인한다.
- **probe 스크립트·좌표 재수집 도구가 커밋돼 있지 않다** — 어댑터 주석은 "프로브 실측 2026-09-24" 라고 하지만 [package.json](../../apps/friendly/package.json) 에 `probe:khoa` 류가 없고(날씨 `probe:kma`·대기 `probe:airkorea` 와 다름), 테스트 표본은 실응답을 줄인 **인라인 행**([sea.test.ts](../../apps/friendly/src/modules/sea/sea.test.ts))뿐이다. [data-sources.md](../../docs/data-sources.md) 는 좌표표를 "지점이 추가되면 다시 모은다" 고 하지만 모으는 스크립트가 없어 다시 할 땐 지점별 1회 호출을 손으로 반복해야 한다. [external-api-proxy-fixture](../concepts/external-api-proxy-fixture.md) 의 (d) 다리(probe→fixture)를 "인라인 행 + 산출물(좌표표) 커밋" 으로 대체한 변형.
- **로컬 dev 서버(tsx watch)는 새 라우트 파일을 감지하지 못한다** — `modules/sea/sea.route.ts` 를 새로 만든 뒤 확인하려면 감시 중인 기존 파일을 touch 해 재시작해야 했다(작업 기록). autoload 는 기동 때 디렉터리를 한 번 훑고 watch 는 이미 불러온 파일만 보므로, 새 모듈(새 `*.route.ts`)을 만들 때마다 반복될 수 있는 개발 함정이다.
- **문서·코드 어긋남 3건**
  - [SeaPage.tsx](../../apps/web/src/routes/SeaPage.tsx) 머리 주석은 URL 상태가 "공유·뒤로가기" 용이라 하지만 모든 갱신이 `replace: true` 라 뒤로가기는 탭·날짜·지점 선택을 되짚지 않고 **이전 페이지로 나간다**(상세의 '목록' 버튼이 사실상의 뒤로).
  - [PLAN-parking.md](../../docs/PLAN-parking.md) 는 주차 화면을 "지도 + 패널(바다·집값과 같은 골격)" 이라 쓰지만 바다는 바텀시트 골격이 아니다 — `max-w-6xl` 문서형 페이지 안 `lg` 2열 그리드 + 고정 높이 지도 상자이고, 모바일(웹 작은 화면)도 시트 없이 지도 360px 아래로 목록이 쌓인다. 주차의 실제 골격은 집값·일상지도 쪽(`useMapSheets` + `BottomSheet`, [ParkingPage.tsx](../../apps/web/src/routes/ParkingPage.tsx) 머리 주석 — [parking](parking.md))이다.
  - 푸터 범례는 "체험불가·예보 없음" 을 점 하나(`seaIndexColor(0)` = #6b7280)로 묶지만 지도·목록의 '예보 없음'(level null)은 더 옅은 #9ca3af 로 칠해진다.
- **응답엔 있고 화면엔 없는 값** — `currentMs`(유속 — 낚시 `maxCrsp`·바다여행 `avgCrsp`)와 이안류 `waveM` 은 계약·응답에 실리지만 웹 어디에도 표시되지 않는다. 기온은 수온이 없을 때만 요약에 나온다(`seaSlotSummary`). 외부 소비자는 [schemas/sea.ts](../../packages/api-contract/src/schemas/sea.ts) 기준으로 받는다.
- **id 정밀도 차이** — 지점 묶음 키는 좌표 소수 4자리(≈11m), 동명 지점 id 접미는 3자리(≈110m)라 같은 이름이 100m 남짓 안에서 두 좌표로 오면 이론상 id 가 겹친다(목록 key 중복·선택 모호). 실측 데이터에서 확인된 사례는 없다.
- **물때는 직선거리 최근접** — `nearestSeaTideStation` 은 해안선·반도를 모른다. 지점 반대편 해안의 예보지점이 뽑힐 수 있고, 후보엔 `IE_` 해양과학기지 3곳도 있다. 화면이 "○○ 기준(거리)" 와 "수십 분 차이" 안내를 함께 보여 주는 이유.
- **웹 에러 문구가 하나뿐** — 502(업스트림 실패)와 503(키·활용신청·쿼터)을 가르지 않고 "바다 예보를 불러오지 못했습니다" 만 띄운다(날씨의 `weatherUpstreamMessage` 같은 분기 없음). 지도 키가 없으면 지도 자리만 안내문이 되고 목록·상세는 동작한다.
- **테스트 규모** — friendly `sea.test.ts` 12건(봉투 해석 2 · 페이지 순회 1 · 정규화·지점 묶음·variants 병합·`latestRip` 4 · 서비스 503·캐시/stale/gubun·이안류 부착·물때 4 · 라우트 400 1 — 라우트 테스트만 `buildApp`), utils [sea.test.ts](../../packages/utils/src/sea.test.ts) 6건(지수·이안류·극치구분·`seaActivityHasPeriod`·166곳/인천 `DT_0001` 최근접 100m 이내·이안류 이름/2km 매칭), 웹 [SeaPage.test.tsx](../../apps/web/src/routes/SeaPage.test.tsx) 6건(MSW, `MapCanvas` 목 — 기본 탭 순위·요약·범례 / 행 클릭 → `sel`·상세·이안류·물때·띠 클릭·하루 칸 / 바다낚시 탭 어종 칩 / URL `d`·`p` / `seaFormat` 2). 앱 테스트 없음(앱 미구현).

## Sources [coverage: high — 51 sources]

- [apps/friendly/src/modules/sea/khoa.adapter.ts](../../apps/friendly/src/modules/sea/khoa.adapter.ts) — 봉투 해석·페이지 순회·재시도·`KHOA_PATHS` 8(170줄)
- [apps/friendly/src/modules/sea/sea.service.ts](../../apps/friendly/src/modules/sea/sea.service.ts) — `SeaService` 캐시·stale·정규화·지점 묶음·이안류·물때(329줄)
- [apps/friendly/src/modules/sea/sea.route.ts](../../apps/friendly/src/modules/sea/sea.route.ts) — GET 2, `1b621c4` summary·description(62줄)
- [apps/friendly/src/modules/sea/sea.test.ts](../../apps/friendly/src/modules/sea/sea.test.ts) — 12건(인라인 실응답 축약 행)
- [apps/friendly/src/config/env.ts](../../apps/friendly/src/config/env.ts) — `DATA_GO_KR_API_KEY` 공용 키 목록의 국립해양조사원 항목
- [apps/friendly/.env.example](../../apps/friendly/.env.example) — 데이터셋 8개·개발계정 자동승인·일 10,000건
- [apps/friendly/src/plugins/rate-limit.ts](../../apps/friendly/src/plugins/rate-limit.ts) — `RATE.transitRealtime` 60/분
- [apps/friendly/src/lib/reply-upstream-error.ts](../../apps/friendly/src/lib/reply-upstream-error.ts) — 502/503 직접 응답 + warn 진단
- [apps/friendly/src/lib/narrow.ts](../../apps/friendly/src/lib/narrow.ts) — `numOrNull`·`coerceStrOrNull`·`intOrNull`·`isObject`
- [apps/friendly/src/modules/bus/bus-api.adapter.ts](../../apps/friendly/src/modules/bus/bus-api.adapter.ts) — `toServiceKeyPart`
- [apps/friendly/src/app.ts](../../apps/friendly/src/app.ts) — modules autoload(`*.route.ts`)
- [apps/friendly/package.json](../../apps/friendly/package.json) — sea 전용 probe·적재 스크립트 없음(확인)
- [apps/friendly/src/modules/weather/weather.service.ts](../../apps/friendly/src/modules/weather/weather.service.ts) — 일일 쿼터 카운터 비교(9,000)
- [apps/friendly/src/modules/air-quality/air-quality.service.ts](../../apps/friendly/src/modules/air-quality/air-quality.service.ts) — 일일 쿼터 카운터 비교(450)
- [apps/friendly/src/modules/bus/bus.service.ts](../../apps/friendly/src/modules/bus/bus.service.ts) — 일일 쿼터 카운터 비교(900)
- [packages/api-contract/src/schemas/sea.ts](../../packages/api-contract/src/schemas/sea.ts) — 활동 enum·슬롯·variants·이안류·물때(107줄)
- [packages/api-contract/src/routes.ts](../../packages/api-contract/src/routes.ts) — `Routes.Sea`
- [packages/api-contract/src/index.ts](../../packages/api-contract/src/index.ts)
- [packages/shared/src/api/sea.api.ts](../../packages/shared/src/api/sea.api.ts) — `seaApi`
- [packages/shared/src/hooks/useSea.ts](../../packages/shared/src/hooks/useSea.ts) — `useSeaForecast`·`useSeaTide`
- [packages/shared/src/index.ts](../../packages/shared/src/index.ts)
- [packages/shared/src/hooks/useUserLocation.ts](../../packages/shared/src/hooks/useUserLocation.ts) — `auto:false` 명시 측위
- [packages/shared/src/hooks/useSettingsMap.ts](../../packages/shared/src/hooks/useSettingsMap.ts) — `useMapPublicConfig`
- [packages/utils/src/sea.ts](../../packages/utils/src/sea.ts) — 활동·지수·색·이안류·극치구분·최근접·마커(124줄)
- [packages/utils/src/seaStations.ts](../../packages/utils/src/seaStations.ts) — 조석 예보지점 166 · 이안류 해수욕장 10(196줄)
- [packages/utils/src/sea.test.ts](../../packages/utils/src/sea.test.ts) — 6건
- [packages/utils/src/index.ts](../../packages/utils/src/index.ts)
- [packages/utils/src/markerFrame.ts](../../packages/utils/src/markerFrame.ts) — 26×26 원 / 32×48 핀 프레임
- [packages/utils/src/geo.ts](../../packages/utils/src/geo.ts) — `haversineM`·`approxDistanceM`
- [packages/utils/src/dateLabel.ts](../../packages/utils/src/dateLabel.ts) — `todayKst`·`relativeDayLabel`·`formatYmdWithWeekday`
- [packages/utils/src/weather.ts](../../packages/utils/src/weather.ts) — `kmaTodayIsoDate`(이안류 기간 월 판정)
- [packages/utils/src/busMarker.ts](../../packages/utils/src/busMarker.ts) — `buildMyLocationMarkerDataUrl`
- [packages/utils/src/weatherRegions.ts](../../packages/utils/src/weatherRegions.ts) — 기상청 해상 12 해역(구분 비교)
- [packages/utils/src/parking.ts](../../packages/utils/src/parking.ts) — `PARKING_LEVEL_COLOR` 같은 hex 팔레트
- [apps/web/src/routes/SeaPage.tsx](../../apps/web/src/routes/SeaPage.tsx) — URL 상태·탭·목록·범례·출처(251줄)
- [apps/web/src/routes/SeaPage.test.tsx](../../apps/web/src/routes/SeaPage.test.tsx) — 6건(MSW, `MapCanvas` 목)
- [apps/web/src/components/sea/SeaMap.tsx](../../apps/web/src/components/sea/SeaMap.tsx) — 지수색 마커·라벨 규칙·`poolKey="sea"`
- [apps/web/src/components/sea/SeaSpotDetail.tsx](../../apps/web/src/components/sea/SeaSpotDetail.tsx) — 7일 띠·variants 칩·이안류·물때
- [apps/web/src/components/sea/seaFormat.ts](../../apps/web/src/components/sea/seaFormat.ts) — `seaSlotFor`·`rankSeaSpots`·`seaSlotSummary`·`formatSeaDistance`
- [apps/web/src/components/restaurant/MapCanvas.tsx](../../apps/web/src/components/restaurant/MapCanvas.tsx) — `overlayMarkers`·`poolKey`·`flyToZoomIn`
- [apps/web/src/App.tsx](../../apps/web/src/App.tsx) — `/sea` lazy 라우트
- [apps/web/src/components/PublicSidebar.tsx](../../apps/web/src/components/PublicSidebar.tsx) — 메뉴 '바다'(`Waves`)
- [apps/web/src/components/PublicTopBar.tsx](../../apps/web/src/components/PublicTopBar.tsx) — NAV '바다'
- [apps/web/src/components/weather/WeatherSeaSection.tsx](../../apps/web/src/components/weather/WeatherSeaSection.tsx) — 기상청 중기해상(구분 비교)
- [apps/web/src/routes/ParkingPage.tsx](../../apps/web/src/routes/ParkingPage.tsx) — 실제 골격(집값·일상지도 계열) 비교
- [docs/data-sources.md](../../docs/data-sources.md) — "바다(/sea)도 API 만" 문단
- [docs/api/endpoints.md](../../docs/api/endpoints.md) — `## sea` 2행(자동 생성)
- [docs/api/README.md](../../docs/api/README.md) — stale 규약·한도 표·도메인 개요·출처 표기
- [docs/api/openapi.json](../../docs/api/openapi.json) — sea 2 paths(`x-auth public`·`x-rate-limit`)
- [docs/PLAN-perf-security.md](../../docs/PLAN-perf-security.md) — #42 번복 "남는 위험은 비용(업스트림 쿼터 소진)"
- [docs/PLAN-parking.md](../../docs/PLAN-parking.md) — "바다·집값과 같은 골격" 서술(어긋남)
