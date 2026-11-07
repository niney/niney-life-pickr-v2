/* eslint-disable no-console -- 실험 결과를 터미널에 그대로 찍는 스크립트 */
// 식단 추천 변형 실험(2026-11-07) — 같은 사용자·같은 후보에 여러 변형을 LLM 까지 돌려 비교한다. 서비스의 LLM 단계(프롬프트 →
// 호출 → 후보 대응 → 영양 주장 검사)를 그대로 재현하고 변형만 바꿔 끼운다(운영 코드는 그대로, 추천 행도 만들지 않는다).
//   --exp strength : 영양 보정 세기 — A(보정 없음) · B0(지금: 건강 요소 +0.3/−0.25) · B1(폭 2배) · B2(가중치와 별개 배수)
//                    · B3(영양 신호가 있으면 건강 가중치를 4로)
//   --exp recent   : 최근 먹은 단골 재추천 — R0(지금) · R1(프롬프트 규칙: 7일 안에 먹은 음식은 고르지 않기) · R2(R1 + 후보 줄
//                    'N일 전') · R3(7일 안에 먹은 후보를 LLM 목록에서 빼기)
// 실행: DATABASE_URL=file:../data/rec-probe.db pnpm --filter friendly probe:meal-recommend-variants --exp strength
//        [--runs 2] [--email a@b.c] [--slot dinner]
//   가상 사용자는 probe:meal-recommend-nutrition 이 만든 것(nut-probe-*)을 쓴다 — 그 프로브를 먼저 한 번 돌려 둔다.
//   복제 DB 만들기(서버가 떠 있어도 일관된 사본, 약 12초): apps/friendly 에서
//     node -e "new (require('node:sqlite').DatabaseSync)('data/prod.db',{readOnly:true}).exec(\"VACUUM INTO 'data/rec-probe.db'\")"
//   2026-11-07 결과는 docs/PLAN-meal.md 진행 기록(지금 세기 유지, 최근 단골 재추천은 바꾸지 않음).

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import type { MealSlotType } from '@repo/api-contract';
import { thinkOptionFor } from '@repo/utils';
import { normalizeTerm } from '../src/lib/text.js';
import { adapterCache } from '../src/modules/ai/adapter-cache.js';
import { AiConfigService } from '../src/modules/ai/ai.config.service.js';
import { buildLlmProviderEnv } from '../src/modules/ai/llm-provider-env.js';
import { FoodNutrientRefService } from '../src/modules/food/food-nutrient-ref.service.js';
import { MealPreferenceService } from '../src/modules/meal/meal-preference.service.js';
import { MealNutritionService } from '../src/modules/meal-nutrition/meal-nutrition.service.js';
import {
  MealPatternService,
  buildProfile,
  describeProfile,
  filterForFocus,
  filterForSlot,
  recentDishTypeCounts,
  recommendationFocus,
  scoreCandidate,
  type ScoredCandidate,
} from '../src/modules/meal-recommendation/meal-pattern.service.js';
import {
  MEAL_RECOMMENDATION_JSON_SCHEMA,
  MEAL_RECOMMENDATION_SYSTEM_PROMPT,
  buildMealRecommendationUserPrompt,
} from '../src/modules/meal-recommendation/meal-recommendation.prompts.js';
import { mapLlmItems, parseRecommendationOutput } from '../src/modules/meal-recommendation/meal-recommendation.service.js';
import {
  isSoupLike,
  nutritionFit,
  nutritionSignalsFrom,
  supportedGapKeys,
  unsupportedNutrients,
  type NutritionSignals,
} from '../src/modules/meal-recommendation/nutrition-signals.js';

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const EXP = (flag('--exp') ?? 'strength') as 'strength' | 'recent';
const RUNS = Math.max(1, Math.min(8, Number(flag('--runs') ?? 2) || 2));
const EMAILS = (flag('--email') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const SLOT = (flag('--slot') ?? 'dinner') as MealSlotType;
const PERSONA_IDS: [string, string][] = [
  ['probe-nut-s', 'S 짠 국물 편중'],
  ['probe-nut-m', 'M 고기·튀김 위주'],
  ['probe-nut-b', 'B 대조군'],
];
const PROMPT_CANDIDATES = 25;
const SALTY_MG = 1500;
const TARGET_SHARE = 0.25;
const RECENT_DAYS = 7;
const NUTRITION_WORD = /나트륨|국물|짠|싱겁|비타민|칼슘|철분|칼륨|엽산|마그네슘|아연|식이섬유|영양|보충/;

const url = (process.env['DATABASE_URL'] ?? '').trim();
if (!url.startsWith('file:') || /prod\.db/i.test(url)) throw new Error('운영 사본을 복제한 DB(rec-probe.db 등)에서 돌리세요.');

const prisma = new PrismaClient();
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
const daysAgo = (date: string | null): number | null =>
  date ? Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000) : null;

