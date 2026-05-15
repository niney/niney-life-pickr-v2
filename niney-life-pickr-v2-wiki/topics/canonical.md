---
topic: canonical
last_compiled: 2026-05-15
status: active
---

# canonical — 출처 가로지르는 같은 가게 통합

`apps/friendly/src/modules/canonical/` 와 `apps/friendly/src/lib/matching.ts` 를 묶은 어드민 전용 통합 레이어. Naver/캐치테이블/다이닝코드 같은 서로 다른 source 에서 들어온 `Restaurant` 행들을 "이 셋이 사실은 같은 가게" 로 묶어 한 개의 `CanonicalRestaurant` 정체로 만든다. 자동 머지는 의도적으로 하지 않고, bigram Jaccard + Haversine 으로 점수를 매긴 cross-source 후보를 두 채널로 어드민에게 노출한다 — (1) 풀 후보 패널, (2) list 행 위에 끼는 1차 알림 줄, 그리고 (3) 등록 직후 후크가 채우는 검토 큐. merge/split/delete 는 모두 명시 호출이며 트랜잭션 안에서 FK 무결성을 손으로 관리한다.

## Purpose [coverage: high — 4 sources]

가게 데이터 인입은 source 별로 따로 들어온다 — Naver Place 크롤러, 다이닝코드 어댑터, 캐치테이블 어댑터가 각각 자신의 `(source, sourceId)` 로 `Restaurant` 행을 만들고 [unique 제약](../../apps/friendly/prisma/schema.prisma)`@@unique([source, sourceId])` 으로 같은 source 안 중복은 막는다. 하지만 source 가 다르면 같은 가게여도 절대 같은 행으로 안 들어온다. `canonical` 레이어가 그 위에 1단계를 더 얹어 "Naver `1234567` + 다이닝코드 `abc-def` = 한 가게" 를 사람이 검수하고 묶을 수 있게 한다.

호출자:
- 어드민 가게 페이지 (`AdminRestaurantsPage`) — list 행 단위로 "병합" 버튼(`CanonicalMergePanel`), 행 위 1차 제안 알림 줄, 검토 큐 패널(`MergeProposalQueue`), canonical 단위 삭제 버튼.
- crawl 서비스 — 가게 등록(create) / 갱신(update) 직후 `generateProposalsForRestaurant` 후크 호출 ([crawl.service.ts:104](../../apps/friendly/src/modules/crawl/crawl.service.ts), 호출 지점 [:302](../../apps/friendly/src/modules/crawl/crawl.service.ts) 다이닝코드, [:536](../../apps/friendly/src/modules/crawl/crawl.service.ts) 네이버).
- `RestaurantService.list` — 매 list 응답에 각 canonical 의 `candidateCount` 와 (조건 만족 시) `suggestion` 1건을 끼워 보냄 ([restaurant.service.ts:483-642](../../apps/friendly/src/modules/restaurant/restaurant.service.ts)).

권한은 전부 `app.authenticate + app.requireAdmin`. 일반 사용자는 호출 불가.

## Architecture [coverage: high — 6 sources]

```
                     ┌─ Restaurant (naver)   ┐
CanonicalRestaurant ─┼─ Restaurant (dc)      ├─ N:1 FK (onDelete: RESTRICT)
                     └─ Restaurant (catch)   ┘
        │
        ├─ CanonicalMergeProposal (A, B 페어, 항상 A < B)
        └─ suggestionDismissedAt — list 알림 줄 닫힘 표식
```

