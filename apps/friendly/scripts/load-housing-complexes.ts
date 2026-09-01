// 집값 — 한국부동산원 공동주택 단지 식별정보 CSV(data.go.kr 15106861) 적재.
// 정규화(기본 아파트만) → 지번 주소 지오코딩(VWorld, LifeGeocodeCache 영구 캐시 — 재실행은 새 주소만
// 호출) → HousingComplex 전량 교체 → 파생 재구축(거래 매칭·rtms 단지·통계).
//
// 실행: pnpm --filter friendly load:housing-complexes [csv] [옵션]
//   csv                 기본 <리포>/data/open/housing/reb-complexes.csv
//   --names=<csv>       단지명 이력 CSV(15106867) — 기본 같은 폴더 reb-complex-names.csv(없으면 생략)
//   --kinds=apt,row,multi  적재할 단지 종류(기본 apt)
//   --base-date=YYYY-MM-DD 마스터 기준일(기본: 파일명의 8자리 날짜 → 없으면 파일 수정일)
//   --dry-run           정규화 리포트만(지오코딩·DB 쓰기 없음)
//   --offline           지오코더를 호출하지 않고 캐시만 쓴다
//   --max-calls=N       지오코더 호출 상한(일 한도 분할 — VWorld 는 4만 건 수준)
//   --concurrency=N     지오코더 동시 호출 수(기본 2)   --pause=N  호출 간격 ms(기본 80)
//   --retry-notfound    캐시에 notfound 로 남은 주소도 다시 시도
//   --skip-derived      파생 재구축 생략(거래를 아직 안 받았을 때는 어차피 빠르다)
// 키: 지오코더는 설정>지도 의 vworld 키(DB 우선, 없으면 .env VWORLD_API_KEY).

import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { isHousingComplexKind, type HousingComplexKind } from '@repo/utils';
import { parseCsv } from '../src/lib/csv.js';
import {
  decodeHousingCsv,
  normalizeHousingComplexRows,
  parseHousingNameHistory,
  replaceHousingComplexes,
} from '../src/modules/housing/housing-complex-master.service.js';
import { rebuildHousingDerived } from '../src/modules/housing/housing-derived.service.js';
import { geocodeLifeRows, type GeocodeAddressType } from '../src/modules/life-map/life-map-geocode.service.js';
import { MapSettingsService } from '../src/modules/settings/map.service.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, '../../../data/open/housing');

const args = process.argv.slice(2);
const flag = (name: string): boolean => args.includes(`--${name}`);
const strOpt = (name: string): string | undefined => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const numOpt = (name: string): number | undefined => {
  const raw = strOpt(name);
  const n = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(n) ? n : undefined;
};
const csvPath = args.find((a) => !a.startsWith('--')) ?? resolve(DATA_DIR, 'reb-complexes.csv');
const namesPath = strOpt('names') ?? resolve(DATA_DIR, 'reb-complex-names.csv');
const DRY_RUN = flag('dry-run');
const OFFLINE = flag('offline');
const SKIP_DERIVED = flag('skip-derived');
const RETRY_NOTFOUND = flag('retry-notfound');
const MAX_CALLS = numOpt('max-calls');
const CONCURRENCY = numOpt('concurrency');
const PAUSE_MS = numOpt('pause');
const kinds = (strOpt('kinds') ?? 'apt')
  .split(',')
  .map((k) => k.trim())
  .filter(isHousingComplexKind) as HousingComplexKind[];

const prisma = new PrismaClient();

const fmt = (n: number): string => n.toLocaleString('ko-KR');

