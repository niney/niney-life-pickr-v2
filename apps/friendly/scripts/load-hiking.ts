// 등산(/hiking) 적재. 원천: 한국등산트레킹지원센터 100대명산 GPX zip(data.go.kr 15098177, 코스 607개)
// + 산림청 명산등산로(15158915, 1콜) + 한국등산트레킹지원센터 봉우리·갈림길·교통 POI(B553662, 합 ~10콜) + 산림청 산정보
// 사진(15058662, 산마다 1콜 + 사진 최대 3장). 5차부터 한국등산트레킹지원센터 전국 주요 봉우리 코스 zip(15108086, 봉우리 4,492)
// + 산정보 전체(5콜, 봉우리 소개·높이·소재지) + 들머리 이름(DB 의 지하철역·버스 정류장·공영 주차장, 없으면 브이월드 역지오코딩
// 리·동 — data/hiking-geocode-cache.json 에 영구 캐시). 키는 DATA_GO_KR_API_KEY·VWORLD_API_KEY. 사진은 긴 변 960px JPEG 로 줄여
// data/hiking-images/<산 id>_<순번>.jpg 에 둔다(있으면 다시 받지 않음). → Hiking* 전량 교체.
// docs/PLAN-hiking.md · 원본 보관은 docs/data-sources.md
//
// 실행: pnpm --filter friendly load:hiking [zip] [옵션]
//   zip               100대명산 zip(기본 <리포>/data/open/hiking/ 에서 이름에 '100대명산'이 든 .zip).
//   --peaks=<zip>     전국 주요 봉우리 zip(기본 같은 폴더에서 이름에 '봉우리'가 든 .zip — 없으면 100대 명산만).
//   --no-images       사진 API·다운로드를 건너뛴다(이미 받아 둔 파일은 그대로 쓴다).
//   --refresh-images  받아 둔 사진도 다시 받는다.
//   --peak-images=<n> 이번에 사진을 찾아볼 봉우리 수(기본 400 — 산정보 사진 API 일 한도를 나눠 쓴다. 찾아본 곳은 기록해 다시 안 본다).
//   --no-geocode      들머리 리·동 역지오코딩을 건너뛴다(캐시에 있는 것만 쓴다).
//   --dry-run         조립 리포트만(DB 쓰기 없음, 사진·역지오코딩은 한다 — 막으려면 --no-images --no-geocode 같이).
//   --geo=<경로>      시군구 경계 GeoJSON(기본 apps/web/public/sigungu-geo.json) — 코스가 걸친 시군구(산불위험예보·대기 예보 권역).

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import sharp from 'sharp';
import {
  HikingApiError,
  TREKKING_POI_KINDS,
  VworldAddressError,
  downloadForestImage,
  fetchAllMountainInfos,
  fetchGdTrails,
  fetchMountainImages,
  fetchMountainInfos,
  fetchTrekkingPois,
  pickMountainInfo,
  reverseGeocodeVillage,
  type MountainInfoRow,
  type TrekkingPoiKind,
  type TrekkingPoiRow,
} from '../src/modules/hiking/hiking-api.adapter.js';
import { parseSigunguGeo } from '../src/modules/hiking/hiking-area.js';
import { PointGrid } from '../src/modules/hiking/hiking-grid.js';
import {
  HIKING_IMAGE_DIR,
  buildHikingRows,
  hikingImageFileName,
  peakCourseEnds,
  readHikingZip,
  readPeakZip,
  replaceHiking,
  villageKey,
  type HikingFacility,
  type PeakPlace,
  type PreparedPeak,
} from '../src/modules/hiking/hiking-master.service.js';

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '../../../..');
const DEFAULT_DIR = resolve(REPO_ROOT, 'data/open/hiking');
const DEFAULT_GEO = resolve(REPO_ROOT, 'apps/web/public/sigungu-geo.json');
const args = process.argv.slice(2);
const GEO_PATH = resolve(args.find((a) => a.startsWith('--geo='))?.slice('--geo='.length) ?? DEFAULT_GEO);
const flag = (name: string): boolean => args.includes(`--${name}`);
const opt = (name: string): string | null => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;
const DRY_RUN = flag('dry-run');
const NO_IMAGES = flag('no-images');
const REFRESH_IMAGES = flag('refresh-images');
const NO_GEOCODE = flag('no-geocode');
const PEAK_IMAGE_BUDGET = Number(opt('peak-images') ?? 400);
const MAX_IMAGES = 3;
// 봉우리는 사진 한 장(2천 곳 남짓 — 처음 적재가 너무 길어지지 않게).
const MAX_PEAK_IMAGES = 1;
// 들머리 이름 후보 반경(hiking-master PLACE_NAME_M 과 같음).
const PLACE_M = 300;
const GEOCODE_FAIL_STREAK = 20;
const GEOCODE_CACHE = 'data/hiking-geocode-cache.json';
const PEAK_IMAGE_CHECKED = 'peak-checked.json';
const IMAGE_LONG_EDGE = 960;
const IMAGE_GAP_MS = 150;

