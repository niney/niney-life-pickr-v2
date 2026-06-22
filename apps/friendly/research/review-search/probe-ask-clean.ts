import { PrismaClient } from '@prisma/client';
import { env } from '../../src/config/env.js';
import { AiConfigService, type LlmProviderEnv } from '../../src/modules/ai/ai.config.service.js';
import { ReviewSearchService } from '../../src/modules/review-search/review-search.service.js';

// ── 단발 ask() 진짜 지연 ────────────────────────────────────────────────────────
// probe-latency 의 "ask 25초" 는 dense/hybrid/rerank/verify/ask 를 연달아 쏴서
// ollama-cloud 쓰로틀을 자초한 측정 오염 의심. 여기선 코퍼스만 워밍한 뒤
// "ask() 한 번"만 고립 측정(다른 LLM 콜 없음). 실사용 단발 체감 지연을 잰다.
// 라운드 사이엔 ask 끼리도 throttle 날 수 있으니 각 라운드 값을 따로 출력(누적 상승=throttle).
// 실행: cd apps/friendly && pnpm exec tsx --env-file=.env research/review-search/probe-ask-clean.ts

const buildEnvBlock = (): LlmProviderEnv => ({
  apiKey: env.OLLAMA_CLOUD_API_KEY,
  baseUrl: env.OLLAMA_CLOUD_BASE_URL,
  timeoutMs: env.OLLAMA_CLOUD_TIMEOUT_MS,
  maxConcurrent: env.OLLAMA_CLOUD_MAX_CONCURRENT,
  defaultModels: { chat: env.OLLAMA_DEFAULT_MODEL, image: env.OLLAMA_IMAGE_MODEL, 'log-analysis': env.OLLAMA_LOG_ANALYSIS_MODEL },
});

const ROUNDS = Math.max(1, Number(process.env.ASK_ROUNDS || 3));
const Q = process.env.ASK_Q || '주차 돼요?';
const now = () => Date.now();

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
  // 코퍼스 워밍(loadCorpus 1회) — 콜드 비용 제외.
  await service.search(target.id, Q, 6, 'dense');
  console.log(`대상: ${target.name} · 질의 "${Q}" · 고립 ask() ${ROUNDS}회 (콜=리랭크+생성+검증 3)\n`);

  const times: number[] = [];
  for (let i = 0; i < ROUNDS; i += 1) {
    const t = now();
    const r = await service.ask(target.id, Q);
    const dt = now() - t;
    times.push(dt);
    console.log(`  r${i + 1}: ${String(dt).padStart(6)} ms  [${r.confidence}] 근거 ${r.citations.length}건`);
  }
  const best = Math.min(...times);
  console.log(`\n→ 최소 ${best}ms (≈ 워밍 단발 체감) · 라운드별 ${times.join('/')}ms`);
  console.log(
    times[times.length - 1]! > best * 1.6
      ? '관측: 라운드 진행하며 상승 → ask 끼리도 throttle. 단발 실사용은 최소값에 가까움.'
      : '관측: 라운드 간 안정 → 단발 지연이 일관적.',
  );
  await prisma.$disconnect();
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
