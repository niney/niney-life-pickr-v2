import { describe, expect, it } from 'vitest';
import type {
  DiningcodeShopDataType,
  NaverPlaceDataType,
} from '@repo/api-contract';
import {
  composeDiningcodeAddon,
  computeSources,
  computeStoredReviewCount,
  mergeAddress,
  mergeBlogReviews,
  mergeBusinessHours,
  mergeCategory,
  mergeCoordinates,
  mergeMenus,
  mergeName,
  mergePhone,
  mergePhotos,
  mergeRating,
  mergeReviewCount,
  type DiningcodeSnapshot,
  type MergeRestaurantRow,
  type NaverSnapshot,
} from './restaurant.merge.js';

const naverSnap = (over: Partial<NaverSnapshot> = {}): NaverSnapshot => ({
  placeId: 'p1',
  name: 'N가게',
  category: '한식',
  address: '서울',
  roadAddress: '서울 도로명',
  phone: '02-000',
  businessHours: '09:00-22:00',
  latitude: 37.5,
  longitude: 127.0,
  imageUrls: ['https://n.example/1.jpg'],
  rating: 4.2,
  reviewCount: 100,
  menus: [],
  reviewStats: null,
  blogReviews: [],
  rawSourceUrl: 'https://map.naver.com/p',
  ...over,
});

const dcSnap = (over: Partial<DiningcodeSnapshot> = {}): DiningcodeSnapshot => ({
  vRid: 'v1',
  name: 'DC가게',
  branch: null,
  fullName: 'DC가게',
  area: '강남',
  categories: ['한식', '분식'],
  descTags: ['분위기좋은', '데이트'],
  score: 88,
  address: '서울 강남',
  roadAddress: '서울 강남 도로',
  phone: '02-111',
  lat: 37.51,
  lng: 127.01,
  thumbnailUrl: null,
  images: [],
  photos: [],
  tags: ['백년가게'],
  facilities: ['주차'],
  status: null,
  businessHours: [{ duration: '월요일', time: '09:00-22:00', today: false }],
  businessHoursSummary: [{ duration: '매일', time: '09:00-22:00', today: true }],
  menus: [],
  menuTotalCount: 0,
  hasPopularMenu: false,
  scoreDetail: null,
  blogsFirstPage: { page: 1, totalPage: 0, list: [] },
  wordcloudUrl: 'https://dc.example/wc.png',
  wordcloudUrlMobile: null,
  rawSourceUrl: 'https://www.diningcode.com/profile.php?rid=v1',
  fetchedAt: '2026-01-01T00:00:00.000Z',
  elapsedMs: 100,
  source: 'http',
  ...over,
});

const row = (over: Partial<MergeRestaurantRow> = {}): MergeRestaurantRow => ({
  name: 'N가게',
  category: '한식',
  address: '서울',
  phone: '02-000',
  rating: 4.2,
  reviewCount: 100,
  rawSourceUrl: 'https://map.naver.com/p',
  ...over,
});

describe('mergeName', () => {
  it('uses Naver name when present', () => {
    expect(mergeName(row({ name: 'N' }), dcSnap())).toBe('N');
  });
  it('falls back to DC fullName when Naver absent', () => {
    expect(mergeName(null, dcSnap({ fullName: 'D' }))).toBe('D');
  });
});

describe('mergeCategory', () => {
  it('Naver category wins', () => {
    expect(mergeCategory(row({ category: '한식' }), dcSnap({ categories: ['양식'] }))).toBe('한식');
  });
  it('falls back to DC categories joined', () => {
    expect(mergeCategory(row({ category: null }), dcSnap({ categories: ['한식', '분식'] }))).toBe(
      '한식 · 분식',
    );
  });
  it('returns null when both empty', () => {
    expect(mergeCategory(row({ category: null }), dcSnap({ categories: [] }))).toBeNull();
  });
});

