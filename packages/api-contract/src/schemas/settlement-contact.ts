import { z } from 'zod';

// 사용자별 단골 참여자 — 새 정산을 만들 때 자동완성으로 이름·닉네임·exclude*
// 를 채워주는 메모. 정산 저장 시마다 (userId, normalizedKey) 기준으로 upsert
// 되며, lastExclude* 는 가장 최근 정산에서의 선택을 다음 정산의 default 로
// 제안한다.
//
// normalizedKey 는 서버 내부 매칭 키 — 클라이언트는 보지 않는다.
export const SettlementContact = z.object({
  id: z.string(),
  name: z.string().nullable(),
  nickname: z.string().nullable(),
  lastExcludeAlcohol: z.boolean(),
  lastExcludeNonAlcohol: z.boolean(),
  lastExcludeSide: z.boolean(),
  useCount: z.number().int().nonnegative(),
  lastUsedAt: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SettlementContactType = z.infer<typeof SettlementContact>;

export const ListContactsQuery = z.object({
  // 이름/닉네임 부분일치 (case-insensitive). 비우면 전체.
  q: z.string().trim().optional(),
  // 자동완성 응답 크기 — 작게 유지. 관리 페이지는 클라이언트가 페이지네이션
  // 대신 한 번에 받아 인메모리 필터링한다(사용자별 단골이 보통 수십 개 이하).
  take: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListContactsQueryType = z.infer<typeof ListContactsQuery>;

export const ListContactsResult = z.object({
  items: z.array(SettlementContact),
  total: z.number().int().nonnegative(),
});
export type ListContactsResultType = z.infer<typeof ListContactsResult>;

// 단골 이름·닉네임 수정. 정확 일치(normalizedKey) 충돌 시 서버는 409.
// lastExclude* 는 수정 대상이 아님 — 다음 정산이 자연스럽게 덮어쓴다.
export const UpdateContactInput = z.object({
  name: z.string().trim().max(40).nullable(),
  nickname: z.string().trim().max(40).nullable(),
});
export type UpdateContactInputType = z.infer<typeof UpdateContactInput>;
