---
topic: utils
last_compiled: 2026-08-30
sources_count: 46
status: active
aliases: ["@repo/utils", pure-functions, helpers, pick-random, thumbnail-url, geo, bbox, compute-bbox-around, is-in-korea, lat-lng, restaurantCategory, formatWonPrice, 원화, 콤마, 카테고리매핑, resolveRestaurantCategoryKey, buildRestaurantMarkerSvg, aiModel, parseModelFamily, groupModelsByFamily, recommendModelForPurpose, isVisionModel, thinkOptionForModel, 멀티모달판별, model-family, 모델계열, markerFrame, buildPinMarkerSvg, buildCircleMarkerSvg, marker-frame, 마커프레임, busMarker, buildBusStopMarkerSvg, buildBusVehiclePillSvg, buildBusVehicleDirSvg, buildMyLocationMarkerSvg, buildBusRouteStopDotSvg, busRouteTypeColor, 버스마커, 노선유형색, routePath, createRoutePathIndex, projectOnRoutePath, pointAtRoutePathS, bearingAtRoutePathS, sliceRoutePath, 노선형상, 폴리라인투영, route-path-projection, subwayLine, SUBWAY_LINES, SubwayLine, subwayMarker, buildSubwayStationMarkerSvg, buildSubwayStopDotSvg, buildSubwayTrainPillDataUrl, buildSubwayTrainDirDataUrl, subwayPosition, locateTrain, TRAIN_STATUS_FRACTION, sliceForMove, subwayDestinationLabel, normalizeStationName, TrainSection, vehiclePill, buildVehiclePillSvg, buildVehiclePillDataUrl, buildVehicleDirSvg, 지하철마커, 열차보간, 열차알약, subwayCongestion, subwayTimetable, busArrival, vitest-config, airQuality, AirGradeLevel, AIR_GRADE_HEX, AIR_POLLUTANTS, airGradeFromValue, airGradeFromText, parseAirRegionGrades, airDataTimeToIso, parseAirDustImage, AIR_SIDO_OPTIONS, airSidoMatches, airSidoFromAddr, formatAirValue, 대기등급, CAI, 통합대기환경지수, airMarker, buildAirStationMarkerSvg, buildAirSavedLocationMarkerSvg, AIR_MARKER_COLORS, weather, latLngToKmaGrid, kmaGridToLatLng, isValidKmaGrid, kmaUltraNcstBase, kmaUltraFcstBase, kmaVilageBase, kmaPrevBase, kmaNextBaseAvailableAt, kmaMidTmFc, kmaCondition, kmaConditionFromText, KmaConditionKey, parseKmaPrecipText, kmaWindDirection16, kmaWindStrength, formatKmaTemp, kmaTodayIsoDate, KMA_CATEGORIES, 기상청격자, LCC-DFS, base_time, 발표시각, weatherRegions, WEATHER_PLACES, WeatherPlace, WEATHER_SIDOS, WEATHER_MID_LAND_REGIONS, WEATHER_MID_SEA_REGIONS, nearestWeatherPlace, searchWeatherPlaces, weatherPlaceById, 날씨지점, 중기예보구역, dateLabel, relativeDayLabel, formatYmdWithWeekday, todayKst, lifeMap, LIFE_MAP_LAYERS, LIFE_MAP_POINT_MIN_ZOOM, LIFE_CCTV_PURPOSES, lifeCctvPurposeGroup, LIFE_TOILET_KINDS, lifeToiletOpen24, LIFE_HOSPITAL_CATEGORIES, normalizeLifeHospitalCategory, lifeCellSizeDeg, LIFE_CELL_ORIGIN, formatLifeCount, 일상지도, 집계셀, lifeMapMarker, buildLifeCctvDotSvg, buildLifeToiletMarkerDataUrl, buildLifeHospitalMarkerDataUrl, buildLifeCellMarkerSvg, LIFE_CCTV_GROUP_COLOR, mealSlot, MEAL_SLOTS, MEAL_TYPES, MEAL_PORTION_FACTOR, guessMealSlot, guessMealSlotFromHour, toLocalDateKey, dateKeyRange, monthRange, mealDateLabel, parseTimeOfDay, formatTimeOfDay, 끼니추정, mealNutrition, summarizeMealNutrition, mealNutritionLabel, 영양합계, foodTaxonomy, FOOD_DISH_TYPES, FOOD_MAIN_INGREDIENTS, FOOD_CUISINES, FOOD_SOURCES, guessDishTypeFromName, guessMainIngredientFromName, guessCuisineFromName, mfdsCategoryToDishType, 음식택소노미, 조리형태, reviewDate, parseReviewVisitedAt, compareReviewRecencyDesc, 리뷰방문일, 연도복원]
---

# utils — 순수 유틸 패키지

**2026-08-17~08-30 변경 흡수 — 신규 모듈 11개(대기·날씨·일상지도·음식·식단·리뷰날짜) + `aiModel` 용도 확장 + 테스트 72→180 케이스(6→14 파일)**: 2주 동안 utils 가 "지도 마커·대중교통 헬퍼" 층에서 **서버 적재·정규화와 웹·앱 표시가 같은 코드표·수식을 쓰는 도메인 순수 층**으로 넓어졌다. 배럴 `index.ts` 는 18→**28 모듈** re-export(서브패스는 여전히 `./format`/`./random` 2종). (1) **대기(에어코리아)** — [`airQuality.ts`](../../packages/utils/src/airQuality.ts)(`7340743`, 2026-08-21): 통합대기환경지수(CAI) 등급 구간표 `AIR_POLLUTANTS` 7항목(PM10 `[30,80,150]` / PM2.5 `[15,35,75]` / O₃ `[0.03,0.09,0.15]` / NO₂ `[0.03,0.06,0.2]` / CO `[2,9,15]` / SO₂ `[0.02,0.05,0.15]` / CAI `[50,100,250]`) + `airGradeFromValue`·`airGradeFromText`, 등급 색 `AIR_GRADE_HEX`(파랑/초록/주황/빨강 + 결측 회색), 업스트림 문자열 파서(`parseAirRegionGrades` "서울 : 좋음,제주 : 좋음" / `airDataTimeToIso` 자정 "24:00" → 익일 00:00 / `airAnnouncedToIso` "HH시 발표" / `parseAirDustImage` 예측모델 이미지 URL 라벨), 시도 어휘 `AIR_SIDO_OPTIONS` 17(2026-07 행정통합으로 `'전남광주'` 통합 라벨) + `airSidoMatches` 포함 매칭 + `airSidoFromAddr`. [`airMarker.ts`](../../packages/utils/src/airMarker.ts)(`c6ac640`): 측정소 마커(등급색 × 선택 10종, `markerFrame` 핀/원 + lucide wind 3획) + 저장한 내 대기 위치 보라 점(`#7c3aed`, 26×26). (2) **날씨(기상청)** — [`weather.ts`](../../packages/utils/src/weather.ts)(`37e0db0`): 단기예보 LCC DFS 격자 변환 `latLngToKmaGrid`/`kmaGridToLatLng`(서울시청 60,127 등 12개 도시 공식표와 일치 실측), 발표 기준 시각 `kmaUltraNcstBase`(매시 :10)/`kmaUltraFcstBase`(매시 :45, HH30)/`kmaVilageBase`(02·05·…·23시 +10분)/`kmaMidTmFc`(06·18시) + 이전 슬롯 폴백·다음 슬롯 제공 시각(서버 캐시 TTL), 코드표(SKY 1/3/4, PTY 0~7, category 17종), `parseKmaPrecipText` 범주 문자열 → 대표값, 16방위·풍속 강도, `kmaCondition(sky, pty)`/`kmaConditionFromText(wf)` → 상태 키 10종(웹·앱 아이콘 단일 축). 시각은 **Intl 없이 "UTC ms + 9h" 산술**(Hermes 안전, DST 없음 전제). [`weatherRegions.ts`](../../packages/utils/src/weatherRegions.ts)(`37e0db0` → 구·군 74 추가 `7704f8c`): 중기육상 구역 10 + 전망 stnId, 해상 12, 시도 17, **지점 245 = 시·군 171(중기기온 regId) + 광역시 구·군 74**(id `${taRegId}-${이름}`, 소속 광역시 중기기온 지점 공유), `nearestWeatherPlace`(haversine 전수 스캔)·`searchWeatherPlaces`. [`dateLabel.ts`](../../packages/utils/src/dateLabel.ts)(`e348032`, 2026-08-22 — **웹 → utils 승격**): 웹 `components/air/airGrade.ts` 에 있던 `relativeDayLabel`/`todayKst`/`formatYmdWithWeekday` 를 앱 화면이 붙으며 utils 로 올린 것(웹 소비처 7곳 import 교체; `todayKst` = `kmaTodayIsoDate` 재수출). 같은 커밋이 `lifeToiletOpenLabel`(웹 `lifeMapFormat.ts` → `lifeMap.ts`)과 `airQuality`·`weather` 의 표시 헬퍼 일부(`weatherFormat.ts`·`airGrade.ts` → utils)도 함께 승격 — 웹 파일들은 Tailwind 색 facade·소비처로 축소. (3) **일상지도** — [`lifeMap.ts`](../../packages/utils/src/lifeMap.ts)(`1d92acb` → 병의원 `4fd6e22`, 2026-08-30): 레이어 3종(cctv/toilet/hospital) + 점 표시 최소 줌 `{cctv 15, toilet 13, hospital 14}`·`LIFE_MAP_POINTS_MAX 4000`, CCTV 설치목적 10종 → 범례 4그룹(safety/child/traffic/etc — 범주색 4개까지만 전 쌍이 읽힌다는 팔레트 검증 결과), 화장실 구분 5·개방구분 5·`lifeToiletOpen24`(상시 또는 상세 "24시간/00:00~24:00/연중무휴" 정규식)·편의 배지 6/필터 5·변기수 요약, 병의원 심평원 종별 15종 → 7종(`'상급종합'` 실응답 표기 포함), 저줌 **집계 셀 `lifeCellSizeDeg(zoom)`(= 타일 1/4, 위도 0.8배, 전국 고정 원점 33°N/124°E — 서버 GROUP BY·캐시 키·클라 마커가 같은 함수)**. [`lifeMapMarker.ts`](../../packages/utils/src/lifeMapMarker.ts): CCTV 12px 점(그룹색 4 + 흰 외곽선)/선택 핀, 화장실 분홍(`#c2185b`)·병의원 청록(`#00897b`) 원/핀(십자 아이콘), 건수 버킷별 26/34/40/46px 숫자 내장 버블. (4) **음식·식단** — [`foodTaxonomy.ts`](../../packages/utils/src/foodTaxonomy.ts)(`102ccdb`, 2026-08-22): dishType 19·mainIngredient 13·cuisine 7·source 6 키/라벨 + 원본 분류 매핑(식약처 식품대분류 25종 / 한식 800선 25종 / 레시피 RCP_WAY2 12종 / 택소노미 v3 루트 15종) + 이름 키워드 규칙(조리형태 21·주재료 12·계통 6, 순서 = 우선순위). [`mealSlot.ts`](../../packages/utils/src/mealSlot.ts)(`c5b5fe2` → 시간 프리셋 `1a72a60`): 끼니 5·식사유형 5·양 3(배수 0.6/1/1.5)·항목 출처 4, `guessMealSlotFromHour`(05–10 아침/11–14 점심/17–21 저녁/22–04 야식/그 외 간식), 로컬 날짜 키 헬퍼, `parseTimeOfDay`/`formatTimeOfDay`(25:10 되감기). [`mealNutrition.ts`](../../packages/utils/src/mealNutrition.ts)(`29fac09` → `59c2ae1`): 값 있는 항목만 더하는 과소평가 합계 + "약 530kcal · 4개 중 2개 반영" 문구, 주식이 있는데 곁들임만 반영되면 숨김. **utils 의 키 목록은 `@repo/api-contract` zod enum 과 같은 순서로 이중 정의**(utils 는 api-contract 를 import 못 하는 leaf) — friendly food/meal 테스트가 동일성을 검증. (5) **[`reviewDate.ts`](../../packages/utils/src/reviewDate.ts)(`0d72380`, 2026-08-17)** — 출처별 방문일(ISO / `26.8.15.토` / `8.15.토`)을 UTC 자정 ms 로 정규화, 연도 없는 Naver 날짜는 수집 시각의 KST 연도로 복원(1월 크롤의 `12.31` 은 전년 보정) + `compareReviewRecencyDesc`(방문일 → 수집 시각 폴백) — 리뷰 업데이트 누락·최신순 오류 수정의 핵심. (6) **[`aiModel.ts`](../../packages/utils/src/aiModel.ts) 확장(`cc8399a`·`5cdbc0f`)** — `isVisionModel` 이 이름 휴리스틱에 더해 **Ollama Cloud 카탈로그(2026-08-22) 기반 멀티모달 계열표**(gemma3/4·qwen3.5·kimi-k2.6/k3·minimax-m3·mistral-large-3·llama4·mistral-small3·glm-4.xv)를 보고, `recommendModelForPurpose` 용도에 `'meal-photo'`(=image)·`'meal-recommend'`(=chat) 추가, 신규 `thinkOptionForModel(modelId): false | 'low'`(gpt-oss 만 `'low'` — 사고를 끌 수 없어 최저 레벨, 그 외 `false`; qwen3.5:397b 가 think 미지정 시 content 가 빈 문자열로 오는 실측 대응). [`aiModel.test.ts`](../../packages/utils/src/aiModel.test.ts) 신설 16건. (7) 테스트 **180 케이스 / 14 파일**(airQuality 21·weather 37·lifeMap 9·mealSlot 6·mealNutrition 7·foodTaxonomy 6·reviewDate 6·aiModel 16 신설; 기존 format 19·geo 8·subwayCongestion 7·subwayPosition 24·subwayTimetable 9·thumbnail 5). 소비처는 friendly(air-quality·weather·life-map·food·meal·restaurant 모듈 + 적재 스크립트), 웹·앱 화면, `@repo/shared`(`useMyLocationGlance`·`weatherDaily`) — 표는 API Surface 참조.

