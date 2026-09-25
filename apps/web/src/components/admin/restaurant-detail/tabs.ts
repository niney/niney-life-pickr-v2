import type { TabKey } from '~/components/restaurant/detail/tabs';

// 어드민 맛집 상세 탭. 공개 상세의 탭 순서를 따르되 '가는 법'은 빼고(운영 가치가 낮다 —
// 좌표 확인은 우측 지도로 충분) 어드민 전용 '로그'를 끝에 둔다. '여행자'는 여행로그 매칭이
// 있을 때만 보인다.
export type AdminDetailTabKey =
  | 'home'
  | 'insights'
  | 'tour'
  | 'menu'
  | 'reviews'
  | 'ask'
  | 'photos'
  | 'info'
  | 'logs';

export const ADMIN_DETAIL_TABS: ReadonlyArray<{ key: AdminDetailTabKey; label: string }> = [
  { key: 'home', label: '홈' },
  { key: 'insights', label: '분석' },
  { key: 'tour', label: '여행자' },
  { key: 'menu', label: '메뉴' },
  { key: 'reviews', label: '리뷰' },
  { key: 'ask', label: '질문' },
  { key: 'photos', label: '사진' },
  { key: 'info', label: '정보' },
  { key: 'logs', label: '로그' },
];

// 공개 홈 탭이 링크하는 공개 탭 키 중 어드민 상세에도 있는 것 — 홈 탭의 availableTabs.
export const PUBLIC_TABS_IN_ADMIN: readonly TabKey[] = [
  'home',
  'insights',
  'tour',
  'menu',
  'reviews',
  'ask',
  'photos',
  'info',
];

const KEYS = new Set<string>(ADMIN_DETAIL_TABS.map((t) => t.key));
export const isAdminDetailTab = (s: string | null): s is AdminDetailTabKey =>
  s !== null && KEYS.has(s);
