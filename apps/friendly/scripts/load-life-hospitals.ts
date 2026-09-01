// 일상지도 — 전국 병의원(심평원 병원정보서비스 API, data.go.kr 15001698) 적재.
// 전량 페이징(1000행 × ~80콜, 일 한도 10,000) → 정규화 → 좌표 결측 행만 주소 지오코딩
// (LifeGeocodeCache 영구 캐시 — 재실행은 새 주소만 호출) → LifeHospital 전량 교체.
//
// 실행: pnpm --filter friendly load:life-hospitals [옵션]
//   --dry-run          수집 + 정규화 리포트만(지오코딩·DB 쓰기 없음 — 업스트림 ~80콜은 나간다).
//   --max-pages=N      이번 실행의 페이지 상한(빠른 확인용 — 전량 교체라 부분 적재는 비권장).
//   --offline          지오코더를 호출하지 않고 캐시만 쓴다(좌표 결측 행은 null 로 남는다).
//   --max-calls=N      지오코더 호출 상한(일 한도 분할용).
//   --concurrency=N    지오코더 동시 호출 수(기본 2).
//   --pause=N          지오코더 호출 간격 ms(기본 80).
//   --retry-notfound   캐시에 notfound 로 남은 주소도 다시 시도.
// 키: DATA_GO_KR_API_KEY(data.go.kr 계정 공용 — 15001698 활용신청 필요) / 지오코더는 설정>지도 의
// vworld 키(DB 우선, 없으면 .env VWORLD_API_KEY).

import { PrismaClient } from '@prisma/client';
import { MapSettingsService } from '../src/modules/settings/map.service.js';
import { HiraApiAuthError } from '../src/modules/life-map/hira-hospital.adapter.js';
import {
  fetchAllHiraHospitals,
  normalizeLifeHospitalRows,
  replaceLifeHospitals,
} from '../src/modules/life-map/life-map-hospital-master.service.js';
import { geocodeLifeRows, type GeocodeAddressType } from '../src/modules/life-map/life-map-geocode.service.js';

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
const MAX_PAGES = numOpt('max-pages');
const MAX_CALLS = numOpt('max-calls');
const CONCURRENCY = numOpt('concurrency');
const PAUSE_MS = numOpt('pause');

const HIRA_KEY = process.env.DATA_GO_KR_API_KEY ?? '';

const prisma = new PrismaClient();

const main = async (): Promise<void> => {
  if (!HIRA_KEY) {
    console.error('DATA_GO_KR_API_KEY가 없습니다 — .env 확인.');
    process.exitCode = 1;
    return;
  }
  console.log(`\n=== 일상지도 병의원 적재 ${DRY_RUN ? '(--dry-run)' : ''}${OFFLINE ? ' (--offline)' : ''} ===`);

  const t0 = Date.now();
  const { items, totalCount, pages } = await fetchAllHiraHospitals({
    serviceKey: HIRA_KEY,
    maxPages: MAX_PAGES,
    onPage: (p) => {
      if (p.pageNo % 10 === 0 || p.fetched >= p.totalCount) {
        console.log(`  … ${p.pageNo}페이지 · ${p.fetched.toLocaleString('ko-KR')}/${p.totalCount.toLocaleString('ko-KR')}행`);
      }
    },
  });
  console.log(
    `업스트림: ${items.length.toLocaleString('ko-KR')}행 / totalCount ${totalCount.toLocaleString('ko-KR')} (${pages}콜, ${((Date.now() - t0) / 1000).toFixed(1)}s)`,
  );
  if (MAX_PAGES !== undefined && items.length < totalCount) {
    console.log(`  --max-pages=${MAX_PAGES} — 전량이 아니므로 적재 시 나머지 기관이 빠진다(확인용으로만).`);
  }

  const report = normalizeLifeHospitalRows(items);
  console.log('\n[종별(category)별 채택]');
  for (const [cat, n] of [...report.byCategory.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${cat}: ${n}행`);
  console.log(`  합계: ${report.rows.length}행`);
  if (report.droppedBadId > 0) console.log(`\n[요양기호/기관명 누락 drop] ${report.droppedBadId}행`);
  if (report.duplicates > 0) console.log(`\n[요양기호 중복 접힘] ${report.duplicates}행`);
  const coordPct = report.rows.length > 0 ? (((report.rows.length - report.coordMissing) / report.rows.length) * 100).toFixed(1) : '0';
  console.log(`\n[좌표] 업스트림 보유 ${coordPct}% · 결측 ${report.coordMissing}행(지오코딩 보완 대상)`);

  if (DRY_RUN) {
    console.log('\n--dry-run — 지오코딩·적재 생략. 종료.');
    return;
  }

  // 좌표 결측 행만 지오코딩 — 원본 addr(도로명)을 후보로. LifeHospitalRow.geoSource 는 'api' 를
  // 포함해 GeocodableRow 보다 넓으므로 래퍼로 돌리고 결과를 되쓴다.
  const targets = report.rows.filter((r) => r.lat === null && r.addr);
  if (targets.length > 0) {
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
    console.log(`\n[지오코딩] 대상 ${targets.length}행 ${OFFLINE ? '(캐시만)' : ''}`);
    const geoRows = targets.map((r) => ({
      roadAddr: r.addr,
      lotAddr: null,
      lat: null as number | null,
      lng: null as number | null,
      geoSource: null as GeocodeAddressType | null,
    }));
    const t1 = Date.now();
    const geo = await geocodeLifeRows(prisma, geoRows, {
      key,
      offline: OFFLINE,
      maxCalls: MAX_CALLS,
      concurrency: CONCURRENCY,
      pauseMs: PAUSE_MS,
      retryNotFound: RETRY_NOTFOUND,
    });
    targets.forEach((r, i) => {
      const g = geoRows[i]!;
      if (g.lat !== null && g.lng !== null) {
        r.lat = g.lat;
        r.lng = g.lng;
        r.geoSource = g.geoSource;
      }
    });
    console.log(
      `  결과: 좌표 확보 ${geo.resolved}/${geo.rows} (캐시 ${geo.cacheHits} · 호출 ${geo.apiCalls} = 성공 ${geo.apiOk}/실패 ${geo.apiNotFound}) · 미해결 ${geo.unresolved} · 미시도 ${geo.skipped} (${((Date.now() - t1) / 1000).toFixed(1)}s)`,
    );
    if (geo.stoppedBy) console.log(`  중단 사유: ${geo.stoppedBy} — 캐시는 저장됐으니 다시 실행하면 이어서 진행됩니다.`);
  }

  const t2 = Date.now();
  // 적재일(로컬 자정 기준) — toISOString 은 UTC 라 한국 아침 적재가 전날로 찍힌다.
  const today = new Date().toLocaleDateString('en-CA');
  const { count, geocoded } = await replaceLifeHospitals(prisma, report.rows, {
    sourceFile: 'hira:getHospBasisList',
    baseDate: today,
  });
  console.log(`\nLifeHospital 전량 교체: ${count}행(좌표 ${geocoded}행) + 적재 이력(LifeMasterSync) 기록 (${((Date.now() - t2) / 1000).toFixed(1)}s)`);
};

main()
  .catch((e) => {
    if (e instanceof HiraApiAuthError) {
      console.error(`\nHIRA 인증 실패(${e.code}): ${e.message}`);
      if (e.code === '30') console.error('→ 활용신청 승인 직후엔 게이트웨이 반영까지 수십 분 걸립니다. probe:hira 로 재확인.');
    } else {
      console.error(e);
    }
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
