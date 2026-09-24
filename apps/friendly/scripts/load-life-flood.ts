// 침수 흔적 적재 — 서울시 침수흔적도(서울 열린데이터 OA-15636 = data.go.kr 15133406, 공공누리 1유형) 연도별 SHP zip
// 을 읽어 LifeFloodTrace 를 전량 교체한다(필지 폴리곤 → 무게중심 점, UTM-K → WGS84). 집값 단지 상세·지도 배지가
// 반경 100m 로 센다.
//
// 실행: pnpm --filter friendly load:life-flood [dir] [--download] [--refresh] [--dry-run]
//   dir         기본 <리포>/data/open/flood — seoul-flood-YYYY.zip 들.
//   --download  데이터셋 페이지에서 연도별 zip 목록을 읽어 폴더에 없는 연도만 받는다(폴더가 비어 있으면 자동).
//   --refresh   목록의 연도 전부를 다시 받는다(서울시가 기존 연도 파일을 고쳐 올렸을 때 — 예: '_260105 수정').
//   --dry-run   파싱 리포트만(DB 쓰기 없음).
// 원본 zip 은 리포에 넣지 않는다(data/open/ 은 .gitignore) — docs/data-sources.md. 서울시가 새 연도를 올리면
// --download 로 다시 실행.

import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { listZipEntries } from '../src/modules/housing/housing-price-master.service.js';
import {
  SEOUL_FLOOD_DATASET_ID,
  SEOUL_FLOOD_DOWNLOAD_URL,
  SEOUL_FLOOD_PAGE_URL,
  SEOUL_FLOOD_ZIP_RE,
  emptyLifeFloodReport,
  latestFloodEvent,
  parseLifeFloodLayer,
  parseSeoulFloodFileList,
  readZipEntryBuffer,
  replaceLifeFloodTraces,
  seoulFloodZipName,
  type LifeFloodTraceRow,
} from '../src/modules/life-map/life-flood-master.service.js';

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '../../../..');
const DEFAULT_DIR = resolve(REPO_ROOT, 'data/open/flood');
// 서울 열린데이터는 기본 curl/node UA 를 막지 않지만, 브라우저와 같은 폼 POST(Referer 포함)로 맞춘다.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) niney-life-pickr/flood-loader';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const REFRESH = args.includes('--refresh');
const DIR = resolve(args.find((a) => !a.startsWith('--')) ?? DEFAULT_DIR);

const localZips = (): { year: number; path: string }[] =>
  existsSync(DIR)
    ? readdirSync(DIR)
        .map((f) => ({ f, m: SEOUL_FLOOD_ZIP_RE.exec(f) }))
        .filter((x): x is { f: string; m: RegExpExecArray } => x.m !== null)
        .map((x) => ({ year: Number(x.m[1]), path: resolve(DIR, x.f) }))
        .sort((a, b) => a.year - b.year)
    : [];

const download = async (): Promise<void> => {
  const page = await fetch(SEOUL_FLOOD_PAGE_URL, { headers: { 'User-Agent': UA } });
  if (!page.ok) throw new Error(`데이터셋 페이지 HTTP ${page.status}: ${SEOUL_FLOOD_PAGE_URL}`);
  const files = parseSeoulFloodFileList(await page.text());
  if (files.length === 0) throw new Error('데이터셋 페이지에서 연도별 zip 목록을 찾지 못했습니다(페이지 구조 변경?)');
  mkdirSync(DIR, { recursive: true });
  const have = new Set(localZips().map((z) => z.year));
  for (const f of files) {
    if (have.has(f.year) && !REFRESH) continue;
    const res = await fetch(SEOUL_FLOOD_DOWNLOAD_URL, {
      method: 'POST',
      headers: { 'User-Agent': UA, Referer: SEOUL_FLOOD_PAGE_URL, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ infId: SEOUL_FLOOD_DATASET_ID, seqNo: '', seq: f.seq, infSeq: '1' }).toString(),
    });
    const buf = Buffer.from(await res.arrayBuffer());
    // zip 서명(PK\x03\x04)이 아니면 오류 페이지 — 저장하지 않는다.
    if (!res.ok || buf.length < 4 || buf.readUInt32LE(0) !== 0x04034b50) {
      throw new Error(`${f.year}년 파일 다운로드 실패(HTTP ${res.status}, ${buf.length}바이트): ${f.name}`);
    }
    writeFileSync(resolve(DIR, seoulFloodZipName(f.year)), buf);
    console.log(`  받음 ${f.year}년 — ${f.name} (${(buf.length / 1024).toFixed(0)}KB)`);
  }
};

const prisma = new PrismaClient();

const main = async (): Promise<void> => {
  console.log(`\n=== 침수 흔적 적재(서울시 침수흔적도 ${SEOUL_FLOOD_DATASET_ID}) ${DRY_RUN ? '(--dry-run)' : ''} ===\n폴더: ${DIR}`);
  if (args.includes('--download') || REFRESH || localZips().length === 0) {
    console.log(`목록 확인·다운로드: ${SEOUL_FLOOD_PAGE_URL}`);
    await download();
  }
  const zips = localZips();
  if (zips.length === 0) throw new Error(`zip 이 없습니다: ${DIR}/seoul-flood-YYYY.zip`);

  const report = emptyLifeFloodReport();
  const rows: LifeFloodTraceRow[] = [];
  for (const z of zips) {
    const entries = await listZipEntries(z.path);
    const shp = entries.find((e) => /\.shp$/i.test(e.name));
    const dbf = entries.find((e) => /\.dbf$/i.test(e.name));
    if (!shp || !dbf) throw new Error(`${z.year}년 zip 에 .shp/.dbf 가 없습니다: ${z.path}`);
    const before = report.kept;
    const layer = parseLifeFloodLayer(await readZipEntryBuffer(z.path, shp), await readZipEntryBuffer(z.path, dbf), z.year, report);
    rows.push(...layer);
    console.log(`  ${z.year}년 파일: ${(report.kept - before).toLocaleString('ko-KR')}건`);
  }
  const baseDate = latestFloodEvent(rows);
  console.log(
    `\n읽음 ${report.read.toLocaleString('ko-KR')} → 채택 ${report.kept.toLocaleString('ko-KR')}` +
      ` (삭제 ${report.dropped.deleted} · 도형 없음 ${report.dropped.noGeometry} · 범위 밖 ${report.dropped.outOfRange})` +
      `\n사건 연도별: ${Object.entries(report.byEventYear)
        .map(([y, n]) => `${y} ${n.toLocaleString('ko-KR')}`)
        .join(' · ')}\n피해일자 없음(연도 폴백) ${report.yearFallback.toLocaleString('ko-KR')}건 · 최신 사건 ${baseDate ?? '-'}`,
  );
  if (DRY_RUN) return;
  const t0 = Date.now();
  const n = await replaceLifeFloodTraces(prisma, rows, {
    baseDate,
    sourceFile: `${SEOUL_FLOOD_DATASET_ID} ${zips[0]!.year}~${zips[zips.length - 1]!.year} (${zips.length}개 파일)`,
  });
  console.log(`LifeFloodTrace ${n.toLocaleString('ko-KR')}행 교체 (${((Date.now() - t0) / 1000).toFixed(1)}초)`);
};

main()
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
