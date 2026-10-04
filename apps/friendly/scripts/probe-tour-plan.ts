// 코스 추천·일정표(10차) 점검 — 적재된 여행로그로 실제 결과가 쓸 만한지 눈으로 본다. 서비스와 같은 경로(TourPlanService.plan)를
// 그대로 부르고 읽기만 한다(DB 에 쓰지 않는다). 출력은 공개 응답과 같은 집계뿐이다.
//   ① 조건 없음(기준) 일정표 전체
//   ② 대표 조건 몇 개의 일정표·상위 장소
//   ③ 입력 확장(11차) — 속도별 하루 자리 수, 대중교통의 이동 분, 숙소 동네별 숙소 이동, 꼭 갈 곳·뺄 곳
//   ④ 동반 × 박수 훑기 — 조건마다 비슷한 여행 수·완화·일수(채운/바란)·뼈대 근거·하루 평균 이동·기준 대비 상위 10곳 겹침
//      (겹침이 늘 10이면 비슷한 여행 가중이 순위를 못 바꾸는 것, 일수가 모자라면 후보·권역이 모자란 것)
//   ⑤ 지역 훑기(13차, --regions) — 일정표를 여는 지역 전부를 당일·1박·2박으로 돌려 거점·채운 일수·하루 자리 수·식사 자리 유무를 한 줄씩
//   ⑥ 다양성(14차, --diversity) — 연령 5 × 동반 8 × 박수 5 = 200개 조건의 일정이 서로 얼마나 다른지(서로 다른 일정·하루·장소 수,
//      가장 흔한 첫날, 자주 나오는 곳)와, 변형 번호·유명도·여행 목적이 한 조건의 일정을 얼마나 바꾸는지
//
// 실행: pnpm --filter friendly probe:tour-plan [--region=jeju] [--sweep-only] [--regions] [--diversity]
//   .env 의 DB 를 읽는다. 일정표는 utils TOUR_ITINERARY_REGIONS 지역만 나온다(그 밖은 장소만).
/* eslint-disable no-console */

import { PrismaClient } from '@prisma/client';
import type { TourPlanBodyType, TourPlanResultType } from '@repo/api-contract';
import { TOUR_REGION_KEYS, isTourItineraryRegion, isTourRegionKey, tourItineraryDays, tourRegionLabel, weatherPlaceById, weatherPlaceLabel } from '@repo/utils';
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
const REGIONS_ONLY = args.includes('--regions');
const DIVERSITY_ONLY = args.includes('--diversity');

const ACCOMPANY = ['나홀로 여행', '2인 여행(가족 외)', '2인 가족 여행', '3인 이상 여행(가족 외)', '3인 이상 가족 여행(친척 포함)', '자녀 동반 여행', '부모 동반 여행', '3대 동반 여행(친척 포함)'];
const NIGHTS = [0, 1, 2, 3, 4];
const AGES = ['20', '30', '40', '50', '60'] as const;
const SAMPLES: Array<{ label: string; body: Partial<TourPlanBodyType> }> = [
  { label: '30대 · 2인 여행 · 2박', body: { ageGrp: '30', accompany: '2인 여행(가족 외)', nights: 2 } },
  { label: '자녀 동반 · 3박', body: { accompany: '자녀 동반 여행', nights: 3 } },
  { label: '60대 · 부모 동반 · 1박 · 4월(좁은 조건)', body: { ageGrp: '60', accompany: '부모 동반 여행', nights: 1, month: 4 } },
];

