import { useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { useMealDraftStore, useMealPlaceMenus } from '@repo/shared';
import { placeMenuKcal, placeMenuMatches, placeMenuSub } from './mealPlaceMenu';

// 식당 메뉴에서 넣기(웹) — 기록에 등록 식당이 정해지면 '먹은 음식' 위에 그 집 메뉴가 뜬다. 누르면 항목이 되고(이름은
// 통계가 묶는 표준명, 그 집 메뉴명·가격은 항목에 따로 남는다) 다시 누르면 빠진다. 같은 음식이 이미 있으면(사진 인식·
// 직접 입력) 새 줄을 만들지 않고 그 줄에 메뉴를 잇는다. 이름만 적은 식당·메뉴가 없는 식당이면 아무것도 그리지 않는다.

// 메뉴가 이보다 많으면 찾기 칸을 둔다(식당당 중앙값 13개, 많은 집은 100개가 넘는다).
const FILTER_FROM = 10;

const fmt = (n: number): string => Math.round(n).toLocaleString('ko-KR');

export const MealPlaceMenus = () => {
  const placeId = useMealDraftStore((s) => s.placeId);
  const placeName = useMealDraftStore((s) => s.placeName);
  const items = useMealDraftStore((s) => s.items);
  const toggleMenuItem = useMealDraftStore((s) => s.toggleMenuItem);
  const menus = useMealPlaceMenus(placeId);
  const [filter, setFilter] = useState('');

  if (!placeId) return null;
  if (menus.isLoading) {
    return <p className="pb-1 text-xs text-muted-foreground">{placeName} 메뉴를 불러오는 중…</p>;
  }
  const list = menus.data?.menus ?? [];
  if (list.length === 0) return null;

  const shown = list.filter((menu) => placeMenuMatches(menu, filter));
  const chosen = new Set(items.flatMap((item) => (item.menuName ? [item.menuName] : [])));

  return (
    <div className="space-y-1.5 pb-1">
      <div className="flex items-center justify-between gap-2">
        <p className="meal-field-label">
          {menus.data?.placeName ?? placeName} 메뉴 <span className="font-normal">{list.length}개</span>
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
            const kcal = placeMenuKcal(menu);
            const sub = placeMenuSub(menu);
            const on = chosen.has(menu.menuName);
            return (
              <li key={menu.menuName}>
                <button
                  type="button"
                  className="meal-menu-row"
                  aria-pressed={on}
                  onClick={() => toggleMenuItem(menu)}
                >
                  <span className="min-w-0 flex-1">
                    <span className="meal-menu-name">{menu.menuName}</span>
                    {sub ? <span className="meal-menu-sub">{sub}</span> : null}
                  </span>
                  {kcal !== null ? <span className="meal-menu-kcal">{fmt(kcal)}kcal</span> : null}
                  <span className="meal-menu-mark" aria-hidden>
                    {on ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        누르면 먹은 음식에 들어가요. 열량은 1인분 기준이라, 나눠 먹었으면 양을 맞춰 주세요.
      </p>
    </div>
  );
};
