import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { WeatherForecastHourType } from '@repo/api-contract';
import { WeatherMeteogram } from './WeatherMeteogram';

// 3일 시간별 메테오그램 — 컨테이너 실측 폭으로 SVG 를 그린다(weatherFormat 의 useElementWidth). jsdom 에는
// 레이아웃이 없어 clientWidth 를 심고, ResizeObserver 는 무해한 스텁으로 둔다.

const precip = (text: string, value: number | null, none: boolean) => ({ text, value, none });

const hour = (fcstTime: string, tmp: number): WeatherForecastHourType => ({
  fcstDate: '20260821',
  fcstTime,
  at: `2026-08-21T${fcstTime.slice(0, 2)}:00:00+09:00`,
  tmp,
  tmn: null,
  tmx: null,
  sky: 3,
  pty: 0,
  pop: 20,
  pcp: precip('강수없음', 0, true),
  sno: precip('적설없음', 0, true),
  reh: 60,
  wsd: 2,
  vec: 180,
  uuu: 0,
  vvv: 2,
  wav: 0,
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
  Object.defineProperty(Element.prototype, 'clientWidth', { configurable: true, get: () => 720 });
});
afterAll(() => {
  vi.unstubAllGlobals();
  if (clientWidth) Object.defineProperty(Element.prototype, 'clientWidth', clientWidth);
});

describe('WeatherMeteogram', () => {
  // 회귀: 폭을 재는 effect 가 마운트 때 한 번만 돌아, 빈 예보("표시할 예보가 없습니다")로 먼저 마운트된 뒤 데이터가
  // 오면 관찰이 시작되지 않았다 — 폭이 0 으로 남아 최소 폭(320)으로 그린 그림이 늘어났다.
  it('빈 예보로 먼저 마운트된 뒤 데이터가 와도 실측 폭으로 그린다', () => {
    const { rerender } = render(<WeatherMeteogram hours={[]} todayYmd="2026-08-21" />);
    expect(screen.getByText('표시할 예보가 없습니다.')).toBeInTheDocument();

    rerender(<WeatherMeteogram hours={[hour('1500', 29), hour('1600', 28)]} todayYmd="2026-08-21" />);
    const svg = screen.getByRole('img', { name: /3일 시간별 예보 \(2시각\)/ });
    expect(svg.getAttribute('viewBox')).toMatch(/^0 0 720 /);
  });
});
