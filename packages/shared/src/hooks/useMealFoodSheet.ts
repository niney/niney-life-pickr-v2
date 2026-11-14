import { useEffect, useState } from 'react';
import {
  MEAL_MAX_ITEMS_PER_ENTRY,
  type FrequentMealItemType,
  type MealEntryType,
  type MealSlotType,
} from '@repo/api-contract';
import { toLocalDateKey } from '@repo/utils';
import { mealItemNameKey, useMealDraftStore } from '../stores/mealDraftStore.js';
import {
  MEAL_FOOD_CATALOG_MIN_CHARS,
  MEAL_FOOD_SEARCH_DEBOUNCE_MS,
  mealFoodSearchTerm,
  mealItemReplacePatch,
  mealQuickFromEntryItem,
  mealQuickFromTyped,
  pickRecentMeals,
  splitMealFoodResults,
  type MealFoodSheetMode,
} from '../meal/foodSearch.js';
import { useFoodSearch } from './useFood.js';
import { useFrequentMealItems, useMealEntries } from './useMeal.js';

// 음식 찾기 시트의 상태·조회·넣고 빼기(웹 휴대폰 MealFoodSheet·앱 MealFoodSheet 공통).
// 치기 전엔 이 끼니에 자주 먹은 음식·최근 끼니 통째로, 치는 중엔 '그대로 넣기' → 내 기록(한 글자부터) →
// 음식 목록(두 글자부터). 'add' 는 누를 때마다 넣고 빼며 넣은 개수를 센다(시트는 '완료'로 닫는다). 'replace' 는
// 고르는 즉시 그 줄을 바꾼다 — 결과가 'replaced' 면 시트를 닫는다.

// 값이 delay 동안 안정된 뒤에야 바뀐다 — 타이머(외부 시스템)와 맞추는 일이라 effect.
const useDebouncedValue = <T>(value: T, delayMs: number): T => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
};

/** 'already' — 이미 넣은 이름(엔터로 넣기), 'full' — 한 끼 최대 개수에 닿아 넣지 못했다. */
export type MealFoodPickResult = 'added' | 'removed' | 'replaced' | 'already' | 'full';

// 이름이 있는 줄 수 — 빈 줄을 채워 넣으면 줄 수는 그대로라 이름 있는 줄로 넣은 개수를 센다.
const namedItemCount = (): number =>
  useMealDraftStore.getState().items.filter((it) => it.name.trim().length > 0).length;