const prisma = new PrismaClient();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const dirZips = (): string[] =>
  existsSync(DEFAULT_DIR) ? readdirSync(DEFAULT_DIR).filter((f) => f.toLowerCase().endsWith('.zip')) : [];

// 100대명산 zip — 인자, 아니면 폴더에서 이름에 '100대명산'이 든 것(예전처럼 zip 이 하나뿐이면 그것).
const findZip = (): string => {
  const arg = args.find((a) => !a.startsWith('--'));
  if (arg) return resolve(arg);
  if (!existsSync(DEFAULT_DIR)) throw new Error(`${DEFAULT_DIR} 가 없습니다 — data.go.kr 15098177 zip 을 넣어 주세요.`);
  const zips = dirZips();
  const named = zips.filter((f) => f.normalize('NFC').includes('100대명산'));
  const pick = named.length === 1 ? named[0] : zips.length === 1 ? zips[0] : undefined;
  if (!pick) throw new Error(`${DEFAULT_DIR} 에서 100대명산 zip 을 하나로 고르지 못했습니다(.zip ${zips.length}개) — 경로를 인자로 주세요.`);
  return resolve(DEFAULT_DIR, pick);
};

// 전국 주요 봉우리 zip — --peaks=, 아니면 폴더에서 이름에 '봉우리'가 든 것. 없으면 null(100대 명산만 적재).
const findPeakZip = (): string | null => {
  const arg = opt('peaks');
  if (arg) return resolve(arg);
  const named = dirZips().filter((f) => f.normalize('NFC').includes('봉우리'));
  return named.length === 1 ? resolve(DEFAULT_DIR, named[0]!) : null;
};

// 들머리 이름 후보 — 지하철역·버스 정류장(수도권)·공영 주차장(노상 빼고) 중 봉우리 코스 끝 300m 안만.
const loadPlaces = async (ends: readonly { lat: number; lng: number }[]): Promise<PeakPlace[]> => {
  const grid = new PointGrid<true>(PLACE_M);
  for (const e of ends) grid.add(e.lat, e.lng, true);
  const near = (p: { lat: number; lng: number }) => grid.near(p.lat, p.lng, PLACE_M).length > 0;
  const out: PeakPlace[] = [];
  for (const s of await prisma.subwayStation.findMany({ select: { name: true, lat: true, lng: true } })) {
    if (near(s)) out.push({ category: 'TRANS', name: s.name.endsWith('역') ? s.name : `${s.name}역`, lat: s.lat, lng: s.lng });
  }
  for (const s of await prisma.busStation.findMany({ select: { name: true, lat: true, lng: true } })) {
    if (near(s)) out.push({ category: 'TRANS', name: s.name, lat: s.lat, lng: s.lng });
  }
  // 노상(길가) 주차장은 "별내면 노상제5"처럼 이름이 자리 이름이 아니라 뺀다.
  const lots = await prisma.parkingLot.findMany({
    // lotType 이 빈 행(모름)은 둔다 — SQL 에서 NULL 은 '같지 않음'에도 안 걸리므로 따로.
    where: { ownership: 'public', lat: { not: null }, lng: { not: null }, OR: [{ lotType: null }, { lotType: { not: 'street' } }] },
    select: { name: true, lat: true, lng: true },
  });
  for (const l of lots) {
    const p = { lat: l.lat!, lng: l.lng! };
    if (near(p)) out.push({ category: 'PARK', name: l.name, ...p });
  }
  return out;
};

// 7차 — 코스 지점으로 붙일 시설: 일상지도 공중화장실(좌표 있는 것)·공영 주차장(노상 빼고). 거르기는 조립(hiking-master)이 한다.
const loadFacilities = async (): Promise<HikingFacility[]> => {
  const toilets = await prisma.lifeToilet.findMany({
    where: { lat: { not: null }, lng: { not: null } },
    select: { id: true, name: true, kind: true, open24: true, lat: true, lng: true },
  });
  const lots = await prisma.parkingLot.findMany({
    where: { ownership: 'public', lat: { not: null }, lng: { not: null }, OR: [{ lotType: null }, { lotType: { not: 'street' } }] },
    select: { id: true, name: true, feeType: true, lat: true, lng: true },
  });
  return [
    ...toilets.map((t): HikingFacility => ({ id: t.id, category: 'TOILET', name: t.name, detail: [t.kind, t.open24 ? '24시간' : null].filter(Boolean).join(' · '), lat: t.lat!, lng: t.lng! })),
    ...lots.map((l): HikingFacility => ({ id: l.id, category: 'PARK', name: l.name, detail: l.feeType === 'free' ? '공영 · 무료' : '공영', lat: l.lat!, lng: l.lng! })),
  ];
};

