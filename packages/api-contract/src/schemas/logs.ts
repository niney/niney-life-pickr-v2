import { z } from 'zod';
import { PaginationQuerySchema, PaginatedSchema } from './common.js';
import { AiErrorCode } from './ai.js';

// 범용 작업 로그 — 모든 백그라운드/동기 작업(크롤·요약·메뉴 그룹핑 등)의
// 실행 단위(run)와 스텝 로그를 한 테이블 체계로 기록한다. 실패한 run 은
// LLM(log-analysis 용도)이 원인 분석 보고서를 생성한다.

// 계측 대상 기능 8종. 새 기능이 생기면 여기에만 추가하면 된다.
export const OperationFeature = z.enum([
  'crawl',
  'summary',
  'menu-grouping',
  'settlement-extraction',
  'auto-discover',
  'schedule',
  'global-merge',
  'diningcode-bulk-save',
]);
export type OperationFeatureType = z.infer<typeof OperationFeature>;

// CrawlLogLevel(info|warn|error) 과 달리 debug 를 포함한다 — debug 는 DB 에만
// 쌓이고 SSE 로는 내보내지 않아 기존 SSE 계약을 깨지 않는다.
export const OperationLogLevel = z.enum(['debug', 'info', 'warn', 'error']);
export type OperationLogLevelType = z.infer<typeof OperationLogLevel>;

export const OperationRunStatus = z.enum([
  'running',
  'done',
  'failed',
  'cancelled',
]);
export type OperationRunStatusType = z.infer<typeof OperationRunStatus>;

export const OperationReportStatus = z.enum([
  'pending',
  'running',
  'done',
  'failed',
]);
export type OperationReportStatusType = z.infer<typeof OperationReportStatus>;

export const OperationReportSeverity = z.enum(['low', 'medium', 'high']);
export type OperationReportSeverityType = z.infer<typeof OperationReportSeverity>;

// 분석 호출 자체의 실패 분류 — provider 에러(AiErrorCode)에 분석 고유 사유를
// 더한다. no_analysis_llm 은 log-analysis 용도 LLM 미설정(수동 분석 시에만
// 노출 — 자동 분석은 조용히 스킵), analysis_in_flight 는 같은 run 중복 요청.
export const LogAnalysisErrorCode = z.enum([
  ...AiErrorCode.options,
  'no_analysis_llm',
  'parse_failed',
  'run_not_failed',
  'analysis_in_flight',
]);
export type LogAnalysisErrorCodeType = z.infer<typeof LogAnalysisErrorCode>;

// ── run / 로그 / 보고서 ─────────────────────────────────────────────

