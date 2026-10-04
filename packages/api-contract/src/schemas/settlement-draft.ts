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

// 목록 항목 — payload 는 빼고 메타와 크기만. 목록이 payload 전체(사용자당 최대 50건)를 매번 내려주면
// 응답이 수십 MB 까지 커졌다(PLAN-perf-2 G-V1). 이어쓰기는 단건 조회(GetSettlementDraftResult)로 받는다.
export const SettlementDraftMeta = SettlementDraft.omit({ payload: true }).extend({
  // 저장된 payload JSON 의 UTF-8 바이트 수.
  byteSize: z.number().int(),
});
export type SettlementDraftMetaType = z.infer<typeof SettlementDraftMeta>;

// payload 크기 제한 — 직렬화 JSON 의 UTF-8 바이트 기준(글자 수가 아니라). 마스터 참여자 100명 +
// 항목 200개 모두 채워도 100KB 미만이라 200KB 면 충분히 여유. 한글 글자 수로 재면 같은 한도가
// 3배(600KB)까지 늘어났다.
export const SETTLEMENT_DRAFT_MAX_PAYLOAD_BYTES = 200 * 1024;
// 사용자 한 명의 임시저장 payload 합계 상한(행 수 상한 50 과 별개).
export const SETTLEMENT_DRAFT_MAX_TOTAL_BYTES = 2 * 1024 * 1024;

// 플랫폼 무관(브라우저·RN·Node) UTF-8 바이트 수 — Buffer/TextEncoder 에 기대지 않는다.
export const utf8ByteLength = (s: string): number => {
  let bytes = 0;
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    if (c < 0x80) bytes += 1;
    else if (c < 0x800) bytes += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      // 서로게이트 쌍 = 4바이트 한 글자.
      bytes += 4;
      i += 1;
    } else bytes += 3;
  }
  return bytes;
};

const PayloadSchema = z.unknown().refine(
  (v) => {
    try {
      return utf8ByteLength(JSON.stringify(v) ?? 'null') <= SETTLEMENT_DRAFT_MAX_PAYLOAD_BYTES;
    } catch {
      return false;
    }
  },
  { message: `payload 가 너무 큽니다 (max ${SETTLEMENT_DRAFT_MAX_PAYLOAD_BYTES}B).` },
);

export const UpsertSettlementDraftInput = z.object({
  placeId: z.string().min(1).max(64).nullable(),
  placeNameHint: z.string().trim().max(120).nullable().optional(),
  payload: PayloadSchema,
});
export type UpsertSettlementDraftInputType = z.infer<typeof UpsertSettlementDraftInput>;

// PUT 응답 — 저장 확인용 id·updatedAt 만(payload 를 되돌려 보내지 않는다).
export const UpsertSettlementDraftResult = z.object({
  id: z.string(),
  updatedAt: z.string(),
});
export type UpsertSettlementDraftResultType = z.infer<typeof UpsertSettlementDraftResult>;

export const ListSettlementDraftsResult = z.object({
  items: z.array(SettlementDraftMeta),
});
export type ListSettlementDraftsResultType = z.infer<typeof ListSettlementDraftsResult>;

// 단건 조회(이어쓰기) — placeId 슬롯. 생략하면 식당 미지정 슬롯.
export const GetSettlementDraftQuery = z.object({
  placeId: z.string().min(1).max(64).optional(),
});
export type GetSettlementDraftQueryType = z.infer<typeof GetSettlementDraftQuery>;

// 없으면 draft: null(200) — 새로 시작하는 정상 경로라 404 로 두지 않는다.
export const GetSettlementDraftResult = z.object({
  draft: SettlementDraft.nullable(),
});
export type GetSettlementDraftResultType = z.infer<typeof GetSettlementDraftResult>;
