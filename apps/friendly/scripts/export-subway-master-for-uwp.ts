// UWP(NineyWeather) 마이그레이션용 지하철 마스터 export — 가공 완료된
// SubwayStation(realtimeName 예외·제외 노선·좌표 검증 반영)과 SubwayLineStation
// (본선/지선 순서)을 JSON 으로 덤프해 UWP Assets 번들로 쓴다.
//
// 실행: pnpm --filter friendly export:subway-uwp [-- --out <dir>]
//   기본 출력: apps/friendly/data/export-uwp/
//   산출물: subway-stations.json / subway-line-orders.json
//
// DB 만 읽는다(업스트림 0콜, 키 불필요). 마스터가 비어 있으면 안내 후 종료
// (load:subway-stations / load:subway-line-orders 선행 필요).

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { LOOP_SECTIONS } from '../src/modules/subway/subway-line-order.service.js';

const prisma = new PrismaClient();

const outArgIdx = process.argv.indexOf('--out');
const OUT_DIR =
  outArgIdx >= 0 && process.argv[outArgIdx + 1]
    ? path.resolve(process.argv[outArgIdx + 1]!)
    : path.resolve('data/export-uwp');

const main = async (): Promise<void> => {
  const [stations, lineStations, sync] = await Promise.all([
    prisma.subwayStation.findMany({ orderBy: [{ lineId: 'asc' }, { name: 'asc' }] }),
    prisma.subwayLineStation.findMany({
      orderBy: [{ lineId: 'asc' }, { branchKey: 'asc' }, { seq: 'asc' }],
    }),
    prisma.subwayMasterSync.findFirst({
      where: { source: 'subwayStationMaster' },
      orderBy: { loadedAt: 'desc' },
    }),
  ]);

  if (stations.length === 0) {
    console.error(
      'SubwayStation 이 비어 있습니다 — pnpm --filter friendly load:subway-stations 선행 필요.',
    );
    process.exitCode = 1;
    return;
  }

  mkdirSync(OUT_DIR, { recursive: true });

  const exportedAt = new Date().toISOString();
  const stationsFile = {
    exportedAt,
    loadedAt: sync?.loadedAt.toISOString() ?? null,
    count: stations.length,
    stations: stations.map((s) => ({
      id: s.id,
      name: s.name,
      realtimeName: s.realtimeName,
      lineId: s.lineId,
      lineName: s.lineName,
      statnId: s.statnId,
      stationCd: s.stationCd,
      frCode: s.frCode,
      lat: s.lat,
      lng: s.lng,
    })),
  };
  const ordersFile = {
    exportedAt,
    loopSections: [...LOOP_SECTIONS].sort(),
    count: lineStations.length,
    rows: lineStations.map((r) => ({
      lineId: r.lineId,
      branchKey: r.branchKey,
      branchName: r.branchName,
      seq: r.seq,
      stationId: r.stationId,
    })),
  };

  writeFileSync(path.join(OUT_DIR, 'subway-stations.json'), JSON.stringify(stationsFile), 'utf8');
  writeFileSync(path.join(OUT_DIR, 'subway-line-orders.json'), JSON.stringify(ordersFile), 'utf8');
  console.log(`export 완료 → ${OUT_DIR}`);
  console.log(
    `  subway-stations.json: ${stations.length}행 (마스터 적재 ${stationsFile.loadedAt ?? '이력 없음'})`,
  );
  console.log(
    `  subway-line-orders.json: ${lineStations.length}행, loop=${ordersFile.loopSections.join(',')}`,
  );
};

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
