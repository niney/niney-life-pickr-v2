---
topic: life-map
last_compiled: 2026-08-30
sources_count: 74
status: active
aliases: [일상지도, life-map, lifeMap, CCTV, 공중화장실, 병의원, LifeCctv, LifeToilet, LifeHospital, LifeGeocodeCache, LifeMasterSync, life-geocode-cache, VWorld 지오코딩, vworld-geocoder, vworld-search, 지역 이동 검색, LifeGoToBox, LifeGoToModal, HIRA, 심평원 병원정보서비스, hira-hospital, localdata.go.kr, 지방행정인허가, points-cells, 집계 셀, lifeCellSizeDeg, useLifeMapPoints, lifeMapPrefsStore, lifeMapRecentStore, load:life-cctv, load:life-toilets, load:life-hospitals, import:life-geocode, status:life-map, LifeMapPage, LifeMapHeader, deploy.sh 6]
---

# life-map — 일상지도(전국 CCTV·공중화장실·병의원 레이어 지도)

**2026-08-21~08-30 신설 — 공공데이터 3레이어 지도 + 적재 파이프라인 + 지역 이동 검색 + 웹 모바일 시트 + 앱 화면 + 병의원**: 지방행정인허가데이터개방(localdata.go.kr)의 전국 CCTV(377,243행)·공중화장실(53,559행) CSV 를 friendly 로컬 SQLite 에 전량 적재하고, 화장실은 원본에 좌표가 없어 VWorld 지오코더로 주소를 변환(영구 캐시 + gzip 압축본을 리포에 커밋)해 **지도 한 장에 점/집계 셀**로 그리는 공개 페이지 `/life-map` 이 `1d92acb`(08-21) 로 시작됐다. 같은 날 `a21de10` 이 **지역 이동 옴니박스**(행정구역 로컬 245지점 · 지하철역 · 버스정류장 · VWorld 주소/POI 프록시)와 지오코딩 1일차(79%) 캐시를 더했고, `e84e4b9`(08-22) 가 웹 모바일을 맛집 v2 바텀시트 패턴(`sheet/` 승격 + `useMapSheets`)으로 통일했다. 앱은 `e348032`(08-22) 로 대중교통 골격(WebView 지도 + 플로팅 헤더 + List/Detail 시트)을 재사용해 화면을 얻었고 `563890a`(최근 위치)·`4e414aa`(헤더 sticky 보간)·`fdb6ab9`(`enableDynamicSizing=false`)·`342b3b7`(활성 시트 추종)으로 다듬어졌다. 원본 데이터 정리(`809b7e0`·`5a84b63`, `data/open/` 규약 + deploy.sh 경로 폴백)를 거쳐, `4fd6e22`(08-30) 가 **세 번째 레이어 병의원**을 심평원 병원정보서비스 API(data.go.kr 15001698) 전량 페이징(~80콜) 적재로 얹었다 — CSV 가 아니라 API 가 원천이고 좌표는 업스트림(99.99%)이 원칙이라는 점만 다르고, 정규화·전량 교체·상태 API·UI 골격은 앞 두 레이어와 같다.

## Purpose [coverage: high — 9 sources]

"지금 내 주변에 공중화장실·CCTV·병의원이 어디 있나" 를 **비로그인 공개**로 답하는 도메인. 세 레이어 모두 **로컬 DB 조회만** 하므로 사용자 요청 경로에는 외부 API 호출·쿼터가 없다(지역 이동 검색의 주소/POI 섹션만 VWorld 검색 프록시). 의존자는 웹 `/life-map`([LifeMapPage](../../apps/web/src/routes/LifeMapPage.tsx))·앱 `/life-map`([index.tsx](../../apps/mobile/app/life-map/index.tsx), 홈 [MyLocationCard](../../apps/mobile/src/components/home/MyLocationCard.tsx) 의 "일상지도" 진입 행)과 운영 스크립트 [deploy.sh](../../deploy.sh)(API 배포마다 자동 적재 점검) 뿐이다.

설계를 관통하는 제약은 두 가지다. (1) **377k 점을 브라우저에 다 보낼 수 없다** → 뷰포트(bbox)+줌이 조회 단위이고, 줌이 레이어별 임계 미만이면 서버가 도(°) 격자로 GROUP BY 집계한 셀(숫자 버블)을 내려준다([계약 주석](../../packages/api-contract/src/schemas/life-map.ts)). (2) **화장실 원본엔 좌표가 없다**(표준데이터도 2025-02 부터 좌표 제외) → 주소 지오코딩이 유일한 길이고, VWorld 지오코더는 일 한도(4만 건 수준)가 있어 결과를 영구 캐시하고 압축본을 저장소에 실어 운영 서버는 호출 0건으로 적재한다([life-map-geocode.service.ts](../../apps/friendly/src/modules/life-map/life-map-geocode.service.ts) 헤더).

데이터 규모(2026-08 실측): CCTV CSV 377,278행(18열, 79MB, CP949) → 한국 밖 35행 제외 **377,243행** 적재 · 화장실 CSV **53,559행**(34열, 16MB) · 병의원 **약 78,000기관**(1,000행 페이지 × ~79콜). 로컬 `status:life-map` 컴파일 시점 출력: `ok cctv=377243 toilet=53559 geocoded=42248 hospital=0 cache=39181`.

## Architecture [coverage: high — 20 sources]

```
웹 /life-map (LifeMapPage — ?ll=lat,lng&z=줌&sel=layer:id 가 진실)          앱 /life-map (index.tsx — ll/sel 파라미터 1회)
  ├ 데스크톱(xl+, useIsDesktopXl): 좌 패널 400px                              ├ TransitMapView(WebView OL) 풀블리드
  │   LifeGoToBox(panel) · LifeLayerBar(all) · LifeNearbyList|LifeDetailCard  │   + lifeMapBridgeMarkers(아이콘 사전 icons + fixedScale)
  │   · LifeMapFooter                                                          ├ LifeMapHeader(플로팅↔sticky 보간, 뒤로·검색·레이어 칩·내 위치)
  ├ 모바일: subBar(LifeGoToBox bar + LifeLayerBar layers) · 지도 fixed 배경     ├ List 시트(gorhom 20/50/100%): LifeFilterRows → LifeNearbyRows → LifeFooter
  │   · 목록 BottomSheet(peek/half/full) · 상세 BottomSheet — useMapSheets      ├ Detail 시트: LifeDetailPanel   · LifeGoToModal(pageSheet)
  └ LifeMapView → MapCanvas(poolKey 'life', fixedScale 마커, Style 캐시)        └ stores: lifeMapPrefsStore·lifeMapRecentStore (AsyncStorage)
     stores: lifeMapPrefsStore(lp:life-map-prefs v2)·lifeMapRecentStore(lp:life-map-recent)
        │            @repo/shared  lifeMapApi · useLifeMapStatus/Points/Nearby/Detail/Search (staleTime 24h / 검색 10분)
        │            @repo/utils   lifeMap.ts(코드표·그룹·셀 격자) · lifeMapMarker.ts(팔레트·SVG) · weatherRegions(행정구역 245)
        ▼            @repo/api-contract schemas/life-map.ts · Routes.LifeMap
friendly life-map.route.ts ── LifeMapService(getStatus/getPoints/getNearby/getDetail — 로컬 SQLite, 셀 LRU 10분)
                          └─ LifeMapSearchService(VWorld search 프록시, LRU 10분) ── vworld-search.adapter
적재(스크립트, 서버 밖) ─ load:life-cctv / load:life-toilets ── life-map-master.service (CSV 정규화 + 전량 교체)
                       ─ load:life-hospitals ── life-map-hospital-master.service ── hira-hospital.adapter (data.go.kr 15001698)
                       ─ life-map-geocode.service (VWorld getcoord + LifeGeocodeCache) ─ export/import:life-geocode (json.gz)
                       ─ status:life-map ("ok cctv=N toilet=M geocoded=G hospital=H cache=C" — deploy.sh 가 파싱)
```

### 레이어 3종 — 원천과 좌표

| 레이어 | 원천 | 좌표 | 적재 명령 | 필터 |
|---|---|---|---|---|
| `cctv` | localdata.go.kr 전국 CCTV 설치 현황 CSV(CP949) | 원본 `WGS84위도/경도`(100%), 한국 범위(lat 33~39·lng 124~132) 밖 35행 drop | `load:life-cctv <csv>` | 설치목적 10종(쉼표 다중) |
| `toilet` | localdata.go.kr 전국 공중화장실 CSV | 없음 → 도로명/지번 주소를 VWorld 지오코더로(실패 행은 `lat/lng null` = 지도 미표시, 상세는 가능) | `load:life-toilets <csv> [--offline]` | 편의 5종 AND(open24·disabled·kids·diaper·bell) |
| `hospital` | 심평원 병원정보서비스 `getHospBasisList`(HTTPS JSON, 전량 페이징) | 업스트림 `XPos/YPos`(프로브 실측 99.99%) 우선, 결측·범위 밖만 `addr` 지오코딩 | `load:life-hospitals [--offline]` | 종별 7종(정규화 category, 쉼표 다중) |

