import { z } from 'zod';

// 서울시 버스 정류장 검색 — friendly 가 ws.bus.go.kr(getStationByName) 을
// 프록시하고 결과를 DB 에 장기 캐싱(TTL 30일)한다. 일 1,000건(개발계정) 한도
// 보호를 위해 클라이언트는 제출형 검색(Enter/버튼)만 사용한다.

export const BusStationSearchQuery = z.object({
  // NFC 정규화 후 길이 검증 — min(2) 를 먼저 걸면 NFD '가'(코드유닛 2) 가
  // 통과한 뒤 1글자로 업스트림에 도달한다. 이 스키마가 1차 방어이며 서비스의
  // normalize 는 라우트 밖 호출자 대비 이중 방어.
  q: z
    .string()
    .trim()
    .transform((v) => v.normalize('NFC'))
    .refine((v) => v.length >= 2 && v.length <= 50, {
      message: '검색어는 2자 이상 50자 이하여야 합니다.',
    }),
  // true = 캐시 무시하고 서울시 API 재호출(사용자 강제 재요청 버튼).
  // 단 서버가 60초 내 재요청은 캐시로 응답한다(한도 남용 가드).
  // z.coerce.boolean() 은 'false' 문자열도 true 가 되므로 union+transform.
  force: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .default(false)
    .transform((v) => (typeof v === 'string' ? v === 'true' : v)),
});
export type BusStationSearchQueryType = z.infer<typeof BusStationSearchQuery>;

export const BusStationItem = z.object({
  // 서울시 9자리 정류소 고유 ID — PK. arsId 가 '0' 인 가상정류장이 여럿이라
  // arsId 는 식별자로 못 쓴다.
  stId: z.string().min(1),
  // 5자리 정류소번호(승차대 표지판 번호). '0' = 가상정류장 — 도착정보 조회
  // 불가, FE 는 arsId === '0' 으로 판별해 번호 배지를 숨긴다.
  arsId: z.string(),
  name: z.string(),
  // 항상 WGS84 로 정규화해 내려준다 — 원본이 GRS80 TM 이어도 서버가 변환.
  // 한국 범위 검증으로 이 계약을 코드로 강제(TM 값이 새면 직렬화에서 실패).
  lat: z.number().min(33).max(39),
  lng: z.number().min(124).max(132),
});
export type BusStationItemType = z.infer<typeof BusStationItem>;

export const BusStationSearchResult = z.object({
  // 상한 100건으로 절단된 목록. total 과 다르면 FE 가 '일부만 표시' 안내.
  items: z.array(BusStationItem),
  // 절단 전 원본 건수.
  total: z.number().int().min(0),
  // 서울시 원본을 수집한 시각 (ISO) — '마지막 갱신' 표시용.
  fetchedAt: z.string(),
  // cache = TTL 내 DB 응답 / api = 방금 서울시 호출 / stale = API 실패로
  // 만료된 캐시라도 반환(가용성 우선).
  source: z.enum(['cache', 'api', 'stale']),
});
export type BusStationSearchResultType = z.infer<typeof BusStationSearchResult>;
