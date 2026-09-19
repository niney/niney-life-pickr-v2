---
topic: canonical
last_compiled: 2026-09-19
sources_count: 64
status: active
aliases: [canonical, CanonicalRestaurant, canonical_restaurants, canonical-merge, tabling-merge, place-partner-promote, canonical-members, 같은 가게 통합, 출처 통합, 사이드 테이블 매칭, side-table-match, RestaurantStoreMatch, restaurant_store_matches, RestaurantTourMatch, restaurant_tour_matches, 상가 매칭, 맛집 상가 매칭, 여행로그 매칭, 맛집 여행로그 매칭, match:restaurant-stores, match:restaurant-tour, restaurant-store-match.service, restaurant-tour-match.service, storeNameScore, bigramDice, tourPlaceNameScore, isTourMatchAccepted, TOUR_MATCH_CANONICAL_WHERE, 폐업 의심, closedSuspect, StoreInfoBadges, TourMatchBadge, TourSummaryBadge, RestaurantStoreInfo, RestaurantTourMatchInfo, tourTravelers, tourScore, traveler strategy, avgTravelerScore]
---

# canonical — 출처 가로지르는 같은 가게 통합

**2026-09-12~09-19 변경 흡수 — canonical 을 축으로 한 "외부 출처 사이드 테이블" 매칭 골격 2종**: (1) **맛집 ↔ 상가업소 매칭**(`bc39a79`, 2026-09-12) — 소상공인시장진흥공단 상가(상권)정보 `LifeStore`(약 130만 행, food·cafe 만 후보)와 canonical 을 **좌표 ≤ 80m + 상호 점수 ≥ 0.5** 로 잇는 [restaurant-store-match.service.ts](../../apps/friendly/src/modules/restaurant/restaurant-store-match.service.ts) + `match:restaurant-stores`. 결과는 `RestaurantStoreMatch`(canonical 당 1행, `canonicalId` PK). 분기 재적재본에서 업소가 사라지면 `status='missing'`(**폐업 의심 — 플래그만, 목록 유지**), 다시 나타나면 `matched` 복귀. 마이그레이션 `20260912101013` 이 만든 `LifeStore` FK 는 전량 교체 적재와 충돌해 `20260912102150` 에서 제거. (2) **맛집 ↔ 여행로그 장소 매칭**(`c777380`, 2026-09-13) — AI 허브 여행로그 `TourPlace`(식당·상업·상점)와 **좌표 ≤ 100m + 점수 ≥ 0.5, 정규화 이름 완전일치면 ≤ 300m** 로 잇는 [restaurant-tour-match.service.ts](../../apps/friendly/src/modules/tour/restaurant-tour-match.service.ts) + `match:restaurant-tour` + 어드민 `POST /admin/tour/match/run`. **상가 매칭의 골격을 그대로 재사용**(`storeNameScore` import, 리포트 7분류, 이전 매칭 우선, dry-run)하되 세 가지가 다르다 — 장소도 1:1(`tourPlaceId` unique + `claimed` 맵), 완전일치 300m 확장, **식당 행이 있는 canonical 만** 대상(`TOUR_MATCH_CANONICAL_WHERE`). (3) **결합 지점은 [restaurant.service.ts](../../apps/friendly/src/modules/restaurant/restaurant.service.ts) 4곳**(`99991da`, 2026-09-13) — 공개 상세 `store`·`tour`(요약, matched 만), 공개 목록 `tour` + `sort=tourTravelers|tourScore`(매칭 없는 행 뒤로), 골라줘 `strategy='traveler'` + balanced 가 "있는 점수의 평균" 으로 일반화, 어드민 상세 `store`·`tour`(`RestaurantTourMatchInfo` — 근거·국세청 사업자 상태 포함). 웹은 `StoreInfoBadges`(공개·어드민 공용, 업종 배지 + 폐업 의심 경고)·`TourSummaryBadge`(공개)·`TourMatchBadge`(어드민)·`TourTab`(매칭 있을 때만 탭 노출). **canonical 모듈 자체(묶기 점수·merge/split·proposal)는 무변경** — 다만 merge/split 이 사이드 테이블을 모른다는 새 함정이 생겼다(Gotchas).

