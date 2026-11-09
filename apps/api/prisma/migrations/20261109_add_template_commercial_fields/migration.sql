-- AlterTable
ALTER TABLE "ProgramTemplate" ADD COLUMN "objective" TEXT;
ALTER TABLE "ProgramTemplate" ADD COLUMN "displayPriceCents" INTEGER;
ALTER TABLE "ProgramTemplate" ADD COLUMN "currency" TEXT DEFAULT 'ARS';
ALTER TABLE "ProgramTemplate" ADD COLUMN "usesPhases" BOOLEAN NOT NULL DEFAULT false;