// 들머리 리·동 — 300m 안에 역·정류장·주차장이 없는 끝만 역지오코딩(캐시 영구, 못 찾은 곳은 '' 로 기록).
const collectVillages = async (ends: readonly { lat: number; lng: number }[], places: readonly PeakPlace[]): Promise<Map<string, string>> => {
  const cachePath = resolve(process.cwd(), GEOCODE_CACHE);
  const cache: Record<string, string> = existsSync(cachePath) ? (JSON.parse(readFileSync(cachePath, 'utf8')) as Record<string, string>) : {};
  const placeGrid = new PointGrid<true>(PLACE_M);
  for (const p of places) placeGrid.add(p.lat, p.lng, true);
  const todo = new Map<string, { lat: number; lng: number }>();
  for (const e of ends) {
    const k = villageKey(e);
    if (k in cache || todo.has(k) || placeGrid.near(e.lat, e.lng, PLACE_M).length > 0) continue;
    todo.set(k, e);
  }
  const key = process.env.VWORLD_API_KEY ?? '';
  if (NO_GEOCODE || !key) {
    if (todo.size > 0) console.log(`들머리 리·동: 역지오코딩 건너뜀(${NO_GEOCODE ? '--no-geocode' : 'VWORLD_API_KEY 없음'}) — 캐시 밖 ${todo.size}곳은 이름 없이`);
  } else if (todo.size > 0) {
    // 차례로 보낸다(동시에 여럿 보내면 브이월드가 끊는다). 한 점이 끝내 안 되면 건너뛰고, 연속으로 GEOCODE_FAIL_STREAK 번이면
    // 업스트림 장애로 보고 멈춘다(캐시에 없는 점은 다음 실행에서 잇는다).
    let stopped: string | null = null;
    let done = 0;
    let skipped = 0;
    let streak = 0;
    for (const [k, p] of todo) {
      if (stopped) break;
      try {
        cache[k] = (await reverseGeocodeVillage(p, key)) ?? '';
        streak = 0;
      } catch (e) {
        if (e instanceof VworldAddressError) stopped = e.message;
        else {
          skipped += 1;
          streak += 1;
          if (streak >= GEOCODE_FAIL_STREAK) stopped = `연속 ${streak}번 실패 — ${e instanceof Error ? e.message : String(e)}`;
        }
      }
      done += 1;
      if (done % 500 === 0) {
        console.log(`  역지오코딩 ${done}/${todo.size}`);
        writeFileSync(cachePath, JSON.stringify(cache));
      }
    }
    mkdirSync(resolve(cachePath, '..'), { recursive: true });
    writeFileSync(cachePath, JSON.stringify(cache));
    console.log(`들머리 리·동: 새로 ${done - skipped}곳, 건너뜀 ${skipped}${stopped ? ` — 중단(${stopped}), 다음 실행에서 잇는다` : ''}`);
  }
  return new Map(Object.entries(cache).filter(([, v]) => v.length > 0));
};

