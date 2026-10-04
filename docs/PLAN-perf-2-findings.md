# 성능 감사 2차 — 발견 전체 (부록)

> 2026-10-05 생성. [PLAN-perf-2.md](PLAN-perf-2.md) 의 부록이다. 스캐너 8 + 묶음별 적대적 검증 8 의 결과 원문을
> 옮겼다(측정·수정 문구는 검증자 기록 그대로). 경로는 `apps/friendly/` 기준. 측정은 dev.db 복사본(bench.db, 3.6GB)과
> 운영형으로 부풀린 전용 사본에서 했고, 다른 에이전트 15개와 동시에 돌아 **절대 시간은 흔들린다** — 계획·쿼리 수·
> 바이트·RSS 를 함께 본다. 측정 스크립트는 `apps/friendly/data/perf2/<묶음>/` 에 있다(gitignore — 로컬 전용).
>
> 표기: `[심각도 · 판정 · 접근 · 수정 규모]`. 판정 확정=bench 실측 있음, 추정=정적 근거만. id 끝의 `V` 는 검증자가 새로 찾은 것.

총 83건 — 확정 74 · 추정 7 · 반박 2

## A — 크롤·백그라운드

### A-1 [MEDIUM · 확정 · admin · S] CrawlService.cache 가 만료 엔트리를 지우지 않아 크롤한 가게마다 NaverPlaceData(리뷰 ≤200건 포함)가 프로세스 수명 내내 상주

- **위치**: `src/modules/crawl/crawl.service.ts:112`, `src/modules/crawl/crawl.service.ts:331`, `src/modules/crawl/crawl.service.ts:1249`, `src/modules/crawl/crawl.route.ts:114`, `src/plugins/random-crawl.ts:38`, `src/modules/auto-discover/auto-discover.route.ts:38`, `src/modules/tour/tour-admin.route.ts:40`
- **트리거**: 어드민 수동 크롤, 자동 발견(잡당 최대 50곳), 랜덤 크롤, 여행로그 등록 등 모든 네이버 크롤 성공
- **측정**: v-memory.ts(gc 강제, 실제 네이버 응답 픽스처 + bench 스냅샷): 리뷰 200건(이미지 786장)+스냅샷 중앙 13KB → 엔트리당 0.33MB(최대 스냅샷 25KB면 0.35MB), 리뷰 200건(이미지 340장) → 0.18~0.20MB, 리뷰 39건 → 0.07~0.10MB. v-baseline.ts: tsx 부팅 직후 RSS 334MB·heapUsed 91MB.
- **검증 근거**: 반박 시도 실패. 코드상 this.cache 사용은 get(crawl.service.ts:331)·set(:1249) 두 곳뿐이고 삭제·상한·sweep 이 없다. 만료 확인은 get 시점 비교뿐이라 30초가 지나도 엔트리가 남는다. 키가 placeId 라 프로세스 수명 동안 '크롤에 성공한 서로 다른 가게 수'만큼 쌓인다. CrawlService 는 4곳(crawl.route.ts:114, plugins/random-crawl.ts:38, auto-discover.route.ts:38, tour-admin.route.ts:40 지연 생성)에서 따로 만들어져 Map 도 4개다. 캐시가 맞는 경우는 같은 인스턴스·create 모드·30초 안 재요청뿐이다. 스캐너의 0.53MB 는 imageUrlsJson 문자열과 파싱한 배열을 함께 담아 이중 계산한 값이었다. 실측은 리뷰 200건이 찬 가게 기준 0.18~0.35MB 다. 성장량은 가게 100곳당 18~35MB, 자동 발견 잡 1회(최대 50곳)당 9~17MB, 1,000곳이면 180~350MB 다. 부팅 직후 RSS(tsx 334MB) 대비 500MB 여유는 약 170MB 라, 재배포 없이 수백 곳을 크롤하면 강제 재시작에 닿는다. 기준의 'MEDIUM: 느리게 쌓이는 무한 증가'에 해당해 MEDIUM 을 유지한다.
- **수정**: 유효하다. 모듈 스코프 `new LRUCache({ max: 20~50, ttl: 30_000, ttlAutopurge: true })`(lru-cache 11 이 이미 의존성에 있음)로 바꾸면 상한이 50×0.35MB ≈ 17MB 로 묶이고, 4개 인스턴스가 공유해 적중률도 오른다. 캐시 가치가 낮아(30초 안 create 재요청만, 진행 중 중복은 findInFlightByPlace 가 이미 막음) 제거하는 것도 선택지다. 더 근본적으로는 CrawlService 를 app 싱글톤으로 하나만 두고 app.summaries 를 주입하면 A-1(캐시 4벌)·A-3(요약/검색 배선 분리)·A-V1(대기열 분리)이 한 번에 해결된다. 스키마 변경 없음.

### A-2 [LOW · 확정 · admin · S] 방문자 리뷰 페이지네이션이 GraphQL 원본 응답을 2벌(captured+paginationBodies) 크롤 끝까지 보관하고, 잡 이벤트도 리뷰 본문을 2벌 보관

- **위치**: `src/modules/crawl/adapters/naver-place.playwright.adapter.ts:1414`, `src/modules/crawl/adapters/naver-place.playwright.adapter.ts:1435`, `src/modules/crawl/adapters/naver-place.playwright.adapter.ts:1641`, `src/modules/crawl/adapters/naver-place.playwright.adapter.ts:1717`, `src/modules/crawl/adapters/naver-place.playwright.adapter.ts:1732`, `src/modules/crawl/crawl.service.ts:1160`, `src/modules/crawl/job-registry.ts:20`, `src/modules/crawl/job-registry.ts:187`
- **트리거**: 리뷰가 많은 가게(기본 CRAWL_VISITOR_MAX_PAGES=100) 크롤. actor당 최대 5잡 동시, actor 는 어드민·system:random-crawl 등으로 여럿
- **측정**: v-memory.ts, 픽스처 visitor-1937120968(리뷰 응답 54페이지·2.2MB): captured 2.91MB + paginationBodies 2.91MB = 5.82MB → 페이지당 0.11MB, 100페이지 ≈ 10.8MB(절반이 중복). 페이지당 동기 파싱 0.21ms, 종료 merge 9.8ms. 레지스트리 이벤트: persistedReviews 추가분은 리뷰당 258B(리뷰 객체 1,258B 대비 약 20%)로, 507건에 0.12MB다. 실제로 깊은 복사 2벌이었다면 1.34MB 였을 것.
- **검증 근거**: 두 부분으로 나눠 검증했다. (1) 어댑터 쪽 중복은 사실이다. captured 리스너(naver-place.playwright.adapter.ts:1435)가 리뷰 응답을 포함한 graphql JSON 을 모두 파싱해 보관하고, 페이지 루프는 같은 응답을 wireResponse.json() 으로 다시 파싱해 paginationBodies(:1641)에 넣는다. 다만 실측은 100페이지 크롤당 약 10.8MB(스캐너 추정 19MB 의 절반)이고, 크롤이 끝나면 해제되는 일시 힙이다. actor 당 동시 5개가 상한이라 최악 약 54MB, 그중 중복분은 약 27MB 다. 이벤트 루프 영향은 없다. (2) 레지스트리 이벤트 '리뷰 본문 2벌' 주장은 반박된다. persistReviewBatch 의 newReviews 와 emit 의 persistedReviews 가 body·imageUrls 문자열과 배열을 참조로 공유한다. 그래서 늘어나는 것은 래퍼 객체와 id·fetchedAt 문자열뿐이고, 완료 잡당 약 1.5MB 를 5분 보관하는 수준이다. 일시적이고 상한이 있는 소비라 LOW 로 내린다.
- **수정**: (1)은 유효하고 싸다. 리뷰 응답을 captured 에 넣지 않거나(이미 있는 isVisitorReviewsGraphqlPostData 로 판별) paginationBodies 를 없애 한 벌만 두면 일시 힙이 절반으로 준다(100페이지 기준 약 5.4MB 절감). 더 나아가 merge 용으로 앞 200건만 누적하면 페이지 원본을 보관할 필요가 없어 약 0.25MB 로 줄어든다. (3) visitor_batch 이벤트에서 reviews 를 빼자는 제안은 효과가 리뷰당 258B 라 불필요하다. 웹이 소비하는 계약을 바꾸는 비용이 더 크다. 스키마 변경 없음.

### A-3 [LOW · 확정 · background · S] random-crawl·auto-discover 가 SummaryService/ReviewSearchService 를 따로 조립해, 요약 중지·enrich 중복 가드·코퍼스 캐시 무효화·enrich 완료 시 군집화 체인이 앱 싱글톤과 공유되지 않음

- **위치**: `src/plugins/random-crawl.ts:30`, `src/plugins/random-crawl.ts:31`, `src/modules/auto-discover/auto-discover.route.ts:30`, `src/modules/auto-discover/auto-discover.route.ts:31`, `src/plugins/summaries.ts:38`, `src/modules/review-search/review-search.service.ts:88`, `src/modules/review-search/review-search.service.ts:173`
- **트리거**: 텔레그램·cron 랜덤 크롤, 어드민 자동 발견(잡당 최대 50곳)으로 등록된 가게의 요약과 enrich
- **측정**: v-routes.ts 런타임 확인: app.randomCrawl 의 CrawlService.summaries === app.summaries → false, 그 SummaryService 의 reviewSearch === app.reviewSearch → false, enrichListeners 개수는 app=1, random-crawl=0. LLM 중복 비용은 실측하지 않았다(호출 금지).
- **검증 근거**: plugins/random-crawl.ts:30-36 과 auto-discover.route.ts:30-36 이 각자 ReviewSearchService 와 SummaryService 를 만든다. 군집화 트리거는 plugins/summaries.ts:40 의 app.reviewSearch.onEnrichProgress 와 기동 리컨실(:46) 두 곳뿐이다(grep 으로 확인). 그래서 랜덤 크롤과 자동 발견(잡당 최대 50곳)으로 등록된 가게는 enrich 가 끝나도 다음 재시작 전까지 군집화가 '대기'로 남는다. 메모리 '군집 대기 잔존 수정'(1f5ed30)이 이 두 경로로 다시 나타나는 셈이다. 성능 측면에서는 두 가지다. 어드민 '요약 중지'(app.summaries.cancelledPlaces)가 이 체인에는 먹지 않아 LLM 호출이 계속된다. enriching 가드가 인스턴스별이라 같은 가게를 동시에 enrich 하면 LLM·임베딩 호출이 중복된다. 둘 다 취소하거나 동시 enrich 가 겹칠 때만 생겨 빈도가 낮으므로 성능 심각도는 LOW 로 둔다. 다만 기능 결함(군집 대기 재발)이 확실해 우선 수정을 권한다.
- **수정**: 유효하다. random-crawl 플러그인은 dependencies 를 ['prisma','logs'] 에서 'summaries' 까지 넣은 뒤 app.summaries 를 쓰고, auto-discover 라우트도 app.summaries 를 직접 쓴다. 따로 만들던 ReviewSearchService 는 없앤다. CrawlService 싱글톤화와 묶으면 A-1·A-V1 도 함께 해결된다. 스키마 변경 없음.

### A-4 [LOW · 확정 · admin · S] GET /admin/crawl/jobs 가 완료 잡의 result.data(스냅샷+리뷰 ≤200건)를 통째로 돌려주는데, 웹이 진행 중 패널마다 8초 폴링

- **위치**: `src/modules/crawl/crawl.route.ts:698`, `src/modules/crawl/job-registry.ts:149`, `src/modules/crawl/job-registry.ts:163`, `packages/shared/src/hooks/useCrawl.ts:597`
- **트리거**: 어드민이 크롤 패널을 열어 둔 채 여러 잡 진행(발견 페이지에서 다중 선택 후 일괄 시작이 정상 사용 패턴)
- **측정**: v-routes.ts 실제 라우트(zod 응답 검증·직렬화 포함), 앱 jobRegistry 에 리뷰 200건 픽스처 완료 잡을 주입: 1개 7.1ms·307KB, 5개 15.9ms·1.2MB, 10개 33ms·2.3MB(이벤트 루프 최대 52ms).
- **검증 근거**: list() 가 toPublic 으로 result 전체(NaverPlaceData + 리뷰 ≤200)를 싣는 것을 확인했다. 실측치는 스캐너 값(10잡 1.2MB·14ms)보다 크다(이미지가 많은 실제 픽스처 기준). 웹 폴백 폴링은 같은 queryKey 를 써서 패널 수와 무관하게 8초에 1회이고, 잡이 terminal 이 되면 멈춘다. 어드민 전용이고 33ms 점유라 LOW 를 유지한다.
- **수정**: 주의할 점이 있다. useCrawl 폴백이 목록의 job.result 로 'done' 이벤트를 합성하고, AdminCrawlTestPage 는 placeData.visitorReviews 를 그린다. 그래서 data 를 통째로 빼면 폴백 경로가 깨진다. 선택지 (a): 목록 응답에서 result.data.visitorReviews 만 비운다. 서버만 바꾸면 되고 잡당 약 15KB 가 되며, 폴백으로 합성될 때 리뷰 목록만 비는 정도다. 선택지 (b): 목록은 상태 요약만 내리고, 폴백은 SSE 재연결(afterSeq)로 완료 잡의 'done' 을 다시 받는다(완료 잡이 5분 보관되므로 가능). (b)는 계약 변경이 필요해 노력 M 이다.

### A-V1 [LOW · 확정 · admin · S] CrawlService 대기열(pending)이 인스턴스마다 따로라, 다른 인스턴스 잡이 actor 슬롯 5개를 쓰는 동안 대기열에 들어간 크롤이 영영 시작되지 않음(자동 발견 잡 무한 대기)

- **위치**: `src/modules/crawl/crawl.service.ts:126`, `src/modules/crawl/crawl.service.ts:418`, `src/modules/crawl/crawl.service.ts:432`, `src/modules/crawl/crawl.service.ts:1073`, `src/modules/crawl/crawl.service.ts:1094`, `src/modules/auto-discover/auto-discover.service.ts:642`, `src/modules/auto-discover/auto-discover-registry.ts:66`, `src/modules/tour/tour-admin.service.ts:212`
- **트리거**: 자동 발견 잡(또는 여행 시드 등록)이 도는 중에 같은 어드민이 크롤 화면에서 수동 크롤 4~5개 이상을 시작한 경우. 발견 페이지의 정상 사용 패턴인 '다중 선택 후 일괄 시작'과 자동 발견을 함께 쓰면 생긴다.
- **측정**: v-queue.ts: Y 의 잡 phase=queued status=running stage=queued, X 잡 종료 후 slots 0/5·hasSlot=true 인데 Y.pending=1 유지.
- **검증 근거**: 슬롯 계산(jobRegistry.hasSlotForActor)은 모듈 싱글톤을 공유하지만, 대기열 this.pending 과 flushQueue 는 인스턴스 필드다. 잡이 끝나면 runJob.finally 가 자기 인스턴스의 flushQueue 만 부른다. CrawlService 는 크롤 라우트·자동 발견·여행 어드민(어드민 actor 공유)·랜덤 크롤 4곳에서 따로 생성된다. v-queue.ts 재현(Playwright·DB 없음): 인스턴스 X 로 슬롯 5/5 를 쓰는 중 인스턴스 Y 의 startCrawl 이 {queued:true} 를 받았다. X 의 잡 5개를 끝내고 X.flushQueue 를 부르자 슬롯은 0/5 로 비었지만, Y 의 잡은 phase=queued 그대로였다(X.pending=0, Y.pending=1). 자동 발견의 waitForCrawlTerminal 에는 타임아웃이 없고, findInFlightByActor 에는 staleness 가드가 없다. 그래서 잡이 무한 대기하고, 새 자동 발견은 재시작 전까지 409 를 받는다. 어드민이 크롤 목록에서 그 잡을 취소하면 풀리지만, 취소는 X 의 pending 만 정리하고 AbortController 도 abort 하지 않는다. 그 결과 Y.pending 에 남은 항목이 나중에 Y 의 슬롯이 비면 취소된 잡의 크롤을 실제로 돌린다(좀비 크롤).
- **수정**: CrawlService 를 app 싱글톤으로 하나만 두거나(plugins 에서 decorate, app.summaries 주입 — A-1·A-3 동시 해결), pending 대기열을 jobRegistry 처럼 모듈 스코프로 올려 모든 인스턴스가 공유하게 한다. 대기열 취소 시 pending 항목을 전역에서 제거하고 abort 도 호출한다. waitForCrawlTerminal 에는 상한 타임아웃(예: 30분)을 둔다.

### A-V2 [LOW · 확정 · admin · S] getRestaurantsStatus 가 done 요약 행 전부를 relation 포함해 읽어 JS 에서 집계 — 어드민 메뉴 정규화 화면과 매일 스케줄에서 done 요약 수에 비례해 느려짐

- **위치**: `src/modules/menu-grouping/menu-grouping.service.ts:954`, `src/modules/menu-grouping/menu-grouping.service.ts:938`, `src/modules/menu-grouping/menu-grouping.route.ts:38`, `src/modules/schedule/schedule.service.ts:321`
- **트리거**: 어드민이 GET /api/v1/admin/analytics/restaurants(메뉴 정규화 화면)를 열 때마다, 그리고 매일 03:00 정규화→머지 스케줄의 collectTargets.
- **측정**: v-status.ts: 네이버 23곳·done 요약 6,136건에서 중앙 104.5ms, 실행당 쿼리 11개, DB 29.7ms(나머지는 Prisma 행 변환과 JS). v-routes.ts 라우트로 재면 95.7ms(attention=true 90.6ms). 같은 집계를 SQL GROUP BY 로 하면 6.3ms(약 16배 빠름). EXPLAIN 은 전부 인덱스 SEARCH 라 비용은 행 수에 선형.
- **검증 근거**: reviewSummary.findMany({ where: { status:'done', review: { restaurantId: { in: ids } } }, select: { review: { select: { restaurantId: true } } } }) 를 Prisma 가 두 단계로 실행한다. 먼저 LEFT JOIN 으로 done 요약 id·reviewId 를 전량 가져오고, 이어 visitor_reviews 를 id IN(약 999개씩) 청크로 다시 조회한다. 그렇게 만든 6,136행을 JS Map 으로 센다. menuMention.groupBy(restaurantId, nameNorm)도 고유한 (restaurantId, nameNorm) 쌍을 전부 돌려받는다.
- **수정**: $queryRaw 로 `SELECT v.restaurantId, COUNT(*) FROM review_summaries s JOIN visitor_reviews v ON v.id = s.reviewId JOIN restaurants r ON r.id = v.restaurantId WHERE s.status = 'done' AND r.source = 'naver' GROUP BY v.restaurantId` 를 실행하고, 고유 메뉴 수도 `COUNT(DISTINCT nameNorm) ... GROUP BY restaurantId` 로 바꾼다. 거대한 IN 목록은 제거한다. 인덱스 추가 불필요.

### A-V3 [LOW · 확정 · admin · S] 메뉴 순위(getRanking)가 글로벌 메뉴를 공유하는 형제 식당마다 menuMention.findMany 를 1회씩 실행(N+1)

- **위치**: `src/modules/menu-grouping/menu-grouping.service.ts:695`, `src/modules/menu-grouping/menu-grouping.service.ts:697`, `src/modules/restaurant/restaurant.route.ts:387`
- **트리거**: 어드민 맛집 상세의 메뉴 순위 섹션(MenuRankingSection → GET /api/v1/admin/restaurants/place/:placeId/menus/ranking).
- **측정**: bench 원본은 글로벌 링크가 0건이라 이 경로가 돌지 않는다(13.4ms·74KB). scratch.db 에 모든 menu_canonicals 를 canonicalNorm 기준 글로벌로 합성 링크했을 때(v-writes.ts W7) 형제 17곳인 가게가 중앙 23.7ms, 실행당 26쿼리(그중 17이 N+1)였다.
- **검증 근거**: siblingsByRestaurant 루프가 형제 식당마다 `menuMention.findMany({ where: { restaurantId, nameNorm: { in } } })` 를 순차 await 한다. 운영은 매일 글로벌 머지가 돌아 공기밥·아메리카노 같은 흔한 메뉴가 많은 가게를 하나의 글로벌로 잇는다. 그래서 N 은 사실상 '그룹핑된 가게 수'에 가까워진다.
- **수정**: 형제 집계를 한 쿼리로 묶는다. 예: `SELECT l.globalCanonicalId, m.sentiment, COUNT(*), COUNT(DISTINCT m.restaurantId) FROM global_menu_canonical_links l JOIN menu_canonicals mc ON mc.id = l.menuCanonicalId JOIN menu_mentions m ON m.restaurantId = mc.restaurantId AND m.nameNorm = mc.nameNorm WHERE l.globalCanonicalId IN (...) GROUP BY 1, 2`. menu_mentions(restaurantId, nameNorm) 인덱스가 이미 있어 인덱스 추가는 필요 없다.

### A-6 [LOW · 추정 · admin · S] 테이블링 bulk-save 와 메뉴 그룹핑 잡에 동시 실행 상한·상호배제가 없음(다이닝코드만 actor당 1잡)

- **위치**: `src/modules/crawl/crawl.route.ts:383`, `src/modules/crawl/tabling-bulk-save-registry.ts:38`, `src/modules/menu-grouping/menu-grouping.route.ts:46`, `src/modules/schedule/schedule.service.ts:205`
- **트리거**: 어드민이 테이블링 일괄 저장을 여러 번 시작하거나, 메뉴 그룹핑 잡과 스케줄(정규화→머지) 회차가 같은 가게를 동시에 처리
- **측정**: 코드 diff 로만 확인(외부·LLM 호출 금지).
- **검증 근거**: tabling-bulk-save-registry.ts 에는 activeJobIdFor·STALE 가드가 없고, POST tablingBulkSaveJobs 핸들러(crawl.route.ts:376-396)에도 409 가 없다. diningcode 쪽(crawl.route.ts:541)과 비대칭이다. menu-grouping 잡 생성(menu-grouping.route.ts:46)에도 actor·가게 가드가 없고, MenuGroupingJobInput.placeIds 에는 max 조차 없다. schedule.collectTargets 는 크롤 중인 가게만 건너뛴다. groupForRestaurant 의 DB 반영은 deleteMany+createMany 단일 트랜잭션이라 데이터가 깨지지는 않는다(마지막 쓰기가 이김). 낭비되는 것은 LLM·외부 API 중복 비용뿐이고, 어드민이 반복 조작해야 생기므로 빈도가 낮다.
- **수정**: 유효하다. tabling 은 diningcode 의 activeJobIdFor(30분 staleness)와 409 를 그대로 옮긴다. 메뉴 그룹핑은 모듈 스코프 inFlightPlaces Set 을 두어 같은 placeId 가 진행 중이면 건너뛰게 하고(스케줄·잡 공통), 잡 생성에 actor 당 1잡 가드와 placeIds 상한(api-contract zod)을 더한다. DB 스키마 변경 없음.

### A-7 [LOW · 추정 · admin · S] Chromium 3개(네이버 stealth·캐치테이블 검색·캐치테이블 상세)가 첫 사용 뒤 영구 상주하고, 네이버 브라우저는 크래시·런치 실패 후에도 재생성되지 않음

- **위치**: `src/modules/crawl/adapters/naver-place.playwright.adapter.ts:140`, `src/modules/crawl/adapters/catchtable-search.playwright.adapter.ts:99`, `src/modules/crawl/adapters/catchtable-shop.playwright.adapter.ts:149`
- **트리거**: 크롤 1회 이후 상시, 캐치테이블 테스트 페이지 1회 사용 이후 상시
- **측정**: Playwright 실행 금지로 RSS·크래시 복구를 실측하지 못했다. 코드 확인만 했다.
- **검증 근거**: 세 어댑터 모두 browserPromise 를 모듈 변수에 캐시하고 onClose 에서만 닫는다(idle 종료 없음). 캐치테이블 검색은 워밍한 페이지까지 상주시킨다. 네이버 getBrowser(naver-place.playwright.adapter.ts:144)는 launch 가 reject 되거나 브라우저가 disconnected 된 뒤에도 browserPromise 를 비우지 않는다. 그래서 한 번 실패하면 이후 모든 크롤(수동·자동 발견·랜덤·여행)이 재시작 전까지 실패한다. Chromium 은 자식 프로세스라 pm2 max_memory_restart(메인 pid RSS 기준)에는 잡히지 않지만 서버 RAM 을 상시 점유한다. 실질 위험은 메모리보다 가용성이다.
- **수정**: 유효하다. `browser.on('disconnected', () => { browserPromise = null })` 를 달고, launch 실패 시 catch 에서 null 로 되돌린다. 캐치테이블 두 어댑터는 마지막 사용 후 N분 idle 타이머로 닫거나 브라우저 하나를 공유한다. 스키마 변경 없음.

### A-8 [LOW · 추정 · background · S] HTTP 어댑터가 호출자 signal 을 받으면 자체 타임아웃(5~8초)을 끄기 때문에, random-crawl·auto-discover 검색은 undici 기본(약 300초)까지 매달릴 수 있음

- **위치**: `src/modules/crawl/adapters/naver-search.http.adapter.ts:235`, `src/modules/crawl/adapters/naver-review-stats.http.adapter.ts:119`, `src/modules/random-crawl/random-crawl.service.ts:911`, `src/modules/random-crawl/random-crawl.service.ts:926`, `src/modules/auto-discover/auto-discover.service.ts:669`
- **트리거**: 네이버 검색이나 리뷰통계 업스트림이 응답을 늦게 주는 상황에서 cron·텔레그램 랜덤 크롤 또는 자동 발견 실행
- **측정**: 코드 확인만(외부 호출 금지).
- **검증 근거**: naver-search.http.adapter.ts:235 와 naver-review-stats.http.adapter.ts:119 는 signal 을 받으면 자체 타임아웃 컨트롤러를 만들지 않는다. random-crawl(:911, :926)은 레지스트리 signal 을, auto-discover(:669)는 잡 signal 을 넘기므로 이 경로들만 타임아웃이 없다. Node 24 내장 fetch(undici)의 기본 headersTimeout·bodyTimeout 300초까지 매달릴 수 있다. 그동안 randomCrawlRegistry.isActive() 상태라 cron·텔레그램 회차가 '이전 회차 진행 중'으로 건너뛰어진다. 추가로, signal 이 없을 때도 clearTimeout 이 fetch(헤더 수신) 직후 finally 에서 실행돼 res.json() 본문 읽기는 타임아웃 밖에 있다. 자원 소모는 작다.
- **수정**: 유효하다. `signal: AbortSignal.any([options.signal, AbortSignal.timeout(FETCH_TIMEOUT_MS)].filter(Boolean))` 로 외부 취소와 타임아웃을 합성한다(Node 24 지원). AbortSignal.timeout 을 쓰면 본문 읽기까지 자연히 덮인다. 스키마 변경 없음.

## B — 맛집 요청 경로

### B-1 [HIGH · 확정 · public · M] 공개 맛집 목록(getPublicList)이 매 요청 전 ReviewSummary 를 Prisma 관계 select 로 읽어 운영 규모에서 1.4s