1. **Schema** ([schema.prisma:92-151](../../apps/friendly/prisma/schema.prisma)) — `CanonicalRestaurant` 가 부모, `Restaurant.canonicalId` 가 자식. FK 는 `onDelete: Restrict` 라 부모를 그냥 못 지운다(자식 먼저 정리 필요 — Gotchas 참조). `CanonicalMergeProposal` 은 `(canonicalAId, canonicalBId)` 가 unique 이고 둘 다 `onDelete: Cascade` — 부모 canonical 사라지면 그 쌍이 끼인 proposal 도 자동 삭제.
2. **Matching 유틸** ([matching.ts](../../apps/friendly/src/lib/matching.ts)) — `normalizeName`(소문자/공백·구두점 제거 + `본점|지점|점` suffix 1회 제거) → `bigrams` → `nameSimilarity`(Jaccard) → `scoreMatch`(이름 0.6 + 거리 0.4, 거리 200m 선형 감쇠). 좌표 하나라도 null 이면 `nameScore` 단독. `isCandidate` 가 cutoff 적용 — 좌표 有 `score ≥ 0.45 && distanceM ≤ 500`, 좌표 無 `nameScore ≥ 0.7`.
3. **CanonicalService** ([canonical.service.ts](../../apps/friendly/src/modules/canonical/canonical.service.ts)) — 5개 진입점: `loadSummary`(요약), `getCandidates`(어드민 패널용 풀 후보), `merge`(트랜잭션 안에서 `Restaurant.updateMany` → 원본 canonical `delete`), `split`(snapshot json 에서 좌표 추출해 새 canonical 생성, 잔여 0이면 원본 삭제), `deleteCanonical`(자식 Restaurant 먼저 `deleteMany` → 부모 delete), `dismissSuggestion`(`suggestionDismissedAt = new Date()`).
4. **ProposalService** ([proposal.service.ts](../../apps/friendly/src/modules/canonical/proposal.service.ts)) — `generateForCanonical(id)` (등록 후크), `generateAll`(어드민 "전체 다시 돌리기", O(N²) 페어 매칭 + bbox prefilter), `list`(open 만), `accept`(`canonical.merge` 위임, keepSide 가 살아남는 쪽), `reject`(같은 쌍 영구 차단).
5. **bbox prefilter** — `COORD_BOX_DELTA = 0.007`(위도 1°≈111km, 500m 임계의 약 1.5x). `findMany` 의 WHERE 절에 `latitude/longitude` 박스 조건을 걸어 Haversine 을 전수 호출하지 않게 좁힌다 ([canonical.service.ts:85-100](../../apps/friendly/src/modules/canonical/canonical.service.ts), [proposal.service.ts:41-59](../../apps/friendly/src/modules/canonical/proposal.service.ts)).
6. **List 응답 통합** ([restaurant.service.ts:330-646](../../apps/friendly/src/modules/restaurant/restaurant.service.ts)) — 모든 Restaurant 를 한 번에 로드해 `byCanonical: Map<canonicalId, {canonical, sources[]}>` 로 그룹화 → 페어별 score 루프 안에서 각 canonical 의 `candidateCount` 와 `top1` 후보를 동시에 집계 → `suggestion` 은 `candidateCount ≥ 1 && suggestionDismissedAt === null` 일 때만 top1 으로 채움 → `CanonicalListItem` 한 줄에 `sources[] + candidateCount + suggestion?` 으로 반환.

## Talks To [coverage: high — 5 sources]

