import { afterAll, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type { AdminVisitorReviewType, RestaurantDetailType } from '@repo/api-contract';
import { server } from '~/test/msw';
import { ActiveJobPanel } from './ActiveJobPanel';

// 크롤 작업 패널(목록 트레이·상세 상단) — 잡 종료 처리와 상세 구독 방식을 고정한다:
//  ① 종료되면 목록·상세 무효화와 onFinished 는 잡당 한 번만. 부모가 매 렌더 새 onFinished 를
//     넘겨도(실제 호출부가 그렇다) 다시 무효화하지 않는다 — 예전엔 부모 렌더마다 목록과 상세
//     (리뷰 전량)를 다시 받아 왔다.
//  ② lazyDetail(목록 트레이) 패널은 상세를 스스로 받아 오지 않고, "미리보기" 를 눌렀을 때만 받는다.
//  ③ 이름 seed 가 없는 신규 URL 작업은 스트림이 알려 준 가게 이름을 보여 준다.

// jsdom 엔 EventSource 가 없다 — 크롤 잡 스트림과 요약 SSE 매니저가 여는 연결을 잡아 이벤트를 흘린다.
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

const JOB = 'job-1';
const PLACE = 'P1';
const AT = '2026-09-01T00:00:00.000Z';

const review = (id: string, body: string): AdminVisitorReviewType => ({
  id,
  externalId: null,
  authorName: '작성자',
  rating: 5,
  body,
  visitedAt: '2026-08-01',
  imageUrls: [],
  videos: [],
  fetchedAt: AT,
  source: 'naver',
  restaurantId: 'R-naver',
  summary: null,
});

const detail = {
  id: 'R-naver',
  placeId: PLACE,
  canonicalId: 'C1',
  name: '저장된 가게',
  reviews: [review('r1', '첫 리뷰 본문'), review('r2', '둘째 리뷰 본문')],
} as unknown as RestaurantDetailType;

const placeData = { placeId: PLACE, name: '스트림 가게', reviewCount: 2, visitorReviews: [] };

let detailRequests = 0;

const useHandlers = () => {
  detailRequests = 0;
  server.use(
    // 종료 재확인 폴백 폴링 — 잡이 아직 도는 것으로 답해 SSE 이벤트만으로 종료되게 한다.
    http.get('/api/v1/admin/crawl/jobs', () =>
      HttpResponse.json({
        jobs: [
          {
            id: JOB,
            url: 'https://naver.me/x',
            placeId: PLACE,
            status: 'running',
            stage: 'paginating_visitor',
            startedAt: AT,
            finishedAt: null,
            visitorCount: 0,
            result: null,
          },
        ],
      }),
    ),
    http.get(`/api/v1/admin/restaurants/place/${PLACE}`, () => {
      detailRequests += 1;
      return HttpResponse.json(detail);
    }),
  );
};

type PanelProps = Partial<React.ComponentProps<typeof ActiveJobPanel>>;

const renderPanel = (props: PanelProps = {}) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const invalidate = vi.spyOn(qc, 'invalidateQueries');
  const ui = (p: PanelProps) => (
    <QueryClientProvider client={qc}>
      <ActiveJobPanel
        jobId={JOB}
        placeId={PLACE}
        onPlaceIdResolved={() => {}}
        onCancel={() => {}}
        {...p}
      />
    </QueryClientProvider>
  );
  const view = render(ui(props));
  return {
    invalidate,
    // 부모 리렌더 흉내 — 실제 호출부처럼 콜백을 매번 새 함수로 넘긴다.
    rerender: (p: PanelProps) => view.rerender(ui(p)),
  };
};

const jobStream = async (): Promise<FakeEventSource> => {
  await waitFor(() =>
    expect(FakeEventSource.instances.some((es) => es.url.includes(`/crawl/jobs/${JOB}/events`))).toBe(true),
  );
  return FakeEventSource.instances.find((es) => es.url.includes(`/crawl/jobs/${JOB}/events`))!;
};

const invalidatedCount = (
  spy: MockInstance<QueryClient['invalidateQueries']>,
  key: unknown[],
): number =>
  spy.mock.calls.filter(([filters]) => JSON.stringify(filters?.queryKey) === JSON.stringify(key))
    .length;

const settle = () => new Promise((resolve) => setTimeout(resolve, 60));

