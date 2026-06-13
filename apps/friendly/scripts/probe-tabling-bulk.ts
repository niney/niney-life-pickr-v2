import { PrismaClient } from '@prisma/client';
import { env } from '../src/config/env.js';
import { AiConfigService } from '../src/modules/ai/ai.config.service.js';
import { RestaurantService } from '../src/modules/restaurant/restaurant.service.js';
import { CanonicalService } from '../src/modules/canonical/canonical.service.js';
import { ProposalService } from '../src/modules/canonical/proposal.service.js';
import { SummaryService } from '../src/modules/summary/summary.service.js';
import { CrawlService } from '../src/modules/crawl/crawl.service.js';
import { jobRegistry } from '../src/modules/crawl/job-registry.js';
import { tablingBulkSaveRegistry } from '../src/modules/crawl/tabling-bulk-save-registry.js';

// 테이블링 일괄 저장 라이브 스모크 — registry.create → runTablingBulkSave →
// 이벤트 구독으로 per-item 진행 + 최종 snapshot 확인. dev.db 쓰기 발생.
// 실행: pnpm --filter friendly probe:tabling-bulk

const IDXS = [27, 136]; // 둘 다 사이트맵 shop 샘플. 27=델리인디아(리뷰 적음).

const main = async (): Promise<void> => {
  const prisma = new PrismaClient();
  const restaurants = new RestaurantService(prisma);
  const canonical = new CanonicalService(prisma);
  const proposals = new ProposalService(prisma, canonical);
  const aiConfig = new AiConfigService(prisma, {
    apiKey: env.OLLAMA_CLOUD_API_KEY,
    baseUrl: env.OLLAMA_CLOUD_BASE_URL,
    timeoutMs: env.OLLAMA_CLOUD_TIMEOUT_MS,
    maxConcurrent: env.OLLAMA_CLOUD_MAX_CONCURRENT,
    defaultModel: env.OLLAMA_DEFAULT_MODEL,
  });
  const summaries = new SummaryService(prisma, aiConfig);
  const service = new CrawlService(restaurants, summaries, jobRegistry, proposals, canonical, null);

  const { id } = tablingBulkSaveRegistry.create({ actorId: 'probe', idxs: IDXS });
  console.log(`\n[bulk job ${id}] idxs=${IDXS.join(',')}`);

  // registry 이벤트 구독 (SSE 라우트가 이 이벤트를 그대로 클라이언트에 흘려보냄).
  const unsub = tablingBulkSaveRegistry.subscribe(id, 'probe', (ev) => {
    if (ev.type === 'item') {
      const it = ev.item;
      const extra =
        it.state === 'done'
          ? ` reviews=${it.newReviewCount} autoMatched=${it.autoMatched} pages=${it.fetchedPages}`
          : it.errorMessage
            ? ` err=${it.errorMessage}`
            : '';
      console.log(`  · item idx=${it.idx} → ${it.state}${extra}`);
    } else {
      console.log(`  · DONE state=${ev.state}`);
    }
  });

  await service.runTablingBulkSave(id, IDXS);
  unsub();

  const snap = tablingBulkSaveRegistry.get(id, 'probe');
  console.log(
    `\n[snapshot] state=${snap?.state} total=${snap?.total} done=${snap?.doneCount} failed=${snap?.failedCount} skipped=${snap?.skippedCount}`,
  );

  // DB 확인 — 두 idx 가 tabling source 로 저장됐는지.
  const rows = await prisma.restaurant.findMany({
    where: { source: 'tabling', sourceId: { in: IDXS.map(String) } },
    select: { sourceId: true, name: true, reviewCount: true },
  });
  for (const r of rows) {
    console.log(`  [DB] idx=${r.sourceId} ${r.name} reviewCount=${r.reviewCount}`);
  }

  await prisma.$disconnect();
  console.log('\n✓ 일괄 저장 스모크 완료');
};

main()
  .then(() => process.exit(0))
  .catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  });
