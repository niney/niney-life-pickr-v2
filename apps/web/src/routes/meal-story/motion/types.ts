import type { MealStoryType } from '@repo/api-contract';
import type { PaperPalette } from './paper/palette';

// 영상에 넣는 '내 기록' 값 — 웹이 통계(stats/nutrients)에서 골라 넘긴다. 판정 이름은 웹이 정한 글자 그대로.
export type MotionMineValue = {
  value: number;
  unit: string;
  /** 내 기준 대비 %(통계가 계산 — 기준은 내 나이·성별의 섭취기준). */
  percent: number | null;
  /** 그 기준값(같은 단위). 원고의 기준 숫자와 다르면 영상이 밝힌다. */
  standard: number | null;
  statusLabel: string | null;
  /** 기준을 넘었다(많음) — 넘치는 연출·빨간 도장. */
  over: boolean;
};

/** 통계 영양소 키(sodium …)별 내 값. 로그인했지만 값이 없으면 키가 없다. */
export type MotionMine = Partial<Record<string, MotionMineValue>>;

/** 장면 컴포넌트가 받는 공통 값. */
export interface ChapterContext {
  story: MealStoryType;
  /** 종이 오리기 색(무대·쪽지·소품). */
  pal: PaperPalette;
  kicker: string;
  /** 내 기록 값 — 로그인 전이거나 아직 받는 중이면 null, 받았는데 값이 없으면 빈 객체. */
  mine: MotionMine | null;
  loggedIn: boolean;
  /** SVG clipPath id 를 장면마다 다르게. */
  id: string;
}
