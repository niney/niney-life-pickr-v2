-- CreateTable
CREATE TABLE "saju_profiles" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "calendar" TEXT NOT NULL,
    "birthYear" INTEGER NOT NULL,
    "birthMonth" INTEGER NOT NULL,
    "birthDay" INTEGER NOT NULL,
    "leapMonth" BOOLEAN NOT NULL DEFAULT false,
    "birthHour" INTEGER,
    "birthMinute" INTEGER,
    "gender" TEXT NOT NULL,
    "optionsJson" TEXT NOT NULL DEFAULT '{}',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "saju_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "saju_readings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "guestKey" TEXT,
    "shareToken" TEXT,
    "kind" TEXT NOT NULL,
    "inputJson" TEXT NOT NULL,
    "chartJson" TEXT NOT NULL,
    "resultJson" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "model" TEXT,
    "promptVersion" INTEGER NOT NULL DEFAULT 1,
    "dayKey" TEXT NOT NULL,
    "dailyLockKey" TEXT,
    "shareBirth" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "saju_readings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "saju_profiles_userId_isPrimary_idx" ON "saju_profiles"("userId", "isPrimary");

-- CreateIndex
CREATE UNIQUE INDEX "saju_readings_shareToken_key" ON "saju_readings"("shareToken");

-- CreateIndex
CREATE UNIQUE INDEX "saju_readings_dailyLockKey_key" ON "saju_readings"("dailyLockKey");

-- CreateIndex
CREATE INDEX "saju_readings_userId_createdAt_idx" ON "saju_readings"("userId", "createdAt");
