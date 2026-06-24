"""리뷰 군집화 최적화 프로브 — 공유 라이브러리.

DB(dev.db)에서 직접 저장된 bge-m3 임베딩을 읽어, 파라미터화된 파이프라인
(UMAP→HDBSCAN→c-TF-IDF)과 **객관적 품질 지표**를 제공한다. 운영 cluster_compute.py
와 같은 알고리즘이되, 여기선 여러 식당·여러 파라미터로 측정·비교하는 연구용.

지표(probe 3 = 측정 자):
  - n_clusters, noise%        : 형성된 군집 수 / 미분류 비율
  - silhouette (cosine)       : 군집 분리도. 원본 임베딩 공간, 노이즈 제외. [-1,1]↑
  - cohesion                  : 군집 내 응집(멤버·centroid 평균 코사인). ↑
  - separation                : 군집 간 분리(1 - centroid 쌍 평균 코사인). ↑
  - kw_overlap                : c-TF-IDF 상위 키워드 군집 간 평균 Jaccard 겹침. ↓
  - neg_recall                : 부정 리뷰가 '부정 드러내는' 군집에 잡히는 비율(probe 2)
"""

import json
import re
import sqlite3
from itertools import combinations
from pathlib import Path

import numpy as np

DB_PATH = Path(__file__).resolve().parents[2] / "prisma" / "data" / "dev.db"
_JUNK = re.compile(r"[^가-힣a-zA-Z0-9]")


def is_junk(body: str) -> bool:
    return len(_JUNK.sub("", body)) < 2


def load_docs(name_like: str, db_path: Path = DB_PATH) -> dict:
    """식당명 부분일치로 검색가능(임베딩 있는) 리뷰 코퍼스 로드. junk·중복 제외."""
    con = sqlite3.connect(str(db_path))
    row = con.execute(
        "SELECT id, name, placeId FROM restaurants WHERE name LIKE ? ORDER BY name LIMIT 1",
        (f"%{name_like}%",),
    ).fetchone()
    if not row:
        con.close()
        raise SystemExit(f"식당 없음: {name_like}")
    rid, name, place_id = row
    rows = con.execute(
        """SELECT rs.reviewId, rs.embeddingJson, rs.aspectsJson, vr.body, vr.rating
           FROM review_summaries rs JOIN visitor_reviews vr ON vr.id = rs.reviewId
           WHERE vr.restaurantId = ? AND rs.embeddingJson IS NOT NULL""",
        (rid,),
    ).fetchall()
    con.close()

    seen, ids, bodies, vecs, aspects = set(), [], [], [], []
    for review_id, emb, asp, body, rating in rows:
        b = (body or "").strip()
        if is_junk(b) or b in seen:
            continue
        try:
            v = json.loads(emb)
        except (TypeError, json.JSONDecodeError):
            continue
        if not v:
            continue
        seen.add(b)
        ids.append(review_id)
        bodies.append(b)
        vecs.append(v)
        try:
            aspects.append(json.loads(asp) if asp else {})
        except (TypeError, json.JSONDecodeError):
            aspects.append({})
    X = np.asarray(vecs, dtype=np.float64)
    if len(X):
        X /= np.where(np.linalg.norm(X, axis=1, keepdims=True) == 0, 1.0, np.linalg.norm(X, axis=1, keepdims=True))
    return {"name": name, "placeId": place_id, "ids": ids, "bodies": bodies, "X": X, "aspects": aspects}


def reduce_umap(X: np.ndarray, n_neighbors=15, n_components=5, seed=42):
    """UMAP 차원축소(파라미터 스윕 시 식당당 1회 재사용)."""
    from umap import UMAP

    n = len(X)
    return UMAP(
        n_neighbors=min(n_neighbors, n - 1),
        n_components=min(n_components, n - 2),
        metric="cosine",
        random_state=seed,
    ).fit_transform(X)


def hdbscan_on(reduced, min_cluster_size: int):
    import hdbscan

    return np.asarray(
        hdbscan.HDBSCAN(
            min_cluster_size=min_cluster_size, metric="euclidean", cluster_selection_method="eom"
        ).fit_predict(reduced)
    )


