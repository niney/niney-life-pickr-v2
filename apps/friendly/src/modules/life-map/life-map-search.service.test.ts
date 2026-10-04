import { describe, expect, it } from 'vitest';
import { LifeMapSearchService } from './life-map-search.service.js';
import {
  VworldSearchAuthError,
  VworldSearchError,
  searchVworldAddresses,
  searchVworldPlaces,
  type FetchLike,
} from './vworld-search.adapter.js';

// 지역 이동 검색 — 어댑터(가짜 fetch 로 VWorld 응답 형태 검증) + 서비스(병합 순서·중복 제거·캐시·
// 키 없음). 실 업스트림은 부르지 않는다. 라우트 계약은 life-map-search.test.ts(어댑터 목).

const vw = (items: unknown[], total = items.length) =>
  new Response(JSON.stringify({ response: { status: 'OK', record: { total }, result: { items } } }), { status: 200 });
const vwError = (code: string, text: string) =>
  new Response(JSON.stringify({ response: { status: 'ERROR', error: { level: '1', code, text } } }), { status: 200 });
const vwNotFound = () => new Response(JSON.stringify({ response: { status: 'NOT_FOUND' } }), { status: 200 });

const PLACE_GANGNAM = {
  id: 'POI1',
  title: '강남역',
  category: '철도시설 > 철도/지하철 > 지하철역',
  address: { road: '서울특별시 강남구 강남대로 396', parcel: '서울특별시 강남구 역삼동 858' },
  point: { x: '127.02775', y: '37.49798' },
};
const ROAD_SEJONG = {
  id: '1114010300100310000',
  address: { zipcode: '04524', category: 'road', road: '서울특별시 중구 세종대로 110 (태평로1가)', parcel: '태평로1가 31', bldnm: '서울특별시청', bldnmdc: '본관동' },
  point: { x: '126.97791', y: '37.56637' },
};

const paramsOf = (url: string) => new URL(url).searchParams;

describe('vworld-search.adapter', () => {
  it('장소/주소 응답을 정규화하고 키는 요청 URL 에만 싣는다', async () => {
    const urls: string[] = [];
    const fetchImpl: FetchLike = async (url) => {
      urls.push(url);
      const p = paramsOf(url);
      if (p.get('type') === 'place') return vw([PLACE_GANGNAM, { id: 'bad', title: '좌표 없음' }]);
      if (p.get('type') === 'address' && p.get('category') === 'road') return vw([ROAD_SEJONG]);
      return vwNotFound();
    };
    const places = await searchVworldPlaces('강남역', { key: 'secret-key', fetchImpl });
    expect(places).toEqual([
      {
        kind: 'place',
        id: 'POI1',
        title: '강남역',
        category: '철도시설 > 철도/지하철 > 지하철역',
        road: '서울특별시 강남구 강남대로 396',
        parcel: '서울특별시 강남구 역삼동 858',
        lat: 37.49798,
        lng: 127.02775,
      },
    ]);
    const roads = await searchVworldAddresses('세종대로 110', 'road', { key: 'secret-key', fetchImpl });
    expect(roads[0]).toMatchObject({ kind: 'road', road: '서울특별시 중구 세종대로 110 (태평로1가)', building: '서울특별시청 본관동', lat: 37.56637 });
    expect(await searchVworldAddresses('없음', 'parcel', { key: 'secret-key', fetchImpl })).toEqual([]);
    expect(paramsOf(urls[0]!).get('key')).toBe('secret-key');
    expect(paramsOf(urls[0]!).get('crs')).toBe('EPSG:4326');
  });

  it('status=ERROR 는 코드에 따라 503(인증/한도) 또는 502, HTTP 5xx 는 502 — 메시지·URL 에 키 없음', async () => {
    const auth: FetchLike = async () => vwError('INCORRECT_KEY', '등록되지 않은 인증키');
    await expect(searchVworldPlaces('x', { key: 'secret-key', fetchImpl: auth })).rejects.toBeInstanceOf(VworldSearchAuthError);
    const other: FetchLike = async () => vwError('SYSTEM_ERROR', '시스템 오류');
    const e = await searchVworldPlaces('x', { key: 'secret-key', fetchImpl: other }).catch((err: unknown) => err);
    expect(e).toBeInstanceOf(VworldSearchError);
    expect((e as VworldSearchError).statusCode).toBe(502);
    expect((e as VworldSearchError).requestUrl).toContain('key=***');
    expect((e as VworldSearchError).requestUrl).not.toContain('secret-key');
    const down: FetchLike = async () => new Response('', { status: 502 });
    await expect(searchVworldPlaces('x', { key: 'k', fetchImpl: down })).rejects.toMatchObject({ statusCode: 502 });
  });
});