코드표는 [packages/utils/src/lifeMap.ts](../../packages/utils/src/lifeMap.ts) 한 곳 — 서버 적재·조회와 웹·앱 UI 가 같은 상수를 쓴다. CCTV 설치목적 10종(`생활방범 62%·다목적 13%·어린이보호 8%·교통단속 5%…`)은 필터에선 그대로 두고 색·범례만 4그룹(`safety/child/traffic/etc`)으로 묶는다(범주색은 4개까지만 전 쌍이 읽힌다). 병의원 종별은 심평원 `clCdNm` 15종 안팎을 `종합병원·병원·의원·치과·한방·보건기관·기타` 7종으로 접되 원문 `kindName` 은 상세에 보존한다 — 실응답이 `'상급종합병원'` 이 아니라 **`'상급종합'`** 으로 와서 매핑을 따로 둔다(없으면 상급종합 47곳이 '기타'로 빠진다).

### 적재 파이프라인 — "정규화는 순수 함수 + 사유별 drop 리포트, 쓰기는 전량 교체 트랜잭션"

[life-map-master.service.ts](../../apps/friendly/src/modules/life-map/life-map-master.service.ts) 는 bus-master.service 와 같은 골격이다. 스크립트가 파일을 통째로 읽고(`readFileSync` — **스트리밍 아님**, 79MB 도 문자열 하나) → `decodeLifeCsv`(BOM 이면 UTF-8, 아니면 EUC-KR 로 풀어 헤더에 `관리번호` 가 보이는지로 판정) → [lib/csv.ts](../../apps/friendly/src/lib/csv.ts) `parseCsv`(RFC 4180 — 따옴표 안 쉼표·줄바꿈, CRLF, BOM; 이 기능을 계기로 신설) → `normalizeLife{Cctv,Toilet}Rows`(필수 열 없으면 하드 fail, 그 외는 열 수 불일치·관리번호/자치단체코드 누락·좌표 이상(CCTV)·관리번호 중복·주소 없음(화장실) 을 **사유별로 세어 리포트**) → `replaceLife*`: 인터랙티브 `$transaction` 하나 안에서 `deleteMany` → `createMany` 500행 청크(SQLite 바인드 변수 상한 32,766 아래 — 화장실 35열 × 500 = 17,500) → `LifeMasterSync` 이력 1행. 타임아웃 15분·maxWait 60초. 중간 상태가 노출되지 않고, WAL 이라 서버를 내리지 않아도 된다(교체 트랜잭션 수 초~20초). **upsert 가 아니라 전량 교체**이므로 재적재 뒤 사라진 id 로 `sel` 을 들고 오면 상세가 404 다.

병의원([life-map-hospital-master.service.ts](../../apps/friendly/src/modules/life-map/life-map-hospital-master.service.ts))은 원천만 다르다: `fetchAllHiraHospitals` 가 `pageNo` 1부터 `numOfRows=1000` 으로 **순차** 페이징(동시 호출 없음 — 게이트웨이 예의; `MAX_PAGES=200` 무한루프 가드; `totalCount` 도달 또는 빈 페이지에서 중단) → `normalizeLifeHospitalRows`(ykiho/기관명 누락 drop, 중복 접힘, 좌표 결측·범위 밖은 **drop 이 아니라 null 적재** + `coordMissing` 집계, 홈페이지는 스킴 없는 `www.…` 에 `http://` 부여·`'http'/'-'` 쓰레기 버림, `estbDd` 숫자/문자 모두 `YYYY-MM-DD`) → 로더가 `lat===null && addr` 행만 `geocodeLifeRows` 에 `roadAddr=addr` 후보로 넘겨 보완 → `replaceLifeHospitals`. `baseDate` 는 CSV 기준일이 아니라 **적재일**(`toLocaleDateString('en-CA')` — `toISOString` 은 UTC 라 한국 아침 적재가 전날로 찍히는 함정 회피), `sourceFile='hira:getHospBasisList'`.

[hira-hospital.adapter.ts](../../apps/friendly/src/modules/life-map/hira-hospital.adapter.ts): `https://apis.data.go.kr/B551182/hospInfoServicev2/getHospBasisList?serviceKey=…&pageNo&numOfRows&_type=json`. serviceKey 는 bus 어댑터의 `toServiceKeyPart` 재사용(Encoding 키를 `URLSearchParams` 에 넣으면 이중 인코딩 → 30 에러), 로깅엔 `serviceKey=***` 마스킹 URL 만. 응답 모델은 에어코리아와 같은 data.go.kr 게이트웨이 규약 — `items` 가 배열/단일 객체/`''`(0건) 셋 다 오는 버릇 흡수, `resultCode '00'` 정상·`'03'` NODATA, 게이트웨이 봉투 `OpenAPI_ServiceResponse.cmmMsgHeader.returnReasonCode` 가 `20/21/22/30/31/32/33` 이면 `HiraApiAuthError`(재시도·다음 페이지 무의미, 즉시 중단), `04/05`·HTTP 5xx·타임아웃·네트워크는 일시 오류로 최대 2회 재시도(700ms × attempt). 타임아웃 **40초** — 1MB 페이지에서 게이트웨이가 20초를 넘겨 `AbortError` 가 났던 2026-08-28 적재 실측.

### 지오코딩 — VWorld getcoord + 영구 캐시 + 일 한도 분할

[life-map-geocode.service.ts](../../apps/friendly/src/modules/life-map/life-map-geocode.service.ts). 한 건: `https://api.vworld.kr/req/address?service=address&request=getcoord&version=2.0&crs=epsg:4326&refine=true&simple=false&format=json&type=road|parcel&address=…&key=…`, 타임아웃 15초, 5xx·네트워크는 4회 재시도(0.5·1·2·4초), HTTP 4xx 와 `status=ERROR`(키 오류·일 한도)는 `VworldGeocodeError` 로 **일괄 작업 즉시 중단**. 키는 WMTS 와 같은 `VWORLD_API_KEY` 를 `MapSettingsService.getSecret('vworld')`(설정>지도 DB 우선 + env 폴백)로 읽는다.

행 하나의 주소 후보(`lifeAddressCandidates`, 최대 6개·4자 미만 제외·중복 제거): 도로명 → 지번 → **열이 뒤바뀐 행** 교차(도로명 열이 `…동 산1-8` 꼴이면 parcel 로도, 지번 열이 `…길 57` 꼴이면 road 로도) → 괄호·`, 1층` 제거본. 실측(2026-08-21, 300건 표본) 도로명 83% + 지번 폴백 11% = 94%.

일괄(`geocodeLifeRows`): 캐시 전량을 Map 으로 적재 → ① 캐시 패스(후보 순서대로 ok 면 채움, 전부 notfound 면 unresolved, 미캐시 후보가 남으면 pending) → ② 업스트림 패스: 워커 **동시 2**(4 이상이면 업스트림이 연결을 끊음)·호출 간격 **80ms**(초당 ~45콜 버스트에서 502), `--max-calls` 상한(일 한도 분할), `--offline`(캐시만), `--retry-notfound`. 결과는 ok/notfound 모두 캐시 버퍼에 쌓아 200콜마다 `$transaction(upsert×200)` 으로 flush(중단돼도 보존). 일시 장애는 그 행만 건너뛰고(캐시 안 함 → 다음 실행 재시도) 20회 연속이면 중단. 리포트: `resolved/cacheHits/apiCalls/apiOk/apiNotFound/transientErrors/noCandidate/unresolved/skipped/stoppedBy`.

캐시 이동([life-map-geocode-cache.service.ts](../../apps/friendly/src/modules/life-map/life-map-geocode-cache.service.ts)): `export:life-geocode` 가 `LifeGeocodeCache` 전량을 `{version:1, exportedAt, count, entries[{type,address,status,lat,lng,refined,checkedAt}]}` JSON 으로 만들어 `.gz` 면 gzip level 9 로 **추적 경로** [src/modules/life-map/data/life-geocode-cache.json.gz](../../apps/friendly/src/modules/life-map/data/life-geocode-cache.json.gz) 에 쓴다(`apps/friendly/data/*` 는 gitignore 지만 이 경로는 커밋 대상). `import:life-geocode` 는 확장자 또는 gzip 매직(`1f 8b`)으로 풀고 형식을 엄격 검증(이상 항목 하나라도 있으면 **전체 거절** — 조용한 부분 적재보다 낫다) 한 뒤 400건 청크로 기존 키를 조회해 없는 키만 `createMany`(기본, 서버가 따로 쌓은 결과 보존) / `--overwrite` 면 갱신. **서버 기동 시 import 는 없다** — deploy.sh 가 pull 전후 `git diff --name-only` 로 gz 변경(`GZ_CHANGED`)을 감지해 `import:life-geocode` → `load:life-toilets <csv> --offline` 을 돌린다.

