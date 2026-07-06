// 수도권 전철 역사마스터 적재 — openapi subwayStationMaster(784행) 전량을
// 정규화해 SubwayStation 에 upsert 한다. 업스트림 1콜(1/1000)이라 쿼터 부담 0.
//
// 실행: pnpm --filter friendly load:subway-stations [--dry-run] [--prune]
//   --dry-run: 업스트림 조회 + 정규화 리포트만(upsert 없음).
//   --prune:   이번 적재에 없는 기존 id 삭제(기본은 목록 출력만, 삭제 안 함).
//
// SEOUL_OPEN_API_KEY(일반 인증키) 필요 — swopenAPI 실시간 키(SUBWAY_API_KEY)가
// 아니다. 빈 값이면 안내 후 종료.

import { PrismaClient } from '@prisma/client';
import { subwayLineName } from '@repo/utils';
import { getStationMaster } from '../src/modules/subway/subway-api.adapter.js';
import {
  normalizeMasterRows,
  upsertStations,
} from '../src/modules/subway/subway-master.service.js';

const DRY_RUN = process.argv.includes('--dry-run');
const PRUNE = process.argv.includes('--prune');

const prisma = new PrismaClient();

const main = async (): Promise<void> => {
  const apiKey = process.env.SEOUL_OPEN_API_KEY ?? '';
  if (!apiKey) {
    console.error('SEOUL_OPEN_API_KEY(일반 인증키)가 비어 있습니다.');
    console.error('  1) https://data.seoul.go.kr 에서 일반 인증키 발급');
    console.error('  2) apps/friendly/.env 에 SEOUL_OPEN_API_KEY=<일반 인증키> 추가');
    console.error('  3) pnpm --filter friendly load:subway-stations 재실행');
    process.exitCode = 1;
    return;
  }

  console.log(`\n=== 역사마스터 적재 ${DRY_RUN ? '(--dry-run)' : ''}${PRUNE ? ' (--prune)' : ''} ===\n`);

  const raw = await getStationMaster({ apiKey });
  console.log(`업스트림 subwayStationMaster: ${raw.length}행 수신`);

  const report = normalizeMasterRows(raw);

  // 호선별 카운트 — lineId 오름차순.
  console.log('\n[호선별 채택 카운트]');
  const lineIds = [...report.byLine.keys()].sort();
  for (const lineId of lineIds) {
    console.log(`  ${lineId} ${subwayLineName(lineId)}: ${report.byLine.get(lineId)}행`);
  }
  console.log(`  합계: ${report.rows.length}행`);

  // drop 사유별 목록.
  if (report.droppedExcluded.length > 0) {
    const byRoute = new Map<string, number>();
    for (const d of report.droppedExcluded) byRoute.set(d.route, (byRoute.get(d.route) ?? 0) + 1);
    console.log('\n[제외 노선 — 서울 실시간 미제공]');
    for (const [route, n] of [...byRoute.entries()].sort()) console.log(`  ${route}: ${n}행 drop`);
  }
  if (report.droppedUnknown.length > 0) {
    const byRoute = new Map<string, number>();
    for (const d of report.droppedUnknown)
      byRoute.set(d.route ?? '(없음)', (byRoute.get(d.route ?? '(없음)') ?? 0) + 1);
    console.log('\n[미지 ROUTE — 매핑 없음(drop, 하드 fail 아님)]');
    for (const [route, n] of [...byRoute.entries()].sort()) console.log(`  ${route}: ${n}행 drop`);
  }
  if (report.droppedBadCoord.length > 0) {
    console.log(`\n[좌표 이상 drop] ${report.droppedBadCoord.length}행`);
    for (const d of report.droppedBadCoord.slice(0, 20))
      console.log(`  ${d.name}(${d.lineId}): lat=${d.lat} lng=${d.lng}`);
    if (report.droppedBadCoord.length > 20) console.log(`  … 외 ${report.droppedBadCoord.length - 20}행`);
  }
  if (report.droppedNoName > 0) console.log(`\n[역명 누락 drop] ${report.droppedNoName}행`);
  if (report.duplicates > 0) console.log(`\n[id 중복 접힘] ${report.duplicates}행`);

  if (DRY_RUN) {
    console.log('\n--dry-run — upsert 생략. 종료.');
    return;
  }

  // 이번 적재에 없는 기존 id — prune 대상.
  const loadedIds = new Set(report.rows.map((r) => r.id));
  const existing = await prisma.subwayStation.findMany({ select: { id: true } });
  const staleIds = existing.map((e) => e.id).filter((id) => !loadedIds.has(id));

  await upsertStations(prisma, report.rows);
  console.log(`\nupsert 완료: ${report.rows.length}행 (SubwayMasterSync 기록됨)`);

  if (staleIds.length > 0) {
    console.log(`\n[이번 적재에 없는 기존 id] ${staleIds.length}건`);
    for (const id of staleIds.slice(0, 30)) console.log(`  ${id}`);
    if (staleIds.length > 30) console.log(`  … 외 ${staleIds.length - 30}건`);
    if (PRUNE) {
      const { count } = await prisma.subwayStation.deleteMany({ where: { id: { in: staleIds } } });
      console.log(`  --prune: ${count}건 삭제`);
    } else {
      console.log('  (--prune 미지정 — 삭제 안 함, 목록만)');
    }
  } else {
    console.log('\n삭제 대상(stale id) 없음.');
  }
};

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