- **위치**: `src/modules/restaurant/restaurant.service.ts:1507`, `src/modules/restaurant/restaurant.service.ts:1360`, `src/modules/restaurant/restaurant.route.ts:103`
- **트리거**: GET /api/v1/restaurants/public (q 없이 — 맛집 페이지 진입, SmartPickSection, 일상지도 LifeTourCard 의 bbox 이동마다)
- **측정**: bench(naver 23·요약 6.2k·임베딩 0): 서비스 107.8ms/13쿼리, 라우트 limit60 71.8ms·limit200 83.6ms. 구성요소: 관계 select 83.3ms/8쿼리 vs 같은 결과의 SQL 집계 12.4ms/1쿼리. 전용 scratch(×10, done 요약 전부에 12.8KB 임베딩 = 운영형, naver 230·요약 62k): 서비스 1,404ms/68쿼리(관계 select 본쿼리 550ms + visitor_reviews id IN 청크 61개), 라우트 limit60 1,592ms·limit200 1,459ms(129KB)·LifeTourCard(bbox, limit12) 791ms. 동시 5건이면 각 3.0s, 10건이면 각 5.4s. RSS: raw 관계 select 1건 in-flight 171→328MB(+157MB), 동시10×30 peak 1,755MB / SQL 집계로 바꾸면 peak 174MB. 앱 GET list 동시10×30: peak 2,162MB, 끝난 뒤 780MB(기준 385MB). 순차 10회만으로 381→486MB(peak 549). (Windows 개발기, 다른 에이전트 동시 실행 중)
- **검증 근거**: 반박 시도: 캐시·상한 없음 확인, bbox 는 스냅샷 파싱 뒤 JS 에서 걸러지고 요약 집계만 bbox 뒤 id 로 좁혀진다. 데이터 규모 가정(×10≈운영 273곳)은 메모리 기록과 맞는다. 호출 빈도는 스캐너 추정보다 높다. HomePage 의 SmartPickSection 이 홈 방문마다 `?limit=200` 을 부르고, RestaurantsPage/V2(bbox), 일상지도 LifeTourCard, 정산·투표·앱 피커 검색, AdminDiscoverPage 가 모두 이 경로를 쓴다. 지연(1.4~1.6s)만으로도 HIGH 인데, 더 큰 위험은 메모리다. 요청 1건당 Prisma 엔진이 6만 행을 실체화하면서 RSS 가 약 160MB 오르고, 동시 몇 건만 겹쳐도 pm2 500MB 상한을 넘는다. 무인증·global 1000/분이라 한 IP 로 재시작을 유발할 수 있다. 이벤트 루프는 요청당 최대 65ms 막히고, 그 사이 다른 가벼운 요청(category-tree)은 5ms 로 정상이었다. 피해는 DB·엔진·메모리 쪽에 집중된다.
- **수정**: (1) 어드민 list() 식 SQL 집계(1쿼리)로만 바꿔도 475~513ms(약 2.7배)이고 RSS 는 거의 늘지 않는다. (2) 커버링 인덱스 review_summaries(reviewId,status,sentiment,sentimentScore,satisfactionScore) 3.6MB와 visitor_reviews(restaurantId,id) 3.9MB를 둔다. 6만 행 기준 각각 약 120ms 면 만들어진다. 플래너는 기본으로 unique 인 review_summaries_reviewId_key 를 고르므로 `INDEXED BY` 로 강제해야 하고, 그러면 완전 인덱스 전용 40ms(CLI)다. 쓰기 증폭은 요약 status 갱신·리뷰 insert 때 작은 인덱스 2개가 갱신되는 정도로 미미하다. 마이그레이션은 필요하지만 백필은 없다. (3) 필터 전 베이스(가게 행 230~273개 + 3출처 합산 집계 + tour)를 TTL 30~60s 캐시에 in-flight 합류와 함께 두면 요청당 5ms 미만이다. q/category 를 JS 로 옮길 때는 SQLite LIKE 의 ASCII 대소문자 무시 의미를 맞춰야 한다. AdminDiscoverPage 가 summary* 필드를 SSE 로 패치하므로 TTL 만큼의 지연은 허용 가능하다. summaryEventsBus 는 청크마다 발행하므로 무효화 트리거로 쓰면 효과가 떨어진다. TTL 위주로 가고 크롤 upsert·merge 때만 무효화를 권장한다. DEFERRED #4 재평가 결론: 비정규화나 스키마 변경 없이 해결된다.

### B-2 [HIGH · 확정 · public · S] 무인증 공개 스마트픽이 전 가게 done 요약을 관계 select 로 로드 — 운영 규모 1.2s, 60/분 허용

- **위치**: `src/modules/restaurant/restaurant.service.ts:2683`, `src/modules/restaurant/restaurant.route.ts:191`, `src/plugins/rate-limit.ts:37`
- **트리거**: POST /api/v1/restaurants/public/smart-pick {strategy} (candidatePlaceIds 없음 = 전 가게) — 홈 '오늘 뭐 먹지?' 재굴리기
- **측정**: bench: 서비스 77.5ms/10쿼리, 라우트 72.1ms. scratch(운영형): 서비스 1,141ms/60쿼리, 라우트 1,398ms. 앱 POST smart-pick 동시10×30: peak RSS 1,558MB, 끝난 뒤 571MB(기준 366MB). SQL 집계(done, GROUP BY) 489ms, 커버링 인덱스 2개 뒤 39.7ms.
- **검증 근거**: 반박 실패. RATE.publicPick 주석의 'DB 2쿼리로 싸지만'은 사실과 다르다(10~60쿼리). 웹 SmartPickSection 은 굴릴 때마다 홈 목록(최대 200곳)을 candidatePlaceIds 로 보내므로 정상 사용도 거의 전체 비용이다. 공격자는 후보를 빼면 전 가게를 대상으로 만들 수 있다. 무인증 POST 60/분/IP 이고, 동시 10건이면 RSS 가 1.5GB 를 넘는다.
- **수정**: status='done' 조건이 있어 플래너가 커버링 인덱스를 자동 선택한다(INDEXED BY 불필요). SQL 집계만으로 489ms, 인덱스까지 두면 40ms. B-1 의 집계 캐시를 재사용하면 smartPick 은 메모리 가중 추첨(~1ms)만 남는다. RATE 주석도 실제 비용에 맞게 고칠 것. 스키마 변경은 없다(인덱스는 선택).

### B-3 [HIGH · 확정 · public · S] 공개 상세·리뷰 페이지가 리뷰마다 summary 전 컬럼(embeddingJson ~14KB)을 로드하고 페이지마다 전량 재조립

- **위치**: `src/modules/restaurant/restaurant.service.ts:1958`, `src/modules/restaurant/restaurant.service.ts:1969`, `src/modules/restaurant/restaurant.service.ts:1985`, `src/modules/restaurant/restaurant.service.ts:1826`, `src/modules/restaurant/restaurant.service.ts:2518`
- **트리거**: GET /api/v1/restaurants/public/:placeId, GET /api/v1/restaurants/public/:placeId/reviews?offset=…(스크롤·필터마다), 어드민 상세
- **측정**: bench(임베딩 0, 516건): 상세 라우트 30.3ms/9쿼리(62KB), 리뷰 페이지 28.3ms. scratch(done 요약 전부 임베딩): 상세 1,032건 가게 라우트 126.5ms(서비스 137ms/10쿼리, 응답 58KB인데 DB→JS 15.3MB), 516건 64.7ms, 리뷰 페이지(1,032건) 137ms. raw 비교: include summary:true 149.9ms/15.3MB, summary select 9컬럼 63.2ms/1.7MB, finishedAt 까지 뺀 8컬럼 54.1ms. RSS: include 1건 in-flight +163MB(173→336) vs select +14MB. 동시10×30: include peak 1,406MB/끝난 뒤 875MB vs select 335/277MB. 앱 GET 상세 동시10×30 peak 1,852MB/끝난 뒤 978MB(기준 357MB). 앱 순차 20회만으로 358→578MB(peak 693). 같은 부하를 bench(임베딩 0)에서 돌리면 peak 474MB.
- **검증 근거**: 스캐너는 MEDIUM 이었으나 상향한다. 운영은 요약 종료 훅(executeRun 끝 → ensureEnrichedByRestaurantId)이 자동 enrich 하므로 done 요약 거의 전부가 12.8KB 임베딩을 갖는다. 그 상태에서 상세 진입과 리뷰 탭 스크롤마다 수 MB~15MB 를 Prisma 엔진과 JS 로 실체화한다. 순차 접속만으로 RSS 가 500MB 를 넘으니 pm2 재시작 위험 기준(HIGH)에 해당한다. 어드민 getDetailByPlaceId(2518)도 같은 패턴이다(148ms, 15MB 로드).
- **수정**: summary 를 9컬럼 select(status·text·sentiment·sentimentScore·satisfactionScore·menusJson·tipsJson·keywordsJson·finishedAt)로 바꾼다. raw 2.4배 빨라지고 동시 부하 RSS 는 1/4 수준이 된다. toPublicReview 시그니처와 그대로 호환된다. 주의: finishedAt 은 테이블에서 embeddingJson 뒤에 있어 여전히 오버플로 페이지를 걷는다(+9ms/1,032건). 완전히 없애려면 임베딩을 별도 1:1 테이블로 분리해야 한다(스키마+백필이라 비권장, 현 수정으로 충분). 어드민 상세도 select(model·errorCode·errorMessage·startedAt 추가)로 같은 수정을 한다. 선택 사항: placeId 단위 조립 결과 LRU(30~60s)를 두면 리뷰 페이지네이션이 slice 만 하게 된다. 스키마 변경은 없다.

### B-4 [HIGH · 확정 · public · M] 공개 리뷰 질문(publicAsk)에 일일·전역 LLM 한도와 답변 캐시가 없음 — IP당 분당 15회×LLM 3콜

- **위치**: `src/modules/review-search/review-search.route.ts:148`, `src/modules/review-search/review-search.service.ts:516`, `src/modules/review-search/review-search.service.ts:394`, `src/plugins/rate-limit.ts:40`
- **트리거**: POST /api/v1/restaurants/:placeId/qa {query} — enrich 된 아무 가게, 무인증
- **측정**: LLM·임베딩 호출 금지 규칙 때문에 globalThis.fetch 를 즉시 응답하는 로컬 스텁으로 바꿔 계측했다(외부 호출 0). 질문 1건 = embed 1 + chat 3(리랭크·답변·검증), chat 프롬프트 합 약 7,192자. 서버 로컬 비용은 코퍼스 캐시 히트 14.6ms, 미스(1,032건) 111ms(이벤트루프 67ms 블로킹). review-search 에 usageQuota 사용 0건(grep), 답변 캐시 없음. chatJson 은 fetchWithTimeout 을 직접 부른다.
- **검증 근거**: 반박 실패. 라우트 방어는 RATE.publicAsk 15/분/IP 뿐이다. 한 IP 로 하루 21,600건 = chat 64,800콜(프롬프트 약 1.5억 자)이 가능하다. chatJson 이 ollama-cloud 어댑터를 거치지 않아 계정 ConcurrencyGate 와 텔레메트리를 우회한다. 그래서 몰리는 공개 질문이 게이트를 지키는 요약·enrich 호출의 계정 동시성을 잠식해 429 를 유발할 수 있다. 질의 임베딩은 로컬 Ollama 라 같은 호스트 CPU 도 쓴다. 웹 AskTab 에 고정 예시 칩이 29개 있어 답변 캐시 적중 여지가 크다. 동시성 게이트 통일은 직전 감사 #8(DEFERRED)이고, 일일·전역 예산과 답변 캐시는 미보고 신규다.
- **수정**: (1) UsageQuotaFeature enum 에 'review-ask' 추가 + USAGE_QUOTA_DEFAULTS 추가. usage_quota_settings.feature 는 문자열이라 마이그레이션이 없다. 라우트에 tarot 패턴(게스트·IP·전역 일일)을 적용하고, 웹이 거부 안내를 처리해야 한다. (2) (primaryId, 정규화 질의, 코퍼스 버전 = enrich 수 또는 최대 updatedAt) 키로 답변 LRU 10~30분 + in-flight 합류를 둔다. 예시 칩은 대부분 히트한다. (3) chatJson 을 어댑터 경유(게이트+텔레메트리)로 바꾸거나 로컬 세마포어(예: 4)를 둔다. (3)은 DEFERRED #8 과 겹친다. 스키마 변경은 없다.

### B-5 [MEDIUM · 확정 · public · S] 공개 랭킹 캐시 키에 minMentions(0~1000)가 그대로 들어가 4,004개 키로 캐시 우회·상주

- **위치**: `src/modules/restaurant/restaurant.service.ts:2099`, `src/modules/restaurant/restaurant.service.ts:2223`, `src/modules/restaurant/restaurant.service.ts:2238`, `packages/api-contract/src/schemas/restaurant.ts:495`
- **트리거**: GET /api/v1/restaurants/ranking?minMentions=N&sort=…&excludeNeutral=… 를 N 바꿔 가며 호출
- **측정**: bench 미스 9.3ms/2쿼리. scratch(운영형): 미스 서비스 165ms, 라우트 217ms. EXPLAIN 은 SCAN rs + USE TEMP B-TREE FOR GROUP BY. 임베딩 때문에 leaf 페이지가 16,263개로 늘어(bench ×10 추정 약 5,100) 스캔이 무거워졌다. minMentions 0..199 키 200개를 돌리면 33.7s(미스당 168.5ms), GC 후 +9.2MB 상주. 전체 키(4,004)를 채울 때 상한은 Σ(min(t,1000)+1)×4 = 214,756행 ≈ 64MB 다.
- **검증 근거**: 반박 실패. invalidateRankingCache 는 운영 코드에서 호출하는 곳이 0이다. 만료 항목은 같은 키를 다시 요청할 때만 지워지므로 채운 메모리가 재시작까지 남는다. 무거운 GROUP BY 결과는 파라미터와 무관한데 키마다 다시 계산한다.
- **수정**: GROUP BY 결과와 가게 메타만 단일 키 60s 캐시 + in-flight 합류로 두고, minMentions/excludeNeutral/sort 필터·정렬은 요청마다 메모리에서 한다(행 230~273개, 1ms 미만). 커버링 인덱스는 미스 비용을 164→107~124ms 로만 낮추므로(visitor_reviews 조회가 남음) 주 수정은 캐시다. 스키마 변경은 없다.

### B-7 [MEDIUM · 확정 · background · S] 군집화가 임베딩을 메인 스레드에서 JSON.parse 후 다시 JSON.stringify 해 Python 에 전달

- **위치**: `src/modules/review-clustering/review-clustering.service.ts:104`, `src/modules/review-clustering/review-clustering.service.ts:137`
- **트리거**: enrich 완료 이벤트 → 자동 군집화, 기동 60s 후 리컨실(미군집 가게 순차), 어드민 run
- **측정**: scratch, 1,032건 가게(문서 999~1,045): loadDocs 파싱 25~40ms + runPython 페이로드 JSON.stringify 69~77ms(10.8MB). 504건 가게는 합계 약 50ms. 원문 문자열 이어붙이기 대안은 9.6ms(파싱 0), raw 로드 72.6ms vs loadDocs 94.7ms.
- **검증 근거**: 스캐너의 LOW 를 상향한다. loadDocs 가 반환되면 runForRestaurant 의 await 가 마이크로태스크로 곧바로 재개되고 runPython 본문이 동기라서, 파싱과 stringify 가 한 매크로태스크로 이어진다. 큰 가게는 약 100~115ms 연속 블로킹이다. 경로가 백그라운드(enrich 완료 → 자동 군집, 기동 리컨실 순차, 버전↑이면 전 가게)라 HIGH 는 아니다.
- **수정**: embeddingJson 원문을 파싱 없이 이어 붙여 페이로드를 만든다. negScore 와 영속 aspects 에 필요한 aspectsJson(작음)만 파싱하고, 빈 벡터 판정은 `embeddingJson !== '[]'` 로 대체한다. Python 입력 형태는 그대로라 스크립트 수정이 없다. 스키마 변경은 없다.

### B-8 [MEDIUM · 확정 · public · S] 질문 코퍼스 LRU 가 개수(max 16) 기준이라 큰 가게가 몰리면 메모리 상한이 없음

- **위치**: `src/modules/review-search/review-search.service.ts:88`, `src/modules/review-search/review-search.service.ts:544`
- **트리거**: 서로 다른 enrich 가게 16곳 이상에 공개 질문(POST /restaurants/:placeId/qa) — 15/분/IP 로 1~2분이면 채움
- **측정**: scratch: 리뷰 많은 상위 16곳(7,915건) 코퍼스를 LRU 에 채우면 GC 후 상주 92.9MB(12.0KB/건). 로드는 중앙 47ms, 최대 108ms. 미스 1건의 동기 구간은 코퍼스 파싱 32~38ms + BM25 구축 11~18ms(1,032건). 1,000건급 가게 16곳이면 약 190MB 로 추정. cosine 은 number[] 와 Float32Array 모두 1~6ms 로 차이 없음.
- **검증 근거**: 스캐너의 LOW 를 상향한다. TTL 이 없어 공격 없이 정상 질문만으로도 16곳 코퍼스가 영구 상주한다. 무인증 15/분/IP 로 1~2분이면 큰 가게 위주로 채울 수 있고, 17곳 이상을 돌리면 매 요청 재로드(약 50ms 블로킹)한다. 앱 기준 RSS(약 330~385MB, Windows test 모드)를 생각하면 500MB 상한에 기여한다. 스캐너의 'Float32Array 면 cosine 도 빨라짐'은 실측으로 반박된다(동일 속도). 메모리 절반 효과는 유효하다.
- **수정**: lru-cache maxSize(예: 48MB) + sizeCalculation(items×12KB) + ttl 30분을 둔다. 현재 createRequire 호환 래퍼가 v7/v10 둘 다 지원하는지 생성자 옵션을 확인해야 한다. vec 를 Float32Array 로 보관하면 벡터당 8KB→4KB 다. 스키마 변경은 없다.

### B-6 [LOW · 확정 · background · S] review-clustering countEnrichedByRestaurant 가 enriched 요약 전 행을 관계 select 로 로드(직전 감사가 고친 review-search 쌍둥이의 미수정본)

- **위치**: `src/modules/review-clustering/review-clustering.service.ts:507`, `src/modules/review-clustering/review-clustering.service.ts:418`
- **트리거**: 어드민 군집 상태(GET /admin/review-clustering/status), cluster-pending, 기동 60s 후 scheduleStartupReconcile
- **측정**: scratch(임베딩 6.1만 행): 현재 관계 select 1,134ms/63쿼리, RSS 일시 +165MB(148→313MB). review-search 의 visitorReview.groupBy 판은 229ms/1쿼리.
- **검증 근거**: 반박 실패. 다만 호출자가 어드민과 백그라운드뿐이다. clusterStatus 는 군집 진행 중이면 웹이 5초마다 폴링하고, clusterAllEligibleInBackground 는 어드민 수동 또는 기동 60초 후 1회다. 공개 경로가 아니어서 LOW 를 유지하지만, 기동 직후와 상태 폴링 때 RSS 일시 증가가 B-1/B-3 과 겹칠 수 있다.
- **수정**: review-search.service.ts:305 구현을 공용 헬퍼로 빼서 재사용한다(5배 빠르고 메모리 일시 증가가 사라짐). 스키마 변경은 없다.

### B-9 [LOW · 확정 · public · S] 캐시 가능한 공개 맛집 GET 응답에 Cache-Control/ETag 가 전혀 없음

- **위치**: `src/modules/restaurant/restaurant.route.ts:96`, `src/modules/restaurant/restaurant.route.ts:115`, `src/modules/restaurant/restaurant.route.ts:133`, `src/modules/review-clustering/review-clustering.route.ts:55`
- **트리거**: 공개 목록·상세·리뷰·인사이트·카테고리 트리·랭킹·군집 GET (봇·크롤러·공유 링크 유입 포함)
- **측정**: app.inject 응답 헤더: GET public?limit=60, public/:placeId, ranking, insights 모두 cache-control·etag 가 없다(undefined).
- **검증 근거**: 반박 실패. 보조 수단이다. 홈 SmartPickSection 의 `?limit=200` URL 은 모든 익명 방문자에게 동일해서, 엣지 캐시를 쓰면 B-1 비용 대부분을 흡수할 수 있다.
- **수정**: 공개 GET 에 `public, max-age=30, s-maxage=60, stale-while-revalidate=300` 류 헤더를 단다. Cloudflare 는 JSON 을 기본으로 캐시하지 않으므로 /api/v1/restaurants/public*·ranking·clusters 경로 Cache Rule 이 함께 필요하다. 같은 URL 을 AdminDiscoverPage 도 쓰지만 s-maxage 만큼의 지연은 SSE 패치로 메워진다. 서버 측 B-1·B-3 수정이 1순위다.

## C — 식단

### C-1 [HIGH · 확정 · login · M] 사진 포함 백업/복원이 50MB 사진을 JSON+base64 한 덩어리로 다룸 — 요청 1건에 RSS 약 +260MB, 이벤트 루프 350~470ms 블록

- **위치**: `src/modules/meal/meal-data.service.ts:312`, `src/modules/meal/meal-data.service.ts:462`, `src/modules/meal/meal-data.service.ts:522`, `src/modules/meal/meal.route.ts:206`, `src/modules/meal/meal.route.ts:227`, `src/modules/meal/meal.route.ts:231`
- **트리거**: 로그인 사용자가 GET /api/v1/meals/data/backup(사진 100장 근처) 또는 POST /api/v1/meals/data/backup/restore(본문 최대 75MB)를 호출. 레이트리밋은 IP당 시간당 10회라 동시에 여러 건이 들어올 수 있음(사용자 barrier 는 본문 파싱·zod 검증 뒤에 걸림)
- **측정**: 실라우트 app.inject(스키마 전용 사본 DB, 사용자 1명 기록 100건+사진 100장 39MB, 응답 JSON 52MB): 백업 1건 780~899ms, 이벤트 루프 최대 지연 638~715ms(직렬화 1블록), RSS 피크 +417~523MB(tsx 기준선 352MB→875~978MB), 요청이 끝나고 GC 한 뒤에도 +209MB 잔류. 분해: 서비스 360~396ms(크기검사 JSON.stringify 92~109ms, 서비스 안 최대 블록 131~137ms), serializer safeParse 243~258ms(그중 base64 정규식 221~226ms)+stringify 102~104ms. 다른 사용자 2건 동시: 1,598ms, 루프 654ms, RSS +629MB(352→982MB). 복원(같은 아카이브를 다른 사용자에): 24.0s(사진 100장 sharp 재인코딩 순차), 루프 305ms(본문 JSON.parse 33ms+요청 zod 225~233ms, 대부분 정규식), RSS +235MB, 동시 다른 사용자 쓰기 대기 최대 48ms. 사진 한도 50MB 꽉 채우면 JSON 약 67MB로 비례 증가.
- **검증 근거**: 반박 시도: (1) mealDataArchive 10/시간/IP 는 횟수만 막고 동시성은 막지 않으며, mealMutationBarrier 는 같은 사용자만 직렬화한다 → 다른 사용자(공개 가입이라 한 사람이 계정 여러 개도 가능)의 백업은 병렬로 겹친다. (2) 사진 100장 한도는 사진 기록 한 달 분량이라 일반 사용자 경로다. (3) 코드상 서비스가 크기 검사용 JSON.stringify 를 한 번 하고, 응답 스키마 MealDataBackup 때문에 serializerCompiler 가 safeParse(6.8MB 문자열마다 base64 정규식)한 뒤 다시 JSON.stringify 한다. 기록에 한글이 있어 V8 결과 문자열이 2바이트 표현이 되므로 52MB JSON 이 문자열 하나에 약 105MB를 차지해, 실측 증가분이 스캐너 추정(+262MB)보다 크다. 운영 기준선은 tsx 보다 낮겠지만 증가분만으로 500MB 선에 닿고 GC 뒤에도 수백 MB가 남아 pm2 점검 주기에 걸릴 가능성이 높다. 반박 실패. 참고: 스캐너의 단발 측정 방식은 루프 블록을 놓칠 수 있어(notes 참조) 보정해서 다시 쟀다.
- **수정**: 단기(S, 스키마 변경 없음): (a) 백업 라우트 응답 스키마를 빼거나 base64 정규식 없는 가벼운 스키마로 바꾸면 직렬화 블록 약 250ms 제거. (b) 크기 검사 stringify 를 사진 base64 길이 합+메타 길이 추정으로 바꾸면 약 100ms와 105MB 임시 문자열 제거. (c) 복원 요청 스키마의 base64 정규식 제거(서비스가 이미 Buffer 왕복 비교와 sha256 으로 검증) → 225ms 블록 제거. (d) 백업·복원 전역 동시 1건 세마포어 → 2건 겹침(+629MB) 차단. (e) 사진 합계 한도 50MB→20~25MB. 이것만으로 단건 증가분은 대략 JSON 1벌+UTF-8 버퍼 수준(약 +200MB)으로 줄 것으로 보인다(미측정). 근본(M): 백업은 메타 JSON 을 쓰고 사진을 파일에서 한 장씩 읽어 base64 청크로 reply.raw 에 흘리는 스트리밍으로 바꾼다. 같은 JSON 바이트를 만들 수 있어 앱·웹 호환이 유지된다. 복원은 스트리밍 JSON 파서나 multipart(사진 파일+메타)로 바꾼다.

### C-2 [HIGH · 확정 · login · M] 복원이 기록·추천 수천 건을 행 단위로 하나의 대화형 트랜잭션에 씀 — 1,000건이면 쓰기 락 1.4초, 계약 상한 5,000건은 Prisma 5초 타임아웃으로 실패

- **위치**: `src/modules/meal/meal-data.service.ts:562`, `src/modules/meal/meal-data.service.ts:605`
- **트리거**: 로그인 사용자가 기록이 많은 백업 아카이브로 POST /api/v1/meals/data/backup/restore 를 호출(사진 없이도 됨)
- **측정**: 스키마 전용 사본(auto_vacuum=0, bench.db와 같게)에서 MealDataService.restore 를 직접 호출하고, 다른 커넥션이 짧은 upsert 를 계속 시도하게 했다. 기록 1,000건(항목 3): 946ms, 3,005쿼리, 동시 쓰기 대기 655ms. 2,000건(항목 5)+추천 200×이벤트 5: 2,737ms, 6,405쿼리, 대기 2,510ms. 5,000건(항목 3)+추천 1,000×5: 16,488쿼리를 실행한 뒤 5,021ms에 Prisma 대화형 트랜잭션 기본 타임아웃(Invalid tx.mealEntry.create)으로 전체 롤백, 대기 4,787ms. SQL 로그상 BEGIN IMMEDIATE 라 시작부터 쓰기 락을 잡는다.
- **검증 근거**: 반박 시도: 사진 저장(sharp)은 트랜잭션 밖이고(사진 100장 복원의 동시 쓰기 대기는 48ms) 사진 없는 복원은 드물다. 그래도 기록 1건마다 쿼리 3개(INSERT entry, INSERT items, SELECT)를 순차 await 하므로 1년치(약 1,000끼)만 복원해도 전 서비스 쓰기가 약 0.7~1초 멈춘다. 백업 한도(기록 5,000·추천 1,000)가 허용하는 아카이브는 복원이 5초 타임아웃으로 항상 실패하므로 기능 결함이기도 하다. 실패하면 원장 행이 남지 않아 같은 아카이브로 계속 재시도할 수 있다(10/시간/IP, 공개 가입). 쓰기 락 장기 점유라 HIGH 유지.
- **수정**: 대안을 같은 DB에서 실측했다. id 를 미리 만들고 createMany 를 기록 500건 단위 트랜잭션으로 나누면 1,000건 310ms(최대 청크 158ms, 동시 쓰기 대기 1ms), 2,000×5+200×5 821ms(최대 205ms, 대기 141ms), 5,000+1,000×5 1,614ms(최대 172ms, 대기 35ms)다. 청크로 나누면 멱등성과 부분 실패 정리가 필요하다. 원장을 status=pending 으로 먼저 쓰고 마지막에 done 으로 바꾸면 컬럼 추가 마이그레이션 1건이 필요하고, 컬럼 없이 하려면 만든 id 목록으로 실패 시 정리한다. 중간 단계로 한 트랜잭션 안에서라도 createMany 로 바꾸면 상한(5,000+1,000×5)도 타임아웃 안에 들어온다. 트랜잭션 timeout 만 늘리는 방법은 락을 더 오래 잡으므로 권하지 않는다. 주의: 복원이 빨라지면 기록을 부풀리기도 쉬워지므로 C-4 의 사용자당 기록 상한과 함께 넣어야 한다.

