import { useEffect, useMemo, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Router, useLocation, type Navigator } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type {
  AnalyticsOverviewType,
  CategoryTreeResultType,
  GlobalMenuResultType,
  GlobalMenuStatType,
  MenuGroupingRestaurantStatusListType,
  MenuGroupingRestaurantStatusType,
  RandomCrawlConfigType,
  ScheduleConfigType,
} from '@repo/api-contract';
import { server } from '~/test/msw';
import { AdminAnalyticsPage } from './AdminAnalyticsPage';

// AI 분석 관리 — 검색 입력(식당 이름·전역 메뉴·카테고리)이 URL 에 디바운스로 올라가는 흐름,
// 카테고리 트리 클릭이 다른 URL 파라미터를 지키는지, 목록을 화면 폭에 맞는 한 벌만 그리는지,
// cron 미리보기가 글자마다 나가지 않는지를 본다. 마운트만으로 섹션 여섯이 요청을 내므로
// (onUnhandledRequest: 'error') 전부 기본 핸들러로 깔고, 테스트는 요청 기록만 읽는다.

const STATUS_URL = '/api/v1/admin/analytics/restaurants';
const OVERVIEW_URL = '/api/v1/admin/analytics/overview';
const TREE_URL = '/api/v1/admin/analytics/category-tree';
const MENUS_URL = '/api/v1/admin/analytics/global-menus';
const SCHEDULE_URL = '/api/v1/admin/schedule';
const SCHEDULE_RUNS_URL = '/api/v1/admin/schedule/runs';
const SCHEDULE_PREVIEW_URL = '/api/v1/admin/schedule/preview';
const RANDOM_URL = '/api/v1/admin/random-crawl';
const RANDOM_RUNS_URL = '/api/v1/admin/random-crawl/runs';
const RANDOM_REGIONS_URL = '/api/v1/admin/random-crawl/regions';
const RANDOM_PREVIEW_URL = '/api/v1/admin/random-crawl/preview';

const AT = '2026-10-01T00:00:00.000Z';
const MENU_PLACEHOLDER = '메뉴 검색 (예: 김치찌개)';

const restaurant = (
  over: Partial<MenuGroupingRestaurantStatusType> = {},
): MenuGroupingRestaurantStatusType => ({
  placeId: 'p1',
  name: '국밥집',
  category: '한식',
  totalReviews: 10,
  analyzedReviews: 8,
  distinctMenus: 5,
  mappedMenus: 5,
  unmappedMenus: 0,
  lastGroupedAt: null,
  storedVersion: 1,
  ...over,
});

const menu = (over: Partial<GlobalMenuStatType> = {}): GlobalMenuStatType => ({
  globalKey: 'g1',
  displayName: '김치찌개',
  categoryPath: '한식 > 찌개',
  totalMentions: 12,
  restaurantCount: 3,
  positive: 9,
  negative: 1,
  neutral: 2,
  positiveRatio: 0.9,
  topRestaurants: [],
  ...over,
});

const scheduleConfig: ScheduleConfigType = {
  jobType: 'normalize-merge',
  enabled: false,
  cronExpr: '0 3 * * *',
  timezone: 'Asia/Seoul',
  lastRunAt: null,
  lastStatus: null,
  nextRunAt: null,
  updatedAt: AT,
};

const randomCrawlConfig: RandomCrawlConfigType = {
  enabled: false,
  cronExpr: '0 12 * * *',
  timezone: 'Asia/Seoul',
  region: {
    sidoRandom: true,
    sido: null,
    sigunguRandom: true,
    sigungu: null,
    dongEnabled: false,
    dongRandom: false,
    dong: null,
  },
  keyword: '맛집',
  candidateCount: 5,
  responseTimeoutMin: 30,
  timeoutAction: 'skip',
  telegramConfigured: true,
  lastRunAt: null,
  lastStatus: null,
  nextRunAt: null,
  updatedAt: AT,
};

const overview: AnalyticsOverviewType = {
  restaurantCount: 1,
  analyzedReviewCount: 8,
  totalMentionCount: 20,
  perRestaurantGroupCount: 5,
  globalLinkedCount: 5,
  globalGroupCount: 3,
  globalLinkedRatio: 1,
  lastGlobalMergeAt: AT,
  globalVersion: 1,
};

const tree: CategoryTreeResultType = {
  currentVersion: 1,
  roots: [
    {
      path: '한식',
      label: '한식',
      totalMentions: 12,
      positive: 9,
      negative: 1,
      positiveRatio: 0.9,
      children: [
        {
          path: '한식 > 찌개',
          label: '찌개',
          totalMentions: 12,
          positive: 9,
          negative: 1,
          positiveRatio: 0.9,
        },
      ],
    },
  ],
};

