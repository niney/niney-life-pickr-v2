export type TabKey = 'home' | 'menu' | 'reviews' | 'ask' | 'insights' | 'photos' | 'info';

export const TAB_ORDER: Array<{ key: TabKey; label: string }> = [
  { key: 'home', label: '홈' },
  { key: 'insights', label: '분석' },
  { key: 'menu', label: '메뉴' },
  { key: 'reviews', label: '리뷰' },
  { key: 'ask', label: '질문' },
  { key: 'photos', label: '사진' },
  { key: 'info', label: '정보' },
];