**2026-08-16~17 변경 흡수 — `formatBbox` 통합(6곳 중복 제거) + geo/format 테스트 확충 + 죽은 `./date` 서브패스 제거**: (1) **[`geo.ts`](../../packages/utils/src/geo.ts) 에 `formatBbox(b: Bbox): string`** — bbox → 쿼리 문자열(`minLng,minLat,maxLng,maxLat`, `toFixed(5)`). 웹 4곳(DiscoverMap·PublicRestaurantsMap·SmartPickSection·RestaurantsV2Page)·앱 2곳(PublicRestaurantsWebMap native/web)의 동일 복제를 단일 정의로(커밋 `f293a3c`). 순서·5자리 패딩은 서버 bbox 파라미터 계약이라 [`geo.test.ts`](../../packages/utils/src/geo.test.ts) 로 고정. (2) **`./date` 서브패스 제거(`bb07762`)** — 2026-07-13 `date.ts` 삭제(참조 0) 때 exports 맵에 남아 있던 죽은 항목. 서브패스는 이제 `./format`/`./random` 2종. (3) **[`subwayCongestion.ts`](../../packages/utils/src/subwayCongestion.ts) 신설(`9206346`)** — 웹·앱 congestionUtils 가 문자 단위로 복제하던 혼잡도 임계/슬롯/방향 매칭을 단일 정의로(색 표는 플랫폼 facade 에 잔류). utils 는 의존 0 leaf 라 api-contract 타입 대신 구조적 `CongestionDirectionLike` + 제네릭. (4) 테스트 72케이스(6파일 — +subwayCongestion 7).

**2026-07-13~25 변경 흡수 — 대대적 통합 리팩터: geo 거리 함수 흡수 + FE 대중교통 포맷터·파서 집결 + `busArrival`/`subwayTimetable` 신설 + dead code 삭제 + 썸네일 프록시 가드**: 웹→앱 포팅 과정에서 복제된 순수 함수들이 utils 단일 정의로 모였다. (1) **[`geo.ts`](../../packages/utils/src/geo.ts) 확장(`edafb6a`)** — `approxDistanceM`(등거리 사각 근사 — 웹2·앱2·friendly2 로컬 정의 제거), `haversineM`(측지 — matching.ts·diningcode 어댑터 통일, asin 클램프), `roundCoord`(소수 5자리 — 4곳 제거), `parseLatLngParam`(한국 WGS84 범위 가드 lat 33~39/lng 124~132 — BusPage/SubwayPage parseNear 2곳). (2) **[`format.ts`](../../packages/utils/src/format.ts) 재편(`c6ac5ba`·`ddb2a8e`)** — `truncate`/`capitalize`/`slugify` 삭제(참조 0, `91eff7d`)되고 대중교통 포맷터가 들어옴: `formatDistanceM`(6곳 복제 제거), `formatRelativeMin`/`formatRelativeSec`(nowMs 기본 인자로 웹·앱 시그니처 차 흡수), `remainSecSince`/`formatCountdown`(하차 알림 카운트다운 — 세 번째 복사본 방지, `ddb2a8e`), `formatWonPrice` 유지. (3) **[`busArrival.ts`](../../packages/utils/src/busArrival.ts) 신설** — `isBusArrivalImminent`("곧 도착" 판정 4곳 흩어짐 통일, null/undefined → false) + `parseBusArrivalSec`('N분후[…]' 분 해상도 파싱 — 하차 알림 실측 예약 근거). (4) **[`subwayTimetable.ts`](../../packages/utils/src/subwayTimetable.ts) 승격(`2507cdc`)** — 웹·앱 `components/subway/timetableUtils.ts` 파일 전체 복사본을 단일 정의로(소비처 8곳 교체): `dayTypeForToday`/`parseTimeMin`(자정 넘김 24+ 단조성)/`formatHHMM`/`lastTrainRemainMin`(24+ 축 보정)/`arrivalUpdnToTimetable`/`isSubwayExpressTag`(EXPRESS_YN 'D'=급행)/`updnLabel`. (5) **[`date.ts`] 전체 삭제(`91eff7d`)** — toISOString/fromISOString/isValidDate 리포 참조 0건. (6) **[`thumbnail.ts`](../../packages/utils/src/thumbnail.ts) 프록시 가드(`4c829ad`)** — `reviewThumbnailUrl` 이 `*.pstatic.net` 절대 URL 만 프록시로 감싸고 상대경로(파노라마 로컬 사본 `/api/v1/media/panorama/…`)·비네이버 호스트는 원본 통과 — 8차 하드닝이 모든 썸네일을 프록시로 감싸며 zod url() 400 으로 리스트 대표이미지가 깨진 회귀의 복구.

**2026-07-07 변경 흡수 — 지하철 도메인 순수 유틸 3종 신규(`subwayLine`/`subwayMarker`/`subwayPosition`) + 차량 알약/방향 기하 코어를 버스·지하철 공용으로 추출(`vehiclePill`) + vitest 설정 신설**: 대중교통이 버스에서 전철로 넓어지며 utils 에 지하철 도메인 파일이 붙고, 버스·지하철이 공유하던 마커 코어가 한 겹 더 추출됐다. (1) **[`vehiclePill.ts`](../../packages/utils/src/vehiclePill.ts) 신설 (공용 차량 알약/방향)** — 실시간 위치 '알약'(stadium 말풍선 + 라벨) + 진행 방향 '다트' SVG 의 도메인 중립 기하 코어. 버스 노선번호 알약과 지하철 열차 알약이 같은 규격(꼬리 끝이 세로 중앙 = 정차 좌표가 되는 **앵커 트릭** — SVG 아래 절반을 투명 여백으로 채워 MapCanvas 의 `[0.5,0.5]` 비선택 앵커·중앙 기준 축소에 정합)이라, 복제 드리프트를 막으려 한 곳으로 뺐다. `busMarker.ts` 의 기존 export(`buildBusVehiclePillSvg`/`...DataUrl`/`buildBusVehicleDirSvg`/`...DataUrl`)는 이제 이 함수들에 **재export 위임(바이트 동일 산출)** — busMarker 는 124→약 15줄로 축소. (2) **[`subwayLine.ts`](../../packages/utils/src/subwayLine.ts) 신설** — 수도권 전철 노선 상수(`SUBWAY_LINES`). 서울시 실시간 API 의 `subwayId`(4자리, 예 `'1002'`)를 `lineId` 로 채택(프로브 실측 2026-07-06 — 도착/위치 응답 체계와 동일), `{ lineId, name, shortLabel, color, positionParam }` — 공식 노선색 + realtimePosition path 파라미터(검증 여부 주석). (3) **[`subwayMarker.ts`](../../packages/utils/src/subwayMarker.ts) 신설** — 전철 도메인 마커: 역 마커(markerFrame 핀/원 프레임 재사용 + 지하철 아이콘)·경유역 점(`buildSubwayStopDotSvg` — 환승역 이중 링)·실시간 열차 알약/방향(`vehiclePill` 위임). (4) **[`subwayPosition.ts`](../../packages/utils/src/subwayPosition.ts) 신설(+테스트)** — 열차 역간 보간의 기하 코어. `locateTrain`(역 기준 상태를 역간 구간의 분수 위치로, `TRAIN_STATUS_FRACTION` 진입/도착/출발 등 상태→구간 비율) + `sliceForMove`(따라가기 이동 구간) + `subwayDestinationLabel`/`normalizeStationName`(행선지 표기 정규화). 버스가 도로 폴리라인을 추종한 것(`routePath`)과 달리 전철은 GPS 가 없어 역 순서(sections) 기반 보간이라 별도 모듈. (5) **[`vitest.config.ts`](../../packages/utils/vitest.config.ts) 신설** — utils 순수 함수 단위 테스트(`subwayPosition.test.ts`). 소스가 ESM `.js` import 라 `extensionAlias { '.js': ['.ts','.js'] }` 로 `.ts` 우선 해석(friendly 설정과 동일). 셋 다 순수 문자열/수치 처리라 utils leaf 에 적합. 지하철 도메인 전체는 [subway](subway.md), 웹 소비는 [web](web.md)/[map](map.md).

**2026-07-06 변경 흡수 — 버스 마커 3종 신규 + 식당·버스 공용 마커 프레임 추출(`markerFrame.ts`) + 노선 형상 투영/보간(`routePath.ts`)**: 지도([map](map.md)) 마커 코드가 커지며 세 파일로 정리됐다. (1) **[`markerFrame.ts`](../../packages/utils/src/markerFrame.ts) 신설 (공용 프레임)** — 식당(`restaurantCategory`)·버스(`busMarker`) 마커가 문자 단위로 동일했던 SVG 골격(선택 = 32×48 핀 / 비선택 = 26×26 원)을 `buildPinMarkerSvg`/`buildCircleMarkerSvg` 두 함수로 통합. `{ fill, innerSvg }` 를 받아 흰 외곽선(stroke 2) + 24×24 viewBox 아이콘을 16×16 영역으로 0.667 scale 배치. `restaurantCategory.ts` 는 인라인으로 갖고 있던 두 프레임을 이 모듈 import 로 대체 — **동작 변화 없음(76개 마커 조합 바이트 동일 검증, 커밋 `a9c1fe4`)**. MapCanvas 의 anchor·라벨 offset·SMALL_ICON_SCALE 이 이 규격에 묶여 있어 수치는 MapCanvas 와 함께 봐야 한다. (2) **[`busMarker.ts`](../../packages/utils/src/busMarker.ts) 신설** — 버스 도메인 마커 일습: 정류장(파랑 핀/원, 버스 실루엣 아이콘)·실시간 차량 알약(노선번호 stadium 말풍선 + 정차 후광 + 따라가기 강조 링)·진행 방향 다트·내 위치(파란 점)·경유 정류소 점(16×16) + 노선유형 코드→대표색(`busRouteTypeColor`). 정류장/내위치/경유점은 markerFrame 과 같은 26×26·16×16 규격을 공유하고, 차량 알약만 꼬리 끝이 좌표를 가리키는 자체 규격. (3) **[`routePath.ts`](../../packages/utils/src/routePath.ts) 신설** — '노선 형상 따라가기'(차량이 도로 형상을 추종해 이동)의 기하 코어. 폴리라인 위 호길이(arc-length) 투영/보간 순수 함수. 상행+하행이 한 줄인 왕복 형상의 상/하행 모호성을 호길이 윈도우 입력으로 호출자가 푼다. 셋 다 순수 문자열/수치 처리라 utils leaf 에 적합. 버스 도메인 전체는 [bus](bus.md), FE 플러밍은 [shared](shared.md).

