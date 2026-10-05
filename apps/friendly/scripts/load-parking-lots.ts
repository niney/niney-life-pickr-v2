// 주차(/parking) — 주차장 마스터 적재. 원천: 서울 공영주차장 안내(GetParkInfo 2,189행 + 시영 실시간 목록 보충,
// SEOUL_OPEN_API_KEY) + 전국주차장정보표준데이터(15012896 오픈API 1,000행 × ~19콜, DATA_GO_KR_API_KEY) + 한국교통안전공단
// 주차정보(15099883, DATA_GO_KR_API_KEY — 시군구 251곳 × 시설·운영 ≈ 470콜, 초당 한도 때문에 순차라 5분 남짓).
// 서울 행 중 좌표 없는 곳(구영)과 입구 좌표가 없는 KOTSA 행은 주소 지오코딩(LifeGeocodeCache 영구 캐시 — 재실행은 새 주소만
// 호출, 운영은 저장소 압축본을 가져와 캐시로) → 표준데이터의 서울 겹침 행 제거 → KOTSA 공영 행 중 서울·표준데이터와 겹치는 곳
// 제거(새 곳만 더함, 위치를 못 찾은 KOTSA 행은 뺌) → ParkingLot 전량 교체.
// docs/PLAN-parking.md
//
// 실행: pnpm --filter friendly load:parking-lots [옵션]
//   --sources=std,seoul,kotsa  받을 원천(기본 셋 다). 일부만 주면 나머지 원천 행은 이번 적재에서 빠진다(전량 교체).
//   --std-json=<파일|폴더> 표준데이터를 API 대신 파일에서(포털 JSON — 배열·{data:[…]}·행 객체 모음, 폴더면 *.json 전부).
//   --kotsa-dump=<폴더>    KOTSA 응답 중 쓰는 행(공영 시설 + 그 운영정보)을 시군구별 JSON 으로 저장.
//   --kotsa-json=<폴더>    KOTSA 를 API 대신 저장본(--kotsa-dump)에서 — 다시 받지 않고 규칙만 바꿔 재적재·검증할 때.
//   --kotsa-codes=11110,41360  KOTSA 일부 시군구만(점검용 — 전량 교체이니 --dry-run 과 같이).
//   --dry-run             수집 + 정규화 리포트만(지오코딩·DB 쓰기 없음).
//   --offline             지오코더를 호출하지 않고 캐시만(못 찾은 서울 행은 좌표 null — 지도 미표시, KOTSA 행은 뺀다).
//   --max-calls=N         지오코더 호출 상한.
// 지오코더 키는 설정>지도 의 vworld 키(DB 우선, 없으면 .env VWORLD_API_KEY).