export const OperationRunSchema = z.object({
  id: z.string(),
  feature: OperationFeature,
  // 인메모리 레지스트리 잡 ID (crawl jobId, ScheduleRun.id 등). 레지스트리
  // 없는 동기 작업(settlement-extraction 등)은 null.
  jobId: z.string().nullable(),
  // placeId / restaurantId / 'dc:<vRid>' 등 작업 대상 식별자.
  subjectId: z.string().nullable(),
  // 중첩 run 연계 — schedule run 이 menu-grouping/global-merge 를 품는 경우.
  parentRunId: z.string().nullable(),
  status: OperationRunStatus,
  // 'manual'|'cron'|'auto'|'user' 등 — 기능별 어휘가 달라 자유 문자열.
  trigger: z.string().nullable(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  // JSON 직렬화 문자열 그대로 — run 메타는 기능마다 모양이 달라 서버가
  // 파싱하지 않고 통과시킨다 (표시 시 클라이언트가 파싱).
  meta: z.string().nullable(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  // 이 run 에 쌓인 스텝 로그 수 (목록 화면 표시용).
  logCount: z.number().int().nonnegative(),
});
export type OperationRunType = z.infer<typeof OperationRunSchema>;

export const OperationLogEntrySchema = z.object({
  id: z.string(),
  runId: z.string(),
  feature: OperationFeature,
  jobId: z.string().nullable(),
  subjectId: z.string().nullable(),
  stage: z.string(),
  level: OperationLogLevel,
  message: z.string(),
  // 모델·지연ms·토큰 등 디버깅 메타. DB 에는 JSON 문자열로 저장되지만 응답
  // 에서는 파싱해 객체로 반환 (CrawlJobLogEntry 와 동일한 표시 편의).
  meta: z.record(z.unknown()).nullable(),
  createdAt: z.string(),
});
export type OperationLogEntryType = z.infer<typeof OperationLogEntrySchema>;

// 실패 run 1건에 대한 LLM 분석 보고서. pending/running 동안 분석 필드는
// null — 웹은 status 를 폴링해 완료 시 본문을 채운다.
export const OperationReportSchema = z.object({
  id: z.string(),
  runId: z.string(),
  status: OperationReportStatus,
  provider: z.string().nullable(),
  model: z.string().nullable(),
  // 1-2문장 요약.
  summary: z.string().nullable(),
  rootCause: z.string().nullable(),
  // markdown 본문.
  details: z.string().nullable(),
  // DB 에는 JSON 문자열로 저장 — 서버가 파싱해 배열로 반환한다.
  suggestions: z.array(z.string()).nullable(),
  severity: OperationReportSeverity.nullable(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  promptTokens: z.number().int().nonnegative().nullable(),
  completionTokens: z.number().int().nonnegative().nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type OperationReportType = z.infer<typeof OperationReportSchema>;

// ── 조회 (어드민 로그 화면) ─────────────────────────────────────────

export const ListOperationRunsQuery = PaginationQuerySchema.extend({
  feature: OperationFeature.optional(),
  status: OperationRunStatus.optional(),
});
export type ListOperationRunsQueryType = z.infer<typeof ListOperationRunsQuery>;

export const OperationRunList = PaginatedSchema(OperationRunSchema);
export type OperationRunListType = z.infer<typeof OperationRunList>;

export const OperationRunDetail = z.object({
  run: OperationRunSchema,
  // 보고서가 아직 만들어지지 않았으면 null (실패 전 run, 분석 LLM 미설정 등).
  report: OperationReportSchema.nullable(),
});
export type OperationRunDetailType = z.infer<typeof OperationRunDetail>;

// 스텝 로그 cursor 페이지네이션 — CrawlJobLogsQuery 와 같은 의미론
// (행 id 토큰, 최신 → 과거 순).
export const ListOperationLogsQuery = z.object({
  level: OperationLogLevel.optional(),
  // 다음 페이지 토큰. 응답 nextCursor 를 그대로 전달. 미지정이면 최신부터.
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});
export type ListOperationLogsQueryType = z.infer<typeof ListOperationLogsQuery>;

export const OperationLogsResult = z.object({
  // 최신 → 과거 순. UI 는 표시 시 다시 뒤집어 시간 오름차순으로 보여줄 수 있음.
  logs: z.array(OperationLogEntrySchema),
  nextCursor: z.string().nullable(),
});
export type OperationLogsResultType = z.infer<typeof OperationLogsResult>;

// ── 보존 설정 ───────────────────────────────────────────────────────

// 전역 단일 보존 기간. 보고서가 있는 run 은 정리 대상에서 제외된다.
export const LogConfigSchema = z.object({
  retentionDays: z.number().int(),
});
export type LogConfigType = z.infer<typeof LogConfigSchema>;

export const UpdateLogConfigInput = z.object({
  retentionDays: z.number().int().min(1).max(365),
});
export type UpdateLogConfigInputType = z.infer<typeof UpdateLogConfigInput>;

// ── 수동 재분석 ─────────────────────────────────────────────────────

// POST analyze 응답 — ok=true 는 분석을 수락한 시점의 보고서 스냅샷
// (status='running'). 완료는 웹이 run 상세 폴링으로 확인한다.
export const AnalyzeRunResult = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    report: OperationReportSchema,
  }),
  z.object({
    ok: z.literal(false),
    error: LogAnalysisErrorCode,
    message: z.string(),
  }),
]);
export type AnalyzeRunResultType = z.infer<typeof AnalyzeRunResult>;
