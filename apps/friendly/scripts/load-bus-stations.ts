// 버스 정류소 마스터 적재 — 열린데이터광장 busStopLocationXyInfo(실측 11,248행)
// 전량을 정규화해 BusStation 에 upsert 한다. 업스트림 12콜(1000행 페이징)이며
// ws.bus.go.kr 실시간 쿼터와 무관한 포털이라 부담 0.
//
// 실행: pnpm --filter friendly load:bus-stations [--dry-run] [--prune]
//   --dry-run: 업스트림 조회 + 정규화 리포트만(upsert 없음).
//   --prune:   이번 적재에 없는 기존 stId 삭제(기본은 목록 출력만, 삭제 안 함).
//
// SEOUL_OPEN_API_KEY(일반 인증키) 필요 — 지하철 마스터(load:subway-stations)와
// 같은 키다. DATA_GO_KR_API_KEY(ws.bus.go.kr)가 아니다.

import { PrismaClient } from '@prisma/client';
import {
  fetchBusStopMaster,
  normalizeBusMasterRows,
  upsertBusStations,
} from '../src/modules/bus/bus-master.service.js';

const DRY_RUN = process.argv.includes('--dry-run');
const PRUNE = process.argv.includes('--prune');

const prisma = new PrismaClient();

const main = async (): Promise<void> => {
  const apiKey = process.env.SEOUL_OPEN_API_KEY ?? '';
  if (!apiKey) {
    console.error('SEOUL_OPEN_API_KEY(일반 인증키)가 비어 있습니다.');
    console.error('  1) https://data.seoul.go.kr 에서 일반 인증키 발급');
    console.error('  2) apps/friendly/.env 에 SEOUL_OPEN_API_KEY=<일반 인증키> 추가');
    console.error('  3) pnpm --filter friendly load:bus-stations 재실행');
    process.exitCode = 1;
    return;
  }

  console.log(`\n=== 버스 정류소 마스터 적재 ${DRY_RUN ? '(--dry-run)' : ''}${PRUNE ? ' (--prune)' : ''} ===\n`);

  const raw = await fetchBusStopMaster(apiKey);
  console.log(`업스트림 busStopLocationXyInfo: ${raw.length}행 수신`);

  const report = normalizeBusMasterRows(raw);

  console.log('\n[유형별 채택 카운트]');
  for (const [type, n] of [...report.byType.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type}: ${n}행`);
  }
  console.log(`  합계: ${report.rows.length}행`);

  if (report.droppedExcludedType > 0) {
    console.log(`\n[비버스 유형 drop] ${report.droppedExcludedType}행 (한강선착장 등)`);
  }
  if (report.droppedBadId.length > 0) {
    console.log(`\n[ID 이상 drop] ${report.droppedBadId.length}행`);
    for (const d of report.droppedBadId.slice(0, 20)) {
      console.log(`  stId=${d.stId} arsId=${d.arsId} ${d.name ?? ''}`);
    }
  }
  if (report.droppedBadCoord.length > 0) {
    console.log(`\n[좌표 이상 drop] ${report.droppedBadCoord.length}행`);
    for (const d of report.droppedBadCoord.slice(0, 20)) {
      console.log(`  ${d.name}(${d.stId}): lat=${d.lat} lng=${d.lng}`);
    }
  }
  if (report.droppedNoName > 0) console.log(`\n[정류소명 누락 drop] ${report.droppedNoName}행`);
  if (report.duplicates > 0) console.log(`\n[stId 중복 접힘] ${report.duplicates}행`);

  if (DRY_RUN) {
    console.log('\n--dry-run — upsert 생략. 종료.');
    return;
  }

  // 이번 적재에 없는 기존 stId — prune 대상 (검색 캐시로 들어온 서울 외/폐지
  // 정류소일 수 있어 기본은 삭제하지 않고 목록만).
  const loadedIds = new Set(report.rows.map((r) => r.stId));
  const existing = await prisma.busStation.findMany({ select: { stId: true, name: true } });
  const orphans = existing.filter((e) => !loadedIds.has(e.stId));

  const count = await upsertBusStations(prisma, report.rows);
  console.log(`\nBusStation upsert: ${count}행 + 적재 이력(BusMasterSync) 기록`);

  if (orphans.length > 0) {
    console.log(`\n[이번 적재에 없는 기존 정류소] ${orphans.length}행`);
    for (const o of orphans.slice(0, 20)) console.log(`  ${o.stId} ${o.name}`);
    if (orphans.length > 20) console.log(`  … 외 ${orphans.length - 20}행`);
    if (PRUNE) {
      const del = await prisma.busStation.deleteMany({
        where: { stId: { in: orphans.map((o) => o.stId) } },
      });
      console.log(`  --prune: ${del.count}행 삭제`);
    } else {
      console.log('  (삭제하려면 --prune)');
    }
  }
};

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
