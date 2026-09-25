---
topic: tour
last_compiled: 2026-09-26
sources_count: 101
status: active
aliases: [여행로그, tour, tour-log, 국내 여행로그 데이터, AI 허브, aihub, 71780, 71779, 71778, 71581, 제주·도서, 서부권, 동부권, 수도권, tour-c, lp-2023, lp-west-2023, lp-east-2023, lp-capital-2023, TourPlace, TourTrip, TourVisit, TourActivity, TourSpend, TourTransition, TourDaySequence, TourCompanion, TourPhoto, TourCode, tour_places, tour_visits, RestaurantTourMatch, restaurant_tour_matches, TourPlaceBizStatus, tour_place_biz_statuses, TOUR_DATASETS, TOUR_DATASET_KEYS, TOUR_REGIONS, TOUR_REGION_KEYS, TOUR_REGION_GROUPS, tourSampleRegionAt, nearestTourSampleRegion, TOUR_K_MIN, TOUR_RATING_MIN_N, TOUR_SOURCE_NOTE, tourLog.ts, tour-master.service, tour-region-filter, tour-public.service, tour-insights.service, tour-region.service, tour-raw.service, tour-admin.service, restaurant-tour-match.service, tour-biz-status.service, load:tour, unload:tour, match:restaurant-tour, check:tour-biz, e2e:tour, status:life-map, TOUR_RAW_USER_IDS, TOUR_THUMBS_DIR, TOUR_THUMBS_DIR_WEST, TOUR_THUMBS_DIR_EAST, TOUR_THUMBS_DIR_CAPITAL, TOUR_EXPORT_DIR, requireTourRaw, 원본 열람, allowlist, 시드 콘솔, 여행로그 시드, 맛집 매칭, 폐업 조회, 국세청 사업자 상태조회, 15081808, 여행자 밀도, 밀도 격자, 인사이트, 코스 추천, 지역 비교, 숙소 통계, /travel/jeju, /travel/plan, /admin/tour, /tour/public, tour-stats, tourTravelers, tourScore, traveler, TravelInsightsPage, TravelPlanPage, AdminTourPage, TourEvidencePanel, TourTab, TourSummaryBadge, TourMatchBadge, TourFilterBar, LifeTourCard, tourDensityGeo, useTourInsights, useTourPlan, useTourDensity, useTourRaw, tourPhotoUrl, PLAN-tour-log, 소셀 억제, 베이즈 보정 만족도, 완화 사다리, plausibility, TourEvidenceSection, 여행자 근거, 어드민 상세 여행자 탭, 어드민 맛집 상세, AdminRestaurantDetailPage, AdminDetailHeader, ADMIN_DETAIL_TABS, PUBLIC_TABS_IN_ADMIN, availableTabs, 외부 API 문서, docs/api, endpoints.md, openapi.json, export:openapi, 라우트 summary, x-auth public, CORS 개방, hookTimeout]
---

# tour — 여행로그(AI 허브 「국내 여행로그 데이터」 4권역 적재·집계·맛집 매칭·시드 콘솔)

**2026-09-24~09-26 변경 흡수 — 어드민 식당 상세 '여행자' 탭과 공개 라우트 외부 문서화. tour 모듈의 로직·데이터·계약은 무변경**: (1) **어드민 식당 상세 '여행자' 탭**(`420a6be`, 2026-09-26) — 어드민 맛집 상세가 공개 상세의 탭 구성(홈·분석·**여행자**·메뉴·리뷰·질문·사진·정보·로그, `?tab=`)으로 바뀌었다. 26차에 적은 "헤더 `TourMatchBadge` + 하단 `TourEvidenceSection` 카드" 는 이렇게 갈렸다 — **배지는 새 `AdminDetailHeader`(자리는 같다), 근거는 '여행자' 탭**. 탭 내용은 사용자 결정대로 "공개 집계 + 근거" 다. 위에 공개 `TourTab`(공개 응답의 `tour` = matched 일 때만, `useRestaurantPublicTourStats`)이, 아래에 `TourEvidenceSection`(원본 5탭, allowlist 밖이면 "권한 없음")이 놓인다. 탭은 어드민 `detail.tour`(missing 포함)가 있을 때만 보이고, `?tab=tour` 인데 매칭이 없으면 홈으로 폴백한다. 그래서 missing 매칭은 근거만 보인다. 어드민 홈 탭이 공개 `HomeTab` 을 그대로 쓰므로 `TourSummaryBadge` 와 "여행자 방문 통계" 섹션(→ '여행자' 탭)도 어드민에 나온다(헤더엔 `TourMatchBadge`). (2) **공개 라우트 외부 문서화**(`1b621c4`, 2026-09-24) — `tour-public.route.ts` 6개 라우트에 한국어 `summary` 가 붙었다(tour-stats 는 소셀 억제 규칙을 적은 `description` 까지). 이 문구가 `docs/api/endpoints.md` `tour` 절 6행(전부 공개·120/분)과 `openapi.json`(`x-auth: public`)에 실렸다. 수기 `docs/api/README.md` 는 도메인 개요와 7절 이용 조건에 "여행로그는 집계만, `sourceNote`·`sampleLabel` 표기, 원본 수준 재구성·재배포 금지" 를 적었다. 같은 커밋의 CORS 개방으로 이 6개는 브라우저 교차 출처에서도 호출된다. 원본 열람·시드 콘솔은 `/api/v1/admin/**` 라 `PUBLIC_ORIGIN` 만 허용한다. PLAN 이 4~6차 공개를 "AI 허브 서면 회신 뒤" 로 걸어 둔 것과 이 문서화의 관계는 어디에도 적혀 있지 않다(Gotchas). (3) **주변 인프라** — `5d7b686`(09-25)이 `vitest.config.ts` 에 `hookTimeout: 60_000` 을 넣어 26차 Gotcha(격리 DB 복사로 인한 hook timeout)를 해소했다. `ad48f96`(09-24)은 `status:life-map` 한 줄의 `tour=` 앞에 `flood=F` 를 끼우고, deploy.sh `life_map_data` 의 여행로그 루프 앞에 침수 흔적 적재를 넣었다(매칭 줄 169→175행, `./deploy.sh 6` force 는 이제 `load:life-flood --download` 까지 돈다). `2ff2c31`·`4a2bff1` 로 상단바·사이드바 NAV 는 14개가 됐다(주차가 여행 앞, 바다가 날씨 뒤). tour 모듈의 서비스·로더·Prisma 모델·계약(`schemas/tour.ts`)·utils(`tourLog.ts`)·공개 웹 화면의 동작은 이번 라운드에 바뀌지 않았다(공개 `HomeTab` 은 어드민 재사용을 위한 선택 prop `availableTabs` 만 늘었다).

