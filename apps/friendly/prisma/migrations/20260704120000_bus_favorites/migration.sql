-- CreateTable
CREATE TABLE "bus_favorite_stations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "stId" TEXT NOT NULL,
    "arsId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lat" REAL NOT NULL,
    "lng" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bus_favorite_stations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "bus_favorite_routes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "stId" TEXT NOT NULL,
    "busRouteId" TEXT NOT NULL,
    "routeName" TEXT NOT NULL,
    "stationName" TEXT NOT NULL,
    "arsId" TEXT NOT NULL,
    "lat" REAL NOT NULL,
    "lng" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bus_favorite_routes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "bus_favorite_stations_userId_idx" ON "bus_favorite_stations"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "bus_favorite_stations_userId_stId_key" ON "bus_favorite_stations"("userId", "stId");

-- CreateIndex
CREATE INDEX "bus_favorite_routes_userId_idx" ON "bus_favorite_routes"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "bus_favorite_routes_userId_stId_busRouteId_key" ON "bus_favorite_routes"("userId", "stId", "busRouteId");
