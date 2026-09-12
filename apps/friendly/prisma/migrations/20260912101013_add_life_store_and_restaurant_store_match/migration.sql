-- CreateTable
CREATE TABLE "life_stores" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "branch" TEXT,
    "kind" TEXT NOT NULL,
    "mclsCd" TEXT NOT NULL,
    "sclsCd" TEXT NOT NULL,
    "sclsName" TEXT NOT NULL,
    "ksicName" TEXT,
    "sggCd" TEXT NOT NULL,
    "sggName" TEXT NOT NULL,
    "umdName" TEXT,
    "roadAddr" TEXT,
    "lotAddr" TEXT,
    "bldName" TEXT,
    "floor" TEXT,
    "lat" REAL NOT NULL,
    "lng" REAL NOT NULL
);

-- CreateTable
CREATE TABLE "restaurant_store_matches" (
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
    CONSTRAINT "restaurant_store_matches_canonicalId_fkey" FOREIGN KEY ("canonicalId") REFERENCES "canonical_restaurants" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "restaurant_store_matches_bizesId_fkey" FOREIGN KEY ("bizesId") REFERENCES "life_stores" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

-- CreateIndex
CREATE INDEX "life_stores_lat_lng_idx" ON "life_stores"("lat", "lng");

-- CreateIndex
CREATE INDEX "life_stores_kind_lat_lng_idx" ON "life_stores"("kind", "lat", "lng");

-- CreateIndex
CREATE INDEX "restaurant_store_matches_bizesId_idx" ON "restaurant_store_matches"("bizesId");

-- CreateIndex
CREATE INDEX "restaurant_store_matches_status_idx" ON "restaurant_store_matches"("status");
