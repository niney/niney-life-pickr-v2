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
