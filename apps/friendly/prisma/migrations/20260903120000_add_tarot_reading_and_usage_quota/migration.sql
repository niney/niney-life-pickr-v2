-- CreateTable
CREATE TABLE "tarot_readings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "guestKey" TEXT,
    "shareToken" TEXT,
    "spreadId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "question" TEXT NOT NULL DEFAULT '',
    "choicesJson" TEXT,
    "cardsJson" TEXT NOT NULL,
    "resultJson" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "model" TEXT,
    "promptVersion" INTEGER NOT NULL DEFAULT 1,
    "dayKey" TEXT NOT NULL,
    "dailyLockKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tarot_readings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "usage_quota_settings" (
    "feature" TEXT NOT NULL PRIMARY KEY,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "guestPerDay" INTEGER NOT NULL,
    "ipPerDay" INTEGER NOT NULL,
    "ipPerMinute" INTEGER NOT NULL,
    "globalPerDay" INTEGER NOT NULL,
    "guestCutoffPct" INTEGER NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "usage_quota_counters" (
    "feature" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,

    PRIMARY KEY ("feature", "scope", "key", "date")
);

-- CreateIndex
CREATE UNIQUE INDEX "tarot_readings_shareToken_key" ON "tarot_readings"("shareToken");

-- CreateIndex
CREATE UNIQUE INDEX "tarot_readings_dailyLockKey_key" ON "tarot_readings"("dailyLockKey");

-- CreateIndex
CREATE INDEX "tarot_readings_userId_createdAt_idx" ON "tarot_readings"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "usage_quota_counters_feature_date_scope_idx" ON "usage_quota_counters"("feature", "date", "scope");
