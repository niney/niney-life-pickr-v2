import { PrismaClient } from '@prisma/client';
import { env } from '../../src/config/env.js';
import { AiConfigService, type LlmProviderEnv } from '../../src/modules/ai/ai.config.service.js';
import { ReviewSearchService } from '../../src/modules/review-search/review-search.service.js';

// ── 단계별 지연 계측 ──────────────────────────────────────────────────────────
// "검색이 느린 게 LLM 단계 때문인가?" 를 직접 측정. 외부에서 잴 수 있는 단위로 분해:
//   search(dense)  = 질의 임베딩(로컬) + 코사인(인앱)            → 로컬
//   search(hybrid) = dense + BM25/RRF(인앱)                      → 로컬
//   search(rerank) = hybrid + listwise 리랭크 LLM 1콜
//   verifyAnswer   = 검증 LLM 1콜
//   ask(full)      = hyde LLM + search(rerank) + 생성 LLM + 검증 LLM (4콜)
//   chat baseline  = ollama-cloud /api/chat 단일 왕복(참고)
// 실행: cd apps/friendly && tsx --env-file=.env research/review-search/probe-latency.ts

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

const ROUNDS = Math.max(1, Number(process.env.LAT_ROUNDS || 2));
const Q = process.env.LAT_QUERY || '주차 돼요?';

const now = () => Date.now();
const timed = async <T>(fn: () => Promise<T>): Promise<{ r: T; dt: number }> => {
  const t = now();
  const r = await fn();
  return { r, dt: now() - t };
};
const avg = (xs: number[]): number => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
const row = (label: string, v: number, tag = ''): void =>
  console.log(`  ${label.padEnd(28)} ${String(v).padStart(6)} ms  ${tag}`);

const main = async (): Promise<void> => {
  const prisma = new PrismaClient();
  const aiConfig = new AiConfigService(prisma, buildEnvBlock());
  const service = new ReviewSearchService(prisma, aiConfig);
  const resolved = await aiConfig.getResolved('ollama-cloud', 'chat');

  const target = await prisma.restaurant.findFirst({
    where: { name: { contains: '조연탄' }, visitorReviews: { some: {} } },
    select: { id: true, name: true },
  });
  if (!target || !resolved) {
    console.log('조연탄 없음 또는 chat provider 미설정');
    await prisma.$disconnect();
    return;
  }
  await service.ensureEnriched(target.id);
  console.log(`대상: ${target.name} · 질의: "${Q}" · 라운드 ${ROUNDS}\n`);

  // 단일 chat 왕복 baseline — 한 번의 ollama-cloud LLM 왕복 비용(참고용).
  const chatBaseline = await timed(async () => {
    await fetch(`${resolved.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${resolved.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: resolved.defaultModel, stream: false, messages: [{ role: 'user', content: '안녕' }] }),
    }).then((r) => r.text());
  });

  // 콜드: 첫 검색(loadCorpus 포함) — 이후 캐시.
  const cold = await timed(() => service.search(target.id, Q, 6, 'dense'));
  console.log('[콜드]');
  row('첫 search dense (loadCorpus 포함)', cold.dt, 'DB로드+임베딩파싱+BM25 1회');

  const acc = { dense: [] as number[], hybrid: [] as number[], rerank: [] as number[], verify: [] as number[], ask: [] as number[] };
  for (let i = 0; i < ROUNDS; i += 1) {
    const dense = await timed(() => service.search(target.id, Q, 6, 'dense'));
    const hybrid = await timed(() => service.search(target.id, Q, 6, 'hybrid'));
    const rerank = await timed(() => service.search(target.id, Q, 6, 'rerank'));
    const verify = await timed(() => service.verifyAnswer(Q, '주차는 가능합니다. [1]', rerank.r));
    const ask = await timed(() => service.ask(target.id, Q));
    acc.dense.push(dense.dt);
    acc.hybrid.push(hybrid.dt);
    acc.rerank.push(rerank.dt);
    acc.verify.push(verify.dt);
    acc.ask.push(ask.dt);
  }

  const D = avg(acc.dense), H = avg(acc.hybrid), R = avg(acc.rerank), V = avg(acc.verify), A = avg(acc.ask);
  console.log(`\n[워밍 평균 N=${ROUNDS}]`);
  row('search dense (embed+cosine)', D, '로컬');
  row('search hybrid (+BM25/RRF)', H, '로컬');
  row('search rerank (+리랭크 LLM)', R, 'LLM 1콜');
  row('verifyAnswer (검증 LLM)', V, 'LLM 1콜');
  row('ask (full pipeline)', A, 'LLM 4콜');
  row('chat 단일 왕복 (baseline)', chatBaseline.dt, '참고');

  // 분해.
  const embedLocal = D; // dense ≈ embed(local) + cosine(~ms)
  const retrCompute = Math.max(0, H - D); // BM25/RRF
  const rerankLlm = Math.max(0, R - H);
  const verifyLlm = V;
  const hydeGen = Math.max(0, A - R - V); // hyde + generate (2 LLM 콜) 근사
  const localTotal = embedLocal + retrCompute;
  const llmTotal = rerankLlm + verifyLlm + hydeGen;
  const pct = (x: number): string => (A ? `${Math.round((x / A) * 100)}%` : '–');

  console.log('\n[분해 — ask 한 번 기준]');
  row('임베딩(로컬)        ≈ dense', embedLocal, pct(embedLocal));
  row('회수 compute        ≈ hybrid−dense', retrCompute, pct(retrCompute));
  row('rerank LLM          ≈ rerank−hybrid', rerankLlm, pct(rerankLlm));
  row('verify LLM          ≈ verify', verifyLlm, pct(verifyLlm));
  row('hyde+generate LLM   ≈ ask−rerank−verify', hydeGen, pct(hydeGen));
  console.log('  ' + '─'.repeat(46));
  row('▶ 로컬 합 (임베딩+회수)', localTotal, pct(localTotal));
  row('▶ LLM 합 (4콜)', llmTotal, pct(llmTotal));

  console.log(
    `\n결론: ask ${A}ms 중 LLM ${llmTotal}ms(${pct(llmTotal)}) vs 로컬 ${localTotal}ms(${pct(localTotal)}). ` +
      `${llmTotal > localTotal * 3 ? 'LLM 단계가 지배적 — 추측 확인됨.' : '로컬 비중도 무시 못함 — 재확인 필요.'}`,
  );

  await prisma.$disconnect();
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
