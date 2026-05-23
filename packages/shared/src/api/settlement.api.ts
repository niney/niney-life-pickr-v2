import type {
  CreateSettlementInputType,
  ListSettlementsQueryType,
  ListSettlementsResultType,
  SettlementSessionType,
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
};
