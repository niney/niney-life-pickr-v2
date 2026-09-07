---
topic: project-overview
last_compiled: 2026-09-07
sources_count: 128
status: active
aliases: [monorepo, life-pickr, niney, root, turbo, pnpm-workspace, tarot, 타로, tarot-reading, menu-tarot, saju-c, 사주(C), saju, saju-g, 사주(G), two-implementations-c-g, 사주-두-구현, housing, 집값, 실거래가, RTMS, K-apt, 공시가격, usage-quota, 사용량-한도, anonymous-quota, guest-key, X-Guest-Key, resolveOptionalUser, embed-mode, webview-embed, embedBridge, lp:embed, webUrl, EXPO_PUBLIC_WEB_URL, DATA_GO_KR_API_KEY, data-go-kr-key-unified, HOUSING_REFRESH_CRON, deploy-case-8, ops-nginx, nginx-try-files, spa-directory-conflict, absolute_redirect, OLLAMA_TAROT_MODEL, OLLAMA_SAJU_MODEL, OLLAMA_SAJU_G_MODEL, kimi-k3, three-vendor-chunk, R3F, satori-share-image, web-index, share-fonts, saju-glyphs, assets-src, useSchemaDatabase, menu-calorie, kcalPer100g, menu-lexicon, menu-nutrition, admin-quotas, air-quality, 대기질, airkorea, 에어코리아, weather, 날씨, kma, 기상청, kma-apihub, API허브, life-map, 일상지도, cctv, public-toilet, 공중화장실, hospital, 병의원, hira, 심평원, food-catalog, 음식-카탈로그, meal, 식단, meal-recognition, meal-recommend, data-open, data-sources, open-data-raw, 공공데이터-원본, loader-default-path, deploy-case-6, deploy-case-7, status-script, life-map-status, food-catalog-status, geocode-cache-gz, data-go-kr-key-fallback, BUS_API_KEY-fallback, 활용신청, useIsolatedDatabase, test-isolation, prebuilt-rncore, ios-link-error, mobile-ios-build, personal-team-entitlements, aps-environment, hermes-sharedarraybuffer, metro-monorepo-default, expo-document-picker, topbar-width-budget, account-menu, sidebar-account, my-location-chip, sheet-pattern, useMapSheets, useIsDesktopXl, wiki-sync, settlement, 정산, settlement-domain, share-token, public-share-read, ai-purpose, vision-llm, receipt-extraction, contacts-page, settlement-stepper, edited-badge, admin-discover, admin-auto-discover, panel-side-toggle, batch-crawl, naver-search-results, panelPrefsStore, captcha-aware-capture, mobile-ux, body-scroll, sticky-containing-block, terminology, web-mobile-app, expo-web, diningcode, catchtable, tabling, 테이블링, canonical-restaurant, multi-source, four-source, auto-dc-merge, place-partner-promotion, sse-heartbeat, stale-summary-cleanup, crawl-job-log, operation-log, operation-run, log-analysis, log-retention, summary-queued-cancelled, summary-resume, app-level-singleton-plugin, mobile-native-tabs, dev-client, webview-vworld, location-first-entry, public-reviews-pagination, naver-stealth, db-path-unified, mobile-production-build, settlement-rounds, settlement-group-split, drink-kinds, glasses-split, settlement-draft-auto-save, universal-links-iOS, app-links-android, well-known-AASA, well-known-assetlinks, RFC1918-dev-cors, dev-cors-reflect-all, cors-preflight-fix, expo-web-lan-ip, multi-receipt-split, roundUnit-100-1000, refinement-leftover, ai-models-preview, settlement-PUT-full-replace, items-mutable-after-save, tailwind-v4-dark-fix, deep-link-fallback, share-settlements-deep, settlement-mobile-implementation, attendees-100, items-200, EXTRACTION_VERSION, headerBackTitle-fix, sticky-breakdown-z-30, tab-bar-inset, useTabBarHeight, awesome-gallery, lightbox-portal, home-ranking-link, public-reviews-sort-fix, share-og-ssr, ssr-lite-head-injection, restaurant-share-r, restaurant-seo, sitemap, json-ld, og-image-png, settlement-card-png, share-preview, restaurant-preview, panorama-cache, eslint-infra, turbo-lint, deploy-sh, ninelife-kr, nginx-caret-tilde, cloudflare-purge, vite-codesplitting, route-lazy, react-memo-hotpath, ibmplexsanskr, schedule, schedule-config, schedule-run, croner, normalize-merge-cron, in-process-scheduler, random-crawl, 맛집-자동-발굴, telegram-bot, telegram-discover, telegram-stats, telegram-search, force-reply, review-search, rag, 리뷰-문맥검색, enrich, hybrid-retrieval, review-clustering, 리뷰-군집화, umap, hdbscan, python-sidecar, canonical-corpus, llm-telemetry, concurrency-gate, account-gate, db-config-env-fallback, region-stats, choropleth, sigungu-geo, smart-pick, taxonomy-v3, ingredient-menu-group, GLOBAL_MERGE_VERSION-3, dark-mode, theme-mode, lp-themeMode, vworld-midnight, satellite-layer, android-custom-tabbar, splash-logo-fix, expo-prebuild-cleanup, soft-tonal, menu-thumbnail-lightbox, card-click-map, double-click-zoom, category-tree-shared, categoryPath-recovery, ollama-grammar-array, bus, 버스, bus-stations, bus-arrivals, bus-route, bus-positions, bus-favorite, seoul-bus-api, public-transit]
---

# project-overview — 모노레포 개요

**2026-08-30~09-07 변경 흡수 (25차) — 운세·선택 놀이 축 신설(타로 + 사주 **두 구현**) + 공용 익명 사용량 한도 + 집값 + 메뉴 칼로리 엔진 + 운영 규약(data.go.kr 키 통일·nginx 원본 도입·배포 케이스 8)**: 8일·49커밋·671파일(+62k줄). (1) **로그인 없는 공개 LLM 기능이 처음 생겼다** — 타로 `/tarot`([tarot](tarot.md), `cd5a29b`~`13b87e8`, 2026-09-02~05 운영 배포): 78장 카드 데이터·부채꼴 R3F 3D 무대·Lite 폴백·Ollama Cloud 해석(정적 폴백)·토큰 공유+OG+satori 이미지·회원 기록 `/me/tarot`·메뉴 타로(v3a, `5d0c4c7`). 그 뒤 **사주가 두 구현으로** 나란히 섰다 — **사주(C)** `/saju-c`([saju-c](saju-c.md), `db1415f`~`7358c86`, 2026-09-06~07): utils 엔진(절기·음력 표·명식·십신·신살·대운·궁합·택일·오행 음식) → friendly `modules/saju`(섹션 4개 병렬 LLM job + long-poll) → 천문도 3D 무대 + 풀이 패널 10탭 → 앱 WebView; **사주(G)** `/saju-g`([saju-g](saju-g.md), `1c60ad8`·`8ffedb9`·`e40b4c0`·`82ab04a`, 다른 세션): `modules/saju-g` 별도 엔진(korean-lunar-calendar + lunar-typescript)·출생 프로필·두 사람 궁합·이야기 카드. 경로·명칭·DB 테이블·AI purpose·한도 키를 전부 분리해 **공존**시키는 결정(`5f49026`·`e40b4c0`, [docs/MIGRATION-saju-g.md](../../docs/MIGRATION-saju-g.md)). 셋이 공유하는 뼈대가 **공용 익명 사용량 한도**([usage-quota](usage-quota.md), `modules/usage-quota`, `cd5a29b`·`fae8190`): 게스트 키(`X-Guest-Key`)·IP·전역 일일 카운터 + IP 분당, 회원은 기기·IP 일일 한도 면제, 어드민 `/admin/settings/quotas` — [anonymous-usage-quota](../concepts/anonymous-usage-quota.md). LLM purpose 도 `tarot`/`saju`/`saju-g` 3종이 늘어 8종. (2) **앱은 3D 를 포팅하지 않고 WebView 로 웹을 품는다**(`624ead4`·`0a7f637`) — `app/tarot`·`app/saju-c` 가 `/tarot?embed=1`·`/saju-c?embed=1` 을 열고 shared `embedBridge` 로 토큰·게스트 키·테마를 로드 전에 주입, share/open/title 은 `postMessage` — [embedded-webview-bridge](../concepts/embedded-webview-bridge.md). 웹 `PublicLayout` 은 `?embed=1` 이면 상단바·사이드바 없이 본문만. 3D 는 두 기능 다 [webgl-stage-lite-fallback](../concepts/webgl-stage-lite-fallback.md). (3) **집값 `/housing`**([housing](housing.md), `254fb76`·`168b363`, 2026-08-30~09-02): 한국부동산원 단지 마스터(아파트 45,920단지) + 국토부 실거래가(RTMS 매매·전월세, 시군구×계약년월 장부 `HousingTradeSync`) + 공시가격 zip + K-apt + 건축HUB 를 로컬 적재, 지도 뷰포트 셀 평당가/단지 배지, `HOUSING_REFRESH_CRON` 월 자동 갱신, `deploy.sh` 케이스 **8** + API 배포마다 `housing_data` 자동 점검 — [open-data-master-load](../concepts/open-data-master-load.md) 의 다섯 번째 도메인. (4) **메뉴 칼로리 판정 엔진**([food](food.md), `0d2584a`~`0997a69`, 2026-09-02~03): 음식 마스터 `kcalPer100g`, 메뉴명 3등급 판정 → LLM 매칭·어휘 캐시(`MenuLexicon`·`MenuLlmMatch`) → 웹 실측(fatsecret.kr, `FoodWebEstimate`) → 세트 분해 v3(`MenuLlmDecomposition`), 골든셋 정밀도 99.5%, 웹·앱 메뉴 탭 칼로리 칩(`restaurants/public/:placeId/menu-nutrition`), 썸네일 프록시 리사이즈. (5) **운영 규약** — data.go.kr 키를 `DATA_GO_KR_API_KEY` 하나로 통일(`3d9dfed`, `BUS/AIRKOREA/KMA/HIRA/FOOD_API_KEY` 폐기 → **운영 `.env` 이름 변경 필수**); **운영 nginx 설정 원본 `ops/nginx/niney_life_pickr_v2_projects`**(`35b35fd`)가 리포에 들어와 `^~` 프록시 블록(정산·`/s/`·`/r/`·타로·사주(C)·사주(G)·투표)과 webp 7일 캐시 블록, 그리고 2026-09-05 운영 실측으로 잡은 **SPA 폴백 `$uri/` 디렉터리 충돌**(dist 에 `tarot/cards/` 가 생겨 `/tarot` 직접 진입이 301→403) 수정 `try_files $uri /index.html` + `absolute_redirect off` 를 담는다. `deploy.sh` 의 `set -e` 아래 실패하는 명령 치환이 스크립트를 조용히 죽이던 K-apt 탐지 수정(`b8c08ed`). 이미지 원본(제미나이 PNG)은 `assets-src/{tarot,saju}/raw/` gitignore, webp 산출물(타로 159·사주 45)만 커밋. (6) 규모 — friendly 모듈 34→**39** · api-contract 스키마 36→**43** · Prisma 모델 75→**93** · 마이그레이션 69→**80** · friendly 스크립트 67→**92** · 테스트 파일 184(friendly 123·web 23·shared 13·utils 25·앱 0). 2026-09-07 실측: utils 329 · shared 81 · web 120 green(friendly 전체는 이번에 미실측 — 사주(G) 세션 기록으로 C/G/타로/AI/한도 202). 공개 메뉴 10개(홈·맛집·대중교통·일상지도·집값·날씨·대기질·타로·사주(C)·사주(G) + 로그인 시 식단), 앱은 여전히 탭 4개 + 홈 카드 4장(내 위치·오늘 식단·타로·사주).

**2026-08-17~08-30 변경 흡수 — 공개 생활정보 4종(대기·날씨·일상지도) + 식단 도메인 + 공공데이터 운영 규약 + 앱 빌드 함정 문서화**: 13일·67커밋·417파일(+75k줄)로 18차에 버금가는 큰 라운드. (1) **공개 사용자 표면이 생활정보로 확장** — 에어코리아 대기정보 `/air`([air-quality](air-quality.md), `7340743`~`26947ba`), 기상청 단기·중기예보 `/weather`([weather](weather.md), `37e0db0`·`7704f8c` + API허브 AWS 매분 관측 보강 `17f281a`), 전국 CCTV·공중화장실·병의원 일상지도 `/life-map`([life-map](life-map.md), `1d92acb`·`a21de10`·`4fd6e22`). 상단바 "내 위치" 칩이 날씨·대기 통합 알약으로(`9e197d3`) 10분 주기 조용히 갱신. **로그인 사용자 식단 관리** `/me/meals` + 앱 `meal/*`([meal](meal.md) — 사진 인식·통계·추천·백업, `c5b5fe2`~`0906df3`) 와 그 마스터인 **어드민 음식 카탈로그** `/admin/food`([food](food.md), `102ccdb`·`69dc0e2`·`d53fbe3`·`31c56f7`) — 23차(2026-08-23, 다른 머신)에 이미 토픽화된 것을 이번 풀로 합류. **앱 화면도 같은 폭으로** — 날씨·대기·일상지도 화면 + 홈 내 위치 카드(`e348032`·`563890a`) + 식단 입력/목록/달력/통계(`88751cd`), 앱 탭은 여전히 홈·맛집·대중교통·프로필 4개이고 새 화면은 홈 카드·프로필에서 진입([mobile](mobile.md)). (2) **공공데이터 원본 운영 규약** — 원본 CSV/XLSX/평가셋은 리포 밖 `data/open/{food,life,eval}`(`.gitignore /data/`, `809b7e0`), 로더가 그 경로를 기본으로 찾고, 가공 캐시(지오코딩 `life-geocode-cache.json.gz` 39,181건 1.1MB)만 커밋, `deploy.sh` 가 API 배포(1·2·4)마다 `status:life-map`/`status:food-catalog` 한 줄을 같은 `stat_val` 파서로 읽어 비어 있으면 자동 적재 + 수동 재적재 케이스 6·7 신설(`5a84b63`·`dae1cc9`·`4fd6e22`). 단일 기준 문서 [docs/data-sources.md](../../docs/data-sources.md). 운영 잔여: 화장실 지오코딩이 1일차 78.9%(VWorld 일일 한도)에서 멈춰 2일차 재실행·export·커밋이 미완. (3) **외부 API 키 체계** — data.go.kr 는 계정당 키 1개라 `AIRKOREA_API_KEY`/`KMA_API_KEY`/`HIRA_API_KEY`/`FOOD_API_KEY` 가 비면 `BUS_API_KEY` 로 폴백하되 **데이터셋별 활용신청**이 따로(미신청 시 `30 등록되지 않은 서비스키`), 기상청 API허브(`KMA_APIHUB_KEY`)·식품안전나라(`FOOD_RECIPE_API_KEY`)·농식품부(`MAFRA_API_KEY`)는 별도 발급. LLM purpose 도 `meal-photo`/`meal-recommend` 2종 추가(5종, `cc8399a`). (4) **앱 빌드 운영 함정 문서화** — prebuilt RN 아티팩트가 Release 로 깔려 Debug 링크가 깨지는 문제([docs/mobile-ios-build.md](../../docs/mobile-ios-build.md), `4228651`, CLAUDE.md 에 한 문단), 무료 Apple 팀용 `aps-environment` 제거 플러그인(`b733628`), Hermes SharedArrayBuffer 오류를 Metro 수동 탐색 설정 폐기로 해소(`5cb63a3`), 네이티브 모듈 없는 dev client 에서 화면이 통째로 죽지 않게 지연 로드(`0064ab9`). (5) **테스트 격리 원칙 재확인** — `pnpm --filter friendly test` 가 `.env` 의 운영 스냅샷 머지 결과를 통째로 날린 사고(`517e465`) → DB 를 건드리는 테스트는 `useIsolatedDatabase()` 필수(현재 14파일 사용). 테스트는 friendly 1,063 · web 77(13파일) · shared 65 · utils 180(2026-08-24 실측), 앱은 여전히 0건. 앱은 이제 7 도메인(맛집·대중교통·정산 + 날씨·대기·일상지도·식단)을 탭 4개 + 홈 허브 카드로 담는다. (6) 웹 공개 셸 — 상단바 폭 예산 정리 + 모바일(웹 작은 화면) 계정·테마를 사이드바 하단으로(`a062e7d`), 대중교통·일상지도 모바일이 맛집 v2 바텀시트 패턴으로 통일(`e84e4b9`, `components/sheet/`). 워크스페이스 규모: friendly 모듈 34 · api-contract 스키마 36 · Prisma 모델 75 · 마이그레이션 69 · 테스트 파일 134.

**2026-07-13~08-17 변경 흡수 — 공개 기능 확장(지하철·즐겨찾기·슬롯 픽·그룹 투표) + 보안/성능 하드닝 + 전 워크스페이스 테스트/린트 체계 완성**: (1) 공개 사용자 표면이 크게 늘었다 — 수도권 전철 조회([subway](subway.md))·대중교통 통합([transit](transit.md), 앱은 탑승 모드·하차 알림까지)·맛집 즐겨찾기(게스트+로그인 하이브리드, [개념](../concepts/guest-server-hybrid.md))·홈 슬롯머신 픽·**그룹 투표 픽([vote](vote.md) — 신규 토픽)**. (2) 보안·성능 감사 9차수(`bc2db00` — 레이트리밋·tokenVersion 세션 무효화·입력 상한·과다로드/이벤트루프 최적화)와 서울시 API 전면 장애를 계기로 한 대중교통 장애 내성([bus](bus.md) 마스터 로컬화·stale 폴백). (3) **테스트가 전 워크스페이스로** — friendly 750(외부 상태 스모크는 자가 skip, 로컬 완전 green) + web 24(vitest 4 + RTL + MSW — 러너 신설) + shared 25(vitest 2 — 러너 신설) + utils 65. lint 도 4 워크스페이스 전부 0 errors. `pnpm test` 한 방이 863건을 돈다. (4) 별도 UWP 앱(NineyWeather)용 지하철 마스터 export 스크립트가 생겨 이 리포의 가공 데이터가 외부 프로젝트의 원천이 되기 시작했다.

**2026-07-06 변경 흡수 — 공개 사용자 기능으로 버스 조회 추가.** friendly 에 서울시 버스 오픈 API 프록시 `bus` 모듈이 생기고, 웹에 `/bus` 공개 페이지가 붙었다 — 정류장 이름 검색·좌표 기반 주변 정류장·실시간 도착·노선(경유 정류소+형상)·노선 위 실시간 차량 위치. 비로그인 열람 + 로그인 시 정류장/노선 즐겨찾기(서버 저장). 정류소/노선은 사실상 정적이라 DB 30일 캐시 + in-memory 일일 쿼터 게이트로 개발계정 한도를 보호(신규 env `BUS_API_KEY`). 자세한 건 [bus](bus.md).

**2026-06-25 변경 흡수 (18차) — 리뷰 지능화(RAG 문맥검색 + 군집화) + 운영 자동화(텔레그램 봇 자동 발굴 + 범용 작업 로그) + 4번째 출처(테이블링) + LLM 계정 게이트·텔레메트리 + 정산 세부 분배(잔수) + 맛집 공유/SEO.** 19일·~70커밋의 가장 큰 라운드. **신규 토픽 5개**: (1) [review-search](review-search.md) — 리뷰 RAG/문맥검색. enrich(관점+문맥+bge-m3 임베딩을 `review_summaries` 에 영속) → 하이브리드 회수(BM25 char-trigram ⊕ dense, RRF) → listwise LLM 리랭크 → 근거 RAG 생성 → 2차 LLM 검증 가드레일(claim↔span 대조). 어드민 `/admin/review-search` + 공개 무인증 QA(`restaurants/:placeId/qa`). (2) [review-clustering](review-clustering.md) — 비슷한 문맥 리뷰 군집화. bge-m3 임베딩 → UMAP → HDBSCAN → c-TF-IDF → LLM 라벨. **수학은 별도 Python 런타임**(`scripts/cluster_compute.py`, numpy/sklearn/umap-learn/hdbscan)을 Node 가 spawn. 전부 노이즈/소형 식당이면 관점집계 폴백. (3) [random-crawl](random-crawl.md) — 맛집 자동 발굴. cron 으로 지역 선정 → 검색 → 후보를 텔레그램 push → 사용자가 고른 가게만 크롤("사람이 끼는 2단계 비동기 상태머신"). (4) [telegram](telegram.md) — 텔레그램 봇(long-polling). `/search`·`/discover`·`/stats` 커맨드 + 크롤 진행/완료 알림 + 어드민 설정. (5) [logs](logs.md) — 전 기능 가로지르는 범용 작업 로그(`OperationRun`/`Log`/`Report`) + 실패 run LLM 자동 원인분석 + 보존 정리. crawl 의 CrawlJobLog 를 일반화한 후속. **신규 컨셉 5개**: [db-config-env-fallback](../concepts/db-config-env-fallback.md)(ai/map/telegram 설정 동형), [operation-log-instrumentation](../concepts/operation-log-instrumentation.md)(8+ 도메인 횡단 계측), [canonical-corpus-fanout](../concepts/canonical-corpus-fanout.md)(분석이 canonical 멤버 다소스 행에 fan-out), [cross-tab-async-job-toast](../concepts/cross-tab-async-job-toast.md)(전역 store 가 잡 수명을 UI 수명에서 분리 + 토스트), [ssr-lite-head-injection](../concepts/ssr-lite-head-injection.md)(정산+맛집 공유 OG/SEO head 주입 — 16차 보류 후보가 식당으로 번져 추출). **갱신 토픽 11개**: [crawl](crawl.md)(테이블링 4어댑터 + SSE seq 단일화 78% 멈춤 fix + 정확한 리뷰 수), [ai](ai.md)(계정 단위 2단 동시성 게이트 + LLM 텔레메트리 SSE + adapter-cache 키별 Map + 키 1계정 공유·용도별 모델 + log-analysis purpose), [settlement](settlement.md)(세부 분배 그룹 — 균등/잔수 + drink-kinds 사전 + EXTRACTION_VERSION 3→4 주류 오분류 보정 + 잔여 수령자 다중), [analytics](analytics.md)(전량 머지 청크 병렬 풀+캐시+OOM 수정), [menu-grouping](menu-grouping.md)(v2 분할·머지 재설계 — 에코→인덱스 계약, parse_failed 해소), [friendly](friendly.md)(5 신규 모듈 통합 + 파노라마 503 캐시 fix + 맛집 SEO/공유 + 지역 통계 파생 + smart-pick), [canonical](canonical.md)(테이블링 4번째 소스 + place↔partner 자동 승격), [map](map.md)(지역 통계 choropleth point-in-polygon + vworld 타일 probe 판정), [api-contract](api-contract.md)(5 신규 스키마 + 테이블링·그룹분배·텔레메트리), [shared](shared.md)(API 5+훅 6+스토어 3), [web](web.md)(Ask/군집 탭 + 어드민 콘솔 대확장 + 전역 토스터 + `/r` 공유)/[mobile](mobile.md)(Ask 탭/배너 + 군집 + 그룹분배 + `s/[token]`). 자세한 건 각 토픽.

**2026-06-06 변경 흡수 — schedule 도메인 신규(croner in-process 주기 자동 실행) + 카테고리 택소노미 v3(재료·메뉴군 축) + 다크 모드(웹/앱) + 앱 안드로이드 정비.** 신규 토픽 [schedule](schedule.md) 1개 추가, 나머지는 기존 토픽으로 흡수. (1) **schedule 도메인** — "미분류 식당 메뉴 정규화 → 전역 머지(증분)" 파이프라인을 어드민이 설정한 cron 주기마다 자동 실행한다. `croner` **in-process** 스케줄러(단일 Fastify + no-Redis 전제와 일관 — 외부 잡 큐 없음). `plugins/schedule.ts` 가 `ScheduleService` 를 app 전역 singleton 으로 decorate 하고, cron 타이머 + 동시 1개 inflight(overlap 방지)는 `scheduleRegistry`(모듈 singleton)가 관리. 설정은 SQLite `schedule_configs` 에 영속돼 부팅 시 복원 + cron 등록, 부팅 직후 직전 인스턴스에서 `running` 으로 남은 run 을 `interrupted` 로 정리(`schedule.bootstrap()`). 크롤 진행 중 식당은 제외(`crawl.isPlaceCrawling`), SIGTERM 시 inflight abort + graceful close. 어드민 UI 는 별도 페이지 없이 `AdminAnalyticsPage` 에 "자동 실행 스케줄" 섹션(프리셋·cron 미리보기·실행 이력)으로 통합. 신규 테이블 `schedule_configs`/`schedule_runs`, `croner` 의존 추가. 자세한 건 [schedule](schedule.md). (2) **카테고리 택소노미 v3** — 전역 메뉴 머지 최상위 축을 음식 종류(한식/일식/양식) → **재료·메뉴군**(고기/면/김치/반찬/찌개·전골/회·초밥/튀김…)으로 전환. `GLOBAL_MERGE_VERSION` 2→3 → 기존 행 stale, 새 택소노미 채우려면 **full 재머지**(어드민 '전체 재실행' 또는 `run-merge --full`) 필요. 복합어는 가운뎃점(`/`는 path 구분자라 금지). LLM 출력 스키마를 맵→**배열**로(Ollama grammar fix) + 청크 50→10. 카테고리 트리 `buildCategoryTree` 가 공용(전역 어드민 + 식당별 공개 분석 탭 동일). 자세한 건 [analytics](analytics.md). (3) **다크 모드** — 웹/앱 둘 다 system/light/dark 3-way. **저장소는 플랫폼 분리** — 웹 localStorage / 앱 AsyncStorage `'lp:themeMode'`(수동 hydrate + `useResolvedThemeMode` 가 `useColorScheme` 결합), `@repo/shared` 의 design 토큰만 공유(다크 textMuted zinc400/border 0.14 AA). vworld 지도 다크(midnight 타일)/위성 레이어 토글이 좌하단 컨트롤로 캡슐화 + 앱 다크 진입 시 기본 midnight 자동 전환(직접 고르면 이후 비추종), `tileSource.setUrl()` 로 map 재생성 없이 전환. (4) **앱 안드로이드** — 표준 스타일 커스텀 하단 탭바, `splashscreen_logo` 누락 빌드 fix, 바텀시트 내 가로 스와이프 fix, iOS/Android 실기기·릴리즈 실행 스크립트, 루트 `expo run:ios` 오염(ios/·app.json) 정리 + 루트 `.gitignore` 에 `/ios /android /app.json` 추가로 재발 차단. (5) **UI 정비** — soft tonal 버튼/배지 variant 도입(어드민/상세/병합 일괄), 분석 탭 메뉴/팁 클릭→해당 리뷰 필터, 메뉴 썸네일 탭→라이트박스 확대, 목록 카드 클릭=지도 이동/더블클릭=확대(공개+어드민 통일), 상세 탭 카드 테두리 제거·리뷰 사진 풀폭(웹/앱 통일). (6) 전역 머지 categoryPath 유실 복구 fix. 자세한 건 [analytics](analytics.md)·[web](web.md)·[mobile](mobile.md)·[map](map.md).

**2026-06-01 변경 흡수 — 전방위 perf 라운드 + ESLint 인프라 전면 연결 + 운영 도메인 교체(ninelife.kr) + 정산 공유 OG SSR-lite 대확장.** 신규 토픽·컨셉 없음 — 모두 기존 토픽으로 흡수. (1) **ESLint 인프라 전면 연결** — `packages/config/eslint/base.js`(js.recommended + typescript-eslint recommended + `consistent-type-imports`/`no-console`/`no-undef:off`)를 web/friendly/api-contract/mobile **4개 워크스페이스가 모두 확장**한다. api-contract 는 `base` 직결, friendly 는 `@repo/config/eslint/node`, web/mobile 은 `@repo/config/eslint/react`(react-hooks v7 recommended — **React Compiler 진단 룰** 포함) 경유. turbo `lint` 4/4 green. 앱·웹은 기존 위반 때문에 Compiler 룰을 일단 `warn` 으로 도입(set-state-in-effect/render·immutability·rules-of-hooks 등). (2) **운영 도메인 교체** — `nlpp.easypcb.co.kr` → **`ninelife.kr`** (`docs/deploy-friendly.md`·`apps/friendly/.env.example`·`deploy.sh`). `deploy.sh` 신규 — 케이스 번호(1~5)로 골라 배포하는 운영 스크립트(API만 / API+DB / 웹만 / 풀 / .env만 + 파괴적 마이그레이션 시 서버 중단 여부 prompt). 운영 토폴로지는 Cloudflare → nginx → Fastify(pm2 fork 단일 인스턴스). (3) **정산 공유 OG SSR-lite** — 공개 비인증 HTML 라우트(`share-preview.ts`)가 빌드된 `index.html` `<head>` 에 OG 메타(식당명·총액·인원수)를 서버 주입하고, `og:image` 는 `/share/settlements/<token>/image.png` 로 정산표 PNG(`settlement-card.ts`, satori+resvg + 레포 동봉 `IBMPlexSansKR` 폰트)를 즉석 렌더 — SNS 언펌(카카오/슬랙/텔레그램, JS 미실행 크롤러) 대응. nginx 는 이 경로에 **`^~` 필수**(`.png` 정규식 location 에 가로채이지 않도록 prefix 우선권) + Cloudflare 엣지 캐시라 수정 후 **Purge** 필요. (4) **전방위 perf 라운드** — 웹 라우트 코드 스플리팅(lazy) + `vite.config.ts` Rolldown `codeSplitting.groups`(ol/react-vendor/query/radix vendor 청크 고정), interaction 핫패스 `React.memo`, 크롤 배치 `setQueryData` 머지(상세 GET 제거), 앱 정적에셋 PNG 압축 + 썸네일 프록시(~98%) + FlatList 가상화, 정산 draft hydrate placeId당 1회, friendly 식당 이름 경량 조회·OG 미리보기 경량 select+5분 캐시·attendee `createMany`. (5) **stale 교정** — README 의 "Expo 52 / RN 0.76" → **Expo SDK 54 / RN 0.81**(TECH_STACK.md 는 작성 시점 명세라 보존, 본 문서는 실제 버전 반영). 자세한 건 [friendly](friendly.md)·[settlement](settlement.md)·[web](web.md)·[config](config.md)·[mobile](mobile.md).

**2026-05-31 변경 흡수 — dev CORS 전면 반사 허용(preflight 차단 해소) + 앱 맛집 상세 UX 정비.** (1) **dev CORS 정책 완화** — `apps/friendly/src/plugins/cors.ts` 가 dev 한정으로 origin 화이트리스트(RFC1918 자동 허용)를 **폐기하고 모든 origin 을 반사 허용**한다. 개발 머신 IP 가 공인/사설/VPN/WSL 로 수시로 바뀌어 화이트리스트가 무의미한데다, 거부(`cb(Error)`)가 로그인 등 preflight(OPTIONS)를 통째로 깨뜨리던 회귀를 해소. RFC1918 regex 는 비-LAN origin 경고용으로만 남고, prod 는 여전히 env `CORS_ORIGIN` 으로 엄격 차단(보안 영향 0). (2) **앱(모바일) 맛집 상세 UX** — 상세 화면이 단일 `FlatList` 스크롤 루트로 재구성되어 리뷰가 가상화 + 무한 스크롤되고, 탭을 누르면 hero 를 숨겨 콘텐츠를 최대 노출. 리뷰 라이트박스는 `react-native-awesome-gallery` 로 교체돼 핀치/더블탭 줌·쓸어내려 닫기 지원. 하단 네이티브 탭바가 콘텐츠를 가리던 문제는 `useTabBarHeight` 훅(native/web 페어 — [platform-ui-split](../concepts/platform-ui-split.md) 의 훅 인스턴스)으로 인셋을 직접 더해 해결. (3) **웹** — 홈 랭킹 행 클릭 시 `/restaurants-v2/:placeId` 상세로 진입(`<Link>`), 공개 상세 리뷰 라이트박스가 `createPortal(body)` 로 3-컬럼 sticky stacking context 잘림을 해소 + 바깥 클릭 닫기, "내 위치" 버튼이 권한 차단·평문 HTTP 막다른 길을 callout + 자동 권한변화 감지로 해소. (4) 공개 리뷰 `sort=recent` 가 오래된 순으로 나오던 정렬 버그 fix(`fetchedAt asc`).

