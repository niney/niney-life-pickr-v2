---
concept: canonical-corpus-fanout
last_compiled: 2026-06-25
topics_connected: [canonical, review-search, review-clustering, friendly]
status: active
---

# canonical 코퍼스 fan-out

## Pattern

리뷰 분석 레이어(검색·enrich·QA·군집·관점집계)는 단일 `restaurantId` 한 행이 아니라 **같은 canonical 가게의 다소스 멤버 행 전체**(네이버 + 다이닝코드 + 캐치테이블 + 테이블링 partner)에 fan-out 한다. 그리고 캐시·SSE·진행상태·군집 영속 키를 그 묶음의 대표 행 하나 — `primaryId`(placeId 를 가진 네이버 행) — 로 통일한다.

즉 분석을 시작할 때 입력이 `restaurantId` 든 `placeId` 든, 먼저 `resolveCanonicalMembersBy*` 로 그 가게의 멤버 집합 `{ primaryId, canonicalId, memberIds }` 를 풀고, 코퍼스를 `memberIds` 전체에서 합산해 로드하며, 결과는 항상 `primaryId` 로 되돌려 캐싱·영속한다. 부수 행(다이닝코드/테이블링)으로 트리거가 들어와도 같은 가게로 합쳐져 추적된다.

이 패턴이 없으면 — 분석을 입력으로 들어온 단일 행에만 걸면 — 한 가게의 리뷰가 출처별로 분절돼 "리뷰 탭엔 보이는데 enrich/군집엔 빠지는" 불일치가 생기고, 통계·검색·군집 품질이 출처 수만큼 깎인다.

## Instances

- **공급원 헬퍼** in [../topics/canonical](../topics/canonical.md): [canonical-members.ts](../../apps/friendly/src/modules/restaurant/canonical-members.ts) 가 fan-out 의 단일 진입점. `resolveCanonicalMembersByPlaceId`, `resolveCanonicalMembersByRestaurantId` 가 한 canonical 의 멤버 `Restaurant` 행(naver + diningcode + tabling partner — 공개 융합과 **동일 소스 규칙**)을 모아 `{ primaryId, canonicalId, memberIds }` 로 돌려준다. `primaryId` 는 placeId 를 가진 네이버 행 — 공개 조회·코퍼스 캐시·군집 영속(`ReviewCluster.restaurantId`)의 대표 키. `listPublicPlaces` 는 placeId 보유 가게 1개당 한 줄로 부수 행 리뷰를 합산하고 리뷰 0 가게는 제외(어드민 상태 목록 공용). `place` 행은 얕은 스냅샷이라 제외 — partner 만 멤버.

- **review-search (enrich · QA · 검색)** in [../topics/review-search](../topics/review-search.md): `loadCorpus`/`ensureEnriched`/`ask` 는 `resolveCanonicalMembersByRestaurantId`, 공개 QA(`askByPlaceId`)는 `resolveCanonicalMembersByPlaceId`, 상태집계는 `listPublicPlaces` 를 쓴다. 코퍼스는 멤버 행 전체에서 합산해 로드되고, `corpusCache`(LRU `max:16`)·`enriching` 진행 Map·SSE 키가 모두 `members.primaryId ?? restaurantId` 로 통일된다 ([review-search.service.ts](../../apps/friendly/src/modules/review-search/review-search.service.ts) — `key = members?.primaryId ?? restaurantId`, `corpusCache.set(key, ...)`, `enrichInBackground` 가 `p.primaryId` 로 추적). 커밋 3e1c90b "enrich·QA·군집을 canonical 통합 코퍼스로 — 다소스 행 합산".

- **review-clustering** in [../topics/review-clustering](../topics/review-clustering.md): `CLUSTERING_VERSION = 4` 가 **canonical 통합 코퍼스** 채택의 버전 마커("v4: canonical 통합 코퍼스(다소스 행 합산)"). `runForRestaurant` 가 멤버 집합을 풀어 `memberIds` 전체에서 코퍼스를 로드하고, 군집은 `primaryId` 로 영속(`persist(primaryId, ...)`)·같은 키로 공개 읽기. `corpusSize`(군집 시점의 멤버 합산 검색가능 리뷰 수)를 `ReviewCluster.corpusSize` 에 저장하고, 자동 재군집 게이트(`shouldRecluster`)가 `base = existing.corpusSize || 0` 과 현재 수를 비교해 churn 을 막는다. corpusSize 는 멤버 합산 크기이므로 새 출처 행이 붙으면 자연히 증가 → 재군집 트리거.

