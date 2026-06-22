import { PrismaClient } from '@prisma/client';
import { env } from '../../src/config/env.js';
import { AiConfigService, type LlmProviderEnv } from '../../src/modules/ai/ai.config.service.js';
import { ReviewSearchService } from '../../src/modules/review-search/review-search.service.js';

// ── HyDE A/B ──────────────────────────────────────────────────────────────────
// "HyDE(가상 리뷰로 질의 확장)가 dense 회수를 raw 질의보다 좋게 하나?" 를 직접 측정.
// 도움이 안 되면 ask()에서 HyDE 1콜(~1.5~2초)을 제거해 지연 단축 — 품질 트레이드 없음.
// 정답=aspects 라벨(probe-eval 과 동일). HyDE 는 생성이 확률적이라 N라운드 평균.
// 실행: cd apps/friendly && pnpm exec tsx --env-file=.env research/review-search/probe-hyde.ts

const buildEnvBlock = (): LlmProviderEnv => ({
  apiKey: env.OLLAMA_CLOUD_API_KEY,
  baseUrl: env.OLLAMA_CLOUD_BASE_URL,
  timeoutMs: env.OLLAMA_CLOUD_TIMEOUT_MS,
  maxConcurrent: env.OLLAMA_CLOUD_MAX_CONCURRENT,
  defaultModels: {
    chat: env.OLLAMA_DEFAULT_MODEL,
    image: env.OLLAMA_IMAGE_MODEL,
    'log-analysis': env.OLLAMA_LOG_ANALYSIS_MODEL,
  },
});

const K = 10;
const ROUNDS = Math.max(1, Number(process.env.HYDE_ROUNDS || 2));

const QUERIES: Array<{ q: string; aspect: string; polarity: 'pos' | 'neg' | null }> = [
  { q: '주차', aspect: '주차', polarity: null },
  { q: '맛없다', aspect: '맛', polarity: 'neg' },
  { q: '양이 적다', aspect: '양', polarity: 'neg' },
  { q: '웨이팅 길다', aspect: '웨이팅', polarity: 'neg' },
  { q: '가격 비싸다', aspect: '가격', polarity: 'neg' },
  { q: '분위기 좋다', aspect: '분위기', polarity: 'pos' },
];

const recallOf = (ids: string[], relevant: Set<string>): number =>
  relevant.size ? ids.filter((id) => relevant.has(id)).length / Math.min(relevant.size, K) : 0;
const avg = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const pc = (x: number): string => `${(x * 100).toFixed(0)}%`;

const main = async (): Promise<void> => {
  const prisma = new PrismaClient();
  const service = new ReviewSearchService(prisma, new AiConfigService(prisma, buildEnvBlock()));

  const target = await prisma.restaurant.findFirst({
    where: { name: { contains: '조연탄' }, visitorReviews: { some: {} } },
    select: { id: true, name: true },
  });
  if (!target) {
    console.log('조연탄 없음');
    await prisma.$disconnect();
    return;
  }
  await service.ensureEnriched(target.id);

  const rows = await prisma.reviewSummary.findMany({
    where: { review: { restaurantId: target.id }, aspectsJson: { not: null } },
    select: { reviewId: true, aspectsJson: true },
  });
  const aspectsOf = new Map<string, Record<string, string>>();
  for (const r of rows) {
    try {
      aspectsOf.set(r.reviewId, JSON.parse(r.aspectsJson ?? '{}'));
    } catch {
      aspectsOf.set(r.reviewId, {});
    }
  }

  console.log(`대상: ${target.name} · HyDE A/B (dense recall@${K}, ${ROUNDS}라운드 평균)\n`);
  console.log('질의              raw    HyDE    Δ        예시 HyDE');

  const rawAll: number[] = [];
  const hydeAll: number[] = [];
  for (const { q, aspect, polarity } of QUERIES) {
    const relevant = new Set(
      [...aspectsOf.entries()]
        .filter(([, a]) => (polarity ? a[aspect] === polarity : a[aspect] !== undefined))
        .map(([id]) => id),
    );
    // raw dense (결정적) — denseQuery 미지정 = 질의 그대로 임베딩.
    const rawHits = await service.search(target.id, q, K, 'dense');
    const rawRecall = recallOf(rawHits.map((h) => h.reviewId), relevant);

    // HyDE dense — hyde() 생성 후 그걸 denseQuery 로. 확률적이라 N라운드 평균.
    const hydeRecalls: number[] = [];
    let sample = '';
    for (let i = 0; i < ROUNDS; i += 1) {
      const h = await service.hyde(q);
      if (i === 0) sample = (h ?? '(null)').slice(0, 40);
      const hits = await service.search(target.id, q, K, 'dense', h ?? undefined);
      hydeRecalls.push(recallOf(hits.map((x) => x.reviewId), relevant));
    }
    const hydeRecall = avg(hydeRecalls);
    rawAll.push(rawRecall);
    hydeAll.push(hydeRecall);
    const d = hydeRecall - rawRecall;
    const dStr = `${d > 0 ? '+' : ''}${(d * 100).toFixed(0)}pp`;
    console.log(
      `${q.padEnd(14)} ${pc(rawRecall).padStart(5)} ${pc(hydeRecall).padStart(6)} ${dStr.padStart(7)}   "${sample}…"`,
    );
  }

  const r = avg(rawAll);
  const h = avg(hydeAll);
  const delta = (h - r) * 100;
  console.log(`\n→ 평균 dense recall: raw ${pc(r)} vs HyDE ${pc(h)}  (Δ ${delta > 0 ? '+' : ''}${delta.toFixed(0)}pp)`);
  console.log(
    delta >= 5
      ? '결론: HyDE 가 recall 을 의미 있게 올림 → 유지.'
      : delta <= -5
        ? '결론: HyDE 가 recall 을 떨어뜨림 → 제거 검토(지연도 단축).'
        : '결론: HyDE 의 recall 효과 미미(±5pp 내) → 1콜(~1.5~2초) 절감 위해 제거 검토.',
  );

  await prisma.$disconnect();
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
