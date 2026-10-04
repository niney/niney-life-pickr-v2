// 식단 추천 모델 비교 — 같은 후보·같은 프롬프트를 모델별로 보내 추천 품질을 견준다.
// 서비스와 같은 후보 경로(후보 풀 → 점수 → 끼니 필터 → 이번 추천의 중심 필터)와 프롬프트를 쓰고, LLM 만 모델을 바꿔
// 직접 부른다(라우트의 분당 제한·일일 한도를 거치지 않는다). 사고(think)는 서비스와 같은 thinkOptionForModel.
//
// 실행: pnpm --filter friendly probe:meal-models [--models=gpt-oss:120b,kimi-k3] [--repeat 2] [--from-raw <json>]
//   가상 사용자(probe:meal-recommend 의 A·B·C, probe:meal-settings 의 E)의 dev.db 기록을 쓴다 — 없으면 그 사용자는 건너뛴다.
//   리포트 data/meal-probe/models-report-날짜.md, 원 응답 models-raw-날짜.json (git 제외). 기록·설정은 바꾸지 않는다.
//   --from-raw : 저장한 원 응답으로 지표만 다시 낸다(LLM 을 부르지 않음 — 판정 규칙을 고친 뒤).
//
// 자동 지표(모델별)
//   성공률 · 후보 밖 이름(지어낸 음식) · 지연 p50/p90 · 60초 초과(서비스 제한) · 출력 잘림 · 고른 수
//   최근 2일 먹은 음식 · '가능하면 피함' 고름 · 한 세트 안 조리형태·주재료 겹침 · 고른 후보의 평균 점수 순위
//   **이유의 사실 확인** — 기록과 대조할 수 있는 주장만 골라 맞는지 본다(휴리스틱, 틀린 것은 리포트에 문장째 남긴다).
//     ① "최근 N일/2주 동안 [조리형태]를 전혀·거의 안 드셨다" → 그 기간 주식의 실제 그 조리형태 수(전혀=0, 거의=20% 이하)
//     ② "어제 X", "X(N일 전)" → 그날 실제로 X 를 먹었는지   ③ "N%" → 프로필 분포(조리형태·주재료·계통)와 ±1
//     ④ 먹은 적 있는 음식에 "처음·먹은 적 없는·새로운 음식"
//   한글 외 문자(한자·가나) 섞임 · 설정 반영(E: 건강·골고루·메모 국물·메모 가볍게) · 반복 일관성

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MEAL_WEIGHT_PRESETS, type MealPreferenceType, type MealSlotType } from '@repo/api-contract';
import { FOOD_DISH_TYPE_LABEL, MEAL_SLOT_LABEL, thinkOptionForModel } from '@repo/utils';
import { buildApp } from '../src/app.js';
import { normalizeTerm } from '../src/lib/text.js';
import { adapterCache } from '../src/modules/ai/adapter-cache.js';
import { AiConfigService } from '../src/modules/ai/ai.config.service.js';
import { buildLlmProviderEnv } from '../src/modules/ai/llm-provider-env.js';
import { MealPreferenceService } from '../src/modules/meal/meal-preference.service.js';
import {
  MealPatternService,
  buildProfile,
  describeProfile,
  filterForFocus,
  filterForSlot,
  recentDishTypeCounts,
  recommendationFocus,
  scoreCandidate,
  type HistoryItem,
  type ScoredCandidate,
} from '../src/modules/meal-recommendation/meal-pattern.service.js';
import {
  MEAL_RECOMMENDATION_JSON_SCHEMA,
  MEAL_RECOMMENDATION_SYSTEM_PROMPT,
  buildMealRecommendationUserPrompt,
} from '../src/modules/meal-recommendation/meal-recommendation.prompts.js';
import {
  mapLlmItems,
  parseRecommendationOutput,
} from '../src/modules/meal-recommendation/meal-recommendation.service.js';

const args = process.argv.slice(2);
const argValue = (name: string): string | null => {
  const eq = args.find((a) => a.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const i = args.indexOf(name);
  return i >= 0 ? (args[i + 1] ?? null) : null;
};
const MODELS = (argValue('--models') ?? 'gpt-oss:120b,kimi-k3')
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);
const REPEAT = Math.max(1, Math.min(5, Number(argValue('--repeat')) || 2));
const FROM_RAW = argValue('--from-raw');
// 서비스와 같은 호출 설정(meal-recommendation.service LLM_*). 시간 제한만 넉넉히 두고 60초 초과를 따로 센다.
const LLM = { temperature: 0.4, maxTokens: 1200, numCtx: 8192, serviceTimeoutMs: 60_000, probeTimeoutMs: 120_000 };
const PROMPT_CANDIDATES = 25;
const RECENT_DAYS = 2;
const OUT_DIR = join(process.cwd(), 'data', 'meal-probe');

