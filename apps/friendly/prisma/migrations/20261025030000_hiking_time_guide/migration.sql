-- AlterTable
ALTER TABLE "hiking_course_pois" ADD COLUMN "guide" TEXT;

-- AlterTable
ALTER TABLE "hiking_courses" ADD COLUMN "moveMin" REAL;
ALTER TABLE "hiking_courses" ADD COLUMN "moveRevMin" REAL;
ALTER TABLE "hiking_courses" ADD COLUMN "shape" TEXT NOT NULL DEFAULT 'traverse';
ALTER TABLE "hiking_courses" ADD COLUMN "steepPct" INTEGER;
