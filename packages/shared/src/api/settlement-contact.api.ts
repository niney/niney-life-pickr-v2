import type {
  ListContactsQueryType,
  ListContactsResultType,
  SettlementContactType,
  UpdateContactInputType,
} from '@repo/api-contract';
import { apiFetch } from './client.js';

const PREFIX = '/api/v1/me/contacts';

const buildQuery = (q: ListContactsQueryType): string => {
  const sp = new URLSearchParams();
  if (q.q) sp.set('q', q.q);
  if (q.take !== undefined) sp.set('take', String(q.take));
  const s = sp.toString();
  return s ? `?${s}` : '';
};

// 사용자별 단골 참여자 — /me/contacts 관리 페이지와 SettlementNewPage 의
// 자동완성이 호출. 모든 호출이 인증 필요.
export const settlementContactApi = {
  list: (
    query: ListContactsQueryType = { take: 50 },
  ): Promise<ListContactsResultType> =>
    apiFetch<ListContactsResultType>(`${PREFIX}${buildQuery(query)}`),

  update: (
    id: string,
    input: UpdateContactInputType,
  ): Promise<SettlementContactType> =>
    apiFetch<SettlementContactType>(`${PREFIX}/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),

  remove: (id: string): Promise<void> =>
    apiFetch<void>(`${PREFIX}/${id}`, { method: 'DELETE' }),
};
