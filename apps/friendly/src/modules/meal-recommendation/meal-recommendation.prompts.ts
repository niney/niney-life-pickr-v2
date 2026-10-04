import { MEAL_SLOT_LABEL, MEAL_TYPE_LABEL } from '@repo/utils';
import {
  MEAL_ALLERGEN_LABEL,
  type MealAllergenType,
  type MealSlotType,
  type MealTypeType,
  type MealWeightsType,
} from '@repo/api-contract';
import { focusWeightKeys, summaryDishLabel, type ScoredCandidate } from './meal-pattern.service.js';

// 다음 끼니 추천 프롬프트(purpose meal-recommend, 텍스트).
//
// MEAL_RECOMMENDATION_VERSION 변경 시 이전 추천이 stale(MealRecommendation.promptVersion 으로 남는다).
// v1: 최초 — 후보 풀 안에서만 고르게 하고 이유를 붙인다.
// v2: 절대 제외와 덜 선호를 분리하고, 덜 선호 후보는 대안이 부족할 때만 고른다.
// v3: 알레르기도 알린다 — 후보 풀이 이미 거르지만(이름·재료), 이유 문장이 알레르기와 어긋나지 않게.
//     가장 높은 중요도(4 이상)를 "이번 추천의 중심"으로 구체적으로 적는다 — 숫자만 주면 '가볍게·건강'에도
//     튀김을 골랐다(2026-10-04 설정 점검).
// v4: 반찬·안주·간식은 혼자 권하지 않는다 — 후보가 흔한 한 끼 목록 먼저로 바뀌었지만 내 기록에서 온 반찬(콩조림 등)이
//     후보에 남을 수 있다(2026-10-04 '실용적인 추천' 요청). "흔히 먹는 메뉴를 우선"까지 적으면 '내 취향대로'에서도
//     먹던 음식 대신 새 메뉴를 골라(먹던 음식 비율 78% → 42%) 반찬 금지만 남겼다. 건강 중심 힌트에 '전'을 넣었다
//     (메모 '가볍게'에 김치전).
// v5: '안 드셨다'의 근거 — 틀린 이유 9/64 가 모두 먹은 조리형태를 안 먹었다고 한 것이었다(찌개 네 번 먹은 사람에게
//     "90일 동안 국물 요리를 전혀"). 프로필 요약이 축마다 상위 3개만 보여 줬고, 균형 태그가 먹은 조리형태에도 붙었고,
//     이유 예시가 바로 "2주 동안 국물 음식을 안 드셨어요"였다. 요약에 2주 분포 전체(개수)와 안 먹은 조리형태·주재료를
//     주고, 안 먹었다는 말은 그 줄·태그에 있는 것만 쓰게 하고, 예시를 부재 주장이 아닌 것으로 바꿨다. 후보 줄마다
//     그 조리형태를 2주에 몇 번 먹었는지('볶음 2주 3번')도 붙인다 — 태그 '2주간 안 먹은 해산물'을 오징어볶음의
//     볶음까지 넓혀 "볶음 형태가 없다"고 썼다(붙인 뒤 72회: 틀린 주장 3/70 → 3/91, 세트 안 조리형태 겹침 7% → 2%).
//
// 설계 근거(docs/PLAN-meal.md 결정 E):
//  - 원시 기록을 주지 않는다. 서버가 집계한 프로필 요약 + 코드가 점수를 매긴 후보 풀만 넘긴다.
//  - LLM 은 "고르고 설명하는" 역할이다. 후보 밖 이름은 서버가 버린다 — 없는 음식을 추천하면
//    사용자가 검색해도 안 나오고 통계도 안 잡힌다.
//  - 건강보다 "패턴 분석 → 겹치지 않게·골고루 + 취향"이 기본 목표라는 걸 프롬프트에 명시한다.
export const MEAL_RECOMMENDATION_VERSION = 5;

export const MEAL_RECOMMENDATION_SYSTEM_PROMPT = `너는 한 사람의 식사 기록을 보고 다음 끼니를 골라 주는 도우미다.

[목표 — 우선순위대로]
1. 최근에 먹은 것과 겹치지 않게.
2. 그 사람이 실제로 좋아하는 쪽으로(자주 먹는 음식·좋아요 표시).
3. 최근 분포에서 부족한 쪽을 채워 골고루.
4. 사용자가 정한 중요도(가중치)를 반영. 가중치가 큰 항목을 더 강하게 반영한다.
건강은 사용자가 중요도를 높게 잡았을 때만 강조한다. 훈계하지 말 것.

[고르는 규칙 - 절대 위반하지 말 것]
- **반드시 주어진 후보 목록 안에서만** 고른다. 목록에 없는 음식 이름을 만들어 내면 안 된다.
- 이름은 후보에 적힌 그대로 쓴다(띄어쓰기까지).
- "가능하면 피할 것"과 "가능하면 피함" 후보는 충분한 대안이 있으면 고르지 않는다. 절대 금지는 아니다.
- 반찬·안주·간식(조림·무침·나물·전·떡 등)은 그것만으로 한 끼가 되기 어려우면 고르지 않는다.
- 3~5개를 고르고, 서로 성격이 겹치지 않게 한다(같은 조리형태·같은 주재료로 몰지 말 것).
- 각 항목마다 왜 지금 이걸 권하는지 1~2문장. 기록에 근거해 구체적으로("요즘 면 요리를 많이 드셔서 밥 요리로 균형을 맞춰요").
- 없는 사실을 지어내지 말 것. 기록이 적으면 "아직 기록이 적어 취향을 배우는 중"이라고 솔직하게 쓴다.
- 안 드셨다·없었다고 쓸 땐 [내 식사 패턴]의 '안 먹은' 줄이나 후보 태그에 있는 것만, 그 기간(2주) 그대로 쓴다. 개수가 적힌 조리형태·주재료는 적게 드셨다고 할 수는 있어도 안 드셨다고 하지 않는다.
- 마지막에 한 줄 총평(summary)을 쓴다.

[출력 - 절대 위반하지 말 것]
- 응답 전체는 단 하나의 JSON 객체.
- 형식: {"items":[{"name":"김치찌개","reason":"..."}],"summary":"..."}
- 설명·인사말·코드펜스·사고 과정 출력 금지. 첫 글자 '{', 마지막 글자 '}'.`;

