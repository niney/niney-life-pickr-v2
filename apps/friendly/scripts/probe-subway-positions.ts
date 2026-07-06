// 실시간 열차 위치 semantics 프로브 (6차) — FE 보간 설계 게이트.
// realtimePosition 을 실호출해 ① 급행 통과역 ② updnLine↔노선방향 ③ 2호선 순환
// ④ trainSttus 분포·미조인 statnId 를 관찰한다. 5차 노선 순서(SubwayLineStation)
// 의 seq 와 조인해 진행 방향을 판정.
//
// 실행: pnpm --filter friendly probe:subway-positions
// 총 ~3콜(9호선×2[15s 간격]+2호선×1). 덤프: data/subway-probe/positions-semantics.json.
// 키는 로깅 금지.

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { subwayLineById } from '@repo/utils';
import { getRealtimePositions, type RawSubwayPosition } from '../src/modules/subway/subway-api.adapter.js';

const prisma = new PrismaClient();
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// statnId → {seq, name, branchKey} (노선 순서 조인). SubwayStation.statnId → id →
// SubwayLineStation.stationId.
const buildSeqMap = async (lineId: string): Promise<Map<string, { seq: number; name: string; branchKey: string }>> => {
  const stations = await prisma.subwayStation.findMany({
    where: { lineId, statnId: { not: null } },
    select: { id: true, name: true, statnId: true },
  });
  const lineStations = await prisma.subwayLineStation.findMany({
    where: { lineId },
    select: { stationId: true, seq: true, branchKey: true },
  });
  const seqByStationId = new Map(lineStations.map((l) => [l.stationId, { seq: l.seq, branchKey: l.branchKey }]));
  const map = new Map<string, { seq: number; name: string; branchKey: string }>();
  for (const s of stations) {
    if (!s.statnId) continue;
    const seq = seqByStationId.get(s.id);
    if (seq) map.set(s.statnId, { seq: seq.seq, name: s.name, branchKey: seq.branchKey });
  }
  return map;
};

interface Report {
  express: unknown;
  updnDirection: unknown;
  loop: unknown;
  trainSttus: unknown;
  unmatched: unknown;
}

