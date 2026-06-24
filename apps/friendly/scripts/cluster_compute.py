"""리뷰 군집화 — 운영 배치 계산기 (수학만, LLM·DB 없음).

Node(ClusteringService)가 저장된 bge-m3 임베딩으로 코퍼스를 만들어 stdin 으로 넘기면,
검증된 파이프라인 UMAP→HDBSCAN→c-TF-IDF 로 군집을 계산해 stdout 으로 돌려준다.
LLM 라벨링과 DB 영속은 Node 가 한다(운영 chatJson/Ollama·Prisma 일관성). 이 스크립트는
순수 함수 — research/review-search/probe-cluster.py 의 ④ 파이프라인을 운영용으로 추출했다.

  입력(stdin JSON):
    { "minClusterSize": 8,
      "docs": [ { "reviewId": "...", "body": "...", "vec": [..1024..], "aspects": {"맛":"pos"} } ] }
  출력(stdout JSON):
    { "ok": true,
      "params": { "minClusterSize": 8, "n": 793, "reduced": 5 },
      "clusters": [ { "members": ["id"...], "keywords": ["고기"...], "repReviewIds": ["id"...] } ],
      "noise": ["id"...] }    # 어느 군집에도 안 든 리뷰
    실패 시: { "ok": false, "error": "..." } (+ exit 1)

  의존성: numpy, scikit-learn, umap-learn, hdbscan  (requirements-cluster.txt)
"""

import json
import sys

UMAP_DIM = 5
# review-search retrieval.ts 의 ASPECTS 와 동일 — 극성 주입용.
ASPECTS = ["맛", "양", "가격", "주차", "웨이팅", "서비스", "분위기", "위생", "재방문"]


def _augment(X, aspects_list, weight):
    """임베딩(단위벡터)에 aspect 극성 9차원(단위화×weight)을 concat.

    bge-m3 가 극성을 못 잡아 부정 리뷰가 긍정 옆에 박히는 문제 보정(probe 2 검증:
    부정 충분 시 neg_recall 0→0.84). weight=0 이면 원본 그대로. Node 가 부정 리뷰
    수를 보고 조건부로 weight 를 넘긴다(부정 적은 식당엔 0 — 불필요한 노이즈 방지)."""
    import numpy as np

    if not weight:
        return X
    A = np.zeros((len(aspects_list), len(ASPECTS)))
    for r, asp in enumerate(aspects_list):
        for i, a in enumerate(ASPECTS):
            p = asp.get(a) if isinstance(asp, dict) else None
            A[r, i] = 1.0 if p == "pos" else -1.0 if p == "neg" else 0.0
    norms = np.linalg.norm(A, axis=1, keepdims=True)
    A = A / np.where(norms == 0, 1.0, norms) * weight
    return np.hstack([X, A])


def ctfidf_keywords(labels, bodies, clusters, topn=6):
    """BERTopic class-based TF-IDF — 군집을 한 문서로 보고 변별 키워드 추출."""
    import numpy as np
    from sklearn.feature_extraction.text import CountVectorizer

    if not clusters:
        return {}  # 빈 군집 — np.vstack([]) 방지.
    labels = np.asarray(labels)
    try:
        cv = CountVectorizer(token_pattern=r"(?u)\b\w\w+\b", min_df=2)
        counts = cv.fit_transform(bodies)
    except ValueError:
        return {c: [] for c in clusters}  # 어휘 부족(초단문) — 키워드 생략.
    vocab = np.asarray(cv.get_feature_names_out())
    class_count = np.vstack(
        [np.asarray(counts[labels == c].sum(axis=0)).ravel() for c in clusters]
    )
    f_t = class_count.sum(axis=0)
    A = class_count.sum(axis=1).mean() or 1.0
    tf = class_count / np.maximum(class_count.sum(axis=1, keepdims=True), 1)
    idf = np.log(1.0 + A / np.maximum(f_t, 1))
    score = tf * idf
    out = {}
    for ci, c in enumerate(clusters):
        top = np.argsort(score[ci])[::-1][:topn]
        out[c] = [str(vocab[j]) for j in top]
    return out


