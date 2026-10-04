import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore, useTarotHistoryStore } from '@repo/shared';
import type { TarotStageProps } from '~/components/tarot/TarotStage';
import type * as TarotQualityModule from '~/components/tarot/tarotQuality';
import { TarotPage } from './TarotPage';

// 3D 무대에 내려가는 props — jsdom 에는 WebGL 이 없어 무대 자체는 못 띄우므로, 판정을 3D 로 고정하고 무대 자리에
// props 를 기록하는 대역을 둔다. 실제 TarotStage 는 memo 라 props 가 하나도 안 바뀌면 Canvas 트리를 다시 그리지 않는다
// — 여기서는 설정 폼을 만지는 동안 props 가 전부 같은 참조로 남는지를 본다.

const stage = vi.hoisted(() => ({ props: [] as Record<string, unknown>[] }));
vi.mock('~/components/tarot/tarotQuality', async (importOriginal) => {
  const original = await importOriginal<typeof TarotQualityModule>();
  return { ...original, detectTarotRender: () => ({ mode: '3d', quality: original.TAROT_QUALITY.high, reason: 'ok' }) };
});
vi.mock('~/components/tarot/TarotStage', () => ({
  default: (props: Record<string, unknown>) => {
    stage.props.push(props);
    return <div data-testid="tarot-stage" />;
  },
}));

const renderPage = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/tarot']}>
        <Routes>
          <Route element={<Outlet context={{ setSubBar: () => {}, headerHeight: 56 }} />}>
            <Route path="/tarot" element={<TarotPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  window.localStorage.clear();
  useAuthStore.setState({ token: null, user: null, isGuest: false });
  useTarotHistoryStore.setState({ entries: [] });
  stage.props.length = 0;
});

describe('TarotPage (3D 무대 props)', () => {
  it('설정 폼을 만지는 동안 무대 props 는 전부 같은 참조다 — 무대가 보는 값이 바뀔 때만 달라진다', async () => {
    renderPage();
    await screen.findByTestId('tarot-stage');
    const before = stage.props.at(-1)!;
    expect(Object.keys(before).sort()).toEqual(
      ['callbacks', 'deckOrder', 'drawn', 'focusX', 'focusYOffset', 'phase', 'picked', 'quality', 'revealed', 'total'].sort(),
    );

    fireEvent.change(screen.getByLabelText('질문'), { target: { value: '이직할까요?' } });
    fireEvent.click(screen.getByRole('button', { name: '일·공부' }));
    fireEvent.click(screen.getByLabelText('역방향 카드 사용'));
    const after = stage.props.at(-1)!;
    expect(after).not.toBe(before); // 페이지는 다시 그려졌다.
    for (const key of Object.keys(before)) expect(after[key], key).toBe(before[key]);

    // 섞기 — 단계와 덱이 내려간다. 콜백은 그대로라 무대 안의 컨텍스트가 흔들리지 않는다.
    fireEvent.click(screen.getByRole('button', { name: /카드 섞기/ }));
    const shuffling = stage.props.at(-1) as unknown as TarotStageProps;
    expect(shuffling.phase).toBe('shuffling');
    expect(shuffling.deckOrder).toHaveLength(78);
    expect(shuffling.total).toBe(3);
    expect(shuffling.callbacks).toBe(before.callbacks);
  });
});
