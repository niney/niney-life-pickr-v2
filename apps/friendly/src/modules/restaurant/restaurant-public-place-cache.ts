import type { PublicVisitorReviewType, RestaurantInsightsType, RestaurantPublicDetailType } from '@repo/api-contract';
import { KeyedCache } from '../../lib/keyed-cache.js';

// 가게 단위 공개 캐시 — 상세·리뷰 페이지·인사이트. 공개 상세와 리뷰 페이지는 요청마다 세 출처 리뷰 전부(운영 가게당
// 평균 486건, 최대 1,259건)를 다시 읽어 조립했고, 인사이트는 요약 전부를 다시 셌다 — 운영 DB 로 재니 상세·리뷰 한 번에
// 26~71ms, 큰 가게 상세 화면에 10명이 몰리면 RSS 가 1.1GB 까지 올랐다(pm2 상한 1.5GB, 2026-11 검토). 같은 가게를 60초
// 들고 있으면 상세 약 2ms·리뷰 페이지 0.3ms 다.
//
// 신선도: 공개 응답이 이미 `max-age=60` 이라 체감 지연은 그대로다. 크롤 저장·삭제·canonical 병합은 공개 목록 캐시와 함께
// invalidatePublicRestaurantCache() 가 이 캐시도 비운다. 리뷰 요약 진행은 60초(만료 직후 한 번은 지난 값) 늦게 보인다.
// 어드민 화면(상세·리뷰 매칭·인사이트)은 이 캐시를 쓰지 않는다.
export const PUBLIC_PLACE_TTL_MS = 60_000;
// 조립 결과(JSON 기준 가게당 중앙 0.39MB·최대 1.53MB, 메모리는 그 두세 배)를 자주 보는 가게 수십 곳만큼.
const PUBLIC_PLACE_MAX_BYTES = 64 * 1024 * 1024;
const PUBLIC_INSIGHTS_MAX_BYTES = 8 * 1024 * 1024;

export interface PublicPlaceEntry {
  detail: RestaurantPublicDetailType;
  // 세 출처 리뷰를 합친 방문일 최신순 목록 — 리뷰 페이지가 여기서 거르고 자른다.
  reviews: PublicVisitorReviewType[];
  // 팁·메뉴 필터가 MenuCanonical 을 찾는 네이버 행 id.
  naverRestaurantId: string;
}

// 들고 있는 값은 여러 요청이 함께 쓴다 — 응답으로 내보내기만 하고 고치지 말 것.
export const publicPlaceCache = new KeyedCache<PublicPlaceEntry>({
  ttlMs: PUBLIC_PLACE_TTL_MS,
  maxBytes: PUBLIC_PLACE_MAX_BYTES,
});
export const publicInsightsCache = new KeyedCache<RestaurantInsightsType>({
  ttlMs: PUBLIC_PLACE_TTL_MS,
  maxBytes: PUBLIC_INSIGHTS_MAX_BYTES,
});

export const invalidatePublicPlaceCaches = (): void => {
  publicPlaceCache.invalidateAll();
  publicInsightsCache.invalidateAll();
};

const textBytes = (s: string | null | undefined): number => (s ? s.length * 2 : 0);

// 메모리 크기 어림 — 문자열 길이 × 2 + 객체마다 고정분. 정확할 필요는 없고 LRU 상한을 지키는 용도다.
export const estimatePublicPlaceBytes = (entry: PublicPlaceEntry, detailJsonLength: number): number => {
  let bytes = detailJsonLength * 2;
  for (const r of entry.reviews) {
    bytes += 400 + textBytes(r.body) + textBytes(r.authorName) + textBytes(r.visitedAt);
    for (const u of r.imageUrls) bytes += 64 + textBytes(u);
    bytes += r.videos.length * 400;
    const a = r.analysis;
    if (a) {
      bytes += 300 + textBytes(a.text);
      for (const m of a.menus) bytes += 120 + textBytes(m.name);
      for (const t of a.tips) bytes += 64 + textBytes(t);
      for (const k of a.keywords) bytes += 64 + textBytes(k);
    }
  }
  return bytes;
};

export const estimateInsightsBytes = (insights: RestaurantInsightsType): number => {
  let bytes = 1_000;
  for (const m of insights.topMenus) bytes += 150 + textBytes(m.name);
  for (const t of insights.topTips) bytes += 80 + textBytes(t.term);
  for (const k of insights.topKeywords) bytes += 80 + textBytes(k.term);
  return bytes;
};
