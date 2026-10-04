import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { useAuthStore, useSajuProfileStore } from '@repo/shared';
import type { SajuStageProps } from '~/components/saju/SajuStage';
import type * as TarotQualityModule from '~/components/tarot/tarotQuality';
import { server } from '~/test/msw';
import { SajuPage } from './SajuPage';

// 3D 무대에 내려가는 props — jsdom 에는 WebGL 이 없어 무대 자체는 못 띄우므로, 판정을 3D 로 고정하고 무대 자리에
// props 를 기록하는 대역을 둔다. 실제 SajuStage 는 memo 라 props 가 하나도 안 바뀌면 Canvas 트리를 다시 그리지 않는다
// — 여기서는 생년월일을 고치는 동안 props 가 전부 같은 참조로 남는지를 본다.

const stage = vi.hoisted(() => ({ props: [] as Record<string, unknown>[] }));
vi.mock('~/components/tarot/tarotQuality', async (importOriginal) => {
  const original = await importOriginal<typeof TarotQualityModule>();
  return { ...original, detectTarotRender: () => ({ mode: '3d', quality: original.TAROT_QUALITY.high, reason: 'ok' }) };
});
vi.mock('~/components/saju/SajuStage', () => ({
  default: (props: Record<string, unknown>) => {
    stage.props.push(props);
    return <div data-testid="saju-stage" />;
  },
}));

const renderPage = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/saju-c']}>
        <Routes>
          <Route element={<Outlet context={{ setSubBar: () => {}, headerHeight: 56 }} />}>
            <Route path="/saju-c" element={<SajuPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  window.localStorage.clear();
  useAuthStore.setState({ token: null, user: null, isGuest: false });
  useSajuProfileStore.setState({ profiles: [], primaryId: null });
  stage.props.length = 0;
});

describe('SajuPage (3D 무대 props)', () => {
  it('생년월일을 고치는 동안 무대 props 는 전부 같은 참조다 — 사주를 세우면 단계·원국만 달라진다', async () => {
    server.use(http.post('/api/v1/saju-c/readings', () => HttpResponse.json({ statusCode: 500, error: 'x', message: 'boom' }, { status: 500 })));
    renderPage();
    await screen.findByTestId('saju-stage');
    const before = stage.props.at(-1)!;
    expect(Object.keys(before).sort()).toEqual(['callbacks', 'chart', 'focus', 'focusX', 'focusYOffset', 'phase', 'quality', 'stamped'].sort());

    fireEvent.change(screen.getByLabelText('년'), { target: { value: '1991' } });
    fireEvent.change(screen.getByLabelText('월'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('radio', { name: '여' }));
    const after = stage.props.at(-1)!;
    expect(after).not.toBe(before); // 페이지는 다시 그려졌다.
    for (const key of Object.keys(before)) expect(after[key], key).toBe(before[key]);

    // 사주 세우기 — 연출이 시작되고(3D 는 건너뛰지 않는다) 원국이 내려간다. 콜백은 그대로.
    fireEvent.click(screen.getByRole('button', { name: /사주 세우기/ }));
    const casting = stage.props.at(-1) as unknown as SajuStageProps;
    expect(casting.phase).toBe('casting');
    expect(casting.chart).not.toBeNull();
    expect(casting.stamped).toBe(0);
    expect(casting.callbacks).toBe(before.callbacks);
  });
});
