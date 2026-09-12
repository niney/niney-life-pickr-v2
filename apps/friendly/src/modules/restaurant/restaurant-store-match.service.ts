// 맛집(CanonicalRestaurant) ↔ 상가업소(LifeStore, 음식·카페) 매칭 — 좌표 근접(≤ 80m) + 상호 유사도(≥ 0.5)로
// 상가업소번호를 붙이고, 재적재본에서 그 업소가 사라지면 "폐업 의심"(status missing)으로 표시만 한다(공개 목록
// 은 그대로 — 매칭 실패와 진짜 폐업을 구분 못 하므로 어드민이 확인). 다시 나타나면 matched 로 돌아온다.
//
// 왜 좌표가 주인가: 상가 데이터의 상호는 사업자 등록명이라 간판(크롤 이름)과 자주 다르다("(주)○○푸드" vs
// "○○식당"). 그래서 반경 80m 후보 안에서만 이름을 비교하고, 완전일치/포함/바이그램 Dice 순으로 점수를 준다.
// 순수 점수 함수는 export 해 단위 테스트한다. 실행은 scripts/match-restaurant-stores.ts(적재 뒤 deploy.sh 가
// 호출) — 매칭 결과는 RestaurantStoreMatch(canonicalId 당 1행).

import type { PrismaClient, RestaurantStoreMatch } from '@prisma/client';
import type { RestaurantStoreInfoType } from '@repo/api-contract';
import {
  LIFE_STORE_RESTAURANT_KINDS,
  haversineM,
  lifeStoreDisplayName,
  normalizeLifeStoreName,
} from '@repo/utils';

// 후보 반경(m)과 후보 bbox 반폭(도) — bbox 는 넉넉히 ~110m, 실제 판정은 haversine.
export const STORE_MATCH_MAX_DIST_M = 80;
const BBOX_HALF_LAT = 0.001;
const BBOX_HALF_LNG = 0.00125;
export const STORE_MATCH_MIN_SCORE = 0.5;
const BATCH = 500;

// ── 상호 유사도 ─────────────────────────────────────────────────────────────
// 문자 바이그램 Dice 계수 — 짧은 한글 상호에 맞춰 음절 단위. 1글자 문자열은 유니그램으로.
export const bigramDice = (a: string, b: string): number => {
  if (a.length === 0 || b.length === 0) return 0;
  if (a === b) return 1;
  const grams = (s: string): Map<string, number> => {
    const m = new Map<string, number>();
    if (s.length === 1) {
      m.set(s, 1);
      return m;
    }
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      m.set(g, (m.get(g) ?? 0) + 1);
    }
    return m;
  };
  const ga = grams(a);
  const gb = grams(b);
  let inter = 0;
  let na = 0;
  let nb = 0;
  for (const v of ga.values()) na += v;
  for (const v of gb.values()) nb += v;
  for (const [g, v] of ga) inter += Math.min(v, gb.get(g) ?? 0);
  return (2 * inter) / (na + nb);
};

// 맛집 이름 ↔ 상가 상호(+지점명) 점수 0~1 — 정규화 후 완전일치 1, 한쪽이 다른 쪽을 포함(2자 이상) 0.85,
// 아니면 바이그램 Dice(상호만·상호+지점 중 큰 값).
export const storeNameScore = (restaurantName: string, storeName: string, branch: string | null): number => {
  const rn = normalizeLifeStoreName(restaurantName);
  const sn = normalizeLifeStoreName(storeName);
  const sb = normalizeLifeStoreName(lifeStoreDisplayName(storeName, branch));
  if (rn.length === 0 || sn.length === 0) return 0;
  if (rn === sn || rn === sb) return 1;
  if ((rn.length >= 2 && (sn.includes(rn) || sb.includes(rn))) || (sn.length >= 2 && rn.includes(sn))) return 0.85;
  return Math.max(bigramDice(rn, sn), bigramDice(rn, sb));
};

// ── 매칭 실행 ───────────────────────────────────────────────────────────────
export interface StoreMatchReport {
  // 좌표 있는 canonical 수.
  scanned: number;
  // 처음 붙은 것 / 다른 업소로 옮긴 것 / 그대로 유지 / 이번에 사라짐 / 계속 사라진 상태 / 사라졌다 돌아옴 / 미매칭.
  created: number;
  rematched: number;
  kept: number;
  newlyMissing: number;
  stillMissing: number;
  recovered: number;
  unmatched: number;
}

export interface StoreMatchOptions {
  dryRun?: boolean;
  now?: () => Date;
  onProgress?: (done: number, total: number) => void;
}

interface Candidate {
  id: string;
  name: string;
  branch: string | null;
  kind: string;
  sclsName: string;
  ksicName: string | null;
  distM: number;
  score: number;
}

