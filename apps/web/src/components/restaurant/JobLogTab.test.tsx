import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type { StreamLogEntry } from '@repo/shared';
import type { CrawlJobLogEntryType } from '@repo/api-contract';
import { server } from '~/test/msw';
import { JobLogTab } from './JobLogTab';

// 작업 패널의 "로그" 탭 — 그리는 행 수는 최근 500건으로 묶되, "이전 로그 더 보기" 로 가려진
// 로그를 끝까지 꺼낼 수 있어야 한다:
//  ① 실행 중 실시간 로그가 500건을 넘으면 최근 500건만 그리고, 더 보기로 100건씩 꺼낸다
//  ② 종료된 작업의 DB 로그를 이어 받을 때, 500건을 넘겨 받은 이전 페이지도 화면에 보인다 —
//     상한이 고정이던 때엔 받아 온 페이지가 상한 뒤에 가려져 버튼을 눌러도 보이는 게 없었다

const JOB = 'job-1';

// 실시간 로그 — seq 가 클수록 최신. 화면은 시간 오름차순(오래된 것이 위).
const liveLog = (seq: number): StreamLogEntry => ({
  seq,
  jobId: JOB,
  level: 'info',
  stage: 'paginating_visitor',
  message: `live ${seq}`,
  meta: null,
  at: new Date(Date.UTC(2026, 8, 2) + seq * 1000).toISOString(),
});

// DB 로그 — n 이 클수록 과거(서버는 최신 → 과거 순으로 페이지를 준다).
const dbRow = (n: number): CrawlJobLogEntryType => ({
  id: `log-${n}`,
  jobId: JOB,
  placeId: 'P1',
  stage: 'paginating_visitor',
  level: 'info',
  message: `db ${n}`,
  meta: null,
  createdAt: new Date(Date.UTC(2026, 8, 1) - n * 1000).toISOString(),
});

const useDbHandler = (total: number) => {
  const seen = { cursors: [] as Array<string | null> };
  server.use(
    http.get(`/api/v1/admin/crawl/jobs/${JOB}/logs`, ({ request }) => {
      const cursor = new URL(request.url).searchParams.get('cursor');
      seen.cursors.push(cursor);
      const start = cursor ? Number(cursor) : 0;
      const end = Math.min(total, start + 100);
      const items = Array.from({ length: end - start }, (_, i) => dbRow(start + i));
      return HttpResponse.json({ items, nextCursor: end < total ? String(end) : null });
    }),
  );
  return seen;
};

const renderTab = (props: { streamLogs: StreamLogEntry[]; isJobFinished: boolean }) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}
    >
      <JobLogTab jobId={JOB} summaryLogs={[]} {...props} />
    </QueryClientProvider>,
  );

const rowCount = (container: HTMLElement): number => container.querySelectorAll('li').length;

describe('JobLogTab', () => {
  it('실행 중 실시간 로그가 500건을 넘으면 최근 500건만 그리고, 더 보기로 꺼낸다', () => {
    const logs = Array.from({ length: 650 }, (_, i) => liveLog(i + 1));
    const { container } = renderTab({ streamLogs: logs, isJobFinished: false });

    // 건수는 전체, 그리는 것은 최근 500건(오래된 150건이 가려진다).
    expect(screen.getByText('650건 / 크롤 650 · 요약 0')).toBeInTheDocument();
    expect(rowCount(container)).toBe(500);
    expect(screen.getByText('이전 150건 생략 — 최근 500건만 표시')).toBeInTheDocument();
    expect(screen.getByText('live 650')).toBeInTheDocument();
    expect(screen.getByText('live 151')).toBeInTheDocument();
    expect(screen.queryByText('live 150')).toBeNull();

    fireEvent.click(screen.getByText('이전 로그 더 보기'));
    expect(rowCount(container)).toBe(600);
    expect(screen.getByText('이전 50건 생략 — 최근 600건만 표시')).toBeInTheDocument();

    fireEvent.click(screen.getByText('이전 로그 더 보기'));
    expect(rowCount(container)).toBe(650);
    expect(screen.getByText('live 1')).toBeInTheDocument();
    expect(screen.queryByText(/생략/)).toBeNull();
    // 실행 중에는 DB 를 조회하지 않으므로 더 꺼낼 것이 없다.
    expect(screen.queryByText('이전 로그 더 보기')).toBeNull();
  });

  it('종료된 작업의 DB 로그는 500건을 넘겨 이어 받아도 받은 페이지가 그대로 보인다', async () => {
    const seen = useDbHandler(750);
    const { container } = renderTab({ streamLogs: [], isJobFinished: true });

    await waitFor(() => expect(rowCount(container)).toBe(100));
    for (const expected of [200, 300, 400, 500, 600, 700, 750]) {
      fireEvent.click(screen.getByText('이전 로그 더 보기'));
      await waitFor(() => expect(rowCount(container)).toBe(expected));
      // 받아 온 만큼 전부 화면에 있다 — 가려진 행이 생기지 않는다.
      expect(screen.queryByText(/생략/)).toBeNull();
    }

    // 가장 오래된 로그까지 보이고, 더 받을 것이 없어 버튼이 사라진다.
    expect(screen.getByText('db 749')).toBeInTheDocument();
    expect(screen.getByText('750건 / 크롤 0 · 요약 0 · DB 750')).toBeInTheDocument();
    expect(screen.queryByText('이전 로그 더 보기')).toBeNull();
    expect(seen.cursors).toEqual([null, '100', '200', '300', '400', '500', '600', '700']);
  });
});
