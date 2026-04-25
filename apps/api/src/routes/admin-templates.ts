import { DayType, MediaKind, Prisma, Role, SeriesProtocol } from "@prisma/client";
import { type Request, type Response, Router } from "express";
import multer from "multer";
import { z } from "zod";

import { env } from "../config/env.js";
import { prisma } from "../config/prisma.js";
import { deleteProgramTechniqueMedia, uploadProgramTechniqueMedia } from "../lib/minio.js";
import { ensureTemplateTechniqueStructure } from "../lib/program-template-techniques.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const prescriptionSchema = z.object({
  id: z.string().optional(),
  exerciseId: z.string().min(1),
  orderIndex: z.number().int().positive(),
  seriesProtocol: z.nativeEnum(SeriesProtocol).default(SeriesProtocol.NONE),
  blockLabel: z.string().trim().nullable().optional(),
  sets: z.number().int().positive().nullable().optional(),
  repsText: z.string().trim().nullable().optional(),
  durationSeconds: z.number().int().positive().nullable().optional(),
  restSeconds: z.number().int().nonnegative().nullable().optional(),
  loadText: z.string().trim().nullable().optional(),
  tempoText: z.string().trim().nullable().optional(),
  notes: z.string().trim().nullable().optional(),
});

const replacePrescriptionsSchema = z.object({
  prescriptions: z.array(prescriptionSchema).min(1),
});

const createTemplateSchema = z.object({
  name: z.string().trim().min(2),
  code: z.string().trim().min(2).regex(/^[A-Z0-9-]+$/, "Code must be uppercase letters, digits and hyphens"),
  description: z.string().trim().optional(),
  cycleLengthDays: z.number().int().min(1).max(365).default(14),
});

const updateTemplateSchema = z.object({
  name: z.string().trim().min(2).optional(),
  description: z.string().trim().nullable().optional(),
  techniqueTitle: z.string().trim().nullable().optional(),
  techniqueDescription: z.string().trim().nullable().optional(),
  cycleLengthDays: z.number().int().min(1).max(365).optional(),
});

const createTechniqueSchema = z.object({
  title: z.string().trim().min(2),
  description: z.string().trim().nullable().optional(),
  measurementInstructions: z.string().trim().nullable().optional(),
  comparisonEnabled: z.coerce.boolean().default(false),
});

const updateTechniqueSchema = z.object({
  title: z.string().trim().min(2).optional(),
  description: z.string().trim().nullable().optional(),
  measurementInstructions: z.string().trim().nullable().optional(),
  comparisonEnabled: z.coerce.boolean().optional(),
  orderIndex: z.number().int().positive().optional(),
});

const techniqueMeasurementDefinitionSchema = z.object({
  label: z.string().trim().min(1),
  instructions: z.string().trim().nullable().optional(),
  allowedUnits: z.array(z.string().trim().min(1)).default([]),
  orderIndex: z.number().int().positive().optional(),
});

const upsertDaySchema = z.object({
  title: z.string().trim().min(1),
  dayType: z.nativeEnum(DayType),
  notes: z.string().trim().nullable().optional(),
});

const techniqueMediaSchema = z.object({
  kind: z.nativeEnum(MediaKind).default(MediaKind.VIDEO),
  title: z.string().trim().nullable().optional(),
  isPrimary: z.coerce.boolean().default(false),
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 250 * 1024 * 1024 } });

function getStringParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

export const adminTemplatesRouter = Router();

adminTemplatesRouter.use(requireAuth, requireRole([Role.SUPERADMIN]));

