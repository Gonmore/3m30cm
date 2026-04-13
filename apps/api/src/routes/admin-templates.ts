import { DayType, Role, SeriesProtocol } from "@prisma/client";
import { type Request, type Response, Router } from "express";
import { z } from "zod";

import { prisma } from "../config/prisma.js";
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
  cycleLengthDays: z.number().int().min(1).max(365).optional(),
});

const upsertDaySchema = z.object({
  title: z.string().trim().min(1),
  dayType: z.nativeEnum(DayType),
  notes: z.string().trim().nullable().optional(),
});

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
        cycleLengthDays: payload.cycleLengthDays,
        isEditable: true,
      },
      include: { _count: { select: { days: true, personalPrograms: true } } },
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
        ...(payload.cycleLengthDays !== undefined && { cycleLengthDays: payload.cycleLengthDays }),
      },
      include: { _count: { select: { days: true, personalPrograms: true } } },
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
