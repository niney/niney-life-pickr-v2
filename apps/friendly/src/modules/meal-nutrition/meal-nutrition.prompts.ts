import type { MealNutrientResultType, MealNutritionAnalysisType } from '@repo/api-contract';
import { MEAL_NUTRIENT_REFERENCE_LABEL, formatNutrientAmount } from '@repo/utils';
import { NUTRIENT_DEFS } from './meal-nutrition.defs.js';

// 영양제 조언 프롬프트 — 판단(부족·기준·부족분·상한)은 서버가 끝낸 뒤 문장만 모델이 쓴다.
// v1(2026-10-04): kimi-k3 기본. 숫자는 프롬프트에 있는 것만(서버가 검사), 영양소는 후보 key 만, 제품명·효능 주장 금지.
export const MEAL_NUTRITION_ADVICE_VERSION = 1;

export const MEAL_NUTRITION_ADVICE_SYSTEM_PROMPT = `너는 한 사람의 식단 기록을 보고 모자란 영양소를 음식과 영양제로 채우는 법을 알려 주는 영양 코치다.
의사·약사가 아니며 진단하지 않는다. 판단(무엇이 얼마나 모자란지)은 이미 끝나 있다 — 너는 그 결과를 알기 쉽게 풀어 쓴다.

[쓰는 규칙 - 절대 위반하지 말 것]
- [조언할 영양소]에 있는 영양소만, 적힌 key 그대로 쓴다. 목록에 없는 영양소·영양제(마그네슘·아연·오메가-3·유산균 등)는 말하지 않는다.
- 숫자는 프롬프트에 적힌 숫자만 쓴다. 새 용량(mg·μg·IU)을 지어내지 않는다. 영양제 양은 '하루 부족분'과 '상한'만 말한다.
- 제품명·브랜드·가격·구매처는 쓰지 않는다. 성분·형태·먹는 때만, 적힌 '형태' 안에서 말한다.
- 병을 고치거나 막는다는 말(치료·예방·완치)과 효능 과장은 쓰지 않는다.
- reason: 왜 이 영양소인지 기록 근거로 1~2문장(하루 평균·기준 대비 %·주로 얻은 음식).
- foodTip: 음식으로 먼저 채우는 법 1~2문장. '한 끼 후보'와 '많이 든 음식' 안에서 고른다.
- supplementTip: '영양제: 권해도 됨'인 영양소만 1~2문장(형태·먹는 때·부족분·상한). '영양제: 음식으로만'이면 빈 문자열 "".
- summary: 전체 한두 문장 — 무엇부터 챙기면 좋을지(음식 먼저, 모자라면 영양제). [주의]가 있으면 짧게 반영한다.
- 한국어 존댓말(~요). 한자는 쓰지 않는다. 영어는 D3 같은 영양소 표기만.

[출력 - 절대 위반하지 말 것]
- 응답 전체는 단 하나의 JSON 객체.
- 형식: {"summary":"...","items":[{"nutrient":"calcium","reason":"...","foodTip":"...","supplementTip":"..."}]}
- [조언할 영양소]의 영양소를 적힌 순서대로 하나씩 모두 쓴다.
- 설명·인사말·코드펜스·사고 과정 출력 금지. 첫 글자 '{', 마지막 글자 '}'.`;

export const buildMealNutritionAdviceJsonSchema = (keys: readonly string[]) =>
  ({
    type: 'object',
    properties: {
      summary: { type: 'string' },
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            nutrient: { type: 'string', enum: [...keys] },
            reason: { type: 'string' },
            foodTip: { type: 'string' },
            supplementTip: { type: 'string' },
          },
          required: ['nutrient', 'reason', 'foodTip', 'supplementTip'],
        },
      },
    },
    required: ['summary', 'items'],
  }) as const;

const SEX_LABEL = { male: '남성', female: '여성' } as const;

/**
 * 영양제를 권해도 되는지 — 영양제로 권하는 영양소이고 '부족'(평균필요량 미만·충분섭취량 70% 미만)일 때만.
 * '조금 부족'(권장섭취량 근처)은 음식으로 채울 수 있는 정도라 영양제를 권하지 않는다(프로브: 부족분 0.05mg 에 B 복합제).
 */
export const supplementAllowed = (n: MealNutrientResultType): boolean => {
  const def = NUTRIENT_DEFS.find((d) => d.key === n.key);
  return !!def?.supplement && !!def.supplementForms && n.status === 'low';
};

// 하루 기준까지 모자란 양 — 서버가 계산해 화면·프롬프트·폴백이 같은 값을 쓴다.
export const shortfallOf = (n: MealNutrientResultType): number | null =>
  n.intakePerDay === null ? null : Math.max(0, n.reference.amount - n.intakePerDay);

