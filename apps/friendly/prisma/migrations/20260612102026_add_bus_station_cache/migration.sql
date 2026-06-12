-- CreateTable
CREATE TABLE "bus_stations" (
    "stId" TEXT NOT NULL PRIMARY KEY,
    "arsId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lat" REAL NOT NULL,
    "lng" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "bus_station_searches" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "keyword" TEXT NOT NULL,
    "fetchedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "bus_station_search_hits" (
    "searchId" TEXT NOT NULL,
    "stId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,

    PRIMARY KEY ("searchId", "stId"),
    CONSTRAINT "bus_station_search_hits_searchId_fkey" FOREIGN KEY ("searchId") REFERENCES "bus_station_searches" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "bus_station_search_hits_stId_fkey" FOREIGN KEY ("stId") REFERENCES "bus_stations" ("stId") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "bus_stations_arsId_idx" ON "bus_stations"("arsId");

-- CreateIndex
CREATE UNIQUE INDEX "bus_station_searches_keyword_key" ON "bus_station_searches"("keyword");
