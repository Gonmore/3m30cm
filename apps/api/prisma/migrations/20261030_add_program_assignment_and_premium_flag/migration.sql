-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('PENDING','APPROVED','REJECTED');

-- AlterTable
ALTER TABLE "ProgramTemplate" ADD COLUMN "isPremium" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ProgramTemplate" ADD COLUMN "coachId" TEXT;
ALTER TABLE "ScheduledSession" ADD COLUMN "coachNotes" TEXT;

-- CreateTable
CREATE TABLE "ProgramAssignment" (
  "id" TEXT NOT NULL,
  "athleteProfileId" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "coachId" TEXT NOT NULL,
  "status" "AssignmentStatus" NOT NULL DEFAULT 'PENDING',
  "requestNotes" TEXT,
  "approvedAt" TIMESTAMPTZ,
  "assignedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProgramAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProgramAssignment_athleteProfileId_templateId_key" ON "ProgramAssignment"("athleteProfileId", "templateId");
CREATE INDEX "ProgramAssignment_coachId_idx" ON "ProgramAssignment"("coachId");
CREATE INDEX "ProgramAssignment_status_idx" ON "ProgramAssignment"("status");

-- AddForeignKey
ALTER TABLE "ProgramTemplate" ADD CONSTRAINT "ProgramTemplate_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProgramAssignment" ADD CONSTRAINT "ProgramAssignment_athleteProfileId_fkey" FOREIGN KEY ("athleteProfileId") REFERENCES "AthleteProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProgramAssignment" ADD CONSTRAINT "ProgramAssignment_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ProgramTemplate" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProgramAssignment" ADD CONSTRAINT "ProgramAssignment_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: mark all existing PersonalProgram-derived templates as approved assignments
-- This creates APPROVED ProgramAssignment records for existing PersonalPrograms that reference a template.
INSERT INTO "ProgramAssignment" ("id", "athleteProfileId", "templateId", "coachId", "status", "approvedAt", "assignedAt", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::TEXT,
  "p"."athleteProfileId",
  "p"."templateId",
  "t"."coachId" AS "coachId",
  'APPROVED' AS "status",
  "p"."createdAt" AS "approvedAt",
  "p"."createdAt" AS "assignedAt",
  "p"."createdAt" AS "createdAt",
  "p"."updatedAt" AS "updatedAt"
FROM "PersonalProgram" "p"
JOIN "ProgramTemplate" "t" ON "t"."id" = "p"."templateId"
WHERE "p"."templateId" IS NOT NULL
  AND "t"."coachId" IS NOT NULL;
