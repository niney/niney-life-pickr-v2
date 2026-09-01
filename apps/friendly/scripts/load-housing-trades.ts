// 집값 — 국토교통부 아파트 실거래가(매매 상세 15126468 · 전월세 15126474) 적재.
// 단지 마스터의 시군구 × 계약년월 × 오퍼레이션 파티션을 순차 호출해 파티션 교체로 쓰고, 끝에 파생
// (거래↔단지 매칭·rtms 단지·통계)을 재구축한다. 장부(HousingTradeSync)에 있는 파티션은 건너뛰되
// 최근 --recent 개월은 다시 받는다(신고 지연 30일·해제 반영).
//
// 실행: pnpm --filter friendly load:housing-trades [옵션]
//   --from=YYYYMM --to=YYYYMM  대상 계약년월(기본 to=이번 달, from=to-(months-1))
//   --months=N          기본 24
//   --recent=N          장부에 있어도 다시 받을 최근 개월 수(기본 3, 0 이면 안 받음)
//   --force             장부 무시 전부 다시
//   --types=trade,rent  오퍼레이션(기본 둘 다)
//   --sgg=11110,11140   시군구 코드 제한(기본 단지 마스터의 전체 시군구)
//   --max-calls=N       이번 실행 호출 상한(개발계정 일 10,000건 — 전국 1개월 ≈ 504콜)
//   --pause=N           파티션 사이 대기 ms(기본 150)
//   --dry-run           수집·정규화만(DB 쓰기·파생 없음 — 호출은 나간다)
//   --skip-derived      파생 재구축 생략
//   --offline           파생의 지오코더(새 rtms 단지)를 캐시만 쓴다   --max-geocode-calls=N
// 키: RTMS_API_KEY(비면 BUS_API_KEY 폴백 — data.go.kr 계정당 키 1개, 두 데이터셋 활용신청 필요).

import { PrismaClient } from '@prisma/client';
import { housingCurrentYm, housingYmAdd, housingYmRange } from '@repo/utils';
import { rebuildHousingDerived } from '../src/modules/housing/housing-derived.service.js';
import { runHousingTradeIngest } from '../src/modules/housing/housing-ingest.service.js';
import type { RtmsOp } from '../src/modules/housing/rtms.adapter.js';
import { MapSettingsService } from '../src/modules/settings/map.service.js';

const args = process.argv.slice(2);
const flag = (name: string): boolean => args.includes(`--${name}`);
const strOpt = (name: string): string | undefined => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const numOpt = (name: string): number | undefined => {
  const raw = strOpt(name);
  const n = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(n) ? n : undefined;
};
const DRY_RUN = flag('dry-run');
const FORCE = flag('force');
const SKIP_DERIVED = flag('skip-derived');
const OFFLINE = flag('offline');
const MONTHS = numOpt('months') ?? 24;
const RECENT = numOpt('recent') ?? 3;
const MAX_CALLS = numOpt('max-calls');
const PAUSE_MS = numOpt('pause');
const TO = strOpt('to') ?? housingCurrentYm();
const FROM = strOpt('from') ?? housingYmAdd(TO, -(Math.max(1, MONTHS) - 1));
const types = (strOpt('types') ?? 'trade,rent')
  .split(',')
  .map((t) => t.trim())
  .filter((t): t is RtmsOp => t === 'trade' || t === 'rent');
const sggCds = strOpt('sgg')
  ?.split(',')
  .map((s) => s.trim())
  .filter((s) => /^\d{5}$/.test(s));

const KEY = process.env.RTMS_API_KEY || process.env.BUS_API_KEY || '';
const prisma = new PrismaClient();
const fmt = (n: number): string => n.toLocaleString('ko-KR');

