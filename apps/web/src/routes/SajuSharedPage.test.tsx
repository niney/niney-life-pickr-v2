import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type { SharedSajuReadingType } from '@repo/api-contract';
import { computeSajuChart } from '@repo/utils';
import { server } from '~/test/msw';
import { SajuSharedPage } from './SajuSharedPage';

// 사주 공유 페이지 — 토큰 조회 → 2D 보기(원국·섹션), 404 안내.

const renderPage = (token: string) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/saju-c/s/${token}`]}>
        <Routes>
          <Route path="/saju-c/s/:token" element={<SajuSharedPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

const shared = (): SharedSajuReadingType => {
  const chart = computeSajuChart({ calendar: 'solar', year: 1990, month: 5, day: 15, hour: 14, minute: 30, gender: 'M' }, { asOf: new Date('2026-09-06T03:00:00Z') });
  const base = { status: 'ready' as const, source: 'llm' as const, model: 'fake' };
  return {
    token: 'abcdefghij',
    includeBirth: false,
    chart: chart as unknown as SharedSajuReadingType['chart'],
    sections: {
      personality: { ...base, headline: '곧게 선 무쇠', body: '성격 본문.', strengths: ['a'], cautions: ['b'] },
      year: { ...base, body: '올해 본문.', months: [] },
      cycle: { ...base, body: '흐름 본문.', current: '현재.', next: '다음.' },
      advice: { ...base, body: '조언 본문.', keyword: '결단', lucky: { element: 'wood', colors: ['초록'], directions: ['동쪽'], numbers: [3], foods: ['나물'] } },
    },
    source: 'llm',
    model: 'fake',
    createdAt: new Date().toISOString(),
  };
};

describe('SajuSharedPage', () => {
  it('공유 풀이를 2D 로 보여 주고 생년월일 숨김을 알린다', async () => {
    server.use(http.get('/api/v1/saju-c/shares/abcdefghij', () => HttpResponse.json(shared())));
    renderPage('abcdefghij');
    await waitFor(() => expect(screen.getByTestId('saju-reading-view')).toBeInTheDocument());
    expect(screen.getAllByText(/곧게 선 무쇠/).length).toBeGreaterThan(0);
    expect(screen.getByText('성격 본문.')).toBeInTheDocument();
    expect(screen.getByText(/생년월일은 공유에서 숨겨졌어요/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /나도 사주 보기/ })).toHaveAttribute('href', '/saju-c');
  });
  it('없는 토큰은 안내', async () => {
    server.use(http.get('/api/v1/saju-c/shares/nope', () => HttpResponse.json({ statusCode: 404, error: 'Not Found', message: 'x' }, { status: 404 })));
    renderPage('nope');
    await waitFor(() => expect(screen.getByText('공유 링크를 찾을 수 없어요')).toBeInTheDocument());
  });
});