adminTemplatesRouter.put(
  "/program-templates/:code/days/:dayNumber/prescriptions",
  async (req: Request, res: Response) => {
    try {
      const code = getStringParam(req.params.code);
      const dayNumber = Number(req.params.dayNumber);

      if (!code) {
        res.status(400).json({ message: "Program template code is required" });
        return;
      }

      if (!Number.isInteger(dayNumber) || dayNumber <= 0) {
        res.status(400).json({ message: "Invalid day number" });
        return;
      }

      const payload = replacePrescriptionsSchema.parse(req.body);
      const template = await prisma.programTemplate.findUnique({
        where: { code },
        select: { id: true },
      });

      if (!template) {
        res.status(404).json({ message: "Program template not found" });
        return;
      }

      const day = await prisma.programDayTemplate.findUnique({
        where: {
          programTemplateId_dayNumber: {
            programTemplateId: template.id,
            dayNumber,
          },
        },
        select: { id: true },
      });

      if (!day) {
        res.status(404).json({ message: "Program day not found" });
        return;
      }

      await prisma.$transaction(async (transaction) => {
        await transaction.exercisePrescriptionTemplate.deleteMany({
          where: {
            programDayTemplateId: day.id,
          },
        });

        for (const prescription of payload.prescriptions) {
          await transaction.exercisePrescriptionTemplate.create({
            data: {
              programDayTemplateId: day.id,
              exerciseId: prescription.exerciseId,
              orderIndex: prescription.orderIndex,
              seriesProtocol: prescription.seriesProtocol ?? SeriesProtocol.NONE,
              blockLabel: prescription.blockLabel ?? null,
              sets: prescription.sets ?? null,
              repsText: prescription.repsText ?? null,
              durationSeconds: prescription.durationSeconds ?? null,
              restSeconds: prescription.restSeconds ?? null,
              loadText: prescription.loadText ?? null,
              tempoText: prescription.tempoText ?? null,
              notes: prescription.notes ?? null,
            },
          });
        }
      });

      const refreshedDay = await prisma.programDayTemplate.findUnique({
        where: { id: day.id },
        include: {
          prescriptions: {
            orderBy: { orderIndex: "asc" },
            include: {
              exercise: {
                include: {
                  instructions: {
                    orderBy: { locale: "asc" },
                  },
                  mediaAssets: {
                    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
                  },
                },
              },
            },
          },
        },
      });

      res.json({ day: refreshedDay });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid prescription payload", issues: error.issues });
        return;
      }

      console.error("Failed to replace prescriptions", error);
      res.status(500).json({ message: "Failed to replace prescriptions" });
    }
  },
);

// ── Template CRUD ───────────────────────────────────────────────────────────

adminTemplatesRouter.get("/program-templates", async (_req: Request, res: Response) => {
  try {
    const templates = await prisma.programTemplate.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        _count: { select: { days: true, personalPrograms: true } },
        techniqueMediaAssets: {
          orderBy: [{ isPrimary: "desc" }, { orderIndex: "asc" }, { createdAt: "asc" }],
          select: { id: true },
        },
        techniques: {
          select: { id: true },
        },
      },
    });
    res.json({ templates });
  } catch (error) {
    console.error("Failed to list templates", error);
    res.status(500).json({ message: "Failed to list templates" });
  }
});

adminTemplatesRouter.post("/program-templates", async (req: Request, res: Response) => {
  try {
    const payload = createTemplateSchema.parse(req.body);
    const existing = await prisma.programTemplate.findUnique({ where: { code: payload.code }, select: { id: true } });
    if (existing) {
      res.status(409).json({ message: `Ya existe un template con el código ${payload.code}` });
      return;
    }
    const template = await prisma.programTemplate.create({
      data: {
        name: payload.name,
        code: payload.code,
        description: payload.description ?? null,
        techniqueTitle: null,
        techniqueDescription: null,
        cycleLengthDays: payload.cycleLengthDays,
        isEditable: true,
        techniques: {
          create: {
            title: `${payload.name} · Técnica 1`,
            description: null,
            measurementInstructions: null,
            comparisonEnabled: false,
            orderIndex: 1,
          },
        },
      },
      include: {
        _count: { select: { days: true, personalPrograms: true } },
        techniqueMediaAssets: { select: { id: true } },
        techniques: { select: { id: true } },
      },
    });
    res.status(201).json({ template });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: "Invalid template payload", issues: error.issues });
      return;
    }
    console.error("Failed to create template", error);
    res.status(500).json({ message: "Failed to create template" });
  }
});

