// 집값 — 좌표가 비어 있는 아파트 단지 지오코딩 재시도. 도로명주소(공시가격·K-apt·건축물대장 보강으로 채워진
// 것) → 지번 원문 → 지번 변형('0578-0005'→'578-5', '산' 접두 유무, 부번 제거) 순으로 VWorld 를 부른다.
// 캐시(LifeGeocodeCache)는 일상지도와 공유 — 결과는 export:life-geocode 로 압축본에 실어 커밋한다.
//
// 실행: pnpm --filter friendly geocode:housing-missing [옵션]
//   --offline          업스트림 호출 없이 캐시만(변형 주소가 캐시에 있으면 채워진다)
//   --max-calls=N      호출 상한(VWorld 일 한도 분할)   --concurrency=N(기본 2)   --pause=N ms(기본 80)
//   --retry-notfound   캐시에 notfound 로 남은 주소도 다시 시도
//   --skip-variants    지번 변형 단계 생략(도로명·원문만)
// 키: 설정>지도 의 vworld 키(DB 우선, 없으면 .env VWORLD_API_KEY).

import { PrismaClient } from '@prisma/client';
import { geocodeMissingHousingComplexes } from '../src/modules/housing/housing-geocode.service.js';
import { MapSettingsService } from '../src/modules/settings/map.service.js';

const args = process.argv.slice(2);
const flag = (name: string): boolean => args.includes(`--${name}`);
const numOpt = (name: string): number | undefined => {
  const raw = args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const n = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(n) ? n : undefined;
};
const OFFLINE = flag('offline');
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
    if (!key) {
      console.error('vworld 키가 없습니다 — 어드민 > 설정 > 지도 또는 .env VWORLD_API_KEY 를 채우거나 --offline 으로 캐시만 쓰세요.');
      process.exitCode = 1;
      return;
    }
  }
  console.log(`\n=== 집값 단지 좌표 보완 ${OFFLINE ? '(--offline)' : ''} ===`);
  const t0 = Date.now();
  const r = await geocodeMissingHousingComplexes(prisma, {
    geocode: {
      key,
      offline: OFFLINE,
      maxCalls: numOpt('max-calls'),
      concurrency: numOpt('concurrency'),
      pauseMs: numOpt('pause'),
      retryNotFound: flag('retry-notfound'),
    },
    skipVariants: flag('skip-variants'),
    log: (m) => console.log(`  ${m}`),
  });
  console.log(
    `\n대상 ${fmt(r.targets)} · 확보 ${fmt(r.resolved)}(변형으로 ${fmt(r.resolvedByVariant)}) · 미해결 ${fmt(r.unresolved)} · 미시도 ${fmt(r.skipped)} · 호출 ${fmt(r.apiCalls)} (${((Date.now() - t0) / 1000).toFixed(1)}s)`,
  );
  if (r.stoppedBy) console.log(`  중단 사유: ${r.stoppedBy} — 캐시는 저장됐으니 다시 실행하면 이어서 진행됩니다.`);
};

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
