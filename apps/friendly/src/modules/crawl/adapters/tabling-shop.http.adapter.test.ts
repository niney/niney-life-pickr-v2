import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchTablingShop,
  fetchTablingShopReviews,
} from './tabling-shop.http.adapter.js';

// 어댑터는 mobile-v2-api 를 fetch 로 직접 호출 — 전역 fetch 를 stub 해 픽스처로
// 파싱 동작만 검증한다(네트워크 없음). 검증 포인트는 라이브에서 실측으로 잡은
// 함정들: 리뷰 idx 가 ObjectId 문자열, 좌표 string→number, 페이지네이션 lastIdx.

const REVIEW_PAGE_SIZE = 20; // 어댑터 기본값(CRAWL_TABLING_REVIEW_PAGE_SIZE).

const fetchedUrls: string[] = [];

interface RouteResult {
  status?: number;
  json?: unknown;
}

const stubFetch = (handler: (url: string) => RouteResult): void => {
  fetchedUrls.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown) => {
      const url = String(input);
      fetchedUrls.push(url);
      const r = handler(url);
      const status = r.status ?? 200;
      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => r.json ?? {},
        text: async () => (r.json ? JSON.stringify(r.json) : ''),
        headers: { get: () => 'application/json' },
      } as unknown as Response;
    }),
  );
};

afterEach(() => vi.unstubAllGlobals());

const detailJson = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  idx: 27,
  name: '델리인디아',
  excerpt: '인도음식',
  description: '설명',
  categories: '아시아식',
  address: '서울 마포구 독막로9길 8',
  address1: '서울 마포구 독막로9길 8',
  address2: '서울 마포구 서교동 402-6',
  addressDetail: '2F',
  tel: '0226312109',
  latitude: '37.5486904',
  longitude: '126.9197444',
  rating: 5,
  ratings: [
    { category: 'TASTE', points: 5 },
    { category: 'SERVICE', points: 4.5 },
  ],
  reviewTotalCount: 17,
  favoriteCount: 5,
  restaurantStatusLabel: '영업중',
  restaurantImages: [
    'https://image.tabling.co.kr/prod/restaurant/a.jpg',
    'image.tabling.co.kr/prod/restaurant/b.jpg', // protocol 누락 → https 보강
  ],
  restaurantTimes: [
    {
      dayOfWeek: 1,
      dayStatus: 'BUSINESS',
      openTimeList: [{ startTime: '10:30', endTime: '21:00' }],
      breakTimeList: [],
    },
  ],
  waitingCount: 0,
  useWaiting: true,
  useRemoteWaiting: false,
  useReservation: true,
  useTakeOut: false,
  useOnSiteOrder: false,
  ...over,
});

const menuJson = (): Record<string, unknown> => ({
  list: [
    {
      categoryName: '메인',
      categoryDescription: null,
      menus: [
        { name: '버터난', price: 4000, description: '', imageUrl: null, isFeatured: false, isMain: true },
        { name: '치킨커리', price: 12000, isFeatured: false, isMain: false },
      ],
    },
  ],
});

const reviewItem = (idx: string, over: Record<string, unknown> = {}): Record<string, unknown> => ({
  idx,
  cursorId: '0500003009398',
  nickname: 'DR****',
  reviewDate: '2026-06-01',
  rating: 5,
  contents: '맛있어요',
  images: [],
  menuOrders: [],
  likeCount: 0,
  reply: null,
  isBlinded: false,
  ...over,
});

const route = (url: string, detail: RouteResult, menu: RouteResult, reviews: RouteResult): RouteResult => {
  if (url.includes('/menu')) return menu;
  if (url.includes('/review/')) return reviews;
  if (url.includes('/v1/restaurant/')) return detail;
  return { status: 404, json: {} };
};

