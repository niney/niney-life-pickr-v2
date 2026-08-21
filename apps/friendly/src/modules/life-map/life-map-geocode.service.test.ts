import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  VworldGeocodeError,
  geocodeLifeRows,
  geocodeVworld,
  lifeAddressCandidates,
  type FetchLike,
  type GeocodableRow,
} from './life-map-geocode.service.js';

// 지오코더 어댑터(가짜 fetch) + 캐시 기반 일괄 변환(공유 dev.db — 주소에 고유 prefix 를 넣고
// afterAll 에서 prefix 로 정리).

const vworldOk = (lat: number, lng: number, refined = '정제주소') =>
  new Response(
    JSON.stringify({ response: { status: 'OK', result: { point: { x: String(lng), y: String(lat) } }, refined: { text: refined } } }),
    { status: 200 },
  );
const vworldNotFound = () => new Response(JSON.stringify({ response: { status: 'NOT_FOUND' } }), { status: 200 });
const vworldError = (code: string, text: string) =>
  new Response(JSON.stringify({ response: { status: 'ERROR', error: { code, text } } }), { status: 200 });

const addressOf = (url: string): { address: string; type: string } => {
  const u = new URL(url);
  return { address: u.searchParams.get('address') ?? '', type: u.searchParams.get('type') ?? '' };
};

describe('lifeAddressCandidates', () => {
  it('도로명→지번 순, 열이 뒤바뀐 행은 교차, 괄호 제거본 추가, 중복 제거', () => {
    expect(lifeAddressCandidates('서울특별시 종로구 창덕궁5길 4 (원서동)', '서울특별시 종로구 원서동 41')).toEqual([
      { type: 'road', address: '서울특별시 종로구 창덕궁5길 4 (원서동)' },
      { type: 'parcel', address: '서울특별시 종로구 원서동 41' },
      { type: 'road', address: '서울특별시 종로구 창덕궁5길 4' },
    ]);
    // 도로명 열에 지번이 들어온 행 — parcel 로도 시도.
    expect(lifeAddressCandidates('제주특별자치도 서귀포시 대포동 산1-8', null)).toEqual([
      { type: 'road', address: '제주특별자치도 서귀포시 대포동 산1-8' },
      { type: 'parcel', address: '제주특별자치도 서귀포시 대포동 산1-8' },
    ]);
    // 지번 열에 도로명이 들어온 행 — road 로도 시도.
    expect(lifeAddressCandidates(null, '전남광주통합특별시 여수시 죽림4길 57')).toEqual([
      { type: 'parcel', address: '전남광주통합특별시 여수시 죽림4길 57' },
      { type: 'road', address: '전남광주통합특별시 여수시 죽림4길 57' },
    ]);
    expect(lifeAddressCandidates(null, null)).toEqual([]);
    expect(lifeAddressCandidates('  ', '짧')).toEqual([]);
  });
});

describe('geocodeVworld', () => {
  it('OK → 좌표, NOT_FOUND → notfound, ERROR → VworldGeocodeError, 5xx 는 재시도', async () => {
    const calls: string[] = [];
    let first500 = true;
    const fetchImpl: FetchLike = async (url) => {
      const { address } = addressOf(url);
      calls.push(address);
      if (address === '성공') return vworldOk(37.5, 127.0, '서울 어딘가');
      if (address === '없음') return vworldNotFound();
      if (address === '한도') return vworldError('LIMIT', '일일 한도 초과');
      if (address === '불안정') {
        if (first500) {
          first500 = false;
          return new Response('', { status: 502 });
        }
        return vworldOk(35.1, 129.0);
      }
      return new Response('', { status: 403 });
    };
    await expect(geocodeVworld({ type: 'road', address: '성공' }, 'k', fetchImpl)).resolves.toEqual({
      status: 'ok',
      lat: 37.5,
      lng: 127.0,
      refined: '서울 어딘가',
    });
    await expect(geocodeVworld({ type: 'parcel', address: '없음' }, 'k', fetchImpl)).resolves.toEqual({ status: 'notfound' });
    await expect(geocodeVworld({ type: 'road', address: '한도' }, 'k', fetchImpl)).rejects.toBeInstanceOf(VworldGeocodeError);
    await expect(geocodeVworld({ type: 'road', address: '불안정' }, 'k', fetchImpl, 1)).resolves.toMatchObject({ status: 'ok', lat: 35.1 });
    await expect(geocodeVworld({ type: 'road', address: '거부' }, 'k', fetchImpl)).rejects.toBeInstanceOf(VworldGeocodeError);
    expect(calls.filter((c) => c === '불안정')).toHaveLength(2);
  });
});

