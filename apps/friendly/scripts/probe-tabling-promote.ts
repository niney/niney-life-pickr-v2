import { PrismaClient } from '@prisma/client';
import { env } from '../src/config/env.js';
import { AiConfigService } from '../src/modules/ai/ai.config.service.js';
import { RestaurantService } from '../src/modules/restaurant/restaurant.service.js';
import { CanonicalService } from '../src/modules/canonical/canonical.service.js';
import { ProposalService } from '../src/modules/canonical/proposal.service.js';
import { SummaryService } from '../src/modules/summary/summary.service.js';
import { CrawlService } from '../src/modules/crawl/crawl.service.js';
import { jobRegistry } from '../src/modules/crawl/job-registry.js';
import type { TablingPlaceDataType } from '@repo/api-contract';

// place→partner 자동 승격 라이브 통합 프로브.
//
// 실제 partner 를 라이브 크롤(100% 실데이터)한 뒤, 그 partner 의 실제 좌표·이름
// 으로 place 행을 **합성**해 "같은 가게가 미입점 place 로도 존재" 상황을 만든다
// (실제로 같은 가게의 place objectId↔partner idx 매핑은 API 에 없어 자연 쌍을
// 찾기 어렵다 — 이 사각지대를 메우는 게 본 기능). 그다음 saveTablingShop 을 다시
// 호출해 **실제 배선**(saveTablingShop → tryLinkTablingPlacePartner)이 승격 머지를
// 일으키는지 확인한다. 합성한 place 행은 끝에 정리하고 실데이터 partner 는 보존.
//
// 실행: pnpm --filter friendly probe:tabling-promote

const PARTNER_IDX = 27; // 델리인디아(마포) — 리뷰 적어 재크롤이 빠름.
const SYNTH_PLACE_OID = 'probepromote0000000000aa'; // 합성 — 'place:probe%' 로 정리.
const SYNTH_NEG_OID = 'probepromote0000000000bb'; // 부정 케이스용(이름 불일치).

