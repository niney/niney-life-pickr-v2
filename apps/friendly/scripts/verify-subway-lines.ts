// 호선 매핑 보정 — 도착 API 관측(subwayList/statnList)으로 마스터 ROUTE 일률
// 매핑의 오라벨을 바로잡는다. 대조/파싱 로직은 순수 모듈
// (src/modules/subway/subway-verify.service.ts)에 있고, 이 스크립트는 그것을
// 구동하는 I/O(API 호출·DB·관측 캐시·CLI)만 맡는다.
//
// 실행: pnpm --filter friendly verify:subway-lines [--apply] [--fresh]
//   (기본)   dry-run — 그룹별 1콜씩 관측 → 리포트만(DB 미변경). 관측을 캐시에 저장.
//   --apply  DB 반영($transaction: 삭제/생성/statnId·realtimeName 업데이트).
//            관측 캐시가 있으면 재호출 없이 파일 기반으로 적용(쿼터 2배 방지).
//   --fresh  캐시 무시하고 강제 재관측.
//
// SUBWAY_API_KEY(실시간 swopenAPI) 필요. 관측 원본만 캐시에 저장하며 키/요청 URL 은
// 절대 파일에 쓰지 않는다.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { subwayLineById, subwayLineName } from '@repo/utils';
import { getRealtimeArrivals, SubwayApiAuthError } from '../src/modules/subway/subway-api.adapter.js';
import { groupStations } from '../src/modules/subway/subway-master.service.js';
import {
  isParenName,
  parseArrivalClusters,
  reconcileGroup,
  resolveObserved,
  stripParenName,
  type GroupDbRow,
  type ObservedRow,
  type ReconcilePlan,
} from '../src/modules/subway/subway-verify.service.js';

const APPLY = process.argv.includes('--apply');
const FRESH = process.argv.includes('--fresh');

// 쿼터 안전. 그룹 ~570개 + 병기형 재시도(~40)까지 한 번에 덮도록 상한 750.
const DELAY_MS = 120;
const PROGRESS_EVERY = 50;
const MAX_CALLS = 750;

// --apply 삭제 화이트리스트 (Advisor 승인). extra 로 잡힌 행 중 이 id 만 삭제한다.
// 경원선 구간을 마스터가 1호선(1001)으로 오라벨한 확정 3건. 신촌 1063 은 의도적
// 제외 — 경의중앙 신촌은 2호선 신촌과 별개 물리역이 근접 그룹핑으로 합쳐진 것이라
// 실재하며, 실시간 조회명만 다르다(아래 신촌 프로브로 realtimeName 보강).
const EXTRA_DELETE_WHITELIST = new Set([
  '1001:왕십리(성동구청)',
  '1001:옥수',
  '1001:이촌(국립중앙박물관)',
]);

// 수동 보정 (Advisor 승인). 경의중앙 전용역인데 마스터가 경원선(→1001)으로
// 오라벨한 3역. 관측이 {1063} 단독이라 그룹 노선({1001})과 교집합 0 → resolveObserved
// 가 unmatched 로 자동경로에서 뺀다. 여기서 명시적으로 1001→1063 재라벨:
// 기존 `1001:<name>` 삭제 + `1063:<name>` 생성. statnId 는 관측 캐시의 1063 클러스터.
const MANUAL_FIXES: { name: string; fromLineId: string; toLineId: string }[] = [
  { name: '서빙고', fromLineId: '1001', toLineId: '1063' },
  { name: '한남', fromLineId: '1001', toLineId: '1063' },
  { name: '응봉', fromLineId: '1001', toLineId: '1063' },
];

const DATA_DIR = join(process.cwd(), 'data', 'subway-verify');
const CACHE_FILE = join(DATA_DIR, 'observations.json');
const REPORT_FILE = join(DATA_DIR, APPLY ? 'apply-report.txt' : 'dry-run-report.txt');

const prisma = new PrismaClient();
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

interface CacheEntry {
  name: string;
  queryName: string;
  rows: ObservedRow[];
}
interface CacheFile {
  generatedAt: string;
  note: string;
  groups: Record<string, CacheEntry>;
}

const toObservedRow = (r: {
  subwayId: string | null;
  statnId: string | null;
  subwayList: string | null;
  statnList: string | null;
  statnNm: string | null;
}): ObservedRow => ({
  subwayId: r.subwayId,
  statnId: r.statnId,
  subwayList: r.subwayList,
  statnList: r.statnList,
  statnNm: r.statnNm,
});

