-- 차수(N차) 정산 도입.
--
-- 기존 SettlementSession 의 차수 단위 필드(source/totalAmount/warning/
-- receiptImageToken/itemsSubtotal) 와 settlement_items.sessionId 를 새 모델
-- SettlementRound 로 옮긴다. 기존 세션은 자동으로 round 1개짜리로 변환
-- (round.id 를 session.id 와 동일하게 부여해 items.roundId 재매핑이 단순).
--
-- 새 SettlementRoundParticipant 는 차수 × 마스터참여자 join. 기존 참여자는
-- 모든 차수(=현재는 1개) 에 attended=true 로 자동 가입, override 는 null,
-- shareAmount 는 마스터 participant.shareAmount 그대로 (1차밖에 없어 동일).

-- CreateTable
CREATE TABLE "settlement_rounds" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "restaurantPlaceId" TEXT NOT NULL,
    "restaurantName" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "totalAmount" INTEGER,
    "warning" TEXT,
    "receiptImageToken" TEXT,
    "itemsSubtotal" INTEGER NOT NULL,
    CONSTRAINT "settlement_rounds_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "settlement_sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Backfill: 각 session 당 round 1개. round.id = session.id (FK 매핑 단순).
INSERT INTO "settlement_rounds" ("id", "sessionId", "orderIndex", "restaurantPlaceId", "restaurantName", "source", "totalAmount", "warning", "receiptImageToken", "itemsSubtotal")
SELECT "id", "id", 0, "restaurantPlaceId", "restaurantName", "source", "totalAmount", "warning", "receiptImageToken", "itemsSubtotal"
FROM "settlement_sessions";

-- CreateIndex
CREATE INDEX "settlement_rounds_sessionId_idx" ON "settlement_rounds"("sessionId");

-- CreateTable
CREATE TABLE "settlement_round_participants" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roundId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "attended" BOOLEAN NOT NULL DEFAULT true,
    "excludeAlcoholOverride" BOOLEAN,
    "excludeNonAlcoholOverride" BOOLEAN,
    "excludeSideOverride" BOOLEAN,
    "shareAmount" INTEGER NOT NULL,
    CONSTRAINT "settlement_round_participants_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "settlement_rounds" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "settlement_round_participants_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "settlement_participants" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Backfill: 모든 참여자를 1차에 자동 가입. round.id = session.id 라 join 단순.
-- 마스터 participant.shareAmount 가 곧 1차 분담 (다른 차수가 없으므로 동일).
INSERT INTO "settlement_round_participants" ("id", "roundId", "participantId", "attended", "excludeAlcoholOverride", "excludeNonAlcoholOverride", "excludeSideOverride", "shareAmount")
SELECT
  "id" || '_r0',  -- participant.id 에 suffix 붙여 cuid 충돌 방지
  "sessionId",    -- round.id == sessionId (backfill 규약)
  "id",
  true,
  NULL, NULL, NULL,
  "shareAmount"
FROM "settlement_participants";

-- CreateIndex
CREATE UNIQUE INDEX "settlement_round_participants_roundId_participantId_key" ON "settlement_round_participants"("roundId", "participantId");
CREATE INDEX "settlement_round_participants_roundId_idx" ON "settlement_round_participants"("roundId");
CREATE INDEX "settlement_round_participants_participantId_idx" ON "settlement_round_participants"("participantId");

-- RedefineTables: settlement_items.sessionId → roundId.
-- 백필 규약에 의해 sessionId 값이 그대로 roundId 로 유효하다.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_settlement_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roundId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unitPrice" INTEGER,
    "quantity" INTEGER,
    "amount" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "matchedMenuName" TEXT,
    "orderIndex" INTEGER NOT NULL,
    CONSTRAINT "settlement_items_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "settlement_rounds" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_settlement_items" ("id", "roundId", "name", "unitPrice", "quantity", "amount", "category", "matchedMenuName", "orderIndex")
SELECT "id", "sessionId", "name", "unitPrice", "quantity", "amount", "category", "matchedMenuName", "orderIndex"
FROM "settlement_items";
DROP TABLE "settlement_items";
ALTER TABLE "new_settlement_items" RENAME TO "settlement_items";
CREATE INDEX "settlement_items_roundId_idx" ON "settlement_items"("roundId");

-- RedefineTables: settlement_sessions 의 차수 단위 컬럼 제거 + grandTotal 추가
-- (= 기존 itemsSubtotal).
CREATE TABLE "new_settlement_sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "restaurantPlaceId" TEXT NOT NULL,
    "restaurantName" TEXT NOT NULL,
    "grandTotal" INTEGER NOT NULL,
    "shareToken" TEXT,
    "editedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "settlement_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_settlement_sessions" ("id", "userId", "restaurantPlaceId", "restaurantName", "grandTotal", "shareToken", "editedAt", "createdAt", "updatedAt")
SELECT "id", "userId", "restaurantPlaceId", "restaurantName", "itemsSubtotal", "shareToken", "editedAt", "createdAt", "updatedAt"
FROM "settlement_sessions";
DROP TABLE "settlement_sessions";
ALTER TABLE "new_settlement_sessions" RENAME TO "settlement_sessions";
CREATE UNIQUE INDEX "settlement_sessions_shareToken_key" ON "settlement_sessions"("shareToken");
CREATE INDEX "settlement_sessions_userId_createdAt_idx" ON "settlement_sessions"("userId", "createdAt");
CREATE INDEX "settlement_sessions_restaurantPlaceId_idx" ON "settlement_sessions"("restaurantPlaceId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