const clock = (min: number): string => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const head = (r: TourPlanResultType): string =>
  r.regionTrips === 0
    ? '이 DB 에 이 지역 여행로그가 없습니다(load:tour 로 적재한 뒤 다시 실행)'
    : `비슷한 여행 ${r.matchedTrips}건${r.relaxed.length ? ` · 완화 [${r.relaxed.join(',')}]` : ''}${r.insufficient ? ' · 표본 부족' : ''} · 장소 ${r.places.length}곳(식당 ${r.places.filter((p) => p.kind === '식당').length}) · 폐업 제외 ${r.excludedClosed}`;

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
  const wx = weatherPlaceById(r.itinerary.weatherPlaceId);
  console.log(`  일정표(${r.itinerary.days.length}일 · 이동 근거 ${r.itinerary.legBasis}${r.itinerary.base ? ` · 거점 ${r.itinerary.base}` : ''}${wx ? ` · 예보 ${weatherPlaceLabel(wx)}` : ''})`);
  for (const d of r.itinerary.days) {
    console.log(`  ${d.day}일차 [${d.area}] ${d.pattern} (${d.patternBasis}) — 이동 ${d.moveMin}분·${d.moveKm}km · 머묾 ${d.stayMin}분${d.spendPp !== null ? ` · 1인 ${d.spendPp.toLocaleString('ko-KR')}원` : ''}`);
    if (d.fromStayMin !== null) console.log(`     (숙소에서 ${d.fromStayMin}분)`);
    for (const s of d.stops) {
      const move = s.moveMin === null ? '' : ` ← ${s.moveMin}분·${s.moveKm}km`;
      const alts = s.alternatives.length ? ` (대신: ${s.alternatives.map((a) => a.name).join(', ')})` : '';
      console.log(`     ${clock(s.arriveMin)} ${s.kind.padEnd(3)} ${s.pinned ? '[꼭] ' : ''}${s.name} ${s.stayMin}분 · ${s.n}건 · 만족 ${s.mean}${move}${alts}`);
    }
    if (d.toStayMin !== null) console.log(`     (숙소까지 ${d.toStayMin}분)`);
  }
};

// ⑥ 다양성(14차) — 일정에 든 장소 이름으로만 잰다(공개 응답과 같은 집계).
type Stops = Array<{ name: string; kind: string; n: number; mean: number | null }>;
const stopsOf = (r: TourPlanResultType): Stops => r.itinerary?.days.flatMap((d) => d.stops) ?? [];
const daysOf = (r: TourPlanResultType): string[] => r.itinerary?.days.map((d) => d.stops.map((x) => x.name).join('→')) ?? [];
const jaccard = (a: Stops, b: Stops): number => {
  const A = new Set(a.map((x) => x.name));
  const B = new Set(b.map((x) => x.name));
  const both = [...A].filter((x) => B.has(x)).length;
  return both / (A.size + B.size - both || 1);
};
const tally = (xs: string[]): Map<string, number> => {
  const m = new Map<string, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return m;
};
const meanSat = (xs: Stops): string => (xs.reduce((a, x) => a + (x.mean ?? 0), 0) / Math.max(1, xs.length)).toFixed(2);
const medianN = (xs: Stops): number => [...xs.map((x) => x.n)].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;