- **Prisma** — `canonical_restaurants`, `canonical_merge_proposals`, `restaurants` 세 테이블만 만진다. Registry/cache/외부 어댑터 의존성 없음 — 순수 DB 모듈.
- **`@repo/api-contract`** ([schemas/canonical.ts](../../packages/api-contract/src/schemas/canonical.ts)) — `CanonicalSummary`, `CanonicalMatchCandidate`, `CanonicalSuggestion`, `CanonicalProposalItem` 등 zod. `CanonicalListItem` 은 [restaurant.ts:120-155](../../packages/api-contract/src/schemas/restaurant.ts) 에 있고 `CanonicalSuggestion` 을 import.
- **crawl** ([crawl.service.ts:50,84,302,536](../../apps/friendly/src/modules/crawl/crawl.service.ts)) — 생성자가 `ProposalService` 를 옵셔널 주입(`null` 가능 — 테스트 단순화용). 등록/갱신 직후 `generateProposalsForRestaurant(restaurantId)` 호출 — 실패해도 try/catch 로 삼키고 console.error 만(큐는 보조 채널이라 등록 흐름을 막지 않는다).
- **restaurant** — `RestaurantService.upsertRestaurantFromCrawl` 등이 신규 행 생성 시 `canonical: { create: { ... } }` 로 1:1 canonical 을 함께 만든다 ([restaurant.service.ts:87-108](../../apps/friendly/src/modules/restaurant/restaurant.service.ts)). `getCanonicalIdForRestaurant` 는 후크가 restaurantId → canonicalId 를 푸는 데 사용.
- **shared / web** — [canonical.api.ts](../../packages/shared/src/api/canonical.api.ts), [useCanonical.ts](../../packages/shared/src/hooks/useCanonical.ts) (React Query 훅 8개). 어드민 UI 는 [CanonicalMergePanel.tsx](../../apps/web/src/components/restaurant/CanonicalMergePanel.tsx)(후보 패널 + merge/split 버튼), [MergeProposalQueue.tsx](../../apps/web/src/components/restaurant/MergeProposalQueue.tsx)(검토 큐 + 전체 다시 돌리기), [AdminRestaurantsPage.tsx](../../apps/web/src/routes/admin/AdminRestaurantsPage.tsx)(suggestion 알림 줄, "닫기", canonical 단위 삭제 다이얼로그).

## API Surface [coverage: high — 2 sources]

베이스 prefix `/api/v1`. `Routes.Canonical` ([routes.ts:127-150](../../packages/api-contract/src/routes.ts)) 에 한 곳에 정의. 모두 `authenticate + requireAdmin`. Route 핸들러 → service → 예외 `CanonicalError` 발생 시 `mapError` 가 `NOT_FOUND→404 / CONFLICT→409 / BAD_REQUEST→400` 으로 변환.

| Method | Path | Body / Params | 200 응답 |
| --- | --- | --- | --- |
| GET | `/admin/canonical/:id/candidates` | `params: { id }` | `CanonicalCandidatesResult` — `{ target, candidates: MatchCandidate[] }`. cross-source 만, score desc 정렬. 풀 후보 패널이 사용. |
| POST | `/admin/canonical/merge` | `{ sourceCanonicalId, targetCanonicalId }` | `CanonicalMergeResult` — `{ ok, target, movedRestaurantIds }`. source 의 모든 Restaurant 가 target 으로 이전되고 source canonical 행은 삭제. 같은 id 면 400, 어느 한쪽 없으면 404. |
| POST | `/admin/canonical/:id/split` | `{ restaurantId }` | `CanonicalSplitResult` — `{ ok, newCanonical, sourceCanonicalDeleted }`. restaurant 의 snapshotJson 에서 좌표 추출(naver `latitude/longitude` / DC `lat/lng` 둘 다 시도). 잔여 0이면 원본 canonical 삭제 후 `sourceCanonicalDeleted: true`. |
| POST | `/admin/canonical/:id/suggestion/dismiss` | `params: { id }` | `{ ok: true }`. `suggestionDismissedAt = now()` 영구. 풀 후보 패널과는 별개 — 어드민이 "병합" 직접 클릭하면 candidates 가 다시 후보를 계산. |
| GET | `/admin/canonical/proposals` | — | `CanonicalProposalListResult` — `{ items: ProposalItem[] }`. `status = 'open'` 만, score desc → createdAt desc. |
| POST | `/admin/canonical/proposals/run` | — | `{ created: number }`. 어드민 "전체 다시 돌리기". 이미 open/rejected 인 쌍은 skip. |
| POST | `/admin/canonical/proposals/:id/accept` | `{ keepSide: 'A' \| 'B' }` (default `'A'`) | `{ ok, merge: CanonicalMergeResult }`. 내부적으로 `canonical.merge(sourceId, targetId)` 호출 → FK Cascade 로 같은 source/target 이 끼인 다른 open proposal 들이 자동 정리. |
| POST | `/admin/canonical/proposals/:id/reject` | — | `{ ok: true }`. status='rejected' + resolvedAt. 같은 쌍은 두 canonical 살아 있는 동안 다시 큐에 안 들어옴. |
| DELETE | `/admin/canonical/:id` | `params: { id }` | `{ ok, deletedRestaurantCount, deletedReviewCount }`. canonical 단위 통째 삭제 — 매달린 Restaurant 들 + 그 VisitorReview/MenuCanonical/Proposal 모두 정리. |