**2026-06-25 변경 흡수 — `aiModel.ts` 신규 (모델 id → 계열 묶음 + 용도별 추천)**: AI 모델 선택 UX 를 돕는 순수 휴리스틱이 [`aiModel.ts`](../../packages/utils/src/aiModel.ts) 한 파일로 추가. `parseModelFamily`(Ollama 모델 id `<brand><version>[-variant][:tag]` 에서 첫 콜론/숫자 앞 brand 추출 + 끝 버전 접두 정리) → `groupModelsByFamily`(평면 모델 리스트를 계열별 그룹으로 — 모델 선택 팝업에서 긴 리스트를 사람이 훑기 좋게) + `isVisionModel`(이름 휴리스틱으로 vision 계열 판별) + `recommendModelForPurpose('chat' | 'image' | 'log-analysis', models)`(용도별 기본 모델 프리필 — image=가장 작은 vision, log-analysis=가장 큰 텍스트, chat=중간 규모). 완벽 분류가 아니라 [ai](ai.md) 의 용도별 모델 선택([AdminAiKeysPage](../../apps/web/src/routes/admin/AdminAiKeysPage.tsx))·[logs](logs.md) LLM 실패 분석 모델 추천의 시작점 헬퍼. 순수 문자열 처리라 utils leaf 에 적합. *(2026-08-22 이후 용도 5종·멀티모달 계열표·think 옵션으로 확장 — 위 최신 문단.)*

**2026-05-25 변경 흡수 — `restaurantCategory.ts` 신규 (카테고리 매핑) + `format.ts` 에 원화 콤마 포맷 통일**: 식당 카테고리 → 아이콘 키 정규화 + 마커 SVG 빌더가 [`restaurantCategory.ts`](../../packages/utils/src/restaurantCategory.ts) 한 파일로 들어옴 — 8종 라인 아이콘(korean/japanese/chinese/cafe/dessert/bar/western/snack) + primary/muted 2-variant × selected 2-state 마커. 같은 룰을 [map](map.md) 토픽의 웹/앱 마커 양쪽에서 공유. [`format.ts`](../../packages/utils/src/format.ts) 에 `formatWonPrice(price: string | null): string | null` 추가 — 자유 입력 메뉴 가격을 `12,000원` / `12,000원 ~ 18,000원` 콤마 포맷으로 통일 (커밋 `078cbe1`). 단일 숫자/범위(`~`/`-`/`–`/`—`)/혼합 문자열 모두 처리, 0 이하/숫자 외 입력은 원문 보존.

**2026-05-19 변경 흡수 — geo 모듈 신규**: [geo.ts](../../packages/utils/src/geo.ts) 가 위경도 다루는 순수 유틸 한 파일로 추가. (1) `computeBboxAround(center: LatLng, radiusKm: number): Bbox` — 사용자 위치 주변 정사각형 bbox. 1° latitude ≈ 111.32 km 평균 + cos(lat) longitude 보정. 짧은 거리(≤수 km) 정사각 근사로 Haversine 등 측지 거리 불필요. (2) `isInKorea(coords): boolean` — vworld 타일 가드 (본토·제주·울릉 포함 124.5~131.9 lng, 33.0~38.7 lat). 시뮬레이터/실 사용자가 한국 밖이면 vworld 타일이 전부 404 떨어지므로 폴백 트리거. `LatLng`/`Bbox` 인터페이스 export — 웹(`useUserLocation`) 과 앱(`useUserLocationNative`) 양쪽이 같은 모양으로 소비.

## Purpose [coverage: high — 6 sources]

`@repo/utils` — 순수 함수 모음. FE/BE 모두에서 import 가능한 사이드 이펙트 없는 헬퍼만 모아 둔다. 외부 npm 의존이 0개(devDependencies 는 `@repo/config`·typescript·vitest 뿐)고 어떤 런타임(Node, 브라우저, RN/Hermes)에서도 실행된다. CLAUDE.md의 의존 그래프상 leaf 노드 — `shared`, 모든 앱이 여기로 들어올 수 있지만 utils는 어디로도 의존하지 않는다(`@repo/api-contract` 도 utils 를 import 하지 않는다 — 두 패키지는 서로 독립이고, 겹치는 enum 키 목록은 "같은 순서" 계약으로만 묶인다).

세 층이 공존한다. (a) **도메인 코드표·정규화** — 대기 등급 구간(`airQuality`), 기상청 격자·발표 시각·코드표(`weather`·`weatherRegions`), 일상지도 코드표·집계 셀(`lifeMap`), 음식 분류 축(`foodTaxonomy`), 끼니·양·날짜 키(`mealSlot`), 영양 합계(`mealNutrition`), 리뷰 방문일(`reviewDate`), 대중교통(`busArrival`·`subwayLine`·`subwayTimetable`·`subwayCongestion`) — **friendly 의 적재·정규화·캐시 TTL 계산과 웹·앱 표시가 같은 함수를 호출**하는 것이 이 층의 존재 이유. (b) **지도 마커 SVG** — `markerFrame.ts` 가 식당·버스·지하철·대기·일상지도 공용 골격을 대고 각 도메인 모듈(`restaurantCategory`·`busMarker`·`subwayMarker`·`airMarker`·`lifeMapMarker`)이 색/아이콘만 채운다; `vehiclePill`·`routePath`·`subwayPosition` 은 차량 위치/이동 기하. (c) **표현 헬퍼** — `reviewThumbnailUrl`(friendly 미디어 프록시 URL), `formatWonPrice`, 대중교통 포맷터(`format.ts`), `dateLabel`, `aiModel`(모델 계열/용도 추천/think 옵션), `pickRandom`/`shuffle`(Pick 추첨).

## Architecture [coverage: high — 30 sources]

`src/{domain}.ts` 단일 도메인 단위 + `src/index.ts` 배럴:

```
packages/utils/
├── src/
│   ├── index.ts             // export * (28개 모듈 re-export)
│   ├── aiModel.ts           // (+test) 모델 id → 계열 묶음 + 용도 5종 추천 + isVisionModel(멀티모달 계열표) + thinkOptionForModel
│   ├── airQuality.ts        // (+test) 에어코리아 CAI 등급 구간·색·파서(권역 문자열/24:00/발표시각/이미지 URL)·시도 어휘
│   ├── airMarker.ts         // 측정소 마커(등급색×선택, markerFrame) + 저장한 내 대기 위치 점
│   ├── busArrival.ts        // isBusArrivalImminent + parseBusArrivalSec
│   ├── busMarker.ts         // 버스 정류장/내위치/경유점 마커 + 노선유형 색 (차량 알약/방향은 vehiclePill 위임)
│   ├── dateLabel.ts         // 예보 화면 공용 날짜 라벨(오늘/내일/모레, "8/21 (목)") — todayKst 는 weather 재수출
│   ├── foodTaxonomy.ts      // (+test) 음식 분류 축(dishType 19/mainIngredient 13/cuisine 7/source 6) + 원본 분류 매핑 + 이름 규칙
│   ├── format.ts            // (+test) formatWonPrice + 대중교통 포맷터(formatDistanceM/formatRelative*/remainSecSince/formatCountdown)
│   ├── geo.ts               // (+test) LatLng, Bbox, computeBboxAround, formatBbox, isInKorea, approxDistanceM, haversineM, roundCoord, parseLatLngParam
│   ├── lifeMap.ts           // (+test) 일상지도 레이어/코드표(CCTV 목적·화장실·병의원)/편의 판정/표시 헬퍼/저줌 집계 셀
│   ├── lifeMapMarker.ts     // CCTV 점·핀, 화장실·병의원 원/핀, 집계 버블 SVG (markerFrame + lifeMap)
│   ├── markerFrame.ts       // 식당·버스·지하철·대기·일상지도 공용 마커 프레임 (핀 32×48 / 원 26×26)
│   ├── mealNutrition.ts     // (+test) 끼니 영양 합계(값 있는 항목만) + 카드 문구
│   ├── mealSlot.ts          // (+test) 끼니/식사유형/양/출처 키·라벨 + 끼니 추정 + 로컬 날짜 키 + 시각 파싱
│   ├── random.ts            // pickRandom, shuffle
│   ├── restaurantCategory.ts // 카테고리 키 정규화 + 마커 SVG (프레임은 markerFrame 위임)
│   ├── reviewDate.ts        // (+test) 리뷰 방문일 파싱(연도 복원) + 최신순 비교
│   ├── routePath.ts         // 노선 형상 투영/보간 (버스 따라가기 이동 코어)
│   ├── subwayCongestion.ts  // (+test) 혼잡도 임계/슬롯/방향 매칭
│   ├── subwayLine.ts        // 수도권 전철 노선 상수 SUBWAY_LINES (subwayId=lineId)
│   ├── subwayMarker.ts      // 전철 역/경유역 점(환승 이중링)/열차 알약·방향 마커
│   ├── subwayPosition.ts    // (+test) 열차 역간 보간 (locateTrain/TRAIN_STATUS_FRACTION/sliceForMove)
│   ├── subwayTimetable.ts   // (+test) 시간표 파생 — 웹·앱 timetableUtils 복사본의 단일 정의
│   ├── vehiclePill.ts       // 버스·지하철 공용 차량 알약/방향 다트 기하 코어
│   ├── thumbnail.ts         // (+test) reviewThumbnailUrl (*.pstatic.net 만 프록시, 그 외 원본 통과)
│   ├── vworld.ts            // vworld 타일 헬퍼
│   ├── weather.ts           // (+test) 기상청 LCC 격자 변환·KST base 시각·코드표·강수 문자열·바람·상태 키·라벨
│   └── weatherRegions.ts    // 중기예보 구역(육상 10/해상 12) + 시도 17 + 지점 245(시·군 171 + 구·군 74) + 최근접/검색
├── package.json             // build 없음 — src 그대로 export, devDeps 만(@repo/config·typescript·vitest)
├── vitest.config.ts         // 순수 함수 단위 테스트 (.js→.ts extensionAlias)
└── tsconfig.json
```

api-contract와 같은 빌드 없는 패턴: `package.json`이 `./src/*.ts`를 직접 main/types/exports로 노출. 서브패스 import 지원: `@repo/utils/format`, `@repo/utils/random` 2종만 `exports` 맵에 등록(`./date` 는 date.ts 삭제와 함께 제거 — bb07762). 나머지 26개 모듈은 서브패스 미등록이라 배럴 경유로만 접근 — `import { ... } from '@repo/utils'`.

**모듈 간 내부 의존(전부 utils 안에서 닫힘)** — `markerFrame.ts`(공용 핀/원 골격) ← `restaurantCategory`·`busMarker`·`subwayMarker`·`airMarker`·`lifeMapMarker`(도메인 아이콘/색). 프레임을 한 곳에 두어 다섯 도메인 마커가 같은 anchor·라벨 offset·축소 스케일 규격을 강제로 공유한다. `airMarker` → `airQuality`(등급 타입), `lifeMapMarker` → `lifeMap`(그룹/레이어/버킷), `weatherRegions` → `geo`(`haversineM`), `dateLabel` → `weather`(`kmaTodayIsoDate` 재수출), `routePath`·`weather` → `geo`(`LatLng`). 별도로 `vehiclePill.ts`(차량 알약/방향)는 markerFrame 을 안 쓰는 자체 SVG 골격이지만 `busMarker`·`subwayMarker` 두 도메인 차량이 공유하는 코어라 한 겹 더 추출. `routePath.ts`(버스 형상 투영)·`subwayPosition.ts`(전철 역간 보간)는 마커가 아니라 이동 위치 계산 — 버스는 도로 폴리라인 추종, 전철은 GPS 없이 역 순서 기반이라 코어가 갈린다.

