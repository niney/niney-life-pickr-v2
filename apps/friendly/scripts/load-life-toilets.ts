// 일상지도 — 전국 공중화장실 CSV(지방행정인허가데이터개방 localdata.go.kr, CP949) 적재.
// 원본에 좌표가 없어 주소를 VWorld 지오코더로 변환한다(LifeGeocodeCache 영구 캐시 — 재실행은
// 새 주소만 호출). 정규화 → 지오코딩 → LifeToilet 전량 교체.
//
// 실행: pnpm --filter friendly load:life-toilets <csv 경로> [옵션]
//   --dry-run          파싱 + 정규화 리포트만(지오코딩·DB 쓰기 없음).
//   --offline          지오코더를 호출하지 않고 캐시만 쓴다(키 없는 환경·빠른 재적재).
//   --max-calls=N      이번 실행의 지오코더 호출 상한(일 한도 분할용). 남은 행은 다음 실행에서.
//   --concurrency=N    동시 호출 수(기본 2 — 실측상 4 이상이면 업스트림이 연결을 끊는다).
//   --pause=N          호출 사이 간격 ms(워커별, 기본 80). 업스트림이 502 를 내면 늘린다.
//   --retry-notfound   캐시에 notfound 로 남은 주소도 다시 시도.
// 키: 설정>지도 의 vworld 키(DB 우선, 없으면 .env VWORLD_API_KEY) — WMTS 와 같은 인증키.

import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { parseCsv } from '../src/lib/csv.js';
import { MapSettingsService } from '../src/modules/settings/map.service.js';
import {
  decodeLifeCsv,
  normalizeLifeToiletRows,
  replaceLifeToilets,
} from '../src/modules/life-map/life-map-master.service.js';
import { geocodeLifeRows } from '../src/modules/life-map/life-map-geocode.service.js';

const args = process.argv.slice(2);
const flag = (name: string): boolean => args.includes(`--${name}`);
const numOpt = (name: string): number | undefined => {
  const raw = args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const n = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(n) ? n : undefined;
};
const DRY_RUN = flag('dry-run');
const OFFLINE = flag('offline');
const RETRY_NOTFOUND = flag('retry-notfound');
const MAX_CALLS = numOpt('max-calls');
const CONCURRENCY = numOpt('concurrency');
const PAUSE_MS = numOpt('pause');
const file = args.find((a) => !a.startsWith('--'));

const prisma = new PrismaClient();

const main = async (): Promise<void> => {
  if (!file) {
    console.error('사용법: pnpm --filter friendly load:life-toilets <csv 경로> [--dry-run] [--offline] [--max-calls=N]');
    process.exitCode = 1;
    return;
  }
  const path = resolve(file);
  console.log(`\n=== 일상지도 공중화장실 적재 ${DRY_RUN ? '(--dry-run)' : ''}${OFFLINE ? ' (--offline)' : ''} ===\n파일: ${path}`);

  const started = Date.now();
  const table = parseCsv(decodeLifeCsv(readFileSync(path)));
  console.log(`CSV: ${table.header.length}열 × ${table.rows.length}행 (${((Date.now() - started) / 1000).toFixed(1)}s)`);

  const report = normalizeLifeToiletRows(table.header, table.rows);
  console.log('\n[구분별 채택]');
  for (const [kind, n] of [...report.byKind.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${kind}: ${n}행`);
  console.log(`  합계: ${report.rows.length}행 (데이터기준일자 최대 ${report.maxBaseDate ?? '-'})`);
  console.log(`  24시간 ${report.rows.filter((r) => r.open24).length} · 비상벨 ${report.rows.filter((r) => r.bell).length} · 기저귀교환대 ${report.rows.filter((r) => r.diaper).length} · 장애인용 ${report.rows.filter((r) => r.disabled).length}`);
  if (report.droppedWidth > 0) console.log(`\n[열 수 불일치 drop] ${report.droppedWidth}행`);
  if (report.droppedBadId > 0) console.log(`\n[관리번호/자치단체코드 누락 drop] ${report.droppedBadId}행`);
  if (report.duplicates > 0) console.log(`\n[관리번호 중복 접힘] ${report.duplicates}행`);
  if (report.noAddress > 0) console.log(`\n[주소 없음 — 지도 미표시] ${report.noAddress}행`);

  if (DRY_RUN) {
    console.log('\n--dry-run — 지오코딩·적재 생략. 종료.');
    return;
  }

  // 키 — 설정>지도(DB 우선 + env fallback). 오프라인이면 불필요.
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

  console.log(
    `\n[지오코딩] ${OFFLINE ? '캐시만' : `VWorld 지오코더(동시 ${CONCURRENCY ?? 2} · 간격 ${PAUSE_MS ?? 80}ms${MAX_CALLS !== undefined ? ` · 최대 ${MAX_CALLS}콜` : ''})`}`,
  );
  const t1 = Date.now();
  let lastLogged = 0;
  const geo = await geocodeLifeRows(prisma, report.rows, {
    key,
    offline: OFFLINE,
    maxCalls: MAX_CALLS,
    concurrency: CONCURRENCY,
    pauseMs: PAUSE_MS,
    retryNotFound: RETRY_NOTFOUND,
    onProgress: (p) => {
      if (p.calls - lastLogged >= 500) {
        lastLogged = p.calls;
        console.log(`  … 호출 ${p.calls} · 좌표 확보 ${p.resolved} · 대기 ${p.pending}`);
      }
    },
  });
  console.log(
    `  결과: 좌표 확보 ${geo.resolved}/${geo.rows} (캐시 ${geo.cacheHits} · 호출 ${geo.apiCalls} = 성공 ${geo.apiOk}/실패 ${geo.apiNotFound}) · 미해결 ${geo.unresolved} · 후보 없음 ${geo.noCandidate} · 미시도 ${geo.skipped} (${((Date.now() - t1) / 1000).toFixed(1)}s)`,
  );
  if (geo.stoppedBy) console.log(`  중단 사유: ${geo.stoppedBy} — 캐시는 저장됐으니 같은 명령을 다시 실행하면 이어서 진행됩니다.`);

  const t2 = Date.now();
  const { count, geocoded } = await replaceLifeToilets(prisma, report.rows, {
    sourceFile: basename(path),
    baseDate: report.maxBaseDate,
  });
  console.log(`\nLifeToilet 전량 교체: ${count}행(좌표 ${geocoded}행) + 적재 이력(LifeMasterSync) 기록 (${((Date.now() - t2) / 1000).toFixed(1)}s)`);
};

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
