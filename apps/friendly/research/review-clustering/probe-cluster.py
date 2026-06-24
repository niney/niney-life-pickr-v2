"""리뷰 군집화 비교 probe (Python / HDBSCAN·BERTopic 측).

probe-cluster.ts 가 export 한 .tmp/cluster-data.json(동일 bge-m3 벡터)을 읽어,
"검증된" 토픽모델링 파이프라인으로 같은 식당을 군집화한다. TS-경량(응집/연결요소)과
같은 입력·같은 리포트 포맷으로 찍어 공정 비교한다.

  ③ HDBSCAN 직접  — L2 정규화 벡터에 밀도 기반(노이즈 자동 분리), UMAP 없음
  ④ 풀 BERTopic   — UMAP(차원축소) → HDBSCAN → c-TF-IDF 키워드(검증된 표준)

핵심 관찰점: 작은(~800건)·짧은 한국어 리뷰에서 UMAP/HDBSCAN 이 노이즈로 과다
배출하는지(교과서 강점이 이 규모에서 유지되는지)를 노이즈% 로 본다.

실행:
  python research/review-search/probe-cluster.py
  env: CLUSTER_MIN(최소 군집 크기, 기본 10)

의존성(미설치 시 안내): pip install bertopic hdbscan umap-learn scikit-learn numpy
"""

import json
import os
import re
import subprocess
import sys
from pathlib import Path

import numpy as np

DATA_PATH = Path(__file__).resolve().parents[2] / ".tmp" / "cluster-data.json"
MIN_CLUSTER = int(os.environ.get("CLUSTER_MIN", "10"))
# (b) min_cluster_size 스윕 — 노이즈% vs 토픽 수 트레이드오프 관찰.
SWEEP = [int(s) for s in os.environ.get("CLUSTER_SWEEP", "5,8,10,15,20").split(",")]
# (a) LLM 한 줄 라벨링 — claude -p 헤드리스(키 불필요). 0 으로 끄기.
LABEL = os.environ.get("CLUSTER_LABEL", "1") != "0"


def load():
    if not DATA_PATH.exists():
        sys.exit(f"입력 없음: {DATA_PATH}\n먼저 `pnpm --filter friendly probe:cluster` 로 export 하세요.")
    data = json.loads(DATA_PATH.read_text())
    docs = data["docs"]
    X = np.asarray([d["vec"] for d in docs], dtype=np.float32)
    bodies = [d["body"] for d in docs]
    aspects = [d.get("aspects", {}) for d in docs]
    return data["restaurant"], X, bodies, aspects


def trunc(s, n=64):
    return s if len(s) <= n else s[:n] + "…"


def reps(labels, X, bodies, c, k=3):
    """군집 c 의 대표 리뷰 k개(centroid 에 가까운 순)."""
    labels = np.asarray(labels)
    idx = np.where(labels == c)[0]
    centroid = X[idx].mean(axis=0)
    centroid /= np.linalg.norm(centroid) or 1.0
    order = idx[np.argsort(X[idx] @ centroid)[::-1][:k]]
    return [bodies[i] for i in order]


