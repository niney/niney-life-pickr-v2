import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type {
  AdminVisitorReviewType,
  RestaurantDetailType,
  RestaurantInsightsType,
  RestaurantPublicDetailType,
  RestaurantSourceSummaryType,
} from '@repo/api-contract';
import { server } from '~/test/msw';
import { AdminRestaurantDetailPage } from './AdminRestaurantDetailPage';

// 어드민 맛집 상세 — 운영 헤더(출처 행·실패 배지) + 공개 홈 탭 + 출처 통합 리뷰 탭(운영 필터·
// 팁 필터의 서버 매칭) + canonical SSE(출처별 진행 합산·리뷰 완료 병합).

// jsdom 엔 EventSource 가 없다 — 요약 SSE 매니저가 여는 연결을 잡아 테스트가 이벤트를 흘린다.
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private listeners = new Map<string, Array<(e: MessageEvent) => void>>();
  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, fn: (e: MessageEvent) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  close() {}
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
const CANON = 'C1';
const NAVER_ID = 'R-naver';
const DC_ID = 'R-dc';
const AT = '2026-09-01T00:00:00.000Z';

const source = (over: Partial<RestaurantSourceSummaryType>): RestaurantSourceSummaryType => ({
  restaurantId: NAVER_ID,
  source: 'naver',
  sourceId: PLACE,
  placeId: PLACE,
  name: '통합집',
  category: '한식',
  rating: 4.2,
  reviewCount: 120,
  rawSourceUrl: 'https://m.place.naver.com/restaurant/P1',
  firstCrawledAt: AT,
  lastCrawledAt: AT,
  totalReviews: 0,
  summaryPending: 0,
  summaryRunning: 0,
  summaryDone: 0,
  summaryFailed: 0,
  avgSentimentScore: null,
  avgSatisfactionScore: null,
  positiveCount: 0,
  negativeCount: 0,
  neutralCount: 0,
  mixedCount: 0,
  ...over,
});

const summary = (over: Partial<NonNullable<AdminVisitorReviewType['summary']>>) => ({
  status: 'done' as const,
  text: null,
  model: 'm-1',
  errorCode: null,
  errorMessage: null,
  startedAt: null,
  finishedAt: AT,
  sentiment: null,
  sentimentScore: null,
  satisfactionScore: null,
  menus: null,
  tips: null,
  keywords: null,
  ...over,
});

const review = (over: Partial<AdminVisitorReviewType>): AdminVisitorReviewType => ({
  id: 'r',
  externalId: null,
  authorName: '작성자',
  rating: 5,
  body: '본문',
  visitedAt: '2026-08-01',
  imageUrls: [],
  videos: [],
  fetchedAt: AT,
  source: 'naver',
  restaurantId: NAVER_ID,
  summary: null,
  ...over,
});

const adminDetail: RestaurantDetailType = {
  id: NAVER_ID,
  placeId: PLACE,
  canonicalId: CANON,
  name: '통합집',
  category: '한식',
  address: '서울 양천구',
  phone: null,
  rating: 4.2,
  reviewCount: 120,
  rawSourceUrl: 'https://m.place.naver.com/restaurant/P1',
  firstCrawledAt: AT,
  lastCrawledAt: AT,
  snapshot: {
    placeId: PLACE,
    name: '통합집',
    category: '한식',
    address: '서울 양천구',
    roadAddress: null,
    phone: null,
    businessHours: null,
    latitude: null,
    longitude: null,
    imageUrls: [],
    rating: 4.2,
    reviewCount: 120,
    menus: [],
    reviewStats: null,
    blogReviews: [],
    visitorReviews: [],
    rawSourceUrl: 'https://m.place.naver.com/restaurant/P1',
  },
  reviews: [
    review({
      id: 'r1',
      body: '네이버 리뷰 본문',
      summary: summary({
        text: '김치찌개가 맛있다',
        sentiment: 'positive',
        sentimentScore: 0.8,
        satisfactionScore: 5,
        tips: ['주차 협소'],
        menus: [{ name: '김치찌개', sentiment: 'positive', traits: [] }],
      }),
    }),
    review({
      id: 'r2',
      body: '다이닝코드 리뷰 본문',
      source: 'diningcode',
      restaurantId: DC_ID,
      visitedAt: '2026-07-01',
      summary: summary({ status: 'failed', errorMessage: 'LLM timeout', model: null }),
    }),
    review({
      id: 'r3',
      body: '대기 중인 리뷰 본문',
      visitedAt: '2026-06-01',
      summary: summary({ status: 'queued', model: null, finishedAt: null }),
    }),
  ],
  sources: [
    source({ totalReviews: 2, summaryDone: 1, summaryPending: 1, positiveCount: 1 }),
    source({
      restaurantId: DC_ID,
      source: 'diningcode',
      sourceId: 'vrid1',
      placeId: null,
      rating: 4.6,
      reviewCount: 30,
      rawSourceUrl: 'https://www.diningcode.com/profile.php?rid=vrid1',
      totalReviews: 1,
      summaryFailed: 1,
    }),
  ],
  store: null,
  tour: null,
};

