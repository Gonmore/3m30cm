import { AssignmentStatus, DayType, MediaKind, Prisma, Role, SessionStatus } from "@prisma/client";
import { type Response, Router } from "express";
import multer from "multer";
import { z } from "zod";

import { prisma } from "../config/prisma.js";
import { parseExerciseTaskBlock } from "../lib/exercise-task-import.js";
import { uploadProgramTechniqueMedia, uploadTemplateWelcomeVideo } from "../lib/minio.js";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middleware/auth.js";

type PhaseDbClient = Prisma.TransactionClient | typeof prisma;

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 250 * 1024 * 1024 } });

const createTemplateSchema = z.object({
  name: z.string().trim().min(2),
  code: z.string().trim().min(2).regex(/^[A-Z0-9-]+$/, "Code must be uppercase letters, digits and hyphens").optional(),
  description: z.string().trim().nullable().optional(),
  objective: z.string().trim().nullable().optional(),
  welcomeVideoUrl: z.string().url().nullable().optional(),
  cycleLengthDays: z.number().int().min(1).max(365).default(14),
  isPremium: z.boolean().default(false),
  displayPriceCents: z.number().int().min(0).nullable().optional(),
  currency: z.string().trim().min(3).max(8).default("ARS"),
  usesPhases: z.boolean().default(false),
  coachId: z.string().min(1).optional(),
});

const updateTemplateSchema = z.object({
  name: z.string().trim().min(2).optional(),
  description: z.string().trim().nullable().optional(),
  objective: z.string().trim().nullable().optional(),
  welcomeVideoUrl: z.string().url().nullable().optional(),
  cycleLengthDays: z.number().int().min(1).max(365).optional(),
  isPremium: z.boolean().optional(),
  displayPriceCents: z.number().int().min(0).nullable().optional(),
  currency: z.string().trim().min(3).max(8).optional(),
  usesPhases: z.boolean().optional(),
  coachId: z.string().min(1).nullable().optional(),
});

const createWizardPhaseSchema = z.object({
  name: z.string().trim().min(2),
  durationDays: z.number().int().min(1).max(365),
  masterBlockDays: z.number().int().min(1).max(365),
  notes: z.string().trim().nullable().optional(),
  orderIndex: z.number().int().positive().optional(),
});

const updateWizardPhaseSchema = z.object({
  name: z.string().trim().min(2).optional(),
  durationDays: z.number().int().min(1).max(365).optional(),
  masterBlockDays: z.number().int().min(1).max(365).optional(),
  notes: z.string().trim().nullable().optional(),
  orderIndex: z.number().int().positive().optional(),
}).refine((v) => Object.keys(v).length > 0, { message: "At least one field must be provided" });

const createWizardDaySchema = z.object({
  dayNumber: z.number().int().min(1).max(365),
  title: z.string().trim().nullable().optional(),
  dayType: z.nativeEnum(DayType).default(DayType.OTHER),
  notes: z.string().trim().nullable().optional(),
});

const updateWizardDaySchema = z.object({
  title: z.string().trim().nullable().optional(),
  dayType: z.nativeEnum(DayType).optional(),
  notes: z.string().trim().nullable().optional(),
});

const createWizardTaskSchema = z.object({
  exerciseId: z.string().min(1).nullable().optional(),
  orderIndex: z.number().int().positive().optional(),
  name: z.string().trim().min(1),
  category: z.string().trim().nullable().optional(),
  equipment: z.string().trim().nullable().optional(),
  sets: z.number().int().positive().nullable().optional(),
  repsOrTimeText: z.string().trim().nullable().optional(),
  description: z.string().trim().nullable().optional(),
  requiresWeight: z.boolean().default(false),
  isUnilateral: z.boolean().default(false),
  defaultSeriesProtocol: z.enum(["NONE","STRENGTH_EXPLOSION","PLYOMETRIC_SPEED"]).default("NONE"),
  evolution: z.enum(["WEIGHT","TIME","VELOCITY","HYBRID"]).default("WEIGHT"),
  evolutionGoals: z.array(z.string().trim().min(1)).max(10).default([]),
  zone: z.enum(["LOWER","UPPER","CORE","FULL"]).default("FULL"),
  isBlock: z.boolean().default(false),
  blockItems: z.unknown().nullable().optional(),
  videoUrl: z.string().trim().nullable().optional(),
  notes: z.string().trim().nullable().optional(),
  sourceDayId: z.string().min(1).nullable().optional(),
  sourceTaskId: z.string().min(1).nullable().optional(),
});

const updateWizardTaskSchema = createWizardTaskSchema.partial().refine((v) => Object.keys(v).length > 0, { message: "At least one field must be provided" });

const createVariantSchema = z.object({
  weekNumber: z.number().int().min(1).max(52),
  exerciseId: z.string().nullable().optional(),
  name: z.string().trim().nullable().optional(),
  sets: z.number().int().positive().nullable().optional(),
  repsOrTimeText: z.string().trim().nullable().optional(),
  notes: z.string().trim().nullable().optional(),
});

const updateVariantSchema = z.object({
  exerciseId: z.string().nullable().optional(),
  name: z.string().trim().nullable().optional(),
  sets: z.number().int().positive().nullable().optional(),
  repsOrTimeText: z.string().trim().nullable().optional(),
  notes: z.string().trim().nullable().optional(),
}).refine((v) => Object.keys(v).length > 0, { message: "At least one field must be provided" });

const parseExerciseTaskImportSchema = z.object({
  content: z.string().min(1),
  strict: z.boolean().default(false),
});

const persistExerciseTaskImportSchema = z.object({
  content: z.string().min(1),
  strict: z.boolean().default(true),
  replaceExisting: z.boolean().default(true),
  phaseId: z.string().min(1).optional(),
  phaseName: z.string().trim().min(2).optional(),
  orderIndex: z.number().int().positive().optional(),
  durationDays: z.number().int().positive().max(365),
  masterBlockDays: z.number().int().min(1).max(365),
  notes: z.string().trim().nullable().optional(),
}).superRefine((value, ctx) => {
  if (!value.phaseId && !value.phaseName) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "phaseId or phaseName is required", path: ["phaseName"] });
  }
  if (value.masterBlockDays > value.durationDays) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "masterBlockDays cannot exceed durationDays", path: ["masterBlockDays"] });
  }
});

const templateListSelect = {
  id: true,
  code: true,
  name: true,
  description: true,
  objective: true,
  welcomeVideoUrl: true,
  cycleLengthDays: true,
  isEditable: true,
  isPremium: true,
  displayPriceCents: true,
  currency: true,
  usesPhases: true,
  coachId: true,
  createdAt: true,
  updatedAt: true,
  coach: { select: { id: true, email: true, firstName: true, lastName: true } },
  _count: { select: { days: true, phases: true, personalPrograms: true, programAssignments: true } },
} satisfies Prisma.ProgramTemplateSelect;

function getStringParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
function getQueryParam(value: unknown) {
  return Array.isArray(value) ? (typeof value[0] === "string" ? value[0] : undefined) : typeof value === "string" ? value : undefined;
}
function isSuperAdmin(req: AuthenticatedRequest) {
  return req.auth?.platformRole === Role.SUPERADMIN;
}
function scopeCoachId(req: AuthenticatedRequest) {
  if (isSuperAdmin(req)) return getQueryParam(req.query.coachUserId) ?? getQueryParam(req.query.coachId) ?? null;
  return req.auth?.sub ?? null;
}

async function loadWizardPhases(db: PhaseDbClient, programTemplateId: string) {
  return db.programPhaseTemplate.findMany({
    where: { programTemplateId },
    orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
    include: {
      days: {
        orderBy: [{ dayNumber: "asc" }],
        include: {
          tasks: {
            orderBy: [{ orderIndex: "asc" }],
            include: {
              exercise: { select: { id: true, name: true, slug: true } },
              variants: { orderBy: [{ weekNumber: "asc" }], include: { exercise: { select: { id: true, name: true, slug: true } } } },
            },
          },
        },
      },
    },
  });
}

async function normalizeWizardPhaseOrder(db: PhaseDbClient, programTemplateId: string, orderedIds: string[]) {
  await Promise.all(orderedIds.map((id, index) => db.programPhaseTemplate.update({ where: { id }, data: { orderIndex: index + 1 } })));
  void programTemplateId;
}

async function syncTemplateCycleLengthFromPhases(db: PhaseDbClient, programTemplateId: string) {
  const phases = await db.programPhaseTemplate.findMany({ where: { programTemplateId }, select: { durationDays: true } });
  if (!phases.length) return;
  const cycleLengthDays = phases.reduce((sum, p) => sum + p.durationDays, 0);
  await db.programTemplate.update({ where: { id: programTemplateId }, data: { cycleLengthDays } });
}

async function getAccessibleTemplate(req: AuthenticatedRequest, templateIdOrCode: string, opts?: { includePhases?: boolean }) {
  const coachId = scopeCoachId(req);
  const where: Prisma.ProgramTemplateWhereInput = {
    OR: [{ id: templateIdOrCode }, { code: templateIdOrCode }],
    ...(isSuperAdmin(req) ? {} : { coachId: coachId ?? "__none__" }),
  };
  return prisma.programTemplate.findFirst({
    where,
    include: opts?.includePhases ? { phases: { orderBy: { orderIndex: "asc" } }, coach: { select: { id: true, email: true, firstName: true, lastName: true } } } : { coach: { select: { id: true, email: true, firstName: true, lastName: true } } },
  });
}

async function generateUniqueTemplateCode(base: string) {
  const normalized = base.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "PROGRAM";
  let candidate = normalized;
  let i = 2;
  while (await prisma.programTemplate.findUnique({ where: { code: candidate }, select: { id: true } })) {
    candidate = `${normalized}-${i++}`;
  }
  return candidate;
}

function normalizeExerciseName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}
async function buildExerciseLookupMap(candidateNames: string[]) {
  const exercises = await prisma.exercise.findMany({ select: { id: true, name: true, slug: true } });
  const map = new Map<string, { id: string; name: string }>();
  for (const ex of exercises) {
    map.set(normalizeExerciseName(ex.name), { id: ex.id, name: ex.name });
    map.set(normalizeExerciseName(ex.slug), { id: ex.id, name: ex.name });
  }
  for (const name of candidateNames) {
    const key = normalizeExerciseName(name);
    if (!map.has(key)) {
      const found = exercises.find((ex) => normalizeExerciseName(ex.name) === key);
      if (found) map.set(key, { id: found.id, name: found.name });
    }
  }
  return map;
}
function resolveExerciseMatch(map: Map<string, { id: string; name: string }>, name: string) {
  return map.get(normalizeExerciseName(name)) ?? null;
}

async function getApprovedAssignmentCount(templateIds: string[]) {
  if (!templateIds.length) return new Map<string, number>();
  const rows = await prisma.programAssignment.groupBy({
    by: ["templateId"],
    where: { templateId: { in: templateIds }, status: AssignmentStatus.APPROVED },
    _count: { templateId: true },
  });
  return new Map(rows.map((r) => [r.templateId, r._count.templateId]));
}

function withRevenue<T extends { id: string; displayPriceCents: number | null }>(template: T, counts: Map<string, number>) {
  const approvedAssignmentCount = counts.get(template.id) ?? 0;
  return {
    ...template,
    approvedAssignmentCount,
    expectedRevenueCents: approvedAssignmentCount * (template.displayPriceCents ?? 0),
  };
}

async function resolveTaskOwnership(req: AuthenticatedRequest, templateCode: string, taskId: string) {
  const template = await getAccessibleTemplate(req, templateCode);
  if (!template) return null;
  const task = await prisma.exerciseTaskTemplate.findUnique({
    where: { id: taskId },
    select: { id: true, phaseDayTemplate: { select: { phaseTemplate: { select: { programTemplateId: true } } } } },
  });
  if (!task || task.phaseDayTemplate.phaseTemplate.programTemplateId !== template.id) return null;
  return { template, task };
}
async function resolvePhaseOwnership(req: AuthenticatedRequest, templateCode: string, phaseId: string) {
  const template = await getAccessibleTemplate(req, templateCode);
  if (!template) return null;
  const phase = await prisma.programPhaseTemplate.findUnique({ where: { id: phaseId }, select: { id: true, programTemplateId: true } });
  if (!phase || phase.programTemplateId !== template.id) return null;
  return { template, phase };
}
async function resolveDayOwnership(req: AuthenticatedRequest, templateCode: string, phaseId: string, dayId: string) {
  const owned = await resolvePhaseOwnership(req, templateCode, phaseId);
  if (!owned) return null;
  const day = await prisma.programPhaseDayTemplate.findUnique({ where: { id: dayId }, select: { id: true, phaseTemplateId: true } });
  if (!day || day.phaseTemplateId !== phaseId) return null;
  return { ...owned, day };
}

export const coachTemplatesRouter = Router();
coachTemplatesRouter.use(requireAuth, requireRole([Role.COACH, Role.SUPERADMIN]));

