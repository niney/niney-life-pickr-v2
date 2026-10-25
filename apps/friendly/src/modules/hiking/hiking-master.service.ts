// 등산 마스터 적재 — GPX zip(코스) + 명산등산로(산) + 등산트레킹 POI(지점) + 산 사진 순번 → 행 만들기·전량 교체.
// 네트워크는 스크립트(load:hiking)가 하고, 여기는 순수 조립(buildHikingRows)과 DB 쓰기(replaceHiking)만.
// docs/PLAN-hiking.md

import type { Prisma, PrismaClient } from '@prisma/client';
import { encodePolyline, hikingRegionsOf } from '@repo/utils';
import { listZipEntries } from '../housing/housing-price-master.service.js';
import { readZipEntryBuffer } from '../life-map/life-flood-master.service.js';
import type { GdTrailRow, TrekkingPoiRow } from './hiking-api.adapter.js';
import {
  COURSE_POI_M,
  LINE_TOLERANCE_M,
  buildCourse,
  distM,
  nameCourse,
  parseGpx,
  projectOnCourse,
  simplifyLine,
  type GpxWaypoint,
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
  loadedAt: Date;
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
}

export interface HikingRows {
  mountains: Prisma.HikingMountainCreateManyInput[];
  courses: Prisma.HikingCourseCreateManyInput[];
  pois: Prisma.HikingPoiCreateManyInput[];
  coursePois: Prisma.HikingCoursePoiCreateManyInput[];
  report: HikingBuildReport;
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
      const names = nameCourse(course, parsed.waypoints, mountainName, file.no);
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
      courses.push({
        id,
        mountainId: gd.id,
        no: file.no,
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
        pieceCount: course.pieces.length,
        gapCount: course.gaps.length,
        gapM: course.gaps.reduce((s, g) => s + g, 0),
        ...course.bbox,
        pieces: JSON.stringify(course.pieces.map((p) => encodePolyline(simplifyLine(p, LINE_TOLERANCE_M)))),
        profile: JSON.stringify(course.profile),
        surfaces: JSON.stringify(course.surfaces),
      });
      // 코스 지점 — 이 GPX 의 지점(선에서 COURSE_POI_M 안) + API 에만 있는 지점(API_POI_LINK_M 안).
      const linked = new Set<string>();
      const link = (poiId: string, p: { lat: number; lng: number }, maxOff: number) => {
        if (linked.has(poiId)) return;
        const pr = projectOnCourse(course, p);
        if (pr.offM > maxOff) return;
        linked.add(poiId);
        coursePois.push({ courseId: id, poiId, atM: pr.atM });
      };
      for (const w of parsed.waypoints) link(gpxIdOf(w.sym), w, COURSE_POI_M);
      for (const a of apiOnly) link(a.id, a, API_POI_LINK_M);
      report.coursePoiLinks += linked.size;
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
  return { mountains, courses, pois, coursePois: kept, report };
};

// ── 쓰기 ───────────────────────────────────────────────────────────────────────

const CREATE_CHUNK = 300;
const REPLACE_TX_TIMEOUT_MS = 120_000;

// 전량 교체 — 한 트랜잭션 안에서 비우고 청크로 넣고 적재 이력까지(중간 상태 노출 없음).
export const replaceHiking = async (prisma: PrismaClient, rows: HikingRows): Promise<void> => {
  const chunks = <T>(xs: T[]): T[][] => Array.from({ length: Math.ceil(xs.length / CREATE_CHUNK) }, (_, i) => xs.slice(i * CREATE_CHUNK, (i + 1) * CREATE_CHUNK));
  await prisma.$transaction(
    async (tx) => {
      await tx.hikingCoursePoi.deleteMany({});
      await tx.hikingCourse.deleteMany({});
      await tx.hikingPoi.deleteMany({});
      await tx.hikingMountain.deleteMany({});
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
