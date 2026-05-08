# Wiki Compile Log

## 2026-05-09 (6th compile)

**Topics updated:** friendly, api-contract, shared, web, project-overview
**New topics:** map
**New concepts:** public-admin-route-split
**Concepts updated:**
- `zod-ssot-buildless` — `topics_connected` 에 `map` 추가. 새 인스턴스 한 줄 추가 — `schemas/settings-map.ts` 4종 + 공개 맛집 페어 6종 (`RestaurantPublicListQuery/Item/Result`, `PublicReviewAnalysis`, `PublicVisitorReview`, `RestaurantPublicDetail`) 이 같은 SSOT 모델로 흡수, 신규 토픽이 늘어도 컨슈머 4-5개가 컴파일 타임 동기화. 두 라운드 연속 깨지지 않음.

**Sources scanned:** ~270 (직전 245 + apps/web public components 6개 + apps/web admin settings 2개 + ImgWithFallback + lib/vworld + 신규 친구 settings 모듈 3개 + api-contract 신규 6 zod + shared 신규 4훅 + Prisma migration 1개 + index.html + tailwind.css)
**Sources changed:** ~45 (커밋 8e62270 · 129e696 · 966979c · d1ca1df · ffd27cb · f83fe10 · 04af127 · 974de88)

**Highlights:**
- **공개 사용자 페이지 도입** — 이전엔 어드민 위주 SPA + 루트 랭킹 페이지 정도였지만, 이제 본격 공개 영역 확장: `/restaurants` 풀 뷰포트 (xl+ 3-column 목록/상세/지도, xl- 토글) + 5탭 상세 패널 (홈/메뉴/리뷰/사진/정보) + 다중 마커 지도 + URL state 동기화 (`?q=&category=&sort=&bbox=&placeId=`).
- **신규 토픽 `map`** — vworld JS SDK 거부, OpenLayers (`ol@^10.7.0`) + WMTS XYZ 타일 직접. 도메인 화이트리스트 부담 회피. `MapProviderConfig` DB-backed 키 (env fallback 없음 — vworld 키는 1:1 운영자 자원). `MapCanvas` (저레벨, 다중 마커 + viewport 이벤트 + flyTo/fitToMarkers imperative API) + `VWorldMap` (어드민 단일 마커 thin wrapper) + `PublicRestaurantsMap` (공개 다중 마커 + "이 지역에서 재검색"). 어드민 `/admin/settings/map` 등록 UI + 공개 페이지가 같은 키 사용 (admin secret 과 보안 등급 동등 — WMTS 키는 클라사이드 자원).
- **신규 컨셉 `public-admin-route-split`** — 공개/어드민 같은 데이터에 가드만 토글하지 않고 라우트·스키마·훅을 페어로 분리. `Routes.Restaurant.publicList` ↔ `Routes.Restaurant.list`, `RestaurantPublicListItem` ↔ `RestaurantListItem`, `useRestaurantsPublic` ↔ `useRestaurantList`. 어드민 회귀 위험 0, 운영 메타 (`status`/`errorCode`/`model`) 의도적 제거, 캐싱 정책 분리. 5 토픽에 일관 등장 (friendly + api-contract + shared + web + map + project-overview).
- **friendly settings 모듈 신규** — `MapSettingsService` (LlmProviderConfig 패턴이지만 모델/동시성/env fallback 없음). admin 4 라우트 + 공개 1 라우트 (`/api/v1/settings/map/public`). 9 tests.
- **friendly restaurant 공개 라우트 3개** — `getPublicList` (snapshotJson 메모리 파싱 → bbox 필터 → 그 이후 ids 만 분석 집계), `getPublicDetail` (done 행만 평탄화한 `PublicReviewAnalysis`, 운영 메타 제거), `getInsights` (가드만 빠짐). 11 새 테스트.
- **공개 zod 페어 6종** — `RestaurantPublicListQuery/Item/Result`, `PublicReviewAnalysis`, `PublicVisitorReview`, `RestaurantPublicDetail`. bbox 는 string + regex (4개 숫자 콤마 구분 — query string 친화). mixed sentiment 카운트 분포 4범주 → 3범주 (라이트한 UI 표면).
- **공개 훅 4개** — `useRestaurantsPublic` (placeholderData prev, staleTime 30s), `useRestaurantPublic`, `useRestaurantPublicInsights`, `useMapPublicConfig` (404 OK + retry: false + staleTime Infinity).
- **5탭 상세 패널** — `apps/web/src/components/restaurant/detail/` 디렉토리. root + HomeTab + MenuTab + ReviewsTab + PhotosTab + InfoTab + Lightbox + shared. 데이터 fetch 1회, 탭 전환은 컨텐츠만. **placeId 변경 시 자동 'home' 탭 reset**. 명명 정리 라운드 — 처음 단일 파일이었다가 `panel/` 분해, 다시 `detail/` 로 명명 정리 ("목록 패널" 좌측 vs "상세 패널" 가운데 구분 명료화).
- **`ImgWithFallback` 공용화** — 어드민 로컬 → `~/components/`. `referrerPolicy="no-referrer"` (네이버 CDN hotlink 차단 회피) + onError fallback + src 변경 시 failed 자동 reset (캐러셀 edge case).
- **Pretendard + 텍스트 시프트** — Pretendard Variable 동적 서브셋 jsDelivr CDN, `font-pretendard` 유틸 PublicLayout 한정. Tailwind v4 `@theme inline` 의 `--text-*` 변수를 한 단계 시프트 (12→13/14→15/16→17/18→19/20→22/24→26/30→32) — spacing/icon 그대로, 사이트 전체 본문 가독성 ↑.
- **어드민 `/admin/settings` 통합** — 옛 `/admin/ai-keys` → `/admin/settings/ai-keys` 자동 redirect (북마크 호환). NavLink 탭 (AI 키 / 지도). 사이드바 "AI 키" → "설정". `AdminMapKeysPage` 신규 — provider 카드 + 연결 테스트 (probeVworldKey).
- **어드민 식당 상세 vworld 사이드바** — xl+ 우측 sticky 위치 카드 + Maximize2 → Radix Dialog 우측 슬라이드오버 풀 높이 지도 (별도 VWorldMap 두 인스턴스, `setTarget` 라이프사이클 부담 회피).
- **Prisma 신규 테이블 `MapProviderConfig`** + 마이그레이션 `20260508173216_add_map_provider_configs`.

