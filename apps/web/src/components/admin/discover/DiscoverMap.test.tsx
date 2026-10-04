import { forwardRef, useImperativeHandle } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '~/test/msw';
import type { MapMarker } from '~/components/restaurant/MapCanvas';
import { DiscoverMap } from './DiscoverMap';

// 발견 화면 지도 — 지도(OL)는 목으로 바꾸고 "언제 지도를 옮기는가" 를 본다:
//  ① 강조 대상(선택·호버)으로의 flyTo 는 대상이나 그 좌표가 바뀔 때만. markers 배열 참조만
//     바뀌는 경우(등록 목록이 요약 SSE 로 패치될 때마다 일어난다)에는 다시 옮기지 않는다 —
//     예전엔 그때마다 flyTo 가 나가 사용자가 옮겨 둔 지도가 선택 지점으로 되돌아갔다.
//  ② 확대 요청(zoomFocus)은 한 번 처리하고 비운다. 강조와 확대가 같은 식당으로 함께 바뀌면
//     flyToZoomIn 하나만 부른다(flyTo 와 겹치면 OL 애니메이션이 충돌해 확대가 묻힌다).
//  ③ 첫 등록 마커 묶음 fit 은 한 번만.

const mapSpy = vi.hoisted(() => ({
  flyTo: vi.fn(),
  flyToZoomIn: vi.fn(),
  fitToMarkers: vi.fn(),
  fitToCoords: vi.fn(),
}));

vi.mock('~/components/restaurant/MapCanvas', () => ({
  MapCanvas: forwardRef(function MockMapCanvas(_props: { markers: unknown[] }, ref) {
    useImperativeHandle(ref, () => ({
      flyTo: mapSpy.flyTo,
      flyToZoomIn: mapSpy.flyToZoomIn,
      fitToMarkers: mapSpy.fitToMarkers,
      fitToCoords: mapSpy.fitToCoords,
    }));
    return <div data-testid="map-canvas" />;
  }),
}));

const A: MapMarker = { id: 'A', lat: 37.5, lng: 127.0, variant: 'muted' };
const B: MapMarker = { id: 'B', lat: 37.6, lng: 127.1, variant: 'muted' };
const S: MapMarker = { id: 'S', lat: 37.7, lng: 127.2, variant: 'primary', label: '검색 결과' };

interface ViewProps {
  markers: MapMarker[];
  selectedPlaceId?: string | null;
  hoveredPlaceId?: string | null;
  zoomFocus?: { placeId: string } | null;
  onZoomFocusConsumed?: () => void;
}

const renderMap = (initial: ViewProps) => {
  server.use(
    http.get('/api/v1/settings/map/public', () =>
      HttpResponse.json({ provider: 'vworld', apiKey: 'test-key' }),
    ),
  );
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const ui = (p: ViewProps) => (
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <DiscoverMap
          markers={p.markers}
          selectedPlaceId={p.selectedPlaceId ?? null}
          hoveredPlaceId={p.hoveredPlaceId ?? null}
          zoomFocus={p.zoomFocus ?? null}
          onZoomFocusConsumed={p.onZoomFocusConsumed}
          appliedBbox={null}
          onSelectMarker={() => {}}
          onResearchInArea={() => {}}
          onClearArea={() => {}}
          panelSide="right"
        />
      </MemoryRouter>
    </QueryClientProvider>
  );
  const view = render(ui(initial));
  return { rerender: (p: ViewProps) => view.rerender(ui(p)) };
};

beforeEach(() => {
  mapSpy.flyTo.mockClear();
  mapSpy.flyToZoomIn.mockClear();
  mapSpy.fitToMarkers.mockClear();
});

