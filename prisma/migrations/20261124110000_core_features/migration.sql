-- P1: assessment stage, recruiter contact, resume version history, job source/dedupe, saved searches.
-- Additive only: new enum value, nullable or defaulted columns, one index.
ALTER TYPE "ApplicationStatus" ADD VALUE IF NOT EXISTS 'ASSESSMENT' AFTER 'APPLIED';

ALTER TABLE "applications" ADD COLUMN "recruiterName" TEXT;
ALTER TABLE "applications" ADD COLUMN "recruiterEmail" TEXT;
ALTER TABLE "applications" ADD COLUMN "recruiterPhone" TEXT;
ALTER TABLE "applications" ADD COLUMN "recruiterLinkedin" TEXT;
ALTER TABLE "applications" ADD COLUMN "jobDescriptionSnapshot" TEXT;

ALTER TABLE "resume_versions" ADD COLUMN "label" TEXT;
ALTER TABLE "resume_versions" ADD COLUMN "text" TEXT;
ALTER TABLE "resume_versions" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'upload';
ALTER TABLE "resume_versions" ADD COLUMN "atsScore" INTEGER;
ALTER TABLE "resume_versions" ADD COLUMN "explanations" JSONB;

ALTER TABLE "jobs" ADD COLUMN "sourceName" TEXT;
ALTER TABLE "jobs" ADD COLUMN "indiaEligible" BOOLEAN;
ALTER TABLE "jobs" ADD COLUMN "dedupeKey" TEXT;
ALTER TABLE "jobs" ADD COLUMN "duplicateOfId" TEXT;
CREATE INDEX "jobs_userId_dedupeKey_idx" ON "jobs"("userId", "dedupeKey");

ALTER TABLE "job_searches" ADD COLUMN "name" TEXT;
ALTER TABLE "job_searches" ADD COLUMN "alertEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "job_searches" ADD COLUMN "lastRunAt" TIMESTAMP(3);
ALTER TABLE "job_searches" ADD COLUMN "lastNotifiedAt" TIMESTAMP(3);
ALTER TABLE "job_searches" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
