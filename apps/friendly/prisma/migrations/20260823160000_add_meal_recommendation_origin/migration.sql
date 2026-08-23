-- 추천에서 실제 식단 기록으로 이어진 출처를 보존한다.
-- 추천 행은 캐시/이력 정책으로 정리될 수 있어 FK 대신 검증된 id 스냅샷을 둔다.
ALTER TABLE "meal_entries" ADD COLUMN "originRecommendationId" TEXT;

CREATE INDEX "meal_entries_userId_originRecommendationId_idx"
ON "meal_entries"("userId", "originRecommendationId");
