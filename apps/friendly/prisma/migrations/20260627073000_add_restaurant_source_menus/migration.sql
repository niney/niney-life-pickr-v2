-- Additive menu source storage. Existing restaurant snapshotJson and public
-- flat menus stay untouched; these tables preserve source grouping/order.
CREATE TABLE "restaurant_menu_groups" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "restaurantId" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "sourceGroupId" TEXT,
  "name" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL,
  "rawJson" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "restaurant_menu_groups_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "restaurants" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "restaurant_menus" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "restaurantId" TEXT NOT NULL,
  "groupId" TEXT,
  "source" TEXT NOT NULL,
  "sourceMenuId" TEXT,
  "name" TEXT NOT NULL,
  "price" TEXT,
  "description" TEXT,
  "imageUrlsJson" TEXT NOT NULL DEFAULT '[]',
  "isRepresentative" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL,
  "rawJson" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "restaurant_menus_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "restaurants" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "restaurant_menus_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "restaurant_menu_groups" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "restaurant_menu_groups_restaurantId_source_sourceGroupId_key"
  ON "restaurant_menu_groups"("restaurantId", "source", "sourceGroupId");

CREATE INDEX "restaurant_menu_groups_restaurantId_source_sortOrder_idx"
  ON "restaurant_menu_groups"("restaurantId", "source", "sortOrder");

CREATE INDEX "restaurant_menus_restaurantId_source_sortOrder_idx"
  ON "restaurant_menus"("restaurantId", "source", "sortOrder");

CREATE INDEX "restaurant_menus_groupId_sortOrder_idx"
  ON "restaurant_menus"("groupId", "sortOrder");

CREATE INDEX "restaurant_menus_restaurantId_source_sourceMenuId_idx"
  ON "restaurant_menus"("restaurantId", "source", "sourceMenuId");
