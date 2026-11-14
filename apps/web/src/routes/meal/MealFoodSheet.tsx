import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Check, ChevronDown, Plus, Search, X } from 'lucide-react';
import {
  MEAL_SIDE_DEFAULT_DISH_TYPES,
  type FoodSearchItemType,
  type FrequentMealItemType,
  type MealEntryType,
  type MealPlaceMenuType,
  type MealSlotType,
} from '@repo/api-contract';
import {
  mealItemNameKey,
  mealMenuFoodPatch,
  mealMenuFoods,
  useFoodSearch,
  useFrequentMealItems,
  useMealDraftStore,
  useMealEntries,
  useMealPlaceMenus,
  type MealDraftItem,
  type MealMenuPicks,
} from '@repo/shared';
import {
  FOOD_DISH_TYPE_LABEL,
  MEAL_PORTION_LABEL,
  MEAL_SLOT_LABEL,
  mealDateLabel,
  toLocalDateKey,
} from '@repo/utils';
import { useDebounced } from '~/lib/useDebounced';
import { emptyMealItem } from './mealDraftStart';
import { MealPlaceMenuChooser } from './MealPlaceMenuChooser';
import { placeMenuKcalLabel, placeMenuMatches, placeMenuSub } from './mealPlaceMenu';

// 음식 찾기(휴대폰, 2026-11-08 리뉴얼 3단계) — 입력칸 아래 자동완성(키보드에 가리고 2자부터·칩이 작다) 대신 화면 전체를
// 쓰는 시트. 검색칸은 위에 붙고, 치기 전엔 이 끼니에 자주 먹은 음식·최근 끼니 통째로, 치는 중엔 '그대로 넣기' →
// 내 기록(1자부터) → 음식 목록(2자부터, 1인분 열량). 줄을 누르면 넣고 다시 누르면 뺀다(연속으로 넣고 '완료').
// 줄 하나를 바꾸러 열면(replace) 고르는 즉시 그 줄을 바꾸고 닫는다. 넣는 값은 빠른 추가 칩과 같은 규칙(toggleQuickItem).
// 완료 버튼을 위에 둔다 — 아래에 두면 휴대폰 키보드에 가린다.

export type MealFoodSheetMode = { kind: 'add' } | { kind: 'replace'; clientId: string };

const SEARCH_DEBOUNCE_MS = 200;
const TRAILING_JAMO = /[ㄱ-ㆎ]+$/;
const RECENT_MEALS = 5;
// 치기 전에 보여 주는 식당 메뉴 수 — 메뉴가 100개 넘는 집도 있어 자주 먹은 음식이 화면 밖으로 밀리지 않게 한다.
const MENUS_BEFORE_SEARCH = 15;

const fmt = (n: number): string => Math.round(n).toLocaleString('ko-KR');

const fromCatalog = (f: FoodSearchItemType): FrequentMealItemType => ({
  name: f.name,
  foodId: f.id,
  dishType: f.dishType,
  mainIngredient: f.mainIngredient,
  cuisine: f.cuisine,
  // 김치·나물은 반찬으로 — 서버가 준 1인분 열량도 같은 기준이다.
  isMain: !MEAL_SIDE_DEFAULT_DISH_TYPES.includes(f.dishType ?? ''),
  portion: null,
  servings: null,
  portionSource: null,
  count: f.myCount,
  lastEatenDate: null,
  from: 'default',
  kcal: f.servingKcal,
});

const fromTyped = (name: string): FrequentMealItemType => ({
  name,
  foodId: null,
  dishType: null,
  mainIngredient: null,
  cuisine: null,
  isMain: true,
  portion: null,
  servings: null,
  portionSource: null,
  count: 0,
  lastEatenDate: null,
  from: 'default',
  kcal: null,
});

const fromEntryItem = (it: MealEntryType['items'][number]): FrequentMealItemType => ({
  name: it.name,
  foodId: it.foodId,
  dishType: it.dishType,
  mainIngredient: it.mainIngredient,
  cuisine: it.cuisine,
  isMain: it.isMain,
  portion: it.portion,
  servings: it.servings,
  portionSource: it.portionSource,
  count: 0,
  lastEatenDate: null,
  from: 'history',
  kcal: it.kcal,
});

