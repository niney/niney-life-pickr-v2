// 영양 기준 음식 일괄 연결 — 비타민·무기질이 없는 음식 이름을 영양소가 있는 표준 음식에 잇는다(food_nutrient_refs).
// 영양소 점검은 이 연결로 "먹은 열량 × 기준 음식의 열량당 영양소"를 계산한다(docs/PLAN-meal-nutrition.md A).
//
// 실행: pnpm --filter friendly link:food-nutrients [--dry-run] [--llm] [--force] [--scope=meals,common|all] [--limit=N]
//   --dry-run  규칙만 계산해 무엇이 이어지는지·LLM 에 물을 이름을 찍는다(DB 쓰기 없음, LLM 없음).
//   --llm      규칙이 못 잡은 이름을 LLM(chat 용도, OLLAMA_MENU_MATCH_MODEL)이 후보 중에서 고른다 — 없으면 규칙만 저장.
//   --force    이번 버전으로 이미 물어본 LLM·'없음' 판정도 다시 묻는다(어드민 지정은 그래도 안 건드린다).
//   --scope    meals = 식단 기록에 나온 이름(전 사용자), common = 흔한 한 끼 목록의 카탈로그 행,
//              all = 영양소 없는 활성 카탈로그 행 전체(약 3,500 — LLM 을 켜면 오래 걸린다). 기본 meals,common.
//   --limit    대상 상한(시험용).
// 카탈로그를 다시 적재(load:food-catalog)한 뒤에도 돌리면 규칙 판정이 새 후보로 갱신된다. 운영은 배포·적재 뒤 1회.

import { PrismaClient } from '@prisma/client';
import { env } from '../src/config/env.js';
import { normalizeTerm } from '../src/lib/text.js';
import { AiConfigService } from '../src/modules/ai/ai.config.service.js';
import { buildLlmProviderEnv } from '../src/modules/ai/llm-provider-env.js';
import { isNutrientProfileRow, resolveNutrientRefByRules, type NutrientRefTarget } from '../src/modules/food/food-nutrient-ref.js';
import { FoodNutrientRefService } from '../src/modules/food/food-nutrient-ref.service.js';
import { commonMealNorms } from '../src/modules/meal-recommendation/common-meals.js';

const args = process.argv.slice(2);
const opt = (name: string): string | null => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const flag = (name: string): boolean => args.includes(`--${name}`);
const DRY_RUN = flag('dry-run');
const LLM = flag('llm');
const FORCE = flag('force');
const SCOPE = new Set((opt('scope') ?? 'meals,common').split(',').map((s) => s.trim()));
const LIMIT = opt('limit') ? Number.parseInt(opt('limit')!, 10) : undefined;
const DRINKS = new Set(['beverage', 'alcohol']);

const prisma = new PrismaClient();

const main = async (): Promise<void> => {
  const dbName = (process.env.DATABASE_URL ?? '').split(/[\\/]/).pop() ?? '';
  console.log(`=== 영양 기준 음식 연결 (DB ${dbName}, scope=${[...SCOPE].join(',')}${DRY_RUN ? ', --dry-run' : ''}${LLM ? ', --llm' : ''}${FORCE ? ', --force' : ''}) ===`);
  const svc = new FoodNutrientRefService(prisma, LLM && !DRY_RUN
    ? { aiConfig: new AiConfigService(prisma, buildLlmProviderEnv()), model: env.OLLAMA_MENU_MATCH_MODEL }
    : {});
  const targets: NutrientRefTarget[] = [];

  if (SCOPE.has('meals') || SCOPE.has('all')) {
    const items = await prisma.mealItem.findMany({
      where: { kcal: { not: null } },
      select: { name: true, nameNorm: true, foodId: true, dishType: true },
      distinct: ['nameNorm', 'foodId'],
    });
    const fromMeals = await svc.targetsForItems(items);
    console.log(`[meals] 식단 항목 ${items.length}종 → 연결 대상 ${fromMeals.length}`);
    targets.push(...fromMeals);
  }
  if (SCOPE.has('common') || SCOPE.has('all')) {
    const { lex } = await svc.context();
    const common = commonMealNorms(lex);
    const rows = await prisma.foodItem.findMany({
      where: { active: true },
      select: { name: true, nameNorm: true, aliasNormsJson: true, dishType: true, mainIngredient: true, nutritionFrom: true, nutrientsPer100gJson: true, kcalPer100g: true, kcal: true, servingG: true },
    });
    let n = 0;
    for (const r of rows) {
      if (isNutrientProfileRow(r) || DRINKS.has(r.dishType ?? '')) continue;
      const inCommon = common.has(r.nameNorm);
      if (!SCOPE.has('all') && !inCommon) continue;
      targets.push({ name: r.name, nameNorm: r.nameNorm, dishType: r.dishType, mainIngredient: r.mainIngredient, nutritionFrom: r.nutritionFrom });
      n += 1;
    }
    console.log(`[${SCOPE.has('all') ? 'all' : 'common'}] 영양소 없는 카탈로그 행 ${n}`);
  }
  const seen = new Set<string>();
  const uniq = targets.filter((t) => {
    const k = t.nameNorm || normalizeTerm(t.name);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const list = LIMIT ? uniq.slice(0, LIMIT) : uniq;
  console.log(`대상 ${list.length}개`);

  if (DRY_RUN) {
    const { index, lex } = await svc.context();
    const byMethod = new Map<string, string[]>();
    const rest: string[] = [];
    for (const t of list) {
      const v = resolveNutrientRefByRules(t, index, lex);
      if (!v) {
        rest.push(t.name);
        continue;
      }
      byMethod.set(v.method, [...(byMethod.get(v.method) ?? []), `${t.name} → ${v.candidate.name}`]);
    }
    console.log(`기준 후보 ${index.candidates.length}종`);
    for (const [m, xs] of byMethod) console.log(`  [${m}] ${xs.length} — ${xs.slice(0, 12).join(' · ')}`);
    console.log(`  규칙으로 못 이음(LLM 몫) ${rest.length} — ${rest.slice(0, 30).join(' · ')}`);
    return;
  }

  const t0 = Date.now();
  const stats = await svc.link(list, {
    llm: LLM,
    force: FORCE,
    onProgress: (done, total) => {
      if (done === total || done % 50 === 0) console.log(`  ${done}/${total}`);
    },
  });
  console.log(`규칙 ${stats.rules} · LLM ${stats.llm} · 없음 ${stats.none} · 그대로 ${stats.kept} · 실패 ${stats.failed} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  if (!LLM) console.log('  (--llm 없이 돌려 규칙이 못 잡은 이름은 그대로 — LLM 연결은 --llm)');
};

void main()
  .catch((e: unknown) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
