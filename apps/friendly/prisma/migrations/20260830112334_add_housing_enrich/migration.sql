-- AlterTable
ALTER TABLE "housing_complex_stats" ADD COLUMN "latestDealType" TEXT;

-- AlterTable
ALTER TABLE "housing_complexes" ADD COLUMN "buildingFetchedAt" DATETIME;
ALTER TABLE "housing_complexes" ADD COLUMN "elevatorCount" INTEGER;
ALTER TABLE "housing_complexes" ADD COLUMN "floorsMax" INTEGER;
ALTER TABLE "housing_complexes" ADD COLUMN "heating" TEXT;
ALTER TABLE "housing_complexes" ADD COLUMN "kaptCode" TEXT;
ALTER TABLE "housing_complexes" ADD COLUMN "parkingCount" INTEGER;
ALTER TABLE "housing_complexes" ADD COLUMN "roadAddr" TEXT;
ALTER TABLE "housing_complexes" ADD COLUMN "saleType" TEXT;
ALTER TABLE "housing_complexes" ADD COLUMN "structure" TEXT;

-- CreateTable
CREATE TABLE "housing_complex_prices" (
    "complexId" TEXT NOT NULL,
    "band" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "count" INTEGER NOT NULL,
    "median" INTEGER NOT NULL,
    "min" INTEGER NOT NULL,
    "max" INTEGER NOT NULL,
    "avgArea" REAL NOT NULL,

    PRIMARY KEY ("complexId", "band")
);
