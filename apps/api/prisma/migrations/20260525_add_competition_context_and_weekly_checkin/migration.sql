-- Phase 1: Competition context on AthleteProfile
CREATE TYPE "WeeklyGameCount" AS ENUM ('ZERO_TO_ONE', 'TWO_TO_THREE', 'FOUR_PLUS');
CREATE TYPE "TeamTrainingIntensity" AS ENUM ('INTENSE', 'LIGHT', 'NONE');

ALTER TABLE "AthleteProfile"
  ADD COLUMN "weeklyGameCount" "WeeklyGameCount",
  ADD COLUMN "teamTrainingIntensity" "TeamTrainingIntensity";

-- Phase 2: sequenceOrder on ScheduledSession
ALTER TABLE "ScheduledSession"
  ADD COLUMN "sequenceOrder" INTEGER;

-- Phase 2: WeeklyCheckIn model
CREATE TYPE "CheckInFatigue" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

CREATE TABLE "WeeklyCheckIn" (
    "id"               TEXT NOT NULL,
    "athleteProfileId" TEXT NOT NULL,
    "weekStartDate"    TIMESTAMP(3) NOT NULL,
    "fatigue"          "CheckInFatigue",
    "hasWeekendGames"  BOOLEAN,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklyCheckIn_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WeeklyCheckIn_athleteProfileId_weekStartDate_key"
  ON "WeeklyCheckIn"("athleteProfileId", "weekStartDate");

CREATE INDEX "WeeklyCheckIn_athleteProfileId_weekStartDate_idx"
  ON "WeeklyCheckIn"("athleteProfileId", "weekStartDate");

ALTER TABLE "WeeklyCheckIn"
  ADD CONSTRAINT "WeeklyCheckIn_athleteProfileId_fkey"
  FOREIGN KEY ("athleteProfileId")
  REFERENCES "AthleteProfile"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
