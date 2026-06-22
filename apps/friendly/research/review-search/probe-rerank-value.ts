import { PrismaClient } from '@prisma/client';
import { env } from '../../src/config/env.js';
import { AiConfigService, type LlmProviderEnv } from '../../src/modules/ai/ai.config.service.js';
import { ReviewSearchService } from '../../src/modules/review-search/review-search.service.js';

// ── 리랭크의 값어치 — 하이브리드 top-6 대비 리랭크 top-6 가 정말 더 관련 있나? ──
// 레버 B(리랭크 LLM 콜 제거) 안전성 검증. 리랭크의 본업 = "관련도 정렬"이므로,
// 라벨(aspects) 기준 recall@6 / precision@6 을 hybrid vs rerank 로 직접 비교.
//   - 리랭크가 둘 다 의미있게 올리면 → 유지(제거는 품질 손실).
//   - 동률이면 → ask() 에서 evidence 를 'rerank'→'hybrid' 로 바꿔 1콜(~3초) 절감 안전.
// precision 은 특히 부정 질의에서 중요(리랭크가 칭찬 리뷰를 빼서 faithfulness 보호).
// 리랭크는 확률적이라 ROUNDS 평균. 실행:
//   cd apps/friendly && pnpm exec tsx --env-file=.env research/review-search/probe-rerank-value.ts

const buildEnvBlock = (): LlmProviderEnv => ({
  apiKey: env.OLLAMA_CLOUD_API_KEY,
  baseUrl: env.OLLAMA_CLOUD_BASE_URL,
  timeoutMs: env.OLLAMA_CLOUD_TIMEOUT_MS,
  maxConcurrent: env.OLLAMA_CLOUD_MAX_CONCURRENT,
  defaultModels: { chat: env.OLLAMA_DEFAULT_MODEL, image: env.OLLAMA_IMAGE_MODEL, 'log-analysis': env.OLLAMA_LOG_ANALYSIS_MODEL },
});

const K = 6; // ASK_EVIDENCE
const ROUNDS = Math.max(1, Number(process.env.RV_ROUNDS || 2));

const QUERIES: Array<{ q: string; aspect: string; polarity: 'pos' | 'neg' | null }> = [
  { q: '주차 돼요?', aspect: '주차', polarity: null },
  { q: '맛없다는 사람 있어?', aspect: '맛', polarity: 'neg' },
  { q: '양이 적어?', aspect: '양', polarity: 'neg' },
  { q: '웨이팅 길어?', aspect: '웨이팅', polarity: 'neg' },
  { q: '가격 비싸?', aspect: '가격', polarity: 'neg' },
  { q: '분위기 좋아?', aspect: '분위기', polarity: 'pos' },
];

const recall = (ids: string[], rel: Set<string>): number =>
  rel.size ? ids.filter((id) => rel.has(id)).length / Math.min(rel.size, K) : 0;
const precision = (ids: string[], rel: Set<string>): number =>
  ids.length ? ids.filter((id) => rel.has(id)).length / ids.length : 0;
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

  console.log(`대상: ${target.name} · 리랭크 값어치 (recall/precision@${K}, ${ROUNDS}라운드 평균)\n`);
  console.log('질의                    hybrid R/P        rerank R/P        Δrecall  Δprec');

  const hR: number[] = [];
  const hP: number[] = [];
  const rR: number[] = [];
  const rP: number[] = [];
  for (const { q, aspect, polarity } of QUERIES) {
    const rel = new Set(
      [...aspectsOf.entries()]
        .filter(([, a]) => (polarity ? a[aspect] === polarity : a[aspect] !== undefined))
        .map(([id]) => id),
    );
    // hybrid 는 결정적이라 1회.
    const hyb = await service.search(target.id, q, K, 'hybrid');
    const hybIds = hyb.map((h) => h.reviewId);
    const hr = recall(hybIds, rel);
    const hp = precision(hybIds, rel);

    // rerank 는 확률적 → ROUNDS 평균.
    const rrR: number[] = [];
    const rrP: number[] = [];
    for (let i = 0; i < ROUNDS; i += 1) {
      const rer = await service.search(target.id, q, K, 'rerank');
      const ids = rer.map((h) => h.reviewId);
      rrR.push(recall(ids, rel));
      rrP.push(precision(ids, rel));
    }
    const rr = avg(rrR);
    const rp = avg(rrP);
    hR.push(hr);
    hP.push(hp);
    rR.push(rr);
    rP.push(rp);
    const dR = (rr - hr) * 100;
    const dP = (rp - hp) * 100;
    const sign = (x: number): string => `${x > 0 ? '+' : ''}${x.toFixed(0)}pp`;
    console.log(
      `${q.padEnd(22)} ${pc(hr).padStart(4)}/${pc(hp).padStart(4)}        ${pc(rr).padStart(4)}/${pc(rp).padStart(4)}` +
        `        ${sign(dR).padStart(6)}  ${sign(dP).padStart(6)}`,
    );
  }

  const HR = avg(hR);
  const HP = avg(hP);
  const RR = avg(rR);
  const RP = avg(rP);
  const dR = (RR - HR) * 100;
  const dP = (RP - HP) * 100;
  console.log(`\n→ 평균: hybrid R ${pc(HR)} / P ${pc(HP)}   vs   rerank R ${pc(RR)} / P ${pc(RP)}`);
  console.log(`        Δrecall ${dR > 0 ? '+' : ''}${dR.toFixed(0)}pp · Δprecision ${dP > 0 ? '+' : ''}${dP.toFixed(0)}pp`);
  const gain = Math.max(dR, dP);
  console.log(
    gain >= 8
      ? '결론: 리랭크가 관련도를 의미있게 올림 → 유지(제거 시 품질 손실). 레버 B 기각.'
      : gain >= 3
        ? '결론: 리랭크 이득 작음 → 제거 시 ~3초 절감 vs 소폭 품질, 트레이드오프 판단 필요.'
        : '결론: 리랭크가 hybrid 대비 관련도 이득 거의 없음 → ask() 를 hybrid 로 바꿔 1콜 제거 안전(레버 B 채택 후보).',
  );

  await prisma.$disconnect();
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
