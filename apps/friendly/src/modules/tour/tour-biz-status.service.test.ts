import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { useIsolatedDatabase, type IsolatedDatabase } from '../../test-utils/temp-db.js';
import {
  NTS_BATCH,
  NtsApiError,
  checkTourBizStatus,
  collectTourPlaceBrnos,
  fetchNtsBizStatus,
  normalizeBrno,
  parseNtsStatusResponse,
} from './tour-biz-status.service.js';

// 국세청 사업자 상태조회 — ① 응답 파싱·번호 정규화 ② 장소별 최빈 사업자번호 수집 ③ 격리 DB 로 조회 → upsert → 30일
// 재조회 제외 → force → maxCalls 중단 → 인증 오류 중단. 외부 호출은 fetchImpl 목으로 막는다.

const fake = (status: number, body: unknown) =>
  ({ status, ok: status >= 200 && status < 300, text: async () => JSON.stringify(body) }) as unknown as Response;

const statusBody = (rows: Array<{ b_no: string; b_stt: string; end_dt?: string }>) => ({
  status_code: 'OK',
  request_cnt: rows.length,
  match_cnt: rows.length,
  data: rows.map((r) => ({
    b_no: r.b_no,
    b_stt: r.b_stt,
    b_stt_cd: r.b_stt === '계속사업자' ? '01' : r.b_stt === '휴업자' ? '02' : r.b_stt === '폐업자' ? '03' : '',
    tax_type: r.b_stt === '' ? '국세청에 등록되지 않은 사업자등록번호입니다.' : '부가가치세 일반과세자',
    end_dt: r.end_dt ?? '',
  })),
});

describe('parse / normalize', () => {
  it('사업자번호는 숫자 10자리만', () => {
    expect(normalizeBrno('123-45-67890')).toBe('1234567890');
    expect(normalizeBrno(' 1234567890 ')).toBe('1234567890');
    expect(normalizeBrno('12345')).toBeNull();
    expect(normalizeBrno(null)).toBeNull();
  });
  it('응답 파싱 — 상태 3종 + 미등록(unknown), 폐업일 YYYY-MM-DD', () => {
    const rows = parseNtsStatusResponse(
      statusBody([
        { b_no: '1111111111', b_stt: '계속사업자' },
        { b_no: '2222222222', b_stt: '폐업자', end_dt: '20240301' },
        { b_no: '3333333333', b_stt: '' },
      ]),
    );
    expect(rows).toEqual([
      { bNo: '1111111111', bStt: '계속사업자', bSttCd: '01', endDt: null, taxType: '부가가치세 일반과세자' },
      { bNo: '2222222222', bStt: '폐업자', bSttCd: '03', endDt: '2024-03-01', taxType: '부가가치세 일반과세자' },
      { bNo: '3333333333', bStt: 'unknown', bSttCd: null, endDt: null, taxType: '국세청에 등록되지 않은 사업자등록번호입니다.' },
    ]);
    expect(() => parseNtsStatusResponse({ nope: 1 })).toThrow(NtsApiError);
  });
  it('fetch — 401/403 은 auth, 429 는 quota, 그 외 non-2xx 는 transient', async () => {
    await expect(fetchNtsBizStatus(['1111111111'], { serviceKey: 'k', fetchImpl: async () => fake(403, {}) })).rejects.toMatchObject({ kind: 'auth' });
    await expect(fetchNtsBizStatus(['1111111111'], { serviceKey: 'k', fetchImpl: async () => fake(429, {}) })).rejects.toMatchObject({ kind: 'quota' });
    await expect(fetchNtsBizStatus(['1111111111'], { serviceKey: 'k', fetchImpl: async () => fake(500, {}) })).rejects.toMatchObject({ kind: 'transient' });
    let sentUrl = '';
    let sentBody = '';
    const rows = await fetchNtsBizStatus(['1111111111'], {
      serviceKey: 'plain key',
      fetchImpl: async (url, init) => {
        sentUrl = url;
        sentBody = String(init?.body);
        return fake(200, statusBody([{ b_no: '1111111111', b_stt: '계속사업자' }]));
      },
    });
    expect(rows[0]!.bStt).toBe('계속사업자');
    expect(sentUrl).toContain('serviceKey=plain%20key');
    expect(JSON.parse(sentBody)).toEqual({ b_no: ['1111111111'] });
  });
});

