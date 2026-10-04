import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { delay, http, HttpResponse } from 'msw';
import type { OperationRunListType, OperationRunType } from '@repo/api-contract';
import { server } from '~/test/msw';
import { AdminLogsPage } from './AdminLogsPage';

// 로그 목록 — 페이지·필터를 바꿀 때 이전 목록과 페이저가 남아 있는지 본다. 예전엔 새 페이지를
// 받는 동안 목록이 스피너 한 줄로 접히고 페이저까지 사라져, 스크롤이 위로 튀고 연속으로 넘기기
// 어려웠다(훅에 keepPreviousData 없음).

const RUNS_URL = '/api/v1/admin/logs/runs';

const run = (over: Partial<OperationRunType> = {}): OperationRunType => ({
  id: 'r1',
  feature: 'crawl',
  jobId: null,
  subjectId: 'place-A',
  parentRunId: null,
  status: 'done',
  trigger: 'manual',
  errorCode: null,
  errorMessage: null,
  meta: null,
  startedAt: '2026-10-01T00:00:00.000Z',
  finishedAt: '2026-10-01T00:01:00.000Z',
  logCount: 3,
  ...over,
});

const renderPage = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}
    >
      <MemoryRouter initialEntries={['/admin/logs']}>
        <AdminLogsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe('AdminLogsPage', () => {
  it('페이지를 넘기는 동안 이전 목록과 페이저를 그대로 두고, 도착하면 바꾼다', async () => {
    // 2페이지 응답은 테스트가 풀어 줄 때까지 붙잡아 둔다.
    let releasePage2: () => void = () => {};
    const page2Held = new Promise<void>((resolve) => {
      releasePage2 = resolve;
    });
    server.use(
      http.get(RUNS_URL, async ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get('page') ?? '1');
        if (page === 2) await page2Held;
        const body: OperationRunListType = {
          items: [page === 2 ? run({ id: 'r2', subjectId: 'place-B' }) : run()],
          total: 40,
          page,
          limit: 20,
        };
        return HttpResponse.json(body);
      }),
    );
    renderPage();
    expect(await screen.findByText('대상 place-A')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '2' }));
    // 받는 중 — 스피너로 바뀌지 않고 이전 목록(흐리게)과 페이저가 남는다.
    await delay(50);
    expect(screen.queryByText('불러오는 중…')).not.toBeInTheDocument();
    expect(screen.getByText('대상 place-A').closest('ul')).toHaveClass('opacity-70');
    expect(screen.getByRole('button', { name: '2' })).toBeInTheDocument();

    releasePage2();
    expect(await screen.findByText('대상 place-B')).toBeInTheDocument();
    expect(screen.queryByText('대상 place-A')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText('대상 place-B').closest('ul')).not.toHaveClass('opacity-70'),
    );
  });

  it('첫 로드에서는 스피너를 보여 준다', async () => {
    server.use(
      http.get(RUNS_URL, async () => {
        await delay(30);
        const body: OperationRunListType = { items: [run()], total: 1, page: 1, limit: 20 };
        return HttpResponse.json(body);
      }),
    );
    renderPage();
    expect(screen.getByText('불러오는 중…')).toBeInTheDocument();
    expect(await screen.findByText('대상 place-A')).toBeInTheDocument();
    expect(screen.getByText('대상 place-A').closest('ul')).not.toHaveClass('opacity-70');
  });
});
