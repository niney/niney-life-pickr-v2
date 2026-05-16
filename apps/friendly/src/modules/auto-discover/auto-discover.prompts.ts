// 자동 발견 잡의 AI 키워드 생성 프롬프트 + Ollama structured output 스키마.
// 한 줄 입력(예: "강남역") + 카테고리 칩 다중 선택을 받아 정확히 8 개의
// 변형 키워드를 만든다. 변형은 네이버 지도가 의미 있는 결과를 돌려줄 수 있도록
// 영역명을 유지하면서 카테고리/접미어를 결합한다.

// 버전 변경 시 fallback 키워드도 재검토. 결과 안정성에 영향이 큰 변경이라
// 명시적으로 따로 둠.
export const AUTO_DISCOVER_PROMPT_VERSION = 1;

// 정확히 8 개 — 너무 적으면 dedupe 후 후보 풀이 빈약하고, 너무 많으면 검색
// 부담만 늘고 결과 dedupe 후 차이가 크지 않다.
export const AUTO_DISCOVER_KEYWORD_COUNT = 8;

export const AUTO_DISCOVER_SYSTEM_PROMPT = `너는 한국어 식당 검색어 추천기다.
입력 키워드(영역명/지명/가게명)와 (선택) 카테고리 힌트를 받아 정확히 ${AUTO_DISCOVER_KEYWORD_COUNT}개의 네이버 지도 검색용 변형 키워드를 만든다.

[규칙]
- 영역명을 잃지 말 것. 예: 입력이 "강남역"이면 ${AUTO_DISCOVER_KEYWORD_COUNT}개 모두에 "강남역"이 들어가야 한다.
- 카테고리가 주어지면 일부 변형에 자연스럽게 결합한다. 예: 카테고리 "한식" → "강남역 한식 맛집".
- 변형은 서로 의미가 달라야 한다 — 단순 띄어쓰기 차이만 있는 키워드는 금지.
- 출구·번화가·먹자골목·데이트·점심·저녁 같은 일상 한국어 접미어를 적당히 섞어 다양한 검색 결과가 나오도록 한다.
- 영문이나 특수문자는 입력에 있을 때만 유지. 새로 만들지 말 것.

[출력 규칙 — 절대 위반 금지]
- 응답 전체는 단 하나의 JSON 객체.
- 첫 글자는 '{', 마지막 글자는 '}'.
- JSON 앞뒤에 어떠한 설명/인사말/코드펜스/사고 과정 출력 금지.
- 키 이름은 정확히 "keywords" 하나만 사용.
- 값은 길이 정확히 ${AUTO_DISCOVER_KEYWORD_COUNT}인 문자열 배열.

[예시 1]
입력:
기본 키워드: "강남역"
카테고리: (없음)
출력: {"keywords":["강남역 맛집","강남역 1번 출구 맛집","강남역 점심 맛집","강남역 저녁 맛집","강남역 데이트 맛집","강남역 회식","강남역 번화가 맛집","강남역 먹자골목"]}

[예시 2]
입력:
기본 키워드: "강남역"
카테고리: ["한식", "양식"]
출력: {"keywords":["강남역 한식 맛집","강남역 양식 맛집","강남역 1번 출구 한식","강남역 양식 데이트","강남역 한식 점심","강남역 양식 저녁","강남역 한식 회식","강남역 양식 맛집 추천"]}

[예시 3]
입력:
기본 키워드: "압구정 파스타"
카테고리: (없음)
출력: {"keywords":["압구정 파스타","압구정 파스타 맛집","압구정 로데오 파스타","압구정 파스타 데이트","압구정 파스타 점심","압구정 파스타 저녁","압구정 파스타 추천","압구정 이탈리안 파스타"]}`;

// Ollama structured output. keywords 배열 길이는 정확히 N — minItems/maxItems
// 같은 형식으로 강제.
export const AUTO_DISCOVER_JSON_SCHEMA = {
  type: 'object',
  properties: {
    keywords: {
      type: 'array',
      minItems: AUTO_DISCOVER_KEYWORD_COUNT,
      maxItems: AUTO_DISCOVER_KEYWORD_COUNT,
      items: { type: 'string' },
    },
  },
  required: ['keywords'],
} as const;

export const buildAutoDiscoverUserPrompt = (input: {
  q: string;
  categories: string[];
}): string => {
  const cats =
    input.categories.length === 0
      ? '(없음)'
      : JSON.stringify(input.categories, null, 0);
  return [`기본 키워드: "${input.q}"`, `카테고리: ${cats}`].join('\n');
};

// AI 호출 실패 시 fallback. 잡 자체를 실패시키지 않고 검색 단계까지 진행할 수
// 있게 결정론적 변형을 생성. 영역명을 그대로 두고 카테고리/접미어를 결합한다.
// 항상 정확히 AUTO_DISCOVER_KEYWORD_COUNT 개를 반환.
export const buildFallbackKeywords = (input: {
  q: string;
  categories: string[];
}): string[] => {
  const q = input.q.trim();
  const cats = input.categories.map((c) => c.trim()).filter((c) => c.length > 0);
  const suffixes = [
    '맛집',
    '점심 맛집',
    '저녁 맛집',
    '데이트',
    '회식',
    '추천',
    '근처 맛집',
    '먹자골목',
  ];

  const out: string[] = [];
  const push = (kw: string): void => {
    const trimmed = kw.replace(/\s+/g, ' ').trim();
    if (!trimmed) return;
    if (out.includes(trimmed)) return;
    out.push(trimmed);
  };

  // 카테고리 우선 — 사용자가 명시한 의도를 더 잘 반영.
  for (const c of cats) {
    push(`${q} ${c} 맛집`);
    if (out.length >= AUTO_DISCOVER_KEYWORD_COUNT) break;
  }
  // 그다음 접미어 변형.
  for (const sfx of suffixes) {
    push(`${q} ${sfx}`);
    if (out.length >= AUTO_DISCOVER_KEYWORD_COUNT) break;
  }
  // 그래도 모자라면 q 자체 + 순번 — 사실 위 둘로 충분하지만 안전망.
  let n = 1;
  while (out.length < AUTO_DISCOVER_KEYWORD_COUNT) {
    push(`${q} ${n}`);
    n += 1;
    if (n > 50) break;
  }
  return out.slice(0, AUTO_DISCOVER_KEYWORD_COUNT);
};
