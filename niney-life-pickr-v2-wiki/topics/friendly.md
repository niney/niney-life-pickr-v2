---
topic: friendly
last_compiled: 2026-08-30
status: active
aliases: [air-quality, weather, life-map, food, meal, meal-recognition, meal-recommendation, plugins-food-import, plugins-meal, foodImport, foodClassify, mealPhotos, meal-photo-gc, llm-provider-env, buildLlmProviderEnv, LlmProviderEnv, meal-photo, meal-recommend, AIRKOREA_API_KEY, KMA_API_KEY, KMA_APIHUB_KEY, HIRA_API_KEY, FOOD_API_KEY, FOOD_RECIPE_API_KEY, MAFRA_API_KEY, MEAL_RECOGNIZE_DAILY_LIMIT, MEAL_RECOMMEND_DAILY_LIMIT, MEAL_RECOGNITION_DEBUG, data.go.kr, BUS_API_KEY-fallback, key-fallback-chain, 활용신청, service-key-30, lib-csv, lib-xlsx, parseCsv, parseXlsx, iterateCsvRows, admin-restaurant-search, RestaurantListQuery-q, queryRaw-aggregate, compareReviewRecencyDesc, visit-date-recency, VisitorPaginationResult, onVisitorPagination, known_boundary, AirUserLocation, LifeCctv, LifeToilet, LifeHospital, LifeGeocodeCache, LifeMasterSync, FoodItem, FoodImportConfig, FoodImportRun, FoodImportRegistry, MealEntry, MealItem, MealPhoto, MealPreference, MealRecommendation, MealDailyQuota, MealDataImport, MealPhotoDeletion, load:life-cctv, load:life-toilets, load:life-hospitals, load:food-catalog, status:life-map, status:food-catalog, probe:airkorea, probe:kma, probe:hira, deploy-auto-load, test-isolation, analytics-test-wipe, thinkOptionForModel, RATE-lifeMapRead, RATE-mealRecognize, replyUpstreamError, 75-models, 69-migrations, naver-search-adapter, search-route, crawl-job-log, plugins-summaries, settlement, 정산, multipart, vision LLM, 단골, contacts, llm-purpose, settlement-rounds, settlement-draft, settlement-draft-module, well-known, well-known-module, universal-links, app-links, assetlinks-json, AASA, RFC1918, cors-dev, dev-cors-private-lan, dev-cors-reflect-all, cors-preflight-fix, multi-receipt-split, ExtractReceiptSplit, roundIndex, roundTotal, settlement-PUT, full-replace-update, ai-model-preview, models-preview, attendees-100, items-200, calculateMultiRoundShares, SettlementRound, SettlementRoundAttendee, SettlementDraft, placeIdKey-sentinel, fromDraftId, public-reviews-sort-recent, fetchedAt-asc, contentHash-NUL, assemblePublicReviews, share-preview, og-ssr-lite, og-image, settlement-card-png, satori, resvg, IBMPlexSansKR, getPhotoUrls, getSharePreviewMeta, shareOgImage, shareOgImageUrl, pickRestaurantOgImageUrl, seedFromToken, sharePreviewCache, ALLOWED_HOSTS-export, isThumbnailProxyable, OG_IMAGE_PATH, WEB_INDEX_PATH, eval-extraction, probe-extraction, probe-vision, eslint-config, FastifyError-annotation, schedule, scheduler, cron, croner, normalize-merge, ScheduleConfig, ScheduleRun, scheduleRegistry, plugins-schedule, bootstrap, interrupted-run, isPlaceCrawling, forceCloseConnections, publicCategoryTree, getCategoryTree, restaurant-preview, og-ssr-restaurant, /r/:placeId, sitemap.xml, robots.txt, json-ld, getPublicSeoMeta, getPublicSitemapEntries, PUBLIC_ORIGIN, panorama, panorama-cache, isVolatileNaverPhoto, naver-panorama-503, region-derive, deriveRegion, region-stats, regionStats, region-stats-telegram, smartPick, tabling, tabling-promote, canonical-members, listPublicPlaces, plugins-logs, operationLog, OperationRun, OperationLog, OperationReport, LogConfig, plugins-random-crawl, randomCrawl, telegram, telegramConfig, RandomCrawlConfig, RandomCrawlRun, TelegramConfig, ReviewCluster, review-clustering, review-search, enrich, embeddingJson, clusterId, groupSplits, shareExpiresAt, log-analysis, OLLAMA_LOG_ANALYSIS_MODEL, publicReviews, reviewResummarize, bus, BUS_API_KEY, bus-station-search, bus-nearby, bus-arrivals, bus-positions, bus-route-detail, bus-favorite, bus-quota-gate, restaurant-menu-groups, restaurant-menus, menu-grouping-persist, subway, subway-station, subway-arrivals, subway-positions, subway-line-detail, subway-timetable, subway-congestion, subway-path, subway-favorite, subway-master, subway-line-order, SUBWAY_API_KEY, SEOUL_OPEN_API_KEY, realign-drifted-tables, db-drift-realign, useIsolatedDatabase, temp-db, dijkstra-path, ERROR-337]
sources_count: 272
---

# friendly — Fastify 백엔드

**2026-08-17~08-30 변경 흡수 — 공공데이터 모듈 3종(air-quality·weather·life-map) + 식단 4종(food·meal·meal-recognition·meal-recommendation) 합류, LLM env 조립 단일화, 관리자 맛집 통합 검색, 리뷰 업데이트 누락·최신순 수정, 글로벌 머지 테스트 격리 재발**:
- **신규 모듈 7개 → 34개 모듈** — 대기정보 [air-quality](air-quality.md)(`7340743`·`c6ac640`·`a4284aa`), 날씨 [weather](weather.md)(`37e0db0`·`7704f8c`·`17f281a`), 일상지도 [life-map](life-map.md)(`1d92acb`·`a21de10`·병의원 `4fd6e22`), 음식 카탈로그 [food](food.md)(`102ccdb`·`69dc0e2`·`5cdbc0f`·`31c56f7`), 식단 [meal](meal.md)(`c5b5fe2`·`2e41e63`·`9f39d53`·`fd371d9` — meal/meal-recognition/meal-recommendation 3디렉터리). friendly 관점은 route/service 파일·prefix·인증 경계(API Surface "신규 모듈 로스터" 표)와 wiring(plugin·부팅·env·테이블)만 — 도메인 로직은 각 토픽.
- **신규 plugin 2종** — [plugins/food-import.ts](../../apps/friendly/src/plugins/food-import.ts)(`foodImport`/`foodClassify` decorate, `dependencies:['prisma','logs']`, 부팅 **6단계** `app.foodImport.bootstrap()`) + [plugins/meal.ts](../../apps/friendly/src/plugins/meal.ts)(`mealPhotos` decorate + 부팅 직후 1회·매일 04:30 고아 사진 GC 를 `scheduleRegistry` jobType `meal-photo-gc` 로 등록). [plugins/rate-limit.ts](../../apps/friendly/src/plugins/rate-limit.ts) 에 `RATE` 8종 추가(lifeMapRead 240/분 · lifeMapSearch 60/분 · foodSearch 120/분 · foodRestaurants 60/분 · mealPhotoUpload 30/분 · mealRecognize 10/분 · mealRecommend 10/분 · mealDataArchive 10/시간).
- **LLM provider env 조립 단일화(`cc8399a`)** — 신규 [modules/ai/llm-provider-env.ts](../../apps/friendly/src/modules/ai/llm-provider-env.ts) 의 `buildLlmProviderEnv()` 하나를 plugin 5종·라우트 7종·스크립트 9종·research 프로브 10종이 import — 파일마다 복제돼 있던 `buildEnvBlock` 리터럴을 전부 제거. `LlmProviderPurpose` 가 `meal-photo`/`meal-recommend` 로 5종이 되면서 `AiConfigService.ALL_PURPOSES` 도 계약 enum `.options` 를 그대로 쓴다(용도가 늘면 어드민 카드 자동 증가).
- **env 키 신규 11종** — `AIRKOREA_API_KEY`/`KMA_API_KEY`/`HIRA_API_KEY`/`FOOD_API_KEY` 는 **비면 `BUS_API_KEY` 로 폴백**(data.go.kr 는 계정당 키 1개 — 데이터셋별 활용신청만 추가; 둘 다 비면 air/weather 라우트 503) + `KMA_APIHUB_KEY`(API허브 별도 발급·폴백 없음, 비면 `/weather/aws` 가 `enabled=false` 200) + `FOOD_RECIPE_API_KEY`/`MAFRA_API_KEY`(비면 그 소스만 건너뜀) + `OLLAMA_MEAL_PHOTO_MODEL`(`gemma4:31b`)/`OLLAMA_MEAL_RECOMMEND_MODEL` + `MEAL_RECOGNIZE_DAILY_LIMIT`(30)/`MEAL_RECOMMEND_DAILY_LIMIT`(20, SQLite 영속 카운터). `.env.example` 에는 추가로 `MEAL_RECOGNITION_DEBUG*` 4종(env.ts 미경유 — `process.env` 직독).
- **lib 2종(`5cdbc0f`)** — [lib/csv.ts](../../apps/friendly/src/lib/csv.ts)(RFC 4180 제너레이터 파서 — 따옴표·CRLF·BOM, 79MB 도 단일 문자열) + [lib/xlsx.ts](../../apps/friendly/src/lib/xlsx.ts)(zip 중앙 디렉터리 + sharedStrings/sheet XML 만 직접 푸는 최소 리더 — 새 의존성 0). life-map 적재(CCTV·화장실 CSV, `csvColumnIndex`)와 food 적재(영양 CSV·한식 800선 XLSX)가 공유.
- **restaurant** — 관리자 맛집 통합 검색 `RestaurantListQuery.q`(`5e25cc0` — 공백 토큰 AND, canonical 단위 검색 문자열) + 응답 단축(`9ccbe52` — ReviewSummary 전량 로드 → `$queryRaw` GROUP BY 집계, 500개 IN 배치) + 리뷰 업데이트 누락·최신순 수정(`0d72380` — 어댑터 pager 버튼 오선택·GraphQL 응답 오매칭 수정, `VisitorPaginationResult` 계측, `@repo/utils compareReviewRecencyDesc` 방문일 정렬).
- **Prisma** — 신규 모델 20개(Air 1 · Life 5 · Food 5 · Meal 9) → **75 모델**, 마이그레이션 14개 추가 → **69개**. 테스트 파일 61 → **97개**(신규 36 — csv/xlsx 2 + air 4 + weather 2 + life-map 7 + food 7 + meal 10 + meal-recognition 3 + meal-recommendation 1).
- **글로벌 머지 테스트 격리 재발(`517e465`)** — analytics `runGlobalMerge` 블록만 격리 DB 를 안 써 `pnpm --filter friendly test` 한 번이 운영 스냅샷의 머지 결과(5,446 그룹 + 링크 22,303 + 청크 캐시)를 통째로 날렸다(LLM 1,352콜 재머지로 복구) → `useIsolatedDatabase` 로 이관. Gotchas 참조.
- `deploy.sh`(`dae1cc9`·`5a84b63`) 에 일상지도/음식 카탈로그 적재 케이스 6·7 + API 케이스마다 자동 점검·첫 적재 — 상세는 [project-overview](project-overview.md).

**2026-07-13~08-17 변경 흡수 — 보안·성능 9차수 하드닝 + lib 집결 + vote 모듈 신규 + 대중교통 장애 내성**:
- **보안·성능 감사 9차수(`bc2db00`, 상세는 [docs/PLAN-perf-security.md](../../docs/PLAN-perf-security.md))** — 1차 레이트리밋(@fastify/rate-limit + trustProxy, per-IP 한도) / 2차 세션 무효화(**User.tokenVersion + JWT tv 클레임** — logout/강등 즉시 반영, 타이밍 세이프 로그인, SSE 수동검증 → resolveSseAdmin 통합) / 3차 HTTP 하드닝(prod /docs 미노출·CORS fail-closed·CDN SRI) / 4차 입력 상한 / 5차 과다로드(analytics 집계 캐시 분리·admin 목록 민감컬럼 미로드) / 6차 이벤트루프(정산 카드 PNG (token,updatedAt) lru 캐시·[lib/fetch-timeout.ts](../../apps/friendly/src/lib/fetch-timeout.ts) 로 LLM/임베딩 fetch 타임아웃) / 7차 transit 마이크로캐시 / 8차 웹 / 9차 정책(죽어있던 AiService 레이트리밋 부활 — **모듈 레벨 Map**(라우트가 요청마다 새 인스턴스라 인스턴스 필드면 죽는다), bulk-save actor 당 1잡).
- **lib 집결(리팩터 9커밋)** — 모듈에 흩어진 순수 유틸을 [lib/](../../apps/friendly/src/lib/) 로: json(extractFirstJsonObject — 6개 모듈의 1401줄 summary.service 의존 절단)·text(normalizeTerm)·array(chunk 가드판 통일)·html(escapeHtml/escapeTelegramHtml/formatThousands)·narrow(어댑터 내로잉 10벌 통합 — strOrNull 은 엄격/coerce 2변종을 이름으로 분리, 의도적 로컬 유지 2곳 주석)·matching·[reply-upstream-error](../../apps/friendly/src/lib/reply-upstream-error.ts)(대중교통 5xx 진단 로깅 — catch 13벌 통합).
- **vote 모듈 신규(`8951b31`)** — [vote](vote.md) 참조. autoload 밖 origin 루트 OG 라우트(vote-preview)는 app.ts 명시 등록.
- **군집 '대기' 잔존 수복(`1f5ed30`)** — 자동 군집화를 요약 훅 원샷 체인에서 **enrich 완료 이벤트 체이닝**으로(경합 진원지였던 직접 호출 제거) + 기동 60s 후 미군집 백로그 리컨실(CLUSTER_RECONCILE_DELAY_MS/CLUSTER_AUTO_ENABLED). Python 타임아웃 가설은 합성 벤치로 기각.
- **대중교통 장애 내성(`b0c4f0a`·`81ccb6d`)** — [bus](bus.md)·[subway](subway.md) 흡수분 참조(버스 마스터 로컬화·stale 폴백 / 지하철 시간표 빈 blob 6h TTL·시드 자가치유).
- 테스트 스위트 678 → **750 passed / 2 skipped**(외부 상태 스모크는 전부 자가 skip — 로컬 완전 green).

**2026-07-07 변경 흡수 — 신규 모듈 `subway`(수도권 전철 API 프록시) + DB drift 보정 마이그레이션 + 테스트 격리 헬퍼.** friendly 위에 백엔드 모듈 하나가 더 얹혔다 — [modules/subway/](../../apps/friendly/src/modules/subway/) 가 서울시 실시간 지하철 swopenAPI + 열린데이터광장 정적 데이터를 프록시한다: 역 검색·좌표 주변 역·실시간 도착·호선 실시간 열차 위치·호선 상세(경유역 순서+근사 폴리라인)·역 시간표·시간대별 혼잡도·경로 탐색(로컬 그래프 다익스트라) + 로그인 사용자 즐겨찾기. 구조는 어댑터([subway-api.adapter.ts](../../apps/friendly/src/modules/subway/subway-api.adapter.ts) — JSON/에러코드 파싱 + 키 2종 분리) + 다중 서비스([subway.service.ts](../../apps/friendly/src/modules/subway/subway.service.ts) 집약 + `subway-master`/`subway-line-order`/`subway-path`(다익스트라)/`subway-congestion`/`subway-verify`/`subway-favorite`) + 공개 라우트([subway.route.ts](../../apps/friendly/src/modules/subway/subway.route.ts)) + 즐겨찾기 라우트([subway-favorite.route.ts](../../apps/friendly/src/modules/subway/subway-favorite.route.ts), 인증 필수) 로 나뉜다. 검색/주변/노선상세/시간표/혼잡은 로컬 적재 데이터라 쿼터·셀 캐시가 없고(버스와 대비), 도착/위치만 역명 단위 15초 마이크로 캐시. **신규 env 2종** — `SUBWAY_API_KEY`(실시간 도착/위치 전용 '지하철 인증키')·`SEOUL_OPEN_API_KEY`(정적 역사마스터 적재 전용 '일반 인증키') 가 [config/env.ts](../../apps/friendly/src/config/env.ts) 에 추가됐다: 발급처가 키를 2종으로 쪼개 서로 비호환이라, 각 기능은 자기 키가 비면 라우트/스크립트가 503. 도메인 내부(호선 매핑·다익스트라·혼잡 적재·형상 근사)는 [subway 토픽](./subway.md) 참조 — friendly 문서는 "백엔드 모듈 하나 추가" 관점만. 함께 (1) **DB drift 보정 마이그레이션** `prisma/migrations/20260707140000_realign_drifted_tables`(커밋 `53bedce`) — 수기 마이그레이션이 `restaurant_menu_groups`/`restaurant_menus` 의 `updatedAt` 에 `DEFAULT CURRENT_TIMESTAMP` 를 붙여 `@updatedAt`(DEFAULT 없음) 기대와 어긋나던 것 + 과거 수동 ALTER 로 `review_summaries.clusterId` FK(`REFERENCES review_clusters ON DELETE SET NULL`) 가 빠져 있던 것을 `RedefineTables`(재생성+INSERT SELECT)로 스키마 정의에 수렴 — 어떤 상태의 DB든 수렴해 이후 `migrate dev` 가 drift reset(데이터 삭제)을 요구하지 않는다(review_summaries 5,618행 무손실 복사 검증). (2) **테스트 격리 헬퍼** [src/test-utils/temp-db.ts](../../apps/friendly/src/test-utils/temp-db.ts) 의 `useIsolatedDatabase`(dev.db 를 임시 파일로 복사→전량 truncate→`DATABASE_URL` 스왑, afterAll 원복 — `fileParallelism:false` 라 전역 스왑이 다른 파일과 경합 안 함) 가 환경 의존 사전 실패 6건을 해소(커밋 `4bb7144`): map.test 3건 = 전역 env 싱글톤을 통해 라우트 fallback 으로 주입되던 실 `VWORLD_API_KEY` 를 파일 전역 before/after 로 비워 "DB·env 어디에도 키 없음" 전제 복원 / restaurant 랭킹 2건 + analytics `getGlobalMenus` 1건 = 실 dev.db 데이터가 전역 집계 후 페이지 컷오프(limit 20 / pageSize 200) 밖으로 테스트 시드를 밀어내던 것을 빈 격리 DB 로. 부수로 logs in-flight 테스트 간헐 플레이크 수정(release 할당 대기, `3255c40`), 지하철 라이브 스모크는 swopen 일일 쿼터 초과(ERROR-337) 시 skip(`16eee87`).

**2026-07-06 변경 흡수 — 신규 모듈 `bus`(서울시 버스 API 프록시) + 메뉴 그룹 영속 테이블.** friendly 위에 백엔드 모듈 하나가 더 얹혔다 — [modules/bus/](../../apps/friendly/src/modules/bus/) 가 서울시 버스 오픈 API(ws.bus.go.kr) 를 프록시한다: 정류소 검색·주변 정류소·실시간 도착·노선 실시간 차량 위치·노선 상세(형상+경유 정류소) + 로그인 사용자 즐겨찾기. 구조는 어댑터([bus-api.adapter.ts](../../apps/friendly/src/modules/bus/bus-api.adapter.ts) — XML 파싱 + 인증키 인/디코딩 자동 처리) + 서비스([bus.service.ts](../../apps/friendly/src/modules/bus/bus.service.ts)) + 공개 라우트([bus.route.ts](../../apps/friendly/src/modules/bus/bus.route.ts)) + 즐겨찾기 라우트([bus-favorite.route.ts](../../apps/friendly/src/modules/bus/bus-favorite.route.ts), 인증 필수) 로 나뉜다. 정류소/주변/노선 상세는 사실상 정적이라 DB 30일 캐시 + **in-memory 일일 업스트림 쿼터 게이트**(기본 900 — 개발계정 일 1,000건 보호. 단일 인스턴스 전제라 메모리 카운터로 충분, Redis 금지 정책과 일관), 도착/차량 위치는 무캐싱 실시간 프록시. 신규 env `BUS_API_KEY`(env-only — DB 설정 경로 없음, 비면 검색 라우트가 503) 가 [config/env.ts](../../apps/friendly/src/config/env.ts)·`.env.example` 에 추가됐다. 캐시 정책·좌표 셀 스냅·차량 위치 보간 등 도메인 내부는 [bus 토픽](./bus.md) 참조 — friendly 문서는 "백엔드 모듈 하나 추가" 관점만. 함께 **메뉴 그룹 영속 가산 테이블**(`restaurant_menu_groups`/`restaurant_menus`) 이 신설됐다(상세는 [menu-grouping 토픽](./menu-grouping.md)).

**2026-06-25 변경 흡수 — 신규 도메인 5종(review-search·review-clustering·random-crawl·telegram·logs) 앱 통합 + 백엔드 셸 확장.** 이번 라운드는 friendly 위에 다섯 도메인이 추가됐고, 이들은 **각각 자체 위키 토픽**으로 분리됐다 — friendly 문서는 앱 레벨 wiring(autoload·plugin 데코·부팅/셧다운 훅·DB 모델 추가)만 흡수하고 내부는 위임한다.
- **신규 plugin 2종** (app-singleton 데코 패턴): [plugins/logs.ts](../../apps/friendly/src/plugins/logs.ts) (`operationLog`/`logAnalysis` — 범용 작업 로그/실패 run LLM 분석, `dependencies:['prisma']`) + [plugins/random-crawl.ts](../../apps/friendly/src/plugins/random-crawl.ts) (`randomCrawl`/`telegram`/`telegramConfig` — 맛집 자동 발굴 cron + 텔레그램 폴러, `dependencies:['prisma','logs']`). 기존 [plugins/summaries.ts](../../apps/friendly/src/plugins/summaries.ts) 는 `reviewSearch`/`reviewClustering` 도 함께 decorate 하고 `SummaryService` 에 주입(요약 종료 → 자동 enrich → 군집화 체인) — JobLogService 가 퇴역하고 잡 단계 로그가 전부 `OperationLogService` 단일 인스턴스로 흐른다. `plugins/schedule.ts` 도 `dependencies:['prisma','logs']` 로 바뀌어 cron run 과 자식 run 을 `parentRunId` 로 연계.
- **server.ts 부팅 훅 5단계** — `cleanupStaleReviewSummaries` → `rescheduleStaleSummaries` → `schedule.bootstrap()` → **`telegramConfig.bootstrap()`** → **`randomCrawl.bootstrap()`**. 텔레그램 토큰/chatId 를 DB 로 확정한 뒤 random-crawl 폴러가 시작된다.
- **restaurant 확장** — SEO/공유용 [restaurant-preview.ts](../../apps/friendly/src/modules/restaurant/restaurant-preview.ts) (`/r/:placeId` 상세 OG+JSON-LD+noscript SSR-lite, `/sitemap.xml`, `/robots.txt` — `app.ts` 가 `registerRestaurantPreview(app)` 로 `/api/v1` 밖 등록), 주소/좌표→시군구 파생 [region-derive.ts](../../apps/friendly/src/modules/restaurant/region-derive.ts) + 어드민 지역 통계 라우트 `Routes.Restaurant.regionStats`, 가중 랜덤 픽 `smartPick`, 공개 카테고리 트리 `publicCategoryTree`, 공개 리뷰 `publicReviews`, 단건 재요약 `reviewResummarize`. enrich/QA/군집이 단일 행 대신 canonical 멤버 집합을 쓰도록 [canonical-members.ts](../../apps/friendly/src/modules/restaurant/canonical-members.ts) 신규. [restaurant.merge.ts](../../apps/friendly/src/modules/restaurant/restaurant.merge.ts) 가 **tabling** 소스(partner 행)까지 융합. 테이블링 place↔partner 자동 승격 머지는 [restaurant.service.ts](../../apps/friendly/src/modules/restaurant/restaurant.service.ts) 에.
- **media 확장** — 네이버 파노라마 대표이미지 503/TTL 만료 fix: [panorama-cache.ts](../../apps/friendly/src/modules/media/panorama-cache.ts) 가 크롤 시점에 휘발성 HMAC URL 을 1회 받아 `data/panorama/<placeId>.jpg` 로 영구 사본 저장, [media.route.ts](../../apps/friendly/src/modules/media/media.route.ts) 가 `Routes.Media.panorama(:placeId)` 로 그 사본을 서빙(없으면 404).
- **settings 확장** — [map.service.ts](../../apps/friendly/src/modules/settings/map.service.ts) 가 `MapSettingsService` 로 "DB 우선 + .env(VWORLD_*) fallback" 패턴 통일 + `source` ('db'|'env'|'none') 출처 표시. 텔레그램 설정은 [telegram 토픽](./telegram.md).
- **신규 env** — `OLLAMA_LOG_ANALYSIS_MODEL`(로그분석 purpose), `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`, `VWORLD_API_KEY`/`VWORLD_DOMAINS`, `PUBLIC_ORIGIN`(SEO canonical origin 고정). 임베딩/Python 런타임 설정은 review-search/review-clustering 서비스가 자체 보유(env.ts 미경유) — 상세는 각 토픽.
- **신규 테이블** — operation_logs(OperationRun/Log/Report) · log_configs · schedule_*(이전 라운드) · random_crawl_*(RandomCrawlConfig/Run) · telegram_configs · review_summaries enrichment 컬럼(embeddingJson/aspectsJson/contextLine/clusterId 등) · review_clusters · settlement_round_participants 의 groupSplits/settlement shareExpiresAt. 어떤 모듈이 무슨 테이블을 소유하는지 큰 그림은 Data 섹션.
- 도메인 내부(enrich 알고리즘·UMAP/HDBSCAN 군집화·random-crawl 회차 상태기계·텔레그램 봇 프로토콜·로그 분석 LLM 프롬프트)는 **[review-search](./review-search.md) / [review-clustering](./review-clustering.md) / [random-crawl](./random-crawl.md) / [telegram](./telegram.md) / [logs](./logs.md)** 참조.

**2026-06-06 변경 흡수 — 주기 스케줄러(schedule) 모듈 신규.** croner 기반 in-process cron 으로 "메뉴 정규화 → 글로벌 머지" 파이프라인을 야간 배치로 자동 실행한다(no-Redis, CLAUDE.md). 신규 `modules/schedule/` (service + registry + route + test) + `plugins/schedule.ts` 가 `ScheduleService` 를 `app.decorate('schedule', ...)` 로 전역 singleton 등록(`dependencies: ['prisma']`). 부팅 시 `server.ts` 가 `app.schedule.bootstrap()` 으로 (1) 직전 인스턴스에서 `running` 으로 남은 `ScheduleRun` 을 `interrupted` 로 정리 + (2) `ScheduleConfig` 를 읽어 cron 등록. graceful shutdown 에서 `scheduleRegistry.stopAllCrons()` + `abortInflight()`. cron 타이머·진행 상태는 `scheduleRegistry`(모듈 singleton — jobType 당 croner `Cron` 하나 + 동시 1개 inflight run, overlap 가드 + live SSE + graceful abort). 어드민 라우트 5종(`/admin/schedule/*`: config GET/PUT · run POST · runs GET · preview POST · run-events SSE). 신규 테이블 `ScheduleConfig`/`ScheduleRun` 2종 + croner 의존 추가. `app.ts` 는 `forceCloseConnections: 'idle'` 추가(shutdown 시 idle keep-alive 즉시 닫아 close 매달림 방지). crawl `job-registry.ts` 에 actor-agnostic `isPlaceCrawling(placeId)` 신규 — 스케줄러가 크롤 진행 중 식당을 건너뛰는 가드. restaurant 에 공개 카테고리 트리 라우트(`publicCategoryTree`/`getCategoryTree`) 추가. 파이프라인 로직 자체(정규화/머지 진행률·SSE 이벤트)는 [schedule 토픽](./schedule.md), 글로벌 머지 v3 택소노미/배열 스키마/청크 10/categoryPath 복구는 [analytics 토픽](./analytics.md) 참조 — friendly 문서는 "백엔드 셸/부팅/플러그인/모듈 목록" 관점만 흡수.

**2026-06-01 변경 흡수 — 정산 공유 OG SSR-lite + 정산표 PNG 서버 렌더 + 동적 og:image(식당 사진/특정 1장/토큰 시드) + ESLint 합류 + 식당 사진 경량 조회.** (1) 신규 [modules/settlement/share-preview.ts](../../apps/friendly/src/modules/settlement/share-preview.ts) 가 `/share/settlements/:token` (+ 별칭 `/s/:token`) 을 가로채 빌드된 웹 `index.html` 의 `<head>` 에만 OG 메타(식당명·총액·인원수 + `og:image`) 를 주입해 반환한다 — 풀 SSR 이 아니라 **head 메타만 서버 주입**(SSR-lite). 카카오톡/텔레그램 크롤러가 JS 없이 긁어도 미리보기가 채워지고, 실제 사용자도 같은 HTML 위에서 SPA 가 평소대로 부팅. `app.ts` 가 `registerSharePreview(app)` 으로 `/api/v1` prefix 밖 루트 경로에 등록. (2) 신규 [settlement-card.ts](../../apps/friendly/src/modules/settlement/settlement-card.ts) 가 화면의 정산표(`SettlementBreakdownTable`) 와 동일한 매트릭스를 **satori(레이아웃→SVG) + resvg(SVG→PNG)** 로 서버 렌더해 `/share/settlements/:token/image.png` 로 노출 — 한글 글리프는 번들된 `assets/fonts/IBMPlexSansKR-{Regular,Bold}.ttf` 로 커버. (3) `og:image` 는 owner 가 공유 시 고른 모드에 따라 동적: `restaurant`(기본 — 정산 식당 사진 갤러리에서 1장) / 특정 1장 고정(`shareOgImageUrl`) / `table`(정산표 PNG). 식당 사진은 `seedFromToken(token)` 으로 **토큰 시드 결정적 랜덤** — 같은 링크는 항상 같은 사진(카카오 OG 캐시와 일관). (4) `media.route.ts` 가 `ALLOWED_HOSTS` 를 export 해 정산이 "이 URL 을 thumbnail 프록시로 띄울 수 있나" 판정에 재사용. (5) `restaurant.service.ts` 에 `getPhotoUrls(placeId)` 신규 — `snapshotJson` 만 select + `mergePhotos` 재사용해 OG/갤러리용 사진 URL 만 경량 산출(visitorReviews/summary 미로드). (6) `getSharePreviewMeta` 가 메타 컬럼 + `_count` 만 읽고 `(token, origin)` 단위 5분 in-memory 캐시로 반복 크롤을 흡수. (7) friendly 가 ESLint 에 합류 — `eslint.config.mjs` 신규 + `lint` 스크립트(turbo lint 4/4 green). env 키 3종 추가(`WEB_INDEX_PATH`/`OG_IMAGE_PATH` + 기존 deep-link 키). `error-handler.ts` 의 setErrorHandler 콜백 `error` 파라미터에 `FastifyError` 타입 주석(추론이 `unknown` 으로 떨어지던 것 — 런타임 불변). 영수증 OCR 평가/비전 프로브 스크립트 3종(`eval-extraction.ts`/`probe-extraction.ts`/`probe-vision.ts`) 추가.

**2026-05-31 변경 흡수 — dev CORS 전면 반사 허용 + 공개 리뷰 최신순 정렬 버그 fix + 소스 NUL 제거.** (1) `plugins/cors.ts` 의 dev 분기가 RFC1918 화이트리스트 거부를 폐기하고 **모든 origin 을 반사 허용**(`cb(null, true)`)으로 바뀌었다 — 개발 머신 IP 가 공인/사설/VPN/WSL 대역으로 수시로 바뀌어 화이트리스트가 무의미한데다, 이전 `cb(Error)` 거부가 로그인 같은 **preflight 요청을 통째로 깨뜨리던** 회귀를 해소. RFC1918 정규식은 이제 "예상된 LAN origin" 분류용으로만 남아, 비-LAN origin 일 때만 origin 당 1회 `app.log.warn` 으로 오설정/오접속을 가시화한다. production 은 여전히 env `CORS_ORIGIN` list 로 엄격 차단 — 보안 영향 0. (2) **공개 리뷰 `sort=recent` 가 가장 오래된 리뷰를 맨 위에 내보내던 버그** — `restaurant.service.ts` 의 `assemblePublicReviews` 최종 정렬이 `fetchedAt desc` 라, 크롤러가 네이버 최신순으로 받아 저장한 순서(`fetchedAt asc = 최신순`)를 거꾸로 뒤집고 있었음 → `asc` 로 교정 **(→ 2026-08-17 `0d72380` 에서 다시 정정: update 모드로 나중에 수집된 리뷰가 뒤에 숨어 "저장 순서=최신순" 전제가 깨졌고, 이제 방문일 desc — 최상단 흡수 문단 참조)**. (3) `contentHashOf` 의 해시 필드 구분자가 소스에 실제 NUL(`0x00`) 바이트로 박혀 git/ripgrep 이 파일을 바이너리로 취급하던 것을, 런타임 charCode 가 동일한 유니코드 이스케이프 시퀀스로 치환 — **해시값 불변(기존 `contentHash` 와 동일, dedup 영향 0)** + 파일이 순수 텍스트가 되어 diff 정상화(겸사겸사 EOL 을 형제 파일과 같은 CRLF 로 통일).

**2026-05-28 변경 흡수 — 정산 도메인 차수(round) 확장 + 자동 임시저장(draft) + Universal/App Links 검증 + dev CORS RFC1918 자동 허용.** 한 세션이 N차 회식을 표현할 수 있도록 `SettlementSession → SettlementRound → (items / attendees)` 로 데이터 모델이 한 단계 깊어졌다. 영수증도 한 장 안에 2~5 차가 가로로 붙어 있는 경우를 지원해 `ExtractReceiptInput.split: { count, index }` 가 추가되고 sharp 가 N 등분 중 한 슬라이스를 잘라 vision LLM 에 넘긴다. 정산 입력은 클라이언트 debounce 로 서버에 자동 임시저장되며 — 신규 `settlement-draft` 모듈 (`/me/settlements/drafts`) 이 `(userId, placeIdKey)` 복합 unique 로 upsert, `placeIdKey=''` 가 식당 미지정 슬롯 sentinel 이다. 정산 본저장이 성공하면 같은 트랜잭션 안에서 `SettlementDraftService.deleteByIdInTxIfOwner` 로 해당 draft 만 정리. iOS Universal Links / Android App Links 검증을 위한 신규 `well-known` 모듈이 `/.well-known/apple-app-site-association` 와 `/.well-known/assetlinks.json` 을 env (`APP_TEAM_ID`/`APP_BUNDLE_ID`/`ANDROID_APP_PACKAGE`/`ANDROID_SHA256_FINGERPRINTS`) 기반으로 동적 응답하며, 비어 있으면 404 — 잘못된 빈 JSON 으로 검증 실패하는 사고를 피하기 위함. `plugins/cors.ts` 는 dev 한정으로 RFC1918 사설 LAN IP 와 localhost origin 을 regex 로 자동 허용해 LAN IP 로 붙은 Expo Web 의 friendly API 호출이 .env 수정 없이 통과한다. settlement 라우트는 PATCH `/api/v1/settlements/:id/participants` 가 제거되고 PUT `/api/v1/settlements/:id` 전체 replace 로 단일화 (서버는 deleteMany 후 재삽입). AI provider 카드는 form 의 key 를 저장 전에 검증할 수 있게 신규 GET `/admin/ai/providers/:id/:purpose/models/preview` 가 추가 — 어드민이 키를 입력하는 도중 그 키로 모델 목록을 받아 select 에서 고른 뒤 저장.

이전 (2026-05-25) 흡수 분도 그대로 유효: 정산 도메인 3 모듈 (`settlement-extraction` / `settlement` / `contact`) + `plugins/multipart.ts` (5MB) + LLM provider × purpose 분리 + DB 경로 통일 (`file:../data/dev.db`) + vitest `fileParallelism: false` + 부팅 시 `PRAGMA foreign_keys=ON` 강제.

## Purpose [coverage: high — 21 sources]

`apps/friendly`는 niney-life-pickr-v2 모노레포의 유일한 백엔드 서비스다. Fastify 5 위에 zod 기반 스키마 검증, JWT 인증, Prisma+SQLite 영속화, OpenAPI/Swagger 문서, Playwright 크롤링 런타임, Naver 이미지 썸네일 프록시(sharp), Ollama Cloud 기반 리뷰 요약 + 구조화 분석 + 메뉴 정규화/통계, vworld 지도 SDK 키 관리, multi-source 가게 통합(canonical), **정산하기(receipt OCR/vision → 세션 CRUD → 분배 → 공유 토큰) + 단골 참여자 자동 적립 + 정산 공유 OG 미리보기(SSR-lite head 주입 + 정산표 PNG 서버 렌더)** 까지 얹어 웹(`apps/web`)과 앱(`apps/mobile`)이 동시에 호출하는 단일 API를 제공한다. **(2026-08-21~30)** 여기에 공공데이터 프록시 3종(대기정보·날씨·일상지도)과 식단 관리 4모듈(음식 카탈로그·기록·사진 인식·추천)이 합류해 모듈 디렉터리는 **34개**가 됐다. **(2026-06-01)** 정산 공유 링크의 SNS 미리보기를 위해 `/api/v1` prefix 밖 루트 경로(`/share/settlements/:token`, `/s/:token`, `*/image.png`)를 직접 등록하는 신규 표면이 추가됐다. **(2026-06-25)** 여기에 (a) 맛집 상세 SEO/공유용 `/r/:placeId`·`/sitemap.xml`·`/robots.txt` 표면, (b) 리뷰 문맥검색(review-search)·문맥군집(review-clustering)·맛집 자동 발굴(random-crawl)·텔레그램 봇(telegram)·범용 작업 로그(logs) 다섯 도메인이 합류했다.

도메인 표면은 모듈 디렉터리로 나뉜다.

- **auth** — 회원가입/로그인/내 정보/로그아웃 (`Routes.Auth.*`)
- **picks** — 사용자별 "선택지" CRUD + 랜덤 추첨 (`Routes.Picks.*`)
- **admin** — 사용자 목록·역할 변경 (`Routes.Admin.*`, `requireAdmin`)
- **restaurant** — 크롤된 맛집 + 방문자 리뷰 영속화, 요약/분석 진행률 SSE, reanalyze/insights/smart-pick/region-stats + 메뉴 그룹핑/순위/분석 백필 라우트, 공개 list/detail/insights/reviews/category-tree + 공개 ranking (`Routes.Restaurant.*`). admin list 는 **페이징 + 서버 정렬** 로 진화 (recent/satisfaction/positive/negativeRatio). **(2026-06-25)** SEO/공유용 `/r/:placeId` 상세 미리보기 + `/sitemap.xml`/`/robots.txt` 는 [restaurant-preview.ts](../../apps/friendly/src/modules/restaurant/restaurant-preview.ts) 가 `/api/v1` 밖에 직접 등록.
- **summary** — 리뷰 단위 AI 요약+구조화 분석 라이프사이클 (HTTP 라우트 없음, 내부 모듈). **(2026-06-25)** 요약 종료 훅이 review-search enrich → review-clustering 군집화를 잇는다.
- **review-search** — **(NEW 2026-06-25)** 리뷰 문맥검색(RAG): bge-m3 임베딩 + 관점/문맥 enrich + 인앱 코사인 검색·QA. `ReviewSummary` 의 enrichment 컬럼 소유. friendly 차원선 `plugins/summaries.ts` 가 app-singleton 으로 decorate + `SummaryService` 에 주입. 자세한 건 [review-search 토픽](./review-search.md).
- **review-clustering** — **(NEW 2026-06-25)** 한 식당 리뷰를 "비슷한 문맥"으로 묶는 군집화(UMAP→HDBSCAN→c-TF-IDF Python 배치 + LLM 라벨). `ReviewCluster` 테이블 + `ReviewSummary.clusterId` 소유. `plugins/summaries.ts` 가 decorate. 자세한 건 [review-clustering 토픽](./review-clustering.md).
- **random-crawl** — **(NEW 2026-06-25)** 맛집 자동 발굴: cron 으로 지역을 골라 검색 → 후보를 텔레그램으로 보내고 사용자가 고른 가게만 크롤. `plugins/random-crawl.ts` 가 `randomCrawl` 데코 + 부팅 cron/폴러 시작. `RandomCrawlConfig`/`RandomCrawlRun` 소유. 자세한 건 [random-crawl 토픽](./random-crawl.md).
- **telegram** — **(NEW 2026-06-25)** 텔레그램 봇(`TelegramService`) + DB-backed 설정(`TelegramConfigService`/`TelegramConfig`). random-crawl 후보 전송·지역통계 명령·콜백 인입. `plugins/random-crawl.ts` 가 `telegram`/`telegramConfig` 데코. 자세한 건 [telegram 토픽](./telegram.md).
- **logs** — **(NEW 2026-06-25)** 범용 작업 로그/감사(`OperationLogService`) + 실패 run LLM 분석(`LogAnalysisService`). CrawlJobLog/JobLogService 를 일반화·대체 — 크롤/요약/정규화/머지/정산추출/스케줄/random-crawl 모든 기능이 같은 인스턴스로 run/스텝 로그를 흘린다. `OperationRun`/`OperationLog`/`OperationReport`/`LogConfig` 소유. `plugins/logs.ts` 가 decorate. 자세한 건 [logs 토픽](./logs.md).
- **menu-grouping** — 식당별 메뉴 표기 변형을 LLM으로 canonical 그룹핑 + 순위. 자세한 건 [menu-grouping 토픽](./menu-grouping.md).
- **analytics** — 글로벌 메뉴 통계 + 전역 LLM 머지 + 카테고리 트리. 자세한 건 [analytics 토픽](./analytics.md).
- **schedule** — **(NEW 2026-06-06)** croner 기반 in-process 주기 스케줄러. "메뉴 정규화(menu-grouping) → 글로벌 머지(analytics)" 파이프라인을 cron(기본 매일 03:00 KST) 으로 자동 실행 + 어드민 "지금 실행"(manual). 동시 1개만(overlap skip), 식당별 정규화는 멱등이라 재실행 안전, 크롤 진행 중 식당은 건너뜀. 자세한 건 [schedule 토픽](./schedule.md).
- **canonical** — cross-source 가게 동일성(canonical) + 자동 매칭 제안 큐. CanonicalService + ProposalService. 자세한 건 [canonical 토픽](./canonical.md).
- **auto-discover** — 어드민 키워드 한 줄 + 카테고리 칩 입력으로 AI 키워드 8 개 생성 → 다중 검색 → dedupe → 등록된 placeId 분리 → 그룹 5 개씩 직렬 크롤까지 한 잡으로 묶는 자동 발견 워크플로. 자세한 건 [auto-discover 토픽](./auto-discover.md).
- **settlement-extraction** — **(2026-05-25)** 영수증 multipart 업로드(JPEG/PNG/WebP, 5MB) → vision LLM 으로 메뉴/금액 추출 → 식당 메뉴 매칭/카테고리 분류 → 디스크 보관 (`data/receipts/<token>.jpg`). **(2026-05-28)** `ExtractReceiptInput.split: { count, index }` (count 2..5, 1-based index) + `roundIndex/roundTotal` 힌트 추가 — 한 장에 여러 차수 영수증이 가로로 붙어 있을 때 sharp 로 좌→우 N 등분 중 한 슬라이스만 잘라 LLM 에 넘긴다. 자세한 건 [settlement 토픽](./settlement.md).
- **settlement** — **(2026-05-25)** 정산 세션 CRUD + 카테고리별 분배 계산 + 공유 토큰 발급/회수. owner 본인만 보고 편집 가능, `shareToken` 으로 공개 read-only 페이지에 노출. **(2026-05-28)** 차수(N차) 정산 도입 — `SettlementSession → SettlementRound → (items / attendees)`. PATCH `/:id/participants` 가 제거되고 PUT `/:id` 전체 replace 로 통합. 자세한 건 [settlement 토픽](./settlement.md).
- **settlement-draft** — **(NEW 2026-05-28)** 정산 입력의 서버측 자동 임시저장 (`/me/settlements/drafts`). `(userId, placeIdKey)` 복합 unique 로 upsert — 식당 미지정 슬롯은 `placeIdKey=''` sentinel. payload 는 그대로 JSON 보관(검증 없음). 본저장 성공 시 같은 트랜잭션 안에서 `deleteByIdInTxIfOwner` 로 정리 (없거나 권한 없으면 silent skip — 정산 저장 자체는 성공해야 하므로).
- **settlement/share-preview** — **(NEW 2026-06-01)** 정산 공유 링크의 SNS 미리보기(OG) 처리. `app.ts` 가 `registerSharePreview(app)` 로 `/api/v1` 밖에 `/share/settlements/:token`·`/s/:token`(HTML) + `*/image.png`(PNG) 를 등록. HTML 핸들러는 빌드된 웹 `index.html` 의 `<head>` 에만 OG/twitter 메타를 주입(SSR-lite), 프라이버시상 참가자 이름은 안 넣고 식당명·총액·인원수까지만. PNG 핸들러는 `settlement-card.ts` 로 정산표를 렌더. 둘 다 토큰 기반 공개 라우트(인증 불필요), 만료/없음 → HTML 은 일반 OG 폴백·PNG 는 404. `getBySharedToken`/`getSharePreviewMeta` 를 직접 호출하는 `SettlementService` 인스턴스를 라우트에서 생성.
- **contact** — **(2026-05-25)** 사용자별 "단골 참여자" CRUD (`/me/contacts`). 정산 저장 시 participant 가 `(userId, normalizedKey)` 로 자동 upsert 되어 다음 정산에서 자동완성·다중 선택 모달로 재사용. 자세한 건 [settlement 토픽](./settlement.md).
- **well-known** — **(NEW 2026-05-28)** iOS Universal Links / Android App Links 검증 파일을 동적 응답. `/.well-known/apple-app-site-association` (AASA) + `/.well-known/assetlinks.json`. env (`APP_TEAM_ID`/`APP_BUNDLE_ID`/`ANDROID_APP_PACKAGE`/`ANDROID_SHA256_FINGERPRINTS`) 기반, 비어 있으면 404. components 의 path 가 `/share/settlements/*` 라 설치된 앱이 정산 공유 링크를 인터셉트. 인증 불필요, `Cache-Control: public, max-age=300`.
- **media** — Naver CDN 이미지 썸네일 프록시 + 디스크 캐시 (`Routes.Media.*`)
- **bus** — **(NEW 2026-07-06)** 서울시 버스 API 프록시. 정류소 검색/주변/실시간 도착/노선 실시간 차량 위치/노선 상세는 공개(`Routes.Bus.*`), 즐겨찾기(`/bus/favorites/*`) 만 인증. 어댑터+서비스+라우트+즐겨찾기 + in-memory 일일 쿼터 게이트, `BUS_API_KEY` env. 자세한 건 [bus 토픽](./bus.md).
- **subway** — **(NEW 2026-07-07)** 수도권 전철 API 프록시. 역 검색/주변/실시간 도착/호선 실시간 열차 위치/호선 상세/역 시간표/시간대별 혼잡도/경로 탐색(로컬 다익스트라)은 공개(`Routes.Subway.*`), 즐겨찾기(`/subway/favorites/*`) 만 인증. 어댑터+다중 서비스(master/line-order/path/congestion/verify/favorite)+라우트+즐겨찾기. 검색/주변/노선상세/시간표/혼잡은 로컬 적재 데이터라 쿼터·셀 캐시 없음, 도착/위치만 15초 마이크로 캐시. env 2종 `SUBWAY_API_KEY`(실시간)·`SEOUL_OPEN_API_KEY`(정적 적재). 자세한 건 [subway 토픽](./subway.md).
- **air-quality** — **(NEW 2026-08-21)** 에어코리아 대기정보 프록시(공개·비로그인): 시도별 실시간·측정소 이력·나쁨 측정소·예보/주간예보·측정소 목록/주변/검색(`Routes.AirQuality.*`) + 로그인 사용자 "내 대기 위치" 1행(`air-location.route.ts` → `AirUserLocation`). 어댑터([airkorea-api.adapter.ts](../../apps/friendly/src/modules/air-quality/airkorea-api.adapter.ts)) + 서비스(in-memory TTL 캐시 + stale 폴백) + 라우트 2개. 키 `AIRKOREA_API_KEY || BUS_API_KEY`, 둘 다 비면 503. 자세한 건 [air-quality 토픽](./air-quality.md).
- **weather** — **(NEW 2026-08-21)** 기상청 단기·중기예보 프록시(공개): 초단기실황+예보·단기예보·예보버전·중기(육상+기온+전망)·중기해상 + API허브 AWS 매분 관측 보강(`Routes.Weather.*`). 어댑터 2종([kma-api.adapter.ts](../../apps/friendly/src/modules/weather/kma-api.adapter.ts)·[kma-apihub.adapter.ts](../../apps/friendly/src/modules/weather/kma-apihub.adapter.ts)) + 서비스 2종(`weather`·`aws`). 키 `KMA_API_KEY || BUS_API_KEY`(503), AWS 는 `KMA_APIHUB_KEY`(비면 `enabled=false` 200). meal-recommendation 이 `WeatherService.getNowcast` 를 날씨 컨텍스트로 재사용. 자세한 건 [weather 토픽](./weather.md).
- **life-map** — **(NEW 2026-08-21, 병의원 08-30)** 전국 CCTV·공중화장실·병의원 일상지도(공개, 로컬 SQLite 조회뿐 — 업스트림 쿼터 0): 적재 상태/뷰포트 `points`(줌 임계 아래는 서버 집계 셀)/주변/지역 이동 검색(VWorld 검색 프록시)/단건 상세(`Routes.LifeMap.*`). CSV·심평원 API 적재는 스크립트(`load:life-*`) + master 서비스, 주소 지오코딩은 VWorld + `LifeGeocodeCache` 영구 캐시(+ 저장소에 커밋된 압축본 [data/life-geocode-cache.json.gz](../../apps/friendly/src/modules/life-map/data/life-geocode-cache.json.gz)). 자세한 건 [life-map 토픽](./life-map.md).
- **food** — **(NEW 2026-08-22, 23차)** 음식 카탈로그(식단 마스터): 인증 사용자 자동완성 `search`·음식→식당 역검색 `restaurants(:id)` + 어드민 카탈로그 CRUD/통계/충돌 큐/인식 품질 + 적재 잡(config/run/runs/preview/SSE — random-crawl 골격, [food-import-registry.ts](../../apps/friendly/src/modules/food/food-import-registry.ts) 모듈 싱글턴 + `scheduleRegistry` jobType `food-import`). `plugins/food-import.ts` 가 `foodImport`/`foodClassify` decorate. 자세한 건 [food 토픽](./food.md).
- **meal** / **meal-recognition** / **meal-recommendation** — **(NEW 2026-08-22~23, 23차)** 로그인 사용자 개인 식단(공개 표면 없음): 기록 CRUD·달력·통계·시간 프리셋·지난번 항목·사진 업로드/조회/복제/삭제·선호 설정·내보내기/백업/복원/보존/전체 삭제([meal.route.ts](../../apps/friendly/src/modules/meal/meal.route.ts)), 사진→음식 인식([meal-recognition.route.ts](../../apps/friendly/src/modules/meal-recognition/meal-recognition.route.ts) — purpose `meal-photo`, `RATE.mealRecognize` + SQLite 일일 quota), 다음 끼니 추천·피드백·이벤트([meal-recommendation.route.ts](../../apps/friendly/src/modules/meal-recommendation/meal-recommendation.route.ts) — purpose `meal-recommend`, 날씨 컨텍스트). `plugins/meal.ts` 가 `mealPhotos` decorate + 고아 사진 GC cron. 자세한 건 [meal 토픽](./meal.md).
- **vote** — **(NEW 2026-07-13)** 그룹 투표 픽 — 방장 생성·링크 공유·비로그인 복수 찬성·마감(`Routes.Vote.*`), 공개 OG `vote-preview` 는 app.ts 명시 등록. 자세한 건 [vote 토픽](./vote.md).
- **settings** — 외부 지도 SDK 키(vworld) 관리. admin CRUD + 평문 reveal + 공개 키 노출 (`Routes.SettingsMap.*`). **(2026-08-21)** life-map 지역 검색·지오코딩이 같은 `MapSettingsService.getSecret('vworld')` 키를 재사용.
- **health** — 라이브니스 체크 (`Routes.Health`, `/health`)
- **crawl** — 별도 위키 토픽 ([crawl 토픽 참조](./crawl.md))
- **ai** — 별도 위키 토픽 ([ai 토픽 참조](./ai.md))

CLAUDE.md 규약상 모든 모듈은 `*.route.ts`(HTTP) + `*.service.ts`(비즈니스) + `*.test.ts`(Vitest) 트리오로 구성하고, FE/BE가 공유하는 타입/검증 로직은 모두 `@repo/api-contract`의 zod 스키마로만 정의한다. [apps/friendly/package.json](../../apps/friendly/package.json)의 `name: "friendly"`가 워크스페이스 식별자이며, `pnpm dev:api`/`pnpm --filter friendly <cmd>`로 단독 실행한다.

## Architecture [coverage: high — 42 sources]

엔트리 흐름은 `server.ts → buildApp() → autoload(plugins) → autoload(modules/*.route.ts) → registerSharePreview(app) → registerRestaurantPreview(app)` 로 단방향이고, listen 직전에 부팅 hook **6종**(`cleanupStaleReviewSummaries` → `rescheduleStaleSummaries` → `schedule.bootstrap()` → **`telegramConfig.bootstrap()`** → **`randomCrawl.bootstrap()`** → **(NEW 2026-08-22) `foodImport.bootstrap()`**)이 순차 실행된다.

- [src/server.ts](../../apps/friendly/src/server.ts) — `buildApp()` 호출 직후 부팅 정리 **(UPDATED 2026-08-22) 6단계** — (6) `await app.foodImport.bootstrap()`: `FoodImportConfig` 로 cron 등록 + `running` 고아 `FoodImportRun` 을 `interrupted` 정리. 이전 **(2026-06-25) 5단계**: (1) `cleanupStaleReviewSummaries(...)` stale 요약 정리, (2) `rescheduleStaleSummaries(...)` 자동 재큐잉, (3) `await app.schedule.bootstrap()` — running 으로 남은 `ScheduleRun` 을 `interrupted` 마킹 + `ScheduleConfig` cron 등록, **(4) `await app.telegramConfig.bootstrap()`** — DB(설정>텔레그램) 값이 있으면 env 대신 그 토큰/chatId 로 봇 재구성(random-crawl 폴링 전에 확정), **(5) `await app.randomCrawl.bootstrap()`** — DB 설정으로 cron 등록 + 텔레그램 폴러 시작 + awaiting 만료 sweep 타이머(running/crawling 고아만 interrupted, awaiting_selection 은 살려둠 — 콜백이 DB 행을 찾아 이어감). 그 뒤 `env.HOST:env.PORT` 로 listen. SIGTERM/SIGINT 핸들러는 중복 호출 가드 후 **`scheduleRegistry.stopAllCrons()` + `abortInflight()`** 로 cron 타이머 정지·진행 중 주기작업 취소 → `app.close()` → `process.exit(0)`(random-crawl 폴러/sweep 타이머는 plugin `onClose` 의 `randomCrawl.shutdown()` 이 정리). close 가 15s 안에 안 끝나면 unref 된 safety 타이머가 `exit(1)`.
- [src/app.ts](../../apps/friendly/src/app.ts) — Fastify 인스턴스를 만들고 `forceCloseConnections: 'idle'` 로 graceful shutdown 시 idle keep-alive 연결을 즉시 닫는다(처리 중 요청은 완료 대기) — 스케줄러 정리 후 `app.close()` 가 매달리지 않게. 그다음 `withTypeProvider<ZodTypeProvider>()`를 적용한 뒤 `validatorCompiler`/`serializerCompiler`를 등록한다. `serializers.req`에서 `?token=` 쿼리스트링을 `[REDACTED]`로 마스킹(SSE 인증용 JWT가 매 로그 라인에 박히지 않도록). `dev`에서는 `pino-pretty` 트랜스포트. 그다음 `@fastify/autoload`로 두 단계 등록:
  1. `plugins/` 디렉터리 전체 자동 로드
  2. `modules/` 하위에서 `*.route.(ts|js)`만 골라 자동 로드 (`dirNameRoutePrefix: false` — URL prefix는 `Routes.*` 상수가 결정)
  그 직후 `/api/v1` prefix **밖** 루트 경로에 명시 호출 2개를 건다(autoload 아님 — OG/SEO 크롤러가 origin 루트에서 찾는 경로라 prefix 가 붙으면 안 됨): **(2026-06-01)** `await registerSharePreview(app)` (정산 공유 `/share/settlements/*`·`/s/*`·`*/image.png`) + **(NEW 2026-06-25)** `await registerRestaurantPreview(app)` (맛집 상세 `/r/:placeId` SEO/공유 HTML + `/sitemap.xml` + `/robots.txt`).
- [src/types/fastify.d.ts](../../apps/friendly/src/types/fastify.d.ts) — `FastifyInstance`에 `prisma`, `authenticate`, `requireAdmin` 데코레이터, `FastifyRequest.user`에 `{ userId, email, role }` 타입을 선언. **(2026-06-25)** 각 plugin 파일이 자기 데코(`schedule`/`operationLog`/`logAnalysis`/`randomCrawl`/`telegram`/`telegramConfig`/`reviewSearch`/`reviewClustering`)를 `declare module 'fastify'` 로 합류. **(2026-08-22)** `foodImport`/`foodClassify`(plugins/food-import.ts)·`mealPhotos`(plugins/meal.ts) 도 같은 방식.
- [src/types/fastify.d.ts](../../apps/friendly/src/types/fastify.d.ts) — `FastifyInstance`에 `prisma`, `authenticate`, `requireAdmin` 데코레이터, `FastifyRequest.user`에 `{ userId, email, role }` 타입을 선언.

플러그인 레이어 (모두 `fastify-plugin`으로 감싸 데코레이터를 부모 스코프에 노출):

- [plugins/cors.ts](../../apps/friendly/src/plugins/cors.ts) — `env.CORS_ORIGIN`이 `*`이면 `true`, 아니면 콤마 분리. `credentials: true`. **(2026-05-31 갱신)** dev (`isDev`) 에선 origin 을 **제한하지 않고 전부 반사 허용**(`cb(null, true)`) — 개발 머신 IP 가 수시로 바뀌어 화이트리스트가 무의미 + prod 는 아래 env list 로 막으므로 보안 영향 없음. 이전(2026-05-28)의 `PRIVATE_LAN_ORIGIN` regex(`localhost`/`127.0.0.1`/`10.x`/`192.168.x`/`172.16~31.x`, optional `:port`)는 이제 거부용이 아니라 **분류용** — 매칭 안 되는 비-LAN origin 만 `warned` Set 으로 origin 당 1회 `app.log.warn`. (이전엔 비-LAN origin 을 `cb(Error)` 로 거부 → 로그인 등 preflight 가 통째로 깨졌음.) production 은 dev 분기 자체가 없어 env CORS_ORIGIN 만 사용.
- [plugins/helmet.ts](../../apps/friendly/src/plugins/helmet.ts) — `contentSecurityPolicy: false` (Swagger UI 호환).
- [plugins/sensible.ts](../../apps/friendly/src/plugins/sensible.ts) — `reply.unauthorized()`/`reply.forbidden()`/`app.httpErrors.*`.
- [plugins/jwt.ts](../../apps/friendly/src/plugins/jwt.ts) — `@fastify/jwt` + `authenticate`/`requireAdmin` 데코레이터.
- [plugins/prisma.ts](../../apps/friendly/src/plugins/prisma.ts) — `PrismaClient` 인스턴스, `app.prisma` 노출, `onClose`에 `$disconnect`. 부팅 시 PRAGMA 셋업: **`journal_mode=WAL`** (동시 읽기), **`synchronous=NORMAL`**, **`busy_timeout=30000`** (SQLITE_BUSY → "Transaction not found" 회피), **`foreign_keys=ON`** (SQLite 기본 OFF — Cascade 가 실제 동작하려면 필수). `name: 'prisma'` 로 다른 플러그인이 `dependencies: ['prisma']` 로 줄 세울 수 있게 등록.
- [plugins/swagger.ts](../../apps/friendly/src/plugins/swagger.ts) — OpenAPI 메타 + `bearerAuth` 시큐리티 스킴, Zod→JSON Schema 변환. UI는 `/docs`.
- [plugins/error-handler.ts](../../apps/friendly/src/plugins/error-handler.ts) — `ZodError`/Fastify validation/4xx/5xx 정규화. dev에서만 5xx 메시지 노출. **(2026-06-01)** `setErrorHandler((error: FastifyError, ...))` — 콜백의 `error` 가 타입 추론상 `unknown` 으로 떨어지던 것을 `FastifyError` 명시 주석으로 좁혀 `error.validation`/`error.statusCode`/`error.name` 접근의 타입 안전을 회복(런타임 동작 불변).
- [plugins/empty-body-parser.ts](../../apps/friendly/src/plugins/empty-body-parser.ts) — 빈 `application/json` body를 `{}`로 해석(action 없는 POST용).
- [plugins/summaries.ts](../../apps/friendly/src/plugins/summaries.ts) — **(UPDATED 2026-06-25)** 자체 `AiConfigService` 로 `SummaryService` + `ReviewSearchService` + `ReviewClusteringService` 를 만들어 `app.decorate('summaries'|'aiConfig'|'reviewSearch'|'reviewClustering', ...)`. reviewSearch/reviewClustering 도 app-singleton 이라야 corpusCache(LRU)·enrich 진행상태·군집화를 라우트·요약 훅이 한 인스턴스로 공유한다 — `SummaryService` 에 둘 다 주입해 **요약 종료 → 자동 enrich → 군집화** 체인이 스케줄/지역랜덤/텔레그램 선택 크롤 경로에서도 동작. `dependencies: ['prisma', 'logs']`. **JobLogService 퇴역** — 잡 단계 로그는 전부 `plugins/logs.ts` 의 `OperationLogService` 단일 인스턴스로 흘러 SSE seq 가 단일 카운터(클라이언트 `(jobId,seq)` dedup 보존).
- **[plugins/multipart.ts](../../apps/friendly/src/plugins/multipart.ts) — (NEW 2026-05-25)** `@fastify/multipart` 등록. `fileSize: 5 * 1024 * 1024` (5MB), `files: 1`, `fields: 5`. 한도 초과 시 multipart 가 자동 413. 영수증 업로드 (`settlement-extraction`) 가 사용. 다른 multipart 소비자가 생기면 한도 상향은 여기서 한 번에.
- **[plugins/schedule.ts](../../apps/friendly/src/plugins/schedule.ts) — (NEW 2026-06-06)** `ScheduleService` 를 `app.decorate('schedule', ...)` 로 노출하는 app-level singleton — `summaries.ts` 와 같은 plugin-singleton 패턴. **(UPDATED 2026-06-25) `dependencies: ['prisma', 'logs']`** (이전 `['prisma']`) — cron 경로의 schedule run 과 자식 run(menu-grouping/global-merge)을 `parentRunId` 로 연계하려면 `app.operationLog` 가 선행돼야 함. **자체 `AiConfigService` 를 생성**해 `MenuGroupingService`/`AnalyticsService` 를 직접 만든다(`app.aiConfig` 재사용 안 함) — autoload 알파벳순상 `'schedule' < 'summaries'` 라 schedule plugin 이 먼저 잡혀 `app.aiConfig`(summaries 가 decorate) 가 아직 없기 때문(이제 `'logs' < 'schedule' < 'summaries'` 라 logs 의 operationLog 는 쓸 수 있다). `onClose` hook 에서 `scheduleRegistry.stopAllCrons()` + `abortInflight()`. 라우트(`schedule.route.ts`)와 부팅 cron tick(`server.ts`)이 같은 `app.schedule` 인스턴스를 공유하고, cron 타이머·진행 상태만 모듈 singleton `scheduleRegistry` 가 보유.
- **[plugins/logs.ts](../../apps/friendly/src/plugins/logs.ts) — (NEW 2026-06-25)** `OperationLogService`(run/스텝 기록·SSE) + `LogAnalysisService`(실패 run LLM 분석) 를 `app.decorate('operationLog'|'logAnalysis', ...)`. 자체 `AiConfigService` 생성(`'logs' < 'summaries'` 라 `app.aiConfig` 재사용 불가 — schedule 관례와 동일). `dependencies: ['prisma']` (알파벳순 `'logs' < 'prisma'` 라 선언 빠지면 부팅 깨짐). 비-test 환경에선 부팅 즉시 `sweepStaleOperationRuns` + 보존 정리 1회 + `0 4 * * *` 보존 cron(`logs-retention`, unref). 모든 기능 계측과 `logs.route` 가 같은 인스턴스를 공유해야 seq 카운터/in-flight 가드가 한 곳. 자세한 건 [logs 토픽](./logs.md).
- **[plugins/random-crawl.ts](../../apps/friendly/src/plugins/random-crawl.ts) — (NEW 2026-06-25)** `RandomCrawlService` + `TelegramService` + `TelegramConfigService` 를 `app.decorate('randomCrawl'|'telegram'|'telegramConfig', ...)`. `dependencies: ['prisma', 'logs']` (operationLog 필요). **여기서 RestaurantService/AiConfigService/Summary( + reviewSearch enrich 훅)/CanonicalService/ProposalService/CrawlService 를 새로 조립**한다(autoload 순서 비의존) — `jobRegistry` 는 모듈 singleton 이라 다른 곳의 CrawlService 와 in-flight/dedup 상태를 공유. `telegram`/`telegramConfig` 가 같은 `TelegramService` 인스턴스를 공유해 설정 저장이 즉시 폴러에 반영. `onClose` 에서 `randomCrawl.shutdown()`(sweep 타이머·폴러 정지 + cron 해제 + abort). cron 타이머는 `scheduleRegistry` 에 jobType `'random-crawl'` 로 등록돼 schedule(`normalize-merge`)과 키만 다르게 공존. 자세한 건 [random-crawl 토픽](./random-crawl.md) / [telegram 토픽](./telegram.md).
- **[plugins/food-import.ts](../../apps/friendly/src/plugins/food-import.ts) — (NEW 2026-08-22)** `FoodImportService` + `FoodClassifyService` 를 `app.decorate('foodImport'|'foodClassify', ...)`. `dependencies: ['prisma', 'logs']`(알파벳순 `'food-import' < 'logs' < 'prisma'` 라 선언이 없으면 둘 다 undefined). 자체 `AiConfigService`(chat purpose — LLM 2축 분류) 를 `buildLlmProviderEnv()` 로 조립(summaries 보다 먼저 로드되므로 `app.aiConfig` 재사용 불가 — schedule/logs 관례). 소스 키는 여기서 주입: `nutrition: FOOD_API_KEY || BUS_API_KEY`, `recipe: FOOD_RECIPE_API_KEY`, `mafra: MAFRA_API_KEY` — 비어 있는 소스는 회차에서 오류로 기록·건너뜀. cron 은 `scheduleRegistry` jobType `'food-import'`(기본 `0 4 1 * *` 매월 1일 04:00), live 상태는 [food-import-registry.ts](../../apps/friendly/src/modules/food/food-import-registry.ts) 모듈 싱글턴(동시 1개 — 진짜 overlap 가드는 DB `FoodImportRun` 조회). `onClose` 에서 `foodImport.shutdown()`. 자세한 건 [food 토픽](./food.md).
- **[plugins/meal.ts](../../apps/friendly/src/plugins/meal.ts) — (NEW 2026-08-22)** `MealPhotoService` 를 `app.decorate('mealPhotos', ...)` — 업로드·조회·삭제 라우트와 인식 라우트, 고아 정리 cron 이 같은 인스턴스. `dependencies: ['prisma']`. 부팅 직후 1회 + 매일 04:30(`GC_CRON='30 4 * * *'`, `scheduleRegistry.setCron('meal-photo-gc', …)`) 에 `drainDeletionOutbox → sweepOrphans → sweepUntrackedFiles → sweepMealRecognitionDebugDumps` 4단계 GC — 사용자가 사진만 올리고 기록을 안 남기면 파일이 남는데(영수증엔 없던 문제 — 식단은 업로드 빈도가 훨씬 높다) DB 고아 행뿐 아니라 DB 기록 전에 종료돼 파일만 남은 경우까지 정리. `isTest` 면 `storageDir` 를 `os.tmpdir()/lifepickr-test-meal-photos` 로 보내 리포 `data/meal-photos` 를 더럽히지 않는다. `onClose` 에서 `scheduleRegistry.clearCron('meal-photo-gc')`.
- **[plugins/rate-limit.ts](../../apps/friendly/src/plugins/rate-limit.ts) — (UPDATED 2026-08-21~23)** `RATE` 상수에 8종 추가: `lifeMapRead`(240/분 — 지도 이동마다 레이어당 1콜, 패닝 연타 + CGNAT) · `lifeMapSearch`(60/분) · `foodSearch`(120/분 — 음식 연달아 입력) · `foodRestaurants`(60/분 — 식당/리뷰 집계 조인) · `mealPhotoUpload`(30/분 — 장당 1요청 최대 5장) · `mealRecognize`(10/분 — 진짜 비용 방어선은 `MEAL_RECOGNIZE_DAILY_LIMIT`) · `mealRecommend`(10/분) · `mealDataArchive`(**10/시간** — 최대 75MB JSON 백업/복원이 단일 SQLite/프로세스를 오래 점유하지 않게). 공공데이터 프록시(air/weather)는 기존 `transitRealtime`(60/분) 을 재사용.
- **`buildLlmProviderEnv()` 로 통일된 AiConfig 조립 (UPDATED 2026-08-22, `cc8399a`)** — `plugins/logs.ts`·`random-crawl.ts`·`schedule.ts`·`summaries.ts`·`food-import.ts` 다섯 plugin 과 `ai`/`analytics`/`auto-discover`/`menu-grouping`/`settlement-extraction`/`meal-recognition`/`meal-recommendation` 7개 라우트, 스크립트 9종, research 프로브 10종이 모두 [modules/ai/llm-provider-env.ts](../../apps/friendly/src/modules/ai/llm-provider-env.ts) 의 `buildLlmProviderEnv()` 한 함수로 `LlmProviderEnv`(apiKey/baseUrl/timeoutMs/maxConcurrent + purpose 5종 `defaultModels`) 를 만든다. 이전엔 파일마다 `buildEnvBlock` 리터럴이 복제돼 purpose 가 늘 때마다 전부 고쳐야 했다. 테스트는 `.env` 를 읽지 않고 가짜 `LlmProviderEnv` 를 직접 만든다(`ai.config.service.test.ts`).

모듈 레이어 — 현재 디렉터리:

```
modules/
├── admin/
├── ai/
│   └── llm-provider-env.ts                  ← (NEW 2026-08-22) .env → LlmProviderEnv 조립 단일 진입점 buildLlmProviderEnv()
├── air-quality/              ← (NEW 2026-08-21) 에어코리아 대기정보 프록시 — airkorea-api.adapter + air-quality/air-location {route,service} + __fixtures__ (air-quality 토픽)
├── analytics/                ← 글로벌 메뉴 통계 + 전역 LLM 머지 (analytics 토픽)
├── auth/
├── auto-discover/            ← AI 키워드 → 다중 검색 → 그룹 직렬 크롤 자동 발견 잡 (auto-discover 토픽)
├── bus/                      ← (NEW 2026-07-06) 서울시 버스 API 프록시 — 어댑터+서비스+공개 라우트+즐겨찾기 (bus 토픽)
├── subway/                   ← (NEW 2026-07-07) 수도권 전철 API 프록시 — 어댑터+다중 서비스(master/line-order/path/congestion/verify/favorite)+공개 라우트+즐겨찾기 (subway 토픽)
├── canonical/                ← cross-source 가게 통합 + 자동 매칭 제안 (canonical 토픽)
├── contact/                  ← /me/contacts — 단골 참여자 CRUD (settlement 토픽)
├── crawl/
├── food/                     ← (NEW 2026-08-22) 음식 카탈로그 — food.route + service/import/import-registry/classify/nutrition/allergen/merge-conflict/recognition-quality/source-audit + food-api.adapter + prompts (food 토픽)
├── health/
├── life-map/                 ← (NEW 2026-08-21) 일상지도 — life-map.route + service/search/master/hospital-master/geocode/geocode-cache + vworld-search·hira-hospital 어댑터 + data/life-geocode-cache.json.gz (life-map 토픽)
├── logs/                     ← (NEW 2026-06-25) 범용 작업 로그 + 실패 run LLM 분석 (logs 토픽)
├── meal/                     ← (NEW 2026-08-22) 식단 기록 — meal.route + service/data/photo/preference/stats/stats.insights/daily-quota/mutation-barrier/recognition-debug.store (meal 토픽)
├── meal-recognition/         ← (NEW 2026-08-22) 사진→음식 인식 — route + service + eval + prompts (MEAL_RECOGNITION_VERSION=2) (meal 토픽)
├── meal-recommendation/      ← (NEW 2026-08-22) 다음 끼니 추천 — route + service + pattern + feedback + prompts (MEAL_RECOMMENDATION_VERSION=2) (meal 토픽)
├── media/                    ← 썸네일 프록시 + (NEW 2026-06-25) panorama-cache.ts(파노라마 사본)
├── menu-grouping/            ← 식당별 메뉴 LLM 그룹핑 + 순위 (menu-grouping 토픽)
├── picks/
├── random-crawl/             ← (NEW 2026-06-25) 맛집 자동 발굴 cron + 텔레그램 후보 (random-crawl 토픽)
├── restaurant/
│   ├── restaurant-preview.ts                ← (NEW 2026-06-25) /r/:placeId SEO/공유 + sitemap.xml + robots.txt (app.ts 명시 등록)
│   ├── region-derive.ts                     ← (NEW 2026-06-25) 주소/좌표 → 시도·시군구 파생(regions.json)
│   ├── region-stats-telegram.ts             ← (NEW 2026-06-25) 지역통계 텔레그램 렌더(순수 함수, telegram 토픽)
│   ├── canonical-members.ts                 ← (NEW 2026-06-25) canonical 멤버 집합(naver+dc+tabling) — enrich/QA/군집 공용
│   └── restaurant.merge.ts                  ← canonical 그룹 → 단일 public detail 융합(+ tabling)
├── review-clustering/        ← (NEW 2026-06-25) 리뷰 문맥 군집화 (review-clustering 토픽)
├── review-search/            ← (NEW 2026-06-25) 리뷰 문맥검색/RAG enrich (review-search 토픽)
├── schedule/                 ← (NEW 2026-06-06) croner 주기 스케줄러 (schedule 토픽)
│   ├── schedule.service.ts                  ← 파이프라인 로직 + config/run/preview/이력
│   ├── schedule-registry.ts                 ← 모듈 singleton: cron 타이머 + inflight run(동시 1개) + SSE
│   ├── schedule.route.ts                    ← /admin/schedule/* 5종(config·run·runs·preview·run-events SSE)
│   └── schedule.service.test.ts
├── settings/                 ← 지도 SDK 키 관리 (vworld, DB+env fallback) + telegram-config (telegram 토픽)
├── settlement/               ← 정산 세션 CRUD + 차수(round) + 분배 + 공유 토큰
│   ├── settlement.{route,service,*.test}.ts
│   ├── settlement-draft.{route,service,route.test}.ts   ← (NEW 2026-05-28) /me/settlements/drafts
│   ├── share-preview.ts                                 ← (NEW 2026-06-01) OG SSR-lite HTML + image.png 라우트 (app.ts 명시 등록)
│   └── settlement-card.ts                               ← (NEW 2026-06-01) 정산표 PNG 서버 렌더 (satori + resvg)
├── settlement-extraction/    ← 영수증 multipart → vision LLM 추출 + (2026-05-28) split 분할
├── summary/
├── telegram/                 ← (NEW 2026-06-25) 텔레그램 봇 서비스 (telegram 토픽)
├── vote/                     ← (NEW 2026-07-13) 그룹 투표 픽 — vote.route/service + vote-preview(app.ts 명시 등록) (vote 토픽)
├── weather/                  ← (NEW 2026-08-21) 기상청 날씨 프록시 — kma-api·kma-apihub 어댑터 + weather/aws service + weather.route + __fixtures__ (weather 토픽)
└── well-known/               ← (NEW 2026-05-28) AASA + assetlinks.json (universal/app links)
```

(2026-08-30 기준 34 디렉터리 — 이전 목록의 `user/` 는 존재하지 않는 항목이라 제거.)

autoload는 route 파일만 픽업하므로 `summary/`처럼 라우트 파일이 없는 모듈은 외부에서 모듈 싱글턴(`summaryEventsBus`)과 명시적 import로만 접근한다 — **review-search/review-clustering/telegram 도 라우트 노출 없이 plugin 이 만든 app-singleton 으로 접근**(review-search/clustering 은 `restaurant.route` 가, telegram 은 random-crawl 폴러가 호스팅). analytics/menu-grouping/settings/canonical/contact/settlement/settlement-extraction/**schedule**/**logs**/**random-crawl**/**(2026-08) air-quality(route 2개)·weather·life-map·food·meal·meal-recognition·meal-recommendation** 은 자체 `*.route.ts` 가 있어 자동 등록. 식단 3디렉터리는 `Routes.Meal` 한 namespace 를 나눠 갖는다(`/meals/recognize` 는 meal-recognition, `/meals/recommendations*` 는 meal-recommendation, 나머지는 meal).

**적재 파서 라이브러리 (lib/csv.ts · lib/xlsx.ts, NEW 2026-08-22 `5cdbc0f`)** — [lib/csv.ts](../../apps/friendly/src/lib/csv.ts) 는 RFC 4180 CSV 를 제너레이터(`iterateCsvRows`)로 훑어 따옴표 필드(쉼표·줄바꿈·`""` 이스케이프)·CRLF/LF·BOM 을 처리하고 `parseCsv(text) → { header, rows }`·`csvColumnIndex(header)` 를 내놓는다. 공공데이터 CSV(CP949)는 호출자가 `TextDecoder('euc-kr')` 로 먼저 문자열을 만들며, 79MB(CCTV) 도 문자열 하나로 들고 파싱하는 단순 구현 — 적재 스크립트 전용이라 스트리밍은 하지 않는다(subway-verify 의 `splitCsv` 는 쉼표 목록용이라 별개). [lib/xlsx.ts](../../apps/friendly/src/lib/xlsx.ts) 는 공공데이터 배포본이 XLSX 로만 오는 경우(한식진흥원 800선)를 위해 **새 의존성 없이** zip(EOCD→중앙 디렉터리→로컬 헤더, deflate 만 `inflateRawSync`) + `sharedStrings.xml`/`sheetN.xml` 정규식 파싱으로 `parseXlsx(buf, sheetName?) → { header, rows }`(parseCsv 와 같은 모양) 와 `listXlsxSheets` 를 제공 — 수식 계산·날짜 서식·ZIP64·암호화 미지원, 수십 MB 는 CSV 로 받는다. **공유 관계**: life-map 의 [life-map-master.service.ts](../../apps/friendly/src/modules/life-map/life-map-master.service.ts)(`csvColumnIndex`)와 `load-life-cctv`/`load-life-toilets`(`parseCsv`), food 의 `load-food-catalog`(`parseCsv` + `parseXlsx`) 가 같은 파서를 쓴다. 테스트는 픽스처 바이너리를 리포에 넣지 않으려고 `deflateRawSync` 로 zip 을 직접 조립해 검증([xlsx.test.ts](../../apps/friendly/src/lib/xlsx.test.ts)).

**lib/reply-upstream-error 사용처 확대 (2026-08-21)** — 8차 하드닝 때 대중교통 5xx 진단 로깅용으로 catch 13벌을 통합했던 [lib/reply-upstream-error.ts](../../apps/friendly/src/lib/reply-upstream-error.ts) 의 `replyUpstreamError(req, reply, e, [502, 503], label)` 가 이제 **bus·subway·air-quality·weather·life-map 5개 공개 라우트**의 표준 catch 다. 어댑터 에러 클래스의 `statusCode`(업스트림 장애 502 / 키·활용신청·쿼터·미적재 503)를 그대로 응답하고 그 외는 전역 error-handler(500)로 넘긴다 — 새 공공 API 프록시는 이 헬퍼 + `*ApiAuthError(503)` 짝으로 붙이는 것이 관례. life-map 은 업스트림이 없어 points/nearby 는 `[503]`(미적재)만, VWorld 검색 프록시 `search` 만 `[502, 503]`.

**가게 동일성 매칭 라이브러리** — [src/lib/matching.ts](../../apps/friendly/src/lib/matching.ts) 는 모듈에 속하지 않는 순수 유틸. 가게명 정규화(`normalizeName` — 소문자/공백/구두점 제거 + 분점 suffix `본점/지점/점` 제거) + bigram Jaccard 이름 유사도(`nameSimilarity`) + Haversine 거리(`distanceMeters`) + 둘을 0.6/0.4 가중한 `scoreMatch` 와 임계(`MATCH_THRESHOLDS`: 좌표 있을 때 score ≥ 0.45 + 거리 ≤ 500m, 좌표 없으면 name ≥ 0.7). `restaurant.list()` 의 1차 suggestion 산출과 canonical 의 ProposalService 가 둘 다 호출.

**공개 vs admin 라우트 분리 정책** — 같은 도메인이라도 (1) 응답 스키마가 다르거나 (2) 가드만 빠진 게 아니라 캐싱/SEO 정책이 다른 경우에는 별도 라우트로 분리한다. 핸들러 안에서 `if (req.user) {…} else {…}` 분기보다 라우트 자체가 둘이라 OpenAPI/Swagger 가 두 응답 셋을 분리해 표시하고 어드민 회귀 위험이 0이 된다. restaurant 의 `publicList`/`publicByPlaceId`/`publicInsights`/`ranking`, settings 의 `publicConfig`, **settlement 의 owner 라우트 vs `/share/settlements/:token` 공개 read-only 라우트** 가 같은 패턴.

**crawl 모듈 변경 흡수 (2026-05-15)** — 자세한 건 [crawl 토픽](./crawl.md). friendly 차원에선 `CrawlService` 생성자에 `ProposalService` 가 추가 주입돼 (`new CrawlService(restaurants, summaries, jobRegistry, proposals)`) 신규 등록 후크에서 자동 매칭 후보를 적재한다.

**crawl 모듈 변경 흡수 (2026-05-17)** — `CrawlService` 생성자에 `CanonicalService` 가 한 번 더 주입돼 (`new CrawlService(restaurants, summaries, jobRegistry, proposals, canonical)`) 신규 메소드 `tryAutoMatchDiningcode(canonicalId)` 가 Naver 잡 done 후크에서 fire-and-forget 으로 호출된다. 자세한 건 [crawl 토픽](./crawl.md) / [canonical 토픽](./canonical.md).

**restaurant 모듈 변경 흡수 (2026-05-17)** — 신규 파일 [restaurant.merge.ts](../../apps/friendly/src/modules/restaurant/restaurant.merge.ts) 가 canonical 그룹(Naver + DC 형제) 을 단일 public detail 로 융합하는 순수 함수 군을 모아둔다.

**plugins/summaries.ts — app-level singleton 패턴 (2026-05-19)** — 신규 [plugins/summaries.ts](../../apps/friendly/src/plugins/summaries.ts) 가 `SummaryService` + `JobLogService` + `AiConfigService` 셋을 `fastify-plugin` 으로 묶어 `app.decorate('summaries' | 'jobLog' | 'aiConfig', ...)` 로 노출.

**CrawlJobLog 시스템 (2026-05-19)** — 신규 `modules/crawl/job-log.service.ts`(2026-06-13 `9c0a1f9` 에서 삭제 — 범용 [logs/operation-log.service.ts](../../apps/friendly/src/modules/logs/operation-log.service.ts) 로 일반화, [logs](logs.md)) 가 크롤+요약 단계별 로그를 세 곳에 동시 흘려보내는 단일 진입점: (1) `app.log` pino 콘솔, (2) `prisma.crawlJobLog` DB 영속화, (3) SSE 채널. 모노톤 `seq` 카운터를 발급해 `(jobId, seq)` 로 클라이언트 dedup.

**Summary 라이프사이클 확장 — queued / cancelled / 부팅 자동 재큐잉 (2026-05-19)** — `ReviewSummary.status` enum 6종(queued/pending/running/done/failed/cancelled). 부팅 시 `cleanupStaleReviewSummaries` + `rescheduleStaleSummaries` 가 자동 재개.

**restaurant.list 페이징·정렬 (2026-05-25)** — 어드민 list 가 page state 를 URL 동기화 + 서버 정렬로 진화. `RestaurantListQuery` (offset/limit/sort) zod 스키마가 추가되고 `RestaurantService.list(query)` 가 `RestaurantListResultType` (`{ items, total, limit, offset }`) 반환. 정렬 키 `recent` (lastCrawledAt desc — 기본) / `satisfaction` (avgSatisfactionScore desc) / `positive` (avgSentimentScore desc) / `negativeRatio` (negativeCount/summaryDone asc). null 분석값은 항상 nulls-last. canonical 집계가 sources 합산이라 DB 정렬을 못 빼므로 **모든 canonical 후보까지 계산 후 메모리에서 정렬·slice** — 데이터 규모(< 1k canonical) 가정. handler 도 `service.list(req.query)` 한 줄로 단순화.

**LLM provider purpose 분리 (2026-05-25)** — [adapter-cache.ts](../../apps/friendly/src/modules/ai/adapter-cache.ts) 의 캐시 키에 `provider|purpose` prefix 가 들어가 chat/image 가 서로 다른 어댑터 인스턴스를 갖는다. `AiConfigService.getResolved(provider, purpose)` 는 모든 호출처가 `purpose` 인자를 명시적으로 넘기게 변경 — summary/analytics/menu-grouping/auto-discover 가 일괄 `'chat'` 으로 호출, settlement-extraction 만 `'image'` 로 호출. `AiConfigService.list()` 는 DB 행 + env-backed 가상 row (purpose='chat' 한정) 를 합성해 어드민 카드에 표시 — DB 에 chat row 가 없으면 env fallback 가상 카드 1개, image 는 DB row 가 있어야만 카드로 노출.

**정산하기 도메인 분리 (2026-05-25)** — `settlement-extraction` / `settlement` / `contact` 세 모듈은 friendly 안에서 자기 라우트 트리(`/settlement-extractions`, `/settlements`, `/me/contacts`, `/share/settlements/:token`) 와 자기 prisma 모델 4종 (`SettlementSession` / `SettlementItem` / `SettlementParticipant` / `SettlementContact`) 을 갖는다. friendly 차원에선 (1) `plugins/multipart.ts` 로 영수증 업로드 채널 제공, (2) `User → SettlementSession/SettlementContact` Cascade 관계 + `SettlementParticipant.contactId` SetNull 관계 추가, (3) `apps/friendly/data/receipts/` 디렉터리에 영수증 jpg 보관 — 까지가 인프라 책임. 라우트 스키마·분배 계산·UI 시나리오는 [settlement 토픽](./settlement.md) 으로 위임.

**정산 차수(round) 모델 도입 (2026-05-28)** — 한 세션 = 한 식당 한 영수증 가정이 깨졌다. 회식이 1차/2차/3차 로 이어지면서 같은 멤버 집합이라도 차수마다 식당·금액·참석자·할인 정책이 달라진다. 모델은 한 단계 깊어져:
- `SettlementSession` 은 세션 머리 (`userId`/`restaurantPlaceId`/`restaurantName`/`grandTotal`/`shareToken`/`editedAt`/`createdAt`/`updatedAt`) 만 보유.
- `SettlementRound` 가 차수별 `orderIndex`/`restaurantPlaceId`/`restaurantName`/`source` (`MANUAL`|`RECEIPT`)/`totalAmount?`/`warning?`/`receiptImageToken?`/`itemsSubtotal`/`discountAmount?`/`discountCategory?`/`categoryAdjustments?` (JSON) 를 가진다. `SettlementItem.sessionId` 는 `roundId` 로 옮겨졌다 — 마이그레이션이 SQLite 의 table-redefine 패턴 (`new_*` 테이블 → INSERT → DROP → RENAME) 으로 백필.
- `SettlementRoundAttendee` (테이블명 `settlement_round_participants`) 가 차수 × 마스터참여자 join — `attended`/`excludeAlcoholOverride?`/`excludeNonAlcoholOverride?`/`excludeSideOverride?`/`shareAmount` (차수별 스냅샷). 마스터 `SettlementParticipant` 의 `excludeAlcohol/NonAlcohol/Side` 는 default 정책으로 남고 차수에서 override.
- service 의 `create` 트랜잭션 흐름: session → participants (clientId → cuid 매핑) → rounds → 각 round 의 items + attendees → `calculateMultiRoundShares()` 가 모든 차수를 합산해 마스터 `participant.shareAmount` 와 round attendee 의 `shareAmount` 스냅샷을 채운다 → `fromDraftId` 가 들어왔으면 같은 트랜잭션에서 `SettlementDraftService.deleteByIdInTxIfOwner(tx, userId, fromDraftId)` 로 해당 draft 정리.
- `update` 는 PUT 한 라우트로 통합 — 부분 PATCH 가 사라지고 클라이언트가 전체 draft 를 보낸다. 서버는 `deleteMany` 로 child rows (items / attendees / rounds / participants) 를 전부 비우고 재삽입. 부분 갱신의 race 가 사라지고 차수 추가/삭제도 같은 경로.
- `getBySharedToken` 은 차수 응답에서 `userId` 와 round 의 `receiptPreviewUrl` 을 제거 — 공개 read-only 라 영수증 원본 사진 노출 금지.

**영수증 분할 추출 — 한 장에 여러 차수 (2026-05-28)** — 회식 영수증을 한 장의 사진에 가로로 붙여 찍는 사용자가 많아 `ExtractReceiptInput` 이 optional `split: { count, index }` (count 2..5, 1-based) + optional `roundIndex/roundTotal` (1..20) 을 받는다. `settlement-extraction.service` 의 `cropForSplit` 이 sharp 로 원본을 좌→우 N 등분 후 `index` 번째 슬라이스만 잘라 vision LLM 에 전달 (`split.index === split.count` 면 잔여 폭 보정해서 마지막 슬라이스가 전체를 cover). count=1 이거나 split 미지정이면 원본 그대로. `EXTRACTION_VERSION = 2` (이전 1). `settlement-extraction.prompts.ts` 가 `roundHint` 일 때 "이 영수증은 N차 회식 중 K차 영수증입니다" 라인을 프롬프트 헤더에 prepend 해 LLM 컨텍스트 보강. 같은 imageToken 을 N 번 extract 호출하면 N 차의 items 를 각각 얻는다.

**자동 임시저장(draft) 모듈 (2026-05-28)** — 신규 [modules/settlement/settlement-draft.{route,service}.ts](../../apps/friendly/src/modules/settlement/settlement-draft.route.ts). 정산 입력 화면이 debounce 자동 저장 → `PUT /me/settlements/drafts` 로 보내고, 본저장 시 `CreateSettlementInput.fromDraftId` 에 그 draft id 를 실어 보내면 settlement.service 의 트랜잭션이 같은 tx 안에서 draft 를 지운다. service 가 `placeIdToKey(placeId: string|null): string` 로 변환하는 이유는 SQLite 의 NULL unique 가 다중 NULL 을 distinct 취급해 `(userId, placeId)` 로는 식당 미지정 슬롯이 무한정 늘어나기 때문 — `placeIdKey=''` sentinel 로 '식당 미지정' 슬롯 1개를 user 당 보장. payload 는 그대로 JSON 문자열 보관(검증/파싱 없음) — 클라이언트 store 진화에 유연하게.

**Universal/App Links 검증 모듈 (2026-05-28)** — 신규 [modules/well-known/well-known.route.ts](../../apps/friendly/src/modules/well-known/well-known.route.ts). 정적 파일 대신 라우트로 만든 이유: (1) env 변경만으로 즉시 반영 (재배포·dist 복사 불필요), (2) 비어 있을 때 명확히 404 — 잘못된 빈 JSON 으로 iOS/Android 의 검증을 실패시키는 사고 회피. `apple-app-site-association` 의 components 가 `"/share/settlements/*"` 로 박혀 있어 설치된 앱이 공유 정산 링크를 자동 인터셉트. `assetlinks.json` 은 `sha256_cert_fingerprints` 를 콤마 분리 env 로 받아 debug/release 지문을 둘 다 등록 가능.

**dev CORS RFC1918 자동 허용 (2026-05-28)** — [plugins/cors.ts](../../apps/friendly/src/plugins/cors.ts) 가 dev 분기에서 `PRIVATE_LAN_ORIGIN` regex (localhost / 127.0.0.1 / 10.x / 192.168.x / 172.16~31.x, optional `:port`, http/https 모두) 매칭 origin 을 자동 허용. 폰이 LAN IP 로 띄운 Expo Web 을 열고 그 안에서 friendly API 를 호출할 때 origin 이 `http://192.168.x.x:8081` 이 되는데, `.env` 의 `CORS_ORIGIN` 에 IP 를 매 dev 세션마다 박는 마찰을 없애기 위함. production 분기는 regex 미사용 — env 명시 origin 만 통과.

**정산 공유 OG SSR-lite (share-preview.ts, NEW 2026-06-01)** — 신규 [modules/settlement/share-preview.ts](../../apps/friendly/src/modules/settlement/share-preview.ts). 웹은 순수 Vite SPA 라 카카오톡/텔레그램 OG 크롤러가 JS 없이 `index.html` 을 긁으면 OG 태그가 비어 미리보기가 빈칸이다. 이 모듈이 `/share/settlements/:token` (+별칭 `/s/:token`) 을 가로채 **빌드된 웹 `index.html` 의 `<head>` 에만** OG/twitter 메타(`<title>` 교체 + `</head>` 앞 주입) 를 넣어 반환한다 — 자산·그 외 경로는 nginx 정적 서빙 그대로, 풀 SSR 아님. 핵심 설계 포인트:
- **index.html 경로 탐색** — dev(tsx, `__dirname=.../modules/settlement`) 와 prod(tsup 번들, `__dirname=.../dist`) 가 달라 고정 상대경로 하나로 못 맞춘다. `candidateIndexPaths()` 가 `__dirname` 과 `process.cwd()` 에서 위로 7단계 올라가며 `apps/web/dist/index.html` 과 `web/dist/index.html` 두 형태를 모두 후보로 만들어 처음 읽히는 것을 사용. `env.WEB_INDEX_PATH` 가 있으면 그것만. 읽은 HTML 은 프로세스 수명 동안 모듈 변수 `cachedIndex` 로 캐시(pm2 reload 시 자연 비워짐), 어느 후보에서도 못 읽으면 시도한 경로 전부를 `app.log.error` 로 남기고 500.
- **프라이버시** — OG description 은 `총 {grandTotal}원 · {N}명` 까지만. 참가자 이름은 크롤러 캐시에 박제되지 않게 넣지 않는다(정산표 PNG 를 og:image 로 고른 경우는 이름 노출 — owner 의 명시 선택).
- **만료/없는 토큰** — `getSharePreviewMeta` 가 null 이면 일반 OG(`Life Pickr 정산`) 로 폴백하고 SPA 가 자체 에러 화면을 띄운다. 응답은 `cache-control: no-cache`(SPA HTML 자체는 매번 신선).

**정산표 PNG 서버 렌더 (settlement-card.ts, NEW 2026-06-01)** — 신규 [settlement-card.ts](../../apps/friendly/src/modules/settlement/settlement-card.ts) 가 화면의 `SettlementBreakdownTable` 매트릭스(행=참여자, 열=차수×카테고리+차수소계, 끝에 총계, 하단 합계 행)를 **satori(VDOM→SVG) + @resvg/resvg-js(SVG→PNG)** 로 렌더한다. JSX 없이 `h(type, style, children)` 헬퍼로 satori VDOM 을 직접 빌드(satori 는 `display:table` 미지원이라 고정폭 flex 박스로 격자). 분담 계산은 화면의 `useMatrix` 와 동일하게 `@repo/api-contract` 의 `calculateMultiRoundShares`/`effectiveExcludes` 를 그대로 호출해 웹·앱·서버 결과가 100% 동일. 폰트는 번들된 `assets/fonts/IBMPlexSansKR-{Regular,Bold}.ttf` 를 `fontCandidates()`(share-preview 와 동일한 위로-탐색 전략) 로 찾아 프로세스당 1회 읽어 캐시(satori 는 system 폰트 못 씀 → ttf 버퍼 명시 주입). 출력 폭에 따라 resvg `fitTo` 스케일을 1/1.5/2x 로 낮춰 넓은 표의 PNG 크기를 억제. height 미지정으로 satori 가 내용 높이를 자동 계산(참여자/차수 많아도 안 잘림). `/share/settlements/:token/image.png` 로 노출, `cache-control: public, max-age=300`.

**동적 og:image 선택 (2026-06-01)** — owner 가 공유 다이얼로그에서 고른 모드(`SettlementSession.shareOgImage` enum + `shareOgImageUrl`) 에 따라 og:image 가 갈린다. `restaurant`(기본): `SettlementService.pickRestaurantOgImageUrl` 이 정산에 묶인 식당들의 사진(네이버 호스트 = thumbnail 프록시 가능 것만)을 모아 owner 가 고른 `shareOgImageUrl` 이 후보에 살아 있으면 그것, 아니면 `seedFromToken(token) % images.length` 로 **토큰 시드 결정적 랜덤** 1장을 골라 `Routes.Media.thumbnail?url=...&w=1200&q=80` 프록시 URL 로 반환. `table` 이거나 사진이 없으면 null → 정산표 PNG(`*/image.png`) 로 폴백. 시드라 같은 링크는 항상 같은 사진(카카오 OG 캐시와 일관, 매 크롤마다 안 바뀜). 후보 수집(`collectCandidateImageUrls`)은 placeId 별로 `RestaurantService.getPhotoUrls` 를 호출해 dedup + thumbnail 프록시 가능 호스트만 + 12장 상한.

**식당 사진 경량 조회 getPhotoUrls (2026-06-01)** — [restaurant.service.ts](../../apps/friendly/src/modules/restaurant/restaurant.service.ts) 에 `getPhotoUrls(placeId): Promise<string[]>` 신규. `getPublicDetail` 이 식당당 수십~수백 행의 visitorReviews/summary 를 로드하는 것과 달리, 네이버 행 + 같은 canonical 의 DC 형제 행의 `snapshotJson` **만** select 해 `mergePhotos` 로 사진 URL 배열을 산출(결과는 `getPublicDetail().imageUrls` 와 동일). 정산 OG/갤러리는 사진 URL 만 필요하므로 리뷰 코퍼스 로드를 통째 생략 — OG 미리보기·갤러리 다이얼로그의 백엔드 측 경량화. 깨진 snapshotJson 은 빈 배열로 폴백.

**OG 미리보기 메타 경량 캐시 (2026-06-01)** — `getSharePreviewMeta(token, origin)` 가 풀 로우(rounds→items/attendees, participants) 대신 메타 컬럼 + `_count.participants` + `rounds[].restaurantPlaceId` 만 select 하고, 카카오/슬랙 OG 크롤러가 같은 링크를 짧은 시간에 여러 번 펼치므로 `(token, origin)` 키로 5분 in-memory `Map`(`sharePreviewCache`) 캐시 — 성공(non-null) 결과만 캐시, 사이즈 5000 초과 시 통째 clear. owner 가 share 를 갱신/회수하면 `invalidateSharePreview(token)` 가 그 토큰의 모든 origin 변형 엔트리를 제거. Redis 불필요(단일 인스턴스 전제, CLAUDE.md). `media.route.ts` 가 `ALLOWED_HOSTS` Set 을 export 해 정산 측 `isThumbnailProxyable(url)` 이 동일 화이트리스트로 프록시 가능 여부를 판정(SSRF 가드 일원화).

**friendly ESLint 합류 (2026-06-01)** — 신규 [eslint.config.mjs](../../apps/friendly/eslint.config.mjs) 가 `@repo/config/eslint/node` (base + Node 글로벌) 를 spread 한 뒤, 기존 스크래핑 어댑터·dev 스크립트의 잔존 위반(`no-useless-assignment`/`no-useless-escape`/`prefer-const`/`@typescript-eslint/consistent-type-imports`)을 우선 `warn` 으로 도입(점진 정리). `dist`/`.turbo`/`node_modules`/`prisma/migrations` ignore. `package.json` 에 `"lint": "eslint ."` 추가 — web/friendly/api-contract/mobile 4개가 turbo lint 에 합류(4/4 green).

**주기 스케줄러 모듈 (schedule, NEW 2026-06-06)** — 신규 [modules/schedule/](../../apps/friendly/src/modules/schedule/schedule.service.ts). "어드민이 식당을 등록·크롤한 뒤 메뉴 정규화(menu-grouping)와 글로벌 머지(analytics)를 매번 손으로 돌려야 하는" 마찰을 야간 배치로 자동화. CLAUDE.md no-Redis 전제라 외부 큐/스케줄러 없이 **croner 로 in-process cron** 을 돈다. 책임 분리:
- [schedule.service.ts](../../apps/friendly/src/modules/schedule/schedule.service.ts) — 파이프라인 로직 + 설정/실행/미리보기/이력. `runScheduled(trigger)` 흐름: `scheduleRegistry.beginRun()`(overlap 가드) → `collecting`(처리 필요 식당 수집 = `menuGrouping.getRestaurantsStatus({attention:true, sort:'unmapped'})` − 크롤 중 식당) → `grouping`(식당별 `menuGrouping.groupForRestaurant` 순차, 식당 경계마다 abort 체크 + `isPlaceCrawling` 재확인, 개별 실패는 로그만) → `merging`(`analytics.runGlobalMerge({full:false})`, `AnalyticsError code='no_inputs'` 는 정상 skip) → `finishRun` + `ScheduleRun`/`ScheduleConfig` 업데이트. 한 주기 최대 `MAX_TARGETS_PER_RUN=200`(초과분은 멱등하므로 다음 주기). cron 검증/미리보기는 `new Cron(expr, {paused:true}).nextRuns(5)`.
- [schedule-registry.ts](../../apps/friendly/src/modules/schedule/schedule-registry.ts) — 모듈 singleton(`scheduleRegistry`). jobType 당 croner `Cron` 하나(`unref:true`, `catch:true`, `paused`/in-place 변경 불가라 재등록 시 stop 후 재생성) + **동시 1개 inflight run**(`global-merge-job-registry` 와 같은 단일 슬롯 모델 — overlap 가드 `beginRun`, live 진행 `setPhase/markProcessing/incProcessed/incSkipped`, SSE `subscribe/publish`, graceful `abortInflight`). 끝난 run 의 `active` 는 직후 조회/SSE 가 마지막 스냅샷을 볼 수 있게 의도적으로 유지(다음 `beginRun` 이 교체). 자세한 진행률/SSE 이벤트 모델은 [schedule 토픽](./schedule.md). [in-memory singleton gates](../concepts/in-memory-singleton-gates.md) 컨셉의 또 한 사례.
- 현재 `jobType` 은 `'normalize-merge'` 하나 — 추후 다른 주기작업이 생기면 jobType 으로 분기. 기본 cron `0 3 * * *`(매일 03:00) + tz `Asia/Seoul`, 어드민이 `ScheduleConfig` 로 변경(런타임 reschedule).

**맛집 상세 SEO/공유 미리보기 (restaurant-preview.ts, NEW 2026-06-25)** — 신규 [restaurant-preview.ts](../../apps/friendly/src/modules/restaurant/restaurant-preview.ts). share-preview(정산)와 같은 **SSR-lite** 사상을 맛집 상세에 적용: `app.ts` 가 `registerRestaurantPreview(app)` 로 `/api/v1` 밖에 `/r/:placeId`(상세 HTML) + `/sitemap.xml` + `/robots.txt` 를 등록. `/r/:placeId` 는 `getPublicSeoMeta(placeId)` 로 메타를 읽어 빌드된 `index.html` 의 `<head>` 에 og/twitter + `<link rel=canonical>` + JSON-LD(`schema.org/Restaurant`: name/geo/aggregateRating/address) 를 주입하고, **`<noscript>` 안에 SEO 본문(h1/대표사진/대표메뉴 12개)** 까지 inject — 크롤러·검색엔진이 JS 없이도 본문을 읽는다. index.html 후보 탐색·`cachedIndex` 캐시 전략은 share-preview 와 동일(7단계 위로-탐색, `WEB_INDEX_PATH` 우선, 못 찾으면 500). og:image 는 `imageUrls[0]` 을 thumbnail 프록시(`?w=1200&q=80`)로 감싸되 **파노라마 사본 등 same-origin 절대경로(`/api/v1/media/panorama/…`)는 프록시를 거치지 않고 그대로 절대화**(프록시 래핑하면 `z.string().url()` 검증에 걸려 og:image 가 400). 식당 없으면 404 + `noindex` 폴백 OG. origin 은 `env.PUBLIC_ORIGIN`(기본 `https://ninelife.kr`) 으로 고정해 Cloudflare/nginx Host 변형에 안 흔들림. `/sitemap.xml` 은 `getPublicSitemapEntries()` 결과를 XML 로, `/robots.txt` 는 `/admin`·`/api`·`/me`·`/login` Disallow + sitemap 링크.

**네이버 파노라마 대표이미지 503/만료 fix (panorama-cache.ts, NEW 2026-06-25)** — 신규 [panorama-cache.ts](../../apps/friendly/src/modules/media/panorama-cache.ts). 네이버 파노라마 썸네일(`apis.naver.com/place/panorama/thumbnail/…&msgpad=…&md=…`)은 HMAC+TTL 서명 URL 이라 발급 하루쯤 뒤 403(`HMAC 유효 시간 초과`)으로 죽는다 — 서명을 우리가 갱신할 수 없어 DB 에 그대로 저장하면 og:image/대표이미지가 시간 지나 깨진다(503/400). `isVolatileNaverPhoto(url)` 로 이런 URL 을 "휘발성"으로 식별하고, 크롤 시점(아직 TTL 안)에 `cachePanoramaThumbnail(placeId, url)` 이 헤더/쿠키 없이 단순 GET 으로 1회 받아 `data/panorama/<placeId>.jpg` 로 **영구 사본** 저장(5s 타임아웃·10MB·image/* 검증·사유별 실패 리포트). [media.route.ts](../../apps/friendly/src/modules/media/media.route.ts) 의 `Routes.Media.panorama(:placeId)` 가 그 사본을 `image/jpeg` + `max-age=30d, immutable` 로 서빙(없으면 404). 대표이미지 선택이 휘발성 원본 대신 이 same-origin 사본 URL 을 가리키게 해 만료에 면역.

**주소/좌표 → 시군구 파생 + 지역 통계 (region-derive.ts, NEW 2026-06-25)** — 신규 [region-derive.ts](../../apps/friendly/src/modules/restaurant/region-derive.ts). `Restaurant` 는 주소를 단일 문자열로만 저장(시/구 분리 컬럼 없음)하므로 어드민 지역 통계가 `deriveRegion(address, lat, lng)` 로 즉석 파생: ① 주소를 `regions.json`(빌드 스크립트 `scripts/build-regions.mjs` 산출, random-crawl 과 공유 — esbuild dedup) 사전과 매칭(시도 longest-prefix + 시도 확정 후 시군구 토큰일치, "강서구 vs 서구" 부분문자열 충돌 회피) → ② 실패 시 좌표를 시군구 중심좌표에 최근접 배정(cos(lat) 경도 보정) → ③ 둘 다 실패 null. `RestaurantService.getRegionStats()` 가 이를 집계해 어드민 `Routes.Restaurant.regionStats`(시/도 분포 + 시군구 드릴다운) 로 노출. 같은 통계를 텔레그램 메시지(텍스트 막대 + 드릴다운 버튼)로 렌더하는 순수 함수는 [region-stats-telegram.ts](../../apps/friendly/src/modules/restaurant/region-stats-telegram.ts) — 텔레그램 호출/부수효과 없이 render 만(자세한 건 [telegram 토픽](./telegram.md)).

**canonical 멤버 집합 (canonical-members.ts, NEW 2026-06-25)** — 신규 [canonical-members.ts](../../apps/friendly/src/modules/restaurant/canonical-members.ts). review-search(enrich/QA)·review-clustering 이 단일 `restaurantId` 가 아니라 **공개 융합과 동일한 소스 규칙(naver + diningcode + tabling partner; `place:` prefix 행 제외)**으로 가게 멤버 집합을 로드해야 "리뷰 탭엔 보이는데 enrich/군집엔 빠지는" 불일치를 막는다. `resolveCanonicalMembersBy{PlaceId,RestaurantId}` 가 `{ primaryId(placeId 보유 네이버 행), canonicalId, memberIds }` 를 돌려주고, `listPublicPlaces` 가 공개(placeId 보유) 가게 단위 집계(부수 행 리뷰 합산, 리뷰 0 제외)를 어드민 enrich/군집 상태 목록에 제공. `primaryId` 는 공개 조회 키·코퍼스 캐시·`ReviewCluster.restaurantId` 의 대표 키.

**지도 설정 DB+env fallback 통일 (map.service.ts, UPDATED 2026-06-25)** — [map.service.ts](../../apps/friendly/src/modules/settings/map.service.ts) 의 `MapSettingsService` 가 `TelegramConfigService` 와 같은 "DB(MapProviderConfig) 우선 + .env(`VWORLD_API_KEY`/`VWORLD_DOMAINS`) fallback" 패턴으로 통일되고, 응답에 키 출처를 `source: 'db'|'env'|'none'` 로 노출한다. 공개 라우트(맛집 지도)도 `getSecret` 을 거치므로 env-only 운영에서도 동작. 첫 등록 시 입력 키도 env 키도 없으면 "키 없음" 행 생성을 거절(env 에 키가 있으면 도메인 메모만 저장 허용 — 키는 env 에서 상속). **(2026-08-21)** life-map 의 지역 이동 검색(`vworld-search.adapter`)과 화장실/병의원 지오코딩(`life-map-geocode.service`)도 같은 `MapSettingsService.getSecret('vworld')` 를 **요청마다** 읽어 키 교체가 즉시 반영된다.

**관리자 맛집 통합 검색 + 응답 단축 (restaurant.service.ts `list`, 2026-08-17 `5e25cc0`·`9ccbe52`)** — 어드민 목록이 `RestaurantListQuery.q`(1~120자) 를 받는다. 검색은 DB 가 아니라 **canonical 단위 검색 문자열**을 메모리에서 만든다: 모든 Restaurant 행(메타만)을 읽어 `canonicalId` 별로 `[canonicalId, canonical.name, canonical.primaryCategory, 각 source 의 id/sourceId/placeId/name/category]` 를 이어 붙이고 NFKC+소문자 정규화 후, 공백으로 나눈 토큰이 **전부 부분 일치(AND)** 하는 canonical 만 남긴다 — 한 source 가 걸리면 그 canonical 의 형제 source 도 집계·응답에 그대로 남고, placeId 대문자 입력도 잡힌다. 미일치면 `{ items: [], total: 0 }` 를 즉시 반환해 **집계 SQL 을 한 번도 안 돈다**(테스트가 `$queryRaw` spy 로 검증). 응답 단축은 집계를 옮긴 것: 이전엔 검색 대상 식당의 `ReviewSummary` 행을 전부 애플리케이션으로 가져와 JS 로 버킷을 만들었는데, 이제 `$queryRaw` 한 문장이 `review_summaries ⋈ visitor_reviews` 를 `GROUP BY restaurantId` 로 pending/running/done/failed·긍부중혼 카운트·sentiment/satisfaction 합과 개수를 SQL 에서 접는다 — SQLite bind-variable 한도 때문에 `IN (…)` 은 **500개씩 배치**(`SUMMARY_AGGREGATE_BATCH_SIZE`), SUM 결과가 `bigint` 로 올 수 있어 `Number()` 로 정규화. 전역 병합 후보매칭(`candidateCount`/`suggestion`)은 검색 범위와 무관하게 **전체 canonical 기준**으로 유지(검색으로 좁혀도 후보 수가 달라지면 안 된다 — 테스트 `candidateCount === 1` 고정). 정렬·slice 는 여전히 메모리(< 1k canonical 가정 유지).

**리뷰 업데이트 누락 + 최신순 정정 (2026-08-17 `0d72380`)** — 두 결함이 한 커밋에서 고쳐졌다. (1) **크롤 어댑터** [naver-place.playwright.adapter.ts](../../apps/friendly/src/modules/crawl/adapters/naver-place.playwright.adapter.ts): 네이버가 리뷰 목록 아래에 무관한 "더보기" 컨트롤을 여럿 렌더하게 되면서, 전역 `matches.last()` 로 고르던 pager 버튼이 다른 섹션의 "펼쳐서 더보기" 를 눌러 리뷰 요청이 전혀 안 나가는데도 "더보기 없음" 으로 정상 종료하던 것이 update 모드 누락의 원인. 이제 `findVisitorReviewSection`(헤더 `방문자 리뷰 N` → `place_section` 조상, 폴백은 `li.place_apply_pui` + 프로필 링크) 안의 **정확한 pager 만** 클릭하고, 응답 대기도 아무 GraphQL 이 아니라 `postData` 의 `operationName`/`query` 에 `visitorReviews` 가 있는 **getVisitorReviews 응답만** 인정(쿠폰/리액션 호출이 "페이지 받음" 으로 오인되던 것 차단). update 모드 known-boundary 판정도 "SSR 10건이 전부 known" 만으로 멈추지 않고 **최소 첫 wire 페이지까지** 확인(과거 부분 실패로 SSR 바로 아래에 gap 이 있을 수 있음). 종료 사유를 `VisitorPaginationResult { complete, reason(no_more|known_boundary|disabled|max_pages|button_missing|click_failed|response_missing|invalid_response), pagesAttempted, pagesFetched, reviewsFetched }` 로 `onVisitorPagination` 훅에 정확히 1회 통지 → [crawl.service.ts](../../apps/friendly/src/modules/crawl/crawl.service.ts) 가 `complete=false` 면 warn 로그(`리뷰 페이지네이션 부분 완료`) + `done` 이벤트·run meta 의 `visitorPagination` 에 기록. (2) **공개 리뷰 정렬**: "크롤러가 최신순으로 받아 저장하니 `fetchedAt asc` = 최신순" 전제(2026-05-31 결정)는 update 모드로 **나중에 수집된 새 리뷰가 최초 배치 뒤에 숨는** 결함이 있었다. `assemblePublicReviews`/`getPublicSeoMeta` 가 DB 에선 `fetchedAt desc` 로 읽고 최종 정렬을 `@repo/utils` 의 [compareReviewRecencyDesc](../../packages/utils/src/reviewDate.ts) 로 — 실제 **방문일(`visitedAt`) desc**, 네이버의 연도 없는 `M.D.요일` 은 `fetchedAt` 의 KST 연도로 복원, 해석 불가 출처만 `fetchedAt desc` 폴백. `restaurant.merge.ts` 주석·`RestaurantPublicDetail.reviewsFirstPage` 계약 주석도 "방문일 desc(폴백 fetchedAt desc)" 로 정정. 웹 `HomeTab`/`ActiveJobPanel` 표시도 같은 커밋에서 맞춤.

**ai — provider env 조립 단일화 + 용도 2종 (2026-08-22 `cc8399a`)** — [modules/ai/llm-provider-env.ts](../../apps/friendly/src/modules/ai/llm-provider-env.ts) 신규(22줄). friendly 관점의 소비 지점: plugin 5종([logs](../../apps/friendly/src/plugins/logs.ts)·[random-crawl](../../apps/friendly/src/plugins/random-crawl.ts)·[schedule](../../apps/friendly/src/plugins/schedule.ts)·[summaries](../../apps/friendly/src/plugins/summaries.ts)·[food-import](../../apps/friendly/src/plugins/food-import.ts)) 이 각자 `new AiConfigService(app.prisma, buildLlmProviderEnv())` 로 독립 인스턴스를 만들고(autoload 순서 회피 관례 유지), 라우트 7종과 CLI/research 19종도 동일. `ai.config.service.ts` 는 `ALL_PURPOSES = LlmProviderPurpose.options`(계약 enum 순서 chat·image·log-analysis·meal-photo·meal-recommend) 로 바뀌어 용도가 늘면 어드민 카드가 자동으로 는다 — 키·baseUrl 상속(chat 계정 대표)은 그대로, 모델만 용도별 `OLLAMA_*_MODEL` 폴백. 함께 `@repo/utils thinkOptionForModel(model)` 이 analytics 글로벌 머지·settlement-extraction·food-classify·meal-recognition·meal-recommendation 5곳의 LLM 호출에 `think` 옵션으로 들어가 **추론 모델(qwen3.5 등)의 사고를 끈다**(gpt-oss 는 못 끄니 최저 레벨) — JSON 만 받으면 되는 호출이 사고에 출력 토큰을 써 `items` 가 비어 오던 문제(2026-08-22 실측). LLM 통합 내부는 [ai 토픽](./ai.md).

## Talks To [coverage: high — 31 sources]

- **`@repo/api-contract`** — `Routes.*` URL 상수와 모든 zod 스키마(인증/픽/식당/요약/분석/미디어/AI/메뉴 그룹핑/애널리틱스/지도 설정/canonical/**settlement/settlement-contact/settlement-extraction**)의 단일 출처.
- **`@repo/utils`** — `picks.service.ts`의 랜덤 추첨에서 `pickRandom(options)`.
- **Prisma + SQLite** — [prisma/schema.prisma](../../apps/friendly/prisma/schema.prisma)는 `provider = "sqlite"`. `DATABASE_URL` 은 `.env.example` 기준 `file:../data/dev.db` — Prisma CLI 의 cwd 가 `apps/friendly/prisma/` 이고 서버 cwd 가 `apps/friendly/` 라 `../data/dev.db` 가 양쪽 모두 `apps/friendly/data/dev.db` 를 가리키도록 통일 (이전엔 마이그레이션이 `prisma/dev.db` 를 만들고 서버는 `data/dev.db` 를 보던 분기 사고가 있었음).
- **bcryptjs** — [src/lib/hash.ts](../../apps/friendly/src/lib/hash.ts)의 `hashPassword`/`verifyPassword`가 10 라운드 솔트.
- **sharp ^0.34** — media 모듈의 썸네일 리사이즈/JPEG 인코딩, settlement-extraction 의 영수증 split crop.
- **satori ^0.26 + @resvg/resvg-js ^2.6** — **(NEW 2026-06-01)** 정산표 PNG 서버 렌더 (`settlement-card.ts`): satori 가 VDOM→SVG, resvg 가 SVG→PNG. 번들 폰트 `assets/fonts/IBMPlexSansKR-{Regular,Bold}.ttf` 를 명시 주입.
- **Playwright + playwright-extra/stealth** — crawl 모듈이 사용. **(2026-05-25)** `playwright-extra ^4.3.6` + `puppeteer-extra-plugin-stealth ^2.11.2` 의존성 추가 — 네이버 크롤러 stealth 적용 + 429 차단 우회.
- **Naver Place 페이지 + Naver CDN** — crawl 이 SSR/AJAX, media 가 `phinf.pstatic.net` 호스트군 썸네일 프록시.
- **Naver PC 지도 페이지 (`map.naver.com`)** — 검색 어댑터.
- **Diningcode / Catchtable** — crawl 의 추가 소스. 자세한 건 [crawl 토픽](./crawl.md).
- **Ollama Cloud** — ai/summary/menu-grouping/analytics 가 LLM chat 호출, **settlement-extraction 이 vision (image) 호출**, **(NEW 2026-06-25) logs 의 LogAnalysisService 가 `log-analysis` purpose 호출**. provider 설정 row 는 `(provider, purpose)` 복합 unique 라 같은 ollama-cloud 라도 chat/image/log-analysis 가 서로 다른 model/concurrency 로 등록 가능. env fallback 모델은 purpose 별로 `OLLAMA_DEFAULT_MODEL`(chat)/`OLLAMA_IMAGE_MODEL`(image)/`OLLAMA_LOG_ANALYSIS_MODEL`(log-analysis).
- **임베딩(bge-m3) + Python 런타임** — **(NEW 2026-06-25)** review-search 가 리뷰 임베딩을, review-clustering 이 UMAP→HDBSCAN→c-TF-IDF Python 배치를 쓴다. 이 의존(임베딩 엔드포인트·Python 경로)은 friendly `env.ts` 를 경유하지 않고 각 서비스가 자체 보유 — 상세는 [review-search 토픽](./review-search.md) / [review-clustering 토픽](./review-clustering.md).
- **텔레그램 Bot API** — **(NEW 2026-06-25)** `TelegramService` 가 random-crawl 후보 전송(인라인 버튼) + long-polling 으로 콜백/명령 수신 + 지역통계 응답. 토큰/chatId 는 `TelegramConfig`(DB) 우선, `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` env fallback. 자세한 건 [telegram 토픽](./telegram.md).
- **`@fastify/multipart` ^10** — 영수증 업로드용. 5MB / 1 파일 / 5 필드 한도.
- **croner ^10** — **(NEW 2026-06-06)** schedule 모듈의 in-process cron 타이머 + cron 식 파싱/검증/다음 실행 시각 미리보기. **(2026-06-25)** logs 의 `0 4 * * *` 보존 cron, random-crawl 의 발굴 cron 도 croner 사용. 외부 큐/Redis 없이 단일 인스턴스 안에서 도는 유일한 스케줄러 의존(CLAUDE.md no-Redis).
- **외부 지도 키(vworld)** — settings 가 DB 우선 + env(`VWORLD_API_KEY`) fallback 으로 평문 보관 (UPDATED 2026-06-25). **(2026-08-21)** 같은 키로 VWorld 지오코더(`api.vworld.kr/req/address`)·검색(`api.vworld.kr/req/search`) 을 life-map 이 호출 — 지오코더는 일 한도(4만 건 수준)가 있어 `LifeGeocodeCache` 영구 캐시 + 동시 2·간격 80ms(실측 4 이상이면 업스트림이 연결을 끊음).
- **data.go.kr 공공데이터 4종 (NEW 2026-08-21~30)** — 에어코리아 대기오염정보 `apis.data.go.kr/B552584/ArpltnInforInqireSvc`(15073861) + 측정소정보 `MsrstnInfoInqireSvc`(15073877) ([airkorea-api.adapter.ts](../../apps/friendly/src/modules/air-quality/airkorea-api.adapter.ts)) · 기상청 단기예보 `apis.data.go.kr/1360000/VilageFcstInfoService_2.0`(15084084) + 중기예보 `MidFcstInfoService`(15059468) ([kma-api.adapter.ts](../../apps/friendly/src/modules/weather/kma-api.adapter.ts)) · 심평원 병원정보서비스 `apis.data.go.kr/B551182/hospInfoServicev2`(15001698, [hira-hospital.adapter.ts](../../apps/friendly/src/modules/life-map/hira-hospital.adapter.ts) — **적재 스크립트 전용, 요청 경로 없음**) · 식약처 영양성분 `api.data.go.kr/openapi/tn_pubr_public_nutri_food_info_api`(15100070, [food-api.adapter.ts](../../apps/friendly/src/modules/food/food-api.adapter.ts) — 선택, 배포 CSV 가 기본). **계정당 키 1개** 라 `AIRKOREA_API_KEY`/`KMA_API_KEY`/`HIRA_API_KEY`/`FOOD_API_KEY` 가 비면 전부 `BUS_API_KEY` 로 폴백하되 **데이터셋마다 활용신청이 따로** — 미신청 키는 게이트웨이 `30 등록되지 않은 서비스키`(어댑터가 `*ApiAuthError` → 503, 업스트림 장애 502 와 구분)로 떨어진다. 응답 파싱은 XML 이 아니라 `_type=json`, 실응답은 `__fixtures__/*.json` 으로 박아 테스트(bus 의 [external-api-proxy-fixture](../concepts/external-api-proxy-fixture.md) 패턴). 캐시는 in-memory TTL + stale 폴백: 대기 측정 10분(stale 최대 3h)·예보 20분/주간 60분(stale 24h)·측정소 24h(stale 7d), 날씨는 **다음 발표 슬롯 제공 시각까지**(NO_DATA 폴백·장애 응답은 5분, 하한 30s; stale 실황 3h/단기 6h/중기 24h) + 두 서비스 합산 일 9,000 인메모리 쿼터 게이트(`DEFAULT_DAILY_UPSTREAM_LIMIT`).
- **기상청 API허브 `apihub.kma.go.kr/api/typ01` (NEW 2026-08-21)** — AWS 방재기상관측 매분 자료(`cgi-bin/url/nph-aws2_min`) + 지점 정보(`url/stn_inf.php`) ([kma-apihub.adapter.ts](../../apps/friendly/src/modules/weather/kma-apihub.adapter.ts)). data.go.kr 와 **별개 키** `KMA_APIHUB_KEY`(API 별 활용신청, 미신청 403 → 503, 키 자체가 비면 `/weather/aws` 가 `enabled=false` 200). typ01 텍스트('#' 주석 헤더 + 공백 구분 행) 파싱, 지점 24h·관측 2분 캐시(관측 최대 20분 전 값만 인정).
- **식품안전나라 `openapi.foodsafetykorea.go.kr/api`(COOKRCP01) · 농식품 `data.mafra.go.kr`(=`211.237.50.150`) (NEW 2026-08-22)** — food 적재 레시피 소스([food-api.adapter.ts](../../apps/friendly/src/modules/food/food-api.adapter.ts)), 키 `FOOD_RECIPE_API_KEY`/`MAFRA_API_KEY`, 비면 그 소스만 오류 기록·건너뜀(다른 소스 진행). 사용은 어드민 적재 잡/CLI 만 — 요청 경로 없음.
- **Ollama Cloud purpose 5종 (UPDATED 2026-08-22)** — `meal-photo`(식단 사진 vision, 기본 `gemma4:31b` — 평가셋 60장 실측 top-1 55%·2.4s, qwen3.5:397b 52%·4.9s 라 정확도 동률에 2배 빠른 쪽) + `meal-recommend`(텍스트) 추가. 키·baseUrl 은 chat 계정 상속, 모델만 `OLLAMA_MEAL_PHOTO_MODEL`/`OLLAMA_MEAL_RECOMMEND_MODEL` 폴백. 식단 인식/추천은 `MealDailyQuota`(SQLite) 일일 한도 + `RATE.mealRecognize/mealRecommend` 이중 게이트.
- **소비자** —
  - `apps/web` 어드민 화면이 `@repo/shared`의 API 클라이언트로 모든 admin 라우트 호출.
  - `apps/web` 공개 화면(루트 랭킹·맛집 지도·식당 상세) + **로그인 후 정산하기 stepper + /me/settlements 이력 + /me/contacts 단골 + /share/settlements/:token 공개 결과**.
  - `apps/mobile` 도 같은 클라이언트 (CLAUDE.md 핵심 규칙 #2).
- **모듈 간 토폴로지** —
  - `crawl → restaurant` — 신규 행 생성 시 nested `canonical: { create: {...} }`.
  - `crawl → canonical (ProposalService → CanonicalService)`.
  - `crawl → summary` — `persistReviewBatch` 가 돌려준 새 리뷰 id 배열을 `SummaryService.queueSummariesForReviews(busKey, ids)` 로 fire-and-forget.
  - `summary → ai` — adapter-cache 의 공유 FIFO 게이트.
  - `summary → restaurant.route` — `summaryEventsBus` 모듈 싱글턴.
  - `summary → menu-grouping/analytics` — `extractFirstJsonObject` / `normalizeTerm` 공유 export.
  - `restaurant.route → summary` — reanalyze/analyticsBackfill.
  - `restaurant.route → menu-grouping` — menusGroup/menusRanking.
  - `settings.route → settings.service` — 공개/admin 모두 같은 `getSecret('vworld')`.
  - `auto-discover → ai + crawl + restaurant + crawl/job-registry` — 자세한 건 [auto-discover 토픽](./auto-discover.md).
  - **`settlement-extraction → ai + media-like 디스크 보관`** — `AiConfigService.getResolved('ollama-cloud', 'image')` 로 vision 어댑터 획득 후 LLM 호출, multipart 로 받은 영수증 바이트를 `apps/friendly/data/receipts/<uuid>.jpg` 로 저장 + 토큰만 응답에 반환.
  - **`settlement → contact`** — `settlement.service.createSession` 이 모든 participant 를 `(userId, normalizedKey)` 로 SettlementContact 에 upsert 하고 `participant.contactId` 를 채운다 (자동 적립). 자세한 건 [settlement 토픽](./settlement.md).
  - **`settlement (public read) ← /share/settlements/:token`** — owner 본인 라우트와 별도 path, 가드 없이 read-only.
  - **`share-preview → settlement.service + restaurant.service + settlement-card + media.ALLOWED_HOSTS`** — **(NEW 2026-06-01)** OG HTML 핸들러가 `getSharePreviewMeta` 로 메타+og:image 를 모으고(내부에서 `RestaurantService.getPhotoUrls` 로 식당 사진 후보 수집 + `ALLOWED_HOSTS` 로 프록시 가능 판정), PNG 핸들러가 `getBySharedToken` → `renderSettlementCardPng(session)`. share-preview/settlement-card 둘 다 `@repo/api-contract` 의 calculator 를 import.
  - `server.ts → summary` — 부팅 직후 stale 행 정리 + 자동 재큐잉.
  - **`schedule → menu-grouping + analytics + crawl/job-registry`** — **(NEW 2026-06-06)** `ScheduleService` 가 `menuGrouping.getRestaurantsStatus`/`groupForRestaurant` 로 식당별 정규화, `analytics.runGlobalMerge` 로 전역 머지, `jobRegistry.isPlaceCrawling(placeId)` 로 크롤 진행 중 식당 가드. menuGrouping/analytics 는 plugin 이 자체 생성한 인스턴스(app.aiConfig 미사용). 파이프라인 상세는 [schedule 토픽](./schedule.md) / [analytics 토픽](./analytics.md) / [menu-grouping 토픽](./menu-grouping.md).
  - **`server.ts ↔ plugins/schedule.ts → scheduleRegistry`** — 부팅 `app.schedule.bootstrap()` 과 shutdown `stopAllCrons/abortInflight` 가 모듈 singleton `scheduleRegistry` 를 공유. cron tick 콜백은 `app.schedule.runScheduled('cron')` 을 fire-and-forget.
  - **`summary → review-search → review-clustering`** — **(NEW 2026-06-25)** `SummaryService` 가 `reviewSearch`(enrich) + `clustering` 을 주입받아 요약 종료 훅에서 enrich → 군집화를 잇는다. 단일 행이 아니라 `canonical-members` 의 멤버 집합으로 코퍼스 로드. 상세는 [review-search 토픽](./review-search.md) / [review-clustering 토픽](./review-clustering.md).
  - **`* (모든 기능) → logs (operationLog)`** — **(NEW 2026-06-25)** crawl/summary/menu-grouping/analytics/settlement-extraction/schedule/random-crawl 이 `app.operationLog` 단일 인스턴스로 run/스텝 로그를 흘리고 SSE 로 중계. 실패 run 은 `LogAnalysisService` 가 LLM 으로 분석(OperationReport). `restaurant.route` 의 `crawlLogs` 는 이제 `operation_logs` 테이블을 읽되 레거시 `CrawlJobLogEntry` 계약(jobId non-null, level 3종)을 feature/jobId/level 필터로 보존. 상세는 [logs 토픽](./logs.md).
  - **`plugins/random-crawl.ts → restaurant + crawl + telegram + ai + summary(reviewSearch) + logs`** — **(NEW 2026-06-25)** RandomCrawlService 가 cron 으로 지역 검색 → 텔레그램 후보 전송 → 콜백으로 선택된 가게만 `CrawlService` 로 크롤(여기서 만든 Summary 도 reviewSearch enrich 훅 보유). `jobRegistry` 모듈 singleton 으로 다른 CrawlService 와 in-flight/dedup 공유. 상세는 [random-crawl 토픽](./random-crawl.md).
  - **`restaurant-preview → restaurant.service`** — **(NEW 2026-06-25)** `/r/:placeId` HTML 핸들러가 `getPublicSeoMeta(placeId)`, `/sitemap.xml` 이 `getPublicSitemapEntries()` 를 호출. media `panorama` 사본 URL 은 thumbnail 프록시를 건너뛰고 same-origin 절대화.
  - **`restaurant.route → restaurant.getRegionStats`** ↔ **`region-stats-telegram` (telegram 봇)** — **(NEW 2026-06-25)** 같은 `RegionStatsResult` 를 어드민 라우트(JSON)와 텔레그램 메시지(텍스트 막대) 두 표면이 공유.
  - **`air-quality.route → air-quality.service(캐시/stale) → airkorea-api.adapter`**, **`air-location.route → air-location.service`** — **(NEW 2026-08-21)** 내 대기 위치는 좌표만 저장하고 가까운 측정소 해석은 조회 시 계산(측정소 신설·폐지 자동 대응). 라우트가 `replyUpstreamError(req, reply, e, [502, 503], …)` 로 업스트림 5xx 를 진단 로깅 — 대중교통과 같은 [lib/reply-upstream-error.ts](../../apps/friendly/src/lib/reply-upstream-error.ts).
  - **`weather.route → weather.service(kma-api) + aws.service(kma-apihub)`** — **(NEW 2026-08-21)** 두 서비스가 한 라우트 파일에서 조립. `aws` 는 키 없으면 서비스가 `enabled=false` 를 돌려주고 라우트는 200.
  - **`life-map.route → life-map.service(로컬 SQLite bbox/집계) + life-map-search.service(vworld-search.adapter, 키는 settings/map.service) + master 서비스(적재 상태)`** — **(NEW 2026-08-21)** 적재 경로는 라우트 밖: `scripts/load-life-*` → `life-map-master.service`/`life-map-hospital-master.service`(전량 교체 트랜잭션) → `life-map-geocode.service`(+`geocode-cache.service`).
  - **`plugins/food-import.ts → food(FoodImportService + FoodClassifyService) + ai(chat) + logs(operationLog)`**, **`food.route → app.foodImport/app.foodClassify + food.service + food-nutrition/allergen/merge-conflict/recognition-quality`** — **(NEW 2026-08-22)** 적재 잡 `startRun→log→finishRun` 계측(`OperationFeature 'food-import'`). 음식→식당 역검색은 `global_menu_canonicals`·리뷰 언급을 조인해 근거를 만든다.
  - **`meal.route → app.mealPhotos + meal.service + meal-data.service + food(카탈로그 매칭·영양 스냅샷)`** — **(NEW 2026-08-22~23)** 사진 GC cron 은 `scheduleRegistry` jobType `meal-photo-gc`. 사용자 단위 쓰기 직렬화는 [meal-mutation-barrier.ts](../../apps/friendly/src/modules/meal/meal-mutation-barrier.ts)(모듈 싱글턴 — [in-memory-singleton-gates](../concepts/in-memory-singleton-gates.md)).
  - **`meal-recognition.route → ai(meal-photo) + app.mealPhotos + meal-daily-quota.service + food(후보 매칭)`** — **(NEW 2026-08-22)** `OperationFeature 'meal-recognition'` 계측, `MEAL_RECOGNITION_VERSION=2`(후보 강제 프롬프트). 디버그 덤프는 [meal-recognition-debug.store.ts](../../apps/friendly/src/modules/meal/meal-recognition-debug.store.ts)(HMAC 해시 식별자, TTL 168h).
  - **`meal-recommendation.route → ai(meal-recommend) + meal-pattern.service + weather.service.getNowcast(KMA_API_KEY||BUS_API_KEY, @repo/utils latLngToKmaGrid) + food + meal-daily-quota.service`** — **(NEW 2026-08-22)** 날씨 컨텍스트는 실패해도 계절 근거로 폴백(`weatherFit`). `OperationFeature 'meal-recommendation'`, `MEAL_RECOMMENDATION_VERSION=2`.

## API Surface [coverage: high — 22 sources]

라우트 경로는 모두 `@repo/api-contract`의 [`Routes.*`](../../packages/api-contract/src/routes.ts)에서 가져온다.

라우트 트리 (요약):

```
/api/v1
├── /auth/*                                       (public mix)
├── /admin/users/*                                (admin)
├── /picks/*                                      (bearer)
├── /media/thumbnail                              (public)        ← 네이버 CDN 썸네일 프록시
├── /media/panorama/:placeId                      (public)        ← (NEW 2026-06-25) 파노라마 사본 jpg (없으면 404)
├── /restaurants
│   ├── /ranking                                  (public)        ← AI 분포 정렬
│   ├── /public                                   (public)        ← 공개 리스트
│   ├── /public/:placeId                          (public)        ← 공개 상세
│   ├── /public/:placeId/reviews                  (public)        ← (NEW 2026-06-25) 공개 리뷰 목록
│   ├── /public/:placeId/insights                 (public)        ← 공개 인사이트
│   ├── /public/:placeId/category-tree            (public)        ← (NEW 2026-06-06) 메뉴 카테고리 트리
│   ├── /admin/restaurants/smart-pick             (admin)         ← (NEW) 가중 랜덤 픽
│   ├── /admin/restaurants/region-stats           (admin)         ← (NEW 2026-06-25) 시/도·시군구 분포
│   ├── /admin/restaurants/reviews/:reviewId/resummarize (admin)  ← (NEW 2026-06-25) 단건 재요약
│   └── /admin/restaurants/*                      (admin)         ← 어드민 CRUD/SSE/페이징·정렬
├── /admin/crawl/*                                (admin)         ← crawl 토픽
├── /admin/canonical/*                            (admin)         ← canonical 토픽
├── /admin/auto-discover/jobs[/:id[/events]]      (admin + SSE)   ← auto-discover 토픽
├── /admin/ai/*                                   (admin)         ← ai 토픽 (provider × purpose)
│   └── /providers/:id/:purpose/models/preview    (admin)         ← (NEW 2026-05-28) 미저장 key 로 모델 list
├── /admin/analytics/*                            (admin)         ← analytics 토픽
├── /admin/schedule                               (admin)         ← (NEW 2026-06-06) GET 설정 / PUT 설정변경
│   ├── /run                                      (admin)         ← POST 지금 실행(manual)
│   ├── /runs                                     (admin)         ← GET 실행 이력 + inflightRunId
│   ├── /preview                                  (admin)         ← POST cron 식 검증 + 다음 실행 미리보기
│   └── /run-events                               (admin + SSE)   ← ?token=<jwt> live 진행
├── /admin/random-crawl/*                          (admin)         ← (NEW 2026-06-25) random-crawl 토픽
├── /admin/logs/*                                  (admin)         ← (NEW 2026-06-25) logs 토픽
├── /admin/settings/map[/...]                     (admin)
├── /admin/settings/telegram[/...]                 (admin)         ← (NEW 2026-06-25) telegram 토픽
├── /settings/map/public                          (public)
├── /bus/stations/search                          (public)        ← (NEW 2026-07-06) 정류소 이름 검색 (30일 캐시)
├── /bus/stations/nearby                          (public)        ← (NEW 2026-07-06) 좌표 기반 주변 정류소 (셀 캐시)
├── /bus/stations/:arsId/arrivals                 (public)        ← (NEW 2026-07-06) 실시간 도착 (무캐싱)
├── /bus/routes/:busRouteId/positions             (public)        ← (NEW 2026-07-06) 노선 실시간 차량 위치 (무캐싱)
├── /bus/routes/:busRouteId/detail                (public)        ← (NEW 2026-07-06) 노선 상세(형상+경유 정류소)
├── /bus/favorites[/...]                          (bearer)        ← (NEW 2026-07-06) 즐겨찾기 목록/추가/삭제/sync
├── /air/sido/:sidoName                           (public)        ← (NEW 2026-08-21) 시도별 실시간 — 전국 1콜 10분 캐시 후 sidoName 필터
├── /air/stations/:stationName/history            (public)        ← (NEW 2026-08-21) 측정소 이력 ?term=DAILY|MONTH|3MONTH
├── /air/bad-stations · /air/forecast[/weekly]    (public)        ← (NEW 2026-08-21) 나쁨 측정소 · 예보(20분)/주간예보(60분)
├── /air/stations[/nearby|/search]                (public)        ← (NEW 2026-08-21) 측정소 목록(24h 캐시) · 주변 · 검색 (측정소정보 API)
├── /air/location                                 (bearer)        ← (NEW 2026-08-21) 내 대기 위치 GET/PUT/DELETE — 사용자당 1행
├── /weather/{nowcast,forecast,versions,mid,mid/sea} (public)     ← (NEW 2026-08-21) 기상청 단기·중기 프록시 — 발표 시각 단위 캐시 + stale
├── /weather/aws                                  (public)        ← (NEW 2026-08-21) API허브 AWS 매분 관측 — KMA_APIHUB_KEY 없으면 enabled=false 200
├── /life-map/{status,points,nearby,search}       (public)        ← (NEW 2026-08-21) 일상지도 — 로컬 SQLite, bbox+zoom(임계 아래 집계 셀), VWorld 검색 프록시
├── /life-map/:layer/:id                          (public)        ← (NEW 2026-08-21) 단건 상세 (cctv|toilet|hospital)
├── /food/search · /food/:id/restaurants          (bearer)        ← (NEW 2026-08-22) 카탈로그 자동완성 · 음식→식당 역검색
├── /admin/food/{items[/:id],stats,merge-conflicts[/:id],recognition-quality} (admin) ← (NEW 2026-08-22) 카탈로그 운영
├── /admin/food/import[/run|/runs|/preview|/run-events] (admin + SSE) ← (NEW 2026-08-22) 적재 잡 — random-crawl 5-키 골격
├── /meals[/:id] · /meals/{calendar,stats,time-presets,items/recent} (bearer) ← (NEW 2026-08-22) 식단 기록 CRUD·달력·통계
├── /meals/photos[/:token[/thumb|/copy]]          (bearer)        ← (NEW 2026-08-22) 사진 업로드(multipart)·조회(JWT — <img src> 불가)·복제·삭제
├── /meals/recognize                              (bearer)        ← (NEW 2026-08-22) 사진→음식 인식 (purpose meal-photo, 일일 30)
├── /meals/preference                             (bearer)        ← (NEW 2026-08-22) 선호 설정 GET/PUT (사용자당 1행)
├── /meals/recommendations[/context|/:id/feedback|/:id/events] (bearer) ← (NEW 2026-08-22) 다음 끼니 추천 (purpose meal-recommend, 일일 20)
├── /meals/data[/export|/backup[/restore]|/photos/retention] (bearer) ← (NEW 2026-08-23) 내보내기·백업·복원·사진 보존·전체 삭제(DELETE /meals/data)
├── /settlement-extractions/*                     (bearer)        ← 영수증 multipart → vision LLM + split
├── /settlements/*                                (bearer, owner) ← 세션 CRUD + 차수 + 분배 + 공유 토큰
│   └── PUT /:id                                  (bearer, owner) ← (UPDATED 2026-05-28) 전체 replace
├── /share/settlements/:token                     (public)        ← 공개 read-only (API JSON)
├── /me/contacts[/:id]                            (bearer)        ← 단골 CRUD
├── /me/settlements/drafts[/:id]                  (bearer)        ← (NEW 2026-05-28) 자동 임시저장
├── /.well-known/apple-app-site-association       (public)        ← (NEW 2026-05-28) iOS Universal Links
├── /.well-known/assetlinks.json                  (public)        ← (NEW 2026-05-28) Android App Links
└── /health                                       (public)

(루트 — /api/v1 prefix 밖, app.ts 명시 등록)
├── GET /share/settlements/:token | /s/:token        (public)     ← (registerSharePreview, 2026-06-01) OG 메타 주입한 SPA index.html (text/html)
├── GET /share/settlements/:token/image.png | /s/:token/image.png (public) ← (2026-06-01) 정산표 PNG (image/png)
├── GET /r/:placeId                                  (public)     ← (registerRestaurantPreview, NEW 2026-06-25) 맛집 상세 SEO/공유 HTML(og+JSON-LD+noscript)
├── GET /sitemap.xml                                 (public)     ← (NEW 2026-06-25) 공개 맛집 URL sitemap
└── GET /robots.txt                                  (public)     ← (NEW 2026-06-25) admin/api/me/login Disallow + sitemap
```

> 참고: `.well-known/*` 두 라우트는 `/api/v1` prefix 가 없는 라우트 트리 — iOS/Android 가 항상 origin 루트 (`https://api.example.com/.well-known/...`) 에서 검증 파일을 찾기 때문. 마찬가지로 OG share-preview 의 `/share/settlements/*`·`/s/*`·`*/image.png`, **(NEW 2026-06-25)** 맛집 SEO 의 `/r/:placeId`·`/sitemap.xml`·`/robots.txt` 도 `/api/v1` 밖 origin 루트 — OG/검색 크롤러가 공유·검색 URL 그 자체(SPA 라우트와 같은 path)를 펼치기 때문이다. **이 라우트들은 `/api/v1/share/settlements/:token`(인증 없는 정산 JSON API) 과 path 가 다르다** — 전자는 사람/크롤러가 보는 HTML·PNG·XML, 후자는 FE 가 fetch 하는 JSON.

> `/admin/random-crawl/*`(설정/수동실행/이력/SSE) 은 [random-crawl 토픽](./random-crawl.md), `/admin/logs/*`(run 목록/상세/보고서/보존설정) 은 [logs 토픽](./logs.md), `/admin/settings/telegram/*`(봇 토큰 저장/상태) 은 [telegram 토픽](./telegram.md) 참고 — friendly 문서는 라우트 prefix 존재만 명시.

`/settlement-extractions` / `/settlements/*` / `/share/settlements/:token` / `/me/contacts` / `/me/settlements/drafts` 의 메소드·body·response 상세는 [settlement 토픽](./settlement.md) 참고. settlement 의 `update` 는 2026-05-28 부터 PUT `/api/v1/settlements/:id` (전체 replace) 한 라우트로 통일 — 이전 `PATCH /:id/participants` 는 제거. settlement-draft 는 GET `/me/settlements/drafts` (list) + PUT `/me/settlements/drafts` (upsert by `(userId, placeIdKey)`) + DELETE `/me/settlements/drafts/:id` 세 라우트. well-known 두 라우트는 env 가 비어 있을 때 404 + `{ error: 'apple-app-site-association not configured' }` (or `assetlinks.json`) 본문, configured 면 `Content-Type: application/json` + `Cache-Control: public, max-age=300`. AI 의 `models/preview` 는 저장 전 form 의 key 를 body 로 받아 모델 list 응답 — 저장된 row 의 key 가 아직 비어도 동작. **(NEW 2026-06-06)** `/admin/schedule` 5종은 모두 `[authenticate, requireAdmin]` 가드(`run-events` SSE 만 `?token=<jwt>` 쿼리 인증 — EventSource 가 헤더를 못 보냄): GET 설정(현재 cron/enabled + `nextRunAt`) · PUT 설정변경(잘못된 cron 은 service 가 throw → route 가 400) · POST `/run`(manual, 진행 중이면 `skipped` run 반환) · GET `/runs`(이력 50건 + `inflightRunId`) · POST `/preview`(cron 검증 + 다음 5회 시각) · GET `/run-events`(초기 `snapshot` 이벤트 후 진행 중 run 이면 `progress`/`done` 스트림, 없으면 즉시 닫음 — 15s comment heartbeat). 스키마는 `@repo/api-contract` 의 `ScheduleConfig`/`ScheduleConfigInput`/`ScheduleRun`/`ScheduleRunList`/`SchedulePreviewInput`/`SchedulePreviewResult`, 자세한 건 [schedule 토픽](./schedule.md). restaurant 의 공개 `publicCategoryTree(:placeId)` 는 가드 없이 `getCategoryTree` 결과(`{ roots }`) 반환, 식당 없으면 404.

restaurant 의 admin `list` 응답은 multi-source 통합 + **페이징** 형태로 진화 — `{ items, total, limit, offset }`. 한 행 = 한 canonical, 그 안에 `sources[]` 배열로 네이버/다이닝코드 행이 들어가고 `candidateCount`/`suggestion` 도 포함. 공개 표면(`publicList`/`publicByPlaceId`/`ranking`/`smartPick`) 도 detail 단계에선 같은 canonical 그룹의 DC 형제를 함께 읽어 [restaurant.merge.ts](../../apps/friendly/src/modules/restaurant/restaurant.merge.ts) 의 머지 함수 군으로 단일 응답으로 융합.

### auth — [auth.route.ts](../../apps/friendly/src/modules/auth/auth.route.ts)

| Method | Path                   | Auth   | 설명                                 |
| ------ | ---------------------- | ------ | ------------------------------------ |
| POST   | `Routes.Auth.register` | public | 가입 → `{ token, user }` (201, USER) |
| POST   | `Routes.Auth.login`    | public | 로그인 → `{ token, user }`           |
| GET    | `Routes.Auth.me`       | bearer | 현재 사용자 정보                     |
| POST   | `Routes.Auth.logout`   | bearer | 204 (stateless NOP)                  |

### picks — [picks.route.ts](../../apps/friendly/src/modules/picks/picks.route.ts)

`addHook('onRequest', app.authenticate)`로 모듈 전역 인증. CRUD + `POST :id/random`.

### admin — [admin.route.ts](../../apps/friendly/src/modules/admin/admin.route.ts)

각 라우트마다 `onRequest: [authenticate, requireAdmin]`. `Routes.Admin.listUsers`, `Routes.Admin.setUserRole(:id)`.

### restaurant — [restaurant.route.ts](../../apps/friendly/src/modules/restaurant/restaurant.route.ts)

| Method | Path (`Routes.Restaurant.*`)                  | Auth          | 설명                                                                              |
| ------ | --------------------------------------------- | ------------- | --------------------------------------------------------------------------------- |
| GET    | `ranking`                                     | public        | 60s TTL + dogpile-guard. 네이버 전용.                                             |
| GET    | `publicList`                                  | public        | 좌표·도로명·썸네일·AI 통계. q/category/bbox/sort. 네이버 전용. nullsLast.        |
| GET    | `publicByPlaceId(:placeId)`                   | public        | 공개 상세. `analysis` 는 done 행만 평탄화. canonical(naver+dc+tabling) 융합.        |
| GET    | `publicReviews(:placeId)`                     | public        | **(2026-06-25)** 공개 리뷰 목록. **(2026-08-17 정정)** `recent` 는 실제 방문일 desc(`compareReviewRecencyDesc`, 해석 불가 시 `fetchedAt desc`) — 이전 "fetchedAt asc=최신순" 아님. |
| GET    | `publicInsights(:placeId)`                    | public        | 어드민 `insights` 와 동일 응답 스키마, 가드만 빠짐.                                |
| GET    | `publicCategoryTree(:placeId)`                | public        | **(NEW 2026-06-06)** 메뉴 카테고리 트리(`{ roots }`). 식당 없으면 404.              |
| GET    | `list`                                        | bearer+admin  | **multi-source 통합 리스트 + 페이징/정렬**. `?offset&limit&sort=recent|satisfaction|positive|negativeRatio`. 응답 `{ items, total, limit, offset }`. |
| GET    | `byPlaceId(:placeId)`                         | bearer+admin  | 디테일 (네이버 단일 행).                                                          |
| DELETE | `delete(:placeId)`                            | bearer+admin  | 캐스케이드 삭제. in-flight 크롤이 같은 placeId면 409.                            |
| POST   | `reanalyze(:placeId)`                         | bearer+admin  | 구버전/failed 분석 행 재큐잉.                                                     |
| GET    | `insights(:placeId)`                          | bearer+admin  | MenuMention + MenuCanonical JOIN.                                                 |
| POST   | `menusGroup(:placeId)`                        | bearer+admin  | 식당 메뉴 LLM canonical 그룹핑.                                                   |
| GET    | `menusRanking(:placeId)`                      | bearer+admin  | 그룹된 메뉴 순위.                                                                 |
| POST   | `analyticsBackfill`                           | bearer+admin  | menus/tips/keywords JSON → 정규화 테이블 1회 백필.                                |
| POST   | `smartPick`                                   | bearer+admin  | 가중 랜덤 픽. 네이버 전용.                                                        |
| GET    | `regionStats`                                 | bearer+admin  | **(NEW 2026-06-25)** 시/도·시군구 분포(`deriveRegion` 즉석 파생). 어드민 지역 위젯. |
| POST   | `reviewResummarize(:reviewId)`                | bearer+admin  | **(NEW 2026-06-25)** 단건 리뷰 재요약(모델 선택 등).                               |
| GET    | `summaryStatus(:placeId)`                     | bearer+admin  | 요약 진행률 스냅샷.                                                               |
| GET    | `summaryEvents`                               | query token   | Multiplexed SSE. `?placeId=…&canonicalId=…&token=<jwt>`. named heartbeat 5s.       |
| POST   | `cancelSummary(:placeId)`                     | bearer+admin  | 진행 중 요약 중지.                                                                 |
| POST   | `resumeSummary(:placeId)`                     | bearer+admin  | cancelled 행만 재큐잉.                                                            |
| GET    | `crawlLogs(:placeId)`                         | bearer+admin  | 누적 크롤+요약 로그 cursor pagination. **(2026-06-25)** 저장소가 `operation_logs` 로 전환 — 레거시 `CrawlJobLogEntry` 계약은 feature/jobId/level 필터로 보존. |

> 글로벌 통계 라우트는 [analytics 토픽](./analytics.md), 가게 통합/제안 라우트는 [canonical 토픽](./canonical.md), 자동 발견 잡 라우트는 [auto-discover 토픽](./auto-discover.md), 정산/단골/영수증 라우트는 [settlement 토픽](./settlement.md) 참고. SEO/공유용 `/r/:placeId`·`/sitemap.xml`·`/robots.txt` 는 [restaurant-preview.ts](../../apps/friendly/src/modules/restaurant/restaurant-preview.ts)(Architecture 참조).

### settings — [settings/map.route.ts](../../apps/friendly/src/modules/settings/map.route.ts)

vworld JS SDK 키. 공개 한 개 + admin 네 개. **(2026-06-25)** `MapSettingsService` 가 DB 우선 + env(`VWORLD_*`) fallback + `source` 출처 표시. 텔레그램 설정(`/admin/settings/telegram/*`)은 [telegram 토픽](./telegram.md).

### media — [media.route.ts](../../apps/friendly/src/modules/media/media.route.ts) — public

- `thumbnail`: `?url=<naver-cdn-url>&w=300&q=78` → JPEG. `ALLOWED_HOSTS` 화이트리스트(export 됨 — OG 공유 재사용), sharp 리사이즈, `data/thumbs/<sha1>.jpg` 디스크 캐시.
- **(NEW 2026-06-25)** `panorama(:placeId)`: 크롤 시점에 받아둔 네이버 파노라마 사본(`data/panorama/<placeId>.jpg`)을 `image/jpeg` + `max-age=30d, immutable` 로 스트리밍. 사본 없으면 404. `panorama-cache.ts` 가 휘발성 HMAC URL 을 영구 사본으로 저장(Architecture 참조).

### health — [health.route.ts](../../apps/friendly/src/modules/health/health.route.ts)

`Routes.Health` + `/health` (스모크 프로브).

### 신규 모듈 로스터 (2026-08-21~08-30) — 파일·prefix·인증 경계

도메인 로직은 각 토픽. 여기선 "어느 파일이 어느 prefix 를 어떤 가드로 노출하는가"만.

| 모듈 | route / service 파일 | prefix (`Routes.*`) | 인증 경계 | 레이트리밋·게이트 |
| --- | --- | --- | --- | --- |
| **air-quality** | [air-quality.route.ts](../../apps/friendly/src/modules/air-quality/air-quality.route.ts) · [air-location.route.ts](../../apps/friendly/src/modules/air-quality/air-location.route.ts) / `air-quality.service.ts` · `air-location.service.ts` · `airkorea-api.adapter.ts` | `/air/*` (`AirQuality`) | 공개 8종(sido/stations/history/bad-stations/forecast/weekly/nearby/search — 한글 경로라 `decodeURIComponent(Routes…(':x'))` 로 등록) / `location` GET·PUT·DELETE 만 `authenticate` | `RATE.transitRealtime`(60/분), 키 `AIRKOREA_API_KEY \|\| BUS_API_KEY`(둘 다 비면 503) |
| **weather** | [weather.route.ts](../../apps/friendly/src/modules/weather/weather.route.ts) / `weather.service.ts` · `aws.service.ts` · `kma-api.adapter.ts` · `kma-apihub.adapter.ts` | `/weather/*` (`Weather`) | 전부 공개(nowcast/forecast/versions/mid/mid/sea/aws) | `RATE.transitRealtime`, 키 `KMA_API_KEY \|\| BUS_API_KEY`(503) / `KMA_APIHUB_KEY`(비면 `enabled=false`) |
| **life-map** | [life-map.route.ts](../../apps/friendly/src/modules/life-map/life-map.route.ts) / `life-map.service.ts` · `life-map-search.service.ts` · `life-map-master.service.ts` · `life-map-hospital-master.service.ts` · `life-map-geocode.service.ts` · `life-map-geocode-cache.service.ts` · `vworld-search.adapter.ts` · `hira-hospital.adapter.ts` | `/life-map/*` (`LifeMap`) | 전부 공개(status/points/nearby/search/`:layer/:id`) | points·nearby `RATE.lifeMapRead`(240/분), search `RATE.lifeMapSearch`(60/분, VWorld 키 없으면 `enabled=false`), status·detail 제한 없음 |
| **food** | [food.route.ts](../../apps/friendly/src/modules/food/food.route.ts) / `food.service.ts` · `food-import.service.ts` · `food-import-registry.ts` · `food-classify.service.ts` · `food-nutrition.service.ts` · `food-allergen.ts` · `food-merge-conflict.service.ts` · `food-recognition-quality.service.ts` · `food-source-audit.ts` · `food-api.adapter.ts` · `food.prompts.ts` | `/food/*` + `/admin/food/*` (`Food`) | `search`·`restaurants(:id)` 는 `authenticate`(로그인 사용자) / items·stats·merge-conflicts·recognition-quality·import·run·runs·preview 는 `[authenticate, requireAdmin]` / `import/run-events` SSE 는 `?token=` + `app.resolveSseAdmin` | search `RATE.foodSearch`(120/분), restaurants `RATE.foodRestaurants`(60/분), 적재 동시 1개(`FoodImportRegistry` + DB run 조회) |
| **meal** | [meal.route.ts](../../apps/friendly/src/modules/meal/meal.route.ts) / `meal.service.ts` · `meal-data.service.ts` · `meal-photo.service.ts` · `meal-preference.service.ts` · `meal-stats.service.ts` · `meal-stats.insights.ts` · `meal-daily-quota.service.ts` · `meal-mutation-barrier.ts` · `meal-recognition-debug.store.ts` | `/meals/*` (`Meal`) | **전부 `authenticate`** — 공개·공유 표면 없음. 사진 조회도 JWT(`<img src>` 직접 불가) | 사진 업로드/복제 `RATE.mealPhotoUpload`(30/분), 백업/복원 `RATE.mealDataArchive`(10/시간), 사용자 단위 write barrier |
| **meal-recognition** | [meal-recognition.route.ts](../../apps/friendly/src/modules/meal-recognition/meal-recognition.route.ts) / `meal-recognition.service.ts` · `meal-recognition-eval.ts` · `meal-recognition.prompts.ts` | `POST /meals/recognize` (`Meal.recognize`) | `authenticate` | `RATE.mealRecognize`(10/분) + `MEAL_RECOGNIZE_DAILY_LIMIT`(SQLite `MealDailyQuota`, 기본 30/일, 0=무제한) |
| **meal-recommendation** | [meal-recommendation.route.ts](../../apps/friendly/src/modules/meal-recommendation/meal-recommendation.route.ts) / `meal-recommendation.service.ts` · `meal-pattern.service.ts` · `meal-recommendation.feedback.ts` · `meal-recommendation.prompts.ts` | `/meals/recommendations[/context\|/:id/feedback\|/:id/events]` (`Meal.recommendation*`) | `authenticate` | `RATE.mealRecommend`(10/분, 캐시 히트는 LLM 0콜) + `MEAL_RECOMMEND_DAILY_LIMIT`(20/일) |

인증 경계 요약: **공개**(air 8·weather 6·life-map 5) — 대중교통과 같이 비로그인 지도/조회 표면 / **로그인**(air location·food search/restaurants·meal 전부) / **ADMIN**(food 운영·적재). SSE 는 여전히 `?token=` 쿼리 인증([sse-token-auth](../concepts/sse-token-auth.md)) — food import `run-events` 가 random-crawl `run-events` 와 같은 `resolveSseAdmin` 경로.

## Data [coverage: high — 45 sources]

**테이블 소유 큰 그림** — friendly 의 단일 `dev.db` 에 모든 도메인 테이블이 산다. 어떤 모듈이 무엇을 소유하는지(상세는 각 토픽):
- **코어/식당/리뷰**: User · Pick/PickResult · Restaurant · CanonicalRestaurant · CanonicalMergeProposal · VisitorReview · **ReviewSummary**(2026-06-25 review-search enrichment 컬럼 + review-clustering `clusterId` 추가) · MenuMention · ReviewTag · MenuCanonical · GlobalMenuCanonical(+Link) · GlobalMergeChunkCache.
- **review-clustering** (NEW 2026-06-25): `ReviewCluster`(식당 단위 군집 토픽). 멤버십은 `ReviewSummary.clusterId`(SetNull).
- **settlement**: SettlementSession(+`shareExpiresAt`/`shareOgImage`/`shareOgImageUrl`) · SettlementRound(+`discountAmount`/`categoryAdjustments`/**`groupSplits`**) · SettlementItem · SettlementParticipant · SettlementRoundParticipant · SettlementContact · SettlementDraft.
- **schedule** (2026-06-06): ScheduleConfig · ScheduleRun.
- **logs** (NEW 2026-06-25): `OperationRun` · `OperationLog` · `OperationReport` · `LogConfig` — CrawlJobLog 를 일반화. (레거시 `CrawlJobLog` 테이블은 잔존.)
- **random-crawl** (NEW 2026-06-25): `RandomCrawlConfig` · `RandomCrawlRun`.
- **telegram** (NEW 2026-06-25): `TelegramConfig`(단일 행, DB 우선 + env fallback).
- **bus** (NEW 2026-07-06): `BusStation` · `BusNearbyCell`(+`BusNearbyCellHit`) · `BusStationSearch`(+`BusStationSearchHit`) · `BusRouteShape` — 정류소/주변/노선 상세 30일 캐시(사실상 정적). `BusFavoriteStation`/`BusFavoriteRoute` — 로그인 사용자 즐겨찾기(User Cascade). 상세는 [bus 토픽](./bus.md).
- **menu-grouping** (NEW 2026-07-06): `RestaurantMenuGroup`(`restaurant_menu_groups`) · `RestaurantMenu`(`restaurant_menus`) — 식당별 메뉴 그룹 영속 가산. 상세는 [menu-grouping 토픽](./menu-grouping.md).
- **settings(map)**: MapProviderConfig. **ai**: LlmProviderConfig(`(provider,purpose)` unique — **(2026-08-22) purpose 5종** chat/image/log-analysis/meal-photo/meal-recommend).
- **air-quality** (NEW 2026-08-21): `AirUserLocation`(`air_user_locations`, `userId` PK — PUT 덮어쓰기, 가까운 측정소는 저장하지 않고 조회 시 계산). 상세 [air-quality 토픽](./air-quality.md).
- **life-map** (NEW 2026-08-21, 병의원 08-30): `LifeCctv`(`life_cctvs`, 관리번호 PK) · `LifeToilet`(`life_toilets`, 좌표 nullable + `geoSource`) · `LifeHospital`(`life_hospitals`, ykiho PK, `geoSource` api/road/parcel) · `LifeGeocodeCache`(`life_geocode_caches`, `@@id([type,address])`, notfound 도 기록) · `LifeMasterSync`(`life_master_syncs`, 레이어별 적재 이력 — bus/subway MasterSync 패턴). 전부 FK 없음(전량 교체 적재 내성), 조회 인덱스는 `@@index([lat,lng])` 하나. `LifeMasterSync` 는 `BusMasterSync`/subway MasterSync 와 같은 "마스터 전량 교체 + 이력 게이트 + 미적재 503 안내" 골격(schema.prisma 주석·[open-data-master-load](../concepts/open-data-master-load.md)). 상세 [life-map 토픽](./life-map.md).
- **food** (NEW 2026-08-22~24): `FoodItem`(`food_items`, `nameNorm @unique` — 출처가 달라도 같은 이름은 한 행 병합) · `FoodSourceObservation`(`food_source_observations`, 필드별 원본 관찰) · `FoodMergeConflict`(`food_merge_conflicts`, 검토 큐) · `FoodImportConfig`(`food_import_configs`, `jobType @unique` 1행 — random-crawl 골격, cron 기본 `0 4 1 * *`) · `FoodImportRun`(`food_import_runs`). 상세 [food 토픽](./food.md).
- **meal** (NEW 2026-08-22~23): `MealEntry`·`MealItem`(카탈로그/식당은 FK 없이 `foodId`/`placeId` 스냅샷)·`MealPhoto`(`token @unique`, `userId` 직접 보유 — 업로드 직후엔 entry 가 없다)·`MealPreference`(`userId` PK)·`MealRecommendation`·`MealRecommendationEvent`(불변 행동 이벤트)·`MealDailyQuota`(`@@id([userId,date,purpose])`, 재시작에도 유지되는 일일 한도)·`MealDataImport`(`@@unique([userId,archiveId])`, 백업 멱등 복원 원장)·`MealPhotoDeletion`(**User FK 없음** — 계정 삭제와 경합해도 cron 이 파일을 끝까지 지우는 durable outbox). `User` 에 relation 8종(`airLocation` + meal 7종) 추가, 모두 Cascade. 상세 [meal 토픽](./meal.md).

**신규 모델 요약 (2026-08-21~30, 20개 → 총 75 모델)** — 컬럼 상세는 각 토픽·[schema.prisma](../../apps/friendly/prisma/schema.prisma):

| 모델 | 테이블 | 키/인덱스 | 소유 모듈 · 비고 |
| ---- | ------ | --------- | ---------------- |
| `AirUserLocation` | `air_user_locations` | `userId @id`, User Cascade | air-quality · `lat/lng/label?/source('geolocation'\|'manual'…)` |
| `LifeCctv` | `life_cctvs` | `id`(관리번호) PK, `@@index([lat,lng])` | life-map · 설치목적 `purpose` 는 `@repo/utils LIFE_CCTV_PURPOSES` 10종 정규화 |
| `LifeToilet` | `life_toilets` | `id` PK, `@@index([lat,lng])`, `lat/lng?` | life-map · 원본에 좌표 없음 → VWorld 지오코딩, `geoSource` road/parcel/null, 편의 필드 불리언 파생(`disabled`/`kids`/`open24`) |
| `LifeHospital` | `life_hospitals` | `id`(ykiho) PK, `@@index([lat,lng])` | life-map · 종별 `category` 7종(`LIFE_HOSPITAL_CATEGORIES`), 좌표는 업스트림 XPos/YPos 우선(`geoSource='api'`) |
| `LifeGeocodeCache` | `life_geocode_caches` | `@@id([type,address])` | life-map · `status ok\|notfound`, `refined` 주소 — 재적재 시 업스트림 호출 0 에 근접 |
| `LifeMasterSync` | `life_master_syncs` | autoincrement, `@@index([layer,loadedAt])` | life-map · `layer cctv\|toilet\|hospital`, `count/geocoded?/baseDate?/sourceFile?` — `status:life-map` 의 원천 |
| `FoodItem` | `food_items` | `nameNorm @unique`, `@@index([source,sourceId])`/`([dishType,mainIngredient])`/`([allergenStatus,active])`/`([active,popularity])` | food · 2축 분류 + cuisine, 1인분 영양 6종 + `nutritionFrom`(계열 차용 출처), 알레르겐 `allergensJson/allergenEvidenceJson/allergenStatus(unknown\|inferred\|verified)`, `sourceRefsJson` 병합 참조 |
| `FoodSourceObservation` | `food_source_observations` | `@@index([foodItemId,field])`/`([source,sourceId])`, FoodItem Cascade | food · 대표값과 달라도 버리지 않는 필드별 원본 |
| `FoodMergeConflict` | `food_merge_conflicts` | `@@index([status,createdAt])`/`([foodItemId,field])` | food · `status open\|kept_existing\|accepted_incoming\|dismissed` |
| `FoodImportConfig` | `food_import_configs` | `jobType @unique`('food-import') | food · `cronExpr` 기본 `0 4 1 * *`, `sourcesJson`, `classify` |
| `FoodImportRun` | `food_import_runs` | `@@index([status])`/`([startedAt])` | food · `trigger cron\|manual`, `statsJson`(소스별 집계), `classifiedCount` |
| `MealEntry` | `meal_entries` | `@@index([userId,eatenAt])`/`([userId,eatenDate])`/`([userId,originRecommendationId])`, User Cascade | meal · `eatenDate`(사용자 로컬 'YYYY-MM-DD' — 달력/통계 키), `slot`, `source photo\|manual\|recommendation`, `recognitionJson`(인식 원본 보존), `photoPurgedAt` |
| `MealItem` | `meal_items` | `@@index([entryId])`/`([nameNorm])`, Entry Cascade | meal · `foodId` 스냅샷(FK 아님), 분류 3축 스냅샷, `servings/portionSource`, 인식 계보(`recognitionDishId/selectedCandidateRank/catalogMatchedBy/Score`), 영양 스냅샷 `kcal/proteinG/sodiumMg` + `nutritionBasis direct\|donor_estimate\|missing` |
| `MealPhoto` | `meal_photos` | `token @unique`, `@@index([entryId,sortOrder])`/`([userId,createdAt])`, Entry·User Cascade | meal · `data/meal-photos/<userId>/<token>.jpg` + `_t.jpg`; `entryId` nullable(확정 전 고아 → GC) |
| `MealPreference` | `meal_preferences` | `userId @id` | meal · `weightsJson`(추천 가중치 7축), excluded/allergens/disliked/liked/mealTypes/slots JSON, `onboarded` |
| `MealRecommendation` | `meal_recommendations` | `@@index([userId,createdAt])`/`([userId,targetDate,targetSlot])` | meal-recommendation · `profileHash`(같은 날·끼니·프로필이면 캐시 재사용), `promptVersion`, `status done\|fallback\|failed` |
| `MealRecommendationEvent` | `meal_recommendation_events` | `@@index([recommendationId,createdAt])`/`([userId,createdAt])`/`([userId,kind,createdAt])` | meal-recommendation · `kind shown\|candidate_picked\|set_rated\|candidate_rated\|restaurant_opened\|logged\|dismissed`, `platform mobile\|web\|server`, `rankingVersion` |
| `MealDailyQuota` | `meal_daily_quotas` | `@@id([userId,date,purpose])`, `@@index([date,purpose])` | meal · `INSERT … ON CONFLICT DO UPDATE … WHERE count < limit` 한 문장으로 확인+증가 |
| `MealDataImport` | `meal_data_imports` | `@@unique([userId,archiveId])` | meal · 같은 백업을 여러 번 복원해도 중복 생성 안 함 |
| `MealPhotoDeletion` | `meal_photo_deletions` | `@@unique([userId,token])`, `@@index([attempts,createdAt])`, **FK 없음** | meal · unlink 실패 토큰을 잃지 않는 outbox, `plugins/meal.ts` GC 가 `drainDeletionOutbox` |

[prisma/schema.prisma](../../apps/friendly/prisma/schema.prisma) 모델 — 코어:

| 모델 | 테이블 | 핵심 필드 / 인덱스 | 비고 |
| ---- | ------ | -------------------- | ---- |
| `User` | `users` | `email @unique`, `role Role` | picks/settlements/contacts Cascade |
| `Pick` | `picks` | `userId @index`, `options` JSON | User Cascade |
| `PickResult` | `pick_results` | `pickId @index` | Pick Cascade |
| `Role` | enum | `USER \| ADMIN` | |
| `LlmProviderConfig` | `llm_provider_configs` | **`(provider, purpose) @@unique`**, `purpose` default `'chat'`, `apiKey`, `maxConcurrent`, `defaultModel` | **2026-05-25 purpose 컬럼 추가** — 같은 provider 를 chat/image 따로 등록. env fallback 은 chat 한정 |
| `MapProviderConfig` | `map_provider_configs` | `provider @unique`, `apiKey`(평문), `domains?` | env fallback 없음 |
| `CanonicalRestaurant` | `canonical_restaurants` | `id`, `name`, `primaryCategory?`, `latitude?`, `longitude?`, `searchKey?`, `suggestionDismissedAt?`, `@@index([searchKey])` | [canonical 토픽](./canonical.md) |
| `CanonicalMergeProposal` | `canonical_merge_proposals` | `(A,B)` 정규화 unique, `score`/`nameScore`/`distanceM?`, `status` | 둘 FK Cascade |
| `Restaurant` | `restaurants` | `source` default `'naver'`, `sourceId` NOT NULL, `placeId?` (nullable, 네이버만), `canonicalId` NOT NULL (FK Restrict), `@@unique([source, sourceId])`, `placeId @unique` | snapshotJson 안에 메뉴/블로그/영업시간/이미지/좌표 |
| `VisitorReview` | `visitor_reviews` | `restaurantId @index`, dedup `@@unique([restaurantId, externalId])` + `@@unique([restaurantId, contentHash])` | Restaurant Cascade |
| `ReviewSummary` | `review_summaries` | `reviewId @unique`, `status` 6종 (queued/pending/running/done/failed/cancelled), `sentiment?`, scores, JSON 분석 컬럼. **(NEW 2026-06-25)** review-search enrichment: `embeddingJson`(bge-m3 float[1024])/`aspectsJson`/`contextLine`/`enrichVersion`; review-clustering: `clusterId?`(SetNull, `@@index`) | `ANALYSIS_VERSION = 4`. enrichment·군집 컬럼 상세는 [review-search](./review-search.md)/[review-clustering](./review-clustering.md) |
| **`ReviewCluster`** | **`review_clusters`** | **`restaurantId`(primaryId), `ordinal`, `label`, `tone`, `size`, `keywordsJson`, `repReviewIdsJson`, `aspectsJson`, `clusterVersion`, `corpusSize`, `@@index([restaurantId])`** | **NEW (2026-06-25)**. Restaurant Cascade. 식당 단위 군집 토픽 — 통째 재계산(delete+insert). 멤버는 `ReviewSummary.clusterId`. 상세는 [review-clustering 토픽](./review-clustering.md) |
| `CrawlJobLog` | `crawl_job_logs` | `jobId`, `placeId?`, `stage`, `level`, `message`, `meta?`, `@@index([jobId, createdAt])`, `@@index([placeId, createdAt])` | **(레거시 — logs 로 일반화됨)** FK 미선언. 신규 로그는 `operation_logs` 로 흐름 |
| **`OperationRun`** | **`operation_runs`** | **`feature`(8종: crawl/summary/menu-grouping/settlement-extraction/auto-discover/schedule/global-merge/diningcode-bulk-save), `jobId?`, `subjectId?`, `parentRunId?`(중첩 run 연계), `status`, `trigger?`, `errorCode?`/`errorMessage?`, `meta?`, `@@index([feature,startedAt])`/`([status,startedAt])`/`([jobId])`/`([startedAt])`** | **NEW (2026-06-25)**. FK 없음. CrawlJobLog 를 일반화한 범용 run 헤더. 재시작 고아는 부팅 sweep 이 `failed`(server_restart). 상세는 [logs 토픽](./logs.md) |
| **`OperationLog`** | **`operation_logs`** | **`runId`, `feature`/`jobId?`/`subjectId?`(비정규화 — 레거시 조회 호환), `stage`, `level`(debug/info/warn/error — debug 는 SSE 미발송), `message`(2000자 캡), `meta?`(4096자 캡), `@@index([runId,createdAt])`/`([feature,createdAt])`/`([subjectId,createdAt])`/`([jobId,createdAt])`/`([createdAt])`** | **NEW (2026-06-25)**. Run Cascade. run 의 스텝 로그. `crawlLogs` 라우트가 이 테이블을 읽음 |
| **`OperationReport`** | **`operation_reports`** | **`runId @unique`, `status`(pending/running/done/failed), `provider?`/`model?`, `summary?`/`rootCause?`/`details?`(markdown)/`suggestions?`(JSON)/`severity?`(low/med/high), 토큰·durationMs, `@@index([status,createdAt])`** | **NEW (2026-06-25)**. Run Cascade. 실패 run 1건당 LLM 분석 보고서 1개 |
| **`LogConfig`** | **`log_configs`** | **`key @unique @default('global')`(전역 단일 행), `retentionDays` default 30** | **NEW (2026-06-25)**. cutoff 이전 로그/보고서 없는 run 을 매일 정리 |
| **`RandomCrawlConfig`** | **`random_crawl_configs`** | **`jobType @unique`('random-crawl'), `enabled`, `cronExpr` default `0 11 * * *`, `timezone`, `regionJson`, `keyword` default '맛집', `candidateCount` default 5, `responseTimeoutMin`, `timeoutAction`('skip'/'random'), `lastRunAt?`/`lastStatus?`** | **NEW (2026-06-25)**. ScheduleConfig 형태 + 지역/검색 설정. 텔레그램 토큰은 여기 저장 안 함. 상세는 [random-crawl 토픽](./random-crawl.md) |
| **`RandomCrawlRun`** | **`random_crawl_runs`** | **`trigger`, `status`(running/awaiting_selection/crawling/done/skipped/failed/interrupted), `regionLabel?`/`keyword?`, `candidatesJson`, `selectedPlaceId?`/`crawledRestaurantId?`, `telegramChatId?`/`telegramMessageId?`(콜백 매칭), `expiresAt?`, `@@index([status])`/`([startedAt])`** | **NEW (2026-06-25)**. 자동 발굴 회차 상태기계. 텔레그램 콜백이 chatId+messageId 로 이 행을 찾아 선택 반영 |
| **`TelegramConfig`** | **`telegram_configs`** | **`key @unique @default('telegram')`(단일 행), `botToken` default '', `chatId` default ''** | **NEW (2026-06-25)**. LlmProviderConfig/MapProviderConfig 와 같은 "DB 우선 + .env(TELEGRAM_*) fallback" 패턴 |
| `MenuMention` | `menu_mentions` | `summaryId`/`restaurantId` + `name`/`nameNorm`/`sentiment`/`traitsJson` | summary done 시 평탄화 |
| `ReviewTag` | `review_tags` | `kind` ('tip'/'keyword') + `term`/`termNorm` | tip+keyword 통합 |
| `MenuCanonical` | `menu_canonicals` | `(restaurantId, nameNorm) @@unique` | 식당 내 canonical |
| `GlobalMenuCanonical` | `global_menu_canonicals` | `globalKey @unique`, `categoryPath?` | 전역 canonical |
| `GlobalMenuCanonicalLink` | `global_menu_canonical_links` | `menuCanonicalId @unique` + `globalCanonicalId @index` | 다대일 링크 |
| **`SettlementSession`** | **`settlement_sessions`** | **`userId`, `restaurantPlaceId`, `restaurantName` (스냅샷), `grandTotal`, `shareToken? @unique`, **`shareExpiresAt?`** (2026-05-30 — 지나면 공개 조회 410), `shareOgImage?`/`shareOgImageUrl?` (2026-06-01 OG 선택), `editedAt?`, `@@index([userId, createdAt])`, `@@index([restaurantPlaceId])`** | **(2026-05-25, 2026-05-28 차수 도입으로 축소)**. User Cascade. 차수 단위 컬럼은 `SettlementRound` 로 이동, 본 테이블은 `grandTotal` (= 모든 round itemsSubtotal 합) 만 보유. `shareToken` 발급 시 unique 인덱스로 공개 read-only 라우트가 O(1) 조회. `editedAt` 은 share 토큰 발급/회수와 분리(‘수정됨’ 배지). OG 컬럼 상세는 [settlement 토픽](./settlement.md) |
| **`SettlementRound`** | **`settlement_rounds`** | **`sessionId`, `orderIndex`, `restaurantPlaceId`, `restaurantName`, `source` ('MANUAL'/'RECEIPT'), `totalAmount?`, `warning?`, `receiptImageToken?`, `itemsSubtotal`, `discountAmount?`, `discountCategory?`, `categoryAdjustments?` (JSON), **`groupSplits?`** (JSON, NEW 2026-06), `@@index([sessionId])`** | **NEW (2026-05-28)**. Session Cascade. N차 회식의 각 차수. `categoryAdjustments` 는 카테고리별 잔여 처리 규칙, **`groupSplits`** 는 세부 분배 그룹(소주/맥주 잔수 등)을 JSON 배열로 직렬화 |
| **`SettlementItem`** | **`settlement_items`** | **`roundId` (← sessionId 였음), `name`, `unitPrice?`, `quantity?`, `amount`, `category` ('ALCOHOL'/'NON_ALCOHOL'/'SIDE'/'UNCATEGORIZED'), `matchedMenuName?`, `orderIndex`, `@@index([roundId])`** | **(2026-05-25, 2026-05-28 roundId 로 이동)**. Round Cascade. 분배 계산은 `amount` 만 사용. SQLite table redefine 패턴으로 마이그레이션 (`new_settlement_items` 생성 → INSERT → DROP 구버전 → RENAME) |
| **`SettlementParticipant`** | **`settlement_participants`** | **`sessionId`, `name?`/`nickname?` (둘 중 하나 필수), `excludeAlcohol/NonAlcohol/Side` (default 정책), `shareAmount` (모든 차수 합산 스냅샷), `orderIndex`, `contactId?` (FK SetNull), `@@index([sessionId])`, `@@index([contactId])`** | **(2026-05-25)**. Session Cascade. Contact SetNull — 단골이 삭제돼도 정산 본체는 보존. 차수별 참석/제외 override 는 `SettlementRoundAttendee` 가 담당 |
| **`SettlementRoundAttendee`** | **`settlement_round_participants`** | **`roundId`, `participantId`, `attended` default true, `excludeAlcoholOverride?`/`excludeNonAlcoholOverride?`/`excludeSideOverride?`, `shareAmount` (차수 분담 스냅샷), `@@unique([roundId, participantId])`, `@@index([roundId])`, `@@index([participantId])`** | **NEW (2026-05-28)**. Round Cascade + Participant Cascade. 차수 × 마스터참여자 join. override 가 null 이면 마스터 participant 의 default exclude 정책 사용 |
| **`SettlementDraft`** | **`settlement_drafts`** | **`userId`, `placeIdKey` default `''` (sentinel), `payload` (JSON 문자열), `placeNameHint?`, `@@unique([userId, placeIdKey])`, `@@index([userId, updatedAt])`** | **NEW (2026-05-28)**. User Cascade. 정산 입력 자동 임시저장. `placeIdKey=''` = 식당 미지정 슬롯 (SQLite 의 multi-NULL unique 회피) |
| **`SettlementContact`** | **`settlement_contacts`** | **`userId`, `name?`/`nickname?`, `normalizedKey` (= `lower(trim(name))\|lower(trim(nickname))`), `lastExcludeAlcohol/NonAlcohol/Side`, `useCount` default 1, `lastUsedAt`, `@@unique([userId, normalizedKey])`, `@@index([userId, lastUsedAt])`** | **(2026-05-25)**. User Cascade. 정산 저장 시 자동 upsert. 자동완성 / 다중 선택 / `/me/contacts` CRUD 의 원천 |
| **`ScheduleConfig`** | **`schedule_configs`** | **`jobType @unique` (현재 `'normalize-merge'` 하나), `enabled` default false, `cronExpr`, `timezone` default `'Asia/Seoul'`, `lastRunAt?`/`lastStatus?` (빠른 표시용 비정규화), `createdAt`/`updatedAt`** | **NEW (2026-06-06)**. FK 없음. jobType 당 1행 — 주기 설정. `nextRunAt` 은 저장 안 함(croner 로 매번 계산, 저장하면 stale). 행이 없으면 service 가 기본값(disabled + `0 3 * * *`)으로 응답 |
| **`ScheduleRun`** | **`schedule_runs`** | **`jobType`, `trigger` ('cron'/'manual'), `status` ('running'/'done'/'failed'/'skipped'/'interrupted'), `totalTargets?`, `processedCount` default 0, `skippedCount` default 0, `error?`, `startedAt`, `finishedAt?`, `@@index([jobType, startedAt])`** | **NEW (2026-06-06)**. FK 없음 — 잡 휘발 후도 살아남음(CrawlJobLog 와 같은 사상). 실행 이력 1행 = 1 run. `running` 으로 남은 행은 다음 부팅 `bootstrap()` 이 `interrupted` 로 정리. `phase`/live 진행은 DB 미저장 — SSE 로만 |

**Restaurant ↔ Canonical 관계 핵심**:
- 신규 Restaurant 생성 시 항상 nested `canonical: { create: {...} }` 로 자기 전용 CanonicalRestaurant 1행을 동시 생성.
- `Restaurant.canonicalId` FK 는 `onDelete: Restrict` (Cascade **아님**) — 다른 source 행이 남아있을 때 한 source 만 지워도 canonical 은 보존.
- `CanonicalMergeProposal.canonicalA/BId` FK 는 반대로 Cascade.

**Settlement 관계 핵심**:
- `SettlementSession → SettlementRound → SettlementItem` / `→ SettlementRoundAttendee` Cascade 체인 — 세션 삭제 시 모든 차수와 그 안의 items/attendees 가 같이 삭제.
- `SettlementSession → SettlementParticipant` Cascade — 마스터 참여자 명단.
- `SettlementParticipant → SettlementRoundAttendee` Cascade — 마스터에서 참여자가 삭제되면 모든 차수 attendee 행도 같이 정리.
- `User → SettlementSession` / `→ SettlementContact` / `→ SettlementDraft` 모두 Cascade — 회원 탈퇴 시 정산/단골/임시저장 모두 같이 삭제.
- `SettlementParticipant → SettlementContact` 는 **SetNull** — 단골을 삭제해도 과거 정산의 참여자 행은 남고 `contactId` 만 null 로 끊긴다 (이력 보존).
- `SettlementSession.shareToken @unique` — null 인 행이 여러 개여도 unique 제약 위반 아님 (SQLite 기준), 토큰 발급된 한 행만 토큰으로 O(1) 조회 가능.
- `SettlementDraft.placeIdKey` — `''` sentinel 로 NULL 회피. `(userId, placeIdKey) @@unique` 가 강제하는 1:1 슬롯 가정이 깨지지 않게.

**`Restaurant.source` 분기**: `naver` (`sourceId == placeId`) / `diningcode` (`sourceId = vRid`, `placeId = null`) / `catchtable` (검증 단계). cross-source unique = `(source, sourceId)`.

캐스케이드 체인:
- `Restaurant → VisitorReview → ReviewSummary → MenuMention/ReviewTag`, `Restaurant → MenuCanonical → GlobalMenuCanonicalLink` (모두 Cascade).
- `Restaurant → CanonicalRestaurant` Restrict.
- `CanonicalRestaurant → CanonicalMergeProposal` Cascade.
- `User → SettlementSession → SettlementParticipant` Cascade.
- `User → SettlementSession → SettlementRound → SettlementItem` Cascade.
- `User → SettlementSession → SettlementRound → SettlementRoundAttendee` Cascade (+ `SettlementParticipant → SettlementRoundAttendee` Cascade).
- `User → SettlementContact` Cascade, `SettlementContact → SettlementParticipant` SetNull.
- `User → SettlementDraft` Cascade.

**SQLite Cascade 가 실제 동작하려면 `PRAGMA foreign_keys=ON` 이 필수** — [plugins/prisma.ts](../../apps/friendly/src/plugins/prisma.ts) 가 부팅마다 켠다. 끄면 ON DELETE CASCADE 가 silent 무시되어 orphan 자식 행이 남는다.

마이그레이션 (최근순, 총 **69개** — 2026-08-21~27 에 14개 추가):

| 마이그레이션 | 날짜 | 내용 |
| --- | --- | --- |
| `20260827222827_add_life_hospital` | 2026-08-27(커밋 `4fd6e22` 08-30) | `life_hospitals` + `(lat,lng)` 인덱스 |
| `20260824040000_food_allergen_evidence_status` | 2026-08-24 | `food_items.allergenStatus`(default 'unknown') + `(allergenStatus,active)` 인덱스 |
| `20260823220000_meal_photo_deletion_outbox` | 2026-08-23 | `meal_photo_deletions`(FK 없음) |
| `20260823210000_meal_backup_restore` | 2026-08-23 | `meal_data_imports`(`(userId,archiveId)` unique) |
| `20260823190000_meal_safety_events_lineage` | 2026-08-23 | `meal_recommendation_events` · `meal_daily_quotas` · `food_source_observations` · `food_merge_conflicts` 4테이블 + `meal_preferences.allergensJson` · `food_items.allergensJson/allergenEvidenceJson` · `meal_entries.photoPurgedAt` · `meal_items.servings/portionSource/recognitionDishId/selectedCandidateRank/…` 계보 컬럼 |
| `20260823180000_add_meal_disliked_foods` | 2026-08-23 | `meal_preferences.dislikedFoodsJson` |
| `20260823170000_add_meal_photo_user_fk` | 2026-08-23 | `meal_photos` RedefineTables — `userId` 직접 보유 + User FK(고아 정리·소유 검증) |
| `20260823160000_add_meal_recommendation_origin` | 2026-08-23 | `meal_entries.originRecommendationId` + 인덱스 |
| `20260823000000_add_meal_item_nutrition` | 2026-08-23 | `meal_items.kcal/proteinG/sodiumMg/nutritionFrom` 영양 스냅샷 |
| `20260822150205_add_food_nutrition_from` | 2026-08-22 | `food_items.nutritionFrom`(같은 계열에서 빌린 영양의 출처) |
| `20260822113321_add_meal_log` | 2026-08-22 | `meal_entries` · `meal_items` · `meal_photos` · `meal_preferences` · `meal_recommendations` 5테이블 |
| `20260822105913_add_food_catalog` | 2026-08-22 | `food_items`(`nameNorm` unique) · `food_import_configs` · `food_import_runs` |
| `20260821130000_add_life_map` | 2026-08-21 | `life_cctvs` · `life_toilets` · `life_geocode_caches` · `life_master_syncs` + `(lat,lng)` 인덱스 |
| `20260821060230_add_air_user_location` | 2026-08-21 | `air_user_locations`(userId PK) |

이전 마이그레이션(유지):
- **`20260624034309_add_cluster_corpus_size`** — **(NEW 2026-06-25)** `ReviewCluster.corpusSize` (자동 재군집 게이트용)
- **`20260624014823_add_review_clustering`** — **(NEW 2026-06-25)** `ReviewCluster` 테이블 + `ReviewSummary.clusterId`(SetNull, `@@index`). 상세 [review-clustering 토픽](./review-clustering.md)
- **`20260621220422_add_review_search_enrichment`** — **(NEW 2026-06-25)** `ReviewSummary` enrichment 컬럼(embeddingJson/aspectsJson/contextLine/enrichVersion). 상세 [review-search 토픽](./review-search.md)
- **`20260619235551_add_random_crawl_timeout_action`** — **(NEW 2026-06-25)** `RandomCrawlConfig.timeoutAction`('skip'/'random')
- **`20260619091932_add_telegram_config`** — **(NEW 2026-06-25)** `TelegramConfig` 테이블(단일 행). 상세 [telegram 토픽](./telegram.md)
- **`20260619075115_add_random_crawl`** — **(NEW 2026-06-25)** `RandomCrawlConfig` + `RandomCrawlRun` 2종. 상세 [random-crawl 토픽](./random-crawl.md)
- **`20260612181456_add_operation_log_job_index`** — **(NEW 2026-06-25)** `OperationLog.@@index([jobId, createdAt])`(레거시 잡 로그 조회 풀스캔 방지)
- **`20260612164108_add_operation_logs`** — **(NEW 2026-06-25)** `OperationRun` + `OperationLog` + `OperationReport` + `LogConfig` 4종. CrawlJobLog 일반화. 상세 [logs 토픽](./logs.md)
- **`20260610011757_add_settlement_group_splits`** — **(NEW 2026-06)** `SettlementRound.groupSplits` JSON 컬럼
- **`20260601120000_add_share_og_image_url`** — **(2026-06-01)** `SettlementSession.shareOgImageUrl` 컬럼
- **`20260601090100_add_share_og_image`** — **(2026-06-01)** `SettlementSession.shareOgImage` 컬럼
- **`20260529215653_add_settlement_share_expiry`** — **(2026-05-30)** `SettlementSession.shareExpiresAt` 컬럼
- **`20260605135918_add_schedule_tables`** — **(2026-06-06)** `ScheduleConfig` (`schedule_configs`, `jobType @unique`) + `ScheduleRun` (`schedule_runs`, `@@index([jobType, startedAt])`) 2종. FK 없음.
- **`20260525235559_add_settlement_drafts`** — **(2026-05-28)** `SettlementDraft` 테이블 (`(userId, placeIdKey)` 복합 unique, placeIdKey default `''`)
- **`20260525220309_add_settlement_round_category_adjustments`** — **(NEW 2026-05-28)** `SettlementRound.categoryAdjustments` JSON 컬럼
- **`20260525110000_add_settlement_round_discount`** — **(NEW 2026-05-28)** `SettlementRound.discountAmount/discountCategory` 컬럼
- **`20260525100000_add_settlement_rounds`** — **(NEW 2026-05-28)** `SettlementRound` + `SettlementRoundAttendee` (테이블명 `settlement_round_participants`) 추가. `settlement_items.sessionId → roundId` redefine + `settlement_sessions` 의 차수 단위 컬럼 제거 + `grandTotal` 신설. 기존 세션은 round 1개로 자동 백필 (`round.id = session.id` 규약).
- **`20260524112443_add_settlement_edited_at`** — **(2026-05-25)** `SettlementSession.editedAt` 컬럼
- **`20260524000000_add_settlement_contacts`** — **(2026-05-25)** `SettlementContact` 테이블 + `SettlementParticipant.contactId` FK(SetNull) 컬럼
- **`20260523030833_add_settlement_share_token`** — **(2026-05-25)** `SettlementSession.shareToken @unique` 컬럼
- **`20260523012752_add_settlement_models`** — **(2026-05-25)** `SettlementSession` + `SettlementItem` + `SettlementParticipant` 테이블 (3종)
- **`20260523010655_pnpm_filter_friendly_test_src_modules_ai`** — **(2026-05-25)** `LlmProviderConfig` 테이블 재정의: `purpose` 컬럼 default `'chat'` 추가 + `(provider, purpose) @@unique` 로 unique 키 교체. 기존 행은 chat 으로 백필.
- `20260518014530_add_crawl_job_log` — `CrawlJobLog` 테이블
- `20260515104718_add_canonical_merge_proposals` — `CanonicalMergeProposal` 테이블
- `20260515100910_add_canonical_suggestion_dismissed` — `CanonicalRestaurant.suggestionDismissedAt`
- `20260515083303_add_canonical_restaurant` — `CanonicalRestaurant` + Restaurant.canonicalId 백필
- `20260515063258_add_restaurant_source_split` — Restaurant.source/sourceId + unique 키
- `20260508173216_add_map_provider_configs` — `MapProviderConfig`
- `20260509_add_global_menu_category_path` — `GlobalMenuCanonical.categoryPath`
- `20260509_add_global_menu_canonicals` — `GlobalMenuCanonical` + Link
- `20260509_add_menu_canonicals` — `MenuCanonical`
- `20260509_add_analytics_tables` — `MenuMention` + `ReviewTag`
- `20260508122321_add_visitor_review_videos` — `videosJson`
- `20260508095207_add_review_analysis_fields`
- `20260506205226_add_restaurant_review_summary`
- `20260506191413_add_llm_provider_config`

디스크 영속:
- `apps/friendly/data/dev.db` — SQLite DB 파일 (Prisma CLI + 서버 + vitest 가 모두 같은 파일 가리킴)
- `apps/friendly/data/thumbs/<sha1>.jpg` — media 모듈 썸네일 캐시
- `apps/friendly/data/receipts/<uuid>.jpg` — settlement-extraction 이 업로드받은 영수증 원본 보관 (split 호출 시에도 원본 1장만 저장, 슬라이스는 메모리에서만 만들어 LLM 에 전달)
- **`apps/friendly/data/panorama/<placeId>.jpg` — (NEW 2026-06-25)** 네이버 파노라마 대표이미지 사본. 크롤 시점에 휘발성 HMAC URL 을 1회 받아 영구 저장(`panorama-cache.ts`), `media/panorama/:placeId` 가 서빙. TTL 만료에 면역.
- `apps/friendly/assets/fonts/IBMPlexSansKR-{Regular,Bold}.ttf` — **(2026-06-01)** 정산표 PNG 렌더(satori) 용 한글 폰트. tsx/tsup 양쪽에서 `fontCandidates()` 가 위로-탐색해 로드, 프로세스당 1회 캐시. 빌드 산출물에 함께 배포돼야 prod 렌더가 동작.
- `apps/friendly/src/modules/random-crawl/data/regions.json` — **(NEW 2026-06-25)** 시도/시군구 사전(빌드 스크립트 산출). `region-derive.ts` 와 random-crawl 이 정적 import(esbuild 인라인·dedup).
- **`apps/friendly/data/meal-photos/<userId>/<token>.jpg` + `<token>_t.jpg` — (NEW 2026-08-22)** 식단 사진 원본(1600px JPEG 정규화)과 썸네일. 사용자별 디렉터리라 소유 검증이 경로에도 반영. 테스트는 `os.tmpdir()/lifepickr-test-meal-photos`. 고아·미추적 파일은 `plugins/meal.ts` GC(매일 04:30)가 정리 — `data/thumbs`·`data/receipts` 와 달리 **만료 로직이 있다**.
- **`apps/friendly/data/meal-recognition-debug/` — (NEW 2026-08-22)** `MEAL_RECOGNITION_DEBUG=1` 일 때만 쌓이는 인식 품질 덤프(식별자는 HMAC 해시, TTL 168h, RAW 는 별도 플래그). `eval:meal-recognition` 이 읽고 GC 가 `sweepMealRecognitionDebugDumps` 로 만료.
- **`data/open/{food,life,eval}/` (리포 루트, gitignore) — (NEW 2026-08-22 `809b7e0`)** 적재기 입력 원본 표준 위치 — `food/mfds-nutrition.csv`(6.9MB)·`food/hansik-800.xlsx`·`life/cctv.csv`(79MB, CP949)·`life/toilet.csv`(16MB)·`eval/meal-photos/`(AI Hub 평가셋 150클래스×5장). 로더가 인자 없이 이 경로를 기본으로 찾는다. 보관 규약은 [docs/data-sources.md](../../docs/data-sources.md).
- **`apps/friendly/src/modules/life-map/data/life-geocode-cache.json.gz` — (NEW 2026-08-21, 추적 파일)** 화장실/병의원 주소 지오코딩 캐시의 gzip 내보내기(`export:life-geocode`). 운영 DB 가 별도라 dev.db 를 복사할 수 없어, git pull 뒤 `import:life-geocode` → `load:life-toilets --offline` 으로 업스트림 호출 0건 적재하기 위한 결정(2026-08-21). 1일차 79%(일일 한도)까지 반영.
- **`apps/friendly/data/{airkorea,kma,kma-apihub,hira}-probe/` (gitignore)** — `probe:airkorea`/`probe:kma`/`probe:kma-apihub`/`probe:hira` 가 실응답 원문을 덤프하는 위치(픽스처 후보).

또한 `SettlementSession` 에 OG 이미지 선택 컬럼 2종이 추가됐다 — **`shareOgImage`** (`'restaurant'|'table'|null`, 기본 동작 `restaurant`) + **`shareOgImageUrl`** (owner 가 갤러리에서 고른 특정 사진 URL, null=시드 랜덤). 둘 다 공유 다이얼로그(POST `/settlements/:id/share`)에서 갱신, 공개 read-only 응답에서는 노출 안 함. (스키마 SSOT 는 [api-contract 토픽](./api-contract.md) / [settlement 토픽](./settlement.md).)

JWT payload: `{ userId: string; email: string; role: 'USER' | 'ADMIN' }`.

환경 변수 — [src/config/env.ts](../../apps/friendly/src/config/env.ts) 의 `EnvSchema` (zod):

| 키                            | 기본값               | 비고                                                                |
| ----------------------------- | -------------------- | ------------------------------------------------------------------- |
| `NODE_ENV`                    | `development`        |                                                                     |
| `PORT`                        | `3000`               |                                                                     |
| `HOST`                        | `0.0.0.0`            |                                                                     |
| `DATABASE_URL`                | (필수)               | **`.env.example` 기준 `file:../data/dev.db`** — Prisma cwd 와 서버 cwd 양쪽에서 같은 `apps/friendly/data/dev.db` 를 가리킨다 |
| `JWT_SECRET`                  | (필수)               | min 32 chars                                                        |
| `JWT_EXPIRES_IN`              | `7d`                 |                                                                     |
| `CORS_ORIGIN`                 | `*`                  |                                                                     |
| `LOG_LEVEL`                   | `info`               |                                                                     |
| `OLLAMA_CLOUD_API_KEY`        | `''`                 | DB 의 `LlmProviderConfig.apiKey` 가 비어있을 때 fallback. **purpose='chat' 한정** |
| `OLLAMA_CLOUD_BASE_URL`       | `https://ollama.com` |                                                                     |
| `OLLAMA_CLOUD_TIMEOUT_MS`     | `60000`              |                                                                     |
| `OLLAMA_CLOUD_MAX_CONCURRENT` | `15`                 |                                                                     |
| `OLLAMA_DEFAULT_MODEL`        | `''`                 | purpose='chat' fallback 모델. 비우면 chat 은 model 명시받아야 함 |
| `OLLAMA_IMAGE_MODEL`          | `''`                 | **(2026-06)** purpose='image'(vision/영수증) fallback 모델. 비우면 DB row 만 |
| `OLLAMA_LOG_ANALYSIS_MODEL`   | `''`                 | **(NEW 2026-06-25)** purpose='log-analysis'(logs 실패 run 분석) fallback 모델 |
| `TELEGRAM_BOT_TOKEN`          | `''`                 | **(NEW 2026-06-25)** @BotFather 봇 토큰. `TelegramConfig`(DB) 가 우선, 비면 env. 둘 다 비면 텔레그램 비활성 → random-crawl 후보 못 보냄 |
| `TELEGRAM_CHAT_ID`            | `''`                 | **(NEW 2026-06-25)** 후보 받을 chat id(개인/그룹). DB 우선 |
| `VWORLD_API_KEY`              | `''`                 | **(NEW 2026-06-25)** vworld JS/WMTS 키 fallback(`MapProviderConfig` DB 우선). 브라우저 노출 자원이라 보안 등급 차 없음 |
| `VWORLD_DOMAINS`              | `''`                 | **(NEW 2026-06-25)** 허용 도메인 메모(콤마). 런타임 미사용 — 표시·기록용 |
| `PUBLIC_ORIGIN`               | `https://ninelife.kr` | **(NEW 2026-06-25)** SEO canonical/OG URL 생성 origin. Cloudflare/nginx Host 변형에 안 흔들리게 운영 도메인 고정. `/r/:placeId`·sitemap 이 사용 |
| `APP_TEAM_ID`                 | `''`                 | **(2026-05-28)** Apple Developer Team ID (10자). AASA `appIDs = "${teamId}.${bundleId}"`. 비면 AASA 라우트 404 |
| `APP_BUNDLE_ID`               | `'com.niney.lifepickr'` | **(NEW 2026-05-28)** iOS bundle id. apps/mobile 의 `ios.bundleIdentifier` 와 동일해야 함 |
| `ANDROID_APP_PACKAGE`         | `'com.niney.lifepickr'` | **(NEW 2026-05-28)** 안드로이드 package. apps/mobile 의 `android.package` 와 동일해야 함 |
| `ANDROID_SHA256_FINGERPRINTS` | `''`                 | **(NEW 2026-05-28)** 콤마 구분 SHA-256 지문 (대문자 16진수, 콜론 구분 64자). debug/release 둘 다 권장. 비면 assetlinks.json 라우트 404 |
| `WEB_INDEX_PATH`              | (optional)           | **(NEW 2026-06-01)** 정산 공유 OG 미리보기가 `<head>` 주입할 빌드된 웹 `index.html` 경로. 미설정 시 `__dirname`/`cwd` 에서 위로 탐색해 `apps/web/dist/index.html` 등 후보 자동 발견 |
| `OG_IMAGE_PATH`              | `/og-default.png`    | **(NEW 2026-06-01)** OG 기본(폴백) 이미지. 만료/없는 토큰일 때 og:image 로 쓰는 same-origin path(또는 절대 URL). `http` 로 시작하면 그대로, 아니면 origin prefix |
| `BUS_API_KEY`                 | `''`                 | **(2026-07-06)** 서울시 버스 API 키 — data.go.kr 발급. **(2026-08-21~)** 아래 data.go.kr 4키의 공통 폴백 원천 |
| `AIRKOREA_API_KEY`            | `''`                 | **(NEW 2026-08-21)** 에어코리아 대기오염정보(15073861)·측정소정보(15073877). 비면 `BUS_API_KEY` 폴백(라우트), 둘 다 비면 `/air/*` 503. 개발계정 일 500건 — 서버 캐시(측정 10분·예보 20~60분·측정소 24h)로 보호 |
| `KMA_API_KEY`                 | `''`                 | **(NEW 2026-08-21)** 기상청 단기예보(15084084)·중기예보(15059468). 비면 `BUS_API_KEY` 폴백, 둘 다 비면 `/weather/*` 503. 일 10,000건 — 발표 시각 단위 캐시. meal-recommendation 도 같은 체인으로 `WeatherService` 생성 |
| `KMA_APIHUB_KEY`              | `''`                 | **(NEW 2026-08-21)** 기상청 API허브(apihub.kma.go.kr) 키 — data.go.kr 와 **별개 발급, 폴백 없음**. 비면 `/weather/aws` 가 `enabled=false` 200(선택 보강) |
| `HIRA_API_KEY`                | `''`                 | **(NEW 2026-08-30)** 심평원 병원정보서비스(15001698). 비면 `BUS_API_KEY` 폴백. **요청 경로 없음** — `load:life-hospitals`/`probe:hira` 만 사용(전량 ~80콜, 일 10,000건) |
| `FOOD_API_KEY`                | `''`                 | **(NEW 2026-08-22)** 식약처 영양성분 표준데이터(15100070) API — **선택**. `data/open/food/mfds-nutrition.csv` 가 있으면 파일이 우선(쿼터 0). 비면 `BUS_API_KEY` 폴백이지만 활용신청 없는 키는 `30 등록되지 않은 서비스키` |
| `FOOD_RECIPE_API_KEY`         | `''`                 | **(NEW 2026-08-22)** 식품안전나라 OpenAPI(COOKRCP01 레시피). 적재 잡/CLI 만. 비면 그 소스만 오류 기록·건너뜀 |
| `MAFRA_API_KEY`               | `''`                 | **(NEW 2026-08-22)** data.mafra.go.kr 레시피 기본/재료(선택) |
| `OLLAMA_MEAL_PHOTO_MODEL`     | `''`                 | **(NEW 2026-08-22)** purpose='meal-photo'(식단 사진 vision) fallback 모델. `.env.example` 기본 `gemma4:31b`(2026-08-23 실측 근거). 비면 사진 인식 skip |
| `OLLAMA_MEAL_RECOMMEND_MODEL` | `''`                 | **(NEW 2026-08-22)** purpose='meal-recommend'(텍스트 추천) fallback 모델. 비면 LLM 추천 skip(점수 폴백) |
| `MEAL_RECOGNIZE_DAILY_LIMIT`  | `30`                 | **(NEW 2026-08-22)** per-user 일일 사진 인식 LLM 호출 한도(Asia/Seoul). `0` = 무제한. **SQLite `meal_daily_quotas` 영속**(env.ts 주석의 "인메모리" 는 낡음) |
| `MEAL_RECOMMEND_DAILY_LIMIT`  | `20`                 | **(NEW 2026-08-22)** per-user 일일 추천 LLM 호출 한도. 캐시 히트(`profileHash`)는 소비 안 함 |
| `MEAL_RECOGNITION_DEBUG` / `_RAW` / `_ALLOW_PRODUCTION_RAW` / `_TTL_HOURS` | `0`/`0`/`0`/`168` | **(NEW 2026-08-24, `.env.example` 만)** env.ts 스키마 밖 — `meal-recognition-debug.store.ts` 가 `process.env` 를 직접 읽는다. 운영에서 RAW 를 남기려면 `ALLOW_PRODUCTION_RAW` 도 명시 |

스크립트 (`apps/friendly/scripts/`):
- `promote-admin.ts` — 첫 ADMIN 승격 (`pnpm --filter friendly promote-admin`)
- **`backfill-contacts.ts` — (NEW 2026-05-25)** 기존 `SettlementParticipant` 들을 `(userId, normalizedKey)` 로 그룹화해 `SettlementContact` 를 만들고 `participant.contactId` 를 채우는 1회 멱등 마이그레이션. `session.createdAt asc + participant.orderIndex asc` 순회로 최신 정산의 exclude* 가 `lastExclude*` 로 남도록 보장. 실행: `pnpm --filter friendly backfill:contacts`.
- `dev-capture-visitor.ts` / `dev-fetch-visitor-html.ts` / `dev-open-visitor-page.ts` / `dev-capture-catchtable.ts` — crawl 디버그 도구.
- **`eval-extraction.ts` / `probe-extraction.ts` / `probe-vision.ts` — (NEW 2026-06-01)** 영수증 OCR(vision) 추출 평가·프로브 도구. `probe-vision.ts` 는 같은 영수증 이미지(`data/receipts/<token>.jpg`)로 (1) 현재 설정 재현 (2) numCtx 확대 (3) format 제거 (4) `format='json'` (5) 단순 프롬프트 다섯 변주를 돌려 raw 응답을 그대로 출력 — vision 추출이 빈 items 를 내는 원인을 provider 레벨에서 가린다. `AiConfigService.getResolved('ollama-cloud', 'image')` + `adapterCache` + settlement-extraction 의 prompts 를 직접 import. 실행: `pnpm --filter friendly probe:vision -- <token>` / `eval:extraction` / `probe:extraction`.
- **`probe-merge.ts` / `run-global-merge.ts` — (NEW 2026-06-06)** 글로벌 머지 프로브/수동 실행 도구(`probe:merge` / `run-merge`). analytics 의 `runGlobalMerge` 를 CLI 에서 직접 돌려 스케줄러 파이프라인의 머지 단계를 단독 디버그. 상세는 [analytics 토픽](./analytics.md).
- **`build-regions.mjs` — (NEW 2026-06-25)** 시도/시군구 사전(`random-crawl/data/regions.json`) 생성 스크립트. `region-derive.ts`(지역 통계)와 random-crawl 이 import 하는 정적 데이터의 원천 — 정적 import 라야 esbuild 가 번들에 인라인한다.
- **2026-08-21~30 신규 19종** (`package.json` scripts, 전부 `tsx --env-file=.env`):

| 스크립트 | 파일 | 용도 |
| --- | --- | --- |
| `load:life-cctv <csv> [--dry-run]` | [load-life-cctv.ts](../../apps/friendly/scripts/load-life-cctv.ts) | localdata.go.kr CCTV CSV(CP949) → `LifeCctv` 전량 교체(실측 377,278행 → 좌표 이상 35행 제외) |
| `load:life-toilets <csv> [--offline\|--max-calls=N\|--concurrency=N\|--pause=N\|--retry-notfound]` | [load-life-toilets.ts](../../apps/friendly/scripts/load-life-toilets.ts) | 화장실 CSV → VWorld 지오코딩(캐시 우선) → `LifeToilet` 전량 교체. `--offline` = 캐시만(운영 배포 경로) |
| `load:life-hospitals [--offline\|--max-pages=N\|…]` | [load-life-hospitals.ts](../../apps/friendly/scripts/load-life-hospitals.ts) | 심평원 API 전량 페이징(1000행×~80콜) → 좌표 결측만 지오코딩 → `LifeHospital` 전량 교체 |
| `export:life-geocode [경로]` / `import:life-geocode [경로] [--overwrite]` | [export-life-geocode.ts](../../apps/friendly/scripts/export-life-geocode.ts) · [import-life-geocode.ts](../../apps/friendly/scripts/import-life-geocode.ts) | `LifeGeocodeCache` ↔ 저장소 압축본(`life-geocode-cache.json.gz`). import 기본은 "없는 키만 추가" |
| `status:life-map` / `status:food-catalog` | [life-map-status.ts](../../apps/friendly/scripts/life-map-status.ts) · [food-catalog-status.ts](../../apps/friendly/scripts/food-catalog-status.ts) | deploy.sh 가 파싱하는 한 줄 상태 `ok cctv=N toilet=M geocoded=G hospital=H cache=C` / `ok items=N classified=C nutrition=U meals=M`(테이블 없으면 `missing`) |
| `load:food-catalog [--source=…] [--file=…] [--dry-run] [--classify] [--backfill-nutrition]` | [load-food-catalog.ts](../../apps/friendly/scripts/load-food-catalog.ts) | 어드민 적재 잡과 같은 `FoodImportService` 로 카탈로그 적재 — 인자 없으면 `data/open/food/` 배포 파일(CSV/XLSX) 기반 전체 재적재(쿼터 0) |
| `backfill:food-allergens [--dry-run]` | [backfill-food-allergens.ts](../../apps/friendly/scripts/backfill-food-allergens.ts) | 재료 문자열 → 19종 알레르겐 규칙 재계산(verified 행은 안 덮음) |
| `backfill:meal-nutrition [--dry-run] [--refresh]` | [backfill-meal-nutrition.ts](../../apps/friendly/scripts/backfill-meal-nutrition.ts) | 이미 저장된 `MealItem` 의 빈 영양 스냅샷 채움(원칙상 스냅샷 불변, `--refresh` 는 명시 재계산) |
| `seed:meal-samples <userId> [--yes] [--undo]` | [seed-meal-samples.ts](../../apps/friendly/scripts/seed-meal-samples.ts) | 검증용 며칠치 식단 씨딩(`MealService.create` 경유). **`.env` DATABASE_URL 을 그대로 쓰므로 prod.db 엔 `--yes` 필수**(`037a4f2` 안전장치) |
| `probe:food-api [--source=…]` | [probe-food-api.ts](../../apps/friendly/scripts/probe-food-api.ts) | 영양/레시피/MAFRA 실응답 필드·건수 확인(콘솔만) |
| `probe:meal-vision [--dir\|--models\|--limit\|--label-from-filename]` | [probe-meal-vision.ts](../../apps/friendly/scripts/probe-meal-vision.ts) | 같은 사진을 여러 vision 모델에 돌려 top-1 채점 — `gemma4:31b` 기본 모델 결정 근거(`36fe7da`). 표본은 목록 전체에 고르게(`5a84b63` 편향 수정) |
| `probe:meal-e2e <사진dir>` | [probe-meal-e2e.ts](../../apps/friendly/scripts/probe-meal-e2e.ts) | 업로드→인식→통계→추천→백업/복원→보존까지 `app.inject()` 전 구간. **prod.db 거부, dev.db 도 `--allow-shared-db` 필요** — 사본 DB 로 실행 |
| `eval:meal-recognition [--dir\|--labels\|--require-raw]` | [eval-meal-recognition.ts](../../apps/friendly/scripts/eval-meal-recognition.ts) | 디버그 덤프 호출 성공률 집계(개인정보 보호형 — 음식명은 RAW 덤프에서만) |
| `probe:airkorea` / `probe:kma [--nx --ny --ta --land --sea]` / `probe:kma-apihub` / `probe:hira` | [probe-airkorea-api.ts](../../apps/friendly/scripts/probe-airkorea-api.ts) · [probe-kma-api.ts](../../apps/friendly/scripts/probe-kma-api.ts) · [probe-kma-apihub.ts](../../apps/friendly/scripts/probe-kma-apihub.ts) · [probe-hira-api.ts](../../apps/friendly/scripts/probe-hira-api.ts) | 키 승인 상태(인증 30/20 vs 정상)·응답 형식·쿼터 소모 확인 + 원문 덤프. env.ts 전체 검증을 거치지 않고 키만 직접 읽는다(DATABASE_URL 불필요). `probe:kma-apihub` 실측(2026-08-21): 존재 경로는 `url/stn_inf.php`·`cgi-bin/url/nph-aws2_min`·`url/awsh.php`·`url/kma_sfctm2.php`, `url/kma_aws2.php` 는 404 |

- `research/review-search/probe-*.ts` 10종 + `probe-{extraction,vision,merge,tabling,tabling-bulk,tabling-promote}.ts`·`run-global-merge.ts` — **(2026-08-22 `cc8399a`)** 각자 들고 있던 `buildEnvBlock` 리터럴을 `buildLlmProviderEnv()` import 로 교체(동작 불변).

## Key Decisions [coverage: high — 54 sources]

- **2026-08-30: 병의원은 CSV 대신 API 전량 적재 — 키가 있어도 요청 경로는 없다** — 심평원 병원정보서비스는 배포 CSV 가 없어 `load:life-hospitals` 가 1000행 × ~80콜로 전량 페이징 후 `LifeHospital` 을 전량 교체한다. `HIRA_API_KEY` 는 스크립트·프로브만 읽고 서버 라우트는 로컬 테이블만 본다 — 공개 `/life-map/*` 가 업스트림 쿼터 0 인 원칙(일상지도 = 로컬 적재)을 유지. 좌표는 업스트림 XPos/YPos 우선, 결측 소수만 지오코딩(배포는 예측성을 위해 `--offline`).
- **2026-08-23: 배포가 데이터 적재를 자동 점검 — 코드 배포와 데이터 갱신 분리** — `deploy.sh` 가 API 케이스(1,2,4)마다 `status:life-map`/`status:food-catalog` 한 줄을 파싱해 비어 있으면 첫 적재, 지오코딩 압축본이 이번 pull 로 바뀌면 `import:life-geocode` + 화장실 `--offline` 재적재. 통째 갱신은 케이스 6/7. 상태 파싱에 실패하면 "0건" 으로 넘겨짚지 않는다(잘못 재적재하면 LLM 분류를 통째로 다시 돈다). 상세 [project-overview](project-overview.md).
- **2026-08-22: data.go.kr 키는 `BUS_API_KEY` 단일 폴백 체인 — DB 설정 없음(env-only)** — 대기(AIRKOREA)·날씨(KMA)·병의원(HIRA)·영양(FOOD) 4키가 비면 전부 `BUS_API_KEY`. 이유: data.go.kr 는 계정당 키 1개고 데이터셋별 활용신청만 추가하면 같은 키가 통하므로 키를 네 번 복사하는 대신 "전용 키가 있으면 그것, 없으면 계정 키". bus 와 같은 **env-only** — [db-config-env-fallback](../concepts/db-config-env-fallback.md)(vworld/telegram/LLM 의 DB 우선 + 어드민 화면)과 달리 설정 UI 가 없다: 서버 전용 키라 브라우저 노출·회전 빈도가 낮아 `.env` + 재기동으로 충분하고, 네 도메인이 한 계정 키를 공유하는 구조상 DB 행을 도메인마다 두면 오히려 어긋난다. 함정은 활용신청 누락(Gotchas).
- **2026-08-22: LLM env 조립은 한 함수(`buildLlmProviderEnv`)** — purpose 를 2종 더하면서 26개 파일의 `buildEnvBlock` 리터럴을 전부 고쳐야 했던 것이 계기. `AiConfigService` 인스턴스는 여전히 plugin/라우트마다 독립(autoload 순서 회피 관례 유지) — 공유하는 것은 "env 를 읽는 방법" 뿐. `ALL_PURPOSES` 도 계약 enum `.options` 로 — 용도 추가 = 계약 1곳 + env 키 1곳 + 이 함수 1곳.
- **2026-08-22: 식단 일일 한도는 SQLite 카운터, rate-limit 은 연타 억제만** — 사용자 트리거 LLM 호출(인식/추천)은 계정 동시성 게이트만으론 비용이 안 막힌다. `MealDailyQuota` 를 `INSERT … ON CONFLICT DO UPDATE … WHERE count < limit` 한 문장으로 확인+증가해 동시 요청도 한도를 못 넘기고 재시작에도 유지. 분당 `RATE.mealRecognize/mealRecommend` 는 2차 방어. bus 의 인메모리 쿼터 게이트([in-memory-singleton-gates](../concepts/in-memory-singleton-gates.md))와 달리 **영속**이 요구된 첫 사례 — 대상이 "우리 쿼터" 가 아니라 "사용자별 비용" 이라 재시작으로 리셋되면 안 된다. friendly 관점의 **4층 비용 방어**: ① per-IP 분당 `RATE.*`(rate-limit 플러그인) → ② per-user 일일 SQLite quota(`MealDailyQuota`) → ③ purpose 동시성 게이트(`adapter-cache` 의 `provider|purpose` 어댑터 `maxConcurrent`) → ④ 계정(API 키) 공유 게이트 — 앞 층이 사용자 행동을, 뒤 층이 업스트림 동시성을 막는다.
- **2026-08-22: 적재 파서는 의존성 0 자체 구현, 스트리밍 없음** — csv-parse/xlsx 패키지 대신 [lib/csv.ts](../../apps/friendly/src/lib/csv.ts)·[lib/xlsx.ts](../../apps/friendly/src/lib/xlsx.ts). 적재 스크립트 전용(요청 경로 아님)이라 79MB 도 단일 문자열로 충분하고 XLSX 는 sharedStrings + sheet1 조합만 필요. 대용량·ZIP64 가 필요하면 CSV 로 받는 것이 규약.
- **2026-08-22: DB 를 갈아엎는 테스트는 예외 없이 `useIsolatedDatabase`** — analytics `runGlobalMerge` 블록만 격리를 안 써 운영 스냅샷의 머지 결과를 지웠다(`517e465`). 삭제 범위를 좁히는 대신 격리를 택한 이유: 전량 삭제가 그 테스트의 전제(청크 캐시가 비어야 mock 호출 순서가 맞는다). 격리로 옮기자 시드 4개로는 pass2 입력이 pass1 청크와 같아 청크 캐시(`model|schemaHash|variants`)가 히트하는 새 함정이 드러나 채움 8개(`GLOBAL_MERGE_CHUNK_SIZE=10` 초과 → pass1 2청크)로 픽스처를 고쳤다. 규칙은 [docs/data-sources.md](../../docs/data-sources.md) 에 명문화.
- **2026-08-22: 추론 모델의 사고를 끈다(`@repo/utils thinkOptionForModel`)** — JSON 만 받으면 되는 5개 호출(글로벌 머지·영수증 추출·음식 분류·식단 인식·추천)에서 qwen3.5 계열이 사고에 출력 토큰을 써 `items` 가 비거나 청크 처리량이 떨어졌다. 모델별 옵션 결정은 utils 한 곳(gpt-oss 는 끌 수 없어 최저 레벨). 머지 캐시 키(model+variants)는 그대로라 기존 청크 캐시 유지.
- **2026-08-21: 공공 API 프록시는 bus 의 어댑터 패턴을 재사용하되 캐시는 인메모리 TTL + stale** — 대기/날씨는 정류소처럼 "사실상 정적" 이 아니라 시간 단위로 바뀌므로 DB 30일 캐시 대신 **서비스 인메모리 TTL**(대기 측정 10분/예보 20~60분/측정소 24h, 날씨는 발표 슬롯까지, AWS 2분) + 업스트림 실패 시 `stale=true` last-known(허용 상한 3h~7d). 라우트는 502(업스트림)와 503(키·활용신청·쿼터 = 우리 설정)을 어댑터 에러 클래스(`AirKoreaApiAuthError` 등)로 구분해 `replyUpstreamError` 로 진단 로깅. 개발계정 쿼터(대기 500/날씨 10,000)는 캐시 + 날씨 인메모리 일일 게이트(9,000)로 — [quota-proportional-loading](../concepts/quota-proportional-loading.md) 의 "반복=캐시" 층.
- **2026-08-21: 일상지도는 로컬 적재 + 뷰포트 집계 셀, 지오코딩 캐시는 리포에 커밋** — 377k 점을 브라우저에 다 보내지 않기 위한 유일한 분기가 zoom 임계(points vs cells). 화장실 원본에 좌표가 없어(표준데이터도 2025-02 부터 제외) VWorld 지오코딩이 필수인데 일 한도가 있어 `LifeGeocodeCache` 를 영구 보관하고, 운영 DB 가 별도라 결과를 `life-geocode-cache.json.gz` 로 **저장소에 커밋**해 서버는 호출 0건으로 적재한다(dev.db 복사 불가 → 압축본 결정, 2026-08-21). 적재 골격은 bus/subway 마스터의 계보 — [life-map-master.service.ts](../../apps/friendly/src/modules/life-map/life-map-master.service.ts) 헤더가 `bus-master.service` 를 지목("정규화는 순수 함수 + 사유별 drop 리포트, 쓰기는 별도 함수"), `LifeMasterSync` 는 `BusMasterSync`/subway MasterSync 와 같은 이력 테이블, **미적재면 503 + 적재 명령 안내**(`life-map.service.ts` — "지하철 마스터와 같은 규약") — "전량 교체 적재 + `*MasterSync` 이력 게이트 + 미적재 503" 3종 세트가 bus·subway·life-map(+food 카탈로그) 공통 패턴([open-data-master-load](../concepts/open-data-master-load.md)).
- **2026-08-21: 내 대기 위치는 좌표만 저장, 측정소 해석은 조회 시** — `AirUserLocation` 1행(userId PK, PUT 덮어쓰기). 가까운 측정소를 저장하면 측정소 신설·폐지에 stale 해지므로 매 조회 계산(측정소 목록이 24h 캐시라 비용 0). 게스트는 클라이언트 persist — [guest-server-hybrid](../concepts/guest-server-hybrid.md) 의 "로컬 절반" 변형.
- **2026-08-17: 관리자 검색은 메타 선필터(메모리) + 집계는 SQL, 후보매칭은 전역** — 검색을 SQL LIKE 로 하지 않고 canonical 단위 문자열을 토큰 AND 매칭한 이유는 통합 행(형제 source 포함)이 검색 단위라서. 집계는 반대로 SQL 로 내렸다(`$queryRaw` GROUP BY, 500 IN 배치) — ReviewSummary 전량 로드가 응답 시간의 본체였다. `candidateCount`/`suggestion` 은 검색과 무관하게 전역 canonical 기준 — 검색으로 좁혔다고 병합 후보 수가 달라지면 안 된다.
- **2026-08-17: 공개 리뷰 정렬은 방문일 desc(해석 불가 시 fetchedAt desc) — 2026-05-31 결정 정정** — "저장 순서 = 최신순" 전제는 최초 크롤에서만 참이고 update 모드로 뒤늦게 수집된 새 리뷰는 fetchedAt 이 커서 끝에 붙었다. 정렬 키를 데이터(방문일)로 옮기고 연도 없는 `M.D.요일` 은 수집 시각의 KST 연도로 복원(`@repo/utils reviewDate`). 웹·앱·SEO 메타가 같은 비교 함수를 쓴다.
- **2026-08-17: 리뷰 pager 는 리뷰 섹션 스코프 + getVisitorReviews 응답만, 부분 완료는 명시** — 전역 텍스트 매칭(`더보기` last)과 "아무 GraphQL 응답" 대기가 DOM 변화에 조용히 깨졌으므로 구조적 스코프(섹션 → pager shell → 정확한 이름)와 `postData` 검사로 바꾸고, 종료 사유(`VisitorPaginationResult.reason` 8종)를 훅으로 통지해 `complete=false` 를 warn + run meta 로 남긴다 — "조용한 누락" 을 "관측 가능한 부분 완료" 로.
- **18차(2026-06): 신규 도메인은 자체 토픽 — friendly 는 wiring 만** — review-search/review-clustering/random-crawl/telegram/logs 다섯 도메인이 친 친구가 아니라 각자 자체 위키 토픽으로 분리됐다. friendly 문서는 plugin 데코·부팅 훅·DB 모델 소유·라우트 prefix 존재만 흡수하고 알고리즘/상태기계는 위임 — 한 토픽이 비대해지지 않게.
- **18차(2026-06): plugin-singleton 자체 AiConfig 패턴이 logs/random-crawl/summaries 로 확산** — autoload 알파벳순 의존을 피하려 `plugins/schedule.ts` 가 도입한 "자체 `AiConfigService` 생성" 관례를 `plugins/logs.ts`(`'logs' < 'summaries'`)·`plugins/random-crawl.ts`·`plugins/summaries.ts` 가 모두 따른다. 모든 plugin 이 `app.aiConfig`(summaries 가 가장 늦게 decorate)에 의존하면 로드 순서가 깨지므로, 같은 env 로 독립 인스턴스를 만드는 게 결합도가 낮다. 단, **operationLog/jobRegistry 같은 공유가 필수인 것은 모듈 singleton 또는 `dependencies` 로 강제**한다(`'logs' < 'random-crawl'/'schedule'/'summaries'` 라 operationLog 는 재사용 가능).
- **18차(2026-06): JobLogService 퇴역 → OperationLogService 단일 진입점** — 크롤+요약 전용이던 `CrawlJobLog`/`JobLogService` 를 모든 기능(크롤/요약/정규화/머지/정산추출/스케줄/random-crawl)이 쓰는 `OperationRun`/`OperationLog` 로 일반화. SSE seq 가 단일 카운터여야 클라이언트 `(jobId, seq)` dedup 이 로그를 안 드롭하므로 인스턴스가 하나여야 한다. `crawlLogs` 라우트는 `operation_logs` 를 읽되 feature/jobId/level 필터로 레거시 `CrawlJobLogEntry` 계약(jobId non-null, level 3종)을 보존 — 다른 feature 로그 혼입 차단. 실패 run 은 `LogAnalysisService` 가 LLM 으로 분석(OperationReport). 상세는 [logs 토픽](./logs.md).
- **18차(2026-06): 맛집 SEO 도 정산 OG 와 같은 SSR-lite — 풀 SSR 회피** — 순수 Vite SPA 라 OG/검색 크롤러가 빈 미리보기를 본다. 정산 share-preview 가 쓰던 "`index.html` `<head>` 메타 주입 + 후보 탐색 + `cachedIndex`" 패턴을 맛집 상세 `/r/:placeId` 에 그대로 적용하고 추가로 JSON-LD + `<noscript>` SEO 본문(h1/대표사진/대표메뉴)까지 inject. SPA 를 SSR 로 바꾸지 않고 최소 표면으로 검색·공유를 해결. origin 은 `PUBLIC_ORIGIN` 고정(Host 변형 비의존), `/sitemap.xml`·`/robots.txt` 도 같은 등록 함수가 제공.
- **18차(2026-06): 파노라마 대표이미지는 휘발성 URL 사본화로 고침** — 네이버 파노라마 썸네일은 HMAC+TTL 서명 URL 이라 DB 에 저장하면 하루쯤 뒤 403/503 으로 og:image·대표이미지가 깨진다. 서명을 우리가 갱신할 수 없으므로 `isVolatileNaverPhoto` 로 식별해 **크롤 시점(아직 TTL 안)에 사본을 `data/panorama/<placeId>.jpg` 로 영구 저장**하고 same-origin 사본 URL 을 가리키게 한다 — 만료 면역. media `thumbnail` 프록시(외부 URL 전용)와 달리 사본은 우리 자산이라 프록시·url() 검증을 건너뛴다(프록시로 감싸면 og:image 가 400).
- **18차(2026-06): enrich/QA/군집은 canonical 멤버 집합으로 — 공개 융합과 동일 소스 규칙** — 공개 리뷰 탭은 naver+diningcode+tabling(partner) 을 융합하는데 enrich/군집이 단일 `restaurantId` 만 보면 "탭엔 보이는데 검색·군집엔 빠지는" 불일치가 난다. `canonical-members.ts` 가 공개 융합과 동일 규칙으로 멤버를 모으고 `primaryId`(placeId 보유 네이버 행)를 대표 키로 통일.
- **18차(2026-06): 지역 통계는 즉석 파생 — 시/구 분리 컬럼 도입 안 함** — `Restaurant` 는 주소를 단일 문자열로만 저장. 정규화 컬럼을 추가하는 대신 `deriveRegion` 이 주소-사전 매칭 → 좌표 최근접 폴백으로 즉석 산출. 사전(`regions.json`)은 빌드 스크립트로 생성·정적 import(esbuild 인라인). 분류 정확도가 사전·주소 표기에 의존하지만, 스키마/마이그레이션 없이 통계를 얹는 단순함을 택함.
- **17차(2026-06): 주기 스케줄러는 in-process croner — no-Redis** — 정규화→글로벌 머지를 야간 배치로 자동화하면서 외부 큐/스케줄러(BullMQ+Redis 등)를 들이지 않았다. CLAUDE.md no-Redis + 단일 인스턴스 전제라 `croner` 의 in-process `Cron` 하나로 충분. cron 타이머·overlap·진행상태는 `scheduleRegistry`(모듈 singleton, 동시 1개 inflight), 설정/이력은 DB 2테이블. 분산 환경으로 가면 이 가정이 깨진다(다중 인스턴스가 각자 cron tick → 중복 실행) — 그땐 리더 선출/외부 스케줄러 필요. 식당별 정규화·글로벌 머지가 멱등이라 재실행/중단 후 재개가 안전한 게 이 단순함을 떠받친다.
- **17차(2026-06): schedule plugin 이 자체 `AiConfigService` 생성 — autoload 순서 회피** — `plugins/schedule.ts` 는 `app.aiConfig`(summaries plugin 이 decorate)를 재사용하지 않고 자기 `AiConfigService`/`MenuGroupingService`/`AnalyticsService` 를 직접 만든다. `@fastify/autoload` 가 plugin 파일을 **알파벳순**으로 로드해 `'schedule' < 'summaries'` — schedule 이 먼저 잡힐 때 `app.aiConfig` 가 아직 없어 참조하면 undefined. plugin 순서를 강제하느니(취약) 자체 인스턴스를 만드는 게 결합도가 낮다. 두 인스턴스가 같은 env 설정을 쓰므로 동작은 동일.
- **17차(2026-06): cron tick 은 fire-and-forget + overlap skip** — croner 콜백은 즉시 반환하고 실제 작업은 `runScheduled` 가 백그라운드로 돈다. 이전 주기가 안 끝났는데 다음 tick(또는 manual)이 오면 `beginRun` 이 null 을 돌려 `skipped` run 한 행만 남기고 끝낸다 — 시스템 전체 작업이라 중첩 의미가 없고, 멱등이라 다음 주기에 마저 처리. `forceCloseConnections:'idle'` 과 unref 된 croner 타이머로 graceful shutdown 이 매달리지 않게.
- **Zod = 단일 진실 (SSOT)** — 라우트 스키마는 모두 `@repo/api-contract`. `fastify-type-provider-zod`가 런타임 검증 + TS 타입 추론 + OpenAPI 자동 생성.
- **autoload 두 단계** — `plugins/`는 무조건 전부, `modules/`는 `*.route.ts` 파일만.
- **모듈 레이아웃** — CLAUDE.md 규칙대로 모듈마다 `*.route.ts` + `*.service.ts` + `*.test.ts` 트리오.
- **공개 라우트는 별도 라우트로 분리, 응답 스키마도 다르게** — restaurant 의 `publicList/publicByPlaceId/publicInsights/ranking`, settings 의 `publicConfig`, **settlement 의 `/share/settlements/:token`** 모두 admin/owner 라우트와 path 자체가 다르고 service 메소드도 별개.
- **공개 list 의 메모리 파싱 + bbox 필터** — snapshotJson 안의 좌표/사진/도로명을 SQL where 로 못 거름 → 메모리 파싱.
- **restaurant.list canonical 정렬은 메모리에서** — 정렬 키(만족도/긍정/부정비율) 가 sources 합산이라 DB SQL 로 못 빼므로 모든 canonical 의 메타·집계·후보매칭을 계산한 뒤 메모리 정렬·slice. < 1k canonical 가정.
- **cross-source 가게는 `Restaurant` 다행 + `CanonicalRestaurant` 1행 패턴**.
- **`(source, sourceId)` 가 cross-source unique 키** — 공개 라우트 호환을 위해 `placeId @unique` (nullable) 도 그대로 유지.
- **`Restaurant.canonicalId` FK 가 Cascade 아님 (Restrict) — 의도된 trap**.
- **자동 매칭은 큐만 적재, 머지는 사람이 확정** (단, Naver→DC 한정 자동 머지).
- **(A,B) 쌍 정규화 (A<B cuid 사전순)**.
- **bigram Jaccard + Haversine 200m 선형 감쇠**.
- **`PRAGMA foreign_keys=ON` 부팅 강제** — SQLite 의 기본 OFF 상태에선 Prisma 스키마의 `onDelete: Cascade` 가 silent 무시되어 자식 행이 orphan 으로 남는다. `plugins/prisma.ts` 가 `$executeRawUnsafe('PRAGMA foreign_keys = ON')` 으로 매 연결 켠다 (SQLite 는 connection-scoped). WAL + busy_timeout 30s 와 묶음 — Prisma 의 "Transaction not found" 가 SQLITE_BUSY 에서 비롯되는 케이스 차단.
- **DB 경로는 `apps/friendly/data/dev.db` 한 곳** — `.env.example` 의 `DATABASE_URL=file:../data/dev.db` 가 Prisma CLI cwd (`apps/friendly/prisma/`) 와 서버 cwd (`apps/friendly/`) 양쪽 모두에서 같은 파일을 가리키도록 설계. 마이그레이션이 `prisma/dev.db` 를 만들고 서버는 `data/dev.db` 를 보는 분기 사고를 막는다. vitest 도 같은 `.env` 를 수동 로드해 동일 DB.
- **vitest `fileParallelism: false` (직렬 실행)** — 단일 `dev.db` 를 공유하면서 한 테스트가 `restaurant.deleteMany` 로 cascade 삭제 중일 때 다른 파일의 read 가 중간 상태를 잡아 "Field review is required ... got null" 단속 오류가 발생한다. 격리 DB 인스턴스를 따로 안 쓰는 한 직렬화가 가장 단순하고 안정적. + `deps.inline: [/^@repo\//, '@fastify/autoload']` 로 autoload 의 dynamic import 가 vite 의 `extensionAlias` 를 타도록.
- **LLM provider × purpose 분리** — `LlmProviderConfig` 의 unique 가 `(provider, purpose)`. chat 과 image 가 서로 다른 model/concurrency/baseUrl 을 가질 수 있다. `AiConfigService.getResolved(provider, purpose)` 가 모든 호출처에서 명시적이고, `adapter-cache` 키도 `provider|purpose` prefix 포함이라 두 어댑터가 독립 게이트. **env fallback 은 chat 만** — image 는 환경변수로 묶기 어려운 다른 vendor/model 인 경우가 많아 DB row 가 명시적으로 등록되어야 동작.
- **multipart 한도는 영수증 한 장 (5MB)** — `plugins/multipart.ts` 의 `fileSize: 5 * 1024 * 1024 + files: 1 + fields: 5`. 한도 초과 시 fastify-multipart 가 자동 413. 다른 multipart 소비자가 생기면 한도/필드 수 상향은 같은 플러그인에서.
- **영수증 jpg 는 `data/receipts/<uuid>.jpg` 디스크 보관** — DB 에는 토큰 (`SettlementSession.receiptImageToken`) 만 저장. media 모듈의 `data/thumbs/` 와 같은 사상.
- **단골 자동 적립 — `(userId, normalizedKey)` upsert** — 정산 저장 시 `settlement.service` 가 모든 participant 를 `SettlementContact` 에 upsert 하고 `participant.contactId` 를 채운다 (FK SetNull). 자동완성 / 다중 선택 모달 / `/me/contacts` 모두 같은 테이블. `normalizedKey = lower(trim(name))|lower(trim(nickname))` — 사용자가 같은 이름을 다른 대소문자/공백으로 다시 쳐도 같은 row 로 매칭.
- **공유 토큰은 32바이트 base64url + unique 인덱스** — `SettlementSession.shareToken` 이 null 일 땐 비공개, owner 가 POST `/settlements/:id/share` 로 멱등 발급 / DELETE 로 회수. 토큰 자체가 추측 불가능해 인증 없이 `/share/settlements/:token` 으로 O(1) read-only 조회 가능. 토큰 발급/회수는 `updatedAt` 을 갱신하지만 `editedAt` 은 건드리지 않아 '수정됨' 배지가 오해 없이 동작.
- **차수(round) 모델 vs 단일 세션 (2026-05-28)** — 한 세션 = 한 식당 가정을 깨고 `SettlementSession → SettlementRound → (items / attendees)` 로 한 단계 깊어졌다. 차수별 식당/영수증/할인/카테고리 보정을 독립적으로 운용. `SettlementParticipant` 는 마스터 명단으로 남기고, 차수 참석/제외는 `SettlementRoundAttendee` 가 override. `participant.shareAmount` 는 모든 차수 합산 스냅샷, `roundAttendee.shareAmount` 는 차수 분담 스냅샷. 분배 계산은 `calculateMultiRoundShares` 가 모든 차수를 순회해 두 스냅샷을 함께 채운다.
- **PUT `/:id` 전체 replace vs 이전 PATCH `/:id/participants`** — 차수 추가/삭제, 참여자 명단 변경, items 수정 등 부분 갱신의 race / consistency 문제를 회피. 클라이언트가 전체 draft 를 보내면 서버가 단일 트랜잭션에서 deleteMany 후 재삽입. 코드 경로가 `create` 와 거의 같아 round/attendee 백필 로직이 한 곳.
- **자동 임시저장 — `(userId, placeIdKey)` upsert + 본저장 트랜잭션 안 정리** — `placeIdKey` 가 `''` sentinel 인 이유는 SQLite 의 NULL unique 가 다중 NULL 을 distinct 취급하기 때문 — 식당 미지정 슬롯이 무한정 늘어나는 걸 막고 user 당 정확히 1슬롯 강제. 본저장 시 `CreateSettlementInput.fromDraftId` 에 draft id 를 실어 보내면 settlement.service 의 같은 tx 에서 `SettlementDraftService.deleteByIdInTxIfOwner(tx, userId, fromDraftId)` 가 호출 — id 가 없거나 권한 없으면 silent skip (정산 저장 자체는 반드시 성공해야 하므로 throw 하지 않음).
- **영수증 분할 추출 — 클라이언트가 split 좌표 결정** — sharp 가 좌→우 N 등분 + index 슬라이스만 vision LLM 에 보낸다. 같은 imageToken 을 N 번 호출해 N 차 items 를 각각 얻는 방식이라 LLM 호출도 N 번. 한 번에 추출하지 않는 이유는 영수증마다 메뉴 카탈로그/할인 정책이 달라 컨텍스트 윈도우 안에서 충돌 위험.
- **`.well-known` 동적 응답 + 비어있을 때 404** — 정적 파일 대신 라우트로 만들어 env 변경만으로 즉시 반영 + 잘못된 빈 JSON 으로 검증 실패하는 사고 회피. iOS/Android 가 검증 파일 부재 (404) 면 검증 실패로 폴백(브라우저 오픈) — 빈 200 JSON 보다 명확.
- **dev CORS 전면 반사 허용 — production 미적용 (2026-05-31 갱신)** — dev 는 origin 화이트리스트를 폐기하고 모든 origin 을 반사(`cb(null,true)`). 화이트리스트(RFC1918 거부)는 개발 머신 IP 가 공인/사설/VPN/WSL 로 수시로 바뀌어 무의미했고, 무엇보다 거부(`cb(Error)`)가 로그인 같은 **preflight(OPTIONS) 요청을 통째로 깨뜨려** 로그인 자체가 막혔다. 이제 RFC1918 regex 는 "예상된 LAN origin" 분류용 — 비-LAN origin 만 origin 당 1회 warn 로 가시화. production 은 env `CORS_ORIGIN` list 로 엄격 차단(dev 분기 자체가 없음)이라 보안 영향 0.
- **(2026-08-17 에 정정됨 — 위 "공개 리뷰 정렬은 방문일 desc" 결정 참조. 아래는 당시 결정의 기록) 공개 리뷰 정렬은 `fetchedAt asc` = 최신순 (2026-05-31 fix)** — 크롤러가 네이버 최신순으로 받아 저장하므로 저장 순서(`fetchedAt asc`)가 곧 최신순이다. `assemblePublicReviews` 의 최종 정렬이 `desc` 였어서 `sort=recent` 가 가장 오래된 리뷰를 맨 위로 내보내던 버그를 `asc` 로 교정. web 토픽의 "fetchedAt-asc" 정책과 같은 방향.
- **정산 공유 OG 는 풀 SSR 이 아니라 head 메타만 주입 (SSR-lite)** — 웹은 순수 Vite SPA 라 OG 크롤러가 JS 없이 긁으면 미리보기가 빈칸. 그렇다고 정산 페이지를 SSR 로 바꾸면 React 트리·라우터·인증을 서버에서 또 돌려야 한다. 대신 빌드된 `index.html` 의 `<head>` 에만 OG/twitter 메타를 문자열 치환으로 주입(`<title>` 교체 + `</head>` 앞 삽입)하고 그 외는 nginx 정적 서빙 그대로 — 크롤러는 메타를 보고 사람은 같은 HTML 위에서 SPA 부팅. 가장 작은 표면으로 OG 만 해결. index.html 은 배포마다 해시 자산명이 바뀌므로 경로를 후보 탐색 + 프로세스 수명 캐시(`cachedIndex`), 못 찾으면 시도 경로 전부 로그.
- **정산표 PNG 는 satori+resvg 로 서버 렌더, 분담은 동일 calculator 재사용** — 카카오톡에 '이미지로' 바로 보내려면 정산표를 PNG 로 줘야 한다. 웹/앱 캡처가 아니라 서버에서 `@repo/api-contract` 의 `calculateMultiRoundShares` 를 그대로 호출해 화면 `useMatrix` 와 픽셀 단위로 동일한 매트릭스를 satori(VDOM→SVG)+resvg(SVG→PNG)로 렌더 — 플랫폼 무관 단일 URL, 받는 사람은 로그인/클릭 없이 본다. 한글은 satori 가 system 폰트를 못 써 IBM Plex Sans KR ttf 를 번들·명시 주입. 폭에 따라 1/1.5/2x 스케일로 PNG 크기 억제.
- **og:image 는 토큰 시드 결정적 랜덤 (식당 사진 기본)** — `og:image` 기본을 정산 식당 사진으로 두면 참가자 이름이 크롤러 캐시에 박제되지 않는다(정산표 PNG 는 이름 노출 — owner 가 `table` 모드를 명시 선택했을 때만). 어느 사진을 고를지는 `seedFromToken(token)` 으로 결정 — 같은 공유 링크는 매번 같은 사진을 골라 카카오 OG 캐시와 일관(매 크롤마다 안 바뀜). owner 가 갤러리에서 특정 사진(`shareOgImageUrl`)을 고르면 그게 후보에 살아 있는 한 우선. `restaurant`/`table`/특정 1장 3-state 를 `shareOgImage` enum + `shareOgImageUrl` 두 컬럼으로 표현.
- **OG/갤러리 사진은 `getPhotoUrls` 경량 조회 — 리뷰 코퍼스 미로드** — 정산 OG/갤러리는 식당 사진 URL 만 필요한데 `getPublicDetail` 은 visitorReviews/summary 수백 행을 로드한다. `getPhotoUrls(placeId)` 가 `snapshotJson` 만 select + `mergePhotos` 재사용으로 같은 사진 배열을 산출 — 코퍼스 로드 제거. OG 크롤러 반복 펼침은 `getSharePreviewMeta` 의 `(token, origin)` 5분 in-memory 캐시로 추가 흡수(성공 결과만, owner share 변경 시 invalidate).
- **`ALLOWED_HOSTS` 단일 화이트리스트 — media + OG 공유** — thumbnail 프록시의 SSRF 가드(`ALLOWED_HOSTS`)를 media 모듈이 export 하고, 정산 OG 의 `isThumbnailProxyable` 이 같은 Set 을 재사용. 프록시 가능 호스트 정의가 한 곳 — OG 이미지 후보를 "어차피 프록시가 거부할 호스트" 로 채우는 사고 방지 + 화이트리스트 확장 시 양쪽 자동 반영.
- **friendly ESLint 합류 — 기존 위반은 warn 우선** — `eslint.config.mjs` 가 `@repo/config/eslint/node` 기반. 스크래핑 어댑터·dev 스크립트의 잔존 룰 위반을 error 로 막으면 도입 자체가 불가하니 `no-useless-assignment`/`no-useless-escape`/`prefer-const`/`consistent-type-imports` 를 warn 으로 내려 점진 정리. `prisma/migrations/**` 은 ignore. 이로써 turbo lint 가 web/friendly/api-contract/mobile 4/4 green.
- **`contentHashOf` 구분자는 유니코드 이스케이프 (NUL 금지)** — 해시 필드 구분자를 소스에 실제 NUL(`0x00`) 로 박으면 git/ripgrep 이 파일을 바이너리로 취급해 diff 가 `Binary files differ` 로만 떠 리뷰 불가. 런타임 charCode 동일한 이스케이프 시퀀스로 치환하면 **해시값은 그대로**(기존 `contentHash` 와 일치 — dedup 영향 0) 면서 파일이 순수 텍스트가 된다. 해시 구분자에 제어문자를 쓸 땐 항상 이스케이프로.
- **`models/preview` 라우트 — 저장 전 키 검증** — 어드민이 새 provider key 를 입력하는 도중 그 키로 모델 list 를 받아 select 에서 모델을 고른 뒤 row 를 저장. 키 → 모델 → 저장 순서가 가능해 잘못된 키나 잘못된 모델 id 로 row 가 생성되는 사고 방지.
- **vworld 키는 LlmProviderConfig 와 같은 DB-backed 패턴이지만 env fallback 없음**.
- **vworld secret 라우트는 평문 reveal**, **vworld `publicConfig` 는 admin secret 과 보안 등급이 동등**.
- **JWT `?token=` 쿼리 + 로그 redaction**.
- **Multiplexed Summary SSE + canonicalId 구독**.
- **요약 이벤트 두 종류** — `progress`/`review`.
- **리뷰 dedup = externalId + contentHash 이중 키**.
- **1 review = 1 ReviewSummary** — `reviewId @unique`.
- **Summary placeId-level 직렬화 + 어댑터 공유 FIFO 게이트**.
- **부팅 시 stale 요약 행 정리 + 자동 재큐잉**.
- **`ReviewSummary.status` enum 6종 — 단계별 의미 분리**.
- **SummaryService 는 app 전역 singleton (`plugins/summaries.ts`)**.
- **CrawlJobLog 시스템 — 한 진입점 / 세 채널 / `(jobId, seq)` dedup**.
- **canonical 그룹 detail = response-time fusion**.
- **`MAX_CONCURRENT_PER_ACTOR = 5`**.
- **리뷰 단위 자동 재시도 3회**.
- **`ANALYSIS_VERSION = 4`**.
- **Ollama structured output + numCtx=4096**.
- **`extractFirstJsonObject` / `normalizeTerm` 공유 export**.
- **분석 정규화 테이블 도입 동기** — 글로벌 통계용 GROUP BY 가능 행 단위 필요.
- **Summary는 fire-and-forget + 공유 FIFO 게이트**.
- **Media는 디스크 캐시 + sharp**.
- **No Docker / No Redis** — CLAUDE.md 규칙.
- **dev = `tsx watch`, prod = `tsup` 번들** — `target: node22`, ESM.
- **Vitest는 `extensionAlias` + 수동 .env 로드 + 직렬 실행**.

## Gotchas [coverage: high — 38 sources]

- **테스트는 `.env` 의 `DATABASE_URL`(= 운영 스냅샷 prod.db)을 그대로 쓴다 — DB 를 갈아엎는 테스트는 반드시 `useIsolatedDatabase()`** — `517e465` 에서 analytics `runGlobalMerge` 블록의 `afterEach` 가 `GlobalMenuCanonical`·`GlobalMergeChunkCache` 를 전량 비워 `pnpm --filter friendly test` 한 번에 5,446 그룹 + 링크 22,303 + 청크 캐시가 사라졌고 LLM 1,352콜로 재머지했다. 현재 격리 사용 파일 12개: analytics · restaurant · food(import.service/merge-conflict/recognition-quality.route/route) · life-map · meal(daily-quota.service/data.route/route) · meal-recognition.service · meal-recommendation. 새 테스트가 `deleteMany` 전량 정리를 하면 이 목록에 들어가야 한다. `seed:meal-samples`(`--yes`)·`probe:meal-e2e`(prod.db 거부) 도 같은 이유로 가드가 있다. 헬퍼의 동작([temp-db.ts](../../apps/friendly/src/test-utils/temp-db.ts)): `data/dev.db` 를 `os.tmpdir()/friendly-testdb-*/test.db` 로 복사 → `PRAGMA foreign_keys=OFF` 후 `_prisma_migrations` 를 제외한 전 테이블 `DELETE` → `process.env.DATABASE_URL` 스왑, `restore()` 가 원복 + 임시 파일 삭제(`fileParallelism:false` 가 전제). **함정: 복사 원본이 `.env` 의 DB 가 아니라 `../../data/dev.db` 경로 하드코딩** — `.env` 가 prod.db 를 가리키는 환경에서 dev.db 의 마이그레이션이 뒤처져 있으면 격리 테스트만 스키마 불일치로 깨진다(`migrate dev` 를 dev.db 에도 돌려야 함).
- **data.go.kr 폴백 키의 "활용신청 없음" 은 503 인증 30 으로 온다 — 키가 틀린 게 아니다** — `AIRKOREA/KMA/HIRA/FOOD_API_KEY` 를 비워 `BUS_API_KEY` 로 폴백해도 그 데이터셋에 활용신청이 없으면 게이트웨이 `30 등록되지 않은 서비스키`. 승인 직후엔 게이트웨이 반영까지 수십 분. `probe:airkorea`/`probe:kma`/`probe:hira`/`probe:food-api` 로 판별. live 스모크([airkorea-api.live.test.ts](../../apps/friendly/src/modules/air-quality/airkorea-api.live.test.ts))는 키 없음·미승인·게이트웨이 불안정을 전부 `skip` 하므로 green 이 승인을 뜻하지 않는다.
- **`KMA_APIHUB_KEY` 는 data.go.kr 키가 아니고 폴백도 없다** — API허브에서 따로 발급·API 별 활용신청(미신청 403 "활용신청이 필요한 API 입니다" → 503). 키 자체가 비면 `/weather/aws` 가 200 `enabled=false` 로 조용히 보강을 끄므로 "AWS 값이 안 보인다" 는 오류가 아니라 키 부재일 수 있다.
- **`plugins/food-import.ts` 의 `dependencies:['prisma','logs']` 는 필수** — 알파벳순 `'food-import' < 'logs' < 'prisma'` 라 선언이 빠지면 `app.prisma`·`app.operationLog` 둘 다 undefined 로 부팅이 깨진다(logs 플러그인과 같은 함정). `app.aiConfig` 는 summaries 가 나중에 decorate 하므로 재사용 불가 — `buildLlmProviderEnv()` 로 자체 생성이 의도.
- **`plugins/meal.ts` GC cron 은 `scheduleRegistry` 를 공유한다** — jobType `meal-photo-gc` 가 `normalize-merge`/`random-crawl`/`food-import` 와 같은 레지스트리에 산다. `stopAllCrons()` 가 전부 정지하고 `onClose` 가 `clearCron` 한다. jobType 문자열이 겹치면 다른 cron 을 덮어쓴다 — 새 주기작업은 고유 키. GC 는 부팅 직후에도 1회 돌므로 테스트 부팅이 `tmpdir` 스토리지를 쓰는 것이 리포 `data/meal-photos` 보호의 전부.
- **env.ts 의 `MEAL_*_DAILY_LIMIT` 주석 "인메모리 카운터" 는 낡았다** — 실제 구현은 SQLite `meal_daily_quotas`([meal-daily-quota.service.ts](../../apps/friendly/src/modules/meal/meal-daily-quota.service.ts), `.env.example` 주석이 맞다). `0` 은 기능 차단이 아니라 **한도 비활성**.
- **`MEAL_RECOGNITION_DEBUG*` 4종은 `env.ts` 스키마에 없다** — `meal-recognition-debug.store.ts` 가 `process.env` 를 직접 읽어 부팅 검증·타입이 없다. 운영에서 원문(RAW)을 남기려면 `MEAL_RECOGNITION_DEBUG_ALLOW_PRODUCTION_RAW=1` 까지 켜야 하고, 기본 덤프는 식별자 HMAC 해시(비밀은 `JWT_SECRET`)만이라 `eval:meal-recognition` 이 음식명 지표를 못 낸다(`--require-raw`).
- **HIRA·FOOD·RECIPE·MAFRA 키는 서버 요청 경로에서 읽히지 않는다** — 적재 잡/CLI 만 쓴다. 어드민 적재 잡은 `plugins/food-import.ts` 가 부팅 시 주입한 값을 쓰므로 `.env` 변경 = 재기동. `KMA_API_KEY` 만은 라우트 2곳(weather + meal-recommendation)이 각자 `WeatherService` 를 만든다 — 아래 항목 참조.
- **`WeatherService` 가 두 인스턴스 — 플러그인 싱글턴 규율의 예외, 캐시·일일 쿼터 카운터가 분리된다** — [weather.route.ts](../../apps/friendly/src/modules/weather/weather.route.ts) 와 [meal-recommendation.route.ts](../../apps/friendly/src/modules/meal-recommendation/meal-recommendation.route.ts) 가 각각 `new WeatherService({ serviceKey: env.KMA_API_KEY || env.BUS_API_KEY })` 를 만든다(app-singleton decorate 없음). 발표 슬롯 캐시가 인스턴스별이라 추천 쪽 `getNowcast` 는 날씨 페이지 캐시를 못 쓰고, 무엇보다 **인메모리 일일 쿼터 게이트(`weather.service.ts` `this.quota`, `DEFAULT_DAILY_UPSTREAM_LIMIT=9000`)가 인스턴스마다 따로 센다** — 두 카운터 합이 개발계정 한도(일 10,000)를 넘을 수 있다. 추천은 사용자당 일 20회·같은 격자면 캐시 히트라 실사용에선 미미하지만, 날씨를 세 번째 소비자가 또 `new` 하면 게이트가 무력화되는 구조 — 공유가 필요해지면 `plugins/` app-singleton 으로 승격(summaries/schedule 관례).
- **관리자 검색은 매 요청 전체 Restaurant 메타를 로드한다** — 검색이 DB LIKE 가 아니라 메모리 토큰 매칭이라 `q` 가 있어도 `restaurant.findMany`(메타만) 는 전량. < 1k canonical 가정이 그대로 상한. 미일치면 집계 SQL 0회가 대신 보장된다.
- **`$queryRaw` 집계 SUM 은 `bigint` 로 올 수 있다** — Prisma/SQLite 에서 정수 SUM 이 `bigint` 로 오는 환경이 있어 `aggregateNumber()` 로 `Number()` 정규화. 같은 패턴을 복사할 때 캐스팅을 빼면 응답 직렬화가 `Do not know how to serialize a BigInt` 로 깨진다. `IN (…)` 은 500개 배치 — SQLite bind-variable 한도.
- **리뷰 방문일 정렬은 연도 없는 날짜를 수집 시각 KST 연도로 복원한다** — 네이버 `M.D.요일` 리뷰가 연말에 수집돼 연초 방문이면(또는 반대) 1년 어긋날 수 있다. `visitedAt` 파싱 불가 출처는 `fetchedAt desc` 폴백이라 같은 페이지 안에서 두 기준이 섞인다.
- **`VisitorPaginationResult.complete=false` 는 실패가 아니다** — 크롤은 `done` 으로 끝나고 warn 로그(`리뷰 페이지네이션 부분 완료`) + run meta `visitorPagination` 에만 남는다. "리뷰가 덜 들어왔다" 는 어드민 로그(`paginating_visitor` 단계)의 `button_missing`/`response_missing`/`invalid_response` 사유를 봐야 하고, 보충은 재크롤(update 모드 — SSR 10건이 전부 known 이어도 첫 wire 페이지까지는 확인한다).
- **`lib/xlsx.ts` 는 ZIP64·수십 MB·날짜 서식·수식 계산 미지원** — 한식 800선처럼 작은 배포본용. 큰 원본은 CSV 로 받아 `lib/csv.ts` 로(그것도 단일 문자열 — 스트리밍 없음, 79MB 가 실측 상한).
- **`load:life-toilets` 동시성 4 이상이면 VWorld 가 연결을 끊는다** — 기본 `--concurrency=2`·`--pause=80`, 502 가 나면 pause 를 늘린다. 일 한도 분할은 `--max-calls`, 나머지 행은 다음 실행(캐시가 이어받음). 1일차 결과가 압축본으로 커밋돼 있어 운영은 `--offline` 만.
- **일상지도 테이블은 마이그레이션 전엔 `status:life-map` 이 `missing`** — deploy.sh 가 케이스 1(마이그레이션 없음)에서 "테이블 없음 — 케이스 2/4 뒤에 적재" 로 건너뛴다. 새 레이어(병의원처럼)를 추가할 땐 마이그레이션 케이스로 배포해야 자동 적재가 돈다.
- **부팅 훅 순서 의존 — telegramConfig 가 randomCrawl 앞** — `server.ts` 의 5단계 부팅에서 `telegramConfig.bootstrap()`(토큰/chatId 확정) 가 `randomCrawl.bootstrap()`(폴러 시작) 보다 먼저여야 random-crawl 폴러가 올바른 토큰으로 시작한다. 순서를 바꾸면 폴러가 빈/구 토큰으로 떠 후보 전송이 실패한다.
- **`plugins/logs.ts` 의 `dependencies` 누락 = 부팅 깨짐** — `'logs' < 'prisma'` 알파벳순이라 `dependencies: ['prisma']` 가 없으면 logs 가 prisma 보다 먼저 로드돼 `app.prisma` 가 undefined. 마찬가지로 `summaries`/`schedule`/`random-crawl` 은 `['prisma', 'logs']` 로 operationLog 선행을 강제 — 선언을 지우면 `app.operationLog` 가 undefined 로 깨진다.
- **review-search/clustering enrich 는 요약 종료 훅 — 모든 크롤 경로에 주입돼야** — `SummaryService` 에 `reviewSearch`/`clustering` 이 주입돼야 요약 종료 후 자동 enrich·군집화가 돈다. `plugins/random-crawl.ts` 가 자체 조립한 `SummaryService` 에도 reviewSearch 를 주입하는 이유 — 빠뜨리면 그 경로(스케줄/지역랜덤/텔레그램 선택 크롤)로 만든 요약이 검색 불가 상태로 남는다. 상세는 [review-search 토픽](./review-search.md).
- **파노라마 사본은 크롤 시점에만 받힌다 — 기존 행은 백필 필요** — `panorama-cache.ts` 는 크롤 중(URL 이 TTL 안일 때)만 사본을 저장한다. 이미 DB 에 휘발성 URL 만 있고 사본이 없는 기존 행은 `media/panorama/:placeId` 가 404 → 대표이미지가 폴백된다. (백필은 재크롤 또는 별도 스크립트 — 본 라운드 10개 백필 완료.)
- **`/r/:placeId` HTML 핸들러도 빌드된 웹 `index.html` 의존** — share-preview 와 같이 `apps/web` dist 가 후보 탐색 범위 밖이면 500(`preview unavailable`). SPA 자체는 nginx 가 서빙하므로 사람은 멀쩡하지만 검색/공유 미리보기만 깨진다. 운영에선 `WEB_INDEX_PATH` 명시 권장. `cachedIndex` 는 프로세스 수명 캐시 — 웹 재배포 후 friendly reload 필요(share-preview 와 동일).
- **부팅 시 stale `running` run → `interrupted`** — `app.schedule.bootstrap()` 가 직전 인스턴스에서 `ScheduleRun.status='running'` 으로 남은 행을 `updateMany` 로 `interrupted`(+ `error='server restart'`)로 정리한다. **(2026-06-25)** `randomCrawl.bootstrap()` 도 running/crawling 고아만 `interrupted` 로 닫고 `awaiting_selection` 은 살려둔다(텔레그램 콜백이 DB 행을 찾아 이어감), `logs` 는 `sweepStaleOperationRuns` 로 고아 run 을 `failed(server_restart)` 마감. 모두 단일 인스턴스 가정의 부팅 hook 패턴.
- **autoload 알파벳순 → schedule plugin 이 `app.aiConfig` 를 못 쓴다** — `'schedule' < 'summaries'` 라 schedule plugin 이 먼저 로드되는데, `app.aiConfig` 는 summaries plugin 이 decorate 한다. 그래서 schedule plugin 은 자체 AiConfig 를 만든다(Key Decisions 참조). schedule plugin 안에서 `app.aiConfig` 를 참조하도록 "단순화" 하면 undefined 로 깨진다 — 의도된 중복.
- **croner 타이머는 `unref` — 혼자선 프로세스를 못 붙잡는다** — `scheduleRegistry.setCron` 이 `unref:true` 로 croner 를 만들어 cron 타이머만 남았을 때 이벤트 루프가 살아 프로세스가 안 죽는 일을 막는다. 반대로 cron 만으로 프로세스를 keep-alive 하려 기대하면 안 된다(listen 소켓이 살아있는 게 본체). graceful shutdown 은 `stopAllCrons` + `abortInflight` 로 명시 정리하고, croner 인스턴스는 패턴 in-place 변경을 지원 안 해 reschedule 시 stop 후 재생성.
- **schedule 은 동시 1개 — 다중 인스턴스 배포 금지 가정** — `scheduleRegistry` 의 inflight 가드와 croner 타이머가 모두 in-process 라, 같은 DB 를 보는 friendly 를 2개 이상 띄우면 각 인스턴스가 독립 cron tick 을 쏴 중복 실행 + overlap 가드가 무력화된다. no-Redis/단일 인스턴스 전제(CLAUDE.md) 위에서만 안전.
- **canonical 1:1 시작 → merge 로 N:1 로 진화**.
- **`canonicalId` FK 가 Cascade 아니라 Restrict**.
- **`CanonicalMergeProposal` 의 (A,B) 쌍은 항상 A<B 정규화**.
- **`Restaurant.source` 분기 라우팅 — 공개 표면은 네이버 전용**.
- **`Restaurant.placeId` 가 nullable** — `r.placeId!` 는 모두 `source = 'naver'` 필터와 짝.
- **lib/matching 의 임계 변경 = 큐 폭증 위험**.
- **`snapshotJson` 파손 시 좌표/사진만 null fallback**.
- **bbox NaN/length 방어**.
- **공개 list 정렬에서 null 은 항상 뒤** (`nullsLast` 헬퍼).
- **공개 detail 의 `analysis` 는 done 한정**, **mixed 카운트 누락은 의도**.
- **vworld `publicConfig` 키 미등록 시 404 → FE 가드 필요**.
- **공개 vs admin getInsights — 응답 스키마는 같지만 가드만 다르다**.
- **Windows에서 Prisma DLL lock (EPERM)**.
- **`extractFirstJsonObject` cross-module 의존성**.
- **v3 행 + v4 코드 공존** — null sentiment 는 'neutral' 로 폴백.
- **`JWT_SECRET` 32자 미만 → 부팅 실패**.
- **회원가입은 무조건 USER** — 첫 ADMIN은 `scripts/promote-admin.ts`.
- **`?token=` 마스킹은 app.ts에만 있다**.
- **DELETE restaurant ↔ in-flight crawl = 409**.
- **summary 모듈은 라우트 미노출** — restaurant 라우트가 호스팅.
- **`cleanupStaleReviewSummaries` 는 단일 인스턴스 가정**.
- **summary SSE heartbeat 는 `named heartbeat` 이벤트** (다른 SSE 는 comment).
- **`MAX_CONCURRENT_PER_ACTOR = 5` 와 auto-discover GROUP_SIZE 동일**.
- **`createMany skipDuplicates` SQLite 미지원**.
- **Ollama `num_ctx` 기본 2048 함정** — 4096 + maxTokens 1500 명시.
- **autoload는 vite resolve를 우회한다** — vitest 통합 부팅 깨지기 쉬움.
- **media `data/thumbs/` 디렉터리 누적** — 만료 로직 없음. **`data/receipts/<uuid>.jpg` 도 동일** — settlement 세션 삭제 시 jpg 파일은 그대로 남는다 (현재 GC 없음).
- **media는 public(인증 없음)** — ALLOWED_HOSTS 가 SSRF 가드 전부. **`/share/settlements/:token` 도 인증 없음** — 토큰의 추측 불가능성에 보안 전부 의존.
- **`tsx watch`는 `src/`만 감시한다**.
- **crawl 검색/다이닝코드/캐치테이블 적응형 의존**.
- **`DATABASE_URL` 의 `..` 상대 경로 함정** — Prisma CLI 와 서버 cwd 가 다르면 같은 URL 이 다른 파일을 가리킨다. `apps/friendly/.env` 의 `file:../data/dev.db` 는 prisma 디렉터리 (`apps/friendly/prisma/`) → `apps/friendly/data/dev.db` + 서버 cwd (`apps/friendly/`) → `apps/friendly/data/dev.db` 로 우연히 일치하도록 설계된 것이지, 임의의 cwd 에서 안전하지 않다. 다른 디렉터리에서 prisma 명령을 돌리면 엉뚱한 dev.db 가 생긴다.
- **SQLite `PRAGMA foreign_keys` 는 connection-scoped** — Prisma 가 연결을 새로 만들 때마다 OFF 로 돌아간다. `plugins/prisma.ts` 가 부팅 1회만 켜므로 같은 PrismaClient 인스턴스의 connection pool 안에서만 유효. dev 에서 `prisma migrate dev` 같은 외부 CLI 는 자체 연결을 쓰므로 별개.
- **`LlmProviderConfig` unique 키 변경 (2026-05-25)** — `provider @unique` → `(provider, purpose) @@unique` 로 바뀌었다. 같은 provider 의 새 row 를 추가할 땐 반드시 `purpose` 도 명시. 기존 백필은 `purpose='chat'` 으로 채워졌으므로 image purpose 카드는 어드민이 명시적으로 추가해야 노출. `getResolved` 는 인자에 `purpose` 필수.
- **env fallback 은 purpose='chat' 한정** — image purpose 는 환경변수 fallback 없음. DB row 가 없으면 settlement-extraction 의 `getResolved('ollama-cloud', 'image')` 가 null 을 돌려준다 → 추출 라우트가 503 또는 명시 에러로 떨어짐.
- **`SettlementSession.shareToken @unique` + nullable** — 토큰이 null 인 행이 여러 개여도 SQLite 의 unique 제약은 NULL 을 distinct 취급해 허용. 토큰 발급된 행만 토큰으로 검색.
- **단골 `normalizedKey` 계산은 service 전담** — 직접 SQL 로 SettlementContact 를 만들면 normalizedKey 가 어긋나 정산 저장 시 자동 적립이 새 row 를 만들어 버린다 (같은 사람이 두 행으로 분기). `settlement.service` 의 `normalizeContactKey` 함수만 거쳐야 함 — `backfill-contacts.ts` 가 같은 함수를 import 한다.
- **`backfill-contacts.ts` 정렬은 createdAt asc 필수** — `lastExcludeAlcohol/NonAlcohol/Side` 가 가장 최근 정산의 값으로 남으려면 오래된 정산부터 순회해야 한다. desc 로 돌리면 가장 오래된 exclude 값이 마지막에 덮어써 default 제안이 의도와 반대로 나옴.
- **SQLite multi-NULL unique 함정 → `placeIdKey=''` sentinel** — `SettlementDraft` 의 식당 미지정 슬롯을 `(userId, placeId NULL)` 로 두면 SQLite 가 NULL 을 distinct 취급해 동일 사용자의 미지정 슬롯이 무한정 늘어난다. 그래서 NOT NULL 컬럼 `placeIdKey` 에 `''` 를 sentinel 로 박고 service 의 `placeIdToKey()` 가 변환. 직접 prisma 호출로 draft 를 만들 때 `placeId=null` 을 그대로 넣지 말 것 — 서비스 메소드만 거치게.
- **`SettlementDraftService.deleteByIdInTxIfOwner` 는 missing/foreign 행을 swallow** — `deleteMany({ where: { id, userId } })` 로 0행 매치여도 throw 하지 않는다. 정산 본저장이 draft 정리 실패로 깨지지 않도록 의도. 반대로 draft 가 남았다고 정산이 깨지는 회귀가 없는지는 service 테스트에서 확인.
- **dev CORS 는 모든 origin 을 반사한다 (prod 와 동작이 다름)** — `isDev` 분기는 origin 검사 없이 `cb(null,true)`. 로컬에서 "CORS 가 통과하니 됐다" 고 판단하면 prod 에서 `CORS_ORIGIN` 미설정으로 깨질 수 있다 — prod 는 dev 분기가 없어 env list 만 본다. prod 에서 새 origin(앱 웹호스트 등)을 허용하려면 `CORS_ORIGIN` 에 명시 추가. dev 로그에 `CORS(dev): 비-LAN origin 반사 허용 — <origin>` warn 이 뜨면 의도한 origin 인지 한 번 확인(오설정/오접속 신호).
- **`.well-known` 라우트는 env 비면 404 (5xx 아님)** — config 누락은 서버 오류가 아니라 "검증 미설정" 의미. iOS/Android 가 200+빈 JSON 으로 검증 실패하는 것보다 404 폴백이 명확. 200 응답을 기대하고 헬스체크 거는 외부 모니터링을 well-known 에 걸지 말 것.
- **차수 마이그레이션의 backfill 규약 — `round.id = session.id`** — `20260525100000_add_settlement_rounds` 가 기존 세션을 1개 round 로 백필할 때 `round.id` 를 `session.id` 와 동일하게 설정. 이후 `settlement_items.sessionId → roundId` rename 이 추가 매핑 없이 동작. 새 코드가 round.id 와 session.id 의 동일성을 가정하면 안 된다 — backfill 규약일 뿐, 새로 만드는 세션의 round.id 는 별개 cuid.
- **PUT `/:id` 전체 replace 의 side effect — child rows 가 매번 새 id** — items / attendees / rounds 의 prisma id 가 PUT 마다 바뀐다. 클라이언트가 이전 id 를 기억해 부분 갱신을 시도하면 안 됨. 정산 store 는 본저장 응답으로 받은 fresh id 만 사용.
- **`ExtractReceiptInput.split` 의 sharp 메타데이터 누락 케이스** — 손상된 이미지여서 `metadata.width` 가 없으면 service 가 `split skipped — missing metadata` log + 원본 전체로 폴백. 클라이언트가 split 을 명시해도 LLM 이 전체 이미지를 보는 케이스가 있을 수 있다. (조용한 정확도 저하 — 디버깅 시 friendly log 확인 포인트.)
- **OG share-preview 는 빌드된 웹 `index.html` 에 의존** — `apps/web` 을 빌드하지 않았거나 dist 경로가 후보 탐색 범위 밖이면 `/share/settlements/:token` HTML 핸들러가 500(`preview unavailable`) — SPA 자체는 nginx 가 서빙하므로 사람은 멀쩡히 열리지만 **카카오/텔레그램 미리보기만 깨진다**. dev 에서 `apps/friendly` 만 띄우고 web 을 안 빌드하면 재현. 운영에선 `env.WEB_INDEX_PATH` 로 명시 지정 권장(후보 탐색 의존 제거). 실패 시 시도한 경로 전부가 `app.log.error` 에 찍힌다.
- **`cachedIndex` 는 프로세스 수명 캐시 — 웹 재배포 시 stale 위험** — share-preview 가 읽은 index.html 을 모듈 변수로 캐시한다. 웹을 재배포(해시 자산명 변경)했는데 friendly 를 재기동(pm2 reload)하지 않으면 OG HTML 이 옛 자산을 가리킨다 — `<head>` 메타만 쓰므로 미리보기엔 영향 없지만, 그 HTML 로 SPA 가 부팅되면 옛 청크를 로드할 수 있다. 웹 배포 후 friendly reload 가 정석.
- **정산표 PNG 는 IBM Plex Sans KR ttf 가 배포에 포함돼야 한다** — satori 는 system 폰트를 못 써 번들 ttf 버퍼를 명시 주입한다. `assets/fonts/IBMPlexSansKR-*.ttf` 가 prod 빌드 산출물에 함께 안 가면 `폰트를 찾지 못함` throw → `/image.png` 가 500(`render error`). tsup 번들만 옮기고 assets 를 빠뜨리는 배포 사고 주의.
- **og:image 식당 사진은 네이버 호스트(ALLOWED_HOSTS) 만** — 다이닝코드/캐치테이블 호스트 사진은 `isThumbnailProxyable` 이 false 라 OG 후보에서 빠진다. 정산 식당이 네이버 사진이 하나도 없으면 `restaurant` 모드라도 og:image 가 정산표 PNG 로 폴백한다(빈 미리보기 아님 — 의도된 폴백).
- **`SettlementSession` 의 OG 컬럼은 공개 응답에서 누락** — `shareOgImage`/`shareOgImageUrl` 은 owner 의 공유 설정이라 `getBySharedToken`/공개 스키마에 노출되지 않는다. og:image 선택 결과는 share-preview 가 서버에서 풀어 og:image URL 로만 반환.

## Sources [coverage: high — 272 sources]

신규/변경 (2026-08-17~08-30 라운드) — 백엔드 셸·wiring 관점:
- [apps/friendly/src/plugins/food-import.ts](../../apps/friendly/src/plugins/food-import.ts) — *NEW: foodImport/foodClassify decorate + 소스 키 주입 + bootstrap/shutdown*
- [apps/friendly/src/plugins/meal.ts](../../apps/friendly/src/plugins/meal.ts) — *NEW: mealPhotos decorate + 고아 사진 GC cron(meal-photo-gc)*
- [apps/friendly/src/plugins/rate-limit.ts](../../apps/friendly/src/plugins/rate-limit.ts) — *modified: RATE 8종(lifeMap/food/meal)*
- [apps/friendly/src/plugins/logs.ts](../../apps/friendly/src/plugins/logs.ts) / [random-crawl.ts](../../apps/friendly/src/plugins/random-crawl.ts) / [schedule.ts](../../apps/friendly/src/plugins/schedule.ts) / [summaries.ts](../../apps/friendly/src/plugins/summaries.ts) — *modified: buildLlmProviderEnv() 로 AiConfig 조립*
- [apps/friendly/src/server.ts](../../apps/friendly/src/server.ts) — *modified: 부팅 6단계(foodImport.bootstrap)*
- [apps/friendly/src/config/env.ts](../../apps/friendly/src/config/env.ts) — *modified: AIRKOREA/KMA/KMA_APIHUB/HIRA/FOOD/FOOD_RECIPE/MAFRA 키 + OLLAMA_MEAL_* + MEAL_*_DAILY_LIMIT*
- [apps/friendly/.env.example](../../apps/friendly/.env.example) — *modified: 신규 키 주석(활용신청·모델 실측 근거) + MEAL_RECOGNITION_DEBUG**
- [apps/friendly/package.json](../../apps/friendly/package.json) — *modified: load:/probe:/status:/backfill:/eval:/seed:/export:/import: 19 스크립트*
- [apps/friendly/src/lib/csv.ts](../../apps/friendly/src/lib/csv.ts) / [csv.test.ts](../../apps/friendly/src/lib/csv.test.ts) — *NEW: RFC 4180 파서*
- [apps/friendly/src/lib/xlsx.ts](../../apps/friendly/src/lib/xlsx.ts) / [xlsx.test.ts](../../apps/friendly/src/lib/xlsx.test.ts) — *NEW: 의존성 0 XLSX 리더*
- [apps/friendly/src/modules/ai/llm-provider-env.ts](../../apps/friendly/src/modules/ai/llm-provider-env.ts) — *NEW: buildLlmProviderEnv()*
- [apps/friendly/src/modules/ai/ai.config.service.ts](../../apps/friendly/src/modules/ai/ai.config.service.ts) / [ai.route.ts](../../apps/friendly/src/modules/ai/ai.route.ts) / [ai.config.service.test.ts](../../apps/friendly/src/modules/ai/ai.config.service.test.ts) / [adapter-cache.test.ts](../../apps/friendly/src/modules/ai/adapter-cache.test.ts) / [ai.service.test.ts](../../apps/friendly/src/modules/ai/ai.service.test.ts) — *modified: purpose 5종(ALL_PURPOSES = enum.options)*
- air-quality — [air-quality.route.ts](../../apps/friendly/src/modules/air-quality/air-quality.route.ts) · [air-location.route.ts](../../apps/friendly/src/modules/air-quality/air-location.route.ts) · [air-quality.service.ts](../../apps/friendly/src/modules/air-quality/air-quality.service.ts) · [air-location.service.ts](../../apps/friendly/src/modules/air-quality/air-location.service.ts) · [airkorea-api.adapter.ts](../../apps/friendly/src/modules/air-quality/airkorea-api.adapter.ts) · [air-quality.test.ts](../../apps/friendly/src/modules/air-quality/air-quality.test.ts) · [air-location.test.ts](../../apps/friendly/src/modules/air-quality/air-location.test.ts) · [airkorea-api.adapter.test.ts](../../apps/friendly/src/modules/air-quality/airkorea-api.adapter.test.ts) · [airkorea-api.live.test.ts](../../apps/friendly/src/modules/air-quality/airkorea-api.live.test.ts) · [__fixtures__/](../../apps/friendly/src/modules/air-quality/__fixtures__/)(10 json) — *NEW*
- weather — [weather.route.ts](../../apps/friendly/src/modules/weather/weather.route.ts) · [weather.service.ts](../../apps/friendly/src/modules/weather/weather.service.ts) · [aws.service.ts](../../apps/friendly/src/modules/weather/aws.service.ts) · [kma-api.adapter.ts](../../apps/friendly/src/modules/weather/kma-api.adapter.ts) · [kma-apihub.adapter.ts](../../apps/friendly/src/modules/weather/kma-apihub.adapter.ts) · [weather.test.ts](../../apps/friendly/src/modules/weather/weather.test.ts) · [aws.test.ts](../../apps/friendly/src/modules/weather/aws.test.ts) · [__fixtures__/](../../apps/friendly/src/modules/weather/__fixtures__/)(11 json) — *NEW*
- life-map — [life-map.route.ts](../../apps/friendly/src/modules/life-map/life-map.route.ts) · [life-map.service.ts](../../apps/friendly/src/modules/life-map/life-map.service.ts) · [life-map-search.service.ts](../../apps/friendly/src/modules/life-map/life-map-search.service.ts) · [life-map-master.service.ts](../../apps/friendly/src/modules/life-map/life-map-master.service.ts) · [life-map-hospital-master.service.ts](../../apps/friendly/src/modules/life-map/life-map-hospital-master.service.ts) · [life-map-geocode.service.ts](../../apps/friendly/src/modules/life-map/life-map-geocode.service.ts) · [life-map-geocode-cache.service.ts](../../apps/friendly/src/modules/life-map/life-map-geocode-cache.service.ts) · [vworld-search.adapter.ts](../../apps/friendly/src/modules/life-map/vworld-search.adapter.ts) · [hira-hospital.adapter.ts](../../apps/friendly/src/modules/life-map/hira-hospital.adapter.ts) · 테스트 7([life-map.test.ts](../../apps/friendly/src/modules/life-map/life-map.test.ts) · [life-map-search.test.ts](../../apps/friendly/src/modules/life-map/life-map-search.test.ts) · [life-map-search.service.test.ts](../../apps/friendly/src/modules/life-map/life-map-search.service.test.ts) · [life-map-master.service.test.ts](../../apps/friendly/src/modules/life-map/life-map-master.service.test.ts) · [life-map-hospital-master.service.test.ts](../../apps/friendly/src/modules/life-map/life-map-hospital-master.service.test.ts) · [life-map-geocode.service.test.ts](../../apps/friendly/src/modules/life-map/life-map-geocode.service.test.ts) · [life-map-geocode-cache.service.test.ts](../../apps/friendly/src/modules/life-map/life-map-geocode-cache.service.test.ts)) · [data/life-geocode-cache.json.gz](../../apps/friendly/src/modules/life-map/data/life-geocode-cache.json.gz) — *NEW*
- food — [food.route.ts](../../apps/friendly/src/modules/food/food.route.ts) · [food.service.ts](../../apps/friendly/src/modules/food/food.service.ts) · [food-import.service.ts](../../apps/friendly/src/modules/food/food-import.service.ts) · [food-import-registry.ts](../../apps/friendly/src/modules/food/food-import-registry.ts) · [food-classify.service.ts](../../apps/friendly/src/modules/food/food-classify.service.ts) · [food-nutrition.service.ts](../../apps/friendly/src/modules/food/food-nutrition.service.ts) · [food-allergen.ts](../../apps/friendly/src/modules/food/food-allergen.ts) · [food-merge-conflict.service.ts](../../apps/friendly/src/modules/food/food-merge-conflict.service.ts) · [food-recognition-quality.service.ts](../../apps/friendly/src/modules/food/food-recognition-quality.service.ts) · [food-source-audit.ts](../../apps/friendly/src/modules/food/food-source-audit.ts) · [food-api.adapter.ts](../../apps/friendly/src/modules/food/food-api.adapter.ts) · [food.prompts.ts](../../apps/friendly/src/modules/food/food.prompts.ts) · 테스트 7([food.route.test.ts](../../apps/friendly/src/modules/food/food.route.test.ts) · [food-import.service.test.ts](../../apps/friendly/src/modules/food/food-import.service.test.ts) · [food-api.adapter.test.ts](../../apps/friendly/src/modules/food/food-api.adapter.test.ts) · [food-allergen.test.ts](../../apps/friendly/src/modules/food/food-allergen.test.ts) · [food-merge-conflict.test.ts](../../apps/friendly/src/modules/food/food-merge-conflict.test.ts) · [food-nutrition.test.ts](../../apps/friendly/src/modules/food/food-nutrition.test.ts) · [food-recognition-quality.route.test.ts](../../apps/friendly/src/modules/food/food-recognition-quality.route.test.ts)) — *NEW*
- meal — [meal.route.ts](../../apps/friendly/src/modules/meal/meal.route.ts) · [meal.service.ts](../../apps/friendly/src/modules/meal/meal.service.ts) · [meal-data.service.ts](../../apps/friendly/src/modules/meal/meal-data.service.ts) · [meal-photo.service.ts](../../apps/friendly/src/modules/meal/meal-photo.service.ts) · [meal-preference.service.ts](../../apps/friendly/src/modules/meal/meal-preference.service.ts) · [meal-stats.service.ts](../../apps/friendly/src/modules/meal/meal-stats.service.ts) · [meal-stats.insights.ts](../../apps/friendly/src/modules/meal/meal-stats.insights.ts) · [meal-daily-quota.service.ts](../../apps/friendly/src/modules/meal/meal-daily-quota.service.ts) · [meal-mutation-barrier.ts](../../apps/friendly/src/modules/meal/meal-mutation-barrier.ts) · [meal-recognition-debug.store.ts](../../apps/friendly/src/modules/meal/meal-recognition-debug.store.ts) · 테스트 10([meal.route.test.ts](../../apps/friendly/src/modules/meal/meal.route.test.ts) · [meal.service.test.ts](../../apps/friendly/src/modules/meal/meal.service.test.ts) · [meal-data.route.test.ts](../../apps/friendly/src/modules/meal/meal-data.route.test.ts) · [meal-daily-quota.service.test.ts](../../apps/friendly/src/modules/meal/meal-daily-quota.service.test.ts) · [meal-mutation-barrier.test.ts](../../apps/friendly/src/modules/meal/meal-mutation-barrier.test.ts) · [meal-photo-delete.test.ts](../../apps/friendly/src/modules/meal/meal-photo-delete.test.ts) · [meal-preference.service.test.ts](../../apps/friendly/src/modules/meal/meal-preference.service.test.ts) · [meal-recognition-debug.store.test.ts](../../apps/friendly/src/modules/meal/meal-recognition-debug.store.test.ts) · [meal-stats.insights.test.ts](../../apps/friendly/src/modules/meal/meal-stats.insights.test.ts) · [meal-stats.service.test.ts](../../apps/friendly/src/modules/meal/meal-stats.service.test.ts)) — *NEW*
- meal-recognition — [meal-recognition.route.ts](../../apps/friendly/src/modules/meal-recognition/meal-recognition.route.ts) · [meal-recognition.service.ts](../../apps/friendly/src/modules/meal-recognition/meal-recognition.service.ts) · [meal-recognition-eval.ts](../../apps/friendly/src/modules/meal-recognition/meal-recognition-eval.ts) · [meal-recognition.prompts.ts](../../apps/friendly/src/modules/meal-recognition/meal-recognition.prompts.ts) · [meal-recognition.service.test.ts](../../apps/friendly/src/modules/meal-recognition/meal-recognition.service.test.ts) · [meal-recognition-eval.test.ts](../../apps/friendly/src/modules/meal-recognition/meal-recognition-eval.test.ts) · [meal-recognition-quota.test.ts](../../apps/friendly/src/modules/meal-recognition/meal-recognition-quota.test.ts) — *NEW*
- meal-recommendation — [meal-recommendation.route.ts](../../apps/friendly/src/modules/meal-recommendation/meal-recommendation.route.ts) · [meal-recommendation.service.ts](../../apps/friendly/src/modules/meal-recommendation/meal-recommendation.service.ts) · [meal-pattern.service.ts](../../apps/friendly/src/modules/meal-recommendation/meal-pattern.service.ts) · [meal-recommendation.feedback.ts](../../apps/friendly/src/modules/meal-recommendation/meal-recommendation.feedback.ts) · [meal-recommendation.prompts.ts](../../apps/friendly/src/modules/meal-recommendation/meal-recommendation.prompts.ts) · [meal-recommendation.test.ts](../../apps/friendly/src/modules/meal-recommendation/meal-recommendation.test.ts) — *NEW*
- [apps/friendly/src/modules/restaurant/restaurant.service.ts](../../apps/friendly/src/modules/restaurant/restaurant.service.ts) — *modified: list q 검색 + $queryRaw 집계 + 방문일 정렬(compareReviewRecencyDesc)*
- [apps/friendly/src/modules/restaurant/restaurant.merge.ts](../../apps/friendly/src/modules/restaurant/restaurant.merge.ts) / [restaurant.test.ts](../../apps/friendly/src/modules/restaurant/restaurant.test.ts) — *modified: 정렬 주석 · 검색/집계/방문일 테스트*
- [apps/friendly/src/modules/crawl/adapters/naver-place.playwright.adapter.ts](../../apps/friendly/src/modules/crawl/adapters/naver-place.playwright.adapter.ts) / [naver-place.adapter.test.ts](../../apps/friendly/src/modules/crawl/adapters/naver-place.adapter.test.ts) / [crawl.service.ts](../../apps/friendly/src/modules/crawl/crawl.service.ts) — *modified: 리뷰 섹션 스코프 pager + getVisitorReviews 응답 검사 + VisitorPaginationResult*
- [apps/friendly/src/modules/analytics/analytics.test.ts](../../apps/friendly/src/modules/analytics/analytics.test.ts) — *modified: runGlobalMerge 블록 useIsolatedDatabase + 채움 8개 픽스처*
- [apps/friendly/src/modules/analytics/analytics.service.ts](../../apps/friendly/src/modules/analytics/analytics.service.ts) / [settlement-extraction.service.ts](../../apps/friendly/src/modules/settlement-extraction/settlement-extraction.service.ts) — *modified: thinkOptionForModel*
- [apps/friendly/src/modules/analytics/analytics.route.ts](../../apps/friendly/src/modules/analytics/analytics.route.ts) / [auto-discover.route.ts](../../apps/friendly/src/modules/auto-discover/auto-discover.route.ts) / [menu-grouping.route.ts](../../apps/friendly/src/modules/menu-grouping/menu-grouping.route.ts) / [settlement-extraction.route.ts](../../apps/friendly/src/modules/settlement-extraction/settlement-extraction.route.ts) — *modified: buildLlmProviderEnv*
- [apps/friendly/src/test-utils/temp-db.ts](../../apps/friendly/src/test-utils/temp-db.ts) — *useIsolatedDatabase (격리 규칙의 구현)*
- [apps/friendly/prisma/schema.prisma](../../apps/friendly/prisma/schema.prisma) — *modified: Air 1 · Life 5 · Food 5 · Meal 9 = 20 모델 + User relation 8종*
- 마이그레이션 14개 — [20260821060230_add_air_user_location](../../apps/friendly/prisma/migrations/20260821060230_add_air_user_location/migration.sql) · [20260821130000_add_life_map](../../apps/friendly/prisma/migrations/20260821130000_add_life_map/migration.sql) · [20260822105913_add_food_catalog](../../apps/friendly/prisma/migrations/20260822105913_add_food_catalog/migration.sql) · [20260822113321_add_meal_log](../../apps/friendly/prisma/migrations/20260822113321_add_meal_log/migration.sql) · [20260822150205_add_food_nutrition_from](../../apps/friendly/prisma/migrations/20260822150205_add_food_nutrition_from/migration.sql) · [20260823000000_add_meal_item_nutrition](../../apps/friendly/prisma/migrations/20260823000000_add_meal_item_nutrition/migration.sql) · [20260823160000_add_meal_recommendation_origin](../../apps/friendly/prisma/migrations/20260823160000_add_meal_recommendation_origin/migration.sql) · [20260823170000_add_meal_photo_user_fk](../../apps/friendly/prisma/migrations/20260823170000_add_meal_photo_user_fk/migration.sql) · [20260823180000_add_meal_disliked_foods](../../apps/friendly/prisma/migrations/20260823180000_add_meal_disliked_foods/migration.sql) · [20260823190000_meal_safety_events_lineage](../../apps/friendly/prisma/migrations/20260823190000_meal_safety_events_lineage/migration.sql) · [20260823210000_meal_backup_restore](../../apps/friendly/prisma/migrations/20260823210000_meal_backup_restore/migration.sql) · [20260823220000_meal_photo_deletion_outbox](../../apps/friendly/prisma/migrations/20260823220000_meal_photo_deletion_outbox/migration.sql) · [20260824040000_food_allergen_evidence_status](../../apps/friendly/prisma/migrations/20260824040000_food_allergen_evidence_status/migration.sql) · [20260827222827_add_life_hospital](../../apps/friendly/prisma/migrations/20260827222827_add_life_hospital/migration.sql) — *NEW*
- 스크립트 19 — [load-life-cctv.ts](../../apps/friendly/scripts/load-life-cctv.ts) · [load-life-toilets.ts](../../apps/friendly/scripts/load-life-toilets.ts) · [load-life-hospitals.ts](../../apps/friendly/scripts/load-life-hospitals.ts) · [export-life-geocode.ts](../../apps/friendly/scripts/export-life-geocode.ts) · [import-life-geocode.ts](../../apps/friendly/scripts/import-life-geocode.ts) · [life-map-status.ts](../../apps/friendly/scripts/life-map-status.ts) · [food-catalog-status.ts](../../apps/friendly/scripts/food-catalog-status.ts) · [load-food-catalog.ts](../../apps/friendly/scripts/load-food-catalog.ts) · [backfill-food-allergens.ts](../../apps/friendly/scripts/backfill-food-allergens.ts) · [backfill-meal-nutrition.ts](../../apps/friendly/scripts/backfill-meal-nutrition.ts) · [seed-meal-samples.ts](../../apps/friendly/scripts/seed-meal-samples.ts) · [probe-food-api.ts](../../apps/friendly/scripts/probe-food-api.ts) · [probe-meal-vision.ts](../../apps/friendly/scripts/probe-meal-vision.ts) · [probe-meal-e2e.ts](../../apps/friendly/scripts/probe-meal-e2e.ts) · [eval-meal-recognition.ts](../../apps/friendly/scripts/eval-meal-recognition.ts) · [probe-airkorea-api.ts](../../apps/friendly/scripts/probe-airkorea-api.ts) · [probe-kma-api.ts](../../apps/friendly/scripts/probe-kma-api.ts) · [probe-kma-apihub.ts](../../apps/friendly/scripts/probe-kma-apihub.ts) · [probe-hira-api.ts](../../apps/friendly/scripts/probe-hira-api.ts) — *NEW*
- [apps/friendly/research/review-search/](../../apps/friendly/research/review-search/) probe-*.ts 10종 + `scripts/probe-{extraction,vision,merge,tabling,tabling-bulk,tabling-promote}.ts`·[run-global-merge.ts](../../apps/friendly/scripts/run-global-merge.ts) — *modified: buildLlmProviderEnv import*
- [deploy.sh](../../deploy.sh) — *modified: 케이스 6/7 + life_map_data/food_catalog_data 자동 점검(project-overview 주 담당)*
- [docs/data-sources.md](../../docs/data-sources.md) — *NEW: 원본 데이터 운영 가이드 + "테스트는 .env DATABASE_URL 을 그대로 쓴다" 경고*
- [docs/PLAN-meal.md](../../docs/PLAN-meal.md) — *NEW: 식단 관리 계획(데이터 소스 표·차수 기록)*
- [packages/utils/src/reviewDate.ts](../../packages/utils/src/reviewDate.ts) / [aiModel.ts](../../packages/utils/src/aiModel.ts) — *외부(utils): compareReviewRecencyDesc · thinkOptionForModel — friendly 가 소비*

신규/변경 (2026-06-25 라운드) — 앱 레벨 wiring 관점:
- [apps/friendly/src/plugins/logs.ts](../../apps/friendly/src/plugins/logs.ts) — *NEW: operationLog/logAnalysis app-singleton + 보존 cron*
- [apps/friendly/src/plugins/random-crawl.ts](../../apps/friendly/src/plugins/random-crawl.ts) — *NEW: randomCrawl/telegram/telegramConfig 데코 + 서비스 조립*
- [apps/friendly/src/plugins/summaries.ts](../../apps/friendly/src/plugins/summaries.ts) — *modified: reviewSearch/reviewClustering 추가 decorate + SummaryService 주입, JobLogService 퇴역, deps ['prisma','logs']*
- [apps/friendly/src/plugins/schedule.ts](../../apps/friendly/src/plugins/schedule.ts) — *modified: deps ['prisma','logs'] + operationLog 주입(parentRunId)*
- [apps/friendly/src/server.ts](../../apps/friendly/src/server.ts) — *modified: 부팅 5단계(telegramConfig/randomCrawl.bootstrap 추가)*
- [apps/friendly/src/app.ts](../../apps/friendly/src/app.ts) — *modified: registerRestaurantPreview(app) 추가 등록*
- [apps/friendly/src/config/env.ts](../../apps/friendly/src/config/env.ts) — *modified: OLLAMA_IMAGE_MODEL/OLLAMA_LOG_ANALYSIS_MODEL/TELEGRAM_*/VWORLD_*/PUBLIC_ORIGIN 키*
- [apps/friendly/src/modules/restaurant/restaurant-preview.ts](../../apps/friendly/src/modules/restaurant/restaurant-preview.ts) — *NEW: /r/:placeId SEO/공유 HTML + sitemap.xml + robots.txt + JSON-LD + noscript*
- [apps/friendly/src/modules/restaurant/region-derive.ts](../../apps/friendly/src/modules/restaurant/region-derive.ts) — *NEW: 주소/좌표 → 시도·시군구 파생*
- [apps/friendly/src/modules/restaurant/region-stats-telegram.ts](../../apps/friendly/src/modules/restaurant/region-stats-telegram.ts) — *NEW: 지역통계 텔레그램 렌더(순수 함수)*
- [apps/friendly/src/modules/restaurant/canonical-members.ts](../../apps/friendly/src/modules/restaurant/canonical-members.ts) — *NEW: canonical 멤버 집합(naver+dc+tabling) — enrich/QA/군집 공용*
- [apps/friendly/src/modules/restaurant/restaurant.route.ts](../../apps/friendly/src/modules/restaurant/restaurant.route.ts) — *modified: regionStats/smartPick/publicReviews/publicCategoryTree/reviewResummarize 라우트*
- [apps/friendly/src/modules/restaurant/restaurant.service.ts](../../apps/friendly/src/modules/restaurant/restaurant.service.ts) — *modified: getPublicSeoMeta/getPublicSitemapEntries/getRegionStats/getCategoryTree/smartPick/getPhotoUrls + tabling 융합*
- [apps/friendly/src/modules/restaurant/restaurant.merge.ts](../../apps/friendly/src/modules/restaurant/restaurant.merge.ts) — *modified: tabling(partner) 소스 융합*
- [apps/friendly/src/modules/restaurant/restaurant.test.ts](../../apps/friendly/src/modules/restaurant/restaurant.test.ts) — *NEW/modified*
- [apps/friendly/src/modules/media/panorama-cache.ts](../../apps/friendly/src/modules/media/panorama-cache.ts) — *NEW: 휘발성 파노라마 URL 영구 사본*
- [apps/friendly/src/modules/media/media.route.ts](../../apps/friendly/src/modules/media/media.route.ts) — *modified: ALLOWED_HOSTS export + panorama(:placeId) 라우트*
- [apps/friendly/src/modules/settings/map.route.ts](../../apps/friendly/src/modules/settings/map.route.ts) / [map.service.ts](../../apps/friendly/src/modules/settings/map.service.ts) / [map.test.ts](../../apps/friendly/src/modules/settings/map.test.ts) — *modified: DB+env fallback + source 출처*
- [apps/friendly/src/modules/summary/summary.service.ts](../../apps/friendly/src/modules/summary/summary.service.ts) / [summary.test.ts](../../apps/friendly/src/modules/summary/summary.test.ts) — *modified: enrich/군집 훅 + 단건 재요약*
- [apps/friendly/prisma/schema.prisma](../../apps/friendly/prisma/schema.prisma) — *modified: OperationRun/Log/Report·LogConfig·RandomCrawlConfig/Run·TelegramConfig·ReviewCluster·ReviewSummary enrichment·SettlementRound.groupSplits·SettlementSession.shareExpiresAt*
- [apps/friendly/prisma/migrations/20260624034309_add_cluster_corpus_size/migration.sql](../../apps/friendly/prisma/migrations/20260624034309_add_cluster_corpus_size/migration.sql) — *NEW*
- [apps/friendly/prisma/migrations/20260624014823_add_review_clustering/migration.sql](../../apps/friendly/prisma/migrations/20260624014823_add_review_clustering/migration.sql) — *NEW: ReviewCluster + clusterId*
- [apps/friendly/prisma/migrations/20260621220422_add_review_search_enrichment/migration.sql](../../apps/friendly/prisma/migrations/20260621220422_add_review_search_enrichment/migration.sql) — *NEW: ReviewSummary enrichment 컬럼*
- [apps/friendly/prisma/migrations/20260619235551_add_random_crawl_timeout_action/migration.sql](../../apps/friendly/prisma/migrations/20260619235551_add_random_crawl_timeout_action/migration.sql) — *NEW*
- [apps/friendly/prisma/migrations/20260619091932_add_telegram_config/migration.sql](../../apps/friendly/prisma/migrations/20260619091932_add_telegram_config/migration.sql) — *NEW: TelegramConfig*
- [apps/friendly/prisma/migrations/20260619075115_add_random_crawl/migration.sql](../../apps/friendly/prisma/migrations/20260619075115_add_random_crawl/migration.sql) — *NEW: RandomCrawlConfig/Run*
- [apps/friendly/prisma/migrations/20260612181456_add_operation_log_job_index/migration.sql](../../apps/friendly/prisma/migrations/20260612181456_add_operation_log_job_index/migration.sql) — *NEW*
- [apps/friendly/prisma/migrations/20260612164108_add_operation_logs/migration.sql](../../apps/friendly/prisma/migrations/20260612164108_add_operation_logs/migration.sql) — *NEW: OperationRun/Log/Report + LogConfig*
- [apps/friendly/prisma/migrations/20260610011757_add_settlement_group_splits/migration.sql](../../apps/friendly/prisma/migrations/20260610011757_add_settlement_group_splits/migration.sql) — *NEW*
- [apps/friendly/prisma/migrations/20260601120000_add_share_og_image_url/migration.sql](../../apps/friendly/prisma/migrations/20260601120000_add_share_og_image_url/migration.sql) — *NEW*
- [apps/friendly/prisma/migrations/20260601090100_add_share_og_image/migration.sql](../../apps/friendly/prisma/migrations/20260601090100_add_share_og_image/migration.sql) — *NEW*
- [apps/friendly/prisma/migrations/20260529215653_add_settlement_share_expiry/migration.sql](../../apps/friendly/prisma/migrations/20260529215653_add_settlement_share_expiry/migration.sql) — *NEW*
- [apps/friendly/scripts/build-regions.mjs](../../apps/friendly/scripts/build-regions.mjs) — *NEW: regions.json 생성*

이전 라운드 소스 (유지):
- [apps/friendly/package.json](../../apps/friendly/package.json) — *modified: satori/@resvg/resvg-js 의존성 + croner ^10(NEW) + lint/eval:extraction/probe:extraction/probe:vision/probe:merge/run-merge 스크립트*
- [apps/friendly/src/modules/schedule/schedule.service.ts](../../apps/friendly/src/modules/schedule/schedule.service.ts) — *NEW 2026-06-06: 정규화→머지 파이프라인 + config/run/preview/이력*
- [apps/friendly/src/modules/schedule/schedule-registry.ts](../../apps/friendly/src/modules/schedule/schedule-registry.ts) — *NEW 2026-06-06: 모듈 singleton cron 타이머 + inflight run + SSE*
- [apps/friendly/src/modules/schedule/schedule.route.ts](../../apps/friendly/src/modules/schedule/schedule.route.ts) — *NEW 2026-06-06: /admin/schedule/* 5종*
- [apps/friendly/src/modules/schedule/schedule.service.test.ts](../../apps/friendly/src/modules/schedule/schedule.service.test.ts) — *NEW 2026-06-06*
- [apps/friendly/src/plugins/schedule.ts](../../apps/friendly/src/plugins/schedule.ts) — *NEW 2026-06-06: ScheduleService app-level singleton (자체 AiConfig)*
- [apps/friendly/prisma/migrations/20260605135918_add_schedule_tables/migration.sql](../../apps/friendly/prisma/migrations/20260605135918_add_schedule_tables/migration.sql) — *NEW 2026-06-06: schedule_configs + schedule_runs*
- [apps/friendly/scripts/probe-merge.ts](../../apps/friendly/scripts/probe-merge.ts) — *NEW 2026-06-06: 글로벌 머지 프로브*
- [apps/friendly/scripts/run-global-merge.ts](../../apps/friendly/scripts/run-global-merge.ts) — *NEW 2026-06-06: 글로벌 머지 수동 실행*
- [apps/friendly/eslint.config.mjs](../../apps/friendly/eslint.config.mjs) — *NEW 2026-06-01: @repo/config/eslint/node 기반, 기존 위반 warn*
- [apps/friendly/src/modules/settlement/share-preview.ts](../../apps/friendly/src/modules/settlement/share-preview.ts) — *NEW 2026-06-01: OG SSR-lite HTML + image.png 라우트*
- [apps/friendly/src/modules/settlement/settlement-card.ts](../../apps/friendly/src/modules/settlement/settlement-card.ts) — *NEW 2026-06-01: 정산표 PNG 서버 렌더 (satori + resvg)*
- [apps/friendly/scripts/eval-extraction.ts](../../apps/friendly/scripts/eval-extraction.ts) — *NEW 2026-06-01: 영수증 추출 평가*
- [apps/friendly/scripts/probe-extraction.ts](../../apps/friendly/scripts/probe-extraction.ts) — *NEW 2026-06-01: 추출 프로브*
- [apps/friendly/scripts/probe-vision.ts](../../apps/friendly/scripts/probe-vision.ts) — *NEW 2026-06-01: vision provider 프로브*
- [apps/friendly/src/plugins/summaries.ts](../../apps/friendly/src/plugins/summaries.ts)
- [apps/friendly/src/plugins/multipart.ts](../../apps/friendly/src/plugins/multipart.ts)
- [apps/friendly/src/plugins/prisma.ts](../../apps/friendly/src/plugins/prisma.ts)
- ~~apps/friendly/src/modules/crawl/job-log.service.ts~~ — 2026-06-13 `9c0a1f9` 삭제, [apps/friendly/src/modules/logs/operation-log.service.ts](../../apps/friendly/src/modules/logs/operation-log.service.ts) 로 대체
- [apps/friendly/src/modules/well-known/well-known.route.ts](../../apps/friendly/src/modules/well-known/well-known.route.ts)
- [apps/friendly/src/modules/settlement/settlement-draft.route.ts](../../apps/friendly/src/modules/settlement/settlement-draft.route.ts)
- [apps/friendly/src/modules/settlement/settlement-draft.service.ts](../../apps/friendly/src/modules/settlement/settlement-draft.service.ts)
- [apps/friendly/src/modules/settlement/settlement-draft.route.test.ts](../../apps/friendly/src/modules/settlement/settlement-draft.route.test.ts)
- [apps/friendly/prisma/migrations/20260525235559_add_settlement_drafts/migration.sql](../../apps/friendly/prisma/migrations/20260525235559_add_settlement_drafts/migration.sql)
- [apps/friendly/prisma/migrations/20260525220309_add_settlement_round_category_adjustments/migration.sql](../../apps/friendly/prisma/migrations/20260525220309_add_settlement_round_category_adjustments/migration.sql)
- [apps/friendly/prisma/migrations/20260525110000_add_settlement_round_discount/migration.sql](../../apps/friendly/prisma/migrations/20260525110000_add_settlement_round_discount/migration.sql)
- [apps/friendly/prisma/migrations/20260525100000_add_settlement_rounds/migration.sql](../../apps/friendly/prisma/migrations/20260525100000_add_settlement_rounds/migration.sql)
- [apps/friendly/prisma/migrations/20260524112443_add_settlement_edited_at/migration.sql](../../apps/friendly/prisma/migrations/20260524112443_add_settlement_edited_at/migration.sql)
- [apps/friendly/prisma/migrations/20260524000000_add_settlement_contacts/migration.sql](../../apps/friendly/prisma/migrations/20260524000000_add_settlement_contacts/migration.sql)
- [apps/friendly/prisma/migrations/20260523030833_add_settlement_share_token/migration.sql](../../apps/friendly/prisma/migrations/20260523030833_add_settlement_share_token/migration.sql)
- [apps/friendly/prisma/migrations/20260523012752_add_settlement_models/migration.sql](../../apps/friendly/prisma/migrations/20260523012752_add_settlement_models/migration.sql)
- [apps/friendly/prisma/migrations/20260523010655_pnpm_filter_friendly_test_src_modules_ai/migration.sql](../../apps/friendly/prisma/migrations/20260523010655_pnpm_filter_friendly_test_src_modules_ai/migration.sql)
- [apps/friendly/prisma/migrations/20260518014530_add_crawl_job_log/migration.sql](../../apps/friendly/prisma/migrations/20260518014530_add_crawl_job_log/migration.sql)
- [apps/friendly/prisma/migrations/20260515104718_add_canonical_merge_proposals/migration.sql](../../apps/friendly/prisma/migrations/20260515104718_add_canonical_merge_proposals/migration.sql)
- [apps/friendly/prisma/migrations/20260515100910_add_canonical_suggestion_dismissed/migration.sql](../../apps/friendly/prisma/migrations/20260515100910_add_canonical_suggestion_dismissed/migration.sql)
- [apps/friendly/prisma/migrations/20260515083303_add_canonical_restaurant/migration.sql](../../apps/friendly/prisma/migrations/20260515083303_add_canonical_restaurant/migration.sql)
- [apps/friendly/prisma/migrations/20260515063258_add_restaurant_source_split/migration.sql](../../apps/friendly/prisma/migrations/20260515063258_add_restaurant_source_split/migration.sql)
- [apps/friendly/prisma/migrations/20260508173216_add_map_provider_configs/migration.sql](../../apps/friendly/prisma/migrations/20260508173216_add_map_provider_configs/migration.sql)
- [apps/friendly/prisma/migrations/20260508122321_add_visitor_review_videos/migration.sql](../../apps/friendly/prisma/migrations/20260508122321_add_visitor_review_videos/migration.sql)
- [apps/friendly/prisma/migrations/20260508095207_add_review_analysis_fields/migration.sql](../../apps/friendly/prisma/migrations/20260508095207_add_review_analysis_fields/migration.sql)
- [apps/friendly/prisma/migrations/20260506205226_add_restaurant_review_summary/migration.sql](../../apps/friendly/prisma/migrations/20260506205226_add_restaurant_review_summary/migration.sql)
- [apps/friendly/prisma/migrations/20260506191413_add_llm_provider_config/migration.sql](../../apps/friendly/prisma/migrations/20260506191413_add_llm_provider_config/migration.sql)
- `apps/friendly/prisma/migrations/*_add_analytics_tables/migration.sql`
- `apps/friendly/prisma/migrations/*_add_menu_canonicals/migration.sql`
- `apps/friendly/prisma/migrations/*_add_global_menu_canonicals/migration.sql`
- `apps/friendly/prisma/migrations/*_add_global_menu_category_path/migration.sql`
- [apps/friendly/prisma/schema.prisma](../../apps/friendly/prisma/schema.prisma)
- [apps/friendly/scripts/promote-admin.ts](../../apps/friendly/scripts/promote-admin.ts)
- [apps/friendly/scripts/backfill-contacts.ts](../../apps/friendly/scripts/backfill-contacts.ts)
- [apps/friendly/src/server.ts](../../apps/friendly/src/server.ts) — *modified: app.schedule.bootstrap() 부팅 + shutdown 시 scheduleRegistry 정리*
- [apps/friendly/src/app.ts](../../apps/friendly/src/app.ts) — *modified: registerSharePreview(app) 등록 + forceCloseConnections:'idle'(2026-06-06)*
- [apps/friendly/src/config/env.ts](../../apps/friendly/src/config/env.ts) — *modified: WEB_INDEX_PATH/OG_IMAGE_PATH 키*
- [apps/friendly/src/lib/hash.ts](../../apps/friendly/src/lib/hash.ts)
- [apps/friendly/src/lib/matching.ts](../../apps/friendly/src/lib/matching.ts)
- [apps/friendly/src/types/fastify.d.ts](../../apps/friendly/src/types/fastify.d.ts)
- [apps/friendly/src/plugins/cors.ts](../../apps/friendly/src/plugins/cors.ts) — *modified: dev 전면 반사 허용 + 비-LAN origin warn*
- [apps/friendly/src/plugins/empty-body-parser.ts](../../apps/friendly/src/plugins/empty-body-parser.ts)
- [apps/friendly/src/plugins/error-handler.ts](../../apps/friendly/src/plugins/error-handler.ts) — *modified: setErrorHandler error 파라미터 FastifyError 주석*
- [apps/friendly/src/plugins/helmet.ts](../../apps/friendly/src/plugins/helmet.ts)
- [apps/friendly/src/plugins/jwt.ts](../../apps/friendly/src/plugins/jwt.ts)
- [apps/friendly/src/plugins/sensible.ts](../../apps/friendly/src/plugins/sensible.ts)
- [apps/friendly/src/plugins/swagger.ts](../../apps/friendly/src/plugins/swagger.ts)
- [apps/friendly/src/modules/auth/auth.route.ts](../../apps/friendly/src/modules/auth/auth.route.ts)
- [apps/friendly/src/modules/auth/auth.service.ts](../../apps/friendly/src/modules/auth/auth.service.ts)
- [apps/friendly/src/modules/auth/auth.test.ts](../../apps/friendly/src/modules/auth/auth.test.ts)
- [apps/friendly/src/modules/picks/picks.route.ts](../../apps/friendly/src/modules/picks/picks.route.ts)
- [apps/friendly/src/modules/picks/picks.service.ts](../../apps/friendly/src/modules/picks/picks.service.ts)
- [apps/friendly/src/modules/health/health.route.ts](../../apps/friendly/src/modules/health/health.route.ts)
- [apps/friendly/src/modules/admin/admin.route.ts](../../apps/friendly/src/modules/admin/admin.route.ts)
- [apps/friendly/src/modules/admin/admin.service.ts](../../apps/friendly/src/modules/admin/admin.service.ts)
- [apps/friendly/src/modules/restaurant/restaurant.route.ts](../../apps/friendly/src/modules/restaurant/restaurant.route.ts) — *modified: publicCategoryTree 공개 라우트 추가(2026-06-06)*
- [apps/friendly/src/modules/restaurant/restaurant.service.ts](../../apps/friendly/src/modules/restaurant/restaurant.service.ts) — *modified: getPhotoUrls 신규(2026-06-01) + getCategoryTree(2026-06-06) + assemblePublicReviews fetchedAt asc 교정 + contentHashOf NUL→이스케이프*
- [apps/friendly/src/modules/restaurant/restaurant.test.ts](../../apps/friendly/src/modules/restaurant/restaurant.test.ts) — *modified: category-tree 테스트 추가(2026-06-06)*
- [apps/friendly/src/modules/crawl/job-registry.ts](../../apps/friendly/src/modules/crawl/job-registry.ts) — *modified: isPlaceCrawling actor-agnostic 가드 추가(2026-06-06)*
- [apps/friendly/src/modules/restaurant/restaurant.merge.ts](../../apps/friendly/src/modules/restaurant/restaurant.merge.ts)
- [apps/friendly/src/modules/restaurant/restaurant.merge.test.ts](../../apps/friendly/src/modules/restaurant/restaurant.merge.test.ts)
- [apps/friendly/src/modules/canonical/](../../apps/friendly/src/modules/canonical/)
- [apps/friendly/src/modules/auto-discover/auto-discover.route.ts](../../apps/friendly/src/modules/auto-discover/auto-discover.route.ts)
- [apps/friendly/src/modules/auto-discover/auto-discover.service.ts](../../apps/friendly/src/modules/auto-discover/auto-discover.service.ts)
- [apps/friendly/src/modules/auto-discover/auto-discover-registry.ts](../../apps/friendly/src/modules/auto-discover/auto-discover-registry.ts)
- [apps/friendly/src/modules/auto-discover/auto-discover.prompts.ts](../../apps/friendly/src/modules/auto-discover/auto-discover.prompts.ts)
- [apps/friendly/src/modules/auto-discover/auto-discover.test.ts](../../apps/friendly/src/modules/auto-discover/auto-discover.test.ts)
- [apps/friendly/src/modules/crawl/crawl.route.ts](../../apps/friendly/src/modules/crawl/crawl.route.ts)
- [apps/friendly/src/modules/crawl/crawl.service.ts](../../apps/friendly/src/modules/crawl/crawl.service.ts)
- [apps/friendly/src/modules/summary/summary.service.ts](../../apps/friendly/src/modules/summary/summary.service.ts)
- [apps/friendly/src/modules/summary/summary-events-bus.ts](../../apps/friendly/src/modules/summary/summary-events-bus.ts)
- [apps/friendly/src/modules/summary/summary.test.ts](../../apps/friendly/src/modules/summary/summary.test.ts)
- [apps/friendly/src/modules/menu-grouping/menu-grouping.service.ts](../../apps/friendly/src/modules/menu-grouping/menu-grouping.service.ts)
- [apps/friendly/src/modules/analytics/analytics.service.ts](../../apps/friendly/src/modules/analytics/analytics.service.ts) — *modified: 글로벌 머지 v3 택소노미 + mappings 배열 스키마 + 청크 10 + categoryPath 복구 + runGlobalMerge(스케줄러 호출). 상세는 analytics 토픽*
- [apps/friendly/src/modules/analytics/](../../apps/friendly/src/modules/analytics/)
- [apps/friendly/src/modules/media/media.route.ts](../../apps/friendly/src/modules/media/media.route.ts) — *modified: ALLOWED_HOSTS export (OG 공유 재사용)*
- [apps/friendly/src/modules/media/media.test.ts](../../apps/friendly/src/modules/media/media.test.ts)
- [apps/friendly/src/modules/settings/map.route.ts](../../apps/friendly/src/modules/settings/map.route.ts)
- [apps/friendly/src/modules/settings/map.service.ts](../../apps/friendly/src/modules/settings/map.service.ts)
- [apps/friendly/src/modules/settings/map.test.ts](../../apps/friendly/src/modules/settings/map.test.ts)
- [apps/friendly/src/modules/ai/adapter-cache.ts](../../apps/friendly/src/modules/ai/adapter-cache.ts)
- [apps/friendly/src/modules/ai/ai.config.service.ts](../../apps/friendly/src/modules/ai/ai.config.service.ts)
- [apps/friendly/src/modules/contact/contact.route.ts](../../apps/friendly/src/modules/contact/contact.route.ts)
- [apps/friendly/src/modules/contact/contact.service.ts](../../apps/friendly/src/modules/contact/contact.service.ts)
- [apps/friendly/src/modules/contact/contact.route.test.ts](../../apps/friendly/src/modules/contact/contact.route.test.ts)
- [apps/friendly/src/modules/settlement/settlement.route.ts](../../apps/friendly/src/modules/settlement/settlement.route.ts)
- [apps/friendly/src/modules/settlement/settlement.service.ts](../../apps/friendly/src/modules/settlement/settlement.service.ts) — *modified: getSharePreviewMeta + pickRestaurantOgImageUrl + collectCandidateImageUrls + sharePreviewCache + shareOgImage/shareOgImageUrl 처리*
- [apps/friendly/src/modules/settlement/settlement.route.test.ts](../../apps/friendly/src/modules/settlement/settlement.route.test.ts)
- [apps/friendly/src/modules/settlement/settlement.calculator.test.ts](../../apps/friendly/src/modules/settlement/settlement.calculator.test.ts)
- [apps/friendly/src/modules/settlement-extraction/settlement-extraction.route.ts](../../apps/friendly/src/modules/settlement-extraction/settlement-extraction.route.ts)
- [apps/friendly/src/modules/settlement-extraction/settlement-extraction.service.ts](../../apps/friendly/src/modules/settlement-extraction/settlement-extraction.service.ts)
- [apps/friendly/src/modules/settlement-extraction/settlement-extraction.prompts.ts](../../apps/friendly/src/modules/settlement-extraction/settlement-extraction.prompts.ts)
- [apps/friendly/tsconfig.json](../../apps/friendly/tsconfig.json)
- [apps/friendly/tsup.config.ts](../../apps/friendly/tsup.config.ts)
- [apps/friendly/vitest.config.ts](../../apps/friendly/vitest.config.ts)
- [apps/friendly/.env.example](../../apps/friendly/.env.example)
- [packages/api-contract/src/routes.ts](../../packages/api-contract/src/routes.ts)
