import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { MealStoryFoodResultType, MealStoryListResultType, MealStoryType } from '@repo/api-contract';
import { buildApp } from '../../app.js';
import { env } from '../../config/env.js';
import { seedAuthUsers } from '../../test-utils/seed-users.js';
import { useIsolatedDatabase, type IsolatedDatabase } from '../../test-utils/temp-db.js';
import { upsertFoodSeeds } from '../food/food-import.service.js';

// 건강식단 스토리 API — 누구나 게시본을 보고(초안은 관리자만), 사진은 인증 없이, [이 레시피로 기록]은 로그인해 레시피를
// 카탈로그 음식으로 맞춘다(한 번 만들고 다시 부르면 같은 음식). 공유 링크는 OG 를 넣은 index.html.

const LIST = '/api/v1/meal-stories';
const WEB_INDEX = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../web/index.html');

const story = (slug: string, status: 'draft' | 'published', title: string) => ({
  slug,
  status,
  title,
  summary: `${title} 요약`,
  topic: { nutrient: 'sodium', direction: 'reduce' },
  publishedAt: status === 'published' ? '2026-11-09' : '2026-11-10',
  reviewedAt: status === 'published' ? '2026-11-09' : null,
  ...(status === 'published' ? { cover: 'cover.jpg' } : {}),
  sources: [],
  foods: [{ id: 'noodle', label: '국수', ref: { db: 'raw', code: 'R101-000000001-0000' } }],
  recipe: {
    name: '시험 저염 파스타',
    servings: 1,
    dishType: 'noodle',
    ingredients: [{ food: 'noodle', grams: 200, label: '국수 200g' }],
    steps: [{ text: '삶는다' }],
  },
  scenes: [
    { type: 'cover', kicker: '시험', title },
    { type: 'nutrition', title: '영양', nutrients: ['kcal', 'sodiumMg'] },
    { type: 'outro', title: '끝', actions: ['record'] },
  ],
});

const foodsJson = {
  generatedBy: 'build:meal-stories',
  foods: {
    noodle: {
      per100: { kcal: 350, carbG: 70, proteinG: 12, fatG: 1, sodiumMg: 5, potassiumMg: 200 },
      basis: '100g',
      provenance: '시험',
      source: 'mfds-raw',
    },
  },
};

