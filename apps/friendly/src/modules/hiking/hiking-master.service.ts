// 등산 마스터 적재 — GPX zip(코스) + 명산등산로(산) + 등산트레킹 POI(지점) + 산 사진 순번 → 행 만들기·전량 교체.
// 네트워크는 스크립트(load:hiking)가 하고, 여기는 순수 조립(buildHikingRows)과 DB 쓰기(replaceHiking)만.
// docs/PLAN-hiking.md

import type { Prisma, PrismaClient } from '@prisma/client';
import { encodePolyline, hikingRegionsOf } from '@repo/utils';
import { listZipEntries } from '../housing/housing-price-master.service.js';
import { readZipEntryBuffer } from '../life-map/life-flood-master.service.js';
import { matchPeakInfo, type GdTrailRow, type MountainInfoRow, type TrekkingPoiRow } from './hiking-api.adapter.js';
import { courseSigungu, sigunguArea, sigunguAt, type SigunguShape } from './hiking-area.js';
import { LineGrid, PointGrid, overlapShare } from './hiking-grid.js';
import type { DemAt } from './hiking-dem.js';
import { coursesFromNetwork } from './hiking-network.js';
import type { LatLngPoint, ParkBoundaryRow, ParkCourseRow } from './hiking-park.adapter.js';
import {
  COURSE_POI_M,
  LINE_TOLERANCE_M,
  VILLAGE_CATEGORY,
  buildCourse,
  cleanPlaceName,
  distM,
  guideSignposts,
  isGenericPlaceName,
  isTrailNetwork,
  nameCourse,
  parseGpx,
  peakPointName,
  projectOnCourse,
  simplifyLine,
  turnAt,
  type BuiltCourse,
  type BuiltPoint,
  type CourseNames,
  type GpxPoint,
  type GpxSignpost,
  type GpxWaypoint,
  type NamedPoint,
  type SignGuide,
} from './hiking-gpx.js';

// ── GPX zip ───────────────────────────────────────────────────────────────────

export interface GpxCourseFile {
  // GPX 폴더 이름(= 등산트레킹 숲길명).
  mountain: string;
  no: number;
  xml: string;
}

// `100대명산/<산>/<산>_<번호>.gpx`. zip 의 local 헤더 이름은 깨져 있어도 central 이름(UTF-8 플래그)을 쓴다.
const GPX_ENTRY_RE = /(?:^|\/)([^/]+)\/[^/]*_(\d+)\.gpx$/i;

export const readHikingZip = async (zipPath: string): Promise<GpxCourseFile[]> => {
  const out: GpxCourseFile[] = [];
  for (const entry of await listZipEntries(zipPath)) {
    const m = GPX_ENTRY_RE.exec(entry.name);
    if (!m) continue;
    const buf = await readZipEntryBuffer(zipPath, entry);
    out.push({ mountain: m[1]!.normalize('NFC'), no: Number(m[2]), xml: buf.toString('utf8') });
  }
  return out.sort((a, b) => a.mountain.localeCompare(b.mountain, 'ko') || a.no - b.no);
};

// ── 산 이름 맞추기 ──────────────────────────────────────────────────────────────

// 명산등산로 이름 → GPX 폴더 이름. "덕유산(향적봉)" ↔ "덕유산", "백운산(포천)" 은 그대로 같다.
const baseName = (name: string): string => name.replace(/\s*\([^)]*\)\s*$/, '').trim();
export const matchGpxFolder = (gdName: string, folders: ReadonlySet<string>): string | null => {
  if (folders.has(gdName)) return gdName;
  const base = baseName(gdName);
  return folders.has(base) ? base : null;
};

// ── 행 만들기 ──────────────────────────────────────────────────────────────────

export interface HikingBuildInput {
  files: GpxCourseFile[];
  gdTrails: GdTrailRow[];
  pois: TrekkingPoiRow[];
  // 산 id → 저장된 사진 순번.
  images: ReadonlyMap<string, number[]>;
  // 시군구 경계(hiking-area parseSigunguGeo) — 없으면 코스 시군구를 비운다(null).
  sigungu: readonly SigunguShape[] | null;
  loadedAt: Date;
  // ── 5차 전국 주요 봉우리(15108086) — 없으면 100대 명산만. ──
  peaks?: readonly PreparedPeak[];
  // 산정보 전체(봉우리 소개·높이·소재지).
  mountainInfos?: readonly MountainInfoRow[];
  // 들머리 이름 후보 — 지하철역·버스 정류장(TRANS)·공영 주차장(PARK). 스크립트가 DB 에서 봉우리 코스 끝 근처만 골라 준다.
  places?: readonly PeakPlace[];
  // 들머리 리·동 이름(역지오코딩 캐시) — villageKey(좌표) → 이름.
  villages?: ReadonlyMap<string, string>;
  // 7차 — 코스 지점으로 붙일 시설(일상지도 공중화장실·공영 주차장). 스크립트가 DB 에서 준다. 9차부터 국립공원 탐방지원센터·
  // 안내소·대피소(산행안전지도)도.
  facilities?: readonly HikingFacility[];
  // ── 9차 행정안전부 산행안전지도(국립공원공단) — 없으면 건너뛴다. ──
  // 공식 탐방로 코스(DSSP-IF-00143) · 국립공원 경계(DSSP-IF-00145).
  parkCourses?: readonly ParkCourseRow[];
  parks?: readonly ParkBoundaryRow[];
  // 지형 고도(hiking-dem — 적재기가 공식 코스 둘레 타일을 미리 받아 둔다). 근처 GPX 고도를 못 빌린 공식 코스에 쓴다.
  demAt?: DemAt;
}

export interface HikingFacility {
  // 원천 id — 지점 id 는 'toilet:<id>' · 'lot:<id>' · 'knps:<관리번호>'(FACILITY_RULES).
  id: string;
  // TOILET 공중화장실 · PARK 공영 주차장 · ENTRY 국립공원 탐방지원센터·안내소 · SHELTER 국립공원 대피소.
  category: 'TOILET' | 'PARK' | 'ENTRY' | 'SHELTER';
  name: string;
  detail: string | null;
  lat: number;
  lng: number;
  ele?: number | null;
  // 지점 원천 표기(HikingPoi.source) — 기본 'facility', 국립공원 시설은 'park'.
  source?: 'facility' | 'park';
}

export interface PeakPlace {
  // ENTRY 국립공원 탐방지원센터·안내소(9차 — 들머리 이름 우선).
  category: 'TRANS' | 'PARK' | 'ENTRY';
  name: string;
  lat: number;
  lng: number;
}

export interface HikingBuildReport {
  gpxFiles: number;
  courses: number;
  emptyCourses: string[];
  unmatchedFolders: string[];
  unmatchedGdTrails: string[];
  reversed: number;
  loops: number;
  pieced: number;
  noElevation: number;
  numberNamed: number;
  pois: { gpx: number; api: number; both: number };
  apiPoisUnmatched: number;
  duplicatePoiIds: number;
  // 분류·이름·좌표가 같아 하나로 접은 GPX 지점 수.
  gpxSameSpot: number;
  coursePoiLinks: number;
  summitFromPeak: number;
  // 이정표 안내 — 이정표 있는 코스 지점 수, 그중 이 GPX 의 이정표(기록 방향 앎)·가는 길/온 길을 정한 수.
  guide: { signs: number; ownFrame: number; withNext: number; withPrev: number };
  // 시군구 — 시군구를 하나도 못 정한 코스, 코스당 시군구 수 최대.
  sigungu: { empty: string[]; maxPerCourse: number };
  // 5차 전국 주요 봉우리 — 넣지 않았으면 null.
  peaks: PeakBuildReport | null;
  // 7차 — 코스에 붙인 공중화장실·공영 주차장 지점(새로 만든 것)과 연결 수. 9차 국립공원 탐방지원센터·안내소·대피소.
  facilities: { toilets: number; lots: number; centers: number; shelters: number; links: number } | null;
  // 9차 국립공원(산행안전지도) — 넣지 않았으면 null.
  park: ParkBuildReport | null;
}

export interface ParkBuildReport {
  // 원천 공식 코스 · 같은 길 코스에 문구만 붙인 것 · 새 코스로 넣은 것(그중 근처 GPX 고도를 빌린 것) · 산을 못 정해 뺀 것.
  courses: number;
  enriched: number;
  added: number;
  withElevation: number;
  // 새 코스 중 근처 GPX 대신 지형 고도를 붙인 것.
  withTerrain: number;
  // 방향을 시설 이름(구간 처음·끝)으로 정한 것 · 그래서 뒤집은 것 · 고도 검사로 다시 뒤집은 것.
  oriented: number;
  flipped: number;
  eleFixed: number;
  // 같은 길 코스 중 공식 구간 순서가 그 코스 방향과 반대인 것(문구에 reversed).
  opposite: string[];
  unassigned: string[];
  // 경계 · 정상이 공원 안인 산.
  parks: number;
  mountainsInPark: number;
}

export interface PeakBuildReport {
  folders: number;
  // 코스로 쓴 파일 · 등산로 망(6차) · 트랙 점이 없는 파일.
  courseFiles: number;
  networkFiles: number;
  emptyFiles: number;
  // 코스가 하나라도 있는 봉우리.
  withCourses: number;
  // 100대 명산에 합친 봉우리·더한 코스·그 산 코스와 겹쳐 버린 코스.
  merged: number;
  mergedCourses: number;
  mergedDup: number;
  // 따로 산이 된 봉우리·코스·같은 봉우리 안에서 겹쳐 버린 코스.
  independent: number;
  independentCourses: number;
  independentDup: number;
  // 새로 만든 봉우리 지점 · 같은 자리 기존 봉우리 지점으로 이은 것.
  peakPois: number;
  aliasPois: number;
  // 코스에 붙인 지나는 봉우리(새 봉우리 지점) 연결 수.
  passLinks: number;
  infoMatched: number;
  // 봉우리 코스 이름 — 들머리를 역·정류장·주차장으로 · 리·동으로 · 번호로.
  placeNamed: number;
  villageNamed: number;
  numberNamed: number;
  // 이어진 봉우리가 있는 산.
  withNeighbors: number;
  // 6차 — 등산로 망에서 만든 코스(넣은 것)·갈림길 지점·망 코스만 있는 봉우리 산.
  networkCourses: number;
  junctionPois: number;
  networkOnlyPeaks: number;
  // 1km 안 돼 버린 봉우리 코스.
  shortCourses: number;
}

export interface HikingRows {
  mountains: Prisma.HikingMountainCreateManyInput[];
  courses: Prisma.HikingCourseCreateManyInput[];
  pois: Prisma.HikingPoiCreateManyInput[];
  coursePois: Prisma.HikingCoursePoiCreateManyInput[];
  // 9차 국립공원 경계.
  parks: Prisma.HikingParkCreateManyInput[];
  report: HikingBuildReport;
  // 따로 산이 된 봉우리 id → 산정보 id(사진 받기용).
  peakInfoIds: Map<string, string>;
}

// API 에만 있는 지점을 코스에 붙이는 거리 — GPX 지점(COURSE_POI_M)보다 엄격하게(같은 산 다른 코스의 갈림길이 많다).
const API_POI_LINK_M = 30;
// API 지점과 GPX 지점을 같은 곳으로 보는 거리(같은 분류일 때). 실측: 좌표가 소수 5자리까지 같은 쌍이 대부분.
const POI_MERGE_M = 10;

interface PoiDraft {
  id: string;
  category: string;
  name: string | null;
  description: string | null;
  lat: number;
  lng: number;
  ele: number | null;
  signposts: { dest: string; dir: string | null }[];
  source: 'gpx' | 'api' | 'both';
}

