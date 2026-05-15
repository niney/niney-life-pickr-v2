/*
  Warnings:

  - Added the required column `sourceId` to the `restaurants` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_restaurants" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL DEFAULT 'naver',
    "sourceId" TEXT NOT NULL,
    "placeId" TEXT,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "rating" REAL,
    "reviewCount" INTEGER,
    "rawSourceUrl" TEXT NOT NULL,
    "snapshotJson" TEXT NOT NULL,
    "firstCrawledAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastCrawledAt" DATETIME NOT NULL
);
-- 기존 행은 전부 네이버 — sourceId 를 placeId 그대로 백필. 신규 소스 (diningcode/
-- catchtable) 는 이후 INSERT 시점에 source/sourceId 를 명시적으로 채운다.
INSERT INTO "new_restaurants" ("address", "category", "firstCrawledAt", "id", "lastCrawledAt", "name", "phone", "placeId", "rating", "rawSourceUrl", "reviewCount", "snapshotJson", "source", "sourceId") SELECT "address", "category", "firstCrawledAt", "id", "lastCrawledAt", "name", "phone", "placeId", "rating", "rawSourceUrl", "reviewCount", "snapshotJson", 'naver', "placeId" FROM "restaurants";
DROP TABLE "restaurants";
ALTER TABLE "new_restaurants" RENAME TO "restaurants";
CREATE UNIQUE INDEX "restaurants_placeId_key" ON "restaurants"("placeId");
CREATE INDEX "restaurants_source_idx" ON "restaurants"("source");
CREATE UNIQUE INDEX "restaurants_source_sourceId_key" ON "restaurants"("source", "sourceId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
