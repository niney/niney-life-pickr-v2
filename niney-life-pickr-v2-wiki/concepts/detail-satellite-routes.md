---
concept: 식당 상세 위성 라우트 — 상세 응답은 코어만, 도메인 데이터는 placeId 에 매단 지연 라우트로
last_compiled: 2026-09-26
topics_connected: [web, shared, api-contract, friendly, canonical, parking, tour, food, review-search, review-clustering, analytics]
status: active
---

# 식당 상세 위성 라우트 — 상세 응답은 코어만, 도메인 데이터는 placeId 에 매단 지연 라우트로

## Pattern

맛집 상세(`/r/:placeId`·공개 상세 패널·2026-09-26 부터 어드민 상세)는 이 리포에서 도메인이 가장 많이 모이는 화면이다 — 리뷰·AI 분석·주제 군집·질문·메뉴 칼로리·여행자 통계·주차가 한 가게에 붙는다. 이 리포는 그것들을 **상세 응답 하나에 합치지 않는다.** 상세(`GET /restaurants/public/:placeId`)는 식별·스칼라·스냅샷과 **한 줄짜리 요약 배지**(여행로그 `tour{nTravelers, bayesScore, …}`, 상가 매칭 `store`)만 싣고, 탭 본문은 각 도메인이 **`/restaurants[/public]/:placeId/<도메인>` 에 매단 위성 라우트**를 탭이 열릴 때 부른다:

| 위성 | 경로 | 라우트 상수 소유 | 클라 훅 · queryKey | 도입 |
|---|---|---|---|---|
| AI 분석 집계 | `/restaurants/public/:placeId/insights` | `Restaurant.publicInsights` | `useRestaurantPublicInsights` · `['restaurant','public','insights',placeId]` | 2026-05-09 `8e62270` |
| 리뷰(페이지·필터) | `/restaurants/public/:placeId/reviews` | `Restaurant.publicReviews` | `useRestaurantPublicReviews` · `['restaurant','public','reviews',…]` | 2026-05-18 `4856b87` |
| 메뉴 카테고리 트리 | `/restaurants/public/:placeId/category-tree` | `Restaurant.publicCategoryTree` | `useRestaurantPublicCategoryTree` | 2026-06-02 `52a0171` |
| 리뷰 질문(QA) 준비 상태 | `/restaurants/:placeId/qa/ready` (+ `POST …/qa`) | `ReviewSearch.publicQaReady`·`publicAsk` | `useReviewQaReady` · `['review-qa','ready',placeId]` | 2026-06-22 `3fc7328` |
| 주제 군집 | `/restaurants/:placeId/clusters` | `ReviewClustering.publicClusters` | `useReviewClusters` · `['review-clusters',placeId]` | 2026-06-24 `df6edd3` |
| 메뉴 칼로리 | `/restaurants/public/:placeId/menu-nutrition` | `Restaurant.publicMenuNutrition` | `useRestaurantPublicMenuNutrition` | 2026-09-02 `ac0e191` |
| 여행자 통계 | `/restaurants/public/:placeId/tour-stats` | `Tour.publicRestaurantStats` | `useRestaurantPublicTourStats` · `['restaurant','public','tour-stats',placeId]` | 2026-09-13 `99991da` |
| 주차 평가 | `/restaurants/public/:placeId/parking-reviews` | `Parking.restaurantReviews` | `useRestaurantParkingReviews` · `['parking','restaurant-reviews',placeId]` | 2026-09-25 `2ff2c31` |

규칙은 셋이다. (1) **경로는 식당에, 소유는 도메인에** — URL 은 모두 식당 placeId 아래지만 라우트 상수와 핸들러는 그 도메인 모듈이 갖는다(`parking.route.ts` 가 `parking-reviews` 를, `tour-public.route.ts` 가 `tour-stats` 를 등록). 새 도메인이 식당에 붙을 때 restaurant 모듈을 건드리지 않는다. (2) **상세는 요약만** — 위성의 존재·요약은 상세 응답의 작은 필드(배지)로 알리고(`tour` 가 없으면 여행자 탭 자체를 숨김), 본문은 탭이 열릴 때만. (3) **멤버 해석은 위성마다 한다** — placeId 를 받은 위성이 각자 canonical 멤버를 푼다(주차 평가는 `resolveCanonicalMembersByPlaceId`, QA·군집도 같은 헬퍼 — [canonical-corpus-fanout](canonical-corpus-fanout.md)).

## Instances

