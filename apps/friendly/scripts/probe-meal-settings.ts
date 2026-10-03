// 식단 추천 설정 점검 — 같은 사람·같은 기록에 설정만 바꿔 가며 추천이 설정대로 움직이는지 본다.
// 기록이 다양한 가상 사용자 E 한 명에게 2주 식단을 넣고 두 층으로 점검한다.
//   · 점수 층(결정적, LLM 없음): 설정 객체만 바꿔 LLM 이 받는 후보(상위 25)·상위 10 을 비교한다.
//     가중치(기본·프리셋 4·한 축 올리기 7)·날씨(기온·비 고정값)·식사 방식·목록 설정(제외·알레르기·덜 선호·좋아함과
//     그 조합). 기대 방향으로 움직이면 통과, 그대로면 '효과 없음'(확인), 반대로 가면 실패.
//   · LLM 층: 앱과 같은 라우트로 설정을 저장하고 추천을 받는다(프리셋·메모·알레르기). LLM 은 매번 다를 수 있어
//     방향 어긋남은 '확인'으로, 제외·알레르기·후보 밖 이름은 실패로 본다.
// 알레르기는 서버 판정(재료·표시 정보)과 별개로 이 스크립트의 이름 단어표로도 본다 — 서버 판정만 쓰면 재료 정보가
// 없는 카탈로그에서 검사 자체가 늘 통과한다(2026-10-04 프로빙에서 확인).
//
// 실행: pnpm --filter friendly probe:meal-settings [--score-only] [--undo]
//   dev.db 에 그대로 쓴다(웹에서 E 로 로그인해 기록·추천·설정을 직접 볼 수 있게). 계정·리포트는 data/meal-probe/
//   (git 제외, 비밀번호는 probe:meal-recommend 와 공통). 운영 DB(prod.db)는 거부. 끝나면 E 의 설정을 기본값으로 되돌린다.
//   --score-only : LLM 층을 건너뛴다(빠름).
//   --undo       : E 와 그 데이터를 지운다.

import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  MEAL_ALLERGEN_LABEL,
  MEAL_DATA_DELETE_CONFIRMATION,
  MEAL_DEFAULT_WEIGHTS,
  MEAL_WEIGHT_PRESETS,
  MealWeightKeys,
  type MealAllergenType,
  type MealPreferenceType,
  type MealRecommendationType,
  type MealSlotType,
  type MealTypeType,
  type MealWeightsType,
  type UpdateMealPreferenceInputType,
} from '@repo/api-contract';
import { FOOD_DISH_TYPE_LABEL, MEAL_SLOT_LABEL } from '@repo/utils';
import { buildApp } from '../src/app.js';
import { hashPassword } from '../src/lib/hash.js';
import { normalizeTerm } from '../src/lib/text.js';
import { MealPreferenceService } from '../src/modules/meal/meal-preference.service.js';
import {
  CANDIDATE_POOL_SIZE,
  MealPatternService,
  allergenData,
  buildProfile,
  filterForSlot,
  filterForFocus,
  recommendationFocus,
  hitsUserAllergen,
  scoreCandidate,
  type ScoredCandidate,
} from '../src/modules/meal-recommendation/meal-pattern.service.js';

const args = process.argv.slice(2);
const UNDO = args.includes('--undo');
const SCORE_ONLY = args.includes('--score-only');
const OUT_DIR = join(process.cwd(), 'data', 'meal-probe');
const ACCOUNTS_FILE = join(OUT_DIR, 'accounts.json');
// LLM 프롬프트에 넣는 후보 수(서비스 PROMPT_CANDIDATES)와 화면에 가까운 상위 수.
const PROMPT_TOP = 25;
const TOP = 10;
// 지표가 이만큼은 움직여야 '바뀌었다'고 본다(0~1 비율·점수 기준).
const EPS = 0.02;

const PERSONA = {
  id: 'probe-meal-e',
  email: 'meal-probe-e@probe.local',
  title: 'E. 설정 점검(다양한 2주 기록)',
};

// ── 기록(2주) ────────────────────────────────────────────────────────────────
type Meal = [daysAgo: number, slot: MealSlotType, time: string, mains: string[], sides?: string[]];
const RICE = '공기밥';
const MEALS: Meal[] = [
  [14, 'breakfast', '08:10', ['토스트'], ['달걀후라이', '우유']],
  [14, 'lunch', '12:30', ['짜장면', '탕수육']],
  [14, 'dinner', '19:00', ['김치찌개'], [RICE, '달걀말이', '깍두기']],
  [13, 'breakfast', '08:00', ['시리얼'], ['우유']],
  [13, 'lunch', '12:20', ['순대국밥'], ['깍두기']],
  [13, 'dinner', '19:30', ['된장찌개', '고등어구이'], [RICE, '시금치나물']],
  [12, 'lunch', '12:30', ['돈가스'], ['양배추샐러드']],
  [12, 'dinner', '21:00', ['닭튀김'], ['무초절임(치킨무)']],
  [11, 'lunch', '12:10', ['비빔밥'], ['된장국']],
  [11, 'dinner', '19:00', ['닭볶음탕'], [RICE, '배추김치']],
  [10, 'lunch', '13:00', ['잡채', '완자전'], [RICE]],
  [10, 'dinner', '19:00', ['소갈비찜'], [RICE, '토란국']],
  [9, 'breakfast', '10:30', ['떡만두국'], ['배추김치']],
  [9, 'lunch', '13:30', ['물냉면']],
  [9, 'late_night', '22:00', ['떡볶이', '순대'], ['김말이튀김']],
  [8, 'breakfast', '11:00', ['토스트']],
  [8, 'lunch', '14:00', ['스파게티', '피자']],
  [8, 'dinner', '19:00', ['닭가슴살 샐러드'], ['군고구마']],
  [7, 'breakfast', '08:00', ['삶은 달걀'], ['바나나']],
  [7, 'lunch', '12:30', ['제육덮밥'], ['미소된장국']],
  [7, 'dinner', '19:30', ['순두부찌개'], [RICE, '멸치볶음']],
  [6, 'lunch', '12:00', ['쌀국수'], ['월남쌈']],
  [6, 'dinner', '20:00', ['삼겹살'], ['된장찌개', RICE]],
  [5, 'lunch', '12:30', ['우동'], ['새우튀김']],
  [5, 'dinner', '19:00', ['카레라이스'], ['배추김치']],
  [4, 'breakfast', '08:00', ['시리얼'], ['우유']],
  [4, 'lunch', '12:20', ['모둠초밥']],
  [4, 'dinner', '19:10', ['제육볶음'], [RICE, '미역국']],
  [3, 'lunch', '12:30', ['부대찌개'], [RICE]],
  [3, 'dinner', '18:30', ['피자'], ['콜라']],
  [2, 'breakfast', '10:30', ['김치볶음밥'], ['달걀후라이']],
  [2, 'lunch', '13:30', ['칼국수', '김치만두']],
  [2, 'dinner', '19:10', ['소불고기'], [RICE, '배추김치']],
  [1, 'lunch', '12:30', ['콩나물국밥'], ['깍두기']],
  [1, 'dinner', '19:00', ['고등어구이'], [RICE, '된장국']],
];

