// 식단 추천 프로빙 — 성향이 뚜렷한 가상 사용자 4명에게 일주일 식단을 넣고, 오늘 끼니별 추천이 기대대로
// 나오는지 자동 점검한다. 저장·추천은 앱과 같은 라우트(app.inject)를 타므로 화면과 똑같은 경로다.
//
// 실행: pnpm --filter friendly probe:meal-recommend [--runs 3] [--undo]
//   기본 DB(.env 의 DATABASE_URL, 보통 dev.db)에 그대로 쓴다 — 개발 서버 웹에서 가상 사용자로 로그인해
//   기록·추천을 직접 볼 수 있게 하려는 것이다. 계정·비밀번호와 리포트는 data/meal-probe/ (git 제외)에 남긴다.
//   --runs N : 끼니당 LLM 추천 반복 횟수(기본 3 — 매번 달라질 수 있어 안정성을 본다).
//   --undo   : 가상 사용자와 그 데이터를 지운다.
// 운영 DB(prod.db)·SQLite 가 아닌 DB 는 거부한다(알려진 비밀번호의 계정을 만들기 때문).
// LLM 이 설정돼 있으면 meal-recommend 모델을 실제로 부른다(가상 사용자마다 일일 한도 20 안에서).
//
// 점검은 두 층이다.
//   · 점수(결정적): LLM 이 받는 후보 목록과 7가지 점수 요소 — 매번 같다.
//   · LLM: 그 후보 중 고른 결과와 이유 — 매번 다를 수 있어 여러 번 돌린다.

import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  MEAL_ALLERGEN_LABEL,
  MEAL_DATA_DELETE_CONFIRMATION,
  type MealAllergenType,
  type MealEntryType,
  type MealRecommendationType,
  type MealSlotType,
  type UpdateMealPreferenceInputType,
} from '@repo/api-contract';
import { FOOD_DISH_TYPE_LABEL, FOOD_MAIN_INGREDIENT_LABEL, MEAL_SLOT_LABEL } from '@repo/utils';
import { buildApp } from '../src/app.js';
import { hashPassword } from '../src/lib/hash.js';
import { normalizeTerm } from '../src/lib/text.js';
import { allergensInFoodName } from '../src/modules/food/food-allergen.js';
import { MealPreferenceService } from '../src/modules/meal/meal-preference.service.js';
import {
  MealPatternService,
  buildProfile,
  filterForSlot,
  filterForFocus,
  recommendationFocus,
  scoreCandidate,
  type ScoredCandidate,
} from '../src/modules/meal-recommendation/meal-pattern.service.js';

const args = process.argv.slice(2);
const UNDO = args.includes('--undo');
const RUNS = Math.max(1, Math.min(5, Number(args[args.indexOf('--runs') + 1]) || 3));
const OUT_DIR = join(process.cwd(), 'data', 'meal-probe');
const ACCOUNTS_FILE = join(OUT_DIR, 'accounts.json');
const SLOTS: MealSlotType[] = ['breakfast', 'lunch', 'dinner'];
// 최근 이 일수 안에 먹은 음식이 추천에 나오면 겹침 위반으로 본다(점수의 variety 는 14일에 걸쳐 회복).
const RECENT_DAYS = 2;
// 아침으로 무거운 조리형태 — 점수에 끼니 적합이 없어 확인하려는 가설. 실패가 아니라 '확인 필요'로 표시한다.
const HEAVY_FOR_BREAKFAST = new Set(['grill', 'fried', 'stew', 'braise', 'stir_fry']);
// 한 끼로 추천하기엔 반찬인 조리형태.
const SIDE_DISH_TYPES = new Set(['kimchi', 'namul']);

// ── 가상 사용자 ───────────────────────────────────────────────────────────────
type Meal = [daysAgo: number, slot: MealSlotType, time: string, mains: string[], sides?: string[]];

interface Persona {
  key: 'a' | 'b' | 'c' | 'd';
  id: string;
  email: string;
  title: string;
  expect: string;
  preference?: UpdateMealPreferenceInputType;
  meals: Meal[];
}

