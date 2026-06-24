---
topic: review-clustering
type: codebase
last_compiled: 2026-06-25
source_count: 24
status: active
---

# review-clustering

## Purpose [coverage: high — 8 sources]

한 식당의 리뷰를 **"비슷한 문맥"끼리 묶어** 토픽 라벨 + 카운트 + 대표리뷰로 보여주는 배치 도메인. 공개 맛집 상세의 "분석" 탭(`리뷰 주제`)이 그 결과물이다. 같은 식당의 리뷰가 수백 건이면 사람이 다 읽지 못하므로, 의미가 가까운 리뷰를 군집으로 묶고 각 군집에 한국어 한 줄 라벨("웨이팅이 긴 편", "두툼한 고기")과 tone(긍정/부정/혼합/중립)을 붙여 한눈에 보여준다.

핵심 파이프라인은 **저장된 bge-m3 임베딩 → (조건부) aspect 극성 주입 → UMAP → HDBSCAN → c-TF-IDF → LLM 한 줄 라벨**이다. 무거운 수학(UMAP/HDBSCAN/c-TF-IDF)은 별도 **Python 런타임**에서 돌고 Node 가 stdin/stdout 으로 호출한다. 계산은 **배치**(어드민 버튼 / 요약 종료 훅)로만 일어나고, 공개 API 는 저장된 결과를 **읽기만** 한다(질의 비용 0, 인증 없음).

문맥검색/RAG([review-search](review-search.md))와는 **별개 기능**이되, 같은 `ReviewSummary.embeddingJson`(bge-m3, dim 1024)·같은 통합 코퍼스를 재사용한다. review-search 가 "질문에 답"이라면 review-clustering 은 "전체를 주제별로 요약·집계"다.

연구·방법 선택 배경은 `research/review-clustering/README.md`에, 운영 배포(Python 설치)는 [friendly](friendly.md) deploy 가이드에 있다.

## Architecture [coverage: high — 9 sources]

**분업(Node ↔ Python)** — probe 단계에서 검증한 경계다:

- **Python** ([`scripts/cluster_compute.py`](../../apps/friendly/scripts/cluster_compute.py)) = **수학만**. stdin 으로 `{minClusterSize, aspectWeight, docs:[{reviewId, body, vec, aspects}]}` 를 받아 UMAP→HDBSCAN→c-TF-IDF 를 돌리고, stdout 으로 `{ok, params, clusters:[{members, keywords, repReviewIds}], noise}` 를 JSON 으로 돌려준다. LLM·DB·네트워크 없는 순수 함수. 의존성은 numpy/scikit-learn/umap-learn/hdbscan 만(`requirements-cluster.txt`) — bertopic 패키지는 torch/sentence-transformers 를 끌고 와 무겁고 임베딩은 이미 DB 에 있으므로, 같은 파이프라인만 가볍게 재현한다.
- **Node** ([`review-clustering.service.ts`](../../apps/friendly/src/modules/review-clustering/review-clustering.service.ts)) = **코퍼스 로드·LLM 라벨·DB 영속**. 통합 코퍼스를 로드해 Python 을 `spawn` 하고, 결과 군집에 운영 Ollama 로 한 줄 라벨을 붙여 `ReviewCluster` 로 영속한다.

**파이프라인 (`cluster_compute.compute`)**:
1. L2 정규화(방어적·멱등) — Node 가 이미 했더라도 다시.
2. **(조건부) aspect 극성 9D 주입** (`_augment`) — bge-m3 가 극성을 못 잡는 문제 보정(아래 Key Decisions). Node 가 부정 리뷰가 충분할 때만 `aspectWeight=0.5` 를 넘긴다.
3. **UMAP**(`n_components=5, metric=cosine, random_state=42`) — 차원축소가 밀도 군집 안정화의 핵심. 정확도의 출처는 LLM 라벨이 아니라 이 차원축소다(probe 비교 근거).
4. **HDBSCAN**(`min_cluster_size=8, metric=euclidean, eom`) — 노이즈를 자동 분리(-1).
5. **c-TF-IDF**(`ctfidf_keywords`) — 군집을 한 문서로 보고 변별 키워드 상위 6개 추출.
6. 군집별 대표 리뷰 3건 = medoid(원본 임베딩 공간 centroid 에 가까운 순), size 내림차순 정렬.

