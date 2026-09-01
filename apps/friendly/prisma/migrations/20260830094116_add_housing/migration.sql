-- CreateTable
CREATE TABLE "housing_complexes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "pnu" TEXT,
    "name" TEXT NOT NULL,
    "altNames" TEXT,
    "kind" TEXT NOT NULL,
    "addr" TEXT NOT NULL,
    "sido" TEXT NOT NULL,
    "sgg" TEXT NOT NULL,
    "umd" TEXT NOT NULL,
    "jibun" TEXT,
    "sggCd" TEXT NOT NULL,
    "bjdCd" TEXT,
    "dongCount" INTEGER,
    "households" INTEGER,
    "approvedDate" TEXT,
    "lat" REAL,
    "lng" REAL,
    "geoSource" TEXT,
    "baseDate" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "housing_trades" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "complexId" TEXT,
    "sggCd" TEXT NOT NULL,
    "dealYm" TEXT NOT NULL,
    "dealDate" TEXT NOT NULL,
    "dealType" TEXT NOT NULL,
    "umdNm" TEXT NOT NULL,
    "jibun" TEXT,
    "aptNm" TEXT NOT NULL,
    "aptSeq" TEXT,
    "roadNm" TEXT,
    "area" REAL NOT NULL,
    "floor" INTEGER,
    "buildYear" INTEGER,
    "price" INTEGER NOT NULL,
    "rent" INTEGER NOT NULL DEFAULT 0,
    "dealingGbn" TEXT,
    "canceled" BOOLEAN NOT NULL DEFAULT false,
    "canceledDate" TEXT,
    "rgstDate" TEXT,
    "aptDong" TEXT,
    "buyerGbn" TEXT,
    "slerGbn" TEXT,
    "contractType" TEXT,
    "useRRRight" TEXT,
    "contractTerm" TEXT,
    "preDeposit" INTEGER,
    "preRent" INTEGER,
    "landLease" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "housing_complex_stats" (
    "complexId" TEXT NOT NULL,
    "dealType" TEXT NOT NULL,
    "band" TEXT NOT NULL,
    "latestPrice" INTEGER NOT NULL,
    "latestRent" INTEGER NOT NULL,
    "latestArea" REAL NOT NULL,
    "latestFloor" INTEGER,
    "latestDate" TEXT NOT NULL,
    "count12" INTEGER NOT NULL,
    "count" INTEGER NOT NULL,
    "unitPrice12" REAL,

    PRIMARY KEY ("complexId", "dealType", "band")
);

-- CreateTable
CREATE TABLE "housing_trade_syncs" (
    "sggCd" TEXT NOT NULL,
    "dealYm" TEXT NOT NULL,
    "dealType" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("sggCd", "dealYm", "dealType")
);

-- CreateTable
CREATE TABLE "housing_syncs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "kind" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "geocoded" INTEGER,
    "baseDate" TEXT,
    "sourceFile" TEXT,
    "loadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "housing_complexes_lat_lng_idx" ON "housing_complexes"("lat", "lng");

-- CreateIndex
CREATE INDEX "housing_complexes_sggCd_umd_jibun_idx" ON "housing_complexes"("sggCd", "umd", "jibun");

-- CreateIndex
CREATE INDEX "housing_complexes_kind_households_idx" ON "housing_complexes"("kind", "households");

-- CreateIndex
CREATE INDEX "housing_trades_complexId_dealType_dealDate_idx" ON "housing_trades"("complexId", "dealType", "dealDate");

-- CreateIndex
CREATE INDEX "housing_trades_sggCd_dealYm_dealType_idx" ON "housing_trades"("sggCd", "dealYm", "dealType");

-- CreateIndex
CREATE INDEX "housing_trade_syncs_dealType_dealYm_idx" ON "housing_trade_syncs"("dealType", "dealYm");

-- CreateIndex
CREATE INDEX "housing_syncs_kind_loadedAt_idx" ON "housing_syncs"("kind", "loadedAt");