Proposal 의 status enum 은 `open | accepted | rejected | superseded` ([canonical.ts:103-109](../../packages/api-contract/src/schemas/canonical.ts)). 실제로 DB 에 들어가는 값은 `open` / `rejected` 만 — `accepted` 는 merge 와 동시에 cascade 로 행이 사라지고, `superseded` 는 한쪽 canonical 이 다른 머지로 사라질 때 같은 cascade 경로로 행 자체가 사라지므로 별도 마킹이 없다.

## Data [coverage: high — 3 sources]

### `canonical_restaurants` ([migration](../../apps/friendly/prisma/migrations/20260515083303_add_canonical_restaurant/migration.sql))

| 컬럼 | 타입 | 비고 |
| --- | --- | --- |
| `id` | TEXT PK | cuid |
| `name` | TEXT | 표시용. merge 시 target 의 값 유지 |
| `primaryCategory` | TEXT? | primary 행의 카테고리 |
| `latitude` / `longitude` | REAL? | 후보 매칭용. primary 좌표. bbox 인덱스 `(latitude, longitude)` |
| `searchKey` | TEXT? | 예약 — 현재 채워지지 않음. 추후 prefix scan 후보 |
| `suggestionDismissedAt` | DATETIME? | list 행 위 1차 제안 알림 닫힘 표식. [migration](../../apps/friendly/prisma/migrations/20260515100910_add_canonical_suggestion_dismissed/migration.sql) 에서 추가. null 이면 노출 후보 |
| `createdAt` / `updatedAt` | DATETIME | |

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

## Key Decisions [coverage: high — 5 sources]

