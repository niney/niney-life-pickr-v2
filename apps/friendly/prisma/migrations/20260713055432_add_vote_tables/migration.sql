-- CreateTable
CREATE TABLE "vote_sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "shareToken" TEXT NOT NULL,
    "shareExpiresAt" DATETIME NOT NULL,
    "closedAt" DATETIME,
    "winnerOptionId" TEXT,
    "decidedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "vote_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "vote_options" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "placeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "thumbnailUrl" TEXT,
    CONSTRAINT "vote_options_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "vote_sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "vote_ballots" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "voterKey" TEXT NOT NULL,
    "voterLabel" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "vote_ballots_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "vote_sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "vote_ballots_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "vote_options" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "vote_sessions_shareToken_key" ON "vote_sessions"("shareToken");

-- CreateIndex
CREATE INDEX "vote_sessions_userId_createdAt_idx" ON "vote_sessions"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "vote_options_sessionId_idx" ON "vote_options"("sessionId");

-- CreateIndex
CREATE INDEX "vote_ballots_sessionId_voterKey_idx" ON "vote_ballots"("sessionId", "voterKey");

-- CreateIndex
CREATE UNIQUE INDEX "vote_ballots_optionId_voterKey_key" ON "vote_ballots"("optionId", "voterKey");