**LLM 라벨링** (`labelClusters`) — 군집별 키워드+대표리뷰 블록을 묶어 운영 Ollama(`ollama-cloud`/`chat`)에 **1콜 일괄**로 보내고 `[{id, label, tone}]` 를 받는다. 실패하면 빈 맵 → c-TF-IDF 첫 키워드를 폴백 라벨로.

**영속** (`persist`) — `ReviewCluster.deleteMany → create → ReviewSummary.updateMany(clusterId 배정)` 를 **한 트랜잭션**으로 통째 교체. 군집 행 삭제 시 멤버의 `clusterId` 는 FK `SetNull`.

**트리거 경로** (세 갈래, 모두 `runForRestaurant` 로 수렴):
- **자동** — 요약 종료 → enrich(임베딩) → `ensureClusteredByPlaceId` 체이닝([`summary.service.ts`](../../apps/friendly/src/modules/summary/summary.service.ts) fire-and-forget). 피처 플래그(`CLUSTER_AUTO_ENABLED`) + 재군집 게이트 적용.
- **어드민 수동** — 단건 동기(`run`) / 단건 백그라운드(`cluster-bg`) / 미군집 일괄 순차(`cluster-pending`). 게이트 없이 강제.
- **서비스 등록** — [`plugins/summaries.ts`](../../apps/friendly/src/plugins/summaries.ts) 에서 `ReviewClusteringService` 를 app 전역 singleton(`app.reviewClustering`)으로 decorate. 요약 훅과 라우트가 **같은 인스턴스**를 공유해야 진행 가드(in-memory Set)가 의미를 가진다 → [in-memory-singleton-gates](../concepts/in-memory-singleton-gates.md).

## Talks To [coverage: high — 8 sources]

- **[review-search](review-search.md)** (`retrieval.ts`) — `isJunk` 본문 필터를 재사용하고, 같은 `ReviewSummary.embeddingJson`(bge-m3)·`aspectsJson`·**canonical 통합 코퍼스**를 공유한다. ASPECTS 9축("맛/양/가격/주차/웨이팅/서비스/분위기/위생/재방문")도 retrieval.ts 와 동일하게 유지(극성 주입용).
- **[canonical](canonical.md)** (`canonical-members.ts`) — `resolveCanonicalMembersByRestaurantId`/`...ByPlaceId`/`listPublicPlaces` 로 가게(canonical)의 공개 멤버 행 전체를 해석. 군집은 **대표 키(primary)** 로 영속하고 같은 키로 읽는다(다소스 행이 합쳐진 통합 코퍼스).
- **[ai](ai.md)** (`AiConfigService.getResolved('ollama-cloud','chat')`) — LLM 라벨링용 운영 Ollama 해석. baseUrl/apiKey/defaultModel.
- **[summary](friendly.md)** (`summary.service.ts`) — 요약 종료 훅이 enrich 완료에 군집화를 체이닝(임베딩이 있어야 군집화 가능).
- **[api-contract](api-contract.md)** (`schemas/review-clustering.ts` + `Routes.ReviewClustering`) — 모든 입출력 zod 스키마의 SSOT → [zod-ssot-buildless](../concepts/zod-ssot-buildless.md).
- **[shared](shared.md)** (`review-clustering.api.ts` + `useReviewClusters.ts`) — 웹/앱 공통 API 함수 + React Query 훅.
- **[web](web.md)** / **[mobile](mobile.md)** (`ClusterTopics.tsx`) — 분석 탭 "리뷰 주제" 섹션(읽기 전용) → [platform-ui-split](../concepts/platform-ui-split.md).

## API Surface [coverage: high — 5 sources]

라우트는 [`review-clustering.route.ts`](../../apps/friendly/src/modules/review-clustering/review-clustering.route.ts), 경로 상수는 [`routes.ts`](../../packages/api-contract/src/routes.ts) 의 `ReviewClustering` 네임스페이스. 어드민 4개는 `authenticate + requireAdmin` 가드, 공개 1개는 무인증 → [public-admin-route-split](../concepts/public-admin-route-split.md).

