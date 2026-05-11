-- AlterTable: add evolution and zone to Exercise
ALTER TABLE "Exercise" ADD COLUMN "evolution" "ExerciseEvolution";
ALTER TABLE "Exercise" ADD COLUMN "zone" "ExerciseZone";
