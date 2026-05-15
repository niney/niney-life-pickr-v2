-- CreateTable
CREATE TABLE "canonical_restaurants" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "primaryCategory" TEXT,
    "latitude" REAL,
    "longitude" REAL,
    "searchKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- Backfill: 기존 Restaurant 1행마다 Canonical 1행 (id 그대로 재활용 — Restaurant.id == 본인 Canonical.id 초기값).
-- 좌표 필드명이 source 별로 다름: Naver=latitude/longitude, DC=lat/lng. COALESCE 로 한 컬럼에 통일.
INSERT INTO "canonical_restaurants" ("id", "name", "primaryCategory", "latitude", "longitude", "searchKey", "createdAt", "updatedAt")
SELECT
  "id",
  "name",
  "category",
  COALESCE(json_extract("snapshotJson", '$.latitude'), json_extract("snapshotJson", '$.lat')),
  COALESCE(json_extract("snapshotJson", '$.longitude'), json_extract("snapshotJson", '$.lng')),
  NULL,
  "firstCrawledAt",
  "lastCrawledAt"
FROM "restaurants";

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_restaurants" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL DEFAULT 'naver',
    "sourceId" TEXT NOT NULL,
    "placeId" TEXT,
    "canonicalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "rating" REAL,
    "reviewCount" INTEGER,
    "rawSourceUrl" TEXT NOT NULL,
    "snapshotJson" TEXT NOT NULL,
    "firstCrawledAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastCrawledAt" DATETIME NOT NULL,
    CONSTRAINT "restaurants_canonicalId_fkey" FOREIGN KEY ("canonicalId") REFERENCES "canonical_restaurants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
-- canonicalId 백필: 위 INSERT 에서 Canonical.id = Restaurant.id 로 만들었으므로 동일 값 사용.
INSERT INTO "new_restaurants" ("address", "category", "firstCrawledAt", "id", "lastCrawledAt", "name", "phone", "placeId", "rating", "rawSourceUrl", "reviewCount", "snapshotJson", "source", "sourceId", "canonicalId")
  SELECT "address", "category", "firstCrawledAt", "id", "lastCrawledAt", "name", "phone", "placeId", "rating", "rawSourceUrl", "reviewCount", "snapshotJson", "source", "sourceId", "id" FROM "restaurants";
DROP TABLE "restaurants";
ALTER TABLE "new_restaurants" RENAME TO "restaurants";
CREATE UNIQUE INDEX "restaurants_placeId_key" ON "restaurants"("placeId");
CREATE INDEX "restaurants_source_idx" ON "restaurants"("source");
CREATE INDEX "restaurants_canonicalId_idx" ON "restaurants"("canonicalId");
CREATE UNIQUE INDEX "restaurants_source_sourceId_key" ON "restaurants"("source", "sourceId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "canonical_restaurants_searchKey_idx" ON "canonical_restaurants"("searchKey");

-- CreateIndex
CREATE INDEX "canonical_restaurants_latitude_longitude_idx" ON "canonical_restaurants"("latitude", "longitude");
