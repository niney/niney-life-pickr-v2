-- CreateTable
CREATE TABLE "food_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "nameNorm" TEXT NOT NULL,
    "repName" TEXT,
    "aliasesJson" TEXT NOT NULL DEFAULT '[]',
    "aliasNormsJson" TEXT NOT NULL DEFAULT '[]',
    "dishType" TEXT,
    "mainIngredient" TEXT,
    "cuisine" TEXT,
    "ingredientsJson" TEXT,
    "servingG" REAL,
    "kcal" REAL,
    "carbG" REAL,
    "proteinG" REAL,
    "fatG" REAL,
    "sodiumMg" REAL,
    "sugarG" REAL,
    "source" TEXT NOT NULL,
    "sourceId" TEXT,
    "sourceCategory" TEXT,
    "sourceRefsJson" TEXT NOT NULL DEFAULT '[]',
    "popularity" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "classifyVersion" INTEGER,
    "classifyModel" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "food_import_configs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobType" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "cronExpr" TEXT NOT NULL DEFAULT '0 4 1 * *',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Seoul',
    "sourcesJson" TEXT NOT NULL DEFAULT '["mfds-nutrition","mfds-recipe","mafra-recipe","menu-canonical"]',
    "classify" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" DATETIME,
    "lastStatus" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "food_import_runs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "sourcesJson" TEXT NOT NULL DEFAULT '[]',
    "statsJson" TEXT NOT NULL DEFAULT '[]',
    "classifiedCount" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME
);

-- CreateIndex
CREATE UNIQUE INDEX "food_items_nameNorm_key" ON "food_items"("nameNorm");

-- CreateIndex
CREATE INDEX "food_items_source_sourceId_idx" ON "food_items"("source", "sourceId");

-- CreateIndex
CREATE INDEX "food_items_dishType_mainIngredient_idx" ON "food_items"("dishType", "mainIngredient");

-- CreateIndex
CREATE INDEX "food_items_active_popularity_idx" ON "food_items"("active", "popularity");

-- CreateIndex
CREATE UNIQUE INDEX "food_import_configs_jobType_key" ON "food_import_configs"("jobType");

-- CreateIndex
CREATE INDEX "food_import_runs_status_idx" ON "food_import_runs"("status");

-- CreateIndex
CREATE INDEX "food_import_runs_startedAt_idx" ON "food_import_runs"("startedAt");