const diversity = async (service: TourPlanService): Promise<void> => {
  console.log(`코스 다양성 점검 — ${tourRegionLabel(region)}(${region})`);
  const runs: Array<{ nights: number; relaxed: string[]; stops: Stops; days: string[]; list: string[] }> = [];
  for (const ageGrp of AGES) {
    for (const accompany of ACCOMPANY) {
      for (const nights of NIGHTS) {
        const r = await service.plan({ region, ageGrp, accompany, nights });
        runs.push({ nights, relaxed: r.relaxed, stops: stopsOf(r), days: daysOf(r), list: r.places.map((x) => x.name) });
      }
    }
  }
  const n = runs.length;
  const pct = (c: number): string => `${Math.round((c / n) * 100)}%`;
  const inRuns = tally(runs.flatMap((r) => [...new Set(r.stops.map((x) => x.name))]));
  const firstDays = tally(runs.map((r) => r.days[0] ?? '-'));
  console.log(`\n■ 조건 ${n}개(연령 ${AGES.length} × 동반 ${ACCOMPANY.length} × 박수 ${NIGHTS.length}) — 조건을 풀지 않은 것 ${runs.filter((r) => r.relaxed.length === 0).length}개 · 연령까지 푼 것 ${runs.filter((r) => r.relaxed.includes('ageGrp')).length}개`);
  console.log(`  서로 다른 일정표 ${new Set(runs.map((r) => r.days.join(' / '))).size}개 · 서로 다른 하루 ${new Set(runs.flatMap((r) => r.days)).size}개(전체 ${runs.reduce((a, r) => a + r.days.length, 0)}일) · 서로 다른 첫날 ${firstDays.size}개`);
  console.log(`  일정에 한 번이라도 나온 장소 ${inRuns.size}곳 · 목록에 한 번이라도 나온 장소 ${new Set(runs.flatMap((r) => r.list)).size}곳`);
  console.log(`  자주 나오는 곳: ${[...inRuns.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, c]) => `${name} ${pct(c)}`).join(' · ')}`);
  console.log(`  가장 흔한 첫날: ${[...firstDays.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([d, c]) => `${pct(c)} ${d}`).join(' | ')}`);
  for (const nights of NIGHTS) {
    const g = runs.filter((r) => r.nights === nights);
    let sum = 0;
    let pairs = 0;
    for (let i = 0; i < g.length; i += 1) {
      for (let j = i + 1; j < g.length; j += 1) {
        sum += jaccard(g[i]!.stops, g[j]!.stops);
        pairs += 1;
      }
    }
    console.log(`  ${nights === 0 ? '당일' : `${nights}박`}: 서로 다른 일정 ${new Set(g.map((r) => r.days.join('/'))).size}/${g.length} · 두 조건의 장소 겹침(자카드) 평균 ${(sum / Math.max(1, pairs)).toFixed(2)}`);
  }

  const seg = { region, ...SAMPLES[0]!.body };
  const base = await service.plan(seg);
  const b = stopsOf(base);
  console.log(`\n■ 한 조건(${SAMPLES[0]!.label})에서 — 기준: ${daysOf(base).join(' / ')}`);
  const VARIANTS = 12;
  const seen = new Set(b.map((x) => x.name));
  const courses = new Set<string>();
  let overlap = 0;
  let sat = 0;
  for (let v = 1; v <= VARIANTS; v += 1) {
    const r = await service.plan({ ...seg, variant: v });
    const s = stopsOf(r);
    for (const x of s) seen.add(x.name);
    courses.add(daysOf(r).join(' / '));
    overlap += jaccard(b, s);
    sat += Number(meanSat(s));
  }
  console.log(`  다른 코스 보기 1~${VARIANTS}번: 서로 다른 코스 ${courses.size}개 · 기준과 장소 겹침 평균 ${(overlap / VARIANTS).toFixed(2)} · 나온 장소 ${seen.size}곳(기준 ${b.length}곳) · 평균 만족도 ${(sat / VARIANTS).toFixed(2)}(기준 ${meanSat(b)})`);
  for (const fame of ['famous', 'mixed', 'hidden'] as const) {
    const r = await service.plan({ ...seg, fame });
    const s = stopsOf(r);
    console.log(`  장소 ${fame.padEnd(6)}: 일정 장소의 여행 수 중앙 ${medianN(s)}건 · 평균 만족도 ${meanSat(s)} · 기준과 겹침 ${jaccard(b, s).toFixed(2)} · 목록 상위: ${r.places.slice(0, 4).map((x) => `${x.name}(${x.n})`).join(', ')}`);
  }
  for (const purpose of ['history', 'hiking', 'theme', 'culture', 'sports', 'filming'] as const) {
    const r = await service.plan({ ...seg, purposes: [purpose] });
    const s = stopsOf(r);
    const fit = r.itinerary?.days.flatMap((d) => d.stops.filter((x) => x.purposeFit).map((x) => x.name)) ?? [];
    console.log(`  목적 ${purpose.padEnd(8)}: 기준과 겹침 ${jaccard(b, s).toFixed(2)} · 평균 만족도 ${meanSat(s)} · 목적에 맞는 곳 ${fit.length}곳${fit.length ? ` — ${fit.slice(0, 5).join(', ')}` : ''}`);
  }
};