coachTemplatesRouter.get("/program-templates", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const q = getQueryParam(req.query.q);
    const coachId = scopeCoachId(req);
    const isPremium = getQueryParam(req.query.isPremium);
    const where: Prisma.ProgramTemplateWhereInput = {
      ...(isSuperAdmin(req) ? (coachId ? { coachId } : {}) : { coachId: coachId ?? "__none__" }),
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }, { objective: { contains: q, mode: "insensitive" } }] } : {}),
      ...(isPremium === "true" ? { isPremium: true } : isPremium === "false" ? { isPremium: false } : {}),
    };
    const templates = await prisma.programTemplate.findMany({ where, orderBy: { updatedAt: "desc" }, select: templateListSelect });
    const counts = await getApprovedAssignmentCount(templates.map((t) => t.id));
    res.json({ templates: templates.map((t) => withRevenue(t, counts)) });
  } catch (error) {
    console.error("Failed to list coach templates", error);
    res.status(500).json({ message: "Failed to list program templates" });
  }
});

coachTemplatesRouter.post("/program-templates", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const payload = createTemplateSchema.parse(req.body);
    const ownerCoachId = isSuperAdmin(req) ? (payload.coachId ?? req.auth?.sub ?? null) : (req.auth?.sub ?? null);
    if (!ownerCoachId) {
      res.status(400).json({ message: "coachId is required" });
      return;
    }
    if (!isSuperAdmin(req) && payload.coachId && payload.coachId !== req.auth?.sub) {
      res.status(403).json({ message: "Coaches can only create templates for themselves" });
      return;
    }
    const code = payload.code ? payload.code : await generateUniqueTemplateCode(payload.name);
    const template = await prisma.programTemplate.create({
      data: {
        name: payload.name,
        code,
        description: payload.description ?? null,
        objective: payload.objective ?? null,
        welcomeVideoUrl: payload.welcomeVideoUrl ?? null,
        cycleLengthDays: payload.cycleLengthDays,
        isPremium: payload.isPremium,
        displayPriceCents: payload.displayPriceCents ?? null,
        currency: payload.currency || "ARS",
        usesPhases: payload.usesPhases,
        coachId: ownerCoachId,
      },
      select: templateListSelect,
    });
    res.status(201).json({ template: withRevenue(template, new Map()) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: "Invalid template payload", issues: error.issues });
      return;
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      res.status(409).json({ message: "Template code already exists" });
      return;
    }
    console.error("Failed to create coach template", error);
    res.status(500).json({ message: "Failed to create program template" });
  }
});

coachTemplatesRouter.get("/program-templates/:id", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = getStringParam(req.params.id);
    if (!id) { res.status(400).json({ message: "Template id is required" }); return; }
    const template = await getAccessibleTemplate(req, id);
    if (!template) { res.status(404).json({ message: "Program template not found" }); return; }
    const [phases, approvedAssignmentCount, recentAssignments] = await Promise.all([
      loadWizardPhases(prisma, template.id),
      prisma.programAssignment.count({ where: { templateId: template.id, status: AssignmentStatus.APPROVED } }),
      prisma.programAssignment.findMany({
        where: { templateId: template.id },
        orderBy: { assignedAt: "desc" },
        take: 20,
        select: { id: true, status: true, assignedAt: true, approvedAt: true, requestNotes: true, athleteProfile: { select: { id: true, displayName: true, user: { select: { id: true, email: true, firstName: true, lastName: true } } } } },
      }),
    ]);
    res.json({
      template: {
        ...template,
        phases,
        approvedAssignmentCount,
        expectedRevenueCents: approvedAssignmentCount * (template.displayPriceCents ?? 0),
        programAssignments: recentAssignments,
      },
    });
  } catch (error) {
    console.error("Failed to fetch coach template", error);
    res.status(500).json({ message: "Failed to fetch program template" });
  }
});

coachTemplatesRouter.put("/program-templates/:id", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = getStringParam(req.params.id);
    if (!id) { res.status(400).json({ message: "Template id is required" }); return; }
    const payload = updateTemplateSchema.parse(req.body);
    const existing = await getAccessibleTemplate(req, id);
    if (!existing) { res.status(404).json({ message: "Program template not found" }); return; }
    if (!isSuperAdmin(req) && payload.coachId !== undefined) {
      res.status(403).json({ message: "Only SUPERADMIN can reassign template ownership" });
      return;
    }
    const template = await prisma.programTemplate.update({
      where: { id: existing.id },
      data: {
        ...(payload.name !== undefined ? { name: payload.name } : {}),
        ...(payload.description !== undefined ? { description: payload.description } : {}),
        ...(payload.objective !== undefined ? { objective: payload.objective } : {}),
        ...(payload.welcomeVideoUrl !== undefined ? { welcomeVideoUrl: payload.welcomeVideoUrl } : {}),
        ...(payload.cycleLengthDays !== undefined ? { cycleLengthDays: payload.cycleLengthDays } : {}),
        ...(payload.isPremium !== undefined ? { isPremium: payload.isPremium } : {}),
        ...(payload.displayPriceCents !== undefined ? { displayPriceCents: payload.displayPriceCents } : {}),
        ...(payload.currency !== undefined ? { currency: payload.currency } : {}),
        ...(payload.usesPhases !== undefined ? { usesPhases: payload.usesPhases } : {}),
        ...(isSuperAdmin(req) && payload.coachId !== undefined ? { coachId: payload.coachId } : {}),
      },
      select: templateListSelect,
    });
    const counts = await getApprovedAssignmentCount([template.id]);
    res.json({ template: withRevenue(template, counts) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: "Invalid template payload", issues: error.issues });
      return;
    }
    console.error("Failed to update coach template", error);
    res.status(500).json({ message: "Failed to update program template" });
  }
});

coachTemplatesRouter.post("/program-templates/:id/welcome-video", upload.single("video"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = getStringParam(req.params.id);
    if (!id || !req.file) { res.status(400).json({ message: "Template id and video are required" }); return; }
    const template = await getAccessibleTemplate(req, id);
    if (!template) { res.status(404).json({ message: "Program template not found" }); return; }
    const { url } = await uploadTemplateWelcomeVideo({ programTemplateId: template.id, fileName: req.file.originalname, contentType: req.file.mimetype, data: req.file.buffer });
    await prisma.programTemplate.update({ where: { id: template.id }, data: { welcomeVideoUrl: url } });
    res.status(201).json({ welcomeVideoUrl: url });
  } catch (error) {
    console.error("Failed to upload welcome video", error);
    res.status(500).json({ message: "Failed to upload welcome video" });
  }
});

coachTemplatesRouter.get("/program-templates/:id/phases", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = getStringParam(req.params.id);
    if (!id) { res.status(400).json({ message: "Template id is required" }); return; }
    const template = await getAccessibleTemplate(req, id);
    if (!template) { res.status(404).json({ message: "Program template not found" }); return; }
    res.json({ templateCode: template.code, phases: await loadWizardPhases(prisma, template.id) });
  } catch (error) {
    console.error("Failed to list phases", error);
    res.status(500).json({ message: "Failed to list phases" });
  }
});

