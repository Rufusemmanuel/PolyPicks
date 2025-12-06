-- CreateTable
CREATE TABLE "TrackedMarket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "category" TEXT,
    "trackedOutcome" TEXT NOT NULL,
    "entryPrice" REAL NOT NULL,
    "appearedAt" DATETIME NOT NULL,
    "marketUrl" TEXT NOT NULL,
    "closedAt" DATETIME,
    "resolvedOutcome" TEXT,
    "resolvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "HistoryEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "marketId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT,
    "trackedOutcome" TEXT NOT NULL,
    "entryPrice" REAL NOT NULL,
    "resolvedOutcome" TEXT NOT NULL,
    "appearedAt" DATETIME NOT NULL,
    "resolvedAt" DATETIME NOT NULL,
    "closedAt" DATETIME,
    "marketUrl" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "HistoryEntry_resolvedAt_idx" ON "HistoryEntry"("resolvedAt");

-- CreateIndex
CREATE INDEX "HistoryEntry_marketId_idx" ON "HistoryEntry"("marketId");