const publicDetail = {
  placeId: PLACE,
  name: '통합집',
  category: '한식',
  address: '서울 양천구',
  roadAddress: '서울 양천구 목동로 1',
  phone: null,
  businessHours: null,
  rating: 4.4,
  reviewCount: 150,
  latitude: null,
  longitude: null,
  imageUrls: [],
  menus: [],
  menuGroups: [],
  blogReviews: [],
  rawSourceUrl: 'https://m.place.naver.com/restaurant/P1',
  firstCrawledAt: AT,
  reviewsFirstPage: [],
  reviewCounts: { all: 3, positive: 1, negative: 0 },
  sources: {
    naver: { placeId: PLACE, rating: 4.2, siteReviewCount: 120, rawSourceUrl: 'https://m.place.naver.com/restaurant/P1' },
    diningcode: { vRid: 'vrid1', rating: 4.6, siteReviewCount: 30, rawSourceUrl: 'https://www.diningcode.com/profile.php?rid=vrid1' },
    tabling: null,
  },
  storedReviewCount: { naver: 2, diningcode: 1, tabling: 0, total: 3 },
  diningcode: null,
  tabling: null,
  store: null,
  tour: null,
} satisfies RestaurantPublicDetailType;

const insights: RestaurantInsightsType = {
  analyzedCount: 1,
  avgSentimentScore: 0.8,
  avgSatisfactionScore: 5,
  sentimentDistribution: { positive: 1, negative: 0, neutral: 0, mixed: 0 },
  topMenus: [{ name: '김치찌개', count: 1, positive: 1, negative: 0, neutral: 0 }],
  topTips: [{ term: '주차 협소', count: 1 }],
  topKeywords: [],
};

let reviewMatchQueries: string[] = [];

const useDetailHandlers = () => {
  reviewMatchQueries = [];
  server.use(
    http.get(`/api/v1/admin/restaurants/place/${PLACE}`, () => HttpResponse.json(adminDetail)),
    http.get(`/api/v1/restaurants/public/${PLACE}`, () => HttpResponse.json(publicDetail)),
    http.get(`/api/v1/restaurants/public/${PLACE}/insights`, () => HttpResponse.json(insights)),
    http.get(`/api/v1/restaurants/public/${PLACE}/parking-reviews`, () =>
      HttpResponse.json({ analyzed: 0, aspect: { pos: 0, neg: 0, neu: 0 }, tips: [] }),
    ),
    http.get(`/api/v1/admin/restaurants/place/${PLACE}/review-match`, ({ request }) => {
      const params = new URL(request.url).searchParams;
      reviewMatchQueries.push(`tip=${params.get('tip')}|menu=${params.get('menu')}`);
      return HttpResponse.json({ reviewIds: ['r1'] });
    }),
  );
};

const renderPage = (path = `/admin/restaurants/${PLACE}`) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}
    >
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/admin/restaurants/:placeId" element={<AdminRestaurantDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

const reviewPanel = () => screen.getByRole('tabpanel');

