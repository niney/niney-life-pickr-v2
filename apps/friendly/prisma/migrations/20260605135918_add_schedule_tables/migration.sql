-- CreateTable
CREATE TABLE "schedule_configs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobType" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "cronExpr" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Seoul',
    "lastRunAt" DATETIME,
    "lastStatus" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "schedule_runs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobType" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "totalTargets" INTEGER,
    "processedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME
);

-- CreateIndex
CREATE UNIQUE INDEX "schedule_configs_jobType_key" ON "schedule_configs"("jobType");

-- CreateIndex
CREATE INDEX "schedule_runs_jobType_startedAt_idx" ON "schedule_runs"("jobType", "startedAt");