// 정상 고르기 — 이름이 '정상'·산 이름·괄호 속 봉우리 이름이면 우선, 그중(또는 전체에서) 공식 높이에 가장 가까운 것.
const pickSummit = (peaks: readonly PoiDraft[], gdName: string, heightM: number | null): PoiDraft | null => {
  if (peaks.length === 0) return null;
  const base = baseName(gdName);
  const alt = /\(([^)]+)\)\s*$/.exec(gdName)?.[1]?.trim() ?? null;
  const named = peaks.filter((p) => {
    const n = (p.name ?? '').replace(/\s+/g, '');
    return n === '정상' || n === base || n.startsWith(`${base}정상`) || (alt !== null && n.includes(alt));
  });
  const pool = named.length > 0 ? named : peaks;
  const score = (p: PoiDraft): number => (heightM !== null && p.ele !== null ? -Math.abs(p.ele - heightM) : (p.ele ?? -1e9));
  return pool.reduce((a, b) => (score(b) > score(a) ? b : a));
};

export const buildHikingRows = (input: HikingBuildInput): HikingRows => {
  const report: HikingBuildReport = {
    gpxFiles: input.files.length,
    courses: 0,
    emptyCourses: [],
    unmatchedFolders: [],
    unmatchedGdTrails: [],
    reversed: 0,
    loops: 0,
    pieced: 0,
    noElevation: 0,
    numberNamed: 0,
    pois: { gpx: 0, api: 0, both: 0 },
    apiPoisUnmatched: 0,
    duplicatePoiIds: 0,
    gpxSameSpot: 0,
    coursePoiLinks: 0,
    summitFromPeak: 0,
    guide: { signs: 0, ownFrame: 0, withNext: 0, withPrev: 0 },
    sigungu: { empty: [], maxPerCourse: 0 },
    peaks: null,
    facilities: null,
    park: null,
  };
  const folders = new Set(input.files.map((f) => f.mountain));
  const gdByFolder = new Map<string, GdTrailRow & { id: string }>();
  for (const g of input.gdTrails) {
    const folder = matchGpxFolder(g.name, folders);
    if (!g.id) report.unmatchedGdTrails.push(`${g.name}(산 코드 없음)`);
    else if (folder) gdByFolder.set(folder, { ...g, id: g.id });
    else report.unmatchedGdTrails.push(g.name);
  }

  const mountains: Prisma.HikingMountainCreateManyInput[] = [];
  const courses: Prisma.HikingCourseCreateManyInput[] = [];
  const pois: Prisma.HikingPoiCreateManyInput[] = [];
  const coursePois: Prisma.HikingCoursePoiCreateManyInput[] = [];
  const seenPoiIds = new Set<string>();
  // 5차 봉우리 합치기·지나는 봉우리용 — 100대 명산 코스(정리된 선).
  const top100Built: Top100Course[] = [];

  const filesByFolder = new Map<string, GpxCourseFile[]>();
  for (const f of input.files) filesByFolder.set(f.mountain, [...(filesByFolder.get(f.mountain) ?? []), f]);
  const apiByFolder = new Map<string, TrekkingPoiRow[]>();
  for (const p of input.pois) {
    if (!folders.has(p.mountainName)) {
      report.apiPoisUnmatched += 1;
      continue;
    }
    apiByFolder.set(p.mountainName, [...(apiByFolder.get(p.mountainName) ?? []), p]);
  }

  for (const [folder, files] of filesByFolder) {
    const gd = gdByFolder.get(folder);
    if (!gd) {
      report.unmatchedFolders.push(folder);
      continue;
    }
    const mountainName = baseName(gd.name);

    // 코스.
    const built = files
      .map((f) => {
        const parsed = parseGpx(f.xml);
        const course = buildCourse(parsed);
        if (!course) report.emptyCourses.push(`${folder}/${f.no}`);
        return course ? { file: f, parsed, course } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    if (built.length === 0) continue;

    // 지점 — GPX(sym, 전국에서 하나뿐인 1~22,989) + API(poiId, 별개 번호 체계 — 같은 숫자도 다른 곳이다).
    // id 에 출처 접두를 붙이고, API 지점은 같은 분류의 GPX 지점과 POI_MERGE_M 안이면 같은 곳으로 합친다.
    // GPX 에는 분류·이름·좌표가 같은데 번호만 다른 지점이 ~500개 있다(설악산 대청봉 두 개) — 산 안에서 하나로 접고
    // 다른 번호는 aliases 로 대표 id 에 잇는다(코스 연결용).
    const drafts = new Map<string, PoiDraft>();
    const aliases = new Map<string, string>();
    const sameSpot = new Map<string, string>();
    const gpxIdOf = (sym: string): string => aliases.get(`gpx:${sym}`) ?? `gpx:${sym}`;
    const addGpx = (w: GpxWaypoint) => {
      let id = `gpx:${w.sym}`;
      const spotKey = `${w.category}|${w.name ?? ''}|${w.lat.toFixed(5)},${w.lng.toFixed(5)}`;
      const canonical = sameSpot.get(spotKey);
      if (canonical && canonical !== id) {
        if (!aliases.has(id)) report.gpxSameSpot += 1;
        aliases.set(id, canonical);
        id = canonical;
      } else sameSpot.set(spotKey, id);
      const cur = drafts.get(id);
      if (cur) {
        if (w.signposts.length > cur.signposts.length) cur.signposts = w.signposts;
        return;
      }
      drafts.set(id, {
        id,
        category: w.category,
        name: w.name,
        description: null,
        lat: w.lat,
        lng: w.lng,
        ele: w.ele,
        signposts: w.signposts,
        source: 'gpx',
      });
    };
    for (const b of built) b.parsed.waypoints.forEach(addGpx);
    const gpxDrafts = [...drafts.values()];
    const apiOnly: PoiDraft[] = [];
    for (const a of apiByFolder.get(folder) ?? []) {
      let cur: PoiDraft | null = null;
      let curD = POI_MERGE_M;
      for (const g of gpxDrafts) {
        if (g.category !== a.category) continue;
        const d = distM(g, a);
        if (d <= curD) [cur, curD] = [g, d];
      }
      if (cur) {
        cur.source = 'both';
        cur.name ??= a.name;
        cur.description ??= a.description;
        cur.ele ??= a.ele;
        if (a.signposts.length > cur.signposts.length) cur.signposts = a.signposts;
        continue;
      }
      const id = `api:${a.poiId}`;
      const d: PoiDraft = { id, category: a.category, name: a.name, description: a.description, lat: a.lat, lng: a.lng, ele: a.ele, signposts: a.signposts, source: 'api' };
      drafts.set(id, d);
      apiOnly.push(d);
    }

    const summit = pickSummit(
      [...drafts.values()].filter((p) => p.category === 'PEAK'),
      gd.name,
      gd.heightM,
    );
    if (summit) report.summitFromPeak += 1;
    const tops = built.map((b) => b.course.top).filter((t): t is NonNullable<typeof t> => t !== null);
    const fallbackTop = tops.length > 0 ? tops.reduce((a, b) => (b.ele! > a.ele! ? b : a)) : null;

    const bbox = { minLat: Infinity, minLng: Infinity, maxLat: -Infinity, maxLng: -Infinity };
    const lengths: number[] = [];
    for (const { file, parsed, course } of built) {
      const id = `${gd.id}-${file.no}`;
      // 코스 지점 — 이 GPX 의 지점(선에서 COURSE_POI_M 안) + API 에만 있는 지점(API_POI_LINK_M 안).
      const links = new Map<string, { atM: number; draft: PoiDraft; own: GpxWaypoint | null }>();
      const link = (poiId: string, p: { lat: number; lng: number }, maxOff: number, own: GpxWaypoint | null) => {
        const draft = drafts.get(poiId);
        if (!draft || links.has(poiId)) return;
        const pr = projectOnCourse(course, p);
        if (pr.offM > maxOff) return;
        links.set(poiId, { atM: pr.atM, draft, own });
      };
      for (const w of parsed.waypoints) link(gpxIdOf(w.sym), w, COURSE_POI_M, w);
      for (const a of apiOnly) link(a.id, a, API_POI_LINK_M, null);

      // 이름 후보 — 이 GPX 의 지점(이름이 비면 병합된 API 이름) + 코스에 붙은 API 지점("계방산정상"처럼 GPX 에 없는 이름).
      const namePoints: NamedPoint[] = [
        ...parsed.waypoints.map((w) => ({ ...w, name: w.name ?? drafts.get(gpxIdOf(w.sym))?.name ?? null })),
        ...[...links.values()].filter((l) => l.draft.source === 'api').map((l) => l.draft),
      ];
      const names = nameCourse(course, namePoints, mountainName, file.no);
      report.courses += 1;
      if (course.reversed) report.reversed += 1;
      if (course.isLoop) report.loops += 1;
      if (course.gaps.length > 0) report.pieced += 1;
      if (!course.hasElevation) report.noElevation += 1;
      if (names.source === 'number') report.numberNamed += 1;
      bbox.minLat = Math.min(bbox.minLat, course.bbox.minLat);
      bbox.minLng = Math.min(bbox.minLng, course.bbox.minLng);
      bbox.maxLat = Math.max(bbox.maxLat, course.bbox.maxLat);
      bbox.maxLng = Math.max(bbox.maxLng, course.bbox.maxLng);
      lengths.push(course.lengthM);
      const sigungu = input.sigungu ? courseSigungu(course, input.sigungu) : null;
      if (sigungu) {
        if (sigungu.length === 0) report.sigungu.empty.push(`${folder}/${file.no}`);
        report.sigungu.maxPerCourse = Math.max(report.sigungu.maxPerCourse, sigungu.length);
      }
      top100Built.push({ id, mountainId: gd.id, course });
      courses.push(courseRow({ id, mountainId: gd.id, no: file.no, names, course, sigungu, source: 'top100' }));

      // 이정표 안내 — 이 GPX 의 이정표가 있으면 그것(기록 방향을 안다), 없으면 병합된 지점의 이정표(API, 방향 모름).
      const named = [...links.values()]
        .filter((l) => l.draft.name && !isGenericPlaceName(cleanPlaceName(l.draft.name)))
        .map((l) => ({ name: l.draft.name!, atM: l.atM }));
      for (const [poiId, l] of links) {
        const own = l.own && l.own.signposts.length > 0 ? l.own.signposts : null;
        const signs = own ?? l.draft.signposts;
        const guide =
          signs.length > 0
            ? guideSignposts({
                signposts: signs,
                atM: l.atM,
                named,
                mountainName,
                topAtM: course.top?.atM ?? null,
                sameFrame: own ? !course.reversed : null,
                turnDeg: turnAt(course, l.atM),
              })
            : [];
        if (guide.length > 0) {
          report.guide.signs += 1;
          if (own) report.guide.ownFrame += 1;
          if (guide.some((g) => g.way === 'next')) report.guide.withNext += 1;
          if (guide.some((g) => g.way === 'prev')) report.guide.withPrev += 1;
        }
        coursePois.push({ courseId: id, poiId, atM: l.atM, guide: guide.length > 0 ? JSON.stringify(guide) : null });
      }
      report.coursePoiLinks += links.size;
    }

    mountains.push({
      id: gd.id,
      name: gd.name,
      gpxName: folder,
      subtitle: gd.subtitle,
      heightM: gd.heightM,
      area: gd.area,
      regions: hikingRegionsOf(gd.area).join(','),
      overview: gd.overview,
      details: gd.details,
      reason: gd.reason,
      officialCourses: gd.officialCourses,
      summitName: summit?.name ?? null,
      summitLat: summit?.lat ?? fallbackTop?.lat ?? null,
      summitLng: summit?.lng ?? fallbackTop?.lng ?? null,
      summitEle: summit?.ele ?? fallbackTop?.ele ?? null,
      ...bbox,
      courseCount: built.length,
      minLengthM: Math.min(...lengths),
      maxLengthM: Math.max(...lengths),
      images: JSON.stringify(input.images.get(gd.id) ?? []),
      kind: 'top100',
      loadedAt: input.loadedAt,
    });

    for (const d of drafts.values()) {
      // 같은 번호가 다른 산에도 있으면(원천 중복) 먼저 넣은 쪽만.
      if (seenPoiIds.has(d.id)) {
        report.duplicatePoiIds += 1;
        continue;
      }
      seenPoiIds.add(d.id);
      report.pois[d.source] += 1;
      pois.push({
        id: d.id,
        mountainId: gd.id,
        category: d.category,
        name: d.name,
        description: d.description,
        lat: d.lat,
        lng: d.lng,
        ele: d.ele,
        signposts: d.signposts.length > 0 ? JSON.stringify(d.signposts) : null,
        source: d.source,
      });
    }
  }

  // 원천 중복으로 빠진 지점을 가리키는 연결은 버린다(FK).
  const kept = coursePois.filter((cp) => seenPoiIds.has(cp.poiId));
  report.coursePoiLinks = kept.length;
  const rows: HikingRows = { mountains, courses, pois, coursePois: kept, parks: [], report, peakInfoIds: new Map() };
  const builtAll: Top100Course[] = [...top100Built];
  if (input.peaks && input.peaks.length > 0) builtAll.push(...appendPeaks(rows, top100Built, input));
  if (input.parkCourses && input.parkCourses.length > 0) builtAll.push(...appendParkCourses(rows, builtAll, input));
  if (input.parks && input.parks.length > 0) appendParkAreas(rows, input.parks, input.loadedAt);
  if (input.facilities && input.facilities.length > 0) appendFacilities(rows, builtAll, input.facilities);
  rows.report.coursePoiLinks = rows.coursePois.length;
  return rows;
};

// 코스 행 — 100대 명산·봉우리 공용.
const courseRow = (a: {
  id: string;
  mountainId: string;
  no: number;
  names: CourseNames;
  course: BuiltCourse;
  sigungu: string[] | null;
  source: 'top100' | 'peak' | 'network' | 'park';
  park?: ParkCourseInfo | null;
}): Prisma.HikingCourseCreateManyInput => {
  const { course, names } = a;
  return {
    id: a.id,
    mountainId: a.mountainId,
    no: a.no,
    name: names.name,
    nameSource: names.source,
    startName: names.startName,
    endName: names.endName,
    peakName: names.peakName,
    lengthM: course.lengthM,
    hasElevation: course.hasElevation,
    gainM: course.gainM,
    lossM: course.lossM,
    minEle: course.minEle,
    maxEle: course.maxEle,
    startLat: course.start.lat,
    startLng: course.start.lng,
    startEle: course.start.ele,
    endLat: course.end.lat,
    endLng: course.end.lng,
    endEle: course.end.ele,
    isLoop: course.isLoop,
    shape: course.shape,
    moveMin: course.moveMin,
    moveRevMin: course.moveRevMin,
    steepPct: course.steepPct,
    sigungu: a.sigungu ? JSON.stringify(a.sigungu) : null,
    source: a.source,
    park: a.park ? JSON.stringify(a.park) : null,
    pieceCount: course.pieces.length,
    gapCount: course.gaps.length,
    gapM: course.gaps.reduce((s, g) => s + g, 0),
    ...course.bbox,
    pieces: JSON.stringify(course.pieces.map((p) => encodePolyline(simplifyLine(p, LINE_TOLERANCE_M)))),
    profile: JSON.stringify(course.profile),
    surfaces: JSON.stringify(course.surfaces),
  };
};

// ── 전국 주요 봉우리(5차) ──────────────────────────────────────────────────────
// docs/PLAN-hiking.md §전국 확장. 원천: 한국등산트레킹지원센터 전국 주요 봉우리 코스(15108086) — 폴더 `<봉우리 코드 10자리>_<이름>`,
// 지점·노면 없이 선·고도만. 여러 조각 파일은 거의 다 등산로 망(isTrailNetwork)이라 5차는 한 줄(이어 붙는) 코스만 쓴다.
//   - 정상(코스 중 가장 높은 점)이 100대 명산 코스 범위(여유 200m) 안이고 그 산 코스 선 1km 안이면 그 산에 합친다 — 코스는 그 산 코스와
//     80% 넘게 겹치면(20m) 버리고, 봉우리는 그 산의 봉우리 지점으로(같은 자리·같은 이름 기존 봉우리가 있으면 그것으로 잇는다).
//   - 아니면 따로 산(kind peak, id = 봉우리 코드). 같은 봉우리 안에서 겹치는 코스는 버린다.
//   - 모든 코스에 지나는 봉우리(선 30m 안), 봉우리 코스에는 근처 등산 지점(100대 명산 GPX·API)도 붙인다. 산마다 이어진 봉우리
//     (정상이 서로의 코스 선 30m 안 — 산으로 자동 묶으면 사슬처럼 번져서 묶지 않고 잇기만 한다).

const PEAK_FOLDER_RE = /^(\d{10})_(.+)$/;
const PEAK_JOIN_M = 1_000;
// 범위 판정 여유(≈200m) — 정상이 그 산 코스 범위 가장자리 바로 밖에 찍히는 봉우리(능선 끝 봉우리)도 합치게.
const PEAK_JOIN_PAD_DEG = 0.002;
const PEAK_DUP_SHARE = 0.8;
const PEAK_DUP_M = 20;
// 코스 선에서 이 안의 지점을 코스 지점으로(봉우리·등산 지점 — API 지점 연결과 같은 엄격함).
const PEAK_LINK_M = API_POI_LINK_M;
// 한 코스에 붙는 봉우리끼리 이 안이면 같은 봉우리로 보고 하나만(GPX 봉우리 우선).
const PEAK_SAME_ON_COURSE_M = 50;
const PEAK_ALIAS_SPOT_M = 30;
const PEAK_ALIAS_NAME_M = 150;
const PLACE_NAME_M = 300;
const NEIGHBOR_M = 30;
const NEIGHBOR_MAX = 8;
// 100대 명산에 더한 봉우리 코스의 순번 — 원래 GPX 번호(최대 37) 뒤.
const MERGED_NO_BASE = 100;
const NETWORK_NO_BASE = 1_000;
// 봉우리 코스 최소 길이 — 공원 둘레 몇백 m 고리("신림동 원점회귀 5분")가 추천 맨 위를 차지했다.
const PEAK_MIN_COURSE_M = 1_000;
// 망 정상 후보에서 뺄 다른 봉우리 정상 둘레.
const NETWORK_AVOID_M = 200;
// 망 갈림길을 코스 지점으로 — 선에서 이 안, 같은 자리 기존 갈림길 거리, 코스 끝(들머리·정상)에서 이만큼 떨어진 것만.
const JUNCTION_LINK_M = 15;
const JUNCTION_SAME_M = 20;
const JUNCTION_END_M = 30;

export interface PreparedPeakCourse {
  // 파일 번호. 등산로 망에서 만든 코스(6차)는 1000 + 파일 번호 × 10 + 순번(파일 번호 최대 28과 겹치지 않게, 코스 id 4자리 안).
  fileNo: number;
  course: BuiltCourse;
  origin: 'file' | 'network';
}
export interface PeakJunction {
  lat: number;
  lng: number;
  ele: number | null;
  degree: number;
}
export interface PreparedPeak {
  code: string;
  folder: string;
  // 산 목록 이름(폴더 이름 그대로 — "장군봉(노원구)"처럼 동명 구분이 들어 있다) · 봉우리 지점 이름(지역 괄호 뗌).
  name: string;
  pointName: string;
  courses: PreparedPeakCourse[];
  networkFiles: number;
  emptyFiles: number;
  // 코스 중 가장 높은 점(고도 없으면 null).
  top: BuiltPoint | null;
  // 등산로 망의 갈림길(세 갈래 이상) — 그 망에서 만든 코스에 지점으로 붙인다.
  junctions: PeakJunction[];
  // 1km 안 돼 버린 코스(공원 둘레 몇백 m 고리 — 추천 맨 위를 차지했다).
  tooShort: number;
  // 망 파일 원문 점(위도·경도·고도 셋씩, 고도 없으면 NaN) — 모든 봉우리 정상을 안 뒤(finishPeaks) 코스를 만든다.
  networkRaw: { no: number; segs: Float64Array[] }[];
}

// 파일 하나씩 정리해 쌓는다 — 원문(풀면 538MB)을 한꺼번에 들고 있지 않게.
const addPeakFile = (byCode: Map<string, PreparedPeak>, f: GpxCourseFile): void => {
  const m = PEAK_FOLDER_RE.exec(f.mountain);
  if (!m) return;
  const code = m[1]!;
  let peak = byCode.get(code);
  if (!peak) {
    const name = m[2]!.trim();
    peak = { code, folder: f.mountain, name, pointName: peakPointName(name), courses: [], networkFiles: 0, emptyFiles: 0, top: null, junctions: [], tooShort: 0, networkRaw: [] };
    byCode.set(code, peak);
  }
  const parsed = parseGpx(f.xml);
  if (isTrailNetwork(parsed.segments)) {
    // 6차 — 망은 점만 줄여 들고 있다가 모든 봉우리 정상을 안 뒤 코스를 만든다(finishPeaks — 옆 봉우리 정상을 정상으로 잡지 않게).
    peak.networkFiles += 1;
    peak.networkRaw.push({ no: f.no, segs: parsed.segments.map((seg) => Float64Array.from(seg.flatMap((q) => [q.lat, q.lng, q.ele ?? NaN]))) });
    return;
  }
  const course = buildCourse(parsed);
  if (!course) {
    peak.emptyFiles += 1;
    return;
  }
  if (course.lengthM < PEAK_MIN_COURSE_M) {
    peak.tooShort += 1;
    return;
  }
  peak.courses.push({ fileNo: f.no, course, origin: 'file' });
};

const keepTop = (peak: PreparedPeak, course: BuiltCourse): void => {
  if (course.top && (!peak.top || course.top.ele! > peak.top.ele!)) peak.top = course.top;
};

const finishPeaks = (byCode: Map<string, PreparedPeak>): PreparedPeak[] => {
  const out = [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code));
  // 한 줄 코스로 정상을 안 봉우리들 — 망 정상 후보에서 그 둘레(NETWORK_AVOID_M)를 뺀다.
  for (const p of out) for (const c of p.courses) keepTop(p, c.course);
  const tops = new PointGrid<string>(NETWORK_AVOID_M);
  for (const p of out) if (p.top) tops.add(p.top.lat, p.top.lng, p.code);
  // 망뿐인 봉우리끼리는 정한 정상을 차례로 더해 서로 피한다 — 같은 망을 나눠 가진 산·봉우리(수락산·도솔봉)가 같은 점을 고르면
  // 이름이 '…산'인 쪽이 먼저(그 망의 가장 높은 점은 대개 그 산 정상이다 — 수락산 637m 자리), 그다음 봉우리 코드 순.
  const isSan = (p: PreparedPeak): boolean => /산$/.test(p.pointName.replace(/\s*\([^)]*\)/g, ''));
  const order = [...out].sort((a, b) => Number(isSan(b)) - Number(isSan(a)) || a.code.localeCompare(b.code));
  for (const p of order) {
    const avoided = (q: { lat: number; lng: number }) =>
      tops.near(q.lat, q.lng, NETWORK_AVOID_M).some((t) => t.value !== p.code && distM(t, q) <= NETWORK_AVOID_M);
    // 한 줄 코스가 있으면 그 정상, 없으면 망 정상(코스 최고점은 옆 봉우리 능선을 지날 수 있어 쓰지 않는다).
    const fileTop = p.top !== null;
    for (const raw of p.networkRaw) {
      const segments = raw.segs.map((a) =>
        Array.from({ length: a.length / 3 }, (_, i) => ({ lat: a[i * 3]!, lng: a[i * 3 + 1]!, ele: Number.isNaN(a[i * 3 + 2]!) ? null : a[i * 3 + 2]!, seq: i + 1 })),
      );
      const net = coursesFromNetwork(segments, avoided);
      net.paths.forEach((path, k) => {
        const course = buildCourse({ waypoints: [], segments: [path.points.map((q, i) => ({ ...q, seq: i + 1 }))], surfaces: [] });
        if (!course) return;
        if (course.lengthM < PEAK_MIN_COURSE_M) {
          p.tooShort += 1;
          return;
        }
        p.courses.push({ fileNo: NETWORK_NO_BASE + raw.no * 10 + k + 1, course, origin: 'network' });
      });
      const sm = net.summit;
      if (!fileTop && net.paths.length > 0 && sm && sm.ele !== null && (!p.top || sm.ele > p.top.ele!)) p.top = { lat: sm.lat, lng: sm.lng, ele: sm.ele, atM: 0 };
      p.junctions.push(...net.junctions);
    }
    if (!fileTop && p.top) tops.add(p.top.lat, p.top.lng, p.code);
    p.networkRaw = [];
    p.courses.sort((a, b) => a.fileNo - b.fileNo);
  }
  return out;
};