// 알레르기 이름 단어표 — 서버 판정과 별개의 점검 기준(휴리스틱). 이 이름이 든 음식은 해당 알레르기 사용자에게
// 나오면 안 된다고 본다. 서버 쪽 규칙이 아니라 프로빙 기준이다.
const ALLERGEN_NAME_WORDS: Partial<Record<MealAllergenType, string[]>> = {
  shrimp: ['새우', '대하', '쉬림프', '감바스'],
  crab: ['꽃게', '대게', '게살', '게장', '게맛살', '킹크랩', '크랩', '게찜', '게탕'],
  squid: ['오징어'],
  shellfish: ['조개', '바지락', '홍합', '전복', '가리비', '꼬막', '생굴', '굴국', '굴전', '굴밥'],
  mackerel: ['고등어'],
  peanut: ['땅콩'],
  egg: ['달걀', '계란'],
  milk: ['우유', '치즈', '크림'],
  pork: ['돼지', '삼겹', '제육', '족발', '보쌈', '돈가스', '돈까스'],
  beef: ['소고기', '쇠고기', '한우', '차돌'],
  chicken: ['닭', '치킨'],
};
const nameHitsAllergen = (name: string, allergens: MealAllergenType[]): MealAllergenType[] => {
  const norm = normalizeTerm(name);
  return allergens.filter((a) => (ALLERGEN_NAME_WORDS[a] ?? []).some((w) => norm.includes(normalizeTerm(w))));
};

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

interface AccountsFile {
  password?: string;
  accounts?: { email: string; title: string }[];
}
const loadAccounts = async (): Promise<AccountsFile> => {
  try {
    return JSON.parse(await readFile(ACCOUNTS_FILE, 'utf8')) as AccountsFile;
  } catch {
    return {};
  }
};

const fmt = (n: number | null): string => (n === null ? '-' : n.toFixed(2));
const pct = (n: number): string => `${Math.round(n * 100)}%`;
const dishLabel = (dishType: string | null): string =>
  dishType ? (FOOD_DISH_TYPE_LABEL[dishType as keyof typeof FOOD_DISH_TYPE_LABEL] ?? dishType) : '-';
const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const std = (xs: number[]): number => {
  const m = mean(xs);
  return m === null ? 0 : Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length);
};

const WARM = new Set(['soup', 'stew', 'steam', 'braise']);
const COOL = new Set(['noodle', 'salad', 'raw_fish', 'namul']);
const FRIED = new Set(['fried', 'bakery']);

// 목록 하나의 지표 — 전부 0~1(kcal 제외). 방향 판정에 쓴다.
interface Metrics {
  novel: number; // 안 먹어 본 음식 비율
  history: number; // 먹던 음식·좋아함 비율
  health: number; // 건강 요소 평균
  kcal: number | null; // 1인분 kcal 평균
  fried: number; // 튀김·빵 비율
  balance: number; // 균형 요소 평균
  variety: number; // 겹침 회피 요소 평균
  warm: number; // 국물·찜·조림 비율
  cool: number; // 면·샐러드·회·나물 비율
  heavy: number; // 최근 가장 많이 먹은 조리형태·주재료와 겹치는 정도(0~1, 낮을수록 골고루)
}
// E 의 최근 1위 조리형태·주재료 — 기록을 넣은 뒤 채운다. '골고루' 판정은 균형 요소 평균이 아니라 이것으로 본다
// (균형 요소에 계통이 섞였을 때 '0.68 → 0.68, 효과 없음'으로 잘못 읽었다 — 2026-10-04 골고루 실험).
const heavyTop: { dish: string | null; ing: string | null } = { dish: null, ing: null };
const metricsOf = (list: ScoredCandidate[]): Metrics => {
  const share = (pred: (c: ScoredCandidate) => boolean): number =>
    list.length ? list.filter(pred).length / list.length : 0;
  const avg = (key: string): number => mean(list.map((c) => c.features[key] ?? 0)) ?? 0;
  return {
    novel: share((c) => (c.features['novelty'] ?? 0) === 1),
    history: share((c) => c.lastEatenDate !== null || c.liked),
    health: avg('health'),
    kcal: mean(list.flatMap((c) => (c.kcal === null ? [] : [c.kcal]))),
    fried: share((c) => Boolean(c.dishType && FRIED.has(c.dishType))),
    balance: avg('balance'),
    variety: avg('variety'),
    warm: share((c) => Boolean(c.dishType && WARM.has(c.dishType))),
    cool: share((c) => Boolean(c.dishType && COOL.has(c.dishType))),
    heavy:
      mean(
        list.map(
          (c) =>
            ((heavyTop.dish && c.dishType === heavyTop.dish ? 1 : 0) +
              (heavyTop.ing && c.mainIngredient === heavyTop.ing ? 1 : 0)) /
            2,
        ),
      ) ?? 0,
  };
};
type MetricKey = Exclude<keyof Metrics, 'kcal'>;
const METRIC_LABEL: Record<MetricKey, string> = {
  novel: '새 음식 비율',
  history: '먹던·좋아함 비율',
  health: '건강 평균',
  fried: '튀김·빵 비율',
  balance: '균형 평균',
  variety: '겹침 회피 평균',
  warm: '국물·찜 비율',
  cool: '면·샐러드 비율',
  heavy: '많이 먹은 조리형태·주재료 겹침',
};
const overlap = (a: ScoredCandidate[], b: ScoredCandidate[], k: number): number => {
  const as = new Set(a.slice(0, k).map((c) => c.nameNorm));
  const bs = b.slice(0, k).map((c) => c.nameNorm);
  return bs.filter((n) => as.has(n)).length / Math.max(1, Math.min(k, bs.length));
};
const rankOf = (pool: ScoredCandidate[], name: string): number =>
  pool.findIndex((c) => c.nameNorm === normalizeTerm(name));
