-- CreateTable
CREATE TABLE "menu_mentions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "summaryId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameNorm" TEXT NOT NULL,
    "sentiment" TEXT NOT NULL,
    "traitsJson" TEXT NOT NULL DEFAULT '[]',
    CONSTRAINT "menu_mentions_summaryId_fkey" FOREIGN KEY ("summaryId") REFERENCES "review_summaries" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "review_tags" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "summaryId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "termNorm" TEXT NOT NULL,
    CONSTRAINT "review_tags_summaryId_fkey" FOREIGN KEY ("summaryId") REFERENCES "review_summaries" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "menu_mentions_nameNorm_idx" ON "menu_mentions"("nameNorm");

-- CreateIndex
CREATE INDEX "menu_mentions_restaurantId_nameNorm_idx" ON "menu_mentions"("restaurantId", "nameNorm");

-- CreateIndex
CREATE INDEX "menu_mentions_summaryId_idx" ON "menu_mentions"("summaryId");

-- CreateIndex
CREATE INDEX "review_tags_kind_termNorm_idx" ON "review_tags"("kind", "termNorm");

-- CreateIndex
CREATE INDEX "review_tags_restaurantId_kind_idx" ON "review_tags"("restaurantId", "kind");

-- CreateIndex
CREATE INDEX "review_tags_summaryId_idx" ON "review_tags"("summaryId");