**2026-05-28 변경 흡수 — 정산 도메인이 1차 단일에서 N차(차수) 모델로 진화 + 서버 draft 자동저장(다기기 sync) + 분담 다듬기/차수 할인/멀티 영수증 분할 + 앱(모바일) 정산 풀구현 + Universal Links/App Links.** 도메인 모델 자체는 **N차** — `SettlementRound` + `SettlementRoundAttendee` 두 테이블이 신설되고 items / attendees 가 session 레벨에서 round 레벨로 이동(4 마이그레이션). 마스터 참여자는 session 에 두고 차수별 출석 + 카테고리 exclude override 만 round 에 보관. 계산기는 `calculateMultiRoundShares` 로 round 별 `calculateShares` 를 attendee subset 으로 돌려 master-index 합산. 차수당 attendees 20→100, items 100→200. **분담 다듬기(refinement)** — 차수별 카테고리 풀을 100/1000원 단위로 round 한 뒤 나머지를 leftoverParticipant 한 명에게 흡수. **차수 할인** 은 round 당 단일 카테고리 한 건(`pool >= discountAmount` zod refine). **멀티 영수증 분할** 은 한 장의 사진을 N(2..5) 슬라이스로 잘라 같은 imageToken 재사용 + sharp crop + vision LLM 을 N 회 호출. **서버 draft 자동저장** 은 `SettlementDraft` 테이블(`(userId, placeIdKey)` unique, 빈 문자열 sentinel) + `GET/PUT/DELETE /api/v1/settlement-drafts` — 5초 debounce, 본 저장 시 `fromDraftId` 트랜잭션 청소. **`PUT /settlements/:id` 풀 리플레이스** 가 옛 PATCH /:id/participants 자리를 대신한다(이전 "items 불변" 정책 폐기). **Universal Links(iOS)/App Links(Android)** — friendly `well-known` 모듈이 `/.well-known/apple-app-site-association` + `/.well-known/assetlinks.json` 을 env 기반 동적 응답, 미설치 단말은 같은 URL 로 웹 SPA fallback. 자세한 건 [settlement](settlement.md).

루트 레벨에서 본 niney-life-pickr-v2 — "선택을 대신 골라주는 서비스" — 의 구조, 워크플로, 공통 규칙을 한 페이지로 정리한다. 공개 영역(사용자 대상 페이지) 과 어드민 영역(운영 도구) 으로 나뉘며, 양쪽 모두 단일 백엔드를 공유한다. 개별 모듈에 대한 자세한 내용은 각 토픽 문서로.

