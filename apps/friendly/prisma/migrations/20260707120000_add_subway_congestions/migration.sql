-- CreateTable
CREATE TABLE "subway_congestions" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "stationId" TEXT,
    "lineId" TEXT NOT NULL,
    "stationName" TEXT NOT NULL,
    "dayType" TEXT NOT NULL,
    "updn" TEXT NOT NULL,
    "slots" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "subway_congestions_stationId_idx" ON "subway_congestions"("stationId");

-- CreateIndex
CREATE UNIQUE INDEX "subway_congestions_lineId_stationName_dayType_updn_key" ON "subway_congestions"("lineId", "stationName", "dayType", "updn");
