import { describe, expect, it } from 'vitest';
import {
  LIFE_STORE_REQUIRED_COLUMNS,
  emptyLifeStoreReport,
  lifeStoreColumnIndex,
  normalizeLifeStoreRow,
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
