-- CreateTable
CREATE TABLE "meal_entries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "eatenAt" DATETIME NOT NULL,
    "eatenDate" TEXT NOT NULL,
    "slot" TEXT NOT NULL,
    "mealType" TEXT,
    "placeId" TEXT,
    "placeName" TEXT,
    "memo" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "recognitionJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "meal_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "meal_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameNorm" TEXT NOT NULL,
    "foodId" TEXT,
    "dishType" TEXT,
    "mainIngredient" TEXT,
    "cuisine" TEXT,
    "portion" TEXT,
    "isMain" BOOLEAN NOT NULL DEFAULT true,
    "confidence" REAL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "meal_items_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "meal_entries" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "meal_photos" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "entryId" TEXT,
    "userId" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "byteSize" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "meal_photos_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "meal_entries" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "meal_preferences" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "weightsJson" TEXT NOT NULL,
    "excludedFoodsJson" TEXT NOT NULL DEFAULT '[]',
    "likedFoodsJson" TEXT NOT NULL DEFAULT '[]',
    "mealTypesJson" TEXT NOT NULL DEFAULT '[]',
    "slotsJson" TEXT NOT NULL DEFAULT '["breakfast","lunch","dinner"]',
    "onboarded" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "meal_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "meal_recommendations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "targetDate" TEXT NOT NULL,
    "targetSlot" TEXT NOT NULL,
    "contextJson" TEXT NOT NULL DEFAULT '{}',
    "profileJson" TEXT NOT NULL DEFAULT '{}',
    "itemsJson" TEXT NOT NULL DEFAULT '[]',
    "summary" TEXT NOT NULL DEFAULT '',
    "notice" TEXT,
    "status" TEXT NOT NULL,
    "model" TEXT,
    "promptVersion" INTEGER NOT NULL DEFAULT 1,
    "profileHash" TEXT NOT NULL DEFAULT '',
    "feedbackJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "meal_recommendations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "meal_entries_userId_eatenAt_idx" ON "meal_entries"("userId", "eatenAt");

-- CreateIndex
CREATE INDEX "meal_entries_userId_eatenDate_idx" ON "meal_entries"("userId", "eatenDate");

-- CreateIndex
CREATE INDEX "meal_items_entryId_idx" ON "meal_items"("entryId");

-- CreateIndex
CREATE INDEX "meal_items_nameNorm_idx" ON "meal_items"("nameNorm");

-- CreateIndex
CREATE UNIQUE INDEX "meal_photos_token_key" ON "meal_photos"("token");

-- CreateIndex
CREATE INDEX "meal_photos_entryId_sortOrder_idx" ON "meal_photos"("entryId", "sortOrder");

-- CreateIndex
CREATE INDEX "meal_photos_userId_createdAt_idx" ON "meal_photos"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "meal_recommendations_userId_createdAt_idx" ON "meal_recommendations"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "meal_recommendations_userId_targetDate_targetSlot_idx" ON "meal_recommendations"("userId", "targetDate", "targetSlot");
