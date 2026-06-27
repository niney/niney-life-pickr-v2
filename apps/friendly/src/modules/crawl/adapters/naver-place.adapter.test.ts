import { describe, expect, it } from 'vitest';
import {
  __test_extractBaeminMenuGroups as extractBaeminMenuGroups,
  __test_flattenMenuGroups as flattenMenuGroups,
  __test_parseVisitorReviewsFromCaptured as parseVisitorReviews,
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
