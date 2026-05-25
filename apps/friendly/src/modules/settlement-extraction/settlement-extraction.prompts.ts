// 영수증 추출 프롬프트 + JSON schema. 프롬프트/스키마가 바뀌면 EXTRACTION_VERSION
// 을 올려 추후 재추출/통계에서 식별할 수 있게 한다.
// v2: 차수(N차 회식) 힌트를 user prompt 에 동적으로 주입할 수 있게 확장.
export const EXTRACTION_VERSION = 2;

export const EXTRACTION_SYSTEM_PROMPT = `너는 한국 음식점 영수증에서 메뉴와 가격을 추출하는 비전 모델이다.

[출력 규칙 - 절대 위반하지 말 것]
- 응답 전체는 단 하나의 JSON 객체만 포함한다.
- JSON 앞뒤에 어떠한 설명, 인사말, 코드펜스(\`\`\`), 주석, 사고 과정도 절대 출력하지 않는다.
- 첫 글자는 반드시 '{', 마지막 글자는 반드시 '}'.

[추출 대상]
영수증 이미지에서 다음을 가능한 만큼 추출한다.
- items: 영수증의 각 메뉴 줄. 각 항목은 { name, unitPrice, quantity, amount, category, matchedMenuName }.
  · name: 영수증에 적힌 메뉴명을 그대로 한국어로. 약어/오타는 그대로 두되 명백히 잘리면 가능한 만큼 복원.
  · unitPrice: 단가(원). 영수증에 없으면 null.
  · quantity: 수량. 없으면 null.
  · amount: 라인 합계(원). 없으면 unitPrice * quantity 계산값. 둘 다 없으면 0.
  · category: "ALCOHOL"(주류 — 맥주/소주/와인/막걸리/하이볼/위스키 등 알코올 음료),
              "NON_ALCOHOL"(비주류 — 콜라/사이다/물/음료수/주스/커피 등 무알코올 음료),
              "SIDE"(안주 — 알코올과 함께 먹는 음식·요리 일체),
              "UNCATEGORIZED"(분류 모호) 중 하나.
              한국 술집/식당 영수증 기준 일반적 분류를 사용한다. 식당 메뉴 힌트가 있다면 우선 참고.
  · matchedMenuName: 식당 메뉴 힌트(있을 때) 와 의미상 같은 항목이면 그 힌트의 이름을 그대로. 없거나 모호하면 null.
- totalAmount: 영수증의 총 금액 / 승인금액. 표기가 여러 개면 가장 큰 한 줄(보통 "합계" 또는 "승인금액"). 못 찾으면 null.

[추출이 어려울 때]
- 영수증 한 줄이 읽기 어렵거나 가려져 있으면 무리해서 추측하지 말고 빼라.
- items 가 빈 배열이어도 된다. 그래도 totalAmount 만이라도 채울 수 있으면 채운다.
- 메뉴와 무관한 줄(세금, 봉사료, 카드정보, 매장정보)은 items 에 포함하지 않는다.

[식당 메뉴 힌트]
아래 목록은 이 가게의 등록 메뉴다. 영수증의 줄이 이 목록과 일치 또는 유사하면 matchedMenuName 에 이 표기를 그대로 적는다.
힌트는 참고용이며, 영수증에 없는 항목을 임의로 만들어 추가하지 않는다.`;

// LLM 의 structured output 으로 출력 모양을 토큰 샘플링 단계에서 강제한다.
// matchedMenuName 은 nullable string — Ollama JSON schema 는 ["string", "null"] 형태로
// nullable 을 표현한다.
export const EXTRACTION_JSON_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          unitPrice: { type: ['integer', 'null'] },
          quantity: { type: ['integer', 'null'] },
          amount: { type: 'integer' },
          category: {
            type: 'string',
            enum: ['ALCOHOL', 'NON_ALCOHOL', 'SIDE', 'UNCATEGORIZED'],
          },
          matchedMenuName: { type: ['string', 'null'] },
        },
        required: ['name', 'unitPrice', 'quantity', 'amount', 'category', 'matchedMenuName'],
      },
    },
    totalAmount: { type: ['integer', 'null'] },
  },
  required: ['items', 'totalAmount'],
} as const;

// 사용자 프롬프트 — 식당 메뉴 힌트를 매번 동적으로 주입한다.
// roundHint 가 있으면 "N차 중 K차" 컨텍스트를 추가 — 1차 식당에서 시작해
// 2차로 자리를 옮긴 회식 같은 케이스에서 LLM 이 같은 카테고리 분류를 자연스레
// 유지하도록 돕는다 (예: 2차가 호프집이면 주류·안주가 메인일 가능성 가산).
export const buildExtractionUserPrompt = (input: {
  restaurantName: string;
  menuNames: string[];
  roundHint?: {
    // 1-based — UI 와 일치 (사용자가 '2차 영수증' 이라고 인지하는 그 숫자).
    index: number;
    total: number;
  };
}): string => {
  const lines: string[] = [];
  if (input.roundHint && input.roundHint.total > 1) {
    lines.push(
      `차수: ${input.roundHint.total}차 회식 중 ${input.roundHint.index}차 영수증`,
    );
  }
  lines.push(`식당명: ${input.restaurantName}`);
  if (input.menuNames.length > 0) {
    lines.push('등록 메뉴:');
    for (const m of input.menuNames) lines.push(`- ${m}`);
  } else {
    lines.push('등록 메뉴: (정보 없음 — 영수증만 보고 추출하라)');
  }
  lines.push('');
  lines.push('영수증 이미지를 분석해 위 스키마에 맞는 JSON 객체로 답하라.');
  return lines.join('\n');
};
