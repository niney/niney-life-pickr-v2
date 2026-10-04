// 코스 추천·일정표(10차) 점검 — 적재된 여행로그로 실제 결과가 쓸 만한지 눈으로 본다. 서비스와 같은 경로(TourPlanService.plan)를
// 그대로 부르고 읽기만 한다(DB 에 쓰지 않는다). 출력은 공개 응답과 같은 집계뿐이다.
//   ① 조건 없음(기준) 일정표 전체
//   ② 대표 조건 몇 개의 일정표·상위 장소
//   ③ 동반 × 박수 훑기 — 조건마다 비슷한 여행 수·완화·일수(채운/바란)·뼈대 근거·하루 평균 이동·기준 대비 상위 10곳 겹침
//      (겹침이 늘 10이면 비슷한 여행 가중이 순위를 못 바꾸는 것, 일수가 모자라면 후보·권역이 모자란 것)
//
// 실행: pnpm --filter friendly probe:tour-plan [--region=jeju] [--sweep-only]
//   .env 의 DB 를 읽는다. 일정표는 utils TOUR_ITINERARY_REGIONS 지역만 나온다(그 밖은 장소만).
/* eslint-disable no-console */

import { PrismaClient } from '@prisma/client';
import type { TourPlanBodyType, TourPlanResultType } from '@repo/api-contract';
import { isTourRegionKey, tourItineraryDays, tourRegionLabel } from '@repo/utils';
import { TourPlanService } from '../src/modules/tour/tour-plan.service.js';

const args = process.argv.slice(2);
const opt = (name: string, def: string): string => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : def;
};
const regionArg = opt('region', 'jeju');
if (!isTourRegionKey(regionArg)) throw new Error(`모르는 지역: ${regionArg}`);
const region = regionArg;
const SWEEP_ONLY = args.includes('--sweep-only');

const ACCOMPANY = ['나홀로 여행', '2인 여행(가족 외)', '2인 가족 여행', '3인 이상 여행(가족 외)', '3인 이상 가족 여행(친척 포함)', '자녀 동반 여행', '부모 동반 여행', '3대 동반 여행(친척 포함)'];
const NIGHTS = [0, 1, 2, 3, 4];
const SAMPLES: Array<{ label: string; body: Partial<TourPlanBodyType> }> = [
  { label: '30대 · 2인 여행 · 2박', body: { ageGrp: '30', accompany: '2인 여행(가족 외)', nights: 2 } },
  { label: '자녀 동반 · 3박', body: { accompany: '자녀 동반 여행', nights: 3 } },
  { label: '60대 · 부모 동반 · 1박 · 4월(좁은 조건)', body: { ageGrp: '60', accompany: '부모 동반 여행', nights: 1, month: 4 } },
];

const clock = (min: number): string => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const head = (r: TourPlanResultType): string =>
  `비슷한 여행 ${r.matchedTrips}건${r.relaxed.length ? ` · 완화 [${r.relaxed.join(',')}]` : ''}${r.insufficient ? ' · 표본 부족' : ''} · 장소 ${r.places.length}곳(식당 ${r.places.filter((p) => p.kind === '식당').length}) · 폐업 제외 ${r.excludedClosed}`;

