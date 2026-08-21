import { describe, expect, it, vi } from 'vitest';
import { forwardRef, useImperativeHandle } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type { AirLocationUpsertBodyType, AirStationInfoItemType } from '@repo/api-contract';
import { ApiError } from '@repo/shared';
import { server } from '~/test/msw';
import { AirNearbySection, AirStationsErrorBlock } from './AirNearbySection';

// 지도 엔진(OpenLayers)은 jsdom 에서 돌지 않는다 — 캔버스만 자리표시자로 바꾼다.
// 카메라 핸들(flyToZoomIn 등)은 no-op 으로 채워 둔다(위치/선택 effect 가 부른다).
// 여기서 검증하는 건 지도 주변의 계약: 검색 → 선택 콜백(측정소명 + 시도 옵션),
// 내 위치 → 주변 목록, 위치 미지원 안내, 활용신청 전(인증 30) 안내 분기.
vi.mock('~/components/restaurant/MapCanvas', () => ({
  MapCanvas: forwardRef(function MockMapCanvas(_props, ref) {
    useImperativeHandle(ref, () => ({
      flyTo: () => {},
      flyToZoomIn: () => {},
      fitToMarkers: () => {},
      fitToCoords: () => {},
    }));
    return <div data-testid="map-canvas" />;
  }),
}));

const station = (over: Partial<AirStationInfoItemType> = {}): AirStationInfoItemType => ({
  stationName: '종로구',
  addr: '서울 종로구 종로35가길 19',
  sidoName: '서울',
  mangName: '도시대기',
  year: '1997',
  items: ['SO2', 'CO', 'O3', 'NO2', 'PM10', 'PM2.5'],
  lat: 37.572025,
  lng: 127.005028,
  ...over,
});

const renderSection = (onSelect = vi.fn(), opts: { selectedStation?: string | null } = {}) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const onSaveLocation = vi.fn<(body: AirLocationUpsertBodyType) => void>();
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <AirNearbySection
        stations={[station()]}
        measures={[]}
        selectedStation={opts.selectedStation ?? null}
        onSelect={onSelect}
        savedLocation={null}
        onSaveLocation={onSaveLocation}
        onClearLocation={() => {}}
      />
    </QueryClientProvider>,
  );
  return { ...utils, onSelect, onSaveLocation };
};

