import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type { SharedTarotReadingType } from '@repo/api-contract';
import { server } from '~/test/msw';
import { TarotSharedPage } from './TarotSharedPage';

// 타로 공유 페이지 — 토큰 조회 결과(카드·해석·키워드) 표시, 없는 토큰 안내.

const renderPage = (token: string) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/tarot/s/${token}`]}>
        <Routes>
          <Route element={<Outlet context={{ setSubBar: () => {}, headerHeight: 56 }} />}>
            <Route path="/tarot/s/:token" element={<TarotSharedPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

const shared: SharedTarotReadingType = {
  token: 'abcDEF1234',
  includeQuestion: true,
  spreadId: 'three-sar',
  topic: 'work',
  question: '이직할까요?',
  choices: null,
  source: 'llm',
  model: 'fake',
  cards: [
    { cardId: 'major-17', position: 'situation', positionLabel: '상황', reversed: false, nameKo: '별', nameEn: 'The Star', keywords: ['희망'], text: '별 해석입니다.' },
    { cardId: 'wands-08', position: 'advice', positionLabel: '조언', reversed: true, nameKo: '완드 8', nameEn: 'Eight of Wands', keywords: ['지연'], text: '완드 8 해석입니다.' },
    { cardId: 'cups-10', position: 'outcome', positionLabel: '결과', reversed: false, nameKo: '컵 10', nameEn: 'Ten of Cups', keywords: ['행복'], text: '컵 10 해석입니다.' },
  ],
  summary: '종합 문장입니다.',
  advice: '조언 문장입니다.',
  keyword: '새 출발',
  choice: null,
  menu: null,
  createdAt: new Date().toISOString(),
};

describe('TarotSharedPage', () => {
  it('공유 리딩을 카드·해석·키워드와 함께 보여 준다', async () => {
    server.use(http.get('/api/v1/tarot/shares/abcDEF1234', () => HttpResponse.json(shared)));
    renderPage('abcDEF1234');
    expect(await screen.findByText('종합 문장입니다.')).toBeInTheDocument();
    expect(screen.getByText('“이직할까요?”')).toBeInTheDocument();
    expect(screen.getAllByText('별').length).toBeGreaterThan(0);
    expect(screen.getByText('새 출발')).toBeInTheDocument();
    expect(screen.getByText('AI 해석')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /세로 이미지 저장/ })).toHaveAttribute(
      'href',
      '/tarot/s/abcDEF1234/image.png?format=story',
    );
    expect(screen.getByRole('link', { name: /나도 타로 보기/ })).toHaveAttribute('href', '/tarot');
  });

  it('없는 토큰은 안내와 타로 진입 링크', async () => {
    server.use(
      http.get('/api/v1/tarot/shares/nope', () =>
        HttpResponse.json({ statusCode: 404, error: 'Not Found', message: 'x' }, { status: 404 }),
      ),
    );
    renderPage('nope');
    expect(await screen.findByText('공유 링크를 찾을 수 없어요')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '나도 타로 보기' })).toBeInTheDocument();
  });
});
