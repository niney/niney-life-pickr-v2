import { PrismaClient } from '@prisma/client';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { isJunk } from '../../src/modules/review-search/retrieval.js';

// ── 리뷰 군집화 비교 probe (TS-경량 측) ──────────────────────────────────────
//
// "비슷한 문맥의 리뷰끼리 묶고 카운팅" 기능을 위해, 이미 DB 에 저장된 bge-m3
// 임베딩(ReviewSummary.embeddingJson)만으로 군집화 품질을 실측한다. 새 임베딩
// 호출·LLM 없음 → 완전 오프라인(DB 만 필요).
//
// 이 파일은 **TS 순수 구현** 두 가지를 돌린다(작은·짧은 한국어 리뷰엔 무거운
// UMAP/HDBSCAN 이 취약할 수 있어, 먼저 가벼운 쪽을 본다):
//   ① 평균연결 응집(agglomerative, average-linkage) + cosine 임계 컷
//   ② 그래프 연결요소(single-linkage = cosine>θ 간선 → connected components)
//
// 동시에 **같은 벡터**를 .tmp/cluster-data.json 으로 export → probe-cluster.py
// (HDBSCAN/BERTopic)가 동일 입력으로 비교하도록(공정성).
//
// 실행: pnpm --filter friendly probe:cluster
//   env: CLUSTER_PLACE(기본 "조연탄"), CLUSTER_MIN(군집 최소 크기, 기본 3),
//        CLUSTER_THRESHOLDS(콤마, 기본 "0.55,0.65,0.72")

const PLACE = process.env.CLUSTER_PLACE ?? '조연탄';
const MIN_CLUSTER = Number(process.env.CLUSTER_MIN ?? 3);
const THRESHOLDS = (process.env.CLUSTER_THRESHOLDS ?? '0.55,0.65,0.72')
  .split(',')
  .map((s) => Number(s.trim()))
  .filter((n) => n > 0 && n < 1);
const EXPORT_PATH = resolve(process.cwd(), '.tmp/cluster-data.json');

interface Doc {
  reviewId: string;
  body: string;
  rating: number | null;
  vec: number[]; // L2 정규화됨 → 코사인 = 내적.
  aspects: Record<string, string>; // 관점→pos|neg|neu
}

const safeParse = <T,>(s: string | null, fallback: T): T => {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};

const normalize = (v: number[]): number[] => {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return v.map((x) => x / n);
};
const dot = (a: number[], b: number[]): number => {
  let s = 0;
  for (let i = 0; i < a.length; i += 1) s += (a[i] ?? 0) * (b[i] ?? 0);
  return s;
};
const trunc = (s: string, n = 64): string => (s.length > n ? `${s.slice(0, n)}…` : s);