| Method | Path | 핸들러 | 의미 |
|---|---|---|---|
| POST | `/api/v1/admin/review-clustering/run` | `runForRestaurant` | **동기** 단건 군집화. 무거운 배치지만 어드민 대기 허용. `{clusters, noise, total, skipped, reason, ms}` 반환. |
| GET | `/api/v1/admin/review-clustering/status` | `clusterStatus` | 식당별 군집 상태 목록(검색가능 수·eligible·clustered·inProgress·**lastReason**). enrich 상태 미러링. 페이지네이션 + `q` 필터 + "미군집 우선" 정렬. |
| POST | `/api/v1/admin/review-clustering/cluster-bg` | `clusterInBackground` | 단건 **백그라운드**(즉시 반환, `{started, inProgress}`). Python+LLM 수십초가 HTTP 타임아웃 안 나게. 상태는 폴링. |
| POST | `/api/v1/admin/review-clustering/cluster-pending` | `clusterAllEligibleInBackground` | 군집화 가능(통합 enrich ≥ 30)하나 현재 버전 군집이 없는 가게 **일괄 순차**(`{queued}`). |
| GET | `/api/v1/restaurants/:placeId/clusters` | `getPublicClusters` | **공개**(인증 없음·계산 없음). 저장된 군집을 읽어 반환. 군집 없으면 관점집계 폴백, 그것도 없으면 `ready=false`. |

웹/앱 클라이언트([`review-clustering.api.ts`](../../packages/shared/src/api/review-clustering.api.ts))는 경로를 **하드코딩**한다 — `Routes` 네임스페이스가 vite esbuild prebundle 에서 드롭될 수 있어 review-search.api.ts 관례를 따른다.

훅([`useReviewClusters.ts`](../../packages/shared/src/hooks/useReviewClusters.ts)):
- `useRestaurantClusters(placeId, enabled)` — 분석 탭 진입 시 활성화, `staleTime` 5분.
- `useRunClustering()` — 성공 시 `['review-clusters']` 캐시 무효화.
- `useClusterStatus(query)` — `inProgress` 있으면 5초 폴링(SSE 대신 — 군집 작업은 짧음), `keepPreviousData`.
- `useClusterBg()` / `useClusterPending()`.

## Data [coverage: high — 5 sources]

**`ReviewCluster`** ([schema.prisma](../../apps/friendly/prisma/schema.prisma), 테이블 `review_clusters`) — 한 식당 리뷰를 묶은 군집(토픽). 식당 단위로 통째 재계산(delete+insert).

| 컬럼 | 의미 |
|---|---|
| `restaurantId` | canonical **primary** 키. FK `onDelete: Cascade`. |
| `ordinal` | 표시 순서 = size 내림차순. |
| `label` | LLM 한 줄 라벨(폴백: c-TF-IDF 첫 키워드 / `주제 N`). |
| `tone` | `positive\|negative\|mixed\|neutral`(폴백 `neutral`). |
| `size` | 멤버 리뷰 수 = 카운트. |
| `keywordsJson` | c-TF-IDF 상위 키워드 `string[]`. |
| `repReviewIdsJson` | 대표 리뷰 id[](최대 3). 읽기 시 `VisitorReview.body` join. |
| `aspectsJson` | 군집 내 집계 관점→극성 카운트(`{key:"맛:pos", count}` 상위 8). 부가 라벨. |
| `clusterVersion` | = `CLUSTERING_VERSION`. 알고리즘/프롬프트 변경 시 ↑ → 재계산 게이트 → [versioned-llm-prompts](../concepts/versioned-llm-prompts.md). |
| `corpusSize` | 군집 시점의 검색가능(임베딩) 리뷰 수. **자동 재군집 게이트**용 — 다음 크롤 때 현재 수와 비교. (마이그레이션 `20260624034309` 에서 추가, `@default(0)`.) |

