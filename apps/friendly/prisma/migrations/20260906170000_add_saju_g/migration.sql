-- 사주(C)의 기존 saju_* 테이블과 설정을 건드리지 않고 사주(G)를 별도로 생성한다.
BEGIN TRANSACTION;

-- CreateTable
CREATE TABLE "saju_g_readings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "snapshotJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "saju_g_readings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "saju_g_shares" (
    "token" TEXT NOT NULL PRIMARY KEY,
    "ownerHash" TEXT NOT NULL,
    "revokeHash" TEXT NOT NULL,
    "readingId" TEXT,
    "publicJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "saju_g_shares_readingId_fkey" FOREIGN KEY ("readingId") REFERENCES "saju_g_readings" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "saju_g_readings_userId_createdAt_idx" ON "saju_g_readings"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "saju_g_readings_userId_requestKey_key" ON "saju_g_readings"("userId", "requestKey");

-- CreateIndex
CREATE INDEX "saju_g_shares_readingId_idx" ON "saju_g_shares"("readingId");

CREATE TABLE "saju_g_profiles" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "birthJson" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "saju_g_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "saju_g_profiles_userId_createdAt_idx" ON "saju_g_profiles"("userId", "createdAt");


COMMIT;
