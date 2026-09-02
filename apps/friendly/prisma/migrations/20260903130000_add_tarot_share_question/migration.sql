-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_tarot_readings" (
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
    "shareQuestion" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tarot_readings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_tarot_readings" ("cardsJson", "choicesJson", "createdAt", "dailyLockKey", "dayKey", "guestKey", "id", "model", "promptVersion", "question", "resultJson", "shareToken", "source", "spreadId", "topic", "userId") SELECT "cardsJson", "choicesJson", "createdAt", "dailyLockKey", "dayKey", "guestKey", "id", "model", "promptVersion", "question", "resultJson", "shareToken", "source", "spreadId", "topic", "userId" FROM "tarot_readings";
DROP TABLE "tarot_readings";
ALTER TABLE "new_tarot_readings" RENAME TO "tarot_readings";
CREATE UNIQUE INDEX "tarot_readings_shareToken_key" ON "tarot_readings"("shareToken");
CREATE UNIQUE INDEX "tarot_readings_dailyLockKey_key" ON "tarot_readings"("dailyLockKey");
CREATE INDEX "tarot_readings_userId_createdAt_idx" ON "tarot_readings"("userId", "createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
