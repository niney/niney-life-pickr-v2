"""probe 2 — 부정("단점") 회수 개선: aspect 극성 주입.

probe_params 가 보였듯 neg_recall 은 모든 파라미터에서 0 — bge-m3 가 극성을 못 잡아
부정 리뷰가 긍정 옆에 박힌다(군집 안 됨). 처방: 저장된 aspectsJson 극성을 9차원
부호 벡터로 만들어 임베딩에 가중(w) 결합한 뒤 군집화 → 부정이 독립 군집을 이루는지
neg_recall 로 측정. w=0 은 기존(베이스라인).

실행: python research/review-clustering/probe_negative.py [식당명=조연탄]
"""

import sys

import numpy as np

from cluster_lib import ctfidf_top, hdbscan_on, load_docs, metrics, neg_score, reduce_umap

# review-search retrieval.ts 의 ASPECTS 와 동일.
ASPECTS = ["맛", "양", "가격", "주차", "웨이팅", "서비스", "분위기", "위생", "재방문"]


def aspect_vec(asp: dict) -> np.ndarray:
    v = np.zeros(len(ASPECTS))
    for i, a in enumerate(ASPECTS):
        p = asp.get(a)
        v[i] = 1.0 if p == "pos" else -1.0 if p == "neg" else 0.0
    return v


def augment(X: np.ndarray, aspects: list, w: float) -> np.ndarray:
    """임베딩(단위벡터)에 극성 벡터(단위화×w)를 concat. w=0 이면 원본."""
    if w == 0:
        return X
    A = np.array([aspect_vec(a) for a in aspects])
    norms = np.linalg.norm(A, axis=1, keepdims=True)
    A = A / np.where(norms == 0, 1.0, norms) * w
    return np.hstack([X, A])


def main():
    name = sys.argv[1] if len(sys.argv) > 1 else "조연탄"
    d = load_docs(name)
    X, bodies, aspects = d["X"], d["bodies"], d["aspects"]
    neg_total = sum(1 for a in aspects if neg_score(a) > 0)
    print(f"식당: {d['name']} · 코퍼스 {len(bodies)}건 · 부정우세 {neg_total}건\n")
    print(f"{'w':>5} {'k':>3} {'noise%':>6} {'negR':>6} {'negCl':>5} {'kwOv':>5} {'silh':>6}")
    print("-" * 44)

    best = None
    for w in [0.0, 0.5, 1.0, 1.5, 2.0, 3.0]:
        reduced = reduce_umap(augment(X, aspects, w))
        labels = hdbscan_on(reduced, 8)
        m = metrics(labels, X, bodies, aspects)  # 지표는 원본 임베딩 공간 기준.
        print(
            f"{w:>5} {m['k']:>3} {m['noise_pct']:>6} {str(m.get('neg_recall')):>6} "
            f"{str(m.get('neg_clusters')):>5} {str(m['kw_overlap']):>5} {str(m['silhouette']):>6}"
        )
        nr = m.get("neg_recall") or 0
        if best is None or nr > best[1]:
            best = (w, nr, labels)

    # 최선 w 에서 형성된 부정 군집 상세.
    w, nr, labels = best
    print(f"\n■ 최선 w={w} (neg_recall={nr}) — 부정 우세 군집 상세")
    cids = sorted(c for c in set(labels) if c >= 0)
    kw = ctfidf_top(labels, bodies, cids)
    for c in cids:
        idx = np.where(labels == c)[0]
        frac = np.mean([neg_score(aspects[i]) > 0 for i in idx])
        if frac < 0.4:
            continue
        rep = idx[0]
        print(f"  • [{len(idx)}건 · 부정비율 {frac:.0%}] kw={','.join(kw[c][:6])}")
        print(f"      예: {bodies[rep][:80]}")
    if nr == 0:
        print("  (부정 우세 군집 없음 — 주입으로도 분리 실패)")


if __name__ == "__main__":
    main()
