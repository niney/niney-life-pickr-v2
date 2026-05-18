-- CreateTable
CREATE TABLE "crawl_job_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "placeId" TEXT,
    "stage" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "meta" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "crawl_job_logs_jobId_createdAt_idx" ON "crawl_job_logs"("jobId", "createdAt");

-- CreateIndex
CREATE INDEX "crawl_job_logs_placeId_createdAt_idx" ON "crawl_job_logs"("placeId", "createdAt");
