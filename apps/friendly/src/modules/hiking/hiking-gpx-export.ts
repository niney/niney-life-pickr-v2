// 코스 GPX 내보내기 — 다른 등산 앱·GPS 에 넣어 쓰게 코스 선(조각마다 trkseg)·고도·코스 지점(wpt)을 GPX 1.1 로.
// 선은 저장된 encoded polyline(적재 때 정리한 선), 고도는 고도 프로필(20m 간격)을 선 길이 비율로 맞춰 보간한다(웹 지도와 같은
// 방식). 원천마다 출처를 metadata desc 에 적는다 — 국립공원 공식 탐방로는 공공누리 3유형(출처표시), SRTM 은 USGS.
// docs/PLAN-hiking.md §GPX 내보내기

import { decodePolyline, haversineM, hikingPoiLabel, isHikingMapPoiCategory, type HikingProfile } from '@repo/utils';

export interface GpxExportPoi {
  category: string;
  name: string | null;
  description: string | null;
  lat: number;
  lng: number;
  ele: number | null;
}

export interface GpxExportInput {
  courseId: string;
  mountainId: string;
  mountainName: string;
  courseName: string;
  source: 'top100' | 'peak' | 'network' | 'park';
  // 국립공원 공식 코스 문구가 붙은 코스 — 공원 이름·고도 출처.
  park: { parkName: string; elevationFrom: 'nearby' | 'terrain' | null } | null;
  pieces: readonly string[];
  profile: HikingProfile;
  pois: readonly GpxExportPoi[];
  publicOrigin: string;
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const coord = (n: number): string => n.toFixed(6);
const eleTag = (e: number | null): string => (e === null || !Number.isFinite(e) ? '' : `<ele>${e.toFixed(1)}</ele>`);

// 프로필 거리 d 의 고도(선형 보간, 범위 밖은 끝값).
const eleAtDistance = (profile: HikingProfile, d: number): number | null => {
  const { d: ds, e: es } = profile;
  if (ds.length === 0) return null;
  if (d <= ds[0]!) return es[0]!;
  if (d >= ds.at(-1)!) return es.at(-1)!;
  let lo = 0;
  let hi = ds.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (ds[mid]! <= d) lo = mid;
    else hi = mid;
  }
  const t = (d - ds[lo]!) / (ds[hi]! - ds[lo]! || 1);
  return es[lo]! + (es[hi]! - es[lo]!) * t;
};

export const courseSourceNote = (input: Pick<GpxExportInput, 'source' | 'park'>): string => {
  const parts: string[] = [];
  if (input.source === 'park') parts.push('선: 국립공원공단 탐방로(행정안전부 산행안전지도, 공공누리 제3유형)');
  else if (input.source === 'top100') parts.push('선·고도: 한국등산트레킹지원센터 100대명산 GPX(공공데이터포털 15098177)');
  else parts.push('선·고도: 한국등산트레킹지원센터 전국 주요 봉우리 코스 GPX(공공데이터포털 15108086)');
  if (input.source === 'network') parts.push('등산로 구간을 갈림길에서 이어 만든 길이라 실제 안내 코스와 다를 수 있음');
  if (input.source === 'park' && input.park?.elevationFrom === 'nearby') parts.push('고도: 근처 등산 기록에서 빌림');
  if (input.source === 'park' && input.park?.elevationFrom === 'terrain') parts.push('고도: SRTM 30m(SRTM data courtesy of the U.S. Geological Survey)');
  if (input.source !== 'park' && input.park) parts.push(`${input.park.parkName} 공식 코스와 같은 길`);
  return parts.join(' · ');
};

// 파일 이름 — 산·코스 이름(파일에 못 쓰는 글자는 뺀다).
export const gpxFileName = (mountainName: string, courseName: string): string =>
  `${`${mountainName} ${courseName}`.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'course'}.gpx`;

export const buildCourseGpx = (input: GpxExportInput): string => {
  const lines = input.pieces.map((p) => decodePolyline(p));
  const lens = lines.map((l) => l.reduce((s, p, i) => (i === 0 ? 0 : s + haversineM(l[i - 1]!, p)), 0));
  const total = lens.reduce((s, v) => s + v, 0);
  const profileLen = input.profile.d.at(-1) ?? 0;
  const hasEle = input.profile.e.length > 0;
  let walked = 0;
  const segs = lines.map((line) => {
    const pts = line.map((p, i) => {
      if (i > 0) walked += haversineM(line[i - 1]!, p);
      const ele = hasEle && total > 0 ? eleAtDistance(input.profile, (walked / total) * profileLen) : null;
      return `<trkpt lat="${coord(p.lat)}" lon="${coord(p.lng)}">${eleTag(ele)}</trkpt>`;
    });
    return `    <trkseg>\n      ${pts.join('\n      ')}\n    </trkseg>`;
  });
  const title = `${input.mountainName} ${input.courseName}`;
  const link = `${input.publicOrigin}/hiking?m=${encodeURIComponent(input.mountainId)}&c=${encodeURIComponent(input.courseId)}`;
  const wpts = input.pois
    .filter((p) => isHikingMapPoiCategory(p.category))
    .map((p) => {
      const label = hikingPoiLabel(p.category);
      const desc = p.description ? `<desc>${esc(p.description)}</desc>` : '';
      return `  <wpt lat="${coord(p.lat)}" lon="${coord(p.lng)}">${eleTag(p.ele)}<name>${esc(p.name ?? label)}</name>${desc}<type>${esc(label)}</type></wpt>`;
    });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="Life Pickr" xmlns="http://www.topografix.com/GPX/1/1">',
    '  <metadata>',
    `    <name>${esc(title)}</name>`,
    `    <desc>${esc(courseSourceNote(input))}</desc>`,
    `    <link href="${esc(link)}"><text>Life Pickr 등산</text></link>`,
    '  </metadata>',
    ...wpts,
    '  <trk>',
    `    <name>${esc(title)}</name>`,
    ...segs,
    '  </trk>',
    '</gpx>',
    '',
  ].join('\n');
};