**api-contract 와의 "같은 순서" 계약** — `mealSlot.ts`(`MEAL_SLOTS`/`MEAL_TYPES`/`MEAL_PORTIONS`/`MEAL_ITEM_SOURCES`)와 `foodTaxonomy.ts`(`FOOD_DISH_TYPES`/`FOOD_MAIN_INGREDIENTS`/`FOOD_CUISINES`/`FOOD_SOURCES`)의 키 배열은 `@repo/api-contract` 의 zod enum 과 **값·순서가 같아야** 한다. utils 는 api-contract 를 import 할 수 없고(leaf), api-contract 도 utils 를 import 하지 않으므로(런타임 의존 0 유지) 두 목록을 각자 적고, friendly 의 food/meal 테스트가 동일성을 검증한다. `aiModel.ts` 의 `ModelPurpose` 리터럴 유니온도 같은 이유로 api-contract `LlmProviderPurpose` 와 별도로 적혀 있다.

## Talks To [coverage: high — 40 sources]

- 컨슈머: `apps/friendly`, `apps/web`, `apps/mobile`, `packages/shared` — 어디서나 import 가능. `packages/api-contract` 는 import 하지 않는다(주석에서만 참조).
- 의존: 없음 (외부 npm 0개, 워크스페이스 0개) — 진짜 leaf 노드
- **friendly 가 도메인 모듈을 서버 로직에 직접 쓴다** — [air-quality.service](../../apps/friendly/src/modules/air-quality/air-quality.service.ts)(등급 복원·시도 매칭·시각 정규화), [weather 모듈](../../apps/friendly/src/modules/weather/)(kma-api/kma-apihub 어댑터·aws.service·weather.service·route — 격자 검증·base 시각·캐시 TTL·코드표), [life-map 모듈](../../apps/friendly/src/modules/life-map/)(마스터 정규화·집계 셀) + 적재 스크립트 `load-life-{cctv,toilets,hospitals}.ts`·`probe-hira-api.ts`, [food 모듈](../../apps/friendly/src/modules/food/)(import/classify/merge-conflict/service — 분류 매핑·이름 규칙), [meal](../../apps/friendly/src/modules/meal/)·meal-recognition·meal-recommendation(끼니 추정·날짜 키·택소노미 라벨), [restaurant.service](../../apps/friendly/src/modules/restaurant/restaurant.service.ts)(`compareReviewRecencyDesc`), analytics/food-classify/meal-*/settlement-extraction 서비스(`thinkOptionForModel`·`recommendModelForPurpose`). 도메인 세부는 [air-quality](air-quality.md)·[weather](weather.md)·[life-map](life-map.md)·[food](food.md)·[meal](meal.md)·[crawl](crawl.md).
- `reviewThumbnailUrl`은 friendly의 `/api/v1/media/thumbnail` 프록시 라우트 (friendly 의 [media 모듈](friendly.md))를 가리키므로 클라이언트에서 friendly 도메인과 같은 origin이거나 base URL이 적용된 fetcher와 함께 쓰여야 한다
- `restaurantCategory`·`busMarker`·`subwayMarker`·`airMarker`·`lifeMapMarker` 의 마커 SVG 는 [map 토픽](map.md) 의 OpenLayers (웹) MapCanvas 에서 data URL 형태로 `Icon.src` 에 직접 들어가고, 앱은 WebView 브리지 마커(`lifeMapBridgeMarkers.ts`·AirStationsMapCard)로 같은 함수를 쓴다. 다섯 도메인이 `markerFrame.ts` 의 같은 핀/원 규격을 공유(교차 도메인 시각 일관성).
- `routePath.ts` 는 버스 노선 형상(서울시 getRoutePath 폴리라인) 위 차량 위치를 보간하는 [bus](bus.md) '따라가기' 기능의 코어. 웹 MapCanvas 가 실시간 차량 좌표를 형상에 투영해 도로를 추종시킬 때 호출.
- `@repo/shared` 가 utils 위에서 파생값을 만든다 — [useMyLocationGlance](../../packages/shared/src/hooks/useMyLocationGlance.ts)(`latLngToKmaGrid`·`kmaCondition`), [weather/weatherDaily.ts](../../packages/shared/src/weather/weatherDaily.ts)(`kmaCondition`·`kmaConditionFromText`), [life-map.api.ts](../../packages/shared/src/api/life-map.api.ts)(bbox 는 `formatBbox` 문자열). shared 관점은 [shared](shared.md).
- 웹·앱 소비처는 API Surface 의 표 참조 — 대기/날씨/일상지도/식단 화면이 웹·앱 양쪽에 있고 둘 다 같은 utils 함수를 부른다([platform-ui-split](../concepts/platform-ui-split.md)).

## API Surface [coverage: high — 30 sources]

### 2026-08-17~30 신규 모듈 — export 와 소비처

| 모듈 | 주요 export | 소비처(utils 밖) |
|---|---|---|
| [`airQuality.ts`](../../packages/utils/src/airQuality.ts) | `AirGradeLevel`(1~4) · `AIR_GRADE_LABEL`/`AIR_GRADE_LEVELS`/`AIR_GRADE_HEX`/`AIR_GRADE_NONE_HEX` · `AirPollutant`·`AIR_POLLUTANTS`(7, `breakpoints`·`unit`·`digits`)·`airPollutantMeta` · `airGradeFromValue`·`airGradeFromText`·`airWeeklyLevel`('낮음'/'높음') · `parseAirRegionGrades`·`splitAirReliability`·`AIR_FORECAST_REGION_ORDER`(21)·`sortAirRegions` · `airDataTimeToIso`·`airAnnouncedToIso`·`formatAirHourLabel` · `parseAirDustImage` · `AIR_SIDO_OPTIONS`(17)·`airSidoMatches`·`airSidoFromAddr` · `formatAirValue` | friendly air-quality.service + airkorea-api.adapter.test; 웹 `components/air/*` 13 + `airGrade.ts` + AirQualityPage + MyLocationChip; 앱 `components/air/*` 12 + `lib/airGradeColor.ts` + MyLocationCard; shared useMyLocationGlance |
| [`airMarker.ts`](../../packages/utils/src/airMarker.ts) | `AIR_MARKER_COLORS`(0~4 `{base, selected}`) · `buildAirStationMarkerSvg/DataUrl({ grade, selected })` · `buildAirSavedLocationMarkerSvg/DataUrl()` | 웹 AirStationsMap·LifeMapView; 앱 AirStationsMapCard·life-map/index |
| [`weather.ts`](../../packages/utils/src/weather.ts) | 격자 `KmaGrid`·`KMA_GRID_NX_MAX 149`/`NY_MAX 253`·`latLngToKmaGrid`·`kmaGridToLatLng`·`isValidKmaGrid` · base `KmaBase`·`KmaBaseKind`·`kmaBaseToDate`·`kmaBaseToIso`·`kmaFcstTimeToIso`·`kmaYmdToIsoDate`·`kmaYmdAddDays`·`kmaTodayIsoDate`·`kmaUltraNcstBase`·`kmaUltraFcstBase`·`KMA_VILAGE_BASE_HOURS`·`kmaVilageBase`·`kmaPrevBase`·`kmaNextBaseAvailableAt`·`kmaMidTmFc`·`kmaPrevMidTmFc`·`kmaTmFcToIso`·`kmaNextMidTmFcAt` · 코드표 `KMA_SKY_LABEL`·`KMA_PTY_LABEL`·`kmaSkyLabel`·`kmaPtyLabel`·`KMA_CATEGORIES`(17) · `parseKmaPrecipText` · `kmaWindDirection16`·`kmaWindStrength` · `KmaConditionKey`(10)·`KMA_CONDITION_LABEL`·`kmaCondition`·`kmaConditionFromText`·`kmaConditionIsWet` · `KMA_MID_DAYS`(4~10) · `formatKmaTemp`·`formatKmaHourLabel`·`formatKmaBaseLabel`·`formatKmaTmFcLabel`·`kmaIsDaytimeHour` | friendly weather 모듈(kma-api/kma-apihub 어댑터·aws.service·service·route + 테스트 2 + probe 2)·meal-recommendation.route·config/env; 웹 `components/weather/*` 8 + WeatherPage(+test) + MyLocationChip; 앱 `components/weather/*` 5 + `lib/weatherGlyph.ts` + MyLocationCard; shared weather.api·useMyLocationGlance·weatherDaily |
| [`weatherRegions.ts`](../../packages/utils/src/weatherRegions.ts) | `WEATHER_MID_LAND_REGIONS`(10, `{regId,label,stnId}`)·`WEATHER_MID_NATION_STN_ID '108'`·`WEATHER_MID_SEA_REGIONS`(12)·`WEATHER_SIDOS`(17)·`WeatherSido`·`WeatherPlace`·`WEATHER_PLACES`(245)·`WEATHER_DEFAULT_PLACE_ID '11B10101'`·`weatherPlaceById`·`weatherMidLandRegionById`·`weatherMidRegionForPlace`·`weatherPlacesBySido`·`weatherDefaultPlaceOfSido`·`weatherPlaceLabel`·`nearestWeatherPlace`·`searchWeatherPlaces` | friendly probe-kma-api; 웹 WeatherPage·WeatherSeaSection·LifeGoToBox; 앱 weather/index·WeatherPlacePicker·WeatherSeaCard·LifeGoToModal·MyLocationCard |
| [`dateLabel.ts`](../../packages/utils/src/dateLabel.ts) | `todayKst`(= `kmaTodayIsoDate`) · `relativeDayLabel(ymd, todayYmd)` · `formatYmdWithWeekday(ymd)` | friendly probe-airkorea-api·airkorea-api.live.test; 웹 air 3 + weather 3 + AirQualityPage·WeatherPage; 앱 air 3 + weather 3 |
| [`lifeMap.ts`](../../packages/utils/src/lifeMap.ts) | `LIFE_MAP_LAYERS`·`LifeMapLayer`·`LIFE_MAP_LAYER_LABEL`·`isLifeMapLayer`·`LIFE_MAP_POINT_MIN_ZOOM`·`LIFE_MAP_POINTS_MAX` · CCTV `LIFE_CCTV_PURPOSES`(10)·`normalizeLifeCctvPurpose`·`parseLifeCctvPurposes`·`LIFE_CCTV_PURPOSE_GROUPS`(4)·`LIFE_CCTV_PURPOSE_GROUP_LABEL`·`lifeCctvPurposeGroup`·`lifeCctvPurposesOfGroup` · 화장실 `LIFE_TOILET_KINDS`(5)·`LIFE_TOILET_OPEN_TYPES`(5)·`normalizeLifeToiletKind`·`normalizeLifeToiletOpenType`·`lifeToiletOpen24`·`lifeToiletOpenLabel`·`LIFE_TOILET_FEATURES`(6)·`LIFE_TOILET_FILTER_KEYS`(5)·`LifeToiletFixtureCounts`·`summarizeLifeToiletFixtures` · 병의원 `LIFE_HOSPITAL_CATEGORIES`(7)·`normalizeLifeHospitalCategory`·`parseLifeHospitalCategories` · `formatLifeYm`·`formatLifeCount`·`lifeCountBucket` · `LIFE_CELL_ORIGIN`·`lifeCellSizeDeg` | friendly life-map 서비스 3(+테스트 2)·load-life-{cctv,toilets,hospitals}·probe-hira-api(+prisma 주석); 웹 `components/life-map/*` 8 + LifeMapPage + `stores/lifeMapPrefsStore`; 앱 life-map/index + `components/lifeMap/*` 6 + `lib/lifeMapPrefsStore`; shared life-map.api·useLifeMap |
| [`lifeMapMarker.ts`](../../packages/utils/src/lifeMapMarker.ts) | `LIFE_CCTV_GROUP_COLOR`·`LIFE_TOILET_COLOR`·`LIFE_HOSPITAL_COLOR`·`LIFE_LAYER_COLOR` · `buildLifeCctvDotSvg/DataUrl(group)`·`buildLifeCctvPinDataUrl(group)` · `buildLifeToiletMarkerDataUrl(selected)` · `buildLifeHospitalMarkerDataUrl(selected)` · `buildLifeCellMarkerSvg/DataUrl(layer, count)` | 웹 life-map 5 + `lifeMapMarkers.ts`; 앱 lifeMap 6(`lifeMapBridgeMarkers.ts` 포함) |
| [`foodTaxonomy.ts`](../../packages/utils/src/foodTaxonomy.ts) | `FOOD_DISH_TYPES`(19)·`FOOD_MAIN_INGREDIENTS`(13)·`FOOD_CUISINES`(7)·`FOOD_SOURCES`(6) + `*_LABEL` + `isFoodDishType`·`isFoodMainIngredient`·`isFoodCuisine` · `mfdsCategoryToDishType`·`hansikCategoryToDishType`·`rcpWayToDishType`·`menuCanonicalRootHint`(`FoodTaxonomyHint`) · `guessDishTypeFromName`·`guessMainIngredientFromName`·`guessCuisineFromName` | friendly food 5(import/classify/merge-conflict/service + import 테스트)·meal 3·meal-recommendation 2(+prisma 주석); 웹 AdminFoodPage·MealPage·MealRecommendTab; 앱 meal/[id]·MealItemRow·MealRecommendView |
| [`mealSlot.ts`](../../packages/utils/src/mealSlot.ts) | `MEAL_SLOTS`(5)·`MEAL_SLOT_LABEL`·`MEAL_SLOT_ORDER`·`MEAL_SLOT_DEFAULT_TIME` · `MEAL_TYPES`(5)·`MEAL_TYPE_LABEL` · `MEAL_PORTIONS`(3)·`MEAL_PORTION_FACTOR`·`mealPortionFactor`·`MEAL_PORTION_LABEL` · `MEAL_ITEM_SOURCES`(4) · `isMealSlot`·`isMealType` · `parseTimeOfDay`·`formatTimeOfDay` · `guessMealSlotFromHour`·`guessMealSlot` · `toLocalDateKey`·`toLocalMonthKey`·`parseLocalDateKey`·`dateKeyRange`·`monthRange`·`daysBetween`·`mealDateLabel` | friendly meal 5(service/preference/stats(+test)/insights)·meal-recognition·meal-recommendation 3·backfill-meal-nutrition; 웹 meal 3(+MealPage.test); 앱 `_layout`·meal 3 + `components/meal/*` 9 + `lib/mealReminders` |
| [`mealNutrition.ts`](../../packages/utils/src/mealNutrition.ts) | `MealNutritionItem`·`MealNutritionSummary`·`summarizeMealNutrition(items)`·`mealNutritionLabel(summary)` | 웹 MealPage; 앱 meal/[id]·MealEntryCard |
| [`reviewDate.ts`](../../packages/utils/src/reviewDate.ts) | `ReviewFetchedAt`·`ReviewRecencyLike`·`parseReviewVisitedAt(visitedAt, fetchedAt?)`·`compareReviewRecencyDesc(a, b)` | friendly restaurant.service(저장·업데이트 머지 정렬); 웹 ActiveJobPanel(크롤 SSE 로 도착한 리뷰를 기존 목록과 합쳐 정렬)·AdminCrawlTestPage(`[...fresh, ...prev]` 머지)·AdminRestaurantDetailPage — **서버·웹 어드민·SSE 머지가 같은 비교자** |
| [`aiModel.ts`](../../packages/utils/src/aiModel.ts) (확장) | 기존 `parseModelFamily`·`groupModelsByFamily`·`isVisionModel` + `recommendModelForPurpose(purpose: 'chat'|'image'|'log-analysis'|'meal-photo'|'meal-recommend', models)` + **`thinkOptionForModel(modelId): false | 'low'`** | friendly analytics·food-classify·meal-recognition·meal-recommendation·settlement-extraction 서비스 + probe-meal-vision; 웹 ModelPickerPopup·AdminAiKeysPage |

