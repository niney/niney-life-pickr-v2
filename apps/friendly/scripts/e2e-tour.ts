// 여행로그 공개 화면 e2e — 미리 띄운 friendly(3000) + Vite 웹(5173)에 헤드리스 크로미움으로 붙어 실동작을 본다.
//   ① 공개 API 계약·소셀 억제(여행자 5명 미만 셀 없음, 응답 키에 식별자 없음) · 관리자 라우트 무인증 차단
//   ② /travel/jeju — 필터 칩 → URL 쿼리 → 집계 갱신 → 초기화, 지역 비교·숙소 섹션, 출처 문구, 모바일 폭 가로 넘침 없음
//   ③ /travel/plan — 제출 → 일정표(일차·시각·이동)·추천 카드·완화 안내, 식당만 토글, 그룹투표 버튼(미선택 → 비활성), 제주 밖 지역의
//      일정표·거점 안내(13차), '전체' 는 장소만,
//      일정 편집(11차 — 빼기·꼭 갈 곳·숙소 동네가 고르는 즉시 다시 짜인다)
//   ④ /life-map — 배경 "여행자 밀도" 토글 → 제주로 이동·요약 카드·푸터 출처, 칸 클릭 → 선택 칸 카드, 종류 칩, 범죄 통계와 배타
// 페이지 JS 오류·콘솔 error 는 전부 모아 마지막에 보고한다(리소스 404 는 따로).
//
//   pnpm --filter friendly e2e:tour [--web=http://localhost:5173] [--api=http://localhost:3000] [--shots=<dir>] [--headed]
/* eslint-disable no-console */

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type ConsoleMessage, type Page } from 'playwright';
import { TOUR_DATASET_KEYS, TOUR_REGIONS, tourSampleRegionAt } from '@repo/utils';

const arg = (name: string, def: string): string => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : def;
};
const WEB = arg('web', 'http://localhost:5173');
const API = arg('api', 'http://localhost:3000');
const SHOTS = arg('shots', join(process.cwd(), 'data', 'e2e-shots'));
const HEADED = process.argv.includes('--headed');
mkdirSync(SHOTS, { recursive: true });

