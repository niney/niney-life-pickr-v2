import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { useAuthStore } from '@repo/shared';
import { server } from '~/test/msw';
import { MealPage } from './MealPage';

// 내 식단(웹) — 조회 전용 화면. 탭 전환 시 어떤 요청이 나가는지까지 계약으로 고정한다
// (onUnhandledRequest: 'error' 라 핸들러를 안 깔면 즉시 실패한다).

const ENTRIES_URL = '/api/v1/meals';
const CALENDAR_URL = '/api/v1/meals/calendar';
const STATS_URL = '/api/v1/meals/stats';
// 사진은 JWT 가 필요해 blob 으로 받는다 — 토큰 경로도 핸들러가 필요하다.
const PHOTO_THUMB_URL = '/api/v1/meals/photos/:token/thumb';

const entry = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'e1',
  eatenAt: '2026-08-20T03:10:00.000Z',
  eatenDate: '2026-08-20',
  slot: 'lunch',
  mealType: 'dining_out',
  placeId: null,
  placeName: '숯토리',
  memo: null,
  source: 'photo',
  items: [
    {
      id: 'i1',
      name: '김치찌개',
      foodId: 'f1',
      dishType: 'stew',
      mainIngredient: 'pork',
      cuisine: 'korean',
      portion: 'normal',
      isMain: true,
      confidence: 0.8,
      source: 'recognized',
      sortOrder: 0,
    },
    {
      id: 'i2',
      name: '김치',
      foodId: null,
      dishType: null,
      mainIngredient: null,
      cuisine: null,
      portion: null,
      isMain: false,
      confidence: null,
      source: 'recognized',
      sortOrder: 1,
    },
  ],
  photos: [],
  recognition: null,
  createdAt: '2026-08-20T03:20:00.000Z',
  updatedAt: '2026-08-20T03:20:00.000Z',
  ...over,
});

const stats = {
  from: '2026-07-24',
  to: '2026-08-22',
  entryCount: 3,
  itemCount: 5,
  recordedDays: 2,
  totalDays: 30,
  bySlot: [{ key: 'lunch', label: '점심', count: 3 }],
  byDishType: [
    { key: 'stew', label: '찌개·전골', count: 2 },
    { key: 'rice', label: '밥·죽', count: 1 },
  ],
  byMainIngredient: [{ key: 'pork', label: '돼지고기', count: 2 }],
  byCuisine: [{ key: 'korean', label: '한식', count: 3 }],
  byMealType: [{ key: 'dining_out', label: '외식', count: 3 }],
  topFoods: [{ name: '김치찌개', count: 2, lastEatenDate: '2026-08-21' }],
  repeatRate: 0.25,
  streakDays: 2,
  byDate: [
    { date: '2026-08-21', count: 1 },
    { date: '2026-08-22', count: 2 },
  ],
};

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <MealPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe('MealPage', () => {
  beforeEach(() => {
    useAuthStore.setState({ token: 't', user: { id: 'u1', email: 'u@x.com', role: 'USER' }, isGuest: false });
  });

  it('기록 탭 — 목록을 날짜 머리글과 함께 보여준다', async () => {
    server.use(http.get(ENTRIES_URL, () => HttpResponse.json({ items: [entry()], nextCursor: null })));
    renderPage();
    expect(await screen.findByText('김치찌개')).toBeInTheDocument();
    expect(screen.getByText(/곁들임 김치/)).toBeInTheDocument();
    expect(screen.getByText('점심')).toBeInTheDocument();
    expect(screen.getByText(/숯토리/)).toBeInTheDocument();
    expect(screen.getByText(/2026-08-20/)).toBeInTheDocument();
  });

  it('기록이 없으면 앱에서 남기라고 안내한다', async () => {
    server.use(http.get(ENTRIES_URL, () => HttpResponse.json({ items: [], nextCursor: null })));
    renderPage();
    expect(await screen.findByText(/앱에서 사진으로 첫 끼니/)).toBeInTheDocument();
  });

  it('더 보기 — nextCursor 를 쿼리로 넘겨 다음 페이지를 받는다', async () => {
    const cursors: (string | null)[] = [];
    server.use(
      http.get(ENTRIES_URL, ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor');
        cursors.push(cursor);
        return HttpResponse.json(
          cursor
            ? { items: [entry({ id: 'e2', eatenDate: '2026-08-19', items: [] })], nextCursor: null }
            : { items: [entry()], nextCursor: '2026-08-20T03:10:00.000Z' },
        );
      }),
    );
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: '더 보기' }));
    await waitFor(() => expect(cursors).toContain('2026-08-20T03:10:00.000Z'));
  });

  it('달력 탭 — 월 요약을 받고 날짜를 고르면 그날 기록을 조회한다', async () => {
    const dayQueries: string[] = [];
    server.use(
      http.get(ENTRIES_URL, ({ request }) => {
        const from = new URL(request.url).searchParams.get('from');
        if (from) dayQueries.push(from);
        return HttpResponse.json({ items: from ? [entry()] : [], nextCursor: null });
      }),
      http.get(CALENDAR_URL, ({ request }) => {
        const month = new URL(request.url).searchParams.get('month') ?? '';
        return HttpResponse.json({
          month,
          days: [{ date: `${month}-05`, count: 2, slots: ['lunch', 'dinner'], hasPhoto: true }],
        });
      }),
    );
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /달력/ }));
    const day = await screen.findByRole('button', { name: '5' });
    fireEvent.click(day);
    await waitFor(() => expect(dayQueries.length).toBeGreaterThan(0));
    expect(dayQueries[0]).toMatch(/-05$/);
  });

  it('통계 탭 — 기간 전환이 from/to 를 바꾼다', async () => {
    const ranges: string[] = [];
    server.use(
      http.get(ENTRIES_URL, () => HttpResponse.json({ items: [], nextCursor: null })),
      http.get(STATS_URL, ({ request }) => {
        const url = new URL(request.url);
        ranges.push(`${url.searchParams.get('from')}~${url.searchParams.get('to')}`);
        return HttpResponse.json(stats);
      }),
    );
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /통계/ }));
    expect(await screen.findByText('찌개·전골')).toBeInTheDocument();
    expect(screen.getByText('2일')).toBeInTheDocument();
    expect(screen.getByText('25%')).toBeInTheDocument();

    const before = ranges.length;
    fireEvent.click(screen.getByRole('button', { name: '1주' }));
    await waitFor(() => expect(ranges.length).toBeGreaterThan(before));
    expect(ranges[ranges.length - 1]).not.toBe(ranges[0]);
  });

  it('사진이 있으면 인증 fetch 로 썸네일을 받아 그린다', async () => {
    server.use(
      http.get(ENTRIES_URL, () =>
        HttpResponse.json({
          items: [entry({ photos: [{ token: 'a'.repeat(8), width: 40, height: 30, byteSize: 100, sortOrder: 0 }] })],
          nextCursor: null,
        }),
      ),
      http.get(PHOTO_THUMB_URL, () => HttpResponse.arrayBuffer(new ArrayBuffer(8), { headers: { 'Content-Type': 'image/jpeg' } })),
    );
    renderPage();
    expect(await screen.findByAltText('식단 사진')).toBeInTheDocument();
  });
});
