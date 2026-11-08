import { useId, useState } from 'react';
import { Search, X } from 'lucide-react';
import { useFoodSearch, type MealDraftItem } from '@repo/shared';
import { FOOD_DISH_TYPE_LABEL, MEAL_PORTIONS, MEAL_PORTION_LABEL } from '@repo/utils';
import { useDebounced } from '~/lib/useDebounced';

// 식단 항목 한 줄(웹) — 이름(카탈로그 자동완성) + 사진 인식의 다른 후보 + 주식/반찬 + 양 + 인분 + 삭제.
// 앱 MealItemRow 와 같은 규칙이다: 카탈로그 항목을 고르면 foodId·분류를 함께 채워 통계가 바로
// 분류를 얻고, 이름을 손으로 고치면 그 매칭을 푼다. 목록에 없는 이름도 그대로 저장된다.
// "지난번대로"(사진 복제)는 앱에서만 한다.
//
// 휴대폰(onOpenSearch 를 주면)은 이름 입력칸 대신 '음식 찾기' 시트를 여는 단추를 두고(자동완성은 키보드에 가린다),
// 양 단추를 크게, 인분 직접 입력은 뺀다(있으면 표시만).

// 자동완성 검색어 — 입력칸은 바로 바뀌고 요청만 타이핑이 잠잠해진 뒤에 보낸다(키 입력마다 요청하면 "김치찌개"
// 하나에 여섯 번 나갔다). 끝에 붙은 낱자모는 한글 조합 중간 상태("김ㅊ")라 뗀다 — 카탈로그 이름에는 낱자모가
// 없어 맞는 게 없고, 떼면 직전 완성 글자("김")의 결과가 그대로 남는다. 조합 이벤트(isComposing)로 거르지 않는
// 이유: 한글은 마지막 글자가 계속 조합 중이라 다 치고 멈춰도 검색이 나가지 않는다.
const SEARCH_DEBOUNCE_MS = 200;
const TRAILING_JAMO = /[ㄱ-ㆎ]+$/;

export const MealItemInputRow = ({
  item,
  onChange,
  onRemove,
  onOpenSearch,
  autoFocus = false,
}: {
  item: MealDraftItem;
  onChange: (patch: Partial<MealDraftItem>) => void;
  onRemove: () => void;
  /** 휴대폰 — 이름을 시트에서 고른다. */
  onOpenSearch?: () => void;
  autoFocus?: boolean;
}) => {
  const compact = onOpenSearch !== undefined;
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [servingsText, setServingsText] = useState(item.servings == null ? '' : String(item.servings));
  const searchTerm = useDebounced(item.name, SEARCH_DEBOUNCE_MS).replace(TRAILING_JAMO, '').trim();
  // 자동완성은 입력칸이 열린 상태이고 2자 이상일 때만 부른다(요청 절약). 입력을 지우면 디바운스를 기다리지 않고
  // 바로 닫히게 지금 입력 길이도 함께 본다.
  const searchable = searchTerm.length >= 2 && item.name.trim().length >= 2;
  const search = useFoodSearch(searchTerm, { limit: 6, enabled: !compact && open && searchable });
  const suggestions = open && searchable ? (search.data?.items ?? []) : [];
  const lowConfidence = item.confidence !== null && item.confidence < 0.4;
  // 인식이 준 대안 — 첫 후보가 지금 이름과 같으면 다시 보여 주지 않는다(앱과 같이 둘까지).
  const altCandidates = item.candidates.filter((c) => c.name !== item.name).slice(0, 2);

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
    <div className="meal-item space-y-2">
      <div className="relative flex items-center gap-2">
        {compact ? (
          <button
            type="button"
            onClick={onOpenSearch}
            className="meal-item-name"
            aria-label={item.name.trim() ? `${item.name} 바꾸기` : '음식 찾기'}
          >
            {item.name.trim() ? (
              <span className="truncate">{item.name}</span>
            ) : (
              <span className="meal-item-name-empty">
                <Search className="size-4" aria-hidden />
                음식 찾기
              </span>
            )}
          </button>
        ) : (
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
          className="meal-input min-w-0 flex-1"
        />
        )}
        <button
          type="button"
          onClick={onRemove}
          aria-label={`${item.name.trim() || '빈'} 항목 삭제`}
          className="meal-icon-btn"
        >
          <X className="size-4" />
        </button>
        {suggestions.length > 0 ? (
          <ul
            id={listId}
            role="listbox"
            aria-label="음식 목록"
            className="meal-listbox absolute left-0 right-10 top-full z-20 mt-1"
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
                className="meal-option"
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

      {altCandidates.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">다른 후보</span>
          {altCandidates.map((candidate) => (
            <button
              key={candidate.name}
              type="button"
              onClick={() =>
                onChange({
                  name: candidate.name,
                  foodId: null,
                  source: 'recognized',
                  // 품질 집계가 몇 번째 후보를 골랐는지 본다.
                  selectedCandidateRank: item.candidates.findIndex((c) => c.name === candidate.name),
                  catalogMatchedBy: 'none',
                  catalogMatchScore: null,
                })
              }
              className="meal-opt meal-opt-sm meal-opt-dashed"
            >
              {candidate.name}
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5">
        <Chip label="주식" large={compact} selected={item.isMain} onClick={() => onChange({ isMain: true })} />
        <Chip
          label="반찬·곁들임"
          large={compact}
          selected={!item.isMain}
          onClick={() => onChange({ isMain: false })}
        />
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        {MEAL_PORTIONS.map((portion) => (
          <Chip
            key={portion}
            label={MEAL_PORTION_LABEL[portion]}
            large={compact}
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
        {compact ? (
          item.servings != null ? <span className="meal-tag">{item.servings}인분(직접)</span> : null
        ) : (
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
          className="meal-input meal-input-sm w-24"
        />
        )}
        {item.dishType ? (
          <span className="text-xs text-muted-foreground">{FOOD_DISH_TYPE_LABEL[item.dishType]}</span>
        ) : null}
        {lowConfidence ? <span className="text-xs text-destructive">확인 필요</span> : null}
      </div>
    </div>
  );
};

const Chip = ({
  label,
  selected,
  large = false,
  onClick,
}: {
  label: string;
  selected: boolean;
  large?: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    aria-pressed={selected}
    onClick={onClick}
    className={large ? 'meal-opt' : 'meal-opt meal-opt-sm'}
  >
    {label}
  </button>
);