export const matchRestaurantStores = async (prisma: PrismaClient, opts: StoreMatchOptions = {}): Promise<StoreMatchReport> => {
  const now = opts.now ?? (() => new Date());
  const report: StoreMatchReport = { scanned: 0, created: 0, rematched: 0, kept: 0, newlyMissing: 0, stillMissing: 0, recovered: 0, unmatched: 0 };
  const total = await prisma.canonicalRestaurant.count({ where: { latitude: { not: null }, longitude: { not: null } } });
  const existing = new Map<string, RestaurantStoreMatch>();
  for (const m of await prisma.restaurantStoreMatch.findMany()) existing.set(m.canonicalId, m);

  let cursor: string | undefined;
  for (;;) {
    const batch = await prisma.canonicalRestaurant.findMany({
      where: { latitude: { not: null }, longitude: { not: null } },
      select: { id: true, name: true, latitude: true, longitude: true },
      orderBy: { id: 'asc' },
      take: BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (batch.length === 0) break;
    for (const c of batch) {
      report.scanned += 1;
      const lat = c.latitude!;
      const lng = c.longitude!;
      const stores = await prisma.lifeStore.findMany({
        where: {
          kind: { in: [...LIFE_STORE_RESTAURANT_KINDS] },
          lat: { gte: lat - BBOX_HALF_LAT, lte: lat + BBOX_HALF_LAT },
          lng: { gte: lng - BBOX_HALF_LNG, lte: lng + BBOX_HALF_LNG },
        },
        select: { id: true, name: true, branch: true, kind: true, sclsName: true, ksicName: true, lat: true, lng: true },
      });
      const candidates: Candidate[] = [];
      for (const s of stores) {
        const distM = Math.round(haversineM({ lat, lng }, { lat: s.lat, lng: s.lng }));
        if (distM > STORE_MATCH_MAX_DIST_M) continue;
        const score = storeNameScore(c.name, s.name, s.branch);
        if (score < STORE_MATCH_MIN_SCORE) continue;
        candidates.push({ id: s.id, name: s.name, branch: s.branch, kind: s.kind, sclsName: s.sclsName, ksicName: s.ksicName, distM, score });
      }
      candidates.sort((a, b) => b.score - a.score || a.distM - b.distM);
      const prev = existing.get(c.id);
      // 이전 업소가 아직 후보 안에 있으면 그대로(안정성 — 더 높은 점수의 다른 업소가 생겨도 안 옮긴다).
      const best = (prev && candidates.find((k) => k.id === prev.bizesId)) ?? candidates[0] ?? null;
      const at = now();

      if (best) {
        const data = {
          bizesId: best.id,
          storeName: best.name,
          branch: best.branch,
          kind: best.kind,
          sclsName: best.sclsName,
          ksicName: best.ksicName,
          distM: best.distM,
          nameScore: Math.round(best.score * 1000) / 1000,
          status: 'matched',
          lastSeenAt: at,
          missingSince: null,
        };
        if (!prev) {
          report.created += 1;
          if (!opts.dryRun) await prisma.restaurantStoreMatch.create({ data: { canonicalId: c.id, ...data, matchedAt: at } });
        } else if (prev.bizesId !== best.id) {
          report.rematched += 1;
          if (!opts.dryRun) await prisma.restaurantStoreMatch.update({ where: { canonicalId: c.id }, data: { ...data, matchedAt: at } });
        } else {
          if (prev.status === 'missing') report.recovered += 1;
          else report.kept += 1;
          if (!opts.dryRun) await prisma.restaurantStoreMatch.update({ where: { canonicalId: c.id }, data });
        }
      } else if (prev) {
        if (prev.status === 'missing') report.stillMissing += 1;
        else {
          report.newlyMissing += 1;
          if (!opts.dryRun) await prisma.restaurantStoreMatch.update({ where: { canonicalId: c.id }, data: { status: 'missing', missingSince: at } });
        }
      } else {
        report.unmatched += 1;
      }
    }
    cursor = batch[batch.length - 1]!.id;
    opts.onProgress?.(report.scanned, total);
    if (batch.length < BATCH) break;
  }
  return report;
};

// ── 상세 응답용 ─────────────────────────────────────────────────────────────
// 최근 상가 적재 기준일(LifeMasterSync layer=store) — "YYYY-MM 기준 미확인" 문구용. 없으면 null.
export const getStoreBaseDate = async (prisma: PrismaClient): Promise<string | null> => {
  const s = await prisma.lifeMasterSync.findFirst({ where: { layer: 'store' }, orderBy: { loadedAt: 'desc' }, select: { baseDate: true } });
  return s?.baseDate ?? null;
};

export const toRestaurantStoreInfo = (m: RestaurantStoreMatch, baseDate: string | null): RestaurantStoreInfoType => ({
  bizesId: m.bizesId,
  name: m.storeName,
  branch: m.branch,
  kind: m.kind,
  industry: m.sclsName,
  ksicName: m.ksicName,
  distM: m.distM,
  nameScore: m.nameScore,
  closedSuspect: m.status === 'missing',
  missingSince: m.missingSince?.toISOString() ?? null,
  baseDate,
});

// canonical 의 매칭을 상세 응답 필드로 — 없으면 null. 두 상세(공개·어드민)가 같은 경로를 쓴다.
export const getRestaurantStoreInfo = async (prisma: PrismaClient, canonicalId: string): Promise<RestaurantStoreInfoType | null> => {
  const m = await prisma.restaurantStoreMatch.findUnique({ where: { canonicalId } });
  if (!m) return null;
  return toRestaurantStoreInfo(m, await getStoreBaseDate(prisma));
};
