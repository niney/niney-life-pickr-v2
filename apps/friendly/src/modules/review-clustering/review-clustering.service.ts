import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import type { PrismaClient } from '@prisma/client';
import type {
  ClusterToneType,
  ReviewClusterBgResultType,
  ReviewClusterPendingResultType,
  ReviewClusterRunResultType,
  ReviewClusterStatusListType,
  ReviewClusterStatusQueryType,
  ReviewClustersResultType,
} from '@repo/api-contract';
import type { AiConfigService } from '../ai/ai.config.service.js';
import { isJunk } from '../review-search/retrieval.js';

// ─────────────────────────────────────────────────────────────────────────────
// review-clustering — "비슷한 문맥의 리뷰끼리 묶고 카운팅". 저장된 bge-m3 임베딩
// (ReviewSummary.embeddingJson)으로 UMAP→HDBSCAN→c-TF-IDF(Python 배치)를 돌려
// 토픽 군집을 만들고, LLM 한 줄 라벨을 붙여 ReviewCluster 로 영속한다.
//
// 분업(probe 에서 검증): Python(scripts/cluster_compute.py)=수학만, Node=코퍼스
// 로드·LLM 라벨(운영 Ollama chatJson)·DB 영속. 계산은 배치(어드민/크롤후 훅)로만 —
// 공개 API 는 저장 결과 읽기 전용(질의 비용 0).
// ─────────────────────────────────────────────────────────────────────────────

const CLUSTERING_VERSION = 3; // ↑시 재계산. v2:극성주입 v3:corpusSize(자동 게이트)
const MIN_REVIEWS = 30; // 이보다 적으면 군집화 의미 없음 → 스킵.
// 자동 군집화(요약 종료 훅) on/off. Python 준비 전 코드만 배포하거나 churn/비용 제어용.
const AUTO_ENABLED = (process.env.CLUSTER_AUTO_ENABLED ?? 'true') !== 'false';
// 자동 재군집 게이트: 마지막 군집 이후 검색가능 리뷰가 max(GATE_MIN, base×GATE_PCT) 이상
// 늘었을 때만 재군집(비용·라벨 churn 방지). 첫 군집·어드민 수동은 게이트 무시.
const GATE_PCT = Number(process.env.CLUSTER_GATE_PCT) || 0.2;
const GATE_MIN = Number(process.env.CLUSTER_GATE_MIN) || 20;
const MIN_CLUSTER_SIZE = Number(process.env.CLUSTER_MIN_SIZE) || 8; // probe sweet spot(절대값).
// 극성 주입(probe 2): 부정 리뷰가 충분(군집 형성 가능)할 때만 임베딩에 aspect 극성을
// 가중 결합 → 부정("단점") 군집 회수(neg_recall 0→0.84). 부정 적은 식당엔 주입 안 함
// (불필요한 노이즈 증가 방지). 임계는 부정이 한 군집을 이룰 만큼.
const ASPECT_WEIGHT = Number(process.env.CLUSTER_ASPECT_WEIGHT) || 0.5;
const NEG_INJECT_MIN = Math.max(MIN_CLUSTER_SIZE, 12);
// 리뷰 극성 점수 = #neg - #pos. >0 이면 부정 우세.
const negScore = (asp: Record<string, string>): number =>
  Object.values(asp).filter((p) => p === 'neg').length -
  Object.values(asp).filter((p) => p === 'pos').length;
const PYTHON_BIN = process.env.CLUSTER_PYTHON_BIN?.trim() || 'python3';
const PY_TIMEOUT_MS = Number(process.env.CLUSTER_PY_TIMEOUT_MS) || 120_000;
// cwd 기준(친절 앱은 apps/friendly 에서 구동). env 로 override 가능.
const PY_SCRIPT =
  process.env.CLUSTER_SCRIPT?.trim() || resolve(process.cwd(), 'scripts/cluster_compute.py');
const REP_PER_CLUSTER = 3;

