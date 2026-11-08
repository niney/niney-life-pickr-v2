import type { ReactNode } from 'react';
import {
  MEAL_NUTRIENT_STATUS_LABEL,
  NUTRIENT_BAR_MAX_PERCENT,
  nutrientBarWidth,
  type MealNutrientDisplayKey,
} from '@repo/utils';
import { cn } from '~/lib/utils';
import { MEAL_NUTRIENT_TONE } from './mealNutrientTone';

// 영양소 한 줄(2026-11-08) — 영양 탭 '영양소 점검'과 통계 '영양소'가 같은 부품을 쓴다(사용자 "영양에서 나왔던 디자인처럼"):
// 이름 + 판정 칩 + 오른쪽 "양 / 기준 (N%)", 그 아래 막대(기준 대비 0~150%, 세로선 100%). 통계는 줄 전체를 누르는 단추로
// 감싸므로 모두 span(단추 안에 둘 수 있는 요소)으로 그린다 — .meal-meter 는 block 이라 모양은 div 와 같다.

// 기준선 자리 — 0~150% 축의 100%.
const REF_AT = (100 / NUTRIENT_BAR_MAX_PERCENT) * 100;

/** 판정 칩 — '기록 더 필요'는 판정이 부족이어도 빠진 끼니 탓일 수 있어 점선 테두리로 잠정임을 보인다. */
export const MealNutrientChip = ({ status }: { status: MealNutrientDisplayKey }) => (
  <span
    className={cn('meal-flag', MEAL_NUTRIENT_TONE[status])}
    data-dashed={status === 'recordGap' ? 'true' : undefined}
  >
    {MEAL_NUTRIENT_STATUS_LABEL[status]}
  </span>
);

/**
 * 기준 대비 막대 — 0~150% 축(넘치면 끝까지 차고 숫자로), 세로선은 기준(100%), 색은 판정(tone 이 없으면 먹색).
 * ariaLabel 이 없으면 읽지 않는다 — 누르는 줄 안에서는 옆 글자가 이미 같은 값을 말한다.
 */
export const MealNutrientMeter = ({
  percent,
  tone,
  ariaLabel,
}: {
  percent: number | null;
  tone?: MealNutrientDisplayKey;
  ariaLabel?: string;
}) => (
  <span
    className="meal-meter"
    data-tone={tone}
    role={ariaLabel ? 'img' : undefined}
    aria-label={ariaLabel}
    aria-hidden={ariaLabel ? undefined : true}
  >
    <span style={{ width: `${nutrientBarWidth(percent)}%` }} />
    <i className="meal-meter-ref" style={{ left: `${REF_AT}%` }} />
  </span>
);

/** 이름 + 판정 칩 + 오른쪽 값, 그 아래 막대. 덧말(노트·출처·제안)은 부르는 쪽이 이어 붙인다. */
export const MealNutrientLine = ({
  label,
  status,
  value,
  bar,
  trailing,
  sub,
}: {
  label: string;
  /** 판정 칩 — 판정하지 않는 줄(열량·탄수화물·지방 등)은 null. */
  status: MealNutrientDisplayKey | null;
  value: ReactNode;
  /** 막대 — 기준 대비(MealNutrientMeter)·범위 막대, 길이를 그리지 않는 줄은 null. */
  bar: ReactNode;
  /** 값 뒤 작은 표시(통계: 펼침 화살표). */
  trailing?: ReactNode;
  /** 들여 쓴 하위 줄(당류·포화지방) — 이름을 조금 가볍게. */
  sub?: boolean;
}) => (
  <>
    <span className="flex flex-wrap items-center gap-2">
      <span className={cn('text-sm', sub ? 'font-semibold' : 'font-bold')}>{label}</span>
      {status ? <MealNutrientChip status={status} /> : null}
      <span className="ml-auto text-xs tabular-nums text-muted-foreground">{value}</span>
      {trailing}
    </span>
    {bar}
  </>
);