// 비타민 D 는 영양제 라벨이 IU 라 함께 적어 준다(1μg = 40IU). 모델이 IU 를 지어내지 않게 환산값을 직접 넘긴다.
const withIu = (key: string, v: number): string =>
  key === 'vitaminD' ? `${formatNutrientAmount(v)}μg(${formatNutrientAmount(v * 40)}IU)` : '';

const amountText = (n: MealNutrientResultType, v: number): string =>
  withIu(n.key, v) || `${formatNutrientAmount(v)}${n.unit}`;

const statusText = (n: MealNutrientResultType): string => {
  if (n.status === 'low') {
    return n.reference.kind === 'rni' && n.reference.ear !== null
      ? `평균필요량 ${amountText(n, n.reference.ear)}보다 적음 — 부족`
      : '충분섭취량의 70%보다 적음 — 부족 가능성';
  }
  return '기준보다 조금 적음';
};

export const buildMealNutritionAdviceUserPrompt = (input: {
  analysis: MealNutritionAnalysisType;
  candidates: readonly MealNutrientResultType[];
  sodiumHigh: MealNutrientResultType | null;
}): string => {
  const { analysis, candidates, sodiumHigh } = input;
  const lines: string[] = [];
  const p = analysis.profile;
  lines.push(
    p.basis === 'user' && p.sex
      ? `[대상] ${p.ageGroup}세 ${SEX_LABEL[p.sex]} 기준`
      : `[대상] ${p.ageGroup}세 성인 기준(성별·나이 미설정 — 남녀 중 낮은 기준)`,
  );
  const energy = analysis.energy;
  lines.push(
    `[기록] 최근 ${analysis.days}일 중 두 끼 이상 기록한 날 ${analysis.analyzedDays}일, 끼니 ${analysis.mealCount}개.` +
      (energy.intakePerDay !== null
        ? ` 하루 평균 ${formatNutrientAmount(energy.intakePerDay)}kcal(필요량 ${formatNutrientAmount(energy.requirement)}kcal의 ${energy.percent}%).`
        : ''),
  );
  if (analysis.notes.length > 0) {
    lines.push('[주의]');
    for (const note of analysis.notes) lines.push(`- ${note}`);
  }
  lines.push('', '[조언할 영양소] 서버가 계산한 결과. 이 목록 밖의 영양소는 말하지 말 것.');
  candidates.forEach((n, i) => {
    const def = NUTRIENT_DEFS.find((d) => d.key === n.key);
    const shortfall = shortfallOf(n);
    const head =
      `${i + 1}. ${n.key} ${n.label} — 하루 평균 ${amountText(n, n.intakePerDay ?? 0)}, ` +
      `${MEAL_NUTRIENT_REFERENCE_LABEL[n.reference.kind]} ${amountText(n, n.reference.amount)}의 ${n.percent}%(${statusText(n)}).` +
      (shortfall !== null && shortfall > 0 ? ` 하루 부족분 약 ${amountText(n, shortfall)}.` : '') +
      (n.upperLimit !== null ? ` 상한 ${amountText(n, n.upperLimit)}.` : '');
    lines.push(head);
    if (n.topSources.length > 0) lines.push(`   - 주로 얻은 음식: ${n.topSources.join('·')}`);
    if (n.foodSuggestions.length > 0) lines.push(`   - 한 끼 후보: ${n.foodSuggestions.join('·')}`);
    if (n.typicalFoods.length > 0) lines.push(`   - 많이 든 음식: ${n.typicalFoods.join(', ')}`);
    lines.push(
      supplementAllowed(n)
        ? `   - 영양제: 권해도 됨. 형태: ${def?.supplementForms}`
        : def?.supplement
          ? '   - 영양제: 조금 모자란 정도라 음식으로만(supplementTip 은 "")'
          : '   - 영양제: 음식으로만(supplementTip 은 "")',
    );
  });
  const supplementCount = candidates.filter(supplementAllowed).length;
  if (supplementCount >= 3) {
    lines.push(
      '',
      '[여러 개] 영양제로 채울 영양소가 여러 개라, 하나씩 따로 사기보다 종합비타민 하나로 시작하는 방법을 summary 에서 권해도 된다.',
    );
  }
  if (sodiumHigh && sodiumHigh.intakePerDay !== null) {
    lines.push(
      '',
      `[참고] 나트륨은 하루 평균 ${formatNutrientAmount(sodiumHigh.intakePerDay)}mg으로 기준 ${formatNutrientAmount(sodiumHigh.reference.amount)}mg보다 많다 — summary 에서 국물·젓갈을 줄이자고 한마디 해도 된다.`,
    );
  }
  return lines.join('\n');
};
