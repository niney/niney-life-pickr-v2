import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { MEAL_RECOMMENDATIONS_DELETE_CONFIRMATION } from '@repo/api-contract';
import { setMealDraftPrincipal, useAuthStore, useMealDraftStore } from '@repo/shared';
import { server } from '~/test/msw';
import { MealPage } from './MealPage';

// 내 식단(웹) — 목록·달력·통계·추천·설정 탭. 입력은 별도 화면(MealEntryFormPage)이고 여기서는
// 그리로 가는 링크와 추천→draft 연결만 본다. 탭 전환 시 어떤 요청이 나가는지까지 계약으로 고정한다
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
  insights: [
    {
      key: 'weekly-activity',
      tone: 'positive',
      title: '최근 기록 빈도가 늘었어요',
      detail: '최근 7일은 4일·6끼, 직전 7일은 2일·3끼를 기록했어요.',
    },
  ],
  nutrition: {
    avgKcalPerDay: 780,
    avgProteinGPerDay: 24.5,
    avgSodiumMgPerDay: 2100,
    coverage: 0.5,
    itemsWithNutrition: 2,
  },
  recommendation: { chosenCount: 2, loggedCount: 1, ratedCount: 1, acceptanceRate: 0.5 },
  byDate: [
    { date: '2026-08-21', count: 1 },
    { date: '2026-08-22', count: 2 },
  ],
};