// 따로 산이 된 봉우리 사진 — 산정보 id 로 찾아 봉우리 id 이름으로 저장. 한 번 찾아본 곳(사진 없음 포함)은 기록해 다시 안 본다.
const collectPeakImages = async (peakInfoIds: ReadonlyMap<string, string>, serviceKey: string): Promise<Map<string, number[]>> => {
  const dir = resolve(process.cwd(), HIKING_IMAGE_DIR);
  mkdirSync(dir, { recursive: true });
  const checkedPath = resolve(dir, PEAK_IMAGE_CHECKED);
  const checked = new Set<string>(existsSync(checkedPath) ? (JSON.parse(readFileSync(checkedPath, 'utf8')) as string[]) : []);
  const out = new Map<string, number[]>();
  let budget = NO_IMAGES ? 0 : PEAK_IMAGE_BUDGET;
  let downloaded = 0;
  let stopped: string | null = null;
  for (const [id, infoId] of peakInfoIds) {
    const saved = savedImageNos(dir, id);
    if (saved.length > 0 || checked.has(id) || budget <= 0 || stopped) {
      out.set(id, saved);
      continue;
    }
    budget -= 1;
    try {
      const nos: number[] = [];
      for (const img of (await fetchMountainImages(infoId, { serviceKey })).slice(0, MAX_PEAK_IMAGES)) {
        try {
          const raw = await downloadForestImage(img.file);
          const jpg = await sharp(raw).rotate().resize({ width: IMAGE_LONG_EDGE, height: IMAGE_LONG_EDGE, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80, mozjpeg: true }).toBuffer();
          writeFileSync(resolve(dir, hikingImageFileName(id, img.no)), jpg);
          nos.push(img.no);
          downloaded += 1;
        } catch {
          // 서버에 파일이 없는 사진(HTML 이 온다) — 건너뛴다.
        }
        await sleep(IMAGE_GAP_MS);
      }
      checked.add(id);
      out.set(id, nos);
    } catch (e) {
      // 일 한도·키 오류면 이번 실행은 멈추고 다음에 잇는다.
      stopped = e instanceof Error ? e.message : String(e);
      out.set(id, []);
    }
  }
  writeFileSync(checkedPath, JSON.stringify([...checked]));
  const left = [...peakInfoIds.keys()].filter((id) => !checked.has(id) && (out.get(id) ?? []).length === 0).length;
  console.log(`봉우리 사진: 새로 ${downloaded}장, 사진 있는 봉우리 ${[...out.values()].filter((v) => v.length > 0).length}/${peakInfoIds.size}, 아직 안 본 곳 ${left}${stopped ? ` — 중단(${stopped})` : ''}`);
  return out;
};

// 받아 둔 사진 순번(<id>_<no>.jpg).
const savedImageNos = (dir: string, id: string): number[] =>
  existsSync(dir)
    ? readdirSync(dir)
        .map((f) => new RegExp(`^${id}_(\\d+)\\.jpg$`).exec(f)?.[1])
        .filter((x): x is string => x !== undefined)
        .map(Number)
        .sort((a, b) => a - b)
    : [];

const collectImages = async (ids: string[], serviceKey: string): Promise<Map<string, number[]>> => {
  const dir = resolve(process.cwd(), HIKING_IMAGE_DIR);
  mkdirSync(dir, { recursive: true });
  const out = new Map<string, number[]>();
  let downloaded = 0;
  let failed = 0;
  for (const id of ids) {
    const saved = savedImageNos(dir, id);
    if (NO_IMAGES || (!REFRESH_IMAGES && saved.length > 0)) {
      out.set(id, saved);
      continue;
    }
    try {
      const list = (await fetchMountainImages(id, { serviceKey })).slice(0, MAX_IMAGES);
      const nos: number[] = [];
      for (const img of list) {
        try {
          const raw = await downloadForestImage(img.file);
          const jpg = await sharp(raw).rotate().resize({ width: IMAGE_LONG_EDGE, height: IMAGE_LONG_EDGE, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80, mozjpeg: true }).toBuffer();
          writeFileSync(resolve(dir, hikingImageFileName(id, img.no)), jpg);
          nos.push(img.no);
          downloaded += 1;
        } catch (e) {
          failed += 1;
          console.warn(`  사진 실패 ${id} #${img.no} ${img.file}: ${e instanceof Error ? e.message : String(e)}`);
        }
        await sleep(IMAGE_GAP_MS);
      }
      out.set(id, nos);
    } catch (e) {
      failed += 1;
      console.warn(`  사진 목록 실패 ${id}: ${e instanceof Error ? e.message : String(e)}`);
      out.set(id, saved);
    }
  }
  console.log(`사진: 새로 ${downloaded}장, 실패 ${failed}, 사진 있는 산 ${[...out.values()].filter((v) => v.length > 0).length}/${ids.length}`);
  return out;
};