const main = async (): Promise<void> => {
  const prisma = new PrismaClient();
  try {
    const service = new TourPlanService(prisma);
    if (REGIONS_ONLY) {
      console.log('지역 훑기 — 지역 | 여행 | 후보(식당) | 박수: 채운/바란 일수 · 일차별 자리 수(식당 수) · 거점 · 예보 지점');
      for (const key of TOUR_REGION_KEYS.filter(isTourItineraryRegion)) {
        const first = await service.plan({ region: key });
        console.log(`\n${tourRegionLabel(key)}(${key}) | 여행 ${first.regionTrips} | 목록 ${first.places.length}곳(식당 ${first.places.filter((x) => x.kind === '식당').length}) | 숙소 동네 ${first.areas.length}곳`);
        for (const nights of [0, 1, 2]) {
          const r = await service.plan({ region: key, nights });
          const it = r.itinerary;
          const wx = weatherPlaceById(it?.weatherPlaceId);
          const days = it ? it.days.map((d) => `${d.stops.length}(${d.stops.filter((x) => x.kind === '식당').length})`).join(' ') : '-';
          console.log(
            `  ${nights === 0 ? '당일' : `${nights}박`}: ${it?.days.length ?? 0}/${tourItineraryDays(nights)}일 · 자리 ${days} · 거점 ${it?.base ?? '-'} · 예보 ${wx ? weatherPlaceLabel(wx) : '-'}${it ? ` · ${it.days.map((d) => `[${d.area}] ${d.stops.map((x) => x.name).join('→')}`).join(' / ')}` : ''}`,
          );
        }
      }
      return;
    }
    if (DIVERSITY_ONLY) {
      await diversity(service);
      return;
    }
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

    if (!SWEEP_ONLY && base.itinerary) {
      const seg = { region, ...SAMPLES[0]!.body };
      const line = (r: TourPlanResultType): string =>
        r.itinerary ? r.itinerary.days.map((d) => `${d.day}일차 ${d.stops.length}곳·이동 ${d.moveMin}분${d.fromStayMin !== null ? `·숙소에서 ${d.fromStayMin}분` : ''}${d.toStayMin !== null ? `·숙소까지 ${d.toStayMin}분` : ''}`).join(' / ') : '일정표 없음';
      console.log(`\n■ 입력 확장 — ${SAMPLES[0]!.label} 기준`);
      for (const pace of ['relaxed', 'normal', 'packed'] as const) console.log(`  속도 ${pace.padEnd(7)} ${line(await service.plan({ ...seg, pace }))}`);
      const transit = await service.plan({ ...seg, transport: 'transit' });
      console.log(`  대중교통(이동 근거 ${transit.itinerary?.legBasis ?? '-'})  ${line(transit)}`);
      console.log(`  숙소 동네 선택지 ${base.areas.length}곳: ${base.areas.map((a) => `${a.label}(${a.n})`).join(' · ')}`);
      for (const area of base.areas.slice(0, 3)) console.log(`  숙소 ${area.label}  ${line(await service.plan({ ...seg, stayArea: area.label }))}`);
      // 꼭 갈 곳 — 기준 일정에 없던 상위 장소 둘, 뺄 곳 — 기준 일정의 첫 장소.
      const segBase = await service.plan(seg);
      const inPlan = new Set(segBase.itinerary?.days.flatMap((d) => d.stops.map((x) => x.name)) ?? []);
      const must = segBase.places.filter((p) => !inPlan.has(p.name)).slice(0, 2).map((p) => ({ name: p.name, emd: p.emd }));
      const gone = segBase.itinerary?.days[0]?.stops[0];
      if (must.length > 0 && gone) {
        const edited = await service.plan({ ...seg, must, avoid: [{ name: gone.name, emd: gone.emd }] });
        printPlan(`꼭 갈 곳 [${must.map((m) => m.name).join(', ')}] · 뺄 곳 [${gone.name}]${edited.itinerary?.unplaced.length ? ` · 못 넣음 [${edited.itinerary.unplaced.join(', ')}]` : ''}`, edited, 0);
      }
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
