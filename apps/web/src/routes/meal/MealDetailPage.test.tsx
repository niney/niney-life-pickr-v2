import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { setMealDraftPrincipal, useAuthStore, useMealDraftStore } from '@repo/shared';
import { server } from '~/test/msw';
import { MealDetailPage } from './MealDetailPage';

// 식단 상세(웹) — 표시, 수정·다시 기록이 채우는 draft, 삭제 확인과 요청을 고정한다.

const ENTRY_URL = '/api/v1/meals/e1';

const entry = {
  id: 'e1',
  eatenAt: '2026-09-27T03:30:00.000Z',
  eatenDate: '2026-09-27',
  slot: 'lunch',
  mealType: 'dining_out',
  placeId: 'place-1',
  placeName: '숯토리',
  memo: '팀 점심',
  source: 'manual',
  originRecommendationId: null,
  items: [
    {
      id: 'i1',
      name: '김치찌개',
      foodId: 'f1',
      dishType: 'stew',
      mainIngredient: 'pork',
      cuisine: 'korean',
      portion: 'large',
      servings: null,
      portionSource: 'vision_ordinal',
      isMain: true,
      confidence: null,
      recognitionDishId: null,
      selectedCandidateRank: null,
      catalogMatchedBy: 'food_id',
      catalogMatchScore: 1,
      source: 'catalog',
      sortOrder: 0,
      kcal: 366,
      proteinG: 24,
      sodiumMg: 1800,
      nutritionFrom: null,
      nutritionBasis: 'direct',
    },
    {
      id: 'i2',
      name: '계란말이',
      foodId: null,
      dishType: null,
      mainIngredient: null,
      cuisine: null,
      portion: null,
      servings: null,
      portionSource: null,
      isMain: false,
      confidence: null,
      recognitionDishId: null,
      selectedCandidateRank: null,
      catalogMatchedBy: 'none',
      catalogMatchScore: null,
      source: 'manual',
      sortOrder: 1,
      kcal: null,
      proteinG: null,
      sodiumMg: null,
      nutritionFrom: null,
      nutritionBasis: 'missing',
    },
  ],
  photos: [],
  recognition: null,
  photoPurgedAt: null,
  createdAt: '2026-09-27T03:40:00.000Z',
  updatedAt: '2026-09-27T03:40:00.000Z',
};

const renderDetail = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/me/meals/e1']}>
        <Routes>
          <Route path="/me/meals" element={<p>목록 화면</p>} />
          <Route path="/me/meals/new" element={<p>새 기록 화면</p>} />
          <Route path="/me/meals/:id" element={<MealDetailPage />} />
          <Route path="/me/meals/:id/edit" element={<p>수정 화면</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe('MealDetailPage', () => {
  beforeEach(async () => {
    sessionStorage.clear();
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
    await setMealDraftPrincipal('u1');
    useMealDraftStore.getState().clear();
    server.use(http.get(ENTRY_URL, () => HttpResponse.json(entry)));
  });

  it('음식·영양 합계와 반영 개수, 식당·메모·출처를 보여 준다', async () => {
    renderDetail();
    expect(await screen.findByText('김치찌개')).toBeInTheDocument();
    expect(screen.getByText('계란말이')).toBeInTheDocument();
    expect(screen.getByText(/약 366kcal/)).toBeInTheDocument();
    expect(screen.getByText(/2개 중 1개만 반영/)).toBeInTheDocument();
    expect(screen.getByText('공개된 영양 근거 없음')).toBeInTheDocument();
    expect(screen.getByText('숯토리')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '상세 보기' })).toHaveAttribute('href', '/restaurants-v2/place-1');
    expect(screen.getByText('팀 점심')).toBeInTheDocument();
    expect(screen.getByText(/직접 기록/)).toBeInTheDocument();
  });

  it('수정은 이 기록으로 draft 를 채우고 수정 화면으로 간다', async () => {
    renderDetail();
    fireEvent.click(await screen.findByRole('button', { name: /수정/ }));
    expect(await screen.findByText('수정 화면')).toBeInTheDocument();
    const s = useMealDraftStore.getState();
    expect(s.entryId).toBe('e1');
    expect(s.memo).toBe('팀 점심');
    expect(s.items.map((item) => item.name)).toEqual(['김치찌개', '계란말이']);
  });

  it('다시 기록은 사진·메모를 뺀 새 draft 로 새 기록 화면에 간다', async () => {
    renderDetail();
    fireEvent.click(await screen.findByRole('button', { name: /다시 기록/ }));
    expect(await screen.findByText('새 기록 화면')).toBeInTheDocument();
    const s = useMealDraftStore.getState();
    expect(s.entryId).toBeNull();
    expect(s.memo).toBe('');
    expect(s.placeName).toBe('숯토리');
    expect(s.items).toHaveLength(2);
  });

  it('삭제는 확인 뒤에만 요청하고, 성공하면 목록으로 가며 이 기록을 고치던 draft 도 버린다', async () => {
    let deleted = 0;
    server.use(
      http.delete(ENTRY_URL, () => {
        deleted += 1;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    useMealDraftStore.getState().start({ entryId: 'e1', eatenDate: '2026-09-27', memo: '고치던 중' });
    renderDetail();
    fireEvent.click(await screen.findByRole('button', { name: /삭제/ }));
    const dialog = screen.getByRole('alertdialog', { name: '기록 삭제' });
    expect(deleted).toBe(0);

    fireEvent.click(within(dialog).getByRole('button', { name: '삭제' }));
    await waitFor(() => expect(deleted).toBe(1));
    expect(await screen.findByText('목록 화면')).toBeInTheDocument();
    expect(useMealDraftStore.getState().entryId).toBeNull();
  });

  it('없는 기록이면 찾을 수 없다고 알린다', async () => {
    server.use(
      http.get(ENTRY_URL, () =>
        HttpResponse.json(
          { statusCode: 404, error: 'Not Found', message: '기록을 찾을 수 없습니다.' },
          { status: 404 },
        ),
      ),
    );
    renderDetail();
    expect(await screen.findByText('기록을 찾을 수 없어요.')).toBeInTheDocument();
  });
});
