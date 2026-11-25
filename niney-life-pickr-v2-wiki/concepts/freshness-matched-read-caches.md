---
concept: 이미 허용한 묵음만큼만 들고 있는 읽기 캐시 — TTL 은 화면·HTTP 의 신선도 약속에서, 묵은 값을 내면 안 되는 경계는 따로
last_compiled: 2026-11-15
topics_connected: [friendly, canonical, parking, menu-grouping, review-search, review-clustering, hiking, meal, food]
status: active
---

# 이미 허용한 묵음만큼만 들고 있는 읽기 캐시 — TTL 은 화면·HTTP 의 신선도 약속에서, 묵은 값을 내면 안 되는 경계는 따로

## Pattern

2026-11-06~07 성능 묶음과 11-14 식단 성능 검토는 운영 DB 사본으로 느린 읽기를 재 보고, 같은 처방을 여러 도메인에 거의 같은 모양으로 붙였다 — **키(가게·전역 메뉴·식당)마다 다 만든 응답을 짧게 들고 있는다.** 맛집 공개 상세·리뷰·인사이트 60초, 맛집 주차 평가 60초, 가게 메뉴 순위의 전역 비교 통계 60초, 리뷰 검색·군집의 검색 가능 리뷰 수 30초, 등산 추천 색인 6시간(만료돼도 이전 색인), 산불 예보 3시간(만료돼도 마지막 성공분), 식당 메뉴 조회 응답 10분. 숫자는 제각각이지만 정하는 방법이 같다: **새 캐시가 새 묵음을 만들지 않도록, 이미 사용자에게 약속한 묵음에 맞춘다.** 공개 맛집 응답은 이미 `Cache-Control: max-age=60` 이라 서버가 60초 들고 있어도 체감 신선도는 그대로고, 식당 메뉴 화면은 이미 그만큼 묵혀 쓰며, 음식 이름 색인은 어휘 캐시와 같은 10분 주기로 다시 읽는다.

두 번째 공통점은 **묵은 값을 내면 안 되는 경계를 캐시 바깥에 명시한 것**이다. ① 정체성이 바뀌면 기다린다 — 등산 추천 색인은 같은 산 적재본이면 만료돼도 이전 색인으로 답하지만, 적재본이 바뀌면 옛 색인이 지워진 코스를 가리킬 수 있어 새 색인을 기다린다. ② 무효화 이전에 시작한 결과는 담지 않는다 — `KeyedCache.invalidateAll` 은 세대 번호를 올려, 크롤 저장·삭제·canonical 병합 직전에 시작한 load 가 끝나도 캐시에 들어가지 못한다. ③ 미완 응답은 담지 않는다 — 식당 메뉴 조회는 코스·세트 구성을 읽는 중인 응답과, 읽을 글이 남았는데 자리가 없어 못 읽은 응답을 기억하지 않는다. ④ 결정에 쓰는 읽기는 우회한다 — 리뷰 검색의 "아직 안 된 가게 고르기" 일괄 작업과 어드민 상세·인사이트·리뷰 매칭은 늘 새로 센다. ⑤ 없는 키는 들고 있지 않는다 — `load` 가 `null`(없는 가게)이면 담지 않아, 무작위 placeId 로 메모리를 채울 수 없다([amplification-caps](amplification-caps.md)).

주의할 숫자 하나: `KeyedCache` 는 ttl 동안 그대로 내고, 만료 뒤 ttl 안(합쳐 2×ttl)까지는 지난 값을 내며 뒤에서 갱신한다. 그래서 "60초 들고 있다" 는 커밋 문구의 실제 최대 지연은 무효화가 없을 때 2분 가까이다(32차 점검). 공개 응답의 `max-age=60` 과 맞춘다는 판단은 "평소 신선도" 기준이고, 꼬리 지연은 그 두 배다.

## Instances

- **2026-11-07** in [canonical](../topics/canonical.md) / [menu-grouping](../topics/menu-grouping.md) (`16c1a4c2`·`8dc1615d`): 반대 방향 — **어드민이 공개 캐시를 빌려 쓴다.** 어드민 맛집 목록·분석 맛집 상태가 공개 목록 캐시가 30초마다 센 요약 집계(`PublicRestaurantBase.buckets`)를 함께 써 196~215 → 38~41ms·247 → 143~154ms. 어드민 숫자가 최대 30초 늦는 것을 사용자가 받아들였다(결정 2026-11-07 — 분석 진행은 SSE 로 따로, 크롤 저장·삭제·병합은 캐시를 비움). 목록의 **집계 숫자**는 묵어도 되고 편집 화면의 **원본**은 안 된다는 구분이 ④ 와 짝을 이룬다([public-admin-route-split](public-admin-route-split.md)).

