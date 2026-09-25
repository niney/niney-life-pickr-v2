// 주차(/parking) — 주차장 마스터 적재. 원천: 서울 공영주차장 안내(GetParkInfo 2,189행 + 시영 실시간 목록 보충,
// SEOUL_OPEN_API_KEY) + 전국주차장정보표준데이터(15012896 오픈API 1,000행 × ~19콜, DATA_GO_KR_API_KEY).
// 서울 행 중 좌표 없는 곳(구영)은 지번 주소 지오코딩(LifeGeocodeCache 영구 캐시 — 재실행은 새 주소만 호출) → 표준데이터의
// 서울 겹침 행 제거 → ParkingLot 전량 교체. docs/PLAN-parking.md
//
// 실행: pnpm --filter friendly load:parking-lots [옵션]
//   --sources=std,seoul   받을 원천(기본 둘 다). 한쪽만 주면 나머지 원천 행은 이번 적재에서 빠진다(전량 교체).
//   --std-json=<파일|폴더> 표준데이터를 API 대신 파일에서(포털 JSON — 배열·{data:[…]}·행 객체 모음, 폴더면 *.json 전부).
//   --dry-run             수집 + 정규화 리포트만(지오코딩·DB 쓰기 없음).
//   --offline             지오코더를 호출하지 않고 캐시만(좌표 결측은 null — 지도 미표시).
//   --max-calls=N         지오코더 호출 상한.
// 지오코더 키는 설정>지도 의 vworld 키(DB 우선, 없으면 .env VWORLD_API_KEY).

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { MapSettingsService } from '../src/modules/settings/map.service.js';
import { geocodeLifeRows, type GeocodeAddressType } from '../src/modules/life-map/life-map-geocode.service.js';
import {
  SEOUL_PARKING_LIVE,
  SEOUL_PARK_INFO,
  ParkingApiError,
  callSeoulOpenAll,
  fetchStdParkingPage,
} from '../src/modules/parking/parking-api.adapter.js';
import {
  dropParkingDuplicates,
  normalizeSeoulParkingRows,
  normalizeStdParkingRows,
  replaceParkingLots,
  type ParkingLotRow,
} from '../src/modules/parking/parking-master.service.js';

const args = process.argv.slice(2);
const flag = (name: string): boolean => args.includes(`--${name}`);
const strOpt = (name: string): string | undefined => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const numOpt = (name: string): number | undefined => {
  const n = Number(strOpt(name));
  return Number.isFinite(n) ? n : undefined;
};
const DRY_RUN = flag('dry-run');
const OFFLINE = flag('offline');
const MAX_CALLS = numOpt('max-calls');
const STD_JSON = strOpt('std-json');
const SOURCES = new Set((strOpt('sources') ?? 'std,seoul').split(',').map((s) => s.trim()));
const STD_MAX_PAGES = 60;

const prisma = new PrismaClient();
const n = (v: number): string => v.toLocaleString('ko-KR');

// 포털 JSON 덤프 — 배열 / { data | records | items: [...] } / { "0": {...}, "1": {...} }.
const readStdJson = (path: string): Record<string, unknown>[] => {
  const files = statSync(path).isDirectory()
    ? readdirSync(path)
        .filter((f) => f.toLowerCase().endsWith('.json'))
        .map((f) => join(path, f))
    : [path];
  const out: Record<string, unknown>[] = [];
  for (const f of files) {
    const json: unknown = JSON.parse(readFileSync(f, 'utf8'));
    const pick = (v: unknown): unknown[] =>
      Array.isArray(v)
        ? v
        : v && typeof v === 'object'
          ? (['data', 'records', 'items', 'list'].map((k) => (v as Record<string, unknown>)[k]).find(Array.isArray) as unknown[] | undefined) ??
            Object.values(v as Record<string, unknown>)
          : [];
    for (const row of pick(json)) if (row && typeof row === 'object' && !Array.isArray(row)) out.push(row as Record<string, unknown>);
  }
  return out;
};

const fetchStdAll = async (key: string): Promise<Record<string, unknown>[]> => {
  const items: Record<string, unknown>[] = [];
  for (let page = 1; page <= STD_MAX_PAGES; page += 1) {
    const res = await fetchStdParkingPage(key, page);
    items.push(...res.items);
    if (page % 5 === 0 || items.length >= res.totalCount) console.log(`  … 표준데이터 ${page}페이지 · ${n(items.length)}/${n(res.totalCount)}행`);
    if (res.items.length === 0 || items.length >= res.totalCount) break;
  }
  return items;
};

