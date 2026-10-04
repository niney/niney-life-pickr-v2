import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { useSchemaDatabase, type IsolatedDatabase } from '../../test-utils/schema-db.js';
import {
  LIFE_STORES_NEXT_TABLE,
  LIFE_STORE_REQUIRED_COLUMNS,
  emptyLifeStoreReport,
  lifeStoreColumnIndex,
  normalizeLifeStoreRow,
  replaceLifeStores,
  type LifeStoreRow,
} from './life-store-master.service.js';

// 상가정보 행 정규화 — 관심 업종 판정·좌표 범위·중복·필수 열 누락을 고정한다. 헤더는 2026-06 분기
// 실물 39열 중 필수 17열만 있어도 되게(순서 무관, 이름으로 찾는다).

const HEADER = [...LIFE_STORE_REQUIRED_COLUMNS, '기타열'];
const col = lifeStoreColumnIndex(HEADER);
const cell = (over: Partial<Record<(typeof LIFE_STORE_REQUIRED_COLUMNS)[number] | '기타열', string>>): string[] => {
  const base: Record<string, string> = {
    상가업소번호: 'MA0001',
    상호명: 'GS25',
    지점명: '세종보람점',
    상권업종대분류코드: 'G2',
    상권업종중분류코드: 'G204',
    상권업종소분류코드: 'G20405',
    상권업종소분류명: '편의점',
    표준산업분류명: '체인화 편의점',
    시군구코드: '36110',
    시군구명: '세종특별자치시',
    법정동명: '보람동',
    지번주소: '세종특별자치시 세종특별자치시 보람동 757',
    도로명주소: '세종특별자치시 세종특별자치시 남세종로 462',
    건물명: '',
    층정보: '1',
    경도: '127.2888',
    위도: '36.4768',
    기타열: 'x',
  };
  return HEADER.map((h) => over[h as keyof typeof over] ?? base[h] ?? '');
};

describe('life-store-master', () => {
  it('필수 열이 빠지면 던진다', () => {
    expect(() => lifeStoreColumnIndex(['상가업소번호', '상호명'])).toThrow(/필수 열 누락/);
  });

  it('관심 업종 행은 채택하고 kind·지점·주소·좌표를 채운다', () => {
    const report = emptyLifeStoreReport();
    const seen = new Set<string>();
    const row = normalizeLifeStoreRow(cell({}), col, HEADER.length, seen, report);
    expect(row).toMatchObject({
      id: 'MA0001',
      name: 'GS25',
      branch: '세종보람점',
      kind: 'convenience',
      mclsCd: 'G204',
      sclsCd: 'G20405',
      sclsName: '편의점',
      ksicName: '체인화 편의점',
      sggCd: '36110',
      umdName: '보람동',
      bldName: null,
      floor: '1',
      lat: 36.4768,
      lng: 127.2888,
    });
    expect(report.kept).toBe(1);
    expect(report.byKind.convenience).toBe(1);
  });

  it('관심 밖 업종·열 수 불일치·좌표 이상·중복은 사유별로 센다', () => {
    const report = emptyLifeStoreReport();
    const seen = new Set<string>();
    expect(normalizeLifeStoreRow(cell({ 상권업종대분류코드: 'L1', 상권업종중분류코드: 'L102', 상권업종소분류코드: 'L10201' }), col, HEADER.length, seen, report)).toBeNull();
    expect(normalizeLifeStoreRow(cell({}).slice(0, 5), col, HEADER.length, seen, report)).toBeNull();
    expect(normalizeLifeStoreRow(cell({ 위도: '0', 경도: '0' }), col, HEADER.length, seen, report)).toBeNull();
    expect(normalizeLifeStoreRow(cell({ 상가업소번호: 'DUP' }), col, HEADER.length, seen, report)).not.toBeNull();
    expect(normalizeLifeStoreRow(cell({ 상가업소번호: 'DUP' }), col, HEADER.length, seen, report)).toBeNull();
    expect(normalizeLifeStoreRow(cell({ 상가업소번호: '' }), col, HEADER.length, seen, report)).toBeNull();
    expect(report).toMatchObject({
      rows: 6,
      kept: 1,
      dropped: { width: 1, badId: 1, notInterested: 1, badCoord: 1, duplicate: 1 },
    });
  });

  it('음식·카페·학원도 kind 로 채택된다(레이어 밖이지만 매칭·인프라용)', () => {
    const report = emptyLifeStoreReport();
    const seen = new Set<string>();
    const food = normalizeLifeStoreRow(cell({ 상가업소번호: 'F', 상권업종대분류코드: 'I2', 상권업종중분류코드: 'I201', 상권업종소분류코드: 'I20101' }), col, HEADER.length, seen, report);
    const cafe = normalizeLifeStoreRow(cell({ 상가업소번호: 'C', 상권업종대분류코드: 'I2', 상권업종중분류코드: 'I212', 상권업종소분류코드: 'I21201' }), col, HEADER.length, seen, report);
    const academy = normalizeLifeStoreRow(cell({ 상가업소번호: 'A', 상권업종대분류코드: 'P1', 상권업종중분류코드: 'P105', 상권업종소분류코드: 'P10501' }), col, HEADER.length, seen, report);
    expect([food?.kind, cafe?.kind, academy?.kind]).toEqual(['food', 'cafe', 'academy']);
  });
});

