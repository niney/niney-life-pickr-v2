import type { FrequentMealItemType, MealEntryType, MealSlotType } from '@repo/api-contract';
import {
  mealDraftInitFromEntry,
  mealItemNameKey,
  useMealDraftStore,
  type MealDraftItem,
  type MealDraftPhoto,
} from '@repo/shared';
import { MEAL_SLOT_DEFAULT_TIME, guessMealSlot, parseTimeOfDay, toLocalDateKey } from '@repo/utils';

// 새 기록 시작 — 입력 화면 밖(식단 홈의 빈 끼니 칸·자주 먹은 음식)에서 끼니·음식을 정해 들고 들어간다.
// 입력 화면이 이 draft 를 그대로 이어 쓴다(쓰다 만 새 기록이 있으면 그 위에 얹는다 — 입력 화면과 같은 규칙).

export const emptyMealItem = (): Omit<MealDraftItem, 'clientId'> => ({
  name: '',
  foodId: null,
  dishType: null,
  mainIngredient: null,
  cuisine: null,
  portion: null,
  isMain: true,
  confidence: null,
  source: 'manual',
  candidates: [],
});

// 지금 끼니면 지금 시각, 다른 끼니면 그 끼니의 보통 시각(저녁 칸을 오후 3시에 눌러도 19:00 으로). 다른 날(홈의 어제 빈 끼니)이면
// 그 날 그 끼니의 보통 시각.
const eatenAtFor = (slot: MealSlotType, now: Date, date?: string): Date => {
  const sameDay = !date || date === toLocalDateKey(now);
  if (sameDay && slot === guessMealSlot(now)) return now;
  let at = new Date(now);
  if (!sameDay) {
    const [y = 1970, m = 1, d = 1] = date.split('-').map(Number);
    at = new Date(y, m - 1, d, 12, 0, 0, 0);
  }
  const minutes = parseTimeOfDay(MEAL_SLOT_DEFAULT_TIME[slot]);
  if (minutes === null) return at;
  at.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return at;
};

/** 새 기록 draft 를 준비한다 — 끼니(선택)·음식(선택)·날짜(선택, 'YYYY-MM-DD' — 없으면 오늘). 이동은 호출하는 쪽이 한다. */
export const prepareMealEntry = (
  opts: { slot?: MealSlotType; quick?: FrequentMealItemType; date?: string } = {},
): void => {
  const store = useMealDraftStore.getState();
  const inProgress = store.entryId === null && store.eatenDate !== '';
  const now = new Date();
  if (!inProgress) {
    const slot = opts.slot ?? guessMealSlot(now);
    const at = eatenAtFor(slot, now, opts.date);
    store.start({ eatenAt: at.toISOString(), eatenDate: toLocalDateKey(at), slot });
    if (!opts.quick) useMealDraftStore.getState().addItem(emptyMealItem());
  } else {
    if (opts.slot && store.slot !== opts.slot) store.setField('slot', opts.slot);
    // 쓰다 둔 새 기록이 다른 날이면 고른 날로 옮긴다(끼니를 옮기는 것과 같은 규칙).
    if (opts.date && store.eatenDate !== opts.date) {
      const at = eatenAtFor(opts.slot ?? store.slot, now, opts.date);
      store.setField('eatenAt', at.toISOString());
      store.setField('eatenDate', opts.date);
    }
  }
  if (opts.quick) {
    const key = mealItemNameKey(opts.quick.name);
    const already = useMealDraftStore
      .getState()
      .items.some((item) => mealItemNameKey(item.name) === key);
    if (!already) useMealDraftStore.getState().toggleQuickItem(opts.quick);
  }
};

/** 지금 시각의 빈 새 기록으로 연다(빈 음식 줄 하나). */
export const startFreshMealDraft = (now: Date): void => {
  useMealDraftStore
    .getState()
    .start({
      eatenAt: now.toISOString(),
      eatenDate: toLocalDateKey(now),
      slot: guessMealSlot(now),
    });
  useMealDraftStore.getState().addItem(emptyMealItem());
};

type MealDraftSnapshot = ReturnType<typeof useMealDraftStore.getState>;

const hasDraftContent = (d: MealDraftSnapshot): boolean =>
  d.items.some((item) => item.name.trim().length > 0) ||
  d.photos.length > 0 ||
  d.pendingPhotos.length > 0 ||
  d.memo.trim().length > 0;

// 방금 다른 화면이 채워 넘긴 draft 와 쓰다 둔 draft 를 가르는 시간 — 넘겨 주는 쪽은 누르는 순간 채운다.
const STALE_DRAFT_MS = 30_000;

/** 한참 전에 쓰다 둔 새 기록인가 — 새 기록을 열 때 '이어서 열었다'고 알릴지. */
export const isMealDraftStale = (d: MealDraftSnapshot, now: number): boolean =>
  d.entryId === null &&
  d.eatenDate !== '' &&
  now - d.updatedAt > STALE_DRAFT_MS &&
  hasDraftContent(d);

interface DraftFields {
  eatenAt?: string;
  eatenDate?: string;
  slot?: MealSlotType;
  mealType?: string | null;
  placeId?: string | null;
  placeName?: string | null;
  memo?: string;
  photos?: MealDraftPhoto[];
  items?: MealDraftItem[];
}

// 저장에 실리는 값만 — 분 단위 시각(시각 입력은 초를 0 으로 맞춘다), 이름 있는 음식의 이름·연결·양·주식 여부.
const signature = (d: DraftFields): string =>
  JSON.stringify([
    d.eatenDate ?? '',
    d.eatenAt ? Math.floor(new Date(d.eatenAt).getTime() / 60_000) : null,
    d.slot ?? null,
    d.mealType ?? null,
    d.placeId ?? null,
    d.placeName ?? null,
    (d.memo ?? '').trim(),
    (d.photos ?? []).map((photo) => photo.token),
    (d.items ?? [])
      .filter((item) => item.name.trim().length > 0)
      .map((item) => [
        item.name.trim(),
        item.foodId,
        item.portion,
        item.servings ?? null,
        item.isMain,
      ]),
  ]);

/** 고치던 기록에 저장하지 않은 내용이 있는가(서버 기록과 비교). */
export const isMealDraftChanged = (d: MealDraftSnapshot, entry: MealEntryType): boolean => {
  if (d.entryId !== entry.id) return false;
  if (d.pendingPhotos.length > 0) return true;
  return signature(d) !== signature(mealDraftInitFromEntry(entry) as DraftFields);
};