const RICE = ['공기밥'];

const PERSONAS: Persona[] = [
  {
    key: 'a',
    id: 'probe-meal-a',
    email: 'meal-probe-a@probe.local',
    title: 'A. 돼지고기·찌개 편중',
    expect: '최근 먹은 제육·찌개는 빠지고, 돼지고기·찌개가 아닌 음식(생선·채소·닭·다른 계통)이 올라온다',
    meals: [
      [7, 'lunch', '12:30', ['김치찌개'], RICE],
      [7, 'dinner', '19:10', ['제육볶음'], RICE],
      [6, 'lunch', '12:20', ['제육볶음'], RICE],
      [6, 'dinner', '19:30', ['김치찌개'], RICE],
      [5, 'lunch', '12:40', ['부대찌개'], RICE],
      [5, 'dinner', '19:00', ['삼겹살구이'], RICE],
      [4, 'lunch', '12:30', ['김치찌개'], RICE],
      [4, 'dinner', '19:20', ['족발']],
      [3, 'lunch', '12:10', ['제육볶음'], RICE],
      [3, 'dinner', '19:40', ['감자탕'], RICE],
      [2, 'lunch', '12:30', ['돈가스']],
      [2, 'dinner', '19:00', ['김치찌개'], RICE],
      [1, 'lunch', '12:20', ['제육볶음'], RICE],
      [1, 'dinner', '19:30', ['부대찌개'], RICE],
    ],
  },
  {
    key: 'b',
    id: 'probe-meal-b',
    email: 'meal-probe-b@probe.local',
    title: 'B. 아침 거르고 야식 위주',
    expect: '최근 야식(라면·치킨·떡볶이)은 빠지고, 아침 추천은 아침으로 먹을 만한 음식이다',
    meals: [
      [7, 'lunch', '12:30', ['김밥']],
      [7, 'late_night', '23:30', ['라면']],
      [6, 'lunch', '12:40', ['짜장면']],
      [6, 'late_night', '23:50', ['치킨']],
      [5, 'lunch', '12:20', ['비빔밥']],
      [5, 'late_night', '23:10', ['떡볶이']],
      [4, 'lunch', '12:30', ['칼국수']],
      [4, 'late_night', '23:40', ['족발']],
      [3, 'lunch', '12:50', ['김밥']],
      [3, 'late_night', '23:20', ['피자']],
      [2, 'lunch', '12:30', ['우동']],
      [2, 'late_night', '23:30', ['라면']],
      [1, 'lunch', '12:40', ['짜장면']],
      [1, 'late_night', '23:50', ['치킨']],
    ],
  },
  {
    key: 'c',
    id: 'probe-meal-c',
    email: 'meal-probe-c@probe.local',
    title: 'C. 알레르기(새우·게)·제외(오이)',
    expect: '새우·게가 든 음식과 오이가 든 음식은 한 번도 나오지 않는다(고수는 가능하면 피함)',
    preference: { allergens: ['shrimp', 'crab'], excludedFoods: ['오이'], dislikedFoods: ['고수'] },
    meals: [
      [7, 'lunch', '12:30', ['해물파전']],
      [7, 'dinner', '19:00', ['고등어구이'], RICE],
      [6, 'lunch', '12:20', ['비빔밥']],
      [6, 'dinner', '19:30', ['된장찌개'], RICE],
      [5, 'lunch', '12:40', ['냉면']],
      [5, 'dinner', '19:10', ['닭볶음탕'], RICE],
      [4, 'lunch', '12:30', ['쌀국수']],
      [4, 'dinner', '19:20', ['갈비탕'], RICE],
      [3, 'lunch', '12:10', ['카레라이스']],
      [3, 'dinner', '19:40', ['순두부찌개'], RICE],
      [2, 'lunch', '12:30', ['잔치국수']],
      [2, 'dinner', '19:00', ['잡채'], RICE],
      [1, 'lunch', '12:20', ['김밥']],
      [1, 'dinner', '19:30', ['미역국'], RICE],
    ],
  },
  {
    key: 'd',
    id: 'probe-meal-d',
    email: 'meal-probe-d@probe.local',
    title: 'D. 추천 반응 반영',
    expect: '점심 추천에서 고른 음식을 먹었다고 기록하고 다른 후보에 👎 하면, 저녁 추천에서 둘 다 순위가 내려간다',
    meals: [
      [7, 'breakfast', '08:10', ['토스트']],
      [7, 'lunch', '12:30', ['비빔밥']],
      [7, 'dinner', '19:00', ['고등어구이'], RICE],
      [6, 'breakfast', '08:00', ['시리얼']],
      [6, 'lunch', '12:40', ['칼국수']],
      [6, 'dinner', '19:30', ['닭볶음탕'], RICE],
      [5, 'lunch', '12:20', ['김치찌개'], RICE],
      [5, 'dinner', '19:10', ['샐러드']],
      [4, 'breakfast', '08:20', ['샌드위치']],
      [4, 'lunch', '12:30', ['쌀국수']],
      [4, 'dinner', '19:20', ['된장찌개'], RICE],
      [3, 'lunch', '12:10', ['카레라이스']],
      [3, 'dinner', '19:40', ['삼겹살구이'], RICE],
      [2, 'breakfast', '08:10', ['토스트']],
      [2, 'lunch', '12:30', ['냉면']],
      [2, 'dinner', '19:00', ['순두부찌개'], RICE],
      [1, 'lunch', '12:20', ['오므라이스']],
      [1, 'dinner', '19:30', ['갈비탕'], RICE],
    ],
  },
];