**Suggested for next round:** 마커 클러스터링 (식당 수 100+ 대비), 거리순 정렬 (사용자 위치 옵션), 공개 list q LIKE 인덱싱 시점 (식당 1k+), 공개 사용자 인증 도입 시 (즐겨찾기/평가) 라우트 페어 정책 재평가.

---

## 2026-05-09 (5th compile)

**Topics updated:** friendly, ai, api-contract, web, mobile, shared, project-overview
**New topics:** menu-grouping, analytics
**New concepts:** versioned-llm-prompts
**Concepts updated:**
- `in-memory-singleton-gates` — `groupingJobRegistry` (multi-job + actorId 격리 + per-job AbortController + TTL 10분), `globalMergeJobRegistry` (single-job inflight 가드 + 409 with snapshot + chunk publish) 추가. 6개 인스턴스로 패턴 굳어짐.
- `sse-token-auth` — `Routes.Analytics.groupingJobEvents`, `Routes.Analytics.globalMergeJobEvents` 두 신규 SSE 엔드포인트 추가. 5개/6개 인스턴스로 "오래 걸리는 잡 = SSE 스트림"이 일급 패턴으로 정착.
- `stream-driven-cache-merge` — `useGroupingJob` (snapshot/item/done 머지 + ranking·status invalidate), `useGlobalMergeJob` (snapshot/chunk/done + overview·global-menus invalidate) 추가. 흥미로운 변형: 잡 단위 훅은 `summarySseManager` 같은 공유 매니저 없이 hook 안에서 EventSource 라이프사이클 직접 관리.
- `zod-ssot-buildless` — `schemas/menu-grouping.ts` + `schemas/analytics.ts` 모듈 추가. **첫 z.lazy 재귀 (`CategoryTreeNode`)** + SSE event payload 를 discriminated union 없이 개별 스키마로 둠. 확장 마찰 없이 흡수.

**Sources scanned:** ~245 (직전 205 + analytics 모듈 4 + menu-grouping 모듈 5 + 4 마이그레이션 + 신규 admin 페이지 + 신규 mobile 화면 3 + 신규 shared API/훅 4 + api-contract 신규 스키마 2 + 신규 docs 1)
**Sources changed:** ~37 (커밋 596f5bc · 2856686 · 249b9f6 · 738b000 · d1cfe2c)

