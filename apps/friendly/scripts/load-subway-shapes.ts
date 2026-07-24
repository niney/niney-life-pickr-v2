// 노선 실형상(OSM 선로 기하) 적재 — Overpass 에서 노선별 route relation 을 받아
// way 체인을 조립하고 SubwayLineStation section 역들을 투영(anchor)해
// SubwayLineShape 를 채운다. 순수 조립/anchor 로직은 subway-shape.service.ts.
//
// 실행: pnpm --filter friendly load:subway-shapes [--dry-run] [--line 1002,1005]
//   --dry-run: Overpass 조회 + 판정 리포트만(DB 미변경).
//   --line:    지정 lineId 만(쉼표 구분) — 반복 튜닝용.
//
// 키 불필요(Overpass 공개 API). 빌드타임 1회성 — 런타임 의존 없음. 산출물은
// ODbL(© OpenStreetMap contributors) — FE 표기는 지도 화면 attribution 에서.
import { PrismaClient } from '@prisma/client';
import {
  createRoutePathIndex,
  projectOnRoutePath,
  subwayLineName,
  type LatLng,
} from '@repo/utils';
import {
  anchorStations,
  assembleChain,
  STATION_MAX_DIST_M,
  type AnchoredShape,
} from '../src/modules/subway/subway-shape.service.js';
import { isLoopSection } from '../src/modules/subway/subway-line-order.service.js';

const DRY_RUN = process.argv.includes('--dry-run');
const lineArgIdx = process.argv.indexOf('--line');
const ONLY_LINES: Set<string> | null =
  lineArgIdx !== -1 && process.argv[lineArgIdx + 1]
    ? new Set(process.argv[lineArgIdx + 1]!.split(','))
    : null;

const OVERPASS_URL = process.env.OVERPASS_URL ?? 'https://overpass-api.de/api/interpreter';
const UA = 'niney-life-pickr load-subway-shapes/1.0';
// 수도권 전철 권역(연천~신창·문산~춘천) — 후보 relation 태그 조회 bbox.
const BBOX = '36.6,126.0,38.4,128.3';

// lineId → OSM relation name 매칭 패턴. 이름은 후보 축소용일 뿐 — 최종 채택은
// section 역 전부가 형상 근접(STATION_MAX_DIST_M)하는지 커버리지로 판정한다.
const LINE_OSM_PATTERNS: Record<string, RegExp> = {
  '1001': /1호선/,
  '1002': /2호선/,
  '1003': /3호선/,
  '1004': /4호선/,
  '1005': /5호선/,
  '1006': /6호선/,
  '1007': /7호선/,
  '1008': /8호선/,
  '1009': /9호선/,
  '1032': /GTX|광역급행/i,
  '1063': /경의|중앙선/,
  '1065': /공항\s?철도|공항선|AREX/i,
  '1067': /경춘/,
  '1075': /수인|분당/,
  '1077': /신분당/,
  '1081': /경강/,
  '1092': /우이신설/,
  '1093': /서해/,
  '1094': /신림/,
};
// 타 도시·경전철 오매칭 배제(이름 기준) — bbox 안에 있어도 후보에서 뺀다.
const EXCLUDE_NAME = /인천\s*[12]호선|인천도시철도|의정부|에버라인|용인경전철|김포\s*골드/;

interface OsmRelTag {
  id: number;
  tags?: Record<string, string>;
}
interface OsmRelGeom {
  id: number;
  members?: {
    type: string;
    role: string;
    ref?: number;
    geometry?: { lat: number; lon: number }[];
  }[];
}

interface RelWay {
  ref: number;
  pts: LatLng[];
}

const overpass = async <T>(query: string): Promise<T[]> => {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
    });
    if (res.ok) {
      const json = (await res.json()) as { elements?: T[] };
      return json.elements ?? [];
    }
    if (attempt >= 2) throw new Error(`Overpass ${res.status}: ${(await res.text()).slice(0, 200)}`);
    // 과부하(429/504) 백오프 재시도.
    await new Promise((r) => setTimeout(r, 15_000 * (attempt + 1)));
  }
};

const relName = (r: OsmRelTag): string => r.tags?.name ?? r.tags?.ref ?? String(r.id);

const prisma = new PrismaClient();

interface Section {
  lineId: string;
  branchKey: string;
  isLoop: boolean;
  stations: LatLng[];
}

