-- CreateTable
CREATE TABLE "life_cctvs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgCode" TEXT NOT NULL,
    "orgName" TEXT NOT NULL,
    "roadAddr" TEXT,
    "lotAddr" TEXT,
    "purpose" TEXT NOT NULL,
    "cameraCount" INTEGER,
    "pixels" INTEGER,
    "direction" TEXT,
    "keepDays" INTEGER,
    "installedYm" TEXT,
    "phone" TEXT,
    "lat" REAL NOT NULL,
    "lng" REAL NOT NULL,
    "baseDate" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "life_toilets" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "roadAddr" TEXT,
    "lotAddr" TEXT,
    "orgName" TEXT NOT NULL,
    "phone" TEXT,
    "openType" TEXT NOT NULL,
    "openDetail" TEXT,
    "open24" BOOLEAN NOT NULL,
    "maleToilet" INTEGER NOT NULL DEFAULT 0,
    "maleUrinal" INTEGER NOT NULL DEFAULT 0,
    "maleDisabledToilet" INTEGER NOT NULL DEFAULT 0,
    "maleDisabledUrinal" INTEGER NOT NULL DEFAULT 0,
    "maleKidsToilet" INTEGER NOT NULL DEFAULT 0,
    "maleKidsUrinal" INTEGER NOT NULL DEFAULT 0,
    "femaleToilet" INTEGER NOT NULL DEFAULT 0,
    "femaleDisabledToilet" INTEGER NOT NULL DEFAULT 0,
    "femaleKidsToilet" INTEGER NOT NULL DEFAULT 0,
    "disabled" BOOLEAN NOT NULL,
    "kids" BOOLEAN NOT NULL,
    "ownerType" TEXT NOT NULL,
    "disposal" TEXT,
    "safetyTarget" BOOLEAN,
    "bell" BOOLEAN NOT NULL,
    "bellPlace" TEXT,
    "entranceCctv" BOOLEAN NOT NULL,
    "diaper" BOOLEAN NOT NULL,
    "diaperPlace" TEXT,
    "installedYm" TEXT,
    "remodeledYm" TEXT,
    "baseDate" TEXT NOT NULL,
    "lat" REAL,
    "lng" REAL,
    "geoSource" TEXT
);

-- CreateTable
CREATE TABLE "life_geocode_caches" (
    "type" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "lat" REAL,
    "lng" REAL,
    "refined" TEXT,
    "checkedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("type", "address")
);

-- CreateTable
CREATE TABLE "life_master_syncs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "layer" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "geocoded" INTEGER,
    "baseDate" TEXT,
    "sourceFile" TEXT,
    "loadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "life_cctvs_lat_lng_idx" ON "life_cctvs"("lat", "lng");

-- CreateIndex
CREATE INDEX "life_toilets_lat_lng_idx" ON "life_toilets"("lat", "lng");

-- CreateIndex
CREATE INDEX "life_master_syncs_layer_loadedAt_idx" ON "life_master_syncs"("layer", "loadedAt");

