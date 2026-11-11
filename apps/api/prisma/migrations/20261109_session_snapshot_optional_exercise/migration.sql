-- Snapshot session exercises for coach-created program exercises (no global Exercise required)
ALTER TABLE "Exercise" ADD COLUMN IF NOT EXISTS "createdByUserId" TEXT;
CREATE INDEX IF NOT EXISTS "Exercise_createdByUserId_idx" ON "Exercise"("createdByUserId");
DO $$ BEGIN
  ALTER TABLE "Exercise" ADD CONSTRAINT "Exercise_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "SessionExercise" DROP CONSTRAINT IF EXISTS "SessionExercise_exerciseId_fkey";
ALTER TABLE "SessionExercise" ALTER COLUMN "exerciseId" DROP NOT NULL;
ALTER TABLE "SessionExercise"
  ADD COLUMN IF NOT EXISTS "name" TEXT,
  ADD COLUMN IF NOT EXISTS "description" TEXT,
  ADD COLUMN IF NOT EXISTS "equipment" TEXT,
  ADD COLUMN IF NOT EXISTS "category" TEXT,
  ADD COLUMN IF NOT EXISTS "requiresWeight" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "perLeg" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "evolutionGoals" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "zone" TEXT,
  ADD COLUMN IF NOT EXISTS "isBlock" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "blockItems" JSONB,
  ADD COLUMN IF NOT EXISTS "videoUrl" TEXT;
ALTER TABLE "SessionExercise" ADD CONSTRAINT "SessionExercise_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ExerciseLoadRecord" DROP CONSTRAINT IF EXISTS "ExerciseLoadRecord_exerciseId_fkey";
ALTER TABLE "ExerciseLoadRecord" ALTER COLUMN "exerciseId" DROP NOT NULL;
ALTER TABLE "ExerciseLoadRecord" ADD COLUMN IF NOT EXISTS "sessionExerciseId" TEXT;
CREATE INDEX IF NOT EXISTS "ExerciseLoadRecord_sessionExerciseId_idx" ON "ExerciseLoadRecord"("sessionExerciseId");
ALTER TABLE "ExerciseLoadRecord" ADD CONSTRAINT "ExerciseLoadRecord_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "SessionExercise" se SET "name" = e."name", "category" = e."category", "equipment" = e."equipment", "description" = e."description", "requiresWeight" = e."requiresLoad", "perLeg" = e."perLeg"
FROM "Exercise" e WHERE se."exerciseId" = e.id AND se."name" IS NULL;
