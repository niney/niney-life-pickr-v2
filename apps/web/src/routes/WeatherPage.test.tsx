import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type {
  WeatherForecastResultType,
  WeatherMidResultType,
  WeatherMidSeaResultType,
  WeatherNowcastResultType,
  WeatherVersionsResultType,
} from '@repo/api-contract';
import { server } from '~/test/msw';
import { WeatherPage } from './WeatherPage';

// 날씨 페이지 스모크 — 서버 프록시 응답(축약 합성)으로 ① 실황 히어로 ② 3일 메테오그램
// ③ 열흘(단기+중기 병합) ④ 중기전망 ⑤ 해상 ⑥ 발표 정보가 한 화면에 그려지는지, 지점
// 셀렉트가 URL(?p=) 과 격자를 바꾸는지, 업스트림 503 이 안내 문구로 떨어지는지.
// jsdom 에는 ResizeObserver 가 없어(메테오그램 폭 측정) 무해한 스텁을 심는다.

beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterAll(() => {
  vi.unstubAllGlobals();
});

const precip = (text: string, value: number | null, none: boolean) => ({ text, value, none });

const hour = (fcstDate: string, fcstTime: string, tmp: number, over: Partial<WeatherForecastResultType['hours'][number]> = {}) => ({
  fcstDate,
  fcstTime,
  at: `${fcstDate.slice(0, 4)}-${fcstDate.slice(4, 6)}-${fcstDate.slice(6, 8)}T${fcstTime.slice(0, 2)}:00:00+09:00`,
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
  ...over,
});

const nowcast: WeatherNowcastResultType = {
  grid: { nx: 60, ny: 127 },
  ncstBase: { date: '20260821', time: '1500', at: '2026-08-21T15:00:00+09:00' },
  now: { t1h: 27.9, rn1: 0, reh: 73, pty: 0, vec: 187, wsd: 0.8, uuu: 0.1, vvv: 0.8 },
  ultraBase: { date: '20260821', time: '1530', at: '2026-08-21T15:30:00+09:00' },
  hours: [16, 17, 18, 19, 20, 21].map((h) => ({
    fcstDate: '20260821',
    fcstTime: `${String(h).padStart(2, '0')}00`,
    at: `2026-08-21T${String(h).padStart(2, '0')}:00:00+09:00`,
    t1h: 28 - (h - 16),
    rn1: precip('강수없음', 0, true),
    sky: 4,
    pty: 0,
    pop: 30,
    reh: 70,
    wsd: 1.5,
    vec: 200,
    uuu: 0,
    vvv: 1,
    lgt: 0,
  })),
  ncstFallback: false,
  ultraFallback: false,
  fetchedAt: '2026-08-21T07:05:00.000Z',
  stale: false,
};

const forecast: WeatherForecastResultType = {
  grid: { nx: 60, ny: 127 },
  base: { date: '20260821', time: '1400', at: '2026-08-21T14:00:00+09:00' },
  fallback: false,
  hours: [
    hour('20260821', '1500', 29),
    hour('20260821', '1800', 27, { pty: 1, pop: 60, pcp: precip('1mm 미만', 0.5, false) }),
    hour('20260822', '0600', 24, { tmn: 24 }),
    hour('20260822', '1500', 32, { tmx: 32, sky: 1 }),
  ],
  days: [
    { date: '2026-08-21', tmn: 27, tmx: 29, tmnFromHours: true, tmxFromHours: true, popMax: 60, am: null, pm: { sky: 3, pty: 1, pop: 60, hours: 2 }, partial: true, hours: 2 },
    { date: '2026-08-22', tmn: 24, tmx: 32, tmnFromHours: false, tmxFromHours: false, popMax: 20, am: { sky: 3, pty: 0, pop: 20, hours: 1 }, pm: { sky: 1, pty: 0, pop: 20, hours: 1 }, partial: true, hours: 2 },
  ],
  total: 4,
  fetchedAt: '2026-08-21T07:05:00.000Z',
  stale: false,
};

