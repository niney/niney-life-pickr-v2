import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  FoodAdminListResultType,
  FoodAdminStatsType,
  FoodImportConfigType,
  FoodImportRunListType,
  FoodImportRunType,
  FoodItemType,
  FoodRestaurantsResultType,
  FoodSearchResultType,
} from '@repo/api-contract';
import { buildApp } from '../../app.js';
import { seedAuthUsers } from '../../test-utils/seed-users.js';
import { useIsolatedDatabase, type IsolatedDatabase } from '../../test-utils/temp-db.js';
import { upsertFoodSeeds } from './food-import.service.js';

// food 라우트 — 격리 DB. ① 검색 인증/계약 ② 어드민 목록·등록·편집·409·404 ③ 통계 ④ 적재 잡
// 설정·미리보기·지금 실행(menu-canonical 만 — 외부 키 없이 도는 소스)·이력.

const SEARCH = '/api/v1/food/search';
const ADMIN_ITEMS = '/api/v1/admin/food/items';
const ADMIN_STATS = '/api/v1/admin/food/stats';
const IMPORT = '/api/v1/admin/food/import';

describe('food routes (격리 DB)', () => {
  let app: FastifyInstance;
  let isolated: IsolatedDatabase;
  let adminAuth: { authorization: string };
  let userAuth: { authorization: string };

  beforeAll(async () => {
    isolated = await useIsolatedDatabase();
    app = await buildApp({ logger: false });
    await app.ready();
    await seedAuthUsers(app, [
      { id: 'food-admin', role: 'ADMIN' },
      { id: 'food-user', role: 'USER' },
    ]);
    adminAuth = {
      authorization: `Bearer ${app.jwt.sign({ userId: 'food-admin', email: 'a@x.com', role: 'ADMIN' })}`,
    };
    userAuth = {
      authorization: `Bearer ${app.jwt.sign({ userId: 'food-user', email: 'u@x.com', role: 'USER' })}`,
    };
    await upsertFoodSeeds(app.prisma, [
      {
        name: '김치찌개',
        dishType: 'stew',
        source: 'mfds-nutrition',
        sourceId: 'D1',
        popularity: 10,
      },
      {
        name: '된장찌개',
        dishType: 'stew',
        source: 'mfds-nutrition',
        sourceId: 'D2',
        popularity: 5,
      },
      { name: '비빔밥', dishType: 'rice', source: 'mfds-recipe', sourceId: 'R1' },
    ]);
  });
  afterAll(async () => {
    await app.close();
    isolated.restore();
  });

  it('검색은 인증 필수, q 없으면 400, 결과는 계약 모양', async () => {
    expect((await app.inject({ method: 'GET', url: `${SEARCH}?q=찌개` })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: SEARCH, headers: userAuth })).statusCode).toBe(
      400,
    );
    const res = await app.inject({
      method: 'GET',
      url: `${SEARCH}?q=찌개&limit=5`,
      headers: userAuth,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<FoodSearchResultType>();
    expect(body.items.map((i) => i.name)).toEqual(['김치찌개', '된장찌개']);
    expect(body.items[0]).toMatchObject({ dishType: 'stew', popularity: 10 });
  });

  it('어드민 목록은 ADMIN 만, 필터·정렬·페이지', async () => {
    expect(
      (await app.inject({ method: 'GET', url: ADMIN_ITEMS, headers: userAuth })).statusCode,
    ).toBe(403);
    const all = await app.inject({
      method: 'GET',
      url: `${ADMIN_ITEMS}?sort=name`,
      headers: adminAuth,
    });
    expect(all.statusCode).toBe(200);
    const list = all.json<FoodAdminListResultType>();
    expect(list.total).toBe(3);
    expect(list.items.map((i) => i.name)).toEqual(['김치찌개', '된장찌개', '비빔밥']);

    const stew = await app.inject({
      method: 'GET',
      url: `${ADMIN_ITEMS}?dishType=stew&limit=1&offset=1`,
      headers: adminAuth,
    });
    const stewList = stew.json<FoodAdminListResultType>();
    expect(stewList.total).toBe(2);
    expect(stewList.items).toHaveLength(1);

    const unclassified = await app.inject({
      method: 'GET',
      url: `${ADMIN_ITEMS}?unclassified=1`,
      headers: adminAuth,
    });
    // 이름 규칙이 mainIngredient/cuisine 을 못 채운 행만(비빔밥은 채소/한식으로 채워짐 가능) — total 은 0 이상.
    expect(unclassified.statusCode).toBe(200);
  });

  it('수기 등록 201 → 중복 409, 편집 200, 없는 id 404', async () => {
    const created = await app.inject({
      method: 'POST',
      url: ADMIN_ITEMS,
      headers: adminAuth,
      payload: {
        name: '마라탕',
        aliases: ['마라탕면'],
        dishType: 'stew',
        cuisine: 'chinese',
        ingredients: ['두부', '돼지고기'],
        allergens: ['egg'],
        allergenStatus: 'inferred',
      },
    });
    expect(created.statusCode).toBe(201);
    const item = created.json<FoodItemType>();
    expect(item).toMatchObject({
      name: '마라탕',
      source: 'manual',
      aliases: ['마라탕면'],
      cuisine: 'chinese',
      allergens: ['soybean', 'pork'],
      allergenStatus: 'inferred',
    });

    const reinferred = await app.inject({
      method: 'PATCH',
      url: `${ADMIN_ITEMS}/${item.id}`,
      headers: adminAuth,
      payload: {
        ingredients: ['밀가루'],
        // inferred를 명시하면 폼에 남은 이전 체크값보다 재료 재계산이 우선한다.
        allergens: ['soybean'],
        allergenStatus: 'inferred',
      },
    });
    expect(reinferred.statusCode).toBe(200);
    expect(reinferred.json<FoodItemType>()).toMatchObject({
      allergens: ['wheat'],
      allergenStatus: 'inferred',
    });

    const dup = await app.inject({
      method: 'POST',
      url: ADMIN_ITEMS,
      headers: adminAuth,
      payload: { name: '마라 탕' },
    });
    expect(dup.statusCode).toBe(409);

    const patched = await app.inject({
      method: 'PATCH',
      url: `${ADMIN_ITEMS}/${item.id}`,
      headers: adminAuth,
      payload: { mainIngredient: 'other_meat', active: false, repName: '마라탕' },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json<FoodItemType>()).toMatchObject({
      mainIngredient: 'other_meat',
      active: false,
      repName: '마라탕',
    });

    const verified = await app.inject({
      method: 'PATCH',
      url: `${ADMIN_ITEMS}/${item.id}`,
      headers: adminAuth,
      payload: { allergens: ['soybean'], allergenStatus: 'verified' },
    });
    expect(verified.statusCode).toBe(200);
    expect(verified.json<FoodItemType>()).toMatchObject({
      allergens: ['soybean'],
      allergenStatus: 'verified',
    });

    const verifiedList = await app.inject({
      method: 'GET',
      url: `${ADMIN_ITEMS}?allergenStatus=verified`,
      headers: adminAuth,
    });
    expect(verifiedList.json<FoodAdminListResultType>().items.map((food) => food.id)).toContain(
      item.id,
    );

    const missing = await app.inject({
      method: 'PATCH',
      url: `${ADMIN_ITEMS}/nope`,
      headers: adminAuth,
      payload: { active: true },
    });
    expect(missing.statusCode).toBe(404);
  });

  it('통계', async () => {
    const res = await app.inject({ method: 'GET', url: ADMIN_STATS, headers: adminAuth });
    expect(res.statusCode).toBe(200);
    const stats = res.json<FoodAdminStatsType>();
    expect(stats.total).toBe(4);
    expect(stats.active).toBe(3);
    expect(stats.bySource.find((s) => s.source === 'mfds-nutrition')?.count).toBe(2);
    expect(stats.byDishType.find((s) => s.dishType === 'stew')?.count).toBe(3);
    expect(stats.allergenVerifiedCount).toBe(1);
    expect(
      stats.allergenUnknownCount + stats.allergenInferredCount + stats.allergenVerifiedCount,
    ).toBe(stats.total);
  });

  it('적재 잡: 기본 설정 조회 → 잘못된 cron 400 → 저장 → 미리보기 → 지금 실행(menu-canonical) → 이력', async () => {
    const cfg0 = await app.inject({ method: 'GET', url: IMPORT, headers: adminAuth });
    expect(cfg0.statusCode).toBe(200);
    const c0 = cfg0.json<FoodImportConfigType>();
    expect(c0.enabled).toBe(false);
    expect(c0.sources).toEqual(['mfds-nutrition', 'mfds-recipe', 'mafra-recipe', 'menu-canonical']);
    expect(c0.apiConfigured).toHaveProperty('mfds-nutrition');

    const bad = await app.inject({
      method: 'PUT',
      url: IMPORT,
      headers: adminAuth,
      payload: {
        enabled: true,
        cronExpr: 'not a cron',
        timezone: 'Asia/Seoul',
        sources: ['menu-canonical'],
        classify: false,
      },
    });
    expect(bad.statusCode).toBe(400);

    const saved = await app.inject({
      method: 'PUT',
      url: IMPORT,
      headers: adminAuth,
      payload: {
        enabled: false,
        cronExpr: '0 4 1 * *',
        timezone: 'Asia/Seoul',
        sources: ['menu-canonical'],
        classify: false,
      },
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json<FoodImportConfigType>()).toMatchObject({
      enabled: false,
      sources: ['menu-canonical'],
      classify: false,
      nextRunAt: null,
    });

    const preview = await app.inject({
      method: 'POST',
      url: `${IMPORT}/preview`,
      headers: adminAuth,
      payload: { cronExpr: '0 4 1 * *' },
    });
    expect(preview.json<{ valid: boolean; nextRuns: string[] }>()).toMatchObject({ valid: true });
    expect(preview.json<{ nextRuns: string[] }>().nextRuns).toHaveLength(5);

    // 빈 격리 DB 라 global_menu_canonicals 0행 — 소스 오류 없이 done, fetched 0.
    const run = await app.inject({
      method: 'POST',
      url: `${IMPORT}/run`,
      headers: adminAuth,
      payload: { sources: ['menu-canonical'], classify: false },
    });
    expect(run.statusCode).toBe(200);
    const r = run.json<FoodImportRunType>();
    expect(r).toMatchObject({
      trigger: 'manual',
      status: 'done',
      sources: ['menu-canonical'],
      phase: null,
      progress: null,
    });
    expect(r.stats).toEqual([
      { source: 'menu-canonical', fetched: 0, inserted: 0, updated: 0, skipped: 0, error: null },
    ]);

    const runs = await app.inject({ method: 'GET', url: `${IMPORT}/runs`, headers: adminAuth });
    const list = runs.json<FoodImportRunListType>();
    expect(list.inflightRunId).toBeNull();
    expect(list.items[0]?.runId).toBe(r.runId);

    const cfg1 = await app.inject({ method: 'GET', url: IMPORT, headers: adminAuth });
    expect(cfg1.json<FoodImportConfigType>().lastStatus).toBe('done');
  });

  it('SSE run-events 는 어드민 토큰 필요, 진행 중 run 없으면 snapshot 후 종료', async () => {
    expect((await app.inject({ method: 'GET', url: `${IMPORT}/run-events` })).statusCode).toBe(401);
    const token = app.jwt.sign({ userId: 'food-admin', email: 'a@x.com', role: 'ADMIN' });
    const res = await app.inject({ method: 'GET', url: `${IMPORT}/run-events?token=${token}` });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.body).toContain('event: snapshot');
  });
});

describe('food restaurants reverse lookup (격리 DB)', () => {
  let app: FastifyInstance;
  let isolated: IsolatedDatabase;
  let userAuth: { authorization: string };

  const seedMention = async (
    restaurantId: string,
    nameNorm: string,
    sentiments: Array<'positive' | 'negative' | 'neutral'>,
  ): Promise<void> => {
    const review = await app.prisma.visitorReview.create({
      data: {
        restaurantId,
        body: `review-${restaurantId}-${nameNorm}`,
        imageUrlsJson: '[]',
        contentHash: `hash-${restaurantId}-${nameNorm}`,
      },
    });
    const summary = await app.prisma.reviewSummary.create({
      data: { reviewId: review.id, status: 'done' },
    });
    await app.prisma.menuMention.createMany({
      data: sentiments.map((sentiment, index) => ({
        summaryId: summary.id,
        restaurantId,
        name: index === 0 ? '김치짜개' : '묵은지짜개',
        nameNorm,
        sentiment,
      })),
    });
  };

  beforeAll(async () => {
    isolated = await useIsolatedDatabase();
    app = await buildApp({ logger: false });
    await app.ready();
    await seedAuthUsers(app, [{ id: 'food-nearby-user', role: 'USER' }]);
    userAuth = {
      authorization: `Bearer ${app.jwt.sign({ userId: 'food-nearby-user', email: 'nearby@x.com', role: 'USER' })}`,
    };

    await app.prisma.foodItem.createMany({
      data: [
        {
          id: 'food-nearby-exact',
          name: '묵은지 김치짜개',
          nameNorm: '묵은지김치짜개',
          source: 'mfds-nutrition',
          sourceRefsJson: JSON.stringify([{ source: 'menu-canonical', sourceId: '김치짜개' }]),
        },
        {
          id: 'food-nearby-alias',
          name: '별칭 음식',
          nameNorm: '별칭음식',
          aliasesJson: JSON.stringify(['김치 짜개']),
          aliasNormsJson: JSON.stringify(['김치짜개']),
          source: 'manual',
        },
        {
          id: 'food-nearby-empty',
          name: '연결 없는 음식',
          nameNorm: '연결없는음식',
          source: 'manual',
        },
      ],
    });

    const global = await app.prisma.globalMenuCanonical.create({
      data: { id: 'global-kimchi', displayName: '김치짜개', globalKey: '김치짜개' },
    });

    const nearCanonical = await app.prisma.canonicalRestaurant.create({
      data: {
        id: 'canonical-near',
        name: '가까운 김치짜개집',
        primaryCategory: '한식',
        latitude: 37.5,
        longitude: 127,
      },
    });
    const near = await app.prisma.restaurant.create({
      data: {
        id: 'restaurant-near',
        source: 'naver',
        sourceId: 'place-near',
        placeId: 'place-near',
        canonicalId: nearCanonical.id,
        name: '가까운 김치짜개집',
        category: '한식',
        address: '서울 가까운로 1',
        rating: 4.3,
        reviewCount: 30,
        rawSourceUrl: 'https://example.test/place-near',
        snapshotJson: '{}',
      },
    });
    const nearOtherSource = await app.prisma.restaurant.create({
      data: {
        id: 'restaurant-near-dc',
        source: 'diningcode',
        sourceId: 'dc-near',
        canonicalId: nearCanonical.id,
        name: '가까운 김치짜개집',
        rawSourceUrl: 'https://example.test/dc-near',
        snapshotJson: '{}',
      },
    });
    await app.prisma.restaurantMenu.create({
      data: {
        restaurantId: near.id,
        source: 'naver',
        sourceMenuId: 'menu-near',
        name: '김치 짜개',
        sortOrder: 0,
      },
    });

    const farCanonical = await app.prisma.canonicalRestaurant.create({
      data: {
        id: 'canonical-far',
        name: '먼 김치짜개집',
        primaryCategory: '한식',
        latitude: 37.6,
        longitude: 127,
      },
    });
    const far = await app.prisma.restaurant.create({
      data: {
        id: 'restaurant-far',
        source: 'naver',
        sourceId: 'place-far',
        placeId: 'place-far',
        canonicalId: farCanonical.id,
        name: '먼 김치짜개집',
        category: '한식',
        rating: 4.9,
        reviewCount: 80,
        rawSourceUrl: 'https://example.test/place-far',
        snapshotJson: '{}',
      },
    });

    // 사용자 좌표에는 더 가깝지만 리뷰 언급만 있는 식당. 메뉴판+리뷰 근거가
    // 거리보다 먼저 정렬되는지 검증하는 fixture다.
    const reviewOnlyCanonical = await app.prisma.canonicalRestaurant.create({
      data: {
        id: 'canonical-review-only',
        name: '가장 가까운 리뷰 식당',
        primaryCategory: '한식',
        latitude: 37.5001,
        longitude: 127,
      },
    });
    const reviewOnly = await app.prisma.restaurant.create({
      data: {
        id: 'restaurant-review-only',
        source: 'naver',
        sourceId: 'place-review-only',
        placeId: 'place-review-only',
        canonicalId: reviewOnlyCanonical.id,
        name: '가장 가까운 리뷰 식당',
        category: '한식',
        rating: 4.1,
        reviewCount: 10,
        rawSourceUrl: 'https://example.test/place-review-only',
        snapshotJson: '{}',
      },
    });

    for (const [restaurant, suffix] of [
      [near, 'near'],
      [nearOtherSource, 'near-dc'],
      [far, 'far'],
      [reviewOnly, 'review-only'],
    ] as const) {
      const local = await app.prisma.menuCanonical.create({
        data: {
          id: `menu-canonical-${suffix}`,
          restaurantId: restaurant.id,
          nameNorm: '김치짜개',
          canonicalName: '김치짜개',
          canonicalNorm: '김치짜개',
        },
      });
      await app.prisma.globalMenuCanonicalLink.create({
        data: {
          menuCanonicalId: local.id,
          restaurantId: restaurant.id,
          localCanonicalNorm: '김치짜개',
          globalCanonicalId: global.id,
        },
      });
    }
    await seedMention(near.id, '김치짜개', ['positive', 'negative']);
    await seedMention(nearOtherSource.id, '김치짜개', ['positive']);
    await seedMention(far.id, '김치짜개', ['positive']);
    await seedMention(reviewOnly.id, '김치짜개', ['positive']);
  });

  afterAll(async () => {
    await app.close();
    isolated.restore();
  });

  it('인증·foodId·좌표 쌍 계약을 검증한다', async () => {
    const path = '/api/v1/food/food-nearby-exact/restaurants';
    expect((await app.inject({ method: 'GET', url: path })).statusCode).toBe(401);
    expect(
      (await app.inject({ method: 'GET', url: `${path}?lat=37.5`, headers: userAuth })).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/food/missing-food/restaurants',
          headers: userAuth,
        })
      ).statusCode,
    ).toBe(404);
  });

  it('출처 globalKey를 정확 매핑하고 placeId 중복·리뷰 근거를 합산한다', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/food/food-nearby-exact/restaurants',
      headers: userAuth,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<FoodRestaurantsResultType>();
    expect(body.notice).toContain('현재 판매 여부를 보장하지 않습니다');
    expect(body.matchedGlobalKeys).toEqual(['김치짜개']);
    expect(body.items.map((item) => item.placeId)).toEqual([
      'place-near',
      'place-far',
      'place-review-only',
    ]);
    expect(body.items[0]).toMatchObject({
      placeId: 'place-near',
      evidence: ['menu_catalog', 'review_mentions'],
      mentionCount: 3,
      matchedMenus: ['김치짜개'],
    });
    expect(body.items[0]?.positiveRatio).toBeCloseTo(2 / 3);
  });

  it('좌표가 있으면 반경 필터 뒤 근거 신뢰도를 거리보다 먼저 정렬한다', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/food/food-nearby-exact/restaurants?lat=37.5001&lng=127&radiusM=1000',
      headers: userAuth,
    });
    const body = res.json<FoodRestaurantsResultType>();
    expect(body.items.map((item) => item.placeId)).toEqual(['place-near', 'place-review-only']);
    expect(body.items[0]?.evidence).toEqual(['menu_catalog', 'review_mentions']);
    expect(body.items[1]).toMatchObject({ placeId: 'place-review-only', distanceM: 0 });
  });

  it('menu-canonical 출처가 없으면 nameNorm/별칭 정확 매칭, 연결이 없으면 빈 목록', async () => {
    const alias = await app.inject({
      method: 'GET',
      url: '/api/v1/food/food-nearby-alias/restaurants?limit=1',
      headers: userAuth,
    });
    expect(alias.json<FoodRestaurantsResultType>().matchedGlobalKeys).toEqual(['김치짜개']);
    expect(alias.json<FoodRestaurantsResultType>().items).toHaveLength(1);

    const empty = await app.inject({
      method: 'GET',
      url: '/api/v1/food/food-nearby-empty/restaurants',
      headers: userAuth,
    });
    expect(empty.json<FoodRestaurantsResultType>()).toMatchObject({
      foodId: 'food-nearby-empty',
      matchedGlobalKeys: [],
      items: [],
    });
  });
});

