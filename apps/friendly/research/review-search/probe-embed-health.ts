import { PrismaClient } from '@prisma/client';
import { env } from '../../src/config/env.js';
import { AiConfigService, type LlmProviderEnv } from '../../src/modules/ai/ai.config.service.js';
import { ReviewSearchService } from '../../src/modules/review-search/review-search.service.js';

// ── 배포 preflight: 임베딩 엔드포인트 확인 ────────────────────────────────────
// review-search 는 enrich·검색·ask 모두 bge-m3 임베딩이 필요하다(질의 임베딩은 매 요청).
// 운영에 로컬/사이드카 Ollama 가 떠 있는지, OLLAMA_EMBED_BASE_URL 이 그곳을 가리키는지
// 서버 띄우기 전에 이 스크립트로 검증한다.
//
// 실행(운영 호스트에서): pnpm --filter friendly probe:embed-health
//   설정: OLLAMA_EMBED_BASE_URL(기본 http://localhost:11434), OLLAMA_EMBED_MODEL(기본 bge-m3)

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
  const prisma = new PrismaClient();
  const service = new ReviewSearchService(prisma, new AiConfigService(prisma, buildEnvBlock()));

  const h = await service.embedHealth();
  if (h.ok) {
    console.log(`✅ 임베딩 OK — ${h.baseUrl} (${h.model}, dim ${h.dim})`);
    console.log('   review-search enrich·검색·ask 가능.');
  } else {
    console.log(`❌ 임베딩 미도달 — ${h.baseUrl} (${h.model})`);
    console.log(`   원인: ${h.error}`);
    console.log('   조치: 해당 호스트에 `ollama serve` 실행 + `ollama pull bge-m3`,');
    console.log('         그리고 OLLAMA_EMBED_BASE_URL 을 그 주소로 설정하세요.');
  }

  await prisma.$disconnect();
  process.exit(h.ok ? 0 : 1);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
