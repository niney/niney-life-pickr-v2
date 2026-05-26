import { z } from 'zod';

// 정산 입력 화면의 서버 임시저장. 자동 저장(debounce)으로 다기기 동기화 목적.
// payload 는 settlementDraftStore 상태 JSON — 서버는 형태 검증을 하지 않고
// 보관만 한다(클라이언트 진화에 유연). 크기만 안전치(200KB) 제한.
//
// placeId: null 이면 '/me/settlements/new' 흐름(식당 미지정 슬롯).
// 문자열이면 해당 1차 식당 슬롯. (userId, placeId) 가 unique — 같은 식당의
// draft 는 하나만 유지된다.
export const SettlementDraft = z.object({
  id: z.string(),
  placeId: z.string().nullable(),
  // 1차 식당 이름 캐시 — 이력 페이지 "이어 입력" 행 라벨용. 없을 수 있다.
  placeNameHint: z.string().nullable(),
  // 자유 형태 — 클라 store 상태 그대로. unknown 으로 둔다(서버는 통과만).
  payload: z.unknown(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SettlementDraftType = z.infer<typeof SettlementDraft>;

// payload 크기 제한 (직렬화 JSON 길이 기준). 마스터 참여자 100명 + 항목 200개
// 모두 채워도 100KB 미만이라 200KB 면 충분히 여유.
const MAX_PAYLOAD_BYTES = 200 * 1024;

const PayloadSchema = z.unknown().refine(
  (v) => {
    try {
      return JSON.stringify(v).length <= MAX_PAYLOAD_BYTES;
    } catch {
      return false;
    }
  },
  { message: `payload 가 너무 큽니다 (max ${MAX_PAYLOAD_BYTES}B).` },
);

export const UpsertSettlementDraftInput = z.object({
  placeId: z.string().min(1).max(64).nullable(),
  placeNameHint: z.string().trim().max(120).nullable().optional(),
  payload: PayloadSchema,
});
export type UpsertSettlementDraftInputType = z.infer<typeof UpsertSettlementDraftInput>;

export const ListSettlementDraftsResult = z.object({
  items: z.array(SettlementDraft),
});
export type ListSettlementDraftsResultType = z.infer<typeof ListSettlementDraftsResult>;
