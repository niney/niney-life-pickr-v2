-- CreateTable
CREATE TABLE "operation_runs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "feature" TEXT NOT NULL,
    "jobId" TEXT,
    "subjectId" TEXT,
    "parentRunId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'running',
    "trigger" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "meta" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME
);

-- CreateTable
CREATE TABLE "operation_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "jobId" TEXT,
    "subjectId" TEXT,
    "stage" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "meta" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "operation_logs_runId_fkey" FOREIGN KEY ("runId") REFERENCES "operation_runs" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "operation_reports" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "provider" TEXT,
    "model" TEXT,
    "summary" TEXT,
    "rootCause" TEXT,
    "details" TEXT,
    "suggestions" TEXT,
    "severity" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "durationMs" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "operation_reports_runId_fkey" FOREIGN KEY ("runId") REFERENCES "operation_runs" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "log_configs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL DEFAULT 'global',
    "retentionDays" INTEGER NOT NULL DEFAULT 30,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "operation_runs_feature_startedAt_idx" ON "operation_runs"("feature", "startedAt");

-- CreateIndex
CREATE INDEX "operation_runs_status_startedAt_idx" ON "operation_runs"("status", "startedAt");

-- CreateIndex
CREATE INDEX "operation_runs_jobId_idx" ON "operation_runs"("jobId");

-- CreateIndex
CREATE INDEX "operation_runs_startedAt_idx" ON "operation_runs"("startedAt");

-- CreateIndex
CREATE INDEX "operation_logs_runId_createdAt_idx" ON "operation_logs"("runId", "createdAt");

-- CreateIndex
CREATE INDEX "operation_logs_feature_createdAt_idx" ON "operation_logs"("feature", "createdAt");

-- CreateIndex
CREATE INDEX "operation_logs_subjectId_createdAt_idx" ON "operation_logs"("subjectId", "createdAt");

-- CreateIndex
CREATE INDEX "operation_logs_createdAt_idx" ON "operation_logs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "operation_reports_runId_key" ON "operation_reports"("runId");

-- CreateIndex
CREATE INDEX "operation_reports_status_createdAt_idx" ON "operation_reports"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "log_configs_key_key" ON "log_configs"("key");

-- 레거시 crawl_job_logs 백필: jobId별 합성 run + 로그 복사 (어드민 과거 이력 유지)
INSERT INTO operation_runs (id, feature, jobId, subjectId, status, meta, startedAt, finishedAt)
SELECT 'legacy-' || jobId, 'crawl', jobId, MIN(placeId), 'done', '{"legacy":true}', MIN(createdAt), MAX(createdAt)
FROM crawl_job_logs GROUP BY jobId;
INSERT INTO operation_logs (id, runId, feature, jobId, subjectId, stage, level, message, meta, createdAt)
SELECT id, 'legacy-' || jobId,
  CASE WHEN stage LIKE 'summary%' THEN 'summary' ELSE 'crawl' END,
  jobId, placeId, stage, level, message, meta, createdAt
FROM crawl_job_logs;
