/* eslint-disable no-console -- 프로빙 결과를 터미널에 그대로 찍는 스크립트 */
// 식단 추천 영양 보정 프로빙(2026-11-07) — 영양 상태가 뚜렷한 가상 사용자 3명(+ 실제 계정)에게 기존 추천(A)과 영양 보정(B)을
// 같은 후보로 돌려 비교한다.
//   · 점수 층(결정적): LLM 이 받는 후보 25개와 LLM 이 없을 때의 폴백 3개 — 국물·짠 음식 수, 부족 영양소를 채우는 정도, 최근 7일
//     겹침. 폴백은 예전(점수 상위 3개)과 새 pickFallback(최근·조리형태·주재료 겹침 피함)을 함께 본다.
//   · LLM 층(--llm N): 실제 추천 서비스를 A(영양 신호 없음)·B(있음)로 N 번씩 — 고른 음식의 같은 지표와 이유에 영양 언급이 있는지.
//     만든 추천 행은 지운다(한도 차감 없음).
//
// 실행: DATABASE_URL=file:../data/rec-probe.db pnpm --filter friendly probe:meal-recommend-nutrition [--llm 2]
//        [--email a@b.c,...] [--slot dinner] [--undo]
//   운영 사본을 복제한 DB 에서 돌린다 — prod.db 는 거부(가상 사용자를 만든다). 리포트는 data/meal-probe/nutrition-rec-날짜.md.