def report(name, labels, X, bodies, aspects, keywords=None, names=None):
    """labels: np.array, -1 = 노이즈. TS report 와 같은 포맷. names: id→{label,tone}."""
    labels = np.asarray(labels)
    names = names or {}
    uniq = [c for c in sorted(set(labels)) if c >= 0]
    sizes = {c: int(np.sum(labels == c)) for c in uniq}
    kept = sorted([c for c in uniq if sizes[c] >= MIN_CLUSTER], key=lambda c: -sizes[c])
    clustered = sum(sizes[c] for c in kept)
    n = len(bodies)
    noise = n - clustered

    print(f"\n■ {name}")
    top = f" · 최대군집 {sizes[kept[0]]}건" if kept else ""
    print(f"  군집 {len(kept)}개 · 분류 {clustered}/{n}건 · 노이즈 {noise}건({noise*100//n}%){top}")

    for c in kept[:10]:
        idx = np.where(labels == c)[0]
        rep = reps(labels, X, bodies, c, 1)[0]
        # 우세 관점(aspectsJson 집계).
        asp = {}
        for i in idx:
            for k, p in aspects[i].items():
                asp[f"{k}:{p}"] = asp.get(f"{k}:{p}", 0) + 1
        top_asp = sorted(asp.items(), key=lambda kv: -kv[1])[:3]
        asp_label = " ".join(f"{k}×{v}" for k, v in top_asp) or "-"
        kw = "  ⟨" + ", ".join(keywords.get(c, [])[:6]) + "⟩" if keywords else ""
        nm = names.get(c)
        title = f"「{nm['label']}」({nm.get('tone','?')}) " if nm else ""
        print(f"  • [{sizes[c]:>3}건] {title}{asp_label}{kw}")
        print(f"      대표: {trunc(rep)}")


def run_hdbscan(X, bodies, aspects):
    try:
        import hdbscan
    except ImportError:
        print("\n■ ③ HDBSCAN — 미설치(pip install hdbscan)")
        return
    # L2 정규화 벡터라 euclidean 이 cosine 과 단조 → euclidean 사용.
    clusterer = hdbscan.HDBSCAN(
        min_cluster_size=MIN_CLUSTER, metric="euclidean", cluster_selection_method="eom"
    )
    labels = clusterer.fit_predict(X.astype(np.float64))
    report(f"③ HDBSCAN 직접(min_cluster_size={MIN_CLUSTER})", labels, X, bodies, aspects)


def ctfidf_keywords(labels, bodies, topn=6):
    """BERTopic 의 class-based TF-IDF — 군집을 한 문서로 보고 변별 키워드 추출.
    c-tf-idf_{t,c} = tf_{t,c} * log(1 + A / f_t), A=군집평균 단어수, f_t=전체 빈도."""
    from sklearn.feature_extraction.text import CountVectorizer

    labels = np.asarray(labels)
    cv = CountVectorizer(token_pattern=r"(?u)\b\w\w+\b", min_df=3)
    counts = cv.fit_transform(bodies)  # docs × vocab
    vocab = np.asarray(cv.get_feature_names_out())
    clusters = sorted(c for c in set(labels) if c >= 0)
    # 군집별 단어합.
    class_count = np.vstack([np.asarray(counts[labels == c].sum(axis=0)).ravel() for c in clusters])
    f_t = class_count.sum(axis=0)  # 전체 단어 빈도
    A = class_count.sum(axis=1).mean() or 1.0
    tf = class_count / np.maximum(class_count.sum(axis=1, keepdims=True), 1)
    idf = np.log(1.0 + A / np.maximum(f_t, 1))
    score = tf * idf
    out = {}
    for ci, c in enumerate(clusters):
        top = np.argsort(score[ci])[::-1][:topn]
        out[c] = [vocab[j] for j in top]
    return out


