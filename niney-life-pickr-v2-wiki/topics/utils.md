---
topic: utils
last_compiled: 2026-08-17
sources_count: 22
status: active
aliases: ["@repo/utils", pure-functions, helpers, slugify, pick-random, thumbnail-url, geo, bbox, compute-bbox-around, is-in-korea, lat-lng, restaurantCategory, formatWonPrice, 원화, 콤마, 카테고리매핑, resolveRestaurantCategoryKey, buildRestaurantMarkerSvg, aiModel, parseModelFamily, groupModelsByFamily, recommendModelForPurpose, isVisionModel, model-family, 모델계열, markerFrame, buildPinMarkerSvg, buildCircleMarkerSvg, marker-frame, 마커프레임, busMarker, buildBusStopMarkerSvg, buildBusVehiclePillSvg, buildBusVehicleDirSvg, buildMyLocationMarkerSvg, buildBusRouteStopDotSvg, busRouteTypeColor, 버스마커, 노선유형색, routePath, createRoutePathIndex, projectOnRoutePath, pointAtRoutePathS, bearingAtRoutePathS, sliceRoutePath, 노선형상, 폴리라인투영, route-path-projection, subwayLine, SUBWAY_LINES, SubwayLine, subwayMarker, buildSubwayStationMarkerSvg, buildSubwayStopDotSvg, buildSubwayTrainPillDataUrl, buildSubwayTrainDirDataUrl, subwayPosition, locateTrain, TRAIN_STATUS_FRACTION, sliceForMove, subwayDestinationLabel, normalizeStationName, TrainSection, vehiclePill, buildVehiclePillSvg, buildVehiclePillDataUrl, buildVehicleDirSvg, 지하철마커, 열차보간, 열차알약, vitest-config]
---

# utils — 순수 유틸 패키지

**2026-08-16~17 변경 흡수 — `formatBbox` 통합(6곳 중복 제거) + geo/format 테스트 확충 + 죽은 `./date` 서브패스 제거**: (1) **[`geo.ts`](../../packages/utils/src/geo.ts) 에 `formatBbox(b: Bbox): string`** — bbox → 쿼리 문자열(`minLng,minLat,maxLng,maxLat`, `toFixed(5)`). 웹 4곳(DiscoverMap·PublicRestaurantsMap·SmartPickSection·RestaurantsV2Page)·앱 2곳(PublicRestaurantsWebMap native/web)의 동일 복제를 단일 정의로(커밋 `f293a3c`). 순서·5자리 패딩은 서버 bbox 파라미터 계약이라 [`geo.test.ts`](../../packages/utils/src/geo.test.ts) 로 고정. (2) **`./date` 서브패스 제거(`bb07762`)** — 2026-07-13 `date.ts` 삭제(참조 0) 때 exports 맵에 남아 있던 죽은 항목. 서브패스는 이제 `./format`/`./random` 2종. (3) **[`subwayCongestion.ts`](../../packages/utils/src/subwayCongestion.ts) 신설(`9206346`)** — 웹·앱 congestionUtils 가 문자 단위로 복제하던 혼잡도 임계/슬롯/방향 매칭을 단일 정의로(색 표는 플랫폼 facade 에 잔류). utils 는 의존 0 leaf 라 api-contract 타입 대신 구조적 `CongestionDirectionLike` + 제네릭. (4) 테스트 72케이스(6파일 — +subwayCongestion 7).

**2026-07-13~25 변경 흡수 — 대대적 통합 리팩터: geo 거리 함수 흡수 + FE 대중교통 포맷터·파서 집결 + `busArrival`/`subwayTimetable` 신설 + dead code 삭제 + 썸네일 프록시 가드**: 웹→앱 포팅 과정에서 복제된 순수 함수들이 utils 단일 정의로 모였다. (1) **[`geo.ts`](../../packages/utils/src/geo.ts) 확장(`edafb6a`)** — `approxDistanceM`(등거리 사각 근사 — 웹2·앱2·friendly2 로컬 정의 제거), `haversineM`(측지 — matching.ts·diningcode 어댑터 통일, asin 클램프), `roundCoord`(소수 5자리 — 4곳 제거), `parseLatLngParam`(한국 WGS84 범위 가드 lat 33~39/lng 124~132 — BusPage/SubwayPage parseNear 2곳). (2) **[`format.ts`](../../packages/utils/src/format.ts) 재편(`c6ac5ba`·`ddb2a8e`)** — `truncate`/`capitalize`/`slugify` 삭제(참조 0, `91eff7d`)되고 대중교통 포맷터가 들어옴: `formatDistanceM`(6곳 복제 제거), `formatRelativeMin`/`formatRelativeSec`(nowMs 기본 인자로 웹·앱 시그니처 차 흡수), `remainSecSince`/`formatCountdown`(하차 알림 카운트다운 — 세 번째 복사본 방지, `ddb2a8e`), `formatWonPrice` 유지. (3) **[`busArrival.ts`](../../packages/utils/src/busArrival.ts) 신설** — `isBusArrivalImminent`("곧 도착" 판정 4곳 흩어짐 통일, null/undefined → false) + `parseBusArrivalSec`('N분후[…]' 분 해상도 파싱 — 하차 알림 실측 예약 근거). (4) **[`subwayTimetable.ts`](../../packages/utils/src/subwayTimetable.ts) 승격(`2507cdc`)** — 웹·앱 `components/subway/timetableUtils.ts` 파일 전체 복사본을 단일 정의로(소비처 8곳 교체): `dayTypeForToday`/`parseTimeMin`(자정 넘김 24+ 단조성)/`formatHHMM`/`lastTrainRemainMin`(24+ 축 보정)/`arrivalUpdnToTimetable`/`isSubwayExpressTag`(EXPRESS_YN 'D'=급행)/`updnLabel`. (5) **[`date.ts`] 전체 삭제(`91eff7d`)** — toISOString/fromISOString/isValidDate 리포 참조 0건. (6) **[`thumbnail.ts`](../../packages/utils/src/thumbnail.ts) 프록시 가드(`4c829ad`)** — `reviewThumbnailUrl` 이 `*.pstatic.net` 절대 URL 만 프록시로 감싸고 상대경로(파노라마 로컬 사본 `/api/v1/media/panorama/…`)·비네이버 호스트는 원본 통과 — 8차 하드닝이 모든 썸네일을 프록시로 감싸며 zod url() 400 으로 리스트 대표이미지가 깨진 회귀의 복구.

