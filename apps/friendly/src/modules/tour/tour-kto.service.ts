// 여행로그 장소에 한국관광공사 관광정보(TourAPI, data.go.kr 15101578)의 운영 정보를 붙인다 — 15차, docs/PLAN-tour-log.md.
// 여행로그는 2023년 표본이라 "지금 몇 시에 열고 언제 쉬는지" 가 없다. 세 단계로 채운다:
//   ① 카탈로그 — areaBasedList2 를 유형(관광지·문화시설·레포츠·쇼핑·음식점)별로 끝까지 받아 통째로 갈아 끼운다(전량 수십 콜).
//      유형마다 30일 안에 받았으면 건너뛴다.
//   ② 맞추기 — 여행로그 장소(여행 TOUR_K_MIN 건 이상, 좌표 있음)와 카탈로그를 이름 + 거리로 맞춘다(tour-kto-info.ts, 호출 없음).
//      주변 3km 에서 못 찾으면 이름이 전국에 하나뿐인 콘텐츠를 더 멀리까지 본다(숲길·국립공원처럼 넓은 곳).
//   ③ 소개 정보 — 맞은 콘텐츠만 detailIntro2 로 이용 시간·쉬는 날·주차·요금을 받는다(콘텐츠당 1콜 — 방문 많은 장소부터).
//      받은 적이 있고 카탈로그의 수정 시각이 그대로면 다시 받지 않는다.
// 호출은 전부 한 예산(maxCalls)에서 나간다 — 개발계정은 하루 1,000건이라 다 못 받으면 다음 날 이어서 받는다(받은 것은 남는다).
// 키·권한·쿼터 오류는 즉시 멈춘다. 실행: scripts/sync-tour-kto.ts. 코스 추천은 loadTourPlaceInfos 로 읽는다.

import type { PrismaClient } from '@prisma/client';
import { TOUR_K_MIN, haversineM } from '@repo/utils';
import { coerceStrOrNull, numOrNull } from '../../lib/narrow.js';
import { KtoApiAuthError, fetchKtoPage, normalizeKtoIntro, type KtoApiCallOptions } from './kto-tour.adapter.js';
import { KTO_MATCH_MAX_M, KtoGrid, KtoNameIndex, TOUR_KTO_SYNC_LAYER, TOUR_KTO_TYPE_IDS, ktoNameScore, parseKtoClosedDays, pickKtoMatch, shortenKtoText, type KtoMatchCandidate } from './tour-kto-info.js';

const CATALOG_PAGE_SIZE = 1000;
const CATALOG_FRESH_DAYS = 30;
// 전량이 이 비율 아래로 줄어 오면 갈아 끼우지 않는다(게이트웨이가 일부만 준 날에 카탈로그를 비우지 않게).
const CATALOG_SHRINK_GUARD = 0.5;
const WRITE_CHUNK = 500;
// 맞추지 않는 유형 — 이동·잠자리·비공개(코스 추천에서도 빠진다).
const MATCH_EXCLUDED_TYPES = ['교통', '숙소', '집', '친지', '사무실'];
// 소개 정보가 이만큼 연달아 실패하면 멈춘다(호출 예산을 태우지 않게).
const INTRO_MAX_FAILS = 3;
// 게이트웨이 쿼터 초과(LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR).
const QUOTA_CODE = '22';
// 우리나라 좌표 범위 밖(0,0 · 뒤바뀐 값)은 좌표 없음으로 본다.
const inKorea = (lat: number, lng: number): boolean => lat >= 32.5 && lat <= 39.5 && lng >= 124 && lng <= 132.5;

export type TourKtoStop = 'done' | 'maxCalls' | 'quota' | 'auth' | 'error';
export interface TourKtoBudget {
  calls: number;
  maxCalls: number;
}
type FetchOpts = Pick<KtoApiCallOptions, 'serviceKey' | 'fetchImpl'>;
const stopOf = (e: unknown): TourKtoStop => (e instanceof KtoApiAuthError ? (e.code === QUOTA_CODE ? 'quota' : 'auth') : 'error');
const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