const main = async (): Promise<void> => {
  console.log(`\n=== 주차장 적재 ${DRY_RUN ? '(--dry-run)' : ''}${OFFLINE ? ' (--offline)' : ''} — 원천 ${[...SOURCES].join(',')} ===`);
  const today = new Date().toLocaleDateString('en-CA');

  // ── 서울 ──
  let seoulRows: ParkingLotRow[] = [];
  if (SOURCES.has('seoul')) {
    const key = process.env.SEOUL_OPEN_API_KEY ?? '';
    if (!key) throw new Error('SEOUL_OPEN_API_KEY 가 없습니다 — .env 확인(또는 --sources=std).');
    const info = await callSeoulOpenAll(SEOUL_PARK_INFO, key);
    const live = await callSeoulOpenAll(SEOUL_PARKING_LIVE, key);
    const rep = normalizeSeoulParkingRows(info, live, today);
    seoulRows = rep.rows;
    console.log(
      `\n[서울] 안내 ${n(info.length)}행 → 주차장 ${n(rep.rows.length)}곳 (구획 행 접힘 ${n(rep.folded)} · 버스전용 제외 ${rep.droppedBusOnly} · 거주자 전용 제외 ${rep.droppedResidentOnly} · 실시간 목록 보충 ${rep.liveOnlyAdded}) · 좌표 결측 ${n(rep.coordMissing)}`,
    );
  }

  // ── 표준데이터 ──
  let stdRows: ParkingLotRow[] = [];
  if (SOURCES.has('std')) {
    let items: Record<string, unknown>[];
    if (STD_JSON) {
      items = readStdJson(STD_JSON);
      console.log(`\n[표준데이터] 파일 ${STD_JSON} — ${n(items.length)}행`);
    } else {
      const key = process.env.DATA_GO_KR_API_KEY ?? '';
      if (!key) throw new Error('DATA_GO_KR_API_KEY 가 없습니다 — .env 확인(또는 --sources=seoul / --std-json).');
      items = await fetchStdAll(key);
    }
    const rep = normalizeStdParkingRows(items);
    stdRows = rep.rows;
    console.log(`[표준데이터] ${n(rep.rows.length)}곳 (관리번호 중복 접힘 ${n(rep.duplicates)} · 식별자 없음 ${rep.droppedBadId}) · 좌표 결측 ${n(rep.coordMissing)}`);
  }

  if (DRY_RUN) {
    console.log('\n--dry-run — 지오코딩·적재 생략. 종료.');
    return;
  }

  // ── 좌표 없는 서울 행 지오코딩 ──
  const targets = seoulRows.filter((r) => r.lat === null && (r.roadAddr || r.lotAddr));
  if (targets.length > 0) {
    let key = '';
    if (!OFFLINE) {
      const secret = await new MapSettingsService(prisma, {
        apiKey: process.env.VWORLD_API_KEY ?? '',
        domains: process.env.VWORLD_DOMAINS ?? '',
      }).getSecret('vworld');
      key = secret.apiKey ?? '';
      if (!key) throw new Error('vworld 키가 없습니다 — 어드민 > 설정 > 지도 또는 .env VWORLD_API_KEY(또는 --offline).');
    }
    const geoRows = targets.map((r) => ({ roadAddr: r.roadAddr, lotAddr: r.lotAddr, lat: null as number | null, lng: null as number | null, geoSource: null as GeocodeAddressType | null }));
    const geo = await geocodeLifeRows(prisma, geoRows, { key, offline: OFFLINE, maxCalls: MAX_CALLS });
    targets.forEach((r, i) => {
      const g = geoRows[i]!;
      if (g.lat !== null && g.lng !== null) {
        r.lat = g.lat;
        r.lng = g.lng;
        r.geoSource = g.geoSource;
      }
    });
    console.log(`\n[지오코딩] 대상 ${n(targets.length)} → 좌표 ${n(geo.resolved)} (캐시 ${n(geo.cacheHits)} · 호출 ${n(geo.apiCalls)}) · 미해결 ${geo.unresolved} · 미시도 ${geo.skipped}${geo.stoppedBy ? ` · 중단: ${geo.stoppedBy}` : ''}`);
  }

  // ── 겹침 접기 → 교체 ──
  const { kept, dropped } = dropParkingDuplicates(seoulRows, stdRows);
  if (SOURCES.has('std') && SOURCES.has('seoul')) console.log(`\n[겹침] 표준데이터 서울 행 중 서울 원천과 같은 곳 ${n(dropped)}곳 제외`);
  const rows = [...seoulRows, ...kept];
  const detail = { std: kept.length, seoul: seoulRows.length, kotsa: 0, droppedDup: dropped };
  const baseDate = kept.reduce<string | null>((m, r) => (r.baseDate && (!m || r.baseDate > m) ? r.baseDate : m), null) ?? today;
  const t = Date.now();
  const { count, geocoded } = await replaceParkingLots(prisma, rows, { detail, baseDate });
  console.log(`\nParkingLot 전량 교체: ${n(count)}곳(좌표 ${n(geocoded)}) + 적재 이력 기록 (${((Date.now() - t) / 1000).toFixed(1)}s)`);
};

main()
  .catch((e) => {
    if (e instanceof ParkingApiError) {
      console.error(`\n원천 호출 실패(${e.code ?? e.statusCode}): ${e.message}`);
      if (e.code === '30') console.error('→ 활용신청이 안 됐거나 승인 직후 반영 대기(수십 분). 표준데이터만 문제면 --sources=seoul 로 서울만 먼저 적재할 수 있다.');
    } else {
      console.error(e);
    }
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