interface Scenario {
  key: string;
  userId: string;
  userLabel: string;
  slot: MealSlotType;
  label: string;
  pref?: (stored: MealPreferenceType) => MealPreferenceType;
  note?: string;
  check?: 'health' | 'balance' | 'soup' | 'light';
}
const USERS = [
  { id: 'probe-meal-a', label: 'A 돼지고기·찌개 편중' },
  { id: 'probe-meal-b', label: 'B 아침 거르고 야식' },
  { id: 'probe-meal-c', label: 'C 새우·게 알레르기·오이 제외' },
  { id: 'probe-meal-e', label: 'E 다양' },
];
const SLOTS: MealSlotType[] = ['breakfast', 'lunch', 'dinner'];
const SCENARIOS: Scenario[] = [
  ...USERS.flatMap((u) =>
    SLOTS.map((slot) => ({ key: `${u.id}|${slot}|기본`, userId: u.id, userLabel: u.label, slot, label: '저장된 설정' })),
  ),
  ...(['lunch', 'dinner'] as MealSlotType[]).flatMap((slot) => [
    {
      key: `probe-meal-e|${slot}|건강`,
      userId: 'probe-meal-e',
      userLabel: 'E 다양',
      slot,
      label: "프리셋 '가볍게·건강'",
      pref: (p: MealPreferenceType) => ({ ...p, weights: MEAL_WEIGHT_PRESETS['health']!.weights }),
      check: 'health' as const,
    },
    {
      key: `probe-meal-e|${slot}|골고루`,
      userId: 'probe-meal-e',
      userLabel: 'E 다양',
      slot,
      label: "프리셋 '골고루'",
      pref: (p: MealPreferenceType) => ({ ...p, weights: MEAL_WEIGHT_PRESETS['balanced']!.weights }),
      check: 'balance' as const,
    },
  ]),
  {
    key: 'probe-meal-e|dinner|국물',
    userId: 'probe-meal-e',
    userLabel: 'E 다양',
    slot: 'dinner',
    label: "메모 '국물 있는 걸로'",
    note: '국물 있는 걸로',
    check: 'soup',
  },
  {
    key: 'probe-meal-e|dinner|가볍게',
    userId: 'probe-meal-e',
    userLabel: 'E 다양',
    slot: 'dinner',
    label: "메모 '가볍게'",
    note: '가볍게',
    check: 'light',
  },
];

const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const pctl = (xs: number[], q: number): number | null => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))]! : null;
};
const fmt = (x: number | null, d = 2): string => (x === null || Number.isNaN(x) ? '-' : x.toFixed(d));
const pct = (x: number | null): string => (x === null ? '-' : `${Math.round(x * 100)}%`);
const FRIED = new Set(['fried', 'bakery']);
const SOUP = new Set(['soup', 'stew']);
const FOREIGN_SCRIPT = /[぀-ヿ一-鿿]/;
const daysAgo = (today: string, date: string): number =>
  Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000);

