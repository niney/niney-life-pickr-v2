// 집값 단지 좌표 보완 — 지번 지오코딩에 실패해 lat 이 비어 있는 아파트 단지를 다시 시도한다. 후보는
// ① 도로명주소(공시가격·K-apt·건축물대장 보강으로 채워진 roadAddr) → ② 지번 주소 원문 → ③ 지번 변형
// ('0578-0005'→'578-5' 정규화, '산' 접두 유무, 부번 제거 — 마지막 것은 같은 본번 필지라 수십 m 오차 감수)
// 순. 실제 호출·캐시는 life-map-geocode.service 의 geocodeLifeRows(LifeGeocodeCache 공유) 그대로 —
// roadAddr/lotAddr 를 넣으면 lifeAddressCandidates 가 도로명→지번→정제본 후보를 만들어 주므로 1단계는 한
// 번의 일괄 호출이고, 지번 변형은 못 맞춘 단지만 골라 단계별로 다시 돌린다(변형마다 호출이 나가므로).

import type { PrismaClient } from '@prisma/client';
import {
  geocodeLifeRows,
  type GeocodeAddressType,
  type GeocodeBatchOptions,
  type GeocodeBatchReport,
} from '../life-map/life-map-geocode.service.js';
import { housingJibunKey } from './housing-derived.service.js';

const UPDATE_CHUNK = 200;

export interface HousingGeocodeOptions {
  geocode: GeocodeBatchOptions;
  // 지번 변형 단계를 건너뛴다(도로명·원문만).
  skipVariants?: boolean;
  log?: (msg: string) => void;
}

export interface HousingGeocodeReport {
  targets: number;
  // 좌표를 채운 단지(단계별).
  resolved: number;
  resolvedByVariant: number;
  unresolved: number;
  // 호출 상한·오프라인·중단으로 시도 못 한 단지.
  skipped: number;
  apiCalls: number;
  stoppedBy: string | null;
  passes: GeocodeBatchReport[];
}

// 지번 변형 후보(원문 제외, 순서 = 시도 순). '산' 은 임야 지번 접두.
export const housingJibunVariants = (jibun: string | null | undefined): string[] => {
  const raw = (jibun ?? '').replace(/\s+/g, '');
  if (!raw) return [];
  const out: string[] = [];
  const push = (v: string): void => {
    if (v && v !== raw && !out.includes(v)) out.push(v);
  };
  const key = housingJibunKey(raw);
  push(key);
  const bare = key.replace(/^산/, '');
  if (!bare) return out;
  push(key.startsWith('산') ? bare : `산${bare}`);
  const main = bare.replace(/-\d+$/, '');
  if (main !== bare) {
    push(key.startsWith('산') ? `산${main}` : main);
  }
  return out;
};

interface Target {
  id: string;
  addr: string;
  roadAddr: string | null;
  jibun: string | null;
  sido: string;
  sgg: string;
  umd: string;
}
interface GeoRow {
  roadAddr: string | null;
  lotAddr: string | null;
  lat: number | null;
  lng: number | null;
  geoSource: GeocodeAddressType | null;
}

const applyResolved = async (prisma: PrismaClient, hits: { id: string; row: GeoRow }[]): Promise<void> => {
  for (let i = 0; i < hits.length; i += UPDATE_CHUNK) {
    await prisma.$transaction(
      hits.slice(i, i + UPDATE_CHUNK).map(({ id, row }) =>
        prisma.housingComplex.update({ where: { id }, data: { lat: row.lat, lng: row.lng, geoSource: row.geoSource } }),
      ),
    );
  }
};

export const geocodeMissingHousingComplexes = async (prisma: PrismaClient, opts: HousingGeocodeOptions): Promise<HousingGeocodeReport> => {
  const log = opts.log ?? (() => {});
  const targets: Target[] = await prisma.housingComplex.findMany({
    where: { kind: 'apt', lat: null },
    select: { id: true, addr: true, roadAddr: true, jibun: true, sido: true, sgg: true, umd: true },
    orderBy: { id: 'asc' },
  });
  const report: HousingGeocodeReport = {
    targets: targets.length,
    resolved: 0,
    resolvedByVariant: 0,
    unresolved: 0,
    skipped: 0,
    apiCalls: 0,
    stoppedBy: null,
    passes: [],
  };
  if (targets.length === 0) return report;

  // 남은 호출 예산 — 단계마다 줄여 넘긴다. 키·한도 오류(hardStop)는 다음 단계를 막지만, 오프라인은
  // 캐시에 변형 주소가 있을 수 있으므로 단계를 계속 돈다(호출은 어차피 0).
  let budget = opts.geocode.maxCalls ?? Number.POSITIVE_INFINITY;
  let hardStop: string | null = null;
  const runPass = async (items: { id: string; row: GeoRow }[], label: string): Promise<Set<string>> => {
    const rows = items.map((i) => i.row);
    const r = await geocodeLifeRows(prisma, rows, { ...opts.geocode, maxCalls: Number.isFinite(budget) ? budget : undefined });
    report.passes.push(r);
    report.apiCalls += r.apiCalls;
    report.skipped += r.skipped;
    budget -= r.apiCalls;
    const hits = items.filter((i) => i.row.lat !== null && i.row.lng !== null);
    await applyResolved(prisma, hits);
    log(`${label}: 대상 ${items.length} · 확보 ${hits.length} · 호출 ${r.apiCalls}${r.stoppedBy ? ` · 중단 ${r.stoppedBy}` : ''}`);
    if (r.stoppedBy && r.stoppedBy !== 'offline') hardStop = r.stoppedBy;
    return new Set(hits.map((h) => h.id));
  };

  // ① 도로명 → 지번 원문(+정제본).
  let pending = targets;
  const first = await runPass(
    pending.map((t) => ({ id: t.id, row: { roadAddr: t.roadAddr, lotAddr: t.addr, lat: null, lng: null, geoSource: null } })),
    '도로명·지번',
  );
  report.resolved += first.size;
  pending = pending.filter((t) => !first.has(t.id));

  // ② 지번 변형 — 단계별(변형 순서)로 남은 단지만.
  if (!opts.skipVariants && pending.length > 0 && !hardStop) {
    const maxTiers = Math.max(0, ...pending.map((t) => housingJibunVariants(t.jibun).length));
    for (let tier = 0; tier < maxTiers && pending.length > 0 && !hardStop; tier += 1) {
      const items = pending.flatMap((t) => {
        const v = housingJibunVariants(t.jibun)[tier];
        if (!v) return [];
        const lotAddr = [t.sido, t.sgg, t.umd, v].filter(Boolean).join(' ');
        return [{ id: t.id, row: { roadAddr: null, lotAddr, lat: null, lng: null, geoSource: null } as GeoRow }];
      });
      if (items.length === 0) continue;
      const hits = await runPass(items, `지번 변형 ${tier + 1}단계`);
      report.resolved += hits.size;
      report.resolvedByVariant += hits.size;
      pending = pending.filter((t) => !hits.has(t.id));
    }
  }
  // 남은 단지는 전부 미해결로 센다(skipped 는 "시도 못 한 행" 정보값 — 오프라인·상한이면 다음 실행이 이어간다).
  report.unresolved = pending.length;
  report.stoppedBy = hardStop ?? (opts.geocode.offline && pending.length > 0 ? 'offline' : null);
  await prisma.housingSync.create({ data: { kind: 'geocode', count: targets.length, geocoded: report.resolved } });
  return report;
};