**멤버십** — `ReviewSummary.clusterId`(nullable, FK `SetNull`, `@@index`). `null` = 노이즈/미분류("기타"). 군집 행 삭제 시 자동 null. 군집은 별도 멤버 테이블 없이 `ReviewSummary` 의 외래키로 표현.

**마이그레이션** — `20260624014823_add_review_clustering`(테이블 + `ReviewSummary.clusterId` 컬럼/인덱스 추가, SQLite RedefineTables), `20260624034309_add_cluster_corpus_size`(`corpusSize` 컬럼). 군집 테이블은 일반 마이그레이션에 포함 — 재배포의 `migrate deploy` 가 처리(별도 작업 없음).

**API 와이어 타입** ([`schemas/review-clustering.ts`](../../packages/api-contract/src/schemas/review-clustering.ts)) — `ClusterTone` enum, `ReviewClusterItem`(id/ordinal/label/tone/size/keywords/aspects/repReviews), `ReviewClusterAspect`(`{key, count}` — record 대신 배열로 zod 버전 무관·와이어 명시), `ReviewClusterAspectSummary`(폴백용 `{aspect, pos, neg, neu}`), `ReviewClustersResult`(공개), `ReviewClusterStatus*`(어드민), run/bg/pending 입출력.

## Key Decisions [coverage: high — 9 sources]

**방법 = UMAP→HDBSCAN→c-TF-IDF (probe 비교로 채택)** — `research/review-clustering/README.md` 가 조연탄(793건)에 4종 비교: ② 연결요소(체이닝 붕괴 ✗), ③ HDBSCAN 직접(UMAP 없이, 노이즈 96% ✗), ① 응집 avg-linkage(○ 폴백, 자동 라벨 없음), ④ **UMAP→HDBSCAN→c-TF-IDF**(k9·노이즈7%·키워드 변별 ◎ 채택). 핵심 교훈: **정확도의 출처는 LLM 라벨이 아니라 UMAP 차원축소** — ③(UMAP 없이)이 96% 노이즈로 죽고 ④가 사는 차이가 증거.

**`min_cluster_size=8` 절대값** (`probe_params.py`) — 5개 식당(40~793건) 스윕에서 abs8 이 전 크기대 견고. 비례 rel% 는 대형 over-merge(kwOv 0.35), abs12 는 40건 식당 k0/노이즈100%. "리뷰 수 비례" 직관을 데이터가 뒤집음 — 동질 대형 코퍼스는 작은 절대 min 이라야 하위 토픽이 쪼개진다. (`CLUSTER_MIN_SIZE` env override.)

**조건부 aspect 극성 주입 — 부정("단점") 회수** (`probe_negative.py`) — bge-m3 가 극성을 못 잡아("맛없다"↔"맛있다" 임베딩이 가까움) `neg_recall` 이 모든 파라미터에서 **0**, 부정 리뷰가 긍정 옆에 박혀 군집이 안 됐다(파라미터로 해결 불가). 처방: `aspectsJson` 극성을 9차원 부호벡터(pos +1/neg −1)로 만들어 임베딩에 가중(w=0.5) concat. w=0.5 가 sweet spot(neg_recall 0→0.84, 「실망한서비스」 48건 군집). w≥1.0 은 silhouette 음수(공간 왜곡). **조건부**로만 — 부정 리뷰 ≥ `NEG_INJECT_MIN`(=max(min,12)) 일 때만 적용(부정 적은 식당엔 노이즈만↑). 군집화는 증강 공간, 대표 리뷰는 원본 임베딩 공간.

**계산은 배치, 공개는 읽기 전용** — UMAP/HDBSCAN/LLM 은 수십초·비용이 들어 공개 질의 경로에 둘 수 없다. 어드민 버튼 / 요약 종료 훅으로만 계산해 영속하고, 공개 GET 은 저장 결과만 읽는다(질의 비용 0). review-search 의 "배치 enrich → 공개 읽기" 와 같은 비대칭.