> **용어 (Terminology) — 프로젝트 단일 규약** (CLAUDE.md 의 "용어" 섹션을 그대로 반영):
> - **웹** = `apps/web` (Vite + React 19 SPA, 공개 + 어드민 두 레이아웃)
> - **앱** = `apps/mobile` (Expo + RN 앱). 플랫폼 별로는 **iOS앱**, **Android앱**, **Expo Web** (RN-Web 출력)
> - **모바일** = **웹**의 작은 화면(반응형 레이아웃)만 지칭 — 앱 가리키지 않음. 앱을 가리킬 땐 항상 "앱"
> - **모바일 단말** = 휴대전화로 **웹** 접속한 상태
> - 식별자(슬러그·디렉터리·스크립트·커밋 스코프) `mobile` / `web` 은 그대로 유지 — 디렉터리 슬러그 기준이라 변경 없음
> 자세한 규칙: [schema.md Terminology](../schema.md#terminology--웹--앱--모바일), [CLAUDE.md 용어](../../CLAUDE.md#용어).

## Purpose [coverage: high — 9 sources]

선택이 고민될 때 대신 골라주는 서비스다. 핵심 도메인은 여섯 축으로 갈린다 — 선택 도우미·맛집 분석·정산(원래 세 축)에 2026-07 대중교통, 2026-08 생활정보·식단, 2026-09 **운세·선택 놀이(타로·사주)** 가 더해졌다:

- **선택 도우미(Pick)** — 사용자가 선택지(`options`)를 등록해 두면, API가 무작위 결과를 골라 `PickResult`로 기록한다. 식당이 등록되어 있으면 분석 점수(만족도/긍정 비율)를 가중치로 쓰는 `smart-pick` 가 활성된다.
- **맛집 분석** — 어드민이 다양한 출처에서 식당을 크롤링하고 리뷰를 LLM으로 분석해 메뉴 통계 트리까지 빌드한다 ([crawl](crawl.md), [ai](ai.md), [menu-grouping](menu-grouping.md), [analytics](analytics.md)). 출처는 4종 — **네이버 플레이스 / 다이닝코드 / 캐치테이블 / 테이블링**(18차 합류). 어드민의 진입 경로는 네 갈래 — 단건 placeId 입력 (`/admin/restaurants`), 키워드 검색→다중 선택 일괄 등록 (`/admin/discover`), 다이닝코드 일괄 저장 (`/admin/diningcode`), **AI 자동 발견** (`/admin/auto-discover`). 결과물은 공개 페이지에서 비로그인 사용자가 그대로 본다. 2026-09 부터 상세 메뉴 탭에 음식 카탈로그 기반 **칼로리 칩**이 붙는다 — 메뉴명 3등급 판정 → LLM 매칭 → 웹 실측 → 세트 분해의 판정 엔진, 골든셋 정밀도 게이트 99.5%([food](food.md), [docs/menu-calorie-engine.md](../../docs/menu-calorie-engine.md)).
- **정산하기 — N차 모델** — 식당 상세에서 진입하는 사용자 기능. 한 자리(session) 안에 1..10 차(round) — 차수마다 자기 식당 / 항목 / 출석한 attendees subset / source(MANUAL/RECEIPT) / 할인 / 다듬기 조정을 들고 있다. 마스터 참여자는 session 레벨, 차수별 출석/exclude override 만 round 레벨. 영수증 사진을 vision LLM 으로 4 카테고리(ALCOHOL/NON_ALCOHOL/SIDE/UNCATEGORIZED) 메뉴·금액 추출(차수당 1장 또는 멀티 분할로 1장→N슬라이스) → wizard(참여자/차수/항목 편집/결과) → 저장 → 공유 토큰(`/share/settlements/:token`) 비인증 read. **공유 링크는 SNS 미리보기(OG)까지 — 정산표 PNG 가 카카오톡/슬랙 언펌에 그대로 뜬다.** 단골 참여자는 자동 적립(`SettlementContact`) 되어 다음 정산에서 자동완성으로 끌어쓴다. **앱(iOS/Android) 도 풀구현** — 웹과 동일 동선 + 네이티브 bottom sheet. 자세한 건 [settlement](settlement.md).

- **대중교통(2026-07~)** — 서울시 버스([bus](bus.md)) + 수도권 전철([subway](subway.md)) 을 `/bus`·`/subway` 공개 라우트와 '대중교통' 메뉴로 묶은 통합 레이어([transit](transit.md)). 비로그인 열람 + 로그인 시 즐겨찾기(게스트 로컬↔서버 하이브리드). 외부 공공 API 쿼터를 사용자 행동에 비례시키는 4층 구조([quota-proportional-loading](../concepts/quota-proportional-loading.md))가 여기서 정립됐고 아래 생활정보가 그대로 물려받았다.
- **생활정보(2026-08-21~)** — 네 공개 페이지가 같은 정책(비로그인·friendly 프록시 또는 로컬 적재·캐시 보호)으로 나란히 섰다. **집값 `/housing`**([housing](housing.md), 2026-08-30~) — 한국부동산원 아파트 단지 마스터 45,920단지 + 국토교통부 실거래가(RTMS 매매·전월세, 시군구×계약년월 단위로 받아 `HousingTradeSync` 장부가 "어느 달을 받았나" 기억) + 공시가격 zip·K-apt·건축물대장 보강을 **로컬 DB 에 적재**해, 지도 뷰포트(bbox+줌)로 서버 집계 셀(평당가)/단지 가격 배지, 단지 검색·상세·거래 목록(`dealType`·전용면적 `band` 축 공통). 거래는 `HOUSING_REFRESH_CRON` 으로 최근 N개월을 재수집(신고 지연·해제 반영), 단지 좌표는 일상지도와 **같은 지오코딩 캐시 압축본**을 쓴다. **대기질 `/air`**([air-quality](air-quality.md)) — 에어코리아 시도별 실시간·측정소 지도/주변/검색·예보(측정 10분·예보 20분·주간 60분·측정소 24시간 캐시), 로그인 시 '내 대기 위치' 저장(`AirUserLocation`). **날씨 `/weather`**([weather](weather.md)) — 기상청 초단기실황/단기·중기예보 + 광역시 구·군 지점(`weatherRegions`), 발표 시각 단위 캐시, API허브 AWS 매분 관측으로 현재값 보강. **일상지도 `/life-map`**([life-map](life-map.md)) — 전국 CCTV 377,243·공중화장실 53,559·병의원(심평원 API 전량 ~80콜) 세 레이어를 **로컬 DB 에 적재**해 요청 경로 외부 호출 0, 셀 격자 10분 LRU 캐시, 지역 이동 검색(행정구역·역·정류장·주소). 상단바의 "내 위치" 칩이 날씨·대기 두 도메인을 한 알약으로 묶어 10분마다 조용히 갱신한다.
- **식단(2026-08-22~, 로그인 필수)** — 사용자 개인의 평소 식단 기록 + 다음 끼니 추천([meal](meal.md)). 입력은 **앱에서 사진 인식**(Ollama Cloud vision, purpose `meal-photo`) 위주, 웹 `/me/meals` 는 기록·달력·통계·추천·설정 조회 중심. 영양 스냅샷·알레르기 근거·SQLite 영속 일일 쿼터(인식 30/추천 20)·JSON 백업/멱등 복원·사진 retention 까지. 마스터 데이터는 **음식 카탈로그**([food](food.md)) — 식약처 영양성분 CSV·한식 800선 XLSX·식품안전나라 레시피 API·이 서버의 외식 어휘를 병합한 3,879종(2026-08-24 실적재), 어드민 `/admin/food` 에서 적재 잡·충돌 검수·알레르기 검수. "오늘 뭐 먹지?"(식당 smart-pick)와는 **독립 도메인**([docs/PLAN-meal.md](../../docs/PLAN-meal.md) 결정 A~I).
- **운세·선택 놀이(2026-09-02~, 로그인 없이 무료)** — **타로 `/tarot`**([tarot](tarot.md)): 78장 덱(메이저 22 + 마이너 56, 장면형), 스프레드 5종(오늘의 카드 `daily`·과거현재미래·상황조언결과·A/B 선택 `choice`·**메뉴 타로 `menu`** — 카드 원소·무드로 메뉴 100종 중 후보 3개를 코드가 결정적으로 고르고 LLM 은 이유만), 부채꼴 3D 무대에서 직접 뽑기 또는 자동 뽑기, 해석은 Ollama Cloud(purpose `tarot`, 기본 `gpt-oss:120b`) + 정적 폴백, 공유 토큰·OG·satori 이미지(og/story), 회원은 자동 저장 `/me/tarot` + 오늘의 카드 계정 잠금. **사주(C) `/saju-c`**([saju-c](saju-c.md)): 생년월일시·성별(양/음력·윤달·시 모름) → `@repo/utils` 엔진이 사주팔자·십신·신살·대운·격국·삼재·월운을 **결정적으로 계산**하고 LLM(purpose `saju`, 기본 `kimi-k3`)은 섹션 4개(성격·올해·흐름·조언)를 **병렬 job + long-poll** 로 문장화(캐시 히트면 즉시, 없으면 정적 본문 먼저), 오늘의 운세(회원 하루 1회 잠금)·궁합·택일·오행 음식, 회원 프로필 최대 10명·기록 `/me/saju-c`, 공유는 타로와 같은 패턴. **사주(G) `/saju-g`**([saju-g](saju-g.md)): 같은 주제의 **별도 구현**(다른 세션, `modules/saju-g`) — 명식 먼저·AI(purpose `saju-g`, `kimi-k3`) 뒤에, 출생 프로필·두 사람 궁합 `/saju-g/pair`·이야기 카드·명시적 보관 `/me/saju-g`·공개 상징만 공유(`/saju-g/s/:token`, 10자 토큰). 셋 다 게스트는 [공용 익명 사용량 한도](../concepts/anonymous-usage-quota.md)([usage-quota](usage-quota.md) — 게스트 키·IP·전역 일일 + IP 분당) 안에서, 회원은 기기·IP 일일 한도 면제. 앱은 3D 를 포팅하지 않고 **WebView 임베드**로 연다([embedded-webview-bridge](../concepts/embedded-webview-bridge.md)).

세 개의 클라이언트가 동일 백엔드를 공유한다:
- **friendly** — Fastify + Prisma + SQLite 백엔드 ([friendly](friendly.md))
- **웹** (`apps/web`) — Vite + React 19 SPA. 공개 영역(`/`, `/restaurants(-v2)`, `/r/:placeId`, `/bus`, `/subway`, `/air`, `/weather`, `/life-map`, `/housing`, `/tarot`, `/tarot/s/:token`, `/saju-c`, `/saju-c/s/:token`, `/saju-g`, `/saju-g/pair`, `/saju-g/s/:token`, `/s/:token`, `/vote/:token`) + 인증 사용자 영역(`/me/meals`, `/me/settlements`, `/me/contacts`, `/me/tarot(/:id)`, `/me/saju-c(/:id)`, `/me/saju-g(/:id)`, `/me/saju-g/profiles`, `/vote/new`, `/restaurants/:placeId/settle/*`) + 어드민 콘솔(`/admin/*`) 세 묶음이 한 SPA 안에 공존. 공개 메뉴 순서(`PublicSidebar.NAV`): 홈 · 맛집 · 대중교통 · 일상지도 · 집값 · 날씨 · 대기질 · 타로 · 사주(C) · 사주(G) · 식단(로그인 시만). `?embed=1`(또는 앱 브리지 주입)이면 `PublicLayout` 이 상단바·사이드바 없이 본문만 그린다 — 앱 WebView 용
- **앱** (`apps/mobile`) — Expo SDK 54 + React Native 0.81 + React 19. 탭 4개(홈·맛집·대중교통·프로필) + 스택 화면으로 맛집 상세/정산/단골/공유(`s/[token]`)/날씨/대기/일상지도/식단(`meal/{index,new,[id]}`) 풀구현. 타로·사주(C)는 네이티브 화면 대신 **WebView 임베드**(`app/tarot`·`app/saju-c` 가 웹 `/tarot?embed=1`·`/saju-c?embed=1` 을 열고 토큰·게스트 키를 주입) — 홈 `TarotEntryCard`·`SajuEntryCard` 로 진입. 사주(G)·집값은 앱 미연동. 어드민 UI 는 의도적 미포함. 로컬 빌드는 무료 Apple 팀(Universal Links·Push capability 제거), EAS/유료 팀은 `EXPO_PUBLIC_ENABLE_APPLINKS=1`

공개 영역은 비로그인 호출 가능 — 데이터 자체는 어드민이 본 것과 차이가 없고 (운영 메타만 제거), 사용자 정책상 그대로 노출한다. 공유 정산 토큰 경로(`/share/settlements/:token`) 도 비인증으로 열려 있으나 추측 불가능한 32바이트 base64url 토큰 보호. 같은 URL 을 앱이 설치된 단말에선 Universal/App Links 가 가로채 앱이 직접 열고, 미설치 단말은 웹 SPA 가 fallback. 그리고 같은 경로를 JS 미실행 크롤러(카카오/슬랙)가 긁으면 friendly 가 OG 메타 + 정산표 PNG 를 SSR-lite 로 내려준다. 타로·사주 공유(`/tarot/s/:token`·`/saju-c/s/:token`·`/saju-g/s/:token`)도 같은 방식이다 — friendly 가 같은 경로에서 OG 를 주입하고 satori 이미지(`image.png?format=og|story`, 사주(G)는 `/api/v1/saju-g/shares/:token/image.png`)를 렌더하며, 공유 본문은 **서버가 만든 해석만** 게시한다(게스트는 입력을 재전송해 서버가 캐시/LLM/정적으로 본문 확보, 회원은 readingId 로 토큰만). 공용 헬퍼는 `lib/web-index.ts`(index.html 로드 + head 주입)·`lib/share-fonts.ts`(satori 폰트) — 타로부터 공용, 정산·투표는 각자 것을 유지.

## Architecture [coverage: high — 30 sources]

pnpm workspaces + Turborepo 기반 모노레포. (트리의 `(신규)` 는 24차 2026-08-17~08-30 라운드 표기, 이번 25차 2026-08-30~09-07 추가분은 `(25차)`)

```
niney-life-pickr-v2/
├── assets-src/{tarot,saju}/raw/   제미나이 생성 원본 PNG — git 밖(.gitignore), build:tarot-deck / build:saju-images 가 webp 로 변환해 apps/web/public 에 커밋 (25차)
├── data/open/             공공데이터 원본 — git 밖(.gitignore /data/), 로더 기본 경로 (신규, docs/data-sources.md)
│   ├── food/              mfds-nutrition.csv(식약처 15100070, 6.9MB — fetch:mfds-nutrition 으로 재현) · mfds-nutrition-15100065.csv(원재료성식품, 25차) · hansik-800.xlsx(한식 800선 15129784)
│   ├── life/              cctv.csv(79MB) · toilet.csv(16MB) — 지방행정인허가 CP949 (병의원은 API 라 파일 없음)
│   ├── housing/           reb-complexes.csv(부동산원 단지 44MB, 15106861) · reb-complex-names.csv(단지명 이력) · gongsi-2025.zip(공시가격 144MB, 3073746) · YYYYMMDD_단지_기본정보.xlsx(K-apt 15098979, 최신 날짜 파일 자동 선택) — 실거래는 API 라 파일 없음 (25차)
│   └── eval/meal-photos/  AI Hub 추출 평가셋 150클래스 × 5장 = 750장(91MB), 파일명 = 정답 라벨
├── ops/nginx/niney_life_pickr_v2_projects   운영 nginx 설정 **원본**(리포 추적, 35b35fd·e40b4c0) — nlpp.easypcb.co.kr(letsencrypt) + ninelife.kr(Cloudflare Flexible) 두 서버 블록, `^~` 프록시(정산·/s/·/r/·/tarot/s/·/saju-c/s/·/saju-g/s/·/vote/), webp 7일 캐시(/tarot/cards/·/saju-c/images/), SPA `try_files $uri /index.html`, `absolute_redirect off` (25차)
├── apps/
│   ├── friendly/          Fastify 백엔드 → friendly 토픽
│   │   ├── assets/fonts/IBMPlexSansKR-{Regular,Bold}.ttf   정산표·타로·사주 공유 PNG 한글 렌더 폰트 (레포 커밋)
│   │   ├── assets/saju-glyphs/  천간·지지·오행 한자 27자 × 3색 PNG 81장 — Plex 에 한자가 없어 build:saju-glyphs(개발 머신 Noto Serif CJK)로 생성·커밋, satori 는 <img>/graphemeImages 로 사용 (25차)
│   │   ├── data/                (gitignored, .gitkeep 만)
│   │   │   ├── dev.db           SQLite (DATABASE_URL=file:../data/dev.db; 운영은 prod.db)
│   │   │   ├── receipts/        영수증 이미지 디스크 저장 (멀티 분할 시에도 한 token 재사용, 자동 정리 없음)
│   │   │   ├── meal-photos/<userId>/<token>.jpg(+_t.jpg)   식단 사진 원본 1600px/썸네일 320px — 미연결 24h TTL 매일 04:30 GC (신규)
│   │   │   ├── thumbs/ · panorama/   네이버 CDN 썸네일·파노라마 영구 사본 캐시
│   │   │   └── *-probe/ · extraction-debug/ · meal-recognition-debug/   probe 실응답·측정 덤프(디버그 env 켰을 때만)
│   │   ├── scripts/             78개 파일·92 스크립트 — load:*(적재) / status:*(한 줄 상태) / probe:*(실응답) / build:*(자산·표) / measure:*(골든셋) / backfill:* / eval:* (25차 +25)
│   │   │   ├── load-life-{cctv,toilets,hospitals}.ts · {export,import}-life-geocode.ts · life-map-status.ts
│   │   │   ├── load-food-catalog.ts · food-catalog-status.ts · backfill-{food-allergens,meal-nutrition}.ts · fetch-mfds-nutrition.ts (25차)
│   │   │   ├── load-housing-{complexes,trades,prices,kapt,buildings}.ts · housing-status.ts · geocode-housing-missing.ts · rebuild-housing-derived.ts · probe-rtms-api.ts (25차)
│   │   │   ├── build-tarot-deck.ts · probe-tarot-reading.ts / build-saju-{tables,images,glyphs}.ts · probe-saju-reading.ts / probe-saju-g-{reading,pair}.ts (25차)
│   │   │   ├── measure-menu-{nutrition,golden,decompose}.ts · probe-menu-{coverage,resolve,decompose}.ts · probe-food-web-estimate.ts (25차 — 메뉴 칼로리 골든셋)
│   │   │   └── probe-{airkorea,kma,kma-apihub,hira,food}-api.ts · probe-meal-{vision,e2e}.ts · eval-meal-recognition.ts
│   │   ├── eslint.config.mjs    @repo/config/eslint/node 확장
│   │   └── src/
│   │       ├── plugins/cors.ts                        dev 전면 origin 반사 허용 (비-LAN 만 warn)
│   │       ├── plugins/schedule.ts                    ScheduleService app 전역 singleton decorate
│   │       ├── plugins/food-import.ts · plugins/meal.ts   카탈로그 적재 잡 / 식단 사진 서비스 + 04:30 고아 GC (신규)
│   │       ├── plugins/usage-quota.ts                 UsageQuotaService app 전역 singleton(설정 30초 캐시, 기능 라우트와 어드민이 공유) + 04:40 카운터 GC(scheduleRegistry cron) (25차)
│   │       ├── plugins/jwt.ts                         + resolveOptionalUser — 공개 라우트 옵셔널 인증(유효 토큰=회원, 무효/없음=게스트, 401 아님) (25차)
│   │       ├── config/env.ts                          DATA_GO_KR_API_KEY **하나**(BUS/AIRKOREA/KMA/HIRA/FOOD_API_KEY 폐기) · KMA_APIHUB · OLLAMA_{TAROT,SAJU,SAJU_G,MENU_MATCH}_MODEL · HOUSING_REFRESH_{CRON,MONTHS} · FOOD_RECIPE/MAFRA · MEAL_* (25차)
│   │       ├── lib/{csv,xlsx}.ts                      배포 파일 적재용 최소 리더 (신규)
│   │       ├── lib/{web-index,share-fonts}.ts         공유 OG head 주입(index.html 로드·자산 루트 후보)·satori 폰트 공용 헬퍼 — 타로부터 공용, 정산·투표는 각자 유지 (25차)
│   │       ├── test-utils/temp-db.ts                  useIsolatedDatabase() — DB 건드리는 테스트 필수 격리 (17파일)
│   │       ├── test-utils/schema-db.ts                useSchemaDatabase() — 현재 schema.prisma 로 빈 임시 DB(prisma db push), 실데이터 복사 없음 (7파일, 25차 — 사주(G) 세션)
│   │       └── modules/                               39 모듈
│   │           ├── tarot/                             리딩(LLM·정적 폴백·캐시)·프롬프트·공유 카드(satori)·OG 프리렌더 (25차)
│   │           ├── saju/                              사주(C) — 섹션 4개 병렬 job 메모리 레지스트리(long-poll, TTL 5분)·오늘/궁합/택일/음식·프로필·기록·공유 카드·OG (25차)
│   │           ├── saju-g/                            사주(G) — 별도 엔진(korean-lunar-calendar·lunar-typescript·Temporal)·프롬프트 검증·프로필·궁합·공유 PNG·OG + KASI __fixtures__ (25차, 다른 세션)
│   │           ├── usage-quota/                       공용 익명 사용량 한도 service(USAGE_QUOTA_DEFAULTS) + 어드민 route (25차)
│   │           ├── housing/                           집값 — rtms/kapt/bldg-hub/datago-json 어댑터, 단지·거래·공시가격·K-apt·건축물 마스터, 파생 통계, 지오코딩, 월 갱신 croner(housing-refresh) (25차)
│   │           ├── air-quality/ · weather/            에어코리아·기상청 프록시 (+__fixtures__ 실응답, 신규)
│   │           ├── life-map/                          CCTV·화장실·병의원 로컬 적재 + 셀 캐시 + 지역 검색 (신규)
│   │           │   ├── data/life-geocode-cache.json.gz     화장실·병의원 주소 지오코딩 캐시 압축본 39,181건 1.1MB (커밋 — 서버는 import:life-geocode)
│   │           │   ├── hira-hospital.adapter.ts · vworld-search.adapter.ts
│   │           │   └── life-map-{master,hospital-master,geocode,geocode-cache,search}.service.ts
│   │           ├── food/ · meal/ · meal-recognition/ · meal-recommendation/   카탈로그 / 식단 기록 / 사진 인식 / 추천 (신규) — food 에 메뉴 칼로리 판정 엔진(menu-nutrition·lexicon·LLM 매칭·web-estimate·세트 분해) + golden/ 골든셋 (25차)
│   │           ├── subway/ · vote/                    수도권 전철 / 그룹 투표 (2026-07)
│   │           ├── schedule/                cron 주기 정규화→글로벌 머지 (croner in-process)
│   │           │   ├── schedule-registry.ts          cron 타이머 + inflight(동시 1개) 모듈 singleton
│   │           │   ├── schedule.service.ts           bootstrap(stale running→interrupted) + run
│   │           │   └── schedule.route.ts             설정 CRUD / 수동 실행 / 이력
│   │           ├── settlement-extraction/  영수증 업로드 + vision LLM 추출 + 멀티 영수증 분할(N슬라이스)
│   │           ├── settlement/             N차 세션 CRUD + 분배 계산 + 공유 토큰 + draft 자동저장
│   │           │   ├── settlement.service.ts
│   │           │   ├── settlement.route.ts
│   │           │   ├── share-preview.ts             공개 OG SSR-lite (index.html <head> 주입 + og:image)
│   │           │   ├── settlement-card.ts           정산표 PNG 렌더 (satori+resvg + IBMPlexSansKR)
│   │           │   ├── settlement-draft.service.ts  (userId, placeIdKey) upsert
│   │           │   └── settlement-draft.route.ts
│   │           ├── contact/                단골 참여자 자동 적립 + /me/contacts
│   │           └── well-known/             AASA + assetlinks.json 동적 응답
│   ├── web/               Vite + React SPA (공개 + 어드민 + /me) → web 토픽
│   │   ├── eslint.config.mjs    @repo/config/eslint/react 확장
│   │   ├── vite.config.ts       Rolldown codeSplitting.groups(ol/react-vendor/query/radix/**three**) + /share/settlements · /tarot/s/*/image.png · /saju-c/s/*/image.png proxy (25차)
│   │   ├── public/tarot/cards/(webp 159장) · public/saju-c/images/(webp 45장)   제미나이 원본 → build 스크립트 산출물 (25차)
│   │   └── src/
│   │       ├── lib/embed.ts                          ?embed=1 → sessionStorage 'lp:embed' 기억 + 브리지 주입 감지 → PublicLayout 크롬 생략 (25차)
│   │       ├── components/{tarot,saju,saju-g,housing}/   11·11·12·6 파일 — tarot/saju 는 stage/(R3F 무대) + *Lite + *ReadingView(2D 공용) + *ShareSheet (25차)
│   │       ├── routes/{TarotPage,SajuPage,SajuGPage,HousingPage}.tsx · {Tarot,Saju,SajuG}SharedPage · SajuG{Pair,Profiles,History}Page · routes/{tarot,saju}/My*.tsx · routes/admin/AdminQuotasPage.tsx (25차)
│   │       ├── stores/housingPrefsStore.ts           localStorage 'lp:housing-prefs' (25차)
│   │       ├── components/PublicTopBar.tsx · PublicSidebar.tsx · AccountMenu.tsx   폭 예산(<md/md~lg/lg+/xl+) + 드로어 하단 계정·테마 (신규) — NAV 10개 + 계정 메뉴 "내 타로 기록" (25차)
│   │       ├── components/sheet/{BottomSheet,useMapSheets}.tsx   맛집 v2 시트 인프라 승격 — 대중교통·일상지도 공용 (신규)
│   │       ├── components/{air,weather,life-map}/   공개 생활정보 UI (신규) · weather/MyLocationChip.tsx 상단바 통합 알약
│   │       ├── routes/{AirQualityPage,WeatherPage,LifeMapPage}.tsx · routes/meal/ · routes/admin/AdminFoodPage.tsx (신규)
│   │       ├── stores/lifeMap{Prefs,Recent}Store.ts  localStorage 'lp:life-map-prefs' / 'lp:life-map-recent' (신규)
│   │       ├── stores/settlementPrefsStore.ts        localStorage exclude default
│   │       └── routes/         라우트 lazy 코드 스플리팅 + 핫패스 React.memo
│   ├── mobile/            Expo + RN 앱 → mobile 토픽
│   │   ├── eslint.config.mjs    @repo/config/eslint/react 확장 (React Compiler 진단 룰)
│   │   ├── DEEP_LINK_SETUP.md   Universal/App Links 설정 가이드
│   │   ├── app.config.ts        associatedDomains + intentFilters(autoVerify) + 사진 권한 문구(영수증+식단) + 플러그인 순서
│   │   ├── metro.config.js      Expo SDK 54 기본 모노레포 탐색으로 회귀 — 수동 watchFolders/nodeModulesPaths 제거 (신규, Hermes fix)
│   │   ├── plugins/with-personal-team-entitlements.js   무료 팀 로컬 빌드에서 aps-environment 제거 (신규)
│   │   ├── app/
│   │   │   ├── (tabs)/_layout.tsx                  ~/components/tabs-layout 위임 (web/native split) — 홈·맛집·대중교통·프로필
│   │   │   ├── tarot/index.tsx · saju-c/index.tsx   WebView 임베드 — 웹 /tarot?embed=1(·?spread=) / /saju-c?embed=1(·?tool=) 을 열고 로드 전 토큰·게스트 키·테마 주입, share/open 메시지 처리, Android 뒤로가기=WebView 히스토리 (25차)
│   │   │   ├── air/ · weather/ · life-map/         생활정보 화면 (홈 MyLocationCard 에서 진입, 신규)
│   │   │   ├── meal/{index,new,[id]}.tsx           식단 목록·달력·통계 / 사진 인식 입력 / 상세 (프로필·홈 TodayMealCard 진입, 신규)
│   │   │   ├── restaurant/[placeId]/settle/        new + [id]/index/edit (앱 정산)
│   │   │   ├── settlement/                         new + history + contacts
│   │   │   └── s/[token].tsx                       Universal Link 진입점 (/s/ 단축 경로, 2026-05-30 이동)
│   │   ├── src/lib/{lifeMapPrefsStore,lifeMapRecentStore,mealPhotoCache,mealReminders,mealDraftPhotos,queryClient}.ts   앱 전용 저장소·큐 (신규)
│   │   ├── src/lib/api-setup.ts                    + webUrl(EXPO_PUBLIC_WEB_URL, 기본 apiUrl 의 :3000→:5173) + setGuestKeyStorage/setSajuProfileStorage(AsyncStorage) 주입 (25차)
│   │   ├── src/components/home/{TarotEntryCard,SajuEntryCard}.tsx   홈 진입 카드(타로 보기·메뉴 타로 / 사주 보기·오늘의 운세) (25차)
│   │   └── src/components/settlement/              SettlementWizard / Step1~4 / *Sheet / *Editor
├── packages/
│   ├── api-contract/      Zod SSOT → api-contract 토픽 — schemas/ 43개 (+tarot/saju/saju-g/housing/usage-quota/menu-lexicon/menu-nutrition, 25차) + routes.ts `Routes.Tarot/Saju(/saju-c)/SajuG/Housing/UsageQuota`
│   │   └── eslint.config.mjs    @repo/config/eslint/base 직결
│   ├── shared/            FE 공통 (API 43 / hooks 47 / stores 30) → shared 토픽 (+tarot·saju·saju-g·housing·usage-quota api/hooks, guestKeyStore·tarotHistoryStore·sajuProfileStore·sajuG{History,Profile}Store·sajuGStorageMigration, **embedBridge.ts** 브리지 계약, 25차)
│   ├── utils/             순수 유틸 49 파일 → utils 토픽 (+tarot·tarotCards·tarotFlow·tarotMenu / saju·sajuCalendar·sajuAstroTable(생성물)·sajuText·sajuDaily·sajuMatch·sajuDatePick·sajuFood·sajuFlow·sajuImages·sajuInsights·sajuDayPillar / saju-g·saju-g-stories / housing·housingMarker, aiModel purpose 확장, 25차)
│   └── config/            tsconfig + ESLint 베이스 → config 토픽
│       └── eslint/{base,node,react}.js   base(TS) ← node(+Node 글로벌) / react(+react-hooks v7)
├── deploy.sh              운영 서버 배포 스크립트 — 케이스 1~8 (6·7·8 = 데이터 적재 전용) + 1·2·4 에서 일상지도·음식 카탈로그·**집값** 자동 점검 (25차: housing_data + 케이스 8 + K-apt 탐지 set -e 함정 수정)
├── docs/
│   ├── data-sources.md    원본 데이터 운영 가이드 — 보관표·적재 명령·평가셋 추출 코드·백업 대상·테스트 격리 경고 (+집값 5행·원재료 DB·큐레이션·fatsecret 실측, 25차)
│   ├── deploy-friendly.md pm2 + nginx + Cloudflare 운영 가이드 (ninelife.kr) + 음식 카탈로그 적재 + 사용자 업로드 파일 백업 (+타로·사주 nginx 블록 4개·SPA 폴백 충돌 절·사주 글리프, 25차)
│   ├── menu-calorie-engine.md   메뉴 칼로리 판정 규칙·골든셋·어휘 편집 (25차)
│   ├── PLAN-tarot.md · tarot-deck-prompts.md   타로 계획(결정 1~16·로드맵 0~4차·v3a·v2-앱·진행 기록) + 78장 프롬프트북 (25차)
│   ├── PLAN-saju.md · saju-image-prompts.md    사주(C) 계획(결정 1~5·명리 기본값 표·로드맵 0~7차·진행 기록) + 22장 프롬프트북 (25차)
│   ├── PLAN-saju-g.md · MIGRATION-saju-g.md · REVIEW-saju-g*.md   사주(G) 계획·검증 기록 + C/G 식별자 전환·DB 분리 문서 + 리뷰 3건 (25차, 다른 세션)
│   ├── mobile-ios-build.md  앱 iOS 링크 오류(prebuilt RN Release) 해결 절차 (신규)
│   └── PLAN-meal.md       식단 관리 구현 계획 + 진행 기록(1~6차, 2026-08-22~24) — 데이터 소스 표·결정 A~I (신규, 400줄)
├── ecosystem.config.cjs   pm2 (fork, 단일 인스턴스 — SQLite 락 회피) — 리포 미추적, 운영 서버에서 생성(내용은 docs/deploy-friendly.md "pm2 기동")
├── .gitignore             /data/(공공데이터 원본) · /assets-src/{tarot,saju}/raw/(이미지 원본, 25차) · /ios /android /app.json(루트 expo 오염) · apps/friendly/data/* 무시
├── pnpm-workspace.yaml    apps/* + packages/*
├── turbo.json             dev / build / typecheck / lint / test 파이프라인
├── tsconfig.base.json     루트 TS 베이스 (ES2022, strict, noUncheckedIndexedAccess)
├── CLAUDE.md              에이전트 가이드 (이 위키와 함께 본다) — "용어" 섹션 + iOS 링크 오류 안내 문단
├── AGENTS.md              코딩 에이전트 진입 가이드 — 위키 먼저(CONTEXT → INDEX → schema → topics → concepts)
└── TECH_STACK.md          전체 기술 스택 명세 (작성 시점 명세 — 실제 버전은 아래 Gotchas 버전 매트릭스)
```

### ESLint 인프라 — base ← node/react 확장 체인 (신규)

이전엔 앱만 ESLint 가 동작했으나, 이번 라운드에 4개 워크스페이스가 모두 `@repo/config/eslint/*` 를 확장하도록 연결됐다 — turbo `lint` 4/4 green.

```
packages/config/eslint/base.js   js.recommended + tseslint.recommended
                                  + consistent-type-imports(error) + no-console(warn) + no-undef(off)
        │
        ├── eslint/node.js   (+ Node 글로벌)  ←  apps/friendly/eslint.config.mjs
        ├── eslint/react.js  (+ react-hooks v7 recommended = React Compiler 진단 룰)
        │                                      ←  apps/web/eslint.config.mjs
        │                                      ←  apps/mobile/eslint.config.mjs (no-require-imports off)
        └── (base 직결)                        ←  packages/api-contract/eslint.config.mjs
```

각 워크스페이스는 base 의 룰을 받은 뒤 기존 위반에 맞춰 일부를 `warn` 으로 완화한다 — 앱·웹은 React Compiler 룰(set-state-in-effect/render·immutability·rules-of-hooks·purity·static-components), friendly 는 `prefer-const`/`no-useless-*`/`consistent-type-imports`. 정책은 "신규 코드에 경고로 가시성 유지, 정리되는 대로 error 승격" — [config](config.md) 참고.

### 공공데이터 원본 운영 — 리포 밖 원본 + 로더 기본 경로 + deploy 자동 점검 + 가공 캐시만 커밋 (신규)

지하철·버스 마스터(2026-07)에 이어 일상지도·음식 카탈로그까지 "배치 적재 후 로컬 조회" 데이터가 넷으로 늘면서 운영 규약이 한 문서([docs/data-sources.md](../../docs/data-sources.md))로 굳었다. 원칙 셋: ① 원본은 **적재기의 입력일 뿐** — DB 에 들어가면 서버는 파일을 보지 않으므로 갱신·재구축 때만 필요. ② 보관 기준은 **"다시 받기 얼마나 어려운가"** — 공개 URL 로 즉시 받는 건 지우고(AI Hub `kfood.zip` 16GB 는 추출 후 삭제), 로그인·심의가 걸리면 필요한 부분만 추출해 남긴다(평가셋 750장). ③ 표준 위치 `data/open/{food,life,eval}` 에 두면 로더가 기본으로 찾아 **인자 없이 적재**된다.

```
로컬/서버 data/open/  (git 밖 — .gitignore /data/)         리포(커밋)                                   운영 DB (prod.db)
  food/mfds-nutrition.csv ─┐                                                                              FoodItem 3,879종
  food/hansik-800.xlsx ────┼─ load:food-catalog [--classify --backfill-nutrition] ──────────────────────▶  (+영양·분류·별칭·알레르기)
  (API) 식품안전나라 레시피 ─┘   + 이 서버의 외식 어휘(global_menu_canonicals)
  life/cctv.csv ─────────── load:life-cctv <csv> ──────────────────────────────────────────────────────▶  LifeCctv 377,243
  life/toilet.csv ───────── load:life-toilets <csv> [--offline] ◀── import:life-geocode ◀── modules/life-map/data/life-geocode-cache.json.gz (1.1MB)
  (API) 심평원 15001698 ──── load:life-hospitals [--offline] (1,000행 × ~80콜, 좌표는 업스트림 99.99%)    LifeToilet 53,559 / LifeHospital
  eval/meal-photos/ ─────── probe:meal-vision --label-from-filename (적재 안 함 — 모델 비교 전용)          LifeGeocodeCache (재실행은 새 주소만 호출)
```

`deploy.sh` 가 API 배포 케이스(1·2·4)마다 `status:life-map`("ok cctv=N toilet=M geocoded=G hospital=H cache=C") / `status:food-catalog`("ok items=N classified=C nutrition=U meals=M") 한 줄을 `stat_val`(bash 정규식 — BSD sed `\b` 함정 회피)로 파싱해 **비어 있을 때만 첫 적재**하고, 이번 pull 로 지오코딩 압축본이 바뀌었으면(`GZ_CHANGED`) 캐시 가져오기 + 화장실 `--offline` 재적재(업스트림 0건). 상태를 못 읽으면 "0 종"으로 넘겨짚지 않고 건너뛴다(잘못 재적재하면 LLM 분류를 통째로 다시 돈다). 원본을 새로 올려 통째로 갱신하는 건 케이스 **6**(일상지도) / **7**(음식 카탈로그) — 코드 배포·재기동 없이 `pull → gen → 적재(force)`. 적재는 Prisma 로 DB 에 직접 쓰므로(WAL, 교체 트랜잭션 수 초~20초) 서버를 내리지 않는다. 카탈로그가 비면 오류 없이 자동완성·영양·추천 후보가 조용히 빈 채로 돌아가므로 배포 후 종수 확인이 체크리스트에 있다. life CSV 경로는 정리 규약(`life/*.csv`)을 먼저 보고 localdata.go.kr 원래 파일명(`CCTV정보.csv`/`공중화장실정보.csv`)을 폴백(`first_existing`) — 서버에 이미 올려둔 파일을 깨지 않기 위해(`5a84b63`). 이 패턴(원본 리포 밖 / 로더 기본 경로 / status 한 줄 / deploy 자동 점검 / 가공 캐시만 커밋)은 [life-map](life-map.md)·[food](food.md)·[subway](subway.md)·[bus](bus.md) 네 도메인에 걸친 횡단 패턴이고([open-data-master-load](../concepts/open-data-master-load.md)), 25차에 **집값**([housing](housing.md))이 다섯 번째로 합류했다 — `status:housing`("ok complexes=N geocoded=G trades=T rents=R from=YYYYMM to=YYYYMM stats=S") 을 같은 `stat_val` 로 읽어 단지 마스터가 비면 `data/open/housing/reb-complexes.csv` + 지오코딩 캐시 압축본(일상지도와 **공유**, `--offline`)으로 첫 적재, 거래가 비면 최근 `HOUSING_MONTHS`(기본 3)개월만 RTMS 첫 수집, 공시가격 zip·K-apt xlsx 는 파일이 있을 때만 보강, 마지막에 캐시만으로 좌표 보완. 백필·재수집은 케이스 **8**(`HOUSING_MONTHS=24 ./deploy.sh 8`, 장부가 있어 끊겨도 이어 받음). 실거래는 원본 파일이 없는 첫 API 적재 도메인이라 `HousingTradeSync` 장부 + 서버 `HOUSING_REFRESH_CRON`(croner, 라우트 플러그인 onReady 에서 기동) 월 갱신이 추가됐다.

### 운영 nginx 원본 + SPA 폴백 디렉터리 충돌 (25차)

운영 서버에만 있던 nginx 설정이 `ops/nginx/niney_life_pickr_v2_projects`(`35b35fd`, 사주(G) `e40b4c0` 이 블록 추가)로 리포에 들어왔다. 지금까지는 `docs/deploy-friendly.md` 의 조각 스니펫이 유일한 기록이었고, 타로·사주 배포마다 `^~` 블록을 손으로 옮기다가 어긋난 것이 계기다. 원본의 뼈대:

```
server nlpp.easypcb.co.kr (80→301 / 443 letsencrypt)   구 도메인 — 같은 dist·같은 :3000, /api/ 프록시 + SPA 폴백만 (^~ 공유 블록 없음)
server ninelife.kr, www (80 — Cloudflare Flexible SSL 종단)
  absolute_redirect off;                       nginx 301 을 상대 경로로 — 원본 구간이 http 라 절대 주소면 http://ninelife.kr 로 나가 https 로 한 번 더 튐
  location /api/                → :3000       X-Real-IP $http_cf_connecting_ip · X-Forwarded-Proto https · SSE 무버퍼 86400s
  location ^~ /share/settlements/ · ^~ /s/ · ^~ /r/ · ^~ /vote/       정산·맛집·투표 OG SSR-lite (기존)
  location ^~ /tarot/s/ · ^~ /saju-c/s/ · ^~ /saju-g/s/                타로·사주(C)·사주(G) 공유 OG + image.png (사주(G) PNG 는 /api 경유) (25차)
  location ^~ /tarot/cards/ · ^~ /saju-c/images/   webp 7일 캐시 + try_files $uri =404 — 1년 immutable 정규식엔 webp 가 없고, 없는 카드는 index.html 폴백 대신 진짜 404 여야 웹이 대체 카드를 그린다 (25차)
  location /                    try_files $uri /index.html;    ← `$uri/` 제거 (25차)
  location = /index.html        no-cache
  location ~* \.(js|css|png|…)$ 1y immutable
```

**`$uri/` 제거가 이번 라운드의 운영 사고 교정이다.** 웹 dist 에 `tarot/cards/`·`saju-c/images/` 디렉터리가 생기면서 `/tarot`·`/saju-c` 가 **실제 디렉터리**가 됐고, SPA 폴백이 `try_files $uri $uri/ /index.html` 이면 `/tarot` 직접 진입·새로고침이 `$uri/` 에 먼저 걸려 `301 → /tarot/` 후 인덱스가 없어 **403**(2026-09-05 운영 실측, `13b87e8` 기록). SPA 내부 이동은 멀쩡해서 늦게 드러난다. SPA 는 디렉터리 인덱스가 필요 없으니 `$uri/` 를 뺀다. 이 원본은 두 서버 블록 모두에 같은 수정이 들어가 있다. 배포 절차는 이제 "원본 수정 → 서버로 복사 → `nginx -t` → reload" 가 되지만 `deploy.sh` 는 nginx 를 건드리지 않는다(수동).

### 같은 기능의 두 구현 — 사주(C) / 사주(G) 공존 (25차)

사주는 두 세션이 각각 구현해 **둘 다 살아 있다**. 하나로 합치지 않고 경로·명칭·저장소·설정을 완전히 분리해 나란히 두는 것이 결정이다(`5f49026` C 측 경로 변경 2026-09-06, `e40b4c0` G 측 식별자 전환 2026-09-06, [docs/MIGRATION-saju-g.md](../../docs/MIGRATION-saju-g.md) 2026-09-07 리베이스 통합).

| 축 | 사주(C) — [saju-c](saju-c.md) | 사주(G) — [saju-g](saju-g.md) |
|---|---|---|
| 웹 | `/saju-c` · `/saju-c/s/:token` · `/me/saju-c(/:id)` | `/saju-g` · `/saju-g/pair` · `/saju-g/s/:token` · `/me/saju-g(/:id)` · `/me/saju-g/profiles` |
| API | `/api/v1/saju-c/*` (`Routes.Saju`) | `/api/v1/saju-g/*` (`Routes.SajuG`) |
| friendly | `modules/saju/` | `modules/saju-g/` |
| 엔진 | `@repo/utils` `saju*.ts` — astronomy-engine 로 생성한 절기·음력 표 내장, 진태양시(−30분)·역사 표준시·서머타임 보정, 자시 일주 경계 | `modules/saju-g/saju-g.engine.ts` — korean-lunar-calendar + lunar-typescript + Temporal, 표준시(DST 제외), 자정 경계, 태양시 보정 없음, 미확정 기둥 비움 |
| 계약 | `schemas/saju.ts` | `schemas/saju-g.ts` |
| Prisma | `SajuProfile`·`SajuReading` (`20260906110442`) | `SajuGProfile`·`SajuGReading`·`SajuGShare` (`20260906170000` 독립 생성) |
| AI purpose · env | `saju` · `OLLAMA_SAJU_MODEL`(kimi-k3) | `saju-g` · `OLLAMA_SAJU_G_MODEL`(kimi-k3) — 상호 fallback 없음 |
| 한도 feature | `saju-reading`(30/300/20/3000/90%) | `saju-g-reading`(20/200/10/1000/90%) |
| 기기 저장 | `saju-profiles-v1`(shared `sajuProfileStore`, 앱도 주입) | `lp:saju-g-profiles:v1:guest` · `lp:saju-g:v1:<principal>` · `lp:saju-g-share:<token>` (+이전 키 마이그레이션) |
| 3D | 흑요석 천문도 원판·인장·먹 번짐(R3F) + Lite | 먹색·옥빛 천문대(R3F lazy) + SVG/정적 대체 |
| 공유 이미지 | satori 1200×630 / 1080×1920, 한자는 글리프 PNG | PNG 1080×1440(`/api/v1/saju-g/shares/:token/image.png`), 한자는 벡터 상징 |
| 앱 | WebView 임베드 `app/saju-c` + 홈 카드 | 미연동 |
| 이름 노출 | 메뉴·홈 카드·앱 헤더·공유 제목만 "사주(C)"(본문·모듈·DB·feature 는 `saju`) | 공개 명칭 "사주(G)", 내부 식별자 전부 `SajuG*`/`saju-g` |

G 의 마이그레이션은 C 의 공개 마이그레이션 뒤에 G 테이블만 독립 생성하도록 정리됐고(리베이스 전 로컬 G 마이그레이션 3개는 C 와 테이블명이 겹쳐 하나로 재작성), C 데이터를 G 로 복사하거나 C 의 모델·한도를 G 로 바꾸지 않는다. 둘이 공유하는 것은 **usage-quota 모듈·`resolveOptionalUser`·web-index OG 헬퍼·어드민 AI 키/한도 탭의 행 노출**뿐이다. 위키에서도 `saju-g.md` 는 그 세션이 직접 쓴 토픽이라 이번 컴파일이 다시 쓰지 않는다.

### 로그인 없는 공개 LLM 기능의 공통 골격 — 타로·사주 (25차)

타로(`cd5a29b`)에서 처음 만들어 사주(C)·사주(G)가 그대로 물려받은 규약. 자세한 건 [anonymous-usage-quota](../concepts/anonymous-usage-quota.md)·[embedded-webview-bridge](../concepts/embedded-webview-bridge.md)·[webgl-stage-lite-fallback](../concepts/webgl-stage-lite-fallback.md).

```
클라이언트                                   friendly
  게스트 키(X-Guest-Key, UUID, shared guestKeyStore 'guest-key-v1' — 앱은 AsyncStorage 주입)
  Authorization(있으면)                       plugins/jwt resolveOptionalUser → 회원 | null (무효 토큰도 게스트, 401 아님)
      ▼ POST /tarot/readings · /saju-c/readings · /saju-g/readings
                                              @fastify/rate-limit — max 는 어드민 설정 ipPerMinute 를 읽는 함수(회원도 적용)
                                              usageQuota.consume(feature, {userId, guestKey, ip})
                                                 회원: 전역 일일만 / 게스트: 게스트 키·IP·전역(guestCutoffPct 에서 먼저 컷)
                                                 초과 → 정적 해석(타로) / 정적 본문(사주) — 기능은 항상 동작
                                              계산(utils 결정적) → LLM(purpose 별 모델, 키는 chat 상속 또는 own) → 정적 폴백
                                              회원이면 저장(readingId) / 게스트는 무저장(공유 시에만 서버 행)
      ▼ 공유: 게스트는 입력 재전송 → 서버가 본문 확보, 회원은 readingId → 토큰 / OG·image.png 는 web-index + satori
```

한도 값은 env 가 아니라 코드 기본값(`USAGE_QUOTA_DEFAULTS`) + 어드민 DB 행(`UsageQuotaSetting`, 30초 캐시)으로 통일됐고, 카운터(`UsageQuotaCounter`)는 SQLite 영속(식단 `MealDailyQuota` 와 같은 원칙) + 매일 04:40 GC.

### 출처 4종 + canonical 그룹핑 레이어 (변동 없음)

크롤 출처가 한 개에서 넷으로 늘어나면서 "출처 가로지르는 같은 가게" 문제가 생겼다. 해결 구조:

```
Naver Place ──┐
Diningcode  ──┼──→ Restaurant (source, sourceId)  ──→  CanonicalRestaurant (N:1)
Catchtable  ──┤
Tabling     ──┘   (18차 — place↔partner 티어는 저장 시 자동 승격)
```

자세한 모델·매칭 로직: [friendly](friendly.md), [canonical](canonical.md).

### 백엔드 도메인 맵 (`apps/friendly/src/modules/`)

| 도메인 | 역할 | 위키 |
|---|---|---|
| `auth` | 회원가입 / 로그인 / JWT | — |
| `admin` | 사용자 목록 / 관리자 role 토글(`setRole`) | — |
| `picks` | 선택지 등록 + 무작위 픽 (휴면 — UI 없음, 식단은 이 모듈을 확장하지 않고 독립 구현) | — |
| `crawl` | 네이버 / DC / 캐치테이블 / **테이블링** 크롤 (Playwright + HTTP 어댑터별 분기, Naver done 후 자동 DC 매칭+머지 후크, naver stealth/jitter, SSE seq 단일화). 테이블링은 무인증 REST(검색/상세/사이트맵 발견) | [crawl](crawl.md) |
| `auto-discover` | AI 키워드 8개 → 다중 검색 → 그룹 5병렬 자동 발견 잡 (순차 큐 + 후보 확인 후 등록) | [auto-discover](auto-discover.md) |
| `random-crawl` | cron 으로 지역 랜덤 선정 → 검색 → 후보 텔레그램 push → 사용자가 고른 가게만 크롤 (사람이 끼는 2단계 비동기 상태머신) | [random-crawl](random-crawl.md) |
| `telegram` | 텔레그램 봇 (long-polling) — `/search`·`/discover`·`/stats` 커맨드 + 크롤 진행/완료 알림 + 어드민 설정 | [telegram](telegram.md) |
| `review-search` | 리뷰 RAG/문맥검색 — enrich(bge-m3 임베딩) → 하이브리드 회수 → 리랭크 → RAG 생성 → 검증 가드레일. 어드민 + 공개 무인증 QA | [review-search](review-search.md) |
| `review-clustering` | 리뷰 군집화 — UMAP→HDBSCAN→c-TF-IDF→LLM 라벨 (Python 사이드카 런타임). 공개 읽기 전용 | [review-clustering](review-clustering.md) |
| `logs` | 전 기능 횡단 범용 작업 로그(`OperationRun`/`Log`/`Report`) + 실패 run LLM 자동 분석 + 보존 정리 | [logs](logs.md) |
| `ai` | LLM 라우팅 + `purpose` 분리(chat/image/log-analysis/meal-photo/meal-recommend/**tarot/saju/saju-g** — 8종) + 모델 preview + **계정 단위 2단 동시성 게이트** + **사용량 텔레메트리 SSE** + 키 1계정 공유·용도별 모델 | [ai](ai.md) |
| `tarot` | 타로 리딩(공개, 옵셔널 인증) — 카드·스프레드·주제·질문 → LLM 해석(purpose `tarot`) + 정적 폴백 + 캐시, 메뉴 타로 v3a, 회원 기록, 공유 토큰·OG·satori 이미지(`tarot-preview.ts`·`tarot-share-card.ts`) | [tarot](tarot.md) |
| `saju` | 사주(C)(공개, `/saju-c/*`) — 원국 재계산 → 섹션별 캐시 → 한도 1건 → 섹션 4개 병렬 LLM(purpose `saju`) job 레지스트리 + long-poll(410 = 재시작) → 정적 폴백, 오늘(회원 하루 1회 잠금)·궁합·택일·음식, 프로필 10·기록·공유 카드·OG | [saju-c](saju-c.md) |
| `saju-g` | 사주(G)(공개, `/saju-g/*`) — 별도 엔진(명식 먼저) + Kimi 해석(purpose `saju-g`, Zod·근거 검증, 60초·재시도 1) + 메모리 캐시·영수증, 출생 프로필·두 사람 궁합·명시적 보관·공개 상징 공유(10자 토큰)·PNG·OG | [saju-g](saju-g.md) |
| `usage-quota` | 공용 익명 사용량 한도 — feature × scope(guest/ip/global/user) × 날짜 카운터, 설정 30초 캐시, 어드민 `/admin/quotas` overview/PUT, 04:40 GC. 소비처 tarot·saju·saju-g | [usage-quota](usage-quota.md) |
| `housing` | 집값(공개) — 로컬 DB 조회(status/points/nearby/search/complexes/:id/trades), 적재 서비스(단지·거래·공시가격·K-apt·건축물·파생 통계·지오코딩), `housing-refresh` croner 월 갱신(`HOUSING_REFRESH_CRON`), 어댑터 rtms/kapt/bldg-hub | [housing](housing.md) |
| `settlement-extraction` | 영수증 업로드 + vision LLM 추출 + 멀티 영수증 분할 (`ExtractReceiptSplit { count, index }`) | [settlement](settlement.md) |
| `settlement` | N차 세션 CRUD + 분배 계산(`calculateMultiRoundShares`) + 공유 토큰 + draft 자동저장 + **공유 OG SSR-lite**(`share-preview.ts`) + **정산표 PNG**(`settlement-card.ts`). `PUT /:id` 풀 리플레이스 | [settlement](settlement.md) |
| `contact` | 단골 참여자 자동 적립 + `/me/contacts` | [settlement](settlement.md) |
| `well-known` | `/.well-known/apple-app-site-association` + `/.well-known/assetlinks.json` 동적 응답 (env 기반, 미설정 시 404) | — |
| `schedule` | cron 주기 자동 실행 (정규화→글로벌 머지 증분). croner in-process, plugin 전역 singleton + registry(cron 타이머 + 동시 1개 inflight), 부팅 stale 정리 + cron 등록 | [schedule](schedule.md) |
| `summary` | 리뷰 단위 분석 v4 (메뉴 멘션 + 태그) | [ai](ai.md) |
| `restaurant` | 어드민 식당 CRUD + 공개 list/detail/insights/ranking (식당명 경량 조회 추가) + 공개 `menu-nutrition`(메뉴 탭 칼로리, 지연 조회, 25차) | — |
| `canonical` | 출처 가로지르는 같은 가게 묶기 + 머지 제안 큐 | [canonical](canonical.md) |
| `bus` | 서울시 버스 API 프록시 — 정류장 검색/주변/실시간 도착/노선/실시간 차량 위치 (공개) + 즐겨찾기(인증). 마스터 로컬 적재(`load:bus-stations`) + in-memory 일일 쿼터 게이트, `BUS_API_KEY` env | [bus](bus.md) |
| `subway` | 수도권 전철 — 역 검색(로컬 마스터)·실시간 도착/열차 위치(swopen)·노선 형상·시간표 블롭·혼잡도·경로 탐색·즐겨찾기 | [subway](subway.md) |
| `vote` | 그룹 투표 픽 — 방장 생성 + 링크 비로그인 찬성 투표 + 수동 마감 + smartPick 티브레이크, `/vote/*` OG SSR-lite | [vote](vote.md) |
| `air-quality` | 에어코리아 대기정보 프록시 — 시도 실시간/측정소 이력·지도·주변·검색/예보·주간예보 (공개) + 내 대기 위치 저장(인증). 캐시 측정 10분·예보 20분·주간 60분·측정소 24h. 키 `DATA_GO_KR_API_KEY`(25차 통일) | [air-quality](air-quality.md) |
| `weather` | 기상청 초단기실황/단기·중기예보 + API허브 AWS 매분 관측 프록시 (공개). 발표 시각 단위 캐시(폴백/결측 시 5분 단축). `DATA_GO_KR_API_KEY` + `KMA_APIHUB_KEY`(별도) | [weather](weather.md) |
| `life-map` | 전국 CCTV·공중화장실·병의원 로컬 적재 + points/nearby/detail/status + 지역 검색(행정구역·역·정류장·VWorld 주소). 셀 격자 10분 LRU, 요청 경로 외부 호출 0. 적재는 scripts + deploy.sh 자동 점검 | [life-map](life-map.md) |
| `food` | 음식 카탈로그 마스터 — 다중 소스 적재(파일·API·외식 어휘·원재료 DB·큐레이션 주류표)·정규화 병합·field observation/conflict·LLM 2축 분류·영양/알레르기 근거·자동완성·어드민 CRUD + 적재 잡 SSE + **메뉴 칼로리 판정 엔진**(kcalPer100g·3등급 판정·LLM 매칭 어휘 캐시·fatsecret 웹 실측·세트 분해·어휘 어드민, 25차) | [food](food.md) |
| `meal` / `meal-recognition` / `meal-recommendation` | 로그인 사용자 식단 기록·사진·통계·선호·백업/복원·retention / 사진 → vision LLM 인식(purpose `meal-photo`) / 패턴 분석 + LLM 추천(purpose `meal-recommend`) + 피드백 학습. SQLite 영속 일일 쿼터(`MealDailyQuota`) | [meal](meal.md) |
| `media` | 리뷰 사진/동영상 + 썸네일 프록시(메뉴 탭은 리사이즈본 — 원본 2.4MB 디코딩이 스크롤 버벅임 원인, `0997a69`) + 파노라마 503/TTL 영구 사본 캐시 | [friendly](friendly.md) (media 모듈) |
| `menu-grouping` | 식당별 메뉴 정규화 (synonym → canonical) | [menu-grouping](menu-grouping.md) |
| `analytics` | 전역 메뉴 머지 + 카테고리 path + 통계 트리. 택소노미 v3(재료·메뉴군 축, `GLOBAL_MERGE_VERSION` 3), LLM 출력 배열 스키마(Ollama grammar) + 청크 10, `buildCategoryTree` 공용 | [analytics](analytics.md) |
| `settings` | 외부 SDK 키 — `map.route.ts`(vworld, 공개 config + 어드민) + `telegram.route.ts` | [map](map.md) · [telegram](telegram.md) |
| `health` | 헬스체크 | — |

빌드 의존 관계: turbo가 `^build` 종속을 자동 추적한다. `dev` 태스크는 캐시 비활성화 + persistent로 워치 모드 유지. `lint` 태스크는 이번 라운드 4 워크스페이스 모두 green.

### 공개 / 인증 사용자 / 어드민 3-레이어 분리 정책

라우트 prefix 로 가른다 — 백엔드의 모든 어드민 엔드포인트는 `/api/v1/admin/*` 아래에 모이고, 사용자 본인 자원은 `/api/v1/me/*` 또는 `/api/v1/settlements/*` / `/api/v1/settlement-drafts/*` (인증 필요), 그 외는 공개. `app.requireAdmin` 가드는 `admin/` prefix 라우트에만, `app.requireAuth` 는 사용자 자원 라우트에 붙는다. FE 도 같은 정책:

| 영역 | 레이아웃 | 라우트 | 가드 |
|---|---|---|---|
| 공개 | `PublicLayout` (TopBar 폭 예산 + lg 미만 드로어 사이드바 — md 미만에선 계정·테마도 사이드바 하단) | `/`, `/restaurants`, `/restaurants-v2`, `/r/:placeId`, `/bus`, `/subway`, `/air`, `/weather`, `/life-map`, `/housing`, `/tarot`, `/tarot/s/:token`, `/saju-c`, `/saju-c/s/:token`, `/saju-g`, `/saju-g/pair`, `/saju-g/s/:token` | 없음 (타로·사주 LLM 호출은 게스트 키·IP·전역 일일 한도, 옵셔널 인증) |
| 공개 — 임베드 | `PublicLayout` 크롬 생략(`?embed=1` 또는 앱 브리지 주입, sessionStorage `lp:embed` 로 후속 페이지도 유지) | 위 공개 라우트 전부 — 실사용은 앱 WebView 의 `/tarot`·`/saju-c` | 없음 (앱이 토큰·게스트 키 주입) |
| 공개 (레이아웃 없음) | 단독 | `/s/:token`(정산 공유), `/vote/:token`(투표) | 없음 (토큰) |
| 인증 사용자 | `PublicLayout` 또는 단독 | `/me/meals`, `/me/settlements`, `/me/contacts`, `/me/tarot(/:id)`, `/me/saju-c(/:id)`, `/me/saju-g(/:id)`, `/me/saju-g/profiles`, `/vote/new`, `/restaurants/:placeId/settle/new`, `/restaurants/:placeId/settle/:id` | `RequireUser` (token, role 무관) — 사주(G) `/me/*` 는 페이지 안에서 로그인 여부 분기 |
| 인증 진입 | (단독) | `/login` | 없음 |
| 어드민 | `AdminLayout` (좌측 사이드바) | `/admin/*` | `RequireAdmin` (token + role=ADMIN) |

공개 영역은 Pretendard 변수 폰트 + 텍스트 사이즈 시프트가 적용되고, 어드민은 시스템 폰트 fallback. 공유 정산 토큰 경로(`/share/settlements/:token`) 는 비인증이지만 `PublicLayout` TopBar 도 띄우지 않아 받는 사람이 단순히 결과만 보게 한다 — 앱이 설치된 단말에선 OS 가 인터셉트해 `apps/mobile/app/s/[token].tsx`(`/s/` 단축 경로, 2026-05-30 이동) 가 직접 열리고, JS 미실행 크롤러는 friendly 의 OG SSR-lite 응답을 받는다.

### 정산 공유 OG SSR-lite 흐름 (신규)

```
공유 링크 노출: /share/settlements/:token (별칭 /s/:token)
   ▼ ── 누가 긁느냐로 갈린다 ──
   ├─ 일반 브라우저: friendly 가 build 된 index.html <head> 에 OG 메타 주입해 반환 → SPA 평소대로 부팅
   ├─ SNS 크롤러(카카오/슬랙/텔레그램, JS 미실행): 같은 HTML → <head> 의 og:* 만 읽음
   │     og:title = 식당명, og:description = 총액·인원수 (참가자 이름은 미노출 = 프라이버시)
   │     og:image = /share/settlements/<token>/image.png
   └─ 앱 설치 단말: OS 가 Universal/App Link 로 인터셉트 → 앱이 직접 열림

og:image PNG (settlement-card.ts):
   satori + resvg 로 정산표 매트릭스(행=참여자, 열=차수·카테고리·소계·총계) 즉석 렌더
   한글 폰트 apps/friendly/assets/fonts/IBMPlexSansKR-{Regular,Bold}.ttf (레포 커밋 — git pull 만으로 배포)
   만료/없는 토큰 → 404 → 크롤러는 OG_IMAGE_PATH 기본 이미지(og-default.png)로 폴백
   공유 시트의 "정산표 이미지로 공유" 버튼도 같은 라우트 사용
```

nginx 운영 주의: 이 경로엔 **`location ^~ /share/settlements/`·`^~ /s/` 필수**. `.png` 로 끝나는 og:image 요청이 정적 캐싱용 `location ~* \.(png|...)$` 정규식 location 에 가로채여 web/dist 에서 파일 못 찾고 404 나는 걸 막는다("dev OK / prod 404" 전형). `^~` = prefix 최장 매칭이면 정규식 검사 skip. 또 Cloudflare 가 `.png` 를 엣지 캐시하므로 잘못된 404 가 한 번 캐시되면 nginx 고쳐도 **Purge** 전까진 404 보임. 성공 응답은 origin `cache-control: public, max-age=300` 따라 5분 엣지 캐시. `index.html` 은 프로세스 메모리 1회 캐시 → 재배포 후 `pm2 reload friendly` 필수.

### 주기 자동 실행(schedule) 흐름 (신규)

```
어드민 AdminAnalyticsPage "자동 실행 스케줄" 섹션
   ▼ cron 식 + timezone(기본 Asia/Seoul) + enabled → PUT 설정 (schedule_configs upsert, jobType='normalize-merge')
   ▼
plugins/schedule.ts — ScheduleService 를 app 전역 singleton 으로 decorate
   ▼ (자체 AiConfigService 생성 — autoload 알파벳순 'schedule' < 'summaries' 라 app.aiConfig 재사용 불가)
scheduleRegistry (모듈 singleton) — croner Cron 타이머 + inflight AbortController(동시 1개)
   ▼ 부팅: server.ts → app.schedule.bootstrap()
   ▼   직전 인스턴스에서 running 으로 남은 schedule_runs → interrupted 로 정리 + enabled 설정 cron 등록
   ▼ cron tick:
   ▼   이전 실행 미완료면 이번 tick skip(schedule_runs status='skipped' 행 남김 — overlap 방지)
   ▼   대상 수집 → 크롤 진행 중 식당 제외(crawl.isPlaceCrawling) → 정규화(grouping) → 글로벌 머지(증분)
   ▼   schedule_runs: running → done/failed, schedule_configs.lastRunAt/lastStatus 비정규화 갱신
   ▼ SIGTERM: scheduleRegistry.stopAllCrons() + abortInflight() + forceCloseConnections (graceful)
```

nextRunAt 은 저장 안 함 — croner 로 매번 계산(저장하면 stale). 단일 Fastify + no-Redis 전제와 일관 — 외부 잡 큐 없이 in-process. 자세한 건 [schedule](schedule.md).

### 정산 도메인 흐름 (N차 모델)

```
식당 상세 → "정산하기" 버튼
   ▼
/restaurants/:placeId/settle/new (RequireUser) — 웹
restaurant/[placeId]/settle/new — 앱
   ▼ Step1 — 마스터 참여자 입력 (단골 자동완성 + 다중 선택, 단일 필드 + 별칭 토글 + Enter 추가, exclude default = settlementPrefsStore 영속)
   ▼ Step2Rounds — N 차(1..10) 입력. 차수마다 식당 / source(MANUAL|RECEIPT) / attendees subset / 항목 / 할인 / 다듬기
   ▼   영수증인 경우: POST /settlement-extraction/upload → POST /settlement-extraction/extract
   ▼     (멀티 영수증 1장 N분할이면 같은 imageToken 으로 count=N, index=1..N N 회 호출)
   ▼ Step3 — 차수별 항목 편집 (메뉴 추가/금액 수정/카테고리 변경) — items 200 cap, attendees 100 cap
   ▼ Step4 — 결과 분배 (excludeAlcohol/NonAlcohol/Side 토글 + RoundCategoryAdjuster(100/1000 round + leftoverParticipant) + RoundDiscountEditor)
   ▼ POST /settlements ({ fromDraftId? })
   ▼   server: calculateMultiRoundShares — round 별 calculateShares (attendee subset) → master-index 합산
   ▼   server: fromDraftId 가 본인 소유면 같은 트랜잭션에서 SettlementDraft 삭제
   ▼   server: 모든 participant → SettlementContact (userId, normalizedKey) upsert
   ▼
/restaurants/:placeId/settle/:id — 차수별 카드 + sticky 정산표 (z-30 헤더로 sticky 위 클리어)
   ▼ PUT /settlements/:id — 풀 리플레이스 (rounds/participants/items 전체 교체, items 도 변경 가능)
   ▼ POST /settlements/:id/share → shareToken 멱등 발급 / DELETE 회수
   ▼
/share/settlements/:token — 비인증 read-only + OG SSR-lite (앱 설치 시 OS 인터셉트, 미설치 시 웹 SPA fallback, 크롤러는 OG)
```

stepper UI 패턴 — 헤더에 sticky, 현재 단계 강조, **완료된 단계만 자유 점프** 가능. **서버 draft 자동저장** 은 5초 debounce 로 store 변화를 PUT — placeId 가 null 이면 `/me/settlements/new` 슬롯, 문자열이면 해당 1차 식당 슬롯. draft hydrate 는 이번 라운드 perf 정비로 **placeId 당 1회**만. 자세한 동선·검증: [settlement](settlement.md).

## Talks To [coverage: high — 16 sources]

내부 패키지 의존 그래프 (단방향 — 순환 금지):

```
api-contract  ← 의존 ←  friendly, shared
shared        ← 의존 ←  web, mobile
utils         ← 의존 ←  friendly, web, mobile, shared (순수 함수만)
config        ← 의존 ←  모든 워크스페이스 (tsconfig/eslint — eslint.config.mjs 가 @repo/config/eslint/* 확장)
```

런타임 통신:
- 웹 → friendly (`VITE_API_URL`, dev에선 Vite proxy `/api` → `:3000` + `/share/settlements` → `:3000`(OG/정산표 PNG) + `/tarot/s/*/image.png`·`/saju-c/s/*/image.png` → `:3000`(공유 이미지만 — HTML 은 dev 에선 Vite 가 SPA 로 서빙, prod 는 nginx `^~` 가 둘 다 friendly 로); `server.host: true` 로 LAN/모바일 단말에서도 dev 서버 접근)
- 앱 → friendly (`EXPO_PUBLIC_API_URL`, 빌드 시점 주입. Expo Web 은 `window.location.host` 가 LAN IP 면 friendly base URL 도 같은 LAN IP 로 자동 매칭. 운영 빌드는 `.env.production` 자동 로드)
- **앱(WebView) → 웹 origin** (25차) — `webUrl`(`EXPO_PUBLIC_WEB_URL`, 없으면 apiUrl 의 `:3000`→`:5173`, 운영은 API 와 같은 도메인이라 그대로)의 `/tarot?embed=1`·`/saju-c?embed=1` 을 `react-native-webview` 로 연다. 앱 → 웹은 로드 전 `window.__LP_EMBED__ = {token, guestKey, theme}` 주입(`injectedJavaScriptBeforeContentLoaded`, JSON 직렬화 — 토큰은 URL 에 싣지 않음), 웹 → 앱은 `postMessage(JSON)` `share`(OS 공유 시트)/`open`(외부 브라우저)/`title`. 같은 origin 이동은 WebView 안, 밖은 외부 브라우저. 계약은 shared `embedBridge.ts` 한 곳 — [embedded-webview-bridge](../concepts/embedded-webview-bridge.md)
- 웹/앱 → friendly 공개 LLM 라우트 (25차) — `X-Guest-Key` 헤더(shared `guestKeyStore`, 웹 localStorage `guest-key-v1` / 앱 AsyncStorage 주입 → WebView 에도 같은 키) + 옵셔널 `Authorization`. 타로 리딩·사주(C) 섹션 job long-poll(`GET /saju-c/readings/jobs/:id?after&wait=20000`, `useQuery refetchInterval`)·사주(G) chart→readings 2단
- friendly → SQLite 파일 (`apps/friendly/data/dev.db`, 운영 `prod.db`)
- friendly 내부 — `croner` in-process cron 타이머가 주기마다 menu-grouping → analytics(글로벌 머지) 서비스 호출 (외부 잡 큐 없음 — no-Redis 전제 일관)
- 앱/웹 → `useColorScheme`(OS) — 테마 모드 system 일 때 결합. 저장은 플랫폼별 localStorage / AsyncStorage `'lp:themeMode'`, design 토큰만 shared
- friendly → 디스크 (`apps/friendly/data/receipts/<token>.jpg` — 영수증 이미지. 멀티 분할은 같은 token 재사용 + sharp crop)
- friendly → 디스크 (`apps/friendly/assets/fonts/IBMPlexSansKR-*.ttf` — 정산표 PNG 한글 렌더 + `apps/web/dist/index.html` 읽어 OG 메타 주입)
- friendly → 네이버 / DC / 캐치테이블 (Playwright + 어댑터, naver stealth + jitter)
- friendly → 네이버 CDN (`/api/v1/media/thumbnail` 프록시) → [friendly](friendly.md) (media 모듈)
- friendly → LLM provider(Ollama Cloud) — `purpose` **8종**(`chat`/`image`/`log-analysis`/`meal-photo`/`meal-recommend` + 25차 `tarot`/`saju`/`saju-g`), DB 우선 + `.env` 폴백, 나머지 용도는 chat 계정 키 상속(공개 익명 트래픽을 격리하려면 purpose 전용 키 own). 기본 모델 `gpt-oss:120b` / `qwen3.5:397b-cloud` / `deepseek-v4-pro` / `gemma4:31b` / `gpt-oss:120b` / **`gpt-oss:120b`(tarot, 프로브 4/4·p50 2.1s)** / **`kimi-k3`(saju — 3사주×4섹션 프로브, JSON 12/12, 문맥 자연스러움 우선, p50 5.6s)** / **`kimi-k3`(saju-g)**. 메뉴 칼로리 LLM 매칭은 별도 purpose 없이 chat 키 + `OLLAMA_MENU_MATCH_MODEL`(gemma4:31b, 골든셋 84건 88%). 모델 preview 라우트로 키 검증 후 저장. `buildLlmProviderEnv` 로 env 조립 일원화(`cc8399a`)
- **friendly → data.go.kr 공공데이터포털** — 키는 **계정당 1개**라 25차에 `DATA_GO_KR_API_KEY` **하나로 통일**(`3d9dfed`, 이전 `BUS/AIRKOREA/KMA/HIRA/FOOD_API_KEY` 폴백 체인 폐기). 데이터셋마다 **활용신청만 추가**하면 같은 키: 버스 15000303·15000332 / 에어코리아 15073861(일 500건) / 기상청 단기 15084084·중기 15059468(일 10,000) / 심평원 15001698(적재만, ~80콜) / **국토부 실거래가 15126468(매매 상세)·15126474(전월세)**(적재·월 스케줄러·probe:rtms, 일 10,000 — 24개월 백필 ≈ 12,000콜) / **K-apt 15057332·15058453**(`--source=api`, 일 5,000) / **건축HUB 15134735**(load:housing-buildings, 일 10,000, 단지당 2콜) / 식약처 15100070(**선택** — CSV 배포본이 기본, `fetch:mfds-nutrition` 이 포털 JS 다운로드를 재현). 빈 값이면 해당 라우트 503·스크립트 종료. 어댑터는 에어코리아 패턴(`pageNo/numOfRows`, `callAllPages`, `toServiceKeyPart`, 20s 타임아웃 — 심평원은 40s + 일시 오류 2회 재시도, 응답 본문 코드로 에러 분류)을 공유. 실응답은 `probe:*` 로 `__fixtures__` 에 박음([external-api-proxy-fixture](../concepts/external-api-proxy-fixture.md))
- friendly(적재 스크립트·월 스케줄러) → VWorld 지오코더 — 집값 단지 지번 주소도 일상지도와 **같은 `LifeGeocodeCache`·압축본**에 실린다(운영은 `--offline` 호출 0건, 로컬 온라인 적재 후 `export:life-geocode` 커밋). 메뉴 칼로리는 카탈로그에 없는 음식만 **fatsecret.kr 검색 페이지**를 직접 받아 100g당을 집계(`food-web-estimate.ts`, 어휘당 1회·1초 간격·영구 캐시 — LLM·검색엔진은 숫자 추출에 안 씀) (25차)
- friendly → 기상청 API허브(`apihub.kma.go.kr`, `KMA_APIHUB_KEY` — data.go.kr 와 별개 발급) — AWS 방재기상관측 10분 관측으로 현재 날씨 보강, 비우면 보강만 꺼짐 (신규)
- friendly(적재 스크립트) → 식품안전나라 `COOKRCP01`(`FOOD_RECIPE_API_KEY`, 1,156건 2콜) / data.mafra.go.kr(`MAFRA_API_KEY`, 선택·평문 HTTP·서버 배치만) / VWorld 지오코더(화장실·병의원 좌표 결측분 — 어드민 지도 키 DB 우선, `.env VWORLD_API_KEY` 폴백, 일일 한도 분할 `--max-calls`) (신규)
- friendly → 디스크 `apps/friendly/data/meal-photos/<userId>/<token>.jpg`(+`_t.jpg`) — 식단 사진, EXIF 제거, 미연결 24h 후 04:30 GC + 삭제 outbox (신규). 적재 스크립트 → 리포 밖 `data/open/` 원본(읽기만)
- 웹/앱 → OS 위치(내 위치) → friendly `/air/stations/nearby`·`/weather/*` — 상단바 `MyLocationChip`(웹)/홈 `MyLocationCard`(앱)가 10분 주기 조용히 갱신, 저장 위치는 로그인 시 서버 `AirUserLocation`, 게스트는 `airLocationStore` 로컬
- 웹 → vworld WMTS (OpenLayers 직접 fetch)
- 웹 → jsDelivr CDN (Pretendard 변수 폰트 — 공개 페이지)
- 공유 정산 토큰 read 는 비인증 — `GET /api/v1/share/settlements/:token`(응답에서 `receiptPreviewUrl`/`userId` 제거) + OG HTML/PNG 응답
- iOS/Android → friendly `/.well-known/*` — OS 가 설치 시 자동 검증해서 `/share/settlements/*` 매칭 URL 을 앱으로 인터셉트
- SNS 크롤러(카카오/슬랙/텔레그램) → friendly `/share/settlements/:token` · `/r/:placeId` · `/vote/:token` · **`/tarot/s/:token` · `/saju-c/s/:token` · `/saju-g/s/:token`** → OG 메타 + `image.png`(타로·사주(C)는 같은 경로 `?format=og|story`, 사주(G)는 `/api/v1/saju-g/shares/:token/image.png`). `app.ts` 가 `registerTarotPreview`·`registerSajuPreview`·`registerSajuGPreview` 를 정산·맛집·투표 프리뷰 뒤에 등록 (25차)
- **운영 토폴로지** — Cloudflare(엣지 캐시 + Flexible SSL) → nginx(`ops/nginx/` 원본: `location /api/` + `^~` 프록시 7개(`/share/settlements/`·`/s/`·`/r/`·`/vote/`·`/tarot/s/`·`/saju-c/s/`·`/saju-g/s/`) + webp 7일 캐시 2개 + SPA `try_files $uri /index.html` + `absolute_redirect off`) → Fastify(pm2 fork 단일 인스턴스). `X-Real-IP` 는 `$http_cf_connecting_ip` 로 실제 방문자 IP 보존(rate-limit `clientKey` 가 `cf-connecting-ip` 우선). `deploy.sh` 는 nginx 를 건드리지 않는다 — 원본 수정 후 수동 반영
- 앱(Expo Web) — dev CORS — friendly 가 dev 한정 모든 origin 반사 허용 (env 안 만지고 폰 단말 LAN 접근 가능, 비-LAN 만 origin당 1회 warn)

스키마 1개 변경으로 FE/BE 모두 컴파일 타임 불일치 감지 — 자세한 건 [api-contract 토픽](api-contract.md).

## API Surface [coverage: high — 22 sources]

루트 `package.json`이 노출하는 명령어 (turbo 위임 — 25차 변경 없음):

| 명령 | 동작 |
|---|---|
| `pnpm dev` | 전체 dev (웹 + 앱 + friendly 동시) |
| `pnpm dev:api` | friendly만 (`http://localhost:3000`, docs `/docs`) |
| `pnpm dev:web` | 웹만 (`http://localhost:5173`, LAN host 노출) |
| `pnpm dev:mobile` | 앱 (Expo Dev Tools) |
| `pnpm dev:ios` / `pnpm dev:android` | 앱 iOS/Android 시뮬레이터 직행 (변형 `dev:ios:device`·`dev:ios:release`·`dev:ios:local`·`dev:ios:prod`·`dev:android:local`·`dev:android:prod`, 루트 별칭 `ios`/`android`) |
| `pnpm dev:mobile:local` / `:prod` | 앱 dev 서버 + API URL 변형 |
| `pnpm build` / `typecheck` / `lint` / `test` | 전체 turbo 태스크 (`lint` 4 워크스페이스 green) |
| `pnpm format` | Prettier (semi, singleQuote, trailingComma=all, printWidth=100) |
| `pnpm clean` | turbo clean + node_modules 제거 |
| `pnpm --filter <name> ...` | 특정 워크스페이스 명령 위임 |

friendly 워크스페이스 스크립트(**92개**, 대부분 `tsx --env-file=.env` — `build:tarot-deck`·`build:saju-images`·`build:saju-glyphs`·`fetch:mfds-nutrition`·`probe:food-web-estimate` 처럼 DB·키가 필요 없는 것은 `--env-file` 없이)는 접두로 읽는다 — 데이터 운영의 CLI 표면이다 (25차 +25, `build:`·`measure:` 접두 신설):

| 접두 | 예 | 뜻 |
|---|---|---|
| `load:*` | `load:bus-stations` · `load:subway-*` · `load:life-cctv <csv>` · `load:life-toilets <csv> [--offline]` · `load:life-hospitals [--offline]` · `load:food-catalog [--source=nutrition\|raw\|curated\|hansik800\|recipe] [--classify] [--backfill-nutrition]` · **`load:housing-complexes <csv> [--names=<csv>] [--offline] [--skip-derived]` · `load:housing-trades --months=N --recent=N [--max-calls=N] [--offline]` · `load:housing-prices <zip>` · `load:housing-kapt [xlsx \| --source=api --max-calls=N]` · `load:housing-buildings --max-calls=N`**(25차 +5) | 원본/API → DB 전량 교체 적재 (원본은 `data/open/` 기본 경로 — 집값 단지 CSV·공시가격 zip·K-apt xlsx 는 `data/open/housing/`, 실거래는 API 라 파일 없음) |
| `status:*` | `status:life-map` · `status:food-catalog` · **`status:housing`**(25차 — "ok complexes=N geocoded=G trades=T rents=R prices=P kapt=K from=YYYYMM to=YYYYMM stats=S") | 적재 상태 한 줄("ok k=v …" / "missing") — `deploy.sh` 가 `stat_val` 로 파싱 |
| `probe:*` | `probe:airkorea` · `probe:kma` · `probe:kma-apihub` · `probe:hira` · `probe:food-api` · `probe:meal-vision --label-from-filename` · `probe:meal-e2e` · **`probe:rtms`**(실거래 API) · **`probe:tarot-reading --models=a,b`** · **`probe:saju-reading --models=…`** · **`probe:saju-g-reading` · `probe:saju-g-pair`** · **`probe:menu-coverage --ask=N --web=N` · `probe:menu-resolve` · `probe:menu-decompose --golden=<json> --models=…`** · **`probe:food-web-estimate --names=까르보나라,불족발`**(25차 +9) | 외부 API 실응답 → `__fixtures__` / **LLM 모델 비교 — purpose 별 기본 모델(`OLLAMA_TAROT_MODEL`·`OLLAMA_SAJU_MODEL`·`OLLAMA_SAJU_G_MODEL`·`OLLAMA_MENU_MATCH_MODEL`) 채택 근거** / 전 구간 E2E(비운영 DB 만) / 메뉴 칼로리 파이프라인 표시율·fatsecret 파서 재검증 |
| **`build:*`**(25차) | `build:tarot-deck [--only=major-17,back] [--placeholders]` · `build:saju-images [--only=stem-gap,branch-rat]` · `build:saju-glyphs` · `build:saju-tables [--source=kasi]` | 자산·표 생성 — `assets-src/{tarot,saju}/raw/*.png`(제미나이 원본, gitignore) → 7:12 / 1:1 크롭 webp 512·1024 + `manifest.json`(누락 목록) → `apps/web/public/{tarot/cards,saju-c/images}/` 커밋 / 천간·지지·오행 한자 27자 × 3색 PNG(`assets/saju-glyphs/`, 개발 머신 Noto Serif CJK) / 절기 1899~2051·음력 1900~2050 표를 astronomy-engine 으로 계산해 `@repo/utils` `sajuAstroTable.ts` 에 내장(`--source=kasi` 면 `DATA_GO_KR_API_KEY` 로 공식값 교체) |
| **`measure:*`**(25차) | `measure:menu-nutrition` · `measure:menu-golden` · `measure:menu-decompose` | 메뉴 칼로리 판정·분해 골든셋(`apps/friendly/golden/menu-nutrition.golden.json`·`menu-decompose.golden.json`) 정밀도 측정 — 규칙 변경의 채택 게이트(판정 99.5% · 분해 93.8%, [golden-set-precision-gate](../concepts/golden-set-precision-gate.md)) |
| `backfill:*` · `eval:*` · `export:`/`import:` · 기타 | `backfill:meal-nutrition` · `backfill:food-allergens` · `eval:meal-recognition` · `export:life-geocode`/`import:life-geocode` · `export:subway-uwp` · **`rebuild:housing-derived` · `geocode:housing-missing [--offline]` · `fetch:mfds-nutrition [--pk=15100065]`**(25차 +3) | 기존 행 보강 / 측정 덤프 집계 / 가공 캐시 압축본 내보내기·가져오기 / 집값 파생 통계 재구축·도로명→지번 변형 좌표 보완 / 포털 JS 다운로드를 재현해 영양성분 CSV 저장(서비스키 불필요) |

운영 배포는 루트 `./deploy.sh [1-8]` — 케이스 번호로 골라 실행:

| 케이스 | 동작 |
|---|---|
| 1 | API(friendly)만 — DB 스키마 변경 없음 (pull → build → **데이터 자동 점검** → `pm2 reload`) |
| 2 | API + DB 마이그레이션 (파괴적이면 `pm2 stop` → migrate → `pm2 start`, 아니면 무중단 reload) — migrate 뒤 **데이터 자동 점검** |
| 3 | 웹(apps/web)만 (build + `chmod o+rX` + index.html OG 캐시 비우기용 `pm2 reload`) — `public/tarot/cards/`·`public/saju-c/images/` 가 dist 에 같이 복사된다(25차) |
| 4 | 웹 + API + DB (풀 재배포) — 2 와 같은 자동 점검 |
| 5 | .env만 (`pm2 reload --update-env`) |
| 6 | 일상지도 데이터 적재/갱신 — `data/open/life/*.csv` 새로 올린 뒤 `pull → gen → life_map_data 1`(force, 코드 배포·재기동 없음) |
| 7 | 음식 카탈로그 적재/갱신 — `data/open/food/` 배포본 올린 뒤 `pull → gen → food_catalog_data 1` → `load:food-catalog --classify --backfill-nutrition` + `backfill:meal-nutrition` |
| **8**(25차) | 집값 데이터 적재/갱신 — `data/open/housing/` 에 단지 CSV(+단지명 이력·공시가격 zip·K-apt xlsx) 올린 뒤 `pull → gen → housing_data 1`. `HOUSING_MONTHS=24 ./deploy.sh 8` 로 실거래 백필(장부 `HousingTradeSync` 가 있어 끊겨도 이어 받음) |

"데이터 자동 점검" = `life_map_data` + `food_catalog_data` + **`housing_data`**(25차, 케이스 1·2·4) — 테이블이 없으면(마이그레이션 전) 안내만, 비어 있으면 첫 적재, 캐시 압축본 변경 시 재적재. 집값은 단지 마스터가 비면 CSV + 지오코딩 캐시 압축본(`--offline`, 호출 0건) 적재, 거래가 비면 최근 `HOUSING_MONTHS`(기본 3)개월만 RTMS 첫 수집, 공시가격 zip·K-apt xlsx 는 파일이 있을 때만 보강, 건축물대장(`load:housing-buildings`)은 쿼터 소모가 커 자동 점검에서 제외(수동). K-apt xlsx 는 포털 파일명(`YYYYMMDD_단지_기본정보.xlsx`)이 날짜로 바뀌므로 glob 사전순 마지막을 고른다 — `ls | tail` 명령 치환은 파일이 없을 때 `set -e` 아래 스크립트를 조용히 죽였다(`b8c08ed`). `pull()` 이 `git diff --name-only prev HEAD -- <gz>` 로 `GZ_CHANGED` 를 채운다. `migrate deploy`(운영) / `migrate dev`(개발) 구분, `pm2` fork 단일 인스턴스(SQLite 락 회피). **nginx 는 deploy.sh 가 건드리지 않는다** — `ops/nginx/niney_life_pickr_v2_projects` 원본을 고쳐 서버로 복사 → `nginx -t` → reload 는 수동. 자세한 절차·nginx·Cloudflare·카탈로그 적재·업로드 파일 백업·사주 글리프는 [docs/deploy-friendly.md](../../docs/deploy-friendly.md).

### 백엔드 라우트 트리 (요약)

```
/api/v1
├── auth/* ......................... 회원가입 / 로그인 / 내 정보
├── picks/* ........................ 선택 / 픽 결과
├── media/thumbnail ................ 네이버·배민 CDN 프록시 (공개, ?w= 리사이즈 — 메뉴 탭 112px, 25차)
├── settings/map/public ............ vworld WMTS 키 (공개)
├── bus/
│   ├── stations/search|nearby .... 정류장 이름/좌표 검색 (공개, 30일 캐시)
│   ├── stations/:arsId/arrivals .. 실시간 도착 (공개, 무캐싱)
│   ├── routes/:id/positions|detail  실시간 차량 위치 / 노선 상세 (공개)
│   └── favorites/* ............... 정류장·노선 즐겨찾기 (인증)
├── subway/* ....................... 역 검색/도착/위치/노선/시간표/혼잡도/경로 (공개) + favorites (인증) → subway 토픽
├── vote/* + share/votes/:token .... 투표방 생성(인증) / 공개 조회·투표(토큰) → vote 토픽
├── air/                           에어코리아 프록시 (공개)
│   ├── sido/:sidoName ............ 시도별 실시간 (10분 캐시)
│   ├── stations | stations/nearby | stations/search | stations/:name/history   측정소 목록(24h)·주변·검색·이력
│   ├── bad-stations | forecast | forecast/weekly   나쁨 측정소 / 예보(20분) / 주간예보(60분)
│   └── location .................. 내 대기 위치 GET/PUT (인증)
├── weather/                       기상청 프록시 (공개)
│   ├── nowcast | forecast | versions   초단기실황 / 단기예보 / 발표 버전 (발표 시각 단위 캐시)
│   ├── mid | mid/sea ............. 중기 육상·해상 (D+4~D+10)
│   └── aws ....................... API허브 AWS 매분 관측 (KMA_APIHUB_KEY 없으면 꺼짐)
├── life-map/                      로컬 적재 조회 (공개 — 요청 경로 외부 호출 0)
│   ├── status | points | nearby .. 레이어별 건수 / bbox·줌 포인트(셀 10분 LRU) / 반경 목록
│   ├── search .................... 지역 이동 검색 (행정구역·역·정류장·VWorld 주소)
│   └── :layer/:id ................ 상세 (cctv|toilet|hospital)
├── housing/                       집값 — 로컬 적재 조회 (공개, 25차; 레이트리밋 housingRead 240/분 · housingSearch 120/분) → housing 토픽
│   ├── status | points | nearby .. 적재 상태 / ?bbox&zoom(&dealType&band) 서버 집계 셀·단지 배지 / 좌표 반경 단지(≤3000m·≤30)
│   ├── search .................... 단지명 검색 (?q 1~40자, 세대수 큰 순)
│   └── complexes/:id(/trades) .... 단지 상세(속성 + 유형×전용면적 구간 통계 + 공시가격) / 거래 목록(?dealType&band&limit&offset&includeCanceled)
├── tarot/                         타로 (공개 + 옵셔널 인증, X-Guest-Key, 25차) → tarot 토픽
│   ├── POST readings ............. 카드·스프레드·주제·질문 → 해석 (한도 feature tarot-reading, 회원 자동 저장, 오늘의 카드 dailyLockKey 잠금)
│   ├── me/readings(/:id) ......... 회원 기록 목록(?cursor&limit) / 단건 / 삭제 (인증)
│   └── shares | shares/:token .... 공유 토큰 발급(게스트=입력 재전송·회원=readingId, 분당 10) / 공개 조회
├── saju-c/                        사주(C) (공개 + 옵셔널 인증, 25차 — 경로 5f49026) → saju-c 토픽
│   ├── POST readings ............. 원국 + 섹션 4개(정적 본문 즉시, LLM 섹션은 job) — 한도 saju-reading
│   ├── readings/jobs/:id ......... 섹션 long-poll (?after&wait=20000, 서버 재시작으로 job 없으면 410)
│   ├── daily | match | date-pick | food   오늘의 운세(회원 하루 1회 잠금) / 궁합 / 택일 / 오행 음식
│   ├── me/profiles(/:id) ......... 회원 프로필(나·가족, 최대 10) (인증)
│   ├── me/readings(/:id) ......... 회원 기록 (인증)
│   └── shares | shares/:token .... 공유 토큰 발급 / 공개 조회
├── saju-g/                        사주(G) (공개, 25차, 다른 세션) → saju-g 토픽
│   ├── chart | readings .......... 명식 계산 → AI 해석 2단 (한도 saju-g-reading)
│   ├── pair/chart | pair/readings  두 사람 궁합
│   ├── me/profiles(/:id) | me/readings(/:id)   출생 프로필 / 명시적 보관
│   └── shares | shares/:token(/image.png)   공개 상징 공유(10자 토큰, 32자 구 토큰 호환) + PNG 1080×1440
├── meals/                         식단 (전부 인증 — 로그인 필수) → meal 토픽
│   ├── GET/POST /, /:id, calendar, stats, time-presets, items/recent
│   ├── photos, photos/:token(/thumb|/copy) ... 업로드·조회·복제 (EXIF 제거, 24h 고아 GC)
│   ├── recognize ................. 사진 → vision LLM 인식 (일 30건 SQLite 쿼터)
│   ├── preference, recommendations(/context, /:id/feedback, /:id/events)   설정 / 추천(일 20건) / 피드백·이벤트
│   └── data, data/export, data/backup(/restore), data/photos/retention   전체 삭제 / JSON 내보내기 / 백업·멱등 복원 / 사진 보존
├── restaurants/
│   ├── ranking .................... 공개 랭킹
│   ├── public ..................... 공개 리스트
│   ├── public/:placeId ............ 공개 상세 (+ /insights /category-tree /reviews 페이지네이션)
│   ├── public/:placeId/menu-nutrition   메뉴 탭 칼로리 칩 — 규칙 → LLM 매칭 → 웹 실측 → 세트 분해 (공개, 지연 조회, 25차)
│   ├── :placeId/qa ................ 공개 리뷰 QA (RAG, 무인증·IP 레이트리밋) + /qa/ready
│   └── :placeId/clusters .......... 공개 리뷰 군집 (읽기 전용)
├── r/:placeId ..................... 맛집 공유 SSR-lite (OG/JSON-LD head 주입, 봇=서버 / 사람=SPA)
├── sitemap.xml / robots.txt ....... 맛집 SEO (restaurant-preview)
├── settlement-extraction/         정산 영수증 vision 추출 (인증)
│   ├── upload .................... POST multipart jpg → imageToken
│   ├── extract ................... POST { imageToken, placeId, split?: { count, index } } → items[]
│   └── preview/:token ............ GET 영수증 이미지 (owner 본인)
├── settlements/                   N차 정산 세션 CRUD (인증)
│   ├── GET /, POST / ............. list / create({ fromDraftId? })
│   ├── /:id ...................... get / PUT(풀 리플레이스) / delete
│   └── /:id/share ................ POST 멱등 토큰 발급 / DELETE 회수
├── settlement-drafts/              서버 draft 자동저장 (인증)
│   ├── GET / ..................... list (updatedAt desc)
│   ├── PUT / ..................... upsert by (userId, placeIdKey)
│   └── DELETE /:id ............... 본인 소유만
├── share/settlements/:token ...... GET 공개 read-only (비인증) + OG SSR-lite HTML
│   └── :token/image.png .......... GET 정산표 PNG (og:image, satori+resvg, 비인증)
├── me/contacts ................... 단골 참여자 CRUD (인증)
├── .well-known/
│   ├── apple-app-site-association ... env 기반 동적 응답 (미설정 시 404)
│   └── assetlinks.json .............. env 기반 동적 응답 (미설정 시 404)
├── health
└── admin/
    ├── crawl/* .................... 크롤 잡 + SSE + 배치 머지 (네이버/DC/캐치테이블/테이블링)
    ├── auto-discover/* ............ AI 키워드 → 다중 검색 → 그룹 5병렬
    ├── random-crawl/* ............. 지역 랜덤 자동 발굴 설정/실행/이력 (텔레그램 후보 선택)
    ├── ai/* ....................... LLM 호출 + provider 키 (purpose 8종 — tarot/saju/saju-g 카드 자동 노출) + models/preview + telemetry SSE
    ├── quotas | quotas/:feature ... 공용 사용량 한도 overview(GET ?date=) / 기능 설정 부분 갱신(PUT) (25차)
    ├── analytics/* ................ 그룹핑 잡 + 글로벌 머지(택소노미 v3) + 카테고리 트리
    ├── schedule/* ................. 주기 자동 실행 설정 CRUD / 수동 실행 / 이력 (정규화→머지)
    ├── review-search/* ............ enrich/ask/status/enrich-bg + enrich-events SSE
    ├── review-clustering/* ........ run/status/cluster-bg/cluster-pending
    ├── logs/* ..................... 작업 run 목록/상세/로그 + 실패 분석 + 보존 설정
    ├── food/* ..................... 카탈로그 items CRUD / stats / merge-conflicts / recognition-quality / import(config·run·runs·run-events SSE·preview) + menu-lexicon(/:id) 어휘 편집 (25차)
    ├── canonical/* ................ 머지 제안 큐 / 수락·거절
    ├── settings/map ............... 지도 SDK 키 (admin)
    ├── settings/telegram .......... 텔레그램 봇 토큰/chatId (DB+env fallback)
    └── restaurants/* .............. 어드민 식당 CRUD + 인사이트 + smart-pick + region-stats + summary SSE
```

> 비-`/api/v1` 루트 경로: `/share/settlements/:token`(별칭 `/s/:token`) 의 OG HTML + `image.png`, `/.well-known/*`, 그리고 25차 **`/tarot/s/:token`(+`/image.png?format=og|story`) · `/saju-c/s/:token`(+`/image.png?format=og|story`) · `/saju-g/s/:token`**(HTML 만 — PNG 는 `/api/v1/saju-g/shares/:token/image.png`) 는 Fastify 루트에 직접 매핑(`app.ts` 가 `registerTarotPreview`·`registerSajuPreview`·`registerSajuGPreview` 등록, nginx 가 `^~` prefix 그대로 proxy). 게스트 LLM 라우트는 `X-Guest-Key` 헤더 + `@fastify/rate-limit`(max 는 어드민 설정 `ipPerMinute` 를 읽는 함수) + `usageQuota.consume()`.

### 웹 라우트 트리 (요약)

```
PublicLayout  (?embed=1 또는 앱 브리지 주입이면 상단바·사이드바 생략 — 25차)
  /                          HomePage (랭킹 행 → <Link to="/restaurants-v2/:placeId">, 슬롯 픽, 타로·사주(C)·사주(G) 진입 카드)
  /restaurants               RestaurantsPage (3-column)
    /restaurants/:placeId    RestaurantDetailRoute
  /restaurants-v2 · /r       RestaurantsV2Page (xl- 바텀시트 패턴, /r = 공유·SEO 대표 URL)
  /bus · /subway             BusPage · SubwayPage — '대중교통' 메뉴, 모바일은 sheet 패턴 (e84e4b9)
  /life-map                  LifeMapPage (OL 지도 lazy, subBar 지역 검색 + 레이어 토글, 모바일 sheet)
  /housing                   HousingPage (25차 — 셀·단지 배지 지도, dealType×band 축, 단지 검색(LifeGoToBox extraSections), 상세 시트, housingPrefsStore)
  /weather                   WeatherPage
  /air                       AirQualityPage
  /tarot                     TarotPage (25차 — R3F 3D 무대 / Lite, ?spread=menu 딥링크, ?lite=1)
    /tarot/s/:token          TarotSharedPage (2D TarotReadingView + "나도 타로 보기")
  /saju-c                    SajuPage (25차 — 천문도 3D 무대 / Lite, ?tool= 딥링크, ?3d=1)
    /saju-c/s/:token         SajuSharedPage (2D)
  /saju-g · /saju-g/pair     SajuGPage · SajuGPairPage (25차, 다른 세션 — 명식 먼저·AI 뒤에, 두 사람 궁합)
    /saju-g/s/:token         SajuGSharedPage
  /me/tarot(/:id)            MyTarotPage · MyTarotReadingPage (RequireUser, 25차 — 커서 더 보기·2단계 삭제·공유)
  /me/saju-c(/:id)           MySajuPage · MySajuReadingPage (RequireUser, 25차 — 프로필 ★·기록)
  /me/saju-g(/:id) · /me/saju-g/profiles   SajuGHistoryPage · SajuGProfilesPage (페이지 안에서 로그인 분기, 25차)
  /me/meals                  MealPage (RequireUser — 기록·달력·통계·추천·설정)
  /me/settlements            SettlementHistoryPage (RequireUser, bulk delete + "이어 입력" draft 행)
  /me/contacts               ContactsPage (RequireUser)
  /login                     LoginPage (단독)
RequireUser (단독)
  /restaurants/:placeId/settle/new · /me/settlements/new   SettlementNewPage (Step1/Step2Rounds/Step3/Step4, server draft 자동저장)
  /restaurants/:placeId/settle/:id(/edit)                  SettlementResultPage / edit 모드
  /vote/new                  VoteNewPage
공개 (레이아웃 없음)
  /s/:token                  SharedSettlementPage (비인증 read-only, /share/settlements/:token 별칭)
  /vote/:token               VotePage (비로그인 투표)
AdminLayout (RequireAdmin) — 단일 lazy 청크 AdminRoutes
  /admin · discover · auto-discover · restaurants(/:placeId) · crawl-test(/:jobId) · catchtable-test(/:shopRef) · diningcode-test(/:vRid) · tabling-test · diningcode(/:vRid) · tabling · analytics · food · ai-usage · logs(/:runId) · ai-test · review-search · settings/{ai-keys,map,telegram,logs,quotas(25차)}
```

라우트 컴포넌트는 `lazy` 코드 스플리팅 — 첫 로드 바이트 절감, `vite.config.ts` 의 `codeSplitting.groups` 가 그 위에 vendor 청크(ol/react-vendor/query/radix + 25차 **three**)를 고정해 앱 코드만 바뀌어도 벤더 캐시 유지. 옛 `/admin/ai-keys` 북마크는 `/admin/settings/ai-keys` 로 redirect. 공개 메뉴(`PublicSidebar.NAV`) 순서는 홈 · 맛집 · 대중교통 · 일상지도 · 집값 · 날씨 · 대기질 · 타로 · 사주(C) · 사주(G)(+ 로그인 시 식단), 계정 메뉴에 "내 타로 기록".

### 앱 라우트 (요약)

```
app/
├── (tabs)/_layout.tsx        ~/components/tabs-layout 위임 (web/native split — 형제 .web.tsx 자동 채택)
├── (tabs)/home.tsx           랭킹 + MyLocationCard(→ /weather · /air · /life-map) + TodayMealCard(→ /meal, /meal/new?slot=) + TarotEntryCard(→ /tarot, /tarot?spread=menu) + SajuEntryCard(→ /saju-c, ?tool=daily) (25차 카드 2장)
├── (tabs)/restaurants.tsx
├── (tabs)/transit.tsx        대중교통 (버스+지하철, 탑승 모드·하차 알림) — 2026-07
├── (tabs)/profile.tsx        → /meal, /settlement/history, /settlement/contacts
├── tarot/index.tsx           WebView 임베드 — 웹 `${webUrl}/tarot?embed=1(&spread=)` + embedBridge 주입(토큰·게스트 키·테마), share/open/title 메시지, Android 뒤로가기=WebView 히스토리 (25차, 624ead4)
├── saju-c/index.tsx          WebView 임베드 — 웹 `/saju-c?embed=1(&tool=)`, 같은 브리지 (25차, 0a7f637·5f49026)
├── air/index.tsx · weather/index.tsx · life-map/index.tsx   생활정보 (측정소 지도·30/90일 추이·시간별 기온·최근 위치·플로팅 헤더 sheet)
├── meal/
│   ├── index.tsx                   기록·달력·통계 3탭 + 설정(가중치·알레르기·알림·백업·사진 정리·전체 삭제)
│   ├── new.tsx                     사진 5장 순차 업로드 → 인식 → 편집 → 저장, 시간 프리셋·"지난번대로"
│   └── [id].tsx                    상세 (영양 스냅샷)
├── restaurant/[placeId]/
│   ├── index.tsx                   (메뉴 탭 칼로리 칩 + 112px 프록시 썸네일, 25차)
│   └── settle/
│       ├── new.tsx                 SettlementWizard
│       └── [id]/{index, edit}.tsx
├── settlement/
│   ├── new.tsx                     식당 미지정 시작 슬롯 (placeId=null draft)
│   ├── history.tsx                 bulk delete + "이어 입력" rows
│   └── contacts.tsx
└── s/[token].tsx                   Universal/App Link 진입점 (/s/ 단축, efb3d1e 2026-05-30) — useSharedSettlement, headerBackTitle 명시
```

사주(G)·집값은 앱 라우트 없음(미연동). 앱 부팅(`src/lib/api-setup.ts`)은 `setSettlementDraftStorage` 에 더해 25차 `setGuestKeyStorage`·`setSajuProfileStorage`(AsyncStorage) 를 주입하고 `webUrl`(`EXPO_PUBLIC_WEB_URL`, 없으면 apiUrl 의 `:3000`→`:5173`) 을 계산한다.

## Data [coverage: high — 24 sources]

데이터 흐름 (단일 진실의 원천):

```
packages/api-contract (Zod schema)
     │ 검증+OpenAPI         │ 타입+fetch
     ▼                      ▼
  friendly                @repo/shared
  (Fastify)               (API client/hooks)
                           │           │
                           ▼           ▼
                          웹          앱  ──(WebView)──▶ 웹 (/tarot·/saju-c ?embed=1, 25차)
```

영속 데이터: SQLite 파일 (`apps/friendly/data/dev.db`, `.env` `DATABASE_URL=file:../data/dev.db`; 운영 `prod.db`), Prisma 마이그레이션. 영수증 이미지는 디스크 (`apps/friendly/data/receipts/<token>.jpg`) — 멀티 분할도 같은 token 재사용. 정산표·타로·사주 공유 PNG 한글 렌더 폰트(`apps/friendly/assets/fonts/IBMPlexSansKR-*.ttf`, `lib/share-fonts.ts` 공용)는 레포에 커밋되어 git pull 만으로 배포. 클라이언트 토큰: 웹은 `localStorage` `lp:token`, 앱은 AsyncStorage `lp:token`. **세션·영구 저장 분리** 정착:

| 저장소 | 영역 | 키/이름 | 무엇 |
|---|---|---|---|
| 웹 localStorage | `lp:panelPrefs` | 페이지별 사이드 패널 좌/우 |
| 웹 localStorage | `lp:settlementPrefs` | 정산 새 행 exclude default (장기 default) |
| 웹 sessionStorage | `lp:settlement-draft` | wizard 진행 중 draft (브라우저 탭 scope) |
| 앱 AsyncStorage | `lp:settlementPrefs` | 같은 exclude default |
| 앱 AsyncStorage | `lp:settlement-draft` | wizard 진행 중 draft (앱 재시작 영속) |
| 웹 localStorage | `lp:theme` | 화면 모드 system/light/dark (웹 자체 스토어) |
| 앱 AsyncStorage | `lp:themeMode` | 화면 모드 system/light/dark (수동 hydrate, design 토큰만 shared 공유) |
| 서버 DB | `SettlementDraft` | 다기기 canonical draft (5s debounce upsert, hydrate placeId당 1회) |
| 웹 localStorage / 앱 AsyncStorage | `lp:life-map-prefs` · `lp:life-map-recent` | 일상지도 레이어·반경 선호 + 최근 위치 (동일 키, 플랫폼별 store 파일) — 집값 페이지도 최근 위치·저장한 내 위치를 **공유**(25차) |
| 웹 localStorage | `lp:housing-prefs` | 집값 dealType·band 축 선호 (`apps/web/src/stores/housingPrefsStore.ts`, 25차) |
| shared `guestKeyStore` (주입 storage) | `guest-key-v1` | 게스트 키 UUID → `X-Guest-Key` 헤더. 웹 localStorage / 앱 AsyncStorage(`setGuestKeyStorage`) — 앱이 WebView 에 같은 키를 주입해 기기 한도·오늘의 카드 잠금이 앱↔WebView 일치 (25차) |
| shared `tarotHistoryStore` (주입 storage) | `tarot-history-v1` | 게스트 타로 기록(기기 로컬) — 회원은 서버 `TarotReading` 자동 저장 (25차) |
| shared `sajuProfileStore` (주입 storage) | `saju-profiles-v1` | 사주(C) 기기 프로필 칩(게스트) — 회원은 서버 `SajuProfile`(최대 10, `setSajuProfileStorage` 로 앱 주입) (25차) |
| 웹 localStorage (사주(G) 자체) | `lp:saju-g-profiles:v1:guest` · `lp:saju-g:v1:<principal>` · `lp:saju-g-share:<token>` | 사주(G) 기기 프로필 / 계정별 풀이 최근 20 / 공유 취소 자격 — 이전 키(`lp:saju-profiles:v1:guest`·`lp:saju:v1:*`)는 첫 접근 때 `sajuGStorageMigration.ts` 가 검증·병합(직렬 큐 + Web Locks). C 의 `saju-profiles-v1` 은 읽지 않음 (25차, e40b4c0) |
| 웹 sessionStorage | `lp:embed` | `?embed=1` 을 한 번 본 뒤 후속 페이지(공유·기록)도 크롬 없이 — 브리지(`window.__LP_EMBED__`)가 주입돼 있으면 쿼리 없이도 임베드 (25차) |
| 웹 localStorage | `saju-sound-v1` | 사주(C) 3D 효과음 토글(기본 꺼짐, WebAudio 합성 — 파일 없음) (25차) |
| shared `airLocationStore` (주입 storage) | `air-location-v1` | 게스트 로컬 내 대기 위치, 로그인 시 서버 `AirUserLocation` 과 동기화 |
| shared `mealDraftStore` (주입 storage) + 앱 문서 디렉터리 | `lp:meal-draft-v1` 등 | 앱은 principal(계정) namespace 로 draft/reminder/photo queue/cache 를 묶고, 웹은 즉시 업로드 ([platform-ui-split](../concepts/platform-ui-split.md)) |
| 서버 DB | `MealDailyQuota` | 사용자별 일일 인식/추천 카운터 — **SQLite 영속**(재시작 뒤 유지, in-memory 게이트 아님) |
| 서버 DB | `UsageQuotaCounter` · `UsageQuotaSetting` | 공용 익명 사용량 카운터(feature × scope guest/ip/global/user × key × KST 날짜, 원자 증가) — 식단과 같은 **SQLite 영속** 원칙, 04:40 GC / 기능별 한도 설정 1행(없으면 코드 `USAGE_QUOTA_DEFAULTS`) (25차) |
| 서버 디스크 | `data/meal-photos/<userId>/` | 식단 사진 — DB 백업만으론 복구 불가, 주간 tar 백업 권장(docs/deploy-friendly.md) |
| 리포(커밋) | `modules/life-map/data/life-geocode-cache.json.gz` | 지오코딩 결과 가공 캐시 — 원본은 안 넣고 캐시만 넣는 데이터 파일. 25차에 집값 단지 지번이 합류해 **104,871건 2.3MB**(24차 39,181건 1.1MB). `export:`/`import:life-geocode` |
| 리포(커밋) | `apps/web/public/tarot/cards/`(webp 158 + manifest) · `apps/web/public/saju-c/images/`(webp 44 + manifest) · `apps/friendly/assets/saju-glyphs/`(PNG 81) | 이미지 산출물 — 아래 "정적 자산 파이프라인" (25차) |
| friendly 프로세스 메모리 | (OG index 캐시) | 빌드된 `index.html` 1회 캐시(`lib/web-index.ts` — 정산·투표·타로·사주 공용) + OG 미리보기 경량 select 5분 캐시 — pm2 reload 로 비워짐 |
| friendly 프로세스 메모리 | 공공 API 응답 캐시 | 에어코리아(측정 10분/예보 20분/주간 60분/측정소 24h), 기상청(발표 시각 단위, 폴백 시 5분), 일상지도 셀 LRU(10분) — 재시작 시 리셋 |
| friendly 프로세스 메모리 | LLM 해석 캐시 · job 레지스트리 · 설정 캐시 | 타로 해석 LRU(2,000·24h, 입력 해시 키) / 사주(C) 섹션·도구 LRU(4,000·24h) + **`saju-jobs.ts` 병렬 job Map**(완료 후 5분 TTL — 재시작 시 410, 클라이언트 재요청) / usage-quota 설정 30초 캐시(어드민 저장 시 즉시 무효화) / 사주(G) 메모리 캐시·영수증 — 전부 단일 인스턴스 전제 (25차) |

`settlementDraftStore`·`guestKeyStore`·`sajuProfileStore`(zustand) 는 storage 어댑터를 **외부 주입** — 부팅 직후 `set*Storage(...)` 가 호출되어야 store 의 첫 read/write 가 안전. 웹은 entry 에서 localStorage/sessionStorage 어댑터, 앱은 `apps/mobile/src/lib/api-setup.ts` 에서 AsyncStorage 어댑터 주입. `createJSONStorage` 가 팩토리를 1회만 호출하므로 주입은 스토어 첫 접근 전이어야 한다.

### 정적 자산 파이프라인 — 이미지 원본은 git 밖, 산출물만 커밋 (25차)

```
제미나이 생성 PNG  ──▶ assets-src/tarot/raw/<cardId>.png · assets-src/saju/raw/<id>.png   (.gitignore /assets-src/{tarot,saju}/raw/)
                          │ pnpm --filter friendly build:tarot-deck [--only= --placeholders]   7:12 크롭 · 뒷면 4방향 대칭 · 미생성 카드 placeholder
                          │ pnpm --filter friendly build:saju-images [--only=]               1:1 크롭
                          ▼
              apps/web/public/tarot/cards/<id>-{512,1024}.webp (78장 + back = 79 × 2) + manifest.json   ← 커밋 (58842db·…)
              apps/web/public/saju-c/images/<id>-{512,1024}.webp (일간 10 + 띠 12 = 22 × 2) + manifest.json ← 커밋 (142e116·67c8a38)
                          │ pnpm --filter web build → dist/tarot/cards/ · dist/saju-c/images/  (dist 가 실제 디렉터리를 갖게 됨 — SPA 폴백 $uri/ 충돌 원인)
                          ▼ nginx ^~ /tarot/cards/ · ^~ /saju-c/images/  7일 캐시 + try_files $uri =404  (없는 카드는 진짜 404 → 웹이 대체 카드/한자 placeholder)
                          ▼ friendly 공유 이미지: 카드 webp → sharp JPEG data URI → satori (LRU 100) — 한자는 Plex 에 없어
              apps/friendly/assets/saju-glyphs/u<hex>[-gold|-hanji].png (27자 × 3색 = 81)  ← build:saju-glyphs (개발 머신 Noto Serif CJK, 커밋 — 운영 CJK 폰트 불필요)
```

프롬프트북은 [docs/tarot-deck-prompts.md](../../docs/tarot-deck-prompts.md)(78장 + 뒷면, 민화풍 + 금박)·[docs/saju-image-prompts.md](../../docs/saju-image-prompts.md)(일간 10 + 띠 12). 사주(C) 이미지 경로 상수 `SAJU_IMAGE_BASE_PATH` 가 `/saju-c/images/` 를 가리킨다(`5f49026` 에서 `/saju/` 에서 이동). 사주 절기·음력 표는 이미지가 아니라 코드(`packages/utils/src/sajuAstroTable.ts`, `build:saju-tables` 생성물 — KASI 공개값과 절기 ±1분·설날·윤달 일치)로 내장된다.

### 도메인 테이블 그룹 (전 **93** 모델, 마이그레이션 **80**개 — 25차 +18 모델·+11 마이그레이션)

| 그룹 | 테이블 (자세한 모델은 friendly/canonical/analytics/settlement/logs/bus/subway/vote/air-quality/life-map/food/meal/housing/tarot/saju-c/saju-g/usage-quota 토픽) |
|---|---|
| 사용자 (3) | `User`, `Pick`, `PickResult` |
| 맛집 즐겨찾기 (1) | `RestaurantFavorite` (2026-07) |
| 버스 (7, 2026-07) | `BusStation`, `BusMasterSync`, `BusStationSearch`, `BusStationSearchHit`, `BusRouteShape`, `BusFavoriteStation`, `BusFavoriteRoute` |
| 지하철 (8, 2026-07) | `SubwayStation`, `SubwayMasterSync`, `SubwayLineStation`, `SubwayLineShape`, `SubwayTimetableCache`, `SubwayCongestion`, `SubwayFavoriteStation`, `SubwayFavoriteLine` |
| 투표 (3, 2026-07) | `VoteSession`, `VoteOption`, `VoteBallot` |
| 대기 (1) | `AirUserLocation` — 로그인 사용자 '내 대기 위치'(측정소) `20260821060230` |
| 일상지도 (5) | `LifeCctv`, `LifeToilet`, `LifeHospital`(`20260827222827`), `LifeGeocodeCache`(주소→좌표 영구 캐시, notfound 포함 — 25차부터 집값 단지 지번도 여기), `LifeMasterSync`(layer 별 최근 적재 건수 — `status:life-map` 의 원천) `20260821130000` |
| **집값 (6, 25차)** | `HousingComplex`(id = 부동산원 단지 id, `@@index([lat,lng])`·`[sggCd,umd,jibun]`·`[kind,households]`, K-apt·건축물대장 보강 컬럼 — 재적재 시 이어받음), `HousingTrade`(`[complexId,dealType,dealDate]`·`[sggCd,dealYm,dealType]`), `HousingComplexStat`(`@@id([complexId,dealType,band])` — 요청 경로가 읽는 파생 표), `HousingTradeSync`(`@@id([sggCd,dealYm,dealType])` — "어느 달을 받았나" 장부), `HousingSync`(kind 별 적재 이력 — `status:housing` 원천), `HousingComplexPrice`(`@@id([complexId,band])` 공시가격 중위·범위) — `20260830094116_add_housing`·`20260830112334_add_housing_enrich` |
| 음식 카탈로그 (5) | `FoodItem`(3축 분류·1인분 영양·**`kcalPer100g`**(25차 `20260902120000`)·`nutritionFrom`·알레르기 상태 unknown/inferred/verified), `FoodSourceObservation`, `FoodMergeConflict`, `FoodImportConfig`, `FoodImportRun` — `20260822105913`~`20260824040000` |
| **메뉴 칼로리 판정 (4, 25차)** | `MenuLexicon`(`@@unique([kind,term,target])`, active — 어드민 어휘 편집 `20260903090000`), `MenuLlmMatch`(`nameNorm @unique`, version — 규칙 밖 메뉴명 → 카탈로그 LLM 매칭 영구 캐시 `20260902150000`), `MenuLlmDecomposition`(`nameNorm @unique` — 세트 구성 LLM 분해 v3 `20260903100000`), `FoodWebEstimate`(`nameNorm @unique` — fatsecret.kr 100g당 집계, 미채택도 저장, 파서 버전 3 `20260902170000`) — [food](food.md) |
| 식단 (9) | `MealEntry`, `MealItem`(분류·영양 스냅샷 — 카탈로그 FK 없음), `MealPhoto`(userId FK), `MealPreference`, `MealRecommendation`(`originRecommendationId`), `MealRecommendationEvent`(immutable), `MealDailyQuota`(SQLite 영속 쿼터), `MealDataImport`(백업 복원 ledger), `MealPhotoDeletion`(삭제 outbox) — `20260822113321`~`20260823220000` |
| **타로 (1, 25차)** | `TarotReading`(`shareToken @unique`, `dailyLockKey @unique` = userId:날짜 — 회원 오늘의 카드 하루 1장, `@@index([userId,createdAt])`, 게스트 행은 공유 시에만 guestKey 로) — `20260903120000_add_tarot_reading_and_usage_quota`·`20260903130000_add_tarot_share_question`(공유에 질문 포함 플래그) |
| **사용량 한도 (2, 25차)** | `UsageQuotaSetting`(`feature @id` — tarot-reading/saju-reading/saju-g-reading, enabled·guestPerDay·ipPerDay·ipPerMinute·globalPerDay·guestCutoffPct), `UsageQuotaCounter`(`@@id([feature,scope,key,date])`) — 같은 마이그레이션 — [usage-quota](usage-quota.md) |
| **사주(C) (2, 25차)** | `SajuProfile`(`@@index([userId,isPrimary])` — 회원 프로필 최대 10, ★ 대표), `SajuReading`(`shareToken`·`dailyLockKey @unique` — 타로와 같은 형태, 오늘의 운세 하루 1회) — `20260906110442_add_saju_profile_and_reading` |
| **사주(G) (3, 25차)** | `SajuGProfile`, `SajuGReading`(`@@unique([userId,requestKey])` 멱등 보관), `SajuGShare`(`token @id` 10자 — 풀이 삭제 시 공유만 연쇄) — `20260906170000_add_saju_g`(C 마이그레이션 뒤 독립 생성, 리베이스 전 로컬 3개를 하나로) — [saju-g](saju-g.md) |
| 외부 SDK·봇 설정 (3) | `LlmProviderConfig` (`@@unique(provider, purpose)` — purpose 8종), `MapProviderConfig`, `TelegramConfig` (단일 행, 18차) — 셋 다 [db-config-env-fallback](../concepts/db-config-env-fallback.md) 동형 |
| canonical (2) | `CanonicalRestaurant`, `CanonicalMergeProposal` |
| 식당/크롤 (3) | `Restaurant` ((source, sourceId) unique + canonicalId), `VisitorReview`, `ReviewSummary` |
| 분석 v4 (2) | `MenuMention`, `ReviewTag` |
| 리뷰 RAG·군집 (18차) | `ReviewSummary` enrichment 컬럼(`embeddingJson`/`aspectsJson`/`contextLine`/`enrichVersion`) + `clusterId` FK, `ReviewCluster` (군집 1행/주제, clusterVersion/corpusSize) |
| 메뉴 그룹핑 (1) | `MenuCanonical` |
| 전역 머지 + 통계 (3) | `GlobalMenuCanonical`, `GlobalMenuCanonicalLink`, `GlobalMenuMergeChunkCache` (청크 캐시 — `20260619075115` 마이그레이션 정식 등재. 과거 수동 생성 운영 DB 는 `_prisma_migrations` 정합 확인 필요) |
| 작업 로그 (4, 18차) | `OperationRun`(run 헤더, feature 8+종), `OperationLog`(스텝, 4 level), `OperationReport`(실패당 0~1 LLM 분석), `LogConfig`(보존 기본 30일) — [logs](logs.md) |
| 자동 발굴 (2, 18차) | `RandomCrawlConfig`(jobType unique), `RandomCrawlRun`(telegramChatId/MessageId/expiresAt/candidatesJson) |
| 정산 (7) | `SettlementSession` (`shareExpiresAt`), `SettlementParticipant`, `SettlementItem`(→Round), `SettlementRound` (`groupSplits` JSON — 균등/잔수 세부 분배, 18차; `categoryAdjustments` JSON — round × category `leftoverParticipantIds[]` + roundUnit nullable, 별도 테이블 아님), `SettlementRoundParticipant`(차수별 출석), `SettlementContact`, `SettlementDraft` ((userId, placeIdKey) unique — '' sentinel for null placeId) |
| 스케줄 (2) | `ScheduleConfig` (`jobType @unique`, cronExpr/timezone/enabled + lastRunAt/lastStatus 비정규화 — nextRunAt 미저장), `ScheduleRun` (`@@index([jobType, startedAt])`, status running/done/failed/skipped/interrupted, trigger cron|manual) |

`SettlementSession.shareToken @unique`·`TarotReading.shareToken`·`SajuReading.shareToken`·`SajuGShare.token` 이 각 공유 OG/이미지 라우트의 진입 키 — 토큰(7바이트 base64url 10자, 정산·타로·사주(C)·사주(G) 공개 토큰 동일 길이; 사주(G) 비밀키·영수증만 24바이트)으로 행을 찾아 satori 를 렌더한다. 타로·사주(C) 공유 본문은 **서버가 만든 해석만** — 게스트는 입력을 재전송해 서버가 캐시/LLM/정적으로 본문을 확보한 뒤 행을 만들고, 회원은 readingId 로 저장 행에 토큰만 단다(재요청 시 같은 토큰).

자세한 모델·인덱스: [friendly](friendly.md), [canonical](canonical.md), [settlement](settlement.md), [housing](housing.md), [tarot](tarot.md), [saju-c](saju-c.md), [saju-g](saju-g.md), [usage-quota](usage-quota.md), [food](food.md).

### 분석 LLM 파이프라인 (3단계, 변동 없음) + 정적 우선 LLM 보강 (25차)

```
크롤 → 1) 리뷰 단위 분석 (summary v4) → 2) 식당별 메뉴 그룹핑 → 3) 전역 머지 + 카테고리 path → 통계 트리
```

각 단계는 `*_VERSION` 상수(`ANALYSIS_VERSION`, `MENU_GROUPING_VERSION`, `GLOBAL_MERGE_VERSION`, `EXTRACTION_VERSION` — 식단 라운드에 `FOOD_CLASSIFY_VERSION`, `MEAL_RECOGNITION_VERSION`, `MEAL_RECOMMENDATION_VERSION` 추가, 25차엔 메뉴 칼로리 캐시 3종(`MenuLlmMatch`·`MenuLlmDecomposition`·`FoodWebEstimate`)의 `version` 컬럼과 타로·사주 프롬프트 버전이 캐시 키에 들어감, [versioned-llm-prompts](../concepts/versioned-llm-prompts.md))를 들고 있어 자동 stale 식별 가능. 전역 머지 결과(`global_menu_canonicals`)는 음식 카탈로그의 "외식 어휘" 소스이기도 하다 — 머지가 0행이면 카탈로그에 외식 메뉴가 합류하지 않는다. `GLOBAL_MERGE_VERSION` 3(택소노미 재료·메뉴군). schedule 도메인의 cron 자동 실행이 이 정규화→글로벌 머지 파이프라인을 주기로 돌린다.

25차의 새 LLM 사용처는 전부 **"정적·결정적 계산이 먼저, LLM 은 문장·매칭만, 없으면 정적 폴백"** 골격이다([static-first-llm-enrichment](../concepts/static-first-llm-enrichment.md)) — 타로(카드 의미 78×정·역 정적 → LLM 문장 → 정적 해석 폴백, 메뉴 타로는 후보 3개를 코드가 결정하고 LLM 은 이유만), 사주(C)(`@repo/utils` 명식·십신·신살·대운 결정적 → 섹션 4개 병렬 LLM → 정적 본문 폴백), 메뉴 칼로리(규칙 3등급 판정 → 카탈로그 밖만 LLM 매칭·분해 → 웹 실측 → 골든셋 게이트). 사주(G)는 명식 계산 후 Kimi 해석을 Zod·근거 검증한다.

## Key Decisions [coverage: high — 34 sources]

CLAUDE.md / TECH_STACK.md / 도메인 토픽 / docs/PLAN-*.md 에 명시된 핵심 결정. (reverse-chronological — 최신 먼저)

| 결정 | 이유 |
|---|---|
| **2026-09-07 — 같은 기능의 두 구현 사주(C)/사주(G)를 합치지 않고 경로·명칭·모듈·DB·한도 키로 분리해 공존 (`5f49026` 2026-09-06 · `e40b4c0` 2026-09-06 · [docs/MIGRATION-saju-g.md](../../docs/MIGRATION-saju-g.md) 2026-09-07)** | 두 세션이 각각 사주를 구현했고 둘 다 살아 있다. C 는 경로를 `/saju` → `/saju-c` 로 옮기고 공개 명칭만 "사주(C)"(본문·모듈 `modules/saju`·DB `saju_*`·feature `saju-reading`·purpose `saju` 는 그대로), G 는 내부 식별자 전부를 `SajuG*`/`saju-g`/`saju_g_*`/`saju-g-reading`/`OLLAMA_SAJU_G_MODEL` 로 통일. 서로 프로필·풀이·모델·사용량을 덮어쓰지 않도록 데이터 경계를 나누고 **상호 fallback 없음**. G 마이그레이션은 C 의 공개 마이그레이션 뒤에 G 테이블만 독립 생성(리베이스 전 로컬 3개는 C 와 테이블명이 겹쳐 하나로 재작성 — 공개된 C 마이그레이션은 수정 안 함). 공유하는 것은 usage-quota 모듈·`resolveOptionalUser`·`web-index` OG 헬퍼·어드민 AI 키/한도 탭의 행 노출뿐. 위키도 `saju-g.md` 는 그 세션이 직접 쓴다 — 위 Architecture "두 구현 공존" 표 |
| **2026-09-06 — 앱은 3D 기능을 RN 으로 이식하지 않고 웹을 WebView 로 품는다 (`624ead4` 타로 · `0a7f637` 사주(C), PLAN-tarot 결정 1)** | R3F 3D 무대를 두 번 만들지 않는다. `app/tarot`·`app/saju-c` 가 `${webUrl}/tarot?embed=1`·`/saju-c?embed=1` 을 열고 shared `embedBridge.ts` 계약으로 로드 전 `window.__LP_EMBED__ = {token, guestKey, theme}` 주입(JSON 직렬화, **토큰은 URL 에 싣지 않음**), 웹 → 앱은 `postMessage` `share`(OS 공유 시트 — WebView 는 `navigator.share` 제한)/`open`(외부 브라우저 — `<a download>` 가 WebView 에서 안 됨)/`title`. 앱 회원은 WebView 에서도 회원(자동 저장·한도 면제), 게스트 키는 앱 AsyncStorage 값이라 기기 한도·오늘의 카드 잠금이 앱↔WebView 일치. 지도(`PublicRestaurantsWebMap.native.tsx`)에서 이미 쓰던 패턴. 웹 `PublicLayout` 은 `?embed=1`(sessionStorage `lp:embed` 기억)이면 크롬 생략 — [embedded-webview-bridge](../concepts/embedded-webview-bridge.md). 사주(G)·집값은 앱 미연동 |
| **2026-09-06 — 운영 nginx 설정 원본을 리포에 둔다 + SPA 폴백 `$uri/` 제거·`absolute_redirect off` (`35b35fd`, 원인 실측 `13b87e8` 2026-09-05)** | 서버에만 있던 설정을 `ops/nginx/niney_life_pickr_v2_projects`(비밀값 없음)로 추적해 "기능 추가 시 블록을 같이 커밋하고 서버에 반영" 규약으로 — 타로·사주 배포마다 `^~` 블록을 손으로 옮기다 어긋난 것이 계기. 같은 커밋에 dist 의 `tarot/cards/`·`saju-c/images/` 때문에 `/tarot`·`/saju-c` 가 실제 디렉터리가 되어 `try_files $uri $uri/ /index.html` 의 `$uri/` 가 301→403 을 내던 운영 사고(2026-09-05) 교정을 두 서버 블록 모두에 적용. webp 블록은 7일 캐시(같은 파일명으로 재생성 가능하므로 1년 immutable 아님) + `try_files $uri =404`(없는 카드는 index.html 폴백 대신 진짜 404 여야 웹이 대체 카드를 그린다). `deploy.sh` 는 여전히 nginx 를 건드리지 않는다 |
| **2026-09-06 — 사주(C) 기본 모델은 kimi-k3, 속도보다 문장 품질 (`d31843b`, PLAN-saju 결정 4)** | 섹션 4개 병렬 호출이라 지연이 가려지므로 한국어·명리 용어 품질 우선. `probe:saju-reading` 3사주 × 4섹션 실측: kimi-k3 p50 5.6s(문맥·계절을 가장 자연스럽게 엮음) / qwen3.5:397b 5.5s / deepseek-v4-pro 3.5s / gpt-oss:120b 2.0s(나열식), JSON 준수 12/12·수리 0 전부. 타로는 반대로 속도로 gpt-oss:120b(4/4·p50 2.1s vs gemma4:31b 3.1s). 사주(G)도 kimi-k3 이나 별도 env — [ai](ai.md) purpose 표 |
| **2026-09-06 — 사주 계산은 코드가 결정적으로, LLM 은 문장만 + 명리 학파 차이는 기본값 고정·고급 옵션 (PLAN-saju 결정 1~5·기본값 표, `db1415f`)** | 타로와 같은 원칙(LLM 없거나 한도 넘어도 정적 풀이로 항상 동작). 사용자가 명리를 모르므로 기본값을 정한다 — 서울 진태양시(−30분, 역사 표준시 1908·1912·1954·1961 + 서머타임 12구간 자동), 자시 시작에 날이 바뀜(고급 "야자시"), 출생 시간 모름 허용(3기둥), 양/음력(윤달), 지원 1900~2050, 만 나이, 출생지 한국 고정(해외는 v2). 절기·음력 표는 KASI 신청 없이 astronomy-engine 계산으로 내장(공개값과 절기 ±1분·설날 1990~2050·윤달 1900~2050 일치, `--source=kasi` 로 교체 가능). 선택 컨셉 연결 3종(택일·궁합·오행 음식)을 v1 에 포함, 3D 는 타로와 다른 연출(흑요석 천문도·인장·먹 번짐). 사주(G)는 이 기본값과 다르다(표준시·자정 경계·태양시 보정 없음) — 위 공존 표 |
| **2026-09-05 — 메뉴 타로는 후보 메뉴를 코드가 결정적으로 고르고 LLM 은 이유만 쓴다 (`5d0c4c7`, v3a)** | 없는 메뉴를 지어내지 않고 같은 카드면 늘 같은 결과(캐시·공유·결과 전 미리보기 일치). utils `tarotMenu.ts` 메뉴 100종(계통·조리형태·원소 친화도·무드) × 카드 기운(원소는 카드 데이터, 무드는 메이저 표·숫자·궁정, 역방향은 반대) 자리별 가감점 + 카드 조합 시드로 동점 가르기, 상위 3개는 조리형태·계통 비중복. 서버 `normalizeTarotInput` 이 주제 `food` 를 강제, `toLlmBody` 가 모르는 menuId 무시. 칼로리는 음식 카탈로그 이름 일치로 — "오늘 뭐 먹지"를 타로로 잇는 스프레드. 피할 것이 추천과 같은 원소면 "과한 쪽만" 문구(`13b87e8`) |
| **2026-09-02 — 로그인 없는 공개 LLM 기능의 한도는 공용 익명 사용량 서비스로, 회원은 기기·IP 일일 면제, 값은 env 가 아니라 코드 기본값 + 어드민 DB (`cd5a29b` · `fae8190`, PLAN-tarot 결정 5·6)** | 타로가 첫 무인증 LLM 기능이라 "다른 기능도 쓸 수 있는 공통 서비스"로 설계 — `modules/usage-quota` feature × scope(guest/ip/global/user) × KST 날짜 SQLite 원자 카운터, `plugins/usage-quota` 30초 설정 캐시 + 04:40 GC, `plugins/jwt` `resolveOptionalUser`(무효 토큰도 게스트, 401 아님), `X-Guest-Key` + shared `guestKeyStore`. 층은 IP 분당(전원, `@fastify/rate-limit` max 함수) · 게스트 키 일일 · IP 일일(CGNAT 고려 게스트의 10배) · 전역 일일(LLM 예산, `guestCutoffPct` 에서 게스트 먼저 컷, 회원은 100%). 계획의 `TAROT_*_LIMIT` env 대신 `USAGE_QUOTA_DEFAULTS` + `UsageQuotaSetting` 행으로 통일하고 `/admin/settings/quotas` 에서 조정. 기본값은 "정상 사용자가 걸리지 않게, 비용이 문제 되면 어드민에서 내린다"(사용자 결정) — 타로 50/500/20/5000/90% 로 상향, 사주(C) 30/300/20/3000(1건 = LLM 4호출), 사주(G) 20/200/10/1000. 초과 시 기능이 죽지 않고 정적 해석/본문 — [anonymous-usage-quota](../concepts/anonymous-usage-quota.md) |
| **2026-09-02 — 메뉴 칼로리 규칙은 골든셋 정밀도로 채택한다 (`0d2584a` · `fb12027` · `51de12a`, [docs/menu-calorie-engine.md](../../docs/menu-calorie-engine.md))** | 메뉴명 3등급 판정(정확/추정/불투명)을 `apps/friendly/golden/menu-nutrition.golden.json`, 세트 분해를 `menu-decompose.golden.json`(37건) 으로 재고 `measure:menu-golden`·`measure:menu-decompose` 가 정밀도를 찍는다 — 규칙 4종(결합 기호가 세트어보다 먼저, 괄호 안 나열은 구성, 괄호 안 세트어는 옵션, 주메뉴 하나짜리 세트는 그 음식의 100g당)은 **판정 정밀도 99.5% 유지·분해 93.8%** 를 넘겨야 들어갔다(불투명 세트 45→34건). LLM 분해 v3 는 high 신뢰만 채택·범주어 제거. 골든셋 자체도 실측으로 정정(주메뉴 세트 9건). 엔진은 `modules/food/engine/`(parse·resolve·lexicon·catalog-index) — [golden-set-precision-gate](../concepts/golden-set-precision-gate.md), [food](food.md) |
| **2026-09-02 — 카탈로그에 없는 음식은 웹 실측(fatsecret.kr 검색 페이지 집계)으로, LLM 은 매칭·분해에만 쓰고 숫자 추출엔 안 쓴다 (`d12b47d` · `9d3253a` · `bcfc72b`)** | 규칙 밖 메뉴명은 gemma4:31b(골든셋 84건 88%, high 만 채택 29/30)가 카탈로그에 연결하되 **어휘 단위 영구 캐시**(`MenuLlmMatch`)라 비용 미미, 백그라운드 판정. 검색엔진(Ollama web_search)은 한국어 음식명을 못 맞추고 LLM 숫자는 신뢰 못 해 fatsecret.kr 검색 결과의 100g당을 파서(버전 3: 중앙값 ±25% 2건 이상 또는 이름 일치 단독)로 집계해 `FoodWebEstimate` 에 영구 캐시(미채택도). 원재료 DB(15100065)·큐레이션 주류표로 표시율 49.8%→77.9%. 제3자 사이트라 약관 변경 시 이 계층만 끄면 된다 |
| **2026-09-02 — data.go.kr 키는 `DATA_GO_KR_API_KEY` 하나 — 도메인별 이름·`\|\| BUS_API_KEY` 폴백 체인 폐기, 호환 별칭 없음 (`3d9dfed`)** | 포털 키는 계정당 1개인데 `BUS/AIRKOREA/KMA/HIRA/RTMS/KAPT/BLDG/FOOD_API_KEY` 8개 이름과 폴백이 29파일에 흩어져 "버스 키가 날씨·집값에 쓰인다"는 오해를 낳았다. 하나로 완전 교체하고 `env.ts` 주석에 데이터셋별 활용신청 목록(버스·에어코리아·기상청·심평원·실거래 2종·K-apt 2종·건축HUB·식약처)을 모았다. 데이터셋별로 다른 계정 키를 꽂아 쿼터를 나누는 능력은 포기(쓴 적 없음). 다른 발급처 키(`SUBWAY`·`SEOUL_OPEN`·`FOOD_RECIPE`·`MAFRA`·`VWORLD`·`KMA_APIHUB`)는 그대로. **운영 `.env` 는 배포 전 이름 변경 필수** — 24차 결정 "폴백 체인" 을 대체한다 |
| **2026-09-02 — 집값은 실거래를 API 로 받되 로컬 DB 에 적재하고 요청 경로는 파생 표만 읽는다 + 장부 기반 증분·월 갱신 croner (`254fb76` · `168b363`)** | 국토부 실거래는 시군구(252) × 계약년월 × 유형 단위라 원본 파일이 없는 첫 API 적재 도메인 — `HousingTradeSync` 장부가 받은 달을 기억해 끊겨도 이어 받고(24개월 백필 ≈ 12,000콜, 일 10,000 한도라 이틀), `HOUSING_REFRESH_CRON`(croner, 라우트 플러그인 onReady 기동)이 최근 N개월을 재수집해 신고 지연(계약 후 30일)·해제를 반영. 단지 마스터(부동산원 CSV 45,920 아파트)는 일상지도와 같은 `LifeGeocodeCache`·압축본으로 좌표(운영 호출 0건). 정보 없는 단지는 폴백 체인 — 축 폴백(any 통계 행, 회색 배지) · 공시가격 zip(호별 1,558만 행 스트리밍) · K-apt 의무단지 · 건축HUB · 좌표 보완(도로명→지번). 단지 재적재 시 보강 컬럼·좌표 이어받기. K-apt 는 xlsx 1행 안내문·헤더 2행·승강기 6열 합산·API 경로 V3→V5(게이트웨이 12 는 미신청이 아니라 경로 버전) — [open-data-master-load](../concepts/open-data-master-load.md) 다섯 번째 도메인, [housing](housing.md) |
| **2026-09-02 — 이미지 원본(제미나이 PNG)은 git 밖 `assets-src/`, webp 산출물만 커밋 (`cd5a29b` · `58842db` · `142e116`, PLAN-tarot 결정 2·3)** | 78장 장면형 덱 + 사주 22장을 사용자가 제미나이로 생성(프롬프트북 `docs/tarot-deck-prompts.md`·`docs/saju-image-prompts.md`, 민화풍 + 금박)하고 `build:tarot-deck`·`build:saju-images` 가 크롭·webp 512/1024·`manifest.json`(누락 목록)으로 변환 — 원본은 재생성 가능한 입력이라 `data/open/` 과 같은 "리포 밖" 원칙(`.gitignore /assets-src/{tarot,saju}/raw/`). 없는 카드는 placeholder/이름 박스로 기능이 먼저 동작(2차는 이미지 없이 진행). 한자 글리프 PNG 는 운영에 CJK 폰트를 안 깔려고 개발 머신에서 생성해 커밋 |
| **2026-09-02 — 메뉴 탭 썸네일은 프록시 리사이즈본 (`0997a69`)** | 56px 썸네일이 네이버·배민 원본(1,000~3,000px, 최대 2.4MB)을 받아 뷰포트 진입마다 메인 스레드 디코딩으로 프레임이 밀렸다. friendly 프록시 허용 호스트에 배민(`imagefarm.baemin.com`·`file.smartbaedal.com`) 추가, utils `isThumbnailProxyable` 로 웹·앱 판정 공유, 웹 메뉴 `w=112` + width/height 고정 + `decoding="async"`, 리뷰 `w=480`, 앱 `thumbUrl(112)` — 2.4MB → 2.9KB |
| **2026-09-02 — `deploy.sh` 는 `set -e` 아래 실패할 수 있는 명령 치환을 대입에 쓰지 않는다 (`b8c08ed`)** | `HOUSING_KAPT_XLSX="${...:-$(ls *단지_기본정보*.xlsx \| sort \| tail -n1)}"` 은 파일이 없으면 `ls` 실패 → 메뉴를 찍기 전에 스크립트가 **출력 없이** 종료. glob for 루프(`kapt_latest_xlsx`)로 바꿔 없으면 빈 값 → 폴백, 있으면 사전순 마지막(최신 날짜) |
| **2026-08-30 — 병의원 레이어는 CSV 가 아니라 API 전량 페이징 + `--offline` 지오코더 (`4fd6e22`)** | 심평원 15001698 `getHospBasisList` 1,000행 × ~80콜이면 전량이고 좌표(XPos/YPos)가 99.99% 실려 온다 → 파일 업로드 단계가 없다. 결측 소수만 기존 `LifeGeocodeCache` 로 보완하되 배포 예측성을 위해 deploy 는 `--offline`(수동 재실행이 채운다). 게이트웨이가 1MB 페이지에서 20초를 넘겨 타임아웃 40초 + 일시 오류 2회 재시도, 종별코드명 `상급종합`(≠`상급종합병원`) 매핑 |
| **2026-08-22 — 공공데이터 원본은 리포 밖 `data/open/`, 가공 캐시만 커밋, deploy 자동 점검 (`809b7e0`·`5a84b63`·`dae1cc9`)** | 79MB CSV·91MB 평가셋을 git 에 넣지 않는다. 원본은 로더 입력일 뿐이라 갱신 때만 필요 → 보관 기준은 "다시 받기 난이도". 로더가 `data/open/…` 을 기본으로 찾아 인자 없이 재적재, `status:*` 한 줄을 deploy.sh 가 파싱해 비었을 때만 자동 적재(잘못 재적재하면 LLM 분류를 통째로 다시 도니 상태 해석 실패는 skip). 지오코딩 결과(VWorld 일일 한도 소모물)는 `json.gz` 로 커밋해 서버에서 업스트림 0건으로 재현 — [docs/data-sources.md](../../docs/data-sources.md). 25차에 집값(`data/open/housing/`, 케이스 8)과 이미지 원본(`assets-src/`)이 같은 원칙에 합류 |
| **2026-08-22 — 영양성분은 API 가 아니라 CSV 배포본이 기본, 포털 키는 선택 (`edb7f44`)** | data.go.kr 15100070 은 같은 데이터를 CSV 로 배포한다 — 파일이 있으면 쿼터를 안 쓰고 API 는 파일이 없을 때의 대안. 실제 카탈로그도 파일로 만들었다. 25차 `fetch:mfds-nutrition` 이 포털 JS 다운로드를 재현(서비스키 불필요), 원재료성식품 15100065 도 같은 스크립트 `--pk=`. 레시피만 식품안전나라 키가 필수 |
| **2026-08-21~22 — data.go.kr 데이터셋별 활용신청 (`7340743`·`37e0db0`·`4fd6e22`·`69dc0e2`) — 키 폴백 체인 부분은 2026-09-02 `3d9dfed` 로 대체** | 포털은 **계정당 키 1개**. 당시엔 도메인별 env 가 비면 `BUS_API_KEY` 로 폴백하는 체인을 뒀으나 25차에 이름 하나로 통일했다(위). 여전히 유효한 부분: **활용신청은 데이터셋마다** 따로라 미신청 키는 `30 등록되지 않은 서비스키`(키가 틀린 게 아님). 기상청 API허브는 포털과 별개 발급이라 비우면 기능만 꺼짐(AWS 보강). 라우트 진입 시 키가 없으면 503 으로 기능 단위 비활성 |
| **2026-08-22 — 일상지도·식단 카탈로그는 "배치 적재 후 로컬 조회", 실시간 어댑터·쿼터 게이트 없음 (`1d92acb`·`69dc0e2`)** | 지하철·버스와 달리 CCTV·화장실·음식은 사실상 정적이라 요청 경로에서 외부를 부르지 않는다 → [quota-proportional-loading](../concepts/quota-proportional-loading.md) 의 1층(정적=로컬)만 쓴다. 대신 `load-*` 적재 파이프라인 + 어드민 잡(food 는 SSE)이 필요. 대기·날씨는 반대로 실시간이라 에어코리아 어댑터 패턴 + TTL 캐시(2층)로. 집값(25차)은 1층에 "장부 + 월 갱신"을 더한 변형 |
| **2026-08-22 — 식단은 로그인 필수·독립 도메인·FK 없는 스냅샷·LLM purpose 2종 분리 (PLAN-meal 결정 A~I)** | 사진 포함 서버 저장 데이터라 게스트 하이브리드가 맞지 않음. 카탈로그·식당은 재머지/재크롤로 사라지므로 기록은 스냅샷 문자열(+영양 스냅샷). `meal-photo`/`meal-recommend` 를 `image`/`chat` 과 분리해 모델·동시성 게이트·텔레메트리 독립 튜닝(`buildLlmProviderEnv` 로 env 조립 일원화). 일일 쿼터는 in-memory 가 아니라 **SQLite 영속**(재시작 우회 방지) — 25차 usage-quota 카운터가 같은 원칙. 자세한 건 [meal](meal.md)·[food](food.md) |
| **2026-08-22 — DB 를 건드리는 테스트는 `useIsolatedDatabase()` 필수 (`517e465`)** | 테스트가 `.env` 의 `DATABASE_URL`(운영 스냅샷)을 그대로 쓴다. analytics 글로벌 머지 테스트 한 블록이 격리를 안 써 `pnpm --filter friendly test` 한 번이 머지 결과(5,446 그룹 + 링크 22,303 + 청크 캐시)를 통째로 날렸고 LLM 1,352콜로 복구했다. 격리하면 실데이터 전제(두 패스 변형 목록 상이)가 깨지므로 픽스처로 재현해야 한다. 25차 사주(G) 세션이 `useSchemaDatabase()`(현재 schema 로 빈 임시 DB, 실데이터 복사 없음) 를 추가해 C/G 테스트가 쓴다. 경고는 docs/data-sources.md 에도 |
| **2026-08-22 — 상단바 폭 예산 + 모바일(웹 작은 화면) 계정·테마는 사이드바 하단 (`a062e7d`)** | 내 위치 칩(모바일 ~170px / lg+ ~340px)이 들어오자 375px 에서 문서가 465px 로 넘쳐 테마·로그인이 화면 밖으로 밀리고 `fixed inset-x-0` 레이어(맛집 지도·시트)까지 문서 폭을 따라 커졌다. 폭 구간별 담는 것을 나눔 — `<md` [≡][로고]…[칩] / `md~lg` +테마·계정 메뉴 / `lg+` NAV 가로 + 칩 확장 / `xl+` 이메일. 로그인 사용자는 `AccountMenu`(헤드리스 디스클로저) 하나. 넘치면 버튼 대신 칩이 줄어들게(왼쪽 shrink-0 / 오른쪽 min-w-0). 25차에 NAV 가 10개로 늘었다 |
| **2026-08-22 — 지도형 공개 페이지 모바일은 맛집 v2 바텀시트 패턴으로 통일 (`e84e4b9`)** | `BottomSheet` 를 `restaurant-v2/` → `sheet/` 로 승격, 목록/상세 두 시트 스냅 조율을 `useMapSheets` 로 — 대중교통·일상지도·맛집 v2·**집값(25차)** 이 같은 훅. 분기는 CSS 이중 마운트 대신 JS(`useIsDesktopXl`) → 지도 한 장·패널 한 벌. 지도 하단 컨트롤은 `--map-bottom-inset` 만큼 올라와 peek 시트에 안 가림. React Compiler 메모 검증 때문에 `useMapSheets` 는 각 페이지 `useState` 앞에 |
| **2026-08-22 — 앱 Metro 는 Expo SDK 54 기본 모노레포 탐색으로 회귀 (`5cb63a3`)** | 수동 `watchFolders`/`nodeModulesPaths`/계층 탐색 차단이 pnpm 호이스팅된 `webidl-conversions@8` 을 골라 Hermes 부팅에서 `SharedArrayBuffer` 참조 오류. 기본 구성이 각 패키지의 중첩 의존성(Expo 용 v5)을 고른다. RN 버전과 안 맞던 React/React DOM 고정 별칭도 제거 |
| **2026-08-22 — 무료 Apple 팀 로컬 빌드는 Push capability 제거 플러그인, EAS/유료 팀은 유지 (`b733628`)** | `expo-notifications` 가 항상 넣는 `aps-environment` 가 있으면 Personal 팀 프로비저닝이 실패한다. 앱은 로컬 알림(하차·끼니)만 쓰므로 로컬 빌드에서 뺀다 — `associatedDomains` 와 같은 깃발 `EXPO_PUBLIC_ENABLE_APPLINKS=1`. config-plugins 의 mod 는 **나중에 등록된 것이 먼저** 실행되므로 `'expo-notifications'` 보다 앞에 둔다 |
| **2026-08-23 — 앱 네이티브 모듈은 지연 로드 + 없으면 안내 (`0064ab9`)** | `expo-document-picker` 가 새로 들어갔는데 JS 만 갱신된 dev client 엔 없어 최상위 import 가 터지며 식단 화면 전체가 빈 화면. 파일을 실제로 고를 때만 `import()` 하고 없으면 "앱을 새로 빌드하면 켜집니다"로 끝낸다 — 나머지 설정은 그대로 동작. 네이티브 모듈 추가 커밋은 JS 리로드가 아니라 **재빌드** 필요(25차 `react-native-webview` 도 같은 부류) |
| **리뷰 지능화 — RAG 문맥검색 + 군집화 (18차 2026-06)** | 리뷰를 bge-m3 임베딩으로 enrich 해 하이브리드 회수→리랭크→RAG 답변(2차 검증 가드레일)하는 [review-search](review-search.md), UMAP→HDBSCAN→c-TF-IDF→LLM 라벨로 묶는 [review-clustering](review-clustering.md). 군집 수학은 **Python 사이드카**(spawn), 임베딩은 로컬 Ollama bge-m3(`/api/embed`, Cloud 엔 임베딩 없음). 둘 다 canonical 멤버 다소스 행을 통합 코퍼스로([canonical-corpus-fanout](../concepts/canonical-corpus-fanout.md)). HyDE 제거·rerank-합집합 기각·span-grounding 채택은 `research/<domain>/probe-*` 로 실측 판정 |
| **운영 자동화 — 텔레그램 봇 + 자동 발굴 + 작업 로그 (18차 2026-06)** | [telegram](telegram.md) 봇(long-polling)이 `/search`·`/discover`·`/stats` 와 크롤 알림을 담당. [random-crawl](random-crawl.md) 이 cron 으로 지역을 골라 후보를 텔레그램으로 보내고 사용자가 고른 가게만 크롤(사람이 끼는 2단계). [logs](logs.md) 가 전 기능 run/step 을 [operation-log-instrumentation](../concepts/operation-log-instrumentation.md) 으로 통합 기록 + 실패 LLM 자동분석. 모두 no-Redis in-process 전제 유지 |
| **LLM 계정 게이트 + 사용량 텔레메트리 (18차 2026-06)** | 호출이 purpose 게이트→계정 게이트 2단 직렬 통과([in-memory-singleton-gates](../concepts/in-memory-singleton-gates.md)), DB maxConcurrent 동기화. 모든 호출이 AdapterCache→OllamaCloudAdapter 단일 경로로 수렴해 onEvent 훅으로 전 지점 계측 → telemetry SSE. AI 키 1계정 공유 + 용도별 모델만 분리(25차 8종 — 익명 트래픽 격리는 purpose 전용 키 own) |
| **4번째 출처 테이블링 + 세부 분배(잔수) (18차 2026-06)** | 테이블링(무인증 REST) 합류로 canonical 이 4소스 묶기, 같은 source 얕은/풍부 티어는 place↔partner 자동 승격. 정산은 한 차수 카테고리 풀을 멤버끼리 균등/잔수(GLASSES) 분배 — `drink-kinds` 단일 사전이 FE 제안·BE 추출보정·프롬프트 힌트 셋을 먹임(EXTRACTION_VERSION 3→4 주류 오분류 이중 안전망) |
| **맛집 공유/SEO — SSR-lite head 주입 (18차 2026-06)** | `/r/:placeId` + sitemap.xml + robots.txt 가 빌드된 index.html `<head>` 에 OG/JSON-LD 주입(봇=서버 / 사람=SPA). 정산 공유와 같은 [ssr-lite-head-injection](../concepts/ssr-lite-head-injection.md) 메커니즘(16차 정산 단독→식당→투표→25차 타로·사주(C)·사주(G)로 번져 `lib/web-index.ts` 공용 헬퍼 추출). 네이버 파노라마 대표이미지 503/TTL 만료는 영구 사본 캐시(panorama-cache)로 해소 |
| **schedule 도메인 신규 — croner in-process 주기 자동 실행 (17차 2026-06)** | "정규화→글로벌 머지(증분)" 를 어드민 cron 주기로 자동화. `croner` **in-process**(단일 Fastify + no-Redis 전제와 일관 — 외부 잡 큐 안 둠). `plugins/schedule.ts` 가 `ScheduleService` 전역 singleton + `scheduleRegistry`(cron 타이머 + 동시 1개 inflight, overlap 시 skip). 부팅 시 stale `running`→`interrupted` 정리 + 설정 cron 등록, SIGTERM 시 abort + graceful close. 어드민 UI 는 `AdminAnalyticsPage` 에 섹션 통합. 신규 테이블 `schedule_configs`/`schedule_runs`, croner 의존 추가. nextRunAt 은 croner 로 매번 계산(미저장). 25차 usage-quota GC(04:40)·housing 월 갱신도 같은 `scheduleRegistry`/croner 위에 |
| **카테고리 택소노미 v3 — 재료·메뉴군 축 전환 (17차 2026-06)** | 전역 머지 최상위를 음식 종류(한식/일식/양식)→재료·메뉴군(고기/면/김치/반찬/찌개·전골/회·초밥/튀김…)으로. `GLOBAL_MERGE_VERSION` 2→3 → 기존 행 stale, full 재머지 필요. 복합어는 가운뎃점(`/`는 path 구분자라 금지). LLM 출력 맵→**배열** 스키마(Ollama grammar fix) + 청크 50→10. `buildCategoryTree` 공용(전역 어드민 + 식당별 공개 분석 탭) |
| **다크 모드 — 저장소 플랫폼 분리 / design 토큰 공유 (17차 2026-06)** | 웹/앱 둘 다 system/light/dark 3-way. 웹 localStorage / 앱 AsyncStorage `'lp:themeMode'`(수동 hydrate + `useResolvedThemeMode`=useColorScheme 결합) — shared 가 RN/web storage 직접 import 안 하도록 저장소는 플랫폼별, `@repo/shared` design 토큰만 공유. vworld 다크(midnight)/위성 레이어 토글 + 앱 테마 연동(`tileSource.setUrl()` 로 map 재생성 없이 전환). 25차 WebView 임베드는 테마를 브리지로 웹에 넘긴다 |
| **앱 안드로이드 커스텀 탭바 + 빌드 스크립트 (17차 2026-06)** | 표준 스타일 커스텀 하단 탭바, `splashscreen_logo` 누락 빌드 fix, 바텀시트 가로 스와이프 fix. iOS/Android 실기기·릴리즈 실행 스크립트. 루트 `expo run:ios` 오염(ios/·app.json) 정리 + 루트 `.gitignore` 에 `/ios /android /app.json` 추가로 재발 차단(정상 네이티브 빌드는 `apps/mobile`) |
| **soft tonal variant + 카드 클릭/더블클릭 지도 통일 (17차 2026-06)** | 버튼/배지 soft tonal 색 variant 도입(어드민/상세/병합 일괄). 분석 탭 메뉴/팁 클릭→해당 리뷰 필터, 메뉴 썸네일 탭→라이트박스. 목록 카드 클릭=지도 이동/더블클릭=확대(공개+어드민 통일), 상세 탭 카드 테두리 제거·리뷰 사진 풀폭(웹/앱 통일) |
| **ESLint 인프라 — base ← node/react 확장 체인 (16차 2026-06)** | 4 워크스페이스가 `@repo/config/eslint/*` 를 확장해 turbo lint 4/4 green. base 는 TS 규칙(`consistent-type-imports` error, `no-undef` off — tsc 가 미정의 식별자 처리). web/mobile 은 react-hooks v7 = React Compiler 진단 룰로 메모이즈 가능 여부까지 정적 검사. 기존 위반은 일단 `warn`(가시성·회귀 방지), 정리되는 대로 error 승격 |
| **운영 도메인 `ninelife.kr` + `deploy.sh` 케이스 선택 (16차 2026-06)** | 옛 `nlpp.easypcb.co.kr` 폐기(nginx 원본엔 구 도메인 블록이 아직 남아 같은 dist·:3000 을 서빙). `deploy.sh [1-5]`(2026-08 에 데이터 적재 6·7, 2026-09 에 8 추가 — 위 API Surface) 가 변경 범위(API/DB/웹)에 맞춰 최소 작업만 — 추가형 마이그레이션은 무중단 `pm2 reload`, 파괴적이면 stop→migrate→start 선택. 운영 토폴로지 Cloudflare→nginx→Fastify(pm2 fork 단일 인스턴스, SQLite 락 회피) |
| **정산 공유 OG SSR-lite — index.html `<head>` 주입 + 정산표 PNG (16차 2026-06)** | 웹은 순수 SPA 라 JS 미실행 크롤러(카카오/슬랙)가 공유 링크를 긁으면 OG 가 빈다. 공유 경로만 friendly 로 보내 `<head>` 에 OG 메타(식당명·총액·인원수 — **참가자 이름은 미노출**) 주입. `og:image` 는 `/share/settlements/<token>/image.png` 로 satori+resvg 정산표 매트릭스 즉석 렌더. 폰트는 레포 커밋(`IBMPlexSansKR`)이라 별도 설치 불필요. 풀 SSR 아님(meta 만 서버, 본문은 SPA) |
| **OG og:image nginx `^~` 우선권 + Cloudflare Purge (16차 2026-06)** | og:image 가 `.png` 로 끝나 정적 캐싱용 `~* \.png$` 정규식 location 에 가로채여 prod 404(dev OK)나는 함정. `location ^~ /share/settlements/` 로 prefix 가 정규식을 이기게. Cloudflare 가 `.png` 엣지 캐시라 잘못된 404 캐시 시 nginx 고쳐도 Purge 전까진 안 풀림. 25차 `/tarot/s/`·`/saju-c/s/`·`/saju-g/s/` 블록이 같은 이유로 `^~` |
| **전방위 perf — 라우트 lazy + vendor 청크 고정 + 핫패스 React.memo (16차 2026-06)** | 웹 라우트 컴포넌트 lazy 로 첫 로드 바이트 절감. `vite.config.ts` Rolldown `codeSplitting.groups`(ol/react-vendor/query/radix — 25차 three)로 앱 코드만 바뀌어도 벤더 캐시 유지. interaction 핫패스 `React.memo`. 크롤 배치는 `setQueryData` 머지로 상세 GET 제거. friendly 는 식당명 경량 조회·OG 미리보기 경량 select+5분 캐시·attendee `createMany`. 앱은 정적에셋 PNG 압축 + 썸네일 프록시(~98%) + FlatList 가상화. 정산 draft hydrate placeId당 1회 |
| **dev CORS 전면 반사 허용 (preflight 차단 해소)** | 개발 머신 IP 가 공인/사설/VPN/WSL 로 수시로 바뀌어 화이트리스트 무의미. 거부(`cb(Error)`)가 로그인 preflight(OPTIONS)를 통째로 깨던 회귀 해소. dev 한정 모든 origin 반사, 비-LAN 만 origin당 1회 warn. prod 는 env `CORS_ORIGIN` 엄격 차단(보안 영향 0) |
| **N차(차수) 정산 모델 — round 레벨 attendance + exclude override** | 마스터 참여자는 session 레벨, round 별 출석 + exclude override 만 round. override null → 마스터 default 상속, 명시값 → round override. 한 자리 1차/2차 다른 식당·출석자 케이스가 흔해서 1차 단일로는 부족. attendees 20→100, items 100→200 |
| **서버 draft 자동저장 + `fromDraftId` 트랜잭션 정리** | 5s debounce PUT `/settlement-drafts` → upsert. 본 저장 시 같은 트랜잭션에서 draft 삭제(경합 회피). 3 레이어: 웹 sessionStorage / 앱 AsyncStorage / 서버 DB(다기기 canonical). hydrate 는 placeId 당 1회(perf) |
| **storage 어댑터 외부 주입 (`setSettlementDraftStorage`)** | shared 의 `settlementDraftStore` 가 storage 의존 없이, 웹/앱 각각 부팅 직후 어댑터 주입. shared 가 RN AsyncStorage 직접 import 하면 웹 번들에 RN 코드 섞이는 문제 회피 — 25차 `setGuestKeyStorage`·`setSajuProfileStorage` 도 같은 패턴(`createJSONStorage` 팩토리 1회 호출 함정 수정 `7520859`) |
| **분담 다듬기 + 차수 할인 + 멀티 영수증 분할** | refinement: `SettlementCategoryAdjustment`(leftoverParticipantId + roundUnit null|100|1000), 안 나눠지면 silent fallback. 할인: round 당 단일 카테고리(`pool >= discountAmount` refine). 분할: `ExtractReceiptSplit { count: 2..5, index }` 같은 imageToken 재사용 + sharp crop, N 회 vision 호출(비용 인지 UX) |
| **앱(iOS/Android) 정산 풀구현 + Universal/App Links** | 이전 "정산은 mobile 미구현" 정책 종료. friendly `well-known` 모듈이 AASA/assetlinks 를 env 기반 동적 응답(미설정 시 404 — 잘못된 빈 JSON 검증 실패 사고 회피). 미설치 단말은 같은 URL 로 웹 SPA fallback — 한 URL 두 진입점 |
| **AI key 모델 preview before save** | `GET /admin/ai/providers/:id/:purpose/models/preview` — 키 검증 + authoritative 모델 list 받아본 뒤 저장. 잘못된 키/존재 안 하는 모델 저장 사고 컷 |
| **`PUT /settlements/:id` 풀 리플레이스 — items 도 변경 가능** | 옛 PATCH `/:id/participants` 대체. 한 트랜잭션 rounds/participants/items 전체 교체. "items 불변" 정책 폐기 |
| **tabs-layout web/native split + Tailwind v4 `@custom-variant dark`** | `_layout.tsx` 는 wrapper 만 → Metro 가 web 빌드에서 `.web.tsx` 자동 채택(native-only RN 라이브러리가 RN-Web 번들에 안 들어가게). Tailwind v4 dark variant 는 `.dark` 클래스에 명시 바인딩(v4 자동 detect 어긋남 fix) |
| **이전 라운드 결정들 (변동 없음, 요약)** | AI provider purpose 분리 / 공유 토큰(`SettlementSession.shareToken @unique`) / DB 경로 통일 / 4단계 stepper / 단골 자동 적립 / 용어 규약 / 출처 3종 + canonical / C안 자동 DC 머지 / auto-discover / MAX_CONCURRENT_PER_ACTOR=5 / 부팅 stale 정리 / SSE liveness / pnpm+Turbo / Zod SSOT / SQLite+Prisma / Vite + React 19 / TanStack Query + Zustand / 로직만 공유 UI 는 플랫폼별 / 분석 수동 트리거 / `*_VERSION` stale / Docker / Redis 없음 |

`tsconfig.base.json`은 `strict + noUncheckedIndexedAccess + verbatimModuleSyntax + isolatedModules` — 엄격 모드 풀스택.

### 모바일 UX 규율 (프로젝트 차원) [coverage: high — 1 doc + 8 source files]

전체 명세는 [docs/mobile-public-restaurant-ux.md](../../docs/mobile-public-restaurant-ux.md).

1. **모바일 = body 스크롤** — `fixed inset-0` 풀스크린 금지
2. **sticky element 는 wrapping 금지** — 분기는 sticky element 자체 className 에서
3. **sticky 묶음은 `overflow:auto` 컨테이너 밖에**
4. **`100vh` 대신 `100dvh`** — iOS Safari dynamic viewport
5. **탭 상태는 URL 의 일부, push 로 전환** — `replace` 금지
6. **한글 IME 대응** — `compositionStart/End` + 로컬 `draft` state
7. **scroll-to-top 환경 자동 분기**
8. **iOS Safari focus zoom 회피** — font-size ≥ 16px
9. **sticky breakdown — z-30 페이지 헤더** — sticky 끼리 겹치는 케이스의 일반 규율
10. **3-컬럼 라이트박스는 `createPortal(body)` 로 stacking context 탈출** — sticky 컬럼에 `z-50` 갇혀 잘리는 회귀 회피 (웹 공개 상세)
11. **지도형 공개 페이지(맛집 v2·대중교통·일상지도·집값)는 v2 시트 패턴** — `fixed` 지도 배경 + `components/sheet/BottomSheet`(3-snap) + `useMapSheets` 목록/상세 조율, 데스크톱/모바일 분기는 `useIsDesktopXl`(JS) — 규율 1 의 예외이며 명세는 [docs/mobile-public-restaurant-ux-v2.md](../../docs/mobile-public-restaurant-ux-v2.md)
12. **상단바는 한 줄 폭 예산** — 넘치면 오른쪽 끝이 화면 밖으로 밀리고 문서가 가로 스크롤돼 `fixed inset-x-0` 레이어까지 커진다. 요소를 더할 땐 `PublicTopBar.tsx` 상단 폭 예산 메모(`<md`/`md~lg`/`lg+`/`xl+`)에 맞춰 넣고, md 미만에 안 들어가면 `PublicSidebar` 하단으로
13. **3D 무대는 데스크톱 패널 / 세로 폰 바닥 시트 + WebGL 없으면 Lite (25차)** — 타로·사주(C) 둘 다 품질 등급(high/medium: dpr·파티클·bloom) + `?lite=1`·reduced-motion·WebGL2 없음이면 기능만 되는 Lite, 3D 런타임 오류는 에러 바운더리로 Lite 폴백(흰 화면 방지). 세로 폰은 카메라 시선 y 하강·슬롯 spread 축소. 애니메이션을 두 벌 만들지 않는다 — [webgl-stage-lite-fallback](../concepts/webgl-stage-lite-fallback.md)

부가 — dev 서버에서 모바일 단말 테스트하려면 `apps/web/vite.config.ts` 의 `server.host: true`. 앱 Expo Web 도 LAN IP 자동 매칭 + friendly dev CORS 전면 반사라 폰-LAN 접근 부담이 거의 없다. 앱 WebView(`webUrl`)는 개발 시 `:5173` 을 가리키므로 웹 dev 서버가 떠 있어야 타로·사주(C) 화면이 뜬다.

## Gotchas [coverage: high — 30 sources]

- **운영 배포 체크리스트가 25차에 다섯 군데 늘었다 (운영 메모)** — ① **nginx 블록 추가**: `ops/nginx/niney_life_pickr_v2_projects` 원본의 `^~ /tarot/s/`·`^~ /saju-c/s/`·`^~ /saju-g/s/`(OG·image.png 프록시) + `^~ /tarot/cards/`·`^~ /saju-c/images/`(webp 7일 캐시·진짜 404) 를 서버에 복사 → `nginx -t` → reload — `deploy.sh` 가 안 한다. ② **SPA 폴백 `try_files $uri /index.html`(`$uri/` 제거) + `absolute_redirect off`** — 안 고치면 `/tarot`·`/saju-c` 직접 진입·새로고침이 `301 → /tarot/` → **403**(2026-09-05 운영 실측, SPA 내부 이동은 멀쩡해 늦게 드러남). ③ **마이그레이션 11개**(`20260830094116_add_housing` ~ `20260906170000_add_saju_g`, 전부 추가형 → 케이스 2/4 무중단) — 사주(G) 마이그레이션은 C 뒤에 독립 생성이며 이미 G 테이블이 있으면 트랜잭션 전체 롤백. ④ **`.env` 이름 변경**: `BUS_API_KEY`·`AIRKOREA_API_KEY`·`KMA_API_KEY`·`HIRA_API_KEY`·`FOOD_API_KEY` → `DATA_GO_KR_API_KEY` 하나(호환 별칭 없음 — 옛 이름은 무시되어 버스·대기·날씨·집값 라우트가 503), 선택 추가 `OLLAMA_TAROT_MODEL`·`OLLAMA_SAJU_MODEL`·`OLLAMA_SAJU_G_MODEL`·`OLLAMA_MENU_MATCH_MODEL`·`HOUSING_REFRESH_CRON`(빈 값 = 월 갱신 끔)·`HOUSING_REFRESH_MONTHS`, 그 뒤 `pm2 reload --update-env`. ⑤ **정적 자산은 웹 빌드에 포함**(케이스 3/4): `public/tarot/cards/`·`public/saju-c/images/` 가 dist 로 복사되고 사주 글리프 PNG 는 friendly 리포에 커밋돼 있어 운영에 CJK 폰트·이미지 업로드 단계는 없다. 집값은 케이스 1·2·4 자동 점검이 단지 CSV 없으면 안내만 하고 넘어가니 `data/open/housing/reb-complexes.csv` 를 먼저 올리고 `status:housing` 으로 확인, 실거래 백필은 `HOUSING_MONTHS=24 ./deploy.sh 8`(일 10,000콜 → 이틀). 재배포 뒤 `pm2 reload friendly` 는 여전히 필수(index.html 1회 캐시)
- **타로 운영 모델은 어드민 DB 가 코드 기본값과 다르다 (25차)** — 코드·`.env.example` 기본은 `gpt-oss:120b`(프로브 4/4·p50 2.1s)이지만 2026-09-05 운영 배포 기록(PLAN-tarot 진행 기록)은 "운영 모델은 gemma4:31b". purpose 별 모델은 `LlmProviderConfig` 행이 env 를 이기므로 어드민 "AI 키 > 용도별 모델"에서 확인해야 실제 값이다. 사주(C)·사주(G) `kimi-k3` 도 같은 규칙
- **사주(C) job 레지스트리는 프로세스 메모리 — 재시작하면 410 (25차)** — 섹션 4개 병렬 LLM job 은 `saju-jobs.ts` 의 Map(완료 후 5분 TTL)에만 있다. pm2 reload 중 진행 중이던 풀이는 `GET /saju-c/readings/jobs/:id` 가 410 을 돌려주고 클라이언트가 재요청한다(정적 본문은 이미 받은 상태). 캐시 히트면 job 없이 즉시 전체 응답. 단일 인스턴스 전제 — cluster 모드 금지 사유가 하나 더 늘었다
- **사용량 한도는 "풀이 건수"를 센다 — 사주 1건 = LLM 4호출 (25차)** — 전역 일일 예산 `globalPerDay` 는 호출 수가 아니라 `consume()` 횟수. 사주(C) 전체 풀이는 1건에 섹션 4개를 병렬 호출하므로 같은 숫자면 타로의 4배 비용 — 기본값을 타로 5000 / 사주(C) 3000 / 사주(G) 1000 으로 다르게 둔 이유. 초과해도 기능은 정적으로 동작하니 조용히 품질이 떨어진다 → 어드민 `/admin/settings/quotas` 날짜별 사용량(전역 진행률·컷 지점·상위 게스트 키/IP)으로 본다. 게스트 키는 재생성으로 우회 가능함을 수용(IP·전역 층이 보완). 설정 캐시 30초라 어드민 저장은 즉시 무효화되지만 다른 인스턴스는 없다
- **WebView 임베드 주입값은 첫 마운트에 고정 + 실기기 WebGL 미확인 (25차)** — `window.__LP_EMBED__` 는 로드 전 1회 주입이라 앱에서 로그인 상태가 바뀌면 타로·사주 화면을 다시 열어야 반영(화면 안에 로그인 없음). 웹 origin 은 `webUrl`(개발 `:5173` — 웹 dev 서버 필요). `<a download>`·`navigator.share` 가 WebView 에서 안 되어 이미지는 `open`/`share` 메시지로 앱이 처리. **iOS WKWebView 의 WebGL·성능 실기기 확인은 아직**(`624ead4`·PLAN-tarot 진행 기록) — Lite 폴백이 안전망. Android 뒤로가기는 WebView 히스토리 먼저
- **두 사주 구현은 이름이 비슷할수록 헷갈린다 (25차)** — C 의 모듈·DB·feature·purpose·query key 는 접미 없이 `saju`(`modules/saju`, `saju_readings`, `saju-reading`, `OLLAMA_SAJU_MODEL`), 공개 경로·명칭만 `/saju-c`·"사주(C)". G 는 전부 `saju-g`/`SajuG`/`saju_g_*`. `Routes.Saju` 가 C(`/api/v1/saju-c/*`), `Routes.SajuG` 가 G. 기기 저장소도 C `saju-profiles-v1` / G `lp:saju-g-profiles:v1:guest` 로 다르고 서로 읽지 않는다. 같은 프로필/풀이 id 가 양쪽에 있어도 충돌하지 않는다. 문서는 `docs/PLAN-saju.md`(C) / `docs/PLAN-saju-g.md`·`REVIEW-saju-g*.md`·`MIGRATION-saju-g.md`(G)
- **PLAN 문서와 코드가 어긋난 자리 (25차 컴파일에서 확인)** — ① `docs/PLAN-saju.md` "v2 후보" 표에 월운 캘린더·신살 확장·효과음이 남아 있으나 6·7차(`f47e963`·`7358c86`)에서 구현됨(로드맵 표는 ✅, 후보 표만 stale). ② `docs/PLAN-tarot.md` "쿼터·보안" 절은 공유 토큰을 "22자 base64url" 로 적었으나 코드는 정산과 같은 7바이트 = 10자(`tarot.service.ts`, 진행 기록엔 맞게 적힘). 같은 절의 게스트 컷 표기가 결정 표(80%)와 표(90%)로 갈리는데 코드 `USAGE_QUOTA_DEFAULTS` 는 90%. ③ 커밋 `254fb76` 본문의 "Prisma housing 테이블 7종" 은 실제 6종(`housing_complexes`·`housing_trades`·`housing_complex_stats`·`housing_trade_syncs`·`housing_syncs`·`housing_complex_prices`). ④ `docs/data-sources.md` 의 지오코딩 압축본 "104,174건(2.25MB)" 은 그 뒤 재export 로 현재 104,871건 2.3MB. ⑤ PLAN-saju 사전 준비 2 는 산출 경로를 상위 디렉터리 `apps/web/public/saju-c/` 까지만 적었고 실제 산출은 `saju-c/images/`(`7340eff` 는 프롬프트북의 manifest 경로만 고침)
- **지오코딩 캐시 압축본은 이제 집값과 공유 — 로컬에서 갱신하면 `export:life-geocode` 후 커밋 (수정)** — 서버는 `import:life-geocode` 로만 캐시를 얻는다(VWorld 일일 한도라 서버에서 새로 안 돌림). 25차에 집값 단지 지번(+도로명→지번 변형)이 합류해 **104,871건 2.3MB**. deploy 는 gz 변경 감지 시 화장실 `--offline` 재적재 + 집값 좌표 보완(`geocode:housing-missing --offline`). **운영 잔여**: 화장실 지오코딩 2일차 재실행·export·커밋 미완(24차부터), 집값 좌표 미해결 ~8천 단지
- **K-apt 게이트웨이 `12` 는 미신청이 아니라 경로 버전 불일치 (25차, `168b363`)** — 포털 End Point 가 V3→V5, `AptListService3→4` 로 바뀌어 오퍼레이션에 버전 접미가 붙는다(`AptListService4/getTotalAptList4`·`AptBasisInfoServiceV5/...V5`). `30` 이 활용신청 누락. K-apt xlsx 는 1행 안내문·헤더 2행·승강기 유형별 6열·법정동주소 뒤 단지명 꼬리 — 로더가 처리하지만 다른 포털 파일을 같은 로더에 넣으면 0건 매칭. `deploy.sh` 의 `HOUSING_MONTHS`(백필 개월) 와 `.env` 의 `HOUSING_REFRESH_MONTHS`(월 갱신 개월)는 이름이 다르다
- **없는 카드·이미지는 진짜 404 여야 한다 (25차)** — nginx webp 블록이 `try_files $uri =404` 인 이유: SPA 폴백으로 index.html(200) 이 오면 `<img onerror>` 가 안 뜨고 웹이 대체 카드(이름 박스)/한자 placeholder 를 못 그린다. `manifest.json` 이 누락 목록을 들고 있고 `build:*-deck/images --placeholders` 로 임시 카드를 채울 수 있다. dev 는 Vite 가 `public/` 을 그대로 서빙하니 못 본다
- **`pnpm-lock.yaml` 에 typescript 해석 드리프트가 섞였다 (25차, `db1415f`)** — astronomy-engine devDependency 추가 커밋에 typescript `6.0.3→5.7.3` 해석 변경이 같이 들어갔다. lock 을 건드리는 다음 커밋에서 의도 여부 확인
- **앱 iOS 링크 오류 — prebuilt RN 아티팩트가 Release 로 깔린다 (`pod install` 마다 재발)** — `Undefined symbol: facebook::react::…getDebug*/DebugStringConvertible/Sealable/hermes inspector` 가 통째로 뜨면 React 쪽은 Release·우리 코드는 Debug 로 컴파일된 불일치. 앱은 `RCT_USE_PREBUILT_RNCORE` 로 미리 빌드된 바이너리를 쓰는데 교체 스크립트가 "상태 파일이 없으면 Debug" 라고 가정해 실제로 깔린 Release 를 안 바꾼다. 해결: `Pods/React-Core-prebuilt/.last_build_configuration` 에 `Release` 를 적고 `replace-rncore-version.js -c Debug` 로 교체 강제(`nm … | grep -c DebugStringConvertible` 이 0 이 아니어야). 곁다리: CocoaPods 는 `LANG=en_US.UTF-8` 필요, `ENABLE_DEBUG_DYLIB=NO`·`OTHER_LDFLAGS` CLI 덮어쓰기는 더 나빠짐. [docs/mobile-ios-build.md](../../docs/mobile-ios-build.md)(실측 Xcode 26.6 / RN 0.81.5 / New Arch) — [mobile](mobile.md)
- **네이티브 모듈 추가 커밋은 재빌드 — JS 리로드만 하면 화면이 통째로 죽는다** — `expo-document-picker` 사례(`0064ab9`): 최상위 import 가 `Cannot find native module` 로 터져 식단 화면 전체가 빈 화면·복구 불가. 새 네이티브 의존성은 지연 `import()` + 부재 안내로 감싼다. 25차 `react-native-webview`(타로·사주 화면)도 네이티브 모듈이라 dev client 재빌드 대상. 무료 팀 로컬 빌드는 `with-personal-team-entitlements` 가 `aps-environment` 를 빼므로 원격 푸시 테스트 불가(로컬 알림만)
- **`pnpm --filter friendly test` 는 `.env` 의 운영 스냅샷 DB 를 그대로 쓴다 (사고 이력)** — 격리를 안 쓴 테스트 한 블록이 글로벌 머지 결과 전량을 지웠다(`517e465`, LLM 1,352콜 복구). DB 를 건드리는 테스트는 `useIsolatedDatabase()`(`test-utils/temp-db.ts`, 현재 17파일) 또는 25차 `useSchemaDatabase()`(`test-utils/schema-db.ts`, 빈 임시 DB `prisma db push`, 7파일 — 사주 C/G·마이그레이션 테스트) 필수. 식단 사진 서비스는 테스트 시 `tmpdir()` 로 보내고, `probe:meal-e2e`·`seed:meal-samples` 는 운영 DB 를 거부한다(`037a4f2`)
- **data.go.kr 키는 하나지만 활용신청은 데이터셋마다 (수정 — 폴백 체인 폐기)** — `DATA_GO_KR_API_KEY` 하나로 버스·에어코리아·기상청·심평원·실거래·K-apt·건축HUB·식약처를 부르며, 그 데이터셋에 활용신청이 없으면 `30 등록되지 않은 서비스키`(키가 틀린 게 아니라 신청 누락), 경로 버전이 틀리면 `12`. 각 `probe:*` 로 먼저 실측. 기상청 API허브 키는 포털 키와 다른 사이트에서 발급. 쿼터는 데이터셋별 — 에어코리아 개발계정 **일 500건**(캐시 TTL 전제), 실거래·건축HUB 10,000, K-apt 5,000. 옛 `BUS_API_KEY` 등 이름은 무시된다
- **카탈로그가 비면 오류 없이 반쪽이 된다** — 자동완성이 안 뜨고 영양이 안 붙고 추천 후보가 본인 기록으로만 좁아진다(503 도 안 남). 25차 메뉴 탭 칼로리 칩도 같은 성질 — 카탈로그·`MenuLexicon` 이 비면 칩이 조용히 안 뜬다(`probe:menu-coverage` 로 표시율 확인). deploy.sh 가 종수를 점검하지만 배포본이 서버 `data/open/food/` 에 없으면 안내만 하고 넘어간다 → 배포 후 `status:food-catalog` 확인. 외식 어휘는 그 서버의 식당·리뷰에서 나오므로 서버마다 종수가 다른 게 정상. 상태 파싱은 `stat_val`(bash 정규식) — sed `\b` 는 BSD sed 에서 빈 값이 돼 "0 종 → 재적재" 오작동
- **원본 데이터는 리포에 없다 — 새 머신은 `data/open/`(+ `assets-src/`) 부터** — `/data/`·`/assets-src/{tarot,saju}/raw/` 가 gitignore. 적재·프로브가 `data/open/…` 을 기본으로 찾으니 파일이 없으면 "배포본 없음" 으로 끝난다. 어디서 받는지는 docs/data-sources.md 보관표(25차 집값 4행 추가). 평가셋은 재다운로드에 AI Hub 로그인·승인이 필요해 추출본(750장)을 남긴 것 — 원본 16GB zip 은 삭제됨(재추출 코드는 문서에). `--limit` 은 균등 간격 표본(앞에서 자르면 '가~' 클래스만 평가, `5a84b63`). 이미지 원본은 산출물 webp 가 커밋돼 있어 없어도 동작한다(재생성 때만 필요)
- **`ecosystem.config.cjs` 는 리포에 없다 (정정)** — 이 문서가 루트 파일처럼 적어 왔으나 미추적. 운영 서버에서 docs/deploy-friendly.md "pm2 기동" 내용으로 생성한다. nginx 는 반대로 25차부터 리포에 원본이 있다(`ops/nginx/`)
- **사용자 업로드는 DB 백업으로 복구 안 된다** — `data/meal-photos/`(식단 사진)·`data/receipts/`(영수증)는 디스크. DB 에 경로만 있다 → 주간 tar 백업을 따로(docs/deploy-friendly.md). 식단은 기록 삭제 시 unlink + 삭제 outbox, 미연결 사진은 24h 뒤 04:30 GC. 인식 디버그 덤프는 `MEAL_RECOGNITION_DEBUG=1` 일 때만, 운영은 끈 채. 타로·사주는 서버에 이미지를 저장하지 않는다(공유 PNG 는 즉석 렌더 + LRU)
- **위키 동기화 — 여러 머신·여러 세션 (운영 메모)** — 23차(2026-08-23)는 다른 머신, 25차의 `saju-g.md` 는 다른 세션이 직접 썼다. 컴파일 전 pull 을 먼저 하고 `log.md`·`.compile-state.json` 충돌을 본다
- **리뷰 군집화는 Python 런타임 필요 (18차)** — `review-clustering` 의 UMAP/HDBSCAN/c-TF-IDF 는 `scripts/cluster_compute.py`(numpy/sklearn/umap-learn/hdbscan)를 Node 가 spawn. venv/`CLUSTER_PYTHON_BIN` 미설치 시 graceful skip(군집 없음 → 관점집계 폴백). 운영 설치는 `docs/deploy-friendly.md` 참조. 임베딩(bge-m3)은 별개로 **로컬 Ollama `/api/embed`** 필요 — Ollama Cloud 엔 임베딩 모델 없음(`OLLAMA_EMBED_BASE_URL`)
- **enrich/군집은 canonical 멤버 합산 코퍼스 (18차)** — 단일 placeId 가 아니라 canonical 멤버(다소스) 행 전체로 fan-out([canonical-corpus-fanout](../concepts/canonical-corpus-fanout.md)). `corpusSize` 가 재enrich/재군집 게이트(20% 또는 +20건 이상 늘면). 캐시·진행상태 키는 `primaryId` 통일
- **텔레그램 진행 편집 vs 완료 알림 (18차)** — 진행 상황은 같은 메시지 in-place 편집(편집은 푸시 알림 안 울림) + throttle + 직전 동일 텍스트 skip("not modified" 회피). 완료/실패는 **새 메시지**로 보내야 핑이 울린다. 정지 시 in-flight 편집을 await 후 덮어야 "수집 중" 멈춤 경쟁 회피
- **operation-log 보존 정리 — 보고서 있는 run 은 영구 (18차)** — `LogConfig` 보존(기본 30일) 매일 04시 정리. 단 `OperationReport`(LLM 실패 분석) 달린 run·진행 중 run 은 제외. 자동 분석은 `AUTO_ANALYSIS_EXCLUDED_ERROR_CODES`/`trigger='user'` 제외 + 세마포어(동시1+대기열5)로 비용 폭주 차단
- **LLM 계정 게이트는 어댑터 캐시와 독립 수명 (18차)** — purpose 게이트→계정 게이트 2단. 계정 게이트(키=apiKey|baseUrl)가 어댑터 캐시 회전과 분리돼 설정 변경 중 일시 초과 방지. 텔레메트리는 **표시 전용 인메모리** — 서버 재시작 시 리셋(영속 아님). 25차 공개 익명 purpose(tarot/saju/saju-g)가 chat 키를 상속하면 같은 계정 게이트를 나눠 쓴다 — 격리는 purpose 전용 키(own)
- **테이블링 place↔partner 승격 (18차)** — 같은 source 의 얕은(place, JSON-LD) / 풍부(partner) 티어가 일반 canonical 후보 룰의 사각지대 → 저장 시 좌표+이름으로 partner 쪽 자동 흡수(임계 DC 와 동일 0.85/50m)
- **schedule overlap 방지 — 이전 실행 미완료면 tick skip** — `scheduleRegistry` 가 동시 1개 inflight 만 허용. cron tick 시 이전 실행이 안 끝났으면 `schedule_runs status='skipped'` 행만 남기고 건너뛴다. 부팅 시 직전 인스턴스의 `running` 행은 `interrupted` 로 정리(`schedule.bootstrap()`) — 다음 tick 에 자연 재개
- **schedule plugin 은 자체 AiConfigService 생성** — autoload 알파벳순 `'schedule'` < `'summaries'` 라 `app.aiConfig` 가 아직 없다. plugin 로드 순서 의존을 피하려 schedule 이 자체 AiConfig 를 만든다 — `app.aiConfig` 재사용 불가. 25차 `plugins/usage-quota` 는 반대로 기능 라우트·어드민이 같은 인스턴스를 써야 해서 app 전역 decorate
- **택소노미 v3 = `GLOBAL_MERGE_VERSION` 3, full 재머지 필요** — 최상위 축 교체로 기존 머지 행 전부 stale. 어드민 '전체 재실행' / `run-merge --full` 안 돌리면 옛 음식종류 트리 그대로. 카테고리 path 복합어는 가운뎃점 — `/`는 segment 구분자
- **다크 모드 저장소는 플랫폼별 — 웹 `lp:theme` / 앱 `lp:themeMode`** — shared 는 design 토큰만 공유(RN/web storage 직접 import 금지). 앱 수동 hydrate + `useResolvedThemeMode` 가 system 일 때 `useColorScheme` 결합. WebView 임베드는 앱 테마를 브리지로 넘겨 웹이 맞춘다
- **루트에서 `expo run:ios`/`prebuild` 금지 — 오염** — 루트에서 실행하면 잘못된 ios/·android/·app.json 산출. 정상 네이티브 빌드는 `apps/mobile`(LifePickr). 루트 `.gitignore` 가 `/ios /android /app.json` 로 재발 차단
- **OG og:image `.png` prod 404 — nginx `^~` 우선권** — `/share/settlements/<token>/image.png`·`/tarot/s/<token>/image.png`·`/saju-c/s/<token>/image.png` 가 정적 캐싱용 `location ~* \.png$` 정규식에 가로채여 web/dist 에서 못 찾고 404("dev OK / prod 404" 전형). `location ^~ …` prefix 우선권 부여 필수 — 원본 `ops/nginx/` 에 전부 있다
- **Cloudflare 가 잘못된 404 를 엣지 캐시 — Purge 필요** — og:image 가 `.png` 라 Cloudflare 엣지 캐시. 한 번 404 캐시되면 nginx 고쳐도 max-age(관측상 ≈4h) 동안 404. 수정 후 Cloudflare 에서 URL Purge 필수. 카카오/텔레그램도 자체 OG 캐시(며칠) — 갱신은 카카오 OG 캐시 초기화 도구 / 텔레그램 `@WebpageBot`
- **OG index.html 은 프로세스 1회 캐시 — 재배포 후 `pm2 reload friendly` 필수** — friendly 가 빌드된 web `index.html` 을 메모리 1회 캐시(`lib/web-index.ts`, 자산 루트 후보 탐색). 재배포로 자산 해시명이 바뀌어도 reload 안 하면 옛 index 그대로 → OG/SPA 부팅 깨짐
- **lint warn ≠ pass-by-default — 점진 정리 부채** — base 룰의 React Compiler 진단(set-state-in-effect 등)·friendly `prefer-const` 등이 기존 위반 때문에 `warn`. turbo lint 는 green 이지만 warn 누적은 정리 대상. 신규 코드에 새 warn 추가 금지 권장
- **SQLite 다중 NULL unique — `placeIdKey='' sentinel`** — `SettlementDraft.(userId, placeIdKey)` unique 는 SQLite 가 다중 NULL 을 위반으로 안 보는 걸 우회하려고 null placeId 를 빈 문자열 '' 로 변환. 직접 SQL 로 row 만들 땐 `placeIdToKey` helper 필수
- **storage 어댑터 주입 ordering** — `settlementDraftStore`·`guestKeyStore`·`sajuProfileStore` 첫 read/write 전에 `set*Storage(...)` 호출 필수. 안 하면 in-memory fallback 으로 떨어져 페이지 전환 시 draft·게스트 키 소실(게스트 키가 매번 바뀌면 기기 한도가 IP 한도로만 잡힌다)
- **.well-known 404 vs 500 — env 비면 404** — `APP_TEAM_ID`/`ANDROID_SHA256_FINGERPRINTS` 비면 의도적 404. 잘못된 빈 JSON 으로 검증 통과시키면 OS 가 "검증됐는데 매칭 실패" 상태로 빠짐. 셋업은 `apps/mobile/DEEP_LINK_SETUP.md`
- **멀티 영수증 분할 = N 개의 별도 LLM 호출** — 한 imageToken 으로 보이지만 sharp crop 후 vision LLM 을 N 회. 비용 = N × 단일 호출. UI 가 분할 수 노출
- **iOS 뒤로가기 버튼 라벨에 디렉터리명 노출** — expo-router segment 명이 명시 `headerBackTitle` 없을 때 iOS 백 라벨로 샘. 깊은 진입점은 `Stack.Screen options` 에 `title`/`headerBackTitle` 명시(25차 WebView 화면은 웹의 `title` 메시지로 헤더 제목 갱신)
- **`?? null` 클리어 패턴 (회귀 인용)** — `setRoundReceipt(roundId, token ?? null)` 처럼 `undefined` 전달은 partial update 로 해석돼 옛 값 유지. 명시 `?? null` 로 클리어 의도 분명히 — 영수증 제거가 안 먹는 회귀 두 번 발생
- **'수정됨' 배지 기준은 `editedAt`** — `updatedAt` 은 shareToken 발급/회수에도 갱신됨. 별도 컬럼
- **AI provider `purpose='image'` 는 env fallback 없음** — `chat` 만 env backed 가상 row 합성. image 는 반드시 DB row. 25차 tarot/saju/saju-g/meal-* 는 키가 없으면 chat 계정 키 상속(모델만 env 기본값)
- **단골 normalizedKey 정규화는 service 전담** — `ContactService.normalize` 만 통해 upsert
- **stepper 자유 점프는 "완료된 단계만"**
- **"모바일" 단어 — 한국어 본문에서 단독은 웹의 반응형만** — 앱은 항상 "앱"
- **출처별 행 분리 — `(source, sourceId)` unique** — 임계 못 넘으면 silent skip → 머지 큐
- **`placeId` 는 nullable** — DC/캐치테이블 식당에서 정산 시작은 현재 불가
- **패키지 간 순환 의존 금지** — `shared → api-contract`는 OK, 반대는 금지
- **공유 스키마는 반드시 `@repo/api-contract` zod 로**
- **vworld 키 미등록 시 placeholder fallback**
- **공개 list `q` 는 LIKE 기반 — 1k+ 면 FTS5 재고**
- **공개 list bbox 는 메모리 필터**
- **공개 리뷰 `sort=recent` 정렬 — `fetchedAt asc` 회귀 fix** — desc 가 오래된순으로 나오던 버그
- **ncaptcha — 네이버 PC 지도 직접 fetch 차단** — Playwright 가로채기 + stealth + jitter
- **OpenLayers `ol/ol.css` import 필수**
- **첫 관리자 만들기** — `pnpm --filter friendly promote-admin <email>`
- **분석 단계 실행 순서 강제** — 리뷰 분석 → 식당별 그룹핑 → 전역 머지
- **모바일 sticky 함정** — 깨질 때 99%는 (a) wrapping div, (b) overflow:auto 안, (c) z-index 가 페이지 헤더보다 낮음
- **부팅 직후 stale 요약 행 — `errorCode='server_restart'` failed 자동 처리**
- **자동 발견 잡 actor 당 1 개 제한**
- **HANDOFF 문서는 git 에 넣지 말 것**
- **버전 매트릭스** — 웹은 React 19, 앱은 Expo SDK 54(`~54.0.34`) + RN 0.81.5 + React 19.1 (TECH_STACK.md·README 의 "Expo 52 / RN 0.76 / React 18" 은 초기 명세 — 실제 버전은 루트 `package.json` dependencies 가 고정). 25차 웹 3D 는 three 0.185 + R3F 9.7 + drei 10.7 + postprocessing 3.1
- **앱 운영 빌드는 `.env.production` 자동 로드**
- **앱 Expo Web 은 SPA 모드 고정** — `web.output: 'single'`
- **SQLite 락 + Prisma migrate dev** — friendly dev 떠 있으면 `database is locked` 더 자주. 운영은 `migrate deploy` + pm2 fork 단일 인스턴스(cluster 금지)

## Sources [coverage: high — 128 sources]

- [README.md](../../README.md)
- [CLAUDE.md](../../CLAUDE.md) — "용어" 섹션 + iOS 링크 오류 안내 문단 (`4228651`)
- [AGENTS.md](../../AGENTS.md) — 코딩 에이전트 진입 가이드(위키 먼저)
- [TECH_STACK.md](../../TECH_STACK.md)
- [package.json](../../package.json) — 루트 스크립트 + expo/react/react-native 버전 고정 (25차 변경 없음)
- [pnpm-workspace.yaml](../../pnpm-workspace.yaml)
- [turbo.json](../../turbo.json)
- [tsconfig.base.json](../../tsconfig.base.json)
- [.gitignore](../../.gitignore) — `/data/` 공공데이터 원본(`809b7e0`) + `/assets-src/{tarot,saju}/raw/` 이미지 원본(25차) + 루트 /ios /android /app.json
- [deploy.sh](../../deploy.sh) — 케이스 1~8 + `life_map_data`/`food_catalog_data`/`housing_data` 자동 점검 + `stat_val` + K-apt glob 탐지 (`5a84b63`·`dae1cc9`·`4fd6e22`·`254fb76`·`b8c08ed`)
- [ops/nginx/niney_life_pickr_v2_projects](../../ops/nginx/niney_life_pickr_v2_projects) — 운영 nginx 원본: 두 서버 블록, `^~` 프록시 7개, webp 7일 캐시 2개, SPA `try_files $uri /index.html`, `absolute_redirect off` (`35b35fd`·`e40b4c0`, 25차 신규)
- [docs/data-sources.md](../../docs/data-sources.md) — 원본 데이터 운영 가이드: 원칙·보관표(25차 집값 4행·원재료 DB·큐레이션)·집값 보강 적재 순서·fatsecret 실측·평가셋·백업·테스트 격리 경고
- [docs/deploy-friendly.md](../../docs/deploy-friendly.md) — pm2 + nginx + Cloudflare(ninelife.kr) + OG SSR-lite `^~` + 타로·사주 nginx 블록 4개 + SPA 폴백 디렉터리 충돌 절 + 사주 글리프 + 카탈로그 적재 + 업로드 파일 (25차 +67줄)
- [docs/mobile-ios-build.md](../../docs/mobile-ios-build.md) — prebuilt RN Release 링크 오류 해결
- [docs/PLAN-meal.md](../../docs/PLAN-meal.md) — 식단 관리 계획·데이터 소스 표·결정 A~I·진행 기록
- [docs/PLAN-tarot.md](../../docs/PLAN-tarot.md) — 타로 계획: 사용자 결정 1~16·쿼터 4층 표·로드맵 0~4차·v3a 메뉴 타로·v2 앱 임베드·진행 기록(운영 배포 2026-09-05) (25차)
- [docs/tarot-deck-prompts.md](../../docs/tarot-deck-prompts.md) — 78장 + 뒷면 제미나이 프롬프트북, `build:tarot-deck` 사용법·manifest (25차)
- [docs/PLAN-saju.md](../../docs/PLAN-saju.md) — 사주(C) 계획: 결정 1~5·명리 기본값 표·용어·사전 준비·엔진 설계·로드맵 0~7차·진행 기록 (25차)
- [docs/saju-image-prompts.md](../../docs/saju-image-prompts.md) — 일간 10 + 띠 12 프롬프트북, `build:saju-images` (25차)
- [docs/PLAN-saju-g.md](../../docs/PLAN-saju-g.md) — 사주(G) 계획: 제공 경험·계산 기준 v1·Kimi 해석 v4·저장·공유·검증 기록 (25차, 다른 세션)
- [docs/MIGRATION-saju-g.md](../../docs/MIGRATION-saju-g.md) — C/G 식별자·DB·설정 분리 표, 기기 저장소 이전, 적용·검증 절차 (25차, 2026-09-07)
- [docs/REVIEW-saju-g.md](../../docs/REVIEW-saju-g.md) · [REVIEW-saju-g-profiles-pair.md](../../docs/REVIEW-saju-g-profiles-pair.md) · [REVIEW-saju-g-stories.md](../../docs/REVIEW-saju-g-stories.md) — 사주(G) 검토 3건(계산 대조·프로필/궁합·이야기 카드) (25차)
- [docs/menu-calorie-engine.md](../../docs/menu-calorie-engine.md) — 메뉴 칼로리 판정 규칙·골든셋·어휘 편집 (25차)
- [docs/mobile-public-restaurant-ux-v2.md](../../docs/mobile-public-restaurant-ux-v2.md) — BottomSheet `sheet/` 승격 반영
- [apps/friendly/.env.example](../../apps/friendly/.env.example) — `DATA_GO_KR_API_KEY` 하나 + 데이터셋별 활용신청 주석 · `HOUSING_REFRESH_{CRON,MONTHS}` · `OLLAMA_{TAROT,SAJU,SAJU_G,MENU_MATCH}_MODEL` 프로브 근거 주석 · 운영 도메인/OG 키 (25차 수정)
- [apps/friendly/src/config/env.ts](../../apps/friendly/src/config/env.ts) — env 검증 스키마: `DATA_GO_KR_API_KEY`(`3d9dfed`) · `KMA_APIHUB_KEY` · `HOUSING_*` · purpose 모델 8종 · `MEAL_*` · APP_TEAM_ID / WEB_INDEX_PATH / OG_IMAGE_PATH
- [apps/friendly/package.json](../../apps/friendly/package.json) — 스크립트 92개(25차 +25: build/measure 접두, housing load/status, probe 9) · croner / satori / @resvg/resvg-js / lru-cache · astronomy-engine(dev)
- [apps/friendly/scripts/](../../apps/friendly/scripts/) — 78 파일: `build-tarot-deck.ts` · `build-saju-{tables,images,glyphs}.ts` · `probe-{tarot,saju,saju-g}-reading.ts` · `probe-saju-g-pair.ts` · `load-housing-{complexes,trades,prices,kapt,buildings}.ts` · `housing-status.ts` · `geocode-housing-missing.ts` · `rebuild-housing-derived.ts` · `probe-rtms-api.ts` · `measure-menu-{nutrition,golden,decompose}.ts` · `probe-menu-{coverage,resolve,decompose}.ts` · `probe-food-web-estimate.ts` · `fetch-mfds-nutrition.ts` (25차 신규)
- [apps/friendly/scripts/life-map-status.ts](../../apps/friendly/scripts/life-map-status.ts) + [food-catalog-status.ts](../../apps/friendly/scripts/food-catalog-status.ts) — deploy.sh 가 파싱하는 한 줄 상태
- [apps/friendly/scripts/load-food-catalog.ts](../../apps/friendly/scripts/load-food-catalog.ts) — `DEFAULT_FILES` data/open/food 기본 경로 (+`--source=raw|curated`, 25차)
- [apps/friendly/scripts/load-life-cctv.ts](../../apps/friendly/scripts/load-life-cctv.ts) · [load-life-toilets.ts](../../apps/friendly/scripts/load-life-toilets.ts) · [load-life-hospitals.ts](../../apps/friendly/scripts/load-life-hospitals.ts) — 적재기(`--offline`·`--max-calls`)
- [apps/friendly/scripts/export-life-geocode.ts](../../apps/friendly/scripts/export-life-geocode.ts) · [import-life-geocode.ts](../../apps/friendly/scripts/import-life-geocode.ts) + [modules/life-map/data/life-geocode-cache.json.gz](../../apps/friendly/src/modules/life-map/data/) — 가공 캐시 압축본(25차 집값 합류 104,871건 2.3MB)
- [apps/friendly/golden/](../../apps/friendly/golden/) — `menu-nutrition.golden.json` · `menu-decompose.golden.json` 골든셋 (25차)
- [apps/friendly/assets/saju-glyphs/](../../apps/friendly/assets/saju-glyphs/) — 천간·지지·오행 27자 × 3색 PNG 81장 (25차, `build:saju-glyphs` 산출)
- [apps/friendly/src/test-utils/temp-db.ts](../../apps/friendly/src/test-utils/temp-db.ts) — `useIsolatedDatabase()` (17파일)
- [apps/friendly/src/test-utils/schema-db.ts](../../apps/friendly/src/test-utils/schema-db.ts) — `useSchemaDatabase()` 빈 임시 DB (7파일, 25차 — 사주(G) 세션)
- [apps/friendly/src/modules/analytics/analytics.test.ts](../../apps/friendly/src/modules/analytics/analytics.test.ts) — 실 DB 갈아엎던 블록 격리 (`517e465`)
- [apps/friendly/src/modules/tarot/](../../apps/friendly/src/modules/tarot/) — service(LLM·정적·LRU 캐시·한도·회원 저장·공유 토큰)·prompts·static·route·`tarot-preview.ts`(OG)·`tarot-share-card.ts`(satori) (25차 신규)
- [apps/friendly/src/modules/saju/](../../apps/friendly/src/modules/saju/) — 사주(C) service·`saju-jobs.ts`(병렬 job 레지스트리)·prompts·static·records(프로필·기록)·route·preview·share-card (25차 신규)
- [apps/friendly/src/modules/saju-g/](../../apps/friendly/src/modules/saju-g/) — 사주(G) 엔진·service·route·프리뷰 + `__fixtures__` KASI (25차 신규, 다른 세션 — 세부는 saju-g 토픽)
- [apps/friendly/src/modules/usage-quota/](../../apps/friendly/src/modules/usage-quota/) + [plugins/usage-quota.ts](../../apps/friendly/src/plugins/usage-quota.ts) — `USAGE_QUOTA_DEFAULTS`·`consume()`·어드민 route / 전역 singleton + 30초 캐시 + 04:40 GC (25차 신규)
- [apps/friendly/src/plugins/jwt.ts](../../apps/friendly/src/plugins/jwt.ts) — `resolveOptionalUser` 옵셔널 인증 (25차 수정)
- [apps/friendly/src/plugins/rate-limit.ts](../../apps/friendly/src/plugins/rate-limit.ts) — `RATE` 프리셋(tarotShare 10/분·housingRead 240·housingSearch 120) + `clientKey`(cf-connecting-ip 우선) (25차 수정)
- [apps/friendly/src/modules/housing/](../../apps/friendly/src/modules/housing/) — rtms/kapt/bldg-hub/datago-json 어댑터, 단지·거래·공시가격·K-apt·건축물 마스터, 파생·지오코딩·ingest·refresh(croner)·route (25차 신규)
- [apps/friendly/src/modules/food/engine/](../../apps/friendly/src/modules/food/engine/) — 메뉴 칼로리 판정 엔진(parse·resolve·lexicon·lexicon-db·catalog-index) (25차 신규)
- [apps/friendly/src/lib/web-index.ts](../../apps/friendly/src/lib/web-index.ts) · [share-fonts.ts](../../apps/friendly/src/lib/share-fonts.ts) — OG head 주입·satori 폰트 공용 헬퍼 (25차 신규)
- [apps/friendly/src/app.ts](../../apps/friendly/src/app.ts) — `registerTarotPreview`·`registerSajuPreview`·`registerSajuGPreview` 등록 (25차 수정)
- [apps/friendly/src/modules/air-quality/](../../apps/friendly/src/modules/air-quality/) · [weather/](../../apps/friendly/src/modules/weather/) · [life-map/](../../apps/friendly/src/modules/life-map/) — 공개 생활정보 모듈 (25차 env 키 통일 수정)
- [apps/friendly/src/modules/food/](../../apps/friendly/src/modules/food/) · [meal/](../../apps/friendly/src/modules/meal/) · [meal-recognition/](../../apps/friendly/src/modules/meal-recognition/) · [meal-recommendation/](../../apps/friendly/src/modules/meal-recommendation/) + [plugins/food-import.ts](../../apps/friendly/src/plugins/food-import.ts) · [plugins/meal.ts](../../apps/friendly/src/plugins/meal.ts) — 식단 도메인 (food 는 25차 칼로리 엔진·어휘·web-estimate 추가)
- [apps/friendly/src/modules/media/](../../apps/friendly/src/modules/media/) — 썸네일 프록시 허용 호스트 배민 추가·리사이즈 (`0997a69`, 25차 수정) + panorama-cache
- [apps/friendly/src/lib/csv.ts](../../apps/friendly/src/lib/csv.ts) · [xlsx.ts](../../apps/friendly/src/lib/xlsx.ts) — 배포 파일 리더
- [apps/friendly/prisma/schema.prisma](../../apps/friendly/prisma/schema.prisma) — 93 모델 (25차 +18: Housing 6·MenuLexicon/MenuLlmMatch/MenuLlmDecomposition/FoodWebEstimate·TarotReading·UsageQuotaSetting/Counter·SajuProfile/SajuReading·SajuGProfile/Reading/Share) + 정산 모델(`SettlementRound` JSON 컬럼·`SettlementDraft`)
- [apps/friendly/prisma/migrations/](../../apps/friendly/prisma/migrations/) — 총 80. 25차 11개: `20260830094116_add_housing` · `20260830112334_add_housing_enrich` · `20260902120000_add_food_kcal_per_100g` · `20260902150000_add_menu_llm_match` · `20260902170000_add_food_web_estimate` · `20260903090000_add_menu_lexicon` · `20260903100000_add_menu_llm_decomposition` · `20260903120000_add_tarot_reading_and_usage_quota` · `20260903130000_add_tarot_share_question` · `20260906110442_add_saju_profile_and_reading` · `20260906170000_add_saju_g`
- [apps/friendly/prisma/migrations/20260525100000_add_settlement_rounds/](../../apps/friendly/prisma/migrations/) — 차수 모델
- [apps/friendly/prisma/migrations/20260525110000_add_settlement_round_discount/](../../apps/friendly/prisma/migrations/) — 차수 할인
- [apps/friendly/prisma/migrations/20260525220309_add_settlement_round_category_adjustments/](../../apps/friendly/prisma/migrations/) — 분담 다듬기
- [apps/friendly/prisma/migrations/20260525235559_add_settlement_drafts/](../../apps/friendly/prisma/migrations/) — 서버 draft
- [packages/api-contract/src/routes.ts](../../packages/api-contract/src/routes.ts) — `Routes.Housing/Tarot/Saju(/saju-c)/SajuG/UsageQuota` + `publicMenuNutrition`·`adminMenuLexicon` (25차) / AirQuality/Weather/LifeMap/Food/Meal / Settlement(PUT)·SettlementDraft·WellKnown·Ai.modelsPreview
- [packages/api-contract/src/schemas/](../../packages/api-contract/src/schemas/) — 43개 (25차 +7: tarot/saju/saju-g/housing/usage-quota/menu-lexicon/menu-nutrition + ai purpose 8종)
- [packages/api-contract/src/settlement.calculator.ts](../../packages/api-contract/src/settlement.calculator.ts) — `calculateMultiRoundShares` + 100/1000 round + leftover
- [packages/api-contract/src/settlement.drink-kinds.ts](../../packages/api-contract/src/settlement.drink-kinds.ts) — 술·음료 종류 단일 사전 (18차)
- [packages/shared/src/embedBridge.ts](../../packages/shared/src/embedBridge.ts) — 앱↔웹 WebView 브리지 계약(주입·메시지, 테스트 3) (25차 신규)
- [packages/shared/src/stores/](../../packages/shared/src/stores/) — `guestKeyStore`(`guest-key-v1`) · `tarotHistoryStore` · `sajuProfileStore`(`saju-profiles-v1`) · `sajuGHistoryStore`/`sajuGProfileStore`/`sajuGStorageMigration` · `settlementDraftStore`(`setSettlementDraftStorage`) · `airLocationStore` · `mealDraftStore` (25차 +6)
- [packages/shared/src/](../../packages/shared/src/) — api 43 / hooks 47 (25차 +tarot·saju·saju-g·housing·usage-quota api/hooks, `useSajuJob` long-poll) + air-quality·weather·life-map·food·meal
- [packages/shared/src/hooks/useSchedule.ts](../../packages/shared/src/hooks/useSchedule.ts) — schedule API/훅
- [packages/utils/src/](../../packages/utils/src/) — 49 파일 (25차 +tarot·tarotCards·tarotFlow·tarotMenu / saju·sajuCalendar·sajuAstroTable(생성물)·sajuText·sajuDaily·sajuMatch·sajuDatePick·sajuFood·sajuFlow·sajuImages·sajuInsights·sajuDayPillar / saju-g·saju-g-stories / housing·housingMarker·thumbnail, aiModel purpose 확장)
- [apps/web/src/App.tsx](../../apps/web/src/App.tsx) — `/housing`·`/tarot(/s/:token)`·`/saju-c(/s/:token)`·`/saju-g(/pair|/s/:token)`·`/me/{tarot,saju-c,saju-g(/profiles)}` lazy 라우트 (25차 수정)
- [apps/web/src/lib/embed.ts](../../apps/web/src/lib/embed.ts) — `?embed=1` → sessionStorage `lp:embed` + 브리지 감지 (25차 신규)
- [apps/web/src/components/tarot/](../../apps/web/src/components/tarot/) · [saju/](../../apps/web/src/components/saju/) · [saju-g/](../../apps/web/src/components/saju-g/) · [housing/](../../apps/web/src/components/housing/) — 11·11·12·6 파일: `stage/`(R3F)·`*Lite`·`*ReadingView`·`*ShareSheet`·`TarotMenuBox`·`sajuSound.ts`(`saju-sound-v1`) (25차 신규)
- [apps/web/src/routes/TarotPage.tsx](../../apps/web/src/routes/TarotPage.tsx) · [TarotSharedPage.tsx](../../apps/web/src/routes/TarotSharedPage.tsx) · [routes/tarot/](../../apps/web/src/routes/tarot/) · [SajuPage.tsx](../../apps/web/src/routes/SajuPage.tsx) · [SajuSharedPage.tsx](../../apps/web/src/routes/SajuSharedPage.tsx) · [routes/saju/](../../apps/web/src/routes/saju/) · [SajuGPage.tsx](../../apps/web/src/routes/SajuGPage.tsx) · [HousingPage.tsx](../../apps/web/src/routes/HousingPage.tsx) · [routes/admin/AdminQuotasPage.tsx](../../apps/web/src/routes/admin/AdminQuotasPage.tsx) — 25차 라우트 페이지
- [apps/web/src/stores/housingPrefsStore.ts](../../apps/web/src/stores/housingPrefsStore.ts) — `lp:housing-prefs` (25차)
- [apps/web/public/tarot/cards/](../../apps/web/public/tarot/cards/) — webp 158장(79 × 512/1024) + manifest.json (25차 산출물)
- [apps/web/public/saju-c/images/](../../apps/web/public/saju-c/images/) — webp 44장(22 × 512/1024) + manifest.json (25차 산출물)
- [apps/web/src/components/PublicSidebar.tsx](../../apps/web/src/components/PublicSidebar.tsx) — NAV 10개 순서 + 하단 계정·테마 섹션 (`69ed65f`·`a062e7d`, 25차 타로·사주(C)·사주(G)·집값 추가)
- [apps/web/src/components/PublicTopBar.tsx](../../apps/web/src/components/PublicTopBar.tsx) + [AccountMenu.tsx](../../apps/web/src/components/AccountMenu.tsx) + [PublicLayout.tsx](../../apps/web/src/components/PublicLayout.tsx) + [weather/MyLocationChip.tsx](../../apps/web/src/components/weather/MyLocationChip.tsx) — 폭 예산·계정 메뉴("내 타로 기록")·임베드 크롬 생략·통합 알약
- [apps/web/src/components/sheet/BottomSheet.tsx](../../apps/web/src/components/sheet/BottomSheet.tsx) · [useMapSheets.ts](../../apps/web/src/components/sheet/useMapSheets.ts) · [lib/useMediaQuery.ts](../../apps/web/src/lib/useMediaQuery.ts) — 시트 인프라 (`e84e4b9`, 집값도 사용)
- [apps/web/src/components/life-map/LifeGoToBox.tsx](../../apps/web/src/components/life-map/LifeGoToBox.tsx) — 지역 이동 검색 + `extraSections`(집값 단지 검색) (25차 수정)
- [apps/web/src/routes/AirQualityPage.tsx](../../apps/web/src/routes/AirQualityPage.tsx) · [WeatherPage.tsx](../../apps/web/src/routes/WeatherPage.tsx) · [LifeMapPage.tsx](../../apps/web/src/routes/LifeMapPage.tsx) · [routes/meal/](../../apps/web/src/routes/meal/) · [routes/admin/AdminFoodPage.tsx](../../apps/web/src/routes/admin/AdminFoodPage.tsx) · [AdminRoutes.tsx](../../apps/web/src/routes/admin/AdminRoutes.tsx) — 생활정보·식단·어드민(`settings/quotas` 탭 등록, 25차)
- [apps/web/src/stores/lifeMapPrefsStore.ts](../../apps/web/src/stores/lifeMapPrefsStore.ts) · [lifeMapRecentStore.ts](../../apps/web/src/stores/lifeMapRecentStore.ts) — `lp:life-map-*` (집값과 공유)
- [apps/web/vite.config.ts](../../apps/web/vite.config.ts) — Rolldown codeSplitting.groups(+three) + `/share/settlements`·`/tarot/s/*/image.png`·`/saju-c/s/*/image.png` proxy + `server.host: true` (25차 수정)
- [apps/mobile/package.json](../../apps/mobile/package.json) — `expo-document-picker` · `react-native-webview` (네이티브 모듈)
- [apps/mobile/metro.config.js](../../apps/mobile/metro.config.js) — SDK 54 기본 모노레포 탐색 회귀 (`5cb63a3`)
- [apps/mobile/plugins/with-personal-team-entitlements.js](../../apps/mobile/plugins/with-personal-team-entitlements.js) — aps-environment 제거 (`b733628`)
- [apps/mobile/app/tarot/index.tsx](../../apps/mobile/app/tarot/index.tsx) · [saju-c/index.tsx](../../apps/mobile/app/saju-c/index.tsx) — WebView 임베드 화면 (25차 신규)
- [apps/mobile/app/](../../apps/mobile/app/) — `(tabs)/home.tsx`(카드 4장)·`air/`·`weather/`·`life-map/`·`meal/{index,new,[id]}`·`(tabs)/transit.tsx`·`s/[token].tsx`
- [apps/mobile/src/components/home/TarotEntryCard.tsx](../../apps/mobile/src/components/home/TarotEntryCard.tsx) · [SajuEntryCard.tsx](../../apps/mobile/src/components/home/SajuEntryCard.tsx) · [MyLocationCard.tsx](../../apps/mobile/src/components/home/MyLocationCard.tsx) · [TodayMealCard.tsx](../../apps/mobile/src/components/home/TodayMealCard.tsx) — 홈 진입 카드 (타로·사주 25차)
- [apps/mobile/src/components/meal/MealDataManagementCard.tsx](../../apps/mobile/src/components/meal/MealDataManagementCard.tsx) — 네이티브 모듈 지연 로드 (`0064ab9`)
- [apps/mobile/src/lib/api-setup.ts](../../apps/mobile/src/lib/api-setup.ts) — Expo Web LAN IP 자동 매칭 + `webUrl` + `setSettlementDraftStorage`/`setGuestKeyStorage`/`setSajuProfileStorage` 주입 (25차 수정)
- [apps/mobile/src/lib/](../../apps/mobile/src/lib/) — lifeMap{Prefs,Recent}Store · mealPhotoCache · mealReminders · mealDraftPhotos · queryClient · thumbUrl(112)
- [apps/mobile/app.config.ts](../../apps/mobile/app.config.ts) — associatedDomains + intentFilters autoVerify
- [apps/mobile/DEEP_LINK_SETUP.md](../../apps/mobile/DEEP_LINK_SETUP.md) — Universal/App Link 운영 셋업
- [apps/mobile/docs/production-build.md](../../apps/mobile/docs/production-build.md) — 앱 운영 빌드 가이드
- [niney-life-pickr-v2-wiki/log.md](../log.md) — 23차(2026-08-23, 다른 머신) food/meal 신설 기록 · 25차 saju-g(다른 세션)
- [packages/config/eslint/base.js](../../packages/config/eslint/base.js) — js + tseslint recommended + consistent-type-imports + no-undef off
- [apps/web/eslint.config.mjs](../../apps/web/eslint.config.mjs) — @repo/config/eslint/react 확장
- [apps/friendly/eslint.config.mjs](../../apps/friendly/eslint.config.mjs) — @repo/config/eslint/node 확장
- [apps/mobile/eslint.config.mjs](../../apps/mobile/eslint.config.mjs) — @repo/config/eslint/react (React Compiler 진단 룰)
- [packages/api-contract/eslint.config.mjs](../../packages/api-contract/eslint.config.mjs) — @repo/config/eslint/base 직결
- [apps/friendly/src/modules/settlement/share-preview.ts](../../apps/friendly/src/modules/settlement/share-preview.ts) — 공개 OG SSR-lite (index.html `<head>` 주입)
- [apps/friendly/src/modules/settlement/settlement-card.ts](../../apps/friendly/src/modules/settlement/settlement-card.ts) — 정산표 PNG (satori+resvg + IBMPlexSansKR)
- [apps/friendly/src/plugins/schedule.ts](../../apps/friendly/src/plugins/schedule.ts) — ScheduleService 전역 singleton decorate + 자체 AiConfig
- [apps/friendly/src/modules/schedule/schedule-registry.ts](../../apps/friendly/src/modules/schedule/schedule-registry.ts) — croner cron 타이머 + inflight 동시 1개 모듈 singleton (25차 usage-quota GC·housing 갱신도 사용)
- [apps/friendly/src/modules/schedule/schedule.service.ts](../../apps/friendly/src/modules/schedule/schedule.service.ts) — bootstrap(stale→interrupted) + 정규화→머지 run
- [apps/friendly/src/modules/schedule/schedule.route.ts](../../apps/friendly/src/modules/schedule/schedule.route.ts) — 설정 CRUD / 수동 실행 / 이력
- [apps/friendly/src/server.ts](../../apps/friendly/src/server.ts) — schedule.bootstrap + SIGTERM stopAllCrons/abortInflight/forceCloseConnections
- [packages/api-contract/src/schemas/schedule.ts](../../packages/api-contract/src/schemas/schedule.ts) — schedule 스키마/라우트
- [apps/friendly/src/modules/analytics/global-merge.prompts.ts](../../apps/friendly/src/modules/analytics/global-merge.prompts.ts) — 택소노미 v3 카테고리 path 규칙 + few-shot, GLOBAL_MERGE_VERSION 3
- [apps/mobile/src/lib/themeStore.ts](../../apps/mobile/src/lib/themeStore.ts) — 앱 테마 3-way AsyncStorage 'lp:themeMode'
- [apps/mobile/src/hooks/useResolvedThemeMode.ts](../../apps/mobile/src/hooks/useResolvedThemeMode.ts) — useColorScheme 결합
- [apps/web/src/components/restaurant/MapLayerControl.tsx](../../apps/web/src/components/restaurant/MapLayerControl.tsx) — vworld 일반/다크/위성 레이어 토글
- [apps/friendly/src/plugins/cors.ts](../../apps/friendly/src/plugins/cors.ts) — dev 전면 origin 반사 허용
- [apps/friendly/src/modules/well-known/well-known.route.ts](../../apps/friendly/src/modules/well-known/well-known.route.ts) — AASA + assetlinks.json 동적 응답
- [apps/friendly/src/modules/settlement/](../../apps/friendly/src/modules/settlement/) — N차 세션 + draft + 풀 리플레이스 PUT + OG/카드 렌더
- [apps/friendly/src/modules/settlement-extraction/](../../apps/friendly/src/modules/settlement-extraction/) — 멀티 영수증 분할 sharp crop
- [apps/friendly/src/modules/ai/](../../apps/friendly/src/modules/ai/) — 모델 preview 라우트 + concurrency-gate / llm-telemetry / adapter-cache (18차) + purpose 8종 (25차)
- [packages/shared/src/stores/settlementDraftStore.ts](../../packages/shared/src/stores/settlementDraftStore.ts) — `setSettlementDraftStorage` 어댑터 주입
- [apps/web/src/routes/settlement/](../../apps/web/src/routes/settlement/) — Step2Rounds / RoundCategoryAdjuster / RoundDiscountEditor / MultiReceiptSplitDialog / SettlementBreakdownTable
- [docs/menu-hierarchy.md](../../docs/menu-hierarchy.md)
- [docs/mobile-public-restaurant-ux.md](../../docs/mobile-public-restaurant-ux.md)
- [apps/friendly/src/modules/review-search/](../../apps/friendly/src/modules/review-search/) — RAG enrich/회수/리랭크/생성/검증 (18차)
- [apps/friendly/research/](../../apps/friendly/research/) — `review-search/`·`review-clustering/` probe-* 실측 검증 + `saju-g/` (25차)
- [apps/friendly/src/modules/review-clustering/](../../apps/friendly/src/modules/review-clustering/) + [scripts/cluster_compute.py](../../apps/friendly/scripts/cluster_compute.py) — UMAP→HDBSCAN→c-TF-IDF Python 사이드카 (18차)
- [apps/friendly/src/modules/random-crawl/](../../apps/friendly/src/modules/random-crawl/) — cron 지역 랜덤 발굴 + 텔레그램 후보 선택 (18차)
- [apps/friendly/src/modules/telegram/telegram.service.ts](../../apps/friendly/src/modules/telegram/telegram.service.ts) + [settings/telegram.route.ts](../../apps/friendly/src/modules/settings/telegram.route.ts) — 봇 long-polling + 설정 (18차)
- [apps/friendly/src/modules/logs/](../../apps/friendly/src/modules/logs/) — operation-log + LLM 실패 분석 (18차)
- [apps/friendly/src/modules/crawl/adapters/tabling-*.http.adapter.ts](../../apps/friendly/src/modules/crawl/adapters/) — 테이블링 4어댑터 (18차)
- [apps/friendly/src/modules/restaurant/restaurant-preview.ts](../../apps/friendly/src/modules/restaurant/restaurant-preview.ts) + [region-derive.ts](../../apps/friendly/src/modules/restaurant/region-derive.ts) + [canonical-members.ts](../../apps/friendly/src/modules/restaurant/canonical-members.ts) — 맛집 SSR-lite SEO / 지역 통계 / canonical 멤버 (18차) + 공개 `menu-nutrition` 라우트 (25차)
- [apps/web/src/components/admin/RegionStatsMap.tsx](../../apps/web/src/components/admin/RegionStatsMap.tsx) + [public/sigungu-geo.json](../../apps/web/public/sigungu-geo.json) — 지역 통계 choropleth (18차)
- 토픽 — [tarot](tarot.md), [saju-c](saju-c.md), [saju-g](saju-g.md), [housing](housing.md), [usage-quota](usage-quota.md) (25차 신규 5) · [schedule](schedule.md), [settlement](settlement.md), [auto-discover](auto-discover.md), [friendly](friendly.md), [web](web.md), [api-contract](api-contract.md), [analytics](analytics.md), [menu-grouping](menu-grouping.md), [ai](ai.md), [map](map.md), [crawl](crawl.md), [canonical](canonical.md), [shared](shared.md), [mobile](mobile.md), [config](config.md), [utils](utils.md), [review-search](review-search.md), [review-clustering](review-clustering.md), [random-crawl](random-crawl.md), [telegram](telegram.md), [logs](logs.md), [bus](bus.md), [subway](subway.md), [transit](transit.md), [vote](vote.md), [air-quality](air-quality.md), [weather](weather.md), [life-map](life-map.md), [food](food.md), [meal](meal.md)
- 컨셉 — [anonymous-usage-quota](../concepts/anonymous-usage-quota.md), [embedded-webview-bridge](../concepts/embedded-webview-bridge.md), [webgl-stage-lite-fallback](../concepts/webgl-stage-lite-fallback.md), [golden-set-precision-gate](../concepts/golden-set-precision-gate.md), [static-first-llm-enrichment](../concepts/static-first-llm-enrichment.md) (25차 신규 5) · [open-data-master-load](../concepts/open-data-master-load.md), [db-config-env-fallback](../concepts/db-config-env-fallback.md), [operation-log-instrumentation](../concepts/operation-log-instrumentation.md), [canonical-corpus-fanout](../concepts/canonical-corpus-fanout.md), [cross-tab-async-job-toast](../concepts/cross-tab-async-job-toast.md), [ssr-lite-head-injection](../concepts/ssr-lite-head-injection.md), [external-api-proxy-fixture](../concepts/external-api-proxy-fixture.md), [quota-proportional-loading](../concepts/quota-proportional-loading.md), [guest-server-hybrid](../concepts/guest-server-hybrid.md), [platform-ui-split](../concepts/platform-ui-split.md), [versioned-llm-prompts](../concepts/versioned-llm-prompts.md), [in-memory-singleton-gates](../concepts/in-memory-singleton-gates.md)
