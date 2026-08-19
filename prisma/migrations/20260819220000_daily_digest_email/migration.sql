-- AlterTable
ALTER TABLE "User" ADD COLUMN "daily_digest_email" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "daily_digest_email_at" TIMESTAMP(3);