def llm_labels(labels, X, bodies, aspects, keywords):
    """(a) 각 군집에 사람이 읽는 한 줄 라벨 + tone. claude -p 헤드리스로 1콜(전 군집 일괄).
    probe-eval 의 EVAL_JUDGE=claude 패턴 재사용 — API 키 불필요, 운영 Ollama 와 별개."""
    labels = np.asarray(labels)
    clusters = sorted(c for c in set(labels) if c >= 0 and np.sum(labels == c) >= MIN_CLUSTER)
    blocks = []
    for c in clusters:
        cnt = int(np.sum(labels == c))
        kw = ", ".join(keywords.get(c, [])[:6])
        samples = "\n".join(f"    - {trunc(s, 80)}" for s in reps(labels, X, bodies, c, 3))
        blocks.append(f"[군집 {c}] {cnt}건 · 키워드: {kw}\n{samples}")
    prompt = (
        "다음은 한 식당 리뷰를 의미별로 자동 군집화한 결과다. 각 군집을 대표하는 한국어 라벨을 "
        "5~12자 명사구로 붙여라(예: '웨이팅이 긴 편', '직접 구워주는 서비스', '두툼한 고기'). "
        "키워드와 예시 리뷰를 근거로 하고, 군집마다 tone 을 긍정|부정|혼합|중립 중 하나로 판정하라. "
        "다른 설명 없이 JSON 배열만 출력: "
        '[{"id":<군집번호>,"label":"...","tone":"..."}]\n\n' + "\n\n".join(blocks)
    )
    try:
        out = subprocess.run(
            ["claude", "-p", prompt, "--output-format", "json"],
            capture_output=True, text=True, timeout=180,
        )
        result = json.loads(out.stdout).get("result", "")
        m = re.search(r"\[.*\]", result, re.S)  # 마크다운 펜스 등 제거.
        arr = json.loads(m.group(0)) if m else []
        return {int(it["id"]): it for it in arr}
    except Exception as e:  # noqa: BLE001 — probe 라 실패해도 키워드 라벨로 진행.
        print(f"  (LLM 라벨 건너뜀: {e})")
        return {}


def run_bertopic(X, bodies, aspects):
    """풀 BERTopic 파이프라인을 직접 구성(UMAP→HDBSCAN→c-TF-IDF).
    bertopic 패키지는 torch/sentence-transformers 를 끌고 와 무겁고, 우리는 임베딩이
    이미 있으므로 동일 파이프라인을 가벼운 의존성으로 재현한다(결과 동치)."""
    try:
        from umap import UMAP
        import hdbscan
    except ImportError as e:
        print(f"\n■ ④ BERTopic식 — 미설치({e.name}). pip install umap-learn hdbscan")
        return
    # 검증된 표준: 먼저 UMAP 으로 5차원 축소(밀도 군집 안정화) → HDBSCAN.
    # UMAP 은 1회만 — 스윕은 같은 축소본에 HDBSCAN(min_cluster_size)만 바꿔 공정 비교.
    reduced = UMAP(n_neighbors=15, n_components=5, metric="cosine", random_state=42).fit_transform(
        X.astype(np.float64)
    )

    def cluster(m):
        return hdbscan.HDBSCAN(
            min_cluster_size=m, metric="euclidean", cluster_selection_method="eom"
        ).fit_predict(reduced)

    # (b) min_cluster_size 스윕.
    print("\n■ ④ BERTopic식 — min_cluster_size 스윕 (UMAP 고정, HDBSCAN만 변경)")
    print("   m  | 군집 | 노이즈")
    for m in SWEEP:
        lab = np.asarray(cluster(m))
        nc = len([c for c in set(lab) if c >= 0 and np.sum(lab == c) >= m])
        noise = int(np.sum(lab < 0))
        print(f"  {m:>3} | {nc:>4} | {noise*100//len(bodies):>3}% ({noise}건)")

    # 선택값(CLUSTER_MIN)으로 상세 + (a) LLM 라벨.
    labels = cluster(MIN_CLUSTER)
    keywords = ctfidf_keywords(labels, bodies)
    names = llm_labels(labels, X, bodies, aspects, keywords) if LABEL else {}
    report(
        f"④ BERTopic식 + 라벨 (min_cluster_size={MIN_CLUSTER})",
        labels, X, bodies, aspects, keywords, names,
    )


def main():
    r, X, bodies, aspects = load()
    print(f"\n식당: {r['name']} (placeId {r['placeId']}) · 군집 대상 {len(bodies)}건 · dim {X.shape[1]}")
    print(f"min_cluster_size = {MIN_CLUSTER}")
    run_hdbscan(X, bodies, aspects)
    run_bertopic(X, bodies, aspects)


if __name__ == "__main__":
    main()