export const preparePeaks = (files: readonly GpxCourseFile[]): PreparedPeak[] => {
  const byCode = new Map<string, PreparedPeak>();
  for (const f of files) addPeakFile(byCode, f);
  return finishPeaks(byCode);
};

export const readPeakZip = async (zipPath: string): Promise<PreparedPeak[]> => {
  const byCode = new Map<string, PreparedPeak>();
  for (const entry of await listZipEntries(zipPath)) {
    const m = GPX_ENTRY_RE.exec(entry.name);
    if (!m) continue;
    const buf = await readZipEntryBuffer(zipPath, entry);
    addPeakFile(byCode, { mountain: m[1]!.normalize('NFC'), no: Number(m[2]), xml: buf.toString('utf8') });
  }
  return finishPeaks(byCode);
};

// 역지오코딩 캐시 키(소수 4자리 ≈ 10m).
export const villageKey = (p: { lat: number; lng: number }): string => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
// 봉우리 코스 끝 — 원점회귀는 시작만(들머리 이름 후보를 찾을 자리).
export const peakCourseEnds = (peaks: readonly PreparedPeak[]): { lat: number; lng: number }[] =>
  peaks.flatMap((p) => p.courses.flatMap(({ course }) => (course.isLoop ? [course.start] : [course.start, course.end])));