const main = async (): Promise<void> => {
  if (!KEY) {
    console.error('RTMS_API_KEY(또는 BUS_API_KEY)가 없습니다 — .env 확인.');
    process.exitCode = 1;
    return;
  }
  const yms = housingYmRange(FROM, TO);
  if (yms.length === 0) {
    console.error(`계약년월 범위가 비었습니다: ${FROM}~${TO}`);
    process.exitCode = 1;
    return;
  }
  const refreshYms = RECENT > 0 ? yms.slice(-RECENT) : [];
  console.log(`\n=== 집값 실거래 적재 ${DRY_RUN ? '(--dry-run)' : ''}${FORCE ? ' (--force)' : ''} ===`);
  console.log(`계약년월 ${FROM}~${TO}(${yms.length}개월) · 재수집 ${refreshYms.join(',') || '없음'} · 오퍼레이션 ${types.join(',')}${sggCds ? ` · 시군구 ${sggCds.join(',')}` : ''}`);

  const t0 = Date.now();
  const ingest = await runHousingTradeIngest(prisma, {
    serviceKey: KEY,
    yms,
    types,
    sggCds,
    refreshYms,
    force: FORCE,
    maxCalls: MAX_CALLS,
    pauseMs: PAUSE_MS,
    dryRun: DRY_RUN,
    onSkip: (p) => {
      console.log(`파티션 ${fmt(p.planned)}개 계획(장부에 있어 건너뜀 ${fmt(p.skipped)})`);
      if (p.planned === 0) console.log('  받을 파티션이 없습니다 — 단지 마스터(load:housing-complexes) 적재 여부와 --recent/--force 를 확인하세요.');
    },
    onProgress: (p) => {
      if (p.done % 25 === 0 || p.done === p.total) {
        console.log(`  … ${fmt(p.done)}/${fmt(p.total)} · 호출 ${fmt(p.calls)} · 누적 ${fmt(p.rows)}행 (${p.current.ym} ${p.current.sggCd} ${p.current.op} ${fmt(p.partitionRows)}행)`);
      }
    },
  });
  console.log(
    `\n수집: 파티션 ${fmt(ingest.done)}/${fmt(ingest.planned)} · 호출 ${fmt(ingest.calls)} · ${fmt(ingest.rows)}행(매매 ${fmt(ingest.byType.trade)} · 전세 ${fmt(ingest.byType.jeonse)} · 월세 ${fmt(ingest.byType.monthly)}) · drop ${fmt(ingest.dropped)} · 일시 오류 ${fmt(ingest.transientErrors)} (${((Date.now() - t0) / 1000).toFixed(1)}s)`,
  );
  if (ingest.pageCap !== null) console.log(`  게이트웨이 페이지 상한 관측: numOfRows ${ingest.pageCap}`);
  if (ingest.authError) {
    console.error(`\nRTMS 인증 실패(${ingest.authError.code}): ${ingest.authError.message}`);
    if (ingest.authError.code === '30') console.error('→ 15126468·15126474 활용신청 여부와 승인 반영(수십 분) 확인. probe:rtms 로 재확인.');
    process.exitCode = 1;
    return;
  }
  if (ingest.stoppedBy) console.log(`  중단 사유: ${ingest.stoppedBy} — 받은 파티션은 저장됐으니 다시 실행하면 이어서 진행됩니다.`);
  if (DRY_RUN || SKIP_DERIVED) {
    console.log(DRY_RUN ? '\n--dry-run — 적재·파생 생략. 종료.' : '\n--skip-derived — 파생 재구축 생략.');
    return;
  }

  let key = '';
  if (!OFFLINE) {
    const secret = await new MapSettingsService(prisma, {
      apiKey: process.env.VWORLD_API_KEY ?? '',
      domains: process.env.VWORLD_DOMAINS ?? '',
    }).getSecret('vworld');
    key = secret.apiKey ?? '';
    if (!key) console.log('\n(vworld 키가 없어 새 rtms 단지 지오코딩은 캐시만 씁니다)');
  }
  const t1 = Date.now();
  const derived = await rebuildHousingDerived(prisma, {
    geocode: { key, offline: OFFLINE || !key, maxCalls: numOpt('max-geocode-calls') },
    log: (m) => console.log(`  ${m}`),
  });
  await prisma.housingSync.createMany({
    data: [
      { kind: 'trade', count: ingest.byType.trade, sourceFile: `rtms:${FROM}-${TO}` },
      { kind: 'rent', count: ingest.byType.jeonse + ingest.byType.monthly, sourceFile: `rtms:${FROM}-${TO}` },
    ],
  });
  console.log(
    `\n파생 재구축: 거래 ${fmt(derived.scanned)}건 매칭(지번 ${fmt(derived.matchedByJibun)} · 이름 ${fmt(derived.matchedByName)} · rtms ${fmt(derived.matchedByRtms)} · 미연결 ${fmt(derived.unmatched)}) · rtms 단지 신규 ${fmt(derived.createdRtms)}(재사용 ${fmt(derived.reusedRtms)}) · 통계 ${fmt(derived.stats)}행 (${((Date.now() - t1) / 1000).toFixed(1)}s)`,
  );
  if (derived.geocode) {
    console.log(
      `  지오코딩: 확보 ${fmt(derived.geocode.resolved)}/${fmt(derived.geocode.rows)} (호출 ${fmt(derived.geocode.apiCalls)}) · 미시도 ${fmt(derived.geocode.skipped)}${derived.geocode.stoppedBy ? ` · 중단 ${derived.geocode.stoppedBy}` : ''}`,
    );
  }
};

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
