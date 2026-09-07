---
topic: api-contract
last_compiled: 2026-09-07
sources_count: 58
status: active
aliases: [zod, schemas, ssot, contracts, "@repo/api-contract", tarot, saju, saju-c, saju-g, housing, usage-quota, menu-lexicon, menu-nutrition, TarotSpreadId, TarotTopic, TarotCardId, TarotDrawnCard, TarotChoices, CreateTarotReadingInput, TarotReadingSource, TarotCardReading, TarotChoiceVerdict, TarotMenuPick, TarotMenuVerdict, TarotQuota, TarotReadingResult, TarotReadingSummary, ListTarotReadingsQuery, CreateTarotShareInput, TarotShareResult, SharedTarotReading, TarotShareImageFormat, TAROT_GUEST_KEY_HEADER, X-Guest-Key, guest-key, remainingToday, UsageQuotaFeature, UsageQuotaSetting, UpdateUsageQuotaSettingInput, UsageQuotaUsage, UsageQuotaOverview, UsageQuotaOverviewQuery, guestCutoffPct, ipPerMinute, tarot-reading, saju-reading, saju-g-reading, SajuBirthInput, SajuOptionsInput, SajuCalendarKind, SajuGender, SajuWuxing, SajuTenGod, SajuTwelveStage, SajuPillarKey, SajuRelationType, SajuStarId, SajuPillar, SajuChart, SajuRelation, SajuStar, SajuLuckPillar, SajuYearLuck, SajuSectionId, SajuSectionStatus, SajuSections, SajuSource, SajuReadingSource, SajuReadingResult, SajuJobPollQuery, SajuJobPollResult, long-poll, 410-gone, SajuDay, SajuDayTag, SajuDailyInput, SajuDailyResult, SajuMatchInput, SajuMatchResult, SajuMatchGrade, SajuDatePurpose, SajuDatePickInput, SajuDatePickResult, SajuFoodInput, SajuFoodPick, SajuFoodResult, SajuLucky, SajuProfileInput, SajuProfile, SajuReadingKind, SajuReadingSummary, CreateSajuShareInput, SajuShareResult, SharedSajuReading, SAJU_GUEST_KEY_HEADER, SAJU_PROFILE_MAX, SajuGBirth, SajuGKind, SajuGElement, SajuGChart, SajuGReport, SajuGLifeScene, SajuGReadingResult, SajuGReceiptInput, SajuGProfile, SajuGProfileInput, UpdateSajuGProfileInput, SajuGRelationship, SajuGPairBirths, CreateSajuGPairInput, SajuGConnection, SajuGPairChart, SajuGPairResult, CreateSajuGShareInput, PublicSajuGShare, SajuGShareToken, SajuGShareResult, SajuGShareError, RevokeSajuGShareInput, SAJU_G_GUEST_KEY_HEADER, SAJU_G_PROFILES_MAX, HousingDealType, HousingAreaBand, HousingComplexKind, HousingLatestDeal, HousingFallbackDeal, HousingOfficialPrice, HousingOfficialGlance, HousingBandStat, HousingPointsQuery, HousingPoint, HousingCell, HousingPointsResult, HousingComplexSummary, HousingNearbyQuery, HousingNearbyItem, HousingNearbyResult, HousingSearchQuery, HousingSearchResult, HousingComplexParams, HousingComplexDetail, HousingTradesQuery, HousingTrade, HousingTradesResult, HousingStatusResult, housingAxisFields, dealType-band, MenuLexiconKind, MenuLexiconEntry, MenuLexiconCreateInput, MenuLexiconListQuery, MenuLexiconListResult, MENU_LEXICON_KINDS_WITH_TARGET, MenuKcalBasis, MenuKcalMatchedBy, RestaurantMenuKcalItem, RestaurantMenuKcalPart, RestaurantMenuKcalPortion, RestaurantMenuNutrition, MENU_NUTRITION_NOTICE, llmPending, kcalPer100g, mfds-raw, curated, purpose-8, Routes-Tarot, Routes-Saju, Routes-SajuG, Routes-Housing, Routes-UsageQuota, publicMenuNutrition, adminMenuLexicon, sharePage, shareImage, 43-schemas, 35-namespaces, air-quality, weather, life-map, food, meal, allergen, AirMeasureItem, AirGradeSchema, AirSidoRealtimeResult, AirStationHistoryResult, AirForecastResult, AirWeeklyForecastResult, AirStationInfoItem, AirNearbyQuery, AirNearbyStationItem, AirStationSearchQuery, AirLocationSource, AirLocationUpsertBody, AirLocationResult, fetchedAt-stale, stale-contract, WeatherGridQuery, WeatherBase, WeatherPrecip, WeatherNowcastResult, WeatherForecastResult, WeatherForecastDay, WeatherVersionsResult, WeatherMidQuery, WeatherMidResult, WeatherMidSeaResult, WeatherAwsQuery, WeatherAwsResult, REG_ID, nx-ny, LifeMapLayer, LifeMapPointsQuery, LifeMapPointsResult, LifeMapCell, LifeMapItem, LifeMapNearbyQuery, LifeMapSearchQuery, LifeMapSearchResult, LifeMapStatusResult, LifeMapFlagParam, bbox-param, discriminatedUnion-layer, MealAllergen, MEAL_ALLERGEN_LABEL, FoodAllergenStatus, FoodDishType, FoodMainIngredient, FoodCuisine, FoodSource, FoodNutrition, FoodItem, FoodSearchQuery, FoodRestaurantsQuery, FoodRestaurantEvidence, FOOD_RESTAURANT_DATA_NOTICE, FoodAdminListQuery, FoodAdminCreateInput, FoodMergeConflictItem, FoodMergeConflictAction, FoodRecognitionQualityResult, FoodImportSource, FoodImportConfig, FoodImportRun, FoodImportProgressEvent, MealSlot, MealType, MealPortion, MealPhotoToken, MEAL_MAX_PHOTOS_PER_ENTRY, MEAL_MAX_ITEMS_PER_ENTRY, RecognizedDish, MealRecognitionSnapshot, MealEntry, MealItem, MealItemInput, CreateMealEntryInput, UpdateMealEntryInput, ListMealEntriesQuery, opaque-cursor, MealCalendarResult, MealTimePreset, RecentMealItemResult, RecognizeMealInput, RecognizeMealResult, MealStatsResult, MealWeights, MEAL_DEFAULT_WEIGHTS, MEAL_WEIGHT_PRESETS, MealPreference, CreateMealRecommendationInput, MealRecommendation, MealRecommendationEventKind, MealRecommendationEventInput, MealRecommendationContext, MEAL_DATA_DELETE_CONFIRMATION, MEAL_PHOTO_RETENTION_DELETE_CONFIRMATION, MealDataExport, MealDataBackup, MEAL_DATA_BACKUP_MAX_JSON_BYTES, RestoreMealDataResult, DeleteMealDataResult, strict-snapshot, meal-photo, meal-recommend, purpose-5, OperationFeature-12, food-import, meal-recognition, meal-recommendation, RestaurantListQuery-q, admin-search-q, visit-date-desc, Routes-Food, Routes-Meal, Routes-AirQuality, Routes-Weather, Routes-LifeMap, encodeURIComponent-builder, 36-schemas, canonical, canonical-merge, canonical-split, canonical-proposal, canonical-suggestion, catchtable, catchtable-search, catchtable-shop, diningcode, diningcode-search, diningcode-shop, diningcode-bulk-save, tabling, tabling-search, tabling-shop, tabling-discover, tabling-bulk-save, naver-search-result, crawl-search-query, crawl-search-result, search-bbox, auto-discover, auto-discover-job, auto-discover-phase, auto-discover-snapshot, auto-discover-confirm, awaiting-confirmation, fused-detail, public-sources, public-source-tabling, public-tabling-addon, public-stored-review-count, public-diningcode-addon, crawl-log, crawl-log-level, crawl-job-log-entry, review-summary-queued, review-summary-cancelled, restaurant-cancel-summary, restaurant-resume-summary, summary-log-event, public-reviews-pagination, public-review-sentiment, public-review-sort, settlement, settlement-session, settlement-participant, settlement-item, settlement-share, settlement-shared, settlement-contact, settlement-extraction, receipt-item, receipt-item-category, settlement-calculator, calculate-shares, llm-provider-purpose, ai-purpose, log-analysis-purpose, settlement-draft, settlement-draft-schema, SettlementDraft, UpsertSettlementDraftInput, settlement-rounds, SettlementRound, SettlementRoundAttendee, calculateMultiRoundShares, effectiveExcludes, perCategoryShares, ExtractReceiptSplit, roundIndex, roundTotal, fromDraftId, update-PUT, full-replace, leftoverParticipantClientId, leftoverParticipantClientIds, leftover-nanueo-batgi, roundUnit-100-1000, categoryAdjustments, SharedSettlementRound, omit-extend, attendees-100, items-200, models-preview, share-og-image, ShareOgImage, og-image, og-image-url, og-image-candidates, ogImageUrl, ogImageCandidates, share-ttl, ShareTtl, expiresAt, receiptImageToken, eslint-config, schedule, schedule-config, schedule-run, schedule-runs, schedule-preview, schedule-progress, schedule-done, ScheduleJobType, ScheduleTrigger, ScheduleRunStatus, SchedulePhase, ScheduleConfig, ScheduleConfigInput, ScheduleRun, ScheduleRunList, ScheduleProgressEvent, ScheduleDoneEvent, SchedulePreviewInput, SchedulePreviewResult, normalize-merge, cron, croner, normalize-merge-pipeline, restaurant-category-tree, RestaurantCategoryTreeResult, public-category-tree, review-tip-filter, review-menu-filter, review-search, ReviewAskInput, ReviewAskResult, ReviewPublicAskBody, ReviewQaReadyResult, ReviewSearchEnrichInput, ReviewEnrichStatusList, ReviewEnrichProgressEvent, rag, hyde, qa, review-clustering, ReviewClustersResult, ReviewClusterItem, ReviewClusterAspectSummary, ReviewClusterRunResult, ReviewClusterStatusList, ClusterTone, hdbscan, c-tf-idf, random-crawl, RandomCrawlConfig, RandomCrawlConfigInput, RandomCrawlRun, RandomCrawlRunList, RandomCrawlCandidate, RandomCrawlRegion, RandomCrawlTrigger, RandomCrawlTimeoutAction, RegionTree, RegionDongList, telegram-discover, logs, operation-log, OperationFeature, OperationRunSchema, OperationLogEntrySchema, OperationReportSchema, OperationRunList, OperationRunDetail, AnalyzeRunResult, LogConfigSchema, log-analysis, telegram-settings, TelegramConfig, UpdateTelegramConfigInput, TelegramTestResult, TelegramChatIdResult, resolve-chat-id, llm-telemetry, LlmTelemetrySnapshot, LlmGateSnapshot, LlmTelemetryCall, LlmKeySource, LlmModelSource, group-split, SettlementItemGroup, SettlementGroupMember, SettlementGroupSplitMode, GLASSES, glasses, groupSplits, drink-kinds, DRINK_KINDS, matchDrinkKind, isGroupableCategory, GROUPABLE_CATEGORIES, region-stats, RegionStatsResult, RegionStatsSido, RegionStatsSigungu, smart-pick, RestaurantSmartPickInput, bus, bus-station, bus-station-search, BusStationSearchQuery, BusStationItem, BusStationSearchResult, BusArrivalsParams, BusArrivalEntry, BusArrivalItem, BusArrivalsResult, BusNearbyQuery, BusNearbyItem, BusNearbyResult, BusPositionsParams, BusPositionsQuery, BusPositionItem, BusPositionsResult, BusRouteDetailParams, BusRoutePathPoint, BusRouteStationItem, BusRouteInfo, BusRouteDetailResult, bus-favorite, bus-favorites, BusFavoriteStationItem, BusFavoriteRouteItem, BusFavoriteStationParams, BusFavoriteRouteParams, BusFavoriteStationUpsertBody, BusFavoriteRouteUpsertBody, BusFavoritesResult, BusFavoritesSyncBody, BUS_FAVORITES_MAX, arsId, stId, staOrd, wgs84, wgs84-range, menuGroups, MenuGroup, MenuGroupItem, subway, subway-station, SubwayStationSearchQuery, SubwayStationGroupItem, SubwayStationSearchResult, SubwayNearbyQuery, SubwayNearbyResult, SubwayLineDetailResult, SubwayLineSection, SubwayLineStationItem, SubwayTimetableResult, SubwayCongestionResult, SubwayPathQuery, SubwayPathResult, SubwayPositionsResult, SubwayTrainPositionItem, SubwayArrivalsParams, SubwayArrivalItem, subway-favorite, SubwayFavoriteStationItem, SubwayFavoriteLineItem, SubwayFavoritesResult, SubwayFavoritesSyncBody, SUBWAY_FAVORITES_MAX, subwayId, lineId, Routes-Subway]
---

# api-contract — Zod 공유 스키마 (SSOT)

**2026-08-30~09-07 변경 흡수 (25차) — 타로·사주(C)·사주(G)·집값·사용량 한도 신규 5도메인 + 메뉴 칼로리 계약 2파일 = 신규 7파일(36 → 43), `Routes` namespace 5개(30 → 35), purpose 8종, `Routes.Saju` 경로 `/saju-c` 이관**: (1) **신규 스키마 7파일** — [housing.ts](../../packages/api-contract/src/schemas/housing.ts)(331줄, `254fb76`), [menu-nutrition.ts](../../packages/api-contract/src/schemas/menu-nutrition.ts)(86줄, `ac0e191`→`d12b47d`→`9d3253a`→`fb12027`→`4479b18`→`9e09950`), [menu-lexicon.ts](../../packages/api-contract/src/schemas/menu-lexicon.ts)(64줄, `fb12027`·`9e09950`), [tarot.ts](../../packages/api-contract/src/schemas/tarot.ts)(182줄, `cd5a29b`·`98df15a`·`5d0c4c7`), [usage-quota.ts](../../packages/api-contract/src/schemas/usage-quota.ts)(68줄, `cd5a29b`·`f8e5dd0`·`e40b4c0`), [saju.ts](../../packages/api-contract/src/schemas/saju.ts)(485줄, `f8e5dd0`·`7358c86`·`1c60ad8`·`8ffedb9`·`e40b4c0`), [saju-g.ts](../../packages/api-contract/src/schemas/saju-g.ts)(281줄, `e40b4c0`·`82ab04a`). `index.ts` 가 `housing` 을 `life-map` 뒤에, `menu-nutrition`/`menu-lexicon` 을 `food` 뒤·`meal` 앞에, `tarot`/`saju`/`saju-g`/`usage-quota` 를 `vote` 뒤·calculator 앞에 추가. (2) **`routes.ts` namespace 5개 신설** — `Routes.Housing`(6키, 전부 공개), `Routes.Tarot`(7키: API 5 + 웹 경로 빌더 `sharePage`/`shareImage` 2), `Routes.Saju`(14키 — 경로는 **`${API_PREFIX}/saju-c/*`**: `5f49026`(2026-09-06)에서 `/saju/*` → `/saju-c/*` 로 이관, 식별자 `Saju` 는 그대로), `Routes.SajuG`(12키, `/saju-g/*`), `Routes.UsageQuota`(2키, 어드민). 기존 namespace 확장: `Routes.Restaurant.publicMenuNutrition(placeId)`(`ac0e191`), `Routes.Food.adminMenuLexicon`/`adminMenuLexiconEntry(id)`(`fb12027`). (3) **기존 파일 변경** — `ai.ts` 의 `LlmProviderPurpose` 가 `tarot`/`saju`/`saju-g` 로 **8종**(`cd5a29b`·`f8e5dd0`·`e40b4c0`), `food.ts` 의 `FoodSource` 가 `mfds-raw`/`curated` 로 **8종**(`bcfc72b` — `FoodImportSource` 는 4종 그대로, CLI 전용) + `FoodItem.kcalPer100g: number | null`(`0d2584a`). `logs.ts` 의 `OperationFeature` 는 12종 그대로. (4) **설계 특징** — 무인증 공개 LLM 기능 3종(타로·사주(C)·사주(G))이 **`x-guest-key` 헤더 상수 + 게스트만 숫자인 잔여 한도(`quota.remainingToday` / `remainingToday`) + 정적 폴백 source(`llm|static`, 사주(G)는 `ai|basic`) + 공유 토큰(게스트는 입력 재전송, 서버가 본문 확보; `sharePage` 는 `API_PREFIX` 없는 origin 루트 경로 — OG 프리렌더는 friendly)** 을 같은 모양으로 반복하고, 한도 자체는 `usage-quota.ts` 의 `UsageQuotaFeature`(`tarot-reading`/`saju-reading`/`saju-g-reading`) 하나로 모은다. `tarot.ts`/`saju.ts` 의 enum 은 `@repo/utils` 데이터와 같은 값·순서여야 하지만 api-contract 는 utils 를 import 하지 않고 friendly 테스트(`tarot.test`/`saju.test`)가 `.options` 동일성을 검증(food 분류 enum ↔ `foodTaxonomy` 와 같은 계약). 사주(C)는 긴 풀이를 **섹션 4개 병렬 LLM job + long-poll**(`SajuJobPollQuery.after/wait`, 410 = job 소멸) 로 — 이 패키지 첫 long-poll 계약(SSE 아님). `saju.ts → tarot.ts`(게스트 키 헤더 상수 1개) 가 유일한 신규 cross-import이고 나머지 6파일은 자기완결. 집값은 life-map 의 `bbox+zoom → points|cells` 골격에 축(`dealType × band`) 스프레드 `housingAxisFields` 를 더한 재현. 메뉴 칼로리는 상세 응답에 넣지 않고 지연 엔드포인트(`RestaurantMenuNutrition` — 메뉴명 문자열 join, 애매하면 항목 생략, `llmPending` 재조회). 도메인 상세는 [tarot](tarot.md) / [saju-c](saju-c.md) / [saju-g](saju-g.md) / [housing](housing.md) / [usage-quota](usage-quota.md) / [food](food.md) — 여기선 SSOT 패키지 관점(인벤토리·zod 패턴·라우트 분리)만.

**2026-08-17~08-30 변경 흡수 — 공공데이터 3도메인(air-quality·weather·life-map) + 식단 3파일(allergen·food·meal) 신규 6파일(30 → 36), `Routes` namespace 5개, purpose 5종, OperationFeature 12종, 어드민 맛집 검색 `q`, 리뷰 방문일 정렬 계약**: (1) **신규 스키마 6파일** — [air-quality.ts](../../packages/api-contract/src/schemas/air-quality.ts)(345줄, `7340743`·`c6ac640`·`a4284aa`), [weather.ts](../../packages/api-contract/src/schemas/weather.ts)(323줄, `37e0db0`·`17f281a`), [life-map.ts](../../packages/api-contract/src/schemas/life-map.ts)(281줄, `1d92acb`·`a21de10`·병의원 `4fd6e22`), [allergen.ts](../../packages/api-contract/src/schemas/allergen.ts)(55줄, `31c56f7`), [food.ts](../../packages/api-contract/src/schemas/food.ts)(589줄, `102ccdb`~`31c56f7`), [meal.ts](../../packages/api-contract/src/schemas/meal.ts)(1,041줄 — 패키지 최대 파일, `c5b5fe2`~`fd371d9`). `index.ts` 가 6개 re-export 를 `subway-favorite` 뒤·`settlement-extraction` 앞에 추가. (2) **`routes.ts` namespace 5개 신설** — `Routes.Food`(13키: 사용자 2 + 어드민 11), `Routes.Meal`(21키, 전부 로그인 — 공개 표면 없음), `Routes.AirQuality`(9키: 공개 8 + 인증 `location`), `Routes.Weather`(6키, 공개), `Routes.LifeMap`(5키, 공개). 한글 경로 인자(`sidoRealtime(sidoName)`·`stationHistory(stationName)`·`LifeMap.detail(layer, id)`)는 빌더가 `encodeURIComponent` — subway `stationId` 와 같은 계약. (3) **기존 파일 변경** — `ai.ts` 의 `LlmProviderPurpose` 가 `meal-photo`/`meal-recommend` 로 5종(`cc8399a`), `logs.ts` 의 `OperationFeature` 에 `food-import`/`meal-recognition`/`meal-recommendation` 이 더해져 12종, `restaurant.ts` 의 `RestaurantListQuery.q`(어드민 통합 검색 — trim 1~120, `5e25cc0`) + `RestaurantPublicDetail.reviewsFirstPage` 정렬 계약을 "실제 방문일 desc(해석 불가 시 fetchedAt desc)" 로 정정(`0d72380`). (4) **설계 특징** — 공공 API 3도메인은 응답에 `fetchedAt` + `stale`(weather 는 `base`/`fallback` 추가)을 공통으로 실어 "업스트림 실패 시 last-known 서빙" 을 계약에 못박고, 좌표 입력은 버스와 같은 WGS84 zod 범위(lat 33~39 / lng 124~132) 강제(단 사용자 현재 위치를 받는 `FoodRestaurantsQuery`·`CreateMealRecommendationInput` 은 세계 범위); 쿼리 불리언은 `z.coerce.boolean` 회피형(`enum(['1','0','true','false']).transform`) 을 life-map·food·meal 이 공유; `LifeMapItem`/`LifeMapNearbyItem` 은 `discriminatedUnion('layer')`; meal 은 `.strict()` 스냅샷(임의 JSON 저장 차단)·opaque 커서 페이지네이션·확인 문자열 리터럴(`MEAL_DATA_DELETE_CONFIRMATION`)·백업 상한 상수 9종·`format`/`version` 리터럴로 "안전한 개인 데이터" 를 스키마 단에서 강제. 식단 3파일은 `meal → food → allergen` 한 방향 체인. 도메인 상세는 [air-quality](air-quality.md) / [weather](weather.md) / [life-map](life-map.md) / [food](food.md) / [meal](meal.md) — 여기선 SSOT 패키지 관점(인벤토리·zod 패턴·라우트 분리)만.

**2026-07-13~08-16 변경 흡수 — vote·맛집 즐겨찾기 스키마 신규 + SSE 일괄 잡 스키마 팩토리 + 입력 상한 하드닝**: (1) **[schemas/vote.ts](../../packages/api-contract/src/schemas/vote.ts) 신규(`8951b31`)** — CreateVoteInput(후보 2~8, placeId 중복 refine)·SharedVoteSession(공개 — userId 미포함, isOwner 표시 플래그)·VoteSession(방장 — +token)·SubmitBallotInput(voterKey 8~64·optionIds 풀 리플레이스)·VoteDecidedBy(`votes|smart-pick|random`)·MyVotesResult + `Routes.Vote`(공개는 정산 공유와 같은 `/share/*` 관례). 도메인은 [vote](vote.md). (2) **[schemas/restaurant-favorite.ts](../../packages/api-contract/src/schemas/restaurant-favorite.ts) 신규(`56b1c22`)** — 저장 시점 스냅샷 계약(좌표 nullable — 식당 마스터가 nullable 인 점이 버스와 다름), RESTAURANT_FAVORITES_MAX 100, 응답은 항상 전체 목록(캐시 통째 교체 계약). (3) **[schemas/bulk-job.ts](../../packages/api-contract/src/schemas/bulk-job.ts) 팩토리(`c30ad8e`)** — MenuGrouping/DiningcodeBulkSave/TablingBulkSave 세 패밀리가 반복하던 동일 shape(state 2종 + snapshot/itemEvent/doneEvent)를 `makeBulkJobSchemas(itemSchema)` 로 집약, 기존 export 는 전부 alias 라 와이어 계약 무변경 — 새 잡 도메인은 아이템 스키마 + 팩토리 호출만. (4) **입력 상한 하드닝(4차, `bc2db00`)** — 문자열·배열 max 전면 부여, 정산 draft 사용자당 50개(409). (5) 대중교통 stale 계약 — BusArrivals/PositionsResult 에 `stale` 필드(`b0c4f0a`), SubwayLineSection/SubwayPathLeg 에 optional `path`/`stationS`(실형상, `c9c5235` — 미시드 환경 하위호환).

**2026-07-07 변경 흡수 — 수도권 전철 도메인 신규(2 파일) + Routes.Subway namespace**: SSOT 패키지에 **신규 스키마 파일 2개**가 합류했다 — `schemas/subway.ts`(수도권 전철: 역 검색·좌표 주변 역·실시간 도착·호선 실시간 열차 위치·호선 상세(경유역 sections)·역 시간표·시간대별 혼잡도·경로 탐색 결과), `schemas/subway-favorite.ts`(전철 즐겨찾기 — 역 / 역×호선 두 종류, 버스와 동일하게 로그인 서버 저장 + 게스트 로컬을 로그인 시 union 병합, `SUBWAY_FAVORITES_MAX=100`). `index.ts` 가 2개 re-export 를 추가하고, `routes.ts` 에 **`Routes.Subway` namespace** 가 신설됐다 (`stationSearch`, `stationsNearby`, `stationArrivals(stationId)`, `lineDetail(lineId)`, `linePositions(lineId)`, `stationTimetable(stationId)`, `stationCongestion(stationId)`, `path`, `favorites`, `favoriteStation(stationId)`/`favoriteLine(stationId, lineId)`, `favoritesSync`) — 검색·주변·도착·위치·노선상세·시간표·혼잡·경로는 전부 **비로그인 공개**(버스·맛집 공개 지도와 동일 정책), 즐겨찾기만 인증. **버스와 대조되는 계약적 특징**: `stationId` 가 `${lineId}:${name}` 합성(콜론·한글 포함)이라 라우트 헬퍼(`stationArrivals`/`stationTimetable`/`stationCongestion`/`favoriteStation`)가 `encodeURIComponent` 까지 책임진다. `lineId` 는 서울시 실시간 API 의 `subwayId`(4자리) 체계를 그대로 채택. 버스가 WGS84 좌표를 zod 범위로 강제한 것과 달리 전철은 로컬 적재 데이터라 쿼터·셀 캐시 없이 좌표 주변 조회. 버스 2파일이 `bus.ts`↔`bus-favorite.ts` 한 방향 import(`BusFavoriteStationItem = BusStationItem`)였듯 전철도 `subway-favorite.ts` 가 즐겨찾기 항목을 자체 정의(역/호선 스냅샷). 도메인 상세는 [subway](subway.md) 토픽 — 여기선 SSOT 패키지 관점(스키마 인벤토리 + 공개/인증 라우트 분리 + stationId 인코딩 계약)만.

**2026-07-06 변경 흡수 (19차) — 서울시 버스 도메인 신규(2 파일) + 네이버 메뉴 그룹(menuGroups) 노출**: 이번 라운드는 SSOT 패키지에 **신규 스키마 파일 2개**가 합류했다 — `schemas/bus.ts`(서울시 버스: 정류장 검색·실시간 도착·차량 위치·좌표 기반 주변 정류장·노선 상세 합본), `schemas/bus-favorite.ts`(버스 즐겨찾기 — 정류장 / 정류장×노선 조합 두 종류, 로그인 사용자 서버 저장 + 비로그인 로컬 저장분을 로그인 시 union 병합). `index.ts` 가 2개 re-export 를 추가하고, `routes.ts` 에 **`Routes.Bus` namespace** 가 신설됐다 (`stationSearch`, `stationsNearby`, `stationArrivals(arsId)`, `busPositions(busRouteId)`, `routeDetail(busRouteId)`, `favorites`, `favoriteStation(stId)`/`favoriteRoute(stId, busRouteId)`, `favoritesSync`) — 검색·도착·위치·주변·노선은 전부 **비로그인 공개**(맛집 공개 지도와 동일 정책), 즐겨찾기만 인증. **버스 스키마의 계약적 특징은 WGS84 좌표를 zod 숫자 범위(lat 33~39 / lng 124~132, 한국 범위)로 강제**한 것 — 서버가 GRS80 TM 원본을 항상 WGS84 로 정규화한다는 계약을 코드로 못박아, 변환이 새면 응답 직렬화 자체가 실패한다. 기존 파일 변경: `crawl.ts` 가 **`MenuGroup`/`MenuGroupItem`** zod 를 추가(네이버 `/menu/list` 그룹 크롤 원본 — `MenuGroupItem = MenuItem.extend`)하고 `NaverPlaceData.menuGroups` 를 optional 로 노출, `restaurant.ts` 가 그 `MenuGroup` 을 import 해 `RestaurantPublicDetail.menuGroups` 를 optional 로 추가 — 기존 평탄화 `menus` 는 그대로 두고 그룹을 표시할 수 있는 클라이언트만 쓰는 **additive** 확장(소비자 무해). 버스·메뉴 도메인 상세는 각각 [bus](bus.md) / [menu-grouping](menu-grouping.md) 토픽 참조 — 여기선 SSOT 패키지 관점(스키마 인벤토리 + WGS84 zod 범위 계약 + 공개/인증 라우트 분리)만 다룬다.

**2026-06-25 변경 흡수 (18차) — 리뷰 RAG·군집화·자동발굴·작업로그·텔레그램 5개 신규 스키마 + 테이블링·정산 그룹분배·LLM 텔레메트리 확장**: 이번 라운드는 SSOT 패키지에 **신규 스키마 파일 5개**가 한꺼번에 합류한 큰 흡수다 — `schemas/review-search.ts`(리뷰 RAG/문맥검색), `schemas/review-clustering.ts`(임베딩 군집화), `schemas/random-crawl.ts`(텔레그램 기반 자동 발굴), `schemas/logs.ts`(범용 작업 로그·실패 분석), `schemas/telegram-settings.ts`(텔레그램 봇 설정). `index.ts` 가 5개 re-export 를 추가했고, **`settlement.drink-kinds.ts`**(술·음료 종류 사전 — FE 그룹제안·BE 추출보정·프롬프트 힌트 단일 소스)도 패키지 루트에 신규로 export 된다. 기존 파일 변경: `crawl.ts` 가 테이블링(tabling) 패밀리(search/shop/reviews/save/discover/bulk-save) 라우트군을 다수 추가했고, `settlement.ts` 가 **세부 분배 그룹**(`SettlementItemGroup`/`SettlementGroupMember`/`SettlementGroupSplitMode`=`EQUAL`/`GLASSES` 잔수) + `SettlementCategoryAdjustment` 의 leftover 가 단일 id 에서 **`leftoverParticipantIds[]` 배열('나눠 받기')** 로 확장됐다. `settlement.calculator.ts` 는 그룹 분배(`GroupCalcInput`/`GroupShareBreakdown`/`toGroupCalcInputs`)를 흡수. `ai.ts` 는 **LLM 사용량 텔레메트리**(`LlmTelemetrySnapshot` 외 7개) + `LlmProviderPurpose` 에 `'log-analysis'` 추가 + 키/모델 출처 enum(`LlmKeySource`/`LlmModelSource`). `restaurant.ts` 는 지역 통계(`RegionStatsResult` 외) + 테이블링 공개 출처(`PublicSourceTabling`/`PublicTablingAddon`) + 정확한 리뷰 수(`PublicStoredReviewCount`·`siteReviewCount` vs `storedReviewCount` 분리). `routes.ts` 에 신규 namespace 다수: `ReviewSearch`, `ReviewClustering`, `RandomCrawl`, `Logs`, `SettingsTelegram` + `Crawl.tabling*` + `Restaurant.regionStats` + `Ai.telemetry`/`telemetryStream`. RAG·군집·자동발굴 도메인 상세는 [review-search](review-search.md) / [review-clustering](review-clustering.md) / [random-crawl](random-crawl.md) / [logs](logs.md) 토픽 참조 — 여기선 SSOT 패키지 관점(스키마 인벤토리 + zod 패턴 + 공개/어드민 placeId·restaurantId 페어)만 다룬다.

**2026-06-06 변경 흡수 (17차) — schedule.ts 신규(주기 자동 실행) + 공개 식당 카테고리 트리 + 리뷰 tip/menu 필터**: 관리자가 cron 으로 "정규화 → 글로벌 머지" 파이프라인을 예약하는 **신규 `schemas/schedule.ts`** 가 추가됐다 (12 export). 다섯 enum (`ScheduleJobType`=`'normalize-merge'` 단일 / `ScheduleTrigger`=`cron|manual` / `ScheduleRunStatus`=`running|done|failed|skipped|interrupted` / `SchedulePhase`=`collecting|grouping|merging|done`) + 설정 페어 (`ScheduleConfig` 응답 / `ScheduleConfigInput` 입력, `cronExpr` 1..120, `timezone` default `'Asia/Seoul'`) + 실행 (`ScheduleRun` — live 스냅샷·영속 이력 공용 shape / `ScheduleRunList`) + SSE 이벤트 (`ScheduleProgressEvent` / `ScheduleDoneEvent`) + cron 미리보기 (`SchedulePreviewInput` / `SchedulePreviewResult`). **cron 식 형식 검증은 서버 라우트가 croner 로** — api-contract 는 croner 에 의존하지 않는 순수 스키마 패키지로 남았다 (shared → api-contract 단방향 의존 규칙과 일관, [zod-ssot-buildless](../concepts/zod-ssot-buildless.md)). `routes.ts` 에 `Routes.Schedule` namespace 신설 (`config`/`run`/`runs`/`runEvents`/`preview` — 모두 `/admin/schedule/...` 어드민 게이트), `index.ts` 가 schedule re-export 추가. `restaurant.ts` 는 신규 **`RestaurantCategoryTreeResult`** (`{ roots: CategoryTreeNode[] }` — analytics 의 `CategoryTreeNode` 를 import 해 식당별 멘션만 누적) + `RestaurantPublicReviewsQuery` 에 **`tip?`/`menu?`** 필터 두 필드 추가 (인사이트의 topTips/topMenus 클릭 → 그 항목 달린 리뷰만), `Routes.Restaurant.publicCategoryTree(placeId)` 추가.

**2026-05-31 변경 흡수 — 정산 공유 OG 이미지 선택 페어 + share TTL/만료 + receiptImageToken + ESLint 합류**: 정산 공유 링크의 미리보기(OG) 이미지를 owner 가 고를 수 있게 `settlement.ts` 가 확장됐다. **신규 `ShareTtl` enum (`'1d'|'7d'|'30d'`)** + **`ShareOgImage` enum (`'restaurant'|'table'`)** — `restaurant` 는 정산 식당 사진(네이버 호스트, owner 가 갤러리에서 특정 1장 고르거나 미선택 시 토큰 시드 결정적 랜덤), `table` 은 정산표 매트릭스 PNG. `CreateSettlementShareInput` 가 `z.preprocess((v)=> v==null?{}:v, …)` 로 본문 없는 POST 도 `{}` 로 메꿔 `ttl` 기본 7일을 적용하게 바뀌었고, `ogImage?: ShareOgImage` (생략=기존 유지) + **`ogImageUrl?: string.url().nullable()` 트라이스테이트** (생략=기존 유지 / null=선택 해제→랜덤 / URL=후보 목록의 특정 사진 고정) 를 받는다. `SettlementShare` 응답이 `token/shareUrl` 외에 **`expiresAt`** (ISO, 토큰 없으면 null) + **`ogImage`** (복원용 현재 선택) + **`ogImageUrl`** (선택된 식당 사진 원본 URL, 미선택 null) + **`ogImageCandidates: string[]`** (갤러리 후보 원본 URL, 식당 사진 없으면 빈 배열→갤러리 숨김 자동 정산표 폴백) 4 필드로 확장. `SettlementRound` 에 **`receiptImageToken: string|null`** 가 추가됐다 — 편집 재진입 시 토큰을 그대로 돌려줘 재저장에도 영수증이 보존된다 (소유자 응답 한정). 따라서 `SharedSettlementRound` 의 omit 가 `receiptPreviewUrl` 단일에서 **`{ receiptPreviewUrl, receiptImageToken }` 두 필드**로 늘었다 — 토큰 보유자는 둘 다 못 본다. ESLint: `packages/api-contract/eslint.config.mjs` 신규 (`@repo/config/eslint/base` flat config + `dist/`·`node_modules/` ignore), `package.json` 에 `lint: "eslint ."` + `eslint@^10.4.1` devDep 추가 — turbo lint 4/4 green 합류.

**2026-05-28 변경 흡수 — 정산 N차 모델 + Draft 도메인 + calculator 멀티라운드 확장**: 정산이 **세션당 단일 차수**에서 **N차(최대 10) 모델**로 재구성됐다. `settlement.ts` 가 전면 재작성 — 세션 본문이 `items[]/attendees[]` 직속에서 `rounds: SettlementRound[].min(1)` 로 이동했고, 신규 `SettlementRound`/`SettlementRoundInput`/`SettlementRoundAttendee`/`SettlementRoundAttendeeInput` 가 차수 단위 식당 snapshot·source·할인·`categoryAdjustments`·items·attendees 를 묶는다. 참여자는 **마스터 + round override** 2단 구조 — `SettlementParticipant` 는 기본 `excludeXxx` boolean, `SettlementRoundAttendee` 는 `excludeXxxOverride: boolean | null` (null=마스터 default). `SettlementCategoryAdjustment` (응답) + `SettlementCategoryAdjustmentInput` (입력) 이 카테고리별 `leftoverParticipantId/ClientId` + `roundUnit` (100/1000원 단위) 으로 분담 다듬기 규칙을 표현. `CreateSettlementInput.fromDraftId` 가 추가돼 임시저장에서 출발한 저장이면 같은 트랜잭션에서 해당 draft 가 함께 삭제된다. `UpdateSettlementInput = CreateSettlementInput` 별칭 — 부분 PATCH 가 아닌 **전체 replace PUT** 으로 통일됐다 (이전 `updateParticipants` PATCH 라우트 폐기). attendees per round cap 20→**100**, items per round cap 100→**200**. **`schemas/settlement-draft.ts` (신규)** — `SettlementDraft`/`UpsertSettlementDraftInput`/`ListSettlementDraftsResult`. payload 는 `z.unknown()` 으로 받고 서버는 형태 검증 없이 보관, 직렬화 길이 200KB cap 만 refine. `(userId, placeId)` unique — 같은 식당 draft 는 하나. **`settlement.calculator.ts` 멀티라운드 확장** — 신규 `calculateMultiRoundShares(input: MultiRoundCalcInput): MultiRoundCalcOutput` 가 차수별 (items × 참석자 부분집합) 을 독립 calc 후 마스터 인덱스로 합산. `calculateShares` 자체에는 옵션 `discount?: { amount, category } | null` (풀 음수 클램프) + `categoryAdjustments?: CategoryAdjustmentsInput | null` (카테고리별 `roundUnit` rounding + leftover 흡수자) 추가, 반환에 `perCategoryShares: Record<카테고리, number[]>` 매트릭스 신규. `effectiveExcludes(master, override)` helper 가 마스터+round override 를 합성. **`settlement-extraction.ts`** — `ExtractReceiptSplit` (한 사진에 N장 영수증 가로 N등분, count 2~5 + index 1..count) 신규, `ExtractReceiptInput` 에 `roundIndex`/`roundTotal` (1..20) + `split` 옵션 추가. 같은 `imageToken` 으로 N번 extract 호출. **`routes.ts`** — `Routes.Settlement.update(id)` (PUT) 가 `updateParticipants` 자리를 대체, `Routes.SettlementDraft.{list, upsert, one(id)}` 신규 namespace, `Routes.Ai.providerModelsPreview(id, purpose)` 추가. `Routes.Restaurant.publicReviews(placeId)` 는 직전 라운드에 추가됐던 그대로 유지.

**2026-05-25 변경 흡수**: 정산 도메인 3 파일 (`settlement.ts`, `settlement-extraction.ts`, `settlement-contact.ts`) + `settlement.calculator.ts` 1차 도입, `LlmProviderPurpose` enum (`chat|image`) + `LlmProviderConfig.purpose` 필드, `Routes.{Settlement, SettlementExtraction, SettlementContact}` 3 namespace 신규. (현재 라운드에서 settlement.ts 가 N차 모델로 재작성됐고 SettlementDraft 가 추가됐다.)

**2026-05-19 변경 흡수**: (1) `crawl.ts` — `CrawlLogLevel` + SSE log variant + `CrawlJobLogEntry` 페이지네이션. (2) `restaurant.ts` — `ReviewSummaryStatus` 6 종 확장, `RestaurantCancel/ResumeSummaryResult`, 공개 리뷰 페이지네이션 분리. (3) `routes.ts` — `Routes.Crawl.jobLogs(:id)`, `Routes.Restaurant.crawlLogs/cancelSummary/resumeSummary/publicReviews`.

`@repo/api-contract` 은 모노레포 전체의 API I/O 단일 진실 공급원(Single Source of Truth)이다.
서버(friendly)와 클라이언트(web/mobile, `@repo/shared` 경유) 양쪽이 동일한 Zod 스키마와
라우트 경로 상수를 공유한다.

## Purpose [coverage: high — 5 sources]

API 의 입력/출력을 한 곳에서 정의하기 위한 Zod 스키마 패키지다. 동일한 스키마가
세 가지 역할을 동시에 수행한다.

- **friendly (Fastify)** — `fastify-type-provider-zod` 가 동일 스키마로 요청/응답을
  런타임 검증하고, 그 메타데이터로 OpenAPI 문서를 자동 생성한다.
- **web / mobile** — `@repo/shared` 의 fetch 함수가 `z.infer<typeof X>` 로 추출한
  타입으로 정적 타입을 부여한다 (런타임 파싱은 옵션).
- **route 경로** — `routes.ts` 의 `Routes.*` 가 서버 라우터 등록과 클라이언트 호출
  양쪽에 같은 문자열을 공급해, 경로 오타로 인한 미스매치를 컴파일 타임에 차단한다.

CLAUDE.md 에 명시된 핵심 규칙 그대로다 — _"FE/BE 모두 사용하는 타입/검증 로직은 반드시
`packages/api-contract/src/schemas/` 에 zod 스키마로 정의한다"_ ([CLAUDE.md](../../CLAUDE.md)).

## Architecture [coverage: high — 43 sources]

### 디렉터리 구조

```
packages/api-contract/
├── package.json          # exports: src/*.ts 직접 노출 (no build). lint 스크립트 + eslint devDep 신규
├── tsconfig.json         # @repo/config/tsconfig/base.json 상속
├── eslint.config.mjs     # **신규** @repo/config/eslint/base flat config + dist/·node_modules/ ignore
└── src/
    ├── index.ts          # 모든 스키마 + Routes namespace + calculator + drink-kinds 재내보내기
    ├── routes.ts         # API_PREFIX + 도메인별 경로 상수 (Auth/Users/Picks/Admin/Media/Crawl(+tabling)/Restaurant/Canonical/Analytics/Schedule/AutoDiscover/RandomCrawl/Food/Meal/Ai/Logs/SettingsMap/SettingsTelegram/SettlementExtraction/SettlementContact/Settlement/Vote/SettlementDraft/Bus/Subway/AirQuality/Weather/LifeMap/Housing/ReviewSearch/ReviewClustering/Tarot/Saju(경로 /saju-c)/SajuG/UsageQuota + Health 상수 — 35 namespace) — **이번 라운드(2026-09-07)**: Housing/Tarot/Saju/SajuG/UsageQuota 5 namespace 신설 + Restaurant.publicMenuNutrition + Food.adminMenuLexicon* (직전: Food/Meal/AirQuality/Weather/LifeMap(2026-08-30) · Vote(07-13) · Subway(07-07) · Bus(07-06))
    ├── settlement.calculator.ts # FE/BE 공통 분배 알고리즘 — 카테고리별 풀 + 제외 플래그 → shareAmounts[]. 멀티라운드(calculateMultiRoundShares + effectiveExcludes + perCategoryShares 매트릭스). **이번 라운드(18차)**: 세부 분배 그룹(GroupCalcInput/GroupShareBreakdown/toGroupCalcInputs) — EQUAL/GLASSES(잔수 가중) 흡수
    ├── settlement.drink-kinds.ts # **신규(18차)** 술·음료 종류 사전 — FE 그룹제안·BE 추출보정·프롬프트 힌트 단일 소스. DRINK_KINDS + matchDrinkKind + isGroupableCategory + DRINK_BRAND_PROMPT_HINT. zod 아님(순수 데이터·함수, settlement-extraction 의 ReceiptItemCategoryType type-only import)
    └── schemas/
        ├── common.ts                # Id, Timestamp, ErrorResponse, Pagination
        ├── auth.ts                  # Register/Login/AuthResponse
        ├── user.ts                  # Role, User, PublicUser
        ├── picks.ts                 # Pick, PickCategory, Create/Update/Result
        ├── admin.ts                 # AdminUsersResponse, SetRole
        ├── crawl.ts                 # NaverPlace 크롤러 + Job/SSE Event + VisitorReview + 네이버 검색 + 캐치테이블 + 다이닝코드 + 테이블링(18차). **이번 라운드(19차)**: MenuGroup/MenuGroupItem(네이버 /menu/list 그룹) + NaverPlaceData.menuGroups optional
        ├── restaurant.ts            # 어드민/공개 식당 + 리뷰 분석 + summary SSE + insights/smart-pick + analytics backfill + canonical 단위 list (sources[]) + RestaurantCategoryTreeResult + PublicReviewsQuery.tip/menu + RegionStats*/PublicSourceTabling/PublicStoredReviewCount(18차) + menuGroups optional(19차). **이번 라운드(2026-08-17)**: RestaurantListQuery.q(어드민 통합 검색) + reviewsFirstPage 정렬 계약 = 실제 방문일 desc(폴백 fetchedAt desc)
        ├── canonical.ts             # 가게 정체(canonical) 통합 — candidates/merge/split/dismissSuggestion + proposal 큐 + canonical 삭제
        ├── menu-grouping.ts         # 식당 단위 메뉴 정규화 + ranking + grouping job (다건/SSE)
        ├── auto-discover.ts         # 맛집 자동 발견 잡 — AI 키워드 8개 → 다중 검색 → 그룹 직렬 크롤. state + phase 두 enum 분리 + awaiting_confirmation(후보 확인 대기)
        ├── analytics.ts             # 글로벌 메뉴 통계 + 머지 잡 + category tree (z.lazy 재귀)
        ├── schedule.ts              # 주기 자동 실행 — cron 으로 "정규화 → 글로벌 머지" 예약. 5 enum + config/run/SSE/preview (12 export). cron 검증은 croner(서버) — 패키지는 croner 미의존
        ├── random-crawl.ts          # **신규(18차)** 맛집 자동 발굴 — cron 으로 지역(랜덤/고정) 선정 → 검색 → 텔레그램 후보 전송 → 사용자가 고른 가게만 크롤. schedule 과 같은 인프로세스 croner, jobType='random-crawl'. 비동기 상태머신(awaiting_selection). RegionTree/RegionDongList(지역 드롭다운)
        ├── ai.ts                    # AI 호출 + 배치 + LLM Provider 관리. **이번 라운드(2026-08-22)**: LlmProviderPurpose 5종(chat/image/log-analysis/meal-photo/meal-recommend). 18차: 'log-analysis' + LlmKeySource/LlmModelSource + 텔레메트리
        ├── review-search.ts         # **신규(18차)** 리뷰 RAG/문맥검색 — enrich(임베딩 생성) + ask(HyDE+검증 가드레일) + 공개 QA(placeId) + enrich 상태/진행 SSE
        ├── review-clustering.ts     # **신규(18차)** 임베딩 군집화(배치) — UMAP→HDBSCAN→c-TF-IDF + LLM 라벨. 공개는 placeId 읽기 전용(질의 비용 0). 전부 노이즈 시 관점집계 폴백(aspectSummary)
        ├── logs.ts                  # **신규(18차)** 범용 작업 로그 — run/스텝로그/실패 LLM 분석 보고서. OperationFeature **12종(2026-08-22: food-import/meal-recognition/meal-recommendation 추가)** + AiErrorCode 합성 enum + cursor pagination
        ├── settings-map.ts          # 외부 지도 SDK provider config (admin + public reveal). DB 우선 + .env fallback, source enum
        ├── telegram-settings.ts     # **신규(18차)** 텔레그램 봇 설정 — DB 우선 + .env fallback(source enum), 토큰 마스킹 + 연결테스트 + chat_id 자동탐색
        ├── bus.ts                   # **신규(19차)** 서울시 버스 — 정류장 검색(DB 30일 캐시) + 실시간 도착/차량 위치(무캐싱 프록시) + 좌표 주변 정류장 + 노선 상세 합본. WGS84 좌표 zod 범위 강제(lat 33~39/lng 124~132)
        ├── bus-favorite.ts          # **신규(19차)** 버스 즐겨찾기 — 정류장 / 정류장×노선 조합. 스냅샷 보존(재조회 불필요), BUS_FAVORITES_MAX=100, 게스트→로그인 union sync. BusStationItem 재사용(import)
        ├── subway.ts                # **신규(2026-07-07)** 수도권 전철 — 역 검색 + 좌표 주변 역 + 실시간 도착/열차 위치 + 호선 상세(sections) + 역 시간표 + 시간대별 혼잡 + 경로 탐색 결과. stationId=`${lineId}:${name}` 합성, lineId=subwayId(4자리). 로컬 적재라 쿼터 없음
        ├── subway-favorite.ts       # **신규(2026-07-07)** 전철 즐겨찾기 — 역 / 역×호선 조합. SUBWAY_FAVORITES_MAX=100, 게스트→로그인 union sync. 자체 역/호선 스냅샷 정의
        ├── restaurant-favorite.ts   # (2026-07-13) 맛집 즐겨찾기 — 저장 시점 스냅샷, RESTAURANT_FAVORITES_MAX=100, 전체 목록 응답
        ├── vote.ts                  # (2026-07-13) 그룹 투표 픽 — CreateVoteInput(후보 2~8)·SharedVoteSession·SubmitBallotInput·VoteDecidedBy. 공개는 /share/* 관례
        ├── bulk-job.ts              # (2026-08) makeBulkJobSchemas(itemSchema) 팩토리 — MenuGrouping/DiningcodeBulkSave/TablingBulkSave 3패밀리 공통 state/snapshot/이벤트
        ├── air-quality.ts           # **신규(2026-08-21)** 에어코리아 대기정보 — 시도별/측정소 이력/나쁨/예보/주간예보 + 측정소정보(목록·주변·검색) + 내 대기 위치. 값 정규화("-"→null, 등급 1~4 union), fetchedAt+stale 공통
        ├── weather.ts               # **신규(2026-08-21)** 기상청 단기·중기예보 + API허브 AWS — 세로 행(category) 을 시각별 가로 접기, WeatherPrecip 범주 정규화, base/fallback/stale
        ├── life-map.ts              # **신규(2026-08-21)** 일상지도 — bbox+zoom 로 points|cells 분기, 레이어 discriminatedUnion(cctv/toilet/hospital), 주변·VWorld 검색·적재 상태. 업스트림 없음(로컬 SQLite)
        ├── housing.ts               # **신규(2026-08-30, 254fb76)** 집값 — 아파트 실거래가(매매/전월세)+단지 마스터+공시가격·K-apt·건축물대장 공개 조회. life-map 골격(bbox+zoom → points|cells) + 축 dealType×band 스프레드(housingAxisFields), 만원 정수, latest→fallback→official 배지 폴백. 로컬 SQLite(stale 없음)
        ├── allergen.ts              # **신규(2026-08-24)** 알레르기 유발물질 19종 enum + 한글 라벨 + FoodAllergenStatus(unknown/inferred/verified) — food·meal 이 같은 enum 공유
        ├── food.ts                  # **신규(2026-08-22)** 음식 카탈로그 — 2축 분류+cuisine enum(utils foodTaxonomy 와 동일 순서), FoodItem, 자동완성/식당 역검색, 어드민 CRUD/통계/충돌 큐/인식 품질, 적재 잡(random-crawl 5-키 골격 + SSE). **이번 라운드(2026-09-02)**: FoodSource 8종(mfds-raw/curated 추가, CLI 전용) + FoodItem.kcalPer100g
        ├── menu-nutrition.ts        # **신규(2026-09-02~03, ac0e191→9e09950)** 공개 식당 메뉴 칼로리 — 메뉴 탭 지연 조회(상세 응답에 안 넣음). MenuKcalBasis 4종·MenuKcalMatchedBy 10종·세트 parts·100g당 portion·llmPending. 메뉴명 문자열 join
        ├── menu-lexicon.ts          # **신규(2026-09-03, fb12027)** 칼로리 판정 엔진 어휘(어드민 편집) — MenuLexiconKind 10종(modifier/size/synonym/set/option/suffix_block/raw_suffix/quantifier/alias/portion), target 필수 종류 상수
        ├── meal.ts                  # **신규(2026-08-22~23)** 식단 관리 — 기록/사진/인식 스냅샷(.strict)/통계/선호(가중치 7축)/추천+불변 이벤트/내보내기/보존/백업(JSON+base64, 상한 9상수)/전체 삭제(확인 리터럴). 1,041줄 최대 파일
        ├── tarot.ts                 # **신규(2026-09-03, cd5a29b·98df15a·5d0c4c7)** 타로 — 공개 리딩(무인증, X-Guest-Key)·회원 기록·공유(게스트는 입력 재전송)·메뉴 타로(v3a). enum 은 utils tarotCards/tarot 과 같은 값·순서(friendly 테스트 검증), 뽑기는 클라이언트·서버는 검증만
        ├── saju.ts                  # **신규(2026-09-06, f8e5dd0~e40b4c0)** 사주(C) — 입력·원국 스냅샷(utils SajuChart 동형)·섹션 4 병렬 job + long-poll(after/wait, 410)·오늘·궁합·택일·오행 음식·프로필·기록·공유. 경로는 /saju-c(5f49026). tarot.ts 의 게스트 키 헤더 상수만 import
        ├── saju-g.ts                # **신규(2026-09-06~07, e40b4c0·82ab04a)** 사주(G) — 다른 세션의 별도 구현(/saju-g). 문자열 날짜 입력 + superRefine 3종, LLM 보고서 길이 상한, receipt 보관, revision 낙관 잠금 프로필, 두 사람 궁합, 공개 상징만 공유(토큰 10|32자 + revokeToken)
        ├── usage-quota.ts           # **신규(2026-09-03, cd5a29b)** 공용 사용량 한도 — UsageQuotaFeature(tarot-reading/saju-reading/saju-g-reading) × 게스트·IP·전역 일일 + IP 분당 + guestCutoffPct. 회원은 게스트·IP 일일 한도 면제. 어드민 설정·그날 사용량
        ├── settlement-extraction.ts # 영수증 업로드(token)/추출(vision LLM) + ReceiptItemCategory enum + ExtractReceiptSplit (count/index) + roundIndex/roundTotal
        ├── settlement.ts            # N차(rounds) 정산 — SettlementRound/RoundAttendee + 마스터 participants + categoryAdjustments + 할인 + ShareTtl/ShareOgImage. UpdateSettlementInput=CreateSettlementInput(전체 replace) + fromDraftId. **이번 라운드(18차)**: 세부 분배 그룹(SettlementItemGroup/GroupMember/GroupSplitMode=EQUAL/GLASSES) + categoryAdjustments leftover 단일→배열(leftoverParticipantIds[])
        ├── settlement-contact.ts    # 사용자별 단골 참여자 CRUD — list/update + lastExclude* 기억
        └── settlement-draft.ts      # 정산 입력 임시저장 (자동저장/다기기 동기화) — payload z.unknown(), 200KB cap, (userId, placeId) unique
```

### 빌드 없는 src 직접 노출

[packages/api-contract/package.json](../../packages/api-contract/package.json) 는 `dist/`
가 아니라 `src/` 를 그대로 `exports` 한다.

```json
"main": "./src/index.ts",
"types": "./src/index.ts",
"exports": {
  ".": "./src/index.ts",
  "./schemas/*": "./src/schemas/*.ts",
  "./routes": "./src/routes.ts"
}
```

이 구조 덕분에 tsx (friendly), Vite (web), Metro (mobile) 가 모두 워크스페이스 소스를
바로 트랜스파일한다. Turborepo 의 변경 감지도 빌드 산출물을 거치지 않기 때문에
`pnpm typecheck` 한 번이면 모든 소비자가 즉시 영향을 본다. friendly 는 `injected`
의존성 (workspace + nodeLinker=hoisted) 으로 src 를 직접 본다 — 빌드 산출물 없이도
런타임에서 이 패키지가 그대로 import 가능한 이유.

### 도메인 분할

[src/index.ts](../../packages/api-contract/src/index.ts) 는 단순한 배럴 — 도메인별
파일을 그대로 `export *` 하고, `routes.ts` 는 `Routes` 네임스페이스로 재노출한다.
**이번 라운드(2026-09-07)에 신규 7개 re-export** — `housing` 은 `life-map` 뒤, `menu-nutrition`/
`menu-lexicon` 은 `food` 뒤·`meal` 앞, `tarot`/`saju`/`saju-g`/`usage-quota` 는 `vote` 뒤·
`settlement.calculator` 앞. `tarot` 이 `saju` 앞에 오는 것은 `saju.ts → tarot.ts`(게스트 키 헤더 상수)
import 의 역순 배치. (2026-08-30 라운드엔 6개 — `air-quality`/`weather`/`life-map`/`allergen`/`food`/
`meal` — 가 `subway-favorite` 뒤·`settlement-extraction` 앞에 추가됐고 `allergen` 이 `food`/`meal` 보다
앞에 오는 것은 `meal → food → allergen` 체인의 역순. 2026-07-13 라운드엔 `restaurant-favorite`/`vote`/
`bulk-job`, 2026-07-07 에는 `subway`/`subway-favorite` 2개, 19차에는 `bus`/`bus-favorite` 2개, 18차에는
5개 — `random-crawl`/`review-search`/`review-clustering`/`logs`/`telegram-settings` — 와
`settlement.drink-kinds.js` 한 줄.) schemas/ 파일은 **43개**.

```ts
export * from './schemas/common.js';
export * from './schemas/auth.js';
export * from './schemas/user.js';
export * from './schemas/picks.js';
export * from './schemas/admin.js';
export * from './schemas/crawl.js';
export * from './schemas/restaurant.js';
export * from './schemas/canonical.js';
export * from './schemas/menu-grouping.js';
export * from './schemas/auto-discover.js';
export * from './schemas/analytics.js';
export * from './schemas/schedule.js';
export * from './schemas/random-crawl.js';        // 신규 (18차)
export * from './schemas/ai.js';
export * from './schemas/review-search.js';       // 신규 (18차)
export * from './schemas/review-clustering.js';   // 신규 (18차)
export * from './schemas/logs.js';                // 신규 (18차)
export * from './schemas/settings-map.js';
export * from './schemas/telegram-settings.js';   // 신규 (18차)
export * from './schemas/bus.js';                 // 신규 (19차)
export * from './schemas/bus-favorite.js';        // 신규 (19차)
export * from './schemas/subway.js';              // 신규 (2026-07-07)
export * from './schemas/subway-favorite.js';     // 신규 (2026-07-07)
export * from './schemas/air-quality.js';         // 신규 (2026-08-21)
export * from './schemas/weather.js';             // 신규 (2026-08-21)
export * from './schemas/life-map.js';            // 신규 (2026-08-21)
export * from './schemas/housing.js';             // 신규 (2026-08-30)
export * from './schemas/allergen.js';            // 신규 (2026-08-24) — food/meal 이 import
export * from './schemas/food.js';                // 신규 (2026-08-22)
export * from './schemas/menu-nutrition.js';      // 신규 (2026-09-02)
export * from './schemas/menu-lexicon.js';        // 신규 (2026-09-03)
export * from './schemas/meal.js';                // 신규 (2026-08-22)
export * from './schemas/settlement-extraction.js';
export * from './schemas/settlement.js';
export * from './schemas/settlement-contact.js';
export * from './schemas/settlement-draft.js';
export * from './schemas/vote.js';
export * from './schemas/tarot.js';               // 신규 (2026-09-03) — saju 가 import
export * from './schemas/saju.js';                // 신규 (2026-09-06) — 사주(C)
export * from './schemas/saju-g.js';              // 신규 (2026-09-06) — 사주(G)
export * from './schemas/usage-quota.js';         // 신규 (2026-09-03)
export * from './settlement.calculator.js';
export * from './settlement.drink-kinds.js';      // 신규 (18차) — 순수 데이터/함수
export * as Routes from './routes.js';
```

ESM `.js` 확장자는 TypeScript NodeNext 해석을 위한 의도적 표기 (실파일은 `.ts`).
`settlement.calculator.ts` 와 신규 `settlement.drink-kinds.ts` 는 schemas/ 가 아닌
패키지 루트에 두는데, 둘 다 zod "wire shape" 가 아니라 도메인 로직/사전이고 schemas 의
타입을 type-only import 하는 (역방향) 순수 모듈이라 분리했다.

### 도메인 간 의존 방향 (one-way)

`restaurant.ts` 가 `crawl.ts` 의 `NaverPlaceData`/`VisitorReview` 뿐 아니라
공개 상세에 평탄화해 노출하는 `BlogReview`/`MenuItem` 까지 import 한다. 역방향은
절대 없다. `visitor_batch` SSE 가 페이로드로 실어 보내는 `PersistedVisitorReview`
도 — 의미상 "맛집 상세에 머지될 행" 이지만 — 의도적으로 `crawl.ts` 에 정의했다.

`restaurant.ts` 가 `crawl.ts` 의 `DiningcodeShopBusinessHour` 를 추가로 import 한다.
직전 라운드에 추가된 `canonical.ts` 의 `CanonicalSuggestion` import 도 유지
(`CanonicalListItem.suggestion`). 17차에 restaurant.ts 가 `analytics.ts` 의
`CategoryTreeNode` 를 import (`RestaurantCategoryTreeResult.roots`). **이번 라운드(18차)
restaurant.ts 가 `crawl.ts` 의 테이블링 타입들(`TablingServiceFlags`/`TablingRatingItem`/
`TablingBusinessDay`)도 새로 import** — 공개 상세의 `PublicTablingAddon` 이 테이블링 보조
정보를 노출하기 때문. **이번 라운드(19차) restaurant.ts 가 `crawl.ts` 의 `MenuGroup` 도
새로 import** — 공개 상세의 `menuGroups`(optional)가 네이버 원본 메뉴 그룹 모양을 재사용한다.
방향은 restaurant → crawl / canonical / analytics 한쪽 —
canonical·analytics 는 어떤 다른 도메인 스키마도 import 하지 않는다. `auto-discover.ts` 도
자체 타입만 사용. `menu-grouping.ts` 는 여전히 독립.

**신규 버스 2개 파일의 의존 방향**: `bus.ts` 는 다른 schemas/ 를 전혀 import 하지 않는
자기완결 도메인 (WGS84 좌표 zod 범위·정류소 ID 계약을 자체 정의). **`bus-favorite.ts` 는
`bus.ts` 의 `BusStationItem` 하나만 import** — 정류장 즐겨찾기 항목이 곧 정류장 스냅샷
(`BusFavoriteStationItem = BusStationItem`)이고, PUT body 도 `BusStationItem.omit({ stId })`
로 파생한다. 방향은 bus-favorite → bus 한쪽뿐.

**신규 전철 2개 파일의 의존 방향(2026-07-07)**: 버스와 대칭이지만 한 가지 다르다 — `subway.ts` 는
다른 schemas/ 를 import 하지 않는 자기완결 도메인. `subway-favorite.ts` 는 즐겨찾기 항목
(`SubwayFavoriteStationItem`/`SubwayFavoriteLineItem`)을 **자체 정의**하고 PUT body 를 `.omit`
으로 파생한다 — 버스가 `BusStationItem` 을 재사용(import)한 것과 달리 전철은 검색 결과 모양
(`SubwayStationGroupItem`, 한 역에 여러 호선이 묶임)과 즐겨찾기 단위(역 하나 / 역×호선 하나)가
어긋나 재사용하지 않고 스냅샷을 새로 뒀다. 방향 자체는 두 파일 모두 다른 schemas/ 미import.

**신규 6개 파일의 의존 방향(2026-08-30)**: `air-quality.ts`·`weather.ts`·`life-map.ts` 는 다른
schemas/ 를 전혀 import 하지 않는 자기완결 도메인(bus/subway 와 같은 정책 — WGS84 좌표 범위·
`fetchedAt`/`stale` 공통 필드를 각자 선언, 공유 베이스 추출 없음). 식단 3파일은 **한 방향 체인
`meal → food → allergen`**: `allergen.ts` 는 자기완결(19종 enum + 한글 라벨 사전 +
`FoodAllergenStatus`), `food.ts` 가 `MealAllergen`/`FoodAllergenStatus` 를 import(카탈로그 행의
알레르겐 필드·어드민 입력), `meal.ts` 가 `MealAllergen` + `food.ts` 의 분류 3 enum
(`FoodDishType`/`FoodMainIngredient`/`FoodCuisine`) 을 import(기록 항목·인식 결과·추천 후보의
분류 스냅샷). 역방향 없음 — food 는 meal 을 모른다(카탈로그가 마스터, 기록이 소비자).
`logs.ts → ai.ts` 처럼 enum 을 스프레드하지는 않고 스키마를 필드로 재사용하는 compose 방식.
`FoodDishType` 등 분류 키의 라벨·매핑 헬퍼는 `@repo/utils foodTaxonomy.ts` 에 같은 키 순서로
있고 friendly 테스트가 두 목록의 동일성을 검증한다(utils → api-contract 방향은 없고, 순서 동일성만
테스트로 묶음).

**신규 7개 파일의 의존 방향(2026-09-07)**: 유일한 cross-import 는 **`saju.ts → tarot.ts`** —
`SAJU_GUEST_KEY_HEADER = TAROT_GUEST_KEY_HEADER` 상수 하나(값 `'x-guest-key'`)뿐이고 zod 스키마는
공유하지 않는다(`SajuFoodPick` 이 `TarotMenuPick` 과 같은 필드를 갖지만 각자 선언). `saju-g.ts` 는
같은 헤더 값을 `SAJU_G_GUEST_KEY_HEADER` 로 **자체 선언**해 사주(C)와 어떤 import 관계도 없다(두 구현이
스키마·모듈·DB 를 공유하지 않는다는 경계가 파일 의존에도 드러남). `usage-quota.ts` 는 소비 기능을
`UsageQuotaFeature` enum 으로 열거할 뿐 tarot/saju 를 import 하지 않는다(역방향도 없음 — 각 도메인의
`quota.remainingToday` 는 자체 object). `housing.ts`·`menu-nutrition.ts`·`menu-lexicon.ts` 는 자기완결 —
menu-nutrition 이 `RestaurantPublicDetail.menus[].name` 과 문자열로 join 되지만 restaurant.ts 를 import
하지 않는다(스키마 참조 대신 이름 동일성 계약). `tarot.ts`/`saju.ts` 는 `@repo/utils` 의 카드·명식 데이터와
같은 enum 값이어야 하지만 utils 를 import 하지 않고 friendly 테스트가 `.options` 동일성을 검증(food ↔
foodTaxonomy 와 같은 방식).

`schedule.ts` 는 다른 schemas/ 파일을 전혀 import 하지 않는다 — 자체 enum/object 만
정의한다. 특히 cron 식의 형식 검증을 `croner` 같은 외부 런타임 라이브러리에 의존하지
않고, 단순 `z.string().min(1).max(120)` 길이 검사만 둔다. **신규 `random-crawl.ts` 도
같은 정책** — schedule 과 같은 인프로세스 croner 스케줄러를 공유하지만 스키마는 croner
미의존(cronExpr 길이 검사만), 다른 schemas/ 도 import 하지 않고 자체 enum/object 로 완결.

**신규 5개 파일의 의존 방향**:
- **`review-search.ts` / `review-clustering.ts`** — 둘 다 다른 schemas/ 를 전혀 import
  하지 않는 자기완결 도메인. `review-clustering.ts` 의 `aspects`/`aspectSummary` 가
  관점-극성을 `{ key, count }` 배열·`{ aspect, pos, neg, neu }` 로 표현하는데, zod
  버전 무관·와이어 명시성을 위해 `z.record` 대신 배열을 택했다(코드 주석에 명시).
- **`telegram-settings.ts`** — 자체 타입만. `MapProviderConfig`/`LlmProviderConfig` 와 같은
  "DB 우선 + .env fallback + source enum + 토큰 마스킹" 패턴이지만 의도적으로 중복 선언.
- **`logs.ts` 는 예외적으로 `ai.ts` 를 import 한다** — `common.ts` 의
  `PaginationQuerySchema`/`PaginatedSchema` 와 더불어, `ai.ts` 의 **`AiErrorCode.options`
  를 스프레드해 `LogAnalysisErrorCode` enum 을 합성**한다 (`z.enum([...AiErrorCode.options,
  'no_analysis_llm', 'parse_failed', 'run_not_failed', 'analysis_in_flight'])`). provider
  에러 코드에 분석 고유 사유를 더하는 enum 확장 패턴 — zod enum 의 `.options` 재사용.

`settings-map.ts` 는 다른 어떤 schemas/ 파일도 import 하지 않는다 — provider config
모델은 LLM `LlmProviderConfig` 와 형태가 비슷하지만 의도적으로 중복 선언했다.

정산 패밀리 내부:
- `settlement.ts` 가 `settlement-extraction.ts` 의 `ReceiptItemCategory` 만 import.
- `settlement-contact.ts` 는 자체 타입만 — 단골 row 의 모양은 세션 참여자와 독립이다.
- **`settlement-draft.ts` 는 다른 schemas/ 파일을 전혀 import 하지 않는다** — payload 가
  `z.unknown()` 라 정산 본문 스키마의 어떤 모양에도 묶이지 않는 것이 핵심 디자인.
- `settlement.calculator.ts` 는 `settlement.ts` 의 `SettlementItemInputType` +
  `SettlementParticipantInputType` + **`SettlementGroupSplitModeType`/`SettlementItemGroupType`
  (18차 그룹 분배)** 와 `settlement-extraction.ts` 의 `ReceiptItemCategoryType` 타입만
  type-only import. 런타임 zod 스키마에는 의존하지 않는다 (순수 계산).
- **`settlement.drink-kinds.ts` 는 `settlement-extraction.ts` 의 `ReceiptItemCategoryType`
  만 type-only import** — 그 외엔 순수 데이터(`DRINK_KINDS`)와 매칭 함수(`matchDrinkKind`).
  zod 스키마가 아니라 와이어 shape 가 아닌 "도메인 사전"이라 schemas/ 밖 패키지 루트에 둠
  (calculator 와 같은 위상). FE 그룹 제안·BE 추출 보정·추출 프롬프트 힌트 세 곳을 단일
  소스로 먹인다.

## Talks To [coverage: medium — 4 sources]

- **friendly (apps/friendly)** — 각 `*.route.ts` 가 `RegisterInput`, `CrawlEvent`,
  `RestaurantListResult`, `RestaurantPublicDetail`, `RestaurantPublicReviewsQuery/Result`,
  `RestaurantSummaryReviewEvent`, `RestaurantInsights`, `RestaurantSmartPickInput/Result`,
  `MenuRankingResult`, `MenuGroupingJobInput/Snapshot`, `CanonicalCandidatesResult`,
  `CanonicalMergeInput/Result`, `CanonicalSplitInput/Result`, `CanonicalProposalListResult`,
  `CatchtableSearchQuery/Response`, `CatchtableShopData/MenusResponse/ReviewOverviewResponse`,
  `DiningcodeSearchQuery/Response`, `DiningcodeShopData/ReviewsResponse`,
  `DiningcodeBulkSaveJobInput/Snapshot/ItemEvent/DoneEvent`, `GlobalMenuResult`,
  `CategoryTreeResult`, `AutoDiscoverJobInput/Snapshot/KeywordEvent/CandidateEvent/PhaseEvent/DoneEvent`,
  `AiCompleteInput`, `PreviewLlmModelsInput/Result`, `UpdateLlmProviderInput`,
  `MapProviderConfig`, `CreateSettlementInput`, `UpdateSettlementInput`, `SettlementSession`,
  `SharedSettlementSession`, `UpsertSettlementDraftInput`, `ListSettlementDraftsResult`,
  `ExtractReceiptInput` (split/round 포함), `ScheduleConfig`/`ScheduleConfigInput`,
  `ScheduleRunList`, `ScheduleProgressEvent`/`ScheduleDoneEvent` (SSE), `SchedulePreviewInput/Result`,
  `RestaurantCategoryTreeResult`, **이번 라운드(18차)** `ReviewAskInput`/`ReviewAskResult`,
  `ReviewPublicAskBody`/`ReviewQaReadyResult`, `ReviewEnrichStatusList`/`ReviewEnrichProgressEvent`(SSE),
  `ReviewClustersResult`/`ReviewClusterRunResult`/`ReviewClusterStatusList`, `RandomCrawlConfig`/
  `RandomCrawlConfigInput`/`RandomCrawlRunList`/`RandomCrawlProgressEvent`(SSE)/`RegionTree`/`RegionDongList`,
  `OperationRunList`/`OperationRunDetail`/`OperationLogsResult`/`AnalyzeRunResult`/`LogConfigSchema`,
  `TelegramConfig`/`UpdateTelegramConfigInput`/`TelegramTestResult`/`TelegramChatIdResult`,
  `LlmTelemetrySnapshot`, `TablingSearch*`/`TablingShop*`(crawl), `RegionStatsResult`,
  **이번 라운드(19차)** `BusStationSearchQuery`/`BusStationSearchResult`, `BusArrivalsParams`/
  `BusArrivalsResult`, `BusNearbyQuery`/`BusNearbyResult`, `BusPositionsParams`/`BusPositionsQuery`/
  `BusPositionsResult`, `BusRouteDetailParams`/`BusRouteDetailResult`, `BusFavoritesResult`/
  `BusFavoritesSyncBody`/`BusFavoriteStationUpsertBody`/`BusFavoriteRouteUpsertBody`,
  **이번 라운드(2026-07-07)** `SubwayStationSearchQuery`/`SubwayStationSearchResult`,
  `SubwayNearbyQuery`/`SubwayNearbyResult`, `SubwayArrivalsParams`/`SubwayArrivalsResult`,
  `SubwayPositionsParams`/`SubwayPositionsResult`, `SubwayLineDetailParams`/`SubwayLineDetailResult`,
  `SubwayTimetableParams`/`SubwayTimetableResult`, `SubwayCongestionParams`/`SubwayCongestionResult`,
  `SubwayPathQuery`/`SubwayPathResult`, `SubwayFavoritesResult`/`SubwayFavoritesSyncBody`/
  `SubwayFavoriteStationUpsertBody`/`SubwayFavoriteLineUpsertBody`,
  **이번 라운드(2026-08-30)** `AirSidoParams`/`AirSidoRealtimeResult`, `AirStationHistoryParams`/
  `AirStationHistoryQuery`/`AirStationHistoryResult`, `AirBadStationsResult`, `AirForecastQuery`/
  `AirForecastResult`, `AirWeeklyForecastQuery`/`AirWeeklyForecastResult`, `AirStationsResult`,
  `AirNearbyQuery`/`AirNearbyResult`, `AirStationSearchQuery`/`AirStationSearchResult`,
  `AirLocationUpsertBody`/`AirLocationResult`, `WeatherGridQuery`/`WeatherNowcastResult`/
  `WeatherForecastResult`/`WeatherVersionsResult`, `WeatherMidQuery`/`WeatherMidResult`,
  `WeatherMidSeaQuery`/`WeatherMidSeaResult`, `WeatherAwsQuery`/`WeatherAwsResult`,
  `LifeMapPointsQuery`/`LifeMapPointsResult`, `LifeMapNearbyQuery`/`LifeMapNearbyResult`,
  `LifeMapSearchQuery`/`LifeMapSearchResult`, `LifeMapDetailParams`/`LifeMapItem`,
  `LifeMapStatusResult`, `FoodSearchQuery`/`FoodSearchResult`, `FoodRestaurantsQuery`/
  `FoodRestaurantsResult`, `FoodAdminListQuery`/`FoodAdminListResult`, `FoodAdminCreateInput`/
  `FoodAdminUpdateInput`, `FoodAdminStats`, `FoodMergeConflictListQuery`/`...ListResult`/
  `FoodMergeConflictResolveInput`, `FoodRecognitionQualityQuery`/`...Result`, `FoodImportConfig`/
  `FoodImportConfigInput`/`FoodImportRunInput`/`FoodImportRunList`/`FoodImportPreviewInput`/
  `...Result`/`FoodImportProgressEvent`·`DoneEvent`(SSE), `CreateMealEntryInput`/
  `UpdateMealEntryInput`/`MealEntry`, `ListMealEntriesQuery`/`ListMealEntriesResult`,
  `MealCalendarQuery`/`MealCalendarResult`, `MealStatsQuery`/`MealStatsResult`,
  `MealTimePresetsResult`, `RecentMealItemQuery`/`RecentMealItemResult`, `UploadMealPhotoResult`,
  `RecognizeMealInput`/`RecognizeMealResult`, `MealPreference`/`UpdateMealPreferenceInput`,
  `CreateMealRecommendationInput`/`MealRecommendation`/`ListMealRecommendationsQuery`/`...Result`/
  `MealRecommendationContext`/`MealRecommendationFeedbackInput`/`MealRecommendationEventInput`/
  `MealRecommendationEvent`, `MealDataExport`, `MealDataBackup`/`RestoreMealDataResult`,
  `MealPhotoRetentionQuery`/`MealPhotoRetentionPreview`/`DeleteMealPhotosInput`/`...Result`,
  `DeleteMealDataInput`/`DeleteMealDataResult`,
  **이번 라운드(2026-09-07)** `HousingPointsQuery`/`HousingPointsResult`, `HousingNearbyQuery`/
  `HousingNearbyResult`, `HousingSearchQuery`/`HousingSearchResult`, `HousingComplexParams`/
  `HousingComplexDetail`, `HousingTradesQuery`/`HousingTradesResult`, `HousingStatusResult`,
  `RestaurantMenuNutrition`(restaurant 모듈 라우트), `MenuLexiconListQuery`/`MenuLexiconListResult`/
  `MenuLexiconCreateInput`/`MenuLexiconIdParams`, `CreateTarotReadingInput`/`TarotReadingResult`,
  `CreateTarotShareInput`/`TarotShareResult`/`SharedTarotReading`, `ListTarotReadingsQuery`/
  `ListTarotReadingsResult`, `CreateSajuReadingInput`/`SajuReadingResult`, `SajuJobPollQuery`/
  `SajuJobPollResult`, `SajuDailyInput`/`SajuDailyResult`, `SajuMatchInput`/`SajuMatchResult`,
  `SajuDatePickInput`/`SajuDatePickResult`, `SajuFoodInput`/`SajuFoodResult`, `SajuProfileInput`/
  `SajuProfile`/`SajuProfileList`, `ListSajuReadingsQuery`/`ListSajuReadingsResult`,
  `CreateSajuShareInput`/`SajuShareResult`/`SharedSajuReading`, `CreateSajuGReadingInput`/
  `SajuGReadingResult`, `CreateSajuGPairInput`/`SajuGPairChart`/`SajuGPairResult`, `SajuGProfileInput`/
  `UpdateSajuGProfileInput`/`SajuGProfileList`, `CreateSajuGShareInput`/`SajuGShareResult`(+`503:
  SajuGShareError`)/`PublicSajuGShare`/`RevokeSajuGShareInput`, `UsageQuotaOverviewQuery`/
  `UsageQuotaOverview`/`UpdateUsageQuotaSettingInput`(params `feature: UsageQuotaFeature`) 등을
  `schema: { body, response }` 로 등록. friendly 는 `LlmProviderPurpose.options` 를
  `AiConfigService.ALL_PURPOSES` 로, `OperationFeature` 를 `startRun({ feature })` 로 그대로 쓰고,
  게스트 키는 `req.headers[TAROT_GUEST_KEY_HEADER]`/`[SAJU_GUEST_KEY_HEADER]`/`[SAJU_G_GUEST_KEY_HEADER]`
  로 읽는다(`tarot.route`/`saju.route`/`saju-g.route`). 한도 소비는 `tarot.service` 의
  `TAROT_QUOTA_FEATURE = 'tarot-reading'`, `saju.service` 의 `SAJU_QUOTA_FEATURE = 'saju-reading'`,
  `saju-g.service`/`saju-g-pair.service` 의 `'saju-g-reading'` — 전부 `UsageQuotaFeature` 값.
  `tarot.test`/`saju.test` 가 `TarotSpreadId.options`/`TarotTopic.options`/`SajuTenGod.options`/
  `SajuStarId.options` 를 utils 상수와 비교한다. 도메인 흐름은 [review-search](review-search.md) /
  [review-clustering](review-clustering.md) / [random-crawl](random-crawl.md) / [logs](logs.md) /
  [schedule](schedule.md) / [analytics](analytics.md) / [tarot](tarot.md) / [saju-c](saju-c.md) /
  [saju-g](saju-g.md) / [housing](housing.md) / [usage-quota](usage-quota.md) 토픽 참조.
- **@repo/shared** — `Routes.Auth.login`, `Routes.Crawl.{jobEvents(id), catchtableSearch,
  tablingSearch, tablingShop(idx), ...}`, `Routes.Canonical.*`,
  `Routes.Restaurant.{summaryEvents, publicReviews, publicCategoryTree, regionStats, smartPick}`,
  `Routes.Analytics.*`, `Routes.Schedule.{config, run, runs, runEvents, preview}`,
  **`Routes.RandomCrawl.{config, run, runs, runEvents, preview, regions, regionDongs}`**,
  `Routes.AutoDiscover.{jobs, job(id), jobConfirm(id), jobEvents(id)}`, `Routes.SettingsMap.*`,
  **`Routes.SettingsTelegram.{config, test, resolveChatId}`**, `Routes.Ai.{complete, provider(id,
  purpose), providerModelsPreview(id, purpose), telemetry, telemetryStream}`,
  **`Routes.Logs.{runs, run(id), runLogs(id), analyze(id), config}`**,
  **`Routes.ReviewSearch.{restaurants, enrich, ask, status, enrichBg, enrichPending, enrichEvents,
  publicQaReady(placeId), publicAsk(placeId)}`**, **`Routes.ReviewClustering.{run, status, bg,
  pending, publicClusters(placeId)}`**, **`Routes.Bus.{stationSearch, stationsNearby,
  stationArrivals(arsId), busPositions(busRouteId), routeDetail(busRouteId), favorites,
  favoriteStation(stId), favoriteRoute(stId, busRouteId), favoritesSync}`**,
  **`Routes.Subway.{stationSearch, stationsNearby, stationArrivals(stationId),
  lineDetail(lineId), linePositions(lineId), stationTimetable(stationId),
  stationCongestion(stationId), path, favorites, favoriteStation(stationId),
  favoriteLine(stationId, lineId), favoritesSync}`**,
  `Routes.Settlement.{list, create, one(id), update(id),
  share(id), shared(token)}`, `Routes.SettlementDraft.{list, upsert, one(id)}`,
  `Routes.SettlementExtraction.*`, `Routes.SettlementContact.*`, **(2026-08-30)**
  `Routes.AirQuality.{sidoRealtime(sidoName), stationHistory(stationName), badStations, forecast,
  weeklyForecast, stations, stationsNearby, stationSearch, location}`, `Routes.Weather.{nowcast,
  forecast, versions, mid, midSea, aws}`, `Routes.LifeMap.{status, points, nearby, search,
  detail(layer, id)}`, `Routes.Food.{search, restaurants(foodId), adminItems, adminItem(id),
  adminStats, adminMergeConflicts, adminMergeConflict(id), adminRecognitionQuality, importConfig,
  importRun, importRuns, importRunEvents, importPreview}`, `Routes.Meal.{entries, entry(id),
  calendar, stats, timePresets, recentItem, photos, photo(token), photoThumb(token),
  photoCopy(token), recognize, preference, recommendations, recommendationContext,
  recommendationFeedback(id), recommendationEvents(id), dataExport, dataBackup, dataRestore,
  photoRetention, data}`, **(2026-09-07)** `Routes.Housing.{status, points, nearby, search, complex(id),
  trades(id)}`, `Routes.Restaurant.publicMenuNutrition(placeId)`, `Routes.Food.{adminMenuLexicon,
  adminMenuLexiconEntry(id)}`, `Routes.Tarot.{readings, shares, shared(token), myReadings, myReading(id)}`,
  `Routes.Saju.{readings, job(jobId), daily, match, datePick, food, profiles, profile(id), myReadings,
  myReading(id), shares, shared(token)}`, `Routes.SajuG.{chart, readings, pairChart, pairReading,
  profiles, profile(id), myReadings, myReading(id), shares, shared(token), shareImage(token)}`,
  `Routes.UsageQuota.{overview, setting(feature)}` 의 경로 헬퍼와 `z.infer<typeof X>`
  추론 타입을 import 해서 fetch 래퍼와 React Query 훅을 구성한다(`packages/shared/src/api/{air-quality,
  air-location,weather,life-map,food,meal,housing,tarot,saju,saju-g,usage-quota}.api.ts` +
  `hooks/use{AirQuality,AirLocation,Weather,LifeMap,Food,Meal,Housing,Tarot,Saju,SajuG,UsageQuota}.ts`
  — 상세는 [shared](shared.md)). `sharePage`/`shareImage`(웹 경로 빌더)는 shared 가 fetch 에 쓰지 않고
  friendly 가 OG 라우트 등록·응답 `path` 생성에 쓴다(`Routes.Tarot.sharePage(row.shareToken)` 등).
- **web / mobile** — `@repo/shared` 를 통해 간접 의존.

순환 의존 규칙: shared → api-contract 만 허용, 반대 방향은 금지 ([CLAUDE.md](../../CLAUDE.md)).

## API Surface [coverage: high — 40 sources]

### `schemas/common.ts` — [common.ts](../../packages/api-contract/src/schemas/common.ts)

| Export | 용도 |
| --- | --- |
| `IdSchema` / `Id` | 비어있지 않은 문자열 ID |
| `TimestampSchema` | ISO 8601 datetime 문자열 |
| `ErrorResponseSchema` / `ErrorResponse` | Fastify 에러 형식 |
| `PaginationQuerySchema` / `PaginationQuery` | `page`, `limit` (coerce, 기본 1/20, 최대 100) |
| `PaginatedSchema(item)` | 제네릭 페이지 응답 빌더 |

### `schemas/auth.ts` · `user.ts` · `picks.ts` · `admin.ts`

(변경 없음 — 직전 컴파일 본 참고. `RegisterInput`/`LoginInput`/`AuthResponse`, `Role`,
`UserSchema`/`PublicUserSchema`, `PickCategory`/`PickSchema`/`Create/UpdatePickInput`/
`PickResult`, `AdminUsersResponse`/`SetRoleParams/Body`.)

### `schemas/crawl.ts` — [crawl.ts](../../packages/api-contract/src/schemas/crawl.ts) **(테이블링 패밀리 추가)**

네이버 크롤러 + 어드민 발견용 네이버 검색 + 캐치테이블 + 다이닝코드 + **테이블링(tabling)**
패밀리. 큰 파일이지만 같은 "외부 소스 어댑터" 도메인이라 분리하지 않았다.
**이번 라운드(18차)**: `mobile-v2-api.tabling.co.kr` 무인증 REST 어댑터의 wire shape 다수
추가 — 키워드 검색(`TablingSearch*`), 가게 상세(`TablingShop*` — `TablingServiceFlags`/
`TablingRatingItem`/`TablingBusinessDay` 포함, restaurant.ts 의 `PublicTablingAddon` 이 재사용),
리뷰 커서 페이지네이션, save, 사이트맵 기반 발견(`TablingDiscover` — 검색 API 가 없어
사이트맵이 발견 백본), 일괄 저장 SSE 잡. 상세 export 표는 [crawl](crawl.md) 토픽 참조.

**이번 라운드(19차) 신규 — 네이버 메뉴 그룹**: `MenuGroupItem = MenuItem.extend({ sourceMenuId?,
sortOrder? })` + `MenuGroup = { source, sourceGroupId?, name, sortOrder?, menus: MenuGroupItem[] }`
가 추가됐고, `NaverPlaceData.menuGroups: MenuGroup[].optional()` 로 노출된다. 네이버 `/menu/list`
의 그룹 구조를 원본 그대로 담는 shape 로, 기존 평탄화 `menus: MenuItem[]` 는 유지된다(그룹을
표시할 수 있는 클라이언트만 optional 필드 사용). `restaurant.ts` 의 `RestaurantPublicDetail`
이 이 `MenuGroup` 을 재사용 — 메뉴 그룹핑 도메인 상세는 [menu-grouping](menu-grouping.md) 참조.

### `schemas/canonical.ts` · `schemas/auto-discover.ts`

(직전 라운드 그대로 — 변경 없음. `CanonicalSummary`/`CanonicalListItem`/proposal 큐,
`AutoDiscoverJobState/Phase` 분리. 각 표는 직전 컴파일 본 참고.)

### `schemas/restaurant.ts` — [restaurant.ts](../../packages/api-contract/src/schemas/restaurant.ts) **(19차: menuGroups optional / 18차: 지역 통계 + 테이블링 출처)**

대부분 직전 라운드 그대로 (`RestaurantPublicDetail` 융합 모양 + `reviewsFirstPage`,
canonical 단위 list + `RestaurantCategoryTreeResult` + `RestaurantPublicReviewsQuery.tip/menu`).
**이번 라운드(19차)**: `RestaurantPublicDetail` 에 **`menuGroups: MenuGroup[].optional()`** 추가
(`crawl.ts` 의 `MenuGroup` import). 기존 평탄화 `menus` 와 병존하는 additive 필드 — 그룹 표시
가능한 클라이언트만 사용, 없어도 무해. **18차 신규/확장**:

| Export | 용도 |
| --- | --- |
| **`RegionStatsSigungu` / `RegionStatsSido` / `RegionStatsPoint` / `RegionStatsResult` (신규)** | 어드민 홈 대시보드의 지역 통계 — 등록 가게(canonical)를 시/도·시군구로 묶은 분포. 시군구는 주소 매칭, 없으면 좌표 최근접 폴백, 둘 다 실패면 `unclassified`. `RegionStatsResult = { total, unclassified, sidos[](count desc), points[](좌표 보유 가게 — 지도 choropleth) }` |
| **`PublicSourceTabling` (신규)** | `{ idx, rating, siteReviewCount, rawSourceUrl }`. `PublicSources` 에 `naver`/`diningcode` 와 나란히 `tabling` 추가 (partner idx 티어만, 미입점 place 제외) |
| **`PublicTablingAddon` (신규)** | 공개 상세의 테이블링 보조 — `{ flags(웨이팅/예약/포장 등), ratings[](4축), favoriteCount, businessDays[] }`. canonical 에 테이블링 partner 없으면 null. `crawl.ts` 의 `TablingServiceFlags`/`TablingRatingItem`/`TablingBusinessDay` import |
| **`PublicStoredReviewCount` (신규 — 정확한 리뷰 수)** | `{ naver, diningcode, tabling, total }`. **사이트 보고 카운트(`siteReviewCount` = 네이버 reviewCount/DC reviewTotal)와 우리가 실제 적재한 리뷰 수를 분리** — 출처 필터 칩 카운트는 stored 기준 |
| `RestaurantSmartPickInput/Result` | (이전 라운드부터) 가중 랜덤 픽 — `strategy: balanced\|satisfaction\|positive`. `Routes.Restaurant.smartPick` 으로 노출 (이번 라운드 routes 표에 명시) |
| **`RestaurantListQuery.q` (신규 2026-08-17, `5e25cc0`)** | 어드민 목록 통합 검색 — `z.string().trim().min(1).max(120).optional()`. 주석이 계약: canonical 조립이 끝난 **통합 행**에서 가게명·카테고리·출처별 식별자(id/sourceId/placeId)를 **공백 토큰 AND** 로 찾는다(한 source 가 걸리면 형제 source 도 응답에 남음). 응답 `RestaurantListResult` 는 불변 |
| **`RestaurantPublicDetail.reviewsFirstPage` 정렬 계약 정정 (2026-08-17, `0d72380`)** | 주석만 변경 — "fetchedAt desc" → **"실제 방문일 desc(해석 불가 시 fetchedAt desc)"**. 정렬 구현은 `@repo/utils compareReviewRecencyDesc`(네이버 `M.D.요일` 연도를 수집 시각 KST 연도로 복원). 스키마 shape 변경 없음 — 계약 문서로서의 주석이 바뀐 케이스 |

### `schemas/schedule.ts` — [schedule.ts](../../packages/api-contract/src/schemas/schedule.ts) **(주기 자동 실행, 17차)**

관리자가 cron 으로 "정규화(grouping) → 글로벌 머지" 파이프라인을 예약. 인프로세스
스케줄러(croner)가 단일 Fastify 인스턴스 안에서 돌고, 설정은 SQLite 에 영속화돼 재시작 시
복원된다. 파이프라인 도메인 흐름은 [schedule](schedule.md) / [analytics](analytics.md) 토픽.

| Export | 용도 |
| --- | --- |
| `ScheduleJobType` | `'normalize-merge'` 단일 enum. 추후 다른 주기 작업 대비 enum 으로 둠. 설정 입력엔 없고 서버가 고정 |
| `ScheduleTrigger` | `'cron' \| 'manual'`. cron tick vs 어드민 "지금 실행" 버튼 |
| `ScheduleRunStatus` | `'running' \| 'done' \| 'failed' \| 'skipped' \| 'interrupted'`. `skipped` = 이전 run 미완 → 이번 tick overlap 방지로 건너뜀, `interrupted` = graceful shutdown(SIGTERM/SIGINT) 중 abort |
| `SchedulePhase` | `'collecting' \| 'grouping' \| 'merging' \| 'done'`. live 진행 표시용. 완료 이력 행은 null |
| `ScheduleConfig` (응답) | `{ jobType, enabled, cronExpr, timezone, lastRunAt: nullable, lastStatus: ScheduleRunStatus\|null, nextRunAt: nullable(croner.nextRun, enabled=false 면 null), updatedAt }`. 행 없으면 서버가 기본값(enabled=false + 권장 cron)으로 채워 반환 |
| `ScheduleConfigInput` (입력) | `{ enabled: bool, cronExpr: string(1..120), timezone: string(1..64).default('Asia/Seoul') }`. jobType 없음(서버 고정). cron 형식 검증은 croner(서버) — 여기선 길이만 |
| `ScheduleRun` | `{ runId, jobType, trigger, status, phase: nullable, totalTargets: int\|null(collecting 후 확정), processedCount: int, skippedCount: int(크롤 진행 중이라 제외), startedAt, finishedAt: nullable, error: nullable }`. **이력(영속) 과 live 스냅샷(메모리) 양쪽 공용 shape** |
| `ScheduleRunList` | `{ items: ScheduleRun[], inflightRunId: string\|null(진행 중 run, UI 가 SSE 붙을 대상) }` |
| `ScheduleProgressEvent` (SSE) | `{ type:'progress', runId, phase, processed:int, total:int, skipped:int, currentName: string\|null(merging 등에선 null) }` |
| `ScheduleDoneEvent` (SSE) | `{ type:'done', runId, status, finishedAt }` |
| `SchedulePreviewInput` | `{ cronExpr: string(1..120), timezone: string(1..64).default('Asia/Seoul') }`. 저장 전 검증 + 다음 실행 미리보기. 어드민 UI 가 입력 중 디바운스 호출 |
| `SchedulePreviewResult` | `{ valid: bool, error: string\|null, nextRuns: string[](valid 일 때 croner 로 계산한 다음 실행 최대 5개) }` |

### `schemas/random-crawl.ts` — [random-crawl.ts](../../packages/api-contract/src/schemas/random-crawl.ts) **(신규 — 텔레그램 기반 자동 발굴)**

cron 으로 지역을 (랜덤/고정) 선정 → 네이버 검색 → 텔레그램으로 후보 N개를 보내고,
사용자가 봇 버튼으로 고른 가게만 크롤. schedule 과 같은 인프로세스 croner 를 쓰지만
jobType·파이프라인·**텔레그램 응답을 기다리는 비동기 상태머신**이라 별도 모듈. 도메인
흐름은 [random-crawl](random-crawl.md) 토픽.

| Export | 용도 |
| --- | --- |
| `RandomCrawlTrigger` | `'cron' \| 'manual' \| 'telegram' \| 'search'`. 텔레그램 커맨드(`/discover`)·직접 검색(`/search`)도 트리거 |
| `RandomCrawlRunStatus` | `running \| awaiting_selection \| crawling \| done \| skipped \| failed \| interrupted`. `awaiting_selection` = 후보 전송 후 사용자 선택 대기, `skipped` = 무응답 타임아웃/후보 0/overlap |
| `RandomCrawlPhase` | `selecting_region \| searching \| awaiting_selection \| crawling \| done`. 이력 행은 null |
| `RandomCrawlTimeoutAction` | `'skip' \| 'random'`. 무응답 시 회차 건너뛰기 vs 후보 랜덤 자동 크롤 |
| `RandomCrawlRegion` | `{ sidoRandom/sido, sigunguRandom/sigungu, dongEnabled/dongRandom/dong }`. 각 레벨 고정 또는 랜덤. 부모-자식 정합성은 서버 resolve 가 위→아래 처리(어긋나면 랜덤 폴백) |
| `RandomCrawlConfig` (응답) | `{ enabled, cronExpr, timezone, region, keyword, candidateCount, responseTimeoutMin, timeoutAction, telegramConfigured(읽기전용 — false 면 후보 못 보내 skip), lastRunAt/lastStatus, nextRunAt(croner), updatedAt }` |
| `RandomCrawlConfigInput` (입력) | `{ enabled, cronExpr(1..120), timezone(def 'Asia/Seoul'), region, keyword(trim 1..40 def '맛집'), candidateCount(coerce 1..10 def 5), responseTimeoutMin(coerce 5..1440 def 30), timeoutAction(def 'skip') }`. jobType 서버 고정 |
| `RandomCrawlCandidate` | `{ placeId, name, category, roadAddress, rawSourceUrl, lat, lng, reviewCount, selected }`. 텔레그램에서 고른 후보는 `selected=true` |
| `RandomCrawlRun` | live·이력 공용 shape — `{ runId, trigger, status, phase(nullable), regionLabel, keyword, candidates[], selectedPlaceId, crawledRestaurantId, startedAt, finishedAt, error }` |
| `RandomCrawlRunList` | `{ items: RandomCrawlRun[], inflightRunId: string\|null(awaiting_selection 포함) }` |
| `RandomCrawlPreviewInput/Result` | schedule 과 동일 — `{ cronExpr, timezone }` → `{ valid, error, nextRuns[] }` |
| `RegionTree` | `Array<{ sido, sigungus: string[] }>`. 동 제외 가벼운 ~250 시군구 — UI 시/구 셀렉트 채움 |
| `RegionDongQuery` / `RegionDongList` | 특정 시군구의 동 목록 (`{ sido, sigungu }` → `{ sido, sigungu, dongs[] }`) — 동은 수천 건이라 트리에서 분리 |
| `RandomCrawlProgressEvent` / `RandomCrawlDoneEvent` (SSE) | `type` literal. progress 는 `phase/regionLabel/candidates[]`(awaiting_selection 에서 후보 동봉), done 은 `status/finishedAt` |

### `schemas/review-search.ts` — [review-search.ts](../../packages/api-contract/src/schemas/review-search.ts) **(신규 — 리뷰 RAG/문맥검색)**

리뷰를 임베딩으로 enrich 한 뒤 LLM RAG(질문)로 답한다. 검색 단위는 식당(`restaurantId`,
어드민), 공개 QA 는 `placeId`(공개 상세와 같은 식별자, 인증 없음 — [public-admin-route-split](../concepts/public-admin-route-split.md)).
제품 표면은 RAG 만 — standalone 검색 엔드포인트는 제거됨. 도메인 상세는 [review-search](review-search.md).

| Export | 용도 |
| --- | --- |
| `ReviewSearchHit` | `{ reviewId, body, rating, score, keyword(bool) }`. RAG citation 단위 |
| `ReviewSearchEnrichInput/Result` | on-demand enrich (관점+문맥+임베딩 영속). 결과 `{ enriched, total, ms }` |
| `ReviewAskInput` | `{ restaurantId, query(min 1) }` (어드민) |
| `ReviewAskResult` | `{ answer, confidence: 'high'\|'medium'\|'low'\|'none', hyde(HyDE 가설문서, nullable), citations: ReviewSearchHit[], verification: { applied, dropped: string[] }\|null }`. **verification = 2차 검증 가드레일** — 근거 부족 주장 제거 |
| `ReviewPublicAskBody` | `{ query(min 1, max 200) }`. placeId 는 경로 파라미터라 본문엔 query 만 |
| `ReviewQaReadyResult` | `{ ready(bool), count }`. 공개 QA 준비 여부(enrich 리뷰 존재) — LLM 호출 없음 |
| `ReviewEnrichStatusItem` / `...List` / `...Query` | enrich 상태 관리(어드민) — "식당별 정규화 상태" 미러링. List 는 `{ items, total, totalRestaurants, readyCount, page, pageSize }` |
| `ReviewEnrichProgressEvent` (SSE) | `{ restaurantId, processed, total, done }`. 전체 enrich 이벤트 멀티플렉스 |
| `ReviewEnrichBgInput/Result`, `ReviewEnrichPendingResult` | 백그라운드 트리거(즉시 반환, 상태는 폴링). pending = 미완료 식당 일괄 순차 |

### `schemas/review-clustering.ts` — [review-clustering.ts](../../packages/api-contract/src/schemas/review-clustering.ts) **(신규 — 임베딩 군집화)**

저장된 bge-m3 임베딩으로 UMAP→HDBSCAN→c-TF-IDF(Python 배치) 후 LLM 한 줄 라벨을 붙여
영속. 계산은 배치(어드민/크롤후 훅)로만, 공개 API 는 저장 결과 읽기만(질의 비용 0).
도메인 상세는 [review-clustering](review-clustering.md).

| Export | 용도 |
| --- | --- |
| `ClusterTone` | `'positive' \| 'negative' \| 'mixed' \| 'neutral'` |
| `ReviewClusterRepReview` | `{ reviewId, body, rating }`. medoid 근처 대표 리뷰 |
| `ReviewClusterAspect` | `{ key(예 "맛:pos"), count }`. **`z.record` 대신 배열** — zod 버전 무관·와이어 명시적 |
| `ReviewClusterItem` | `{ id, ordinal, label(LLM), tone, size(=카운트), keywords[](c-TF-IDF), aspects[], repReviews[] }` |
| `ReviewClusterAspectSummary` | `{ aspect(맛/서비스/웨이팅…), pos, neg, neu }`. 전부 노이즈 식당 폴백 |
| `ReviewClustersResult` (공개) | `{ ready, total, clustered, noiseCount, version, clusteredAt, clusters[], aspectSummary[] }`. 군집·관점집계 둘 다 없으면 `ready=false`. 군집 있으면 `aspectSummary` 빈 배열, **전부 노이즈면 군집 빈 배열 + aspectSummary 채움(폴백)** |
| `ReviewClusterRunInput/Result` | 동기 실행(어드민). 결과 `{ clusters, noise, total, skipped(bool), reason(nullable), ms }` — 최소 리뷰 미달·enrich 미완·엔진 미설치 시 skip |
| `ReviewClusterStatusItem` / `...List` / `...Query` | 상태 관리(어드민) — enrich 미러링. Item 에 **`lastReason`**(스킵/오류 사유 노출 — "대기로만 남는" 원인 가시화) |
| `ReviewClusterBgInput/Result`, `ReviewClusterPendingResult` | 백그라운드 단건/일괄 순차 |

### `schemas/logs.ts` — [logs.ts](../../packages/api-contract/src/schemas/logs.ts) **(신규 — 범용 작업 로그)**

모든 백그라운드/동기 작업의 실행 단위(run)와 스텝 로그를 한 테이블 체계로 기록 +
실패 run 의 LLM 원인 분석. 도메인 상세는 [logs](logs.md).

| Export | 용도 |
| --- | --- |
| `OperationFeature` | 계측 대상 **12종(2026-08-22)** — `crawl/summary/menu-grouping/settlement-extraction/auto-discover/schedule/global-merge/diningcode-bulk-save/random-crawl` + **`food-import`/`meal-recognition`/`meal-recommendation`**. 새 기능은 여기만 추가(friendly 의 `startRun({ feature })` 가 이 enum 타입) |
| `OperationLogLevel` | `debug \| info \| warn \| error`. `CrawlLogLevel` 과 달리 **debug 포함** — debug 는 DB 에만 쌓이고 SSE 로는 안 나가 기존 SSE 계약 불변 |
| `OperationRunStatus` | `running \| done \| failed \| cancelled` |
| `OperationReportStatus` / `OperationReportSeverity` | 보고서 `pending\|running\|done\|failed` / `low\|medium\|high` |
| `LogAnalysisErrorCode` | **`z.enum([...AiErrorCode.options, 'no_analysis_llm', 'parse_failed', 'run_not_failed', 'analysis_in_flight'])`** — provider 에러 코드를 스프레드해 분석 고유 사유를 더한 합성 enum |
| `OperationRunSchema` | `{ id, feature, jobId(nullable), subjectId, parentRunId(중첩 run 연계), status, trigger(자유 문자열), errorCode/Message, meta(JSON 문자열 통과), startedAt, finishedAt, logCount }` |
| `OperationLogEntrySchema` | `{ id, runId, feature, jobId, subjectId, stage, level, message, meta(`z.record` — 응답에선 파싱한 객체), createdAt }` |
| `OperationReportSchema` | 실패 run LLM 분석 — `{ summary, rootCause, details(markdown), suggestions[](JSON→배열), severity, ...tokens, durationMs }`. pending/running 동안 분석 필드 null |
| `ListOperationRunsQuery` / `OperationRunList` | `PaginationQuerySchema.extend({feature?, status?})` / `PaginatedSchema(OperationRunSchema)` |
| `OperationRunDetail` | `{ run, report: nullable }` |
| `ListOperationLogsQuery` / `OperationLogsResult` | cursor pagination(CrawlJobLogsQuery 의미론) — `{ logs(최신→과거), nextCursor }` |
| `LogConfigSchema` / `UpdateLogConfigInput` | 전역 보존 기간 — `retentionDays`(1..365). 보고서 있는 run 은 정리 제외 |
| `AnalyzeRunResult` | `z.discriminatedUnion('ok', …)` — true 면 running 스냅샷 report, false 면 `{ error: LogAnalysisErrorCode, message }` |

### `schemas/telegram-settings.ts` — [telegram-settings.ts](../../packages/api-contract/src/schemas/telegram-settings.ts) **(신규 — 텔레그램 봇 설정)**

어드민 "설정 > 텔레그램". `MapProviderConfig`/`LlmProviderConfig` 와 같은 **DB 우선 +
.env(`TELEGRAM_*`) fallback** 패턴 — 토큰은 절대 평문으로 안 내려주고 마스킹.

| Export | 용도 |
| --- | --- |
| `TelegramConfig` (응답) | `{ hasToken, tokenMasked(예 "8012…Ab3"), chatId(평문 — 비밀 아님), source: 'db'\|'env'\|'none', configured(토큰+chatId 둘 다 있어 전송 가능), updatedAt }` |
| `UpdateTelegramConfigInput` (입력) | `{ botToken?: string, chatId?: string\|null }`. MapProvider 규약 — undefined/빈 = 보존, 문자열 = 교체, chatId null = 비움 |
| `TelegramTestResult` | 연결 테스트 — `{ ok, botOk, botUsername, chatOk, chatLabel, messageSent, error }`. getMe → getChat → 테스트 메시지 |
| `TelegramChatIdCandidate` / `TelegramChatIdResult` | chat_id 자동 탐색 — 폴러를 잠시 멈추고 message 롱폴로 사용자가 봇에 보낸 메시지에서 chat 추림 |

### `schemas/bus.ts` — [bus.ts](../../packages/api-contract/src/schemas/bus.ts) **(신규 — 서울시 버스)**

`ws.bus.go.kr` 서울시 버스 API 를 friendly 가 프록시. 검색·노선 상세는 DB 30일 캐시,
도착·차량 위치·주변 정류장은 무캐싱 실시간 프록시(일 1,000건 쿼터 공유). **전 좌표 필드가
WGS84 zod 범위(`lat 33~39` / `lng 124~132`)** 로 강제돼, 서버가 GRS80 TM 원본을 변환하지
못하면 응답 직렬화에서 실패한다(계약을 코드로 못박음). 도메인 흐름·프로브 실측은 [bus](bus.md).

| Export | 용도 |
| --- | --- |
| `BusStationSearchQuery` | `{ q, force }`. `q` 는 **NFC 정규화 후** `refine(2~50자)` — min(2) 를 먼저 걸면 NFD 분해 글자가 통과하므로 transform→refine 순서. `force` 는 `z.union([boolean, 'true'\|'false']).transform` (coerce.boolean 은 `'false'` 도 true 라 회피). 제출형 검색만(쿼터 보호) |
| `BusStationItem` | `{ stId(9자리 PK), arsId(5자리 표지판번호, '0'=가상정류장), name, lat(33~39), lng(124~132) }`. **`arsId` 는 '0' 중복이라 식별자 못 씀** — PK 는 `stId` |
| `BusStationSearchResult` | `{ items: BusStationItem[](100 절단), total(절단 전), fetchedAt(ISO), source: 'cache'\|'api'\|'stale' }`. `stale` = API 실패로 만료 캐시라도 반환(가용성 우선) |
| `BusArrivalsParams` | `{ arsId: regex(/^\d{1,5}$/).refine(≠'0') }`. 가상정류장('0')은 도착정보 불가 → 라우트 400 |
| `BusArrivalEntry` / `BusArrivalItem` | Entry `{ vehId(nullable — 업스트림 '0'→null), message }`. Item `{ busRouteId, routeName(rtNm), staOrd(int\|null — null 이면 위치 조회 불가), first/second: BusArrivalEntry\|null }` |
| `BusArrivalsResult` | `{ arsId, items: BusArrivalItem[], fetchedAt }` |
| `BusNearbyQuery` | `{ lat(coerce 33~39), lng(coerce 124~132), radius(coerce int 50~1000, def 500) }`. 범위 밖 좌표는 서울시 API 호출 전 400 |
| `BusNearbyItem` | `BusStationItem.extend({ dist: int≥0 })`. 요청 좌표 거리(m), 오름차순 정렬 계약(서버가 셀 캐시와 무관하게 쿼리 지점 기준 재계산) |
| `BusNearbyResult` | `{ items: BusNearbyItem[], total, fetchedAt, source }`. 셀(0.005°) 단위 DB 캐시 |
| `BusPositionsParams` | `{ busRouteId: regex(/^\d+$/) }` |
| `BusPositionsQuery` | `{ startOrd?, endOrd? }` 3-refine — **둘 다 지정(구간 조회)이거나 둘 다 생략(노선 전체)**, `endOrd ≥ startOrd`, 구간 ≤ 50정류장. 하나만 지정은 400(의도 모호) |
| `BusPositionItem` | `{ vehId, plainNo(차량번호판, nullable), lat(33~39), lng(124~132), sectOrd(int\|null — staOrd 비교로 '몇 정류장 전'), stopFlag('1'=정차/'0'=주행, 원문 보존) }` |
| `BusPositionsResult` | `{ busRouteId, items: BusPositionItem[], fetchedAt }` |
| `BusRouteDetailParams` | `{ busRouteId: regex(/^\d+$/) }` |
| `BusRoutePathPoint` | `{ lat(33~39), lng(124~132) }`. 형상 폴리라인 점(getRoutePath, WGS84) |
| `BusRouteStationItem` | `{ seq(노선 내 순번=staOrd 공간), stId(정류소 ID→클릭 시 정류장 흐름 연결), arsId, name, lat, lng, direction(향하는 종점 표기, 상/하행 구분), isTurnPoint(transYn 'Y' 회차점) }` |
| `BusRouteInfo` | `{ routeName(busRouteAbrv), routeType(1공항/2마을/3간선/4지선/5순환/6광역/7인천/8경기/0공용 — FE 폴리라인 색), stStationName, edStationName, lengthKm(nullable), termMin(배차, nullable), firstBusTime/lastBusTime('HH:mm' 정규화, nullable), corpName(전화 섞인 원문 공백 접기, nullable) }` |
| `BusRouteDetailResult` | `{ busRouteId, info: BusRouteInfo, path: BusRoutePathPoint[], stations: BusRouteStationItem[], fetchedAt, source }`. `getRoutePath`+`getStaionByRoute`+`getRouteInfo` 3콜 합본 (노선당 최초 1회만 업스트림, 정적이라 30일 캐시) |

### `schemas/bus-favorite.ts` — [bus-favorite.ts](../../packages/api-contract/src/schemas/bus-favorite.ts) **(신규 — 버스 즐겨찾기)**

로그인 사용자의 서버 저장분(여기만 인증). 비로그인은 클라이언트(localStorage/AsyncStorage)
저장이며 로그인 시 sync 로 union 병합. 대상은 두 종류 — 정류장(`stId`) / 정류장×노선 조합
(`stId`+`busRouteId`). 노선 단독은 조회 화면이 없어 만들지 않는다. 목록은 두 종류 모두
`createdAt` 오름차순(등록순) 고정 계약이며, PUT/DELETE/sync 응답이 **전체 목록을 통째로 반환**해
클라이언트가 diff 없이 캐시를 교체한다.

| Export | 용도 |
| --- | --- |
| `BUS_FAVORITES_MAX` | `100`. 사용자·종류당 상한. **PUT 단건 초과 = 400, sync 는 상한까지만 채우고 나머지 조용히 버림**(로그인 직후 병합이 에러로 끊기는 것보다 목록이 진실이 되는 쪽) |
| `BusFavoriteStationParams` | `{ stId: regex(/^\d{1,12}$/) }` |
| `BusFavoriteRouteParams` | `{ stId: regex(/^\d{1,12}$/), busRouteId: regex(/^\d+$/) }` |
| `BusFavoriteStationItem` | **`= BusStationItem`** — 정류장 즐겨찾기 항목이 곧 정류장 스냅샷(재조회 불필요, 정류장 정보는 사실상 정적) |
| `BusFavoriteRouteItem` | `{ stId, busRouteId, routeName(rtNm 스냅샷), stationName(정류장명 스냅샷), arsId, lat(33~39), lng(124~132) }`. 조합 항목 단독 진입 시 지도 이동에 필요한 좌표 스냅샷 포함 |
| `BusFavoriteStationUpsertBody` | `BusStationItem.omit({ stId })` — 식별자는 path 로, body 는 스냅샷 필드만 |
| `BusFavoriteRouteUpsertBody` | `BusFavoriteRouteItem.omit({ stId, busRouteId })` |
| `BusFavoritesResult` | `{ stations: BusFavoriteStationItem[], routes: BusFavoriteRouteItem[] }`. 전체 목록 응답(캐시 통째 교체용) |
| `BusFavoritesSyncBody` | `{ stations: [].max(100), routes: [].max(100) }`. 로그인 직후 1회 union 병합(멱등) — 이미 있는 항목은 서버 값 유지(스냅샷 안 덮음) |

### `schemas/air-quality.ts` — [air-quality.ts](../../packages/api-contract/src/schemas/air-quality.ts) **(신규 2026-08-21 — 에어코리아 대기정보)**

friendly 가 에어코리아 대기오염정보 5 오퍼레이션 + 측정소정보(별도 API 15073877) 를 프록시. 업스트림은
값이 전부 문자열이고 결측을 `"-"`(농도)/`null`(등급)/`"통신장애"`(Flag) 로 섞어 보내므로 **숫자·등급을
정규화한 모양만 계약**(변환은 서비스 책임). 캐시성 응답 공통 필드 `fetchedAt`(수집 시각 ISO) +
`stale`(업스트림 실패로 last-known 서빙 중). 도메인 흐름·캐시 정책은 [air-quality](air-quality.md).

| Export | 용도 |
| --- | --- |
| `AirGradeSchema` | `z.union([literal(1..4)]).nullable()` — 1 좋음 / 2 보통 / 3 나쁨 / 4 매우나쁨, 결측 null. enum 이 아니라 숫자 리터럴 union |
| `AirMeasureFlags` / `AirMeasureItem` | 측정소 1행 — so2/co/o3/no2/pm10/pm25 수치(null 결측) + `pm10Avg24`/`pm25Avg24`(24h 이동평균) + `khai`(통합지수) + 등급 9종(khai/so2/co/o3/no2/pm10·pm25 24h/pm10·pm25 1h) + `dataTime` 원문("24:00" 표기)과 `measuredAt`(익일 00:00 ISO 정규화) + `flags`(점검및교정/장비점검/자료이상/통신장애). `stationCode` 는 선행 0 보존 위해 문자열 |
| `AirSidoParams` / `AirSidoRealtimeResult` | `sidoName` trim 1~20 — 서버가 '전국' 1콜을 캐시해 포함 매칭(2026-07 통합 라벨 '전남광주' 도 구 라벨 '광주'/'전남' 에 매칭). **매칭 0건은 404 아님 — 빈 items**(전원 결측과 구분 불가) |
| `AIR_HISTORY_TERMS`/`AirHistoryTerm` · `AirStationHistoryParams`/`AirStationHistoryQuery`/`AirHistoryPoint`/`AirStationHistoryResult` | `DAILY`(24h 시간별 원본)/`MONTH`/`3MONTH`(서버 일평균) — 결과 `unit: 'hour'\|'day'`, `latest`(최근 행 — 상세 카드), `points` 과거→최근 오름차순, `total`(접기 전 원본 행 수) |
| `AirBadStationItem` / `AirBadStationsResult` | 통합지수 나쁨 이상 측정소 — `sidoName` 은 addr 앞머리에서 서버 추정(실패 null) |
| `AIR_FORECAST_CODES`/`AirForecastCode`(PM10/PM25/O3) · `AirRegionGradeSchema`(권역·등급 쌍, 원문 보존) · `AirForecastImage`(url/pollutant/at/animated) · `AirForecastItem` · `AirForecastQuery` · `AirForecastResult` | 예보통보 — `informGrade` 를 19권역 쌍으로 분해, `imageUrl1~9` 유효분만. `date`(YYYY-MM-DD regex, optional) 생략 시 KST 오늘 → 당일 발표분 없으면 **전일로 1회 폴백**(응답 `date` 가 실제 조회일). 업스트림이 InformCode 필터를 무시(실측)해 코드 필터는 FE |
| `AirWeeklyDay` · `AirWeeklyForecastQuery`/`AirWeeklyForecastResult` | 초미세먼지 주간예보 D+3~D+6 — 권역별 낮음/높음 + `reliability`("신뢰도 : 높음" 분리), `presentedAt`(미발표 null), `outlook` |
| `AirStationInfoItem` / `AirStationsResult` | 측정소정보 전량(≈650개소, 24h 캐시) — 주소·측정망·설치년도·측정항목 `items[]` + `lat/lng` **nullable**(33~39/124~132) |
| `AirNearbyQuery` · `AirNearbyStationItem = AirStationInfoItem.extend({ dist, measure })` · `AirNearbyResult` | `lat/lng` coerce WGS84, `radius` 500~50,000(def 10,000 — 측정소 간격이 넓다), `limit` ≤20(def 5). 거리 오름차순 + 같은 이름 측정소의 현재 측정값 조인(`measure: AirMeasureItem.nullable()`, 업스트림 추가 호출 0) |
| `AirStationSearchQuery` / `AirStationSearchResult` | `q` **transform(NFC) → refine(1~30)** — bus 검색과 같은 순서. 캐시된 목록 로컬 검색, 30건 절단(`total` 은 절단 전) |
| `AIR_LOCATION_SOURCES`/`AirLocationSource` · `AirLocationUpsertBody` · `AirLocationItem = Body.extend({ updatedAt })` · `AirLocationResult` | 내 대기 위치(인증) — `lat/lng` WGS84, `label` ≤40 nullable default null, `source` `geolocation`(GPS)/`station`(선택 측정소 좌표)/`place`(날씨 지점 시·군·구 — `7704f8c` 동기화)/`manual`(UI 제거, 저장값 호환). GET/PUT/DELETE 응답이 모두 `{ location: nullable }` = 변경 후 상태(캐시 통째 교체). 게스트는 클라이언트 persist, 로그인 직후 서버가 비면 게스트 값 업로드 |

### `schemas/weather.ts` — [weather.ts](../../packages/api-contract/src/schemas/weather.ts) **(신규 2026-08-21 — 기상청 단기·중기예보 + API허브 AWS)**

단기예보 조회서비스(15084084: 초단기실황·초단기예보·단기예보·예보버전) + 중기예보 조회서비스(15059468:
중기전망·육상·기온·해상) 8 오퍼레이션 + API허브 AWS 매분 관측. 업스트림은 `(category, fcstDate,
fcstTime, fcstValue)` 세로 행이고 값이 전부 문자열(강수량은 "1mm 미만" 같은 범주)이라 **시각별로 가로로
접고 숫자를 정규화한 모양만 계약**. 공통 `fetchedAt` + `stale` + `base`(사용한 발표 기준) +
`fallback`(최신 슬롯 미제공으로 한 슬롯 이전 발표분 사용). 도메인은 [weather](weather.md).

| Export | 용도 |
| --- | --- |
| `WeatherGridQuery` | `nx` 1~149 / `ny` 1~253 coerce — 5km LCC 격자. 위·경도 → 격자 변환은 `@repo/utils latLngToKmaGrid`(api-contract 는 변환 미포함) |
| `WeatherBase` | `{ date: YYYYMMDD regex, time: HHMM regex, at: ISO(+09:00) }` 발표 기준 시각 |
| `WeatherPrecip` | `{ text, value: number\|null, none: boolean }` — "강수없음"/"1mm 미만"/"30.0~50.0mm" 범주 문자열을 원문+수치+없음 플래그로 |
| `WeatherNowcastNow` · `WeatherUltraHour` · `WeatherNowcastResult` | 실황(정시 관측 8항목 t1h/rn1/reh/pty/vec/wsd/uuu/vvv) + 앞 6시간 초단기예보(11항목, `rn1` 은 범주 `WeatherPrecip`, `lgt` 낙뢰 kA) 를 **한 응답에** — 발표 시각이 달라 `ncstBase`/`ultraBase` 각각, 폴백도 `ncstFallback`/`ultraFallback` 각각 |
| `WeatherForecastHour` · `WeatherHalfDay` · `WeatherForecastDay` · `WeatherForecastResult` | 단기예보 발표 +1h ~ +3일 시각별(`tmn`/`tmx` 는 06시/15시 행에만, `pcp`/`sno` 범주, `wav` 파고) + 일별 요약(`am`/`pm` 반나절 — 강수 우선·흐린 쪽 대표, `popMax`, `tmnFromHours`/`tmxFromHours` = 정식 TMN/TMX 가 아니라 TMP 유도 근사, `partial` = 24시간 미커버) |
| `WEATHER_FCST_FILE_TYPES`/`WeatherFcstFileType`(ODAM/VSRT/SHRT) · `WeatherVersionItem` · `WeatherVersionsResult` | 예보 버전(파일 생성 시각) |
| `WeatherMidQuery` · `WeatherMidHalf` · `WeatherMidLandDay` · `WeatherMidTaDay` · `WeatherMidResult` | `land`/`ta` 는 `REG_ID` regex `^\d{2}[A-Z]\d{5}$`(11B00000 서울·인천·경기), `stn` `^\d{3}$` optional(108 전국·109 서울). 2026 현재 업스트림은 **D+4~D+10**(D+3 까지는 단기예보) — D+4~7 `am`/`pm`, D+8~10 `all`; 기온은 `taMin/taMax` + 오차 범위 `taMinLow/High`·`taMaxLow/High`; `outlook`(wfSv 원문). 3 오퍼레이션 합본(각 nullable) |
| `WeatherMidSeaQuery`/`WeatherMidSeaHalf`/`WeatherMidSeaDay`/`WeatherMidSeaResult` | 해상 — 파고 `whMin`/`whMax` |
| `WeatherAwsQuery` · `WeatherAwsItem` · `WeatherAwsResult` | API허브 AWS — `lat/lng` WGS84, `radius` 1,000~50,000(def 15,000), `limit` ≤10(def 3). 결과 `enabled`(키·활용신청 없으면 **false + 빈 items 200** — 선택 보강이라 페이지가 조용히 생략), 거리 오름차순 `ta/hm/wd10/ws10/re/rn15m/rn60m/rn12h/rnDay/td/pa` + `tm`/`observedAt`(관측 없으면 null) |

### `schemas/life-map.ts` — [life-map.ts](../../packages/api-contract/src/schemas/life-map.ts) **(신규 2026-08-21, 병의원 08-30 — 일상지도)**

전국 CCTV·공중화장실(CSV 적재)·병의원(심평원 API 적재) 공개 조회. **업스트림 없음(로컬 SQLite)** —
그래서 `stale` 이 없고 `fetchedAt` 은 적재 시각. 지도 뷰포트(bbox)+줌이 조회 단위: 레이어별 임계 이상이면
개별 지점(`points`), 아니면 서버 집계 셀(`cells`) — 377k 점을 브라우저에 다 보내지 않기 위한 유일한 분기.
도메인은 [life-map](life-map.md).

| Export | 용도 |
| --- | --- |
| `LifeMapLayer` | `'cctv' \| 'toilet' \| 'hospital'` |
| (내부) `LifeMapBboxParam` / `LifeMapFlagParam` / `lifeMapFilterFields` | bbox 는 `"minLng,minLat,maxLng,maxLat"` regex(맛집 공개 목록과 같은 `@repo/utils formatBbox` 규약); 불리언은 `enum(['1','0','true','false']).optional().transform` — **`z.coerce.boolean` 회피**(bus 교훈); 필터 필드(purpose 쉼표 목록=CCTV, category=병의원, open24/disabled/kids/diaper/bell=화장실)를 points/nearby 쿼리가 스프레드로 공유 |
| `LifeMapPointsQuery` · `LifeMapPoint` · `LifeMapCell` · `LifeMapPointsResult` | `zoom` 0~22 coerce(소수 허용, 서버 내림). 결과 `mode: 'points'\|'cells'` 에 따라 `items`(최소 필드 — id/lat/lng + purpose/name/open24 optional) 또는 `cells`(무게중심 + count) **하나만** 채움, `truncated`(상한 절단), `minPointZoom`(안내 문구용), `total`(필터 적용·절단 전) |
| `LifeCctvItem` / `LifeToiletFixtures` / `LifeToiletItem` / `LifeHospitalItem` · `LifeMapItem = z.discriminatedUnion('layer', […])` · `LifeMapDetailParams` | 레이어별 상세가 다른 shape 라 `layer` 판별자 union — 한 라우트(`/life-map/:layer/:id`)로 내려간다. 화장실 변기 수 9필드 int≥0, `id` ≤200(병의원 ykiho 는 base64 ~100자) |
| `LifeMapNearbyQuery` · `LifeMapNearbyItem`(각 Item `.extend({ dist })` 후 union) · `LifeMapNearbyResult` | `radius` 100~3,000(def 1,000 — "걸어갈 거리"), `limit` ≤30(def 10), 거리 오름차순 |
| `LifeMapSearchQuery` · `LifeMapSearchItem` · `LifeMapSearchResult` | VWorld 검색 프록시(주소·POI 만 — 행정구역 245지점·지하철역·정류장은 클라이언트가 섞음). `q` **transform(NFC + 공백 접기) → refine(2~60)**, `limit` ≤20(def 8). `kind` place/road/parcel. **`enabled=false` = 서버에 vworld 키 없음(200, 섹션 숨김)** |
| `LifeMapLayerStatus` · `LifeMapStatusResult` | 레이어별 `loaded/count/geocoded(화장실·병의원만, CCTV null)/baseDate/loadedAt` |

### `schemas/allergen.ts` — [allergen.ts](../../packages/api-contract/src/schemas/allergen.ts) **(신규 2026-08-24 — 알레르기 유발물질)**

| Export | 용도 |
| --- | --- |
| `MealAllergen` | 식품안전나라 표시 기준 **19종** enum(egg/milk/buckwheat/peanut/soybean/wheat/pine_nut/walnut/crab/shrimp/squid/mackerel/shellfish/peach/tomato/chicken/pork/beef/sulfites). 사용자 선호(`MealPreference.allergens`)와 카탈로그(`FoodItem.allergens`)가 **같은 enum** 을 써 추천 필터에서 문자열 변환이 끼지 않는다. 구조화 값은 교차접촉·미표기 재료까지 보장하는 "안전 인증" 이 아니다 |
| `MEAL_ALLERGEN_LABEL` | `Record<MealAllergenType, string>` 한글 라벨 사전(zod 아님) |
| `FoodAllergenStatus` | `'unknown'`(근거 없음) / `'inferred'`(공개 재료 문자열 결정 규칙 — 교차접촉 모름) / `'verified'`(운영자 검수 — 그래도 제조·매장 안전 보장 아님) |

### `schemas/food.ts` — [food.ts](../../packages/api-contract/src/schemas/food.ts) **(신규 2026-08-22, 23차 — 음식 카탈로그)**

식단 관리의 마스터 데이터. 사용자 기록의 음식 항목이 이 행을 **스냅샷**(FK 없음)으로 가리키고, 추천 후보
풀·자동완성·분류 통계가 읽는다. 시드 출처 6종(`FoodSource`), 분류는 2축(`dishType` 식약처 식품대분류
25종 축약 × `mainIngredient`) + `cuisine`. 도메인은 [food](food.md).

| Export | 용도 |
| --- | --- |
| `FoodDishType` / `FoodMainIngredient` / `FoodCuisine` | 분류 enum 3종 — 키는 영문 snake_case(SQLite String 저장, 이 enum 이 진실). 라벨·매핑은 `@repo/utils foodTaxonomy.ts` 에 같은 키 순서(friendly 테스트가 동일성 검증) |
| `FoodSource` | **(2026-09-02 `bcfc72b`) 8종** `mfds-nutrition`/`mfds-recipe`/`mafra-recipe`/`hansik-800`/**`mfds-raw`**(식약처 원재료성식품 표준데이터 15100065 — 생고기 부위·수산물·채소 100g 기준, 메뉴 칼로리 '100g당' 등급용)/**`curated`**(코드 내장 큐레이션 표 — 주류·음료·공기밥 근사값)/`menu-canonical`/`manual`. 신규 2종은 CLI 전용(`FoodImportSource` 는 4종 그대로) |
| `FoodNutrition` · `FoodItem` | 1인분 기준 영양 6종(표준데이터 100g → `servingG` 환산, null 허용) + **`kcalPer100g: number \| null`(`0d2584a` — 100g/100ml당 열량 원본 단위, `servingG` 없어 1인분 영양이 비어도 있을 수 있다)** + `repName`(대표식품명 축약 키)/`aliases`/`ingredients`/`allergens: MealAllergen[]`+`allergenEvidence`+`allergenStatus`/`source`+`sourceId`+`sourceCategory`/`popularity`/`active`/`classifyVersion`+`classifyModel`(LLM 2축 분류 계보 — [versioned-llm-prompts](../concepts/versioned-llm-prompts.md), `FOOD_CLASSIFY_VERSION=1`) |
| `FoodSearchQuery` / `FoodSearchItem` / `FoodSearchResult` | 자동완성(인증) — `q` trim 1~40, `limit` ≤20(def 10) |
| `FoodRestaurantsQuery` · `FoodRestaurantEvidence`(`menu_catalog`/`review_mentions`) · `FoodRestaurant` · `FOOD_RESTAURANT_DATA_NOTICE` · `FoodRestaurantsResult` | 음식 → 수집된 메뉴·리뷰 식당 역검색. **좌표는 둘 다 보내거나 둘 다 생략**(`superRefine`), 범위는 -90~90/-180~180(사용자 현재 위치 — 한국 범위 아님), `radiusM` 100~50,000(def 5,000). 결과 `evidence.min(1)`·`mentionCount`·`positiveRatio`·`matchedMenus`, `notice: z.literal(...)` 로 "판매 여부 보장 안 함" 문구 자체가 계약 |
| `FoodAdminListQuery` / `FoodAdminListResult` / `FoodAdminCreateInput` / `FoodAdminUpdateInput = Create.partial()` / `FoodAdminStats` | 어드민 목록(`sort popularity\|name\|updatedAt`, `active`/`unclassified` boolParam, offset ≤100) · 수기 등록(`nameNorm` 충돌 409, `allergenStatus=inferred` 보내면 ingredients 에서 재계산) · 집계 |
| `FoodSourceObservationField`(16) / `FoodMergeConflictField`(13) / `FoodMergeConflictStatus` / `FoodObservedValue` / `FoodSourceObservation` / `FoodMergeConflictItem` / `FoodMergeConflictListQuery`/`...Result` / `FoodMergeConflictAction` / `FoodMergeConflictResolveInput` | 출처 관측 + 병합 충돌 검토 큐 — 누적 필드(aliases/popularity)는 관측만, 단일 대표값 필드만 충돌 대상. `action keep_existing\|accept_incoming\|dismiss` |
| `FoodRecognitionQualityQuery` / `FoodRecognitionQualityResult` | 사진 인식 원본 → 최종 교정 품질 집계(어드민) — `days` 1~365(def 30), `model`/`version`/`confidenceBucket` 필터. top 항목은 **서로 다른 사용자 2명 이상이 기여한 집계만** 노출(개인정보) |
| `FoodImportSource`(4 — **`hansik-800` 없음**: CLI `--file` 전용) / `FoodImportTrigger` / `FoodImportRunStatus` / `FoodImportPhase`(fetching/normalizing/upserting/classifying/done) / `FoodImportConfig`(+`apiConfigured` 읽기 전용 키 유무) / `FoodImportConfigInput` / `FoodImportRunInput`(이번 회차만 소스·분류 오버라이드) / `FoodImportSourceStat` / `FoodImportRun`(live·이력 공용, `progress` nullable) / `FoodImportRunList`(`inflightRunId`) / `FoodImportPreviewInput`/`...Result` / `FoodImportProgressEvent`·`FoodImportDoneEvent`(SSE) | 적재 잡 — random-crawl/schedule 과 같은 "설정 + 지금 실행 + 이력 + preview + SSE" 골격. cron 검증은 서버 croner(패키지 미의존, `cronExpr` 1~120 길이만) |

### `schemas/meal.ts` — [meal.ts](../../packages/api-contract/src/schemas/meal.ts) **(신규 2026-08-22~23, 23차 — 식단 관리, 1,041줄)**

사용자 개인의 한 끼 기록 + 사진 인식 + 통계 + 선호 + 추천 + 내보내기/백업/보존/삭제. **전 표면 로그인
필수(공개·공유 없음)**. 기록 행은 카탈로그(`FoodItem`)·식당(`Restaurant`)에 FK 를 걸지 않고
**스냅샷**(카탈로그는 재적재로 갈리고 식당은 재크롤/삭제 — RestaurantFavorite 와 같은 원칙). 도메인은
[meal](meal.md).

| Export | 용도 |
| --- | --- |
| `MealSlot`(breakfast/lunch/dinner/snack/late_night) · `MealType`(home/dining_out/delivery/convenience/other) · `MealEntrySource`(photo/manual/recommendation) · `MealItemSource`(recognized/manual/catalog/recommendation) · `MealPortion`(small/normal/large — 서수만, 질량 추정 안 함: 비전 MAPE 50~400%) · `MealPortionSource`(vision_ordinal/user_serving) · `MealNutritionBasis`(direct/donor_estimate/missing) | enum 7종 |
| `MealPhotoToken` · `MEAL_MAX_PHOTOS_PER_ENTRY = 5` · `MEAL_MAX_ITEMS_PER_ENTRY = 20` | 토큰은 uuid v4 소문자 regex — **경로 조립에 그대로 쓰이므로 형식이 계약** |
| `RecognizedDish`(`.strict()`, `candidates` ≤3, `photoIndex` 0~4, 카탈로그 매칭 스냅샷 `foodId/matchedName/분류 3축/selectedCandidateRank/catalogMatchedBy(food_id\|normalized_name\|alias\|fuzzy\|none)/catalogMatchScore`, `recognitionDishId`) · `MealRecognitionSnapshot`(`.strict()`, `model`/`version` nullable — 구버전 DB 호환) · (내부) `CreateMealRecognitionSnapshot`(POST 는 둘 다 필수) | 인식 응답과 확정 기록의 `recognition` 스냅샷이 **같은 계약** — 임의 JSON 이 `recognitionJson` 에 저장되지 않게 하위 객체까지 strict |
| `MealPhoto` · `MealItem` · `MealEntry` | 기록 응답 shape — `MealItem` 에 분류 3축 스냅샷·`servings`·인식 계보·영양 스냅샷(`kcal/proteinG/sodiumMg` + `nutritionFrom`·`nutritionBasis`) |
| `MealTimePreset` / `MealTimePresetsResult` | 끼니별 "내가 보통 먹는 시각" — 평균이 아닌 **내 기록 중앙값**, 표본 3건 미만이면 일반값(`fromRecords=false`) |
| `RecentMealItemQuery` / `RecentMealItemResult` | "지난번대로" — 사진은 **자동 첨부 안 함**(`photoToken` 참고용, 복사는 `photoCopy`) |
| `MealItemInput`(`servings` 0.25~10) · `CreateMealEntryInput`(`eatenAt` datetime offset, `eatenDate` YYYY-MM-DD 사용자 로컬, `items` 1~20, `photoTokens` ≤5 **중복 refine**, `recognition`, `originRecommendationId`) · `UpdateMealEntryInput = Create.partial().omit({ recognition, source, originRecommendationId })` | 수정은 items/photoTokens 를 보내면 **전량 교체**(부분 패치 아님); 생성 출처·추천 원본 연결은 수정 불가 |
| `ListMealEntriesQuery` / `ListMealEntriesResult` | `from/to/slot/mealType/source/q(≤80 — 음식명·장소·메모, 페이지네이션 전 적용)/cursor(≤512 **opaque**: eatenAt+id)/limit ≤100(def 30)/withPhotos` → `{ items, nextCursor }` |
| `MealCalendarQuery`(month YYYY-MM) / `MealCalendarResult` · `MealStatsQuery`(from/to) / `MealBehaviorInsight` / `MealStatsResult`(`insights` 1~5, 결정적 key) | 달력(날짜별 count/slots/hasPhoto) · 기간 통계 |
| `UploadMealPhotoResult` · `RecognizeMealInput`(`photoTokens` 1~5, `placeId` 힌트 — 영수증 menuNames 패턴, `slot`) · `RecognizeMealResult`(`.strict()`, `dishes/model/promptVersion/warning`) | 사진 업로드/인식 |
| `MealWeightKeys`(7) · `MealWeights`(variety/taste/balance/health/novelty/weather/convenience 각 0~5) · `MEAL_DEFAULT_WEIGHTS` · `MEAL_WEIGHT_PRESETS` · `MealPreference` · `UpdateMealPreferenceInput`(excluded/disliked/liked ≤50, `allergens: MealAllergen[]`, `slots` 1~5) | 선호 — 가중치 키는 추천 점수 함수 feature 와 1:1 |
| `MealRecommendationStatus`(done/fallback/failed) · `CreateMealRecommendationInput`(`targetDate/targetSlot`, `note` ≤120, `lat/lng` 세계 범위 — 없으면 weather 가중치 0, `force`) · `MealRecommendationItem` · `MealRecommendationFeedback` · `MealRecommendation`(`candidateRatings`, `promptVersion`, `notice` 콜드스타트) · `ListMealRecommendationsQuery`/`...Result` · `MealRecommendationFeedbackInput` · `MealRecommendationContext` | 추천 — 같은 날·끼니·프로필이면 캐시(`force` 로 강제) |
| `MealRecommendationEventKind`(shown/candidate_picked/set_rated/candidate_rated/restaurant_opened/logged/dismissed) · `MealRecommendationPlatform`(mobile/web/server) · `MealRecommendationEventInput`(`.strict()` + `superRefine`: 후보 계열 kind 는 `candidateName` 필수) · `MealRecommendationEvent`(`rankingVersion`) | **불변 이벤트 원장** — `feedbackJson` 은 최신 상태 projection, 행동 순서·후보별 학습 신호의 출처는 이벤트 |
| `MEAL_DATA_DELETE_CONFIRMATION = 'DELETE_ALL_MY_MEAL_DATA'` · `MEAL_PHOTO_RETENTION_DELETE_CONFIRMATION = 'DELETE_OLD_MEAL_PHOTOS'` · `DeleteMealDataInput`(`confirmation: z.literal`) · `DeleteMealDataResult` · `MealPhotoRetentionQuery`(`before` 제외 경계) / `MealPhotoRetentionPreview` / `DeleteMealPhotosInput` / `DeleteMealPhotosResult`(`pendingFileSets` = outbox 재시도 대기) | 파괴적 작업은 **사용자가 직접 입력한 확인 문자열 리터럴** 뒤에만 |
| `MEAL_DATA_EXPORT_FORMAT`/`VERSION` · `MealDataExportPhoto`/`Entry`/`Recommendation`(`.extend`) · `MealDataExport`(`notice.photoBinariesIncluded: literal(false)`, `orphanPhotos`, `preference` nullable — 기본값을 개인 데이터처럼 내보내지 않음) | 내보내기(메타데이터 JSON) |
| `MEAL_DATA_BACKUP_FORMAT`/`VERSION` · 상한 상수 7종(`MAX_PHOTOS` 100 / `MAX_PHOTO_BYTES` 5MB / `MAX_TOTAL_PHOTO_BYTES` 50MB / `MAX_JSON_BYTES` 75MB / `MAX_ENTRIES` 5,000 / `MAX_RECOMMENDATIONS` 1,000 / `MAX_EVENTS_PER_RECOMMENDATION` 200) · `MealDataBackupPhoto`(base64 regex — 개행 불허) · `MealDataBackupItem`/`Entry`/`RecommendationEvent`/`Recommendation`(`.omit` 파생) · `MealDataBackup`(`.strict()`, `archiveId` uuid, `notice` 의 `encoding`/`duplicatePolicy`/`mergePolicy` 가 **`z.literal` — 정책 문자열 자체가 계약**) · `RestoreMealDataResult`(`duplicate`, `preference restored\|kept_existing\|none`) | 사진 포함 휴대용 백업 — **ZIP 이 아니라 JSON+base64** (경로 순회·압축 폭탄 표면 없이 앱/서버가 같은 Zod 로 검증). 같은 `archiveId` 재복원은 멱등 |

### `schemas/menu-nutrition.ts` — [menu-nutrition.ts](../../packages/api-contract/src/schemas/menu-nutrition.ts) **(신규 2026-09-02~03 `ac0e191`→`9e09950` — 공개 식당 메뉴 칼로리)**

메뉴 탭에서 **지연 조회**하는 칼로리 판정 결과 — 상세(`RestaurantPublicDetail`) 응답에 넣지 않는다(상세는 이미
무겁다). 서버(friendly `food/menu-nutrition`)가 메뉴명을 카탈로그에 대어 보수적으로 판정한 것만 담고 **애매하면
항목이 빠진다**(틀린 칼로리는 없는 것보다 나쁘다). 판정 엔진·골든셋은 [food](food.md).

| Export | 용도 |
| --- | --- |
| `MenuKcalBasis` | `per_serving`(정확 매칭 + 카탈로그 1인분이 진짜 1인분) / `per_100g` / `per_100ml`(메뉴명에 중량·인분·크기 표식이 있거나 낮은 정밀 매칭 — 양 무관 비율이라 안전) / `components`(결합 기호 세트 — `parts` 에 구성요소별 판정, 구성 전부가 1인분일 때만 합계) |
| `MenuKcalMatchedBy` | 10종 `exact \| alias \| synonym \| modifier \| variant \| hint \| suffix \| llm(규칙 밖 이름을 LLM 이 카탈로그에 연결 — high 만·100g당만·어휘 단위 영구 캐시, d12b47d) \| web(카탈로그에 없는 음식 — fatsecret.kr 복수 항목 중앙값, 100g당만, 9d3253a) \| set(결합 기호 세트)` |
| `RestaurantMenuKcalPart` | 세트 구성요소 하나 `{ name, basis(per_serving/per_100g/per_100ml), kcal(int≥0), foodName }` — 규칙 계층으로 잡힌 것만 |
| `RestaurantMenuKcalPortion` (`9e09950`) | 100g당 항목에 붙는 "그 양의 칼로리" `{ grams>0, kcal, basis: 'stated'(메뉴명에 적힌 중량 — 가정 없음) \| 'typical'(종류별 통상 1인분 중량표 환산 — 부가 문구로만), unit?: 'g'\|'ml' }` |
| `RestaurantMenuKcalItem` | `{ name(**상세 응답의 메뉴명과 문자 그대로 동일** — 클라이언트가 이름으로 join), basis, kcal(nullable — components 인데 구성 전부 1인분이 아니면 null), foodName(대어 본 카탈로그 음식명 — 툴팁 근거), matchedBy, nutritionFrom(nullable — 같은 계열 차용 출처 문구), parts?/partsTotal?(판정 안 된 구성은 빠지므로 전체 수)/partsEstimated?(LLM 이 추정한 구성 — "AI 추정" 칩), portion? }` |
| `MENU_NUTRITION_NOTICE` | 면책 문구 상수 — 응답 `notice` 는 `z.string()`(food 의 `z.literal(FOOD_RESTAURANT_DATA_NOTICE)` 와 달리 리터럴 계약 아님) |
| `RestaurantMenuNutrition` | `{ placeId, items[](판정된 항목만 — 표시할 게 없으면 빈 배열, 404 아님), notice, llmPending(규칙이 못 잡은 이름을 LLM 이 백그라운드 판정 중 → 잠시 뒤 재조회하면 'llm' 항목이 더해진다; 끝났거나 LLM 꺼짐이면 false) }` |

### `schemas/menu-lexicon.ts` — [menu-lexicon.ts](../../packages/api-contract/src/schemas/menu-lexicon.ts) **(신규 2026-09-03 `fb12027`, portion `9e09950` — 칼로리 엔진 어휘)**

메뉴 칼로리 판정 엔진의 어드민 편집 어휘 — 코드 기본 어휘 위에 얹는 항목. **값(칼로리)이 아니라 "메뉴명을
카탈로그 행에 맞추는 말"만** 다룬다. 엔진은 10분 안에 다시 읽는다.

| Export | 용도 |
| --- | --- |
| `MenuLexiconKind` | 10종 — `modifier`(떼어도 같은 음식인 앞말 "숙성") / `size`(양이 달라지는 앞말 "미니" — 1인분 표시 금지) / `synonym`(표기 동의어 term ↔ target) / `set`(세트 표식 "한상") / `option`(슬래시 양쪽 맛·온도 "냉/온") / `suffix_block`(접미 매칭 제외 범주어 "면") / `raw_suffix`(떼어서 원재료를 찾는 조리 접미 "타다끼") / `quantifier`(한판·반판) / `alias`(카탈로그 행에 덧붙이는 별칭 term → 카탈로그 음식명) / `portion`(종류별 통상 1인분 중량 — term = dishType\|raw_meat\|raw_seafood → target = 그램) |
| `MENU_LEXICON_KINDS_WITH_TARGET` | `['synonym', 'alias', 'portion']` — target 이 필요한 종류. zod 가 아닌 readonly 배열(입력 스키마의 `target` 은 optional — 필수 여부 검증은 서버) |
| `MenuLexiconEntry` | `{ id, kind, term, target(nullable), note(nullable), active, createdAt }` |
| `MenuLexiconCreateInput` | `{ kind, term(trim 1~40), target?(trim 1~60), note?(trim ≤200) }` |
| `MenuLexiconListQuery`(`kind?`) · `MenuLexiconListResult` · `MenuLexiconIdParams` | 목록 `{ items[], defaults: z.record(MenuLexiconKind, int≥0) }` — `defaults` 는 코드 기본 어휘의 종류별 개수(어드민이 "이미 있는 말" 을 짐작하게). 삭제는 `{ id }` params |

### `schemas/housing.ts` — [housing.ts](../../packages/api-contract/src/schemas/housing.ts) **(신규 2026-08-30 `254fb76` — 집값)**

국토교통부 아파트 실거래가(매매 15126468·전월세 15126474, 시군구×계약년월 적재) + 한국부동산원 공동주택 단지
식별정보(CSV + VWorld 지오코딩) + 공시가격·K-apt·건축물대장 보강의 **공개 조회** 계약. 업스트림 실시간 호출이
없다(로컬 SQLite — life-map 과 같은 부류라 `stale` 없음, `fetchedAt` = 통계 재계산 시각). 지도는 일상지도와
같은 `bbox+zoom → points|cells`, 여기에 **축 `dealType × band`(거래 유형 × 전용면적 구간)** 가 점·셀·주변·상세
통계·거래 목록 전부에 걸린다. 가격은 전부 **만원 정수**. 도메인·적재 스크립트는 [housing](housing.md).

| Export | 용도 |
| --- | --- |
| `HousingDealType`(`trade \| jeonse \| monthly`) · `HousingAreaBand`(`all \| b1 \| b2 \| b3 \| b4`) · `HousingComplexKind`(`apt \| row \| multi`) | 축·단지 종류 enum |
| (내부) `HousingBboxParam` · `housingAxisFields` | bbox `"minLng,minLat,maxLng,maxLat"` regex(맛집·일상지도와 같은 `@repo/utils formatBbox` 규약) · `{ dealType: default('trade'), band: default('all') }` 스프레드 — points/nearby/trades 쿼리가 공유(life-map `lifeMapFilterFields` 와 같은 zod object 스프레드 compose) |
| `HousingLatestDeal` · `HousingFallbackDeal = …extend({ dealType })` · `HousingOfficialPrice` · `HousingOfficialGlance` · `HousingBandStat` | 거래 요약 — Latest `{ price(매매가/보증금), rent(월세 — 매매·전세 0), area, floor(nullable), dealDate }`; Fallback = 선택 축에 거래 없을 때 "다른 조건의 마지막 거래"(유형 무관·전체 면적 중 최근); OfficialPrice `{ band, year, count≥1, median, min, max, avgArea }`(호별 공시가격 파일을 접은 값); Glance `{ year, median, count }`(배지용 전체 구간 중위); BandStat `{ band, latest, count12(최근 12개월), count(전체), unitPrice12(만원/㎡ nullable) }` |
| `HousingPointsQuery` · `HousingPoint` · `HousingCell` · `HousingPointsResult` | `zoom` coerce 0~22(소수 허용, 서버 내림) + bbox + 축 → `mode: 'points'\|'cells'`. Point `{ id, lat, lng, name, households(nullable), latest, fallback, official(각 nullable), saleType(K-apt 분양형태 — 임대단지는 실거래 없는 게 정상) }` — 배지는 **latest → fallback(회색) → official(회색 점선) → 회색 점** 순(주석 계약). Cell `{ lat, lng(무게중심), count≥1, traded(이 축에 거래 있는 단지 수), unitPrice(nullable) }`. Result 에 `total`(절단 전)·`truncated`·`minPointZoom`·`fetchedAt` — life-map 과 동형 |
| `HousingComplexSummary` · `HousingNearbyQuery` · `HousingNearbyItem = Summary.extend({ dist })` · `HousingNearbyResult` | Summary `{ id, name, kind, addr(지번), lat/lng **nullable**, households, dongCount, approvedDate, latest, count12, fallback, official, saleType }`. Nearby 쿼리 `lat` 33~39 / `lng` 124~132 coerce, `radius` 100~3,000 def 1,000, `limit` ≤30 def 15 + 축 → `{ center, dealType, band, items(거리 오름차순), total, fetchedAt }` |
| `HousingSearchQuery` · `HousingSearchItem` · `HousingSearchResult` | `q` trim → **transform(NFC + 공백 접기) → refine(1~40)**(life-map 검색과 같은 순서), `limit` ≤20 def 10 → `{ q(에코), items(세대수 큰 순 — id/name/addr/lat·lng nullable/households), fetchedAt }` |
| `HousingComplexParams`(`id` 1~200) · `HousingComplexDetail` | 상세 — `altNames[]`(공시가격·건축물대장·도로명 단지명·변경 이력 중 표시명과 다른 것), `sido/sgg/umd`, `pnu`(19자리 필지고유번호 — 한국부동산원 원천만), `geoSource`('road'/'parcel'/null), `source: 'reb'`(단지 식별정보)`\|'rtms'`(실거래 주소로만 만든 단지), `stats: { trade[], jeonse[], monthly[] }: HousingBandStat[]`(거래 있는 구간만, 'all' 포함), `officialPrices[]`(미적재면 빈 배열), K-apt(`kaptCode/saleType/heating/elevatorCount`)·건축물대장(`roadAddr/parkingCount/floorsMax/structure`) 전부 nullable, `baseDate` |
| `HousingTradesQuery` · `HousingTrade` · `HousingTradesResult` | 축 + `limit` ≤100 def 50 + `offset` + `includeCanceled`(`enum(['1','0','true','false']).optional().transform` — 기본 제외). Trade 는 공통(`dealType/dealDate/area/floor/price/rent/buildYear`) + 매매 전용(`dealingGbn` 중개/직거래, `canceled/canceledDate`, `rgstDate`, `aptDong`, `buyerGbn/slerGbn`) + 전월세 전용(`contractType` 신규/갱신, `useRRRight`, `contractTerm` '25.07~27.07', `preDeposit/preRent`) 전부 nullable. Result 계약일 desc + `total` — offset 페이지네이션 |
| `HousingStatusResult` | 적재 상태 — `complexes{ loaded, count, geocoded, baseDate, loadedAt }` / `trades`·`rents{ loaded, count, fromYm, toYm, loadedAt }` / `statsAt` / `officialPrices{ loaded, year, complexes, loadedAt }` / `kapt{ loaded, matched, loadedAt }` / `buildings{ fetched, total, loadedAt }` / `fetchedAt` |

### `schemas/tarot.ts` — [tarot.ts](../../packages/api-contract/src/schemas/tarot.ts) **(신규 2026-09-03 `cd5a29b`·`98df15a`·`5d0c4c7` — 타로)**

로그인 없이 쓰는 공개 리딩 + 회원 기록 + 공유. 카드 78장·스프레드·뽑기 규칙의 단일 출처는 `@repo/utils`
(`tarotCards.ts`/`tarot.ts`)이고 여기 enum 은 **같은 값·순서**(api-contract 는 utils 미의존 — friendly
`tarot.test` 가 `TarotSpreadId.options`/`TarotTopic.options` 동일성 검증). **뽑기는 클라이언트**가 하고(부채꼴에서
직접 고르는 경험, 결과에 이해관계 없음) 서버는 카드 id·중복·자리 순서만 검증한 뒤 해석을 만든다. 질문이
개인적일 수 있어 게스트 리딩은 저장하지 않고(공유 시에만) 회원 리딩만 자동 저장. 게스트 식별은 `X-Guest-Key`
헤더(기기 영속 UUID, 클라 선언값 — 완벽한 식별이 아님을 수용). 도메인은 [tarot](tarot.md).

| Export | 용도 |
| --- | --- |
| `TAROT_QUESTION_MAX_LENGTH`(200) · `TAROT_CHOICE_MAX_LENGTH`(40) · `TAROT_GUEST_KEY_HEADER`(`'x-guest-key'`) | 상수. 헤더 이름은 `saju.ts` 가 `SAJU_GUEST_KEY_HEADER` 로 재수출 |
| `TarotSpreadId` | `daily \| three-ppf \| three-sar \| choice \| menu \| celtic` 6종 |
| `TarotTopic` | `general \| love \| work \| money \| relationship \| choice \| food` 7종 |
| `TarotCardId` | regex `major-00~21` / `(wands\|cups\|swords\|pentacles)-(01~10\|page\|knight\|queen\|king)` — utils 의 id 규칙 복제 |
| `TarotDrawnCard` | `{ cardId, position(1~32), reversed }` |
| `TarotChoices` | 선택 타로 두 선택지 `{ a, b }`(trim 1~40) |
| `CreateTarotReadingInput` | `{ spreadId, topic(def 'general'), question(trim ≤200 def ''), choices(nullable def null), cards: TarotDrawnCard[] 1~10 }`. 고른 순서 = 스프레드 자리 순서, 서버가 utils `validateDrawnCards` 로 검증 |
| `TarotReadingSource` | `'llm'`(Ollama Cloud) / `'static'`(LLM 부재·실패·한도 초과 시 카드 정적 의미 조립) |
| `TarotCardReading` | 카드 한 장 해석 `{ cardId, position, positionLabel, reversed, nameKo, nameEn, keywords[], text }` |
| `TarotChoiceVerdict` | `{ recommended: 'A'\|'B'\|'either'(카드만으로 우열 없음), confidence: low\|mid\|high, reason }` |
| `TarotMenuPick` · `TarotMenuVerdict` (`5d0c4c7`, 메뉴 타로 v3a) | 서버가 utils `tarotMenu.ts` 로 **결정적으로 고른** 후보 — `menuId/name/cuisine/dishType/kcal(nullable — 음식 카탈로그 동명일 때만 1인분 근사)` 는 서버 데이터, **`reason` 만 LLM**(없으면 정적 문장). Verdict `{ picks.min(1)(첫 번째가 추천), profile(오늘의 입맛), avoid(피할 것) }` |
| `TarotQuota` | `{ remainingToday: int \| null }` — 게스트만 숫자(기기 일일 한도 잔여), 회원 null(한도 없음) |
| `TarotReadingResult` | `{ readingId(회원 자동 저장 id, 게스트 null), spreadId, topic, question, choices, source, model, cards[], summary, advice, keyword, choice(nullable), menu: TarotMenuVerdict.nullable().default(null)(menu 스프레드에서만 — 구버전 저장 행 호환), createdAt, quota }` |
| `TarotReadingSummary` · `ListTarotReadingsQuery` · `ListTarotReadingsResult` | 회원 기록 목록 — Summary `{ id, spreadId, topic, question, keyword, source, cards[]{ cardId, reversed }, createdAt }`, Query `cursor` ≤64 + `limit` coerce 1~50 def 20 → `{ items, nextCursor }`(meal 과 같은 opaque 커서) |
| `CreateTarotShareInput` | `{ readingId?(1~64), reading?: CreateTarotReadingInput, includeQuestion(def false) }` + `refine(readingId \|\| reading)`. **공유 본문은 언제나 서버가 만든다** — 게스트가 임의 문장을 보내 우리 도메인 아래 게시하는 통로가 되지 않게 게스트 공유는 리딩 **입력**만 받아 서버가 캐시/LLM/정적으로 본문을 다시 확보해 저장, 회원은 readingId 로 토큰만 |
| `TarotShareResult` | `{ token, path(origin 없는 웹 경로 — 클라이언트가 자기 origin 을 붙인다), includeQuestion }` |
| `SharedTarotReading` | `TarotReadingResult.omit({ readingId, quota }).extend({ token, includeQuestion })` — 질문은 includeQuestion 일 때만 채워진다(아니면 '') |
| `TarotShareImageFormat` | `'og'`(1200×630 링크 미리보기) / `'story'`(1080×1920 카톡·인스타 세로) |

### `schemas/usage-quota.ts` — [usage-quota.ts](../../packages/api-contract/src/schemas/usage-quota.ts) **(신규 2026-09-03 `cd5a29b`, feature 확장 `f8e5dd0`·`e40b4c0` — 공용 사용량 한도)**

로그인 없이 쓰는 비용성 기능(LLM 호출)의 기기(게스트 키)·IP·전역 일일 한도. **회원은 게스트·IP 일일 한도를
건너뛴다**(사용자 결정 2026-09-02). 전역 일일 예산만 비용 안전망으로 전원에게 적용하되 게스트는 예산의
`guestCutoffPct` % 에서 먼저 끊긴다. 분당 IP 버스트(`ipPerMinute`)는 폭주 클라이언트 방어라 회원에게도 적용.
값은 어드민 "설정 > 사용량 한도" 에서 조정하며 행이 없으면 코드 기본값(friendly `usage-quota.service.ts`).
도메인은 [usage-quota](usage-quota.md).

| Export | 용도 |
| --- | --- |
| `UsageQuotaFeature` | `'tarot-reading' \| 'saju-reading' \| 'saju-g-reading'` — 소비처는 friendly `tarot.service`(`TAROT_QUOTA_FEATURE`)/`saju.service`(`SAJU_QUOTA_FEATURE` — 오늘·궁합·택일·음식도 같은 feature 1건씩)/`saju-g.service`·`saju-g-pair.service`. 타로가 첫 사용처, 리뷰 질문·스마트 픽도 붙일 수 있다(주석) |
| `UsageQuotaSetting` | `{ feature, enabled, guestPerDay(0~100,000), ipPerDay(0~100,000), ipPerMinute(**1**~10,000), globalPerDay(0~1,000,000), guestCutoffPct(0~100), updatedAt(nullable — 행이 없어 기본값으로 동작 중이면 null) }`. **0 = "제한 없음"(ipPerMinute 제외)** |
| `UpdateUsageQuotaSettingInput` | `UsageQuotaSetting.omit({ feature, updatedAt }).partial()` — 기능 하나의 부분 갱신(feature 는 path) |
| `UsageQuotaTopKey` · `UsageQuotaUsage` | 그날 카운터 집계 `{ date, global(LLM 예산 진행률), guestTotal, ipTotal, userTotal, topGuests[]{ key, count }, topIps[] }` |
| `UsageQuotaOverviewItem` · `UsageQuotaOverview` | `{ date, items: { setting, usage }[] }` — 모든 기능의 설정 + 사용량 |
| `UsageQuotaOverviewQuery` | `date` KST `YYYY-MM-DD` regex optional(생략 = 오늘) |

### `schemas/saju.ts` — [saju.ts](../../packages/api-contract/src/schemas/saju.ts) **(신규 2026-09-06 `f8e5dd0`, 확장 `7358c86`·`1c60ad8`·`8ffedb9`·`e40b4c0` — 사주(C), 485줄)**

공개 풀이(무인증, 옵셔널 인증이면 회원 자동 저장) + 회원 프로필·기록·공유. 계산 규칙·데이터의 단일 출처는
`@repo/utils`(`saju.ts`/`sajuCalendar.ts` …)이고 enum 은 **같은 값**(friendly `saju.test` 가
`SajuTenGod.options`/`SajuStarId.options` 동일성 검증). **원국(chart)은 클라이언트와 서버가 같은 utils 로
계산하되 서버는 입력만 받아 다시 계산**하고 그 결과를 프롬프트·저장에 쓴다(클라이언트가 보낸 원국은 믿지 않음).
생년월일시는 개인정보 — 로그·텔레메트리에 남기지 않고 게스트 결과는 공유 전엔 저장하지 않는다. 긴 풀이(full)는
섹션 4개(`personality`·`year`·`cycle`·`advice`)를 서버가 병렬로 LLM 에 보내고 응답은 즉시(정적 본문 + jobId)
돌려준 뒤 클라이언트가 job 을 **long-poll**. API 경로는 `/saju-c`(`5f49026`). 도메인은 [saju-c](saju-c.md).

| Export | 용도 |
| --- | --- |
| `SAJU_GUEST_KEY_HEADER`(= `TAROT_GUEST_KEY_HEADER`) · `SAJU_SUPPORTED_YEAR_RANGE`(1900~2050) · `SAJU_PROFILE_LABEL_MAX_LENGTH`(20) · `SAJU_PROFILE_MAX`(10) · `SAJU_DATE_PICK_MAX_DAYS`(60) | 상수. 헤더 상수만 `tarot.ts` 에서 import(신규 7파일 중 유일한 cross-import) |
| `SajuCalendarKind`(solar/lunar) · `SajuGender`(M/F) · `SajuOptionsInput` · `SajuBirthInput` | 입력 `{ calendar(def solar), year(1900~2050), month(1~12), day(1~31), leapMonth(def false), hour/minute(nullable def null — **null = 시간 모름 → 시주 없이 3기둥**), gender, options: { solarTimeCorrection(def true), lateRatHour(def false) }(학파 차이 — 기본값은 docs/PLAN-saju.md 기본값 표) }` |
| `SajuWuxing`(5) · `SajuTenGod`(10 — `bigyeon…jeongin` 로마자) · `SajuTwelveStage`(12 — **한글 리터럴** `'장생'…'양'`) · `SajuPillarKey`(4) · `SajuRelationType`(12 — 합·충·형·파·해·원진 등) · `SajuStarId`(14 신살) · `SajuSeason`(4) · `SajuStrengthLevel`(3) | 원국 enum — utils `SajuChart` 와 같은 모양 |
| `SajuCivilDate` · `SajuLunarDate` · `SajuStemMeta` · `SajuBranchMeta` · `SajuPillar` · `SajuRelation` · `SajuStar` · `SajuElementScore` · `SajuLuckPillar` · `SajuYearLuck` | 원국 구성 — Pillar `{ key, stem, branch, ganzhi, ko, hanja, stemElement, branchElement, stemTenGod(nullable — 일간 자리), branchTenGod, hidden[], twelveStage, isVoid }`; Relation `{ type, pillars[]('year'\|'month'\|'day'\|'hour'\|**'luck'** — 대운과의 관계), chars[], element?, label }`; LuckPillar(대운 `fromAge/toAge/fromYear`) / YearLuck(올해 `relations[]`) |
| `SajuChart` | 원국 스냅샷 — `input`(정규화된 입력 에코) / `solar` / `lunar`(nullable) / `instant`(`utcMinutes/hourKnown/offsetMinutes/dst/corrected/correctionMinutes`) / `pillars{ year, month, day, hour(nullable) }` / `dayMaster` / `zodiac` / `season` / `tenGodCounts: z.record` / `elements[]` / `excess[]`·`lacking[]` / `strength{ level, score, gotSeason, gotPlace, supportCount }` / `favorable{ primary, secondary(nullable), reason: weak\|strong\|balanced\|season }`(용신) / `relations[]` / `stars[]` / `voidBranches: z.tuple([Int, Int])` / `luck{ forward, startAgeYears/Months, pillars[], currentIndex }` / `yearLuck` / `asOf{ utcMinutes, age, year }` / `warnings[]` |
| `SajuSource`(`llm \| static`) · `SajuReadingSource`(`llm \| static \| mixed` — 섹션 일부만 LLM) · `SajuSectionId`(4) · `SAJU_SECTION_IDS`(= `.options`) · `SajuSectionStatus` | 섹션 상태 `pending`(LLM 응답 대기 — 본문은 정적) / `ready`(LLM) / `static`(최종 정적) |
| `SajuPersonalitySection`(`headline/body/strengths[]/cautions[]`) · `SajuYearSection`(`body` + `months[]{ month 1~12, note }`) · `SajuCycleSection`(`body/current/next`) · `SajuAdviceSection`(`body/keyword/lucky`) — 전부 내부 `SectionBase.extend`(`status/source/model`) · `SajuLucky`(`element/colors[]/directions[]/numbers[]/foods[]`) · `SajuSections` | 풀이 섹션 4개 |
| `SajuQuota` · `CreateSajuReadingInput`(`{ birth }`) · `SajuReadingResult` | `{ readingId(회원 — **섹션이 전부 끝난 뒤 저장되므로 job 진행 중엔 null, poll 결과에 실린다**), jobId(캐시 히트·정적 경로면 null), chart, sections, source, model, createdAt, quota }` |
| `SajuJobPollQuery` · `SajuJobPollResult` | **long-poll** — `after`(이미 받은 version, coerce int def 0)·`wait`(ms, coerce 0~**25,000** def 20,000): 이보다 큰 version 이 생기거나 wait 이 지나면 응답 `{ jobId, version, sections, done, readingId(nullable), source }`. 서버 재시작으로 job 이 없으면 410 |
| `SajuDayTag`(20 — 신살·공망·용신·합충형해파원진·12운성·십신 길흉) · `SajuDay` · `SajuDailyInput` · `SajuDailyResult` | 오늘의 운세 — Day `{ date, lunar, weekday, ko, hanja, element, stemTenGod, twelveStage, score, stars(1~5), tags[] }`; Input `date` YYYY-MM-DD optional(없으면 오늘, 오늘 ±7일); Result `{ dayKey, day, dayMaster, headline, body, advice, lucky, source, model, quota }` |
| `SajuMatchInput` · `SajuMatchGrade`(excellent/good/fair/effort/caution) · `SajuMatchBreakdown`(key `dayMaster\|dayBranch\|zodiac\|elements\|tenGod`) · `SajuMatchResult` | 궁합 — Input `{ a, b, labels{ a(def '나'), b(def '상대') }(trim ≤20, 프롬프트에 데이터로만) }` → `{ score, grade, gradeKo, breakdown[], relations[], mutual{ aToB, bToA }: SajuTenGod, a/b{ label, dayMaster, zodiac, signature }, summary, strengths[], cautions[], advice, source, model, quota }` |
| `SajuDatePurpose`(general/move/contract/interview/trip/date) · `SajuDatePickInput` · `SajuDatePickDay = SajuDay.extend({ purposeScore, purposeStars })` · `SajuDatePickTop = …extend({ reason })` · `SajuDatePickResult` | 택일 — `from` optional(오늘 이전은 오늘로)·`days` 1~60 def 30 → `{ purpose, from, days[], top[], source, model, quota }` |
| `SajuFoodInput`(`today` def true — 오늘 일진 오행 가점) · `SajuFoodPick`(`TarotMenuPick` 과 같은 필드 + `elements[]`) · `SajuFoodResult` | 오행 음식 — `{ picks.min(1), primary, secondary(nullable), avoid[], dayElement(nullable), profile, avoidText, source, model, quota }` |
| `SajuProfileInput`(`label` trim 1~20, `birth`, `isPrimary` def false) · `SajuProfile = Input.extend({ id, createdAt, updatedAt })` · `SajuProfileList` | 회원 프로필(나·가족 여러 명) — 최대 10 은 상수(`SAJU_PROFILE_MAX`)일 뿐 `items` 배열 max 없음 |
| `SajuReadingKind`(full/daily/match/date-pick/food) · `SajuReadingSummary`(`id/kind/signature/dayMaster/keyword/source/createdAt`) · `ListSajuReadingsQuery`/`...Result` | 기록 목록 — 타로와 같은 커서 계약(`cursor` ≤64, `limit` 1~50 def 20) |
| `CreateSajuShareInput` · `SajuShareResult` · `SharedSajuReading` · `SajuShareImageFormat` | 공유 — Input `{ readingId?, birth?: SajuBirthInput, includeBirth(def false) }` + refine 둘 중 하나(타로와 같은 "게스트는 입력 재전송" 원칙). Result `{ token, path, includeBirth }`. Shared `{ token, includeBirth, chart, sections, source, model, createdAt }` — omit 파생이 아니라 **새 object**(readingId·jobId·quota 없음). 이미지 `og`/`story` |

### `schemas/saju-g.ts` — [saju-g.ts](../../packages/api-contract/src/schemas/saju-g.ts) **(신규 2026-09-06~07 `e40b4c0`·`82ab04a` — 사주(G), 다른 세션 구현)**

같은 "사주" 기능의 **별도 구현**(경로 `/saju-g`). 사주(C)와 스키마·모듈·DB 를 공유하지 않고 게스트 키 헤더
상수(`SAJU_G_GUEST_KEY_HEADER = 'x-guest-key'`)도 자체 선언(값은 같음). 사주(C)와의 관계·통합 방향은
[saju-g](saju-g.md).

| Export | 용도 |
| --- | --- |
| `SajuGElement`(5) · `SajuGKind`(`natal \| annual \| daily`) | enum |
| `SajuGBirth` | `{ date(regex `1899\|19xx\|20xx-MM-DD`), calendar(def solar), leapMonth(def false), timeAccuracy(exact/range/unknown def unknown), time('HH:mm' nullable def null), timeRange(night/morning/afternoon/evening nullable), timeZone: z.literal('Asia/Seoul'), dayBoundary(midnight/zi def midnight), disambiguation(reject/earlier/later def reject) }` + **`superRefine` 3종**(양력인데 윤달 / exact 인데 time 없음 / range 인데 timeRange 없음). 사주(C)의 정수 필드와 달리 **문자열 날짜·시각** |
| `CreateSajuGReadingInput` | `{ birth, kind(def natal), note(trim ≤200 def '') }` |
| `SajuGElementCount`(`count` 0~8) · `SajuGChart` | `calculationVersion` / `solarDate` / `lunarDate` / `timeLabel` / `standardTime`(nullable) / `dayBoundary` / `pillars.length(4)`(내부 `Pillar` — `ganZhi`·`pronunciation`·`stemElement`·`branchElement`·`tenGod` nullable, `candidates[]`, `hiddenStems[]`) / `elements.length(5)` / `unknownCharacters` 0~8 / `dayMaster`(nullable — `hanja/ko/element/symbol/title/description`) / `notices[]` / `facts[]`(내부 `Fact` `id/label/description`) / `period{ kind, label, key, ganZhi, relation, months[] }` |
| `SajuGLifeScene` · `SajuGReport` | LLM 보고서 — Scene `{ id: meeting\|busy\|conflict, text ≤700, action ≤200, question ≤200, evidenceIds 1~6 }`; Report `{ headline ≤100, summary ≤1500, sections **3~5개**{ id ≤32, title ≤60, text ≤1800, evidenceIds 1~6 }, practice ≤400, reflection ≤300, lifeScenes.length(3).optional()(v4 개인 원국 풀이 `82ab04a` — 구버전 보관함·기간 풀이·궁합과 호환) }`. **문자열 길이 상한이 LLM 출력 검증 계약** |
| `SajuGReadingResult` | `{ readingId(nullable), receipt(nullable), birth, kind, chart, report, source: 'ai'\|'basic', model, promptVersion, fallbackReason: not_configured\|quota\|unavailable \| null, remainingToday(nullable), createdAt }` — 사주(C)의 `source: llm\|static`/`quota.remainingToday` 와 다른 이름·자리 |
| `SajuGReceiptInput`(`receipt` 20~64) · `SajuGReadingSummary`(`id/kind/title/period/source/createdAt`) · `ListSajuGReadingsQuery`(`limit` 1~50 def 20, `cursor` ≤64) · `ListSajuGReadingsResult` | 명시적 보관(receipt 로 저장) + 기록 커서 목록 |
| `SAJU_G_PROFILES_MAX`(20) · `SajuGProfileInput`(`name` trim 1~24 + **제어문자 금지 regex** `^[^\p{Cc}]+$`) · `SajuGProfile = Input.extend({ id(1~64), revision(양의 정수), createdAt, updatedAt })` · `UpdateSajuGProfileInput = Input.extend({ revision })` · `SajuGProfileList`(`items.max(20)`) | 프로필 — 사주(C)와 달리 배열 max 와 `revision`(낙관적 잠금)이 계약 |
| `SajuGRelationship`(partner/friend/family/colleague) · `SajuGPairBirths`(`first/second`) · `CreateSajuGPairInput`(+`relationship` def partner, `note`) · `SajuGConnection`(same/first-nurtures/second-nurtures/first-regulates/second-regulates/unknown) · `SajuGPairChart` · `SajuGPairResult = SajuGReadingResult.pick({ source, model, promptVersion, fallbackReason, remainingToday, createdAt }).extend({ chart: SajuGPairChart, report })` | 두 사람 오행 궁합(`8ffedb9`) |
| `CreateSajuGShareInput` | `{ receipt?(20~64) \| readingId?(≤64) \| birth? \| pair? }` + refine **정확히 하나** |
| `PublicSajuGShare` | 공개 상징만 — `{ title, description, symbol, element(nullable), elements[], unknownCharacters, pair?{ element, symbol, elements.length(5), unknownCharacters, connection } }`. **원본 날짜·명식·질문·AI 자유문장 미포함** |
| `SajuGShareToken` · `SajuGShareResult` · `SajuGShareError` · `RevokeSajuGShareInput` | 토큰 regex **10자 \| 32자** base64url(`e40b4c0` 단축 — 이전 32자도 조회·취소 가능) · `{ token, path, revokeToken }` · `{ statusCode: literal(503), error: literal('Service Unavailable'), message }`(공유 라우트의 503 응답 스키마 — 이 패키지에서 에러 응답을 도메인 파일에 선언한 첫 사례) · `{ revokeToken 20~64 }` |

### `schemas/menu-grouping.ts` / `schemas/analytics.ts` / `schemas/settings-map.ts`

(직전 라운드 그대로 — 변경 없음. `analytics.ts` 의 `CategoryTreeNode` 가 17차부터
`restaurant.ts` 에 의해 import 돼 식당별 category tree 에도 재사용된다.)

### `schemas/ai.ts` — [ai.ts](../../packages/api-contract/src/schemas/ai.ts) **(purpose=log-analysis + 텔레메트리)**

| Export | 용도 |
| --- | --- |
| `AiCompleteInput/Result`, `AiCompleteBatchInput/Result` | LLM 호출 + 배치 |
| `AiErrorCode` | `rate_limited/upstream_failed/timeout/invalid_response/provider_unavailable/provider_disabled/no_api_key`. **`logs.ts` 가 `.options` 를 스프레드해 재사용** |
| `AiTokenUsage` | `{ promptTokens, completionTokens }` (nullable) |
| `LlmProviderId` | `'ollama-cloud'` |
| `LlmProviderPurpose` | **(2026-09-02~06) 8종** `'chat' \| 'image' \| 'log-analysis' \| 'meal-photo' \| 'meal-recommend' \| 'tarot' \| 'saju' \| 'saju-g'` — `tarot`(`cd5a29b`)·`saju`(`f8e5dd0`)·`saju-g`(`e40b4c0`) 는 **무인증 공개 기능이라 전용 키(own)를 두면 계정 한도가 chat 과 분리된다**(주석 근거). (2026-08-22 5종: `meal-photo` 는 식단 사진 vision(image 와 모델·게이트를 분리해 독립 튜닝), `meal-recommend` 는 다음 끼니 추천 텍스트.) 키·baseUrl 은 chat 계정 상속, 모델은 용도별 `OLLAMA_*_MODEL` 폴백. friendly 의 `AiConfigService.ALL_PURPOSES = LlmProviderPurpose.options` — enum 순서가 곧 어드민 카드 순서. (18차: `log-analysis` 추가 — 미설정 시 실패 잡 자동 분석 조용히 스킵) |
| **`LlmKeySource` (신규)** | `'own' \| 'inherited' \| 'env' \| 'none'`. 이 용도가 어떤 키로 동작하는지 UI 배지. image·log-analysis 는 자기 키 없으면 chat row(없으면 env) 상속 |
| **`LlmModelSource` (신규)** | `'own' \| 'env' \| 'none'`. 모델은 상속 안 하므로 3가지 |
| `LlmProviderConfig` | `provider` × `purpose` 복합 키 row. `hasApiKey/apiKeyMasked/keySource/baseUrl/defaultModel/defaultModelSource/enabled/maxConcurrent` (**18차 keySource/defaultModelSource 추가**) |
| `LlmProviderListResult` | `{ providers: [] }` |
| `UpdateLlmProviderInput` | partial update. apiKey empty → 기존 유지. null 명시 → clear |
| `TestLlmProviderInput/Result` | 모델 alias 검증 (성공 분기 + 에러 분기) |
| `LlmModelListResult` | provider 가 지원 시 모델 목록 (실패 시 빈 배열) |
| `PreviewLlmModelsInput/Result` | 저장 없이 입력 폼의 키만으로 모델 목록 조회 — 신규 등록 시 키 검증 + 모델 선택 통합. 결과는 ok 분기로 잘못된 키 에러 노출 |
| **LLM 텔레메트리 (신규, 표시 전용)** | 어댑터 한 곳에서 수집한 인메모리 집계 — 강제(예산 차단) 없음. 서버 재시작 시 리셋 |
| `LlmGateSnapshot` | `{ limit, inflight, queued, oldestWaitMs }`. 동시성 게이트 큐 상태 |
| `LlmCallStatus` | `'ok' \| 'error' \| 'cancelled' \| 'timeout'` |
| `LlmTelemetryCall` | 한 호출 — `{ id, purpose, model, status, errorName, ...tokens, queueWaitMs(게이트 대기, durationMs 와 분리), durationMs, retries(429 백오프), at }` |
| `LlmTelemetryAgg` / `LlmTelemetryWindow` | 집계 + 윈도우(avg/maxDurationMs) |
| `LlmTelemetrySnapshot` | `{ startedAt, totals, byPurpose[], byModel[], windows(m1/m5/h1), active[], recent[], gates: { account[], purposes[] } }`. 계정(API 키) 단위 공유 게이트 — 키는 노출 안 함 |

### `schemas/settlement-extraction.ts` — [settlement-extraction.ts](../../packages/api-contract/src/schemas/settlement-extraction.ts)

영수증 사진을 vision LLM 으로 항목화. settlement 세션 생성 직전 단계.

| Export | 용도 |
| --- | --- |
| `ReceiptItemCategory` | `'ALCOHOL' \| 'NON_ALCOHOL' \| 'SIDE' \| 'UNCATEGORIZED'`. 분배 시 풀 분리 기준 |
| `ReceiptItem` | `{ name(1~120), unitPrice, quantity, amount, category, matchedMenuName }` |
| `UploadReceiptResult` | `{ imageToken, previewUrl, byteSize }`. 클라이언트는 token 만 보관 |
| **`ExtractReceiptSplit` (신규)** | `{ count: 2..5, index: 1..count }` 가로 N등분. `refine: index <= count`. count=1 의미는 명시적으로 표현 안 함(`split` 자체 옵션을 omit 하면 분할 안 함) |
| `ExtractReceiptInput` (확장) | `{ imageToken, placeId, roundIndex?, roundTotal?, split? }`. **`roundIndex` 1..20 + `roundTotal` 1..20** — '2차/N차' 컨텍스트를 LLM 프롬프트에 주입. `split` 지정 시 같은 imageToken 으로 N번 호출 (index 만 다르게) |
| `ExtractReceiptResult` | `{ items: ReceiptItem[], totalAmount, itemsSubtotal, warning, model }`. `warning` 은 소계 vs 총금액 불일치 |

### `schemas/settlement.ts` — [settlement.ts](../../packages/api-contract/src/schemas/settlement.ts) **(N차 모델 + 세부 분배 그룹 + 공유 OG)**

세션 한 건이 **여러 차수(rounds)** 를 가진다. 마스터 참여자(`SettlementParticipant`) 가
세션 단위, 차수별 참석/제외 override 는 `SettlementRoundAttendee` 가 담당. 차수별로
식당이 다를 수 있어 `restaurantPlaceId` 가 round 에도 있다. items/attendees 가 session
직속에서 사라지고 `rounds[]` 안으로 이동. 공유 OG 이미지 선택 페어(`ShareTtl`/`ShareOgImage`)
+ `receiptImageToken` 은 17차에 추가됨. **이번 라운드(18차) 신규**: 세부 분배 그룹
(`SettlementItemGroup` 외) + `SettlementCategoryAdjustment` 의 leftover 가 **단일 id 에서
배열(`leftoverParticipantIds[]`)** 로 확장('몰아주기'→'나눠 받기').

| Export | 용도 |
| --- | --- |
| `SettlementSource` | `'MANUAL' \| 'RECEIPT'`. 차수 단위 — 1차 RECEIPT + 2차 MANUAL 가능 |
| `SettlementItem` / `SettlementItemInput` | 한 항목. `{ id, name(1~120), unitPrice, quantity, amount, category, matchedMenuName, orderIndex }`. Input 은 `id`/`orderIndex` 생략 |
| **`SettlementRoundAttendee`** | `{ participantId, attended, excludeAlcoholOverride: bool\|null, excludeNonAlcoholOverride: bool\|null, excludeSideOverride: bool\|null, shareAmount }`. **override = null 이면 마스터 default 사용**, true/false 면 그 차수만 덮어쓰기 |
| **`SettlementRoundAttendeeInput`** | `{ participantClientId(min 1), attended(default true), excludeXxxOverride: bool\|null }`. 입력 시점엔 마스터 cuid 가 아직 없어 클라이언트가 안정적 임시 키(`participantClientId`)로 매핑 |
| **`SettlementCategoryAdjustment`** (응답, 18차 변경) | `{ leftoverParticipantIds: string[].min(1), roundUnit: int>0 \| null }`. **leftover 가 단일 id → 배열** — 1명이면 그 사람이 잔여 전부 흡수('몰아주기'), 여러 명이면 잔여를 그들끼리 균등 분배('나눠 받기') |
| **`SettlementCategoryAdjustmentInput`** (입력, 18차 변경) | `{ leftoverParticipantClientIds: string[].min(1), roundUnit }` — 입력은 clientId 배열로 |
| **`SettlementCategoryAdjustments`** / **`...Input`** | `Record<카테고리, adjustment \| null>` 의 `.nullable()` (Input 은 `.optional().default(null)`) |
| **`SettlementGroupSplitMode` (신규)** | `'EQUAL' \| 'GLASSES'`. 세부 분배 그룹 분배 방식 — EQUAL=그룹 내 균등, GLASSES=잔수(정수 가중치) 비례 |
| **`SettlementGroupMember` / `...Input` (신규)** | `{ participantId(응답)/participantClientId(입력), glasses: int 0..999 }`. EQUAL 모드에선 glasses 무시, 0잔=멤버로 두되 분담 0 |
| **`SettlementItemGroup` / `...Input` (신규)** | `{ label(1..40), category: ReceiptItemCategory, itemIndexes: int[].min(1)(round.items orderIndex 참조), mode, members[] }`. 한 카테고리 풀에서 특정 항목(소주/맥주 등)을 떼어 그룹 멤버끼리만 분배. 스키마는 범용이나 UI 는 주류/음료에만 노출 |
| **`SettlementRound`** | `{ id, orderIndex, restaurantPlaceId, restaurantName, source, totalAmount, warning, receiptPreviewUrl, receiptImageToken: string\|null, itemsSubtotal, discountAmount: int>0\|null, discountCategory: ReceiptItemCategory\|null, categoryAdjustments, **groupSplits: SettlementItemGroup[]\|null (신규)**, items, attendees }`. `receiptImageToken` 은 소유자 응답 한정(공유 omit) |
| **`SettlementRoundInput`** | 입력 차수. `items.min(1).max(200)` + `attendees.min(1).max(100)` + **`groupSplits.max(30).nullable().optional().default(null)`**. discount{Amount,Category} optional+default(null). **4 단 refine**: ① `(amount==null)===(category==null)`(페어 강제), ② 같은 카테고리 풀 ≥ discountAmount(풀 음수 방지), ③ groupSplits itemIndexes 범위·카테고리 일치·그룹 간 중복 없음, ④ 그룹 내 같은 참여자 중복 금지 |
| `SettlementParticipant` | 마스터 참여자. `{ id, name, nickname, excludeAlcohol, excludeNonAlcohol, excludeSide, shareAmount(=모든 round 합), orderIndex, contactId(nullable) }` |
| **`SettlementParticipantInput`** | `{ clientId(min 1), name, nickname, excludeXxx(default false), contactId? }`. **clientId 는 required** — 클라가 안정적 임시 키 부여, round.attendees 의 `participantClientId` 와 매칭 |
| **`SettlementSession`** | `{ id, userId, restaurantPlaceId, restaurantName(=1차 식당 snapshot, 목록·이력 호환), grandTotal(=모든 round itemsSubtotal 합), rounds: SettlementRound[].min(1), participants: SettlementParticipant[], createdAt, updatedAt, editedAt(nullable) }` |
| **`CreateSettlementInput`** | `{ rounds: SettlementRoundInput[].min(1).max(10), participants: SettlementParticipantInput[].min(1).max(100), fromDraftId?: string }`. **`fromDraftId`** — 임시저장에서 출발이면 저장 트랜잭션 안에서 해당 draft 함께 삭제. 본인 소유가 아니거나 없는 id 면 조용히 무시 |
| **`UpdateSettlementInput`** | `= CreateSettlementInput`. **전체 replace** 의미 — 부분 PATCH 없음. 서버는 트랜잭션으로 삭제→재삽입 + shareAmount 재계산 |
| `ListSettlementsQuery` | `{ placeId?, offset, limit(1~50, def 20) }` |
| **`SettlementSessionSummary`** | `{ id, restaurantPlaceId, restaurantName, source(=1차), grandTotal, roundCount, itemCount(=차수 합), participantCount, createdAt }` |
| `ListSettlementsResult` | `{ items: SettlementSessionSummary[], total }` |
| **`ShareTtl`** | `'1d' \| '7d' \| '30d'`. 무제한 없음 — 모든 링크가 최대 30일 내 만료돼 짧은 토큰(10자)의 brute-force 노출 창을 닫는다 |
| **`ShareOgImage`** | `'restaurant' \| 'table'`. `restaurant` = 정산 식당 사진(네이버 호스트, owner 가 갤러리에서 1장 고르거나 미선택 시 토큰 시드 결정적 랜덤, 사진 없으면 정산표 폴백) / `table` = 정산표 매트릭스 PNG. 기본 `restaurant` (참가자 이름이 미리보기/크롤러 캐시에 안 박혀 프라이버시상 유리) |
| **`CreateSettlementShareInput`** | `z.preprocess(v=> v==null?{}:v, z.object({ ttl: ShareTtl.default('7d'), ogImage?: ShareOgImage, ogImageUrl?: string.url().nullable() }))`. 본문 없는 POST 도 `{}` 로 메꿔 ttl 기본 적용. **`ogImage` 생략=기존 선택 유지** (첫 공유면 restaurant). **`ogImageUrl` 트라이스테이트**: 생략→유지 / null→선택 해제(랜덤 복귀) / URL→후보 목록의 그 사진 고정(후보에 없으면 서버가 무시→null) |
| `SettlementShare` (응답, 확장) | `{ token: nullable, shareUrl: nullable, **expiresAt: nullable (만료 ISO, 토큰 없으면 null)**, **ogImage: ShareOgImage (현재 선택 복원용)**, **ogImageUrl: string\|null (선택된 식당 사진 원본 URL, 미선택 null=랜덤)**, **ogImageCandidates: string[] (갤러리 후보 원본 URL, 식당 사진 없으면 빈 배열→갤러리 숨김)** }`. 회수 후 token/shareUrl/expiresAt 모두 null |
| **`SharedSettlementSession`** | `SettlementSession.omit({ userId, rounds }).extend({ rounds: SharedSettlementRound[] })` 여기서 `SharedSettlementRound = SettlementRound.omit({ receiptPreviewUrl, **receiptImageToken** })`. 토큰 받은 사람도 원본 사진·재업로드 토큰 둘 다 못 본다 (17차에 omit 가 1→2 필드. groupSplits 는 공유에도 노출 — 민감 정보 아님) |

### `schemas/settlement-draft.ts` — [settlement-draft.ts](../../packages/api-contract/src/schemas/settlement-draft.ts) **(신규)**

정산 입력 화면의 서버 임시저장. 자동저장(debounce)으로 다기기 동기화. **payload 는
서버가 형태 검증을 하지 않고 보관만 한다** — 클라이언트 store 모양이 진화해도 BE 영향
없게 의도적으로 분리. 크기만 안전 cap.

| Export | 용도 |
| --- | --- |
| **`SettlementDraft`** | `{ id, placeId: string\|null, placeNameHint: string\|null, payload: unknown, createdAt, updatedAt }`. `placeId=null` 은 '/me/settlements/new' 흐름(식당 미지정 슬롯). `(userId, placeId)` unique — 같은 식당의 draft 는 하나만 유지 |
| **`UpsertSettlementDraftInput`** | `{ placeId: string(1~64) \| null, placeNameHint?: string(<=120) \| null, payload }`. **payload refine**: `JSON.stringify(v).length <= 200KB` (200 * 1024). 안전 cap 만 적용, 형태는 통과 |
| **`ListSettlementDraftsResult`** | `{ items: SettlementDraft[] }` |

### `schemas/settlement-contact.ts` — [settlement-contact.ts](../../packages/api-contract/src/schemas/settlement-contact.ts)

(직전 라운드 그대로 — `SettlementContact`, `ListContactsQuery/Result`, `UpdateContactInput`.
`lastExclude*` 는 가장 최근 정산의 선택, 다음 정산의 default 자동 제안.)

### `settlement.calculator.ts` — [settlement.calculator.ts](../../packages/api-contract/src/settlement.calculator.ts) **(세부 분배 그룹)**

FE/BE 공통 분배 계산기 — 순수 함수. 멀티라운드는 17차에, **세부 분배 그룹(EQUAL/GLASSES)
은 이번 라운드(18차)** 에 흡수.

| Export | 용도 |
| --- | --- |
| `CalculateInput` | `{ items: Pick<...,'amount'\|'category'>[], participants: Pick<...,'excludeXxx'>[] }` |
| `CalculateOutput` | `{ shareAmounts[], itemsSubtotal, poolBreakdown: Record<카테고리, {poolAmount, participantCount, perParticipant, **equalPoolAmount(신규 — 나머지 균등 풀)**}>, perCategoryShares: Record<카테고리, number[]>, **groupBreakdown: GroupShareBreakdown[](신규)** }` |
| `calculateShares(input)` | 메인 함수. 옵션 `discount?`, `categoryAdjustments?`, **`groups?: GroupCalcInput[] \| null` (신규)**. categoryAdjustments 의 `leftoverParticipantIndexes` 도 **단일 index → 배열** (나눠 받기 지원) |
| **`GroupMemberCalcInput`** (타입) | `{ participantIndex, glasses }`. participantIndex 는 calculateShares 의 participants 인덱스 |
| **`GroupCalcInput`** (타입) | `{ category, itemIndexes[], mode: 'EQUAL'\|'GLASSES', members: GroupMemberCalcInput[] }` |
| **`GroupShareBreakdown`** (타입) | `{ poolAmount(할인 차감 후, applied=false 면 0), totalGlasses, shares[], applied(유효 멤버 0명이면 false → 나머지 균등 풀로 환원) }` |
| **`toGroupCalcInputs(groupSplits, participantIndexById)`** | 저장된 세션의 `groupSplits`(participantId 참조)를 계산기 입력으로 변환. 매핑 안 되는 id 는 -1 → calculator 가 방어적 무시. 정산표 매트릭스(웹)·공유 OG PNG(서버) 공용 |
| `CategoryAdjustmentsInput` (타입, 18차 변경) | `Partial<Record<카테고리, { leftoverParticipantIndexes: number[], roundUnit }>>` — **배열로** |
| `effectiveExcludes(master, override)` | `{excludeXxx}` 합성. override.x===null → 마스터 그대로 (`a ?? b`) |
| `RoundAttendeeCalcInput` / `RoundCalcInput` (타입) | 마스터 인덱스 + effective excludes / `{ items, attendees, discount?, categoryAdjustments?, **groups?(신규 — 멤버 participantIndex 는 마스터 인덱스)** }` |
| `MultiRoundCalcInput` / `PerRoundCalcOutput` / `MultiRoundCalcOutput` | 멀티라운드. PerRound 에 **`groupBreakdown`(마스터 인덱스)** 추가 |
| `calculateMultiRoundShares(input)` | 차수별 독립 calc → 마스터 인덱스 합산. 내부에서 `masterToAttendee` 맵으로 categoryAdjustments 의 leftover 배열·**그룹 멤버**의 마스터 인덱스를 참석자 인덱스로 변환(이 차수 비참석 멤버는 자동 제외 → 그룹 멤버 0명이면 나머지 풀로 환원), 결과를 다시 마스터 인덱스로 부풀린다 |

분배 규칙 요약 (단일 차수):
- **풀 분리** — items.amount 합을 4 카테고리 풀로 쪼갠다. 카테고리 풀을 다시 **그룹 풀 +
  나머지(균등) 풀**로 분해.
- **할인 차감** — `discount.category` 풀에서 차감, 나머지/그룹 풀에 금액 비례(`distributeByWeight`)로 분산.
- **그룹 분배** — 그룹 멤버끼리만 `distributeByWeight` (EQUAL=가중치 1, GLASSES=잔수). 유효 멤버
  0명이면 그룹 풀을 나머지 풀로 환원(`applied=false`). GLASSES 인데 잔수 합 0 이면 균등 fallback.
- **풀별 참여자 산정** — ALCOHOL 풀이면 `excludeAlcohol=false` 인 참여자만. UNCATEGORIZED 는 전원.
- **`roundUnit` rounding** — round 한 나머지 풀이 인원수로 나눠떨어질 때만 적용, 아니면 silent 무시.
- **leftover 흡수** — `leftoverParticipantIndexes` 활성자(들)에게 잔여 균등 분배(중복 제거, 0명이면 첫 활성자).
- **전원 제외 풀 fallback** — activeCount=0 + 풀>0 이면 전원 균등 분배(=UNCATEGORIZED 처럼).
- **perCategoryShares** — 그룹 분담 포함, fallback 케이스에도 본래 카테고리 키에 기록 (매트릭스 컬럼 합 invariant).

### `settlement.drink-kinds.ts` — [settlement.drink-kinds.ts](../../packages/api-contract/src/settlement.drink-kinds.ts) **(신규 — 술·음료 종류 사전)**

zod 스키마가 아니라 **순수 데이터 + 매칭 함수**다. 한 사전이 세 곳을 단일 소스로 먹인다:
① FE 세부 분배 그룹 제안(`@repo/shared` groupSuggestion), ② 영수증 추출 후 카테고리
결정적 보정(friendly), ③ 추출 프롬프트 제품명 힌트. '새로/대선/시원' 같은 제품명이 일반
단어와 겹쳐 vision 모델이 안주로 오인식하는 걸 ②③ 이 잡으므로 브랜드 추가는 여기 한 곳이면 된다.

| Export | 용도 |
| --- | --- |
| `GROUPABLE_CATEGORIES` / `GroupableCategoryType` | `['ALCOHOL', 'NON_ALCOHOL']` (`satisfies readonly ReceiptItemCategoryType[]`) — 그룹 분배 노출 카테고리 |
| `isGroupableCategory(category)` | type guard |
| `DrinkKeywordDef` (타입) | `string \| { kw, noHangul: 'before'\|'after'\|'around' }`. **noHangul 가드** — 매칭 위치의 지정 방향에 한글이 붙으면 다른 단어 일부로 보고 무시 ("새로 360ml" ✅ / "새로운안주" ❌) |
| `DrinkKindDef` (타입) | `{ label, category: GroupableCategoryType, keywords: DrinkKeywordDef[], promptBrands? }` |
| `DRINK_KINDS` | 소주/맥주/막걸리/하이볼/와인/사케·청주/위스키/칵테일/콜라/사이다/주스·에이드/커피·차/음료 사전. 순서 = 매칭 우선순위(첫 매칭 승리) |
| `matchDrinkKind(names[])` | 이름 후보들로 종류 찾기 (공백 제거 후 비교). 못 찾으면 null |
| `DRINK_BRAND_PROMPT_HINT` | "참이슬/…(소주), 카스/…(맥주)" 형태 — promptBrands 있는 종류만, 추출 프롬프트에 주입 |

### `routes.ts` — [routes.ts](../../packages/api-contract/src/routes.ts)

`API_PREFIX = '/api/v1'` 고정. 도메인별 객체:

| Namespace | 키 | 경로 |
| --- | --- | --- |
| `Auth` | register, login, me, logout | `/auth/...` |
| `Users` | list, byId(id) | `/users[/:id]` |
| `Picks` | list, create, byId(id) | `/picks[/:id]` |
| `Admin` | listUsers, setUserRole(id) | `/admin/users[/:id/role]` |
| `Media` | thumbnail | `/media/thumbnail` |
| `Crawl` | naverPlace, jobs, job(id), jobEvents(id), jobLogs(id), search, catchtable*, diningcode*, **tabling*(search, shop(idx), shopReviews, shopSave, placeSave, registered, discover, bulkSave*)** | `/admin/crawl/...` |
| `Restaurant` | 공개: ranking, publicList, publicByPlaceId, publicInsights, **publicMenuNutrition(placeId)(신규 2026-09-02 — 메뉴 탭 칼로리 지연 조회)**, publicReviews(placeId), publicCategoryTree(placeId) / 어드민: list, byPlaceId, delete, summaryStatus, summaryEvents, reanalyze, cancelSummary, resumeSummary, reviewResummarize(reviewId), crawlLogs, insights, smartPick, menusGroup, menusRanking, analyticsBackfill, regionStats | `/restaurants/...`(+ `/restaurants/public/:placeId/menu-nutrition`) + `/admin/restaurants/...` |
| `Canonical` | candidates(id), merge, split(id), dismissSuggestion(id), proposals, proposalsRun, proposalAccept(id), proposalReject(id), delete(id) | `/admin/canonical/...` |
| `Analytics` | restaurantsStatus, groupingJobs/Job/JobEvents, overview, globalMenus, globalMergeJobs/Job/JobEvents, categoryTree | `/admin/analytics/...` |
| `Schedule` | config (GET 조회+다음 실행 / PUT 변경), run (지금 실행=manual), runs (이력+inflight), runEvents (진행 SSE), preview (cron 검증+미리보기) | `/admin/schedule[/run\|/runs\|/run-events\|/preview]` |
| `AutoDiscover` | jobs, job(id), **jobConfirm(id)(awaiting_confirmation 해제)**, jobEvents(id) | `/admin/auto-discover/jobs[/:id[/confirm\|/events]]` |
| **`RandomCrawl` (신규)** | config (GET/PUT), run (manual), runs, runEvents (SSE), preview, **regions(시도→시군구 트리), regionDongs(?sido=&sigungu=)** | `/admin/random-crawl[/run\|/runs\|/run-events\|/preview\|/regions[/dongs]]` |
| `Ai` | complete, completeBatch, providers, provider(id, purpose), testProvider(id, purpose), providerModels(id, purpose), providerModelsPreview(id, purpose), **telemetry, telemetryStream(SSE)(신규)** | `/admin/ai/...` (`/:id/:purpose[/test|/models|/models/preview]`, `/telemetry[/stream]`) |
| **`Logs` (신규)** | runs, run(id), runLogs(id)(cursor), analyze(id)(실패 run 재분석), config (GET/PUT 보존기간) | `/admin/logs/runs[/:id[/logs\|/analyze]]` + `/admin/logs/config` |
| `SettingsMap` | list, provider(id), secret(id), publicConfig | `/admin/settings/map/...` + `/settings/map/public` |
| **`SettingsTelegram` (신규)** | config (GET/PUT/DELETE), test, resolveChatId | `/admin/settings/telegram[/test\|/resolve-chat-id]` |
| **`ReviewSearch` (신규)** | 어드민: restaurants, enrich, ask, status, enrichBg, enrichPending, enrichEvents(SSE) / 공개: publicQaReady(placeId), publicAsk(placeId) | `/admin/review-search/...` + `/restaurants/:placeId/qa[/ready]` |
| **`ReviewClustering` (신규)** | 어드민: run, status, bg, pending / 공개: publicClusters(placeId) | `/admin/review-clustering/...` + `/restaurants/:placeId/clusters` |
| `SettlementExtraction` | upload, extract, preview(token) | `/settlement-extraction/...` |
| **`Settlement`** | list, create, one(id), **`update(id)`** (PUT 전체 replace, 기존 updateParticipants 대체), share(id), shared(token) | `/settlements/...` + `/share/settlements/:token` |
| **`SettlementDraft` (신규)** | **list, upsert (PUT `/settlement-drafts`), one(id) (DELETE)** | `/settlement-drafts[/:id]` |
| `SettlementContact` | list, one(id) | `/me/contacts[/:id]` |
| **`Bus` (신규, 19차)** | 공개: stationSearch, stationsNearby, stationArrivals(arsId), busPositions(busRouteId), routeDetail(busRouteId) / 인증: favorites, favoriteStation(stId)(PUT/DELETE), favoriteRoute(stId, busRouteId)(PUT/DELETE), favoritesSync(POST) | `/bus/stations/...` + `/bus/routes/:id/{positions,detail}` + `/bus/favorites[/...]` |
| **`Food` (2026-08-22, 확장 2026-09-03)** | 사용자(인증): search, restaurants(foodId) / 어드민: adminItems(GET/POST), adminItem(id)(PATCH), adminStats, adminMergeConflicts, adminMergeConflict(id)(PATCH), adminRecognitionQuality(?days), **adminMenuLexicon(GET ?kind / POST), adminMenuLexiconEntry(id)(DELETE)(신규 `fb12027` — 칼로리 엔진 어휘)**, importConfig(GET/PUT), importRun(POST), importRuns, importRunEvents(SSE `?token=`), importPreview(POST) | `/food/search` + `/food/:id/restaurants` + `/admin/food/{items[/:id],stats,merge-conflicts[/:id],recognition-quality,menu-lexicon[/:id],import[/run\|/runs\|/run-events\|/preview]}` |
| **`Meal` (신규, 2026-08-22~23)** | entries(GET/POST), entry(id)(GET/PATCH/DELETE), calendar(?month), stats(?from&to), timePresets, recentItem(?name), photos(POST multipart `file`), photo(token)(GET/DELETE), photoThumb(token), photoCopy(token)(POST), recognize(POST), preference(GET/PUT), recommendations(GET/POST), recommendationContext, recommendationFeedback(id)(POST), recommendationEvents(id)(POST), dataExport, dataBackup(GET), dataRestore(POST), photoRetention(GET/DELETE), data(DELETE) — **21키 전부 로그인** | `/meals[/:id]` + `/meals/{calendar,stats,time-presets,items/recent,photos[/:token[/thumb\|/copy]],recognize,preference,recommendations[/context\|/:id/feedback\|/:id/events],data[/export\|/backup[/restore]\|/photos/retention]}` |
| **`AirQuality` (신규, 2026-08-21)** | 공개: sidoRealtime(sidoName)(**encodeURIComponent**), stationHistory(stationName)(인코딩, ?term), badStations, forecast(?date), weeklyForecast(?date), stations, stationsNearby(?lat&lng&radius&limit), stationSearch(?q) / 인증: location(GET/PUT/DELETE) | `/air/sido/:sidoName` + `/air/stations[/:stationName/history\|/nearby\|/search]` + `/air/bad-stations` + `/air/forecast[/weekly]` + `/air/location` |
| **`Weather` (신규, 2026-08-21)** | nowcast(?nx&ny), forecast(?nx&ny), versions, mid(?land&ta[&stn]), midSea(?regId), aws(?lat&lng[&radius&limit]) — 전부 공개 | `/weather/{nowcast,forecast,versions,mid,mid/sea,aws}` |
| **`LifeMap` (신규, 2026-08-21)** | status, points(?layer&bbox&zoom[&필터]), nearby(?layer&lat&lng[&radius&limit&필터]), search(?q[&limit]), detail(layer, id)(**둘 다 인코딩**) — 전부 공개 | `/life-map/{status,points,nearby,search}` + `/life-map/:layer/:id` |
| **`Housing` (신규, 2026-08-30)** | status, points(?bbox&zoom[&dealType&band]), nearby(?lat&lng[&radius≤3000&limit≤30&dealType&band]), search(?q[&limit≤20]), complex(id)(**인코딩**), trades(id)(**인코딩**, ?dealType&band&limit&offset&includeCanceled) — 전부 공개 | `/housing/{status,points,nearby,search}` + `/housing/complexes/:id[/trades]` |
| **`Tarot` (신규, 2026-09-03)** | 공개(옵셔널 인증): readings(POST, `X-Guest-Key`), shares(POST), shared(token)(GET) / 회원: myReadings(GET ?cursor&limit), myReading(id)(GET/DELETE) / **웹 경로 빌더(`API_PREFIX` 없음)**: sharePage(token), shareImage(token, 'og'\|'story') | `/tarot/readings` + `/tarot/shares[/:token]` + `/tarot/me/readings[/:id]` + `/tarot/s/:token[/image.png[?format=story]]` |
| **`Saju` (신규, 2026-09-06 — 경로는 `/saju-c`)** | 공개(옵셔널 인증): readings(POST), **job(jobId)(GET ?after&wait — long-poll, 410)**, daily/match/datePick/food(POST), shares(POST), shared(token)(GET) / 회원: profiles(GET/POST), profile(id)(PUT/DELETE), myReadings(GET), myReading(id)(GET/DELETE) / 웹: sharePage(token), shareImage(token, format) | `/saju-c/readings[/jobs/:jobId]` + `/saju-c/{daily,match,date-pick,food}` + `/saju-c/shares[/:token]` + `/saju-c/me/{profiles[/:id],readings[/:id]}` + `/saju-c/s/:token[/image.png]` |
| **`SajuG` (신규, 2026-09-06)** | chart, readings, pairChart, pairReading, myReadings, myReading(id), profiles, profile(id), shares, shared(token), **shareImage(token)(`API_PREFIX` 포함 — Tarot/Saju 와 비대칭)**, sharePage(token)(웹) | `/saju-g/{chart,readings}` + `/saju-g/pair/{chart,readings}` + `/saju-g/me/{readings[/:id],profiles[/:id]}` + `/saju-g/shares[/:token[/image.png]]` + `/saju-g/s/:token` |
| **`UsageQuota` (신규, 2026-09-03)** | overview(GET ?date), setting(feature)(PUT — params `feature: UsageQuotaFeature`) — 어드민 | `/admin/quotas[/:feature]` |
| `Health` | (단일 상수) | `/health` |

**이번 라운드 (2026-08-30~09-07) 변경 라우트:**

- **`Routes.Tarot.*` / `Routes.Saju.*` / `Routes.SajuG.*`** — 세 namespace 가 같은 3층 구조: 공개 표면(무인증 +
  옵셔널 인증 — 회원이면 자동 저장, `X-Guest-Key` 헤더로 게스트 한도), 회원 표면(`/me/...`), 공유(`shares` POST +
  `shared(token)` GET). **공유 웹 페이지·이미지 빌더(`sharePage`/`shareImage`)는 `API_PREFIX` 가 없는 origin
  루트 경로** — friendly 가 같은 경로에서 OG 를 주입하고(nginx `^~ /tarot/s/`·`^~ /saju-c/s/` 프록시, `ops/nginx/`)
  이미지는 satori 렌더(`?format=og|story`). 예외: `SajuG.shareImage` 는 `${API_PREFIX}/saju-g/shares/:token/image.png`
  (API 경로). 공개/회원이 한 namespace 에 섞이는 것은 Bus 즐겨찾기와 같은 path-prefix 분기(`/me/`).
- **`Routes.Saju` 경로 이관(`5f49026`, 2026-09-06)** — `${API_PREFIX}/saju/*` → **`${API_PREFIX}/saju-c/*`**,
  `sharePage`/`shareImage` 도 `/saju/s/...` → `/saju-c/s/...`. 다른 사주 구현(`Routes.SajuG`, `/saju-g/*`)과 나란히
  두기 위해. **namespace 식별자 `Saju`·모듈·DB·`UsageQuotaFeature 'saju-reading'`·purpose `'saju'` 는 그대로** —
  URL 과 표시 명칭("사주(C)")만 바뀜. friendly 는 `const S = Routes.Saju` 로 등록하므로 라우트 파일 수정 없이
  이관됐고 구 경로는 404(커밋 메시지의 실서버 확인).
- **`Routes.Saju.job(jobId)`** — 이 패키지 첫 long-poll 계약. `?after=<version>&wait=<ms≤25000>`, 새 섹션 또는
  타임아웃까지 서버가 대기. SSE(`runEvents`/`jobEvents`/`importRunEvents` 계열)와 달리 일반 GET 이라 `?token=` 이나
  EventSource 없이 `useQuery refetchInterval` 로 붙는다.
- **`Routes.Housing.*`** — 6키 전부 공개. `complex(id)`/`trades(id)` 는 빌더가 `encodeURIComponent`, friendly 는
  `decodeURIComponent(Routes.Housing.complex(':id'))` 로 등록(AirQuality/LifeMap 계약 그대로 — `housing.route.ts` 주석).
- **`Routes.UsageQuota.{overview, setting(feature)}`** — 어드민 `/admin/quotas`. `setting` 의 `:feature` 를 friendly 가
  `z.object({ feature: UsageQuotaFeature })` params 로 검증(미지 feature 400).
- **`Routes.Restaurant.publicMenuNutrition(placeId)`** — `/restaurants/public/:placeId/menu-nutrition`. 공개 상세와
  분리된 지연 엔드포인트(라우트는 restaurant 모듈, 판정은 food 모듈).
- **`Routes.Food.adminMenuLexicon`(GET ?kind / POST) / `adminMenuLexiconEntry(id)`(DELETE)** — `/admin/food/menu-lexicon[/:id]`.

**이전 라운드 (2026-08-21~30) 변경 라우트:**

- **`Routes.AirQuality.*`** — 공개 프록시 8키 + 인증 `location` 1키가 한 namespace. `sidoRealtime`/
  `stationHistory` 는 한글 경로라 빌더가 `encodeURIComponent` 를 책임지고, friendly 는
  `decodeURIComponent(Routes.AirQuality.sidoRealtime(':sidoName'))` 로 등록(subway `stationId` 계약의
  일반화). `location` 은 GET/PUT/DELETE 한 경로 verb 분기(schedule `config` 와 같은 함정 — verb 명시).
- **`Routes.Weather.*`** — 6키 전부 공개. `mid` 는 `?land&ta[&stn]` 세 오퍼레이션을 한 요청으로,
  `aws` 는 키 없으면 `enabled=false` 200.
- **`Routes.LifeMap.*`** — 5키 전부 공개, 업스트림 쿼터 없음(로컬 SQLite). `detail(layer, id)` 는
  두 인자 모두 인코딩(병의원 ykiho 가 base64 라 `/`·`+` 포함 가능).
- **`Routes.Food.*`** — 사용자 표면은 `search`·`restaurants(foodId)` 둘뿐(인증 + 레이트리밋), 나머지
  11키는 `/admin/food/...`. 적재 잡 5키(`importConfig/importRun/importRuns/importRunEvents/
  importPreview`)는 `RandomCrawl`/`Schedule` 과 같은 골격 — `importRunEvents` 만 SSE(`?token=`).
- **`Routes.Meal.*`** — 21키 **전부 로그인**(공개·공유 표면 없음 — settlement/vote 의 `/share/*` 짝이
  없다: [public-admin-route-split](../concepts/public-admin-route-split.md) 원칙이 양쪽 강제가 아님을
  보여주는 또 한 사례). 사진은 `photo(token)` GET 도 JWT 라 `<img src>` 직접 불가(shared 가 blob
  fetch). `data` 는 DELETE 전용, `photoRetention` GET(미리보기)/DELETE(실행), `dataBackup` GET /
  `dataRestore` POST. 인식(`recognize`)·추천(`recommendations*`)은 라우트 파일이 meal-recognition /
  meal-recommendation 모듈로 갈리지만 namespace 는 하나.
- **기존 파일** — `restaurant.ts`·`ai.ts`·`logs.ts` 는 스키마만 변경(라우트 무변경).

**이번 라운드 (19차, 2026-07-06) 변경 라우트:**

- **`Routes.Bus.*`** — 서울시 버스 namespace 신설. 검색/주변/도착/위치/노선 상세는 **비로그인
  공개**(`/bus/stations/...`, `/bus/routes/:id/{positions,detail}`), 즐겨찾기만 인증
  (`/bus/favorites`, `favoriteStation(stId)`/`favoriteRoute(stId, busRouteId)` 는 PUT/DELETE
  겸용, `favoritesSync` POST 멱등). 공개/인증이 한 namespace 안에 섞이지만 path prefix
  (`/bus/favorites`)로 Fastify 인증 게이트가 분기 — settlement 의 `/share` 분리와 같은 패턴.
- `crawl.ts`/`restaurant.ts` 는 스키마만 확장(menuGroups) — 라우트 변경 없음.

**이번 라운드 (18차, 2026-06-25) 변경 라우트:**

- **`Routes.ReviewSearch.*`** — 어드민 우선 RAG. `restaurants`/`enrich`/`ask`/`status`/
  `enrichBg`/`enrichPending`/`enrichEvents`(SSE) 는 `/admin/review-search/...`, 공개 QA
  `publicQaReady(placeId)`/`publicAsk(placeId)` 는 `/restaurants/:placeId/qa[/ready]` (인증 없음).
  공개/어드민이 같은 도메인을 placeId vs restaurantId 로 가르는 [public-admin-route-split](../concepts/public-admin-route-split.md) 패턴.
- **`Routes.ReviewClustering.*`** — `run`/`status`/`bg`/`pending` 어드민, `publicClusters(placeId)`
  공개 읽기 전용(`/restaurants/:placeId/clusters`).
- **`Routes.RandomCrawl.*`** — 자동 발굴 namespace. schedule 과 같은 5-키 패턴(config/run/runs/
  runEvents/preview) + `regions`/`regionDongs`(지역 드롭다운). 모두 `/admin/random-crawl/...`.
- **`Routes.Logs.*`** — 범용 작업 로그(어드민 전용). `runs`/`run(id)`/`runLogs(id)`(cursor)/
  `analyze(id)`(실패 run 재분석)/`config`(보존기간 GET·PUT 겸용).
- **`Routes.SettingsTelegram.{config, test, resolveChatId}`** — `config` 는 GET/PUT/DELETE 겸용.
- **`Routes.Crawl.tabling*`** — `tablingSearch`/`tablingShop(idx)`/`tablingShopReviews`/
  `tablingShopSave`/`tablingPlaceSave(objectId)`/`tablingRegistered`/`tablingDiscover`/
  `tablingBulkSaveJobs`/`Job(id)`/`JobEvents(id)`.
- **`Routes.Restaurant.regionStats`** — `/admin/restaurants/region-stats` (지역 통계 위젯).
  `reviewResummarize(reviewId)` 도 (직전 라운드부터) 유지.
- **`Routes.Ai.telemetry` / `telemetryStream`** — LLM 사용량 텔레메트리 스냅샷 + SSE 스트림.
- **`Routes.AutoDiscover.jobConfirm(id)`** — `awaiting_confirmation` 단계에서 등록(크롤) 시작.

**이전 라운드 (17차, 2026-06) 변경 라우트:**

- `Routes.Schedule.{config, run, runs, runEvents, preview}` — 주기 자동 실행 namespace
  신설. 모두 `/admin/schedule/...` 어드민 게이트. `config` 는 GET(현재 설정+다음 실행 시각) /
  PUT(enabled/cronExpr/timezone) 한 경로를 verb 로 분기. `run` = 즉시 manual 실행, `runs` =
  이력+inflight, `runEvents` = 진행 SSE, `preview` = 저장 전 cron 검증.
- `Routes.Restaurant.publicCategoryTree(placeId)` — `/restaurants/public/:placeId/category-tree`.
  공개 식당별 카테고리 트리(`RestaurantCategoryTreeResult`). 인사이트의 메뉴 카드 클릭 시
  `publicReviews(placeId)` 의 `tip`/`menu` 쿼리로 필터된 리뷰를 가져온다.

**이전 라운드 (2026-05-28) 변경 라우트:**

- `Routes.Settlement.update(id)` (PUT) — 이전 `updateParticipants(id)` (PATCH /:id/participants)
  자리를 대체. **부분 수정이 사라지고 전체 replace** 만 가능. 차수 추가/삭제·참여자
  명단·참석 변경까지 한 번에 보낸다. URL 은 `/settlements/:id` 로 `one(id)` 과 같고
  HTTP verb 로 구분 (GET=one, PUT=update, DELETE 는 별도 안 정의 — 라우트 핸들러가 직접
  처리하는 듯).
- `Routes.SettlementDraft.*` — 정산 임시저장 namespace 신설. `upsert` 는 PUT
  `/settlement-drafts` 로 body 에 placeId/payload — `(userId, placeId)` 키로 서버가
  upsert. `one(id)` 은 DELETE 용. **일반 사용자 흐름에선 명시적 DELETE 가 거의 없다** —
  완성된 정산 저장 성공 시 매칭 draft 가 `fromDraftId` 로 자동 삭제되므로.
- `Routes.Ai.providerModelsPreview(id, purpose)` — `/:id/:purpose/models/preview`. 저장
  없이 입력 폼의 키만으로 모델 목록 조회 — 신규 provider 등록 시 키 검증 + 모델 선택을
  한 번에 끝내려는 미리보기 엔드포인트.

**직전 라운드 (2026-05-25) 라우트군** (요약):

- `Routes.SettlementExtraction.*`, `Routes.Settlement.*` (당시 `updateParticipants` 포함),
  `Routes.SettlementContact.*`, `Routes.Ai.provider/testProvider/providerModels` 시그니처를
  `(id, purpose)` 두 인자로 변경.

## Data [coverage: high — 28 sources]

순수 contract 패키지로, 자체 데이터(persistence/cache) 는 없다 — 모든 모양은
스키마 정의로만 존재한다. Prisma 모델 매핑은 friendly 토픽 참조.

2026-08-30~09-07 compose 관계 (신규):

- **`SharedTarotReading = TarotReadingResult.omit({ readingId, quota }).extend({ token, includeQuestion })`** —
  공유 공개 응답이 회원 id·게스트 잔여 한도를 뺀 리딩 결과. settlement 의 `SharedSettlementSession` omit→extend 와
  같은 재조립. 사주(C)의 `SharedSajuReading` 은 omit 이 아니라 **새 object**(`token/includeBirth/chart/sections/
  source/model/createdAt` 만 골라 선언) — 같은 목적의 두 방식이 공존한다.
- **`SajuXxxSection = SectionBase.extend(...)` 4개 → `SajuSections`** — `status/source/model` 3필드 베이스를 확장한
  섹션 4개가 `SajuReadingResult.sections`·`SajuJobPollResult.sections`·`SharedSajuReading.sections` 에 그대로
  재사용 — long-poll 중간 상태(`pending`)와 최종·공유 상태가 한 shape. `SajuReadingSource.mixed` 가 "일부만 LLM"
  을 상위에서 요약.
- **`SajuDatePickDay = SajuDay.extend({ purposeScore, purposeStars })` → `SajuDatePickTop = …extend({ reason })`** —
  오늘의 운세 하루 shape 를 택일이 2단 확장(bus/air 의 `.extend({ dist })` 와 같은 승계).
- **`SajuFoodPick` ⊃ `TarotMenuPick` 필드 + `elements[]`** — 같은 메뉴 후보 모양(`menuId/name/cuisine/dishType/
  kcal/reason`)을 두 파일이 각자 선언(import 아님). `kcal` 은 음식 카탈로그 동명일 때만.
- **`SajuGPairResult = SajuGReadingResult.pick({ source, model, promptVersion, fallbackReason, remainingToday,
  createdAt }).extend({ chart: SajuGPairChart, report })`** — `.pick` 으로 메타만 승계(이 패키지에서 `.pick` 파생은
  드묾). `SajuGProfile = SajuGProfileInput.extend({ id, revision, … })`, `UpdateSajuGProfileInput = Input.extend({
  revision })` — 입력에서 응답·갱신 입력을 파생.
- **`UpdateUsageQuotaSettingInput = UsageQuotaSetting.omit({ feature, updatedAt }).partial()`** — 응답 shape 에서
  입력을 파생(schedule 의 응답/입력 별도 선언과 반대 방향). `UsageQuotaOverview = { date, items: { setting, usage }[] }`.
- **`saju.ts → tarot.ts`** — `SAJU_GUEST_KEY_HEADER = TAROT_GUEST_KEY_HEADER` 상수 1개만. `saju-g.ts` 는 같은 값을
  `SAJU_G_GUEST_KEY_HEADER` 로 자체 선언. 응답의 잔여 한도도 각자(`TarotQuota`/`SajuQuota` object vs 사주(G)
  `remainingToday` 평탄 필드).
- **`HousingFallbackDeal = HousingLatestDeal.extend({ dealType })`, `HousingNearbyItem = HousingComplexSummary.extend({
  dist })`** — `.extend` 승계. `housingAxisFields` 스프레드가 `HousingPointsQuery`/`HousingNearbyQuery`/
  `HousingTradesQuery` 에 `dealType/band`(default) 를 공급(life-map `lifeMapFilterFields` 와 같은 zod object 스프레드).
- **`HousingPoint`·`HousingComplexSummary` 의 3단 폴백 필드(`latest`/`fallback`/`official`)** — 같은 세 nullable
  필드를 점·요약 양쪽에 두어 배지 렌더 규칙이 하나. `HousingComplexDetail.stats` 는 유형별 `HousingBandStat[]`
  3배열(거래 있는 구간만).
- **`RestaurantMenuKcalItem.name` ↔ `RestaurantPublicDetail.menus[].name`** — 스키마 참조 없이 **문자열 동일성**으로
  클라이언트가 join(zod compose 아님 — 상세 응답에 필드를 더하지 않으려는 선택). `parts: RestaurantMenuKcalPart[]`
  는 `basis: 'components'` 일 때만, `portion` 은 `per_100g/per_100ml` 일 때만.
- **`FoodItem.kcalPer100g`** — `nutrition`(1인분)과 별개로 100g당 원본 단위를 보존, `servingG` 없어도 존재 가능 →
  `MenuKcalBasis.per_100g` 등급의 데이터 근거(`FoodSource.mfds-raw`/`curated` 가 그 공급원).

2026-08-21~30 compose 관계 (신규):

- **`AirNearbyStationItem = AirStationInfoItem.extend({ dist, measure: AirMeasureItem.nullable() })`** —
  측정소 정보(24h 캐시)에 요청 좌표 거리와 현재 측정값('전국' 실시간 캐시 조인)을 더한 확장. bus 의
  `BusNearbyItem = BusStationItem.extend({ dist })` 와 같은 `.extend` 승계 — 좌표 nullable 계약도 승계.
- **`AirLocationItem = AirLocationUpsertBody.extend({ updatedAt })`, `AirLocationResult = { location:
  nullable }`** — 입력 본문이 곧 저장 스냅샷 + 서버 시각. GET/PUT/DELETE 가 같은 응답(변경 후 상태 —
  캐시 통째 교체 계약, bus 즐겨찾기와 동형).
- **`WeatherNowcastResult` 가 두 오퍼레이션을 한 응답에** — 실황(`ncstBase`/`now`)과 초단기예보
  (`ultraBase`/`hours`)는 발표 시각이 달라 base 를 각각 싣고 폴백 플래그도 각각(`ncstFallback`/
  `ultraFallback`). `WeatherMidResult` 도 육상(`land`)+기온(`ta`)+전망(`outlook`) 3 오퍼레이션 합본(각
  nullable — `stn` 생략 시 전망 제외). `WeatherPrecip` 이 `WeatherUltraHour.rn1`/`WeatherForecastHour.pcp·sno`
  에 재사용돼 범주 문자열 정규화를 한 shape 로.
- **`LifeMapItem` / `LifeMapNearbyItem` = `z.discriminatedUnion('layer', [Cctv, Toilet, Hospital])`** —
  레이어별 상세가 다른 shape 인데 한 라우트(`/life-map/:layer/:id`)로 내려가므로 `layer` 판별자 union.
  Nearby 는 각 Item 에 `.extend({ dist })` 한 뒤 다시 union. points/nearby 쿼리는
  `...lifeMapFilterFields` 스프레드로 같은 필터 집합을 공유(zod object 스프레드 compose).
- **식단 3파일 체인 `meal → food → allergen`** — `FoodItem.allergens: MealAllergen[]` +
  `allergenStatus: FoodAllergenStatus`, `MealPreference.allergens: MealAllergen[]`(같은 enum 이라 추천
  필터에 문자열 변환 없음), `RecognizedDish`/`MealItem`/`MealItemInput`/`RecentMealItemResult`/
  `MealRecommendationItem` 의 `dishType/mainIngredient/cuisine` 이 food 의 분류 enum 스냅샷.
- **`RecognizedDish`(.strict) 가 인식 응답(`RecognizeMealResult.dishes`)과 확정 기록의 `recognition`
  스냅샷 양쪽에 같은 계약** — 응답형 `MealRecognitionSnapshot`(model/version nullable — 구버전 DB 호환) vs
  내부 `CreateMealRecognitionSnapshot`(POST — 둘 다 필수). `recognitionDishId` 로 확정 `MealItem` 과
  어드민 품질 집계(`FoodRecognitionQualityResult`)를 이름/순서 추정 없이 연결 — food 가 meal 의 계보를
  집계하지만 스키마 의존은 meal → food 한 방향(집계 쿼리는 friendly 가 담당).
- **`UpdateMealEntryInput = CreateMealEntryInput.partial().omit({ recognition, source,
  originRecommendationId })`** — 생성 출처·추천 원본 연결은 수정으로 못 바꾼다. items/photoTokens 는
  보내면 전량 교체(정산 PUT 전체 replace 와 같은 의미론을 PATCH 부분 필드 단위로).
- **내보내기/백업의 omit/extend 체인** — `MealDataExportPhoto/Entry/Recommendation = MealPhoto/Entry/
  Recommendation.extend(...)`, `MealDataBackupItem = MealItem.omit({ id })…`, `MealDataBackupEntry =
  MealEntry.omit({...})`, `MealDataBackupRecommendation = MealDataExportRecommendation.omit({...})` —
  내보내기(메타데이터만, `photoBinariesIncluded: literal(false)`)와 백업(base64 사진 포함, `.strict()` +
  상한 상수)을 같은 기록 스키마에서 파생. `notice` 의 `encoding`/`duplicatePolicy`/`mergePolicy` 가
  `z.literal` 이라 정책 문자열 자체가 계약(소비자가 분기 가능).
- **`FoodImport*` 가 `RandomCrawl*`/`Schedule*` 의 5-키 골격을 재현** — Config(응답)/ConfigInput/
  RunInput/Run(live·이력 공용, `phase`/`progress` nullable)/RunList(`inflightRunId`)/PreviewInput/
  PreviewResult/ProgressEvent/DoneEvent. 차이는 `sources[]`·`apiConfigured`(읽기 전용 키 유무 3종)·
  소스별 `stats[]`(fetched/inserted/updated/skipped/error). 세 번째 반복이라 공통 팩토리 후보
  (`bulk-job.ts` 의 `makeBulkJobSchemas` 처럼)지만 아직 각자 선언.
- **`FoodRestaurantsResult.notice: z.literal(FOOD_RESTAURANT_DATA_NOTICE)`** — "수집된 메뉴·리뷰에서
  확인된 연결이며 현재 판매 여부를 보장하지 않습니다" 문구가 리터럴 계약 — UI 가 고쳐 쓸 수 없고 서버가
  바꾸면 컴파일이 깨진다(면책 문구를 데이터로).

19차(2026-07-06) compose 관계 (신규):

- **`BusFavoriteStationItem = BusStationItem`** — 정류장 즐겨찾기 항목이 정류장 검색 항목과
  동일 shape (별칭). PUT body `BusFavoriteStationUpsertBody = BusStationItem.omit({ stId })`,
  즉 즐겨찾기 스냅샷은 검색 결과를 그대로 저장·복원한다. zod schema 재사용(별칭+omit)으로
  두 도메인의 정류장 계약을 한 소스에 고정.
- **`BusNearbyItem = BusStationItem.extend({ dist })`** — 주변 정류장이 검색 정류장에 거리만
  더한 확장. `.extend` 재사용으로 좌표 WGS84 범위 계약이 자동 승계.
- **`BusRouteDetailResult` 3콜 합본** — `{ info: BusRouteInfo, path: BusRoutePathPoint[],
  stations: BusRouteStationItem[] }`. 서울시 `getRoutePath`/`getStaionByRoute`/`getRouteInfo`
  세 응답을 하나의 캐시 가능한 객체로 compose (노선당 최초 1회만 업스트림 3콜).
- **`menuGroups` 가 crawl → restaurant 로 흐르는 재사용** — `crawl.ts` 의 `MenuGroup`
  (`MenuGroupItem = MenuItem.extend`) 을 `NaverPlaceData.menuGroups?` 와
  `RestaurantPublicDetail.menuGroups?` 가 공유. 평탄화 `menus` 와 병존하는 additive optional
  이라 기존 소비자 무해 — 그룹 UI 를 지원하는 클라이언트만 소비.

18차(2026-06-25) compose 관계 (신규):

- **`SettlementRound.groupSplits = SettlementItemGroup[] \| null`** — 한 차수의 카테고리 풀에서
  특정 항목을 떼어 멤버끼리 나누는 그룹. `SettlementItemGroup` 이 `SettlementGroupMember[]` 를
  품고, 멤버는 `participantId`(마스터)/`participantClientId`(입력) + `glasses`. calculator 의
  `toGroupCalcInputs` 가 저장된 응답형(participantId)을 인덱스 기반 `GroupCalcInput` 으로 변환.
- **`LlmTelemetrySnapshot` 이 다층 집계 compose** — `totals`/`byPurpose[]`/`byModel[]` 가 모두
  `LlmTelemetryAgg` 를 `.extend` 하고, `windows` 는 `LlmTelemetryWindow`(=Agg + avg/maxDurationMs),
  `gates` 는 `LlmGateSnapshot` 을 account/purposes 두 축으로 묶는다. zod `.extend` 재사용 체인.
- **`LogAnalysisErrorCode` = `AiErrorCode.options` 스프레드 + 분석 사유** — enum 합성(decision 참조).
  `OperationRunDetail = { run: OperationRunSchema, report: OperationReportSchema \| null }` 로
  run + 분석 보고서를 한 응답에 묶는다.
- **`RestaurantPublicDetail` 에 `sources.tabling`/`tabling`(addon)/`storedReviewCount` 추가** —
  공개 상세가 네이버·DC·테이블링 3 출처 머지 결과 + 출처별 분리값(`PublicSources`) + 우리가
  적재한 정확한 리뷰 수(`PublicStoredReviewCount`)를 한 객체에 담는다.

이전 라운드(17차 N차 정산) compose 관계 (여전히 유효):

- **`SettlementSession` (재구성)** = `{ id, userId, restaurantPlaceId(=1차 snapshot),
  restaurantName, grandTotal, rounds: SettlementRound[].min(1), participants:
  SettlementParticipant[], createdAt, updatedAt, editedAt }`. 항목/참석은 모두 round 안으로
  이동, 세션 직속 `itemsSubtotal/items/attendees` 는 사라졌다. 목록 검색·이력 호환을 위해
  1차 식당(rounds[0]) snapshot 은 세션 직속에도 둔다 — `restaurantPlaceId`/`restaurantName`.
- **`SettlementRound`** = `{ id, orderIndex, restaurantPlaceId, restaurantName, source,
  totalAmount, warning, receiptPreviewUrl, receiptImageToken(string\|null), itemsSubtotal,
  discountAmount(int>0\|null), discountCategory(ReceiptItemCategory\|null), categoryAdjustments,
  items[], attendees[] }`.
  차수마다 식당이 다를 수 있어 `restaurantPlaceId`/`restaurantName` 이 round 에도 있다.
  **`receiptImageToken` (17차 신규)** — 편집 재진입 시 토큰을 그대로 돌려줘 재저장에도
  영수증이 보존되게 한다. 소유자 응답 한정. (18차에 `groupSplits` 도 round 에 추가됨.)
- **`SettlementRoundAttendee`** = `{ participantId, attended, excludeAlcoholOverride,
  excludeNonAlcoholOverride, excludeSideOverride, shareAmount }`. override 가 `null` 이면
  마스터 default 사용 — `effectiveExcludes(master, override)` helper 가 계산.
- **`SettlementCategoryAdjustments`** = `Record<카테고리, { leftoverParticipantIds: string[],
  roundUnit: int>0 \| null } \| null>` 의 `.nullable()`. **18차에 leftover 가 단일 id → 배열**
  ('나눠 받기'). roundUnit=100/1000 이 일반 — UI 가 '100원/1000원 단위 다듬기' 토글로 노출.
- **`SettlementParticipantInput.clientId`** — required string. 클라가 안정적 임시 ID 부여,
  서버가 cuid 매핑 후 폐기. round.attendees.participantClientId 와의 indirection.
- **`SharedSettlementSession`** = `SettlementSession.omit({ userId, rounds }).extend({
  rounds: SharedSettlementRound[] })` 여기서 `SharedSettlementRound =
  SettlementRound.omit({ receiptPreviewUrl, receiptImageToken })`. omit→extend 패턴으로
  nested 필드까지 공개 응답에서 제거. **17차에 nested omit 가 1→2 필드** (신규
  `receiptImageToken` 도 토큰 보유자에게 leak 되면 영수증 재조회 가능하므로 같이 제거).
- **`SettlementShare` (응답, 확장)** = `{ token(nullable), shareUrl(nullable),
  expiresAt(nullable), ogImage: ShareOgImage, ogImageUrl(string\|null), ogImageCandidates:
  string[] }`. `ogImageCandidates` 는 식당 사진(네이버 호스트) 후보 원본 URL 배열 — 다이얼로그가
  썸네일 갤러리로 렌더하고, 사진이 없으면 빈 배열로 갤러리를 숨겨 정산표 폴백으로 떨어진다.
- **`CreateSettlementShareInput`** = `z.preprocess` 로 본문 null→`{}` 후 `{ ttl: ShareTtl(def
  '7d'), ogImage?: ShareOgImage, ogImageUrl?: string.url().nullable() }`. `ogImageUrl` 은
  트라이스테이트(생략/null/URL) — 옵셔널과 nullable 의 차이가 의미를 갖는 드문 케이스.
- **`SettlementDraft`** = `{ id, placeId(nullable), placeNameHint(nullable), payload(unknown),
  createdAt, updatedAt }`. `payload` 가 `z.unknown()` — 형태 검증 없이 통과, 직렬화 길이
  200KB cap. `(userId, placeId)` unique.
- **`ExtractReceiptInput` (확장)** = `{ imageToken, placeId, roundIndex?, roundTotal?, split?:
  ExtractReceiptSplit }`. **`ExtractReceiptSplit` = `{ count: 2..5, index: 1..count }`**.
  같은 imageToken 으로 N 번 호출 — 한 사진에 N 영수증을 가로로 잘라 차수 매핑.
- **`MultiRoundCalcInput` → `MultiRoundCalcOutput`** — 차수별 `RoundCalcInput` 배열을 받아
  마스터 인덱스 단위 `perParticipant[]` + 차수별 `perRound[]` 반환. 각 차수는 자체
  `discount`/`categoryAdjustments` 를 갖고, calculator 내부에서 마스터→참석자 인덱스
  변환·역변환을 수행.

17차(2026-06) compose 관계:

- **`ScheduleRun` 이 live·이력 공용 shape** — 같은 object 가 메모리 진행 스냅샷(SSE 가 push
  하는 동안)과 SQLite 영속 이력 행 양쪽에 쓰인다. `phase`/`totalTargets` 는 진행 중에만
  의미가 있어 완료 이력 행에서는 nullable. `ScheduleRunList = { items: ScheduleRun[],
  inflightRunId }` 가 이력 + "지금 SSE 붙을 run" 을 한 응답에 묶는다.
- **`ScheduleProgressEvent`/`ScheduleDoneEvent`** = `type` literal 로 구분되는 SSE 페이로드.
  progress 는 `phase/processed/total/skipped/currentName`, done 은 `status/finishedAt`. live
  진행은 SSE 로, 최종 상태는 `ScheduleRun` 으로 다시 조회 — 두 채널이 같은 `runId` 로 묶인다.
- **`ScheduleConfig` (응답) vs `ScheduleConfigInput` (입력)** — 응답엔 `lastRunAt/lastStatus/
  nextRunAt/updatedAt` 같은 서버 계산 필드(croner.nextRun 포함)가 있고 입력엔 없다. 입력은
  `enabled/cronExpr/timezone` 3 필드만. settlement 의 응답/입력 분리와 같은 패턴.
- **`RestaurantCategoryTreeResult` = `{ roots: CategoryTreeNode[] }`** — analytics 의 재귀
  `CategoryTreeNode` (z.lazy) 를 그대로 import 해 식당별 멘션 트리로 재사용. 어드민 전역
  트리와 노드 모양이 동일하므로 UI 컴포넌트도 공유 가능.

(이전 라운드의 NaverSearchResult / RestaurantPublicDetail / ReviewAnalysis 분리 / CanonicalSummary /
GlobalMenuStat / CategoryTreeNode / LlmProviderConfig / SettlementSession(N차) / SettlementShare 등의
compose 관계는 그대로 유효.)

## Key Decisions [coverage: high — 30 sources]

- **Zod 채택** — 런타임 검증 + 정적 타입 추론을 한 스키마로 처리하고, fastify-type-provider-zod
  와 한 번에 결합돼 OpenAPI 까지 자동 생성. **TS interface 직접 사용 금지** — 모든
  공유 타입은 zod 스키마에서 추론.
- **빌드 없는 src 직접 export** — `package.json` `exports` 가 `./src/*.ts` 를 가리킨다.
- **도메인별 파일 분할 + 한 방향 import** — `restaurant → crawl/canonical/analytics` 처럼
  한쪽만 (17차 restaurant → analytics `CategoryTreeNode`, 18차 restaurant → crawl 테이블링
  타입). 정산 패밀리 내부도 `settlement → settlement-extraction (enum 만)`, `calculator →
  settlement 타입`, `drink-kinds → settlement-extraction (type-only)` 등 한 방향.
  **신규 5개 중 `review-search`/`review-clustering`/`telegram-settings`/`random-crawl` 는 자기완결**
  (다른 schemas/ 미import). **예외는 `logs.ts` — `ai.ts` 의 `AiErrorCode.options` 와 `common.ts`
  의 페이지네이션을 import** (아래 결정 참조). `settlement-draft`/`schedule` 도 여전히 자기완결.
  **2026-09-07 신규 7개 중 6개 자기완결, `saju → tarot` 은 헤더 상수 1개만.**
- **2026-09-06 (`5f49026`): 같은 기능의 두 구현을 URL·명칭으로 분리, 식별자는 유지** — 사주(C)의 모든 경로를
  `/saju/*` → `/saju-c/*` 로 옮기고 사주(G)는 `/saju-g/*`. `Routes.Saju`(namespace 이름)·`modules/saju`·DB·
  `UsageQuotaFeature 'saju-reading'`·purpose `'saju'` 는 그대로 — 바꾸면 마이그레이션·한도 카운터·어드민 설정이
  갈리는데 URL 만 바꾸면 소비자 컴파일 영향이 0(빌더 문자열만 변경). friendly 가 `const S = Routes.Saju` 로 등록해
  라우트 파일 수정 없이 이관. trade-off: namespace 이름과 경로가 어긋나는 상태를 문서로 안고 간다(Gotchas).
  PLAN-saju 2026-09-06 진행 기록·위치 표("라우트 `/saju-c`, 명칭 사주(C)")가 근거.
- **2026-09-06 (`e40b4c0`): 사주(G) 공유 토큰 10자 단축 + 구 32자 호환, 취소는 `revokeToken`** — `SajuGShareToken`
  regex `10 | 32`. 발급은 10자, 이전 발급분도 조회·취소 가능. 정산 `ShareTtl` 처럼 TTL 로 brute-force 창을 닫는 대신
  발급 시 받은 `revokeToken`(20~64) 으로 취소 경로를 둔다. `PublicSajuGShare` 는 원본 날짜·명식·질문·AI 자유문장을
  싣지 않는 "상징만" 공유 — 타로·사주(C)가 해석 본문을 통째로 공유하는 것과 대비.
- **2026-09-06 (`f8e5dd0`): 긴 풀이는 섹션 병렬 LLM + long-poll, SSE 는 v2** — `SajuReadingResult` 가 정적 본문 +
  `jobId` 를 즉시 돌려주고 `SajuJobPollQuery.after`(받은 version)/`wait`(≤25s) 로 도착 순 리빌. 이 패키지의 SSE
  계약(`*ProgressEvent`/`*DoneEvent` + `?token=`)을 쓰지 않은 것은 PLAN-saju 결정 4("섹션 병렬 호출 + 도착 순
  리빌, SSE 는 v2") — 무인증 공개 표면이라 EventSource 토큰 처리 없이 일반 GET 으로 시작. `SajuReadingSource.mixed`
  (일부 섹션만 LLM)·`SajuSectionStatus.pending` 이 부분 실패를 shape 로 표현. job 은 메모리 레지스트리라 서버
  재시작 시 410 — 클라이언트는 정적 본문 유지 + "AI 풀이 다시 시도".
- **2026-09-06 (`f8e5dd0`): 원국은 서버가 재계산, 클라이언트 원국은 불신** — `CreateSajuReadingInput = { birth }`
  뿐이고 `SajuChart` 는 응답 전용. 클라이언트도 같은 utils 로 원국을 먼저 그리지만(3D 무대) 프롬프트·저장은 서버
  계산분(파일 머리 주석). 생년월일시가 개인정보라 공유는 `includeBirth` 기본 false 이고, `SharedSajuReading.chart`
  가 `SajuChart` 전체(`input` 에코 포함)라 숨김은 서버 `maskBirth`(월·일 0, 시·분 null — 연도·원국·띠는 보임) 책임.
- **2026-09-03 (`98df15a`): 공유 본문은 언제나 서버가 만든다 — 게스트는 입력 재전송** — `CreateTarotShareInput` 이
  `readingId`(회원) 또는 `reading`(게스트 입력) 둘 중 하나를 refine 으로 요구. 게스트가 임의 문장을 보내 우리
  도메인 아래 게시하는 통로를 막기 위해 게스트 공유는 리딩 **입력**만 받고 서버가 캐시/LLM/정적으로 본문을 다시
  확보해 저장. 사주(C)(`CreateSajuShareInput`: `readingId | birth`)·사주(G)(`CreateSajuGShareInput`: `receipt |
  readingId | birth | pair` 정확히 하나)가 같은 원칙. 질문/생년월일은 사적이라 `includeQuestion`/`includeBirth` 기본
  false. 공유 페이지 경로(`sharePage`)는 `API_PREFIX` 없는 origin 루트 — 링크 미리보기 크롤러가 API 경로가 아닌 웹
  URL 을 받고 friendly 가 그 경로에서 OG 를 주입(nginx `^~` 블록 필수).
- **2026-09-02~03 (`cd5a29b`): 익명 한도를 공용 계약(`usage-quota.ts`)으로, 회원은 게스트·IP 일일 한도 면제** —
  사용자 결정(2026-09-02, PLAN-tarot 결정 5·6: "로그인 없이 무료, 익명 한도는 다른 기능도 쓸 수 있는 공통 서비스,
  회원은 기기·IP 일일 한도 없음, 한도 값은 어드민 설정"). `UsageQuotaFeature` enum 이 소비 기능을 열거(`tarot-reading`
  → `saju-reading`(`f8e5dd0`) → `saju-g-reading`(`e40b4c0`)), 한도 5축(`guestPerDay/ipPerDay/ipPerMinute/globalPerDay/
  guestCutoffPct`)은 어드민이 조정하고 행이 없으면 코드 기본값. **0 = 무제한**(ipPerMinute 만 min 1 — 폭주 방어는 끌
  수 없음). 게스트 식별은 `X-Guest-Key`(기기 영속 UUID, 클라 선언값 — 완벽한 식별이 아님을 수용, `TAROT_GUEST_KEY_HEADER`
  상수). 응답의 `quota.remainingToday` 는 게스트만 숫자, 회원 null — UI 가 "오늘 N회 남음" 을 게스트에게만.
- **2026-09-02 (`cd5a29b`): 타로·사주 enum 은 utils 데이터와 동일 값·순서, 검증은 friendly 테스트** — api-contract 가
  `@repo/utils` 를 import 하지 않는 규칙(순수 스키마·의존 방향)을 지키면서 `TarotSpreadId`/`TarotTopic`/`SajuTenGod`/
  `SajuStarId` 가 utils 상수(`TAROT_SPREAD_IDS`/`TAROT_TOPICS`/`SAJU_TEN_GODS`/`SAJU_STAR_META`)와 어긋나지 않게
  `tarot.test`/`saju.test` 가 `.options` 동일성을 검증 — food 분류 enum ↔ `foodTaxonomy` 와 같은 계약. `TarotCardId`
  는 regex 로 utils id 규칙(`major-00~21`/`suit-01~10|court`)을 복제.
- **2026-09-02 (`cd5a29b`): 뽑기는 클라이언트, 서버는 검증만** — `CreateTarotReadingInput.cards` 가 고른 카드·자리
  순서를 그대로 받는다. 결과에 이해관계가 없는 오락 기능이라 서버 난수가 필요 없고, 부채꼴에서 직접 고르는 경험이
  목적. 서버는 id·중복·자리 수만 검증(utils `validateDrawnCards`). 메뉴 타로(`5d0c4c7`)는 반대로 **후보 선정을
  서버가 결정적으로**(`TarotMenuPick` 의 menuId/name/cuisine/dishType/kcal 은 서버 데이터) 하고 LLM 은 `reason` 만 —
  데이터 사실(메뉴 존재·칼로리)을 LLM 이 지어내지 않게. 사주(C) `SajuFoodPick` 도 같은 분업.
- **2026-09-02~03 (`ac0e191`·`fb12027`): 메뉴 칼로리는 상세 응답이 아닌 지연 엔드포인트, 애매하면 생략** —
  `RestaurantPublicDetail` 에 필드를 더하지 않고 `Routes.Restaurant.publicMenuNutrition` 이 `RestaurantMenuNutrition`
  을 따로 내려준다(상세가 이미 무겁고, 판정이 LLM 백그라운드로 늦게 도착할 수 있어 `llmPending` 재조회 계약). join
  키는 메뉴명 **문자열 동일성** — 상세에 id 를 추가하지 않으려는 선택. "틀린 칼로리는 없는 것보다 나쁘다" 가 `items`
  생략 정책이며 `basis`(`per_serving/per_100g/per_100ml/components`)가 신뢰 등급을 그대로 노출. 어휘(`menu-lexicon.ts`)는
  값이 아니라 매칭 규칙만 어드민 편집 — `MENU_LEXICON_KINDS_WITH_TARGET` 로 target 필수 종류를 상수화.
- **2026-08-30 (`254fb76`): 집값은 life-map 골격 재현 + 축 스프레드, 가격은 만원 정수** — `bbox+zoom → mode:
  points|cells` + `truncated/minPointZoom/total` 을 그대로 두고 `housingAxisFields`(`dealType`·`band` default) 를 점·
  주변·거래 쿼리에 스프레드. 배지는 `latest → fallback → official` 3단 nullable 폴백을 스키마 주석으로 계약(선택 축
  거래 없음 ≠ 데이터 없음 — 임대단지는 `saleType` 로 정상 무거래 표시). 좌표는 nullable(지오코딩 미완 단지)이라
  검색 결과 → 지도 이동은 null 가드. 업스트림 실시간 호출이 없어 `stale` 없음(life-map 과 같은 부류). `complex/trades`
  인자는 빌더 인코딩 + friendly decode 등록(AirQuality/LifeMap 계약 승계).
- **2026-09-02~06: `LlmProviderPurpose` 8종 — 공개 기능은 전용 키(own)로 계정 한도 분리** — `tarot`/`saju`/`saju-g`
  추가. 무인증 공개 LLM 기능이라 전용 키를 두면 계정 한도가 chat 과 분리된다(ai.ts 주석). 사주(C)/(G)가 purpose 를
  따로 가지므로 모델·키 설정도 각각. `FoodSource` 도 CLI 전용 2종(`mfds-raw` 원재료 표준데이터·`curated` 코드 내장
  큐레이션)이 늘어 8종 — `FoodImportSource`(어드민 잡)는 4종 그대로.
- **2026-08-21~30: 공공 API 3도메인은 `fetchedAt + stale` 을 응답 계약으로** — bus 의 `source:
  'cache'|'api'|'stale'` 3값 대신 boolean `stale` + 수집 시각 ISO. 업스트림 실패 시 last-known 을 200 으로
  서빙하는 가용성 우선 정책을 스키마가 명시 — 클라이언트는 `stale` 배지만 붙이면 된다. weather 는
  `base`(발표 기준)·`fallback`(한 슬롯 이전 발표분) 을 더해 "어느 발표분인지" 까지 계약. life-map 은
  업스트림이 없어 `stale` 없음(`fetchedAt` = 적재 시각) — 같은 공개 지도라도 데이터 출처에 따라 공통 필드가
  갈린다. ([external-api-proxy-fixture](../concepts/external-api-proxy-fixture.md) 의 계약 면 — 픽스처는
  friendly 쪽.)
- **2026-08-21: 좌표 입력·출력은 버스 WGS84 범위 계약을 그대로, 단 "사용자 현재 위치" 는 세계 범위** —
  `AirNearbyQuery`/`AirLocationUpsertBody`/`WeatherAwsQuery`/`LifeMapNearbyQuery` 가 lat 33~39 / lng
  124~132, `AirStationInfoItem.lat/lng` 는 nullable(측정소 좌표 결측). 예외: `FoodRestaurantsQuery`·
  `CreateMealRecommendationInput` 은 -90~90 / -180~180 — 해외에서 앱을 열어도 검색·추천이 400 으로 막히면
  안 되므로 한국 범위 강제는 "한국 데이터의 좌표" 에만 적용한다는 경계.
- **2026-08-21: 쿼리 불리언은 `enum(['1','0','true','false']).transform`** — bus 의 `z.union([boolean,
  'true'|'false'])` 교훈을 life-map(`LifeMapFlagParam`)·food(`boolParam`)·meal(`withPhotos`) 이 같은 모양으로
  반복. `z.coerce.boolean()` 금지 관례가 3도메인에서 굳었다(각자 선언 — 공유 헬퍼 추출은 안 함).
- **2026-08-21: 한글 경로 인자는 빌더가 인코딩, 서버는 decode 해 등록** — `AirQuality.sidoRealtime('전남광주')`,
  `stationHistory('강남구')`, `LifeMap.detail(layer, ykiho)` 가 `encodeURIComponent` 를 책임지고 friendly 는
  `decodeURIComponent(Routes.X(':p'))` 로 등록 — subway `stationId`(`${lineId}:${name}`) 계약의 일반화.
  fetch 래퍼가 다시 인코딩하면 `%25` 이중 인코딩(Gotchas).
- **2026-08-21: 검색어는 transform(NFC) → refine(길이), 선택 기능 부재는 `enabled=false` 200** —
  `AirStationSearchQuery.q`(1~30)·`LifeMapSearchQuery.q`(공백 접기 + 2~60) 가 bus 검색과 같은 순서.
  `LifeMapSearchResult.enabled`/`WeatherAwsResult.enabled` 는 "서버에 키가 없어 기능을 제공하지 않음" 을
  에러가 아니라 계약 필드로 — 선택 기능은 클라이언트가 섹션을 숨긴다(503 은 필수 기능의 키 부재).
- **2026-08-22: 식단 스냅샷은 `.strict()`** — `RecognizedDish`/`MealRecognitionSnapshot`/
  `RecognizeMealResult`/`MealRecommendationEventInput`/`MealDataBackup`/`DeleteMealDataInput`/
  `DeleteMealPhotosInput` 이 `.strict()`. 인식 JSON 을 DB(`MealEntry.recognitionJson`)에 그대로 보존하므로
  임의 필드가 저장되지 않게 하위 객체까지 차단. 패키지 내 `.strict()` 대량 채택은 meal 이 처음 —
  다른 도메인은 여전히 zod 기본(unknown key strip).
- **2026-08-22: 카탈로그·식당은 FK 없이 스냅샷** — `MealItem.foodId`/`MealEntry.placeId` 는 문자열
  스냅샷 + 분류 3축·영양 복사. 카탈로그는 재적재로 갈리고 식당은 재크롤/삭제되므로(RestaurantFavorite 와
  같은 원칙) 스키마도 참조가 아니라 값. 그래서 `meal → food` import 는 enum 3종뿐이고 `FoodItem` 자체는
  기록에 등장하지 않는다.
- **2026-08-22: 목록 페이지네이션은 opaque 커서** — `ListMealEntriesQuery.cursor`(≤512) 는 eatenAt+id 를
  담은 불투명 토큰, 클라이언트는 `nextCursor` 를 그대로 돌려준다(offset 인 food admin/settlement 와 대비 —
  누적 기록이 커지고 검색 `q` 가 페이지네이션 전에 적용돼야 해서). logs 의 cursor 와 같은 계열.
- **2026-08-22: `LlmProviderPurpose` 5종 — image 와 meal-photo 분리** — 같은 vision 이라도 영수증(image)과
  식단 사진(meal-photo)은 모델·게이트·비용 정책이 달라 별 purpose. `logs.ts` `OperationFeature` 도
  food-import/meal-recognition/meal-recommendation 3종 추가(12종) — 새 기능은 여기만. friendly 가
  `LlmProviderPurpose.options` 를 그대로 `ALL_PURPOSES` 로 써서 enum 순서 = 어드민 카드 순서.
- **2026-08-23: 파괴적 개인 데이터 작업은 확인 문자열 리터럴** — `DeleteMealDataInput.confirmation:
  z.literal('DELETE_ALL_MY_MEAL_DATA')`, `DeleteMealPhotosInput.confirmation:
  literal('DELETE_OLD_MEAL_PHOTOS')` — 화면은 사용자가 문자열을 직접 입력한 뒤에만 호출하고, 서버·클라이언트가
  같은 상수를 import 해 오타로 우회 불가. 확인 버튼 한 번으로 개인 기록 전부를 지우지 않게.
- **2026-08-23: 백업은 ZIP 이 아니라 JSON+base64 + 상한 상수** — 경로 순회·압축 폭탄 표면을 만들지 않고
  앱/서버가 같은 Zod 로 검증. `MEAL_DATA_BACKUP_MAX_*`(사진 100장 · 장당 5MB · 합 50MB · JSON 75MB ·
  기록 5,000 · 추천 1,000 · 추천당 이벤트 200)를 응답 생성과 요청 파싱 전에 모두 적용. `archiveId` uuid 로
  같은 백업 재복원 멱등(`RestoreMealDataResult.duplicate`), `format`/`version` 리터럴로 소비자 분기.
- **2026-08-23: 추천 반응은 불변 이벤트 원장 + projection** — `MealRecommendationFeedback`(최신 상태,
  빠른 표시)과 `MealRecommendationEvent`(kind 7종, 순서·후보별 학습 신호의 출처)를 분리.
  `MealRecommendationEventInput.superRefine` 이 candidate 계열 kind 엔 `candidateName` 을 강제 —
  이벤트를 학습 데이터로 쓰려면 후보 식별이 빠지면 안 된다.
- **2026-08-17: 어드민 검색 `q` 는 서버 토큰 AND, 응답 shape 불변** — `RestaurantListQuery.q`(trim 1~120)
  만 추가하고 `RestaurantListResult` 는 그대로 — 검색이 canonical 통합 행 단위라는 것을 스키마 주석이
  명시. `reviewsFirstPage` 정렬 계약은 "실제 방문일 desc(해석 불가 시 fetchedAt desc)" 로 정정 — 스키마
  변경 없이 주석(계약 문서)만 바뀐 케이스라 소비자 컴파일 영향 0, 의미 영향은 정렬 기대.
- **19차(2026-07-06): WGS84 좌표계 정규화를 zod 숫자 범위로 계약화** — `bus.ts`/`bus-favorite.ts`
  의 모든 좌표 필드가 `z.number().min(33).max(39)`(lat) / `z.number().min(124).max(132)`(lng)
  한국 범위를 강제한다. 서울시 API 는 서비스에 따라 GRS80 TM(posX/posY)과 WGS84(gpsX/gpsY)를
  섞어 주는데, 서버가 항상 WGS84 로 정규화한다는 계약을 **스키마가 코드로 못박아** — 변환을
  빠뜨려 TM 값이 새면 응답 직렬화 자체가 실패한다(런타임에서 조용히 잘못된 지도 점을 찍는
  대신 빠르게 깨진다). 검색/주변/위치/노선 형상/즐겨찾기 스냅샷까지 같은 범위 계약을 공유하고,
  `BusNearbyItem`/`BusFavoriteStationItem` 이 `BusStationItem` 을 `.extend`/별칭해 자동 승계.
- **19차: 버스 검색어 `transform(NFC) → refine(길이)` 순서** — `BusStationSearchQuery.q` 가
  `.min(2)` 를 먼저 걸지 않고 `.transform(v => v.normalize('NFC'))` 후 `.refine(2~50)` 로 검사.
  이유는 NFD 로 분해된 한 글자('가' = 코드유닛 2)가 `min(2)` 를 통과해 1글자로 업스트림에
  닿는 것을 막기 위함 — 정규화를 먼저 해야 길이 검증이 사용자 지각과 일치한다. 이 스키마가
  1차 방어이고 서비스의 normalize 는 라우트 밖 호출자 대비 이중 방어. `force` 도
  `z.coerce.boolean()` 이 `'false'` 문자열을 true 로 만드는 함정을 `z.union([boolean,
  'true'\|'false']).transform` 으로 회피 — 쿼리스트링 boolean 의 정형 패턴.
- **19차: 버스 공개/인증을 한 namespace + path prefix 로 분기** — `Routes.Bus` 안에서
  검색·도착·위치·주변·노선은 비로그인 공개(맛집 공개 지도와 동일 정책), 즐겨찾기(`/bus/favorites`)
  만 인증. 두 접근 레벨이 한 도메인 객체에 섞이지만 Fastify 인증 게이트가 `/bus/favorites`
  path prefix 로 분기 — settlement 의 `/share/...` 공개 분리와 같은 패턴
  ([public-admin-route-split](../concepts/public-admin-route-split.md) 의 인증 축 변형).
- **19차: 즐겨찾기 스냅샷 저장 + 게스트→서버 union sync (상한 처리 비대칭)** — 즐겨찾기 항목이
  정류장/노선 정보를 저장 시점 스냅샷으로 보존(`BusFavoriteStationItem = BusStationItem`) —
  목록 렌더·지도 이동에 재조회가 필요 없다(정류장 정보는 사실상 정적). 비로그인은 로컬 저장,
  로그인 시 `favoritesSync` 로 union 병합(멱등, 기존 서버 값 유지). **상한(`BUS_FAVORITES_MAX=100`)
  초과 처리를 의도적으로 비대칭**으로 뒀다 — PUT 단건은 400 으로 거절하지만, sync 는 상한까지만
  채우고 나머지를 조용히 버린다. 로그인 직후 병합이 에러로 끊기는 것보다 "목록이 진실이 되는"
  쪽이 UX 상 낫다는 판단. PUT/DELETE/sync 응답이 전체 목록을 반환해 클라가 diff 없이 캐시 교체.
- **19차: `menuGroups` 를 additive optional 로 추가 (소비자 무해)** — 네이버 `/menu/list` 그룹
  구조를 `crawl.ts` 의 `MenuGroup` 으로 담고, `NaverPlaceData`/`RestaurantPublicDetail` 에
  `menuGroups?: MenuGroup[]` 로 노출. 기존 평탄화 `menus: MenuItem[]` 는 그대로 유지 —
  optional 추가라 기존 소비자(friendly/web/mobile) 코드는 변경 없이 컴파일되고, 그룹 UI 를
  지원하는 클라이언트만 새 필드를 읽는다. 필드 제거·타입 좁히기가 아닌 순수 추가라 라운드 내
  가장 안전한 스키마 변경 유형.
- **18차(2026-06-25): 신규 도메인 스키마 5개를 한 라운드에 흡수 — RAG·군집·발굴·로그·텔레그램** —
  [zod-ssot-buildless](../concepts/zod-ssot-buildless.md) 컨셉의 큰 인스턴스. 각 도메인의
  wire shape(공개/어드민 분기 포함)를 한 패키지에 추가하면서, 신규 라이브러리(Python 군집
  엔진, croner, telegram bot)는 **전부 서버 쪽에 두고 api-contract 는 순수 스키마로** 유지
  (17차 schedule 의 croner 위임과 동일 원칙). 공개 QA·군집 조회는 `placeId`(공개 상세와 같은
  식별자), 어드민 enrich·실행은 `restaurantId` — 같은 도메인을 두 식별자로 가르는
  [public-admin-route-split](../concepts/public-admin-route-split.md) 패턴이 review-search/
  clustering 에 그대로 적용.
- **`logs.ts` 가 `AiErrorCode.options` 를 스프레드해 enum 합성** — `LogAnalysisErrorCode =
  z.enum([...AiErrorCode.options, 'no_analysis_llm', 'parse_failed', 'run_not_failed',
  'analysis_in_flight'])`. provider 공통 에러 코드(rate_limited 등)에 분석 고유 사유를 더하는
  열거형 확장. zod `z.enum(...).options` 가 리터럴 배열을 그대로 노출하므로 스프레드로
  파생 enum 을 만들 수 있다 — 코드 중복 없이 "상위 enum + 추가 값" 을 표현하는 SSOT 패턴.
  (이 때문에 logs → ai 단방향 import 가 생긴다.)
- **세부 분배 그룹 — EQUAL vs GLASSES(잔수 가중)** — 한 카테고리 풀에서 특정 항목(소주·맥주
  등)을 떼어 그룹 멤버끼리만 나누는 `SettlementItemGroup`. 스키마·계산기는 카테고리 범용이지만
  UI 는 주류/음료에만 노출. GLASSES 모드는 `glasses`(정수 잔수) 가중치 비례 — "소주 3잔 마신
  사람" 을 정수 가중으로 표현. `distributeByWeight` 가 floor 후 1원 잔여를 소수부 큰 순서로
  분산해 합이 정확히 풀 금액. 유효 멤버 0명/잔수 합 0 같은 엣지는 calculator 가 나머지 균등
  풀로 환원/fallback(절대 안 깨짐 원칙). 입력 검증은 4단 refine(범위·카테고리·중복).
- **카테고리 보정 leftover 를 단일 id → 배열 (`leftoverParticipantIds[]`)** — '몰아주기'(1명)
  에서 '나눠 받기'(여러 명 균등)로 확장. 응답형 `leftoverParticipantIds`, 입력형
  `leftoverParticipantClientIds` 모두 `.min(1)`. calculator 의 `CategoryAdjustmentsInput` 도
  `leftoverParticipantIndexes: number[]` 로 바뀌고, 수령자 배열은 활성자 필터 + 중복 제거 후
  잔여를 그들끼리 다시 균등 분배. **breaking** — 단일 id 가정 코드는 깨진다.
- **`settlement.drink-kinds.ts` — 술·음료 사전을 단일 소스로** — FE 그룹 제안·BE 추출 카테고리
  보정·추출 프롬프트 힌트 세 소비자를 한 `DRINK_KINDS` 사전이 먹인다. zod 가 아닌 순수
  데이터/함수라 schemas/ 밖 패키지 루트(calculator 와 같은 위상). `noHangul` 가드로 제품명이
  일반 단어·다른 메뉴와 겹치는 오인식("새로"→안주)을 매칭 위치 한글 인접 검사로 차단. 브랜드
  추가는 여기 한 곳이면 세 소비자에 전파.
- **`LlmProviderPurpose` 에 `'log-analysis'` 추가 + 키/모델 출처 enum** — 실패 잡 자동 분석용
  LLM 을 chat/image 와 별도 row 로. env fallback 은 chat 에만 — log-analysis 미설정 시 자동
  분석은 조용히 스킵(우발 비용 방지). `LlmKeySource`(own/inherited/env/none)·`LlmModelSource`
  (own/env/none)로 "이 용도가 자기 키냐 상속이냐"를 UI 배지로 노출 — image·log-analysis 는
  자기 키 없으면 chat row(없으면 env) 상속.
- **LLM 텔레메트리는 표시 전용 인메모리 집계** — 강제(예산 차단) 없이 어드민이 "지금 얼마나
  쓰는지" 보는 용도. 어댑터 한 곳에서 수집, 서버 재시작 시 리셋(`startedAt` 기준). `queueWaitMs`
  (게이트 대기)와 `durationMs`(업스트림)를 분리해 "느린 게 모델인지 큐인지" 구분. 계정(API 키)
  단위 공유 게이트는 키를 노출하지 않는다([in-memory-singleton-gates](../concepts/in-memory-singleton-gates.md) 와 연계).
- **텔레그램/지도 설정의 공통 "DB 우선 + .env fallback + source enum" 패턴** — `TelegramConfig`
  /`MapProviderConfig`/`LlmProviderConfig` 셋이 같은 모양(DB 행 있으면 이기고, 없으면 .env,
  토큰 마스킹, `source: 'db'\|'env'\|'none'`)을 의도적으로 중복 선언. 공유 베이스로 추출하지
  않은 건 각 도메인의 부가 필드(chatId·domains·maxConcurrent)가 달라서.
- **17차(2026-06): `schedule.ts` 신규 — cron 검증을 서버 croner 에 위임(순수 스키마 유지)** —
  주기 자동 실행 스키마 묶음(12 export)을 추가하면서 **cron 식의 실제 파싱·다음 실행 시각
  계산은 api-contract 가 하지 않는다**. `cronExpr` 은 `z.string().min(1).max(120)` 길이
  검사만 두고, 형식 유효성·`nextRuns` 계산은 서버 라우트가 `croner` 로 수행해
  `SchedulePreviewResult` 로 돌려준다. **이유**: api-contract 는 FE/BE/앱 셋이 공유하는
  순수 스키마 패키지라 croner 같은 런타임 라이브러리를 의존성에 끌어들이면 안 된다
  (shared → api-contract 단방향 의존 규칙·번들 무게와 일관). **`ScheduleRun` 한 shape 를
  live(메모리)·이력(SQLite) 양쪽에 공용**으로 쓰고, 진행은 `ScheduleProgressEvent`/
  `ScheduleDoneEvent` SSE 로 push — 같은 `runId` 로 묶여 UI 가 live → 최종을 매끄럽게 잇는다.
  `status` enum 에 `skipped`(overlap 방지)·`interrupted`(graceful shutdown abort)를 둬
  스케줄러 운영 상태를 스키마 단에서 표현. ([zod-ssot-buildless](../concepts/zod-ssot-buildless.md)
  컨셉의 새 인스턴스 — 한 라운드에 12+ export 를 단방향·런타임 무의존으로 흡수.)
- **식당별 category tree = analytics 노드 재사용** — `RestaurantCategoryTreeResult.roots` 가
  어드민 전역 트리의 `CategoryTreeNode` (z.lazy 재귀) 를 그대로 import. 식당별 멘션만
  누적하는 다른 데이터지만 노드 모양·UI 컴포넌트를 공유하려고 중복 선언 대신 import 선택
  (restaurant → analytics 단방향).
- **정산을 N차(rounds) 모델로 재구성** — 단일 차수 → 차수 배열. 실 사용 흐름이 "1차 호프
  + 2차 술집" 처럼 다중인데, 한 세션에 다 들어가는 게 자연스럽다. 차수마다 식당/할인/
  카테고리 보정이 다를 수 있어 round 단위로 `restaurantPlaceId`/`discount`/`categoryAdjustments`
  를 둔다. 세션 직속의 `restaurantPlaceId`/`restaurantName` 은 1차 snapshot — 목록 검색·
  이력 라벨 호환을 위해 의도적으로 중복 보관. rounds[0] 과 항상 동기화.
- **참여자 마스터 + round override 2단 구조** — `SettlementParticipant` 는 세션 단위 마스터
  (기본 `excludeXxx`), `SettlementRoundAttendee` 는 차수 단위 attendance + `excludeXxxOverride`
  (nullable, null=마스터 사용). 한 사람이 1차엔 술 마시고 2차엔 안 마시는 케이스를
  override 로 자연 표현. `effectiveExcludes(master, override)` helper 가 SSOT.
- **`UpdateSettlementInput` = `CreateSettlementInput` (전체 replace PUT)** — 이전 라운드의
  `UpdateSettlementParticipantsInput` (참여자 PATCH) 를 폐기하고 통합. **이유**: rounds 추가/
  삭제·차수별 items 수정·attendance 토글까지 한 번에 가능해야 하는데, 부분 PATCH 로 표현하면
  payload 가 복잡하고 동시 충돌 처리도 어렵다. 전체 replace 면 서버가 트랜잭션으로
  삭제→재삽입 + shareAmount 재계산 한 번에 끝. PUT 의 의미론도 정확. trade-off: 큰 payload
  반복 전송이지만 정산이 보통 작은 객체라 비용 무시 가능.
- **`fromDraftId` 라이프사이클 hook in transaction** — `CreateSettlementInput.fromDraftId?:
  string`. 자동저장으로 만들어진 draft 에서 출발한 저장이면 서버가 **저장 트랜잭션 안에서**
  해당 draft 를 삭제. 본인 소유가 아니거나 없는 id 면 조용히 무시(저장 자체는 성공) —
  draft 정리 실패가 본 정산 저장을 막아선 안 되기 때문. UI 가 "임시저장 → 저장" 을 누른
  순간 draft 가 안전하게 사라지는 자연스러운 흐름.
- **payload `z.unknown()` + 200KB refine 만** — `SettlementDraft.payload` 의 형태를 서버가
  검증하지 않는다. **이유**: 정산 입력 store(zustand) 의 상태 모양이 클라이언트 진화에
  따라 자주 바뀌는데, BE 스키마가 이를 따라가면 마이그레이션이 폭발한다. payload 는
  '클라이언트 상태 보관소' 로 둘 뿐이고 BE 는 통과/저장만 — 새 필드를 클라가 자유롭게
  넣고, 다음 클라이언트 버전이 모르는 필드는 ignore 하면 끝. 안전치만 cap (200KB —
  마스터 100명 + 항목 200개 모두 채워도 100KB 미만이라 여유).
- **`SharedSettlementSession` 의 omit + extend 패턴** — 공개 응답은 `userId` 와 round 별
  `receiptPreviewUrl` 두 필드를 제거. 단일 `omit({ userId, receiptPreviewUrl })` 로는
  nested(round) 안의 필드를 못 지우므로 `omit({ userId, rounds }).extend({ rounds:
  SharedSettlementRound[] })` 로 rounds 만 다시 정의. `SharedSettlementRound =
  SettlementRound.omit({ receiptPreviewUrl })`. zod 의 schema 재조립 능력을 활용해 중복
  선언 없이 공개 응답 모양을 표현.
- **`clientId` indirection 패턴 (FE → server)** — 입력 시 마스터 참여자가 아직 cuid 가 없어
  round.attendees 가 마스터를 가리킬 키가 필요하다. 클라가 안정적 임시 ID (`clientId`) 를
  부여하고 round.attendees.participantClientId 가 그 키로 마스터를 참조. 서버는 cuid 매핑
  완료 후 clientId 폐기. 같은 패턴이 `SettlementCategoryAdjustmentInput.leftoverParticipantClientId`
  에도 적용 — 카테고리 보정의 leftover 흡수자도 입력 시점엔 clientId 로.
- **차수별 할인 — 페어 강제 refine** — `SettlementRoundInput` 의 `discountAmount`/
  `discountCategory` 는 둘 다 null 이거나 둘 다 채워져야 한다 (`(amount==null) ===
  (category==null)`). 그리고 두 번째 refine 으로 같은 카테고리 풀 ≥ discountAmount 검증
  (풀 음수 방지). zod refine 의 등록 순서가 에러 메시지 우선순위 — 페어 refine 이 먼저라
  "할인 금액과 카테고리는 함께 설정해야 합니다." 가 우선 노출되고, 페어 OK 면 그제서야
  "할인 금액이 해당 카테고리 풀을 초과합니다." 가 보인다.
- **`categoryAdjustments` 의 `roundUnit` divisibility silent fallback** — `calculateShares`
  는 `roundUnit` (100/1000) 으로 풀을 round 한 뒤 **그 결과가 인원수로 나눠떨어지는
  경우에만** rounding 을 적용한다. 안 떨어지면 silently 무시하고 원 풀(`afterDiscount`)에
  잔여 가산 fallback. UI 는 활성 조건 검사 + 서비스 검증으로 무효한 rounding 을 사용자가
  못 고르게 하지만, calculator 가 안전망으로 절대 깨지지 않게 한다 — 정산은 "어쨌든 합이
  맞는 결과" 가 무엇보다 중요하기 때문.
- **`perCategoryShares` 매트릭스 신규** — '정산표 (이름 × 카테고리)' UI 를 가능하게 하는
  반환. 합은 `shareAmounts[i]` 와 같지만 컬럼 단위 분담도 별도로 노출. fallback 케이스
  (ALCOHOL 풀 전원 제외 → UNCATEGORIZED 처럼 분배) 에도 본래 카테고리 키에 기록 —
  매트릭스 컬럼 합 invariant 유지. UI 측에선 `poolBreakdown` 으로 '실제 풀' 인지 fallback
  인지 구분 가능.
- **`calculateMultiRoundShares` 가 마스터 인덱스 ↔ 참석자 인덱스 변환을 캡슐화** — 비참석자는
  입력 자체에 빠지므로 calculator 가 차수마다 `masterToAttendee` 맵을 만들어 categoryAdjustments
  의 leftoverParticipantIndex (마스터 인덱스) 를 참석자 인덱스로 변환 후 `calculateShares`
  호출, 결과를 다시 마스터 인덱스로 부풀린다. 호출부(친화적 FE/BE)는 마스터 인덱스 단위로만
  생각하면 됨.
- **정산 calculator 를 api-contract 에 둠** — schemas 가 아니지만 의도적으로 같은 패키지.
  FE 가 입력 즉시 미리보기 계산 + BE 가 영속화 전 검증 — 둘이 어긋나면 silent breaking.
  알고리즘이 순수 함수라 shared 로 끌어올릴 필요 없이 contract 패키지에 직접. type-only
  import 로 zod 런타임 의존 없음.
- **`LlmProviderPurpose` enum (chat vs image)** — 같은 provider 라도 텍스트/비전 모델은
  다르고 `defaultModel/maxConcurrent` 도 따로 잡고 싶다. `(provider, purpose)` 복합 키로
  row 분리. env fallback 은 chat 에만 — image 는 명시적 DB row 가 있을 때만 활성화 (vision
  비용 우발 방지). `Routes.Ai.provider(id, purpose)` 시그니처도 두 인자로 — 호출부에서
  purpose 누락 시 컴파일 에러.
- **공유 OG 이미지를 enum 페어 + 트라이스테이트로 표현** — 공유 링크 미리보기(OG) 이미지를
  owner 가 고를 수 있게 `ShareOgImage` (`restaurant`/`table`) enum + `CreateSettlementShareInput`
  의 `ogImage?`/`ogImageUrl?` 를 도입. **기본을 `restaurant` 로 둔 이유**는 프라이버시 — `table`
  (정산표 PNG) 은 참가자 이름이 미리보기/카카오톡·크롤러 캐시에 박히지만, 식당 사진은 그렇지
  않다. **`ogImageUrl` 의 트라이스테이트(생략/null/URL)** 가 핵심 디자인: 공유 다이얼로그가
  자동으로 share POST 를 호출하는데(본문 없이), 이 때 owner 가 직전에 고른 사진을 덮어쓰면
  안 된다 → `ogImage`/`ogImageUrl` 옵셔널은 "생략=기존 유지", 명시할 때만 변경. null 은
  "선택 해제(랜덤 복귀)" 라는 별개 의미를 가진다. zod 의 `.optional()` vs `.nullable()` 차이가
  도메인 의미로 직결되는 드문 케이스. 후보 검증(후보 목록에 없는 URL 무시)은 서버 책임 —
  스키마는 `string.url()` 형식만 본다.
- **`CreateSettlementShareInput` 의 `z.preprocess` null→`{}`** — 다이얼로그가 본문 없이 POST
  하면 Fastify 가 body 를 `null` 로 넘긴다(undefined 아님 → zod default 가 안 먹음). preprocess
  로 `null` 을 `{}` 로 메꿔야 `ttl` default('7d') 가 적용된다. body 옵셔널 라우트에서 default
  를 살리려는 정형 패턴.
- **`receiptImageToken` 를 round 에 추가 + 공유에서 omit** — 편집 재진입 시 영수증을 보존하려면
  서버가 토큰을 응답에 실어야 하지만, 공유 토큰 보유자가 이 토큰으로 원본 영수증을 재조회할 수
  있으면 안 된다. `SharedSettlementRound.omit` 가 `receiptPreviewUrl` 1 개에서
  `{ receiptPreviewUrl, receiptImageToken }` 2 개로 늘었다 — 민감 필드 추가 시 공유 redaction
  도 따라 늘려야 한다는 omit→extend 패턴의 실증.
- **`ShareTtl` 무제한 없음 (최대 30일)** — `'1d'|'7d'|'30d'` 만. 짧은 10자 토큰을 쓰므로 무제한
  공유면 brute-force 노출 창이 닫히지 않는다. TTL cap 으로 보안 trade-off 를 스키마 단에서 강제.
- **`SettlementSession.editedAt` 을 nullable** — 저장 후 한 번도 수정 안 됐으면 null, 한
  번이라도 update PUT 이 돌면 그 시각. 단순 boolean (`isEdited`) 대신 시각을 실어 보내
  공유 페이지의 '수정됨 (yyyy-mm-dd HH:MM)' 배지를 만든다. `updatedAt` 과 의미가 다르다 —
  `updatedAt` 은 어떤 변경이든 갱신되지만 `editedAt` 은 사용자의 명시적 본문 수정 한정.
- **참여자 옵션은 `excludeXxx` 3 boolean** — 풀 카테고리 1:1 매칭. 직교 조합 자유롭게.
  `EXCLUDE_KEY` 매핑은 calculator 가 단일 SSOT.
- **ESLint flat config 합류 (turbo lint 4/4)** — [eslint.config.mjs](../../packages/api-contract/eslint.config.mjs)
  가 `@repo/config/eslint/base` 만 spread + `dist/`·`node_modules/` ignore. **순수 zod 스키마/타입
  패키지라 base TS 규칙만으로 충분** — React Compiler 진단 룰(앱 전용)이나 추가 플러그인은 없다.
  (5월 라운드에 web/friendly/api-contract/mobile 4 워크스페이스가 모두 eslint.config.mjs 를 가져
  turbo lint 가 4/4 green 이 됐다.)
- **CLAUDE.md 규칙** — _"공유 스키마는 `@repo/api-contract` 에 추가"_ ([CLAUDE.md](../../CLAUDE.md)).

## Gotchas [coverage: high — 27 sources]

- **변경의 파급력** — 스키마 한 줄 수정이 friendly + web + mobile 모두에 컴파일 타임 영향.
  필드 제거나 타입 좁히기는 모든 소비자 코드를 깨뜨린다.
- **`Routes.Saju` 는 이름과 경로가 다르다 (2026-09-06, `5f49026`)** — namespace 는 `Saju` 인데 경로는
  `/api/v1/saju-c/*`, 웹 경로도 `/saju-c/s/:token`. 구 `/saju/*` 는 404. 사주(G)는 `Routes.SajuG` + `/saju-g/*`.
  `UsageQuotaFeature` 는 `'saju-reading'`(C)/`'saju-g-reading'`(G), purpose 는 `'saju'`/`'saju-g'` — "C" 접미가
  붙는 건 URL 과 표시 명칭뿐이라 grep 으로 `saju-c` 를 찾으면 모듈·DB·한도·purpose 는 안 나온다.
- **`Routes.Saju` 객체에만 `as const` 가 없다** — 다른 34개 namespace 는 전부 `} as const;` 인데 `Saju` 는 `};` 로
  닫혀 값 타입이 리터럴이 아닌 `string`. 동작엔 영향 없지만 경로 리터럴 타입에 의존하는 코드는 `Saju` 에서만 다르다.
- **`sharePage`/`shareImage` 는 API 가 아니다** — `Routes.Tarot.sharePage`/`shareImage`, `Routes.Saju.sharePage`/
  `shareImage`, `Routes.SajuG.sharePage` 는 `API_PREFIX` 없는 origin 루트 경로(`/tarot/s/:token`…). `apiFetch` 로
  부르면 SPA HTML 이 온다 — 클라이언트는 `TarotShareResult.path`/`SajuShareResult.path` 에 자기 origin 을 붙여 링크만
  만든다. 반대로 `Routes.SajuG.shareImage` 는 `${API_PREFIX}/saju-g/shares/:token/image.png` 로 API 경로(C/G 비대칭).
  운영은 nginx `^~ /tarot/s/`·`^~ /saju-c/s/` 블록이 friendly 로 프록시해야 OG 가 주입된다(`.png` 정규식 location 이
  이미지를 가로채는 SPA 폴백 충돌 — `13b87e8`·`ops/nginx/` 주석).
- **`SajuJobPollQuery.wait` 상한 25,000ms · 410 = job 소멸** — job 은 메모리 레지스트리(TTL 5분·최대 200, PLAN-saju)라
  서버 재시작·배포 후 poll 은 410. 클라이언트는 이미 받은 정적 본문을 유지하고 "다시 시도" 로 새 reading 을 만들어야
  한다(같은 jobId 재시도 무의미). `SajuReadingResult.readingId` 는 섹션 전부 끝난 뒤에야 poll 결과에 실린다 — 첫
  응답의 `readingId` 가 null 이어도 회원 저장 실패가 아니다. `jobId` null 은 캐시 히트·정적 경로(poll 불필요).
- **`TarotReadingResult.menu` 는 `.default(null)`** — menu 스프레드 이전에 저장된 회원 기록 행을 위한 응답 default.
  다른 스프레드에서도 항상 null 이므로 `spreadId === 'menu'` 로 분기해야 한다. `choice` 는 nullable 만(default 없음).
- **`UsageQuotaSetting` 의 `0` 은 "무제한", `ipPerMinute` 는 0 불가** — `guestPerDay/ipPerDay/globalPerDay` 0 = 제한
  없음, `ipPerMinute` 는 `min(1)`. `UpdateUsageQuotaSettingInput` 은 partial 이라 보내지 않은 필드는 유지 — "0 으로
  끄기" 와 "생략" 이 다른 의미. `UsageQuotaFeature` 확장 시 friendly 기본값 테이블·어드민 라벨(타로/사주(C)/사주(G))·
  purpose 를 같이 늘려야 한다(`f8e5dd0`·`e40b4c0` 이 그 사례).
- **`LlmProviderPurpose` 8종 — 기존 픽스처 함정이 3배** — `tarot`/`saju`/`saju-g` 추가로 `Record<purpose, string>`
  완전성을 요구하는 friendly 테스트·`AiConfigService.ALL_PURPOSES`(= `.options`, 어드민 카드 순서)가 같이 움직인다.
  사주(C)·(G)가 purpose 를 따로 가지므로 모델 기본값 env 도 각각([ai](ai.md)).
- **`SajuGBirth` 는 문자열 날짜·시각 + `superRefine` 3종** — 사주(C)의 정수 필드(`year/month/day/hour/minute`)와 달리
  `date: 'YYYY-MM-DD'`(1899~20xx)·`time: 'HH:mm'`. 양력+윤달 / `exact` 인데 time 없음 / `range` 인데 timeRange 없음 은
  400. `timeZone` 은 `z.literal('Asia/Seoul')` — 다른 값 거부. 두 구현의 입력 shape 를 서로 보내면 전부 400.
- **`SajuGReport` 문자열 길이 상한이 LLM 출력 검증** — `sections` 3~5개, `text` ≤1800, `summary` ≤1500,
  `lifeScenes.length(3)`. LLM 이 길게 쓰면 응답 zod 실패가 아니라 서버가 `basic` 폴백을 골라야 하는 케이스 — 프롬프트
  변경 시 상한을 같이 봐야 한다.
- **`CreateSajuGShareInput` 은 4개 중 정확히 하나** — `receipt`/`readingId`/`birth`/`pair` 를 둘 이상(또는 0개) 보내면
  refine 400. `SajuGShareToken` regex 는 10자 또는 32자 — 다른 길이는 400(타로·사주(C) 토큰은 제약 없는 `z.string()`).
  공유 라우트는 `503: SajuGShareError` 응답 스키마를 따로 등록.
- **`SharedSajuReading.chart` 는 `SajuChart` 전체** — `chart.input`(생년월일시 에코)·`solar`/`lunar` 가 포함된다.
  `includeBirth=false` 의 숨김은 스키마가 강제하지 않고 서버 `maskBirth` 가 월·일을 0, 시·분을 null 로 바꾼다 —
  공유 응답을 렌더하는 코드는 `month: 0` 같은 마스킹 값을 날짜로 찍지 말고 `includeBirth` 를 봐야 한다.
- **`SajuTwelveStage` 는 한글 리터럴 enum** — `'장생' | '목욕' | …` 12운성 값이 한글이라 라벨 매핑 없이 그대로
  표시되지만 NFD 문자열과는 어긋난다. 다른 사주 enum 은 로마자(`SajuTenGod`)·영문(`SajuWuxing`).
- **`SajuRelationType_` 언더스코어** — `SajuRelationType` 은 관계 종류 **zod enum** 이라 `SajuRelation` 객체의 추론
  타입은 `SajuRelationType_` 로 export 된다. 다른 파일의 `XxxType` 규칙과 어긋나는 유일한 이름.
- **`SAJU_PROFILE_MAX`(10) 은 상수일 뿐** — `SajuProfileList.items` 에 max 가 없다(사주(G)는 `items.max(20)`).
  10명 초과 거절은 서버 책임.
- **`HousingPointsResult.mode` 와 nullable 좌표** — life-map 과 같이 `items`/`cells` 중 하나만 채워진다.
  `HousingComplexSummary`/`HousingSearchItem`/`HousingComplexDetail` 의 `lat/lng` 는 nullable(지오코딩 미완 단지) —
  검색 결과 클릭 → 지도 이동은 null 가드. `HousingNearbyQuery` 좌표는 한국 범위(33~39/124~132) 강제, `HousingPoint`
  좌표는 non-null(좌표 있는 단지만 점으로).
- **`HousingTradesQuery.includeCanceled` 는 boolParam** — `enum(['1','0','true','false']).optional().transform`
  (life-map/food/meal 과 같은 `z.coerce.boolean` 회피). 기본 제외 — 해제 거래를 보려면 명시 `'1'`. 거래 목록은
  offset 페이지네이션(meal 의 opaque 커서와 다름).
- **`RestaurantMenuNutrition.items` 는 빈 배열이 정상** — 판정된 항목이 없으면 404 가 아니라 `[]`. `llmPending=true`
  면 잠시 뒤 재조회해야 `'llm'` 항목이 붙는다(폴링 계약이지만 SSE·long-poll 없음). `kcal` 은 `components` 에서 null 일
  수 있으니 `parts` 로 표시. `name` 은 상세 메뉴명과 문자 그대로 같아야 join 된다 — 클라이언트가 trim/정규화하면
  어긋난다. `notice` 는 `z.string()` 이라 `MENU_NUTRITION_NOTICE` 상수와 다른 문구가 와도 zod 는 통과.
- **`FoodSource` 8종 vs `FoodImportSource` 4종 (갱신)** — `hansik-800` 외에 `mfds-raw`/`curated` 도 CLI 전용.
  어드민 잡 `sources` 로 보내면 400. `FoodItem.kcalPer100g` 는 `nutrition` 이 null 이어도 있을 수 있다 — "영양 없음"
  판단을 `nutrition` 만 보고 하면 100g당 값을 버린다.
- **`.strict()` 스키마는 필드 추가 시 양쪽 동시 배포 (2026-08-22)** — `RecognizedDish`/`MealDataBackup`
  등에 클라이언트가 새 필드를 먼저 보내면 400(unknown key). 다른 도메인(strip 기본)과 달리 meal 의 strict
  객체는 앱 선배포가 안 된다. 인식 스냅샷은 구버전 DB 호환으로 응답(`MealRecognitionSnapshot`)만
  model/version nullable — POST 에 null 을 보내면 400.
- **`MealPhotoToken` regex 가 경로 조립 계약** — uuid v4 **소문자** 16진만. 대문자 UUID·서버 발급 외 문자열은
  400. 앱이 로컬 큐에서 토큰을 대문자로 정규화하면 업로드 뒤 confirm 이 전부 깨진다.
- **`ListMealEntriesQuery.cursor` 를 해석하지 말 것** — opaque(eatenAt+id). 전환 전 ISO eatenAt 커서도
  서버가 허용하지만 계약이 아니다. `q` 검색은 페이지네이션 전에 적용되므로 커서를 바꾼 채 `q` 만 바꾸면
  결과가 어긋난다 — 검색어 변경 시 커서 리셋.
- **`UpdateMealEntryInput` 의 items/photoTokens 는 전량 교체** — 부분 패치 아님(편집 화면이 항상 전체를
  든다). `recognition`/`source`/`originRecommendationId` 는 omit 이라 보내면 strip 이 아니라… partial 객체는
  strict 가 아니므로 조용히 무시된다 — "수정했는데 안 바뀐다" 가 아니라 애초에 수정 불가 필드.
- **`FoodRestaurantsQuery`/`CreateMealRecommendationInput` 좌표는 세계 범위** — 공공 API 쿼리(33~39/
  124~132)와 다르다. lat/lng 중 하나만 보내면 `superRefine` 400(둘 다 생략은 OK — 거리 필터 없이 근거·평점순).
- **`FoodImportSource` 에 `hansik-800` 이 없다** — `FoodSource` 6종 vs `FoodImportSource` 4종: 800선은
  CLI `load:food-catalog --file` 전용. 어드민 잡 `sources` 로 보내면 400. `FoodImportConfig.apiConfigured`
  가 false 인 소스는 켜 둬도 회차에서 오류 기록·skip.
- **`LifeMapPointsResult.mode` 에 따라 `items`/`cells` 중 하나만 채워진다** — 두 배열을 항상 합치면 안 됨.
  `truncated=true` 면 상한 절단이라 "총 N건" 은 `total` 로. `minPointZoom` 은 레이어마다 다르다.
- **`AirSidoRealtimeResult` 0건은 404 가 아니다** — 매칭 0건과 측정소 전원 결측을 구분 못 해 빈 `items` 200.
  존재하지 않는 sidoName 도 200 빈 배열.
- **`enabled=false` 는 200 이다** — `LifeMapSearchResult`/`WeatherAwsResult`. 에러 핸들러에 안 잡히므로 UI 가
  필드를 보고 섹션을 숨겨야 한다. 반대로 필수 키(AIRKOREA/KMA)가 없으면 503.
- **`AirForecastQuery.date`/`AirWeeklyForecastQuery.date` 는 폴백된다** — 응답 `date`/`presentedAt` 가 요청과
  다를 수 있다(당일 발표분 없으면 전일). "오늘 예보" 라벨은 응답 값으로.
- **`AirLocationSource.manual` 은 호환용** — UI 에서 제거됐고 저장된 값만 돌아온다. 새 저장에 `manual` 을
  보내도 zod 는 통과시킨다(enum 에 남아 있음).
- **`MealRecommendationEventInput` 후보 계열 kind 는 `candidateName` 필수** — `candidate_picked`/
  `candidate_rated`/`restaurant_opened`/`logged` 에 이름이 없으면 `superRefine` 400. `shown`/`set_rated`/
  `dismissed` 는 후보 없이.
- **`MEAL_DATA_*` 확인 문자열은 `z.literal`** — 번역·trim·대소문자 변환 금지. 앱 i18n 이 문자열 리소스로
  빼면 안 된다(상수 import).
- **`MealDataBackup` 은 최대 75MB JSON** — `MEAL_DATA_BACKUP_MAX_JSON_BYTES`. 서버 body 한도와 시간당
  레이트리밋(10)이 같이 걸린다. base64 regex 가 **개행 포함 base64 를 거부** — 줄바꿈 넣는 인코더 사용 금지.
- **routes 빌더 인코딩 이중 적용 주의** — `AirQuality.sidoRealtime`/`stationHistory`/`LifeMap.detail` 은
  이미 인코딩된 문자열을 반환하므로 fetch 래퍼가 다시 `encodeURIComponent` 하면 `%25`(subway
  `stationArrivals` 와 같은 함정).
- **`Routes.*` namespace re-export 함정에 `Food`/`Meal`/`AirQuality`/`Weather`/`LifeMap`/`Tarot`/`Saju`/`SajuG`/
  `UsageQuota`/`Housing` 도 포함** — vite esbuild prebundle 에서 깨질 수 있어 friendly 측은 `const X = Routes.X` 우회
  (`const T = Routes.Tarot`, `const S = Routes.Saju`, `const T = Routes.SajuG`, `const Q = Routes.UsageQuota`;
  housing.route 만 `Routes.Housing.*` 직접 참조).
- **`OperationFeature`/`LlmProviderPurpose` enum 확장은 friendly 테스트 픽스처를 깨뜨린다** — `defaultModels`
  리터럴을 들고 있는 테스트(`adapter-cache.test`/`ai.service.test` 등)가 `Record<purpose, string>` 완전성
  때문에 컴파일 실패 → 용도 추가 시 friendly 테스트 5곳 동반 수정(cc8399a 가 그 사례).
- **버스 좌표 WGS84 범위가 서버 버그를 500 으로 바꾼다 (19차)** — `lat 33~39`/`lng 124~132`
  강제라, 서버가 GRS80 TM 값을 WGS84 로 변환하지 못하고 그대로 실으면 응답 zod 직렬화가
  실패한다(500). 계약을 코드로 못박은 의도된 동작이지만, 버스 어댑터를 손볼 때 좌표 변환을
  빠뜨리면 조용한 오작동이 아니라 명시적 실패로 나타난다는 점을 알고 있어야 한다.
- **`arsId` 는 식별자가 아니다 — PK 는 `stId` (19차)** — 가상정류장('0')이 여럿이라 `arsId`
  ('0' 포함)로 정류장을 구별하면 충돌한다. 목록/맵/즐겨찾기 키는 9자리 `stId` 를 써야 한다.
  `arsId === '0'` 은 도착정보 조회가 불가능해 `BusArrivalsParams` 가 `.refine(≠'0')` 로 거절
  (400) — FE 는 목록에서 미리 비활성 처리해야 사용자가 400 을 안 맞는다.
- **`BusArrivalItem.staOrd` 가 null 이면 위치 조회 불가 (19차)** — 도착정보에 순번이 없으면
  `busPositions` 의 `startOrd/endOrd` 입력을 못 만든다. FE 가 해당 노선 지도 표시를 비활성해야
  한다. `BusArrivalEntry.vehId` 도 업스트림 '0'(도착예정 없음)이 null 로 정규화됨 — null 이면
  차량 단건 추적 불가.
- **`BusPositionsQuery` startOrd/endOrd 는 짝이거나 둘 다 생략 (19차)** — 하나만 지정하면
  refine 이 400 으로 거절(의도 모호). 둘 다 생략 = 노선 전체 차량(getBusPosByRtid), 둘 다 지정
  = 구간(getBusPosByRouteSt, ≤50정류장). 클라가 startOrd 만 넘기고 endOrd 를 빠뜨리면 조회가
  통째로 실패한다.
- **`BusFavoritesSyncBody` 상한 초과는 조용히 유실 (19차)** — sync 는 `BUS_FAVORITES_MAX=100`
  까지만 채우고 나머지를 **에러 없이 버린다** (PUT 단건은 400 으로 거절하는 것과 비대칭).
  게스트가 100개 넘게 모아뒀다가 로그인하면 초과분이 사라지는데 에러가 안 나므로, "왜 몇 개가
  안 넘어왔지" 를 사용자가 못 알아챌 수 있다 — 의도된 trade-off(병합이 에러로 끊기지 않게).
- **`BusStationSearchQuery.force` 의 coerce 함정 (19차)** — `z.coerce.boolean()` 은 `'false'`
  문자열도 truthy 라 true 가 된다. 그래서 `z.union([boolean, 'true'\|'false']).transform` 으로
  우회했다. 쿼리스트링 boolean 을 새로 만들 때 `z.coerce.boolean()` 을 그대로 쓰면 `'false'`
  가 true 로 새는 같은 함정 — 버스 스키마의 패턴을 따를 것. 또한 `q` 는 NFC 정규화 후 길이를
  재므로, 서버가 정규화 없이 raw 길이로 검증하면 이 계약과 어긋난다.
- **`SettlementCategoryAdjustment` leftover 가 단일 id → 배열 (18차 breaking)** — 응답형
  `leftoverParticipantId`(단일)가 `leftoverParticipantIds: string[]` 로, 입력형도
  `leftoverParticipantClientIds: string[]` 로 바뀌었다. calculator 의 `CategoryAdjustmentsInput`
  도 `leftoverParticipantIndexes: number[]`. 단일 id 가정 코드를 그대로 두면 타입 에러.
- **`SettlementRoundInput` refine 가 2단 → 4단** — discount 페어·풀 cover 에 더해 groupSplits
  의 itemIndexes 검증(범위·카테고리 일치·그룹 간 중복)·그룹 내 참여자 중복 두 개가 추가됐다.
  여러 refine 이 동시 실패하면 등록 순서상 먼저 정의된 것만 노출 — UI 가 stepwise 검증 가정.
- **그룹 GLASSES 잔수 0 / 유효 멤버 0 fallback** — GLASSES 모드인데 멤버 잔수 합이 0 이면 균등
  분배로, 유효 멤버(참석·인덱스 유효)가 한 명도 없으면 그룹 풀이 **나머지 균등 풀로 환원**
  (`GroupShareBreakdown.applied=false`). 사용자가 그룹을 만들었는데 결과가 그룹 분배로 안 보일
  수 있다 — `applied` 플래그로 UI 가 구분해야 한다.
- **`logs.ts` → `ai.ts` import 로 enum 결합** — `LogAnalysisErrorCode` 가 `AiErrorCode.options`
  를 스프레드한다. `ai.ts` 의 `AiErrorCode` 값이 바뀌면 logs 의 에러 코드 집합도 자동 변동 —
  의도된 결합이지만 ai.ts enum 수정 시 logs 소비자 영향 범위를 같이 봐야 한다.
- **`review-clustering` 의 공개 `ready=false` 의미** — 군집도 관점집계(`aspectSummary`)도 둘 다
  없을 때만 `ready=false`. 전부 노이즈라 토픽 군집이 0 이어도 aspectSummary 폴백이 채워지면
  `ready=true` + `clusters` 빈 배열. UI 가 `clusters.length` 만 보고 "데이터 없음" 처리하면
  폴백 화면을 놓친다 — `ready` + 두 배열을 함께 봐야 한다.
- **`review-search` standalone 검색 제거됨** — 제품 표면은 RAG(`ask`)만. 과거 시맨틱/관점
  검색 엔드포인트를 호출하던 코드는 없어졌다(검색 엔진은 RAG 내부에서만). `ReviewAskResult.hyde`
  /`verification` 은 nullable — RAG 파이프라인이 HyDE·2차 검증을 건너뛴 경우 null.
- **`random-crawl` 의 `telegramConfigured=false` 면 enabled 여도 skip** — 봇 토큰/chatId 가
  없으면 후보를 못 보내 회차가 skip 된다. `RandomCrawlConfig.telegramConfigured`(읽기 전용)를
  UI 가 경고로 노출해야 사용자가 "켰는데 왜 안 도나"를 안다. 텔레그램 설정은 별도
  `SettingsTelegram` namespace.
- **정산 세션 모양이 통째로 바뀐 breaking change** — `SettlementSession` 의 `items[]`/
  `participants[]` (참여자 도메인 외) 가 사라지고 `rounds: SettlementRound[].min(1)` 안으로
  이동. `itemsSubtotal` → `grandTotal`. 직전 라운드의 `UpdateSettlementParticipantsInput`
  도 사라졌다 — 이제 `UpdateSettlementInput = CreateSettlementInput` 의 전체 replace 만
  가능. 어떤 클라이언트도 단일 차수 가정 코드를 그대로 두면 컴파일 시 깨진다.
- **`Routes.Settlement.updateParticipants(id)` 사라짐** — 직전 라운드에 있던 `PATCH /:id/participants`
  엔드포인트가 폐기. 이제 `Routes.Settlement.update(id)` 의 PUT 한 가지. URL 자체는 `one(id)`
  과 같지만 HTTP verb 로 분기. fetch 래퍼가 verb 명시 안 하고 호출하면 GET 으로 떨어져 의외
  동작.
- **`SettlementRoundInput` 의 refine 순서가 에러 메시지 순서** — discount pair refine 이
  먼저, 풀 cover refine 이 다음. 한 번에 둘 다 실패하면 페어 에러만 노출되므로 클라이언트가
  "둘 다 채웠는데도 풀 초과" 케이스를 보려면 페어를 먼저 채워서 두 번째 refine 만 트리거
  되게 해야 한다. UI 가 stepwise 검증을 한다고 가정.
- **`clientId` indirection 의 함정** — `SettlementParticipantInput.clientId` 는 **클라가
  부여**하는 안정적 임시 키. `crypto.randomUUID()` 같은 걸 한 번 만들고 같은 폼 세션 내내
  유지해야 round.attendees.participantClientId 매칭이 끊기지 않는다. 입력 도중 새로 만들면
  같은 사람이 두 번 들어가게 된다. 서버는 그 clientId 가 unique 한지 검증 없이 신뢰 (zod
  min(1) 외 제약 없음).
- **`participantClientId` 가 마스터에 없으면 서버 에러** — round.attendees 의 키는 반드시
  participants 의 누군가의 clientId 와 매칭돼야 한다. 마스터 삭제 후 round.attendees 정리
  안 하면 저장 실패. 폼 store 에서 마스터 삭제 시 모든 round 의 attendees 도 같이 정리해야
  한다.
- **`categoryAdjustments.leftoverParticipantClientId` 도 같은 indirection** — 카테고리 보정의
  흡수자도 입력 시점엔 clientId 로 가리킨다. 마스터 삭제 시 이 참조도 끊기지 않게 정리 필요.
  서버는 매핑 실패 시 calculator 가 -1 → 첫 활성자 fallback 으로 silently 처리하지만, UI
  의도와 다를 수 있다.
- **`roundUnit` divisibility silent fallback** — calculator 가 무효한 rounding(나눠떨어지지
  않는 케이스) 을 silently 무시하고 원 풀 + 잔여 가산으로 떨어진다. 사용자가 "100원 단위로
  맞춘다" 를 선택했는데 결과가 그대로 안 나올 수 있다는 의미 — UI 가 활성 조건 검사 (풀이
  100 으로 round 시 인원수로 나눠지는지) 를 사전에 해야 한다. calculator 는 절대 깨지지 않는
  것을 우선으로 둠.
- **할인 풀 음수 클램프** — `calculateShares` 가 `Math.max(0, rawPool - discount.amount)`
  로 음수를 0 으로 막는다. 스키마 refine 으로 입력 단에서 차단되지만, calculator 가 호출
  context (멀티라운드, 외부 호출) 를 신뢰하지 않고 방어한다. UI 가 "할인이 풀보다 큼"
  케이스를 user-friendly 에러로 보여주려면 스키마 refine 에 걸리도록 입력 검증을 거쳐야지,
  calculator 만 보고 판단하면 안 된다 (조용히 0).
- **`SettlementDraft.payload` 형태 검증 부재** — 서버가 `z.unknown()` 으로 통과만 시킨다.
  즉 잘못된 모양의 payload 가 저장돼도 BE 는 모름. 다음 입력 화면이 그 payload 를 로드할 때
  클라가 자체 검증 + invalid 면 폐기/마이그레이션 책임. payload 가 의도적으로 BE 와 분리된
  자유 영역이라는 점을 잊으면 "서버에 저장됐는데 왜 화면이 깨지나" 디버깅 함정.
- **`fromDraftId` 가 없는 id 면 silent ignore** — 본인 소유가 아니거나 존재하지 않는 draft
  id 를 보내도 정산 저장은 성공한다 (draft 정리만 skip). UI 가 "임시저장이 사라졌는지"
  확인하려면 별도 호출 필요 — 단, 일반적인 사용 흐름(자동저장 → 저장 클릭)에서는 같은
  세션 안의 draft id 라 안전.
- **`SharedSettlementSession.omit + extend` 의 nested 제거** — receiptPreviewUrl/receiptImageToken
  은 round 안에 있어 top-level omit 으론 안 지워진다. `omit({ userId, rounds }).extend({ rounds:
  SharedSettlementRound[] })` 패턴 필요. 17차에 `receiptImageToken` 추가로 omit 가 1→2 필드가
  됐다 — round 에 새 민감 필드를 추가할 때마다 `SharedSettlementRound.omit` 도 같이 늘려야 한다.
  잊으면 공유 토큰 보유자에게 원본 영수증(토큰)이 leak. **18차 `groupSplits` 는 omit 대상이
  아니다** (참가자 분배 규칙이라 공유에도 보여야 함) — 새 round 필드가 다 민감한 건 아님.
- **`CreateSettlementShareInput.ogImageUrl` 트라이스테이트 혼동** — `생략`(키 없음) / `null` /
  `URL` 세 상태가 모두 다른 의미다. 생략=기존 선택 유지, null=선택 해제(랜덤 복귀), URL=고정.
  fetch 래퍼가 "선택 안 함" 을 `null` 로 보내면 owner 의 직전 선택이 지워진다 — 토글을 바꿀
  때만 명시하고 그 외엔 키 자체를 빼야 한다. 다이얼로그 자동 share POST 가 이 함정을 피하려고
  본문을 비워 보낸다.
- **`CreateSettlementShareInput` 의 body null preprocess** — 본문 없이 POST 하면 Fastify body 가
  `undefined` 가 아닌 `null` 이라 zod default 가 안 먹는다. `z.preprocess(v=> v==null?{}:v, …)`
  를 거쳐야 `ttl` 기본 7일이 적용된다. 다른 옵셔널-body 라우트를 만들 때 같은 함정 — `.default()`
  만으론 부족.
- **`ogImageUrl` 후보 검증은 서버 책임** — 스키마는 `string.url()` 형식만 본다. 후보 목록
  (`ogImageCandidates`) 에 없는 URL 을 보내면 zod 는 통과시키고 **서버가 무시 후 null 처리**.
  클라가 "분명 URL 을 보냈는데 미선택으로 돌아간다" 디버깅 시 후보 매칭 실패를 의심해야 한다.
- **`ExtractReceiptSplit.index <= count` refine** — `count=3, index=4` 같은 입력은
  refine 으로 거부. 클라가 split UI 에서 미리 검증해도 BE 가 다시 막는다. count 와 index
  enum 의 max(5) cap 도 — 가로 5등분이 실용 한계 가정.
- **`ExtractReceiptInput.roundIndex/roundTotal` 의 의미** — 한 영수증이 N차 회식의 몇 번째
  인지 LLM 프롬프트에 주입하는 힌트. 미지정 + `roundTotal <= 1` 이면 프롬프트에 차수 라인을
  넣지 않음. 잘못된 `roundIndex > roundTotal` 같은 케이스는 zod refine 으로 막혀있지 않다
  (각각 1..20 cap 만) — 서버 또는 클라가 별도 검증해야 한다.
- **`Routes.Ai.X(id, purpose)` (breaking)** — `provider/testProvider/providerModels` +
  신규 `providerModelsPreview` 모두 두 인자. 1 인자만 넘기면 TS 컴파일 에러.
- **`Routes.SettlementDraft.upsert` 는 id 없이 PUT** — body 안의 `placeId` 로 서버가
  `(userId, placeId)` 키로 upsert. RESTful 관습으로 보면 PUT 에 id 가 없는 게 어색하지만
  의도 — 클라가 draft 의 server cuid 를 모르는 상태에서도 같은 식당 슬롯을 갱신할 수
  있어야 한다. DELETE 만 `one(id)` 의 cuid 가 필요.
- **`Routes.Settlement.shared(token)` 만 `/share/...` prefix** — 다른 정산 라우트는
  `/settlements/...`. Fastify 인증 미들웨어가 path prefix 로 분기 — 의도된 분리.
  `/settlements/share/:token` 처럼 보이지 않게 주의.
- **`SettlementParticipantInput.contactId` 는 힌트일 뿐** — 클라가 자동완성에서 단골을 골라
  보내도 서버는 무시하고 `(userId, normalizedKey)` 로 upsert.
- **`calculateShares` 전원 제외 풀 fallback 동작** — 주류 항목이 있는데 전원이
  `excludeAlcohol=true` 면 풀 금액이 0 으로 떨어지는 게 아니라 **전원에게 균등 분배**.
  UI 가 이 의미 차이를 사용자에게 전달하지 않으면 의외의 결과를 줄 수 있음. `perCategoryShares`
  도 본래 카테고리 키(ALCOHOL) 에 값이 박혀 매트릭스에 '주류 컬럼' 에 음식값이 보이는 경우가
  발생 — UI 가 `poolBreakdown.participantCount === 0` 으로 fallback 분기를 감지해 회색
  처리 등 시각적 구분 필요.
- **list 응답 모양이 (직전 라운드) canonical 단위 그룹핑으로 전환된 상태 유지** —
  `RestaurantListResult.items` 가 `CanonicalListItem[]` (1 행 = 1 canonical, `sources` 배열).
  변경 없음.
- **공개 상세의 `reviews[].source` 가 (직전 라운드) 신규** — `PublicVisitorReview.source:
  'naver' \| 'diningcode'`. 변경 없음.
- **빌드 단계 추가 금지** — `package.json` `exports` 가 `src/` 를 직접 가리키므로 tsup/rollup
  같은 번들러를 끼우면 워크스페이스 전체 import 경로가 깨진다.
- **순환 의존 금지** — `@repo/shared → @repo/api-contract` 는 OK, 반대 방향은 금지.
- **`.js` 확장자 표기** — 실 파일은 `.ts` 지만 import 는 `.js` 로 써야 한다 (NodeNext 해석).
- **`z.coerce` 의 함정** — `ExtractReceiptSplit.{count,index}`, `ExtractReceiptInput.{roundIndex,
  roundTotal}`, `PaginationQuerySchema`, `ListSettlementsQuery.{offset,limit}`,
  `RandomCrawlConfigInput.{candidateCount,responseTimeoutMin}`, `ReviewEnrichStatusQuery.{page,
  pageSize}`, `ReviewClusterStatusQuery.{page,pageSize}`, `ListOperationLogsQuery.limit`,
  `RestaurantPublicReviewsQuery.{offset,limit}` 등 다수가 coerce — 쿼리스트링 문자열 자동 강제.
- **`Routes.*` namespace re-export 가 vite esbuild prebundle 에서 깨질 수 있음** —
  `Routes.Settlement`, `Routes.SettlementDraft`, 신규 `Routes.ReviewSearch`/`Routes.ReviewClustering`
  /`Routes.RandomCrawl`/`Routes.Logs`/`Routes.SettingsTelegram` 등도 동일 위험. 회피책: friendly
  측은 `const ReviewSearchRoutes = Routes.ReviewSearch` 로 한 단계 우회.
- **`schedule.ts` 의 `cronExpr` 은 길이만 검증** — `z.string().min(1).max(120)` 만 봐서
  `"banana"` 같은 무효 cron 도 zod 는 통과시킨다. 형식 유효성은 `SchedulePreviewInput` →
  `SchedulePreviewResult.valid/error` (서버 croner) 로만 알 수 있다. 클라가 스키마 통과 =
  유효한 cron 이라고 가정하면 함정. PUT `config` 전에 `preview` 로 검증하는 흐름을 전제로 한다.
- **`ScheduleConfigInput` 에 `jobType` 이 없다** — 서버가 `'normalize-merge'` 로 고정.
  enum 이 단일이라 입력에 받지 않는다. 추후 jobType 다중화 시 입력 스키마에 추가될 예정 —
  지금 `ScheduleConfig` 응답엔 `jobType` 이 있으니 응답/입력 비대칭에 주의.
- **`ScheduleRun.phase`/`totalTargets` 는 nullable** — 완료된 이력 행에서는 null 일 수 있다
  (`phase` 는 진행 중에만, `totalTargets` 는 collecting 단계 후에야 확정). live 스냅샷과
  같은 shape 를 쓰는 대가 — UI 가 이력 렌더 시 null 가드 필요.
- **`Routes.Schedule.config` 한 경로가 GET/PUT 겸용** — URL 은 `/admin/schedule` 하나,
  HTTP verb 로 조회/변경 분기. fetch 래퍼가 verb 명시 안 하면 GET 으로 떨어진다 (settlement
  `update` 와 같은 함정). `runEvents` 는 SSE 라 EventSource 로 붙어야 한다.
- **`Routes.*` namespace re-export 함정에 `Routes.Schedule` 도 포함** — vite esbuild
  prebundle 에서 깨질 수 있어 friendly 측은 `const ScheduleRoutes = Routes.Schedule` 우회
  패턴을 동일하게 쓴다.
- **`RestaurantPublicReviewsQuery.tip`/`menu` 매칭은 서버 책임** — `tip` 은 termNorm 정확
  일치, `menu` 는 topMenus 와 동일 MenuCanonical 그룹핑. 클라가 raw 텍스트를 보내면 카드
  카운트와 결과 수가 안 맞을 수 있다 — 카드의 canonical 표시명을 그대로 넘겨야 한다.
- **정산 도메인 상세 설명은 `settlement.md` 에서** — api-contract 토픽은 스키마 export 목록
  + 라우트 namespace + design decision 만 다룬다. N차 입력 UX / 임시저장 자동저장 흐름 /
  영수증 분할 / 카테고리 보정 UI 같은 도메인 흐름은 [settlement.md](settlement.md) 토픽 참조.
- **스케줄러 파이프라인 동작은 `schedule.md`/`analytics.md` 에서** — api-contract 는 wire
  shape 만. 실제 정규화 → 글로벌 머지 단계, overlap/shutdown 처리, croner tick 운영은
  [schedule](schedule.md) / [analytics](analytics.md) 토픽 참조.
- **신규 도메인 5개의 내부 로직은 각 토픽에서** — api-contract 는 스키마 인벤토리·zod 패턴만.
  RAG 파이프라인(HyDE·검증 가드레일·임베딩)·군집 엔진(Python UMAP/HDBSCAN/c-TF-IDF)·텔레그램
  발굴 상태머신·작업 로그 수집/분석 흐름은 각각 [review-search](review-search.md) /
  [review-clustering](review-clustering.md) / [random-crawl](random-crawl.md) / [logs](logs.md)
  토픽 참조. 텔레그램 봇 설정의 운영(폴러·재구성)은 friendly 토픽.

## Sources [coverage: high — 58 sources]

- [packages/api-contract/package.json](../../packages/api-contract/package.json)
- [packages/api-contract/eslint.config.mjs](../../packages/api-contract/eslint.config.mjs) — @repo/config/eslint/base flat config
- [packages/api-contract/tsconfig.json](../../packages/api-contract/tsconfig.json)
- [packages/api-contract/src/index.ts](../../packages/api-contract/src/index.ts) — 업데이트 (**2026-09-07: housing/menu-nutrition/menu-lexicon/tarot/saju/saju-g/usage-quota 7 re-export**; 2026-08-30: air-quality/weather/life-map/allergen/food/meal 6; 19차: bus/bus-favorite; 18차: random-crawl/review-search/review-clustering/logs/telegram-settings + drink-kinds)
- [packages/api-contract/src/routes.ts](../../packages/api-contract/src/routes.ts) — 업데이트 (**2026-09-07: Housing/Tarot/Saju(`/saju-c`, `5f49026`)/SajuG/UsageQuota 5 namespace 신설 + Restaurant.publicMenuNutrition + Food.adminMenuLexicon***; 2026-08-30: Food/Meal/AirQuality/Weather/LifeMap 5; 19차: Bus; 18차: ReviewSearch/ReviewClustering/RandomCrawl/Logs/SettingsTelegram + Crawl.tabling* + Restaurant.regionStats + Ai.telemetry)
- [packages/api-contract/src/settlement.calculator.ts](../../packages/api-contract/src/settlement.calculator.ts) — 업데이트 (18차: 세부 분배 그룹 GroupCalcInput/GroupShareBreakdown/toGroupCalcInputs + leftover 배열)
- [packages/api-contract/src/settlement.drink-kinds.ts](../../packages/api-contract/src/settlement.drink-kinds.ts) — **신규 (18차)** 술·음료 사전 (zod 아님 — 순수 데이터/함수)
- [packages/api-contract/src/schemas/common.ts](../../packages/api-contract/src/schemas/common.ts)
- [packages/api-contract/src/schemas/auth.ts](../../packages/api-contract/src/schemas/auth.ts)
- [packages/api-contract/src/schemas/user.ts](../../packages/api-contract/src/schemas/user.ts)
- [packages/api-contract/src/schemas/picks.ts](../../packages/api-contract/src/schemas/picks.ts)
- [packages/api-contract/src/schemas/admin.ts](../../packages/api-contract/src/schemas/admin.ts)
- [packages/api-contract/src/schemas/crawl.ts](../../packages/api-contract/src/schemas/crawl.ts) — 업데이트 (**19차: MenuGroup/MenuGroupItem + NaverPlaceData.menuGroups**; 18차: 테이블링 패밀리)
- [packages/api-contract/src/schemas/restaurant.ts](../../packages/api-contract/src/schemas/restaurant.ts) — 업데이트 (**2026-08-17: RestaurantListQuery.q + reviewsFirstPage 방문일 정렬 계약**; **19차: RestaurantPublicDetail.menuGroups optional**; 18차: RegionStats* + PublicSourceTabling/PublicTablingAddon + PublicStoredReviewCount)
- [packages/api-contract/src/schemas/canonical.ts](../../packages/api-contract/src/schemas/canonical.ts)
- [packages/api-contract/src/schemas/menu-grouping.ts](../../packages/api-contract/src/schemas/menu-grouping.ts)
- [packages/api-contract/src/schemas/auto-discover.ts](../../packages/api-contract/src/schemas/auto-discover.ts) — awaiting_confirmation phase + jobConfirm
- [packages/api-contract/src/schemas/analytics.ts](../../packages/api-contract/src/schemas/analytics.ts) — CategoryTreeNode 가 restaurant.ts 에 재사용됨(17차)
- [packages/api-contract/src/schemas/schedule.ts](../../packages/api-contract/src/schemas/schedule.ts) — 주기 자동 실행 12 export, cron 검증은 croner(서버) 위임
- [packages/api-contract/src/schemas/random-crawl.ts](../../packages/api-contract/src/schemas/random-crawl.ts) — **신규 (18차)** 텔레그램 기반 자동 발굴, 비동기 상태머신(awaiting_selection)
- [packages/api-contract/src/schemas/ai.ts](../../packages/api-contract/src/schemas/ai.ts) — 업데이트 (**2026-09-02~06: LlmProviderPurpose 8종(tarot/saju/saju-g)**; 2026-08-22: 5종(meal-photo/meal-recommend); 18차: purpose=log-analysis + LlmKeySource/LlmModelSource + LLM 텔레메트리)
- [packages/api-contract/src/schemas/review-search.ts](../../packages/api-contract/src/schemas/review-search.ts) — **신규 (18차)** 리뷰 RAG/문맥검색 (enrich + ask + 공개 QA)
- [packages/api-contract/src/schemas/review-clustering.ts](../../packages/api-contract/src/schemas/review-clustering.ts) — **신규 (18차)** 임베딩 군집화(HDBSCAN+c-TF-IDF), 공개 읽기 전용
- [packages/api-contract/src/schemas/logs.ts](../../packages/api-contract/src/schemas/logs.ts) — 업데이트 (**2026-08-22: OperationFeature 12종**) · **신규 (18차)** 범용 작업 로그 + 실패 LLM 분석, AiErrorCode.options 스프레드
- [packages/api-contract/src/schemas/settings-map.ts](../../packages/api-contract/src/schemas/settings-map.ts)
- [packages/api-contract/src/schemas/telegram-settings.ts](../../packages/api-contract/src/schemas/telegram-settings.ts) — **신규 (18차)** 텔레그램 봇 설정 (DB 우선 + .env fallback)
- [packages/api-contract/src/schemas/bus.ts](../../packages/api-contract/src/schemas/bus.ts) — **신규 (19차)** 서울시 버스 (검색·도착·위치·주변·노선 상세, WGS84 zod 범위 강제)
- [packages/api-contract/src/schemas/bus-favorite.ts](../../packages/api-contract/src/schemas/bus-favorite.ts) — **신규 (19차)** 버스 즐겨찾기 (정류장/조합, 스냅샷 + 게스트→서버 union sync)
- [packages/api-contract/src/schemas/subway.ts](../../packages/api-contract/src/schemas/subway.ts) / [subway-favorite.ts](../../packages/api-contract/src/schemas/subway-favorite.ts) — 2026-07-07 수도권 전철 + 즐겨찾기
- [packages/api-contract/src/schemas/restaurant-favorite.ts](../../packages/api-contract/src/schemas/restaurant-favorite.ts) / [vote.ts](../../packages/api-contract/src/schemas/vote.ts) / [bulk-job.ts](../../packages/api-contract/src/schemas/bulk-job.ts) — 2026-07-13~08-16 맛집 즐겨찾기 · 그룹 투표 · SSE 일괄 잡 팩토리
- [packages/api-contract/src/schemas/air-quality.ts](../../packages/api-contract/src/schemas/air-quality.ts) — **신규 (2026-08-21)** 에어코리아 대기정보 + 측정소정보 + 내 대기 위치 (fetchedAt/stale, 등급 리터럴 union)
- [packages/api-contract/src/schemas/weather.ts](../../packages/api-contract/src/schemas/weather.ts) — **신규 (2026-08-21)** 기상청 단기·중기 + API허브 AWS (base/fallback/stale, WeatherPrecip 범주 정규화)
- [packages/api-contract/src/schemas/life-map.ts](../../packages/api-contract/src/schemas/life-map.ts) — **신규 (2026-08-21, 병의원 08-30)** 일상지도 (points|cells, discriminatedUnion('layer'), VWorld 검색, 적재 상태)
- [packages/api-contract/src/schemas/allergen.ts](../../packages/api-contract/src/schemas/allergen.ts) — **신규 (2026-08-24)** 알레르겐 19종 enum + 라벨 + FoodAllergenStatus (food/meal 공유)
- [packages/api-contract/src/schemas/food.ts](../../packages/api-contract/src/schemas/food.ts) — 업데이트 (**2026-09-02: FoodSource 8종(mfds-raw/curated) + FoodItem.kcalPer100g**, `0d2584a`·`bcfc72b`) · 신규 (2026-08-22) 음식 카탈로그 — 분류 enum 3종·FoodItem·검색/역검색·어드민 CRUD/충돌 큐/인식 품질·적재 잡 5-키 골격
- [packages/api-contract/src/schemas/menu-nutrition.ts](../../packages/api-contract/src/schemas/menu-nutrition.ts) — **신규 (2026-09-02~03, `ac0e191`→`9e09950`)** 공개 식당 메뉴 칼로리 — basis 4·matchedBy 10·세트 parts·portion·llmPending, 메뉴명 문자열 join
- [packages/api-contract/src/schemas/menu-lexicon.ts](../../packages/api-contract/src/schemas/menu-lexicon.ts) — **신규 (2026-09-03, `fb12027`)** 칼로리 엔진 어휘(어드민 편집) — MenuLexiconKind 10종 + target 필수 종류 상수
- [packages/api-contract/src/schemas/meal.ts](../../packages/api-contract/src/schemas/meal.ts) — **신규 (2026-08-22~23)** 식단 관리 1,041줄 — .strict 스냅샷·opaque 커서·확인 리터럴·백업 상한 상수
- [packages/api-contract/src/schemas/housing.ts](../../packages/api-contract/src/schemas/housing.ts) — **신규 (2026-08-30, `254fb76`)** 집값 — 실거래가·단지·공시가격·K-apt·건축물대장 공개 조회, life-map 골격 + dealType×band 축 스프레드, latest→fallback→official 배지 폴백
- [packages/api-contract/src/schemas/tarot.ts](../../packages/api-contract/src/schemas/tarot.ts) — **신규 (2026-09-03, `cd5a29b`·`98df15a`·`5d0c4c7`)** 타로 — 공개 리딩(X-Guest-Key)·회원 기록·공유(게스트 입력 재전송)·메뉴 타로. enum 은 utils 와 동일(테스트 검증)
- [packages/api-contract/src/schemas/usage-quota.ts](../../packages/api-contract/src/schemas/usage-quota.ts) — **신규 (2026-09-03, `cd5a29b`; feature 확장 `f8e5dd0`·`e40b4c0`)** 공용 사용량 한도 — UsageQuotaFeature 3종 × 게스트/IP/전역 일일 + IP 분당 + guestCutoffPct, 0=무제한
- [packages/api-contract/src/schemas/saju.ts](../../packages/api-contract/src/schemas/saju.ts) — **신규 (2026-09-06, `f8e5dd0`·`7358c86`·`1c60ad8`·`8ffedb9`·`e40b4c0`)** 사주(C) 485줄 — 입력·원국 스냅샷·섹션 4 병렬 job + long-poll·오늘·궁합·택일·오행 음식·프로필·기록·공유. tarot.ts 의 헤더 상수 import
- [packages/api-contract/src/schemas/saju-g.ts](../../packages/api-contract/src/schemas/saju-g.ts) — **신규 (2026-09-06~07, `e40b4c0`·`82ab04a`)** 사주(G) — 문자열 날짜 입력 + superRefine, LLM 보고서 길이 상한, receipt·revision, 궁합, 상징만 공유(토큰 10|32자 + revokeToken)
- [apps/friendly/src/modules/tarot/tarot.test.ts](../../apps/friendly/src/modules/tarot/tarot.test.ts) / [apps/friendly/src/modules/saju/saju.test.ts](../../apps/friendly/src/modules/saju/saju.test.ts) — 외부(friendly): `TarotSpreadId/TarotTopic/SajuTenGod/SajuStarId.options` ↔ utils 상수 동일성 검증
- [apps/friendly/src/modules/housing/housing.route.ts](../../apps/friendly/src/modules/housing/housing.route.ts) — 외부(friendly): `decodeURIComponent(Routes.Housing.complex(':id'))` 등록 패턴
- [docs/PLAN-tarot.md](../../docs/PLAN-tarot.md) — 사용자 결정(2026-09-02: 로그인 없이 무료·공용 익명 한도·회원 면제·어드민 설정), 게스트 키·usage quota 용어, 한도 기본값
- [docs/PLAN-saju.md](../../docs/PLAN-saju.md) — 결정 4(섹션 병렬 + long-poll, SSE 는 v2), 위치 표(`/saju-c`·"사주(C)"), API 표(410), 2026-09-06 진행 기록(경로 이관·1차 계약)
- [packages/utils/src/foodTaxonomy.ts](../../packages/utils/src/foodTaxonomy.ts) / [reviewDate.ts](../../packages/utils/src/reviewDate.ts) — 외부(utils): 분류 라벨(키 순서 동일성 테스트) · compareReviewRecencyDesc(reviewsFirstPage 정렬 구현)
- [packages/api-contract/src/schemas/settlement-extraction.ts](../../packages/api-contract/src/schemas/settlement-extraction.ts) — ExtractReceiptSplit + roundIndex/roundTotal
- [packages/api-contract/src/schemas/settlement.ts](../../packages/api-contract/src/schemas/settlement.ts) — 업데이트 (18차: 세부 분배 그룹 SettlementItemGroup/GroupMember/GroupSplitMode + categoryAdjustments leftover 배열)
- [packages/api-contract/src/schemas/settlement-contact.ts](../../packages/api-contract/src/schemas/settlement-contact.ts)
- [packages/api-contract/src/schemas/settlement-draft.ts](../../packages/api-contract/src/schemas/settlement-draft.ts)
- [CLAUDE.md](../../CLAUDE.md) — "공유 스키마는 `@repo/api-contract` 에 추가" 규칙