**2026-07-07 변경 흡수 — 지하철 도메인 순수 유틸 3종 신규(`subwayLine`/`subwayMarker`/`subwayPosition`) + 차량 알약/방향 기하 코어를 버스·지하철 공용으로 추출(`vehiclePill`) + vitest 설정 신설**: 대중교통이 버스에서 전철로 넓어지며 utils 에 지하철 도메인 파일이 붙고, 버스·지하철이 공유하던 마커 코어가 한 겹 더 추출됐다. (1) **[`vehiclePill.ts`](../../packages/utils/src/vehiclePill.ts) 신설 (공용 차량 알약/방향)** — 실시간 위치 '알약'(stadium 말풍선 + 라벨) + 진행 방향 '다트' SVG 의 도메인 중립 기하 코어. 버스 노선번호 알약과 지하철 열차 알약이 같은 규격(꼬리 끝이 세로 중앙 = 정차 좌표가 되는 **앵커 트릭** — SVG 아래 절반을 투명 여백으로 채워 MapCanvas 의 `[0.5,0.5]` 비선택 앵커·중앙 기준 축소에 정합)이라, 복제 드리프트를 막으려 한 곳으로 뺐다. `busMarker.ts` 의 기존 export(`buildBusVehiclePillSvg`/`...DataUrl`/`buildBusVehicleDirSvg`/`...DataUrl`)는 이제 이 함수들에 **재export 위임(바이트 동일 산출)** — busMarker 는 124→약 15줄로 축소. (2) **[`subwayLine.ts`](../../packages/utils/src/subwayLine.ts) 신설** — 수도권 전철 노선 상수(`SUBWAY_LINES`). 서울시 실시간 API 의 `subwayId`(4자리, 예 `'1002'`)를 `lineId` 로 채택(프로브 실측 2026-07-06 — 도착/위치 응답 체계와 동일), `{ lineId, name, shortLabel, color, positionParam }` — 공식 노선색 + realtimePosition path 파라미터(검증 여부 주석). (3) **[`subwayMarker.ts`](../../packages/utils/src/subwayMarker.ts) 신설** — 전철 도메인 마커: 역 마커(markerFrame 핀/원 프레임 재사용 + 지하철 아이콘)·경유역 점(`buildSubwayStopDotSvg` — 환승역 이중 링)·실시간 열차 알약/방향(`vehiclePill` 위임). (4) **[`subwayPosition.ts`](../../packages/utils/src/subwayPosition.ts) 신설(+테스트)** — 열차 역간 보간의 기하 코어. `locateTrain`(역 기준 상태를 역간 구간의 분수 위치로, `TRAIN_STATUS_FRACTION` 진입/도착/출발 등 상태→구간 비율) + `sliceForMove`(따라가기 이동 구간) + `subwayDestinationLabel`/`normalizeStationName`(행선지 표기 정규화). 버스가 도로 폴리라인을 추종한 것(`routePath`)과 달리 전철은 GPS 가 없어 역 순서(sections) 기반 보간이라 별도 모듈. (5) **[`vitest.config.ts`](../../packages/utils/vitest.config.ts) 신설** — utils 순수 함수 단위 테스트(`subwayPosition.test.ts`). 소스가 ESM `.js` import 라 `extensionAlias { '.js': ['.ts','.js'] }` 로 `.ts` 우선 해석(friendly 설정과 동일). 셋 다 순수 문자열/수치 처리라 utils leaf 에 적합. 지하철 도메인 전체는 [subway](subway.md), 웹 소비는 [web](web.md)/[map](map.md).

**2026-07-06 변경 흡수 — 버스 마커 3종 신규 + 식당·버스 공용 마커 프레임 추출(`markerFrame.ts`) + 노선 형상 투영/보간(`routePath.ts`)**: 지도([map](map.md)) 마커 코드가 커지며 세 파일로 정리됐다. (1) **[`markerFrame.ts`](../../packages/utils/src/markerFrame.ts) 신설 (공용 프레임)** — 식당(`restaurantCategory`)·버스(`busMarker`) 마커가 문자 단위로 동일했던 SVG 골격(선택 = 32×48 핀 / 비선택 = 26×26 원)을 `buildPinMarkerSvg`/`buildCircleMarkerSvg` 두 함수로 통합. `{ fill, innerSvg }` 를 받아 흰 외곽선(stroke 2) + 24×24 viewBox 아이콘을 16×16 영역으로 0.667 scale 배치. `restaurantCategory.ts` 는 인라인으로 갖고 있던 두 프레임을 이 모듈 import 로 대체 — **동작 변화 없음(76개 마커 조합 바이트 동일 검증, 커밋 `a9c1fe4`)**. MapCanvas 의 anchor·라벨 offset·SMALL_ICON_SCALE 이 이 규격에 묶여 있어 수치는 MapCanvas 와 함께 봐야 한다. (2) **[`busMarker.ts`](../../packages/utils/src/busMarker.ts) 신설** — 버스 도메인 마커 일습: 정류장(파랑 핀/원, 버스 실루엣 아이콘)·실시간 차량 알약(노선번호 stadium 말풍선 + 정차 후광 + 따라가기 강조 링)·진행 방향 다트·내 위치(파란 점)·경유 정류소 점(16×16) + 노선유형 코드→대표색(`busRouteTypeColor`). 정류장/내위치/경유점은 markerFrame 과 같은 26×26·16×16 규격을 공유하고, 차량 알약만 꼬리 끝이 좌표를 가리키는 자체 규격. (3) **[`routePath.ts`](../../packages/utils/src/routePath.ts) 신설** — '노선 형상 따라가기'(차량이 도로 형상을 추종해 이동)의 기하 코어. 폴리라인 위 호길이(arc-length) 투영/보간 순수 함수. 상행+하행이 한 줄인 왕복 형상의 상/하행 모호성을 호길이 윈도우 입력으로 호출자가 푼다. 셋 다 순수 문자열/수치 처리라 utils leaf 에 적합. 버스 도메인 전체는 [bus](bus.md), FE 플러밍은 [shared](shared.md).

