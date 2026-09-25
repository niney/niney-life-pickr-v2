---
concept: canonical-corpus-fanout
last_compiled: 2026-09-26
topics_connected: [canonical, review-search, review-clustering, friendly, shared, web, api-contract]
status: active
---

# canonical 코퍼스 fan-out

## Pattern

리뷰 분석 레이어(검색·enrich·QA·군집·관점집계)는 단일 `restaurantId` 한 행이 아니라 **같은 canonical 가게의 다소스 멤버 행 전체**(네이버 + 다이닝코드 + 캐치테이블 + 테이블링 partner)에 fan-out 한다. 그리고 캐시·SSE·진행상태·군집 영속 키를 그 묶음의 대표 행 하나 — `primaryId`(placeId 를 가진 네이버 행) — 로 통일한다.

즉 분석을 시작할 때 입력이 `restaurantId` 든 `placeId` 든, 먼저 `resolveCanonicalMembersBy*` 로 그 가게의 멤버 집합 `{ primaryId, canonicalId, memberIds }` 를 풀고, 코퍼스를 `memberIds` 전체에서 합산해 로드하며, 결과는 항상 `primaryId` 로 되돌려 캐싱·영속한다. 부수 행(다이닝코드/테이블링)으로 트리거가 들어와도 같은 가게로 합쳐져 추적된다.

이 패턴이 없으면 — 분석을 입력으로 들어온 단일 행에만 걸면 — 한 가게의 리뷰가 출처별로 분절돼 "리뷰 탭엔 보이는데 enrich/군집엔 빠지는" 불일치가 생기고, 통계·검색·군집 품질이 출처 수만큼 깎인다.

## Instances

