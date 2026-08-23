import { MEAL_SLOT_LABEL, MEAL_TYPE_LABEL } from '@repo/utils';
import type { MealSlotType, MealTypeType, MealWeightsType } from '@repo/api-contract';
import type { ScoredCandidate } from './meal-pattern.service.js';

// 다음 끼니 추천 프롬프트(purpose meal-recommend, 텍스트).
//
// MEAL_RECOMMENDATION_VERSION 변경 시 이전 추천이 stale(MealRecommendation.promptVersion 으로 남는다).
// v1: 최초 — 후보 풀 안에서만 고르게 하고 이유를 붙인다.
// v2: 절대 제외와 덜 선호를 분리하고, 덜 선호 후보는 대안이 부족할 때만 고른다.
//
// 설계 근거(docs/PLAN-meal.md 결정 E):
//  - 원시 기록을 주지 않는다. 서버가 집계한 프로필 요약 + 코드가 점수를 매긴 후보 풀만 넘긴다.
//  - LLM 은 "고르고 설명하는" 역할이다. 후보 밖 이름은 서버가 버린다 — 없는 음식을 추천하면
//    사용자가 검색해도 안 나오고 통계도 안 잡힌다.
//  - 건강보다 "패턴 분석 → 겹치지 않게·골고루 + 취향"이 기본 목표라는 걸 프롬프트에 명시한다.
export const MEAL_RECOMMENDATION_VERSION = 2;

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
- 3~5개를 고르고, 서로 성격이 겹치지 않게 한다(같은 조리형태·같은 주재료로 몰지 말 것).
- 각 항목마다 왜 지금 이걸 권하는지 1~2문장. 기록에 근거해 구체적으로("2주 동안 국물 음식을 안 드셨어요").
- 없는 사실을 지어내지 말 것. 기록이 적으면 "아직 기록이 적어 취향을 배우는 중"이라고 솔직하게 쓴다.
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

export interface RecommendationPromptInput {
  profileText: string;
  candidates: ScoredCandidate[];
  targetSlot: MealSlotType;
  targetDate: string;
  mealType: MealTypeType | null;
  weights: MealWeightsType;
  excludedFoods: string[];
  dislikedFoods: string[];
  note: string | null;
  // 기록이 거의 없을 때 — 콜드 스타트 문구를 다르게 쓴다.
  entryCount: number;
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
  if (input.excludedFoods.length > 0) lines.push(`[못 먹는 것 — 절대 제외] ${input.excludedFoods.join(', ')}`);
  if (input.dislikedFoods.length > 0) lines.push(`[가능하면 피할 것] ${input.dislikedFoods.join(', ')}`);
  lines.push('');
  lines.push('[내 식사 패턴]');
  lines.push(input.entryCount === 0 ? '기록이 아직 없습니다.' : input.profileText);
  lines.push('');
  lines.push('[후보 목록] — 이 안에서만 고른다. score 는 서버가 계산한 적합도(높을수록 적합).');
  for (const c of input.candidates) {
    const parts = [`- ${c.name}`, `score ${c.score.toFixed(2)}`];
    if (c.lastEatenDate) parts.push(`마지막 ${c.lastEatenDate}`);
    else parts.push('먹은 적 없음');
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
