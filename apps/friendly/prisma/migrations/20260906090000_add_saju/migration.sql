-- CreateTable
CREATE TABLE "saju_readings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "snapshotJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "saju_readings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "saju_shares" (
    "token" TEXT NOT NULL PRIMARY KEY,
    "ownerHash" TEXT NOT NULL,
    "revokeHash" TEXT NOT NULL,
    "readingId" TEXT,
    "publicJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "saju_shares_readingId_fkey" FOREIGN KEY ("readingId") REFERENCES "saju_readings" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "saju_readings_userId_createdAt_idx" ON "saju_readings"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "saju_readings_userId_requestKey_key" ON "saju_readings"("userId", "requestKey");

-- CreateIndex
CREATE INDEX "saju_shares_readingId_idx" ON "saju_shares"("readingId");
