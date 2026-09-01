-- CreateTable
CREATE TABLE "menu_lexicon" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "target" TEXT,
    "note" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "menu_lexicon_kind_term_target_key" ON "menu_lexicon"("kind", "term", "target");

-- CreateIndex
CREATE INDEX "menu_lexicon_active_idx" ON "menu_lexicon"("active");