describe('checkTourBizStatus (격리 DB)', () => {
  let isolated: IsolatedDatabase;
  let prisma: PrismaClient;
  const place = (id: string, over: { typeShort?: string; isJeju?: boolean; nTravelers?: number } = {}) => ({
    id,
    name: id,
    typeCd: '11',
    typeShort: over.typeShort ?? '식당',
    isJeju: over.isJeju ?? true,
    isIsland: false,
    nVisits: 5,
    nTravelers: over.nTravelers ?? 10,
    nRated: 5,
    nPhotos: 0,
    spendN: 3,
    nActivities: 5,
    nLodging: 0,
  });
  let spendId = 1;
  const spend = (placeId: string, brno: string | null, storeNm = '가게') => ({
    id: spendId++,
    travelId: 'h_h000001',
    category: '활동',
    categoryCd: 'activity',
    visitAreaId: '2305270001',
    placeId,
    brno,
    storeNm,
    amount: 10000,
    payNum: 1,
    perPerson: 10000,
  });

  beforeAll(async () => {
    isolated = await useIsolatedDatabase();
    prisma = new PrismaClient();
    await prisma.tourPlace.createMany({
      data: [place('P1'), place('P2'), place('P3'), place('P-nature', { typeShort: '자연' }), place('P-seoul', { isJeju: false }), place('P-few', { nTravelers: 1 })],
    });
    await prisma.tourSpend.createMany({
      data: [
        spend('P1', '123-45-67890'),
        spend('P1', '1234567890'),
        spend('P1', '1111111111'), // 소수 → 무시
        spend('P2', '2222222222'),
        spend('P3', null), // 번호 없음
        spend('P-nature', '4444444444'),
        spend('P-seoul', '5555555555'),
        spend('P-few', '6666666666'),
      ],
    });
  });
  afterAll(async () => {
    await prisma.$disconnect();
    isolated.restore();
  });

  it('장소별 최빈 사업자번호 — 식당류·제주·방문자 하한만', async () => {
    const rows = await collectTourPlaceBrnos(prisma, { region: 'jeju', minTravelers: 3 });
    expect(rows.map((r) => [r.placeId, r.brno, r.n]).sort()).toEqual([
      ['P1', '1234567890', 2],
      ['P2', '2222222222', 1],
    ]);
    const all = await collectTourPlaceBrnos(prisma, { region: 'all', minTravelers: 1 });
    expect(all.map((r) => r.placeId).sort()).toEqual(['P-few', 'P-seoul', 'P1', 'P2']);
  });

  it('조회 → upsert → 30일 안 재조회 제외 → force', async () => {
    const calls: string[][] = [];
    const fetchImpl = async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { b_no: string[] };
      calls.push(body.b_no);
      return fake(200, statusBody(body.b_no.map((b) => ({ b_no: b, b_stt: b === '2222222222' ? '폐업자' : '계속사업자', end_dt: b === '2222222222' ? '20240301' : undefined }))));
    };
    const r1 = await checkTourBizStatus(prisma, { serviceKey: 'k', fetchImpl, now: () => new Date('2026-09-13T00:00:00Z') });
    expect(r1).toMatchObject({ candidates: 2, pending: 2, calls: 1, checked: 2, byStatus: { open: 1, closed: 1, suspended: 0, unknown: 0 }, stopped: 'done', error: null });
    expect(calls).toEqual([['1234567890', '2222222222']]);
    expect(await prisma.tourPlaceBizStatus.findUnique({ where: { placeId: 'P2' } })).toMatchObject({ brno: '2222222222', bStt: '폐업자', endDt: '2024-03-01', bSttCd: '03' });

    const r2 = await checkTourBizStatus(prisma, { serviceKey: 'k', fetchImpl, now: () => new Date('2026-09-20T00:00:00Z') });
    expect(r2).toMatchObject({ pending: 0, calls: 0 });

    const r3 = await checkTourBizStatus(prisma, { serviceKey: 'k', fetchImpl, force: true, now: () => new Date('2026-09-20T00:00:00Z') });
    expect(r3).toMatchObject({ pending: 2, calls: 1, checked: 2 });
    expect((await prisma.tourPlaceBizStatus.findUnique({ where: { placeId: 'P2' } }))!.checkedAt.toISOString()).toBe('2026-09-20T00:00:00.000Z');
  });

  it('maxCalls 에서 멈추고, 인증 오류는 즉시 중단(부분 결과 유지), 키 없으면 auth', async () => {
    // 101곳 → 2콜 필요. maxCalls=1 이면 100곳만.
    const extra = Array.from({ length: NTS_BATCH + 1 }, (_, i) => `PX${i}`);
    await prisma.tourPlace.createMany({ data: extra.map((id) => place(id, { nTravelers: 50 })) });
    await prisma.tourSpend.createMany({ data: extra.map((id, i) => spend(id, String(7000000000 + i))) });
    const ok = async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { b_no: string[] };
      return fake(200, statusBody(body.b_no.map((b) => ({ b_no: b, b_stt: '계속사업자' }))));
    };
    const r = await checkTourBizStatus(prisma, { serviceKey: 'k', fetchImpl: ok, force: true, maxCalls: 1, now: () => new Date('2026-10-01T00:00:00Z') });
    expect(r).toMatchObject({ pending: NTS_BATCH + 3, calls: 1, checked: NTS_BATCH, stopped: 'maxCalls' });

    const auth = await checkTourBizStatus(prisma, { serviceKey: 'k', fetchImpl: async () => fake(401, {}), force: true, now: () => new Date('2026-10-02T00:00:00Z') });
    expect(auth).toMatchObject({ calls: 0, checked: 0, stopped: 'auth' });
    expect(auth.error).toMatch(/15081808/);

    const nokey = await checkTourBizStatus(prisma, { serviceKey: '', fetchImpl: ok });
    expect(nokey).toMatchObject({ stopped: 'auth', candidates: 0 });
  });
});
