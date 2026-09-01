-- AlterTable
ALTER TABLE "food_items" ADD COLUMN "kcalPer100g" REAL;

-- 기존 행 역산: 1인분 kcal 과 1인분 중량이 모두 있으면 100g 기준으로 되돌린다.
UPDATE "food_items"
SET "kcalPer100g" = ROUND("kcal" * 100.0 / "servingG", 1)
WHERE "kcal" IS NOT NULL AND "servingG" IS NOT NULL AND "servingG" > 0;
