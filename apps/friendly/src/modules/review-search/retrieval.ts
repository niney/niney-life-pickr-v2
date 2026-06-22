// review-search 순수 검색 헬퍼 — vector-lab 프로토타입에서 검증된 로직 포팅.
// LLM/DB 의존 없는 순수 함수만 둔다(테스트·재사용 용이).

export const RRF_K = 60; // RRF 상수 — 클수록 상위 랭크 가중 완만.

// 리뷰 검색이 도는 유한한 관점 집합. enrich 시 리뷰별 극성을 추출하고
// 질의를 관점+극성으로 매핑해 구조로 매칭(임베딩이 못 잡는 부정/수량 처리).
export const ASPECTS = ['맛', '양', '가격', '주차', '웨이팅', '서비스', '분위기', '위생', '재방문'] as const;
export type Aspect = (typeof ASPECTS)[number];
export type Polarity = 'pos' | 'neg' | 'neu';

// 정보가치 없는 초단문(".", "ㄱ", "끄♡") — 검색 코퍼스에서 제외.
export const isJunk = (body: string): boolean => body.replace(/[^가-힣a-zA-Z0-9]/g, '').length < 2;

export const cosine = (a: number[], b: number[]): number => {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
};

// char 3-gram 토크나이저(단어별) — 한국어 조사 변형을 substring 보다 잘 흡수.
export const tokenizeTrigrams = (text: string): string[] => {
  const out: string[] = [];
  for (const word of text.toLowerCase().split(/\s+/)) {
    const w = word.replace(/[^가-힣a-z0-9]/g, '');
    if (!w) continue;
    if (w.length < 3) out.push(w);
    else for (let i = 0; i + 3 <= w.length; i += 1) out.push(w.slice(i, i + 3));
  }
  return out;
};

// 인메모리 BM25 — dense 와 RRF 융합할 어휘 회수. (검색 단위가 식당이라 인앱으로 충분)
export class Bm25 {
  private readonly df = new Map<string, number>();
  private readonly docs: Array<{ id: string; tf: Map<string, number>; len: number }> = [];
  private readonly avgdl: number;
  private readonly N: number;
  private readonly k1 = 1.5;
  private readonly b = 0.75;

  constructor(items: Array<{ id: string; text: string }>) {
    for (const it of items) {
      const tf = new Map<string, number>();
      for (const t of tokenizeTrigrams(it.text)) tf.set(t, (tf.get(t) ?? 0) + 1);
      for (const t of tf.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
      this.docs.push({ id: it.id, tf, len: [...tf.values()].reduce((a, c) => a + c, 0) });
    }
    this.N = this.docs.length;
    this.avgdl = this.docs.reduce((s, d) => s + d.len, 0) / (this.N || 1);
  }

  // 질의 BM25 점수 — 점수>0 문서만 반환.
  score(query: string): Map<string, number> {
    const qToks = [...new Set(tokenizeTrigrams(query))];
    const idf = new Map<string, number>();
    for (const t of qToks) {
      const df = this.df.get(t) ?? 0;
      idf.set(t, Math.log(1 + (this.N - df + 0.5) / (df + 0.5)));
    }
    const out = new Map<string, number>();
    for (const d of this.docs) {
      let s = 0;
      for (const t of qToks) {
        const tf = d.tf.get(t);
        if (!tf) continue;
        const denom = tf + this.k1 * (1 - this.b + (this.b * d.len) / this.avgdl);
        s += (idf.get(t) ?? 0) * ((tf * (this.k1 + 1)) / denom);
      }
      if (s > 0) out.set(d.id, s);
    }
    return out;
  }
}
