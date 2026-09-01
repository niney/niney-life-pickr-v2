// 집값 — 건축HUB 건축물대장(총괄표제부·표제부, data.go.kr 15134735)으로 단지 속성 보강: 주차대수·최고층·구조·
// 승강기·도로명주소(+비어 있는 세대수·동수·사용승인일). 대상은 PNU 가 있고 아직 조회하지 않은 아파트 단지,
// 세대수 큰 순. 단지당 최대 2콜, 개발계정 일 10,000건 → ≈4.6만 단지는 --max-calls 로 5일쯤 나눠 돈다
// (buildingFetchedAt 장부가 있어 다시 실행하면 이어간다).
//
// 실행: pnpm --filter friendly load:housing-buildings [옵션]
//   --max-calls=N     이번 실행 호출 상한(기본 무제한 — 하루치는 9,800 권장)
//   --sgg=11110,11140 시군구 코드 제한
//   --only-missing    이미 조회했지만 주차·최고층·구조가 전부 비어 있는 단지를 다시(기본은 미조회 단지만)
//   --pause=N         단지 간 대기 ms(기본 120)
//   --probe           세대수 최대 단지 1개만 조회해 응답 필드 인벤토리를 찍고 종료(적재 없음, 2콜)
// 키: BLDG_API_KEY(비면 BUS_API_KEY 폴백 — data.go.kr 계정당 키 1개, 15134735 활용신청 필요).

import { PrismaClient } from '@prisma/client';
import { BldgHubApiAuthError, bldgParamsFromPnu, fetchBldgRecords } from '../src/modules/housing/bldg-hub.adapter.js';
import { loadHousingBuildings, summarizeBldgRecords } from '../src/modules/housing/housing-buildings.service.js';

const args = process.argv.slice(2);
const flag = (name: string): boolean => args.includes(`--${name}`);
const strOpt = (name: string): string | undefined => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const numOpt = (name: string): number | undefined => {
  const raw = strOpt(name);
  const n = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(n) ? n : undefined;
};
const MAX_CALLS = numOpt('max-calls');
const PAUSE_MS = numOpt('pause');
const ONLY_MISSING = flag('only-missing') || flag('retry-empty');
const PROBE = flag('probe');
const sggCds = strOpt('sgg')
  ?.split(',')
  .map((s) => s.trim())
  .filter((s) => /^\d{5}$/.test(s));
const KEY = process.env.BLDG_API_KEY || process.env.BUS_API_KEY || '';

const prisma = new PrismaClient();
const fmt = (n: number): string => n.toLocaleString('ko-KR');

const runProbe = async (): Promise<void> => {
  const c = await prisma.housingComplex.findFirst({
    where: { kind: 'apt', pnu: { not: null }, ...(sggCds && sggCds.length > 0 ? { sggCd: { in: sggCds } } : {}) },
    orderBy: [{ households: 'desc' }],
    select: { id: true, name: true, pnu: true, addr: true },
  });
  if (!c) {
    console.log('PNU 가 있는 단지가 없습니다 — load:housing-complexes 먼저.');
    return;
  }
  const params = bldgParamsFromPnu(c.pnu)!;
  console.log(`\n=== 건축HUB 프로브(2콜) — ${c.name} (${c.addr}, PNU ${c.pnu}) ===`);
  console.log(`파라미터: ${JSON.stringify(params)}`);
  const recap = await fetchBldgRecords('recap', params, { serviceKey: KEY });
  console.log(`총괄표제부 ${recap.items.length}행 (totalCount ${recap.totalCount}) · ${recap.requestUrl}`);
  if (recap.items[0]) console.log(`  필드: ${Object.keys(recap.items[0]).join(', ')}`);
  const title = await fetchBldgRecords('title', params, { serviceKey: KEY });
  console.log(`표제부 ${title.items.length}행 (totalCount ${title.totalCount})`);
  if (title.items[0]) console.log(`  필드: ${Object.keys(title.items[0]).join(', ')}`);
  console.log('요약:', JSON.stringify(summarizeBldgRecords(recap.items, title.items), null, 1));
};

const main = async (): Promise<void> => {
  if (!KEY) {
    console.error('BLDG_API_KEY(또는 BUS_API_KEY)가 없습니다 — .env 확인.');
    process.exitCode = 1;
    return;
  }
  if (PROBE) return runProbe();
  console.log(`\n=== 집값 건축물대장 보강 ${ONLY_MISSING ? '(--only-missing)' : ''}${sggCds?.length ? ` 시군구 ${sggCds.join(',')}` : ''} ===`);
  const t0 = Date.now();
  const r = await loadHousingBuildings(prisma, {
    serviceKey: KEY,
    maxCalls: MAX_CALLS,
    sggCds,
    retryEmpty: ONLY_MISSING,
    pauseMs: PAUSE_MS,
    onProgress: (p) =>
      console.log(`  … ${fmt(p.done)}/${fmt(p.total)} · 호출 ${fmt(p.calls)} · 대장 있음 ${fmt(p.withData)} · 없음 ${fmt(p.empty)} (${p.currentId})`),
  });
  console.log(
    `\n대상 ${fmt(r.targets)} · 처리 ${fmt(r.done)} · 호출 ${fmt(r.calls)} · 대장 있음 ${fmt(r.withData)} · 없음 ${fmt(r.empty)} · 일시 오류 ${fmt(r.transientErrors)} (${((Date.now() - t0) / 1000).toFixed(1)}s)`,
  );
  if (r.authError) {
    console.error(`\n건축HUB 인증 실패(${r.authError.code}): ${r.authError.message}`);
    if (r.authError.code === '30') console.error('→ data.go.kr 15134735(건축HUB_건축물대장정보 서비스) 활용신청 여부와 승인 반영(수십 분)을 확인하세요.');
    process.exitCode = 1;
    return;
  }
  if (r.stoppedBy) console.log(`  중단 사유: ${r.stoppedBy} — 처리한 단지는 저장됐으니 다시 실행하면 이어서 진행됩니다.`);
};

main()
  .catch((e) => {
    if (e instanceof BldgHubApiAuthError) console.error(`\n건축HUB 인증 실패(${e.code}): ${e.message}`);
    else console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