describe('AirNearbySection', () => {
  it('측정소명 검색 결과를 고르면 측정소명과 시도 옵션으로 선택 콜백이 불리고 입력이 비워진다', async () => {
    server.use(
      http.get('/api/v1/settings/map/public', () => HttpResponse.json({ apiKey: 'test-vworld-key' })),
      http.get('/api/v1/air/stations/search', ({ request }) => {
        const q = new URL(request.url).searchParams.get('q');
        return HttpResponse.json({
          q,
          items: [
            station({ stationName: '종로구' }),
            station({ stationName: '서석동', addr: '광주 동구 서석동', sidoName: '광주' }),
          ],
          total: 2,
          fetchedAt: '2026-08-21T05:00:00.000Z',
          stale: false,
        });
      }),
    );
    const { onSelect } = renderSection();
    const input = screen.getByLabelText('측정소 검색');
    fireEvent.change(input, { target: { value: '종로' } });
    // 디바운스(250ms) 뒤 검색 → 결과 표시.
    const result = await screen.findByRole('button', { name: /서석동/ }, { timeout: 3000 });
    fireEvent.click(result);
    // 2026-07 통합 라벨: 주소 시도 '광주' → 선택지 값 '전남광주'.
    expect(onSelect).toHaveBeenCalledWith('서석동', '전남광주');
    await waitFor(() => expect((input as HTMLInputElement).value).toBe(''));
  });

  it('위치를 얻으면 내 주변 목록(거리·측정소·현재 값·등급)을 그리고, 항목을 고르면 선택 콜백이 불린다', async () => {
    // jsdom 에는 geolocation 이 없다 — 성공 콜백을 즉시 부르는 스텁을 심는다(isSecureContext 는
    // jsdom 기본 true). 스텁은 테스트 뒤 원복.
    const original = navigator.geolocation;
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (ok: PositionCallback) =>
          ok({ coords: { latitude: 37.57, longitude: 127.0 } } as GeolocationPosition),
      },
    });
    let nearbyUrl: string | null = null;
    server.use(
      http.get('/api/v1/settings/map/public', () => HttpResponse.json({ apiKey: 'test-vworld-key' })),
      http.get('/api/v1/air/stations/nearby', ({ request }) => {
        nearbyUrl = request.url;
        return HttpResponse.json({
          center: { lat: 37.57, lng: 127.0 },
          items: [
            {
              ...station({ stationName: '청계천로', mangName: '도로변대기', addr: '서울 종로구 청계천로' }),
              dist: 226,
              measure: {
                stationName: '청계천로', stationCode: null, sidoName: '서울', mangName: '도로변대기',
                dataTime: '2026-08-21 14:00', measuredAt: '2026-08-21T14:00:00+09:00',
                so2: 0.002, co: 0.4, o3: 0.02, no2: 0.02, pm10: 30, pm25: 21, pm10Avg24: 28, pm25Avg24: 20,
                khai: 70, khaiGrade: 2, so2Grade: 1, coGrade: 1, o3Grade: 1, no2Grade: 1,
                pm10Grade: 2, pm25Grade: 2, pm10Grade1h: 1, pm25Grade1h: 2,
                flags: { so2: null, co: null, o3: null, no2: null, pm10: null, pm25: null },
              },
            },
            { ...station({ stationName: '종로구' }), dist: 497, measure: null },
          ],
          total: 2,
          fetchedAt: '2026-08-21T05:00:00.000Z',
          stale: false,
        });
      }),
    );
    try {
      const { onSelect } = renderSection();
      fireEvent.click(screen.getByRole('button', { name: /내 위치로 찾기/ }));
      const row = await screen.findByRole('button', { name: /청계천로/ });
      // 거리·현재 PM10/PM2.5·등급 글자가 한 행에 있다.
      expect(row).toHaveTextContent('226m');
      expect(row).toHaveTextContent('30/21');
      expect(row).toHaveTextContent('보통');
      // 측정값이 없는 측정소는 '측정값 없음' — 청계천로 주소에도 '종로구'가 들어 있어 거리로 고른다.
      expect(screen.getByRole('button', { name: /497m/ })).toHaveTextContent('측정값 없음');
      expect(nearbyUrl).toContain('lat=37.57');
      expect(nearbyUrl).toContain('radius=20000');
      fireEvent.click(row);
      expect(onSelect).toHaveBeenCalledWith('청계천로', '서울');
    } finally {
      Object.defineProperty(navigator, 'geolocation', { configurable: true, value: original });
    }
  });

  it("선택한 측정소가 있으면 '선택 측정소 저장' 으로 그 측정소 좌표·이름을 station 출처로 저장한다(GPS 가 아니라)", async () => {
    server.use(
      http.get('/api/v1/settings/map/public', () => HttpResponse.json({ apiKey: 'test-vworld-key' })),
    );
    const { onSaveLocation } = renderSection(vi.fn(), { selectedStation: '종로구' });
    fireEvent.click(screen.getByRole('button', { name: /선택 측정소\(종로구\) 저장/ }));
    expect(onSaveLocation).toHaveBeenCalledWith({
      lat: 37.572025,
      lng: 127.005028,
      label: '종로구',
      source: 'station',
    });
  });

  it('위치를 가져올 수 없는 환경(jsdom)에서는 버튼을 누르면 안내 문구가 뜨고 주변 조회는 하지 않는다', async () => {
    server.use(
      http.get('/api/v1/settings/map/public', () => HttpResponse.json({ apiKey: 'test-vworld-key' })),
    );
    renderSection();
    fireEvent.click(screen.getByRole('button', { name: /내 위치로 찾기/ }));
    expect(await screen.findByText(/위치를 가져오지 못했습니다/)).toBeInTheDocument();
    // MSW onUnhandledRequest:'error' — nearby 호출이 나갔다면 여기서 실패했을 것.
  });
});

describe('AirStationsErrorBlock', () => {
  it('인증 30(활용신청 전) 503 은 키 설정이 아니라 활용신청 안내로 분기한다', () => {
    render(
      <AirStationsErrorBlock
        error={new ApiError(503, 'Service Unavailable', '에어코리아 api 인증 실패(30: 등록되지 않은 서비스키)')}
        onRetry={() => {}}
        retrying={false}
      />,
    );
    expect(screen.getByText(/활용신청이 아직 없습니다/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /활용신청 페이지 열기/ })).toHaveAttribute(
      'href',
      'https://www.data.go.kr/data/15073877/openapi.do',
    );
  });

  it('그 외 502 는 일반 업스트림 오류 문구 + 다시 시도', () => {
    render(
      <AirStationsErrorBlock
        error={new ApiError(502, 'Bad Gateway', '에어코리아 api 게이트웨이 오류(05)')}
        onRetry={() => {}}
        retrying={false}
      />,
    );
    expect(screen.getByText(/응답하지 않습니다/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument();
  });
});