**2026-06-25 변경 흡수 — `aiModel.ts` 신규 (모델 id → 계열 묶음 + 용도별 추천)**: AI 모델 선택 UX 를 돕는 순수 휴리스틱이 [`aiModel.ts`](../../packages/utils/src/aiModel.ts) 한 파일로 추가. `parseModelFamily`(Ollama 모델 id `<brand><version>[-variant][:tag]` 에서 첫 콜론/숫자 앞 brand 추출 + 끝 버전 접두 정리) → `groupModelsByFamily`(평면 모델 리스트를 계열별 그룹으로 — 모델 선택 팝업에서 긴 리스트를 사람이 훑기 좋게) + `isVisionModel`(이름 휴리스틱으로 vision 계열 판별) + `recommendModelForPurpose('chat' | 'image' | 'log-analysis', models)`(용도별 기본 모델 프리필 — image=가장 작은 vision, log-analysis=가장 큰 텍스트, chat=중간 규모). 완벽 분류가 아니라 [ai](ai.md) 의 용도별 모델 선택([AdminAiKeysPage](../../apps/web/src/routes/admin/AdminAiKeysPage.tsx))·[logs](logs.md) LLM 실패 분석 모델 추천의 시작점 헬퍼. 순수 문자열 처리라 utils leaf 에 적합.

**2026-05-25 변경 흡수 — `restaurantCategory.ts` 신규 (카테고리 매핑) + `format.ts` 에 원화 콤마 포맷 통일**: 식당 카테고리 → 아이콘 키 정규화 + 마커 SVG 빌더가 [`restaurantCategory.ts`](../../packages/utils/src/restaurantCategory.ts) 한 파일로 들어옴 — 8종 라인 아이콘(korean/japanese/chinese/cafe/dessert/bar/western/snack) + primary/muted 2-variant × selected 2-state 마커. 같은 룰을 [map](map.md) 토픽의 웹/앱 마커 양쪽에서 공유. [`format.ts`](../../packages/utils/src/format.ts) 에 `formatWonPrice(price: string | null): string | null` 추가 — 자유 입력 메뉴 가격을 `12,000원` / `12,000원 ~ 18,000원` 콤마 포맷으로 통일 (커밋 `078cbe1`). 단일 숫자/범위(`~`/`-`/`–`/`—`)/혼합 문자열 모두 처리, 0 이하/숫자 외 입력은 원문 보존.

**2026-05-19 변경 흡수 — geo 모듈 신규**: [geo.ts](../../packages/utils/src/geo.ts) 가 위경도 다루는 순수 유틸 한 파일로 추가. (1) `computeBboxAround(center: LatLng, radiusKm: number): Bbox` — 사용자 위치 주변 정사각형 bbox. 1° latitude ≈ 111.32 km 평균 + cos(lat) longitude 보정. 짧은 거리(≤수 km) 정사각 근사로 Haversine 등 측지 거리 불필요. (2) `isInKorea(coords): boolean` — vworld 타일 가드 (본토·제주·울릉 포함 124.5~131.9 lng, 33.0~38.7 lat). 시뮬레이터/실 사용자가 한국 밖이면 vworld 타일이 전부 404 떨어지므로 폴백 트리거. `LatLng`/`Bbox` 인터페이스 export — 웹(`useUserLocation`) 과 앱(`useUserLocationNative`) 양쪽이 같은 모양으로 소비.

## Purpose [coverage: high — 2 sources]

`@repo/utils` — 순수 함수 모음. FE/BE 모두에서 import 가능한 사이드 이펙트 없는 헬퍼만 모아 둔다. 외부 npm 의존이 0개고 어떤 런타임(Node, 브라우저, RN)에서도 실행된다. CLAUDE.md의 의존 그래프상 leaf 노드 — `shared`, `api-contract`, 모든 앱이 여기로 들어올 수 있지만 utils는 어디로도 의존하지 않는다. 도메인 함수(`pickRandom`/`shuffle`은 Pick 추첨, `restaurantCategory`/`busMarker`/`subwayMarker`는 지도 마커 SVG, `vehiclePill`은 버스·지하철 공용 차량 알약, `routePath`는 버스 노선 형상 위 위치, `subwayPosition`은 전철 역간 보간)와 표현 헬퍼(`reviewThumbnailUrl`은 friendly 미디어 프록시 URL, `formatWonPrice`는 메뉴 가격 통일)가 공존한다. 지도 마커는 `markerFrame.ts` 가 식당·버스·지하철 공용 SVG 골격을 대고, 각 도메인 모듈이 안쪽 아이콘/색만 채운다.

## Architecture [coverage: high — 11 sources]