커밋본 현재(컴파일 시점 gz 해독): `exportedAt 2026-08-21T13:16:43Z`, **39,181건**(ok 34,993 · notfound 4,188 / road 32,113 · parcel 7,068), 1,168,713바이트. 첫 커밋 `1d92acb` 는 27k건 809,445바이트 부분본이었고 `a21de10` 이 1일차 결과로 갱신했다.

### 조회 — 점/셀 이중 모드, 로컬 인덱스 범위 조회

[life-map.service.ts](../../apps/friendly/src/modules/life-map/life-map.service.ts) `getPoints`: `requireSync(layer)`(최신 `LifeMasterSync` 없으면 503 + `pnpm --filter friendly load:life-… <csv> 실행 필요` 안내 — 지하철 마스터와 같은 규약) → `zoom ≥ LIFE_MAP_POINT_MIN_ZOOM[layer]`(**cctv 15 · toilet 13 · hospital 14**) 이고 bbox 한 변 ≤ `POINTS_MAX_SPAN_DEG=1.5°`(줌 값을 속여 전국 bbox 로 점을 긁는 요청을 셀로 강등) 이면 **points**: `(lat,lng)` 복합 인덱스 범위 `findMany` 를 `take: 4001` 로 받아 4,000 초과면 `truncated=true` + `count` 1회. 점 응답은 최소 필드(`id/lat/lng` + cctv `purpose` / toilet `name,open24` / hospital `name`)뿐이고 상세는 detail 라우트. 아니면 **cells**: 전국 고정 원점 `LIFE_CELL_ORIGIN(33N,124E)` 기준 격자 — 셀 한 변 `dLng = 360/2^z/4`(웹 메르카토르 256px 타일의 1/4 ≈ 화면 64px), `dLat = 0.8·dLng`(≈cos 37°) — 로 bbox 를 **셀 경계에 바깥 정렬**한 뒤 `$queryRaw` 로 `CAST((lng-o)/dLng AS INTEGER) cx, CAST((lat-o)/dLat AS INTEGER) cy, COUNT(*), AVG(lat), AVG(lng) … GROUP BY cx, cy`(COUNT 는 BigInt → Number). 표시 좌표는 무게중심을 **셀 중심 ±15%** 로 눌러(이웃 버블 겹침 방지와 격자 느낌 사이의 절충) 반환. 셀 결과는 `layer|zoom|정렬 bbox|filtersKey|syncId` 키로 LRU **300개·10분** 캐시 — 전국 줌의 377k 행 집계(수십 ms)가 패닝마다 반복되지 않게, 셀 하나 안의 패닝은 같은 키를 맞춘다. 필터(purpose IN / category IN / 화장실 불리언 `=1`)는 점·셀·주변 세 경로에 똑같이 걸린다. 클러스터링은 클라이언트가 아니라 **서버 격자 집계**다.

`getNearby`: 반경(m)을 등거리 근사 bbox(`radius/111,320`, 경도는 `cos(lat)` 보정)로 좁혀 전체 행 `findMany` → `haversineM` 로 거리 → 반경 필터·오름차순 → `limit`. `total` 은 반경 내 전체 건수. 좌표 null 행은 범위 비교에서 자연히 빠진다. `getDetail`: `findUnique` → 없으면 404.

### 지역 이동 검색 — 소스별 경로

옴니박스([LifeGoToBox](../../apps/web/src/components/life-map/LifeGoToBox.tsx) / 앱 [LifeGoToModal](../../apps/mobile/src/components/lifeMap/LifeGoToModal.tsx))는 네 소스를 한 입력으로 묶는다.

| 섹션 | 검색 경로 | 쿼터 | 이동 줌 |
|---|---|---|---|
| 행정구역 | **로컬 즉시** — `searchWeatherPlaces`(utils weatherRegions 245지점, 날씨·대기와 공유), 입력 없을 땐 시도 칩 → 시·군·구 칩 | 0 | 시도 11 · 시 13 · 구·군 14 |
| 지하철역(수도권) | 기존 `useSubwayStationSearch`(로컬 역사마스터) | 0 | 16 |
| 버스정류장(서울) | 기존 `useBusStationSearch`(30일 캐시) | bus 쿼터 정책 | 16 |
| 주소·장소 | `GET /life-map/search` → [LifeMapSearchService](../../apps/friendly/src/modules/life-map/life-map-search.service.ts) → VWorld search 2.0 `type=place` + `type=address&category=road` **병렬 1콜씩**(size 10) | VWorld 키 한도 | 17 |

원격 셋은 입력 **250ms 디바운스** 뒤 호출, 섹션당 5건. 검색 서비스는 검색어(공백 정규화) 단위 LRU **500개·10분** 캐시, `…로/길 + 번호` 꼴이면 주소를 앞에·아니면 장소를 앞에, 같은 제목+좌표(소수 5자리)는 접는다. 서버에 vworld 키가 없으면 `enabled=false` 빈 목록(200) 으로 답하고 클라이언트는 섹션을 숨긴다 — 보조 기능이라 페이지를 막지 않는다. [vworld-search.adapter.ts](../../apps/friendly/src/modules/life-map/vworld-search.adapter.ts): 타임아웃 8초, 간헐 502 는 300ms 뒤 1회 재시도, `status=ERROR` 코드가 `KEY|AUTH|LIMIT|DOMAIN|INCORRECT_KEY|UNAUTHENTICATED` 면 503(설정 문제)·그 외 502, 좌표는 한국 범위 값으로 판정, 요청 URL 은 `key=***` 마스킹본만 에러에 싣는다. `type=district` 는 category 필수라 쓰지 않는다(행정구역은 로컬). 선택 시 `onGo`(flyTo + 웹은 URL `ll/z` 갱신) + 최근 본 위치 8개 persist(같은 라벨·0.0005° 이내는 앞으로 끌어올림).

### 웹 UI 골격

[LifeMapPage](../../apps/web/src/routes/LifeMapPage.tsx): URL 이 진실(`?ll=lat,lng&z=줌&sel=layer:id` — 사용자 이동(`onViewportChangeEnd`)만 URL 에 반영, 모든 뷰포트 변경(`onViewportSync`)은 250ms 디바운스 뒤 조회 키), 레이어·필터는 persist 스토어. 진입 중심은 URL → 저장한 내 위치(`useAirLocation`, 날씨·대기와 공유; 늦게 오면 사용자가 안 움직였을 때 1회 flyTo) → 서울시청(37.5665, 126.978) 줌 15. 켜진 레이어마다 `useLifeMapPoints` 1개(최대 3콜/이동), 주변 목록은 **지도 중심** 기준 탭(화장실 1km · CCTV 500m · 병의원 1km, 15건; 꺼진 레이어 탭이면 켜진 쪽으로 보이되 선택은 보존). 안내 칩: 켜진 레이어가 셀이면 "CCTV 15 · 화장실 13 이상 확대하면 개별 지점이 보입니다(지금 N)", 잘렸으면 "지점이 많아 일부만 표시 중". 셀 버블 클릭은 `flyToZoomIn(현재 줌+2)`.

레이아웃 분기는 **CSS 이중 마운트가 아니라 JS** `useIsDesktopXl()`(matchMedia `(min-width: 80rem)`, 없으면 데스크톱): 지도 `<section>` 과 패널 한 벌만 두고 시트는 모바일에서만 마운트한다(데스크톱에 시트가 숨어 있으면 html overflow 락이 따라온다). 지도 섹션은 두 분기에서 같은 자리(첫 자식)라 폭이 바뀌어도 OL 인스턴스를 다시 만들지 않는다. 데스크톱(xl+): 좌 패널 400px = `LifeGoToBox(panel)` → 열리면 본문 자리를 차지 / `LifeLayerBar(all)` / `LifeNearbyList` 또는 `LifeDetailCard` / `LifeMapFooter`. 모바일: `usePublicLayout().setSubBar` 로 상단바 subBar 에 `LifeGoToBox(bar, 드롭다운)` + `LifeLayerBar(section='layers')`, 지도는 헤더 아래 `fixed` 배경(`--map-bottom-inset: 120px` 로 좌하단 레이어 컨트롤·우하단 내 위치 버튼을 peek 시트 위로), 목록 [BottomSheet](../../apps/web/src/components/sheet/BottomSheet.tsx)(peek 120px 엔 탭·반경·건수 머리 행만, half 부터 `LifeLayerBar(section='filters')` + 목록 + 푸터, z 20) + 선택 시 상세 시트(z 25, `key=selectedMarkerId`). 두 시트의 스냅은 [useMapSheets](../../apps/web/src/components/sheet/useMapSheets.ts)(상세 열리면 목록 스냅 기억→peek·숨김, 상세 half 진입; 닫히면 복원 — 렌더 중 파생) 가 조율하고, 목록에서 고른 지점이 시트 아래로 숨지 않게 `flyTo(..., { bottomInset: sheetHalfInset(headerHeight) })`(가용 높이 × 0.55). 시트 패턴 자체는 [web](web.md) 토픽.