// 전량 교체(X-V3) — 스테이징 표를 청크로 채운 뒤 DROP + RENAME 으로 바꿔 끼운다. 현재 스키마로 만든 빈 임시 DB 에서
// 결과 행·인덱스 이름·스테이징 정리·실패 시 원본 보존을 고정한다.
describe('replaceLifeStores (스키마 임시 DB)', () => {
  let db: IsolatedDatabase;
  let prisma: PrismaClient;

  const row = (id: string, kind: LifeStoreRow['kind'], lat: number): LifeStoreRow => ({
    id,
    name: `상호${id}`,
    branch: id.endsWith('1') ? '본점' : null,
    kind,
    mclsCd: 'G204',
    sclsCd: 'G20405',
    sclsName: '편의점',
    ksicName: null,
    sggCd: '11140',
    sggName: '중구',
    umdName: '태평로1가',
    roadAddr: '서울특별시 중구 세종대로 110',
    lotAddr: null,
    bldName: null,
    floor: '1',
    lat,
    lng: 126.978,
  });
  async function* chunked(rows: LifeStoreRow[], size: number, failAfter?: number): AsyncGenerator<LifeStoreRow[]> {
    for (let i = 0; i < rows.length; i += size) {
      if (failAfter !== undefined && i >= failAfter) throw new Error('원본 zip 읽기 실패(주입)');
      yield rows.slice(i, i + size);
    }
  }
  const objects = async () =>
    (
      await prisma.$queryRawUnsafe<{ type: string; name: string }[]>(
        "SELECT type, name FROM sqlite_master WHERE tbl_name LIKE 'life_stores%' ORDER BY type, name",
      )
    ).map((o) => `${o.type}:${o.name}`);
  const all = async () => prisma.lifeStore.findMany({ orderBy: { id: 'asc' } });

  beforeAll(async () => {
    db = useSchemaDatabase();
    prisma = new PrismaClient();
    await prisma.lifeStore.createMany({ data: [row('OLD1', 'convenience', 37.5), row('OLD2', 'pharmacy', 37.6)] });
  });
  afterAll(async () => {
    await prisma.$disconnect();
    db.restore();
  });

  it('새 행만 남고(여러 청크·한 청크 안 여러 INSERT 경계 포함) 인덱스 이름은 그대로, 스테이징은 없다', async () => {
    const before = await objects();
    expect(before).toEqual(['index:life_stores_kind_lat_lng_idx', 'index:sqlite_autoindex_life_stores_1', 'table:life_stores']);
    // 남은 스테이징(중단 잔여물)은 시작할 때 지운다.
    await prisma.$executeRawUnsafe(`CREATE TABLE "${LIFE_STORES_NEXT_TABLE}" (junk TEXT)`);
    const rows = Array.from({ length: 2_501 }, (_, i) => row(`N${String(i).padStart(5, '0')}`, i % 2 ? 'mart' : 'cafe', 33 + (i % 600) / 100));
    const progress: number[] = [];
    const n = await replaceLifeStores(prisma, chunked(rows, 1_200), { sourceFile: 'store-202609.zip', baseDate: '2026-09-30' }, (k) => progress.push(k));
    expect(n).toBe(2_501);
    expect(progress).toEqual([1_200, 2_400, 2_501]);
    const got = await all();
    expect(got).toHaveLength(2_501);
    expect(got[0]).toEqual(rows[0]);
    expect(got[2_500]).toEqual(rows[2_500]);
    expect(got.find((r) => r.id === 'OLD1')).toBeUndefined();
    expect(await objects()).toEqual(before);
    expect(await prisma.lifeMasterSync.findFirst({ where: { layer: 'store' }, orderBy: { id: 'desc' } })).toMatchObject({
      count: 2_501,
      baseDate: '2026-09-30',
      sourceFile: 'store-202609.zip',
    });
    // 교체된 표도 PK 를 강제하고, 지도 조회가 쓰는 (kind, lat, lng) 인덱스를 탄다.
    await expect(prisma.lifeStore.create({ data: rows[0]! })).rejects.toThrow();
    const plan = await prisma.$queryRawUnsafe<{ detail: string }[]>(
      "EXPLAIN QUERY PLAN SELECT COUNT(*) FROM life_stores WHERE kind IN ('mart') AND lat >= 33 AND lat <= 34 AND lng >= 126 AND lng <= 127",
    );
    expect(plan.map((p) => p.detail).join(' ')).toContain('life_stores_kind_lat_lng_idx');
  });

  it('읽는 도중 실패하면 원본·적재 이력은 그대로, 스테이징은 지운다', async () => {
    const before = await all();
    const syncs = await prisma.lifeMasterSync.count({ where: { layer: 'store' } });
    const rows = Array.from({ length: 30 }, (_, i) => row(`F${i}`, 'mart', 37));
    await expect(replaceLifeStores(prisma, chunked(rows, 10, 20), { sourceFile: 'bad.zip', baseDate: null })).rejects.toThrow('원본 zip 읽기 실패');
    expect(await all()).toEqual(before);
    expect(await prisma.lifeMasterSync.count({ where: { layer: 'store' } })).toBe(syncs);
    expect(await objects()).toEqual(['index:life_stores_kind_lat_lng_idx', 'index:sqlite_autoindex_life_stores_1', 'table:life_stores']);
  });
});