세부 계약(신규):
- `airGradeFromValue(pollutant, value)` — `value <= good → 1`, `<= normal → 2`, `<= bad → 3`, 초과 4; null/NaN/음수 → null. `formatAirValue` 는 항목별 `digits`(ppm 3~4자리, ㎍/㎥·지수 정수), 결측 `'-'`.
- `airDataTimeToIso("2026-08-20 24:00") → "2026-08-21T00:00:00+09:00"`(UTC 산술로 일자 이월), `formatAirHourLabel` 은 `24:00` 을 `"24시"` 로 남겨 축에서 하루 경계를 드러낸다.
- `parseAirDustImage` — `…PM10.1hsp.2026082103.png` → `{pollutant:'PM10', at:'8/21 03시', animated:false}`, `.2days.ani.gif` → animated. 디렉터리로 끝나는 빈 슬롯(imageUrl8/9 실측)·비 http 는 null.
- `latLngToKmaGrid(lat, lng)` — 기상청 공식 LCC(RE 6371.00877 km / GRID 5 km / SLAT1 30° / SLAT2 60° / OLON 126° / OLAT 38° / XO 43 / YO 136). `kmaGridToLatLng` 는 역변환(격자점 중심).
- `kmaVilageBase(now)` — `minuteOfDay >= h*60+10` 인 가장 늦은 h(02·05·…·23); 02:10 전은 **전날 23시**. `kmaPrevBase('vilage')` 는 3시간, ncst/ultra 는 1시간 앞. `kmaNextBaseAvailableAt` 이 서버 캐시 TTL 의 근거.
- `parseKmaPrecipText` — `"강수없음"/"0"` → `{value:0, none:true}`, `"1mm 미만"` → 0.5, `"30.0~50.0mm"` → 30(하한), `"50.0mm 이상"` → 50, 결측 → `{text:'-', value:null}`.
- `kmaCondition(sky, pty)` — PTY 1 rain / 2·6 sleet / 3 snow / 4 shower / 5 drizzle / 7 flurry 가 우선, 없으면 SKY 1 clear / 3 partly / 4 cloudy, 그 외 unknown. `kmaConditionFromText` 는 소나기 → 비/눈 → 눈 → 비 → 흐림 → 구름 → 맑음 순.
- `nearestWeatherPlace(lat, lng)` — 245 지점 haversine 전수 스캔, `{ place, distM }` 반환(화면이 "○○ 기준 (1.2km)" 표기). 광역시 안은 구·군 행이 촘촘해 위성도시 청사로 새는 일이 드물다.
- `lifeCellSizeDeg(zoom)` — `dLng = 360 / 2^floor(zoom) / 4`, `dLat = dLng × 0.8`, 줌 0~22 클램프. `formatLifeCount(1234) → '1.2천'`, `12345 → '1.2만'`, `123456 → '12만'`. `lifeCountBucket`: `<10 → 0`, `<100 → 1`, `<1000 → 2`, 그 외 3.
- `normalizeLifeHospitalCategory` — 상급종합(병원)/종합병원 → 종합병원, 병원·요양병원·정신병원 → 병원, 치과병원·치과의원 → 치과, 한방병원·한의원 → 한방, 보건소·보건지소·보건진료소·보건의료원 → 보건기관, 의원 → 의원, 그 외 기타.
- `guessMealSlotFromHour(h)` — 5~10 breakfast / 11~14 lunch / 17~21 dinner / 22~4 late_night / 15~16 snack. `mealDateLabel` — 0 '오늘' / 1 '어제' / 2 '그저께' / 3~6 'N일 전' / 그 외 'M월 D일'. `dateKeyRange` 상한 400일, 역순은 빈 배열.
- `summarizeMealNutrition` — `kcal` 이 null/undefined 인 항목은 제외(`counted` 만 증가), `proteinG`/`sodiumMg` 는 `?? 0`; `isMain !== false` 를 주식으로. `mealNutritionLabel` — `counted < total` 이면 `"약 N kcal · T개 중 C개 반영"`, `hasEstimate` 면 `"(추정)"`, `hasMain && countedMain === 0` 이면 null.
- `parseReviewVisitedAt` — `^(\d{4})[-./](\d{1,2})[-./](\d{1,2})` / `YYYY년 M월 D일` / `YY.M.D` / `M.D`(fetchedAt 필수 — KST 연도, 기준일보다 미래면 전년) → `Date.UTC` 자정 ms, 무효 날짜 null. `compareReviewRecencyDesc` — 방문일 있는 쪽 우선·내림차순, 둘 다 없으면 `fetchedAt` 내림차순.
- `thinkOptionForModel` — family(`:` 앞, 소문자)가 `gpt-oss` 로 시작하면 `'low'`, 그 외 `false`. JSON 을 뽑는 호출(추출·인식·분류·추천)이 그대로 싣는다.

### 기존 모듈(변경 없음 — 요약)

[`format.ts`](../../packages/utils/src/format.ts) — *truncate/capitalize/slugify 는 참조 0건으로 삭제(91eff7d)*:
- `formatWonPrice(price: string | null | undefined): string | null` — (078cbe1). 빈/falsy → `null`. 단일 숫자(`12000` / `12,000원` / `₩12000`) → `12,000원`. 범위(`12000~18000`, `12,000 - 18,000원`, `–`/`—` 구분자 포함) → `12,000원 ~ 18,000원`. 혼합 텍스트는 안에 등장한 `숫자+원` 패턴만 콤마로 재포맷. 0 이하 / 숫자 외 입력은 원문 그대로 보존
- `formatDistanceM(m: number): string` — 정수 m 가정(서버 dist 계약), 대중교통·스마트픽 거리 표기 (c6ac5ba — 6곳 복제 제거)
- `formatRelativeMin(iso, nowMs?)` / `formatRelativeSec(iso, nowMs?)` — 상대 시각 표기. nowMs 기본 인자로 웹(Date.now 내장)·앱(주입) 시그니처 차를 흡수
- `remainSecSince(receivedAt, remainSec, nowMs?)` / `formatCountdown(sec)` — 도착 카운트다운(수신 시점 보정). 하차 알림·SubwayArrivalPanel 공용 (ddb2a8e)

[`geo.ts`](../../packages/utils/src/geo.ts) (+[`geo.test.ts`](../../packages/utils/src/geo.test.ts)):
- `interface LatLng { lat: number; lng: number }`
- `interface Bbox { minLng: number; minLat: number; maxLng: number; maxLat: number }`
- `computeBboxAround(center: LatLng, radiusKm: number): Bbox` — 정사각 근사
- `formatBbox(b: Bbox): string` — bbox → `minLng,minLat,maxLng,maxLat` 쿼리 문자열(toFixed 5). 웹·앱 지도/스마트픽 + 일상지도 `lifeMapApi.points` 공용 (f293a3c)
- `isInKorea(coords: LatLng): boolean` — vworld 타일 가드
- `approxDistanceM(a, b)` — 등거리 사각 근사(도시 스케일 판정용, 하버사인과 1% 내) / `haversineM(a, b)` — 측지 거리(asin 클램프)
- `roundCoord(n)` — 소수 5자리 반올림 / `parseLatLngParam(raw)` — `lat,lng` 파싱 + 한국 WGS84 범위 가드(lat 33~39, lng 124~132)

[`busArrival.ts`](../../packages/utils/src/busArrival.ts):
- `isBusArrivalImminent(msg)` — "곧 도착" 판정(4곳 흩어짐 통일, null/undefined → false)
- `parseBusArrivalSec(msg)` — `'N분후[…]'` 를 분 해상도 초로 파싱 — 하차 알림의 실측 예약 근거