coachTemplatesRouter.post("/program-templates/:id/phases", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = getStringParam(req.params.id);
    if (!id) { res.status(400).json({ message: "Template id is required" }); return; }
    const payload = createWizardPhaseSchema.parse(req.body);
    const template = await getAccessibleTemplate(req, id);
    if (!template) { res.status(404).json({ message: "Program template not found" }); return; }
    const phases = await prisma.$transaction(async (tx) => {
      const existing = await tx.programPhaseTemplate.findMany({ where: { programTemplateId: template.id }, orderBy: [{ orderIndex: "asc" }], select: { id: true } });
      const created = await tx.programPhaseTemplate.create({ data: { programTemplateId: template.id, name: payload.name, orderIndex: existing.length + 1, durationDays: payload.durationDays, masterBlockDays: payload.masterBlockDays, notes: payload.notes ?? null }, select: { id: true } });
      const desired = payload.orderIndex ? Math.min(Math.max(payload.orderIndex - 1, 0), existing.length) : existing.length;
      const ids = existing.map((p) => p.id); ids.splice(desired, 0, created.id);
      await normalizeWizardPhaseOrder(tx, template.id, ids);
      await syncTemplateCycleLengthFromPhases(tx, template.id);
      await tx.programTemplate.update({ where: { id: template.id }, data: { usesPhases: true } });
      return loadWizardPhases(tx, template.id);
    });
    res.status(201).json({ templateCode: template.code, phases });
  } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ message: "Invalid phase payload", issues: error.issues }); return; }
    console.error("Failed to create phase", error);
    res.status(500).json({ message: "Failed to create phase" });
  }
});

coachTemplatesRouter.put("/program-templates/:id/phases/:phaseId", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = getStringParam(req.params.id);
    const phaseId = getStringParam(req.params.phaseId);
    if (!id || !phaseId) { res.status(400).json({ message: "Template id and phase id are required" }); return; }
    const payload = updateWizardPhaseSchema.parse(req.body);
    const owned = await resolvePhaseOwnership(req, id, phaseId);
    if (!owned) { res.status(404).json({ message: "Phase not found for this template" }); return; }
    const phases = await prisma.$transaction(async (tx) => {
      await tx.programPhaseTemplate.update({ where: { id: phaseId }, data: { ...(payload.name !== undefined ? { name: payload.name } : {}), ...(payload.durationDays !== undefined ? { durationDays: payload.durationDays } : {}), ...(payload.masterBlockDays !== undefined ? { masterBlockDays: payload.masterBlockDays } : {}), ...(payload.notes !== undefined ? { notes: payload.notes } : {}) } });
      if (payload.orderIndex !== undefined) {
        const existing = await tx.programPhaseTemplate.findMany({ where: { programTemplateId: owned.template.id }, orderBy: [{ orderIndex: "asc" }], select: { id: true } });
        const ids = existing.map((p) => p.id).filter((pid) => pid !== phaseId);
        ids.splice(Math.min(Math.max(payload.orderIndex - 1, 0), ids.length), 0, phaseId);
        await normalizeWizardPhaseOrder(tx, owned.template.id, ids);
      }
      await syncTemplateCycleLengthFromPhases(tx, owned.template.id);
      return loadWizardPhases(tx, owned.template.id);
    });
    res.json({ templateCode: owned.template.code, phases });
  } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ message: "Invalid phase payload", issues: error.issues }); return; }
    console.error("Failed to update phase", error);
    res.status(500).json({ message: "Failed to update phase" });
  }
});

coachTemplatesRouter.delete("/program-templates/:id/phases/:phaseId", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = getStringParam(req.params.id);
    const phaseId = getStringParam(req.params.phaseId);
    if (!id || !phaseId) { res.status(400).json({ message: "Template id and phase id are required" }); return; }
    const owned = await resolvePhaseOwnership(req, id, phaseId);
    if (!owned) { res.status(404).json({ message: "Phase not found for this template" }); return; }
    const phases = await prisma.$transaction(async (tx) => {
      await tx.programPhaseTemplate.delete({ where: { id: phaseId } });
      const remaining = await tx.programPhaseTemplate.findMany({ where: { programTemplateId: owned.template.id }, orderBy: [{ orderIndex: "asc" }], select: { id: true } });
      await normalizeWizardPhaseOrder(tx, owned.template.id, remaining.map((p) => p.id));
      await syncTemplateCycleLengthFromPhases(tx, owned.template.id);
      await tx.programTemplate.update({ where: { id: owned.template.id }, data: { usesPhases: remaining.length > 0 } });
      return loadWizardPhases(tx, owned.template.id);
    });
    res.json({ templateCode: owned.template.code, phases });
  } catch (error) {
    console.error("Failed to delete phase", error);
    res.status(500).json({ message: "Failed to delete phase" });
  }
});

coachTemplatesRouter.post("/program-templates/:id/phases/:phaseId/days/link", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = getStringParam(req.params.id); const phaseId = getStringParam(req.params.phaseId);
    if (!id || !phaseId) { res.status(400).json({ message: "Template id and phase id are required" }); return; }
    const payload = z.object({ sourceDayId: z.string().min(1), dayNumber: z.number().int().positive().optional(), title: z.string().trim().nullable().optional() }).parse(req.body);
    const owned = await resolvePhaseOwnership(req, id, phaseId);
    if (!owned) { res.status(404).json({ message: "Phase not found for this template" }); return; }
    const sourceDay = await prisma.programPhaseDayTemplate.findUnique({ where: { id: payload.sourceDayId }, include: { tasks: { orderBy: { orderIndex: "asc" } }, phaseTemplate: { select: { programTemplateId: true } } } });
    if (!sourceDay || sourceDay.phaseTemplate.programTemplateId !== owned.template.id) { res.status(404).json({ message: "Source day not found for this template" }); return; }
    const phases = await prisma.$transaction(async (tx) => {
      const last = await tx.programPhaseDayTemplate.findFirst({ where: { phaseTemplateId: phaseId }, orderBy: { dayNumber: "desc" }, select: { dayNumber: true } });
      const dayNumber = payload.dayNumber ?? (last?.dayNumber ?? 0) + 1;
      const day = await tx.programPhaseDayTemplate.create({ data: { phaseTemplateId: phaseId, dayNumber, title: payload.title ?? sourceDay.title, dayType: sourceDay.dayType, notes: sourceDay.notes } });
      for (const t of sourceDay.tasks) {
        await tx.exerciseTaskTemplate.create({ data: { phaseDayTemplateId: day.id, exerciseId: t.exerciseId, orderIndex: t.orderIndex, name: t.name, category: t.category, equipment: t.equipment, sets: t.sets, repsOrTimeText: t.repsOrTimeText, description: t.description, requiresWeight: t.requiresWeight, isUnilateral: t.isUnilateral, defaultSeriesProtocol: t.defaultSeriesProtocol, evolution: t.evolution, evolutionGoals: t.evolutionGoals, zone: t.zone, isBlock: t.isBlock, blockItems: t.blockItems as never, videoUrl: t.videoUrl, notes: t.notes, sourceDayId: sourceDay.id, sourceTaskId: t.id } });
      }
      await syncTemplateCycleLengthFromPhases(tx, owned.template.id);
      return loadWizardPhases(tx, owned.template.id);
    });
    res.status(201).json({ templateCode: owned.template.code, phases });
  } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ message: "Invalid day link payload", issues: error.issues }); return; }
    console.error("Failed to link day", error);
    res.status(500).json({ message: "Failed to link day" });
  }
});

