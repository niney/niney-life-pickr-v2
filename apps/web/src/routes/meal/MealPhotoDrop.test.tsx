import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { setMealDraftPrincipal, useAuthStore, useMealDraftStore } from '@repo/shared';
import { server } from '~/test/msw';
import MealApp from './MealApp';

// 사진으로 어디서든 기록 시작(2026-11-08 리뉴얼 4단계) — 식단 화면 아무 데나 사진을 놓거나 붙여넣으면 새 기록을 열어
// 그 사진을 넣고, 입력 화면이 떠 있으면 그 기록에 넣는다. 사진 칸 위에 놓은 것은 칸이 맡아 두 번 넣지 않는다.

const USER = {
  id: 'u1',
  email: 'u@x.com',
  role: 'USER',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
} as const;

const Where = () => <output data-testid="where">{useLocation().pathname}</output>;

const photo = (name: string) => new File(['jpeg'], name, { type: 'image/jpeg' });
const dropOn = (target: Window | Element, files: File[]) => {
  fireEvent.dragEnter(target, { dataTransfer: { types: ['Files'], files } });
  fireEvent.dragOver(target, { dataTransfer: { types: ['Files'], files } });
  fireEvent.drop(target, { dataTransfer: { types: ['Files'], files } });
};

describe('사진으로 어디서든 기록 시작', () => {
  const state = { uploads: 0 };

  beforeEach(async () => {
    state.uploads = 0;
    sessionStorage.clear();
    useAuthStore.setState({ token: 't', user: { ...USER }, isGuest: false });
    await setMealDraftPrincipal('u1');
    useMealDraftStore.getState().clear();
    server.use(
      http.get('/api/v1/auth/me', () => HttpResponse.json(USER)),
      http.get('/api/v1/meals', () => HttpResponse.json({ items: [], nextCursor: null })),
      http.get('/api/v1/meals/time-presets', () => HttpResponse.json({ presets: [] })),
      http.get('/api/v1/meals/items/frequent', () => HttpResponse.json({ items: [] })),
      http.post('/api/v1/meals/photos', () => {
        state.uploads += 1;
        return HttpResponse.json({
          token: `tok-${state.uploads}`,
          previewUrl: '',
          thumbUrl: '',
          width: 10,
          height: 10,
          byteSize: 100,
        });
      }),
      http.get('/api/v1/meals/photos/:token/thumb', () =>
        HttpResponse.arrayBuffer(new ArrayBuffer(8), { headers: { 'Content-Type': 'image/jpeg' } }),
      ),
      http.post('/api/v1/meals/recognize', () => HttpResponse.json({ dishes: [] })),
    );
  });
  afterEach(() => useMealDraftStore.getState().clear());

  const renderApp = () =>
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={['/meal/records']}>
          <Routes>
            <Route path="/meal/*" element={<MealApp />} />
          </Routes>
          <Where />
        </MemoryRouter>
      </QueryClientProvider>,
    );

  it('목록에 사진을 놓으면 새 기록을 열어 그 사진을 넣고, 열린 기록에는 화면 어디에 놓아도 더하며 사진 칸 위는 한 번만', async () => {
    renderApp();
    await screen.findByText(/아직 기록이 없어요/);

    // 끄는 동안 안내가 뜨고, 놓으면 사라진다.
    fireEvent.dragEnter(window, { dataTransfer: { types: ['Files'], files: [] } });
    expect(await screen.findByText('사진을 놓으면 새 기록을 시작해요')).toBeInTheDocument();
    dropOn(window, [photo('a.jpg')]);
    expect(screen.queryByText('사진을 놓으면 새 기록을 시작해요')).not.toBeInTheDocument();

    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/meal/new'));
    await waitFor(() => expect(useMealDraftStore.getState().photos.map((p) => p.token)).toEqual(['tok-1']));

    // 열린 기록 — 사진 칸 밖(창)에 놓아도 이 기록에 더한다.
    dropOn(window, [photo('b.jpg')]);
    await waitFor(() => expect(useMealDraftStore.getState().photos).toHaveLength(2));

    // 사진 칸 위에 놓은 것은 칸이 맡는다 — 창이 한 번 더 넣지 않는다.
    dropOn(await screen.findByText('사진 추가'), [photo('c.jpg')]);
    await waitFor(() => expect(useMealDraftStore.getState().photos).toHaveLength(3));
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(state.uploads).toBe(3);
  });

  it('목록에서 사진을 붙여넣어도 새 기록으로 시작하고, 글자 붙여넣기는 건드리지 않는다', async () => {
    renderApp();
    await screen.findByText(/아직 기록이 없어요/);
    fireEvent.paste(document, { clipboardData: { files: [] } });
    expect(screen.getByTestId('where').textContent).toBe('/meal/records');

    fireEvent.paste(document, { clipboardData: { files: [photo('pasted.png')] } });
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/meal/new'));
    await waitFor(() => expect(useMealDraftStore.getState().photos.map((p) => p.token)).toEqual(['tok-1']));
    expect(state.uploads).toBe(1);
  });
});