[`subwayTimetable.ts`](../../packages/utils/src/subwayTimetable.ts) — 웹·앱 timetableUtils 복사본의 승격(2507cdc, +test 9):
- `dayTypeForToday()` / `parseTimeMin(hhmmss)`(자정 넘김 24+ 단조성) / `formatHHMM` / `lastTrainRemainMin`(24+ 축 보정) / `arrivalUpdnToTimetable`(updn 매핑) / `isSubwayExpressTag`(EXPRESS_YN 'D'=급행) / `updnLabel`

[`subwayCongestion.ts`](../../packages/utils/src/subwayCongestion.ts) — 혼잡도 임계/슬롯/방향 매칭(9206346, +test 7). 구조적 `CongestionDirectionLike` + 제네릭(api-contract 타입 미참조).

[`random.ts`](../../packages/utils/src/random.ts):
- `pickRandom<T>(items: readonly T[]): T` — 빈 배열 시 throw
- `shuffle<T>(items: readonly T[]): T[]` — Fisher-Yates, 입력 비변경

[`markerFrame.ts`](../../packages/utils/src/markerFrame.ts) — 식당·버스·지하철·대기·일상지도 공용 프레임:
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

[`busMarker.ts`](../../packages/utils/src/busMarker.ts) — 버스 도메인 마커:
- `buildBusStopMarkerSvg(selected: boolean): string` / `buildBusStopMarkerDataUrl(selected)` — 정류장 마커. selected = 파랑 핀(`#1d4ed8`), 비선택 = 파랑 원(`#2563eb`). 버스 실루엣 아이콘을 markerFrame 프레임에 얹음(식당과 같은 규격 → 라벨 offset 재사용). 파랑 톤이라 식당(빨강)·등록됨(회색)과 즉시 구분
- `interface BusVehiclePillOptions { label: string; color: string; stopped?: boolean; highlighted?: boolean }`
- `buildBusVehiclePillSvg(options): string` / `buildBusVehiclePillDataUrl(options)` — 실시간 차량 알약(stadium 말풍선 + 노선번호). 꼬리 끝이 정차 좌표를 가리키게 아래 절반을 투명 여백으로 채워 세로 중앙 anchor 와 정합. `stopped` = 정차 후광 1겹, `highlighted` = 따라가는 버스 강조(흰 링 + 옅은 확산, 정차 후광과 독립 레이어). 정류장과 형태가 완전히 달라 노선색이 겹쳐도 안 헷갈림. 라벨 비우면 색 알약만 (`vehiclePill` 위임)
- `buildBusVehicleDirSvg(color: string): string` / `buildBusVehicleDirDataUrl(color)` — 차량 진행 방향 다트(16×16, 북 기준·지도 레이어가 방위각만큼 회전). 노선색 채움 + 흰 외곽선, 알약보다 아래 zIndex
- `buildMyLocationMarkerSvg(): string` / `buildMyLocationMarkerDataUrl()` — 내 위치 파란 점(26×26, 후광 → 흰 링 → 파란 점). 선택 개념 없어 1종, 정류장 규격 공유
- `buildBusRouteStopDotSvg(color: string): string` / `buildBusRouteStopDotDataUrl(color)` — 노선 형상 위 경유 정류소 점(16×16, 노선색 + 흰 링). 정류장 핀보다 의도적으로 작아 105개가 깔려도 과밀 안 함
- `busRouteTypeColor(routeType: string): string` — 서울시 routeType 코드→대표색. `1` 공항 하늘 / `2` 마을 연두 / `3` 간선 파랑(`#2563eb`, 정류장 톤과 일치) / `4` 지선 초록 / `5` 순환 노랑 / `6` 광역 빨강 / 그 외 회색. 폴리라인·경유지 점이 같은 색을 씀

[`subwayLine.ts`](../../packages/utils/src/subwayLine.ts) / [`subwayMarker.ts`](../../packages/utils/src/subwayMarker.ts) / [`subwayPosition.ts`](../../packages/utils/src/subwayPosition.ts) / [`vehiclePill.ts`](../../packages/utils/src/vehiclePill.ts) — 2026-07-07 문단 참조(`SUBWAY_LINES`, 역/경유역/열차 마커, `locateTrain`/`TRAIN_STATUS_FRACTION`/`sliceForMove`/`subwayDestinationLabel`/`normalizeStationName`, `buildVehiclePillSvg/DataUrl`·`buildVehicleDirSvg/DataUrl`).

[`routePath.ts`](../../packages/utils/src/routePath.ts) — 노선 형상 투영/보간(`geo.ts` `LatLng` 참조):
- `interface RoutePathIndex { points: LatLng[]; xs/ys/cum: Float64Array; totalM: number }` — 평면 근사 좌표(기준점 등거리 사각 근사, m) + 누적 호길이(arc-length) 캐시
- `createRoutePathIndex(points: LatLng[]): RoutePathIndex | null` — 점 2개 미만이면 null(호출자가 직선 폴백). 기준점 = `points[0]`, cos 위도 보정 고정
- `projectOnRoutePath(index, p: LatLng, sMinM = 0, sMaxM = Infinity): { s: number; distM: number }` — 점 `p` 를 형상 위로 투영. `[sMinM, sMaxM]` 호길이 윈도우와 겹치는 세그먼트만 후보 — 왕복 한 줄 형상의 상/하행 모호성을 호출자(sectOrd·정류소 seq)가 윈도우로 좁혀 해소. `distM` 임계 초과면 '형상 밖'
- `pointAtRoutePathS(index, sM: number): LatLng` — 호길이 `s` 지점 위경도(세그먼트 내 선형 보간, cum 이진탐색)
- `bearingAtRoutePathS(index, sM: number): number | null` — `s` 지점 전진 방위각(도, 북=0 시계방향). 정차 중이어도 '앞으로 갈 방향'. 세그먼트 전부 0길이면 null → 차량 방향 다트 회전각
- `sliceRoutePath(index, s0M, s1M): LatLng[]` — `[s0, s1]` 구간 웨이포인트(보간 양끝 + 사이 원본 점). `s0 > s1`(후진/왕복 랩)은 호출자가 걸러 직선 폴백

[`thumbnail.ts`](../../packages/utils/src/thumbnail.ts):
- `reviewThumbnailUrl(originalUrl: string, width = 300, quality?: number): string` — friendly의 `/api/v1/media/thumbnail?url=…&w=…&q=…` 프록시 URL을 빌드(`*.pstatic.net` 절대 URL 만; 상대경로·비네이버 호스트는 원본 통과). FE가 직접 query string을 조립하지 않게 중앙화

## Data [coverage: low — 0 sources]

상태/저장소 없음 — 순수 함수만. 유일한 "데이터"는 코드에 박힌 정적 표: `weatherRegions.ts` 의 지점 245행·구역 22행, `airQuality.ts` 의 등급 구간표·시도 17·권역 순서 21, `lifeMap.ts` 의 코드표, `foodTaxonomy.ts` 의 분류 매핑(25+25+12+15) + 이름 규칙(21+12+6), `subwayLine.ts` 의 노선 상수. 모두 소스 변경 → 재배포로만 갱신된다(DB/원격 설정 없음).

## Key Decisions [coverage: high — 14 sources]

