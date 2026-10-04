-- AlterTable
ALTER TABLE "food_items" ADD COLUMN "nutrientsPer100gJson" TEXT;

-- AlterTable
ALTER TABLE "meal_preferences" ADD COLUMN "birthYear" INTEGER;
ALTER TABLE "meal_preferences" ADD COLUMN "sex" TEXT;

-- CreateTable
CREATE TABLE "meal_nutrition_advices" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "targetDate" TEXT NOT NULL,
    "analysisJson" TEXT NOT NULL,
    "itemsJson" TEXT NOT NULL DEFAULT '[]',
    "summary" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL,
    "model" TEXT,
    "promptVersion" INTEGER NOT NULL DEFAULT 1,
    "inputHash" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "meal_nutrition_advices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "meal_nutrition_advices_userId_createdAt_idx" ON "meal_nutrition_advices"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "meal_nutrition_advices_userId_targetDate_idx" ON "meal_nutrition_advices"("userId", "targetDate");
