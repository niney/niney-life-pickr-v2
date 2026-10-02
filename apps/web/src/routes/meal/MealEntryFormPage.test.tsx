import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type { MealRecommendationType } from '@repo/api-contract';
import {
  setMealDraftPrincipal,
  startMealDraftFromRecommendation,
  useAuthStore,
  useMealDraftStore,
} from '@repo/shared';
import { server } from '~/test/msw';
import { MealEditPage, MealNewPage } from './MealEntryFormPage';

// 식단 입력(웹) — 손으로 적는 새 기록과 수정. 저장 payload(출처·추천 연결·사진 미전송)와
// draft 복원 대기·이어 쓰기 규칙을 고정한다.

const USER = {
  id: 'u1',
  email: 'u@x.com',
  role: 'USER',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
} as const;

const ME_URL = '/api/v1/auth/me';
const ENTRIES_URL = '/api/v1/meals';
const PRESETS_URL = '/api/v1/meals/time-presets';
const FOOD_SEARCH_URL = '/api/v1/food/search';
const FREQUENT_URL = '/api/v1/meals/items/frequent';

const quickItem = (over: Partial<Record<string, unknown>> = {}) => ({
  name: '공기밥',
  foodId: 'f-rice',
  dishType: 'rice',
  mainIngredient: 'grain',
  cuisine: 'korean',
  isMain: false,
  portion: null,
  servings: null,
  portionSource: null,
  count: 0,
  lastEatenDate: null,
  from: 'default',
  ...over,
});

const savedEntry = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'e1',
  eatenAt: '2026-09-27T03:30:00.000Z',
  eatenDate: '2026-09-27',
  slot: 'lunch',
  mealType: 'dining_out',
  placeId: 'place-1',
  placeName: '숯토리',
  memo: '팀 점심',
  source: 'photo',
  originRecommendationId: null,
  items: [
    {
      id: 'i1',
      name: '김치찌개',
      foodId: 'f1',
      dishType: 'stew',
      mainIngredient: 'pork',
      cuisine: 'korean',
      portion: 'normal',
      servings: null,
      portionSource: 'vision_ordinal',
      isMain: true,
      confidence: 0.8,
      recognitionDishId: 'dish-1',
      selectedCandidateRank: 0,
      catalogMatchedBy: 'food_id',
      catalogMatchScore: 1,
      source: 'recognized',
      sortOrder: 0,
      kcal: 300,
      proteinG: 20,
      sodiumMg: 1500,
      nutritionFrom: null,
      nutritionBasis: 'direct',
    },
  ],
  photos: [{ token: 'a'.repeat(8), width: 40, height: 30, byteSize: 100, sortOrder: 0 }],
  recognition: null,
  photoPurgedAt: null,
  createdAt: '2026-09-27T03:40:00.000Z',
  updatedAt: '2026-09-27T03:40:00.000Z',
  ...over,
});