`src/{domain}.ts` 단일 도메인 단위 + `src/index.ts` 배럴:

```
packages/utils/
├── src/
│   ├── index.ts             // export * (16개 모듈 re-export)
│   ├── aiModel.ts           // 모델 id → 계열 묶음 + 용도별 추천 휴리스틱
│   ├── busArrival.ts        // (신설) isBusArrivalImminent + parseBusArrivalSec
│   ├── busMarker.ts         // 버스 정류장/내위치/경유점 마커 + 노선유형 색 (차량 알약/방향은 vehiclePill 위임)
│   ├── format.ts            // formatWonPrice + 대중교통 포맷터(formatDistanceM/formatRelative*/remainSecSince/formatCountdown) (+test)
│   ├── geo.ts               // LatLng, Bbox, computeBboxAround, formatBbox, isInKorea, approxDistanceM, haversineM, roundCoord, parseLatLngParam (+test)
│   ├── markerFrame.ts       // 식당·버스·지하철 공용 마커 프레임 (핀 32×48 / 원 26×26)
│   ├── random.ts            // pickRandom, shuffle
│   ├── restaurantCategory.ts // 카테고리 키 정규화 + 마커 SVG (프레임은 markerFrame 위임)
│   ├── routePath.ts         // 노선 형상 투영/보간 (버스 따라가기 이동 코어)
│   ├── subwayLine.ts        // (신설) 수도권 전철 노선 상수 SUBWAY_LINES (subwayId=lineId)
│   ├── subwayMarker.ts      // (신설) 전철 역/경유역 점(환승 이중링)/열차 알약·방향 마커
│   ├── subwayPosition.ts    // (+test) 열차 역간 보간 (locateTrain/TRAIN_STATUS_FRACTION/sliceForMove)
│   ├── subwayTimetable.ts   // (승격, +test) 시간표 파생 — 웹·앱 timetableUtils 복사본의 단일 정의
│   ├── vehiclePill.ts       // 버스·지하철 공용 차량 알약/방향 다트 기하 코어
│   ├── thumbnail.ts         // reviewThumbnailUrl (*.pstatic.net 만 프록시, 그 외 원본 통과) (+test)
│   └── vworld.ts            // vworld 타일 헬퍼
├── package.json             // build 없음 — src 그대로 export
├── vitest.config.ts         // (신설) 순수 함수 단위 테스트 (.js→.ts extensionAlias)
└── tsconfig.json
```

api-contract와 같은 빌드 없는 패턴: `package.json`이 `./src/*.ts`를 직접 main/types/exports로 노출. 서브패스 import 지원: `@repo/utils/format`, `@repo/utils/random` 2종만 `exports` 맵에 등록(`./date` 는 date.ts 삭제와 함께 제거 — bb07762). 나머지(`aiModel` / `busMarker` / `geo` / `markerFrame` / `restaurantCategory` / `routePath` / `subwayLine` / `subwayMarker` / `subwayPosition` / `vehiclePill` / `thumbnail` / `vworld`)는 서브패스 미등록이라 배럴 경유로만 접근 — `import { ... } from '@repo/utils'`.

**마커 모듈 구조** — `markerFrame.ts`(공용 핀/원 골격) ← `restaurantCategory.ts`·`busMarker.ts`·`subwayMarker.ts`(도메인 아이콘/색). 프레임을 한 곳에 두어 세 도메인 마커가 같은 anchor·라벨 offset·축소 스케일 규격을 강제로 공유한다. 별도로 `vehiclePill.ts`(차량 알약/방향)는 markerFrame 을 안 쓰는 자체 SVG 골격이지만 `busMarker`·`subwayMarker` 두 도메인 차량이 공유하는 코어라 한 겹 더 추출. `routePath.ts`(버스 형상 투영)·`subwayPosition.ts`(전철 역간 보간)는 마커가 아니라 이동 위치 계산이라 `geo.ts` 의 `LatLng` 만 참조(마커 모듈과 독립) — 버스는 도로 폴리라인 추종, 전철은 GPS 없이 역 순서 기반이라 코어가 갈린다.

## Talks To [coverage: medium — 2 sources]

- 컨슈머: `apps/friendly`, `apps/web`, `apps/mobile`, `packages/shared` — 어디서나 import 가능
- 의존: 없음 (외부 npm 0개, 워크스페이스 0개) — 진짜 leaf 노드
- `reviewThumbnailUrl`은 friendly의 `/api/v1/media/thumbnail` 프록시 라우트 (friendly 의 [media 모듈](friendly.md))를 가리키므로 클라이언트에서 friendly 도메인과 같은 origin이거나 base URL이 적용된 fetcher와 함께 쓰여야 한다
- `restaurantCategory`·`busMarker` 의 마커 SVG 는 [map 토픽](map.md) 의 OpenLayers (웹) MapCanvas 에서 data URL 형태로 `Icon.src` 에 직접 들어간다. 식당은 카테고리별 라인 아이콘 8종, 버스는 정류장/실시간 차량/내 위치/경유 정류소 마커. 두 도메인이 `markerFrame.ts` 의 같은 핀/원 규격을 공유(교차 도메인 시각 일관성).
- `routePath.ts` 는 버스 노선 형상(서울시 getRoutePath 폴리라인) 위 차량 위치를 보간하는 [bus](bus.md) '따라가기' 기능의 코어. 웹 MapCanvas 가 실시간 차량 좌표를 형상에 투영해 도로를 추종시킬 때 호출.
- `busMarker`/`routePath` 의 실제 소비는 웹([web](web.md))·지도([map](map.md)), 데이터 조회 훅은 [shared](shared.md) 의 `useBus*`.

## API Surface [coverage: high — 11 sources]