describe('mergeAddress', () => {
  it('Naver address+roadAddress win', () => {
    const got = mergeAddress(
      row({ address: 'N주소' }),
      naverSnap({ roadAddress: 'N도로명' }),
      dcSnap({ address: 'D주소', roadAddress: 'D도로명' }),
    );
    expect(got).toEqual({ address: 'N주소', roadAddress: 'N도로명' });
  });
  it('falls back to DC when Naver missing', () => {
    const got = mergeAddress(
      row({ address: null }),
      naverSnap({ roadAddress: null }),
      dcSnap({ address: 'D주소', roadAddress: 'D도로명' }),
    );
    expect(got).toEqual({ address: 'D주소', roadAddress: 'D도로명' });
  });
});

describe('mergePhone', () => {
  it('Naver wins, DC fills', () => {
    expect(mergePhone(row({ phone: '02-111' }), dcSnap({ phone: '02-222' }))).toBe('02-111');
    expect(mergePhone(row({ phone: null }), dcSnap({ phone: '02-222' }))).toBe('02-222');
    expect(mergePhone(null, dcSnap({ phone: '02-222' }))).toBe('02-222');
  });
});

describe('mergeCoordinates', () => {
  it('Naver coords win, DC fills', () => {
    expect(
      mergeCoordinates(
        naverSnap({ latitude: 37.5, longitude: 127.0 }),
        dcSnap({ lat: 38, lng: 128 }),
      ),
    ).toEqual({ latitude: 37.5, longitude: 127.0 });
    expect(
      mergeCoordinates(
        naverSnap({ latitude: null, longitude: null }),
        dcSnap({ lat: 38, lng: 128 }),
      ),
    ).toEqual({ latitude: 38, longitude: 128 });
  });
});

describe('mergeBusinessHours', () => {
  it('DC summary wins over Naver text', () => {
    const got = mergeBusinessHours(
      naverSnap({ businessHours: '09:00-22:00' }),
      dcSnap({
        businessHoursSummary: [
          { duration: '매일', time: '08:00-23:00', today: true },
        ],
      }),
    );
    expect(got).toBe('매일 08:00-23:00');
  });
  it('joins multiple summary lines', () => {
    const got = mergeBusinessHours(
      null,
      dcSnap({
        businessHoursSummary: [
          { duration: '평일', time: '09-22', today: false },
          { duration: '주말', time: '10-23', today: true },
        ],
      }),
    );
    expect(got).toBe('평일 09-22\n주말 10-23');
  });
  it('falls back to Naver text when DC summary empty', () => {
    const got = mergeBusinessHours(
      naverSnap({ businessHours: '09-22' }),
      dcSnap({ businessHoursSummary: [] }),
    );
    expect(got).toBe('09-22');
  });
  it('returns null when neither has value', () => {
    expect(
      mergeBusinessHours(naverSnap({ businessHours: null }), dcSnap({ businessHoursSummary: [] })),
    ).toBeNull();
  });
});

describe('mergeRating + mergeReviewCount', () => {
  it('Naver wins, DC fills', () => {
    expect(mergeRating(row({ rating: 4.2 }), dcSnap({ scoreDetail: null }))).toBe(4.2);
    expect(
      mergeRating(
        row({ rating: null }),
        dcSnap({
          scoreDetail: {
            average: 4.6,
            total: 100,
            reviewTotal: 80,
            taste: null,
            service: null,
            price: null,
            clean: null,
            distribution: { s5: 1, s4_5: 0, s4: 0, s3_5: 0, s3: 0, s2: 0, s1: 0 },
            tasteInfo: null,
            priceInfo: null,
            serviceInfo: null,
            cleanInfo: null,
            text: null,
          },
        }),
      ),
    ).toBe(4.6);
  });
  it('reviewCount Naver wins, DC fills with reviewTotal', () => {
    expect(mergeReviewCount(row({ reviewCount: 100 }), dcSnap({ scoreDetail: null }))).toBe(100);
    expect(
      mergeReviewCount(
        row({ reviewCount: null }),
        dcSnap({
          scoreDetail: {
            average: null,
            total: 50,
            reviewTotal: 42,
            taste: null,
            service: null,
            price: null,
            clean: null,
            distribution: { s5: 0, s4_5: 0, s4: 0, s3_5: 0, s3: 0, s2: 0, s1: 0 },
            tasteInfo: null,
            priceInfo: null,
            serviceInfo: null,
            cleanInfo: null,
            text: null,
          },
        }),
      ),
    ).toBe(42);
  });
});

