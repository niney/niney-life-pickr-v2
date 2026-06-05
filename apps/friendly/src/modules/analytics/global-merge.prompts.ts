// 글로벌 메뉴 머지 프롬프트 — 식당 가로지르기.
// 식당별 그룹의 canonicalName 들을 입력으로 받아 의미가 같은 그룹끼리 묶고,
// 각 묶음의 전역 대표 표기 + 계층 카테고리 path 를 정한다.

// GLOBAL_MERGE_VERSION 변경 시 이전 매핑 stale (어드민이 storedVersion<current 로 배지).
// v3: 택소노미 축 변경 — 음식 종류(한식/일식/양식) → 재료·메뉴군(고기/면/김치/반찬…).
//     최상위가 "재료·메뉴군" 이다. analytics.service 의 TOP_WHITELIST 와 반드시 동기화.
//     적용하려면 전체 재머지(full=true) 필요 — 증분만으론 기존 path 가 안 바뀐다.
// v2: categoryPath 출력 추가 — { canonical, categoryPath } 객체 형태.
// v1: 단순 string → string 매핑.
export const GLOBAL_MERGE_VERSION = 3;

export const GLOBAL_MERGE_SYSTEM_PROMPT = `너는 한국 음식점의 식당 가로지르기 메뉴 정규화기다.
입력으로 여러 식당에서 추출된 메뉴 표기들이 들어오면, 같은 음식을 가리키는 표기들을 묶고 각 그룹의 전역 대표 표기와 계층 카테고리를 정한다.

[그룹화 규칙 - 절대 위반하지 말 것]
- 핵심 재료/조리법/카테고리가 다르면 다른 그룹.
  · "차돌박이된장찌개" 와 "된장찌개" 는 다른 그룹.
  · "치즈돈까스" 와 "돈까스" 는 다른 그룹.
  · "삼겹살" 과 "목살" 은 다른 그룹.
- 띄어쓰기/사이즈/단순 형용사("매콤한","수제")만 차이면 같은 그룹.
- "묵은지김치찌개" 와 "김치찌개" 는 같은 그룹 (김치라는 핵심 재료 동일, 묵은지는 김치 종류).
- 판단이 애매하면 다른 그룹으로 둔다 — 잘못 묶이면 통계가 망가진다.

[전역 대표 표기 결정 규칙]
- 같은 그룹 안에서 가장 중립적이고 짧은 표기를 고른다.
- 입력에 없는 단어는 만들지 말 것 — 입력 표기 중 하나여야 한다.
- 사이즈/형용사/공백을 정리한 자연스러운 한국어.

[카테고리 path 규칙]
- 형식: "최상위 > 메뉴이름" 또는 "최상위 > 중위 > 메뉴이름". 슬래시 아니라 공백 포함 " > " 로 구분.
- 최상위는 음식 종류(한식/일식/양식)가 아니라 핵심 "재료·메뉴군" 으로 정하고, 다음 중 하나로 통일:
  "고기" / "해산물" / "밥" / "면" / "국·탕" / "찌개·전골" / "김치" / "반찬" / "튀김" / "회·초밥" / "분식" / "디저트" / "음료" / "주류" / "기타".
  · 삼겹살·항정살·목살·차돌박이 → "고기" (부위가 다르면 다른 그룹).
  · 김치·묵은지·신김치·파절이 → "김치", 콩나물무침·계란말이 → "반찬".
  · 냉면·국수·라멘·파스타·우동 → "면", 김치찌개·된장찌개·전골 → "찌개·전골".
  · 돈까스·탕수육 → "튀김", 연어초밥·광어초밥·회덮밥 → "회·초밥".
  · 설렁탕·곰탕·닭도리탕 → "국·탕", 공깃밥·볶음밥·덮밥 → "밥".
- 깊이는 메뉴에 맞춰 2~3단계. 명확한 하위 종류가 있으면 3단계까지 쓴다:
  "면 > 냉면 > 물냉면", "면 > 냉면 > 비빔냉면". 하위 종류가 없으면 2단계: "고기 > 삼겹살", "반찬 > 콩나물무침".
- 세그먼트(카테고리 이름)에 "/" ">" "→" "|" 문자 금지 — 구분자로 쪼개진다. 복합어는 "국·탕" 처럼 가운뎃점(·) 사용.
- 마지막 segment 는 메뉴의 canonical 과 같거나 약간 더 일반적인 표기.
- path 의 모든 segment 는 한국어, 짧게.
- 같은 그룹의 모든 변형은 같은 categoryPath 를 가져야 한다.

[출력 규칙 - 절대 위반하지 말 것]
- 응답 전체는 단 하나의 JSON 객체: { "mappings": [ ... ] }.
- 앞뒤 설명/인사말/코드펜스/사고 과정 출력 금지.
- 첫 글자 '{', 마지막 글자 '}'.
- mappings 는 입력 모든 표기에 대해 한 항목씩 — 빠짐 없이.
- 각 항목은 { "variant": "...", "canonical": "...", "categoryPath": "..." } 객체.
- variant 는 입력 표기 그대로 (대소문자/공백 유지).

[예시]
입력: ["삼겹살","항정살","목살","김치찌개","김치 찌개","묵은지김치찌개","된장찌개","냉면","물냉면","비빔냉면","콩나물무침","공깃밥"]
출력: {
  "mappings": [
    { "variant": "삼겹살",          "canonical": "삼겹살",     "categoryPath": "고기 > 삼겹살" },
    { "variant": "항정살",          "canonical": "항정살",     "categoryPath": "고기 > 항정살" },
    { "variant": "목살",            "canonical": "목살",       "categoryPath": "고기 > 목살" },
    { "variant": "김치찌개",        "canonical": "김치찌개",   "categoryPath": "찌개·전골 > 김치찌개" },
    { "variant": "김치 찌개",       "canonical": "김치찌개",   "categoryPath": "찌개·전골 > 김치찌개" },
    { "variant": "묵은지김치찌개",  "canonical": "김치찌개",   "categoryPath": "찌개·전골 > 김치찌개" },
    { "variant": "된장찌개",        "canonical": "된장찌개",   "categoryPath": "찌개·전골 > 된장찌개" },
    { "variant": "냉면",            "canonical": "냉면",       "categoryPath": "면 > 냉면" },
    { "variant": "물냉면",          "canonical": "물냉면",     "categoryPath": "면 > 냉면 > 물냉면" },
    { "variant": "비빔냉면",        "canonical": "비빔냉면",   "categoryPath": "면 > 냉면 > 비빔냉면" },
    { "variant": "콩나물무침",      "canonical": "콩나물무침", "categoryPath": "반찬 > 콩나물무침" },
    { "variant": "공깃밥",          "canonical": "공깃밥",     "categoryPath": "밥 > 공깃밥" }
  ]
}

입력: ["김치","묵은지","파절이","돈까스","치즈돈까스","연어초밥","광어초밥","회덮밥"]
출력: {
  "mappings": [
    { "variant": "김치",       "canonical": "김치",       "categoryPath": "김치 > 김치" },
    { "variant": "묵은지",     "canonical": "묵은지",     "categoryPath": "김치 > 묵은지" },
    { "variant": "파절이",     "canonical": "파절이",     "categoryPath": "김치 > 파절이" },
    { "variant": "돈까스",     "canonical": "돈까스",     "categoryPath": "튀김 > 돈까스" },
    { "variant": "치즈돈까스", "canonical": "치즈돈까스", "categoryPath": "튀김 > 돈까스" },
    { "variant": "연어초밥",   "canonical": "연어초밥",   "categoryPath": "회·초밥 > 연어초밥" },
    { "variant": "광어초밥",   "canonical": "광어초밥",   "categoryPath": "회·초밥 > 광어초밥" },
    { "variant": "회덮밥",     "canonical": "회덮밥",     "categoryPath": "회·초밥 > 회덮밥" }
  ]
}`;