adminTemplatesRouter.put("/program-templates/:code", async (req: Request, res: Response) => {
  try {
    const code = getStringParam(req.params.code);
    if (!code) { res.status(400).json({ message: "Code required" }); return; }
    const payload = updateTemplateSchema.parse(req.body);
    const template = await prisma.programTemplate.update({
      where: { code },
      data: {
        ...(payload.name !== undefined && { name: payload.name }),
        ...(payload.description !== undefined && { description: payload.description }),
        ...(payload.techniqueTitle !== undefined && { techniqueTitle: payload.techniqueTitle }),
        ...(payload.techniqueDescription !== undefined && { techniqueDescription: payload.techniqueDescription }),
        ...(payload.cycleLengthDays !== undefined && { cycleLengthDays: payload.cycleLengthDays }),
      },
      include: {
        _count: { select: { days: true, personalPrograms: true } },
        techniqueMediaAssets: { select: { id: true } },
        techniques: { select: { id: true } },
      },
    });
    res.json({ template });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: "Invalid payload", issues: error.issues });
      return;
    }
    console.error("Failed to update template", error);
    res.status(500).json({ message: "Failed to update template" });
  }
});

adminTemplatesRouter.get("/program-templates/:code/techniques", async (req: Request, res: Response) => {
  try {
    const code = getStringParam(req.params.code);
    if (!code) {
      res.status(400).json({ message: "Program template code is required" });
      return;
    }

    const template = await prisma.programTemplate.findUnique({ where: { code }, select: { id: true } });
    if (!template) {
      res.status(404).json({ message: "Program template not found" });
      return;
    }

    const hydratedTemplate = await ensureTemplateTechniqueStructure(prisma, template.id);
    res.json({ techniques: hydratedTemplate?.techniques ?? [] });
  } catch (error) {
    console.error("Failed to list techniques", error);
    res.status(500).json({ message: "Failed to list techniques" });
  }
});

adminTemplatesRouter.post("/program-templates/:code/techniques", async (req: Request, res: Response) => {
  try {
    const code = getStringParam(req.params.code);
    if (!code) {
      res.status(400).json({ message: "Program template code is required" });
      return;
    }

    const payload = createTechniqueSchema.parse(req.body);
    const template = await prisma.programTemplate.findUnique({ where: { code }, select: { id: true } });
    if (!template) {
      res.status(404).json({ message: "Program template not found" });
      return;
    }

    const existing = await ensureTemplateTechniqueStructure(prisma, template.id);
    const technique = await prisma.programTemplateTechnique.create({
      data: {
        programTemplateId: template.id,
        title: payload.title,
        description: payload.description ?? null,
        measurementInstructions: payload.measurementInstructions ?? null,
        comparisonEnabled: payload.comparisonEnabled,
        orderIndex: (existing?.techniques.length ?? 0) + 1,
      },
      include: {
        mediaAssets: { orderBy: [{ isPrimary: "desc" }, { orderIndex: "asc" }, { createdAt: "asc" }] },
        measurementDefinitions: { orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }] },
      },
    });

    res.status(201).json({ technique });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: "Invalid technique payload", issues: error.issues });
      return;
    }

    console.error("Failed to create technique", error);
    res.status(500).json({ message: "Failed to create technique" });
  }
});