[LifeMapView](../../apps/web/src/components/life-map/LifeMapView.tsx): `MapCanvas` 한 장(`poolKey='life'`)에 CCTV 점 → 화장실 → 병의원 순으로 한 소스(원이 점 위에), 내 위치(파란 점)·저장 위치(보라 점)는 fit 에서 빠지는 `overlayMarkers`. 키 게이트 3분기(확인 중 / 404 미등록 안내 / 정상)는 대기·버스 지도와 같은 정책. [lifeMapMarkers.ts](../../apps/web/src/components/life-map/lifeMapMarkers.ts): 아이콘 data URL 은 모듈 레벨 1회, 셀 버블은 `layer:count` 키 메모이즈; 마커 id `${layer}:${id}` / `cell:${layer}:${index}`; CCTV 점·셀 버블은 `fixedScale`(줌과 무관하게 원본 크기 — 이 기능이 MapCanvas 에 도입한 옵션, Style 캐시와 함께). 화장실·병의원 라벨은 주변 목록 + 선택 항목만(수백 개 전부는 과밀).

### 앱 UI 골격

[apps/mobile/app/life-map/index.tsx](../../apps/mobile/app/life-map/index.tsx): 대중교통 탭과 같은 골격 — `TransitMapView`(WebView OL) 풀블리드 + [LifeMapHeader](../../apps/mobile/src/components/lifeMap/LifeMapHeader.tsx)(뒤로 · 검색 → [LifeGoToModal](../../apps/mobile/src/components/lifeMap/LifeGoToModal.tsx) pageSheet · 레이어 칩 3개(건수) · 내 위치) + List 시트(gorhom `snapPoints ['20%','50%','100%']`, `index 1`, **`enableDynamicSizing={false}`**) 의 `BottomSheetFlatList`(헤더 [LifeFilterRows](../../apps/mobile/src/components/lifeMap/LifeFilterRows.tsx) + `LifeNearbyHeader`, 행 `LifeNearbyRow`, 푸터 [LifeFooter](../../apps/mobile/src/components/lifeMap/LifeFooter.tsx)) + 선택 시 Detail 시트([LifeDetailPanel](../../apps/mobile/src/components/lifeMap/LifeDetailPanel.tsx), z 30 — 끝까지 내려도 닫히지 않고 "← 목록" 으로 닫는다). 데이터 훅·마커 규칙·안내 문구는 웹과 공용이고, 진입 중심·주변 반경·디바운스도 같은 값. 선택은 로컬 state(URL 동기화 없음), 파라미터는 `ll`·`sel` 을 진입 시 1회만 읽는다.

플로팅 헤더 보간(`4e414aa`): 활성 시트 index 1.5→2 구간에서 카드 `marginHorizontal 12→0 · marginTop 8→0 · borderRadius 12→0 · shadow/elevation→0`, wrap 배경 투명→surface(노치 영역) — 맛집·대중교통 헤더와 동일 구간·값. 시트 full 상단 `listTopInset = insets.top + 카드 높이` 라 full 에선 8px 틈 없이 헤더 바로 아래에 맞붙고, 마진은 카드 바깥이라 `onLayout` 높이가 보간 중 변하지 않아 topInset 재계산이 없다. `342b3b7`: 헤더가 `detailOpenSV` 로 **활성 시트**(상세 열리면 상세 index)를 따라가야 상세 full 에서도 상태바 뒤로 지도가 비치지 않는다. `fdb6ab9`: gorhom v5 는 `snapPoints` 를 줘도 기본 `enableDynamicSizing` 이 '콘텐츠 높이' 지점을 끼워 넣어(목록이 짧을 때) 지점이 4개가 되고 `animatedIndex 2` 가 full 이 아닌 중간이 되어 보간이 160pt 아래서 끝나던 것 — 지도 시트 6개(맛집·대중교통·일상지도 각 목록/상세) 에 끈다. 지도 `viewBottomInset` 은 두 시트 `animatedPosition` 의 min 으로 계산.

[lifeMapBridgeMarkers.ts](../../apps/mobile/src/components/lifeMap/lifeMapBridgeMarkers.ts): 웹과 같은 id·아이콘 규칙이되 아이콘은 **사전(`icons`)** 으로 한 번만 보내고 마커는 키만 든다(`@cctv:{group}` · `@cctv-sel:{group}` · `@toilet(-sel)` · `@hospital(-sel)` · `@cell:{layer}:{count}`) — 수천 CCTV 점이 같은 data URL 을 반복하지 않게. 이를 위해 대중교통 브리지에 `setMarkers.icons` 사전 치환과 `BridgeMarker.fixedScale`(셀 버블 축소 금지) 이 추가됐다(`e348032`, 기존 대중교통 동작 무변경 — [transit](transit.md)/[mobile](mobile.md)).

## Talks To [coverage: high — 12 sources]

- **localdata.go.kr(지방행정인허가데이터개방) CSV** — 서버가 아니라 사람이 내려받아 `data/open/` 에 두고 스크립트가 읽는다. 원본은 리포 밖(`/data/` gitignore), 출처·적재 명령·보관 기준은 [docs/data-sources.md](../../docs/data-sources.md).
- **심평원 병원정보서비스 `apis.data.go.kr/B551182/hospInfoServicev2`** — 적재 스크립트·프로브만 호출(요청 경로 없음). 키 `HIRA_API_KEY`, 비면 `BUS_API_KEY` 폴백(같은 data.go.kr 계정 키 — 15001698 활용신청만 추가). 개발계정 일 10,000건, 전량 ~80콜. [probe:hira](../../apps/friendly/scripts/probe-hira-api.ts) 가 키 등록·`_type=json`·`numOfRows=1000` 허용·필드 인벤토리·좌표 결측률·ykiho 길이(계약 상한 200)·종별 분포를 실응답으로 확정(덤프 `apps/friendly/data/hira-probe/*.json`, ~4콜).
- **VWorld 지오코더(`api.vworld.kr/req/address`)** 와 **VWorld 검색(`/req/search`)** — 둘 다 WMTS 와 같은 인증키를 `MapSettingsService.getSecret('vworld')`(DB `MapProviderConfig` 우선 + `.env VWORLD_API_KEY` 폴백, 검색 라우트는 요청마다 읽어 키 교체 즉시 반영)로 얻는다 — [map](map.md) 토픽의 [db-config-env-fallback](../concepts/db-config-env-fallback.md) 소비처.
- **friendly DB(Prisma/SQLite)** — `life_cctvs`·`life_toilets`·`life_hospitals`·`life_geocode_caches`·`life_master_syncs`. 조회 라우트는 이 테이블만 본다.
- **rate-limit 플러그인** — `RATE.lifeMapRead`(points·nearby, **240/분** — 지도 이동마다 레이어당 1콜 + CGNAT), `RATE.lifeMapSearch`(**60/분** — 디바운스 뒤 호출). status·detail 은 전역 기본.
- **`reply-upstream-error`** — 업스트림은 없지만 미적재 503·없는 항목 404 를 라우트가 직접 응답하려고 대중교통과 같은 `replyUpstreamError` 경로(전역 error-handler 는 5xx 를 500 으로 뭉갠다).
- **`@repo/api-contract`** `schemas/life-map.ts`·`Routes.LifeMap`, **`@repo/shared`** `lifeMapApi`·`useLifeMap*`, **`@repo/utils`** `lifeMap.ts`·`lifeMapMarker.ts`(`markerFrame` 의 핀/원 프레임 공유) + `formatBbox`·`parseLatLngParam`·`haversineM`·`approxDistanceM`·`isInKorea`.
- **weather/air** — 행정구역 인덱스는 [weatherRegions](../../packages/utils/src/weatherRegions.ts) 의 245지점(`WEATHER_SIDOS`·`weatherPlacesBySido`·`searchWeatherPlaces`)을 그대로 쓰고, 진입 중심·보라 점 오버레이는 `useAirLocation` 의 저장한 내 위치 — [weather](weather.md)·[air-quality](air-quality.md).
- **bus/subway** — 옴니박스의 역·정류장 섹션은 `useSubwayStationSearch`·`useBusStationSearch` 를 그대로 호출([bus](bus.md)·[subway](subway.md)). 병의원 어댑터는 bus 의 `toServiceKeyPart` 를 import.
- **map(MapCanvas)** — `fixedScale` 마커·`markerStyleCache`·`flyTo/flyToZoomIn` 의 `bottomInset` 옵션은 이 기능이 도입한 확장([map](map.md)). 앱은 transit 의 `TransitMapView`/브리지.
- **deploy.sh** — API 케이스(1·2·4)마다 `life_map_data` 자동 점검, 6번 메뉴는 강제 재적재. 상태는 `status:life-map` 한 줄을 bash 정규식 `stat_val` 로 파싱(BSD sed `\b` 함정 회피).

## API Surface [coverage: high — 8 sources]

### HTTP (공개·비로그인, `tags: ['life-map']`)

