-- CreateTable
CREATE TABLE "subway_line_shapes" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "lineId" TEXT NOT NULL,
    "branchKey" TEXT NOT NULL DEFAULT 'main',
    "path" TEXT NOT NULL,
    "stationS" TEXT NOT NULL,
    "osmRelationId" TEXT,
    "loadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "subway_line_shapes_lineId_branchKey_key" ON "subway_line_shapes"("lineId", "branchKey");