coachTemplatesRouter.post("/program-templates/:id/phases/:phaseId/days", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = getStringParam(req.params.id);
    const phaseId = getStringParam(req.params.phaseId);
    if (!id || !phaseId) { res.status(400).json({ message: "Template id and phase id are required" }); return; }
    const payload = createWizardDaySchema.parse(req.body);
    const owned = await resolvePhaseOwnership(req, id, phaseId);
    if (!owned) { res.status(404).json({ message: "Phase not found for this template" }); return; }
    await prisma.programPhaseDayTemplate.upsert({
      where: { phaseTemplateId_dayNumber: { phaseTemplateId: phaseId, dayNumber: payload.dayNumber } },
      create: { phaseTemplateId: phaseId, dayNumber: payload.dayNumber, title: payload.title ?? null, dayType: payload.dayType, notes: payload.notes ?? null },
      update: { title: payload.title ?? null, dayType: payload.dayType, notes: payload.notes ?? null },
    });
    res.status(201).json({ templateCode: owned.template.code, phases: await loadWizardPhases(prisma, owned.template.id) });
  } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ message: "Invalid day payload", issues: error.issues }); return; }
    console.error("Failed to create day", error);
    res.status(500).json({ message: "Failed to create day" });
  }
});

coachTemplatesRouter.put("/program-templates/:id/phases/:phaseId/days/:dayId", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = getStringParam(req.params.id); const phaseId = getStringParam(req.params.phaseId); const dayId = getStringParam(req.params.dayId);
    if (!id || !phaseId || !dayId) { res.status(400).json({ message: "Template, phase, and day ids are required" }); return; }
    const payload = updateWizardDaySchema.parse(req.body);
    const owned = await resolveDayOwnership(req, id, phaseId, dayId);
    if (!owned) { res.status(404).json({ message: "Day not found for this template" }); return; }
    await prisma.programPhaseDayTemplate.update({ where: { id: dayId }, data: { ...(payload.title !== undefined ? { title: payload.title } : {}), ...(payload.dayType !== undefined ? { dayType: payload.dayType } : {}), ...(payload.notes !== undefined ? { notes: payload.notes } : {}) } });
    res.json({ templateCode: owned.template.code, phases: await loadWizardPhases(prisma, owned.template.id) });
  } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ message: "Invalid day payload", issues: error.issues }); return; }
    console.error("Failed to update day", error);
    res.status(500).json({ message: "Failed to update day" });
  }
});

coachTemplatesRouter.delete("/program-templates/:id/phases/:phaseId/days/:dayId", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = getStringParam(req.params.id); const phaseId = getStringParam(req.params.phaseId); const dayId = getStringParam(req.params.dayId);
    if (!id || !phaseId || !dayId) { res.status(400).json({ message: "Template, phase, and day ids are required" }); return; }
    const owned = await resolveDayOwnership(req, id, phaseId, dayId);
    if (!owned) { res.status(404).json({ message: "Day not found for this template" }); return; }
    await prisma.programPhaseDayTemplate.delete({ where: { id: dayId } });
    res.json({ templateCode: owned.template.code, phases: await loadWizardPhases(prisma, owned.template.id) });
  } catch (error) {
    console.error("Failed to delete day", error);
    res.status(500).json({ message: "Failed to delete day" });
  }
});

coachTemplatesRouter.post("/program-templates/:id/phases/:phaseId/days/:dayId/tasks/copy", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = getStringParam(req.params.id); const phaseId = getStringParam(req.params.phaseId); const dayId = getStringParam(req.params.dayId);
    if (!id || !phaseId || !dayId) { res.status(400).json({ message: "Template id, phase id and day id are required" }); return; }
    const payload = z.object({ sourceTaskId: z.string().min(1) }).parse(req.body);
    const owned = await resolveDayOwnership(req, id, phaseId, dayId);
    if (!owned) { res.status(404).json({ message: "Day not found for this template" }); return; }
    const source = await prisma.exerciseTaskTemplate.findUnique({ where: { id: payload.sourceTaskId }, include: { phaseDayTemplate: { include: { phaseTemplate: { select: { programTemplateId: true } } } } } });
    if (!source || source.phaseDayTemplate.phaseTemplate.programTemplateId !== owned.template.id) { res.status(404).json({ message: "Source task not found for this template" }); return; }
    const phases = await prisma.$transaction(async (tx) => {
      const last = await tx.exerciseTaskTemplate.findFirst({ where: { phaseDayTemplateId: dayId }, orderBy: { orderIndex: "desc" }, select: { orderIndex: true } });
      await tx.exerciseTaskTemplate.create({ data: { phaseDayTemplateId: dayId, exerciseId: source.exerciseId, orderIndex: (last?.orderIndex ?? 0) + 1, name: source.name, category: source.category, equipment: source.equipment, sets: source.sets, repsOrTimeText: source.repsOrTimeText, description: source.description, requiresWeight: source.requiresWeight, isUnilateral: source.isUnilateral, defaultSeriesProtocol: source.defaultSeriesProtocol, evolution: source.evolution, evolutionGoals: source.evolutionGoals, zone: source.zone, isBlock: source.isBlock, blockItems: source.blockItems as never, videoUrl: source.videoUrl, notes: source.notes, sourceDayId: source.phaseDayTemplateId, sourceTaskId: source.id } });
      return loadWizardPhases(tx, owned.template.id);
    });
    res.status(201).json({ templateCode: owned.template.code, phases });
  } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ message: "Invalid task copy payload", issues: error.issues }); return; }
    console.error("Failed to copy task", error);
    res.status(500).json({ message: "Failed to copy task" });
  }
});