- **2026-08-30 병의원 레이어는 종별 15종 → 7종 단색 마커(`4fd6e22`)** — CCTV 처럼 그룹색을 더 얹으면 한 화면 색이 8개를 넘어 팔레트 전 쌍 분리가 깨진다. 청록(`#00897b`) 한 색 + 십자 아이콘으로 두고, 분홍(화장실)과는 색상, 초록(CCTV 점)과는 마커 형태(26px 원 vs 12px 점)로 가른다. 원문 종별(`kindName`)은 상세에만 보여 준다.
- **2026-08-23 영양 합계는 "값이 있는 항목만" 더하는 과소평가 + 그 사실을 문구로 드러낸다(`29fac09`·`59c2ae1`)** — 카탈로그 영양 커버리지가 100% 가 아니라(활성 3,876종 중 62%) 없는 값을 0 으로 채우면 "안 먹었다"는 뜻이 된다. 그래서 `counted/total` 을 같이 돌려주고, 주식이 있는데 곁들임만 반영되면(실측: 양념치킨+단무지+맥주에서 "약 2kcal") 합계를 아예 숨긴다.
- **2026-08-22 utils 의 키 목록은 api-contract zod enum 과 이중 정의하되 "같은 순서" 계약으로 묶고 friendly 테스트가 검증한다(`102ccdb`·`c5b5fe2`)** — utils 는 leaf 라 api-contract 를 import 할 수 없고, api-contract 가 utils 를 의존하면 그래프가 한 단계 깊어진다. 라벨·정규화·추정 규칙(순수 함수)은 utils, 검증(zod)은 api-contract 로 역할을 나누고 값의 동일성만 테스트로 잠근다. `aiModel.ModelPurpose` 도 같은 이유로 리터럴 유니온을 다시 적었다.
- **2026-08-22 vision 판별은 이름 휴리스틱 + 카탈로그 기반 계열표, 사고(think)는 JSON 호출에서 끈다(`cc8399a`·`5cdbc0f`)** — Ollama Cloud 카탈로그(2026-08-22)의 gemma4·qwen3.5·kimi·llama4 등은 이름에 vl/vision 이 없어도 이미지를 받는다 → `MULTIMODAL_FAMILY_RE`(family 접두, `gemma4x` 처럼 뒤에 글자가 이어지면 다른 계열). `thinkOptionForModel` 은 실측(qwen3.5:397b 가 think 미지정 시 content 빈 문자열, gpt-oss 는 끄기 불가·`'low'` 만 수용, gemma4·kimi-k3·deepseek-v4-pro 는 `false` 안전)에 근거해 **모르는 모델에도 `false`** 를 보낸다.
- **2026-08-22 날씨·대기 날짜 라벨을 `dateLabel.ts` 로 공용화, Intl 없이 KST(`e348032`)** — 앱 화면이 붙으며 '오늘/내일/모레'·"8/21 (목)" 문구가 웹·앱 두 벌이 될 뻔했다. `todayKst` 는 `weather.kmaTodayIsoDate`(UTC ms + 9h 산술) 재수출 — Hermes 에서 `Intl.DateTimeFormat(timeZone)` 에 기대지 않는다.
- **2026-08-21 일상지도 저줌 집계 셀은 전국 고정 원점 + 타일 1/4 크기, 서버·클라가 같은 함수(`1d92acb`)** — 셀 한 변 = 웹 메르카토르 타일(256px)의 1/4 라 어느 줌에서나 화면 ~64px 격자, 위도 방향 0.8배(≈cos 37°)로 정사각 근사, 원점 33°N/124°E 고정이라 패닝해도 셀 경계가 흔들리지 않는다. 서버 GROUP BY·캐시 키와 클라 버블 마커가 `lifeCellSizeDeg` 하나를 공유해 어긋날 여지를 없앴다. 점 표시 최소 줌(`{cctv 15, toilet 13, hospital 14}`)은 밀도 실측(CCTV ≈100개/km², 화장실 ≈9, 병의원 ≈33)으로 요청당 4,000점 상한 안에 들어오도록 정했다.
- **2026-08-21 CCTV 범례는 4그룹으로 접고 필터는 원본 10종을 유지(`1d92acb`)** — 지도 점은 색 하나로 구분돼야 하는데 범주색은 4개까지만 전 쌍이 읽힌다(팔레트 검증 `scripts/validate_palette.js`, CVD 포함). 그룹색 4 + 화장실 1 = 5색이 라이트 표면에서 검증을 통과한 조합이라 `lifeMapMarker` 에 상수로 박았다.
- **2026-08-21 기상청 격자·발표 시각·코드표를 utils 에 두어 서버 캐시 TTL 과 클라 표시가 같은 산술을 쓴다(`37e0db0`)** — `kmaNextBaseAvailableAt`/`kmaNextMidTmFcAt` 가 friendly 캐시 만료의 근거이고 `kmaVilageBase`/`kmaPrevBase` 가 NO_DATA 폴백 슬롯을 정한다; 같은 함수가 웹·앱의 "8/21 15:00 발표" 라벨을 만든다. KST 산술은 한국에 DST 가 없어 "UTC ms + 9시간 → getUTC*" 로 충분하다는 판단.
- **2026-08-21 날씨 지점은 시·군 171 + 광역시 구·군 74 = 245, 구·군은 소속 광역시의 중기기온 지점을 빌린다(`7704f8c`)** — 구·군에는 중기예보 코드가 없다. 대기질 측정소·내 위치와 지점 단위를 맞추려 구·군 행(시·군청/구청 좌표, VWorld 검색 + ±1km 수동 보정)을 더하고 `taRegId` 만 광역시 것을 공유. 군위(`11H10603`, 2023 대구 편입 NO_DATA)·순천시 중복 코드·강화(인천 구·군 행으로 편입)는 제외.
- **2026-08-21 대기 등급 구간표와 색을 utils 에, 마커는 markerFrame 규격(`7340743`·`c6ac640`)** — 서버가 등급 없는 행(과거 시계열·결측 복원·일평균)의 등급을 만들고 웹·앱이 색을 칠하는데 표가 두 벌이면 같은 값이 다른 색이 된다. `AIR_GRADE_HEX` 는 항상 등급 글자와 함께 쓴다(색만으로 뜻을 전하지 않음). 측정소 마커는 등급×선택 10종뿐이라 호출처가 모듈 레벨에서 미리 만들어 OL 아이콘 캐시를 탄다.
- **2026-08-17 리뷰 방문일의 연도 생략은 수집 시각의 KST 연도로 복원한다(`0d72380`)** — Naver 는 올해 리뷰에서 연도를 생략(`8.15.토`)해 문자열 정렬로는 업데이트 배치끼리 최신순이 깨졌다. 기준 시각을 KST 로 옮긴 뒤 UTC getter 로 읽어 런타임 타임존과 무관하게 연/월/일을 얻고, 1월 크롤의 `12.31` 처럼 미래로 해석되면 전년으로 보정. 파싱 실패는 `fetchedAt` 폴백 정렬.
- **순수 함수만** — 상태/IO 있는 헬퍼는 여기 들어오지 않는다 ([shared](shared.md) 또는 앱 내부로). 도메인 로직(`reviewThumbnailUrl`처럼 friendly URL을 알고 있는 함수, `buildRestaurantMarkerSvg`/`buildBusVehiclePillSvg`처럼 SVG 문자열을 빌드하는 함수, `projectOnRoutePath`처럼 기하 계산만 하는 함수, `kmaVilageBase`처럼 시각 산술만 하는 함수)은 "문자열/수치만 만든다"는 순수성 한도 내에서만 허용. 2026-08 신규 11개 모듈 전부 DOM/RN/네트워크 import 0 을 유지.
- **외부 의존 0** — 가벼운 leaf 패키지로 유지해 트리 셰이킹/배포 부담 최소화. 마커 빌더는 순수 문자열 concat, `routePath` 는 `Float64Array` + 기본 산술, `weather` 는 `Math` 삼각함수만(측지·시간대 라이브러리 없음).
- **카테고리 매핑을 utils 에** — 웹(`apps/web`)·앱(`apps/mobile`) 양쪽 지도 마커가 같은 정규화 룰 + 동일 아이콘 세트를 써야 디자인 일관성 유지. 한쪽 앱에 두면 다른 쪽이 dup 매핑을 만들기 쉬워 utils 의 leaf 위치가 적합. 백엔드 category 필드가 자유 문자열이라 정규식 contains 매칭 — enum 화는 백엔드 데이터 정리 후로 미룸
- **마커 프레임을 `markerFrame.ts` 로 추출 — 식당·버스 골격 단일화(→ 지하철·대기·일상지도까지 5도메인)** — 두 도메인 마커의 핀(32×48)/원(26×26) SVG 골격이 문자 단위로 같았어서, 프레임을 `buildPinMarkerSvg`/`buildCircleMarkerSvg` 로 뽑고 각 도메인은 안쪽 아이콘/색만 채운다. 새 마커 종류가 늘어도 anchor·라벨 offset·`SMALL_ICON_SCALE` 규격이 프레임 한 곳에서 강제 공유돼 [map](map.md) MapCanvas 와 어긋날 여지가 준다. 추출 시 **76개 마커 조합 바이트 동일 검증**으로 회귀 0 확인(커밋 `a9c1fe4`). 2026-08 의 `airMarker`·`lifeMapMarker`(화장실·병의원 원/핀, CCTV 선택 핀)도 같은 프레임을 썼다.
- **노선 형상 계산은 평면 근사 + 호길이(arc-length) 모델** — `routePath.ts` 가 위경도를 기준점 등거리 사각 근사로 평면(m) 변환해 투영/보간. 노선 규모(수십 km)에서 Haversine 급 정밀도가 불필요하고, 좌표만으로 상/하행이 모호한 왕복 한 줄 형상은 **호길이 윈도우를 호출자가 넘겨** 해소하는 계약(라이브러리는 sectOrd/정류소 seq 를 모르므로 순수 기하만 제공, 도메인 판단은 호출자). `bearingAtRoutePathS` 가 정차 중에도 전진 방향을 돌려줘 차량 방향 다트가 항상 '갈 방향'을 가리킴
- **빌드 없음** — `src/*.ts`를 직접 export. tsx (friendly), Vite (web), Metro (mobile) 모두 그대로 처리
- **서브패스 export** — 트리셰이킹 안 되는 컨슈머도 `@repo/utils/random`만 가져갈 수 있음 (단 `format`/`random` 2종 외 26개 모듈은 서브패스 미등록)
- **원화 포맷 통일** — 메뉴 가격은 백엔드/크롤러가 `12000`, `12,000원`, `12000~18000` 등 자유 입력 — `formatWonPrice` 한 함수로 통일해 웹/앱이 같은 표기 (콤마 + `원` + 범위는 `~` 구분자). 파싱 실패는 원문 보존 — 절대 빈 문자열로 변질되지 않음

## Gotchas [coverage: high — 14 sources]

- **utils 와 api-contract 의 enum 목록은 두 곳에 있다 — 한쪽만 고치면 friendly 테스트가 잡는다** — `MEAL_SLOTS`/`MEAL_TYPES`/`MEAL_PORTIONS`/`MEAL_ITEM_SOURCES`, `FOOD_DISH_TYPES`/`FOOD_MAIN_INGREDIENTS`/`FOOD_CUISINES`/`FOOD_SOURCES`, `aiModel.ModelPurpose` 는 `@repo/api-contract` 의 zod enum/`LlmProviderPurpose` 와 값·순서가 같아야 한다. 값을 추가할 땐 utils 배열·라벨 + api-contract enum + (필요시) Prisma 컬럼 주석을 함께 바꾸고 friendly `food`/`meal` 테스트를 돌린다.
- **`lifeCellSizeDeg`·`LIFE_CELL_ORIGIN`·`LIFE_MAP_POINT_MIN_ZOOM`·`LIFE_MAP_POINTS_MAX` 는 서버 GROUP BY·캐시 키·응답 상한과 짝** — 클라만 바꾸면 버블이 서버 셀과 어긋나거나(경계 흔들림), 점 표시 줌을 낮추면 요청당 상한(4,000)에 걸려 `truncated` 안내가 잦아진다. 바꾸면 friendly life-map 서비스와 동시 배포.
- **`weather.ts` 시각 산술은 KST 고정(DST 없음 전제)** — `kstParts` 가 "UTC ms + 9h" 로 계산하므로 한국 밖 시간대나 DST 가 있는 지역엔 못 쓴다. 발표 슬롯 경계(`:10`/`:45`/`02·05·…·23시 +10분`, 중기 06/18시)는 기상청 제공 시각 규정이라 규정이 바뀌면 함수도 바꿔야 한다(`weather.test.ts` 가 경계를 고정).
- **`kmaFcstTimeToIso` 의 `"2400"` 방어는 실측상 오지 않는 값** — 실측은 익일 `"0000"`. 방어 분기가 있지만 서버 정규화가 먼저 처리하므로 클라가 의존하지 말 것.
- **`isVisionModel` 의 멀티모달 계열표는 Ollama Cloud 카탈로그(2026-08-22) 스냅샷** — 새 멀티모달 모델이 이름에 vl/vision 없이 나오면 텍스트 모델로 오판돼 `meal-photo`/`image` 추천에서 빠진다. 목록(`MULTIMODAL_FAMILY_RE`)과 `aiModel.test.ts` 를 함께 갱신. `thinkOptionForModel` 은 gpt-oss 외 전부 `false` 라, 사고를 못 끄는 새 계열이 나오면 content 가 비는 실측을 다시 해야 한다.
- **`AIR_SIDO_OPTIONS` 의 `'전남광주'` 는 업스트림 어휘** — 2026-07 행정통합 이후 에어코리아가 두 지역을 한 라벨로 내려주고 개별 '광주'/'전남' 조회는 게이트웨이 타임아웃이 잦다. `airSidoMatches` 가 포함 매칭으로 구 라벨도 받지만, 새 통합 지역이 생기면 옵션·매칭 둘 다 손봐야 한다.
- **`airDataTimeToIso` 는 `24:00` 을 익일 `00:00` 로 넘기지만 `formatAirHourLabel` 은 `"24시"` 를 그대로 둔다** — 전자는 저장/정렬용, 후자는 축 라벨용으로 의도가 다르다. 같은 dataTime 이 "8/20 24시" 와 "2026-08-21T00:00" 두 얼굴을 가지니 비교할 땐 ISO 쪽을 쓴다.
- **`nearestWeatherPlace` 는 행정경계가 아니라 청사 좌표 최근접** — 경계 근처(예: 구 경계)에선 이웃 구·군으로 잡힐 수 있고, 도(道) 지역은 시·군청 간격이 넓어 수 km 오차가 흔하다. 화면은 반드시 `distM` 을 같이 보여 준다("○○ 기준 (1.2km)").
- **`WEATHER_PLACES` 의 구·군 id 는 `${taRegId}-${이름}` 합성** — URL `?p=` 와 저장값에 그대로 쓰이므로 이름을 고치면 저장된 지점이 `weatherPlaceById` 에서 null 이 된다(기본 지점 서울로 폴백).
- **`mealSlot` 날짜 키 헬퍼는 호출 런타임의 로컬 타임존** — `toLocalDateKey`/`guessMealSlot` 이 `getHours`/`getDate` 를 쓴다(자정 근처 기록이 UTC 변환으로 하루 밀리지 않게 한 의도). 서버 프로세스에서 쓰면 서버 TZ 에 묶이니 사용자 시각 기준이 필요하면 클라이언트가 만든 키를 받는다.
- **`formatTimeOfDay(25*60+10) → '01:10'`** — 야식 중앙값이 24시를 넘겨 나오면 되감는다(의도). 다음날 표기가 필요하면 호출자가 따로 표시.
- **`summarizeMealNutrition` 은 `kcal` 유무로만 "값 있음"을 판정** — kcal 없이 protein/sodium 만 있는 항목은 통째로 제외된다. `isMain` 을 안 넘기면 전부 주식으로 본다(기존 호출부 호환).
- **`foodTaxonomy` 이름 규칙은 순서가 우선순위** — 앞의 정규식이 먼저 매칭되므로 새 키워드는 더 구체적인 것을 위에 둔다(예: `순두부` 는 찌개 규칙이 두부 규칙보다 먼저). `categoryKey` 가 공백·가운뎃점·쉼표·괄호를 지우므로 매핑 표의 키도 그 형태(`전적및부침류`)로 적는다.
- **`parseReviewVisitedAt` 의 `M.D` 형식은 `fetchedAt` 이 없으면 null** — 수집 시각 없이 호출하면 연도 없는 리뷰가 전부 정렬 꼴찌(수집 시각 폴백도 없음)로 밀린다. `compareReviewRecencyDesc` 에 넘기는 객체엔 `fetchedAt` 을 꼭 채운다.
- 새 헬퍼 모듈 추가 시 [`index.ts`](../../packages/utils/src/index.ts) 배럴에 `export *`를 빠뜨리기 쉬움 — 현재 28개 모듈 전부 등록됨(`dateLabel` 처럼 재수출만 하는 얇은 모듈도 포함).
- 새 모듈을 서브패스로 노출하려면 [`package.json`](../../packages/utils/package.json) `exports` 맵도 추가해야 함 — 현재 등록은 `format` / `random` 2종뿐, 나머지는 배럴 경유만 가능. **파일을 지울 땐 exports 맵도 같이** — date.ts 삭제 때 `./date` 항목이 남아 죽은 서브패스로 한 달 방치됐다(bb07762 에서 제거)
- **`markerFrame.ts` 의 수치를 바꾸면 마커가 좌표에서 어긋난다** — 핀 32×48/원 26×26/scale 0.667/offset 은 [map](map.md) MapCanvas 의 anchor·라벨 offset·`SMALL_ICON_SCALE` 과 짝. 프레임만 고쳐도 식당·버스·지하철·대기·일상지도 마커가 동시에 밀리므로 반드시 MapCanvas 와 함께 조정. `innerSvg` 아이콘은 24×24 viewBox 를 전제(다른 크기 조각을 넣으면 16×16 영역을 벗어남). CCTV 12px 점과 집계 버블은 프레임 밖 자체 규격(MapCanvas `fixedScale` 마커).
- **`busMarker`·`airMarker`·`lifeMapMarker` 아이콘 조각도 24×24 viewBox·`fill=none`/흰 stroke 규격** — markerFrame 이 흰색 stroke 라인으로 감싸므로, 새 아이콘을 넣을 때 규격을 안 맞추면 프레임 안에서 색이 뭉개진다(식당 `ICON_PATHS` 와 동일 제약). 단 차량 알약(`buildBusVehiclePillSvg`)은 프레임을 안 쓰는 자체 SVG라 이 규격과 무관
- **`routePath` 의 상/하행 모호성은 라이브러리가 안 풀어준다** — 서울시 형상은 왕복이 한 줄(첫점≈끝점)이라 좌표만 주면 상행·하행 두 후보가 생긴다. `projectOnRoutePath` 에 `sMinM`/`sMaxM` 윈도우를 안 넘기면(기본 `0..Infinity`) 전체가 후보라 반대 방향에 붙을 수 있음 — 호출자가 sectOrd/정류소 seq 로 호길이 윈도우를 좁혀 넣는 게 계약. `sliceRoutePath` 에 `s0 > s1` 을 넘기면 빈 구간에 가까운 결과 → 호출자가 직선 폴백해야 함
- **`routePath` 평면 근사는 짧은~중거리 전용** — 기준점 cos 위도 보정을 노선 전체에 고정하므로 수백 km 급이면 오차가 커진다(서울시 노선 규모에선 무해). 한국 밖·초장거리 형상에 재사용하려면 재검토
- `pickRandom`은 빈 배열 시 throw — 호출자가 사전 체크 필요
- `Math.random()` 사용 — 암호학적 안전성이 필요하면 `crypto.getRandomValues()` 기반 별도 헬퍼를 추가할 것 (현재는 Pick 추첨용으로 충분)
- `reviewThumbnailUrl`은 절대 URL이 아닌 path만 반환 — 다른 origin에서 호출한다면 base URL을 별도로 prepend해야 함
- `resolveRestaurantCategoryKey` 의 키워드 테이블에 새 카테고리 enum 을 추가했다면 `ICON_PATHS` (라인 아이콘) 도 같이 추가해야 — 매핑은 성공하는데 아이콘이 없으면 TS 타입 에러로 빌드 시점에 잡히긴 하지만 runtime 색만 보이고 모양은 GENERIC 으로 떨어지는 실수 가능
- 카테고리 매칭 우선순위는 정규식 순서 의존 — `bar > dessert > cafe > japanese > chinese > western > snack > korean`. 새 키워드 추가 시 더 specific 한 것을 위로 둬야 (예: "이자카야" 가 일식보다 술집으로 잡혀야 함)
- `formatWonPrice` 의 범위 구분자는 `~|〜|-|–|—` 만 인식 — `to`, `→` 등은 단일 숫자/혼합 텍스트 분기로 빠짐. 백엔드/크롤러가 다른 구분자를 쓰기 시작하면 정규식 보강 필요