adminTemplatesRouter.put("/program-templates/:code/techniques/:techniqueId", async (req: Request, res: Response) => {
  try {
    const code = getStringParam(req.params.code);
    const techniqueId = getStringParam(req.params.techniqueId);
    if (!code || !techniqueId) {
      res.status(400).json({ message: "Program template code and technique id are required" });
      return;
    }

    const payload = updateTechniqueSchema.parse(req.body);
    const template = await prisma.programTemplate.findUnique({ where: { code }, select: { id: true } });
    if (!template) {
      res.status(404).json({ message: "Program template not found" });
      return;
    }

    const technique = await prisma.programTemplateTechnique.findUnique({ where: { id: techniqueId } });
    if (!technique || technique.programTemplateId !== template.id) {
      res.status(404).json({ message: "Technique not found" });
      return;
    }

    const updatedTechnique = await prisma.programTemplateTechnique.update({
      where: { id: techniqueId },
      data: {
        ...(payload.title !== undefined && { title: payload.title }),
        ...(payload.description !== undefined && { description: payload.description }),
        ...(payload.measurementInstructions !== undefined && { measurementInstructions: payload.measurementInstructions }),
        ...(payload.comparisonEnabled !== undefined && { comparisonEnabled: payload.comparisonEnabled }),
        ...(payload.orderIndex !== undefined && { orderIndex: payload.orderIndex }),
      },
      include: {
        mediaAssets: { orderBy: [{ isPrimary: "desc" }, { orderIndex: "asc" }, { createdAt: "asc" }] },
        measurementDefinitions: { orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }] },
      },
    });

    res.json({ technique: updatedTechnique });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: "Invalid technique payload", issues: error.issues });
      return;
    }

    console.error("Failed to update technique", error);
    res.status(500).json({ message: "Failed to update technique" });
  }
});

adminTemplatesRouter.delete("/program-templates/:code/techniques/:techniqueId", async (req: Request, res: Response) => {
  try {
    const code = getStringParam(req.params.code);
    const techniqueId = getStringParam(req.params.techniqueId);
    if (!code || !techniqueId) {
      res.status(400).json({ message: "Program template code and technique id are required" });
      return;
    }

    const template = await prisma.programTemplate.findUnique({ where: { code }, select: { id: true } });
    if (!template) {
      res.status(404).json({ message: "Program template not found" });
      return;
    }

    const technique = await prisma.programTemplateTechnique.findUnique({ where: { id: techniqueId } });
    if (!technique || technique.programTemplateId !== template.id) {
      res.status(404).json({ message: "Technique not found" });
      return;
    }

    await prisma.programTemplateTechnique.delete({ where: { id: techniqueId } });
    res.status(204).send();
  } catch (error) {
    console.error("Failed to delete technique", error);
    res.status(500).json({ message: "Failed to delete technique" });
  }
});

adminTemplatesRouter.post("/program-templates/:code/techniques/:techniqueId/measurements", async (req: Request, res: Response) => {
  try {
    const code = getStringParam(req.params.code);
    const techniqueId = getStringParam(req.params.techniqueId);
    if (!code || !techniqueId) {
      res.status(400).json({ message: "Program template code and technique id are required" });
      return;
    }

    const payload = techniqueMeasurementDefinitionSchema.parse(req.body);
    const template = await prisma.programTemplate.findUnique({ where: { code }, select: { id: true } });
    if (!template) {
      res.status(404).json({ message: "Program template not found" });
      return;
    }

    const technique = await prisma.programTemplateTechnique.findUnique({
      where: { id: techniqueId },
      include: { measurementDefinitions: { orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }] } },
    });
    if (!technique || technique.programTemplateId !== template.id) {
      res.status(404).json({ message: "Technique not found" });
      return;
    }

    const measurement = await prisma.programTemplateTechniqueMeasurementDefinition.create({
      data: {
        techniqueId,
        label: payload.label,
        instructions: payload.instructions ?? null,
        allowedUnits: payload.allowedUnits.length ? payload.allowedUnits : Prisma.JsonNull,
        orderIndex: payload.orderIndex ?? technique.measurementDefinitions.length + 1,
      },
    });

    res.status(201).json({ measurement });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: "Invalid measurement definition payload", issues: error.issues });
      return;
    }

    console.error("Failed to create measurement definition", error);
    res.status(500).json({ message: "Failed to create measurement definition" });
  }
});

