-- AlterTable
ALTER TABLE "review_summaries" ADD COLUMN "analysisVersion" INTEGER;
ALTER TABLE "review_summaries" ADD COLUMN "keywordsJson" TEXT;
ALTER TABLE "review_summaries" ADD COLUMN "menusJson" TEXT;
ALTER TABLE "review_summaries" ADD COLUMN "satisfactionScore" INTEGER;
ALTER TABLE "review_summaries" ADD COLUMN "sentiment" TEXT;
ALTER TABLE "review_summaries" ADD COLUMN "sentimentScore" REAL;
ALTER TABLE "review_summaries" ADD COLUMN "tipsJson" TEXT;