| 메서드 | 경로 | 파라미터 | 응답·비고 |
|---|---|---|---|
| GET | `/api/v1/life-map/status` | — | `layers[]{layer, loaded, count, geocoded(화장실·병의원 좌표 확보 건수, CCTV null), baseDate, loadedAt}` + `fetchedAt`. 웹·앱 레이어 칩 건수·푸터 |
| GET | `/api/v1/life-map/points` | `layer`·`bbox="minLng,minLat,maxLng,maxLat"`·`zoom(0~22, 소수 허용·서버 내림)` + 필터(`purpose`·`category` 쉼표 목록, `open24/disabled/kids/diaper/bell` = `'1'|'0'|'true'|'false'`) | `mode 'points'|'cells'`, `items`(최소 필드, 상한 4,000·`truncated`)·`cells[{lat,lng,count}]`·`total`·`minPointZoom`·`fetchedAt(=loadedAt)`. 미적재 503. rate 240/분 |
| GET | `/api/v1/life-map/nearby` | `layer`·`lat(33~39)`·`lng(124~132)`·`radius(100~3000, 기본 1000)`·`limit(1~30, 기본 10)` + 필터 | 거리 오름차순 상세 항목(`dist` m)·`total`(반경 내 전체). 503. rate 240/분 |
| GET | `/api/v1/life-map/search` | `q(2~60자, NFC·공백 정규화)`·`limit(≤20, 기본 8)` | `{q, items[{kind 'place'|'road'|'parcel', id, title, subtitle, lat, lng}], enabled, fetchedAt}`. 키 없음 `enabled=false`(200) · 인증/한도 503 · 업스트림 502. rate 60/분 |
| GET | `/api/v1/life-map/:layer/:id` | `id` 1~200자(병의원 ykiho 는 base64 ~100자) | `LifeMapItem` = `layer` discriminated union(`LifeCctvItem`·`LifeToiletItem`·`LifeHospitalItem`). 404. 라우트 등록은 `decodeURIComponent(Routes.LifeMap.detail(':layer', ':id'))`(지하철 도착 라우트 패턴) |

불리언 쿼리는 `LifeMapFlagParam`(enum → transform) — `z.coerce.boolean` 은 `'0'/'false'` 도 true 라 쓰지 않는다. `bbox` 문자열 규약은 맛집 공개 목록과 같은 `@repo/utils formatBbox`.

### 스크립트 (`apps/friendly/package.json`, `tsx --env-file=.env`)

| 명령 | 역할 | 옵션 |
|---|---|---|
| `load:life-cctv <csv>` | CSV 정규화 리포트 + `LifeCctv` 전량 교체 | `--dry-run` |
| `load:life-toilets <csv>` | 정규화 → 지오코딩 → `LifeToilet` 전량 교체 | `--dry-run` · `--offline` · `--max-calls=N` · `--concurrency=N`(기본 2) · `--pause=N`(기본 80) · `--retry-notfound` |
| `load:life-hospitals` | HIRA 전량 페이징 → 정규화 → 결측만 지오코딩 → `LifeHospital` 전량 교체 | `--dry-run`(업스트림 ~80콜은 나간다) · `--max-pages=N`(확인용, 부분 적재 비권장) · 지오코더 옵션 동일 |
| `export:life-geocode [경로]` | 캐시 → json(.gz) — 기본 추적 경로 | — |
| `import:life-geocode [경로] [--overwrite]` | json(.gz) → 캐시(없는 키만 / 덮어쓰기) | — |
| `status:life-map` | `ok cctv=N toilet=M geocoded=G hospital=H cache=C` / `missing`(테이블 없음) | — |
| `probe:hira` | 심평원 API 실응답 프로브 | — |

### FE 공통 export

- [lifeMapApi](../../packages/shared/src/api/life-map.api.ts) `status()`·`points(layer,bbox,zoom,filters)`·`nearby(layer,lat,lng,{radius,limit,filters})`·`detail(layer,id)`·`search(q,limit)`; `LifeMapFilterParams`·`LIFE_MAP_BOOLEAN_FILTERS`.
- [useLifeMap.ts](../../packages/shared/src/hooks/useLifeMap.ts): `useLifeMapStatus`·`useLifeMapPoints(params|null)`(키 `['life-map','points',layer,bbox,floor(zoom),filtersKey]`, `placeholderData: prev` 로 bbox 전환 중 마커 깜빡임 방지)·`useLifeMapNearby`(좌표 키 소수 4자리 ≈ 11m 스냅)·`useLifeMapDetail`·`useLifeMapSearch`(2자 미만 비활성, `retry:false`). 정적 마스터라 **staleTime 24h**(지하철 마스터 사다리), 검색은 서버 캐시와 같은 10분. `lifeMapFiltersKey` 로 배열·객체 identity 에 흔들리지 않는 문자열 키.
- [utils lifeMap.ts](../../packages/utils/src/lifeMap.ts): `LIFE_MAP_LAYERS/LABEL`·`isLifeMapLayer`·`LIFE_MAP_POINT_MIN_ZOOM`·`LIFE_MAP_POINTS_MAX`·`LIFE_CCTV_PURPOSES`(10)·`normalizeLifeCctvPurpose`·`parseLifeCctvPurposes`·`LIFE_CCTV_PURPOSE_GROUPS`(4)·`lifeCctvPurposeGroup`·`LIFE_TOILET_KINDS`(5)·`LIFE_TOILET_OPEN_TYPES`(5)·`lifeToiletOpen24`·`lifeToiletOpenLabel`(웹 `lifeMapFormat.openLabel` 에서 승격, 앱 공용)·`LIFE_TOILET_FEATURES`(6, 입구 CCTV 는 표시만)·`LIFE_TOILET_FILTER_KEYS`(5)·`summarizeLifeToiletFixtures`·`LIFE_HOSPITAL_CATEGORIES`(7)·`normalizeLifeHospitalCategory`·`parseLifeHospitalCategories`·`formatLifeYm`·`formatLifeCount`(1,234→'1.2천', 12,345→'1.2만')·`lifeCountBucket`·`LIFE_CELL_ORIGIN`·`lifeCellSizeDeg`.
- [utils lifeMapMarker.ts](../../packages/utils/src/lifeMapMarker.ts): 색 `LIFE_CCTV_GROUP_COLOR{safety #2a78d6, child #eb6834, traffic #1baf7a, etc #4a3aa7}`·`LIFE_TOILET_COLOR #c2185b`·`LIFE_HOSPITAL_COLOR #00897b`·`LIFE_LAYER_COLOR`; `buildLifeCctvDot(12px)/Pin(32×48)`, `buildLifeToiletMarker`/`buildLifeHospitalMarker(26px 원 | 선택 핀)`, `buildLifeCellMarker`(건수 버킷별 지름 26/34/40/46, 숫자를 SVG 안에 새김 — MapCanvas 라벨은 줌 14 미만에서 꺼지므로).

## Data [coverage: high — 8 sources]

마이그레이션 [20260821130000_add_life_map](../../apps/friendly/prisma/migrations/20260821130000_add_life_map/migration.sql) + [20260827222827_add_life_hospital](../../apps/friendly/prisma/migrations/20260827222827_add_life_hospital/migration.sql):

| 테이블(모델) | 키·주요 컬럼 | 인덱스 |
|---|---|---|
| `life_cctvs`(`LifeCctv`) | `id`=관리번호(전국 유일, 실측 중복 0) · `orgCode`(개방자치단체코드 7자리)·`orgName`·`roadAddr`·`lotAddr`·`purpose`(10종)·`cameraCount`·`pixels`(만 화소)·`direction`·`keepDays`·`installedYm('YYYYMM')`·`phone`·`lat/lng NOT NULL`·`baseDate('YYYY-MM-DD')` | `(lat, lng)` |
| `life_toilets`(`LifeToilet`) | `id`·`orgCode`·`name`·`kind`(5종)·주소 2종·`orgName`·`phone`·`openType`(5종)·`openDetail`·`open24`(적재 시 판정)·변기수 9열(`maleToilet…femaleKidsToilet`, 기본 0)·파생 `disabled`·`kids`·`ownerType`·`disposal`·`safetyTarget?`·`bell`·`bellPlace`·`entranceCctv`·`diaper`·`diaperPlace`·`installedYm`·`remodeledYm`·`baseDate`·`lat/lng?`·`geoSource 'road'|'parcel'|null` | `(lat, lng)` |
| `life_hospitals`(`LifeHospital`) | `id`=ykiho(암호화 요양기호)·`name`·`kindName`(원문)·`category`(7종)·`sidoName`·`sgguName`·`emdongName`·`postNo`·`addr`·`phone`·`url`·`openedDate`·`doctorCount?`·`lat/lng?`·`geoSource 'api'|'road'|'parcel'|null` | `(lat, lng)` |
| `life_geocode_caches`(`LifeGeocodeCache`) | PK `(type, address)` · `status 'ok'|'notfound'`·`lat/lng?`·`refined`(지오코더 정제 주소)·`checkedAt` | — |
| `life_master_syncs`(`LifeMasterSync`) | `id`·`layer`·`count`·`geocoded?`·`baseDate?`·`sourceFile?`·`loadedAt` — 레이어별 최신 행이 "적재됨" 판정·`fetchedAt`·상태 API 의 원천(버스/지하철 MasterSync 패턴) | `(layer, loadedAt)` |