describe('DiscoverMap', () => {
  it('markers 참조만 바뀌면 다시 옮기지 않고, 강조 대상이나 그 좌표가 바뀔 때만 flyTo 한다', async () => {
    const { rerender } = renderMap({ markers: [A, B], selectedPlaceId: 'A' });
    // 지도 키가 오면 지도가 뜨고, 그때 선택 지점으로 한 번 이동한다.
    await screen.findByTestId('map-canvas');
    expect(mapSpy.flyTo).toHaveBeenCalledTimes(1);
    expect(mapSpy.flyTo).toHaveBeenLastCalledWith(37.5, 127.0);

    // 요약 SSE 패치 흉내 — 내용이 같은 새 배열·새 객체.
    rerender({ markers: [{ ...A }, { ...B }], selectedPlaceId: 'A' });
    rerender({ markers: [{ ...A }, { ...B }, S], selectedPlaceId: 'A' });
    expect(mapSpy.flyTo).toHaveBeenCalledTimes(1);

    // 강조 대상이 바뀌면 이동.
    rerender({ markers: [A, B, S], selectedPlaceId: 'A', hoveredPlaceId: 'B' });
    expect(mapSpy.flyTo).toHaveBeenCalledTimes(2);
    expect(mapSpy.flyTo).toHaveBeenLastCalledWith(37.6, 127.1);

    // 같은 대상의 좌표가 바뀌어도 이동(재수집으로 좌표가 고쳐진 경우).
    rerender({ markers: [A, { ...B, lat: 37.65 }, S], selectedPlaceId: 'A', hoveredPlaceId: 'B' });
    expect(mapSpy.flyTo).toHaveBeenCalledTimes(3);
    expect(mapSpy.flyTo).toHaveBeenLastCalledWith(37.65, 127.1);
  });

  it('강조 대상의 마커가 뒤늦게 생기면 그때 이동한다', async () => {
    const { rerender } = renderMap({ markers: [A], selectedPlaceId: 'B' });
    await screen.findByTestId('map-canvas');
    expect(mapSpy.flyTo).not.toHaveBeenCalled();

    rerender({ markers: [A, B], selectedPlaceId: 'B' });
    expect(mapSpy.flyTo).toHaveBeenCalledTimes(1);
    expect(mapSpy.flyTo).toHaveBeenLastCalledWith(37.6, 127.1);
  });

  it('확대 요청은 한 번만 처리하고 비운다 — 이후 마커가 바뀌어도 다시 확대하지 않는다', async () => {
    const consumed = vi.fn();
    const { rerender } = renderMap({ markers: [A, B], selectedPlaceId: 'A', onZoomFocusConsumed: consumed });
    await screen.findByTestId('map-canvas');
    expect(mapSpy.flyTo).toHaveBeenCalledTimes(1);

    // 이미 강조된 식당을 더블클릭 — 확대만 한다.
    const focus = { placeId: 'A' };
    rerender({ markers: [A, B], selectedPlaceId: 'A', zoomFocus: focus, onZoomFocusConsumed: consumed });
    expect(mapSpy.flyToZoomIn).toHaveBeenCalledTimes(1);
    expect(mapSpy.flyToZoomIn).toHaveBeenLastCalledWith(37.5, 127.0, 17);
    expect(consumed).toHaveBeenCalledTimes(1);
    expect(mapSpy.flyTo).toHaveBeenCalledTimes(1);

    // 페이지가 요청을 비운 뒤 — 마커 배열이 바뀌어도 아무 이동이 없다.
    rerender({ markers: [{ ...A }, { ...B }], selectedPlaceId: 'A', zoomFocus: null, onZoomFocusConsumed: consumed });
    rerender({ markers: [{ ...A }, { ...B }, S], selectedPlaceId: 'A', zoomFocus: null, onZoomFocusConsumed: consumed });
    expect(mapSpy.flyToZoomIn).toHaveBeenCalledTimes(1);
    expect(mapSpy.flyTo).toHaveBeenCalledTimes(1);
    expect(consumed).toHaveBeenCalledTimes(1);
  });

  it('강조와 확대가 같은 식당으로 함께 바뀌면(위치 버튼) 확대 하나만 부른다', async () => {
    const consumed = vi.fn();
    const { rerender } = renderMap({ markers: [A, B], onZoomFocusConsumed: consumed });
    await screen.findByTestId('map-canvas');
    expect(mapSpy.flyTo).not.toHaveBeenCalled();

    rerender({ markers: [A, B], hoveredPlaceId: 'B', zoomFocus: { placeId: 'B' }, onZoomFocusConsumed: consumed });
    expect(mapSpy.flyToZoomIn).toHaveBeenCalledTimes(1);
    expect(mapSpy.flyToZoomIn).toHaveBeenLastCalledWith(37.6, 127.1, 17);
    expect(mapSpy.flyTo).not.toHaveBeenCalled();

    // 요청이 비워진 다음 렌더에서도 같은 대상으로 flyTo 를 다시 부르지 않는다.
    rerender({ markers: [A, B], hoveredPlaceId: 'B', zoomFocus: null, onZoomFocusConsumed: consumed });
    expect(mapSpy.flyTo).not.toHaveBeenCalled();
    expect(consumed).toHaveBeenCalledTimes(1);
  });

  it('좌표 없는 식당의 확대 요청은 이동 없이 비워진다', async () => {
    const consumed = vi.fn();
    const { rerender } = renderMap({ markers: [A], onZoomFocusConsumed: consumed });
    await screen.findByTestId('map-canvas');

    rerender({ markers: [A], zoomFocus: { placeId: 'no-marker' }, onZoomFocusConsumed: consumed });
    expect(mapSpy.flyToZoomIn).not.toHaveBeenCalled();
    expect(consumed).toHaveBeenCalledTimes(1);
  });

  it('첫 등록 마커 묶음 fit 은 한 번만 한다', async () => {
    const { rerender } = renderMap({ markers: [S] });
    await screen.findByTestId('map-canvas');
    // 검색 결과(primary)만 있을 땐 맞추지 않는다.
    expect(mapSpy.fitToMarkers).not.toHaveBeenCalled();

    rerender({ markers: [S, A, B] });
    expect(mapSpy.fitToMarkers).toHaveBeenCalledTimes(1);

    rerender({ markers: [S, { ...A }, { ...B }] });
    rerender({ markers: [S] });
    rerender({ markers: [S, A] });
    expect(mapSpy.fitToMarkers).toHaveBeenCalledTimes(1);
  });
});