// ── 이유의 사실 확인 ──
// 조리형태를 가리키는 말 → dishType, 그리고 이름만 봐도 그 조리형태인 음식(사람이 봐도 그 요리). 카탈로그 분류로만
// 그런 음식(떡볶이=볶음, 순대·족발=찜)만 먹었으면 "볶음·찜 요리를 안 드셨다"를 틀렸다고 하지 않고 보류한다.
const DISH_TOKENS: ReadonlyArray<{ re: RegExp; types: readonly string[]; label: string; obvious: RegExp }> = [
  { re: /국물/g, types: ['soup', 'stew'], label: '국물', obvious: /국|탕|찌개|전골/ },
  { re: /국·탕|국\/탕|국탕|탕류/g, types: ['soup'], label: '국·탕', obvious: /국|탕/ },
  { re: /찌개/g, types: ['stew'], label: '찌개·전골', obvious: /찌개|전골/ },
  { re: /볶음/g, types: ['stir_fry'], label: '볶음', obvious: /볶음/ },
  { re: /전·부침|부침|전류/g, types: ['pancake'], label: '전·부침', obvious: /전$|부침|파전|빈대떡/ },
  { re: /찜/g, types: ['steam'], label: '찜', obvious: /찜/ },
  { re: /조림/g, types: ['braise'], label: '조림', obvious: /조림/ },
  { re: /구이/g, types: ['grill'], label: '구이', obvious: /구이/ },
  { re: /튀김/g, types: ['fried'], label: '튀김', obvious: /튀김|까스|가스|커틀릿|치킨/ },
  // '김밥류·초밥류·덮밥류'처럼 앞에 글자가 붙은 'X밥류'는 밥 전체가 아니라 그 요리만 가리킨다.
  { re: /밥·죽|(?<![가-힣])밥류|죽류/g, types: ['rice'], label: '밥·죽', obvious: /밥|죽/ },
  { re: /면·만두|면 ?요리|면류|국수류/g, types: ['noodle'], label: '면·만두', obvious: /면|국수|우동|만두|라면|짜장/ },
  { re: /샐러드|무침|생채/g, types: ['salad'], label: '무침·샐러드', obvious: /샐러드|무침|생채/ },
];
// 조리형태 바로 앞(사이에 공백만)의 주재료 말 — '해산물 볶음을 안 드셨다'는 볶음 전체가 아니라 해산물 볶음 주장이다
// (제육볶음만 먹었으면 맞는 말). '해산물·볶음'처럼 가운뎃점·조사로 이으면 따로따로 본다.
const INGREDIENT_QUALIFIER: ReadonlyArray<{ re: RegExp; ingredients: readonly string[] }> = [
  { re: /(해산물|해물)\s*$/, ingredients: ['seafood', 'fish'] },
  { re: /생선\s*$/, ingredients: ['fish'] },
  { re: /(돼지고기|돼지)\s*$/, ingredients: ['pork'] },
  { re: /(소고기|쇠고기)\s*$/, ingredients: ['beef'] },
  { re: /(닭고기|닭)\s*$/, ingredients: ['chicken'] },
  { re: /(채소|야채)\s*$/, ingredients: ['vegetable'] },
  { re: /(두부|콩)\s*$/, ingredients: ['tofu_bean'] },
  { re: /(달걀|계란)\s*$/, ingredients: ['egg'] },
  // '고기 구이' — 고등어구이만 먹었으면 맞는 말. 돼지고기·소고기·닭고기보다 뒤에 둔다(먼저 맞는 것을 쓴다).
  { re: /(고기)\s*$/, ingredients: ['beef', 'pork', 'chicken', 'other_meat'] },
];
// '거의·자주 ~않·적었다'는 비율 주장, '전혀 ~않·기록이 없다·안 드셨다'는 0 주장.
const ALMOST = /거의|드물|적었|적어|적고|적은|부족|낮았|낮고|낮은|(자주|많이)\s*(안|드시지|먹지)/;
const ABSENT =
  /전혀\s*(안|드시지|먹지|없)|기록이 없|기록 없|없었|없어|없고|없으|안 드셨|안 드시|드시지 않(았|아|고)|먹지 않(았|아|고)|안 먹었/;
// 섭취 부재 주장이 아닌 것 — 이 음식을 꾸미는 말('먹지 않은 찜 요리'), 이 음식을 안 먹어 봤다는 말('드신 적이 없어' →
// ④ 에서 본다), 'X 이후로는·X 외에는'처럼 기간 일부·예외를 둔 말, '부담 없는'·'전혀 다른'.
const NOT_ABSENCE = /(먹지|드시지)\s*않은|안 먹은|드신 적|먹은 적|이후|외에|말고는|빼고|부담\s*없|전혀\s*다르|전혀\s*다른/;
const SAYS_NEW = /처음|먹은 적(이)? 없|드신 적(이)? 없|안 드셔 본|안 먹어 본|새로운 음식|새로운 메뉴/;

interface Fact {
  ok: boolean;
  text: string;
  why: string;
}
interface FactResult {
  facts: Fact[];
  /** 카탈로그 분류로만 걸리는 등 판정을 보류한 주장 수. */
  undecided: number;
}
const clauses = (reason: string): string[] =>
  reason
    .split(/[,.!?]\s*|(?<=지만)\s+|(?<=으며)\s+|(?<=이며)\s+|(?<=으니)\s+/)
    .map((c) => c.trim())
    .filter(Boolean);

