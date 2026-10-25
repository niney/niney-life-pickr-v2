// 등산(/hiking) — 100대 명산 적재. 원천: 한국등산트레킹지원센터 100대명산 GPX zip(data.go.kr 15098177, 코스 607개)
// + 산림청 명산등산로(15158915, 1콜) + 한국등산트레킹지원센터 봉우리·갈림길·교통 POI(B553662, 합 ~10콜) + 산림청 산정보
// 사진(15058662, 산마다 1콜 + 사진 최대 3장). 키는 전부 DATA_GO_KR_API_KEY. 사진은 긴 변 960px JPEG 로 줄여
// data/hiking-images/<산 id>_<순번>.jpg 에 둔다(있으면 다시 받지 않음). → Hiking* 전량 교체.
// docs/PLAN-hiking.md · 원본 보관은 docs/data-sources.md
//
// 실행: pnpm --filter friendly load:hiking [zip] [옵션]
//   zip               기본 <리포>/data/open/hiking/ 의 .zip(하나).
//   --no-images       사진 API·다운로드를 건너뛴다(이미 받아 둔 파일은 그대로 쓴다).
//   --refresh-images  받아 둔 사진도 다시 받는다.
//   --dry-run         조립 리포트만(DB 쓰기 없음, 사진은 받는다 — 막으려면 --no-images 같이).

import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import sharp from 'sharp';
import {
  HikingApiError,
  TREKKING_POI_KINDS,
  downloadForestImage,
  fetchGdTrails,
  fetchMountainImages,
  fetchMountainInfos,
  fetchTrekkingPois,
  pickMountainInfo,
  type TrekkingPoiKind,
  type TrekkingPoiRow,
} from '../src/modules/hiking/hiking-api.adapter.js';
import {
  HIKING_IMAGE_DIR,
  buildHikingRows,
  hikingImageFileName,
  readHikingZip,
  replaceHiking,
} from '../src/modules/hiking/hiking-master.service.js';

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '../../../..');
const DEFAULT_DIR = resolve(REPO_ROOT, 'data/open/hiking');
const args = process.argv.slice(2);
const flag = (name: string): boolean => args.includes(`--${name}`);
const DRY_RUN = flag('dry-run');
const NO_IMAGES = flag('no-images');
const REFRESH_IMAGES = flag('refresh-images');
const MAX_IMAGES = 3;
const IMAGE_LONG_EDGE = 960;
const IMAGE_GAP_MS = 150;

const prisma = new PrismaClient();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const findZip = (): string => {
  const arg = args.find((a) => !a.startsWith('--'));
  if (arg) return resolve(arg);
  if (!existsSync(DEFAULT_DIR)) throw new Error(`${DEFAULT_DIR} 가 없습니다 — data.go.kr 15098177 zip 을 넣어 주세요.`);
  const zips = readdirSync(DEFAULT_DIR).filter((f) => f.toLowerCase().endsWith('.zip'));
  if (zips.length !== 1) throw new Error(`${DEFAULT_DIR} 에 .zip 이 ${zips.length}개 — 하나만 두거나 경로를 인자로 주세요.`);
  return resolve(DEFAULT_DIR, zips[0]!);
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
  const rows = buildHikingRows({ files, gdTrails, pois, images, loadedAt: new Date() });
  console.log('리포트', JSON.stringify(rows.report, null, 1));
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
