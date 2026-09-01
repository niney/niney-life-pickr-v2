import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { useIsolatedDatabase, type IsolatedDatabase } from '../../test-utils/temp-db.js';
import {
  applyKaptMatches,
  kaptRoadKey,
  kaptRowFromApi,
  kaptSidoKey,
  matchKaptRows,
  normalizeKaptDate,
  normalizeKaptRows,
  normalizeKaptSaleType,
  resolveKaptColumns,
  type KaptMatchComplex,
  type KaptRow,
} from './housing-kapt-master.service.js';

// K-apt 단지 속성 — ① 열 키워드 인식(합계 세대수 우선·법정동 열 제외) ② 값 정규화(분양형태·날짜·쉼표 숫자·중복)
// ③ 매칭(법정동코드/시도·시군구 역조회, 지번 → 이름 → 도로명, 모호·중복 처리) ④ 적용(비어 있을 때만 채우는
// 열과 덮어쓰는 열, sync 행) 을 확인한다. ④ 만 격리 DB.

const HEADER = ['단지코드', '단지명', '법정동주소', '도로명주소', '동수', '세대수(분양)', '세대수(합계)', '승강기유무', '승강기대수', '난방방식', '분양형태', '단지분류', '사용승인일', '비고'];

const complexes: KaptMatchComplex[] = [
  { id: 'A', sggCd: '11110', umd: '청운동', jibun: '56-45', name: '청운현대', altNames: null, sido: '서울특별시', sgg: '종로구', roadAddr: null },
  { id: 'B', sggCd: '41135', umd: '정자동', jibun: '1', name: '정자동아파트', altNames: null, sido: '경기도', sgg: '성남시 분당구', roadAddr: null },
  { id: 'C', sggCd: '11110', umd: '창신동', jibun: '702', name: '창신쌍용1', altNames: '쌍용1차', sido: '서울특별시', sgg: '종로구', roadAddr: null },
  { id: 'D', sggCd: '11110', umd: '창신동', jibun: '702', name: '창신쌍용2', altNames: null, sido: '서울특별시', sgg: '종로구', roadAddr: null },
  { id: 'E', sggCd: '11110', umd: '내수동', jibun: '73', name: '경희궁의아침4단지', altNames: null, sido: '서울특별시', sgg: '종로구', roadAddr: '서울특별시 종로구 사직로9길 20 (내수동)' },
  { id: 'F', sggCd: '36110', umd: '조치원읍 신흥리', jibun: '1', name: '세종아파트', altNames: null, sido: '세종특별자치시', sgg: '', roadAddr: null },
];
const row = (over: Partial<KaptRow> & { kaptCode: string; name: string }): KaptRow => ({
  jibunAddr: null,
  roadAddr: null,
  bjdCode: null,
  dongCount: null,
  households: null,
  elevatorCount: null,
  heating: null,
  saleType: null,
  category: null,
  approvedDate: null,
  ...over,
});