// ── ① 카탈로그 ────────────────────────────────────────────────────────────────
export interface KtoContentRow {
  contentId: string;
  contentTypeId: string;
  title: string;
  addr: string | null;
  lat: number | null;
  lng: number | null;
  modifiedTime: string | null;
}
// 목록 한 행 → 카탈로그 행. id·유형·명칭이 없으면 버린다. mapx 가 경도, mapy 가 위도(문자열로 온다).
export const normalizeKtoContent = (item: Record<string, unknown>): KtoContentRow | null => {
  const contentId = coerceStrOrNull(item['contentid']);
  const contentTypeId = coerceStrOrNull(item['contenttypeid']);
  const title = coerceStrOrNull(item['title'])?.trim();
  if (!contentId || !contentTypeId || !title) return null;
  const lat = numOrNull(item['mapy']);
  const lng = numOrNull(item['mapx']);
  const located = lat !== null && lng !== null && inKorea(lat, lng);
  const addr = [coerceStrOrNull(item['addr1']), coerceStrOrNull(item['addr2'])]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(' ');
  return { contentId, contentTypeId, title, addr: addr === '' ? null : addr, lat: located ? lat : null, lng: located ? lng : null, modifiedTime: coerceStrOrNull(item['modifiedtime']) };
};

export interface KtoCatalogResult {
  // 유형별 — fetched: 이번에 받아 갈아 끼운 행 수(건너뛰었으면 null).
  byType: Record<string, { fetched: number | null; skipped: 'fresh' | 'shrunk' | 'empty' | null }>;
  replaced: number;
  stopped: TourKtoStop;
  error: string | null;
}

export const syncKtoCatalog = async (
  prisma: PrismaClient,
  opts: FetchOpts & { budget: TourKtoBudget; force?: boolean; pageSize?: number; now?: () => Date; onProgress?: (msg: string) => void },
): Promise<KtoCatalogResult> => {
  const now = opts.now ?? (() => new Date());
  // 게이트웨이가 한 번에 주는 행 수에 상한이 있으면(전체보다 적은데 요청한 수보다 덜 왔다) 그 크기로 맞춰 넘긴다.
  let pageSize = opts.pageSize ?? CATALOG_PAGE_SIZE;
  const result: KtoCatalogResult = { byType: {}, replaced: 0, stopped: 'done', error: null };
  const have = new Map((await prisma.tourKtoContent.groupBy({ by: ['contentTypeId'], _count: { _all: true }, _max: { syncedAt: true } })).map((g) => [g.contentTypeId, { n: g._count._all, at: g._max.syncedAt }]));
  const freshAfter = new Date(now().getTime() - CATALOG_FRESH_DAYS * 86_400_000);

  for (const typeId of TOUR_KTO_TYPE_IDS) {
    const cur = have.get(typeId);
    if (!opts.force && cur && cur.n > 0 && cur.at !== null && cur.at >= freshAfter) {
      result.byType[typeId] = { fetched: null, skipped: 'fresh' };
      continue;
    }
    // 한 유형을 끝까지 받은 뒤에만 쓴다 — 도중에 멈추면 그 유형은 옛 것 그대로.
    const rows = new Map<string, KtoContentRow>();
    let total = Number.POSITIVE_INFINITY;
    try {
      for (let pageNo = 1; (pageNo - 1) * pageSize < total; pageNo += 1) {
        if (opts.budget.calls >= opts.budget.maxCalls) {
          result.stopped = 'maxCalls';
          return result;
        }
        opts.budget.calls += 1;
        const page = await fetchKtoPage('areaBasedList2', { numOfRows: pageSize, pageNo, arrange: 'A', contentTypeId: typeId }, opts);
        total = page.totalCount;
        if (page.items.length === 0) break;
        for (const item of page.items) {
          const row = normalizeKtoContent(item);
          if (row && row.contentTypeId === typeId) rows.set(row.contentId, row);
        }
        opts.onProgress?.(`카탈로그 ${typeId} ${rows.size.toLocaleString('ko-KR')}/${Number.isFinite(total) ? total.toLocaleString('ko-KR') : '?'}`);
        if (pageNo === 1 && page.items.length < pageSize && page.items.length < total) pageSize = page.items.length;
      }
    } catch (e) {
      result.stopped = stopOf(e);
      result.error = messageOf(e);
      return result;
    }
    if (rows.size === 0) {
      result.byType[typeId] = { fetched: null, skipped: 'empty' };
      continue;
    }
    if (!opts.force && cur && rows.size < cur.n * CATALOG_SHRINK_GUARD) {
      result.byType[typeId] = { fetched: null, skipped: 'shrunk' };
      continue;
    }
    const at = now();
    const list = [...rows.values()];
    await prisma.$transaction(
      async (tx) => {
        await tx.tourKtoContent.deleteMany({ where: { contentTypeId: typeId } });
        for (let i = 0; i < list.length; i += WRITE_CHUNK) {
          const chunk = list.slice(i, i + WRITE_CHUNK);
          // 유형이 바뀐 콘텐츠가 다른 유형 아래에 남아 있을 수 있다 — id 로 한 번 더 지운다.
          await tx.tourKtoContent.deleteMany({ where: { contentId: { in: chunk.map((r) => r.contentId) } } });
          await tx.tourKtoContent.createMany({ data: chunk.map((r) => ({ ...r, syncedAt: at })) });
        }
      },
      { timeout: 120_000, maxWait: 30_000 },
    );
    result.byType[typeId] = { fetched: list.length, skipped: null };
    result.replaced += list.length;
  }
  return result;
};

