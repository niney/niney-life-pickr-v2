import { z } from 'zod';

// 영수증 항목의 카테고리. 정산 분배 시 참여자별 특이사항(주류 X 등) 에 따라
// 풀을 나누는 기준이 된다. LLM 이 분류를 시도하고, 모호하면 UNCATEGORIZED.
// UI 에서 사용자가 수동 보정할 수 있다.
export const ReceiptItemCategory = z.enum([
  'ALCOHOL',
  'NON_ALCOHOL',
  'SIDE',
  'UNCATEGORIZED',
]);
export type ReceiptItemCategoryType = z.infer<typeof ReceiptItemCategory>;

// 영수증에서 뽑아낸 한 줄. unitPrice/quantity 둘 다 추출되지 않을 수 있어
// nullable. amount(라인 합계)는 가능한 한 채우되 없으면 unitPrice*quantity
// 또는 0 으로 fallback.
export const ReceiptItem = z.object({
  name: z.string().min(1).max(120),
  unitPrice: z.number().int().nonnegative().nullable(),
  quantity: z.number().int().positive().nullable(),
  amount: z.number().int().nonnegative(),
  category: ReceiptItemCategory,
  // LLM 이 레스토랑 메뉴 힌트에서 같은 항목을 찾아냈을 때 정규화된 이름.
  // 못 찾으면 null — UI 가 그대로 노출하거나 사용자에게 보정 요청.
  matchedMenuName: z.string().nullable(),
});
export type ReceiptItemType = z.infer<typeof ReceiptItem>;

// 업로드 응답 — 클라이언트는 imageToken 만 보관하고 추출 호출에 같이 보낸다.
// 절대 경로/파일명을 노출하지 않아 server 가 임의 경로 주입을 막을 수 있다.
export const UploadReceiptResult = z.object({
  imageToken: z.string().min(1),
  // 클라이언트 미리보기에 쓰일 상대 URL (data/receipts/<token>.jpg 를 가리키는
  // /api/v1/settlement-extraction/preview/<token> 엔드포인트). 미리보기 라우트는
  // 같은 사용자만 접근 가능 — JWT 인증 그대로 사용.
  previewUrl: z.string(),
  // 저장 시점의 바이트 크기. 클라이언트가 검증/표시용으로 쓴다.
  byteSize: z.number().int().positive(),
});
export type UploadReceiptResultType = z.infer<typeof UploadReceiptResult>;

// 한 사진에 영수증이 여러 장 들어있는 경우를 위한 가로 N등분 옵션.
// count=N, index=1..N (1-based, 왼쪽이 1). count=1 이면 분할 안 함.
// 사용자가 UI 에서 "이 사진에 영수증 N장, 왼쪽부터 차수 매핑" 을 입력하면
// 클라이언트가 같은 imageToken 으로 N번 extract 를 호출 (index 만 다르게).
export const ExtractReceiptSplit = z.object({
  count: z.coerce.number().int().min(2).max(5),
  index: z.coerce.number().int().min(1).max(5),
}).refine((v) => v.index <= v.count, {
  message: 'index 는 count 이하여야 합니다.',
});
export type ExtractReceiptSplitType = z.infer<typeof ExtractReceiptSplit>;

export const ExtractReceiptInput = z.object({
  imageToken: z.string().min(1),
  // 어떤 식당의 영수증인지 — LLM 프롬프트에 해당 식당 메뉴를 힌트로
  // 주입하기 위해 필수.
  placeId: z.string().min(1),
  // 차수(N차 회식) 컨텍스트 힌트. 사용자가 '2차 영수증' 임을 명시할 때 1-based
  // 로 (roundIndex=2, roundTotal=N). 미지정/roundTotal<=1 이면 프롬프트에
  // 차수 라인을 넣지 않는다. roundIndex 는 1..roundTotal 범위.
  roundIndex: z.coerce.number().int().min(1).max(20).optional(),
  roundTotal: z.coerce.number().int().min(1).max(20).optional(),
  split: ExtractReceiptSplit.optional(),
});
export type ExtractReceiptInputType = z.infer<typeof ExtractReceiptInput>;

export const ExtractReceiptResult = z.object({
  items: z.array(ReceiptItem),
  // 영수증에 적힌 승인금액 / 총 금액. null 이면 LLM 이 찾지 못한 것.
  totalAmount: z.number().int().nonnegative().nullable(),
  // 항목 amount 합계 — 클라이언트에서 totalAmount 와 비교해 경고 배너를
  // 띄우기 위해 server 에서 미리 계산해 보낸다.
  itemsSubtotal: z.number().int().nonnegative(),
  // 소계 vs 총금액 불일치 등 사용자에게 알려줄 메시지. null 이면 정상.
  warning: z.string().nullable(),
  // 사용한 vision 모델 — 디버그용. UI 에는 노출하지 않아도 무방.
  model: z.string(),
});
export type ExtractReceiptResultType = z.infer<typeof ExtractReceiptResult>;
