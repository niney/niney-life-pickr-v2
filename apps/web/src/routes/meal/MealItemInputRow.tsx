import { useId, useState } from 'react';
import { X } from 'lucide-react';
import { useFoodSearch, type MealDraftItem } from '@repo/shared';
import { FOOD_DISH_TYPE_LABEL, MEAL_PORTIONS, MEAL_PORTION_LABEL } from '@repo/utils';
import { cn } from '~/lib/utils';

// 식단 항목 한 줄(웹) — 이름(카탈로그 자동완성) + 주식/반찬 + 양 + 인분 + 삭제.
// 앱 MealItemRow 와 같은 규칙이다: 카탈로그 항목을 고르면 foodId·분류를 함께 채워 통계가 바로
// 분류를 얻고, 이름을 손으로 고치면 그 매칭을 푼다. 목록에 없는 이름도 그대로 저장된다.
// 사진 인식 후보·"지난번대로"(사진 복제)는 앱에서만 한다.

export const MealItemInputRow = ({
  item,
  onChange,
  onRemove,
  autoFocus = false,
}: {
  item: MealDraftItem;
  onChange: (patch: Partial<MealDraftItem>) => void;
  onRemove: () => void;
  autoFocus?: boolean;
}) => {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [servingsText, setServingsText] = useState(item.servings == null ? '' : String(item.servings));
  const searchable = item.name.trim().length >= 2;
  // 자동완성은 입력칸이 열린 상태이고 2자 이상일 때만 부른다(요청 절약).
  const search = useFoodSearch(item.name, { limit: 6, enabled: open && searchable });
  const suggestions = open && searchable ? (search.data?.items ?? []) : [];
  const lowConfidence = item.confidence !== null && item.confidence < 0.4;

  const pick = (food: (typeof suggestions)[number]) => {
    onChange({
      name: food.name,
      foodId: food.id,
      dishType: food.dishType,
      mainIngredient: food.mainIngredient,
      cuisine: food.cuisine,
      source: 'catalog',
      catalogMatchedBy: 'food_id',
      catalogMatchScore: 1,
    });
    setOpen(false);
    setActive(-1);
  };

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="relative flex items-center gap-2">
        <input
          value={item.name}
          onChange={(event) => {
            setOpen(true);
            setActive(-1);
            onChange({
              name: event.target.value,
              foodId: null,
              catalogMatchedBy: 'none',
              catalogMatchScore: null,
              selectedCandidateRank: null,
            });
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setOpen(false);
              return;
            }
            if (suggestions.length === 0) return;
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setActive((i) => (i + 1) % suggestions.length);
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
            } else if (event.key === 'Enter' && suggestions[active]) {
              event.preventDefault();
              pick(suggestions[active]);
            }
          }}
          autoFocus={autoFocus}
          maxLength={60}
          placeholder="음식 이름 (예: 김치찌개)"
          aria-label="음식 이름"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={suggestions.length > 0}
          aria-controls={listId}
          aria-activedescendant={suggestions[active] ? `${listId}-${active}` : undefined}
          className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={onRemove}
          aria-label={`${item.name.trim() || '빈'} 항목 삭제`}
          className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-destructive"
        >
          <X className="size-4" />
        </button>
        {suggestions.length > 0 ? (
          <ul
            id={listId}
            role="listbox"
            aria-label="음식 목록"
            className="absolute left-0 right-10 top-full z-20 mt-1 overflow-hidden rounded-md border bg-background shadow-md"
          >
            {suggestions.map((food, i) => (
              <li
                key={food.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                // 입력칸 blur 가 먼저 목록을 닫아 클릭이 사라지지 않게 포커스를 옮기지 않는다.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pick(food)}
                className={cn(
                  'flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm',
                  i === active ? 'bg-accent' : 'hover:bg-accent',
                )}
              >
                <span className="truncate">{food.name}</span>
                {food.dishType ? (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {FOOD_DISH_TYPE_LABEL[food.dishType]}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Chip label="주식" selected={item.isMain} onClick={() => onChange({ isMain: true })} />
        <Chip label="반찬·곁들임" selected={!item.isMain} onClick={() => onChange({ isMain: false })} />
        <span className="mx-1 h-4 w-px bg-border" aria-hidden />
        {MEAL_PORTIONS.map((portion) => (
          <Chip
            key={portion}
            label={MEAL_PORTION_LABEL[portion]}
            selected={item.portion === portion}
            onClick={() => {
              setServingsText('');
              onChange({
                portion: item.portion === portion ? null : portion,
                servings: null,
                portionSource: item.portion === portion ? null : 'vision_ordinal',
              });
            }}
          />
        ))}
        <input
          value={servingsText}
          onChange={(event) => {
            const value = event.target.value;
            setServingsText(value);
            const parsed = Number(value.replace(',', '.'));
            onChange({
              servings:
                value.trim() && Number.isFinite(parsed) && parsed >= 0.25 && parsed <= 10
                  ? parsed
                  : null,
              portion: value.trim() ? null : item.portion,
              portionSource: value.trim() ? 'user_serving' : item.portion ? 'vision_ordinal' : null,
            });
          }}
          onBlur={() => {
            if (item.servings == null) setServingsText('');
          }}
          inputMode="decimal"
          placeholder="인분 (선택)"
          aria-label="인분 수 직접 입력"
          className="w-24 rounded-md border bg-background px-2 py-1 text-xs"
        />
        {item.dishType ? (
          <span className="text-xs text-muted-foreground">{FOOD_DISH_TYPE_LABEL[item.dishType]}</span>
        ) : null}
        {lowConfidence ? <span className="text-xs text-destructive">확인 필요</span> : null}
      </div>
    </div>
  );
};

const Chip = ({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) => (
  <button
    type="button"
    aria-pressed={selected}
    onClick={onClick}
    className={cn(
      'rounded-full border px-2.5 py-1 text-xs',
      selected ? 'border-primary bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent',
    )}
  >
    {label}
  </button>
);
