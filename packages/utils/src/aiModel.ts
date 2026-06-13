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

// 모델 id 가 vision(이미지 입력) 계열인지 — 이름 휴리스틱. 'llama3.2-vision',
// 'llava', 'qwen3-vl', 'qwen2.5vl:7b', 'minicpm-v' 등을 잡는다. 완벽한 판별이
// 아니라 image 용도 추천에서 텍스트 모델을 거르는 정도의 게이트.
export const isVisionModel = (modelId: string): boolean =>
  /vision|llava|vl(?=[-_:]|\d|$)|minicpm-v/i.test(modelId.trim());

// 모델 id 에서 파라미터 규모(B 단위)를 추출. '120b', ':235b', '7b' 등. 여러
// 개면 가장 큰 값. 못 찾으면 0 — 정렬 시 맨 뒤로 밀린다.
const modelSizeB = (modelId: string): number => {
  const matches = [...modelId.toLowerCase().matchAll(/(\d+(?:\.\d+)?)\s*b\b/g)];
  if (matches.length === 0) return 0;
  return Math.max(...matches.map((m) => Number.parseFloat(m[1]!)));
};

// 용도별로 카탈로그에서 합리적인 기본 모델을 한 개 고른다. UI 가 키 입력 후
// "추천값"을 폼에 프리필하는 용도 — 강제가 아니라 시작점이다. 적합한 후보가
// 없으면 null (그땐 프리필하지 않는다).
//   image        vision 계열 중 가장 작은 모델 (대개 충분 + 저렴). 없으면 null.
//   log-analysis 텍스트 계열 중 가장 큰 모델 (원인 추론은 추론력 우선).
//   chat         텍스트 계열 중 중간 규모 (속도·품질 균형).
export const recommendModelForPurpose = (
  purpose: 'chat' | 'image' | 'log-analysis',
  models: string[],
): string | null => {
  const list = models.map((m) => m.trim()).filter((m) => m.length > 0);
  if (list.length === 0) return null;

  if (purpose === 'image') {
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
  // chat — 규모 오름차순의 중앙값(작은 쪽으로 치우침).
  return bySize[Math.floor((bySize.length - 1) / 2)] ?? null;
};
