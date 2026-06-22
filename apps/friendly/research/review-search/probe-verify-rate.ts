import { PrismaClient } from '@prisma/client';
import { env } from '../../src/config/env.js';
import { AiConfigService, type LlmProviderEnv } from '../../src/modules/ai/ai.config.service.js';
import { ReviewSearchService } from '../../src/modules/review-search/review-search.service.js';

// ── 검증 개입률 — 검증 가드레일이 "실제로" 답을 바꾸는 빈도 ──────────────────────
// 스트리밍/검증-비동기 레버의 게이팅 사실. ask() 로직상 dropped.length>0 이면
// 보이는 답이 revisedAnswer 로 교체됨 ⟺ 검증이 답을 바꿈.
//   - 개입률 낮음 → "잠정답 먼저 보여주고 드물게 patch" 스트리밍 안전(체감 지연↓, 품질 보존).
//   - 개입률 높음 → 생성 답을 그대로 못 보여줌 → 검증은 critical path 유지해야 → 레버 기각.
// 생성은 확률적이라 질의×ROUNDS. 실행:
//   cd apps/friendly && pnpm exec tsx --env-file=.env research/review-search/probe-verify-rate.ts

const buildEnvBlock = (): LlmProviderEnv => ({
  apiKey: env.OLLAMA_CLOUD_API_KEY,
  baseUrl: env.OLLAMA_CLOUD_BASE_URL,
  timeoutMs: env.OLLAMA_CLOUD_TIMEOUT_MS,
  maxConcurrent: env.OLLAMA_CLOUD_MAX_CONCURRENT,
  defaultModels: { chat: env.OLLAMA_DEFAULT_MODEL, image: env.OLLAMA_IMAGE_MODEL, 'log-analysis': env.OLLAMA_LOG_ANALYSIS_MODEL },
});

const ROUNDS = Math.max(1, Number(process.env.VR_ROUNDS || 2));
const QUERIES = [
  '주차 돼요?',
  '맛없다는 사람 있어?',
  '양은 충분해?',
  '웨이팅 길어?',
  '가격 비싸?',
  '분위기 좋아?',
  '발렛파킹 있어?',
  '아이랑 가기 좋아?',
];

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
  console.log(`대상: ${target.name} · 검증 개입률 (${QUERIES.length}질의 × ${ROUNDS}라운드)\n`);

  let total = 0;
  let changed = 0;
  for (const q of QUERIES) {
    for (let i = 0; i < ROUNDS; i += 1) {
      const r = await service.ask(target.id, q);
      total += 1;
      const dropped = r.verification?.dropped ?? [];
      const didChange = dropped.length > 0;
      if (didChange) changed += 1;
      console.log(
        `  ${q.padEnd(18)} [${r.confidence.padEnd(6)}] ${didChange ? `✎ ${dropped.length}개 주장 제거` : '변경 없음'}` +
          `${didChange ? ` — ${dropped.map((d) => d.slice(0, 24)).join(' | ')}` : ''}`,
      );
    }
  }
  const rate = total ? (changed / total) * 100 : 0;
  console.log(`\n→ 검증 개입률: ${changed}/${total} = ${rate.toFixed(0)}%`);
  console.log(
    rate <= 15
      ? '결론: 개입 드묾 → "잠정답 스트리밍 + 드물게 patch" 안전(체감 지연↓, 품질 보존). 레버 후보.'
      : rate <= 35
        ? '결론: 개입 보통 → 스트리밍 시 가끔 답이 바뀜(UX 트레이드오프). 검증=품질 핵심이라 신중.'
        : '결론: 개입 잦음 → 생성 답을 그대로 보여주면 안 됨 → 검증 critical path 유지. 스트리밍/비동기 기각.',
  );
  await prisma.$disconnect();
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
