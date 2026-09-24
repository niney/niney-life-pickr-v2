-- CreateTable
CREATE TABLE "life_flood_traces" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "lat" REAL NOT NULL,
    "lng" REAL NOT NULL,
    "eventYear" INTEGER NOT NULL,
    "eventMonth" INTEGER,
    "depthM" REAL,
    "disaster" TEXT,
    "cause" TEXT,
    "kind" TEXT,
    "sggCd" TEXT,
    "sourceYear" INTEGER NOT NULL
);

-- CreateIndex
CREATE INDEX "life_flood_traces_lat_lng_idx" ON "life_flood_traces"("lat", "lng");

