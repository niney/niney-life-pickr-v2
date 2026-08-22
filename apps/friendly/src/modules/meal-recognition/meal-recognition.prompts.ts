// 식단 사진 → 음식 인식 프롬프트(purpose meal-photo, 비전).
//
// MEAL_RECOGNITION_VERSION 변경 시 이전 인식 결과가 stale(MealEntry.recognitionJson 의 version
// 으로 남아 품질 비교에 쓴다).
// v1: 최초 — 한국어 정식 명칭 + 후보 배열 + 주식/반찬 분리 + 서수 양.
// v2: 후보(candidates)를 사실상 강제 — v1 은 모델이 1순위만 주는 일이 많아 사용자가 고칠 거리가
//     없었다(실측 8장: 후보 포함율이 top-1 과 같았다). 국물·절임처럼 겉모습이 겹치는 군은
//     "재료가 안 보이면 후보를 더 내라"고 못박는다.
//
// 설계 근거(리서치 2026-08-22):
//  - Ollama Cloud 는 아직 structured outputs(format 스키마)를 강제하지 않는다 → 스키마를
//    프롬프트에 그대로 박고, 서버가 zod 로 다시 검증한다(+수리 재시도 1회).
//  - 질량(g) 추정은 공개 VLM 전반이 크게 틀린다(OmniFood-Bench MAPE 50~400%) → 서수 3단계만.
//  - 모델이 영어/중국어/일본어 명칭으로 새는 경향이 있어(泡菜·kimchi stew) 한국어 정식 명칭을
//    1순위로 강제하고, 애매하면 후보를 여러 개 내게 한다(사용자가 탭으로 고른다).
//  - 반찬이 많은 백반은 항목 수가 폭발하므로 주식/반찬을 분리해 통계 왜곡을 막는다.
export const MEAL_RECOGNITION_VERSION = 2;

export const MEAL_RECOGNITION_SYSTEM_PROMPT = `너는 한국 음식 사진 인식기다. 사진에 보이는 음식을 찾아 이름을 붙인다.

[이름 규칙 - 절대 위반하지 말 것]
- 한국에서 통용되는 **한국어 정식 명칭**만 쓴다. 영어·중국어·일본어 표기 금지("Kimchi Stew", "泡菜汤", "キムチチゲ" → "김치찌개").
- candidates 에는 **항상 2~3개**를 담는다(1순위 = name 과 같은 값). 확신이 아주 높을 때만 1개.
- 특히 다음은 겉모습이 겹치니 반드시 후보를 2~3개 낸다:
  · 국물류(전골/찌개/탕/국/칼국수/수제비) — 건더기가 안 보이면 무엇인지 단정하지 말 것.
  · 절임류(장아찌/김치/피클) — 재료(깻잎·무·오이 등)가 보이면 재료명을 붙여 후보를 만든다.
  · 회·육회·물회·회덮밥, 만두·찐빵·딤섬, 꼬치류처럼 형태가 비슷한 군.
- 아예 모르겠으면 name 을 "알 수 없음" 으로 두고 confidence 를 0.2 이하로 준다. 지어내지 말 것.
- 구체적인 이름을 우선한다: "찌개"(X) → "김치찌개"(O), "고기"(X) → "삼겹살"(O).
- 조리법이 다르면 다른 음식이다: 구이/찜/조림/볶음/튀김을 뭉뚱그리지 말 것.

[주식/반찬 구분]
- isMain=true: 그 끼니의 중심 음식(밥·면·국·탕·찌개·메인 고기/생선 요리·덮밥·빵 등).
- isMain=false: 곁들이는 반찬(김치·나물·장아찌·쌈·소스·단무지 등)과 물.
- 백반처럼 반찬이 많으면 반찬을 하나씩 다 적되 isMain=false 로 둔다.

[양(portion)]
- "small" | "normal" | "large" 중 하나. 1인분 기준으로 눈에 보이는 양. 그램 추정 금지.

[음료·술]
- 커피·주스·탄산·차·술은 isDrink=true, isMain=false.

[사진이 여러 장일 때]
- photoIndex 는 0부터 시작하는 사진 순번. 같은 음식이 여러 사진에 나오면 가장 잘 보이는 사진 1개에만 적는다.

[음식이 아닌 사진]
- 음식이 하나도 없으면 dishes 를 빈 배열로 두고 notes 에 이유를 한국어 한 문장으로 적는다.

[출력 - 절대 위반하지 말 것]
- 응답 전체는 단 하나의 JSON 객체.
- 형식: {"dishes":[{"name":"김치찌개","candidates":[{"name":"김치찌개","confidence":0.6},{"name":"부대찌개","confidence":0.25},{"name":"순두부찌개","confidence":0.15}],"confidence":0.6,"isMain":true,"portion":"normal","isDrink":false,"photoIndex":0}],"notes":null}
- 설명·인사말·코드펜스·사고 과정 출력 금지. 첫 글자 '{', 마지막 글자 '}'.
- confidence 는 0~1 실수. dishes 는 최대 20개.`;

// Ollama structured output 용 스키마(cloud 에서 강제되지 않아도 로컬/향후 지원 대비로 같이 보낸다).
export const MEAL_RECOGNITION_JSON_SCHEMA = {
  type: 'object',
  properties: {
    dishes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          candidates: {
            type: 'array',
            items: {
              type: 'object',
              properties: { name: { type: 'string' }, confidence: { type: 'number' } },
              required: ['name', 'confidence'],
            },
          },
          confidence: { type: 'number' },
          isMain: { type: 'boolean' },
          portion: { type: ['string', 'null'] },
          isDrink: { type: 'boolean' },
          photoIndex: { type: 'integer' },
        },
        required: ['name', 'confidence', 'isMain', 'photoIndex'],
      },
    },
    notes: { type: ['string', 'null'] },
  },
  required: ['dishes'],
} as const;

export interface MealRecognitionPromptInput {
  photoCount: number;
  // 식당을 알면 그 가게 등록 메뉴를 힌트로 준다(영수증 추출의 menuNames 와 같은 장치).
  restaurantName?: string | null;
  menuNames?: string[];
  // 끼니를 알면 야식/아침 같은 맥락이 후보를 좁힌다.
  slotLabel?: string | null;
}

export const buildMealRecognitionUserPrompt = (input: MealRecognitionPromptInput): string => {
  const lines: string[] = [];
  lines.push(`사진 ${input.photoCount}장을 분석하라.`);
  if (input.slotLabel) lines.push(`끼니: ${input.slotLabel}`);
  if (input.restaurantName) {
    lines.push(`식당: ${input.restaurantName}`);
    const menus = (input.menuNames ?? []).slice(0, 60);
    if (menus.length > 0) {
      lines.push(`이 식당의 등록 메뉴(참고 — 사진에 없는 메뉴를 지어내지 말 것): ${menus.join(', ')}`);
    }
  }
  lines.push('위 스키마에 맞는 JSON 객체로만 답하라.');
  return lines.join('\n');
};

// 파싱 실패 시 1회 수리 요청 — 원문을 그대로 되돌려주고 JSON 만 다시 뽑게 한다.
export const buildMealRecognitionRepairPrompt = (raw: string): string =>
  `다음 텍스트에서 JSON 객체만 추출해 그대로 출력하라. 설명·코드펜스 금지, 첫 글자 '{', 마지막 글자 '}'. 형식이 깨졌으면 스키마에 맞게 고쳐라.\n\n<<<\n${raw.slice(0, 4000)}\n>>>`;
