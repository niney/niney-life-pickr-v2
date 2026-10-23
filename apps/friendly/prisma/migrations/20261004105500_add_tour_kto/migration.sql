-- CreateTable
CREATE TABLE "tour_kto_contents" (
    "contentId" TEXT NOT NULL PRIMARY KEY,
    "contentTypeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "addr" TEXT,
    "lat" REAL,
    "lng" REAL,
    "modifiedTime" TEXT,
    "syncedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "tour_kto_intros" (
    "contentId" TEXT NOT NULL PRIMARY KEY,
    "contentTypeId" TEXT NOT NULL,
    "hours" TEXT,
    "closed" TEXT,
    "parking" TEXT,
    "fee" TEXT,
    "modifiedTime" TEXT,
    "fetchedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "tour_place_ktos" (
    "placeId" TEXT NOT NULL PRIMARY KEY,
    "contentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "distM" INTEGER NOT NULL,
    "nameScore" REAL NOT NULL,
    "matchedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "tour_kto_contents_contentTypeId_idx" ON "tour_kto_contents"("contentTypeId");

-- CreateIndex
CREATE INDEX "tour_place_ktos_contentId_idx" ON "tour_place_ktos"("contentId");