const mid: WeatherMidResultType = {
  tmFc: '202608210600',
  announcedAt: '2026-08-21T06:00:00+09:00',
  fallback: false,
  land: {
    regId: '11B00000',
    days: [
      { day: 4, date: '2026-08-25', am: { wf: '구름많음', rnSt: 20 }, pm: { wf: '흐리고 비', rnSt: 70 }, all: null },
      { day: 8, date: '2026-08-29', am: null, pm: null, all: { wf: '맑음', rnSt: 10 } },
    ],
  },
  ta: {
    regId: '11B10101',
    days: [
      { day: 4, date: '2026-08-25', taMin: 25, taMinLow: 1, taMinHigh: 1, taMax: 32, taMaxLow: 1, taMaxHigh: 2 },
      { day: 8, date: '2026-08-29', taMin: 23, taMinLow: 2, taMinHigh: 2, taMax: 30, taMaxLow: 2, taMaxHigh: 2 },
    ],
  },
  outlook: { stnId: '109', text: '○ (하늘상태) 이번 예보기간은 구름많겠습니다.\n○ (기온) 아침 21~26℃' },
  fetchedAt: '2026-08-21T07:05:00.000Z',
  stale: false,
};

const sea: WeatherMidSeaResultType = {
  tmFc: '202608210600',
  announcedAt: '2026-08-21T06:00:00+09:00',
  fallback: false,
  regId: '12A20000',
  days: [{ day: 4, date: '2026-08-25', am: { wf: '구름많음', whMin: 1, whMax: 2 }, pm: { wf: '구름많음', whMin: 0.5, whMax: 1.5 }, all: null }],
  fetchedAt: '2026-08-21T07:05:00.000Z',
  stale: false,
};

const versions: WeatherVersionsResultType = {
  items: [
    { ftype: 'ODAM', label: '초단기실황', base: { date: '20260821', time: '1500', at: '2026-08-21T15:00:00+09:00' }, version: '20260821155556', versionAt: '2026-08-21T15:55:56+09:00' },
    { ftype: 'VSRT', label: '초단기예보', base: { date: '20260821', time: '1530', at: '2026-08-21T15:30:00+09:00' }, version: '20260821160358', versionAt: '2026-08-21T16:03:58+09:00' },
    { ftype: 'SHRT', label: '단기예보', base: { date: '20260821', time: '1400', at: '2026-08-21T14:00:00+09:00' }, version: '20260821114850', versionAt: '2026-08-21T11:48:50+09:00' },
  ],
  fetchedAt: '2026-08-21T07:05:00.000Z',
  stale: false,
};

