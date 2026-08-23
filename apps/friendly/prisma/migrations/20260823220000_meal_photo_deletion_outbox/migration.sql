-- Durable outbox for photo file unlink retries after meal-photo metadata is committed deleted.
-- Deliberately no users FK: cleanup must survive an account row being removed concurrently.
CREATE TABLE "meal_photo_deletions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "meal_photo_deletions_userId_token_key"
  ON "meal_photo_deletions"("userId", "token");
CREATE INDEX "meal_photo_deletions_userId_attempts_createdAt_idx"
  ON "meal_photo_deletions"("userId", "attempts", "createdAt");
CREATE INDEX "meal_photo_deletions_attempts_createdAt_idx"
  ON "meal_photo_deletions"("attempts", "createdAt");
