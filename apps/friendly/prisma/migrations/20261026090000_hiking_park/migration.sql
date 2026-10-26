-- AlterTable
ALTER TABLE "hiking_courses" ADD COLUMN "park" TEXT;

-- AlterTable
ALTER TABLE "hiking_mountains" ADD COLUMN "parkId" TEXT;

-- CreateTable
CREATE TABLE "hiking_parks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "designatedYear" INTEGER,
    "minLat" REAL NOT NULL,
    "minLng" REAL NOT NULL,
    "maxLat" REAL NOT NULL,
    "maxLng" REAL NOT NULL,
    "polygons" TEXT NOT NULL,
    "loadedAt" DATETIME NOT NULL
);