def compute(payload):
    import numpy as np

    docs = payload.get("docs", [])
    min_cluster = int(payload.get("minClusterSize", 8))
    n = len(docs)
    if n < max(2 * min_cluster, 10):
        # 군집화 의미 없는 소량 — 전부 노이즈로 반환(Node 가 graceful 처리).
        return {"ok": True, "params": {"minClusterSize": min_cluster, "n": n, "reduced": 0},
                "clusters": [], "noise": [d["reviewId"] for d in docs]}

    ids = [d["reviewId"] for d in docs]
    bodies = [d.get("body", "") for d in docs]
    X = np.asarray([d["vec"] for d in docs], dtype=np.float64)
    # 방어적 L2 정규화(Node 가 이미 했더라도 멱등).
    norms = np.linalg.norm(X, axis=1, keepdims=True)
    X = X / np.where(norms == 0, 1.0, norms)

    from umap import UMAP
    import hdbscan

    # 극성 주입(probe 2): Node 가 부정 충분 시 aspectWeight 를 넘긴다 → 부정 군집 회수.
    # 군집화는 증강 공간에서, 대표 리뷰(medoid)는 원본 임베딩 공간에서.
    weight = float(payload.get("aspectWeight", 0) or 0)
    aspects_list = [d.get("aspects", {}) for d in docs]
    Xc = _augment(X, aspects_list, weight)

    reduced = UMAP(
        n_neighbors=min(15, n - 1), n_components=min(UMAP_DIM, n - 2),
        metric="cosine", random_state=42,
    ).fit_transform(Xc)
    labels = hdbscan.HDBSCAN(
        min_cluster_size=min_cluster, metric="euclidean", cluster_selection_method="eom"
    ).fit_predict(reduced)
    labels = np.asarray(labels)

    clusters_ids = sorted(c for c in set(labels) if c >= 0)
    # HDBSCAN 이 군집을 0개(전부 노이즈) 만들면 ctfidf 의 np.vstack([]) 가 터진다
    # ("need at least one array to concatenate"). 우아하게 빈 결과로 반환 → Node 가
    # "군집 형성 안 됨(전부 노이즈)" 스킵으로 처리.
    if not clusters_ids:
        return {"ok": True,
                "params": {"minClusterSize": min_cluster, "n": n,
                           "reduced": int(reduced.shape[1]), "aspectWeight": weight},
                "clusters": [], "noise": ids}
    keywords = ctfidf_keywords(labels, bodies, clusters_ids)

    clusters = []
    for c in clusters_ids:
        idx = np.where(labels == c)[0]
        # medoid 순(centroid 에 가까운 순) 대표 리뷰 3건.
        centroid = X[idx].mean(axis=0)
        centroid /= np.linalg.norm(centroid) or 1.0
        order = idx[np.argsort(X[idx] @ centroid)[::-1]]
        clusters.append({
            "members": [ids[i] for i in idx],
            "keywords": keywords.get(c, []),
            "repReviewIds": [ids[i] for i in order[:3]],
        })
    # size 내림차순 — Node 가 ordinal 부여.
    clusters.sort(key=lambda cl: -len(cl["members"]))
    noise = [ids[i] for i in np.where(labels < 0)[0]]
    return {"ok": True,
            "params": {"minClusterSize": min_cluster, "n": n,
                       "reduced": int(reduced.shape[1]), "aspectWeight": weight},
            "clusters": clusters, "noise": noise}


def main():
    try:
        payload = json.load(sys.stdin)
        result = compute(payload)
    except Exception as e:  # noqa: BLE001 — Node 가 ok=false 로 graceful 처리.
        json.dump({"ok": False, "error": str(e)}, sys.stdout)
        sys.exit(1)
    json.dump(result, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
