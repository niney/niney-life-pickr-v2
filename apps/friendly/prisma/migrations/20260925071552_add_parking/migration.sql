-- CreateTable
CREATE TABLE "parking_lots" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownership" TEXT,
    "lotType" TEXT,
    "feeType" TEXT,
    "roadAddr" TEXT,
    "lotAddr" TEXT,
    "phone" TEXT,
    "orgName" TEXT,
    "totalSpaces" INTEGER,
    "wdOpen" TEXT,
    "wdClose" TEXT,
    "satOpen" TEXT,
    "satClose" TEXT,
    "holOpen" TEXT,
    "holClose" TEXT,
    "operDays" TEXT,
    "baseMin" INTEGER,
    "baseFee" INTEGER,
    "addMin" INTEGER,
    "addFee" INTEGER,
    "dayMaxFee" INTEGER,
    "dayPassFee" INTEGER,
    "monthlyFee" INTEGER,
    "satFree" BOOLEAN,
    "holFree" BOOLEAN,
    "payMethods" TEXT,
    "note" TEXT,
    "disabledZone" BOOLEAN,
    "liveKey" TEXT,
    "lat" REAL,
    "lng" REAL,
    "geoSource" TEXT,
    "baseDate" TEXT
);

-- CreateTable
CREATE TABLE "parking_occupancy_stats" (
    "key" TEXT NOT NULL,
    "dow" INTEGER NOT NULL,
    "hour" INTEGER NOT NULL,
    "samples" INTEGER NOT NULL,
    "occSum" REAL NOT NULL,
    "fullCount" INTEGER NOT NULL,
    "updatedAt" DATETIME NOT NULL,

    PRIMARY KEY ("key", "dow", "hour")
);

-- CreateTable
CREATE TABLE "parking_syncs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "kind" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "geocoded" INTEGER,
    "detail" TEXT,
    "baseDate" TEXT,
    "loadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ev_stations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "addr" TEXT,
    "addrDetail" TEXT,
    "location" TEXT,
    "lat" REAL NOT NULL,
    "lng" REAL NOT NULL,
    "useTime" TEXT,
    "busiId" TEXT,
    "operator" TEXT,
    "operatorCall" TEXT,
    "parkingFree" BOOLEAN,
    "limited" BOOLEAN,
    "limitDetail" TEXT,
    "note" TEXT,
    "kind" TEXT,
    "kindDetail" TEXT,
    "floorType" TEXT,
    "floorNum" TEXT,
    "zcode" TEXT,
    "chargerCount" INTEGER NOT NULL,
    "fastCount" INTEGER NOT NULL,
    "availableCount" INTEGER NOT NULL,
    "chargingCount" INTEGER NOT NULL,
    "hasFast" BOOLEAN NOT NULL,
    "statusAt" DATETIME
);

-- CreateTable
CREATE TABLE "ev_chargers" (
    "statId" TEXT NOT NULL,
    "chgerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "outputKw" REAL,
    "method" TEXT,
    "fast" BOOLEAN NOT NULL,
    "stat" INTEGER NOT NULL,
    "statUpdDt" TEXT,
    "lastTedt" TEXT,
    "nowTsdt" TEXT,

    PRIMARY KEY ("statId", "chgerId")
);

-- CreateIndex
CREATE INDEX "parking_lots_lat_lng_idx" ON "parking_lots"("lat", "lng");

-- CreateIndex
CREATE INDEX "parking_lots_liveKey_idx" ON "parking_lots"("liveKey");

-- CreateIndex
CREATE INDEX "parking_syncs_kind_loadedAt_idx" ON "parking_syncs"("kind", "loadedAt");

-- CreateIndex
CREATE INDEX "ev_stations_lat_lng_idx" ON "ev_stations"("lat", "lng");
