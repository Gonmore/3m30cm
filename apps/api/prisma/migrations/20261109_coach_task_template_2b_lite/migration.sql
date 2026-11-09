-- 2B-lite: coach-owned task template overrides, linking, template blocks (MVP)
ALTER TABLE "ExerciseTaskTemplate"
  ADD COLUMN IF NOT EXISTS "category" TEXT,
  ADD COLUMN IF NOT EXISTS "equipment" TEXT,
  ADD COLUMN IF NOT EXISTS "defaultSeriesProtocol" "SeriesProtocol" NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS "evolutionGoals" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "isBlock" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "blockItems" JSONB,
  ADD COLUMN IF NOT EXISTS "sourceDayId" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceTaskId" TEXT;

ALTER TABLE "ExerciseTaskTemplate"
  ALTER COLUMN "evolution" SET DEFAULT 'WEIGHT',
  ALTER COLUMN "zone" SET DEFAULT 'FULL';

CREATE INDEX IF NOT EXISTS "ExerciseTaskTemplate_sourceDayId_idx" ON "ExerciseTaskTemplate"("sourceDayId");
CREATE INDEX IF NOT EXISTS "ExerciseTaskTemplate_sourceTaskId_idx" ON "ExerciseTaskTemplate"("sourceTaskId");
