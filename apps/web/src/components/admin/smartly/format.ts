// 표시용 상수·포맷 — 컴포넌트 파일(parts.tsx)과 분리해 react-refresh 경고를 피한다.

// 원본 문서(유효성 시험 결과서) 수치 — 다시 잰 값과 나란히 보여 준다.
export const DOCUMENTED = {
  cer: 0.029,
  bleu: { en: 0.724, ja: 0.704, 'zh-CN': 0.707, 'zh-TW': 0.776 },
} as const;

export const SELECT_CLASS = 'h-9 rounded-md border bg-background px-2 text-sm text-foreground';

export const percent = (v: number | null | undefined, digits = 1) =>
  v === null || v === undefined ? '–' : `${(v * 100).toFixed(digits)}%`;

export const decimal = (v: number | null | undefined, digits = 3) =>
  v === null || v === undefined ? '–' : v.toFixed(digits);

// seed 를 바꿔 다른 표본을 뽑는다.
export const randomSeed = () => Math.floor(Math.random() * 1_000_000);
