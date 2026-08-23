-- Idempotency ledger for photo-inclusive portable meal backup restores.
CREATE TABLE "meal_data_imports" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "archiveId" TEXT NOT NULL,
  "entries" INTEGER NOT NULL,
  "items" INTEGER NOT NULL,
  "photos" INTEGER NOT NULL,
  "recommendations" INTEGER NOT NULL,
  "recommendationEvents" INTEGER NOT NULL,
  "preferenceResult" TEXT NOT NULL,
  "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "meal_data_imports_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "meal_data_imports_userId_archiveId_key"
  ON "meal_data_imports"("userId", "archiveId");
CREATE INDEX "meal_data_imports_userId_importedAt_idx"
  ON "meal_data_imports"("userId", "importedAt");
