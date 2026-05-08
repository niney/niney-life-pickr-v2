-- CreateTable
CREATE TABLE "global_menu_canonicals" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "displayName" TEXT NOT NULL,
    "globalKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "model" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "global_menu_canonical_links" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "menuCanonicalId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "localCanonicalNorm" TEXT NOT NULL,
    "globalCanonicalId" TEXT NOT NULL,
    CONSTRAINT "global_menu_canonical_links_menuCanonicalId_fkey" FOREIGN KEY ("menuCanonicalId") REFERENCES "menu_canonicals" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "global_menu_canonical_links_globalCanonicalId_fkey" FOREIGN KEY ("globalCanonicalId") REFERENCES "global_menu_canonicals" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "global_menu_canonicals_globalKey_key" ON "global_menu_canonicals"("globalKey");

-- CreateIndex
CREATE UNIQUE INDEX "global_menu_canonical_links_menuCanonicalId_key" ON "global_menu_canonical_links"("menuCanonicalId");

-- CreateIndex
CREATE INDEX "global_menu_canonical_links_globalCanonicalId_idx" ON "global_menu_canonical_links"("globalCanonicalId");

-- CreateIndex
CREATE INDEX "global_menu_canonical_links_restaurantId_idx" ON "global_menu_canonical_links"("restaurantId");
