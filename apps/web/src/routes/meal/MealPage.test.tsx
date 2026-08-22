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
    useAuthStore.setState({
      token: 't',
      user: { id: 'u1', email: 'u@x.com', role: 'USER', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
      isGuest: false,
    });
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

// 추천·설정 탭 — LLM 호출은 서버가 하고 화면은 결과만 다룬다. 캐시/강제 재요청 계약(force)과
// 가중치 저장 payload 를 고정한다.
describe('MealPage — 추천·설정 탭', () => {
  const CONTEXT_URL = '/api/v1/meals/recommendations/context';
  const RECOMMENDATIONS_URL = '/api/v1/meals/recommendations';
  const PREFERENCE_URL = '/api/v1/meals/preference';

  const preference = {
    weights: { variety: 4, taste: 4, balance: 3, health: 2, novelty: 2, weather: 1, convenience: 2 },
    excludedFoods: ['오이'],
    likedFoods: [],
    mealTypes: [],
    slots: ['breakfast', 'lunch', 'dinner'],
    onboarded: true,
    updatedAt: '2026-08-22T00:00:00.000Z',
  };

  const recommendation = {
    id: 'r1',
    targetDate: '2026-08-22',
    targetSlot: 'dinner',
    items: [
      {
        name: '연어초밥',
        foodId: 'f2',
        dishType: 'raw_fish',
        mainIngredient: 'fish',
        cuisine: 'japanese',
        reason: '2주 동안 생선을 안 드셨어요.',
        tags: ['14일 만에'],
        score: 0.82,
        lastEatenDate: null,
      },
    ],
    summary: '오늘은 담백하게',
    status: 'done',
    model: 'gpt-oss:120b',
    promptVersion: 1,
    notice: null,
    feedback: null,
    createdAt: '2026-08-22T09:00:00.000Z',
  };

  beforeEach(() => {
    useAuthStore.setState({
      token: 't',
      user: { id: 'u1', email: 'u@x.com', role: 'USER', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
      isGuest: false,
    });
  });

  it('추천 탭 — 추천받기는 force=false, 다시 추천은 force=true 로 보낸다', async () => {
    const forces: boolean[] = [];
    server.use(
      http.get(ENTRIES_URL, () => HttpResponse.json({ items: [], nextCursor: null })),
      http.get(CONTEXT_URL, () =>
        HttpResponse.json({ entryCount: 12, recentFoods: ['김치찌개'], preference, latest: null }),
      ),
      http.get(RECOMMENDATIONS_URL, () => HttpResponse.json({ items: [] })),
      http.post(RECOMMENDATIONS_URL, async ({ request }) => {
        const body = (await request.json()) as { force: boolean };
        forces.push(body.force);
        return HttpResponse.json(recommendation);
      }),
    );
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /추천/ }));
    fireEvent.click(await screen.findByRole('button', { name: /추천받기/ }));

    expect(await screen.findByText('연어초밥')).toBeInTheDocument();
    expect(screen.getByText('2주 동안 생선을 안 드셨어요.')).toBeInTheDocument();
    expect(screen.getByText('오늘은 담백하게')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /다시 추천/ }));
    await waitFor(() => expect(forces).toEqual([false, true]));
  });

  it('추천 피드백 — 👍 를 누르면 rating 1 을 보낸다', async () => {
    const ratings: (number | null | undefined)[] = [];
    server.use(
      http.get(ENTRIES_URL, () => HttpResponse.json({ items: [], nextCursor: null })),
      http.get(CONTEXT_URL, () =>
        HttpResponse.json({ entryCount: 12, recentFoods: [], preference, latest: recommendation }),
      ),
      http.get(RECOMMENDATIONS_URL, () => HttpResponse.json({ items: [recommendation] })),
      http.post(`${RECOMMENDATIONS_URL}/r1/feedback`, async ({ request }) => {
        const body = (await request.json()) as { rating?: number | null };
        ratings.push(body.rating);
        return HttpResponse.json({ ...recommendation, feedback: { pickedName: null, rating: 1, eatenEntryId: null } });
      }),
    );
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /추천/ }));
    fireEvent.click(await screen.findByRole('button', { name: '추천이 좋아요' }));
    await waitFor(() => expect(ratings).toEqual([1]));
  });

  it('설정 탭 — 슬라이더·제외 음식을 담아 PUT 한다', async () => {
    let saved: Record<string, unknown> | null = null;
    server.use(
      http.get(ENTRIES_URL, () => HttpResponse.json({ items: [], nextCursor: null })),
      http.get(PREFERENCE_URL, () => HttpResponse.json(preference)),
      http.put(PREFERENCE_URL, async ({ request }) => {
        saved = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...preference, ...saved });
      }),
    );
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /설정/ }));

    const slider = await screen.findByLabelText('건강');
    fireEvent.change(slider, { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('못 먹는 / 싫어하는 음식'), { target: { value: '오이, 고수' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(saved).not.toBeNull());
    expect((saved as unknown as { weights: { health: number } }).weights.health).toBe(5);
    expect((saved as unknown as { excludedFoods: string[] }).excludedFoods).toEqual(['오이', '고수']);
  });

  it('설정 탭 — 프리셋은 가중치를 한 번에 바꾼다', async () => {
    server.use(
      http.get(ENTRIES_URL, () => HttpResponse.json({ items: [], nextCursor: null })),
      http.get(PREFERENCE_URL, () => HttpResponse.json(preference)),
    );
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /설정/ }));
    fireEvent.click(await screen.findByRole('button', { name: '새로운 도전' }));
    expect((screen.getByLabelText('새로운 시도') as HTMLInputElement).value).toBe('5');
  });
});