- **2026-11-14** in [meal](../topics/meal.md) / [food](../topics/food.md) (`26484e04`): `GET /meals/place-menus` — 다 만든 응답을 식당별로 10분(`RESULT_MEMO_TTL_MS`, 200곳 `RESULT_MEMO_MAX`), 같은 식당을 겹쳐 부르면 한 번만 만든다. 구성을 읽는 중·자리 없어 못 읽은 응답은 담지 않는다(화면이 3초마다 다시 부르는 동안 미완 응답이 굳으면 구성이 영영 안 보인다). 이름 매칭 `FoodService.matchFoods` 의 활성 카탈로그 색인은 어휘와 같은 10분 주기 — 가게마다 새로 읽으면 메뉴 몇 개짜리 가게가 오히려 느려졌다(첫 조회 중앙 38 → 63ms). 결과: 첫 조회 중앙 38 → 6ms·p90 137 → 16ms·쿼리 합 18,309 → 6,388, 응답은 412곳 전부 바이트 단위로 같음.
- **2026-11-07** in [canonical](../topics/canonical.md) / [friendly](../topics/friendly.md) (`edc7d1be`): 공용 `lib/keyed-cache.ts` `KeyedCache` 탄생 — 같은 키 동시 요청 합류, 바이트 상한 LRU(상세·리뷰 64MB·인사이트 8MB, [bounded-byte-caches](bounded-byte-caches.md)), 만료 뒤 ttl 안(합쳐 2×ttl)은 지난 값을 내고 뒤에서 한 번 갱신, 갱신 실패면 지난 값 유지, `null` 미보관, 세대 번호. 공개 상세 + 리뷰 최신순 목록을 한 묶음(`getPublicPlace`)으로 가게마다 60초, 리뷰 페이지는 그 목록에서 거르고 자른다. `invalidatePublicRestaurantCache()` 가 함께 비운다. 운영 사본: 상세 57 → 0.7ms, 큰 가게 상세 화면 묶음 3.2초 → 0.26초·RSS 1,117 → 513MB.
- **2026-11-07** in [parking](../topics/parking.md) (`692b89b9`): 맛집 리뷰의 주차 평가(`/restaurants/public/:placeId/parking-reviews`, 결과 1KB 안팎)를 같은 `KeyedCache` 로 60초 — 맛집 공개 상세와 같은 길이. 16 → 0.1ms.
- **2026-11-07** in [menu-grouping](../topics/menu-grouping.md) (`fa121230`): 어드민 가게 메뉴 순위의 전역 비교 통계를 전역 메뉴마다 60초(`GLOBAL_AGG_TTL_MS`) — **언급 없음도 담아** 다른 가게 순위에서도 쓰고, 들고 있지 않은 전역만 센다. 81~105 → 11~12ms.
- **2026-11-07** in [review-search](../topics/review-search.md) / [review-clustering](../topics/review-clustering.md) (`a00c3092`): 두 어드민 상태 목록이 각자 하던 "임베딩 있는 리뷰 수" 집계를 `enriched-counts.ts` 하나로, 30초(만료 직후 한 번은 지난 값). enrich 가 임베딩을 하나라도 쓰면 비운다(중간에 실패해도). **아직 안 된 가게를 고르는 일괄 작업은 늘 새로 센다.** 336 → 19~23ms.
- **2026-11-06~07** in [hiking](../topics/hiking.md) (`eecb9d53`·`bec2e294`): 추천 색인(산 3,879·코스 9,273) 6시간 TTL — 같은 적재본이면 만료돼도 이전 색인으로 답하고 뒤에서 한 번만 다시 만들며, 실패하면 이전 색인을 계속 쓴다. 적재본이 바뀌면 기다린다. 산불위험예보는 3시간이 지나면 마지막 성공분을 바로 내고 뒤에서 갱신(예전엔 업스트림을 최대 약 63초 기다렸다). 날씨는 `WeatherService.peekForecast`(업스트림 없이 캐시만)로 만료분까지 읽는다 — 신선도보다 공용 쿼터가 앞선 경우([quota-proportional-loading](quota-proportional-loading.md)).

## What This Means

