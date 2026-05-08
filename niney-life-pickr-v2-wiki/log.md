# Wiki Compile Log

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
