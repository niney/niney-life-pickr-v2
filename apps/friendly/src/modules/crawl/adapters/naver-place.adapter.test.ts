import { describe, expect, it } from 'vitest';
import {
  __test_extractBaeminMenuGroups as extractBaeminMenuGroups,
  __test_flattenMenuGroups as flattenMenuGroups,
  __test_isVisitorReviewsGraphqlRequestBody as isVisitorReviewsGraphqlRequestBody,
  __test_parseVisitorReviewsFromCaptured as parseVisitorReviews,
  __test_resolveMenuGroups as resolveMenuGroups,
} from './naver-place.playwright.adapter.js';

// Minimal wire shape mimicking what Naver returns from the visitor reviews
// graphql endpoint. `media` carries a mix of image and video entries — the
// adapter should put videos under `videos` and images under `imageUrls`,
// never both.
const captured = [
  {
    data: {
      visitorReviews: {
        items: [
          {
            id: 'rev-1',
            body: '맛있어요',
            authorName: '익명',
            rating: 5,
            visited: '2026-05-01',
            media: [
              {
                __typename: 'VisitorReviewMedia',
                type: 'video',
                thumbnail: 'https://video-phinf.pstatic.net/abc/poster.jpg',
                videoId: 'V1',
                videoUrl: 'vod3://...',
                trailerUrl: 'https://a02-g-smp-vod.akamaized.net/foo/bar.mp4?hdnts=exp%3D1',
              },
              {
                __typename: 'VisitorReviewMedia',
                type: 'image',
                thumbnail: 'https://pup-review-phinf.pstatic.net/img1.jpg?type=w1500',
              },
              {
                __typename: 'VisitorReviewMedia',
                type: 'image',
                thumbnail: 'https://pup-review-phinf.pstatic.net/img2.jpg?type=w1500',
              },
            ],
          },
        ],
      },
    },
  },
];

describe('visitor review media extraction', () => {
  it('separates video media into videos[] and keeps imageUrls image-only', () => {
    const reviews = parseVisitorReviews(captured);
    expect(reviews).toHaveLength(1);
    const r = reviews[0]!;

    expect(r.videos).toEqual([
      {
        posterUrl: 'https://video-phinf.pstatic.net/abc/poster.jpg',
        videoUrl: 'https://a02-g-smp-vod.akamaized.net/foo/bar.mp4?hdnts=exp%3D1',
      },
    ]);

    // Video poster JPEG must NOT leak into imageUrls — it belongs in videos[].
    expect(r.imageUrls.some((u) => u.includes('video-phinf.pstatic.net'))).toBe(false);
    expect(r.imageUrls.length).toBeGreaterThan(0);
    for (const u of r.imageUrls) {
      expect(u).toMatch(/pup-review-phinf\.pstatic\.net/);
    }
  });

  it('does not cap collected media — returns all images and videos', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      __typename: 'VisitorReviewMedia',
      type: 'image' as const,
      thumbnail: `https://pup-review-phinf.pstatic.net/img${i}.jpg`,
    }));
    const videos = Array.from({ length: 8 }, (_, i) => ({
      __typename: 'VisitorReviewMedia',
      type: 'video' as const,
      thumbnail: `https://video-phinf.pstatic.net/p${i}.jpg`,
      trailerUrl: `https://a02-g-smp-vod.akamaized.net/v${i}.mp4`,
    }));
    const wire = [
      {
        data: {
          visitorReviews: {
            items: [{ id: 'rev-3', body: '많아요', media: [...many, ...videos] }],
          },
        },
      },
    ];
    const reviews = parseVisitorReviews(wire);
    expect(reviews[0]!.imageUrls).toHaveLength(12);
    expect(reviews[0]!.videos).toHaveLength(8);
  });

  it('returns empty videos[] when review has no video media', () => {
    const onlyImages = [
      {
        data: {
          visitorReviews: {
            items: [
              {
                id: 'rev-2',
                body: '굿',
                media: [
                  {
                    __typename: 'VisitorReviewMedia',
                    type: 'image',
                    thumbnail: 'https://pup-review-phinf.pstatic.net/x.jpg',
                  },
                ],
              },
            ],
          },
        },
      },
    ];
    const reviews = parseVisitorReviews(onlyImages);
    expect(reviews).toHaveLength(1);
    expect(reviews[0]!.videos).toEqual([]);
  });
});

describe('visitor review pagination response guard', () => {
  it('accepts only getVisitorReviews operations, not unrelated GraphQL traffic', () => {
    expect(
      isVisitorReviewsGraphqlRequestBody({
        operationName: 'getVisitorReviews',
        variables: { input: { businessId: '19878532', after: 'cursor' } },
      }),
    ).toBe(true);
    expect(
      isVisitorReviewsGraphqlRequestBody([
        { operationName: 'getUnifiedCoupons', variables: { channelId: '19878532' } },
        { operationName: 'getVisitorReviews', variables: { input: { sort: 'recent' } } },
      ]),
    ).toBe(true);
    expect(
      isVisitorReviewsGraphqlRequestBody({
        operationName: 'getUnifiedCoupons',
        query: 'query getUnifiedCoupons { unifiedCoupons { total } }',
      }),
    ).toBe(false);
  });
});

