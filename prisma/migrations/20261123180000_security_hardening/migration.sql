-- Email confirmation links
CREATE TABLE "email_verifications" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "email_verifications_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "email_verifications_tokenHash_key" ON "email_verifications"("tokenHash");
CREATE INDEX "email_verifications_userId_idx" ON "email_verifications"("userId");
ALTER TABLE "email_verifications" ADD CONSTRAINT "email_verifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Refresh and reset tokens are now stored as SHA-256 hashes. Existing rows hold raw tokens that
-- can never match again, so remove them (everyone signs in again once after this release).
DELETE FROM "refresh_tokens";
DELETE FROM "password_resets";
