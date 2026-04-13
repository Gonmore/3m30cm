import { Role, SeriesProtocol, type MediaKind, Prisma } from "@prisma/client";
import { type Request, type Response, Router } from "express";
import multer from "multer";
import { z } from "zod";

import { env } from "../config/env.js";
import { prisma } from "../config/prisma.js";
import { deleteExerciseMedia, uploadExerciseMedia } from "../lib/minio.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const exerciseSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/),
  category: z.string().min(2),
  description: z.string().trim().optional(),
  equipment: z.string().trim().optional(),
  requiresLoad: z.boolean().default(false),
  perLeg: z.boolean().default(false),
  isBlock: z.boolean().default(false),
  defaultSeriesProtocol: z.nativeEnum(SeriesProtocol).default(SeriesProtocol.NONE),
  summary: z.string().min(2),
  steps: z.string().min(5),
  safetyNotes: z.string().trim().optional(),
});

const mediaSchema = z.object({
  kind: z.enum(["IMAGE", "GIF", "VIDEO"] satisfies [MediaKind, ...MediaKind[]]),
  title: z.string().trim().optional(),
  isPrimary: z.coerce.boolean().default(false),
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024,
  },
});

function getStringParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

export const adminExercisesRouter = Router();

adminExercisesRouter.use(requireAuth, requireRole([Role.SUPERADMIN]));

adminExercisesRouter.get("/exercises", async (_req: Request, res: Response) => {
  try {
    const exercises = await prisma.exercise.findMany({
      orderBy: { name: "asc" },
      include: {
        instructions: {
          orderBy: { locale: "asc" },
        },
        mediaAssets: {
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        },
        asBlock: {
          include: {
            items: {
              orderBy: { order: "asc" },
              include: {
                exercise: {
                  select: { id: true, name: true, slug: true, category: true },
                },
              },
            },
          },
        },
      },
    });

    res.json({ exercises });
  } catch (error) {
    console.error("Failed to fetch admin exercises", error);
    res.status(500).json({ message: "Failed to fetch exercises" });
  }
});

adminExercisesRouter.post("/exercises", async (req: Request, res: Response) => {
  try {
    const payload = exerciseSchema.parse(req.body);

    const exercise = await prisma.exercise.create({
      data: {
        slug: payload.slug,
        name: payload.name,
        category: payload.category,
        requiresLoad: payload.requiresLoad,
        perLeg: payload.perLeg,
        isBlock: payload.isBlock,
        defaultSeriesProtocol: payload.defaultSeriesProtocol,
        ...(payload.description ? { description: payload.description } : {}),
        ...(payload.equipment ? { equipment: payload.equipment } : {}),
        instructions: {
          create: {
            locale: "es",
            summary: payload.summary,
            steps: payload.steps,
            ...(payload.safetyNotes ? { safetyNotes: payload.safetyNotes } : {}),
          },
        },
      },
      include: {
        instructions: true,
        mediaAssets: true,
        asBlock: { include: { items: { orderBy: { order: "asc" }, include: { exercise: { select: { id: true, name: true, slug: true, category: true } } } } } },
      },
    });

    res.status(201).json({ exercise });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: "Invalid payload", issues: error.issues });
      return;
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      res.status(409).json({ message: "Exercise slug already exists" });
      return;
    }

    console.error("Failed to create exercise", error);
    res.status(500).json({ message: "Failed to create exercise" });
  }
});

adminExercisesRouter.put("/exercises/:id", async (req: Request, res: Response) => {
  try {
    const exerciseId = getStringParam(req.params.id);

    if (!exerciseId) {
      res.status(400).json({ message: "Exercise id is required" });
      return;
    }

    const payload = exerciseSchema.parse(req.body);
    const instructionCreateData = {
      locale: "es",
      summary: payload.summary,
      steps: payload.steps,
      ...(payload.safetyNotes ? { safetyNotes: payload.safetyNotes } : {}),
    };

    const existingInstruction = await prisma.exerciseInstruction.findFirst({
      where: {
        exerciseId,
        locale: "es",
      },
      select: { id: true },
    });

    const exercise = await prisma.exercise.update({
      where: { id: exerciseId },
      data: {
        slug: payload.slug,
        name: payload.name,
        category: payload.category,
        requiresLoad: payload.requiresLoad,
        perLeg: payload.perLeg,
        isBlock: payload.isBlock,
        defaultSeriesProtocol: payload.defaultSeriesProtocol,
        description: payload.description ?? null,
        equipment: payload.equipment ?? null,
        instructions: existingInstruction
          ? {
              update: {
                where: { id: existingInstruction.id },
                data: {
                  summary: payload.summary,
                  steps: payload.steps,
                  safetyNotes: payload.safetyNotes ?? null,
                },
              },
            }
          : {
              create: instructionCreateData,
            },
      },
      include: {
        instructions: true,
        mediaAssets: {
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        },
        asBlock: { include: { items: { orderBy: { order: "asc" }, include: { exercise: { select: { id: true, name: true, slug: true, category: true } } } } } },
      },
    });

    res.json({ exercise });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: "Invalid payload", issues: error.issues });
      return;
    }

    console.error("Failed to update exercise", error);
    res.status(500).json({ message: "Failed to update exercise" });
  }
});

