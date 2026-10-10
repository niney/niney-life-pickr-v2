// 메뉴판 읽기 화면의 표시용 포맷 — 컴포넌트 파일과 분리해 react-refresh 경고를 피한다.

export const SELECT_CLASS = 'h-9 rounded-md border bg-background px-2 text-sm text-foreground';

export const percent = (v: number | null | undefined, digits = 1) =>
  v === null || v === undefined ? '–' : `${(v * 100).toFixed(digits)}%`;

export const seconds = (ms: number | null | undefined) =>
  ms === null || ms === undefined ? '–' : `${(ms / 1000).toFixed(1)}초`;
