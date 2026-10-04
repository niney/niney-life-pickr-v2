-- DropIndex
DROP INDEX "meal_items_nameNorm_idx";

-- CreateIndex
CREATE INDEX "meal_items_nameNorm_entryId_idx" ON "meal_items"("nameNorm", "entryId");