**자동 재군집 게이트** (`shouldRecluster`) — 현재 버전 군집이 없으면(첫 군집·버전↑) 무조건, 있으면 마지막 군집 이후 검색가능 리뷰가 `max(GATE_MIN=20, base×GATE_PCT=0.2)` 이상 늘었을 때만 재군집. 소량 추가 시 군집/라벨 churn(공개 탭 주제가 매번 바뀜)·LLM 비용 방지. 어드민 수동은 게이트 무시. (`corpusSize` 컬럼이 base 저장소.)

**우아한 스킵 + 스킵 사유 노출** — `runForRestaurant` 는 정상 경로만 throw, 스킵 사유는 결과로 반환(어드민 가시성·post-summary 훅 graceful). 사유는 `lastRun` 인메모리 Map 에 기록되어 상태 페이지 `lastReason` 으로 노출 — 군집이 "대기"로만 남던 원인(리뷰 부족/전부 노이즈/계산 엔진 오류)을 어드민이 본다. `runTracked` 의 예기치 못한 throw(persist/DB)도 사유로 기록(과거엔 빈 catch 가 삼킴).

**전부 노이즈/소형 식당 폴백 = 관점 집계** — HDBSCAN 이 군집을 0개 만들면(전부 노이즈) `getPublicClusters` 가 `aggregateAspects` 로 폴백 — `aspectsJson` 을 관점→긍/부/중립 카운트로 집계해 `aspectSummary` 로 반환. 분석 탭이 항상 콘텐츠를 갖게. 그것도 비면 `ready=false`.

**LLM `format` 무시 대비 견고 파싱** — 운영 Ollama(gpt-oss)는 Ollama `format` 스키마를 무시하고 마크다운 펜스 + 최상위 배열 + `cluster`(≠`id`) 키로 답한다. 그래서 format 을 강제하지 않고 review-search.chatJson 패턴(`[`/`{` 양쪽 시작 허용 + `id/cluster/index` 키 모두 수용)을 쓴다.

**clusterVersion 히스토리** — `CLUSTERING_VERSION=4`. v2: 극성 주입, v3: corpusSize(자동 게이트), v4: **canonical 통합 코퍼스**(다소스 행 합산). 상수 옆 줄단위 코멘트 → [versioned-llm-prompts](../concepts/versioned-llm-prompts.md).

## Gotchas [coverage: medium — 4 sources]

- **Python 런타임이 별도 의존성** — 운영 호스트에 `python3 + numpy/scikit-learn/umap-learn/hdbscan` 가 있어야 한다(Docker 금지 VM, venv 권장). `.env` 의 `CLUSTER_PYTHON_BIN` 으로 경로 지정(미지정 시 PATH `python3`). **미설치여도 서버는 정상** — 군집화만 graceful skip 되고 분석 탭 섹션이 안 뜰 뿐. 배포 후 `pnpm --filter friendly probe:cluster-health` 로 도달 확인. 설치 가이드는 [friendly](friendly.md) `docs/deploy-friendly.md` "리뷰 군집화" 섹션.
- **임베딩 선행 필수** — 군집화는 enrich(임베딩)된 리뷰가 있어야 한다. review-search 의 임베딩 endpoint 가 먼저 설정되어 있어야 하고, `MIN_REVIEWS=30` 미만이면 스킵. 요약 종료 훅이 `enrich → clustering` 순서로 체이닝하는 이유.
- **PM2 cluster 모드 금지(무관 동음이의)** — deploy 가이드의 "cluster 모드 금지"는 SQLite 다중 프로세스 쓰기(`SQLITE_BUSY`) 때문이지 리뷰 군집화와는 **무관**하다. 용어 충돌 주의.
- **`lastRun`/`clustering` 은 인메모리** — 재시작 시 사라진다(`lastReason` null 로 리셋, 진행 가드 해제). 사유는 클릭 한 번이면 다시 채워지므로 의도적 선택.
- **medoid vs 군집화 공간 분리** — 극성 주입 시 군집화는 증강 공간(9D concat)에서 하지만 대표 리뷰(medoid)는 **원본 임베딩 공간**에서 뽑는다(증강 좌표가 대표성을 왜곡하지 않게). 품질 지표(silhouette 등)도 원본 공간 기준.
- **소량 코퍼스 조기 반환** — `cluster_compute` 는 `n < max(2*min, 10)` 이면 UMAP 도 안 돌리고 전부 노이즈로 반환. c-TF-IDF 는 빈 군집(`np.vstack([])`)·어휘 부족(`CountVectorizer` ValueError) 모두 우아하게 빈 결과/키워드 생략으로 처리.

