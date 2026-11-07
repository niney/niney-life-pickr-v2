// 영양 기준 음식 LLM 프롬프트 — 비타민·무기질이 없는 음식 이름에 "영양 구성이 가장 비슷한" 표준 음식 하나를 고른다.
//
// 메뉴 칼로리 LLM 매칭(menu-llm-match.prompts)과 다른 점: 저쪽은 "100g당 열량을 대신 써도 되는" 같은 음식만 고르지만
// 여기서는 열량은 이미 있고(식단 기록의 저장 열량) **열량당 비타민·무기질 구성**만 빌린다. 그래서 주재료와 음식 갈래가
// 같으면 조리법이 조금 달라도 고를 수 있다(우거지탕 → 해장국_우거지가 든 해장국, 돼지등뼈찜 → 감자탕). 반대로 주재료가
// 다르면(소↔돼지, 고기↔채소) 고르지 않는다. 버전을 올리면 저장된 LLM 판정·'없음'을 다시 묻는다(FOOD_NUTRIENT_REF_VERSION).

export const FOOD_NUTRIENT_REF_SYSTEM_PROMPT = `너는 한국 음식 이름에 영양 구성이 가장 비슷한 식약처 표준 음식을 하나 고르는 선택기다.
음식 이름과 후보 목록을 주면, 후보 중 **주재료와 음식 갈래(국·찌개·볶음·구이·튀김·밥·면·반찬 등)가 같아 비타민·무기질 구성을 대신 써도 되는** 음식 하나를 고른다.
- 열량은 따로 있으니 양·크기·1인분은 신경 쓰지 않는다. 같은 재료로 만든 비슷한 음식이면 이름이 달라도 된다 (예: 치킨→닭튀김, 공기밥→쌀밥, 우거지탕→해장국, 돼지등뼈찜→감자탕, 계란말이→달걀말이).
- 주재료가 다르면 고르지 말고 null (예: 소고기↔돼지고기, 고기↔해물, 채소 반찬↔고기 요리, 밥↔면).
- 양념·소스·조미료·음료·술처럼 음식이 아니거나 영양을 말하기 어려운 이름은 null.
- 후보 밖의 이름을 만들지 마라. 후보 문자열을 글자 그대로 쓴다.
- confidence 는 고른 후보로 비타민·무기질을 짐작해도 되는지에 대한 확신이다. 주재료가 확실히 같을 때만 high.
JSON 만 출력: {"choice": "<후보 문자열>" 또는 null, "confidence": "high"|"medium"|"low", "reason": "<20자 이내>"}`;

export const FOOD_NUTRIENT_REF_JSON_SCHEMA = {
  type: 'object',
  properties: {
    choice: { type: ['string', 'null'] },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    reason: { type: 'string' },
  },
  required: ['choice', 'confidence'],
} as const;

export const buildFoodNutrientRefPrompt = (name: string, candidates: string[]): string =>
  `음식 이름: ${name}\n후보:\n${candidates.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n\nJSON 으로만 답하라.`;
