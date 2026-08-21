import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { useAirLocationStore, useAuthStore } from '@repo/shared';
import { server } from '~/test/msw';
import { MyLocationChip } from './MyLocationChip';

// 상단바 "내 위치" 통합 칩 — 저장 위치(게스트 store)가 있으면 알약 하나에 [📍라벨 ☁기온 상태 ☂]
// (→ /weather) · [●등급 PM2.5](→ /air), 없으면 아무것도. 한쪽 자료가 없으면 그 세그먼트만 빠진다.

const renderChip = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <MyLocationChip />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

const nearby = {
  center: { lat: 37.57, lng: 127.0 },
  items: [
    {
      stationName: '종로구', addr: '서울 종로구 종로35가길 19', sidoName: '서울', mangName: '도시대기', year: '1997',
      items: ['PM10', 'PM2.5'], lat: 37.572025, lng: 127.005028, dist: 497,
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
};

const nowcast = (pop: number) => ({
  grid: { nx: 60, ny: 127 },
  ncstBase: { date: '20260821', time: '1500', at: '2026-08-21T15:00:00+09:00' },
  now: { t1h: 27.3, rn1: 0, reh: 73, pty: 0, vec: 187, wsd: 0.8, uuu: 0.1, vvv: 0.8 },
  ultraBase: { date: '20260821', time: '1530', at: '2026-08-21T15:30:00+09:00' },
  hours: [16, 17, 18].map((h) => ({
    fcstDate: '20260821', fcstTime: `${h}00`, at: `2026-08-21T${h}:00:00+09:00`,
    t1h: 27, rn1: { text: '강수없음', value: 0, none: true }, sky: 4, pty: 0, pop, reh: 70, wsd: 1, vec: 180, uuu: 0, vvv: 1, lgt: 0,
  })),
  ncstFallback: false,
  ultraFallback: false,
  fetchedAt: '2026-08-21T07:05:00.000Z',
  stale: false,
});

const saveGuest = () =>
  useAirLocationStore.getState().setLocation({ lat: 37.57, lng: 127.0, label: '종로구', source: 'station' });

describe('MyLocationChip', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useAuthStore.setState({ token: null, user: null, isGuest: false });
    useAirLocationStore.setState({ location: null });
  });

  it('저장한 위치가 없으면 아무것도 그리지 않는다', () => {
    renderChip();
    expect(screen.queryByTestId('my-location-chip')).toBeNull();
  });

  it('알약 하나에 라벨 한 번 + 날씨(격자 60,127 실황·흐림·우산) → /weather, 대기(등급·PM2.5) → /air', async () => {
    let nowcastUrl: string | null = null;
    let nearbyUrl: string | null = null;
    server.use(
      http.get('/api/v1/air/stations/nearby', ({ request }) => {
        nearbyUrl = request.url;
        return HttpResponse.json(nearby);
      }),
      http.get('/api/v1/weather/nowcast', ({ request }) => {
        nowcastUrl = request.url;
        return HttpResponse.json(nowcast(70));
      }),
    );
    saveGuest();
    renderChip();
    const chip = await screen.findByTestId('my-location-chip');
    const weather = screen.getByTestId('weather-location-chip');
    await waitFor(() => expect(weather).toHaveTextContent('27.3°'));
    expect(weather).toHaveTextContent('종로구');
    expect(weather).toHaveTextContent('흐림');
    expect(weather).toHaveAttribute('href', '/weather?ll=37.57000,127.00000');
    expect(screen.getByRole('img', { name: /강수 예상 \(최대 70%\)/ })).toBeInTheDocument();
    expect(nowcastUrl).toContain('nx=60');
    expect(nowcastUrl).toContain('ny=127');
    const air = await screen.findByTestId('air-location-chip');
    await waitFor(() => expect(air).toHaveTextContent('보통'));
    expect(air).toHaveTextContent('PM2.5 16');
    // 위치 이름은 앞에 한 번만 — 대기 세그먼트엔 측정소명을 반복하지 않는다(툴팁에만).
    expect(air).not.toHaveTextContent('종로구');
    expect(air).toHaveAttribute('href', '/air?sido=%EC%84%9C%EC%9A%B8&station=%EC%A2%85%EB%A1%9C%EA%B5%AC');
    expect(nearbyUrl).toContain('limit=1');
    expect(chip.getAttribute('title')).toMatch(/^내 위치\(종로구\) · 날씨 27\.3℃ 흐림/);
    expect(chip.getAttribute('title')).toContain('대기 보통(통합지수)');
    expect(chip.getAttribute('title')).toContain('종로구 497m');
  });

  it('강수확률이 낮으면 우산 없음 · 실황이 없으면 날씨 수치만 빠지고 라벨·대기는 남는다 · 측정소가 없으면 대기 세그먼트가 빠진다', async () => {
    server.use(
      http.get('/api/v1/air/stations/nearby', () => HttpResponse.json(nearby)),
      http.get('/api/v1/weather/nowcast', () => HttpResponse.json(nowcast(20))),
    );
    saveGuest();
    const first = renderChip();
    await waitFor(() => expect(screen.getByTestId('weather-location-chip')).toHaveTextContent('27.3°'));
    expect(screen.queryByRole('img', { name: /강수 예상/ })).toBeNull();
    first.unmount();

    server.use(http.get('/api/v1/weather/nowcast', () => HttpResponse.json({ ...nowcast(20), now: null, ncstBase: null })));
    const second = renderChip();
    await waitFor(() => expect(screen.getByTestId('air-location-chip')).toHaveTextContent('보통'));
    const weather = screen.getByTestId('weather-location-chip');
    await waitFor(() => expect(weather).not.toHaveTextContent('…'));
    expect(weather).toHaveTextContent('종로구');
    expect(weather).not.toHaveTextContent('°');
    second.unmount();

    server.use(http.get('/api/v1/air/stations/nearby', () => HttpResponse.json({ ...nearby, items: [], total: 0 })));
    renderChip();
    await waitFor(() => expect(screen.queryByTestId('air-location-chip')).toBeNull());
    expect(screen.getByTestId('my-location-chip')).toBeInTheDocument();
  });
});
