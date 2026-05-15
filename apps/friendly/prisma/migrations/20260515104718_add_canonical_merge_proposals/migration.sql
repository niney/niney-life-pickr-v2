-- CreateTable
CREATE TABLE "canonical_merge_proposals" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "canonicalAId" TEXT NOT NULL,
    "canonicalBId" TEXT NOT NULL,
    "score" REAL NOT NULL,
    "nameScore" REAL NOT NULL,
    "distanceM" REAL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    CONSTRAINT "canonical_merge_proposals_canonicalAId_fkey" FOREIGN KEY ("canonicalAId") REFERENCES "canonical_restaurants" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "canonical_merge_proposals_canonicalBId_fkey" FOREIGN KEY ("canonicalBId") REFERENCES "canonical_restaurants" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "canonical_merge_proposals_status_idx" ON "canonical_merge_proposals"("status");

-- CreateIndex
CREATE UNIQUE INDEX "canonical_merge_proposals_canonicalAId_canonicalBId_key" ON "canonical_merge_proposals"("canonicalAId", "canonicalBId");
