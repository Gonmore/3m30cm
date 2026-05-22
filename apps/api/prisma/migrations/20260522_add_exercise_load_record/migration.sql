-- CreateTable
CREATE TABLE "ExerciseLoadRecord" (
    "id" TEXT NOT NULL,
    "athleteProfileId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "scheduledSessionId" TEXT NOT NULL,
    "loadKg" DOUBLE PRECISION NOT NULL,
    "repsPerformed" INTEGER,
    "performedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExerciseLoadRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExerciseLoadRecord_athleteProfileId_exerciseId_idx" ON "ExerciseLoadRecord"("athleteProfileId", "exerciseId");

-- CreateIndex
CREATE INDEX "ExerciseLoadRecord_scheduledSessionId_idx" ON "ExerciseLoadRecord"("scheduledSessionId");

-- AddForeignKey
ALTER TABLE "ExerciseLoadRecord" ADD CONSTRAINT "ExerciseLoadRecord_athleteProfileId_fkey" FOREIGN KEY ("athleteProfileId") REFERENCES "AthleteProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseLoadRecord" ADD CONSTRAINT "ExerciseLoadRecord_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseLoadRecord" ADD CONSTRAINT "ExerciseLoadRecord_scheduledSessionId_fkey" FOREIGN KEY ("scheduledSessionId") REFERENCES "ScheduledSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