describe('ActiveJobPanel', () => {
  it('종료 무효화와 onFinished 는 한 번만 — 부모가 새 콜백으로 다시 렌더돼도 반복하지 않는다', async () => {
    useHandlers();
    const first = vi.fn();
    const { invalidate, rerender } = renderPanel({ onFinished: first });

    const es = await jobStream();
    // 상세를 구독하는 기본 패널 — 마운트 시 1회 조회.
    await waitFor(() => expect(detailRequests).toBe(1));

    act(() => {
      es.emit('done', {
        seq: 9,
        type: 'done',
        at: AT,
        result: { ok: true, data: placeData, fetchedAt: AT, durationMs: 1200 },
      });
    });

    await waitFor(() => expect(first).toHaveBeenCalledTimes(1));
    expect(first.mock.calls[0]![0]).toMatchObject({ ok: true });
    expect(invalidatedCount(invalidate, ['restaurant', 'list'])).toBe(1);
    expect(invalidatedCount(invalidate, ['restaurant', 'public', 'list'])).toBe(1);
    expect(invalidatedCount(invalidate, ['restaurant', PLACE])).toBe(1);
    // 종료 무효화로 상세를 한 번 더 받는다(마운트 1 + 종료 1).
    await waitFor(() => expect(detailRequests).toBe(2));

    // 부모가 리렌더될 때마다 onFinished 가 새 함수로 온다(목록·상세 화면이 그렇다).
    const second = vi.fn();
    rerender({ onFinished: second });
    rerender({ onFinished: vi.fn() });
    rerender({ onFinished: vi.fn() });
    await settle();

    expect(second).not.toHaveBeenCalled();
    expect(invalidatedCount(invalidate, ['restaurant', 'list'])).toBe(1);
    expect(invalidatedCount(invalidate, ['restaurant', PLACE])).toBe(1);
    expect(detailRequests).toBe(2);
  });

  it('lazyDetail 패널은 상세를 스스로 받아 오지 않고, 미리보기를 눌렀을 때만 받는다', async () => {
    useHandlers();
    renderPanel({ lazyDetail: true, name: '목록의 가게' });

    await jobStream();
    await settle();
    expect(detailRequests).toBe(0);
    expect(screen.getByText('목록의 가게')).toBeInTheDocument();
    expect(screen.queryByText(/첫 리뷰 본문/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '미리보기' }));
    expect(await screen.findByText('리뷰 (2)')).toBeInTheDocument();
    expect(screen.getByText('첫 리뷰 본문')).toBeInTheDocument();
    expect(detailRequests).toBe(1);
    expect(screen.queryByRole('button', { name: '미리보기' })).toBeNull();
  });

  it('lazyDetail 패널은 종료돼도 상세를 받지 않는다(구독하지 않았으므로)', async () => {
    useHandlers();
    const onFinished = vi.fn();
    const { invalidate } = renderPanel({ lazyDetail: true, name: '목록의 가게', onFinished });

    const es = await jobStream();
    act(() => {
      es.emit('error', { seq: 3, type: 'error', at: AT, error: 'cancelled', message: '취소됨' });
    });

    await waitFor(() => expect(onFinished).toHaveBeenCalledTimes(1));
    expect(onFinished.mock.calls[0]![0]).toMatchObject({ ok: false, error: 'cancelled' });
    // 무효화 표시는 하되(다음에 상세를 열면 새로 받게), 활성 구독이 없어 요청은 나가지 않는다.
    expect(invalidatedCount(invalidate, ['restaurant', PLACE])).toBe(1);
    await settle();
    expect(detailRequests).toBe(0);
  });

  it('이름 seed 가 없는 신규 URL 작업은 스트림이 알려 준 가게 이름을 보여 준다', async () => {
    useHandlers();
    const onPlaceIdResolved = vi.fn();
    renderPanel({ lazyDetail: true, placeId: null, onPlaceIdResolved });

    const es = await jobStream();
    expect(screen.getByText('크롤링 작업')).toBeInTheDocument();

    act(() => {
      es.emit('partial', { seq: 2, type: 'partial', at: AT, data: placeData });
    });

    expect(await screen.findByText('스트림 가게')).toBeInTheDocument();
    expect(onPlaceIdResolved).toHaveBeenCalledWith(PLACE);
    // placeId 를 아직 prop 으로 받지 못한 패널이라 상세도, 미리보기 버튼도 없다.
    expect(detailRequests).toBe(0);
    expect(screen.queryByRole('button', { name: '미리보기' })).toBeNull();
  });
});
