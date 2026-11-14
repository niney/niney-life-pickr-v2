import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Check, ChevronDown, Plus, Search, X } from 'lucide-react';
import {
  MEAL_MAX_ITEMS_PER_ENTRY,
  type FrequentMealItemType,
  type MealPlaceMenuType,
  type MealSlotType,
} from '@repo/api-contract';
import {
  mealCatalogSub,
  mealItemNameKey,
  mealMenuFoodPatch,
  mealMenuFoods,
  mealQuickFromCatalog,
  mealQuickFromTyped,
  mealQuickSub,
  useMealDraftStore,
  useMealFoodSheet,
  useMealPlaceMenus,
  type MealMenuPicks,
  type MealFoodSheetMode,
  type MealRecentMealOption,
} from '@repo/shared';
import { MEAL_SLOT_LABEL } from '@repo/utils';
import { emptyMealItem } from './mealDraftStart';
import { MealPlaceMenuChooser } from './MealPlaceMenuChooser';
import { placeMenuKcalLabel, placeMenuMatches, placeMenuSub } from './mealPlaceMenu';

// 음식 찾기(휴대폰, 2026-11-08 리뉴얼 3단계) — 입력칸 아래 자동완성(키보드에 가리고 2자부터·칩이 작다) 대신 화면 전체를
// 쓰는 시트. 검색칸은 위에 붙고, 치기 전엔 이 끼니에 자주 먹은 음식·최근 끼니 통째로, 치는 중엔 '그대로 넣기' →
// 내 기록(1자부터) → 음식 목록(2자부터, 1인분 열량). 줄을 누르면 넣고 다시 누르면 뺀다(연속으로 넣고 '완료').
// 줄 하나를 바꾸러 열면(replace) 고르는 즉시 그 줄을 바꾸고 닫는다. 넣는 값은 빠른 추가 칩과 같은 규칙(toggleQuickItem).
// 완료 버튼을 위에 둔다 — 아래에 두면 휴대폰 키보드에 가린다.
// 넣고 빼는 규칙·조회는 앱 시트와 같은 @repo/shared useMealFoodSheet — 여기는 화면(시트·키보드·Esc)과, 아직 웹에만 있는
// 식당 메뉴(그 집 메뉴에서 넣기)만.

export type { MealFoodSheetMode };

// 치기 전에 보여 주는 식당 메뉴 수 — 메뉴가 100개 넘는 집도 있어 자주 먹은 음식이 화면 밖으로 밀리지 않게 한다.
const MENUS_BEFORE_SEARCH = 15;

