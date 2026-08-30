-- CreateTable
CREATE TABLE "life_hospitals" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "kindName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "sidoName" TEXT,
    "sgguName" TEXT,
    "emdongName" TEXT,
    "postNo" TEXT,
    "addr" TEXT,
    "phone" TEXT,
    "url" TEXT,
    "openedDate" TEXT,
    "doctorCount" INTEGER,
    "lat" REAL,
    "lng" REAL,
    "geoSource" TEXT
);

-- CreateIndex
CREATE INDEX "life_hospitals_lat_lng_idx" ON "life_hospitals"("lat", "lng");