coachTemplatesRouter.post("/program-templates/:id/phases/:phaseId/days/:dayId/tasks", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = getStringParam(req.params.id); const phaseId = getStringParam(req.params.phaseId); const dayId = getStringParam(req.params.dayId);
    if (!id || !phaseId || !dayId) { res.status(400).json({ message: "Template, phase, and day ids are required" }); return; }
    const payload = createWizardTaskSchema.parse(req.body);
    const owned = await resolveDayOwnership(req, id, phaseId, dayId);
    if (!owned) { res.status(404).json({ message: "Day not found for this template" }); return; }
    await prisma.$transaction(async (tx) => {
      const count = await tx.exerciseTaskTemplate.count({ where: { phaseDayTemplateId: dayId } });
      const orderIndex = payload.orderIndex ?? count + 1;
      if (payload.orderIndex) await tx.exerciseTaskTemplate.updateMany({ where: { phaseDayTemplateId: dayId, orderIndex: { gte: orderIndex } }, data: { orderIndex: { increment: 1 } } });
      await tx.exerciseTaskTemplate.create({ data: { phaseDayTemplateId: dayId, exerciseId: payload.exerciseId ?? null, orderIndex, name: payload.name, sets: payload.sets ?? null, repsOrTimeText: payload.repsOrTimeText ?? null, description: payload.description ?? null, requiresWeight: payload.requiresWeight, isUnilateral: payload.isUnilateral, evolution: payload.evolution as never, zone: payload.zone as never, videoUrl: payload.videoUrl ?? null, notes: payload.notes ?? null } });
    });
    res.status(201).json({ templateCode: owned.template.code, phases: await loadWizardPhases(prisma, owned.template.id) });
  } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ message: "Invalid task payload", issues: error.issues }); return; }
    console.error("Failed to create task", error);
    res.status(500).json({ message: "Failed to create task" });
  }
});

coachTemplatesRouter.put("/program-templates/:id/phases/:phaseId/days/:dayId/tasks/:taskId", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = getStringParam(req.params.id); const phaseId = getStringParam(req.params.phaseId); const dayId = getStringParam(req.params.dayId); const taskId = getStringParam(req.params.taskId);
    if (!id || !phaseId || !dayId || !taskId) { res.status(400).json({ message: "Template, phase, day, and task ids are required" }); return; }
    const payload = updateWizardTaskSchema.parse(req.body);
    const owned = await resolveDayOwnership(req, id, phaseId, dayId);
    if (!owned) { res.status(404).json({ message: "Day not found for this template" }); return; }
    const task = await prisma.exerciseTaskTemplate.findUnique({ where: { id: taskId }, select: { id: true, phaseDayTemplateId: true } });
    if (!task || task.phaseDayTemplateId !== dayId) { res.status(404).json({ message: "Task not found for this day" }); return; }
    await prisma.exerciseTaskTemplate.update({ where: { id: taskId }, data: { ...(payload.exerciseId !== undefined ? { exerciseId: payload.exerciseId } : {}), ...(payload.orderIndex !== undefined ? { orderIndex: payload.orderIndex } : {}), ...(payload.name !== undefined ? { name: payload.name } : {}), ...(payload.category !== undefined ? { category: payload.category } : {}), ...(payload.equipment !== undefined ? { equipment: payload.equipment } : {}), ...(payload.sets !== undefined ? { sets: payload.sets } : {}), ...(payload.repsOrTimeText !== undefined ? { repsOrTimeText: payload.repsOrTimeText } : {}), ...(payload.description !== undefined ? { description: payload.description } : {}), ...(payload.requiresWeight !== undefined ? { requiresWeight: payload.requiresWeight } : {}), ...(payload.isUnilateral !== undefined ? { isUnilateral: payload.isUnilateral } : {}), ...(payload.defaultSeriesProtocol !== undefined ? { defaultSeriesProtocol: payload.defaultSeriesProtocol as never } : {}), ...(payload.evolution !== undefined ? { evolution: payload.evolution as never } : {}), ...(payload.evolutionGoals !== undefined ? { evolutionGoals: payload.evolutionGoals } : {}), ...(payload.zone !== undefined ? { zone: payload.zone as never } : {}), ...(payload.isBlock !== undefined ? { isBlock: payload.isBlock } : {}), ...(payload.blockItems !== undefined ? { blockItems: payload.blockItems as never } : {}), ...(payload.videoUrl !== undefined ? { videoUrl: payload.videoUrl } : {}), ...(payload.notes !== undefined ? { notes: payload.notes } : {}), ...(payload.sourceDayId !== undefined ? { sourceDayId: payload.sourceDayId } : {}), ...(payload.sourceTaskId !== undefined ? { sourceTaskId: payload.sourceTaskId } : {}) } });
    res.json({ templateCode: owned.template.code, phases: await loadWizardPhases(prisma, owned.template.id) });
  } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ message: "Invalid task payload", issues: error.issues }); return; }
    console.error("Failed to update task", error);
    res.status(500).json({ message: "Failed to update task" });
  }
});

coachTemplatesRouter.delete("/program-templates/:id/phases/:phaseId/days/:dayId/tasks/:taskId", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = getStringParam(req.params.id); const phaseId = getStringParam(req.params.phaseId); const dayId = getStringParam(req.params.dayId); const taskId = getStringParam(req.params.taskId);
    if (!id || !phaseId || !dayId || !taskId) { res.status(400).json({ message: "Template, phase, day, and task ids are required" }); return; }
    const owned = await resolveDayOwnership(req, id, phaseId, dayId);
    if (!owned) { res.status(404).json({ message: "Day not found for this template" }); return; }
    await prisma.$transaction(async (tx) => {
      const task = await tx.exerciseTaskTemplate.findUnique({ where: { id: taskId }, select: { phaseDayTemplateId: true, orderIndex: true } });
      if (!task || task.phaseDayTemplateId !== dayId) throw new Error("TASK_NOT_FOUND");
      await tx.exerciseTaskTemplate.delete({ where: { id: taskId } });
      await tx.exerciseTaskTemplate.updateMany({ where: { phaseDayTemplateId: dayId, orderIndex: { gt: task.orderIndex } }, data: { orderIndex: { decrement: 1 } } });
    });
    res.json({ templateCode: owned.template.code, phases: await loadWizardPhases(prisma, owned.template.id) });
  } catch (error) {
    if (error instanceof Error && error.message === "TASK_NOT_FOUND") { res.status(404).json({ message: "Task not found for this day" }); return; }
    console.error("Failed to delete task", error);
    res.status(500).json({ message: "Failed to delete task" });
  }
});

