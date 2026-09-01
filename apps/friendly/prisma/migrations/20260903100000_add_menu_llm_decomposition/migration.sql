-- CreateTable
CREATE TABLE "menu_llm_decompositions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nameNorm" TEXT NOT NULL,
    "menuName" TEXT NOT NULL,
    "componentsJson" TEXT NOT NULL DEFAULT '[]',
    "confidence" TEXT,
    "reason" TEXT,
    "model" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "menu_llm_decompositions_nameNorm_key" ON "menu_llm_decompositions"("nameNorm");

-- CreateIndex
CREATE INDEX "menu_llm_decompositions_version_idx" ON "menu_llm_decompositions"("version");
