import { AIR_GRADE_HEX, AIR_GRADE_LABEL, AIR_GRADE_NONE_HEX, airGradeFromText, airWeeklyLevel, type AirGradeLevel } from '@repo/utils';

// 대기 등급 색(앱) — 웹 airGrade.ts 의 hex 와 같은 값(@repo/utils AIR_GRADE_HEX). 항상 등급 글자와 함께
// 쓴다(색만으로 뜻을 전하지 않는다). tint 는 hex 뒤에 알파를 붙인 8자리(라이트·다크 공용).

export interface AirGradeColor {
  label: string;
  hex: string;
  tint: string;
}

const TINT_ALPHA = '26'; // ≈15%

export const airGradeColor = (grade: AirGradeLevel | null | undefined): AirGradeColor =>
  grade
    ? { label: AIR_GRADE_LABEL[grade], hex: AIR_GRADE_HEX[grade], tint: `${AIR_GRADE_HEX[grade]}${TINT_ALPHA}` }
    : { label: '-', hex: AIR_GRADE_NONE_HEX, tint: `${AIR_GRADE_NONE_HEX}${TINT_ALPHA}` };

// 예보 등급 텍스트('좋음' 등) → 색. 주간예보의 '낮음'/'높음' 은 2단계라 좋음/나쁨 색을 빌리되 라벨은 원문.
export const airGradeColorFromText = (text: string | null | undefined): AirGradeColor => {
  const g = airGradeFromText(text);
  if (g) return airGradeColor(g);
  const w = airWeeklyLevel(text);
  if (w === 'low') return { ...airGradeColor(1), label: text ?? '낮음' };
  if (w === 'high') return { ...airGradeColor(3), label: text ?? '높음' };
  return { ...airGradeColor(null), label: text ?? '-' };
};
