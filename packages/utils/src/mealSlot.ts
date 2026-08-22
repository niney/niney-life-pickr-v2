// 식단 관리(meal) 순수 유틸 — 끼니 추정·라벨·날짜 키. 서버(기록 검증·통계)와 웹·앱(입력 폼·
// 표시)이 같은 규칙을 쓰도록 한 곳에 둔다. 키 목록은 @repo/api-contract 의 MealSlot /
// MealType / MealPortion / MealItemSource enum 과 **같은 순서**여야 한다(friendly 테스트가 검증).

export const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack', 'late_night'] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

export const MEAL_SLOT_LABEL: Record<MealSlot, string> = {
  breakfast: '아침',
  lunch: '점심',
  dinner: '저녁',
  snack: '간식',
  late_night: '야식',
};

// 하루 안에서의 표시 순서(끼니별 묶음 정렬).
export const MEAL_SLOT_ORDER: Record<MealSlot, number> = {
  breakfast: 0,
  lunch: 1,
  dinner: 2,
  snack: 3,
  late_night: 4,
};

export const MEAL_TYPES = ['home', 'dining_out', 'delivery', 'convenience', 'other'] as const;
export type MealType = (typeof MEAL_TYPES)[number];

export const MEAL_TYPE_LABEL: Record<MealType, string> = {
  home: '집밥',
  dining_out: '외식',
  delivery: '배달',
  convenience: '편의점·간편식',
  other: '기타',
};

export const MEAL_PORTIONS = ['small', 'normal', 'large'] as const;
export type MealPortion = (typeof MEAL_PORTIONS)[number];

// 눈대중 양 → 1인분 배수. 비전 모델의 그램 추정은 오차가 커서(MAPE 50~400%) 서수 3단계만 받고,
// 영양 환산은 이 배수로만 한다 — 정밀값인 척하지 않기 위한 의도적 단순화다.
export const MEAL_PORTION_FACTOR: Record<MealPortion, number> = {
  small: 0.6,
  normal: 1,
  large: 1.5,
};

/** 양이 없으면 1인분(1.0)으로 본다. */
export const mealPortionFactor = (portion: string | null | undefined): number =>
  (portion && MEAL_PORTION_FACTOR[portion as MealPortion]) || 1;

export const MEAL_PORTION_LABEL: Record<MealPortion, string> = {
  small: '조금',
  normal: '보통',
  large: '많이',
};

export const MEAL_ITEM_SOURCES = ['recognized', 'manual', 'catalog', 'recommendation'] as const;
export type MealItemSource = (typeof MEAL_ITEM_SOURCES)[number];

export const isMealSlot = (v: unknown): v is MealSlot =>
  typeof v === 'string' && (MEAL_SLOTS as readonly string[]).includes(v);
export const isMealType = (v: unknown): v is MealType =>
  typeof v === 'string' && (MEAL_TYPES as readonly string[]).includes(v);

// 시각(0~23) → 끼니 추정. 05–10 아침 / 11–14 점심 / 17–21 저녁 / 22–04 야식 / 그 외(15–16) 간식.
export const guessMealSlotFromHour = (hour: number): MealSlot => {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  if (h >= 5 && h <= 10) return 'breakfast';
  if (h >= 11 && h <= 14) return 'lunch';
  if (h >= 17 && h <= 21) return 'dinner';
  if (h >= 22 || h <= 4) return 'late_night';
  return 'snack';
};

export const guessMealSlot = (date: Date): MealSlot => guessMealSlotFromHour(date.getHours());

// 로컬 'YYYY-MM-DD' — 기록의 eatenDate. UTC 로 변환하면 자정 근처 기록이 하루 밀리므로
// 반드시 로컬 컴포넌트로 만든다.
export const toLocalDateKey = (date: Date): string => {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const toLocalMonthKey = (date: Date): string => toLocalDateKey(date).slice(0, 7);

// 'YYYY-MM-DD' 를 로컬 자정 Date 로(달력 계산용). 잘못된 형식이면 null.
export const parseLocalDateKey = (key: string): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
};

// from~to(포함) 날짜 키 배열. 역순이면 빈 배열. 상한(기본 400일)으로 폭주 방지.
export const dateKeyRange = (from: string, to: string, maxDays = 400): string[] => {
  const start = parseLocalDateKey(from);
  const end = parseLocalDateKey(to);
  if (!start || !end || start > end) return [];
  const out: string[] = [];
  const cur = new Date(start);
  while (cur <= end && out.length < maxDays) {
    out.push(toLocalDateKey(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
};

// 'YYYY-MM' → 그 달의 [첫날, 마지막날] 키. 잘못된 형식이면 null.
export const monthRange = (month: string): { from: string; to: string } | null => {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  const first = new Date(y, mo - 1, 1);
  const last = new Date(y, mo, 0);
  return { from: toLocalDateKey(first), to: toLocalDateKey(last) };
};

// 두 날짜 키의 일수 차(b - a). 잘못된 형식이면 null.
export const daysBetween = (a: string, b: string): number | null => {
  const da = parseLocalDateKey(a);
  const db = parseLocalDateKey(b);
  if (!da || !db) return null;
  return Math.round((db.getTime() - da.getTime()) / 86_400_000);
};

// 상대 날짜 라벨 — '오늘'/'어제'/'3일 전'/'8월 14일'.
export const mealDateLabel = (dateKey: string, today: string): string => {
  const diff = daysBetween(dateKey, today);
  if (diff === null) return dateKey;
  if (diff === 0) return '오늘';
  if (diff === 1) return '어제';
  if (diff === 2) return '그저께';
  if (diff > 0 && diff <= 6) return `${diff}일 전`;
  const d = parseLocalDateKey(dateKey);
  if (!d) return dateKey;
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
};
