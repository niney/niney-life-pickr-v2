import { describe, expect, it } from 'vitest';
import { haversineM, wgs84ToUtmk } from '@repo/utils';
import {
  decodeDbfText,
  emptyLifeFloodReport,
  latestFloodEvent,
  normalizeLifeFloodRecord,
  parseDbf,
  parseLifeFloodLayer,
  parseSeoulFloodFileList,
  parseShpCentroids,
} from './life-flood-master.service.js';

// 서울시 침수흔적도 파서 — 합성 DBF/SHP 버퍼로 ① 값 인코딩(CP949·UTF-8 혼재) ② 폴리곤 무게중심(구멍 포함)·null
// shape ③ 연도별 스키마 차이(피해일자 꼬리·오타·2025 '피해일시'·숫자형 ADM_CD) ④ 파일 목록 HTML 파싱을 본다.

const CP949 = {
  침수: [0xc4, 0xa7, 0xbc, 0xf6],
  주택: [0xc1, 0xd6, 0xc5, 0xc3],
  피해일시: [0xc7, 0xc7, 0xc7, 0xd8, 0xc0, 0xcf, 0xbd, 0xc3],
};

type Cell = string | number[];
// dBASE III 합성 — 필드(이름 바이트, 길이), 행(셀 = ASCII 문자열 또는 원시 바이트). 삭제 행은 deleted=true.
const buildDbf = (fields: { name: Cell; length: number }[], rows: { cells: Cell[]; deleted?: boolean }[]): Buffer => {
  const headerLen = 32 + fields.length * 32 + 1;
  const recordLen = 1 + fields.reduce((a, f) => a + f.length, 0);
  const buf = Buffer.alloc(headerLen + rows.length * recordLen + 1, 0x20);
  buf.fill(0, 0, headerLen);
  buf[0] = 0x03;
  buf.writeUInt32LE(rows.length, 4);
  buf.writeUInt16LE(headerLen, 8);
  buf.writeUInt16LE(recordLen, 10);
  const bytesOf = (c: Cell): Buffer => (typeof c === 'string' ? Buffer.from(c, 'latin1') : Buffer.from(c));
  fields.forEach((f, i) => {
    const p = 32 + i * 32;
    bytesOf(f.name).copy(buf, p, 0, 11);
    buf[p + 11] = 0x43; // 'C'
    buf[p + 16] = f.length;
  });
  buf[headerLen - 1] = 0x0d;
  rows.forEach((r, i) => {
    let o = headerLen + i * recordLen;
    buf[o] = r.deleted ? 0x2a : 0x20;
    o += 1;
    fields.forEach((f, j) => {
      bytesOf(r.cells[j] ?? '').copy(buf, o, 0, f.length);
      o += f.length;
    });
  });
  buf[buf.length - 1] = 0x1a;
  return buf;
};

// SHP 합성 — 레코드: null 이면 null shape, 아니면 폴리곤 링 목록([x,y][][]).
const buildShp = (records: ([number, number][][] | null)[]): Buffer => {
  const parts: Buffer[] = [];
  records.forEach((rings, idx) => {
    let content: Buffer;
    if (rings === null) {
      content = Buffer.alloc(4);
      content.writeInt32LE(0, 0);
    } else {
      const pts = rings.flat();
      content = Buffer.alloc(44 + rings.length * 4 + pts.length * 16);
      content.writeInt32LE(5, 0);
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      content.writeDoubleLE(Math.min(...xs), 4);
      content.writeDoubleLE(Math.min(...ys), 12);
      content.writeDoubleLE(Math.max(...xs), 20);
      content.writeDoubleLE(Math.max(...ys), 28);
      content.writeInt32LE(rings.length, 36);
      content.writeInt32LE(pts.length, 40);
      let start = 0;
      rings.forEach((r, i) => {
        content.writeInt32LE(start, 44 + i * 4);
        start += r.length;
      });
      pts.forEach((p, i) => {
        content.writeDoubleLE(p[0], 44 + rings.length * 4 + i * 16);
        content.writeDoubleLE(p[1], 44 + rings.length * 4 + i * 16 + 8);
      });
    }
    const head = Buffer.alloc(8);
    head.writeInt32BE(idx + 1, 0);
    head.writeInt32BE(content.length / 2, 4);
    parts.push(head, content);
  });
  const body = Buffer.concat(parts);
  const header = Buffer.alloc(100);
  header.writeInt32BE(9994, 0);
  header.writeInt32BE((100 + body.length) / 2, 24);
  header.writeInt32LE(1000, 28);
  header.writeInt32LE(5, 32);
  return Buffer.concat([header, body]);
};

