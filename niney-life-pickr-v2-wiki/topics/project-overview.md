---
topic: project-overview
last_compiled: 2026-06-25
sources_count: 52
status: active
aliases: [monorepo, life-pickr, niney, root, turbo, pnpm-workspace, settlement, 정산, settlement-domain, share-token, public-share-read, ai-purpose, vision-llm, receipt-extraction, contacts-page, settlement-stepper, edited-badge, admin-discover, admin-auto-discover, panel-side-toggle, batch-crawl, naver-search-results, panelPrefsStore, captcha-aware-capture, mobile-ux, body-scroll, sticky-containing-block, terminology, web-mobile-app, expo-web, diningcode, catchtable, tabling, 테이블링, canonical-restaurant, multi-source, four-source, auto-dc-merge, place-partner-promotion, sse-heartbeat, stale-summary-cleanup, crawl-job-log, operation-log, operation-run, log-analysis, log-retention, summary-queued-cancelled, summary-resume, app-level-singleton-plugin, mobile-native-tabs, dev-client, webview-vworld, location-first-entry, public-reviews-pagination, naver-stealth, db-path-unified, mobile-production-build, settlement-rounds, settlement-group-split, drink-kinds, glasses-split, settlement-draft-auto-save, universal-links-iOS, app-links-android, well-known-AASA, well-known-assetlinks, RFC1918-dev-cors, dev-cors-reflect-all, cors-preflight-fix, expo-web-lan-ip, multi-receipt-split, roundUnit-100-1000, refinement-leftover, ai-models-preview, settlement-PUT-full-replace, items-mutable-after-save, tailwind-v4-dark-fix, deep-link-fallback, share-settlements-deep, settlement-mobile-implementation, attendees-100, items-200, EXTRACTION_VERSION, headerBackTitle-fix, sticky-breakdown-z-30, tab-bar-inset, useTabBarHeight, awesome-gallery, lightbox-portal, home-ranking-link, public-reviews-sort-fix, share-og-ssr, ssr-lite-head-injection, restaurant-share-r, restaurant-seo, sitemap, json-ld, og-image-png, settlement-card-png, share-preview, restaurant-preview, panorama-cache, eslint-infra, turbo-lint, deploy-sh, ninelife-kr, nginx-caret-tilde, cloudflare-purge, vite-codesplitting, route-lazy, react-memo-hotpath, ibmplexsanskr, schedule, schedule-config, schedule-run, croner, normalize-merge-cron, in-process-scheduler, random-crawl, 맛집-자동-발굴, telegram-bot, telegram-discover, telegram-stats, telegram-search, force-reply, review-search, rag, 리뷰-문맥검색, enrich, hybrid-retrieval, review-clustering, 리뷰-군집화, umap, hdbscan, python-sidecar, canonical-corpus, llm-telemetry, concurrency-gate, account-gate, db-config-env-fallback, region-stats, choropleth, sigungu-geo, smart-pick, taxonomy-v3, ingredient-menu-group, GLOBAL_MERGE_VERSION-3, dark-mode, theme-mode, lp-themeMode, vworld-midnight, satellite-layer, android-custom-tabbar, splash-logo-fix, expo-prebuild-cleanup, soft-tonal, menu-thumbnail-lightbox, card-click-map, double-click-zoom, category-tree-shared, categoryPath-recovery, ollama-grammar-array]
---

# project-overview — 모노레포 개요

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

## Purpose [coverage: high — 5 sources]

선택이 고민될 때 대신 골라주는 서비스다. 핵심 도메인은 세 축으로 갈린다:

- **선택 도우미(Pick)** — 사용자가 선택지(`options`)를 등록해 두면, API가 무작위 결과를 골라 `PickResult`로 기록한다. 식당이 등록되어 있으면 분석 점수(만족도/긍정 비율)를 가중치로 쓰는 `smart-pick` 가 활성된다.
- **맛집 분석** — 어드민이 다양한 출처에서 식당을 크롤링하고 리뷰를 LLM으로 분석해 메뉴 통계 트리까지 빌드한다 ([crawl](crawl.md), [ai](ai.md), [menu-grouping](menu-grouping.md), [analytics](analytics.md)). 출처는 3종 — **네이버 플레이스 / 다이닝코드 / 캐치테이블**. 어드민의 진입 경로는 네 갈래 — 단건 placeId 입력 (`/admin/restaurants`), 키워드 검색→다중 선택 일괄 등록 (`/admin/discover`), 다이닝코드 일괄 저장 (`/admin/diningcode`), **AI 자동 발견** (`/admin/auto-discover`). 결과물은 공개 페이지에서 비로그인 사용자가 그대로 본다.
- **정산하기 — N차 모델** — 식당 상세에서 진입하는 사용자 기능. 한 자리(session) 안에 1..10 차(round) — 차수마다 자기 식당 / 항목 / 출석한 attendees subset / source(MANUAL/RECEIPT) / 할인 / 다듬기 조정을 들고 있다. 마스터 참여자는 session 레벨, 차수별 출석/exclude override 만 round 레벨. 영수증 사진을 vision LLM 으로 4 카테고리(ALCOHOL/NON_ALCOHOL/SIDE/UNCATEGORIZED) 메뉴·금액 추출(차수당 1장 또는 멀티 분할로 1장→N슬라이스) → wizard(참여자/차수/항목 편집/결과) → 저장 → 공유 토큰(`/share/settlements/:token`) 비인증 read. **공유 링크는 SNS 미리보기(OG)까지 — 정산표 PNG 가 카카오톡/슬랙 언펌에 그대로 뜬다.** 단골 참여자는 자동 적립(`SettlementContact`) 되어 다음 정산에서 자동완성으로 끌어쓴다. **앱(iOS/Android) 도 풀구현** — 웹과 동일 동선 + 네이티브 bottom sheet. 자세한 건 [settlement](settlement.md).

세 개의 클라이언트가 동일 백엔드를 공유한다:
- **friendly** — Fastify + Prisma + SQLite 백엔드 ([friendly](friendly.md))
- **웹** (`apps/web`) — Vite + React 19 SPA. 공개 영역(`/`, `/restaurants`, `/restaurants/:placeId`, `/share/settlements/:token`) + 인증 사용자 영역(`/me/*`, `/restaurants/:placeId/settle/*`) + 어드민 콘솔(`/admin/*`) 세 묶음이 한 SPA 안에 공존
- **앱** (`apps/mobile`) — Expo SDK 54 + React Native 0.81 + React 19. 맛집/정산/단골/공유 라우트 풀구현. 어드민 UI 는 의도적 미포함

공개 영역은 비로그인 호출 가능 — 데이터 자체는 어드민이 본 것과 차이가 없고 (운영 메타만 제거), 사용자 정책상 그대로 노출한다. 공유 정산 토큰 경로(`/share/settlements/:token`) 도 비인증으로 열려 있으나 추측 불가능한 32바이트 base64url 토큰 보호. 같은 URL 을 앱이 설치된 단말에선 Universal/App Links 가 가로채 앱이 직접 열고, 미설치 단말은 웹 SPA 가 fallback. 그리고 같은 경로를 JS 미실행 크롤러(카카오/슬랙)가 긁으면 friendly 가 OG 메타 + 정산표 PNG 를 SSR-lite 로 내려준다.

## Architecture [coverage: high — 14 sources]

pnpm workspaces + Turborepo 기반 모노레포.

