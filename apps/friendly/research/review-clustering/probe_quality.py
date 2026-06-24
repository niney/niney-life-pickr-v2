"""probe 3 — 객관적 품질 지표 측정 자 검증.

운영 파라미터(min_cluster_size=8, UMAP 15/5)로 한 식당을 군집화하고 지표를 찍어
측정 자가 합리적인지(silhouette>0, cohesion 높음, kw_overlap 낮음 등) 확인한다.

실행: python research/review-clustering/probe_quality.py [식당명=조연탄]
"""

import sys

from cluster_lib import cluster, metrics, load_docs


def main():
    name = sys.argv[1] if len(sys.argv) > 1 else "조연탄"
    d = load_docs(name)
    print(f"식당: {d['name']} (placeId {d['placeId']}) · 코퍼스 {len(d['bodies'])}건")
    labels = cluster(d["X"], min_cluster_size=8)
    m = metrics(labels, d["X"], d["bodies"], d["aspects"])
    print("\n■ 지표 (min_cluster_size=8, UMAP 15/5)")
    for k, v in m.items():
        print(f"  {k:12} = {v}")
    print(
        "\n해석: silhouette↑(분리 좋음) · cohesion↑(군집 응집) · separation↑(군집 간 멈) "
        "· kw_overlap↓(키워드 변별) · neg_recall↑(부정 포착)"
    )


if __name__ == "__main__":
    main()
