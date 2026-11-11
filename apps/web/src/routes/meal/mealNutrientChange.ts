import { MEAL_NUTRIENT_MIN_COVERAGE, type MealNutrientStatusType } from '@repo/api-contract';
import { MEAL_NUTRIENT_STATUS_LABEL, formatNutrientAmount, mealNutrientDisplayStatus, toLocalDateKey, type MealNutrientDisplayKey } from '@repo/utils';

// 직전 같은 길이 기간과 견주기(2026-11-09 통계 → 2026-11-11 건강식단 이야기·홈 줄도 같이 쓴다) — 하루 평균이 이만큼 넘게 달라진
// 영양소에만 한 줄을 붙인다. 하루하루 들쭉날쭉한 기록에 음식 표준값 어림까지 얹혀 있어 10% 안쪽은 뜻이 없다(실데이터 5%
// 문턱에서는 단백질 5%·지방 8% 같은 잡음까지 '줄었어요'로 보였다). 두 기간 모두 판정이 나온(평균에 든 날 4일 이상 — 응답의
// status 'ok') 때만 부르는 쪽이 견준다.
export const NUTRIENT_CHANGE_MIN = 0.1;

/** 견줄 수 있는 한 줄 — 통계 영양소 줄과 영양 점검 줄이 같은 모양이다(같은 셈). */
export interface NutrientPeriodValue {
  intakePerDay: number | null;
  coverage: number;
  unit: string;
  status: MealNutrientStatusType | null;
  recordGap: boolean;
}

export interface NutrientChange {
  /** 이번 − 직전(하루 평균, 그 영양소의 단위). */
  diff: number;
  /** 직전 대비 비율(0.2 = 20% 늘었다). */
  rel: number;
  unit: string;
  now: MealNutrientDisplayKey | null;
  before: MealNutrientDisplayKey | null;
}

const displayOf = (v: NutrientPeriodValue): MealNutrientDisplayKey | null =>
  v.status ? mealNutrientDisplayStatus({ status: v.status, recordGap: v.recordGap }) : null;

/** 직전 기간보다 하루 평균이 달라진 정도 — 견줄 수 없거나(값 없음·정보 부족) 차이가 문턱 안쪽이면 null. */
export const nutrientChange = (now: NutrientPeriodValue, before: NutrientPeriodValue | null | undefined): NutrientChange | null => {
  if (!before || now.intakePerDay === null || before.intakePerDay === null || before.intakePerDay <= 0) return null;
  // 정보가 모자란 쪽이 있으면 양이 실제보다 적게 잡혀 차이가 정보 차이일 수 있다.
  if (now.coverage < MEAL_NUTRIENT_MIN_COVERAGE || before.coverage < MEAL_NUTRIENT_MIN_COVERAGE) return null;
  const diff = now.intakePerDay - before.intakePerDay;
  const rel = diff / before.intakePerDay;
  if (Math.abs(rel) < NUTRIENT_CHANGE_MIN) return null;
  return { diff, rel, unit: now.unit, now: displayOf(now), before: displayOf(before) };
};

/**
 * 두 기간의 기록량이 비슷한가 — 하루 평균 열량이 이만큼 넘게 다르면, 영양소 하나의 차이는 먹는 것이 바뀐 것이 아니라 적은(먹은)
 * 양이 달라진 것일 수 있다.
 */
export const ENERGY_CHANGE_MAX = 0.15;
export const comparableRecording = (nowKcal: number | null | undefined, beforeKcal: number | null | undefined): boolean =>
  typeof nowKcal === 'number' && typeof beforeKcal === 'number' && nowKcal > 0 && beforeKcal > 0 && Math.abs(nowKcal / beforeKcal - 1) <= ENERGY_CHANGE_MAX;

/**
 * 영양소 하나의 변화를 말할 때의 규칙 — 건강식단 이야기의 내 값, 홈의 건강식단 줄, 통계 탭의 영양소 줄(열량 줄만 빼고)이 같이 쓴다.
 * 기록량이 다른 두 기간을 견주면 모든 영양소가 함께 움직여, 덜 적은 것을 좋아진 것으로 읽는다(2026-11-11 실제 계정: 하루 열량이
 * 1,495 → 1,047kcal 로 30% 달랐고, 나트륨·식이섬유가 함께 55%·58% '줄었어요'로 나왔다). 그래서 ① 두 기간의 하루 평균 열량이
 * 비슷할 때만(둘 다 알 때), ② 어느 쪽도 '기록 더 필요'가 아닐 때만 말한다. 열량 줄 자체의 변화는 nutrientChange 로 그대로 말한다
 * (그것이 기록량이 달라졌다는 사실이다).
 */
export const comparableNutrientChange = (
  now: NutrientPeriodValue,
  before: NutrientPeriodValue | null | undefined,
  energy: { now: number | null | undefined; before: number | null | undefined },
): NutrientChange | null => {
  if (!comparableRecording(energy.now, energy.before)) return null;
  const change = nutrientChange(now, before);
  return change && change.now !== 'recordGap' && change.before !== 'recordGap' ? change : null;
};

const direction = (c: NutrientChange): string => (c.diff > 0 ? '늘었어요' : '줄었어요');
const percentOf = (c: NutrientChange): number => Math.round(Math.abs(c.rel) * 100);

/**
 * 변화 한 줄 — '직전 1달보다 하루 800mg(31%) 늘었어요 · 직전엔 충분'. 판정이 바뀌었을 때만 직전 판정을 덧붙인다.
 * statusLabel 은 판정 글자를 바꿔 쓸 때(이야기는 지킨 나트륨 기준을 '충분'이 아니라 '기준 안'이라고 한다).
 */
export const nutrientChangeText = (
  c: NutrientChange,
  prevLabel: string,
  statusLabel: (key: MealNutrientDisplayKey) => string = (key) => MEAL_NUTRIENT_STATUS_LABEL[key],
): string => {
  const status = c.before && c.now !== c.before ? ` · 직전엔 ${statusLabel(c.before)}` : '';
  return `${prevLabel}보다 하루 ${formatNutrientAmount(Math.abs(c.diff))}${c.unit}(${percentOf(c)}%) ${direction(c)}${status}`;
};

/** 짧은 변화 한 줄 — '직전 2주보다 31% 늘었어요'. 자리가 좁은 곳(영상의 쪽지). */
export const nutrientChangeShort = (c: NutrientChange, prevLabel: string): string =>
  `${prevLabel}보다 ${percentOf(c)}% ${direction(c)}`;

/** 오늘까지 days 일(오늘 포함)과 그 직전 같은 길이 기간 — 날짜 키(YYYY-MM-DD, 이 기기의 날짜). */
export const periodAndPrevious = (days: number, today: Date = new Date()): { now: { from: string; to: string }; previous: { from: string; to: string } } => {
  const key = (ago: number): string => {
    const d = new Date(today);
    d.setDate(d.getDate() - ago);
    return toLocalDateKey(d);
  };
  return { now: { from: key(days - 1), to: key(0) }, previous: { from: key(2 * days - 1), to: key(days) } };
};