coachTemplatesRouter.post("/program-templates/:id/tasks/:taskId/variants", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = getStringParam(req.params.id); const taskId = getStringParam(req.params.taskId);
    if (!id || !taskId) { res.status(400).json({ message: "Template id and task id are required" }); return; }
    const payload = createVariantSchema.parse(req.body);
    const ownership = await resolveTaskOwnership(req, id, taskId);
    if (!ownership) { res.status(404).json({ message: "Task not found for this template" }); return; }
    await prisma.exerciseTaskVariant.upsert({
      where: { exerciseTaskId_weekNumber: { exerciseTaskId: taskId, weekNumber: payload.weekNumber } },
      create: { exerciseTaskId: taskId, weekNumber: payload.weekNumber, exerciseId: payload.exerciseId ?? null, name: payload.name ?? null, sets: payload.sets ?? null, repsOrTimeText: payload.repsOrTimeText ?? null, notes: payload.notes ?? null },
      update: { exerciseId: payload.exerciseId ?? null, name: payload.name ?? null, sets: payload.sets ?? null, repsOrTimeText: payload.repsOrTimeText ?? null, notes: payload.notes ?? null },
    });
    res.status(201).json({ templateCode: ownership.template.code, phases: await loadWizardPhases(prisma, ownership.template.id) });
  } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ message: "Invalid variant payload", issues: error.issues }); return; }
    console.error("Failed to create variant", error);
    res.status(500).json({ message: "Failed to create variant" });
  }
});

coachTemplatesRouter.put("/program-templates/:id/tasks/:taskId/variants/:variantId", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = getStringParam(req.params.id); const taskId = getStringParam(req.params.taskId); const variantId = getStringParam(req.params.variantId);
    if (!id || !taskId || !variantId) { res.status(400).json({ message: "Template, task, and variant ids are required" }); return; }
    const payload = updateVariantSchema.parse(req.body);
    const ownership = await resolveTaskOwnership(req, id, taskId);
    if (!ownership) { res.status(404).json({ message: "Task not found for this template" }); return; }
    const variant = await prisma.exerciseTaskVariant.findUnique({ where: { id: variantId }, select: { exerciseTaskId: true } });
    if (!variant || variant.exerciseTaskId !== taskId) { res.status(404).json({ message: "Variant not found for this task" }); return; }
    await prisma.exerciseTaskVariant.update({ where: { id: variantId }, data: { ...(Object.hasOwn(payload, "exerciseId") ? { exerciseId: payload.exerciseId ?? null } : {}), ...(Object.hasOwn(payload, "name") ? { name: payload.name ?? null } : {}), ...(Object.hasOwn(payload, "sets") ? { sets: payload.sets ?? null } : {}), ...(Object.hasOwn(payload, "repsOrTimeText") ? { repsOrTimeText: payload.repsOrTimeText ?? null } : {}), ...(Object.hasOwn(payload, "notes") ? { notes: payload.notes ?? null } : {}) } });
    res.json({ templateCode: ownership.template.code, phases: await loadWizardPhases(prisma, ownership.template.id) });
  } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ message: "Invalid variant payload", issues: error.issues }); return; }
    console.error("Failed to update variant", error);
    res.status(500).json({ message: "Failed to update variant" });
  }
});

coachTemplatesRouter.delete("/program-templates/:id/tasks/:taskId/variants/:variantId", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = getStringParam(req.params.id); const taskId = getStringParam(req.params.taskId); const variantId = getStringParam(req.params.variantId);
    if (!id || !taskId || !variantId) { res.status(400).json({ message: "Template, task, and variant ids are required" }); return; }
    const ownership = await resolveTaskOwnership(req, id, taskId);
    if (!ownership) { res.status(404).json({ message: "Task not found for this template" }); return; }
    const variant = await prisma.exerciseTaskVariant.findUnique({ where: { id: variantId }, select: { exerciseTaskId: true } });
    if (!variant || variant.exerciseTaskId !== taskId) { res.status(404).json({ message: "Variant not found for this task" }); return; }
    await prisma.exerciseTaskVariant.delete({ where: { id: variantId } });
    res.json({ templateCode: ownership.template.code, phases: await loadWizardPhases(prisma, ownership.template.id) });
  } catch (error) {
    console.error("Failed to delete variant", error);
    res.status(500).json({ message: "Failed to delete variant" });
  }
});

coachTemplatesRouter.post("/program-templates/:id/exercise-tasks/parse", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = getStringParam(req.params.id);
    if (!id) { res.status(400).json({ message: "Template id is required" }); return; }
    const payload = parseExerciseTaskImportSchema.parse(req.body);
    const template = await getAccessibleTemplate(req, id);
    if (!template) { res.status(404).json({ message: "Program template not found" }); return; }
    const parseResult = parseExerciseTaskBlock(payload.content);
    const candidateNames = Array.from(new Set(parseResult.tasks.map((t) => t.name.trim()).filter(Boolean)));
    const exerciseByName = await buildExerciseLookupMap(candidateNames);
    const mapped = parseResult.tasks.map((task) => {
      const matched = resolveExerciseMatch(exerciseByName, task.name);
      return { rowNumber: task.rowNumber, day: task.day, exerciseId: matched?.id ?? null, name: task.name, sets: task.sets, repsOrTimeText: task.repsOrTimeText, description: task.description, requiresWeight: task.requiresWeight, isUnilateral: task.isUnilateral, evolution: task.evolution, zone: task.zone, videoUrl: task.videoUrl };
    });
    const unresolved = mapped.filter((i) => !i.exerciseId).map((i) => ({ rowNumber: i.rowNumber, name: i.name }));
    if (payload.strict && unresolved.length) { res.status(400).json({ message: "Some exercise names did not match the exercise catalog.", unresolved, issues: parseResult.issues, warnings: parseResult.warnings }); return; }
    res.json({ templateCode: template.code, delimiter: parseResult.delimiter, issues: parseResult.issues, warnings: parseResult.warnings, unresolved, mapped });
  } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ message: "Invalid import payload", issues: error.issues }); return; }
    console.error("Failed to parse import", error);
    res.status(500).json({ message: "Failed to parse exercise-task import" });
  }
});

