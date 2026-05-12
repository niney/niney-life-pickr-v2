import { useEffect, useRef, useState } from 'react';
import {
  Loader2,
  PanelLeftOpen,
  PanelRightOpen,
  Play,
  Search,
  XCircle,
} from 'lucide-react';
import type {
  NaverSearchResultType,
  RestaurantPublicListItemType,
} from '@repo/api-contract';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { cn } from '~/lib/utils';
import type { PanelSide } from '~/stores/panelPrefsStore';

export type DiscoverTab = 'search' | 'registered';

// 빠른 카테고리 입력 도우미. 클릭 시 검색바에 텍스트 채움 + 즉시 검색.
// nx-api 의 좌표 기반 영역 한정은 검색어가 일반어/카테고리일 때만 동작 —
// 영역명("강남구") 박으면 좌표 무시되므로, 사용자가 영역명 박지 않도록
// 카테고리 칩을 노출해 가이드한다.
const CATEGORY_CHIPS = [
  '맛집',
  '카페',
  '한식',
  '중식',
  '일식',
  '양식',
  '분식',
  '술집',
  '베이커리',
  '디저트',
  '치킨',
];

interface Props {
  side: PanelSide;
  onToggleSide(): void;

  q: string;                           // URL 의 q (=디바운스된 값)
  onSubmitQuery(next: string): void;   // 디바운스 만료 / Enter 시 호출

  tab: DiscoverTab;
  onChangeTab(next: DiscoverTab): void;

  searchItems: NaverSearchResultType[];
  registeredItems: RestaurantPublicListItemType[];
  searchLoading: boolean;
  searchError: boolean;

  selectedPlaceId: string | null;
  hoveredPlaceId: string | null;
  onSelectItem(placeId: string): void;
  onHoverItem(placeId: string | null): void;

  // 다중 선택 (검색 탭 한정). 등록 탭은 체크박스 비표시.
  checkedIds: Set<string>;
  onToggleChecked(placeId: string, on: boolean): void;
  onStartSelected(): void;
  startInFlight: boolean;

  // 전역 진행 중 잡 수 — 표시용. 페이지 외부 잡도 포함될 수 있다.
  activeJobCount: number;
}

// 디바운스 + Enter 즉시 — input 값은 로컬 state, URL/검색 호출은 자식이 트리거.
// useEffect 는 외부 system(타이머/URL) 동기화 케이스 한정.
const DEBOUNCE_MS = 300;