`apps/friendly/src/modules/canonical/` 와 `apps/friendly/src/lib/matching.ts` 를 묶은 어드민 전용 통합 레이어. Naver/캐치테이블/다이닝코드/**테이블링** 같은 서로 다른 source 에서 들어온 `Restaurant` 행들을 "이 넷이 사실은 같은 가게" 로 묶어 한 개의 `CanonicalRestaurant` 정체로 만든다. bigram Jaccard + Haversine 으로 점수를 매긴 cross-source 후보를 세 채널로 어드민에게 노출한다 — (1) 풀 후보 패널, (2) list 행 위에 끼는 1차 알림 줄, (3) 등록 직후 후크가 채우는 검토 큐 — 그리고 2026-05-17 부터는 (4) **보수적 임계를 통과한 Naver→DC 쌍에 한해 자동 머지**(C안). 임계를 못 넘으면 그대로 검토 큐로 fallback 한다. merge/split/delete 는 모두 명시 호출이며 트랜잭션 안에서 FK 무결성을 손으로 관리한다. **(2026-09 이후)** 크롤 출처가 아닌 **공공데이터 출처**(상가정보 `LifeStore`, 여행로그 `TourPlace`)는 `Restaurant` 멤버로 들이지 않고 canonical 당 1행짜리 **사이드 테이블**(`RestaurantStoreMatch`·`RestaurantTourMatch`)로 옆에 붙는다 — 아래 Architecture 11~14.

**2026-06 변경 흡수 — 테이블링 4번째 소스 합류**: (1) **공개 표시 융합이 3소스로 일반화** — [restaurant.merge.ts](../../apps/friendly/src/modules/restaurant/restaurant.merge.ts) 의 머지 헬퍼 군집이 Naver + DC + **테이블링** 세 출처를 한 detail 로 합친다(`composeTablingAddon` 추가, 261→372줄, 커밋 49c3c1d). (2) **테이블링 place↔partner 자동 승격 머지** — 같은 가게의 미입점 `place` 행과 입점 `partner` 행은 둘 다 `source='tabling'` 이라 cross-source 후보 룰의 사각지대였다. 저장 시점 좌표+이름 매칭으로 둘을 잇고 partner 쪽으로 머지("승격")한다(커밋 be0f759). (3) **canonical 멤버 조회 헬퍼** — 신규 [canonical-members.ts](../../apps/friendly/src/modules/restaurant/canonical-members.ts) 가 공개 융합과 동일 소스 규칙(naver+diningcode+tabling partner)으로 한 canonical 의 멤버 행을 푼다 — review-search/clustering 코퍼스 로딩의 공용 진입점. 단, canonical **묶기 후보 점수 매칭**(`matching.ts`/`canonical.service`/`proposal.service`)·schema·UI 는 무변경 — 테이블링 합류는 전적으로 표시 융합 + 저장 시점 자동 승격 두 갈래다.

## Purpose [coverage: high — 9 sources]

가게 데이터 인입은 source 별로 따로 들어온다 — Naver Place 크롤러, 다이닝코드 어댑터, 캐치테이블 어댑터가 각각 자신의 `(source, sourceId)` 로 `Restaurant` 행을 만들고 [unique 제약](../../apps/friendly/prisma/schema.prisma)`@@unique([source, sourceId])` 으로 같은 source 안 중복은 막는다. 하지만 source 가 다르면 같은 가게여도 절대 같은 행으로 안 들어온다. `canonical` 레이어가 그 위에 1단계를 더 얹어 "Naver `1234567` + 다이닝코드 `abc-def` = 한 가게" 를 사람이 검수하고 묶을 수 있게 한다.

**(2026-09-12~13 추가) canonical 은 이제 "외부 출처를 매다는 축" 이기도 하다.** 크롤로 들어오지 않는 공공데이터 — 상가(상권)정보의 업소 행, 여행로그의 장소 행 — 는 `Restaurant` 로 만들면 merge/split/FK/표시 융합 규칙과 전부 충돌한다(스냅샷도 크롤 잡도 없고, 분기·데이터셋 단위로 **전량 교체**된다). 그래서 canonical 한 행에 **최대 1행씩** 붙는 사이드 테이블로 두고, 매칭 스크립트가 적재 뒤 전수 재계산한다. 그 결과가 공개 상세의 업종/폐업 의심 배지·여행자 요약, 공개 목록의 여행자 정렬, 골라줘의 여행자 전략, 어드민 상세의 근거 카드로 흘러간다.

호출자:
- 어드민 가게 페이지 (`AdminRestaurantsPage`) — list 행 단위로 "병합" 버튼(`CanonicalMergePanel`), 행 위 1차 제안 알림 줄, 검토 큐 패널(`MergeProposalQueue`), canonical 단위 삭제 버튼.
- crawl 서비스 — 가게 등록(create) / 갱신(update) 직후 두 단계의 자동 후크 호출:
  - `generateProposalsForRestaurant` — 검토 큐 적재 ([crawl.service.ts:120](../../apps/friendly/src/modules/crawl/crawl.service.ts))
  - `tryAutoMatchDiningcode` — Naver done 후 DC 자동 매칭+머지 ([crawl.service.ts:142](../../apps/friendly/src/modules/crawl/crawl.service.ts)), 후크 진입 [:660-668](../../apps/friendly/src/modules/crawl/crawl.service.ts)
- **auto-discover 잡** — Naver Place 자동 등록 직후 위 두 후크가 그대로 트리거되므로 자동 발견의 후속으로 DC 자동 매칭이 일어남(별도 호출 코드 없음, runJob 의 공통 done 경로 재사용).
- `RestaurantService.list` — 매 list 응답에 각 canonical 의 `candidateCount` 와 (조건 만족 시) `suggestion` 1건을 끼워 보냄 ([restaurant.service.ts:483-642](../../apps/friendly/src/modules/restaurant/restaurant.service.ts), ~2026-06 기준 줄 번호).
- **(2026-09-12) 상가 매칭 스크립트** [match-restaurant-stores.ts](../../apps/friendly/scripts/match-restaurant-stores.ts) — `deploy.sh` 의 `life_map_data` 가 `load:life-stores` 직후 호출([deploy.sh:148-153](../../deploy.sh)). 좌표 있는 canonical **전부**를 훑는다.
- **(2026-09-13) 여행로그 매칭** [match-restaurant-tour.ts](../../apps/friendly/scripts/match-restaurant-tour.ts) — `deploy.sh` 가 여행로그 세트 루프 뒤 호출([deploy.sh:164-169](../../deploy.sh)); 어드민 `POST /admin/tour/match/run` 과 시드 콘솔의 "등록" 이 끝난 크롤 잡 뒤 자동 재실행(`matchAfterJob`, [tour-admin.service.ts:209-244](../../apps/friendly/src/modules/tour/tour-admin.service.ts)).
- **(2026-09-13) 공개·어드민 상세/목록/골라줘** — [restaurant.service.ts](../../apps/friendly/src/modules/restaurant/restaurant.service.ts) 가 canonicalId 로 두 사이드 테이블을 읽어 응답에 싣는다(Architecture 13).

권한은 canonical 모듈 라우트 전부 `app.authenticate + app.requireAdmin`. 일반 사용자는 호출 불가. 사이드 테이블은 **읽기만 공개**(상세·목록·골라줘에 실려 나감)이고 쓰기는 스크립트·어드민 run 뿐.

## Architecture [coverage: high — 28 sources]

```
                     ┌─ Restaurant (naver)   ┐
CanonicalRestaurant ─┼─ Restaurant (dc)      ├─ N:1 FK (onDelete: RESTRICT)
                     ├─ Restaurant (catch)   │
                     └─ Restaurant (tabling) ┘
        │
        ├─ CanonicalMergeProposal (A, B 페어, 항상 A < B)
        ├─ suggestionDismissedAt — list 알림 줄 닫힘 표식
        │
        │   ── 2026-09 사이드 테이블(멤버 아님, canonical 당 0..1행, FK CASCADE) ──
        ├─ RestaurantStoreMatch  ──(bizesId, FK 없음)──▶ LifeStore(상가업소, 분기 전량 교체)
        └─ RestaurantTourMatch   ──(tourPlaceId unique)─▶ TourPlace(여행로그 장소, 세트 단위 교체)
                                                          └─ TourPlaceBizStatus(국세청 사업자 상태)
```

사이드 테이블 매칭 공통 골격 (두 서비스가 같은 순서):

```
match*(prisma, {dryRun, now, onProgress})
  ├─ existing = 기존 매칭 전부 Map<canonicalId>            (tour 는 claimed = Map<placeId, canonicalId> 도)
  ├─ canonical 을 id asc 커서 500개씩
  │    └─ canonical 1개마다 후보 bbox findMany(kind/type 필터) → haversine → 이름 점수 → 수락 규칙
  │         ├─ 정렬: 점수 desc, 거리 asc
  │         ├─ best = prev 의 대상이 아직 후보에 있으면 prev 유지(안정성)  ← 더 좋은 후보가 생겨도 안 옮김
  │         │         아니면 후보[0]                                    (tour: 다른 canonical 이 안 가진 첫 후보)
  │         ├─ best 有: !prev → created(matchedAt=now) / prev 와 다른 대상 → rematched(matchedAt 갱신)
  │         │            / 같은 대상 → prev.status==='missing' ? recovered : kept   (lastSeenAt=now)
  │         ├─ best 無 & prev 有: prev.status==='missing' ? stillMissing : newlyMissing(status='missing')
  │         └─ best 無 & prev 無: unmatched
  └─ 리포트 {scanned, created, rematched, kept, newlyMissing, stillMissing, recovered, unmatched}
```

1. **Schema** ([schema.prisma:358-378](../../apps/friendly/prisma/schema.prisma)) — `CanonicalRestaurant` 가 부모, `Restaurant.canonicalId` 가 자식. FK 는 `onDelete: Restrict` 라 부모를 그냥 못 지운다(자식 먼저 정리 필요 — Gotchas 참조). `CanonicalMergeProposal` 은 `(canonicalAId, canonicalBId)` 가 unique 이고 둘 다 `onDelete: Cascade` — 부모 canonical 사라지면 그 쌍이 끼인 proposal 도 자동 삭제. **(2026-09)** `CanonicalRestaurant` 에 역방향 관계 `storeMatch RestaurantStoreMatch?`·`tourMatch RestaurantTourMatch?` 가 추가됐다 — 둘 다 `canonicalId` 가 PK 겸 FK(`onDelete: Cascade`)라 canonical 이 사라지면 같이 사라진다.
2. **Matching 유틸** ([matching.ts](../../apps/friendly/src/lib/matching.ts)) — `normalizeName`(소문자/공백·구두점 제거 + `본점|지점|점` suffix 1회 제거) → `bigrams` → `nameSimilarity`(Jaccard) → `scoreMatch`(이름 0.6 + 거리 0.4, 거리 200m 선형 감쇠). 좌표 하나라도 null 이면 `nameScore` 단독. `isCandidate` 가 cutoff 적용 — 좌표 有 `score ≥ 0.45 && distanceM ≤ 500`, 좌표 無 `nameScore ≥ 0.7`. **사이드 테이블 매칭은 이 유틸을 쓰지 않는다**(11 참조 — 다른 정규화·다른 유사도).
3. **CanonicalService** ([canonical.service.ts](../../apps/friendly/src/modules/canonical/canonical.service.ts)) — 5개 진입점: `loadSummary`(요약), `getCandidates`(어드민 패널용 풀 후보), `merge`(트랜잭션 안에서 `Restaurant.updateMany` → 원본 canonical `delete`, [:160-200](../../apps/friendly/src/modules/canonical/canonical.service.ts)), `split`(snapshot json 에서 좌표 추출해 새 canonical 생성, 잔여 0이면 원본 삭제), `deleteCanonical`(자식 Restaurant 먼저 `deleteMany` → 부모 delete), `dismissSuggestion`(`suggestionDismissedAt = new Date()`). 2026-09-12~19 변경 없음.
4. **ProposalService** ([proposal.service.ts](../../apps/friendly/src/modules/canonical/proposal.service.ts)) — `generateForCanonical(id)` (등록 후크), `generateAll`(어드민 "전체 다시 돌리기", O(N²) 페어 매칭 + bbox prefilter), `list`(open 만), `accept`(`canonical.merge` 위임, keepSide 가 살아남는 쪽), `reject`(같은 쌍 영구 차단).
5. **bbox prefilter** — `COORD_BOX_DELTA = 0.007`(위도 1°≈111km, 500m 임계의 약 1.5x). `findMany` 의 WHERE 절에 `latitude/longitude` 박스 조건을 걸어 Haversine 을 전수 호출하지 않게 좁힌다 ([canonical.service.ts:85-100](../../apps/friendly/src/modules/canonical/canonical.service.ts), [proposal.service.ts:41-59](../../apps/friendly/src/modules/canonical/proposal.service.ts)).
6. **List 응답 통합** ([restaurant.service.ts:330-646](../../apps/friendly/src/modules/restaurant/restaurant.service.ts), ~2026-06 기준 줄 번호) — 모든 Restaurant 를 한 번에 로드해 `byCanonical: Map<canonicalId, {canonical, sources[]}>` 로 그룹화 → 페어별 score 루프 안에서 각 canonical 의 `candidateCount` 와 `top1` 후보를 동시에 집계 → `suggestion` 은 `candidateCount ≥ 1 && suggestionDismissedAt === null` 일 때만 top1 으로 채움 → `CanonicalListItem` 한 줄에 `sources[] + candidateCount + suggestion?` 으로 반환.
7. **자동 DC 매칭 후크** ([crawl.service.ts:142-210](../../apps/friendly/src/modules/crawl/crawl.service.ts)) — `CrawlService` 가 옵셔널로 `CanonicalService` 를 주입받아 Naver 등록 직후 같은 canonical 의 DC 형제를 자동 발견 + 머지한다. 보수적 임계(이름 0.85 / 거리 50m / top1-top2 ≥ 0.1)를 통과한 경우에만 `saveDiningcodeShop` → `canonical.merge(dcCanonicalId, naverCanonicalId)`. 좌표 없거나 DC source 이미 보유 시 진입 조건 단계에서 차단. `RestaurantService.getCanonicalCoreForAutoMatch` ([restaurant.service.ts:224](../../apps/friendly/src/modules/restaurant/restaurant.service.ts)) 가 canonical 한 행의 name/sources/좌표를 한 번에 돌려준다.
8. **상세 응답 융합 헬퍼** ([restaurant.merge.ts](../../apps/friendly/src/modules/restaurant/restaurant.merge.ts), 372줄) — canonical 1:N 그룹 안의 Naver 행 + DC 형제(들) + **테이블링 partner 형제**를 한 detail 응답으로 합치는 순수 함수 군집: `mergeName`, `mergeCategory`, `mergeCoordinates`, `mergeAddress`, `mergePhone`, `mergeRating`, `mergeMenus`, `mergePhotos`, `mergeBlogReviews`, `mergeBusinessHours`, `mergeReviewCount`, `serializeTablingBusinessDays`, `computeStoredReviewCount`, `composeDiningcodeAddon`, `composeTablingAddon`, `computeSources`. **(2026-06)** 모든 머지 함수가 옵셔널 세 번째 인자 `tb: TablingSnapshot | null` 을 받아 "전 필드 Naver 1순위 + 필드별 폴백" 정책을 3소스로 일반화 — 영업시간은 Naver text > **테이블링 요일별 직렬화** > DC summary(테이블링이 가게 직접 관리라 DC 보다 정확), 메뉴는 Naver 비면 테이블링(가격+이미지 1차) > DC, 사진은 3소스 합집합 dedup. `composeTablingAddon` 은 테이블링 전용 부가정보(flags/4축 ratings/favoriteCount/businessDays — waitingCount 는 스테일이라 의도 제외). 테이블링 **partner 행만** 융합 대상 — `place` 행은 얕은 스냅샷이라 제외. canonical 모듈 외부(restaurant 모듈)에 있지만 **canonical 1:N 그룹의 표시 정책**을 담당. 어드민 발견 상세 패널에서 사용 ([restaurant.service.ts:1018-1102](../../apps/friendly/src/modules/restaurant/restaurant.service.ts), ~2026-06 기준). **사이드 테이블(store/tour)은 이 융합을 거치지 않는다** — 융합 결과 옆에 별도 필드로 붙는다(13).
9. **canonical 멤버 조회 헬퍼** ([canonical-members.ts](../../apps/friendly/src/modules/restaurant/canonical-members.ts)) — 공개 융합과 **동일 소스 규칙**(naver + diningcode + tabling partner)으로 한 canonical 의 멤버 `Restaurant` 행을 모으는 헬퍼 군집: `resolveCanonicalMembersByPlaceId`, `resolveCanonicalMembersByRestaurantId`, `listPublicPlaces`. 반환의 `primaryId` 는 placeId 보유(네이버) 행 — 공개 조회·코퍼스 캐시·군집 영속(`ReviewCluster.restaurantId`)의 대표 키. review-search(enrich/QA)·review-clustering 이 단일 restaurantId 대신 이 멤버 집합으로 코퍼스를 로드 → "리뷰 탭엔 보이는데 enrich/군집엔 빠지는" 불일치 방지. `listPublicPlaces` 는 placeId 보유 가게 1개당 한 줄로 부수 행(DC/테이블링) 리뷰를 합산하고 리뷰 0 가게는 제외(어드민 상태 목록 공용).
10. **테이블링 place↔partner 자동 승격 후크** ([crawl.service.ts](../../apps/friendly/src/modules/crawl/crawl.service.ts), `tryLinkTablingPlacePartner`) — 같은 가게의 `place`(미입점 JSON-LD)·`partner`(입점, 풍부) 행은 둘 다 `source='tabling'` 이라 cross-source 후보 룰(다른 source 만 후보)·제안 큐(새 source 만 제안)가 양쪽 다 건너뛰는 사각지대. 저장 시점에 좌표+이름으로 둘을 잇고 **partner 쪽으로 머지("승격")**한다. `saveTablingShop`(partner 저장)·`saveTablingPlace`(place 저장) 양방향에서 배선되며 어느 방향이든 keep=partner. auto-match(Naver/DC)로 canonical 이 바뀐 경우까지 최종 canonical 기준. 임계는 DC 자동매칭과 동일(이름 ≥0.85 / 거리 ≤50m / top1-top2 ≥0.1), 미달 시 silent skip.
11. **(2026-09-12) 상가업소 매칭** ([restaurant-store-match.service.ts](../../apps/friendly/src/modules/restaurant/restaurant-store-match.service.ts), 커밋 `bc39a79`) — `matchRestaurantStores(prisma, opts)`. 대상은 **좌표 있는 canonical 전부**(`latitude/longitude not null` — 식당 행 유무를 보지 않음). canonical 1개마다 `LifeStore` 를 bbox(위도 ±0.001°, 경도 ±0.00125° ≈ ±110m) + `kind in LIFE_STORE_RESTAURANT_KINDS`(`['food','cafe']`, [utils lifeStore.ts:43](../../packages/utils/src/lifeStore.ts)) 로 조회 → `haversineM`([utils geo.ts:64](../../packages/utils/src/geo.ts)) 반올림 → `distM > STORE_MATCH_MAX_DIST_M(80)` 제외 → `storeNameScore < STORE_MATCH_MIN_SCORE(0.5)` 제외. **이름 점수 사다리** `storeNameScore(restaurantName, storeName, branch)`: 양쪽을 `normalizeLifeStoreName`(NFC → 소문자 → `(주)|(유)|주식회사|유한회사|㈜` 제거 → 괄호 보조설명 제거 → 끝의 `본점|직영점|N호점|○○점` 제거 → 영숫자·한글만, [utils lifeStore.ts:86-93](../../packages/utils/src/lifeStore.ts))로 정규화한 뒤 — 상호 또는 `lifeStoreDisplayName(상호+지점명)` 과 **완전일치 1.0** / 한쪽(2자 이상)이 다른 쪽을 **포함 0.85** / 그 밖엔 **문자 바이그램 Dice**(상호·상호+지점 중 큰 값; 1글자는 유니그램). 왜 좌표가 주인가 — 상가 상호는 사업자 등록명이라 간판(크롤 이름)과 자주 다르다("(주)○○푸드" vs "○○식당"); 그래서 80m 안에서만 이름을 본다. 저장 필드는 업소 스냅샷(`bizesId·storeName·branch·kind·sclsName·ksicName`) + `distM·nameScore(소수 3자리)·status·matchedAt·lastSeenAt·missingSince`. `missingSince` 는 `newlyMissing` 때 1회만 기록, 복귀 시 null. 상세 응답용 `getRestaurantStoreInfo(prisma, canonicalId)` 는 status 와 무관하게 행이 있으면 돌려주고 `closedSuspect = status==='missing'`, `baseDate` 는 `LifeMasterSync layer='store'` 최신 행의 `baseDate`("YYYY-MM 기준 미확인" 문구용). 순수 함수 `bigramDice`·`storeNameScore` 는 export 해 단위 테스트([restaurant-store-match.test.ts](../../apps/friendly/src/modules/restaurant/restaurant-store-match.test.ts) — 점수 3건 + 격리 DB 로 생성→유지(더 가까운 후보가 생겨도 kept)→옮김(rematched)→missing(missingSince 1회)→stillMissing→dry-run 무쓰기→recovered).
12. **(2026-09-13) 여행로그 장소 매칭** ([restaurant-tour-match.service.ts](../../apps/friendly/src/modules/tour/restaurant-tour-match.service.ts), 커밋 `c777380`) — `matchRestaurantTour(prisma, opts)`. 11 과 같은 골격에 세 가지 차이. (a) **대상 축소**: `TOUR_MATCH_CANONICAL_WHERE = { latitude not null, longitude not null, restaurants: { some: {} } }` — 식당 행이 하나도 없는 고아 canonical(dev.db 테스트 잔재 7,969건이 상가 매칭을 훑던 문제)을 처음부터 제외; 어드민 상태 API 의 `match.candidates` 도 같은 where 로 센다([tour-admin.service.ts:86-89](../../apps/friendly/src/modules/tour/tour-admin.service.ts)). (b) **수락 규칙** `isTourMatchAccepted(distM, score)` = `(distM ≤ 100 && score ≥ 0.5) || (score ≥ 0.999 && distM ≤ 300)` — 여행자 입력 좌표·POI 좌표가 상가정보보다 거칠고 tour-c 의 장소 병합 반경도 300m 라 완전일치는 300m 까지. bbox 는 위도 ±0.003°, 경도 ±0.0035°(제주 위도 기준 ≈ 330m/320m). 후보 유형은 `TOUR_RESTAURANT_TYPE_SHORTS = ['식당','상업','상점']`([utils tourLog.ts:176](../../packages/utils/src/tourLog.ts) — 시장·상점으로 잘못 기록된 식당이 있어 상업·상점도 후보). 이름 점수 `tourPlaceNameScore(name, placeName, aliases)` 는 장소 이름과 별칭(`aliases` — `' | '` 구분) 각각에 **상가 매칭의 `storeNameScore` 를 재사용**해 최고값. (c) **장소 1:1**: `tourPlaceId` 가 unique 라 `claimed: Map<placeId, canonicalId>` 를 기존 매칭으로 채우고, 후보 중 "다른 canonical 이 안 가진 첫 후보" 를 고른다(prev 유지가 우선). rematched 때 이전 장소를 `claimed` 에서 풀어준다. `missingSince` 열이 **없다**(newlyMissing 때 `status='missing'` 만). 상세 응답용 `getRestaurantTourMatchInfo(prisma, canonicalId)` 는 status 무관하게 행이 있으면 `TourPlace` 집계(nTravelers·nVisits·nRated·bayesScore·meanDgstfn·revisitRate·stayMedian·spendPpMedian·topReasonNm) + `TourPlaceBizStatus`(국세청 `bStt·endDt·checkedAt`) + `sampleLabel = TOUR_SAMPLE_LABEL`("2023년 4~9월 여행자 표본") 를 합쳐 돌려주되 **장소가 재적재로 사라졌으면 null**. 테스트 [restaurant-tour-match.service.test.ts](../../apps/friendly/src/modules/tour/restaurant-tour-match.service.test.ts) — 점수·수락 2건 + 격리 DB(식당 행 있는 canonical 만 scanned=3, C-a 가 P1(≈22m) 을 가져가면 같은 좌표의 C-b 는 완전일치 300m 규칙으로 P2(≈245m), 고아 C-orphan 은 행 없음, 장소 삭제 → missing, 복귀 → recovered, dry-run 무쓰기).
13. **(2026-09-13) 결합 지점 — [restaurant.service.ts](../../apps/friendly/src/modules/restaurant/restaurant.service.ts)** (커밋 `99991da`; `bc39a79` 에서 store 먼저) — canonical 모듈이 아니라 restaurant 서비스가 canonicalId 로 두 사이드 테이블을 읽는다.
   - `getPublicDetail` ([:1639-1640](../../apps/friendly/src/modules/restaurant/restaurant.service.ts)) — `store = getRestaurantStoreInfo(naverRow.canonicalId)`(missing 포함), `tour = getRestaurantTourSummary(canonicalId)`([tour-public.service.ts:40-45](../../apps/friendly/src/modules/tour/tour-public.service.ts) — **`status==='matched'` 만**, 장소 없으면 null, 식별자 없는 `RestaurantTourSummary`).
   - `getPublicList` ([:1524](../../apps/friendly/src/modules/restaurant/restaurant.service.ts)) — `getPublicListTourMap(canonicalIds)`([tour-public.service.ts:48-71](../../apps/friendly/src/modules/tour/tour-public.service.ts), matched 만, 500개 IN 청크 2회) → 행마다 `tour: {nTravelers, bayesScore, spendPpMedian, revisitRate} | null`. `pickPublicSort` ([:2782-2794](../../apps/friendly/src/modules/restaurant/restaurant.service.ts)) 에 `tourTravelers`(nTravelers desc) · `tourScore`(bayesScore desc, 동률 nTravelers) — 둘 다 `nullsLast` 로 매칭 없는 행은 뒤로.
   - `smartPick` ([:2511-2577](../../apps/friendly/src/modules/restaurant/restaurant.service.ts), 공개·어드민 공용) — 후보의 `canonicalId` 를 select 에 추가해 `getPublicListTourMap` 으로 `bayesScore` 를 얻고 `travelerWeight`(1~5 → 0~1, [tour-public.service.ts:37](../../apps/friendly/src/modules/tour/tour-public.service.ts)) 로 정규화. `strategy='traveler'` 는 그 값만, **`balanced` 는 `[sentNorm, satNorm, tourNorm]` 중 null 아닌 것의 평균**(이전엔 두 점수만) — 리뷰 분석이 없는 가게도 여행자 점수만으로 후보에 든다. 결과 `picked.avgTravelerScore`(1~5 또는 null).
   - `getDetailByPlaceId`(어드민, [:2478-2479](../../apps/friendly/src/modules/restaurant/restaurant.service.ts)) — `store`(동일) + `tour = getRestaurantTourMatchInfo`(**missing 포함**, 근거·사업자 상태 포함).
   - 시드 콘솔 쪽 역참조 `registeredNaverIds(tourPlaceIds)` ([tour-public.service.ts:74](../../apps/friendly/src/modules/tour/tour-public.service.ts)) — 장소 id → matched 매칭의 canonical → 네이버 placeId(인사이트·코스의 "등록된 맛집" 링크·그룹투표 후보).
14. **(2026-09-12~13) 표시 컴포넌트(웹)** — [StoreInfoBadges.tsx](../../apps/web/src/components/restaurant/detail/StoreInfoBadges.tsx)(공개 `HomeTab` 헤더와 어드민 상세 헤더 **공용**: 업종 배지 "`{industry}` · 상가정보"(title 에 상호+지점·표준산업분류·거리·유사도·`YYYY-MM` 분기) + `closedSuspect` 면 amber "폐업 의심 · 상가정보 YYYY-MM 기준 미확인"(title 에 `missingSince` 날짜, "매칭 오류일 수 있어 목록에는 그대로 둡니다"); 색만으로 뜻을 전하지 않게 아이콘+글자, 테스트 3건 [StoreInfoBadges.test.tsx](../../apps/web/src/components/restaurant/detail/StoreInfoBadges.test.tsx)). [TourSummaryBadge.tsx](../../apps/web/src/components/restaurant/detail/TourSummaryBadge.tsx)(공개: teal "여행자 N명 · 만족 x.xx · 2023" + 홈 탭 `TourSummaryLine` 4칸(여행자·보정 만족도·재방문·1인 지출) + `TourSourceNote`; 매칭 근거·폐업 상태는 싣지 않음). [TourMatchBadge.tsx](../../apps/web/src/components/restaurant/detail/TourMatchBadge.tsx)(어드민: 같은 teal 배지지만 title 에 장소명·유형·거리·유사도·방문/평가/재방문/체류/지출·`status==='missing'` 이면 "재적재 후 장소가 후보에서 사라짐(매칭 보류)"; `bizStatus.bStt` 가 폐업자/휴업자면 amber "국세청 {bStt}"). [HomeTab.tsx](../../apps/web/src/components/restaurant/detail/HomeTab.tsx) 헤더에 두 배지 + `detail.tour` 있을 때 "여행자 방문 통계" 섹션(→ `onChangeTab('tour')`). [PublicRestaurantDetail.tsx](../../apps/web/src/components/restaurant/detail/PublicRestaurantDetail.tsx) 는 `TAB_ORDER` 에서 `tour` 탭을 `detail.data.tour !== null` 일 때만 남기고([tabs.ts](../../apps/web/src/components/restaurant/detail/tabs.ts) — 홈·분석·**여행자**·메뉴·리뷰·질문…), [TourTab.tsx](../../apps/web/src/components/restaurant/detail/TourTab.tsx) 는 열릴 때만 `useRestaurantPublicTourStats(placeId)` 조회. [AdminRestaurantDetailPage.tsx](../../apps/web/src/routes/admin/AdminRestaurantDetailPage.tsx) 헤더에 `StoreInfoBadges`+`TourMatchBadge`, `detail.tour` 있으면 `TourEvidenceSection` 카드([TourEvidencePanel.tsx:299](../../apps/web/src/components/admin/tour/TourEvidencePanel.tsx) — 원본 열람 allowlist 층, 상세는 [tour](tour.md)). 목록·골라줘: [PublicRestaurantCard.tsx:105-110](../../apps/web/src/components/restaurant/PublicRestaurantCard.tsx) "🧭 여행자 N명 · x.x", [PublicRestaurantList.tsx:20-21](../../apps/web/src/components/restaurant/PublicRestaurantList.tsx) 정렬 칩 "여행자 방문순"/"여행자 만족순", [SmartPickSection.tsx:70-110](../../apps/web/src/components/restaurant/SmartPickSection.tsx) `travelerMode` → `strategy: 'traveler'`, [RestaurantsV2Page.tsx:150-156](../../apps/web/src/routes/RestaurantsV2Page.tsx) 공유 진입 핀은 상세의 `tour` 로 목록형 `tour` 를 조립.

## Talks To [coverage: high — 21 sources]

- **Prisma** — canonical 모듈 자체는 `canonical_restaurants`, `canonical_merge_proposals`, `restaurants` 세 테이블만 만진다(~2026-09-07 기준 그대로). **(2026-09)** canonical 을 축으로 `restaurant_store_matches`·`restaurant_tour_matches` 두 사이드 테이블이 추가됐지만 이를 쓰는 건 매칭 서비스 2종과 restaurant 서비스 — canonical 모듈은 여전히 Registry/cache/외부 어댑터 의존성 없는 순수 DB 모듈.
- **`@repo/api-contract`** ([schemas/canonical.ts](../../packages/api-contract/src/schemas/canonical.ts)) — `CanonicalSummary`, `CanonicalMatchCandidate`, `CanonicalSuggestion`, `CanonicalProposalItem` 등 zod. `CanonicalListItem` 은 [restaurant.ts](../../packages/api-contract/src/schemas/restaurant.ts) 에 있고 `CanonicalSuggestion` 을 import. **(2026-09-12~13)** 같은 파일에 `RestaurantStoreInfo`(bizesId·name·branch·kind·industry·ksicName·distM·nameScore·closedSuspect·missingSince·baseDate), `RestaurantTourMatchInfo`(어드민용 — 장소·거리·점수·status matched|missing·집계·sampleLabel·bizStatus), `RestaurantDetail.store/tour`, `RestaurantPublicDetail.store/tour`(tour 는 [tour.ts](../../packages/api-contract/src/schemas/tour.ts) 의 `RestaurantTourSummary`), `RestaurantPublicListItem.tour`(`RestaurantPublicListTour` 4필드), `RestaurantPublicListQuery.sort` 에 `tourTravelers|tourScore`, `RestaurantSmartPickStrategy` enum(`balanced|satisfaction|positive|traveler`) 과 `RestaurantSmartPickResult.picked.avgTravelerScore`.
- **crawl** ([crawl.service.ts:86-210, 660-668](../../apps/friendly/src/modules/crawl/crawl.service.ts)) — 생성자가 `ProposalService` + `CanonicalService` 를 옵셔널 주입(둘 다 `null` 가능 — 테스트 단순화용). Naver 등록/갱신 직후 두 후크가 순차 호출됨:
  - `generateProposalsForRestaurant` — 검토 큐 적재 (실패 시 console.error 만, 등록 흐름 무관)
  - `tryAutoMatchDiningcode` — fire-and-forget(`void`). 통과 시 `canonical.merge` 호출, 미통과 시 silent skip. ProposalService 큐와 자동 머지는 **배타적** — 자동 머지가 성공하면 두 canonical 이 하나가 되어 같은 페어가 다시 큐에 안 들어옴.
- **auto-discover** — 자동 발견 잡이 Naver Place 를 등록할 때 동일한 `runJob done` 경로를 거치므로 위 두 후크가 그대로 트리거된다. 즉 자동 발견의 결과로 DC 자동 매칭이 일어남(별도 분기 없음).
- **restaurant** — `RestaurantService.upsertRestaurantFromCrawl` 등이 신규 행 생성 시 `canonical: { create: { ... } }` 로 1:1 canonical 을 함께 만든다 ([restaurant.service.ts:87-108](../../apps/friendly/src/modules/restaurant/restaurant.service.ts)). `getCanonicalIdForRestaurant` 는 후크가 restaurantId → canonicalId 를 푸는 데 사용. `getCanonicalCoreForAutoMatch` ([:224](../../apps/friendly/src/modules/restaurant/restaurant.service.ts)) 는 자동 매칭이 name/sources/좌표 한 묶음을 받기 위한 헬퍼. **(2026-06)** `findTablingCanonicalsNear` 가 좌표 박스 안 tabling canonical 을 `sourceId` 까지 반환(place `'place:'` prefix / partner 숫자 분류용) — `tryLinkTablingPlacePartner` 가 사용. **`restaurant.merge.ts`** ([restaurant.merge.ts](../../apps/friendly/src/modules/restaurant/restaurant.merge.ts)) 의 머지 헬퍼 군집이 canonical 1:N 그룹(Naver+DC+테이블링)을 detail 응답 한 덩어리로 융합 — canonical 토픽이 정의한 그룹 정체를 표시 레이어가 어떻게 펴는지의 정답지. **`canonical-members.ts`** ([canonical-members.ts](../../apps/friendly/src/modules/restaurant/canonical-members.ts)) 는 같은 소스 규칙으로 멤버 행을 모아 review-search/clustering 에 공급 — 토픽 [review-clustering](review-clustering.md)·[review-search](review-search.md) 의 코퍼스 진입점. **(2026-09-13)** `getPublicDetail`·`getPublicList`·`smartPick`·`getDetailByPlaceId` 가 `restaurant-store-match.service`·`restaurant-tour-match.service`·`tour-public.service` 를 import 해 사이드 테이블을 응답에 싣는다(Architecture 13).
- **life-map(상가 마스터)** — `LifeStore`(`load:life-stores`, 130만 행, `(kind, lat, lng)` 인덱스)와 `LifeMasterSync layer='store'`(`baseDate`) 는 [life-map](life-map.md) 소유. 상가 매칭은 그 테이블을 **읽기만** 하고, `deploy.sh` 가 적재 직후 `match:restaurant-stores` 를 이어 부른다([deploy.sh:148-153](../../deploy.sh) — 실패해도 echo 후 배포 계속). utils [lifeStore.ts](../../packages/utils/src/lifeStore.ts) 의 `normalizeLifeStoreName`·`lifeStoreDisplayName`·`LIFE_STORE_RESTAURANT_KINDS` 가 점수 함수의 정규화 규칙.
- **tour(여행로그)** — `TourPlace`(세트 단위 전량 교체, `typeShort`·`aliases`·집계 열)·`TourPlaceBizStatus`(`check:tour-biz`) 는 [tour](tour.md) 소유. 여행로그 매칭 서비스는 tour 모듈 폴더에 있고([modules/tour/restaurant-tour-match.service.ts](../../apps/friendly/src/modules/tour/restaurant-tour-match.service.ts)) 상가 매칭의 `storeNameScore` 를 import — **tour → restaurant 방향 의존**. `tour-admin.service` 가 `runMatch`(모듈 스코프 `matchInFlight` 로 단일 실행, [tour-admin.service.ts:76, 236-244](../../apps/friendly/src/modules/tour/tour-admin.service.ts))·`status().match{matched,missing,candidates}`·`seeds`(`restaurant_tour_matches` LEFT JOIN 으로 `unmatched|matched` 필터)·`register → matchAfterJob`(크롤 잡 done 이벤트 뒤 전수 재실행) 로 매칭을 구동. `unload:tour --yes` 는 Tour* 와 함께 `RestaurantTourMatch`·`TourPlaceBizStatus` 를 지운다([unload-tour.ts](../../apps/friendly/scripts/unload-tour.ts)). utils [tourLog.ts](../../packages/utils/src/tourLog.ts) 의 `TOUR_RESTAURANT_TYPE_SHORTS`·`TOUR_SAMPLE_LABEL`, [geo.ts](../../packages/utils/src/geo.ts) 의 `haversineM`.
- **shared / web** — [canonical.api.ts](../../packages/shared/src/api/canonical.api.ts), [useCanonical.ts](../../packages/shared/src/hooks/useCanonical.ts) (React Query 훅 8개). 어드민 UI 는 [CanonicalMergePanel.tsx](../../apps/web/src/components/restaurant/CanonicalMergePanel.tsx)(후보 패널 + merge/split 버튼), [MergeProposalQueue.tsx](../../apps/web/src/components/restaurant/MergeProposalQueue.tsx)(검토 큐 + 전체 다시 돌리기), [AdminRestaurantsPage.tsx](../../apps/web/src/routes/admin/AdminRestaurantsPage.tsx)(suggestion 알림 줄, "닫기", canonical 단위 삭제 다이얼로그). **(2026-09-13)** 사이드 테이블 쪽은 별도 API 함수가 거의 없다 — 상세/목록/골라줘 응답에 실려 오므로 기존 `useRestaurantPublicDetail/List/SmartPick` 그대로. 추가는 [restaurant.api.ts](../../packages/shared/src/api/restaurant.api.ts) `publicTourStats(placeId)`(`Routes.Tour.publicRestaurantStats`, 매칭 없으면 404) + [useRestaurant.ts](../../packages/shared/src/hooks/useRestaurant.ts) `useRestaurantPublicTourStats(placeId | null)`(enabled = placeId 있을 때, staleTime 5분, `retry: false`) 뿐. 웹 컴포넌트는 Architecture 14.
- **deploy / 운영 스크립트** — [package.json](../../apps/friendly/package.json) `match:restaurant-stores`·`match:restaurant-tour`(둘 다 `tsx --env-file=.env scripts/...`). [life-map-status.ts](../../apps/friendly/scripts/life-map-status.ts) 는 `tour_matched=N`(matched 만)을 내지만 **상가 매칭 건수는 내지 않는다**(`store=` 는 LifeStore 적재 건수).

## API Surface [coverage: high — 12 sources]

베이스 prefix `/api/v1`. `Routes.Canonical` ([routes.ts:127-150](../../packages/api-contract/src/routes.ts)) 에 한 곳에 정의. 모두 `authenticate + requireAdmin`. Route 핸들러 → service → 예외 `CanonicalError` 발생 시 `mapError` 가 `NOT_FOUND→404 / CONFLICT→409 / BAD_REQUEST→400` 으로 변환. **2026-09-12~19 에 canonical 라우트 자체는 추가·변경 없음.**

| Method | Path | Body / Params | 200 응답 |
| --- | --- | --- | --- |
| GET | `/admin/canonical/:id/candidates` | `params: { id }` | `CanonicalCandidatesResult` — `{ target, candidates: MatchCandidate[] }`. cross-source 만, score desc 정렬. 풀 후보 패널이 사용. |
| POST | `/admin/canonical/merge` | `{ sourceCanonicalId, targetCanonicalId }` | `CanonicalMergeResult` — `{ ok, target, movedRestaurantIds }`. source 의 모든 Restaurant 가 target 으로 이전되고 source canonical 행은 삭제. 같은 id 면 400, 어느 한쪽 없으면 404. **(2026-09)** source 에 붙어 있던 store/tour 매칭 행은 FK Cascade 로 같이 사라진다(Gotchas). |
| POST | `/admin/canonical/:id/split` | `{ restaurantId }` | `CanonicalSplitResult` — `{ ok, newCanonical, sourceCanonicalDeleted }`. restaurant 의 snapshotJson 에서 좌표 추출(naver `latitude/longitude` / DC `lat/lng` 둘 다 시도). 잔여 0이면 원본 canonical 삭제 후 `sourceCanonicalDeleted: true`. 새 canonical 엔 매칭 행이 없다. |
| POST | `/admin/canonical/:id/suggestion/dismiss` | `params: { id }` | `{ ok: true }`. `suggestionDismissedAt = now()` 영구. 풀 후보 패널과는 별개 — 어드민이 "병합" 직접 클릭하면 candidates 가 다시 후보를 계산. |
| GET | `/admin/canonical/proposals` | — | `CanonicalProposalListResult` — `{ items: ProposalItem[] }`. `status = 'open'` 만, score desc → createdAt desc. |
| POST | `/admin/canonical/proposals/run` | — | `{ created: number }`. 어드민 "전체 다시 돌리기". 이미 open/rejected 인 쌍은 skip. |
| POST | `/admin/canonical/proposals/:id/accept` | `{ keepSide: 'A' \| 'B' }` (default `'A'`) | `{ ok, merge: CanonicalMergeResult }`. 내부적으로 `canonical.merge(sourceId, targetId)` 호출 → FK Cascade 로 같은 source/target 이 끼인 다른 open proposal 들이 자동 정리. |
| POST | `/admin/canonical/proposals/:id/reject` | — | `{ ok: true }`. status='rejected' + resolvedAt. 같은 쌍은 두 canonical 살아 있는 동안 다시 큐에 안 들어옴. |
| DELETE | `/admin/canonical/:id` | `params: { id }` | `{ ok, deletedRestaurantCount, deletedReviewCount }`. canonical 단위 통째 삭제 — 매달린 Restaurant 들 + 그 VisitorReview/MenuCanonical/Proposal 모두 정리. 매칭 행 2종도 Cascade. |

Proposal 의 status enum 은 `open | accepted | rejected | superseded` ([canonical.ts:103-109](../../packages/api-contract/src/schemas/canonical.ts)). 실제로 DB 에 들어가는 값은 `open` / `rejected` 만 — `accepted` 는 merge 와 동시에 cascade 로 행이 사라지고, `superseded` 는 한쪽 canonical 이 다른 머지로 사라질 때 같은 cascade 경로로 행 자체가 사라지므로 별도 마킹이 없다.

### (2026-09-12~13) 사이드 테이블 결과가 실려 나가는 기존 라우트

매칭 결과 전용 라우트는 없다 — 아래 기존 응답에 필드로 붙는다(커밋 `bc39a79` store, `99991da` tour). 라우트 정의는 `Routes.Restaurant`/`Routes.Tour` ([routes.ts](../../packages/api-contract/src/routes.ts)).

| Method | Path | 인증 | 매칭 관련 필드 / 파라미터 |
| --- | --- | --- | --- |
| GET | `/restaurants/public/:placeId` | 없음 | `store: RestaurantStoreInfo \| null`(missing 이면 `closedSuspect: true`), `tour: RestaurantTourSummary \| null`(**matched 만**, 식별자 없음, `sampleLabel`·`sourceNote` 포함) |
| GET | `/restaurants/public` | 없음 | 행마다 `tour: {nTravelers, bayesScore, spendPpMedian, revisitRate} \| null`; `sort=tourTravelers \| tourScore`(매칭 없는 행 뒤로). `store` 는 목록에 없음 |
| POST | `/restaurants/public/smart-pick` · `/admin/restaurants/smart-pick` | 없음 / admin | `strategy: balanced \| satisfaction \| positive \| traveler`(zod default balanced); `picked.avgTravelerScore`(1~5 또는 null) |
| GET | `/restaurants/public/:placeId/tour-stats` | 없음(`RATE.tourRead` 120/분) | "여행자" 탭 — 매칭(matched) 없으면 404. 집계 내용은 [tour](tour.md) |
| GET | `/admin/restaurants/place/:placeId` | admin | `store`(동일), `tour: RestaurantTourMatchInfo \| null`(**missing 포함** — `status`, 거리·점수·`matchedAt`, 장소 집계, `bizStatus{bStt,endDt,checkedAt}`; 장소가 재적재로 사라졌으면 null) |
| GET | `/admin/tour/status` | admin | `match: { matched, missing, candidates }` — candidates = `TOUR_MATCH_CANONICAL_WHERE` 건수; `seeds.unmatchedT5` 는 여행자 ≥5 식당류 장소 중 매칭 없는 수(raw SQL LEFT JOIN) |
| GET | `/admin/tour/seeds?status=unmatched\|matched` | admin | 시드 표 — `restaurant_tour_matches` LEFT JOIN 으로 필터, 행에 `matchStatus` |
| POST | `/admin/tour/match/run` | admin | `TourMatchRunResult` = 리포트 8필드 + `durationMs`. 동시 호출은 진행 중 Promise 를 공유(`matchInFlight`) |
| POST | `/admin/tour/seeds/:placeId/register` | admin | 크롤 등록 뒤 잡 done → `runMatch()` 자동 |

### CLI

| 명령 | 전제 | 출력 |
| --- | --- | --- |
| `pnpm --filter friendly match:restaurant-stores [--dry-run]` | `LifeStore` 0행이면 "먼저 load:life-stores" 안내 후 `exitCode=1` | `[결과] 검토 N · 매칭 M(율%) — 신규·옮김·유지·복귀` / `[폐업 의심] 이번에 사라짐·계속·미매칭 (초)`; 진행 로그 2,000건마다. dry-run 은 리포트만 |
| `pnpm --filter friendly match:restaurant-tour [--dry-run]` | `TourPlace` 0행이면 "먼저 load:tour" 안내 후 `exitCode=1` | 같은 형식(`[사라짐] …`). [deploy-friendly.md:337](../../docs/deploy-friendly.md) — "세트 다 적재한 뒤 한 번, 먼저 --dry-run 으로 매칭률 확인" |
| `./deploy.sh`(케이스 1·2·4·6) | `life_map_data` 안에서 상가 zip 있으면 `load:life-stores → match:restaurant-stores`, 여행로그 세트 폴더 루프 뒤 `match:restaurant-tour` | 매칭 실패는 "(매칭 실패 — 수동 재실행)" echo 로 삼키고 배포 계속 |

## Data [coverage: high — 10 sources]

### `canonical_restaurants` ([migration](../../apps/friendly/prisma/migrations/20260515083303_add_canonical_restaurant/migration.sql))

| 컬럼 | 타입 | 비고 |
| --- | --- | --- |
| `id` | TEXT PK | cuid |
| `name` | TEXT | 표시용. merge 시 target 의 값 유지. **매칭 이름 점수의 입력**(`storeNameScore(c.name, …)`) |
| `primaryCategory` | TEXT? | primary 행의 카테고리 |
| `latitude` / `longitude` | REAL? | 후보 매칭용. primary 좌표. bbox 인덱스 `(latitude, longitude)`. **사이드 테이블 매칭도 이 좌표가 기준** — null 이면 두 매칭 모두 대상 밖 |
| `searchKey` | TEXT? | 예약 — 현재 채워지지 않음. 추후 prefix scan 후보 |
| `suggestionDismissedAt` | DATETIME? | list 행 위 1차 제안 알림 닫힘 표식. [migration](../../apps/friendly/prisma/migrations/20260515100910_add_canonical_suggestion_dismissed/migration.sql) 에서 추가. null 이면 노출 후보 |
| `createdAt` / `updatedAt` | DATETIME | |

Prisma 관계(2026-09): `restaurants Restaurant[]`, `storeMatch RestaurantStoreMatch?`, `tourMatch RestaurantTourMatch?` ([schema.prisma:358-378](../../apps/friendly/prisma/schema.prisma)).

마이그레이션 적용 시점에 기존 Restaurant 1행 = canonical 1행 (id 그대로 재활용). 좌표는 `json_extract(snapshotJson, '$.latitude' or '$.lat')` 로 COALESCE 백필 — source 별 필드명 차이(naver vs DC) 흡수.

### `canonical_merge_proposals` ([migration](../../apps/friendly/prisma/migrations/20260515104718_add_canonical_merge_proposals/migration.sql))

| 컬럼 | 타입 | 비고 |
| --- | --- | --- |
| `id` | TEXT PK | cuid |
| `canonicalAId` / `canonicalBId` | TEXT FK | 둘 다 `ON DELETE CASCADE`. **항상 A < B** 로 정규화 저장(cuid 사전순). UNIQUE `(canonicalAId, canonicalBId)` |
| `score` / `nameScore` | REAL | `scoreMatch` 결과 그대로 |
| `distanceM` | REAL? | 좌표 둘 다 있을 때만 |
| `status` | TEXT | default `'open'`. INDEX. 실제 값은 open/rejected 만 (accepted/superseded 는 cascade 로 행 소멸) |
| `createdAt` / `resolvedAt` | DATETIME | |

### `restaurants.canonicalId` ([migration RedefineTables](../../apps/friendly/prisma/migrations/20260515083303_add_canonical_restaurant/migration.sql))

NOT NULL FK → `canonical_restaurants(id)`. **`ON DELETE RESTRICT`**. INDEX `(canonicalId)`. 신규 row 는 `canonical: { create: ... }` 로 1:1 동시 생성.

### (2026-09-12) `restaurant_store_matches` ([20260912101013](../../apps/friendly/prisma/migrations/20260912101013_add_life_store_and_restaurant_store_match/migration.sql) → FK 제거 [20260912102150](../../apps/friendly/prisma/migrations/20260912102150_drop_restaurant_store_match_store_fk/migration.sql), Prisma `RestaurantStoreMatch` [schema.prisma:1529-1550](../../apps/friendly/prisma/schema.prisma))

| 컬럼 | 타입 | 비고 |
| --- | --- | --- |
| `canonicalId` | TEXT PK | FK → `canonical_restaurants(id)` **ON DELETE CASCADE**. canonical 당 최대 1행 |
| `bizesId` | TEXT | 상가업소번호(`life_stores.id`). **FK 아님** — 첫 마이그레이션의 `ON DELETE NO ACTION` FK 를 두 번째에서 RedefineTables 로 제거(분기 재적재가 LifeStore 를 전량 삭제·재삽입하므로 NO ACTION 이면 삭제가 막히고 Cascade 면 매칭이 통째로 사라져 "사라짐" 감지가 무의미). INDEX `(bizesId)` |
| `storeName` / `branch` | TEXT / TEXT? | 매칭 시점 업소 상호·지점명 스냅샷(재적재 뒤에도 표시 가능) |
| `kind` | TEXT | `food` \| `cafe` |
| `sclsName` / `ksicName` | TEXT / TEXT? | 상권업종 소분류명(→ 응답 `industry`) / 표준산업분류명 |
| `distM` | INTEGER | haversine 반올림 m (≤ 80) |
| `nameScore` | REAL | 0~1, 소수 3자리 반올림 |
| `status` | TEXT | `matched` \| `missing`. INDEX |
| `matchedAt` | DATETIME | 처음 붙거나 다른 업소로 옮긴 시각(kept/recovered 는 유지) |
| `lastSeenAt` | DATETIME | 후보에 있었던 최근 실행 시각(created/rematched/kept/recovered 모두 갱신) |
| `missingSince` | DATETIME? | `newlyMissing` 때 1회 기록, `stillMissing` 은 유지, 복귀 시 null |

### (2026-09-13) `restaurant_tour_matches` ([20260913064102](../../apps/friendly/prisma/migrations/20260913064102_add_tour_match_biz/migration.sql), Prisma `RestaurantTourMatch` [schema.prisma:2756-2771](../../apps/friendly/prisma/schema.prisma))

| 컬럼 | 타입 | 비고 |
| --- | --- | --- |
| `canonicalId` | TEXT PK | FK → `canonical_restaurants(id)` **ON DELETE CASCADE** |
| `tourPlaceId` | TEXT **UNIQUE** | `tour_places.id`(세트 접두 `west:`·`east:`·`capital:` 포함). FK 아님(Tour* 전체가 FK 없음). 장소 1:1 |
| `placeName` / `typeShort` | TEXT | 장소 이름·유형(식당/상업/상점) 스냅샷 |
| `distM` | INTEGER | ≤ 100, 완전일치면 ≤ 300 |
| `nameScore` | REAL | 0~1 소수 3자리 |
| `status` | TEXT | `matched` \| `missing`. INDEX. **`missingSince` 열 없음** |
| `matchedAt` / `lastSeenAt` | DATETIME | 의미는 상가와 동일 |

같은 마이그레이션의 `tour_place_biz_statuses`(`placeId` PK, `brno`, `storeNm`, `bStt`, `bSttCd`, `endDt`, `taxType`, `checkedAt`; INDEX `bStt`·`brno`) 는 [tour](tour.md) 소유 — 어드민 상세의 `tour.bizStatus` 가 `placeId` 로 join 한다.

### 운영 관측(2026-09-13, [PLAN-tour-log.md](../../docs/PLAN-tour-log.md))

dev.db: 제주 등록 맛집 0곳이라 여행로그 매칭 0/25, 고아 canonical 7,969건(여행로그 매칭 대상에서 제외, 상가 매칭은 훑음). 수도권(9차, `6cae6b2`) 합류 뒤엔 운영 맛집(서울 1,810곳)과 실제로 맞기 시작 — 공개 장소 통계는 여행자 5명 하한에 대부분 억제되므로 수도권 매칭의 가치는 관리자 근거 쪽. 상가 매칭 결과 건수는 `status:life-map` 에 없어 스크립트 리포트로만 확인.

## Key Decisions [coverage: high — 18 sources]

- **2026-09-13: (j) 여행로그 매칭은 상가 골격 재사용 + 세 가지 의도된 차이** — 새 유사도를 만들지 않고 `storeNameScore` 를 import 하고 리포트 7분류·이전 매칭 우선·dry-run·커서 배치를 그대로 복제했다([restaurant-tour-match.service.ts](../../apps/friendly/src/modules/tour/restaurant-tour-match.service.ts) 머리 주석 "restaurant-store-match 와 같은 골격"). 다른 점만 근거가 있다: **장소 1:1**(`tourPlaceId` unique — 여행로그 장소는 이미 300m·이름으로 병합된 단위라 두 맛집이 같은 장소를 가지면 집계가 이중 계상됨; `claimed` 맵으로 코드에서도 unique 를 지켜 순서 의존을 피함), **완전일치 300m**(여행자 입력 좌표가 거칠고 tour-c 병합 반경이 300m), **식당 행 있는 canonical 만**(고아 canonical 7,969건 제외 — 상태 API 의 candidates 정의와 일치).
- **2026-09-13: (k) `missing` 의 공개 노출이 두 테이블에서 다르다** — 상가는 missing 이어도 공개 상세에 실려 "폐업 의심" 배지가 뜬다(사용자에게 유용한 경고, 목록엔 유지). 여행로그는 missing 이면 공개 상세·목록·골라줘에서 **없는 것**으로 취급(`getRestaurantTourSummary`·`getPublicListTourMap` 이 `status: 'matched'` 필터) — missing 은 "재적재로 장소 키가 바뀜" 이지 가게 상태가 아니라서. 어드민 상세(`getRestaurantTourMatchInfo`)만 status 를 그대로 보여 준다(`TourMatchBadge` title "매칭 보류").
- **2026-09-13: (l) 골라줘 balanced 를 "있는 점수의 평균" 으로 일반화 + `traveler` 전략** — 이전 balanced 는 리뷰 감성·만족도 둘의 조합이었다. 여행자 보정 만족도(`travelerWeight`, 1~5 → 0~1)를 세 번째 항으로 넣되 null 인 항은 빼고 평균 — 리뷰 분석이 없는 매칭 가게도 후보에 든다. 공개 목록 정렬은 매칭 없는 행을 `nullsLast` 로 뒤에([restaurant.service.ts:2782-2794](../../apps/friendly/src/modules/restaurant/restaurant.service.ts)). 계약은 `RestaurantSmartPickStrategy` enum 하나로 뽑아 공개·어드민 입력·결과가 공유([api-contract restaurant.ts](../../packages/api-contract/src/schemas/restaurant.ts)).
- **2026-09-12: (m) 공공데이터 출처는 Restaurant 멤버가 아니라 canonical 당 1행 사이드 테이블** — `LifeStore`·`TourPlace` 행은 크롤 스냅샷도 크롤 잡도 없고 분기/데이터셋 단위로 전량 교체된다. `Restaurant(source='store')` 로 넣으면 `(source, sourceId)` unique·`canonicalId RESTRICT`·표시 융합(`restaurant.merge.ts`)·멤버 조회(`canonical-members.ts`)·자동 승격 후크 전부를 손대야 한다. 대신 `canonicalId` 를 PK 로 하는 테이블에 **대상 스냅샷 + 거리·점수 + 상태**를 두고 FK 는 canonical 쪽만 Cascade. 그래서 canonical 모듈 코드는 한 줄도 안 바뀌었고, 결합은 restaurant 서비스가 canonicalId 로 조회하는 것뿐.
- **2026-09-12: (n) 좌표가 주, 이름은 보조 — 80m 안에서만 이름 사다리** — 상가 상호는 사업자 등록명이라 간판과 자주 다르므로 넓은 반경에서 이름을 비교하면 오탐이 는다. bbox(≈110m) → haversine 80m 컷 → `storeNameScore` 사다리(완전일치 1 / 포함 0.85 / 바이그램 Dice) ≥ 0.5. 정규화는 canonical 후보 매칭의 `normalizeName` 이 아니라 상가 전용 `normalizeLifeStoreName`(법인 표기·괄호·`N호점`·`○○점` 제거)을 쓴다 — 두 정규화가 병존하는 이유는 대상 문자열의 잡음이 다르기 때문(Gotchas).
- **2026-09-12: (o) 재실행 안정성 — 이전 대상이 후보에 남아 있으면 더 좋은 후보가 생겨도 옮기지 않는다** — `best = prev 의 대상 ∈ candidates ? prev : candidates[0]`. 재적재마다 매칭이 흔들려 배지·집계가 뒤바뀌는 것을 막는다. 옮기는 경우는 이전 대상이 후보에서 사라졌을 때뿐(`rematched`, `matchedAt` 갱신). 테스트가 "≈5m 짜리 새 업소가 생겨도 22m 짜리 기존 매칭 유지" 를 고정([restaurant-store-match.test.ts](../../apps/friendly/src/modules/restaurant/restaurant-store-match.test.ts)).
- **2026-09-12: (p) `bizesId` 의 LifeStore FK 제거** — 첫 마이그레이션 `20260912101013` 은 FK 를 걸었으나 `load:life-stores` 가 전량 삭제·재삽입이라 `NO ACTION` 이면 적재가 막히고, Cascade 로 바꾸면 매칭 행이 통째로 사라져 "사라짐 = 폐업 의심" 감지 자체가 불가능해진다. 같은 날 `20260912102150` 에서 RedefineTables 로 FK 만 제거하고 인덱스는 유지([schema.prisma:1520-1528](../../apps/friendly/prisma/schema.prisma) 주석). Tour* 는 처음부터 FK 없음.
- **2026-09-12: (q) 폐업 의심은 플래그만 — 목록·지도에서 숨기지 않는다** — 매칭 실패(업소가 다른 이름으로 재등록, 좌표 이동)와 진짜 폐업을 구분할 수 없으므로 `status='missing'` + `missingSince` 만 기록하고 공개 상세엔 근거(기준 분기·사라진 날짜)를 붙인 경고 배지로만 낸다. 최종 판단은 어드민.

- **(h) 테이블링 합류는 "묶기 점수"가 아니라 두 갈래 — 표시 융합 + 저장 시점 자동 승격 (2026-06)** — 테이블링을 4번째 source 로 들이되 `matching.ts`/`canonical.service`/`proposal.service` 의 후보 점수 매칭은 손대지 않았다. 대신 (1) 표시 융합(`restaurant.merge.ts`)에 테이블링 partner 형제를 합류시켜 "전 필드 Naver 1순위" 정책을 3소스로 일반화, (2) `place`↔`partner` 처럼 같은 source 라 후보 룰이 못 잡는 쌍만 저장 시점 자동 승격(`tryLinkTablingPlacePartner`)으로 메운다. cross-source(Naver↔테이블링 등) 묶기는 여전히 검토 큐/자동매칭의 일반 경로가 처리. 점수 로직을 안 건드린 이유 — 테이블링은 좌표/이름 신뢰도가 높아 기존 임계가 그대로 통한다.
- **(i) place↔partner 사각지대를 저장 시점 승격으로 — 같은 source 라 후보 룰이 못 잡음** — `place`(미입점 JSON-LD, 얕음)·`partner`(입점, 풍부) 행은 둘 다 `source='tabling'` 이라 "다른 source 만 후보" 룰·"새 source 만 제안" 큐가 양쪽 다 건너뛰어 영구히 별도 canonical 로 남는다. `saveTablingShop`/`saveTablingPlace` 양방향에서 좌표+이름으로 반대 역할을 찾아 **partner 쪽으로 머지(승격)** 하고, auto-match(Naver/DC)로 canonical 이 바뀐 뒤의 최종 canonical 을 기준으로 잡는다. 임계는 DC 자동매칭 상수(이름 0.85/거리 50m/tie 0.1)를 재사용. 스키마/UI 무변경 — 기존 `tryAutoMatch*` 자동머지 아키텍처에 편입. 라이브 프로브 `probe:tabling-promote` 로 실 배선 검증.

- **(a) 자동 매칭 정책: C안 — "수동 확정만" 에서 "보수적 임계 통과 시 자동 머지, 미통과 시 검토 큐 fallback" 으로 진화 (2026-05-17)** — 기존에는 동명이인/주변 가게 false positive 우려로 임계 통과 쌍도 모두 검토 큐에만 넣었다. 운영 경험상 Naver→DC 페어 중 (이름 0.85 / 거리 50m / top1-top2 격차 0.1) 을 동시에 만족하는 케이스는 사실상 동일 가게로 판명되어, Naver 크롤 done 직후 한정으로 자동 머지를 허용. 통과 못 한 쌍은 그대로 ProposalService 큐로 들어가 어드민이 accept/reject. 임계 상수 (`AUTO_DC_NAME_THRESHOLD = 0.85`, `AUTO_DC_DISTANCE_THRESHOLD_M = 50`, `AUTO_DC_TIE_GAP = 0.1`) 는 [crawl.service.ts:86-88](../../apps/friendly/src/modules/crawl/crawl.service.ts) 에 모듈 상수로 노출 — 운영 중 false positive 가 보고되면 여기만 손대면 됨. **자동 머지는 Naver→DC 한 방향만** (현재 자동 발견 흐름이 Naver 기준이라). 캐치테이블 등 다른 source 는 여전히 검토 큐 경로.
- **(b) cross-source 만 후보** — 같은 source 끼리는 `(source, sourceId)` UNIQUE 라 절대 같은 가게가 두 행으로 들어올 수 없다. 그래서 후보 룰에 "target 의 source 집합과 겹치지 않는 source 가 후보 측에 있어야" 한 조건 추가 ([canonical.service.ts:120-122](../../apps/friendly/src/modules/canonical/canonical.service.ts), [proposal.service.ts:62-64](../../apps/friendly/src/modules/canonical/proposal.service.ts)). 묶을 가치가 있는 건 오로지 cross-source.
- **(c) bigram Jaccard + Haversine, 좌표 유무로 다른 임계** — `nameScore = Jaccard(bigrams(normName))`, `distanceScore = max(0, 1 - d/200)`, `score = 0.6·name + 0.4·dist`. 좌표 둘 다 있으면 `score ≥ 0.45 && d ≤ 500m`, 좌표 한쪽이라도 없으면 `nameScore ≥ 0.7` 단독 ([matching.ts:90-102](../../apps/friendly/src/lib/matching.ts)). 좌표 무 케이스 임계가 더 엄격한 건 false-positive 위험이 크기 때문.
- **(d) bbox prefilter ±0.007°** — 위도 1°≈111km, 500m × 1.5 마진. `findMany` WHERE 절에 직접 박스 조건을 걸어 SQL 단계에서 Haversine 전수 호출을 막는다. take 200(candidates) / 500(generateForCanonical). `generateAll` 은 어드민 < 1k 행 가정으로 O(N²) 페어 루프 + 코드 측 bbox 컷.
- **(e) Restaurant FK 가 Cascade 가 아님 → deleteCanonical 이 트랜잭션 안에서 직접 정리** — `restaurants_canonicalId_fkey ON DELETE RESTRICT`. 그냥 `canonical.delete` 하면 FK 위반. `deleteCanonical` 은 `$transaction` 안에서 자식 `Restaurant.deleteMany({ where: { canonicalId } })` 먼저 호출 후 부모 delete ([canonical.service.ts:283-312](../../apps/friendly/src/modules/canonical/canonical.service.ts)). Restaurant→VisitorReview/MenuCanonical 은 자체 Cascade 로 따라온다.
- **(f) Proposal 페어 정규화 — 항상 작은 id 가 A, 큰 id 가 B** — `normalizePair(x, y) = x < y ? [x, y] : [y, x]` (cuid 사전순) ([proposal.service.ts:18-19](../../apps/friendly/src/modules/canonical/proposal.service.ts)). `@@unique([canonicalAId, canonicalBId])` 와 결합해 양방향 중복 큐잉 차단. accept 시 `keepSide: 'A' | 'B'` 로 어느 쪽을 살릴지 명시.
- **(g) suggestionDismissedAt — 어드민이 "닫기" 영구** — list 행 위 1차 알림 줄(`CanonicalListItem.suggestion`) 은 새 등록 직후 작은 신호 채널. 어드민이 "이 가게는 합칠 게 없어" 클릭하면 `suggestionDismissedAt = now()` 로 영구 닫힘. 풀 후보 패널(`getCandidates`)과는 분리 — 어드민이 명시적으로 "병합" 패널을 열면 후보가 다시 계산된다. list 응답의 `suggestion` 노출 조건은 `suggestionDismissedAt === null && candidateCount ≥ 1` ([restaurant.service.ts:604-617](../../apps/friendly/src/modules/restaurant/restaurant.service.ts), ~2026-06 기준 줄 번호).

## Gotchas [coverage: high — 16 sources]

- **(2026-09) merge / split / deleteCanonical 은 사이드 테이블을 모른다 — Cascade 로 조용히 사라지고 다음 전수 매칭까지 공백** — `canonical.merge` 는 Restaurant 를 옮긴 뒤 source canonical 을 `delete` 한다([canonical.service.ts:183-191](../../apps/friendly/src/modules/canonical/canonical.service.ts)). source 에 붙어 있던 `RestaurantStoreMatch`/`RestaurantTourMatch` 는 FK Cascade 로 같이 삭제되고 target 으로 **옮겨지지 않는다**(canonical.service 에 두 테이블 언급 0건). `split` 으로 생긴 새 canonical 도 매칭 행이 없다. 자동 DC 매칭(keep=Naver, source=방금 만든 DC canonical)이나 테이블링 승격에서는 source 쪽에 매칭이 있을 일이 거의 없어 실해는 적지만, 어드민이 `keepSide` 로 매칭 있는 쪽을 source 로 고르면 배지·여행자 정렬이 사라진다. 복구 경로는 전수 재실행뿐 — 상가는 `match:restaurant-stores`(deploy.sh 는 상가 zip 적재 때만 호출), 여행로그는 `POST /admin/tour/match/run` 또는 시드 "등록" 이 끝났을 때의 자동 재실행.
- **(2026-09) 두 매칭의 대상 정의가 비대칭 — 상가 매칭은 고아 canonical 도 훑는다** — 여행로그 매칭은 `restaurants: { some: {} }` 를 where 에 넣어 식당 행 없는 canonical 을 제외하지만([restaurant-tour-match.service.ts](../../apps/friendly/src/modules/tour/restaurant-tour-match.service.ts) `TOUR_MATCH_CANONICAL_WHERE`), 상가 매칭은 `latitude/longitude not null` 만 본다([restaurant-store-match.service.ts](../../apps/friendly/src/modules/restaurant/restaurant-store-match.service.ts)). dev.db 의 테스트 잔재 고아 7,969건이 그대로 `scanned` 에 들어가 매칭률 분모를 키우고 LifeStore 조회를 낭비한다(테스트도 Restaurant 행 없이 canonical 만으로 `scanned: 3` 을 고정). 운영 DB 에선 고아가 적어 실해 없음 — 매칭률 해석 시 주의.
- **(2026-09) `RestaurantTourMatch` 에는 `missingSince` 가 없다** — 상가는 "YYYY-MM-DD 부터 사라짐" 을 배지에 쓰지만 여행로그는 `status='missing'` 만 남고 언제부터인지 모른다(`lastSeenAt` 이 마지막으로 후보에 있던 실행 시각이라 대용 가능). `RestaurantTourMatchInfo` 계약에도 없음.
- **(2026-09) 이름 유사도·정규화가 세 갈래로 병존** — canonical 후보 매칭은 `lib/matching.ts` 의 `normalizeName`(`본점|지점|점` 1회) + bigram **Jaccard** + 거리 가중(0.6/0.4, 임계 0.45/0.7); 사이드 테이블 매칭은 utils `normalizeLifeStoreName`(법인 표기·괄호·`N호점`·`○○점`) + 완전일치/포함/bigram **Dice** 사다리(임계 0.5, 거리는 컷만); 음식 카탈로그는 별도 `normalizeTerm`. 같은 두 이름이 경로마다 다른 점수를 받으므로 "어드민 후보 패널엔 뜨는데 상가 매칭은 안 붙는" 식의 어긋남이 정상이다. 통합 후보이지만 대상 잡음이 달라 의도된 병존 — 임계를 옮길 때 서로 참고하지 말 것.
- **(2026-09) 어드민 `runMatch` 의 단일 실행 가드는 프로세스 메모리 변수** — `let matchInFlight` 모듈 스코프([tour-admin.service.ts:76](../../apps/friendly/src/modules/tour/tour-admin.service.ts)). 어드민 버튼 연타는 같은 Promise 를 공유하지만 **CLI `match:restaurant-tour` 와 어드민 run 이 동시에 돌면 막지 못한다**(같은 canonical 을 두 트랜잭션 없는 루프가 update — 마지막 쓰기가 이김, `tourPlaceId` unique 충돌 가능). 상가 매칭은 가드 자체가 없다(CLI 전용). deploy 중 어드민 run 을 누르지 말 것.
- **(2026-09) 상가 매칭 건수는 `status:life-map` 에 안 나온다** — 출력의 `store=N` 은 `LifeMasterSync layer='store'` 의 적재 건수, `tour_matched=X` 만 매칭 건수([life-map-status.ts:23-29](../../apps/friendly/scripts/life-map-status.ts)). 상가 매칭 상태는 `match:restaurant-stores --dry-run` 리포트나 DB 직접 조회로만. 어드민 화면도 없음(여행로그는 `/admin/tour` 상태 카드).
- **(2026-09) `deploy.sh` 는 매칭 실패를 삼킨다** — `pnpm … match:restaurant-stores || echo "(매칭 실패 — 수동 재실행)"`([deploy.sh:152, 169](../../deploy.sh)). 적재는 됐는데 매칭만 실패하면 배지가 이전 상태로 남고 배포는 성공으로 끝난다 — 배포 로그에서 그 문구를 찾아야 한다.
- **(2026-09) 문서 어긋남 — [PLAN-tour-log.md](../../docs/PLAN-tour-log.md) 계약 초안 표(153·155행) vs 코드** — 초안은 `sort=tour_travelers | tour_score`·`sampleYear` 라고 적었지만 구현은 `tourTravelers | tourScore`(camelCase, [api-contract restaurant.ts](../../packages/api-contract/src/schemas/restaurant.ts))·`sampleLabel`+`sourceNote`. 같은 문서 216행(4차 완료 행)은 맞게 적혀 있어 초안 표만 낡았다. 또 api-contract `RestaurantTourMatchInfo`·`RestaurantPublicListItem.tour`·`TourMatchBadge` 주석이 "AI 허브 71780"(제주 단일 세트)이라고만 말하지만 7~9차(`d18ac24`·`93ae031`·`6cae6b2`) 이후 4세트가 한 테이블에 있고 매칭도 세트를 가리지 않는다(`tourPlaceId` 접두로만 구분).
- **(2026-09) 상세 응답이 매칭 때문에 쿼리 2~4개를 더 한다** — `getPublicDetail` 은 `restaurantStoreMatch.findUnique` + `lifeMasterSync.findFirst` + `restaurantTourMatch.findUnique` + `tourPlace.findUnique` 를 순차 await([restaurant.service.ts:1639-1640](../../apps/friendly/src/modules/restaurant/restaurant.service.ts)); 어드민 상세는 `tourPlaceBizStatus` 까지. 전부 PK 조회라 가볍지만 `getStoreBaseDate` 는 canonical 마다 같은 값을 다시 읽는다(캐시 없음).
- **자동 머지 임계가 모듈 상수 — 운영 중 조정 필요 시 코드 배포 필요** — `AUTO_DC_NAME_THRESHOLD / AUTO_DC_DISTANCE_THRESHOLD_M / AUTO_DC_TIE_GAP` 은 [crawl.service.ts:86-88](../../apps/friendly/src/modules/crawl/crawl.service.ts) 에 const 로 박혀 있다. env / DB 설정으로 빼지 않은 의도된 트레이드오프 — 임계 변경은 false-positive 직결이라 코드 리뷰 + 배포를 거치는 편이 안전. false-positive 가 누적 보고되면 (a) 임계 상향, (b) 거리/이름 가중치 재조정 둘 중 하나로 대응. **사이드 테이블 임계(`STORE_MATCH_MAX_DIST_M=80`·`STORE_MATCH_MIN_SCORE=0.5`·`TOUR_MATCH_MAX_DIST_M=100`·`TOUR_MATCH_EXACT_MAX_DIST_M=300`·`TOUR_MATCH_MIN_SCORE=0.5`)도 같은 방식의 export 상수.**
- **자동 머지 vs 검토 큐는 배타적 (이중 트리거 케이스 없음)** — 자동 머지가 성공하면 DC canonical 이 Naver canonical 로 흡수되므로 같은 페어가 큐에 들어갈 두 canonical 자체가 존재하지 않게 된다. 반대로 임계 미통과면 `tryAutoMatchDiningcode` 가 silent skip 하고 `generateProposalsForRestaurant` 가 이미 채운 큐만 남는다. 따라서 "자동으로 머지됐는데 큐에도 또 떴다" 시나리오는 발생하지 않음.
- **자동 매칭은 fire-and-forget — Naver done 이벤트와 race** — `tryAutoMatchDiningcode` 는 `void` 로 호출되어 백그라운드에서 실행되므로 done 이벤트는 자동 머지 완료를 기다리지 않는다. UI 가 Naver done 직후 detail 을 fetch 하면 DC 형제가 아직 안 붙은 상태일 수 있음. 어드민 UI 는 list 의 sources 변화로 결국 반영됨 (수 초 후). **(2026-09)** 시드 콘솔의 `register → matchAfterJob` 도 같은 패턴 — 잡 done 뒤 `void this.runMatch()` 라 등록 직후 시드 표에서 바로 빠지지 않을 수 있다.
- **DC source 중복 진입 가드** — `tryAutoMatchDiningcode` 는 진입 시 `core.sources.includes('diningcode')` 면 즉시 return. 이미 묶인 canonical 에 또 다른 DC 행을 자동으로 붙이지 않는다. 동명 다지점 중 한쪽이 이미 DC 와 매칭됐을 때 다른 쪽이 같은 DC 를 끌어가는 오염을 막는 의도.

- **FK Cascade 누락 트랩** — `Restaurant.canonicalId` 가 `Restrict` 라는 사실을 모르면 `canonical.delete` 직호출이 즉시 FK 에러. 항상 `deleteCanonical` 진입점을 거쳐야 자식 정리가 같이 일어난다. 반대로 `CanonicalMergeProposal` 의 두 FK 는 Cascade 라 merge 시 source canonical 이 사라지면 그 source 가 끼인 다른 open proposal 들이 자동으로 같이 사라진다 — accept 핸들러가 proposal status 갱신을 skip 하는 이유 ([proposal.service.ts:244-247](../../apps/friendly/src/modules/canonical/proposal.service.ts)). **(2026-09)** 두 매칭 테이블도 Cascade 쪽 — 위 첫 항목.
- **한국어 자모 normalize 는 비교 단계에서만** — `normalizeName` 은 표시용이 아니라 매칭 키 전용. 소문자/공백/구두점 제거 + `본점|지점|점` suffix 1회만 떼고 이모지/괄호 보조설명은 그대로 둔다 — 변별력 보존. UI 에 그대로 출력하면 안 됨 ([matching.ts:11-15](../../apps/friendly/src/lib/matching.ts)). `normalizeLifeStoreName` 도 마찬가지 — 배지엔 원본 `storeName`+`lifeStoreDisplayName` 을 쓴다.
- **Restaurant 단위 삭제 vs Canonical 단위 삭제 둘 다 라우트 유지** — 어드민은 사용 맥락에 따라 둘 다 필요. Restaurant 한 행만 떼면 `split` (잔여가 ≥1 일 때) 또는 그냥 `Restaurant.delete` (다른 모듈, list 우측 작업); canonical 전체를 정리하고 싶으면 `DELETE /admin/canonical/:id`. 두 라우트가 의미가 다르므로 통합 금지 — `delete` 라우트 주석에도 명시 ([routes.ts:147-149](../../packages/api-contract/src/routes.ts)).
- **순수 DB 모듈, registry 의존성 없음** — crawl 의 JobRegistry, summary 의 큐 등과 달리 canonical 모듈은 메모리 상태가 0이다. 모든 진실은 두 테이블에 있고 후크 실패도 등록 흐름을 막지 않는다 ([crawl.service.ts:104-114](../../apps/friendly/src/modules/crawl/crawl.service.ts)). 데이터 복구는 항상 `proposals/run` 으로 전수 재계산하면 일관된 상태가 된다. **(2026-09)** 사이드 테이블도 같은 성질 — `match:*` 전수 재실행이 곧 복구(단, `matchedAt`·`missingSince` 이력은 재실행으로 복원되지 않음).
- **좌표 추출 source 별 키 차이** — `split` 에서 snapshot json 을 읽을 때 Naver 는 `latitude/longitude`, 다이닝코드는 `lat/lng`. 둘 다 시도해 `??` 로 첫 truthy 선택 ([canonical.service.ts:230-241](../../apps/friendly/src/modules/canonical/canonical.service.ts)). 마이그레이션의 백필 COALESCE 와 같은 패턴.

## Sources [coverage: high — 64 sources]

- [apps/friendly/prisma/schema.prisma](../../apps/friendly/prisma/schema.prisma) — `CanonicalRestaurant`(+ `storeMatch`/`tourMatch` 관계), `CanonicalMergeProposal`, `Restaurant.canonicalId`, `RestaurantStoreMatch`, `RestaurantTourMatch`, `TourPlaceBizStatus`
- [apps/friendly/prisma/migrations/20260515083303_add_canonical_restaurant/migration.sql](../../apps/friendly/prisma/migrations/20260515083303_add_canonical_restaurant/migration.sql)
- [apps/friendly/prisma/migrations/20260515100910_add_canonical_suggestion_dismissed/migration.sql](../../apps/friendly/prisma/migrations/20260515100910_add_canonical_suggestion_dismissed/migration.sql)
- [apps/friendly/prisma/migrations/20260515104718_add_canonical_merge_proposals/migration.sql](../../apps/friendly/prisma/migrations/20260515104718_add_canonical_merge_proposals/migration.sql)
- [apps/friendly/prisma/migrations/20260912101013_add_life_store_and_restaurant_store_match/migration.sql](../../apps/friendly/prisma/migrations/20260912101013_add_life_store_and_restaurant_store_match/migration.sql) — *new: `life_stores` + `restaurant_store_matches`(LifeStore FK 포함 초판)*
- [apps/friendly/prisma/migrations/20260912102150_drop_restaurant_store_match_store_fk/migration.sql](../../apps/friendly/prisma/migrations/20260912102150_drop_restaurant_store_match_store_fk/migration.sql) — *new: `bizesId` FK 제거(RedefineTables)*
- [apps/friendly/prisma/migrations/20260913064102_add_tour_match_biz/migration.sql](../../apps/friendly/prisma/migrations/20260913064102_add_tour_match_biz/migration.sql) — *new: `restaurant_tour_matches`(tourPlaceId unique) + `tour_place_biz_statuses`*
- [apps/friendly/src/modules/canonical/canonical.service.ts](../../apps/friendly/src/modules/canonical/canonical.service.ts)
- [apps/friendly/src/modules/canonical/canonical.route.ts](../../apps/friendly/src/modules/canonical/canonical.route.ts)
- [apps/friendly/src/modules/canonical/canonical.test.ts](../../apps/friendly/src/modules/canonical/canonical.test.ts)
- [apps/friendly/src/modules/canonical/proposal.service.ts](../../apps/friendly/src/modules/canonical/proposal.service.ts)
- [apps/friendly/src/lib/matching.ts](../../apps/friendly/src/lib/matching.ts)
- [apps/friendly/src/lib/matching.test.ts](../../apps/friendly/src/lib/matching.test.ts)
- [apps/friendly/src/modules/crawl/crawl.service.ts](../../apps/friendly/src/modules/crawl/crawl.service.ts) — `generateProposalsForRestaurant`, `tryAutoMatchDiningcode`, `tryAutoMatchTabling`, `tryLinkTablingPlacePartner` 후크 + `AUTO_DC_*` 임계 상수
- [apps/friendly/src/modules/restaurant/restaurant.service.ts](../../apps/friendly/src/modules/restaurant/restaurant.service.ts) — `canonical: { create }`, `getCanonicalIdForRestaurant`, `getCanonicalCoreForAutoMatch`, `findTablingCanonicalsNear`, `list` 안 suggestion/candidateCount 집계, detail 머지 호출부, **(2026-09) `getPublicDetail/getPublicList/smartPick/getDetailByPlaceId` 의 store·tour 결합, `pickPublicSort` tour 정렬**
- [apps/friendly/src/modules/restaurant/restaurant.merge.ts](../../apps/friendly/src/modules/restaurant/restaurant.merge.ts) — canonical 1:N 그룹 detail 융합 헬퍼 (Naver+DC+테이블링 3소스, 372줄, `composeTablingAddon` 포함)
- [apps/friendly/src/modules/restaurant/restaurant.merge.test.ts](../../apps/friendly/src/modules/restaurant/restaurant.merge.test.ts)
- [apps/friendly/src/modules/restaurant/canonical-members.ts](../../apps/friendly/src/modules/restaurant/canonical-members.ts) — canonical 멤버 조회 헬퍼(naver+DC+tabling partner) — review-search/clustering 코퍼스 진입점
- [apps/friendly/src/modules/restaurant/restaurant-store-match.service.ts](../../apps/friendly/src/modules/restaurant/restaurant-store-match.service.ts) — *new: 상가업소 매칭(80m·0.5, `bigramDice`·`storeNameScore`, 리포트 7분류, `getRestaurantStoreInfo`·`getStoreBaseDate`)*
- [apps/friendly/src/modules/restaurant/restaurant-store-match.test.ts](../../apps/friendly/src/modules/restaurant/restaurant-store-match.test.ts) — *new: 점수 3건 + 격리 DB 생성→유지→옮김→missing→복귀·dry-run*
- [apps/friendly/src/modules/tour/restaurant-tour-match.service.ts](../../apps/friendly/src/modules/tour/restaurant-tour-match.service.ts) — *new: 여행로그 장소 매칭(100m·0.5 / 완전일치 300m, 장소 1:1 `claimed`, `TOUR_MATCH_CANONICAL_WHERE`, `getRestaurantTourMatchInfo`)*
- [apps/friendly/src/modules/tour/restaurant-tour-match.service.test.ts](../../apps/friendly/src/modules/tour/restaurant-tour-match.service.test.ts) — *new: 수락 규칙·별칭·1:1·고아 제외·missing/recovered*
- [apps/friendly/src/modules/tour/tour-public.service.ts](../../apps/friendly/src/modules/tour/tour-public.service.ts) — *new: `travelerWeight`, `getRestaurantTourSummary`(matched 만), `getPublicListTourMap`, `registeredNaverIds`*
- [apps/friendly/src/modules/tour/tour-admin.service.ts](../../apps/friendly/src/modules/tour/tour-admin.service.ts) — *new: `status().match`, `runMatch`(matchInFlight), `register → matchAfterJob`, 시드 LEFT JOIN*
- [apps/friendly/src/modules/tour/tour-admin.route.ts](../../apps/friendly/src/modules/tour/tour-admin.route.ts) — *new: `POST /admin/tour/match/run`*
- [apps/friendly/src/modules/tour/tour-public.test.ts](../../apps/friendly/src/modules/tour/tour-public.test.ts) — *new: `restaurantTourMatch` 픽스처로 공개 상세·목록 tour 필드 검증*
- [apps/friendly/scripts/match-restaurant-stores.ts](../../apps/friendly/scripts/match-restaurant-stores.ts) — *new: `match:restaurant-stores [--dry-run]`*
- [apps/friendly/scripts/match-restaurant-tour.ts](../../apps/friendly/scripts/match-restaurant-tour.ts) — *new: `match:restaurant-tour [--dry-run]`*
- [apps/friendly/scripts/life-map-status.ts](../../apps/friendly/scripts/life-map-status.ts) — *new: `tour_matched=` 출력(상가 매칭 건수 없음)*
- [apps/friendly/scripts/unload-tour.ts](../../apps/friendly/scripts/unload-tour.ts) — *new: 환수 시 `RestaurantTourMatch`·`TourPlaceBizStatus` 삭제*
- [apps/friendly/package.json](../../apps/friendly/package.json) — *new: `match:restaurant-stores`·`match:restaurant-tour` 스크립트*
- [deploy.sh](../../deploy.sh) — *new: `life_map_data` 의 상가 적재→매칭, 여행로그 세트 루프→매칭(실패 echo)*
- [apps/friendly/src/modules/crawl/tabling.service.test.ts](../../apps/friendly/src/modules/crawl/tabling.service.test.ts) — 테이블링 place↔partner 자동 승격 머지 4건
- [packages/utils/src/lifeStore.ts](../../packages/utils/src/lifeStore.ts) — *new: `LIFE_STORE_RESTAURANT_KINDS`, `lifeStoreDisplayName`, `normalizeLifeStoreName`*
- [packages/utils/src/tourLog.ts](../../packages/utils/src/tourLog.ts) — *new: `TOUR_RESTAURANT_TYPE_SHORTS`, `TOUR_SAMPLE_LABEL`*
- [packages/utils/src/geo.ts](../../packages/utils/src/geo.ts) — *new: `haversineM`*
- [packages/api-contract/src/schemas/canonical.ts](../../packages/api-contract/src/schemas/canonical.ts)
- [packages/api-contract/src/schemas/restaurant.ts](../../packages/api-contract/src/schemas/restaurant.ts) — `CanonicalListItem`, `candidateCount`, `suggestion`, **(2026-09) `RestaurantStoreInfo`, `RestaurantTourMatchInfo`, `RestaurantDetail/PublicDetail.store·tour`, `RestaurantPublicListItem.tour`, `sort` enum, `RestaurantSmartPickStrategy`, `avgTravelerScore`**
- [packages/api-contract/src/schemas/tour.ts](../../packages/api-contract/src/schemas/tour.ts) — *new: `RestaurantTourSummary`, `RestaurantPublicListTour`(식별자 없는 공개 요약)*
- [packages/api-contract/src/routes.ts](../../packages/api-contract/src/routes.ts) — `Routes.Canonical`, `Routes.Restaurant.publicList/publicSmartPick/byPlaceId/smartPick`, `Routes.Tour.adminMatchRun/adminStatus/publicRestaurantStats`
- [packages/shared/src/api/canonical.api.ts](../../packages/shared/src/api/canonical.api.ts)
- [packages/shared/src/api/restaurant.api.ts](../../packages/shared/src/api/restaurant.api.ts) — *new: `publicTourStats`*
- [packages/shared/src/hooks/useCanonical.ts](../../packages/shared/src/hooks/useCanonical.ts)
- [packages/shared/src/hooks/useRestaurant.ts](../../packages/shared/src/hooks/useRestaurant.ts) — *new: `useRestaurantPublicTourStats`*
- [apps/web/src/components/restaurant/CanonicalMergePanel.tsx](../../apps/web/src/components/restaurant/CanonicalMergePanel.tsx)
- [apps/web/src/components/restaurant/MergeProposalQueue.tsx](../../apps/web/src/components/restaurant/MergeProposalQueue.tsx)
- [apps/web/src/routes/admin/AdminRestaurantsPage.tsx](../../apps/web/src/routes/admin/AdminRestaurantsPage.tsx)
- [apps/web/src/components/restaurant/detail/StoreInfoBadges.tsx](../../apps/web/src/components/restaurant/detail/StoreInfoBadges.tsx) — *new: 업종 배지 + 폐업 의심 배지(공개·어드민 공용)*
- [apps/web/src/components/restaurant/detail/StoreInfoBadges.test.tsx](../../apps/web/src/components/restaurant/detail/StoreInfoBadges.test.tsx) — *new: 3건*
- [apps/web/src/components/restaurant/detail/TourMatchBadge.tsx](../../apps/web/src/components/restaurant/detail/TourMatchBadge.tsx) — *new: 어드민 여행자 배지 + 국세청 폐업/휴업 배지*
- [apps/web/src/components/restaurant/detail/TourSummaryBadge.tsx](../../apps/web/src/components/restaurant/detail/TourSummaryBadge.tsx) — *new: 공개 여행자 배지 + `TourSummaryLine`*
- [apps/web/src/components/restaurant/detail/TourTab.tsx](../../apps/web/src/components/restaurant/detail/TourTab.tsx) — *new: "여행자" 탭(열릴 때만 조회)*
- [apps/web/src/components/restaurant/detail/HomeTab.tsx](../../apps/web/src/components/restaurant/detail/HomeTab.tsx) — *헤더 배지 2종 + "여행자 방문 통계" 섹션*
- [apps/web/src/components/restaurant/detail/PublicRestaurantDetail.tsx](../../apps/web/src/components/restaurant/detail/PublicRestaurantDetail.tsx) — *`tour` 탭을 `detail.tour !== null` 일 때만*
- [apps/web/src/components/restaurant/detail/tabs.ts](../../apps/web/src/components/restaurant/detail/tabs.ts) — *`TabKey 'tour'`, `TAB_ORDER`*
- [apps/web/src/routes/admin/AdminRestaurantDetailPage.tsx](../../apps/web/src/routes/admin/AdminRestaurantDetailPage.tsx) — *헤더 `StoreInfoBadges`+`TourMatchBadge`, `TourEvidenceSection` 카드*
- [apps/web/src/components/admin/tour/TourEvidencePanel.tsx](../../apps/web/src/components/admin/tour/TourEvidencePanel.tsx) — *`TourEvidenceSection`(어드민 상세 "여행자 근거")*
- [apps/web/src/components/restaurant/PublicRestaurantCard.tsx](../../apps/web/src/components/restaurant/PublicRestaurantCard.tsx) — *카드 "🧭 여행자 N명" 메타*
- [apps/web/src/components/restaurant/PublicRestaurantList.tsx](../../apps/web/src/components/restaurant/PublicRestaurantList.tsx) — *정렬 칩 `tourTravelers`·`tourScore`*
- [apps/web/src/components/restaurant/SmartPickSection.tsx](../../apps/web/src/components/restaurant/SmartPickSection.tsx) — *`travelerMode` → `strategy: 'traveler'`*
- [apps/web/src/routes/RestaurantsV2Page.tsx](../../apps/web/src/routes/RestaurantsV2Page.tsx) — *공유 진입 핀의 tour 조립*
- [docs/PLAN-tour-log.md](../../docs/PLAN-tour-log.md) — 2차 매칭 규칙·`RestaurantTourMatch` 표·운영 관측(고아 7,969·매칭 0/25)·계약 초안 표(낡은 `tour_travelers`·`sampleYear`)
- [docs/data-sources.md](../../docs/data-sources.md) — 상가 zip → `load:life-stores` → `match:restaurant-stores`, tour export → `load:tour` → `match:restaurant-tour`
- [docs/deploy-friendly.md](../../docs/deploy-friendly.md) — "세트 다 적재한 뒤 `match:restaurant-tour` 한 번, 먼저 `--dry-run`"