describe('fetchTablingShop', () => {
  it('parses detail + menu + reviews; lat/lng → number, review idx kept as string', async () => {
    stubFetch((url) =>
      route(
        url,
        { json: detailJson() },
        { json: menuJson() },
        {
          json: {
            reviewTotalCount: 17,
            imageReviewTotalCount: 3,
            reviews: [reviewItem('699af7b33c0ba9cb785b0ed8')],
          },
        },
      ),
    );

    const d = await fetchTablingShop(27);

    expect(d.name).toBe('델리인디아');
    expect(d.category).toBe('아시아식');
    expect(d.lat).toBeCloseTo(37.5486904);
    expect(d.lng).toBeCloseTo(126.9197444);
    expect(d.phone).toBe('0226312109');
    expect(d.roadAddress).toBe('서울 마포구 독막로9길 8');
    expect(d.jibunAddress).toBe('서울 마포구 서교동 402-6');
    expect(d.ratings).toEqual([
      { category: 'TASTE', points: 5 },
      { category: 'SERVICE', points: 4.5 },
    ]);
    expect(d.images).toEqual([
      'https://image.tabling.co.kr/prod/restaurant/a.jpg',
      'https://image.tabling.co.kr/prod/restaurant/b.jpg',
    ]);
    expect(d.menuCategories[0]!.menus[0]).toMatchObject({ name: '버터난', price: 4000, isMain: true });
    expect(d.businessDays[0]).toMatchObject({ dayOfWeek: 1, dayStatus: 'BUSINESS' });
    expect(d.flags).toEqual({
      useWaiting: true,
      useRemoteWaiting: false,
      useReservation: true,
      useTakeOut: false,
      useOnSiteOrder: false,
    });
    // 리뷰 idx 는 ObjectId 문자열로 보존(숫자 파싱 금지) — 안 그러면 전부 필터링됨.
    expect(d.reviewsFirstPage.list).toHaveLength(1);
    expect(d.reviewsFirstPage.list[0]!.idx).toBe('699af7b33c0ba9cb785b0ed8');
    expect(d.reviewsFirstPage.totalCount).toBe(17);
    expect(d.source).toBe('http');
  });

  it('drops reviews without a usable idx', async () => {
    stubFetch((url) =>
      route(
        url,
        { json: detailJson() },
        { json: menuJson() },
        {
          json: {
            reviewTotalCount: 2,
            reviews: [reviewItem('abc123'), { nickname: 'x', contents: 'no idx' }],
          },
        },
      ),
    );
    const d = await fetchTablingShop(27);
    expect(d.reviewsFirstPage.list).toHaveLength(1);
    expect(d.reviewsFirstPage.list[0]!.idx).toBe('abc123');
  });

  it('extracts review image url (object form), menuOrders, and owner reply', async () => {
    stubFetch((url) =>
      route(
        url,
        { json: detailJson() },
        { json: menuJson() },
        {
          json: {
            reviews: [
              reviewItem('rv1', {
                images: [{ imageUrl: 'https://img/x.jpg' }, 'https://img/y.jpg'],
                menuOrders: ['버터난', { name: '치킨커리' }],
                reply: { contents: '감사합니다' },
              }),
            ],
          },
        },
      ),
    );
    const d = await fetchTablingShop(27);
    const rv = d.reviewsFirstPage.list[0]!;
    expect(rv.imageUrls).toEqual(['https://img/x.jpg', 'https://img/y.jpg']);
    expect(rv.menuOrders).toEqual(['버터난', '치킨커리']);
    expect(rv.reply).toBe('감사합니다');
    expect(rv.summaryText).toBeNull();
  });

  it('throws on 404 detail', async () => {
    stubFetch((url) => route(url, { status: 404, json: {} }, { json: {} }, { json: {} }));
    await expect(fetchTablingShop(999999)).rejects.toThrow();
  });
});

describe('fetchTablingShopReviews', () => {
  it('sends lastIdx=cursor and computes nextCursor=last idx on a full page', async () => {
    const reviews = Array.from({ length: REVIEW_PAGE_SIZE }, (_, i) =>
      reviewItem(`id-${i}`),
    );
    stubFetch(() => ({ json: { reviewTotalCount: 100, reviews } }));

    const resp = await fetchTablingShopReviews(27, 'CURSOR_X');

    expect(fetchedUrls[0]).toContain('lastIdx=CURSOR_X');
    expect(fetchedUrls[0]).toContain('pageSize=20');
    expect(resp.list).toHaveLength(REVIEW_PAGE_SIZE);
    // 다음 커서 = 마지막 리뷰의 idx(cursorId 아님).
    expect(resp.nextCursor).toBe(`id-${REVIEW_PAGE_SIZE - 1}`);
  });

  it('returns null nextCursor when page is not full, and omits lastIdx when no cursor', async () => {
    stubFetch(() => ({ json: { reviewTotalCount: 1, reviews: [reviewItem('only')] } }));
    const resp = await fetchTablingShopReviews(27, null);
    expect(fetchedUrls[0]).not.toContain('lastIdx');
    expect(resp.nextCursor).toBeNull();
    expect(resp.list).toHaveLength(1);
  });
});
