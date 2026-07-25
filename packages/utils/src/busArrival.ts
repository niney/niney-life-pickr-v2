// 버스 도착 메시지 파생 판정 — 서울시 API 원문 규칙.

// "곧 도착" 강조 판정 — 서울시 원문이 "곧 도착" 단독 표기. null/undefined
// (도착 정보 없음)는 false.
export const isBusArrivalImminent = (message: string | null | undefined): boolean =>
  message?.includes('곧 도착') ?? false;

// 도착 메시지 → 잔여초 근사. 서울시가 초 단위를 주지 않아 분 해상도가 상한이다.
// '곧 도착'은 0, 'N분후[M번째 전]'는 N*60, 그 외(운행종료·출발대기·빈 값)는 null
// — 호출측이 "도착 예정 없음"으로 다루게 한다.
export const parseBusArrivalSec = (message: string | null | undefined): number | null => {
  if (!message) return null;
  if (isBusArrivalImminent(message)) return 0;
  const m = /(\d+)\s*분\s*후/.exec(message);
  return m ? Number(m[1]) * 60 : null;
};
