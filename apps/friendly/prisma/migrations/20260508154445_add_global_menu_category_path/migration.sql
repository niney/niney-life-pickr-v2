-- AlterTable
ALTER TABLE "global_menu_canonicals" ADD COLUMN "categoryPath" TEXT;

-- CreateIndex
CREATE INDEX "global_menu_canonicals_categoryPath_idx" ON "global_menu_canonicals"("categoryPath");
