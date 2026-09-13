export type TabKey =
  | 'home'
  | 'menu'
  | 'reviews'
  | 'ask'
  | 'insights'
  | 'tour'
  | 'photos'
  | 'info'
  | 'transit';

// 'tour'(여행자 — AI 허브 여행로그 집계)는 detail.tour 가 있는 식당에서만 보인다(PublicRestaurantDetail 이 거른다).
export const TAB_ORDER: Array<{ key: TabKey; label: string }> = [
  { key: 'home', label: '홈' },
  { key: 'insights', label: '분석' },
  { key: 'tour', label: '여행자' },
  { key: 'menu', label: '메뉴' },
  { key: 'reviews', label: '리뷰' },
  { key: 'ask', label: '질문' },
  { key: 'photos', label: '사진' },
  { key: 'info', label: '정보' },
  { key: 'transit', label: '가는 법' },
];
