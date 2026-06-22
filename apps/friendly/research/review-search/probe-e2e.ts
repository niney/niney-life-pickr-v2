import { PrismaClient } from '@prisma/client';
import { env } from '../../src/config/env.js';
import { AiConfigService, type LlmProviderEnv } from '../../src/modules/ai/ai.config.service.js';
import { ReviewSearchService } from '../../src/modules/review-search/review-search.service.js';

// review-search 본구현 검증: enrich(DB 영속) → 검색/RAG → 2회차 캐시 스킵.
// 실행: pnpm --filter friendly probe:review-search

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

const oneLine = (s: string, n = 50): string => s.replace(/\s+/g, ' ').trim().slice(0, n);

const main = async (): Promise<void> => {
  const prisma = new PrismaClient();
  const service = new ReviewSearchService(prisma, new AiConfigService(prisma, buildEnvBlock()));

  const target = await prisma.restaurant.findFirst({
    where: { name: { contains: '조연탄' }, visitorReviews: { some: {} } },
    select: { id: true, name: true },
  });
  if (!target) {
    console.log('조연탄 식당 없음');
    await prisma.$disconnect();
    return;
  }
  console.log(`대상: ${target.name}\n`);

  console.log('── enrich (DB 영속) ──');
  const e = await service.ensureEnriched(target.id);
  console.log(`신규 ${e.enriched} · 검색가능 ${e.total}건 · ${e.ms}ms\n`);

  console.log('── 검색 (dense/hybrid/rerank top3) ──');
  for (const q of ['주차', '맛이없다']) {
    console.log(`[${q}]`);
    for (const m of ['dense', 'hybrid', 'rerank'] as const) {
      const hits = await service.search(target.id, q, 3, m);
      console.log(`  ${m}: ${hits.map((h) => oneLine(h.body, 22)).join(' | ')}`);
    }
  }

  console.log('\n── RAG ask ──');
  for (const q of ['맛없다는 사람도 있어?', '발렛파킹 있어?', '양은 충분해?']) {
    const r = await service.ask(target.id, q);
    console.log(`Q: ${q}  [${r.confidence}]`);
    console.log(`A: ${r.answer}`);
    console.log(`   근거 ${r.citations.length}건\n`);
  }

  console.log('── 2회차 enrich (캐시 스킵 확인) ──');
  const e2 = await service.ensureEnriched(target.id);
  console.log(`2회차 신규 ${e2.enriched} (0이면 정상) · ${e2.ms}ms`);

  await prisma.$disconnect();
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
