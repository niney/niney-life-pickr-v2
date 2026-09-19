---
concept: canonical 축 외부 출처 사이드 테이블 매칭 — 합치지 않고 옆에 붙인다(거리+상호 점수, 1:1, 상태 전이)
last_compiled: 2026-09-19
topics_connected: [canonical, life-map, tour, friendly, api-contract, shared, web]
status: active
---

# canonical 축 외부 출처 사이드 테이블 매칭 — 합치지 않고 옆에 붙인다(거리+상호 점수, 1:1, 상태 전이)

## Pattern

맛집 도메인에는 "같은 가게"를 다루는 두 가지 방식이 공존한다. 크롤 소스(Naver/캐치테이블/다이닝코드)는 [canonical](../topics/canonical.md)의 **멤버**로 합쳐져 하나의 가게가 되지만, 2026-09 에 들어온 공공·연구 데이터 두 종 — 상가(상권)정보의 업소(`LifeStore`, `bc39a79`)와 여행로그 장소(`TourPlace`, `c777380`) — 는 **합치지 않고 canonical 옆에 1:1 사이드 테이블로 붙인다**(`RestaurantStoreMatch`·`RestaurantTourMatch`, canonicalId 당 1행, 외부 id unique). 두 구현은 서로를 모델로 삼아 같은 골격을 가진다.

1. **좌표가 주(主), 이름은 종(從)** — 후보는 bbox 로 먼저 자르고 haversine 반경 안(상가 **80m**, 여행로그 **100m**, 여행로그는 상호 완전일치면 300m 까지)에서만 상호를 비교한다. 이름만으로 잇지 않는 이유가 두 데이터에서 같다: 상가 상호는 사업자 등록명("(주)○○푸드")이고 여행로그 장소명은 여행자가 적은 이름이라 간판(크롤 이름)과 자주 다르다. 점수는 완전일치(1) → 포함(0.85) → 음절 바이그램 Dice 사다리(≥ **0.5**)이며 순수 함수로 export 해 단위 테스트한다(`storeNameScore`·`bigramDice`, `tourPlaceNameScore`). 후보가 여럿이면 **이전 매칭을 우선**해 재실행마다 배지가 흔들리지 않게 한다. 두 구현의 비대칭 하나: 여행로그는 식당 행이 있는 canonical 만 훑고(`restaurants: { some: {} }`) 상가는 고아 canonical(dev 7,969건)도 훑는다 — 사이드 테이블은 canonical 모듈의 merge/split/delete 를 모르므로 source canonical 이 지워지면 FK cascade 로 매칭 행이 사라지고 다음 전수 매칭까지 배지·정렬이 빈다.
2. **canonical 당 1행 + 외부 id unique = 1:1** — 한 장소가 두 맛집에 붙지 못하고(이미 다른 canonical 이 잡은 장소는 건너뜀), 매칭이 바뀌면 옮김(`rematched`)으로 기록한다. 외부 표와 **FK 를 두지 않는다**(`20260912102150_drop_restaurant_store_match_store_fk`) — 외부 표는 재적재 때 통째로 교체돼 FK 가 적재를 막거나 매칭을 지운다.
3. **재실행은 멱등이고 상태 전이가 이력** — `match:restaurant-stores`·`match:restaurant-tour` 를 적재 뒤 다시 돌리면 `created / rematched / kept / recovered / missing` 으로 갈리고, 외부 행이 사라진 매칭은 지우지 않고 `status: 'missing'`("폐업 의심"·"사라짐")으로 **표시만** 한다. 매칭 실패와 진짜 폐업을 기계가 못 가르므로 공개 목록은 그대로 두고 어드민이 확인한다(여행로그는 국세청 사업자 상태 조회 `check:tour-biz` 가 그 확인을 돕는다).
4. **소비는 읽기 전용 결합** — 공개 상세/목록이 사이드 테이블을 조인해 `RestaurantDetail.store`(업종·개업 정보)·`RestaurantDetail.tour`(여행자 수·만족도·지출 중앙값·재방문율)를 얹고, 정렬(`sort=tourTravelers|tourScore`)·골라줘(`strategy: 'traveler'`)가 그 값을 신호로 쓴다. 매칭이 없으면 필드는 `null` 이고 화면 요소(배지·탭)는 아예 그리지 않는다.

## Instances

