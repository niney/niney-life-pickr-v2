import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { FoodWebEstimateService, type WebFetcher } from './food-web-estimate.service.js';
import { FOOD_WEB_ESTIMATE_VERSION } from './food-web-estimate.js';

const PAGE_CARBONARA =
  '<html><body>94중 1에서 10 <a>베이컨 까르보나라 파스타 (쉐프엠)</a> 1개 (230g)당 - 칼로리: 485kcal | 지방: 28.00g 영양 정보 - 비슷한 ' +
  '까르보나라 1 컵당 - 칼로리: 384kcal | 지방: 10.67g 다른 크기: 1 인분 - 384kcal , 100 g - 191kcal , 더보기 영양 정보 - 비슷한 ' +
  '까르보나라 파스타 (풀무원) 1인분 (230g)당 - 칼로리: 410kcal 영양 정보 - 비슷한</body></html>';
const PAGE_NONE = '<html><body>"항정살구이"의 검색결과가 없습니다.</body></html>';
// 어간 재질의("시샤모구이" → "시샤모") 로 브랜드만 붙은 단독 항목을 채택하는 경우.
const PAGE_SHISHAMO =
  '<html><body>3중 1에서 3 시샤모 (동원) 100g당 - 칼로리: 152kcal | 지방: 8.00g 영양 정보 - 비슷한 ' +
  '시샤모 튀김 도시락 (CU) 1인분 (350g)당 - 칼로리: 1050kcal 영양 정보 - 비슷한</body></html>';

const makeFakes = () => {
  const store = new Map<string, Record<string, unknown>>();
  const urls: string[] = [];
  const prisma = {
    foodWebEstimate: {
      findMany: async ({ where }: { where: { nameNorm: { in: string[] }; version: { gte: number } } }) =>
        [...store.values()].filter(
          (r) => where.nameNorm.in.includes(r.nameNorm as string) && (r.version as number) >= where.version.gte,
        ),
      upsert: async ({ where, create }: { where: { nameNorm: string }; create: Record<string, unknown> }) => {
        store.set(where.nameNorm, create);
        return {};
      },
    },
  } as unknown as PrismaClient;
  const fetcher: WebFetcher = async (url) => {
    urls.push(url);
    if (decodeURIComponent(url).includes('q=까르보나라')) return { status: 200, text: PAGE_CARBONARA };
    if (decodeURIComponent(url).includes('q=오류')) return { status: 503, text: '' };
    if (decodeURIComponent(url).includes('q=시샤모')) return { status: 200, text: PAGE_SHISHAMO };
    return { status: 200, text: PAGE_NONE };
  };
  return { prisma, fetcher, urls, store };
};

describe('FoodWebEstimateService', () => {
  it('페이지를 받아 집계·저장하고, 미채택도 저장해 다시 조회하지 않으며, 오류는 저장하지 않는다', async () => {
    const f = makeFakes();
    const svc = new FoodWebEstimateService(f.prisma, { fetcher: f.fetcher, intervalMs: 0 });

    const first = await svc.estimateMany(['까르보나라', '항정살구이', '오류', '시샤모구이']);
    expect(first.get('까르보나라')).toEqual({ kcalPer100g: 191, agreeing: 3, basis: 'multi', source: 'fatsecret.kr' });
    expect(first.get('항정살구이')).toBeNull();
    expect(first.has('오류')).toBe(false);
    // 결과 없음 → 어간 "시샤모" 재질의 → "시샤모 (동원)" 단독 채택. 항정살구이도 어간 재질의(항정살)를 한 번 한다.
    expect(first.get('시샤모구이')).toEqual({ kcalPer100g: 152, agreeing: 1, basis: 'single', source: 'fatsecret.kr' });
    expect(f.urls.map((u) => decodeURIComponent(u).split('q=')[1])).toEqual(['까르보나라', '항정살구이', '항정살', '오류', '시샤모구이', '시샤모']);
    expect(f.store.get('시샤모구이')).toMatchObject({ kcalPer100g: 152, sourceUrl: expect.stringContaining('q=%EC%8B%9C%EC%83%A4%EB%AA%A8') });
    expect(f.store.get('까르보나라')).toMatchObject({ kcalPer100g: 191, agreeing: 3, version: FOOD_WEB_ESTIMATE_VERSION });
    expect(f.store.get('항정살구이')).toMatchObject({ kcalPer100g: null, agreeing: 0 });
    expect(f.store.has('오류')).toBe(false);

    const cached = await svc.lookupCached(['까르보나라', '항정살구이', '오류']);
    expect(cached.get('까르보나라')?.kcalPer100g).toBe(191);
    expect(cached.get('항정살구이')).toBeNull();
    expect(cached.has('오류')).toBe(false);

    const second = await svc.estimateMany(['까르보나라', '항정살구이']);
    expect(second.size).toBe(0);
    expect(f.urls).toHaveLength(6);
  });
});