- **2026-09-25** in [parking](../topics/parking.md) / [web](../topics/web.md) (`2ff2c31`): 가장 최근 위성 — `Parking.restaurantReviews` 가 리뷰의 '주차' 관점 극성(`ReviewSummary.aspectsJson`)과 팁을 canonical 멤버 전체에서 집계하고, 웹 '가는 법' 탭의 `ParkingSection` 이 이 위성 + 반경 300m 주차장 주변 조회(`Parking.lotNearby`, 좌표 기반 — 위성이 아닌 일반 도메인 라우트)를 조합한다. 홈 탭의 한 줄 요약 `ParkingSummaryLine` 도 같은 두 요청을 부르고 5분마다 재조회한다 — **위성이 탭 밖(홈)으로 나오면 상세 한 번 여는 비용이 된다**(공개·어드민 상세 모두, web·shared 토픽 Gotchas). 등록 함정: 라우트 빌더가 `encodeURIComponent(placeId)` 를 하므로 Fastify 등록은 `decodeURIComponent(Routes.Parking.restaurantReviews(':placeId'))` 로 플레이스홀더를 되돌린다(tour 도 동일).
- **2026-09-26** in [web](../topics/web.md) / [shared](../topics/shared.md) / [canonical](../topics/canonical.md) (`420a6be`): 위성 구조의 **값과 비용이 동시에 드러난** 라운드. 값 — 어드민 상세가 공개 탭 컴포넌트를 그대로 가져다 쓰자 위성들도 공짜로 따라왔다(분석·군집·질문·칼로리·여행자를 어드민에 따로 만들지 않음, [public-admin-route-split](public-admin-route-split.md)). 상세 본체는 가벼워졌다(스냅샷 리뷰 복제 제거로 한 가게 응답 689KB → 479KB). 비용 — 리뷰 재요약이 끝나면 "리뷰 분석에 의존하는 위성" 을 전부 무효화해야 하는데, 그 목록이 코드 한 곳에 없었다. 예전 watcher 는 `['restaurant','public',placeId]` 한 줄만 무효화했는데 실제 상세 키는 `['restaurant','public','detail',placeId]` 라 **아무것도 잡지 못한 채** 몇 달을 지냈다(prefix 가 원소를 건너뛰면 매칭 0). 이제 `invalidateRestaurantDetailCaches(qc, placeId)` 가 detail·insights·reviews·category-tree·menu-nutrition + review-match·review-clusters·review-qa ready·parking restaurant-reviews 를 명시적으로 나열한다. 여행자 통계가 빠진 건 의도 — 목록의 기준은 "리뷰 분석이 바뀌면 달라지는가".
- **2026-09-13** in [tour](../topics/tour.md) (`99991da`): 요약 배지 + 위성 탭의 정형 — 공개 상세·목록에는 `tour{nTravelers, bayesScore, spendPpMedian, revisitRate}` 요약만(목록 정렬·골라줘에 쓰임), 상세 여행자 탭 본문(연령·동반·시간대·지출 분포)은 `Tour.publicRestaurantStats` 위성. 라우트 상수는 Tour namespace 인데 훅과 queryKey 는 restaurant 쪽(`useRestaurantPublicTourStats`, `['restaurant','public','tour-stats',…]`)에 있다 — **키의 소유는 라우트 namespace 가 아니라 훅 파일을 따른다**(주차는 반대로 `['parking', …]`).
- **2026-09-02** in [food](../topics/food.md) (`ac0e191`): 메뉴 칼로리 — 메뉴 탭이 열릴 때만 `menu-nutrition` 위성을 부르고(`enabled` 인자), 정적 판정이 먼저 오고 LLM 보강이 뒤에 오는 폴링을 위성 안에 가둔다([static-first-llm-enrichment](static-first-llm-enrichment.md)) — 상세 응답은 LLM 대기와 무관하게 즉시.
- **2026-06-22~24** in [review-search](../topics/review-search.md) / [review-clustering](../topics/review-clustering.md) (`3fc7328`·`df6edd3`): 리뷰 지능화 두 도메인이 위성으로 붙은 첫 사례 — 공개 QA(`qa/ready`·`qa`)와 공개 군집(`clusters`). 이 둘만 경로에 `public` 이 없다(`/restaurants/:placeId/…`) — 인증·CORS 경계는 오직 `/api/v1/admin` prefix 라 동작 차이는 없지만, 경로 관례가 두 갈래로 남았다.
- **2026-05-09~06-02** in [friendly](../topics/friendly.md) / [analytics](../topics/analytics.md) (`8e62270`·`4856b87`·`52a0171`): 원형 — 공개 상세가 생길 때부터 AI 집계(`insights`)를 상세 밖으로 뺐고, 리뷰는 페이지·필터가 있는 별도 라우트로, 메뉴 카테고리 트리는 글로벌 머지 결과를 읽는 별도 라우트로 붙었다.

## What This Means

