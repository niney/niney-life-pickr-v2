-- CreateTable
CREATE TABLE "settlement_contacts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT,
    "nickname" TEXT,
    "normalizedKey" TEXT NOT NULL,
    "lastExcludeAlcohol" BOOLEAN NOT NULL DEFAULT false,
    "lastExcludeNonAlcohol" BOOLEAN NOT NULL DEFAULT false,
    "lastExcludeSide" BOOLEAN NOT NULL DEFAULT false,
    "useCount" INTEGER NOT NULL DEFAULT 1,
    "lastUsedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "settlement_contacts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_settlement_participants" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "name" TEXT,
    "nickname" TEXT,
    "excludeAlcohol" BOOLEAN NOT NULL DEFAULT false,
    "excludeNonAlcohol" BOOLEAN NOT NULL DEFAULT false,
    "excludeSide" BOOLEAN NOT NULL DEFAULT false,
    "shareAmount" INTEGER NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "contactId" TEXT,
    CONSTRAINT "settlement_participants_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "settlement_sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "settlement_participants_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "settlement_contacts" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_settlement_participants" ("excludeAlcohol", "excludeNonAlcohol", "excludeSide", "id", "name", "nickname", "orderIndex", "sessionId", "shareAmount") SELECT "excludeAlcohol", "excludeNonAlcohol", "excludeSide", "id", "name", "nickname", "orderIndex", "sessionId", "shareAmount" FROM "settlement_participants";
DROP TABLE "settlement_participants";
ALTER TABLE "new_settlement_participants" RENAME TO "settlement_participants";
CREATE INDEX "settlement_participants_sessionId_idx" ON "settlement_participants"("sessionId");
CREATE INDEX "settlement_participants_contactId_idx" ON "settlement_participants"("contactId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "settlement_contacts_userId_lastUsedAt_idx" ON "settlement_contacts"("userId", "lastUsedAt");

-- CreateIndex
CREATE UNIQUE INDEX "settlement_contacts_userId_normalizedKey_key" ON "settlement_contacts"("userId", "normalizedKey");
