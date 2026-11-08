import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { setMealDraftPrincipal, useAuthStore, useMealDraftStore } from '@repo/shared';
import { server } from '~/test/msw';
import MealApp from './MealApp';

// 데스크톱 겹침 패널(2026-11-08 리뉴얼 3단계) — 기록 줄을 누르면 목록 위에 상세 패널(비모달), 다른 줄·↑↓ 는 내용만
// 바꾸고(뒤로 = 닫기), 수정·새 기록은 모달 패널(뒤 화면 inert), 고친 내용은 닫을 때 묻는다.

const USER = {
  id: 'u1',
  email: 'u@x.com',
  role: 'USER',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
} as const;

const item = (id: string, name: string, kcal: number) => ({
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
  proteinG: 20,
  sodiumMg: 900,
  nutritionFrom: null,
  nutritionBasis: 'direct',
});

const entry = (id: string, slot: string, hour: string, food: string, kcal: number) => ({
  id,
  eatenAt: `2026-09-27T${hour}:00:00.000Z`,
  eatenDate: '2026-09-27',
  slot,
  mealType: null,
  placeId: null,
  placeName: null,
  memo: null,
  source: 'manual',
  originRecommendationId: null,
  items: [item(`${id}-i`, food, kcal)],
  photos: [],
  recognition: null,
  photoPurgedAt: null,
  createdAt: '2026-09-27T12:00:00.000Z',
  updatedAt: '2026-09-27T12:00:00.000Z',
});

const ENTRIES = {
  e1: entry('e1', 'lunch', '03', '김치찌개', 450),
  e2: entry('e2', 'dinner', '10', '연어덮밥', 620),
} as const;

