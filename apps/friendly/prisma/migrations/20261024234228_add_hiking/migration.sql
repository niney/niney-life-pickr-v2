-- CreateTable
CREATE TABLE "hiking_mountains" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "gpxName" TEXT NOT NULL,
    "subtitle" TEXT,
    "heightM" REAL,
    "area" TEXT,
    "regions" TEXT NOT NULL,
    "overview" TEXT,
    "details" TEXT,
    "reason" TEXT,
    "officialCourses" TEXT,
    "summitName" TEXT,
    "summitLat" REAL,
    "summitLng" REAL,
    "summitEle" REAL,
    "minLat" REAL NOT NULL,
    "minLng" REAL NOT NULL,
    "maxLat" REAL NOT NULL,
    "maxLng" REAL NOT NULL,
    "courseCount" INTEGER NOT NULL,
    "minLengthM" INTEGER,
    "maxLengthM" INTEGER,
    "images" TEXT NOT NULL DEFAULT '[]',
    "loadedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "hiking_courses" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mountainId" TEXT NOT NULL,
    "no" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "nameSource" TEXT NOT NULL,
    "startName" TEXT,
    "endName" TEXT,
    "peakName" TEXT,
    "lengthM" INTEGER NOT NULL,
    "hasElevation" BOOLEAN NOT NULL,
    "gainM" INTEGER,
    "lossM" INTEGER,
    "minEle" REAL,
    "maxEle" REAL,
    "startLat" REAL NOT NULL,
    "startLng" REAL NOT NULL,
    "startEle" REAL,
    "endLat" REAL NOT NULL,
    "endLng" REAL NOT NULL,
    "endEle" REAL,
    "isLoop" BOOLEAN NOT NULL,
    "pieceCount" INTEGER NOT NULL,
    "gapCount" INTEGER NOT NULL,
    "gapM" INTEGER NOT NULL,
    "minLat" REAL NOT NULL,
    "minLng" REAL NOT NULL,
    "maxLat" REAL NOT NULL,
    "maxLng" REAL NOT NULL,
    "pieces" TEXT NOT NULL,
    "profile" TEXT NOT NULL,
    "surfaces" TEXT NOT NULL,
    CONSTRAINT "hiking_courses_mountainId_fkey" FOREIGN KEY ("mountainId") REFERENCES "hiking_mountains" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "hiking_pois" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mountainId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "lat" REAL NOT NULL,
    "lng" REAL NOT NULL,
    "ele" REAL,
    "signposts" TEXT,
    "source" TEXT NOT NULL,
    CONSTRAINT "hiking_pois_mountainId_fkey" FOREIGN KEY ("mountainId") REFERENCES "hiking_mountains" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "hiking_course_pois" (
    "courseId" TEXT NOT NULL,
    "poiId" TEXT NOT NULL,
    "atM" INTEGER NOT NULL,

    PRIMARY KEY ("courseId", "poiId"),
    CONSTRAINT "hiking_course_pois_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "hiking_courses" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "hiking_course_pois_poiId_fkey" FOREIGN KEY ("poiId") REFERENCES "hiking_pois" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "hiking_syncs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "mountains" INTEGER NOT NULL,
    "courses" INTEGER NOT NULL,
    "pois" INTEGER NOT NULL,
    "images" INTEGER NOT NULL,
    "detail" TEXT,
    "loadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "hiking_courses_mountainId_idx" ON "hiking_courses"("mountainId");

-- CreateIndex
CREATE INDEX "hiking_pois_mountainId_idx" ON "hiking_pois"("mountainId");

-- CreateIndex
CREATE INDEX "hiking_course_pois_poiId_idx" ON "hiking_course_pois"("poiId");
