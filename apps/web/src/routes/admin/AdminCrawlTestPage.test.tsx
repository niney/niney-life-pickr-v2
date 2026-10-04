import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type { NaverPlaceDataType, VisitorReviewType } from '@repo/api-contract';
import { server } from '~/test/msw';
import { AdminCrawlTestPage } from './AdminCrawlTestPage';

// 크롤 테스트 화면 — 완료 결과(방문자 리뷰 전량 포함)를 한꺼번에 DOM 에 올리지 않게 한 두 곳을 본다:
//  ① "원본 응답" JSON 은 접힌 상태가 기본이고, 펼쳤을 때만 문자열화해 그린다
//  ② 방문자 리뷰는 50건까지만 그리고 "더 보기"로 늘린다(제목의 건수는 전체 그대로)

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

const visitorReview = (n: number): VisitorReviewType => ({
  authorName: `작성자${n}`,
  rating: 5,
  body: `방문 리뷰 ${n}`,
  visitedAt: '2026-08-01',
  imageUrls: [],
  videos: [],
});

const placeData = (visitorCount: number): NaverPlaceDataType => ({
  placeId: PLACE,
  name: '테스트 식당',
  category: '한식',
  address: '서울 강남구',
  roadAddress: null,
  phone: null,
  businessHours: null,
  latitude: 37.5,
  longitude: 127.0,
  imageUrls: [],
  rating: 4.5,
  reviewCount: visitorCount,
  menus: [],
  reviewStats: null,
  blogReviews: [],
  visitorReviews: Array.from({ length: visitorCount }, (_, i) => visitorReview(i + 1)),
  rawSourceUrl: 'https://m.place.naver.com/restaurant/P1',
});

const useHandlers = () =>
  server.use(
    http.get('/api/v1/admin/crawl/jobs', () => HttpResponse.json({ jobs: [] })),
    // 아직 DB 에 없는 가게 — 상세 훅은 404 를 null 로 받는다("저장된 리뷰" 카드는 안 뜬다).
    http.get(`/api/v1/admin/restaurants/place/${PLACE}`, () =>
      HttpResponse.json({ message: 'not found' }, { status: 404 }),
    ),
  );

const renderPage = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}
    >
      <MemoryRouter initialEntries={[`/admin/crawl-test/${JOB}`]}>
        <Routes>
          <Route path="/admin/crawl-test/:jobId?" element={<AdminCrawlTestPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

// 잡 스트림에 완료 이벤트를 흘려 결과 화면을 띄운다.
const finishJob = async (data: NaverPlaceDataType) => {
  await waitFor(() =>
    expect(FakeEventSource.instances.some((es) => es.url.includes(`/crawl/jobs/${JOB}/events`))).toBe(true),
  );
  const es = FakeEventSource.instances.find((s) => s.url.includes(`/crawl/jobs/${JOB}/events`))!;
  act(() => {
    es.emit('done', {
      seq: 9,
      type: 'done',
      at: AT,
      result: { ok: true, data, fetchedAt: AT, durationMs: 1200 },
    });
  });
  expect(await screen.findByText('파싱된 데이터')).toBeInTheDocument();
};

const visitorRows = (): number => screen.queryAllByText(/^방문 리뷰 \d+$/).length;

describe('AdminCrawlTestPage', () => {
  it('원본 응답 JSON 은 접힌 채로 시작하고, 펼쳤을 때만 그린다', async () => {
    useHandlers();
    const { container } = renderPage();
    await finishJob(placeData(3));

    expect(screen.getByText('원본 응답')).toBeInTheDocument();
    expect(screen.getByText('펼치기')).toBeInTheDocument();
    expect(container.querySelector('pre')).toBeNull();

    fireEvent.click(screen.getByText('원본 응답'));
    const pre = container.querySelector('pre');
    expect(pre).not.toBeNull();
    expect(JSON.parse(pre!.textContent ?? '')).toMatchObject({ placeId: PLACE, name: '테스트 식당' });
    expect(screen.getByText('접기')).toBeInTheDocument();

    fireEvent.click(screen.getByText('원본 응답'));
    expect(container.querySelector('pre')).toBeNull();
    expect(screen.getByText('펼치기')).toBeInTheDocument();
  });

  it('방문자 리뷰는 50건까지만 그리고 더 보기로 늘린다', async () => {
    useHandlers();
    renderPage();
    await finishJob(placeData(120));

    // 제목의 건수는 전체, 그리는 것은 50건.
    expect(screen.getByText('(120)')).toBeInTheDocument();
    expect(visitorRows()).toBe(50);
    expect(screen.getByText('방문 리뷰 50')).toBeInTheDocument();
    expect(screen.queryByText('방문 리뷰 51')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '70개 더 보기' }));
    expect(visitorRows()).toBe(100);

    fireEvent.click(screen.getByRole('button', { name: '20개 더 보기' }));
    expect(visitorRows()).toBe(120);
    expect(screen.getByText('방문 리뷰 120')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /더 보기/ })).toBeNull();
  });

  it('리뷰가 50건 이하면 더 보기 없이 전부 그린다', async () => {
    useHandlers();
    renderPage();
    await finishJob(placeData(3));

    expect(visitorRows()).toBe(3);
    expect(screen.queryByRole('button', { name: /더 보기/ })).toBeNull();
  });
});