describe('mergePhotos', () => {
  it('combines Naver imageUrls + DC photos/images and dedups by URL', () => {
    const got = mergePhotos(
      naverSnap({ imageUrls: ['https://a.example/1.jpg', 'https://shared.example/x.jpg'] }),
      dcSnap({
        photos: [
          { pdId: 'p1', origin: 'https://dc.example/p1.jpg', thumb: 'x', middle: 'y', uploaderName: null, uploaderProfileImg: null, date: null, type: null },
          { pdId: null, origin: 'https://shared.example/x.jpg', thumb: 'x', middle: 'y', uploaderName: null, uploaderProfileImg: null, date: null, type: null },
        ],
        images: [
          { pdId: null, origin: 'https://dc.example/i1.jpg', thumb: 'x', middle: 'y', uploaderName: null, uploaderProfileImg: null, date: null, type: null },
        ],
      }),
    );
    expect(got).toEqual([
      'https://a.example/1.jpg',
      'https://shared.example/x.jpg',
      'https://dc.example/p1.jpg',
      'https://dc.example/i1.jpg',
    ]);
  });
  it('empty when both empty', () => {
    expect(mergePhotos(naverSnap({ imageUrls: [] }), dcSnap({ photos: [], images: [] }))).toEqual(
      [],
    );
  });
});

describe('mergeMenus', () => {
  it('Naver menus win when non-empty', () => {
    const naverMenu = {
      name: 'N메뉴',
      price: '10000',
      description: null,
      recommend: true,
      imageUrls: ['https://a.example/m.jpg'],
    };
    const got = mergeMenus(
      naverSnap({ menus: [naverMenu] }),
      dcSnap({
        menus: [
          { name: 'D메뉴', price: '20000', description: null, rank: 1, best: true, selectionCount: 0, selectionRate: 0, reviewCount: 0, commentCount: 0 },
        ],
      }),
    );
    expect(got).toEqual([naverMenu]);
  });
  it('DC menus mapped when Naver empty', () => {
    const got = mergeMenus(
      naverSnap({ menus: [] }),
      dcSnap({
        menus: [
          {
            name: 'D메뉴',
            price: '20000',
            description: '설명',
            rank: 1,
            best: true,
            selectionCount: 5,
            selectionRate: 80,
            reviewCount: 10,
            commentCount: 2,
          },
        ],
      }),
    );
    expect(got).toEqual([
      { name: 'D메뉴', price: '20000', description: '설명', recommend: true, imageUrls: [] },
    ]);
  });
});

describe('mergeBlogReviews', () => {
  it('combines Naver blogReviews + DC blogsFirstPage and dedups by URL', () => {
    const got = mergeBlogReviews(
      naverSnap({
        blogReviews: [
          {
            type: 'naverblog',
            title: 'Naver 블로그',
            excerpt: '내용',
            url: 'https://blog.naver.com/x',
            thumbnailUrls: ['https://t.example/1.jpg'],
            date: '2025-12-01',
            authorName: 'naver-user',
          },
        ],
      }),
      dcSnap({
        blogsFirstPage: {
          page: 1,
          totalPage: 1,
          list: [
            {
              pId: 'b1',
              title: 'DC 블로그',
              url: 'tistory.com/blog',
              contents: 'DC 내용',
              nickname: 'dc-user',
              image: null,
              site: 'tistory',
              date: '11시간 전',
            },
            // 중복 URL — Naver 의 blog.naver.com/x 와 동일 (https 정규화 후).
            {
              pId: 'b2',
              title: 'should be skipped',
              url: 'https://blog.naver.com/x',
              contents: null,
              nickname: null,
              image: null,
              site: 'naver',
              date: null,
            },
          ],
        },
      }),
    );
    expect(got.map((b) => b.url)).toEqual([
      'https://blog.naver.com/x',
      'https://tistory.com/blog',
    ]);
    expect(got[1]?.type).toBe('tistory');
  });
});