### C-4 [HIGH · 확정 · login · S] 사용자당 식단 기록 수 상한이 없고 export·달력·통계·영양·시간 프리셋이 범위 안 행을 전부 로드 — 2,200건이면 export 210ms·3.9MB, 늘어나면 메모리 위험

- **위치**: `src/modules/meal/meal.service.ts:506`, `src/modules/meal/meal-data.service.ts:139`, `src/modules/meal/meal.service.ts:785`, `src/modules/meal/meal-stats.service.ts:1`, `src/modules/meal-nutrition/meal-nutrition.service.ts:388`
- **트리거**: 로그인 사용자가 POST /api/v1/meals 를 전역 한도(1000/분)까지 반복해 기록을 대량으로 만든 뒤(eatenDate 를 한 날짜·한 달에 몰 수도 있음) GET /api/v1/meals/data/export(전용 레이트리밋 없음) 등을 호출
- **측정**: 스키마 전용 사본, 사용자 1명에 항목 4개짜리 기록을 직접 적재하고 라우트 inject 로 쟀다(같은 프로세스에서 1회씩 분리 측정). export: 2,000건 295ms·4.3MB·루프 94ms. 5,000건 1,451ms·10.8MB·루프 411ms·RSS +212MB. 10,000건 1,928ms·21.6MB·루프 524ms·RSS +381MB(GC 후에도 +275MB 잔류). stats 400일: 2,000건 141ms, 10,000건 804ms. time-presets(90일 안 행 수): 450행 43ms·+10MB, 2,000행 120ms·루프 89ms·+50MB, 8,000행 408ms·루프 362ms·+202MB. 행마다 toLocaleTimeString(Asia/Seoul)이 ICU 포매터를 새로 만들기 때문이다(1만 행 431ms, 공유 Intl.DateTimeFormat 8ms, +9h 산술 0ms). 상한이 있는 경로는 문제없었다: calendar 6~13ms, nutrition 52~144ms, frequent 107~151ms, list 19~24ms.
- **검증 근거**: 반박 시도: 정상 사용자(하루 3~5끼)는 1년에 1,100~1,800건이라 지금 운영 규모에선 수백 ms 수준이다. 그러나 다음 셋은 반박되지 않는다. (1) 기록 수 상한이 create·restore 어디에도 없다. (2) 회원가입이 공개라 즉시 JWT 를 받을 수 있고, POST /meals(전역 1000/분)나 조작한 복원 아카이브(1회 최대 5,000건, 1,000건 0.95초 실측이라 수천 건 단위는 타임아웃 안)로 몇십 분 안에 1만 건을 만들 수 있다. (3) export 에는 전용 레이트리밋이 없다. 1만 건에서 export 1회가 RSS +381MB·루프 524ms 라 동시 2~3회면 500MB 재시작 선을 확실히 넘는다. 4~5년 쓴 사용자도 같은 규모에 닿는다. 수치 기준(500MB 재시작 위험, 루프 100ms 이상)으로 스캐너의 MEDIUM 을 HIGH 로 올린다. 다만 정상 사용 빈도에서는 아직 드문 경로다.
- **수정**: S, 스키마 변경 없음. (1) 사용자당 기록 상한(예: 20,000)과 하루 상한(예: 30끼)을 create·restore 에 둔다(count 는 userId 인덱스). (2) export 에 RATE.mealDataArchive 를 걸고, 백업과 같은 5,000건 상한을 두거나 커서 페이지·스트리밍(reply.raw 에 기록 단위로 쓰기)으로 바꾼다. (3) minutesOfDayInSeoul 을 모듈 수준 Intl.DateTimeFormat(hourCycle h23) 재사용이나 +9h 산술(한국은 DST 없음)로 바꾸면 1만 행 431ms가 0~8ms가 되고 ICU 네이티브 메모리 스파이크가 사라진다. (4) stats 는 기간 400일을 유지한다면 집계 일부를 SQL 로 옮기거나 행 상한을 둔다.

### C-6 [HIGH · 확정 · login · S] 식단 사진 HEIC 업로드가 heic-convert(순수 JS)를 요청 스레드에서 실행 — 직전 감사 DEFERRED #14 와 같은 경로가 식단 업로드에 새로 생김

- **위치**: `src/modules/meal/meal-photo.service.ts:164`, `src/modules/meal/meal.route.ts:361`
- **트리거**: 로그인 사용자가 HEIC 파일을 POST /api/v1/meals/photos 로 업로드(mealPhotoUpload 30/분/IP). sharp 프리빌드는 HEVC 디코드가 안 돼 HEIC 는 모두 이 폴백을 탄다
- **측정**: pillow-heif 로 만든 합성 HEIC 로 쟀다. sharp 프리빌드는 HEIC 디코드에 실패(bad seek)해 전부 heic-convert 폴백을 탄다. 12MP(1.45MB): heicConvert 1,014~1,161ms 동안 이벤트 루프 1,011~1,151ms 블록. MealPhotoService.store 전체 1,372ms·블록 1,099ms. 다른 사용자 3장 동시 업로드 3,186ms·최대 블록 2,921ms. 1600px(0.48MB): 블록 207~233ms. 업로드 한도(5MB) 안의 48MP(1.43MB): 블록 2,904ms, RSS 103→843MB(+741MB). GC 뒤에도 495MB(+390MB)가 남는데, libheif-js wasm 선형 메모리는 줄지 않기 때문이다. 2회차 변환은 2,261ms. 대안 heic-decode→sharp raw: 12MP 787ms·블록 574ms(JS JPEG 인코드 몫만 줄어든다).
- **검증 근거**: 직전 감사 DEFERRED #14 를 현재 규모로 재평가했다. 반박 시도: 공식 앱은 고를 때 JPEG 로 바꾸고(Compatible 모드), 웹에는 식단 사진 업로드가 없어 정상 트래픽은 이 경로를 거의 타지 않는다. 하지만 가입이 공개라 누구나 즉시 JWT 를 받아 mealPhotoUpload 30/분/IP 로 HEIC 를 보낼 수 있다. 12MP 한 장이 1.1초, 3장 동시가 2.9초 동안 루프를 멈춘다. 5MB 안에 들어가는 48MP 한 장은 RSS 를 영구히 +390MB(피크 +741MB) 올려 500MB 재시작을 일으킨다. heic-convert 경로에는 sharp 의 limitInputPixels 같은 픽셀 상한이 없어 압축 폭탄이 된다. '사용 빈도 확인 후'라는 보류 사유는 더 이상 성립하지 않는다. 정상 빈도가 0에 가까우니 막아도 손해가 없다. 그래서 MEDIUM 에서 HIGH 로 올린다.
- **수정**: 가장 싼 대책(S): 식단 업로드에서 HEIC/HEIF 를 415 로 거부한다(공식 클라이언트는 JPEG 만 보낸다). HEIC 를 계속 받아야 한다면: 디코드 전에 ispe 박스로 해상도를 읽어 예컨대 16MP 초과를 거부하고, worker_threads 에서 디코드한 뒤 워커를 종료·재생성하며(wasm 메모리는 워커가 끝나야 반환된다), 전역 동시 1건으로 제한한다. heic-decode→sharp raw 는 블록을 1.1초에서 0.57초로만 줄여 단독 대책으로는 부족하다. 같은 라이브러리를 쓰는 정산 영수증(settlement-extraction) 경로도 함께 고쳐야 한다(다른 묶음).

### C-3 [MEDIUM · 확정 · public · S] 공개 menu-nutrition 이 판정 못 한 메뉴로 백그라운드 LLM·웹 조회를 placeId 마다 무제한 병렬로 기동, 실패한 이름은 저장하지 않아 조회할 때마다 재호출

- **위치**: `src/modules/food/menu-nutrition.service.ts:278`, `src/modules/food/menu-nutrition.service.ts:287`, `src/modules/food/menu-nutrition.service.ts:292`, `src/modules/food/menu-llm-match.service.ts:198`, `src/modules/food/menu-llm-match.service.ts:234`, `src/modules/food/menu-llm-match.service.ts:277`, `src/modules/food/menu-llm-decompose.service.ts:154`, `src/modules/food/food-web-estimate.service.ts:113`
- **트리거**: 무인증 GET /api/v1/restaurants/public/:placeId/menu-nutrition 을 여러 placeId 에 반복 호출. 미판정 메뉴가 있는 식당이거나 LLM 장애·파싱 실패·fatsecret 비200 응답이 반복되는 메뉴가 있을 때
- **측정**: bench.db 읽기 전용, LLM·분해·웹을 호출 기록용 스텁으로 바꿔 외부 호출 0회로 쟀다. 23곳(메뉴 466개) 콜드 스윕: 판정 중 5곳, 백그라운드 LLM 4회(이름 33개), 분해 1회, 웹 1회. 미캐시 forPlace 중앙값 5.7ms·최대 8.4ms, 인덱스 콜드 빌드 포함 첫 호출 77ms. 전 placeId 동시 오픈: 백그라운드 체인 4개가 동시에 돎(전역 상한 없음, 체인당 LLM_CONCURRENCY 4라 동시 LLM 16). LLM 실패(저장 안 됨) 가정: 미판정 16개 식당 페이지 1회 열람(클라이언트 3초 폴링 10회) → matchMany 10회 재기동, 이름 160개, 분해 10회. 웹 간격 게이트: 4 체인 동시 → 1015/2021/3023ms 에 4건씩 동시 fetch(100ms 이내 연속 8건), 1초 간격이 깨진다.
- **검증 근거**: 반박 시도: 정상 시에는 이름 단위로 부정 결과까지 영구 저장되어 비용이 어휘 수로 수렴한다. 메뉴명은 크롤 스냅샷에서 오므로 공격자가 새 이름을 넣을 수 없다. 그래서 정상 상태 비용은 작고 MEDIUM 을 유지한다. 반박되지 않는 부분: 실패(타임아웃·429·파싱 실패)는 저장하지 않고, llmPending 결과는 LRU 에 넣지 않으며, 웹 클라이언트가 3초마다 최대 10회 다시 조회한다. 그래서 실패 모드에서는 열람 1회가 LLM 호출 ×10 이 된다. 무인증 GET(전역 1000/분만)이라 봇이 placeId 를 훑으면 체인 수에 상한이 없고 fatsecret.kr 간격 게이트도 깨진다. LLM 장애 중에는 장애 난 provider 를 더 두드려 다른 LLM 기능과 함께 쓰는 쿼터를 깎는다. 파싱이 늘 깨지는 이름이 하나라도 있으면 무인증 요청마다 LLM 1콜이 되는 경로다. 그런 이름이 지금 있는지는 실패를 기록하지 않아 확인할 수 없었다. 라우트는 restaurant 모듈이라 다른 묶음과 겹칠 수 있다.
- **수정**: S, 스키마 변경 없음. (1) 모듈 전역 세마포어로 백그라운드 체인을 1~2개로 제한하고, 대기열을 넘으면 기동하지 않는다. (2) 실패 이름 negative 캐시: 프로세스 LRU(nameNorm→attempts·만료 30~60분), N회를 넘으면 포기로 저장한다. (3) 웹 게이트를 promise 체인으로 직렬화한다(다음 예약 시각을 동기적으로 갱신). (4) llmPending 결과를 30초 캐시한다. (5) 판정이 끝난 응답에 Cache-Control: public, max-age=600 을 붙인다. 스텁 측정 기준으로 (1)이면 동시 LLM 이 16에서 4~8로, (2)면 실패 시 열람당 호출이 ×10에서 ×1로 준다.

### C-5 [MEDIUM · 확정 · login · S] 추천 라우트가 WeatherService 를 따로 생성(캐시·일일 쿼터 카운터 분리)하고, 캐시 히트 판정 전에 날씨 업스트림과 후보 계산을 수행

- **위치**: `src/modules/meal-recommendation/meal-recommendation.route.ts:37`, `src/modules/meal-recommendation/meal-recommendation.service.ts:263`, `src/modules/meal-recommendation/meal-recommendation.service.ts:312`, `src/modules/weather/weather.service.ts:356`
- **트리거**: 로그인 사용자가 POST /api/v1/meals/recommendations 를 lat/lng 를 바꿔 가며 반복(mealRecommend 10/분/IP). 캐시 히트여도 날씨를 먼저 조회
- **측정**: 코드: weather.route.ts:32 와 meal-recommendation.route.ts:37 이 각각 new WeatherService 를 만든다. cache·inflight·quota(9000/일)가 인스턴스 필드라 프로세스 합계 18,000까지 허용된다(기상청 실한도는 서비스당 10,000). 스텁 실측(스키마 전용 사본, LLM provider null, 날씨는 1,500ms 걸리는 스텁): 같은 입력 재요청(캐시 히트) 1,553ms(날씨를 기다린 뒤 캐시 반환). 일일 추천 한도를 다 쓴 상태의 요청도 날씨를 1회 부른 뒤에야 429. 업스트림 실호출은 금지라 지연은 미측정(어댑터 20s 타임아웃×최대 2회 + NO_DATA 폴백 1회).
- **검증 근거**: 반박 시도: nowcast 캐시는 발표 슬롯(최대 1시간) 단위로 같은 격자는 1콜이고 in-flight 합류도 있어, 자기 위치에서만 쓰는 정상 사용자에겐 영향이 작다. 반박되지 않는 부분: 격자를 바꿔 가며 부르면 추천 인스턴스 하나로 9,000콜까지 업스트림을 쓴다. 이 가드는 /weather 인스턴스와 별개라 실제 키 한도를 넘겨 날씨 페이지와 상단바 칩이 실패할 수 있다. 추천 일일 한도(20)는 날씨를 부른 뒤에 검사하므로 이를 막지 못하고, mealRecommend 10/분/IP 와 공개 가입이라 비용도 낮다. 업스트림이 느리면 LLM 을 부르지 않는 캐시 히트도 수십 초 기다리고, 이 대기가 사용자 쓰기 장벽 안이라 그 사용자의 다른 쓰기도 함께 기다린다(C-V2).
- **수정**: S, 스키마 변경 없음. WeatherService 를 plugin 에서 app.weather 로 한 번만 decorate 해 두 라우트가 공유하게 한다(캐시·쿼터 단일화). 추천 쪽은 업스트림을 부르지 않는 peek(캐시와 last-known 만)를 쓰거나 1.5초 타임아웃·재시도 없음으로 부른다. 날씨가 캐시 해시에 들어가므로 한도 검사를 날씨 앞으로 당길 수는 없고 peek 이 맞다. lat/lng 는 격자(nx,ny)로 정규화해 inFlight 키에 쓴다.

### C-V1 [MEDIUM · 확정 · login · S · 스키마] 최근 섭취 조회(GET /meals/items/recent)가 전 사용자 공통 nameNorm 인덱스에서 시작 — 비용이 그 음식명을 먹은 전체 사용자의 행 수에 비례

- **위치**: `src/modules/meal/meal.service.ts:320`, `prisma/schema.prisma:2038`
- **트리거**: 로그인 사용자가 수동 입력에서 음식명을 확정할 때마다 호출된다(흔한 경로). 전체 사용자 수와 기록이 늘수록 느려진다.
- **측정**: 스키마 전용 사본에 합성 인구(500명×200끼×3항목=30만 행, 공기밥 10만 행)를 넣고 쟀다. 현행 146~620ms(부하에 따라 변동, 공기밥 10만 행을 전부 읽음), 드문 이름(2.2만 행) 180ms. (nameNorm,entryId) 또는 (entryId,nameNorm) 복합 인덱스만 추가하면 계획이 바뀌지 않아 363~620ms 그대로다. 사용자 기록에서 시작하는 형태(mealEntry.findFirst where userId+items.some nameNorm → correlated EXISTS)는 단일 nameNorm 인덱스로 87~176ms, 복합 인덱스와 함께면 0.5~1.2ms.
- **검증 근거**: Prisma SQL 은 FROM meal_items LEFT JOIN meal_entries … WHERE meal_items.nameNorm=? AND j0.userId=? ORDER BY orderby_1.eatenAt DESC LIMIT 1 이다. EXPLAIN: SEARCH meal_items USING INDEX meal_items_nameNorm_idx (nameNorm=?) → 조인 → USE TEMP B-TREE FOR ORDER BY. 사용자 필터가 조인 뒤에 걸려 그 이름을 먹은 모든 사용자의 행을 읽는다. 같은 인구에서 추천 context 와 frequentItems 는 userId_eatenAt 에서 시작해 2.4ms·15ms 로 문제없었다. bench.db(272행)에서는 2.1ms.
- **수정**: 쿼리를 사용자 기록 쪽에서 시작하게 바꾼다: mealEntry.findFirst({ where: { userId, items: { some: { nameNorm } } }, orderBy: { eatenAt: 'desc' }, select: { eatenDate, items: { where: { nameNorm }, take: 1 }, photos: { orderBy: { sortOrder: 'asc' }, take: 1 } } }). 함께 MealItem 의 @@index([nameNorm]) 를 @@index([nameNorm, entryId]) 로 교체한다(nameNorm 접두 조회도 계속 쓸 수 있다). 30만 행 기준 인덱스 생성 543ms·약 13MB이고, 인덱스 수가 그대로라 쓰기 증폭이 없다.

### C-V2 [MEDIUM · 확정 · login · S] 추천·영양제 조언의 날씨·LLM 호출이 사용자 쓰기 장벽(mealMutationBarrier) 안에서 실행 — 같은 사용자의 기록 저장·사진 업로드·설정 저장이 LLM 완료(최대 60~180초)까지 대기

- **위치**: `src/modules/meal-recommendation/meal-recommendation.service.ts:222`, `src/modules/meal-recommendation/meal-recommendation.service.ts:385`, `src/modules/meal-nutrition/meal-nutrition-advice.service.ts:134`, `src/modules/meal-nutrition/meal-nutrition-advice.service.ts:232`, `src/modules/meal/meal.service.ts:507`, `src/modules/meal/meal-photo.service.ts:141`
- **트리거**: 사용자가 추천(LLM_TIMEOUT 60s)이나 영양제 조언(90s, 추론을 켜면 최대 180s)을 요청해 둔 채 앱이나 웹에서 끼니를 저장하거나 사진을 올릴 때
- **측정**: 스키마 전용 사본에서 3초 뒤 응답하는 가짜 provider(외부 호출 없음)로 쟀다. 추천에 3,068ms 가 걸리는 동안, 100ms 뒤 보낸 같은 사용자 기록 저장이 2,963ms 를 기다렸다(LLM 이 없을 때 15ms). 다른 사용자 저장은 7ms.
- **검증 근거**: create() 와 advice create() 가 runExclusive(userId, createOnce) 안에서 날씨와 LLM 까지 기다린다(주석상 전체 삭제와의 경합을 막으려는 의도). 같은 사용자 FIFO 를 MealService.create/update/remove, MealPhotoService.store/copy/remove, MealPreferenceService.update, 추천 feedback/events 가 함께 쓴다.
- **수정**: 날씨와 LLM 호출은 장벽 밖에서 하고, 저장 직전에만 장벽을 잡는다. 삭제 경합은 사용자별 데이터 세대 번호로 막는다. deleteAll·removeAll 이 장벽 안에서 번호를 올리고(단일 인스턴스라 메모리 Map 으로 충분), LLM 호출 전에 읽은 번호가 저장 시점에 바뀌었으면 결과를 버린다. inFlight 합류는 그대로 둔다.

### C-7 [LOW · 확정 · login · S] 영양소 점검이 요청마다 카탈로그 전체(영양 JSON 포함)를 읽고 영양소마다 JSON 을 다시 파싱 — 결과는 카탈로그와 사용자 설정으로만 결정

- **위치**: `src/modules/meal-nutrition/meal-nutrition.service.ts:458`, `src/modules/meal-nutrition/meal-nutrition.service.ts:467`
- **트리거**: 로그인 사용자가 GET /api/v1/meals/nutrition 을 호출하는데 부족한 영양소가 있을 때(영양 탭 진입마다)
- **측정**: bench.db niney: GET /meals/nutrition?days=28 inject 36.1ms·루프 20ms. foodSuggestions(영양소 8개) 36ms·루프 28.9ms 중 카탈로그 쿼리(영양 JSON 포함 1,238행·861KB) 단독이 30.6ms·루프 21.9ms. analyze 36.7ms.
- **검증 근거**: 반박 시도: mealNutrition 30/분 레이트리밋과 영양 탭 진입 빈도를 보면 체감 문제는 아니라 LOW 를 유지한다. 비용 대부분이 사용자와 무관한 카탈로그 행 로드(Prisma 역직렬화 861KB)라 캐시 효과는 분명하다.
- **수정**: S, 스키마 변경 없음. commonMealNorms 에 걸리는 카탈로그 파생 목록(알레르겐·재료 파싱, 1인분 영양, per100 파싱)을 lexicon 과 같은 10분 TTL 로 메모이즈하고, 요청마다 사용자 알레르기·제외 필터와 정렬만 한다. 36ms 중 쿼리+파싱 약 31ms 가 빠질 것으로 예상한다(미측정). 원재료 DB 로 카탈로그가 커지면 효과도 커진다.

## D — 대용량 공공데이터

### D-1 [HIGH · 확정 · public · S] 셀 모드에 zoom 22 + 넓은 bbox를 주면 셀이 점 개수만큼 생긴다 — 14MB 응답과 RSS 폭증, 결과는 크기 상한 없는 LRU에 남는다

- **위치**: `src/modules/life-map/life-map.service.ts:300`, `src/modules/life-map/life-map.service.ts:426`, `src/modules/life-map/life-map.service.ts:213`, `src/modules/housing/housing.service.ts:253`, `src/modules/housing/housing.service.ts:363`, `src/modules/housing/housing.service.ts:161`
- **트리거**: GET /api/v1/life-map/points?layer=cctv&bbox=124,33,132,39&zoom=22 (housing/points도 같음). bbox 폭이 1.5°를 넘으면 점 모드에서 셀 모드로 강등되는데, 셀 크기는 zoom(최대 22)만으로 정해져 한 칸이 약 2m가 된다. bbox를 조금씩 바꾸면 매번 캐시 미스.
- **측정**: 새 프로세스 측정(v2-mem cells·cells16, v4-dist-rss cells). 운영 빌드(dist, node 24) 기준: cctv z22 전국 1건에 RSS 234→532MB(peak), GC 뒤에도 476MB, 1,087ms, 이벤트루프 최대 458ms. tsx 기준: 333→605MB(peak)·GC 뒤 543MB, 1,071ms, 이벤트루프 514ms, 응답 14,027,048B(셀 250,568개, 서비스 909ms + zod 134ms + stringify 59ms). bbox만 살짝 바꾼 2번째 요청은 peak 660MB. LRU가 항목마다 GC 뒤 힙 +21~32MB를 붙잡는다. 줌을 덜 속여도 위험하다: cctv z16·1.6° 66,269셀 3.7MB 402ms(이벤트루프 157ms), store z18·1.6° 93,968셀 5.7MB 455ms, 3건 동시면 RSS 424→618MB·이벤트루프 326ms. 정상 셀(z12 4K)은 1,580셀 92KB. housing z22 전국은 3.85MB·583ms·이벤트루프 104ms·RSS +41MB.
- **검증 근거**: 반박 시도: 정상 웹 클라이언트는 zoom과 bbox를 짝지어 보내므로 z15 이상에서 1.5°를 넘는 bbox를 보내지 않는다. 즉 공격에만 쓰이는 경로다. 그래도 문제다. 계약은 zoom 0~22와 bbox 형식만 검사하고, getPoints는 narrow=false면 요청 zoom 그대로 셀 크기를 정한다. GROUP BY에 LIMIT도 없다. 무인증이고 lifeMapRead 240/분이다. 운영 빌드의 기준 RSS가 235MB인데 요청 1건이 peak 532MB(>500MB)를 찍고, GC 뒤에도 476MB가 남아 다음 요청이면 pm2 재시작 조건을 넘는다. 스캐너가 적은 이벤트루프 178ms는 단발 측정에서 마지막 동기 블록(직렬화)을 놓친 과소값이다(실측 458~514ms). HIGH를 유지한다.
- **수정**: 핵심은 셀 개수에 상한을 두는 것이다. 정렬된 bbox의 열×행((spanLng/dLng)×(spanLat/dLat))이 예컨대 4,096을 넘으면 zoom을 낮춰 셀을 키운다. 스캐너의 log2 식도 효과는 같지만, 4K 화면을 깨지 않으려면 +4 정도 여유를 둔다. 이렇게 하면 z22 전국 요청이 z7 전국 결과(3,990B, 캐시 적중)로 접힌다. 안전망으로 GROUP BY에 LIMIT(예 20,000)과 truncated 표시를 두고, 두 cellCache에 maxSize와 sizeCalculation(cells.length 기반)을 단다. bbox 좌표 범위(위도 33~39, 경도 124~132) 검증도 추가한다. 400으로 거부하는 것보다 셀을 키우는 쪽이 정상 대형 화면을 깨지 않아 낫다. 스키마 변경·백필·쓰기 증폭은 없다.

### D-2 [HIGH · 확정 · public · M] 여행 인사이트·지역 비교가 원시 행 수십만 개를 읽어 JS로 집계한다 — 첫 호출에 이벤트루프 0.35~0.42초 블로킹, RSS +407MB, 캐시 키 공간 무한

