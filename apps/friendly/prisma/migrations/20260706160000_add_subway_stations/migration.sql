-- CreateTable
CREATE TABLE "subway_stations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "realtimeName" TEXT,
    "lineId" TEXT NOT NULL,
    "lineName" TEXT NOT NULL,
    "statnId" TEXT,
    "stationCd" TEXT,
    "frCode" TEXT,
    "lat" REAL NOT NULL,
    "lng" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "subway_master_syncs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "source" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "loadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "subway_stations_name_idx" ON "subway_stations"("name");

-- CreateIndex
CREATE INDEX "subway_stations_lineId_idx" ON "subway_stations"("lineId");

-- CreateIndex
CREATE UNIQUE INDEX "subway_stations_lineId_name_key" ON "subway_stations"("lineId", "name");
