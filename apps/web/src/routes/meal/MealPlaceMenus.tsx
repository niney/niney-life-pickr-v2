import { useState } from 'react';
import { Check, ChevronDown, Plus } from 'lucide-react';
import { useMealDraftStore, useMealPlaceMenus } from '@repo/shared';
import { MealPlaceMenuChooser } from './MealPlaceMenuChooser';
import { placeMenuKcalLabel, placeMenuMatches, placeMenuSub } from './mealPlaceMenu';

// 식당 메뉴에서 넣기(웹) — 기록에 등록 식당이 정해지면 '먹은 음식' 위에 그 집 메뉴가 뜬다. 누르면 항목이 되고(이름은
// 통계가 묶는 표준명, 그 집 메뉴명·가격은 항목에 따로 남는다) 다시 누르면 빠진다. 같은 음식이 이미 있으면(사진 인식·
// 직접 입력) 새 줄을 만들지 않고 그 줄에 메뉴를 잇는다. 이름만 적은 식당·메뉴가 없는 식당이면 아무것도 그리지 않는다.
//
// 코스·세트는 설명에 적힌 구성으로 풀려 들어간다. 그중 하나를 고르는 것이 있는 메뉴("짜장면 / 짬뽕 택1")는 누르면
// 줄 아래에 고르는 칸이 열리고, 고른 뒤 [넣기]를 눌러야 들어간다.

// 메뉴가 이보다 많으면 찾기 칸을 둔다(식당당 중앙값 13개, 많은 집은 100개가 넘는다).
const FILTER_FROM = 10;

export const MealPlaceMenus = () => {
  const placeId = useMealDraftStore((s) => s.placeId);
  const placeName = useMealDraftStore((s) => s.placeName);
  const items = useMealDraftStore((s) => s.items);
  const toggleMenuItem = useMealDraftStore((s) => s.toggleMenuItem);
  const menus = useMealPlaceMenus(placeId);
  const [filter, setFilter] = useState('');
  // 고르는 칸이 열린 메뉴.
  const [choosing, setChoosing] = useState<string | null>(null);

  if (!placeId) return null;
  if (menus.isLoading) {
    return <p className="pb-1 text-xs text-muted-foreground">{placeName} 메뉴를 불러오는 중…</p>;
  }
  const list = menus.data?.menus ?? [];
  if (list.length === 0) return null;

  const shown = list.filter((menu) => placeMenuMatches(menu, filter));
  const chosen = new Set(items.flatMap((item) => (item.menuName ? [item.menuName] : [])));
  // 구성마다 양이 '조금'으로 들어가는 메뉴(코스)가 있는 집.
  const hasCourse = list.some((menu) => menu.foods.some((food) => food.portion === 'small'));

  return (
    <div className="space-y-1.5 pb-1">
      <div className="flex items-center justify-between gap-2">
        <p className="meal-field-label">
          {menus.data?.placeName ?? placeName} 메뉴 <span className="font-normal">{list.length}개</span>
          {menus.data?.pending ? <span className="font-normal"> · 코스·세트 구성을 읽는 중…</span> : null}
        </p>
        {list.length > FILTER_FROM ? (
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            maxLength={40}
            placeholder="메뉴 찾기"
            aria-label="메뉴 찾기"
            className="meal-input meal-input-sm w-32"
          />
        ) : null}
      </div>
      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">그 말이 든 메뉴가 없어요.</p>
      ) : (
        <ul className="meal-menu-list" aria-label={`${placeName ?? '식당'} 메뉴`}>
          {shown.map((menu) => {
            const kcal = placeMenuKcalLabel(menu);
            const sub = placeMenuSub(menu);
            const on = chosen.has(menu.menuName);
            // 넣기 전에 골라야 하는 메뉴 — 누르면 고르는 칸이 열린다. 이미 넣은 메뉴는 다시 누르면 빠진다.
            const mustChoose = !on && (menu.choices?.length ?? 0) > 0;
            const open = mustChoose && choosing === menu.menuName;
            return (
              <li key={menu.menuName}>
                <button
                  type="button"
                  className="meal-menu-row"
                  aria-pressed={on}
                  aria-expanded={mustChoose ? open : undefined}
                  title={sub || undefined}
                  onClick={() => {
                    if (mustChoose) {
                      setChoosing(open ? null : menu.menuName);
                      return;
                    }
                    toggleMenuItem(menu);
                  }}
                >
                  <span className="min-w-0 flex-1">
                    <span className="meal-menu-name">{menu.menuName}</span>
                    {sub ? <span className="meal-menu-sub">{sub}</span> : null}
                  </span>
                  {kcal !== null ? <span className="meal-menu-kcal">{kcal}</span> : null}
                  <span className="meal-menu-mark" aria-hidden>
                    {on ? (
                      <Check className="size-3.5" />
                    ) : mustChoose ? (
                      <ChevronDown className="size-3.5" />
                    ) : (
                      <Plus className="size-3.5" />
                    )}
                  </span>
                </button>
                {open ? (
                  <MealPlaceMenuChooser
                    menu={menu}
                    onAdd={(picks) => {
                      toggleMenuItem(menu, picks);
                      setChoosing(null);
                    }}
                    onCancel={() => setChoosing(null)}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        누르면 먹은 음식에 들어가요. 열량은 1인분 기준이라, 나눠 먹었으면 양을 맞춰 주세요.
        {hasCourse ? ' 코스는 음식마다 조금씩 먹은 것으로 들어가요.' : ''}
      </p>
    </div>
  );
};