- **위치**: `src/modules/tour/tour-insights.service.ts:64`, `src/modules/tour/tour-insights.service.ts:73`, `src/modules/tour/tour-insights.service.ts:56`, `src/modules/tour/tour-region.service.ts:221`, `src/modules/tour/tour-region.service.ts:125`
- **트리거**: GET /api/v1/tour/public/insights?region=all (그리고 region×ageGrp×gender×accompany×month×nights 조합). accompany는 1~40자 자유 문자열이라 키 공간이 무한하고 LRU는 200칸. /tour/public/regions?region=all도 같은 구조.
- **측정**: 웹 /travel/jeju에서 region=all로 바꿀 때 나가는 3콜(insights·regions·lodging)을 동시에 보냈다. 운영 빌드(dist): 1,622ms, 이벤트루프 334ms, RSS 235→781MB(peak)·GC 뒤 474MB. tsx: 2,131ms, 380ms, 322→894MB. insights all 단독은 2,101ms·이벤트루프 429ms·RSS 436→781MB. 기본 진입(jeju) 3콜을 첫 방문자로 보내면 892ms(이벤트루프 95ms, RSS peak +219MB). 같은 키 3건을 동시에 보내면 3번 다 계산한다(각 1.04~1.10s, peak 895MB). accompany에 임의 문자열을 넣은 미스는 97ms·쿼리 5개·DB 240ms다(tour_visits·tour_spend에 accompany 인덱스가 없어 SCAN). 소비 조회에 지역 조건이 없어 region=jeju에서도 tour_spend 115,765행을 읽지만, 제주 여행 몫은 31,677행이다(3.7배 과다).
- **검증 근거**: 반박 시도: LRU 200·TTL 10분 캐시가 있고 데이터는 재적재 때만 바뀐다. 그래도 막히지 않는다. (1) 웹 /travel/jeju는 필터를 바꿀 때마다 새 키를 만들어 정상 사용자도 콜드를 자주 맞는다. (2) 키 공간이 region 21 × 연령 6 × 성별 3 × 월 7 × 박수 6(=15,876) × accompany(무한)라 200칸 LRU로는 막을 수 없다. (3) in-flight 합류가 없어 동시에 온 같은 키도 중복 계산한다. 운영 빌드에서 정상 사용자 1명이 region=all로 바꾸기만 해도 peak RSS가 781MB다. 500MB 재시작 조건을 넘을 수 있고, 이벤트루프가 0.33~0.43초 막힌다. 추가로, 운영 vCPU가 적으면 Prisma 풀(기본 num_cpus×2+1)을 인사이트 1건의 병렬 쿼리 5개가 1초 넘게 점유할 수 있다(미측정). HIGH를 유지한다.
- **수정**: (1) 키별 in-flight Promise 합류: 실측된 같은 키 3중 계산을 1회로 줄인다. (2) insights·regions·lodging·plan 콜드 계산에 공용 세마포어(동시 1~2): 3콜 동시 peak(+546MB)를 단건 수준으로 낮춘다. 대신 콜드 3콜이 직렬화돼 지연이 늘어난다. (3) accompany를 실제 8개 값의 enum/허용목록으로 바꾼다. 계약이 바뀌고 키 공간이 유한해진다. (4) TTL을 적재 단위로 늘린다(데이터는 재적재·배포 때만 바뀌므로 동기화 id를 키에 넣는다). region×무필터 21키는 미리 데운다. (5) spend 조회에 여행 지역 조건(지역 여행 travelId 또는 dataset)을 넣어 3.7배 과다 로드를 없앤다. 스캐너가 제안한 'SQL GROUP BY로 옮기기'는 실측상 힙은 거의 0이 되지만, region=all 기준 GROUP BY 8개 병렬이 wall 927ms·DB 누적 약 3.9s로 현행 원시 로드(1.33s, +98MB)보다 DB CPU를 약 3배 쓴다. 메모리만 푸는 해법이라 CPU DoS에는 불리하다. 근본 해법은 적재 스크립트가 지역 × 단일 필터 요약표를 미리 만드는 것이다(M~L, 이 경우 스키마 추가). 그 전까지는 (1)~(5)로 충분히 막힌다.

### D-3 [HIGH · 확정 · public · S] 코스 추천(POST /tour/public/plan)에 캐시가 없다 — 요청마다 약 1초, 쿼리 51개(500개짜리 IN 청크 46개)

- **위치**: `src/modules/tour/tour-insights.service.ts:251`, `src/modules/tour/tour-insights.service.ts:276`
- **트리거**: POST /api/v1/tour/public/plan {"region":"all"}를 반복 호출. 무인증, tourRead 120/분/IP.
- **측정**: 서비스: plan all 892ms(쿼리 51개, DB 281ms), plan jeju 495ms(쿼리 11개). 라우트(tsx): plan all 932ms, 이벤트루프 27ms, RSS +80MB. 3건 동시는 1,031ms, RSS 391→536MB. 단일 쿼리 대안과 비교(v5-alt): all은 1,469ms 대 현행 1,394ms로 이득이 없다. jeju는 399ms 대 986ms, capital+accompany는 167ms 대 482ms. 다만 jeju와 capital+accompany에서는 결과가 다르다(방문 isJeju=1인데 여행 nJeju=0인 행 2건, 같은 장소의 이름 선택 순서 차이).
- **검증 근거**: 반박 시도: 이벤트루프는 막지 않는다(27~36ms). 그러나 캐시가 전혀 없어 같은 조건도 매번 0.5~1.4초를 쓰고, 무인증 POST를 IP당 분당 120회까지 받는다. IP 하나가 DB/엔진 스레드를 상시 1개 이상 점유하고, 동시 요청마다 RSS가 50~80MB씩 오른다(동시 6건이면 운영 기준 235MB에서 500MB 근처 — 추정). /travel/plan 페이지의 유일한 동작이라 정상 사용자 체감 지연도 0.5~1.4초다. HIGH를 유지한다.
- **수정**: 핵심은 캐시다. 정규화한 body를 키로 LRU를 두고 in-flight 합류를 붙인다(D-2 세마포어와 공유). 스캐너가 함께 제안한 '청크 IN → 단일 쿼리' 전환은 region=all에서 이득이 없다. 병목은 쿼리 수가 아니라 방문 11.5만 행이기 때문이다. jeju·capital에서는 2.5~3배 빨라지지만 결과가 미세하게 달라진다. 도입하려면 이름 결정 규칙과 isJeju/nJeju 불일치 2건 처리를 테스트로 정해야 한다. 필요한 열만 select하는 것은 이미 되어 있다. 스키마 변경은 없다.

### D-4 [HIGH · 확정 · background · M] 집값 통계 재구축이 쓰기 트랜잭션 하나로 31만 행을 지우고 다시 넣는다 — 쓰기 락 13.5초 + 709만 행 풀스캔 12회

- **위치**: `src/modules/housing/housing-derived.service.ts:313`, `src/modules/housing/housing-derived.service.ts:393`, `src/modules/housing/housing-refresh.service.ts:107`
- **트리거**: HOUSING_REFRESH_CRON 월 갱신(설정 시)과 load:housing-trades 스크립트. 서버 프로세스 안에서 rebuildHousingDerived → rebuildHousingStats.
- **측정**: scratch.db(측정 후 삭제)에서 현행과 같은 트랜잭션을 311,237행으로 재현했다: deleteMany({})('DELETE … WHERE 1=1') + createMany 500행 × 623회 + 장부. 소요 17,968~18,205ms, 50ms 간격으로 넣은 INSERT 프로브의 최대 대기 17,891~18,119ms. 섀도 테이블 방식: 5,000행 트랜잭션으로 채우기 3.9~4.6s(트랜잭션 최대 117~161ms, 프로브 최대 67~168ms), DROP+RENAME+장부 교체 49~65ms(프로브 최대 21~34ms). 교체 뒤 autoindex 이름이 정상이고 Prisma 읽기도 0.7ms로 문제없다. 대안인 DELETE + INSERT…SELECT(미리 채운 보조표)를 한 트랜잭션으로 하면 624ms(프로브 556ms). 통계용 ROW_NUMBER 쿼리는 EXPLAIN상 complexId 인덱스로 709만 행을 테이블 룩업하고 임시 B-tree를 쓴다.
- **검증 근거**: 반박 시도: HOUSING_REFRESH_CRON 기본값이 빈 값이라 서버가 스스로 돌리지 않을 수 있다. 그러나 운영 반영 시 설정이 권장돼 있고(위키·메모), deploy.sh 8번(load:housing-trades)도 같은 rebuildHousingStats를 서버가 떠 있는 같은 DB에 실행한다. 쓰기 락은 어느 쪽이든 운영 서버 요청에 그대로 걸린다. 빈도는 낮지만(월 1~2회 또는 수동), 18초 동안 모든 쓰기 요청이 멈춘다. 데이터가 늘면 busy_timeout 30s를 넘겨 SQLITE_BUSY 실패로 바뀐다. 기준표의 '쓰기 락 장기 점유'에 그대로 해당하므로 HIGH.
- **수정**: 섀도 테이블 교체가 실측으로 통한다: 락이 18s에서 청크당 0.16s 이하 + 교체 0.05s로 줄어든다. 방법: 같은 DDL(복합 PK, 다른 인덱스 없음)로 housing_complex_stats_next를 만든다. 시작할 때 DROP IF EXISTS를 해서 중단 잔여물이 prisma migrate drift로 보이지 않게 한다. raw 다중 VALUES INSERT로 채우고, DROP + ALTER RENAME + 장부를 한 트랜잭션에 넣는다. RENAME 뒤 autoindex 이름이 원래대로 바뀌는 것을 확인했다. 덤으로 현행 createMany보다 약 4배 빠르다(18s → 4.6s). Prisma 스키마 변경·백필·쓰기 증폭은 없다. 읽기 단계(풀스캔 12회, 약 4~5분)는 락과 무관하지만 CPU를 오래 쓰므로 크론은 새벽으로 고정한다.

### D-6 [HIGH · 확정 · public · S] 무인증 /housing/status가 요청마다 COUNT 풀스캔 5회를 포함한 쿼리 13개를 돌린다(캐시 없음, 전용 레이트리밋 없음)

- **위치**: `src/modules/housing/housing.service.ts:186`, `src/modules/housing/housing.service.ts:222`, `src/modules/housing/housing.route.ts:51`
- **트리거**: /housing 페이지에 들어올 때마다 1회(useHousingStatus). 무인증이고 global 1000/분만 적용.
- **측정**: 서비스 중앙값 674ms(쿼리 13개, DB 누적 1,545ms — COUNT 4개가 각각 약 370ms), 라우트 661ms, 새 프로세스 첫 호출 520ms. 같은 정보를 한 번에 읽는 COUNT(col) 단일 스캔은 87ms, +kind로 인덱스를 끄면 23.8ms. ANALYZE를 적용한 scratch에서는 서비스 67ms.
- **검증 근거**: 반박 시도: 클라이언트 staleTime이 6시간이라 정상 호출은 /housing 진입당 1회뿐이다. 그러나 라우트 전용 레이트리밋이 없어 전역 1000/분/IP만 적용된다. 한 번 호출에 DB를 약 0.9~1.5s(병렬 13쿼리 누적) 쓰므로, IP 하나가 초당 16회 호출하면 DB/엔진 스레드를 초당 수십 초 분량 태울 수 있다(무인증 저비용 요청 → 무거운 DB). 값은 적재 때만 바뀌는데 캐시가 없다. 기준표의 무인증 DoS 항목에 따라 HIGH로 올린다(정상 체감 지연만 보면 MEDIUM).
- **수정**: 적재 sync id 5개와 tradeSync 최대 fetchedAt을 키로 메모리에 캐시한다(또는 TTL 10분 + in-flight 합류). 반복 호출은 쿼리 0개가 된다. COUNT 5개를 한 번의 스캔(COUNT(lat)·COUNT(kaptCode)…, +kind)으로 합치면 콜드도 24ms다. RATE.housingRead 프리셋도 붙인다. 스키마 변경 없음.

### D-7 [HIGH · 확정 · public · S] 점 모드 bbox 상한(1.5°)이 줌과 무관하고, Prisma take가 ORDER BY id를 붙여 범위 안 행을 전부 읽고 정렬한다

- **위치**: `src/modules/life-map/life-map.service.ts:60`, `src/modules/life-map/life-map.service.ts:393`, `src/modules/life-map/life-map.service.ts:316`, `src/modules/housing/housing.service.ts:66`
- **트리거**: GET /life-map/points?layer=store&bbox=126.3,36.9,127.8,38.0&zoom=14 (실제 z14 화면은 약 0.1~0.2°). cctv·toilet·hospital도 같은 패턴. housing/points z13 + 1.5°.
- **측정**: 쿼리 캡처로 Prisma가 take에 ORDER BY id ASC LIMIT ? OFFSET ?를 붙이는 것을 확인했다. EXPLAIN: kind_lat_lng 인덱스 + USE TEMP B-TREE FOR ORDER BY. 정상 화면: store z14 1080p(박스 안 11,986행) 서비스 147ms·라우트 121ms, 4K(39,672행) 323ms(DB 282ms). 공격 z14·1.5°(141,200행) 915ms(DB 896ms, 쿼리 3.3개). 같은 조건에서 ORDER BY를 뺀 raw는 4K 26ms·1.5° 41ms. 커버링 COUNT는 4K 8.3ms·1.5° 28.7ms. rowid 2단계 균등 표본(커버링 rowid → 4,000개 rowid IN)은 4K 80ms·1.5° 168ms. cctv는 z15 4K 52ms·1080p 26ms라 문제가 작다.
- **검증 근거**: 반박 시도: 스캐너는 정상 사용자는 거의 맞지 않는다고 봤다. 그러나 서울 도심의 실제 데스크톱 화면(z14 1080p·4K)만으로도 박스 안 행이 4,000을 넘어 ORDER BY 정렬이 매번 돈다. 정상 경로가 121~323ms로 MEDIUM 구간이다. 공격 경로는 무인증 GET 한 번에 DB 약 0.9s이고 lifeMapRead 240/분/IP라, IP 하나가 DB 코어 3~4개 분량을 태운다(무인증 저비용 → 무거운 DB). 그래서 HIGH로 올린다.
- **수정**: 스캐너의 'ORDER BY 없이 LIMIT'은 빠르지만(26~41ms) 잘린 4,000개가 인덱스 순서(kind→lat)로 뽑혀 화면 남쪽 띠와 첫 업종에 몰린다. 지금 ORDER BY id가 사실상 균등 표본 역할을 한다(웹은 truncated여도 점을 그대로 그린다). 권장안: 커버링 COUNT를 먼저 하고(8~29ms) MAX를 넘으면 셀 모드로 강등한다. 줌에 묶은 점 모드 폭 상한도 함께 둔다. 균등성을 유지하려면 rowid 2단계 표본을 쓴다(4~5배 빠름). total은 COUNT 결과를 재사용한다. 스키마 변경 없음. cctv·toilet·hospital 레이어도 같은 패턴이지만 행 밀도가 낮아 영향이 작다.

### D-5 [MEDIUM · 확정 · public · S] housing_complexes에서 플래너가 kind_households 인덱스를 골라(kind='apt'가 4.7만 행 전부) 지도·주변 조회가 매번 풀스캔이 된다

- **위치**: `src/modules/housing/housing.service.ts:297`, `src/modules/housing/housing.service.ts:384`, `src/modules/housing/housing.service.ts:458`
- **트리거**: 지도를 움직일 때마다 부르는 GET /housing/points(점·셀 모드)와 /housing/nearby. 흔한 경로.
- **측정**: bench EXPLAIN: points·nearby·status COUNT·search 모두 housing_complexes_kind_households_idx(kind=?)를 탄다. kind는 47,193행 전부 'apt'다. scratch에서 ANALYZE housing_complexes(25ms)를 돌리면 lat_lng 인덱스로 바뀐다: raw points z15 207→3.1ms, z13 130→37ms, nearby 박스 165→10.9ms, status COUNT 184→15.9ms(SCAN이 더 빠름). 서비스 기준: getStatus 524→67ms, getPoints z15 73.6→20.5ms, z13 360ms(bench)→124ms(scratch, 쿼리 DB 301→41ms), getNearby r3000 76.8→37ms. ANALYZE 없이 +c."kind"만 써도 z15 raw 3.8ms. 전체 ANALYZE(analysis_limit=1000)는 3.6GB에서 1.56s이고, 묶음 D 대표 쿼리 10개에서 계획 회귀가 없었다. 라우트(bench, 부하 중): z15 기본 진입 244ms, z14 288ms, z13 572ms.
- **검증 근거**: 반박 시도: 4.7만 행이라 풀스캔도 수십 ms면 끝날 수 있다. 그러나 실제로는 인덱스를 거쳐 테이블을 4.7만 번 룩업해 130~207ms가 걸리고, 지도를 움직일 때마다(housingRead 240/분) 반복된다. 흔한 경로 100~500ms 구간이라 MEDIUM.
- **수정**: 1순위는 ANALYZE(또는 기동·적재 뒤 PRAGMA optimize)다. housing_complexes만 분석해도 효과를 확인했고, 전역 ANALYZE 담당 묶음과 같은 조치다. 적재로 분포가 크게 바뀌면 다시 돌려야 하므로 load:* 스크립트 끝이나 기동 시 PRAGMA optimize를 권한다. 코드만으로 고치려면 raw SQL의 c."kind"를 +c."kind"로 바꾼다(points·cells). Prisma 빌더 쿼리(nearby·status·search)는 +를 쓸 수 없으므로 raw로 바꾸거나 kind 조건을 빼야 한다. (kind, lat, lng)로 인덱스를 교체하면 search가 쓰는 households 정렬 인덱스를 잃으므로 권하지 않는다. 스키마 변경 없음.

### D-V1 [MEDIUM · 확정 · public · S] 집값 점 모드가 단지마다 침수 흔적 반경 계산(HousingFloodIndex.near)을 해, 서울 z13 화면 요청 1건이 메인 스레드를 약 0.1초 막는다

- **위치**: `src/modules/housing/housing.service.ts:338`, `src/modules/housing/housing-flood.service.ts:83`, `src/modules/housing/housing.service.ts:301`
- **트리거**: GET /api/v1/housing/points에 z13~14로 서울 도심 데스크톱 화면(예 bbox=126.813,37.493,127.143,37.639&zoom=13)을 보낸다. 지도를 축소해 둘러볼 때마다 생기는 흔한 경로다.
- **측정**: near() × 4,000만 따로 재면 동기 59~112ms(JIT 예열 뒤 59ms). getPoints z13 1080p의 이벤트루프 최대 지연은 서비스 99~120ms, 라우트 128ms. z14는 57ms, z15(기본 진입)는 46ms. 이와 별도로 응답 1,163,922B의 zod 검증 18ms와 JSON 8ms가 더해진다. 라우트 전체는 325~572ms(bench, ANALYZE 전, 부하 중).
- **검증 근거**: points()가 반환하는 최대 4,000개 점마다 HousingFloodIndex.near()를 동기 호출한다. near()는 0.002° 격자 3×3칸을 돌며 하버사인을 계산한다. 서울은 침수흔적도 범위 안이라 4,000개 중 3,998개가 계산 대상이고, 반경 100m 적중은 합계 17,625건이다. 침수 흔적은 적재(sync id)가 바뀔 때만 바뀌는데 결과를 캐시하지 않는다.
- **수정**: 단지별 침수 개수는 적재 전까지 변하지 않는다. HousingFloodIndex에 Map<complexId, count>를 syncId 단위로 메모이즈해서 points에서 재사용한다. 또는 refresh 때 범위 안 단지를 한 번 계산해 둔다(4.7만 × 약 15µs ≈ 0.7s, 1회, 약 1MB). 필요하면 z13에서 점 상한을 낮추거나 개수가 많을 때 셀로 강등해(D-7과 같은 방식) 페이로드도 줄인다.

### D-9 [MEDIUM · 추정 · public · S] 일상지도 지역 검색(VWorld 프록시)이 고유 검색어마다 업스트림 2콜(+재시도)을 쓴다 — 전역 일일 상한·in-flight 합류 없음

- **위치**: `src/modules/life-map/life-map-search.service.ts:69`, `src/modules/life-map/life-map-search.service.ts:72`, `src/modules/life-map/life-map-search.service.ts:77`
- **트리거**: GET /api/v1/life-map/search?q=<매번 다른 2~60자>. 무인증, lifeMapSearch 60/분/IP.
- **측정**: 외부 호출 금지라 측정하지 않았다. 코드상 캐시 미스마다 place·address 2콜을 부르고 5xx면 각 1회 재시도해 최대 4콜이다. lifeMapSearch 60/분/IP이므로 IP당 120~240콜/분. 참고: 같은 VWorld 키의 지오코딩 일 한도(4만)가 2026-08-30에 소진된 기록이 있다(메모). 한도 규모가 수만 건대라는 뜻이다.
- **검증 근거**: 반박 시도: 검색어 LRU 500·10분이 같은 검색어는 흡수하고, 클라이언트는 디바운스하며 로컬(행정구역·역·정류장) 결과를 먼저 보여 준다. 그러나 고유 검색어마다 업스트림 2콜이고, 전역 일일 예산도 in-flight 합류도 없다. IP 하나로 4만 콜을 약 5.5시간, IP 여러 개면 수십 분에 소진할 수 있다. 소진되면 검색이 503이 된다(보조 기능). 키를 공유하는 WMTS·지오코더까지 막히는지는 VWorld 쿼터 구조(서비스별 한도인지)에 달려 확인하지 못했다. MEDIUM·PLAUSIBLE을 유지한다.
- **수정**: 검색어별 in-flight 합류, 서버 전역 일일 업스트림 예산(초과 시 enabled:false 빈 결과), 검색어 정규화(소문자·공백)를 넣는다. 버스·지하철 7차와 같은 패턴이라 S. getKey는 PK 1회 조회라 비용이 미미하고 짧게 캐시해도 된다. 스키마 변경은 없다(카운터를 DB에 두면 작은 표가 필요).

### D-10 [LOW · 확정 · public · S] 정적·저빈도 공개 GET에 Cache-Control이 없어 Cloudflare가 흡수할 수 없다

- **위치**: `src/modules/life-map/life-map.route.ts:74`, `src/modules/tour/tour-public.route.ts:30`, `src/modules/housing/housing.route.ts:44`
- **트리거**: /life-map/crime(빌드 산출물 68KB), /tour/public/density·insights·lodging·regions(재적재 전까지 불변), /housing/status, /life-map/status
- **측정**: grep 결과 housing·life-map·tour 모듈은 Cache-Control을 설정하지 않고, ops/nginx의 /api/에도 캐시가 없다. crime은 68,038B·요청당 1.1ms.
- **검증 근거**: 사실로 확인했다. 단독 효과는 작다(crime은 이미 싸고 클라이언트 staleTime이 24h). 의미는 D-2·D-3 같은 공개 집계의 반복 키를 엣지에서 흡수하는 2차 방어선이라는 데 있다. 공격자는 키를 바꿔 우회하므로 1차 대책은 아니다. LOW 유지.
- **수정**: tour public GET(insights·regions·lodging·density)과 crime·status에 public max-age를 붙이고 Cloudflare Cache Rule을 둔다(JSON은 기본적으로 캐시되지 않는다). 응답이 사용자와 무관해 안전하다. POST plan은 엣지 캐시가 불가능하다. 스키마 변경 없음.

### D-11 [LOW · 확정 · public · M · 스키마] 단지명 검색이 LIKE '%q%'로 4.7만 행을 스캔한다(ANALYZE 뒤에도 같다)

- **위치**: `src/modules/housing/housing.service.ts:487`
- **트리거**: GET /housing/search?q=<희귀어>. housingSearch 120/분.
- **측정**: 없는 검색어 49~69ms, 적중(래미안) 1.4~3.1ms. ANALYZE 뒤에도 계획이 같다(kind_households + 임시 B-tree). +kind로 바꾸면 미스는 25ms가 되지만 적중이 29ms로 느려진다.
- **검증 근거**: 사실이지만 요청당 약 50ms에 housingSearch 120/분이라 영향이 작다. LOW 유지.
- **수정**: 당장은 두어도 된다. +kind 같은 간단한 힌트는 적중 경로를 약 20배 느리게 만들어 득이 없다. 커지면 FTS5 trigram이나 메모리 이름 색인(4.7만 개)으로 바꾼다. FTS5는 스키마(가상 테이블)와 적재 동기화가 필요하다.

### D-8 [LOW · 확정 · public · S] 여행 밀도 격자 캐시 키에 자유 bbox가 들어가 bbox만 바꾸면 매번 tour_visits 풀스캔 + 임시 B-tree 3개

- **위치**: `src/modules/tour/tour-region.service.ts:92`, `src/modules/tour/tour-region.service.ts:79`
- **트리거**: GET /api/v1/tour/public/density?kind=all&bbox=<매번 다른 값>. 웹·앱은 bbox 없이 kind만 보낸다(useTour·tour.api) — 공격 경로 전용.
- **측정**: bbox 캐시 미스 141ms(쿼리 1개, DB 137ms, 90,879B), bbox 없는 첫 호출 172ms. EXPLAIN: SCAN tour_visits + 임시 B-tree 3개. useTourDensity는 bbox를 보내지 않는다(tour.api의 bbox 인자는 쓰이지 않음).
- **검증 근거**: 공격 전용 캐시 우회 경로라는 점은 맞다. 하지만 요청당 0.14s에 tourRead 120/분이라 IP당 DB 약 0.28코어로, 다른 항목(D-1·2·3·6·7, 요청당 0.5~2s)보다 작다. 정상 경로 영향도 없다. LOW로 낮춘다.
- **수정**: kind별 전체 격자(키 2개)만 계산·캐시하고 bbox는 메모리에서 셀을 거르는 데만 쓴다. 결과는 같고 미스는 kind당 10분에 1회로 줄어든다. 클라이언트가 쓰지 않으므로 계약에서 bbox를 빼도 된다. 스키마 변경 없음.

### D-V2 [LOW · 확정 · admin · S] 어드민 매칭 실행이 canonical마다 tour_places bbox 조회를 typeShort 인덱스로 돌려 건당 약 74ms가 걸리고, 시드 등록 크롤이 끝날 때마다 자동으로 다시 돈다

- **위치**: `src/modules/tour/restaurant-tour-match.service.ts:94`, `src/modules/tour/tour-admin.service.ts:217`, `src/modules/tour/tour-admin.service.ts:236`
- **트리거**: POST /api/v1/admin/tour/match/run을 호출하거나, 시드 등록(크롤 잡)이 끝나면 matchAfterJob이 runMatch를 자동 실행한다.
- **측정**: matchRestaurantTour dryRun(쓰기 없음, bench): canonical 29개에 2,244ms, 쿼리 32개, tour_places 조회 평균 74ms.
- **검증 근거**: EXPLAIN 결과 SEARCH tour_places USING INDEX tour_places_typeShort_nTravelers_idx (typeShort=?)라 lat/lng 범위를 쓰지 않는다. 식당류 장소는 약 2.9만 개(식당 22,310·상업 4,195·상점 2,851)이고, canonical 하나마다 이 쿼리를 1회 돈다. in-flight 가드(matchInFlight)는 있다.
- **수정**: 식당류 장소 약 2.9만 개를 한 번 읽어 메모리 격자로 만들고, canonical마다 격자에서 후보를 찾는다(N+1 제거). 또는 ANALYZE 뒤 lat_lng 인덱스를 쓰는지 확인한다(미검증). (typeShort, lat, lng) 복합 인덱스도 대안이지만 쓰기 증폭이 생긴다.

## E — 실시간 외부 API·폴러

