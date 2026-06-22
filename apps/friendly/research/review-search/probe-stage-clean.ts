import { PrismaClient } from '@prisma/client';
import { env } from '../../src/config/env.js';
import { AiConfigService, type LlmProviderEnv } from '../../src/modules/ai/ai.config.service.js';
import { ReviewSearchService } from '../../src/modules/review-search/review-search.service.js';

// ── 구간별 "깨끗한" 단발 지연 ───────────────────────────────────────────────────
// probe-latency 는 라운드당 LLM 5콜을 연달아 쏴 ollama.com 쓰로틀을 자초 → 절대값 오염.
// 여기선 각 LLM 콜 사이에 회복 간격(GAP초)을 둬, 단발 사용자가 겪는 구간 시간을 잰다.
//   로컬(dense/hybrid)은 쓰로틀 무관 → 여러 번 평균. LLM 콜(rerank/verify/ask)은 간격 두고 1회씩.
//   generate ≈ ask − rerankLLM − verifyLLM (ask 내부 3콜은 실제 단발과 동일하게 연속).
// 실행: cd apps/friendly && pnpm exec tsx --env-file=.env research/review-search/probe-stage-clean.ts

const buildEnvBlock = (): LlmProviderEnv => ({
  apiKey: env.OLLAMA_CLOUD_API_KEY,
  baseUrl: env.OLLAMA_CLOUD_BASE_URL,
  timeoutMs: env.OLLAMA_CLOUD_TIMEOUT_MS,
  maxConcurrent: env.OLLAMA_CLOUD_MAX_CONCURRENT,
  defaultModels: { chat: env.OLLAMA_DEFAULT_MODEL, image: env.OLLAMA_IMAGE_MODEL, 'log-analysis': env.OLLAMA_LOG_ANALYSIS_MODEL },
});

const Q = process.env.SC_Q || '주차 돼요?';
const GAP = Math.max(0, Number(process.env.SC_GAP || 8)) * 1000; // LLM 콜 간 회복 간격(throttle 회피)
const now = () => Date.now();
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const timed = async <T>(fn: () => Promise<T>): Promise<{ r: T; dt: number }> => {
  const t = now();
  const r = await fn();
  return { r, dt: now() - t };
};
const avg = (xs: number[]): number => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
const row = (label: string, v: number | string, tag = ''): void =>
  console.log(`  ${label.padEnd(26)} ${String(v).padStart(7)}${typeof v === 'number' ? ' ms' : '   '}  ${tag}`);

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
  await service.search(target.id, Q, 6, 'dense'); // 코퍼스 워밍
  console.log(`대상: ${target.name} · 질의 "${Q}" · 콜 간 간격 ${GAP / 1000}초 (throttle 회피)\n`);

  // 로컬 단계 — 쓰로틀 무관, 3회 평균.
  const dN: number[] = [];
  const hN: number[] = [];
  for (let i = 0; i < 3; i += 1) {
    dN.push((await timed(() => service.search(target.id, Q, 6, 'dense'))).dt);
    hN.push((await timed(() => service.search(target.id, Q, 6, 'hybrid'))).dt);
  }
  const dense = avg(dN);
  const hybrid = avg(hN);

  // LLM 단계 — 간격 두고 1회씩.
  await sleep(GAP);
  const rerank = await timed(() => service.search(target.id, Q, 6, 'rerank'));
  await sleep(GAP);
  const verify = await timed(() => service.verifyAnswer(Q, '주차는 가능하지만 가게에 따라 다릅니다. [1]', rerank.r));
  await sleep(GAP);
  const ask = await timed(() => service.ask(target.id, Q));

  const rerankLlm = Math.max(0, rerank.dt - hybrid);
  const verifyLlm = verify.dt;
  const generateLlm = Math.max(0, ask.dt - rerank.dt - verify.dt);
  const pct = (x: number): string => (ask.dt ? `${Math.round((x / ask.dt) * 100)}%` : '–');

  console.log('[측정된 구간 — 단발, 간격 확보]');
  row('임베딩+코사인 (dense)', dense, '로컬');
  row('회수 compute (hybrid−dense)', Math.max(0, hybrid - dense), '로컬');
  row('rerank LLM 콜', rerankLlm, `1콜 · ${pct(rerankLlm)}`);
  row('generate LLM 콜', generateLlm, `1콜 · ${pct(generateLlm)}`);
  row('verify LLM 콜', verifyLlm, `1콜 · ${pct(verifyLlm)}`);
  console.log('  ' + '─'.repeat(50));
  row('▶ ask() 전체 (단발 실측)', ask.dt, `[${ask.r.confidence}] 근거 ${ask.r.citations.length}건`);
  row('  (참고) search rerank 단독', rerank.dt);
  row('  (참고) 로컬 합', dense + Math.max(0, hybrid - dense), pct(dense + Math.max(0, hybrid - dense)));
  console.log(
    `\n요약: 로컬 ${dense + Math.max(0, hybrid - dense)}ms(${pct(dense + Math.max(0, hybrid - dense))}) · ` +
      `LLM 3콜 ${rerankLlm + generateLlm + verifyLlm}ms. ask 단발 ${(ask.dt / 1000).toFixed(1)}초.`,
  );

  await prisma.$disconnect();
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
