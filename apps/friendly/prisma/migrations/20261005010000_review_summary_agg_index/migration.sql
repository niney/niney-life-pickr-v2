-- DropIndex
DROP INDEX "visitor_reviews_restaurantId_idx";

-- CreateIndex
CREATE INDEX "visitor_reviews_restaurantId_id_idx" ON "visitor_reviews"("restaurantId", "id");

-- CreateIndex
CREATE INDEX "review_summaries_agg_idx" ON "review_summaries"("reviewId", "status", "sentiment", "sentimentScore", "satisfactionScore");
