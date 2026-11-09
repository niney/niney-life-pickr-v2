// 식단 주소(2026-11-08 리뉴얼) — 식단은 전용 셸을 가진 하위 사이트(/meal)다. 앱(expo-router)의 /meal 과 같은 뿌리.
// 예전 주소(/me/meals?tab=…, /me/meals/:id…)는 legacyMealPath 로 새 주소에 넘긴다(북마크·열려 있던 탭).

export const MEAL_PATH = {
  home: '/meal',
  records: '/meal/records',
  calendar: '/meal/calendar',
  stats: '/meal/stats',
  nutrition: '/meal/nutrition',
  recommend: '/meal/recommend',
  settings: '/meal/settings',
  new: '/meal/new',
  entry: (id: string) => `/meal/${id}`,
  edit: (id: string) => `/meal/${id}/edit`,
} as const;

// 건강식단 스토리(2026-11-09) — /meal 아래지만 로그인 없이 누구나 보는 화면이라 식단 셸(MealApp) 밖에서 띄운다(App 의
// /meal/stories/* 가 /meal/* 보다 먼저 잡힌다).
export const MEAL_STORY_PATH = {
  list: '/meal/stories',
  story: (slug: string) => `/meal/stories/${slug}`,
  recipe: (slug: string) => `/meal/stories/${slug}/recipe`,
} as const;

// 하단 탭·사이드 메뉴가 보이는 '구역' 화면 — 입력·상세·수정은 화면에 집중하게 하단 탭을 숨긴다.
export const MEAL_SECTION_PATHS: ReadonlySet<string> = new Set([
  MEAL_PATH.home,
  MEAL_PATH.records,
  MEAL_PATH.calendar,
  MEAL_PATH.stats,
  MEAL_PATH.nutrition,
  MEAL_PATH.recommend,
  MEAL_PATH.settings,
]);

const SECTION_SEGMENTS: ReadonlySet<string> = new Set([
  'records',
  'calendar',
  'stats',
  'nutrition',
  'recommend',
  'settings',
]);

/** 패널로 띄울 수 있는 주소인가 — 상세(/meal/:id)는 'detail', 새 기록·수정은 'form'. 구역 화면은 null. */
export const mealPanelKindOf = (pathname: string): 'detail' | 'form' | null => {
  const match = /^\/meal\/([^/]+)(\/edit)?\/?$/.exec(pathname);
  if (!match) return null;
  const [, segment = '', edit] = match;
  if (SECTION_SEGMENTS.has(segment)) return null;
  if (segment === 'new') return edit ? null : 'form';
  return edit ? 'form' : 'detail';
};

/** 상세·수정 주소의 기록 id(새 기록·구역 화면은 null). */
export const mealEntryIdOf = (pathname: string): string | null => {
  if (mealPanelKindOf(pathname) === null) return null;
  const segment = /^\/meal\/([^/]+)/.exec(pathname)?.[1] ?? null;
  return segment === 'new' ? null : segment;
};

const LEGACY_TAB: Record<string, string> = {
  list: MEAL_PATH.records,
  calendar: MEAL_PATH.calendar,
  stats: MEAL_PATH.stats,
  recommend: MEAL_PATH.recommend,
  nutrition: MEAL_PATH.nutrition,
  preference: MEAL_PATH.settings,
};

/** 예전 /me/meals… 주소 → 새 주소. 탭 말고 다른 쿼리는 그대로 넘긴다. */
export const legacyMealPath = (pathname: string, search: string): string => {
  const params = new URLSearchParams(search);
  const tab = params.get('tab');
  params.delete('tab');
  const rest = params.toString();
  const tail = rest ? `?${rest}` : '';
  const sub = pathname.replace(/^\/me\/meals\/?/, '').replace(/\/+$/, '');
  if (!sub) return `${(tab && LEGACY_TAB[tab]) || MEAL_PATH.home}${tail}`;
  return `/meal/${sub}${tail}`;
};
