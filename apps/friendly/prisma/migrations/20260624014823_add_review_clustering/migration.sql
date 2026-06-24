-- CreateTable
CREATE TABLE "review_clusters" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "restaurantId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "tone" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "keywordsJson" TEXT NOT NULL,
    "repReviewIdsJson" TEXT NOT NULL,
    "aspectsJson" TEXT NOT NULL,
    "clusterVersion" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "review_clusters_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_review_summaries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reviewId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "text" TEXT,
    "model" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "sentiment" TEXT,
    "sentimentScore" REAL,
    "satisfactionScore" INTEGER,
    "menusJson" TEXT,
    "tipsJson" TEXT,
    "keywordsJson" TEXT,
    "analysisVersion" INTEGER,
    "embeddingJson" TEXT,
    "aspectsJson" TEXT,
    "contextLine" TEXT,
    "enrichVersion" INTEGER,
    "clusterId" TEXT,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "review_summaries_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "visitor_reviews" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "review_summaries_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "review_clusters" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_review_summaries" ("analysisVersion", "aspectsJson", "contextLine", "createdAt", "embeddingJson", "enrichVersion", "errorCode", "errorMessage", "finishedAt", "id", "keywordsJson", "menusJson", "model", "reviewId", "satisfactionScore", "sentiment", "sentimentScore", "startedAt", "status", "text", "tipsJson", "updatedAt") SELECT "analysisVersion", "aspectsJson", "contextLine", "createdAt", "embeddingJson", "enrichVersion", "errorCode", "errorMessage", "finishedAt", "id", "keywordsJson", "menusJson", "model", "reviewId", "satisfactionScore", "sentiment", "sentimentScore", "startedAt", "status", "text", "tipsJson", "updatedAt" FROM "review_summaries";
DROP TABLE "review_summaries";
ALTER TABLE "new_review_summaries" RENAME TO "review_summaries";
CREATE UNIQUE INDEX "review_summaries_reviewId_key" ON "review_summaries"("reviewId");
CREATE INDEX "review_summaries_clusterId_idx" ON "review_summaries"("clusterId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "review_clusters_restaurantId_idx" ON "review_clusters"("restaurantId");