[`format.ts`](../../packages/utils/src/format.ts) — *truncate/capitalize/slugify 는 참조 0건으로 삭제(91eff7d)*:
- `formatWonPrice(price: string | null | undefined): string | null` — (078cbe1). 빈/falsy → `null`. 단일 숫자(`12000` / `12,000원` / `₩12000`) → `12,000원`. 범위(`12000~18000`, `12,000 - 18,000원`, `–`/`—` 구분자 포함) → `12,000원 ~ 18,000원`. 혼합 텍스트는 안에 등장한 `숫자+원` 패턴만 콤마로 재포맷. 0 이하 / 숫자 외 입력은 원문 그대로 보존
- `formatDistanceM(m: number): string` — 정수 m 가정(서버 dist 계약), 대중교통·스마트픽 거리 표기 (c6ac5ba — 6곳 복제 제거)
- `formatRelativeMin(iso, nowMs?)` / `formatRelativeSec(iso, nowMs?)` — 상대 시각 표기. nowMs 기본 인자로 웹(Date.now 내장)·앱(주입) 시그니처 차를 흡수
- `remainSecSince(receivedAt, remainSec, nowMs?)` / `formatCountdown(sec)` — 도착 카운트다운(수신 시점 보정). 하차 알림·SubwayArrivalPanel 공용 (ddb2a8e)

[`geo.ts`](../../packages/utils/src/geo.ts) (+[`geo.test.ts`](../../packages/utils/src/geo.test.ts)):
- `interface LatLng { lat: number; lng: number }`
- `interface Bbox { minLng: number; minLat: number; maxLng: number; maxLat: number }`
- `computeBboxAround(center: LatLng, radiusKm: number): Bbox` — 정사각 근사
- `formatBbox(b: Bbox): string` — bbox → `minLng,minLat,maxLng,maxLat` 쿼리 문자열(toFixed 5). 웹·앱 지도/스마트픽 공용 (f293a3c)
- `isInKorea(coords: LatLng): boolean` — vworld 타일 가드
- `approxDistanceM(a, b)` — 등거리 사각 근사(도시 스케일 판정용, 하버사인과 1% 내) / `haversineM(a, b)` — 측지 거리(asin 클램프)
- `roundCoord(n)` — 소수 5자리 반올림 / `parseLatLngParam(raw)` — `lat,lng` 파싱 + 한국 WGS84 범위 가드(lat 33~39, lng 124~132)

[`busArrival.ts`](../../packages/utils/src/busArrival.ts) — 신설:
- `isBusArrivalImminent(msg)` — "곧 도착" 판정(4곳 흩어짐 통일, null/undefined → false)
- `parseBusArrivalSec(msg)` — `'N분후[…]'` 를 분 해상도 초로 파싱 — 하차 알림의 실측 예약 근거

[`subwayTimetable.ts`](../../packages/utils/src/subwayTimetable.ts) — 웹·앱 timetableUtils 복사본의 승격(2507cdc, +test 15):
- `dayTypeForToday()` / `parseTimeMin(hhmmss)`(자정 넘김 24+ 단조성) / `formatHHMM` / `lastTrainRemainMin`(24+ 축 보정) / `arrivalUpdnToTimetable`(updn 매핑) / `isSubwayExpressTag`(EXPRESS_YN 'D'=급행) / `updnLabel`

[`random.ts`](../../packages/utils/src/random.ts):
- `pickRandom<T>(items: readonly T[]): T` — 빈 배열 시 throw
- `shuffle<T>(items: readonly T[]): T[]` — Fisher-Yates, 입력 비변경

[`markerFrame.ts`](../../packages/utils/src/markerFrame.ts) — 신설 (식당·버스 공용 프레임):
- `interface MarkerFrameOptions { fill: string; innerSvg: string }` — `innerSvg` 는 24×24 viewBox 기준 흰 라인 아이콘 조각(프레임이 16×16 영역으로 0.667 scale 배치)
- `buildPinMarkerSvg({ fill, innerSvg }): string` — 선택 핀 32×48, 마커 좌표 = 핀 꼭지점(anchor `[0.5, 1]`). 흰 외곽선 stroke 2 고정
- `buildCircleMarkerSvg({ fill, innerSvg }): string` — 비선택 원 26×26, 마커 좌표 = 중심(anchor `[0.5, 0.5]`)
- 수치(32×48/26×26/scale 0.667/offset)는 [map](map.md) 의 MapCanvas anchor·라벨 offset·`SMALL_ICON_SCALE` 과 짝 — 바꾸면 MapCanvas 와 함께 봐야 함

[`restaurantCategory.ts`](../../packages/utils/src/restaurantCategory.ts) — **프레임을 `markerFrame.ts` 로 위임(2026-07: 인라인 SVG → import, 바이트 동일)**:
- `RESTAURANT_CATEGORY_KEYS` — `readonly ['korean', 'japanese', 'chinese', 'cafe', 'dessert', 'bar', 'western', 'snack']`
- `type RestaurantCategoryKey` — 위 배열의 union
- `type RestaurantMarkerVariant = 'primary' | 'muted'` — 빨강(기본/검색결과) vs 회색(이미 등록됨)
- `resolveRestaurantCategoryKey(category: string | null | undefined): RestaurantCategoryKey | null` — 백엔드 자유 문자열(`"한식 > 백반"`, `"이자카야"`, `"디저트카페"`)을 정규식 우선순위 테이블로 매칭. `bar > dessert > cafe > japanese > chinese > western > snack > korean` 순 (이자카야가 일식이 아닌 술집으로, 디저트카페가 카페가 아닌 디저트로 잡히도록)
- `buildRestaurantMarkerSvg(key: RestaurantCategoryKey | null, selected: boolean, variant?: RestaurantMarkerVariant): string` — selected 면 `buildPinMarkerSvg`, 비선택이면 `buildCircleMarkerSvg` 에 카테고리 아이콘(24px viewBox 라인 아이콘 8종 + GENERIC fallback)·variant 색을 실어 위임
- `buildRestaurantMarkerDataUrl(key, selected, variant?): string` — 위 SVG 를 `data:image/svg+xml;charset=utf-8,` URL 로 — OpenLayers `Icon.src` 에 직접 주입 가능