const renderPage = (initialUrl = '/weather') => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <Routes>
          <Route path="/weather" element={<WeatherPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

const seen = { nowcast: [] as string[], mid: [] as string[], sea: [] as string[] };
const useHandlers = () =>
  server.use(
    http.get('/api/v1/weather/nowcast', ({ request }) => {
      seen.nowcast.push(new URL(request.url).search);
      return HttpResponse.json(nowcast);
    }),
    http.get('/api/v1/weather/forecast', () => HttpResponse.json(forecast)),
    http.get('/api/v1/weather/mid', ({ request }) => {
      seen.mid.push(new URL(request.url).search);
      return HttpResponse.json(mid);
    }),
    http.get('/api/v1/weather/mid/sea', ({ request }) => {
      seen.sea.push(new URL(request.url).search);
      return HttpResponse.json(sea);
    }),
    http.get('/api/v1/weather/versions', () => HttpResponse.json(versions)),
  );

describe('WeatherPage', () => {
  it('기본 지점(서울, 격자 60,127)으로 실황·6시간·3일·열흘·전망·해상·발표 정보를 한 화면에 그린다', async () => {
    useHandlers();
    renderPage();
    // ① 실황 히어로 — 기온·습도·바람 16방위.
    const now = await screen.findByRole('region', { name: /지금 · 서울/ });
    expect(await within(now).findByText('27.9')).toBeInTheDocument();
    expect(within(now).getByText('73%')).toBeInTheDocument();
    expect(within(now).getByText(/남풍/)).toBeInTheDocument();
    // 초단기 6시간 띠.
    expect(within(now).getByRole('table', { name: '초단기예보 6시간' })).toBeInTheDocument();
    expect(seen.nowcast.at(-1)).toBe('?nx=60&ny=127');
    // ② 메테오그램 + 표 쌍둥이(4시각).
    const three = screen.getByRole('region', { name: '3일 시간별' });
    expect(await within(three).findByRole('img', { name: /3일 시간별 예보 \(4시각\)/ })).toBeInTheDocument();
    expect(within(three).getByText('표로 보기 (4행)')).toBeInTheDocument();
    // ③ 열흘 — 단기 2일 + 중기 2일 = 4칸, 중기 칸에 오차 범위.
    const ten = screen.getByRole('region', { name: '열흘' });
    expect(await within(ten).findByText('표로 보기 (4일)')).toBeInTheDocument();
    expect(within(within(ten).getByRole('table', { name: '열흘 예보' })).getAllByRole('cell')).toHaveLength(4);
    expect(within(ten).getAllByText(/중기예보/).length).toBeGreaterThan(0);
    expect(seen.mid.at(-1)).toBe('?land=11B00000&ta=11B10101&stn=109');
    // ④ 중기전망 원문(줄바꿈 유지).
    const outlook = screen.getByRole('region', { name: '중기전망' });
    expect(await within(outlook).findByText(/이번 예보기간은 구름많겠습니다/)).toBeInTheDocument();
    // ⑤ 해상 — 서울·인천·경기 권역 기본 해역 서해중부, 파고.
    const seaRegion = screen.getByRole('region', { name: '중기해상예보' });
    expect(await within(seaRegion).findByText(/파고 1~2m/)).toBeInTheDocument();
    expect((within(seaRegion).getByRole('combobox', { name: '해역 선택' }) as HTMLSelectElement).value).toBe('12A20000');
    // ⑥ 발표 정보 — getFcstVersion 버전.
    const info = screen.getByRole('region', { name: '발표 정보' });
    expect(await within(info).findByText('8/21 15:55:56')).toBeInTheDocument();
  });

  it('지점을 바꾸면 격자와 중기 구역이 바뀌어 다시 묻는다(부산 → 98,76 · 11H20000/11H20201/159 · 남해동부)', async () => {
    useHandlers();
    renderPage();
    await screen.findByRole('region', { name: /지금 · 서울/ });
    fireEvent.change(screen.getByRole('combobox', { name: '지점 선택' }), { target: { value: '11H20201' } });
    await screen.findByRole('region', { name: /지금 · 부산/ });
    expect(seen.nowcast.at(-1)).toBe('?nx=98&ny=76');
    expect(seen.mid.at(-1)).toBe('?land=11H20000&ta=11H20201&stn=159');
    expect(seen.sea.at(-1)).toBe('?regId=12B20000');
  });

  it('?ll= 좌표면 격자는 좌표로, 중기예보는 가장 가까운 지점 기준으로 라벨을 적는다', async () => {
    useHandlers();
    renderPage('/weather?ll=37.5219,126.9245');
    await screen.findByRole('region', { name: /지금 · 내 위치 · 서울 기준/ });
    expect(seen.nowcast.at(-1)).toBe('?nx=59&ny=126');
  });

  it('업스트림 503(키 없음)은 섹션 안내 문구로 떨어진다', async () => {
    server.use(
      http.get('/api/v1/weather/nowcast', () => HttpResponse.json({ message: 'KMA_API_KEY 가 설정되지 않아', error: 'Service Unavailable', statusCode: 503 }, { status: 503 })),
      http.get('/api/v1/weather/forecast', () => HttpResponse.json(forecast)),
      http.get('/api/v1/weather/mid', () => HttpResponse.json(mid)),
      http.get('/api/v1/weather/mid/sea', () => HttpResponse.json(sea)),
      http.get('/api/v1/weather/versions', () => HttpResponse.json(versions)),
    );
    renderPage();
    expect(await screen.findByText(/서버에 기상청 API 키가 없거나 일일 한도가 찼습니다/)).toBeInTheDocument();
  });
});
