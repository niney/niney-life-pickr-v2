import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { useIsolatedDatabase, type IsolatedDatabase } from '../../test-utils/temp-db.js';
import {
  HOUSING_STATS_NEXT_TABLE,
  computeHousingStatRows,
  housingJibunKey,
  housingUmdKey,
  rebuildHousingDerived,
  rebuildHousingStats,
  replaceHousingStats,
  type HousingStatRow,
} from './housing-derived.service.js';

// 파생 재구축 — 격리 DB 에 단지 4 + 거래 8 을 시드하고 ① 지번 매칭(0 패딩·읍면동 마지막 토큰) ② 이름 매칭
// (괄호 정규화·altNames) ③ 마스터에 없는 단지 → rtms 단지 생성(지오코더 offline) ④ 시도명을 모르는 시군구는
// 미연결 ⑤ 통계(해제 제외·12개월 창·구간) ⑥ 재실행은 미연결만 다시 본다 를 확인한다.

const COMPLEX_BASE = { source: 'reb', kind: 'apt', sido: '서울특별시', sgg: '종로구', sggCd: '11110', baseDate: '2025-09-18' };
const TRADE_BASE = { sggCd: '11110', dealYm: '202607', dealType: 'trade', umdNm: '창신동', aptNm: '', area: 84.97, price: 0, rent: 0 };