- **(a) 자동 매칭 안 함, 전부 검토 큐로** — [matching.ts:1-4](../../apps/friendly/src/lib/matching.ts) 주석에 명시. 동명이인/주변 가게 false positive 가 데이터 오염을 일으키므로 마지막 단계는 항상 사람 눈. 임계 통과한 쌍은 그대로 `canonical_merge_proposals` 큐에 적재되고 어드민이 accept/reject.
- **(b) cross-source 만 후보** — 같은 source 끼리는 `(source, sourceId)` UNIQUE 라 절대 같은 가게가 두 행으로 들어올 수 없다. 그래서 후보 룰에 "target 의 source 집합과 겹치지 않는 source 가 후보 측에 있어야" 한 조건 추가 ([canonical.service.ts:120-122](../../apps/friendly/src/modules/canonical/canonical.service.ts), [proposal.service.ts:62-64](../../apps/friendly/src/modules/canonical/proposal.service.ts)). 묶을 가치가 있는 건 오로지 cross-source.
- **(c) bigram Jaccard + Haversine, 좌표 유무로 다른 임계** — `nameScore = Jaccard(bigrams(normName))`, `distanceScore = max(0, 1 - d/200)`, `score = 0.6·name + 0.4·dist`. 좌표 둘 다 있으면 `score ≥ 0.45 && d ≤ 500m`, 좌표 한쪽이라도 없으면 `nameScore ≥ 0.7` 단독 ([matching.ts:90-102](../../apps/friendly/src/lib/matching.ts)). 좌표 무 케이스 임계가 더 엄격한 건 false-positive 위험이 크기 때문.
- **(d) bbox prefilter ±0.007°** — 위도 1°≈111km, 500m × 1.5 마진. `findMany` WHERE 절에 직접 박스 조건을 걸어 SQL 단계에서 Haversine 전수 호출을 막는다. take 200(candidates) / 500(generateForCanonical). `generateAll` 은 어드민 < 1k 행 가정으로 O(N²) 페어 루프 + 코드 측 bbox 컷.
- **(e) Restaurant FK 가 Cascade 가 아님 → deleteCanonical 이 트랜잭션 안에서 직접 정리** — `restaurants_canonicalId_fkey ON DELETE RESTRICT`. 그냥 `canonical.delete` 하면 FK 위반. `deleteCanonical` 은 `$transaction` 안에서 자식 `Restaurant.deleteMany({ where: { canonicalId } })` 먼저 호출 후 부모 delete ([canonical.service.ts:283-312](../../apps/friendly/src/modules/canonical/canonical.service.ts)). Restaurant→VisitorReview/MenuCanonical 은 자체 Cascade 로 따라온다.
- **(f) Proposal 페어 정규화 — 항상 작은 id 가 A, 큰 id 가 B** — `normalizePair(x, y) = x < y ? [x, y] : [y, x]` (cuid 사전순) ([proposal.service.ts:18-19](../../apps/friendly/src/modules/canonical/proposal.service.ts)). `@@unique([canonicalAId, canonicalBId])` 와 결합해 양방향 중복 큐잉 차단. accept 시 `keepSide: 'A' | 'B'` 로 어느 쪽을 살릴지 명시.
- **(g) suggestionDismissedAt — 어드민이 "닫기" 영구** — list 행 위 1차 알림 줄(`CanonicalListItem.suggestion`) 은 새 등록 직후 작은 신호 채널. 어드민이 "이 가게는 합칠 게 없어" 클릭하면 `suggestionDismissedAt = now()` 로 영구 닫힘. 풀 후보 패널(`getCandidates`)과는 분리 — 어드민이 명시적으로 "병합" 패널을 열면 후보가 다시 계산된다. list 응답의 `suggestion` 노출 조건은 `suggestionDismissedAt === null && candidateCount ≥ 1` ([restaurant.service.ts:604-617](../../apps/friendly/src/modules/restaurant/restaurant.service.ts)).

## Gotchas [coverage: medium — 4 sources]

- **FK Cascade 누락 트랩** — `Restaurant.canonicalId` 가 `Restrict` 라는 사실을 모르면 `canonical.delete` 직호출이 즉시 FK 에러. 항상 `deleteCanonical` 진입점을 거쳐야 자식 정리가 같이 일어난다. 반대로 `CanonicalMergeProposal` 의 두 FK 는 Cascade 라 merge 시 source canonical 이 사라지면 그 source 가 끼인 다른 open proposal 들이 자동으로 같이 사라진다 — accept 핸들러가 proposal status 갱신을 skip 하는 이유 ([proposal.service.ts:244-247](../../apps/friendly/src/modules/canonical/proposal.service.ts)).
- **한국어 자모 normalize 는 비교 단계에서만** — `normalizeName` 은 표시용이 아니라 매칭 키 전용. 소문자/공백/구두점 제거 + `본점|지점|점` suffix 1회만 떼고 이모지/괄호 보조설명은 그대로 둔다 — 변별력 보존. UI 에 그대로 출력하면 안 됨 ([matching.ts:11-15](../../apps/friendly/src/lib/matching.ts)).
- **Restaurant 단위 삭제 vs Canonical 단위 삭제 둘 다 라우트 유지** — 어드민은 사용 맥락에 따라 둘 다 필요. Restaurant 한 행만 떼면 `split` (잔여가 ≥1 일 때) 또는 그냥 `Restaurant.delete` (다른 모듈, list 우측 작업); canonical 전체를 정리하고 싶으면 `DELETE /admin/canonical/:id`. 두 라우트가 의미가 다르므로 통합 금지 — `delete` 라우트 주석에도 명시 ([routes.ts:147-149](../../packages/api-contract/src/routes.ts)).
- **순수 DB 모듈, registry 의존성 없음** — crawl 의 JobRegistry, summary 의 큐 등과 달리 canonical 모듈은 메모리 상태가 0이다. 모든 진실은 두 테이블에 있고 후크 실패도 등록 흐름을 막지 않는다 ([crawl.service.ts:104-114](../../apps/friendly/src/modules/crawl/crawl.service.ts)). 데이터 복구는 항상 `proposals/run` 으로 전수 재계산하면 일관된 상태가 된다.
- **좌표 추출 source 별 키 차이** — `split` 에서 snapshot json 을 읽을 때 Naver 는 `latitude/longitude`, 다이닝코드는 `lat/lng`. 둘 다 시도해 `??` 로 첫 truthy 선택 ([canonical.service.ts:230-241](../../apps/friendly/src/modules/canonical/canonical.service.ts)). 마이그레이션의 백필 COALESCE 와 같은 패턴.

