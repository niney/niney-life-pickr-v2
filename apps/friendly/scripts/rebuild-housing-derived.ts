// 집값 — 파생(거래↔단지 매칭 · rtms 단지 · 단지×유형×구간 통계)만 재구축. 거래·단지 적재 스크립트가
// 끝에 자동으로 하는 일과 같다 — --skip-derived 로 나눠 적재했거나, 통계 12개월 창을 오늘 기준으로
// 다시 자르고 싶을 때(월 갱신 없이도 count12 가 바뀐다) 쓴다.
//
// 실행: pnpm --filter friendly rebuild:housing-derived [옵션]
//   --rematch-all       이미 단지에 붙은 거래도 다시 매칭(단지 마스터가 바뀐 뒤)
//   --offline           새 rtms 단지 지오코딩을 캐시만으로   --max-calls=N  지오코더 호출 상한
// 지오코더 키는 설정>지도의 vworld 키(DB 우선, 없으면 .env VWORLD_API_KEY).

import { PrismaClient } from '@prisma/client';
import { rebuildHousingDerived } from '../src/modules/housing/housing-derived.service.js';
import { MapSettingsService } from '../src/modules/settings/map.service.js';

const args = process.argv.slice(2);
const flag = (name: string): boolean => args.includes(`--${name}`);
const numOpt = (name: string): number | undefined => {
  const raw = args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const n = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(n) ? n : undefined;
};
const OFFLINE = flag('offline');
const REMATCH_ALL = flag('rematch-all');
const prisma = new PrismaClient();
const fmt = (n: number): string => n.toLocaleString('ko-KR');

const main = async (): Promise<void> => {
  let key = '';
  if (!OFFLINE) {
    const secret = await new MapSettingsService(prisma, {
      apiKey: process.env.VWORLD_API_KEY ?? '',
      domains: process.env.VWORLD_DOMAINS ?? '',
    }).getSecret('vworld');
    key = secret.apiKey ?? '';
    if (!key) console.log('(vworld 키가 없어 새 rtms 단지 지오코딩은 캐시만 씁니다)');
  }
  console.log(`\n=== 집값 파생 재구축${REMATCH_ALL ? ' (--rematch-all)' : ''}${OFFLINE ? ' (--offline)' : ''} ===`);
  const t0 = Date.now();
  const r = await rebuildHousingDerived(prisma, {
    geocode: { key, offline: OFFLINE || !key, maxCalls: numOpt('max-calls') },
    rematchAll: REMATCH_ALL,
    log: (m) => console.log(`  ${m}`),
  });
  console.log(
    `\n거래 ${fmt(r.scanned)}건 매칭(지번 ${fmt(r.matchedByJibun)} · 이름 ${fmt(r.matchedByName)} · rtms ${fmt(r.matchedByRtms)} · 미연결 ${fmt(r.unmatched)}) · rtms 단지 신규 ${fmt(r.createdRtms)}(재사용 ${fmt(r.reusedRtms)}) · 통계 ${fmt(r.stats)}행 (${((Date.now() - t0) / 1000).toFixed(1)}s)`,
  );
  if (r.geocode) {
    console.log(
      `지오코딩: 확보 ${fmt(r.geocode.resolved)}/${fmt(r.geocode.rows)} (호출 ${fmt(r.geocode.apiCalls)}) · 미시도 ${fmt(r.geocode.skipped)}${r.geocode.stoppedBy ? ` · 중단 ${r.geocode.stoppedBy}` : ''}`,
    );
  }
};

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
