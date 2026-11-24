-- AI usage rows now record which provider answered, failures and latency (additive, nullable/defaulted)
ALTER TABLE "ai_usage" ADD COLUMN "provider" TEXT;
ALTER TABLE "ai_usage" ADD COLUMN "success" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ai_usage" ADD COLUMN "errorCode" TEXT;
ALTER TABLE "ai_usage" ADD COLUMN "latencyMs" INTEGER;
