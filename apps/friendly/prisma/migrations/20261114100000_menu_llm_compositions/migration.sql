-- CreateTable
CREATE TABLE "menu_llm_compositions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "textHash" TEXT NOT NULL,
    "menuName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "resultJson" TEXT NOT NULL,
    "confidence" TEXT,
    "reason" TEXT,
    "model" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "menu_llm_compositions_textHash_key" ON "menu_llm_compositions"("textHash");

-- CreateIndex
CREATE INDEX "menu_llm_compositions_version_idx" ON "menu_llm_compositions"("version");