1. **식당 상세는 허브이고, 허브는 가벼워야 한다.** 도메인이 늘 때마다 상세 응답에 필드를 더했다면 상세 한 번에 LLM 대기(칼로리)·무거운 집계(인사이트·군집)·외부 반경 조회(주차)가 모두 직렬로 걸렸을 것이다. 위성은 **탭이 열릴 때만** 비용을 치르게 하고, 도메인 모듈이 자기 경로를 소유해 restaurant 모듈의 변경 반경을 막는다. 새 도메인이 식당에 붙는 절차가 사실상 정해져 있다: 도메인 namespace 에 `…(placeId)` 라우트 + 도메인 모듈 핸들러(멤버 해석 포함) + shared 훅 + 탭(또는 섹션) + 필요하면 상세 응답에 요약 배지 한 필드.
2. **대가는 "흩어진 키" 다.** 위성 N 개 = queryKey N 개 = 무효화할 곳 N 개. 키 모양이 도메인마다 다르고(`['restaurant','public',…]` / `['parking',…]` / `['review-clusters',…]`), TanStack 의 prefix 매칭은 원소 하나만 어긋나도 조용히 0건이 된다. 그래서 "상세 관련 캐시 전체" 는 한 함수(`invalidateRestaurantDetailCaches`)가 소유해야 하고, 새 위성을 붙이는 PR 은 그 목록에 넣을지(리뷰 분석 의존인가)를 판단해야 한다 — 컴파일러도 테스트도 이걸 강제하지 않는다.
3. **위성이 탭 밖으로 나오면 허브가 다시 무거워진다.** 주차 한 줄 요약이 홈 탭에 들어가면서 상세를 여는 모든 사용자가 주차 요청 2건 + 5분 폴링을 치르게 됐다. 요약이 필요하면 상세 응답의 배지 필드(여행로그 방식)가 더 싸다 — 위성 결과를 상세 응답에 요약해 싣거나, 홈 요약은 탭 진입 후에만 켜는 선택지가 있다.
4. **위성마다 멤버 해석을 따로 하므로 숫자가 갈라질 수 있다.** 같은 화면에서 인사이트(네이버 행만)와 리뷰 필터·주차 평가(canonical 멤버 전체)가 서로 다른 모집단을 센다 — 위성 구조가 "각자 자기 집계" 를 허용하기 때문에 생긴 불일치다([canonical-corpus-fanout](canonical-corpus-fanout.md) 의 남은 비-fan-out 지점).

관련: [public-admin-route-split](public-admin-route-split.md) — 위성은 공개/어드민 경계와 직교한다(위성은 공개 표면, 어드민은 그 표면을 합성). [stream-driven-cache-merge](stream-driven-cache-merge.md) — 요약 진행은 SSE 로 상세 캐시에 머지하고, 완료 시점에만 위성들을 무효화한다. [cross-tab-async-job-toast](cross-tab-async-job-toast.md) — 재요약 watcher 가 완료 시 이 무효화 함수를 부른다.

## Sources

- [web](../topics/web.md)
- [shared](../topics/shared.md)
- [api-contract](../topics/api-contract.md)
- [friendly](../topics/friendly.md)
- [canonical](../topics/canonical.md)
- [parking](../topics/parking.md)
- [tour](../topics/tour.md)
- [food](../topics/food.md)
- [review-search](../topics/review-search.md)
- [review-clustering](../topics/review-clustering.md)
- [analytics](../topics/analytics.md)
- [packages/api-contract/src/routes.ts](../../packages/api-contract/src/routes.ts) — `Restaurant.public*`·`ReviewSearch.publicQaReady`·`ReviewClustering.publicClusters`·`Tour.publicRestaurantStats`·`Parking.restaurantReviews`
- [packages/shared/src/hooks/useRestaurant.ts](../../packages/shared/src/hooks/useRestaurant.ts) — 위성 훅들·`invalidateRestaurantDetailCaches`
- [packages/shared/src/hooks/useParking.ts](../../packages/shared/src/hooks/useParking.ts) — `useRestaurantParkingReviews`
- [apps/friendly/src/modules/parking/parking.service.ts](../../apps/friendly/src/modules/parking/parking.service.ts) — 주차 평가의 canonical 멤버 해석
- [apps/friendly/src/modules/parking/parking.route.ts](../../apps/friendly/src/modules/parking/parking.route.ts) — `decodeURIComponent` 등록
- [apps/friendly/src/modules/tour/tour-public.route.ts](../../apps/friendly/src/modules/tour/tour-public.route.ts)
- [public-admin-route-split](public-admin-route-split.md)
- [canonical-corpus-fanout](canonical-corpus-fanout.md)
- [stream-driven-cache-merge](stream-driven-cache-merge.md)
- [cross-tab-async-job-toast](cross-tab-async-job-toast.md)
- [static-first-llm-enrichment](static-first-llm-enrichment.md)
