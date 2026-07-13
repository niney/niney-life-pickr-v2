-- CreateTable
CREATE TABLE "restaurant_favorites" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "address" TEXT,
    "thumbnailUrl" TEXT,
    "latitude" REAL,
    "longitude" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "restaurant_favorites_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "restaurant_favorites_userId_idx" ON "restaurant_favorites"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "restaurant_favorites_userId_placeId_key" ON "restaurant_favorites"("userId", "placeId");
