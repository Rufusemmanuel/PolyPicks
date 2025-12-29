CREATE TABLE IF NOT EXISTS "Alert" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "entryPriceCents" DOUBLE PRECISION NOT NULL,
    "profitThresholdPct" DOUBLE PRECISION,
    "lossThresholdPct" DOUBLE PRECISION,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "triggerOnce" BOOLEAN NOT NULL DEFAULT true,
    "cooldownMinutes" INTEGER NOT NULL DEFAULT 60,
    "lastTriggeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE IF NOT EXISTS "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "marketId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3)
);

CREATE INDEX IF NOT EXISTS "Alert_userId_idx" ON "Alert"("userId");
CREATE INDEX IF NOT EXISTS "Alert_marketId_idx" ON "Alert"("marketId");
CREATE UNIQUE INDEX IF NOT EXISTS "Alert_userId_marketId_key" ON "Alert"("userId", "marketId");
CREATE INDEX IF NOT EXISTS "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "Notification_readAt_idx" ON "Notification"("readAt");

DO $$ BEGIN
    ALTER TABLE "Alert" ADD CONSTRAINT "Alert_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
