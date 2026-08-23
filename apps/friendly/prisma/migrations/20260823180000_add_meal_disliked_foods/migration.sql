-- 절대 제외(excludedFoods)와 가능하면 피할 음식(dislikedFoods)을 분리한다.
ALTER TABLE "meal_preferences" ADD COLUMN "dislikedFoodsJson" TEXT NOT NULL DEFAULT '[]';