// ── ② 맞추기 ─────────────────────────────────────────────────────────────────
export interface KtoMatchResult {
  places: number;
  matched: number;
  byKind: Record<string, { places: number; matched: number }>;
  // 맞춤 표가 바뀌었는가(같으면 쓰지 않는다).
  changed: boolean;
}

export const matchTourPlacesToKto = async (prisma: PrismaClient, opts: { minTravelers?: number; now?: () => Date } = {}): Promise<KtoMatchResult> => {
  const [places, contents, before] = await Promise.all([
    prisma.tourPlace.findMany({
      where: { nTravelers: { gte: opts.minTravelers ?? TOUR_K_MIN }, lat: { not: null }, lng: { not: null }, typeShort: { notIn: MATCH_EXCLUDED_TYPES } },
      select: { id: true, name: true, typeShort: true, lat: true, lng: true },
      orderBy: { id: 'asc' },
    }),
    prisma.tourKtoContent.findMany({ where: { lat: { not: null }, lng: { not: null } }, select: { contentId: true, contentTypeId: true, title: true, lat: true, lng: true } }),
    prisma.tourPlaceKto.findMany({ select: { placeId: true, contentId: true } }),
  ]);
  const located = contents.filter((c): c is KtoMatchCandidate => c.lat !== null && c.lng !== null);
  const grid = new KtoGrid(located);
  const names = new KtoNameIndex(located);
  const result: KtoMatchResult = { places: places.length, matched: 0, byKind: {}, changed: false };
  const at = (opts.now ?? (() => new Date()))();
  const rows: Array<{ placeId: string; contentId: string; title: string; distM: number; nameScore: number; matchedAt: Date }> = [];
  for (const p of places) {
    if (p.lat === null || p.lng === null) continue;
    const kind = (result.byKind[p.typeShort] ??= { places: 0, matched: 0 });
    kind.places += 1;
    // 주변에서 이름 + 거리로 찾고, 없으면 이름이 전국에 하나뿐인 콘텐츠를 더 멀리까지 본다.
    const place = { name: p.name, kind: p.typeShort, lat: p.lat, lng: p.lng };
    const hit = pickKtoMatch(place, grid.near(p.lat, p.lng)) ?? names.unique(place);
    if (!hit) continue;
    kind.matched += 1;
    result.matched += 1;
    rows.push({ placeId: p.id, contentId: hit.contentId, title: hit.title, distM: hit.distM, nameScore: Math.round(hit.nameScore * 1000) / 1000, matchedAt: at });
  }
  const old = new Map(before.map((r) => [r.placeId, r.contentId]));
  result.changed = old.size !== rows.length || rows.some((r) => old.get(r.placeId) !== r.contentId);
  if (!result.changed) return result;
  await prisma.$transaction(
    async (tx) => {
      await tx.tourPlaceKto.deleteMany();
      for (let i = 0; i < rows.length; i += WRITE_CHUNK) await tx.tourPlaceKto.createMany({ data: rows.slice(i, i + WRITE_CHUNK) });
    },
    { timeout: 60_000, maxWait: 30_000 },
  );
  return result;
};

