-- AlterTable
ALTER TABLE "PersonalProgram" ADD COLUMN "assignmentId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "PersonalProgram_assignmentId_key" ON "PersonalProgram"("assignmentId");

-- AddForeignKey
ALTER TABLE "PersonalProgram" ADD CONSTRAINT "PersonalProgram_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "ProgramAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;