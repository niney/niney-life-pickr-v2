import { describe, expect, it, vi } from 'vitest';
import { forwardRef } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type { AirStationInfoItemType } from '@repo/api-contract';
import { ApiError } from '@repo/shared';
import { server } from '~/test/msw';
import { AirNearbySection, AirStationsErrorBlock } from './AirNearbySection';

// 지도 엔진(OpenLayers)은 jsdom 에서 돌지 않는다 — 캔버스만 자리표시자로 바꾼다.
// 여기서 검증하는 건 지도 주변의 계약: 검색 → 선택 콜백(측정소명 + 시도 옵션),
// 위치 미지원 안내, 활용신청 전(인증 30) 안내 분기.
vi.mock('~/components/restaurant/MapCanvas', () => ({
  MapCanvas: forwardRef<HTMLDivElement>(function MockMapCanvas(_props, ref) {
    return <div ref={ref} data-testid="map-canvas" />;
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

const renderSection = (onSelect = vi.fn()) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <AirNearbySection
        stations={[station()]}
        measures={[]}
        selectedStation={null}
        onSelect={onSelect}
      />
    </QueryClientProvider>,
  );
  return { ...utils, onSelect };
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

  it('위치를 가져올 수 없는 환경(jsdom)에서는 버튼을 누르면 안내 문구가 뜨고 주변 조회는 하지 않는다', async () => {
    server.use(
      http.get('/api/v1/settings/map/public', () => HttpResponse.json({ apiKey: 'test-vworld-key' })),
    );
    renderSection();
    fireEvent.click(screen.getByRole('button', { name: /내 위치로 찾기/ }));
    expect(await screen.findByText(/위치를 가져올 수 없습니다/)).toBeInTheDocument();
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