- **공개 리뷰 탭** in [../topics/canonical](../topics/canonical.md) / [../topics/friendly](../topics/friendly.md): 공개 상세/리뷰가 같은 canonical 단위로 본다 — `restaurant.merge.ts` 의 머지 헬퍼가 Naver + DC + 테이블링 partner 형제를 한 detail 응답으로 융합하고(`composeTablingAddon` 등), 공개 QA·공개 clusters 가 `placeId` 기반으로 같은 멤버 집합을 본다. 즉 사용자가 보는 통합 코퍼스와 분석이 fan-out 하는 멤버 집합이 **같은 소스 규칙**으로 일치한다 — "리뷰 탭엔 보이는데 분석엔 빠지는" 불일치 방지가 이 정합의 목적.

## What This Means

출처가 1개(네이버)에서 4개(네이버/다이닝코드/캐치테이블/테이블링)로 늘면서 "같은 가게"가 DB 에서 여러 `Restaurant` 행으로 쪼개졌다 — [[canonical]] 토픽이 그 묶음(`CanonicalRestaurant` 1:N)을 만든다. 분석을 단일 행에 걸면 한 가게의 리뷰가 출처별로 분절돼 검색 recall·군집 응집도·관점 통계가 모두 깎인다. 그래서 분석 레이어는 묶음의 정체를 입력 단계에서 풀어 **canonical 멤버 전체로 fan-out** 하고, 출력 단계에서 결과를 `primaryId` 하나로 되돌린다. fan-out(읽기)과 fold-in(쓰기 키)이 한 쌍이다.

이 패턴은 여러 기존 컨셉과 맞물린다:

- [[public-admin-route-split]] — 공개 표면은 `placeId`, 어드민 표면은 `restaurantId` 로 식별하는데, 둘 다 같은 멤버-해석 헬퍼(`resolveCanonicalMembersByPlaceId` vs `...ByRestaurantId`)를 거쳐 같은 멤버 집합·같은 `primaryId` 로 수렴한다. 두 식별 축이 분석 코퍼스에서는 한 점으로 만난다.
- [[in-memory-singleton-gates]] — `corpusCache`·`enriching` 진행 Map·군집 진행 가드가 app 싱글톤이고, 그 키가 전부 `primaryId` 로 통일돼야 부수 행으로 들어온 중복 트리거가 같은 가게로 합쳐져 게이트가 의미를 가진다. 키가 멤버별로 흩어지면 같은 가게에 enrich/군집이 중복 실행된다.
- [[versioned-llm-prompts]] — corpusSize(멤버 합산 크기)의 변화가 재enrich(`enrichVersion`)·재군집(`clusterVersion` + corpusSize 게이트) 트리거다. fan-out 의 코퍼스 크기 자체가 버전 게이트의 입력이라는 점이 핵심 — 새 출처 행 합류 = corpusSize 증가 = (게이트 통과 시) 재계산.

깨질 수 있는 지점: (1) 새 분석 진입점이 멤버 해석을 건너뛰고 입력 `restaurantId` 를 직접 쓰면 그 경로만 단일 행으로 회귀해 출처별 분절이 부활한다 — 모든 진입점이 `resolveCanonicalMembersBy*` 를 거치는 규율이 컴파일러가 아니라 사람에 의해 유지된다. (2) 멤버 소스 규칙이 표시 융합(`restaurant.merge.ts`)과 코퍼스 해석(`canonical-members.ts`)에서 어긋나면 "보이는 리뷰 ≠ 분석된 리뷰" 불일치가 다시 샌다 — 둘은 의도적으로 같은 규칙(naver + diningcode + tabling partner, place 제외)을 공유한다. (3) 키를 `primaryId` 대신 입력 id 로 캐싱하면 같은 가게가 출처별로 다른 캐시 슬롯을 먹어 LRU `max:16` 이 금방 차고 군집이 멤버마다 따로 영속된다.

## Sources

- [../topics/canonical](../topics/canonical.md)
- [../topics/review-search](../topics/review-search.md)
- [../topics/review-clustering](../topics/review-clustering.md)
- [../topics/friendly](../topics/friendly.md)
- [../../apps/friendly/src/modules/restaurant/canonical-members.ts](../../apps/friendly/src/modules/restaurant/canonical-members.ts)
- [../../apps/friendly/src/modules/review-search/review-search.service.ts](../../apps/friendly/src/modules/review-search/review-search.service.ts)
- [../../apps/friendly/src/modules/review-clustering/review-clustering.service.ts](../../apps/friendly/src/modules/review-clustering/review-clustering.service.ts)
- [../../apps/friendly/src/modules/restaurant/restaurant.merge.ts](../../apps/friendly/src/modules/restaurant/restaurant.merge.ts)