interface SectionResult {
  section: Section;
  relId: number;
  relLabel: string;
  shape: AnchoredShape;
  bridges: number;
  unusedWays: number;
}

const main = async (): Promise<void> => {
  console.log(`\n=== 노선 실형상(OSM) 적재 ${DRY_RUN ? '(--dry-run)' : ''} ===\n`);

  // ── DB section 로드 (getLineDetail 조립과 동일 소스: 순서 + 좌표 조인) ──────
  const lineRows = await prisma.subwayLineStation.findMany({
    orderBy: [{ lineId: 'asc' }, { branchKey: 'asc' }, { seq: 'asc' }],
  });
  if (lineRows.length === 0) {
    console.error('SubwayLineStation 이 비어 있습니다 — load:subway-line-orders 먼저 실행하세요.');
    process.exitCode = 1;
    return;
  }
  const stationIds = [...new Set(lineRows.map((r) => r.stationId))];
  const stations = await prisma.subwayStation.findMany({ where: { id: { in: stationIds } } });
  const coordById = new Map(stations.map((s) => [s.id, { lat: s.lat, lng: s.lng }]));

  const sections: Section[] = [];
  {
    const byKey = new Map<string, Section>();
    for (const r of lineRows) {
      if (ONLY_LINES && !ONLY_LINES.has(r.lineId)) continue;
      const coord = coordById.get(r.stationId);
      if (!coord) continue;
      const key = `${r.lineId}:${r.branchKey}`;
      let sec = byKey.get(key);
      if (!sec) {
        sec = {
          lineId: r.lineId,
          branchKey: r.branchKey,
          isLoop: isLoopSection(r.lineId, r.branchKey),
          stations: [],
        };
        byKey.set(key, sec);
        sections.push(sec);
      }
      sec.stations.push(coord);
    }
  }
  const targetSections = sections.filter((s) => s.stations.length >= 2);
  console.log(`대상 section: ${targetSections.length}개 (노선 ${new Set(targetSections.map((s) => s.lineId)).size}개)\n`);

  // ── Overpass 후보 태그 1콜 ──────────────────────────────────────────────────
  const tagRels = await overpass<OsmRelTag>(
    `[out:json][timeout:60];relation["route"~"^(subway|light_rail|train|monorail)$"](${BBOX});out tags;`,
  );
  console.log(`Overpass 후보 relation: ${tagRels.length}개 수신`);

  const lineIds = [...new Set(targetSections.map((s) => s.lineId))].sort();
  const candidatesByLine = new Map<string, OsmRelTag[]>();
  for (const lineId of lineIds) {
    const pat = LINE_OSM_PATTERNS[lineId];
    if (!pat) {
      candidatesByLine.set(lineId, []);
      continue;
    }
    candidatesByLine.set(
      lineId,
      tagRels.filter((r) => {
        const name = relName(r);
        return pat.test(name) && !EXCLUDE_NAME.test(name);
      }),
    );
  }

  // ── relation 기하 — 노선 단위 배치 fetch + 캐시 ─────────────────────────────
  const geomCache = new Map<number, RelWay[]>();
  const fetchGeoms = async (relIds: number[]): Promise<void> => {
    const need = relIds.filter((id) => !geomCache.has(id));
    if (need.length === 0) return;
    const rels = await overpass<OsmRelGeom>(
      `[out:json][timeout:90];relation(id:${need.join(',')});out geom;`,
    );
    for (const rel of rels) {
      // 선로 way 만 — 승강장(platform)·정차점(stop) member 제외. 선로 role 은
      // ''(통상) 또는 forward/backward(단선 왕복 구간 — 임진강 셔틀 실측).
      const ways = (rel.members ?? [])
        .filter(
          (m) =>
            m.type === 'way' &&
            (m.role === '' || m.role === 'forward' || m.role === 'backward') &&
            (m.geometry?.length ?? 0) >= 2,
        )
        .map((m) => ({
          ref: m.ref ?? 0,
          pts: m.geometry!.map((g) => ({ lat: g.lat, lng: g.lon })),
        }));
      geomCache.set(rel.id, ways);
    }
    for (const id of need) if (!geomCache.has(id)) geomCache.set(id, []);
    await new Promise((r) => setTimeout(r, 1_000)); // Overpass 예의상 간격.
  };

  // ── section 별 후보 평가 — 커버리지 통과 후보 중 mean dist 최소 채택 ────────
  const results: SectionResult[] = [];
  const failed: { section: Section; reason: string }[] = [];

  for (const lineId of lineIds) {
    const cands = candidatesByLine.get(lineId) ?? [];
    const lineSections = targetSections.filter((s) => s.lineId === lineId);
    if (cands.length === 0) {
      for (const sec of lineSections) failed.push({ section: sec, reason: '이름 매칭 후보 없음' });
      continue;
    }
    await fetchGeoms(cands.map((c) => c.id));

    for (const sec of lineSections) {
      let best: SectionResult | null = null;
      const rejects: string[] = [];
      for (const cand of cands) {
        const ways = geomCache.get(cand.id) ?? [];
        const chain = assembleChain(ways.map((w) => w.pts));
        if (!chain) {
          rejects.push(`rel ${cand.id}(${relName(cand)}): way 없음`);
          continue;
        }
        const shape = anchorStations(chain.pts, sec.stations, sec.isLoop);
        if (!shape.ok) {
          rejects.push(
            `rel ${cand.id}(${relName(cand)}): ${shape.reason}` +
              `${chain.unusedWays ? ` [잔여way=${chain.unusedWays}]` : ''}` +
              `${chain.bridges ? ` [브리지=${chain.bridges}]` : ''}`,
          );
          continue;
        }
        if (!best || shape.meanDistM < best.shape.meanDistM) {
          best = {
            section: sec,
            relId: cand.id,
            relLabel: relName(cand),
            shape,
            bridges: chain.bridges,
            unusedWays: chain.unusedWays,
          };
        }
      }
      if (!best && cands.length >= 2) {
        // ── union 폴백 — 단일 운행계통이 구간 전체를 안 덮는 노선(4호선
        //    진접~오이도, 경의선 문산~임진강 등)은 relation 들의 way 를 합쳐
        //    조립한다. 전 후보를 다 합치면 방향별 평행 트랙이 섞여 오조립되므로
        //    1차로 역 커버리지 상호보완 조합(set-cover: 최다 커버 backbone +
        //    미커버 역을 채우는 후보만)을, 실패 시 2차로 way 총량 상위 backbone
        //    을 돌며 전체 pool 을 시도한다. 오조립은 anchor 검증이 걸러낸다.
        const tryUnion = (picked: OsmRelTag[], label: string): boolean => {
          const seen = new Set<number>();
          const pool: LatLng[][] = [];
          for (const cand of picked) {
            for (const w of geomCache.get(cand.id) ?? []) {
              if (w.ref !== 0 && seen.has(w.ref)) continue;
              seen.add(w.ref);
              pool.push(w.pts);
            }
          }
          const chain = assembleChain(pool);
          if (!chain) return false;
          const shape = anchorStations(chain.pts, sec.stations, sec.isLoop);
          if (!shape.ok) {
            rejects.push(`${label}: ${shape.reason}`);
            return false;
          }
          best = {
            section: sec,
            relId: 0,
            relLabel: label,
            shape,
            bridges: chain.bridges,
            unusedWays: chain.unusedWays,
          };
          return true;
        };

        // 후보별 자체 체인의 역 커버리지(임계 이내 여부).
        const coverage = new Map<number, boolean[]>();
        for (const cand of cands) {
          const chain = assembleChain((geomCache.get(cand.id) ?? []).map((w) => w.pts));
          const index = chain ? createRoutePathIndex(chain.pts) : null;
          coverage.set(
            cand.id,
            sec.stations.map(
              (st) => index !== null && projectOnRoutePath(index, st).distM <= STATION_MAX_DIST_M,
            ),
          );
        }
        const covCount = (c: OsmRelTag): number =>
          coverage.get(c.id)!.reduce((n, b) => n + (b ? 1 : 0), 0);
        const ranked = [...cands].sort((a, b) => covCount(b) - covCount(a));
        const picked: OsmRelTag[] = [ranked[0]!];
        const covered = [...coverage.get(ranked[0]!.id)!];
        const pickedRefs = new Set((geomCache.get(ranked[0]!.id) ?? []).map((w) => w.ref));
        // 미커버 역이 남는 동안 보완 후보 추가 — 방향별 평행 트랙 오조립을 줄이려
        // pool 과 way 를 가장 많이 공유(=같은 방향 트랙)하는 후보를 우선한다.
        while (!covered.every(Boolean)) {
          let bestCand: OsmRelTag | null = null;
          let bestShared = -1;
          let bestGain = 0;
          for (const cand of cands) {
            if (picked.includes(cand)) continue;
            const cov = coverage.get(cand.id)!;
            const gain = cov.filter((b, i) => b && !covered[i]).length;
            if (gain === 0) continue;
            const shared = (geomCache.get(cand.id) ?? []).filter((w) =>
              pickedRefs.has(w.ref),
            ).length;
            if (shared > bestShared || (shared === bestShared && gain > bestGain)) {
              bestCand = cand;
              bestShared = shared;
              bestGain = gain;
            }
          }
          if (!bestCand) break;
          picked.push(bestCand);
          coverage.get(bestCand.id)!.forEach((b, i) => {
            if (b) covered[i] = true;
          });
          for (const w of geomCache.get(bestCand.id) ?? []) pickedRefs.add(w.ref);
        }
        let done = covered.every(Boolean)
          ? tryUnion(picked, `union-cover(${picked.map((c) => c.id).join('+')})`)
          : false;

        if (!done) {
          const byLen = [...cands].sort(
            (a, b) =>
              (geomCache.get(b.id) ?? []).reduce((n, w) => n + w.pts.length, 0) -
              (geomCache.get(a.id) ?? []).reduce((n, w) => n + w.pts.length, 0),
          );
          for (const backbone of byLen.slice(0, 8)) {
            done = tryUnion(
              [backbone, ...cands.filter((c) => c !== backbone)],
              `union-all(${cands.length} rels, backbone ${backbone.id})`,
            );
            if (done) break;
          }
        }
      }
      if (best) results.push(best);
      else
        failed.push({
          section: sec,
          reason: `커버리지 미달:\n      ${rejects.join('\n      ')}`,
        });
    }
  }

  // ── 리포트 ──────────────────────────────────────────────────────────────────
  console.log('\n[section 별 판정]');
  for (const r of results) {
    const s = r.section;
    console.log(
      `  ✓ ${s.lineId}/${s.branchKey} ${subwayLineName(s.lineId)}${s.isLoop ? ' [순환]' : ''}: ` +
        `rel ${r.relId}(${r.relLabel}) pts=${r.shape.path.length} ` +
        `dist max=${Math.round(r.shape.maxDistM)}m mean=${Math.round(r.shape.meanDistM)}m` +
        `${r.bridges ? ` 브리지=${r.bridges}` : ''}${r.unusedWays ? ` 잔여way=${r.unusedWays}` : ''}`,
    );
  }
  if (failed.length) {
    console.log('\n[실패 — 직선 폴백 유지]');
    for (const f of failed) {
      console.log(`  ✗ ${f.section.lineId}/${f.section.branchKey} ${subwayLineName(f.section.lineId)}: ${f.reason}`);
    }
  }
  console.log(`\n성공 ${results.length} / 실패 ${failed.length} (전체 ${targetSections.length})`);

  if (DRY_RUN) {
    console.log('\n--dry-run — DB 미변경.');
    return;
  }

  // ── 적재 — 성공 section 만 upsert(실패 section 의 기존 형상은 보존) ─────────
  const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;
  for (const r of results) {
    const path = r.shape.path.map((p) => [round6(p.lat), round6(p.lng)]);
    const stationS = r.shape.stationS.map((s) => Math.round(s * 10) / 10);
    const osmRelationId = r.relId === 0 ? r.relLabel : String(r.relId);
    await prisma.subwayLineShape.upsert({
      where: {
        lineId_branchKey: { lineId: r.section.lineId, branchKey: r.section.branchKey },
      },
      create: {
        lineId: r.section.lineId,
        branchKey: r.section.branchKey,
        path: JSON.stringify(path),
        stationS: JSON.stringify(stationS),
        osmRelationId,
      },
      update: {
        path: JSON.stringify(path),
        stationS: JSON.stringify(stationS),
        osmRelationId,
        loadedAt: new Date(),
      },
    });
  }
  await prisma.subwayMasterSync.create({
    data: { source: 'line-shapes', count: results.length },
  });
  console.log('적재 완료 (SubwayMasterSync source=line-shapes 기록).');
};

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
