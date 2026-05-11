-- CreateEnum
CREATE TYPE "ExerciseEvolution" AS ENUM ('WEIGHT', 'TIME', 'VELOCITY', 'HYBRID');

-- CreateEnum
CREATE TYPE "ExerciseZone" AS ENUM ('LOWER', 'UPPER', 'CORE', 'FULL');

-- CreateTable
CREATE TABLE "ProgramPhaseTemplate" (
    "id" TEXT NOT NULL,
    "programTemplateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "masterBlockDays" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramPhaseTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramPhaseDayTemplate" (
    "id" TEXT NOT NULL,
    "phaseTemplateId" TEXT NOT NULL,
    "dayNumber" INTEGER NOT NULL,
    "title" TEXT,
    "dayType" "DayType" NOT NULL DEFAULT 'OTHER',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramPhaseDayTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExerciseTaskTemplate" (
    "id" TEXT NOT NULL,
    "phaseDayTemplateId" TEXT NOT NULL,
    "exerciseId" TEXT,
    "orderIndex" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "sets" INTEGER,
    "repsOrTimeText" TEXT,
    "description" TEXT,
    "requiresWeight" BOOLEAN NOT NULL DEFAULT false,
    "isUnilateral" BOOLEAN NOT NULL DEFAULT false,
    "evolution" "ExerciseEvolution" NOT NULL,
    "zone" "ExerciseZone" NOT NULL,
    "videoUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExerciseTaskTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProgramPhaseTemplate_programTemplateId_orderIndex_key" ON "ProgramPhaseTemplate"("programTemplateId", "orderIndex");

-- CreateIndex
CREATE INDEX "ProgramPhaseTemplate_programTemplateId_orderIndex_idx" ON "ProgramPhaseTemplate"("programTemplateId", "orderIndex");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramPhaseDayTemplate_phaseTemplateId_dayNumber_key" ON "ProgramPhaseDayTemplate"("phaseTemplateId", "dayNumber");

-- CreateIndex
CREATE INDEX "ProgramPhaseDayTemplate_phaseTemplateId_dayNumber_idx" ON "ProgramPhaseDayTemplate"("phaseTemplateId", "dayNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ExerciseTaskTemplate_phaseDayTemplateId_orderIndex_key" ON "ExerciseTaskTemplate"("phaseDayTemplateId", "orderIndex");

-- CreateIndex
CREATE INDEX "ExerciseTaskTemplate_phaseDayTemplateId_orderIndex_idx" ON "ExerciseTaskTemplate"("phaseDayTemplateId", "orderIndex");

-- CreateIndex
CREATE INDEX "ExerciseTaskTemplate_exerciseId_idx" ON "ExerciseTaskTemplate"("exerciseId");

-- AddForeignKey
ALTER TABLE "ProgramPhaseTemplate" ADD CONSTRAINT "ProgramPhaseTemplate_programTemplateId_fkey" FOREIGN KEY ("programTemplateId") REFERENCES "ProgramTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramPhaseDayTemplate" ADD CONSTRAINT "ProgramPhaseDayTemplate_phaseTemplateId_fkey" FOREIGN KEY ("phaseTemplateId") REFERENCES "ProgramPhaseTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseTaskTemplate" ADD CONSTRAINT "ExerciseTaskTemplate_phaseDayTemplateId_fkey" FOREIGN KEY ("phaseDayTemplateId") REFERENCES "ProgramPhaseDayTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseTaskTemplate" ADD CONSTRAINT "ExerciseTaskTemplate_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE SET NULL ON UPDATE CASCADE;
