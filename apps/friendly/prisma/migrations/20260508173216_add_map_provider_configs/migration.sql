-- CreateTable
CREATE TABLE "map_provider_configs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "domains" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedById" TEXT
);

-- CreateIndex
CREATE UNIQUE INDEX "map_provider_configs_provider_key" ON "map_provider_configs"("provider");