## Sources [coverage: high — 46 sources]

- [packages/utils/package.json](../../packages/utils/package.json) — exports 맵(`.`/`./format`/`./random`), devDeps 만
- [packages/utils/tsconfig.json](../../packages/utils/tsconfig.json)
- [packages/utils/vitest.config.ts](../../packages/utils/vitest.config.ts) — 순수 함수 단위 테스트(.js→.ts extensionAlias)
- [packages/utils/src/index.ts](../../packages/utils/src/index.ts) — *modified: reviewDate/airQuality/airMarker/weather/dateLabel/weatherRegions/lifeMap/lifeMapMarker/foodTaxonomy/mealNutrition/mealSlot re-export 추가(28 모듈)*
- [packages/utils/src/aiModel.ts](../../packages/utils/src/aiModel.ts) — *modified: isVisionModel 멀티모달 계열표, 용도 meal-photo/meal-recommend, thinkOptionForModel*
- [packages/utils/src/aiModel.test.ts](../../packages/utils/src/aiModel.test.ts) (NEW 24차) — 계열 파싱·그룹·vision 판별·용도 추천·think 옵션 16건
- [packages/utils/src/airQuality.ts](../../packages/utils/src/airQuality.ts) (NEW 24차) — 에어코리아 CAI 등급·색·파서·시도 어휘
- [packages/utils/src/airQuality.test.ts](../../packages/utils/src/airQuality.test.ts) (NEW 24차) — 등급 경계·텍스트 파서·권역 문자열·24:00·이미지 URL·시도 매칭 21건
- [packages/utils/src/airMarker.ts](../../packages/utils/src/airMarker.ts) (NEW 24차) — 측정소 마커(등급색×선택) + 저장 위치 점
- [packages/utils/src/busArrival.ts](../../packages/utils/src/busArrival.ts) — 곧 도착 판정 + 도착 메시지 초 파싱
- [packages/utils/src/busMarker.ts](../../packages/utils/src/busMarker.ts)
- [packages/utils/src/dateLabel.ts](../../packages/utils/src/dateLabel.ts) (NEW 24차) — 예보 화면 공용 날짜 라벨(웹 airGrade.ts 에서 승격, `e348032`)
- [packages/utils/src/foodTaxonomy.ts](../../packages/utils/src/foodTaxonomy.ts) (NEW 24차) — 음식 분류 축 + 원본 분류 매핑 + 이름 규칙
- [packages/utils/src/foodTaxonomy.test.ts](../../packages/utils/src/foodTaxonomy.test.ts) (NEW 24차) — 키/라벨 완전성·매핑·이름 규칙 6건
- [packages/utils/src/format.ts](../../packages/utils/src/format.ts) — 대중교통 포맷터 집결, truncate 등 삭제
- [packages/utils/src/format.test.ts](../../packages/utils/src/format.test.ts)
- [packages/utils/src/geo.ts](../../packages/utils/src/geo.ts) — 거리 함수 + formatBbox
- [packages/utils/src/geo.test.ts](../../packages/utils/src/geo.test.ts)
- [packages/utils/src/lifeMap.ts](../../packages/utils/src/lifeMap.ts) (NEW 24차) — 일상지도 코드표·편의 판정·집계 셀 (병의원 `4fd6e22`)
- [packages/utils/src/lifeMap.test.ts](../../packages/utils/src/lifeMap.test.ts) (NEW 24차) — CCTV 목적/그룹, 화장실 24시간·변기수, 표시·셀 크기 9건
- [packages/utils/src/lifeMapMarker.ts](../../packages/utils/src/lifeMapMarker.ts) (NEW 24차) — CCTV 점/핀, 화장실·병의원 원/핀, 집계 버블
- [packages/utils/src/markerFrame.ts](../../packages/utils/src/markerFrame.ts) — 식당·버스·지하철·대기·일상지도 공용 마커 프레임(핀/원)
- [packages/utils/src/mealNutrition.ts](../../packages/utils/src/mealNutrition.ts) (NEW 24차) — 끼니 영양 합계 + 문구
- [packages/utils/src/mealNutrition.test.ts](../../packages/utils/src/mealNutrition.test.ts) (NEW 24차) — 부분 반영·추정·곁들임 숨김 7건
- [packages/utils/src/mealSlot.ts](../../packages/utils/src/mealSlot.ts) (NEW 24차) — 끼니/유형/양/출처 + 끼니 추정 + 날짜 키 + 시각 파싱
- [packages/utils/src/mealSlot.test.ts](../../packages/utils/src/mealSlot.test.ts) (NEW 24차) — 시각 파싱/포맷·양 배수 6건
- [packages/utils/src/random.ts](../../packages/utils/src/random.ts)
- [packages/utils/src/restaurantCategory.ts](../../packages/utils/src/restaurantCategory.ts)
- [packages/utils/src/reviewDate.ts](../../packages/utils/src/reviewDate.ts) (NEW 24차, `0d72380`) — 리뷰 방문일 파싱(연도 복원) + 최신순 비교
- [packages/utils/src/reviewDate.test.ts](../../packages/utils/src/reviewDate.test.ts) (NEW 24차) — 형식별 정규화·연도 추론·연말 보정·정렬 6건
- [packages/utils/src/routePath.ts](../../packages/utils/src/routePath.ts) — 노선 형상 투영/보간(버스 따라가기 코어)
- [packages/utils/src/subwayCongestion.ts](../../packages/utils/src/subwayCongestion.ts) — 혼잡도 임계/슬롯/방향 매칭 승격(`9206346`)
- [packages/utils/src/subwayCongestion.test.ts](../../packages/utils/src/subwayCongestion.test.ts) — 7건
- [packages/utils/src/subwayLine.ts](../../packages/utils/src/subwayLine.ts) — 수도권 전철 노선 상수(subwayId=lineId)
- [packages/utils/src/subwayMarker.ts](../../packages/utils/src/subwayMarker.ts) — 전철 역/경유역/열차 마커
- [packages/utils/src/subwayPosition.ts](../../packages/utils/src/subwayPosition.ts) — 열차 역간 보간(locateTrain/sliceForMove)
- [packages/utils/src/subwayPosition.test.ts](../../packages/utils/src/subwayPosition.test.ts) — 24건
- [packages/utils/src/subwayTimetable.ts](../../packages/utils/src/subwayTimetable.ts) — 웹·앱 복사본 승격
- [packages/utils/src/subwayTimetable.test.ts](../../packages/utils/src/subwayTimetable.test.ts) — 9건
- [packages/utils/src/thumbnail.ts](../../packages/utils/src/thumbnail.ts)
- [packages/utils/src/thumbnail.test.ts](../../packages/utils/src/thumbnail.test.ts) — pstatic 가드 회귀 테스트 5건
- [packages/utils/src/vehiclePill.ts](../../packages/utils/src/vehiclePill.ts) — 버스·지하철 공용 차량 알약/방향 코어
- [packages/utils/src/vworld.ts](../../packages/utils/src/vworld.ts)
- [packages/utils/src/weather.ts](../../packages/utils/src/weather.ts) (NEW 24차) — 기상청 격자·base 시각·코드표·강수·바람·상태 키
- [packages/utils/src/weather.test.ts](../../packages/utils/src/weather.test.ts) (NEW 24차) — 격자 12도시·base 경계·강수 문자열·바람·상태·지점 245 검증 37건
- [packages/utils/src/weatherRegions.ts](../../packages/utils/src/weatherRegions.ts) (NEW 24차) — 중기예보 구역 + 시도 + 지점 245(시·군 171 + 구·군 74)