describe('baemin menu group extraction', () => {
  it('keeps source groups and flattens without representative duplicates', () => {
    const state = {
      'PlaceDetail_BaeminMenuGroup:rep': {
        id: 'rep',
        name: '대표메뉴',
        menus: [{ __ref: 'PlaceDetail_BaeminMenu:m1' }],
      },
      'PlaceDetail_BaeminMenuGroup:set': {
        id: 'set',
        name: '세트 메뉴',
        menus: [{ __ref: 'PlaceDetail_BaeminMenu:m1' }, { __ref: 'PlaceDetail_BaeminMenu:m2' }],
      },
      'PlaceDetail_BaeminMenu:m1': {
        id: 'm1',
        name: '100% 수제닭꼬치 5개',
        price: '21,000원',
        desc: '2가지맛선택',
        isRepresentative: true,
        imageUrl: 'https://example.com/m1.jpg',
      },
      'PlaceDetail_BaeminMenu:m2': {
        id: 'm2',
        name: '100% 수제닭꼬치 8개',
        price: '33,000원',
      },
    };

    const groups = extractBaeminMenuGroups(state);
    expect(groups.map((group) => group.name)).toEqual(['대표메뉴', '세트 메뉴']);
    expect(groups[0]!.menus).toHaveLength(1);
    expect(groups[1]!.menus).toHaveLength(2);

    const flat = flattenMenuGroups(groups);
    expect(flat.map((menu) => menu.name)).toEqual(['100% 수제닭꼬치 5개', '100% 수제닭꼬치 8개']);
  });
});

// 2026-09 네이버 개편 뒤 Apollo 상태를 줄인 모양 (실제 덤프: 깨비사골칼국수·미스타교자).
const PLACE_ID = '2087751394';
const placeMenuItem = (
  id: string,
  name: string,
  displayText: string,
  extra: Record<string, unknown> = {},
) => ({
  __typename: 'PlaceMenuItem',
  id,
  type: 'normal',
  name,
  description: null,
  badges: [],
  labels: [],
  thumbnailUrl: null,
  hasImage: false,
  isSetMenu: false,
  price: { __typename: 'PlaceMenuPrice', priceType: 'fixed', displayText },
  images: [],
  optionGroups: [],
  course: null,
  ...extra,
});

const menuCategory = (id: string, kind: string, name: string, itemIds: string[]) => ({
  __typename: 'PlaceMenuCategory',
  id,
  kind,
  name,
  showInNavigation: kind !== 'uncategorized',
  itemIds,
});

const placeState = (
  items: Record<string, unknown>[],
  categories: Record<string, unknown>[],
  menuCount: number = items.length,
) => {
  const state: Record<string, unknown> = {};
  for (const item of items) state[`PlaceMenuItem:${String(item['id'])}`] = item;
  for (const c of categories) state[`PlaceMenuCategory:${String(c['id'])}`] = c;
  state['ROOT_QUERY'] = {
    __typename: 'Query',
    [`placeDetail({"input":{"deviceType":"pc","id":"${PLACE_ID}","isNx":false}})`]: {
      __typename: 'PlaceDetail',
      tabs: [{ __typename: 'PlaceDetailTab', tabId: 'menu', name: '메뉴' }],
      baemin: null,
      placeMenus: {
        __typename: 'PlaceMenus',
        items: items.map((item) => ({ __ref: `PlaceMenuItem:${String(item['id'])}` })),
        categories: categories.map((c) => ({ __ref: `PlaceMenuCategory:${String(c['id'])}` })),
        menuCount,
      },
    },
  };
  return state;
};

