-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_random_crawl_configs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobType" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "cronExpr" TEXT NOT NULL DEFAULT '0 11 * * *',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Seoul',
    "regionJson" TEXT NOT NULL DEFAULT '{}',
    "keyword" TEXT NOT NULL DEFAULT '맛집',
    "candidateCount" INTEGER NOT NULL DEFAULT 5,
    "responseTimeoutMin" INTEGER NOT NULL DEFAULT 180,
    "timeoutAction" TEXT NOT NULL DEFAULT 'skip',
    "lastRunAt" DATETIME,
    "lastStatus" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_random_crawl_configs" ("candidateCount", "createdAt", "cronExpr", "enabled", "id", "jobType", "keyword", "lastRunAt", "lastStatus", "regionJson", "responseTimeoutMin", "timezone", "updatedAt") SELECT "candidateCount", "createdAt", "cronExpr", "enabled", "id", "jobType", "keyword", "lastRunAt", "lastStatus", "regionJson", "responseTimeoutMin", "timezone", "updatedAt" FROM "random_crawl_configs";
DROP TABLE "random_crawl_configs";
ALTER TABLE "new_random_crawl_configs" RENAME TO "random_crawl_configs";
CREATE UNIQUE INDEX "random_crawl_configs_jobType_key" ON "random_crawl_configs"("jobType");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