export const useMealFoodSheet = (mode: MealFoodSheetMode, slot: MealSlotType) => {
  const items = useMealDraftStore((s) => s.items);
  const toggleQuickItem = useMealDraftStore((s) => s.toggleQuickItem);
  const updateItem = useMealDraftStore((s) => s.updateItem);
  // 줄을 바꾸러 열면 그 줄 이름으로 시작한다 — 고칠 이름과 그 검색 결과가 바로 보인다.
  const [q, setQ] = useState(() =>
    mode.kind === 'replace' ? (items.find((it) => it.clientId === mode.clientId)?.name ?? '') : '',
  );
  const [added, setAdded] = useState(0);
  const term = mealFoodSearchTerm(useDebouncedValue(q, MEAL_FOOD_SEARCH_DEBOUNCE_MS));
  const typed = q.trim();
  const searching = typed.length > 0 && term.length > 0;
  const catalogEnabled = searching && term.length >= MEAL_FOOD_CATALOG_MIN_CHARS;

  const frequent = useFrequentMealItems(slot);
  const mine = useFrequentMealItems(slot, searching, searching ? term : undefined);
  const catalog = useFoodSearch(term, { limit: 12, enabled: catalogEnabled });
  const recent = useMealEntries({ limit: 12 }, mode.kind === 'add' && !searching);

  const chosen = new Set(
    items.filter((it) => it.name.trim()).map((it) => mealItemNameKey(it.name)),
  );
  const isIn = (name: string): boolean => chosen.has(mealItemNameKey(name));
  // 스토어(toggleQuickItem)와 같은 기준 — 줄 수가 한도면 더 넣지 않는다.
  const full = items.length >= MEAL_MAX_ITEMS_PER_ENTRY;

  const mineItems = searching ? (mine.data?.items ?? []) : [];
  // 두 글자 밑으로 줄면 지난 목록(keepPreviousData)이 남는다 — 보이지 않는 목록으로 '그대로 넣기'를 감추지 않게.
  const catalogFound = catalogEnabled ? (catalog.data?.items ?? []) : [];
  const {
    catalog: catalogItems,
    exactKnown,
    exact,
  } = splitMealFoodResults(mineItems, catalogFound, typed);

  // 스토어를 바꾸고, 이름 있는 줄 수가 달라진 만큼 넣은 개수에 더한다. 화면이 스토어에 직접 넣는 것(웹 시트의 식당 메뉴)도
  // 이 셈으로 센다 — 따로 세면 메뉴로 넣은 음식을 다른 줄에서 눌러 뺀 뒤에도 개수가 남는다.
  const countChange = (change: () => void): number => {
    const before = namedItemCount();
    change();
    const delta = namedItemCount() - before;
    setAdded((n) => Math.max(0, n + delta));
    return delta;
  };

  const pick = (quick: FrequentMealItemType): MealFoodPickResult => {
    if (mode.kind === 'replace') {
      updateItem(mode.clientId, mealItemReplacePatch(quick));
      return 'replaced';
    }
    const delta = countChange(() => toggleQuickItem(quick));
    return delta > 0 ? 'added' : delta < 0 ? 'removed' : 'full';
  };

  // 엔터·키보드 완료 키 — 친 이름으로 넣고 검색칸을 비워 다음 음식을 바로 친다. 이미 넣은 이름이면 빼지 않는다
  // (줄을 누르는 것과 달리 '넣기'만 한다). 같은 이름이 내 기록·음식 목록에 있으면 그 줄을 고른 것으로 넣는다 —
  // 친 이름 그대로면 연결·지난번 양이 빠지고 '김치'도 주식으로 들어갔다. 결과가 아직 안 왔으면(빨리 치고 누름)
  // 친 이름 그대로 넣는다(저장할 때 서버가 이름으로 음식 목록에 잇는다).
  const submitTyped = (): MealFoodPickResult | null => {
    if (!typed) return null;
    if (mode.kind === 'add' && isIn(typed)) {
      setQ('');
      return 'already';
    }
    const result = pick(exact ?? mealQuickFromTyped(typed));
    if (mode.kind === 'add') setQ('');
    return result;
  };

  // 최근 끼니 통째로 — 그 끼니 음식을 모두 넣는다. 이미 있는 이름은 건너뛴다(한 끼 안의 같은 이름도 한 번만 —
  // 두 번 토글하면 넣었다가 도로 뺀다).
  const addMeal = (entry: MealEntryType): number => {
    const before = namedItemCount();
    const seen = new Set(chosen);
    for (const it of entry.items) {
      const key = mealItemNameKey(it.name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      toggleQuickItem(mealQuickFromEntryItem(it));
    }
    const delta = namedItemCount() - before;
    setAdded((n) => n + delta);
    return delta;
  };

  return {
    q,
    setQ,
    typed,
    term,
    searching,
    /** 이번에 열고 넣은 개수('add'). */
    added,
    /** 한 끼 최대 개수에 닿았다. */
    full,
    frequentItems: frequent.data?.items ?? [],
    mineItems,
    catalogItems,
    /** 음식 목록을 찾는 중인가(두 글자부터). */
    catalogEnabled,
    catalogFetching: catalog.isFetching,
    /** 음식 목록이 찾은 게 모두 내 기록에 이미 있다 — '찾지 못했어요' 대신 음식 목록 묶음을 감춘다. */
    catalogCoveredByMine: catalogFound.length > 0 && catalogItems.length === 0,
    exactKnown,
    recentMeals:
      mode.kind === 'add'
        ? pickRecentMeals(recent.data?.items ?? [], toLocalDateKey(new Date()))
        : [],
    isIn,
    pick,
    submitTyped,
    addMeal,
    countChange,
  };
};