### E-1 [HIGH · 확정 · public · S] 버스 노선상세·정류장검색이 레이트 프리셋 없이 공유 일일 쿼터(900)를 소비 — 무인증 300회로 전 사용자 실시간 도착·위치 하루 정지

- **위치**: `src/modules/bus/bus.route.ts:146`, `src/modules/bus/bus.route.ts:34`, `src/modules/bus/bus.service.ts:608`, `src/modules/bus/bus.service.ts:280`, `src/modules/bus/bus.service.ts:406`
- **트리거**: GET routeDetail/:busRouteId 에 존재하지 않는 숫자 id 를 바꿔가며 300회(또는 stationSearch 에 서로 다른 2~50자 키워드 900회)
- **측정**: v1.ts E1(어댑터 스텁, DB 쓰기 없음): 가짜 busRouteId 300요청 → 스텁 900콜 → quota 900/900 → getArrivals·getPositions 모두 503. 같은 가짜 id 5회 반복도 매번 502이고 매번 쿼터 3을 씀
- **검증 근거**: 반박을 시도했지만 실패했다. (a) 프리셋: bus.route.ts:34(stationSearch)와 :146(routeDetail)에 config.rateLimit이 없어 전역 1000/분만 걸린다. (b) 네거티브 캐시·합류: getRouteDetail(bus.service.ts:608)은 미스마다 consumeQuota를 3번(:624-627) 먼저 부르고 업스트림 3콜을 한다. rawInfo가 null이면 :677에서 502로 끝나는데 DB 행도 inflight 맵도 남기지 않는다. (c) 카운터 공유: consumeQuota(:406) 카운터 하나를 검색·도착·위치·노선이 함께 쓴다. 업스트림은 data.go.kr 서비스별(stationinfo·buspos·busRouteInfo) 한도인데 코드 카운터가 하나여서, 노선상세를 남용하면 도착정보까지 멈춘다. 전역 1000/분이면 18초면 된다. CORS가 *라서 제3자 페이지가 방문자 브라우저로 IP를 분산해 호출할 수도 있다. 참고로 프리셋이 걸린 도착 라우트(60/분)도 arsId가 ^\d{1,5}$를 만족하는 아무 값이나 미스 1쿼터라, IP 하나로 15분이면 소진된다(직전 감사 #17의 잔여).
- **수정**: (1) 프리셋 추가만으로는 부족하다. 60/분이어도 300요청이면 5분이다. (2) 핵심은 쿼터를 업스트림 서비스별로 나누는 것이다(stationinfo / buspos / busRouteInfo). stationinfo 안에서도 검색(예: 200/일)과 도착을 분리하면, 남용한 기능만 멈추고 실시간은 살아남는다. (3) '노선 없음'(502)인 busRouteId를 lru 24h 네거티브 캐시에 넣고 routeDetail에 in-flight 합류를 둔다. 같은 가짜 id 반복이 0쿼터가 된다(현재 실측: 5회에 15쿼터). (4) per-IP 일일 미스 예산은 CORS * 와 IP 분산 때문에 보조 수단에 그친다. 스키마 변경 없음. stationSearch 미스의 행 단위 upsert 트랜잭션(:375)은 bench.db 쓰기 금지로 측정하지 못했다(쿼터 900이 상한).

### E-2 [HIGH · 확정 · public · S] 대기 측정소 시계열의 임의 측정소명·예보 임의 날짜가 공유 쿼터(450)를 소모 — 무인증 150회(약 2.5분)로 대기정보 전체 503

- **위치**: `src/modules/air-quality/air-quality.service.ts:424`, `src/modules/air-quality/air-quality.service.ts:438`, `src/modules/air-quality/air-quality.service.ts:482`, `src/modules/air-quality/air-quality.service.ts:594`, `src/modules/air-quality/air-quality.service.ts:334`
- **트리거**: GET stationHistory/:stationName?term=3MONTH 에 서로 다른 측정소명(1~60자 아무 문자열) 150회, 또는 forecast?date= 에 서로 다른 날짜
- **측정**: v1.ts E2(fetch 스텁 빈 결과): 가짜 측정소 3MONTH 150요청 → fetch 150(쿼터 450) → getSidoRealtime 503. 서로 다른 날짜 예보 450요청 → fetch 450 → getBadStations 503
- **검증 근거**: 반박을 시도했지만 실패했다. getStationHistory(air-quality.service.ts:424)는 이름을 NFC 정규화만 하고 측정소 목록(loadStations)과 대조하지 않는다. 키 station:${name}:${term}가 미스할 때마다 consumeQuota를 부른다(3MONTH=3, :438). AirStationHistoryParams는 1~60자 길이만 본다. 예보·주간 date는 YMD 정규식만 확인해서(api-contract air-quality.ts:192·218) 날짜마다 새 키가 생기고 1콜씩 쓴다(:487·:599). 웹·앱은 date를 보내지 않는다(useAirForecast() 무인자). 카운터는 모든 오퍼레이션이 공유하는 450 하나다. transitRealtime 60/분이면 IP 1개로 2.5분(3MONTH)이나 7.5분(날짜)이면 하루 쿼터가 바닥나고, /air 페이지·지도·내 주변·상단바 칩이 자정까지 503이 된다(캐시된 키만 최대 3시간 stale).
- **수정**: stationHistory는 loadStations() 캐시(24h, 평소 0콜)와 '전국' 실시간 캐시의 stationName 합집합에 있는 이름만 허용한다. 없으면 404, 쿼터 0. 측정소정보 API가 장애일 때도 '전국' 이름 집합으로 폴백할 수 있다. date는 [오늘-2, 오늘+1]로 막거나 무시해도 화면에 영향이 없다. 쿼터는 공용 키(전국·나쁨·예보·주간·목록) 예약분과 측정소 시계열 상한(3MONTH 가중)으로 나눈다. 스키마 변경 없음.

### E-3 [HIGH · 확정 · public · S] 대기 측정소 시계열 캐시가 원본 2,200행을 엔트리당 ~1.5MB 로 보관, Map 상한 없음 — 쿼터 범위 안에서만 ~230MB 힙

- **위치**: `src/modules/air-quality/air-quality.service.ts:311`, `src/modules/air-quality/air-quality.service.ts:432`
- **트리거**: 실존 측정소명(공개 /stations 로 650곳 획득)으로 term=3MONTH 150회 또는 MONTH 450회를 3시간 안에
- **측정**: v1.ts E3 + v1dbg.ts(실제 모양 2,200행 = 1000/1000/200 페이지, 서로 다른 dataTime): 원본 캐시 엔트리 1,150~1,222KB. 같은 응답을 접힌 형태로만 보관하면 ≈18KB. 미스 16.1ms, 히트 0.8ms, 응답 11,741B. v0mem.ts: 부팅 직후 앱 RSS 319MB, heap 90MB
- **검증 근거**: 스캐너 수치는 깎는다. 스캐너 스텁은 페이지마다 1000행을 돌려줘서 3MONTH가 3,000행이 됐다(실제는 약 2,200행). 그래서 1.5MB/엔트리, 230MB는 과대다. 재측정하면 엔트리당 1.15~1.22MB다. cached()(air-quality.service.ts:349)는 미스 때 staleMax(3h)가 지난 것만 지우고 개수 상한이 없다. 다만 엔트리 수는 하루 쿼터 450에 묶여서, 3MONTH 150엔트리(MONTH 450엔트리도 비슷)일 때 상한이 약 170~180MB다. 실존 측정소명은 공개 /stations로 650곳을 얻을 수 있다. 부팅 RSS 319MB(측정, tsx 기준)에 더하면 단독으로도 500MB 경계에 닿고, E-4·E-V1과 겹치면 확실히 넘는다. 정상 사용에서도 응답에 필요한 양의 약 65배를 들고 있다.
- **수정**: 캐시에 원본 items 대신 서빙 형태({latest, points, total})를 저장한다. 측정상 엔트리가 18KB로 줄고(약 65배), 히트마다 하던 foldDaily(0.8ms)도 사라진다. 응답 내용은 같다. 여기에 lru-cache(max 엔트리)로 바꿔 쿼터와 무관한 상한도 둔다. 스키마 변경 없음.

### E-4 [HIGH · 확정 · public · M] 날씨 캐시 Map 상한 없음(단기예보 엔트리 ~39KB × 격자 3.7만) + 중기 구역 임의값으로 공유 쿼터(9000) 고갈

- **위치**: `src/modules/weather/weather.service.ts:357`, `src/modules/weather/weather.service.ts:476`, `src/modules/weather/weather.service.ts:544`, `src/modules/weather/weather.service.ts:374`
- **트리거**: GET forecast?nx&ny 를 nx 1~149 × ny 1~253 격자를 바꿔가며 호출(분당 60/IP), 또는 GET mid?land&ta&stn 에 형식만 맞는 가짜 구역코드
- **측정**: v1.ts E4: vilage fixture(798행·66시간) 단기예보 엔트리 40.8KB/개(응답 19,908B, 미스 1.18ms), 초단기 4.3KB/개 → 9,000엔트리 추정 358MB. 가짜 중기 구역 1,500요청 → fetch 9,000(요청당 6콜) → getForecast 503
- **검증 근거**: 반박을 시도했지만 실패했다. WeatherService.cache(weather.service.ts:357)는 일반 Map이고, 미스 때 staleMax(단기 6h)가 지난 것만 지운다(:391). 그래서 6시간 안에 만든 엔트리는 전부 남아 있고, 사실상 상한은 쿼터 9,000이다. 격자 37,697개 중 아무거나 넣으면 업스트림이 전량(약 800행)을 준다. IP 1개를 60/분으로 돌리면 150분이면 6시간 창 안에 9,000엔트리, 약 358MB가 쌓인다. 부팅 RSS 319MB와 합치면 500MB를 넘어 재시작된다. 중기 쪽은 REG_ID 형식만 검사한다(api-contract weather.ts:179). NO_DATA면 이전 발표분으로 폴백하므로 stn을 포함한 요청 하나가 6콜을 쓴다(:527-541). 이 카운터는 단기와 중기 두 서비스의 합산이라, 중기 남용이 단기예보까지 멈춘다.
- **수정**: (1) lru-cache로 바꾼다(예: max 2,000키 ≈ 82MB 상한). 정상 격자는 사용자 위치 기반이라 수백 개 수준이어서 히트율에 영향이 작다. (2) mid/midSea 파라미터를 utils weatherRegions.ts의 WEATHER_MID_LAND_REGIONS(10)·WEATHER_PLACES의 taRegId·WEATHER_MID_SEA_REGIONS(12)·stnId로 화이트리스트 검증하면 가짜 코드는 400, 쿼터 0이 된다(실측 9,000콜 → 0). (3) 카운터를 단기·중기 서비스별로 나눈다(업스트림 한도도 서비스별 1만). 격자를 육지·연안으로 제한하는 안은 데이터가 필요해 우선순위가 낮다. 스키마 변경 없음.

### E-V1 [HIGH · 확정 · public · S] 주차장·충전소 뷰포트가 '넓은 bbox + 높은 줌' 조합을 막지 않아 셀 수만 개를 집계·검증하고 LRU(300)에 보관 — 무인증 수십 요청으로 500MB 재시작

- **위치**: `src/modules/parking/ev.service.ts:122`, `src/modules/parking/ev.service.ts:147`, `src/modules/parking/ev.service.ts:85`, `src/modules/parking/parking.service.ts:189`, `src/modules/parking/parking.service.ts:220`, `src/modules/parking/parking.service.ts:115`, `packages/api-contract/src/schemas/parking.ts:9`, `packages/api-contract/src/schemas/parking.ts:194`
- **트리거**: GET /api/v1/parking/ev/points?bbox=124,33,132,39&zoom=22 처럼 bbox를 0.0001°씩 바꿔 새 캐시 키를 만든다. 점 모드 조건(폭 ≤1.5°)만 깨면 줌 22 셀(약 2m) 단위로 전국을 GROUP BY한다. lots/points도 같다
- **측정**: v2.ts: 충전소 z22 전국 cells 86,163 / 4.9MB / 188ms, 10키 힙 +77.6MB. v3.ts: 라우트 미스 median 313ms eventLoopMax 156.8ms, 히트 62ms / 115.7ms, z21 키 20개 RSS +173MB. v0mem.ts: 부팅 RSS 319MB
- **검증 근거**: BboxParam은 형식만 검사하고, zoom은 0~22를 허용한다. 셀 모드에는 셀 개수 상한도 응답 상한(cells .max)도 없다. 충전소(99,850행) z22 전국은 셀 86,163개·응답 4,908,448B, z18은 81,843셀, z14는 28,956셀(1.66MB)이다. 라우트 미스는 313ms이고 이벤트루프 최대 157ms(zod 검증+직렬화)다. 캐시 히트도 62ms에 이벤트루프 116ms다. 기본 필터 결과는 cellCache(LRU max 300, 크기 무관)에 저장된다. 서로 다른 z22 키 10개로 힙 +77.6MB(엔트리 ≈7.8MB), 라우트로 z21 키 20개를 넣으면 RSS 623→796MB(+173MB)다. 상한 300이면 약 2.3GB까지 간다. 주차장(17,411행)도 z22 전국이 16,686셀·953KB다. 정상 웹은 줌 15에서 1.5° 화면이 불가능해서(약 3.5만 px), 이 조합은 조작된 요청에서만 나온다
- **수정**: (1) 셀 모드에서 스냅된 bbox의 열×행(ceil(spanLng/dLng)×ceil(spanLat/dLat))이 상한(예: 4,000)을 넘으면 셀 크기를 키우거나(유효 줌을 낮춤) 400을 돌려준다. 정상 화면은 수백 셀이라 영향이 없다. (2) cellCache를 lru-cache의 maxSize + sizeCalculation(cells.length)로 바꿔 바이트 근사 상한을 둔다. (3) 응답 스키마 cells에 .max()를 백스톱으로 둔다. 같은 패턴이 life-map.service.ts:426·housing.service.ts:363에도 있어(이 묶음 밖, 미측정) 공용 헬퍼로 함께 막는 게 좋다

### E-5 [MEDIUM · 확정 · public · S · 스키마] 충전소 셀 집계가 필터를 켜면 커버링 인덱스를 잃어 9.98만 행 랜덤 조회 — 전국 '사용 가능만' 560ms·캐시 안 함

- **위치**: `src/modules/parking/ev.service.ts:147`, `src/modules/parking/ev.service.ts:157`, `src/modules/parking/ev.service.ts:203`
- **트리거**: GET evPoints?bbox=(넓은 영역)&zoom≤10&availableOnly=true (fastOnly/freeParkingOnly/openOnly 도 첫 미스 동일), 지도 패닝마다 셀 키가 바뀜
- **측정**: sqlite3 CLI(ev_stations 전용 사본, 조용할 때): 기본 53ms vs availableOnly 291ms, fastOnly 276ms, openOnly 285ms. v2.ts 서비스: 전국 z7 availableOnly median 311ms, 수도권 z10 104ms, 서울 z12 19ms, 기본 미스 38ms, 기본 히트 0.3ms. v3/v3b 라우트: 전국 z7 455~1,176ms, z10 367ms(머신 부하로 흔들림, 서비스와 라우트 차이는 없음). EXPLAIN: 필터 시 SEARCH USING INDEX(lat>? AND lat<?) + TEMP B-TREE, 기본은 COVERING INDEX
- **검증 근거**: 결함은 맞지만 등급은 낮춘다. 기본 필터는 LRU 10분으로 히트가 0.3ms다. 하지만 availableOnly는 캐시하지 않고(ev.service.ts:157·203), fastOnly·freeParkingOnly·openOnly는 첫 미스마다 커버링을 잃는다. ev_stations 99,850행 중 availableCount>0이 84,408행(85%)이라 필터가 행을 거의 줄이지 못하고, 행마다 27.6MB 테이블을 랜덤 조회한다(CLI의 sys 시간이 대부분). 스캐너의 560ms는 부하 영향이다. 조용할 때는 약 300ms라 HIGH(≥500ms)가 아니라 MEDIUM(100~500ms)이다. '지금 사용 가능'은 persist되는 토글이라 켠 사용자는 축소할 때마다 이 비용을 낸다. DoS 측면에서는 parkingRead 240/분 × 0.3s로, IP 하나가 분당 약 72초의 DB 스레드 시간을 쓸 수 있다.
- **수정**: scratch(ev_stations 사본)에서 (lat, lng, availableCount, hasFast, parkingFree, limited) 커버링 인덱스를 시험했다. availableOnly 291→38ms, fastOnly 276→16ms, openOnly 285→25ms이고 EXPLAIN이 SEARCH USING COVERING INDEX로 바뀐다. 크기는 3.05MB이고, 접두가 같아 기존 (lat,lng) 2.58MB를 대체할 수 있다(점 모드 쿼리도 그대로 탄다). 생성 0.17s, 백필 불필요. 쓰기 증폭은 폴러가 충전소 8,000곳 availableCount를 갱신할 때 22→80ms(10분에 1회, 400행 청크라 청크당 약 4ms)로 무시할 수준이다. Prisma 마이그레이션 1건(@@index 교체)이 필요하다. 보조로 availableOnly 셀도 statusAt을 캐시 키에 넣으면 다음 폴링까지 캐시할 수 있다.

### E-6 [MEDIUM · 확정 · public · S] 바다 물때 캐시가 청소·상한 없는 Map + 날짜 범위 무제한 + 쿼터 카운터 없음 — 요청마다 업스트림 1콜·영구 상주

- **위치**: `src/modules/sea/sea.service.ts:228`, `src/modules/sea/sea.service.ts:247`, `src/modules/sea/sea.service.ts:302`, `packages/api-contract/src/schemas/sea.ts:84`
- **트리거**: GET tide?lat&lng&date= 에 서로 다른 날짜(0000-01-01~9999-12-31 형식이면 통과) × 166개 조석지점
- **측정**: v1.ts E6(callPage 스텁): 날짜 키 3,000개 → 업스트림 3,001콜('9999-99-99'도 업스트림까지 감), 엔트리 824B, cache.size 3,001 유지, 같은 날짜 재요청은 히트
- **검증 근거**: 결함은 맞다. SeaService.cached(sea.service.ts:247)는 덮어쓰기만 하고 청소가 없다. 키 tide:${지점}:${date}의 date는 정규식만 검사한다(api-contract sea.ts:87). 다른 모듈과 달리 consumeQuota가 아예 없다. 다만 메모리 수치는 정정한다. 엔트리는 업스트림이 성공할 때만 쌓이므로 하루 증가량이 업스트림 일일 한도(개발계정 약 1만)에 묶여 약 8MB/일이다. 스캐너의 '71MB/일'은 과대다. 실질 피해는 IP 1개를 60/분으로 돌리면 약 2.8시간 만에 조석예보 API의 일일 트래픽이 바닥나 물때가 하루 동안 멈추는 것이다. 바다지수는 별도 API라 영향이 없을 것으로 추정한다. 메모리는 재시작 전까지 느리게 늘어난다.
- **수정**: date를 [오늘-1, 오늘+N]으로 zod refine한다(웹이 고르는 범위를 확인할 것). cache를 lru-cache(max 수천, ttl 12h)로 바꾸고, 다른 모듈과 같은 일일 카운터를 둔다. 스키마 변경 없음.

### E-7 [MEDIUM · 확정 · public · S] 지하철 실시간·시간표 일일 쿼터가 per-IP 분당 60 만으로 보호 — 역명 순회로 IP 1개가 15분(시간표 7.5분)에 소진

- **위치**: `src/modules/subway/subway.service.ts:928`, `src/modules/subway/subway.service.ts:872`, `src/modules/subway/subway.service.ts:936`
- **트리거**: GET stations/:stationId/arrivals 를 서로 다른 역(약 600 역명) 순회, 또는 timetable 을 역×dayType(1~9호선 수백 역×3) 순회
- **측정**: v1.ts E7(어댑터 스텁): 역 701곳(조회역명 565개)을 순회하니 1,075요청 만에 'realtime' 900 소진 → getLinePositions('1002') 503
- **검증 근거**: 직전 감사 #18은 per-IP 60/분으로 처리됐다. 이 항목은 그 뒤에 남은 위험을 다시 평가한 것이다. getStationArrivals는 존재하는 역만 받는다(없으면 404, 쿼터 0). 하지만 조회역명이 565개라 15초 캐시가 다른 역명을 흡수하지 못한다. 최적 공격은 900요청이고, 조회역명이 2개인 환승역을 쓰면 더 적다. 60/분이면 15분이다. 지하철 실시간은 stale 폴백도 없어 자정까지 503이다. 시간표('openapi' 900, 미스당 2)는 455역 × 3 dayType = 1,365키라 7.5분에 하루분을 태울 수 있지만, DB 30일 캐시가 차오를수록 공격면이 줄어든다. 처리된 항목의 잔여이고 시간이 드는 공격이라 MEDIUM이다.
- **수정**: per-IP 일일 미스 예산(lru-cache IP→count, 예: 100/일)으로 단일 IP 고갈은 막을 수 있다. 하지만 CORS * 와 IP 분산에는 약하다. 근본책은 E-V2의 실패 쿨다운과 시간표 사전 워밍(한가한 시간에 1,365키를 순차로 채움)을 함께 쓰는 것이다. 스키마 변경 없음.

### E-8 [MEDIUM · 확정 · public · S] 에어코리아 공용 키 정상 갱신만으로 공유 쿼터 450 중 ~414 를 소비 — 측정소 시계열 여유 ~36콜

- **위치**: `src/modules/air-quality/air-quality.service.ts:53`, `src/modules/air-quality/air-quality.service.ts:66`, `src/modules/air-quality/air-quality.service.ts:406`, `src/modules/air-quality/air-quality.service.ts:467`
- **트리거**: 하루 종일 꾸준한 방문(10분마다 누군가 /air·상단바 칩을 봄)
- **측정**: v1.ts E8 시뮬레이션(실제 서비스 코드 + 가짜 시계 + 어댑터 스텁, 매분 /air 1회 = 전국·나쁨·예보·주간·목록): 24시간 연속 388/450(전국 131·나쁨 131·예보 84·주간 41·목록 1), 07~24시만 263/450
- **검증 근거**: 스캐너는 TTL 상수로 계산해 약 414로 봤다. 실제 cached()는 now<=expiresAt이면 히트로 처리해서, 매분 요청하면 11분마다 미스가 난다. 실측 시뮬레이션은 388(24h)·263(주간 트래픽)이다. 수치는 낮추지만 결론은 같다. 공용 키가 하루 쿼터의 58~86%를 먹고, 측정소 시계열에 남는 건 62~187콜이다(3MONTH는 3배로 소모). 측정값은 매시 1회 갱신인데 TTL 10분이라 같은 데이터를 시간당 약 5.5번 받는다. 나쁨 목록은 '전국' 실시간의 khaiGrade로 만들 수 있다. 게다가 어댑터가 04/05에 1회 재시도(airkorea-api.adapter.ts:288)하는 건 카운터에 잡히지 않아 실제 업스트림 사용량은 더 크다. 공격 없이 정상 트래픽만으로도 저녁에 대기정보 전체가 503이 될 수 있다.
- **수정**: 측정 키(전국·나쁨) TTL을 '다음 정시+20분'까지로 동적 설정하면 각 약 24/일이 된다. 나쁨 목록을 '전국' khaiGrade≥3 + 측정소 목록 주소로 파생하면 0콜이다. 예보 TTL은 발표 시각(05/11/17/23시) 기준으로 잡는다. 그러면 공용 키 합계가 388에서 약 150/일 이하로 내려간다. 카운터는 어댑터 호출 단위(재시도 포함)·오퍼레이션별로 센다. 스키마 변경 없음.

### E-V2 [MEDIUM · 확정 · public · S] 업스트림 실패에 쿨다운이 없어 장애 동안 매 요청이 재호출·쿼터를 소비 — 짧은 장애가 자정까지의 503으로 번짐

- **위치**: `src/modules/bus/bus.service.ts:457`, `src/modules/subway/subway.service.ts:922`, `src/modules/air-quality/air-quality.service.ts:374`, `src/modules/weather/weather.service.ts:403`, `src/modules/sea/sea.service.ts:247`
- **트리거**: 업스트림 장애(예: 코드 주석에 남은 2026-07-13 ws.bus.go.kr 503, 에어코리아 05 SERVICETIMEOUT) 중에 사용자가 폴링하거나 페이지를 연다
- **측정**: v4.ts 시뮬레이션: 버스 900/900 → 복구 후 503, 대기 222/450
- **검증 근거**: loadRealtime/loadInto는 쿼터를 먼저 쓰고, 실패하면 stale(또는 throw)만 돌려준다. 만료 시각을 늦추거나 실패를 기억하지 않으므로 다음 요청도 미스가 되어 다시 업스트림을 부르고 다시 쿼터를 쓴다. in-flight 합류는 동시 요청만 묶는다. 시뮬레이션(가짜 시계, 즉시 실패 스텁): 버스 정류소 10곳을 30초마다 폴링하며 60분 장애 → 업스트림 시도 900, 쿼터 900/900(45분에 소진), stale 0 → 복구 직후 첫 요청부터 503(자정까지). 대기 '전국' 키를 30초마다 1번 요청하며 2시간 장애 → 시도 221, 쿼터 222/450(사용자는 stale 응답이라 모르는 사이 하루 쿼터의 절반이 사라짐). 에어코리아 어댑터는 04/05에 1회 재시도까지 해서 실제 업스트림 트래픽이 카운터보다 크다
- **수정**: 키(와 서비스) 단위로 실패 쿨다운을 둔다. 실패하면 retryAt = now + 백오프(30초→5분)를 기록하고, 그 전에는 업스트림·쿼터 없이 last-known(stale)이나 503을 준다. 게이트웨이 22(일일한도 초과)와 인증 오류는 서비스 전체를 일정 시간 차단한다. 재시도도 카운터에 포함한다. 5분 쿨다운이면 버스 10곳 장애 1시간의 시도가 900에서 약 120으로 준다

### E-10 [LOW · 확정 · public · S] 충전소 주변 조회가 박스 안 전 행·전 컬럼을 로드해 거리 정렬 후 30건만 반환(강남 1,237행)

- **위치**: `src/modules/parking/ev.service.ts:207`
- **트리거**: GET evNearby?lat&lng&radius=3000 (도심)
- **측정**: v2.ts: ev.nearby 강남 r=3000 median 28.8ms(2쿼리, 실행당 약 2MB 생성) vs 제안한 2단계 10.9ms. 라우트 53.6ms(부하), 17,116B. 주차장 nearby는 3.4ms
- **검증 근거**: 반경 ≤3000·limit ≤30 상한은 있다. 하지만 findMany에 select·take가 없어 박스 안 1,237행의 전 컬럼을 읽고 매핑한 뒤 slice한다(ev.service.ts:212-222). 체감 지연이 작아 LOW다.
- **수정**: 1차로 id·lat·lng만 읽어 거리 상위 limit개를 고르고, 2차로 그 id들만 IN으로 전 컬럼을 읽는다. 실측 28.8→10.9ms(쿼리 수 동일). 스키마 변경 없음.

### E-9 [LOW · 확정 · public · S] 공개 주차 status 가 매 요청 ev_stations MAX(statusAt) 9.98만 행 집계(캐시 없음, 프리셋 없음)

- **위치**: `src/modules/parking/parking.service.ts:155`, `src/modules/parking/parking.route.ts:66`
- **트리거**: GET Routes.Parking.status 반복(전역 1000/분)
- **측정**: v2.ts 서비스 median 33.4ms(3쿼리, dbMs 31.3 — 대부분 MAX(statusAt)), v3.ts 라우트 38.3ms, 407B. scratch: statusAt 인덱스를 두면 MAX 22ms→0ms
- **검증 근거**: EvService는 같은 MAX를 1분 메모하지만(ev.service.ts:97), ParkingService.getStatus(parking.service.ts:155)는 요청마다 aggregate를 하고 statusAt 인덱스도 없다. 공개 라우트이고 프리셋 없이 전역 1000/분이다(parking.route.ts:66). 흔한 경로 기준 100ms 미만이라 LOW로 유지한다.
- **수정**: 같은 parking.route.ts에서 만드는 EvService의 statusAt() 메모를 공유하거나, EvStatusPoller가 applyEvStatus 직후 값을 메모리에 기록하면 쿼리가 0이 된다. statusAt 인덱스(1.48MB)는 MAX를 0ms로 만들지만 폴러가 충전소를 갱신할 때마다 인덱스 갱신이 붙어서 메모 쪽이 낫다. 스키마 변경 없음.

## F — 운세·공유 이미지·투표

### F-2 [HIGH · 확정 · public · S] 공유 PNG 캐시 미스 렌더가 이벤트 루프를 360~605ms 동기 점유 — 개수 기반 LRU 를 넘는 토큰 풀로 무인증 미스 폭주 가능

- **위치**: `src/modules/tarot/tarot-preview.ts:83`, `src/modules/saju/saju-preview.ts:52`, `src/modules/saju-g/saju-g.route.ts:292`, `src/modules/tarot/tarot-share-card.ts:227`, `src/modules/saju/saju-share-card.ts:198`
- **트리거**: GET /tarot/s/:token/image.png?format=story|og, /saju-c/s/:token/image.png, /api/v1/saju-g/shares/:token/image.png 의 캐시 미스. 게스트는 공유 토큰을 모듈마다 분당 10개(tarotShare 프리셋, 사주 공유는 LLM·한도 소비 없음)씩 발급할 수 있다
- **측정**: v-app.ts 라우트 단위(Windows, 5ms 타이머 간격으로 블로킹 측정): 타로 og 미스 460ms(블로킹 386ms), story 미스 629ms(593ms). 사주(C) og 555ms(463ms), story 675ms(623ms). 정산 7명 346ms(335ms). 히트 3~8ms. v-resvg.ts 분해: resvg 생성자 188~283ms, render() og 77~85ms·story 191~245ms·사주G 17~20ms, asPng 8~29ms. loadSystemFonts:false면 생성자 0.7~2.2ms이고 8종 모두 픽셀 동일. renderAsync(+폰트 끔)이면 메인 스레드 블로킹 14~48ms, 총시간은 비슷하다.
- **검증 근거**: 반박 시도는 모두 실패했다. ① 캐시: 키가 token:format인 개수 LRU 100(사주G는 50)이라, 토큰 51개를 순환하면 전부 미스가 난다. ② 토큰 발급 비용: 타로 게스트 공유는 같은 리딩 입력이면 리딩 캐시 히트라 LLM·한도를 쓰지 않는다(tarot.service.ts:426). 사주(C) 게스트 공유는 LLM·한도가 아예 없다(saju-records.service.ts:56-76). 둘 다 10/분/IP라 약 5분이면 캐시를 넘길 토큰이 모인다. ③ 레이트리밋: 이미지 라우트는 라우트마다 독립 저장소(@fastify/rate-limit의 store.child)로 각 120/분/IP다. 측정에서 생성자 비용의 대부분은 resvg 기본값 font.loadSystemFonts=true가 렌더마다 시스템 폰트(이 머신 649개 파일)를 fontdb에 적재하는 데서 나온다. satori는 글자를 path로 넣어 SVG에 <text>가 없으므로 폰트가 필요 없다. 운영 Linux는 폰트가 적어 이 몫이 작을 수 있다. 그래도 render+asPng+satori(약 25~60ms)만으로 og 약 115~150ms, story 약 265~315ms의 동기 블로킹이 남아 HIGH 기준(≥100ms)을 넘는다. 공격 계산: 라우트당 120 미스/분 × 0.3~0.6초 = 분당 36~72초 점유이고, 라우트 2개면 단일 스레드가 포화된다. 같은 키 동시 미스 합류도 없다(코드 확인).
- **수정**: 가장 싸고 안전한 조합은 다음과 같다(스키마 무변경, S). ① new Resvg(svg, {..., font: {loadSystemFonts: false}}): 픽셀 동일을 확인했다(satori embedFont 기본 true 유지가 전제). ② await renderAsync(svg, opts): resvg-js 내장 함수로 libuv 스레드풀에서 parse+render를 하며 픽셀 동일이다. DEFERRED된 worker_threads 없이 오프로드가 된다. 단, 스레드풀(기본 4)을 fs·dns·sharp와 공유하므로 렌더 동시 실행을 1~2로 제한하고 token:format in-flight Promise 합류를 둔다. ③ 이미지 라우트 한도를 낮추거나 미스만 세는 한도를 둔다. 불변 공유에는 긴 Cache-Control을 준다(타로 shareQuestion 토글은 캐시 키·URL에 넣어야 함). 스캐너의 sharp 전환안도 블로킹을 없애고 F-V1까지 풀지만, librsvg 출력 시각 QA가 필요하다(스캐너는 사주 og 1장만 비교). satori(25~60ms, 정산 대형표는 수 초)는 어느 안으로도 메인 스레드에 남는다(F-V2 참조).

### F-5 [HIGH · 확정 · public · S] 투표 세션의 표에 상한이 없음 — voterKey 회전으로 ballots 가 무한히 쌓이고, 매 조회·15초 폴링이 전량을 로드·검증·전송

- **위치**: `src/modules/vote/vote.service.ts:146`, `src/modules/vote/vote.service.ts:250`, `src/modules/vote/vote.service.ts:28`
- **트리거**: 공유 토큰(단톡방에 퍼지는 링크)을 아는 누구나 PUT /api/v1/votes/shared/:token/ballot 를 매번 다른 voterKey(클라이언트 임의 8~64자)로 30회/분/IP, 회당 후보 최대 8개를 찬성으로 7일간 반복
- **측정**: v-vote.ts: bench와 같은 DDL의 소형 스크래치 DB에 합성 표를 넣어 GET 1회(Prisma include + toSharedView + SharedVoteSession.parse + stringify)를 쟀다. 100명(800행) 7.7ms·22KB. 1만 명(8만 행) 817ms·2.2MB, 이벤트루프 블로킹 134~165ms, DB 250ms. 5만 명(40만 행) 4,253ms·11.5MB, 블로킹 918~1,000ms, DB 1,488ms. PUT ballot(5만 명 세션) 9,761ms. EXPLAIN: SEARCH USING INDEX (sessionId=?) + USE TEMP B-TREE FOR ORDER BY.
- **검증 근거**: 반박에 실패했다. 세션당 투표자 상한과 정리 잡이 없다(코드 확인). 토큰은 단톡방에 퍼지는 공개 링크이고, 무료 계정으로 자기 투표방을 만들어 무인증 PUT(30/분/IP, voterKey 임의)으로 직접 채울 수도 있다. PUT은 검증용 전체 로드 + 쓰기 + 재조회 전체 로드라 2배로 무겁다. 만료 세션도 ballots를 전량 로드한 뒤에 만료를 판정한다(vote.service.ts:220-228). 1만 명은 1 IP로 약 5.5시간(10 IP면 33분)이면 쌓인다. 그 뒤 GET 120/분/IP × 0.82초 = 분당 98초이므로 IP 하나로 서버가 포화된다. 참가자 15초 폴링만으로도 상시 부하가 생긴다. 블로킹 ≥100ms와 싼 단일 클라이언트 DoS 기준에 해당해 HIGH로 올린다.
- **수정**: ① 새 voterKey면 기존 (sessionId, voterKey) 인덱스로 COUNT(DISTINCT voterKey)를 세어 세션당 상한(예 100명)을 넘을 때 409를 준다. 스키마 무변경이고, 100명이면 7.7ms다. ② submitBallot 검증은 옵션 id·closedAt·만료만 가볍게 조회하고, 만료 판정을 ballots 로드 앞으로 옮긴다. ③ 응답은 후보별 count + 앞 N명 이름으로 줄인다. ④ 제안된 (sessionId, createdAt) 인덱스는 스크래치 DB에서 TEMP B-TREE를 없애고 5만 명 4,253→3,273ms(−23%), 48만 행 생성 292ms였다. 상한을 두면 필요 없다(쓰기 증폭만 생김). ⑤ 만료 세션 ballots 정리 잡은 선택 사항이다.

### F-V2 [HIGH · 확정 · login · M] 정산 공유 카드 PNG가 입력 크기(참여자 ≤100·차수 ≤10) 그대로 렌더된다 — 최대 입력에서 미스 1회가 5.3초 동기 블로킹·RSS +770MB이고, 이미지 라우트는 전역 1000/분만 걸린다

- **위치**: `src/modules/settlement/settlement-card.ts:511`, `src/modules/settlement/settlement-card.ts:522`, `src/modules/settlement/share-preview.ts:199`, `src/modules/settlement/share-preview.ts:219`
- **트리거**: 로그인 사용자가 큰 정산(공격용 100명×10차, 정상 회식 30명×3차)을 만들어 공유하면, 공개 GET /share/settlements/:token/image.png(크롤러 og:image·이미지 공유 버튼)가 렌더를 일으킨다. 정산 수정(PUT, updatedAt 변경)마다 캐시 키가 바뀌어 다시 미스가 나고, pm2 재시작 뒤에도 캐시가 비어 다시 미스가 난다.
- **측정**: 서비스 단위(renderSettlementCardPng), Windows에서 실측. 라우트 단위는 bench 7명 실데이터만 측정했다(미스 346ms·블로킹 335ms, 히트 3ms).
- **검증 근거**: v-settle.ts: bench 실제 공유 정산(7명·1차)을 복제한 합성 세션으로 측정했다(DB 쓰기 없음). 7명×1차 317ms(블로킹 312ms) 1056×918px. 30명×3차 781ms(791ms) 1464×1555px, SVG 2MB. 100명×10차 5,335ms(5,354ms) 4124×4425px(픽스맵 70MB), SVG 19MB, PNG 1.59MB, 프로세스 RSS 408→1180MB. loadSystemFonts:false로도 resvg만 2,263ms이고, satori 약 3초는 순수 JS라 renderAsync로도 메인 스레드에 남는다. 계약 상한은 participants max 100·rounds max 10(packages/api-contract/src/schemas/settlement.ts:301-302). 이미지 라우트(share-preview.ts:219-220)에는 route rateLimit이 없어 전역 1000/분만 적용된다.
- **수정**: 카드용 표에 상한을 둔다. 참여자는 상위 N행(예 30) + '외 n명' 합계 행, 차수가 많으면 차수 소계만(카테고리 열 생략) 그린다. 그래도 크면 fitTo로 폭·면적 상한(예 폭 1600px, 4MP)을 건다. 여기에 F-2 공통 조치(loadSystemFonts:false, renderAsync, 렌더 동시 1)를 더하고, 이미지 라우트에 RATE.publicShare 같은 전용 한도를 준다. 대형 정산은 og:image를 기본 이미지나 식당 사진으로 돌린다(이미 미리보기 선택 옵션이 있음).

### F-3 [MEDIUM · 확정 · public · S] 공유 PNG 캐시 4종이 바이트 상한·TTL 없는 개수 LRU — story PNG 1.34MB×100 등 최대 약 200MB+ 상주

- **위치**: `src/modules/tarot/tarot-preview.ts:20`, `src/modules/saju/saju-preview.ts:16`, `src/modules/settlement/share-preview.ts:15`, `src/modules/saju-g/saju-g.route.ts:46`
- **트리거**: 서로 다른 공유 토큰의 이미지 요청이 누적되면(정상 트래픽은 며칠, 공격은 수십 분) 캐시가 차서 프로세스 수명 내내 유지된다
- **측정**: PNG 바이트 재실측(v-resvg·v-app): 타로 og 552~554KB, story 1,270~1,340KB. 사주 og 244~250KB, story 606~618KB. 사주(G) 63~77KB. 정산 7명 107~115KB(100명×10차 합성 1.59MB). 캐시 포화 RSS는 계산값이다. bench 앱 부팅 RSS는 314MB(tsx)다.
- **검증 근거**: LRU는 max 100/100/50/200이고 maxSize·ttl이 없다(코드 확인). 최악의 경우 타로 100×1.34MB≈134MB, 사주 100×0.67MB≈67MB, 사주G 4MB, 정산 200×0.11MB≈23MB로 합계 약 228MB가 Buffer로 상주한다. 큰 정산표가 섞이면 더 늘어난다. 타로 캐시는 토큰 51개×2포맷이면 차므로, F-2와 같은 5~10분 준비로 무인증 사용자가 채울 수 있다. 운영 기본 RSS는 미측정이라 MEDIUM을 유지한다. 다만 F-2·F-V1과 겹치면 500MB 재시작 위험을 크게 높인다.
- **수정**: maxSize 16~32MB + sizeCalculation(b=>b.length) + ttl로 바꾸면 되고, 한 줄 수정에 스키마 무변경이다. 출력을 JPEG/WebP q85로 바꾸면(v-fix.ts) 타로 og 552→104KB(WebP 90KB), story 1,309→221KB, 사주 og 244→73KB, story 606→184KB로 5~6배 줄어 캐시와 크롤러 전송이 함께 준다. 인코딩은 sharp 비동기로 52~174ms다. RenderedImage.pixels를 sharp raw 입력으로 넘기면 PNG 왕복을 줄일 수 있다. og:image 형식 변경은 카카오·트위터 호환 확인이 필요하다.

### F-4 [MEDIUM · 확정 · login · M · 스키마] 회원은 IP·개인 일일 한도가 면제 — 무료 가입 계정 하나로 LLM 전역 예산을 소진해 전 게스트를 정적 폴백으로 밀어냄

- **위치**: `src/modules/usage-quota/usage-quota.service.ts:169`, `src/modules/saju/saju.service.ts:333`, `src/modules/saju/saju.service.ts:344`, `src/modules/tarot/tarot.service.ts:415`
- **트리거**: 가입(이메일 인증 없음, authRegister 40/시간/IP) 후 Bearer 로 POST /api/v1/saju-c/readings(또는 tarot/readings, saju-g/readings)를 입력(생년월일)을 바꿔 가며 ipPerMinute(20/분)까지 반복
- **측정**: v-vote.ts의 소형 스크래치 DB(한도 테이블 DDL 복제)에서 UsageQuotaService.consume('saju-reading')를 같은 회원·같은 IP로 반복했다. 3,000회 허용, 3,001번째에서 global_budget으로 거부. 직후 다른 게스트는 guest_cutoff, 다른 회원도 global_budget으로 거부됐다. consume 1회 0.57ms(쓰기 2문). LLM은 호출하지 않았다.
- **검증 근거**: 회원은 IP·기기 일일 한도를 건너뛴다(usage-quota.service.ts:169)는 점을 실측으로 확인했다. 스캐너 계산은 보정이 필요하다. ipPerMinute는 라우트마다 별도 카운터다(route config마다 store.child()로 새 LocalStore를 만든다). 그래서 saju 한도를 쓰는 7개 라우트(readings·themes·ask·daily·match·date-pick·food, saju.route.ts:94-209) 합계가 140/분/IP이고, 전역 3,000을 약 21분에 소진한다(스캐너의 135분은 6배 느리게 잡은 값). 타로는 readings 20 + shares 10 = 30/분이라 약 2.8시간, 사주(G)는 readings·pair 각 10 = 20/분이라 약 50분이다. 가입에는 이메일 인증이 없다(authRegister 40/시간/IP). 전체 풀이 1단위는 LLM 4섹션(수리 포함 최대 8콜)이다. 소진 뒤에는 그날 모든 사용자가 정적 폴백으로 강등된다. 다만 비용 상한은 어드민 globalPerDay가 정한 예산이고 서버 자원 소진이 아닌 기능 품질 DoS라 MEDIUM으로 둔다.
- **수정**: 선택지는 세 가지다. ① 회원 user scope에 일일 상한: 코드 상수면 스키마 무변경, 어드민 설정으로 두면 UsageQuotaSetting 열 추가(마이그레이션). ② 회원에게도 ipPerDay 적용(무변경). ③ 전체 풀이 4·테마 3으로 가중 소비(consume에 weight 인자, 무변경). 참고로 @fastify/rate-limit의 groupId는 키에 접미사만 붙이고 라우트별 store는 그대로라 7개 라우트 묶음 한도로는 못 쓴다. 묶음 한도가 필요하면 서비스 쪽 카운터를 둬야 한다. 2026-09-02 '회원 한도 없음' 결정을 사용자에게 다시 확인받아야 한다.

### F-6 [MEDIUM · 확정 · public · M] 게스트 공유 발급이 매번 새 행·새 토큰 — 사주는 회당 약 7KB 행을 중복 제거·보존 정책 없이 무인증으로 적재

- **위치**: `src/modules/saju/saju-records.service.ts:61`, `src/modules/tarot/tarot.service.ts:276`, `src/modules/saju-g/saju-g.service.ts:268`
- **트리거**: POST /api/v1/saju-c/shares (birth 재전송), /api/v1/tarot/shares (reading 재전송), /api/v1/saju-g/shares (birth/pair) 반복 — 각 10/분/IP
- **측정**: bench 행 크기: saju_readings full 평균 7.3KB(15행), tarot_readings 평균 1.45KB(17행). 증가량은 레이트리밋 기반 계산값이다. 삽입 시간은 미측정(bench 쓰기 금지).
- **검증 근거**: 게스트 공유는 같은 입력이어도 매번 새 행과 새 토큰을 만든다(saju-records.service.ts:61, tarot.service.ts:314, saju-g.service.ts:302). 세 테이블 모두 정리 코드가 없다(grep 결과 deleteMany는 본인 삭제·테스트뿐). 10/분/IP면 사주는 하루 1.44만 행·약 105MB/IP, 타로는 약 21MB/IP가 쌓인다. 회원도 같은 입력으로 전체 풀이·질문·타로를 부를 때마다(캐시 히트여도) 새 행을 저장한다(saju.service.ts:329·338·659, tarot.service.ts:277, 라우트당 20/분). 쓰기는 단건 insert라 락은 짧다. 주된 문제는 영구적인 DB 파일 증가와 F-2 미스 렌더의 토큰 공급이다.
- **수정**: 게스트 공유는 (ip|guestKey, 입력 해시, includeBirth/includeQuestion) → 토큰을 메모리 LRU로 재사용하면 된다(스키마 무변경, S). 게스트 공유 발급에 IP 일일 상한도 둔다. DB 기반 중복 제거나 미조회 공유 GC는 공유 링크가 영구라는 현재 제품 결정과 충돌하므로 사용자 결정이 필요하다. 하려면 lastViewedAt/해시 열과 인덱스(스키마 변경·백필)가 든다.

### F-V1 [MEDIUM · 확정 · public · M] resvg napi 렌더 객체(Resvg·RenderedImage)의 네이티브 메모리를 V8이 몰라 major GC 전까지 픽스맵이 남는다 — 미스 렌더가 이어지면 RSS가 GC 후 기준보다 최대 약 180MB 떠 있다

- **위치**: `src/modules/tarot/tarot-share-card.ts:228`, `src/modules/saju/saju-share-card.ts:199`, `src/modules/saju-g/saju-g-share-card.ts:194`, `src/modules/settlement/settlement-card.ts:522`
- **트리거**: 공유 이미지 캐시 미스 렌더가 연달아 일어날 때(새 공유 링크에 크롤러가 몰릴 때, F-2 공격, F-V2 대형 정산표)
- **측정**: Windows tsx 프로세스에서 실측했다. 운영 Linux(glibc, 스레드별 arena)에서의 부유 크기는 미측정이다. 영구 누수는 아니다(F-1 반박 참조).
- **검증 근거**: v-leak.ts(강제 GC 없이 요청마다 이벤트 루프 양보). natural 100회: 렌더 중 316~416MB, GC 후 234MB. full(실제 타로+사주 story) 500렌더: 456~579MB, 끝난 뒤 유휴 setImmediate만으로는 568MB 유지, GC 후 395MB. async(renderAsync) 100회: 400~591MB, GC 후 438MB. 그동안 heapUsed는 51~140MB로 작아 V8이 major GC를 서두르지 않는다. story 픽스맵 1장은 8.3MB, F-V2 대형 정산은 70MB.
- **수정**: 래스터화를 sharp로 바꾸거나(Buffer는 V8 외부 메모리로 집계되고 libvips는 연산 단위로 해제됨. 스캐너 측정에서 50회 191→257MB 고원), 렌더 전용 worker를 두고 N회마다 재생성한다. renderAsync만으로는 해결되지 않는다. 운영에서 pm2 restart 횟수와 RSS를 관찰하고, Linux에서 RSS가 내려오지 않으면 MALLOC_ARENA_MAX 같은 할당자 설정을 검토한다.

### F-7 [LOW · 확정 · public · S] 사주(G) 공유 이미지·OG 가 cache-control no-store — Cloudflare·크롤러 캐시를 못 써서 모든 요청이 원 서버로

- **위치**: `src/modules/saju-g/saju-g.route.ts:300`, `src/modules/saju-g/saju-g-preview.ts:32`
- **트리거**: 사주(G) 공유 링크가 퍼질 때 og:image 와 공유 페이지 조회
- **측정**: v-resvg.ts(서비스 단위): 사주(G) 단일 253ms, 궁합 328ms. 그중 resvg 생성자(시스템 폰트 적재)가 188~192ms이고, loadSystemFonts:false면 30~33ms다. OG HTML(없는 토큰)은 0.5ms. 라우트 미스는 bench에 공유 행이 0건이라 미측정.
- **검증 근거**: 이미지·OG 응답이 no-store다(saju-g.route.ts:300, saju-g-preview.ts:32). 이미지 LRU는 50. revoke 시 images.delete로 즉시 반영하려는 의도적 선택이다. 히트는 1쿼리+zod로 싸고, F-2 수정 뒤에는 미스도 약 30ms라 정상 트래픽 영향은 작다.
- **수정**: F-2 수정(폰트 끔·renderAsync)만으로 미스 비용이 30ms대로 내려가 우선순위가 낮다. 엣지 캐시가 필요하면 public, max-age=60~300을 주고 revoke 시 Cloudflare purge를 건다. 취소 반영 지연을 허용할지는 제품 결정이다.

## G — 정산·분석·운영

### G-1 [HIGH · 확정 · public · M] 무인증 썸네일 프록시 캐시 버스팅 — 디스크 무한 증가·업스트림 fetch·sharp CPU를 요청당 싸게 유발

- **위치**: `src/modules/media/media.route.ts:36`, `src/modules/media/media.route.ts:42`, `src/modules/media/media.route.ts:69`, `src/modules/media/media.route.ts:107`, `src/modules/media/media.route.ts:118`
- **트리거**: GET /api/v1/media/thumbnail?url=https://phinf.pstatic.net/<아무 경로>?x=<난수>&w=<40~1200>&q=<40~95> 를 분당 1000회(global 한도) 반복
- **측정**: 아이폰 12MP 실사진을 JPEG(2.58MB)로 바꿔 소스로 썼다. (w,q)=(300,78): 21KB·40ms, (1200,80): 245KB·210ms, (1200,95): 508KB·281ms. 공격자가 고를 법한 표본(w 900~1199 × q 80~95)은 미스 1건당 평균 270KB이고, 분당 1000미스면 257MB/분 ≈ 370GB/일/IP다. 스캐너의 27GB/일은 dev 평균 13.4KB로 잡아 14배 작게 나왔다. 실제 라우트(cwd 샌드박스, 업스트림은 300ms 모의 fetch)에서는 다음을 확인했다: 미스 659ms, 히트 13ms. url 끝에 ?x=0..4를 붙이면 업스트림 5회·파일 5개가 생긴다(캐시 버스팅). 같은 키 8건을 동시에 보내면 업스트림 8회다(합류 없음). 서로 다른 키 64건을 동시에 보내면 RSS가 516→819MB(+303MB)로 오르고 디스크에 14.7MB가 쌓인다. sharp만 따로 재면 64건 +268MB, 128건 +427MB다(부팅 RSS 329MB 기준으로 500MB를 넘는다). 동시 미스 16/32건 동안 fs.stat(캐시 히트 경로)은 최대 782/1,374ms까지 늘어난다(평시 0.15~0.5ms). sharp가 libuv 스레드풀(기본 4)을 점유하기 때문이다. sharp 단독의 이벤트 루프 공백은 22~27ms라 문제가 아니다. JPEG 픽셀 폭탄(16000²)은 shrink-on-load 덕에 105ms로 끝나 문제가 아니다.
- **검증 근거**: 반박을 시도했지만 모두 실패했다. (a) 전역 1000/분 한도는 분 창 안의 버스트를 막지 못한다. 미스가 몰리면 요청마다 소스 버퍼와 libvips 디코드 메모리(큰 w일수록 shrink 배율이 작아 커진다)를 함께 든다. (b) Cloudflare는 확장자 없는 /api/v1/media/thumbnail?url=…을 기본으로 캐시하지 않는다. 캐시 규칙을 둬도 쿼리스트링이 키라 버스팅은 오리진까지 온다(리포에 CF 규칙 없음). (c) ALLOWED_HOSTS는 hostname만 검사하므로 경로·쿼리·w(1161값)·q(56값)는 자유다. (d) data/thumbs·receipts 정리 코드가 없다(grep으로 확인). 그래서 무인증 HIGH를 유지한다. 스캐너가 메모리를 +31MB로 잰 것은 w를 300~331로 둬서 1/8 shrink-on-load가 걸렸기 때문이다. 공격자는 w≈1200을 고른다.
- **수정**: 스캐너 수정안 (1)의 w 집합에는 앱이 쓰는 240·400·900이 빠져 있다(apps/mobile thumbUrl 호출부). 그대로 400으로 거부하면 앱 썸네일이 깨지므로, 가장 가까운 상위 버킷 {80,96,112,160,200,240,300,400,480,900,1200}으로 스냅하고 q는 {78,80}으로 스냅해야 한다. 핵심은 (3)이다. 키별 인플라이트 Promise 합류에 전역 미스 동시성 상한(예: 4, 대기열 초과 시 503)을 두면 RSS 급증과 스레드풀 경합을 함께 막는다. (4) data/thumbs 용량 상한 정리(mtime 오래된 순). 추가로 writeFile을 tmp→rename으로 원자화해야 한다. 현재는 같은 키 동시 미스가 같은 파일을 덮어쓰고, 다른 요청이 stat→stream으로 반쯤 쓴 JPEG를 immutable 30일 헤더로 내보낼 수 있다. pm2 env에 UV_THREADPOOL_SIZE=8~16을 주면 fs 지연이 완화된다. 스키마 변경은 없다.

### G-2 [HIGH · 확정 · public · M] 공개 정산 카드 PNG 캐시 미스가 이벤트 루프를 250~370ms 막는데 라우트 레이트리밋이 없어 값싸게 서버 전체 정지 가능

- **위치**: `src/modules/settlement/share-preview.ts:16`, `src/modules/settlement/share-preview.ts:175`, `src/modules/settlement/share-preview.ts:190`, `src/modules/settlement/share-preview.ts:213`, `src/modules/settlement/settlement-card.ts:526`
- **트리거**: 가입(무료) → 정산을 여러 개 만들고 공유 토큰 200개 초과 발급(사용자당 정산·공유 수 상한 없음) 또는 PUT 수정으로 updatedAt 갱신 → /s/:token/image.png 를 토큰을 돌려가며 호출
- **측정**: bench 실제 공유 세션(7명×1차×5항목)은 렌더 334~451ms, 이벤트 루프 공백 360~530ms다. 단계별로는 satori 45~61ms, new Resvg(SVG 파싱 + 시스템 글꼴 DB 스캔) 250~306ms, render 40ms, PNG 8~14ms다. 30명×3차×20항목은 670ms, 50×5×40은 1,438ms(RSS +130MB)다. 스키마 상한(100×10×200) 세션을 scratch.db에서 만들고 공유해 라우트로 첫 요청을 보내면 5,619ms 걸리고 공백이 5,590ms다. RSS는 468→867MB(maxRSS 1,094MB)라 pm2 500MB 재시작에 걸린다. PNG는 1.65~1.87MB라 LRU 200개가 차면 최대 ~374MB다. 히트 경로도 매 요청 풀 로우를 로드해 소형 3.3ms, 상한 세션 54.7ms(eventLoopMax 57ms)다. 수정안도 실측했다: (a) font:{loadSystemFonts:false}면 Resvg 생성자가 260~306→2ms로 줄고 PNG sha1(86ec5dae08f6)이 같다. (b) resvg-js 내장 renderAsync면 공백이 소형 362→36ms, 상한 4,989→2,479ms로 준다(satori 몫이 남는다). (c) fonts 배열을 고정(lib/share-fonts loadShareFonts)하면 satori가 61→32ms로 소폭 준다.
- **검증 근거**: 반박을 시도했지만 실패했고, 상한 케이스 실측으로 심각도가 더 올라간다. (a) Cloudflare는 .png를 5분 엣지 캐시한다. 그러나 쿼리스트링으로 우회되고, 오리진 LRU 키는 (token, updatedAt)이라 쿼리 우회만으로는 싼 히트밖에 안 생긴다. 미스를 강제하려면 무료 가입 뒤 정산을 PUT으로 수정하거나 토큰을 200개 넘게 만들면 된다(정산·공유 수 상한 없음을 create 코드에서 확인). 다만 히트 경로 자체가 상한 세션이면 55ms의 무인증 증폭이다(라우트 rateLimit 없음, 전역 1000/분). (b) 정상 사용에서도 공유·편집 직후 첫 조회마다 서버 전체가 ~0.35s 멈춘다. (c) 스키마가 100명×10차×200항목을 허용하므로 큰 회식 정산을 한 번 공유하는 것만으로 재시작된다. 운영(리눅스)에서는 시스템 글꼴이 적으면 Resvg 생성자 비용이 이보다 작을 수 있다. 그래도 satori+raster ~130ms와 상한 케이스 5s·+400MB는 플랫폼과 무관하다. 다른 에이전트 15개가 동시에 돌아 절대 시간은 부풀어 있을 수 있다.
- **수정**: 효과가 큰 순서는 다음과 같다. ① new Resvg 옵션에 font:{loadSystemFonts:false} 추가: 1줄이고 결과가 바이트 동일하며 소형 렌더가 ~70% 준다(satori가 글자를 path로 박아 resvg에는 글꼴이 필요 없다). ② new Resvg().render()를 renderAsync로 바꿔 래스터를 libuv 스레드풀로 넘긴다(공백 -90%). ③ 셀 수 상한(예: 참여자×열 1,500 초과면 상위 N명+'외 N명' 요약 카드 또는 413). satori 레이아웃과 메모리 폭증은 ②로도 빠지지 않으므로 필수다. ④ 키별 인플라이트 합류 + 전역 동시 1 큐. ⑤ LRU를 maxSize(바이트, 예: 32MB)로 바꾼다. ⑥ 히트 경로는 shareToken으로 updatedAt·shareExpiresAt만 경량 select해 키를 확인하고, 미스일 때만 풀 로드한다. ⑦ image.png 4개 라우트에 config.rateLimit(예: 30/분). satori까지 메인 스레드에서 빼려면 DEFERRED #13 worker가 필요하지만 ①~③이 먼저다. 스키마 변경은 없다.

### G-3 [HIGH · 확정 · login · M] 영수증 업로드·추출에 레이트리밋·일일 한도·보존 정리가 없어 가입만 하면 비전 LLM·HEIC 디코드·디스크를 무제한 소모

- **위치**: `src/modules/settlement-extraction/settlement-extraction.route.ts:58`, `src/modules/settlement-extraction/settlement-extraction.route.ts:89`, `src/modules/settlement-extraction/settlement-extraction.service.ts:185`, `src/modules/settlement-extraction/settlement-extraction.service.ts:210`, `src/modules/settlement-extraction/settlement-extraction.service.ts:584`
- **트리거**: 로그인 사용자(가입 40/시간/IP로 계정 확보)가 POST /settlement-extraction/upload(HEIC) 와 /extract 를 분당 최대 1000회(global) 반복
- **측정**: 실제 아이폰 HEIC(3024×4032, HEVC, 1.6MB — sharp가 디코드하지 못함을 확인)로 쟀다. 업로드 라우트는 1,249~1,457ms 걸리고 이벤트 루프 공백이 1,045~1,103ms다. libheif wasm 디코드 517ms와 jpeg-js q92 인코드 433ms가 모두 메인 스레드에서 돈다. 깨끗한 앱(RSS 329MB)에 HEIC를 처음 올리면 처리 중 maxRSS가 563MB로 500MB를 넘는다. GC 뒤에도 426MB(+97MB)로 남는다(wasm 선형 메모리는 줄지 않음, external +73MB). JPEG 2.5MB 업로드는 대조군으로 212ms, 공백 17ms다. extract를 없는 imageToken으로 부르면 LLM 없이 30.6ms지만, 요청마다 operation_runs 1행·operation_logs 2행 INSERT와 run UPDATE 1회(4쓰기)가 생긴다. 분당 1000회면 하루 run 144만·log 288만 행/IP다. 쌓인 로그 20만 행을 보존 정리하면 한 문장 DELETE가 2,768ms(72k행/s) 걸리고, 그동안 별도 프로세스 쓰기는 2,643ms 기다렸다. 하루치 플러드면 ~40초로 busy_timeout(30s)을 넘는다. 비전 LLM 비용은 호출 금지라 재지 않았다.
- **검증 근거**: 반박을 시도했지만 실패했다. (a) 앱은 픽 시점에 JPEG로 바꾼다. 그러나 웹은 accept에 image/heic를 명시해(apps/web/src/routes/settlement/Step2Rounds.tsx:354, MultiReceiptSplitDialog.tsx:214) iOS Safari·맥 사용자의 HEIC 원본이 그대로 올라오는 정상 경로다. 스캐너가 쓴 120×90 픽스처(16ms)로는 이 비용이 드러나지 않는다. (b) 로그인이 필요하지만 가입은 무료다(40/시간/IP). (c) bench의 llm_provider_configs가 0행이고 dev .env OLLAMA_CLOUD_MAX_CONCURRENT=5라, 'image' purpose 게이트 한도가 계정 게이트 한도(용도 최대값)와 같다. 그래서 extract 플러드가 계정 슬롯 전부를 잡고 다른 LLM 기능은 FIFO로 끼어들 때마다 비전 1콜만큼 기다린다(정적 분석). 측정한 HEIC 블로킹·메모리 때문에 MEDIUM→HIGH로 올린다.
- **수정**: 스캐너 수정안(RATE.receiptUpload·receiptExtract 프리셋, extract 일일 한도, receipts 미참조 N일 정리 cron)은 유효하다. 여기에 더할 것은 다음과 같다. HEIC는 웹 accept에서 image/heic를 빼 iOS가 JPEG로 자동 변환하게 두고(실기기 확인 필요) 서버는 HEIC를 415로 거절하는 것이 가장 싸다. 서버에서 HEIC를 계속 받아야 한다면 단명 worker_threads(작업 뒤 terminate해 wasm 메모리 반환)와 동시 1로 격리한다(DEFERRED #14). extract 실패 경로의 run·log 쓰기는 레이트리밋으로 상한을 건다. cleanupExpiredOperationLogs는 LIMIT 5000 배치 DELETE 루프로 바꿔 락을 잘게 나눈다. DB 스키마 변경은 없다(일일 한도를 UsageQuota로 하면 api-contract feature enum 추가 정도).

### G-V1 [HIGH · 확정 · login · M] 정산 임시저장 목록이 payload 전체(최대 50×204,800자, 한글이면 건당 ~600KB)를 매번 내려줘 응답 30MB·이벤트 루프 260ms, 동시 4건이면 RSS 833MB

- **위치**: `src/modules/settlement/settlement-draft.service.ts:65`, `src/modules/settlement/settlement-draft.service.ts:43`, `src/modules/settlement/settlement-draft.route.ts:36`, `packages/api-contract/src/schemas/settlement-draft.ts:29`
- **트리거**: 로그인 사용자가 PUT /api/v1/settlement-drafts로 placeId를 바꿔 가며 한글 204,700자 payload 50개를 저장한다(1회 30MB 업로드, 사용자당 50행 상한 안). 그 뒤 GET /api/v1/settlement-drafts를 반복하거나 동시에 호출한다.
- **측정**: scratch.db에서 쟀다. PUT 1건(614KB 본문)은 229ms다. 50건을 저장한 뒤 GET 목록 1회는 응답 30.1MB, 중앙값 330ms(5회), eventLoopMax 260ms다. --expose-gc 별도 프로세스에서 동시 GET 1/4/8건을 보내면 maxRSS가 490/833/1,373MB까지 오른다(앱 부팅 RSS ~330MB).
- **검증 근거**: list()가 take·select 없이 payload까지 전부 읽고, rowToDraft가 행마다 JSON.parse한 뒤 응답 직렬화로 다시 문자열화한다. 크기 제한은 JSON.stringify(v).length(UTF-16 글자 수) ≤ 204,800이라 한글은 UTF-8로 3배(614KB/건)가 된다. 클라이언트 훅(useSettlementDraft.ts) 주석도 '전체 draft(payload 포함, 최대 수 MB)'를 인정하며, staleTime 30s·포커스 refetch로 자주 부른다.
- **수정**: 목록에서는 payload를 빼고(id·placeId·placeNameHint·updatedAt·바이트 크기만) 내려준다. 이어쓰기 화면은 placeId로 단건 GET(라우트 추가)해 해당 draft만 받는다. 크기 검사는 Buffer.byteLength 기준 200KB로 바꾸고, 사용자 총합 상한(예: 2MB)을 둔다. PUT 응답도 payload 대신 id·updatedAt만 돌려준다.

### G-4 [LOW · 확정 · background · S] 글로벌 머지 저장 트랜잭션이 키마다 개별 update/create — 쓰기 락 장기 점유, 기본 5초 interactive 타임아웃에 근접

- **위치**: `src/modules/analytics/analytics.service.ts:535`, `src/modules/analytics/analytics.service.ts:551`, `src/modules/analytics/analytics.service.ts:596`, `src/modules/schedule/schedule.service.ts:228`
- **트리거**: 매일 03:00 normalize-merge cron(full=false 라도 미링크 그룹이 1개라도 있으면 전 키 재작성) 또는 어드민 머지 실행
- **측정**: scratch.db에서 실제 menu_canonicals(1,125행·norm 682)에 합성 키를 더해 3,000 키로 analytics.service.ts:535 트랜잭션을 그대로 재현했다. 첫 저장(create)은 1,052ms·3,012쿼리다. 재저장(update, 현재 매일 경로)은 1,501ms·3,012쿼리다. 별도 프로세스 쓰기 프로브는 각각 1,078ms와 1,528ms 기다렸다. 수정안(값이 같은 키는 update 생략)은 65ms·12쿼리·프로브 78ms로 23배 빠르다.
- **검증 근거**: bench.db는 global_menu_canonicals가 0행이라 실데이터로는 잴 수 없어, 운영 규모(메모리 기록: 299청크 ≈ 3,000 입력)로 합성했다. full=false여도 미링크가 1건이라도 있으면 전량 입력이 다시 저장되는 것은 코드로 확인했다(입력 필터 없음). 03:00에 하루 1회 도는 배치이고 쓰기 락이 ~1.5s라 영향은 작다. 키당 ~0.5ms면 기본 5s interactive 타임아웃에는 ~1만 키에서 닿으므로 현재 대비 3배 여유가 있다. LOW를 유지한다.
- **수정**: '기존 행과 displayName·categoryPath가 같으면 update 생략'만으로 효과 대부분을 얻는다(실측 23배, S). $transaction에 timeout·maxWait을 명시하는 것도 권장한다. 링크 전량 재작성은 1,125행 기준 수십 ms라 후순위다. 스키마 변경은 없다.

### G-5 [LOW · 확정 · public · S] 로그인·가입 bcryptjs 가 요청당 이벤트 루프 ~52ms 점유(DEFERRED #22 재평가)

- **위치**: `src/lib/hash.ts:1`, `src/modules/auth/auth.service.ts:30`
- **트리거**: POST /api/v1/auth/login (IP당 20/분), POST /auth/register (IP당 40/시간)
- **측정**: POST /api/v1/auth/login에 틀린 비밀번호를 보내면 중앙값 52.5ms(p95 53.6ms), eventLoopMax 53.9ms다(10회, scratch 앱).
- **검증 근거**: authLogin 20/분/IP로 IP당 분당 ~1초 블로킹이 상한이다. 위험은 분산 IP 공격일 때만 의미가 있고 ≥100ms 기준에 못 미친다. DEFERRED #22 보류 판단은 수치로 보아도 타당하다.
- **수정**: @node-rs/bcrypt(또는 bcrypt 네이티브)로 바꿔도 $2a$/$2b$ 해시가 호환돼 마이그레이션이 필요 없다. 교체 비용은 작지만 급하지 않다.

### G-6 [LOW · 추정 · background · S] 텔레그램 롱폴·송신 fetch 에 타임아웃이 없고(주석과 불일치) 핸들러를 폴링 루프 안에서 await

- **위치**: `src/modules/telegram/telegram.service.ts:400`, `src/modules/telegram/telegram.service.ts:413`, `src/modules/telegram/telegram.service.ts:338`
- **트리거**: 텔레그램 API 연결이 반쯤 끊겨(half-open) 응답이 오지 않거나, 콜백 핸들러(random-crawl)가 오래 걸릴 때
- **검증 근거**: 코드로 확인했다. telegram.service.ts의 getUpdates·call fetch에는 stop/reconfigure용 abort만 있고 시간 제한이 없다(주석과 불일치). undici 기본 headers/body timeout은 300s다. dispatch도 폴링 루프 안에서 await하므로 runDiscoverAndReply→runScheduled(검색·후보 전송)가 끝날 때까지 다음 업데이트를 받지 않는다. 서버 CPU·메모리 부담은 없고 어드민 봇 응답성 문제다. 외부 호출이 금지라 재지 않았다.
- **수정**: 스캐너안 그대로 간다. getUpdates에는 AbortSignal.any([abort.signal, AbortSignal.timeout((timeout+10)*1000)]), call에는 lib/fetch-timeout.ts를 재사용하고, dispatch는 void로 분리한 뒤 핸들러 안에서 직렬화한다.

### G-V2 [LOW · 추정 · admin · S] 글로벌 머지 상호배제(mergeInflight)가 인스턴스 필드인데 AnalyticsService가 두 개라 어드민 수동 머지와 스케줄 머지가 동시에 돈다

- **위치**: `src/modules/analytics/analytics.service.ts:207`, `src/modules/analytics/analytics.service.ts:241`, `src/plugins/schedule.ts:25`, `src/modules/analytics/analytics.route.ts:26`, `src/modules/analytics/analytics.route.ts:76`
- **트리거**: 어드민이 /api/v1/admin/analytics/global-merge-jobs로 머지(수 분~수 시간)를 돌리는 동안 03:00 normalize-merge cron이나 '스케줄 지금 실행'이 겹칠 때
- **검증 근거**: 주석은 '앱 전역 singleton service이므로 인스턴스 플래그 하나로 상호배제'라고 하지만, new AnalyticsService가 plugins/schedule.ts:25와 analytics.route.ts:26 두 곳에 있다. 어드민 라우트는 globalMergeJobRegistry.inflightJobId()로 자기 잡만 막고, 스케줄 경로는 scheduleRegistry로 자기 회차만 막아 서로를 막는 가드가 없다. readCache도 인스턴스마다 따로라, 스케줄 머지 뒤 어드민 통계는 TTL(60s) 동안 옛 값을 보여 준다.
- **수정**: plugins/schedule.ts에서 만든 AnalyticsService를 app.decorate('analytics', …)로 공유하고 analytics.route.ts가 그것을 쓰게 한다. 또는 mergeInflight를 모듈 수준 변수로 올린다.

## X — 플랫폼 교차

### X-2 [HIGH · 확정 · public · S] sqlite_stat1 부재로 플래너가 저선택도 인덱스를 고름 — 집값 지도 points 가 47k 단지 전체를 훑음(ANALYZE 후 18배 단축), 여행로그 placeId 조회는 dataset 인덱스로 스캔

- **위치**: `src/modules/housing/housing.service.ts:293`, `prisma/schema.prisma:2269`, `prisma/schema.prisma:2734`, `deploy.sh:303`
- **트리거**: 무인증 GET /api/v1/housing/points zoom≥13(지도 이동마다, housingRead 분당 240), 여행로그 장소별 조회(tour_visits/tour_transitions/tour_spend 의 placeId+dataset 조건), tour_places sido+typeShort 목록
- **측정**: v-analyze.sh·v-analyze-time.sh(CLI), v-plans.ts(앱 공개·로그인 GET 82개의 실제 SQL 189개를 통계없음/전체/한도 통계에서 EXPLAIN 비교), v-plans2.ts(같은 scratch.db 에서 통계만 바꿔 9회 중앙값), v-app.ts(라우트 단위 bench vs scratch), v-poolhol.ts. 같은 파일 비교(없음→전체 ANALYZE): points 강남 z14 155→4.2ms, points 넓은 z14 127→42ms, cells z11 295→29ms, count 넓은 131→4.3ms, nearby 139→1.3ms, status count 4개 126~144→13.5~19ms(1개 1.7→13ms 소폭 악화). 한도 통계(PRAGMA optimize 기본 한도)에서는 kind 를 '47193 465'로 오추정해 155~191ms 그대로. 라우트 중앙값 bench→scratch: points 강남 196~269→18ms, 넓은 445~463→203ms, cells 미스 243~312→29ms, nearby 171~432→9ms, status 485~631→78ms. 소요: 전체 ANALYZE 5.0~6.2s(housing_trades 4.2s, 그 밖 테이블별 0.13~0.76s), PRAGMA optimize=0x10002(한도 비트 0x10 제외) 통계0→5.0s·전체와 동일 통계, 0x10012(기본 mask 와 같은 한도) 2.0s, 통계 있으면 optimize 85~100ms.
- **검증 근거**: 실제 앱 쿼리로 재검증: 189개 중 42개 계획이 바뀌고 의미 있는 개선은 전부 집값(housing_complexes 의 kind 는 'apt' 단일값인데 통계가 없으면 (kind, households) 인덱스를 골라 4.7만 행 전체를 훑음). 공개 지도 기본 경로가 10~35배 빨라지고 status 는 ≥500ms 에서 78ms 로. 동시성 증폭: 풀 5(소형 VPS 가정)에서 넓은 points 8개 동시면 무관한 역 검색이 중앙 399ms·최대 580ms, auth/me 가 중앙 831ms·최대 1,014ms 로 밀림(혼자 1~2ms) — HIGH 유지. 반박된 부분: 스캐너의 여행로그 placeId+dataset·tour_places sido+typeShort 계획 문제는 손으로 쓴 SQL(plans3.ts) 기준이었다. 실제 공개 경로(tour-stats·insights)는 dataset 조건이 없어 통계 유무와 무관하게 placeId/id 인덱스를 쓰고(계획 불변), tour_places sido 목록은 어드민 시드 콘솔뿐이다. 회귀 점검: 비집값 핫 경로(life store·parking ev·맛집 목록)는 ANALYZE 전후 103→111·64→70·139→143ms 로 잡음 범위, 계획 바뀐 나머지 쿼리는 전부 ±1ms 이내 소형 테이블.
- **수정**: (1) 운영 조치(스키마 변경·백필 없음): 적재 뒤 deploy.sh 에서 `PRAGMA analysis_limit=0; ANALYZE housing_complexes; ANALYZE housing_complex_stats; …` 처럼 테이블별로(각 0.1~0.8s 쓰기 락) 돌리거나 서버 정지 구간에 전체 ANALYZE(5~6s 쓰기 락 — X-1 미수정이면 그동안 요청 쓰기가 5.5s 에 실패). housing_trades(4.2s)는 스윕에서 계획 변화가 없어 생략 가능. 기본 `PRAGMA optimize`(2000행 한도)에 맡기면 kind 를 465행으로 오추정해 효과가 없다 — 쓰려면 SQLite 3.46+ CLI 에서 `PRAGMA optimize=0x10002` 로(서버의 sqlite3 버전 확인 필요, 구버전은 명시 ANALYZE). 이후 주기 optimize 는 85~100ms no-op. (2) 코드 방어: 원시 SQL(points·cells)의 `FROM "housing_complexes" c` 에 `INDEXED BY housing_complexes_lat_lng_idx` — 통계 없이도 points 강남 4.2ms·cells 47.7ms 실측. 인덱스 이름이 바뀌면 쿼리가 오류가 되므로 테스트로 고정. Prisma 생성 쿼리(nearby·status count)는 힌트가 불가해 통계가 필요하다(또는 단일값인 kind 조건 제거 — 운영 분포 확인 후). (3) (kind, households) 인덱스는 단지명 검색의 세대수 정렬에 쓰이므로 지우지 말고 통계로 해결.

### X-3 [HIGH · 확정 · public · M] 메모리 예산: 부팅 직후 RSS 235MB, 무인증 요청 1~3개로 500MB 를 넘김(피크 617~688MB, 잔존 580MB) — pm2 max_memory_restart 재시작 위험

- **위치**: `docs/deploy-friendly.md:92`, `docs/deploy-friendly.md:95`, `src/modules/tour/tour-insights.service.ts:74`, `src/modules/tarot/tarot-share-card.ts:3`, `src/modules/saju/saju-share-card.ts:4`, `src/modules/crawl/adapters/naver-place.playwright.adapter.ts:10`, `src/modules/meal/meal-photo.service.ts:6`
- **트리거**: 무인증 GET /api/v1/tour/public/insights?region=all(캐시 미스) 1회 → RSS 피크 617MB·잔존 408MB, 이어서 공유 이미지 /tarot/s/:token/image.png?format=story·/saju-c/s/:token/image.png?format=story 각 1회 → 잔존 580~586MB
- **측정**: v-mem.mjs — 현재 소스로 새로 빌드한 운영 번들(data/perf2/x/vdist; 스캐너가 쓴 dist 는 9/24 빌드라 parking·meal-nutrition 누락)을 순수 node --expose-gc 로(bench.db). 기본 플래그: ready RSS 240MB(heapUsed 76MB) → 넓은 housing points 뒤 302MB → tour insights region=all 캐시 미스 1,638ms·피크 668MB·GC 후 잔존 427MB → 타로 story PNG 뒤 589MB → PNG 7개 더(타로·사주·정산) 동안 잔존 486~636MB → 5초 뒤 544MB. --max-old-space-size=320 --max-semi-space-size=16: ready 201MB, 피크 577MB, 끝 450MB(Windows private commit 519MB). deps.mjs 단독 import: playwright-extra 367ms/+33MB, playwright 397ms/+32MB, satori 119ms/+15MB, sharp 69ms/+10MB, heic-convert 61ms/+12MB, resvg 12ms/+4MB. v-lock.ts: 집값 통계 재구축 중 프로세스 RSS +283MB.
- **검증 근거**: 반박 시도 1 — 오래된 dist 로 잰 것 아닌가: 현재 소스로 재빌드해도 ready 240MB(스캐너 235MB)로 같다. 반박 시도 2 — Windows 작업 집합 과대 아닌가: 플래그 적용 시 private commit 도 519MB 로 '반환 안 된 페이지가 집계만 남은' 수준이 아니라 실제 커밋 메모리다. 다만 Linux glibc 의 반환 특성은 미검증이고, pm2 는 RSS 를 주기적으로(기본 약 30초) 보므로 1~2초 피크(668MB)보다 잔존치(544~636MB)가 판단 근거다. 반박 시도 3 — 트리거가 비싼가: tour insights(tourRead 분당 120)·공유 PNG(publicShare 분당 120) 모두 무인증이고, 타로 공유 토큰은 게스트가 분당 10개 발급 가능해 캐시 미스를 싸게 만든다. 무인증 요청 2~5개로 잔존 RSS 가 500MB 를 넘음(기본 플래그 2개, 플래그 적용 5개) → HIGH 유지. 재시작은 진행 중 SSE·요약·크롤을 끊고 server.ts 가 재큐잉·군집 리컨실을 다시 돈다(운영 tour 적재 범위에 따라 insights 비중은 달라짐).
- **수정**: (1) node 플래그: 실측 ready −39MB·피크 −91MB·잔존 −94MB — 필요하나 단독으론 부족. (2) playwright·playwright-extra·satori·sharp·heic-convert 를 사용 시점 dynamic import: 기저 약 −70MB·부팅 약 −0.6s(현재 vdist chunk 들이 정적 import). (3) tour insights 'all' 의 11.5만 행 JS 적재를 SQL GROUP BY 로(여행로그 묶음 — +188MB 잔존의 주원인). (4) 공유 PNG 는 CPU 의 대부분이 동기 resvg(프로파일 resvg 3.45s vs satori 0.18s). 스캐너 안의 worker_threads 는 같은 프로세스라 RSS 를 줄이지 못한다(이벤트 루프만 해소 → X-V1 의 renderAsync 가 더 싸다). 메모리를 pm2 감시 밖으로 빼려면 자식 프로세스여야 하고, 현실적인 1차안은 X-4 바이트 상한 캐시 + 렌더 동시성 1~2 제한. (5) max_memory_restart 상향은 증상 가리기 — 위 조치 후 운영 pm2 monit 로 재측정해 정한다.

### X-V1 [HIGH · 확정 · public · S] 공유 이미지 PNG 렌더가 resvg 동기 render() 로 캐시 미스마다 이벤트 루프를 0.3~0.7초 막음 — renderAsync 로 대부분 해소 가능

- **위치**: `src/modules/tarot/tarot-share-card.ts:228`, `src/modules/saju/saju-share-card.ts:199`, `src/modules/settlement/settlement-card.ts:522`, `src/modules/saju-g/saju-g-share-card.ts:194`, `src/modules/tarot/tarot-preview.ts:76`
- **트리거**: 캐시 미스 PNG 요청 — /tarot/s/:token/image.png?format=og|story, /saju-c/s/:token/image.png, /share/settlements/:token/image.png(+/s/ 별칭), /api/v1/saju-g/shares/:token/image.png. 게스트가 타로 공유 토큰을 분당 10개 발급할 수 있어 토큰×형식마다 새 렌더를 싸게 만든다
- **측정**: v-mem.mjs·v-png-prof.mjs/v-prof-sum.mjs·v-resvg-async.mjs
- **검증 근거**: v-mem.mjs(vdist): 캐시 미스 렌더 1건당 이벤트 루프 최대 지연 — 타로 story 526~683ms, 타로 og 319~407ms, 사주 story 482~562ms, 사주 og 296~310ms, 정산 263~320ms(캐시 히트 16ms). v-png-prof.mjs CPU 프로파일(렌더 6건): resvg 3,454ms vs satori+yoga 178ms·폰트 파싱 135ms·sharp 83ms — 블로킹 대부분이 동기 Resvg.render(). v-resvg-async.mjs: 같은 1080×1920 SVG 를 render() 로 하면 294~457ms 동안 루프가 완전히 멈추고(5ms 타이머 3회), @resvg/resvg-js 2.6.2 의 renderAsync() 는 최대 지연 33~71ms(타이머 20~26회 정상 — 남는 건 asPng 인코딩).
- **수정**: 4곳의 `new Resvg(svg, opts).render().asPng()` 를 `(await renderAsync(svg, opts)).asPng()` 로(이미 설치된 2.6.2 에 있음, libuv 스레드풀에서 래스터). 렌더 동시성을 1~2로 제한(세마포어)해 스레드풀·네이티브 메모리 피크를 묶고, X-4 의 바이트 상한 캐시·긴 cache-control 로 원본 렌더 자체를 줄인다. worker_threads 전환보다 훨씬 작은 변경이고, 메모리(RSS)는 같은 프로세스라 별도(X-3·X-4)로 다뤄야 한다.

### X-1 [MEDIUM · 확정 · public · S] busy_timeout 30s·synchronous NORMAL 이 Prisma 풀의 첫 연결에만 걸림 — 나머지 연결은 5s·FULL 이라 5초 넘는 쓰기 락 동안 요청 쓰기가 'database is locked' 로 실패

- **위치**: `src/plugins/prisma.ts:17`, `src/plugins/prisma.ts:18`, `src/plugins/prisma.ts:19`, `src/plugins/prisma.ts:23`, `docs/deploy-friendly.md:31`
- **트리거**: 아무 쓰기 트랜잭션이 5초 넘게 락을 잡을 때(집값 통계 재구축 ~12s, ANALYZE 5~23s, deploy.sh 가 서버 가동 중 돌리는 load:* 적재, 글로벌 머지, 본문이 느린 인터랙티브 트랜잭션) 동시에 들어온 모든 요청 쓰기(투표·타로 공유·식단 기록·정산 등)
- **측정**: data/perf2/x/v-pool.ts(전용 v-pool.db). (A) 인터랙티브 tx K=20/40/60 동시 → 동시에 열린 tx 는 항상 1개(BEGIN IMMEDIATE 직렬화), K=40·60 에서 31·32개가 maxWait 2.5s/busy 5s 로 실패. (B) URL 기본: 부팅 직후 순차 20회 busy 30000 20/20 → 동시 64회 busy {5000:56, 30000:8}·synchronous {NORMAL:15, FULL:49} → 버스트 뒤 순차 200회 busy 5000·FULL 200/200, 4동시×50 도 5000 200/200. ?socket_timeout=30: 동시 64·순차 200 모두 busy 30000(synchronous 는 FULL 그대로). (C) 다른 클라이언트가 쓰기 락 8초 보유 중: URL 기본 → 자동커밋 6/6 P2010 'database is locked'@5.56s, itx(기본·maxWait 40s 둘 다) 6/6 P1008 Socket timeout@5.54s, 배치 tx 3/3 P1008@5.56s, 읽기 2ms 정상 / socket_timeout=30 → 16/16 성공(8.1~9.3s). 로그된 트랜잭션 문은 'BEGIN IMMEDIATE'. (E) 단일 연결 자동커밋 300회: FULL 1.18~1.37ms vs NORMAL 0.18~0.23ms/커밋.
- **검증 근거**: 반박 시도 1 — 순차 트래픽이면 첫 연결(30s·NORMAL)만 쓰지 않을까: 아니다. 버스트 한 번 뒤로 순차 200/200 이 5000·FULL 연결을 받았다. 운영도 페이지당 병렬 API·서비스의 Promise.all(housing status 는 요청 1건에 13쿼리 병렬)로 버스트가 상시라 사실상 모든 쿼리가 5s·FULL 이다(기술적 주장은 전부 재현). 반박 시도 2 — 5초 넘는 쓰기 락이 실제로 자주 있나: 기본 설정의 평시 경로엔 드물다(v-ev.ts: 10분 EV 폴러는 UPDATE 61문장 각 ≤116ms·동시 쓰기 최대 대기 81~207ms, 앱 itx 는 기본 timeout 5s 로 자기 제한). 실재하는 창은 ① 집값 통계 재구축 락 12~18s(갱신 cron 기본 off 지만 load:housing-*·deploy 케이스 8 이 서버 가동 중 실행), ② X-2 대로 ANALYZE 를 도입하면 전체 5~6s, ③ 배포 중 전량 교체 적재(상가 ≥36~86s — 30s 로도 못 막음, X-V3). '특정 창에서 쓰기가 기다리지 않고 5.5초 뒤 500' 이므로 HIGH→MEDIUM. 단 X-2·X-5 수정의 선행 조건이라 우선순위는 1순위. 추가 확인: Prisma SQLite itx 는 BEGIN IMMEDIATE 라 읽기 전용 itx 도 전역 쓰기 락을 잡고, 대기자가 많으면 SQLite 기본 busy 핸들러 백오프(최대 100ms 수면) 때문에 짧은 작업도 5초 안에 차례를 못 받는다(K=40 에서 31개 실패).
- **수정**: (1) plugins/prisma.ts 에서 new PrismaClient({ datasourceUrl }) 로 env.DATABASE_URL 에 socket_timeout=30(없을 때만)을 덧붙인다 — 모든 연결 busy_timeout=30000·8초 락 중 쓰기 16/16 성공 실측. .env·스키마·백필 변경 없음. X-V2 의 connection_limit 명시와 같이 넣으면 된다. 30초를 넘는 락(배포 중 상가 교체)은 여전히 실패하므로 X-V3 별도. (2) synchronous=NORMAL 을 모든 연결에 거는 URL 옵션은 없다. driver adapter(better-sqlite3/libsql)는 쿼리를 메인 스레드에서 동기 실행해 housing status 485~631ms·통계 집계 단일 쿼리 83s 같은 느린 쿼리가 그대로 이벤트 루프를 막으므로 권하지 않는다. FULL 을 받아들이고(커밋당 +~1ms, 운영 디스크에서 재측정) 플러그인 주석·배포 문서의 '30000/NORMAL' 서술을 사실대로 고친다. (3) '인터랙티브 tx = 전역 쓰기 락, 본문에서 외부 호출·긴 계산 금지' 규칙을 문서화.

### X-4 [MEDIUM · 확정 · public · S] 공유 PNG LRU 캐시 5종이 개수만 제한·바이트 상한 없음 — 최악 수백 MB 상주

- **위치**: `src/modules/tarot/tarot-preview.ts:20`, `src/modules/saju/saju-preview.ts:16`, `src/modules/settlement/share-preview.ts:15`, `src/modules/saju-g/saju-g.route.ts:46`, `src/modules/tarot/tarot-card-texture.ts:13`
- **트리거**: 서로 다른 공유 토큰 × format(og/story) 으로 이미지 GET(publicShare 분당 120, 정산 이미지는 global 1000) — 공유가 늘수록 자연적으로도 채워짐
- **측정**: v-mem.mjs 실측 PNG 크기: 타로 story 1,270~1,309KB·og 541KB, 사주 story 606~652KB·og 244KB, 정산 112KB. 캐시 정의(코드): tarot-preview.ts:20 max 100, saju-preview.ts:16 max 100, share-preview.ts:15 max 200, saju-g.route.ts:46 max 50, tarot-card-texture.ts:13 max 80 — 모두 개수 상한만. 꽉 찬 최악치(계산): 타로 100×1.3MB≈130MB + 사주 100×0.65MB≈65MB + 정산 200×0.11MB≈22MB ≈ 217MB(사주G 는 bench 에 공유 0건이라 미측정).
- **검증 근거**: 반박 시도: 캐시가 차려면 서로 다른 토큰×형식이 필요하다 — 타로는 게스트가 공유 토큰을 분당 10개(RATE.tarotShare) 발급할 수 있어 IP 하나로 약 5분이면 100칸(50토큰×og/story)을 채울 수 있고, 자연 트래픽으로도 공유가 쌓이면 차며 LRU 는 개수로만 밀어내 바이트가 줄지 않는다. Buffer 는 V8 힙 밖이라 RSS 에 그대로 더해져 X-3 의 240MB 기저와 합치면 단독으로 450MB 대. tarot-preview.ts 주석('PNG 수십~수백 KB, 100개면 넉넉')은 story 1.3MB 와 맞지 않는다. 최악치는 계산값이라 MEDIUM 유지.
- **수정**: 다섯 캐시를 LRUCache({ maxSize: 합계 32MB 안팎, sizeCalculation: (b) => b.length }) 로 — 최악 약 217MB→32MB, 스키마 변경 없음. 타로·사주 공유는 불변이라 PNG cache-control 을 public, max-age=86400 이상으로 올리면 .png 를 Cloudflare 가 엣지 캐시해 원본 렌더(X-V1 의 이벤트 루프 블로킹)도 함께 줄어든다. 정산은 (token, updatedAt) 키라 같은 URL 에 긴 max-age 를 주면 편집 반영이 늦으므로 300s 유지하거나 og:image URL 에 updatedAt 버전을 붙인다.

### X-5 [MEDIUM · 확정 · background · M] 집값 통계 재구축이 한 인터랙티브 트랜잭션에서 31만 행 전량 삭제·재삽입 — 쓰기 락 ~12s, 앞단 집계 253s 를 서버 프로세스에서 수행

- **위치**: `src/modules/housing/housing-derived.service.ts:391`, `src/modules/housing/housing-refresh.service.ts:53`
- **트리거**: HOUSING_REFRESH_CRON 을 켰을 때(기본 off, 문서 예시 '0 4 2,17 * *' = logs-retention 04:00 과 같은 시각; food-import 도 매월 1일 04:00)
- **측정**: v-lock.ts(전용 scratch.db, 다른 에이전트 부하 중): 행 311,237, 전체 422s, 트랜잭션 전 집계 SELECT 24개 DB 합 403s(단일 최대 83s), 쓰기 락 구간(BEGIN IMMEDIATE~COMMIT 이벤트 시각) ≈17.7s 인데 그 안 쿼리 4,362개의 DB 합은 1.9s(락 시간 대부분이 Prisma createMany 직렬화·왕복), 동시 요청 쓰기 최대 대기 17.4s(socket_timeout=60 이라 성공 — 운영 기본 5s 연결이면 실패), 프로세스 RSS 120→403MB(+283MB). v-stats-swap.sql: 같은 31만 행을 스테이징 테이블에서 SQL 만으로 교체(DELETE+INSERT SELECT)하면 쓰기 락 ≈1.0s.
- **검증 근거**: 반박 시도: HOUSING_REFRESH_CRON 기본값은 '' (off)이고 수동 갱신 라우트도 없어 서버 프로세스 안에서는 cron 을 켰을 때만 돈다. 그러나 같은 rebuildHousingStats 를 load:housing-trades/complexes·rebuild:housing-derived(deploy.sh 케이스 8)가 서버 가동 중 실행하므로 12~18s 쓰기 락은 실재한다. 새로 확인: cron 을 켜면 서버 프로세스 RSS 가 +283MB 늘어 X-3 기저 240MB 와 합쳐 약 520MB → pm2 재시작으로 재구축이 중간에 죽고 다음 회차에 반복될 위험(켜는 순간 HIGH 급). 기본 off 라 MEDIUM 유지. 크론 간 전역 상호배제 없음, 문서 예시 '0 4 2,17 * *' 가 logs-retention(04:00)·food-import(매월 1일 04:00)·배포 문서의 sqlite3 .backup cron(04:00)과 겹치는 것도 확인.
- **수정**: 스캐너 안 'INSERT INTO 스테이징 SELECT …' 는 그대로 하면 위험하다: 무거운 집계(단일 쿼리 최대 83s)를 메인 DB 테이블로 바로 INSERT…SELECT 하면 집계 시간 내내 쓰기 락을 잡아 지금(12~18s)보다 훨씬 나빠진다. 올바른 형태는 (a) 시군구 등 파티션 단위의 짧은 쓰기로 스테이징 테이블을 채우고(요청 쓰기와 교차), (b) 마지막에 한 트랜잭션으로 DELETE+INSERT SELECT 교체(실측 ≈1.0s) — JS 로 31만 행을 들고 다니지 않아 +283MB 피크도 사라진다. 스테이징 테이블 1개 마이그레이션 필요. cron 시각은 04:00 대를 피하고 X-1(socket_timeout) 선행.

### X-V2 [MEDIUM · 확정 · public · S] Prisma 연결 풀 크기 미지정(기본 물리코어×2+1) — 소형 운영 서버면 풀 5 안팎이 되어 느린 공개 쿼리 몇 개가 인증 요청까지 줄 세움

- **위치**: `src/plugins/prisma.ts:6`
- **트리거**: 운영 서버 물리 코어가 적을 때(2코어면 풀 5) 무거운 공개 GET(집값 points·status, tour insights)이 몇 개 동시에 들어오면
- **측정**: v-poolhol.ts(bench/5, scratch/5, bench/기본). 운영 코어 수는 미확인이라 풀 5 는 가정
- **검증 근거**: v-poolhol.ts: connection_limit=5, 통계 없는 bench.db 에서 넓은 housing points 8개 동시 → 각 1.85s(최대 2.45s), 같은 시각의 역 검색(혼자 1~2ms)이 중앙 399ms·최대 580ms, auth/me(authenticate 의 users PK 조회)가 중앙 831ms·최대 1,014ms. 기본 풀(이 PC 16코어 → 33개)에서는 각각 중앙 4ms·5ms. ANALYZE 후(scratch, 풀 5)에는 DB 대기가 줄어 중앙 94ms(남는 지연은 넓은 points 의 JS·직렬화 이벤트 루프 점유).
- **수정**: plugins/prisma.ts 의 datasourceUrl 에 connection_limit 를 명시(예: 12~16, X-1 의 socket_timeout=30 과 함께) — WAL 읽기는 병렬이고 연결당 페이지 캐시 2MB 라 부담이 작다. 근본은 X-2(ANALYZE)로 느린 쿼리를 줄이는 것. 운영 서버의 nproc 로 실제 기본값을 확인·기록.

### X-V3 [MEDIUM · 확정 · background · M] 배포 중 전량 교체 적재(상가 130만 행)가 서버 가동 중 한 트랜잭션으로 최소 36~86초 쓰기 락 — 그동안 서버의 모든 쓰기 실패(30초 busy 로도 못 막음)

- **위치**: `src/modules/life-map/life-store-master.service.ts:174`, `src/modules/tour/tour-master.service.ts:775`, `deploy.sh:122`, `deploy.sh:151`
- **트리거**: deploy.sh 케이스 6(일상지도 강제 재적재)·상가 0건일 때 케이스 1/2/4, 분기 상가 갱신(load:life-stores) — 서버를 내리지 않고 실행
- **측정**: v-loader-lock.sql·v-drop-idx.sql(전용 scratch.db, sqlite3 .timer). 실제 적재기(scripts/load-life-stores.ts)는 원본 zip 이 필요해 실행하지 않음 — 하한값
- **검증 근거**: replaceLifeStores 는 한 인터랙티브 트랜잭션(timeout 60분, maxWait 60s) 안에서 zip/CSV 를 스트리밍 파싱하며 createMany 로 130만 행을 넣는다. 같은 데이터를 SQL 만으로 교체한 하한(v-loader-lock.sql, scratch): DELETE 2.7s + INSERT 80.4s + COMMIT 3.3s ≈ 86s 쓰기 락(X-8 의 lat_lng 인덱스 제거 시 ≈36s). 실제 적재기는 파싱·Prisma 직렬화가 더해져 더 길다. tour_visits 14만 행 교체 하한은 ≈3.7s(문제 없음). deploy.sh:122 주석은 '교체 트랜잭션 수 초~20초'라며 서버 가동 중 실행을 허용한다.
- **수정**: (1) 상가 재적재는 deploy.sh 의 pm_stop→적재→pm_start 경로로만 돌리거나, (2) 적재기를 '스테이징 테이블에 청크 단위 짧은 커밋 → 마지막에 짧은 교체(테이블 rename swap 권장 — DELETE+INSERT SELECT 교체도 하한 30초대)'로 바꾼다. deploy.sh:122 주석을 실측대로 고치고, X-8 의 미사용 lat_lng 인덱스 제거로 교체 시간을 절반 이하로.

### X-V4 [MEDIUM · 추정 · public · S] 레이트리밋 키가 클라이언트가 보낸 CF-Connecting-IP·XFF 맨 왼쪽을 그대로 신뢰 — 원본(nginx)에 직접 붙으면 IP 한도 무력화, 라우트별 LRU 스토어 최대 80~130MB 상주

- **위치**: `src/plugins/rate-limit.ts:17`, `src/app.ts:30`, `docs/deploy-friendly.md:131`
- **트리거**: Cloudflare 를 거치지 않고 nginx 80/443 에 직접 붙어 요청마다 CF-Connecting-IP(또는 X-Forwarded-For 첫 값)를 바꿔 보냄
- **측정**: 메모리 부분만 실측(v-rl.cjs). 우회 자체는 운영 네트워크(원본 직접 접근 가능 여부)에 달려 미검증
- **검증 근거**: clientKey 는 cf-connecting-ip 헤더가 있으면 그대로 키로 쓰고, 없으면 trustProxy:true 의 req.ip(XFF 맨 왼쪽 = 클라이언트 값)를 쓴다. 배포 문서의 nginx /api/ 블록은 X-Forwarded-For 를 $proxy_add_x_forwarded_for(덧붙임)로 넘기고 CF-Connecting-IP 를 덮어쓰지 않으며, 80/443 을 Cloudflare 대역으로 제한하거나 real_ip 를 쓰는 설정이 없다(관리자 원본 화면용 'DNS 전용 서브도메인' 권고는 원본 IP 를 공개한다). 메모리: v-rl.cjs 로 LocalStore 1개를 5,000키로 채우면 IPv4 207B/키(≈1MB), IPv6 326B/키(≈1.6MB). @fastify/rate-limit 10.3.0 은 config.rateLimit 이 있는 라우트마다 child 스토어(LRU 5000)를 만들고 src 에 그런 설정이 약 80곳 → 키를 계속 바꾸면 최대 약 80~130MB 힙이 퇴출 전까지 상주.
- **수정**: nginx 에서 80/443 을 Cloudflare IP 대역으로만 허용하거나 set_real_ip_from <CF 대역> + real_ip_header CF-Connecting-IP 로 $remote_addr 를 확정한 뒤 proxy_set_header CF-Connecting-IP $remote_addr 로 덮어쓴다. 앱 trustProxy 는 루프백 1홉으로 좁힌다. 운영에서 원본 IP 로 직접 요청이 되는지 먼저 확인.

### X-6 [LOW · 확정 · public · S] 응답마다 zod safeParse 로 객체를 통째로 복사·검증 — 큰 지도 응답에서 JSON.stringify 의 2배

- **위치**: `src/app.ts:59`
- **트리거**: 큰 공개 GET 응답(housing points 4000점·1.1MB, life-map store points 4000점·437KB)
- **측정**: v-app.ts(bench): fastify-type-provider-zod 4.0.2 의 serializerCompiler 그대로(safeParse+stringify) vs JSON.stringify, 15회 중앙값 — housing points 넓은 1.13MB 21.1 vs 5.0ms(+16.1ms), life store z16 437KB 7.1 vs 1.7ms, parking ev 327KB 4.3 vs 1.4ms, parking lots 112KB 1.2 vs 0.4ms, tour density 91KB 1.6 vs 0.3ms, 맛집 목록 0.16 vs 0.04ms, 맛집 상세 0.46 vs 0.07ms.
- **검증 근거**: node_modules/fastify-type-provider-zod/dist/src/core.js:87-91 에서 safeParse 후 JSON.stringify(result.data) 확인. 부하 때문에 스캐너(9.0 vs 4.5ms)보다 절대값은 크지만 검증이 stringify 의 3~4배라는 비율은 같다. 라우트 중앙값(넓은 points 445~463ms) 대비 3~4%, 넓은 points 의 이벤트 루프 최대 108~140ms 중 일부. 단독 영향이 작아 LOW 유지.
- **수정**: createSerializerCompiler 를 감싸 route config(예: trustedResponse) 가 있는 대형 지도 라우트만 JSON.stringify 로 — 큰 응답당 3~16ms 이벤트 루프 절감. 운영 전체에서 끄면 응답 계약 회귀를 테스트에서만 잡게 되므로 라우트 한정이 낫다. 우선순위는 낮다.

### X-7 [LOW · 확정 · public · S] 요청마다 info 로그 2줄(요청·완료)을 pm2 out_file 로 — 로테이션 미문서화로 디스크 무한 증가

- **위치**: `src/app.ts:31`, `docs/deploy-friendly.md:97`
- **트리거**: 운영 LOG_LEVEL 기본 info 의 모든 요청
- **측정**: v-log.mjs(vdist, /api/v1/health 4,000회×5라운드): LOG_LEVEL=fatal 35.9µs/요청 vs info 76.2µs/요청(부하 중; 스캐너 30.9 vs 38.9µs), info 출력 7.76MB/40,601줄 ≈ 요청당 382B(2줄).
- **검증 근거**: app.ts 에 disableRequestLogging 없음, LOG_LEVEL 기본 info(config/env.ts), docs/deploy-friendly.md·deploy.sh 에 logrotate 언급 0건. CPU 는 요청당 수십 µs 로 무시 가능, 디스크는 100만 요청/일이면 약 380MB/일 누적. LOW.
- **수정**: disableRequestLogging: true + onResponse 훅에서 5xx·responseTime>500ms 만 기록(느린 요청 가시성도 확보), 배포 문서에 pm2-logrotate(또는 logrotate) 추가.

### X-8 [LOW · 확정 · background · S · 스키마] 중복·미사용 인덱스 — 접두 중복 11개(작은 테이블), life_stores_lat_lng_idx 36MB 미사용, tour_* dataset 단일 인덱스 7개가 통계 없을 때 오선택 유발

- **위치**: `prisma/schema.prisma:1520`, `prisma/schema.prisma:2734`
- **트리거**: 적재·쓰기 시 인덱스 갱신(쓰기 증폭), 통계 없는 상태의 계획 선택
- **측정**: v-idx.sql(pragma_index_list/index_info + dbstat, bench.db): 다른 인덱스 접두와 같은 비유니크 인덱스 11개(최대 visitor_reviews_restaurantId_idx 248KB, 나머지 4~20KB). life_stores_lat_lng_idx 36MB. v-plans.ts: LifeStore 조회 6곳(지도 points·cells·nearby·집값 인프라 등) 모두 kind IN 포함 → 통계 유무와 무관하게 life_stores_kind_lat_lng_idx 사용. v-loader-lock.sql/v-drop-idx.sql(scratch): 130만 행 전량 교체(SQL만) 인덱스 3개 DELETE 2.7+INSERT 80.4+COMMIT 3.3s ≈86s → lat_lng 인덱스 제거 후 4.5+29.2+2.2s ≈36s(단일 측정, 부하 변동 큼).
- **검증 근거**: 중복 11개는 모두 작은 테이블이라 영향 미미. 반박된 부분: dataset 단일 인덱스가 '통계 없을 때 오선택'을 일으킨다는 주장은 공개 경로에 placeId+dataset 조건이 없어 재현되지 않았고(X-2), 이 인덱스들은 tour-master 의 세트별 deleteMany(where dataset)·unload 에 쓰이므로 유지가 맞다. 실익이 있는 건 life_stores (lat, lng) 제거 — 36MB 와 분기 재적재 시간(하한 86→36s, X-V3 락 단축).
- **수정**: schema.prisma 의 LifeStore @@index([lat, lng]) 제거 마이그레이션(DROP INDEX 즉시, 백필 없음). 작은 테이블 접두 중복 11개 정리는 체감 없음(선택). dataset 인덱스는 유지.

## 반박된 발견

- **A-5** visitor_reviews 의 restaurantId 단일 인덱스가 (restaurantId, externalId)/(restaurantId, contentHash) 유니크 인덱스의 접두와 중복이라 리뷰 insert 마다 쓰기 증폭 — 중복 자체는 사실이다. 인덱스를 지우면 restaurantId 단독 조회와 FK 자식 조회가 (restaurantId, contentHash) 유니크 인덱스 SEARCH 로 옮겨 간다(계획 확인). 그러나 쓰기 비용 차이는 측정되지 않았다. 리뷰 저장 시간은 Prisma 왕복이 지배하고(행당 0.87ms 중 엔진 시간 0.05ms), B-tree 하나를 빼도 쓰기 락이나 총시간에 의미 있는 변화가 없다. 오히려 _count visitorReviews 같은 COUNT 커버링 조회가 2배 큰 유니크 인덱스(868KB)를 읽게 된다. 고칠 가치가 없다.
- **F-1** resvg-js render() 가 픽스맵을 해제하지 않아 공유 PNG 렌더마다 RSS 가 영구 증가 — pm2 500MB 재시작 유발 — 스캐너 rss.ts의 루프는 동기 호출이거나 이미 풀린 promise의 await라서 이벤트 루프로 돌아가지 않는다. 그런데 napi 클래스(Resvg·RenderedImage)의 finalizer는 GC 뒤 setImmediate로 미뤄 실행된다. 그래서 그 루프에서만 렌더당 약 10MB씩 선형으로 쌓인다. 같은 루프에 setImmediate 양보 한 줄만 넣어도 RSS는 기준선으로 돌아간다. 실제 서버는 요청마다 getShared(DB) await로 매크로태스크를 거치므로 finalizer가 돈다. 실제 렌더 함수로 500장을 그려도 RSS는 456~579MB 고원에 머물고, GC 후에는 395MB다. 따라서 '렌더마다 영구 증가, story 미스 17회면 500MB'는 성립하지 않는다. 남는 실제 현상(V8이 네이티브 픽스맵을 몰라 major GC 전까지 수십~180MB가 떠 있음)은 원인과 대책이 달라 F-V1로 분리했다. 상류 이슈 #421도 같은 동기 루프 패턴일 가능성이 있다(미확인).
