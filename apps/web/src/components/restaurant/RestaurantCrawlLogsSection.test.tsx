import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type { CrawlJobLogEntryType } from '@repo/api-contract';
import { server } from '~/test/msw';
import { RestaurantCrawlLogsSection } from './RestaurantCrawlLogsSection';

// 어드민 상세의 "크롤 로그" 아코디언 — 한 번에 그리는 행 수를 묶은 뒤에도 로그를 끝까지 볼 수
// 있는지 본다:
//  ① DB 페이지를 "더 보기"로 이어 받으면 받은 만큼 전부 보인다(표시 상한이 새 페이지를 가리지 않는다)
//  ② 실시간(SSE) 로그가 상한을 넘으면 최근 500건만 그리고, "더 보기"로 가려진 행을 꺼낸다
//  ③ 실시간 누적은 2,000건에서 멈추고(건수 뒤 '+'), 아코디언을 닫으면 누적·표시 한도가 처음으로 돈다

// jsdom 엔 EventSource 가 없다 — 요약 SSE 매니저가 여는 연결을 잡아 log 이벤트를 흘린다.
class FakeEventSource {
  static CLOSED = 2;
  static instances: FakeEventSource[] = [];
  readyState = 1;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private listeners = new Map<string, Array<(e: MessageEvent) => void>>();
  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, fn: (e: MessageEvent) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  close() {
    this.readyState = FakeEventSource.CLOSED;
  }
  emit(type: string, data: unknown) {
    for (const fn of this.listeners.get(type) ?? []) {
      fn({ data: JSON.stringify(data) } as MessageEvent);
    }
  }
}

beforeAll(() => vi.stubGlobal('EventSource', FakeEventSource));
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {
  FakeEventSource.instances = [];
});

const PLACE = 'P1';

// DB 로그 — n 이 클수록 과거. 최신순 정렬에서 n 순서대로 놓인다.
const dbRow = (n: number): CrawlJobLogEntryType => ({
  id: `log-${n}`,
  jobId: 'job-db',
  placeId: PLACE,
  stage: 'paginating_visitor',
  level: 'info',
  message: `db ${n}`,
  meta: null,
  createdAt: new Date(Date.UTC(2026, 8, 1) - n * 1000).toISOString(),
});

// 실시간 로그 — seq 가 클수록 최신(DB 로그보다 모두 나중).
const sseLog = (seq: number) => ({
  type: 'log',
  placeId: PLACE,
  canonicalId: 'C1',
  restaurantId: 'R1',
  source: 'naver',
  jobId: 'job-live',
  level: 'info',
  stage: 'summary',
  message: `live ${seq}`,
  meta: null,
  seq,
  at: new Date(Date.UTC(2026, 8, 2) + seq * 1000).toISOString(),
});

