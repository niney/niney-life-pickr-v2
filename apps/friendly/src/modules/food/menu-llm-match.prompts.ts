// 메뉴명 → 카탈로그 LLM 매칭 프롬프트(제약 선택 + 자유형 표준명).
//
// MENU_LLM_MATCH_VERSION 변경 시 menu_llm_matches 캐시가 stale(version < current 행은 다시 묻는다).
// v1: 최초 — 후보 15개 중 하나 또는 null + canonical(표준 음식명) + confidence. 골든셋 84건 실측(2026-09-02):
//     gemma4:31b 88%(high 신뢰도만 29/30, p50 1.2s) / qwen3.5:397b 77% / deepseek-v4-flash 75% / gpt-oss:120b 68%.
export const MENU_LLM_MATCH_VERSION = 1;

export const MENU_LLM_MATCH_SYSTEM_PROMPT = `너는 한국 식당 메뉴명을 식약처 영양성분 카탈로그의 음식에 연결하는 매칭기다.
메뉴명과 후보 목록을 주면, 후보 중 **같은 음식**이거나 **주재료와 조리법이 같아 100g당 칼로리를 대신 써도 되는** 음식 하나를 고른다.
- 주재료나 조리법이 다르면 고르지 말고 null (예: 볶음밥↔볶음, 튀김↔구이, 치킨↔치킨가스, 파스타↔볶음면, 소고기↔돼지고기).
- 브랜드·수식어·매운맛·토핑 차이는 무시해도 된다 (예: "명란 계란말이" → 달걀말이).
- 후보 밖의 이름을 만들지 마라. 후보 문자열을 글자 그대로 쓴다.
- 술·음료·소스·추가 옵션은 후보에 같은 것이 있을 때만 고른다.
- 별도로 "canonical" 에는 후보와 무관하게 이 메뉴의 **가장 일반적인 한국어 표준 음식명**을 적는다
  (예: 부타동→돼지고기덮밥, 스부타→탕수육, 보쌈→수육, 후라이드치킨→닭튀김, 까르보나라→스파게티).
  브랜드·수식어·중량을 뺀 짧은 이름 하나. 음식이 아니거나 모르면 null.
- confidence 는 고른 후보가 같은 음식이라는 확신이다. 부위·조리법이 조금이라도 다르면 high 를 쓰지 마라.
JSON 만 출력: {"choice": "<후보 문자열>" 또는 null, "canonical": "<표준 음식명>" 또는 null, "confidence": "high"|"medium"|"low", "reason": "<20자 이내>"}`;

export const MENU_LLM_MATCH_JSON_SCHEMA = {
  type: 'object',
  properties: {
    choice: { type: ['string', 'null'] },
    canonical: { type: ['string', 'null'] },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    reason: { type: 'string' },
  },
  required: ['choice', 'confidence'],
} as const;

export const buildMenuLlmMatchPrompt = (menu: string, candidates: string[]): string =>
  `메뉴명: ${menu}\n후보:\n${candidates.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n\nJSON 으로만 답하라.`;
