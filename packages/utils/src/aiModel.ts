// AI 모델 id 를 "계열(family)" 로 묶는 순수 유틸. Ollama 모델 id 는
// `<brand><version>[-variant][:tag]` 꼴이라 (예: deepseek-v4-pro,
// qwen3-vl:235b-instruct, gpt-oss:120b) 첫 숫자/콜론 앞을 brand 로 보고
// 끝의 버전 접두(-v 등)·구분자를 떼어 계열명을 뽑는다. 완벽한 분류가 아니라
// "같은 brand 끼리 한 그룹" 정도의 묶음 — 모델 선택 팝업에서 길어진 평면
// 리스트를 사람이 훑기 좋게 나누는 용도다.

export interface ModelFamilyGroup {
  // 계열명 (예: 'deepseek', 'qwen', 'gpt-oss'). 분류 실패 시 모델 id 자체.
  family: string;
  // 이 계열에 속한 모델 id 들 (정렬됨).
  models: string[];
}

// 모델 id → 계열명. 첫 콜론/숫자 앞까지 자른 뒤, 끝에 남는 버전 접두('-v')와
// 구분자(-, _, ., 공백)를 떼어낸다. 비면 원본 id 로 폴백.
export const parseModelFamily = (modelId: string): string => {
  const id = modelId.trim().toLowerCase();
  if (!id) return modelId;
  // 첫 콜론 또는 숫자 직전까지. 'gpt-oss:120b' → 'gpt-oss', 'qwen3-vl' → 'qwen',
  // 'deepseek-v4-pro' → 'deepseek-v'.
  const head = id.split(/[:\d]/)[0] ?? id;
  // 끝에 남은 '-v'(버전 접두) + 구분자를 정리. 'deepseek-v' → 'deepseek'.
  const family = head
    .replace(/[-_.\s]*v$/i, '')
    .replace(/[-_.\s]+$/, '');
  return family.length > 0 ? family : modelId;
};

// 모델 id 배열을 계열별로 묶는다. 그룹은 계열명 오름차순, 그룹 내 모델은
// id 내림차순(역순) — 보통 최신/상위 버전이 위로 온다. 중복 id 는 제거.
// 빈 입력이면 빈 배열.
export const groupModelsByFamily = (models: string[]): ModelFamilyGroup[] => {
  const byFamily = new Map<string, Set<string>>();
  for (const m of models) {
    const id = m.trim();
    if (!id) continue;
    const family = parseModelFamily(id);
    let set = byFamily.get(family);
    if (!set) {
      set = new Set();
      byFamily.set(family, set);
    }
    set.add(id);
  }
  return [...byFamily.entries()]
    .map(([family, set]) => ({
      family,
      models: [...set].sort((a, b) => b.localeCompare(a)),
    }))
    .sort((a, b) => a.family.localeCompare(b.family));
};

// 모델 id 가 vision(이미지 입력) 계열인지 — 이름 휴리스틱. 완벽한 판별이 아니라
// image·meal-photo 용도 추천에서 텍스트 모델을 거르는 정도의 게이트.
//  1) 이름에 vision/llava/vl/minicpm-v 가 들어가면 vision — 'llama3.2-vision',
//     'llava', 'qwen3-vl', 'qwen2.5vl:7b', 'minicpm-v'.
//  2) 이름에 vl/vision 이 없는데도 이미지 입력을 받는 멀티모달 계열 — Ollama
//     Cloud 카탈로그(2026-08-22 확인) 기준. family(':' 앞)의 접두를 대소문자
//     무시로 본다. 계열명 바로 뒤에 글자가 이어지면(gemma4x…) 다른 계열로 취급.
//       gemma4 · gemma3 · qwen3.5 · kimi-k2.6 · kimi-k3 · minimax-m3 ·
//       mistral-large-3 · llama4 · mistral-small3(.1/.2) · glm-4.5v / glm-4.6v
//     카탈로그가 바뀌면 이 목록을 갱신한다 (aiModel.test.ts 도 함께).
const VISION_NAME_RE = /vision|llava|vl(?=[-_:]|\d|$)|minicpm-v/i;
const MULTIMODAL_FAMILY_RE =
  /^(?:gemma[34]|qwen3\.5|kimi-k2\.6|kimi-k3|minimax-m3|mistral-large-3|llama4|mistral-small3|glm-4\.\dv)(?![a-z])/i;

