import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type { CanonicalListItemType, RestaurantSourceSummaryType } from '@repo/api-contract';
import { useActiveCrawlJobStore } from '@repo/shared';
import { server } from '~/test/msw';
import { AdminRestaurantsPage } from './AdminRestaurantsPage';

// 어드민 맛집 목록 — 입력 폼을 자식으로 분리하고 행을 memo 로 바꾼 뒤에도 동작이 그대로인지 본다:
//  ① 검색어는 입력 중에는 요청하지 않고 제출할 때만 q 로 요청한다(초기화 포함)
//  ② 가게 추가 — 형식이 아닌 URL 은 에러, 올바른 URL 은 크롤을 시작하고 입력을 비운다
//  ③ 행 삭제는 확인 단계를 거친다(행 콜백을 id 인자형으로 바꾼 경로)
//  ④ 병합 버튼은 그 행의 병합 패널을 열고 닫는다

// jsdom 엔 EventSource 가 없다 — 요약 SSE 매니저와 크롤 잡 스트림이 여는 연결을 받아만 둔다.
class FakeEventSource {
  static CLOSED = 2;
  readyState = 1;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) {}
  addEventListener() {}
  close() {
    this.readyState = FakeEventSource.CLOSED;
  }
}

beforeAll(() => vi.stubGlobal('EventSource', FakeEventSource));
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {
  useActiveCrawlJobStore.setState({ jobs: {} });
});

const AT = '2026-09-01T00:00:00.000Z';

const source = (over: Partial<RestaurantSourceSummaryType> = {}): RestaurantSourceSummaryType => ({
  restaurantId: 'R1',
  source: 'naver',
  sourceId: 'P1',
  placeId: 'P1',
  name: '통합집',
  category: '한식',
  rating: 4.2,
  reviewCount: 120,
  rawSourceUrl: 'https://m.place.naver.com/restaurant/P1',
  firstCrawledAt: AT,
  lastCrawledAt: AT,
  totalReviews: 10,
  summaryPending: 0,
  summaryRunning: 0,
  summaryDone: 10,
  summaryFailed: 0,
  avgSentimentScore: null,
  avgSatisfactionScore: null,
  positiveCount: 0,
  negativeCount: 0,
  neutralCount: 0,
  mixedCount: 0,
  ...over,
});

const item = (over: Partial<CanonicalListItemType> = {}): CanonicalListItemType => ({
  canonicalId: 'C1',
  name: '통합집',
  primaryCategory: '한식',
  latitude: null,
  longitude: null,
  lastCrawledAt: AT,
  sources: [source()],
  totalReviews: 10,
  summaryPending: 0,
  summaryRunning: 0,
  summaryDone: 10,
  summaryFailed: 0,
  avgSentimentScore: null,
  avgSatisfactionScore: null,
  positiveCount: 0,
  negativeCount: 0,
  neutralCount: 0,
  mixedCount: 0,
  candidateCount: 0,
  suggestion: null,
  ...over,
});

const ITEMS = [
  item(),
  item({
    canonicalId: 'C2',
    name: '둘째집',
    sources: [source({ restaurantId: 'R2', sourceId: 'P2', placeId: 'P2', name: '둘째집' })],
  }),
];

const seen = {
  list: [] as string[],
  deleted: [] as string[],
  started: [] as Array<{ url: string; mode: string }>,
};

const useHandlers = () => {
  seen.list = [];
  seen.deleted = [];
  seen.started = [];
  server.use(
    http.get('/api/v1/admin/restaurants', ({ request }) => {
      const q = new URL(request.url).searchParams.get('q');
      seen.list.push(q ?? '');
      const items = q ? ITEMS.filter((it) => it.name.includes(q)) : ITEMS;
      return HttpResponse.json({ items, total: items.length, limit: 25, offset: 0 });
    }),
    http.get('/api/v1/admin/canonical/proposals', () => HttpResponse.json({ items: [] })),
    http.get('/api/v1/admin/canonical/:id/candidates', () => HttpResponse.json({ candidates: [] })),
    http.delete('/api/v1/admin/canonical/:id', ({ params }) => {
      seen.deleted.push(String(params['id']));
      return HttpResponse.json({ ok: true });
    }),
    http.post('/api/v1/admin/crawl/naver-place', async ({ request }) => {
      seen.started.push((await request.json()) as { url: string; mode: string });
      return HttpResponse.json({ ok: true, jobId: 'job-1' });
    }),
    http.get('/api/v1/admin/crawl/jobs', () => HttpResponse.json({ jobs: [] })),
  );
};