adminExercisesRouter.delete("/exercises/:id", async (req: Request, res: Response) => {
  try {
    const exerciseId = getStringParam(req.params.id);

    if (!exerciseId) {
      res.status(400).json({ message: "Exercise id is required" });
      return;
    }

    const mediaAssets = await prisma.exerciseMediaAsset.findMany({
      where: { exerciseId },
      select: { objectKey: true },
    });

    await prisma.exercise.delete({
      where: { id: exerciseId },
    });

    await Promise.all(mediaAssets.map((asset) => deleteExerciseMedia(asset.objectKey).catch(() => undefined)));

    res.status(204).send();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025") {
        res.status(404).json({ message: "Exercise not found" });
        return;
      }

      if (error.code === "P2003") {
        res.status(409).json({ message: "Exercise is referenced by program data and cannot be deleted" });
        return;
      }
    }

    console.error("Failed to delete exercise", error);
    res.status(500).json({ message: "Failed to delete exercise" });
  }
});

adminExercisesRouter.post(
  "/exercises/:id/media",
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      const exerciseId = getStringParam(req.params.id);
      const file = req.file;

      if (!exerciseId) {
        res.status(400).json({ message: "Exercise id is required" });
        return;
      }

      if (!file) {
        res.status(400).json({ message: "File is required" });
        return;
      }

      const metadata = mediaSchema.parse(req.body);
      const exercise = await prisma.exercise.findUnique({
        where: { id: exerciseId },
        select: { id: true },
      });

      if (!exercise) {
        res.status(404).json({ message: "Exercise not found" });
        return;
      }

      const uploadResult = await uploadExerciseMedia({
        exerciseId,
        fileName: file.originalname,
        contentType: file.mimetype || "application/octet-stream",
        data: file.buffer,
      });

      if (metadata.isPrimary) {
        await prisma.exerciseMediaAsset.updateMany({
          where: { exerciseId },
          data: { isPrimary: false },
        });
      }

      const mediaAsset = await prisma.exerciseMediaAsset.create({
        data: {
          exerciseId,
          kind: metadata.kind,
          bucket: env.MINIO_BUCKET,
          objectKey: uploadResult.objectKey,
          url: uploadResult.url,
          title: metadata.title ?? null,
          isPrimary: metadata.isPrimary,
        },
      });

      res.status(201).json({ mediaAsset });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid media payload", issues: error.issues });
        return;
      }

      console.error("Failed to upload exercise media", error);
      res.status(500).json({ message: "Failed to upload exercise media" });
    }
  },
);

adminExercisesRouter.delete("/exercises/:exerciseId/media/:mediaId", async (req: Request, res: Response) => {
  try {
    const exerciseId = getStringParam(req.params.exerciseId);
    const mediaId = getStringParam(req.params.mediaId);

    if (!exerciseId || !mediaId) {
      res.status(400).json({ message: "Exercise id and media id are required" });
      return;
    }

    const media = await prisma.exerciseMediaAsset.findUnique({
      where: { id: mediaId },
    });

    if (!media || media.exerciseId !== exerciseId) {
      res.status(404).json({ message: "Media asset not found" });
      return;
    }

    await prisma.exerciseMediaAsset.delete({
      where: { id: mediaId },
    });

    await deleteExerciseMedia(media.objectKey).catch(() => undefined);

    res.status(204).send();
  } catch (error) {
    console.error("Failed to delete exercise media", error);
    res.status(500).json({ message: "Failed to delete exercise media" });
  }
});

// ── Block items management ────────────────────────────────────────────────────
const blockItemsSchema = z.object({
  items: z.array(
    z.object({
      exerciseId: z.string().min(1),
      order: z.number().int().min(0),
      setsOverride: z.number().int().positive().nullable().optional(),
      repsOverride: z.string().trim().nullable().optional(),
      notes: z.string().trim().nullable().optional(),
    }),
  ),
});

adminExercisesRouter.put("/exercises/:id/block-items", async (req: Request, res: Response) => {
  try {
    const exerciseId = getStringParam(req.params.id);
    if (!exerciseId) {
      res.status(400).json({ message: "Exercise id is required" });
      return;
    }

    const exercise = await prisma.exercise.findUnique({
      where: { id: exerciseId },
      select: { id: true, isBlock: true },
    });

    if (!exercise) {
      res.status(404).json({ message: "Exercise not found" });
      return;
    }

    const { items } = blockItemsSchema.parse(req.body);

    // Upsert the block header and replace all items atomically
    // Also set isBlock=true on the exercise in case it wasn't saved yet
    const block = await prisma.$transaction(async (tx) => {
      await tx.exercise.update({
        where: { id: exerciseId },
        data: { isBlock: true },
      });

      const blockRecord = await tx.exerciseBlock.upsert({
        where: { exerciseId },
        create: { exerciseId },
        update: {},
        select: { id: true },
      });

      await tx.exerciseBlockItem.deleteMany({ where: { blockId: blockRecord.id } });

      if (items.length > 0) {
        await tx.exerciseBlockItem.createMany({
          data: items.map((item) => ({
            blockId: blockRecord.id,
            exerciseId: item.exerciseId,
            order: item.order,
            setsOverride: item.setsOverride ?? null,
            repsOverride: item.repsOverride ?? null,
            notes: item.notes ?? null,
          })),
        });
      }

      return tx.exerciseBlock.findUnique({
        where: { id: blockRecord.id },
        include: {
          items: {
            orderBy: { order: "asc" },
            include: {
              exercise: { select: { id: true, name: true, slug: true, category: true } },
            },
          },
        },
      });
    });

    res.json({ block });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: "Invalid payload", issues: error.issues });
      return;
    }
    console.error("Failed to update block items", error);
    res.status(500).json({ message: "Failed to update block items" });
  }
});
