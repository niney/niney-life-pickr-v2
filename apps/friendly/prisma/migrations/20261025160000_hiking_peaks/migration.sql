-- AlterTable
ALTER TABLE "hiking_courses" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'top100';

-- AlterTable
ALTER TABLE "hiking_mountains" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'top100';
ALTER TABLE "hiking_mountains" ADD COLUMN "neighbors" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "hiking_mountains" ADD COLUMN "peaks" TEXT NOT NULL DEFAULT '[]';
