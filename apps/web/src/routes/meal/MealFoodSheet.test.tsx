import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { setMealDraftPrincipal, useAuthStore, useMealDraftStore } from '@repo/shared';
import { server } from '~/test/msw';
import { MealNewPage } from './MealEntryFormPage';

// 휴대폰 음식 찾기 시트(2026-11-08 리뉴얼 3단계) — 입력칸 대신 시트에서 고른다. 치기 전엔 자주 먹은 음식·최근 끼니
// 통째로, 치는 중엔 '그대로 넣기' → 내 기록 → 음식 목록(1인분 열량). 이름 있는 줄은 그 줄만 바꾼다.

const USER = {
  id: 'u1',
  email: 'u@x.com',
  role: 'USER',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
} as const;

const quick = (over: Record<string, unknown>) => ({
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
  kcal: 300,
  ...over,
});

const entryItem = (id: string, name: string, kcal: number) => ({
  id,
  name,
  foodId: null,
  dishType: null,
  mainIngredient: null,
  cuisine: null,
  portion: null,
  servings: null,
  portionSource: null,
  isMain: true,
  confidence: null,
  recognitionDishId: null,
  selectedCandidateRank: null,
  catalogMatchedBy: 'none',
  catalogMatchScore: null,
  source: 'manual',
  sortOrder: 0,
  kcal,
  proteinG: null,
  sodiumMg: null,
  nutritionFrom: null,
  nutritionBasis: 'direct',
});

const recentEntry = {
  id: 'e1',
  eatenAt: '2026-11-07T10:00:00.000Z',
  eatenDate: '2026-11-07',
  slot: 'dinner',
  mealType: null,
  placeId: null,
  placeName: null,
  memo: null,
  source: 'manual',
  originRecommendationId: null,
  items: [entryItem('i1', '김치찌개', 450), entryItem('i2', '계란말이', 150)],
  photos: [],
  recognition: null,
  photoPurgedAt: null,
  createdAt: '2026-11-07T10:00:00.000Z',
  updatedAt: '2026-11-07T10:00:00.000Z',
};

