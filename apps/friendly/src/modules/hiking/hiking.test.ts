import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// 산불위험예보는 라우트 안 서비스가 어댑터를 직접 부른다 — 업스트림 대신 고정 행.
const fire = vi.hoisted(() => ({ rows: [] as unknown[] }));
vi.mock('./hiking-api.adapter.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./hiking-api.adapter.js')>()),
  fetchFireRisk: vi.fn(async () => fire.rows),
}));

import type {
  AirForecastResultType,
  AirNearbyResultType,
  HikingAroundType,
  HikingConditionsType,
  HikingRecommendResultType,
  HikingCourseDetailType,
  HikingMountainDetailType,
  HikingMountainsResultType,
  WeatherForecastHourType,
  WeatherForecastResultType,
} from '@repo/api-contract';
import { decodePolyline, kmaTodayIsoDate } from '@repo/utils';
import { buildApp } from '../../app.js';
import { useIsolatedDatabase, type IsolatedDatabase } from '../../test-utils/temp-db.js';
import type { FireRiskRow, GdTrailRow, TrekkingPoiRow } from './hiking-api.adapter.js';
import type { SigunguShape } from './hiking-area.js';
import { buildHikingRows, matchGpxFolder, replaceHiking } from './hiking-master.service.js';

// 등산 라우트 — 격리 DB(빈 테이블)에 합성 GPX 2코스 + 명산등산로 1행 + 등산트레킹 POI 를 buildHikingRows → replaceHiking
// 으로 넣고 ① 미적재 503 ② 산 목록(정상 좌표·권역·사진) ③ 산 상세(코스 선 복원·험한 노면) ④ 코스 상세(프로필·지점 병합·
// API 지점 연결) ⑤ 오늘의 조건(날씨·대기는 앱 싱글톤을 spy, 산불은 어댑터 mock) ⑥ 404·400 을 본다.

// 합성 시군구 — 들머리 쪽(37.000~37.003) 춘천, 정상 쪽(37.003~37.010) 홍천.
const box = (key: string, lat0: number, lat1: number): SigunguShape => ({
  key,
  polygons: [[[[126.99, lat0], [127.01, lat0], [127.01, lat1], [126.99, lat1], [126.99, lat0]]]],
  bbox: { minLng: 126.99, minLat: lat0, maxLng: 127.01, maxLat: lat1 },
});
const SIGUNGU = [box('51:춘천시', 36.99, 37.003), box('51:홍천군', 37.003, 37.01)];
const ymdPlus = (d: number) => kmaTodayIsoDate(new Date(Date.now() + d * 86_400_000));

const STEP = 0.0002; // ≈22m
const trkpt = (lat: number, ele: number) => `<trkpt lat="${lat.toFixed(6)}" lon="127.000000"><ele>${ele}</ele></trkpt>`;
const wpt = (sym: string, lat: number, ele: number, name: string, cat: string, signs: string[] = []) =>
  `<wpt lat="${lat.toFixed(6)}" lon="127.000000"><ele>${ele}</ele><sym><![CDATA[${sym}]]></sym><name><![CDATA[${name}]]></name>` +
  `<extensions><category><![CDATA[${cat}]]></category>${signs.map((s, i) => `<signpost${i + 1}><![CDATA[${s}]]></signpost${i + 1}>`).join('')}</extensions></wpt>`;
const gpx = (wpts: string[], pts: string[], rtsc = '') =>
  `<?xml version="1.0"?><gpx>${wpts.join('')}<trk><trkseg>${pts.join('')}</trkseg></trk>${rtsc ? `<extensions>${rtsc}</extensions>` : ''}</gpx>`;

// 37.000(들머리 300m) → 37.006(정상 900m) 편도 31점 ≈ 667m, 오르며 기록. 끝 근처 암릉.
const COURSE1 = gpx(
  [
    wpt('101', 37.0, 300, '들머리 장구목이', 'ENTRY'),
    wpt('102', 37.003, 600, '갈림길', 'SIGN', ['정상;ST']),
    wpt('103', 37.006, 900, '정상', 'PEAK'),
  ],
  Array.from({ length: 31 }, (_, i) => trkpt(37 + i * STEP, 300 + i * 20)),
  '<rtsc ept="31" fin="1" rtcd="5" scid="1" spt="25"><name><![CDATA[암릉]]></name></rtsc>',
);
// 같은 길을 내려가며 기록한 코스 — 뒤집혀 들머리에서 시작해야 한다.
// 정상(201)은 1번 코스의 103 과 분류·이름·좌표가 같은 다른 번호 — 하나로 접혀야 한다(원본 ~500건).
const COURSE2 = gpx(
  [wpt('201', 37.006, 900, '정상', 'PEAK'), wpt('202', 37.0, 300, '주차장', 'PARK')],
  Array.from({ length: 31 }, (_, i) => trkpt(37.006 - i * STEP, 900 - i * 20)),
);

