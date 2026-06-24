# niney-life-pickr-v2 Knowledge Base

Last compiled: 2026-06-25
Total topics: 22 | Total concepts: 13 | Mode: codebase

선택을 대신 골라주는 서비스 — pnpm + Turborepo 모노레포(Fastify API + Vite 웹 + Expo 앱)의 컴파일된 위키. 처음 본다면 [project-overview](topics/project-overview.md) → 관심 토픽 순서로 읽는 것을 권장. 공개 페이지(`/`, `/restaurants`, `/r/:placeId` 공유)·정산하기·어드민 운영 도구가 한 SPA 안에 분리되어 있고, 18차 라운드에 **리뷰 RAG 문맥검색·군집화·텔레그램 봇 자동 발굴·범용 작업 로그**가 신규로 들어왔다.

> **용어**: 이 위키는 **웹**(`apps/web`) / **앱**(`apps/mobile`) / **모바일**(=웹의 작은 화면)을 구분해서 쓴다. 슬러그·디렉터리·스크립트 식별자는 `mobile`/`web` 그대로. 자세한 규칙은 [schema.md Terminology](schema.md#terminology--웹--앱--모바일).

## Topics

| Topic | Also Known As | Sources | Last Updated | Status |
|-------|--------------|---------|-------------|--------|
| [project-overview](topics/project-overview.md) | monorepo, life-pickr, niney, root, turbo, pnpm-workspace, 공개-어드민-분리, settlement, 정산, share-token, ssr-lite, review-search, rag, review-clustering, random-crawl, telegram-bot, operation-log, tabling, db-config-env-fallback, llm-telemetry, region-stats, dark-mode, schedule, taxonomy-v3, deploy-sh, ninelife-kr | 52 | 2026-06-25 | active |
| [friendly](topics/friendly.md) | fastify-api, backend, prisma-server, jwt-auth, restaurant-module, media-module, panorama-cache, restaurant-preview, sitemap, region-derive, smart-pick, canonical-members, settlement-modules, well-known, schedule-module, review-search-module, review-clustering-module, random-crawl-module, telegram-module, logs-module, operation-log, plugins-singleton, cors-reflect, tabling-fusion | 113 | 2026-06-25 | active |
| [settlement](topics/settlement.md) | 정산, 정산하기, settlement, receipt-split, 영수증 추출, 단골, contact, share token, rounds, N차, settlement-draft, multi-receipt, group-split, 세부분배, 그룹카드, drink-kinds, 술종류, 소주, 맥주, 잔수, glasses, GLASSES, EQUAL, RoundGroupSplitEditor, RoundGroupSplitNote, suggestItemGroups, matchDrinkKind, EXTRACTION_VERSION, leftover-multi, share-preview, og-ssr-lite, settlement-card | 109 | 2026-06-25 | active |
| [crawl](topics/crawl.md) | naver-place, scraping, playwright, sse-jobs, visitor-videos, naver-search, stealth, jitter, catchtable, diningcode, diningcode-bulk-save, tabling, 테이블링, tabling-search, tabling-shop, tabling-sitemap, tabling-place, tabling-bulk-save, naver-review-stats, visitor-review-stats, sse-seq, allocSeq, place-partner-promotion, job-log | 26 | 2026-06-25 | active |
| [ai](topics/ai.md) | llm, ollama, ollama-cloud, llm-provider, ai-keys, purpose, chat, image, log-analysis, EXTRACTION_VERSION, models-preview, concurrency-gate, account-gate, AccountGateRegistry, ConcurrencyGate, llm-telemetry, telemetry, telemetryStream, LlmUsagePanel, AdminAiUsagePage, useLlmTelemetry, adapter-cache, keySource, defaultModelSource, db-config-env-fallback, aiModel, recommendModelForPurpose, isVisionModel | 37 | 2026-06-25 | active |
| [review-search](topics/review-search.md) | rag, 리뷰-문맥검색, retrieval, embedding, bge-m3, BM25, RRF, hybrid-search, rerank, hallucination-guardrail, enrich, ENRICH_VERSION, Ask-탭, AskTab, 공개-QA, publicAsk, reviewAskStore, ReviewSummary-embeddingJson, HyDE, faithfulness, citations, confidence, verification, span-grounding | 18 | 2026-06-25 | active |
| [review-clustering](topics/review-clustering.md) | review-clustering, 리뷰-군집화, 리뷰-주제, cluster-topics, ClusterTopics, UMAP, HDBSCAN, c-TF-IDF, BERTopic, cluster_compute, python-사이드카, ReviewClusteringService, review_clusters, ReviewCluster, clusterId, CLUSTERING_VERSION, aspect-극성-주입, neg-recall, min_cluster_size, corpusSize, 재군집-게이트, 관점집계-폴백, canonical-통합-코퍼스, ensureClusteredByPlaceId | 24 | 2026-06-25 | active |
| [random-crawl](topics/random-crawl.md) | random-crawl, 맛집-자동-발굴, discover, /discover, 지역-랜덤-발굴, awaiting_selection, timeout-action, randomCrawlRegistry, RandomCrawlConfig, RandomCrawlRun, regions, regions.json, build-regions, 사람이-끼는-2단계, run-events | 20 | 2026-06-25 | active |
| [telegram](topics/telegram.md) | telegram, telegram-bot, long-polling-bot, getUpdates, force-reply, inline-keyboard, callback-query, discover-command, search-command, stats-command, region-stats-telegram, telegram-config, telegram-settings, reconfigure-bot, resolve-chat-id, chat-id-discovery, db-config-env-fallback, crawl-progress-edit, in-place-edit-race, token-masking | 16 | 2026-06-25 | active |
| [logs](topics/logs.md) | logs, operation-log, operation-run, operation-report, log-analysis, failure-report, retention, log-retention, OperationLogService, LogAnalysisService, run-instrumentation, log-config, parentRunId, allocSeq, crawl-job-log-legacy, AdminLogsPage, AdminLogRunDetailPage, AdminLogSettingsPage | 16 | 2026-06-25 | active |
| [schedule](topics/schedule.md) | schedule, scheduler, cron, croner, normalize-merge, 정규화-머지, 주기-자동-실행, ScheduleConfig, ScheduleRun, scheduleRegistry, schedule-sse, overlap-skip, single-inflight, bootstrap-interrupted, MAX_TARGETS_PER_RUN, operation-log-dual, parentRunId | 13 | 2026-06-25 | active |
| [analytics](topics/analytics.md) | global-menu-merge, categoryPath, category-tree, buildCategoryTree, GLOBAL_MERGE_VERSION, taxonomy-v3, 재료-메뉴군, callChunksPooled, MERGE_POOL_SIZE, 청크-캐시, GlobalMenuMergeChunkCache, OOM, LINK_INSERT_BATCH, mergeInflight, 청크-재시도, snapshot-global-merge, mappings-array, ollama-grammar, chunk-10 | 16 | 2026-06-25 | active |
| [menu-grouping](topics/menu-grouping.md) | menu-canonical, restaurant-menu-normalization, menusGroup, menusRanking, grouping-job, MENU_GROUPING_VERSION, split-merge-redesign, parse_failed, packBySimilarity, pickCanonicalName, union-find, 인덱스-배열-출력, unmappedMenus | 11 | 2026-06-25 | active |
| [map](topics/map.md) | vworld, openlayers, wmts, map-canvas, public-restaurants-map, MapProviderConfig, webview-vworld, marker-fly, dark-layer, midnight-tile, satellite-layer, MapLayerControl, MyLocationButton, choropleth, sigungu-geo, region-stats-map, RegionStatsMap, point-in-polygon, vworld-tile-probe, selected-marker-zindex | 26 | 2026-06-25 | active |
| [web](topics/web.md) | vite, react, web-app, public-page, restaurants-page, admin-console, settlement, AskTab, review-qa, ReviewAskToaster, ResummarizeToaster, sonner, ClusterTopics, ModelPickerPopup, AdminReviewSearchPage, rag-ops, AdminLogsPage, log-retention, AdminTablingPage, AdminTelegramPage, LlmUsagePanel, llm-telemetry, RegionStatsPanel, RegionStatsMap, choropleth, RandomCrawlSection, share-url-r, seo-preview, RoundGroupSplitEditor, dark-mode, lightbox-portal, route-code-splitting | 116 | 2026-06-25 | active |
| [mobile](topics/mobile.md) | expo, react-native, expo-router, eas, native-tabs, dev-client, webview-map, settlement-mobile, SettlementWizard, RoundGroupSplitEditor, RoundGroupSplitNote, group-split, AskTab, review-qa, useReviewAskStore, ReviewAskBanner, ask-tab-deep-link, ClusterTopics, useRestaurantClusters, s-token-route, settle-short-url, panorama-copy-absolutize, deep-link, dark-mode, themeStore, android-custom-tabbar, awesome-gallery, useTabBarHeight, thumbUrl | 62 | 2026-06-25 | active |
| [api-contract](topics/api-contract.md) | zod, schemas, ssot, contracts, @repo/api-contract, restaurant-schemas, canonical-schemas, tabling, settlement-schemas, settlement-draft, settlement-rounds, group-split, drink-kinds, calculateMultiRoundShares, review-search, review-clustering, random-crawl, logs, telegram-settings, llm-telemetry, LlmProviderPurpose, log-analysis-purpose, region-stats, smart-pick, ShareOgImage, Routes-ReviewSearch, Routes-Logs | 31 | 2026-06-25 | active |
| [shared](topics/shared.md) | react-query, zustand, design-tokens, ui-primitives, @repo/shared, useRestaurantsPublic, summary-sse-manager, useReviewSearch, reviewAskStore, useReviewClusters, useRandomCrawl, useLogs, useLlmTelemetry, useTelegramSettings, resummarizeStore, activeTablingBulkSaveJobStore, groupSuggestion, settlementDraftStore, settlement-draft-v6, cross-tab-job-toast, async-public-ask, scheduleApi, useSchedule | 66 | 2026-06-25 | active |
| [canonical](topics/canonical.md) | canonical-restaurant, canonical-merge, canonical-split, canonical-proposal, MergeProposalQueue, CanonicalMergePanel, ProposalService, matching-score, bigram-jaccard, haversine, cross-source-merge, canonicalId, auto-merge-c, restaurant-merge, fused-detail, tabling-merge, place-partner-promote, canonical-members, four-source | 21 | 2026-06-25 | active |
| [auto-discover](topics/auto-discover.md) | auto-discover, admin-auto-discover, automated-discovery, AI-keyword-generation, AUTO_DISCOVER_PROMPT_VERSION, fallback-keywords, per-actor-1-job, group-of-5, AutoDiscoverForm, AutoDiscoverJobCard, AutoDiscoverRegistry, useAutoDiscoverJob, 순차-큐, 후보-확인 | 12 | 2026-05-17 | active |
| [utils](topics/utils.md) | @repo/utils, pure-functions, helpers, slugify, pick-random, thumbnail-url, geo, bbox, restaurantCategory, formatWonPrice, 원화, 카테고리매핑, buildRestaurantMarkerSvg, aiModel, parseModelFamily, groupModelsByFamily, recommendModelForPurpose, isVisionModel, model-family | 9 | 2026-06-25 | active |
| [config](topics/config.md) | @repo/config, tsconfig, eslint, code-style, eslint-base, flat-config, lint-ssot, react-compiler-rules, turbo-lint, no-undef-off | 13 | 2026-06-01 | active |

## Concepts

| Concept | Connects | Last Updated |
|---------|----------|-------------|
| [zod-ssot-buildless](concepts/zod-ssot-buildless.md) | api-contract, friendly, shared, web, mobile, utils, ai, menu-grouping, analytics, map, auto-discover, settlement, schedule, review-search, review-clustering, random-crawl, logs, telegram | 2026-06-25 |
| [public-admin-route-split](concepts/public-admin-route-split.md) | friendly, api-contract, shared, web, map, settlement, review-search, review-clustering, logs | 2026-06-25 |
| [sse-token-auth](concepts/sse-token-auth.md) | friendly, crawl, shared, web, menu-grouping, analytics, auto-discover, schedule, review-search, random-crawl, ai | 2026-06-25 |
| [platform-ui-split](concepts/platform-ui-split.md) | shared, web, mobile, utils, map, settlement, review-search, review-clustering | 2026-06-25 |
| [workspace-package-resolution](concepts/workspace-package-resolution.md) | api-contract, friendly, shared, web, review-search, review-clustering | 2026-06-25 |
| [stream-driven-cache-merge](concepts/stream-driven-cache-merge.md) | crawl, friendly, shared, web, menu-grouping, analytics, auto-discover, schedule, review-search, random-crawl, ai, logs | 2026-06-25 |
| [in-memory-singleton-gates](concepts/in-memory-singleton-gates.md) | ai, crawl, friendly, shared, menu-grouping, analytics, canonical, auto-discover, settlement, schedule, review-search, review-clustering, random-crawl, logs, telegram | 2026-06-25 |
| [versioned-llm-prompts](concepts/versioned-llm-prompts.md) | ai, friendly, menu-grouping, analytics, auto-discover, settlement, review-search, review-clustering, logs | 2026-06-25 |
| [db-config-env-fallback](concepts/db-config-env-fallback.md) | ai, map, telegram, friendly | 2026-06-25 |
| [operation-log-instrumentation](concepts/operation-log-instrumentation.md) | logs, friendly, crawl, schedule, analytics, menu-grouping, random-crawl, auto-discover, ai | 2026-06-25 |
| [canonical-corpus-fanout](concepts/canonical-corpus-fanout.md) | canonical, review-search, review-clustering, friendly | 2026-06-25 |
| [cross-tab-async-job-toast](concepts/cross-tab-async-job-toast.md) | shared, web, mobile, review-search | 2026-06-25 |
| [ssr-lite-head-injection](concepts/ssr-lite-head-injection.md) | friendly, settlement, web | 2026-06-25 |

## How to navigate

- **새 작업 시작** → [project-overview](topics/project-overview.md)에서 디렉터리 지도와 워크플로 파악
- **리뷰 RAG / 문맥검색 / "이 식당 ~ 어때?" QA** → [review-search](topics/review-search.md) (enrich→하이브리드 회수→리랭크→RAG→검증) → [shared](topics/shared.md) `reviewAskStore`/`useReviewSearch` → [web](topics/web.md)/[mobile](topics/mobile.md) `AskTab`. 임베딩은 로컬 Ollama bge-m3 필요
- **리뷰 주제 군집(분석 탭 "리뷰 주제")** → [review-clustering](topics/review-clustering.md) — **Python 런타임 필요**(`cluster_compute.py`, 설치는 `docs/deploy-friendly.md`). 전부 노이즈면 관점집계 폴백
- **맛집 자동 발굴 / 텔레그램 봇** → [random-crawl](topics/random-crawl.md)(cron 지역 발굴 → 텔레그램 후보 선택) ↔ [telegram](topics/telegram.md)(`/search`·`/discover`·`/stats` + 알림 + 설정)
- **작업 로그 / 실패 원인 분석** (`/admin/logs`) → [logs](topics/logs.md) (operation-log + LLM 자동분석 + 보존) → 횡단 패턴은 [operation-log-instrumentation](concepts/operation-log-instrumentation.md)
- **LLM 사용량 / 동시성 한도 / 키 관리** → [ai](topics/ai.md) (계정 단위 2단 게이트 + 텔레메트리 SSE + 용도별 모델). 외부 설정 폴백 패턴은 [db-config-env-fallback](concepts/db-config-env-fallback.md)
- **정산하기** (N차 + 세부 분배 잔수 + 공유) → [settlement](topics/settlement.md) (도메인 전체 — rounds·extraction·group-split·share·draft). 앱 풀구현은 [mobile](topics/mobile.md)
- **공유 링크 미리보기 / SEO** (`/share/settlements/:token`, `/r/:placeId`, sitemap) → [ssr-lite-head-injection](concepts/ssr-lite-head-injection.md) → [friendly](topics/friendly.md) share-preview/restaurant-preview
- **백엔드 작업** → [friendly](topics/friendly.md), 크롤이면 [crawl](topics/crawl.md)(네이버/DC/캐치테이블/**테이블링**), LLM 이면 [ai](topics/ai.md), 지도 키면 [map](topics/map.md)
- **출처 가로지르기 같은 가게 묶기** → [canonical](topics/canonical.md) (4소스 — 테이블링 합류 + place↔partner 승격). 분석이 멤버 전체에 fan-out 하는 패턴은 [canonical-corpus-fanout](concepts/canonical-corpus-fanout.md)
- **지역 통계 / choropleth 지도** → [web](topics/web.md) `RegionStatsPanel`/`RegionStatsMap`(시군구 색칠) → [map](topics/map.md) point-in-polygon → [friendly](topics/friendly.md) region-derive → [telegram](topics/telegram.md) `/stats`
- **메뉴 분석 도메인** → [menu-grouping](topics/menu-grouping.md)(v2 분할·머지 재설계, parse_failed 해소) → [analytics](topics/analytics.md)(택소노미 v3 + 청크 병렬·캐시·OOM 수정)
- **주기 자동 실행 / 스케줄러** → [schedule](topics/schedule.md) (croner in-process, operation-log 이중 기록)
- **다크 모드 / 테마** → [platform-ui-split](concepts/platform-ui-split.md) → [mobile](topics/mobile.md) `themeStore` · [web](topics/web.md) tailwind dark · [map](topics/map.md) `MapLayerControl`
- **비동기 잡 완료 토스트(탭 가로질러)** → [cross-tab-async-job-toast](concepts/cross-tab-async-job-toast.md) — `reviewAskStore`/`resummarizeStore` + App 루트 watcher
- **공개 사용자 페이지** (`/`, `/restaurants`) → [web](topics/web.md) → [shared](topics/shared.md) → [friendly](topics/friendly.md) → [map](topics/map.md)
- **웹/앱 변경** → [web](topics/web.md) 또는 [mobile](topics/mobile.md), 로직 공유 시 [shared](topics/shared.md)
- **스키마 추가** → [api-contract](topics/api-contract.md) (반드시 여기에 zod 로 — CLAUDE.md 규칙). 권한 페어 분리는 [public-admin-route-split](concepts/public-admin-route-split.md)
- **LLM 프롬프트/스키마 변경** → [versioned-llm-prompts](concepts/versioned-llm-prompts.md) (`ANALYSIS/MENU_GROUPING/GLOBAL_MERGE/EXTRACTION/ENRICH/CLUSTERING_VERSION`)
- **`@repo/*` import 에러로 막힐 때** → [workspace-package-resolution](concepts/workspace-package-resolution.md)
- **SSE/캐시 머지 패턴** → [stream-driven-cache-merge](concepts/stream-driven-cache-merge.md), 동시성 제어는 [in-memory-singleton-gates](concepts/in-memory-singleton-gates.md)
- **횡단 패턴** → [concepts/](concepts/) 디렉터리 (13개)

## Recent Changes

- **2026-06-25 (18th compile)**: **위키 역대 가장 큰 라운드(~70커밋·19일) — 리뷰 지능화 + 운영 자동화 + 4번째 출처 + LLM 게이트/텔레메트리 + 정산 세부 분배 + 맛집 공유/SEO.** 신규 토픽 5개: [review-search](topics/review-search.md)(RAG 문맥검색 — bge-m3 enrich → BM25⊕dense RRF → LLM 리랭크 → RAG → 검증 가드레일), [review-clustering](topics/review-clustering.md)(UMAP→HDBSCAN→c-TF-IDF→LLM 라벨, **Python 사이드카**, canonical 통합 코퍼스), [random-crawl](topics/random-crawl.md)(cron 지역 발굴→텔레그램 후보 선택→크롤, 사람이 끼는 2단계), [telegram](topics/telegram.md)(long-polling 봇 `/search`·`/discover`·`/stats` + 알림 + 설정), [logs](topics/logs.md)(전 기능 횡단 operation-log + 실패 LLM 분석 + 보존). 신규 컨셉 5개: [db-config-env-fallback](concepts/db-config-env-fallback.md)(ai/map/telegram 설정 동형), [operation-log-instrumentation](concepts/operation-log-instrumentation.md)(8+ 도메인 횡단 계측), [canonical-corpus-fanout](concepts/canonical-corpus-fanout.md)(분석이 canonical 멤버 다소스 행 fan-out), [cross-tab-async-job-toast](concepts/cross-tab-async-job-toast.md)(전역 store 가 잡 수명을 UI 수명에서 분리), [ssr-lite-head-injection](concepts/ssr-lite-head-injection.md)(정산+맛집 공유 OG/SEO head 주입 — 16차 보류 후보 추출). 갱신 토픽 11개: [crawl](topics/crawl.md)(17→26 테이블링 4어댑터 + SSE seq 단일화), [ai](topics/ai.md)(25→37 계정 2단 게이트 + 텔레메트리 SSE + 키 1계정 공유·용도별 모델), [settlement](topics/settlement.md)(103→109 세부 분배 잔수 + drink-kinds + EXTRACTION_VERSION 3→4), [analytics](topics/analytics.md)(13→16 청크 병렬·캐시·OOM), [menu-grouping](topics/menu-grouping.md)(9→11 v2 분할·머지 재설계 parse_failed 해소), [friendly](topics/friendly.md)(99→113), [canonical](topics/canonical.md)(19→21 테이블링 4소스 + place↔partner 승격), [map](topics/map.md)(24→26 choropleth + 타일 probe), [api-contract](topics/api-contract.md)(25→31), [shared](topics/shared.md)(54→66), [web](topics/web.md)(98→116)/[mobile](topics/mobile.md)(56→62). 기존 컨셉 8개에 신규 인스턴스. 토픽 17→22, 컨셉 8→13. 모든 토픽 문서를 병렬 서브에이전트로 컴파일.
- **2026-06-06 (17th compile)**: 주기 자동 실행 스케줄러([schedule](topics/schedule.md)) 신규 + 카테고리 택소노미 v3(재료·메뉴군) + 웹/앱 다크 모드 + 앱 안드로이드 커스텀 탭바. 갱신 토픽 8개. 기존 컨셉 6개 신규 인스턴스.
- **2026-06-01 (16th compile)**: 정산 공유 OG SSR-lite(미리보기 + 정산표 PNG) + 전방위 perf + ESLint 인프라 전면 연결. 갱신 토픽 9개.
- **2026-05-31 (15th compile)**: dev CORS 전면 반사 + 앱 맛집 상세 UX(가상화 리뷰·핀치줌) + 웹 라이트박스 portal fix. 갱신 토픽 6개.
- **2026-05-28 (14th compile)**: 정산 N차(차수) 모델 재설계 + 서버 draft 자동저장 + 모바일 정산 풀구현 + Universal/App Links. 갱신 토픽 8개.
- **2026-05-25 (13th compile)**: 정산(settlement) 도메인 신규 + AI purpose 분리 + 공유 토큰 비인증 read. 신규 토픽 1개.
- **2026-05-19 (12th compile)**: 잡 로그 시스템 + 요약 6 상태 + 모바일 v2 리빌드. 갱신 토픽 9개.
- **2026-05-17 (11th compile)**: 어드민 맛집 자동 발견([auto-discover](topics/auto-discover.md)) + canonical 자동 DC 머지. 신규 토픽 1개.
- **2026-05-15 (10th compile)**: 다이닝코드/캐치테이블 출처 + canonical 그룹핑([canonical](topics/canonical.md)). 신규 토픽 1개.
- **2026-05-09**: 공개 사용자 페이지 + vworld 지도([map](topics/map.md)) + 메뉴 분석([menu-grouping](topics/menu-grouping.md)/[analytics](topics/analytics.md)).
- **2026-05-07**: 초기 9개 토픽 + 3개 컨셉 생성, 맛집 도메인·ai 통합.