const checkFacts = (
  reason: string,
  item: ScoredCandidate | undefined,
  history: HistoryItem[],
  shares: number[],
  today: string,
): FactResult => {
  const facts: Fact[] = [];
  let undecided = 0;
  const historyNames = [...new Set(history.map((h) => h.name))].sort((a, b) => b.length - a.length);
  // 음식 이름 안의 말(고등어'구이'·해물 '덮밥'·미더덕'찜')은 조리형태 언급이 아니다.
  const names = item ? [item.name, ...historyNames] : historyNames;
  type Token = (typeof DISH_TOKENS)[number] & { ingredients?: readonly string[] };
  const tokenNear = (clause: string, at: number): Token | null => {
    let best: { at: number; tok: Token } | null = null;
    for (const tok of DISH_TOKENS) {
      for (const m of clause.matchAll(tok.re)) {
        const insideName = names.some((n) => {
          const i = clause.indexOf(n);
          return i >= 0 && m.index! >= i && m.index! < i + n.length;
        });
        if (insideName) continue;
        const before = clause.slice(0, m.index!);
        const qualifier = INGREDIENT_QUALIFIER.find((q) => q.re.test(before));
        const qualified: Token = qualifier
          ? { ...tok, label: `${before.match(qualifier.re)![1]} ${tok.label}`, ingredients: qualifier.ingredients }
          : tok;
        if (!best || Math.abs(m.index! - at) < Math.abs(best.at - at)) best = { at: m.index!, tok: qualified };
      }
    }
    return best?.tok ?? null;
  };
  const windowOf = (clause: string): number =>
    /7일|일주일|이번 주/.test(clause) ? 7 : /90일|3개월/.test(clause) ? 90 : /30일|한 달/.test(clause) ? 30 : 14;
  const countIn = (tok: Token, window: number) => {
    const mains = history.filter((h) => h.isMain && daysAgo(today, h.eatenDate) >= 0 && daysAgo(today, h.eatenDate) <= window);
    const typed = mains.filter(
      (h) =>
        h.dishType &&
        tok.types.includes(h.dishType) &&
        (!tok.ingredients || (h.mainIngredient !== null && tok.ingredients.includes(h.mainIngredient))),
    );
    const obvious = typed.filter((h) => tok.obvious.test(h.name.replace(/\s+/g, '')));
    return { total: mains.length, typed, obvious };
  };

  for (const clause of clauses(reason)) {
    // ① 조리형태 부재·드묾.
    const almost = ALMOST.test(clause);
    const negMatch = clause.match(ABSENT);
    if ((almost || negMatch) && !NOT_ABSENCE.test(clause)) {
      const tok = tokenNear(clause, negMatch?.index ?? clause.search(ALMOST));
      if (tok) {
        const window = windowOf(clause);
        const { total, typed, obvious } = countIn(tok, window);
        const share = total ? typed.length / total : 0;
        const obviousShare = total ? obvious.length / total : 0;
        const ate = obvious.map((h) => `${h.name}(${daysAgo(today, h.eatenDate)}일 전)`).join(', ');
        if (almost) {
          if (share <= 0.2) facts.push({ ok: true, text: clause, why: `${tok.label} ${Math.round(share * 100)}%` });
          else if (obviousShare <= 0.2) undecided += 1;
          else facts.push({ ok: false, text: clause, why: `${tok.label} 최근 ${window}일 ${Math.round(share * 100)}% — '거의 없다' 주장(${ate})` });
        } else if (obvious.length > 0) {
          facts.push({ ok: false, text: clause, why: `${tok.label} 최근 ${window}일 실제 ${obvious.length}끼 — ${ate}` });
        } else if (typed.length > 0) {
          undecided += 1;
        } else {
          facts.push({ ok: true, text: clause, why: `${tok.label} 최근 ${window}일 0끼` });
        }
      }
    }
    // ② 어제·그제·N일 전 + 음식 이름.
    const day = /어제/.test(clause) ? 1 : /그제|그저께/.test(clause) ? 2 : null;
    for (const n of historyNames) {
      if (!clause.includes(n)) continue;
      const explicit = clause.match(new RegExp(`${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\(?\\s*(\\d+)\\s*일\\s*전`));
      const claimed = explicit ? Number(explicit[1]) : day;
      if (claimed === null) continue;
      const eaten = history.some((h) => h.name === n && daysAgo(today, h.eatenDate) === claimed);
      facts.push({ ok: eaten, text: clause, why: `${n} ${claimed}일 전 섭취 ${eaten ? '맞음' : '기록 없음'}` });
    }
    // ③ N% — 0% 는 그 조리형태를 정말 안 먹었는지, 그 밖은 프로필 분포 수치와 ±1.
    for (const m of clause.matchAll(/(\d{1,3})\s*%/g)) {
      const n = Number(m[1]);
      if (n === 0) {
        const tok = tokenNear(clause, m.index!);
        if (!tok) continue;
        const { obvious, typed } = countIn(tok, 14);
        if (obvious.length > 0) {
          facts.push({ ok: false, text: clause, why: `${tok.label} 0% 주장 — 실제 ${obvious.map((h) => h.name).join(', ')}` });
        } else if (typed.length > 0) undecided += 1;
        else facts.push({ ok: true, text: clause, why: `${tok.label} 0%` });
        continue;
      }
      const ok = shares.some((s) => Math.abs(s - n) <= 1);
      facts.push({ ok, text: clause, why: `${n}% ${ok ? '분포에 있음' : '분포에 없는 수치'}` });
    }
  }
  // ④ 먹은 적 있는 음식을 처음이라고.
  if (item?.lastEatenDate && SAYS_NEW.test(reason)) {
    facts.push({ ok: false, text: reason, why: `${item.name} 은 ${item.lastEatenDate}에 먹었음` });
  }
  return { facts, undecided };
};