- **2026-09-26 — 운영(요약 중지·재개·재분석)과 어드민 상세까지 fan-out** in [../topics/canonical](../topics/canonical.md) / [../topics/friendly](../topics/friendly.md) / [../topics/shared](../topics/shared.md) / [../topics/web](../topics/web.md) (`420a6be`): 지금까지 fan-out 은 **분석 레이어**(검색·enrich·QA·군집)의 규칙이었고, 요약 **운영**과 어드민 상세는 네이버 행 하나에 머물러 있었다 — 그래서 다이닝코드·테이블링 리뷰와 그 요약 실패가 운영자에게 안 보였다(로컬 실측: 특돼지 목동점 어드민 리뷰 38 → 재구성 후 546, 테이블링 508 포함). 이번에 네 군데가 canonical 단위로 넘어왔다. ① `SummaryService.canonicalRowsForPlace(placeId)` 가 네이버 행의 `canonicalId` 로 같은 가게의 출처 행을 모아 `cancelSummaryForPlace`·`resumeSummaryForPlace`·`backfillForRestaurant`(재분석)를 **모든 출처 채널에** 적용한다 — 기존 엔드포인트의 의미가 바뀐 것이라 어드민 목록의 '실패 N' 배지(이미 통합 합계였다)를 누르면 이제 통합 재분석이 된다. ② `getDetailByPlaceId` 가 스칼라·스냅샷은 네이버 행, 리뷰·출처는 canonical 의 모든 행에서 합쳐 `RestaurantDetail.canonicalId`·`sources`(출처별 수치)·`reviews: AdminVisitorReview[]`(source·restaurantId 포함)로 낸다. ③ **채널 키 규칙의 단일화** — 큐 chain·중지 표식·SSE 버스가 쓰는 키를 `summaryChannelKey(row)`(네이버 = placeId, 다이닝코드 = `dc:<sourceId>`, 테이블링 = `tb:<sourceId>`) 하나로 모았다. fan-out 이 "출처별 채널들을 한 구독으로 받는 것" 이 되자 키를 만드는 곳(크롤 적재·재요약·부팅 재큐잉·SSE 구독)마다 규칙이 조금씩 달랐던 것이 버그로 드러났다 — SSE 는 테이블링을 `dc:` 로, 부팅 재큐잉은 `di:`/`ta:` 로 만들어 이벤트가 구독자에게 닿지 않았다. ④ **클라 구독도 canonical 로** — 다이닝코드·테이블링 리뷰의 단건 재요약 완료는 placeId 구독으로는 오지 않으므로, 재요약 POST 응답이 `canonicalId` 를 돌려주고 watcher 가 구독 키를 canonical 로 옮긴다([cross-tab-async-job-toast](cross-tab-async-job-toast.md)). shared `useRestaurantCanonicalSummaryEvents` 는 출처별 진행을 합산하고, SSE 매니저는 delta 계산의 `prev` 를 **출처 행(restaurantId) 단위**로 짝짓는다(canonical 구독엔 여러 출처 snapshot 이 섞여 오므로 — [stream-driven-cache-merge](stream-driven-cache-merge.md)). **fold-in 키가 두 개가 됐다는 점이 새롭다**: 분석 결과는 여전히 `primaryId` 로 접히지만, 운영 이벤트는 출처 행마다 자기 채널로 흐르고 구독만 `canonicalId` 로 묶는다. 남은 비-fan-out 지점 둘: (a) 공개 인사이트(`getInsights`)는 네이버 행만 집계한다 — 어드민 상세 한 화면 안에서 분석 탭·홈의 'N회 언급'(예: 목살 20)과 출처 통합 리뷰 필터 결과(98)가 어긋나고, 공용화된 `filterReviewsByTipMenu` 의 "N회 언급과 결과 수가 일치" 주석도 이제 사실이 아니다(공개 화면에도 원래 있던 불일치, 공개 수치 변경은 사용자 결정 대기). (b) 헤더의 **삭제**는 여전히 네이버 행 하나만 지운다(`deleteByPlaceId`) — 헤더가 출처 통합 수치("DB N")를 보여 주는 바로 옆이라, 확인 문구에 범위가 없으면 운영자는 다이닝코드·테이블링 행까지 지워진다고 읽기 쉽다. **읽기는 fan-out 됐는데 파괴적 쓰기는 단일 행에 남은** 비대칭이다.
  - **멤버 규칙이 둘이 됐다** — 분석 코퍼스는 [canonical-members.ts](../../apps/friendly/src/modules/restaurant/canonical-members.ts) 의 소스 규칙(네이버 + 다이닝코드 + 테이블링 partner — `sourceId` 가 `place:` 로 시작하는 얕은 테이블링 행 제외)을 쓰는데, 이번 운영 경로 두 곳(`canonicalRowsForPlace`·`getDetailByPlaceId`)은 `where: { canonicalId }` 로 **canonical 의 모든 행**을 본다. 운영자는 전부 봐야 하고, 얕은 행엔 리뷰·요약 행이 없어 지금 결과는 같다 — 하지만 아래 "깨질 수 있는 지점" (1)·(2) 가 경고한 "진입점마다 다른 멤버 해석" 이 의도적으로 하나 생긴 셈이라, 얕은 행이 리뷰를 갖게 되는 날(예: 캐치테이블 리뷰 수집) 어드민 리뷰 수와 분석 코퍼스 크기가 갈라진다.
- **공급원 헬퍼** in [../topics/canonical](../topics/canonical.md): [canonical-members.ts](../../apps/friendly/src/modules/restaurant/canonical-members.ts) 가 fan-out 의 단일 진입점. `resolveCanonicalMembersByPlaceId`, `resolveCanonicalMembersByRestaurantId` 가 한 canonical 의 멤버 `Restaurant` 행(naver + diningcode + tabling partner — 공개 융합과 **동일 소스 규칙**)을 모아 `{ primaryId, canonicalId, memberIds }` 로 돌려준다. `primaryId` 는 placeId 를 가진 네이버 행 — 공개 조회·코퍼스 캐시·군집 영속(`ReviewCluster.restaurantId`)의 대표 키. `listPublicPlaces` 는 placeId 보유 가게 1개당 한 줄로 부수 행 리뷰를 합산하고 리뷰 0 가게는 제외(어드민 상태 목록 공용). `place` 행은 얕은 스냅샷이라 제외 — partner 만 멤버.