// 줄 하나를 바꿀 때 — 사진 인식 계보(recognitionDishId)는 남기고 이름·연결·분류·양만 바꾼다(자동완성에서 고를 때와 같다).
const replacePatch = (q: FrequentMealItemType): Partial<MealDraftItem> => ({
  name: q.name,
  foodId: q.foodId,
  dishType: q.dishType,
  mainIngredient: q.mainIngredient,
  cuisine: q.cuisine,
  portion: q.portion,
  servings: q.servings,
  portionSource: q.portionSource,
  isMain: q.isMain,
  catalogMatchedBy: q.foodId ? 'food_id' : 'none',
  catalogMatchScore: q.foodId ? 1 : null,
  selectedCandidateRank: null,
  source: q.foodId ? 'catalog' : 'manual',
});

export const MealFoodSheet = ({
  mode,
  slot,
  onClose,
}: {
  mode: MealFoodSheetMode;
  slot: MealSlotType;
  onClose: () => void;
}) => {
  const titleId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const items = useMealDraftStore((s) => s.items);
  const toggleQuickItem = useMealDraftStore((s) => s.toggleQuickItem);
  const updateItem = useMealDraftStore((s) => s.updateItem);
  const replacing =
    mode.kind === 'replace' ? items.find((it) => it.clientId === mode.clientId) : undefined;
  const [q, setQ] = useState(replacing?.name ?? '');
  const [added, setAdded] = useState(0);
  // 고르는 칸이 열린 식당 메뉴(코스의 "짜장면 / 짬뽕"처럼 넣기 전에 골라야 하는 메뉴).
  const [choosing, setChoosing] = useState<string | null>(null);
  const term = useDebounced(q, SEARCH_DEBOUNCE_MS).replace(TRAILING_JAMO, '').trim();
  const typed = q.trim();
  const searching = typed.length > 0 && term.length > 0;

  const frequent = useFrequentMealItems(slot);
  const mine = useFrequentMealItems(slot, searching, searching ? term : undefined);
  const catalog = useFoodSearch(term, { limit: 12, enabled: searching && term.length >= 2 });
  const recent = useMealEntries({ limit: 12 }, !searching);
  // 기록에 등록 식당이 정해져 있으면 그 집 메뉴를 맨 위에 — 치는 중엔 그 말이 든 메뉴만.
  const placeId = useMealDraftStore((s) => s.placeId);
  const placeName = useMealDraftStore((s) => s.placeName);
  const toggleMenuItem = useMealDraftStore((s) => s.toggleMenuItem);
  const addItem = useMealDraftStore((s) => s.addItem);
  const placeMenus = useMealPlaceMenus(placeId);
  const allMenus = placeMenus.data?.menus ?? [];
  const matchedMenus = searching ? allMenus.filter((menu) => placeMenuMatches(menu, term)) : allMenus;
  const shownMenus = searching ? matchedMenus : matchedMenus.slice(0, MENUS_BEFORE_SEARCH);
  const chosenMenus = new Set(items.flatMap((it) => (it.menuName ? [it.menuName] : [])));

  const chosen = new Set(
    items.filter((it) => it.name.trim()).map((it) => mealItemNameKey(it.name)),
  );
  const isIn = (name: string) => chosen.has(mealItemNameKey(name));

  // 시트가 떠 있는 동안 뒤 화면 스크롤을 막고 검색칸에 포커스, Esc 로 닫는다 — 문서(외부)와 맞추는 일이라 effect.
  useEffect(() => {
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = 'hidden';
    inputRef.current?.focus();
    return () => {
      root.style.overflow = before;
    };
  }, []);
  // 휴대폰 키보드가 올라오면 보이는 화면(visualViewport)에 맞춘다 — iOS 는 fixed 화면이 키보드 뒤로 깔려 목록 끝이
  // 가린다. 위치·높이를 보이는 화면에 붙인다.
  useEffect(() => {
    const vv = window.visualViewport;
    const el = sheetRef.current;
    if (!vv || !el) return undefined;
    const fit = () => {
      el.style.top = `${vv.offsetTop}px`;
      el.style.height = `${vv.height}px`;
      el.style.bottom = 'auto';
    };
    fit();
    vv.addEventListener('resize', fit);
    vv.addEventListener('scroll', fit);
    return () => {
      vv.removeEventListener('resize', fit);
      vv.removeEventListener('scroll', fit);
    };
  }, []);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const pick = (quick: FrequentMealItemType) => {
    if (mode.kind === 'replace') {
      updateItem(mode.clientId, replacePatch(quick));
      onClose();
      return;
    }
    const wasIn = isIn(quick.name);
    toggleQuickItem(quick);
    setAdded((n) => Math.max(0, n + (wasIn ? -1 : 1)));
  };

  const pickMenu = (menu: MealPlaceMenuType, picks?: MealMenuPicks) => {
    setChoosing(null);
    if (mode.kind === 'replace') {
      // 그 줄을 메뉴의 첫 음식으로 바꾸고, 세트의 나머지 구성요소는 새 줄로 잇는다(가격은 첫 줄에만).
      const [first, ...rest] = mealMenuFoods(menu, picks);
      if (!first) return;
      updateItem(mode.clientId, {
        ...mealMenuFoodPatch(first),
        selectedCandidateRank: null,
        menuName: menu.menuName,
        menuPrice: menu.price,
      });
      for (const food of rest) {
        addItem({ ...emptyMealItem(), ...mealMenuFoodPatch(food), menuName: menu.menuName, menuPrice: null });
      }
      onClose();
      return;
    }
    const wasIn = chosenMenus.has(menu.menuName);
    toggleMenuItem(menu, picks);
    setAdded((n) => Math.max(0, n + (wasIn ? -1 : 1)));
  };

  const addMeal = (entry: MealEntryType) => {
    let n = 0;
    for (const it of entry.items) {
      if (isIn(it.name)) continue;
      toggleQuickItem(fromEntryItem(it));
      n += 1;
    }
    setAdded((count) => count + n);
  };

  const mineItems = mine.data?.items ?? [];
  const mineKeys = new Set(mineItems.map((m) => mealItemNameKey(m.name)));
  const mineFoods = new Set(mineItems.flatMap((m) => (m.foodId ? [m.foodId] : [])));
  const catalogItems = (catalog.data?.items ?? []).filter(
    (f) => !mineFoods.has(f.id) && !mineKeys.has(mealItemNameKey(f.name)),
  );
  const exactKnown = [
    ...mineItems.map((m) => m.name),
    ...catalogItems.map((f) => f.name),
    ...matchedMenus.map((menu) => menu.menuName),
  ].some((name) => mealItemNameKey(name) === mealItemNameKey(typed));
  const menuGroup =
    shownMenus.length > 0 ? (
      <SheetGroup title={`${placeMenus.data?.placeName ?? placeName ?? '식당'} 메뉴`}>
        {shownMenus.map((menu) => {
          const on = chosenMenus.has(menu.menuName);
          // 넣기 전에 골라야 하는 메뉴 — 누르면 줄 아래에 고르는 칸이 열린다. 넣은 메뉴는 다시 누르면 빠진다
          // (줄을 바꾸는 중이면 넣은 메뉴라도 다시 고른다).
          const mustChoose = (menu.choices?.length ?? 0) > 0 && (mode.kind === 'replace' || !on);
          const open = mustChoose && choosing === menu.menuName;
          return (
            <SheetRow
              key={`p-${menu.menuName}`}
              title={menu.menuName}
              sub={placeMenuSub(menu)}
              kcalText={placeMenuKcalLabel(menu)}
              on={on}
              expanded={mustChoose ? open : undefined}
              onClick={() => (mustChoose ? setChoosing(open ? null : menu.menuName) : pickMenu(menu))}
            >
              {open ? (
                <MealPlaceMenuChooser
                  menu={menu}
                  onAdd={(picks) => pickMenu(menu, picks)}
                  onCancel={() => setChoosing(null)}
                />
              ) : null}
            </SheetRow>
          );
        })}
        {matchedMenus.length > shownMenus.length ? (
          <li className="meal-sheet-empty">
            메뉴가 {matchedMenus.length - shownMenus.length}개 더 있어요 — 이름을 치면 찾아요.
          </li>
        ) : null}
      </SheetGroup>
    ) : null;

  return createPortal(
    <div
      ref={sheetRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="meal-sheet"
    >
      <div className="meal-sheet-head">
        <button type="button" className="meal-sheet-icon" onClick={onClose} aria-label="닫기">
          <ArrowLeft className="size-5" aria-hidden />
        </button>
        <h2 id={titleId} className="sr-only">
          {mode.kind === 'replace' ? '음식 바꾸기' : '음식 찾기'}
        </h2>
        <label className="meal-sheet-search">
          <Search className="size-4 shrink-0" aria-hidden />
          <input
            ref={inputRef}
            value={q}
            onChange={(event) => setQ(event.target.value)}
            onKeyDown={(event) => {
              // 엔터는 친 이름 그대로 — 목록에서 고르려면 누른다.
              if (event.key === 'Enter' && typed && !event.nativeEvent.isComposing) {
                event.preventDefault();
                pick(fromTyped(typed));
                if (mode.kind === 'add') setQ('');
              }
            }}
            maxLength={60}
            placeholder="음식 이름 (예: 김치찌개)"
            aria-label="음식 찾기"
            enterKeyHint="done"
          />
          {q ? (
            <button
              type="button"
              onClick={() => setQ('')}
              aria-label="지우기"
              className="meal-sheet-clear"
            >
              <X className="size-4" aria-hidden />
            </button>
          ) : null}
        </label>
        {mode.kind === 'add' ? (
          <button type="button" className="meal-btn meal-sheet-done" onClick={onClose}>
            {added > 0 ? `${added}개 · 완료` : '완료'}
          </button>
        ) : null}
      </div>

      <div className="meal-sheet-body">
        {searching ? (
          <>
            {menuGroup}
            {typed && !exactKnown ? (
              <SheetGroup>
                <SheetRow
                  title={`'${typed}' 그대로 넣기`}
                  sub="목록에 없어도 이 이름으로 적어요"
                  on={isIn(typed)}
                  onClick={() => pick(fromTyped(typed))}
                />
              </SheetGroup>
            ) : null}
            {mineItems.length > 0 ? (
              <SheetGroup title="내 기록">
                {mineItems.map((m) => (
                  <SheetRow
                    key={`m-${m.name}`}
                    title={m.name}
                    sub={quickSub(m)}
                    kcal={m.kcal ?? null}
                    on={isIn(m.name)}
                    onClick={() => pick(m)}
                  />
                ))}
              </SheetGroup>
            ) : null}
            {term.length >= 2 ? (
              <SheetGroup title="음식 목록">
                {catalogItems.length === 0 ? (
                  <p className="meal-sheet-empty">
                    {catalog.isFetching ? '찾는 중…' : '목록에서 찾지 못했어요.'}
                  </p>
                ) : (
                  catalogItems.map((f) => (
                    <SheetRow
                      key={f.id}
                      title={f.name}
                      sub={[
                        f.dishType ? FOOD_DISH_TYPE_LABEL[f.dishType] : null,
                        MEAL_SIDE_DEFAULT_DISH_TYPES.includes(f.dishType ?? '') ? '반찬으로' : null,
                        f.myCount > 0 ? `내 기록 ${f.myCount}번` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                      kcal={f.servingKcal}
                      on={isIn(f.name)}
                      onClick={() => pick(fromCatalog(f))}
                    />
                  ))
                )}
              </SheetGroup>
            ) : (
              <p className="meal-sheet-empty">두 글자부터 음식 목록에서도 찾아요.</p>
            )}
          </>
        ) : (
          <>
            {menuGroup}
            {(frequent.data?.items.length ?? 0) > 0 ? (
              <SheetGroup title={`${MEAL_SLOT_LABEL[slot]}에 자주 먹은 음식`}>
                {frequent.data!.items.map((m) => (
                  <SheetRow
                    key={`f-${m.name}`}
                    title={m.name}
                    sub={quickSub(m)}
                    kcal={m.kcal ?? null}
                    on={isIn(m.name)}
                    onClick={() => pick(m)}
                  />
                ))}
              </SheetGroup>
            ) : null}
            {mode.kind === 'add' ? (
              <RecentMeals entries={recent.data?.items ?? []} onAdd={addMeal} />
            ) : null}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
};

const quickSub = (m: FrequentMealItemType): string =>
  [
    m.from === 'history' ? `${m.count}번` : '기본',
    m.isMain ? null : '반찬',
    m.from === 'history' && m.portion ? `지난번 ${MEAL_PORTION_LABEL[m.portion]}` : null,
    m.from === 'history' && m.servings ? `지난번 ${m.servings}인분` : null,
  ]
    .filter(Boolean)
    .join(' · ');

// 최근 끼니 통째로 — 같은 차림은 한 번만(가장 최근), 누르면 그 끼니 음식을 모두 넣는다(이미 있는 이름은 건너뛴다).
const RecentMeals = ({
  entries,
  onAdd,
}: {
  entries: MealEntryType[];
  onAdd: (entry: MealEntryType) => void;
}) => {
  const today = toLocalDateKey(new Date());
  const seen = new Set<string>();
  const meals: MealEntryType[] = [];
  for (const e of entries) {
    if (e.items.length === 0) continue;
    const key = e.items
      .map((it) => mealItemNameKey(it.name))
      .sort()
      .join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    meals.push(e);
    if (meals.length >= RECENT_MEALS) break;
  }
  if (meals.length === 0) return null;
  return (
    <SheetGroup title="최근 끼니 통째로">
      {meals.map((e) => {
        const names = e.items.map((it) => it.name);
        const kcal = e.items.reduce<number | null>(
          (sum, it) => (it.kcal === null ? sum : (sum ?? 0) + it.kcal),
          null,
        );
        return (
          <SheetRow
            key={e.id}
            title={
              names.slice(0, 3).join(', ') + (names.length > 3 ? ` 외 ${names.length - 3}` : '')
            }
            sub={`${mealDateLabel(e.eatenDate, today)} ${MEAL_SLOT_LABEL[e.slot]} · ${names.length}개`}
            kcal={kcal}
            on={false}
            action="넣기"
            onClick={() => onAdd(e)}
          />
        );
      })}
    </SheetGroup>
  );
};

const SheetGroup = ({ title, children }: { title?: string; children: ReactNode }) => (
  <section className="meal-sheet-group">
    {title ? <h3 className="meal-sheet-group-title">{title}</h3> : null}
    <ul>{children}</ul>
  </section>
);

const SheetRow = ({
  title,
  sub,
  kcal,
  kcalText,
  on,
  action,
  expanded,
  onClick,
  children,
}: {
  title: string;
  sub?: string;
  kcal?: number | null;
  /** 숫자 하나가 아닌 열량 글("740~1,010kcal") — 있으면 kcal 대신 쓴다. */
  kcalText?: string | null;
  on: boolean;
  action?: string;
  /** 누르면 줄 아래가 열리는 줄(고르는 칸) — 열렸는지. */
  expanded?: boolean;
  onClick: () => void;
  /** 줄 아래에 펼치는 내용. */
  children?: ReactNode;
}) => {
  const kcalLabel = kcalText ?? (kcal !== undefined && kcal !== null ? `${fmt(kcal)}kcal` : null);
  return (
    <li>
      <button
        type="button"
        className="meal-sheet-row"
        aria-pressed={action ? undefined : on}
        aria-expanded={expanded}
        onClick={onClick}
      >
        <span className="min-w-0 flex-1">
          <span className="meal-sheet-row-title">{title}</span>
          {sub ? <span className="meal-sheet-row-sub">{sub}</span> : null}
        </span>
        {kcalLabel ? <span className="meal-sheet-row-kcal">{kcalLabel}</span> : null}
        <span className="meal-sheet-row-mark" aria-hidden>
          {action ? (
            action
          ) : on ? (
            <Check className="size-4" />
          ) : expanded !== undefined ? (
            <ChevronDown className="size-4" />
          ) : (
            <Plus className="size-4" />
          )}
        </span>
      </button>
      {children}
    </li>
  );
};