const printPlan = (label: string, r: TourPlanResultType, topN = 12): void => {
  console.log(`\n■ ${label}\n  ${head(r)}`);
  for (const p of r.places.slice(0, topN)) {
    const facts = [p.peak && `주로 ${p.peak}`, p.stayMin !== null && `${p.stayMin}분`, p.spendPp !== null && `1인 ${p.spendPp.toLocaleString('ko-KR')}원`, p.similarN !== null && `비슷한 여행 ${p.similarN}건 ×${p.lift}`].filter(Boolean);
    console.log(`  ${String(p.score).padStart(6)}  ${p.kind.padEnd(3)} ${p.name} — ${[p.sigungu, p.emd].filter(Boolean).join(' ')} · ${p.n}건 · 만족 ${p.mean}${facts.length ? ` · ${facts.join(' · ')}` : ''}`);
  }
  if (!r.itinerary) {
    console.log('  일정표 없음');
    return;
  }
  console.log(`  일정표(${r.itinerary.days.length}일 · 이동 근거 ${r.itinerary.legBasis})`);
  for (const d of r.itinerary.days) {
    console.log(`  ${d.day}일차 [${d.area}] ${d.pattern} (${d.patternBasis}) — 이동 ${d.moveMin}분·${d.moveKm}km · 머묾 ${d.stayMin}분${d.spendPp !== null ? ` · 1인 ${d.spendPp.toLocaleString('ko-KR')}원` : ''}`);
    for (const s of d.stops) {
      const move = s.moveMin === null ? '' : ` ← ${s.moveMin}분·${s.moveKm}km`;
      const alts = s.alternatives.length ? ` (대신: ${s.alternatives.map((a) => a.name).join(', ')})` : '';
      console.log(`     ${clock(s.arriveMin)} ${s.kind.padEnd(3)} ${s.name} ${s.stayMin}분 · ${s.n}건 · 만족 ${s.mean}${move}${alts}`);
    }
  }
};

const main = async (): Promise<void> => {
  const prisma = new PrismaClient();
  try {
    const service = new TourPlanService(prisma);
    const base = await service.plan({ region });
    console.log(`코스 추천 점검 — ${tourRegionLabel(region)}(${region})`);
    if (base.places.length === 0) {
      console.log('이 지역에 추천 후보가 없습니다 — 여행로그가 적재됐는지 확인하세요(pnpm --filter friendly status:life-map).');
      return;
    }
    if (!SWEEP_ONLY) {
      printPlan('조건 없음(기준)', base);
      for (const s of SAMPLES) printPlan(s.label, await service.plan({ region, ...s.body }));
    }

    const baseTop = new Set(base.places.slice(0, 10).map((p) => p.name));
    console.log('\n■ 동반 × 박수 훑기 — 여행 수 | 완화 | 일수(채운/바란) | 뼈대(S 비슷한 여행·R 지역·D 기본) | 하루 평균 이동 km | 기준과 겹치는 상위 10곳 | 비슷한 여행 표시 장소');
    const tally = { combos: 0, full: 0, similarDays: 0, days: 0, insufficient: 0 };
    for (const accompany of ACCOMPANY) {
      for (const nights of NIGHTS) {
        const r = await service.plan({ region, accompany, nights });
        const days = r.itinerary?.days ?? [];
        const wanted = tourItineraryDays(nights);
        const basis = days.map((d) => d.patternBasis[0]!.toUpperCase()).join('');
        const km = days.length ? (days.reduce((a, d) => a + d.moveKm, 0) / days.length).toFixed(1) : '–';
        const overlap = r.places.slice(0, 10).filter((p) => baseTop.has(p.name)).length;
        tally.combos += 1;
        tally.full += days.length === wanted ? 1 : 0;
        tally.days += days.length;
        tally.similarDays += days.filter((d) => d.patternBasis === 'similar').length;
        tally.insufficient += r.insufficient ? 1 : 0;
        console.log(
          `  ${accompany.padEnd(18)} ${nights === 4 ? '4박+' : nights === 0 ? '당일' : `${nights}박 `} | ${String(r.matchedTrips).padStart(5)} | ${(r.relaxed.join(',') || '-').padEnd(13)} | ${days.length}/${wanted} | ${basis.padEnd(5)} | ${String(km).padStart(5)} | ${String(overlap).padStart(2)} | ${r.places.filter((p) => p.similarN !== null).length}`,
        );
      }
    }
    console.log(
      `\n요약 — 조건 ${tally.combos}개 중 일수를 다 채운 것 ${tally.full}개, 표본 부족 ${tally.insufficient}개, 일차 ${tally.days}개 중 비슷한 여행 뼈대 ${tally.similarDays}개`,
    );
  } finally {
    await prisma.$disconnect();
  }
};

void main();