import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { MapSettingsService } from '../src/modules/settings/map.service.js';
import { geocodeLifeRows, type GeocodeAddressType } from '../src/modules/life-map/life-map-geocode.service.js';
import {
  emptyKotsaReport,
  collectKotsaSigungu,
  dedupeKotsaRows,
  markKotsaPlaceholderCoords,
  normalizeKotsaSigungu,
  slimKotsaCollected,
  type KotsaCollected,
  type KotsaReport,
} from '../src/modules/parking/kotsa-master.service.js';
import { KOTSA_SIGUNGU } from '../src/modules/parking/kotsa-sigungu.js';
import {
  KOTSA_CALL_GAP_MS,
  SEOUL_PARKING_LIVE,
  SEOUL_PARK_INFO,
  ParkingApiError,
  callSeoulOpenAll,
  createCallSpacer,
  fetchStdParkingPage,
} from '../src/modules/parking/parking-api.adapter.js';
import {
  KOTSA_SAME_NAME_RADIUS_M,
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
const KOTSA_JSON = strOpt('kotsa-json');
const KOTSA_DUMP = strOpt('kotsa-dump');
const KOTSA_CODES = strOpt('kotsa-codes')
  ?.split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const SOURCES = new Set((strOpt('sources') ?? 'std,seoul,kotsa').split(',').map((s) => s.trim()));
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

// KOTSA — 시군구마다 수집(또는 저장본) → 정규화. 원천이 목록을 안 주는 시군구(행정코드 바뀐 지역)는 건너뛰고 수만 센다.
const loadKotsa = async (today: string): Promise<KotsaReport> => {
  const codes = KOTSA_CODES ?? KOTSA_SIGUNGU.map(([code]) => code);
  const nameOf = new Map(KOTSA_SIGUNGU);
  const report = emptyKotsaReport();
  const unlisted: string[] = [];
  let calls = 0;
  if (KOTSA_JSON) {
    for (const f of readdirSync(KOTSA_JSON).filter((x) => /^\d{5}\.json$/.test(x))) {
      const c = JSON.parse(readFileSync(join(KOTSA_JSON, f), 'utf8')) as KotsaCollected;
      if (KOTSA_CODES && !KOTSA_CODES.includes(c.sigunguCd)) continue;
      if (c.facility.length === 0 && c.facilityTotal > 0) unlisted.push(c.sigunguCd);
      normalizeKotsaSigungu(c, today, report);
    }
    console.log(`\n[KOTSA] 저장본 ${KOTSA_JSON}`);
  } else {
    const key = process.env.DATA_GO_KR_API_KEY ?? '';
    if (!key) throw new Error('DATA_GO_KR_API_KEY 가 없습니다 — .env 확인(또는 --sources=std,seoul / --kotsa-json).');
    if (KOTSA_DUMP) mkdirSync(KOTSA_DUMP, { recursive: true });
    const space = createCallSpacer(KOTSA_CALL_GAP_MS);
    const t = Date.now();
    for (const [i, code] of codes.entries()) {
      const c = await collectKotsaSigungu(key, code, { space });
      calls += c.calls;
      if (c.facility.length === 0 && c.facilityTotal > 0) unlisted.push(code);
      normalizeKotsaSigungu(c, today, report);
      if (KOTSA_DUMP) writeFileSync(join(KOTSA_DUMP, `${code}.json`), JSON.stringify(slimKotsaCollected(c)));
      if ((i + 1) % 25 === 0 || i === codes.length - 1) {
        console.log(`  … KOTSA ${i + 1}/${codes.length} 시군구 · 호출 ${n(calls)} · 행 ${n(report.rows.length)} (${Math.round((Date.now() - t) / 1000)}s)`);
      }
    }
  }
  console.log(
    `[KOTSA] 시설 ${n(report.facilityRows)}행 중 공영 ${n(report.publicRows)} → ${n(report.rows.length)}곳(운영정보 ${n(report.withOperation)})` +
      ` · 좌표 없어 주소로 찾을 곳 ${n(report.needGeocode)}` +
      ` · 뺀 것: 요금 구분 없음 ${n(report.droppedNoFeeType)} · 거주자 구획 ${n(report.droppedResidentOnly)} · 좌표·주소 없음 ${n(report.droppedNoLocation)} · 이름 없음 ${n(report.droppedNoName)}` +
      ` · 중복 ID ${n(report.droppedDupId)} · 쓰레기 ID ${n(report.droppedJunkId)}`,
  );
  if (unlisted.length > 0) {
    console.log(`[KOTSA] 원천 결함 — 건수만 오고 목록이 빈 시군구 ${unlisted.length}곳: ${unlisted.map((c) => nameOf.get(c) ?? c).join(', ')}`);
  }
  return report;
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

  // ── 한국교통안전공단 ──
  const kotsaRows = SOURCES.has('kotsa') ? (await loadKotsa(today)).rows : [];
  const placeholder = markKotsaPlaceholderCoords(kotsaRows);
  if (placeholder > 0) console.log(`[KOTSA] 이름 다른 3곳 이상이 몰린 대표 좌표 ${n(placeholder)}행 — 원천 좌표를 버리고 주소로 다시 찾는다`);

  if (DRY_RUN) {
    if (kotsaRows.length > 0) {
      // 겹침은 좌표만 보면 되므로 지오코딩 전 값으로 미리 본다(좌표 없는 서울 구영·KOTSA 행은 빠진 채).
      const { kept } = dropParkingDuplicates(seoulRows, stdRows);
      const located = kotsaRows.filter((r) => r.lat !== null);
      const m = dropParkingDuplicates([...seoulRows, ...kept], dedupeKotsaRows(located).kept, { sameNameRadiusM: KOTSA_SAME_NAME_RADIUS_M });
      console.log(
        `\n[겹침 미리보기] KOTSA 좌표 있는 ${n(located.length)}곳 중 기존과 같은 곳 ${n(m.dropped)} · 새로 더할 곳 ${n(m.kept.length)} (지오코딩 대기 ${n(kotsaRows.length - located.length)})`,
      );
    }
    console.log('\n--dry-run — 지오코딩·적재 생략. 종료.');
    return;
  }

  // ── 좌표 없는 서울·KOTSA 행 지오코딩 ──
  const targets = [...seoulRows, ...kotsaRows].filter((r) => r.lat === null && (r.roadAddr || r.lotAddr));
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
    const per = (src: ParkingLotRow['source']): string => {
      const mine = targets.filter((r) => r.source === src);
      return `${src} ${n(mine.filter((r) => r.lat !== null).length)}/${n(mine.length)}`;
    };
    console.log(
      `\n[지오코딩] 대상 ${n(targets.length)} → 좌표 ${n(geo.resolved)} (${per('seoul')} · ${per('kotsa')} | 캐시 ${n(geo.cacheHits)} · 호출 ${n(geo.apiCalls)}) · 미해결 ${geo.unresolved} · 미시도 ${geo.skipped}${geo.stoppedBy ? ` · 중단: ${geo.stoppedBy}` : ''}`,
    );
  }
  // KOTSA 는 위치를 못 찾으면 뺀다 — 좌표 없이는 겹침을 판정할 수 없어 기존 주차장과 겹칠 수 있다. 주소도 뭉뚱그려져 이름 다른
  // 여러 곳이 한 점에 모인 행도 위치를 모르는 것으로 본다.
  const unresolved = kotsaRows.filter((r) => r.lat === null).length;
  if (unresolved > 0) console.log(`[KOTSA] 주소로도 위치를 못 찾은 ${n(unresolved)}곳 제외`);
  const clustered = markKotsaPlaceholderCoords(kotsaRows, { includeGeocoded: true });
  if (clustered > 0) console.log(`[KOTSA] 주소로 찾은 위치도 이름 다른 3곳 이상이 한 점에 모인 ${n(clustered)}곳 — 위치를 알 수 없어 제외`);
  const kotsaLocated = kotsaRows.filter((r) => r.lat !== null && r.lng !== null);

  // ── 겹침 접기 → 교체 ──
  const { kept, dropped } = dropParkingDuplicates(seoulRows, stdRows);
  if (SOURCES.has('std') && SOURCES.has('seoul')) console.log(`\n[겹침] 표준데이터 서울 행 중 서울 원천과 같은 곳 ${n(dropped)}곳 제외`);
  const existing = [...seoulRows, ...kept];
  const self = dedupeKotsaRows(kotsaLocated);
  if (self.dropped > 0) console.log(`[KOTSA] 관리 ID 만 다른 같은 주차장(이름 같고 300m 안) ${n(self.dropped)}곳 제외`);
  const kotsa = dropParkingDuplicates(existing, self.kept, { sameNameRadiusM: KOTSA_SAME_NAME_RADIUS_M });
  if (SOURCES.has('kotsa')) console.log(`[겹침] KOTSA ${n(self.kept.length)}곳 중 서울·표준데이터와 같은 곳 ${n(kotsa.dropped)}곳 제외 · 새로 더함 ${n(kotsa.kept.length)}`);
  const rows = [...existing, ...kotsa.kept];
  const detail = { std: kept.length, seoul: seoulRows.length, kotsa: kotsa.kept.length, droppedDup: dropped, kotsaDup: kotsa.dropped, kotsaSelfDup: self.dropped };
  const baseDate = kept.reduce<string | null>((m, r) => (r.baseDate && (!m || r.baseDate > m) ? r.baseDate : m), null) ?? today;
  const t = Date.now();
  const { count, geocoded } = await replaceParkingLots(prisma, rows, { detail, baseDate });
  console.log(`\nParkingLot 전량 교체: ${n(count)}곳(좌표 ${n(geocoded)}) + 적재 이력 기록 (${((Date.now() - t) / 1000).toFixed(1)}s)`);
};

main()
  .catch((e) => {
    if (e instanceof ParkingApiError) {
      console.error(`\n원천 호출 실패(${e.code ?? e.statusCode}): ${e.message}`);
      if (e.code === '30') console.error('→ 활용신청이 안 됐거나 승인 직후 반영 대기(수십 분). 원천 하나만 문제면 --sources 로 나머지만 먼저 적재할 수 있다(예: --sources=std,seoul).');
      if (e.code === '22') {
        console.error(
          e.message.includes('초당')
            ? '→ 초당 호출 한도 — 같은 키로 동시에 부르는 프로세스가 없는지 확인하고 잠시 뒤 다시.'
            : '→ 일일 호출 한도 초과 — KOTSA(15099883)는 개발계정 일 1만 건. 내일 다시 하거나 --sources=std,seoul.',
        );
      }
    } else {
      console.error(e);
    }
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
