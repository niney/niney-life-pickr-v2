"""probe 1 — 교차 식당 파라미터 일반화.

min_cluster_size 를 절대값으로 둘지 리뷰 수 비례로 둘지 결정한다. 크기가 다른
식당 바스켓(large/medium/small)에 여러 정책을 돌려 지표(probe 3)로 비교.
UMAP 은 식당당 1회만(차원축소는 min 과 무관) → HDBSCAN 만 정책별로 교체.

실행: python research/review-clustering/probe_params.py
"""

from cluster_lib import hdbscan_on, load_docs, metrics, reduce_umap

BASKET = ["조연탄", "목동돈가스", "깜장김밥", "충무식", "더기와"]


# 정책: (라벨, min_cluster_size 계산). n = 코퍼스 크기.
def policies(n: int):
    return [
        ("abs5", 5),
        ("abs8", 8),
        ("abs12", 12),
        ("rel3%", max(5, round(n * 0.03))),
        ("rel5%", max(5, round(n * 0.05))),
    ]


def main():
    print(
        f"{'식당':14} {'n':>4} {'정책':6} {'min':>3} {'k':>3} {'noise%':>6} "
        f"{'silh':>6} {'cohes':>6} {'sep':>6} {'kwOv':>5} {'negR':>5}"
    )
    print("-" * 78)
    for name in BASKET:
        d = load_docs(name)
        n = len(d["bodies"])
        if n < 12:
            print(f"{d['name'][:14]:14} {n:>4}  (코퍼스 부족 — 스킵)")
            continue
        reduced = reduce_umap(d["X"])  # 식당당 1회
        seen_min = set()
        for pol, mn in policies(n):
            if mn in seen_min:  # 동일 min 중복 정책은 한 번만(작은 식당은 abs/rel 수렴).
                pol = pol + "*"
            seen_min.add(mn)
            labels = hdbscan_on(reduced, mn)
            m = metrics(labels, d["X"], d["bodies"], d["aspects"])
            print(
                f"{d['name'][:14]:14} {n:>4} {pol:6} {mn:>3} {m['k']:>3} {m['noise_pct']:>6} "
                f"{str(m['silhouette']):>6} {str(m['cohesion']):>6} {str(m['separation']):>6} "
                f"{str(m['kw_overlap']):>5} {str(m['neg_recall']):>5}"
            )
        print()


if __name__ == "__main__":
    main()