const GD: GdTrailRow = {
  id: '421100101',
  name: '가리산',
  heightM: 905,
  area: '강원도 춘천시 북산면ㆍ동면, 홍천군 두촌면ㆍ화촌면',
  subtitle: '진달래 많은 산',
  overview: '개관',
  details: '상세',
  reason: '강원도에서 진달래가 가장 많이 피는 산',
  officialCourses: '가리산자연휴양림-삼거리-정상 (총 4시간)',
};
const api = (p: Partial<TrekkingPoiRow> & { poiId: string; lat: number }): TrekkingPoiRow => ({
  mountainName: '가리산',
  category: 'SIGN',
  name: '갈림길',
  description: null,
  lng: 127,
  ele: null,
  signposts: [],
  ...p,
});

describe('hiking routes (격리 DB)', () => {
  let app: FastifyInstance;
  let isolated: IsolatedDatabase;

  beforeAll(async () => {
    isolated = await useIsolatedDatabase();
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    isolated.restore();
  });

  it('미적재 — 산 목록 503', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/hiking/mountains' });
    expect(res.statusCode).toBe(503);
    expect(res.json<{ message: string }>().message).toContain('load:hiking');
  });

  it('적재 후 목록·산 상세·코스 상세', async () => {
    const rows = buildHikingRows({
      files: [
        { mountain: '가리산', no: 1, xml: COURSE1 },
        { mountain: '가리산', no: 2, xml: COURSE2 },
      ],
      gdTrails: [GD],
      pois: [
        // GPX 갈림길(102)과 같은 곳 → 합쳐지고 이정표가 더 많은 쪽(API)을 쓴다. 번호가 GPX sym 과 같아도 다른 체계.
        api({ poiId: '0000000102', lat: 37.003, signposts: [{ dest: '정상', dir: 'ST' }, { dest: '휴양림', dir: 'UT' }] }),
        // GPX 에 없는 갈림길 — 코스 선에서 ≈9m(30m 안)이라 코스에 붙는다.
        api({ poiId: '0000000999', lat: 37.0045, lng: 127.0001 }),
        // 코스에서 먼 API 봉우리 — 산 지점엔 들어가지만 코스엔 안 붙는다.
        api({ poiId: '0000000500', category: 'PEAK', name: '가리산 2봉', lat: 37.01, lng: 127.01, ele: 880 }),
      ],
      images: new Map([['421100101', [1, 2]]]),
      sigungu: SIGUNGU,
      loadedAt: new Date('2026-10-25T00:00:00Z'),
    });
    expect(rows.report).toMatchObject({ courses: 2, reversed: 1, gpxSameSpot: 1, pois: { gpx: 3, api: 2, both: 1 } });
    expect(rows.report.sigungu).toEqual({ empty: [], maxPerCourse: 2 });
    expect(JSON.parse(rows.courses[0]!.sigungu!)).toEqual(['51:춘천시', '51:홍천군']);
    // 2번 코스의 정상도 대표 id(gpx:103)로 연결된다(같은 길이라 API 갈림길 999 도 붙는다).
    expect(rows.coursePois.filter((cp) => cp.courseId === '421100101-2').map((cp) => cp.poiId).sort()).toEqual([
      'api:0000000999',
      'gpx:103',
      'gpx:202',
    ]);
    await replaceHiking(app.prisma, rows);

    const list = await app.inject({ method: 'GET', url: '/api/v1/hiking/mountains' });
    expect(list.statusCode).toBe(200);
    expect(list.headers['cache-control']).toContain('max-age=3600');
    const l = list.json<HikingMountainsResultType>();
    expect(l.items).toHaveLength(1);
    // 정상은 '정상' 이름 + 공식 높이(905)에 가까운 GPX 봉우리(900m).
    expect(l.items[0]).toMatchObject({ id: '421100101', regions: ['gangwon'], courseCount: 2, images: [1, 2], lat: 37.006 });

    const m = (await app.inject({ method: 'GET', url: '/api/v1/hiking/mountains/421100101' })).json<HikingMountainDetailType>();
    expect(m.summitName).toBe('정상');
    expect(m.courses.map((c) => c.id)).toEqual(['421100101-1', '421100101-2']);
    const c1 = m.courses[0]!;
    expect(c1).toMatchObject({ name: '장구목이 → 가리산 정상', isLoop: false, roughSurfaces: ['암릉'] });
    // 정상에서 끝나는 편도 — 왕복 시간이 있고, 경사 90%(합성)라 어려움.
    expect(c1).toMatchObject({ shape: 'summit', difficulty: 'hard', steepPct: 90 });
    expect(c1.timeMin!).toBeGreaterThan(c1.timeRevMin!);
    expect(c1.roundTripMin!).toBeGreaterThan(c1.timeMin! + c1.timeRevMin!);
    // 2번은 정상에서 내려가며 기록했지만 뒤집혀 들머리 → 정상(summit).
    expect(m.courses[1]).toMatchObject({ shape: 'summit' });
    const line = decodePolyline(c1.pieces[0]!);
    expect(line[0]!.lat).toBeCloseTo(37, 5);
    expect(line.at(-1)!.lat).toBeCloseTo(37.006, 5);
    // 내려가며 기록한 2번도 들머리(낮은 끝)에서 시작한다.
    expect(decodePolyline(m.courses[1]!.pieces[0]!)[0]!.lat).toBeCloseTo(37, 5);

    const c = (await app.inject({ method: 'GET', url: '/api/v1/hiking/courses/421100101-1' })).json<HikingCourseDetailType>();
    expect(c.mountain).toEqual({ id: '421100101', name: '가리산', heightM: 905 });
    expect(c.profile.d[0]).toBe(0);
    expect(c.profile.d.at(-1)).toBe(c.lengthM);
    expect(c.surfaces).toEqual([expect.objectContaining({ type: '암릉' })]);
    expect(c.pois.map((p) => p.id)).toEqual(['gpx:101', 'gpx:102', 'api:0000000999', 'gpx:103']);
    expect(c.pois.map((p) => p.atM)).toEqual([...c.pois.map((p) => p.atM)].sort((a, b) => a - b));
    expect(c.pois.find((p) => p.id === 'gpx:102')!.signposts).toEqual([
      { dest: '정상', dir: 'ST' },
      { dest: '휴양림', dir: 'UT' },
    ]);
    // 코스 기준 안내는 이 GPX 의 이정표(기록 방향을 안다)로 — '정상'은 앞쪽(최고점)이라 가는 길.
    expect(c.pois.find((p) => p.id === 'gpx:102')!.guide).toEqual([{ dest: '정상', dir: 'ST', way: 'next' }]);
    expect(c.pois.find((p) => p.id === 'api:0000000999')!.guide).toEqual([]);
  });

  it('오늘의 조건 — 3일 해 시각, 가장 높은 곳 추정 기온, 가까운 측정소·예보 권역, 코스 시군구 산불 칸', async () => {
    const today = kmaTodayIsoDate(new Date());
    const ymd = today.replace(/-/g, '');
    const hour = (hh: string, tmp: number): WeatherForecastHourType => ({
      fcstDate: ymd,
      fcstTime: `${hh}00`,
      at: `${today}T${hh}:00:00+09:00`,
      tmp,
      tmn: null,
      tmx: null,
      sky: 1,
      pty: 0,
      pop: 10,
      pcp: { text: '강수없음', value: null, none: true },
      sno: { text: '적설없음', value: null, none: true },
      reh: 50,
      wsd: 3,
      vec: 200,
      uuu: null,
      vvv: null,
      wav: null,
    });
    const forecast = vi.spyOn(app.weather, 'getForecast').mockResolvedValue({
      grid: { nx: 1, ny: 1 },
      base: null,
      fallback: false,
      // 다른 날(그제) 칸은 빠진다.
      hours: [hour('09', 12), hour('10', 13), { ...hour('09', 5), fcstDate: '20000101' }],
      days: [],
      total: 3,
      fetchedAt: new Date().toISOString(),
      stale: false,
    } satisfies WeatherForecastResultType);
    const nearby = vi.spyOn(app.airQuality, 'getNearbyStations').mockResolvedValue({
      center: { lat: 37, lng: 127 },
      items: [
        // 측정값 없는 곳은 건너뛰고 다음 곳.
        { stationName: '빈곳', dist: 900, measure: null } as AirNearbyResultType['items'][number],
        { stationName: '북산면', dist: 4_200, measure: { pm10: 31, pm10Grade: 2, pm25: 12, pm25Grade: 1, measuredAt: `${today}T10:00:00+09:00` } } as AirNearbyResultType['items'][number],
      ],
      total: 2,
      fetchedAt: new Date().toISOString(),
      stale: false,
    });
    const airFc = vi.spyOn(app.airQuality, 'getForecast').mockResolvedValue({
      date: today,
      items: [
        { code: 'PM10', targetDate: today, grades: [{ region: '영서', grade: '나쁨' }, { region: '서울', grade: '좋음' }] },
        { code: 'PM25', targetDate: today, grades: [{ region: '강원영서', grade: '보통' }] },
      ] as AirForecastResultType['items'],
      fetchedAt: new Date().toISOString(),
      stale: false,
    });
    // 산불 칸은 지금 시각(정시) — 3시간 넘게 지난 칸은 서비스가 버린다.
    const slotAt = new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000).toISOString();
    fire.rows = [
      { key: '51:춘천시', sido: '강원특별자치도', name: '춘천시', at: slotAt, d1: 80, d2: 20, d3: 0, d4: 0, mean: 40, max: 55 },
      { key: '51:홍천군', sido: '강원특별자치도', name: '홍천군', at: slotAt, d1: 100, d2: 0, d3: 0, d4: 0, mean: 20, max: 30 },
      { key: '11:종로구', sido: '서울특별시', name: '종로구', at: slotAt, d1: 100, d2: 0, d3: 0, d4: 0, mean: 20, max: 30 },
      // 추천 테스트용 내일 06시 칸(산불 서비스가 3시간 캐시라 여기서 한 번에 넣는다).
      { key: '51:춘천시', sido: '강원특별자치도', name: '춘천시', at: `${ymdPlus(1)}T06:00:00+09:00`, d1: 0, d2: 0, d3: 100, d4: 0, mean: 70, max: 80 },
    ] satisfies FireRiskRow[];

    const res = await app.inject({ method: 'GET', url: '/api/v1/hiking/courses/421100101-1/conditions' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toContain('max-age=300');
    const out = res.json<HikingConditionsType>();
    expect(out.errors).toEqual({ weather: null, air: null, fire: null });
    expect(out.days).toHaveLength(3);
    expect(out.days[0]!.date).toBe(today);
    expect(Date.parse(out.days[0]!.sunset!)).toBeGreaterThan(Date.parse(out.days[0]!.sunrise!));
    // 들머리 → 가장 높은 곳(고도 정리 뒤 값) 100m 당 0.6°C 낮다 — 합성 코스는 ≈560m 차이라 ≈3.4°C.
    const drop = (0.6 * (out.topEle! - out.ref.ele!)) / 100;
    expect(drop).toBeGreaterThan(3);
    expect(out.weather!.hours.map((h) => h.tmp)).toEqual([12, 13]);
    expect(out.weather!.hours[0]!.topTmp).toBeCloseTo(12 - drop, 1);
    expect(out.air).toMatchObject({ station: { name: '북산면', distM: 4_200 }, pm10: 31, regions: ['영서'] });
    expect(out.air!.forecast).toEqual([{ date: today, pm10Grade: 3, pm25Grade: 2 }]);
    expect(out.fire!.areas.map((a) => [a.key, a.slots[0]!.d2])).toEqual([
      ['51:춘천시', 20],
      ['51:홍천군', 0],
    ]);
    // 측정소·격자는 들머리 좌표로.
    expect(nearby).toHaveBeenCalledWith(37, 127, 30_000, 3);
    expect(forecast).toHaveBeenCalledTimes(1);
    expect(airFc).toHaveBeenCalledTimes(1);

    // 날씨가 실패해도 나머지는 온다.
    forecast.mockRejectedValueOnce(Object.assign(new Error('기상청 API 일일 호출 한도를 소진했습니다.'), { statusCode: 503 }));
    const partial = (await app.inject({ method: 'GET', url: '/api/v1/hiking/courses/421100101-1/conditions' })).json<HikingConditionsType>();
    expect(partial.weather).toBeNull();
    expect(partial.errors.weather).toContain('한도');
    expect(partial.fire!.areas).toHaveLength(2);
    vi.restoreAllMocks();
  });

  it('코스 주변 — 들머리 등산 지점 주차, 날머리 없는 왕복은 들머리 근처 상가정보 음식점(같은 가게 한 번)', async () => {
    const store = (id: string, name: string, lat: number) => ({
      id,
      name,
      kind: 'food',
      mclsCd: 'I201',
      sclsCd: 'I20101',
      sclsName: '백반/한정식',
      sggCd: '51110',
      sggName: '춘천시',
      lat,
      lng: 127,
    });
    await app.prisma.lifeStore.createMany({
      data: [store('s1', '산채식당', 37.001), store('s2', '산채식당', 37.0011), store('s3', '두부마을', 37.0015), store('s4', '먼식당', 37.05)],
    });
    const res = await app.inject({ method: 'GET', url: '/api/v1/hiking/courses/421100101-1/around' });
    expect(res.statusCode).toBe(200);
    const a = res.json<HikingAroundType>();
    // 정상에서 끝나는 왕복 — 날머리 없음.
    expect(a.end).toBeNull();
    expect(a.parking.map((p) => [p.kind, p.name])).toEqual([['trail', '주차장']]);
    expect(a.transit).toEqual([]);
    expect(a.food.source).toBe('stores');
    expect(a.food.items.map((f) => f.name)).toEqual(['산채식당', '두부마을']);
    expect(a.food.items[0]).toMatchObject({ kind: 'store', at: 'start', detail: '백반/한정식', refId: null });
    expect((await app.inject({ method: 'GET', url: '/api/v1/hiking/courses/421100101-9/around' })).statusCode).toBe(404);
  });

  it('추천 — 거리·산행 시간·해 지기 전 하산으로 고른 코스와 이유 문장, 날짜·좌표 검증', async () => {
    vi.spyOn(app.weather, 'getForecast').mockResolvedValue({
      grid: { nx: 1, ny: 1 },
      base: null,
      fallback: false,
      hours: [],
      days: [],
      total: 0,
      fetchedAt: new Date().toISOString(),
      stale: false,
    } satisfies WeatherForecastResultType);
    vi.spyOn(app.airQuality, 'getNearbyStations').mockResolvedValue({ center: { lat: 37, lng: 127 }, items: [], total: 0, fetchedAt: new Date().toISOString(), stale: false });
    vi.spyOn(app.airQuality, 'getForecast').mockResolvedValue({ date: 'd', items: [], fetchedAt: new Date().toISOString(), stale: false });
    // 산불은 오늘의 조건 테스트에서 받아 캐시된 행(내일 06시 춘천 높음 100%)을 쓴다.
    const tomorrow = ymdPlus(1);

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/hiking/recommend?lat=37.1&lng=127&date=${tomorrow}&start=08:00&duration=short&mode=car`,
    });
    expect(res.statusCode).toBe(200);
    const r = res.json<HikingRecommendResultType>();
    expect(r.query).toMatchObject({ date: tomorrow, start: '08:00', duration: 'short', level: 'any', mode: 'car', origin: { lat: 37.1, lng: 127 } });
    expect(r.items).toHaveLength(1);
    const it0 = r.items[0]!;
    expect(it0).toMatchObject({ rank: 1, mountain: { id: '421100101', name: '가리산' }, daylight: 'ok', conditionsChecked: true, fireLevel: 3 });
    // 들머리 근처 GPX 주차(202)가 있다.
    expect(it0.access.parking).toBe('주차장');
    expect(it0.straightM).toBeGreaterThan(10_000);
    expect(it0.reason).toMatch(/^차로 약 \S+.*\(직선 11km\) 거리의 왕복 .*코스로, 08:00에 출발하면 \d\d:\d\d쯤 내려옵니다\(일몰 1\d:\d\d\)\./);
    expect(it0.cautions.map((c) => c.text)).toContain('산불위험 높음(춘천시 100%) — 입산 통제·화기 금지를 확인하세요');

    const bad = await app.inject({ method: 'GET', url: '/api/v1/hiking/recommend?date=2000-01-01' });
    expect(bad.statusCode).toBe(400);
    expect(bad.json<{ message: string }>().message).toContain('오늘·내일·모레');
    expect((await app.inject({ method: 'GET', url: '/api/v1/hiking/recommend?lat=37' })).statusCode).toBe(400);
    vi.restoreAllMocks();
  });

  it('없는 산·코스 404, 잘못된 id 400, 없는 사진 404', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/v1/hiking/mountains/999999999' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/v1/hiking/courses/421100101-9' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/v1/hiking/courses/421100101-9/conditions' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/v1/hiking/courses/abc' })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/api/v1/hiking/mountains/999999999/images/1' })).statusCode).toBe(404);
  });
});

describe('matchGpxFolder', () => {
  it('괄호 뒤 봉우리·별칭을 떼고 맞추되, 지역 괄호(백운산(포천))는 그대로', () => {
    const folders = new Set(['덕유산', '백운산(포천)', '백운산(광양)']);
    expect(matchGpxFolder('덕유산(향적봉)', folders)).toBe('덕유산');
    expect(matchGpxFolder('백운산(포천)', folders)).toBe('백운산(포천)');
    expect(matchGpxFolder('없는산', folders)).toBeNull();
  });
});
