import type { ReactNode } from 'react';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { useCrawlJobStream } from '@repo/shared';
import { server } from '~/test/msw';

// 크롤 잡 스트림의 종료 폴백(@repo/shared useCrawl) — 잡 목록은 완료 결과의 리뷰 본문을 비워서 내려온다(서버
// slimJobForList). 폴백이 그 축약 결과로 종료를 확정하면 리뷰가 빈 채로 남고, 뒤에 온 SSE 'done' 은 seq 가 낮아
// 버려진다 — 끝난 잡을 목록에서 열면(목록 캐시가 이미 있음) 늘 그렇게 됐다. 그래서 성공으로 끝난 잡은 단건 조회로
// 완전한 결과를 받아 종료를 합성한다. (shared 는 node 환경이라 훅 렌더가 필요한 이 테스트는 소비처인 web 에 둔다.)

// jsdom 엔 EventSource 가 없다 — 잡 SSE 연결을 잡아 이벤트를 흘린다.
class FakeEventSource {
  static CLOSED = 2;
  static instances: FakeEventSource[] = [];
  onerror: (() => void) | null = null;
  onopen: (() => void) | null = null;
  readyState = 1;
  closed = false;
  private listeners = new Map<string, Array<(e: MessageEvent) => void>>();
  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, fn: (e: MessageEvent) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  close() {
    this.closed = true;
  }
  emit(type: string, data: unknown) {
    for (const fn of this.listeners.get(type) ?? []) fn({ data: JSON.stringify(data) } as MessageEvent);
  }
}

beforeAll(() => vi.stubGlobal('EventSource', FakeEventSource));
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {
  FakeEventSource.instances = [];
});

const JOB_ID = 'job-1';
const FINISHED_AT = '2026-10-05T00:00:01.000Z';
const review = (i: number) => ({
  authorName: `작성자${i}`,
  rating: 5,
  body: `리뷰 ${i}`,
  visitedAt: '2026-09-01',
  imageUrls: [],
  videos: [],
  externalId: `ext-${i}`,
});
const fullResult = {
  ok: true as const,
  durationMs: 10,
  fetchedAt: '2026-10-05T00:00:00.000Z',
  data: { placeId: 'P1', name: '가게', visitorReviews: [review(1), review(2)] },
};
// 목록이 내려 주는 모양 — 완료 잡의 리뷰 본문은 빈 배열.
const slimResult = { ...fullResult, data: { ...fullResult.data, visitorReviews: [] } };
const job = (result: unknown, status = 'done') => ({
  id: JOB_ID,
  url: 'https://map.naver.com/p/entry/place/P1',
  placeId: 'P1',
  status,
  stage: 'done',
  startedAt: '2026-10-05T00:00:00.000Z',
  finishedAt: FINISHED_AT,
  visitorCount: 2,
  result,
});

const setup = (listed: unknown) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  // 화면(작업 목록)이 이미 받아 둔 잡 목록.
  client.setQueryData(['crawl', 'jobs'], { jobs: [listed] });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return renderHook(() => useCrawlJobStream(JOB_ID), { wrapper });
};
const reviewsOf = (result: unknown): number =>
  (result as { ok: true; data: { visitorReviews: unknown[] } }).data.visitorReviews.length;

describe('useCrawlJobStream — 종료 폴백과 목록 경량화', () => {
  it('끝난 잡을 목록 캐시가 있는 채로 열면 단건 조회 결과(리뷰 포함)로 종료를 합성한다', async () => {
    let fetched = 0;
    server.use(
      http.get(`/api/v1/admin/crawl/jobs/${JOB_ID}`, () => {
        fetched += 1;
        return HttpResponse.json(job(fullResult));
      }),
    );
    const { result } = setup(job(slimResult));
    await waitFor(() => expect(result.current.result).not.toBeNull());
    expect(result.current.status).toBe('closed');
    expect(result.current.stage).toBe('done');
    expect(reviewsOf(result.current.result)).toBe(2);
    expect(fetched).toBe(1);

    // 뒤늦게 온 SSE 재생은 무시되고(합성 종료의 seq 가 더 크다) 결과는 그대로다.
    await waitFor(() => expect(FakeEventSource.instances.length).toBeGreaterThan(0));
    act(() => {
      FakeEventSource.instances[0]!.emit('done', { type: 'done', seq: 42, at: FINISHED_AT, result: fullResult });
    });
    expect(reviewsOf(result.current.result)).toBe(2);
  });

  it('단건 조회가 끝나기 전에 SSE done 이 먼저 오면 그 결과로 끝나고, 조회 응답이 늦게 와도 리뷰는 그대로다', async () => {
    let respond: (() => void) | null = null;
    server.use(
      http.get(`/api/v1/admin/crawl/jobs/${JOB_ID}`, async () => {
        await new Promise<void>((resolve) => {
          respond = resolve;
        });
        return HttpResponse.json(job(fullResult));
      }),
    );
    const { result } = setup(job(slimResult));
    await waitFor(() => expect(FakeEventSource.instances.length).toBeGreaterThan(0));
    await waitFor(() => expect(respond).not.toBeNull());
    // 조회가 걸려 있는 동안은 종료를 합성하지 않는다(축약 결과로 확정하지 않는다).
    expect(result.current.result).toBeNull();
    act(() => {
      FakeEventSource.instances[0]!.emit('done', { type: 'done', seq: 42, at: FINISHED_AT, result: fullResult });
    });
    expect(reviewsOf(result.current.result)).toBe(2);
    await act(async () => {
      respond!();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(reviewsOf(result.current.result)).toBe(2);
  });

  it('단건 조회가 실패하면(레지스트리 만료) 목록의 축약 결과로라도 종료를 알린다', async () => {
    server.use(
      http.get(`/api/v1/admin/crawl/jobs/${JOB_ID}`, () =>
        HttpResponse.json({ statusCode: 404, error: 'Not Found', message: 'Job not found or expired' }, { status: 404 }),
      ),
    );
    const { result } = setup(job(slimResult));
    await waitFor(() => expect(result.current.result).not.toBeNull());
    expect(result.current.status).toBe('closed');
    expect(reviewsOf(result.current.result)).toBe(0);
  });

  it('실패로 끝난 잡은 단건 조회 없이 목록의 오류로 종료를 합성한다', async () => {
    // 핸들러를 걸지 않았다 — 단건 조회를 부르면 MSW 가 미처리 요청으로 실패시킨다.
    const { result } = setup(job({ ok: false, error: 'navigation_failed', message: '페이지를 열지 못했습니다' }, 'failed'));
    await waitFor(() => expect(result.current.result).not.toBeNull());
    expect(result.current.result).toEqual({ ok: false, error: 'navigation_failed', message: '페이지를 열지 못했습니다' });
    expect(result.current.status).toBe('closed');
  });
});
