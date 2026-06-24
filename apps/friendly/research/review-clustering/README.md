# review-clustering 연구 노트 (비슷한 문맥 리뷰 군집화)

한 식당의 리뷰를 "비슷한 문맥"끼리 묶어 **토픽 + 카운트 + 대표리뷰**로 보여주는 도메인의
방법 선택·최적화 기록. 운영 코드는 `src/modules/review-clustering/` + `scripts/cluster_compute.py`,
이 폴더는 그 **검증·연구 자산**. 문맥검색/RAG([review-search](../review-search/README.md))와는
별개 기능 — 같은 `ReviewSummary.embeddingJson`(bge-m3, dim 1024)을 재사용한다.

## 1. 아키텍처 (확정)

```
저장된 bge-m3 임베딩
 → (조건부) aspect 극성 9D 주입          # 부정 회수용 — 아래 §4
 → UMAP(n_components=5, metric=cosine)    # 차원축소 = 밀도군집 안정화의 핵심
 → HDBSCAN(min_cluster_size=8, eom)       # 노이즈 자동 분리
 → c-TF-IDF 키워드                        # 군집 변별 키워드
 → LLM 한 줄 라벨 + tone                  # 운영 Ollama(gpt-oss) 1콜 일괄
 → ReviewCluster 영속 / 공개는 읽기 전용
```

- **분업**: Python(`cluster_compute.py`)=수학만(stdin/stdout 순수), Node(`ReviewClusteringService`)=
  코퍼스 로드·LLM 라벨·DB 영속. 계산은 **배치**(어드민 버튼 / 요약 종료 훅)로만, 공개 API 는
  저장 결과 읽기 전용(질의 비용 0).
- **운영 배포**: 호스트에 `python3 + umap-learn + hdbscan` 필요(Ollama 네이티브 요구와 동급,
  Docker 금지 VM). `pip install -r scripts/requirements-cluster.txt`, 부팅 전
  `pnpm --filter friendly probe:cluster-health`. 미설치/실패 시 graceful skip(공개 탭 미표시).
- `computeClusters` 한 메서드로 격리 → 원하면 순수 TS(①)로 교체 가능.

## 2. 방법 선택 — 왜 BERTopic식인가 (`probe-cluster.{ts,py}`)

조연탄(793건, 동일 벡터)에 4종 비교:

| 방법 | 런타임 | 결과 | 판정 |
|---|---|---|---|
| ② 연결요소(single-linkage) | TS | 체이닝 붕괴(전부 한 덩어리) | ✗ |
| ③ HDBSCAN 직접(UMAP 없이) | Python | 노이즈 96% | ✗ 고차원·동질에서 밀도군집 붕괴 |
| ① 응집 avg-linkage | TS | k38·노이즈14%, 무난 | ○ 폴백(자동 라벨 없음) |
| ④ **UMAP→HDBSCAN→c-TF-IDF** | Python | k9·노이즈7%·키워드 변별 | ◎ **채택** |

**핵심 교훈**: 정확도의 출처는 LLM 라벨이 아니라 **UMAP 차원축소**. ③(UMAP 없이)이 96%
노이즈로 죽고 ④가 사는 차이가 그 증거. LLM 은 묶음을 *읽기 좋게* 할 뿐.

## 3. 측정 자 — 객관 지표 (`probe_quality.py`, `cluster_lib.metrics`)

| 지표 | 의미 | 방향 |
|---|---|---|
| silhouette(cosine) | 군집 분리도(원본 임베딩, 노이즈 제외) | ↑ |
| cohesion | 군집 내 응집(멤버·centroid 평균 코사인) | ↑ |
| separation | 군집 간 분리(1 − centroid 쌍 평균 코사인) | ↑ |
| kw_overlap | c-TF-IDF 상위 키워드 군집 간 Jaccard | ↓(변별) |
| neg_recall | 부정 리뷰가 '부정 우세 군집'에 든 비율 | ↑ |

조연탄: silh **0.05** / cohes **0.83** / kwOv **0.04**. → 임베딩 분리는 약해도(동질 코퍼스
"맛있어요" 일색) **키워드는 변별** — ④가 동질 데이터에서도 먹히는 이유의 정량 근거.

## 4. 검증된 개선 (채택)

### 4-1. 파라미터 = `min_cluster_size=8` 절대값 (`probe_params.py`)

5개 식당(40~793건) × 정책 스윕:

| 정책 | 관측 | 판정 |
|---|---|---|
| **abs8** | 전 크기대 견고(40→k2, 793→k9/7%) | ✅ **채택** |
| 비례 rel% | 대형 over-merge(조연탄 rel3%→k3, kwOv 0.35) | ❌ 기각 |
| abs12 | 40건 식당 k0/노이즈100% | ❌ 위험 |