interface Top100Course {
  id: string;
  mountainId: string;
  course: BuiltCourse;
}
interface PoiLite {
  id: string;
  mountainId: string;
  category: string;
  name: string | null;
  lat: number;
  lng: number;
  ele: number | null;
  signposts: GpxSignpost[];
  source: string;
}
interface PeakEntry {
  origin: 'file' | 'network';
  id: string;
  mountainId: string;
  no: number;
  course: BuiltCourse;
  peak: PreparedPeak;
  merged: boolean;
}

const compactName = (s: string): string => s.replace(/[\s·.,]/g, '');
// "도봉산(신선대)" → ["도봉산", "신선대"] — 100대 명산의 같은 이름 봉우리 지점을 찾는 이름들.
const peakLabels = (pointName: string): string[] => {
  const inner = [...pointName.matchAll(/\(([^)]+)\)/g)].map((m) => m[1]!);
  return [pointName.replace(/\s*\([^)]*\)/g, ''), ...inner].map(compactName).filter((s) => s.length >= 2);
};

// 따로 있는 산 이름 — 끝이 '산'이고 그 100대 명산 이름을 담지 않으면(북한산 옆 인왕산·관악산 옆 우면산·신불산 옆 간월산) 범위·거리가
// 맞아도 합치지 않고 따로 둔다(이어진 봉우리로 잇는다). 실측: 합칠 뻔한 314곳 중 61곳. 봉·대·재 같은 봉우리는 합친다.
export const isSeparateMountainName = (pointName: string, hostBase: string): boolean => {
  const core = compactName(pointName.replace(/\s*\([^)]*\)/g, ''));
  const base = compactName(hostBase);
  return /산$/.test(core) && !core.includes(base) && !base.includes(core);
};
// 이름 끝 괄호의 지역("인릉산(서초구)" → 서초구) — 산정보·소재지를 고를 때 정상 시군구보다 먼저 본다.
const regionParen = (name: string): string | null => /\(([^()]+(?:시|군|구))\)\s*$/.exec(name)?.[1] ?? null;