export const MEAL_RECOMMENDATION_JSON_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: { name: { type: 'string' }, reason: { type: 'string' } },
        required: ['name', 'reason'],
      },
    },
    summary: { type: 'string' },
  },
  required: ['items', 'summary'],
} as const;

const WEIGHT_LABEL: Record<keyof MealWeightsType, string> = {
  variety: '겹침 피하기',
  taste: '내 취향',
  balance: '골고루',
  health: '건강',
  novelty: '새로운 시도',
  weather: '날씨·계절',
  convenience: '간편함',
};

// 중심 항목을 LLM 이 바로 쓸 수 있는 고르는 기준으로.
const WEIGHT_FOCUS_HINT: Record<keyof MealWeightsType, string> = {
  variety: '최근 먹은 음식·분류와 겹치지 않게',
  taste: '자주 먹고 좋아한 음식 쪽으로',
  balance: "최근 적게 먹은 조리형태·주재료를 채우는 쪽으로(후보 태그 '2주간 안 먹은 …')",
  health: '튀김·전·빵·고열량·짠 음식은 피하고 채소·단백질·가벼운 쪽으로',
  novelty: '먹은 적 없는 음식 위주로',
  weather: '오늘 날씨·계절에 맞게',
  convenience: '준비·주문이 간편한 쪽으로',
};

export interface RecommendationPromptInput {
  profileText: string;
  candidates: ScoredCandidate[];
  targetSlot: MealSlotType;
  targetDate: string;
  mealType: MealTypeType | null;
  weights: MealWeightsType;
  excludedFoods: string[];
  dislikedFoods: string[];
  allergens: MealAllergenType[];
  note: string | null;
  // 기록이 거의 없을 때 — 콜드 스타트 문구를 다르게 쓴다.
  entryCount: number;
  // 최근 2주 조리형태별 주메뉴 수(recentDishTypeCounts) — 후보 줄마다 그 조리형태를 몇 번 먹었는지 붙인다.
  recentDishCounts?: Record<string, number> | null;
}

export const buildMealRecommendationUserPrompt = (input: RecommendationPromptInput): string => {
  const lines: string[] = [];
  lines.push(`언제: ${input.targetDate} ${MEAL_SLOT_LABEL[input.targetSlot]}`);
  if (input.mealType) lines.push(`상황: ${MEAL_TYPE_LABEL[input.mealType]}`);
  if (input.note) lines.push(`사용자 요청: ${input.note}`);
  lines.push('');
  lines.push('[중요도] (0~5, 클수록 중요)');
  lines.push(
    (Object.keys(WEIGHT_LABEL) as (keyof MealWeightsType)[])
      .map((k) => `${WEIGHT_LABEL[k]} ${input.weights[k]}`)
      .join(' / '),
  );
  const focus = focusWeightKeys(input.weights);
  if (focus.length > 0) {
    lines.push(
      `[이번 추천의 중심] ${focus.map((k) => `${WEIGHT_LABEL[k]} — ${WEIGHT_FOCUS_HINT[k]}`).join(' / ')}`,
    );
  }
  if (input.allergens.length > 0) {
    lines.push(
      `[알레르기 — 이 재료가 든 음식은 절대 고르지 말 것] ${input.allergens.map((a) => MEAL_ALLERGEN_LABEL[a]).join(', ')}`,
    );
  }
  if (input.excludedFoods.length > 0)
    lines.push(`[못 먹는 것 — 절대 제외] ${input.excludedFoods.join(', ')}`);
  if (input.dislikedFoods.length > 0)
    lines.push(`[가능하면 피할 것] ${input.dislikedFoods.join(', ')}`);
  lines.push('');
  lines.push('[내 식사 패턴]');
  lines.push(input.entryCount === 0 ? '기록이 아직 없습니다.' : input.profileText);
  lines.push('');
  const counts = input.recentDishCounts ?? null;
  lines.push(
    `[후보 목록] — 이 안에서만 고른다. score 는 서버가 계산한 적합도(높을수록 적합).${counts ? " '볶음 2주 3번'은 그 조리형태를 최근 2주에 먹은 횟수." : ''}`,
  );
  for (const c of input.candidates) {
    const parts = [`- ${c.name}`, `score ${c.score.toFixed(2)}`];
    if (c.lastEatenDate) parts.push(`마지막 ${c.lastEatenDate}`);
    else parts.push('먹은 적 없음');
    if (counts && c.dishType)
      parts.push(`${summaryDishLabel(c.dishType)} 2주 ${counts[c.dishType] ?? 0}번`);
    if (c.tags.length > 0) parts.push(c.tags.join('/'));
    lines.push(parts.join(' | '));
  }
  lines.push('');
  lines.push('위 스키마의 JSON 객체로만 답하라.');
  return lines.join('\n');
};

// 폴백(LLM 미설정·실패) 문구 — 점수 상위 후보에 붙일 템플릿 이유.
export const fallbackReason = (c: ScoredCandidate): string => {
  if (c.tags.length > 0) return `${c.tags.join(', ')} — 지금 먹기 좋아요.`;
  if (c.lastEatenDate === null) return '아직 안 드셔 본 음식이에요.';
  return '최근 식단과 겹치지 않아요.';
};
