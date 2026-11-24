-- Automation settings: pause switch, daily summary, weekly report and resume nudges
ALTER TABLE "user_preferences" ADD COLUMN "automationPaused" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "user_preferences" ADD COLUMN "dailySummary" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "user_preferences" ADD COLUMN "emailDailySummary" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "user_preferences" ADD COLUMN "weeklyReport" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "user_preferences" ADD COLUMN "resumeNudges" BOOLEAN NOT NULL DEFAULT true;
