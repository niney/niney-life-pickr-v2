import type {
  ListSettlementDraftsResultType,
  SettlementDraftType,
  UpsertSettlementDraftInputType,
} from '@repo/api-contract';
import { apiFetch } from './client.js';

// 정산 입력 서버 임시저장 — 자동 저장(debounce)으로 사용된다. id 를 클라이언트가
// 모르더라도 upsert 호출 가능 (서버가 userId+placeId 로 매칭).
const PREFIX = '/api/v1/settlement-drafts';

export const settlementDraftApi = {
  list: (): Promise<ListSettlementDraftsResultType> =>
    apiFetch<ListSettlementDraftsResultType>(PREFIX),

  upsert: (
    input: UpsertSettlementDraftInputType,
  ): Promise<SettlementDraftType> =>
    apiFetch<SettlementDraftType>(PREFIX, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),

  remove: (id: string): Promise<void> =>
    apiFetch<void>(`${PREFIX}/${id}`, { method: 'DELETE' }),
};
