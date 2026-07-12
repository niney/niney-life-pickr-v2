import { z } from 'zod';

// SSE 일괄 잡 공통 스키마 패밀리 — menu-grouping·다이닝코드/테이블링 일괄
// 저장이 같은 shape(잡 상태·카운트·item/done 이벤트)를 공유한다. 도메인은
// 아이템 스키마(키 필드 + 결과 필드)만 정의해 makeBulkJobSchemas 에 주입.

export const BulkJobState = z.enum(['pending', 'running', 'done', 'failed']);
export type BulkJobStateType = z.infer<typeof BulkJobState>;

export const BulkJobItemState = z.enum(['pending', 'running', 'done', 'failed', 'skipped']);
export type BulkJobItemStateType = z.infer<typeof BulkJobItemState>;

// 도메인 아이템 스키마 끝에 spread 하는 공통 꼬리 필드 — 에러/시각.
export const bulkJobItemTailFields = {
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
} as const;

// snapshot(현재 상태 전체) + item(한 건 종료마다 push) + done(잡 종료) 3종.
export const makeBulkJobSchemas = <TItem extends z.ZodTypeAny>(itemSchema: TItem) => ({
  snapshot: z.object({
    jobId: z.string(),
    state: BulkJobState,
    total: z.number().int(),
    doneCount: z.number().int(),
    failedCount: z.number().int(),
    skippedCount: z.number().int(),
    startedAt: z.string(),
    finishedAt: z.string().nullable(),
    items: z.array(itemSchema),
  }),
  itemEvent: z.object({
    type: z.literal('item'),
    jobId: z.string(),
    item: itemSchema,
  }),
  doneEvent: z.object({
    type: z.literal('done'),
    jobId: z.string(),
    state: BulkJobState,
    finishedAt: z.string(),
  }),
});
