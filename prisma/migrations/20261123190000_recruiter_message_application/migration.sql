-- AlterTable
ALTER TABLE "recruiter_messages" ADD COLUMN     "applicationId" TEXT;

-- CreateIndex
CREATE INDEX "recruiter_messages_applicationId_idx" ON "recruiter_messages"("applicationId");

-- AddForeignKey
ALTER TABLE "recruiter_messages" ADD CONSTRAINT "recruiter_messages_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