const main = async (): Promise<void> => {
  if (!existsSync(csvPath)) {
    console.error(`CSV 가 없습니다: ${csvPath}\n→ data.go.kr 15106861(한국부동산원_공동주택 단지 식별정보_기본정보) 배포본을 받아 두세요.`);
    process.exitCode = 1;
    return;
  }
  const baseDate =
    strOpt('base-date') ??
    (/(\d{4})(\d{2})(\d{2})/.exec(basename(csvPath))?.slice(1, 4).join('-') || statSync(csvPath).mtime.toLocaleDateString('en-CA'));
  console.log(`\n=== 집값 단지 마스터 적재 ${DRY_RUN ? '(--dry-run)' : ''}${OFFLINE ? ' (--offline)' : ''} ===`);
  console.log(`파일: ${csvPath} · 기준일 ${baseDate} · 종류 ${kinds.join(',')}`);

  const t0 = Date.now();
  const table = parseCsv(decodeHousingCsv(readFileSync(csvPath)));
  console.log(`CSV: ${fmt(table.rows.length)}행 · ${table.header.length}열 (${((Date.now() - t0) / 1000).toFixed(1)}s)`);

  let nameHistory: Map<string, string[]> | undefined;
  if (existsSync(namesPath)) {
    const names = parseCsv(decodeHousingCsv(readFileSync(namesPath)));
    nameHistory = parseHousingNameHistory(names.header, names.rows);
    console.log(`단지명 이력: ${fmt(names.rows.length)}행 → ${fmt(nameHistory.size)}단지`);
  } else {
    console.log(`(단지명 이력 CSV 없음: ${namesPath} — altNames 는 마스터의 다른 이름들만)`);
  }

  const report = normalizeHousingComplexRows(table.header, table.rows, { kinds, nameHistory, baseDate });
  console.log('\n[종류별 채택]');
  for (const [k, n] of report.byKind) console.log(`  ${k}: ${fmt(n)}행`);
  console.log(`  합계: ${fmt(report.rows.length)}행 (시도 ${report.bySido.size})`);
  if (report.skippedKind > 0) console.log(`\n[대상 외 종류 건너뜀] ${fmt(report.skippedKind)}행`);
  if (report.droppedWidth > 0) console.log(`\n[열 수 불일치 drop] ${fmt(report.droppedWidth)}행`);
  if (report.droppedBadId > 0) console.log(`\n[단지번호/PNU 누락 drop] ${fmt(report.droppedBadId)}행`);
  if (report.droppedNoName > 0) console.log(`\n[단지명 없음 drop] ${fmt(report.droppedNoName)}행`);
  if (report.duplicates > 0) console.log(`\n[단지번호 중복 drop] ${fmt(report.duplicates)}행`);
  if (report.droppedBadAddr.length > 0) {
    console.log(`\n[주소 파싱 실패 drop] ${fmt(report.droppedBadAddr.length)}행`);
    for (const d of report.droppedBadAddr.slice(0, 5)) console.log(`  ${d.id}: ${d.addr}`);
  }
  if (DRY_RUN) {
    console.log('\n--dry-run — 지오코딩·적재 생략. 종료.');
    return;
  }

  let key = '';
  if (!OFFLINE) {
    const secret = await new MapSettingsService(prisma, {
      apiKey: process.env.VWORLD_API_KEY ?? '',
      domains: process.env.VWORLD_DOMAINS ?? '',
    }).getSecret('vworld');
    key = secret.apiKey ?? '';
    if (!key) {
      console.error('\nvworld 키가 없습니다 — 어드민 > 설정 > 지도 또는 .env VWORLD_API_KEY 를 채우거나 --offline 으로 캐시만 쓰세요.');
      process.exitCode = 1;
      return;
    }
  }
  const geocodeOpts = { key, offline: OFFLINE, maxCalls: MAX_CALLS, concurrency: CONCURRENCY, pauseMs: PAUSE_MS, retryNotFound: RETRY_NOTFOUND };

  console.log(`\n[지오코딩] 대상 ${fmt(report.rows.length)}행 ${OFFLINE ? '(캐시만)' : ''}`);
  const geoRows = report.rows.map((r) => ({
    roadAddr: null,
    lotAddr: r.addr,
    lat: null as number | null,
    lng: null as number | null,
    geoSource: null as GeocodeAddressType | null,
  }));
  const t1 = Date.now();
  let lastLogged = 0;
  const geo = await geocodeLifeRows(prisma, geoRows, {
    ...geocodeOpts,
    onProgress: (p) => {
      if (p.calls - lastLogged >= 2000) {
        lastLogged = p.calls;
        console.log(`  … 호출 ${fmt(p.calls)} · 확보 ${fmt(p.resolved)} · 남음 ${fmt(p.pending)}`);
      }
    },
  });
  report.rows.forEach((r, i) => {
    const g = geoRows[i]!;
    if (g.lat !== null && g.lng !== null) {
      r.lat = g.lat;
      r.lng = g.lng;
      r.geoSource = g.geoSource;
    }
  });
  console.log(
    `  결과: 좌표 확보 ${fmt(geo.resolved)}/${fmt(geo.rows)} (캐시 ${fmt(geo.cacheHits)} · 호출 ${fmt(geo.apiCalls)} = 성공 ${fmt(geo.apiOk)}/실패 ${fmt(geo.apiNotFound)}) · 미해결 ${fmt(geo.unresolved)} · 미시도 ${fmt(geo.skipped)} (${((Date.now() - t1) / 1000).toFixed(1)}s)`,
  );
  if (geo.stoppedBy) console.log(`  중단 사유: ${geo.stoppedBy} — 캐시는 저장됐으니 다시 실행하면 이어서 진행됩니다.`);

  const t2 = Date.now();
  const { count, geocoded, carriedOver } = await replaceHousingComplexes(prisma, report.rows, { sourceFile: basename(csvPath), baseDate });
  console.log(
    `\nHousingComplex 전량 교체: ${fmt(count)}행(좌표 ${fmt(geocoded)} · 기존 행에서 보강 컬럼 이어받음 ${fmt(carriedOver)}) + 적재 이력(HousingSync) 기록 (${((Date.now() - t2) / 1000).toFixed(1)}s)`,
  );

  if (SKIP_DERIVED) {
    console.log('--skip-derived — 파생 재구축 생략(거래 적재 뒤 load:housing-trades 가 다시 만든다).');
    return;
  }
  const t3 = Date.now();
  const derived = await rebuildHousingDerived(prisma, { geocode: geocodeOpts, rematchAll: true, log: (m) => console.log(`  ${m}`) });
  console.log(
    `\n파생 재구축: 거래 ${fmt(derived.scanned)}건 매칭(지번 ${fmt(derived.matchedByJibun)} · 이름 ${fmt(derived.matchedByName)} · rtms ${fmt(derived.matchedByRtms)} · 미연결 ${fmt(derived.unmatched)}) · rtms 단지 신규 ${fmt(derived.createdRtms)} · 통계 ${fmt(derived.stats)}행 (${((Date.now() - t3) / 1000).toFixed(1)}s)`,
  );
};

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
