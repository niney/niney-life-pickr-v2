import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  AnalyzeRunResult,
  ListOperationLogsQuery,
  ListOperationRunsQuery,
  LogConfigSchema,
  OperationLogsResult,
  OperationRunDetail,
  OperationRunList,
  Routes,
  UpdateLogConfigInput,
  type OperationFeatureType,
  type OperationLogEntryType,
  type OperationLogLevelType,
  type OperationRunStatusType,
  type OperationRunType,
} from '@repo/api-contract';
import { toOperationReportView } from './log-analysis.service.js';
import { DEFAULT_LOG_RETENTION_DAYS } from './operation-log.service.js';

// 어드민 로그 화면 — 모든 기능의 run 목록/상세/스텝 로그 + 실패 run 수동
// 재분석 + 보존 기간 설정. 서비스 인스턴스(operationLog/logAnalysis)는
// plugins/logs.ts 가 decorate 한다.

const safeParseJsonObject = (raw: string): Record<string, unknown> | null => {
  try {
    const v: unknown = JSON.parse(raw);
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return v as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
};

interface RunRowWithCount {
  id: string;
  feature: string;
  jobId: string | null;
  subjectId: string | null;
  parentRunId: string | null;
  status: string;
  trigger: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  meta: string | null;
  startedAt: Date;
  finishedAt: Date | null;
  _count: { logs: number };
}

const toRunView = (row: RunRowWithCount): OperationRunType => ({
  id: row.id,
  feature: row.feature as OperationFeatureType,
  jobId: row.jobId,
  subjectId: row.subjectId,
  parentRunId: row.parentRunId,
  status: row.status as OperationRunStatusType,
  trigger: row.trigger,
  errorCode: row.errorCode,
  errorMessage: row.errorMessage,
  // run meta 는 기능마다 모양이 달라 JSON 문자열 그대로 통과 (계약 참조).
  meta: row.meta,
  startedAt: row.startedAt.toISOString(),
  finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
  logCount: row._count.logs,
});

const logsRoutes: FastifyPluginAsync = async (app) => {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(Routes.Logs.runs, {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      querystring: ListOperationRunsQuery,
      response: { 200: OperationRunList },
    },
    handler: async (req) => {
      const { page, limit, feature, status } = req.query;
      const where = {
        ...(feature ? { feature } : {}),
        ...(status ? { status } : {}),
      };
      const [total, rows] = await Promise.all([
        app.prisma.operationRun.count({ where }),
        app.prisma.operationRun.findMany({
          where,
          orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * limit,
          take: limit,
          include: { _count: { select: { logs: true } } },
        }),
      ]);
      return { items: rows.map(toRunView), total, page, limit };
    },
  });

  typed.get(Routes.Logs.run(':id'), {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      params: z.object({ id: z.string() }),
      response: { 200: OperationRunDetail },
    },
    handler: async (req) => {
      const row = await app.prisma.operationRun.findUnique({
        where: { id: req.params.id },
        include: { _count: { select: { logs: true } }, report: true },
      });
      if (!row) throw app.httpErrors.notFound('Run not found');
      return {
        run: toRunView(row),
        report: row.report ? toOperationReportView(row.report) : null,
      };
    },
  });

  // run 의 스텝 로그 — 레거시 크롤 로그와 같은 cursor 의미론 (행 id 토큰,
  // (createdAt DESC, id DESC) 정렬). debug 포함 4종 level 필터.
  typed.get(Routes.Logs.runLogs(':id'), {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      params: z.object({ id: z.string() }),
      querystring: ListOperationLogsQuery,
      response: { 200: OperationLogsResult },
    },
    handler: async (req) => {
      const limit = req.query.limit ?? 100;
      const level = req.query.level;
      const cursor = req.query.cursor;

      const cursorRow = cursor
        ? await app.prisma.operationLog.findUnique({
            where: { id: cursor },
            select: { createdAt: true, id: true },
          })
        : null;

      const rows = await app.prisma.operationLog.findMany({
        where: {
          runId: req.params.id,
          ...(level ? { level } : {}),
          ...(cursorRow
            ? {
                OR: [
                  { createdAt: { lt: cursorRow.createdAt } },
                  {
                    createdAt: cursorRow.createdAt,
                    id: { lt: cursorRow.id },
                  },
                ],
              }
            : {}),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
      });

      const hasMore = rows.length > limit;
      const sliced = hasMore ? rows.slice(0, limit) : rows;
      const logs: OperationLogEntryType[] = sliced.map((r) => ({
        id: r.id,
        runId: r.runId,
        feature: r.feature as OperationFeatureType,
        jobId: r.jobId,
        subjectId: r.subjectId,
        stage: r.stage,
        level: r.level as OperationLogLevelType,
        message: r.message,
        meta: r.meta ? safeParseJsonObject(r.meta) : null,
        createdAt: r.createdAt.toISOString(),
      }));
      const nextCursor = hasMore ? sliced[sliced.length - 1]!.id : null;
      return { logs, nextCursor };
    },
  });

  // 수동 재분석 — 동기 검증(존재/failed/LLM 설정/in-flight) 후 비동기 fire.
  // 즉시 running 스냅샷을 반환하고 완료는 웹이 run 상세 폴링으로 확인한다.
  typed.post(Routes.Logs.analyze(':id'), {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      params: z.object({ id: z.string() }),
      response: { 200: AnalyzeRunResult },
    },
    handler: async (req) => {
      const run = await app.prisma.operationRun.findUnique({
        where: { id: req.params.id },
        select: { id: true },
      });
      if (!run) throw app.httpErrors.notFound('Run not found');
      return app.logAnalysis.requestAnalysis(req.params.id);
    },
  });

  typed.get(Routes.Logs.config, {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      response: { 200: LogConfigSchema },
    },
    handler: async () => {
      const row = await app.prisma.logConfig.findUnique({
        where: { key: 'global' },
      });
      return { retentionDays: row?.retentionDays ?? DEFAULT_LOG_RETENTION_DAYS };
    },
  });

  typed.put(Routes.Logs.config, {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      body: UpdateLogConfigInput,
      response: { 200: LogConfigSchema },
    },
    handler: async (req) => {
      const row = await app.prisma.logConfig.upsert({
        where: { key: 'global' },
        create: { key: 'global', retentionDays: req.body.retentionDays },
        update: { retentionDays: req.body.retentionDays },
      });
      return { retentionDays: row.retentionDays };
    },
  });
};

export default logsRoutes;
