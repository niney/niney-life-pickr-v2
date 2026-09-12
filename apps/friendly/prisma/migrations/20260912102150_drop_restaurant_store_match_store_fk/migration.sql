-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_restaurant_store_matches" (
    "canonicalId" TEXT NOT NULL PRIMARY KEY,
    "bizesId" TEXT NOT NULL,
    "storeName" TEXT NOT NULL,
    "branch" TEXT,
    "kind" TEXT NOT NULL,
    "sclsName" TEXT NOT NULL,
    "ksicName" TEXT,
    "distM" INTEGER NOT NULL,
    "nameScore" REAL NOT NULL,
    "status" TEXT NOT NULL,
    "matchedAt" DATETIME NOT NULL,
    "lastSeenAt" DATETIME NOT NULL,
    "missingSince" DATETIME,
    CONSTRAINT "restaurant_store_matches_canonicalId_fkey" FOREIGN KEY ("canonicalId") REFERENCES "canonical_restaurants" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_restaurant_store_matches" ("bizesId", "branch", "canonicalId", "distM", "kind", "ksicName", "lastSeenAt", "matchedAt", "missingSince", "nameScore", "sclsName", "status", "storeName") SELECT "bizesId", "branch", "canonicalId", "distM", "kind", "ksicName", "lastSeenAt", "matchedAt", "missingSince", "nameScore", "sclsName", "status", "storeName" FROM "restaurant_store_matches";
DROP TABLE "restaurant_store_matches";
ALTER TABLE "new_restaurant_store_matches" RENAME TO "restaurant_store_matches";
CREATE INDEX "restaurant_store_matches_bizesId_idx" ON "restaurant_store_matches"("bizesId");
CREATE INDEX "restaurant_store_matches_status_idx" ON "restaurant_store_matches"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