```
niney-life-pickr-v2/
├── apps/
│   ├── friendly/          Fastify 백엔드 → friendly 토픽
│   │   ├── assets/fonts/IBMPlexSansKR-{Regular,Bold}.ttf   정산표 PNG 한글 렌더 폰트 (레포 커밋)
│   │   ├── data/
│   │   │   ├── dev.db           SQLite (DATABASE_URL=file:../data/dev.db; 운영은 prod.db)
│   │   │   ├── receipts/        영수증 이미지 디스크 저장 (멀티 분할 시에도 한 token 재사용)
│   │   │   └── thumbs/          네이버 CDN 썸네일 캐시
│   │   ├── eslint.config.mjs    @repo/config/eslint/node 확장
│   │   └── src/
│   │       ├── plugins/cors.ts                        dev 전면 origin 반사 허용 (비-LAN 만 warn)
│   │       ├── plugins/schedule.ts                    ScheduleService app 전역 singleton decorate (신규)
│   │       ├── config/env.ts                          APP_TEAM_ID / APP_BUNDLE_ID / ANDROID_* / WEB_INDEX_PATH / OG_IMAGE_PATH
│   │       └── modules/
│   │           ├── schedule/                cron 주기 정규화→글로벌 머지 (croner in-process, 신규)
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
│   │   ├── eslint.config.mjs    @repo/config/eslint/react 확장 (신규)
│   │   ├── vite.config.ts       Rolldown codeSplitting.groups(ol/react-vendor/query/radix) + /share/settlements proxy
│   │   └── src/
│   │       ├── stores/settlementPrefsStore.ts        localStorage exclude default
│   │       └── routes/         라우트 lazy 코드 스플리팅 + 핫패스 React.memo
│   ├── mobile/            Expo + RN 앱 → mobile 토픽
│   │   ├── eslint.config.mjs    @repo/config/eslint/react 확장 (신규, React Compiler 진단 룰)
│   │   ├── DEEP_LINK_SETUP.md   Universal/App Links 설정 가이드
│   │   ├── app.config.ts        associatedDomains + intentFilters(autoVerify)
│   │   ├── app/
│   │   │   ├── (tabs)/_layout.tsx                  ~/components/tabs-layout 위임 (web/native split)
│   │   │   ├── restaurant/[placeId]/settle/        new + [id]/index/edit (앱 정산)
│   │   │   ├── settlement/                         new + history + contacts
│   │   │   └── share/settlements/[token].tsx       Universal Link 진입점
│   │   └── src/components/settlement/              SettlementWizard / Step1~4 / *Sheet / *Editor
├── packages/
│   ├── api-contract/      Zod SSOT → api-contract 토픽
│   │   └── eslint.config.mjs    @repo/config/eslint/base 직결 (신규)
│   ├── shared/            FE 공통 (API/hooks/store/UI) → shared 토픽
│   ├── utils/             순수 유틸 → utils 토픽
│   └── config/            tsconfig + ESLint 베이스 → config 토픽
│       └── eslint/{base,node,react}.js   base(TS) ← node(+Node 글로벌) / react(+react-hooks v7)
├── deploy.sh              운영 서버 배포 스크립트 — 케이스 번호(1~5) 선택 (신규)
├── docs/deploy-friendly.md  pm2 + nginx + Cloudflare 운영 가이드 (ninelife.kr) + OG SSR-lite nginx ^~
├── ecosystem.config.cjs   pm2 (fork, 단일 인스턴스 — SQLite 락 회피)
├── pnpm-workspace.yaml    apps/* + packages/*
├── turbo.json             dev / build / typecheck / lint / test 파이프라인
├── tsconfig.base.json     루트 TS 베이스 (ES2022, strict, noUncheckedIndexedAccess)
├── CLAUDE.md              에이전트 가이드 (이 위키와 함께 본다) — "용어" 섹션 포함
└── TECH_STACK.md          전체 기술 스택 명세
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

### 출처 3종 + canonical 그룹핑 레이어 (변동 없음)

크롤 출처가 한 개에서 셋으로 늘어나면서 "출처 가로지르는 같은 가게" 문제가 생겼다. 해결 구조:

```
Naver Place ──┐
Diningcode  ──┼──→ Restaurant (source, sourceId)  ──→  CanonicalRestaurant (N:1)
Catchtable  ──┘
```

자세한 모델·매칭 로직: [friendly](friendly.md), [canonical](canonical.md).

### 백엔드 도메인 맵 (`apps/friendly/src/modules/`)

| 도메인 | 역할 | 위키 |
|---|---|---|
| `auth` | 회원가입 / 로그인 / JWT | — |
| `user` | 프로필 / 관리자 role 토글 | — |
| `picks` | 선택지 등록 + 무작위 픽 | — |
| `crawl` | 네이버 / DC / 캐치테이블 / **테이블링** 크롤 (Playwright + HTTP 어댑터별 분기, Naver done 후 자동 DC 매칭+머지 후크, naver stealth/jitter, SSE seq 단일화). 테이블링은 무인증 REST(검색/상세/사이트맵 발견) | [crawl](crawl.md) |
| `auto-discover` | AI 키워드 8개 → 다중 검색 → 그룹 5병렬 자동 발견 잡 (순차 큐 + 후보 확인 후 등록) | [auto-discover](auto-discover.md) |
| `random-crawl` | cron 으로 지역 랜덤 선정 → 검색 → 후보 텔레그램 push → 사용자가 고른 가게만 크롤 (사람이 끼는 2단계 비동기 상태머신) | [random-crawl](random-crawl.md) |
| `telegram` | 텔레그램 봇 (long-polling) — `/search`·`/discover`·`/stats` 커맨드 + 크롤 진행/완료 알림 + 어드민 설정 | [telegram](telegram.md) |
| `review-search` | 리뷰 RAG/문맥검색 — enrich(bge-m3 임베딩) → 하이브리드 회수 → 리랭크 → RAG 생성 → 검증 가드레일. 어드민 + 공개 무인증 QA | [review-search](review-search.md) |
| `review-clustering` | 리뷰 군집화 — UMAP→HDBSCAN→c-TF-IDF→LLM 라벨 (Python 사이드카 런타임). 공개 읽기 전용 | [review-clustering](review-clustering.md) |
| `logs` | 전 기능 횡단 범용 작업 로그(`OperationRun`/`Log`/`Report`) + 실패 run LLM 자동 분석 + 보존 정리 | [logs](logs.md) |
| `ai` | LLM 라우팅 + `purpose` 분리(chat/image/log-analysis) + 모델 preview + **계정 단위 2단 동시성 게이트** + **사용량 텔레메트리 SSE** + 키 1계정 공유·용도별 모델 | [ai](ai.md) |
| `settlement-extraction` | 영수증 업로드 + vision LLM 추출 + 멀티 영수증 분할 (`ExtractReceiptSplit { count, index }`) | [settlement](settlement.md) |
| `settlement` | N차 세션 CRUD + 분배 계산(`calculateMultiRoundShares`) + 공유 토큰 + draft 자동저장 + **공유 OG SSR-lite**(`share-preview.ts`) + **정산표 PNG**(`settlement-card.ts`). `PUT /:id` 풀 리플레이스 | [settlement](settlement.md) |
| `contact` | 단골 참여자 자동 적립 + `/me/contacts` | [settlement](settlement.md) |
| `well-known` | `/.well-known/apple-app-site-association` + `/.well-known/assetlinks.json` 동적 응답 (env 기반, 미설정 시 404) | — |
| `schedule` | cron 주기 자동 실행 (정규화→글로벌 머지 증분). croner in-process, plugin 전역 singleton + registry(cron 타이머 + 동시 1개 inflight), 부팅 stale 정리 + cron 등록 | [schedule](schedule.md) |
| `summary` | 리뷰 단위 분석 v4 (메뉴 멘션 + 태그) | [ai](ai.md) |
| `restaurant` | 어드민 식당 CRUD + 공개 list/detail/insights/ranking (식당명 경량 조회 추가) | — |
| `canonical` | 출처 가로지르는 같은 가게 묶기 + 머지 제안 큐 | [canonical](canonical.md) |
| `media` | 리뷰 사진/동영상 + 썸네일 프록시 + 파노라마 503/TTL 영구 사본 캐시 | [friendly](friendly.md) (media 모듈) |
| `menu-grouping` | 식당별 메뉴 정규화 (synonym → canonical) | [menu-grouping](menu-grouping.md) |
| `analytics` | 전역 메뉴 머지 + 카테고리 path + 통계 트리. 택소노미 v3(재료·메뉴군 축, `GLOBAL_MERGE_VERSION` 3), LLM 출력 배열 스키마(Ollama grammar) + 청크 10, `buildCategoryTree` 공용 | [analytics](analytics.md) |
| `settings` | 외부 SDK 키 — 현재 `map.route.ts`만 (vworld) | — |
| `admin` / `health` | 어드민 메타 / 헬스체크 | — |

빌드 의존 관계: turbo가 `^build` 종속을 자동 추적한다. `dev` 태스크는 캐시 비활성화 + persistent로 워치 모드 유지. `lint` 태스크는 이번 라운드 4 워크스페이스 모두 green.

### 공개 / 인증 사용자 / 어드민 3-레이어 분리 정책

라우트 prefix 로 가른다 — 백엔드의 모든 어드민 엔드포인트는 `/api/v1/admin/*` 아래에 모이고, 사용자 본인 자원은 `/api/v1/me/*` 또는 `/api/v1/settlements/*` / `/api/v1/settlement-drafts/*` (인증 필요), 그 외는 공개. `app.requireAdmin` 가드는 `admin/` prefix 라우트에만, `app.requireAuth` 는 사용자 자원 라우트에 붙는다. FE 도 같은 정책:

| 영역 | 레이아웃 | 라우트 | 가드 |
|---|---|---|---|
| 공개 | `PublicLayout` (TopBar + 모바일 사이드바) | `/`, `/restaurants`, `/restaurants/:placeId`, `/share/settlements/:token` | 없음 |
| 인증 사용자 | `PublicLayout` 또는 단독 | `/me/settlements`, `/me/contacts`, `/restaurants/:placeId/settle/new`, `/restaurants/:placeId/settle/:id` | `RequireUser` (token, role 무관) |
| 인증 진입 | (단독) | `/login` | 없음 |
| 어드민 | `AdminLayout` (좌측 사이드바) | `/admin/*` | `RequireAdmin` (token + role=ADMIN) |

공개 영역은 Pretendard 변수 폰트 + 텍스트 사이즈 시프트가 적용되고, 어드민은 시스템 폰트 fallback. 공유 정산 토큰 경로(`/share/settlements/:token`) 는 비인증이지만 `PublicLayout` TopBar 도 띄우지 않아 받는 사람이 단순히 결과만 보게 한다 — 앱이 설치된 단말에선 OS 가 인터셉트해 `apps/mobile/app/share/settlements/[token].tsx` 가 직접 열리고, JS 미실행 크롤러는 friendly 의 OG SSR-lite 응답을 받는다.

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

## Talks To [coverage: high — 9 sources]

내부 패키지 의존 그래프 (단방향 — 순환 금지):

```
api-contract  ← 의존 ←  friendly, shared
shared        ← 의존 ←  web, mobile
utils         ← 의존 ←  friendly, web, mobile, shared (순수 함수만)
config        ← 의존 ←  모든 워크스페이스 (tsconfig/eslint — eslint.config.mjs 가 @repo/config/eslint/* 확장)
```

런타임 통신:
- 웹 → friendly (`VITE_API_URL`, dev에선 Vite proxy `/api` → `:3000` + `/share/settlements` → `:3000`(OG/정산표 PNG); `server.host: true` 로 LAN/모바일 단말에서도 dev 서버 접근)
- 앱 → friendly (`EXPO_PUBLIC_API_URL`, 빌드 시점 주입. Expo Web 은 `window.location.host` 가 LAN IP 면 friendly base URL 도 같은 LAN IP 로 자동 매칭. 운영 빌드는 `.env.production` 자동 로드)
- friendly → SQLite 파일 (`apps/friendly/data/dev.db`, 운영 `prod.db`)
- friendly 내부 — `croner` in-process cron 타이머가 주기마다 menu-grouping → analytics(글로벌 머지) 서비스 호출 (외부 잡 큐 없음 — no-Redis 전제 일관)
- 앱/웹 → `useColorScheme`(OS) — 테마 모드 system 일 때 결합. 저장은 플랫폼별 localStorage / AsyncStorage `'lp:themeMode'`, design 토큰만 shared
- friendly → 디스크 (`apps/friendly/data/receipts/<token>.jpg` — 영수증 이미지. 멀티 분할은 같은 token 재사용 + sharp crop)
- friendly → 디스크 (`apps/friendly/assets/fonts/IBMPlexSansKR-*.ttf` — 정산표 PNG 한글 렌더 + `apps/web/dist/index.html` 읽어 OG 메타 주입)
- friendly → 네이버 / DC / 캐치테이블 (Playwright + 어댑터, naver stealth + jitter)
- friendly → 네이버 CDN (`/api/v1/media/thumbnail` 프록시) → [friendly](friendly.md) (media 모듈)
- friendly → LLM provider — `purpose` 분리(`chat`/`image`). 모델 preview 라우트로 키 검증 후 저장
- 웹 → vworld WMTS (OpenLayers 직접 fetch)
- 웹 → jsDelivr CDN (Pretendard 변수 폰트 — 공개 페이지)
- 공유 정산 토큰 read 는 비인증 — `GET /api/v1/share/settlements/:token`(응답에서 `receiptPreviewUrl`/`userId` 제거) + OG HTML/PNG 응답
- iOS/Android → friendly `/.well-known/*` — OS 가 설치 시 자동 검증해서 `/share/settlements/*` 매칭 URL 을 앱으로 인터셉트
- SNS 크롤러(카카오/슬랙/텔레그램) → friendly `/share/settlements/:token` → OG 메타 + `image.png`
- **운영 토폴로지** — Cloudflare(엣지 캐시 + Flexible SSL) → nginx(`location /api/` + `^~ /share/settlements/`·`/s/`) → Fastify(pm2 fork 단일 인스턴스). `X-Real-IP` 는 `$http_cf_connecting_ip` 로 실제 방문자 IP 보존
- 앱(Expo Web) — dev CORS — friendly 가 dev 한정 모든 origin 반사 허용 (env 안 만지고 폰 단말 LAN 접근 가능, 비-LAN 만 origin당 1회 warn)

스키마 1개 변경으로 FE/BE 모두 컴파일 타임 불일치 감지 — 자세한 건 [api-contract 토픽](api-contract.md).

## API Surface [coverage: high — 7 sources]

루트 `package.json`이 노출하는 명령어 (turbo 위임):

| 명령 | 동작 |
|---|---|
| `pnpm dev` | 전체 dev (웹 + 앱 + friendly 동시) |
| `pnpm dev:api` | friendly만 (`http://localhost:3000`, docs `/docs`) |
| `pnpm dev:web` | 웹만 (`http://localhost:5173`, LAN host 노출) |
| `pnpm dev:mobile` | 앱 (Expo Dev Tools) |
| `pnpm dev:ios` / `pnpm dev:android` | 앱 iOS/Android 시뮬레이터 직행 |
| `pnpm dev:mobile:local` / `:prod` | 앱 dev 서버 + API URL 변형 |
| `pnpm build` / `typecheck` / `lint` / `test` | 전체 turbo 태스크 (`lint` 이번 라운드 4 워크스페이스 green) |
| `pnpm format` | Prettier (semi, singleQuote, trailingComma=all, printWidth=100) |
| `pnpm clean` | turbo clean + node_modules 제거 |
| `pnpm --filter <name> ...` | 특정 워크스페이스 명령 위임 |

운영 배포는 루트 `./deploy.sh [1-5]` — 케이스 번호로 골라 실행:

| 케이스 | 동작 |
|---|---|
| 1 | API(friendly)만 — DB 스키마 변경 없음 (pull → build → `pm2 reload`) |
| 2 | API + DB 마이그레이션 (파괴적이면 `pm2 stop` → migrate → `pm2 start`, 아니면 무중단 reload) |
| 3 | 웹(apps/web)만 (build + `chmod o+rX` + index.html OG 캐시 비우기용 `pm2 reload`) |
| 4 | 웹 + API + DB (풀 재배포) |
| 5 | .env만 (`pm2 reload --update-env`) |

`migrate deploy`(운영) / `migrate dev`(개발) 구분, `pm2` fork 단일 인스턴스(SQLite 락 회피). 자세한 절차·nginx·Cloudflare 는 [docs/deploy-friendly.md](../../docs/deploy-friendly.md).

### 백엔드 라우트 트리 (요약)

```
/api/v1
├── auth/* ......................... 회원가입 / 로그인 / 내 정보
├── picks/* ........................ 선택 / 픽 결과
├── media/thumbnail ................ 네이버 CDN 프록시 (공개)
├── settings/map/public ............ vworld WMTS 키 (공개)
├── restaurants/
│   ├── ranking .................... 공개 랭킹
│   ├── public ..................... 공개 리스트
│   ├── public/:placeId ............ 공개 상세 (+ /insights /category-tree /reviews 페이지네이션)
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
    ├── ai/* ....................... LLM 호출 + provider 키 (purpose=chat/image/log-analysis) + models/preview + telemetry SSE
    ├── analytics/* ................ 그룹핑 잡 + 글로벌 머지(택소노미 v3) + 카테고리 트리
    ├── schedule/* ................. 주기 자동 실행 설정 CRUD / 수동 실행 / 이력 (정규화→머지)
    ├── review-search/* ............ enrich/ask/status/enrich-bg + enrich-events SSE
    ├── review-clustering/* ........ run/status/cluster-bg/cluster-pending
    ├── logs/* ..................... 작업 run 목록/상세/로그 + 실패 분석 + 보존 설정
    ├── canonical/* ................ 머지 제안 큐 / 수락·거절
    ├── settings/map ............... 지도 SDK 키 (admin)
    ├── settings/telegram .......... 텔레그램 봇 토큰/chatId (DB+env fallback)
    └── restaurants/* .............. 어드민 식당 CRUD + 인사이트 + smart-pick + region-stats + summary SSE
```

> 비-`/api/v1` 루트 경로: `/share/settlements/:token`(별칭 `/s/:token`) 의 OG HTML + `image.png` 와 `/.well-known/*` 는 Fastify 루트에 직접 매핑(nginx 가 prefix 그대로 proxy).

### 웹 라우트 트리 (요약)

```
PublicLayout
  /                          HomePage (랭킹 행 → <Link to="/restaurants-v2/:placeId">)
  /restaurants               RestaurantsPage
    /restaurants/:placeId    RestaurantDetailRoute
  /me/settlements            SettlementHistoryPage (RequireUser, bulk delete + "이어 입력" draft 행)
  /me/contacts               ContactsPage (RequireUser)
  /login                     LoginPage (단독)
RequireUser (단독)
  /restaurants/:placeId/settle/new   SettlementNewPage (Step1/Step2Rounds/Step3/Step4, server draft 자동저장)
  /restaurants/:placeId/settle/:id   SettlementResultPage (차수별 카드 + sticky 정산표, PUT 풀 리플레이스)
공개 (레이아웃 없음)
  /share/settlements/:token  SharedSettlementPage (비인증 read-only)
AdminLayout (RequireAdmin)
  /admin / /admin/discover / /admin/auto-discover / /admin/diningcode / /admin/diningcode-test / /admin/catchtable-test / /admin/restaurants / /admin/canonical / /admin/analytics / /admin/crawl-test / /admin/ai-test / /admin/settings
```

라우트 컴포넌트는 이번 라운드에 `lazy` 코드 스플리팅 — 첫 로드 바이트 절감, `vite.config.ts` 의 `codeSplitting.groups` 가 그 위에 vendor 청크(ol/react-vendor/query/radix)를 고정해 앱 코드만 바뀌어도 벤더 캐시 유지. 옛 `/admin/ai-keys` 북마크는 `/admin/settings/ai-keys` 로 redirect.

### 앱 라우트 (요약)

```
app/
├── (tabs)/_layout.tsx        ~/components/tabs-layout 위임 (web/native split — 형제 .web.tsx 자동 채택)
├── (tabs)/home.tsx
├── (tabs)/restaurants.tsx
├── (tabs)/profile.tsx
├── restaurant/[placeId]/
│   ├── index.tsx
│   └── settle/
│       ├── new.tsx                 SettlementWizard
│       └── [id]/{index, edit}.tsx
├── settlement/
│   ├── new.tsx                     식당 미지정 시작 슬롯 (placeId=null draft)
│   ├── history.tsx                 bulk delete + "이어 입력" rows
│   └── contacts.tsx
└── share/settlements/[token].tsx   Universal/App Link 진입점 — useSharedSettlement 호출, headerBackTitle 명시
```

## Data [coverage: high — 8 sources]

데이터 흐름 (단일 진실의 원천):

```
packages/api-contract (Zod schema)
     │ 검증+OpenAPI         │ 타입+fetch
     ▼                      ▼
  friendly                @repo/shared
  (Fastify)               (API client/hooks)
                           │           │
                           ▼           ▼
                          웹          앱
```

영속 데이터: SQLite 파일 (`apps/friendly/data/dev.db`, `.env` `DATABASE_URL=file:../data/dev.db`; 운영 `prod.db`), Prisma 마이그레이션. 영수증 이미지는 디스크 (`apps/friendly/data/receipts/<token>.jpg`) — 멀티 분할도 같은 token 재사용. 정산표 PNG 한글 렌더 폰트(`apps/friendly/assets/fonts/IBMPlexSansKR-*.ttf`)는 레포에 커밋되어 git pull 만으로 배포. 클라이언트 토큰: 웹은 `localStorage` `lp:token`, 앱은 AsyncStorage `lp:token`. **세션·영구 저장 분리** 정착:

| 저장소 | 영역 | 키/이름 | 무엇 |
|---|---|---|---|
| 웹 localStorage | `lp:panelPrefs` | 페이지별 사이드 패널 좌/우 |
| 웹 localStorage | `lp:settlementPrefs` | 정산 새 행 exclude default (장기 default) |
| 웹 sessionStorage | `lp:settlement-draft` | wizard 진행 중 draft (브라우저 탭 scope) |
| 앱 AsyncStorage | `lp:settlementPrefs` | 같은 exclude default |
| 앱 AsyncStorage | `lp:settlement-draft` | wizard 진행 중 draft (앱 재시작 영속) |
| 웹 localStorage | (테마) | 화면 모드 system/light/dark (웹 자체 스토어) |
| 앱 AsyncStorage | `lp:themeMode` | 화면 모드 system/light/dark (수동 hydrate, design 토큰만 shared 공유) |
| 서버 DB | `SettlementDraft` | 다기기 canonical draft (5s debounce upsert, hydrate placeId당 1회) |
| friendly 프로세스 메모리 | (OG index 캐시) | 빌드된 `index.html` 1회 캐시 + OG 미리보기 경량 select 5분 캐시 — pm2 reload 로 비워짐 |

`settlementDraftStore` (zustand) 는 storage 어댑터를 **외부 주입** — 부팅 직후 `setSettlementDraftStorage(...)` 가 호출되어야 store 의 첫 read/write 가 안전. 웹은 entry 에서 sessionStorage 어댑터, 앱은 `apps/mobile/src/lib/api-setup.ts` 에서 AsyncStorage 어댑터 주입.

### 도메인 테이블 그룹 (전 ~34개)

| 그룹 | 테이블 (자세한 모델은 friendly/canonical/analytics/settlement/logs 토픽) |
|---|---|
| 사용자 (3) | `User`, `Pick`, `PickResult` |
| 외부 SDK·봇 설정 (3) | `LlmProviderConfig` (`@@unique(provider, purpose)`), `MapProviderConfig`, `TelegramConfig` (단일 행, 18차) — 셋 다 [db-config-env-fallback](../concepts/db-config-env-fallback.md) 동형 |
| canonical (2) | `CanonicalRestaurant`, `CanonicalMergeProposal` |
| 식당/크롤 (3) | `Restaurant` ((source, sourceId) unique + canonicalId), `VisitorReview`, `ReviewSummary` |
| 분석 v4 (2) | `MenuMention`, `ReviewTag` |
| 리뷰 RAG·군집 (18차) | `ReviewSummary` enrichment 컬럼(`embeddingJson`/`aspectsJson`/`contextLine`/`enrichVersion`) + `clusterId` FK, `ReviewCluster` (군집 1행/주제, clusterVersion/corpusSize) |
| 메뉴 그룹핑 (1) | `MenuCanonical` |
| 전역 머지 + 통계 (3) | `GlobalMenuCanonical`, `GlobalMenuCanonicalLink`, `GlobalMenuMergeChunkCache` (청크 캐시 — `20260619075115` 마이그레이션 정식 등재. 과거 수동 생성 운영 DB 는 `_prisma_migrations` 정합 확인 필요) |
| 작업 로그 (4, 18차) | `OperationRun`(run 헤더, feature 8+종), `OperationLog`(스텝, 4 level), `OperationReport`(실패당 0~1 LLM 분석), `LogConfig`(보존 기본 30일) — [logs](logs.md) |
| 자동 발굴 (2, 18차) | `RandomCrawlConfig`(jobType unique), `RandomCrawlRun`(telegramChatId/MessageId/expiresAt/candidatesJson) |
| 정산 (6) | `SettlementSession` (`shareExpiresAt`), `SettlementParticipant`, `SettlementItem`(→Round), `SettlementRound` (`groupSplits` JSON — 균등/잔수 세부 분배, 18차), `SettlementRoundAttendee`, `SettlementContact` |
| 정산 보조 (2) | `SettlementCategoryAdjustment` (round × category — `leftoverParticipantIds[]` 배열 '나눠 받기' + roundUnit nullable), `SettlementDraft` ((userId, placeIdKey) unique — '' sentinel for null placeId) |
| 스케줄 (2) | `ScheduleConfig` (`jobType @unique`, cronExpr/timezone/enabled + lastRunAt/lastStatus 비정규화 — nextRunAt 미저장), `ScheduleRun` (`@@index([jobType, startedAt])`, status running/done/failed/skipped/interrupted, trigger cron|manual) |

`SettlementSession.shareToken @unique` 가 공유 OG/정산표 PNG 라우트의 진입 키 — 토큰으로 세션을 찾아 satori 매트릭스를 렌더한다.

자세한 모델·인덱스: [friendly](friendly.md), [canonical](canonical.md), [settlement](settlement.md).

### 분석 LLM 파이프라인 (3단계, 변동 없음)

```
크롤 → 1) 리뷰 단위 분석 (summary v4) → 2) 식당별 메뉴 그룹핑 → 3) 전역 머지 + 카테고리 path → 통계 트리
```

각 단계는 `*_VERSION` 상수(`ANALYSIS_VERSION`, `MENU_GROUPING_VERSION`, `GLOBAL_MERGE_VERSION`, `EXTRACTION_VERSION`)를 들고 있어 자동 stale 식별 가능. 이번 라운드 `GLOBAL_MERGE_VERSION` 2→**3**(택소노미 재료·메뉴군 전환) — 기존 머지 행 일괄 stale, full 재머지 필요. schedule 도메인의 cron 자동 실행이 바로 이 정규화→글로벌 머지 파이프라인을 주기로 돌린다.

## Key Decisions [coverage: high — 18 sources]

CLAUDE.md / TECH_STACK.md / 도메인 토픽에 명시된 핵심 결정. (reverse-chronological — 최신 먼저)

| 결정 | 이유 |
|---|---|
| **리뷰 지능화 — RAG 문맥검색 + 군집화 (18차 2026-06)** | 리뷰를 bge-m3 임베딩으로 enrich 해 하이브리드 회수→리랭크→RAG 답변(2차 검증 가드레일)하는 [review-search](review-search.md), UMAP→HDBSCAN→c-TF-IDF→LLM 라벨로 묶는 [review-clustering](review-clustering.md). 군집 수학은 **Python 사이드카**(spawn), 임베딩은 로컬 Ollama bge-m3(`/api/embed`, Cloud 엔 임베딩 없음). 둘 다 canonical 멤버 다소스 행을 통합 코퍼스로([canonical-corpus-fanout](../concepts/canonical-corpus-fanout.md)). HyDE 제거·rerank-합집합 기각·span-grounding 채택은 `research/<domain>/probe-*` 로 실측 판정 |
| **운영 자동화 — 텔레그램 봇 + 자동 발굴 + 작업 로그 (18차 2026-06)** | [telegram](telegram.md) 봇(long-polling)이 `/search`·`/discover`·`/stats` 와 크롤 알림을 담당. [random-crawl](random-crawl.md) 이 cron 으로 지역을 골라 후보를 텔레그램으로 보내고 사용자가 고른 가게만 크롤(사람이 끼는 2단계). [logs](logs.md) 가 전 기능 run/step 을 [operation-log-instrumentation](../concepts/operation-log-instrumentation.md) 으로 통합 기록 + 실패 LLM 자동분석. 모두 no-Redis in-process 전제 유지 |
| **LLM 계정 게이트 + 사용량 텔레메트리 (18차 2026-06)** | 호출이 purpose 게이트→계정 게이트 2단 직렬 통과([in-memory-singleton-gates](../concepts/in-memory-singleton-gates.md)), DB maxConcurrent 동기화. 모든 호출이 AdapterCache→OllamaCloudAdapter 단일 경로로 수렴해 onEvent 훅으로 전 지점 계측 → telemetry SSE. AI 키 1계정 공유 + 용도별(chat/image/log-analysis) 모델만 분리 |
| **4번째 출처 테이블링 + 세부 분배(잔수) (18차 2026-06)** | 테이블링(무인증 REST) 합류로 canonical 이 4소스 묶기, 같은 source 얕은/풍부 티어는 place↔partner 자동 승격. 정산은 한 차수 카테고리 풀을 멤버끼리 균등/잔수(GLASSES) 분배 — `drink-kinds` 단일 사전이 FE 제안·BE 추출보정·프롬프트 힌트 셋을 먹임(EXTRACTION_VERSION 3→4 주류 오분류 이중 안전망) |
| **맛집 공유/SEO — SSR-lite head 주입 (18차 2026-06)** | `/r/:placeId` + sitemap.xml + robots.txt 가 빌드된 index.html `<head>` 에 OG/JSON-LD 주입(봇=서버 / 사람=SPA). 정산 공유와 같은 [ssr-lite-head-injection](../concepts/ssr-lite-head-injection.md) 메커니즘(16차 정산 단독→식당으로 번져 컨셉 추출). 네이버 파노라마 대표이미지 503/TTL 만료는 영구 사본 캐시(panorama-cache)로 해소 |
| **schedule 도메인 신규 — croner in-process 주기 자동 실행 (17차 2026-06)** | "정규화→글로벌 머지(증분)" 를 어드민 cron 주기로 자동화. `croner` **in-process**(단일 Fastify + no-Redis 전제와 일관 — 외부 잡 큐 안 둠). `plugins/schedule.ts` 가 `ScheduleService` 전역 singleton + `scheduleRegistry`(cron 타이머 + 동시 1개 inflight, overlap 시 skip). 부팅 시 stale `running`→`interrupted` 정리 + 설정 cron 등록, SIGTERM 시 abort + graceful close. 어드민 UI 는 `AdminAnalyticsPage` 에 섹션 통합. 신규 테이블 `schedule_configs`/`schedule_runs`, croner 의존 추가. nextRunAt 은 croner 로 매번 계산(미저장) |
| **카테고리 택소노미 v3 — 재료·메뉴군 축 전환 (17차 2026-06)** | 전역 머지 최상위를 음식 종류(한식/일식/양식)→재료·메뉴군(고기/면/김치/반찬/찌개·전골/회·초밥/튀김…)으로. `GLOBAL_MERGE_VERSION` 2→3 → 기존 행 stale, full 재머지 필요. 복합어는 가운뎃점(`/`는 path 구분자라 금지). LLM 출력 맵→**배열** 스키마(Ollama grammar fix) + 청크 50→10. `buildCategoryTree` 공용(전역 어드민 + 식당별 공개 분석 탭) |
| **다크 모드 — 저장소 플랫폼 분리 / design 토큰 공유 (17차 2026-06)** | 웹/앱 둘 다 system/light/dark 3-way. 웹 localStorage / 앱 AsyncStorage `'lp:themeMode'`(수동 hydrate + `useResolvedThemeMode`=useColorScheme 결합) — shared 가 RN/web storage 직접 import 안 하도록 저장소는 플랫폼별, `@repo/shared` design 토큰만 공유. vworld 다크(midnight)/위성 레이어 토글 + 앱 테마 연동(`tileSource.setUrl()` 로 map 재생성 없이 전환) |
| **앱 안드로이드 커스텀 탭바 + 빌드 스크립트 (17차 2026-06)** | 표준 스타일 커스텀 하단 탭바, `splashscreen_logo` 누락 빌드 fix, 바텀시트 가로 스와이프 fix. iOS/Android 실기기·릴리즈 실행 스크립트. 루트 `expo run:ios` 오염(ios/·app.json) 정리 + 루트 `.gitignore` 에 `/ios /android /app.json` 추가로 재발 차단(정상 네이티브 빌드는 `apps/mobile`) |
| **soft tonal variant + 카드 클릭/더블클릭 지도 통일 (17차 2026-06)** | 버튼/배지 soft tonal 색 variant 도입(어드민/상세/병합 일괄). 분석 탭 메뉴/팁 클릭→해당 리뷰 필터, 메뉴 썸네일 탭→라이트박스. 목록 카드 클릭=지도 이동/더블클릭=확대(공개+어드민 통일), 상세 탭 카드 테두리 제거·리뷰 사진 풀폭(웹/앱 통일) |
| **ESLint 인프라 — base ← node/react 확장 체인 (신규)** | 4 워크스페이스가 `@repo/config/eslint/*` 를 확장해 turbo lint 4/4 green. base 는 TS 규칙(`consistent-type-imports` error, `no-undef` off — tsc 가 미정의 식별자 처리). web/mobile 은 react-hooks v7 = React Compiler 진단 룰로 메모이즈 가능 여부까지 정적 검사. 기존 위반은 일단 `warn`(가시성·회귀 방지), 정리되는 대로 error 승격 |
| **운영 도메인 `ninelife.kr` + `deploy.sh` 케이스 선택 (신규)** | 옛 `nlpp.easypcb.co.kr` 폐기. `deploy.sh [1-5]` 가 변경 범위(API/DB/웹)에 맞춰 최소 작업만 — 추가형 마이그레이션은 무중단 `pm2 reload`, 파괴적이면 stop→migrate→start 선택. 운영 토폴로지 Cloudflare→nginx→Fastify(pm2 fork 단일 인스턴스, SQLite 락 회피) |
| **정산 공유 OG SSR-lite — index.html `<head>` 주입 + 정산표 PNG (신규)** | 웹은 순수 SPA 라 JS 미실행 크롤러(카카오/슬랙)가 공유 링크를 긁으면 OG 가 빈다. 공유 경로만 friendly 로 보내 `<head>` 에 OG 메타(식당명·총액·인원수 — **참가자 이름은 미노출**) 주입. `og:image` 는 `/share/settlements/<token>/image.png` 로 satori+resvg 정산표 매트릭스 즉석 렌더. 폰트는 레포 커밋(`IBMPlexSansKR`)이라 별도 설치 불필요. 풀 SSR 아님(meta 만 서버, 본문은 SPA) |
| **OG og:image nginx `^~` 우선권 + Cloudflare Purge (신규)** | og:image 가 `.png` 로 끝나 정적 캐싱용 `~* \.png$` 정규식 location 에 가로채여 prod 404(dev OK)나는 함정. `location ^~ /share/settlements/` 로 prefix 가 정규식을 이기게. Cloudflare 가 `.png` 엣지 캐시라 잘못된 404 캐시 시 nginx 고쳐도 Purge 전까진 안 풀림 |
| **전방위 perf — 라우트 lazy + vendor 청크 고정 + 핫패스 React.memo (신규)** | 웹 라우트 컴포넌트 lazy 로 첫 로드 바이트 절감. `vite.config.ts` Rolldown `codeSplitting.groups`(ol/react-vendor/query/radix)로 앱 코드만 바뀌어도 벤더 캐시 유지. interaction 핫패스 `React.memo`. 크롤 배치는 `setQueryData` 머지로 상세 GET 제거. friendly 는 식당명 경량 조회·OG 미리보기 경량 select+5분 캐시·attendee `createMany`. 앱은 정적에셋 PNG 압축 + 썸네일 프록시(~98%) + FlatList 가상화. 정산 draft hydrate placeId당 1회 |
| **dev CORS 전면 반사 허용 (preflight 차단 해소)** | 개발 머신 IP 가 공인/사설/VPN/WSL 로 수시로 바뀌어 화이트리스트 무의미. 거부(`cb(Error)`)가 로그인 preflight(OPTIONS)를 통째로 깨던 회귀 해소. dev 한정 모든 origin 반사, 비-LAN 만 origin당 1회 warn. prod 는 env `CORS_ORIGIN` 엄격 차단(보안 영향 0) |
| **N차(차수) 정산 모델 — round 레벨 attendance + exclude override** | 마스터 참여자는 session 레벨, round 별 출석 + exclude override 만 round. override null → 마스터 default 상속, 명시값 → round override. 한 자리 1차/2차 다른 식당·출석자 케이스가 흔해서 1차 단일로는 부족. attendees 20→100, items 100→200 |
| **서버 draft 자동저장 + `fromDraftId` 트랜잭션 정리** | 5s debounce PUT `/settlement-drafts` → upsert. 본 저장 시 같은 트랜잭션에서 draft 삭제(경합 회피). 3 레이어: 웹 sessionStorage / 앱 AsyncStorage / 서버 DB(다기기 canonical). hydrate 는 placeId 당 1회(perf) |
| **storage 어댑터 외부 주입 (`setSettlementDraftStorage`)** | shared 의 `settlementDraftStore` 가 storage 의존 없이, 웹/앱 각각 부팅 직후 어댑터 주입. shared 가 RN AsyncStorage 직접 import 하면 웹 번들에 RN 코드 섞이는 문제 회피 |
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

부가 — dev 서버에서 모바일 단말 테스트하려면 `apps/web/vite.config.ts` 의 `server.host: true`. 앱 Expo Web 도 LAN IP 자동 매칭 + friendly dev CORS 전면 반사라 폰-LAN 접근 부담이 거의 없다.

## Gotchas [coverage: medium — 13 sources]

- **리뷰 군집화는 Python 런타임 필요 (18차)** — `review-clustering` 의 UMAP/HDBSCAN/c-TF-IDF 는 `scripts/cluster_compute.py`(numpy/sklearn/umap-learn/hdbscan)를 Node 가 spawn. venv/`CLUSTER_PYTHON_BIN` 미설치 시 graceful skip(군집 없음 → 관점집계 폴백). 운영 설치는 `docs/deploy-friendly.md` 참조. 임베딩(bge-m3)은 별개로 **로컬 Ollama `/api/embed`** 필요 — Ollama Cloud 엔 임베딩 모델 없음(`OLLAMA_EMBED_BASE_URL`)
- **enrich/군집은 canonical 멤버 합산 코퍼스 (18차)** — 단일 placeId 가 아니라 canonical 멤버(다소스) 행 전체로 fan-out([canonical-corpus-fanout](../concepts/canonical-corpus-fanout.md)). `corpusSize` 가 재enrich/재군집 게이트(20% 또는 +20건 이상 늘면). 캐시·진행상태 키는 `primaryId` 통일
- **텔레그램 진행 편집 vs 완료 알림 (18차)** — 진행 상황은 같은 메시지 in-place 편집(편집은 푸시 알림 안 울림) + throttle + 직전 동일 텍스트 skip("not modified" 회피). 완료/실패는 **새 메시지**로 보내야 핑이 울린다. 정지 시 in-flight 편집을 await 후 덮어야 "수집 중" 멈춤 경쟁 회피
- **operation-log 보존 정리 — 보고서 있는 run 은 영구 (18차)** — `LogConfig` 보존(기본 30일) 매일 04시 정리. 단 `OperationReport`(LLM 실패 분석) 달린 run·진행 중 run 은 제외. 자동 분석은 `AUTO_ANALYSIS_EXCLUDED_ERROR_CODES`/`trigger='user'` 제외 + 세마포어(동시1+대기열5)로 비용 폭주 차단
- **LLM 계정 게이트는 어댑터 캐시와 독립 수명 (18차)** — purpose 게이트→계정 게이트 2단. 계정 게이트(키=apiKey|baseUrl)가 어댑터 캐시 회전과 분리돼 설정 변경 중 일시 초과 방지. 텔레메트리는 **표시 전용 인메모리** — 서버 재시작 시 리셋(영속 아님)
- **테이블링 place↔partner 승격 (18차)** — 같은 source 의 얕은(place, JSON-LD) / 풍부(partner) 티어가 일반 canonical 후보 룰의 사각지대 → 저장 시 좌표+이름으로 partner 쪽 자동 흡수(임계 DC 와 동일 0.85/50m)
- **schedule overlap 방지 — 이전 실행 미완료면 tick skip (신규)** — `scheduleRegistry` 가 동시 1개 inflight 만 허용. cron tick 시 이전 실행이 안 끝났으면 `schedule_runs status='skipped'` 행만 남기고 건너뛴다. 부팅 시 직전 인스턴스의 `running` 행은 `interrupted` 로 정리(`schedule.bootstrap()`) — 다음 tick 에 자연 재개
- **schedule plugin 은 자체 AiConfigService 생성 (신규)** — autoload 알파벳순 `'schedule'` < `'summaries'` 라 `app.aiConfig` 가 아직 없다. plugin 로드 순서 의존을 피하려 schedule 이 자체 AiConfig 를 만든다 — `app.aiConfig` 재사용 불가
- **택소노미 v3 = `GLOBAL_MERGE_VERSION` 3, full 재머지 필요 (신규)** — 최상위 축 교체로 기존 머지 행 전부 stale. 어드민 '전체 재실행' / `run-merge --full` 안 돌리면 옛 음식종류 트리 그대로. 카테고리 path 복합어는 가운뎃점 — `/`는 segment 구분자
- **다크 모드 저장소는 플랫폼별 — `'lp:themeMode'` 키 (신규)** — 웹 localStorage / 앱 AsyncStorage. shared 는 design 토큰만 공유(RN/web storage 직접 import 금지). 앱 cron-free 수동 hydrate + `useResolvedThemeMode` 가 system 일 때 `useColorScheme` 결합
- **루트에서 `expo run:ios`/`prebuild` 금지 — 오염 (신규)** — 루트에서 실행하면 잘못된 ios/·android/·app.json 산출. 정상 네이티브 빌드는 `apps/mobile`(LifePickr). 루트 `.gitignore` 가 `/ios /android /app.json` 로 재발 차단
- **OG og:image `.png` prod 404 — nginx `^~` 우선권 (신규)** — `/share/settlements/<token>/image.png` 가 정적 캐싱용 `location ~* \.png$` 정규식에 가로채여 web/dist 에서 못 찾고 404("dev OK / prod 404" 전형). `location ^~ /share/settlements/`·`^~ /s/` 로 prefix 우선권 부여 필수
- **Cloudflare 가 잘못된 404 를 엣지 캐시 — Purge 필요 (신규)** — og:image 가 `.png` 라 Cloudflare 엣지 캐시. 한 번 404 캐시되면 nginx 고쳐도 max-age(관측상 ≈4h) 동안 404. 수정 후 Cloudflare 에서 URL Purge 필수. 카카오/텔레그램도 자체 OG 캐시(며칠) — 갱신은 카카오 OG 캐시 초기화 도구 / 텔레그램 `@WebpageBot`
- **OG index.html 은 프로세스 1회 캐시 — 재배포 후 `pm2 reload friendly` 필수 (신규)** — friendly 가 빌드된 web `index.html` 을 메모리 1회 캐시. 재배포로 자산 해시명이 바뀌어도 reload 안 하면 옛 index 그대로 → OG/SPA 부팅 깨짐
- **lint warn ≠ pass-by-default — 점진 정리 부채 (신규)** — base 룰의 React Compiler 진단(set-state-in-effect 등)·friendly `prefer-const` 등이 기존 위반 때문에 `warn`. turbo lint 는 green 이지만 warn 누적은 정리 대상. 신규 코드에 새 warn 추가 금지 권장
- **SQLite 다중 NULL unique — `placeIdKey='' sentinel`** — `SettlementDraft.(userId, placeIdKey)` unique 는 SQLite 가 다중 NULL 을 위반으로 안 보는 걸 우회하려고 null placeId 를 빈 문자열 '' 로 변환. 직접 SQL 로 row 만들 땐 `placeIdToKey` helper 필수
- **storage 어댑터 주입 ordering** — `settlementDraftStore` 첫 read/write 전에 `setSettlementDraftStorage(...)` 호출 필수. 안 하면 in-memory fallback 으로 떨어져 페이지 전환 시 draft 소실
- **.well-known 404 vs 500 — env 비면 404** — `APP_TEAM_ID`/`ANDROID_SHA256_FINGERPRINTS` 비면 의도적 404. 잘못된 빈 JSON 으로 검증 통과시키면 OS 가 "검증됐는데 매칭 실패" 상태로 빠짐. 셋업은 `apps/mobile/DEEP_LINK_SETUP.md`
- **멀티 영수증 분할 = N 개의 별도 LLM 호출** — 한 imageToken 으로 보이지만 sharp crop 후 vision LLM 을 N 회. 비용 = N × 단일 호출. UI 가 분할 수 노출
- **iOS 뒤로가기 버튼 라벨에 디렉터리명 노출** — expo-router segment 명이 명시 `headerBackTitle` 없을 때 iOS 백 라벨로 샘. 깊은 진입점은 `Stack.Screen options` 에 `title`/`headerBackTitle` 명시
- **`?? null` 클리어 패턴 (회귀 인용)** — `setRoundReceipt(roundId, token ?? null)` 처럼 `undefined` 전달은 partial update 로 해석돼 옛 값 유지. 명시 `?? null` 로 클리어 의도 분명히 — 영수증 제거가 안 먹는 회귀 두 번 발생
- **'수정됨' 배지 기준은 `editedAt`** — `updatedAt` 은 shareToken 발급/회수에도 갱신됨. 별도 컬럼
- **AI provider `purpose='image'` 는 env fallback 없음** — `chat` 만 env backed 가상 row 합성. image 는 반드시 DB row
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
- **버전 매트릭스** — 웹은 React 19, 앱은 Expo SDK 54 + RN 0.81 + React 19 (TECH_STACK.md 의 "Expo 52 / RN 0.76 / React 18" 은 초기 명세 — 실제 버전은 54/0.81/19)
- **앱 운영 빌드는 `.env.production` 자동 로드**
- **앱 Expo Web 은 SPA 모드 고정** — `web.output: 'single'`
- **SQLite 락 + Prisma migrate dev** — friendly dev 떠 있으면 `database is locked` 더 자주. 운영은 `migrate deploy` + pm2 fork 단일 인스턴스(cluster 금지)

## Sources [coverage: high — 52 sources]

- [README.md](../../README.md)
- [CLAUDE.md](../../CLAUDE.md) — "용어" 섹션 포함
- [TECH_STACK.md](../../TECH_STACK.md)
- [package.json](../../package.json)
- [pnpm-workspace.yaml](../../pnpm-workspace.yaml)
- [turbo.json](../../turbo.json)
- [tsconfig.base.json](../../tsconfig.base.json)
- [deploy.sh](../../deploy.sh) — 케이스 번호(1~5) 운영 배포 스크립트 (신규)
- [docs/deploy-friendly.md](../../docs/deploy-friendly.md) — pm2 + nginx + Cloudflare(ninelife.kr) + OG SSR-lite nginx `^~` (수정)
- [packages/config/eslint/base.js](../../packages/config/eslint/base.js) — js + tseslint recommended + consistent-type-imports + no-undef off (신규 연결)
- [apps/web/eslint.config.mjs](../../apps/web/eslint.config.mjs) — @repo/config/eslint/react 확장 (신규)
- [apps/friendly/eslint.config.mjs](../../apps/friendly/eslint.config.mjs) — @repo/config/eslint/node 확장 (신규)
- [apps/mobile/eslint.config.mjs](../../apps/mobile/eslint.config.mjs) — @repo/config/eslint/react (React Compiler 진단 룰, 신규)
- [packages/api-contract/eslint.config.mjs](../../packages/api-contract/eslint.config.mjs) — @repo/config/eslint/base 직결 (신규)
- [apps/web/vite.config.ts](../../apps/web/vite.config.ts) — Rolldown codeSplitting.groups + `/share/settlements` proxy + `server.host: true`
- [apps/friendly/src/modules/settlement/share-preview.ts](../../apps/friendly/src/modules/settlement/share-preview.ts) — 공개 OG SSR-lite (index.html `<head>` 주입, 신규)
- [apps/friendly/src/modules/settlement/settlement-card.ts](../../apps/friendly/src/modules/settlement/settlement-card.ts) — 정산표 PNG (satori+resvg + IBMPlexSansKR, 신규)
- [apps/friendly/.env.example](../../apps/friendly/.env.example) — 운영 도메인/키 (ninelife.kr 가이드 연동)
- [apps/friendly/prisma/schema.prisma](../../apps/friendly/prisma/schema.prisma) — `SettlementRound`/`SettlementRoundAttendee`/`SettlementCategoryAdjustment`/`SettlementDraft`
- [apps/friendly/prisma/migrations/20260525100000_add_settlement_rounds/](../../apps/friendly/prisma/migrations/) — 차수 모델
- [apps/friendly/prisma/migrations/20260525110000_add_settlement_round_discount/](../../apps/friendly/prisma/migrations/) — 차수 할인
- [apps/friendly/prisma/migrations/20260525220309_add_settlement_round_category_adjustments/](../../apps/friendly/prisma/migrations/) — 분담 다듬기
- [apps/friendly/prisma/migrations/20260525235559_add_settlement_drafts/](../../apps/friendly/prisma/migrations/) — 서버 draft
- [apps/friendly/src/config/env.ts](../../apps/friendly/src/config/env.ts) — APP_TEAM_ID / WEB_INDEX_PATH / OG_IMAGE_PATH 등
- [apps/friendly/package.json](../../apps/friendly/package.json) — croner ^10 / satori ^0.26 / @resvg/resvg-js (croner 신규)
- [apps/friendly/src/plugins/schedule.ts](../../apps/friendly/src/plugins/schedule.ts) — ScheduleService 전역 singleton decorate + 자체 AiConfig (신규)
- [apps/friendly/src/modules/schedule/schedule-registry.ts](../../apps/friendly/src/modules/schedule/schedule-registry.ts) — croner cron 타이머 + inflight 동시 1개 모듈 singleton (신규)
- [apps/friendly/src/modules/schedule/schedule.service.ts](../../apps/friendly/src/modules/schedule/schedule.service.ts) — bootstrap(stale→interrupted) + 정규화→머지 run (신규)
- [apps/friendly/src/modules/schedule/schedule.route.ts](../../apps/friendly/src/modules/schedule/schedule.route.ts) — 설정 CRUD / 수동 실행 / 이력 (신규)
- [apps/friendly/src/server.ts](../../apps/friendly/src/server.ts) — schedule.bootstrap + SIGTERM stopAllCrons/abortInflight/forceCloseConnections (수정)
- [packages/api-contract/src/schemas/schedule.ts](../../packages/api-contract/src/schemas/schedule.ts) — schedule 스키마/라우트 (신규)
- [packages/shared/src/hooks/useSchedule.ts](../../packages/shared/src/hooks/useSchedule.ts) — schedule API/훅 (신규)
- [apps/friendly/src/modules/analytics/global-merge.prompts.ts](../../apps/friendly/src/modules/analytics/global-merge.prompts.ts) — 택소노미 v3 카테고리 path 규칙 + few-shot, GLOBAL_MERGE_VERSION 3 (수정)
- [apps/mobile/src/lib/themeStore.ts](../../apps/mobile/src/lib/themeStore.ts) — 앱 테마 3-way AsyncStorage 'lp:themeMode' (신규)
- [apps/mobile/src/hooks/useResolvedThemeMode.ts](../../apps/mobile/src/hooks/useResolvedThemeMode.ts) — useColorScheme 결합 (신규)
- [apps/web/src/components/restaurant/MapLayerControl.tsx](../../apps/web/src/components/restaurant/MapLayerControl.tsx) — vworld 일반/다크/위성 레이어 토글 (신규)
- [.gitignore](../../.gitignore) — 루트 /ios /android /app.json expo 오염 차단 (수정)
- [apps/friendly/src/plugins/cors.ts](../../apps/friendly/src/plugins/cors.ts) — dev 전면 origin 반사 허용 (수정)
- [apps/friendly/src/modules/well-known/well-known.route.ts](../../apps/friendly/src/modules/well-known/well-known.route.ts) — AASA + assetlinks.json 동적 응답
- [apps/friendly/src/modules/settlement/](../../apps/friendly/src/modules/settlement/) — N차 세션 + draft + 풀 리플레이스 PUT + OG/카드 렌더
- [apps/friendly/src/modules/settlement-extraction/](../../apps/friendly/src/modules/settlement-extraction/) — 멀티 영수증 분할 sharp crop
- [apps/friendly/src/modules/ai/](../../apps/friendly/src/modules/ai/) — 모델 preview 라우트
- [packages/api-contract/src/routes.ts](../../packages/api-contract/src/routes.ts) — Settlement(PUT) / SettlementDraft / WellKnown / Ai.modelsPreview
- [packages/api-contract/src/settlement.calculator.ts](../../packages/api-contract/src/settlement.calculator.ts) — `calculateMultiRoundShares` + 100/1000 round + leftover
- [packages/shared/src/stores/settlementDraftStore.ts](../../packages/shared/src/stores/settlementDraftStore.ts) — `setSettlementDraftStorage` 어댑터 주입
- [apps/web/src/routes/settlement/](../../apps/web/src/routes/settlement/) — Step2Rounds / RoundCategoryAdjuster / RoundDiscountEditor / MultiReceiptSplitDialog / SettlementBreakdownTable
- [apps/mobile/app.config.ts](../../apps/mobile/app.config.ts) — associatedDomains + intentFilters autoVerify
- [apps/mobile/DEEP_LINK_SETUP.md](../../apps/mobile/DEEP_LINK_SETUP.md) — Universal/App Link 운영 셋업
- [apps/mobile/src/lib/api-setup.ts](../../apps/mobile/src/lib/api-setup.ts) — Expo Web LAN IP 자동 매칭 + storage 어댑터 주입
- [apps/mobile/docs/production-build.md](../../apps/mobile/docs/production-build.md) — 앱 운영 빌드 가이드
- [docs/menu-hierarchy.md](../../docs/menu-hierarchy.md)
- [docs/mobile-public-restaurant-ux.md](../../docs/mobile-public-restaurant-ux.md)
- [apps/friendly/src/modules/review-search/](../../apps/friendly/src/modules/review-search/) — RAG enrich/회수/리랭크/생성/검증 (18차 신규)
- [apps/friendly/research/review-search/](../../apps/friendly/research/review-search/) — probe-* 실측 검증(HyDE 기각/rerank/latency)
- [apps/friendly/src/modules/review-clustering/](../../apps/friendly/src/modules/review-clustering/) + [scripts/cluster_compute.py](../../apps/friendly/scripts/cluster_compute.py) — UMAP→HDBSCAN→c-TF-IDF Python 사이드카 (18차 신규)
- [apps/friendly/src/modules/random-crawl/](../../apps/friendly/src/modules/random-crawl/) — cron 지역 랜덤 발굴 + 텔레그램 후보 선택 (18차 신규)
- [apps/friendly/src/modules/telegram/telegram.service.ts](../../apps/friendly/src/modules/telegram/telegram.service.ts) + [settings/telegram.route.ts](../../apps/friendly/src/modules/settings/telegram.route.ts) — 봇 long-polling + 설정 (18차 신규)
- [apps/friendly/src/modules/logs/](../../apps/friendly/src/modules/logs/) — operation-log + LLM 실패 분석 (18차 신규)
- [apps/friendly/src/modules/ai/](../../apps/friendly/src/modules/ai/) — concurrency-gate / llm-telemetry / adapter-cache (계정 게이트·텔레메트리, 18차)
- [apps/friendly/src/modules/crawl/adapters/tabling-*.http.adapter.ts](../../apps/friendly/src/modules/crawl/adapters/) — 테이블링 4어댑터 (18차)
- [apps/friendly/src/modules/restaurant/restaurant-preview.ts](../../apps/friendly/src/modules/restaurant/restaurant-preview.ts) + [region-derive.ts](../../apps/friendly/src/modules/restaurant/region-derive.ts) + [canonical-members.ts](../../apps/friendly/src/modules/restaurant/canonical-members.ts) — 맛집 SSR-lite SEO / 지역 통계 / canonical 멤버 (18차)
- [apps/friendly/src/modules/media/panorama-cache.ts](../../apps/friendly/src/modules/media/panorama-cache.ts) — 파노라마 대표이미지 503/TTL 영구 사본 (18차)
- [packages/api-contract/src/settlement.drink-kinds.ts](../../packages/api-contract/src/settlement.drink-kinds.ts) — 술·음료 종류 단일 사전 (18차)
- [apps/web/src/components/admin/RegionStatsMap.tsx](../../apps/web/src/components/admin/RegionStatsMap.tsx) + [public/sigungu-geo.json](../../apps/web/public/sigungu-geo.json) — 지역 통계 choropleth (18차)
- 토픽 — [schedule](schedule.md), [settlement](settlement.md), [auto-discover](auto-discover.md), [friendly](friendly.md), [web](web.md), [api-contract](api-contract.md), [analytics](analytics.md), [menu-grouping](menu-grouping.md), [ai](ai.md), [map](map.md), [crawl](crawl.md), [canonical](canonical.md), [shared](shared.md), [mobile](mobile.md), [config](config.md), [utils](utils.md), [review-search](review-search.md), [review-clustering](review-clustering.md), [random-crawl](random-crawl.md), [telegram](telegram.md), [logs](logs.md)
- 컨셉 — [db-config-env-fallback](../concepts/db-config-env-fallback.md), [operation-log-instrumentation](../concepts/operation-log-instrumentation.md), [canonical-corpus-fanout](../concepts/canonical-corpus-fanout.md), [cross-tab-async-job-toast](../concepts/cross-tab-async-job-toast.md), [ssr-lite-head-injection](../concepts/ssr-lite-head-injection.md)