describe('AdminRestaurantDetailPage', () => {
  it('헤더는 출처 행·실패 배지를, 홈 탭은 공개 홈 탭을 보여 준다', async () => {
    useDetailHandlers();
    renderPage();

    expect(await screen.findByRole('heading', { level: 1, name: '통합집' })).toBeInTheDocument();
    // 출처 통합 DB 수 + 다이닝코드 요약 실패 1건 → 재분석 배지.
    expect(screen.getByTitle('출처 통합 저장 리뷰 수')).toHaveTextContent('DB 3');
    expect(screen.getByRole('button', { name: /실패 1/ })).toBeInTheDocument();
    // 출처 행 — 다이닝코드 칩과 재수집 버튼(네이버는 업데이트/재크롤링이 담당).
    const sourceList = screen.getByRole('list', { name: '출처' });
    expect(within(sourceList).getByText('다이닝코드')).toBeInTheDocument();
    expect(within(sourceList).getAllByRole('button', { name: /재수집/ })).toHaveLength(1);
    // 공개 홈 탭 — AI 분석 요약과 방문 팁.
    expect(await screen.findByText('AI 분석')).toBeInTheDocument();
    expect(screen.getByTitle('"주차 협소" 팁이 달린 리뷰 보기')).toBeInTheDocument();
    // '가는 법' 탭은 없다.
    expect(screen.queryByRole('tab', { name: /가는 법/ })).toBeNull();
  });

  it('리뷰 탭 — 출처 통합 목록, 실패 사유, 요약 상태 필터', async () => {
    useDetailHandlers();
    renderPage(`/admin/restaurants/${PLACE}?tab=reviews`);

    expect(await screen.findByText('네이버 리뷰 본문')).toBeInTheDocument();
    expect(screen.getByText('다이닝코드 리뷰 본문')).toBeInTheDocument();
    expect(screen.getByText('요약 실패: LLM timeout')).toBeInTheDocument();
    expect(screen.getByText('요약 대기 중…')).toBeInTheDocument();
    expect(screen.getByText('3 / 3건')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('요약 상태 필터'), { target: { value: 'failed' } });
    expect(screen.getByText('1 / 3건')).toBeInTheDocument();
    expect(within(reviewPanel()).queryByText('네이버 리뷰 본문')).toBeNull();
    expect(within(reviewPanel()).getByText('다이닝코드 리뷰 본문')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('요약 상태 필터'), { target: { value: 'all' } });
    fireEvent.change(screen.getByLabelText('출처 필터'), { target: { value: 'naver' } });
    expect(screen.getByText('2 / 3건')).toBeInTheDocument();
  });

  it('홈 탭의 방문 팁을 누르면 리뷰 탭으로 넘어가 서버 매칭 id 로 거른다', async () => {
    useDetailHandlers();
    renderPage();

    fireEvent.click(await screen.findByTitle('"주차 협소" 팁이 달린 리뷰 보기'));
    expect(await screen.findByText('주차 협소')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('1 / 3건')).toBeInTheDocument());
    expect(reviewMatchQueries).toEqual(['tip=주차 협소|menu=null']);
    expect(within(reviewPanel()).getByText('네이버 리뷰 본문')).toBeInTheDocument();
    expect(within(reviewPanel()).queryByText('다이닝코드 리뷰 본문')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '방문 팁 필터 해제' }));
    expect(screen.getByText('3 / 3건')).toBeInTheDocument();
  });

  it('canonical SSE — 출처별 진행을 합쳐 진행 카드를 띄우고, 리뷰 완료를 행에 병합한다', async () => {
    useDetailHandlers();
    renderPage(`/admin/restaurants/${PLACE}?tab=reviews`);
    await screen.findByText('요약 실패: LLM timeout');

    await waitFor(() =>
      expect(FakeEventSource.instances.some((es) => es.url.includes(`canonicalId=${CANON}`))).toBe(true),
    );
    const es = FakeEventSource.instances.find((e) => e.url.includes(`canonicalId=${CANON}`))!;
    const tag = (restaurantId: string, src: string) => ({
      canonicalId: CANON,
      restaurantId,
      source: src,
      sourceId: src === 'naver' ? PLACE : 'vrid1',
      placeId: src === 'naver' ? PLACE : null,
    });
    const progress = { queued: 0, pending: 0, running: 0, done: 0, failed: 0, cancelled: 0, recentDone: [] };
    es.emit('snapshot', { ...tag(NAVER_ID, 'naver'), ...progress, totalReviews: 2, pending: 1, done: 1 });
    // 다이닝코드 리뷰를 재요약 중 — 실패가 풀리고 진행 1.
    es.emit('snapshot', { ...tag(DC_ID, 'diningcode'), ...progress, totalReviews: 1, running: 1 });

    // 두 출처 합산: 저장 3 · 완료 1/3(진행 2) → 진행 카드 + 중지 버튼. 실패 배지는 사라진다.
    expect(await screen.findByText(/저장된 리뷰 3개 · 1\/3 완료/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /요약 중지/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /실패 1/ })).toBeNull();

    es.emit('review', {
      ...tag(DC_ID, 'diningcode'),
      type: 'review',
      reviewId: 'r2',
      status: 'done',
      text: '재요약된 다이닝코드 요약',
      model: 'm-2',
      errorCode: null,
      errorMessage: null,
      finishedAt: AT,
      sentiment: 'positive',
      sentimentScore: 0.5,
      satisfactionScore: 4,
      menus: [],
      tips: [],
      keywords: [],
    });
    expect(await screen.findByText('재요약된 다이닝코드 요약')).toBeInTheDocument();
    expect(screen.queryByText('요약 실패: LLM timeout')).toBeNull();
  });
});