describe('housing derived (격리 DB)', () => {
  let prisma: PrismaClient;
  let isolated: IsolatedDatabase;

  beforeAll(async () => {
    isolated = await useIsolatedDatabase();
    prisma = new PrismaClient();
    await prisma.housingComplex.createMany({
      data: [
        { ...COMPLEX_BASE, id: 'A', name: '청운현대', umd: '청운동', jibun: '56-45', addr: '서울특별시 종로구 청운동 56-45' },
        { ...COMPLEX_BASE, id: 'B', name: '창신쌍용1', altNames: '쌍용1차', umd: '창신동', jibun: '702', addr: '서울특별시 종로구 창신동 702' },
        { ...COMPLEX_BASE, id: 'C', name: '경희궁자이(1단지)', umd: '창신동', jibun: '9', addr: '서울특별시 종로구 창신동 9' },
        { ...COMPLEX_BASE, id: 'E', name: '세종아파트', sido: '세종특별자치시', sgg: '', sggCd: '36110', umd: '조치원읍 신흥리', jibun: '1', addr: '세종특별자치시 조치원읍 신흥리 1' },
      ],
    });
    await prisma.housingTrade.createMany({
      data: [
        { ...TRADE_BASE, id: 't1', jibun: '0702', aptNm: '창신쌍용1', price: 90000, dealDate: '2026-07-10' },
        { ...TRADE_BASE, id: 't2', dealYm: '202606', jibun: '999', aptNm: '경희궁자이 1단지', area: 59.5, price: 120000, dealDate: '2026-06-01' },
        { ...TRADE_BASE, id: 't3', jibun: '578-5', aptNm: '동대문맨션', area: 122.71, price: 58960, dealDate: '2026-07-21' },
        { ...TRADE_BASE, id: 't3b', dealYm: '202501', jibun: '578-5', aptNm: '동대문맨션', area: 80, price: 50000, dealDate: '2025-01-05' },
        { ...TRADE_BASE, id: 't4', sggCd: '99999', umdNm: '없는동', jibun: '1', aptNm: '미지단지', price: 10000, dealDate: '2026-07-01' },
        { ...TRADE_BASE, id: 't5', sggCd: '36110', umdNm: '신흥리', jibun: '1', aptNm: '세종아파트', area: 84, price: 30000, dealDate: '2026-07-02' },
        { ...TRADE_BASE, id: 't6', dealYm: '202605', dealType: 'jeonse', jibun: '702', aptNm: '창신쌍용1', price: 40000, dealDate: '2026-05-01' },
        { ...TRADE_BASE, id: 't7', jibun: '702', aptNm: '창신쌍용1', price: 999999, dealDate: '2026-07-20', canceled: true, canceledDate: '2026-07-25' },
      ],
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
    isolated.restore();
  });

  it('키 정규화 — 지번 0 패딩·산 접두, 읍면동 마지막 토큰', () => {
    expect(housingJibunKey('0578-0005')).toBe('578-5');
    expect(housingJibunKey('산1-08')).toBe('산1-8');
    expect(housingJibunKey('56-0')).toBe('56');
    expect(housingJibunKey(' 12 ')).toBe('12');
    expect(housingJibunKey(null)).toBe('');
    expect(housingUmdKey('조치원읍 신흥리')).toBe('신흥리');
    expect(housingUmdKey('창신동')).toBe('창신동');
  });

  it('매칭·rtms 단지·통계 재계산', async () => {
    const r = await rebuildHousingDerived(prisma, { geocode: { key: '', offline: true }, today: '2026-08-30' });
    expect(r.scanned).toBe(8);
    expect(r.matchedByJibun).toBe(4); // t1(0702→702)·t5(신흥리)·t6·t7
    expect(r.matchedByName).toBe(1); // t2 — '경희궁자이 1단지' ≈ '경희궁자이(1단지)'
    expect(r.matchedByRtms).toBe(2); // t3·t3b
    expect(r.unmatched).toBe(1); // t4 — 시도명 불명
    expect(r.createdRtms).toBe(1);
    expect(r.geocode?.stoppedBy).toBe('offline');

    const ids = Object.fromEntries((await prisma.housingTrade.findMany({ select: { id: true, complexId: true } })).map((t) => [t.id, t.complexId]));
    expect(ids).toMatchObject({ t1: 'B', t2: 'C', t5: 'E', t6: 'B', t7: 'B', t4: null });
    expect(ids['t3']).toBe('rt:11110:창신동:578-5:동대문맨션');
    expect(ids['t3b']).toBe(ids['t3']);

    const rtms = await prisma.housingComplex.findUnique({ where: { id: 'rt:11110:창신동:578-5:동대문맨션' } });
    expect(rtms).toMatchObject({
      source: 'rtms',
      name: '동대문맨션',
      kind: 'apt',
      addr: '서울특별시 종로구 창신동 578-5',
      sido: '서울특별시',
      sgg: '종로구',
      umd: '창신동',
      jibun: '578-5',
      sggCd: '11110',
      lat: null,
      baseDate: '2026-08-30',
    });

    // 통계 — B 매매: 해제(t7) 제외, 최근 t1, 12개월 안 1건. B 전세 별도. C 는 b1 만. rtms 는 12개월 창 밖 t3b 가
    // count 에는 들고 count12·unitPrice12 에는 안 든다.
    const stats = await prisma.housingComplexStat.findMany({ orderBy: [{ complexId: 'asc' }, { dealType: 'asc' }, { band: 'asc' }] });
    const key = (s: { complexId: string; dealType: string; band: string }) => `${s.complexId}|${s.dealType}|${s.band}`;
    const byKey = new Map(stats.map((s) => [key(s), s]));
    expect(byKey.get('B|trade|all')).toMatchObject({ latestPrice: 90000, latestArea: 84.97, latestDate: '2026-07-10', count: 1, count12: 1 });
    expect(byKey.get('B|trade|b2')).toMatchObject({ latestPrice: 90000 });
    expect(byKey.has('B|trade|b1')).toBe(false);
    expect(byKey.get('B|jeonse|all')).toMatchObject({ latestPrice: 40000, latestRent: 0 });
    expect(byKey.get('C|trade|b1')).toMatchObject({ latestPrice: 120000, latestArea: 59.5 });
    expect(byKey.has('C|trade|b2')).toBe(false);
    const rt = byKey.get(`${ids['t3']}|trade|all`)!;
    expect(rt).toMatchObject({ latestPrice: 58960, latestDate: '2026-07-21', count: 2, count12: 1 });
    expect(rt.unitPrice12).toBeCloseTo(58960 / 122.71, 3);
    expect(byKey.get(`${ids['t3']}|trade|b3`)).toMatchObject({ latestPrice: 58960 });
    expect(byKey.get(`${ids['t3']}|trade|b2`)).toMatchObject({ latestPrice: 50000, count12: 0, unitPrice12: null });
    expect(byKey.has('A|trade|all')).toBe(false);
    expect(r.stats).toBe(stats.length);
    expect(await prisma.housingSync.findFirst({ where: { kind: 'stats' } })).toMatchObject({ count: stats.length });

    // 폴백 행(any/all) — 단지마다 하나, 세 유형 통틀어 최근 거래 + 그 유형 + 전체 유형 합계.
    // B: t1(매매 07-10) vs t6(전세 05-01) → 매매, count 2(해제 t7 제외)·12개월 2. 유형별 행엔 latestDealType 없음.
    expect(byKey.get('B|any|all')).toMatchObject({ latestPrice: 90000, latestDate: '2026-07-10', latestDealType: 'trade', count: 2, count12: 2 });
    expect(byKey.get('B|any|all')!.unitPrice12).toBeCloseTo((90000 / 84.97 + 40000 / 84.97) / 2, 3);
    expect(byKey.get('B|trade|all')!.latestDealType).toBeNull();
    expect(byKey.get('C|any|all')).toMatchObject({ latestDealType: 'trade', latestPrice: 120000, count: 1 });
    expect(byKey.get(`${ids['t3']}|any|all`)).toMatchObject({ latestDealType: 'trade', latestPrice: 58960, count: 2, count12: 1 });
    expect(byKey.has('A|any|all')).toBe(false);
    expect(stats.filter((s) => s.dealType === 'any').every((s) => s.band === 'all')).toBe(true);
  });

  it('재실행은 미연결 거래만 다시 보고, 시도명 불명 그룹은 그대로 둔다', async () => {
    const r = await rebuildHousingDerived(prisma, { geocode: { key: '', offline: true }, today: '2026-08-30' });
    expect(r.scanned).toBe(1);
    expect(r.unmatched).toBe(1);
    expect(r.createdRtms).toBe(0);
    expect(r.reusedRtms).toBe(0);
    expect(r.geocode).toBeNull();
    expect((await prisma.housingComplex.count({ where: { source: 'rtms' } }))).toBe(1);
  });

  it('rematchAll — 전부 다시 붙인다; 이미 있는 rtms 단지는 인덱스에 들어 지번으로 붙고 새로 만들지 않는다', async () => {
    const r = await rebuildHousingDerived(prisma, { geocode: { key: '', offline: true }, today: '2026-08-30', rematchAll: true });
    expect(r.scanned).toBe(8);
    expect(r.matchedByJibun).toBe(6); // t1·t5·t6·t7 + rtms 단지(578-5)로 t3·t3b
    expect(r.matchedByName).toBe(1);
    expect(r.matchedByRtms).toBe(0);
    expect(r.createdRtms).toBe(0);
    expect(r.unmatched).toBe(1);
    expect(await prisma.housingComplex.count({ where: { source: 'rtms' } })).toBe(1);
    expect((await prisma.housingTrade.findUnique({ where: { id: 't3' } }))?.complexId).toBe('rt:11110:창신동:578-5:동대문맨션');
  });

  it('rtms 단지 행이 남아 있고 거래만 끊긴 경우 — 재사용(reusedRtms)', async () => {
    await prisma.housingTrade.updateMany({ where: { id: { in: ['t3', 't3b'] } }, data: { complexId: null } });
    // 인덱스에서 빠지도록 지번을 비운 뒤(마스터 교체로 rtms 행의 jibun 이 없는 꼴) 재실행.
    await prisma.housingComplex.update({ where: { id: 'rt:11110:창신동:578-5:동대문맨션' }, data: { jibun: null, name: '이름바뀜' } });
    const r = await rebuildHousingDerived(prisma, { geocode: { key: '', offline: true }, today: '2026-08-30' });
    expect(r.scanned).toBe(3); // t3·t3b·t4
    expect(r.matchedByRtms).toBe(2);
    expect(r.reusedRtms).toBe(1);
    expect(r.createdRtms).toBe(0);
    expect((await prisma.housingTrade.findUnique({ where: { id: 't3b' } }))?.complexId).toBe('rt:11110:창신동:578-5:동대문맨션');
  });

  // 통계 섀도 표 교체(D-4·X-5) — 예전 쓰기(한 트랜잭션 deleteMany + createMany)와 같은 행을 남기고, 스테이징 표·인덱스
  // 이름·실패 시 원본 보존·겹친 실행의 격리를 고정한다.
  const snapshot = async () =>
    (await prisma.housingComplexStat.findMany({ orderBy: [{ complexId: 'asc' }, { dealType: 'asc' }, { band: 'asc' }] })).map((s) => ({ ...s }));
  const statsObjects = async () =>
    (
      await prisma.$queryRawUnsafe<{ type: string; name: string }[]>(
        "SELECT type, name FROM sqlite_master WHERE tbl_name LIKE 'housing_complex_stats%' ORDER BY type, name",
      )
    ).map((o) => `${o.type}:${o.name}`);

  it('통계 교체 — 예전 쓰기와 같은 행(청크 경계 포함), 교체 뒤 _next 없음·PK autoindex 이름 그대로', async () => {
    // 예전 방식으로 같은 계산 결과를 써 둔 기준.
    const rows: HousingStatRow[] = [];
    await computeHousingStatRows(prisma, '2026-08-30', async (part) => {
      rows.push(...part);
    });
    await prisma.$transaction(async (tx) => {
      await tx.housingComplexStat.deleteMany({});
      for (let i = 0; i < rows.length; i += 500) await tx.housingComplexStat.createMany({ data: rows.slice(i, i + 500) });
    });
    const legacy = await snapshot();
    expect(legacy.length).toBeGreaterThan(5);
    const objectsBefore = await statsObjects();
    // 예전 고정 이름으로 남은 스테이징(중단 잔여물)은 시작할 때 지운다.
    await prisma.$executeRawUnsafe(`CREATE TABLE "${HOUSING_STATS_NEXT_TABLE}" (junk TEXT)`);

    const n = await rebuildHousingStats(prisma, '2026-08-30', { insertRows: 2, txRows: 3 });
    expect(n).toBe(legacy.length);
    expect(await snapshot()).toEqual(legacy);
    expect(await statsObjects()).toEqual(objectsBefore);
    expect(objectsBefore).toEqual(['index:sqlite_autoindex_housing_complex_stats_1', 'table:housing_complex_stats']);
    expect(await prisma.housingSync.findFirst({ where: { kind: 'stats' }, orderBy: { id: 'desc' } })).toMatchObject({ count: n, baseDate: '2026-08-30' });
    // 교체된 표도 복합 PK 를 강제한다.
    const dup = legacy[0]!;
    await expect(prisma.housingComplexStat.create({ data: dup })).rejects.toThrow();
    // 두 번째 교체(이미 RENAME 된 정의를 다시 복사)도 같은 결과.
    expect(await rebuildHousingStats(prisma, '2026-08-30')).toBe(legacy.length);
    expect(await snapshot()).toEqual(legacy);
  });

  it('통계 교체 — 채우는 도중 실패하면 원본·적재 이력은 그대로, 제 스테이징은 지운다', async () => {
    const before = await snapshot();
    const syncs = await prisma.housingSync.count({ where: { kind: 'stats' } });
    let calls = 0;
    // 두 번째 채우기 트랜잭션에서 실패하는 클라이언트(나머지는 그대로 위임).
    const failing = new Proxy(prisma, {
      get(target, prop, receiver) {
        if (prop === '$transaction') {
          return (arg: unknown) => {
            calls += 1;
            if (calls === 2) return Promise.reject(new Error('주입한 실패'));
            return target.$transaction(arg as never);
          };
        }
        const v = Reflect.get(target, prop, receiver) as unknown;
        return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(target) : v;
      },
    });
    await expect(rebuildHousingStats(failing, '2026-08-30', { insertRows: 2, txRows: 3 })).rejects.toThrow('주입한 실패');
    expect(await snapshot()).toEqual(before);
    expect(await prisma.housingSync.count({ where: { kind: 'stats' } })).toBe(syncs);
    expect(await statsObjects()).toEqual(['index:sqlite_autoindex_housing_complex_stats_1', 'table:housing_complex_stats']);
  });

  // 갱신 cron 과 load:housing-* 처럼 서로 다른 프로세스가 겹쳐 돈 꼴 — 스테이징 이름이 고정이던 때는 늦게 시작한 B 가
  // A 의 스테이징을 지우고 다시 만들어, A 의 남은 행이 B 의 표에 들어간 채 A 가 "성공"으로 게시했다(A·B 행이 섞이고 일부 유실).
  it('통계 교체 — 겹쳐 돌아도 서로의 스테이징에 쓰지 않는다: 먼저 끝난 실행은 제 행만 게시하고, 늦게 교체한 쪽이 남는다', async () => {
    const stat = (complexId: string, band: string): HousingStatRow => ({
      complexId,
      dealType: 'trade',
      band,
      latestPrice: 1,
      latestRent: 0,
      latestArea: 84.97,
      latestFloor: null,
      latestDate: '2026-08-01',
      count12: 1,
      count: 1,
      unitPrice12: null,
      latestDealType: null,
    });
    const deferred = () => {
      let resolve!: () => void;
      const promise = new Promise<void>((r) => {
        resolve = r;
      });
      return { promise, resolve };
    };
    const keys = async () => (await snapshot()).map((s) => `${s.complexId}|${s.band}`);
    const aRows = ['all', 'b1', 'b2'].map((band) => stat('A', band));
    const bRows = ['all', 'b1', 'b2'].map((band) => stat('B', band));
    const aFilling = deferred();
    const bFilling = deferred();
    const aSwapped = deferred();
    const syncs = await prisma.housingSync.count({ where: { kind: 'stats' } });

    const a = replaceHousingStats(
      prisma,
      '2026-08-30',
      async (emit) => {
        await emit(aRows.slice(0, 1));
        aFilling.resolve();
        await bFilling.promise;
        await emit(aRows.slice(1));
      },
      { insertRows: 1, txRows: 1 },
    );
    await aFilling.promise;
    // A 가 스테이징을 채우는 도중에 B 가 시작한다.
    const b = replaceHousingStats(
      prisma,
      '2026-08-31',
      async (emit) => {
        await emit(bRows.slice(0, 1));
        bFilling.resolve();
        await aSwapped.promise;
        await emit(bRows.slice(1));
      },
      { insertRows: 1, txRows: 1 },
    );
    try {
      expect(await a).toBe(3);
      expect(await keys()).toEqual(['A|all', 'A|b1', 'A|b2']);
      aSwapped.resolve();
      expect(await b).toBe(3);
      expect(await keys()).toEqual(['B|all', 'B|b1', 'B|b2']);
      expect(await statsObjects()).toEqual(['index:sqlite_autoindex_housing_complex_stats_1', 'table:housing_complex_stats']);
      const history = await prisma.housingSync.findMany({ where: { kind: 'stats' }, orderBy: { id: 'asc' }, skip: syncs });
      expect(history.map((h) => [h.count, h.baseDate])).toEqual([
        [3, '2026-08-30'],
        [3, '2026-08-31'],
      ]);
    } finally {
      aSwapped.resolve();
      bFilling.resolve();
      await Promise.allSettled([a, b]);
      // 다른 테스트가 보는 통계로 되돌린다.
      await rebuildHousingStats(prisma, '2026-08-30');
    }
  });
});