export const isVisionModel = (modelId: string): boolean => {
  const id = modelId.trim();
  if (VISION_NAME_RE.test(id)) return true;
  const family = id.split(':')[0] ?? id;
  return MULTIMODAL_FAMILY_RE.test(family);
};

// 모델 id 에서 파라미터 규모(B 단위)를 추출. '120b', ':235b', '7b' 등. 여러
// 개면 가장 큰 값. 못 찾으면 0 — 정렬 시 맨 뒤로 밀린다.
const modelSizeB = (modelId: string): number => {
  const matches = [...modelId.toLowerCase().matchAll(/(\d+(?:\.\d+)?)\s*b\b/g)];
  if (matches.length === 0) return 0;
  return Math.max(...matches.map((m) => Number.parseFloat(m[1]!)));
};

// LLM 용도 — @repo/api-contract 의 LlmProviderPurpose 와 같은 값. utils 는
// api-contract 에 의존할 수 없어(순환 금지) 리터럴 유니온으로 다시 적는다.
type ModelPurpose = 'chat' | 'image' | 'log-analysis' | 'meal-photo' | 'meal-recommend' | 'tarot';

// 용도별로 카탈로그에서 합리적인 기본 모델을 한 개 고른다. UI 가 키 입력 후
// "추천값"을 폼에 프리필하는 용도 — 강제가 아니라 시작점이다. 적합한 후보가
// 없으면 null (그땐 프리필하지 않는다).
//   image·meal-photo    vision 계열 중 가장 작은 모델 (대개 충분 + 저렴). 없으면 null.
//   log-analysis        텍스트 계열 중 가장 큰 모델 (원인 추론은 추론력 우선).
//   chat·meal-recommend 텍스트 계열 중 중간 규모 (속도·품질 균형).
export const recommendModelForPurpose = (purpose: ModelPurpose, models: string[]): string | null => {
  const list = models.map((m) => m.trim()).filter((m) => m.length > 0);
  if (list.length === 0) return null;

  if (purpose === 'image' || purpose === 'meal-photo') {
    const vision = list.filter(isVisionModel).sort((a, b) => modelSizeB(a) - modelSizeB(b));
    return vision[0] ?? null;
  }

  // 텍스트 용도 — vision 모델은 후보에서 제외 (없으면 전체로 폴백).
  const textOnly = list.filter((m) => !isVisionModel(m));
  const pool = textOnly.length > 0 ? textOnly : list;
  const bySize = [...pool].sort((a, b) => modelSizeB(a) - modelSizeB(b));

  if (purpose === 'log-analysis') {
    return bySize[bySize.length - 1] ?? null; // 가장 큰 모델
  }
  // chat·meal-recommend·tarot — 규모 오름차순의 중앙값(작은 쪽으로 치우침).
  return bySize[Math.floor((bySize.length - 1) / 2)] ?? null;
};

// 추론(thinking) 제어 값 — Ollama /api/chat 의 최상위 `think`.
//
// 왜 필요한가(2026-08-22 실측, ollama.com 직접 API):
//   qwen3.5:397b 는 think 를 안 보내면 응답 토큰을 사고에 다 쓰고 content 가 빈 문자열로 온다
//   (num_predict 40 기준 thinking 119자 / content ""). gpt-oss 는 끄기가 안 되고 레벨만 받는다
//   ('low' 를 주면 content 가 채워진다). gemma4·kimi-k3·deepseek-v4-pro 는 think:false 를 보내도
//   200 이고 사고가 사라진다 — 즉 **모르는 모델에도 false 는 안전**하다.
//
// 그래서 JSON 을 뽑아야 하는 호출(추출·인식·분류·추천)은 이 값을 그대로 실어 보낸다.
// 대화형 답변 품질이 중요한 곳에서는 굳이 끄지 않아도 된다(호출부 판단).
export const thinkOptionForModel = (modelId: string): false | 'low' => {
  const family = modelId.trim().toLowerCase().split(':')[0] ?? '';
  // gpt-oss 는 사고를 끌 수 없다 — 최저 레벨로 낮춰 출력 토큰을 확보한다.
  if (family.startsWith('gpt-oss')) return 'low';
  return false;
};
