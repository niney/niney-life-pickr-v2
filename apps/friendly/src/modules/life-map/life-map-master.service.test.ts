import { describe, expect, it } from 'vitest';
import { parseCsv } from '../../lib/csv.js';
import {
  decodeLifeCsv,
  normalizeLifeCctvRows,
  normalizeLifeToiletRows,
} from './life-map-master.service.js';

// 정규화 순수 함수 검증 — 실 CSV 헤더(CCTV 18열 / 화장실 34열)를 그대로 쓰고 행만 합성한다.

const csvCell = (v: string): string => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const csvText = (header: string[], rows: string[][]): string =>
  [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';

const CCTV_HEADER = [
  '개방자치단체코드', '관리번호', '관리기관명', '소재지도로명주소', '소재지지번주소', '설치목적구분', '카메라대수',
  '카메라화소수', '촬영방면정보', '보관일수', '설치연월', '관리기관전화번호', 'WGS84위도', 'WGS84경도',
  '데이터기준일자', '데이터갱신구분', '데이터갱신시점', '최종수정시점',
];
const cctvRow = (over: Partial<Record<(typeof CCTV_HEADER)[number], string>> = {}): string[] => {
  const base: Record<string, string> = {
    개방자치단체코드: '3000000',
    관리번호: '202630000000800991',
    관리기관명: '서울특별시 종로구청',
    소재지도로명주소: '서울특별시 종로구 숭인동2길 30',
    소재지지번주소: '',
    설치목적구분: '생활방범',
    카메라대수: '3',
    카메라화소수: '200',
    촬영방면정보: '360도 전방면',
    보관일수: '30',
    설치연월: '201312',
    관리기관전화번호: '02-2148-3033',
    WGS84위도: '37.57814',
    WGS84경도: '127.0202',
    데이터기준일자: '2026-05-18',
    데이터갱신구분: '',
    데이터갱신시점: '2026-05-19 22:58:23',
    최종수정시점: '2026-05-18 15:24:22',
    ...over,
  };
  return CCTV_HEADER.map((h) => base[h] ?? '');
};

const TOILET_HEADER = [
  '개방자치단체코드', '관리번호', '구분명', '근거법령명', '화장실명', '소재지도로명주소', '소재지지번주소',
  '남성용-대변기수', '남성용-소변기수', '남성용-장애인용대변기수', '남성용-장애인용소변기수', '남성용-어린이용대변기수',
  '남성용-어린이용소변기수', '여성용-대변기수', '여성용-장애인용대변기수', '여성용-어린이용대변기수', '관리기관명',
  '전화번호', '개방시간', '개방시간상세', '설치연월', '화장실소유구분명', '오물처리방식', '안전관리시설설치대상여부',
  '비상벨설치여부', '비상벨설치장소', '화장실입구CCTV설치유무', '기저귀교환대유무', '기저귀교환대장소', '리모델링연월',
  '데이터기준일자', '데이터갱신구분', '데이터갱신시점', '최종수정시점',
];
const toiletRow = (over: Partial<Record<(typeof TOILET_HEADER)[number], string>> = {}): string[] => {
  const base: Record<string, string> = {
    개방자치단체코드: '3000000',
    관리번호: '202530000000100814',
    구분명: '공중화장실',
    근거법령명: '법제3조제16호',
    화장실명: '창덕공원',
    소재지도로명주소: '서울특별시 종로구 권농동 31',
    소재지지번주소: '서울특별시 종로구 권농동 31',
    '남성용-대변기수': '1',
    '남성용-소변기수': '1',
    '남성용-장애인용대변기수': '0',
    '남성용-장애인용소변기수': '0',
    '남성용-어린이용대변기수': '0',
    '남성용-어린이용소변기수': '0',
    '여성용-대변기수': '3',
    '여성용-장애인용대변기수': '0',
    '여성용-어린이용대변기수': '0',
    관리기관명: '종로구청 도시녹지과',
    전화번호: '0221482832',
    개방시간: '정시',
    개방시간상세: '9시간',
    설치연월: '198701',
    화장실소유구분명: '공공기관-지방자치단체',
    오물처리방식: '수세식',
    안전관리시설설치대상여부: 'Y',
    비상벨설치여부: 'Y',
    비상벨설치장소: '장애인화장실+여자화장실',
    화장실입구CCTV설치유무: 'Y',
    기저귀교환대유무: 'N',
    기저귀교환대장소: '',
    리모델링연월: '',
    데이터기준일자: '2024-12-31',
    데이터갱신구분: 'I',
    데이터갱신시점: '2026-05-15 18:43:46',
    최종수정시점: '2025-11-10 09:45:40',
    ...over,
  };
  return TOILET_HEADER.map((h) => base[h] ?? '');
};

describe('decodeLifeCsv', () => {
  it('UTF-8 BOM 은 UTF-8, 아니면 EUC-KR(CP949)', () => {
    const utf8 = new TextEncoder().encode(String.fromCharCode(0xfeff) + '관리번호,가\n1,나\n');
    expect(decodeLifeCsv(utf8)).toContain('관리번호');
    // '관리번호' 의 CP949 바이트(b0fc b8ae b9f8 c8a3).
    const cp949 = new Uint8Array([0xb0, 0xfc, 0xb8, 0xae, 0xb9, 0xf8, 0xc8, 0xa3, 0x2c, 0x61, 0x0a]);
    expect(decodeLifeCsv(cp949)).toBe('관리번호,a\n');
  });
});

describe('normalizeLifeCctvRows', () => {
  it('채택·drop 사유·목적 정규화·기준일자 최대', () => {
    const table = parseCsv(
      csvText(CCTV_HEADER, [
        cctvRow(),
        // 좌표 이상(0,0) drop
        cctvRow({ 관리번호: 'B', WGS84위도: '0', WGS84경도: '0' }),
        // 관리번호 중복 접힘
        cctvRow({ 설치목적구분: '교통단속' }),
        // 모르는 목적 → 기타, 쉼표 든 주소, 기준일자 더 큼
        cctvRow({
          관리번호: 'C',
          설치목적구분: '불법주정차',
          소재지도로명주소: '서울특별시 종로구 창신6가길 39 (산마루놀이터, 입구)',
          데이터기준일자: '20260601',
          카메라화소수: '',
          설치연월: '2019-06',
        }),
        // 관리번호 누락 drop
        cctvRow({ 관리번호: '' }),
      ]) + '3000000,D,extra\r\n', // 열 수 불일치
    );
    const report = normalizeLifeCctvRows(table.header, table.rows);
    expect(report.rows.map((r) => r.id)).toEqual(['202630000000800991', 'C']);
    expect(report.droppedBadCoord).toHaveLength(1);
    expect(report.duplicates).toBe(1);
    expect(report.droppedBadId).toBe(1);
    expect(report.droppedWidth).toBe(1);
    expect(report.byPurpose.get('생활방범')).toBe(1);
    expect(report.byPurpose.get('기타')).toBe(1);
    expect(report.maxBaseDate).toBe('2026-06-01');

    const first = report.rows[0]!;
    expect(first).toMatchObject({
      orgCode: '3000000',
      orgName: '서울특별시 종로구청',
      roadAddr: '서울특별시 종로구 숭인동2길 30',
      lotAddr: null,
      purpose: '생활방범',
      cameraCount: 3,
      pixels: 200,
      direction: '360도 전방면',
      keepDays: 30,
      installedYm: '201312',
      phone: '02-2148-3033',
      lat: 37.57814,
      lng: 127.0202,
      baseDate: '2026-05-18',
    });
    const third = report.rows[1]!;
    expect(third.roadAddr).toBe('서울특별시 종로구 창신6가길 39 (산마루놀이터, 입구)');
    expect(third.pixels).toBeNull();
    expect(third.installedYm).toBe('201906');
  });

  it('필수 열이 없으면 헤더 오류', () => {
    const header = CCTV_HEADER.filter((h) => h !== 'WGS84위도');
    expect(() => normalizeLifeCctvRows(header, [])).toThrow(/WGS84위도/);
  });
});

describe('normalizeLifeToiletRows', () => {
  it('편의시설 파생·24시간 판정·Y/N·구분 정규화·주소 없음', () => {
    const table = parseCsv(
      csvText(TOILET_HEADER, [
        toiletRow(),
        toiletRow({
          관리번호: 'T2',
          구분명: '',
          개방시간: '정시',
          개방시간상세: '00:00~24:00',
          '남성용-장애인용대변기수': '1',
          '여성용-어린이용대변기수': '2',
          안전관리시설설치대상여부: '',
          비상벨설치여부: 'N',
          기저귀교환대유무: 'Y',
          기저귀교환대장소: '여자화장실',
          리모델링연월: '202301',
          소재지도로명주소: '',
          소재지지번주소: '',
        }),
        toiletRow({ 관리번호: 'T3', 개방시간: '상시', 화장실명: '' }),
        toiletRow(), // 중복
      ]),
    );
    const report = normalizeLifeToiletRows(table.header, table.rows);
    expect(report.rows.map((r) => r.id)).toEqual(['202530000000100814', 'T2', 'T3']);
    expect(report.duplicates).toBe(1);
    expect(report.noAddress).toBe(1);
    expect(report.byKind.get('공중화장실')).toBe(2);
    expect(report.byKind.get('기타')).toBe(1);
    expect(report.maxBaseDate).toBe('2024-12-31');

    const a = report.rows[0]!;
    expect(a).toMatchObject({
      name: '창덕공원',
      kind: '공중화장실',
      openType: '정시',
      openDetail: '9시간',
      open24: false,
      maleToilet: 1,
      maleUrinal: 1,
      femaleToilet: 3,
      disabled: false,
      kids: false,
      ownerType: '공공기관-지방자치단체',
      disposal: '수세식',
      safetyTarget: true,
      bell: true,
      bellPlace: '장애인화장실+여자화장실',
      entranceCctv: true,
      diaper: false,
      installedYm: '198701',
      remodeledYm: null,
      lat: null,
      lng: null,
      geoSource: null,
    });
    const b = report.rows[1]!;
    expect(b).toMatchObject({
      kind: '기타',
      open24: true,
      disabled: true,
      kids: true,
      safetyTarget: null,
      bell: false,
      diaper: true,
      diaperPlace: '여자화장실',
      remodeledYm: '202301',
      roadAddr: null,
      lotAddr: null,
    });
    const c = report.rows[2]!;
    expect(c.open24).toBe(true);
    expect(c.name).toBe('(이름 없음)');
  });
});