describe('housing kapt master — 열 인식·정규화', () => {
  it('resolveKaptColumns — 합계 세대수 우선, 법정동주소는 동수로 안 잡음, 미인식 헤더 보고', () => {
    const c = resolveKaptColumns(HEADER);
    expect(c.kaptCode).toBe(0);
    expect(c.name).toBe(1);
    expect(c.jibunAddr).toBe(2);
    expect(c.roadAddr).toBe(3);
    expect(c.dongCount).toBe(4);
    expect(c.households).toBe(6);
    expect(c.elevatorYn).toBe(7);
    expect(c.elevatorCount).toBe(8);
    expect(c.heating).toBe(9);
    expect(c.saleType).toBe(10);
    expect(c.category).toBe(11);
    expect(c.approvedDate).toBe(12);
    expect(c.bjdCode).toBeNull();
    expect(c.unrecognized).toEqual(['세대수(분양)', '비고']);
  });

  it('normalizeKaptSaleType·normalizeKaptDate', () => {
    expect(normalizeKaptSaleType('분양')).toBe('분양');
    expect(normalizeKaptSaleType('임대(공공)')).toBe('임대');
    expect(normalizeKaptSaleType('분양+임대')).toBe('혼합');
    expect(normalizeKaptSaleType(' 혼합 ')).toBe('혼합');
    expect(normalizeKaptSaleType('기타')).toBe('기타');
    expect(normalizeKaptSaleType('')).toBeNull();
    expect(normalizeKaptDate('20051103')).toBe('2005-11-03');
    expect(normalizeKaptDate('2005-11-03 00:00:00')).toBe('2005-11-03');
    expect(normalizeKaptDate('2005.11')).toBe('2005-11-01');
    expect(normalizeKaptDate('미상')).toBeNull();
  });

  it('normalizeKaptRows — 쉼표 숫자·승강기 유무·중복 코드·분양형태 분포', () => {
    const rows = [
      ['A10001', '청운현대', '서울특별시 종로구 청운동 56-45', '', '4', '50', '1,234', 'Y', '', '지역난방', '분양', '아파트', '20051103', ''],
      ['A10002', '임대단지', '서울특별시 종로구 창신동 1', '', '', '', '300', 'N', '', '개별난방', '임대', '아파트', '', ''],
      ['A10001', '중복', '', '', '', '', '', '', '', '', '', '', '', ''],
      ['', '코드없음', '', '', '', '', '', '', '', '', '', '', '', ''],
    ];
    const r = normalizeKaptRows(HEADER, rows);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({ kaptCode: 'A10001', households: 1234, dongCount: 4, elevatorCount: null, heating: '지역난방', saleType: '분양', approvedDate: '2005-11-03' });
    expect(r.rows[1]).toMatchObject({ kaptCode: 'A10002', households: 300, dongCount: null, elevatorCount: 0, saleType: '임대', approvedDate: null });
    expect(r.duplicates).toBe(1);
    expect(r.droppedNoCode).toBe(1);
    expect([...r.bySaleType.entries()]).toEqual([
      ['분양', 1],
      ['임대', 1],
    ]);
    expect(() => normalizeKaptRows(['이름', '주소'], [])).toThrow(/단지코드/);
  });

  it('kaptRowFromApi — 기본정보 우선, 없으면 목록 주소', () => {
    const list = { kaptCode: 'A1', kaptName: '목록명', as1: '서울특별시', as2: '종로구', as3: null, as4: '청운동', bjdCode: '1111010100' };
    expect(kaptRowFromApi(list, null, null)).toMatchObject({ kaptCode: 'A1', name: '목록명', jibunAddr: '서울특별시 종로구 청운동', bjdCode: '1111010100' });
    const basic = {
      kaptCode: 'A1',
      kaptName: '청운현대',
      kaptAddr: '서울특별시 종로구 청운동 56-45',
      doroJuso: '서울특별시 종로구 자하문로 1',
      bjdCode: null,
      codeSaleNm: '분양',
      codeHeatNm: '개별난방',
      codeAptNm: '아파트',
      kaptdaCnt: 60,
      kaptDongCnt: 4,
      kaptUsedate: '20001002',
      kaptTopFloor: 15,
      raw: {},
    };
    expect(kaptRowFromApi(list, basic, { kaptCode: 'A1', kaptdEcnt: 3, kaptdPcnt: 10, kaptdPcntu: 20, raw: {} })).toMatchObject({
      name: '청운현대',
      jibunAddr: '서울특별시 종로구 청운동 56-45',
      roadAddr: '서울특별시 종로구 자하문로 1',
      bjdCode: '1111010100',
      households: 60,
      dongCount: 4,
      elevatorCount: 3,
      heating: '개별난방',
      saleType: '분양',
      approvedDate: '2000-10-02',
    });
  });
});

