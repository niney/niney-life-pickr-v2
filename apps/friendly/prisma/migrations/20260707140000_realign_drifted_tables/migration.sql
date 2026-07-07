-- 보정(realign) 마이그레이션: drift 난 3개 테이블을 schema.prisma 정의로 수렴시킨다.
--
-- 배경:
--  1) restaurant_menu_groups / restaurant_menus
--     기존 수기 마이그레이션(20260627073000_add_restaurant_source_menus)이 updatedAt 컬럼에
--     DEFAULT CURRENT_TIMESTAMP 를 붙였으나, schema.prisma 의 @updatedAt 은 DEFAULT 없는
--     NOT NULL 을 기대한다. → 마이그레이션 산출물과 dev.db 양쪽 모두 스키마와 어긋남.
--  2) review_summaries
--     dev.db 에만 과거 수동 ALTER 로 컬럼(sentiment, clusterId 등)이 덧붙어
--     clusterId 의 FK 제약(REFERENCES review_clusters(id) ON DELETE SET NULL)이 누락되고
--     컬럼 순서가 스키마와 달라졌다. (마이그레이션 산출물 자체는 올바름)
--
-- 방식: RedefineTables (새 테이블 생성 → INSERT ... SELECT 복사 → DROP → RENAME → 인덱스 재생성).
--       "현재 상태가 무엇이든 schema.prisma 정의로 수렴"하는 형태이므로,
--       마이그레이션만 따라온 깨끗한 DB(운영 등 review_summaries 수동 ALTER 이력이 없는 경우)에
--       적용해도 안전하다. 그래서 문제 없는 테이블처럼 보여도 3개 모두 포함한다.

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_restaurant_menu_groups" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "restaurantId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceGroupId" TEXT,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "rawJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "restaurant_menu_groups_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_restaurant_menu_groups" ("createdAt", "id", "name", "rawJson", "restaurantId", "sortOrder", "source", "sourceGroupId", "updatedAt") SELECT "createdAt", "id", "name", "rawJson", "restaurantId", "sortOrder", "source", "sourceGroupId", "updatedAt" FROM "restaurant_menu_groups";
DROP TABLE "restaurant_menu_groups";
ALTER TABLE "new_restaurant_menu_groups" RENAME TO "restaurant_menu_groups";
CREATE INDEX "restaurant_menu_groups_restaurantId_source_sortOrder_idx" ON "restaurant_menu_groups"("restaurantId", "source", "sortOrder");
CREATE UNIQUE INDEX "restaurant_menu_groups_restaurantId_source_sourceGroupId_key" ON "restaurant_menu_groups"("restaurantId", "source", "sourceGroupId");
CREATE TABLE "new_restaurant_menus" (
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
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "restaurant_menus_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "restaurant_menus_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "restaurant_menu_groups" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_restaurant_menus" ("createdAt", "description", "groupId", "id", "imageUrlsJson", "isRepresentative", "name", "price", "rawJson", "restaurantId", "sortOrder", "source", "sourceMenuId", "updatedAt") SELECT "createdAt", "description", "groupId", "id", "imageUrlsJson", "isRepresentative", "name", "price", "rawJson", "restaurantId", "sortOrder", "source", "sourceMenuId", "updatedAt" FROM "restaurant_menus";
DROP TABLE "restaurant_menus";
ALTER TABLE "new_restaurant_menus" RENAME TO "restaurant_menus";
CREATE INDEX "restaurant_menus_restaurantId_source_sortOrder_idx" ON "restaurant_menus"("restaurantId", "source", "sortOrder");
CREATE INDEX "restaurant_menus_groupId_sortOrder_idx" ON "restaurant_menus"("groupId", "sortOrder");
CREATE INDEX "restaurant_menus_restaurantId_source_sourceMenuId_idx" ON "restaurant_menus"("restaurantId", "source", "sourceMenuId");
CREATE TABLE "new_review_summaries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reviewId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "text" TEXT,
    "model" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "sentiment" TEXT,
    "sentimentScore" REAL,
    "satisfactionScore" INTEGER,
    "menusJson" TEXT,
    "tipsJson" TEXT,
    "keywordsJson" TEXT,
    "analysisVersion" INTEGER,
    "embeddingJson" TEXT,
    "aspectsJson" TEXT,
    "contextLine" TEXT,
    "enrichVersion" INTEGER,
    "clusterId" TEXT,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "review_summaries_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "visitor_reviews" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "review_summaries_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "review_clusters" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_review_summaries" ("analysisVersion", "aspectsJson", "clusterId", "contextLine", "createdAt", "embeddingJson", "enrichVersion", "errorCode", "errorMessage", "finishedAt", "id", "keywordsJson", "menusJson", "model", "reviewId", "satisfactionScore", "sentiment", "sentimentScore", "startedAt", "status", "text", "tipsJson", "updatedAt") SELECT "analysisVersion", "aspectsJson", "clusterId", "contextLine", "createdAt", "embeddingJson", "enrichVersion", "errorCode", "errorMessage", "finishedAt", "id", "keywordsJson", "menusJson", "model", "reviewId", "satisfactionScore", "sentiment", "sentimentScore", "startedAt", "status", "text", "tipsJson", "updatedAt" FROM "review_summaries";
DROP TABLE "review_summaries";
ALTER TABLE "new_review_summaries" RENAME TO "review_summaries";
CREATE UNIQUE INDEX "review_summaries_reviewId_key" ON "review_summaries"("reviewId");
CREATE INDEX "review_summaries_clusterId_idx" ON "review_summaries"("clusterId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
