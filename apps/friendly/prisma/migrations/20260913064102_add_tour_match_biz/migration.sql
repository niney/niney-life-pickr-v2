-- CreateTable
CREATE TABLE "restaurant_tour_matches" (
    "canonicalId" TEXT NOT NULL PRIMARY KEY,
    "tourPlaceId" TEXT NOT NULL,
    "placeName" TEXT NOT NULL,
    "typeShort" TEXT NOT NULL,
    "distM" INTEGER NOT NULL,
    "nameScore" REAL NOT NULL,
    "status" TEXT NOT NULL,
    "matchedAt" DATETIME NOT NULL,
    "lastSeenAt" DATETIME NOT NULL,
    CONSTRAINT "restaurant_tour_matches_canonicalId_fkey" FOREIGN KEY ("canonicalId") REFERENCES "canonical_restaurants" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "tour_place_biz_statuses" (
    "placeId" TEXT NOT NULL PRIMARY KEY,
    "brno" TEXT NOT NULL,
    "storeNm" TEXT,
    "bStt" TEXT NOT NULL,
    "bSttCd" TEXT,
    "endDt" TEXT,
    "taxType" TEXT,
    "checkedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "restaurant_tour_matches_tourPlaceId_key" ON "restaurant_tour_matches"("tourPlaceId");

-- CreateIndex
CREATE INDEX "restaurant_tour_matches_status_idx" ON "restaurant_tour_matches"("status");

-- CreateIndex
CREATE INDEX "tour_place_biz_statuses_bStt_idx" ON "tour_place_biz_statuses"("bStt");

-- CreateIndex
CREATE INDEX "tour_place_biz_statuses_brno_idx" ON "tour_place_biz_statuses"("brno");
