import { compareReviewRecencyDesc } from '@repo/utils';
import type {
  AdminVisitorReviewType,
  PersistedVisitorReviewType,
  RestaurantDetailType,
} from '@repo/api-contract';

// 크롤 스트림의 visitor_batch(실제로 DB 에 들어간 행 — dedup 후, 서버 id 포함)를 어드민 상세
// 캐시(['restaurant', placeId])의 reviews 에 병합한다. 상세 GET 을 배치마다 다시 받지 않기 위한
// 것으로, ActiveJobPanel 과 크롤링 테스트 페이지가 같이 쓴다.
//
// 결과는 상세 응답과 같은 정렬(compareReviewRecencyDesc — 방문일 최신순)을 유지해야 한다. 예전엔
// `[...fresh, ...prev.reviews].sort(...)` 로 배치마다 전체를 다시 정렬했는데, 이 비교 함수는 1회에
// 방문일 정규식 파싱 2번 + Date.parse 2번이라 리뷰가 수천 건이면 배치(리뷰 10건 안팎)마다 전체
// 길이만큼 비교가 돈다. 기존 목록은 이미 정렬돼 있으므로(서버 정렬 + 순서를 건드리는 건 이 병합뿐)
// 새 행만 정렬하고, 각 행의 자리는 이분 탐색으로 찾는다 — 비교 횟수가 (새 행 수 × log 전체)로 준다.
// 동률이면 새 행이 앞에 온다(안정 정렬에서 fresh 를 앞에 붙였던 예전 결과와 같다).
//
// 새로 들어갈 행이 없으면 prev 를 그대로 돌려준다(참조 유지 — 캐시 구독자가 리렌더되지 않는다).
export const mergePersistedBatch = (
  prev: RestaurantDetailType,
  batch: readonly PersistedVisitorReviewType[],
): RestaurantDetailType => {
  if (batch.length === 0) return prev;
  const existing = new Set(prev.reviews.map((r) => r.id));
  const fresh: AdminVisitorReviewType[] = [];
  for (const r of batch) {
    if (existing.has(r.id)) continue;
    existing.add(r.id);
    fresh.push({
      authorName: r.authorName,
      rating: r.rating,
      body: r.body,
      visitedAt: r.visitedAt,
      imageUrls: r.imageUrls,
      videos: r.videos,
      id: r.id,
      externalId: r.externalId,
      fetchedAt: r.fetchedAt,
      // 크롤 스트림은 네이버 전용 — 이 상세의 기준(네이버) 행 리뷰다.
      source: 'naver',
      restaurantId: prev.id,
      summary: null,
    });
  }
  if (fresh.length === 0) return prev;
  fresh.sort(compareReviewRecencyDesc);

  const base = prev.reviews;
  const merged: AdminVisitorReviewType[] = [];
  // fresh 가 정렬돼 있어 다음 행의 자리는 직전 자리 이후다 — 탐색 구간을 좁혀 간다.
  let from = 0;
  for (const item of fresh) {
    // lower bound: item 이 base[idx] 보다 앞이거나 동률인 첫 idx.
    let lo = from;
    let hi = base.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (compareReviewRecencyDesc(item, base[mid]!) <= 0) hi = mid;
      else lo = mid + 1;
    }
    for (let i = from; i < lo; i++) merged.push(base[i]!);
    merged.push(item);
    from = lo;
  }
  for (let i = from; i < base.length; i++) merged.push(base[i]!);
  return { ...prev, reviews: merged };
};