// 넣은 봉우리 코스(시설 지점 붙이기용)를 돌려준다.
const appendPeaks = (rows: HikingRows, top100: readonly Top100Course[], input: HikingBuildInput): Top100Course[] => {
  const peaks = input.peaks ?? [];
  const rep: PeakBuildReport = {
    folders: peaks.length,
    courseFiles: 0,
    networkFiles: 0,
    emptyFiles: 0,
    withCourses: 0,
    merged: 0,
    mergedCourses: 0,
    mergedDup: 0,
    independent: 0,
    independentCourses: 0,
    independentDup: 0,
    peakPois: 0,
    aliasPois: 0,
    passLinks: 0,
    infoMatched: 0,
    placeNamed: 0,
    villageNamed: 0,
    numberNamed: 0,
    withNeighbors: 0,
    networkCourses: 0,
    junctionPois: 0,
    networkOnlyPeaks: 0,
    shortCourses: 0,
  };
  rows.report.peaks = rep;
  for (const p of peaks) {
    rep.shortCourses += p.tooShort;
    rep.courseFiles += p.courses.length;
    rep.networkFiles += p.networkFiles;
    rep.emptyFiles += p.emptyFiles;
    if (p.courses.length > 0) rep.withCourses += 1;
  }

  const mountainById = new Map(rows.mountains.map((m) => [m.id, m]));
  const poiLites: PoiLite[] = rows.pois.map((p) => ({
    id: p.id,
    mountainId: p.mountainId,
    category: p.category,
    name: p.name ?? null,
    lat: p.lat,
    lng: p.lng,
    ele: p.ele ?? null,
    signposts: p.signposts ? (JSON.parse(p.signposts) as GpxSignpost[]) : [],
    source: p.source,
  }));
  const poiById = new Map(poiLites.map((p) => [p.id, p]));
  const addPoi = (p: PoiLite): void => {
    poiLites.push(p);
    poiById.set(p.id, p);
    rows.pois.push({ id: p.id, mountainId: p.mountainId, category: p.category, name: p.name, description: null, lat: p.lat, lng: p.lng, ele: p.ele, signposts: null, source: p.source });
    rep.peakPois += 1;
  };
  const peakPoi = (peak: PreparedPeak, mountainId: string, top: BuiltPoint): PoiLite => ({
    id: `peak:${peak.code}`,
    mountainId,
    category: 'PEAK',
    name: peak.pointName,
    lat: top.lat,
    lng: top.lng,
    ele: top.ele !== null ? Math.round(top.ele) : null,
    signposts: [],
    source: 'peak',
  });

  // 100대 명산 코스 선 — 합치기(1km)·겹침(20m).
  const nearGrid = new LineGrid<string>(250, 25);
  const dupGrid = new LineGrid<string>(10, 5);
  for (const t of top100) {
    for (const piece of t.course.pieces) {
      nearGrid.addLine(piece, t.mountainId);
      dupGrid.addLine(piece, t.mountainId);
    }
  }
  const top100Rows = rows.mountains.filter((m) => (m.kind ?? 'top100') === 'top100');
  const bboxArea = (m: { minLat: number; minLng: number; maxLat: number; maxLng: number }) => (m.maxLat - m.minLat) * (m.maxLng - m.minLng);

  const entries: PeakEntry[] = [];
  const subPeaks = new Map<string, string[]>();
  const nextNo = new Map<string, number>();
  const independents: PreparedPeak[] = [];

  for (const peak of peaks) {
    if (peak.courses.length === 0) continue;
    const top = peak.top ?? peak.courses[0]!.course.start;
    const host = top100Rows
      .filter(
        (m) =>
          top.lat >= m.minLat - PEAK_JOIN_PAD_DEG &&
          top.lat <= m.maxLat + PEAK_JOIN_PAD_DEG &&
          top.lng >= m.minLng - PEAK_JOIN_PAD_DEG &&
          top.lng <= m.maxLng + PEAK_JOIN_PAD_DEG &&
          nearGrid.has(top.lat, top.lng, PEAK_JOIN_M, m.id) &&
          !isSeparateMountainName(peak.pointName, baseName(m.name)),
      )
      .sort((a, b) => bboxArea(a) - bboxArea(b))[0];

    if (host) {
      rep.merged += 1;
      for (const pc of peak.courses) {
        if (overlapShare(pc.course.pieces, dupGrid, host.id, PEAK_DUP_M) >= PEAK_DUP_SHARE) {
          rep.mergedDup += 1;
          continue;
        }
        const no = (nextNo.get(host.id) ?? MERGED_NO_BASE) + 1;
        nextNo.set(host.id, no);
        entries.push({ id: `${peak.code}-${pc.fileNo}`, mountainId: host.id, no, course: pc.course, peak, merged: true, origin: pc.origin });
        for (const piece of pc.course.pieces) dupGrid.addLine(piece, host.id);
        rep.mergedCourses += 1;
      }
      // 같은 자리(30m) 봉우리, 또는 150m 안 같은 이름 봉우리가 그 산에 이미 있으면 새로 만들지 않는다(코스 연결은 그 지점으로).
      const labels = peakLabels(peak.pointName);
      const same = poiLites.find((p) => {
        if (p.mountainId !== host.id || p.category !== 'PEAK') return false;
        const d = distM(p, top);
        if (d <= PEAK_ALIAS_SPOT_M) return true;
        const n = p.name ? compactName(cleanPlaceName(p.name)) : '';
        return d <= PEAK_ALIAS_NAME_M && n.length >= 2 && labels.some((l) => n === l || n.includes(l));
      });
      if (same) rep.aliasPois += 1;
      else addPoi(peakPoi(peak, host.id, top));
      const base = baseName(host.name);
      if (compactName(peak.pointName) !== compactName(base)) subPeaks.set(host.id, [...(subPeaks.get(host.id) ?? []), peak.pointName]);
      continue;
    }

    const own = new LineGrid<string>(10, 5);
    let added = 0;
    for (const pc of peak.courses) {
      if (added > 0 && overlapShare(pc.course.pieces, own, peak.code, PEAK_DUP_M) >= PEAK_DUP_SHARE) {
        rep.independentDup += 1;
        continue;
      }
      entries.push({ id: `${peak.code}-${pc.fileNo}`, mountainId: peak.code, no: pc.fileNo, course: pc.course, peak, merged: false, origin: pc.origin });
      for (const piece of pc.course.pieces) own.addLine(piece, peak.code);
      added += 1;
      rep.independentCourses += 1;
    }
    rep.independent += 1;
    if (peak.courses.every((c) => c.origin === 'network')) rep.networkOnlyPeaks += 1;
    independents.push(peak);
  }

  // 따로 산이 된 봉우리 — 산 행(지점보다 먼저 넣어야 한다: FK).
  const infoByName = new Map<string, MountainInfoRow[]>();
  for (const info of input.mountainInfos ?? []) infoByName.set(info.name, [...(infoByName.get(info.name) ?? []), info]);
  const entriesOf = new Map<string, PeakEntry[]>();
  for (const e of entries) entriesOf.set(e.mountainId, [...(entriesOf.get(e.mountainId) ?? []), e]);
  for (const peak of independents) {
    const es = entriesOf.get(peak.code) ?? [];
    const top = peak.top ?? es[0]!.course.start;
    // 시군구 — 정상 자리, 이름 괄호의 지역, 코스가 걸친 곳(경계 능선의 산은 정상이 이웃 시군구에 찍히곤 한다).
    const key = input.sigungu ? sigunguAt(input.sigungu, top.lat, top.lng) : null;
    const crossed = input.sigungu ? [...new Set(es.flatMap((e) => courseSigungu(e.course, input.sigungu!)))] : [];
    const paren = regionParen(peak.name);
    const parenKey = paren ? (crossed.find((k) => k.split(':')[1] === paren) ?? null) : null;
    const nameOf = (k: string) => k.split(':')[1] ?? '';
    const info = matchPeakInfo(
      peak.name,
      { preferred: [...(paren ? [paren] : []), ...(key ? [nameOf(key)] : [])], others: crossed.map(nameOf) },
      infoByName,
    );
    if (info) {
      rep.infoMatched += 1;
      rows.peakInfoIds.set(peak.code, info.id);
    }
    const areaKey = parenKey ?? key ?? crossed[0] ?? null;
    const area = info?.address ?? (areaKey ? sigunguArea(areaKey) : null);
    const lengths = es.map((e) => e.course.lengthM);
    const row: Prisma.HikingMountainCreateManyInput = {
      id: peak.code,
      name: peak.name,
      gpxName: peak.folder,
      subtitle: null,
      heightM: info?.heightM ?? (top.ele !== null ? Math.round(top.ele) : null),
      area,
      regions: hikingRegionsOf(area).join(','),
      overview: info?.details ?? null,
      details: null,
      reason: null,
      officialCourses: null,
      summitName: peak.pointName,
      summitLat: top.lat,
      summitLng: top.lng,
      summitEle: top.ele !== null ? Math.round(top.ele) : null,
      minLat: Math.min(...es.map((e) => e.course.bbox.minLat)),
      minLng: Math.min(...es.map((e) => e.course.bbox.minLng)),
      maxLat: Math.max(...es.map((e) => e.course.bbox.maxLat)),
      maxLng: Math.max(...es.map((e) => e.course.bbox.maxLng)),
      courseCount: es.length,
      minLengthM: Math.min(...lengths),
      maxLengthM: Math.max(...lengths),
      images: JSON.stringify(input.images.get(peak.code) ?? []),
      kind: 'peak',
      loadedAt: input.loadedAt,
    };
    rows.mountains.push(row);
    mountainById.set(row.id, row);
    addPoi(peakPoi(peak, peak.code, top));
  }

  // 100대 명산에 더한 코스 — 그 산 범위·코스 수·길이·봉우리 이름.
  for (const e of entries) {
    if (!e.merged) continue;
    const m = mountainById.get(e.mountainId)!;
    m.minLat = Math.min(m.minLat, e.course.bbox.minLat);
    m.minLng = Math.min(m.minLng, e.course.bbox.minLng);
    m.maxLat = Math.max(m.maxLat, e.course.bbox.maxLat);
    m.maxLng = Math.max(m.maxLng, e.course.bbox.maxLng);
    m.courseCount += 1;
    m.minLengthM = Math.min(m.minLengthM ?? Infinity, e.course.lengthM);
    m.maxLengthM = Math.max(m.maxLengthM ?? 0, e.course.lengthM);
  }
  for (const [id, names] of subPeaks) mountainById.get(id)!.peaks = JSON.stringify([...new Set(names)]);

  // 코스 지점 찾기 — 선 위 점마다 근처 지점을 모아 정확히 다시 잰다.
  const poiGrid = new PointGrid<PoiLite>(50);
  for (const p of poiLites) poiGrid.add(p.lat, p.lng, p);
  const linksNear = (course: BuiltCourse, accept: (p: PoiLite) => boolean): { poi: PoiLite; atM: number }[] => {
    const cand = new Set<PoiLite>();
    for (const piece of course.pieces) {
      for (let i = 0; i < piece.length; i += 2) for (const { value } of poiGrid.near(piece[i]!.lat, piece[i]!.lng, PEAK_LINK_M + 20)) if (accept(value)) cand.add(value);
    }
    const out: { poi: PoiLite; atM: number }[] = [];
    for (const poi of cand) {
      const pr = projectOnCourse(course, poi);
      if (pr.offM <= PEAK_LINK_M) out.push({ poi, atM: pr.atM });
    }
    return out.sort((a, b) => a.atM - b.atM);
  };

  // 100대 명산 코스 — 새 봉우리 지점(지나는 봉우리)만 더한다. 같은 자리 GPX 봉우리가 이미 붙어 있으면 건너뛴다.
  const linkedByCourse = new Map<string, Set<string>>();
  for (const cp of rows.coursePois) {
    const set = linkedByCourse.get(cp.courseId);
    if (set) set.add(cp.poiId);
    else linkedByCourse.set(cp.courseId, new Set([cp.poiId]));
  }
  for (const t of top100) {
    const have = linkedByCourse.get(t.id) ?? new Set<string>();
    const peaksHere = [...have].map((id) => poiById.get(id)).filter((p): p is PoiLite => !!p && p.category === 'PEAK');
    for (const { poi, atM } of linksNear(t.course, (p) => p.source === 'peak' && !have.has(p.id))) {
      if (peaksHere.some((q) => distM(q, poi) <= PEAK_SAME_ON_COURSE_M)) continue;
      peaksHere.push(poi);
      rows.coursePois.push({ courseId: t.id, poiId: poi.id, atM, guide: null });
      rep.passLinks += 1;
    }
  }

  // 봉우리 코스 — 지점·이름·행.
  const placeGrid = new PointGrid<PeakPlace>(100);
  for (const pl of input.places ?? []) placeGrid.add(pl.lat, pl.lng, pl);
  const villages = input.villages ?? new Map<string, string>();
  const nearPlaces = (p: { lat: number; lng: number }): NamedPoint[] =>
    placeGrid
      .near(p.lat, p.lng, PLACE_NAME_M)
      .filter(({ value }) => distM(value, p) <= PLACE_NAME_M)
      .map(({ value }) => ({ category: value.category, name: value.name, lat: value.lat, lng: value.lng, ele: null }));
  const villagePoint = (p: BuiltPoint): NamedPoint[] => {
    const v = villages.get(villageKey(p));
    return v ? [{ category: VILLAGE_CATEGORY, name: v, lat: p.lat, lng: p.lng, ele: null }] : [];
  };
  for (const e of entries) {
    // 등산 지점 먼저(GPX·API 봉우리를 새 봉우리보다 앞에) — 같은 자리 봉우리는 하나만.
    const found = linksNear(e.course, () => true).sort((a, b) => Number(a.poi.source === 'peak') - Number(b.poi.source === 'peak') || a.atM - b.atM);
    const kept: { poi: PoiLite; atM: number }[] = [];
    for (const l of found) {
      if (l.poi.category === 'PEAK' && kept.some((k) => k.poi.category === 'PEAK' && distM(k.poi, l.poi) <= PEAK_SAME_ON_COURSE_M)) continue;
      kept.push(l);
    }
    kept.sort((a, b) => a.atM - b.atM);
    const mountainName = e.merged ? baseName(mountainById.get(e.mountainId)!.name) : e.peak.pointName;
    const ends = e.course.isLoop ? [e.course.start] : [e.course.start, e.course.end];
    const wpts: NamedPoint[] = [
      ...kept.map(
        ({ poi }): NamedPoint => ({
          category: poi.category,
          name: poi.name,
          lat: poi.lat,
          lng: poi.lng,
          ele: poi.ele,
          source: poi.source === 'api' ? 'api' : poi.source === 'both' ? 'both' : 'gpx',
        }),
      ),
      ...ends.flatMap(nearPlaces),
      ...ends.flatMap(villagePoint),
    ];
    const names = nameCourse(e.course, wpts, mountainName, e.no);
    const startVillage = villages.get(villageKey(e.course.start)) ?? null;
    if (names.source === 'number') rep.numberNamed += 1;
    else if (names.startName && names.startName === startVillage) rep.villageNamed += 1;
    else if (names.startName) rep.placeNamed += 1;
    const sigungu = input.sigungu ? courseSigungu(e.course, input.sigungu) : null;
    if (sigungu) {
      if (sigungu.length === 0) rows.report.sigungu.empty.push(e.id);
      rows.report.sigungu.maxPerCourse = Math.max(rows.report.sigungu.maxPerCourse, sigungu.length);
    }
    rows.courses.push(courseRow({ id: e.id, mountainId: e.mountainId, no: e.no, names, course: e.course, sigungu, source: e.origin === 'network' ? 'network' : 'peak' }));
    if (e.origin === 'network') rep.networkCourses += 1;
    rows.report.courses += 1;
    if (e.course.isLoop) rows.report.loops += 1;
    if (e.course.reversed) rows.report.reversed += 1;
    if (!e.course.hasElevation) rows.report.noElevation += 1;

    // 이 코스 기준 이정표 안내 — 100대 명산 지점의 이정표는 이 기록의 방향을 모른다(sameFrame null).
    const named = kept.filter((k) => k.poi.name && !isGenericPlaceName(cleanPlaceName(k.poi.name))).map((k) => ({ name: k.poi.name!, atM: k.atM }));
    for (const k of kept) {
      const guide =
        k.poi.signposts.length > 0
          ? guideSignposts({ signposts: k.poi.signposts, atM: k.atM, named, mountainName, topAtM: e.course.top?.atM ?? null, sameFrame: null, turnDeg: turnAt(e.course, k.atM) })
          : [];
      rows.coursePois.push({ courseId: e.id, poiId: k.poi.id, atM: k.atM, guide: guide.length > 0 ? JSON.stringify(guide) : null });
      if (k.poi.source === 'peak') rep.passLinks += 1;
    }

    // 6차 — 망에서 만든 코스의 갈림길. 이정표가 없어 이 코스 기준 가는 길(정상 쪽·내려갈 쪽)·온 길만 단다. 같은 자리(20m)에 100대
    // 명산 갈림길이 이미 붙었으면 건너뛴다.
    if (e.origin !== 'network') continue;
    const topAt = e.course.top?.atM ?? null;
    const signsHere = kept.filter((k) => k.poi.category === 'SIGN');
    e.peak.junctions.forEach((j, index) => {
      const pr = projectOnCourse(e.course, j);
      if (pr.offM > JUNCTION_LINK_M || signsHere.some((k) => distM(k.poi, j) <= JUNCTION_SAME_M)) return;
      // 코스 양 끝(들머리·정상)에 걸친 갈림길은 갈림길로 보이지 않는다.
      if (pr.atM < JUNCTION_END_M || pr.atM > e.course.lengthM - JUNCTION_END_M) return;
      const key = `jct:${e.peak.code}-${index}`;
      if (!poiById.has(key)) {
        const poi: PoiLite = { id: key, mountainId: e.mountainId, category: 'SIGN', name: null, lat: j.lat, lng: j.lng, ele: j.ele !== null ? Math.round(j.ele) : null, signposts: [], source: 'network' };
        poiLites.push(poi);
        poiById.set(key, poi);
        rows.pois.push({ id: key, mountainId: e.mountainId, category: 'SIGN', name: null, description: `${j.degree}갈래`, lat: j.lat, lng: j.lng, ele: poi.ele, signposts: null, source: 'network' });
        rep.junctionPois += 1;
      }
      let guide: SignGuide[] = [];
      if (topAt !== null && pr.atM < topAt - JUNCTION_END_M) {
        guide = [
          { dest: names.peakName ?? '정상', dir: null, way: 'next' },
          { dest: names.startName ?? '들머리', dir: null, way: 'prev' },
        ];
      } else if (topAt !== null && pr.atM > topAt + JUNCTION_END_M) {
        const down = e.course.isLoop ? names.startName : names.endName;
        guide = [
          { dest: down ?? (e.course.isLoop ? '들머리' : '날머리'), dir: null, way: 'next' },
          { dest: names.peakName ?? '정상', dir: null, way: 'prev' },
        ];
      }
      rows.coursePois.push({ courseId: e.id, poiId: key, atM: pr.atM, guide: guide.length > 0 ? JSON.stringify(guide) : null });
    });
  }

  // 이어진 봉우리 — 한 산의 코스 선 30m 안에 다른 산 정상이 있으면 둘을 잇는다(정상끼리 가까운 순, 최대 8).
  const summits = new PointGrid<string>(50);
  for (const m of rows.mountains) if (m.summitLat != null && m.summitLng != null) summits.add(m.summitLat, m.summitLng, m.id);
  const pairs = new Map<string, Map<string, number>>();
  const addPair = (a: string, b: string, d: number) => {
    for (const [x, y] of [
      [a, b],
      [b, a],
    ] as const) {
      const m = pairs.get(x) ?? new Map<string, number>();
      m.set(y, Math.min(m.get(y) ?? Infinity, d));
      pairs.set(x, m);
    }
  };
  for (const { mountainId, course } of [...top100, ...entries]) {
    const self = mountainById.get(mountainId)!;
    for (const piece of course.pieces) {
      for (let i = 0; i < piece.length; i += 2) {
        const p = piece[i]!;
        for (const s of summits.near(p.lat, p.lng, NEIGHBOR_M + 20)) {
          if (s.value === mountainId || distM(s, p) > NEIGHBOR_M) continue;
          const d = self.summitLat != null && self.summitLng != null ? distM({ lat: self.summitLat, lng: self.summitLng }, s) : Infinity;
          addPair(mountainId, s.value, d);
        }
      }
    }
  }
  for (const m of rows.mountains) {
    const near = pairs.get(m.id);
    m.neighbors = JSON.stringify(near ? [...near].sort((a, b) => a[1] - b[1]).slice(0, NEIGHBOR_MAX).map(([id]) => id) : []);
    if (near && near.size > 0) rep.withNeighbors += 1;
  }
  return entries.map((e) => ({ id: e.id, mountainId: e.mountainId, course: e.course }));
};

