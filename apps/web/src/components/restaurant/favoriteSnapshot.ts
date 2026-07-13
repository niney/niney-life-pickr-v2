import type { RestaurantFavoriteItemType, RestaurantPublicListItemType } from '@repo/api-contract';

// 공개 목록 행 → 즐겨찾기 스냅샷 매핑. 주소는 서버 계약대로 도로명 우선 한 값.
// 목록 카드(RestaurantsPage/V2)와 홈 픽 결과가 공유한다 — 상세 헤더는 detail
// 응답 필드가 달라(imageUrls) PublicRestaurantDetail 안에서 따로 매핑한다.
export const toFavoriteItem = (item: RestaurantPublicListItemType): RestaurantFavoriteItemType => ({
  placeId: item.placeId,
  name: item.name,
  category: item.category,
  address: item.roadAddress ?? item.address,
  thumbnailUrl: item.thumbnailUrl,
  latitude: item.latitude,
  longitude: item.longitude,
});