// 데스크톱(1024px 이상) — 식단이 패널을 쓰는 폭. 다른 미디어 쿼리(움직임 줄이기 등)는 아니라고 답한다.
const original = window.matchMedia;
const asDesktop = () => {
  window.matchMedia = ((query: string) => ({
    matches: /min-width:\s*64rem/.test(query),
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
};

const Where = () => <output data-testid="where">{useLocation().pathname}</output>;

const renderApp = (path = '/meal/records') =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/meal/*" element={<MealApp />} />
        </Routes>
        <Where />
      </MemoryRouter>
    </QueryClientProvider>,
  );

const where = () => screen.getByTestId('where').textContent;
const panel = () => screen.getByRole('dialog');

describe('식단 패널 — 데스크톱', () => {
  beforeEach(async () => {
    asDesktop();
    sessionStorage.clear();
    useAuthStore.setState({ token: 't', user: { ...USER }, isGuest: false });
    await setMealDraftPrincipal('u1');
    useMealDraftStore.getState().clear();
    server.use(
      http.get('/api/v1/auth/me', () => HttpResponse.json(USER)),
      http.get('/api/v1/meals', () =>
        HttpResponse.json({ items: [ENTRIES.e1, ENTRIES.e2], nextCursor: null }),
      ),
      http.get('/api/v1/meals/stats', () =>
        HttpResponse.json({
          entryCount: 2,
          recordedDays: 1,
          streakDays: 1,
          nutrition: { avgKcalPerDay: null },
        }),
      ),
      http.get('/api/v1/meals/time-presets', () => HttpResponse.json({ presets: [] })),
      http.get('/api/v1/meals/items/frequent', () => HttpResponse.json({ items: [] })),
      http.get('/api/v1/meals/:id', ({ params }) => {
        const found = ENTRIES[params.id as keyof typeof ENTRIES];
        return found
          ? HttpResponse.json(found)
          : HttpResponse.json(
              { statusCode: 404, error: 'Not Found', message: '없음' },
              { status: 404 },
            );
      }),
    );
  });
  afterEach(() => {
    window.matchMedia = original;
    useMealDraftStore.getState().clear();
  });

  it('기록 줄을 누르면 목록 위에 상세 패널이 뜨고, 다른 줄은 내용만 바꾸며, 닫으면 한 번에 목록으로 돌아간다', async () => {
    renderApp();
    fireEvent.click(await screen.findByRole('link', { name: /김치찌개/ }));

    // 처음 여는 상세는 화면 조각을 받는 동안 '불러오는 중' 패널이 먼저 뜬다 — 제목이 이름인 패널을 기다린다.
    expect(await screen.findByRole('dialog', { name: /점심$/ })).toBeInTheDocument();
    // 비모달 — 뒤 목록이 그대로 있고 눌러진다.
    expect(panel()).not.toHaveAttribute('aria-modal');
    expect(screen.getByRole('heading', { level: 1, name: '기록' })).toBeInTheDocument();
    expect(where()).toBe('/meal/e1');

    fireEvent.click(screen.getByRole('link', { name: /연어덮밥/ }));
    expect(await within(panel()).findByRole('heading', { name: /저녁$/ })).toBeInTheDocument();
    expect(where()).toBe('/meal/e2');

    fireEvent.click(within(panel()).getByRole('button', { name: '닫기' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(where()).toBe('/meal/records');
  });

  it('↓ 는 목록의 다음 기록, ↑ 는 이전 기록, Esc 는 닫기', async () => {
    renderApp();
    fireEvent.click(await screen.findByRole('link', { name: /김치찌개/ }));
    await within(panel()).findByRole('heading', { name: /점심$/ });
    expect(within(panel()).getByRole('button', { name: '이전 기록' })).toBeDisabled();

    fireEvent.keyDown(window, { key: 'ArrowDown' });
    expect(await within(panel()).findByRole('heading', { name: /저녁$/ })).toBeInTheDocument();
    expect(within(panel()).getByRole('button', { name: '다음 기록' })).toBeDisabled();
    fireEvent.keyDown(window, { key: 'ArrowUp' });
    expect(await within(panel()).findByRole('heading', { name: /점심$/ })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(where()).toBe('/meal/records');
  });

  it('수정은 모달 패널(뒤 화면 막힘) — 고친 내용이 있으면 닫을 때 묻고, 버리면 상세 패널로 돌아간다', async () => {
    renderApp();
    fireEvent.click(await screen.findByRole('link', { name: /김치찌개/ }));
    fireEvent.click(await within(panel()).findByRole('button', { name: '수정' }));

    const form = await screen.findByRole('dialog', { name: '식단 수정' });
    expect(form).toHaveAttribute('aria-modal', 'true');
    expect(
      screen.getByRole('heading', { level: 1, name: '기록' }).closest('[inert]'),
    ).not.toBeNull();
    expect(where()).toBe('/meal/e1/edit');

    fireEvent.change(within(form).getByLabelText('메모'), { target: { value: '고치는 중' } });
    fireEvent.click(within(form).getByRole('button', { name: '닫기' }));
    const ask = screen.getByRole('alertdialog', { name: '고친 내용 버리기' });
    fireEvent.click(within(ask).getByRole('button', { name: '계속 고치기' }));
    expect(screen.getByRole('dialog', { name: '식단 수정' })).toBeInTheDocument();

    // Esc 도 같은 확인을 거친다(확인 창이 떠 있으면 Esc 는 확인 창 몫).
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(
      within(screen.getByRole('alertdialog', { name: '고친 내용 버리기' })).getByRole('button', {
        name: '버리고 닫기',
      }),
    );
    expect(await within(panel()).findByRole('heading', { name: /점심$/ })).toBeInTheDocument();
    expect(where()).toBe('/meal/e1');
    expect(useMealDraftStore.getState().entryId).toBeNull();
  });

  it('새 기록은 모달 패널 — 저장하면 같은 배경 위에 방금 만든 기록의 상세 패널을 띄운다', async () => {
    let body: { items: Array<{ name: string }> } | null = null;
    server.use(
      http.post('/api/v1/meals', async ({ request }) => {
        body = (await request.json()) as typeof body;
        return HttpResponse.json(entry('new-1', 'dinner', '11', '비빔밥', 600), { status: 201 });
      }),
      http.get('/api/v1/meals/new-1', () =>
        HttpResponse.json(entry('new-1', 'dinner', '11', '비빔밥', 600)),
      ),
    );
    renderApp();
    await screen.findByRole('link', { name: /김치찌개/ });
    fireEvent.click(screen.getAllByRole('link', { name: '기록하기' })[0]!);

    fireEvent.change(await screen.findByLabelText('음식 이름'), { target: { value: '비빔밥' } });
    const form = screen.getByRole('dialog', { name: '식단 기록' });
    expect(form).toHaveAttribute('aria-modal', 'true');
    fireEvent.click(within(form).getByRole('button', { name: '저장' }));

    await waitFor(() => expect(body?.items.map((i) => i.name)).toEqual(['비빔밥']));
    const detail = await screen.findByRole('dialog', { name: /저녁$/ });
    expect(within(detail).getByText('비빔밥')).toBeInTheDocument();
    expect(detail).not.toHaveAttribute('aria-modal');
    expect(where()).toBe('/meal/new-1');
    // 새 기록 패널 자리를 상세로 바꿨다 — 닫으면 처음 배경(목록)으로.
    fireEvent.click(within(panel()).getByRole('button', { name: '닫기' }));
    await waitFor(() => expect(where()).toBe('/meal/records'));
  });

  it('주소로 바로 연 상세는 패널이 아니라 한 화면으로 연다', async () => {
    renderApp('/meal/e1');
    expect(await screen.findByRole('heading', { level: 1, name: /점심$/ })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
