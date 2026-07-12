// 범용 텍스트 정규화 헬퍼. (가게명 매칭 전용 정규화는 lib/matching.ts 쪽.)

// nameNorm/termNorm 정규화 — 대소문자/공백/특수문자만 제거하는 최소 정규화.
// 동의어 사전("세트"="SET", "트러플"="truffle")은 별도 작업으로 미룬다.
// summary·restaurant·analytics·menu-grouping 이 같은 키 규칙을 공유해야
// 집계·그룹핑이 맞물린다.
export const normalizeTerm = (s: string): string =>
  s.toLowerCase().replace(/\s+/g, '').replace(/[^\p{L}\p{N}]/gu, '');