// 서울 시청 부근 UTM-K 좌표 기준 정사각형(시계 방향 = SHP 외곽 링).
const CITY_HALL = { lat: 37.5663, lng: 126.9779 };
const C = wgs84ToUtmk(CITY_HALL);
const square = (cx: number, cy: number, half: number): [number, number][] => [
  [cx - half, cy - half],
  [cx - half, cy + half],
  [cx + half, cy + half],
  [cx + half, cy - half],
  [cx - half, cy - half],
];

describe('decodeDbfText', () => {
  it('ASCII 는 그대로, 뒤 공백·NUL 제거', () => {
    expect(decodeDbfText(Buffer.from('20220808  \0\0'))).toBe('20220808');
  });
  it('CP949 한글은 euc-kr, 유효한 UTF-8 은 UTF-8 (한 파일 안 혼재)', () => {
    expect(decodeDbfText(Buffer.from(CP949.침수))).toBe('침수');
    expect(decodeDbfText(Buffer.from('배수용량초과', 'utf8'))).toBe('배수용량초과');
  });
});

describe('parseShpCentroids', () => {
  it('정사각형은 중심, 구멍(반시계 링)은 면적 가중으로 빠지고, null shape 는 null', () => {
    // 외곽 20×20(C.x..C.x+20) 오른쪽 위에 6×6 구멍(12~18, 반시계).
    const hole: [number, number][] = [
      [C.x + 12, C.y + 12],
      [C.x + 18, C.y + 12],
      [C.x + 18, C.y + 18],
      [C.x + 12, C.y + 18],
      [C.x + 12, C.y + 12],
    ];
    const pts = parseShpCentroids(buildShp([[square(C.x, C.y, 10)], null, [square(C.x + 10, C.y + 10, 10), hole]]));
    expect(pts).toHaveLength(3);
    expect(pts[0]!.x).toBeCloseTo(C.x, 6);
    expect(pts[0]!.y).toBeCloseTo(C.y, 6);
    expect(pts[1]).toBeNull();
    // (400·중심 − 36·구멍중심) / 364 — 구멍 쪽 반대(왼쪽 아래)로 36×5/364 ≈ 0.495m.
    expect(pts[2]!.x).toBeCloseTo(C.x + 10 - (36 * 5) / 364, 6);
    expect(pts[2]!.y).toBeCloseTo(C.y + 10 - (36 * 5) / 364, 6);
  });
});