[`busMarker.ts`](../../packages/utils/src/busMarker.ts) — 신설 (버스 도메인 마커):
- `buildBusStopMarkerSvg(selected: boolean): string` / `buildBusStopMarkerDataUrl(selected)` — 정류장 마커. selected = 파랑 핀(`#1d4ed8`), 비선택 = 파랑 원(`#2563eb`). 버스 실루엣 아이콘을 markerFrame 프레임에 얹음(식당과 같은 규격 → 라벨 offset 재사용). 파랑 톤이라 식당(빨강)·등록됨(회색)과 즉시 구분
- `interface BusVehiclePillOptions { label: string; color: string; stopped?: boolean; highlighted?: boolean }`
- `buildBusVehiclePillSvg(options): string` / `buildBusVehiclePillDataUrl(options)` — 실시간 차량 알약(stadium 말풍선 + 노선번호). 꼬리 끝이 정차 좌표를 가리키게 아래 절반을 투명 여백으로 채워 세로 중앙 anchor 와 정합. `stopped` = 정차 후광 1겹, `highlighted` = 따라가는 버스 강조(흰 링 + 옅은 확산, 정차 후광과 독립 레이어). 정류장과 형태가 완전히 달라 노선색이 겹쳐도 안 헷갈림. 라벨 비우면 색 알약만
- `buildBusVehicleDirSvg(color: string): string` / `buildBusVehicleDirDataUrl(color)` — 차량 진행 방향 다트(16×16, 북 기준·지도 레이어가 방위각만큼 회전). 노선색 채움 + 흰 외곽선, 알약보다 아래 zIndex
- `buildMyLocationMarkerSvg(): string` / `buildMyLocationMarkerDataUrl()` — 내 위치 파란 점(26×26, 후광 → 흰 링 → 파란 점). 선택 개념 없어 1종, 정류장 규격 공유
- `buildBusRouteStopDotSvg(color: string): string` / `buildBusRouteStopDotDataUrl(color)` — 노선 형상 위 경유 정류소 점(16×16, 노선색 + 흰 링). 정류장 핀보다 의도적으로 작아 105개가 깔려도 과밀 안 함
- `busRouteTypeColor(routeType: string): string` — 서울시 routeType 코드→대표색. `1` 공항 하늘 / `2` 마을 연두 / `3` 간선 파랑(`#2563eb`, 정류장 톤과 일치) / `4` 지선 초록 / `5` 순환 노랑 / `6` 광역 빨강 / 그 외 회색. 폴리라인·경유지 점이 같은 색을 씀

[`routePath.ts`](../../packages/utils/src/routePath.ts) — 신설 (노선 형상 투영/보간, `geo.ts` `LatLng` 참조):
- `interface RoutePathIndex { points: LatLng[]; xs/ys/cum: Float64Array; totalM: number }` — 평면 근사 좌표(기준점 등거리 사각 근사, m) + 누적 호길이(arc-length) 캐시
- `createRoutePathIndex(points: LatLng[]): RoutePathIndex | null` — 점 2개 미만이면 null(호출자가 직선 폴백). 기준점 = `points[0]`, cos 위도 보정 고정
- `projectOnRoutePath(index, p: LatLng, sMinM = 0, sMaxM = Infinity): { s: number; distM: number }` — 점 `p` 를 형상 위로 투영. `[sMinM, sMaxM]` 호길이 윈도우와 겹치는 세그먼트만 후보 — 왕복 한 줄 형상의 상/하행 모호성을 호출자(sectOrd·정류소 seq)가 윈도우로 좁혀 해소. `distM` 임계 초과면 '형상 밖'
- `pointAtRoutePathS(index, sM: number): LatLng` — 호길이 `s` 지점 위경도(세그먼트 내 선형 보간, cum 이진탐색)
- `bearingAtRoutePathS(index, sM: number): number | null` — `s` 지점 전진 방위각(도, 북=0 시계방향). 정차 중이어도 '앞으로 갈 방향'. 세그먼트 전부 0길이면 null → 차량 방향 다트 회전각
- `sliceRoutePath(index, s0M, s1M): LatLng[]` — `[s0, s1]` 구간 웨이포인트(보간 양끝 + 사이 원본 점). `s0 > s1`(후진/왕복 랩)은 호출자가 걸러 직선 폴백

[`thumbnail.ts`](../../packages/utils/src/thumbnail.ts):
- `reviewThumbnailUrl(originalUrl: string, width = 300, quality?: number): string` — friendly의 `/api/v1/media/thumbnail?url=…&w=…&q=…` 프록시 URL을 빌드. FE가 직접 query string을 조립하지 않게 중앙화

## Data [coverage: low — 0 sources]

상태/저장소 없음 — 순수 함수만.

## Key Decisions [coverage: high — 5 sources]

