import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type { ListTarotReadingsResultType, TarotReadingResultType } from '@repo/api-contract';
import { useAuthStore } from '@repo/shared';
import { server } from '~/test/msw';
import { MyTarotPage } from './MyTarotPage';
import { MyTarotReadingPage } from './MyTarotReadingPage';

// 내 타로 기록 — 목록(더 보기·삭제 확인)과 상세(공유·삭제 후 목록 복귀).

const renderAt = (path: string) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<Outlet context={{ setSubBar: () => {}, headerHeight: 56 }} />}>
            <Route path="/me/tarot" element={<MyTarotPage />} />
            <Route path="/me/tarot/:id" element={<MyTarotReadingPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

const page1: ListTarotReadingsResultType = {
  items: [
    {
      id: 'r1',
      spreadId: 'three-sar',
      topic: 'work',
      question: '이직할까요?',
      keyword: '새 출발',
      source: 'llm',
      cards: [
        { cardId: 'major-17', reversed: false },
        { cardId: 'wands-08', reversed: true },
        { cardId: 'cups-10', reversed: false },
      ],
      createdAt: '2026-09-02T09:00:00.000Z',
    },
  ],
  nextCursor: 'r1',
};
const page2: ListTarotReadingsResultType = {
  items: [
    {
      id: 'r0',
      spreadId: 'daily',
      topic: 'general',
      question: '',
      keyword: '회복',
      source: 'static',
      cards: [{ cardId: 'swords-10', reversed: true }],
      createdAt: '2026-09-01T09:00:00.000Z',
    },
  ],
  nextCursor: null,
};

const detail: TarotReadingResultType = {
  readingId: 'r1',
  spreadId: 'three-sar',
  topic: 'work',
  question: '이직할까요?',
  choices: null,
  source: 'llm',
  model: 'fake',
  cards: [
    { cardId: 'major-17', position: 'situation', positionLabel: '상황', reversed: false, nameKo: '별', nameEn: 'The Star', keywords: ['희망'], text: '별 해석.' },
    { cardId: 'wands-08', position: 'advice', positionLabel: '조언', reversed: true, nameKo: '완드 8', nameEn: 'Eight of Wands', keywords: ['지연'], text: '완드 8 해석.' },
    { cardId: 'cups-10', position: 'outcome', positionLabel: '결과', reversed: false, nameKo: '컵 10', nameEn: 'Ten of Cups', keywords: ['행복'], text: '컵 10 해석.' },
  ],
  summary: '종합 문장.',
  advice: '조언 문장.',
  keyword: '새 출발',
  choice: null,
  menu: null,
  createdAt: '2026-09-02T09:00:00.000Z',
  quota: { remainingToday: null },
};

beforeEach(() => {
  window.localStorage.clear();
  useAuthStore.setState({ token: 'tok', user: null, isGuest: false });
});

describe('MyTarotPage', () => {
  it('목록을 보여 주고 더 보기로 다음 페이지를 붙이며, 삭제는 확인 뒤 호출한다', async () => {
    const deleted: string[] = [];
    server.use(
      http.get('/api/v1/tarot/me/readings', ({ request }) =>
        HttpResponse.json(new URL(request.url).searchParams.get('cursor') === 'r1' ? page2 : page1),
      ),
      http.delete('/api/v1/tarot/me/readings/:id', ({ params }) => {
        deleted.push(String(params.id));
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderAt('/me/tarot');
    expect(await screen.findByText('새 출발')).toBeInTheDocument();
    expect(screen.getByText('이직할까요?')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /새 출발/ })).toHaveAttribute('href', '/me/tarot/r1');

    fireEvent.click(screen.getByRole('button', { name: '더 보기' }));
    expect(await screen.findByText('회복')).toBeInTheDocument();
    expect(screen.getByText(/기본 해석/)).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: '기록 삭제' })[0]!);
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    await waitFor(() => expect(deleted).toEqual(['r1']));
  });

  it('상세는 카드·해석을 보여 주고 삭제 후 목록으로 돌아간다', async () => {
    server.use(
      http.get('/api/v1/tarot/me/readings/r1', () => HttpResponse.json(detail)),
      http.get('/api/v1/tarot/me/readings', () => HttpResponse.json(page2)),
      http.delete('/api/v1/tarot/me/readings/r1', () => new HttpResponse(null, { status: 204 })),
    );
    renderAt('/me/tarot/r1');
    expect(await screen.findByText('종합 문장.')).toBeInTheDocument();
    expect(screen.getByText('“이직할까요?”')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /공유/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /삭제/ }));
    fireEvent.click(screen.getByRole('button', { name: '정말 삭제' }));
    expect(await screen.findByText('내 타로 기록', { selector: 'h1' })).toBeInTheDocument();
  });
});