// ── 국립공원 공식 탐방로(9차) ───────────────────────────────────────────────────
// 행정안전부 산행안전지도 탐방로 코스(국립공원공단, 19개 공원 199) — 선은 있고 고도가 없다. docs/PLAN-hiking.md §9차
//   - 이미 있는 코스와 같은 길(서로 80% 넘게 20m 안)이면 새로 넣지 않고 그 코스에 공식 문구를 붙이고 이름을 공식 코스명으로 바꾼다
//     (GPX 의 지점·고도·노면을 잃지 않게).
//   - 아니면 새 코스(source park). 고도는 근처(30m) GPX 선 점에서 빌린다 — 덮인 길이 70% 미만이거나 1km 넘게 비면 고도 없이.
//   - 방향은 구간 처음·끝 이름이 국립공원 시설·등산 지점 이름과 맞으면 그 순서로(원천 선이 거꾸로 그려진 것이 있다 — 망월사·
//     포대·회룡코스), 못 정하면 낮은 쪽에서.
//   - 산은 같은 길인 코스의 산, 아니면 선이 가장 많이 겹치는(30% 이상) 산, 아니면 선 1km 안에 정상이 있는 산, 아니면 공원 이름의
//     100대 명산(15km 안 — 정상을 지나지 않는 계곡·탐방로). 다 없으면 뺀다(섬·바닷가 길).
//   공식 문구(이름·구간·소요시간·거리·난이도)는 공공누리 3유형(변경금지)이라 원문 그대로 둔다.
//   실측(2026-10-26): 같은 길 32 · 우리 선들로 80% 넘게 덮이나 한 코스로는 아님 117 · 덜 덮임 50.

export interface ParkCourseInfo {
  parkName: string;
  name: string;
  sections: string[];
  duration: string;
  distance: string;
  difficulty: string;
  schedule: string;
  contact: string | null;
  // 공원 안 코스 순번 — 산 상세에서 공식 코스끼리 이 순서로.
  seq: number;
  // 같은 길 GPX 코스에 붙였는데 구간 순서가 그 코스 방향과 반대(구간 끝 → 처음 = 코스 시작 → 끝).
  reversed?: boolean;
  // 새 코스의 고도 출처 — 근처 GPX 기록 · 지형 고도(SRTM). 없으면 고도 없음(같은 길 코스는 그 GPX 고도).
  elevationFrom?: 'nearby' | 'terrain';
}

const PARK_ELE_M = 30;
// 고도를 물어볼 점 간격(선을 이 간격으로 나눠 점마다 묻는다).
const PARK_ELE_STEP_M = 10;
const PARK_ELE_MIN_SHARE = 0.7;
const PARK_ELE_MAX_GAP_M = 1_000;
const PARK_SAME_SHARE = 0.8;
const PARK_SAME_M = 20;
const PARK_HOST_SHARE = 0.3;
const PARK_HOST_SUMMIT_M = 1_000;
// 공원 이름의 산(오대산국립공원 → 오대산)으로 붙일 때 그 산 정상과 코스 들머리 거리 상한.
const PARK_HOST_MAIN_M = 15_000;
// 구간 처음·끝 이름과 맞춰 볼 자리 — 선 끝에서 이 안의 것만(같은 이름 다른 곳), 양 끝 거리 차이가 이만큼은 나야 방향으로 본다.
const PARK_ORIENT_M = 2_000;
const PARK_ORIENT_MARGIN_M = 50;
// 이름으로 정한 방향의 고도 검사 — 끝 구간이 봉우리(…봉·…산·…대)인데 시작보다 이만큼 낮게 끝나면 거꾸로 본다.
const PARK_SUMMIT_SECTION = /(봉|산|대)$/;
const PARK_ORIENT_DROP_M = 100;
// 왕복 문구 판단 때 떼는 꼬리 — "백무동탐방지원세터"(원문 오타)·"만수봉 구간".
const PARK_SECTION_TAIL = /(탐방지원[센세]터|탐방안내소|공원지킴터|주차장|구간)$/;
// 새 공식 코스에 붙이는 등산 지점 — 같은 분류가 이 안에 여럿이면 하나만.
const PARK_POI_SAME_M = 30;
// 새 공식 코스 순번 — 100대 명산 GPX·합친 봉우리(100~)·망(1000~) 뒤. 산 상세는 공식 코스를 먼저 보인다(hiking.service).
const PARK_NO_BASE = 3_000;
// 공식 코스 둘레 기존 코스만 격자에 넣는다(전국 9천 코스를 다 넣지 않게) — ≈1km.
const PARK_AREA_PAD_DEG = 0.01;
// 원천 선(2m 간격) 정리.
const PARK_LINE_TOLERANCE_M = 2;

const parkReport = (rows: HikingRows): ParkBuildReport =>
  (rows.report.park ??= { courses: 0, enriched: 0, added: 0, withElevation: 0, withTerrain: 0, oriented: 0, flipped: 0, eleFixed: 0, opposite: [], unassigned: [], parks: 0, mountainsInPark: 0 });

type Box = { minLat: number; minLng: number; maxLat: number; maxLng: number };
const boxOfPoints = (pts: Iterable<LatLngPoint>, pad = 0): Box => {
  const b = { minLat: Infinity, minLng: Infinity, maxLat: -Infinity, maxLng: -Infinity };
  for (const p of pts) {
    b.minLat = Math.min(b.minLat, p.lat);
    b.maxLat = Math.max(b.maxLat, p.lat);
    b.minLng = Math.min(b.minLng, p.lng);
    b.maxLng = Math.max(b.maxLng, p.lng);
  }
  return { minLat: b.minLat - pad, minLng: b.minLng - pad, maxLat: b.maxLat + pad, maxLng: b.maxLng + pad };
};
const boxesOverlap = (a: Box, b: Box): boolean => a.minLat <= b.maxLat && a.maxLat >= b.minLat && a.minLng <= b.maxLng && a.maxLng >= b.minLng;
const inBox = (b: Box, p: LatLngPoint): boolean => p.lat >= b.minLat && p.lat <= b.maxLat && p.lng >= b.minLng && p.lng <= b.maxLng;

// 선을 stepM 안 간격으로 — 정리한 원천 선은 곧은 구간이 길게 남아 끝점만 물으면 사이가 덮였는지 모른다.
export const densifyLine = (line: readonly LatLngPoint[], stepM: number): LatLngPoint[] => {
  const out: LatLngPoint[] = line.length > 0 ? [line[0]!] : [];
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!;
    const b = line[i]!;
    const n = Math.max(1, Math.ceil(distM(a, b) / stepM));
    for (let k = 1; k <= n; k++) out.push({ lat: a.lat + ((b.lat - a.lat) * k) / n, lng: a.lng + ((b.lng - a.lng) * k) / n });
  }
  return out;
};

// 선을 PARK_ELE_STEP_M 간격으로 나눠 점마다 고도를 묻는다 — 근처 GPX 선 점(빌리기) 또는 지형 고도. 덮인 길이가 모자라면 전부
// null(고도 없는 코스).
const sampleElevations = (lines: readonly (readonly LatLngPoint[])[], eleOf: (p: LatLngPoint) => number | null): { segments: GpxPoint[][]; borrowed: boolean } => {
  let seq = 0;
  let total = 0;
  let covered = 0;
  let maxGap = 0;
  const segments = lines.map((raw) => {
    const line = densifyLine(raw, PARK_ELE_STEP_M);
    let gap = 0;
    return line.map((p, i): GpxPoint => {
      seq += 1;
      const step = i > 0 ? distM(line[i - 1]!, p) : 0;
      const ele = eleOf(p);
      total += step;
      if (ele !== null) {
        covered += step;
        gap = 0;
      } else {
        gap += step;
        maxGap = Math.max(maxGap, gap);
      }
      return { lat: p.lat, lng: p.lng, ele, seq };
    });
  });
  const borrowed = total > 0 && covered / total >= PARK_ELE_MIN_SHARE && maxGap <= PARK_ELE_MAX_GAP_M;
  return { segments: borrowed ? segments : segments.map((s) => s.map((p) => ({ ...p, ele: null }))), borrowed };
};
// 가장 가까운(PARK_ELE_M 안) GPX 선 점의 고도.
const nearbyEle =
  (pool: PointGrid<number>) =>
  (p: LatLngPoint): number | null => {
    let ele: number | null = null;
    let bestD = PARK_ELE_M;
    for (const q of pool.near(p.lat, p.lng, PARK_ELE_M)) {
      const d = distM(q, p);
      if (d <= bestD) [ele, bestD] = [q.value, d];
    }
    return ele;
  };

// 구간 처음·끝 이름 → 원천 선 방향. 'keep' 그대로 · 'flip' 뒤집기 · null 못 정함(원점회귀이거나 이름이 안 맞음).
const orientBySections = (row: ParkCourseRow, lines: readonly (readonly LatLngPoint[])[], places: ReadonlyMap<string, LatLngPoint[]>): 'keep' | 'flip' | null => {
  const start = lines[0]![0]!;
  const end = lines.at(-1)!.at(-1)!;
  if (distM(start, end) <= PARK_ORIENT_MARGIN_M * 4) return null;
  // 같은 곳에서 시작해 같은 곳으로 끝나는 왕복 문구(백무동~장터목~천왕봉~장터목~백무동)는 선이 편도로 그려져 있어도 방향이 없다.
  const base = (s: string | undefined) => compactName(s ?? '').replace(PARK_SECTION_TAIL, '');
  if (row.sections.length > 1 && base(row.sections[0]).length >= 2 && base(row.sections[0]) === base(row.sections.at(-1))) return null;
  let vote = 0;
  const judge = (name: string | undefined, sign: 1 | -1) => {
    if (!name) return;
    const spots = (places.get(compactName(name)) ?? []).filter((p) => Math.min(distM(p, start), distM(p, end)) <= PARK_ORIENT_M);
    if (spots.length === 0) return;
    const dS = Math.min(...spots.map((p) => distM(p, start)));
    const dE = Math.min(...spots.map((p) => distM(p, end)));
    if (dS + PARK_ORIENT_MARGIN_M < dE) vote += sign;
    else if (dE + PARK_ORIENT_MARGIN_M < dS) vote -= sign;
  };
  judge(row.sections[0], 1);
  if (row.sections.length > 1) judge(row.sections.at(-1), -1);
  return vote > 0 ? 'keep' : vote < 0 ? 'flip' : null;
};

const parkInfoOf = (row: ParkCourseRow): ParkCourseInfo => ({
  parkName: row.parkName,
  name: row.name,
  sections: row.sections,
  duration: row.duration,
  distance: row.distance,
  difficulty: row.difficulty,
  schedule: row.schedule,
  contact: row.contact,
  seq: row.seq,
});

