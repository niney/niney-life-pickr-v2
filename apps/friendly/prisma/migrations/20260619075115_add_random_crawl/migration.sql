-- CreateTable
CREATE TABLE "global_merge_chunk_cache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cacheKey" TEXT NOT NULL,
    "mappingsJson" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "schemaHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "random_crawl_configs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobType" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "cronExpr" TEXT NOT NULL DEFAULT '0 11 * * *',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Seoul',
    "regionJson" TEXT NOT NULL DEFAULT '{}',
    "keyword" TEXT NOT NULL DEFAULT '맛집',
    "candidateCount" INTEGER NOT NULL DEFAULT 5,
    "responseTimeoutMin" INTEGER NOT NULL DEFAULT 180,
    "lastRunAt" DATETIME,
    "lastStatus" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "random_crawl_runs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "regionLabel" TEXT,
    "keyword" TEXT,
    "candidatesJson" TEXT NOT NULL DEFAULT '[]',
    "selectedPlaceId" TEXT,
    "crawledRestaurantId" TEXT,
    "telegramChatId" TEXT,
    "telegramMessageId" TEXT,
    "expiresAt" DATETIME,
    "error" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME
);

-- CreateIndex
CREATE UNIQUE INDEX "global_merge_chunk_cache_cacheKey_key" ON "global_merge_chunk_cache"("cacheKey");

-- CreateIndex
CREATE INDEX "global_merge_chunk_cache_schemaHash_idx" ON "global_merge_chunk_cache"("schemaHash");

-- CreateIndex
CREATE UNIQUE INDEX "random_crawl_configs_jobType_key" ON "random_crawl_configs"("jobType");

-- CreateIndex
CREATE INDEX "random_crawl_runs_status_idx" ON "random_crawl_runs"("status");

-- CreateIndex
CREATE INDEX "random_crawl_runs_startedAt_idx" ON "random_crawl_runs"("startedAt");