인메모리 캐시: `LifeMapService.cellCache`(LRU 300 · 10분, 키에 `syncId` 포함 → 재적재 즉시 무효) · `LifeMapSearchService.cache`(LRU 500 · 10분, 검색어 키). 클라이언트: React Query 24h/10분.

저장소 커밋 산출물: [data/life-geocode-cache.json.gz](../../apps/friendly/src/modules/life-map/data/life-geocode-cache.json.gz)(1.1MB, 39,181건). 원본 CSV·프로브 덤프는 gitignore(`/data/`, `apps/friendly/data/*`).

클라이언트 스토어(웹 localStorage / 앱 AsyncStorage `createJSONStorage`, 이름·버전 동일):
- `lp:life-map-prefs` **v2** — `layers{cctv,toilet,hospital}`(기본 전부 켬)·`purposes[]`·`toiletFilters{open24,disabled,kids,diaper,bell}`·`hospitalCategories[]`. `migrate` v1→v2 가 병의원 레이어를 기존 사용자에게도 기본 켬 + 종별 전체. 위치(`ll,z`)·선택(`sel`)은 URL 이 진실이고 이 설정은 취향이라 persist(`transitCrossShowStore` 관례). 웹은 `setPurposes/setHospitalCategories/resetFilters`, 앱은 `clearPurposes/clearHospitalCategories` 로 액션명이 조금 다르다.
- `lp:life-map-recent` v1 — 최근 본 위치 `{label, sub, lat, lng, zoom, at}` 최대 8개.
- 앱 스토어는 `AsyncStorage` 를 직접 `createJSONStorage` 에 넘기는 방식(대중교통 `transitRecentStore` 관례)이지 [shared](shared.md) 의 주입형(injectable storage)은 아니다 — 서버 동기화 대상이 아니라 문제는 없다.

## Key Decisions [coverage: high — 14 sources]

- **2026-08-30 병의원은 CSV 가 아니라 API 전량 적재, 좌표는 업스트림 우선**(`4fd6e22`) — 심평원이 `XPos/YPos` 를 99.99% 주므로 지오코딩은 결측 소수만. deploy.sh 는 예측성을 위해 `--offline` 으로 돌리고(결측 소수는 지도 미표시 — 수동으로 옵션 없이 재실행하면 채워진다) 병의원 0건이면 자동 실행. 키는 `HIRA_API_KEY` → `BUS_API_KEY` 폴백(계정당 키 1개). 마커는 종별과 무관한 **단색 청록** — CCTV 처럼 그룹색을 더 얹으면 한 화면 색이 8개를 넘어 전 쌍 분리가 깨진다(분홍 원과는 색상, 초록 점과는 형태로 갈림). 종별 `category` 7종은 필터·서버 열, 원문 `kindName` 은 상세. 어댑터 타임아웃 40초 + 일시 오류 2회 재시도, `'상급종합'` 매핑, 레이어 칩 `nowrap` + 가로 스크롤(xl 은 줄바꿈 — 400px 패널에서 한글이 글자 단위로 꺾여 '병/의/원' 이 되던 것).
- **2026-08-22 앱 플로팅 헤더는 활성 시트를 따라가고 sticky 로 펴진다**(`4e414aa`·`342b3b7`), **지도 시트 6개 `enableDynamicSizing=false`**(`fdb6ab9`) — 맛집·대중교통과 같은 "상단에 가까울수록" 동작(프레임 캡처로 시트 상단 ≈316pt→128pt 구간 확인). 최근 본 위치 8개 AsyncStorage(`563890a`).
- **2026-08-22 앱 화면은 대중교통 골격 재사용 + 브리지 아이콘 사전**(`e348032`) — 새 지도 컴포넌트를 만들지 않고 `TransitMapView` 에 `setMarkers.icons`·`BridgeMarker.fixedScale` 만 확장. `lifeToiletOpenLabel` 등 표시 문자열을 utils 로 승격해 웹·앱이 같은 문구.
- **2026-08-22 웹 모바일 = 맛집 v2 시트 패턴, 분기는 CSS 이중 마운트 대신 JS**(`e84e4b9`) — 지도 한 장·패널 한 벌, 데스크톱엔 시트 없음(숨은 시트의 html overflow 락 회피). `BottomSheet` 를 `restaurant-v2/` → `sheet/` 로 승격하고 목록/상세 스냅 조율을 `useMapSheets` 로 공용화(맛집 v2 도 교체). `MapCanvas.flyTo/flyToZoomIn` 에 `bottomInset` — 시트가 덮는 높이만큼 중심을 밀어 지점이 보이는 영역 가운데로. `useMapSheets` 호출은 React Compiler 메모 검증 때문에 각 페이지 `useState` 선언 앞에 둔다(뒤에 두면 setter 를 반응값으로 본다). 375px 에서 목록 영역 5px → half ~250px.
- **2026-08-22 원본 데이터는 `data/open/{food,life,eval}` 규약 + 로더/deploy 폴백**(`809b7e0`·`5a84b63`) — deploy.sh 가 `data/open/life/{cctv,toilet}.csv` 를 먼저 보고 localdata.go.kr 원래 파일명(`CCTV정보.csv`·`공중화장실정보.csv`)을 폴백(서버에 이미 올린 파일을 깨지 않기 위해), `LIFE_CCTV_CSV/LIFE_TOILET_CSV` env 로 덮어쓰기 가능. 적재 가드(cctv=0 이거나 `--force`)가 있어 실 서버 영향 없었다.
- **2026-08-21 지역 이동은 소스별로 가장 싼 경로**(`a21de10`) — 행정구역은 로컬 245지점(날씨 지점표 재사용), 역·정류장은 기존 훅, 주소/POI 만 서버 프록시(장소+도로명 병렬, 좌표 중복 제거, LRU 10분, 5xx 1회 재시도). 키 없으면 `enabled=false` — 보조 기능이라 페이지를 막지 않는다. VWorld `type=district` 는 category 필수라 미사용.
- **2026-08-21 지오코딩 캐시 압축본을 저장소에 커밋**(`1d92acb`, 결정 2026-08-21) — 운영 DB 가 따로 있어 dev.db 를 복사할 수 없는 환경에서, 로컬에서 끝낸 VWorld 결과(수만 행, JSON 수 MB → gz 1~2MB)만 옮겨 서버는 `git pull` + `--offline` 적재로 호출 0건. 파일 형식은 버전 필드 있는 단순 JSON(사람이 열어 볼 수 있고 의존성 없음). import 기본은 "없는 키만 추가"(서버가 따로 쌓은 결과 보존). deploy.sh 가 gz 변경을 감지해 자동 import + 화장실 재적재.
- **2026-08-21 전량 교체 트랜잭션 + 사유별 drop 리포트, CSV 는 비스트리밍**(`1d92acb`) — bus-master.service 골격. 적재 스크립트 전용이라 79MB 를 문자열 하나로 들고 RFC 4180 파서로 처리(스트리밍 구현 안 함). 하드 fail 은 헤더 불일치뿐.
- **2026-08-21 점/셀 이중 모드 + 고정 원점 격자 + 셀 경계 정렬 캐시**(`1d92acb`) — 전국 377k 점을 보내지 않기 위한 유일한 분기. 임계 줌은 밀도 실측(서울 CCTV ≈100개/km² → z15 뷰포트 ≈16km² 에서 ~1,500점; 화장실 ≈9개/km² → z13 ≈260km² ~2,400점; 병의원 ≈33개/km² → z14 ≈65km² ~2천 점)으로 상한 4,000 안에 들도록 정했다. `POINTS_MAX_SPAN_DEG 1.5°` 는 줌 속임 방어. 무게중심을 셀 중심 ±15% 로 클램프(버블 겹침 vs 격자 느낌 절충). 격자 원점을 전국 고정(124E,33N)으로 두어 패닝해도 셀 경계가 흔들리지 않고 GROUP BY 와 캐시 키가 같은 값을 쓴다.
- **2026-08-21 URL 이 진실(ll/z/sel), 취향은 persist, 진입 중심은 저장한 내 위치 공유**(`1d92acb`) — 날씨·대기와 같은 `useAirLocation` 이라 세 페이지가 같은 "내 위치" 를 본다.
- **2026-08-21 5색 팔레트 검증**(`1d92acb`) — dataviz 범주 팔레트에서 CCTV 4그룹 전 쌍 + 화장실 1색이 라이트 표면에서 CVD·정상시 분리 기준을 모두 통과한 조합(`scripts/validate_palette.js`). 점은 흰 외곽선이 있어 야간 타일에서도 같은 색.
- **2026-08-21 상태 API 와 미적재 503 안내**(`1d92acb`) — 지하철 마스터 규약과 동일: 적재 이력이 없으면 503 본문에 실행할 명령을 적는다. `status:life-map` 한 줄은 deploy.sh 가 키 단위로 뽑아 항목 추가가 안전.

## Gotchas [coverage: high — 12 sources]