adminTemplatesRouter.put("/program-templates/:code/techniques/:techniqueId/measurements/:measurementId", async (req: Request, res: Response) => {
  try {
    const code = getStringParam(req.params.code);
    const techniqueId = getStringParam(req.params.techniqueId);
    const measurementId = getStringParam(req.params.measurementId);
    if (!code || !techniqueId || !measurementId) {
      res.status(400).json({ message: "Program template code, technique id and measurement id are required" });
      return;
    }

    const payload = techniqueMeasurementDefinitionSchema.partial().parse(req.body);
    const template = await prisma.programTemplate.findUnique({ where: { code }, select: { id: true } });
    if (!template) {
      res.status(404).json({ message: "Program template not found" });
      return;
    }

    const technique = await prisma.programTemplateTechnique.findUnique({ where: { id: techniqueId } });
    if (!technique || technique.programTemplateId !== template.id) {
      res.status(404).json({ message: "Technique not found" });
      return;
    }

    const measurement = await prisma.programTemplateTechniqueMeasurementDefinition.findUnique({ where: { id: measurementId } });
    if (!measurement || measurement.techniqueId !== techniqueId) {
      res.status(404).json({ message: "Measurement definition not found" });
      return;
    }

    const updatedMeasurement = await prisma.programTemplateTechniqueMeasurementDefinition.update({
      where: { id: measurementId },
      data: {
        ...(payload.label !== undefined && { label: payload.label }),
        ...(payload.instructions !== undefined && { instructions: payload.instructions }),
        ...(payload.allowedUnits !== undefined && { allowedUnits: payload.allowedUnits.length ? payload.allowedUnits : Prisma.JsonNull }),
        ...(payload.orderIndex !== undefined && { orderIndex: payload.orderIndex }),
      },
    });

    res.json({ measurement: updatedMeasurement });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: "Invalid measurement definition payload", issues: error.issues });
      return;
    }

    console.error("Failed to update measurement definition", error);
    res.status(500).json({ message: "Failed to update measurement definition" });
  }
});

adminTemplatesRouter.delete("/program-templates/:code/techniques/:techniqueId/measurements/:measurementId", async (req: Request, res: Response) => {
  try {
    const code = getStringParam(req.params.code);
    const techniqueId = getStringParam(req.params.techniqueId);
    const measurementId = getStringParam(req.params.measurementId);
    if (!code || !techniqueId || !measurementId) {
      res.status(400).json({ message: "Program template code, technique id and measurement id are required" });
      return;
    }

    const template = await prisma.programTemplate.findUnique({ where: { code }, select: { id: true } });
    if (!template) {
      res.status(404).json({ message: "Program template not found" });
      return;
    }

    const technique = await prisma.programTemplateTechnique.findUnique({ where: { id: techniqueId } });
    if (!technique || technique.programTemplateId !== template.id) {
      res.status(404).json({ message: "Technique not found" });
      return;
    }

    const measurement = await prisma.programTemplateTechniqueMeasurementDefinition.findUnique({ where: { id: measurementId } });
    if (!measurement || measurement.techniqueId !== techniqueId) {
      res.status(404).json({ message: "Measurement definition not found" });
      return;
    }

    await prisma.programTemplateTechniqueMeasurementDefinition.delete({ where: { id: measurementId } });
    res.status(204).send();
  } catch (error) {
    console.error("Failed to delete measurement definition", error);
    res.status(500).json({ message: "Failed to delete measurement definition" });
  }
});

adminTemplatesRouter.post(
  "/program-templates/:code/technique/media",
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      const code = getStringParam(req.params.code);
      const file = req.file;

      if (!code) {
        res.status(400).json({ message: "Program template code is required" });
        return;
      }

      if (!file) {
        res.status(400).json({ message: "File is required" });
        return;
      }

      const metadata = techniqueMediaSchema.parse(req.body);
      const template = await prisma.programTemplate.findUnique({
        where: { code },
        select: { id: true },
      });

      if (!template) {
        res.status(404).json({ message: "Program template not found" });
        return;
      }

      const uploadResult = await uploadProgramTechniqueMedia({
        programTemplateId: template.id,
        fileName: file.originalname,
        contentType: file.mimetype || "application/octet-stream",
        data: file.buffer,
      });

      const orderIndex = await prisma.programTemplateTechniqueAsset.count({
        where: { programTemplateId: template.id },
      });

      if (metadata.isPrimary) {
        await prisma.programTemplateTechniqueAsset.updateMany({
          where: { programTemplateId: template.id },
          data: { isPrimary: false },
        });
      }

      const mediaAsset = await prisma.programTemplateTechniqueAsset.create({
        data: {
          programTemplateId: template.id,
          kind: metadata.kind,
          bucket: env.MINIO_BUCKET,
          objectKey: uploadResult.objectKey,
          url: uploadResult.url,
          title: metadata.title ?? null,
          isPrimary: metadata.isPrimary,
          orderIndex,
        },
      });

      res.status(201).json({ mediaAsset });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid technique media payload", issues: error.issues });
        return;
      }

      console.error("Failed to upload technique media", error);
      res.status(500).json({ message: "Failed to upload technique media" });
    }
  },
);

