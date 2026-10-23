import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { useIsolatedDatabase, type IsolatedDatabase } from '../../test-utils/temp-db.js';
import { TOUR_KTO_SYNC_LAYER } from './tour-kto-info.js';
import { getTourKtoStatus, listKtoNearMisses, loadTourPlaceInfos, matchTourPlacesToKto, normalizeKtoContent, syncTourKto } from './tour-kto.service.js';

// 관광정보 동기화 — ① 목록 행 정규화 ② 격리 DB 로 카탈로그(쪽 넘기기) → 맞추기 → 소개 정보 ③ 다시 돌리면 호출 없음
// ④ 수정된 콘텐츠만 다시 ⑤ 호출 예산·쿼터·인증 중단과 이어 받기 ⑥ 줄어든 카탈로그는 갈아 끼우지 않는다.
// 외부 호출은 가짜 게이트웨이(fetchImpl)로 막는다.

interface Content {
  contentid: string;
  contenttypeid: string;
  title: string;
  mapx: string;
  mapy: string;
  addr1?: string;
  modifiedtime?: string;
}
const content = (contentid: string, contenttypeid: string, title: string, lat: number, lng: number, modifiedtime = '20260101000000'): Content => ({ contentid, contenttypeid, title, mapx: String(lng), mapy: String(lat), addr1: '제주특별자치도', modifiedtime });
const ok = (items: unknown[], totalCount: number, pageNo: number, numOfRows: number): string =>
  JSON.stringify({ response: { header: { resultCode: '0000', resultMsg: 'OK' }, body: { items: items.length === 0 ? '' : { item: items }, numOfRows, pageNo, totalCount } } });
const gatewayError = (code: string, msg: string): string => `<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE ERROR</errMsg><returnAuthMsg>${msg}</returnAuthMsg><returnReasonCode>${code}</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>`;

// 가짜 게이트웨이 — 카탈로그(유형·쪽)와 소개 정보(콘텐츠 id)를 준다. pageCap 을 주면 요청한 행 수와 상관없이 그만큼만 준다.
const gateway = (catalog: Content[], intros: Record<string, Record<string, string>>, opts: { pageCap?: number; fail?: (op: string, n: number) => string | null } = {}) => {
  const calls: Array<{ op: string; params: URLSearchParams }> = [];
  const fetchImpl = async (url: string): Promise<Response> => {
    const u = new URL(url);
    const op = u.pathname.split('/').pop()!;
    calls.push({ op, params: u.searchParams });
    const failure = opts.fail?.(op, calls.filter((c) => c.op === op).length);
    if (failure) return new Response(failure, { status: 200 });
    if (op === 'areaBasedList2') {
      const rows = catalog.filter((c) => c.contenttypeid === u.searchParams.get('contentTypeId'));
      const size = Math.min(Number(u.searchParams.get('numOfRows')), opts.pageCap ?? Number.POSITIVE_INFINITY);
      const pageNo = Number(u.searchParams.get('pageNo'));
      return new Response(ok(rows.slice((pageNo - 1) * size, pageNo * size), rows.length, pageNo, size));
    }
    if (op === 'detailIntro2') {
      const item = intros[u.searchParams.get('contentId')!];
      return new Response(ok(item ? [item] : [], item ? 1 : 0, 1, 10));
    }
    return new Response('not found', { status: 404 });
  };
  return { calls, fetchImpl, count: (op: string): number => calls.filter((c) => c.op === op).length };
};

describe('목록 행 정규화', () => {
  it('mapx 가 경도 · mapy 가 위도(문자열) — 범위 밖 좌표와 빈 주소는 null, id·명칭이 없으면 버린다', () => {
    expect(normalizeKtoContent({ contentid: '126508', contenttypeid: '12', title: ' 성산일출봉 ', mapx: '126.9425', mapy: '33.4581', addr1: '제주특별자치도 서귀포시', addr2: '성산읍', modifiedtime: '20260301120000' })).toEqual({
      contentId: '126508',
      contentTypeId: '12',
      title: '성산일출봉',
      addr: '제주특별자치도 서귀포시 성산읍',
      lat: 33.4581,
      lng: 126.9425,
      modifiedTime: '20260301120000',
    });
    // 숫자로 와도 받는다. 0,0 은 좌표 없음.
    expect(normalizeKtoContent({ contentid: 7, contenttypeid: 14, title: '박물관', mapx: 0, mapy: 0, addr1: '' })).toMatchObject({ contentId: '7', contentTypeId: '14', lat: null, lng: null, addr: null, modifiedTime: null });
    expect(normalizeKtoContent({ contentid: '1', contenttypeid: '12', title: '' })).toBeNull();
    expect(normalizeKtoContent({ contenttypeid: '12', title: '이름' })).toBeNull();
  });
});