describe('LifeMapSearchService', () => {
  const makeFetch = (calls: string[]): FetchLike => async (url) => {
    calls.push(url);
    const p = paramsOf(url);
    if (p.get('type') === 'place') {
      // 같은 좌표의 중복 POI + 정상 POI.
      return vw([
        PLACE_GANGNAM,
        { ...PLACE_GANGNAM, id: 'POI1-dup' },
        { id: 'POI2', title: '세종대로 카페', category: '음식점 > 카페', address: { road: '서울특별시 중구 세종대로 110', parcel: '' }, point: { x: '126.9779', y: '37.5663' } },
      ]);
    }
    return vw([ROAD_SEJONG]);
  };

  it('장소 우선 병합·좌표 중복 제거·limit, 주소 꼴 검색어는 주소 우선, 같은 검색어는 캐시', async () => {
    const calls: string[] = [];
    const svc = new LifeMapSearchService({ getKey: async () => 'k', fetchImpl: makeFetch(calls), now: () => new Date('2026-08-21T12:00:00Z') });
    const r1 = await svc.search('강남역', 8);
    expect(r1.enabled).toBe(true);
    expect(r1.items.map((i) => `${i.kind}:${i.title}`)).toEqual(['place:강남역', 'place:세종대로 카페', 'road:서울특별시 중구 세종대로 110 (태평로1가)']);
    expect(r1.items[0]!.subtitle).toBe('지하철역 · 서울특별시 강남구 강남대로 396');
    expect(r1.items[2]!.subtitle).toBe('서울특별시청 본관동');
    expect(calls).toHaveLength(2); // place + road 병렬 1콜씩

    const r2 = await svc.search(' 강남역 ', 1);
    expect(r2.items).toHaveLength(1);
    expect(calls).toHaveLength(2); // 캐시 히트(공백 정규화 동일 키)

    const r3 = await svc.search('세종대로 110', 8);
    expect(r3.items[0]!.kind).toBe('road');
    expect(calls).toHaveLength(4);
  });

  it('키가 없으면 업스트림을 부르지 않고 enabled=false', async () => {
    const calls: string[] = [];
    const svc = new LifeMapSearchService({ getKey: async () => null, fetchImpl: makeFetch(calls) });
    expect(await svc.search('강남역', 8)).toMatchObject({ enabled: false, items: [] });
    expect(calls).toHaveLength(0);
  });

  it('검색어 정규화(대소문자·NFC) 키를 공유하고 응답 q 는 요청 그대로, 같은 검색어 동시 요청은 업스트림 한 번(D-9)', async () => {
    const calls: string[] = [];
    const svc = new LifeMapSearchService({ getKey: async () => 'k', fetchImpl: makeFetch(calls) });
    const r1 = await svc.search('GS25 강남', 8);
    expect(calls).toHaveLength(2);
    const r2 = await svc.search('gs25   강남', 8);
    expect(calls).toHaveLength(2); // 같은 키(캐시)
    expect(r2.q).toBe('gs25 강남'); // 클라이언트는 응답 q 를 자기 검색어와 비교한다
    expect(r2.items).toEqual(r1.items);
    // NFD(자모 분리)로 온 같은 검색어도 같은 키.
    await svc.search('GS25 강남'.normalize('NFD'), 8);
    expect(calls).toHaveLength(2);

    const [a, b, c] = await Promise.all([svc.search('을지로 3가', 8), svc.search('을지로 3가', 3), svc.search('을지로  3가', 1)]);
    expect(calls).toHaveLength(4);
    expect([a.items.length, b.items.length, c.items.length]).toEqual([3, 3, 1]);
  });

  it('서버 전역 일일 예산을 넘으면 새 검색은 enabled=false 빈 결과(캐시 히트는 계속), 재시도도 세고 다음 날 리셋', async () => {
    const calls: string[] = [];
    let now = new Date('2026-10-05T03:00:00Z'); // KST 12:00
    let failFirst = true;
    const base = makeFetch(calls);
    // 첫 호출만 HTTP 502 — 어댑터가 1회 재시도하므로 첫 검색은 3콜을 쓴다.
    const fetchImpl: FetchLike = async (url, init) => {
      if (failFirst) {
        failFirst = false;
        calls.push(url);
        return new Response('', { status: 502 });
      }
      return base(url, init);
    };
    const warns: unknown[] = [];
    const svc = new LifeMapSearchService({ getKey: async () => 'k', fetchImpl, now: () => now, dailyBudget: 6, log: { warn: (o) => warns.push(o) } });
    expect((await svc.search('강남역', 8)).enabled).toBe(true);
    expect(calls).toHaveLength(3);
    expect((await svc.search('시청역', 8)).enabled).toBe(true); // 3 + 2 = 5
    expect(calls).toHaveLength(5);
    const over = await svc.search('광화문', 8); // 5 + 2 > 6
    expect(over).toMatchObject({ q: '광화문', enabled: false, items: [] });
    expect(calls).toHaveLength(5);
    expect(warns).toHaveLength(1);
    expect((await svc.search('강남역', 8)).enabled).toBe(true); // 캐시 히트는 예산과 무관
    await svc.search('종로', 8);
    expect(warns).toHaveLength(1); // 경고는 하루 한 번
    now = new Date('2026-10-05T15:30:00Z'); // KST 다음 날 00:30
    expect((await svc.search('광화문', 8)).enabled).toBe(true);
    expect(calls).toHaveLength(7);
  });

  it('서로 다른 검색어가 동시에 와도 예산을 넘겨 출발하지 않는다(기본 2콜은 시작할 때 잡는다)', async () => {
    const calls: string[] = [];
    const svc = new LifeMapSearchService({ getKey: async () => 'k', fetchImpl: makeFetch(calls), dailyBudget: 4 });
    const rs = await Promise.all(['강남역', '시청역', '광화문'].map((q) => svc.search(q, 8)));
    expect(rs.map((r) => r.enabled)).toEqual([true, true, false]);
    expect(calls).toHaveLength(4);
  });
});