// 요청 URL·본문을 순서대로 모아 돌려준다.
const useBaseHandlers = ({ menusTotal = 1 }: { menusTotal?: number } = {}) => {
  const statusRequests: string[] = [];
  const menuRequests: string[] = [];
  const schedulePreviews: Array<{ cronExpr: string; timezone: string }> = [];
  const preview = { valid: true, error: null, nextRuns: ['2026-10-06T03:00:00.000Z'] };
  server.use(
    http.get(STATUS_URL, ({ request }) => {
      statusRequests.push(request.url);
      const body: MenuGroupingRestaurantStatusListType = {
        currentVersion: 1,
        items: [restaurant()],
        total: 1,
        totalRestaurants: 1,
        attentionCount: 0,
        page: 1,
        pageSize: 50,
      };
      return HttpResponse.json(body);
    }),
    http.get(OVERVIEW_URL, () => HttpResponse.json(overview)),
    http.get(TREE_URL, () => HttpResponse.json(tree)),
    http.get(MENUS_URL, ({ request }) => {
      menuRequests.push(request.url);
      const body: GlobalMenuResultType = {
        totalGroups: menusTotal,
        linkedRestaurantCount: 1,
        linkedRatio: 1,
        currentVersion: 1,
        items: [menu()],
        total: menusTotal,
        page: Number(new URL(request.url).searchParams.get('page') ?? '1'),
        pageSize: 50,
      };
      return HttpResponse.json(body);
    }),
    http.get(SCHEDULE_URL, () => HttpResponse.json(scheduleConfig)),
    http.get(SCHEDULE_RUNS_URL, () => HttpResponse.json({ items: [], inflightRunId: null })),
    http.post(SCHEDULE_PREVIEW_URL, async ({ request }) => {
      schedulePreviews.push((await request.json()) as { cronExpr: string; timezone: string });
      return HttpResponse.json(preview);
    }),
    http.get(RANDOM_URL, () => HttpResponse.json(randomCrawlConfig)),
    http.get(RANDOM_RUNS_URL, () => HttpResponse.json({ items: [], inflightRunId: null })),
    http.get(RANDOM_REGIONS_URL, () => HttpResponse.json([])),
    http.post(RANDOM_PREVIEW_URL, () => HttpResponse.json(preview)),
  );
  return { statusRequests, menuRequests, schedulePreviews };
};

const newQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });

// 현재 URL 의 쿼리스트링을 화면에 비춘다 — MemoryRouter 안의 위치를 테스트가 읽는 통로.
const LocationProbe = () => {
  const { search } = useLocation();
  return <output data-testid="search">{search}</output>;
};
const currentParams = (): Record<string, string> =>
  Object.fromEntries(new URLSearchParams(screen.getByTestId('search').textContent ?? ''));

const renderPage = (entry = '/admin/analytics') =>
  render(
    <QueryClientProvider client={newQueryClient()}>
      <MemoryRouter initialEntries={[entry]}>
        <AdminAnalyticsPage />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );

const paramsOf = (url: string): URLSearchParams => new URL(url).searchParams;
const enc = encodeURIComponent;

// 위치를 테스트가 직접 쥔 라우터로 페이지를 그린다 — replace 요청을 모아 두었다가(replaced)
// 원하는 때에 반영(apply)해 "올린 값이 늦게 돌아오는" 순간을 만든다. 실제로는 react-router 가
// URL 갱신을 transition 으로 늦추는 사이에 생기는 틈이다.
const renderWithHeldLocation = () => {
  const replaced: string[] = [];
  const control: { apply: (search: string) => void } = { apply: () => {} };
  const Harness = () => {
    const [search, setSearch] = useState('');
    useEffect(() => {
      control.apply = setSearch;
    }, []);
    const navigator = useMemo<Navigator>(() => {
      const record = (to: Parameters<Navigator['replace']>[0]): void => {
        replaced.push(typeof to === 'string' ? to : (to.search ?? ''));
      };
      return {
        createHref: (to) => (typeof to === 'string' ? to : `${to.pathname ?? ''}${to.search ?? ''}`),
        go: () => {},
        push: record,
        replace: record,
      };
    }, []);
    return (
      <Router location={{ pathname: '/admin/analytics', search }} navigator={navigator}>
        <AdminAnalyticsPage />
      </Router>
    );
  };
  render(
    <QueryClientProvider client={newQueryClient()}>
      <Harness />
    </QueryClientProvider>,
  );
  return { replaced, apply: (search: string) => act(() => control.apply(search)) };
};
const qOf = (search: string): string | null => new URLSearchParams(search).get('q');

