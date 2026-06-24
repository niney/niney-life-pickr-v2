-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_review_clusters" (
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
    "corpusSize" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "review_clusters_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_review_clusters" ("aspectsJson", "clusterVersion", "createdAt", "id", "keywordsJson", "label", "ordinal", "repReviewIdsJson", "restaurantId", "size", "tone") SELECT "aspectsJson", "clusterVersion", "createdAt", "id", "keywordsJson", "label", "ordinal", "repReviewIdsJson", "restaurantId", "size", "tone" FROM "review_clusters";
DROP TABLE "review_clusters";
ALTER TABLE "new_review_clusters" RENAME TO "review_clusters";
CREATE INDEX "review_clusters_restaurantId_idx" ON "review_clusters"("restaurantId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
