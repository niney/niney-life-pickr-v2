import { Loader2, Search, XCircle } from 'lucide-react';
import type {
  RestaurantPublicListItemType,
  RestaurantPublicListQueryType,
} from '@repo/api-contract';
import { Input } from '~/components/ui/input';
import { cn } from '~/lib/utils';
import { PublicRestaurantCard } from './PublicRestaurantCard';

type SortKey = NonNullable<RestaurantPublicListQueryType['sort']>;

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'recent', label: '최신 등록순' },
  { value: 'satisfaction', label: '만족도순' },
  { value: 'positive', label: '긍정 점수순' },
  { value: 'rating', label: '별점순' },
];

// 정적 카테고리 칩. 백엔드는 category contains 매칭이라 정확한 일치까진 강요
// 안 함 — 한식/일식 같은 일반 단어가 식당 카테고리 텍스트에 포함되면 잡힌다.
const CATEGORY_CHIPS = [
  '한식',
  '일식',
  '중식',
  '카페',
  '디저트',
  '술집',
  '양식',
  '분식',
];

interface Props {
  items: RestaurantPublicListItemType[];
  total: number;
  isLoading: boolean;
  isError: boolean;
  q: string;
  category: string | null;
  sort: SortKey;
  selectedPlaceId: string | null;
  onChangeQ(next: string): void;
  onChangeCategory(next: string | null): void;
  onChangeSort(next: SortKey): void;
  onSelectItem(placeId: string): void;
  onHoverItem(placeId: string | null): void;
}

export const PublicRestaurantList = ({
  items,
  total,
  isLoading,
  isError,
  q,
  category,
  sort,
  selectedPlaceId,
  onChangeQ,
  onChangeCategory,
  onChangeSort,
  onSelectItem,
  onHoverItem,
}: Props) => {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b p-3 space-y-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="식당명, 카테고리, 메뉴로 검색"
            className="pl-9 pr-9"
            value={q}
            onChange={(e) => onChangeQ(e.target.value)}
          />
          {q && (
            <button
              type="button"
              onClick={() => onChangeQ('')}
              aria-label="검색어 지우기"
              className="absolute right-2.5 top-1/2 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-accent"
            >
              <XCircle className="size-4" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {CATEGORY_CHIPS.map((c) => {
            const active = category === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => onChangeCategory(active ? null : c)}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-xs transition-colors',
                  active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground',
                )}
              >
                {c}
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="tabular-nums">총 {total}곳</span>
          <label className="inline-flex items-center gap-1.5">
            정렬
            <select
              value={sort}
              onChange={(e) => onChangeSort(e.target.value as SortKey)}
              className="h-7 rounded border bg-background px-1.5 text-xs"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {isLoading && items.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" /> 불러오는 중…
          </div>
        ) : isError ? (
          <div className="flex h-32 items-center justify-center text-sm text-destructive">
            결과를 불러오지 못했습니다.
          </div>
        ) : items.length === 0 ? (
          <div className="flex h-32 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
            조건에 맞는 식당이 없습니다.
          </div>
        ) : (
          <ul className="flex flex-col gap-2" data-testid="public-restaurant-list">
            {items.map((item) => (
              <li key={item.placeId}>
                <PublicRestaurantCard
                  item={item}
                  selected={item.placeId === selectedPlaceId}
                  onClick={() => onSelectItem(item.placeId)}
                  onMouseEnter={() => onHoverItem(item.placeId)}
                  onMouseLeave={() => onHoverItem(null)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
