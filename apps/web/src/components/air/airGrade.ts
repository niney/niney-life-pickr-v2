import {
  AIR_GRADE_HEX,
  AIR_GRADE_LABEL,
  AIR_GRADE_NONE_HEX,
  airGradeFromText,
  airWeeklyLevel,
  type AirGradeLevel,
} from '@repo/utils';

// 날짜 라벨(오늘/내일/모레 · M/D (요일) · KST 오늘)은 @repo/utils 로 올라갔다(앱과 공용). 기존 import
// 경로 호환용 재수출.
export { formatYmdWithWeekday, relativeDayLabel, todayKst } from '@repo/utils';

// 대기 등급(좋음/보통/나쁨/매우나쁨) 색 — 에어코리아가 쓰는 파랑/초록/노랑/빨강
// 관행을 그대로 따라 사용자가 이미 아는 의미를 빌린다. 상태색(status)이라 계열색과
// 섞지 않고, 항상 등급 글자(또는 점+글자)와 함께 쓴다 — 색만으로 뜻을 전달하지 않는다.
// 틴트 배경(/15)은 라이트·다크 양쪽에서 본문 글자색(text-foreground)이 그대로 읽힌다.
export interface AirGradeStyle {
  label: string;
  // 점/막대 등 단색 마크.
  dot: string;
  // 틴트 배경 + 본문 글자(셀·칩).
  tint: string;
  // 강조 글자색(히어로 등급 단어) — 텍스트 토큰 대신 hue 를 쓰는 유일한 자리.
  ink: string;
  // SVG 등 hex 가 필요한 곳.
  hex: string;
}

export const AIR_GRADE_STYLE: Record<AirGradeLevel, AirGradeStyle> = {
  1: {
    label: AIR_GRADE_LABEL[1],
    dot: 'bg-sky-500',
    tint: 'bg-sky-500/15',
    ink: 'text-sky-600 dark:text-sky-400',
    hex: AIR_GRADE_HEX[1],
  },
  2: {
    label: AIR_GRADE_LABEL[2],
    dot: 'bg-emerald-500',
    tint: 'bg-emerald-500/15',
    ink: 'text-emerald-600 dark:text-emerald-400',
    hex: AIR_GRADE_HEX[2],
  },
  3: {
    label: AIR_GRADE_LABEL[3],
    dot: 'bg-amber-500',
    tint: 'bg-amber-500/20',
    ink: 'text-amber-600 dark:text-amber-400',
    hex: AIR_GRADE_HEX[3],
  },
  4: {
    label: AIR_GRADE_LABEL[4],
    dot: 'bg-rose-500',
    tint: 'bg-rose-500/15',
    ink: 'text-rose-600 dark:text-rose-400',
    hex: AIR_GRADE_HEX[4],
  },
};

// 결측/등급 없음 — 회색 점선 느낌 없이 조용한 muted.
export const AIR_GRADE_NONE: AirGradeStyle = {
  label: '-',
  dot: 'bg-muted-foreground/40',
  tint: 'bg-muted',
  ink: 'text-muted-foreground',
  hex: AIR_GRADE_NONE_HEX,
};

export const airGradeStyle = (grade: AirGradeLevel | null | undefined): AirGradeStyle =>
  grade ? AIR_GRADE_STYLE[grade] : AIR_GRADE_NONE;

// 예보 등급 텍스트('좋음' 등) → 스타일. 주간예보의 '낮음'/'높음' 은 2단계라 좋음/나쁨
// 색을 빌리되 라벨은 원문을 유지한다.
export const airGradeStyleFromText = (text: string | null | undefined): AirGradeStyle => {
  const g = airGradeFromText(text);
  if (g) return AIR_GRADE_STYLE[g];
  const w = airWeeklyLevel(text);
  if (w === 'low') return { ...AIR_GRADE_STYLE[1], label: text ?? '낮음' };
  if (w === 'high') return { ...AIR_GRADE_STYLE[3], label: text ?? '높음' };
  return { ...AIR_GRADE_NONE, label: text ?? '-' };
};
