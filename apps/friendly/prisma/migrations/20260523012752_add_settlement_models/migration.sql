-- CreateTable
CREATE TABLE "settlement_sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "restaurantPlaceId" TEXT NOT NULL,
    "restaurantName" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "totalAmount" INTEGER,
    "warning" TEXT,
    "receiptImageToken" TEXT,
    "itemsSubtotal" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "settlement_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "settlement_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unitPrice" INTEGER,
    "quantity" INTEGER,
    "amount" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "matchedMenuName" TEXT,
    "orderIndex" INTEGER NOT NULL,
    CONSTRAINT "settlement_items_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "settlement_sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "settlement_participants" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "name" TEXT,
    "nickname" TEXT,
    "excludeAlcohol" BOOLEAN NOT NULL DEFAULT false,
    "excludeNonAlcohol" BOOLEAN NOT NULL DEFAULT false,
    "excludeSide" BOOLEAN NOT NULL DEFAULT false,
    "shareAmount" INTEGER NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    CONSTRAINT "settlement_participants_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "settlement_sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "settlement_sessions_userId_createdAt_idx" ON "settlement_sessions"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "settlement_sessions_restaurantPlaceId_idx" ON "settlement_sessions"("restaurantPlaceId");

-- CreateIndex
CREATE INDEX "settlement_items_sessionId_idx" ON "settlement_items"("sessionId");

-- CreateIndex
CREATE INDEX "settlement_participants_sessionId_idx" ON "settlement_participants"("sessionId");