// 그룹 대표 조회역명 = 그룹 realtimeName ?? name. 빈 결과 + 병기형이면 괄호 제거형
// 으로 1회 재시도. 반환의 queryName 은 성공에 쓰인 역명.
const observeGroup = async (
  name: string,
  existingRealtimeName: string | null,
  apiKey: string,
): Promise<{ rows: ObservedRow[]; queryName: string; calls: number }> => {
  const firstQuery = existingRealtimeName ?? name;
  let rows = (await getRealtimeArrivals(firstQuery, { apiKey })).map(toObservedRow);
  let calls = 1;
  let queryName = firstQuery;
  await sleep(DELAY_MS);
  if (rows.length === 0 && isParenName(name)) {
    const stripped = stripParenName(name);
    const retry = (await getRealtimeArrivals(stripped, { apiKey })).map(toObservedRow);
    calls += 1;
    await sleep(DELAY_MS);
    if (retry.length > 0) {
      rows = retry;
      queryName = stripped;
    }
  }
  return { rows, queryName, calls };
};

interface GroupInfo {
  id: string;
  name: string;
  lat: number;
  lng: number;
  lineIds: Set<string>;
  dbRows: GroupDbRow[];
  existingRealtimeName: string | null;
}

const main = async (): Promise<void> => {
  const apiKey = process.env.SUBWAY_API_KEY ?? '';
  if (!apiKey) {
    console.error('SUBWAY_API_KEY(실시간 지하철 인증키)가 비어 있습니다 — 관측 불가.');
    process.exitCode = 1;
    return;
  }

  console.log(`\n=== 호선 매핑 보정 ${APPLY ? '(--apply)' : '(dry-run)'}${FRESH ? ' (--fresh)' : ''} ===\n`);

  const stations = await prisma.subwayStation.findMany();
  if (stations.length === 0) {
    console.error('SubwayStation 이 비어 있습니다 — 먼저 load:subway-stations 실행 필요.');
    process.exitCode = 1;
    return;
  }
  const byId = new Map(stations.map((s) => [s.id, s]));
  const groups = groupStations(
    stations.map((s) => ({
      id: s.id,
      name: s.name,
      lineId: s.lineId,
      lineName: s.lineName,
      lat: s.lat,
      lng: s.lng,
    })),
  );

  const groupInfos: GroupInfo[] = groups.map((g) => {
    const dbRows = g.lines.map((l) => byId.get(l.stationId)!);
    return {
      id: g.id,
      name: g.name,
      lat: g.lat,
      lng: g.lng,
      lineIds: new Set(g.lines.map((l) => l.lineId)),
      dbRows: dbRows.map((r) => ({
        id: r.id,
        lineId: r.lineId,
        statnId: r.statnId,
        realtimeName: r.realtimeName,
      })),
      existingRealtimeName: dbRows.find((r) => r.realtimeName)?.realtimeName ?? null,
    };
  });
  console.log(`역 ${stations.length}행 → 그룹 ${groupInfos.length}개`);

  // ── 관측 (라이브 or 캐시) ──────────────────────────────────────────────────
  const observations = new Map<string, CacheEntry>();
  let totalCalls = 0;
  let observeErrors: { id: string; name: string; message: string }[] = [];

  // 캐시가 있으면 dry-run·apply 모두 재사용(--fresh 로만 강제 재관측) — 재호출 쿼터
  // 낭비 방지. 첫 실행은 캐시가 없어 자연히 라이브 관측한다.
  const useCache = !FRESH;
  let cacheLoaded = false;
  if (useCache) {
    try {
      const parsed = JSON.parse(await readFile(CACHE_FILE, 'utf8')) as CacheFile;
      for (const [id, entry] of Object.entries(parsed.groups)) observations.set(id, entry);
      cacheLoaded = true;
      console.log(`관측 캐시 로드: ${observations.size}그룹 (재호출 없음)`);
    } catch {
      console.log('관측 캐시 없음 — 라이브 관측으로 폴백.');
    }
  }

  if (!cacheLoaded) {
    console.log(`라이브 관측 시작 (콜 간 ${DELAY_MS}ms, 상한 ${MAX_CALLS})...`);
    let aborted = false;
    for (const [i, gi] of groupInfos.entries()) {
      if (totalCalls >= MAX_CALLS) {
        console.warn(`  ${MAX_CALLS}콜 상한 도달 — 관측 중단(부분 저장). 남은 그룹 ${groupInfos.length - i}개.`);
        aborted = true;
        break;
      }
      try {
        const obs = await observeGroup(gi.name, gi.existingRealtimeName, apiKey);
        totalCalls += obs.calls;
        observations.set(gi.id, { name: gi.name, queryName: obs.queryName, rows: obs.rows });
      } catch (e) {
        if (e instanceof SubwayApiAuthError) {
          console.error(`  인증 실패 — 관측 중단: ${e.message}`);
          aborted = true;
          break;
        }
        observeErrors.push({
          id: gi.id,
          name: gi.name,
          message: e instanceof Error ? e.message : String(e),
        });
      }
      if ((i + 1) % PROGRESS_EVERY === 0) {
        console.log(`  진행 ${i + 1}/${groupInfos.length} (콜 ${totalCalls})`);
      }
    }
    // 관측 원본 캐시 저장 (키/URL 미포함).
    await mkdir(DATA_DIR, { recursive: true });
    const cache: CacheFile = {
      generatedAt: new Date().toISOString(),
      note: '도착 API 관측 원본(subwayList/statnList/statnNm). API 키·요청 URL 미포함.',
      groups: Object.fromEntries(observations),
    };
    await writeFile(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
    console.log(`관측 캐시 저장 → ${CACHE_FILE}${aborted ? ' (부분)' : ''}`);
  }

  // ── 대조 ──────────────────────────────────────────────────────────────────
  const plans: { gi: GroupInfo; plan: ReconcilePlan }[] = [];
  const emptyGroups: GroupInfo[] = [];
  const unmatchedGroups: GroupInfo[] = [];
  const unobserved: GroupInfo[] = [];

  for (const gi of groupInfos) {
    const obs = observations.get(gi.id);
    if (!obs) {
      unobserved.push(gi);
      continue;
    }
    if (obs.rows.length === 0) {
      emptyGroups.push(gi);
      continue;
    }
    const clusters = parseArrivalClusters(obs.rows);
    const sel = resolveObserved(clusters, gi.lineIds);
    if (!sel.cluster) {
      if (sel.reason === 'unmatched') unmatchedGroups.push(gi);
      else emptyGroups.push(gi);
      continue;
    }
    const realtimeName = obs.queryName !== gi.name ? obs.queryName : null;
    const plan = reconcileGroup({
      name: gi.name,
      lat: gi.lat,
      lng: gi.lng,
      dbRows: gi.dbRows,
      observed: sel.cluster,
      realtimeName,
      lineName: subwayLineName,
      isKnownLine: (l) => subwayLineById(l) !== null,
    });
    plans.push({ gi, plan });
  }

  // ── 리포트 ──────────────────────────────────────────────────────────────────
  const allExtra = plans.flatMap((p) => p.plan.extra.map((e) => ({ group: p.gi.name, ...e })));
  const allMissing = plans.flatMap((p) => p.plan.missing);
  const allBackfill = plans.flatMap((p) => p.plan.statnIdBackfill);
  const allRealtimeName = plans.flatMap((p) => p.plan.realtimeNameUpdate);
  const changedGroups = plans.filter(
    (p) =>
      p.plan.extra.length > 0 ||
      p.plan.missing.length > 0 ||
      p.plan.statnIdBackfill.length > 0 ||
      p.plan.realtimeNameUpdate.length > 0,
  );

  const lines: string[] = [];
  const w = (s = ''): void => {
    lines.push(s);
  };
  w(`=== 호선 매핑 보정 리포트 (${APPLY ? 'apply' : 'dry-run'}) ${new Date().toISOString()} ===`);
  w(`역 ${stations.length}행 / 그룹 ${groupInfos.length}개 / 관측 콜 ${totalCalls}${cacheLoaded ? ' (캐시)' : ''}`);
  w('');
  w('[요약]');
  w(`  변경 있는 그룹: ${changedGroups.length}`);
  w(`  extra(삭제 대상 행): ${allExtra.length}`);
  w(`  missing(생성 대상 행): ${allMissing.length}`);
  w(`  statnId backfill: ${allBackfill.length}`);
  w(`  realtimeName 기록: ${allRealtimeName.length}`);
  w(`  빈 결과(보정 skip): ${emptyGroups.length}`);
  w(`  unmatched(관측이 그룹과 불일치 — 동명이역/해당역 미관측, 리포트만): ${unmatchedGroups.length}`);
  w(`  관측 실패/미관측: ${observeErrors.length + unobserved.length}`);
  w('');
  w('[EXTRA — DB에 있으나 관측에 없음 → 삭제 대상]');
  for (const e of allExtra) w(`  ${e.group}: ${e.lineId} ${subwayLineName(e.lineId)} (${e.id})`);
  w('');
  w('[MISSING — 관측에 있으나 DB에 없음 → 생성 대상]');
  for (const m of allMissing) w(`  ${m.name}: ${m.lineId} ${m.lineName} (statnId=${m.statnId ?? '없음'})`);
  w('');
  w('[REALTIME NAME — 병기형 재시도로 조회명 확정]');
  for (const p of plans.filter((x) => x.plan.realtimeNameUpdate.length > 0)) {
    const rt = p.plan.realtimeNameUpdate[0]!.realtimeName;
    w(`  ${p.gi.name} → '${rt}' (${p.plan.realtimeNameUpdate.length}행)`);
  }
  w('');
  w('[UNMATCHED — 관측이 그룹 노선과 불일치(동명이역/해당역 미관측), 기존 매핑 유지]');
  for (const g of unmatchedGroups) w(`  ${g.name} (DB lineIds=${[...g.lineIds].sort().join(',')})`);
  w('');
  w('[EMPTY — 서울 밖/운행종료 등 관측 없음, 기존 매핑 유지]');
  for (const g of emptyGroups) w(`  ${g.name} (${[...g.lineIds].sort().join(',')})`);
  w('');
  if (observeErrors.length > 0) {
    w('[OBSERVE ERROR]');
    for (const e of observeErrors) w(`  ${e.name}: ${e.message}`);
    w('');
  }
  w('[STATNID BACKFILL — 호선별 건수]');
  {
    const byLine = new Map<string, number>();
    for (const b of allBackfill) byLine.set(b.lineId, (byLine.get(b.lineId) ?? 0) + 1);
    for (const [l, n] of [...byLine.entries()].sort()) w(`  ${l} ${subwayLineName(l)}: ${n}행`);
  }

  const report = lines.join('\n');
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(REPORT_FILE, report + '\n', 'utf8');

  // 콘솔엔 요약만(전문은 파일).
  console.log('');
  console.log(lines.slice(0, lines.indexOf('[EXTRA — DB에 있으나 관측에 없음 → 삭제 대상]')).join('\n'));
  console.log(`리포트 전문 → ${REPORT_FILE}`);

  // ── 적용 ──────────────────────────────────────────────────────────────────
  if (!APPLY) {
    console.log('\ndry-run — DB 미변경. 적용하려면 --apply.');
    return;
  }

  // 조건 1: extra 삭제는 화이트리스트만. 나머지(신촌 1063 등)는 유지 + 로그.
  const extraToDelete = allExtra.filter((e) => EXTRA_DELETE_WHITELIST.has(e.id));
  const extraKept = allExtra.filter((e) => !EXTRA_DELETE_WHITELIST.has(e.id));

  // 관측 캐시에서 (groupId, lineId) 의 statnId 를 뽑는다(수동 보정용).
  const statnIdFromCache = (groupId: string, lineId: string): string | null => {
    const obs = observations.get(groupId);
    if (!obs) return null;
    for (const c of parseArrivalClusters(obs.rows)) {
      const s = c.lineToStatnId.get(lineId);
      if (s) return s;
    }
    return null;
  };

  // 조건 3: 수동 보정 계획 (1001→1063 재라벨).
  const manualFixes = MANUAL_FIXES.map((f) => {
    const oldId = `${f.fromLineId}:${f.name}`;
    const src = byId.get(oldId);
    return {
      oldId,
      newId: `${f.toLineId}:${f.name}`,
      name: f.name,
      toLineId: f.toLineId,
      statnId: statnIdFromCache(oldId, f.toLineId),
      lat: src?.lat ?? null,
      lng: src?.lng ?? null,
      present: !!src,
    };
  });
  const manualFixable = manualFixes.filter((m) => m.present && m.lat !== null && m.lng !== null);

  // 조건 2: 신촌 1063 realtimeName 프로브 (병기형 1~2콜). 1063 이 오면 realtimeName +
  // statnId 기록. 실패하면 행 유지(변경 없음).
  let sinchonUpdate: { id: string; realtimeName: string; statnId: string | null } | null = null;
  if (byId.has('1063:신촌')) {
    for (const q of ['신촌(경의중앙선)', '신촌(경의중앙)']) {
      let rows: ObservedRow[];
      try {
        rows = (await getRealtimeArrivals(q, { apiKey })).map(toObservedRow);
      } catch (e) {
        if (e instanceof SubwayApiAuthError) throw e;
        continue;
      }
      await sleep(DELAY_MS);
      const c1063 = parseArrivalClusters(rows).find((c) => c.lineIds.includes('1063'));
      if (c1063) {
        sinchonUpdate = {
          id: '1063:신촌',
          realtimeName: q,
          statnId: c1063.lineToStatnId.get('1063') ?? null,
        };
        break;
      }
    }
    console.log(
      sinchonUpdate
        ? `신촌 프로브 성공 — 1063:신촌 realtimeName='${sinchonUpdate.realtimeName}' statnId=${sinchonUpdate.statnId ?? '없음'}`
        : '신촌 프로브 실패 — 1063:신촌 유지(변경 없음)',
    );
  }

  console.log('\n--apply — DB 반영 중...');
  await prisma.$transaction(async (tx) => {
    // 생성(멱등 upsert) — missing 필터 통과분.
    for (const m of allMissing) {
      await tx.subwayStation.upsert({
        where: { id: m.id },
        create: {
          id: m.id,
          name: m.name,
          realtimeName: m.realtimeName,
          lineId: m.lineId,
          lineName: m.lineName,
          statnId: m.statnId,
          lat: m.lat,
          lng: m.lng,
        },
        update: { statnId: m.statnId, realtimeName: m.realtimeName },
      });
    }
    // 수동 보정 — 1063 행 생성(멱등).
    for (const m of manualFixable) {
      await tx.subwayStation.upsert({
        where: { id: m.newId },
        create: {
          id: m.newId,
          name: m.name,
          realtimeName: null,
          lineId: m.toLineId,
          lineName: subwayLineName(m.toLineId),
          statnId: m.statnId,
          lat: m.lat!,
          lng: m.lng!,
        },
        update: { statnId: m.statnId },
      });
    }
    for (const b of allBackfill) {
      await tx.subwayStation.update({ where: { id: b.id }, data: { statnId: b.statnId } });
    }
    for (const r of allRealtimeName) {
      await tx.subwayStation.update({ where: { id: r.id }, data: { realtimeName: r.realtimeName } });
    }
    if (sinchonUpdate) {
      await tx.subwayStation.update({
        where: { id: sinchonUpdate.id },
        data: {
          realtimeName: sinchonUpdate.realtimeName,
          ...(sinchonUpdate.statnId ? { statnId: sinchonUpdate.statnId } : {}),
        },
      });
    }
    // 삭제 — 화이트리스트 extra + 수동 보정의 옛 1001 행.
    const deleteIds = [...extraToDelete.map((e) => e.id), ...manualFixable.map((m) => m.oldId)];
    if (deleteIds.length > 0) {
      await tx.subwayStation.deleteMany({ where: { id: { in: deleteIds } } });
    }
  });

  const createdCount = allMissing.length + manualFixable.length;
  const deletedCount = extraToDelete.length + manualFixable.length;
  const realtimeCount = allRealtimeName.length + (sinchonUpdate ? 1 : 0);
  console.log('\n=== 적용 완료 ===');
  console.log(`  생성: ${createdCount} (missing ${allMissing.length} + 수동보정 ${manualFixable.length})`);
  console.log(`  삭제: ${deletedCount} (화이트리스트 extra ${extraToDelete.length} + 수동보정 옛행 ${manualFixable.length})`);
  console.log(`  statnId 갱신: ${allBackfill.length}`);
  console.log(`  realtimeName 갱신: ${realtimeCount} (자동 ${allRealtimeName.length}${sinchonUpdate ? ' + 신촌 1' : ''})`);
  console.log(`  삭제 보류(화이트리스트 밖 extra): ${extraKept.length}${extraKept.length ? ` [${extraKept.map((e) => e.id).join(', ')}]` : ''}`);
  if (manualFixes.length !== manualFixable.length) {
    console.warn(`  주의: 수동보정 ${manualFixes.length - manualFixable.length}건이 DB/좌표 부재로 skip.`);
  }
};

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
