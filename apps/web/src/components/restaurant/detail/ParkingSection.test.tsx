import { useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type { ParkingLotNearbyResultType, RestaurantParkingReviewsType, RestaurantPublicDetailType } from '@repo/api-contract';
import { server } from '~/test/msw';
import { ParkingNearbySection, ParkingSummaryLine } from './ParkingSection';

// 식당 상세의 주차 — 가는 법 섹션(리뷰 평가·팁·다이닝코드 시설·반경 300m 주차장 → 주차 페이지 이동)과 홈 한 줄 요약.

const FETCHED = '2026-09-25T07:00:00.000Z';
// 쓰는 필드만 채운 상세(나머지는 이 컴포넌트가 읽지 않는다).
const detail = {
  placeId: 'P1',
  latitude: 37.5264,
  longitude: 126.8631,
  diningcode: { facilities: ['주차', '단체석'] },
} as unknown as RestaurantPublicDetailType;

const reviews: RestaurantParkingReviewsType = { analyzed: 40, aspect: { pos: 1, neg: 3, neu: 0 }, tips: [{ term: '주차 협소', count: 3 }, { term: '뒷편 주차 가능', count: 1 }] };
const nearby: ParkingLotNearbyResultType = {
  center: { lat: 37.5264, lng: 126.8631 },
  total: 1,
  fetchedAt: FETCHED,
  items: [
    {
      id: 'seoul:1',
      source: 'seoul',
      name: '신정4동길(구)',
      ownership: 'public',
      lotType: 'street',
      feeType: 'free',
      roadAddr: null,
      lotAddr: '서울특별시 양천구 신정동 1',
      phone: null,
      orgName: null,
      totalSpaces: 20,
      hours: { wd: { open: '09:00', close: '19:00' }, sat: { open: null, close: null }, hol: { open: null, close: null } },
      operDays: null,
      fee: { baseMin: null, baseFee: null, addMin: null, addFee: null, dayMaxFee: null, dayPassFee: null, monthlyFee: null },
      satFree: null,
      holFree: null,
      payMethods: null,
      note: null,
      disabledZone: null,
      lat: 37.5270,
      lng: 126.8640,
      geoSource: 'parcel',
      baseDate: '2026-09-25',
      live: null,
      dist: 133,
    },
  ],
};

const LocationProbe = () => <div data-testid="location">{`${useLocation().pathname}${useLocation().search}`}</div>;
const renderWith = (ui: React.ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
      <MemoryRouter initialEntries={['/restaurants/P1?tab=transit']}>
        <LocationProbe />
        <Routes>
          <Route path="*" element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

let nearbyUrl: URL | null = null;
let reviewCalls = 0;
beforeEach(() => {
  nearbyUrl = null;
  reviewCalls = 0;
  server.use(
    http.get('/api/v1/restaurants/public/P1/parking-reviews', () => {
      reviewCalls += 1;
      return HttpResponse.json(reviews);
    }),
    http.get('/api/v1/parking/lots/nearby', ({ request }) => {
      nearbyUrl = new URL(request.url);
      return HttpResponse.json(nearby);
    }),
  );
});

describe('식당 상세 주차', () => {
  it('가는 법 섹션 — 리뷰 평가·팁·다이닝코드 시설·반경 300m 주차장, 행 클릭 → 주차 페이지 sel', async () => {
    renderWith(<ParkingNearbySection detail={detail} lat={37.5264} lng={126.8631} />);
    const sec = await screen.findByTestId('restaurant-parking');
    await waitFor(() => expect(within(sec).getByText('리뷰: 주차 불편한 편')).toBeInTheDocument());
    expect(sec).toHaveTextContent('좋음 1 · 아쉬움 3 (분석 리뷰 40건 중)');
    expect(within(sec).getByText('주차 협소 ×3')).toBeInTheDocument();
    expect(within(sec).getByText('다이닝코드 시설 정보: 주차 가능')).toBeInTheDocument();
    expect(within(sec).getByText('공영 · 노상 · 무료')).toBeInTheDocument();
    expect(nearbyUrl?.searchParams.get('radius')).toBe('300');
    fireEvent.click(within(sec).getByText('신정4동길(구)'));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/parking?ll=37.527,126.864&z=17&sel=seoul%3A1'));
  });

  it('좌표 없는 식당 — 리뷰 평가·팁·다이닝코드 시설만, 주변 주차장 조회·주차 페이지 링크는 없다', async () => {
    const noCoord = { ...detail, latitude: null, longitude: null } as RestaurantPublicDetailType;
    renderWith(<ParkingNearbySection detail={noCoord} lat={null} lng={null} />);
    const sec = await screen.findByTestId('restaurant-parking');
    await waitFor(() => expect(within(sec).getByText('리뷰: 주차 불편한 편')).toBeInTheDocument());
    expect(within(sec).getByText('다이닝코드 시설 정보: 주차 가능')).toBeInTheDocument();
    expect(within(sec).queryByText('주차 페이지에서 보기')).toBeNull();
    expect(within(sec).queryByText(/반경 .* 안에 등록된 주차장이 없어요/)).toBeNull();
    expect(nearbyUrl).toBeNull();
  });

  it('좌표도 리뷰 정보도 없으면 섹션을 그리지 않는다', async () => {
    let emptyCalls = 0;
    server.use(
      http.get('/api/v1/restaurants/public/P1/parking-reviews', () => {
        emptyCalls += 1;
        return HttpResponse.json({ analyzed: 0, aspect: { pos: 0, neg: 0, neu: 0 }, tips: [] });
      }),
    );
    const bare = { ...detail, latitude: null, longitude: null, diningcode: null } as RestaurantPublicDetailType;
    renderWith(<ParkingNearbySection detail={bare} lat={null} lng={null} />);
    await waitFor(() => expect(emptyCalls).toBe(1));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId('restaurant-parking')).toBeNull();
    expect(nearbyUrl).toBeNull();
  });

  it('홈 한 줄 요약 — 평가 + 가장 가까운 주차장(무료), 누르면 가는 법으로', async () => {
    let opened = false;
    renderWith(<ParkingSummaryLine detail={detail} onOpen={() => (opened = true)} />);
    const line = await screen.findByTestId('restaurant-parking-summary');
    await waitFor(() => expect(line).toHaveTextContent('리뷰: 주차 불편한 편 · 신정4동길(구) 133m · 무료'));
    fireEvent.click(line);
    expect(opened).toBe(true);
  });

  it('홈 한 줄 요약 — enabled=false 인 동안은 조회하지 않고(상세 응답만으로 아는 것만 그린다), 켜지면 조회한다', async () => {
    // 홈 탭이 "영업 정보" 가 화면에 들어오기 전까지 enabled=false 로 넘기는 상황.
    const Gate = () => {
      const [enabled, setEnabled] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setEnabled(true)}>
            화면에 들어옴
          </button>
          <ParkingSummaryLine detail={detail} enabled={enabled} />
        </>
      );
    };
    renderWith(<Gate />);
    // 다이닝코드 시설 정보는 상세 응답에 이미 있다 — 조회 없이도 한 줄은 뜬다.
    expect(await screen.findByTestId('restaurant-parking-summary')).toHaveTextContent('주차 가능(다이닝코드)');
    await new Promise((r) => setTimeout(r, 50));
    expect(reviewCalls).toBe(0);
    expect(nearbyUrl).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '화면에 들어옴' }));
    await waitFor(() =>
      expect(screen.getByTestId('restaurant-parking-summary')).toHaveTextContent(
        '리뷰: 주차 불편한 편 · 신정4동길(구) 133m · 무료',
      ),
    );
    expect(reviewCalls).toBe(1);
    expect(nearbyUrl).not.toBeNull();
  });
});