describe('parseLifeFloodLayer — 연도별 스키마', () => {
  it('2010~2022 형식: 피해일자 꼬리 무시·오타는 F_YR 폴백, 침수심·시군구·유형', () => {
    const dbf = buildDbf(
      [
        { name: 'F_SAT_YMD', length: 14 },
        { name: 'F_YR', length: 4 },
        { name: 'F_SHIM', length: 10 },
        { name: 'ADM_CD', length: 18 },
        { name: 'F_RSN_DTL', length: 8 },
        { name: 'TYPE', length: 4 },
        { name: 'F_DISA_NM', length: 20 },
      ],
      [
        { cells: ['20220808 - 1', '2022', '0.30000000', '1114010100', CP949.침수, CP949.주택, '8.8.~ 17. rain'] },
        { cells: ['2180828', '2018', '0.45', '1111017400.0000000', '', '', ''] },
        { cells: ['', '', '', '', '', '', ''], deleted: true },
      ],
    );
    const shp = buildShp([[square(C.x, C.y, 5)], [square(C.x + 100, C.y, 5)], [square(C.x, C.y, 5)]]);
    const report = emptyLifeFloodReport();
    const rows = parseLifeFloodLayer(shp, dbf, 2022, report);
    expect(rows).toHaveLength(2);
    expect(haversineM(CITY_HALL, rows[0]!)).toBeLessThan(0.01);
    expect(rows[0]).toMatchObject({
      eventYear: 2022,
      eventMonth: 8,
      depthM: 0.3,
      sggCd: '11140',
      cause: '침수',
      kind: '주택',
      disaster: '8.8.~ 17. rain',
      sourceYear: 2022,
    });
    expect(rows[1]).toMatchObject({ eventYear: 2018, eventMonth: null, depthM: 0.45, sggCd: '11110', cause: null, kind: null });
    expect(report).toMatchObject({ read: 3, kept: 2, yearFallback: 1, dropped: { deleted: 1, noGeometry: 0, outOfRange: 0 } });
    expect(report.byEventYear).toEqual({ '2022': 1, '2018': 1 });
  });

  it('2025 형식: 피해일시(한글 필드명) 에서 연월, 날짜·F_YR 둘 다 없으면 파일 연도', () => {
    const dbf = buildDbf(
      [
        { name: CP949.피해일시, length: 16 },
        { name: 'F_SHIM', length: 10 },
        { name: 'ADM_CD', length: 10 },
      ],
      [{ cells: ['20250822 - 1031', '0.1', '1111014000'] }, { cells: ['', '', '1111014000'] }],
    );
    const report = emptyLifeFloodReport();
    const rows = parseLifeFloodLayer(buildShp([[square(C.x, C.y, 5)], [square(C.x, C.y, 5)]]), dbf, 2025, report);
    expect(rows.map((r) => [r.eventYear, r.eventMonth, r.depthM])).toEqual([
      [2025, 8, 0.1],
      [2025, null, null],
    ]);
  });

  it('SHP·DBF 레코드 수가 다르면 예외(속성이 엉뚱한 점에 붙는 것 방지)', () => {
    const dbf = buildDbf([{ name: 'F_YR', length: 4 }], [{ cells: ['2020'] }]);
    expect(() => parseLifeFloodLayer(buildShp([[square(C.x, C.y, 5)], [square(C.x, C.y, 5)]]), dbf, 2020, emptyLifeFloodReport())).toThrow(
      /레코드 수/,
    );
  });

  it('좌표계가 달라 한국 밖으로 떨어지면 drop', () => {
    const report = emptyLifeFloodReport();
    const row = normalizeLifeFloodRecord({ F_YR: '2020' }, { x: 127.0, y: 37.5 }, 2020, report);
    expect(row).toBeNull();
    expect(report.dropped.outOfRange).toBe(1);
  });

  it('parseDbf 는 필드 목록도 돌려준다', () => {
    const { fields } = parseDbf(buildDbf([{ name: CP949.피해일시, length: 16 }], []));
    expect(fields).toEqual([{ name: '피해일시', type: 'C', length: 16 }]);
  });
});

describe('parseSeoulFloodFileList', () => {
  it('연도별 zip 만, 같은 연도는 목록 위 것, 연도 오름차순', () => {
    const html = [
      `<span title="2025년 서울시 침수흔적도.zip" onclick="javascript:downloadFile('103');">`,
      `<span title="서울시 침수흔적도 컬럼 의미.pdf" onclick="javascript:downloadFile('98');">`,
      `<span title="2024년 침수흔적도_260105 수정.zip" onclick="javascript:downloadFile('32');">`,
      `<span title="2024년 침수흔적도.zip" onclick="javascript:downloadFile('20');">`,
      `<span title="2010년 서울특별시 침수흔적도.zip" onclick="javascript:downloadFile('4');">`,
    ].join('\n');
    expect(parseSeoulFloodFileList(html)).toEqual([
      { year: 2010, seq: '4', name: '2010년 서울특별시 침수흔적도.zip' },
      { year: 2024, seq: '32', name: '2024년 침수흔적도_260105 수정.zip' },
      { year: 2025, seq: '103', name: '2025년 서울시 침수흔적도.zip' },
    ]);
  });
});

describe('latestFloodEvent', () => {
  const row = (eventYear: number, eventMonth: number | null) => ({
    lat: 37.5,
    lng: 127,
    eventYear,
    eventMonth,
    depthM: null,
    disaster: null,
    cause: null,
    kind: null,
    sggCd: null,
    sourceYear: eventYear,
  });
  it('가장 늦은 연월, 월 없는 연도만 있으면 연도', () => {
    expect(latestFloodEvent([row(2022, 8), row(2025, 9), row(2025, null)])).toBe('2025-09');
    expect(latestFloodEvent([row(2022, 8), row(2025, null)])).toBe('2025');
    expect(latestFloodEvent([])).toBeNull();
  });
});
