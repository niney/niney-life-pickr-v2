-- MealPhoto 는 확정 전(entryId=NULL)에도 반드시 사용자 소유다. 기존에는 userId 인덱스만 있어
-- 계정 삭제 뒤 고아 행이 남을 수 있었으므로 users FK + CASCADE 를 추가한다.
--
-- 과거 결함으로 이미 삭제된 사용자를 가리키는 행은 새 FK 를 만족할 수 없다. 해당 행은 더는
-- 어떤 계정도 소유·조회할 수 없으므로 복사 대상에서 제외한다. 정상 사용자 행은 전부 보존한다.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_meal_photos" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "entryId" TEXT,
    "userId" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "byteSize" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "meal_photos_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "meal_entries" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "meal_photos_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_meal_photos" ("id", "token", "entryId", "userId", "width", "height", "byteSize", "sortOrder", "createdAt")
SELECT p."id", p."token", p."entryId", p."userId", p."width", p."height", p."byteSize", p."sortOrder", p."createdAt"
FROM "meal_photos" p
WHERE EXISTS (SELECT 1 FROM "users" u WHERE u."id" = p."userId");

DROP TABLE "meal_photos";
ALTER TABLE "new_meal_photos" RENAME TO "meal_photos";

CREATE UNIQUE INDEX "meal_photos_token_key" ON "meal_photos"("token");
CREATE INDEX "meal_photos_entryId_sortOrder_idx" ON "meal_photos"("entryId", "sortOrder");
CREATE INDEX "meal_photos_userId_createdAt_idx" ON "meal_photos"("userId", "createdAt");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
