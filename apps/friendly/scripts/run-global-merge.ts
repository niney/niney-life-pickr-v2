import { PrismaClient } from '@prisma/client';
import { env } from '../src/config/env.js';
import { AiConfigService, type LlmProviderEnv } from '../src/modules/ai/ai.config.service.js';
import { AnalyticsService } from '../src/modules/analytics/analytics.service.js';

// 전역 메뉴 머지를 CLI 에서 직접 실행 (서버 우회). 어드민 버튼과 동일한
// service.runGlobalMerge 를 호출하고 결과·categoryPath 커버리지를 찍는다.
//
// 실행: pnpm --filter friendly run-merge -- [--full]
//   --full 없으면 증분(이미 전부 링크면 noop). 보통 --full 로 전체 재작성.

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

const main = async (): Promise<void> => {
  const full = process.argv.includes('--full');
  const prisma = new PrismaClient();
  const aiConfig = new AiConfigService(prisma, buildEnvBlock());
  const service = new AnalyticsService(prisma, aiConfig);

  console.log(`\n전역 머지 시작 (full=${full}) …`);
  const result = await service.runGlobalMerge(
    { full },
    {
      onChunk: (c) =>
        console.log(
          `  pass${c.pass} chunk ${c.chunkIndex + 1}/${c.chunkTotal} · mapped ${c.mappedInChunk}`,
        ),
    },
  );
  console.log('\n결과:', result);

  const globals = await prisma.globalMenuCanonical.findMany({
    select: { categoryPath: true },
  });
  const withPath = globals.filter((g) => g.categoryPath).length;
  console.log(`\nglobals ${globals.length} · categoryPath 있음 ${withPath}`);

  const sample = await prisma.globalMenuCanonical.findMany({
    where: { categoryPath: { not: null } },
    select: { displayName: true, categoryPath: true },
    take: 10,
  });
  for (const s of sample) console.log(`  ${s.displayName}  →  ${s.categoryPath}`);

  await prisma.$disconnect();
  console.log('');
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
