import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { delay, http, HttpResponse } from 'msw';
import { useAuthStore } from '@repo/shared';
import { server } from '~/test/msw';
import { SettlementHistoryPage } from './SettlementHistoryPage';
import { settlementSummary } from './testFixtures';

// /me/settlements — 정산 이력. 여기서 고정하는 것:
//  - 페이지를 넘기는 동안 직전 페이지와 페이저가 그대로 남는다(예전엔 새 페이지 응답이
//    올 때까지 둘 다 사라져 스크롤이 위로 튀었다).
//  - 여러 건 삭제는 목록을 끝난 뒤 한 번만 다시 조회한다(예전엔 건마다).

const SETTLEMENTS_URL = '/api/v1/settlements';
const DRAFTS_URL = '/api/v1/settlement-drafts';

const TOTAL = 25;
const pageItems = (offset: number, limit: number) =>
  Array.from({ length: Math.min(limit, TOTAL - offset) }, (_, i) => {
    const n = offset + i + 1;
    return settlementSummary({ id: `s${n}`, restaurantName: `식당${n}번` });
  });

// 목록·임시저장·삭제 핸들러. 2페이지 응답은 일부러 늦춰 "넘기는 동안" 을 관찰한다.
const useHandlers = () => {
  const calls = { list: [] as number[], deleted: [] as string[] };
  server.use(
    http.get(SETTLEMENTS_URL, async ({ request }) => {
      const sp = new URL(request.url).searchParams;
      const offset = Number(sp.get('offset') ?? 0);
      const limit = Number(sp.get('limit') ?? 20);
      calls.list.push(offset);
      if (offset > 0) await delay(120);
      return HttpResponse.json({ items: pageItems(offset, limit), total: TOTAL });
    }),
    http.get(DRAFTS_URL, () => HttpResponse.json({ items: [] })),
    http.delete(`${SETTLEMENTS_URL}/:id`, async ({ params }) => {
      calls.deleted.push(String(params.id));
      // 응답이 한꺼번에 오지 않게 흩뜨린다 — 건마다 무효화했다면 재조회가 겹쳐 드러난다.
      await delay(10 * calls.deleted.length);
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return calls;
};

const renderPage = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <SettlementHistoryPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

// Pager 는 데스크톱·모바일 두 벌을 함께 렌더한다(CSS 로 하나만 보임) — 첫 번째를 쓴다.
const nextPageButton = () => screen.getAllByRole('button', { name: '다음 페이지' })[0]!;

describe('SettlementHistoryPage', () => {
  beforeEach(() => {
    useAuthStore.setState({ token: 'test-token', user: null, isGuest: false });
  });

  it('페이지를 넘기는 동안 직전 페이지와 페이저가 남아 있고, 응답이 오면 교체된다', async () => {
    useHandlers();
    renderPage();
    expect(await screen.findByText('식당1번')).toBeInTheDocument();

    fireEvent.click(nextPageButton());

    // 아직 2페이지 응답 전 — 목록·페이저가 사라지지 않고, 목록은 "바뀌는 중" 으로 표시된다.
    const list = screen.getByText('식당1번').closest('ul')!;
    expect(list).toHaveAttribute('aria-busy', 'true');
    expect(list).toHaveClass('opacity-60', 'pointer-events-none');
    expect(nextPageButton()).toBeInTheDocument();
    // 목록 자리에 로딩 스피너가 대신 들어서지 않는다.
    expect(screen.queryByText(/불러오는 중/)).not.toBeInTheDocument();

    expect(await screen.findByText('식당21번')).toBeInTheDocument();
    expect(screen.queryByText('식당1번')).not.toBeInTheDocument();
    expect(screen.getByText('식당21번').closest('ul')).toHaveAttribute('aria-busy', 'false');
  });

  it('여러 건을 지워도 목록은 끝난 뒤 한 번만 다시 조회한다', async () => {
    const calls = useHandlers();
    renderPage();
    await screen.findByText('식당1번');
    expect(calls.list).toEqual([0]);

    fireEvent.click(screen.getByRole('checkbox', { name: '식당1번 선택' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '식당2번 선택' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '식당3번 선택' }));
    fireEvent.click(screen.getByRole('button', { name: /3개 삭제/ }));

    const dialog = screen.getByRole('alertdialog', { name: '선택한 3개를 삭제할까요?' });
    fireEvent.click(within(dialog).getByRole('button', { name: '3개 삭제' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect([...calls.deleted].sort()).toEqual(['s1', 's2', 's3']);
    // 처음 1번 + 삭제가 전부 끝난 뒤 1번. 건마다 무효화했다면 4번이 된다.
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(calls.list).toEqual([0, 0]);
  });
});
