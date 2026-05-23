-- AlterTable
ALTER TABLE "settlement_sessions" ADD COLUMN "shareToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "settlement_sessions_shareToken_key" ON "settlement_sessions"("shareToken");