## Sources [coverage: high — 24 sources]

운영 (Node):
- [`apps/friendly/src/modules/review-clustering/review-clustering.route.ts`](../../apps/friendly/src/modules/review-clustering/review-clustering.route.ts)
- [`apps/friendly/src/modules/review-clustering/review-clustering.service.ts`](../../apps/friendly/src/modules/review-clustering/review-clustering.service.ts)
- [`apps/friendly/src/plugins/summaries.ts`](../../apps/friendly/src/plugins/summaries.ts) (app singleton 등록)
- [`apps/friendly/src/modules/summary/summary.service.ts`](../../apps/friendly/src/modules/summary/summary.service.ts) (요약 종료 → enrich → 군집 체이닝)

운영 (Python 계산기):
- [`apps/friendly/scripts/cluster_compute.py`](../../apps/friendly/scripts/cluster_compute.py)
- [`apps/friendly/scripts/requirements-cluster.txt`](../../apps/friendly/scripts/requirements-cluster.txt)
- [`apps/friendly/package.json`](../../apps/friendly/package.json) (`probe:cluster` / `probe:cluster-health` 스크립트)

계약 / 공유:
- [`packages/api-contract/src/schemas/review-clustering.ts`](../../packages/api-contract/src/schemas/review-clustering.ts)
- [`packages/api-contract/src/routes.ts`](../../packages/api-contract/src/routes.ts) (`ReviewClustering` 네임스페이스)
- [`packages/shared/src/api/review-clustering.api.ts`](../../packages/shared/src/api/review-clustering.api.ts)
- [`packages/shared/src/hooks/useReviewClusters.ts`](../../packages/shared/src/hooks/useReviewClusters.ts)

UI:
- [`apps/web/src/components/restaurant/detail/ClusterTopics.tsx`](../../apps/web/src/components/restaurant/detail/ClusterTopics.tsx)
- [`apps/mobile/src/components/restaurantDetail/shared/ClusterTopics.tsx`](../../apps/mobile/src/components/restaurantDetail/shared/ClusterTopics.tsx)

DB:
- [`apps/friendly/prisma/schema.prisma`](../../apps/friendly/prisma/schema.prisma) (`ReviewCluster` + `ReviewSummary.clusterId`)
- [`apps/friendly/prisma/migrations/20260624014823_add_review_clustering/migration.sql`](../../apps/friendly/prisma/migrations/20260624014823_add_review_clustering/migration.sql)
- [`apps/friendly/prisma/migrations/20260624034309_add_cluster_corpus_size/migration.sql`](../../apps/friendly/prisma/migrations/20260624034309_add_cluster_corpus_size/migration.sql)

연구 / probe:
- [`apps/friendly/research/review-clustering/README.md`](../../apps/friendly/research/review-clustering/README.md)
- [`apps/friendly/research/review-clustering/cluster_lib.py`](../../apps/friendly/research/review-clustering/cluster_lib.py)
- [`apps/friendly/research/review-clustering/probe-cluster.ts`](../../apps/friendly/research/review-clustering/probe-cluster.ts)
- [`apps/friendly/research/review-clustering/probe-cluster.py`](../../apps/friendly/research/review-clustering/probe-cluster.py)
- [`apps/friendly/research/review-clustering/probe_negative.py`](../../apps/friendly/research/review-clustering/probe_negative.py)
- [`apps/friendly/research/review-clustering/probe_params.py`](../../apps/friendly/research/review-clustering/probe_params.py)
- [`apps/friendly/research/review-clustering/probe_quality.py`](../../apps/friendly/research/review-clustering/probe_quality.py)

배포:
- [`docs/deploy-friendly.md`](../../docs/deploy-friendly.md) ("리뷰 군집화 (Python 배치 계산기)" 섹션)