describe('housing kapt master — 매칭', () => {
  it('키 정규화 — 시도 2자 키·도로명 키', () => {
    expect(kaptSidoKey('서울특별시')).toBe('서울');
    expect(kaptSidoKey('서울시')).toBe('서울');
    expect(kaptSidoKey('충청북도')).toBe('충북');
    expect(kaptSidoKey('전북특별자치도')).toBe('전북');
    expect(kaptRoadKey('서울특별시 종로구 사직로9길 20 (내수동)')).toBe('서울특별시종로구사직로9길20');
  });

  it('지번(법정동코드·시도역조회·구 없는 시군구) → 이름 → 도로명, 모호·중복·미매칭', () => {
    const rows: KaptRow[] = [
      row({ kaptCode: 'K1', name: '청운현대', bjdCode: '1111010100', jibunAddr: '서울특별시 종로구 청운동 56-45' }),
      row({ kaptCode: 'K2', name: '정자동아파트', jibunAddr: '경기도 성남시 정자동 1' }),
      row({ kaptCode: 'K3', name: '쌍용 1차', jibunAddr: '서울특별시 종로구 창신동 702' }),
      row({ kaptCode: 'K4', name: '모르는이름', jibunAddr: '서울특별시 종로구 창신동 702' }),
      row({ kaptCode: 'K5', name: '청운현대', jibunAddr: '서울시 종로구 청운동' }),
      row({ kaptCode: 'K6', name: '경희궁의아침', roadAddr: '서울특별시 종로구 사직로9길 20(내수동)' }),
      row({ kaptCode: 'K7', name: '세종아파트', jibunAddr: '세종특별자치시 조치원읍 신흥리 1' }),
      row({ kaptCode: 'K8', name: '없는단지', jibunAddr: '서울특별시 종로구 청운동 999' }),
    ];
    const { matches, report } = matchKaptRows(rows, complexes);
    expect(matches.get('A')?.kaptCode).toBe('K1');
    expect(matches.get('B')?.kaptCode).toBe('K2');
    expect(matches.get('C')?.kaptCode).toBe('K3'); // 한 필지 두 단지 — altNames '쌍용1차' 로 고름
    expect(matches.has('D')).toBe(false);
    expect(matches.get('E')?.kaptCode).toBe('K6');
    expect(matches.get('F')?.kaptCode).toBe('K7');
    expect(report).toEqual({ rows: 8, matched: 5, byJibun: 4, byName: 0, byRoad: 1, duplicateTargets: 1, ambiguous: 1, unmatched: 1 });
  });

  it('이름 매칭 — 같은 시군구·읍면동 안 유일할 때만', () => {
    const rows: KaptRow[] = [
      row({ kaptCode: 'N1', name: '경희궁의 아침 4단지', jibunAddr: '서울특별시 종로구 내수동' }),
      row({ kaptCode: 'N2', name: '창신쌍용', jibunAddr: '서울특별시 종로구 창신동' }),
    ];
    const { matches, report } = matchKaptRows(rows, complexes);
    expect(matches.get('E')?.kaptCode).toBe('N1');
    expect(report.byName).toBe(1);
    expect(report.unmatched).toBe(1);
  });
});

describe('housing kapt master — 적용 (격리 DB)', () => {
  let prisma: PrismaClient;
  let isolated: IsolatedDatabase;

  beforeAll(async () => {
    isolated = await useIsolatedDatabase();
    prisma = new PrismaClient();
    await prisma.housingComplex.createMany({
      data: [
        { id: 'A', source: 'reb', kind: 'apt', name: '청운현대', addr: '서울특별시 종로구 청운동 56-45', sido: '서울특별시', sgg: '종로구', umd: '청운동', jibun: '56-45', sggCd: '11110', dongCount: 5, households: null, approvedDate: '2000-10-02', baseDate: '2025-09-18' },
      ],
    });
  });
  afterAll(async () => {
    await prisma.$disconnect();
    isolated.restore();
  });

  it('덮어쓰는 열(kaptCode·saleType·heating·elevatorCount)과 비어 있을 때만 채우는 열, sync 기록', async () => {
    const matches = new Map<string, KaptRow>([
      ['A', row({ kaptCode: 'K1', name: '청운현대', households: 100, dongCount: 9, approvedDate: '1999-01-01', roadAddr: '서울특별시 종로구 자하문로 1', saleType: '임대', heating: '지역난방', elevatorCount: 2 })],
    ]);
    const r = await applyKaptMatches(prisma, matches, { sourceFile: 'test.xlsx' });
    expect(r.updated).toBe(1);
    const a = await prisma.housingComplex.findUnique({ where: { id: 'A' } });
    expect(a).toMatchObject({ kaptCode: 'K1', saleType: '임대', heating: '지역난방', elevatorCount: 2, households: 100, dongCount: 5, approvedDate: '2000-10-02', roadAddr: '서울특별시 종로구 자하문로 1' });
    expect(await prisma.housingSync.findFirst({ where: { kind: 'kapt' } })).toMatchObject({ count: 1, sourceFile: 'test.xlsx' });
  });
});