- **화장실 지오코딩 2일차 재실행 미완** — `a21de10` 은 일일 한도로 79% 지점에서 중단("다음날 재실행 예정")했는데, 컴파일 시점(08-30) 로컬 `status:life-map` 이 `geocoded=42248/53559(78.9%) · cache=39181` 이고 커밋 gz 도 `a21de10` 이후 변경이 없다(exportedAt 08-21). 남은 ~11k 행은 지도·주변·셀 집계에 안 나온다(상세는 됨). 절차: `load:life-toilets <csv>`(온라인, 필요 시 `--max-calls`) → `export:life-geocode` → gz 커밋 → 배포 시 `GZ_CHANGED` 가 import + `--offline` 재적재를 자동 실행. `--retry-notfound` 는 notfound 캐시(4,188건)까지 다시 시도.
- **로컬 dev.db 는 병의원 미적재(hospital=0)** — 병의원 적재 실측은 08-28 이후 다른 상태에서 이뤄졌고 이 머신 DB 엔 없다. 로컬 확인은 `load:life-hospitals`(HIRA 키 필요, ~80콜) 를 직접 돌려야 하고, 운영은 deploy.sh 가 0건이면 자동 적재한다.
- **`data/open` 파일명 규약과 로컬 실제가 다르다** — [docs/data-sources.md](../../docs/data-sources.md) 는 `data/open/life/{cctv,toilet}.csv` 이지만 이 머신엔 `data/open/CCTV정보.csv`·`공중화장실정보.csv`(원래 이름)만 있다. deploy.sh 폴백이 흡수하지만 로컬 명령은 실제 경로를 직접 줘야 한다.
- **서버 기동은 캐시를 import 하지 않는다** — import 는 deploy.sh(또는 수동 `import:life-geocode`) 몫. deploy.sh 를 거치지 않는 수동 배포에서 gz 만 갱신하면 화장실 좌표가 늘지 않는다.
- **HIRA 활용신청 승인 직후 `30 등록되지 않은 서비스키`** — 게이트웨이 반영까지 수십 분(`probe:hira` 로 재확인). data.go.kr 는 데이터셋마다 활용신청이 따로라 다른 데이터셋 키를 그대로 쓰면 같은 30 이 난다. `BUS_API_KEY` 폴백은 같은 계정일 때만 의미.
- **`load:life-hospitals --dry-run` 도 업스트림 ~80콜을 소비**, `--max-pages` 로 적재하면 전량 교체라 나머지 기관이 빠진다(확인용으로만).
- **ykiho 는 재적재 후 영속 보장이 없다** — 전량 교체라 URL `sel=hospital:…` 이 404 가 될 수 있다(UI 문구 "데이터가 갱신돼 빠졌을 수 있음"). CCTV 관리번호·화장실도 원본이 바뀌면 같다.
- **VWorld 지오코더 한도·동시성** — 동시 4 이상이면 연결이 끊기고 초당 ~45콜 버스트에서 502(기본 2·80ms). `status=ERROR` 는 즉시 중단이지만 캐시는 flush 되므로 같은 명령 재실행이 이어간다. 일시 장애 행은 캐시에 남지 않는다(다음 실행 재시도).
- **테스트 격리** — [life-map.test.ts](../../apps/friendly/src/modules/life-map/life-map.test.ts) 는 전국 GROUP BY 합계가 실데이터에 흔들리므로 `useIsolatedDatabase()` 필수. 지오코딩·캐시 테스트는 **공유 dev.db** 에 고유 prefix 주소를 시드하고 afterAll 에서 지우므로 중단되면 `지오코딩테스트-*`/`지오캐시테스트-*` 행이 남을 수 있다. [life-map-search.test.ts](../../apps/friendly/src/modules/life-map/life-map-search.test.ts) 는 `vi.hoisted` 로 `VWORLD_API_KEY` 를 buildApp 전에 주입.
- **gorhom `enableDynamicSizing` 기본값 함정** — 콘텐츠가 짧으면(미적재·결과 1~2개) 스냅 지점이 4개가 되어 index 보간이 엉킨다. 새 지도 시트를 만들면 반드시 `false`(`fdb6ab9`).
- **`useIsDesktopXl` 은 matchMedia 가 없으면 데스크톱** — jsdom 테스트는 기본 데스크톱으로 렌더되고 모바일 시트 분기는 `window.matchMedia` 를 목으로 바꿔야 한다([LifeMapPage.test.tsx](../../apps/web/src/routes/LifeMapPage.test.tsx) 뒤 3건). 같은 테스트는 `MapCanvas` 를 목으로 바꿔 viewport 를 올리지 않으므로 points 요청은 나가지 않는다(주변·상세·검색 계약만).
- **웹 bar 드롭다운 바깥 닫기는 document `pointerdown`** — 헤더가 `backdrop-filter` 라 fixed 백드롭이 헤더 안에 갇혀 못 쓴다.
- **앱 홈 진입 행 문구가 낡았다** — [MyLocationCard](../../apps/mobile/src/components/home/MyLocationCard.tsx) `LifeMapLink` 는 "일상지도 — 내 주변 공중화장실·CCTV" 로 병의원을 언급하지 않는다. 앱은 선택·줌을 URL 로 되돌리지 않고 앱 전용 테스트도 없다.
- **deploy.sh 잘못된 선택 메시지가 `(1-6)`** — 메뉴는 1~7 이다(사소한 불일치).
- **CSV 파서는 비스트리밍** — 79MB 문자열 + 행 배열을 메모리에 든다. 적재 스크립트 전용 설계라 서버 요청 경로엔 영향 없다.
- **`status.geocoded` 는 병의원에선 "좌표 확보 건수"** — API 좌표(`geoSource='api'`)도 포함하므로 이름과 달리 지오코딩 건수가 아니다. 푸터의 "좌표 N%" 는 화장실에만 표시.

## Sources [coverage: high — 74 sources]

### friendly (백엔드·스크립트·운영)
- [apps/friendly/src/modules/life-map/life-map.route.ts](../../apps/friendly/src/modules/life-map/life-map.route.ts)
- [apps/friendly/src/modules/life-map/life-map.service.ts](../../apps/friendly/src/modules/life-map/life-map.service.ts)
- [apps/friendly/src/modules/life-map/life-map.test.ts](../../apps/friendly/src/modules/life-map/life-map.test.ts) — 10건(격리 DB: 미적재 503·상태·점/셀 분기·필터·절단·주변 거리순·상세 404·계약 400)
- [apps/friendly/src/modules/life-map/life-map-master.service.ts](../../apps/friendly/src/modules/life-map/life-map-master.service.ts) (+[test](../../apps/friendly/src/modules/life-map/life-map-master.service.test.ts) 4건)
- [apps/friendly/src/modules/life-map/life-map-hospital-master.service.ts](../../apps/friendly/src/modules/life-map/life-map-hospital-master.service.ts) (+[test](../../apps/friendly/src/modules/life-map/life-map-hospital-master.service.test.ts) 7건 — 정규화·가짜 fetch 어댑터·전량 페이징)
- [apps/friendly/src/modules/life-map/hira-hospital.adapter.ts](../../apps/friendly/src/modules/life-map/hira-hospital.adapter.ts)
- [apps/friendly/src/modules/life-map/life-map-geocode.service.ts](../../apps/friendly/src/modules/life-map/life-map-geocode.service.ts) (+[test](../../apps/friendly/src/modules/life-map/life-map-geocode.service.test.ts) 5건 — 후보·어댑터·캐시 재실행·오프라인/상한/ERROR·일시 장애)
- [apps/friendly/src/modules/life-map/life-map-geocode-cache.service.ts](../../apps/friendly/src/modules/life-map/life-map-geocode-cache.service.ts) (+[test](../../apps/friendly/src/modules/life-map/life-map-geocode-cache.service.test.ts) 3건 — 왕복·gz 매직·형식 거절)
- [apps/friendly/src/modules/life-map/life-map-search.service.ts](../../apps/friendly/src/modules/life-map/life-map-search.service.ts) (+[test](../../apps/friendly/src/modules/life-map/life-map-search.service.test.ts) 4건)
- [apps/friendly/src/modules/life-map/life-map-search.test.ts](../../apps/friendly/src/modules/life-map/life-map-search.test.ts) — 2건(라우트 계약·400/503/502 매핑, 어댑터 목)
- [apps/friendly/src/modules/life-map/vworld-search.adapter.ts](../../apps/friendly/src/modules/life-map/vworld-search.adapter.ts)
- [apps/friendly/src/modules/life-map/data/life-geocode-cache.json.gz](../../apps/friendly/src/modules/life-map/data/life-geocode-cache.json.gz) — 39,181건 1.1MB(커밋 `1d92acb`→`a21de10`)
- [apps/friendly/src/lib/csv.ts](../../apps/friendly/src/lib/csv.ts) (+[test](../../apps/friendly/src/lib/csv.test.ts) 5건) — RFC 4180 파서(이 기능으로 신설)
- [apps/friendly/src/lib/narrow.ts](../../apps/friendly/src/lib/narrow.ts) — `coerceStrOrNull/numOrNull/intOrNull/isObject`
- [apps/friendly/scripts/load-life-cctv.ts](../../apps/friendly/scripts/load-life-cctv.ts)
- [apps/friendly/scripts/load-life-toilets.ts](../../apps/friendly/scripts/load-life-toilets.ts)
- [apps/friendly/scripts/load-life-hospitals.ts](../../apps/friendly/scripts/load-life-hospitals.ts)
- [apps/friendly/scripts/export-life-geocode.ts](../../apps/friendly/scripts/export-life-geocode.ts)
- [apps/friendly/scripts/import-life-geocode.ts](../../apps/friendly/scripts/import-life-geocode.ts)
- [apps/friendly/scripts/life-map-status.ts](../../apps/friendly/scripts/life-map-status.ts)
- [apps/friendly/scripts/probe-hira-api.ts](../../apps/friendly/scripts/probe-hira-api.ts)
- [apps/friendly/package.json](../../apps/friendly/package.json) — `load:life-*`·`export/import:life-geocode`·`status:life-map`·`probe:hira`
- [apps/friendly/prisma/migrations/20260821130000_add_life_map/migration.sql](../../apps/friendly/prisma/migrations/20260821130000_add_life_map/migration.sql)
- [apps/friendly/prisma/migrations/20260827222827_add_life_hospital/migration.sql](../../apps/friendly/prisma/migrations/20260827222827_add_life_hospital/migration.sql)
- [apps/friendly/prisma/schema.prisma](../../apps/friendly/prisma/schema.prisma) — `LifeCctv`·`LifeToilet`·`LifeHospital`·`LifeGeocodeCache`·`LifeMasterSync`
- [apps/friendly/src/config/env.ts](../../apps/friendly/src/config/env.ts) — `HIRA_API_KEY`(BUS 폴백)·`VWORLD_API_KEY`
- [apps/friendly/.env.example](../../apps/friendly/.env.example) — 심평원 항목
- [apps/friendly/src/plugins/rate-limit.ts](../../apps/friendly/src/plugins/rate-limit.ts) — `lifeMapRead`·`lifeMapSearch`
- [apps/friendly/src/modules/settings/map.service.ts](../../apps/friendly/src/modules/settings/map.service.ts) — `getSecret('vworld')` 키 공급
- [apps/friendly/src/modules/bus/bus-api.adapter.ts](../../apps/friendly/src/modules/bus/bus-api.adapter.ts) — `toServiceKeyPart` 재사용
- [deploy.sh](../../deploy.sh) — `life_map_data`·케이스 6·CSV 경로 폴백·`GZ_CHANGED`
- [docs/data-sources.md](../../docs/data-sources.md) — `data/open/life/*.csv` 규약·행수
- [.gitignore](../../.gitignore) — `/data/`·`apps/friendly/data/*`

