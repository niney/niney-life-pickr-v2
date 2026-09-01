-- CreateTable
CREATE TABLE "food_web_estimates" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nameNorm" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kcalPer100g" REAL,
    "agreeing" INTEGER NOT NULL DEFAULT 0,
    "basis" TEXT,
    "samplesJson" TEXT NOT NULL DEFAULT '[]',
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "food_web_estimates_nameNorm_key" ON "food_web_estimates"("nameNorm");

-- CreateIndex
CREATE INDEX "food_web_estimates_version_idx" ON "food_web_estimates"("version");