// ── 날짜 ─────────────────────────────────────────────────────────────────────
const kstToday = (): string => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
const shiftDate = (key: string, days: number): string => {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const kstAt = (dateKey: string, hhmm: string): string => new Date(`${dateKey}T${hhmm}:00+09:00`).toISOString();

// ── 공통 ─────────────────────────────────────────────────────────────────────
const assertSafeDatabase = (): void => {
  const url = (process.env['DATABASE_URL'] ?? '').trim();
  if (!url.startsWith('file:')) throw new Error('SQLite(file:) DATABASE_URL 에서만 실행합니다.');
  if (/prod\.db/i.test(url)) throw new Error('운영 DB(prod.db)에는 가상 사용자를 만들지 않습니다.');
};

const loadPassword = async (): Promise<string> => {
  try {
    const saved = JSON.parse(await readFile(ACCOUNTS_FILE, 'utf8')) as { password?: string };
    if (saved.password) return saved.password;
  } catch {
    // 처음 실행 — 새로 만든다.
  }
  return `probe-${randomBytes(6).toString('hex')}`;
};

const fmt = (n: number): string => n.toFixed(2);
const features = (c: ScoredCandidate): string =>
  ['variety', 'taste', 'balance', 'health', 'novelty', 'weather', 'convenience', 'slot', 'aversion', 'recent']
    .map((k) => `${k[0]}${fmt(c.features[k] ?? 0)}`)
    .join(' ');
const dishLabel = (dishType: string | null): string =>
  dishType ? (FOOD_DISH_TYPE_LABEL[dishType as keyof typeof FOOD_DISH_TYPE_LABEL] ?? dishType) : '-';
const ingredientLabel = (v: string | null): string =>
  v ? (FOOD_MAIN_INGREDIENT_LABEL[v as keyof typeof FOOD_MAIN_INGREDIENT_LABEL] ?? v) : '-';

interface Check {
  persona: string;
  label: string;
  ok: boolean | 'warn';
  detail: string;
}

const main = async (): Promise<void> => {
  assertSafeDatabase();
  const app = await buildApp({ logger: false });
  await app.ready();
  const prisma = app.prisma;

  try {
    if (UNDO) {
      for (const p of PERSONAS) {
        const user = await prisma.user.findUnique({ where: { id: p.id } });
        if (!user) continue;
        const auth = {
          authorization: `Bearer ${app.jwt.sign({ userId: p.id, email: p.email, role: 'USER', tv: user.tokenVersion })}`,
        };
        await app.inject({
          method: 'DELETE',
          url: '/api/v1/meals/data',
          headers: auth,
          payload: { confirmation: MEAL_DATA_DELETE_CONFIRMATION },
        });
        await prisma.user.delete({ where: { id: p.id } });
        console.log(`삭제: ${p.title} (${p.email})`);
      }
      return;
    }

    await mkdir(OUT_DIR, { recursive: true });
    const password = await loadPassword();
    const passwordHash = await hashPassword(password);
    await writeFile(
      ACCOUNTS_FILE,
      JSON.stringify({ password, accounts: PERSONAS.map((p) => ({ email: p.email, title: p.title })) }, null, 2),
    );

    const today = kstToday();
    const month = Number(today.slice(5, 7));
    const pattern = new MealPatternService(prisma);
    const preferences = new MealPreferenceService(prisma);
    const checks: Check[] = [];
    const llmModels = new Set<string>();
    let fallbackCount = 0;
    // 리포트 = 머리말(계정) + 자동 점검 요약 + 사용자별 본문(md).
    const intro: string[] = [];
    const md: string[] = [];
    intro.push(`# 식단 추천 프로빙 — ${today}`, '');
    intro.push(
      '웹(개발 서버)에서 아래 계정으로 로그인하면 **내 식단 → 기록·추천** 탭에서 같은 데이터를 볼 수 있다.',
      `비밀번호(4명 공통, 로컬 dev 전용): \`${password}\``,
      '',
      '| 사용자 | 이메일 |',
      '|---|---|',
      ...PERSONAS.map((p) => `| ${p.title} | \`${p.email}\` |`),
      '',
      '점수 요소 약자: v 겹침 회피 · t 취향 · b 균형 · h 건강 · n 새로움 · w 날씨 · c 간편함(0~1) · s 끼니 적합 배수(1 기준) · a 싫다는 신호 감점(0~0.9) · r 방금 먹음 배수(오늘 0.2·어제 0.5·그제 0.8). 날씨는 위치 없이 계절 기준.',
      '',
    );

    const scoreFor = async (userId: string, slot: MealSlotType): Promise<ScoredCandidate[]> => {
      const preference = await preferences.get(userId);
      const [history, feedback] = await Promise.all([
        pattern.loadHistory(userId, today),
        pattern.loadFeedbackSignals(userId, today),
      ]);
      const profile = buildProfile(history, slot, today, feedback);
      const raw = await pattern.buildCandidates(profile, preference, `${userId}|${today}`);
      return filterForFocus(
        filterForSlot(
          raw
            .map((c) =>
              scoreCandidate(c, {
                profile,
                preference,
                targetSlot: slot,
                mealType: preference.mealTypes[0] ?? null,
                month,
                tempC: null,
                rain: null,
                today,
              }),
            )
            .sort((a, b) => b.score - a.score),
          profile,
          slot,
        ),
        recommendationFocus(preference.weights, null),
      );
    };

    for (const p of PERSONAS) {
      console.log(`\n=== ${p.title} ===`);
      const user = await prisma.user.upsert({
        where: { id: p.id },
        update: { email: p.email, passwordHash, role: 'USER' },
        create: { id: p.id, email: p.email, passwordHash, role: 'USER' },
      });
      // 웹에서 로그인·로그아웃하면 tokenVersion 이 올라 예전 토큰이 무효가 된다 — 현재 값(tv)으로 서명한다.
      const auth = {
        authorization: `Bearer ${app.jwt.sign({ userId: p.id, email: p.email, role: 'USER', tv: user.tokenVersion })}`,
      };
      const call = async <T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown): Promise<T> => {
        const res = await app.inject({ method, url, headers: auth, ...(payload === undefined ? {} : { payload: payload as object }) });
        if (res.statusCode >= 400) throw new Error(`${method} ${url} → ${res.statusCode} ${res.body.slice(0, 300)}`);
        return (res.body ? res.json() : null) as T;
      };

      // 다시 돌려도 같은 출발점 — 이 사용자의 식단·추천·한도를 비우고 선호를 기본값으로.
      await call('DELETE', '/api/v1/meals/data', { confirmation: MEAL_DATA_DELETE_CONFIRMATION });
      await call('PUT', '/api/v1/meals/preference', {
        allergens: [],
        excludedFoods: [],
        dislikedFoods: [],
        likedFoods: [],
        onboarded: true,
        ...p.preference,
      });

      // 일주일 식단 — 앱과 같은 저장 경로(카탈로그 매칭·분류·영양 스냅샷).
      const eatenByDate = new Map<string, string[]>();
      for (const [daysAgo, slot, time, mains, sides = []] of p.meals) {
        const date = shiftDate(today, -daysAgo);
        const entry = await call<MealEntryType>('POST', '/api/v1/meals', {
          eatenAt: kstAt(date, time),
          eatenDate: date,
          slot,
          source: 'manual',
          items: [
            ...mains.map((name) => ({ name, isMain: true, source: 'manual' })),
            ...sides.map((name) => ({ name, isMain: false, source: 'manual' })),
          ],
        });
        eatenByDate.set(date, [...(eatenByDate.get(date) ?? []), ...entry.items.filter((i) => i.isMain).map((i) => i.name)]);
      }
      const recentNorms = new Set<string>();
      for (let d = 0; d <= RECENT_DAYS; d += 1) {
        for (const name of eatenByDate.get(shiftDate(today, -d)) ?? []) recentNorms.add(normalizeTerm(name));
      }

      md.push(`## ${p.title}`, '', `계정 \`${p.email}\` · 기대: ${p.expect}`, '');
      if (p.preference) {
        const pr = p.preference;
        md.push(
          `선호 설정: 알레르기 ${(pr.allergens ?? []).map((a) => MEAL_ALLERGEN_LABEL[a]).join(', ') || '-'} · 제외 ${(pr.excludedFoods ?? []).join(', ') || '-'} · 덜 선호 ${(pr.dislikedFoods ?? []).join(', ') || '-'}`,
          '',
        );
      }
      md.push('| 날짜 | 먹은 것 |', '|---|---|');
      for (const [date, names] of [...eatenByDate.entries()].sort()) md.push(`| ${date} | ${names.join(', ')} |`);
      md.push('');

      const prefNow = await preferences.get(p.id);
      const allergens = new Set<MealAllergenType>(prefNow.allergens);

      // 한 추천 결과를 점검하고 리포트 줄을 만든다.
      const inspect = (slot: MealSlotType, rec: MealRecommendationType, pool: ScoredCandidate[], run: number): string[] => {
        const lines: string[] = [];
        const poolNorms = new Set(pool.map((c) => c.nameNorm));
        const names = rec.items.map((i) => i.name);
        lines.push(
          `- ${run}회차 [${rec.status}${rec.model ? ` · ${rec.model}` : ''}] ${names.join(' / ')}${rec.summary ? ` — “${rec.summary}”` : ''}`,
        );
        for (const item of rec.items) {
          lines.push(`  - **${item.name}** (${dishLabel(item.dishType)}·${ingredientLabel(item.mainIngredient)}): ${item.reason}`);
        }
        if (rec.model) llmModels.add(rec.model);
        else fallbackCount += 1;
        const sideDish = rec.items.filter((i) => i.dishType && SIDE_DISH_TYPES.has(i.dishType));
        checks.push({
          persona: p.title,
          label: `${MEAL_SLOT_LABEL[slot]} ${run}회 — 반찬류(김치·나물)를 끼니로 추천하지 않음`,
          ok: sideDish.length === 0 ? true : 'warn',
          detail: sideDish.map((i) => `${i.name}(${dishLabel(i.dishType)})`).join(', ') || '없음',
        });
        const outOfPool = names.filter((n) => !poolNorms.has(normalizeTerm(n)));
        checks.push({
          persona: p.title,
          label: `${MEAL_SLOT_LABEL[slot]} ${run}회 — 후보 밖 이름 없음`,
          ok: outOfPool.length === 0,
          detail: outOfPool.join(', ') || '없음',
        });
        const repeats = names.filter((n) => recentNorms.has(normalizeTerm(n)));
        checks.push({
          persona: p.title,
          label: `${MEAL_SLOT_LABEL[slot]} ${run}회 — 최근 ${RECENT_DAYS}일 먹은 음식 없음`,
          ok: repeats.length === 0,
          detail: repeats.join(', ') || '없음',
        });
        if (allergens.size > 0 || prefNow.excludedFoods.length > 0) {
          const bad = rec.items.filter(
            (i) =>
              i.allergenWarnings.some((a) => allergens.has(a)) ||
              // 서버 경고는 재료 정보가 있을 때만 생긴다 — 이름에 보이는 알레르겐도 위반으로 본다.
              allergensInFoodName(i.name).some((a) => allergens.has(a)) ||
              prefNow.excludedFoods.some((t) => normalizeTerm(i.name).includes(normalizeTerm(t))) ||
              i.ingredients.some((ing) => prefNow.excludedFoods.some((t) => ing.includes(t))),
          );
          checks.push({
            persona: p.title,
            label: `${MEAL_SLOT_LABEL[slot]} ${run}회 — 알레르기·제외 위반 없음`,
            ok: bad.length === 0,
            detail: bad.map((i) => i.name).join(', ') || '없음',
          });
        }
        if (slot === 'breakfast') {
          const heavy = rec.items.filter((i) => i.dishType && HEAVY_FOR_BREAKFAST.has(i.dishType));
          checks.push({
            persona: p.title,
            label: `아침 ${run}회 — 무거운 요리(구이·튀김·찌개·조림·볶음) 없음`,
            ok: heavy.length === 0 ? true : 'warn',
            detail: heavy.map((i) => `${i.name}(${dishLabel(i.dishType)})`).join(', ') || '없음',
          });
        }
        if (p.key === 'a') {
          const pork = rec.items.filter((i) => i.mainIngredient === 'pork' || i.dishType === 'stew');
          checks.push({
            persona: p.title,
            label: `${MEAL_SLOT_LABEL[slot]} ${run}회 — 돼지고기·찌개가 절반 미만`,
            ok: pork.length * 2 < rec.items.length,
            detail: `${pork.length}/${rec.items.length}${pork.length ? ` (${pork.map((i) => i.name).join(', ')})` : ''}`,
          });
        }
        return lines;
      };

      const scoreTable = (pool: ScoredCandidate[], n = 8): string[] => [
        '| 순위 | 후보 | 분류 | 점수 | 요소 | 태그 |',
        '|---|---|---|---|---|---|',
        ...pool
          .slice(0, n)
          .map(
            (c, i) =>
              `| ${i + 1} | ${c.name} | ${dishLabel(c.dishType)}·${ingredientLabel(c.mainIngredient)} | ${fmt(c.score)} | ${features(c)} | ${c.tags.join(', ')} |`,
          ),
      ];

      // 추천 라우트는 IP 당 분당 10회 제한이 있어(앱과 같은 경로) 걸리면 1분 쉬고 다시 부른다.
      const recommend = async (slot: MealSlotType): Promise<MealRecommendationType> => {
        for (let attempt = 0; ; attempt += 1) {
          const res = await app.inject({
            method: 'POST',
            url: '/api/v1/meals/recommendations',
            headers: auth,
            payload: { targetDate: today, targetSlot: slot, force: true },
          });
          if (res.statusCode === 429 && attempt < 3) {
            console.log('  (요청 제한 — 61초 기다렸다 다시)');
            await new Promise((r) => setTimeout(r, 61_000));
            continue;
          }
          if (res.statusCode >= 400) throw new Error(`추천 ${slot} → ${res.statusCode} ${res.body.slice(0, 300)}`);
          return res.json<MealRecommendationType>();
        }
      };
      // LLM 이 없으면(폴백·모델 없음) 결과가 결정적이라 반복할 필요가 없다.
      const llmMissing = (rec: MealRecommendationType): boolean => rec.status === 'fallback' && !rec.model;

      if (p.key !== 'd') {
        const picksBySlot = new Map<MealSlotType, string>();
        for (const slot of SLOTS) {
          const pool = await scoreFor(p.id, slot);
          md.push(`### ${MEAL_SLOT_LABEL[slot]}`, '', `점수 상위(후보 ${pool.length}개 중 8개):`, '', ...scoreTable(pool), '', 'LLM 추천:', '');
          for (let run = 1; run <= RUNS; run += 1) {
            const rec = await recommend(slot);
            md.push(...inspect(slot, rec, pool, run));
            console.log(`  ${MEAL_SLOT_LABEL[slot]} ${run}회: [${rec.status}] ${rec.items.map((i) => i.name).join(' / ')}`);
            if (run === 1) picksBySlot.set(slot, rec.items.map((i) => i.name).join(' / '));
            if (llmMissing(rec)) {
              md.push('  - (LLM 미설정·실패로 점수 폴백 — 결과가 결정적이라 반복하지 않음)');
              break;
            }
          }
          md.push('');
        }
        const distinct = new Set(picksBySlot.values());
        checks.push({
          persona: p.title,
          label: '끼니(아침·점심·저녁)마다 추천이 다름',
          ok: distinct.size > 1 ? true : 'warn',
          detail: distinct.size > 1 ? `${distinct.size}가지` : `셋 다 ${[...distinct][0] ?? '-'}`,
        });
      } else {
        // D — 점심 추천에서 1위를 먹었다고 기록하고 2위에 👎 → 저녁 추천에서 두 음식의 순위를 비교.
        const dinnerBefore = await scoreFor(p.id, 'dinner');
        const lunchPool = await scoreFor(p.id, 'lunch');
        const lunch = await recommend('lunch');
        md.push('### 점심 — 반응 전', '', ...scoreTable(lunchPool), '', 'LLM 추천:', '', ...inspect('lunch', lunch, lunchPool, 1), '');
        const eaten = lunch.items[0];
        const disliked = lunch.items[1];
        if (eaten && disliked) {
          await call('POST', `/api/v1/meals/recommendations/${lunch.id}/events`, {
            kind: 'candidate_picked',
            candidateName: eaten.name,
            candidateFoodId: eaten.foodId,
            candidateRank: 0,
            platform: 'web',
          });
          await call('POST', '/api/v1/meals', {
            eatenAt: kstAt(today, '12:30'),
            eatenDate: today,
            slot: 'lunch',
            source: 'recommendation',
            originRecommendationId: lunch.id,
            items: [{ name: eaten.name, foodId: eaten.foodId, isMain: true, source: 'recommendation' }],
          });
          await call('POST', `/api/v1/meals/recommendations/${lunch.id}/events`, {
            kind: 'candidate_rated',
            candidateName: disliked.name,
            candidateFoodId: disliked.foodId,
            candidateRank: 1,
            rating: -1,
            platform: 'web',
          });
          recentNorms.add(normalizeTerm(eaten.name));
          const dinnerAfter = await scoreFor(p.id, 'dinner');
          const rankOf = (pool: ScoredCandidate[], name: string): string => {
            const i = pool.findIndex((c) => c.nameNorm === normalizeTerm(name));
            return i < 0 ? '후보 아님' : `${i + 1}위(${fmt(pool[i]!.score)})`;
          };
          const dropped = (name: string): boolean => {
            const before = dinnerBefore.findIndex((c) => c.nameNorm === normalizeTerm(name));
            const after = dinnerAfter.findIndex((c) => c.nameNorm === normalizeTerm(name));
            return before < 0 || after < 0 || after > before;
          };
          md.push(
            `반응: **${eaten.name}** 선택 → 오늘 점심으로 기록, **${disliked.name}** 👎`,
            '',
            '| 음식 | 저녁 점수 순위(반응 전) | 저녁 점수 순위(반응 후) |',
            '|---|---|---|',
            `| ${eaten.name} (먹음) | ${rankOf(dinnerBefore, eaten.name)} | ${rankOf(dinnerAfter, eaten.name)} |`,
            `| ${disliked.name} (👎) | ${rankOf(dinnerBefore, disliked.name)} | ${rankOf(dinnerAfter, disliked.name)} |`,
            '',
          );
          checks.push({
            persona: p.title,
            label: '먹었다고 기록한 음식의 저녁 순위가 내려감',
            ok: dropped(eaten.name),
            detail: `${rankOf(dinnerBefore, eaten.name)} → ${rankOf(dinnerAfter, eaten.name)}`,
          });
          checks.push({
            persona: p.title,
            label: '👎 한 음식의 저녁 순위가 내려감',
            ok: dropped(disliked.name),
            detail: `${rankOf(dinnerBefore, disliked.name)} → ${rankOf(dinnerAfter, disliked.name)}`,
          });
          md.push('### 저녁 — 반응 후', '', ...scoreTable(dinnerAfter), '', 'LLM 추천:', '');
          for (let run = 1; run <= RUNS; run += 1) {
            const rec = await recommend('dinner');
            md.push(...inspect('dinner', rec, dinnerAfter, run));
            const again = rec.items.filter((i) => [eaten.name, disliked.name].map(normalizeTerm).includes(normalizeTerm(i.name)));
            checks.push({
              persona: p.title,
              label: `저녁 ${run}회 — 먹은 음식·👎 음식이 다시 나오지 않음`,
              ok: again.length === 0 ? true : 'warn',
              detail: again.map((i) => i.name).join(', ') || '없음',
            });
            console.log(`  저녁(반응 후) ${run}회: [${rec.status}] ${rec.items.map((i) => i.name).join(' / ')}`);
            if (llmMissing(rec)) {
              md.push('  - (LLM 미설정·실패로 점수 폴백 — 결과가 결정적이라 반복하지 않음)');
              break;
            }
          }
          md.push('');
        } else {
          checks.push({ persona: p.title, label: '점심 추천이 2개 이상', ok: false, detail: `${lunch.items.length}개` });
        }
      }
    }

    // ── 요약 ──
    const icon = (ok: Check['ok']): string => (ok === true ? '✅' : ok === 'warn' ? '⚠️' : '❌');
    const summary = [
      '## 자동 점검 요약',
      '',
      llmModels.size > 0
        ? `LLM 모델: ${[...llmModels].join(', ')}${fallbackCount ? ` · 점수 폴백 ${fallbackCount}회` : ''}`
        : '**LLM 미사용** — meal-recommend 모델이 설정되지 않았거나 호출이 실패해 전부 점수 폴백(점수 상위 그대로)이다.',
      '',
      `통과 ${checks.filter((c) => c.ok === true).length} · 확인 필요 ${checks.filter((c) => c.ok === 'warn').length} · 실패 ${checks.filter((c) => c.ok === false).length}`,
      '',
      '| | 사용자 | 점검 | 결과 |',
      '|---|---|---|---|',
      ...checks.map((c) => `| ${icon(c.ok)} | ${c.persona} | ${c.label} | ${c.detail} |`),
      '',
    ];
    const report = [...intro, ...summary, ...md].join('\n');
    const file = join(OUT_DIR, `report-${today}.md`);
    await writeFile(file, report);
    console.log(`\n${summary[2]}`);
    for (const c of checks.filter((x) => x.ok !== true)) console.log(`  ${icon(c.ok)} ${c.persona} · ${c.label}: ${c.detail}`);
    console.log(`\n리포트: ${file}`);
    console.log(`계정: ${ACCOUNTS_FILE} (웹 로그인용, git 제외)`);
  } finally {
    await app.close();
  }
};

main().catch((e: unknown) => {
  console.error(e);
  process.exitCode = 1;
});