const renderAt = (path: string) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/me/meals" element={<p>목록 화면</p>} />
          <Route path="/me/meals/new" element={<MealNewPage />} />
          <Route path="/me/meals/:id" element={<p>상세 화면</p>} />
          <Route path="/me/meals/:id/edit" element={<MealEditPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe('MealEntryFormPage', () => {
  beforeEach(async () => {
    sessionStorage.clear();
    useAuthStore.setState({ token: 't', user: { ...USER }, isGuest: false });
    await setMealDraftPrincipal('u1');
    useMealDraftStore.getState().clear();
    server.use(
      http.get(ME_URL, () => HttpResponse.json(USER)),
      http.get(PRESETS_URL, () =>
        HttpResponse.json({
          presets: [{ slot: 'breakfast', time: '08:10', fromRecords: true, sampleCount: 5 }],
        }),
      ),
      http.get(FREQUENT_URL, () => HttpResponse.json({ items: [] })),
    );
  });

  it('새 기록 — 카탈로그에서 고른 음식·시각·식사 방식을 manual 출처로 저장하고 사진은 보내지 않는다', async () => {
    let body: Record<string, unknown> | null = null;
    server.use(
      http.get(FOOD_SEARCH_URL, () =>
        HttpResponse.json({
          items: [
            {
              id: 'f1',
              name: '김치찌개',
              repName: null,
              dishType: 'stew',
              mainIngredient: 'pork',
              cuisine: 'korean',
              popularity: 10,
            },
          ],
        }),
      ),
      http.post(ENTRIES_URL, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(savedEntry({ id: 'new-1', source: 'manual', photos: [] }), {
          status: 201,
        });
      }),
    );
    renderAt('/me/meals/new');

    const save = await screen.findByRole('button', { name: '저장' });
    // 이름이 빈 첫 줄만 있으면 저장할 수 없다.
    expect(save).toBeDisabled();

    const name = screen.getByLabelText('음식 이름');
    fireEvent.focus(name);
    fireEvent.change(name, { target: { value: '김치' } });
    fireEvent.click(await screen.findByRole('option', { name: /김치찌개/ }));
    expect(name).toHaveValue('김치찌개');

    fireEvent.change(screen.getByLabelText('먹은 날짜'), { target: { value: '2026-09-20' } });
    fireEvent.change(screen.getByLabelText('먹은 시각'), { target: { value: '19:40' } });
    fireEvent.click(screen.getByRole('button', { name: '저녁' }));
    fireEvent.click(screen.getByRole('button', { name: '집밥' }));
    fireEvent.change(screen.getByLabelText('메모'), { target: { value: '  혼밥  ' } });
    fireEvent.click(save);

    await waitFor(() => expect(body).not.toBeNull());
    const sent = body as unknown as {
      eatenAt: string;
      eatenDate: string;
      slot: string;
      mealType: string;
      memo: string;
      source: string;
      originRecommendationId: string | null;
      photoTokens: string[];
      items: Array<Record<string, unknown>>;
    };
    expect(sent.eatenDate).toBe('2026-09-20');
    expect(new Date(sent.eatenAt).getHours()).toBe(19);
    expect(new Date(sent.eatenAt).getMinutes()).toBe(40);
    expect(sent.slot).toBe('dinner');
    expect(sent.mealType).toBe('home');
    expect(sent.memo).toBe('혼밥');
    expect(sent.source).toBe('manual');
    expect(sent.originRecommendationId).toBeNull();
    expect(sent.photoTokens).toEqual([]);
    expect(sent.items).toEqual([
      expect.objectContaining({
        name: '김치찌개',
        foodId: 'f1',
        dishType: 'stew',
        source: 'catalog',
        catalogMatchedBy: 'food_id',
      }),
    ]);
    // 주소로 바로 열었으니 돌아갈 곳이 없어 목록으로, draft 는 비운다.
    expect(await screen.findByText('목록 화면')).toBeInTheDocument();
    expect(useMealDraftStore.getState().eatenDate).toBe('');
  });

  it('빠른 추가 — 고른 끼니로 자주 먹는 음식을 받아, 누르면 빈 첫 줄을 채우고 다시 누르면 뺀다', async () => {
    const slots: (string | null)[] = [];
    let body: { items: Array<Record<string, unknown>> } | null = null;
    server.use(
      http.get(FREQUENT_URL, ({ request }) => {
        slots.push(new URL(request.url).searchParams.get('slot'));
        return HttpResponse.json({
          items: [
            quickItem({ name: '제육볶음', foodId: 'f-jeyuk', dishType: 'stir_fry', isMain: true, count: 3, from: 'history', portion: 'large' }),
            quickItem(),
          ],
        });
      }),
      http.post(ENTRIES_URL, async ({ request }) => {
        body = (await request.json()) as { items: Array<Record<string, unknown>> };
        return HttpResponse.json(savedEntry({ id: 'new-2', source: 'manual', photos: [] }), { status: 201 });
      }),
    );
    renderAt('/me/meals/new');

    const rice = await screen.findByRole('button', { name: '공기밥' });
    expect(slots[0]).toBe(useMealDraftStore.getState().slot);
    fireEvent.click(rice);
    // 빈 첫 줄 자리에 들어가 줄이 하나뿐이다.
    expect(screen.getAllByLabelText('음식 이름')).toHaveLength(1);
    expect(screen.getByLabelText('음식 이름')).toHaveValue('공기밥');
    expect(rice).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: '제육볶음' }));
    expect(screen.getAllByLabelText('음식 이름')).toHaveLength(2);
    // 다시 누르면 뺀다.
    fireEvent.click(screen.getByRole('button', { name: '제육볶음' }));
    expect(screen.getAllByLabelText('음식 이름')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '제육볶음' }));

    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(body).not.toBeNull());
    expect(body!.items).toEqual([
      expect.objectContaining({ name: '공기밥', foodId: 'f-rice', isMain: false, source: 'catalog' }),
      expect.objectContaining({ name: '제육볶음', foodId: 'f-jeyuk', isMain: true, portion: 'large' }),
    ]);
  });

  it('평소 시각 칩은 시각과 끼니를 함께 정하고 날짜는 두고, 음식 추가로 줄을 늘린다', async () => {
    renderAt('/me/meals/new');
    fireEvent.change(await screen.findByLabelText('먹은 날짜'), { target: { value: '2026-09-21' } });
    fireEvent.click(screen.getByRole('button', { name: '아침 08:10' }));
    const s = useMealDraftStore.getState();
    expect(s.slot).toBe('breakfast');
    expect(s.eatenDate).toBe('2026-09-21');
    expect(new Date(s.eatenAt).getHours()).toBe(8);

    fireEvent.click(screen.getByRole('button', { name: /음식 추가/ }));
    expect(screen.getAllByLabelText('음식 이름')).toHaveLength(2);
  });

  it('추천에서 넘어온 draft 는 추천 출처와 원본 id 로 저장하고, 서버 거절은 화면에 남긴다', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    server.use(
      http.post(ENTRIES_URL, async ({ request }) => {
        bodies.push((await request.json()) as Record<string, unknown>);
        return HttpResponse.json(
          { statusCode: 400, error: 'Bad Request', message: '추천 후보와 일치하는 주 음식이 없습니다.' },
          { status: 400 },
        );
      }),
    );
    startMealDraftFromRecommendation(
      {
        id: 'r1',
        targetDate: '2026-09-29',
        targetSlot: 'dinner',
        items: [
          { name: '연어초밥', foodId: 'f2', dishType: 'raw_fish', mainIngredient: 'fish', cuisine: 'japanese' },
        ],
      } as unknown as MealRecommendationType,
      '연어초밥',
      'delivery',
    );
    renderAt('/me/meals/new');

    expect(await screen.findByDisplayValue('연어초밥')).toBeInTheDocument();
    expect(screen.getByText(/추천에서 고른 메뉴예요/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('추천 후보와 일치하는 주 음식이 없습니다.');
    expect(bodies[0]).toMatchObject({
      source: 'recommendation',
      originRecommendationId: 'r1',
      slot: 'dinner',
      mealType: 'delivery',
    });
    // 실패하면 입력은 그대로 남아 고쳐서 다시 저장할 수 있다.
    expect(useMealDraftStore.getState().originRecommendationId).toBe('r1');
  });

  it('탭에 쓰다 만 새 기록이 있으면 새로 열지 않고 이어 쓴다', async () => {
    useMealDraftStore.getState().start({
      eatenAt: '2026-09-28T10:00:00.000Z',
      eatenDate: '2026-09-28',
      slot: 'dinner',
      memo: '쓰던 메모',
    });
    renderAt('/me/meals/new');
    expect(await screen.findByLabelText('메모')).toHaveValue('쓰던 메모');
    expect(useMealDraftStore.getState().eatenDate).toBe('2026-09-28');
  });

  it('draft 복원 전에는 입력 화면을 열지 않고, /me 로 계정이 확정되면 연다', async () => {
    await setMealDraftPrincipal(null);
    useAuthStore.setState({ token: 't', user: null, isGuest: false });
    renderAt('/me/meals/new');
    expect(screen.getByText(/불러오는 중/)).toBeInTheDocument();
    expect(screen.queryByLabelText('음식 이름')).not.toBeInTheDocument();

    expect(await screen.findByLabelText('음식 이름')).toBeInTheDocument();
    expect(useMealDraftStore.getState().eatenDate).not.toBe('');
  });

  it('수정 — 주소로 바로 열면 서버 기록으로 채우고, 사진을 보내지 않는 PATCH 뒤 상세로 간다', async () => {
    let patch: Record<string, unknown> | null = null;
    server.use(
      http.get(`${ENTRIES_URL}/e1`, () => HttpResponse.json(savedEntry())),
      http.get('/api/v1/meals/photos/:token/thumb', () =>
        HttpResponse.arrayBuffer(new ArrayBuffer(8), { headers: { 'Content-Type': 'image/jpeg' } }),
      ),
      http.patch(`${ENTRIES_URL}/e1`, async ({ request }) => {
        patch = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(savedEntry({ memo: '팀 점심 · 수정' }));
      }),
    );
    renderAt('/me/meals/e1/edit');

    expect(await screen.findByDisplayValue('김치찌개')).toBeInTheDocument();
    expect(screen.getByText('숯토리')).toBeInTheDocument();
    expect(screen.getByText(/사진은 앱에서 추가·삭제해요/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('메모'), { target: { value: '팀 점심 · 수정' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(patch).not.toBeNull());
    expect(patch).not.toHaveProperty('photoTokens');
    expect(patch).not.toHaveProperty('source');
    expect(patch).toMatchObject({ memo: '팀 점심 · 수정', placeId: 'place-1' });
    // 인식 계보는 수정 저장에서도 빠지지 않는다.
    expect((patch as unknown as { items: unknown[] }).items[0]).toMatchObject({
      recognitionDishId: 'dish-1',
      source: 'recognized',
    });
    expect(await screen.findByText('상세 화면')).toBeInTheDocument();
  });

  it('수정 — 취소하면 draft 를 버리고 상세로 돌아간다', async () => {
    server.use(
      http.get(`${ENTRIES_URL}/e1`, () => HttpResponse.json(savedEntry({ photos: [] }))),
    );
    renderAt('/me/meals/e1/edit');
    fireEvent.click(await screen.findByRole('button', { name: '취소' }));
    expect(await screen.findByText('상세 화면')).toBeInTheDocument();
    expect(useMealDraftStore.getState().entryId).toBeNull();
  });
});
