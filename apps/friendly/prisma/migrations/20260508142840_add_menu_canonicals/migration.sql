-- CreateTable
CREATE TABLE "menu_canonicals" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "restaurantId" TEXT NOT NULL,
    "nameNorm" TEXT NOT NULL,
    "canonicalName" TEXT NOT NULL,
    "canonicalNorm" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "model" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "menu_canonicals_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "menu_canonicals_restaurantId_canonicalNorm_idx" ON "menu_canonicals"("restaurantId", "canonicalNorm");

-- CreateIndex
CREATE UNIQUE INDEX "menu_canonicals_restaurantId_nameNorm_key" ON "menu_canonicals"("restaurantId", "nameNorm");
