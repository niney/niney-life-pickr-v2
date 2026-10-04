import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as KmaApiAdapter from './modules/weather/kma-api.adapter.js';

// 앱 연결 — plugins/weather.ts 가 decorate 한 app.weather 를 날씨 라우트와 식단 추천 라우트가 함께 쓰는지(C-5).
// 기상청 어댑터만 mock(실호출 없음), DB 는 현재 스키마로 만든 빈 임시 DB(카탈로그가 비어 추천은 LLM 없이 폴백).
vi.hoisted(() => {
  process.env.DATA_GO_KR_API_KEY = process.env.DATA_GO_KR_API_KEY || 'test-kma-key';
});
const mocks = vi.hoisted(() => ({
  getUltraSrtNcst: vi.fn(),
  getUltraSrtFcst: vi.fn(),
}));
vi.mock('./modules/weather/kma-api.adapter.js', async (importOriginal) => {
  const actual = await importOriginal<typeof KmaApiAdapter>();
  return { ...actual, ...mocks };
});

import { latLngToKmaGrid } from '@repo/utils';
import { buildApp } from './app.js';
import { WEATHER_ADVICE_WAIT_MS, WeatherService } from './modules/weather/weather.service.js';
import { useSchemaDatabase } from './test-utils/schema-db.js';
import type { IsolatedDatabase } from './test-utils/temp-db.js';

const ncstRows = (t1h: string) =>
  ['T1H', 'RN1', 'REH', 'PTY', 'VEC', 'WSD', 'UUU', 'VVV'].map((category) => ({
    baseDate: '20260821',
    baseTime: '1500',
    category,
    nx: 60,
    ny: 127,
    obsrValue: category === 'T1H' ? t1h : '0',
    fcstDate: null,
    fcstTime: null,
    fcstValue: null,
  }));
const kstToday = (): string => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });

describe('app.weather — 날씨·식단 추천 라우트가 WeatherService 하나를 공유한다(C-5)', () => {
  let app: FastifyInstance;
  let isolated: IsolatedDatabase;
  let token = '';

  beforeAll(async () => {
    // 추천 경로가 혹시라도 외부(LLM)로 나가면 바로 실패하게 — 이 테스트는 네트워크를 쓰지 않는다.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network disabled in test');
      }),
    );
    isolated = useSchemaDatabase();
    app = await buildApp({ logger: false });
    await app.ready();
    const user = await app.prisma.user.create({ data: { email: 'weather-c5@test.local', passwordHash: 'x' } });
    token = app.jwt.sign({ userId: user.id, email: user.email, role: 'USER', tv: user.tokenVersion });
  });
  afterAll(async () => {
    await app.close();
    isolated.restore();
    vi.unstubAllGlobals();
  });
  beforeEach(() => {
    mocks.getUltraSrtNcst.mockReset();
    mocks.getUltraSrtFcst.mockReset();
  });

  const recommend = (lat: number, lng: number) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/meals/recommendations',
      headers: { authorization: `Bearer ${token}` },
      payload: { targetDate: kstToday(), targetSlot: 'lunch', lat, lng },
    });

  it('날씨 라우트가 받아 둔 격자는 추천이 업스트림 없이 그대로 쓴다', async () => {
    expect(app.weather).toBeInstanceOf(WeatherService);
    mocks.getUltraSrtNcst.mockResolvedValue({ rows: ncstRows('21.5'), noData: false });
    mocks.getUltraSrtFcst.mockResolvedValue({ rows: [], noData: false });
    const { nx, ny } = latLngToKmaGrid(37.5665, 126.978);
    const w = await app.inject({ method: 'GET', url: `/api/v1/weather/nowcast?nx=${nx}&ny=${ny}` });
    expect(w.statusCode).toBe(200);
    const calls = mocks.getUltraSrtNcst.mock.calls.length;

    const res = await recommend(37.5665, 126.978);
    expect(res.statusCode).toBe(200);
    // 추천이 별도 인스턴스였다면 같은 격자를 업스트림에 한 번 더 물었다.
    expect(mocks.getUltraSrtNcst.mock.calls.length).toBe(calls);
  });

  it('처음 보는 격자 + 매달린 업스트림 — 추천은 대기 상한 뒤 날씨 없이(계절 추정) 나온다', async () => {
    mocks.getUltraSrtNcst.mockImplementation(() => new Promise(() => {}));
    mocks.getUltraSrtFcst.mockImplementation(() => new Promise(() => {}));
    const t0 = Date.now();
    const res = await recommend(35.1796, 129.0756);
    expect(res.statusCode).toBe(200);
    expect(Date.now() - t0).toBeLessThan(WEATHER_ADVICE_WAIT_MS + 3_000);
    expect(mocks.getUltraSrtNcst).toHaveBeenCalledTimes(1);
  });
});