describe('AdminAnalyticsPage', () => {
  it('전역 메뉴 검색 — 치는 글자는 바로 보이고, 요청은 입력이 멈춘 뒤 한 번만 나간다', async () => {
    const { menuRequests } = useBaseHandlers();
    renderPage();
    await screen.findByText('김치찌개');
    const before = menuRequests.length;

    const input = screen.getByPlaceholderText(MENU_PLACEHOLDER);
    fireEvent.change(input, { target: { value: '된' } });
    fireEvent.change(input, { target: { value: '된장' } });
    fireEvent.change(input, { target: { value: '된장찌개' } });
    // 입력은 URL 을 거치지 않고 곧바로 반영된다(한글 조합이 깨지지 않게).
    expect(input).toHaveValue('된장찌개');
    expect(menuRequests).toHaveLength(before);
    expect(currentParams()).toEqual({});

    await waitFor(() => expect(paramsOf(menuRequests.at(-1)!).get('q')).toBe('된장찌개'));
    // 중간 글자('된', '된장')로는 요청하지 않았다.
    expect(menuRequests.slice(before).map((u) => paramsOf(u).get('q'))).toEqual(['된장찌개']);
    expect(currentParams()).toEqual({ menu: '된장찌개' });
    expect(input).toHaveValue('된장찌개');
  });

  it('딥링크 ?menu= 가 입력의 초기값이 되고 첫 요청에 실린다', async () => {
    const { menuRequests } = useBaseHandlers();
    renderPage(`/admin/analytics?menu=${enc('김치찌개')}`);
    await waitFor(() => expect(menuRequests.length).toBeGreaterThan(0));
    expect(screen.getByPlaceholderText(MENU_PLACEHOLDER)).toHaveValue('김치찌개');
    expect(paramsOf(menuRequests[0]!).get('q')).toBe('김치찌개');
  });

  it('카테고리 트리를 눌러도 다른 URL 파라미터는 남고, 전역 메뉴는 1페이지로 돌아간다', async () => {
    const { menuRequests, statusRequests } = useBaseHandlers({ menusTotal: 120 });
    renderPage(`/admin/analytics?q=${enc('국밥')}&sort=name&menu=${enc('찌개')}`);
    await screen.findByText('김치찌개');
    const lastMenu = () => paramsOf(menuRequests.at(-1)!);

    // 전역 메뉴만 3페이지짜리라 '2' 버튼은 그쪽 페이저 것 하나뿐이다.
    fireEvent.click(screen.getByRole('button', { name: '2' }));
    await waitFor(() => expect(lastMenu().get('page')).toBe('2'));

    fireEvent.click(screen.getByRole('button', { name: '한식' }));
    await waitFor(() => expect(lastMenu().get('category')).toBe('한식'));
    expect(lastMenu().get('page')).toBe('1');
    expect(lastMenu().get('q')).toBe('찌개');
    // 2페이지인 채로 카테고리만 바뀐 요청(빈 결과로 가는 길)은 나가지 않는다.
    expect(
      menuRequests.some((u) => paramsOf(u).get('category') === '한식' && paramsOf(u).get('page') === '2'),
    ).toBe(false);

    // 예전엔 쿼리스트링이 category 하나로 갈려 식당 표의 조건과 메뉴 검색이 날아갔다.
    expect(currentParams()).toEqual({ q: '국밥', sort: 'name', menu: '찌개', category: '한식' });
    expect(paramsOf(statusRequests.at(-1)!).get('q')).toBe('국밥');
    expect(paramsOf(statusRequests.at(-1)!).get('sort')).toBe('name');
    // 카테고리 입력창도 바깥에서 바뀐 값을 따라간다.
    expect(screen.getByPlaceholderText('카테고리 (예: 고기 > 삼겹살)')).toHaveValue('한식');
  });

  it('식당 검색 — URL 로 올린 값이 돌아오는 사이에 더 친 글자를 덮지 않고, 바깥 변화는 따른다', async () => {
    useBaseHandlers();
    const { replaced, apply } = renderWithHeldLocation();
    const input = await screen.findByLabelText('식당 이름 검색');

    fireEvent.change(input, { target: { value: '김치' } });
    await waitFor(() => expect(replaced).toHaveLength(1));
    expect(qOf(replaced[0]!)).toBe('김치');

    // URL 이 아직 반영되기 전에 한 글자를 더 친다 → 그 뒤에 '김치' 가 돌아온다.
    // 예전엔 URL→입력 동기화 effect 가 이때 입력을 '김치' 로 되돌렸다.
    fireEvent.change(input, { target: { value: '김치찌' } });
    apply(replaced[0]!);
    expect(input).toHaveValue('김치찌');

    await waitFor(() => expect(replaced).toHaveLength(2));
    expect(qOf(replaced[1]!)).toBe('김치찌');
    apply(replaced[1]!);
    expect(input).toHaveValue('김치찌');

    // 바깥에서 바뀐 값(사이드바로 초기화·다른 링크)은 입력에 그대로 반영된다.
    apply('');
    expect(input).toHaveValue('');
    apply(`?q=${enc('국밥')}`);
    expect(input).toHaveValue('국밥');
    // 바깥 변화를 다시 URL 로 올리지는 않는다.
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(replaced).toHaveLength(2);
  });

  it('식당 검색 — 먼저 올린 값이 나중 것보다 늦게 돌아와도 바깥 변화로 착각하지 않는다', async () => {
    useBaseHandlers();
    const { replaced, apply } = renderWithHeldLocation();
    const input = await screen.findByLabelText('식당 이름 검색');

    // 두 번 올라갈 때까지 URL 을 하나도 반영하지 않는다.
    fireEvent.change(input, { target: { value: '국' } });
    await waitFor(() => expect(replaced).toHaveLength(1));
    fireEvent.change(input, { target: { value: '국밥' } });
    await waitFor(() => expect(replaced).toHaveLength(2));
    expect(replaced.map(qOf)).toEqual(['국', '국밥']);

    // 옛 값('국')이 이제야 돌아온다 — 입력은 '국밥' 그대로여야 한다.
    apply(replaced[0]!);
    expect(input).toHaveValue('국밥');
    apply(replaced[1]!);
    expect(input).toHaveValue('국밥');
    // 돌아온 값을 다시 올리지도 않는다.
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(replaced).toHaveLength(2);
  });

  it('스케줄 cron 을 손으로 고치면 미리보기는 입력이 멈춘 뒤 한 번만 요청한다', async () => {
    const { schedulePreviews } = useBaseHandlers();
    renderPage();
    // 저장된 프리셋으로 한 번.
    await waitFor(() => expect(schedulePreviews).toHaveLength(1));
    expect(schedulePreviews[0]).toEqual({ cronExpr: '0 3 * * *', timezone: 'Asia/Seoul' });

    // 첫 '커스텀' 버튼이 스케줄 섹션 것(자동 발굴 섹션이 그 아래).
    fireEvent.click(screen.getAllByRole('button', { name: '커스텀' })[0]!);
    const cron = screen.getByPlaceholderText(/^예: 0 3 \* \* \*/);
    fireEvent.change(cron, { target: { value: '0 5' } });
    fireEvent.change(cron, { target: { value: '0 5 * *' } });
    fireEvent.change(cron, { target: { value: '0 5 * * *' } });

    await waitFor(() => expect(schedulePreviews.at(-1)?.cronExpr).toBe('0 5 * * *'));
    expect(schedulePreviews.map((p) => p.cronExpr)).toEqual(['0 3 * * *', '0 5 * * *']);
  });

  it('목록은 한 벌만 그린다 — matchMedia 가 없는 환경은 데스크톱(표)', async () => {
    useBaseHandlers();
    renderPage();
    // 예전엔 모바일 카드와 데스크톱 표를 둘 다 그리고 CSS 로 한쪽을 숨겼다(같은 글자가 두 번).
    expect(await screen.findAllByText('국밥집')).toHaveLength(1);
    expect(await screen.findAllByText('김치찌개')).toHaveLength(1);
    expect(screen.getByRole('columnheader', { name: '마지막 정규화' })).toBeInTheDocument();
    expect(screen.getAllByPlaceholderText(MENU_PLACEHOLDER)).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /^필터/ })).not.toBeInTheDocument();
  });
});

describe('AdminAnalyticsPage (좁은 화면)', () => {
  const originalMatchMedia = window.matchMedia;
  beforeEach(() => {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  });
  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('카드 목록과 접이식 필터만 그린다', async () => {
    useBaseHandlers();
    renderPage();
    expect(await screen.findAllByText('국밥집')).toHaveLength(1);
    expect(await screen.findAllByText('김치찌개')).toHaveLength(1);
    expect(screen.queryByRole('columnheader', { name: '마지막 정규화' })).not.toBeInTheDocument();
    expect(screen.getAllByPlaceholderText(MENU_PLACEHOLDER)).toHaveLength(1);

    // 카테고리 입력은 [필터] 를 펼쳐야 나온다.
    expect(screen.queryByPlaceholderText('카테고리 (예: 고기 > 삼겹살)')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^필터/ }));
    expect(screen.getByPlaceholderText('카테고리 (예: 고기 > 삼겹살)')).toBeInTheDocument();
  });
});
