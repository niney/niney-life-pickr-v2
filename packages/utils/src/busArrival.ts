// 버스 도착 메시지 파생 판정 — 서울시 API 원문 규칙.

// "곧 도착" 강조 판정 — 서울시 원문이 "곧 도착" 단독 표기. null/undefined
// (도착 정보 없음)는 false.
export const isBusArrivalImminent = (message: string | null | undefined): boolean =>
  message?.includes('곧 도착') ?? false;
