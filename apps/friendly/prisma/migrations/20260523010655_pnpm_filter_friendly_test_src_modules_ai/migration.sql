-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_llm_provider_configs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'chat',
    "apiKey" TEXT NOT NULL,
    "baseUrl" TEXT,
    "defaultModel" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "maxConcurrent" INTEGER NOT NULL DEFAULT 15,
    "updatedAt" DATETIME NOT NULL,
    "updatedById" TEXT
);
INSERT INTO "new_llm_provider_configs" ("apiKey", "baseUrl", "defaultModel", "enabled", "id", "maxConcurrent", "provider", "updatedAt", "updatedById") SELECT "apiKey", "baseUrl", "defaultModel", "enabled", "id", "maxConcurrent", "provider", "updatedAt", "updatedById" FROM "llm_provider_configs";
DROP TABLE "llm_provider_configs";
ALTER TABLE "new_llm_provider_configs" RENAME TO "llm_provider_configs";
CREATE UNIQUE INDEX "llm_provider_configs_provider_purpose_key" ON "llm_provider_configs"("provider", "purpose");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