### 계약·공통
- [packages/api-contract/src/schemas/life-map.ts](../../packages/api-contract/src/schemas/life-map.ts)
- [packages/api-contract/src/routes.ts](../../packages/api-contract/src/routes.ts) — `Routes.LifeMap`
- [packages/shared/src/api/life-map.api.ts](../../packages/shared/src/api/life-map.api.ts)
- [packages/shared/src/hooks/useLifeMap.ts](../../packages/shared/src/hooks/useLifeMap.ts)
- [packages/utils/src/lifeMap.ts](../../packages/utils/src/lifeMap.ts) (+[test](../../packages/utils/src/lifeMap.test.ts) 9건)
- [packages/utils/src/lifeMapMarker.ts](../../packages/utils/src/lifeMapMarker.ts)
- [packages/utils/src/weatherRegions.ts](../../packages/utils/src/weatherRegions.ts) — 행정구역 245지점(옴니박스 로컬 섹션)

### 웹
- [apps/web/src/routes/LifeMapPage.tsx](../../apps/web/src/routes/LifeMapPage.tsx)
- [apps/web/src/routes/LifeMapPage.test.tsx](../../apps/web/src/routes/LifeMapPage.test.tsx) — 8건(데스크톱 5 + 모바일 시트 3, MapCanvas 목·MSW)
- [apps/web/src/components/life-map/LifeMapView.tsx](../../apps/web/src/components/life-map/LifeMapView.tsx)
- [apps/web/src/components/life-map/lifeMapMarkers.ts](../../apps/web/src/components/life-map/lifeMapMarkers.ts)
- [apps/web/src/components/life-map/LifeLayerBar.tsx](../../apps/web/src/components/life-map/LifeLayerBar.tsx)
- [apps/web/src/components/life-map/LifeGoToBox.tsx](../../apps/web/src/components/life-map/LifeGoToBox.tsx)
- [apps/web/src/components/life-map/LifeNearbyList.tsx](../../apps/web/src/components/life-map/LifeNearbyList.tsx)
- [apps/web/src/components/life-map/LifeDetailCard.tsx](../../apps/web/src/components/life-map/LifeDetailCard.tsx)
- [apps/web/src/components/life-map/LifeMapFooter.tsx](../../apps/web/src/components/life-map/LifeMapFooter.tsx)
- [apps/web/src/components/life-map/lifeMapFormat.ts](../../apps/web/src/components/life-map/lifeMapFormat.ts) — `openLabel` 재수출
- [apps/web/src/stores/lifeMapPrefsStore.ts](../../apps/web/src/stores/lifeMapPrefsStore.ts)
- [apps/web/src/stores/lifeMapRecentStore.ts](../../apps/web/src/stores/lifeMapRecentStore.ts)
- [apps/web/src/components/sheet/BottomSheet.tsx](../../apps/web/src/components/sheet/BottomSheet.tsx) — 소비처 관점(패턴은 [web](web.md))
- [apps/web/src/components/sheet/useMapSheets.ts](../../apps/web/src/components/sheet/useMapSheets.ts) — `SHEET_PEEK_HEIGHT 120`·`sheetHalfInset`
- [apps/web/src/lib/useMediaQuery.ts](../../apps/web/src/lib/useMediaQuery.ts) — `useIsDesktopXl`
- [apps/web/src/lib/useDebounced.ts](../../apps/web/src/lib/useDebounced.ts)
- [apps/web/src/App.tsx](../../apps/web/src/App.tsx) — `/life-map` lazy 라우트
- [apps/web/src/components/PublicTopBar.tsx](../../apps/web/src/components/PublicTopBar.tsx) — 메뉴 '일상지도'
- [apps/web/src/components/PublicSidebar.tsx](../../apps/web/src/components/PublicSidebar.tsx) — 메뉴 '일상지도'
- [apps/web/src/components/restaurant/MapCanvas.tsx](../../apps/web/src/components/restaurant/MapCanvas.tsx) — `fixedScale`·`markerStyleCache`·`bottomInset`

### 앱
- [apps/mobile/app/life-map/index.tsx](../../apps/mobile/app/life-map/index.tsx)
- [apps/mobile/src/components/lifeMap/LifeMapHeader.tsx](../../apps/mobile/src/components/lifeMap/LifeMapHeader.tsx)
- [apps/mobile/src/components/lifeMap/LifeGoToModal.tsx](../../apps/mobile/src/components/lifeMap/LifeGoToModal.tsx)
- [apps/mobile/src/components/lifeMap/LifeFilterRows.tsx](../../apps/mobile/src/components/lifeMap/LifeFilterRows.tsx)
- [apps/mobile/src/components/lifeMap/LifeNearbyRows.tsx](../../apps/mobile/src/components/lifeMap/LifeNearbyRows.tsx)
- [apps/mobile/src/components/lifeMap/LifeDetailPanel.tsx](../../apps/mobile/src/components/lifeMap/LifeDetailPanel.tsx)
- [apps/mobile/src/components/lifeMap/LifeFooter.tsx](../../apps/mobile/src/components/lifeMap/LifeFooter.tsx)
- [apps/mobile/src/components/lifeMap/lifeMapBridgeMarkers.ts](../../apps/mobile/src/components/lifeMap/lifeMapBridgeMarkers.ts)
- [apps/mobile/src/lib/lifeMapPrefsStore.ts](../../apps/mobile/src/lib/lifeMapPrefsStore.ts)
- [apps/mobile/src/lib/lifeMapRecentStore.ts](../../apps/mobile/src/lib/lifeMapRecentStore.ts)
- [apps/mobile/src/components/home/MyLocationCard.tsx](../../apps/mobile/src/components/home/MyLocationCard.tsx) — `LifeMapLink` 진입 행
- [apps/mobile/src/components/transit/transitMapBridge.ts](../../apps/mobile/src/components/transit/transitMapBridge.ts) — `BridgeMarker.fixedScale`·`setMarkers.icons`
- [apps/mobile/src/components/transit/transitMapHtml.ts](../../apps/mobile/src/components/transit/transitMapHtml.ts) — 아이콘 사전 치환
- [apps/mobile/src/components/transit/useTransitMapSync.ts](../../apps/mobile/src/components/transit/useTransitMapSync.ts) — `markerIcons`·`viewBottomInset`