- **review-search (enrich · QA · 검색)** in [../topics/review-search](../topics/review-search.md): `loadCorpus`/`ensureEnriched`/`ask` 는 `resolveCanonicalMembersByRestaurantId`, 공개 QA(`askByPlaceId`)는 `resolveCanonicalMembersByPlaceId`, 상태집계는 `listPublicPlaces` 를 쓴다. 코퍼스는 멤버 행 전체에서 합산해 로드되고, `corpusCache`(LRU `max:16`)·`enriching` 진행 Map·SSE 키가 모두 `members.primaryId ?? restaurantId` 로 통일된다 ([review-search.service.ts](../../apps/friendly/src/modules/review-search/review-search.service.ts) — `key = members?.primaryId ?? restaurantId`, `corpusCache.set(key, ...)`, `enrichInBackground` 가 `p.primaryId` 로 추적). 커밋 3e1c90b "enrich·QA·군집을 canonical 통합 코퍼스로 — 다소스 행 합산".

- **review-clustering** in [../topics/review-clustering](../topics/review-clustering.md): `CLUSTERING_VERSION = 4` 가 **canonical 통합 코퍼스** 채택의 버전 마커("v4: canonical 통합 코퍼스(다소스 행 합산)"). `runForRestaurant` 가 멤버 집합을 풀어 `memberIds` 전체에서 코퍼스를 로드하고, 군집은 `primaryId` 로 영속(`persist(primaryId, ...)`)·같은 키로 공개 읽기. `corpusSize`(군집 시점의 멤버 합산 검색가능 리뷰 수)를 `ReviewCluster.corpusSize` 에 저장하고, 자동 재군집 게이트(`shouldRecluster`)가 `base = existing.corpusSize || 0` 과 현재 수를 비교해 churn 을 막는다. corpusSize 는 멤버 합산 크기이므로 새 출처 행이 붙으면 자연히 증가 → 재군집 트리거.

- **공개 리뷰 탭** in [../topics/canonical](../topics/canonical.md) / [../topics/friendly](../topics/friendly.md): 공개 상세/리뷰가 같은 canonical 단위로 본다 — `restaurant.merge.ts` 의 머지 헬퍼가 Naver + DC + 테이블링 partner 형제를 한 detail 응답으로 융합하고(`composeTablingAddon` 등), 공개 QA·공개 clusters 가 `placeId` 기반으로 같은 멤버 집합을 본다. 즉 사용자가 보는 통합 코퍼스와 분석이 fan-out 하는 멤버 집합이 **같은 소스 규칙**으로 일치한다 — "리뷰 탭엔 보이는데 분석엔 빠지는" 불일치 방지가 이 정합의 목적.

## What This Means

출처가 1개(네이버)에서 4개(네이버/다이닝코드/캐치테이블/테이블링)로 늘면서 "같은 가게"가 DB 에서 여러 `Restaurant` 행으로 쪼개졌다 — [[../topics/canonical]] 토픽이 그 묶음(`CanonicalRestaurant` 1:N)을 만든다. 분석을 단일 행에 걸면 한 가게의 리뷰가 출처별로 분절돼 검색 recall·군집 응집도·관점 통계가 모두 깎인다. 그래서 분석 레이어는 묶음의 정체를 입력 단계에서 풀어 **canonical 멤버 전체로 fan-out** 하고, 출력 단계에서 결과를 `primaryId` 하나로 되돌린다. fan-out(읽기)과 fold-in(쓰기 키)이 한 쌍이다.

이 패턴은 여러 기존 컨셉과 맞물린다:

- [[public-admin-route-split]] — 공개 표면은 `placeId`, 어드민 표면은 `restaurantId` 로 식별하는데, 둘 다 같은 멤버-해석 헬퍼(`resolveCanonicalMembersByPlaceId` vs `...ByRestaurantId`)를 거쳐 같은 멤버 집합·같은 `primaryId` 로 수렴한다. 두 식별 축이 분석 코퍼스에서는 한 점으로 만난다.
- [[in-memory-singleton-gates]] — `corpusCache`·`enriching` 진행 Map·군집 진행 가드가 app 싱글톤이고, 그 키가 전부 `primaryId` 로 통일돼야 부수 행으로 들어온 중복 트리거가 같은 가게로 합쳐져 게이트가 의미를 가진다. 키가 멤버별로 흩어지면 같은 가게에 enrich/군집이 중복 실행된다.
- [[versioned-llm-prompts]] — corpusSize(멤버 합산 크기)의 변화가 재enrich(`enrichVersion`)·재군집(`clusterVersion` + corpusSize 게이트) 트리거다. fan-out 의 코퍼스 크기 자체가 버전 게이트의 입력이라는 점이 핵심 — 새 출처 행 합류 = corpusSize 증가 = (게이트 통과 시) 재계산.

