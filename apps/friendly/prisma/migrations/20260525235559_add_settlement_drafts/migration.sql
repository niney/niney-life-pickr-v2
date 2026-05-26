-- CreateTable
CREATE TABLE "settlement_drafts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "placeIdKey" TEXT NOT NULL DEFAULT '',
    "payload" TEXT NOT NULL,
    "placeNameHint" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "settlement_drafts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "settlement_drafts_userId_updatedAt_idx" ON "settlement_drafts"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "settlement_drafts_userId_placeIdKey_key" ON "settlement_drafts"("userId", "placeIdKey");