adminTemplatesRouter.post(
  "/program-templates/:code/techniques/:techniqueId/media",
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      const code = getStringParam(req.params.code);
      const techniqueId = getStringParam(req.params.techniqueId);
      const file = req.file;

      if (!code || !techniqueId) {
        res.status(400).json({ message: "Program template code and technique id are required" });
        return;
      }

      if (!file) {
        res.status(400).json({ message: "File is required" });
        return;
      }

      const metadata = techniqueMediaSchema.parse(req.body);
      const technique = await prisma.programTemplateTechnique.findUnique({
        where: { id: techniqueId },
        include: { programTemplate: { select: { code: true } } },
      });

      if (!technique || technique.programTemplate.code !== code) {
        res.status(404).json({ message: "Technique not found" });
        return;
      }

      const uploadResult = await uploadProgramTechniqueMedia({
        programTemplateId: technique.programTemplateId,
        fileName: file.originalname,
        contentType: file.mimetype || "application/octet-stream",
        data: file.buffer,
      });

      const orderIndex = await prisma.programTemplateTechniqueAsset.count({
        where: { techniqueId },
      });

      if (metadata.isPrimary) {
        await prisma.programTemplateTechniqueAsset.updateMany({
          where: { techniqueId },
          data: { isPrimary: false },
        });
      }

      const mediaAsset = await prisma.programTemplateTechniqueAsset.create({
        data: {
          programTemplateId: technique.programTemplateId,
          techniqueId,
          kind: metadata.kind,
          bucket: env.MINIO_BUCKET,
          objectKey: uploadResult.objectKey,
          url: uploadResult.url,
          title: metadata.title ?? null,
          isPrimary: metadata.isPrimary,
          orderIndex,
        },
      });

      res.status(201).json({ mediaAsset });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid technique media payload", issues: error.issues });
        return;
      }

      console.error("Failed to upload technique media", error);
      res.status(500).json({ message: "Failed to upload technique media" });
    }
  },
);

adminTemplatesRouter.delete("/program-templates/:code/techniques/:techniqueId/media/:mediaId", async (req: Request, res: Response) => {
  try {
    const code = getStringParam(req.params.code);
    const techniqueId = getStringParam(req.params.techniqueId);
    const mediaId = getStringParam(req.params.mediaId);

    if (!code || !techniqueId || !mediaId) {
      res.status(400).json({ message: "Program template code, technique id and media id are required" });
      return;
    }

    const technique = await prisma.programTemplateTechnique.findUnique({
      where: { id: techniqueId },
      include: { programTemplate: { select: { code: true } } },
    });

    if (!technique || technique.programTemplate.code !== code) {
      res.status(404).json({ message: "Technique not found" });
      return;
    }

    const media = await prisma.programTemplateTechniqueAsset.findUnique({ where: { id: mediaId } });
    if (!media || media.techniqueId !== techniqueId) {
      res.status(404).json({ message: "Technique media asset not found" });
      return;
    }

    await prisma.programTemplateTechniqueAsset.delete({ where: { id: mediaId } });
    await deleteProgramTechniqueMedia(media.objectKey).catch(() => undefined);

    res.status(204).send();
  } catch (error) {
    console.error("Failed to delete technique media", error);
    res.status(500).json({ message: "Failed to delete technique media" });
  }
});

