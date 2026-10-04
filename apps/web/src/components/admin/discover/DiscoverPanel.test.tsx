import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { NaverSearchResultType, RestaurantPublicListItemType } from '@repo/api-contract';
import { DiscoverPanel, type DiscoverTab } from './DiscoverPanel';

// 발견 화면 패널 — 선택한 식당 행을 목록에서 보이게 스크롤하는 시점을 고정한다:
//  ① 목록 배열의 참조만 바뀌면(등록 목록이 요약 SSE 로 패치될 때마다 일어난다) 다시 스크롤하지
//     않는다 — 예전엔 그때마다 스크롤돼, 다른 곳을 보려고 내려 둔 목록이 선택 행으로 되돌아갔다
//  ② 선택이 바뀌거나, 선택 항목이 새로 나타나거나, 목록에서의 자리가 달라지면 스크롤한다
//  ③ 목록이 그려지지 않는 상태(검색 실패 등)였다가 다시 그려지면 그때 스크롤한다

// jsdom 은 scrollIntoView 를 구현하지 않는다 — 호출 대상(행)을 기록하는 스파이로 채운다.
const scrolled: string[] = [];
const original = Element.prototype.scrollIntoView;
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn(function (this: Element) {
    scrolled.push(this.getAttribute('data-place-id') ?? '?');
  });
});
afterAll(() => {
  Element.prototype.scrollIntoView = original;
});
beforeEach(() => {
  scrolled.length = 0;
});

const registered = (
  placeId: string,
  over: Partial<RestaurantPublicListItemType> = {},
): RestaurantPublicListItemType => ({
  placeId,
  name: `등록 ${placeId}`,
  category: '한식',
  address: null,
  roadAddress: null,
  rating: 4.2,
  reviewCount: 10,
  latitude: 37.5,
  longitude: 127.0,
  thumbnailUrl: null,
  firstCrawledAt: '2026-09-01T00:00:00.000Z',
  totalReviews: 10,
  summaryPending: 0,
  summaryRunning: 0,
  summaryDone: 10,
  summaryFailed: 0,
  analyzedCount: 10,
  avgSentimentScore: null,
  avgSatisfactionScore: null,
  positiveCount: 0,
  negativeCount: 0,
  neutralCount: 0,
  tour: null,
  ...over,
});

const found = (placeId: string): NaverSearchResultType => ({
  placeId,
  name: `검색 ${placeId}`,
  category: '한식',
  address: null,
  roadAddress: null,
  lat: 37.5,
  lng: 127.0,
  phone: null,
  thumbnailUrl: null,
  reviewCount: 3,
  distance: null,
  rawSourceUrl: `https://m.place.naver.com/restaurant/${placeId}`,
});

interface ViewProps {
  tab: DiscoverTab;
  q?: string;
  searchItems?: NaverSearchResultType[];
  registeredItems?: RestaurantPublicListItemType[];
  searchError?: boolean;
  selectedPlaceId?: string | null;
}

const noop = () => {};
const NO_CHECKED = new Set<string>();

const renderPanel = (initial: ViewProps) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const ui = (p: ViewProps) => (
    <QueryClientProvider client={qc}>
      <DiscoverPanel
        side="right"
        onToggleSide={noop}
        q={p.q ?? ''}
        onSubmitQuery={noop}
        tab={p.tab}
        onChangeTab={noop}
        searchItems={p.searchItems ?? []}
        registeredItems={p.registeredItems ?? []}
        searchLoading={false}
        searchError={p.searchError ?? false}
        selectedPlaceId={p.selectedPlaceId ?? null}
        hoveredPlaceId={null}
        onSelectItem={noop}
        onHoverItem={noop}
        onZoomItem={noop}
        checkedIds={NO_CHECKED}
        onToggleChecked={noop}
        onStartSelected={noop}
        startInFlight={false}
        activeJobCount={0}
      />
    </QueryClientProvider>
  );
  const view = render(ui(initial));
  return { rerender: (p: ViewProps) => view.rerender(ui(p)) };
};

describe('DiscoverPanel — 선택 행 스크롤', () => {
  it('등록 목록이 패치돼 배열만 새로 바뀌면 다시 스크롤하지 않는다', () => {
    const items = [registered('A'), registered('B'), registered('C')];
    const { rerender } = renderPanel({ tab: 'registered', registeredItems: items, selectedPlaceId: 'B' });
    expect(screen.getByText('등록 B')).toBeInTheDocument();
    expect(scrolled).toEqual(['B']);

    // 요약 SSE 패치 흉내 — 한 가게의 카운트만 바뀐 새 배열(선택 행 자신이 바뀐 경우 포함).
    rerender({
      tab: 'registered',
      registeredItems: [items[0]!, registered('B', { summaryDone: 9, summaryRunning: 1 }), items[2]!],
      selectedPlaceId: 'B',
    });
    // 패치는 화면에 반영된다(진행 배지) — 스크롤만 다시 하지 않는다.
    expect(screen.getByText('1건 진행')).toBeInTheDocument();
    rerender({
      tab: 'registered',
      registeredItems: [registered('A', { summaryPending: 3 }), items[1]!, items[2]!],
      selectedPlaceId: 'B',
    });
    expect(screen.getByText('3건 진행')).toBeInTheDocument();
    expect(scrolled).toEqual(['B']);
  });

  it('선택이 바뀌거나 선택 항목의 자리가 달라지면 스크롤한다', () => {
    const items = [registered('A'), registered('B'), registered('C')];
    const { rerender } = renderPanel({ tab: 'registered', registeredItems: items, selectedPlaceId: 'B' });
    expect(scrolled).toEqual(['B']);

    rerender({ tab: 'registered', registeredItems: items, selectedPlaceId: 'C' });
    expect(scrolled).toEqual(['B', 'C']);

    // 새로 등록된 가게가 맨 위에 끼어들어 선택 행이 한 칸 밀린다.
    rerender({ tab: 'registered', registeredItems: [registered('N'), ...items], selectedPlaceId: 'C' });
    expect(scrolled).toEqual(['B', 'C', 'C']);
  });

  it('선택 항목이 목록에 뒤늦게 나타나면 그때 스크롤한다', () => {
    const { rerender } = renderPanel({
      tab: 'registered',
      registeredItems: [registered('A')],
      selectedPlaceId: 'Z',
    });
    expect(scrolled).toEqual([]);

    rerender({
      tab: 'registered',
      registeredItems: [registered('A'), registered('Z')],
      selectedPlaceId: 'Z',
    });
    expect(scrolled).toEqual(['Z']);
  });

  it('검색 목록이 그려지지 않다가(실패) 다시 그려지면 그때 선택 행으로 스크롤한다', () => {
    const items = [found('S1'), found('S2')];
    const { rerender } = renderPanel({
      tab: 'search',
      q: '한식',
      searchItems: items,
      searchError: true,
      selectedPlaceId: 'S2',
    });
    expect(screen.getByText('검색에 실패했습니다.')).toBeInTheDocument();
    expect(scrolled).toEqual([]);

    // 같은 결과 배열 그대로 — 목록이 다시 그려지는 것만으로 스크롤해야 한다.
    rerender({ tab: 'search', q: '한식', searchItems: items, searchError: false, selectedPlaceId: 'S2' });
    expect(screen.getByText('검색 S2')).toBeInTheDocument();
    expect(scrolled).toEqual(['S2']);
  });
});