import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import type { MealSlotType } from '@repo/api-contract';
import { MEAL_SLOT_LABEL } from '@repo/utils';
import { hashPassword } from '../src/lib/hash.js';
import { normalizeTerm } from '../src/lib/text.js';
import { adapterCache } from '../src/modules/ai/adapter-cache.js';
import { AiConfigService } from '../src/modules/ai/ai.config.service.js';
import { buildLlmProviderEnv } from '../src/modules/ai/llm-provider-env.js';
import { loadLexicon } from '../src/modules/food/engine/index.js';
import { FoodNutrientRefService } from '../src/modules/food/food-nutrient-ref.service.js';
import { mealServingNutrition } from '../src/modules/food/food-serving.js';
import { MealPreferenceService } from '../src/modules/meal/meal-preference.service.js';
import { MealNutritionService } from '../src/modules/meal-nutrition/meal-nutrition.service.js';
import {
  MealPatternService,
  buildProfile,
  filterForFocus,
  filterForSlot,
  recommendationFocus,
  scoreCandidate,
  type CandidateInput,
  type ScoredCandidate,
} from '../src/modules/meal-recommendation/meal-pattern.service.js';
import { MealRecommendationService, pickFallback } from '../src/modules/meal-recommendation/meal-recommendation.service.js';
import {
  isSoupLike,
  nutritionFit,
  nutritionSignalsFrom,
  supportedGapKeys,
  unsupportedNutrients,
  type NutritionSignals,
} from '../src/modules/meal-recommendation/nutrition-signals.js';
import { parseRecommendationOutput } from '../src/modules/meal-recommendation/meal-recommendation.service.js';

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const LLM_RUNS = Math.max(0, Math.min(5, Number(flag('--llm') ?? 0) || 0));
const EMAILS = (flag('--email') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const SLOT = (flag('--slot') ?? 'dinner') as MealSlotType;
const UNDO = args.includes('--undo');
const PROMPT_CANDIDATES = 25;
const SALTY_MG = 1500;
const TARGET_SHARE = 0.25;
const NUTRITION_WORD = /나트륨|국물|짠|싱겁|비타민|칼슘|철분|칼륨|엽산|마그네슘|아연|식이섬유|영양|보충/;
// 사용자에게 보이는 문장에 새어 나온 내부 말.
const INTERNAL_WORD = /태그|score|후보 목록|건강 점수|최근와/;

// ── 가상 사용자 ───────────────────────────────────────────────────────────────
type Meal = [daysAgo: number, slot: MealSlotType, time: string, mains: string[], sides?: string[]];
interface Persona {
  id: string;
  email: string;
  title: string;
  expect: string;
  meals: Meal[];
}
const RICE = ['공기밥'];
const day = (d: number, lunch: [string[], string[]?], dinner: [string[], string[]?]): Meal[] => [
  [d, 'lunch', '12:30', lunch[0], lunch[1]],
  [d, 'dinner', '19:10', dinner[0], dinner[1]],
];
const PERSONAS: Persona[] = [
  {
    id: 'probe-nut-s',
    email: 'nut-probe-s@probe.local',
    title: 'S. 짠 국물 편중',
    expect: '나트륨 많음 — 국물·찌개·짠 면은 많아야 하나, 부족 영양소(비타민 C·A·칼슘 등)를 채우는 후보가 하나쯤',
    meals: [
      ...day(1, [['김치찌개'], RICE], [['라면']]),
      ...day(2, [['부대찌개'], RICE], [['해장국'], RICE]),
      ...day(3, [['짬뽕']], [['감자탕'], RICE]),
      ...day(4, [['칼국수']], [['김치찌개'], RICE]),
      ...day(5, [['육개장'], RICE], [['우동']]),
      ...day(6, [['만두국']], [['갈비탕'], RICE]),
      ...day(7, [['짜장면']], [['동태찌개'], RICE]),
      ...day(8, [['라면']], [['순두부찌개'], RICE]),
      ...day(9, [['떡국']], [['부대찌개'], RICE]),
      ...day(10, [['된장찌개'], RICE], [['해장국'], RICE]),
    ],
  },
  {
    id: 'probe-nut-m',
    email: 'nut-probe-m@probe.local',
    title: 'M. 고기·튀김 위주, 채소·과일 없음',
    expect: '부족 영양소(비타민 C·A·엽산·칼륨 등)를 채우는 후보가 하나쯤, 튀김·고기 편중은 그대로 피함',
    meals: [
      ...day(1, [['제육볶음'], RICE], [['닭튀김']]),
      ...day(2, [['돈가스']], [['삼겹살구이'], RICE]),
      ...day(3, [['햄버거']], [['족발']]),
      ...day(4, [['소불고기'], RICE], [['탕수육']]),
      ...day(5, [['돼지갈비구이'], RICE], [['닭강정']]),
      ...day(6, [['함박스테이크']], [['피자']]),
      ...day(7, [['제육볶음'], RICE], [['닭튀김']]),
      ...day(8, [['돈가스']], [['삼겹살구이'], RICE]),
      ...day(9, [['햄버거']], [['소불고기'], RICE]),
      ...day(10, [['탕수육']], [['족발']]),
    ],
  },
  {
    id: 'probe-nut-b',
    email: 'nut-probe-b@probe.local',
    title: 'B. 골고루 먹는 대조군',
    expect: '영양 신호가 적으니 추천이 기존과 거의 같아야 한다(과한 보정 없음)',
    meals: [
      ...day(1, [['비빔밥'], ['미역국']], [['고등어구이'], ['잡곡밥', '시금치나물', '된장국']]),
      ...day(2, [['닭가슴살 샐러드'], ['우유']], [['삼치구이'], ['현미밥', '콩나물무침', '배추김치']]),
      ...day(3, [['오징어볶음'], ['잡곡밥', '브로콜리무침']], [['두부조림'], ['잡곡밥', '미역국', '과일샐러드']]),
      ...day(4, [['비빔밥']], [['갈치구이'], ['현미밥', '시금치나물', '달걀찜']]),
      ...day(5, [['연어구이'], ['잡곡밥', '브로콜리무침']], [['순두부찌개'], ['잡곡밥', '콩나물무침']]),
      ...day(6, [['닭가슴살 샐러드'], ['우유']], [['고등어구이'], ['현미밥', '버섯볶음', '된장국']]),
      ...day(7, [['비빔밥'], ['과일샐러드']], [['두부조림'], ['잡곡밥', '시금치나물', '미역국']]),
      ...day(8, [['오징어볶음'], ['현미밥', '배추김치']], [['삼치구이'], ['잡곡밥', '콩나물국', '브로콜리무침']]),
      ...day(9, [['연어구이'], ['잡곡밥', '시금치나물']], [['된장찌개'], ['현미밥', '달걀찜']]),
      ...day(10, [['닭가슴살 샐러드'], ['우유']], [['갈치구이'], ['잡곡밥', '버섯볶음', '과일샐러드']]),
    ],
  },
];

// ── 공통 ─────────────────────────────────────────────────────────────────────
const kstToday = (): string => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
const shiftDate = (key: string, days: number): string => {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const assertSafeDatabase = (): void => {
  const url = (process.env['DATABASE_URL'] ?? '').trim();
  if (!url.startsWith('file:')) throw new Error('SQLite(file:) DATABASE_URL 에서만 실행합니다.');
  if (/prod\.db/i.test(url)) throw new Error('운영 DB(prod.db)에는 가상 사용자를 만들지 않습니다 — 복제본(rec-probe.db 등)에서 돌리세요.');
};
const avg = (xs: number[]): number => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0);
const r2 = (v: number): string => v.toFixed(2);

assertSafeDatabase();
const prisma = new PrismaClient();
const today = kstToday();

const undo = async (): Promise<void> => {
  const ids = PERSONAS.map((p) => p.id);
  await prisma.mealRecommendationEvent.deleteMany({ where: { userId: { in: ids } } });
  await prisma.mealRecommendation.deleteMany({ where: { userId: { in: ids } } });
  await prisma.mealItem.deleteMany({ where: { entry: { userId: { in: ids } } } });
  await prisma.mealEntry.deleteMany({ where: { userId: { in: ids } } });
  await prisma.mealPreference.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
};

const seed = async (): Promise<string[]> => {
  const lex = await loadLexicon(prisma);
  const names = [...new Set(PERSONAS.flatMap((p) => p.meals.flatMap(([, , , mains, sides = []]) => [...mains, ...sides])))];
  const rows = await prisma.foodItem.findMany({ where: { nameNorm: { in: names.map((n) => normalizeTerm(n)) }, active: true } });
  const byNorm = new Map(rows.map((r) => [r.nameNorm, r]));
  const missing = names.filter((n) => !byNorm.get(normalizeTerm(n))?.kcalPer100g && !byNorm.get(normalizeTerm(n))?.kcal);
  for (const p of PERSONAS) {
    await prisma.user.upsert({
      where: { id: p.id },
      create: { id: p.id, email: p.email, passwordHash: await hashPassword(randomBytes(12).toString('hex')) },
      update: {},
    });
    await prisma.mealItem.deleteMany({ where: { entry: { userId: p.id } } });
    await prisma.mealEntry.deleteMany({ where: { userId: p.id } });
    await prisma.mealRecommendation.deleteMany({ where: { userId: p.id } });
    for (const [daysAgo, slot, time, mains, sides = []] of p.meals) {
      const date = shiftDate(today, -daysAgo);
      const list: [string, boolean][] = [...mains.map((n): [string, boolean] => [n, true]), ...sides.map((n): [string, boolean] => [n, false])];
      await prisma.mealEntry.create({
        data: {
          userId: p.id,
          eatenAt: new Date(`${date}T${time}:00+09:00`),
          eatenDate: date,
          slot,
          source: 'manual',
          items: {
            createMany: {
              data: list.map(([name, isMain], i) => {
                const row = byNorm.get(normalizeTerm(name)) ?? null;
                const n = mealServingNutrition(row, { isMain }, lex);
                return {
                  name: row?.name ?? name,
                  nameNorm: normalizeTerm(name),
                  foodId: row?.id ?? null,
                  dishType: row?.dishType ?? null,
                  mainIngredient: row?.mainIngredient ?? null,
                  cuisine: row?.cuisine ?? null,
                  isMain,
                  source: 'manual',
                  sortOrder: i,
                  kcal: n.kcal,
                  proteinG: n.proteinG,
                  sodiumMg: n.sodiumMg,
                  nutritionFrom: n.nutritionFrom,
                  nutritionBasis: n.basis,
                };
              }),
            },
          },
        },
      });
    }
  }
  return missing;
};

// ── 평가 ─────────────────────────────────────────────────────────────────────
interface ListStats {
  soup: number;
  salty: number;
  recent7: number;
  coverage: number;
  gapTagged: number;
  gapsAddressed: number;
  withNutrients: number;
}
const listStats = (list: ScoredCandidate[], s: NutritionSignals | null, recent: Set<string>): ListStats => {
  const fits = s ? list.map((c) => nutritionFit(c, s)) : [];
  const addressed = s
    ? s.gaps.filter((g) =>
        list.some((c) => {
          const v = c.servingNutrients?.[g.per100];
          return v !== undefined && g.reference > 0 && v / g.reference >= TARGET_SHARE;
        }),
      ).length
    : 0;
  return {
    soup: list.filter((c) => isSoupLike(c)).length,
    salty: list.filter((c) => (c.sodiumMg ?? 0) >= SALTY_MG).length,
    recent7: list.filter((c) => recent.has(c.nameNorm)).length,
    coverage: avg(fits.map((f) => f.coverage)),
    gapTagged: fits.filter((f) => f.gapTag).length,
    gapsAddressed: addressed,
    withNutrients: list.filter((c) => c.servingNutrients).length,
  };
};
const oldFallback = (scored: ScoredCandidate[]): ScoredCandidate[] => {
  const out: ScoredCandidate[] = [];
  for (const c of scored) {
    if (out.length >= 3) break;
    if (!out.some((o) => o.nameNorm === c.nameNorm)) out.push(c);
  }
  return out;
};

interface LlmRun {
  variant: 'A' | 'B';
  status: string;
  picks: { name: string; reason: string }[];
  summary: string;
  stats: ListStats;
  mentions: number;
  // 근거 없는 영양 주장(태그에 없는 영양소) — LLM 원문 / 서버 검사 뒤.
  claimsRaw: number;
  claimsKept: number;
  internal: number;
  sec: number;
}

const report: string[] = [];
const log = (line = ''): void => {
  console.log(line);
  report.push(line);
};

const main = async (): Promise<void> => {
  if (UNDO) {
    await undo();
    console.log('가상 사용자·기록·추천을 지웠습니다.');
    return;
  }
  const missing = await seed();
  const nutritionSvc = new MealNutritionService(prisma, { refs: new FoodNutrientRefService(prisma) });
  const pattern = new MealPatternService(prisma);
  const prefs = new MealPreferenceService(prisma);
  const aiConfig = new AiConfigService(prisma, buildLlmProviderEnv());
  // 추론을 켠 설정이어도 끊기지 않게 어댑터 대기 시간을 넉넉히.
  // 서버 검사 전 LLM 원문을 남겨 '근거 없는 영양 주장'을 검사 전·후로 센다.
  const rawTexts: string[] = [];
  const cache = {
    get: (resolved: Parameters<typeof adapterCache.get>[0]) => {
      const inner = adapterCache.get({ ...resolved, timeoutMs: 240_000 });
      return {
        complete: async (opts: Parameters<typeof inner.complete>[0]) => {
          const r = await inner.complete(opts);
          rawTexts.push(r.text);
          return r;
        },
      };
    },
  };
  const recA = new MealRecommendationService(prisma, aiConfig, { cache: cache as never });
  const recB = new MealRecommendationService(prisma, aiConfig, { cache: cache as never, nutrition: nutritionSvc });

  const subjects: { id: string; title: string; expect: string }[] = PERSONAS.map((p) => ({ id: p.id, title: p.title, expect: p.expect }));
  for (const email of EMAILS) {
    const u = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (u) subjects.push({ id: u.id, title: `실제 계정 ${email}`, expect: '실제 기록 — 영양 신호가 있으면 B 가 그만큼 반영' });
  }

  log(`# 식단 추천 영양 보정 프로빙 — ${today} ${MEAL_SLOT_LABEL[SLOT]} (LLM ${LLM_RUNS}회씩)`);
  log('');
  log('지표: 국물·짠(1인분 나트륨 1,500mg↑)·최근 7일 겹침 개수, 보충(부족 영양소를 1회에 기준 25% 이상 채우는 영양소 수), 채움(부족 영양소 평균 충족도 0~1).');
  if (missing.length > 0) log(`카탈로그에 열량이 없어 영양 계산에서 빠진 이름: ${missing.join(', ')}`);

  for (const subject of subjects) {
    const analysis = await nutritionSvc.analyze(subject.id, today, 14);
    const signals = nutritionSignalsFrom(analysis);
    const preference = await prefs.get(subject.id);
    const [history, feedback] = await Promise.all([pattern.loadHistory(subject.id, today), pattern.loadFeedbackSignals(subject.id, today)]);
    const profile = buildProfile(history, SLOT, today, feedback);
    const candidates: CandidateInput[] = await pattern.buildCandidates(profile, preference, `${subject.id}|${today}`);
    const recent = new Set(profile.recentFoods.map((n) => normalizeTerm(n)));
    const month = Number(today.slice(5, 7));
    const scoreWith = (nutrition: NutritionSignals | null): ScoredCandidate[] =>
      filterForFocus(
        filterForSlot(
          candidates
            .map((c) =>
              scoreCandidate(c, { profile, preference, targetSlot: SLOT, mealType: null, month, tempC: null, rain: null, today, nutrition }),
            )
            .sort((a, b) => b.score - a.score),
          profile,
          SLOT,
          3,
        ),
        recommendationFocus(preference.weights, null),
        3,
      );
    const A = scoreWith(null);
    const B = scoreWith(signals);

    log('');
    log(`## ${subject.title}`);
    log(`기대: ${subject.expect}`);
    log(
      `영양 신호: ${
        signals
          ? `${signals.sodiumHigh ? `나트륨 많음(${signals.sodiumPercent}%) · ` : ''}부족 ${signals.gaps.map((g) => `${g.label} ${g.percent}%${g.weight < 1 ? '(조금)' : ''}`).join(', ') || '없음'}`
          : `없음(점검 ${analysis.status})`
      } · 후보 ${candidates.length}개 중 1인분 영양소 있는 것 ${candidates.filter((c) => c.servingNutrients).length}개`,
    );
    const row = (label: string, st: ListStats, names: string): void =>
      log(`| ${label} | ${st.soup} | ${st.salty} | ${st.recent7} | ${st.gapsAddressed} | ${r2(st.coverage)} | ${names} |`);
    log('');
    log('| 구분 | 국물 | 짠 | 최근7일 | 보충 | 채움 | 음식 |');
    log('|---|---|---|---|---|---|---|');
    const top = (xs: ScoredCandidate[]): ScoredCandidate[] => xs.slice(0, PROMPT_CANDIDATES);
    row('A 후보 25', listStats(top(A), signals, recent), '');
    row('B 후보 25', listStats(top(B), signals, recent), '');
    const fbA = oldFallback(A);
    const fbB = pickFallback(B, profile.recentFoods, 3);
    row('A 폴백(예전)', listStats(fbA, signals, recent), fbA.map((c) => c.name).join('·'));
    row('B 폴백(새)', listStats(fbB, signals, recent), fbB.map((c) => c.name).join('·'));
    const movedUp = top(B)
      .slice(0, 10)
      .filter((c) => !top(A).slice(0, 10).some((a) => a.nameNorm === c.nameNorm))
      .map((c) => `${c.name}${c.tags.find((t) => t.endsWith('보충')) ? `(${c.tags.find((t) => t.endsWith('보충'))})` : ''}`);
    const movedDown = top(A)
      .slice(0, 10)
      .filter((c) => !top(B).slice(0, 10).some((b) => b.nameNorm === c.nameNorm))
      .map((c) => c.name);
    log('');
    log(`상위 10 변화 — 올라옴: ${movedUp.join(', ') || '없음'} / 빠짐: ${movedDown.join(', ') || '없음'}`);

    if (LLM_RUNS > 0) {
      const runs: LlmRun[] = [];
      const byNorm = new Map(B.map((c) => [c.nameNorm, c]));
      for (const [variant, svc] of [['A', recA], ['B', recB]] as const) {
        for (let i = 0; i < LLM_RUNS; i++) {
          const t0 = Date.now();
          const before = rawTexts.length;
          const { recommendation } = await svc.create(subject.id, { targetDate: today, targetSlot: SLOT, force: true }, today);
          const raw = rawTexts.length > before ? parseRecommendationOutput(rawTexts[rawTexts.length - 1]!) : null;
          const claims = (items: { name: string; reason: string }[]): number =>
            items.reduce((n, it) => {
              const c = byNorm.get(normalizeTerm(it.name));
              return n + unsupportedNutrients(it.reason, supportedGapKeys(c ?? {}, signals)).length;
            }, 0);
          const sec = (Date.now() - t0) / 1000;
          await prisma.mealRecommendation.delete({ where: { id: recommendation.id } }).catch(() => undefined);
          const picked = recommendation.items
            .map((it) => byNorm.get(normalizeTerm(it.name)))
            .filter((c): c is ScoredCandidate => !!c);
          const text = [recommendation.summary, ...recommendation.items.map((it) => it.reason)].join(' ');
          runs.push({
            variant,
            status: recommendation.status,
            picks: recommendation.items.map((it) => ({ name: it.name, reason: it.reason })),
            summary: recommendation.summary,
            stats: listStats(picked, signals, recent),
            mentions: recommendation.items.filter((it) => NUTRITION_WORD.test(it.reason)).length + (NUTRITION_WORD.test(recommendation.summary) ? 1 : 0),
            claimsRaw: raw ? claims(raw.items) : 0,
            claimsKept: claims(recommendation.items),
            internal: [recommendation.summary, ...recommendation.items.map((it) => it.reason)].filter((t) => INTERNAL_WORD.test(t)).length,
            sec,
          });
          void text;
        }
      }
      log('');
      log('| LLM | 상태 | 국물 | 짠 | 최근7일 | 보충 | 채움 | 영양 언급 | 근거 없는 주장(원문→검사 뒤) | 내부 용어 | 초 | 고른 음식 |');
      log('|---|---|---|---|---|---|---|---|---|---|---|---|');
      for (const r of runs) {
        log(
          `| ${r.variant} | ${r.status} | ${r.stats.soup} | ${r.stats.salty} | ${r.stats.recent7} | ${r.stats.gapsAddressed} | ${r2(r.stats.coverage)} | ${r.mentions} | ${r.claimsRaw}→${r.claimsKept} | ${r.internal} | ${r.sec.toFixed(1)} | ${r.picks.map((p) => p.name).join('·')} |`,
        );
      }
      log('');
      for (const r of runs.filter((x) => x.variant === 'B')) {
        log(`- B 총평: ${r.summary}`);
        for (const p of r.picks) log(`  - ${p.name} — ${p.reason}`);
      }
    }
  }

  const dir = join(process.cwd(), 'data', 'meal-probe');
  await mkdir(dir, { recursive: true });
  const file = join(dir, `nutrition-rec-${today}.md`);
  await writeFile(file, report.join('\n') + '\n', 'utf8');
  console.log(`\n리포트: ${file}`);
};

main()
  .catch((e: unknown) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