깨질 수 있는 지점: (1) 새 분석 진입점이 멤버 해석을 건너뛰고 입력 `restaurantId` 를 직접 쓰면 그 경로만 단일 행으로 회귀해 출처별 분절이 부활한다 — 모든 진입점이 `resolveCanonicalMembersBy*` 를 거치는 규율이 컴파일러가 아니라 사람에 의해 유지된다. (2) 멤버 소스 규칙이 표시 융합(`restaurant.merge.ts`)과 코퍼스 해석(`canonical-members.ts`)에서 어긋나면 "보이는 리뷰 ≠ 분석된 리뷰" 불일치가 다시 샌다 — 둘은 의도적으로 같은 규칙(naver + diningcode + tabling partner, place 제외)을 공유한다. (3) 키를 `primaryId` 대신 입력 id 로 캐싱하면 같은 가게가 출처별로 다른 캐시 슬롯을 먹어 LRU `max:16` 이 금방 차고 군집이 멤버마다 따로 영속된다.

**2026-09-26 — fan-out 은 읽기에서 운영으로 번진다.** 처음엔 "분석이 출처별로 분절되지 않게" 였지만, 운영 화면이 한 행만 보면 분석이 통합이어도 운영자는 절반만 본다(다른 출처의 요약 실패는 고칠 수도 없다). 운영이 canonical 로 넘어오면서 드러난 건 **키 규칙의 산포**다 — 분석은 `primaryId` 하나로 접으면 끝났지만, 운영 이벤트는 출처별 채널을 가진 채로 합쳐져야 해서 채널 키를 만드는 모든 곳이 한 함수(`summaryChannelKey`)를 쓰지 않으면 이벤트가 조용히 사라진다. fan-out 을 새 레이어로 넓힐 때 확인할 것: (a) 입력 단계의 멤버 해석이 어느 규칙을 쓰는가(분석 규칙 vs canonical 전체), (b) 출력·이벤트 키가 한 곳에서 만들어지는가, (c) 클라 구독이 트리거 시점에 canonical 을 모를 때 어떻게 옮겨 타는가.

## Sources

- [../topics/canonical](../topics/canonical.md)
- [../topics/review-search](../topics/review-search.md)
- [../topics/review-clustering](../topics/review-clustering.md)
- [../topics/friendly](../topics/friendly.md)
- [../topics/shared](../topics/shared.md)
- [../topics/web](../topics/web.md)
- [../../apps/friendly/src/modules/summary/summary.service.ts](../../apps/friendly/src/modules/summary/summary.service.ts) — `summaryChannelKey`·`canonicalRowsForPlace`
- [../../apps/friendly/src/modules/restaurant/restaurant.service.ts](../../apps/friendly/src/modules/restaurant/restaurant.service.ts) — `getDetailByPlaceId`
- [../../packages/shared/src/hooks/summarySseManager.ts](../../packages/shared/src/hooks/summarySseManager.ts)
- [cross-tab-async-job-toast](cross-tab-async-job-toast.md)
- [stream-driven-cache-merge](stream-driven-cache-merge.md)
- [../../apps/friendly/src/modules/restaurant/canonical-members.ts](../../apps/friendly/src/modules/restaurant/canonical-members.ts)
- [../../apps/friendly/src/modules/review-search/review-search.service.ts](../../apps/friendly/src/modules/review-search/review-search.service.ts)
- [../../apps/friendly/src/modules/review-clustering/review-clustering.service.ts](../../apps/friendly/src/modules/review-clustering/review-clustering.service.ts)
- [../../apps/friendly/src/modules/restaurant/restaurant.merge.ts](../../apps/friendly/src/modules/restaurant/restaurant.merge.ts)
