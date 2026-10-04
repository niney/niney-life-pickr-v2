import { describe, expect, it } from 'vitest';
import { compareReviewRecencyDesc } from '@repo/utils';
import type {
  AdminVisitorReviewType,
  PersistedVisitorReviewType,
  RestaurantDetailType,
} from '@repo/api-contract';
import { mergePersistedBatch } from './crawlBatchMerge';

// 크롤 배치 병합 — 예전 구현(`[...fresh, ...prev.reviews].sort(compareReviewRecencyDesc)`)과 같은
// 결과를 내야 한다. 새 행만 정렬해 이분 탐색으로 끼워 넣는 방식이라, 전체 재정렬과 순서가
// 어긋나지 않는지(동률 포함)를 기준 구현과 대조한다.

const FETCHED = '2026-09-01T00:00:00.000Z';

const existing = (id: string, visitedAt: string | null, fetchedAt = FETCHED): AdminVisitorReviewType => ({
  id,
  externalId: null,
  authorName: '기존',
  rating: 5,
  body: `기존 ${id}`,
  visitedAt,
  imageUrls: [],
  videos: [],
  fetchedAt,
  source: 'naver',
  restaurantId: 'R1',
  summary: null,
});

const incoming = (id: string, visitedAt: string | null, fetchedAt = FETCHED): PersistedVisitorReviewType => ({
  id,
  externalId: `ext-${id}`,
  authorName: '신규',
  rating: 4,
  body: `신규 ${id}`,
  visitedAt,
  imageUrls: [],
  videos: [],
  fetchedAt,
});

const detailWith = (reviews: AdminVisitorReviewType[]): RestaurantDetailType =>
  ({ id: 'R1', placeId: 'P1', reviews }) as unknown as RestaurantDetailType;

// 기준 구현 — 바꾸기 전 코드 그대로.
const reference = (prev: RestaurantDetailType, batch: PersistedVisitorReviewType[]): string[] => {
  const seen = new Set(prev.reviews.map((r) => r.id));
  const fresh = batch
    .filter((r) => !seen.has(r.id))
    .map((r) => ({ ...r, source: 'naver', restaurantId: prev.id, summary: null }));
  return [...fresh, ...prev.reviews].sort(compareReviewRecencyDesc).map((r) => r.id);
};

describe('mergePersistedBatch', () => {
  it('새 리뷰를 방문일 최신순 자리에 끼워 넣는다 — 앞·중간·뒤', () => {
    const prev = detailWith([
      existing('e1', '2026-08-20'),
      existing('e2', '2026-08-10'),
      existing('e3', '2026-07-01'),
    ]);
    const batch = [
      incoming('n-mid', '2026-08-15'),
      incoming('n-old', '2026-06-01'),
      incoming('n-new', '2026-08-25'),
    ];

    const merged = mergePersistedBatch(prev, batch);
    expect(merged.reviews.map((r) => r.id)).toEqual(['n-new', 'e1', 'n-mid', 'e2', 'e3', 'n-old']);
    expect(merged.reviews.map((r) => r.id)).toEqual(reference(prev, batch));
    // 새 행은 네이버 기준 행 리뷰로, 요약 없이 들어간다.
    expect(merged.reviews[0]).toMatchObject({ source: 'naver', restaurantId: 'R1', summary: null });
    // 기존 행은 같은 객체 그대로(캐시 구독자가 바뀐 행만 다시 그리게).
    expect(merged.reviews[1]).toBe(prev.reviews[0]);
  });

  it('방문일·수집일이 같으면 새 행이 기존 행보다 앞에 온다(예전 안정 정렬과 같은 순서)', () => {
    const prev = detailWith([existing('e1', '2026-08-10'), existing('e2', '2026-08-10')]);
    const batch = [incoming('n1', '2026-08-10'), incoming('n2', '2026-08-10')];

    const merged = mergePersistedBatch(prev, batch);
    expect(merged.reviews.map((r) => r.id)).toEqual(['n1', 'n2', 'e1', 'e2']);
    expect(merged.reviews.map((r) => r.id)).toEqual(reference(prev, batch));
  });

  it('이미 있는 id 만 온 배치는 prev 를 그대로 돌려준다(참조 유지)', () => {
    const prev = detailWith([existing('e1', '2026-08-20'), existing('e2', '2026-08-10')]);
    expect(mergePersistedBatch(prev, [incoming('e2', '2026-08-10')])).toBe(prev);
    expect(mergePersistedBatch(prev, [])).toBe(prev);
  });

  it('배치 안의 중복 id 는 한 번만 들어간다', () => {
    const prev = detailWith([existing('e1', '2026-08-20')]);
    const merged = mergePersistedBatch(prev, [incoming('n1', '2026-08-25'), incoming('n1', '2026-08-25')]);
    expect(merged.reviews.map((r) => r.id)).toEqual(['n1', 'e1']);
  });

  it('방문일 형식이 섞이고 해석 못 하는 값이 있어도 전체 재정렬과 같은 순서다', () => {
    // 기존 목록은 서버가 같은 비교 함수로 정렬해 준 상태를 흉내 낸다.
    const base = [
      existing('a', '2026-09-03'),
      existing('b', '26.8.30.일'),
      existing('c', '8.21.금', '2026-09-01T00:00:00.000Z'),
      existing('d', '2026-08-01'),
      existing('e', '2025-12-31'),
      existing('f', null, '2026-08-05T00:00:00.000Z'),
      existing('g', '알 수 없음', '2026-07-01T00:00:00.000Z'),
    ].sort(compareReviewRecencyDesc);
    const prev = detailWith(base);
    const batch = [
      incoming('n1', '2026-08-21'),
      incoming('n2', '9.1.화', '2026-09-02T00:00:00.000Z'),
      incoming('n3', null, '2026-08-20T00:00:00.000Z'),
      incoming('n4', '2025-01-01'),
      incoming('n5', '2026-09-03'),
      incoming('n6', null, '2026-06-01T00:00:00.000Z'),
    ];

    expect(mergePersistedBatch(prev, batch).reviews.map((r) => r.id)).toEqual(reference(prev, batch));
  });

  it('배치를 여러 번 이어 병합해도 매번 전체 재정렬과 같은 순서를 유지한다', () => {
    let prev = detailWith([]);
    // 최신 → 과거 순으로 10건씩 들어오는 크롤 페이지를 흉내 — 날짜가 일부 겹친다.
    for (let page = 0; page < 6; page++) {
      const batch = Array.from({ length: 10 }, (_, i) => {
        const day = 28 - ((page * 7 + i) % 28);
        return incoming(`p${page}-${i}`, `2026-08-${String(day).padStart(2, '0')}`);
      });
      const expected = reference(prev, batch);
      prev = mergePersistedBatch(prev, batch);
      expect(prev.reviews.map((r) => r.id)).toEqual(expected);
    }
    expect(prev.reviews).toHaveLength(60);
  });
});