const fmt = (n: number): string => Math.round(n).toLocaleString('ko-KR');

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
  const sheet = useMealFoodSheet(mode, slot);
  const { q, typed, term, searching } = sheet;
  // 고르는 칸이 열린 식당 메뉴(코스의 "짜장면 / 짬뽕"처럼 넣기 전에 골라야 하는 메뉴).
  const [choosing, setChoosing] = useState<string | null>(null);
  // 기록에 등록 식당이 정해져 있으면 그 집 메뉴를 맨 위에 — 치는 중엔 그 말이 든 메뉴만.
  const items = useMealDraftStore((s) => s.items);
  const placeId = useMealDraftStore((s) => s.placeId);
  const placeName = useMealDraftStore((s) => s.placeName);
  const toggleMenuItem = useMealDraftStore((s) => s.toggleMenuItem);
  const updateItem = useMealDraftStore((s) => s.updateItem);
  const addItem = useMealDraftStore((s) => s.addItem);
  const placeMenus = useMealPlaceMenus(placeId);
  const allMenus = placeMenus.data?.menus ?? [];
  const matchedMenus = searching ? allMenus.filter((menu) => placeMenuMatches(menu, term)) : allMenus;
  const shownMenus = searching ? matchedMenus : matchedMenus.slice(0, MENUS_BEFORE_SEARCH);
  const chosenMenus = new Set(items.flatMap((it) => (it.menuName ? [it.menuName] : [])));

  // 시트가 떠 있는 동안 뒤 화면 스크롤을 막고 검색칸에 포커스, Esc 로 닫는다 — 문서(외부)와 맞추는 일이라 effect.
  // 줄을 바꾸러 열면 검색칸에 옛 이름이 들어 있다 — 통째로 골라 두어 치면 바로 덮어쓴다(지우고 칠 필요 없이).
  const replacing = mode.kind === 'replace';
  useEffect(() => {
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = 'hidden';
    const input = inputRef.current;
    input?.focus();
    // select() 는 iOS Safari 에서 고르지 못한다 — 범위를 직접 준다.
    if (replacing) input?.setSelectionRange(0, input.value.length);
    return () => {
      root.style.overflow = before;
    };
  }, [replacing]);
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
    if (sheet.pick(quick) === 'replaced') onClose();
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
    // 넣은 개수는 다른 줄과 같은 셈(이름 있는 줄 수) — 세트는 구성요소만큼, 이미 있는 줄에 메뉴만 이으면 그대로다.
    sheet.countChange(() => toggleMenuItem(menu, picks));
  };

  // 친 이름이 메뉴명과 같으면 '그대로 넣기'를 감춘다 — 내 기록·음식 목록과 같은 이름은 훅이 본다.
  const exactKnown =
    sheet.exactKnown ||
    matchedMenus.some((menu) => mealItemNameKey(menu.menuName) === mealItemNameKey(typed));
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
            onChange={(event) => sheet.setQ(event.target.value)}
            onKeyDown={(event) => {
              // 엔터는 친 이름으로 넣는다 — 같은 이름이 내 기록·음식 목록에 있으면 그 줄을 고른 것으로(훅 submitTyped).
              if (event.key === 'Enter' && typed && !event.nativeEvent.isComposing) {
                event.preventDefault();
                if (sheet.submitTyped() === 'replaced') onClose();
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
              onClick={() => sheet.setQ('')}
              aria-label="지우기"
              className="meal-sheet-clear"
            >
              <X className="size-4" aria-hidden />
            </button>
          ) : null}
        </label>
        {mode.kind === 'add' ? (
          <button type="button" className="meal-btn meal-sheet-done" onClick={onClose}>
            {sheet.added > 0 ? `${sheet.added}개 · 완료` : '완료'}
          </button>
        ) : null}
      </div>

      <div className="meal-sheet-body">
        {mode.kind === 'add' && sheet.full ? (
          <p className="meal-sheet-empty">
            한 끼에 음식은 {MEAL_MAX_ITEMS_PER_ENTRY}개까지 넣을 수 있어요.
          </p>
        ) : null}
        {searching ? (
          <>
            {menuGroup}
            {typed && !exactKnown ? (
              <SheetGroup>
                <SheetRow
                  title={`'${typed}' 그대로 넣기`}
                  sub="목록에 없어도 이 이름으로 적어요"
                  on={sheet.isIn(typed)}
                  onClick={() => pick(mealQuickFromTyped(typed))}
                />
              </SheetGroup>
            ) : null}
            {sheet.mineItems.length > 0 ? (
              <SheetGroup title="내 기록">
                {sheet.mineItems.map((m) => (
                  <SheetRow
                    key={`m-${m.name}`}
                    title={m.name}
                    sub={mealQuickSub(m)}
                    kcal={m.kcal ?? null}
                    on={sheet.isIn(m.name)}
                    onClick={() => pick(m)}
                  />
                ))}
              </SheetGroup>
            ) : null}
            {sheet.catalogEnabled ? (
              sheet.catalogCoveredByMine ? null : (
                <SheetGroup title="음식 목록">
                  {sheet.catalogItems.length === 0 ? (
                    <p className="meal-sheet-empty">
                      {sheet.catalogFetching ? '찾는 중…' : '목록에서 찾지 못했어요.'}
                    </p>
                  ) : (
                    sheet.catalogItems.map((f) => (
                      <SheetRow
                        key={f.id}
                        title={f.name}
                        sub={mealCatalogSub(f)}
                        kcal={f.servingKcal}
                        on={sheet.isIn(f.name)}
                        onClick={() => pick(mealQuickFromCatalog(f))}
                      />
                    ))
                  )}
                </SheetGroup>
              )
            ) : (
              <p className="meal-sheet-empty">두 글자부터 음식 목록에서도 찾아요.</p>
            )}
          </>
        ) : (
          <>
            {menuGroup}
            {sheet.frequentItems.length > 0 ? (
              <SheetGroup title={`${MEAL_SLOT_LABEL[slot]}에 자주 먹은 음식`}>
                {sheet.frequentItems.map((m) => (
                  <SheetRow
                    key={`f-${m.name}`}
                    title={m.name}
                    sub={mealQuickSub(m)}
                    kcal={m.kcal ?? null}
                    on={sheet.isIn(m.name)}
                    onClick={() => pick(m)}
                  />
                ))}
              </SheetGroup>
            ) : null}
            <RecentMeals meals={sheet.recentMeals} onAdd={(meal) => sheet.addMeal(meal.entry)} />
          </>
        )}
      </div>
    </div>,
    document.body,
  );
};

// 최근 끼니 통째로 — 같은 차림은 한 번만(가장 최근), 누르면 그 끼니 음식을 모두 넣는다(이미 있는 이름은 건너뛴다).
const RecentMeals = ({
  meals,
  onAdd,
}: {
  meals: MealRecentMealOption[];
  onAdd: (meal: MealRecentMealOption) => void;
}) => {
  if (meals.length === 0) return null;
  return (
    <SheetGroup title="최근 끼니 통째로">
      {meals.map((meal) => (
        <SheetRow
          key={meal.entry.id}
          title={meal.title}
          sub={meal.sub}
          kcal={meal.kcal}
          on={false}
          action="넣기"
          onClick={() => onAdd(meal)}
        />
      ))}
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
