import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { useAirLocationStore, useAuthStore } from '@repo/shared';
import { server } from '~/test/msw';
import { AirLocationChip } from './AirLocationChip';

// 상단바 칩 — 게스트 저장분(localStorage store)으로 렌더 분기·해석 요청·링크를 검증한다.
// 저장 위치가 없으면 아무것도 그리지 않고, 있으면 /air/stations/nearby?limit=1 로 가장
// 가까운 측정소를 해석해 점+측정소명+등급+PM2.5 를 그린다.

const renderChip = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AirLocationChip />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('AirLocationChip', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useAuthStore.setState({ token: null, user: null, isGuest: false });
    useAirLocationStore.setState({ location: null });
  });

  it('저장한 위치가 없으면 아무것도 그리지 않는다', () => {
    renderChip();
    expect(screen.queryByTestId('air-location-chip')).toBeNull();
  });

  it('게스트 저장 지점 → limit=1 로 가장 가까운 측정소를 해석해 측정소명·등급·PM2.5 와 /air 링크를 그린다', async () => {
    let url: string | null = null;
    server.use(
      http.get('/api/v1/air/stations/nearby', ({ request }) => {
        url = request.url;
        return HttpResponse.json({
          center: { lat: 37.57, lng: 127.0 },
          items: [
            {
              stationName: '종로구',
              addr: '서울 종로구 종로35가길 19',
              sidoName: '서울',
              mangName: '도시대기',
              year: '1997',
              items: ['PM10', 'PM2.5'],
              lat: 37.572025,
              lng: 127.005028,
              dist: 497,
              measure: {
                stationName: '종로구', stationCode: null, sidoName: '서울', mangName: '도시대기',
                dataTime: '2026-08-21 14:00', measuredAt: '2026-08-21T14:00:00+09:00',
                so2: 0.002, co: 0.3, o3: 0.02, no2: 0.01, pm10: 19, pm25: 16, pm10Avg24: 32, pm25Avg24: 25,
                khai: 74, khaiGrade: 2, so2Grade: 1, coGrade: 1, o3Grade: 1, no2Grade: 1,
                pm10Grade: 2, pm25Grade: 2, pm10Grade1h: 1, pm25Grade1h: 2,
                flags: { so2: null, co: null, o3: null, no2: null, pm10: null, pm25: null },
              },
            },
          ],
          total: 25,
          fetchedAt: '2026-08-21T05:00:00.000Z',
          stale: false,
        });
      }),
    );
    useAirLocationStore.getState().setLocation({ lat: 37.57, lng: 127.0, label: '종로구', source: 'manual' });
    renderChip();
    const chip = await screen.findByTestId('air-location-chip');
    await waitFor(() => expect(chip).toHaveTextContent('종로구'));
    expect(chip).toHaveTextContent('보통');
    expect(chip).toHaveTextContent('PM2.5 16');
    expect(chip).toHaveAttribute('href', '/air?sido=%EC%84%9C%EC%9A%B8&station=%EC%A2%85%EB%A1%9C%EA%B5%AC');
    expect(url).toContain('limit=1');
    expect(url).toContain('lat=37.57');
  });
});