describe('syncTourKto (격리 DB)', () => {
  let isolated: IsolatedDatabase;
  let prisma: PrismaClient;
  const place = (id: string, name: string, typeShort: string, lat: number | null, lng: number | null, nTravelers = 10) => ({
    id,
    name,
    typeCd: '1',
    typeShort,
    lat,
    lng,
    isJeju: true,
    isIsland: false,
    nVisits: nTravelers,
    nTravelers,
    nRated: 5,
    nPhotos: 0,
    spendN: 0,
    nActivities: 0,
    nLodging: 0,
  });
  const CATALOG: Content[] = [
    content('C-sun', '12', '성산일출봉 [유네스코 세계자연유산]', 33.4581, 126.9425),
    content('C-beach', '12', '협재해수욕장', 33.394, 126.2396),
    content('C-far', '12', '천지연폭포', 33.2469, 126.5544),
    content('C-museum', '14', '제주민속자연사박물관', 33.5063, 126.5316),
    content('C-golf', '28', '제주 골프 리조트', 33.35, 126.4),
    content('C-market', '38', '동문재래시장', 33.5119, 126.5262),
    content('C-cafe', '39', '봄날카페', 33.4627, 126.3098),
  ];
  const INTROS: Record<string, Record<string, string>> = {
    'C-sun': { usetime: '07:00~20:00<br>(매표 마감 19:00)', restdate: '매월 첫째 월요일', parking: '가능' },
    'C-museum': { usetimeculture: '09:00~18:00', restdateculture: '매주 월요일, 1월 1일, 설날 및 추석 당일', usefee: '성인 2,000원' },
    'C-cafe': { opentimefood: '09:00~21:30', restdatefood: '연중무휴' },
  };
  const T0 = new Date('2026-10-04T00:00:00Z');
  const reset = async (): Promise<void> => {
    await prisma.tourKtoIntro.deleteMany();
    await prisma.tourPlaceKto.deleteMany();
    await prisma.tourKtoContent.deleteMany();
    await prisma.lifeMasterSync.deleteMany();
  };

  beforeAll(async () => {
    isolated = await useIsolatedDatabase();
    prisma = new PrismaClient();
    await prisma.tourPlace.createMany({
      data: [
        place('P-sun', '성산일출봉', '자연', 33.458, 126.942, 50),
        // 다른 데이터셋에 따로 잡힌 같은 곳 — 같은 콘텐츠에 붙는다.
        place('P-sun2', '성산일출봉', '자연', 33.4585, 126.9423, 8),
        place('P-museum', '제주민속자연사박물관', '문화', 33.5062, 126.5315, 20),
        place('P-cafe', '봄날 카페', '식당', 33.4626, 126.3097, 12),
        place('P-none', '이름 없는 오름', '자연', 33.3, 126.6, 9),
        // 표본 5건 미만 · 숙소 · 좌표 없음은 맞추지 않는다.
        place('P-few', '협재해수욕장', '자연', 33.394, 126.2396, 2),
        place('P-hotel', '성산일출봉', '숙소', 33.458, 126.942, 30),
        place('P-nocoord', '천지연폭포', '자연', null, null, 15),
      ],
    });
  });
  beforeEach(reset);
  afterAll(async () => {
    await prisma.$disconnect();
    isolated.restore();
  });

  it('카탈로그(쪽 넘기기) → 맞추기 → 소개 정보, 그리고 코스 추천이 읽는 값', async () => {
    const gw = gateway(CATALOG, INTROS, { pageCap: 2 });
    const r = await syncTourKto(prisma, { serviceKey: 'k', fetchImpl: gw.fetchImpl, now: () => T0 });
    expect(r).toMatchObject({ stopped: 'done', error: null });
    // 게이트웨이가 요청(1,000행)과 달리 한 번에 2건씩만 준다 — 관광지 3건은 2쪽, 나머지 유형은 1쪽씩.
    expect(gw.count('areaBasedList2')).toBe(6);
    expect(gw.calls.filter((c) => c.op === 'areaBasedList2').map((c) => [c.params.get('contentTypeId'), c.params.get('pageNo'), c.params.get('numOfRows')])).toEqual([
      ['12', '1', '1000'],
      ['12', '2', '2'],
      ['14', '1', '2'],
      ['28', '1', '2'],
      ['38', '1', '2'],
      ['39', '1', '2'],
    ]);
    expect(r.catalog).toMatchObject({ replaced: 7, byType: { '12': { fetched: 3 }, '14': { fetched: 1 }, '28': { fetched: 1 }, '38': { fetched: 1 }, '39': { fetched: 1 } } });
    expect(await prisma.tourKtoContent.count()).toBe(7);

    expect(r.match).toMatchObject({ places: 5, matched: 4, changed: true, byKind: { 자연: { places: 3, matched: 2 }, 문화: { places: 1, matched: 1 }, 식당: { places: 1, matched: 1 } } });
    const links = await prisma.tourPlaceKto.findMany({ orderBy: { placeId: 'asc' } });
    expect(links.map((l) => [l.placeId, l.contentId, l.nameScore])).toEqual([
      ['P-cafe', 'C-cafe', 1],
      ['P-museum', 'C-museum', 1],
      ['P-sun', 'C-sun', 1],
      ['P-sun2', 'C-sun', 1],
    ]);

    // 맞은 콘텐츠 3개만 받는다 — 방문 많은 장소부터(성산일출봉 58 → 박물관 20 → 카페 12).
    expect(r.intro).toMatchObject({ targets: 3, pending: 3, fetched: 3, failed: 0, stopped: 'done' });
    expect(gw.calls.filter((c) => c.op === 'detailIntro2').map((c) => [c.params.get('contentId'), c.params.get('contentTypeId')])).toEqual([
      ['C-sun', '12'],
      ['C-museum', '14'],
      ['C-cafe', '39'],
    ]);
    expect(r.calls).toBe(9);

    const infos = await loadTourPlaceInfos(prisma);
    expect([...infos.keys()].sort()).toEqual(['P-cafe', 'P-museum', 'P-sun', 'P-sun2']);
    expect(infos.get('P-sun')).toEqual({ hours: '07:00~20:00 / (매표 마감 19:00)', closed: '매월 첫째 월요일', parking: '가능', fee: null, closedDows: null });
    expect(infos.get('P-sun2')).toEqual(infos.get('P-sun'));
    expect(infos.get('P-museum')).toEqual({ hours: '09:00~18:00', closed: '매주 월요일, 1월 1일, 설날 및 추석 당일', parking: null, fee: '성인 2,000원', closedDows: [1] });
    expect(infos.get('P-cafe')).toMatchObject({ hours: '09:00~21:30', closed: '연중무휴', closedDows: [] });

    expect(await getTourKtoStatus(prisma)).toEqual({ catalog: { '12': 3, '14': 1, '28': 1, '38': 1, '39': 1 }, matchedPlaces: 4, matchedContents: 3, intros: 3, withHours: 3, withClosed: 3, weeklyClosed: 1 });
    // 적재 이력 한 행 — 코스 프로필 캐시가 새로 만들어진다.
    expect(await prisma.lifeMasterSync.findMany({ where: { layer: TOUR_KTO_SYNC_LAYER }, select: { count: true, geocoded: true } })).toEqual([{ count: 7, geocoded: 4 }]);
  });

  it('다시 돌리면 아무것도 부르지 않는다 — 카탈로그는 30일, 소개 정보는 수정 시각이 그대로면 그대로', async () => {
    await syncTourKto(prisma, { serviceKey: 'k', fetchImpl: gateway(CATALOG, INTROS).fetchImpl, now: () => T0 });
    const gw = gateway(CATALOG, INTROS);
    const again = await syncTourKto(prisma, { serviceKey: 'k', fetchImpl: gw.fetchImpl, now: () => new Date(T0.getTime() + 86_400_000) });
    expect(again).toMatchObject({ calls: 0, stopped: 'done', match: { changed: false, matched: 4 }, intro: { targets: 3, pending: 0, fetched: 0 } });
    expect(again.catalog!.byType['12']).toEqual({ fetched: null, skipped: 'fresh' });
    expect(await prisma.lifeMasterSync.count({ where: { layer: TOUR_KTO_SYNC_LAYER } })).toBe(1);

    // 31일 뒤 — 카탈로그를 다시 받고, 수정 시각이 바뀐 콘텐츠의 소개 정보만 다시 받는다.
    const changed = CATALOG.map((c) => (c.contentid === 'C-museum' ? { ...c, modifiedtime: '20261101000000' } : c));
    const later = gateway(changed, { ...INTROS, 'C-museum': { usetimeculture: '09:00~17:00', restdateculture: '매주 화요일' } });
    const r = await syncTourKto(prisma, { serviceKey: 'k', fetchImpl: later.fetchImpl, now: () => new Date(T0.getTime() + 31 * 86_400_000) });
    expect(r).toMatchObject({ stopped: 'done', catalog: { replaced: 7 }, match: { changed: false }, intro: { pending: 1, fetched: 1 } });
    expect(later.calls.filter((c) => c.op === 'detailIntro2').map((c) => c.params.get('contentId'))).toEqual(['C-museum']);
    expect((await loadTourPlaceInfos(prisma)).get('P-museum')).toMatchObject({ hours: '09:00~17:00', closed: '매주 화요일', closedDows: [2] });
    expect(await prisma.lifeMasterSync.count({ where: { layer: TOUR_KTO_SYNC_LAYER } })).toBe(2);
  });

  it('호출 예산이 다하면 멈추고, 다음에 이어 받는다', async () => {
    // 카탈로그 5콜(유형마다 1쪽) + 소개 정보 1콜에서 예산이 끝난다.
    const first = gateway(CATALOG, INTROS);
    const r1 = await syncTourKto(prisma, { serviceKey: 'k', fetchImpl: first.fetchImpl, maxCalls: 6, now: () => T0 });
    expect(r1).toMatchObject({ calls: 6, stopped: 'maxCalls', intro: { pending: 3, fetched: 1, stopped: 'maxCalls' } });
    expect(await prisma.tourKtoIntro.count()).toBe(1);
    const second = gateway(CATALOG, INTROS);
    const r2 = await syncTourKto(prisma, { serviceKey: 'k', fetchImpl: second.fetchImpl, maxCalls: 6, now: () => T0 });
    expect(r2).toMatchObject({ calls: 2, stopped: 'done', intro: { pending: 2, fetched: 2 } });
    expect(second.count('areaBasedList2')).toBe(0);

    // 카탈로그 도중에 예산이 끝나면 다 받은 유형까지만 남고 소개 정보는 받지 않는다.
    await reset();
    const r3 = await syncTourKto(prisma, { serviceKey: 'k', fetchImpl: gateway(CATALOG, INTROS).fetchImpl, maxCalls: 2, now: () => T0 });
    expect(r3).toMatchObject({ calls: 2, stopped: 'maxCalls', intro: null });
    expect((await getTourKtoStatus(prisma)).catalog).toEqual({ '12': 3, '14': 1 });
    expect(r3.match).toMatchObject({ matched: 3 });
  });

  it('키·권한 오류와 쿼터 초과는 즉시 멈춘다(받은 것은 남는다)', async () => {
    const denied = gateway(CATALOG, INTROS, { fail: () => gatewayError('30', 'SERVICE_KEY_IS_NOT_REGISTERED_ERROR') });
    const r1 = await syncTourKto(prisma, { serviceKey: 'k', fetchImpl: denied.fetchImpl, now: () => T0 });
    expect(r1).toMatchObject({ calls: 1, stopped: 'auth', intro: null, match: { matched: 0, changed: false } });
    expect(r1.error).toContain('SERVICE_KEY_IS_NOT_REGISTERED_ERROR');
    expect(await prisma.tourKtoContent.count()).toBe(0);
    expect(await prisma.lifeMasterSync.count({ where: { layer: TOUR_KTO_SYNC_LAYER } })).toBe(0);

    // 소개 정보 두 번째 호출에서 쿼터 초과.
    const limited = gateway(CATALOG, INTROS, { fail: (op, n) => (op === 'detailIntro2' && n >= 2 ? gatewayError('22', 'LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR') : null) });
    const r2 = await syncTourKto(prisma, { serviceKey: 'k', fetchImpl: limited.fetchImpl, now: () => T0 });
    expect(r2).toMatchObject({ stopped: 'quota', intro: { fetched: 1, stopped: 'quota' } });
    expect(await prisma.tourKtoIntro.count()).toBe(1);

    expect(await syncTourKto(prisma, { serviceKey: '', now: () => T0 })).toMatchObject({ calls: 0, stopped: 'auth', error: 'DATA_GO_KR_API_KEY 가 없습니다' });
  });

  it('주변에서 못 찾으면 이름이 하나뿐인 콘텐츠를 더 멀리까지 본다 — 못 맞춘 곳은 아까운 후보와 같이 볼 수 있다', async () => {
    await syncTourKto(prisma, { serviceKey: 'k', fetchImpl: gateway(CATALOG, INTROS).fetchImpl, now: () => T0 });
    // 숲길 — 여행자가 적은 좌표와 공식 좌표가 5km 넘게 어긋난다.
    await prisma.tourPlace.create({ data: place('P-trail', '사려니숲길', '자연', 33.422, 126.6265, 53) });
    await prisma.tourKtoContent.create({ data: { contentId: 'C-trail', contentTypeId: '28', title: '사려니숲길', lat: 33.3989, lng: 126.6793, modifiedTime: null, syncedAt: T0 } });
    try {
      const r = await matchTourPlacesToKto(prisma, { now: () => T0 });
      expect(r).toMatchObject({ places: 6, matched: 5, changed: true });
      const link = await prisma.tourPlaceKto.findUnique({ where: { placeId: 'P-trail' } });
      expect(link).toMatchObject({ contentId: 'C-trail', nameScore: 1 });
      expect(link!.distM).toBeGreaterThan(5000);
      expect(link!.distM).toBeLessThan(6000);

      // 못 맞춘 곳(방문 많은 순) — 반경 안에서 이름이 가장 비슷한 콘텐츠. 표본 5건 미만·숙소·좌표 없는 곳은 대상이 아니다.
      const misses = await listKtoNearMisses(prisma, { limit: 10 });
      expect(misses.unmatched).toBe(1);
      expect(misses.rows).toEqual([{ name: '이름 없는 오름', kind: '자연', travelers: 9, best: null }]);
    } finally {
      await prisma.tourPlace.delete({ where: { id: 'P-trail' } });
    }
  });

  it('절반 아래로 줄어 온 카탈로그는 갈아 끼우지 않는다(force 면 갈아 끼운다)', async () => {
    await syncTourKto(prisma, { serviceKey: 'k', fetchImpl: gateway(CATALOG, INTROS).fetchImpl, now: () => T0 });
    const later = (): Date => new Date(T0.getTime() + 40 * 86_400_000);
    // 관광지가 3건 → 1건으로 줄고, 쇼핑은 한 건도 오지 않는다.
    const shrunk = CATALOG.filter((c) => (c.contenttypeid !== '12' || c.contentid === 'C-far') && c.contenttypeid !== '38');
    const r = await syncTourKto(prisma, { serviceKey: 'k', fetchImpl: gateway(shrunk, INTROS).fetchImpl, now: later });
    expect(r.catalog!.byType['12']).toEqual({ fetched: null, skipped: 'shrunk' });
    expect(r.catalog!.byType['38']).toEqual({ fetched: null, skipped: 'empty' });
    expect((await getTourKtoStatus(prisma)).catalog).toMatchObject({ '12': 3, '38': 1 });
    const forced = await syncTourKto(prisma, { serviceKey: 'k', fetchImpl: gateway(shrunk, INTROS).fetchImpl, catalog: 'force', now: later });
    expect(forced.catalog!.byType['12']).toEqual({ fetched: 1, skipped: null });
    // 성산일출봉 콘텐츠가 빠졌으니 그 장소들의 맞춤도 사라진다.
    expect(forced.match).toMatchObject({ matched: 2, changed: true });
    expect([...(await loadTourPlaceInfos(prisma)).keys()].sort()).toEqual(['P-cafe', 'P-museum']);
  });
});
