-- CreateTable
CREATE TABLE "food_nutrient_refs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nameNorm" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "refFoodId" TEXT,
    "method" TEXT NOT NULL,
    "confidence" TEXT,
    "reason" TEXT,
    "model" TEXT,
    "version" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "food_nutrient_refs_nameNorm_key" ON "food_nutrient_refs"("nameNorm");

-- CreateIndex
CREATE INDEX "food_nutrient_refs_refFoodId_idx" ON "food_nutrient_refs"("refFoodId");

