import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { AirHistoryPointType } from '@repo/api-contract';
import { AirHistoryChart } from './AirHistoryChart';

// 측정소 시계열 차트 — 컨테이너 실측 폭으로 SVG 를 그린다. jsdom 에는 레이아웃이 없어 clientWidth 를 심고,
// ResizeObserver 는 무해한 스텁으로 둔다(처음 붙을 때 한 번 재는 값만 본다).

const point = (time: string, pm10: number): AirHistoryPointType => ({
  time,
  measuredAt: null,
  so2: null,
  co: null,
  o3: null,
  no2: null,
  pm10,
  pm25: pm10 / 2,
  khai: null,
});

const clientWidth = Object.getOwnPropertyDescriptor(Element.prototype, 'clientWidth');

beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Object.defineProperty(Element.prototype, 'clientWidth', { configurable: true, get: () => 640 });
});
afterAll(() => {
  vi.unstubAllGlobals();
  if (clientWidth) Object.defineProperty(Element.prototype, 'clientWidth', clientWidth);
});

describe('AirHistoryChart', () => {
  it('컨테이너 실측 폭으로 그린다', () => {
    render(
      <AirHistoryChart
        points={[point('2026-08-21 13:00', 30), point('2026-08-21 14:00', 40)]}
        unit="hour"
        metric="pm"
        todayYmd="2026-08-21"
      />,
    );
    expect(screen.getByRole('img', { name: /추이 \(2개 지점\)/ })).toHaveAttribute('viewBox', '0 0 640 230');
  });

  // 회귀: 폭을 재는 effect 가 마운트 때 한 번만 돌아, 빈 시계열("표시할 시계열이 없습니다")로 먼저 마운트된 뒤
  // 데이터가 오면 관찰이 시작되지 않았다 — 폭이 0 으로 남아 최소 폭(280)으로 그린 그림이 늘어났다.
  it('빈 시계열로 먼저 마운트된 뒤 데이터가 와도 실측 폭으로 그린다', () => {
    const { rerender } = render(<AirHistoryChart points={[]} unit="hour" metric="pm" todayYmd="2026-08-21" />);
    expect(screen.getByText('표시할 시계열이 없습니다.')).toBeInTheDocument();

    rerender(
      <AirHistoryChart
        points={[point('2026-08-21 13:00', 30), point('2026-08-21 14:00', 40)]}
        unit="hour"
        metric="pm"
        todayYmd="2026-08-21"
      />,
    );
    expect(screen.getByRole('img', { name: /추이 \(2개 지점\)/ })).toHaveAttribute('viewBox', '0 0 640 230');
  });
});
