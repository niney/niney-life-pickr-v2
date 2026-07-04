-- CreateTable
CREATE TABLE "bus_nearby_cells" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cellKey" TEXT NOT NULL,
    "fetchedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "bus_nearby_cell_hits" (
    "cellId" TEXT NOT NULL,
    "stId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,

    PRIMARY KEY ("cellId", "stId"),
    CONSTRAINT "bus_nearby_cell_hits_cellId_fkey" FOREIGN KEY ("cellId") REFERENCES "bus_nearby_cells" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "bus_nearby_cell_hits_stId_fkey" FOREIGN KEY ("stId") REFERENCES "bus_stations" ("stId") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "bus_nearby_cells_cellKey_key" ON "bus_nearby_cells"("cellKey");
