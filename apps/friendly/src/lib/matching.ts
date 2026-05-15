// 가게 동일성 매칭. 어드민이 "이 다이닝코드 행 = 저 네이버 행" 을 수동
// 확정할 때 후보를 제안하는 데 쓴다. 풀 자동 매핑은 의도적으로 안 함 —
// 동명이인/주변 가게 false positive 가 데이터 오염을 일으키므로 사람 눈
// 확인이 마지막 단계.

// 가게명 정규화. 비교용 키 — 표시용 X.
// - 소문자/공백/구두점 제거
// - 자주 붙는 분점 suffix("본점", "지점", "점") 끝에서 1회 제거
// - 영문/한글 외 문자(이모지·괄호 안 보조 설명)는 제거하지 않음 — 이름 자체
//   변별력에 기여하는 케이스가 있어 보수적으로 둠
export const normalizeName = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[\s\-_·.,!?()()\[\]【】「」]/g, '')
    .replace(/(본점|지점|점)$/u, '');

// 두 좌표 간 거리(m). Haversine. 둘 중 하나라도 null 이면 호출자가 거리
// 비교를 스킵해야 한다.
export const distanceMeters = (
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number => {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
};

// Bigram 집합. 한국어 짧은 가게명에서 trigram 보다 안정적 (음절 단위 변형
// — "스시경" vs "스시 경" 같은 띄어쓰기 차이는 normalizeName 단계에서 흡수).
const bigrams = (s: string): Set<string> => {
  const set = new Set<string>();
  for (let i = 0; i < s.length - 1; i += 1) set.add(s.slice(i, i + 2));
  return set;
};

// 이름 유사도 [0, 1]. Jaccard on bigrams. 한 글자 이름(예: "콩") 같이 bigram
// 0개인 케이스는 정규화 후 완전 일치 시에만 1, 아니면 0.
export const nameSimilarity = (a: string, b: string): number => {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  const A = bigrams(na);
  const B = bigrams(nb);
  if (A.size === 0 || B.size === 0) return na === nb ? 1 : 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter += 1;
  return inter / (A.size + B.size - inter);
};

export interface MatchInput {
  name: string;
  latitude: number | null;
  longitude: number | null;
}

export interface MatchScore {
  // null 이면 좌표 중 하나라도 없어 거리 비교 불가.
  distanceM: number | null;
  nameScore: number;
  // 0~1 — name 0.6 + distance 0.4 가중. 좌표 없으면 name 단독으로 환산.
  score: number;
}

// 거리는 200m 까지 선형 감쇠, 그 이상이면 0. 이름은 그대로 0~1. 좌표 둘 다
// 없으면 이름만으로 점수 (작업: false-positive 위험 ↑ — 호출자가 임계를
// 더 올려 사용).
export const scoreMatch = (a: MatchInput, b: MatchInput): MatchScore => {
  const nameScore = nameSimilarity(a.name, b.name);
  let distanceM: number | null = null;
  let distanceScore: number | null = null;
  if (a.latitude != null && a.longitude != null && b.latitude != null && b.longitude != null) {
    distanceM = distanceMeters(
      { lat: a.latitude, lng: a.longitude },
      { lat: b.latitude, lng: b.longitude },
    );
    distanceScore = Math.max(0, 1 - distanceM / 200);
  }
  const score = distanceScore === null ? nameScore : 0.6 * nameScore + 0.4 * distanceScore;
  return { distanceM, nameScore, score };
};

// 후보로 채택할 컷오프. 어드민 확정 단계가 있으므로 보수적으로(권장보다 약간
// 낮게) — 사람 눈에 띌 후보를 빠뜨리는 것보다 가짜 후보를 잡는 비용이 낮다.
export const MATCH_THRESHOLDS = {
  // 좌표 둘 다 있을 때
  maxDistanceM: 500,
  minScoreWithCoords: 0.45,
  // 좌표 없는 한쪽 — 이름만으로
  minScoreNameOnly: 0.7,
} as const;

export const isCandidate = (s: MatchScore): boolean => {
  if (s.distanceM === null) return s.nameScore >= MATCH_THRESHOLDS.minScoreNameOnly;
  if (s.distanceM > MATCH_THRESHOLDS.maxDistanceM) return false;
  return s.score >= MATCH_THRESHOLDS.minScoreWithCoords;
};