describe('menu-lexicon admin routes (격리 DB)', () => {
  let app: FastifyInstance;
  let isolated: IsolatedDatabase;
  let adminAuth: { authorization: string };
  const URL = '/api/v1/admin/food/menu-lexicon';

  beforeAll(async () => {
    isolated = await useIsolatedDatabase();
    app = await buildApp({ logger: false });
    await app.ready();
    await seedAuthUsers(app, [{ id: 'lex-admin', role: 'ADMIN' }]);
    adminAuth = {
      authorization: `Bearer ${app.jwt.sign({ userId: 'lex-admin', email: 'l@x.com', role: 'ADMIN' })}`,
    };
    await upsertFoodSeeds(app.prisma, [{ name: '족발', source: 'mfds-nutrition', sourceId: 'D9', popularity: 1 }]);
  });
  afterAll(async () => {
    await app.close();
    isolated.restore();
  });

  it('별칭은 카탈로그에 있는 음식만, 종류별 target 규칙을 검증하고, 목록·삭제가 된다', async () => {
    expect((await app.inject({ method: 'GET', url: URL })).statusCode).toBe(401);

    const bad = await app.inject({ method: 'POST', url: URL, headers: adminAuth, payload: { kind: 'alias', term: '불족', target: '없는음식' } });
    expect(bad.statusCode).toBe(400);
    const noTarget = await app.inject({ method: 'POST', url: URL, headers: adminAuth, payload: { kind: 'alias', term: '불족' } });
    expect(noTarget.statusCode).toBe(400);
    const extra = await app.inject({ method: 'POST', url: URL, headers: adminAuth, payload: { kind: 'set', term: '한상', target: 'x' } });
    expect(extra.statusCode).toBe(400);

    const ok = await app.inject({ method: 'POST', url: URL, headers: adminAuth, payload: { kind: 'alias', term: '불족', target: '족발', note: '테스트' } });
    expect(ok.statusCode).toBe(201);
    const created = ok.json() as { id: string; kind: string; term: string; target: string | null };
    expect(created).toMatchObject({ kind: 'alias', term: '불족', target: '족발' });
    const dup = await app.inject({ method: 'POST', url: URL, headers: adminAuth, payload: { kind: 'alias', term: '불족', target: '족발' } });
    expect(dup.statusCode).toBe(400);

    const list = await app.inject({ method: 'GET', url: `${URL}?kind=alias`, headers: adminAuth });
    expect(list.statusCode).toBe(200);
    const body = list.json() as { items: { id: string }[]; defaults: Record<string, number> };
    expect(body.items.map((i) => i.id)).toEqual([created.id]);
    expect(body.defaults.modifier).toBeGreaterThan(10);

    expect((await app.inject({ method: 'DELETE', url: `${URL}/${created.id}`, headers: adminAuth })).statusCode).toBe(204);
    expect((await app.inject({ method: 'DELETE', url: `${URL}/${created.id}`, headers: adminAuth })).statusCode).toBe(404);
  });
});
