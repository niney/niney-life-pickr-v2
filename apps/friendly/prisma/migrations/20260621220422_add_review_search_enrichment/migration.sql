-- AlterTable
ALTER TABLE "review_summaries" ADD COLUMN "aspectsJson" TEXT;
ALTER TABLE "review_summaries" ADD COLUMN "contextLine" TEXT;
ALTER TABLE "review_summaries" ADD COLUMN "embeddingJson" TEXT;
ALTER TABLE "review_summaries" ADD COLUMN "enrichVersion" INTEGER;