export const DiscoverPanel = ({
  side,
  onToggleSide,
  q,
  onSubmitQuery,
  tab,
  onChangeTab,
  searchItems,
  registeredItems,
  searchLoading,
  searchError,
  selectedPlaceId,
  hoveredPlaceId,
  onSelectItem,
  onHoverItem,
  checkedIds,
  onToggleChecked,
  onStartSelected,
  startInFlight,
  activeJobCount,
}: Props) => {
  const [qInput, setQInput] = useState(q);
  const debounceRef = useRef<number | null>(null);

  // URL의 q 가 외부에서 바뀌면 (예: 다른 페이지에서 진입) input도 따라간다.
  // 디바운스 발사 직후의 동일 값은 setQInput을 다시 호출해도 React가 무시.
  useEffect(() => {
    setQInput(q);
  }, [q]);

  // unmount 시 디바운스 취소
  useEffect(
    () => () => {
      if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    },
    [],
  );

  const fireDebounced = (value: string): void => {
    if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      onSubmitQuery(value);
    }, DEBOUNCE_MS);
  };

  const fireImmediate = (value: string): void => {
    if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    onSubmitQuery(value);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b p-3 space-y-2.5">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="맛집, 카페, 한식 등 카테고리"
              className="pl-9 pr-9"
              value={qInput}
              onChange={(e) => {
                const next = e.target.value;
                setQInput(next);
                fireDebounced(next);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  fireImmediate(qInput);
                }
              }}
            />
            {qInput && (
              <button
                type="button"
                onClick={() => {
                  setQInput('');
                  fireImmediate('');
                }}
                aria-label="검색어 지우기"
                className="absolute right-2.5 top-1/2 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-accent"
              >
                <XCircle className="size-4" />
              </button>
            )}
          </div>
          {/* 좌/우 토글. xl 미만에서는 패널이 풀블리드라 의미 없으므로 숨김 */}
          <button
            type="button"
            onClick={onToggleSide}
            aria-label={`패널을 ${side === 'right' ? '왼쪽' : '오른쪽'}으로`}
            title={`패널을 ${side === 'right' ? '왼쪽' : '오른쪽'}으로`}
            className="hidden size-9 shrink-0 items-center justify-center rounded-md border text-muted-foreground hover:bg-accent xl:inline-flex"
          >
            {side === 'right' ? (
              <PanelLeftOpen className="size-4" />
            ) : (
              <PanelRightOpen className="size-4" />
            )}
          </button>
        </div>

        {/* 카테고리 칩 — 빠른 카테고리 검색 + 영역명 박지 말라는 가이드 */}
        <div className="flex flex-wrap gap-1">
          {CATEGORY_CHIPS.map((c) => {
            const active = qInput.trim() === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => {
                  setQInput(c);
                  fireImmediate(c);
                }}
                className={cn(
                  'rounded-full border px-2 py-0.5 text-[11px] transition-colors',
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

        <div className="flex gap-1.5 text-xs">
          <TabButton
            active={tab === 'search'}
            onClick={() => onChangeTab('search')}
            label="검색 결과"
            count={searchItems.length}
            loading={searchLoading}
          />
          <TabButton
            active={tab === 'registered'}
            onClick={() => onChangeTab('registered')}
            label="등록된 맛집"
            count={registeredItems.length}
          />
        </div>
      </div>

      {activeJobCount > 0 && (
        <div className="border-b bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          현재 {activeJobCount}개 작업 진행 중
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {tab === 'search' ? (
          <SearchResultList
            items={searchItems}
            registeredPlaceIds={new Set(registeredItems.map((it) => it.placeId))}
            loading={searchLoading}
            error={searchError}
            empty={q.trim().length === 0}
            selectedPlaceId={selectedPlaceId}
            hoveredPlaceId={hoveredPlaceId}
            onSelect={onSelectItem}
            onHover={onHoverItem}
            checkedIds={checkedIds}
            onToggleChecked={onToggleChecked}
          />
        ) : (
          <RegisteredList
            items={registeredItems}
            selectedPlaceId={selectedPlaceId}
            hoveredPlaceId={hoveredPlaceId}
            onSelect={onSelectItem}
            onHover={onHoverItem}
          />
        )}
      </div>

      {/* sticky 일괄 크롤링 바 — 검색 탭에서만, 선택 항목이 있을 때 노출 */}
      {tab === 'search' && checkedIds.size > 0 && (
        <div className="border-t bg-background p-3">
          <Button
            type="button"
            className="w-full gap-2"
            onClick={onStartSelected}
            disabled={startInFlight}
          >
            {startInFlight ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Play className="size-4" />
            )}
            {checkedIds.size}개 크롤링 시작
          </Button>
        </div>
      )}
    </div>
  );
};

const TabButton = ({
  active,
  onClick,
  label,
  count,
  loading,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  loading?: boolean;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      'flex flex-1 items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 transition-colors',
      active
        ? 'border-primary bg-primary text-primary-foreground'
        : 'border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground',
    )}
  >
    <span>{label}</span>
    {loading ? (
      <Loader2 className="size-3 animate-spin" />
    ) : (
      <span className="tabular-nums">{count}</span>
    )}
  </button>
);

const SearchResultList = ({
  items,
  registeredPlaceIds,
  loading,
  error,
  empty,
  selectedPlaceId,
  hoveredPlaceId,
  onSelect,
  onHover,
  checkedIds,
  onToggleChecked,
}: {
  items: NaverSearchResultType[];
  registeredPlaceIds: Set<string>;
  loading: boolean;
  error: boolean;
  empty: boolean;
  selectedPlaceId: string | null;
  hoveredPlaceId: string | null;
  onSelect(placeId: string): void;
  onHover(placeId: string | null): void;
  checkedIds: Set<string>;
  onToggleChecked(placeId: string, on: boolean): void;
}) => {
  // hook 호출은 모든 early return 위에 — react rules-of-hooks.
  const ulRef = useScrollSelectedIntoView(selectedPlaceId, items);
  if (empty) {
    return (
      <div className="flex h-32 items-center justify-center px-4 text-center text-sm text-muted-foreground">
        검색어를 입력하세요. 결과가 지도와 함께 표시됩니다.
      </div>
    );
  }
  if (loading && items.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" /> 검색 중…
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-destructive">
        검색에 실패했습니다.
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center px-4 text-center text-sm text-muted-foreground">
        검색 결과가 없습니다.
      </div>
    );
  }
  return (
    <ul ref={ulRef} className="divide-y">
      {items.map((it) => {
        const registered = registeredPlaceIds.has(it.placeId);
        const checked = checkedIds.has(it.placeId);
        return (
          <li
            key={it.placeId}
            data-place-id={it.placeId}
            onMouseEnter={() => onHover(it.placeId)}
            onMouseLeave={() => onHover(null)}
            onClick={() => onSelect(it.placeId)}
            className={cn(
              'flex cursor-pointer items-start gap-2.5 px-3 py-2.5 text-sm transition-colors',
              hoveredPlaceId === it.placeId && 'bg-muted/40',
              selectedPlaceId === it.placeId && 'bg-primary/10',
            )}
          >
            <input
              type="checkbox"
              checked={checked}
              disabled={registered}
              onChange={(e) => onToggleChecked(it.placeId, e.target.checked)}
              onClick={(e) => e.stopPropagation()}
              aria-label={registered ? '이미 등록됨' : `${it.name} 선택`}
              className="mt-1 size-4 shrink-0 cursor-pointer disabled:cursor-not-allowed"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="truncate font-medium">{it.name}</span>
                {registered && (
                  <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground">
                    등록됨
                  </span>
                )}
              </div>
              <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                {it.category && <span>{it.category}</span>}
                {it.distance && <span>{it.distance}</span>}
                {it.roadAddress && <span className="truncate">{it.roadAddress}</span>}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
};

const RegisteredList = ({
  items,
  selectedPlaceId,
  hoveredPlaceId,
  onSelect,
  onHover,
}: {
  items: RestaurantPublicListItemType[];
  selectedPlaceId: string | null;
  hoveredPlaceId: string | null;
  onSelect(placeId: string): void;
  onHover(placeId: string | null): void;
}) => {
  const ulRef = useScrollSelectedIntoView(selectedPlaceId, items);
  if (items.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center px-4 text-center text-sm text-muted-foreground">
        아직 등록된 맛집이 없습니다.
      </div>
    );
  }
  return (
    <ul ref={ulRef} className="divide-y">
      {items.map((it) => {
        const inFlight = it.summaryPending + it.summaryRunning;
        return (
          <li
            key={it.placeId}
            data-place-id={it.placeId}
            onMouseEnter={() => onHover(it.placeId)}
            onMouseLeave={() => onHover(null)}
            onClick={() => onSelect(it.placeId)}
            className={cn(
              'cursor-pointer px-3 py-2.5 text-sm transition-colors',
              hoveredPlaceId === it.placeId && 'bg-muted/40',
              selectedPlaceId === it.placeId && 'bg-primary/10',
            )}
          >
            <div className="flex items-baseline gap-2">
              <span className="truncate font-medium">{it.name}</span>
              {it.category && (
                <span className="shrink-0 text-xs text-muted-foreground">{it.category}</span>
              )}
            </div>
            {/* 어드민 맛집 페이지와 동일한 배지 셋 — SSE 로 진행도 라이브 갱신.
                좁은 패널 폭에 맞춰 wrap 허용, 텍스트 크기는 admin row 와 동일. */}
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              {it.rating !== null && <Badge variant="secondary">★ {it.rating}</Badge>}
              <Badge variant="outline">리뷰 {it.totalReviews}개</Badge>
              <Badge variant="outline">
                요약 {it.summaryDone}/{it.totalReviews}
              </Badge>
              {inFlight > 0 && (
                <Badge variant="secondary" className="inline-flex items-center gap-1">
                  <Loader2 className="size-3 animate-spin" /> {inFlight}건 진행
                </Badge>
              )}
              {it.summaryFailed > 0 && (
                <Badge variant="destructive">실패 {it.summaryFailed}</Badge>
              )}
              {it.avgSatisfactionScore !== null && (
                <Badge variant="outline">😊 {it.avgSatisfactionScore.toFixed(1)}/5</Badge>
              )}
              {it.positiveCount + it.negativeCount + it.neutralCount > 0 && (
                <span className="text-[11px]">
                  <span className="text-emerald-600 dark:text-emerald-400">
                    +{it.positiveCount}
                  </span>
                  <span className="mx-1 text-muted-foreground">/</span>
                  <span className="text-rose-600 dark:text-rose-400">
                    -{it.negativeCount}
                  </span>
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
};

// 외부 시스템(DOM 스크롤) 동기화 — 지도 마커 클릭 등으로 selectedPlaceId 가
// 화면 밖 항목을 가리키면 자동으로 보이게 한다. items 도 deps 에 넣어서 막
// 도착한 새 데이터에 selectedPlaceId 항목이 들어오는 케이스(검색 후 즉시
// 강조)도 커버. block:'nearest' 라 이미 보이면 no-op.
const useScrollSelectedIntoView = <T,>(
  selectedId: string | null,
  items: T[],
) => {
  const ulRef = useRef<HTMLUListElement | null>(null);
  useEffect(() => {
    if (!selectedId) return;
    const el = ulRef.current?.querySelector<HTMLElement>(
      `[data-place-id="${CSS.escape(selectedId)}"]`,
    );
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedId, items]);
  return ulRef;
};
