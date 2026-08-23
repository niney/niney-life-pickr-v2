-- Distinguish absent allergy metadata from deterministic ingredient inference and human review.
-- Existing rows stay unknown until the explicit backfill scans their ingredient lists.
ALTER TABLE "food_items" ADD COLUMN "allergenStatus" TEXT NOT NULL DEFAULT 'unknown';

CREATE INDEX "food_items_allergenStatus_active_idx"
  ON "food_items"("allergenStatus", "active");
