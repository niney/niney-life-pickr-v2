import { z } from 'zod';
import { ReceiptItemCategory } from './settlement-extraction.js';

// 세션이 어떻게 만들어졌는지. RECEIPT 는 영수증 사진 추출, MANUAL 은 직접 입력.
export const SettlementSource = z.enum(['MANUAL', 'RECEIPT']);
export type SettlementSourceType = z.infer<typeof SettlementSource>;

// 한 항목(메뉴). DB 의 SettlementItem 과 거의 동형이지만 sessionId 는 client
// 에 노출하지 않는다 — 부모 세션의 id 만으로 충분.
export const SettlementItem = z.object({
  id: z.string(),
  name: z.string().min(1).max(120),
  unitPrice: z.number().int().nonnegative().nullable(),
  quantity: z.number().int().positive().nullable(),
  amount: z.number().int().nonnegative(),
  category: ReceiptItemCategory,
  matchedMenuName: z.string().nullable(),
  orderIndex: z.number().int().nonnegative(),
});
export type SettlementItemType = z.infer<typeof SettlementItem>;

// 신규 항목 입력 — id 는 server 가 부여, orderIndex 는 배열 순서로 결정.
export const SettlementItemInput = SettlementItem.omit({ id: true, orderIndex: true });
export type SettlementItemInputType = z.infer<typeof SettlementItemInput>;

export const SettlementParticipant = z.object({
  id: z.string(),
  name: z.string().nullable(),
  nickname: z.string().nullable(),
  excludeAlcohol: z.boolean(),
  excludeNonAlcohol: z.boolean(),
  excludeSide: z.boolean(),
  shareAmount: z.number().int().nonnegative(),
  orderIndex: z.number().int().nonnegative(),
});
export type SettlementParticipantType = z.infer<typeof SettlementParticipant>;

// 신규 참여자 입력 — id/shareAmount/orderIndex 는 server 가 부여/계산.
// name 또는 nickname 중 하나는 비어있지 않아야 한다 (application layer 검증).
export const SettlementParticipantInput = z.object({
  name: z.string().trim().max(40).nullable(),
  nickname: z.string().trim().max(40).nullable(),
  excludeAlcohol: z.boolean().default(false),
  excludeNonAlcohol: z.boolean().default(false),
  excludeSide: z.boolean().default(false),
});
export type SettlementParticipantInputType = z.infer<typeof SettlementParticipantInput>;

export const SettlementSession = z.object({
  id: z.string(),
  userId: z.string(),
  restaurantPlaceId: z.string(),
  restaurantName: z.string(),
  source: SettlementSource,
  totalAmount: z.number().int().nonnegative().nullable(),
  warning: z.string().nullable(),
  // server 는 토큰 자체 대신 미리보기 URL 만 노출 — 별도 인증된 GET 엔드포인트
  // (settlement-extraction/preview/:token) 를 호출하면 JPEG 가 내려온다.
  receiptPreviewUrl: z.string().nullable(),
  itemsSubtotal: z.number().int().nonnegative(),
  items: z.array(SettlementItem),
  participants: z.array(SettlementParticipant),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SettlementSessionType = z.infer<typeof SettlementSession>;

export const CreateSettlementInput = z.object({
  restaurantPlaceId: z.string().min(1),
  source: SettlementSource,
  totalAmount: z.number().int().nonnegative().nullable(),
  warning: z.string().nullable(),
  // 영수증 분기에서 업로드한 이미지 토큰. server 는 파일 존재를 확인하고
  // session.receiptImageToken 에 그대로 저장. MANUAL 분기에서는 null.
  receiptImageToken: z.string().nullable(),
  items: z.array(SettlementItemInput).min(1).max(100),
  participants: z.array(SettlementParticipantInput).min(1).max(20),
});
export type CreateSettlementInputType = z.infer<typeof CreateSettlementInput>;

export const ListSettlementsQuery = z.object({
  // 특정 식당의 이력만 보고 싶을 때. 미지정이면 전체.
  placeId: z.string().optional(),
  // 페이지네이션 — 최근순. offset/limit 두 개로 단순.
  offset: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type ListSettlementsQueryType = z.infer<typeof ListSettlementsQuery>;

// 목록 응답은 본문(items/participants) 을 빼고 요약만 — 단건 GET 으로 상세를
// 다시 받는다. 목록 표시에 필요한 최소 정보만 동봉.
export const SettlementSessionSummary = z.object({
  id: z.string(),
  restaurantPlaceId: z.string(),
  restaurantName: z.string(),
  source: SettlementSource,
  totalAmount: z.number().int().nonnegative().nullable(),
  itemsSubtotal: z.number().int().nonnegative(),
  itemCount: z.number().int().nonnegative(),
  participantCount: z.number().int().nonnegative(),
  createdAt: z.string(),
});
export type SettlementSessionSummaryType = z.infer<typeof SettlementSessionSummary>;

export const ListSettlementsResult = z.object({
  items: z.array(SettlementSessionSummary),
  total: z.number().int().nonnegative(),
});
export type ListSettlementsResultType = z.infer<typeof ListSettlementsResult>;

// 공유 토큰 생성/회수 응답. 토큰이 없으면 (회수 직후) token=null.
// shareUrl 은 절대 URL 이 아닌 API 경로 — 클라이언트가 origin 을 붙여 사용.
export const SettlementShare = z.object({
  token: z.string().nullable(),
  shareUrl: z.string().nullable(),
});
export type SettlementShareType = z.infer<typeof SettlementShare>;

// 공개 공유 응답. 기존 SettlementSession 에서 소유자 식별(userId)과 영수증
// 미리보기(receiptPreviewUrl) 를 제거 — 토큰 받은 사람도 원본 사진은 보지 못한다.
export const SharedSettlementSession = SettlementSession.omit({
  userId: true,
  receiptPreviewUrl: true,
});
export type SharedSettlementSessionType = z.infer<typeof SharedSettlementSession>;