interface Doc {
  reviewId: string;
  body: string;
  rating: number | null;
  vec: number[];
  aspects: Record<string, string>;
}
// Python 출력 — clusters 는 size 내림차순.
interface ComputeResult {
  ok: boolean;
  error?: string;
  params?: { minClusterSize: number; n: number; reduced: number };
  clusters: Array<{ members: string[]; keywords: string[]; repReviewIds: string[] }>;
  noise: string[];
}

const safeParse = <T,>(s: string | null, fallback: T): T => {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};

const TONES: ClusterToneType[] = ['positive', 'negative', 'mixed', 'neutral'];

export class ReviewClusteringService {
  // 현재 군집화 진행 중인 restaurantId (어드민 상태 표시·중복 가드). enrich 의 진행
  // Map 미러이되, 군집은 식당당 단일 작업이라 진행률 없이 Set 으로 충분.
  private readonly clustering = new Set<string>();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly aiConfig: AiConfigService,
  ) {}

  // 식당의 검색가능(임베딩 있는) 리뷰를 코퍼스로 로드. junk·중복 제외.
  private async loadDocs(restaurantId: string): Promise<Doc[]> {
    const rows = await this.prisma.reviewSummary.findMany({
      where: { review: { restaurantId }, embeddingJson: { not: null } },
      select: {
        reviewId: true,
        embeddingJson: true,
        aspectsJson: true,
        review: { select: { body: true, rating: true } },
      },
    });
    const seen = new Set<string>();
    const docs: Doc[] = [];
    for (const r of rows) {
      const body = r.review.body.trim();
      if (isJunk(body) || seen.has(body)) continue;
      const vec = safeParse<number[]>(r.embeddingJson, []);
      if (vec.length === 0) continue;
      seen.add(body);
      docs.push({
        reviewId: r.reviewId,
        body,
        rating: r.review.rating,
        vec,
        aspects: safeParse<Record<string, string>>(r.aspectsJson, {}),
      });
    }
    return docs;
  }

  // Python 계산기 호출 — payload 를 stdin 으로 주고 stdout JSON 을 받는다.
  private runPython(docs: Doc[]): Promise<ComputeResult> {
    // 조건부 극성 주입: 부정 리뷰가 임계 이상일 때만 weight 부여(probe 2 일반화 검증).
    const negTotal = docs.filter((d) => negScore(d.aspects) > 0).length;
    const aspectWeight = negTotal >= NEG_INJECT_MIN ? ASPECT_WEIGHT : 0;
    const payload = JSON.stringify({
      minClusterSize: MIN_CLUSTER_SIZE,
      aspectWeight,
      docs: docs.map((d) => ({ reviewId: d.reviewId, body: d.body, vec: d.vec, aspects: d.aspects })),
    });
    return new Promise((resolveP, rejectP) => {
      const child = spawn(PYTHON_BIN, [PY_SCRIPT], { stdio: ['pipe', 'pipe', 'pipe'] });
      let out = '';
      let err = '';
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        rejectP(new Error(`cluster_compute 타임아웃(${PY_TIMEOUT_MS}ms)`));
      }, PY_TIMEOUT_MS);
      child.stdout.on('data', (c) => (out += c));
      child.stderr.on('data', (c) => (err += c));
      child.on('error', (e) => {
        clearTimeout(timer);
        rejectP(new Error(`Python 실행 실패(${PYTHON_BIN}): ${e.message}`));
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code !== 0 && !out) {
          rejectP(new Error(`cluster_compute 종료코드 ${code}: ${err.slice(0, 300)}`));
          return;
        }
        try {
          resolveP(JSON.parse(out) as ComputeResult);
        } catch {
          rejectP(new Error(`cluster_compute 출력 파싱 실패: ${out.slice(0, 200)}`));
        }
      });
      child.stdin.write(payload);
      child.stdin.end();
    });
  }

  // 군집별 키워드+대표리뷰로 한 줄 라벨+tone 을 LLM 1콜(일괄)로. 운영 Ollama chat.
  // 인덱스(=size 순위)를 id 로 쓴다. 실패 시 빈 맵 → 키워드 기반 폴백 라벨.
  private async labelClusters(
    clusters: ComputeResult['clusters'],
    bodyById: Map<string, string>,
  ): Promise<Map<number, { label: string; tone: ClusterToneType }>> {
    const resolved = await this.aiConfig.getResolved('ollama-cloud', 'chat');
    if (!resolved?.defaultModel) return new Map();

    const blocks = clusters.map((c, i) => {
      const reps = c.repReviewIds
        .slice(0, REP_PER_CLUSTER)
        .map((id) => `    - ${(bodyById.get(id) ?? '').slice(0, 80)}`)
        .join('\n');
      return `[군집 ${i}] ${c.members.length}건 · 키워드: ${c.keywords.slice(0, 6).join(', ')}\n${reps}`;
    });
    const prompt =
      '다음은 한 식당 리뷰를 의미별로 자동 군집화한 결과다. 각 군집을 대표하는 한국어 라벨을 ' +
      "5~12자 명사구로 붙여라(예: '웨이팅이 긴 편', '직접 구워주는 서비스', '두툼한 고기'). " +
      '키워드와 예시 리뷰를 근거로 하고, 군집마다 tone 을 positive|negative|mixed|neutral 중 하나로 ' +
      '판정하라. 다른 설명 없이 JSON 배열만 출력하라 — 각 원소는 ' +
      '{"id": 군집번호, "label": "라벨", "tone": "tone"} 형식.\n\n' +
      blocks.join('\n\n');

    try {
      // gpt-oss 등은 Ollama format 스키마를 무시하고 마크다운+최상위 배열로 답하므로,
      // format 을 강제하지 않고 review-search.chatJson 과 같은 견고 파싱을 쓴다.
      const res = await fetch(`${resolved.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${resolved.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: resolved.defaultModel,
          stream: false,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!res.ok) return new Map();
      const json = (await res.json().catch(() => null)) as { message?: { content?: string } } | null;
      const content = (json?.message?.content ?? '').replace(/```(?:json)?/gi, '').trim();
      // 배열([) 또는 객체({) 어느 쪽으로 와도 첫 구조를 통째로 잡는다.
      const m = content.match(/[[{][\s\S]*[\]}]/);
      const parsed = JSON.parse(m ? m[0] : content) as unknown;
      // 최상위 배열, 또는 {clusters:[...]} 래퍼 둘 다 허용.
      const arr: Array<Record<string, unknown>> = Array.isArray(parsed)
        ? (parsed as Array<Record<string, unknown>>)
        : (((parsed as { clusters?: unknown }).clusters as Array<Record<string, unknown>>) ?? []);
      const map = new Map<number, { label: string; tone: ClusterToneType }>();
      arr.forEach((it, idx) => {
        // 키는 모델에 따라 id/cluster/index — 없으면 등장 순서로.
        const raw = it.id ?? it.cluster ?? it.index;
        const id = typeof raw === 'number' ? raw : idx;
        const label = typeof it.label === 'string' ? it.label.trim() : '';
        const toneRaw = typeof it.tone === 'string' ? it.tone : '';
        const tone = (TONES as string[]).includes(toneRaw) ? (toneRaw as ClusterToneType) : 'neutral';
        if (label) map.set(id, { label, tone });
      });
      return map;
    } catch {
      return new Map();
    }
  }

  // 군집 영속(통째 교체). 기존 군집 삭제(멤버 clusterId 는 FK SetNull) → 신규 insert
  // → 멤버 clusterId 배정. 한 트랜잭션.
  private async persist(
    restaurantId: string,
    clusters: ComputeResult['clusters'],
    labels: Map<number, { label: string; tone: ClusterToneType }>,
    docById: Map<string, Doc>,
    corpusSize: number,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.reviewCluster.deleteMany({ where: { restaurantId } });
      for (let i = 0; i < clusters.length; i += 1) {
        const c = clusters[i]!;
        const named = labels.get(i);
        // 집계 관점 — "맛:pos" → count, 상위 8.
        const aspCount = new Map<string, number>();
        for (const id of c.members) {
          const asp = docById.get(id)?.aspects ?? {};
          for (const [k, p] of Object.entries(asp))
            aspCount.set(`${k}:${p}`, (aspCount.get(`${k}:${p}`) ?? 0) + 1);
        }
        const aspects = [...aspCount.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([key, count]) => ({ key, count }));
        const created = await tx.reviewCluster.create({
          data: {
            restaurantId,
            ordinal: i,
            label: named?.label ?? c.keywords[0] ?? `주제 ${i + 1}`,
            tone: named?.tone ?? 'neutral',
            size: c.members.length,
            keywordsJson: JSON.stringify(c.keywords),
            repReviewIdsJson: JSON.stringify(c.repReviewIds.slice(0, REP_PER_CLUSTER)),
            aspectsJson: JSON.stringify(aspects),
            clusterVersion: CLUSTERING_VERSION,
            corpusSize,
          },
          select: { id: true },
        });
        await tx.reviewSummary.updateMany({
          where: { reviewId: { in: c.members } },
          data: { clusterId: created.id },
        });
      }
    });
  }

  // restaurantId 단위 군집화 실행(동기). 스킵 사유는 결과로 반환(throw 아님 — 어드민
  // 가시성·post-summary 훅 graceful). 정상 경로만 throw 가능(상위에서 catch).
  async runForRestaurant(restaurantId: string): Promise<ReviewClusterRunResultType> {
    const startedAt = Date.now();
    const skip = (reason: string, total = 0): ReviewClusterRunResultType => ({
      clusters: 0,
      noise: 0,
      total,
      skipped: true,
      reason,
      ms: Date.now() - startedAt,
    });

    const docs = await this.loadDocs(restaurantId);
    if (docs.length < MIN_REVIEWS)
      return skip(`리뷰 부족 또는 enrich 미완료 (검색가능 ${docs.length}건 < ${MIN_REVIEWS})`, docs.length);

    let computed: ComputeResult;
    try {
      computed = await this.runPython(docs);
    } catch (e) {
      // python3/의존성 미설치 등 — graceful 스킵(공개 탭은 미표시).
      return skip(`계산 엔진 오류: ${e instanceof Error ? e.message : String(e)}`, docs.length);
    }
    if (!computed.ok) return skip(`계산 실패: ${computed.error ?? 'unknown'}`, docs.length);
    if (computed.clusters.length === 0) return skip('군집 형성 안 됨(전부 노이즈)', docs.length);

    const docById = new Map(docs.map((d) => [d.reviewId, d]));
    const bodyById = new Map(docs.map((d) => [d.reviewId, d.body]));
    const labels = await this.labelClusters(computed.clusters, bodyById);
    // 자동 재군집 게이트 기준값 — 검색가능(raw, 게이트 카운트와 동일 척도) 리뷰 수.
    const corpusSize = await this.countEnriched(restaurantId);
    await this.persist(restaurantId, computed.clusters, labels, docById, corpusSize);

    return {
      clusters: computed.clusters.length,
      noise: computed.noise.length,
      total: docs.length,
      skipped: false,
      reason: null,
      ms: Date.now() - startedAt,
    };
  }

  // placeId → 식당 해석 후 **자동** 군집화(요약 종료 훅). 피처 플래그 + 재군집 게이트
  // 적용 — 첫 군집이거나 리뷰가 충분히 늘었을 때만(어드민 수동은 게이트 없이 강제).
  async ensureClusteredByPlaceId(placeId: string): Promise<void> {
    if (!AUTO_ENABLED) return;
    const r = await this.prisma.restaurant.findUnique({ where: { placeId }, select: { id: true } });
    if (!r) return;
    if (this.clustering.has(r.id)) return; // 이미 진행 중
    if (!(await this.shouldRecluster(r.id))) return; // 최신 — 스킵(churn·비용 방지)
    await this.runTracked(r.id);
  }

  // 자동 재군집 게이트: 현재 버전 군집이 없으면(첫 군집·버전↑) 무조건, 있으면 마지막
  // 군집 이후 검색가능 리뷰가 max(GATE_MIN, base×GATE_PCT) 이상 늘었을 때만 true.
  private async shouldRecluster(restaurantId: string): Promise<boolean> {
    const existing = await this.prisma.reviewCluster.findFirst({
      where: { restaurantId, clusterVersion: CLUSTERING_VERSION },
      select: { corpusSize: true },
    });
    if (!existing) return true;
    const current = await this.countEnriched(restaurantId);
    const base = existing.corpusSize || 0;
    return current - base >= Math.max(GATE_MIN, base * GATE_PCT);
  }

  // ── 상태 관리 (어드민) — enrich 상태 미러링 ───────────────────────────────────

  // 단일 식당 백그라운드 군집화(즉시 반환). 이미 진행 중이면 no-op.
  clusterInBackground(restaurantId: string): ReviewClusterBgResultType {
    const already = this.clustering.has(restaurantId);
    if (!already) void this.runTracked(restaurantId);
    return { started: !already, inProgress: true };
  }

  // 군집화 가능(enrich≥MIN_REVIEWS)하나 현재 버전 군집이 없는 식당 일괄 백그라운드(순차).
  async clusterAllEligibleInBackground(): Promise<ReviewClusterPendingResultType> {
    const enrichedBy = await this.countEnrichedByRestaurant();
    const done = await this.prisma.reviewCluster.groupBy({
      by: ['restaurantId'],
      where: { clusterVersion: CLUSTERING_VERSION },
    });
    const doneSet = new Set(done.map((d) => d.restaurantId));
    const pending = [...enrichedBy.entries()]
      .filter(([id, n]) => n >= MIN_REVIEWS && !doneSet.has(id))
      .map(([id]) => id);
    if (pending.length === 0) return { queued: 0 };
    void (async () => {
      for (const id of pending) await this.runTracked(id); // 순차 — runTracked 가 중복 가드
    })();
    return { queued: pending.length };
  }

  // 진행상태 Set 에 등록하고 실행. 중복 시 no-op. (어드민 수동·일괄·자동 공용 가드.)
  private async runTracked(restaurantId: string): Promise<void> {
    if (this.clustering.has(restaurantId)) return;
    this.clustering.add(restaurantId);
    try {
      await this.runForRestaurant(restaurantId);
    } catch {
      /* 실패는 상태(군집됨 여부)로 드러남 */
    } finally {
      this.clustering.delete(restaurantId);
    }
  }

  // 식당별 군집 상태(검색가능 수·군집됨·진행중). enrichStatus 미러링.
  async clusterStatus(query: ReviewClusterStatusQueryType): Promise<ReviewClusterStatusListType> {
    const restaurants = await this.prisma.restaurant.findMany({
      where: { visitorReviews: { some: {} } },
      select: { id: true, placeId: true, name: true, _count: { select: { visitorReviews: true } } },
    });
    const enrichedBy = await this.countEnrichedByRestaurant(restaurants.map((r) => r.id));
    const clusterRows = await this.prisma.reviewCluster.groupBy({
      by: ['restaurantId'],
      where: { clusterVersion: CLUSTERING_VERSION },
      _count: { _all: true },
      _max: { createdAt: true },
    });
    const clusterBy = new Map(
      clusterRows.map((c) => [c.restaurantId, { count: c._count._all, at: c._max.createdAt }]),
    );

    let rows = restaurants.map((r) => {
      const enriched = enrichedBy.get(r.id) ?? 0;
      const cl = clusterBy.get(r.id);
      return {
        restaurantId: r.id,
        placeId: r.placeId,
        name: r.name,
        totalReviews: r._count.visitorReviews,
        enrichedReviews: enriched,
        eligible: enriched >= MIN_REVIEWS,
        clustered: !!cl,
        clusterCount: cl?.count ?? 0,
        clusteredAt: cl?.at ? cl.at.toISOString() : null,
        inProgress: this.clustering.has(r.id),
      };
    });
    const eligibleCount = rows.filter((r) => r.eligible).length;
    const clusteredCount = rows.filter((r) => r.clustered).length;

    const q = query.q?.trim().toLowerCase();
    if (q) rows = rows.filter((r) => r.name.toLowerCase().includes(q));
    // 가능하나 미군집 우선 → 검색가능 많은 순(작업 우선순위).
    rows.sort(
      (a, b) =>
        Number(a.clustered) - Number(b.clustered) ||
        Number(b.eligible) - Number(a.eligible) ||
        b.enrichedReviews - a.enrichedReviews,
    );
    const total = rows.length;
    const start = (query.page - 1) * query.pageSize;
    return {
      items: rows.slice(start, start + query.pageSize),
      total,
      eligibleCount,
      clusteredCount,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  // restaurantId → 검색가능(임베딩) 리뷰 수(단건).
  private countEnriched(restaurantId: string): Promise<number> {
    return this.prisma.reviewSummary.count({
      where: { review: { restaurantId }, embeddingJson: { not: null } },
    });
  }

  // restaurantId → 검색가능 리뷰 수 맵. ids 미지정 시 전체. (status·pending 용)
  private async countEnrichedByRestaurant(ids?: string[]): Promise<Map<string, number>> {
    const rows = await this.prisma.reviewSummary.findMany({
      where: { embeddingJson: { not: null }, review: ids ? { restaurantId: { in: ids } } : {} },
      select: { review: { select: { restaurantId: true } } },
    });
    const by = new Map<string, number>();
    for (const r of rows) {
      const rid = r.review.restaurantId;
      by.set(rid, (by.get(rid) ?? 0) + 1);
    }
    return by;
  }

  // 공개 조회 — 저장된 군집을 읽어 반환(계산 없음). placeId 없거나 군집 없으면 ready=false.
  async getPublicClusters(placeId: string): Promise<ReviewClustersResultType> {
    const empty: ReviewClustersResultType = {
      ready: false,
      total: 0,
      clustered: 0,
      noiseCount: 0,
      version: CLUSTERING_VERSION,
      clusteredAt: null,
      clusters: [],
    };
    const r = await this.prisma.restaurant.findUnique({
      where: { placeId },
      select: { id: true },
    });
    if (!r) return empty;

    const rows = await this.prisma.reviewCluster.findMany({
      where: { restaurantId: r.id },
      orderBy: { ordinal: 'asc' },
    });
    if (rows.length === 0) return empty;

    // 검색가능 리뷰 총수(노이즈 산출용).
    const total = await this.prisma.reviewSummary.count({
      where: { review: { restaurantId: r.id }, embeddingJson: { not: null } },
    });

    // 대표 리뷰 body 일괄 조회.
    const repIds = rows.flatMap((c) => safeParse<string[]>(c.repReviewIdsJson, []));
    const reps = await this.prisma.visitorReview.findMany({
      where: { id: { in: repIds } },
      select: { id: true, body: true, rating: true },
    });
    const repById = new Map(reps.map((x) => [x.id, x]));

    const clusters = rows.map((c) => {
      const ids = safeParse<string[]>(c.repReviewIdsJson, []);
      return {
        id: c.id,
        ordinal: c.ordinal,
        label: c.label,
        tone: c.tone as ClusterToneType,
        size: c.size,
        keywords: safeParse<string[]>(c.keywordsJson, []),
        aspects: safeParse<Array<{ key: string; count: number }>>(c.aspectsJson, []),
        repReviews: ids
          .map((id) => repById.get(id))
          .filter((x): x is NonNullable<typeof x> => !!x)
          .map((x) => ({ reviewId: x.id, body: x.body, rating: x.rating })),
      };
    });
    const clustered = clusters.reduce((a, c) => a + c.size, 0);
    return {
      ready: true,
      total,
      clustered,
      noiseCount: Math.max(0, total - clustered),
      version: rows[0]!.clusterVersion,
      clusteredAt: rows[0]!.createdAt.toISOString(),
      clusters,
    };
  }
}
