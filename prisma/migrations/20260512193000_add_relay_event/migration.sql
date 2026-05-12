CREATE TABLE "RelayEvent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payloadType" TEXT NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "walletMode" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "relayerResponse" JSONB,

    CONSTRAINT "RelayEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RelayEvent_createdAt_idx" ON "RelayEvent"("createdAt");
CREATE INDEX "RelayEvent_payloadType_createdAt_idx" ON "RelayEvent"("payloadType", "createdAt");
CREATE INDEX "RelayEvent_fromAddress_createdAt_idx" ON "RelayEvent"("fromAddress", "createdAt");