const rankText = (pool: ScoredCandidate[], name: string): string => {
  const i = rankOf(pool, name);
  return i < 0 ? '후보 아님' : `${i + 1}위(${fmt(pool[i]!.score)})`;
};

interface Check {
  group: string;
  label: string;
  ok: boolean | 'warn';
  detail: string;
}
const icon = (ok: Check['ok']): string => (ok === true ? '✅' : ok === 'warn' ? '⚠️' : '❌');
// 기대 방향 판정 — up: 올라가야, down: 내려가야.
const judge = (before: number, after: number, dir: 'up' | 'down'): Check['ok'] => {
  // 기준이 이미 끝(1 또는 0)이면 더 움직일 수 없다 — 그대로면 통과.
  const edge = dir === 'up' ? 1 : 0;
  if (Math.abs(before - edge) <= EPS && Math.abs(after - edge) <= EPS) return true;
  const delta = after - before;
  if (Math.abs(delta) <= EPS) return 'warn';
  return (dir === 'up' ? delta > 0 : delta < 0) ? true : false;
};

const main = async (): Promise<void> => {
  assertSafeDatabase();
  const app = await buildApp({ logger: false });
  await app.ready();
  const prisma = app.prisma;
  // 웹에서 이 계정으로 로그인·로그아웃하면 tokenVersion 이 올라 예전 토큰이 무효가 된다(2026-10-04 화면 확인 뒤
  // 'Session expired'). 계정을 만든 뒤 현재 tokenVersion(tv)으로 서명한다.
  const auth = { authorization: '' };
  const signAuth = async (): Promise<void> => {
    const user = await prisma.user.findUnique({ where: { id: PERSONA.id }, select: { tokenVersion: true } });
    const token = app.jwt.sign({
      userId: PERSONA.id,
      email: PERSONA.email,
      role: 'USER',
      tv: user?.tokenVersion ?? 0,
    });
    auth.authorization = `Bearer ${token}`;
  };
  const call = async <T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown): Promise<T> => {
    const res = await app.inject({ method, url, headers: auth, ...(payload === undefined ? {} : { payload: payload as object }) });
    if (res.statusCode >= 400) throw new Error(`${method} ${url} → ${res.statusCode} ${res.body.slice(0, 300)}`);
    return (res.body ? res.json() : null) as T;
  };

  try {
    if (UNDO) {
      const user = await prisma.user.findUnique({ where: { id: PERSONA.id } });
      if (user) {
        await signAuth();
        await call('DELETE', '/api/v1/meals/data', { confirmation: MEAL_DATA_DELETE_CONFIRMATION });
        await prisma.user.delete({ where: { id: PERSONA.id } });
        console.log(`삭제: ${PERSONA.title} (${PERSONA.email})`);
      }
      return;
    }

    // ── 준비: 계정·기록 ──
    await mkdir(OUT_DIR, { recursive: true });
    const accounts = await loadAccounts();
    const password = accounts.password ?? `probe-${randomBytes(6).toString('hex')}`;
    const list = (accounts.accounts ?? []).filter((a) => a.email !== PERSONA.email);
    await writeFile(
      ACCOUNTS_FILE,
      JSON.stringify({ ...accounts, password, accounts: [...list, { email: PERSONA.email, title: PERSONA.title }] }, null, 2),
    );
    const passwordHash = await hashPassword(password);
    await prisma.user.upsert({
      where: { id: PERSONA.id },
      update: { email: PERSONA.email, passwordHash, role: 'USER' },
      create: { id: PERSONA.id, email: PERSONA.email, passwordHash, role: 'USER' },
    });
    await signAuth();
    const DEFAULT_PREF: UpdateMealPreferenceInputType = {
      weights: MEAL_DEFAULT_WEIGHTS,
      allergens: [],
      excludedFoods: [],
      dislikedFoods: [],
      likedFoods: [],
      onboarded: true,
    };
    // 다시 돌려도 같은 출발점 — 식단·추천·한도를 비우고 설정을 기본값으로.
    await call('DELETE', '/api/v1/meals/data', { confirmation: MEAL_DATA_DELETE_CONFIRMATION });
    await call('PUT', '/api/v1/meals/preference', DEFAULT_PREF);

    const today = kstToday();
    const month = Number(today.slice(5, 7));
    console.log(`=== ${PERSONA.title} — 기록 ${MEALS.length}끼 적재 ===`);
    for (const [daysAgo, slot, time, mains, sides = []] of MEALS) {
      const date = shiftDate(today, -daysAgo);
      await call('POST', '/api/v1/meals', {
        eatenAt: kstAt(date, time),
        eatenDate: date,
        slot,
        source: 'manual',
        items: [
          ...mains.map((name) => ({ name, isMain: true, source: 'manual' })),
          ...sides.map((name) => ({ name, isMain: false, source: 'manual' })),
        ],
      });
    }

    const pattern = new MealPatternService(prisma);
    const preferences = new MealPreferenceService(prisma);
    const basePref = await preferences.get(PERSONA.id);
    const seed = `${PERSONA.id}|${today}`;
    const historyCache = new Map<MealSlotType, ReturnType<typeof buildProfile>>();
    {
      const [history, feedback] = await Promise.all([
        pattern.loadHistory(PERSONA.id, today),
        pattern.loadFeedbackSignals(PERSONA.id, today),
      ]);
      const p = buildProfile(history, 'dinner', today, feedback);
      const top = (rec: Record<string, number>): string | null =>
        Object.entries(rec).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      heavyTop.dish = top(p.dishTypeShare);
      heavyTop.ing = top(p.ingredientShare);
    }
    const profileFor = async (slot: MealSlotType): Promise<ReturnType<typeof buildProfile>> => {
      const cached = historyCache.get(slot);
      if (cached) return cached;
      const [history, feedback] = await Promise.all([
        pattern.loadHistory(PERSONA.id, today),
        pattern.loadFeedbackSignals(PERSONA.id, today),
      ]);
      const profile = buildProfile(history, slot, today, feedback);
      historyCache.set(slot, profile);
      return profile;
    };
    interface PoolOpts {
      tempC?: number | null;
      rain?: boolean | null;
      mealType?: MealTypeType | null;
      note?: string | null;
    }
    // 서비스와 같은 순서: 후보 풀 → 점수 → 정렬 → 끼니 필터 → 이번 추천의 중심 필터.
    const poolFor = async (pref: MealPreferenceType, slot: MealSlotType, opts: PoolOpts = {}): Promise<ScoredCandidate[]> => {
      const profile = await profileFor(slot);
      const raw = await pattern.buildCandidates(profile, pref, seed);
      return filterForFocus(
        filterForSlot(
          raw
            .map((c) =>
              scoreCandidate(c, {
                profile,
                preference: pref,
                targetSlot: slot,
                mealType: opts.mealType === undefined ? (pref.mealTypes[0] ?? null) : opts.mealType,
                month,
                tempC: opts.tempC ?? null,
                rain: opts.rain ?? null,
                today,
              }),
            )
            .sort((a, b) => b.score - a.score),
          profile,
          slot,
        ),
        recommendationFocus(pref.weights, opts.note),
      );
    };
    const withPref = (over: Partial<MealPreferenceType>): MealPreferenceType => ({ ...basePref, ...over });
    const oneAxis = (key: (typeof MealWeightKeys)[number]): MealWeightsType =>
      Object.fromEntries(MealWeightKeys.map((k) => [k, k === key ? 5 : 1])) as MealWeightsType;

    const checks: Check[] = [];
    const md: string[] = [];
    const topNames = (pool: ScoredCandidate[], n = 5): string => pool.slice(0, n).map((c) => c.name).join(', ');

    // ── 1. 가중치 ──
    // 각 시나리오의 '주된 축' — 그 지표가 기본값 대비 기대 방향으로 움직여야 한다.
    const AXIS_METRIC: Record<(typeof MealWeightKeys)[number], { metric: MetricKey; dir: 'up' | 'down' } | null> = {
      variety: { metric: 'variety', dir: 'up' },
      taste: { metric: 'history', dir: 'up' },
      balance: { metric: 'heavy', dir: 'down' },
      health: { metric: 'health', dir: 'up' },
      novelty: { metric: 'novel', dir: 'up' },
      weather: null, // 날씨는 아래 고정값 시나리오에서 본다.
      convenience: null, // 간편함은 아래 식사 방식 시나리오에서 본다.
    };
    const PRESET_AXIS: Record<string, (typeof MealWeightKeys)[number]> = {
      balanced: 'balance',
      taste: 'taste',
      health: 'health',
      novelty: 'novelty',
    };
    const weightScenarios: { key: string; label: string; weights: MealWeightsType; axis: (typeof MealWeightKeys)[number] | null }[] = [
      ...Object.entries(MEAL_WEIGHT_PRESETS).map(([key, p]) => ({
        key: `preset:${key}`,
        label: `프리셋 '${p.label}'`,
        weights: p.weights,
        axis: PRESET_AXIS[key] ?? null,
      })),
      ...MealWeightKeys.map((k) => ({ key: `axis:${k}`, label: `${k}만 5(나머지 1)`, weights: oneAxis(k), axis: k })),
    ];

    for (const slot of ['lunch', 'dinner'] as MealSlotType[]) {
      const base = await poolFor(basePref, slot);
      const baseTop = metricsOf(base.slice(0, TOP));
      const presetPools: [string, ScoredCandidate[]][] = [];
      md.push(
        `### 가중치 — ${MEAL_SLOT_LABEL[slot]}`,
        '',
        `후보 ${base.length}개(최대 ${CANDIDATE_POOL_SIZE}) · 지표는 상위 ${TOP}개 기준 · 겹침 = 기본값 상위 ${TOP}·${PROMPT_TOP}와 같은 음식 비율.`,
        '',
        '| 설정 | 겹침@10 | 겹침@25 | 새 음식 | 먹던·좋아함 | 건강 | kcal | 튀김·빵 | 균형 | 많이 먹은 쪽 | 겹침 회피 | 상위 5 |',
        '|---|---|---|---|---|---|---|---|---|---|---|---|',
        `| 기본값 | - | - | ${pct(baseTop.novel)} | ${pct(baseTop.history)} | ${fmt(baseTop.health)} | ${baseTop.kcal === null ? '-' : Math.round(baseTop.kcal)} | ${pct(baseTop.fried)} | ${fmt(baseTop.balance)} | ${fmt(baseTop.heavy)} | ${fmt(baseTop.variety)} | ${topNames(base)} |`,
      );
      for (const s of weightScenarios) {
        const pool = await poolFor(withPref({ weights: s.weights }), slot);
        const m = metricsOf(pool.slice(0, TOP));
        const ov10 = overlap(base, pool, TOP);
        md.push(
          `| ${s.label} | ${pct(ov10)} | ${pct(overlap(base, pool, PROMPT_TOP))} | ${pct(m.novel)} | ${pct(m.history)} | ${fmt(m.health)} | ${m.kcal === null ? '-' : Math.round(m.kcal)} | ${pct(m.fried)} | ${fmt(m.balance)} | ${fmt(m.heavy)} | ${fmt(m.variety)} | ${topNames(pool)} |`,
        );
        const axis = s.axis ? AXIS_METRIC[s.axis] : null;
        if (axis) {
          checks.push({
            group: `가중치·${MEAL_SLOT_LABEL[slot]}`,
            label: `${s.label} → ${METRIC_LABEL[axis.metric]} ${axis.dir === 'up' ? '↑' : '↓'}`,
            ok: judge(baseTop[axis.metric], m[axis.metric], axis.dir),
            detail: `${fmt(baseTop[axis.metric])} → ${fmt(m[axis.metric])}`,
          });
        }
        if (s.key === 'preset:health' || s.key === 'axis:health') {
          checks.push({
            group: `가중치·${MEAL_SLOT_LABEL[slot]}`,
            label: `${s.label} → 평균 kcal ↓`,
            // kcal 은 상대 변화로 보고(EPS 2%), 보조 지표라 반대로 가도 확인으로 둔다 — 건강 요소는 kcal 외에 생선·
            // 단백질·튀김·나트륨을 함께 보고, 후보 kcal 이 한 끼 기준이 된 뒤로 장어구이처럼 건강 점수가 높으면서 kcal 이
            // 조금 높은 음식이 올라온다(2026-10-04: 253 → 273, 건강 0.80 → 0.87).
            ok:
              baseTop.kcal === null || m.kcal === null || baseTop.kcal === 0
                ? 'warn'
                : judge(1, m.kcal / baseTop.kcal, 'down') === false
                  ? 'warn'
                  : judge(1, m.kcal / baseTop.kcal, 'down'),
            detail: `${baseTop.kcal === null ? '-' : Math.round(baseTop.kcal)} → ${m.kcal === null ? '-' : Math.round(m.kcal)}`,
          });
        }
        if (s.key.startsWith('preset:')) {
          presetPools.push([s.label, pool]);
          checks.push({
            group: `가중치·${MEAL_SLOT_LABEL[slot]}`,
            label: `${s.label} → 기본값과 상위 ${TOP}가 달라짐`,
            ok: ov10 < 0.9 ? true : 'warn',
            detail: `겹침 ${pct(ov10)}`,
          });
        }
      }
      // 프리셋끼리도 서로 달라야 고르는 의미가 있다.
      md.push('', `프리셋끼리 상위 ${TOP} 겹침:`, '');
      for (let i = 0; i < presetPools.length; i += 1) {
        for (let j = i + 1; j < presetPools.length; j += 1) {
          const [la, pa] = presetPools[i]!;
          const [lb, pb] = presetPools[j]!;
          const ov = overlap(pa, pb, TOP);
          md.push(`- ${la} ↔ ${lb}: ${pct(ov)}`);
          checks.push({
            group: `가중치·${MEAL_SLOT_LABEL[slot]}`,
            label: `${la} ↔ ${lb} 상위 ${TOP}가 서로 다름`,
            ok: ov < 0.9 ? true : 'warn',
            detail: `겹침 ${pct(ov)}`,
          });
        }
      }
      md.push('');
    }

    // ── 2. 날씨 ──
    {
      const slot: MealSlotType = 'dinner';
      const weatherWeights = oneAxis('weather');
      const pref = withPref({ weights: weatherWeights });
      const noCoord = await poolFor(pref, slot);
      const wStd = std(noCoord.map((c) => c.features['weather'] ?? 0));
      checks.push({
        group: '날씨',
        label: `위치 없이 ${month}월 — 날씨 요소가 후보마다 다름(가중치가 효과 있음)`,
        ok: wStd > 0.01 ? true : 'warn',
        detail: wStd > 0.01 ? `표준편차 ${fmt(wStd)}` : '모든 후보 같은 값 — 6~8월·12~2월이 아니면 위치 없이는 날씨 가중치가 효과 없음',
      });
      const cases: { label: string; opts: PoolOpts; metric: MetricKey }[] = [
        { label: '추운 날(4°C)', opts: { tempC: 4, rain: false }, metric: 'warm' },
        { label: '더운 날(30°C)', opts: { tempC: 30, rain: false }, metric: 'cool' },
        { label: '비 오는 날(18°C)', opts: { tempC: 18, rain: true }, metric: 'warm' },
        { label: '선선한 날(18°C)', opts: { tempC: 18, rain: false }, metric: 'warm' },
      ];
      const baseM = metricsOf(noCoord.slice(0, TOP));
      const defaultNoCoord = await poolFor(basePref, slot);
      md.push(
        `### 날씨 — ${MEAL_SLOT_LABEL[slot]}`,
        '',
        `날씨만 5(나머지 1) 기준 · 위치 없음(${month}월) 대비. 기본 가중치(날씨 1) 열은 같은 날씨에서 기본값 상위 ${TOP}가 얼마나 바뀌는지.`,
        '',
        '| 날씨 | 국물·찜 | 면·샐러드 | 상위 5 | 기본 가중치 겹침@10 |',
        '|---|---|---|---|---|',
        `| 위치 없음 | ${pct(baseM.warm)} | ${pct(baseM.cool)} | ${topNames(noCoord)} | - |`,
      );
      for (const c of cases) {
        const pool = await poolFor(pref, slot, c.opts);
        const m = metricsOf(pool.slice(0, TOP));
        const defaultPool = await poolFor(basePref, slot, c.opts);
        md.push(
          `| ${c.label} | ${pct(m.warm)} | ${pct(m.cool)} | ${topNames(pool)} | ${pct(overlap(defaultNoCoord, defaultPool, TOP))} |`,
        );
        const expectChange = c.label !== '선선한 날(18°C)';
        checks.push({
          group: '날씨',
          label: `${c.label} → ${METRIC_LABEL[c.metric]} ${expectChange ? '↑' : '그대로(규칙상 중립)'}`,
          ok: expectChange ? judge(baseM[c.metric], m[c.metric], 'up') : Math.abs(m[c.metric] - baseM[c.metric]) <= EPS ? true : 'warn',
          detail: `${pct(baseM[c.metric])} → ${pct(m[c.metric])}`,
        });
      }
      md.push('');
    }

    // ── 3. 식사 방식·간편함 ──
    {
      const slot: MealSlotType = 'lunch';
      const convPref = withPref({ weights: oneAxis('convenience') });
      md.push(
        `### 식사 방식·간편함 — ${MEAL_SLOT_LABEL[slot]}`,
        '',
        '간편함만 5(나머지 1). 집밥은 재료 수, 외식·배달은 인기도로 간편함을 매긴다.',
        '',
        '| 식사 방식 | 간편함 평균 | 간편함 표준편차 | 상위 5 |',
        '|---|---|---|---|',
      );
      const byType = new Map<string, ScoredCandidate[]>();
      for (const mt of [null, 'home', 'dining_out', 'delivery'] as (MealTypeType | null)[]) {
        const pool = await poolFor(convPref, slot, { mealType: mt });
        byType.set(String(mt), pool);
        const conv = pool.map((c) => c.features['convenience'] ?? 0);
        md.push(`| ${mt ?? '상황 무관'} | ${fmt(mean(conv))} | ${fmt(std(conv))} | ${topNames(pool)} |`);
        if (mt) {
          checks.push({
            group: '식사 방식',
            label: `${mt} — 간편함 요소가 후보마다 다름`,
            ok: std(conv) > 0.01 ? true : 'warn',
            detail:
              std(conv) > 0.01
                ? `표준편차 ${fmt(std(conv))}`
                : `모든 후보 ${fmt(conv[0] ?? null)} — ${mt === 'home' ? '재료 수 정보' : '인기도'}가 없어 간편함 가중치가 효과 없음`,
          });
        }
      }
      // 저장된 '주로 하는 식사 방식'(mealTypes[0])이 기본 가중치 추천을 바꾸는가.
      const homePool = await poolFor(withPref({ mealTypes: ['home'] }), slot);
      const outPool = await poolFor(withPref({ mealTypes: ['dining_out'] }), slot);
      const ov = overlap(homePool, outPool, TOP);
      // 간편함이 모든 후보에 같은 값이면 순위가 조금 바뀌어도 설정 효과가 아니다 — 같은 상수가 음식마다 다른
      // 배수(방금 먹음 등)와 곱해진 부산물이다(2026-10-04: 겹침 90% 로 '통과'처럼 보였다).
      const convVaries = [homePool, outPool].some(
        (pool) => std(pool.map((c) => c.features['convenience'] ?? 0)) > 0.01,
      );
      checks.push({
        group: '식사 방식',
        label: `설정 '주로 하는 식사' 집밥 ↔ 외식 — 기본 가중치 상위 ${TOP}가 달라짐`,
        ok: convVaries && ov < 0.9 ? true : 'warn',
        detail: `겹침 ${pct(ov)}${convVaries ? '' : ' — 간편함이 모든 후보에 같은 값이라 식사 방식 설정이 추천을 바꾸지 않음'}`,
      });
      md.push('', `설정 '주로 하는 식사' 집밥 vs 외식(기본 가중치) 상위 ${TOP} 겹침 ${pct(ov)}.`, '');
    }

    // ── 4. 목록 설정(제외·알레르기·덜 선호·좋아함) ──
    {
      const slot: MealSlotType = 'dinner';
      const base = await poolFor(basePref, slot);
      md.push(`### 목록 설정 — ${MEAL_SLOT_LABEL[slot]}(기본 가중치)`, '', '| 설정 | 결과 | 상위 5 |', '|---|---|---|');
      const row = (label: string, result: string, pool: ScoredCandidate[]): void => {
        md.push(`| ${label} | ${result} | ${topNames(pool)} |`);
      };

      // 제외 — 이름(정규화)에 단어가 든 후보가 하나도 없어야 한다.
      const excluded = ['오이', '돼지', '김치'];
      const exPool = await poolFor(withPref({ excludedFoods: excluded }), slot);
      const exHitBase = base.filter((c) => excluded.some((t) => c.nameNorm.includes(normalizeTerm(t))));
      const exHit = exPool.filter((c) => excluded.some((t) => c.nameNorm.includes(normalizeTerm(t))));
      checks.push({
        group: '목록 설정',
        label: `제외 ${excluded.join('·')} → 후보에 없음`,
        ok: exHit.length === 0 ? (exHitBase.length > 0 ? true : 'warn') : false,
        detail:
          exHit.length > 0
            ? `남음: ${exHit.map((c) => c.name).join(', ')}`
            : `설정 전 후보 ${exHitBase.length}개(${exHitBase.map((c) => c.name).slice(0, 5).join(', ')}) → 0개${exHitBase.length === 0 ? ' (설정 전에도 없어 검사 의미 약함)' : ''}`,
      });
      row(`제외 ${excluded.join('·')}`, `설정 전 ${exHitBase.length}개 → 후 ${exHit.length}개`, exPool);

      // 알레르기 — 서버 판정(경고)과 이름 단어표 두 기준.
      const allergens: MealAllergenType[] = ['shrimp', 'crab'];
      const alPool = await poolFor(withPref({ allergens }), slot);
      const byWarning = alPool.filter((c) => (c.allergenWarnings ?? []).some((a) => allergens.includes(a)));
      const byNameBase = base.filter((c) => nameHitsAllergen(c.name, allergens).length > 0);
      const byName = alPool.filter((c) => nameHitsAllergen(c.name, allergens).length > 0);
      const alLabel = allergens.map((a) => MEAL_ALLERGEN_LABEL[a]).join('·');
      checks.push({
        group: '목록 설정',
        label: `알레르기 ${alLabel} → 서버 경고 기준 위반 없음`,
        ok: byWarning.length === 0,
        detail: byWarning.map((c) => c.name).join(', ') || '없음',
      });
      checks.push({
        group: '목록 설정',
        label: `알레르기 ${alLabel} → 이름에 새우·게가 든 후보 없음`,
        ok: byName.length === 0 ? (byNameBase.length > 0 ? true : 'warn') : false,
        detail:
          byName.length > 0
            ? `남음: ${byName.map((c) => `${c.name}(${rankOf(alPool, c.name) + 1}위)`).join(', ')}`
            : `설정 전 ${byNameBase.length}개 → 0개${byNameBase.length === 0 ? ' (설정 전에도 없어 검사 의미 약함)' : ''}`,
      });
      row(`알레르기 ${alLabel}`, `이름 기준 설정 전 ${byNameBase.length}개 → 후 ${byName.length}개 · 서버 경고 ${byWarning.length}개`, alPool);

      // 덜 선호 — 기본값 1위 음식을 덜 선호로 두면 순위가 내려가야 한다.
      const top1 = base[0];
      if (top1) {
        const dsPool = await poolFor(withPref({ dislikedFoods: [top1.name] }), slot);
        const before = rankOf(base, top1.name);
        const after = rankOf(dsPool, top1.name);
        checks.push({
          group: '목록 설정',
          label: `덜 선호 '${top1.name}'(기본값 1위) → 순위 하락`,
          ok: after < 0 || after > before ? (after < 0 || after >= TOP ? true : 'warn') : false,
          detail: `${rankText(base, top1.name)} → ${rankText(dsPool, top1.name)}${after >= 0 && after < TOP ? ` (아직 상위 ${TOP})` : ''}`,
        });
        row(`덜 선호 ${top1.name}`, `${rankText(base, top1.name)} → ${rankText(dsPool, top1.name)}`, dsPool);
      }

      // 좋아함 — 기록에 없고 기본 후보에도 없는 음식을 좋아함으로 두면 후보에 들어가 순위가 올라야 한다.
      const likedName = (['갈비탕', '육개장', '설렁탕', '비빔국수'] as const).find(
        (n) => rankOf(base, n) < 0 && !MEALS.some((m) => [...m[3], ...(m[4] ?? [])].includes(n)),
      );
      if (likedName) {
        const lkPool = await poolFor(withPref({ likedFoods: [likedName] }), slot);
        const r = rankOf(lkPool, likedName);
        checks.push({
          group: '목록 설정',
          label: `좋아함 '${likedName}'(기본 후보 아님) → 후보에 들어가 상위 ${PROMPT_TOP} 안`,
          ok: r >= 0 && r < PROMPT_TOP ? true : r >= 0 ? 'warn' : false,
          detail: `${rankText(base, likedName)} → ${rankText(lkPool, likedName)}`,
        });
        row(`좋아함 ${likedName}`, `${rankText(base, likedName)} → ${rankText(lkPool, likedName)}`, lkPool);

        // 좋아함 + 덜 선호(같은 음식) — 덜 선호가 이겨 좋아함만일 때보다 낮아야 한다.
        const bothPool = await poolFor(withPref({ likedFoods: [likedName], dislikedFoods: [likedName] }), slot);
        const rb = rankOf(bothPool, likedName);
        checks.push({
          group: '목록 설정',
          label: `좋아함+덜 선호 '${likedName}' → 좋아함만일 때보다 낮음`,
          ok: rb < 0 || rb > r ? true : false,
          detail: `${rankText(lkPool, likedName)} → ${rankText(bothPool, likedName)}`,
        });
        row(`좋아함+덜 선호 ${likedName}`, `${rankText(lkPool, likedName)} → ${rankText(bothPool, likedName)}`, bothPool);
      }

      // 좋아함 + 알레르기 — 좋아해도 알레르기 음식은 빠져야 한다.
      const likedAllergen = '깐풍새우';
      const laPool = await poolFor(withPref({ likedFoods: [likedAllergen], allergens: ['shrimp'] }), slot);
      checks.push({
        group: '목록 설정',
        label: `좋아함 '${likedAllergen}' + 알레르기 새우 → 후보에 없음`,
        ok: rankOf(laPool, likedAllergen) < 0,
        detail: rankText(laPool, likedAllergen),
      });
      row(`좋아함 ${likedAllergen} + 알레르기 새우`, rankText(laPool, likedAllergen), laPool);

      // 좋아함 + 제외 — 좋아해도 제외 음식은 빠져야 한다.
      const likedExcluded = '돼지갈비';
      const lePool = await poolFor(withPref({ likedFoods: [likedExcluded], excludedFoods: ['돼지'] }), slot);
      checks.push({
        group: '목록 설정',
        label: `좋아함 '${likedExcluded}' + 제외 돼지 → 후보에 없음`,
        ok: rankOf(lePool, likedExcluded) < 0,
        detail: rankText(lePool, likedExcluded),
      });
      row(`좋아함 ${likedExcluded} + 제외 돼지`, rankText(lePool, likedExcluded), lePool);
      md.push('');
    }

    // ── 5. 카탈로그 알레르기 정보 범위 ──
    {
      const rows = await prisma.foodItem.findMany({
        where: { active: true, source: { not: 'mfds-raw' } },
        select: {
          name: true,
          ingredientsJson: true,
          allergensJson: true,
          allergenEvidenceJson: true,
          allergenStatus: true,
        },
      });
      const judged = rows.map((r) => ({
        name: r.name,
        ...allergenData(r.name, r.ingredientsJson, r.allergensJson, r.allergenEvidenceJson, r.allergenStatus),
      }));
      const known = judged.filter((r) => r.allergenMetadataKnown).length;
      md.push(
        '### 카탈로그 알레르기 정보 범위',
        '',
        `추천 대상 카탈로그 ${rows.length}행 중 알레르기 판정 근거(재료·표시·검수)가 있는 행 ${known}개. 서버는 근거와 음식명(가능성)으로 사용자 알레르기를 거른다.`,
        '',
        '| 알레르기 | 이름에 단어가 든 행 | 그중 서버가 거르는 행 | 예 |',
        '|---|---|---|---|',
      );
      for (const a of Object.keys(ALLERGEN_NAME_WORDS) as MealAllergenType[]) {
        const hit = judged.filter((r) => nameHitsAllergen(r.name, [a]).length > 0);
        const blocked = hit.filter((r) => hitsUserAllergen(r, [a]));
        md.push(`| ${MEAL_ALLERGEN_LABEL[a]} | ${hit.length} | ${blocked.length} | ${hit.slice(0, 4).map((r) => r.name).join(', ')} |`);
        if (a === 'shrimp' || a === 'crab') {
          checks.push({
            group: '카탈로그',
            label: `${MEAL_ALLERGEN_LABEL[a]} 이름 음식을 서버 알레르기 필터가 거름`,
            ok: hit.length === 0 ? 'warn' : blocked.length === hit.length ? true : false,
            detail: `${blocked.length}/${hit.length}행`,
          });
        }
      }
      md.push('');
    }

    // ── 6. LLM 층(실제 라우트) ──
    const llm: string[] = [];
    if (!SCORE_ONLY) {
      console.log('\n=== LLM 층 ===');
      // 추천 라우트는 IP 당 분당 10회 제한이 있어(앱과 같은 경로) 걸리면 1분 쉬고 다시 부른다.
      const recommend = async (slot: MealSlotType, note: string | null = null): Promise<MealRecommendationType> => {
        for (let attempt = 0; ; attempt += 1) {
          const res = await app.inject({
            method: 'POST',
            url: '/api/v1/meals/recommendations',
            headers: auth,
            payload: { targetDate: today, targetSlot: slot, note, force: true },
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
      // 추천 결과의 음식을 같은 설정의 점수 후보에 맞춰 지표를 낸다.
      const picksOf = (rec: MealRecommendationType, pool: ScoredCandidate[]): ScoredCandidate[] =>
        rec.items.flatMap((i) => pool.filter((c) => c.nameNorm === normalizeTerm(i.name)).slice(0, 1));
      const models = new Set<string>();
      let fallback = 0;
      interface Run {
        label: string;
        slot: MealSlotType;
        pref: UpdateMealPreferenceInputType;
        note?: string;
      }
      const runs: Run[] = [
        { label: '기본값', slot: 'lunch', pref: DEFAULT_PREF },
        { label: '기본값', slot: 'dinner', pref: DEFAULT_PREF },
        ...Object.entries(MEAL_WEIGHT_PRESETS).flatMap(([, p]) =>
          (['lunch', 'dinner'] as MealSlotType[]).map((slot) => ({
            label: `프리셋 '${p.label}'`,
            slot,
            pref: { ...DEFAULT_PREF, weights: p.weights },
          })),
        ),
        { label: "메모 '가볍게'", slot: 'dinner', pref: DEFAULT_PREF, note: '가볍게' },
        { label: "메모 '국물 있는 걸로'", slot: 'dinner', pref: DEFAULT_PREF, note: '국물 있는 걸로' },
        {
          label: "알레르기 새우·게 + 좋아함 '깐풍새우'",
          slot: 'dinner',
          pref: { ...DEFAULT_PREF, allergens: ['shrimp', 'crab'], likedFoods: ['깐풍새우'] },
        },
      ];
      const baseBySlot = new Map<MealSlotType, Metrics>();
      for (const r of runs) {
        await call('PUT', '/api/v1/meals/preference', r.pref);
        const pref = await preferences.get(PERSONA.id);
        const pool = await poolFor(pref, r.slot, { note: r.note ?? null });
        const rec = await recommend(r.slot, r.note ?? null);
        if (rec.model) models.add(rec.model);
        else fallback += 1;
        const picks = picksOf(rec, pool);
        const m = metricsOf(picks);
        const group = `LLM·${r.label}·${MEAL_SLOT_LABEL[r.slot]}`;
        console.log(`  ${r.label} ${MEAL_SLOT_LABEL[r.slot]}: [${rec.status}] ${rec.items.map((i) => i.name).join(' / ')}`);

        const poolNorms = new Set(pool.map((c) => c.nameNorm));
        const outOfPool = rec.items.filter((i) => !poolNorms.has(normalizeTerm(i.name)));
        checks.push({ group, label: '후보 밖 이름 없음', ok: outOfPool.length === 0, detail: outOfPool.map((i) => i.name).join(', ') || '없음' });
        if (pref.allergens.length > 0 || pref.excludedFoods.length > 0) {
          const bad = rec.items.filter(
            (i) =>
              i.allergenWarnings.some((a) => pref.allergens.includes(a)) ||
              nameHitsAllergen(i.name, pref.allergens).length > 0 ||
              pref.excludedFoods.some((t) => normalizeTerm(i.name).includes(normalizeTerm(t))),
          );
          checks.push({ group, label: '알레르기(경고·이름)·제외 위반 없음', ok: bad.length === 0, detail: bad.map((i) => i.name).join(', ') || '없음' });
        }
        if (r.label === '기본값') baseBySlot.set(r.slot, m);
        const baseM = baseBySlot.get(r.slot);
        const presetKey = Object.entries(MEAL_WEIGHT_PRESETS).find(([, p]) => r.label === `프리셋 '${p.label}'`)?.[0];
        if (presetKey && baseM) {
          const axis = AXIS_METRIC[PRESET_AXIS[presetKey]!]!;
          const ok = judge(baseM[axis.metric], m[axis.metric], axis.dir);
          checks.push({
            group,
            label: `${METRIC_LABEL[axis.metric]} ${axis.dir === 'up' ? '↑' : '↓'}(기본값 추천 대비)`,
            ok: ok === false ? 'warn' : ok,
            detail: `${fmt(baseM[axis.metric])} → ${fmt(m[axis.metric])}`,
          });
        }
        if (r.note === '가볍게' && baseM) {
          // 메모 '가볍게'는 건강 중심 후보 필터를 거치므로 튀김·빵은 후보에 없어야 한다(좋아함 제외) — 어기면 실패.
          const heavy = picks.filter((c) => c.dishType && FRIED.has(c.dishType) && !c.liked);
          checks.push({
            group,
            label: '튀김·빵 없음',
            ok: heavy.length === 0,
            detail: heavy.map((c) => c.name).join(', ') || '없음',
          });
          // 3~4개 고른 결과의 평균이라 편차가 크다 — 확인 수준.
          checks.push({
            group,
            label: '평균 kcal 기본값 추천 이하',
            ok: m.kcal === null || baseM.kcal === null || m.kcal <= baseM.kcal ? true : 'warn',
            detail: `${baseM.kcal === null ? '-' : Math.round(baseM.kcal)} → ${m.kcal === null ? '-' : Math.round(m.kcal)}`,
          });
        }
        if (r.note === '국물 있는 걸로') {
          const soup = picks.filter((c) => c.dishType === 'soup' || c.dishType === 'stew');
          checks.push({
            group,
            label: '국·찌개가 절반 이상',
            ok: soup.length * 2 >= rec.items.length ? true : 'warn',
            detail: `${soup.length}/${rec.items.length}${soup.length ? ` (${soup.map((c) => c.name).join(', ')})` : ''}`,
          });
        }
        llm.push(
          `- **${r.label} · ${MEAL_SLOT_LABEL[r.slot]}** [${rec.status}${rec.model ? ` · ${rec.model}` : ''}] ${rec.items.map((i) => i.name).join(' / ')}${rec.summary ? ` — “${rec.summary}”` : ''}`,
          ...rec.items.map((i) => `  - ${i.name} (${dishLabel(i.dishType)}): ${i.reason}`),
        );
      }
      llm.unshift(
        `LLM 모델: ${[...models].join(', ') || '없음'}${fallback ? ` · 점수 폴백 ${fallback}회` : ''}`,
        '',
      );
      // 다음에 웹에서 볼 때 기본 상태로.
      await call('PUT', '/api/v1/meals/preference', DEFAULT_PREF);
    }

    // ── 리포트 ──
    const summary = [
      '## 자동 점검 요약',
      '',
      `통과 ${checks.filter((c) => c.ok === true).length} · 확인 필요 ${checks.filter((c) => c.ok === 'warn').length} · 실패 ${checks.filter((c) => c.ok === false).length}`,
      '',
      '| | 묶음 | 점검 | 결과 |',
      '|---|---|---|---|',
      ...checks.map((c) => `| ${icon(c.ok)} | ${c.group} | ${c.label} | ${c.detail} |`),
      '',
    ];
    const report = [
      `# 식단 추천 설정 점검 — ${today}`,
      '',
      `웹(개발 서버)에서 \`${PERSONA.email}\`(비밀번호는 \`data/meal-probe/accounts.json\`)로 로그인하면 같은 기록으로 설정을 바꿔 가며 추천을 볼 수 있다. 끝난 뒤 설정은 기본값으로 되돌렸다.`,
      '',
      `기록 ${MEALS.length}끼(${shiftDate(today, -14)} ~ ${shiftDate(today, -1)}). 알레르기 '이름 기준'은 이 스크립트의 단어표(새우·대하·꽃게·게살 등)로 본 점검 기준이다. '많이 먹은 쪽'은 최근 1위 조리형태(${heavyTop.dish ?? '-'})·주재료(${heavyTop.ing ?? '-'})와 겹치는 정도(0~1).`,
      '',
      ...summary,
      '## 점수 층',
      '',
      ...md,
      ...(SCORE_ONLY ? [] : ['## LLM 층', '', ...llm, '']),
    ].join('\n');
    const file = join(OUT_DIR, `settings-report-${today}.md`);
    await writeFile(file, report);
    console.log(`\n${summary[2]}`);
    for (const c of checks.filter((x) => x.ok !== true)) console.log(`  ${icon(c.ok)} ${c.group} · ${c.label}: ${c.detail}`);
    console.log(`\n리포트: ${file}`);
  } finally {
    await app.close();
  }
};

main().catch((e: unknown) => {
  console.error(e);
  process.exitCode = 1;
});