// ── 통계/리포트 ─────────────────────────────────────────────────────────────
// labels[i] = 군집 id (-1 = 노이즈/미분류). 카운트·노이즈·대표리뷰 출력.
const report = (name: string, labels: number[], docs: Doc[]): void => {
  const groups = new Map<number, number[]>();
  for (let i = 0; i < labels.length; i += 1) {
    const c = labels[i]!;
    if (c < 0) continue;
    (groups.get(c) ?? groups.set(c, []).get(c)!).push(i);
  }
  // MIN_CLUSTER 미만은 노이즈로 흡수(작은 한국어 리뷰엔 파편 군집이 많음).
  const kept = [...groups.values()].filter((m) => m.length >= MIN_CLUSTER);
  const clustered = kept.reduce((a, m) => a + m.length, 0);
  const noise = docs.length - clustered;
  kept.sort((a, b) => b.length - a.length);

  console.log(`\n■ ${name}`);
  console.log(
    `  군집 ${kept.length}개 · 분류 ${clustered}/${docs.length}건 · ` +
      `노이즈 ${noise}건(${((noise / docs.length) * 100).toFixed(0)}%)` +
      (kept[0] ? ` · 최대군집 ${kept[0].length}건` : ''),
  );
  for (const m of kept.slice(0, 8)) {
    // centroid(정규화 평균) → medoid(센트로이드에 가장 가까운 멤버)로 대표 선정.
    const dim = docs[m[0]!]!.vec.length;
    const c = new Array<number>(dim).fill(0);
    for (const i of m) {
      const v = docs[i]!.vec;
      for (let d = 0; d < dim; d += 1) c[d]! += v[d]!;
    }
    const cN = normalize(c);
    let best = m[0]!;
    let bestSim = -1;
    for (const i of m) {
      const s = dot(docs[i]!.vec, cN);
      if (s > bestSim) {
        bestSim = s;
        best = i;
      }
    }
    // 군집 내 우세 관점(aspectsJson 집계) — 거의 공짜 라벨.
    const asp = new Map<string, number>();
    for (const i of m)
      for (const [k, p] of Object.entries(docs[i]!.aspects))
        asp.set(`${k}:${p}`, (asp.get(`${k}:${p}`) ?? 0) + 1);
    const topAsp = [...asp.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    const aspLabel = topAsp.map(([k, n]) => `${k}×${n}`).join(' ') || '-';
    console.log(`  • [${String(m.length).padStart(3)}건] ${aspLabel}`);
    console.log(`      대표: ${trunc(docs[best]!.body)}`);
  }
};

// ── ② 그래프 연결요소(single-linkage) ───────────────────────────────────────
class UF {
  p: number[];
  constructor(n: number) {
    this.p = Array.from({ length: n }, (_, i) => i);
  }
  find(x: number): number {
    while (this.p[x] !== x) {
      this.p[x] = this.p[this.p[x]!]!;
      x = this.p[x]!;
    }
    return x;
  }
  union(a: number, b: number): void {
    this.p[this.find(a)] = this.find(b);
  }
}

const connectedComponents = (sim: Float32Array, n: number, theta: number): number[] => {
  const uf = new UF(n);
  let idx = 0;
  for (let i = 0; i < n; i += 1)
    for (let j = i + 1; j < n; j += 1) {
      if (sim[idx]! >= theta) uf.union(i, j);
      idx += 1;
    }
  return Array.from({ length: n }, (_, i) => uf.find(i));
};

// ── ① 평균연결 응집(average-linkage) ────────────────────────────────────────
// Lance-Williams 갱신으로 작업행렬 S(클러스터 간 평균 유사도)를 유지하며
// 최대 유사도 쌍을 theta 이상인 동안 병합. n≤~1500 의 probe 규모에 맞춘 단순 구현.
const agglomerative = (pair: Float32Array, n: number, theta: number): number[] => {
  // 대칭 작업행렬(클러스터 평균 유사도). 초기엔 문서 쌍 유사도.
  const S: Float32Array[] = Array.from({ length: n }, () => new Float32Array(n));
  let idx = 0;
  for (let i = 0; i < n; i += 1)
    for (let j = i + 1; j < n; j += 1) {
      S[i]![j] = pair[idx]!;
      S[j]![i] = pair[idx]!;
      idx += 1;
    }
  const active: number[] = Array.from({ length: n }, (_, i) => i);
  const size = new Array<number>(n).fill(1);
  const member = Array.from({ length: n }, (_, i) => [i]);

  while (active.length > 1) {
    // 최대 유사도 쌍 탐색.
    let bi = -1;
    let bj = -1;
    let best = theta;
    for (let a = 0; a < active.length; a += 1)
      for (let b = a + 1; b < active.length; b += 1) {
        const i = active[a]!;
        const j = active[b]!;
        if (S[i]![j]! > best) {
          best = S[i]![j]!;
          bi = i;
          bj = j;
        }
      }
    if (bi < 0) break; // theta 이상 병합쌍 없음 → 종료.
    // bj → bi 병합(가중 평균).
    const ni = size[bi]!;
    const nj = size[bj]!;
    for (const k of active) {
      if (k === bi || k === bj) continue;
      const v = (ni * S[bi]![k]! + nj * S[bj]![k]!) / (ni + nj);
      S[bi]![k] = v;
      S[k]![bi] = v;
    }
    size[bi] = ni + nj;
    member[bi] = member[bi]!.concat(member[bj]!);
    active.splice(active.indexOf(bj), 1);
  }
  const labels = new Array<number>(n).fill(-1);
  let cid = 0;
  for (const root of active) {
    for (const i of member[root]!) labels[i] = cid;
    cid += 1;
  }
  return labels;
};

const main = async (): Promise<void> => {
  const prisma = new PrismaClient();
  const r = await prisma.restaurant.findFirst({
    where: { name: { contains: PLACE } },
    select: { id: true, name: true, placeId: true },
  });
  if (!r) throw new Error(`식당을 찾지 못했습니다: ${PLACE}`);

  const rows = await prisma.reviewSummary.findMany({
    where: { review: { restaurantId: r.id }, embeddingJson: { not: null } },
    select: {
      reviewId: true,
      embeddingJson: true,
      aspectsJson: true,
      review: { select: { body: true, rating: true } },
    },
  });

  const seen = new Set<string>();
  const docs: Doc[] = [];
  for (const row of rows) {
    const body = row.review.body.trim();
    if (isJunk(body) || seen.has(body)) continue;
    seen.add(body);
    const raw = safeParse<number[]>(row.embeddingJson, []);
    if (raw.length === 0) continue;
    docs.push({
      reviewId: row.reviewId,
      body,
      rating: row.review.rating,
      vec: normalize(raw),
      aspects: safeParse<Record<string, string>>(row.aspectsJson, {}),
    });
  }
  await prisma.$disconnect();

  const n = docs.length;
  console.log(`\n식당: ${r.name} (placeId ${r.placeId}) · 군집 대상 리뷰 ${n}건 (중복/junk 제외)`);
  if (n < MIN_CLUSTER * 2) throw new Error('리뷰가 너무 적어 군집화 의미 없음');

  // 상삼각 쌍 유사도 1회 계산(정규화 벡터 내적 = 코사인) → 모든 임계/방법 재사용.
  const pairCount = (n * (n - 1)) / 2;
  const sim = new Float32Array(pairCount);
  let idx = 0;
  for (let i = 0; i < n; i += 1)
    for (let j = i + 1; j < n; j += 1) {
      sim[idx] = dot(docs[i]!.vec, docs[j]!.vec);
      idx += 1;
    }
  // 유사도 분포 — 임계 선택 감각용.
  const sorted = Array.from(sim).sort((a, b) => a - b);
  const pct = (p: number): string => (sorted[Math.floor(p * (sorted.length - 1))] ?? 0).toFixed(3);
  console.log(
    `쌍 유사도 분포: p50=${pct(0.5)} p90=${pct(0.9)} p99=${pct(0.99)} max=${pct(1)} ` +
      `(임계 θ 선택 참고)`,
  );

  // export(동일 입력으로 Python HDBSCAN/BERTopic 비교).
  mkdirSync(dirname(EXPORT_PATH), { recursive: true });
  writeFileSync(
    EXPORT_PATH,
    JSON.stringify({
      restaurant: { id: r.id, name: r.name, placeId: r.placeId },
      docs: docs.map((d) => ({ body: d.body, rating: d.rating, vec: d.vec, aspects: d.aspects })),
    }),
  );
  console.log(`→ 동일 벡터 export: ${EXPORT_PATH} (probe-cluster.py 입력)`);

  for (const theta of THRESHOLDS) {
    console.log(`\n──────── θ = ${theta} ────────`);
    report(`① agglomerative(avg-linkage) θ=${theta}`, agglomerative(sim, n, theta), docs);
    report(`② connected-components θ=${theta}`, connectedComponents(sim, n, theta), docs);
  }
  console.log('\n다음: python research/review-search/probe-cluster.py  (HDBSCAN/BERTopic 비교)');
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