- **순수 함수만** — 상태/IO 있는 헬퍼는 여기 들어오지 않는다 ([shared](shared.md) 또는 앱 내부로). 도메인 로직(`reviewThumbnailUrl`처럼 friendly URL을 알고 있는 함수, `buildRestaurantMarkerSvg`/`buildBusVehiclePillSvg`처럼 SVG 문자열을 빌드하는 함수, `projectOnRoutePath`처럼 기하 계산만 하는 함수)은 "문자열/수치만 만든다"는 순수성 한도 내에서만 허용
- **외부 의존 0** — 가벼운 leaf 패키지로 유지해 트리 셰이킹/배포 부담 최소화. `restaurantCategory`·`busMarker` 도 SVG 빌더를 순수 문자열 concat 으로 작성 — DOM API / React Native View 의존 없이 어디서나 import 가능. `routePath` 도 `Float64Array` + 기본 산술만(측지 라이브러리 없음)
- **카테고리 매핑을 utils 에** — 웹(`apps/web`)·앱(`apps/mobile`) 양쪽 지도 마커가 같은 정규화 룰 + 동일 아이콘 세트를 써야 디자인 일관성 유지. 한쪽 앱에 두면 다른 쪽이 dup 매핑을 만들기 쉬워 utils 의 leaf 위치가 적합. 백엔드 category 필드가 자유 문자열이라 정규식 contains 매칭 — enum 화는 백엔드 데이터 정리 후로 미룸
- **마커 프레임을 `markerFrame.ts` 로 추출 — 식당·버스 골격 단일화** — 두 도메인 마커의 핀(32×48)/원(26×26) SVG 골격이 문자 단위로 같았어서, 프레임을 `buildPinMarkerSvg`/`buildCircleMarkerSvg` 로 뽑고 각 도메인은 안쪽 아이콘/색만 채운다. 새 마커 종류가 늘어도 anchor·라벨 offset·`SMALL_ICON_SCALE` 규격이 프레임 한 곳에서 강제 공유돼 [map](map.md) MapCanvas 와 어긋날 여지가 준다. 추출 시 **76개 마커 조합 바이트 동일 검증**으로 회귀 0 확인(커밋 `a9c1fe4`) — 리팩터링이라 산출 SVG 는 안 바뀜
- **노선 형상 계산은 평면 근사 + 호길이(arc-length) 모델** — `routePath.ts` 가 위경도를 기준점 등거리 사각 근사로 평면(m) 변환해 투영/보간. 노선 규모(수십 km)에서 Haversine 급 정밀도가 불필요하고, 좌표만으로 상/하행이 모호한 왕복 한 줄 형상은 **호길이 윈도우를 호출자가 넘겨** 해소하는 계약(라이브러리는 sectOrd/정류소 seq 를 모르므로 순수 기하만 제공, 도메인 판단은 호출자). `bearingAtRoutePathS` 가 정차 중에도 전진 방향을 돌려줘 차량 방향 다트가 항상 '갈 방향'을 가리킴
- **빌드 없음** — `src/*.ts`를 직접 export. tsx (friendly), Vite (web), Metro (mobile) 모두 그대로 처리
- **서브패스 export** — 트리셰이킹 안 되는 컨슈머도 `@repo/utils/random`만 가져갈 수 있음 (단 `thumbnail`/`geo`/`restaurantCategory` 는 아직 서브패스 미등록)
- **원화 포맷 통일** — 메뉴 가격은 백엔드/크롤러가 `12000`, `12,000원`, `12000~18000` 등 자유 입력 — `formatWonPrice` 한 함수로 통일해 웹/앱이 같은 표기 (콤마 + `원` + 범위는 `~` 구분자). 파싱 실패는 원문 보존 — 절대 빈 문자열로 변질되지 않음

## Gotchas [coverage: high — 5 sources]

- 새 헬퍼 모듈 추가 시 [`index.ts`](../../packages/utils/src/index.ts) 배럴에 `export *`를 빠뜨리기 쉬움 — `busMarker` / `markerFrame` / `routePath` 도 추가 때 같이 갱신해야 컨슈머가 찾을 수 있다 (현재 11개 모듈 전부 등록됨)
- 새 모듈을 서브패스로 노출하려면 [`package.json`](../../packages/utils/package.json) `exports` 맵도 추가해야 함 — 현재 등록은 `format` / `random` 2종뿐, 나머지는 배럴 경유만 가능. **파일을 지울 땐 exports 맵도 같이** — date.ts 삭제 때 `./date` 항목이 남아 죽은 서브패스로 한 달 방치됐다(bb07762 에서 제거)
- **`markerFrame.ts` 의 수치를 바꾸면 마커가 좌표에서 어긋난다** — 핀 32×48/원 26×26/scale 0.667/offset 은 [map](map.md) MapCanvas 의 anchor·라벨 offset·`SMALL_ICON_SCALE` 과 짝. 프레임만 고쳐도 식당·버스 마커가 동시에 밀리므로 반드시 MapCanvas 와 함께 조정. `innerSvg` 아이콘은 24×24 viewBox 를 전제(다른 크기 조각을 넣으면 16×16 영역을 벗어남)
- **`busMarker` 아이콘 조각도 24×24 viewBox·`fill=none`/흰 stroke 규격** — markerFrame 이 흰색 stroke 라인으로 감싸므로, 새 아이콘을 넣을 때 규격을 안 맞추면 프레임 안에서 색이 뭉개진다(식당 `ICON_PATHS` 와 동일 제약). 단 차량 알약(`buildBusVehiclePillSvg`)은 프레임을 안 쓰는 자체 SVG라 이 규격과 무관
- **`routePath` 의 상/하행 모호성은 라이브러리가 안 풀어준다** — 서울시 형상은 왕복이 한 줄(첫점≈끝점)이라 좌표만 주면 상행·하행 두 후보가 생긴다. `projectOnRoutePath` 에 `sMinM`/`sMaxM` 윈도우를 안 넘기면(기본 `0..Infinity`) 전체가 후보라 반대 방향에 붙을 수 있음 — 호출자가 sectOrd/정류소 seq 로 호길이 윈도우를 좁혀 넣는 게 계약. `sliceRoutePath` 에 `s0 > s1` 을 넘기면 빈 구간에 가까운 결과 → 호출자가 직선 폴백해야 함
- **`routePath` 평면 근사는 짧은~중거리 전용** — 기준점 cos 위도 보정을 노선 전체에 고정하므로 수백 km 급이면 오차가 커진다(서울시 노선 규모에선 무해). 한국 밖·초장거리 형상에 재사용하려면 재검토
- `pickRandom`은 빈 배열 시 throw — 호출자가 사전 체크 필요
- `Math.random()` 사용 — 암호학적 안전성이 필요하면 `crypto.getRandomValues()` 기반 별도 헬퍼를 추가할 것 (현재는 Pick 추첨용으로 충분)
- `reviewThumbnailUrl`은 절대 URL이 아닌 path만 반환 — 다른 origin에서 호출한다면 base URL을 별도로 prepend해야 함
- `resolveRestaurantCategoryKey` 의 키워드 테이블에 새 카테고리 enum 을 추가했다면 `ICON_PATHS` (라인 아이콘) 도 같이 추가해야 — 매핑은 성공하는데 아이콘이 없으면 TS 타입 에러로 빌드 시점에 잡히긴 하지만 runtime 색만 보이고 모양은 GENERIC 으로 떨어지는 실수 가능
- 카테고리 매칭 우선순위는 정규식 순서 의존 — `bar > dessert > cafe > japanese > chinese > western > snack > korean`. 새 키워드 추가 시 더 specific 한 것을 위로 둬야 (예: "이자카야" 가 일식보다 술집으로 잡혀야 함)
- `formatWonPrice` 의 범위 구분자는 `~|〜|-|–|—` 만 인식 — `to`, `→` 등은 단일 숫자/혼합 텍스트 분기로 빠짐. 백엔드/크롤러가 다른 구분자를 쓰기 시작하면 정규식 보강 필요

