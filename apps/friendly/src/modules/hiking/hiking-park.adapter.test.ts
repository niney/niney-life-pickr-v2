import { describe, expect, it } from 'vitest';
import {
  SafetyDataError,
  fetchSafetyRows,
  normalizeParkBoundary,
  normalizeParkCourse,
  normalizeParkFacility,
  parseWktLines,
  parseWktPolygons,
  webMercatorToLatLng,
} from './hiking-park.adapter.js';

// 산행안전지도(9차) — EPSG:3857 WKT 풀기, 행 정리(원문 문구 그대로·쓰지 않는 시설 빼기·영문 공원 이름 → 한글), 쪽 넘기기·오류 코드.

// 위경도 → EPSG:3857(시험용 역변환).
const R = 6_378_137;
const merc = (lat: number, lng: number): string =>
  `${((lng * Math.PI) / 180) * R} ${Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * R}`;

describe('hiking-park.adapter', () => {
  it('webMercatorToLatLng — 실측 좌표(치악산 구룡 들머리)', () => {
    const p = webMercatorToLatLng(14255089.9263, 4490128.3201);
    expect(p.lat).toBeCloseTo(37.3651, 3);
    expect(p.lng).toBeCloseTo(128.0556, 3);
  });

  it('parseWktLines·parseWktPolygons — LINESTRING/MULTILINESTRING, POLYGON(구멍)/MULTIPOLYGON', () => {
    expect(parseWktLines(`LINESTRING(${merc(37, 127)},${merc(37.001, 127)})`)).toHaveLength(1);
    const multi = parseWktLines(`MULTILINESTRING((${merc(37, 127)},${merc(37.001, 127)}),(${merc(37.002, 127)},${merc(37.003, 127)}))`);
    expect(multi).toHaveLength(2);
    expect(multi[1]![1]!.lat).toBeCloseTo(37.003, 6);
    const ring = (lat: number, d: number) => [merc(lat, 127), merc(lat, 127 + d), merc(lat + d, 127 + d), merc(lat + d, 127), merc(lat, 127)].join(',');
    const poly = parseWktPolygons(`POLYGON((${ring(37, 0.1)}),(${ring(37.02, 0.01)}))`);
    expect(poly).toHaveLength(1);
    expect(poly[0]).toHaveLength(2);
    const mp = parseWktPolygons(`MULTIPOLYGON(((${ring(37, 0.1)})),((${ring(38, 0.1)}),(${ring(38.02, 0.01)})))`);
    expect(mp.map((p) => p.length)).toEqual([1, 2]);
    expect(mp[1]![0]![0]!.lat).toBeCloseTo(38, 6);
  });

  it('normalizeParkCourse — 문구 원문 그대로, 구간은 ~ 로 나눈다', () => {
    const row = normalizeParkCourse({
      SN: 181,
      COES_NM: '구룡~비로봉코스',
      DGOD: '상',
      NTNL_PARK_CD: '019',
      MNG_TELNO: '치악산국립공원사무소 (033)740-9900',
      SITE_EXPRS_SEQ: '6',
      PARK_NM: '치악산국립공원',
      SCHDL: '당일',
      COES_SCTN_NM: '구룡탐방지원센터~구룡사~ 세렴폭포 ~비로봉',
      REQ_HR: '03시간30분',
      DSTNC: '5.7km',
      GEOM: `LINESTRING(${merc(37.36, 128.05)},${merc(37.37, 128.06)})`,
    });
    expect(row).toMatchObject({
      sn: 181,
      parkCode: '019',
      parkName: '치악산국립공원',
      seq: 6,
      name: '구룡~비로봉코스',
      sections: ['구룡탐방지원센터', '구룡사', '세렴폭포', '비로봉'],
      duration: '03시간30분',
      distance: '5.7km',
      difficulty: '상',
      schedule: '당일',
      contact: '치악산국립공원사무소 (033)740-9900',
    });
    expect(row!.lines[0]).toHaveLength(2);
    expect(normalizeParkCourse({ SN: 1, COES_NM: '선 없음', PARK_NM: 'x', GEOM: '' })).toBeNull();
  });

  it('normalizeParkFacility — 탐방지원센터·안내소 ENTRY, 대피소 SHELTER, 사무소·분소·쓰지 않는 곳은 뺀다', () => {
    const base = { LAT: 33.36, LOT: 126.51, ALTD: 1694.14, TELNO: '064-000-0000', USE_YN: '1' };
    expect(normalizeParkFacility({ ...base, CLSF_CD: '105       ', MNG_NO: 202, KR_NM: '윗세대피소(1) ' })).toEqual({
      id: '202',
      category: 'SHELTER',
      name: '윗세대피소(1)',
      ele: 1694.14,
      lat: 33.36,
      lng: 126.51,
      phone: '064-000-0000',
    });
    expect(normalizeParkFacility({ ...base, CLSF_CD: '104', MNG_NO: '11', KR_NM: '동학사탐방지원센터' })?.category).toBe('ENTRY');
    expect(normalizeParkFacility({ ...base, CLSF_CD: '104', MNG_NO: '16', KR_NM: '백운대탐방지원센터', TELNO: '000-000-0000' })?.phone).toBeNull();
    expect(normalizeParkFacility({ ...base, CLSF_CD: '103', MNG_NO: '12', KR_NM: '설악동탐방안내소' })?.category).toBe('ENTRY');
    expect(normalizeParkFacility({ ...base, CLSF_CD: '101', MNG_NO: '13', KR_NM: '북한산국립공원사무소' })).toBeNull();
    expect(normalizeParkFacility({ ...base, CLSF_CD: '102', MNG_NO: '14', KR_NM: '내면분소' })).toBeNull();
    expect(normalizeParkFacility({ ...base, CLSF_CD: '105', MNG_NO: '15', KR_NM: '소청대피소', USE_YN: '0' })).toBeNull();
  });

  it('normalizeParkBoundary — 영문 WDPA 이름을 한글로(모르는 이름은 영문 그대로)', () => {
    const geom = `POLYGON((${merc(37.6, 126.9)},${merc(37.6, 127.1)},${merc(37.75, 127.1)},${merc(37.6, 126.9)}))`;
    expect(normalizeParkBoundary({ WDPAID: 764, NAME: 'Bukhansan', STATUS_YR: 1983, GEOM: geom })).toMatchObject({
      id: '764',
      name: '북한산국립공원',
      nameEn: 'Bukhansan',
      designatedYear: 1983,
    });
    expect(normalizeParkBoundary({ WDPAID: 1, NAME: 'Palgongsan', GEOM: geom })?.name).toBe('Palgongsan National Park');
  });

  it('fetchSafetyRows — 쪽을 넘겨 다 받고, resultCode 20(키·IP)은 오류', async () => {
    const urls: string[] = [];
    const pages = [Array.from({ length: 1000 }, (_, i) => ({ SN: i })), [{ SN: 1000 }]];
    const ok = async (url: string) => {
      urls.push(url);
      const page = Number(/pageNo=(\d+)/.exec(url)![1]);
      return new Response(JSON.stringify({ header: { resultCode: '00', resultMsg: 'NORMAL SERVICE' }, totalCount: 1001, body: pages[page - 1] }));
    };
    const rows = await fetchSafetyRows('course', 'KEY+/=', ok);
    expect(rows).toHaveLength(1001);
    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain('/V2/api/DSSP-IF-00143?serviceKey=KEY%2B%2F%3D&pageNo=1&numOfRows=1000&returnType=json');

    const denied = async () => new Response(JSON.stringify({ header: { resultCode: '20', resultMsg: 'SERVICE ACCESS DENIED ERROR', errorMsg: '서비스 접근거부' }, body: null }));
    const err = await fetchSafetyRows('park', 'BAD', denied).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SafetyDataError);
    expect((err as SafetyDataError).message).toContain('20');
    expect((err as SafetyDataError).requestUrl).toContain('serviceKey=***');
    expect((err as SafetyDataError).requestUrl).toContain('DSSP-IF-00145');
  });
});
