-- CreateTable: ExerciseTaskVariant
CREATE TABLE "ExerciseTaskVariant" (
    "id" TEXT NOT NULL,
    "exerciseTaskId" TEXT NOT NULL,
    "weekNumber" INTEGER NOT NULL,
    "exerciseId" TEXT,
    "name" TEXT,
    "sets" INTEGER,
    "repsOrTimeText" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExerciseTaskVariant_pkey" PRIMARY KEY ("id")
);

-- CreateUniqueIndex
CREATE UNIQUE INDEX "ExerciseTaskVariant_exerciseTaskId_weekNumber_key" ON "ExerciseTaskVariant"("exerciseTaskId", "weekNumber");

-- CreateIndex
CREATE INDEX "ExerciseTaskVariant_exerciseTaskId_idx" ON "ExerciseTaskVariant"("exerciseTaskId");

-- CreateIndex
CREATE INDEX "ExerciseTaskVariant_exerciseId_idx" ON "ExerciseTaskVariant"("exerciseId");

-- AddForeignKey
ALTER TABLE "ExerciseTaskVariant" ADD CONSTRAINT "ExerciseTaskVariant_exerciseTaskId_fkey" FOREIGN KEY ("exerciseTaskId") REFERENCES "ExerciseTaskTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseTaskVariant" ADD CONSTRAINT "ExerciseTaskVariant_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE SET NULL ON UPDATE CASCADE;