const main = async (): Promise<void> => {
  const zip = findZip();
  const serviceKey = process.env.DATA_GO_KR_API_KEY ?? '';
  if (!serviceKey) throw new Error('DATA_GO_KR_API_KEY 가 없습니다 — .env 확인.');

  const files = await readHikingZip(zip);
  console.log(`GPX ${files.length}개 (${new Set(files.map((f) => f.mountain)).size}산) — ${zip}`);

  const gdTrails = await fetchGdTrails({ serviceKey });
  console.log(`명산등산로 ${gdTrails.length}건`);
  // 산 코드가 빈 행(실측: 방장산)은 산정보에서 이름·소재지로 찾아 채운다.
  for (const g of gdTrails.filter((x) => !x.id)) {
    const info = pickMountainInfo(g, await fetchMountainInfos(g.name.replace(/\s*\([^)]*\)\s*$/, ''), { serviceKey }));
    console.log(`  산 코드 보충 ${g.name}: ${info ? `${info.id} (${info.address ?? ''})` : '못 찾음 — 이 산은 빠진다'}`);
    if (info) g.id = info.id;
  }

  // POI 는 보강이라 한 종류가 실패해도 나머지로 간다(GPX 지점만으로도 화면은 된다).
  const pois: TrekkingPoiRow[] = [];
  for (const kind of Object.keys(TREKKING_POI_KINDS) as TrekkingPoiKind[]) {
    try {
      const rows = await fetchTrekkingPois(kind, { serviceKey });
      pois.push(...rows);
      console.log(`등산트레킹 ${kind} ${rows.length}건`);
    } catch (e) {
      if (!(e instanceof HikingApiError)) throw e;
      console.warn(`등산트레킹 ${kind} 실패 — 건너뜀: ${e.message} (${e.requestUrl})`);
    }
  }

  const images = await collectImages(
    gdTrails.map((g) => g.id).filter((id): id is string => id !== null),
    serviceKey,
  );
  // 시군구 경계 — 없으면 적재는 하되 코스 시군구가 비어 산불위험이 안 나온다(status:hiking 이 stale 로 센다).
  const sigungu = existsSync(GEO_PATH) ? parseSigunguGeo(JSON.parse(readFileSync(GEO_PATH, 'utf8'))) : null;
  console.log(sigungu ? `시군구 경계 ${sigungu.length}곳 — ${GEO_PATH}` : `시군구 경계 없음(${GEO_PATH}) — 코스 시군구를 비운다`);

  // 5차 전국 주요 봉우리 — zip 이 없으면 100대 명산만.
  const peakZip = findPeakZip();
  let peaks: PreparedPeak[] = [];
  let mountainInfos: MountainInfoRow[] = [];
  let places: PeakPlace[] = [];
  let villages = new Map<string, string>();
  if (peakZip) {
    const t0 = Date.now();
    peaks = await readPeakZip(peakZip);
    const courseFiles = peaks.reduce((s, p) => s + p.courses.length, 0);
    const networkFiles = peaks.reduce((s, p) => s + p.networkFiles, 0);
    console.log(`봉우리 ${peaks.length}곳 · 코스 파일 ${courseFiles} · 등산로 망 ${networkFiles}(6차) — ${Math.round((Date.now() - t0) / 1000)}초, ${peakZip}`);
    try {
      mountainInfos = await fetchAllMountainInfos({ serviceKey });
      console.log(`산정보 ${mountainInfos.length}산`);
    } catch (e) {
      if (!(e instanceof HikingApiError)) throw e;
      console.warn(`산정보 실패 — 봉우리 소개·높이 없이 간다: ${e.message} (${e.requestUrl})`);
    }
    const ends = peakCourseEnds(peaks);
    places = await loadPlaces(ends);
    console.log(`들머리 이름 후보(역·정류장·공영 주차장) ${places.length}곳`);
    villages = await collectVillages(ends, places);
  } else console.log('전국 주요 봉우리 zip 없음 — 100대 명산만 적재(data.go.kr 15108086 zip 을 같은 폴더에 두면 같이 적재)');

  const facilities = await loadFacilities();
  console.log(`코스 지점 시설 후보(공중화장실·공영 주차장) ${facilities.length}곳`);
  const rows = buildHikingRows({ files, gdTrails, pois, images, sigungu, loadedAt: new Date(), peaks, mountainInfos, places, villages, facilities });
  if (rows.peakInfoIds.size > 0) {
    const peakImages = await collectPeakImages(rows.peakInfoIds, serviceKey);
    for (const m of rows.mountains) if (peakImages.has(m.id)) m.images = JSON.stringify(peakImages.get(m.id));
  }
  console.log('리포트', JSON.stringify({ ...rows.report, sigungu: { empty: rows.report.sigungu.empty.length, maxPerCourse: rows.report.sigungu.maxPerCourse } }, null, 1));
  console.log(`산 ${rows.mountains.length} · 코스 ${rows.courses.length} · 지점 ${rows.pois.length} · 코스 지점 ${rows.coursePois.length}`);
  if (rows.mountains.length === 0) throw new Error('만든 산이 없습니다 — GPX 폴더와 명산등산로 이름을 확인하세요.');
  if (DRY_RUN) {
    console.log('--dry-run: DB 쓰기 없음');
    return;
  }
  await replaceHiking(prisma, rows);
  console.log('적재 완료');
};

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
