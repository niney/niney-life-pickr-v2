import {
  Routes,
  type GetSettlementDraftResultType,
  type ListSettlementDraftsResultType,
  type UpsertSettlementDraftInputType,
  type UpsertSettlementDraftResultType,
} from '@repo/api-contract';
import { apiFetch } from './client.js';

// 정산 입력 서버 임시저장 — 자동 저장(debounce)으로 사용된다. id 를 클라이언트가
// 모르더라도 upsert 호출 가능 (서버가 userId+placeId 로 매칭).
// 목록은 메타만(payload 제외) — 이어쓰기 payload 는 getByPlace 단건 조회로 받는다.
const S = Routes.SettlementDraft;

export const settlementDraftApi = {
  list: (): Promise<ListSettlementDraftsResultType> =>
    apiFetch<ListSettlementDraftsResultType>(S.list),

  // placeId null = 식당 미지정 슬롯(쿼리 생략).
  getByPlace: (placeId: string | null): Promise<GetSettlementDraftResultType> =>
    apiFetch<GetSettlementDraftResultType>(
      placeId ? `${S.byPlace}?placeId=${encodeURIComponent(placeId)}` : S.byPlace,
    ),

  upsert: (input: UpsertSettlementDraftInputType): Promise<UpsertSettlementDraftResultType> =>
    apiFetch<UpsertSettlementDraftResultType>(S.upsert, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),

  remove: (id: string): Promise<void> => apiFetch<void>(S.one(id), { method: 'DELETE' }),
};