adminTemplatesRouter.delete("/program-templates/:code/technique/media/:mediaId", async (req: Request, res: Response) => {
  try {
    const code = getStringParam(req.params.code);
    const mediaId = getStringParam(req.params.mediaId);

    if (!code || !mediaId) {
      res.status(400).json({ message: "Program template code and media id are required" });
      return;
    }

    const template = await prisma.programTemplate.findUnique({ where: { code }, select: { id: true } });
    if (!template) {
      res.status(404).json({ message: "Program template not found" });
      return;
    }

    const media = await prisma.programTemplateTechniqueAsset.findUnique({ where: { id: mediaId } });

    if (!media || media.programTemplateId !== template.id) {
      res.status(404).json({ message: "Technique media asset not found" });
      return;
    }

    await prisma.programTemplateTechniqueAsset.delete({ where: { id: mediaId } });
    await deleteProgramTechniqueMedia(media.objectKey).catch(() => undefined);

    res.status(204).send();
  } catch (error) {
    console.error("Failed to delete technique media", error);
    res.status(500).json({ message: "Failed to delete technique media" });
  }
});

adminTemplatesRouter.delete("/program-templates/:code", async (req: Request, res: Response) => {
  try {
    const code = getStringParam(req.params.code);
    if (!code) { res.status(400).json({ message: "Code required" }); return; }
    const template = await prisma.programTemplate.findUnique({ where: { code }, select: { id: true, isEditable: true } });
    if (!template) { res.status(404).json({ message: "Template not found" }); return; }
    if (!template.isEditable) { res.status(403).json({ message: "This template is read-only" }); return; }
    await prisma.programTemplate.delete({ where: { code } });
    res.status(204).end();
  } catch (error) {
    console.error("Failed to delete template", error);
    res.status(500).json({ message: "Failed to delete template" });
  }
});

// ── Day CRUD ────────────────────────────────────────────────────────────────

adminTemplatesRouter.put(
  "/program-templates/:code/days/:dayNumber",
  async (req: Request, res: Response) => {
    try {
      const code = getStringParam(req.params.code);
      const dayNumber = Number(req.params.dayNumber);
      if (!code) { res.status(400).json({ message: "Code required" }); return; }
      if (!Number.isInteger(dayNumber) || dayNumber <= 0) { res.status(400).json({ message: "Invalid day number" }); return; }

      const payload = upsertDaySchema.parse(req.body);
      const template = await prisma.programTemplate.findUnique({ where: { code }, select: { id: true } });
      if (!template) { res.status(404).json({ message: "Template not found" }); return; }

      const day = await prisma.programDayTemplate.upsert({
        where: { programTemplateId_dayNumber: { programTemplateId: template.id, dayNumber } },
        update: { title: payload.title, dayType: payload.dayType, notes: payload.notes ?? null },
        create: {
          programTemplateId: template.id,
          dayNumber,
          title: payload.title,
          dayType: payload.dayType,
          notes: payload.notes ?? null,
        },
      });
      res.json({ day });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid day payload", issues: error.issues });
        return;
      }
      console.error("Failed to upsert day", error);
      res.status(500).json({ message: "Failed to upsert day" });
    }
  },
);

adminTemplatesRouter.delete(
  "/program-templates/:code/days/:dayNumber",
  async (req: Request, res: Response) => {
    try {
      const code = getStringParam(req.params.code);
      const dayNumber = Number(req.params.dayNumber);
      if (!code) { res.status(400).json({ message: "Code required" }); return; }
      if (!Number.isInteger(dayNumber) || dayNumber <= 0) { res.status(400).json({ message: "Invalid day number" }); return; }

      const template = await prisma.programTemplate.findUnique({ where: { code }, select: { id: true } });
      if (!template) { res.status(404).json({ message: "Template not found" }); return; }

      await prisma.programDayTemplate.deleteMany({
        where: { programTemplateId: template.id, dayNumber },
      });
      res.status(204).end();
    } catch (error) {
      console.error("Failed to delete day", error);
      res.status(500).json({ message: "Failed to delete day" });
    }
  },
);
