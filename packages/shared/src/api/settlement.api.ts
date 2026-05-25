import type {
  CreateSettlementInputType,
  ListSettlementsQueryType,
  ListSettlementsResultType,
  SettlementSessionType,
  SettlementShareType,
  SharedSettlementSessionType,
  UpdateSettlementInputType,
} from '@repo/api-contract';
import { apiFetch } from './client.js';

const PREFIX = '/api/v1/settlements';

const buildQuery = (q: ListSettlementsQueryType): string => {
  const sp = new URLSearchParams();
  if (q.placeId) sp.set('placeId', q.placeId);
  if (q.offset !== undefined) sp.set('offset', String(q.offset));
  if (q.limit !== undefined) sp.set('limit', String(q.limit));
  const s = sp.toString();
  return s ? `?${s}` : '';
};

export const settlementApi = {
  create: (input: CreateSettlementInputType): Promise<SettlementSessionType> =>
    apiFetch<SettlementSessionType>(PREFIX, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  list: (query: ListSettlementsQueryType = { offset: 0, limit: 20 }): Promise<ListSettlementsResultType> =>
    apiFetch<ListSettlementsResultType>(`${PREFIX}${buildQuery(query)}`),

  get: (id: string): Promise<SettlementSessionType> =>
    apiFetch<SettlementSessionType>(`${PREFIX}/${id}`),

  remove: (id: string): Promise<void> =>
    apiFetch<void>(`${PREFIX}/${id}`, { method: 'DELETE' }),

  // 저장된 정산 전체 replace — 참여자 명단·차수 구성·각 차수의 items/attendees
  // 모두 교체. 서버가 트랜잭션 wipe + rebuild + 재계산 + editedAt 갱신.
  update: (
    id: string,
    input: UpdateSettlementInputType,
  ): Promise<SettlementSessionType> =>
    apiFetch<SettlementSessionType>(`${PREFIX}/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),

  // 공유 토큰 생성 — 같은 세션 두 번 호출해도 동일 토큰(서버 멱등).
  createShare: (id: string): Promise<SettlementShareType> =>
    apiFetch<SettlementShareType>(`${PREFIX}/${id}/share`, { method: 'POST' }),

  // 공유 토큰 회수. 이전 링크는 영구 무효 — 다시 share 하면 새 토큰 발급.
  revokeShare: (id: string): Promise<void> =>
    apiFetch<void>(`${PREFIX}/${id}/share`, { method: 'DELETE' }),

  // 공개 공유 조회 — 인증 없이 호출 가능. apiFetch 는 토큰이 있으면 Authorization
  // 헤더를 자동으로 붙이지만, 비로그인 사용자도 동일 경로로 호출하면 그대로 동작.
  getShared: (token: string): Promise<SharedSettlementSessionType> =>
    apiFetch<SharedSettlementSessionType>(`/api/v1/share/settlements/${token}`),
};