const renderPage = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}
    >
      <MemoryRouter initialEntries={['/admin/restaurants']}>
        <Routes>
          <Route path="/admin/restaurants" element={<AdminRestaurantsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

// 가게 이름으로 그 행(role=link 컨테이너)을 찾는다.
const rowOf = (name: string): HTMLElement => {
  const row = screen.getByText(name).closest('[role="link"]');
  if (!(row instanceof HTMLElement)) throw new Error(`row not found: ${name}`);
  return row;
};

describe('AdminRestaurantsPage', () => {
  it('검색어는 입력 중에는 요청하지 않고, 제출·초기화할 때만 목록을 다시 받는다', async () => {
    useHandlers();
    renderPage();
    expect(await screen.findByText('통합집')).toBeInTheDocument();
    expect(screen.getByText('둘째집')).toBeInTheDocument();
    expect(seen.list).toEqual(['']);

    const input = screen.getByLabelText('등록된 맛집 검색');
    fireEvent.change(input, { target: { value: '둘' } });
    fireEvent.change(input, { target: { value: '둘째' } });
    expect(input).toHaveValue('둘째');
    expect(seen.list).toEqual(['']);

    fireEvent.click(screen.getByRole('button', { name: '검색' }));
    await waitFor(() => expect(seen.list).toEqual(['', '둘째']));
    await waitFor(() => expect(screen.queryByText('통합집')).toBeNull());
    expect(screen.getByText('둘째집')).toBeInTheDocument();
    expect(screen.getByText(/검색 결과 1개/)).toBeInTheDocument();

    // 입력칸의 X — 초안과 URL 의 q 를 함께 비운다.
    fireEvent.click(screen.getByRole('button', { name: '검색 초기화' }));
    expect(input).toHaveValue('');
    expect(await screen.findByText('통합집')).toBeInTheDocument();
  });

  it('결과가 없을 때의 "검색 초기화" 는 입력 초안까지 비운다', async () => {
    useHandlers();
    renderPage();
    await screen.findByText('통합집');

    const input = screen.getByLabelText('등록된 맛집 검색');
    fireEvent.change(input, { target: { value: '없는가게' } });
    fireEvent.click(screen.getByRole('button', { name: '검색' }));
    expect(await screen.findByText('“없는가게” 검색 결과가 없습니다.')).toBeInTheDocument();

    // 목록 영역의 버튼(텍스트 "검색 초기화") — 폼 밖에서 URL 만 바꿔도 입력이 따라 비워진다.
    fireEvent.click(screen.getByText('검색 초기화'));
    expect(await screen.findByText('통합집')).toBeInTheDocument();
    expect(input).toHaveValue('');
  });

  it('가게 추가 — 형식이 아닌 URL 은 에러, 올바른 URL 은 크롤을 시작하고 입력을 비운다', async () => {
    useHandlers();
    renderPage();
    await screen.findByText('통합집');
    const listRequests = seen.list.length;

    const urlInput = screen.getByPlaceholderText('https://naver.me/...');
    fireEvent.change(urlInput, { target: { value: 'https://example.com/place/1' } });
    // 입력 중에는 목록을 다시 받지 않는다(입력 state 는 폼 안에만 있다).
    expect(seen.list).toHaveLength(listRequests);

    fireEvent.click(screen.getByRole('button', { name: /추가 \+ 크롤링/ }));
    expect(
      await screen.findByText('네이버 플레이스 URL 형식이 아닙니다 (naver.com / naver.me).'),
    ).toBeInTheDocument();
    expect(seen.started).toEqual([]);
    expect(urlInput).toHaveValue('https://example.com/place/1');

    // 다시 입력하면 에러가 지워진다.
    fireEvent.change(urlInput, { target: { value: 'https://naver.me/abc' } });
    expect(screen.queryByText(/URL 형식이 아닙니다/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /추가 \+ 크롤링/ }));
    await waitFor(() => expect(seen.started).toEqual([{ url: 'https://naver.me/abc', mode: 'create' }]));
    await waitFor(() => expect(urlInput).toHaveValue(''));
    // 시작된 작업이 트레이에 뜬다.
    expect(await screen.findByText('크롤링 작업 (1)')).toBeInTheDocument();
  });

  it('행 삭제는 확인 단계를 거치고, 취소하면 되돌아간다', async () => {
    useHandlers();
    renderPage();
    await screen.findByText('통합집');

    const row = () => within(rowOf('둘째집'));
    fireEvent.click(row().getByRole('button', { name: '삭제' }));
    expect(row().getByRole('button', { name: '정말 삭제' })).toBeInTheDocument();
    // 다른 행은 그대로다.
    expect(within(rowOf('통합집')).queryByRole('button', { name: '정말 삭제' })).toBeNull();

    fireEvent.click(row().getByRole('button', { name: '취소' }));
    expect(row().queryByRole('button', { name: '정말 삭제' })).toBeNull();
    expect(seen.deleted).toEqual([]);

    fireEvent.click(row().getByRole('button', { name: '삭제' }));
    fireEvent.click(row().getByRole('button', { name: '정말 삭제' }));
    await waitFor(() => expect(seen.deleted).toEqual(['C2']));
  });

  it('병합 버튼은 그 행의 병합 패널을 열고 닫는다', async () => {
    useHandlers();
    renderPage();
    await screen.findByText('통합집');

    fireEvent.click(within(rowOf('통합집')).getByRole('button', { name: '병합' }));
    expect(screen.getByText('다른 출처의 같은 가게를 이 행에 묶기')).toBeInTheDocument();
    expect(
      await screen.findByText('좌표·이름 임계를 통과한 다른 출처 후보가 없습니다.'),
    ).toBeInTheDocument();

    // 같은 행의 버튼이 "닫기" 로 바뀌고, 누르면 패널이 닫힌다.
    fireEvent.click(within(rowOf('통합집')).getByRole('button', { name: '닫기' }));
    expect(screen.queryByText('다른 출처의 같은 가게를 이 행에 묶기')).toBeNull();
    expect(within(rowOf('통합집')).getByRole('button', { name: '병합' })).toBeInTheDocument();
  });
});