## Sources [coverage: high — 17 sources]

- [apps/friendly/prisma/schema.prisma](../../apps/friendly/prisma/schema.prisma) — `CanonicalRestaurant`, `CanonicalMergeProposal`, `Restaurant.canonicalId`
- [apps/friendly/prisma/migrations/20260515083303_add_canonical_restaurant/migration.sql](../../apps/friendly/prisma/migrations/20260515083303_add_canonical_restaurant/migration.sql)
- [apps/friendly/prisma/migrations/20260515100910_add_canonical_suggestion_dismissed/migration.sql](../../apps/friendly/prisma/migrations/20260515100910_add_canonical_suggestion_dismissed/migration.sql)
- [apps/friendly/prisma/migrations/20260515104718_add_canonical_merge_proposals/migration.sql](../../apps/friendly/prisma/migrations/20260515104718_add_canonical_merge_proposals/migration.sql)
- [apps/friendly/src/modules/canonical/canonical.service.ts](../../apps/friendly/src/modules/canonical/canonical.service.ts)
- [apps/friendly/src/modules/canonical/canonical.route.ts](../../apps/friendly/src/modules/canonical/canonical.route.ts)
- [apps/friendly/src/modules/canonical/canonical.test.ts](../../apps/friendly/src/modules/canonical/canonical.test.ts)
- [apps/friendly/src/modules/canonical/proposal.service.ts](../../apps/friendly/src/modules/canonical/proposal.service.ts)
- [apps/friendly/src/lib/matching.ts](../../apps/friendly/src/lib/matching.ts)
- [apps/friendly/src/lib/matching.test.ts](../../apps/friendly/src/lib/matching.test.ts)
- [apps/friendly/src/modules/crawl/crawl.service.ts](../../apps/friendly/src/modules/crawl/crawl.service.ts) — `generateProposalsForRestaurant` 후크
- [apps/friendly/src/modules/restaurant/restaurant.service.ts](../../apps/friendly/src/modules/restaurant/restaurant.service.ts) — `canonical: { create }`, `getCanonicalIdForRestaurant`, `list` 안 suggestion/candidateCount 집계
- [packages/api-contract/src/schemas/canonical.ts](../../packages/api-contract/src/schemas/canonical.ts)
- [packages/api-contract/src/schemas/restaurant.ts](../../packages/api-contract/src/schemas/restaurant.ts) — `CanonicalListItem`, `candidateCount`, `suggestion`
- [packages/api-contract/src/routes.ts](../../packages/api-contract/src/routes.ts) — `Routes.Canonical`
- [packages/shared/src/api/canonical.api.ts](../../packages/shared/src/api/canonical.api.ts)
- [packages/shared/src/hooks/useCanonical.ts](../../packages/shared/src/hooks/useCanonical.ts)
- [apps/web/src/components/restaurant/CanonicalMergePanel.tsx](../../apps/web/src/components/restaurant/CanonicalMergePanel.tsx)
- [apps/web/src/components/restaurant/MergeProposalQueue.tsx](../../apps/web/src/components/restaurant/MergeProposalQueue.tsx)
- [apps/web/src/routes/admin/AdminRestaurantsPage.tsx](../../apps/web/src/routes/admin/AdminRestaurantsPage.tsx)