describe('meal story routes (픽스처 폴더 · 격리 DB)', () => {
  let app: FastifyInstance;
  let isolated: IsolatedDatabase;
  let dir: string;
  let user: { authorization: string };
  let admin: { authorization: string };
  const prevDir = process.env.MEAL_STORY_DIR;
  const prevIndex = env.WEB_INDEX_PATH;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'meal-stories-'));
    for (const [slug, status, title] of [
      ['pub-story', 'published', '게시한 이야기'],
      ['draft-story', 'draft', '쓰는 중인 이야기'],
    ] as const) {
      mkdirSync(join(dir, slug, 'images'), { recursive: true });
      writeFileSync(join(dir, slug, 'story.json'), JSON.stringify(story(slug, status, title)));
      writeFileSync(join(dir, slug, 'foods.json'), JSON.stringify(foodsJson));
    }
    writeFileSync(join(dir, 'pub-story', 'images', 'cover.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    // 형식이 틀린 원고는 건너뛴다(다른 스토리는 그대로).
    mkdirSync(join(dir, 'broken-story'));
    writeFileSync(join(dir, 'broken-story', 'story.json'), '{"slug":"broken-story"}');
    process.env.MEAL_STORY_DIR = dir;
    env.WEB_INDEX_PATH = WEB_INDEX;

    isolated = await useIsolatedDatabase();
    app = await buildApp({ logger: false });
    await app.ready();
    await seedAuthUsers(app, [
      { id: 'story-user', role: 'USER' },
      { id: 'story-admin', role: 'ADMIN' },
    ]);
    user = { authorization: `Bearer ${app.jwt.sign({ userId: 'story-user', email: 'u@x.com', role: 'USER' })}` };
    admin = { authorization: `Bearer ${app.jwt.sign({ userId: 'story-admin', email: 'a@x.com', role: 'ADMIN' })}` };
  });

  afterAll(async () => {
    await app.close();
    isolated.restore();
    if (prevDir === undefined) delete process.env.MEAL_STORY_DIR;
    else process.env.MEAL_STORY_DIR = prevDir;
    env.WEB_INDEX_PATH = prevIndex;
    rmSync(dir, { recursive: true, force: true });
  });

  it('목록 — 누구나 게시본만, 관리자는 초안도(게시일 최근 순), 형식이 틀린 원고는 빠진다', async () => {
    const anon = (await app.inject({ method: 'GET', url: LIST })).json<MealStoryListResultType>();
    expect(anon.items.map((s) => s.slug)).toEqual(['pub-story']);
    expect(anon.items[0]).toMatchObject({ title: '게시한 이야기', sceneCount: 3, topic: { nutrient: 'sodium' } });
    expect(anon.items[0]!.coverUrl).toMatch(/^\/api\/v1\/meal-stories\/pub-story\/images\/cover\.jpg\?v=\d+$/);
    const all = (await app.inject({ method: 'GET', url: LIST, headers: admin })).json<MealStoryListResultType>();
    expect(all.items.map((s) => s.slug)).toEqual(['draft-story', 'pub-story']);
  });

  it('한 편 — 숫자는 서버가 계산, 초안은 관리자만(아니면 404)', async () => {
    const res = await app.inject({ method: 'GET', url: `${LIST}/pub-story` });
    expect(res.statusCode).toBe(200);
    const body = res.json<MealStoryType>();
    const nutrition = body.scenes.find((s) => s.type === 'nutrition');
    expect(nutrition?.type === 'nutrition' && nutrition.rows.map((r) => r.figure.value)).toEqual([700, 10]);
    expect(body.sources.map((s) => s.id)).toEqual(['mfds-raw']);
    expect((await app.inject({ method: 'GET', url: `${LIST}/draft-story` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `${LIST}/draft-story`, headers: user })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `${LIST}/draft-story`, headers: admin })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `${LIST}/no-such` })).statusCode).toBe(404);
  });

  it('사진 — 인증 없이, ?v= 가 붙으면 오래 캐시, 없는 파일·이상한 이름은 거른다', async () => {
    const list = (await app.inject({ method: 'GET', url: LIST })).json<MealStoryListResultType>();
    const res = await app.inject({ method: 'GET', url: list.items[0]!.coverUrl! });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/jpeg');
    expect(res.headers['cache-control']).toContain('immutable');
    expect((await app.inject({ method: 'GET', url: `${LIST}/pub-story/images/cover.jpg` })).headers['cache-control']).toBe(
      'public, max-age=3600',
    );
    expect((await app.inject({ method: 'GET', url: `${LIST}/pub-story/images/missing.jpg` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `${LIST}/pub-story/images/..%2Fstory.json` })).statusCode).toBe(400);
  });

  it('이 레시피로 기록 — 로그인 필요, 이름이 겹치면 (건강식단)을 붙여 만들고, 다시 부르면 같은 음식', async () => {
    expect((await app.inject({ method: 'POST', url: `${LIST}/pub-story/food` })).statusCode).toBe(401);
    // 같은 이름의 다른 음식이 이미 있다.
    await upsertFoodSeeds(app.prisma, [{ name: '시험 저염 파스타', source: 'mfds-recipe', sourceId: 'X1' }]);
    const first = await app.inject({ method: 'POST', url: `${LIST}/pub-story/food`, headers: user });
    expect(first.statusCode).toBe(200);
    const made = first.json<MealStoryFoodResultType>();
    expect(made).toMatchObject({ name: '시험 저염 파스타', dishType: 'noodle' });
    const row = await app.prisma.foodItem.findUnique({ where: { id: made.foodId } });
    expect(row).toMatchObject({
      name: '시험 저염 파스타(건강식단)',
      source: 'manual',
      sourceId: 'meal-story:pub-story',
      servingG: 200,
      kcal: 700,
      sodiumMg: 10,
      kcalPer100g: 350,
      nutritionFrom: null,
    });
    expect(JSON.parse(row!.nutrientsPer100gJson!)).toMatchObject({ proteinG: 12, potassiumMg: 200 });
    const again = (await app.inject({ method: 'POST', url: `${LIST}/pub-story/food`, headers: user })).json<MealStoryFoodResultType>();
    expect(again.foodId).toBe(made.foodId);
    // 초안은 관리자만 — 레시피 이름이 게시본과 같아 '(건강식단)'까지 쓰였으면 slug 를 붙인다.
    expect((await app.inject({ method: 'POST', url: `${LIST}/draft-story/food`, headers: user })).statusCode).toBe(404);
    const draft = await app.inject({ method: 'POST', url: `${LIST}/draft-story/food`, headers: admin });
    expect(draft.statusCode).toBe(200);
    const draftRow = await app.prisma.foodItem.findUnique({ where: { id: draft.json<MealStoryFoodResultType>().foodId } });
    expect(draftRow?.name).toBe('시험 저염 파스타(건강식단·draft-story)');
  });

  it('공유 링크 — 게시본은 제목·요약·표지로 OG, 초안·없는 스토리는 기본 미리보기', async () => {
    const pub = await app.inject({ method: 'GET', url: '/meal/stories/pub-story' });
    expect(pub.statusCode).toBe(200);
    expect(pub.body).toContain('<meta property="og:title" content="건강식단 · 게시한 이야기" />');
    expect(pub.body).toMatch(/og:image" content="http[^"]+\/api\/v1\/meal-stories\/pub-story\/images\/cover\.jpg\?v=\d+"/);
    const draft = await app.inject({ method: 'GET', url: '/meal/stories/draft-story' });
    expect(draft.body).toContain('Life Pickr 건강식단');
    expect(draft.body).not.toContain('쓰는 중인 이야기');
    expect((await app.inject({ method: 'GET', url: '/meal/stories' })).body).toContain('Life Pickr 건강식단');
  });
});