coachTemplatesRouter.post("/program-templates/:id/phases/import", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = getStringParam(req.params.id);
    if (!id) { res.status(400).json({ message: "Template id is required" }); return; }
    const payload = persistExerciseTaskImportSchema.parse(req.body);
    const template = await getAccessibleTemplate(req, id);
    if (!template) { res.status(404).json({ message: "Program template not found" }); return; }
    const parseResult = parseExerciseTaskBlock(payload.content);
    if (parseResult.issues.length) { res.status(400).json({ message: "Import content has validation issues.", issues: parseResult.issues, warnings: parseResult.warnings }); return; }
    const candidateNames = Array.from(new Set(parseResult.tasks.map((t) => t.name.trim()).filter(Boolean)));
    const exerciseByName = await buildExerciseLookupMap(candidateNames);
    const mapped = parseResult.tasks.map((task) => ({ ...task, exerciseId: resolveExerciseMatch(exerciseByName, task.name)?.id ?? null }));
    const unresolved = mapped.filter((i) => !i.exerciseId).map((i) => ({ rowNumber: i.rowNumber, name: i.name }));
    if (payload.strict && unresolved.length) { res.status(400).json({ message: "Some exercise names did not match the exercise catalog.", unresolved, warnings: parseResult.warnings }); return; }
    const groupedByDay = new Map<number, typeof mapped>();
    for (const item of mapped) { const b = groupedByDay.get(item.day) ?? []; b.push(item); groupedByDay.set(item.day, b); }
    const dayNumbers = Array.from(groupedByDay.keys()).sort((a, b) => a - b);
    const phase = await prisma.$transaction(async (tx) => {
      let phase: { id: string };
      if (payload.phaseId) {
        const existing = await tx.programPhaseTemplate.findUnique({ where: { id: payload.phaseId }, select: { id: true, programTemplateId: true } });
        if (!existing || existing.programTemplateId !== template.id) throw new Error("PHASE_NOT_FOUND");
        phase = await tx.programPhaseTemplate.update({ where: { id: existing.id }, data: { ...(payload.phaseName ? { name: payload.phaseName } : {}), durationDays: payload.durationDays, masterBlockDays: payload.masterBlockDays, notes: payload.notes ?? null }, select: { id: true } });
      } else {
        const max = await tx.programPhaseTemplate.findFirst({ where: { programTemplateId: template.id }, orderBy: { orderIndex: "desc" }, select: { orderIndex: true } });
        phase = await tx.programPhaseTemplate.create({ data: { programTemplateId: template.id, name: payload.phaseName ?? `Phase ${(max?.orderIndex ?? 0) + 1}`, orderIndex: payload.orderIndex ?? (max?.orderIndex ?? 0) + 1, durationDays: payload.durationDays, masterBlockDays: payload.masterBlockDays, notes: payload.notes ?? null }, select: { id: true } });
      }
      if (payload.replaceExisting) await tx.programPhaseDayTemplate.deleteMany({ where: { phaseTemplateId: phase.id } });
      for (const dayNumber of dayNumbers) {
        const items = groupedByDay.get(dayNumber) ?? [];
        const day = await tx.programPhaseDayTemplate.upsert({ where: { phaseTemplateId_dayNumber: { phaseTemplateId: phase.id, dayNumber } }, create: { phaseTemplateId: phase.id, dayNumber, dayType: DayType.OTHER }, update: {}, select: { id: true } });
        if (!payload.replaceExisting) await tx.exerciseTaskTemplate.deleteMany({ where: { phaseDayTemplateId: day.id } });
        for (let i = 0; i < items.length; i++) {
          const t = items[i]!;
          await tx.exerciseTaskTemplate.create({ data: { phaseDayTemplateId: day.id, exerciseId: t.exerciseId, orderIndex: i + 1, name: t.name, sets: t.sets, repsOrTimeText: t.repsOrTimeText, description: t.description, requiresWeight: t.requiresWeight, isUnilateral: t.isUnilateral, evolution: t.evolution as never, zone: t.zone as never, videoUrl: t.videoUrl } });
          if (t.videoUrl && t.exerciseId) {
            const exists = await tx.exerciseMediaAsset.findFirst({ where: { exerciseId: t.exerciseId, url: t.videoUrl } });
            if (!exists) await tx.exerciseMediaAsset.create({ data: { exerciseId: t.exerciseId, kind: MediaKind.VIDEO, bucket: "external", objectKey: "", url: t.videoUrl, isPrimary: true } });
          }
        }
      }
      await syncTemplateCycleLengthFromPhases(tx, template.id);
      await tx.programTemplate.update({ where: { id: template.id }, data: { usesPhases: true } });
      return tx.programPhaseTemplate.findUnique({ where: { id: phase.id }, include: { days: { orderBy: { dayNumber: "asc" }, include: { tasks: { orderBy: { orderIndex: "asc" }, include: { exercise: { select: { id: true, name: true, slug: true } } } } } } } });
    });
    res.status(201).json({ templateCode: template.code, warnings: parseResult.warnings, phase });
  } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ message: "Invalid import payload", issues: error.issues }); return; }
    if (error instanceof Error && error.message === "PHASE_NOT_FOUND") { res.status(404).json({ message: "Phase not found for this template" }); return; }
    console.error("Failed to import phase", error);
    res.status(500).json({ message: "Failed to persist wizard phase import" });
  }
});

coachTemplatesRouter.post("/program-templates/:id/tasks/:taskId/media", upload.single("file"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = getStringParam(req.params.id); const taskId = getStringParam(req.params.taskId);
    if (!id || !taskId || !req.file) { res.status(400).json({ message: "Template id, task id, and file are required" }); return; }
    const ownership = await resolveTaskOwnership(req, id, taskId);
    if (!ownership) { res.status(404).json({ message: "Task not found for this template" }); return; }
    const { url } = await uploadProgramTechniqueMedia({ programTemplateId: ownership.template.id, fileName: req.file.originalname, contentType: req.file.mimetype, data: req.file.buffer });
    await prisma.exerciseTaskTemplate.update({ where: { id: taskId }, data: { videoUrl: url } });
    res.status(201).json({ url, templateCode: ownership.template.code, phases: await loadWizardPhases(prisma, ownership.template.id) });
  } catch (error) {
    console.error("Failed to upload task media", error);
    res.status(500).json({ message: "Failed to upload task media" });
  }
});

coachTemplatesRouter.get("/exercises", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const q = (getQueryParam(req.query.q) ?? "").trim();
    const exercises = await prisma.exercise.findMany({
      ...(q ? { where: { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { slug: { contains: q, mode: "insensitive" as const } }, { category: { contains: q, mode: "insensitive" as const } }] } } : {}),
      orderBy: { name: "asc" },
      take: 50,
      select: { id: true, slug: true, name: true, category: true, description: true, equipment: true, requiresLoad: true, perLeg: true, evolution: true, zone: true, instructions: { select: { id: true, locale: true, summary: true } }, mediaAssets: { select: { id: true, kind: true, url: true, title: true, isPrimary: true }, orderBy: [{ isPrimary: "desc" }] } },
    });
    res.json({ exercises });
  } catch (error) {
    console.error("Failed to search exercises", error);
    res.status(500).json({ message: "Failed to search exercises" });
  }
});