const main = async (): Promise<void> => {
  const apiKey = process.env.SUBWAY_API_KEY ?? '';
  if (!apiKey) {
    console.error('SUBWAY_API_KEY 없음');
    process.exitCode = 1;
    return;
  }
  const param9 = subwayLineById('1009')!.positionParam!;
  const param2 = subwayLineById('1002')!.positionParam!;
  const seq9 = await buildSeqMap('1009');
  const seq2 = await buildSeqMap('1002');
  const report: Report = { express: null, updnDirection: null, loop: null, trainSttus: null, unmatched: null };

  console.log('=== 위치 semantics 프로브 ===');

  // ── 9호선 2콜 (15s) — 급행 통과역 ────────────────────────────────────────
  console.log('\n① 급행 통과역 — 9호선 15초 간격 2콜');
  const p9a = await getRealtimePositions(param9, { apiKey });
  await sleep(15_000);
  const p9b = await getRealtimePositions(param9, { apiKey });
  const byTrainA = new Map(p9a.map((t) => [t.trainNo, t]));
  const deltas: { trainNo: string; express: string | null; from: number; to: number; delta: number; fromNm: string; toNm: string }[] = [];
  for (const b of p9b) {
    const a = b.trainNo ? byTrainA.get(b.trainNo) : undefined;
    if (!a || !a.statnId || !b.statnId) continue;
    const sa = seq9.get(a.statnId);
    const sb = seq9.get(b.statnId);
    if (!sa || !sb || sa.seq === sb.seq) continue; // 미이동/미조인 skip
    deltas.push({
      trainNo: b.trainNo!,
      express: b.directAt === '0' ? null : b.directAt,
      from: sa.seq,
      to: sb.seq,
      delta: Math.abs(sb.seq - sa.seq),
      fromNm: sa.name,
      toNm: sb.name,
    });
  }
  const exp = deltas.filter((d) => d.express !== null);
  const norm = deltas.filter((d) => d.express === null);
  const avg = (arr: number[]) => (arr.length ? (arr.reduce((s, x) => s + x, 0) / arr.length).toFixed(2) : 'n/a');
  console.log(`   이동 관측 ${deltas.length}대 (급행 ${exp.length}, 일반 ${norm.length})`);
  console.log(`   급행 seq델타 평균 ${avg(exp.map((d) => d.delta))} (>1 이면 통과역 건너뜀)`);
  console.log(`   일반 seq델타 평균 ${avg(norm.map((d) => d.delta))}`);
  for (const d of exp.slice(0, 4)) console.log(`     급행 ${d.trainNo}: ${d.fromNm}(${d.from})→${d.toNm}(${d.to}) Δ${d.delta}`);
  report.express = {
    movedTrains: deltas.length,
    expressAvgDelta: avg(exp.map((d) => d.delta)),
    normalAvgDelta: avg(norm.map((d) => d.delta)),
    samples: deltas.slice(0, 12),
  };

  // ── updnLine ↔ 방향 (9호선·2호선) ─────────────────────────────────────────
  console.log('\n② updnLine ↔ 노선 방향 — 현재 seq vs 행선(statnTid) seq');
  const analyzeUpdn = (rows: RawSubwayPosition[], seqMap: Map<string, { seq: number; name: string; branchKey: string }>) => {
    const stat: Record<string, { destGt: number; destLt: number; total: number }> = {};
    for (const t of rows) {
      if (!t.statnId || !t.statnTid) continue;
      const cur = seqMap.get(t.statnId);
      const dest = seqMap.get(t.statnTid);
      if (!cur || !dest) continue;
      const up = t.updnLine ?? '?';
      stat[up] ??= { destGt: 0, destLt: 0, total: 0 };
      stat[up]!.total++;
      if (dest.seq > cur.seq) stat[up]!.destGt++;
      else if (dest.seq < cur.seq) stat[up]!.destLt++;
    }
    return stat;
  };
  const p2 = await getRealtimePositions(param2, { apiKey }); // 2호선 1콜(②③ 공유)
  const updn9 = analyzeUpdn(p9b, seq9);
  const updn2 = analyzeUpdn(p2, seq2);
  console.log('   9호선:', JSON.stringify(updn9), '(destGt=행선이 seq큼→증가방향)');
  console.log('   2호선:', JSON.stringify(updn2));
  report.updnDirection = { line9: updn9, line2: updn2 };

  // ── 2호선 순환 — statnTnm 형태 ───────────────────────────────────────────
  console.log('\n③ 2호선 순환 — updnLine별 statnTnm 표본');
  const tnmByUpdn: Record<string, Set<string>> = {};
  for (const t of p2) {
    const up = t.updnLine ?? '?';
    (tnmByUpdn[up] ??= new Set()).add(t.statnTnm ?? '(null)');
  }
  for (const [up, set] of Object.entries(tnmByUpdn)) console.log(`   updnLine ${up}: statnTnm [${[...set].slice(0, 6).join(', ')}]`);
  report.loop = Object.fromEntries(Object.entries(tnmByUpdn).map(([k, v]) => [k, [...v]]));

  // ── trainSttus 분포 + 미조인 statnId ─────────────────────────────────────
  console.log('\n④ trainSttus 분포 + 미조인 statnId');
  const allRows = [...p9b, ...p2];
  const sttus: Record<string, number> = {};
  for (const t of allRows) sttus[t.trainSttus ?? '?'] = (sttus[t.trainSttus ?? '?'] ?? 0) + 1;
  console.log('   trainSttus:', JSON.stringify(sttus));
  const allStatnIds = [...new Set(allRows.map((t) => t.statnId).filter((s): s is string => !!s))];
  const known = new Set((await prisma.subwayStation.findMany({ where: { statnId: { in: allStatnIds } }, select: { statnId: true } })).map((r) => r.statnId));
  const unmatched = allStatnIds.filter((s) => !known.has(s));
  console.log(`   조인 ${allStatnIds.length - unmatched.length}/${allStatnIds.length}, 미조인 ${unmatched.length}: [${unmatched.slice(0, 10).join(', ')}]`);
  report.trainSttus = sttus;
  report.unmatched = { count: unmatched.length, total: allStatnIds.length, ids: unmatched };

  const dumpDir = join(process.cwd(), 'data', 'subway-probe');
  await mkdir(dumpDir, { recursive: true });
  await writeFile(join(dumpDir, 'positions-semantics.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log(`\n덤프 → data/subway-probe/positions-semantics.json`);
};

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