"리뷰 수 비례" 직관을 데이터가 뒤집음 — 동질 대형 코퍼스는 **작은 절대 min** 이라야 하위
토픽이 쪼개진다. 비례로 키우면 2~3개 generic 덩어리로 뭉갠다.

### 4-2. 부정("단점") 회수 = 조건부 aspect 극성 주입 (`probe_negative.py`)

- **문제**: `neg_recall` 이 **모든 식당·모든 파라미터에서 0** — bge-m3 가 극성을 못 잡아
  (맛없다↔맛있다 임베딩이 가까움) 부정 리뷰가 긍정 옆에 박혀 군집이 안 된다. 파라미터로
  해결 불가.
- **처방**: 저장된 `aspectsJson` 극성을 9차원 부호벡터(pos +1 / neg −1)로 만들어 임베딩에
  **가중(w) concat** 후 군집화.

| w | k | noise% | neg_recall | 비고 |
|---|---|---|---|---|
| 0.0(기존) | 9 | 7 | **0.0** | 부정 군집 0 |
| **0.5** | 16 | 17 | **0.84** | sweet spot(「실망한서비스」 48건 군집 생성) |
| ≥1.0 | 16~18 | 2~4 | 0.74~0.81 | silhouette 음수 — 임베딩 공간 왜곡 |

- **일반화**: 부정 적은 식당(5·3건)엔 무효 + 노이즈만↑ → **조건부**로만 적용 —
  `부정 리뷰 ≥ NEG_INJECT_MIN(=max(min,12))` 일 때만 w=0.5. (부정이 한 군집을 이룰 양일 때.)
- **트레이드오프**: 주입 시 k↑(9→16)·노이즈↑(7→17%) 대신 **불만 군집 확보**(제품 차별점 —
  RAG completeness 프로브가 짚은 "단점 누락" 보완).
- 운영 반영: `CLUSTERING_VERSION=2`, `cluster_compute._augment`, service `ASPECT_WEIGHT=0.5`/
  `NEG_INJECT_MIN`/`negScore`.

## 5. 라벨링 함정

운영 라벨은 Ollama(`gpt-oss:120b`). 이 모델은 Ollama `format` 스키마를 **무시**하고
마크다운 펜스 + **최상위 배열** + `cluster`(≠`id`) 키로 응답한다. 파서는 review-search.chatJson
패턴대로 `[`/`{` 양쪽 시작 허용 + `id/cluster/index` 키 모두 수용해야 한다. 라벨이 띄어쓰기
없이 붙는 경향("대기긴인기맛집")이 있어 품질 튜닝 여지 있음. (probe-cluster.py 는 `claude -p`
로 더 깔끔하지만 운영은 Ollama.)

## 6. 미래 레버 (미적용)

- **안정성/churn**: 재크롤마다 재군집 → 리뷰 소량 추가 시 군집/라벨이 출렁이나(ARI 측정).
  출렁이면 공개 탭 주제가 매번 바뀜 → 임계/증분 전략.
- **UMAP 파라미터·PCA**: n_neighbors/n_components 스윕, 결정론적 PCA 로 churn 감소?
- **라벨 띄어쓰기/품질**: 프롬프트 개선 또는 판정자 채점.
- **다른 임베딩**: 극성 잡는 모델이면 §4-2 주입 불필요해질 수 있음(재임베딩 비용).

## 7. 프로브 사용법

```bash
pnpm --filter friendly probe:cluster-health   # 배포 전: python3+umap+hdbscan 도달 확인
pnpm --filter friendly probe:cluster          # 방법 비교(TS ①②) + 동일벡터 .tmp export
python research/review-clustering/probe-cluster.py    # 방법 비교(Python ③④ + claude 라벨)
python research/review-clustering/probe_quality.py    # 지표 측정 자 검증
python research/review-clustering/probe_params.py     # 교차 식당 파라미터 스윕
python research/review-clustering/probe_negative.py [식당명]  # 부정 회수(극성 주입 w 스윕)
```
대상은 임베딩 보유 식당(조연탄·목동돈가스·깜장김밥·충무식·더기와). Python 프로브는 dev.db 직접 읽음.

## 8. 핵심 파일

- 운영: `src/modules/review-clustering/{review-clustering.service,review-clustering.route}.ts`,
  `scripts/cluster_compute.py`, `scripts/requirements-cluster.txt`
- 스키마: `prisma/schema.prisma`(ReviewCluster + ReviewSummary.clusterId)
- 계약: `packages/api-contract/src/schemas/review-clustering.ts`, `routes.ts`(ReviewClustering)
- 공유: `packages/shared/src/{api/review-clustering.api,hooks/useReviewClusters}.ts`
- UI: `apps/{web,mobile}/.../ClusterTopics.tsx`(분석 탭 섹션), 어드민 `AdminReviewSearchPage.tsx`
- 훅: `summary.service.ts`(요약 종료 → enrich → 군집 체이닝)
- 연구: 이 폴더(`research/review-clustering/`)