1. **TTL 은 성능 숫자가 아니라 신선도 약속에서 정한다.** "얼마나 오래 들고 있어도 되나" 의 답은 이미 그 데이터를 소비하는 쪽이 받아들이고 있는 묵음(HTTP `max-age`, 화면의 재조회 주기, 원천 갱신 주기)이다. 그보다 길면 캐시가 새로운 거짓을 만들고, 그보다 짧으면 효과가 줄 뿐 얻는 신선도가 없다.
2. **stale-while-revalidate 는 "같은 정체성" 안에서만.** 지난 값을 바로 내고 뒤에서 갱신하는 것은 값이 조금 늦을 뿐 틀리지 않을 때다. 기준 데이터(적재본·카탈로그)가 통째로 바뀌는 순간은 늦은 게 아니라 틀린 것이 되므로 기다리거나 비운다. 이 경계가 캐시 코드가 아니라 호출부 조건(적재본 id, 무효화 함수)에 있다는 점을 리뷰 때 확인한다.
3. **캐시는 "다 만든 값" 만.** 진행 중·부분 결과를 담으면 그 부분이 TTL 동안 굳는다. 비동기 작업(구성 읽기·enrich)과 겹치는 읽기 캐시는 "끝났는가" 를 담기 조건으로 가져야 하고, 무효화와 겹치는 load 는 세대 번호로 버린다.
4. **판단에 쓰는 읽기는 캐시 밖.** 같은 집계라도 화면 표시용은 묵어도 되지만 "무엇을 처리할지 고르는" 읽기가 묵으면 같은 일을 두 번 하거나 빠뜨린다. 어드민 편집 화면도 같은 이유로 우회한다([public-admin-route-split](public-admin-route-split.md) — 공개 표면이 캐시를 갖고 어드민은 원본을 본다).
5. **측정이 먼저였다.** 일곱 사례 모두 운영 DB 사본으로 전후를 재고, 응답이 바꾸기 전과 같은지(바이트·순위) 대조한 뒤 넣었다. 캐시가 숨긴 회귀를 찾는 유일한 방법이 이 대조라, 새 캐시를 넣을 때도 같은 증거를 남긴다.
6. **무효화 경로는 사용처마다 따로 묶어야 한다 — 공용 클래스가 대신 묶어 주지 않는다.** `KeyedCache` 는 `invalidateAll` 을 제공할 뿐, 누가 언제 부를지는 사용처가 정한다. 맛집 공개 상세·인사이트는 `invalidatePublicRestaurantCache()` 에 묶였지만, 같은 클래스를 쓰는 주차 평가 캐시(`parking.service.ts` `restaurantReviewsCache`)는 어디에도 묶여 있지 않다(2026-11-15 HEAD 에서 `invalidateAll` 호출처는 맛집 두 캐시뿐) — 크롤 저장·삭제·canonical 병합 직후 최대 약 2분(ttl 60초 + 지난 값 60초) 동안 이전 멤버 구성의 주차 평가가 나갈 수 있다(코드 추론, 32차 점검). 새 사용처를 붙일 땐 "이 값의 입력이 바뀌는 쓰기는 무엇인가" 를 먼저 적는다.

관련: [bounded-byte-caches](bounded-byte-caches.md) — 이 캐시들의 메모리 상한(바이트). [in-memory-singleton-gates](in-memory-singleton-gates.md) — 같은 키 동시 요청 합류(inflight 맵)는 그 게이트의 캐시판. 같은 묶음에서 캐시보다 먼저 한 처방은 읽는 양 자체를 줄이는 것이었다 — 카테고리 트리를 전역 분류 전체가 아니라 가게 링크에서 출발(`accdc5d5`), 메뉴명 개수를 SQL 에서 가게별로(`c2859dbd`), 산 목록을 적재본마다 한 번·필요한 열만(`cbdb7f31`).

## Sources

- [friendly](../topics/friendly.md)
- [canonical](../topics/canonical.md)
- [parking](../topics/parking.md)
- [menu-grouping](../topics/menu-grouping.md)
- [review-search](../topics/review-search.md)
- [review-clustering](../topics/review-clustering.md)
- [hiking](../topics/hiking.md)
- [meal](../topics/meal.md)
- [food](../topics/food.md)
- [apps/friendly/src/lib/keyed-cache.ts](../../apps/friendly/src/lib/keyed-cache.ts) — `KeyedCache`(합류·바이트 LRU·SWR·`null` 미보관·세대 번호)
- [apps/friendly/src/modules/restaurant/restaurant-public-place-cache.ts](../../apps/friendly/src/modules/restaurant/restaurant-public-place-cache.ts) — `publicPlaceCache`·`publicInsightsCache`
- [apps/friendly/src/modules/review-search/enriched-counts.ts](../../apps/friendly/src/modules/review-search/enriched-counts.ts) — 30초 집계
- [apps/friendly/src/modules/menu-grouping/menu-grouping.service.ts](../../apps/friendly/src/modules/menu-grouping/menu-grouping.service.ts) — `GLOBAL_AGG_TTL_MS`
- [apps/friendly/src/modules/hiking/hiking-recommend.service.ts](../../apps/friendly/src/modules/hiking/hiking-recommend.service.ts) — `INDEX_TTL_MS`, 적재본 바뀌면 기다림
- [apps/friendly/src/modules/meal/meal-place-menu.service.ts](../../apps/friendly/src/modules/meal/meal-place-menu.service.ts) — `RESULT_MEMO_TTL_MS`·`RESULT_MEMO_MAX`, 미완 응답 미보관
- [apps/friendly/src/modules/parking/parking.service.ts](../../apps/friendly/src/modules/parking/parking.service.ts) — `restaurantReviewsCache`
- [bounded-byte-caches](bounded-byte-caches.md) · [in-memory-singleton-gates](in-memory-singleton-gates.md) · [amplification-caps](amplification-caps.md) · [public-admin-route-split](public-admin-route-split.md) · [quota-proportional-loading](quota-proportional-loading.md)
