import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  FoodAdminListResultType,
  FoodAdminStatsType,
  FoodImportConfigType,
  FoodImportRunListType,
  FoodImportRunType,
  FoodItemType,
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
    adminAuth = { authorization: `Bearer ${app.jwt.sign({ userId: 'food-admin', email: 'a@x.com', role: 'ADMIN' })}` };
    userAuth = { authorization: `Bearer ${app.jwt.sign({ userId: 'food-user', email: 'u@x.com', role: 'USER' })}` };
    await upsertFoodSeeds(app.prisma, [
      { name: '김치찌개', dishType: 'stew', source: 'mfds-nutrition', sourceId: 'D1', popularity: 10 },
      { name: '된장찌개', dishType: 'stew', source: 'mfds-nutrition', sourceId: 'D2', popularity: 5 },
      { name: '비빔밥', dishType: 'rice', source: 'mfds-recipe', sourceId: 'R1' },
    ]);
  });
  afterAll(async () => {
    await app.close();
    isolated.restore();
  });

  it('검색은 인증 필수, q 없으면 400, 결과는 계약 모양', async () => {
    expect((await app.inject({ method: 'GET', url: `${SEARCH}?q=찌개` })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: SEARCH, headers: userAuth })).statusCode).toBe(400);
    const res = await app.inject({ method: 'GET', url: `${SEARCH}?q=찌개&limit=5`, headers: userAuth });
    expect(res.statusCode).toBe(200);
    const body = res.json<FoodSearchResultType>();
    expect(body.items.map((i) => i.name)).toEqual(['김치찌개', '된장찌개']);
    expect(body.items[0]).toMatchObject({ dishType: 'stew', popularity: 10 });
  });

  it('어드민 목록은 ADMIN 만, 필터·정렬·페이지', async () => {
    expect((await app.inject({ method: 'GET', url: ADMIN_ITEMS, headers: userAuth })).statusCode).toBe(403);
    const all = await app.inject({ method: 'GET', url: `${ADMIN_ITEMS}?sort=name`, headers: adminAuth });
    expect(all.statusCode).toBe(200);
    const list = all.json<FoodAdminListResultType>();
    expect(list.total).toBe(3);
    expect(list.items.map((i) => i.name)).toEqual(['김치찌개', '된장찌개', '비빔밥']);

    const stew = await app.inject({ method: 'GET', url: `${ADMIN_ITEMS}?dishType=stew&limit=1&offset=1`, headers: adminAuth });
    const stewList = stew.json<FoodAdminListResultType>();
    expect(stewList.total).toBe(2);
    expect(stewList.items).toHaveLength(1);

    const unclassified = await app.inject({ method: 'GET', url: `${ADMIN_ITEMS}?unclassified=1`, headers: adminAuth });
    // 이름 규칙이 mainIngredient/cuisine 을 못 채운 행만(비빔밥은 채소/한식으로 채워짐 가능) — total 은 0 이상.
    expect(unclassified.statusCode).toBe(200);
  });

  it('수기 등록 201 → 중복 409, 편집 200, 없는 id 404', async () => {
    const created = await app.inject({
      method: 'POST',
      url: ADMIN_ITEMS,
      headers: adminAuth,
      payload: { name: '마라탕', aliases: ['마라탕면'], dishType: 'stew', cuisine: 'chinese' },
    });
    expect(created.statusCode).toBe(201);
    const item = created.json<FoodItemType>();
    expect(item).toMatchObject({ name: '마라탕', source: 'manual', aliases: ['마라탕면'], cuisine: 'chinese' });

    const dup = await app.inject({ method: 'POST', url: ADMIN_ITEMS, headers: adminAuth, payload: { name: '마라 탕' } });
    expect(dup.statusCode).toBe(409);

    const patched = await app.inject({
      method: 'PATCH',
      url: `${ADMIN_ITEMS}/${item.id}`,
      headers: adminAuth,
      payload: { mainIngredient: 'other_meat', active: false, repName: '마라탕' },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json<FoodItemType>()).toMatchObject({ mainIngredient: 'other_meat', active: false, repName: '마라탕' });

    const missing = await app.inject({ method: 'PATCH', url: `${ADMIN_ITEMS}/nope`, headers: adminAuth, payload: { active: true } });
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
      payload: { enabled: true, cronExpr: 'not a cron', timezone: 'Asia/Seoul', sources: ['menu-canonical'], classify: false },
    });
    expect(bad.statusCode).toBe(400);

    const saved = await app.inject({
      method: 'PUT',
      url: IMPORT,
      headers: adminAuth,
      payload: { enabled: false, cronExpr: '0 4 1 * *', timezone: 'Asia/Seoul', sources: ['menu-canonical'], classify: false },
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json<FoodImportConfigType>()).toMatchObject({ enabled: false, sources: ['menu-canonical'], classify: false, nextRunAt: null });

    const preview = await app.inject({ method: 'POST', url: `${IMPORT}/preview`, headers: adminAuth, payload: { cronExpr: '0 4 1 * *' } });
    expect(preview.json<{ valid: boolean; nextRuns: string[] }>()).toMatchObject({ valid: true });
    expect(preview.json<{ nextRuns: string[] }>().nextRuns).toHaveLength(5);

    // 빈 격리 DB 라 global_menu_canonicals 0행 — 소스 오류 없이 done, fetched 0.
    const run = await app.inject({ method: 'POST', url: `${IMPORT}/run`, headers: adminAuth, payload: { sources: ['menu-canonical'], classify: false } });
    expect(run.statusCode).toBe(200);
    const r = run.json<FoodImportRunType>();
    expect(r).toMatchObject({ trigger: 'manual', status: 'done', sources: ['menu-canonical'], phase: null, progress: null });
    expect(r.stats).toEqual([{ source: 'menu-canonical', fetched: 0, inserted: 0, updated: 0, skipped: 0, error: null }]);

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
