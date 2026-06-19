import { PrismaClient } from '@prisma/client';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

// 글로벌 머지 결과 골든셋 스냅샷 / 비교 — 머지 알고리즘 변경의 무손실을
// 객관적으로 검증하기 위한 도구. 기존 1125개 링크가 "유일한 LLM 기준 정답"
// 이므로, 변경 전 스냅샷을 떠 두고 변경 후 머지를 다시 돌린 결과와 diff 한다.
//
// 실행:
//   pnpm --filter friendly snapshot:merge                 # 현재 DB → data/golden-<ts>.json
//   pnpm --filter friendly snapshot:merge -- out.json     # 경로 지정 저장
//   pnpm --filter friendly snapshot:merge -- --diff a.json b.json   # 두 스냅샷 비교
//
// diff 가 보는 회귀:
//   - 그룹(globalKey) 추가/삭제
//   - norm → globalKey 재매핑 (과병합/과분리 후보)
//   - 그룹 categoryPath 변경
// 정확도 무손실 변경(DB 스트리밍·재시도·락)은 diff 가 비어야 정상.

interface Snapshot {
  takenAt: string;
  summary: {
    groups: number;
    links: number;
    withPath: number;
    topLevelDist: Record<string, number>;
  };
  // globalKey → 그룹 메타
  groups: Record<string, { displayName: string; categoryPath: string | null; linkCount: number }>;
  // localCanonicalNorm → globalKey (같은 norm 이 여러 그룹이면 마지막이 이김 — 정상이면 함수적)
  normToKey: Record<string, string>;
}

const topLevelOf = (path: string | null): string => {
  if (!path) return '(none)';
  const first = path.split('>')[0];
  return (first ?? '').trim() || '(none)';
};

const takeSnapshot = async (prisma: PrismaClient): Promise<Snapshot> => {
  const groupsRows = await prisma.globalMenuCanonical.findMany({
    select: { id: true, globalKey: true, displayName: true, categoryPath: true },
  });
  const links = await prisma.globalMenuCanonicalLink.findMany({
    select: { localCanonicalNorm: true, globalCanonicalId: true },
  });

  const idToKey = new Map<string, string>();
  const groups: Snapshot['groups'] = {};
  const topLevelDist: Record<string, number> = {};
  for (const g of groupsRows) {
    idToKey.set(g.id, g.globalKey);
    groups[g.globalKey] = { displayName: g.displayName, categoryPath: g.categoryPath, linkCount: 0 };
    const tl = topLevelOf(g.categoryPath);
    topLevelDist[tl] = (topLevelDist[tl] ?? 0) + 1;
  }

  const normToKey: Snapshot['normToKey'] = {};
  for (const l of links) {
    const key = idToKey.get(l.globalCanonicalId);
    if (!key) continue;
    normToKey[l.localCanonicalNorm] = key;
    if (groups[key]) groups[key]!.linkCount += 1;
  }

  const withPath = groupsRows.filter((g) => g.categoryPath).length;
  return {
    takenAt: new Date().toISOString(),
    summary: { groups: groupsRows.length, links: links.length, withPath, topLevelDist },
    groups,
    normToKey,
  };
};

const diff = (a: Snapshot, b: Snapshot): void => {
  const keysA = new Set(Object.keys(a.groups));
  const keysB = new Set(Object.keys(b.groups));
  const added = [...keysB].filter((k) => !keysA.has(k));
  const removed = [...keysA].filter((k) => !keysB.has(k));

  // norm 재매핑 — 같은 norm 이 다른 globalKey 로.
  const remapped: { norm: string; before: string; after: string }[] = [];
  for (const [norm, beforeKey] of Object.entries(a.normToKey)) {
    const afterKey = b.normToKey[norm];
    if (afterKey !== undefined && afterKey !== beforeKey) {
      remapped.push({ norm, before: beforeKey, after: afterKey });
    }
  }

  // categoryPath 변경된(양쪽에 존재하는) 그룹.
  const pathChanged: { key: string; before: string | null; after: string | null }[] = [];
  for (const k of keysA) {
    if (!keysB.has(k)) continue;
    const bp = a.groups[k]!.categoryPath;
    const ap = b.groups[k]!.categoryPath;
    if (bp !== ap) pathChanged.push({ key: k, before: bp, after: ap });
  }

  console.log('\n=== 골든셋 비교 ===');
  console.log(`A: ${a.takenAt}  groups=${a.summary.groups} links=${a.summary.links} withPath=${a.summary.withPath}`);
  console.log(`B: ${b.takenAt}  groups=${b.summary.groups} links=${b.summary.links} withPath=${b.summary.withPath}`);
  console.log(`\n그룹 추가 ${added.length} · 삭제 ${removed.length}`);
  console.log(`norm 재매핑 ${remapped.length} · categoryPath 변경 ${pathChanged.length}`);

  const show = <T>(label: string, arr: T[], fmt: (x: T) => string, cap = 40): void => {
    if (arr.length === 0) return;
    console.log(`\n[${label}] (${arr.length}${arr.length > cap ? `, 상위 ${cap}` : ''})`);
    for (const x of arr.slice(0, cap)) console.log(`  ${fmt(x)}`);
  };
  show('그룹 추가', added, (k) => `${k}  (${b.groups[k]!.displayName})`);
  show('그룹 삭제', removed, (k) => `${k}  (${a.groups[k]!.displayName})`);
  show('norm 재매핑', remapped, (r) => `${r.norm}: ${r.before} → ${r.after}`);
  show('categoryPath 변경', pathChanged, (p) => `${p.key}: ${p.before ?? '(none)'} → ${p.after ?? '(none)'}`);

  const clean = added.length === 0 && removed.length === 0 && remapped.length === 0 && pathChanged.length === 0;
  console.log(`\n판정: ${clean ? '✅ 무변화 (무손실 확인)' : '⚠️ 차이 있음 — 위 항목이 회귀인지 개선인지 검토'}\n`);
};

const main = async (): Promise<void> => {
  const args = process.argv.slice(2);

  if (args[0] === '--diff') {
    const [, pathA, pathB] = args;
    if (!pathA || !pathB) {
      console.error('사용법: snapshot:merge -- --diff <before.json> <after.json>');
      process.exit(1);
    }
    const a = JSON.parse(readFileSync(resolve(pathA), 'utf8')) as Snapshot;
    const b = JSON.parse(readFileSync(resolve(pathB), 'utf8')) as Snapshot;
    diff(a, b);
    return;
  }

  const prisma = new PrismaClient();
  const snap = await takeSnapshot(prisma);
  await prisma.$disconnect();

  const ts = snap.takenAt.replace(/[:.]/g, '-');
  const out = args[0] ? resolve(args[0]) : resolve('data', `golden-${ts}.json`);
  mkdirSync(resolve(out, '..'), { recursive: true });
  writeFileSync(out, JSON.stringify(snap, null, 2), 'utf8');
  console.log(
    `\n스냅샷 저장: ${out}\n  groups=${snap.summary.groups} links=${snap.summary.links} withPath=${snap.summary.withPath}`,
  );
  console.log('  최상위 분포:', snap.summary.topLevelDist, '\n');
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