- **2026-09-13** in [tour](../topics/tour.md) / [canonical](../topics/canonical.md) (`c777380`, `restaurant-tour-match.service.ts` + `scripts/match-restaurant-tour.ts`): 두 번째 인스턴스 — 반경 100m·점수 ≥0.5 또는 완전일치 300m, `TourPlace` 유형은 식당·상업·상점만(시장·상점으로 잘못 분류된 식당 때문), 장소 1:1(`tourPlaceId` unique), 상태 5종. 운영 첫 실측은 273곳 중 1건(제주 맛집이 1곳) — 매칭보다 **시드 발굴**(여행자가 많이 간 미등록 식당 → 어드민이 discover/register)이 본 용도가 됐고, 4권역 뒤 수도권(`6cae6b2`)에서야 로컬 dev 에도 실매칭이 생겼다(거리 0m·이름 1.0).
- **2026-09-12** in [life-map](../topics/life-map.md) / [canonical](../topics/canonical.md) (`bc39a79`, `restaurant-store-match.service.ts` + `scripts/match-restaurant-stores.ts`): 첫 인스턴스 — 상가업소(음식·카페 업종만) 반경 80m·점수 ≥0.5, `RestaurantStoreMatch`(업소번호 unique), 분기 재적재 뒤 `deploy.sh` 가 매칭을 다시 돌려 사라진 업소를 `missing`(폐업 의심)으로. FK 는 다음 마이그레이션에서 바로 제거됐다 — 재적재가 FK 에 막히는 첫 함정.
- **2026-09-13~19** in [web](../topics/web.md) / [api-contract](../topics/api-contract.md) / [shared](../topics/shared.md): 소비 쪽 형태 — `StoreInfoBadges`·`TourMatchBadge`·`TourSummaryBadge`·`TourTab`(매칭 있을 때만 탭), 목록 정렬 칩·골라줘 칩, 어드민 식당 상세의 "여행자 근거" 카드(`TourEvidencePanel`, allowlist). 계약은 `RestaurantDetail.store/tour` 를 nullable 로 두고 훅은 별도 조회 없이 상세 응답에 실려 온다.
- **대조 — 2026-05~06** in [canonical](../topics/canonical.md): 크롤 소스는 반대로 **합친다**(멤버 매칭·merge/split·자동 검토 큐). 차이는 데이터의 성격 — 크롤 행은 우리가 소유하고 갱신 주기를 통제하지만, 공공·연구 데이터는 통째 교체되고 식별자가 안정적이지 않으며(업소번호 개편, export 마다 재계산되는 장소 id) 라이선스상 원본을 노출할 수도 없다.

## What This Means

1. **"같은 가게"의 답이 하나가 아니다.** 소유·갱신·라이선스 조건이 다른 데이터는 canonical 에 녹이지 않고 사이드 테이블로 두는 것이 맞다 — 그래야 재적재가 맛집 데이터를 건드리지 않고, 매칭 규칙을 바꿔도 되돌릴 수 있다(테이블을 비우고 다시 돌리면 끝).
2. **매칭은 배포 파이프라인의 일부다.** `load:* → match:*` 순서가 deploy.sh 에 박혀 있고, 매칭 결과는 status 한 줄(`tour_matched=N`)로 드러난다([open-data-master-load](open-data-master-load.md)). 다음 외부 출처(예: 위생등급·영업신고)를 붙일 때도 같은 자리(사이드 테이블 + `match:*` + status)를 쓰면 된다.
3. **거리 문턱은 데이터마다 다르게 잰 값이다**(80m vs 100m/300m). 공통 규칙으로 뭉개지 말고 각 서비스 헤더 주석의 근거(좌표 정밀도·이름 품질)와 함께 두는 편이, "왜 이 가게는 안 붙나"를 어드민이 설명할 수 있게 한다.
4. **사라짐을 지우지 않는 것이 신호다.** `missing` 은 폐업 후보 큐이자 데이터 품질 지표다(상가는 `missingSince` 로 언제부터인지도 남긴다) — 재적재 뒤 `missing` 이 급증하면 매칭 규칙이 아니라 원천 데이터 형식이 바뀐 것부터 의심한다. `--dry-run` 과 7분류 리포트(created/rematched/kept/recovered/newlyMissing/stillMissing/unmatched)가 그 판단 도구다.
5. **상호 유사도 함수가 셋이다** — canonical 멤버 매칭의 `matching.ts`(Jaccard·`normalizeName`), 사이드 테이블의 utils Dice(`normalizeLifeStoreName`), 음식 카탈로그의 `normalizeTerm`. 데이터마다 이름의 성격이 달라 갈라진 것이지만, 임계값(0.5 등)을 서로 참조하거나 옮겨 쓰면 안 된다 — 각자의 골든/단위 테스트가 기준이다.

## Sources

- [canonical](../topics/canonical.md)
- [life-map](../topics/life-map.md)
- [tour](../topics/tour.md)
- [friendly](../topics/friendly.md)
- [api-contract](../topics/api-contract.md)
- [shared](../topics/shared.md)
- [web](../topics/web.md)
- [open-data-master-load](open-data-master-load.md)
- [canonical-corpus-fanout](canonical-corpus-fanout.md)
