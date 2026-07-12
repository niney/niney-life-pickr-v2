// 외부 API 응답(unknown JSON)을 좁히는 내로잉 헬퍼 — 크롤/공공데이터 어댑터
// 공용. 실패는 전부 null/기본값 폴백(어댑터가 필드 단위로 방어).
//
// 주의: subway-congestion.service 의 trim 변형(공백-only 를 null 처리)은
// 시맨틱이 달라 의도적으로 로컬에 남겨둔다.

export const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

// 비어있지 않은 문자열만 통과. 숫자 coerce 는 coerceStrOrNull.
export const strOrNull = (v: unknown): string | null =>
  typeof v === 'string' && v.length > 0 ? v : null;

// 문자열 또는 유한 숫자 → 문자열. 서울시 계열 API 가 ID/코드를 필드에 따라
// 숫자로 내려보내는 케이스 흡수(버스·지하철 어댑터).
export const coerceStrOrNull = (v: unknown): string | null => {
  if (typeof v === 'string' && v.length > 0) return v;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return null;
};

// 유한 숫자 또는 숫자 문자열("37.54…" — 좌표를 string 으로 주는 API 대응) → number.
export const numOrNull = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.length > 0) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
};

export const intOrNull = (v: unknown): number | null => {
  const n = numOrNull(v);
  return n !== null ? Math.trunc(n) : null;
};

export const boolOf = (v: unknown): boolean => v === true;

// 응답이 string array 일 때만 정상값으로 보고 그 외 빈 배열 폴백.
export const strArray = (v: unknown): string[] => {
  if (!Array.isArray(v)) return [];
  return v.filter((s): s is string => typeof s === 'string' && s.length > 0);
};

// http(s) URL 보장 — 일부 응답이 protocol 누락 URL("blog.naver.com/…")을 박아
// 보내고 zod 가 .url() 에서 reject 하므로 https:// 보강 후 반환.
export const httpUrlOrNull = (v: unknown): string | null => {
  const s = strOrNull(v);
  if (!s) return null;
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
};
