-- CreateTable
CREATE TABLE "subway_line_stations" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "lineId" TEXT NOT NULL,
    "branchKey" TEXT NOT NULL DEFAULT 'main',
    "branchName" TEXT,
    "seq" INTEGER NOT NULL,
    "stationId" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "subway_line_stations_lineId_idx" ON "subway_line_stations"("lineId");

-- CreateIndex
CREATE UNIQUE INDEX "subway_line_stations_lineId_branchKey_seq_key" ON "subway_line_stations"("lineId", "branchKey", "seq");
