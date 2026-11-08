// 식단 구역 화면의 두 단 틀(2026-10-04, 2026-11-08 식단 셸로 옮김) — 바깥 폭·여백·왼쪽 정렬은 식단 셸(MealShell)이 정하고,
// 기록·달력 화면은 그 안에서 데스크톱(lg, 1024px 이상)이면 "왼쪽 본문 + 오른쪽 맥락" 두 단을 쓴다(기록: 찾기·최근 7일 /
// 달력: 고른 날). 좁은 화면은 한 단 그대로 — 모두 lg: 접두로만 바꾼다.
// 상세·입력은 패널로도 뜨므로 화면 폭이 아니라 담긴 폭으로 접는다(MealSurface 의 @container + mealTheme.css 의 .meal-detail·.meal-form).
// 스크롤바 자리 고정 표식(meal-page)은 식단 바깥 틀(MealApp)이 단다.

// 두 단 그리드. 자식은 본문(MEAL_MAIN_CLASS)·맥락(MEAL_SIDE_CLASS) 둘 — 좁은 화면에선 DOM 순서대로 쌓인다.
export const MEAL_SPLIT_CLASS =
  'space-y-4 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-6 lg:space-y-0';

export const MEAL_MAIN_CLASS = 'min-w-0 space-y-4 lg:col-start-1 lg:row-start-1';

// 오른쪽 맥락 — 스크롤해도 화면 위쪽에 붙어 따라오고(셸은 데스크톱에 상단바가 없다), 화면보다 길면 그 안에서 스크롤한다.
export const MEAL_SIDE_CLASS =
  'space-y-4 lg:sticky lg:top-8 lg:col-start-2 lg:row-start-1 lg:max-h-[calc(100dvh-4rem)] lg:overflow-y-auto';