interface Subject {
  id: string;
  title: string;
  signals: NutritionSignals | null;
  base: ScoredCandidate[]; // A — 영양 신호 없이
  withSignals: ScoredCandidate[]; // B0 — 지금 코드
  profile: ReturnType<typeof buildProfile>;
  preference: Awaited<ReturnType<MealPreferenceService['get']>>;
}

interface Variant {
  key: string;
  label: string;
  // 점수를 다시 매긴 후보(정렬 전) — LLM 목록·폴백의 바탕.
  rescore: (s: Subject) => ScoredCandidate[];
  useSignals: boolean;
  system?: (sys: string) => string;
  prompt?: (p: string) => string;
  // LLM 목록에서 뺄 후보.
  dropFromList?: (c: ScoredCandidate) => boolean;
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const weightTotal = (s: Subject): number => {
  const w = s.preference.weights;
  return w.variety + w.taste + w.balance + w.health + w.novelty + w.weather + w.convenience;
};
const factor = (c: ScoredCandidate): number => (c.features.slot ?? 1) * (1 - (c.features.aversion ?? 0)) * (c.features.recent ?? 1);
const byNormOf = (list: ScoredCandidate[]): Map<string, ScoredCandidate> => new Map(list.map((c) => [c.nameNorm, c]));
const withScore = (c: ScoredCandidate, score: number): ScoredCandidate => ({ ...c, score: Math.round(score * 1000) / 1000 });

const RECENT_RULE = `\n- 후보 줄의 '마지막' 날짜가 최근 ${RECENT_DAYS}일 안인 음식은, 대안이 3개 이상이면 고르지 않는다 — 자주 먹는(좋아하는) 음식이라도. 그래도 고르면 이유에 "며칠 전에 드셨지만"처럼 밝힌다.`;
const addDaysAgo = (p: string): string =>
  p.replace(/마지막 (\d{4}-\d{2}-\d{2})/g, (m, d: string) => {
    const n = daysAgo(d);
    return n !== null ? `마지막 ${d}(${n}일 전)` : m;
  });

const STRENGTH: Variant[] = [
  { key: 'A', label: '보정 없음', rescore: (s) => s.base, useSignals: false },
  { key: 'B0', label: '지금(건강 요소)', rescore: (s) => s.withSignals, useSignals: true },
  {
    key: 'B1',
    label: '폭 2배',
    useSignals: true,
    rescore: (s) => {
      const a = byNormOf(s.base);
      const w = s.preference.weights;
      return s.withSignals.map((c) => {
        const base = a.get(c.nameNorm)!;
        if (!s.signals) return c;
        const delta = nutritionFit(c, s.signals).delta;
        const h1 = clamp01((base.features.health ?? 0.5) + 2 * delta);
        const score = base.score + ((w.health * (h1 - (base.features.health ?? 0.5))) / weightTotal(s)) * factor(base);
        return withScore({ ...c, features: { ...c.features, health: h1 } }, score);
      });
    },
  },
  {
    key: 'B2',
    label: '별개 배수',
    useSignals: true,
    rescore: (s) =>
      s.withSignals.map((c) => {
        if (!s.signals) return c;
        const fit = nutritionFit(c, s.signals);
        const salt = s.signals.sodiumHigh ? ((c.sodiumMg ?? 0) >= SALTY_MG ? 0.8 : isSoupLike(c) ? 0.9 : 1) : 1;
        return withScore(c, c.score * (1 + 0.25 * fit.coverage) * salt);
      }),
  },
  {
    key: 'B3',
    label: '건강 가중치 4',
    useSignals: true,
    rescore: (s) => {
      const a = byNormOf(s.base);
      const w = s.preference.weights;
      const total = weightTotal(s);
      const wh = s.signals ? Math.max(w.health, 4) : w.health;
      return s.withSignals.map((c) => {
        const base = a.get(c.nameNorm)!;
        const f = factor(base);
        if (f <= 0) return c;
        const rawOther = (base.score / f) * total - w.health * (base.features.health ?? 0.5);
        const score = ((rawOther + wh * (c.features.health ?? 0.5)) / (total - w.health + wh)) * f;
        return withScore(c, score);
      });
    },
  },
];

const RECENT: Variant[] = [
  { key: 'R0', label: '지금', rescore: (s) => s.withSignals, useSignals: true },
  { key: 'R1', label: '규칙', rescore: (s) => s.withSignals, useSignals: true, system: (x) => x + RECENT_RULE },
  {
    key: 'R2',
    label: '규칙+며칠 전',
    rescore: (s) => s.withSignals,
    useSignals: true,
    system: (x) => x + RECENT_RULE,
    prompt: addDaysAgo,
  },
  {
    key: 'R3',
    label: '목록에서 빼기',
    rescore: (s) => s.withSignals,
    useSignals: true,
    dropFromList: (c) => (daysAgo(c.lastEatenDate) ?? 99) < RECENT_DAYS,
  },
];

interface RunStat {
  picks: string[];
  soup: number;
  salty: number;
  recent7: number;
  recent3: number;
  history: number;
  gaps: number;
  mentions: number;
  claims: number;
  ok: boolean;
}

const report: string[] = [];
const log = (line = ''): void => {
  console.log(line);
  report.push(line);
};

const main = async (): Promise<void> => {
  const nutritionSvc = new MealNutritionService(prisma, { refs: new FoodNutrientRefService(prisma) });
  const pattern = new MealPatternService(prisma);
  const prefs = new MealPreferenceService(prisma);
  const aiConfig = new AiConfigService(prisma, buildLlmProviderEnv());
  const resolved = await aiConfig.getResolved('ollama-cloud', 'meal-recommend');
  if (!resolved?.defaultModel) throw new Error('meal-recommend 모델이 없습니다.');
  const model = resolved.defaultModel.trim();
  const provider = adapterCache.get({ ...resolved, timeoutMs: 240_000 });
  const think = thinkOptionFor(model, resolved.thinking);

  const subjects: Subject[] = [];
  const ids: [string, string][] = [...PERSONA_IDS];
  for (const email of EMAILS) {
    const u = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (u) ids.push([u.id, `실제 ${email}`]);
  }
  for (const [id, title] of ids) {
    const exists = await prisma.mealEntry.count({ where: { userId: id } });
    if (exists === 0) {
      console.warn(`${title}: 기록 없음 — probe:meal-recommend-nutrition 을 먼저 돌리세요.`);
      continue;
    }
    const signals = nutritionSignalsFrom(await nutritionSvc.analyze(id, today, 14));
    const preference = await prefs.get(id);
    const [history, feedback] = await Promise.all([pattern.loadHistory(id, today), pattern.loadFeedbackSignals(id, today)]);
    const profile = buildProfile(history, SLOT, today, feedback);
    const candidates = await pattern.buildCandidates(profile, preference, `${id}|${today}`);
    const month = Number(today.slice(5, 7));
    const score = (nutrition: NutritionSignals | null): ScoredCandidate[] =>
      candidates.map((c) =>
        scoreCandidate(c, { profile, preference, targetSlot: SLOT, mealType: null, month, tempC: null, rain: null, today, nutrition }),
      );
    subjects.push({ id, title, signals, base: score(null), withSignals: score(signals), profile, preference });
  }

  const variants = EXP === 'strength' ? STRENGTH : RECENT;
  log(`# 식단 추천 변형 실험 — ${EXP} · ${today} · ${model} · ${RUNS}회씩`);
  log('');
  log(`변형: ${variants.map((v) => `${v.key} ${v.label}`).join(' / ')}`);
  log('지표(회당 평균): 보충=부족 영양소를 한 끼에 기준 25% 이상 채우는 영양소 수, 국물·짠=고른 음식 중 개수(나트륨 많은 사람만 의미),');
  log(`최근7·최근3=그 일수 안에 먹은 음식, 단골=내 기록에서 온 음식, 언급=이유의 영양 언급, 주장=근거 없는 영양 주장(검사 전 원문).`);

  const totals = new Map<string, RunStat[]>();
  for (const s of subjects) {
    log('');
    log(`## ${s.title}`);
    log(
      `영양 신호: ${s.signals ? `${s.signals.sodiumHigh ? `나트륨 많음(${s.signals.sodiumPercent}%) · ` : ''}부족 ${s.signals.gaps.map((g) => g.label).join('·') || '없음'}` : '없음'} · 최근 7일: ${s.profile.recentFoods.join(', ')}`,
    );
    const top10A = new Set(
      [...s.base].sort((a, b) => b.score - a.score).slice(0, 10).map((c) => c.nameNorm),
    );
    log('');
    log('| 변형 | 상위10 바뀜 | 보충 | 국물 | 짠 | 최근7 | 최근3 | 단골 | 언급 | 주장 | 고른 음식(회차별) |');
    log('|---|---|---|---|---|---|---|---|---|---|---|');
    for (const v of variants) {
      const ranked = filterForFocus(
        filterForSlot([...v.rescore(s)].sort((a, b) => b.score - a.score), s.profile, SLOT, 3),
        recommendationFocus(s.preference.weights, null),
        3,
      );
      const listed = (v.dropFromList ? (() => { const kept = ranked.filter((c) => !v.dropFromList!(c)); return kept.length >= 10 ? kept : ranked; })() : ranked).slice(0, PROMPT_CANDIDATES);
      const changed = ranked.slice(0, 10).filter((c) => !top10A.has(c.nameNorm)).length;
      const signals = v.useSignals ? s.signals : null;
      const userPrompt = buildMealRecommendationUserPrompt({
        profileText: describeProfile(s.profile, SLOT),
        candidates: listed,
        targetSlot: SLOT,
        targetDate: today,
        mealType: null,
        weights: s.preference.weights,
        excludedFoods: s.preference.excludedFoods,
        allergens: s.preference.allergens,
        dislikedFoods: s.preference.dislikedFoods,
        note: null,
        entryCount: s.profile.entryCount,
        recentDishCounts: recentDishTypeCounts(s.profile),
        nutrition: signals,
      });
      const runs: RunStat[] = [];
      for (let i = 0; i < RUNS; i++) {
        const res = await provider
          .complete({
            prompt: v.prompt ? v.prompt(userPrompt) : userPrompt,
            systemPrompt: v.system ? v.system(MEAL_RECOMMENDATION_SYSTEM_PROMPT) : MEAL_RECOMMENDATION_SYSTEM_PROMPT,
            model,
            temperature: 0.4,
            maxTokens: 1200,
            numCtx: 8192,
            format: MEAL_RECOMMENDATION_JSON_SCHEMA as unknown as Record<string, unknown>,
            think,
            timeoutMs: 240_000,
          })
          .catch(() => null);
        const parsed = res ? parseRecommendationOutput(res.text) : null;
        const items = parsed ? mapLlmItems(parsed.items, listed, signals) : [];
        const byNorm = byNormOf(listed);
        const picked = items.map((it) => byNorm.get(normalizeTerm(it.name))).filter((c): c is ScoredCandidate => !!c);
        const truth = s.signals; // 지표는 늘 그 사람의 실제 영양 신호로 잰다.
        runs.push({
          picks: picked.map((c) => c.name),
          soup: picked.filter((c) => isSoupLike(c)).length,
          salty: picked.filter((c) => (c.sodiumMg ?? 0) >= SALTY_MG).length,
          recent7: picked.filter((c) => (daysAgo(c.lastEatenDate) ?? 99) < RECENT_DAYS).length,
          recent3: picked.filter((c) => (daysAgo(c.lastEatenDate) ?? 99) <= 3).length,
          history: picked.filter((c) => c.fromHistory).length,
          gaps: truth
            ? truth.gaps.filter((g) =>
                picked.some((c) => {
                  const val = c.servingNutrients?.[g.per100];
                  return val !== undefined && g.reference > 0 && val / g.reference >= TARGET_SHARE;
                }),
              ).length
            : 0,
          mentions: (parsed?.items ?? []).filter((it) => NUTRITION_WORD.test(it.reason)).length,
          claims: (parsed?.items ?? []).reduce((n, it) => {
            const c = byNorm.get(normalizeTerm(it.name));
            return n + unsupportedNutrients(it.reason, supportedGapKeys(c ?? {}, truth)).length;
          }, 0),
          ok: picked.length > 0,
        });
      }
      const mean = (f: (r: RunStat) => number): string => (runs.reduce((n, r) => n + f(r), 0) / runs.length).toFixed(1);
      log(
        `| ${v.key} ${v.label} | ${changed} | ${mean((r) => r.gaps)} | ${mean((r) => r.soup)} | ${mean((r) => r.salty)} | ${mean((r) => r.recent7)} | ${mean((r) => r.recent3)} | ${mean((r) => r.history)} | ${mean((r) => r.mentions)} | ${mean((r) => r.claims)} | ${runs.map((r) => (r.ok ? r.picks.join('·') : '(실패)')).join(' / ')} |`,
      );
      totals.set(v.key, [...(totals.get(v.key) ?? []), ...runs]);
    }
  }

  log('');
  log('## 전체(모든 사용자·회차 평균)');
  log('');
  log('| 변형 | 보충 | 국물 | 짠 | 최근7 | 최근3 | 단골 | 언급 | 주장 | 실패 |');
  log('|---|---|---|---|---|---|---|---|---|---|');
  for (const v of variants) {
    const rs = totals.get(v.key) ?? [];
    const mean = (f: (r: RunStat) => number): string => (rs.length ? rs.reduce((n, r) => n + f(r), 0) / rs.length : 0).toFixed(2);
    log(
      `| ${v.key} ${v.label} | ${mean((r) => r.gaps)} | ${mean((r) => r.soup)} | ${mean((r) => r.salty)} | ${mean((r) => r.recent7)} | ${mean((r) => r.recent3)} | ${mean((r) => r.history)} | ${mean((r) => r.mentions)} | ${mean((r) => r.claims)} | ${rs.filter((r) => !r.ok).length} |`,
    );
  }

  const dir = join(process.cwd(), 'data', 'meal-probe');
  await mkdir(dir, { recursive: true });
  const file = join(dir, `variants-${EXP}-${today}.md`);
  await writeFile(file, report.join('\n') + '\n', 'utf8');
  console.log(`\n리포트: ${file}`);
};

main()
  .catch((e: unknown) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