// 새로 넣은 공식 코스(시설 지점 붙이기용)를 돌려준다.
const appendParkCourses = (rows: HikingRows, existing: readonly Top100Course[], input: HikingBuildInput): Top100Course[] => {
  const src = input.parkCourses ?? [];
  const rep = parkReport(rows);
  rep.courses = src.length;

  // 공식 코스 둘레 기존 코스 — 겹침 격자(값 = near 순번)·고도 점(두 점에 하나).
  const boxes = src.map((r) => boxOfPoints(r.lines.flat(), PARK_AREA_PAD_DEG));
  const near = existing.filter((t) => boxes.some((b) => boxesOverlap(t.course.bbox, b)));
  const lineGrid = new LineGrid<number>(10, 5);
  const elePool = new PointGrid<number>(PARK_ELE_M);
  near.forEach((t, i) => {
    for (const piece of t.course.pieces) {
      lineGrid.addLine(piece, i);
      piece.forEach((p, k) => {
        if (k % 2 === 0 && p.ele !== null) elePool.add(p.lat, p.lng, p.ele);
      });
    }
  });
  // 구간 이름과 맞춰 볼 이름난 자리 — 국립공원 시설 + 등산 지점.
  const places = new Map<string, LatLngPoint[]>();
  const addPlace = (name: string | null | undefined, p: LatLngPoint) => {
    const k = name ? compactName(name) : '';
    if (k.length >= 2) places.set(k, [...(places.get(k) ?? []), { lat: p.lat, lng: p.lng }]);
  };
  for (const f of input.facilities ?? []) if (f.source === 'park') addPlace(f.name, f);
  for (const p of rows.pois) addPlace(p.name, p);

  interface ParkBuilt {
    row: ParkCourseRow;
    course: BuiltCourse;
    elevationFrom: ParkCourseInfo['elevationFrom'];
    // 방향을 구간 이름으로 정했다(못 정했으면 낮은 쪽에서 — 같은 길 코스와 방향을 견줄 수 없다).
    oriented: boolean;
    hitsByCourse: Map<number, number>;
    hitsByMountain: Map<string, number>;
    total: number;
    grid: LineGrid<number>;
  }
  const built: ParkBuilt[] = [];
  for (const row of src) {
    const simplified = row.lines.map((l) => simplifyLine(l, PARK_LINE_TOLERANCE_M));
    // 고도: 근처 GPX 기록 → 모자라면 지형 고도 → 그것도 없으면 고도 없이.
    const build = (o: 'keep' | 'flip' | null) => {
      const lines = o === 'flip' ? [...simplified].reverse().map((l) => [...l].reverse()) : simplified;
      let { segments, borrowed } = sampleElevations(lines, nearbyEle(elePool));
      let elevationFrom: ParkCourseInfo['elevationFrom'] = borrowed ? 'nearby' : undefined;
      if (!borrowed && input.demAt) {
        const demAt = input.demAt;
        ({ segments, borrowed } = sampleElevations(lines, (p) => demAt(p.lat, p.lng)));
        if (borrowed) elevationFrom = 'terrain';
      }
      return { course: buildCourse({ waypoints: [], segments, surfaces: [] }, { keepDirection: o !== null }), elevationFrom };
    };
    let orient = orientBySections(row, simplified, places);
    let { course, elevationFrom } = build(orient);
    // 끝 구간이 봉우리인데 크게 내려가면 이름이 들머리 근처의 같은 이름 지점에 맞은 것 — 반대로(금수산 상천 코스).
    const last = row.sections.at(-1) ?? '';
    if (course && orient && course.hasElevation && !course.isLoop && PARK_SUMMIT_SECTION.test(last) && !/대피소$/.test(last) && course.end.ele! < course.start.ele! - PARK_ORIENT_DROP_M) {
      orient = orient === 'flip' ? 'keep' : 'flip';
      ({ course, elevationFrom } = build(orient));
      rep.eleFixed += 1;
    }
    if (!course) {
      rep.unassigned.push(`${row.parkName} ${row.name}(선 없음)`);
      continue;
    }
    if (orient) rep.oriented += 1;
    if (orient === 'flip') rep.flipped += 1;
    const hitsByCourse = new Map<number, number>();
    const hitsByMountain = new Map<string, number>();
    let total = 0;
    for (const piece of course.pieces) {
      for (let i = 0; i < piece.length; i += 3) {
        total += 1;
        const ms = new Set<string>();
        for (const v of lineGrid.valuesNear(piece[i]!.lat, piece[i]!.lng, PARK_SAME_M)) {
          hitsByCourse.set(v, (hitsByCourse.get(v) ?? 0) + 1);
          ms.add(near[v]!.mountainId);
        }
        for (const m of ms) hitsByMountain.set(m, (hitsByMountain.get(m) ?? 0) + 1);
      }
    }
    const grid = new LineGrid<number>(10, 5);
    for (const piece of course.pieces) grid.addLine(piece, 0);
    built.push({ row, course, elevationFrom, oriented: orient !== null, hitsByCourse, hitsByMountain, total, grid });
  }

  // 같은 길 — 서로 80% 넘게 겹치는 쌍을 점수(둘 중 작은 겹침) 높은 순으로 하나씩 짝짓는다.
  const pairs: { b: number; t: number; score: number }[] = [];
  built.forEach((b, bi) => {
    for (const [t, hits] of b.hitsByCourse) {
      const there = hits / b.total;
      if (there < PARK_SAME_SHARE) continue;
      const back = overlapShare(near[t]!.course.pieces, b.grid, 0, PARK_SAME_M);
      if (back >= PARK_SAME_SHARE) pairs.push({ b: bi, t, score: Math.min(there, back) });
    }
  });
  pairs.sort((x, y) => y.score - x.score);
  const sameOf = new Map<number, number>();
  const taken = new Set<number>();
  for (const p of pairs) {
    if (sameOf.has(p.b) || taken.has(p.t)) continue;
    sameOf.set(p.b, p.t);
    taken.add(p.t);
  }

  // 새 코스 지점 — 선 30m 안의 등산 지점(이정표는 이 기록의 방향을 모른다 — sameFrame null).
  const poiGrid = new PointGrid<PoiLite>(50);
  for (const p of rows.pois) {
    poiGrid.add(p.lat, p.lng, {
      id: p.id,
      mountainId: p.mountainId,
      category: p.category,
      name: p.name ?? null,
      lat: p.lat,
      lng: p.lng,
      ele: p.ele ?? null,
      signposts: p.signposts ? (JSON.parse(p.signposts) as GpxSignpost[]) : [],
      source: p.source,
    });
  }
  // 같은 분류가 PARK_POI_SAME_M 안에 여럿이면 하나만 — 100대 명산 GPX 여러 기록이 같은 갈림길을 따로 찍어 북한산 백운대코스에
  // 갈림길이 23개 붙었다. 이정표가 많은 것·이름 있는 것·선에 가까운 것 먼저.
  const linksNear = (course: BuiltCourse): { poi: PoiLite; atM: number }[] => {
    const cand = new Map<string, PoiLite>();
    for (const piece of course.pieces) for (let i = 0; i < piece.length; i += 2) for (const { value } of poiGrid.near(piece[i]!.lat, piece[i]!.lng, PEAK_LINK_M + 20)) cand.set(value.id, value);
    const ranked = [...cand.values()]
      .map((poi) => ({ poi, pr: projectOnCourse(course, poi) }))
      .filter(({ pr }) => pr.offM <= PEAK_LINK_M)
      .sort((a, b) => b.poi.signposts.length - a.poi.signposts.length || Number(!!b.poi.name) - Number(!!a.poi.name) || a.pr.offM - b.pr.offM);
    const out: { poi: PoiLite; atM: number }[] = [];
    for (const { poi, pr } of ranked) {
      const sameM = poi.category === 'PEAK' ? PEAK_SAME_ON_COURSE_M : PARK_POI_SAME_M;
      if (out.some((o) => o.poi.category === poi.category && distM(o.poi, poi) <= sameM)) continue;
      out.push({ poi, atM: pr.atM });
    }
    return out.sort((a, b) => a.atM - b.atM);
  };

  const mountainById = new Map(rows.mountains.map((m) => [m.id, m]));
  const courseRowById = new Map(rows.courses.map((c) => [c.id, c]));
  const added: Top100Course[] = [];
  built.forEach((b, bi) => {
    const info = parkInfoOf(b.row);
    const same = sameOf.get(bi);
    const sameRow = same !== undefined ? courseRowById.get(near[same]!.id) : undefined;
    if (sameRow && same !== undefined) {
      // 공식 구간 순서가 이 코스와 반대 — 문구는 그대로 두고(변경금지) 화면이 반대 방향이라고 알린다.
      const gpx = near[same]!.course;
      const reversed = b.oriented && !gpx.isLoop && distM(b.course.start, gpx.end) < distM(b.course.start, gpx.start);
      if (reversed) rep.opposite.push(`${b.row.parkName} ${b.row.name} → ${near[same]!.id}`);
      sameRow.park = JSON.stringify(reversed ? { ...info, reversed } : info);
      sameRow.name = b.row.name;
      sameRow.nameSource = 'points';
      rep.enriched += 1;
      return;
    }
    let host: string | null = null;
    let bestShare = PARK_HOST_SHARE;
    for (const [m, hits] of b.hitsByMountain) {
      const share = hits / b.total;
      if (share >= bestShare) [host, bestShare] = [m, share];
    }
    if (!host) {
      const { minLat, minLng, maxLat, maxLng } = b.course.bbox;
      const box = { minLat: minLat - PARK_AREA_PAD_DEG, minLng: minLng - PARK_AREA_PAD_DEG, maxLat: maxLat + PARK_AREA_PAD_DEG, maxLng: maxLng + PARK_AREA_PAD_DEG };
      let bestOff = PARK_HOST_SUMMIT_M;
      for (const m of rows.mountains) {
        if (m.summitLat == null || m.summitLng == null) continue;
        const s = { lat: m.summitLat, lng: m.summitLng };
        if (!inBox(box, s)) continue;
        const off = projectOnCourse(b.course, s).offM;
        if (off <= bestOff) [host, bestOff] = [m.id, off];
      }
    }
    // 정상을 지나지 않는 길(선재길·불일폭포·권금성) — 공원 이름의 100대 명산(오대산국립공원 → 오대산)이 가까우면 그 산.
    if (!host) {
      const base = b.row.parkName.replace(/국립공원$/, '');
      const main = rows.mountains.find(
        (m) => (m.kind ?? 'top100') === 'top100' && baseName(m.name) === base && m.summitLat != null && m.summitLng != null && distM({ lat: m.summitLat, lng: m.summitLng }, b.course.start) <= PARK_HOST_MAIN_M,
      );
      if (main) host = main.id;
    }
    const m = host ? mountainById.get(host) : undefined;
    if (!host || !m) {
      rep.unassigned.push(`${b.row.parkName} ${b.row.name}`);
      return;
    }

    // id 는 다른 코스처럼 `<산 id>-<번호>`(라우트 검사 — 번호 4자리 안). 공원 안 순번이 겹치면(두 공원 코스가 한 산에) 다음 번호.
    let no = PARK_NO_BASE + b.row.seq;
    while (courseRowById.has(`${host}-${no}`)) no += 1;
    const id = `${host}-${no}`;
    const links = linksNear(b.course);
    const mountainName = m.kind === 'peak' ? (m.summitName ?? m.name) : baseName(m.name);
    const auto = nameCourse(
      b.course,
      links.map(({ poi }) => ({ category: poi.category, name: poi.name, lat: poi.lat, lng: poi.lng, ele: poi.ele })),
      mountainName,
      no,
    );
    const first = b.row.sections[0] ?? null;
    const last = b.row.sections.at(-1) ?? null;
    const names: CourseNames = {
      name: b.row.name,
      source: 'points',
      startName: first ?? auto.startName,
      endName: b.course.isLoop ? (first ?? auto.startName) : (last ?? auto.endName),
      peakName: auto.peakName,
    };
    const sigungu = input.sigungu ? courseSigungu(b.course, input.sigungu) : null;
    const row = courseRow({ id, mountainId: host, no, names, course: b.course, sigungu, source: 'park', park: b.elevationFrom ? { ...info, elevationFrom: b.elevationFrom } : info });
    rows.courses.push(row);
    courseRowById.set(id, row);
    rows.report.courses += 1;
    if (b.course.isLoop) rows.report.loops += 1;
    if (!b.course.hasElevation) rows.report.noElevation += 1;
    rep.added += 1;
    if (b.elevationFrom === 'nearby') rep.withElevation += 1;
    if (b.elevationFrom === 'terrain') rep.withTerrain += 1;

    m.minLat = Math.min(m.minLat, b.course.bbox.minLat);
    m.minLng = Math.min(m.minLng, b.course.bbox.minLng);
    m.maxLat = Math.max(m.maxLat, b.course.bbox.maxLat);
    m.maxLng = Math.max(m.maxLng, b.course.bbox.maxLng);
    m.courseCount += 1;
    m.minLengthM = Math.min(m.minLengthM ?? Infinity, b.course.lengthM);
    m.maxLengthM = Math.max(m.maxLengthM ?? 0, b.course.lengthM);

    const named = links.filter((k) => k.poi.name && !isGenericPlaceName(cleanPlaceName(k.poi.name))).map((k) => ({ name: k.poi.name!, atM: k.atM }));
    for (const k of links) {
      const guide =
        k.poi.signposts.length > 0
          ? guideSignposts({ signposts: k.poi.signposts, atM: k.atM, named, mountainName, topAtM: b.course.top?.atM ?? null, sameFrame: null, turnDeg: turnAt(b.course, k.atM) })
          : [];
      rows.coursePois.push({ courseId: id, poiId: k.poi.id, atM: k.atM, guide: guide.length > 0 ? JSON.stringify(guide) : null });
    }
    added.push({ id, mountainId: host, course: b.course });
  });
  return added;
};