const renderPage = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <MealPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe('MealPage', () => {
  beforeEach(() => {
    useAuthStore.setState({
      token: 't',
      user: {
        id: 'u1',
        email: 'u@x.com',
        role: 'USER',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      isGuest: false,
    });
  });

  it('기록 탭 — 목록을 날짜 머리글과 함께 보여준다', async () => {
    server.use(
      http.get(ENTRIES_URL, () => HttpResponse.json({ items: [entry()], nextCursor: null })),
    );
    renderPage();
    expect(await screen.findByText('김치찌개')).toBeInTheDocument();
    expect(screen.getByText(/곁들임 김치/)).toBeInTheDocument();
    expect(screen.getByText('점심', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText(/숯토리/)).toBeInTheDocument();
    expect(screen.getByText(/2026-08-20/)).toBeInTheDocument();
  });

  it('기록이 없으면 웹에서 바로 첫 끼니를 적는 링크를 준다', async () => {
    server.use(http.get(ENTRIES_URL, () => HttpResponse.json({ items: [], nextCursor: null })));
    renderPage();
    expect(await screen.findByRole('link', { name: '첫 끼니 기록하기' })).toHaveAttribute(
      'href',
      '/me/meals/new',
    );
    expect(screen.getByRole('link', { name: /^기록하기$/ })).toHaveAttribute('href', '/me/meals/new');
  });

  it('기록 카드는 상세로 가는 링크다', async () => {
    server.use(
      http.get(ENTRIES_URL, () => HttpResponse.json({ items: [entry()], nextCursor: null })),
    );
    renderPage();
    const food = await screen.findByText('김치찌개');
    expect(food.closest('a')).toHaveAttribute('href', '/me/meals/e1');
  });

  it('더 보기 — opaque nextCursor 를 그대로 넘기고 앞 페이지를 유지한다', async () => {
    const cursors: (string | null)[] = [];
    const opaqueCursor = 'v2:2026-08-20T03:10:00.000Z|e1';
    server.use(
      http.get(ENTRIES_URL, ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor');
        cursors.push(cursor);
        return HttpResponse.json(
          cursor
            ? {
                items: [
                  entry({
                    id: 'e2',
                    eatenDate: '2026-08-19',
                    items: [{ ...entry().items[0], id: 'i2', name: '비빔밥' }],
                  }),
                ],
                nextCursor: null,
              }
            : { items: [entry()], nextCursor: opaqueCursor },
        );
      }),
    );
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: '더 보기' }));
    await waitFor(() => expect(cursors).toContain(opaqueCursor));
    expect(screen.getByText('김치찌개')).toBeInTheDocument();
    expect(await screen.findByText('비빔밥')).toBeInTheDocument();
  });

  it('달력 탭 — 월 요약을 받고 날짜를 고르면 그날 기록을 조회한다', async () => {
    const dayQueries: string[] = [];
    const limits: (string | null)[] = [];
    server.use(
      http.get(ENTRIES_URL, ({ request }) => {
        const params = new URL(request.url).searchParams;
        const from = params.get('from');
        limits.push(params.get('limit'));
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
    expect(limits).not.toContain('0');
    expect(dayQueries).toHaveLength(0);
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
    expect(screen.getByText('추천 수락률')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('주간 인사이트')).toBeInTheDocument();
    expect(screen.getByText('최근 기록 빈도가 늘었어요')).toBeInTheDocument();
    expect(screen.getByText(/기록 기반 관찰/)).toBeInTheDocument();

    const before = ranges.length;
    fireEvent.click(screen.getByRole('button', { name: '1주' }));
    await waitFor(() => expect(ranges.length).toBeGreaterThan(before));
    expect(ranges[ranges.length - 1]).not.toBe(ranges[0]);
  });

  it('사진이 있으면 인증 fetch 로 썸네일을 받아 그린다', async () => {
    server.use(
      http.get(ENTRIES_URL, () =>
        HttpResponse.json({
          items: [
            entry({
              photos: [
                { token: 'a'.repeat(8), width: 40, height: 30, byteSize: 100, sortOrder: 0 },
              ],
            }),
          ],
          nextCursor: null,
        }),
      ),
      http.get(PHOTO_THUMB_URL, () =>
        HttpResponse.arrayBuffer(new ArrayBuffer(8), { headers: { 'Content-Type': 'image/jpeg' } }),
      ),
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
    weights: {
      variety: 4,
      taste: 4,
      balance: 3,
      health: 2,
      novelty: 2,
      weather: 1,
      convenience: 2,
    },
    excludedFoods: ['오이'],
    allergens: [],
    dislikedFoods: ['고수'],
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
        ingredients: ['연어', '밥', '와사비'],
        allergenWarnings: [],
        allergenAssessment: 'known_safe',
        nutritionBasis: 'missing',
        nutritionFrom: null,
      },
    ],
    summary: '오늘은 담백하게',
    status: 'done',
    model: 'gpt-oss:120b',
    promptVersion: 1,
    notice: null,
    feedback: null,
    candidateRatings: [],
    createdAt: '2026-08-22T09:00:00.000Z',
  };

  beforeEach(() => {
    useAuthStore.setState({
      token: 't',
      user: {
        id: 'u1',
        email: 'u@x.com',
        role: 'USER',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      isGuest: false,
    });
    server.use(
      http.get('/api/v1/air/location', () => HttpResponse.json({ location: null })),
      http.post(`${RECOMMENDATIONS_URL}/:id/events`, () => HttpResponse.json({ ok: true })),
    );
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
        return HttpResponse.json({
          ...recommendation,
          feedback: { pickedName: null, rating: 1, eatenEntryId: null },
        });
      }),
    );
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /추천/ }));
    fireEvent.click(await screen.findByRole('button', { name: '추천이 좋아요' }));
    await waitFor(() => expect(ratings).toEqual([1]));
  });

  it('추천 피드백 — mutation 응답의 선택을 현재 카드에 즉시 반영한다', async () => {
    const pickedNames: (string | null | undefined)[] = [];
    server.use(
      http.get(ENTRIES_URL, () => HttpResponse.json({ items: [], nextCursor: null })),
      // feedback 성공 후 cache invalidation으로 재조회되어도 서버 컨텍스트는 아직 이전 snapshot이다.
      // mutation 반환값을 local current에 적용하지 않으면 이 테스트의 선택 상태가 바뀌지 않는다.
      http.get(CONTEXT_URL, () =>
        HttpResponse.json({ entryCount: 12, recentFoods: [], preference, latest: recommendation }),
      ),
      http.get(RECOMMENDATIONS_URL, () => HttpResponse.json({ items: [recommendation] })),
      http.post(`${RECOMMENDATIONS_URL}/r1/feedback`, async ({ request }) => {
        const body = (await request.json()) as { pickedName?: string | null };
        pickedNames.push(body.pickedName);
        return HttpResponse.json({
          ...recommendation,
          feedback: { pickedName: '연어초밥', rating: null, eatenEntryId: null },
        });
      }),
    );
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /추천/ }));

    const choice = await screen.findByRole('button', { name: '이걸로 할래요' });
    expect(choice).not.toHaveClass('text-primary');
    fireEvent.click(choice);

    await waitFor(() => expect(pickedNames).toEqual(['연어초밥']));
    await waitFor(() => expect(choice).toHaveClass('text-primary'));
  });

  it('먹은 메뉴 기록 — 추천을 원본 id 가 달린 draft 로 옮긴다', async () => {
    await setMealDraftPrincipal('u1');
    useMealDraftStore.getState().clear();
    server.use(
      http.get(ENTRIES_URL, () => HttpResponse.json({ items: [], nextCursor: null })),
      http.get(CONTEXT_URL, () =>
        HttpResponse.json({ entryCount: 12, recentFoods: [], preference, latest: recommendation }),
      ),
      http.get(RECOMMENDATIONS_URL, () => HttpResponse.json({ items: [recommendation] })),
    );
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /추천/ }));
    fireEvent.click(await screen.findByRole('button', { name: '연어초밥 먹은 메뉴로 기록' }));

    const s = useMealDraftStore.getState();
    expect(s.originRecommendationId).toBe('r1');
    expect(s.slot).toBe('dinner');
    expect(s.items).toEqual([
      expect.objectContaining({ name: '연어초밥', foodId: 'f2', source: 'recommendation' }),
    ]);
  });

  it('이미 기록으로 이어진 추천은 기록 버튼 대신 그 기록으로 보낸다', async () => {
    await setMealDraftPrincipal('u1');
    const linked = {
      ...recommendation,
      feedback: { pickedName: '연어초밥', rating: null, eatenEntryId: 'e9' },
    };
    server.use(
      http.get(ENTRIES_URL, () => HttpResponse.json({ items: [], nextCursor: null })),
      http.get(CONTEXT_URL, () =>
        HttpResponse.json({ entryCount: 12, recentFoods: [], preference, latest: linked }),
      ),
      http.get(RECOMMENDATIONS_URL, () => HttpResponse.json({ items: [linked] })),
    );
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /추천/ }));
    expect(await screen.findByRole('link', { name: '기록 보기' })).toHaveAttribute('href', '/me/meals/e9');
    expect(screen.queryByRole('button', { name: /먹은 메뉴로 기록/ })).not.toBeInTheDocument();
  });

  it('최근 추천 — 눌러도 목록 순서는 그대로, 보는 중만 옮기고 지난 추천을 밝힌다', async () => {
    const withItem = (id: string, name: string, createdAt: string) => ({
      ...recommendation,
      id,
      items: [{ ...recommendation.items[0]!, name }],
      createdAt,
    });
    const newest = withItem('r3', '연어초밥', '2026-08-22T10:00:00.000Z');
    const older = withItem('r2', '김치찌개', '2026-08-22T09:00:00.000Z');
    const oldest = withItem('r1', '비빔밥', '2026-08-22T08:00:00.000Z');
    const shownIds: string[] = [];
    server.use(
      http.get(ENTRIES_URL, () => HttpResponse.json({ items: [], nextCursor: null })),
      http.get(CONTEXT_URL, () =>
        HttpResponse.json({ entryCount: 12, recentFoods: [], preference, latest: newest }),
      ),
      http.get(RECOMMENDATIONS_URL, () => HttpResponse.json({ items: [newest, older, oldest] })),
      http.post(`${RECOMMENDATIONS_URL}/:id/events`, async ({ params, request }) => {
        const body = (await request.json()) as { kind: string };
        if (body.kind === 'shown') shownIds.push(String(params['id']));
        return HttpResponse.json({ ok: true });
      }),
    );
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /추천/ }));

    // 목록 줄은 받은 시각(HH:MM)이 붙은 버튼 — 카드 버튼에는 시각이 없다. 줄마다 붙은 삭제 버튼은 뺀다.
    const rows = async () =>
      (await screen.findAllByRole('button', { name: /\d{2}:\d{2}/ })).filter(
        (button) => !button.getAttribute('aria-label')?.endsWith('추천 삭제'),
      );
    const order = async () => (await rows()).map((row) => row.textContent ?? '');
    expect(await order()).toEqual([
      expect.stringContaining('연어초밥'),
      expect.stringContaining('김치찌개'),
      expect.stringContaining('비빔밥'),
    ]);
    expect((await rows())[0]).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: /다시 추천/ })).toBeInTheDocument();

    fireEvent.click((await rows())[1]!);

    // 위 카드가 고른 추천으로 바뀌고 지난 추천임을 밝힌다. 다시 추천은 숨긴다.
    expect(await screen.findByText('지난 추천')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '김치찌개 먹은 메뉴로 기록' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /다시 추천/ })).not.toBeInTheDocument();
    // 목록은 순서 그대로, 보는 중만 옮겼다.
    expect(await order()).toEqual([
      expect.stringContaining('연어초밥'),
      expect.stringContaining('김치찌개'),
      expect.stringContaining('비빔밥'),
    ]);
    expect((await rows())[1]).toHaveAttribute('aria-current', 'true');
    expect((await rows())[0]).not.toHaveAttribute('aria-current');

    fireEvent.click(screen.getByRole('button', { name: '최신 추천으로' }));
    expect(await screen.findByRole('button', { name: '연어초밥 먹은 메뉴로 기록' })).toBeInTheDocument();
    expect(screen.queryByText('지난 추천')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /다시 추천/ })).toBeInTheDocument();
    // 노출은 처음 보인 최신 추천만 — 목록에서 다시 연 예전 추천은 새 노출이 아니다.
    await waitFor(() => expect(shownIds).toEqual(['r3']));
  });

  it('최근 추천 삭제 — 확인창을 거쳐 지우고, 보던 추천이면 남은 최신으로, 모두 삭제도', async () => {
    await setMealDraftPrincipal('u1');
    // 지울 추천에서 시작한 기록 초안 — 지우면 출처만 떼어 낸다.
    useMealDraftStore.getState().start({ originRecommendationId: 'r3' });
    const withItem = (id: string, name: string, createdAt: string) => ({
      ...recommendation,
      id,
      items: [{ ...recommendation.items[0]!, name }],
      createdAt,
    });
    let items = [
      withItem('r3', '연어초밥', '2026-08-22T10:00:00.000Z'),
      withItem('r2', '김치찌개', '2026-08-22T09:00:00.000Z'),
    ];
    const deleted: string[] = [];
    let deletedAll: unknown = null;
    server.use(
      http.get(ENTRIES_URL, () => HttpResponse.json({ items: [], nextCursor: null })),
      http.get(CONTEXT_URL, () =>
        HttpResponse.json({ entryCount: 12, recentFoods: [], preference, latest: items[0] ?? null }),
      ),
      http.get(RECOMMENDATIONS_URL, () => HttpResponse.json({ items })),
      http.delete(`${RECOMMENDATIONS_URL}/:id`, ({ params }) => {
        deleted.push(String(params['id']));
        items = items.filter((r) => r.id !== params['id']);
        return new HttpResponse(null, { status: 204 });
      }),
      http.delete(RECOMMENDATIONS_URL, async ({ request }) => {
        deletedAll = await request.json();
        const count = items.length;
        items = [];
        return HttpResponse.json({ deleted: { recommendations: count, recommendationEvents: 0 } });
      }),
    );
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /추천/ }));

    const deleteButtons = async () => screen.findAllByRole('button', { name: /추천 삭제$/ });
    // 확인창에서 취소하면 지우지 않는다.
    fireEvent.click((await deleteButtons())[0]!);
    expect(screen.getByRole('alertdialog', { name: '추천 삭제' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(deleted).toEqual([]);

    // 보고 있던 최신(연어초밥)을 지우면 카드는 남은 최신(김치찌개)으로.
    fireEvent.click((await deleteButtons())[0]!);
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    await waitFor(() => expect(deleted).toEqual(['r3']));
    expect(
      await screen.findByRole('button', { name: '김치찌개 먹은 메뉴로 기록' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '연어초밥 먹은 메뉴로 기록' }),
    ).not.toBeInTheDocument();
    expect(useMealDraftStore.getState().originRecommendationId).toBeNull();

    // 모두 삭제 — 확인 문자열을 실어 보내고, 카드·목록이 비어야 한다.
    fireEvent.click(screen.getByRole('button', { name: '모두 삭제' }));
    expect(screen.getByRole('alertdialog', { name: '최근 추천 모두 삭제' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    await waitFor(() =>
      expect(deletedAll).toEqual({ confirmation: MEAL_RECOMMENDATIONS_DELETE_CONFIRMATION }),
    );
    await waitFor(() => expect(screen.queryByText('최근 추천')).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /먹은 메뉴로 기록/ })).not.toBeInTheDocument();
  });

  it('설정 탭 — 슬라이더·절대 제외·덜 선호 음식을 나눠 PUT 한다', async () => {
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
    fireEvent.change(screen.getByLabelText('취향상 제외할 음식'), {
      target: { value: '오이, 땅콩' },
    });
    fireEvent.change(screen.getByLabelText('덜 선호하는 음식'), {
      target: { value: '고수, 내장' },
    });
    expect(screen.getByText(/재료 정보가 없는 음식은 남을 수 있어요/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(saved).not.toBeNull());
    expect((saved as unknown as { weights: { health: number } }).weights.health).toBe(5);
    expect((saved as unknown as { excludedFoods: string[] }).excludedFoods).toEqual([
      '오이',
      '땅콩',
    ]);
    expect((saved as unknown as { dislikedFoods: string[] }).dislikedFoods).toEqual([
      '고수',
      '내장',
    ]);
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

  it('설정 탭 — 성별·출생연도를 함께 저장하고, 연도 형식이 틀리면 막는다', async () => {
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
    fireEvent.click(await screen.findByRole('button', { name: '여성' }));
    const year = screen.getByLabelText('출생연도');
    fireEvent.change(year, { target: { value: '19' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(await screen.findByText(/출생연도는 1900년부터/)).toBeInTheDocument();
    expect(saved).toBeNull();

    fireEvent.change(year, { target: { value: '1990' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(saved).not.toBeNull());
    expect(saved).toMatchObject({ sex: 'female', birthYear: 1990 });
  });
});

describe('MealPage — 영양 탭', () => {
  const NUTRITION_URL = '/api/v1/meals/nutrition';
  const ADVICE_URL = '/api/v1/meals/nutrition/advice';

  const nutrient = (over: Record<string, unknown>) => ({
    key: 'calcium',
    label: '칼슘',
    unit: 'mg',
    intakePerDay: 260,
    reference: { kind: 'rni', amount: 700, ear: 550 },
    upperLimit: 2500,
    percent: 37,
    coverage: 1,
    status: 'low',
    supplementCandidate: true,
    topSources: ['된장찌개'],
    foodSuggestions: ['순두부찌개'],
    typicalFoods: ['우유·요거트·치즈', '두부'],
    note: null,
    ...over,
  });
  const analysis = (days: number) => ({
    from: '2026-09-21',
    to: '2026-10-04',
    days,
    analyzedDays: 9,
    mealCount: 24,
    profile: { sex: null, ageGroup: '30-49', basis: 'default' },
    energy: { intakePerDay: 1650, requirement: 1900, percent: 87 },
    coverage: 0.97,
    status: 'ok',
    insufficientReason: null,
    nutrients: [
      nutrient({ key: 'protein', label: '단백질', unit: 'g', intakePerDay: 72, percent: 144, status: 'ok', supplementCandidate: false }),
      nutrient({}),
    ],
    notMeasured: ['마그네슘', '아연'],
    notes: ['성별·출생연도를 설정하면 내 기준으로 더 정확히 봐요(지금은 30-49세 성인 기준).'],
  });
  const advice = {
    id: 'adv1',
    targetDate: '2026-10-04',
    status: 'done',
    model: 'kimi-k3',
    summary: '칼슘부터 음식으로 챙겨 보세요.',
    items: [
      {
        nutrient: 'calcium',
        label: '칼슘',
        reason: '하루 평균 260mg으로 권장의 37%예요.',
        foodTip: '두부·우유를 곁들여 보세요.',
        supplementTip: '구연산칼슘을 나눠 드세요.',
        unit: 'mg',
        shortfallPerDay: 440,
        upperLimit: 2500,
        caution: '철분제와는 시간을 띄우세요.',
      },
    ],
    disclaimer: '식단 기록으로 본 추정이며 진단이 아니에요.',
    analysis: analysis(14),
    createdAt: '2026-10-04T03:00:00.000Z',
  };

  beforeEach(() => {
    useAuthStore.setState({
      token: 't',
      user: {
        id: 'u1',
        email: 'u@x.com',
        role: 'USER',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      isGuest: false,
    });
  });

  it('점검을 모자란 순으로 보여 주고, 조언 받기는 force=false·다시 쓰기는 force=true, 기간을 바꾸면 days 로 다시 조회한다', async () => {
    const asked: number[] = [];
    const posted: unknown[] = [];
    server.use(
      http.get(ENTRIES_URL, () => HttpResponse.json({ items: [], nextCursor: null })),
      http.get(NUTRITION_URL, ({ request }) => {
        const days = Number(new URL(request.url).searchParams.get('days'));
        asked.push(days);
        return HttpResponse.json(analysis(days));
      }),
      http.get(ADVICE_URL, () => HttpResponse.json({ advice: null })),
      http.post(ADVICE_URL, async ({ request }) => {
        posted.push(await request.json());
        return HttpResponse.json(advice);
      }),
    );
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: '영양' }));

    expect(await screen.findByText('260mg / 권장섭취량 700mg (37%)', { exact: false })).toBeInTheDocument();
    const rows = screen.getAllByRole('listitem').map((li) => li.textContent ?? '');
    expect(rows.findIndex((t) => t.startsWith('칼슘'))).toBeLessThan(rows.findIndex((t) => t.startsWith('단백질')));
    expect(screen.getByText(/한 끼로는 순두부찌개/)).toBeInTheDocument();
    expect(screen.getByText(/판단하지 않는 영양소: 마그네슘, 아연/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '최근 14일로 조언 받기' }));
    expect(await screen.findByText('칼슘부터 음식으로 챙겨 보세요.')).toBeInTheDocument();
    expect(posted[0]).toEqual({ days: 14, force: false });
    expect(screen.getByText('구연산칼슘을 나눠 드세요.')).toBeInTheDocument();
    expect(screen.getByText('하루 약 440mg 모자람')).toBeInTheDocument();
    expect(screen.getByText(/진단이 아니에요/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '다시 쓰기' }));
    await waitFor(() => expect(posted).toHaveLength(2));
    expect(posted[1]).toEqual({ days: 14, force: true });

    fireEvent.click(screen.getByRole('button', { name: '28일' }));
    await waitFor(() => expect(asked).toContain(28));
  });

  it('기록이 모자라면 이유를 보여 주고 조언 버튼을 막는다', async () => {
    server.use(
      http.get(ENTRIES_URL, () => HttpResponse.json({ items: [], nextCursor: null })),
      http.get(NUTRITION_URL, () =>
        HttpResponse.json({
          ...analysis(14),
          status: 'insufficient',
          analyzedDays: 2,
          insufficientReason: '최근 14일 중 두 끼 이상 기록한 날이 2일이에요.',
        }),
      ),
      http.get(ADVICE_URL, () => HttpResponse.json({ advice: null })),
    );
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: '영양' }));
    expect(await screen.findByText(/두 끼 이상 기록한 날이 2일/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '최근 14일로 조언 받기' })).toBeDisabled();
  });
});
