-- Rename initialPrice to entryPrice and add history metadata.
ALTER TABLE "Bookmark" RENAME COLUMN "initialPrice" TO "entryPrice";
UPDATE "Bookmark" SET "entryPrice" = 0 WHERE "entryPrice" IS NULL;
ALTER TABLE "Bookmark" ALTER COLUMN "entryPrice" SET NOT NULL;
ALTER TABLE "Bookmark" ADD COLUMN "removedAt" TIMESTAMP(3);
ALTER TABLE "Bookmark" ADD COLUMN "lastKnownPrice" DOUBLE PRECISION;
ALTER TABLE "Bookmark" ADD COLUMN "lastPriceAt" TIMESTAMP(3);
ALTER TABLE "Bookmark" ADD COLUMN "finalPrice" DOUBLE PRECISION;
ALTER TABLE "Bookmark" ADD COLUMN "closedAt" TIMESTAMP(3);
