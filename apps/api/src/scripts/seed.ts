import bcrypt from "bcryptjs";

import { env } from "../config/env.js";
import { prisma } from "../config/prisma.js";
import { exerciseCatalogSeed } from "../config/exercise-catalog.js";
import { bootstrapProgramTemplate } from "../config/program-template.js";

function inferDefaultNote(exerciseName: string) {
  if (exerciseName === "PWS") {
    return "Registrar colacion post-entrenamiento o recovery definido por el staff.";
  }

  if (exerciseName === "Stretch and Recover") {
    return "Completar secuencia de movilidad y estiramiento del manual.";
  }

  return "Configurar series, repeticiones, descansos y carga desde el portal admin.";
}

async function main() {
  const superadminPasswordHash = await bcrypt.hash(env.SEED_SUPERADMIN_PASSWORD, 10);

  await prisma.user.upsert({
    where: { email: env.SEED_SUPERADMIN_EMAIL.toLowerCase() },
    update: {
      email: env.SEED_SUPERADMIN_EMAIL.toLowerCase(),
      firstName: "Platform",
      lastName: "Admin",
      platformRole: "SUPERADMIN",
      passwordHash: superadminPasswordHash,
    },
    create: {
      email: env.SEED_SUPERADMIN_EMAIL.toLowerCase(),
      firstName: "Platform",
      lastName: "Admin",
      platformRole: "SUPERADMIN",
      passwordHash: superadminPasswordHash,
    },
  });

  const exerciseIds = new Map<string, string>();

  for (const definition of exerciseCatalogSeed) {
    const exerciseData = {
      name: definition.name,
      category: definition.category,
      requiresLoad: definition.requiresLoad ?? false,
      description: definition.summary,
      ...(definition.equipment ? { equipment: definition.equipment } : {}),
    };

    const exercise = await prisma.exercise.upsert({
      where: { slug: definition.slug },
      update: exerciseData,
      create: {
        slug: definition.slug,
        ...exerciseData,
      },
    });

    exerciseIds.set(definition.name, exercise.id);

    await prisma.exerciseInstruction.upsert({
      where: {
        exerciseId_locale: {
          exerciseId: exercise.id,
          locale: "es",
        },
      },
      update: {
        summary: definition.summary,
        steps: definition.steps,
        ...(definition.safetyNotes ? { safetyNotes: definition.safetyNotes } : {}),
      },
      create: {
        exerciseId: exercise.id,
        locale: "es",
        summary: definition.summary,
        steps: definition.steps,
        ...(definition.safetyNotes ? { safetyNotes: definition.safetyNotes } : {}),
      },
    });
  }

  const template = await prisma.programTemplate.upsert({
    where: { code: bootstrapProgramTemplate.code },
    update: {
      name: bootstrapProgramTemplate.name,
      description: "Plantilla base de 14 dias del metodo Jump Manual con dosificacion editable.",
      cycleLengthDays: bootstrapProgramTemplate.cycleLengthDays,
      isEditable: true,
    },
    create: {
      code: bootstrapProgramTemplate.code,
      name: bootstrapProgramTemplate.name,
      description: "Plantilla base de 14 dias del metodo Jump Manual con dosificacion editable.",
      cycleLengthDays: bootstrapProgramTemplate.cycleLengthDays,
      isEditable: true,
    },
  });

  const existingDays = await prisma.programDayTemplate.findMany({
    where: { programTemplateId: template.id },
    select: { id: true },
  });

  if (existingDays.length > 0) {
    await prisma.exercisePrescriptionTemplate.deleteMany({
      where: {
        programDayTemplateId: {
          in: existingDays.map((day) => day.id),
        },
      },
    });

    await prisma.programDayTemplate.deleteMany({
      where: { programTemplateId: template.id },
    });
  }

  for (const day of bootstrapProgramTemplate.days) {
    const createdDay = await prisma.programDayTemplate.create({
      data: {
        programTemplateId: template.id,
        dayNumber: day.dayNumber,
        title: day.title,
        dayType: day.dayType,
      },
    });

    for (const [index, exerciseName] of day.exercises.entries()) {
      const exerciseId = exerciseIds.get(exerciseName);

      if (!exerciseId) {
        throw new Error(`Missing exercise seed for ${exerciseName}`);
      }

      await prisma.exercisePrescriptionTemplate.create({
        data: {
          programDayTemplateId: createdDay.id,
          exerciseId,
          orderIndex: index + 1,
          notes: inferDefaultNote(exerciseName),
        },
      });
    }
  }

  console.log(`Seed completed. Exercises: ${exerciseCatalogSeed.length}. Template: ${template.code}`);
}

main()
  .catch((error) => {
    console.error("Seed failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
