import { z } from 'zod';

// 주기 자동 실행 — 관리자가 cron 으로 "정규화 → 글로벌 머지" 파이프라인을
// 예약. 인프로세스 스케줄러(croner)가 단일 Fastify 인스턴스 안에서 돈다.
// 현재 jobType 은 단일('normalize-merge') 이지만, 추후 다른 주기 작업이
// 생길 수 있어 스키마 차원에서 다중을 대비한다.
//
// cronExpr 의 형식 검증은 서버 라우트에서 croner 로 한다 (api-contract 는
// 순수 스키마 패키지라 croner 에 의존하지 않는다 — shared → api-contract 만
// 허용하는 의존 방향 규칙과 일관).

export const ScheduleJobType = z.enum(['normalize-merge']);
export type ScheduleJobTypeType = z.infer<typeof ScheduleJobType>;

// cron tick 으로 시작했는지, 어드민 "지금 실행" 버튼으로 시작했는지.
export const ScheduleTrigger = z.enum(['cron', 'manual']);
export type ScheduleTriggerType = z.infer<typeof ScheduleTrigger>;

// running  : 실행 중
// done     : 정상 완료
// failed   : 파이프라인 중 오류
// skipped  : 이전 실행이 아직 안 끝나 이번 tick 을 건너뜀 (overlap 방지)
// interrupted : graceful shutdown(SIGTERM/SIGINT) 중 abort 됨
export const ScheduleRunStatus = z.enum([
  'running',
  'done',
  'failed',
  'skipped',
  'interrupted',
]);
export type ScheduleRunStatusType = z.infer<typeof ScheduleRunStatus>;

// 파이프라인 단계 — live 진행 표시용. 완료된 이력 행은 null.
export const SchedulePhase = z.enum(['collecting', 'grouping', 'merging', 'done']);
export type SchedulePhaseType = z.infer<typeof SchedulePhase>;

// ── 설정 ────────────────────────────────────────────────────────────

// 설정 조회 응답 (GET /admin/schedule). 행이 아직 없으면 서버가 기본값
// (enabled=false, 권장 cronExpr) 으로 채워 반환한다.
export const ScheduleConfig = z.object({
  jobType: ScheduleJobType,
  enabled: z.boolean(),
  cronExpr: z.string(),
  timezone: z.string(),
  // 마지막 실행 시각/결과 — 한 번도 안 돌았으면 null.
  lastRunAt: z.string().nullable(),
  lastStatus: ScheduleRunStatus.nullable(),
  // croner.nextRun() 으로 계산한 다음 실행 시각. enabled=false 면 null.
  nextRunAt: z.string().nullable(),
  updatedAt: z.string(),
});
export type ScheduleConfigType = z.infer<typeof ScheduleConfig>;

// 설정 변경 (PUT /admin/schedule). jobType 은 단일이라 body 에 없고 서버가
// 'normalize-merge' 로 고정한다.
export const ScheduleConfigInput = z.object({
  enabled: z.boolean(),
  cronExpr: z.string().min(1).max(120),
  timezone: z.string().min(1).max(64).default('Asia/Seoul'),
});
export type ScheduleConfigInputType = z.infer<typeof ScheduleConfigInput>;

// ── 실행(run) ───────────────────────────────────────────────────────

// 한 번의 파이프라인 실행. 이력 조회(영속)와 live 스냅샷(메모리) 양쪽에서
// 같은 모양을 쓴다. phase/totalTargets 는 진행 중에만 의미가 있어 완료된
// 이력 행에서는 null 일 수 있다.
export const ScheduleRun = z.object({
  runId: z.string(),
  jobType: ScheduleJobType,
  trigger: ScheduleTrigger,
  status: ScheduleRunStatus,
  phase: SchedulePhase.nullable(),
  // collecting 단계 후 확정되는 처리 대상 식당 수. 미정 시 null.
  totalTargets: z.number().int().nullable(),
  // 정규화(grouping) 완료한 식당 수.
  processedCount: z.number().int(),
  // 크롤 진행 중이라 이번 실행에서 제외한 식당 수.
  skippedCount: z.number().int(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  error: z.string().nullable(),
});
export type ScheduleRunType = z.infer<typeof ScheduleRun>;

export const ScheduleRunList = z.object({
  items: z.array(ScheduleRun),
  // 현재 진행 중인 run id — UI 가 SSE 를 붙을 대상. 없으면 null.
  inflightRunId: z.string().nullable(),
});
export type ScheduleRunListType = z.infer<typeof ScheduleRunList>;

// ── SSE 이벤트 ──────────────────────────────────────────────────────

export const ScheduleProgressEvent = z.object({
  type: z.literal('progress'),
  runId: z.string(),
  phase: SchedulePhase,
  processed: z.number().int(),
  total: z.number().int(),
  skipped: z.number().int(),
  // 현재 처리 중인 식당명 (표시용). merging 단계 등에서는 null.
  currentName: z.string().nullable(),
});
export type ScheduleProgressEventType = z.infer<typeof ScheduleProgressEvent>;

export const ScheduleDoneEvent = z.object({
  type: z.literal('done'),
  runId: z.string(),
  status: ScheduleRunStatus,
  finishedAt: z.string(),
});
export type ScheduleDoneEventType = z.infer<typeof ScheduleDoneEvent>;

// ── cron 미리보기 ───────────────────────────────────────────────────

// 저장 전 cron 식 검증 + 다음 실행 시각 미리보기 (POST /admin/schedule/preview).
// 어드민 UI 가 입력 중 디바운스로 호출 — valid=false 면 error 노출.
export const SchedulePreviewInput = z.object({
  cronExpr: z.string().min(1).max(120),
  timezone: z.string().min(1).max(64).default('Asia/Seoul'),
});
export type SchedulePreviewInputType = z.infer<typeof SchedulePreviewInput>;

export const SchedulePreviewResult = z.object({
  valid: z.boolean(),
  error: z.string().nullable(),
  // croner 로 계산한 다음 실행 시각 (valid 일 때 최대 5개).
  nextRuns: z.array(z.string()),
});
export type SchedulePreviewResultType = z.infer<typeof SchedulePreviewResult>;
