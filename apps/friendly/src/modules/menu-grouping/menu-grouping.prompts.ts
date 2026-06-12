// 메뉴 그룹핑 프롬프트 + Ollama structured output 스키마.
// 한 식당의 distinct 메뉴 표기들을 받아서 같은 음식끼리 묶는다.

// MENU_GROUPING_VERSION 변경 시 이전 매핑은 stale.
// v1: 초기 — 전 항목 에코 매핑 + few-shot 3개.
// v2: 출력 계약을 "병합 그룹만, 인덱스로" 로 축소. 전 항목 에코(O(N) 출력)가
//     reasoning 토큰과 maxTokens 를 나눠 쓰다 잘리던 운영 장애(parse_failed)
//     를 구조적으로 제거. canonical 이름은 코드가 결정하므로(최단 표기 →
//     빈도) 프롬프트는 membership 판정만 시킨다.
export const MENU_GROUPING_VERSION = 2;

export const MENU_GROUPING_SYSTEM_PROMPT = `너는 한국 음식점의 메뉴 표기 변형을 그룹화하는 정규화기다.
같은 식당에서 쓰인 메뉴 표기들이 번호 목록으로 들어온다. 같은 음식을 가리키는 표기들의 번호를 묶어서 출력한다.

[그룹화 규칙 - 절대 위반하지 말 것]
- 핵심 재료/조리법/부위가 다르면 → 다른 음식 (묶지 않는다).
  · "차돌박이된장찌개" 와 "된장찌개" → 묶지 않음 (차돌박이가 핵심 재료 차이)
  · "김치볶음밥" 과 "김치찌개" → 묶지 않음 (조리법 다름)
  · "삼겹살" 과 "목살" → 묶지 않음 (부위 다름)
  · "치즈돈까스" 와 "돈까스" → 묶지 않음 (재료 차이가 핵심)
- 띄어쓰기/오타/단순 형용사/사이즈만 차이 → 같은 음식 (묶는다).
  · "김치찌개" / "김치 찌개" / "묵은지김치찌개" → 같은 음식 (묵은지는 김치의 한 종류)
  · "수제 돈까스" 와 "돈까스" → 같은 음식 (수제는 형용사)
  · "치즈돈까스 (소)" 와 "치즈돈까스" → 같은 음식 (사이즈 표기)
- 판단이 애매하면 묶지 않는다 — 잘못 묶이면 통계가 망가진다.

[출력 규칙 - 절대 위반하지 말 것]
- 응답은 {"groups":[[...],[...]]} 형태의 JSON 객체 하나.
- groups 의 각 원소는 같은 음식인 표기들의 번호 배열 (번호 2개 이상).
- 묶을 상대가 없는 표기(대부분이 그렇다)는 출력하지 않는다.
- 같은 번호를 두 묶음에 넣지 않는다.
- 묶을 것이 하나도 없으면 {"groups":[]}.
- JSON 앞뒤에 설명/코드펜스/사고 과정 출력 금지.

[예시]
입력:
식당명: "마포 김치찌개"
카테고리: "한식 > 찌개"
메뉴 목록:
0. 김치찌개
1. 김치 찌개
2. 묵은지 김치찌개
3. 차돌박이된장찌개
4. 된장찌개
5. 공기밥
출력: {"groups":[[0,1,2]]}

입력:
식당명: "정통 일식당"
카테고리: "일식"
메뉴 목록:
0. 연어초밥
1. 연어 초밥
2. 광어초밥
3. 참치초밥(특)
4. 참치초밥
5. 회덮밥
출력: {"groups":[[0,1],[3,4]]}

입력:
식당명: "한촌설렁탕"
카테고리: "한식"
메뉴 목록:
0. 설렁탕
1. 수육
2. 공깃밥
출력: {"groups":[]}`;

// Ollama structured output — 병합 그룹 인덱스 배열만 강제.
// 출력이 수십 토큰 수준이라 reasoning 과 토큰 예산을 다퉈도 잘릴 게 없다.
export const MENU_GROUPING_JSON_SCHEMA = {
  type: 'object',
  properties: {
    groups: {
      type: 'array',
      items: { type: 'array', items: { type: 'integer' } },
    },
  },
  required: ['groups'],
} as const;

// 1단계(청크 내 그룹핑) 한 호출의 입력 메뉴 수 상한. 이 이상이면 유사도
// 패킹으로 분할 — 청크가 갈라놓은 쌍은 대표 머지 라운드가 커버하므로
// v1 처럼 "같은 청크 안에서만 묶인다" 제약이 없다. 작게 잡을수록
// 호출당 reasoning 부담이 줄어 안정적.
export const MENU_GROUPING_CHUNK_SIZE = 30;

// 대표 머지 라운드 한 호출의 대표 수 상한. 대표는 이름만 들어가므로
// 1단계보다 크게 잡아도 입력이 작다 — 이 안에 다 들어가면 한 콜로
// 전 대표가 서로 만나 one-shot 동등 커버리지가 성립한다.
export const MENU_GROUPING_MERGE_CHUNK_SIZE = 60;

export const buildGroupingUserPrompt = (input: {
  restaurantName: string;
  category: string | null;
  variants: string[];
}): string => {
  const lines = [
    `식당명: "${input.restaurantName}"`,
    `카테고리: "${input.category ?? '미지정'}"`,
    '메뉴 목록:',
    ...input.variants.map((v, i) => `${i}. ${v}`),
  ];
  return lines.join('\n');
};
