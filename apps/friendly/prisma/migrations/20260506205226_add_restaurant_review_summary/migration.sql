-- CreateTable
CREATE TABLE "restaurants" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "placeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "rating" REAL,
    "reviewCount" INTEGER,
    "rawSourceUrl" TEXT NOT NULL,
    "snapshotJson" TEXT NOT NULL,
    "firstCrawledAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastCrawledAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "visitor_reviews" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "restaurantId" TEXT NOT NULL,
    "externalId" TEXT,
    "authorName" TEXT,
    "rating" INTEGER,
    "body" TEXT NOT NULL,
    "visitedAt" TEXT,
    "imageUrlsJson" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "visitor_reviews_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "review_summaries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reviewId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "text" TEXT,
    "model" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "review_summaries_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "visitor_reviews" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "restaurants_placeId_key" ON "restaurants"("placeId");

-- CreateIndex
CREATE INDEX "visitor_reviews_restaurantId_idx" ON "visitor_reviews"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "visitor_reviews_restaurantId_externalId_key" ON "visitor_reviews"("restaurantId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "visitor_reviews_restaurantId_contentHash_key" ON "visitor_reviews"("restaurantId", "contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "review_summaries_reviewId_key" ON "review_summaries"("reviewId");