describe('geocodeLifeRows', () => {
  const prisma = new PrismaClient();
  const PREFIX = `지오코딩테스트-${Date.now().toString(36)}`;
  const addr = (s: string): string => `${PREFIX} ${s}`;
  let apiCalls: string[] = [];
  const fetchImpl: FetchLike = async (url) => {
    const { address, type } = addressOf(url);
    apiCalls.push(`${type}:${address}`);
    if (address === addr('서울 종로구 세종대로 110')) return vworldOk(37.5665, 126.978);
    if (address === addr('서울 종로구 세종로 1-68')) return vworldOk(37.5666, 126.9781);
    if (address === addr('한도')) return vworldError('LIMIT', '일일 한도');
    return vworldNotFound();
  };
  const row = (roadAddr: string | null, lotAddr: string | null): GeocodableRow => ({
    roadAddr,
    lotAddr,
    lat: null,
    lng: null,
    geoSource: null,
  });

  beforeAll(async () => {
    await prisma.lifeGeocodeCache.deleteMany({ where: { address: { startsWith: PREFIX } } });
  });
  afterAll(async () => {
    await prisma.lifeGeocodeCache.deleteMany({ where: { address: { startsWith: PREFIX } } });
    await prisma.$disconnect();
  });

  it('첫 실행은 업스트림, 재실행은 캐시만 — notfound 도 캐시, 좌표 이미 있는 행은 건너뜀', async () => {
    const rows = [
      row(addr('서울 종로구 세종대로 110'), null), // road 성공
      row(addr('없는 도로명 1'), addr('서울 종로구 세종로 1-68')), // road notfound → parcel 성공
      row(addr('없는 도로명 2'), addr('없는 지번 2')), // 전부 실패
      row(null, null), // 후보 없음
      { ...row(addr('이미'), null), lat: 1, lng: 2 }, // 이미 좌표 있음
    ];
    apiCalls = [];
    const r1 = await geocodeLifeRows(prisma, rows, { key: 'k', fetchImpl, concurrency: 2, pauseMs: 0, retryBaseMs: 1 });
    expect(r1).toMatchObject({ rows: 5, resolved: 3, cacheHits: 0, apiOk: 2, noCandidate: 1, unresolved: 1, skipped: 0, stoppedBy: null });
    expect(rows[0]).toMatchObject({ lat: 37.5665, lng: 126.978, geoSource: 'road' });
    expect(rows[1]).toMatchObject({ lat: 37.5666, lng: 126.9781, geoSource: 'parcel' });
    expect(rows[2]).toMatchObject({ lat: null, lng: null, geoSource: null });
    // 후보: 행1 road 1콜, 행2 road+parcel 2콜, 행3 road+parcel 2콜 = 5콜(괄호 제거본은 동일 주소라 제외).
    expect(r1.apiCalls).toBe(5);
    expect(r1.apiNotFound).toBe(3);

    const cached = await prisma.lifeGeocodeCache.findMany({ where: { address: { startsWith: PREFIX } } });
    expect(cached).toHaveLength(5);
    expect(cached.filter((c) => c.status === 'ok')).toHaveLength(2);

    // 재실행 — 업스트림 0콜, 캐시로 같은 결과.
    const rows2 = [row(addr('서울 종로구 세종대로 110'), null), row(addr('없는 도로명 1'), addr('서울 종로구 세종로 1-68')), row(addr('없는 도로명 2'), addr('없는 지번 2'))];
    apiCalls = [];
    const r2 = await geocodeLifeRows(prisma, rows2, { key: 'k', fetchImpl, pauseMs: 0, retryBaseMs: 1 });
    expect(apiCalls).toEqual([]);
    expect(r2).toMatchObject({ resolved: 2, cacheHits: 2, apiCalls: 0, unresolved: 1 });
    expect(rows2[1]).toMatchObject({ geoSource: 'parcel' });
  });

  it('오프라인은 미캐시 행을 건너뛰고, 호출 상한·업스트림 ERROR 는 중단 사유를 남긴다', async () => {
    const offlineRows = [row(addr('오프라인 새 주소 1'), null)];
    const r = await geocodeLifeRows(prisma, offlineRows, { key: 'k', fetchImpl, offline: true, pauseMs: 0, retryBaseMs: 1 });
    expect(r).toMatchObject({ resolved: 0, skipped: 1, apiCalls: 0, stoppedBy: 'offline' });

    const limited = [row(addr('상한 1'), null), row(addr('상한 2'), null), row(addr('상한 3'), null)];
    const r2 = await geocodeLifeRows(prisma, limited, { key: 'k', fetchImpl, maxCalls: 1, concurrency: 1, pauseMs: 0, retryBaseMs: 1 });
    expect(r2.apiCalls).toBe(1);
    expect(r2.skipped).toBe(2);
    expect(r2.stoppedBy).toBe('max-calls');

    const erroring = [row(addr('한도'), null), row(addr('뒤에 남는 행'), null)];
    const r3 = await geocodeLifeRows(prisma, erroring, { key: 'k', fetchImpl, concurrency: 1, pauseMs: 0, retryBaseMs: 1 });
    expect(r3.stoppedBy).toMatch(/일일 한도/);
    expect(r3.skipped).toBe(2);
    expect(r3.apiCalls).toBe(1);
  });

  it('일시 장애(5xx 지속)는 그 행만 건너뛰고 계속 — transientErrors 집계, 캐시 안 함', async () => {
    const flaky: FetchLike = async (url) => {
      const { address } = addressOf(url);
      apiCalls.push(address);
      if (address === addr('항상 502')) return new Response('', { status: 502 });
      if (address === addr('그 다음 성공')) return vworldOk(36.0, 127.5);
      return vworldNotFound();
    };
    const rows = [row(addr('항상 502'), null), row(addr('그 다음 성공'), null)];
    apiCalls = [];
    const r = await geocodeLifeRows(prisma, rows, { key: 'k', fetchImpl: flaky, concurrency: 1, pauseMs: 0, retryBaseMs: 1 });
    expect(r).toMatchObject({ resolved: 1, skipped: 1, transientErrors: 1, apiCalls: 2, stoppedBy: null });
    expect(rows[0]).toMatchObject({ lat: null, geoSource: null });
    expect(rows[1]).toMatchObject({ lat: 36.0, geoSource: 'road' });
    // 4회 재시도 후 포기 → 같은 주소 4콜.
    expect(apiCalls.filter((a) => a === addr('항상 502'))).toHaveLength(4);
    // 건너뛴 주소는 캐시에 없다(다음 실행에서 재시도).
    expect(
      await prisma.lifeGeocodeCache.findUnique({ where: { type_address: { type: 'road', address: addr('항상 502') } } }),
    ).toBeNull();
  });
});