const line = (s = ''): void => {
  console.log(s);
};

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
    defaultModels: {
      chat: env.OLLAMA_DEFAULT_MODEL,
      image: env.OLLAMA_IMAGE_MODEL,
      'log-analysis': env.OLLAMA_LOG_ANALYSIS_MODEL,
    },
  });
  const summaries = new SummaryService(prisma, aiConfig);
  const crawl = new CrawlService(restaurants, summaries, jobRegistry, proposals, canonical, null);

  // private tryLinkTablingPlacePartner 직접 호출용(부정 케이스 — 재크롤 없이).
  const link = (canonicalId: string, selfIsPartner: boolean): Promise<string | null> =>
    (
      crawl as unknown as {
        tryLinkTablingPlacePartner(id: string, p: boolean): Promise<string | null>;
      }
    ).tryLinkTablingPlacePartner(canonicalId, selfIsPartner);

  const canonOf = async (restaurantId: string): Promise<string | null> =>
    (await restaurants.getCanonicalIdForRestaurant(restaurantId));

  const countRows = (canonicalId: string): Promise<number> =>
    prisma.restaurant.count({ where: { canonicalId } });

  const canonExists = async (id: string): Promise<boolean> =>
    (await prisma.canonicalRestaurant.findUnique({ where: { id }, select: { id: true } })) !== null;

  line('\n══ place→partner 자동 승격 라이브 프로브 ══');

  // 1) 실제 partner 라이브 크롤.
  line(`\n[1] saveTablingShop(${PARTNER_IDX}) — 라이브 크롤`);
  const r1 = await crawl.saveTablingShop(PARTNER_IDX);
  const partnerCanon = await canonOf(r1.restaurantId);
  if (!partnerCanon) throw new Error('partner canonical 없음');
  const core = await prisma.canonicalRestaurant.findUnique({
    where: { id: partnerCanon },
    select: { name: true, latitude: true, longitude: true },
  });
  line(`    partnerRestaurant=${r1.restaurantId}`);
  line(`    partnerCanonical=${partnerCanon}`);
  line(`    name="${core?.name}" @ ${core?.latitude},${core?.longitude}`);
  if (core?.latitude == null || core?.longitude == null) {
    throw new Error('partner 좌표 없음 — 승격 임계(50m) 검증 불가');
  }

  // 2) 같은 좌표·이름으로 place 행 합성 → 별도 canonical.
  line(`\n[2] place 행 합성 (같은 좌표·이름, objectId=${SYNTH_PLACE_OID})`);
  const synthPlace: TablingPlaceDataType = {
    objectId: SYNTH_PLACE_OID,
    name: core.name,
    address: null,
    lat: core.latitude,
    lng: core.longitude,
    cuisines: ['인도음식'],
    rating: 4.2,
    reviewCount: 9,
    images: [],
    description: null,
    rawSourceUrl: `https://www.tabling.co.kr/place/${SYNTH_PLACE_OID}`,
    fetchedAt: new Date().toISOString(),
    source: 'jsonld',
  };
  const place = await restaurants.upsertRestaurantFromTablingPlace(synthPlace);
  const placeCanon = await canonOf(place.id);
  if (!placeCanon) throw new Error('place canonical 없음');
  line(`    placeRestaurant=${place.id}`);
  line(`    placeCanonical=${placeCanon}`);
  line(`    별도 canonical? ${placeCanon !== partnerCanon ? 'YES (2개)' : 'NO (이미 같음?!)'}`);

  // 3) saveTablingShop 재실행 → 실제 배선이 승격 머지를 일으켜야 함.
  line(`\n[3] saveTablingShop(${PARTNER_IDX}) 재실행 — 배선이 승격을 트리거`);
  const r2 = await crawl.saveTablingShop(PARTNER_IDX);
  const partnerCanonAfter = await canonOf(r2.restaurantId);
  line(`    partnerCanonical(after)=${partnerCanonAfter}`);

  // 4) 검증.
  line('\n[4] 검증');
  const placeCanonGone = !(await canonExists(placeCanon));
  const placeRowNow = await prisma.restaurant.findUnique({
    where: { id: place.id },
    select: { canonicalId: true },
  });
  const merged = placeRowNow?.canonicalId === partnerCanonAfter;
  const rowsOnPartner = partnerCanonAfter ? await countRows(partnerCanonAfter) : 0;
  line(`    place canonical 삭제됨?        ${placeCanonGone ? '✓' : '✗'}`);
  line(`    place 행이 partner 로 이동?     ${merged ? '✓' : '✗'} (now=${placeRowNow?.canonicalId})`);
  line(`    partner canonical 행 수 ≥2?    ${rowsOnPartner >= 2 ? '✓' : '✗'} (${rowsOnPartner})`);
  const positiveOk = placeCanonGone && merged && rowsOnPartner >= 2;
  line(`    ⇒ 승격(positive) ${positiveOk ? 'PASS ✅' : 'FAIL ❌'}`);

  // 5) 부정 케이스 — 이름이 다르면 머지 안 함(라이브 partner 좌표 그대로).
  line(`\n[5] 부정 케이스: 같은 좌표 + 다른 이름 → 머지 안 해야 함`);
  const synthNeg: TablingPlaceDataType = {
    ...synthPlace,
    objectId: SYNTH_NEG_OID,
    name: '전혀무관한상호명입니다',
    rawSourceUrl: `https://www.tabling.co.kr/place/${SYNTH_NEG_OID}`,
  };
  const neg = await restaurants.upsertRestaurantFromTablingPlace(synthNeg);
  const negCanon = await canonOf(neg.id);
  const negKeep = partnerCanonAfter ? await link(partnerCanonAfter, true) : 'no-canon';
  const negStillSeparate = negCanon ? await canonExists(negCanon) : false;
  line(`    link 반환=${negKeep ?? 'null'} (null 기대)`);
  line(`    부정 place canonical 보존?     ${negStillSeparate ? '✓' : '✗'}`);
  const negativeOk = negKeep === null && negStillSeparate;
  line(`    ⇒ 임계 가드(negative) ${negativeOk ? 'PASS ✅' : 'FAIL ❌'}`);

  // 6) 합성 행 정리(실데이터 partner 는 보존).
  line('\n[6] 정리 — 합성 place 행 삭제(partner 보존)');
  const synthRows = await prisma.restaurant.findMany({
    where: { source: 'tabling', sourceId: { startsWith: 'place:probepromote' } },
    select: { id: true, canonicalId: true },
  });
  const touchedCanon = [...new Set(synthRows.map((r) => r.canonicalId))];
  await prisma.restaurant.deleteMany({
    where: { id: { in: synthRows.map((r) => r.id) } },
  });
  // 합성 행이 빠진 뒤 빈 canonical 만 삭제(partner canonical 은 partner 행이 남아 보존).
  let removedCanon = 0;
  for (const cid of touchedCanon) {
    const remaining = await countRows(cid);
    if (remaining === 0) {
      await prisma.canonicalRestaurant.delete({ where: { id: cid } });
      removedCanon += 1;
    }
  }
  line(`    삭제 place 행=${synthRows.length} / 정리된 빈 canonical=${removedCanon}`);
  const partnerStill = partnerCanonAfter ? await canonExists(partnerCanonAfter) : false;
  line(`    partner canonical 보존?        ${partnerStill ? '✓' : '✗'}`);

  await prisma.$disconnect();
  const allOk = positiveOk && negativeOk;
  line(`\n${allOk ? '✓ 전체 PASS' : '✗ 일부 FAIL'} — 백그라운드 AI 요약 큐는 process.exit 로 중단`);
  process.exitCode = allOk ? 0 : 2;
};

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
