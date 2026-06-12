import { PrismaClient } from '@prisma/client';
import { env } from '../src/config/env.js';
import { AiConfigService } from '../src/modules/ai/ai.config.service.js';
import { RestaurantService } from '../src/modules/restaurant/restaurant.service.js';
import { CanonicalService } from '../src/modules/canonical/canonical.service.js';
import { ProposalService } from '../src/modules/canonical/proposal.service.js';
import { SummaryService } from '../src/modules/summary/summary.service.js';
import { CrawlService } from '../src/modules/crawl/crawl.service.js';
import { jobRegistry } from '../src/modules/crawl/job-registry.js';
import {
  fetchTablingShop,
  fetchTablingShopReviews,
} from '../src/modules/crawl/adapters/tabling-shop.http.adapter.js';
import { fetchTablingPlace } from '../src/modules/crawl/adapters/tabling-place.http.adapter.js';
import { fetchTablingSitemap } from '../src/modules/crawl/adapters/tabling-sitemap.http.adapter.js';

// 테이블링 소스 라이브 스모크 — 어댑터 파싱(라이브 API) → 실제 saveTablingShop
// 으로 dev.db 기록 → DB 확인. 실행: pnpm --filter friendly tsx scripts/probe-tabling.ts
// (또는 probe:tabling 스크립트). 외부 네트워크 + dev.db 쓰기 1~2건 발생.

const PARTNER_IDX = 27; // 델리인디아(마포) — 리뷰 적어 저장이 빠름
const BUSY_IDX = 10851; // 광화문미진 — 메뉴/리뷰 풍부(파싱·페이지네이션 검증용)
const PLACE_OID = '6762812966de5f0698ee08c3'; // 우진 해장국(제주, 미입점)

const line = (s = ''): void => {
  console.log(s);
};

const main = async (): Promise<void> => {
  line('\n══ 1. 어댑터 스모크 (라이브 API, DB 미접근) ══');

  const d27 = await fetchTablingShop(PARTNER_IDX);
  line(`\n[shop ${PARTNER_IDX}] ${d27.name} / cat=${d27.category} / ${d27.lat},${d27.lng} / tel=${d27.phone}`);
  line(
    `  rating=${d27.rating} reviews=${d27.reviewTotalCount} ratings=${d27.ratings
      .map((r) => `${r.category}:${r.points}`)
      .join(',')}`,
  );
  line(
    `  menuCategories=${d27.menuCategories.length} images=${d27.images.length} businessDays=${d27.businessDays.length} firstPageReviews=${d27.reviewsFirstPage.list.length}`,
  );

  const dBusy = await fetchTablingShop(BUSY_IDX);
  const firstCat = dBusy.menuCategories[0];
  const firstMenu = firstCat?.menus[0];
  line(`\n[shop ${BUSY_IDX}] ${dBusy.name} / reviews=${dBusy.reviewTotalCount} / menuCats=${dBusy.menuCategories.length}`);
  line(
    `  menu0=${firstMenu ? `${firstMenu.name} ${firstMenu.price ?? '?'}원` : '(none)'} / firstPageReviews=${dBusy.reviewsFirstPage.list.length}`,
  );

  // 커서 페이지네이션 — 어댑터 nextCursor 체인으로 2페이지가 1페이지와 다른
  // 리뷰를 주는지(중복 0 이상적).
  const page1 = await fetchTablingShopReviews(BUSY_IDX, null);
  line(`  [reviews page1] got=${page1.list.length} nextCursor=${page1.nextCursor ? 'yes' : 'null'}`);
  if (page1.nextCursor) {
    const page2 = await fetchTablingShopReviews(BUSY_IDX, page1.nextCursor);
    const overlap = page2.list.filter((x) => page1.list.some((y) => y.idx === x.idx)).length;
    line(
      `  [reviews page2] got=${page2.list.length} overlapWithPage1=${overlap} nextCursor=${page2.nextCursor ? 'yes' : 'null'}`,
    );
  }

  const place = await fetchTablingPlace(PLACE_OID);
  line(
    `\n[place ${PLACE_OID}] ${place.name} / ${place.lat},${place.lng} / rating=${place.rating} reviews=${place.reviewCount} cuisines=${place.cuisines.slice(0, 3).join(',')}`,
  );

  const sm = await fetchTablingSitemap('shop');
  line(`\n[sitemap shop] total=${sm.total} sample=${sm.ids.slice(0, 5).join(',')} (${sm.elapsedMs}ms)`);

  line('\n══ 2. 저장 + 자동매칭 스모크 (dev.db 기록) ══');
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

  const result = await service.saveTablingShop(PARTNER_IDX);
  line(`\n[saveTablingShop ${PARTNER_IDX}]`);
  line(`  restaurantId=${result.restaurantId}`);
  line(
    `  fetchedPages=${result.fetchedPages} totalReviewsReported=${result.totalReviewsReported} newReviews=${result.newReviewCount}`,
  );
  line(`  autoMatched=${result.autoMatched} matchedCanonicalId=${result.matchedCanonicalId ?? '-'}`);

  const row = await prisma.restaurant.findUnique({
    where: { source_sourceId: { source: 'tabling', sourceId: String(PARTNER_IDX) } },
    select: {
      id: true,
      name: true,
      category: true,
      rating: true,
      reviewCount: true,
      canonicalId: true,
      canonical: { select: { name: true, latitude: true, longitude: true } },
    },
  });
  if (row) {
    line(`\n[DB row] ${row.name} cat=${row.category} rating=${row.rating} reviewCount=${row.reviewCount}`);
    line(`  canonical: ${row.canonical.name} @ ${row.canonical.latitude},${row.canonical.longitude}`);
    const persisted = await prisma.visitorReview.count({ where: { restaurantId: row.id } });
    line(`  visitorReviews persisted=${persisted}`);
  } else {
    line('\n[DB row] (없음 — 저장 실패?)');
  }

  const disc = await service.discoverTabling({ tier: 'shop', page: 1 });
  line(`\n[discoverTabling shop] total=${disc.total} sample=${disc.ids.slice(0, 3).join(',')}`);

  const placeResult = await service.saveTablingPlace(PLACE_OID);
  line(`\n[saveTablingPlace ${PLACE_OID}]`);
  line(`  restaurantId=${placeResult.restaurantId} autoMatched=${placeResult.autoMatched} matched=${placeResult.matchedCanonicalId ?? '-'}`);
  const placeRow = await prisma.restaurant.findUnique({
    where: { source_sourceId: { source: 'tabling', sourceId: `place:${PLACE_OID}` } },
    select: { name: true, rating: true, canonical: { select: { latitude: true, longitude: true } } },
  });
  line(`  [DB] ${placeRow?.name} rating=${placeRow?.rating} @ ${placeRow?.canonical.latitude},${placeRow?.canonical.longitude}`);

  await prisma.$disconnect();
  line('\n✓ 스모크 완료 (백그라운드 AI 요약 큐는 process.exit 로 중단)');
};

main()
  .then(() => process.exit(0))
  .catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  });
