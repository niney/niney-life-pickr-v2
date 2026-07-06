// 노선별 역 순서 적재 — openapi SearchSTNBySubwayLineInfo 의 FR_CODE 순서로
// SubwayLineStation 을 채운다(본선/지선 section 분리). 업스트림 1콜(1/800).
//
// 실행: pnpm --filter friendly load:subway-line-orders [--dry-run]
//   --dry-run: openapi 조회 + 판정 리포트만(DB 미변경).
//
// SEOUL_OPEN_API_KEY(일반 인증키) 필요. 순서 소스로 openapi FR_CODE 를 채택한
// 근거는 subway-line-order.service.ts 주석 참조. openapi STATION_CD 는 우리
// SubwayStation.stationCd(BLDN_ID) 와 같은 체계라 코드 조인이 1차, 역명(괄호
// 제거·realtimeName)이 폴백.

import { PrismaClient } from '@prisma/client';
import { subwayLineName } from '@repo/utils';
import { assignSections, type FrRow } from '../src/modules/subway/subway-line-order.service.js';

const DRY_RUN = process.argv.includes('--dry-run');

// openapi LINE_NUM → 우리 lineId (지원 노선만). 인천선/인천2호선/김포도시철도/
// 용인경전철/의정부경전철은 1차부터 제외 노선이라 매핑하지 않는다(무시).
const LINE_NUM_TO_ID: Record<string, string> = {
  '01호선': '1001',
  '02호선': '1002',
  '03호선': '1003',
  '04호선': '1004',
  '05호선': '1005',
  '06호선': '1006',
  '07호선': '1007',
  '08호선': '1008',
  '09호선': '1009',
  'GTX-A': '1032',
  경의선: '1063',
  경춘선: '1067',
  공항철도: '1065',
  서해선: '1093',
  수인분당선: '1075',
  신림선: '1094',
  신분당선: '1077',
  우이신설경전철: '1092',
  경강선: '1081',
};

interface OpenApiRow {
  STATION_CD: string;
  STATION_NM: string;
  LINE_NUM: string;
  FR_CODE: string;
}

const stripParen = (n: string): string => n.replace(/\([^)]*\)/g, '').trim();

const prisma = new PrismaClient();