// ── 결과 수집 ─────────────────────────────────────────────────────────────────
const results: Array<{ name: string; ok: boolean; note: string }> = [];
const consoleErrors: string[] = [];
const resourceErrors: string[] = [];
const check = (name: string, ok: boolean, note = ''): void => {
  results.push({ name, ok, note });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? ` — ${note}` : ''}`);
};
const step = async (name: string, fn: () => Promise<string | void>): Promise<void> => {
  try {
    const note = await fn();
    check(name, true, note ?? '');
  } catch (e) {
    check(name, false, e instanceof Error ? e.message.split('\n')[0]! : String(e));
  }
};
const FORBIDDEN = /^(travelId|visitAreaId|travelerLabel|photoId|tourPlaceId)$/;
const scanKeys = (v: unknown, path: string[] = [], out: string[] = []): string[] => {
  if (Array.isArray(v)) v.forEach((x, i) => scanKeys(x, [...path, String(i)], out));
  else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (FORBIDDEN.test(k)) out.push([...path, k].join('.'));
      scanKeys(x, [...path, k], out);
    }
  }
  return out;
};
const getJson = async <T>(path: string): Promise<{ status: number; body: T }> => {
  const res = await fetch(`${API}${path}`);
  return { status: res.status, body: (await res.json().catch(() => null)) as T };
};

// ── ① API ─────────────────────────────────────────────────────────────────────
interface Insights {
  insufficient: boolean;
  scale: { trips: number; visits: number; places: number; restaurants: number };
  accompany: Array<{ n: number }>;
  emd: Array<{ n: number }>;
  ageGender: Array<{ n: number }>;
  sourceNote: string;
}
interface Density {
  cells: Array<{ x: number; y: number; n: number; travelers: number }>;
  breaks: number[];
  total: { cells: number; visits: number };
}
const apiChecks = async (): Promise<void> => {
  await step('API insights 기본(제주) — 200·여행 ≥ 20·집단 셀 n ≥ 5·식별자 없음', async () => {
    const { status, body } = await getJson<Insights>('/api/v1/tour/public/insights');
    if (status !== 200) throw new Error(`status ${status}`);
    if (body.insufficient || body.scale.trips < 20) throw new Error(`trips ${body.scale.trips}`);
    const small = [...body.accompany, ...body.emd, ...body.ageGender].filter((x) => x.n < 5);
    if (small.length) throw new Error(`n<5 셀 ${small.length}`);
    const leaked = scanKeys(body);
    if (leaked.length) throw new Error(`식별자 키 ${leaked.join(',')}`);
    if (!body.sourceNote.includes('aihub.or.kr')) throw new Error('출처 문구 없음');
    return `여행 ${body.scale.trips} · 방문 ${body.scale.visits} · 장소 ${body.scale.places} · 식당 ${body.scale.restaurants}`;
  });
  await step('API insights 좁은 필터 — insufficient 안내', async () => {
    const { status, body } = await getJson<Insights>('/api/v1/tour/public/insights?ageGrp=60&gender=남&nights=0&month=4');
    if (status !== 200) throw new Error(`status ${status}`);
    return `trips ${body.scale.trips} · insufficient ${body.insufficient}`;
  });
  await step('API insights 잘못된 필터 — 400', async () => {
    const { status } = await getJson('/api/v1/tour/public/insights?ageGrp=70');
    if (status !== 400) throw new Error(`status ${status}`);
  });
  interface PlanStop {
    name: string;
    kind: string;
    emd: string | null;
    n: number;
    arriveMin: number;
    moveMin: number | null;
    pinned: boolean;
    alternatives: Array<{ name: string; n: number }>;
  }
  interface Plan {
    regionTrips: number;
    matchedTrips: number;
    relaxed: string[];
    places: Array<{ name: string; emd: string | null; n: number; kind: string; similarN: number | null }>;
    templates: unknown[];
    itinerary: {
      legBasis: string;
      transport: string;
      stayArea: string | null;
      unplaced: string[];
      base: string | null;
      weatherPlaceId: string | null;
      days: Array<{ day: number; area: string; pattern: string; stops: PlanStop[]; fromStayMin: number | null; toStayMin: number | null; wet: boolean }>;
    } | null;
    areas: Array<{ label: string; n: number }>;
  }
  const postPlan = async (payload: object): Promise<{ status: number; body: Plan }> => {
    const res = await fetch(`${API}/api/v1/tour/public/plan`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    return { status: res.status, body: (await res.json()) as Plan };
  };
  await step('API plan — 추천 장소 n ≥ 5·비슷한 여행 5건 미만은 null·식별자·좌표 없음', async () => {
    const { status, body } = await postPlan({ ageGrp: '30', accompany: '2인 여행(가족 외)', nights: 2 });
    if (status !== 200) throw new Error(`status ${status}`);
    if (body.places.length === 0) throw new Error('places 0');
    if (body.places.some((p) => p.n < 5)) throw new Error('n<5 장소');
    if (body.places.some((p) => p.similarN !== null && p.similarN < 5)) throw new Error('similarN<5');
    if (body.places.some((p) => p.kind === '교통' || p.kind === '숙소')) throw new Error('교통·숙소 포함');
    const leaked = [...scanKeys(body), ...(/"(lat|lng|latitude|longitude)"/.test(JSON.stringify(body)) ? ['좌표 키'] : [])];
    if (leaked.length) throw new Error(`식별자·좌표 키 ${leaked.join(',')}`);
    return `region ${body.regionTrips} · matched ${body.matchedTrips} · relaxed [${body.relaxed.join(',')}] · places ${body.places.length}(식당 ${body.places.filter((p) => p.kind === '식당').length}) · templates ${body.templates.length}`;
  });
  await step('API plan 일정표(10차) — 제주 2박은 3일·장소 중복 없음·시각 오름차순·첫 장소 이동 null', async () => {
    const { body } = await postPlan({ ageGrp: '30', accompany: '2인 여행(가족 외)', nights: 2 });
    const it = body.itinerary;
    if (!it) throw new Error('itinerary null');
    if (it.days.length !== 3) throw new Error(`days ${it.days.length}`);
    const names = it.days.flatMap((d) => d.stops.map((s) => s.name));
    if (new Set(names).size !== names.length) throw new Error('장소 중복');
    for (const d of it.days) {
      if (d.stops.length < 2) throw new Error(`${d.day}일차 장소 ${d.stops.length}`);
      if (d.stops[0]!.moveMin !== null) throw new Error('첫 장소 이동');
      if (d.stops.some((s, i) => i > 0 && (s.arriveMin < d.stops[i - 1]!.arriveMin || s.moveMin === null))) throw new Error(`${d.day}일차 시각·이동`);
      if (d.stops.some((s) => s.n < 5 || ['교통', '숙소', '상점'].includes(s.kind) || s.alternatives.some((a) => a.n < 5))) throw new Error(`${d.day}일차 후보 규칙`);
    }
    return `${it.days.map((d) => `${d.day}일차 ${d.area} ${d.pattern}`).join(' / ')} · 이동 ${it.legBasis}`;
  });
  await step("API plan — '전체' 는 일정표 없이 장소만(itinerary null)", async () => {
    const { status, body } = await postPlan({ region: 'all', nights: 2 });
    if (status !== 200) throw new Error(`status ${status}`);
    if (body.itinerary !== null) throw new Error('itinerary 있음');
    if (body.areas.length !== 0) throw new Error('areas 있음');
    return `places ${body.places.length}`;
  });
  await step('API plan 제주 밖(13차) — 부산 1박은 이틀·거점 동네와 예보 지점이 오고, 제주는 거점 없이 제주시 예보', async () => {
    const { status, body } = await postPlan({ region: 'busan', nights: 1 });
    if (status !== 200) throw new Error(`status ${status}`);
    const it = body.itinerary;
    if (!it) throw new Error('itinerary 없음');
    if (it.days.length !== 2) throw new Error(`일수 ${it.days.length}`);
    if (!it.base) throw new Error('거점 없음');
    if (!it.weatherPlaceId) throw new Error('예보 지점 없음');
    const names = it.days.flatMap((d) => d.stops.map((x) => x.name));
    if (new Set(names).size !== names.length) throw new Error('장소 중복');
    const leaked = [...scanKeys(body), ...(/"(lat|lng|latitude|longitude)"/.test(JSON.stringify(body)) ? ['좌표 키'] : [])];
    if (leaked.length) throw new Error(`식별자·좌표 키 ${leaked.join(',')}`);
    const jeju = (await postPlan({ region: 'jeju', nights: 1 })).body.itinerary;
    if (!jeju || jeju.base !== null || jeju.weatherPlaceId !== '11G00201') throw new Error(`제주 거점 ${jeju?.base} · 예보 ${jeju?.weatherPlaceId}`);
    return `거점 ${it.base} · 예보 ${it.weatherPlaceId} · ${it.days.map((d) => `[${d.area}] ${d.stops.length}곳`).join(' / ')}`;
  });
  await step('API plan 다양화(14차) — 변형 번호는 같은 번호면 같은 코스·다른 번호면 다른 코스, 유명도·목적은 목록 순위를 바꾼다, 잘못된 값 400', async () => {
    const seg = { ageGrp: '30', accompany: '2인 여행(가족 외)', nights: 2 };
    const course = (p: Plan): string => (p.itinerary?.days ?? []).map((d) => d.stops.map((x) => x.name).join('>')).join('/');
    const base = (await postPlan(seg)).body;
    const zero = (await postPlan({ ...seg, variant: 0 })).body;
    if (course(zero) !== course(base)) throw new Error('variant 0 이 기준과 다름');
    const v3a = (await postPlan({ ...seg, variant: 3 })).body;
    const v3b = (await postPlan({ ...seg, variant: 3 })).body;
    if (course(v3a) !== course(v3b)) throw new Error('같은 번호가 다른 코스');
    const others = await Promise.all([1, 2, 3, 4, 5].map(async (variant) => course((await postPlan({ ...seg, variant })).body)));
    const distinct = new Set(others.filter((c) => c !== course(base))).size;
    if (distinct === 0) throw new Error('번호를 바꿔도 같은 코스');
    const top = (p: Plan): string => p.places.slice(0, 5).map((x) => x.name).join(',');
    const hidden = (await postPlan({ ...seg, fame: 'hidden' })).body;
    if (top(hidden) === top(base)) throw new Error('fame hidden 이 순위를 안 바꿈');
    if (hidden.places.some((x) => x.n < 5)) throw new Error('n<5 장소');
    const history = (await postPlan({ ...seg, purposes: ['history'] })).body;
    if (top(history) === top(base)) throw new Error('purposes 가 순위를 안 바꿈');
    for (const bad of [{ variant: 100 }, { fame: 'x' }, { purposes: ['theme', 'history', 'culture', 'sports'] }]) {
      const res = await postPlan({ ...seg, ...bad });
      if (res.status !== 400) throw new Error(`${JSON.stringify(bad)} → ${res.status}`);
    }
    return `변형 5개 중 기준과 다른 코스 ${distinct}개 · hidden 상위 ${hidden.places[0]?.name} · history 상위 ${history.places[0]?.name}`;
  });
  await step('API plan 입력 확장(11·12차) — 속도·이동수단·숙소 동네·꼭 갈 곳·뺄 곳·비 오는 날이 일정에 반영, 잘못된 값 400', async () => {
    const seg = { ageGrp: '30', accompany: '2인 여행(가족 외)', nights: 2 };
    const base = (await postPlan(seg)).body;
    const it = base.itinerary;
    if (!it || base.areas.length === 0) throw new Error('기준 일정·숙소 동네 선택지 없음');
    const count = (p: Plan): number => p.itinerary!.days.reduce((a, d) => a + d.stops.length, 0);
    const relaxed = (await postPlan({ ...seg, pace: 'relaxed' })).body;
    const packed = (await postPlan({ ...seg, pace: 'packed' })).body;
    if (count(relaxed) > count(base) || count(packed) < count(base)) throw new Error(`속도 ${count(relaxed)}/${count(base)}/${count(packed)}`);
    const transit = (await postPlan({ ...seg, transport: 'transit' })).body.itinerary!;
    if (transit.transport !== 'transit') throw new Error('transport 표시');
    // 숙소 동네 — 도착한 날은 숙소까지, 떠나는 날은 숙소에서만.
    const stay = (await postPlan({ ...seg, stayArea: base.areas[0]!.label })).body.itinerary!;
    const first = stay.days[0]!;
    const last = stay.days[stay.days.length - 1]!;
    if (stay.stayArea !== base.areas[0]!.label || first.fromStayMin !== null || first.toStayMin === null || last.toStayMin !== null || last.fromStayMin === null) throw new Error('숙소 이동');
    // 뺄 곳 — 일정의 첫 장소. 꼭 갈 곳 — 기준 일정에 없던 목록 장소(못 넣으면 unplaced 로 알려 준다).
    const gone = it.days[0]!.stops[0]!;
    const inPlan = new Set(it.days.flatMap((d) => d.stops.map((x) => x.name)));
    const want = base.places.find((p) => !inPlan.has(p.name) && p.kind !== '상점' && p.kind !== '기타');
    if (!want) throw new Error('꼭 갈 곳으로 쓸 장소 없음');
    const edited = (await postPlan({ ...seg, must: [{ name: want.name, emd: want.emd }], avoid: [{ name: gone.name, emd: gone.emd }] })).body.itinerary!;
    const names = edited.days.flatMap((d) => d.stops.flatMap((x) => [x.name, ...x.alternatives.map((a) => a.name)]));
    if (names.includes(gone.name)) throw new Error(`뺀 곳이 남음: ${gone.name}`);
    const pinned = edited.days.flatMap((d) => d.stops.filter((x) => x.pinned).map((x) => x.name));
    if (!pinned.includes(want.name) && !edited.unplaced.includes(want.name)) throw new Error(`꼭 갈 곳 누락: ${want.name}`);
    // 날씨(12차) — 비 오는 일차만 wet, 일정 밖 번호는 무시.
    const wet = (await postPlan({ ...seg, wetDays: [2, 5] })).body.itinerary!;
    if (wet.days.map((d) => d.wet).join() !== wet.days.map((d) => d.day === 2).join()) throw new Error(`비 오는 날 표시 ${wet.days.map((d) => d.wet).join()}`);
    for (const bad of [{ pace: 'slow' }, { focus: ['food'] }, { transport: 'bike' }, { wetDays: [0] }]) {
      if ((await postPlan(bad)).status !== 400) throw new Error(`400 아님: ${JSON.stringify(bad)}`);
    }
    return `자리 ${count(relaxed)}/${count(base)}/${count(packed)} · 대중교통 ${transit.legBasis} · 숙소 ${stay.stayArea}(→${first.toStayMin}분) · 꼭 ${pinned.join(',') || `못 넣음 ${edited.unplaced.join(',')}`} · 뺌 ${gone.name}`;
  });
  let allCells = 0;
  await step('API density — 칸 여행자 ≥ 5·경계 4개·kind=restaurant 부분집합·bbox 절단', async () => {
    const all = await getJson<Density>('/api/v1/tour/public/density?kind=all');
    if (all.status !== 200) throw new Error(`status ${all.status}`);
    if (all.body.cells.length === 0) throw new Error('cells 0');
    if (all.body.cells.some((c) => c.travelers < 5)) throw new Error('travelers<5 칸');
    if (all.body.breaks.length !== 4) throw new Error('breaks');
    allCells = all.body.cells.length;
    const rest = await getJson<Density>('/api/v1/tour/public/density?kind=restaurant');
    if (rest.body.cells.length > all.body.cells.length) throw new Error('restaurant > all');
    const boxed = await getJson<Density>('/api/v1/tour/public/density?kind=all&bbox=126.4,33.45,126.6,33.55');
    if (boxed.body.cells.length === 0 || boxed.body.cells.length >= all.body.cells.length) throw new Error(`bbox ${boxed.body.cells.length}`);
    if ((await getJson('/api/v1/tour/public/density?kind=hotel')).status !== 400) throw new Error('kind 검증');
    return `all ${all.body.cells.length}칸/${all.body.total.visits}방문 · restaurant ${rest.body.cells.length}칸 · 제주시 bbox ${boxed.body.cells.length}칸 · breaks ${all.body.breaks.join('/')}`;
  });
  await step('API lodging — 유형 ≥ 1·유형별 여행 ≥ 5', async () => {
    const { status, body } = await getJson<{ types: Array<{ label: string; trips: number; nightlyMedian: number | null; rsvtRate: number | null; mean: number | null }>; total: { trips: number; withLodging: number } }>('/api/v1/tour/public/lodging');
    if (status !== 200) throw new Error(`status ${status}`);
    if (body.types.length === 0 || body.types.some((t) => t.trips < 5)) throw new Error('types');
    const top = body.types[0]!;
    return `${body.types.length}유형 · 1위 ${top.label} 여행 ${top.trips} 1박 ${top.nightlyMedian} 예약 ${top.rsvtRate} 만족 ${top.mean}`;
  });
  await step('API regions — 3집단·읍면동 n ≥ 5', async () => {
    const { status, body } = await getJson<{ groups: Array<{ key: string; trips: number; visits: number; share: number; mean: number | null }>; emd: Array<{ n: number }> }>('/api/v1/tour/public/regions');
    if (status !== 200) throw new Error(`status ${status}`);
    if (body.groups.length !== 3) throw new Error(`groups ${body.groups.length}`);
    if (body.emd.some((e) => e.n < 5)) throw new Error('emd n<5');
    return body.groups.map((g) => `${g.key} ${g.visits}방문(${Math.round(g.share * 100)}%) 만족 ${g.mean}`).join(' · ') + ` · 읍면동 ${body.emd.length}`;
  });
  await step('API insights 서부권 지역(7차) — region=daejeon 200·hubLabel·지역비교 시군구 집단', async () => {
    const ins = await getJson<Insights & { hubLabel: string }>('/api/v1/tour/public/insights?region=daejeon');
    if (ins.status !== 200) throw new Error(`insights status ${ins.status}`);
    // 서부권 세트가 적재돼 있으면 대전 표본이 있고, 없으면 insufficient — 둘 다 200 이어야 한다.
    const reg = await getJson<{ groups: Array<{ key: string; visits: number }> }>('/api/v1/tour/public/regions?region=daejeon');
    if (reg.status !== 200) throw new Error(`regions status ${reg.status}`);
    if ((await getJson('/api/v1/tour/public/insights?region=daejeon-xyz')).status !== 400) throw new Error('잘못된 region 400 아님');
    return `daejeon 여행 ${ins.body.scale?.trips ?? 0} · "${ins.body.hubLabel}" · 집단 ${reg.body.groups.map((g) => g.key).join('/') || '없음(미적재)'}`;
  });
  await step('API insights 동부권 지역(8차) — region=gangwon·east 200·hubLabel·지역비교 시군구 집단', async () => {
    const ins = await getJson<Insights & { hubLabel: string }>('/api/v1/tour/public/insights?region=gangwon');
    if (ins.status !== 200) throw new Error(`insights status ${ins.status}`);
    // 권역 키(east)는 6개 시도 합 — 동부권 세트가 없으면 insufficient 지만 200 이어야 한다.
    const east = await getJson<Insights>('/api/v1/tour/public/insights?region=east');
    if (east.status !== 200) throw new Error(`east status ${east.status}`);
    const reg = await getJson<{ groups: Array<{ key: string; visits: number }> }>('/api/v1/tour/public/regions?region=gangwon');
    if (reg.status !== 200) throw new Error(`regions status ${reg.status}`);
    return `gangwon 여행 ${ins.body.scale?.trips ?? 0} · east 여행 ${east.body.scale?.trips ?? 0} · "${ins.body.hubLabel}" · 집단 ${reg.body.groups.map((g) => g.key).join('/') || '없음(미적재)'}`;
  });
  await step('API insights 수도권 지역(9차) — region=seoul·capital 200·지역비교 구 집단', async () => {
    const ins = await getJson<Insights & { hubLabel: string }>('/api/v1/tour/public/insights?region=seoul');
    if (ins.status !== 200) throw new Error(`insights status ${ins.status}`);
    const cap = await getJson<Insights>('/api/v1/tour/public/insights?region=capital');
    if (cap.status !== 200) throw new Error(`capital status ${cap.status}`);
    const reg = await getJson<{ groups: Array<{ key: string; visits: number }> }>('/api/v1/tour/public/regions?region=seoul');
    if (reg.status !== 200) throw new Error(`regions status ${reg.status}`);
    return `seoul 여행 ${ins.body.scale?.trips ?? 0} · capital 여행 ${cap.body.scale?.trips ?? 0} · "${ins.body.hubLabel}" · 집단 ${reg.body.groups.map((g) => g.key).join('/') || '없음(미적재)'}`;
  });
  await step('API 관리자 라우트 무인증 — status·원본 열람 401, 사진은 존재를 숨기는 404', async () => {
    const a = await getJson('/api/v1/admin/tour/status');
    const b = await getJson('/api/v1/admin/tour/places/x/visits');
    const c = await getJson('/api/v1/admin/tour/photos/x/s');
    if (a.status !== 401 || b.status !== 401 || c.status !== 404) throw new Error(`${a.status}/${b.status}/${c.status}`);
    return `${a.status}/${b.status}/${c.status}`;
  });
  await step('API 맛집 공개 목록 sort=tourTravelers — 200', async () => {
    const { status, body } = await getJson<{ items: Array<{ tour: { nTravelers: number } | null }>; total: number }>('/api/v1/restaurants/public?sort=tourTravelers&limit=5');
    if (status !== 200) throw new Error(`status ${status}`);
    const matched = body.items.filter((i) => i.tour).length;
    return `total ${body.total} · 상위 5 중 여행로그 매칭 ${matched}(dev DB 는 제주 맛집 0곳이면 0)`;
  });
  check('API density 칸 수 기록', allCells > 0, `${allCells}`);
};

// ── 브라우저 공통 ─────────────────────────────────────────────────────────────
const attachConsole = (page: Page, tag: string): void => {
  page.on('pageerror', (e) => consoleErrors.push(`[${tag}] pageerror: ${e.message}`));
  page.on('console', (m: ConsoleMessage) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    if (/Failed to load resource|net::ERR_|404 \(/.test(text)) resourceErrors.push(`[${tag}] ${text.slice(0, 160)}`);
    else consoleErrors.push(`[${tag}] ${text.slice(0, 200)}`);
  });
};
const statValue = (page: Page, label: string): Promise<string | null> =>
  page.evaluate((lbl) => {
    const el = [...document.querySelectorAll('div')].find((d) => d.textContent?.trim() === lbl && d.previousElementSibling);
    return el?.previousElementSibling?.textContent?.trim() ?? null;
  }, label);
const shot = (page: Page, name: string) => page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });

// ── ② /travel/jeju ─────────────────────────────────────────────────────────────
const insightsPage = async (page: Page): Promise<void> => {
  await step('/travel/jeju 렌더 — 제목·KPI·섹션', async () => {
    await page.goto(`${WEB}/travel/jeju`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: '제주 여행 인사이트 2023' }).waitFor({ timeout: 20_000 });
    await page.waitForFunction(() => [...document.querySelectorAll('div')].some((d) => d.textContent?.trim() === '공개 방문 기록'), null, { timeout: 30_000 });
    const trips = await statValue(page, '여행');
    if (!trips || trips === '0') throw new Error(`여행 KPI ${trips}`);
    for (const title of ['몇 박', '하루 중 언제 무엇을', '어디서 어디로', '흔한 하루 코스', '어떻게 움직였나', '공항 다음 첫 목적지', '누가 여행했나'])
      await page.getByRole('heading', { name: title }).waitFor({ timeout: 5000 });
    return `여행 ${trips}`;
  });
  await step('/travel/jeju 지역 비교·숙소 섹션 — 3집단 카드·숙소 표 행', async () => {
    await page.getByTestId('tour-region-jeju-si').waitFor({ timeout: 20_000 });
    await page.getByTestId('tour-region-seogwipo').waitFor({ timeout: 5000 });
    await page.getByTestId('tour-region-island').waitFor({ timeout: 5000 });
    const emdRows = await page.locator('[data-testid=tour-region-emd] tbody tr').count();
    await page.getByTestId('tour-lodging-table').waitFor({ timeout: 20_000 });
    const lodgingRows = await page.locator('[data-testid=tour-lodging-table] tbody tr').count();
    if (emdRows === 0 || lodgingRows === 0) throw new Error(`emd ${emdRows} lodging ${lodgingRows}`);
    return `읍면동 ${emdRows}행 · 숙소 ${lodgingRows}행`;
  });
  await step('/travel/jeju 출처 문구', async () => {
    const t = await page.locator('text=aihub.or.kr').first().textContent();
    if (!t) throw new Error('없음');
  });
  await shot(page, '01-travel-jeju');
  await step('/travel/jeju 필터 칩 → URL 쿼리 → 집계 갱신', async () => {
    const before = await statValue(page, '여행');
    await page.getByRole('button', { name: '30대' }).click();
    await page.waitForFunction(() => location.search.includes('ageGrp=30'), null, { timeout: 5000 });
    await page.waitForFunction((b) => {
      const el = [...document.querySelectorAll('div')].find((d) => d.textContent?.trim() === '여행' && d.previousElementSibling);
      return el?.previousElementSibling?.textContent?.trim() !== b;
    }, before, { timeout: 20_000 });
    const after30 = await statValue(page, '여행');
    await page.getByRole('button', { name: '2박' }).click();
    await page.waitForFunction(() => location.search.includes('nights=2') && location.search.includes('ageGrp=30'), null, { timeout: 5000 });
    await page.waitForFunction((b) => {
      const el = [...document.querySelectorAll('div')].find((d) => d.textContent?.trim() === '여행' && d.previousElementSibling);
      return el?.previousElementSibling?.textContent?.trim() !== b;
    }, after30, { timeout: 20_000 });
    const after302 = await statValue(page, '여행');
    return `전체 ${before} → 30대 ${after30} → 30대·2박 ${after302} · URL ${new URL(page.url()).search}`;
  });
  await step('/travel/jeju 좁은 필터 → 표본 부족 안내', async () => {
    await page.getByRole('button', { name: '남' }).click();
    await page.getByRole('button', { name: '당일' }).click();
    await page.getByRole('button', { name: '4월' }).click();
    await page.getByText(/20건 미만/).first().waitFor({ timeout: 20_000 });
    return new URL(page.url()).search;
  });
  await shot(page, '02-travel-jeju-insufficient');
  await step('/travel/jeju 초기화 → URL 비움', async () => {
    await page.getByRole('button', { name: '초기화' }).click();
    await page.waitForFunction(() => location.search === '', null, { timeout: 5000 });
  });
  await step('/travel/jeju 딥링크 — ?ageGrp=40&accompany=자녀 동반 여행 새로고침 복원', async () => {
    await page.goto(`${WEB}/travel/jeju?ageGrp=40&accompany=${encodeURIComponent('자녀 동반 여행')}`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: '제주 여행 인사이트 2023' }).waitFor({ timeout: 20_000 });
    const chip40 = page.getByRole('button', { name: '40대' });
    await chip40.waitFor();
    const cls = (await chip40.getAttribute('class')) ?? '';
    if (!cls.includes('border-teal-600')) throw new Error('40대 칩 비활성');
    const accCls = (await page.getByRole('button', { name: '자녀 동반 여행' }).getAttribute('class')) ?? '';
    if (!accCls.includes('border-teal-600')) throw new Error('동반 칩 비활성');
  });
  await step('/travel/jeju 인사이트 → 코스 추천 링크', async () => {
    await page.getByRole('link', { name: /코스 추천/ }).click();
    await page.waitForURL(/\/travel\/plan$/, { timeout: 5000 });
  });
};

// ── ③ /travel/plan ─────────────────────────────────────────────────────────────
const planPage = async (page: Page): Promise<void> => {
  await step('/travel/plan 제출 → 추천 카드·조건 안내', async () => {
    await page.goto(`${WEB}/travel/plan`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: '코스 추천' }).waitFor({ timeout: 20_000 });
    await page.getByRole('button', { name: '비슷한 여행 찾기' }).click();
    await page.getByText(/같은 조건의 여행/).waitFor({ timeout: 30_000 });
    const cards = await page.locator('li:has-text("팀 · 만족")').count();
    if (cards === 0) throw new Error('추천 0');
    const notice = (await page.getByText(/같은 조건의 여행/).textContent())?.replace(/\s+/g, ' ').trim();
    return `${cards}곳 · ${notice}`;
  });
  await step('/travel/plan 일정표 — 기본(제주 2박)은 3일, 일차마다 시각·이동 줄', async () => {
    await page.getByRole('heading', { name: '추천 일정' }).waitFor({ timeout: 5000 });
    const days = page.getByRole('article', { name: /일차$/ });
    const n = await days.count();
    if (n !== 3) throw new Error(`일차 ${n}`);
    for (let i = 0; i < n; i += 1) {
      const day = days.nth(i);
      if ((await day.locator('time').count()) < 2) throw new Error(`${i + 1}일차 시각`);
      if ((await day.getByText(/이동 약 \d/).count()) < 1) throw new Error(`${i + 1}일차 이동 줄`);
    }
    if ((await page.getByText(/누군가의 실제 일정이 아닙니다/).count()) !== 1) throw new Error('합성 안내 문구');
    return (await days.allTextContents()).map((t) => t.replace(/\s+/g, ' ').slice(0, 24)).join(' | ');
  });
  await shot(page, '03-travel-plan');
  await step('/travel/plan 식당만 토글 → 식당 카드만', async () => {
    await page.getByRole('button', { name: '식당만', exact: true }).click();
    await page.waitForTimeout(200);
    const texts = await page.locator('li:has-text("팀 · 만족")').allTextContents();
    if (texts.length === 0) throw new Error('식당 0');
    const bad = texts.filter((t) => !t.includes('식당 ·'));
    if (bad.length) throw new Error(`식당 아닌 카드 ${bad.length}`);
    return `${texts.length}곳`;
  });
  await step('/travel/plan 그룹투표 버튼 — 후보 미선택이면 비활성', async () => {
    const disabled = await page.getByRole('button', { name: /그룹투표 만들기/ }).isDisabled();
    if (!disabled) throw new Error('활성');
  });
  await step('/travel/plan 조건 변경(나홀로·60대) → 완화 안내 또는 결과', async () => {
    // "전체" 버튼은 둘 — 지역 칩(7차, 필터 바)과 결과 토글(식당만 ↔ 전체). 앞 단계의 "식당만" 을 되돌리는 건 뒤쪽 결과 토글.
    await page.getByRole('button', { name: '전체', exact: true }).last().click();
    await page.getByRole('button', { name: '60대' }).click();
    await page.getByRole('button', { name: '나홀로 여행' }).click();
    await page.getByRole('button', { name: '비슷한 여행 찾기' }).click();
    await page.waitForTimeout(500);
    await page.getByText(/같은 조건의 여행/).waitFor({ timeout: 30_000 });
    const notice = (await page.getByText(/같은 조건의 여행/).textContent())?.replace(/\s+/g, ' ').trim();
    return notice ?? '';
  });
  await step('/travel/plan 일정 편집(11차) — 빼기·꼭 갈 곳·숙소 동네를 고르면 바로 다시 짜고 칩으로 되돌린다', async () => {
    await page.getByRole('heading', { name: '추천 일정' }).waitFor({ timeout: 10_000 });
    const days = page.getByRole('article', { name: /일차$/ });
    const firstStop = (await days.first().getByRole('button', { name: /일정에서 빼기$/ }).first().getAttribute('aria-label'))!.replace(' 일정에서 빼기', '');
    await days.first().getByRole('button', { name: `${firstStop} 일정에서 빼기`, exact: true }).click();
    // 칩은 누르는 즉시 뜨고 일정은 응답이 온 뒤 바뀐다 — 뺀 장소가 일정에서 사라질 때까지 기다린다.
    await page.getByRole('button', { name: `${firstStop} 뺀 곳에서 되돌리기` }).waitFor({ timeout: 10_000 });
    await days.getByRole('button', { name: `${firstStop} 일정에서 빼기`, exact: true }).waitFor({ state: 'detached', timeout: 10_000 });
    // 목록의 핀 — 방금 뺀 곳이 아닌 첫 장소(뺀 곳에 핀을 꽂으면 뺀 곳에서 빠진다). 일정에 들거나 못 넣었다는 안내가 뜬다.
    const pinLabels = await page.getByRole('button', { name: /꼭 갈 곳$/ }).evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') ?? ''));
    const pinName = pinLabels.map((l) => l.replace(' 꼭 갈 곳', '')).find((name) => name !== firstStop);
    if (!pinName) throw new Error('핀을 꽂을 장소 없음');
    await page.getByRole('button', { name: `${pinName} 꼭 갈 곳`, exact: true }).click();
    await page.getByRole('button', { name: `${pinName} 꼭 갈 곳에서 되돌리기` }).waitFor({ timeout: 10_000 });
    await page.getByRole('button', { name: `${pinName} 꼭 갈 곳`, exact: true, pressed: true }).waitFor({ timeout: 10_000 });
    await page.getByRole('button', { name: '비슷한 여행 찾기' }).and(page.locator(':enabled')).waitFor({ timeout: 10_000 });
    // 숙소 동네 — 둘째 선택지(첫째는 "정하지 않음").
    await page.getByRole('combobox', { name: '숙소 동네' }).selectOption({ index: 1 });
    await page.getByText(/숙소까지 약/).first().waitFor({ timeout: 10_000 });
    // 되돌리기.
    await page.getByRole('button', { name: `${firstStop} 뺀 곳에서 되돌리기` }).click();
    await page.getByRole('button', { name: `${firstStop} 뺀 곳에서 되돌리기` }).waitFor({ state: 'detached', timeout: 10_000 });
    return `뺌·되돌림 ${firstStop} · 꼭 ${pinName} · 숙소 ${await page.getByRole('combobox', { name: '숙소 동네' }).inputValue()}`;
  });
  await step('/travel/plan 제주 밖(13차) — 동부권 → 일정표와 거점 안내', async () => {
    await page.getByRole('button', { name: '동부권', exact: true }).click();
    await page.getByRole('button', { name: '비슷한 여행 찾기' }).click();
    const note = page.getByText(/주변에서 짰습니다/);
    await note.waitFor({ timeout: 30_000 });
    const days = await page.getByRole('article', { name: /일차$/ }).count();
    if (days === 0) throw new Error('일차 0');
    return `${days}일 · ${(await note.textContent())?.split(' — ')[0]}`;
  });
  await step("/travel/plan '전체' → 일정표 대신 안내, 장소 추천은 그대로", async () => {
    // 결과 목록에도 '전체' 토글이 있다 — 지역 칩은 폼 안에서 찾는다.
    await page.locator('form').getByRole('button', { name: '전체', exact: true }).click();
    await page.getByRole('button', { name: '비슷한 여행 찾기' }).click();
    await page.getByText(/일정표는 지역을 골라야 만들어 드립니다/).waitFor({ timeout: 30_000 });
    if ((await page.getByRole('heading', { name: '추천 일정' }).count()) !== 0) throw new Error('일정표가 남아 있음');
    const cards = await page.locator('li:has-text("팀 · 만족")').count();
    if (cards === 0) throw new Error('추천 0');
    return `${cards}곳`;
  });
};

// ── ④ /life-map ─────────────────────────────────────────────────────────────────
const lifeMapPage = async (page: Page): Promise<void> => {
  await step('/life-map 배경 "여행자 밀도" 토글 → 표본 밖이면 가까운 표본으로 이동(안이면 그대로)·요약 카드·푸터 출처', async () => {
    await page.goto(`${WEB}/life-map`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('life-map-view').waitFor({ timeout: 30_000 });
    await page.getByTestId('life-overlay-tour').click();
    await page.getByTestId('life-tour-card').waitFor({ timeout: 10_000 });
    await page.getByTestId('life-tour-summary').waitFor({ timeout: 30_000 });
    // 기본 진입 중심(서울시청)이 표본 세트 bbox 안이면(9차 수도권부터) 이동하지 않고, 밖이면 가까운 세트 중심으로 간다(7차부터 제주 고정이
    // 아님). URLSearchParams 는 쉼표를 %2C 로 싣는다 — 디코드해서 본다.
    const inside = tourSampleRegionAt(37.5665, 126.978);
    if (inside) {
      await page.waitForTimeout(1000);
      if (/ll=/.test(new URL(page.url()).search)) throw new Error(`표본(${inside}) 안인데 지도가 이동함: ${decodeURIComponent(new URL(page.url()).search)}`);
    } else {
      const centers = TOUR_DATASET_KEYS.map((k) => ({ ll: `ll=${TOUR_REGIONS[k].center.lat.toFixed(5)},${TOUR_REGIONS[k].center.lng.toFixed(5)}`, z: `z=${TOUR_REGIONS[k].center.zoom}` }));
      await page.waitForFunction(
        (cs) => cs.some((c) => decodeURIComponent(location.search).includes(c.ll) && location.search.includes(c.z)),
        centers,
        { timeout: 10_000 },
      );
    }
    await page.getByTestId('life-map-footer-tour').waitFor({ timeout: 5000 });
    const summary = (await page.getByTestId('life-tour-summary').textContent())?.replace(/\s+/g, ' ').trim();
    return `${summary} · ${inside ? `표본 ${inside} 안이라 이동 없음` : '이동'} · URL ${decodeURIComponent(new URL(page.url()).search) || '(없음)'}`;
  });
  await page.waitForTimeout(1500);
  await shot(page, '04-life-map-tour-overlay');
  await step('/life-map 제주시 칸 클릭 → 선택 칸 카드(방문·여행자·등급·등록 맛집 목록)', async () => {
    // 점 레이어를 꺼 마커가 칸 클릭을 가로채지 않게 한 뒤 제주시 도심으로.
    await page.evaluate(() =>
      localStorage.setItem(
        'lp:life-map-prefs',
        JSON.stringify({
          state: { layers: { cctv: false, toilet: false, hospital: false, store: false }, purposes: [], toiletFilters: { open24: false, disabled: false, kids: false, diaper: false, bell: false }, hospitalCategories: [], storeKinds: [], overlay: 'tour', crimeMetric: 'total', tourDensityKind: 'all' },
          version: 5,
        }),
      ),
    );
    await page.goto(`${WEB}/life-map?ll=33.4996,126.5312&z=13`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('life-tour-summary').waitFor({ timeout: 30_000 });
    await page.waitForTimeout(2000);
    const box = await page.getByTestId('life-map-view').boundingBox();
    if (!box) throw new Error('map box');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.getByTestId('life-tour-cell').waitFor({ timeout: 10_000 });
    const cell = (await page.getByTestId('life-tour-cell').textContent())?.trim();
    const grade = (await page.getByTestId('life-tour-grade').textContent())?.trim();
    await page.getByTestId('life-tour-cell-restaurants').waitFor({ timeout: 10_000 });
    await page.waitForFunction(() => !/찾는 중/.test(document.querySelector('[data-testid=life-tour-cell-restaurants]')?.textContent ?? ''), null, { timeout: 20_000 });
    const list = (await page.getByTestId('life-tour-cell-restaurants').textContent())?.replace(/\s+/g, ' ').trim().slice(0, 120);
    return `${cell} · ${grade} · ${list}`;
  });
  await page.waitForTimeout(500);
  await shot(page, '05-life-map-cell');
  await step('/life-map 종류 칩 식당만 → 규모 갱신·설정 저장', async () => {
    const before = (await page.getByTestId('life-tour-summary').textContent().catch(() => null)) ?? (await page.getByTestId('life-tour-cell').textContent());
    await page.getByRole('button', { name: '선택 해제' }).click().catch(() => {});
    await page.getByTestId('life-tour-kinds').getByRole('button', { name: '식당만' }).click();
    await page.waitForFunction(
      (b) => {
        const s = document.querySelector('[data-testid=life-tour-summary]')?.textContent?.trim();
        return Boolean(s) && s !== b;
      },
      before,
      { timeout: 20_000 },
    );
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('lp:life-map-prefs') ?? '{}') as { state?: { tourDensityKind?: string } });
    if (stored.state?.tourDensityKind !== 'restaurant') throw new Error('설정 미저장');
    return (await page.getByTestId('life-tour-summary').textContent())?.replace(/\s+/g, ' ').trim() ?? '';
  });
  await step('/life-map 범죄 통계 켜면 여행자 밀도 카드 사라짐(배경 하나)', async () => {
    await page.getByTestId('life-overlay-crime').click();
    await page.getByTestId('life-tour-card').waitFor({ state: 'detached', timeout: 5000 });
    await page.getByTestId('life-crime-card').waitFor({ timeout: 10_000 });
  });
};

// ── 모바일 폭 ─────────────────────────────────────────────────────────────────
const mobileChecks = async (page: Page): Promise<void> => {
  for (const path of ['/travel/jeju', '/travel/plan']) {
    await step(`${path} 모바일(390px) — 가로 넘침 없음`, async () => {
      await page.goto(`${WEB}${path}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);
      const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
      if (sw > iw + 1) throw new Error(`scrollWidth ${sw} > ${iw}`);
      return `${sw}/${iw}`;
    });
  }
  await shot(page, '06-travel-jeju-mobile');
};

// ── 실행 ──────────────────────────────────────────────────────────────────────
const main = async (): Promise<void> => {
  console.log(`e2e 여행로그 — web ${WEB} · api ${API} · shots ${SHOTS}`);
  await apiChecks();
  const browser = await chromium.launch({ headless: !HEADED });
  try {
    const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ko-KR' });
    const page = await desktop.newPage();
    attachConsole(page, 'desktop');
    await insightsPage(page);
    await planPage(page);
    await lifeMapPage(page);
    await desktop.close();

    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'ko-KR' });
    const mpage = await mobile.newPage();
    attachConsole(mpage, 'mobile');
    await mobileChecks(mpage);
    await mobile.close();
  } finally {
    await browser.close();
  }
  check('브라우저 JS 오류·콘솔 error 없음', consoleErrors.length === 0, consoleErrors.slice(0, 5).join(' | '));
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} 통과${failed.length ? ` — 실패 ${failed.map((f) => f.name).join(', ')}` : ''}`);
  if (resourceErrors.length) console.log(`리소스 오류(참고) ${resourceErrors.length}건: ${[...new Set(resourceErrors)].slice(0, 3).join(' | ')}`);
  process.exitCode = failed.length ? 1 : 0;
};

void main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