describe('computeSources', () => {
  it('returns both when present', () => {
    const got = computeSources(
      row({ rating: 4.2, reviewCount: 100, rawSourceUrl: 'https://n.example' }),
      naverSnap({ placeId: 'pid' }),
      {
        vRid: 'v1',
        rating: 4.6,
        siteReviewCount: 42,
        rawSourceUrl: 'https://www.diningcode.com/profile.php?rid=v1',
      },
    );
    expect(got).toEqual({
      naver: {
        placeId: 'pid',
        rating: 4.2,
        siteReviewCount: 100,
        rawSourceUrl: 'https://n.example',
      },
      diningcode: {
        vRid: 'v1',
        rating: 4.6,
        siteReviewCount: 42,
        rawSourceUrl: 'https://www.diningcode.com/profile.php?rid=v1',
      },
    });
  });
  it('returns null sides when missing', () => {
    expect(computeSources(null, null, null)).toEqual({ naver: null, diningcode: null });
  });
});

describe('computeStoredReviewCount', () => {
  it('sums correctly', () => {
    expect(computeStoredReviewCount(60, 42)).toEqual({ naver: 60, diningcode: 42, total: 102 });
    expect(computeStoredReviewCount(0, 0)).toEqual({ naver: 0, diningcode: 0, total: 0 });
  });
});

describe('composeDiningcodeAddon', () => {
  it('flattens snapshot into addon shape', () => {
    const snap = dcSnap({
      descTags: ['tag1'],
      facilities: ['parking'],
      tags: ['cert'],
      wordcloudUrl: 'https://wc.example/w.png',
      businessHoursSummary: [{ duration: '매일', time: '09-22', today: true }],
      businessHours: [{ duration: '월', time: '09-22', today: false }],
      scoreDetail: {
        average: 4.6,
        total: 50,
        reviewTotal: 42,
        taste: 4.7,
        service: 4.4,
        price: 4.2,
        clean: null,
        distribution: { s5: 30, s4_5: 5, s4: 4, s3_5: 1, s3: 1, s2: 0, s1: 1 },
        tasteInfo: null,
        priceInfo: null,
        serviceInfo: null,
        cleanInfo: null,
        text: '평가 신뢰',
      },
    });
    const got = composeDiningcodeAddon(snap);
    expect(got.descTags).toEqual(['tag1']);
    expect(got.facilities).toEqual(['parking']);
    expect(got.tags).toEqual(['cert']);
    expect(got.wordcloudUrl).toBe('https://wc.example/w.png');
    expect(got.businessHoursSummary).toHaveLength(1);
    expect(got.businessHoursWeekly).toHaveLength(1);
    expect(got.scoreDetail).toEqual({
      average: 4.6,
      total: 50,
      reviewTotal: 42,
      taste: 4.7,
      service: 4.4,
      price: 4.2,
      clean: null,
      distribution: { s5: 30, s4_5: 5, s4: 4, s3_5: 1, s3: 1, s2: 0, s1: 1 },
      text: '평가 신뢰',
    });
  });
  it('handles missing scoreDetail', () => {
    expect(composeDiningcodeAddon(dcSnap({ scoreDetail: null })).scoreDetail).toBeNull();
  });
});