const original = window.matchMedia;
const asPhone = () => {
  window.matchMedia = ((query: string) => ({
    matches: /max-width:\s*47\.99rem/.test(query),
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
};

const renderNew = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={['/meal/new']}>
        <Routes>
          <Route path="/meal/new" element={<MealNewPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

const sheet = () => screen.getByRole('dialog', { name: /음식 (찾기|바꾸기)/ });
const names = () => useMealDraftStore.getState().items.map((i) => i.name);

describe('음식 찾기 시트 — 휴대폰', () => {
  const asked: { frequent: (string | null)[]; search: (string | null)[] } = {
    frequent: [],
    search: [],
  };

  beforeEach(async () => {
    asPhone();
    asked.frequent = [];
    asked.search = [];
    sessionStorage.clear();
    useAuthStore.setState({ token: 't', user: { ...USER }, isGuest: false });
    await setMealDraftPrincipal('u1');
    useMealDraftStore.getState().clear();
    server.use(
      http.get('/api/v1/auth/me', () => HttpResponse.json(USER)),
      http.get('/api/v1/meals/time-presets', () => HttpResponse.json({ presets: [] })),
      http.get('/api/v1/meals/items/frequent', ({ request }) => {
        const q = new URL(request.url).searchParams.get('q');
        asked.frequent.push(q);
        if (q)
          return HttpResponse.json({
            items: q.includes('김치')
              ? [
                  quick({
                    name: '김치볶음밥',
                    foodId: 'f-kbb',
                    dishType: 'stir_fry',
                    isMain: true,
                    count: 3,
                    from: 'history',
                    portion: 'large',
                    kcal: 720,
                  }),
                ]
              : [],
          });
        return HttpResponse.json({
          items: [
            quick({
              name: '제육볶음',
              foodId: 'f-jeyuk',
              dishType: 'stir_fry',
              isMain: true,
              count: 4,
              from: 'history',
              kcal: 610,
            }),
            quick({}),
          ],
        });
      }),
      http.get('/api/v1/food/search', ({ request }) => {
        asked.search.push(new URL(request.url).searchParams.get('q'));
        return HttpResponse.json({
          items: [
            {
              id: 'f-kbb',
              name: '김치볶음밥',
              repName: null,
              dishType: 'stir_fry',
              mainIngredient: null,
              cuisine: 'korean',
              popularity: 9,
              servingKcal: 700,
              myCount: 3,
            },
            {
              id: 'f-kimchi',
              name: '배추김치',
              repName: null,
              dishType: 'kimchi',
              mainIngredient: 'vegetable',
              cuisine: 'korean',
              popularity: 8,
              servingKcal: 18,
              myCount: 0,
            },
          ],
        });
      }),
      http.get('/api/v1/meals', () =>
        HttpResponse.json({ items: [recentEntry], nextCursor: null }),
      ),
    );
  });
  afterEach(() => {
    window.matchMedia = original;
    useMealDraftStore.getState().clear();
  });

  it('빈 줄은 이름 입력칸 대신 음식 찾기 — 자주 먹은 음식은 빈 줄을 채우고, 최근 끼니는 통째로 넣는다', async () => {
    renderNew();
    fireEvent.click(await screen.findByRole('button', { name: '음식 찾기' }));
    expect(screen.queryByLabelText('음식 이름')).not.toBeInTheDocument();

    const panel = sheet();
    fireEvent.click(await within(panel).findByRole('button', { name: /제육볶음/ }));
    expect(names()).toEqual(['제육볶음']);
    expect(within(panel).getByRole('button', { name: /제육볶음/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    fireEvent.click(await within(panel).findByRole('button', { name: /김치찌개, 계란말이/ }));
    expect(names()).toEqual(['제육볶음', '김치찌개', '계란말이']);
    fireEvent.click(within(panel).getByRole('button', { name: '3개 · 완료' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '김치찌개 바꾸기' })).toBeInTheDocument();
  });

  it('치면 그대로 넣기·내 기록(한 글자부터)·음식 목록(두 글자부터, 1인분 열량) — 김치는 반찬으로, 엔터는 친 이름 그대로', async () => {
    renderNew();
    fireEvent.click(await screen.findByRole('button', { name: '음식 찾기' }));
    const input = within(sheet()).getByLabelText('음식 찾기');

    fireEvent.change(input, { target: { value: '김치' } });
    expect(await within(sheet()).findByText('내 기록')).toBeInTheDocument();
    expect(within(sheet()).getByRole('button', { name: /'김치' 그대로 넣기/ })).toBeInTheDocument();
    // 내 기록의 김치볶음밥은 음식 목록에서 다시 보이지 않는다.
    const catalogRow = await within(sheet()).findByRole('button', { name: /배추김치/ });
    expect(catalogRow).toHaveTextContent('18kcal');
    expect(within(sheet()).getAllByRole('button', { name: /김치볶음밥/ })).toHaveLength(1);
    expect(asked.frequent).toContain('김치');
    expect(asked.search).toContain('김치');

    fireEvent.click(catalogRow);
    const kimchi = useMealDraftStore.getState().items.find((i) => i.name === '배추김치')!;
    expect(kimchi).toMatchObject({
      foodId: 'f-kimchi',
      isMain: false,
      source: 'catalog',
      catalogMatchedBy: 'food_id',
    });

    fireEvent.change(input, { target: { value: '엄마표 김치' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(names()).toEqual(['배추김치', '엄마표 김치']);
    expect(useMealDraftStore.getState().items[1]).toMatchObject({
      foodId: null,
      source: 'manual',
      isMain: true,
    });
    // 넣고 나면 검색칸을 비워 다음 음식을 바로 친다.
    expect(input).toHaveValue('');
  });

  it('이름 있는 줄은 그 줄만 바꾸고 닫는다', async () => {
    renderNew();
    fireEvent.click(await screen.findByRole('button', { name: '음식 찾기' }));
    fireEvent.change(within(sheet()).getByLabelText('음식 찾기'), { target: { value: '라면' } });
    fireEvent.keyDown(within(sheet()).getByLabelText('음식 찾기'), { key: 'Enter' });
    fireEvent.click(within(sheet()).getByRole('button', { name: /완료/ }));

    fireEvent.click(screen.getByRole('button', { name: '라면 바꾸기' }));
    expect(within(sheet()).getByLabelText('음식 찾기')).toHaveValue('라면');
    fireEvent.change(within(sheet()).getByLabelText('음식 찾기'), {
      target: { value: '김치볶음밥' },
    });
    // 내 기록 줄(이름으로 시작) — 디바운스 동안 보이는 '그대로 넣기' 줄이 아니라.
    await within(sheet()).findByText('내 기록');
    fireEvent.click(within(sheet()).getByRole('button', { name: /^김치볶음밥/ }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(names()).toEqual(['김치볶음밥']);
    // 내 기록에서 골랐다 — 지난번 양까지 따라온다.
    expect(useMealDraftStore.getState().items[0]).toMatchObject({
      foodId: 'f-kbb',
      portion: 'large',
      source: 'catalog',
    });
  });
});
