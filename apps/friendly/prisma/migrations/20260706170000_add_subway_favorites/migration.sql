-- CreateTable
CREATE TABLE "subway_favorite_stations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lines" TEXT NOT NULL,
    "lat" REAL NOT NULL,
    "lng" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "subway_favorite_stations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "subway_favorite_lines" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "stationName" TEXT NOT NULL,
    "lat" REAL NOT NULL,
    "lng" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "subway_favorite_lines_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "subway_favorite_stations_userId_idx" ON "subway_favorite_stations"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "subway_favorite_stations_userId_stationId_key" ON "subway_favorite_stations"("userId", "stationId");

-- CreateIndex
CREATE INDEX "subway_favorite_lines_userId_idx" ON "subway_favorite_lines"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "subway_favorite_lines_userId_stationId_lineId_key" ON "subway_favorite_lines"("userId", "stationId", "lineId");