// 못 맞춘 장소의 "아까운 후보"(검수용, 호출 없음) — 맞추는 반경 안에서 이름이 가장 비슷한 콘텐츠를 방문 많은 장소부터.
// 기준(tour-kto-info.ts)을 손볼 때 본다: 같은 곳인데 이름 점수가 모자란 것이 많으면 기준이 빡빡한 것이다.
export interface KtoNearMiss {
  name: string;
  kind: string;
  travelers: number;
  best: { title: string; contentTypeId: string; nameScore: number; distM: number } | null;
}
export const listKtoNearMisses = async (prisma: PrismaClient, opts: { limit: number; kind?: string; minTravelers?: number }): Promise<{ unmatched: number; rows: KtoNearMiss[] }> => {
  const [places, contents, links] = await Promise.all([
    prisma.tourPlace.findMany({
      where: { nTravelers: { gte: opts.minTravelers ?? TOUR_K_MIN }, lat: { not: null }, lng: { not: null }, typeShort: opts.kind ?? { notIn: MATCH_EXCLUDED_TYPES } },
      select: { id: true, name: true, typeShort: true, lat: true, lng: true, nTravelers: true },
      orderBy: [{ nTravelers: 'desc' }, { id: 'asc' }],
    }),
    prisma.tourKtoContent.findMany({ where: { lat: { not: null }, lng: { not: null } }, select: { contentId: true, contentTypeId: true, title: true, lat: true, lng: true } }),
    prisma.tourPlaceKto.findMany({ select: { placeId: true } }),
  ]);
  const grid = new KtoGrid(contents.filter((c): c is KtoMatchCandidate => c.lat !== null && c.lng !== null));
  const matched = new Set(links.map((l) => l.placeId));
  const missed = places.filter((p) => !matched.has(p.id));
  const rows = missed.slice(0, opts.limit).map((p): KtoNearMiss => {
    let best: KtoNearMiss['best'] = null;
    for (const c of grid.near(p.lat!, p.lng!)) {
      const distM = Math.round(haversineM({ lat: p.lat!, lng: p.lng! }, { lat: c.lat, lng: c.lng }));
      if (distM > KTO_MATCH_MAX_M) continue;
      const nameScore = ktoNameScore(p.name, c.title);
      if (!best || nameScore > best.nameScore || (nameScore === best.nameScore && distM < best.distM)) best = { title: c.title, contentTypeId: c.contentTypeId, nameScore, distM };
    }
    return { name: p.name, kind: p.typeShort, travelers: p.nTravelers, best };
  });
  return { unmatched: missed.length, rows };
};

// ── ③ 소개 정보 ───────────────────────────────────────────────────────────────
export interface KtoIntroResult {
  // 맞은 콘텐츠 수(서로 다른 것) · 그중 받아야 할 것 · 이번에 받은 것.
  targets: number;
  pending: number;
  fetched: number;
  failed: number;
  stopped: TourKtoStop;
  error: string | null;
}