// ── 국립공원 경계(9차) ──────────────────────────────────────────────────────────
// 다각형 고리를 30m 로 줄여 encoded polyline 으로(지도 면 칠). 정상이 공원 안인 산에 parkId — 정상은 밖이지만 공식 코스가 붙은 산은
// 그 코스의 공원으로.
const PARK_RING_TOLERANCE_M = 30;

// 짝홀 규칙(평면 근사) — 다각형 하나의 고리들(바깥·구멍) 중 몇 개 안에 있는지.
const inRing = (ring: readonly LatLngPoint[], p: LatLngPoint): boolean => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    if (a.lat > p.lat !== b.lat > p.lat && p.lng < ((b.lng - a.lng) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lng) inside = !inside;
  }
  return inside;
};
export const inParkPolygons = (polygons: readonly (readonly (readonly LatLngPoint[])[])[], p: LatLngPoint): boolean =>
  polygons.some((poly) => poly.filter((ring) => inRing(ring, p)).length % 2 === 1);

const appendParkAreas = (rows: HikingRows, parks: readonly ParkBoundaryRow[], loadedAt: Date): void => {
  const rep = parkReport(rows);
  rep.parks = parks.length;
  const boxes = parks.map((p) => boxOfPoints(p.polygons.flat(2)));
  parks.forEach((p, i) => {
    rows.parks.push({
      id: p.id,
      name: p.name,
      nameEn: p.nameEn,
      designatedYear: p.designatedYear,
      ...boxes[i]!,
      polygons: JSON.stringify(p.polygons.map((poly) => poly.map((ring) => encodePolyline(simplifyLine(ring, PARK_RING_TOLERANCE_M))))),
      loadedAt,
    });
  });
  const parkIdByName = new Map(parks.map((p) => [p.name, p.id]));
  const courseParkOf = new Map<string, string>();
  for (const c of rows.courses) {
    if (!c.park || courseParkOf.has(c.mountainId)) continue;
    const id = parkIdByName.get((JSON.parse(c.park) as ParkCourseInfo).parkName);
    if (id) courseParkOf.set(c.mountainId, id);
  }
  for (const m of rows.mountains) {
    const s = m.summitLat != null && m.summitLng != null ? { lat: m.summitLat, lng: m.summitLng } : null;
    const i = s ? parks.findIndex((park, k) => inBox(boxes[k]!, s) && inParkPolygons(park.polygons, s)) : -1;
    m.parkId = i >= 0 ? parks[i]!.id : (courseParkOf.get(m.id) ?? null);
    if (m.parkId) rep.mountainsInPark += 1;
  }
};

// ── 코스 근처 시설(7차·9차) ─────────────────────────────────────────────────────
// 일상지도 공중화장실(코스 선 50m 안)·공영 주차장(들머리·날머리 150m 안)을 코스 지점으로 — 지점이 없는 봉우리 코스에도 화장실·
// 주차가 보이게. 9차 국립공원 대피소(선 50m)·탐방지원센터·안내소(들머리·날머리 300m — 센터 앞 주차장에서 시작하는 기록이 많다)도.
// 같은 종류 지점이 이미 50m 안에 붙어 있으면(GPX 화장실·주차장·대피소) 건너뛴다. 코스마다 종류별 상한(가까운 순).
const FACILITY_RULES: Record<HikingFacility['category'], { prefix: string; lineM: number | null; endM: number | null; cap: number }> = {
  TOILET: { prefix: 'toilet', lineM: 50, endM: null, cap: 4 },
  PARK: { prefix: 'lot', lineM: null, endM: 150, cap: 2 },
  SHELTER: { prefix: 'knps', lineM: 50, endM: null, cap: 4 },
  ENTRY: { prefix: 'knps', lineM: null, endM: 300, cap: 2 },
};
const FACILITY_LINE_MAX_M = Math.max(...Object.values(FACILITY_RULES).map((r) => r.lineM ?? 0));
const FACILITY_END_MAX_M = Math.max(...Object.values(FACILITY_RULES).map((r) => r.endM ?? 0));
const FACILITY_SAME_M = 50;

const appendFacilities = (rows: HikingRows, courses: readonly Top100Course[], facilities: readonly HikingFacility[]): void => {
  const rep = { toilets: 0, lots: 0, centers: 0, shelters: 0, links: 0 };
  rows.report.facilities = rep;
  const grid = new PointGrid<HikingFacility>(100);
  for (const f of facilities) grid.add(f.lat, f.lng, f);
  const poiById = new Map(rows.pois.map((p) => [p.id, p]));
  const linked = new Map<string, Set<string>>();
  for (const cp of rows.coursePois) {
    const set = linked.get(cp.courseId);
    if (set) set.add(cp.poiId);
    else linked.set(cp.courseId, new Set([cp.poiId]));
  }
  for (const { id, mountainId, course } of courses) {
    const have = [...(linked.get(id) ?? [])].map((pid) => poiById.get(pid)).filter((p): p is NonNullable<typeof p> => !!p);
    // 원천 표가 달라 id 가 겹칠 수 있다 — 종류를 붙여 센다.
    const found = new Map<string, { f: HikingFacility; atM: number; offM: number }>();
    // 선 가까이(화장실·대피소) — 선 위 점마다 근처를 모아 정확히 다시 잰다.
    for (const piece of course.pieces) {
      for (let i = 0; i < piece.length; i += 2) {
        for (const { value: f } of grid.near(piece[i]!.lat, piece[i]!.lng, FACILITY_LINE_MAX_M + 50)) {
          const lineM = FACILITY_RULES[f.category].lineM;
          const k = `${f.category}:${f.id}`;
          if (lineM === null || found.has(k)) continue;
          const pr = projectOnCourse(course, f);
          if (pr.offM <= lineM) found.set(k, { f, atM: pr.atM, offM: pr.offM });
        }
      }
    }
    // 들머리·날머리 근처(주차장·탐방지원센터) — 코스가 도심 공원을 지나며 길가 주차장을 줍지 않게.
    for (const end of course.isLoop ? [course.start] : [course.start, course.end]) {
      for (const { value: f } of grid.near(end.lat, end.lng, FACILITY_END_MAX_M)) {
        const endM = FACILITY_RULES[f.category].endM;
        const k = `${f.category}:${f.id}`;
        if (endM === null || found.has(k)) continue;
        const d = distM(f, end);
        if (d <= endM) found.set(k, { f, atM: end === course.start ? 0 : course.lengthM, offM: d });
      }
    }
    for (const category of Object.keys(FACILITY_RULES) as HikingFacility['category'][]) {
      const rule = FACILITY_RULES[category];
      const picks = [...found.values()].filter((x) => x.f.category === category).sort((a, b) => a.offM - b.offM);
      let n = 0;
      for (const { f, atM } of picks) {
        if (n >= rule.cap) break;
        if (have.some((p) => p.category === category && distM(p, f) <= FACILITY_SAME_M)) continue;
        const poiId = `${rule.prefix}:${f.id}`;
        if (!poiById.has(poiId)) {
          const row: Prisma.HikingPoiCreateManyInput = {
            id: poiId,
            mountainId,
            category,
            name: f.name,
            description: f.detail,
            lat: f.lat,
            lng: f.lng,
            ele: f.ele ?? null,
            signposts: null,
            source: f.source ?? 'facility',
          };
          rows.pois.push(row);
          poiById.set(poiId, row);
          if (category === 'TOILET') rep.toilets += 1;
          else if (category === 'PARK') rep.lots += 1;
          else if (category === 'ENTRY') rep.centers += 1;
          else rep.shelters += 1;
        }
        const row = poiById.get(poiId)!;
        have.push(row);
        rows.coursePois.push({ courseId: id, poiId, atM: Math.round(atM), guide: null });
        rep.links += 1;
        n += 1;
      }
    }
  }
};

// ── 쓰기 ───────────────────────────────────────────────────────────────────────

const CREATE_CHUNK = 300;
// 전국 봉우리까지 넣으면 코스 4천·지점 연결 5만 남짓 — 넉넉히.
const REPLACE_TX_TIMEOUT_MS = 300_000;

// 전량 교체 — 한 트랜잭션 안에서 비우고 청크로 넣고 적재 이력까지(중간 상태 노출 없음).
export const replaceHiking = async (prisma: PrismaClient, rows: HikingRows): Promise<void> => {
  const chunks = <T>(xs: T[]): T[][] => Array.from({ length: Math.ceil(xs.length / CREATE_CHUNK) }, (_, i) => xs.slice(i * CREATE_CHUNK, (i + 1) * CREATE_CHUNK));
  await prisma.$transaction(
    async (tx) => {
      await tx.hikingCoursePoi.deleteMany({});
      await tx.hikingCourse.deleteMany({});
      await tx.hikingPoi.deleteMany({});
      await tx.hikingMountain.deleteMany({});
      await tx.hikingPark.deleteMany({});
      for (const c of chunks(rows.parks)) await tx.hikingPark.createMany({ data: c });
      for (const c of chunks(rows.mountains)) await tx.hikingMountain.createMany({ data: c });
      for (const c of chunks(rows.courses)) await tx.hikingCourse.createMany({ data: c });
      for (const c of chunks(rows.pois)) await tx.hikingPoi.createMany({ data: c });
      for (const c of chunks(rows.coursePois)) await tx.hikingCoursePoi.createMany({ data: c });
      const images = rows.mountains.reduce((s, m) => s + (JSON.parse(m.images ?? '[]') as number[]).length, 0);
      await tx.hikingSync.create({
        data: {
          mountains: rows.mountains.length,
          courses: rows.courses.length,
          pois: rows.pois.length,
          images,
          detail: JSON.stringify(rows.report),
        },
      });
    },
    { timeout: REPLACE_TX_TIMEOUT_MS, maxWait: 60_000 },
  );
};

// 사진 파일 경로 — 적재 스크립트가 쓰고 라우트가 읽는다. 실행 위치(apps/friendly) 기준 data/ 아래(.gitignore).
export const HIKING_IMAGE_DIR = 'data/hiking-images';
export const hikingImageFileName = (mountainId: string, no: number): string => `${mountainId}_${no}.jpg`;
