import { DayType, ProgramStatus, Role, SeasonPhase, SessionStatus, type Prisma } from "@prisma/client";
import { type Request, type Response, Router } from "express";
import { z } from "zod";

import { prisma } from "../config/prisma.js";
import { atLocalMidday, generatePersonalProgram } from "../lib/athlete-programs.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const generationSchema = z.object({
  athleteProfileId: z.string().min(1),
  templateCode: z.string().min(1).default("JUMP-MANUAL-14D"),
  startDate: z.string().date(),
  phase: z.nativeEnum(SeasonPhase).optional(),
  includePreparationPhase: z.boolean().default(true),
  notes: z.string().trim().optional(),
});

const updateSessionSchema = z.object({
  title: z.string().trim().min(2).optional(),
  scheduledDate: z.string().trim().optional(),
  status: z.nativeEnum(SessionStatus).optional(),
  notes: z.string().trim().nullable().optional(),
});

const adminSessionInclude = {
  personalProgram: {
    include: {
      athleteProfile: {
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
          team: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      },
    },
  },
  sessionExercises: {
    orderBy: { orderIndex: "asc" },
    include: {
      exercise: {
        select: {
          id: true,
          name: true,
          category: true,
        },
      },
    },
  },
  logs: {
    orderBy: { createdAt: "desc" },
    include: {
      athleteProfile: {
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.ScheduledSessionInclude;

export const adminProgramsRouter = Router();

adminProgramsRouter.use(requireAuth, requireRole([Role.SUPERADMIN]));

function parseFlexibleDate(value?: string) {
  if (!value) {
    return undefined;
  }

  const normalized = value.length === 10 ? `${value}T12:00:00` : value;
  const parsed = new Date(normalized);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Invalid scheduled date");
  }

  return parsed;
}

adminProgramsRouter.get("/programs", async (_req: Request, res: Response) => {
  try {
    const programs = await prisma.personalProgram.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        athleteProfile: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
            team: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
          },
        },
        template: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        sessions: {
          orderBy: { scheduledDate: "asc" },
          take: 5,
          select: {
            id: true,
            title: true,
            dayType: true,
            status: true,
            scheduledDate: true,
          },
        },
      },
    });

    res.json({ programs });
  } catch (error) {
    console.error("Failed to fetch personal programs", error);
    res.status(500).json({ message: "Failed to fetch personal programs" });
  }
});

adminProgramsRouter.post("/programs/generate", async (req: Request, res: Response) => {
  try {
    const payload = generationSchema.parse(req.body);
    const startDate = atLocalMidday(payload.startDate);

    const [athleteProfile, template] = await Promise.all([
      prisma.athleteProfile.findUnique({
        where: { id: payload.athleteProfileId },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
          team: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      }),
      prisma.programTemplate.findUnique({
        where: { code: payload.templateCode },
        include: {
          days: {
            orderBy: { dayNumber: "asc" },
            include: {
              prescriptions: {
                orderBy: { orderIndex: "asc" },
                include: {
                  exercise: {
                    select: {
                      id: true,
                      defaultSeriesProtocol: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
    ]);

    if (!athleteProfile) {
      res.status(404).json({ message: "Athlete profile not found" });
      return;
    }

    if (!template || template.days.length === 0) {
      res.status(404).json({ message: "Program template not found or empty" });
      return;
    }
    const phase = payload.phase ?? athleteProfile.seasonPhase;

    const generatedProgram = await prisma.$transaction(async (transaction) => {
      return generatePersonalProgram({
        transaction,
        athleteProfile,
        template,
        startDate,
        phase,
        notes: payload.notes,
        includePreparationPhase: payload.includePreparationPhase,
      });
    });

    res.status(201).json({ program: generatedProgram });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: "Invalid generation payload", issues: error.issues });
      return;
    }

    console.error("Failed to generate personal program", error);
    res.status(500).json({ message: "Failed to generate personal program" });
  }
});

adminProgramsRouter.get("/programs/:programId/sessions", async (req: Request, res: Response) => {
  try {
    const programId = Array.isArray(req.params.programId) ? req.params.programId[0] : req.params.programId;

    if (!programId) {
      res.status(400).json({ message: "Program id is required" });
      return;
    }

    const sessions = await prisma.scheduledSession.findMany({
      where: {
        personalProgramId: programId,
      },
      orderBy: {
        scheduledDate: "asc",
      },
      include: adminSessionInclude,
    });

    res.json({ sessions });
  } catch (error) {
    console.error("Failed to fetch program sessions", error);
    res.status(500).json({ message: "Failed to fetch program sessions" });
  }
});

adminProgramsRouter.get("/sessions/:sessionId", async (req: Request, res: Response) => {
  try {
    const sessionId = Array.isArray(req.params.sessionId) ? req.params.sessionId[0] : req.params.sessionId;

    if (!sessionId) {
      res.status(400).json({ message: "Session id is required" });
      return;
    }

    const session = await prisma.scheduledSession.findUnique({
      where: { id: sessionId },
      include: adminSessionInclude,
    });

    if (!session) {
      res.status(404).json({ message: "Session not found" });
      return;
    }

    res.json({ session });
  } catch (error) {
    console.error("Failed to fetch session detail", error);
    res.status(500).json({ message: "Failed to fetch session detail" });
  }
});

adminProgramsRouter.put("/sessions/:sessionId", async (req: Request, res: Response) => {
  try {
    const sessionId = Array.isArray(req.params.sessionId) ? req.params.sessionId[0] : req.params.sessionId;

    if (!sessionId) {
      res.status(400).json({ message: "Session id is required" });
      return;
    }

    const payload = updateSessionSchema.parse(req.body);
    const scheduledDate = parseFlexibleDate(payload.scheduledDate);

    const session = await prisma.scheduledSession.update({
      where: { id: sessionId },
      data: {
        ...(payload.title ? { title: payload.title } : {}),
        ...(scheduledDate ? { scheduledDate } : {}),
        ...(payload.status ? { status: payload.status } : {}),
        ...(payload.notes !== undefined ? { notes: payload.notes } : {}),
      },
      include: adminSessionInclude,
    });

    res.json({ session });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: "Invalid session payload", issues: error.issues });
      return;
    }

    if (error instanceof Error && error.message === "Invalid scheduled date") {
      res.status(400).json({ message: error.message });
      return;
    }

    console.error("Failed to update session", error);
    res.status(500).json({ message: "Failed to update session" });
  }
});