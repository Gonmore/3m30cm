-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ATHLETE', 'COACH', 'TEAM_ADMIN', 'SUPERADMIN');

-- CreateEnum
CREATE TYPE "SeasonPhase" AS ENUM ('PRESEASON', 'IN_SEASON', 'COMPETITION', 'OFF_SEASON');

-- CreateEnum
CREATE TYPE "DayType" AS ENUM ('EXPLOSIVE', 'STRENGTH', 'RECOVERY', 'REST', 'UPPER_CORE', 'OTHER');

-- CreateEnum
CREATE TYPE "ProgramStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('PLANNED', 'COMPLETED', 'SKIPPED', 'RESCHEDULED');

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('IMAGE', 'GIF', 'VIDEO');

-- CreateEnum
CREATE TYPE "SeriesProtocol" AS ENUM ('NONE', 'STRENGTH_EXPLOSION', 'PLYOMETRIC_SPEED');

-- CreateEnum
CREATE TYPE "BillingStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "oauthProvider" TEXT,
    "oauthProviderId" TEXT,
    "avatarUrl" TEXT,
    "platformRole" "Role",
    "firstName" TEXT,
    "lastName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "code" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "userId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AthleteProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "teamId" TEXT,
    "displayName" TEXT,
    "sport" TEXT,
    "trainsSport" BOOLEAN NOT NULL DEFAULT false,
    "seasonPhase" "SeasonPhase" NOT NULL DEFAULT 'OFF_SEASON',
    "weeklyAvailability" JSONB,
    "sportTrainingDays" JSONB,
    "onboardingCompletedAt" TIMESTAMP(3),
    "notes" TEXT,
    "exerciseExclusions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AthleteProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachAssignment" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "athleteProfileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoachAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exercise" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "equipment" TEXT,
    "requiresLoad" BOOLEAN NOT NULL DEFAULT false,
    "perLeg" BOOLEAN NOT NULL DEFAULT false,
    "isBlock" BOOLEAN NOT NULL DEFAULT false,
    "defaultSeriesProtocol" "SeriesProtocol" NOT NULL DEFAULT 'NONE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Exercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExerciseBlock" (
    "id" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,

    CONSTRAINT "ExerciseBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExerciseBlockItem" (
    "id" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "setsOverride" INTEGER,
    "repsOverride" TEXT,
    "notes" TEXT,

    CONSTRAINT "ExerciseBlockItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExerciseInstruction" (
    "id" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'es',
    "summary" TEXT,
    "steps" TEXT NOT NULL,
    "safetyNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExerciseInstruction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExerciseMediaAsset" (
    "id" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "bucket" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "url" TEXT,
    "title" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExerciseMediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramTemplate" (
    "id" TEXT NOT NULL,
    "teamId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "techniqueTitle" TEXT,
    "techniqueDescription" TEXT,
    "cycleLengthDays" INTEGER NOT NULL DEFAULT 14,
    "isEditable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramTemplateTechnique" (
    "id" TEXT NOT NULL,
    "programTemplateId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "measurementInstructions" TEXT,
    "comparisonEnabled" BOOLEAN NOT NULL DEFAULT false,
    "orderIndex" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramTemplateTechnique_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramTemplateTechniqueMeasurementDefinition" (
    "id" TEXT NOT NULL,
    "techniqueId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "instructions" TEXT,
    "allowedUnits" JSONB,
    "orderIndex" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramTemplateTechniqueMeasurementDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramTemplateTechniqueAsset" (
    "id" TEXT NOT NULL,
    "programTemplateId" TEXT NOT NULL,
    "techniqueId" TEXT,
    "kind" "MediaKind" NOT NULL,
    "bucket" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "url" TEXT,
    "title" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramTemplateTechniqueAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AthleteTechniqueMetric" (
    "id" TEXT NOT NULL,
    "athleteProfileId" TEXT NOT NULL,
    "programTemplateId" TEXT NOT NULL,
    "techniqueId" TEXT,
    "measurementDefinitionId" TEXT,
    "label" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "unit" TEXT,
    "notes" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isBaseline" BOOLEAN NOT NULL DEFAULT false,
    "completedSessionsAtMeasurement" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AthleteTechniqueMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramDayTemplate" (
    "id" TEXT NOT NULL,
    "programTemplateId" TEXT NOT NULL,
    "dayNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "dayType" "DayType" NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramDayTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExercisePrescriptionTemplate" (
    "id" TEXT NOT NULL,
    "programDayTemplateId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "seriesProtocol" "SeriesProtocol" NOT NULL DEFAULT 'NONE',
    "blockLabel" TEXT,
    "sets" INTEGER,
    "repsText" TEXT,
    "durationSeconds" INTEGER,
    "restSeconds" INTEGER,
    "loadText" TEXT,
    "tempoText" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExercisePrescriptionTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonalProgram" (
    "id" TEXT NOT NULL,
    "athleteProfileId" TEXT NOT NULL,
    "templateId" TEXT,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "phase" "SeasonPhase" NOT NULL DEFAULT 'OFF_SEASON',
    "status" "ProgramStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonalProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledSession" (
    "id" TEXT NOT NULL,
    "personalProgramId" TEXT NOT NULL,
    "scheduledDate" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "dayType" "DayType" NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'PLANNED',
    "rescheduleCount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionExercise" (
    "id" TEXT NOT NULL,
    "scheduledSessionId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "seriesProtocol" "SeriesProtocol" NOT NULL DEFAULT 'NONE',
    "sets" INTEGER,
    "repsText" TEXT,
    "durationSeconds" INTEGER,
    "restSeconds" INTEGER,
    "loadText" TEXT,
    "notes" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionExercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionLog" (
    "id" TEXT NOT NULL,
    "scheduledSessionId" TEXT NOT NULL,
    "athleteProfileId" TEXT NOT NULL,
    "notes" TEXT,
    "perceivedExertion" INTEGER,
    "metrics" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingAccount" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalCustomerId" TEXT,
    "status" "BillingStatus" NOT NULL DEFAULT 'TRIALING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "billingAccountId" TEXT,
    "planCode" TEXT NOT NULL,
    "status" "BillingStatus" NOT NULL DEFAULT 'TRIALING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_token_key" ON "PasswordResetToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "Team_slug_key" ON "Team"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_teamId_key" ON "Membership"("userId", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "AthleteProfile_userId_key" ON "AthleteProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CoachAssignment_coachId_athleteProfileId_key" ON "CoachAssignment"("coachId", "athleteProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "Exercise_slug_key" ON "Exercise"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "ExerciseBlock_exerciseId_key" ON "ExerciseBlock"("exerciseId");

-- CreateIndex
CREATE UNIQUE INDEX "ExerciseBlockItem_blockId_exerciseId_key" ON "ExerciseBlockItem"("blockId", "exerciseId");

-- CreateIndex
CREATE UNIQUE INDEX "ExerciseInstruction_exerciseId_locale_key" ON "ExerciseInstruction"("exerciseId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramTemplate_code_key" ON "ProgramTemplate"("code");

-- CreateIndex
CREATE INDEX "ProgramTemplateTechnique_programTemplateId_orderIndex_idx" ON "ProgramTemplateTechnique"("programTemplateId", "orderIndex");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramTemplateTechnique_programTemplateId_orderIndex_key" ON "ProgramTemplateTechnique"("programTemplateId", "orderIndex");

-- CreateIndex
CREATE INDEX "ProgramTemplateTechniqueMeasurementDefinition_techniqueId_o_idx" ON "ProgramTemplateTechniqueMeasurementDefinition"("techniqueId", "orderIndex");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramTemplateTechniqueMeasurementDefinition_techniqueId_o_key" ON "ProgramTemplateTechniqueMeasurementDefinition"("techniqueId", "orderIndex");

-- CreateIndex
CREATE INDEX "ProgramTemplateTechniqueAsset_programTemplateId_orderIndex_idx" ON "ProgramTemplateTechniqueAsset"("programTemplateId", "orderIndex");

-- CreateIndex
CREATE INDEX "ProgramTemplateTechniqueAsset_techniqueId_orderIndex_idx" ON "ProgramTemplateTechniqueAsset"("techniqueId", "orderIndex");

-- CreateIndex
CREATE INDEX "AthleteTechniqueMetric_athleteProfileId_programTemplateId_r_idx" ON "AthleteTechniqueMetric"("athleteProfileId", "programTemplateId", "recordedAt");

-- CreateIndex
CREATE INDEX "AthleteTechniqueMetric_athleteProfileId_techniqueId_recorde_idx" ON "AthleteTechniqueMetric"("athleteProfileId", "techniqueId", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramDayTemplate_programTemplateId_dayNumber_key" ON "ProgramDayTemplate"("programTemplateId", "dayNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ExercisePrescriptionTemplate_programDayTemplateId_orderInde_key" ON "ExercisePrescriptionTemplate"("programDayTemplateId", "orderIndex");

-- CreateIndex
CREATE UNIQUE INDEX "SessionExercise_scheduledSessionId_orderIndex_key" ON "SessionExercise"("scheduledSessionId", "orderIndex");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceToken_token_key" ON "DeviceToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "BillingAccount_teamId_provider_key" ON "BillingAccount"("teamId", "provider");

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AthleteProfile" ADD CONSTRAINT "AthleteProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AthleteProfile" ADD CONSTRAINT "AthleteProfile_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachAssignment" ADD CONSTRAINT "CoachAssignment_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachAssignment" ADD CONSTRAINT "CoachAssignment_athleteProfileId_fkey" FOREIGN KEY ("athleteProfileId") REFERENCES "AthleteProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseBlock" ADD CONSTRAINT "ExerciseBlock_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseBlockItem" ADD CONSTRAINT "ExerciseBlockItem_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "ExerciseBlock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseBlockItem" ADD CONSTRAINT "ExerciseBlockItem_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseInstruction" ADD CONSTRAINT "ExerciseInstruction_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseMediaAsset" ADD CONSTRAINT "ExerciseMediaAsset_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramTemplate" ADD CONSTRAINT "ProgramTemplate_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramTemplateTechnique" ADD CONSTRAINT "ProgramTemplateTechnique_programTemplateId_fkey" FOREIGN KEY ("programTemplateId") REFERENCES "ProgramTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramTemplateTechniqueMeasurementDefinition" ADD CONSTRAINT "ProgramTemplateTechniqueMeasurementDefinition_techniqueId_fkey" FOREIGN KEY ("techniqueId") REFERENCES "ProgramTemplateTechnique"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramTemplateTechniqueAsset" ADD CONSTRAINT "ProgramTemplateTechniqueAsset_programTemplateId_fkey" FOREIGN KEY ("programTemplateId") REFERENCES "ProgramTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramTemplateTechniqueAsset" ADD CONSTRAINT "ProgramTemplateTechniqueAsset_techniqueId_fkey" FOREIGN KEY ("techniqueId") REFERENCES "ProgramTemplateTechnique"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AthleteTechniqueMetric" ADD CONSTRAINT "AthleteTechniqueMetric_athleteProfileId_fkey" FOREIGN KEY ("athleteProfileId") REFERENCES "AthleteProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AthleteTechniqueMetric" ADD CONSTRAINT "AthleteTechniqueMetric_programTemplateId_fkey" FOREIGN KEY ("programTemplateId") REFERENCES "ProgramTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AthleteTechniqueMetric" ADD CONSTRAINT "AthleteTechniqueMetric_techniqueId_fkey" FOREIGN KEY ("techniqueId") REFERENCES "ProgramTemplateTechnique"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AthleteTechniqueMetric" ADD CONSTRAINT "AthleteTechniqueMetric_measurementDefinitionId_fkey" FOREIGN KEY ("measurementDefinitionId") REFERENCES "ProgramTemplateTechniqueMeasurementDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramDayTemplate" ADD CONSTRAINT "ProgramDayTemplate_programTemplateId_fkey" FOREIGN KEY ("programTemplateId") REFERENCES "ProgramTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExercisePrescriptionTemplate" ADD CONSTRAINT "ExercisePrescriptionTemplate_programDayTemplateId_fkey" FOREIGN KEY ("programDayTemplateId") REFERENCES "ProgramDayTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExercisePrescriptionTemplate" ADD CONSTRAINT "ExercisePrescriptionTemplate_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalProgram" ADD CONSTRAINT "PersonalProgram_athleteProfileId_fkey" FOREIGN KEY ("athleteProfileId") REFERENCES "AthleteProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalProgram" ADD CONSTRAINT "PersonalProgram_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ProgramTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledSession" ADD CONSTRAINT "ScheduledSession_personalProgramId_fkey" FOREIGN KEY ("personalProgramId") REFERENCES "PersonalProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionExercise" ADD CONSTRAINT "SessionExercise_scheduledSessionId_fkey" FOREIGN KEY ("scheduledSessionId") REFERENCES "ScheduledSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionExercise" ADD CONSTRAINT "SessionExercise_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionLog" ADD CONSTRAINT "SessionLog_scheduledSessionId_fkey" FOREIGN KEY ("scheduledSessionId") REFERENCES "ScheduledSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionLog" ADD CONSTRAINT "SessionLog_athleteProfileId_fkey" FOREIGN KEY ("athleteProfileId") REFERENCES "AthleteProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceToken" ADD CONSTRAINT "DeviceToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingAccount" ADD CONSTRAINT "BillingAccount_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_billingAccountId_fkey" FOREIGN KEY ("billingAccountId") REFERENCES "BillingAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