**Highlights:**
- 신규 도메인 `analytics`: 식당 가로지르기 글로벌 메뉴 머지 (두-패스 LLM, full/incremental 모드, 단일-잡 inflight 가드 + 409 snapshot 응답). `categoryPath` 단일 컬럼으로 계층 분류 — 별도 트리 테이블 없이 prefix-LIKE + 메모리 빌더(`getCategoryTree`). `normalizeCategoryPath` 가 다양한 구분자 / 화이트리스트 외 segment 에 "기타" prepend.
- 신규 도메인 `menu-grouping`: 식당당 1회 LLM 호출로 메뉴 표기 변형 정규화 (chunk 80, 단일 청크 압도적). 두 진입점 — 단일 동기 + batch SSE. fallback to nameNorm 으로 즉시 동작 + `unmappedMenus` 배열로 미분류 노출 → UI 분류 버튼.
- 분석 파이프라인 3단계 정리: 리뷰 분석(summary v4, traits + sentiment 강제) → 식당별 그룹핑(MENU_GROUPING_VERSION) → 전역 머지(GLOBAL_MERGE_VERSION + categoryPath).
- 5개 신규 Prisma 테이블 (`menu_mentions`, `review_tags`, `menu_canonicals`, `global_menu_canonicals`, `global_menu_canonical_links`) + 4개 마이그레이션.
- **신규 컨셉 `versioned-llm-prompts`**: 도메인별 `*_VERSION` 상수 + DB 컬럼 + UI stale 배지 + 수동 재실행. summary(자동 큐잉) vs grouping/global-merge(명시 트리거) — 비용 기반 다이얼 차이.
- web admin 신규 페이지 "AI 분석 관리" — 4 섹션 (카운터 / 전역 머지 SSE / 카테고리 트리 / 전역 메뉴 통계 검색·필터). `?menu=`/`?category=` URL 동기화는 useEffect 회피 (single source of truth = useSearchParams).
- 식당 상세에 `MenuRankingSection` + `GlobalCompareBadge` (이 식당 vs 전체 평균, ±5%p 트렌드, "전체 보기" deep-link).
- mobile 맛집 탭(ADMIN gated) + 식당 상세 라우트 + `MenuRankingCard` (분류 버튼·정렬·SentimentBar·글로벌 비교 라벨).
- `restaurant.getInsights.topMenus` 가 menusJson 파싱 → MenuMention + MenuCanonical JOIN 으로 갈아탐.
- `extractFirstJsonObject` 가 summary → menu-grouping/analytics 로 cross-module export. 도메인별 prompts 모듈에 차이는 system prompt + JSON schema + chunk size 만.

**Suggested for next round:** mobile 글로벌 통계 화면(현재 식당별만), categoryPath 의 카테고리별 비교 위젯 ("이 식당의 찌개류 vs 평균"), "전역 stats lru-cache 60s" 도입 시점.

---

## 2026-05-08 (4th compile)

**Topics updated:** crawl, friendly, ai, api-contract, web, shared, utils
**New topics:** none (`summary` 모듈은 활동량이 크지만 friendly 내부로 유지 — 다음 라운드에서 재평가)
**New concepts:** none
**Concepts updated:**
- `stream-driven-cache-merge` — `VisitorReview.videos` SSE 머지 인스턴스, ReviewSummary 구조화 분석 필드 머지 인스턴스 추가 (페이로드만 풍부해지고 머지 인프라는 동일)
- `in-memory-singleton-gates` — placeId별 summary run 직렬화(Promise 체인), Ollama 429 슬롯-보유 백오프 인스턴스 추가
**Sources scanned:** ~205 (직전 178개 + media 모듈 신규 + summary 분석 필드 + thumbnail 헬퍼 + 비디오 스키마 + 웹 모달/뱃지/정렬)
**Sources changed:** ~30 (커밋 eafe74b · cbc1595 · d8e08d7 · d9b331a · 620ed6f · 399e088 · ad51c07 · 05e12e2)
**Highlights:**
- friendly에 첫 media 모듈(`/api/v1/media/thumbnail` — Naver CDN 호스트 allowlist + sharp 리사이즈 + 디스크 캐시 + ETag/304)
- crawl: 방문자 리뷰 최신순 + SSR 초기 24건 즉시 영속, VisitorReviewMedia 정확 매칭(이미지 다중 수집 회복), `type==='video'` 분리해 `videos[{posterUrl, videoUrl}]`로 추출, 수집 개수 상한 제거
- summary: 구조화 분석(sentiment/satisfaction/menus/tips/keywords) + Ollama JSON Schema/`num_ctx`/`num_predict` 명시 + 균형괄호 JSON 파서 + reasoning `<think>` 제거
- summary 직렬화·자동 재시도(3회+백오프) + Ollama 429 슬롯-보유 백오프(200·400·800ms+jitter)
- web: 비디오 타일(▶ 오버레이) + 인라인 `VideoPlayerModal`(ESC/배경 닫기, body scroll lock); 감정 뱃지·메뉴 칩·만족도/긍정/부정비율 정렬 dropdown; visitedAt YY.M.D 정렬 버그 수정(visitedSortKey)

