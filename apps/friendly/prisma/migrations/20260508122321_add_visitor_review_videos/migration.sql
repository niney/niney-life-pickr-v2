-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_visitor_reviews" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "restaurantId" TEXT NOT NULL,
    "externalId" TEXT,
    "authorName" TEXT,
    "rating" INTEGER,
    "body" TEXT NOT NULL,
    "visitedAt" TEXT,
    "imageUrlsJson" TEXT NOT NULL,
    "videosJson" TEXT NOT NULL DEFAULT '[]',
    "contentHash" TEXT NOT NULL,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "visitor_reviews_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_visitor_reviews" ("authorName", "body", "contentHash", "externalId", "fetchedAt", "id", "imageUrlsJson", "rating", "restaurantId", "visitedAt") SELECT "authorName", "body", "contentHash", "externalId", "fetchedAt", "id", "imageUrlsJson", "rating", "restaurantId", "visitedAt" FROM "visitor_reviews";
DROP TABLE "visitor_reviews";
ALTER TABLE "new_visitor_reviews" RENAME TO "visitor_reviews";
CREATE INDEX "visitor_reviews_restaurantId_idx" ON "visitor_reviews"("restaurantId");
CREATE UNIQUE INDEX "visitor_reviews_restaurantId_externalId_key" ON "visitor_reviews"("restaurantId", "externalId");
CREATE UNIQUE INDEX "visitor_reviews_restaurantId_contentHash_key" ON "visitor_reviews"("restaurantId", "contentHash");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