describe('placeMenus (2026-09 개편) extraction', () => {
  it('maps recommend → 대표메뉴, uncategorized → 메뉴, and normalizes item fields', () => {
    const items = [
      placeMenuItem('a', '깨비스페셜', '42,000원', {
        badges: ['repr'],
        description: '수육+전+칼국수',
        thumbnailUrl: 'https://ldb-phinf.pstatic.net/a-thumb.png',
        images: [{ __typename: 'PlaceMenuImage', url: 'https://ldb-phinf.pstatic.net/a.png' }],
      }),
      placeMenuItem('b', '가브리살 보쌈정식', '13,000원', {
        thumbnailUrl: 'http://ldb-phinf.pstatic.net/b-thumb.jpg',
      }),
      placeMenuItem('c', '물', '무료', {
        price: { __typename: 'PlaceMenuPrice', priceType: 'free', displayText: '무료' },
      }),
    ];
    const state = placeState(items, [
      menuCategory('recommend', 'recommend', '추천 메뉴', ['a']),
      menuCategory(`u.p.${PLACE_ID}`, 'uncategorized', '', ['a', 'b', 'c']),
    ]);

    const resolved = resolveMenuGroups(state, PLACE_ID);
    expect(resolved.source).toBe('place');
    expect(resolved.complete).toBe(true);
    expect(resolved.groups.map((g) => [g.name, g.menus.length])).toEqual([
      ['대표메뉴', 1],
      ['메뉴', 3],
    ]);
    expect(resolved.groups.every((g) => g.source === 'naver-place')).toBe(true);

    expect(flattenMenuGroups(resolved.groups)).toEqual([
      {
        name: '깨비스페셜',
        price: '42000',
        description: '수육+전+칼국수',
        recommend: true,
        imageUrls: ['https://ldb-phinf.pstatic.net/a.png'],
      },
      {
        name: '가브리살 보쌈정식',
        price: '13000',
        description: null,
        recommend: false,
        // images 가 비면 thumbnailUrl 로 폴백(https 강제)
        imageUrls: ['https://ldb-phinf.pstatic.net/b-thumb.jpg'],
      },
      { name: '물', price: '무료', description: null, recommend: false, imageUrls: [] },
    ]);
  });

  it('keeps owner-defined categories and gathers uncategorized leftovers into 메뉴', () => {
    const items = [
      placeMenuItem('g1', '군만두', '7,000원', { badges: ['repr'] }),
      placeMenuItem('g2', '물만두', '7,000원'),
      placeMenuItem('h1', '하이볼', '9,000원'),
      placeMenuItem('x1', '공깃밥', '1,000원'),
    ];
    const state = placeState(items, [
      menuCategory('recommend', 'recommend', '추천 메뉴', ['g1']),
      menuCategory('g.dumpling', 'normal', '교자', ['g1', 'g2']),
      menuCategory('g.highball', 'normal', 'Highball', ['h1']),
    ]);

    const resolved = resolveMenuGroups(state, PLACE_ID);
    expect(resolved.groups.map((g) => [g.name, g.sourceGroupId, g.menus.length])).toEqual([
      ['대표메뉴', 'recommend', 1],
      ['교자', 'g.dumpling', 2],
      ['Highball', 'g.highball', 1],
      ['메뉴', null, 1],
    ]);
    expect(flattenMenuGroups(resolved.groups).map((m) => m.name)).toEqual([
      '군만두',
      '물만두',
      '하이볼',
      '공깃밥',
    ]);
  });

  it('marks placeMenus incomplete when home carries fewer items than menuCount', () => {
    const state = placeState(
      [placeMenuItem('a', '칼국수', '10,000원')],
      [menuCategory(`u.p.${PLACE_ID}`, 'uncategorized', '', ['a'])],
      13,
    );
    const resolved = resolveMenuGroups(state, PLACE_ID);
    expect(resolved.complete).toBe(false);
    expect(resolved.expectedCount).toBe(13);
  });

  it('returns none when neither baemin groups nor placeMenus exist', () => {
    const resolved = resolveMenuGroups(
      {
        ROOT_QUERY: {
          [`placeDetail({"input":{"id":"${PLACE_ID}"}})`]: { placeMenus: null, baemin: null },
        },
      },
      PLACE_ID,
    );
    expect(resolved).toMatchObject({ source: 'none', groups: [], complete: false });
  });
});

describe('baemin menu completeness', () => {
  const baeminState = (menuRefs: number) => ({
    'PlaceDetail_BaeminMenuGroup:rep': {
      id: 'rep',
      name: '대표메뉴',
      menus: [{ __ref: 'PlaceDetail_BaeminMenu:m1' }],
    },
    'PlaceDetail_BaeminMenuGroup:set': {
      id: 'set',
      name: '세트 메뉴',
      menus: [{ __ref: 'PlaceDetail_BaeminMenu:m1' }, { __ref: 'PlaceDetail_BaeminMenu:m2' }],
    },
    'PlaceDetail_BaeminMenu:m1': { id: 'm1', name: '닭꼬치 5개', price: '21000' },
    'PlaceDetail_BaeminMenu:m2': { id: 'm2', name: '닭꼬치 8개', price: '33000' },
    ROOT_QUERY: {
      [`placeDetail({"input":{"id":"${PLACE_ID}"}})`]: {
        placeMenus: null,
        baemin: {
          __typename: 'PlaceDetail_BaeminData',
          menus: Array.from({ length: menuRefs }, (_, i) => ({
            __ref: `PlaceDetail_BaeminMenu:m${i + 1}`,
          })),
        },
      },
    },
  });

  it('prefers baemin groups and is complete when groups cover baemin.menus', () => {
    const resolved = resolveMenuGroups(baeminState(2), PLACE_ID);
    expect(resolved.source).toBe('baemin');
    expect(resolved.expectedCount).toBe(2);
    expect(resolved.complete).toBe(true);
  });

  it('is incomplete when baemin.menus lists more than the groups hold', () => {
    const resolved = resolveMenuGroups(baeminState(5), PLACE_ID);
    expect(resolved.complete).toBe(false);
  });
});