## 2026-05-07 (3rd compile)

**Topics updated:** crawl, friendly, web, shared, api-contract
**New topics:** none
**New concepts:** stream-driven-cache-merge, in-memory-singleton-gates
**Concepts updated:** sse-token-auth (멀티플렉싱 endpoint instance 추가)
**Sources scanned:** ~178 (이전 145개 + restaurant/summary 모듈 + ActiveJobPanel/sections + summarySseManager + activeCrawlJobStore + 테스트 + 마이그레이션)
**Sources changed:** ~30 (커밋 337d343, 60c2cd2, 51cf54d, ab5f2fa, 0e926c2, 31efdd5, cd81583, b6185b5의 변경 파일)
**Notes:** 맛집 도메인 통합 (DB 영속화 + 다중 크롤 + AI 요약 + SSE 멀티플렉싱)을 incremental로 흡수. 5개 토픽이 영향받음. project-overview / mobile / ai / utils / config는 변경 없음. 신규 컨셉 두 개는 모두 4토픽 이상에 걸쳐 일관되게 등장 — `stream-driven-cache-merge`는 visitor_batch.persistedReviews + summary review/snapshot 이벤트가 모두 같은 "완성된 페이로드 → setQueryData" 모양, `in-memory-singleton-gates`는 ai의 `adapter-cache` + crawl의 JobRegistry+pending 큐 + persistTail Promise 체인 + 클라의 `summarySseManager`가 모두 "외부 큐 없이 모듈 싱글턴 + FIFO" 모양. 토픽별 article 분량은 crawl 134, friendly 191, web 312, shared 215, api-contract 309 lines.

## 2026-05-07 (2nd compile)

**Topics updated:** ai (new), friendly, api-contract, shared, web
**New topics:** ai
**New concepts:** workspace-package-resolution
**Concepts updated:** zod-ssot-buildless (ai instance 추가)
**Sources scanned:** ~145 (이전 126개 + AI 모듈 신규 ~19개)
**Sources changed:** ~25 (AI 통합 커밋 `6fb1515`의 변경 파일 + 마이그레이션 1개)
**Notes:** AI 도메인 추가에 따른 incremental 재컴파일. `ai` 토픽은 `crawl`과 동일한 기준으로 friendly에서 분리(독립 모듈, 8개 src 파일 + 4개 schema/migration). `workspace-package-resolution` 컨셉은 작업 도중 반복적으로 부닥친 `Routes.Ai` namespace 깨짐 + pnpm symlink/inject 함정 + vite extensionAlias 필요성을 cross-cutting 패턴으로 묶은 결과. project-overview/mobile/utils/config/crawl 토픽은 변경 없음.

## 2026-05-07 (initial compile)

**Topics updated:** project-overview, friendly, crawl, web, mobile, api-contract, shared, utils, config
**New topics:** project-overview, friendly, crawl, web, mobile, api-contract, shared, utils, config (initial compile)
**New concepts:** zod-ssot-buildless, sse-token-auth, platform-ui-split
**Sources scanned:** 126 (knowledge files + key source files per topic; deep_scan=false but adapter modules were read where needed for accurate Architecture/API Surface)
**Sources changed:** 126 (first run — all sources are new)
**Notes:** 토픽별 분량 균형 — friendly + crawl + shared + web가 article 분량 상위, utils + config가 하위. crawl을 friendly에서 분리한 이유는 5개 src 파일 + 최근 5개 커밋 모두 crawl 관련이라 모듈 자체가 충분한 양을 차지하기 때문.
