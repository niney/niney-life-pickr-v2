// 식단 화면 공통 틀(2026-10-04) — 목록·상세·입력·수정이 같은 바깥 폭과 왼쪽 끝을 써서, 오가도 제목·본문이 튀지
// 않게 한다(상세·입력이 max-w-2xl 가운데 정렬이라 제목이 250px 옮겨 가던 것). 데스크톱(lg, 1024px 이상)은 다른
// 공개 페이지(날씨·바다·여행)와 같은 max-w-6xl 에 "왼쪽 본문 + 오른쪽 패널" 두 단. 오른쪽은 늘 맥락·동작 자리다
// (기록: 검색·요약 / 달력: 고른 날 / 추천: 조건·최근 추천 / 상세: 식당·메모·버튼 / 입력: 언제·어떻게·저장).
// 좁은 화면은 한 단 그대로 — 모두 lg: 접두로만 바꾼다.

// meal-page: 스크롤바 자리 고정(styles/global.css)의 표식.
export const MEAL_PAGE_CLASS = 'meal-page mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:max-w-6xl';

// 두 단 그리드. 자식은 본문(MEAL_MAIN_CLASS)·패널(MEAL_SIDE_CLASS) 둘 — 좁은 화면에선 DOM 순서대로 쌓인다.
export const MEAL_SPLIT_CLASS =
  'space-y-4 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-6 lg:space-y-0';

export const MEAL_MAIN_CLASS = 'min-w-0 space-y-4 lg:col-start-1 lg:row-start-1';

// 오른쪽 패널 — 스크롤해도 상단바(56px) 아래에 붙어 따라오고, 화면보다 길면 패널 안에서 스크롤한다.
export const MEAL_SIDE_CLASS =
  'space-y-4 lg:sticky lg:top-[4.5rem] lg:col-start-2 lg:row-start-1 lg:max-h-[calc(100dvh-5.5rem)] lg:overflow-y-auto';