**2026-09-12~09-19 변경 흡수 — 신규 토픽, 0~9차 전부(`c777380`→`6cae6b2`)**: AI 허브 「국내 여행로그 데이터」 2023(패널이 여행 직후 입력한 방문지·만족도·체류·지출·활동·동선)을 별도 작업공간 `niney-tour-pickr/tour-c*` 가 파생표 10개(JSONL.gz + manifest) 로 내보내면, 이 리포가 **적재·집계·매칭·표시만** 하는 새 도메인이다. `c777380`(09-13, 1~2차) 이 제주·도서(71780) export 전량 적재 + 맛집(canonical)↔여행로그 장소 1:1 매칭 + 국세청 폐업 조회 + 어드민 시드 콘솔을, `99991da`(09-13, 3~5차) 가 관리자 원본 열람 allowlist 층 + 공개 집계(상세 "여행자" 탭·목록 정렬·골라줘 `traveler`) + `/travel/jeju` 인사이트·`/travel/plan` 코스 추천을, `9196495`(09-13, 6차) 가 일상지도 배경 레이어 "여행자 밀도"(0.02° 격자) + 숙소 통계 + 지역 비교를 붙였다. `8c27f5c` 는 실서버 e2e 스크립트(29→32 step), `cfa276b` 는 allowlist 에 이메일 허용 + 배포 안내 정정, `b9da676` 는 어드민 시드 표 실측 보정. `d18ac24`(09-16, 7차) 가 **다중 데이터셋**(서부권 71779, `west:` id 접두, `dataset` 열, `--dataset` 단위 교체, 제주 방문 비율 plausibility)과 **지역 축 10키**를 열었고, `93ae031`(09-19, 8차 동부권 71778) 이 권역 묶음 칩 2행과 세트 목록 루프를, `6cae6b2`(09-19, 9차 수도권 71581) 가 네 번째 세트를 얹어 **지역 키 21개·장소 50,271곳·여행 11,520건**으로 4권역이 완성됐다. 이용조건상 **공개 화면(/travel/*·상세 여행자 탭·밀도)은 AI 허브 서면 회신 전 운영 노출 금지**이고, 관리자 층(시드·매칭·폐업)만 바로 운영에 쓴다([PLAN-tour-log.md](../../docs/PLAN-tour-log.md)).

## Purpose [coverage: high — 13 sources]

"2023년에 실제로 그 지역을 다녀간 여행자 표본이 어디를, 언제, 얼마나 만족하며, 얼마를 쓰고 갔나" 를 (1) **맛집 상세·목록·골라주기의 추가 신호**로, (2) **여행 인사이트·코스 추천 공개 페이지**로, (3) **일상지도 배경 레이어**로, (4) **관리자의 발굴 시드·근거 자료**로 쓰는 도메인이다. 원천은 AI 허브 데이터셋 4개(제주·도서 **71780**, 서부권 **71779**, 동부권 **71778**, 수도권 **71581** — 각 패널 2,880명)이고 원본(203GB·102GB·93GB·97GB)은 리포 밖 `tour-c*` 가 DuckDB 로 정리해 **exportVersion 1** 규격의 파생표만 넘긴다([tourLog.ts](../../packages/utils/src/tourLog.ts) `TOUR_DATASETS`, [data-sources.md](../../docs/data-sources.md)).

설계를 가르는 제약은 이용조건이다([PLAN-tour-log.md](../../docs/PLAN-tour-log.md) §이용조건): 원본(개별 기록·사진·GPS)의 제3자 열람·제공 금지, 집계·서비스 등 2차 저작물은 출처 표기 조건으로 자유, 국외 반출 금지, 환수·폐기 요구 가능. 그래서 구조가 **"한 DB, 두 출구"** 다 — 운영 SQLite 에 파생표를 넣되, 공개 API 는 **식별자 없는 zod 스키마 + 소셀 억제(여행자 5명 미만 셀 null, 평점은 평가 3건 미만 null)** 로 집계만 내고([schemas/tour.ts](../../packages/api-contract/src/schemas/tour.ts)), 개별 행·사진은 admin 이면서 `TOUR_RAW_USER_IDS` allowlist 에 든 계정(AI 허브 승인을 직접 받은 본인)만 본다. 폐기는 `unload:tour --yes` 한 명령.

의존자: 웹 `/travel/jeju`·`/travel/plan`([App.tsx](../../apps/web/src/App.tsx), 상단바·사이드바 "여행" — [PublicTopBar.tsx](../../apps/web/src/components/PublicTopBar.tsx)·[PublicSidebar.tsx](../../apps/web/src/components/PublicSidebar.tsx)), 맛집 공개 상세·목록·골라줘([restaurant.service.ts](../../apps/friendly/src/modules/restaurant/restaurant.service.ts) 가 `tour` 필드·`sort=tourTravelers|tourScore`·`strategy: 'traveler'` 를 결합), 일상지도 `/life-map` 배경 레이어([LifeMapPage.tsx](../../apps/web/src/routes/LifeMapPage.tsx)), 어드민 `/admin/tour`·식당 상세 "여행자 근거"(**2026-09-26~ 어드민 식당 상세의 '여행자' 탭** — 공개 집계 `TourTab` + 근거 `TourEvidenceSection`, [AdminRestaurantDetailPage.tsx](../../apps/web/src/routes/admin/AdminRestaurantDetailPage.tsx)), 운영 [deploy.sh](../../deploy.sh)(세트별 자동 적재 → 매칭). **(2026-09-24~)** 외부 API 문서 [docs/api/](../../docs/api/README.md) 도 소비처다. 공개 6개 라우트가 "공개·120/분" 으로 등재되고 CORS `*` 로 열려, 사용자의 다른 프로젝트가 집계를 직접 부를 수 있다([api-docs](api-docs.md)). **앱(`apps/mobile`)에는 여행로그 화면이 없다**(계약만 통과 — PLAN §웹 화면 "앱은 v1 범위 밖", 후속 후보).

규모(2026-09-19 로컬 dev.db 적재 실측, `6cae6b2` 본문): 장소 **50,271**(제주 15,679 · 서부권 11,516 · 동부권 12,531 · 수도권 10,545, id 충돌 0) · 여행 **11,520** · 공개 방문 140,555 · 사진 67,722 · 시드(식당류 5명↑ 미매칭) 194곳(8차 시점). `status:life-map` 한 줄: `tour=50271 tour_jeju=15679 tour_west=11516 tour_east=12531 tour_capital=10545 tour_matched=N`. (2026-09-24 `ad48f96` 이후 그 앞에 `… store=S flood=F` 가 붙는다. 여행로그 항목은 그대로다 — [life-map-status.ts](../../apps/friendly/scripts/life-map-status.ts).)

## Architecture [coverage: high — 34 sources]

```
tour-c / tour-c-west / tour-c-east / tour-c-capital (리포 밖, Python/DuckDB — prepare.py → export_life_pickr.py)
   원본 203/102/93/97GB → data/export/lp-*-2023/ { manifest.json(exportVersion 1, sha256) · 10표 *.jsonl.gz · thumbs/s/*.webp(256px) }
   ↓ rsync (git 밖, /data/ 는 .gitignore)  →  <리포>/data/open/tour/<exportName>/   (세트당 JSONL 8~17MB + 썸네일 ~180MB)
load:tour [dir] --dataset jeju|west|east|capital [--dry-run]   ── scripts/load-tour.ts
   └ tour-master.service.ts  readTourManifest(계약 검증) → checkTourDatasetPlausibility(제주 방문 비율) →
       replaceTourTables: 한 트랜잭션에서 그 dataset 행만 delete → 청크 createMany(바인드 30,000 예산) → fillSidoColumns(SQL) → LifeMasterSync layer=tour|tour-<key>
   ↓ match:restaurant-tour ── restaurant-tour-match.service.ts (canonical ↔ TourPlace 1:1, 100m·0.5 / 완전일치 300m)
   ↓ check:tour-biz (수동) ── tour-biz-status.service.ts (TourSpend.brno 최빈 → 국세청 15081808, 100건/콜)

friendly (autoload `*.route.ts`, prefix /api/v1)
   tour-public.route.ts  ── getRestaurantTourStats · TourInsightsService(insights/plan) · TourRegionService(density/lodging/regions)   [인증 없음, RATE.tourRead]
                            └ (2026-09-24) schema.summary 한국어 → export:openapi → docs/api/{openapi.json, endpoints.md} "tour" 절, CORS '*'
   tour-admin.route.ts   ── TourAdminService(status/listSeeds/discover/register/runMatch/runBizCheck)                                    [authenticate + requireAdmin]
   tour-raw.route.ts     ── TourRawService(visits/activities/spend/photos/trips/getTrip/photoPath)                                       [+ requireTourRaw(allowlist) · onSend no-store/noindex]
   tour-region-filter.ts ── region 키 → 표별 where 한 곳(trip/visit/transition/day/place + raw SQL)
   restaurant.service.ts ── getPublicList/Detail/smartPick 에 tour 결합(tour-public.service 의 맵·요약·가중치)

@repo/api-contract schemas/tour.ts (+ restaurant.ts 의 tour 필드·sort·strategy) · Routes.Tour
@repo/utils tourLog.ts (TOUR_DATASETS·TOUR_REGIONS 21키·권역 묶음·표본 판정·k·격자·등급·출처 문구)
@repo/shared tour.api.ts · useTour.ts (공개 5 + 어드민 6 + 원본 6 + photoBase)

웹  /travel/jeju TravelInsightsPage(필터 = URL 쿼리) · /travel/plan TravelPlanPage(→ /vote/new state 프리필)
    components/tour/{TourFilterBar(2행 지역 칩), charts, tourFormat, TourRegionSection, TourLodgingSection, TourSourceNote}
    맛집 상세 TourTab(매칭 있을 때만) · TourSummaryBadge/Line · 카드 메타 · 정렬 칩 2 · SmartPickSection "여행자 만족 기준"
    /life-map 배경 "여행자 밀도" — LifeTourCard · lib/tourDensityGeo(OL 면) · lifeMapAreas.tourDensityAreaStyle · prefs v5 tourDensityKind
    /admin/tour AdminTourPage(데이터셋별 상태·시드 표·discover/register·매칭·폐업) · TourEvidencePanel(원본 5탭) · TourMatchBadge(어드민 상세)
    /admin/restaurants/:placeId?tab=tour (2026-09-26) — 공개 TourTab(matched) + TourEvidenceSection · 헤더 AdminDetailHeader 의 TourMatchBadge
```

### 데이터셋(적재 단위)과 지역(공개 화면 축) — 한 곳에서 정의

7차(`d18ac24`)부터 "데이터셋 = tour-c export 폴더 하나 = 적재 단위" 와 "지역 = 공개 화면의 region 축" 을 [tourLog.ts](../../packages/utils/src/tourLog.ts) 가 한 번만 정의한다. `TOUR_DATASETS`(key·aihub·name·label·exportName·idPrefix·sidos) 는 4행, `TOUR_REGIONS` 는 21행(권역 4 + 시도 16 + 전체 1)이고 **데이터셋 키는 항상 지역 키이기도 하다**(표본 단위 지역, `parent: null`). 장소 id 는 export 안에서만 유일(POI/이름+좌표 해시 — 서울역·휴게소 같은 공용 장소가 세트마다 같은 id)이라 첫 세트(jeju)만 접두 없음, 나머지는 `west:`·`east:`·`capital:` 을 **장소를 가리키는 모든 열**(places.id, visits.placeId/prevPlaceId/nextPlaceId, activities/spend/photos.placeId, transitions.from/toPlaceId, trips.first/lastPlaceId, day_sequences.placeIds 목록 항목마다)에 붙인다(`tourPlaceIdOf`, `tourNormalizeCtx`). 여행·방문·사진 id 는 권역 간 겹치지 않음을 확인했고(2026-09-16), `spend_id` 는 세트마다 1부터라 버리고 `TourSpend.id` 자체 증가를 쓴다. `LifeMasterSync` layer 는 jeju 가 `tour`(deploy.sh·status 호환), 나머지 `tour-<key>`(`tourSyncLayer`).

키 목록은 [schemas/tour.ts](../../packages/api-contract/src/schemas/tour.ts) 의 `TOUR_DATASET_KEYS`·`TOUR_REGION_KEYS`(zod enum 원본)와 utils 에 **리터럴로 이중 정의**된다 — utils → api-contract import 는 순환 금지라 — 그리고 [tour-master.service.test.ts](../../apps/friendly/src/modules/tour/tour-master.service.test.ts) 가 `TourDataset.options`/`TourRegion.options` 와 `toEqual`(순서 포함)로 동일성을 고정한다(foodTaxonomy 규약, [utils](utils.md)·[api-contract](api-contract.md)).

### 적재 — "정규화는 순수 함수 + 사유별 drop 리포트, 쓰기는 데이터셋 단위 교체 트랜잭션"

[tour-master.service.ts](../../apps/friendly/src/modules/tour/tour-master.service.ts)(877줄)는 bus-master·life-map-master·life-store-master 와 같은 골격([open-data-master-load](../concepts/open-data-master-load.md))이되 세 가지가 다르다. (1) **JSONL.gz**(한 줄 = JSON 객체, parquet 열 이름 그대로) — 자유기술의 줄바꿈·따옴표와 숫자/불리언 형이 보존돼 CSV 열 인덱스 매핑·형 변환이 없다. 대신 표마다 정규화 함수(`normalizeTourPlace` … `normalizeTourCode`)가 접근자 클래스 `R`(str/strReq/int/intReq/num/bool)로 "있어야 할 키·형" 을 명시해 export 드리프트를 `badId`/`badField` 로 잡는다. (2) **이용조건 재검증** — 비공개 방문(`is_private`, 집 21·친지 22·사무실 23) 에 `name/road_addr/lot_addr/lon/lat/place_id/poi_id` 가 남아 있으면 그 행을 `privateLeak` 로 버리고 센다(tour-c 가 이미 마스킹하지만 적재기가 다시 본다). trips 에 `traveler_id/income_nm/job_nm/edu_nm/house_income_nm`, photos 에 `lon/lat/filename` 이 섞여 오면 **행이 아니라 계약 위반으로 적재 거부**. 좌표는 한국 범위(lat 33~39, lng 124~132) 밖이면 행은 살리고 좌표만 null(`badCoord`), 모르는 `type_short` 는 세기만(`unknownType`). (3) **데이터셋 내용 검사** — tour-c 의 `export_life_pickr.py` 가 manifest.dataset 을 어느 권역이든 `aihub-71780` 으로 고정해 쓰므로, `readTourManifest` 는 4개 aihub 번호를 모두 받고 `checkTourDatasetPlausibility` 가 trips 의 `n_jeju>0` 비율로 `--dataset` 오지정을 막는다(jeju 는 50% 이상, 그 밖은 10% 이하 — 동부권은 제주 방문 4/2,880). 여행이 0건(테스트 export)이면 검사하지 않는다.

`replaceTourTables` 는 `checkTourDatasetPlausibility` → `$transaction`(timeout 60분) 안에서 `deleteDataset`(표 9개는 `where {dataset}`, `codes` 는 세트 공용이라 통째) → 표 10개 순서대로 `iterateTourChunks`(청크 = `floor(30,000 / 열 수)` 를 50~1,000 으로 클램프: places 789·trips 566·visits 508·나머지 1,000 — SQLite 바인드 상한 32,766 아래) → `fillSidoColumns`(`trips.visitSidos`·`day_sequences.sidos` 를 `',' || group_concat(DISTINCT sido) || ','` 꼴로, `transitions.fromSido/toSido` 를 방문 id 조인으로 — 마이그레이션 `20260915185047` 의 백필과 같은 문장에 dataset 범위만 더함) → `LifeMasterSync` 생성(count = places, baseDate = `built_at` 앞 10자, sourceFile = `<폴더명>#v1`). `--dry-run` 은 정규화·리포트만. `unloadTourTables(prisma, dataset?)` 은 그 세트 장소의 `restaurant_tour_matches`·`tour_place_biz_statuses` 를 먼저 지우고 표 9개 → count 0 이력 행, 장소가 0 이 되면 `tour_codes` 도 비운다. `getTourLoadStatus` 는 표별 `groupBy dataset` + 세트별 최신 이력으로 `datasets[]`(loaded = 이력 count>0 && 장소>0) 와 합계를 낸다.

경로 규칙: 서버·스크립트가 `apps/friendly` cwd 로 뜨므로 `tourDefaultExportDir(dataset)` 은 `data/open/tour/<exportName>` 을 cwd 기준과 `../../` 두 후보에서 찾는다(번들 dist 에선 `import.meta.url` 이 리포 구조를 잃어 못 쓴다). 썸네일은 `resolveTourThumbsDir(exportDir, dataset)` — env(`TOUR_THUMBS_DIR` 은 jeju, 그 밖은 `TOUR_THUMBS_DIR_<KEY 대문자>`) 우선, 없으면 `<export>/thumbs`.

### 맛집 매칭·폐업 조회 — canonical 축 사이드 테이블

[restaurant-tour-match.service.ts](../../apps/friendly/src/modules/tour/restaurant-tour-match.service.ts) 는 [canonical](canonical.md) 의 상가 매칭(`restaurant-store-match.service` — `storeNameScore` 를 그대로 재사용, 별칭 `aliases`(' | ' 구분)까지 최고 점수)과 같은 골격이다. 대상은 `TOUR_MATCH_CANONICAL_WHERE` = 좌표 있고 식당 행이 1개 이상인 canonical(dev.db 의 고아 canonical 7,969건을 처음부터 제외), 후보는 `TourPlace` 중 식당류(`TOUR_RESTAURANT_TYPE_SHORTS` = 식당·상업·상점 — 시장·상점으로 잘못 기록된 식당이 있어) 를 bbox(±0.003°/±0.0035°) 로 긁어 haversine. 수락 규칙 `isTourMatchAccepted`: **100m 안 점수 ≥0.5** 또는 **정규화 이름 완전일치(≥0.999) 300m 안**(여행자 입력·POI 좌표가 상가정보보다 거칠고 tour-c 병합 반경도 300m). 장소는 한 맛집에만(`tourPlaceId` unique + 코드의 `claimed` 맵으로 순서 의존 회피), 재실행 시 이전 장소가 아직 후보면 유지(`kept`), 후보에서 사라지면 `status=missing`(재적재로 장소 키가 바뀐 경우 — 목록엔 남는다), 돌아오면 `recovered`. 리포트 `scanned/created/rematched/kept/newlyMissing/stillMissing/recovered/unmatched`. 어드민 `runMatch` 는 모듈 전역 `matchInFlight` 프로미스로 동시 실행을 하나로 합친다([in-memory-singleton-gates](../concepts/in-memory-singleton-gates.md)).

[tour-biz-status.service.ts](../../apps/friendly/src/modules/tour/tour-biz-status.service.ts) 는 2023년 표본에 섞인 폐업 가게를 크롤 전에 거르는 용도. `collectTourPlaceBrnos` 가 `tour_spend` 를 `GROUP BY placeId, brno, storeNm` 한 번으로 읽어 장소별 최빈 사업자번호(`normalizeBrno` — 하이픈 제거 10자리, 표기가 갈라진 번호를 합산)를 고르고, 대상은 식당류 + `minTravelers`(기본 3) + region where(`tourRegionPlaceWhere`). `checkTourBizStatus` 는 30일 안 조회 장소 제외(`force` 면 전부) → 100건씩 `POST api.odcloud.kr/api/nts-businessman/v1/status`(`toServiceKeyPart` 는 [bus](bus.md) 어댑터 재사용, 같은 번호는 한 번만) → `TourPlaceBizStatus` upsert. 401/403 → `auth`(15081808 활용신청 확인), 429 → `quota`, 그 외 → `transient`; auth·quota 는 즉시 중단(부분 결과 유지), `maxCalls`(기본 10) 도달 시 `maxCalls`. 응답 `b_stt` '' 는 `unknown`(국세청 미등록).

### 관리자 시드 콘솔과 원본 열람 — 두 라우트 파일, 두 권한

[tour-admin.service.ts](../../apps/friendly/src/modules/tour/tour-admin.service.ts) 의 `status()` 는 적재 상태(전체 + `datasets[]`)·매칭 통계(matched/missing/candidates)·폐업 통계(bStt groupBy + `keyConfigured`)·시드 수(식당류 전체/5명↑/3명↑/5명↑ 미매칭 — raw SQL LEFT JOIN)·썸네일 폴더 존재를 한 번에 낸다. `listSeeds` 는 `tour_places p LEFT JOIN restaurant_tour_matches m LEFT JOIN tour_place_biz_statuses b LEFT JOIN restaurants r(source='naver')` 한 SQL(방문자 수 내림차순 고정, `tourRegionPlaceSql` 로 지역, status unmatched/matched/closed, `q` 는 name·aliases LIKE). `discover` 는 장소 좌표 ±1km bbox 로 `CrawlService.searchPlaces(name, bbox)`(좌표 없으면 `시군구 이름`) → 후보마다 거리·`tourPlaceNameScore`·`accepted`(매칭 규칙 통과)·`registered` 를 얹어 정렬. `register` 는 기존 크롤 파이프라인 `startCrawl(rawSourceUrl, actorId, 'create')` 그대로([crawl](crawl.md)), 잡이 `done` 이면 `jobRegistry.subscribe` 로 매칭 전체를 다시 돌려 시드 목록에서 빠지게 한다(이미 끝난 잡을 돌려받으면 바로). `CrawlService` 는 지연 생성(상태·목록 라우트는 크롤 의존이 없어 테스트 앱이 summaries/operationLog 플러그인 없이 검증).

[tour-raw.route.ts](../../apps/friendly/src/modules/tour/tour-raw.route.ts) 는 별도 플러그인이라 **플러그인 스코프 `onSend` 훅**(`Cache-Control: private, no-store`·`X-Robots-Tag: noindex, nofollow`)이 이 파일의 라우트에만 걸린다. 가드 `[authenticate, requireAdmin, requireTourRaw]` — allowlist(`parseTourRawAllowlist(env.TOUR_RAW_USER_IDS)`, 쉼표·공백 무시)에 **user id 또는 이메일(대소문자 무시)** 이 있어야 하고 밖이면 존재를 알리지 않는 404(`cfa276b` — 운영에서 이메일을 넣었다가 전부 404 난 것을 로컬 `niney@life.com` 으로 재현·수정). 사진 `GET /admin/tour/photos/:photoId/:size` 는 `<img>` 가 헤더를 못 실어 SSE 와 같은 `?token=`(`app.resolveSseAdmin`, [sse-token-auth](../concepts/sse-token-auth.md))도 받는데, 그 헬퍼는 id·role 만 주므로 이메일 allowlist 는 DB 에서 이메일을 한 번 더 읽는다. [tour-raw.service.ts](../../apps/friendly/src/modules/tour/tour-raw.service.ts) 는 읽기만: 장소별 방문(최신순, 이전·다음 장소 이름 조인)·주문 원문(activities)·영수증(spend)·사진 메타(`hasThumb` 만, `sizes` 는 어느 세트든 폴더가 있는 크기)·포함 여행(distinct travelId 페이지 + 일차 순서), 여행 타임라인(`getTrip` — 방문 순서에 활동·활동 소비·사진 id 를 붙이고 숙박·이동·사전 소비는 `otherSpend`, 비공개 방문은 `privateRole`("출발지"·"귀가"·"비공개 장소")만). `photoPath` 는 id 화이트리스트 `^[A-Za-z0-9_-]{1,40}$` + `resolve` 결과가 base 폴더로 시작하는지로 경로 조작을 막고, 사진 행의 `dataset` 으로 세트별 썸네일 폴더를 고른다(모르면 jeju).

### 공개 집계 — 식별자 없는 스키마 + k 억제, 세 서비스

- [tour-public.service.ts](../../apps/friendly/src/modules/tour/tour-public.service.ts)(4차): `toTourSummary(place)` 가 장소 집계를 공개 요약으로 — `nRated < 3` 이면 `bayesScore/meanDgstfn` null, `nVisits < 5` 면 `revisitRate/stayMedian/topReasonNm` null, `spendN < 3` 이면 `spendPpMedian` null(값이 있어도 한 사람의 평가일 수 있어 가린다). `travelerWeight` = `(bayes − 1)/4` 를 0~1 로 클램프(골라주기). `getPublicListTourMap` 은 canonicalId 500개씩 in-절, `registeredNaverIds` 는 여행로그 장소 id → 등록 맛집의 네이버 placeId(링크·투표 후보용 — 인사이트·코스도 쓴다). 순수 집계 `aggregateTourStats`(export 해 테스트) 가 "여행자" 탭 전체를 만든다: 만족도·추천 의향 1~5 분포, 재방문(first/again), 도착 시각 24·요일 7·월, 체류 5구간(≤30·60·90·120·초과), 여행 중 위치(첫날/중간/마지막), 이유 상위 8, 동반·연령 집단(**n ≥ 5** 만, mean 은 평가 3건 이상), 전/후 장소(전이 3회 이상 상위 6)·함께 간 곳(여행당 1회로 접어 5명 이상 상위 8 — 등록 맛집이면 placeId), 주문 어절(`tokenizeMenuDetail` — `;,/+` 분리·수량 꼬리 제거·2건 이상 상위 12), 결제(활동 소비, 3건 이상일 때 1인 중앙·Q1/Q3·건당 중앙·결제당 인원·수단).
- [tour-insights.service.ts](../../apps/friendly/src/modules/tour/tour-insights.service.ts)(5차) `TourInsightsService`: 필터(region·ageGrp·gender·accompany·month 4~9·nights 0~4(4 = 4박 이상))를 `attrWhere` 로 만들고 — 여행 속성이 방문·전이·일차·소비 표에 **비정규화**돼 있어 대부분 한 표 조회 — 여행·공개 방문·전이·일차(3~7곳)·소비(금액>0) 5개를 병렬 조회해 규모(여행·방문·장소·식당·여행당 지출 중앙)·박수·월·동반(여행 단위 Set + 만족)·시간대×유형(식당·자연·숙소·상업 24칸)·유형별 만족/체류/1인 지출·유형 전이 상위 30·하루 코스 템플릿(3건 이상 상위 10)·읍면동 상위 12·이유 10·지출 구성(활동/이동/숙박/사전, 여행 단위 합계 — region 은 tripIds 로)·여행당 지출 p10/중앙/p90·이동수단 8·**거점 다음 첫 목적지**(`tourRegionHubs` 이름 조각을 from_name 이 포함하고 to_name 은 포함하지 않는 전이, 5건 이상 상위 8, `hubLabel` 은 지역별 제목)·거주지 10·연령×성별을 낸다. 여행 < 20 이면 `insufficient: true`, 집단 셀은 `TOUR_K_MIN` 미만 제거, 결과는 필터 키로 LRU 10분(max 200). `plan(body)` 은 "나와 비슷한 여행" 을 세그먼트 일치로 고르고 20건 미만이면 **완화 사다리 month → gender → nights → ageGrp** 순으로 풀며 `relaxed[]` 에 기록, 그 여행들의 공개 방문(교통·숙소·비공개 제외)을 장소별로 모아 `travelers ≥ 5 && rated ≥ 3` 인 것만 `score = n × (mean − 3.3)`(tour-c PlanPage 산식) 양수 상위 24 + 템플릿(2건 이상 상위 8).
- [tour-region.service.ts](../../apps/friendly/src/modules/tour/tour-region.service.ts)(6차) `TourRegionService`: `density` 는 `tour_visits` 를 raw SQL `GROUP BY CAST(lng/0.02 AS INTEGER), CAST(lat/0.02 AS INTEGER)`(SQLite 엔 FLOOR 가 없고 한국 좌표는 양수라 절삭 = floor) + `HAVING COUNT(DISTINCT travelId) >= 5`, `kind=restaurant` 는 식당류 3종, bbox 선택(없으면 전국 칸 전부) → 셀 `{x,y,n,travelers}` + 20/40/60/80 분위 경계 4개(`tourDensityQuantileBreaks`, R type 7) + 규모, 키 `kind|bbox` LRU(max 20). `lodging` 은 숙박 결제(소비 표 `category='숙박'`)를 유형(subtypeNm)별로 결제 건·이용 여행·결제 중앙·**1박 추정 = 결제액 × 그 여행의 숙박 결제 건수 ÷ 박수**(체크인·아웃이 export 에 없어)·1인 중앙·예약률(rsvtYn Y/N 5건 이상) + 숙소 방문 평가 만족도, 여행 5건 이상 유형만. `regions` 는 `region=jeju` 면 제주시·서귀포시·부속섬 3집단 고정, 그 밖은 "시도 시군구" 키로 방문 수 상위 8집단(여행 5건 이상), 각 집단에 방문 비중·만족·식당 방문/만족·체류·1인 지출·유형 5·읍면동 5, 그리고 읍면동 표(방문 5건 이상 상위 20). 둘 다 인사이트와 같은 필터 축·LRU 10분.

세 서비스 모두 `sampleLabel`("2023년 4~9월 여행자 표본")·`sourceNote`(`TOUR_SOURCE_NOTE` — 4개 데이터명 자동)를 응답에 실어 화면이 그대로 붙인다(문구 개정 시 배포 없이 반영). 지역 조건은 전부 [tour-region-filter.ts](../../apps/friendly/src/modules/tour/tour-region-filter.ts) 를 거친다 — `jeju` 는 tour-c 의 isJeju(본섬+부속섬, bbox 보정) 그대로(여행 `nJeju>0`·방문 `isJeju`·전이 `bothJeju`·일차 `isJejuDay`), 시도 키는 방문 `sido`, 여행·일차는 `",전북,대전,"` 목록 열 `contains`, 전이는 from/to 둘 다, 권역은 시도 합, `all` 은 조건 없음.

### 웹 — 공개 세 곳 + 어드민 두 곳

- [TravelInsightsPage.tsx](../../apps/web/src/routes/TravelInsightsPage.tsx)(`/travel/jeju`): 필터는 **URL 쿼리가 진실**(`readParams` — region 은 `isTourRegionKey` 검증, 기본 jeju 는 쿼리에 안 실음; `setSearchParams(replace)`), 제목 `${지역 라벨} 여행 인사이트 2023`, KPI 5 + 섹션 13(몇 박·언제·누구와·시간대×유형·유형별 만족/체류·전이 HeatGrid·하루 코스 SeqChips·누가·이유·무엇에 썼나 StackBar·이동수단·`d.hubLabel`·어디서 왔나) + `TourRegionSection`·`TourLodgingSection`(같은 params 로 따로 조회) + `TourSourceNote`. 20건 미만이면 호박색 안내, 5건 미만 셀은 "표본이 부족해 숨겼습니다". 차트는 라이브러리 없이 CSS 막대·SVG([charts.tsx](../../apps/web/src/components/tour/charts.tsx)).
- [TravelPlanPage.tsx](../../apps/web/src/routes/TravelPlanPage.tsx)(`/travel/plan`): 폼 상태(기본 제주·30대·2인 여행(가족 외)·2박) → `useTourPlan` 뮤테이션 → 안내("같은 조건의 여행 N건 — 표본이 적어 월·성별 조건은 풀었습니다") + 카드(유형 점·등록 맛집이면 상세 링크·`n팀 · 만족`·점수 막대) + 전체/식당만 토글 + 등록 맛집 2~8곳 체크 → **`/vote/new` 로 `location.state { presetTitle: "<지역>에서 뭐 먹지?", presetOptions }`**([VoteNewPage.tsx](../../apps/web/src/routes/vote/VoteNewPage.tsx) 가 첫 렌더에만 읽음, [vote](vote.md)).
- [TourFilterBar.tsx](../../apps/web/src/components/tour/TourFilterBar.tsx): 지역 칩 **2행**(8차) — 1행 `TOUR_REGION_GROUPS`(제주·서부권·동부권·수도권·전체), 2행은 고른 권역의 시도 + "<권역> 전체"; 값은 여전히 region 키 하나. 연령 5·성별 2·동반 8(원본 표기 그대로, `shortAccompany` 로 축약 표시)·월 6·박수 5 + 초기화(region 유지). 선택지 상수는 [tourFormat.ts](../../apps/web/src/components/tour/tourFormat.ts)(서버 zod 와 같은 값).
- 맛집 상세: [tabs.ts](../../apps/web/src/components/restaurant/detail/tabs.ts) 의 `'tour'`(여행자) 탭은 [PublicRestaurantDetail.tsx](../../apps/web/src/components/restaurant/detail/PublicRestaurantDetail.tsx) 가 `detail.tour !== null` 일 때만 노출, [TourTab.tsx](../../apps/web/src/components/restaurant/detail/TourTab.tsx) 는 탭이 열릴 때만 `useRestaurantPublicTourStats` 로 조회(teal 톤 — 리뷰 AI 분석과 다른 신호). [HomeTab.tsx](../../apps/web/src/components/restaurant/detail/HomeTab.tsx) 는 헤더 [TourSummaryBadge](../../apps/web/src/components/restaurant/detail/TourSummaryBadge.tsx)("여행자 N명 · 만족 x.xx · 2023") + 요약 줄 `TourSummaryLine`(4칸 + 출처). [PublicRestaurantCard.tsx](../../apps/web/src/components/restaurant/PublicRestaurantCard.tsx) 메타 "🧭 여행자 N명 · x.x", [PublicRestaurantList.tsx](../../apps/web/src/components/restaurant/PublicRestaurantList.tsx) 정렬 칩 "여행자 방문순"·"여행자 만족순", [SmartPickSection.tsx](../../apps/web/src/components/restaurant/SmartPickSection.tsx) "🧭 여행자 만족 기준" 토글(`strategy: traveler`) + 결과 카드 근거, [RestaurantsV2Page.tsx](../../apps/web/src/routes/RestaurantsV2Page.tsx) 는 공유 진입 핀에 상세의 `tour` 를 조립.
- 일상지도: [LifeMapPage.tsx](../../apps/web/src/routes/LifeMapPage.tsx) 의 배경 `overlay === 'tour'` 이면 `useTourDensity(kind, on)` → [tourDensityGeo.ts](../../apps/web/src/lib/tourDensityGeo.ts) 가 칸을 OL 면 피처(EPSG:3857, 속성 key·n·travelers 만)로 → `MapCanvas.areas` 경로(시군구 경계와 같은 클릭·스타일 규약) + [lifeMapAreas.ts](../../apps/web/src/components/life-map/lifeMapAreas.ts) `tourDensityAreaStyle`(등급별 Style 캐시, 선택 칸엔 건수 라벨). 토글 시 지도 중심이 표본 세트 bbox 밖(`tourSampleRegionAt` null)이면 `nearestTourSampleRegion` 중심으로 flyTo + `?ll&z`(9차부터 서울시청 기본 중심이 수도권 bbox 안이라 이동 없음). [LifeTourCard.tsx](../../apps/web/src/components/life-map/LifeTourCard.tsx) 는 종류 칩(전체/식당만 — [lifeMapPrefsStore](../../apps/web/src/stores/lifeMapPrefsStore.ts) v5 `tourDensityKind`)·범례(등급 경계)·선택 칸의 방문·여행자·등급 + **그 칸 bbox 의 등록 맛집**(`useRestaurantsPublic({bbox, sort:'tourTravelers', limit:12})` — 여행로그 장소 자체는 공개하지 않고 "우리 DB 식당" 만 잇는다). [LifeLayerBar](../../apps/web/src/components/life-map/LifeLayerBar.tsx) 배경 칩(범죄 통계와 배타 — `overlay` 하나), [LifeMapFooter](../../apps/web/src/components/life-map/LifeMapFooter.tsx) 출처 줄(`TOUR_DATASET_NAME`). 상세는 [life-map](life-map.md).
- 어드민: [AdminTourPage.tsx](../../apps/web/src/routes/admin/AdminTourPage.tsx)(`/admin/tour`, 사이드바·상단바 "여행로그 시드" — [AdminLayout](../../apps/web/src/components/admin/AdminLayout.tsx)·[AdminTopBar](../../apps/web/src/components/admin/AdminTopBar.tsx)·[AdminRoutes](../../apps/web/src/routes/admin/AdminRoutes.tsx)) 상단 Stat 4(적재 — 데이터셋별 곳수·툴팁에 sourceFile/기준일, 맛집 매칭 `matched / candidates`·보류, 폐업 조회, 식당류 시드) + "매칭 다시 실행"·호출 상한·"폐업 조회 실행"(키 없으면 비활성), 아래 시드 표(지역 필터 = 전체 + 데이터셋 목록 자동, 상태 4, 여행자 N명 이상 기본 5, 이름 검색, 50/페이지) — 행마다 매칭/폐업 배지, "검색"(discover → 후보 카드, 수락 규칙 통과는 teal, "등록" → 크롤 잡 링크 `/admin/crawl-test/:jobId`)·"근거"(펼침에 [TourEvidencePanel](../../apps/web/src/components/admin/tour/TourEvidencePanel.tsx)). `b9da676` 가 헤더·숫자 열 `whitespace-nowrap`·고정 폭·툴팁·상태 카드 문구·필터 라벨을 실측 보정. TourEvidencePanel 은 방문·주문 원문·영수증·사진(`tourPhotoUrl` 로 `?token=` 조립, s 썸네일 → m 링크)·여행(일차 배지 + 타임라인) 5탭, 404 는 "원본 열람 권한이 없습니다" 안내. ~~어드민 식당 상세([AdminRestaurantDetailPage](../../apps/web/src/routes/admin/AdminRestaurantDetailPage.tsx))는 헤더 [TourMatchBadge](../../apps/web/src/components/restaurant/detail/TourMatchBadge.tsx)(거리·유사도·폐업 경고 배지) + 하단 `TourEvidenceSection`.~~ (~2026-09-19 기준)
- **어드민 식당 상세 — 2026-09-26(`420a6be`) 이후 '여행자' 탭**: 어드민 식당 상세가 공개 상세의 탭 구성으로 바뀌었다(canonical 축 재구성 전반은 [canonical](canonical.md)).
  - `TourMatchBadge`(거리·유사도·폐업 경고)는 새 헤더 [AdminDetailHeader.tsx:79-80](../../apps/web/src/components/admin/restaurant-detail/AdminDetailHeader.tsx) 의 `StoreInfoBadges` 옆에 있다 — 자리는 예전과 같다.
  - '여행자' 탭은 [tabs.ts](../../apps/web/src/components/admin/restaurant-detail/tabs.ts) `ADMIN_DETAIL_TABS` 의 3번째(공개 순서 홈·분석·여행자… 를 따름)다. 탭 바에는 `detail.tour != null` 일 때만 나온다 — 어드민의 `RestaurantTourMatchInfo` 라 missing 도 포함된다. `?tab=tour` 인데 매칭이 없으면 홈으로 폴백한다.
  - 탭 안([AdminRestaurantDetailPage.tsx:254-264](../../apps/web/src/routes/admin/AdminRestaurantDetailPage.tsx))은 두 겹이다. 공개 응답 `publicDetail.data.tour`(matched 만)가 있으면 위에 공개 [TourTab](../../apps/web/src/components/restaurant/detail/TourTab.tsx) 을 그린다(열릴 때 `useRestaurantPublicTourStats` → 공개 `tour-stats` 라우트, `RATE.tourRead`). 그 아래(`border-t`)에 [TourEvidenceSection](../../apps/web/src/components/admin/tour/TourEvidencePanel.tsx)이 온다 — 제목 "여행자 근거", 장소명·여행자 수·`sampleLabel`, `/admin/tour` 새 탭 링크, `TourEvidencePanel` 원본 5탭.
  - missing 매칭이면 위쪽 집계 없이 근거만 보인다. 장소가 재적재로 아예 사라졌으면 `getRestaurantTourMatchInfo` 가 null 을 돌려줘 탭 자체가 없다([restaurant-tour-match.service.ts:179-188](../../apps/friendly/src/modules/tour/restaurant-tour-match.service.ts)). 그러니 탭이 보이는 missing 은 장소는 남았는데 후보 조건(거리·이름·1:1 선점)에서 빠진 경우다.
  - 홈 탭은 공개 [HomeTab](../../apps/web/src/components/restaurant/detail/HomeTab.tsx) 을 `availableTabs = PUBLIC_TABS_IN_ADMIN`(tour 포함)으로 재사용한다. 그래서 본문 머리의 `TourSummaryBadge` 와 "여행자 방문 통계" 섹션(`TourSummaryLine` + "여행자 탭 보기" → 어드민 '여행자' 탭)도 어드민에 나온다. `availableTabs` 에 없는 탭이면 그 버튼이 `disabled` 가 된다(공개 동작은 그대로).
  - 요약 완료·재수집 때의 공개 캐시 무효화 목록(`invalidateRestaurantDetailCaches` — detail·insights·reviews·category-tree·menu-nutrition 등)에 `['restaurant','public','tour-stats',placeId]` 는 없다. 여행자 통계는 리뷰와 무관하니 맞는 선택이다.

### e2e — 실서버 + 헤드리스 크로미움

[scripts/e2e-tour.ts](../../apps/friendly/scripts/e2e-tour.ts)(`pnpm --filter friendly e2e:tour [--web=http://localhost:5173] [--api=http://localhost:3000] [--shots=<dir>] [--headed]`, playwright)는 미리 띄운 friendly·Vite 에 붙어 32 step 을 돈다: ① API — insights 기본(여행 ≥20·집단 셀 n≥5·`FORBIDDEN` 키 스캔·출처 문구)·좁은 필터 insufficient·잘못된 필터 400·plan(n≥5·교통/숙소 없음)·density(travelers≥5·breaks 4·restaurant ⊂ all·bbox 절단·kind 400)·lodging·regions(3집단)·7차 `region=daejeon`·8차 `gangwon/east`·9차 `seoul/capital`·관리자 무인증(401/401/사진 404)·목록 `sort=tourTravelers`; ② `/travel/jeju` 렌더·지역 비교·숙소·출처·칩 → URL → 집계 갱신·표본 부족·초기화·딥링크 복원·코스 링크; ③ `/travel/plan` 제출·식당만·투표 버튼 비활성·조건 변경(결과 토글 "전체" 는 `.last()` — 지역 칩과 겹침); ④ `/life-map` 밀도 토글(표본 안이면 이동 없음 분기)·칸 클릭·종류 칩 저장(localStorage prefs v5)·범죄 통계 배타; ⑤ 390px 가로 넘침 0·콘솔 error 0. 스크린샷은 `data/e2e-shots`. 9차 실측 32/32(2026-09-19).

## Talks To [coverage: high — 19 sources]

| 상대 | 방향 | 내용 |
|---|---|---|
| tour-c / tour-c-west / tour-c-east / tour-c-capital(리포 밖 `niney-tour-pickr`) | 입력 | `npm run data:export -- --thumbs s` 가 만든 `lp-*-2023/`(manifest exportVersion 1 + 10표 JSONL.gz + thumbs/s). 다른 권역은 tour-c 스크립트 사본 + `source-view` junction(TS_photo·VS_photo·SbL 을 제주식 배치로) 을 `TOUR_DATA_ROOT` 로 실행 — **코드 수정 없음**. 4세트 공용 POI·코드표 md5 동일 |
| AI 허브(aihub.or.kr) | 정책 | 이용조건(학습용 조항 vs FAQ 2차 저작물 자유 — 문언 충돌)·출처 표기·환수. 부록 B 문의문(4 데이터셋) 발송 후 서면 회신 전 공개 화면 노출 금지 |
| 국세청 사업자등록정보 진위확인·상태조회(data.go.kr **15081808**, odcloud) | 아웃바운드 | `POST …/nts-businessman/v1/status`, `DATA_GO_KR_API_KEY`(계정 공용 — 이 데이터셋 활용신청 필요), 100건/콜, `fetchWithTimeout` 20초. 수동(어드민 버튼·`check:tour-biz`)만, deploy 자동 실행 없음(쿼터) |
| [canonical](canonical.md) | 소비·재사용 | `RestaurantTourMatch.canonicalId` FK(cascade), `restaurant-store-match.service.storeNameScore` 재사용, `RestaurantStoreMatch` 와 같은 골격(canonical 당 1행·1:1·거리+이름·matched/missing·재실행 멱등). **(2026-09-26)** 어드민 식당 상세가 canonical 축으로 재구성됐다(리뷰·출처 행·요약 운영을 canonical 의 모든 행으로). `tour` 필드는 그 응답에 그대로 남았고(네이버 행의 `canonicalId` 로 조회), 표시만 '여행자' 탭으로 옮겨졌다. 헤더 삭제(네이버 행만)는 canonical 을 남기므로 `RestaurantTourMatch` 도 남는다 — 네이버 행이 유일했으면 행 없는 canonical 에 매칭만 매달린다(다음 `runMatch` 는 식당 행 없는 canonical 을 후보에서 빼지만, 기존 매칭 행을 지우지는 않는다 — 아래 Gotchas) |
| 맛집 공개 API([restaurant.service.ts](../../apps/friendly/src/modules/restaurant/restaurant.service.ts)) | 결합 | `getPublicList`(canonicalId 500개씩 `getPublicListTourMap` → 행 `tour`, `sort=tourTravelers|tourScore` 는 null 뒤로), `getPublicDetail`(`getRestaurantTourSummary`), `smartPick`(`traveler` = `travelerWeight` 만, `balanced` = 감성·만족·여행자 중 있는 점수 평균 → 리뷰 분석 없는 매칭 가게도 후보, `avgTravelerScore`), 어드민 상세 `tour: getRestaurantTourMatchInfo` |
| [crawl](crawl.md) · [random-crawl](random-crawl.md) | 재사용 | `CrawlService.searchPlaces(query, bbox)`(네이버 검색, http/playwright)·`startCrawl(rawSourceUrl, actorId, 'create')`·`jobRegistry.subscribe(jobId)`(done → 매칭 재실행). 어드민 시드 표의 "등록 잡" 링크 `/admin/crawl-test/:jobId` |
| [life-map](life-map.md) | 공유 | `LifeMasterSync`(layer `tour`·`tour-<key>`), `status:life-map` 한 줄(`tour=` + `tour_<세트>=` + `tour_matched=`), deploy.sh `life_map_data` 의 세트 루프, 웹 배경 레이어 `LIFE_MAP_OVERLAYS=['crime','tour']`(utils [lifeCrime.ts](../../packages/utils/src/lifeCrime.ts) 에 정의)·`overlay` 하나만(범죄 통계와 배타)·prefs v5 |
| [housing](housing.md) · [bus](bus.md) | 유틸 재사용 | `iterateLines`(housing-price-master.service — gzip 스트림 줄 단위), `toServiceKeyPart`(bus-api.adapter — 서비스키 인코딩) |
| [vote](vote.md) | 아웃바운드 | `/travel/plan` → `/vote/new` `location.state { presetTitle, presetOptions }`(2~8곳, 로그인 필요) |
| 인증·플러그인([friendly](friendly.md)) | 가드 | `app.authenticate`·`app.requireAdmin`·`app.resolveSseAdmin`(사진 `?token=`), [rate-limit.ts](../../apps/friendly/src/plugins/rate-limit.ts) `RATE.tourRead` 120/분(공개 tour 라우트 6개), autoload `matchFilter /\.route\.(ts|js)$/` + `dirNameRoutePrefix:false`([app.ts](../../apps/friendly/src/app.ts)) |
| [api-contract](api-contract.md) · [utils](utils.md) · [shared](shared.md) | 계약·상수·훅 | `schemas/tour.ts`(690줄)·`restaurant.ts` tour 필드·`Routes.Tour`(공개 6·어드민 6·원본 7) / `tourLog.ts`(246줄, 키 이중 정의) / `tour.api.ts`·`useTour.ts` + `restaurant.api.publicTourStats`·`useRestaurantPublicTourStats` |
| [web](web.md) | 화면 | `/travel/jeju`·`/travel/plan`(lazy)·`/admin/tour`·상세 여행자 탭·목록/골라줘·일상지도 배경. ~~상단바 NAV "여행" 추가로 8개(폭 예산)~~ — 실측으로 바로잡음: 5차(`99991da`) 시점에 이미 상단바 NAV 12개 중 6번째였다. 2026-09-25(`2ff2c31` 주차·`4a2bff1` 바다) 이후엔 14개 중 7번째다(`홈·맛집·대중교통·주차·일상지도·집값·여행·날씨·바다·대기질·타로·사주(C)·사주(G)·식단`, [PublicTopBar.tsx](../../apps/web/src/components/PublicTopBar.tsx)·[PublicSidebar.tsx](../../apps/web/src/components/PublicSidebar.tsx) 같은 순서, 폭 예산은 [web](web.md)). **(2026-09-26)** 어드민 식당 상세 '여행자' 탭(공개 `TourTab` + `TourEvidenceSection`) |
| [api-docs](api-docs.md) | 외부 공개 | **(2026-09-24 `1b621c4`)** 공개 6개 라우트의 한국어 `summary` 가 `export:openapi` 를 거쳐 [openapi.json](../../docs/api/openapi.json)(`x-auth: public`, `x-rate-limit` 120/1분, tag `tour`)·[endpoints.md](../../docs/api/endpoints.md) `tour` 절에 실린다. 수기 [README.md](../../docs/api/README.md) 는 도메인 개요(4개 권역, 2023년 4~9월 표본, "집계만")와 7절 이용 조건(5명 미만 셀 제외·`null`, `sourceNote`·`sampleLabel` 표기, 원본 수준 재구성·재배포 금지)을 적었다. [cors.ts](../../apps/friendly/src/plugins/cors.ts) 는 어드민 외 `origin: '*'`·`credentials: false` 다 — 공개 tour 라우트는 열리고, `/api/v1/admin/tour/**`(시드·매칭·원본 열람·사진)는 prod 에서 `PUBLIC_ORIGIN` 만 허용한다 |
| [mobile](mobile.md) | 없음 | 앱에 여행로그 화면·훅 사용 없음(후속 후보: WebView 또는 네이티브 탭) |
| lru-cache · playwright | 라이브러리 | 인사이트/숙소/지역 LRU(max 200, 10분)·밀도(max 20) / e2e 크로미움 |

## API Surface [coverage: high — 15 sources]

### HTTP — 공개 층 (인증 없음, `tags: ['tour']`, `RATE.tourRead` 120/분, 응답에 여행·방문·여행자 식별자 없음)

| 라우트 | 입력 | 응답 | 억제·비고 |
|---|---|---|---|
| `GET /api/v1/tour/public/insights` | `region=jeju`(21키)·`ageGrp`(20/30/40/50/60)·`gender`(남/여)·`accompany`(≤40자)·`month`(4~9)·`nights`(0~4, 4 = 4박+) | `TourInsightsResult` — filters·insufficient·scale·nights·months·accompany·hourType·typeSat·transitions·templates·emd·reasons·spendComposition·tripSpend·mvmn·`airportNext`+`hubLabel`·residence·ageGender·sampleLabel·sourceNote | 여행 <20 `insufficient`, 셀 n<5 제거, LRU 10분 |
| `POST /api/v1/tour/public/plan` | `TourPlanBody`(insights 와 같은 필드) | `TourPlanResult` — matchedTrips·relaxed[]·insufficient·places[{name,kind,sigungu,emd,n,mean,score,placeId}]·templates | 사다리 month→gender→nights→ageGrp, 장소 n≥5·평가≥3·score>0 상위 24, `placeId` 는 등록 맛집의 네이버 id |
| `GET /api/v1/tour/public/density` | `kind=all\|restaurant`, `bbox=minLng,minLat,maxLng,maxLat`(선택) | `TourDensityResult` — kind·cellDeg 0.02·cells[{x,y,n,travelers}]·breaks[4]·total | 여행자 ≥5 칸만, LRU max 20 |
| `GET /api/v1/tour/public/lodging` | insights 쿼리 | `TourLodgingResult` — total{trips,withLodging,rsvtRate}·types[{label,n,trips,amountMedian,nightlyMedian,perPersonMedian,rsvtRate,visits,mean}] | 유형 여행 ≥5, 금액·평가 3건 미만 null |
| `GET /api/v1/tour/public/regions` | insights 쿼리 | `TourRegionsResult` — groups[{key,label,trips,visits,share,mean,restaurants,restaurantMean,stayMedian,spendPpMedian,topTypes,topEmd}]·emd[≤20] | jeju = `jeju-si/seogwipo/island` 3집단, 그 밖 시군구 상위 8(여행 ≥5), 읍면동 방문 ≥5 |
| `GET /api/v1/restaurants/public/:placeId/tour-stats` | 네이버 placeId | `RestaurantTourStats`(summary + 분포 15종) | 식당 없음·매칭 없음·장소 없음 → 404 "여행로그 통계가 없는 식당입니다" |
| (기존 확장) `GET /restaurants/public` | `sort=tourTravelers\|tourScore` | 행 `tour: {nTravelers,bayesScore,spendPpMedian,revisitRate}\|null` | 매칭 없는 행은 뒤로 |
| (기존 확장) `GET /restaurants/public/:placeId` | — | `tour: RestaurantTourSummary\|null`(nTravelers·nVisits·nRated·bayesScore·meanDgstfn·revisitRate·stayMedian·spendPpMedian·topReasonNm·sampleLabel·sourceNote) | nRated<3 → bayesScore null |
| (기존 확장) `POST /restaurants/public/smart-pick` | `strategy: 'traveler'` 추가 | `avgTravelerScore` | traveler = `(bayes−1)/4`, balanced 는 있는 점수 평균 |

**(2026-09-24 `1b621c4`) 한국어 `summary` — 외부 문서의 원문.** 위 6개 전용 라우트는 `schema.summary` 를 달고 `export:openapi` 로 [endpoints.md](../../docs/api/endpoints.md) `## tour` 절에 "공개 · 120/분" 으로 실린다([tour-public.route.ts](../../apps/friendly/src/modules/tour/tour-public.route.ts)). 동작 변화는 없다.

| 라우트 | `summary` |
|---|---|
| `GET /tour/public/density` | 여행자 방문 밀도 격자(0.02°) — 여행 5건 미만 칸 제외, bbox 선택 |
| `GET /tour/public/lodging` | 여행 숙소 유형별 통계 — 결제액·1박 추정·예약률·만족도, 지역·연령 등 필터 |
| `GET /tour/public/regions` | 여행 지역 비교 — 시군구(제주는 제주시·서귀포·부속섬) 집단·읍면동 상위 통계 |
| `GET /restaurants/public/:placeId/tour-stats` | 맛집 여행자 방문 통계("여행자" 탭) — 집계만, 여행로그 매칭 없는 식당은 404. `description`: 2023년 4~9월 표본 가공 집계, 식별자 없음, 동반·연령 집단 5건 미만 제외, 평점·지출은 표본 3건 미만·재방문율·체류는 방문 5건 미만이면 null |
| `GET /tour/public/insights` | 여행 인사이트 집계 — 지역·연령·성별·동반·월·박수 필터, 여행 20건 미만이면 insufficient |
| `POST /tour/public/plan` | 비슷한 여행자 기반 코스 추천 — 조건 부족 시 월→성별→박수→연령 순 완화 |

목록·상세·골라줘(`/restaurants/public*`)의 여행로그 확장 필드·`sort`·`strategy` 는 [endpoints.md](../../docs/api/endpoints.md) `## public` 절(골라줘 설명 "AI 분석·여행자 점수 가중")에 있다. 관리자·원본 열람 층(아래)은 어드민 라우트라 외부 문서 대상이 아니다.

### HTTP — 관리자 층 (`authenticate` + `requireAdmin`, `tags: ['admin']`)

| 라우트 | 입력 | 응답 |
|---|---|---|
| `GET /api/v1/admin/tour/status` | — | `TourAdminStatus` — loaded·places·baseDate·sourceFile·loadedAt·counts(표 10)·`datasets[]`(key·label·loaded·places·trips·visits·photos·baseDate·sourceFile·loadedAt)·match{matched,missing,candidates}·biz{checked,open,suspended,closed,unknown,lastCheckedAt,keyConfigured}·seeds{restaurants,t5,t3,unmatchedT5}·thumbsDir·thumbsExists |
| `GET /api/v1/admin/tour/seeds` | `region=jeju`(기본, 21키)·`minTravelers=5`(1~1000)·`status=all\|unmatched\|matched\|closed`·`q`(≤60)·`limit=50`(≤100)·`offset` | `TourSeedList` — items[장소 집계 + `match{canonicalId,naverPlaceId,restaurantName,distM,nameScore,status}` + `biz{brno,bStt,endDt,checkedAt}`]·total |
| `POST /api/v1/admin/tour/seeds/:placeId/discover` | — | `TourSeedDiscoverResult` — query·candidates[{placeId,name,category,address,roadAddress,lat,lng,thumbnailUrl,reviewCount,rawSourceUrl,distM,nameScore,accepted,registered}]·source(http\|playwright). 장소 없음 404 |
| `POST /api/v1/admin/tour/seeds/:placeId/register` | `{rawSourceUrl: url}` | `TourSeedRegisterResult` — `start: StartCrawlResult`(ok → jobId, 끝나면 매칭 자동 재실행) |
| `POST /api/v1/admin/tour/match/run` | — | `TourMatchRunResult` — scanned·created·rematched·kept·newlyMissing·stillMissing·recovered·unmatched·durationMs(동시 호출은 진행 중 프로미스 공유) |
| `POST /api/v1/admin/tour/biz-status/run` | `{maxCalls=10(1~50), minTravelers=3, region=jeju, force=false}` | `TourBizCheckResult` — candidates·pending·calls·checked·byStatus{open,suspended,closed,unknown}·stopped(done\|maxCalls\|auth\|quota\|error)·error |
| (기존) `GET /api/v1/admin/restaurants/place/:placeId`(26차 표기 `/admin/restaurants/:placeId` 는 오기 — `Routes.Restaurant.byPlaceId`) | — | `tour: RestaurantTourMatchInfo\|null`(tourPlaceId·placeName·typeShort·distM·nameScore·status·matchedAt·장소 집계·bizStatus). **(2026-09-26)** 같은 응답이 `canonicalId`·`sources`·출처 통합 `reviews` 를 싣게 됐다([canonical](canonical.md)). `tour` 는 그대로 네이버 행의 canonicalId 로 조회한다 |

### HTTP — 원본 열람 층 (`authenticate` + `requireAdmin` + `requireTourRaw`, 응답 `Cache-Control: private, no-store`·`X-Robots-Tag: noindex, nofollow`, allowlist 밖·없는 장소 404)

| 라우트 | 입력 | 응답 |
|---|---|---|
| `GET /api/v1/admin/tour/places/:placeId/visits` | `limit=50`(≤200)·`offset` | `TourRawVisitsResult` — 방문 행(travelId·travelerLabel·visitDate·dayIndex·arrivalTs·stayMin·dgstfn·revisitInt·rcmdInt·revisitYn·reasonNm·mvmnNm·spendSum·spendPp·nPhotos·nActivities·gender·ageGrp·accompany·residenceSido·nights·month·prevPlaceName·nextPlaceName), 최신순 |
| `…/activities` · `…/spend` · `…/photos` · `…/trips` | 같은 페이지 쿼리 | 주문 원문(typeNm·seq·detail·rsvtYn…) / 영수증(storeNm·brno·amount·payNum·perPerson·methodNm·paidTs·roadAddr…) / 사진 메타(hasThumb 만, `sizes` 서버 보유 크기) / 포함 여행(`TourRawTripSummary` + days[{dayIndex,visitDate,nStops,typeSeq,placeSeq}]) |
| `GET /api/v1/admin/tour/trips/:travelId` | — | `TourRawTripDetail` — trip·companions·visits[방문 순서 + activities·spend·photoIds, 비공개는 privateRole 만]·otherSpend(숙박·이동·사전) |
| `GET /api/v1/admin/tour/photos/:photoId/:size` | `size=s\|m`, `?token=`(선택) | `image/webp` 스트림(사진 행 dataset 의 썸네일 폴더). id 정규식 위반 400, 없는 파일·크기 404 |

라우트 등록은 `decodeURIComponent(Routes.Tour.x(':placeId'))` — `Routes` 빌더가 인자를 인코딩하므로 등록부에서 `:param` 을 되돌린다(LifeMap.detail 규약). `Routes.Tour`([routes.ts](../../packages/api-contract/src/routes.ts)) 는 `adminStatus/adminSeeds/adminSeedDiscover/adminSeedRegister/adminMatchRun/adminBizStatusRun` · `adminPlaceVisits/Activities/Spend/Photos/Trips/adminTrip/adminPhoto` · `publicRestaurantStats/publicInsights/publicPlan/publicDensity/publicLodging/publicRegions`.

### 스크립트 (`apps/friendly/package.json`, `tsx --env-file=.env`)

| 명령 | 하는 일 |
|---|---|
| `load:tour [dir] [--dataset jeju\|west\|east\|capital] [--dry-run]` | dir 기본 `<리포>/data/open/tour/<exportName>`(스크립트는 `import.meta.url` 로 리포 루트 계산). manifest 검증(exportVersion·format·표 10·파일 존재·bytes) → plausibility → 세트 교체 → 표별 리포트(읽음/채택/제외 사유·좌표 이상·미지 유형, manifest 행 수 불일치 경고) → 세트별 상태 출력. 제주 25만 행 1~2분, 다른 세트 약 1분 |
| `unload:tour --yes [--dataset <key>]` | 세트(또는 전부) 표 9개 + 매칭·사업자 상태 삭제 + count 0 이력. 썸네일 파일은 직접 삭제 |
| `match:restaurant-tour [--dry-run]` | TourPlace 0 이면 종료. 전 canonical 검토 → 결과·사라짐 리포트(2,000건마다 진행) |
| `check:tour-biz [--max-calls=10] [--min-travelers=3] [--region=jeju\|all] [--force]` | 국세청 조회. `--region` 은 CLI 에서 `all` 아니면 `jeju`(서비스는 21키 전부 받는다) |
| `e2e:tour [--web=] [--api=] [--shots=] [--headed]` | 실서버 e2e 32 step(위) |
| `status:life-map` | `ok … tour=T tour_jeju=… tour_west=… tour_east=… tour_capital=… tour_matched=X …`(세트 키는 `TOUR_DATASET_KEYS` 순서). 2026-09-24(`ad48f96`)부터 `store=S` 와 `tour=` 사이에 `flood=F` 가 있다 |

### FE 공통 export ([tour.api.ts](../../packages/shared/src/api/tour.api.ts)·[useTour.ts](../../packages/shared/src/hooks/useTour.ts))

`tourApi.publicInsights/publicPlan/publicDensity(kind,bbox?)/publicLodging/publicRegions` · `adminStatus/adminSeeds/adminDiscover/adminRegister/adminMatchRun/adminBizCheck` · `adminPlaceVisits/Activities/Spend/Photos/Trips/adminTrip` · `getTourPhotoBase()`(baseUrl + 토큰 1회) · `tourPhotoUrl(base, photoId, size)`(`?token=`). 훅: `useTourInsights(params)`(키 `tourInsightsKey` = region|ageGrp|gender|accompany|month|nights, staleTime 10분, placeholderData 유지)·`useTourPlan`(뮤테이션)·`useTourDensity(kind, enabled)`(staleTime 24h, 켠 동안만)·`useTourLodging`·`useTourRegions` / `useTourAdminStatus`(30초)·`useTourSeeds`·`useTourSeedDiscover`·`useTourSeedRegister`·`useTourMatchRun`·`useTourBizCheck`(성공 시 `['admin','tour']` 무효화) / `useTourRawVisits/Activities/Spend/Photos/Trips(placeId|null)`·`useTourRawTrip(travelId|null)`(null 이면 비활성, retry:false, 5분)·`useTourPhotoBase`. 맛집 쪽: `restaurantApi.publicTourStats`·`useRestaurantPublicTourStats(placeId|null)`.

### 환경 변수 ([env.ts](../../apps/friendly/src/config/env.ts)·[.env.example](../../apps/friendly/.env.example)·[deploy.sh](../../deploy.sh))

| 키 | 뜻 |
|---|---|
| `TOUR_RAW_USER_IDS` | 원본 열람 allowlist — user id(cuid) 또는 이메일, 쉼표. 비우면 원본 라우트 전부 404. 바꾼 뒤 `pm2 restart friendly`(기동 시 읽음) |
| `TOUR_THUMBS_DIR` · `TOUR_THUMBS_DIR_WEST` · `TOUR_THUMBS_DIR_EAST` · `TOUR_THUMBS_DIR_CAPITAL` | 세트별 썸네일 폴더. 비우면 `data/open/tour/<exportName>/thumbs` |
| `DATA_GO_KR_API_KEY` | 국세청 15081808 활용신청(계정 공용 키) |
| `TOUR_EXPORT_DIR` · `TOUR_WEST_EXPORT_DIR` · `TOUR_EAST_EXPORT_DIR` · `TOUR_CAPITAL_EXPORT_DIR` | deploy.sh 전용 — 기본 `$LIFE_DATA_DIR/tour/lp-2023`·`lp-west-2023`·`lp-east-2023`·`lp-capital-2023` |

### 배포 절차 ([deploy-friendly.md](../../docs/deploy-friendly.md) §여행로그, [deploy.sh](../../deploy.sh))

1. 로컬 export 4폴더를 `rsync -av --delete data/open/tour/<export>/ samplepcb@<host>:/home/samplepcb/niney-life-pickr-v2/data/open/tour/<export>/` 로 올린다(git 밖 — `.gitignore` 의 `/data/`).
2. `pnpm --filter friendly load:tour --dataset jeju --dry-run`(manifest sha·정규화 리포트 — FTP 로 올렸으면 여기서 깨짐을 잡는다) → 세트별 `load:tour --dataset <key>`(경로 인자는 **절대경로** — `--filter` 는 `apps/friendly` 기준) → `match:restaurant-tour`(먼저 `--dry-run` 으로 매칭률) → `status:life-map` 확인.
3. API 배포(케이스 1·2·4)의 `life_map_data` 는 `tour_<세트>=0` 이고 `<dir>/manifest.json` 이 있으면 "키|폴더|이름" 루프로 세트별 자동 적재 후 매칭 한 번(폴더 없으면 안내만). **`./deploy.sh 6` 은 force 라 CCTV·화장실·병의원·상가까지 전부 재적재하므로 여행로그만 넣을 땐 쓰지 않는다.** (2026-09-24 이후 force 는 서울 열린데이터에서 침수흔적도 목록을 다시 받는 `load:life-flood --download` 까지 돈다. 2026-09-25 부터 케이스 1·2·4 는 `life_map_data` 뒤에 `parking_data` 도 부른다 — [deploy.sh:164-176](../../deploy.sh) 여행로그 루프 자체는 그대로.)
4. `.env` 에 `TOUR_RAW_USER_IDS`·(다른 위치면) `TOUR_THUMBS_DIR*` → `pm2 restart`. 관리자 원본 화면은 Cloudflare 프록시를 거치지 않는 경로(DNS 전용 서브도메인 또는 `ssh -L 3000:127.0.0.1:3000`) 권장.
5. 환수·폐기: `unload:tour --yes`(전부) 또는 `--yes --dataset <key>` + `rm -rf data/open/tour/<export>`.

## Data [coverage: high — 9 sources]

**(2026-09-24~26) 변화 없음** — Tour* 10표·사이드 2표·마이그레이션·export 규격·적재 규모가 그대로다. `schema.prisma` 에서는 앞쪽에 `LifeFloodTrace`(`ad48f96`)와 `Parking*`·`Ev*` 5모델(`2ff2c31`)이 들어와 줄 번호만 +162 밀렸다(2026-09-26 기준 `TourPlace` :2522 ~ `TourCode` :2903, `RestaurantTourMatch` :2918, `TourPlaceBizStatus` :2937).

### Prisma 모델 12개 — `Tour*` 10(FK 없음, `dataset` 열 기본 `'jeju'`) + 사이드 테이블 2

| 모델(테이블) | 키 | 주요 열 | 인덱스 |
|---|---|---|---|
| `TourPlace`(`tour_places`) | `id` = place_id(+접두) | name·aliases·typeCd·typeNm·**typeShort**·poiId·roadAddr·lotAddr·lat·lng·sido·sigungu·emd·region·isJeju·isIsland·nVisits·**nTravelers**·nRated·meanDgstfn·**bayesScore**·meanRevisitInt·meanRcmdInt·revisitRate·stayMedian·nPhotos·spendPpMedian·spendN·nActivities·topReasonNm·nLodging·lodgingTypeNm·firstSeen·lastSeen·firstDayShare·searchText | (lat,lng)·(typeShort,nTravelers)·(isJeju,typeShort)·(dataset)·(sido,typeShort) |
| `TourTrip`(`tour_trips`) | `id` = travel_id | **visitSidos**(7차 파생 `",전북,대전,"`)·travelerLabel(`여행자 #0001`)·startDate·endDate·nights·month·startWeekday·personaMission·missionCodes/Names·mvmnNm·gender·ageGrp·residenceSido·accompany·companionsNum·destination·style1~8·motive1~3Nm·nVisits·nPublic·nJeju·nIsland·nPhotos·nActivities·spendActivity/Lodge/Move/Adv/Total·gpsKm·gpsHours·hasGps·mainRegion·first/lastPlaceId·first/lastPlaceName·lodgingTypes·meanDgstfn·regions·coverPhotoId | (ageGrp,accompany,nights)·(nJeju)·(month)·(dataset) |
| `TourVisit`(`tour_visits`) | `id` = `travelId:visitAreaId` | travelId·visitAreaId·visitOrder·dayIndex·visitDate·arrivalTs·departTs·stayMin·travelMinFromPrev·travelMinRaw·typeCd·typeNm·typeShort·**isPrivate**·privateRole·placeId?·name?·poiId·poiNm·roadAddr?·lotAddr?·lat?·lng?·sido·sigungu·emd·region·isJeju·isIsland·revisitYn·reasonCd/Nm·lodgingTypeCd/Nm·dgstfn·revisitInt·rcmdInt·mvmnCd/Nm(2)·nPhotos·nActivities·spendSum·spendPp·prevPlaceId·nextPlaceId·arrivalHour·arrivalWeekday·gender·ageGrp·accompany·residenceSido·nights·month·personaMission·travelerLabel | (placeId)·(travelId,visitOrder)·(isJeju,typeShort,isPrivate)·(emd)·(dataset)·(sido,typeShort,isPrivate) |
| `TourActivity`(`tour_activities`) | autoincrement | travelId·visitAreaId·placeId?·isPrivate·typeCd·typeNm·seq·detail(주문 원문)·rsvtYn·expndSe/Nm·admissionNm·visitDate·dayIndex·visitTypeCd/Nm·region·isJeju·gender·ageGrp·accompany·month | (placeId)·(travelId,visitAreaId)·(dataset) |
| `TourSpend`(`tour_spend`) | autoincrement(export spend_id 는 버림) | travelId·category·categoryCd·visitAreaId?·placeId?·subtypeCd/Nm·item·storeNm·**brno**·amount·payNum·perPerson·methodCd/Nm·paidTs·paidHour·rsvtYn·etcText·roadAddr·sggCd·dayIndex·gender·ageGrp·accompany·residenceSido·nights·month | (placeId)·(brno)·(travelId)·(dataset) |
| `TourTransition`(`tour_transitions`) | autoincrement | **fromSido·toSido**(7차)·travelId·dayIndex·fromVisitId·toVisitId·from/toPlaceId·from/toName·from/toTypeCd·from/toType·mvmnCd/Nm·travelMin·sameDay·viaPrivate·bothJeju·from/toRegion·속성 6 | (fromPlaceId)·(toPlaceId)·(fromType,toType)·(travelId)·(dataset)·(fromSido,toSido) |
| `TourDaySequence`(`tour_day_sequences`) | `id` = `travelId:dayIndex` | **sidos**(7차)·travelId·dayIndex·visitDate·nStops·typeSeq(`교통>식당>자연>숙소`)·placeSeq·placeIds(접두 항목마다)·isJejuDay·isLastDay·속성 6 | (isJejuDay)·(travelId)·(dataset) |
| `TourCompanion`(`tour_companions`) | autoincrement | travelId·seq·relCd/Nm·genderNm·ageNm·situationNm | (travelId)·(dataset) |
| `TourPhoto`(`tour_photos`) | `id` = photo_id(`h00003002003p0001` 꼴) | travelId?·visitAreaId?·placeId?·placeName·takenTs·takenHour·takenDate·width·height·**hasThumb**·caption·captionTokens·landmark·hasCaption·visitTypeCd/Nm·region·isJeju·dayIndex·source(기본 `train`)·seq·속성 5 — 촬영 좌표·파일명 없음 | (placeId)·(travelId)·(dataset) |
| `TourCode`(`tour_codes`) | autoincrement | cdA·groupNm·cdB·cdNm·orderNum·delFlag — 세트 공용(`dataset` 열 없음), 238행 | (cdA) |
| `RestaurantTourMatch`(`restaurant_tour_matches`) | `canonicalId` PK(FK cascade) · `tourPlaceId` **unique** | placeName·typeShort·distM·nameScore·status(matched\|missing)·matchedAt·lastSeenAt | (status) |
| `TourPlaceBizStatus`(`tour_place_biz_statuses`) | `placeId` PK | brno·storeNm·bStt(계속사업자\|휴업자\|폐업자\|unknown)·bSttCd·endDt(`YYYY-MM-DD`)·taxType·checkedAt | (bStt)·(brno) |

마이그레이션 3: [20260913062022_add_tour_log](../../apps/friendly/prisma/migrations/20260913062022_add_tour_log/migration.sql)(Tour* 10표 + 인덱스 23), [20260913064102_add_tour_match_biz](../../apps/friendly/prisma/migrations/20260913064102_add_tour_match_biz/migration.sql)(사이드 2표), [20260915185047_add_tour_dataset_multi](../../apps/friendly/prisma/migrations/20260915185047_add_tour_dataset_multi/migration.sql)(SQLite RedefineTables 로 9표에 `dataset` + 파생 열 + 인덱스 추가 후 **기존 제주 행 파생 열 1회 백필 UPDATE** — 재적재 없이 운영 DB 를 맞춘다). `LifeMasterSync` 는 기존 표(layer `tour`·`tour-west`·`tour-east`·`tour-capital`).

### export 규격(exportVersion 1, `format: "jsonl.gz"`)과 세트별 행 수

`manifest.json`: `exportVersion`·`format`·`dataset`(**항상 `aihub-71780`** — tour-c 고정)·`name`·`region`·`built_at`·`source.rules[]`·`tables{name:{file,rows,bytes,sha256,columns}}`·`thumbs{s,m}`. 로더의 createMany 열 수(dataset 포함): places 38 · trips 53 · visits 59 · activities 23 · spend 29 · transitions 27 · day_sequences 17 · companions 8 · photos 28 · codes 6.

| 표 | 제주·도서 `lp-2023`(71780) | 서부권 `lp-west-2023`(71779) | 동부권 `lp-east-2023`(71778) | 수도권 `lp-capital-2023`(71581) | 합계 |
|---|---:|---:|---:|---:|---:|
| places | 15,679 | 11,516 | 12,531 | 10,545 | **50,271** |
| trips | 2,880 | 2,880 | 2,880 | 2,880 | 11,520 |
| visits | 51,596 | 31,875 | 32,930 | 24,154 | 140,555 |
| activities | 60,957 | 36,204 | 38,109 | 26,805 | 162,075 |
| spend | 43,664 | 25,935 | 27,615 | 19,458 | 116,672 |
| transitions | 42,385 | 22,626 | 23,772 | 14,791 | 103,574 |
| day_sequences | 7,633 | 4,693 | 4,783 | 4,024 | 21,133 |
| companions | 4,427 | 4,272 | 4,410 | 3,977 | 17,086 |
| photos | 17,513 | 16,871 | 16,582 | 16,756 | 67,722 |
| codes | 238(공용) | — | — | — | 238 |
| JSONL / 썸네일 s | 17MB / 178MB(17,513장) | 11MB / 184MB | 12MB / 172MB(16,581장) | 8.4MB / 186MB(16,755장) | 세트당 ~190MB |
| export 일자 · 장소 id | 2026-09-13 · 접두 없음 | 09-16 · `west:` | 09-18 · `east:` | 09-19 · `capital:` | |
| 표본 시도 | 제주 | 전북·전남·충남·대전·충북·광주·세종 | 강원·경북·경남·부산·대구·울산 | 서울·경기·인천 | |

(행 수 출처: [data-sources.md](../../docs/data-sources.md) tour 행 4개 — 재취득이 어려워 **백업 대상**. 원본 사진 449GB 는 2026-09-19 삭제, 썸네일 보관본은 `tour-c*/data/thumbs`.) 수도권은 표본 성격이 다르다 — 수도권 거주자 85% 의 근교 나들이(당일 67%, 비공개 집·친지 27%)라 장소당 표본이 얇고 **식당 4,761곳 중 여행자 5명↑ 41곳(서울 6곳)** 뿐이라 시드 발굴보다 운영 맛집 매칭(서울 1,810곳)·서울 밀도(5명↑ 칸 143)·나들이 코스 용도. 내보내지 않는 것: `travelers`(설문 원문 — 학력·직업·소득), `raw_*` 14표, GPS, POI 마스터, 캡션 JSON 원본(CC-BY-SA-4.0 — 공개 화면에 안 씀), 원본 JPG.

### 지역 21키 ([tourLog.ts](../../packages/utils/src/tourLog.ts) `TOUR_REGIONS`)

| 키 | 라벨 | parent | 조건 | center(zoom) | 거점(`hubs`) → `hubLabel` |
|---|---|---|---|---|---|
| `jeju` | 제주 | — | `isJeju`(본섬+부속섬) | 33.38,126.55(10) | 제주국제공항 → "공항 다음 첫 목적지" |
| `west` | 서부권 | — | 7개 시도 합 | 36.0,127.1(8) | 아래 6개 시도 거점 합 → "역·터미널·공항 다음 첫 목적지" |
| `jeonbuk` | 전북 | west | sido=전북 | 35.75,127.05(9) | 전주역·익산역·전주고속/시외버스터미널·군산역 |
| `jeonnam` | 전남 | west | 전남 | 34.85,126.95(8) | 여수엑스포역·여수공항·목포역·순천역·광주송정역·여수시외버스터미널 |
| `chungnam` | 충남 | west | 충남 | 36.55,126.75(9) | 천안아산역·천안역·공주역·천안종합버스터미널 |
| `daejeon` | 대전 | west | 대전 | 36.35,127.38(11) | 대전역·서대전역·대전복합터미널·유성시외버스터미널 |
| `chungbuk` | 충북 | west | 충북 | 36.8,127.75(9) | 오송역·청주국제공항·청주공항·충주역·제천역·청주시외버스터미널 |
| `gwangju` | 광주 | west | 광주 | 35.16,126.85(11) | 광주송정역·광주공항·광주종합버스터미널·유스퀘어 |
| `sejong` | 세종 | west | 세종 | 36.55,127.28(11) | 오송역 |
| `east` | 동부권 | — | 6개 시도 합 | 36.3,128.8(7) | 아래 6개 합(동부권 전이 표에서 여행자 8명 이상 실측, 휴게소 제외) |
| `gangwon` | 강원 | east | 강원 | 37.75,128.3(8) | 강릉역·강릉시외/고속버스터미널·속초고속/시외버스터미널·춘천역·양양종합여객터미널·양양국제공항·원주역 |
| `gyeongbuk` | 경북 | east | 경북 | 36.4,128.9(8) | 신경주역·경주역·경주시외/고속버스터미널·포항역·포항터미널·안동역·안동터미널·영주역·구미역 |
| `gyeongnam` | 경남 | east | 경남 | 35.3,128.3(8) | 진주역·창원중앙역·마산역·사천공항·통영종합버스터미널·거제고현버스터미널 |
| `busan` | 부산 | east | 부산 | 35.17,129.07(11) | 부산역·김해국제공항·부산종합/서부버스터미널·해운대시외버스정류소·부전역·구포역 |
| `daegu` | 대구 | east | 대구 | 35.85,128.6(11) | 동대구역·동대구터미널·대구역·대구국제공항·서대구역 |
| `ulsan` | 울산 | east | 울산 | 35.55,129.25(11) | 울산역·태화강역·울산시외/고속버스터미널·울산공항 |
| `capital` | 수도권 | — | 3개 시도 합 | 37.5,127.0(9) | 아래 3개 합(역·터미널·공항만 — 집 출발 표본이라 "거점 다음" 은 타지 거주자용) |
| `seoul` | 서울 | capital | 서울 | 37.5665,126.978(11) | 서울역·용산역·수서역·청량리역·서울고속버스터미널·센트럴시티터미널·동서울종합터미널·김포국제공항·김포공항 |
| `gyeonggi` | 경기 | capital | 경기 | 37.4,127.2(9) | 수원역·가평역·광명역·동탄역·평택역·의정부역·용문역 |
| `incheon` | 인천 | capital | 인천 | 37.45,126.7(11) | 인천국제공항·인천공항·인천종합버스터미널·인천역·송도역·강화여객자동차터미널 |
| `all` | 전체 | — | 없음 | 36.0,127.9(7) | 전부 → "공항·역·터미널 다음 첫 목적지" |

각 지역엔 "안" 판정 `bbox`(예: jeju `[33.0,125.9,34.2,127.2]`, capital `[36.9,124.6,38.3,127.9]`)가 있고, `tourSampleRegionAt(lat,lng)` 은 **데이터셋 키 4개의 bbox** 만 본다(표본 단위 지역). `TOUR_REGION_GROUPS` 는 `parent === null` 인 키(제주·서부권·동부권·수도권·전체)와 그 children — `TOUR_REGION_KEYS` 순서 = 권역 뒤에 그 권역의 시도(칩 순서, 테스트로 고정). 그 밖의 상수: `TOUR_TYPE_SHORTS` 14(자연·역사·문화·상업·레저·테마·산책·축제·교통·상점·식당·기타·체험·숙소), `TOUR_PRIVATE_TYPE_SHORTS`(집·친지·사무실), `TOUR_RESTAURANT_TYPE_SHORTS`(식당·상업·상점), `TOUR_K_MIN=5`, `TOUR_RATING_MIN_N=3`, `TOUR_DENSITY_CELL_DEG=0.02`(위도 ≈2.2km × 경도 ≈1.9km), 등급 5(드묾·적음·보통·많음·매우 많음, 청록 램프 `#ccfbf1→#134e4a` — 범죄 통계 호박색·점 레이어와 구분), `TOUR_SAMPLE_LABEL`, `TOUR_DATASET_NAMES/NAME`, `TOUR_SOURCE_NOTE`.

### 파일 위치

- 리포 밖 원천: `D:\work\workspace_other\niney-tour-pickr\tour-c*`(변환기·썸네일 보관본). 리포 안 export: `data/open/tour/<exportName>/`(`.gitignore` `/data/` — 문서 주석 목록엔 tour 가 빠져 있으나 규칙은 `/data/` 통째).
- 운영: `/home/samplepcb/niney-life-pickr-v2/data/open/tour/<export>/`(rsync), DB `apps/friendly/data/prod.db`.

## Key Decisions [coverage: high — 22 sources]

- **2026-09-26 어드민 식당 상세의 여행로그는 '여행자' 탭 한 곳에 — "공개 집계 + 근거"**(`420a6be`, 사용자 결정) — 26차의 "헤더 배지 + 본문 하단 근거 카드" 를 탭으로 옮겼다. 위에는 공개 `TourTab` 을 그대로 재사용해 사용자가 보는 집계를 똑같이 보여 주고, 아래에만 원본 근거(`TourEvidenceSection` — allowlist 층)를 둔다(페이지 주석: 공개 탭 컴포넌트를 그대로 써 "사용자가 보는 화면 = 어드민이 보는 화면"). 탭 노출 기준은 공개 요약(matched)이 아니라 어드민 매칭 정보(missing 포함)다. 그래서 후보에서 빠진 매칭도 근거로 검토할 수 있다. `TourMatchBadge` 는 새 헤더 컴포넌트에서 같은 자리를 지킨다. 탭 순서는 공개 상세(홈·분석·여행자·메뉴…)를 따른다.
- **2026-09-24 공개 6개 라우트를 외부 문서에 "공개" 로 — 계약·동작 변경 없이 `summary` 만**(`1b621c4`, 사용자 결정 "어드민 제외, 열 수 있는 건 다 열기") — 여행로그 공개 층은 4차부터 식별자 없는 zod + 소셀 억제라, 외부 문서(`openapi.json`·`endpoints.md`)는 그 계약을 그대로 보여 준다. 이용 조건(집계만·출처 문구 표기·원본 수준 재구성/재배포 금지)은 수기 `docs/api/README.md` 7절이 외부 사용자에게 전한다. 원본 열람·시드 콘솔은 `/api/v1/admin/**` 라 CORS 개방에서도 외부 문서에서도 빠진다. PLAN 의 "4~6차 배포는 AI 허브 회신 뒤" 조건과 맞춰 본 기록은 없다(Gotchas).

- **2026-09-19 수도권(71581)은 "표본 성격이 다르다" 를 인정하고 용도를 바꿈**(`6cae6b2`, 9차) — 거주자 나들이 표본(당일 67%)이라 5명↑ 식당이 41곳뿐 → 공개 장소 통계는 대부분 억제되므로 시드 발굴 대신 운영 맛집 매칭(서울 1,810곳)·서울 밀도 레이어·나들이 코스에 두고, 시드 콘솔은 하한 3명으로 본다. 거점은 역·터미널·공항만("거점 다음" 은 타지 거주자 15% 용). 서울이 표본 bbox 안으로 들어와 밀도 토글이 더 이상 이동하지 않는다(utils 테스트는 표본 밖 판정을 독도 동쪽 좌표로, e2e 는 "안이면 이동 없음" 분기). 로더·마이그레이션·region-filter·웹 컴포넌트 수정 없이 상수 + 계약 두 배열 + env + deploy 루프 항목만.
- **2026-09-19 권역 추가 비용을 "상수 한 줄 + 계약 두 배열 + deploy.sh 루프 한 항목" 으로 고정**(`93ae031`, 8차 동부권) — `TourRegionDef.parent` 로 권역 묶음을 파생(`TOUR_REGION_GROUPS`·`tourRegionGroupOf`)해 웹 지역 칩 2행·어드민 데이터셋 필터·출처 문구 데이터명이 상수에서 자동. `tourSampleRegionAt/nearestTourSampleRegion` 을 제주 특수 케이스에서 데이터셋 전체로 일반화(`isNearJeju`·`JEJU_CENTER` 는 별칭). `status:life-map` 의 `tour_<세트>` 도 키 순회. e2e 는 7차 뒤 낡은 step 2건(코스 화면 "전체" 버튼이 지역 칩과 겹침 → `.last()`, 밀도 토글은 가까운 표본 중심)을 고쳤다.
- **2026-09-16 한 DB 에 여러 세트를 나란히 — 데이터셋 단위 교체 + 장소 id 접두 + manifest 대신 내용 검사**(`d18ac24`, 7차) — 전량 교체를 "그 세트 행만" 으로 좁혀 다른 세트를 건드리지 않고, 장소 id 충돌은 첫 세트만 접두 없음(기존 이력·deploy 호환)으로 해결, tour-c 는 고치지 않고 `TOUR_DATA_ROOT` 로 재실행(manifest 가 늘 71780 이라 적재기가 제주 방문 비율로 `--dataset` 을 검증). 시도 필터를 위해 여행·일차·전이에 **파생 열을 SQL 로 채우고**(로더 + 1회 백필 마이그레이션), 지역 → 표별 where 를 `tour-region-filter.ts` 한 곳에 모아 인사이트·코스·숙소·지역비교·시드·폐업조회가 같은 지역을 같은 방식으로 자른다. "공항 다음" 은 지역별 거점 이름 조각 + `hubLabel` 로 일반화, 지역 비교는 제주 = 3집단 고정·그 밖 = 시군구 상위 8. 키 리터럴 이중 정의 + friendly 동일성 테스트(foodTaxonomy 규약).
- **2026-09-13 allowlist 는 user id 뿐 아니라 이메일도**(`cfa276b`) — 운영자가 이메일을 적는 게 자연스럽고, 실제로 운영에서 이메일을 넣었다가 전부 404 가 났다. 사진 라우트는 토큰에 이메일이 없어 DB 조회 한 번 추가. 같은 커밋이 배포 안내를 "`deploy.sh 6` 금지 → `load:tour --dry-run → load:tour → match:restaurant-tour` 직접" 으로 정정하고 경로는 절대경로로.
- **2026-09-13 공개 화면은 실서버 e2e 로 실측**(`8c27f5c`) — RTL 단위 테스트가 잡지 못하는 URL 쿼리·필터 갱신·지도 이동·localStorage·모바일 폭·콘솔 오류를 playwright 로 29건(→32건) 고정. 실서버 필요라 CI 가 아니라 배포 전 수동.
- **2026-09-13 지도 밀도는 격자 choropleth, 여행로그 장소 자체는 공개하지 않음**(`9196495`, 6차) — 0.02° 칸(여행자 5명 미만 제외)에 등급 5(20/40/60/80 분위 — 절대량이 아니라 "표본 안에서 어느 쪽인가", 범죄 통계와 같은 규칙)를 칠하고, 칸을 누르면 그 bbox 의 **등록 맛집**만 잇는다. 범죄 통계와 같은 `areas` 경로·`overlay` 하나(배타). SQLite 에 FLOOR 가 없어 `CAST` 절삭. 숙소 1박은 체크인·아웃이 없어 "결제액 × 숙박 건수 ÷ 박수" 추정(화면에 산식 표기). 밀도는 정적이라 웹 staleTime 24h·켠 동안만 조회.
- **2026-09-13 코스 추천은 완화 사다리 + tour-c 산식**(`99991da`, 5차) — 세그먼트 일치 여행이 20건 미만이면 month→gender→nights→ageGrp 순으로 풀고 `relaxed` 로 알려 "왜 이 조건이 무시됐나" 를 화면이 말한다. 점수 `n × (mean − 3.3)` 은 tour-c PlanPage 와 같은 값(로컬 탐색기와 결과 일치). 교통·숙소·비공개 제외. 결과는 그룹투표로 이어져(`/vote/new` state 프리필) 기존 기능과 닫힌 고리를 만든다. 필터는 URL 쿼리(tour-c 의 "URL 이 상태" 원칙). rate-limit `tourRead` 120/분.
- **2026-09-13 공개 층은 "식별자 없는 스키마 + 테스트의 키 스캔" 으로 고정**(`99991da`, 4차) — 응답 zod 에 `travelId/visitAreaId/travelerLabel/photoId` 가 아예 없어 serializer 가 걷어내고, [tour-public.test.ts](../../apps/friendly/src/modules/tour/tour-public.test.ts) 가 응답 객체를 재귀 스캔해 `FORBIDDEN_KEYS`(카멜·스네이크 + `tourPlaceId`) 0 을 고정, e2e 도 같은 스캔. 장소 요약은 평가 3건·표본 5명 하한, 집단 분해는 n≥5. 골라주기 `balanced` 는 "있는 점수의 평균" 이라 리뷰 분석 없는 매칭 가게도 후보에 든다.
- **2026-09-13 원본 층은 별도 모듈·별도 권한·별도 헤더**(`99991da`, 3차) — `tour-raw.*` 를 공개 서비스와 파일부터 나누고, admin 위에 `requireTourRaw`(allowlist 밖은 404 — 존재를 알리지 않음), 플러그인 스코프 onSend 로 `private, no-store`·`noindex`, 사진은 nginx 정적이 아니라 인증 라우트 스트리밍 + `?token=`. 비공개 방문은 타임라인 순서를 위해 역할만. 라우트 등록은 `decodeURIComponent(Routes…(':id'))`.
- **2026-09-13 매칭은 상가 매칭 골격을 그대로, 반경만 넓힘**(`c777380`, 2차) — `storeNameScore` 재사용, 100m·0.5 + 완전일치 300m(여행자 입력·POI 좌표가 거칠고 tour-c 병합 반경 300m), 장소 1:1(`tourPlaceId` unique), 재실행 안정(kept/missing/recovered), 대상은 좌표 있고 식당 행 있는 canonical 만(고아 7,969 제외). 폐업 확인은 영수증 사업자번호 최빈값으로 국세청 100건/콜, 30일 재조회 제외. 시드 콘솔의 등록은 새 파이프라인이 아니라 기존 크롤 잡 + 잡 완료 구독으로 매칭 자동 재실행.
- **2026-09-13 export 는 JSONL.gz 10표 + manifest, 적재기는 계약 위반을 조용히 넘기지 않음**(`c777380`, 1차) — CSV 대신 JSONL(형 보존·열 매핑 없음), 표마다 정규화 함수가 키·형을 명시, 제외 열(설문 원문·촬영 좌표)이 섞이면 적재 거부, 비공개 마스킹은 export 와 로더가 각각 재검증(`privateLeak`). 전량 교체 한 트랜잭션(청크 바인드 예산 30,000, timeout 60분), `unload:tour` 한 명령으로 환수 대비, `codes` 는 테이블로(PLAN 의 "utils 상수" 안과 다름).
- **2026-09-13 "한 DB, 두 출구" 와 범위 4결정**(PLAN 0차) — 맛집 한정이 아니라 모든 유형을 가져오고(식당 외 유형은 TourPlace 로 인사이트·코스에), 제3자에게 허용되는 것은 전부 구현, 운영에 원본은 관리자 전용·쓸모 있는 것만(시드·폐업·근거·참고 사진·코스 샘플), raw 14표·GPS·설문 원문·캡션은 올리지 않는다(tour-c 로컬이 이미 한다). 미확정 항목(서버 소재 국내 가정·관리자 1명·참고 사진 256px·AI 허브 서면 확인)은 PLAN 표에 남겨 두고 공개 배포를 회신에 걸었다.

## Gotchas [coverage: high — 22 sources]

**2026-09-24~26 새로 드러난 것**
- **외부 API 문서·CORS 개방과 PLAN 의 "공개는 AI 허브 서면 회신 뒤" 가 맞춰지지 않았다** — [PLAN-tour-log.md](../../docs/PLAN-tour-log.md) 는 서면 확인을 "4차(공개) 전에 받는다" 고 했고, 4~6차 행마다 "(배포는 AI 허브 회신 뒤)" 를 달았다. 그런데 `1b621c4` 이후 공개 6개 라우트가 [endpoints.md](../../docs/api/endpoints.md)·[openapi.json](../../docs/api/openapi.json) 에 "공개" 로 등재되고, [README.md](../../docs/api/README.md) 는 기준 URL `https://ninelife.kr` 로 다른 프로젝트가 쓰도록 안내하며, [cors.ts](../../apps/friendly/src/plugins/cors.ts) 는 브라우저 교차 출처 호출을 연다. 내용은 집계뿐이라 PLAN 이 구분한 "원본 제3자 제공 금지" 에는 걸리지 않는다. 다만 PLAN 이 문제 삼은 "학습용으로만" 조항 대 "2차 저작물 자유" 의 문언 충돌은 **공개 여부** 자체에 걸린 조건이다. 웹 화면만 막으면 되는지, API 문서화도 "공개" 인지 어느 문서에도 적혀 있지 않다(사용자 확인 필요). 라우트 자체는 원래 인증이 없어, 서버에 올라가 있으면 누구나 부를 수 있었다. 문서화와 CORS 개방은 그걸 "권장 사용" 으로 바꾼 것이다.
- **헤더 삭제·테스트 잔재로 생긴 고아 canonical 이 여행로그 장소를 계속 "선점" 한다** — `matchRestaurantTour` 는 `claimed` 를 **모든** 기존 매칭으로 채우지만, 훑는 대상은 식당 행이 있는 canonical(`TOUR_MATCH_CANONICAL_WHERE`)뿐이다([restaurant-tour-match.service.ts:61-77](../../apps/friendly/src/modules/tour/restaurant-tour-match.service.ts)). 그래서 식당 행이 모두 사라진 canonical 의 매칭 행은 `matched` 그대로 남는다(`missing` 으로도 안 바뀐다). 그 장소는 근처에 새로 등록된 같은 가게(새 canonical)에게 넘어가지 않고, `tour_matched`·어드민 상태의 `match.matched` 에도 계속 잡힌다. 경로는 둘이다. 하나는 어드민 식당 상세의 삭제 — `420a6be` 이후 출처 통합 헤더에 있지만 여전히 네이버 행만 지운다. 다른 하나는 dev.db 를 직접 쓰던 테스트다. 복구는 `unload:tour` 가 아니라 canonical 단위 삭제(`DELETE /admin/canonical/:id` → Cascade)다([canonical](canonical.md) Gotchas).
- **어드민 '여행자' 탭은 테스트·육안 검증이 없다** — [AdminRestaurantDetailPage.test.tsx](../../apps/web/src/routes/admin/AdminRestaurantDetailPage.test.tsx) 4건의 픽스처는 어드민·공개 응답 모두 `tour: null` 이다. 그래서 탭 노출(missing 포함)·`?tab=tour` 폴백·`TourTab` + `TourEvidenceSection` 2단 구성은 테스트로 고정되지 않았다. 커밋 본문도 "화면 육안 확인은 못 함(브라우저 확장 미연결)" 이라고 적었다. e2e(`e2e:tour`)가 보는 건 공개 화면과 관리자 API 의 무인증 거부까지다 — 어드민 화면은 돌지 않는다.

**PLAN ↔ 코드 어긋남([PLAN-tour-log.md](../../docs/PLAN-tour-log.md) 는 "계획 시점 기록, 커밋 이력이 진실" 이라 명시)**
- 공개 목록 정렬 파라미터: PLAN §공개 API `sort=tour_travelers | tour_score` ↔ 코드·계약 `tourTravelers | tourScore`([restaurant.ts](../../packages/api-contract/src/schemas/restaurant.ts)).
- 시드 목록 쿼리: PLAN `…&type=식당` ↔ 실제 `TourSeedQuery` 는 `region·minTravelers·status·q·limit·offset`(유형은 서버가 식당류 3종 고정). 로더 옵션 `--no-thumbs` 도 코드에 없다.
- "적재 시 공개 집계 캐시 무효화" 는 미구현 — `TourInsightsService.invalidate()`·`TourRegionService.invalidate()` 호출처가 없고 로더는 별도 프로세스라 재적재 후 서버 LRU 는 **TTL 10분**(PLAN 구조도의 1h 도 옛값) 으로만 갱신된다. 웹 밀도 훅은 staleTime 24h(메모리 캐시라 새로고침이면 초기화).
- `codes` 는 PLAN 의 "테이블 없이 utils 상수" 가 아니라 `TourCode`(`tour_codes`) 테이블(238행, 세트 공용 통째 교체). PLAN 의 `TourAggregateService` 는 실제로 `tour-public.service`(함수) + `TourInsightsService` + `TourRegionService` 셋.
- PLAN 테스트 표의 `tour-admin.test.ts`(allowlist·헤더·사진) 는 실제 [tour-raw.route.test.ts](../../apps/friendly/src/modules/tour/tour-raw.route.test.ts), `restaurant-tour-match.test.ts` 는 `.service.test.ts`.
- PLAN 웹 화면 표 "사이드바·홈 카드 — 홈 '여행' 메뉴" ↔ 홈([HomePage.tsx](../../apps/web/src/routes/HomePage.tsx))엔 여행 진입이 없다(사이드바·상단바만). 체크리스트의 `/about` 출처 표기도 about 페이지가 없어 해당 없음.
- 출처 문구 하드코딩 잔재: `TOUR_SOURCE_NOTE` 는 4개 데이터명을 자동으로 넣지만 [AdminTourPage.tsx](../../apps/web/src/routes/admin/AdminTourPage.tsx) 푸터(287줄)·[TourEvidencePanel.tsx](../../apps/web/src/components/admin/tour/TourEvidencePanel.tsx)(190줄) 는 「…(제주도 및 도서지역)」만(2026-09-26 재확인 — 두 파일 모두 이번 라운드 무변경. TourEvidencePanel 문구는 이제 어드민 식당 상세 '여행자' 탭에서도 수도권·동부권 장소에 그대로 뜬다), AdminTourPage 설명(98줄)은 "제주·도서 71780 + 서부권 71779"(8·9차 미반영), [SmartPickSection.tsx](../../apps/web/src/components/restaurant/SmartPickSection.tsx) 안내 "2023년 제주 여행자들이…"(210줄), TourTab·PublicRestaurantList 주석 "제주 패널". 어드민·주석이라 이용조건 위반은 아니지만 공개 골라줘 문구는 4권역 반영 필요.
- PLAN 부록 A 문구(제주 데이터명만)는 `TOUR_SOURCE_NOTE` 가 대체 — 문구 개정은 utils 상수 + 서버 응답 `sourceNote` 로 배포 없이 반영.

**운영 함정**
- **manifest.dataset 은 늘 `aihub-71780`** — 세트 판정은 `--dataset` + 제주 방문 비율(jeju ≥50%, 그 밖 ≤10%) 뿐. 틀리게 주면 적재 전에 던진다; 여행 0건 export(테스트)는 검사가 없다.
- **`./deploy.sh 6` 은 force** — CCTV·화장실·병의원·상가까지 전부 재적재(2026-09-24~ 침수 흔적 `load:life-flood --download` 도). 여행로그만 넣을 땐 `load:tour --dry-run → load:tour --dataset <key> → match:restaurant-tour` 직접(`cfa276b`). deploy 자동 적재는 `tour_<세트>=0` 일 때만(첫 적재) — 재적재는 항상 수동.
- **`pnpm --filter friendly load:tour <dir>` 의 dir 은 절대경로** — `--filter` 가 `apps/friendly` 를 cwd 로 쓴다(기본값 생략 시 스크립트가 `import.meta.url` 로 리포 루트를 계산). 서버 쪽 `tourDefaultExportDir` 는 cwd 두 후보(`apps/friendly`·리포 루트)만 본다.
- `TOUR_RAW_USER_IDS` 는 **기동 시** 읽는다 — 바꾸면 `pm2 restart friendly`. 비우면 원본 라우트 전부 404(존재 은닉이라 "권한 없음" 과 구분이 안 된다 — 웹은 404 를 권한 안내로 바꾼다). 이메일은 대소문자 무시, 사진 라우트는 DB 조회 한 번 더.
- `check:tour-biz` CLI 의 `--region` 은 `all` 아니면 `jeju` 로 강제(서비스·어드민은 21키/데이터셋 키 가능). `DATA_GO_KR_API_KEY` 에 15081808 활용신청이 없으면 401/403 → `auth` 즉시 중단. 국세청 쿼터라 deploy 에서 자동 실행하지 않는다.
- 어드민 상태의 `thumbsDir/thumbsExists` 는 **jeju 폴더만** 본다(`resolveTourThumbsDir(exportDir)` 기본 dataset) — 다른 세트 썸네일 유무는 상태 카드에 안 나오고, 원본 사진 탭의 `sizes` 는 어느 세트든 있으면 제공으로 친다(`TourRawService.thumbsSizes`).
- `unload:tour` 는 DB 만 비운다 — 썸네일 폴더(`data/open/tour/<export>/thumbs` 또는 `TOUR_THUMBS_DIR*`)는 직접 `rm -rf`. 환수 대응은 이 둘을 같이.
- `TourSpend.id` 는 자체 증가라 세트 재적재마다 바뀐다(원본 열람 영수증 표의 `id` 는 키로 저장하지 말 것).
- 수도권은 5명 하한에 공개 통계가 거의 억제된다 — `region=seoul` 인사이트는 여행 2,532건이지만 장소 단위(상세 여행자 탭·코스 장소)는 얇다. 시드 콘솔은 여행자 3명 이상으로 내려 본다.
- `deploy.sh` 110줄 주석의 status 형식엔 `tour_<세트>` 가 빠져 있다(코드는 출력, `stat_val` 은 키 단위라 무해). 2026-09-26 재확인: 여전히 110줄이고, 이제 `flood=` 도 빠져 있다(`life-map-status.ts` 머리 주석은 `flood=F` 를 반영).

**코드·테스트 함정**
- **키 이중 정의**: `TOUR_DATASET_KEYS`·`TOUR_REGION_KEYS` 는 [tourLog.ts](../../packages/utils/src/tourLog.ts) 와 [schemas/tour.ts](../../packages/api-contract/src/schemas/tour.ts) 둘 다에 리터럴로 있고 순서까지 같아야 한다(`toEqual`). 권역을 더 붙이면 utils 2곳 + 계약 2곳 + `TOUR_REGIONS`(권역 + 시도, `parent`) + env `TOUR_THUMBS_DIR_<KEY>`([env.ts](../../apps/friendly/src/config/env.ts) — `resolveTourThumbsDir` 는 `process.env` 를 직접 읽지만 스키마에 없으면 `.env.example` 안내가 빠진다) + deploy.sh 루프 "키|폴더|이름" + `TOUR_<KEY>_EXPORT_DIR`.
- **격리 DB 헬퍼가 dev.db 를 통째로 복사한다**([temp-db.ts](../../apps/friendly/src/test-utils/temp-db.ts) — 로컬 dev.db 3.5GB, tour 표 4세트 ~100만 행 포함) 뒤 모든 테이블을 `DELETE` 하므로 tour 테스트 8파일의 `beforeAll` 이 무겁다. ~~[vitest.config.ts](../../apps/friendly/vitest.config.ts) 엔 `hookTimeout` 설정이 없어(기본 10초) 디스크·CPU 부하 시 hook timeout 으로 깨질 수 있다 — 재실행하거나 `--hookTimeout` 을 늘린다.~~ (~2026-09-19 기준) **`5d7b686`(2026-09-25) 이 `hookTimeout: 60_000` 을 전역으로 넣었다.** 커밋 본문: "dev.db(3.6GB)를 통째로 복사해 비우느라 기본 10초를 넘겨, 파일 캐시가 차가운 전체 실행에서 간헐 실패"(parking.test 의 개별 180초 한도는 제거). friendly 전체 143파일·1,522 통과. 60초도 넘기면 다시 깨지므로 dev.db 가 더 커지면 같은 함정이 돌아온다. `fileParallelism:false` 라 파일은 직렬.
- 공개 응답에 새 필드를 더할 땐 이름을 `FORBIDDEN_KEYS`(`travelId|visitAreaId|travelerLabel|photoId|travel_id|visit_area_id|traveler_label|tourPlaceId`) 밖으로 — `placeId` 는 네이버 id 라 허용, 여행로그 장소 id 는 어떤 이름으로도 공개 응답에 넣지 않는다.
- 인사이트의 소비 조회는 region 을 SQL 에서 걸지 않고(`tourSpend` 는 sido 열이 없다) `tripIds` 로 JS 필터 — 4세트 116,672행을 매번 읽고 10분 캐시가 완충. 숙소도 같은 방식(여행 nights 맵으로 거른다).
- "식당" 의 정의가 두 곳에서 다르다 — 인사이트 `scale.restaurants`·지역 비교 `restaurants` 는 `typeShort === '식당'` 만, 밀도 `kind=restaurant`·매칭·시드·폐업은 `TOUR_RESTAURANT_TYPE_SHORTS`(식당·상업·상점).
- `LIFE_MAP_OVERLAYS=['crime','tour']` 는 파일명과 달리 utils [lifeCrime.ts](../../packages/utils/src/lifeCrime.ts) 에 있다(`isLifeMapOverlay` 도).
- `TourSeedQuery.region`·`TourBizCheckBody.region` 기본값은 `jeju` — API 를 직접 부르면 제주만 나온다(어드민 UI 는 `all` 로 시작). `TourInsightsQuery.accompany` 는 enum 이 아니라 자유 문자열(≤40, 원본 표기 그대로 — 웹 상수 `TOUR_ACCOMPANY_OPTIONS` 8종).
- 밀도 토글의 표본 판정은 **데이터셋 bbox 4개**만 — 시도 bbox 는 안 본다. 서울시청 기본 중심이 9차부터 안이라 e2e 가 "이동 없음" 분기를 탄다; 표본 밖 판정 테스트는 독도 동쪽(37.2,132.5) 좌표.
- e2e 는 실서버(friendly 3000·Vite 5173) 전제 — 5173 을 다른 프로젝트가 점유하면 `vite --port 5174` 로 띄우고 `--web=http://localhost:5174`. `API regions — 3집단` step 은 기본 region 이 제주라는 전제, `sort=tourTravelers` step 은 dev DB 에 제주 등록 맛집이 0 이면 매칭 0 을 통과로 본다. 칸 클릭 step 은 localStorage `lp:life-map-prefs` v5 를 직접 심어 점 레이어를 끈다.
- 라우트 등록에서 `decodeURIComponent(Routes.Tour.x(':placeId'))` 를 빼먹으면 `%3AplaceId` 경로가 등록돼 404 — 새 파라미터 라우트마다 반복.
- 어드민 `runMatch` 의 `matchInFlight` 는 모듈 전역(프로세스 하나) — 스크립트 `match:restaurant-tour` 와 어드민 버튼을 동시에 돌리면 게이트가 없다(둘 다 같은 규칙이라 결과는 같지만 `claimed` 경합으로 순서가 갈릴 수 있다).

## Sources [coverage: high — 101 sources]

### friendly — tour 모듈
- [apps/friendly/src/modules/tour/tour-master.service.ts](../../apps/friendly/src/modules/tour/tour-master.service.ts) — manifest 검증·JSONL 스트림·정규화 10표·plausibility·데이터셋 단위 교체·unload·적재 상태·경로 규칙
- [apps/friendly/src/modules/tour/tour-master.service.test.ts](../../apps/friendly/src/modules/tour/tour-master.service.test.ts) — 9건(키 동일성·id 접두·privateLeak·badCoord·badId/badField·제외 열·청크 예산·manifest 위반·교체→이력→재적재→unload)
- [apps/friendly/src/modules/tour/tour-region-filter.ts](../../apps/friendly/src/modules/tour/tour-region-filter.ts) — region → trip/visit/transition/day/place where + raw SQL + hubs
- [apps/friendly/src/modules/tour/tour-public.service.ts](../../apps/friendly/src/modules/tour/tour-public.service.ts) — 요약·목록 맵·가중치·`aggregateTourStats`·`registeredNaverIds`
- [apps/friendly/src/modules/tour/tour-public.route.ts](../../apps/friendly/src/modules/tour/tour-public.route.ts) — 공개 6 라우트, `RATE.tourRead`, *(2026-09-24 `1b621c4`) 한국어 `summary` 6개 + tour-stats `description`*
- [apps/friendly/src/modules/tour/tour-public.test.ts](../../apps/friendly/src/modules/tour/tour-public.test.ts) — 6건(하한 가림·집계·상세/목록/tour-stats/골라주기, `FORBIDDEN_KEYS` 스캔)
- [apps/friendly/src/modules/tour/tour-insights.service.ts](../../apps/friendly/src/modules/tour/tour-insights.service.ts) — `TourInsightsService.insights/plan`, `attrWhere`, LRU
- [apps/friendly/src/modules/tour/tour-insights.service.test.ts](../../apps/friendly/src/modules/tour/tour-insights.service.test.ts) — 5건(집계·insufficient/캐시·코스 점수·완화 사다리·라우트 400)
- [apps/friendly/src/modules/tour/tour-region.service.ts](../../apps/friendly/src/modules/tour/tour-region.service.ts) — `TourRegionService.density/lodging/regions`
- [apps/friendly/src/modules/tour/tour-region.service.test.ts](../../apps/friendly/src/modules/tour/tour-region.service.test.ts) — 4건(격자 k·kind·bbox / 숙소 산식 / 3집단·읍면동 / 라우트)
- [apps/friendly/src/modules/tour/tour-raw.service.ts](../../apps/friendly/src/modules/tour/tour-raw.service.ts) — allowlist 파싱·원본 목록 5종·타임라인·`photoPath`
- [apps/friendly/src/modules/tour/tour-raw.route.ts](../../apps/friendly/src/modules/tour/tour-raw.route.ts) — `requireTourRaw`·onSend 헤더·사진 `?token=`
- [apps/friendly/src/modules/tour/tour-raw.route.test.ts](../../apps/friendly/src/modules/tour/tour-raw.route.test.ts) — 7건(allowlist 파싱·401/403/404·이메일 allowlist·헤더·주문/영수증/사진·여행 타임라인·썸네일 파일)
- [apps/friendly/src/modules/tour/tour-admin.service.ts](../../apps/friendly/src/modules/tour/tour-admin.service.ts) — status·listSeeds(raw SQL)·discover·register(잡 구독)·runMatch(inflight)·runBizCheck
- [apps/friendly/src/modules/tour/tour-admin.route.ts](../../apps/friendly/src/modules/tour/tour-admin.route.ts) — 어드민 6 라우트, CrawlService 지연 생성
- [apps/friendly/src/modules/tour/tour-admin.route.test.ts](../../apps/friendly/src/modules/tour/tour-admin.route.test.ts) — 3건(401/403·상태·매칭 실행→시드 필터)
- [apps/friendly/src/modules/tour/restaurant-tour-match.service.ts](../../apps/friendly/src/modules/tour/restaurant-tour-match.service.ts) — 점수·수락 규칙·1:1 매칭·리포트·상세 정보, *(2026-09-26 확인) `claimed` 는 전체 매칭·훑기는 식당 행 있는 canonical 만 → 고아 canonical 의 선점 잔존*
- [apps/friendly/src/modules/tour/restaurant-tour-match.service.test.ts](../../apps/friendly/src/modules/tour/restaurant-tour-match.service.test.ts) — 5건(점수·반경·첫 실행·상세·재실행 kept/missing/recovered)
- [apps/friendly/src/modules/tour/tour-biz-status.service.ts](../../apps/friendly/src/modules/tour/tour-biz-status.service.ts) — 국세청 조회·최빈 brno·upsert·중단 사유
- [apps/friendly/src/modules/tour/tour-biz-status.service.test.ts](../../apps/friendly/src/modules/tour/tour-biz-status.service.test.ts) — 6건(정규화·파싱·오류 종류·대상 수집·30일/force·maxCalls/auth)

### friendly — 결합·설정·DB·테스트 인프라
- [apps/friendly/src/modules/restaurant/restaurant.service.ts](../../apps/friendly/src/modules/restaurant/restaurant.service.ts) — 공개 목록/상세/smartPick 의 tour 결합·정렬, 어드민 상세 `tour`
- [apps/friendly/src/app.ts](../../apps/friendly/src/app.ts) — autoload `*.route.ts`
- [apps/friendly/src/config/env.ts](../../apps/friendly/src/config/env.ts) — `TOUR_RAW_USER_IDS`·`TOUR_THUMBS_DIR*`
- [apps/friendly/src/plugins/rate-limit.ts](../../apps/friendly/src/plugins/rate-limit.ts) — `RATE.tourRead`
- [apps/friendly/.env.example](../../apps/friendly/.env.example) — 값 형식 예시
- [apps/friendly/package.json](../../apps/friendly/package.json) — `load:tour`·`unload:tour`·`match:restaurant-tour`·`check:tour-biz`·`e2e:tour`·`status:life-map`
- [apps/friendly/prisma/schema.prisma](../../apps/friendly/prisma/schema.prisma) — `Tour*` 10 + `RestaurantTourMatch` + `TourPlaceBizStatus`
- [apps/friendly/prisma/migrations/20260913062022_add_tour_log/migration.sql](../../apps/friendly/prisma/migrations/20260913062022_add_tour_log/migration.sql)
- [apps/friendly/prisma/migrations/20260913064102_add_tour_match_biz/migration.sql](../../apps/friendly/prisma/migrations/20260913064102_add_tour_match_biz/migration.sql)
- [apps/friendly/prisma/migrations/20260915185047_add_tour_dataset_multi/migration.sql](../../apps/friendly/prisma/migrations/20260915185047_add_tour_dataset_multi/migration.sql) — `dataset`·파생 열·백필
- [apps/friendly/src/test-utils/temp-db.ts](../../apps/friendly/src/test-utils/temp-db.ts) — 격리 DB(dev.db 복사 + 전 테이블 DELETE)
- [apps/friendly/vitest.config.ts](../../apps/friendly/vitest.config.ts) — `fileParallelism:false`, ~~hookTimeout 없음~~ *(2026-09-25 `5d7b686`) `hookTimeout: 60_000`*
- [apps/friendly/src/plugins/cors.ts](../../apps/friendly/src/plugins/cors.ts) — *(2026-09-24) 어드민 외 `origin: '*'`·`credentials: false`, `/api/v1/admin/**`(시드·원본 열람)는 prod `PUBLIC_ORIGIN` 만*

### friendly — 스크립트
- [apps/friendly/scripts/load-tour.ts](../../apps/friendly/scripts/load-tour.ts)
- [apps/friendly/scripts/unload-tour.ts](../../apps/friendly/scripts/unload-tour.ts)
- [apps/friendly/scripts/match-restaurant-tour.ts](../../apps/friendly/scripts/match-restaurant-tour.ts)
- [apps/friendly/scripts/check-tour-biz.ts](../../apps/friendly/scripts/check-tour-biz.ts)
- [apps/friendly/scripts/e2e-tour.ts](../../apps/friendly/scripts/e2e-tour.ts) — 32 step
- [apps/friendly/scripts/life-map-status.ts](../../apps/friendly/scripts/life-map-status.ts) — `tour_<세트>` 출력, *(2026-09-24) 앞에 `flood=` 추가*

### 계약·공통
- [packages/api-contract/src/schemas/tour.ts](../../packages/api-contract/src/schemas/tour.ts) — 데이터셋/지역 enum, 시드·매칭·폐업·상태·원본·공개 집계·인사이트·코스·밀도·숙소·지역 스키마
- [packages/api-contract/src/schemas/restaurant.ts](../../packages/api-contract/src/schemas/restaurant.ts) — `RestaurantTourMatchInfo`·`tour` 필드·sort·smartPick `traveler`·`avgTravelerScore`
- [packages/api-contract/src/routes.ts](../../packages/api-contract/src/routes.ts) — `Routes.Tour`
- [packages/api-contract/src/index.ts](../../packages/api-contract/src/index.ts)
- [packages/utils/src/tourLog.ts](../../packages/utils/src/tourLog.ts) — 데이터셋·지역 21키·권역 묶음·표본 판정·유형·k·출처·격자·등급
- [packages/utils/src/tourLog.test.ts](../../packages/utils/src/tourLog.test.ts) — 7건(키·권역 묶음·표본 판정·출처 / 분위·칸 키·제주 판정)
- [packages/utils/src/lifeCrime.ts](../../packages/utils/src/lifeCrime.ts) — `LIFE_MAP_OVERLAYS`
- [packages/utils/src/index.ts](../../packages/utils/src/index.ts)
- [packages/shared/src/api/tour.api.ts](../../packages/shared/src/api/tour.api.ts)
- [packages/shared/src/hooks/useTour.ts](../../packages/shared/src/hooks/useTour.ts)
- [packages/shared/src/api/restaurant.api.ts](../../packages/shared/src/api/restaurant.api.ts) — `publicTourStats`
- [packages/shared/src/hooks/useRestaurant.ts](../../packages/shared/src/hooks/useRestaurant.ts) — `useRestaurantPublicTourStats`
- [packages/shared/src/index.ts](../../packages/shared/src/index.ts)

### 웹
- [apps/web/src/App.tsx](../../apps/web/src/App.tsx) — `/travel/jeju`·`/travel/plan`(lazy)
- [apps/web/src/routes/TravelInsightsPage.tsx](../../apps/web/src/routes/TravelInsightsPage.tsx)
- [apps/web/src/routes/TravelPlanPage.tsx](../../apps/web/src/routes/TravelPlanPage.tsx)
- [apps/web/src/components/tour/TourFilterBar.tsx](../../apps/web/src/components/tour/TourFilterBar.tsx)
- [apps/web/src/components/tour/TourFilterBar.test.tsx](../../apps/web/src/components/tour/TourFilterBar.test.tsx) — 4건(기본 권역 4칩·시도 2행·동부권 6시도·전체)
- [apps/web/src/components/tour/charts.tsx](../../apps/web/src/components/tour/charts.tsx)
- [apps/web/src/components/tour/tourFormat.ts](../../apps/web/src/components/tour/tourFormat.ts)
- [apps/web/src/components/tour/TourRegionSection.tsx](../../apps/web/src/components/tour/TourRegionSection.tsx)
- [apps/web/src/components/tour/TourLodgingSection.tsx](../../apps/web/src/components/tour/TourLodgingSection.tsx)
- [apps/web/src/components/tour/TourSourceNote.tsx](../../apps/web/src/components/tour/TourSourceNote.tsx)
- [apps/web/src/routes/admin/AdminTourPage.tsx](../../apps/web/src/routes/admin/AdminTourPage.tsx)
- [apps/web/src/components/admin/tour/TourEvidencePanel.tsx](../../apps/web/src/components/admin/tour/TourEvidencePanel.tsx) — *`TourEvidenceSection` 은 2026-09-26 부터 어드민 식당 상세 '여행자' 탭 안*
- [apps/web/src/components/restaurant/detail/TourTab.tsx](../../apps/web/src/components/restaurant/detail/TourTab.tsx) — *(2026-09-26) 어드민 '여행자' 탭도 재사용*
- [apps/web/src/components/restaurant/detail/TourSummaryBadge.tsx](../../apps/web/src/components/restaurant/detail/TourSummaryBadge.tsx)
- [apps/web/src/components/restaurant/detail/TourMatchBadge.tsx](../../apps/web/src/components/restaurant/detail/TourMatchBadge.tsx)
- [apps/web/src/components/restaurant/detail/tabs.ts](../../apps/web/src/components/restaurant/detail/tabs.ts)
- [apps/web/src/components/restaurant/detail/PublicRestaurantDetail.tsx](../../apps/web/src/components/restaurant/detail/PublicRestaurantDetail.tsx)
- [apps/web/src/components/restaurant/detail/HomeTab.tsx](../../apps/web/src/components/restaurant/detail/HomeTab.tsx) — *(2026-09-26) 선택 prop `availableTabs`("여행자 탭 보기" disabled 판정)*
- [apps/web/src/components/restaurant/PublicRestaurantCard.tsx](../../apps/web/src/components/restaurant/PublicRestaurantCard.tsx)
- [apps/web/src/components/restaurant/PublicRestaurantList.tsx](../../apps/web/src/components/restaurant/PublicRestaurantList.tsx)
- [apps/web/src/components/restaurant/SmartPickSection.tsx](../../apps/web/src/components/restaurant/SmartPickSection.tsx)
- [apps/web/src/routes/RestaurantsV2Page.tsx](../../apps/web/src/routes/RestaurantsV2Page.tsx)
- [apps/web/src/routes/vote/VoteNewPage.tsx](../../apps/web/src/routes/vote/VoteNewPage.tsx) — `presetTitle/presetOptions`
- [apps/web/src/components/PublicSidebar.tsx](../../apps/web/src/components/PublicSidebar.tsx) — *(2026-09-25) NAV 14개, 여행 7번째*
- [apps/web/src/components/PublicTopBar.tsx](../../apps/web/src/components/PublicTopBar.tsx) — *(2026-09-25) NAV 14개(같은 순서)*
- [apps/web/src/routes/LifeMapPage.tsx](../../apps/web/src/routes/LifeMapPage.tsx) — 배경 토글·표본 이동·칸 선택
- [apps/web/src/routes/LifeMapPage.test.tsx](../../apps/web/src/routes/LifeMapPage.test.tsx) — 배경 토글 1건(MSW density)
- [apps/web/src/components/life-map/LifeTourCard.tsx](../../apps/web/src/components/life-map/LifeTourCard.tsx)
- [apps/web/src/components/life-map/LifeLayerBar.tsx](../../apps/web/src/components/life-map/LifeLayerBar.tsx)
- [apps/web/src/components/life-map/LifeMapFooter.tsx](../../apps/web/src/components/life-map/LifeMapFooter.tsx)
- [apps/web/src/components/life-map/lifeMapAreas.ts](../../apps/web/src/components/life-map/lifeMapAreas.ts) — `tourDensityAreaStyle`
- [apps/web/src/lib/tourDensityGeo.ts](../../apps/web/src/lib/tourDensityGeo.ts)
- [apps/web/src/stores/lifeMapPrefsStore.ts](../../apps/web/src/stores/lifeMapPrefsStore.ts) — v5 `tourDensityKind`
- [apps/web/src/routes/admin/AdminRoutes.tsx](../../apps/web/src/routes/admin/AdminRoutes.tsx)
- [apps/web/src/components/admin/AdminLayout.tsx](../../apps/web/src/components/admin/AdminLayout.tsx)
- [apps/web/src/components/admin/AdminTopBar.tsx](../../apps/web/src/components/admin/AdminTopBar.tsx)
- [apps/web/src/routes/admin/AdminRestaurantDetailPage.tsx](../../apps/web/src/routes/admin/AdminRestaurantDetailPage.tsx) — ~~`TourMatchBadge`·`TourEvidenceSection`~~ *(2026-09-26) '여행자' 탭 :254-264 — 공개 `TourTab` + `TourEvidenceSection`, 노출 = `detail.tour != null`*
- [apps/web/src/components/admin/restaurant-detail/AdminDetailHeader.tsx](../../apps/web/src/components/admin/restaurant-detail/AdminDetailHeader.tsx) — *(2026-09-26) 헤더 `TourMatchBadge`(:80, `StoreInfoBadges` 옆)*
- [apps/web/src/components/admin/restaurant-detail/tabs.ts](../../apps/web/src/components/admin/restaurant-detail/tabs.ts) — *(2026-09-26) `ADMIN_DETAIL_TABS`('여행자' 3번째)·`PUBLIC_TABS_IN_ADMIN`(tour 포함)*
- [apps/web/src/routes/admin/AdminRestaurantDetailPage.test.tsx](../../apps/web/src/routes/admin/AdminRestaurantDetailPage.test.tsx) — *(2026-09-26) 4건, `tour: null` 픽스처 — '여행자' 탭 미검증*
- [apps/web/src/routes/HomePage.tsx](../../apps/web/src/routes/HomePage.tsx) — 여행 진입 없음(PLAN 과 다름)

### 문서·운영
- [docs/PLAN-tour-log.md](../../docs/PLAN-tour-log.md) — 이용조건·용어·구조·계약·DB·단계 0~9차·부록 A/B/C
- [docs/data-sources.md](../../docs/data-sources.md) — tour 행 4개(행 수·용량·백업 대상)
- [docs/deploy-friendly.md](../../docs/deploy-friendly.md) — §여행로그 원본·사진(rsync·allowlist·썸네일·폐업·접근 경로·환수)
- [deploy.sh](../../deploy.sh) — `TOUR_*_EXPORT_DIR`·세트 루프·매칭, *(2026-09-24~25) 루프 앞 침수 흔적 블록(매칭 175행), 케이스 1·2·4 에 `parking_data`*
- [.gitignore](../../.gitignore) — `/data/`
- [docs/api/README.md](../../docs/api/README.md) — *(2026-09-24) 도메인 개요 "여행로그 — 집계만", 7절 이용 조건(5명 미만 제외·`sourceNote`/`sampleLabel` 표기·재구성·재배포 금지), 기준 URL*
- [docs/api/endpoints.md](../../docs/api/endpoints.md) — *(2026-09-24) `## tour` 절 6행(공개·120/분), `## public` 절의 목록·상세·골라줘*
- [docs/api/openapi.json](../../docs/api/openapi.json) — *(2026-09-24) tour 6 paths — `x-auth: public`, `x-rate-limit` 120/1분, tag `tour`; `/admin/tour/**` 없음*
