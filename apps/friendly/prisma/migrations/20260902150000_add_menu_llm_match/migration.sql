-- CreateTable
CREATE TABLE "menu_llm_matches" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nameNorm" TEXT NOT NULL,
    "menuName" TEXT NOT NULL,
    "foodId" TEXT,
    "foodName" TEXT,
    "canonical" TEXT,
    "choice" TEXT,
    "confidence" TEXT,
    "reason" TEXT,
    "model" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "menu_llm_matches_nameNorm_key" ON "menu_llm_matches"("nameNorm");

-- CreateIndex
CREATE INDEX "menu_llm_matches_foodId_idx" ON "menu_llm_matches"("foodId");

-- CreateIndex
CREATE INDEX "menu_llm_matches_version_idx" ON "menu_llm_matches"("version");
