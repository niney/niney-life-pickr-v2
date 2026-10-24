import { useSafeAreaInsets } from 'react-native-safe-area-context';

// 식단 화면의 글자·모서리 체계와 기록 버튼(FAB) 여백. 컴포넌트 파일(mealUi.tsx)과 나눠 둬야
// Fast Refresh 가 컴포넌트만 다시 그린다(react-refresh/only-export-components).

// 글자 체계 — 식단 화면의 글자 크기는 이 여덟 단만 쓴다(최소 12pt). iOS 텍스트 스타일(캡션 12·보조 13·
// 헤드라인 17·제목 20)을 기준으로 하되 한국어 정보 밀도에 맞게 본문은 15로 잡았다. 굵기는 자리마다 따로 준다.
export const mealFont = {
  caption: 12, // 배지·메타·막대 수치
  footnote: 13, // 보조 설명·칩
  callout: 14, // 목록 줄·입력
  body: 15, // 본문·버튼
  headline: 17, // 카드 제목·섹션 제목
  title: 20, // 화면 안 큰 제목(달력 월)
  number: 24, // 통계 큰 숫자
  display: 36, // 입력 시트의 큰 시각
} as const;

// 모서리 — 카드 16 · 버튼/입력/썸네일 12 · 안쪽 작은 상자 8 · 알약.
export const mealRadius = { card: 16, control: 12, small: 8, pill: 999 } as const;

// 오른쪽 아래 기록 버튼(FAB). 화면 바닥(홈 인디케이터) 위에 띄우고, 각 탭의 스크롤 끝에 그만큼 여백을 둬
// 마지막 카드·버튼이 가려지지 않게 한다.
export const MEAL_FAB_SIZE = 56;
export const useMealFabInsets = (): { fabBottom: number; contentBottom: number } => {
  const insets = useSafeAreaInsets();
  const fabBottom = insets.bottom + 8;
  return { fabBottom, contentBottom: fabBottom + MEAL_FAB_SIZE + 20 };
};