const main = async (): Promise<void> => {
  const apiKey = process.env.SEOUL_OPEN_API_KEY ?? '';
  if (!apiKey) {
    console.error('SEOUL_OPEN_API_KEY(일반 인증키)가 비어 있습니다.');
    process.exitCode = 1;
    return;
  }

  console.log(`\n=== 노선 순서 적재 ${DRY_RUN ? '(--dry-run)' : ''} ===\n`);

  // 업스트림 1콜 — 키는 로깅하지 않는다.
  const res = await fetch(
    `http://openapi.seoul.go.kr:8088/${apiKey}/json/SearchSTNBySubwayLineInfo/1/800`,
  );
  const json = (await res.json()) as {
    SearchSTNBySubwayLineInfo?: { RESULT?: { CODE?: string }; row?: OpenApiRow[] };
  };
  const box = json.SearchSTNBySubwayLineInfo;
  if (!box || box.RESULT?.CODE !== 'INFO-000' || !box.row) {
    console.error('openapi 응답 비정상:', JSON.stringify(box?.RESULT));
    process.exitCode = 1;
    return;
  }
  console.log(`openapi SearchSTNBySubwayLineInfo: ${box.row.length}행 수신`);

  // DB 조인 인덱스.
  const our = await prisma.subwayStation.findMany({
    select: { id: true, lineId: true, name: true, realtimeName: true, stationCd: true },
  });
  const byCd = new Map<string, string>(); // `${lineId}|${cd}` → stationId
  const byName = new Map<string, string>(); // `${lineId}|${name}` → stationId
  for (const r of our) {
    if (r.stationCd) byCd.set(`${r.lineId}|${r.stationCd}`, r.id);
    byName.set(`${r.lineId}|${r.name}`, r.id);
    byName.set(`${r.lineId}|${stripParen(r.name)}`, r.id);
    if (r.realtimeName) byName.set(`${r.lineId}|${r.realtimeName}`, r.id);
  }
  const ourByLine = new Map<string, Set<string>>();
  for (const r of our) {
    if (!ourByLine.has(r.lineId)) ourByLine.set(r.lineId, new Set());
    ourByLine.get(r.lineId)!.add(r.id);
  }

  const resolveStationId = (lineId: string, row: OpenApiRow): string | null =>
    byCd.get(`${lineId}|${row.STATION_CD}`) ??
    byName.get(`${lineId}|${row.STATION_NM}`) ??
    byName.get(`${lineId}|${stripParen(row.STATION_NM)}`) ??
    null;

  // 노선별 openapi 행 그룹.
  const openapiByLine = new Map<string, OpenApiRow[]>();
  for (const row of box.row) {
    const lineId = LINE_NUM_TO_ID[row.LINE_NUM];
    if (!lineId) continue; // 미지원 노선 무시.
    if (!openapiByLine.has(lineId)) openapiByLine.set(lineId, []);
    openapiByLine.get(lineId)!.push(row);
  }

  const insertRows: { lineId: string; branchKey: string; branchName: string | null; seq: number; stationId: string }[] = [];
  const unmatched: { lineId: string; names: string[] }[] = [];
  const droppedSmall: { lineId: string; branchKey: string; count: number }[] = [];
  const coveredStationIds = new Set<string>();

  console.log('\n[노선별 section]');
  for (const [lineId, rows] of [...openapiByLine.entries()].sort()) {
    const frRows: FrRow<string>[] = [];
    const miss: string[] = [];
    for (const row of rows) {
      const stationId = resolveStationId(lineId, row);
      if (stationId) frRows.push({ frCode: row.FR_CODE, ref: stationId });
      else miss.push(`${row.STATION_NM}(${row.STATION_CD})`);
    }
    if (miss.length) unmatched.push({ lineId, names: miss });

    const sections = assignSections(frRows, lineId);
    const kept = sections.filter((s) => s.stations.length >= 2);
    for (const s of sections) {
      if (s.stations.length < 2) {
        droppedSmall.push({ lineId, branchKey: s.branchKey, count: s.stations.length });
        continue;
      }
      for (const st of s.stations) {
        insertRows.push({
          lineId,
          branchKey: s.branchKey,
          branchName: s.branchName,
          seq: st.seq,
          stationId: st.ref,
        });
        coveredStationIds.add(st.ref);
      }
    }
    const secLabel = kept
      .map((s) => `${s.branchKey}(${s.stations.length}${s.branchName ? ':' + s.branchName : ''})`)
      .join(' ');
    console.log(`  ${lineId} ${subwayLineName(lineId)}: ${secLabel}${miss.length ? ` | 미조인 ${miss.length}` : ''}`);
  }

  // 순서 미부여(openapi 에 없거나 조인 실패로 section 에 못 든) DB 역.
  console.log('\n[순서 미부여 DB 역 — 커버리지 공백]');
  let gapTotal = 0;
  for (const [lineId, ids] of [...ourByLine.entries()].sort()) {
    const gap = [...ids].filter((id) => !coveredStationIds.has(id));
    if (gap.length) {
      gapTotal += gap.length;
      console.log(`  ${lineId} ${subwayLineName(lineId)}: ${gap.length}역 [${gap.map((id) => id.split(':')[1]).slice(0, 12).join(', ')}${gap.length > 12 ? ' …' : ''}]`);
    }
  }
  console.log(`  합계 공백: ${gapTotal}`);

  if (unmatched.length) {
    console.log('\n[openapi→DB 미조인]');
    for (const u of unmatched) console.log(`  ${u.lineId}: ${u.names.join(', ')}`);
  }
  if (droppedSmall.length) {
    console.log('\n[<2역 section drop]');
    for (const d of droppedSmall) console.log(`  ${d.lineId}/${d.branchKey}: ${d.count}역`);
  }

  console.log(`\n적재 대상 행: ${insertRows.length} (노선 ${openapiByLine.size}개)`);

  if (DRY_RUN) {
    console.log('\n--dry-run — DB 미변경.');
    return;
  }

  const loadedLineIds = [...openapiByLine.keys()];
  await prisma.$transaction([
    prisma.subwayLineStation.deleteMany({ where: { lineId: { in: loadedLineIds } } }),
    prisma.subwayLineStation.createMany({ data: insertRows }),
    prisma.subwayMasterSync.create({ data: { source: 'line-orders', count: insertRows.length } }),
  ]);
  console.log('적재 완료 (SubwayMasterSync source=line-orders 기록).');
};

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
