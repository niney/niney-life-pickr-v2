import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
import { useAirLocationStore, useAuthStore } from '@repo/shared';
import { latLngToKmaGrid } from '@repo/utils';
import { server } from '~/test/msw';
import { WeatherPage } from './WeatherPage';

// 날씨 페이지 스모크 — 서버 프록시 응답(축약 합성)으로 ① 실황 히어로 ② 3일 메테오그램
// ③ 열흘(단기+중기 병합) ④ 중기전망 ⑤ 해상 ⑥ 발표 정보가 한 화면에 그려지는지, 시도→지점
// 2단 셀렉트가 URL(?p=)·격자·중기 구역을 바꾸는지, 저장한 내 위치(대기정보와 공유)로 기본
// 진입·저장·해제가 되는지, 업스트림 503 이 안내 문구로 떨어지는지.
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
beforeEach(() => {
  window.localStorage.clear();
  useAuthStore.setState({ token: null, user: null, isGuest: false });
  useAirLocationStore.setState({ location: null });
  seen.nowcast = [];
  seen.mid = [];
  seen.sea = [];
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
    http.get('/api/v1/weather/aws', ({ request }) => {
      const u = new URL(request.url);
      return HttpResponse.json({
        enabled: true,
        center: { lat: Number(u.searchParams.get('lat')), lng: Number(u.searchParams.get('lng')) },
        items: [
          {
            stn: '400', name: '양천구', lat: 37.522, lng: 126.876, ht: 10.5, dist: 1100, tm: '202608211810', observedAt: '2026-08-21T18:10:00+09:00',
            ta: 27.4, hm: 70, wd10: 227, ws10: 1.4, re: 1, rn15m: 0.5, rn60m: 1.0, rn12h: 2.0, rnDay: 3.5, td: 21.6, pa: 1004.2,
          },
        ],
        tm: '202608211810',
        fetchedAt: '2026-08-21T09:11:00.000Z',
        stale: false,
      });
    }),
  );

const sidoSelect = () => screen.getByRole('combobox', { name: '시도 선택' }) as HTMLSelectElement;
const placeSelect = () => screen.getByRole('combobox', { name: '지점 선택' }) as HTMLSelectElement;

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
    // AWS 보강 줄 — 관측소·거리·값 + 실황(강수형태 없음)과 어긋나는 15분 강수 감지 배지.
    const awsLine = await within(now).findByTestId('weather-aws-line');
    expect(awsLine).toHaveTextContent('근처 관측소(AWS) 양천구');
    expect(awsLine).toHaveTextContent('1.1km');
    expect(awsLine).toHaveTextContent('27.4℃');
    expect(awsLine).toHaveTextContent(/최근 15분 강수를 감지/);
    expect(sidoSelect().value).toBe('서울');
    expect(placeSelect().value).toBe('11B10101');
    // 서울 지점 목록 = 시청(전체) + 25구.
    expect(placeSelect().options).toHaveLength(26);
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

  it('시도→지점 2단 셀렉트: 부산을 고르면 시청(98,76)·중기 11H20000/11H20201/159·남해동부, 해운대구를 고르면 구청 격자·같은 중기 지점', async () => {
    useHandlers();
    renderPage();
    await screen.findByRole('region', { name: /지금 · 서울/ });
    fireEvent.change(sidoSelect(), { target: { value: '부산' } });
    await screen.findByRole('region', { name: /지금 · 부산$/ });
    expect(seen.nowcast.at(-1)).toBe('?nx=98&ny=76');
    expect(seen.mid.at(-1)).toBe('?land=11H20000&ta=11H20201&stn=159');
    expect(seen.sea.at(-1)).toBe('?regId=12B20000');
    // 부산 목록 = 시청(전체) + 16구·군.
    expect(placeSelect().options).toHaveLength(17);
    fireEvent.change(placeSelect(), { target: { value: '11H20201-해운대구' } });
    await screen.findByRole('region', { name: /지금 · 부산 해운대구/ });
    const g = latLngToKmaGrid(35.163, 129.1637);
    expect(seen.nowcast.at(-1)).toBe(`?nx=${g.nx}&ny=${g.ny}`);
    expect(seen.mid.at(-1)).toBe('?land=11H20000&ta=11H20201&stn=159');
  });

  it('?ll= 좌표면 격자는 좌표로, 중기예보·표시명은 가장 가까운 지점(구 단위) 기준으로 적는다', async () => {
    useHandlers();
    renderPage('/weather?ll=37.52329,126.85869');
    await screen.findByRole('region', { name: /지금 · 내 위치 · 서울 양천구 기준/ });
    const g = latLngToKmaGrid(37.52329, 126.85869);
    expect(seen.nowcast.at(-1)).toBe(`?nx=${g.nx}&ny=${g.ny}`);
    expect(seen.mid.at(-1)).toBe('?land=11B00000&ta=11B10101&stn=109');
    expect(sidoSelect().value).toBe('서울');
    expect(placeSelect().value).toBe('');
  });

  it('URL 이 비어 있고 저장한 내 위치가 있으면(대기정보와 공유) 그 좌표로 열고 "내 위치(라벨)" + 저장됨·해제를 보인다', async () => {
    useHandlers();
    useAirLocationStore.getState().setLocation({ lat: 37.52329, lng: 126.85869, label: '양천구', source: 'station' });
    renderPage();
    await screen.findByRole('region', { name: /지금 · 내 위치\(양천구\)/ });
    const g = latLngToKmaGrid(37.52329, 126.85869);
    expect(seen.nowcast.at(-1)).toBe(`?nx=${g.nx}&ny=${g.ny}`);
    expect(screen.getByRole('button', { name: /내 위치로 저장됨/ })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /저장한 내 위치/ })).toBeNull();
    // 해제 → 저장 위치 없음 → 저장 버튼으로 돌아온다(화면은 그대로 그 좌표).
    fireEvent.click(screen.getByRole('button', { name: '내 위치 해제' }));
    await waitFor(() => expect(useAirLocationStore.getState().location).toBeNull());
    expect(await screen.findByRole('button', { name: /이 지점을 내 위치로 저장/ })).toBeEnabled();
  });

  it("'이 지점을 내 위치로 저장'은 지점 좌표·이름을 공유 저장소에 place 출처로 넣고, 다른 지점으로 가면 '저장한 내 위치(부산)' 바로가기가 뜬다", async () => {
    useHandlers();
    renderPage('/weather?p=11H20201');
    await screen.findByRole('region', { name: /지금 · 부산$/ });
    fireEvent.click(screen.getByRole('button', { name: /이 지점을 내 위치로 저장/ }));
    expect(useAirLocationStore.getState().location).toMatchObject({ lat: 35.1801, lng: 129.0754, label: '부산', source: 'place' });
    expect(await screen.findByRole('button', { name: /내 위치로 저장됨/ })).toBeDisabled();
    fireEvent.change(sidoSelect(), { target: { value: '서울' } });
    await screen.findByRole('region', { name: /지금 · 서울$/ });
    expect(screen.getByRole('button', { name: /이 지점을 내 위치로 저장/ })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: /저장한 내 위치\(부산\)/ }));
    await screen.findByRole('region', { name: /지금 · 내 위치\(부산\)/ });
    expect(seen.nowcast.at(-1)).toBe('?nx=98&ny=76');
  });

  it('업스트림 503(키 없음)은 섹션 안내 문구로 떨어진다', async () => {
    server.use(
      http.get('/api/v1/weather/nowcast', () => HttpResponse.json({ message: 'DATA_GO_KR_API_KEY 가 설정되지 않아', error: 'Service Unavailable', statusCode: 503 }, { status: 503 })),
      http.get('/api/v1/weather/forecast', () => HttpResponse.json(forecast)),
      http.get('/api/v1/weather/mid', () => HttpResponse.json(mid)),
      http.get('/api/v1/weather/mid/sea', () => HttpResponse.json(sea)),
      http.get('/api/v1/weather/versions', () => HttpResponse.json(versions)),
      http.get('/api/v1/weather/aws', () =>
        HttpResponse.json({ enabled: false, center: { lat: 37.5666, lng: 126.9784 }, items: [], tm: null, fetchedAt: '2026-08-21T09:11:00.000Z', stale: false }),
      ),
    );
    renderPage();
    expect(await screen.findByText(/서버에 기상청 API 키가 없거나 일일 한도가 찼습니다/)).toBeInTheDocument();
  });
});