def cluster(X: np.ndarray, min_cluster_size: int, n_neighbors=15, n_components=5, seed=42):
    """UMAP→HDBSCAN. 운영과 동일. 반환: labels(np.array, -1=노이즈)."""
    return hdbscan_on(reduce_umap(X, n_neighbors, n_components, seed), min_cluster_size)


def ctfidf_top(labels, bodies, clusters_ids, topn=8):
    from sklearn.feature_extraction.text import CountVectorizer

    labels = np.asarray(labels)
    try:
        cv = CountVectorizer(token_pattern=r"(?u)\b\w\w+\b", min_df=2)
        counts = cv.fit_transform(bodies)
    except ValueError:
        return {c: [] for c in clusters_ids}
    vocab = np.asarray(cv.get_feature_names_out())
    cc = np.vstack([np.asarray(counts[labels == c].sum(axis=0)).ravel() for c in clusters_ids])
    f_t = cc.sum(axis=0)
    A = cc.sum(axis=1).mean() or 1.0
    score = (cc / np.maximum(cc.sum(axis=1, keepdims=True), 1)) * np.log(1.0 + A / np.maximum(f_t, 1))
    return {c: [str(vocab[j]) for j in np.argsort(score[ci])[::-1][:topn]] for ci, c in enumerate(clusters_ids)}


def neg_score(asp: dict) -> int:
    """리뷰의 극성 점수 = #neg - #pos. >0 이면 부정 우세."""
    return sum(1 for p in asp.values() if p == "neg") - sum(1 for p in asp.values() if p == "pos")


def metrics(labels, X, bodies, aspects) -> dict:
    """군집 결과의 객관 지표 묶음."""
    from sklearn.metrics import silhouette_score

    labels = np.asarray(labels)
    n = len(labels)
    cids = sorted(c for c in set(labels) if c >= 0)
    clustered = int(np.sum(labels >= 0))
    out = {
        "n": n,
        "k": len(cids),
        "noise_pct": round(100 * (n - clustered) / n, 1) if n else 0.0,
        "silhouette": None,
        "cohesion": None,
        "separation": None,
        "kw_overlap": None,
        "neg_recall": None,
    }
    if len(cids) < 2:
        return out

    mask = labels >= 0
    try:
        out["silhouette"] = round(float(silhouette_score(X[mask], labels[mask], metric="cosine")), 3)
    except ValueError:
        pass

    # cohesion: 멤버·centroid 평균 코사인. centroids 수집.
    centroids = []
    cohes = []
    for c in cids:
        idx = np.where(labels == c)[0]
        cen = X[idx].mean(axis=0)
        cen /= np.linalg.norm(cen) or 1.0
        centroids.append(cen)
        cohes.append(float(np.mean(X[idx] @ cen)))
    out["cohesion"] = round(float(np.mean(cohes)), 3)
    # separation: 1 - centroid 쌍 평균 코사인.
    pair = [float(centroids[i] @ centroids[j]) for i, j in combinations(range(len(centroids)), 2)]
    out["separation"] = round(1 - float(np.mean(pair)), 3) if pair else None

    # kw_overlap: 상위 키워드 군집 쌍 Jaccard 평균(낮을수록 변별).
    kw = ctfidf_top(labels, bodies, cids, topn=8)
    sets = [set(kw[c]) for c in cids]
    jac = [
        len(sets[i] & sets[j]) / max(1, len(sets[i] | sets[j]))
        for i, j in combinations(range(len(sets)), 2)
    ]
    out["kw_overlap"] = round(float(np.mean(jac)), 3) if jac else None

    # neg_recall: 부정 리뷰가 '부정 드러내는' 군집(멤버 중 부정 우세 비율>=40%)에 든 비율.
    neg_idx = [i for i in range(n) if neg_score(aspects[i]) > 0]
    if neg_idx:
        neg_clusters = set()
        for c in cids:
            idx = np.where(labels == c)[0]
            frac = np.mean([neg_score(aspects[i]) > 0 for i in idx])
            if frac >= 0.4:
                neg_clusters.add(c)
        caught = sum(1 for i in neg_idx if labels[i] in neg_clusters)
        out["neg_recall"] = round(caught / len(neg_idx), 3)
        out["neg_total"] = len(neg_idx)
        out["neg_clusters"] = len(neg_clusters)
    return out