export const fetchKtoIntros = async (
  prisma: PrismaClient,
  opts: FetchOpts & { budget: TourKtoBudget; force?: boolean; now?: () => Date; onProgress?: (done: number, total: number) => void },
): Promise<KtoIntroResult> => {
  const now = opts.now ?? (() => new Date());
  const result: KtoIntroResult = { targets: 0, pending: 0, fetched: 0, failed: 0, stopped: 'done', error: null };
  const links = await prisma.tourPlaceKto.findMany({ select: { placeId: true, contentId: true } });
  if (links.length === 0) return result;
  const [contents, intros] = await Promise.all([
    prisma.tourKtoContent.findMany({ select: { contentId: true, contentTypeId: true, modifiedTime: true } }),
    prisma.tourKtoIntro.findMany({ select: { contentId: true, modifiedTime: true } }),
  ]);
  const travelers = new Map<string, number>();
  for (let i = 0; i < links.length; i += WRITE_CHUNK) {
    const ids = links.slice(i, i + WRITE_CHUNK).map((l) => l.placeId);
    for (const p of await prisma.tourPlace.findMany({ where: { id: { in: ids } }, select: { id: true, nTravelers: true } })) travelers.set(p.id, p.nTravelers);
  }
  const contentOf = new Map(contents.map((c) => [c.contentId, c]));
  const introOf = new Map(intros.map((i) => [i.contentId, i]));
  // 콘텐츠별 우선순위 = 붙은 장소의 방문 여행 수 합.
  const weight = new Map<string, number>();
  for (const l of links) weight.set(l.contentId, (weight.get(l.contentId) ?? 0) + (travelers.get(l.placeId) ?? 0));
  result.targets = weight.size;
  const pending = [...weight.entries()]
    .map(([contentId, w]) => ({ contentId, w, content: contentOf.get(contentId) }))
    .filter((t): t is { contentId: string; w: number; content: NonNullable<typeof t.content> } => t.content !== undefined)
    .filter((t) => {
      const have = introOf.get(t.contentId);
      return opts.force || !have || have.modifiedTime !== t.content.modifiedTime;
    })
    .sort((a, b) => b.w - a.w || a.contentId.localeCompare(b.contentId));
  result.pending = pending.length;

  let fails = 0;
  for (const [i, t] of pending.entries()) {
    if (opts.budget.calls >= opts.budget.maxCalls) {
      result.stopped = 'maxCalls';
      break;
    }
    opts.budget.calls += 1;
    try {
      const page = await fetchKtoPage('detailIntro2', { contentId: t.contentId, contentTypeId: t.content.contentTypeId }, opts);
      const info = normalizeKtoIntro(t.content.contentTypeId, page.items[0] ?? {});
      const data = { contentTypeId: t.content.contentTypeId, ...info, modifiedTime: t.content.modifiedTime, fetchedAt: now() };
      await prisma.tourKtoIntro.upsert({ where: { contentId: t.contentId }, create: { contentId: t.contentId, ...data }, update: data });
      result.fetched += 1;
      fails = 0;
    } catch (e) {
      const stop = stopOf(e);
      if (stop !== 'error') {
        result.stopped = stop;
        result.error = messageOf(e);
        break;
      }
      result.failed += 1;
      fails += 1;
      if (fails >= INTRO_MAX_FAILS) {
        result.stopped = 'error';
        result.error = messageOf(e);
        break;
      }
    }
    opts.onProgress?.(i + 1, pending.length);
  }
  return result;
};

// ── 실행 ─────────────────────────────────────────────────────────────────────
export interface TourKtoSyncOptions extends FetchOpts {
  maxCalls?: number;
  // 카탈로그 — auto: 유형마다 30일이 지났거나 없으면 · force: 전부 다시 · skip: 받지 않는다.
  catalog?: 'auto' | 'force' | 'skip';
  // 소개 정보를 받지 않는다(카탈로그·맞추기만).
  skipIntro?: boolean;
  // 받은 소개 정보도 다시 받는다.
  forceIntro?: boolean;
  minTravelers?: number;
  now?: () => Date;
  onProgress?: (msg: string) => void;
}
export interface TourKtoSyncResult {
  calls: number;
  catalog: KtoCatalogResult | null;
  match: KtoMatchResult | null;
  intro: KtoIntroResult | null;
  stopped: TourKtoStop;
  error: string | null;
}

export const syncTourKto = async (prisma: PrismaClient, opts: TourKtoSyncOptions): Promise<TourKtoSyncResult> => {
  const budget: TourKtoBudget = { calls: 0, maxCalls: opts.maxCalls ?? 900 };
  const result: TourKtoSyncResult = { calls: 0, catalog: null, match: null, intro: null, stopped: 'done', error: null };
  const fail = (stopped: TourKtoStop, error: string | null): TourKtoSyncResult => ({ ...result, calls: budget.calls, stopped, error });
  if (!opts.serviceKey) return fail('auth', 'DATA_GO_KR_API_KEY 가 없습니다');
  const fetchOpts: FetchOpts = { serviceKey: opts.serviceKey, fetchImpl: opts.fetchImpl };

  if (opts.catalog !== 'skip') {
    result.catalog = await syncKtoCatalog(prisma, { ...fetchOpts, budget, force: opts.catalog === 'force', now: opts.now, onProgress: opts.onProgress });
  }
  // 카탈로그가 도중에 멈췄어도 받은 유형까지는 맞춘다(키·권한 오류로 하나도 못 받았으면 맞출 것도 없다).
  result.match = await matchTourPlacesToKto(prisma, { minTravelers: opts.minTravelers, now: opts.now });
  const catalogStop = result.catalog?.stopped ?? 'done';
  if (catalogStop === 'done' && !opts.skipIntro) {
    result.intro = await fetchKtoIntros(prisma, {
      ...fetchOpts,
      budget,
      force: opts.forceIntro,
      now: opts.now,
      onProgress: (done, total) => (done % 50 === 0 || done === total) && opts.onProgress?.(`소개 정보 ${done.toLocaleString('ko-KR')}/${total.toLocaleString('ko-KR')}`),
    });
  }

  // 바뀐 것이 있으면 적재 이력을 남긴다 — 떠 있는 API 의 코스 프로필 캐시가 다음 요청부터 새로 만들어진다(tour-data-version.ts).
  if ((result.catalog?.replaced ?? 0) > 0 || result.match.changed || (result.intro?.fetched ?? 0) > 0) {
    const [count, matched] = await Promise.all([prisma.tourKtoContent.count(), prisma.tourPlaceKto.count()]);
    await prisma.lifeMasterSync.create({ data: { layer: TOUR_KTO_SYNC_LAYER, count, geocoded: matched, baseDate: null, sourceFile: 'TourAPI KorService2' } });
  }
  result.calls = budget.calls;
  result.stopped = catalogStop !== 'done' ? catalogStop : (result.intro?.stopped ?? 'done');
  result.error = result.catalog?.error ?? result.intro?.error ?? null;
  return result;
};

