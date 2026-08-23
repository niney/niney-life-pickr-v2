-- Structured allergy preferences and catalog evidence (best-effort, never a safety guarantee).
ALTER TABLE "meal_preferences" ADD COLUMN "allergensJson" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "food_items" ADD COLUMN "allergensJson" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "food_items" ADD COLUMN "allergenEvidenceJson" TEXT NOT NULL DEFAULT '[]';

-- Recognition lineage, explicit servings, and nutrition provenance snapshots.
ALTER TABLE "meal_entries" ADD COLUMN "photoPurgedAt" DATETIME;
ALTER TABLE "meal_items" ADD COLUMN "servings" REAL;
ALTER TABLE "meal_items" ADD COLUMN "portionSource" TEXT;
ALTER TABLE "meal_items" ADD COLUMN "recognitionDishId" TEXT;
ALTER TABLE "meal_items" ADD COLUMN "selectedCandidateRank" INTEGER;
ALTER TABLE "meal_items" ADD COLUMN "catalogMatchedBy" TEXT;
ALTER TABLE "meal_items" ADD COLUMN "catalogMatchScore" REAL;
ALTER TABLE "meal_items" ADD COLUMN "nutritionBasis" TEXT NOT NULL DEFAULT 'missing';

UPDATE "meal_items"
SET "nutritionBasis" = CASE
  WHEN "nutritionFrom" IS NOT NULL THEN 'donor_estimate'
  WHEN "kcal" IS NOT NULL OR "proteinG" IS NOT NULL OR "sodiumMg" IS NOT NULL THEN 'direct'
  ELSE 'missing'
END;

-- Immutable recommendation behavior ledger.
CREATE TABLE "meal_recommendation_events" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "recommendationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "candidateName" TEXT,
  "candidateFoodId" TEXT,
  "candidateRank" INTEGER,
  "rating" INTEGER,
  "platform" TEXT NOT NULL,
  "rankingVersion" INTEGER NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "meal_recommendation_events_recommendationId_fkey"
    FOREIGN KEY ("recommendationId") REFERENCES "meal_recommendations" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "meal_recommendation_events_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "meal_recommendation_events_recommendationId_createdAt_idx"
  ON "meal_recommendation_events"("recommendationId", "createdAt");
CREATE INDEX "meal_recommendation_events_userId_createdAt_idx"
  ON "meal_recommendation_events"("userId", "createdAt");
CREATE INDEX "meal_recommendation_events_userId_kind_createdAt_idx"
  ON "meal_recommendation_events"("userId", "kind", "createdAt");

-- Durable daily quota counters; no Redis is required for the single-node SQLite deployment.
CREATE TABLE "meal_daily_quotas" (
  "userId" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" DATETIME NOT NULL,
  PRIMARY KEY ("userId", "date", "purpose"),
  CONSTRAINT "meal_daily_quotas_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "meal_daily_quotas_date_purpose_idx" ON "meal_daily_quotas"("date", "purpose");

-- Field-level source observations and merge-conflict review queue.
CREATE TABLE "food_source_observations" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "foodItemId" TEXT NOT NULL,
  "field" TEXT NOT NULL,
  "valueJson" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "sourceId" TEXT,
  "observedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "food_source_observations_foodItemId_fkey"
    FOREIGN KEY ("foodItemId") REFERENCES "food_items" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "food_source_observations_foodItemId_field_idx"
  ON "food_source_observations"("foodItemId", "field");
CREATE INDEX "food_source_observations_source_sourceId_idx"
  ON "food_source_observations"("source", "sourceId");

CREATE TABLE "food_merge_conflicts" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "foodItemId" TEXT NOT NULL,
  "field" TEXT NOT NULL,
  "existingValueJson" TEXT NOT NULL,
  "incomingValueJson" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "sourceId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'open',
  "resolutionJson" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" DATETIME,
  CONSTRAINT "food_merge_conflicts_foodItemId_fkey"
    FOREIGN KEY ("foodItemId") REFERENCES "food_items" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "food_merge_conflicts_status_createdAt_idx"
  ON "food_merge_conflicts"("status", "createdAt");
CREATE INDEX "food_merge_conflicts_foodItemId_field_idx"
  ON "food_merge_conflicts"("foodItemId", "field");
