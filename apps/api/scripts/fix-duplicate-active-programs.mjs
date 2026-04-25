/**
 * One-time script: ensures each athlete has at most one ACTIVE program.
 *
 * For each athlete that has multiple non-ARCHIVED programs, it keeps the most
 * recently created one as ACTIVE and archives the rest (plus skips their
 * pending sessions).
 *
 * Run from the api directory:
 *   node scripts/fix-duplicate-active-programs.mjs
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const duplicates = await prisma.personalProgram.groupBy({
    by: ["athleteProfileId"],
    where: { status: { in: ["ACTIVE", "DRAFT", "PAUSED"] } },
    _count: { id: true },
    having: { id: { _count: { gt: 1 } } },
  });

  if (duplicates.length === 0) {
    console.log("No athletes with duplicate active programs found. Nothing to do.");
    return;
  }

  console.log(`Found ${duplicates.length} athlete(s) with duplicate active/draft/paused programs.`);

  for (const { athleteProfileId } of duplicates) {
    await prisma.$transaction(async (tx) => {
      const programs = await tx.personalProgram.findMany({
        where: {
          athleteProfileId,
          status: { in: ["ACTIVE", "DRAFT", "PAUSED"] },
        },
        orderBy: { createdAt: "desc" },
        select: { id: true, name: true, status: true, createdAt: true },
      });

      const [keep, ...toArchive] = programs;
      const toArchiveIds = toArchive.map((p) => p.id);

      console.log(
        `  Athlete ${athleteProfileId}: keeping "${keep.name}" (${keep.id}), archiving ${toArchiveIds.length} program(s).`,
      );

      // Archive old programs
      await tx.personalProgram.updateMany({
        where: { id: { in: toArchiveIds } },
        data: { status: "ARCHIVED" },
      });

      // Skip their pending sessions
      const skipped = await tx.scheduledSession.updateMany({
        where: {
          personalProgramId: { in: toArchiveIds },
          status: { in: ["PLANNED", "RESCHEDULED"] },
        },
        data: { status: "SKIPPED" },
      });

      // Ensure the kept program is ACTIVE
      await tx.personalProgram.update({
        where: { id: keep.id },
        data: { status: "ACTIVE" },
      });

      console.log(`    Skipped ${skipped.count} pending session(s) from archived programs.`);
    });
  }

  console.log("Done.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