// ── 현황 ─────────────────────────────────────────────────────────────────────
export interface TourKtoStatus {
  catalog: Record<string, number>;
  matchedPlaces: number;
  matchedContents: number;
  intros: number;
  withHours: number;
  withClosed: number;
  // 쉬는 요일을 읽어 낸 콘텐츠(매주 쉬는 요일이 하나라도 있는 것).
  weeklyClosed: number;
}
export const getTourKtoStatus = async (prisma: PrismaClient): Promise<TourKtoStatus> => {
  const [byType, links, intros] = await Promise.all([
    prisma.tourKtoContent.groupBy({ by: ['contentTypeId'], _count: { _all: true } }),
    prisma.tourPlaceKto.findMany({ select: { contentId: true } }),
    prisma.tourKtoIntro.findMany({ select: { contentId: true, hours: true, closed: true } }),
  ]);
  const linked = new Set(links.map((l) => l.contentId));
  const used = intros.filter((i) => linked.has(i.contentId));
  return {
    catalog: Object.fromEntries(byType.map((g) => [g.contentTypeId, g._count._all])),
    matchedPlaces: links.length,
    matchedContents: linked.size,
    intros: used.length,
    withHours: used.filter((i) => i.hours !== null).length,
    withClosed: used.filter((i) => i.closed !== null).length,
    weeklyClosed: used.filter((i) => (parseKtoClosedDays(i.closed)?.length ?? 0) > 0).length,
  };
};

// ── 코스 추천이 읽는 값 ─────────────────────────────────────────────────────────
// 여행로그 장소 id → 운영 정보. 문구는 한 줄로 줄인 것, closedDows = 매주 쉬는 요일(0 일 … 6 토 — 읽지 못했으면 null).
// 네 문구가 모두 비어 있는 콘텐츠는 싣지 않는다.
export interface TourPlaceInfo {
  hours: string | null;
  closed: string | null;
  parking: string | null;
  fee: string | null;
  closedDows: number[] | null;
}
export const loadTourPlaceInfos = async (prisma: PrismaClient): Promise<Map<string, TourPlaceInfo>> => {
  const [links, intros] = await Promise.all([prisma.tourPlaceKto.findMany({ select: { placeId: true, contentId: true } }), prisma.tourKtoIntro.findMany()]);
  const infoOf = new Map<string, TourPlaceInfo>();
  for (const i of intros) {
    const info: TourPlaceInfo = { hours: shortenKtoText(i.hours), closed: shortenKtoText(i.closed), parking: shortenKtoText(i.parking), fee: shortenKtoText(i.fee), closedDows: parseKtoClosedDays(i.closed) };
    if (info.hours !== null || info.closed !== null || info.parking !== null || info.fee !== null) infoOf.set(i.contentId, info);
  }
  const out = new Map<string, TourPlaceInfo>();
  for (const l of links) {
    const info = infoOf.get(l.contentId);
    if (info) out.set(l.placeId, info);
  }
  return out;
};