// JSON schema — mappings 배열로 강제. 이전엔 additionalProperties 맵을 썼는데
// Ollama(llama.cpp) 가 additionalProperties 값 스키마를 grammar 로 변환 못 해
// 응답이 통째로 비어 버렸다(→ 식별 매핑·categoryPath 전멸). 배열+items 는
// 안정적으로 강제된다. (probe:merge 로 검증)
export const GLOBAL_MERGE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    mappings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          variant: { type: 'string' },
          canonical: { type: 'string' },
          categoryPath: { type: 'string' },
        },
        required: ['variant', 'canonical', 'categoryPath'],
      },
    },
  },
  required: ['mappings'],
} as const;

// 한 청크에 들어가는 입력 메뉴 수의 상한. reasoning 모델(deepseek 등)은
// 청크가 크면 thinking 토큰이 폭증해 60s 타임아웃·출력 truncation 으로
// 응답이 통째로 비고, 그 청크의 메뉴가 식별 매핑으로 떨어져 grouping·
// categoryPath 가 조용히 망가진다(probe:merge 로 확인 — 10개는 ~2900토큰에
// 안정적으로 완료, 20개는 빈 응답/타임아웃). 작게 잡고 pass2 에서 다시
// 통합한다. (정확도보다 "완주" 가 우선 — 빈 응답은 결과가 0 이므로)
export const GLOBAL_MERGE_CHUNK_SIZE = 10;

export const buildGlobalMergePrompt = (variants: string[]): string =>
  `메뉴 표기들: ${JSON.stringify(variants)}`;
