// 통계 분포 막대의 기준 — 끼니 수(주식 횟수, 통계 API) · 열량·나트륨(이 기간 섭취 중 묶음 몫, 통계 영양 API).

export type MealBarMetric = 'count' | 'kcal' | 'sodium';

export const MEAL_BAR_METRICS: ReadonlyArray<{ key: MealBarMetric; label: string; hint: string }> =
  [
    { key: 'count', label: '끼니 수', hint: '주식으로 먹은 횟수' },
    { key: 'kcal', label: '열량', hint: '이 기간 먹은 열량 중 몫(반찬 포함)' },
    { key: 'sodium', label: '나트륨', hint: '이 기간 먹은 나트륨 중 몫(반찬 포함)' },
  ];
