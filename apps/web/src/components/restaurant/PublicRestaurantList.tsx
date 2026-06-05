import { useRef, useState } from 'react';
import { Loader2, PanelLeftOpen, PanelRightOpen, Search, XCircle } from 'lucide-react';
import type {
  RestaurantPublicListItemType,
  RestaurantPublicListQueryType,
} from '@repo/api-contract';
import { Input } from '~/components/ui/input';
import { cn } from '~/lib/utils';
import type { PanelSide } from '~/stores/panelPrefsStore';
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

// ─────────────────────────────────────────────────────────────────────────────
// PublicRestaurantListHeader — 검색·카테고리·총수·정렬·패널토글 묶음.
// sticky positioning 은 부모 wrapper 가 결정 (데스크톱은 list 내부, v2 모바일은
// PublicTopBar 아래 별도 위치).
// ─────────────────────────────────────────────────────────────────────────────

export interface PublicRestaurantListHeaderProps {
  q: string;
  total: number;
  category: string | null;
  sort: SortKey;
  onChangeQ(next: string): void;
  onChangeCategory(next: string | null): void;
  onChangeSort(next: SortKey): void;
  // panelSide 가 주어지면 패널 좌/우 토글 버튼 노출 (xl+ 전용). 모바일 단독
  // 사용처(v2) 에선 생략.
  panelSide?: PanelSide;
  onTogglePanelSide?(): void;
}

export const PublicRestaurantListHeader = ({
  q,
  total,
  category,
  sort,
  onChangeQ,
  onChangeCategory,
  onChangeSort,
  panelSide,
  onTogglePanelSide,
}: PublicRestaurantListHeaderProps) => {
  // 한글 IME 대응 — input 은 로컬 draft 로 즉시 반영하고, composition 중에는
  // 상위 state(URL searchParams) 업데이트를 보류한다. controlled input + onChange
  // 마다 setParam → URL → re-render 가 미완성 한글을 덮어써 "ㅇ으음" 중복 입력이
  // 발생하는 문제 회피. compositionEnd 시 최종 조합을 한 번에 sync.
  const composingRef = useRef(false);
  const [draft, setDraft] = useState(q);

  return (
    <div className="space-y-2.5 p-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="식당명, 카테고리, 메뉴로 검색"
            className="pl-9 pr-9"
            value={draft}
            onChange={(e) => {
              const next = e.target.value;
              setDraft(next);
              if (!composingRef.current) onChangeQ(next);
            }}
            onCompositionStart={() => {
              composingRef.current = true;
            }}
            onCompositionEnd={(e) => {
              composingRef.current = false;
              const next = e.currentTarget.value;
              setDraft(next);
              onChangeQ(next);
            }}
          />
          {draft && (
            <button
              type="button"
              onClick={() => {
                setDraft('');
                onChangeQ('');
              }}
              aria-label="검색어 지우기"
              className="absolute right-2.5 top-1/2 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-accent"
            >
              <XCircle className="size-4" />
            </button>
          )}
        </div>
        {panelSide && onTogglePanelSide && (
          <button
            type="button"
            onClick={onTogglePanelSide}
            aria-label={`패널을 ${panelSide === 'right' ? '왼쪽' : '오른쪽'}으로`}
            title={`패널을 ${panelSide === 'right' ? '왼쪽' : '오른쪽'}으로`}
            className="hidden size-9 shrink-0 items-center justify-center rounded-md border text-muted-foreground hover:bg-accent xl:inline-flex"
          >
            {panelSide === 'right' ? (
              <PanelLeftOpen className="size-4" />
            ) : (
              <PanelRightOpen className="size-4" />
            )}
          </button>
        )}
      </div>

      {/* 모바일: 가로 한 줄 + 좌우 스와이프 스크롤. md+ 부터는 wrap 으로 줄바꿈.
          -mx-3/px-3 으로 헤더 padding 영역까지 풀-블리드 스크롤 영역 확보. */}
      <div className="-mx-3 flex gap-1.5 overflow-x-auto whitespace-nowrap px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
        {CATEGORY_CHIPS.map((c) => {
          const active = category === c;
          return (
            <button
              key={c}
              type="button"
              onClick={() => onChangeCategory(active ? null : c)}
              className={cn(
                'shrink-0 rounded-full border px-2.5 py-1 text-xs transition-colors',
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
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// PublicRestaurantListBody — 카드 ul + loading/error/empty 상태.
// 헤더와 분리되어 있어 v2 모바일은 시트 안에 본체만 넣을 수 있다.
// ─────────────────────────────────────────────────────────────────────────────

export interface PublicRestaurantListBodyProps {
  items: RestaurantPublicListItemType[];
  isLoading: boolean;
  isError: boolean;
  selectedPlaceId: string | null;
  onSelectItem(placeId: string): void;
  onZoomItem(placeId: string): void;
}

export const PublicRestaurantListBody = ({
  items,
  isLoading,
  isError,
  selectedPlaceId,
  onSelectItem,
  onZoomItem,
}: PublicRestaurantListBodyProps) => {
  if (isLoading && items.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" /> 불러오는 중…
      </div>
    );
  }
  if (isError) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-destructive">
        결과를 불러오지 못했습니다.
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
        조건에 맞는 식당이 없습니다.
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-2" data-testid="public-restaurant-list">
      {items.map((item) => (
        <li key={item.placeId}>
          {/* 인라인 클로저 없이 안정 콜백을 그대로 전달 — 카드 memo 가 동작하도록.
              placeId 바인딩은 카드 내부에서 item.placeId 로 처리. */}
          <PublicRestaurantCard
            item={item}
            selected={item.placeId === selectedPlaceId}
            onSelect={onSelectItem}
            onZoom={onZoomItem}
          />
        </li>
      ))}
    </ul>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// PublicRestaurantList — 기존 데스크톱 사용처용 컴포지션. 내부에서 sticky
// 래퍼 + 헤더 + 본체 결합. 인터페이스는 기존 그대로라 호출처 변경 불필요.
// ─────────────────────────────────────────────────────────────────────────────

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
  onZoomItem(placeId: string): void;
  panelSide: PanelSide;
  onTogglePanelSide(): void;
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
  onZoomItem,
  panelSide,
  onTogglePanelSide,
}: Props) => {
  return (
    <div className="flex flex-col">
      {/* 검색/필터 헤더 sticky.
          xl 미만: body 스크롤 기준, PublicTopBar(56px) 아래에 붙음.
          xl+: 부모 aside 가 스크롤 컨테이너이므로 그 안에서 top-0. */}
      <div className="sticky top-14 z-10 border-b bg-background xl:top-0">
        <PublicRestaurantListHeader
          q={q}
          total={total}
          category={category}
          sort={sort}
          onChangeQ={onChangeQ}
          onChangeCategory={onChangeCategory}
          onChangeSort={onChangeSort}
          panelSide={panelSide}
          onTogglePanelSide={onTogglePanelSide}
        />
      </div>

      <div className="p-3">
        <PublicRestaurantListBody
          items={items}
          isLoading={isLoading}
          isError={isError}
          selectedPlaceId={selectedPlaceId}
          onSelectItem={onSelectItem}
          onZoomItem={onZoomItem}
        />
      </div>
    </div>
  );
};