interface RawRun {
  model: string;
  scenario: string;
  ms: number;
  truncated: boolean;
  error: string | null;
  llmNames: string[];
  pickNames: string[];
  reasons: { name: string; reason: string }[];
  summary: string;
  completionTokens: number | null;
}

const main = async (): Promise<void> => {
  const app = await buildApp({ logger: false });
  await app.ready();
  const prisma = app.prisma;
  try {
    const pattern = new MealPatternService(prisma);
    const preferences = new MealPreferenceService(prisma);
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
    const month = Number(today.slice(5, 7));

    const existing = new Set(
      (await prisma.user.findMany({ where: { id: { in: USERS.map((u) => u.id) } }, select: { id: true } })).map(
        (u) => u.id,
      ),
    );
    const scenarios = SCENARIOS.filter((s) => existing.has(s.userId));
    const skipped = USERS.filter((u) => !existing.has(u.id)).map((u) => u.label);

    // 시나리오별 후보·프롬프트(모델과 무관하게 한 번만) + 비교 기준.
    interface Prepared {
      s: Scenario;
      pool: ScoredCandidate[];
      prompt: string;
      history: HistoryItem[];
      shares: number[];
      recent: Set<string>;
      week: Set<string>;
      disliked: string[];
      heavyTop: { dish: string | null; ing: string | null };
    }
    const prepared: Prepared[] = [];
    for (const s of scenarios) {
      const stored = await preferences.get(s.userId);
      const pref = s.pref ? s.pref(stored) : stored;
      const [history, feedback] = await Promise.all([
        pattern.loadHistory(s.userId, today),
        pattern.loadFeedbackSignals(s.userId, today),
      ]);
      const profile = buildProfile(history, s.slot, today, feedback);
      const raw = await pattern.buildCandidates(profile, pref, `${s.userId}|${today}`);
      const pool = filterForFocus(
        filterForSlot(
          raw
            .map((c) =>
              scoreCandidate(c, {
                profile,
                preference: pref,
                targetSlot: s.slot,
                mealType: pref.mealTypes[0] ?? null,
                month,
                tempC: null,
                rain: null,
                today,
              }),
            )
            .sort((a, b) => b.score - a.score),
          profile,
          s.slot,
          3,
        ),
        recommendationFocus(pref.weights, s.note ?? null),
        3,
      );
      const candidates = pool.slice(0, PROMPT_CANDIDATES);
      const prompt = buildMealRecommendationUserPrompt({
        profileText: describeProfile(profile, s.slot),
        candidates,
        targetSlot: s.slot,
        targetDate: today,
        mealType: pref.mealTypes[0] ?? null,
        weights: pref.weights,
        excludedFoods: pref.excludedFoods,
        dislikedFoods: pref.dislikedFoods,
        allergens: pref.allergens,
        note: s.note ?? null,
        entryCount: profile.entryCount,
        recentDishCounts: recentDishTypeCounts(profile),
      });
      const recent = new Set<string>();
      const week = new Set<string>();
      for (const [norm, date] of profile.lastEatenByNorm) {
        const d = daysAgo(today, date);
        if (d >= 0 && d <= RECENT_DAYS) recent.add(norm);
        if (d >= 0 && d <= 7) week.add(norm);
      }
      const top = (rec: Record<string, number>): string | null =>
        Object.entries(rec).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      prepared.push({
        s,
        pool: candidates,
        prompt,
        history,
        shares: [profile.dishTypeShare, profile.ingredientShare, profile.cuisineShare].flatMap((rec) =>
          Object.values(rec).map((v) => Math.round(v * 100)),
        ),
        recent,
        week,
        disliked: pref.dislikedFoods,
        heavyTop: { dish: top(profile.dishTypeShare), ing: top(profile.ingredientShare) },
      });
    }

    // ── 원 응답: LLM 을 부르거나 저장본을 읽는다 ──
    let rawRuns: RawRun[];
    if (FROM_RAW) {
      rawRuns = (JSON.parse(await readFile(FROM_RAW, 'utf8')) as { runs: RawRun[] }).runs;
      console.log(`원 응답 ${rawRuns.length}건을 읽었다(${FROM_RAW}).`);
    } else {
      const aiConfig = new AiConfigService(prisma, buildLlmProviderEnv());
      const resolved = await aiConfig.getResolved('ollama-cloud', 'meal-recommend');
      if (!resolved) throw new Error('meal-recommend 용 ollama-cloud 설정이 없습니다(키 확인).');
      const provider = adapterCache.get(resolved);
      console.log(
        `모델 ${MODELS.join(', ')} · 시나리오 ${prepared.length} · 반복 ${REPEAT}${skipped.length ? ` · 건너뜀 ${skipped.join(', ')}` : ''}`,
      );
      rawRuns = [];
      for (const model of MODELS) {
        for (const p of prepared) {
          for (let r = 0; r < REPEAT; r += 1) {
            const ac = new AbortController();
            const timer = setTimeout(() => ac.abort(), LLM.probeTimeoutMs);
            const started = Date.now();
            let run: RawRun;
            try {
              const res = await provider.complete({
                prompt: p.prompt,
                systemPrompt: MEAL_RECOMMENDATION_SYSTEM_PROMPT,
                model,
                temperature: LLM.temperature,
                maxTokens: LLM.maxTokens,
                numCtx: LLM.numCtx,
                format: MEAL_RECOMMENDATION_JSON_SCHEMA as unknown as Record<string, unknown>,
                think: thinkOptionForModel(model),
                signal: ac.signal,
              });
              const parsed = parseRecommendationOutput(res.text);
              const items = parsed ? mapLlmItems(parsed.items, p.pool) : [];
              run = {
                model,
                scenario: p.s.key,
                ms: Date.now() - started,
                truncated: res.doneReason === 'length',
                error: parsed ? null : '응답 형식 아님',
                llmNames: parsed?.items.map((i) => i.name) ?? [],
                pickNames: items.map((i) => i.name),
                reasons: items.map((i) => ({ name: i.name, reason: i.reason })),
                summary: parsed?.summary ?? '',
                completionTokens: res.completionTokens,
              };
            } catch (e) {
              run = {
                model,
                scenario: p.s.key,
                ms: Date.now() - started,
                truncated: false,
                error: (e as Error).message.slice(0, 120),
                llmNames: [],
                pickNames: [],
                reasons: [],
                summary: '',
                completionTokens: null,
              };
            } finally {
              clearTimeout(timer);
            }
            rawRuns.push(run);
            console.log(
              `${model} ${p.s.userLabel} ${MEAL_SLOT_LABEL[p.s.slot]} ${p.s.label} #${r + 1}: ${run.pickNames.length ? run.pickNames.join(' / ') : `실패 ${run.error ?? ''}`} (${(run.ms / 1000).toFixed(1)}s)`,
            );
          }
        }
      }
      const rawFile = join(OUT_DIR, `models-raw-${today}.json`);
      await writeFile(rawFile, JSON.stringify({ today, models: MODELS, repeat: REPEAT, runs: rawRuns }, null, 2));
      console.log(`원 응답: ${rawFile}`);
    }
    const models = [...new Set(rawRuns.map((r) => r.model))];

    // ── 지표 ──
    interface Agg {
      calls: number;
      ok: number;
      ms: number[];
      timeouts: number;
      truncated: number;
      outOfPool: number;
      llmNames: number;
      picks: number;
      recent: number;
      week: number;
      disliked: number;
      dupDish: number[];
      dupIng: number[];
      rank: number[];
      facts: number;
      undecided: number;
      wrong: { scenario: string; name: string; fact: Fact }[];
      foreign: string[];
      reasonLen: number[];
      tokens: number[];
      consistency: number[];
      setting: Record<string, number[]>;
      settingBase: Record<string, number[]>;
    }
    const empty = (): Agg => ({
      calls: 0,
      ok: 0,
      ms: [],
      timeouts: 0,
      truncated: 0,
      outOfPool: 0,
      llmNames: 0,
      picks: 0,
      recent: 0,
      week: 0,
      disliked: 0,
      dupDish: [],
      dupIng: [],
      rank: [],
      facts: 0,
      undecided: 0,
      wrong: [],
      foreign: [],
      reasonLen: [],
      tokens: [],
      consistency: [],
      setting: {},
      settingBase: {},
    });
    const aggs = new Map<string, Agg>(models.map((m) => [m, empty()]));
    const dupRatio = (vals: (string | null)[]): number => {
      const known = vals.filter((v): v is string => Boolean(v));
      return known.length <= 1 ? 0 : 1 - new Set(known).size / known.length;
    };
    const picksOf = (run: RawRun, p: Prepared): ScoredCandidate[] =>
      run.pickNames.flatMap((n) => p.pool.filter((c) => c.name === n).slice(0, 1));
    const settingMetric = (check: Scenario['check'], picks: ScoredCandidate[], heavyTop: Prepared['heavyTop']): number | null => {
      if (!picks.length) return null;
      if (check === 'health') return mean(picks.map((c) => c.features['health'] ?? 0.5));
      if (check === 'balance')
        return mean(picks.map((c) => ((c.dishType === heavyTop.dish ? 1 : 0) + (c.mainIngredient === heavyTop.ing ? 1 : 0)) / 2));
      if (check === 'soup') return picks.filter((c) => c.dishType && SOUP.has(c.dishType)).length / picks.length;
      if (check === 'light') return picks.filter((c) => c.dishType && FRIED.has(c.dishType)).length / picks.length;
      return null;
    };
    const runsOf = (model: string, key: string): RawRun[] => rawRuns.filter((r) => r.model === model && r.scenario === key);

    for (const model of models) {
      const a = aggs.get(model)!;
      for (const p of prepared) {
        const rs = runsOf(model, p.s.key);
        for (const run of rs) {
          const picks = picksOf(run, p);
          a.calls += 1;
          if (picks.length > 0) a.ok += 1;
          a.ms.push(run.ms);
          if (run.ms > LLM.serviceTimeoutMs) a.timeouts += 1;
          if (run.truncated) a.truncated += 1;
          const poolNorms = new Set(p.pool.map((c) => c.nameNorm));
          a.outOfPool += run.llmNames.filter((n) => !poolNorms.has(normalizeTerm(n))).length;
          a.llmNames += run.llmNames.length;
          a.picks += picks.length;
          if (run.completionTokens !== null) a.tokens.push(run.completionTokens);
          for (const c of picks) {
            if (p.recent.has(c.nameNorm)) a.recent += 1;
            if (p.week.has(c.nameNorm)) a.week += 1;
            if (p.disliked.some((t) => c.nameNorm.includes(normalizeTerm(t)))) a.disliked += 1;
            a.rank.push(p.pool.findIndex((x) => x.nameNorm === c.nameNorm) + 1);
          }
          if (picks.length > 1) {
            a.dupDish.push(dupRatio(picks.map((c) => c.dishType)));
            a.dupIng.push(dupRatio(picks.map((c) => c.mainIngredient)));
          }
          for (const { name, reason } of run.reasons) {
            a.reasonLen.push(reason.length);
            const { facts, undecided } = checkFacts(reason, p.pool.find((x) => x.name === name), p.history, p.shares, today);
            a.facts += facts.length;
            a.undecided += undecided;
            for (const fact of facts.filter((f) => !f.ok)) a.wrong.push({ scenario: p.s.key, name, fact });
            if (FOREIGN_SCRIPT.test(reason)) a.foreign.push(`${name}: “${reason}”`);
          }
          if (FOREIGN_SCRIPT.test(run.summary)) a.foreign.push(`요약: “${run.summary}”`);
        }
        if (rs.length >= 2) {
          const x = new Set(picksOf(rs[0]!, p).map((c) => c.nameNorm));
          const y = new Set(picksOf(rs[1]!, p).map((c) => c.nameNorm));
          if (x.size && y.size) a.consistency.push([...x].filter((n) => y.has(n)).length / new Set([...x, ...y]).size);
        }
        if (p.s.check) {
          const base = prepared.find((q) => q.s.userId === p.s.userId && q.s.slot === p.s.slot && !q.s.check);
          for (const run of rs) {
            const v = settingMetric(p.s.check, picksOf(run, p), p.heavyTop);
            if (v !== null) (a.setting[p.s.check] ??= []).push(v);
          }
          for (const run of base ? runsOf(model, base.s.key) : []) {
            const v = settingMetric(p.s.check, picksOf(run, base!), p.heavyTop);
            if (v !== null) (a.settingBase[p.s.check] ??= []).push(v);
          }
        }
      }
    }

    // ── 리포트 ──
    const row = (label: string, f: (a: Agg) => string): string => `| ${label} | ${models.map((m) => f(aggs.get(m)!)).join(' | ')} |`;
    const settingRow = (check: string, label: string, better: 'up' | 'down'): string =>
      row(`${label} (기본 → 설정, ${better === 'up' ? '↑' : '↓'}가 좋음)`, (a) => `${fmt(mean(a.settingBase[check] ?? []))} → ${fmt(mean(a.setting[check] ?? []))}`);
    const lines: string[] = [
      `# 식단 추천 모델 비교 — ${today}`,
      '',
      `모델 ${models.map((m) => `\`${m}\`(think ${String(thinkOptionForModel(m))})`).join(' · ')} · 시나리오 ${prepared.length}개 × 반복 ${REPEAT}. 같은 후보(최대 ${PROMPT_CANDIDATES})·같은 프롬프트를 모델별로 보냈다. 서비스 제한 60초.`,
      '',
      `| 지표 | ${models.join(' | ')} |`,
      `|---|${models.map(() => '---').join('|')}|`,
      row('성공(유효 추천 ≥1)', (a) => `${a.ok}/${a.calls}`),
      row('지연 p50 / p90', (a) => `${fmt((pctl(a.ms, 0.5) ?? NaN) / 1000, 1)}s / ${fmt((pctl(a.ms, 0.9) ?? NaN) / 1000, 1)}s`),
      row('60초 초과(서비스에선 폴백)', (a) => String(a.timeouts)),
      row('출력 잘림', (a) => String(a.truncated)),
      row('출력 토큰 평균', (a) => fmt(mean(a.tokens), 0)),
      row('후보 밖 이름(지어낸 음식)', (a) => `${a.outOfPool}/${a.llmNames}`),
      row('한 번에 고른 수 평균', (a) => fmt(a.ok ? a.picks / a.ok : null, 1)),
      row(`최근 ${RECENT_DAYS}일 먹은 음식 고름`, (a) => String(a.recent)),
      row('최근 7일 안에 먹은 음식 비율(겹침 피하기가 1순위)', (a) => pct(a.picks ? a.week / a.picks : null)),
      row("'가능하면 피함' 고름", (a) => String(a.disliked)),
      row('세트 안 조리형태 겹침(↓)', (a) => pct(mean(a.dupDish))),
      row('세트 안 주재료 겹침(↓)', (a) => pct(mean(a.dupIng))),
      row('고른 후보의 평균 점수 순위', (a) => fmt(mean(a.rank), 1)),
      row('**이유의 사실 확인 — 틀린 주장 / 확인한 주장**', (a) => `**${a.wrong.length} / ${a.facts}** (${pct(a.facts ? a.wrong.length / a.facts : null)})`),
      row('　판정 보류(카탈로그 분류로만 걸림)', (a) => String(a.undecided)),
      row('한글 외 문자(한자·가나) 섞임', (a) => String(a.foreign.length)),
      row('이유 평균 길이(자)', (a) => fmt(mean(a.reasonLen), 0)),
      row('반복 일관성(같은 프롬프트 두 번 겹침)', (a) => pct(mean(a.consistency))),
      settingRow('health', "'가볍게·건강' 건강 평균", 'up'),
      settingRow('balance', "'골고루' 많이 먹은 쪽 겹침", 'down'),
      settingRow('soup', "메모 '국물' 국·찌개 비율", 'up'),
      settingRow('light', "메모 '가볍게' 튀김·빵 비율", 'down'),
      '',
    ];
    for (const m of models) {
      const a = aggs.get(m)!;
      lines.push(`### ${m} — 틀린 주장 ${a.wrong.length}건`, '');
      for (const w of a.wrong) lines.push(`- [${w.scenario.replace('probe-meal-', '')}] **${w.name}** — ${w.fact.why}: “${w.fact.text}”`);
      for (const f of a.foreign) lines.push(`- 한글 외 문자 ${f}`);
      lines.push('');
    }
    lines.push('## 나란히 보기', '');
    for (const p of prepared) {
      lines.push(`### ${p.s.userLabel} · ${MEAL_SLOT_LABEL[p.s.slot]} · ${p.s.label}`, '');
      for (const m of models) {
        runsOf(m, p.s.key).forEach((run, i) => {
          const picks = picksOf(run, p);
          lines.push(
            `- **${m} #${i + 1}** (${(run.ms / 1000).toFixed(1)}s) ${picks.length ? picks.map((c) => `${c.name}(${c.dishType ? FOOD_DISH_TYPE_LABEL[c.dishType] : '-'})`).join(' / ') : `실패 — ${run.error ?? ''}`}`,
          );
          if (i === 0) {
            if (run.summary) lines.push(`  - 총평: ${run.summary}`);
            for (const r of run.reasons) lines.push(`  - ${r.name}: ${r.reason}`);
          }
        });
      }
      lines.push('');
    }
    const file = join(OUT_DIR, `models-report-${today}.md`);
    await writeFile(file, lines.join('\n'));
    console.log(`\n${lines.slice(0, lines.indexOf('## 나란히 보기')).join('\n')}`);
    console.log(`리포트: ${file}`);
  } finally {
    await app.close();
  }
};

main().catch((e: unknown) => {
  console.error(e);
  process.exitCode = 1;
});