## Sources [coverage: high — 22 sources]

- [packages/utils/package.json](../../packages/utils/package.json) — *modified: 죽은 ./date 서브패스 제거*
- [packages/utils/vitest.config.ts](../../packages/utils/vitest.config.ts) — 순수 함수 단위 테스트(.js→.ts extensionAlias)
- [packages/utils/src/index.ts](../../packages/utils/src/index.ts) — *modified: busArrival/subwayTimetable re-export 추가, date 제거*
- [packages/utils/src/aiModel.ts](../../packages/utils/src/aiModel.ts)
- [packages/utils/src/busArrival.ts](../../packages/utils/src/busArrival.ts) (NEW) — 곧 도착 판정 + 도착 메시지 초 파싱
- [packages/utils/src/busMarker.ts](../../packages/utils/src/busMarker.ts)
- [packages/utils/src/format.ts](../../packages/utils/src/format.ts) — *modified: 대중교통 포맷터 집결, truncate 등 삭제*
- [packages/utils/src/format.test.ts](../../packages/utils/src/format.test.ts) (NEW)
- [packages/utils/src/geo.ts](../../packages/utils/src/geo.ts) — *modified: 거리 함수 흡수 + formatBbox*
- [packages/utils/src/geo.test.ts](../../packages/utils/src/geo.test.ts) (NEW)
- [packages/utils/src/subwayTimetable.ts](../../packages/utils/src/subwayTimetable.ts) (NEW) — 웹·앱 복사본 승격
- [packages/utils/src/subwayTimetable.test.ts](../../packages/utils/src/subwayTimetable.test.ts) (NEW)
- [packages/utils/src/subwayCongestion.ts](../../packages/utils/src/subwayCongestion.ts) (NEW 22차) — 혼잡도 임계/슬롯/방향 매칭 승격(`9206346`), 웹·앱 congestionUtils 는 색 facade 만
- [packages/utils/src/subwayCongestion.test.ts](../../packages/utils/src/subwayCongestion.test.ts) (NEW 22차) — 임계 경계·24+ 슬롯 접기·방향 매칭 폴백·slotLevel null 전파 7건
- [packages/utils/src/thumbnail.test.ts](../../packages/utils/src/thumbnail.test.ts) (NEW) — pstatic 가드 회귀 테스트
- [packages/utils/src/markerFrame.ts](../../packages/utils/src/markerFrame.ts) — 식당·버스·지하철 공용 마커 프레임(핀/원)
- [packages/utils/src/random.ts](../../packages/utils/src/random.ts)
- [packages/utils/src/restaurantCategory.ts](../../packages/utils/src/restaurantCategory.ts)
- [packages/utils/src/routePath.ts](../../packages/utils/src/routePath.ts) — 노선 형상 투영/보간(버스 따라가기 코어)
- [packages/utils/src/subwayLine.ts](../../packages/utils/src/subwayLine.ts) (NEW) — 수도권 전철 노선 상수(subwayId=lineId)
- [packages/utils/src/subwayMarker.ts](../../packages/utils/src/subwayMarker.ts) (NEW) — 전철 역/경유역/열차 마커
- [packages/utils/src/subwayPosition.ts](../../packages/utils/src/subwayPosition.ts) (NEW) — 열차 역간 보간(locateTrain/sliceForMove)
- [packages/utils/src/subwayPosition.test.ts](../../packages/utils/src/subwayPosition.test.ts) (NEW) — subwayPosition 단위 테스트
- [packages/utils/src/vehiclePill.ts](../../packages/utils/src/vehiclePill.ts) (NEW) — 버스·지하철 공용 차량 알약/방향 코어
- [packages/utils/src/thumbnail.ts](../../packages/utils/src/thumbnail.ts)
- [packages/utils/src/vworld.ts](../../packages/utils/src/vworld.ts)
