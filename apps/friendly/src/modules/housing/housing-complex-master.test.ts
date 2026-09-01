import { describe, expect, it } from 'vitest';
import { parseCsv } from '../../lib/csv.js';
import {
  HOUSING_COMPLEX_REQUIRED_COLUMNS,
  decodeHousingCsv,
  normalizeHousingComplexRows,
  parseHousingAddress,
  parseHousingNameHistory,
} from './housing-complex-master.service.js';

// 단지 마스터 정규화 — 배포본 CSV 꼴(UTF-8 BOM, 열 10개)로 ① 주소 분해 4가지 꼴 ② 종류 필터·PNU/이름
// 선택·altNames(다른 이름 + 이력) ③ drop 사유 ④ BOM 디코딩을 확인한다.

const HEADER = [...HOUSING_COMPLEX_REQUIRED_COLUMNS];
const row = (
  id: string,
  pnu: string,
  addr: string,
  names: [string, string, string],
  kind: string,
  dong = '4',
  hh = '60',
  approved = '2000-10-02',
): string[] => [id, pnu, addr, names[0], names[1], names[2], kind, dong, hh, approved];

describe('parseHousingAddress', () => {
  it('시군구 1단·2단·없음·숫자 동명 + 산 지번', () => {
    expect(parseHousingAddress('서울특별시 종로구 청운동 56-45')).toEqual({ sido: '서울특별시', sgg: '종로구', umd: '청운동', jibun: '56-45' });
    expect(parseHousingAddress('경기도 성남시 분당구 정자동 1')).toEqual({ sido: '경기도', sgg: '성남시 분당구', umd: '정자동', jibun: '1' });
    expect(parseHousingAddress('세종특별자치시 조치원읍 신흥리 1')).toEqual({ sido: '세종특별자치시', sgg: '', umd: '조치원읍 신흥리', jibun: '1' });
    expect(parseHousingAddress('서울특별시 종로구 종로1가 1')).toEqual({ sido: '서울특별시', sgg: '종로구', umd: '종로1가', jibun: '1' });
    expect(parseHousingAddress('강원특별자치도 춘천시 신북읍 천전리 산1-8')).toEqual({ sido: '강원특별자치도', sgg: '춘천시', umd: '신북읍 천전리', jibun: '산1-8' });
    // 지번 없음 — umd 까지만.
    expect(parseHousingAddress('서울특별시 종로구 청운동')).toEqual({ sido: '서울특별시', sgg: '종로구', umd: '청운동', jibun: null });
    expect(parseHousingAddress('서울특별시')).toBeNull();
  });
});

describe('normalizeHousingComplexRows', () => {
  const rows = [
    row('11110100000004', '1111010100100560045', '서울특별시 종로구 청운동 56-45', ['청운현대', '', '청운현대(아)104동'], '1'),
    row('11110100053621', '1111010200100060011', '서울특별시 종로구 신교동 6-11', ['', '신현아파트', '신현아파트'], '1', '1', '10', '2002-03-18'),
    row('11110200000003', '1111010100100010000', '서울특별시 종로구 청운동 1', ['청운벽산빌리지', '', '청운벽산빌리지'], '2', '9', '126', '1988-11-11'),
    row('BAD-PNU', '123', '서울특별시 종로구 청운동 2', ['x', '', ''], '1'),
    row('11110100000004', '1111010100100560045', '서울특별시 종로구 청운동 56-45', ['청운현대', '', ''], '1'),
    row('11110100000099', '1111010100100990000', '서울특별시', ['주소이상', '', ''], '1'),
    row('11110100000098', '1111010100100980000', '서울특별시 종로구 청운동 98', ['', '', ''], '1'),
  ];
  const history = new Map([['11110100000004', ['청운현대아파트', '청운현대']]]);

  it('기본은 아파트만, 표시명은 공시가격→건축물대장→도로명주소, altNames 는 다른 이름+이력', () => {
    const r = normalizeHousingComplexRows(HEADER, rows, { nameHistory: history, baseDate: '2025-09-18' });
    expect(r.rows.map((c) => c.id)).toEqual(['11110100000004', '11110100053621']);
    expect(r.rows[0]).toMatchObject({
      id: '11110100000004',
      source: 'reb',
      pnu: '1111010100100560045',
      name: '청운현대',
      altNames: '청운현대(아)104동|청운현대아파트',
      kind: 'apt',
      addr: '서울특별시 종로구 청운동 56-45',
      sido: '서울특별시',
      sgg: '종로구',
      umd: '청운동',
      jibun: '56-45',
      sggCd: '11110',
      bjdCd: '1111010100',
      dongCount: 4,
      households: 60,
      approvedDate: '2000-10-02',
      lat: null,
      lng: null,
      geoSource: null,
      baseDate: '2025-09-18',
    });
    // 공시가격명이 비면 건축물대장명이 표시명, 도로명주소명이 같으면 altNames 없음.
    expect(r.rows[1]).toMatchObject({ name: '신현아파트', altNames: null, households: 10, approvedDate: '2002-03-18' });
    expect(r.skippedKind).toBe(1);
    expect(r.droppedBadId).toBe(1);
    expect(r.duplicates).toBe(1);
    expect(r.droppedBadAddr).toEqual([{ id: '11110100000099', addr: '서울특별시' }]);
    expect(r.droppedNoName).toBe(1);
    expect(r.byKind.get('apt')).toBe(2);
    expect(r.bySido.get('서울특별시')).toBe(2);
  });

  it('kinds 로 연립·다세대도 적재', () => {
    const r = normalizeHousingComplexRows(HEADER, rows, { kinds: ['apt', 'row'], baseDate: '2025-09-18' });
    expect(r.rows.map((c) => c.kind)).toEqual(['apt', 'apt', 'row']);
    expect(r.skippedKind).toBe(0);
  });

  it('필수 열이 없으면 하드 fail', () => {
    expect(() => normalizeHousingComplexRows(['단지고유번호', '주소'], [], { baseDate: '2025-09-18' })).toThrow(/필지고유번호/);
  });

  it('단지명 이력 CSV → id 별 이름 목록(빈 값 제외·중복 제거)', () => {
    const m = parseHousingNameHistory(['단지고유번호', '변경년도', '변경전단지명', '변경후단지명'], [
      ['11110311997987', '2024', '(17-43)', '홍빌라'],
      ['11110311997987', '2025', '홍빌라', '홍빌라'],
      ['X', '2024', '', ''],
    ]);
    expect(m.get('11110311997987')).toEqual(['(17-43)', '홍빌라']);
    expect(m.get('X')).toEqual([]);
  });

  it('decodeHousingCsv — UTF-8 BOM 배포본을 풀고 parseCsv 가 헤더를 읽는다', () => {
    const text = '﻿' + HEADER.join(',') + '\n' + row('1', '1111010100100560045', '서울특별시 종로구 청운동 56-45', ['a', '', ''], '1').map((v) => `"${v}"`).join(',') + '\n';
    const decoded = decodeHousingCsv(new TextEncoder().encode(text));
    const table = parseCsv(decoded);
    expect(table.header).toEqual(HEADER);
    expect(table.rows).toHaveLength(1);
    expect(table.rows[0]![2]).toBe('서울특별시 종로구 청운동 56-45');
  });
});