// total 건을 100건씩 세 페이지 이하로 나눠 준다(cursor = 다음 시작 번호).
const useHandlers = (total: number) => {
  const seen = { cursors: [] as Array<string | null> };
  server.use(
    http.get(`/api/v1/admin/restaurants/place/${PLACE}/crawl-logs`, ({ request }) => {
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

const renderSection = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}
    >
      <RestaurantCrawlLogsSection placeId={PLACE} />
    </QueryClientProvider>,
  );

const header = (): HTMLElement => {
  const el = screen.getByText('크롤 로그').closest('button');
  if (!el) throw new Error('accordion header not found');
  return el;
};
const rowCount = (container: HTMLElement): number => container.querySelectorAll('li').length;

// 아코디언을 연 뒤 요약 SSE 연결이 맺어질 때까지.
const summaryStream = async (): Promise<FakeEventSource> => {
  const open = () =>
    FakeEventSource.instances.filter(
      (es) => es.url.includes('/summary-events') && es.readyState !== FakeEventSource.CLOSED,
    );
  await waitFor(() => expect(open().length).toBeGreaterThan(0));
  return open().at(-1)!;
};

const emitLogs = (es: FakeEventSource, from: number, to: number) => {
  act(() => {
    for (let seq = from; seq <= to; seq++) es.emit('log', sseLog(seq));
  });
};

describe('RestaurantCrawlLogsSection', () => {
  it('DB 페이지를 더 보기로 이어 받으면 받은 만큼 전부 보인다', async () => {
    const seen = useHandlers(250);
    const { container } = renderSection();
    // 접혀 있는 동안은 조회하지 않는다.
    expect(seen.cursors).toEqual([]);

    fireEvent.click(header());
    await waitFor(() => expect(rowCount(container)).toBe(100));
    expect(screen.getByText('100건+')).toBeInTheDocument();
    expect(screen.queryByText(/생략/)).toBeNull();

    fireEvent.click(screen.getByText('이전 로그 더 보기'));
    await waitFor(() => expect(rowCount(container)).toBe(200));

    fireEvent.click(screen.getByText('이전 로그 더 보기'));
    await waitFor(() => expect(rowCount(container)).toBe(250));
    expect(screen.getByText('db 249')).toBeInTheDocument();
    expect(screen.getByText('250건')).toBeInTheDocument();
    // 다 받았고 가려진 것도 없다 — 버튼이 사라진다.
    expect(screen.queryByText(/생략/)).toBeNull();
    expect(screen.queryByText('이전 로그 더 보기')).toBeNull();
    expect(seen.cursors).toEqual([null, '100', '200']);
  });

  it('실시간 로그가 상한을 넘으면 최근 500건만 그리고, 더 보기로 가려진 행을 꺼낸다', async () => {
    const seen = useHandlers(0);
    const { container } = renderSection();
    fireEvent.click(header());
    expect(await screen.findByText('저장된 로그가 없습니다.')).toBeInTheDocument();

    const es = await summaryStream();
    emitLogs(es, 1, 650);

    // 건수는 전체, 그리는 것은 최신 500건(가려진 것은 오래된 150건).
    expect(screen.getByText('650건')).toBeInTheDocument();
    expect(rowCount(container)).toBe(500);
    expect(screen.getByText('이전 150건 생략 — 최근 500건만 표시')).toBeInTheDocument();
    expect(screen.getByText('live 650')).toBeInTheDocument();
    expect(screen.getByText('live 151')).toBeInTheDocument();
    expect(screen.queryByText('live 150')).toBeNull();

    // 가려진 행은 이미 받아 둔 것 — 서버에 더 묻지 않고 100건씩 꺼낸다.
    const requests = seen.cursors.length;
    fireEvent.click(screen.getByText('이전 로그 더 보기'));
    expect(rowCount(container)).toBe(600);
    expect(screen.getByText('이전 50건 생략 — 최근 600건만 표시')).toBeInTheDocument();

    fireEvent.click(screen.getByText('이전 로그 더 보기'));
    expect(rowCount(container)).toBe(650);
    expect(screen.getByText('live 1')).toBeInTheDocument();
    expect(screen.queryByText(/생략/)).toBeNull();
    expect(screen.queryByText('이전 로그 더 보기')).toBeNull();
    expect(seen.cursors).toHaveLength(requests);
  });

  it('실시간 누적은 2,000건에서 멈추고, 아코디언을 닫으면 누적과 표시 한도를 비운다', async () => {
    useHandlers(0);
    const { container } = renderSection();
    fireEvent.click(header());
    expect(await screen.findByText('저장된 로그가 없습니다.')).toBeInTheDocument();

    const es = await summaryStream();
    emitLogs(es, 1, 2100);

    // 오래된 100건은 버렸다 — 건수 뒤 '+' 로 "표시된 것보다 더 있음" 을 알린다.
    expect(screen.getByText('2000건+')).toBeInTheDocument();
    expect(rowCount(container)).toBe(500);
    expect(screen.getByText('이전 1500건 생략 — 최근 500건만 표시')).toBeInTheDocument();
    expect(screen.getByText('live 2100')).toBeInTheDocument();

    fireEvent.click(screen.getByText('이전 로그 더 보기'));
    expect(rowCount(container)).toBe(600);

    // 닫았다 다시 열면 실시간 누적 없이 DB 로그(여기선 0건)부터 다시 시작한다.
    fireEvent.click(header());
    expect(rowCount(container)).toBe(0);
    fireEvent.click(header());
    expect(await screen.findByText('저장된 로그가 없습니다.')).toBeInTheDocument();
    expect(rowCount(container)).toBe(0);
    expect(screen.getByText('0건')).toBeInTheDocument();
  });
});
