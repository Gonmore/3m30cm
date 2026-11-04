import {
  AssignmentStatus,
  ProgramStatus,
  Role,
  SessionStatus,
  type Prisma,
} from "@prisma/client";
import { type Response, Router } from "express";
import { z } from "zod";

import { prisma } from "../config/prisma.js";
import {
  atLocalMidday,
  fetchTemplateForGeneration,
  generatePersonalProgram,
  parseAthleteProgramPreferences,
} from "../lib/athlete-programs.js";
import { applyCompetitionAdjustments } from "../lib/schedule-adjustments.js";
import { deduceSeasonPhase } from "../lib/season-deduction.js";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middleware/auth.js";

const coachUserSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
} satisfies Prisma.UserSelect;

function getQueryParam(value: unknown) {
  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0] : undefined;
  }

  return typeof value === "string" ? value : undefined;
}

function resolveCoachId(req: AuthenticatedRequest) {
  if (req.auth?.platformRole === Role.SUPERADMIN) {
    return getQueryParam(req.query.coachUserId) ?? req.auth.sub;
  }

  return req.auth?.sub;
}

function getStringParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

export const coachRouter = Router();

coachRouter.use(requireAuth, requireRole([Role.COACH, Role.SUPERADMIN]));

coachRouter.get("/dashboard", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const coachId = resolveCoachId(req);

    if (!coachId) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const coach = await prisma.user.findUnique({
      where: { id: coachId },
      select: {
        ...coachUserSelect,
        memberships: {
          select: {
            id: true,
            role: true,
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
    });

    if (!coach) {
      res.status(404).json({ message: "Coach not found" });
      return;
    }

    const assignedAthletes = await prisma.athleteProfile.findMany({
      where: {
        coachAssignments: {
          some: {
            coachId,
          },
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
      include: {
        user: {
          select: coachUserSelect,
        },
        team: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        personalPrograms: {
          orderBy: {
            startDate: "desc",
          },
          take: 1,
          include: {
            sessions: {
              orderBy: {
                scheduledDate: "asc",
              },
              take: 3,
              select: {
                id: true,
                title: true,
                dayType: true,
                status: true,
                scheduledDate: true,
              },
            },
          },
        },
        sessionLogs: {
          orderBy: {
            createdAt: "desc",
          },
          take: 3,
          include: {
            scheduledSession: {
              select: {
                id: true,
                title: true,
                dayType: true,
                status: true,
                scheduledDate: true,
              },
            },
          },
        },
      },
    });

    res.json({
      coach,
      metrics: {
        athletes: assignedAthletes.length,
        activePrograms: assignedAthletes.filter((athlete) => athlete.personalPrograms.length > 0).length,
        recentLogs: assignedAthletes.reduce((total, athlete) => total + athlete.sessionLogs.length, 0),
      },
      athletes: assignedAthletes,
    });
  } catch (error) {
    console.error("Failed to fetch coach dashboard", error);
    res.status(500).json({ message: "Failed to fetch coach dashboard" });
  }
});

coachRouter.get("/sessions/:sessionId", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const coachId = resolveCoachId(req);
    const sessionId = Array.isArray(req.params.sessionId) ? req.params.sessionId[0] : req.params.sessionId;

    if (!coachId) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    if (!sessionId) {
      res.status(400).json({ message: "Session id is required" });
      return;
    }

    const session = await prisma.scheduledSession.findFirst({
      where: {
        id: sessionId,
        personalProgram: {
          athleteProfile: {
            coachAssignments: {
              some: {
                coachId,
              },
            },
          },
        },
      },
      include: {
        personalProgram: {
          include: {
            athleteProfile: {
              include: {
                user: {
                  select: coachUserSelect,
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
        },
      },
    });

    if (!session) {
      res.status(404).json({ message: "Session not found" });
      return;
    }

    res.json({ session });
  } catch (error) {
    console.error("Failed to fetch coach session detail", error);
    res.status(500).json({ message: "Failed to fetch coach session detail" });
  }
});

// ── Program templates ────────────────────────────────────────────────────────

coachRouter.get("/programs", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const coachId = resolveCoachId(req);

    if (!coachId) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const templates = await prisma.programTemplate.findMany({
      where: { coachId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        cycleLengthDays: true,
        isPremium: true,
        _count: {
          select: {
            programAssignments: {
              where: { status: { in: [AssignmentStatus.PENDING, AssignmentStatus.APPROVED] } },
            },
          },
        },
      },
    });

    res.json({ templates });
  } catch (error) {
    console.error("Failed to fetch coach programs", error);
    res.status(500).json({ message: "Failed to fetch coach programs" });
  }
});

// ── Assignment / request management ───────────────────────────────────────────

coachRouter.get("/programs/:templateId/requests", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const coachId = resolveCoachId(req);
    const templateId = getStringParam(req.params.templateId);

    if (!coachId) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    if (!templateId) {
      res.status(400).json({ message: "Template id is required" });
      return;
    }

    const template = await prisma.programTemplate.findUnique({
      where: { id: templateId },
      select: { id: true, name: true, code: true, coachId: true },
    });

    if (!template || template.coachId !== coachId) {
      res.status(404).json({ message: "Program template not found" });
      return;
    }

    const assignments = await prisma.programAssignment.findMany({
      where: { templateId, status: AssignmentStatus.PENDING },
      orderBy: { assignedAt: "asc" },
      include: {
        athleteProfile: {
          include: {
            user: {
              select: coachUserSelect,
            },
          },
        },
      },
    });

    res.json({ template, assignments });
  } catch (error) {
    console.error("Failed to fetch template requests", error);
    res.status(500).json({ message: "Failed to fetch template requests" });
  }
});

const assignmentDecisionSchema = z.object({
  startDate: z.string().optional(),
  notes: z.string().optional(),
  includePreparationPhase: z.boolean().optional(),
});

coachRouter.post("/assignments/:assignmentId/approve", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const coachId = resolveCoachId(req);
    const assignmentId = getStringParam(req.params.assignmentId);
    const payload = assignmentDecisionSchema.parse(req.body);

    if (!coachId) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    if (!assignmentId) {
      res.status(400).json({ message: "Assignment id is required" });
      return;
    }

    const assignment = await prisma.programAssignment.findUnique({
      where: { id: assignmentId },
      include: {
        template: {
          select: { id: true, name: true, code: true },
        },
        athleteProfile: {
          select: {
            id: true,
            displayName: true,
            sport: true,
            trainsSport: true,
            seasonPhase: true,
            weeklyAvailability: true,
            sportTrainingDays: true,
            programPreferences: true,
            exerciseExclusions: true,
            weeklyGameCount: true,
            teamTrainingIntensity: true,
            user: {
              select: {
                email: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    if (!assignment) {
      res.status(404).json({ message: "Assignment not found" });
      return;
    }

    if (assignment.coachId !== coachId) {
      res.status(403).json({ message: "You do not have permission to manage this assignment" });
      return;
    }

    if (assignment.status !== AssignmentStatus.PENDING) {
      res.status(409).json({
        message: `Assignment is already ${assignment.status.toLowerCase()}`,
        status: assignment.status,
      });
      return;
    }

    const template = await fetchTemplateForGeneration(assignment.templateId);

    if (!template) {
      res.status(404).json({ message: "Program template not found or has no days" });
      return;
    }

    const startDate = payload.startDate ? atLocalMidday(payload.startDate) : new Date();
    const athleteProfile = assignment.athleteProfile;
    const programPreferences = parseAthleteProgramPreferences(athleteProfile.programPreferences);
    const phase = athleteProfile.seasonPhase ?? deduceSeasonPhase(athleteProfile.weeklyGameCount, athleteProfile.teamTrainingIntensity);

    // Check the athlete doesn't already have an active program
    const existingActiveProgram = await prisma.personalProgram.findFirst({
      where: {
        athleteProfileId: athleteProfile.id,
        status: ProgramStatus.ACTIVE,
      },
      select: { id: true },
    });

    if (existingActiveProgram) {
      res.status(409).json({
        message: "El atleta ya tiene un programa activo. Archiva el programa actual antes de aprobar una nueva asignación.",
      });
      return;
    }

    const program = await prisma.$transaction(async (transaction) => {
      const result = await generatePersonalProgram({
        transaction,
        athleteProfile,
        template,
        startDate,
        phase,
        notes: payload.notes,
        includePreparationPhase: payload.includePreparationPhase ?? !programPreferences.skipPhase1,
      });

      await transaction.programAssignment.update({
        where: { id: assignmentId },
        data: {
          status: AssignmentStatus.APPROVED,
          approvedAt: new Date(),
        },
      });

      return result;
    });

    if (!program) {
      res.status(500).json({ message: "Failed to create personal program" });
      return;
    }

    // Apply competition-aware post-processing
    await prisma.$transaction(async (tx) => {
      await applyCompetitionAdjustments(
        tx,
        program.id,
        athleteProfile.weeklyGameCount,
        athleteProfile.teamTrainingIntensity,
        phase,
      );
    });

    const fullProgram = await prisma.personalProgram.findUnique({
      where: { id: program.id },
      include: {
        athleteProfile: {
          include: {
            user: {
              select: coachUserSelect,
            },
          },
        },
        template: {
          select: { id: true, code: true, name: true },
        },
        sessions: {
          select: { id: true, title: true, dayType: true, status: true, scheduledDate: true },
        },
      },
    });

    res.json({ assignment: { ...assignment, status: AssignmentStatus.APPROVED }, program: fullProgram });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: "Invalid request payload", issues: error.issues });
      return;
    }

    if (error instanceof Error && error.message === "Invalid start date") {
      res.status(400).json({ message: error.message });
      return;
    }

    console.error("Failed to approve assignment", error);
    res.status(500).json({ message: "Failed to approve assignment" });
  }
});

const rejectionSchema = z.object({
  notes: z.string().min(1),
});

coachRouter.post("/assignments/:assignmentId/reject", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const coachId = resolveCoachId(req);
    const assignmentId = getStringParam(req.params.assignmentId);
    const payload = rejectionSchema.parse(req.body);

    if (!coachId) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    if (!assignmentId) {
      res.status(400).json({ message: "Assignment id is required" });
      return;
    }

    const assignment = await prisma.programAssignment.findUnique({
      where: { id: assignmentId },
      select: {
        id: true,
        coachId: true,
        status: true,
        athleteProfileId: true,
      },
    });

    if (!assignment) {
      res.status(404).json({ message: "Assignment not found" });
      return;
    }

    if (assignment.coachId !== coachId) {
      res.status(403).json({ message: "You do not have permission to manage this assignment" });
      return;
    }

    if (assignment.status !== AssignmentStatus.PENDING) {
      res.status(409).json({
        message: `Assignment is already ${assignment.status.toLowerCase()}`,
        status: assignment.status,
      });
      return;
    }

    const updated = await prisma.programAssignment.update({
      where: { id: assignmentId },
      data: {
        status: AssignmentStatus.REJECTED,
        requestNotes: payload.notes,
      },
      include: {
        template: {
          select: { id: true, code: true, name: true },
        },
        athleteProfile: {
          include: {
            user: {
              select: coachUserSelect,
            },
          },
        },
      },
    });

    res.json({ assignment: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: "Invalid request payload", issues: error.issues });
      return;
    }

    console.error("Failed to reject assignment", error);
    res.status(500).json({ message: "Failed to reject assignment" });
  }
});

// ── Athletes managed by this coach ───────────────────────────────────────────

coachRouter.get("/athletes", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const coachId = resolveCoachId(req);

    if (!coachId) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const athletes = await prisma.athleteProfile.findMany({
      where: {
        coachAssignments: {
          some: {
            coachId,
          },
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
      include: {
        user: {
          select: coachUserSelect,
        },
        team: {
          select: { id: true, name: true, slug: true },
        },
        personalPrograms: {
          orderBy: { startDate: "desc" },
          take: 1,
          select: {
            id: true,
            name: true,
            phase: true,
            startDate: true,
            status: true,
          },
        },
        programAssignments: {
          orderBy: { assignedAt: "desc" },
          take: 5,
          select: {
            id: true,
            status: true,
            assignedAt: true,
            template: {
              select: { id: true, code: true, name: true },
            },
          },
        },
      },
    });

    res.json({ athletes });
  } catch (error) {
    console.error("Failed to fetch coach athletes", error);
    res.status(500).json({ message: "Failed to fetch coach athletes" });
  }
});

coachRouter.get("/athletes/:athleteId/progress", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const coachId = resolveCoachId(req);
    const athleteProfileId = getStringParam(req.params.athleteId);

    if (!coachId) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    if (!athleteProfileId) {
      res.status(400).json({ message: "Athlete id is required" });
      return;
    }

    const athleteProfile = await prisma.athleteProfile.findFirst({
      where: {
        id: athleteProfileId,
        coachAssignments: {
          some: {
            coachId,
          },
        },
      },
      include: {
        user: {
          select: coachUserSelect,
        },
        team: {
          select: { id: true, name: true, slug: true },
        },
      },
    });

    if (!athleteProfile) {
      res.status(404).json({ message: "Athlete not found" });
      return;
    }

    const now = new Date();

    const [activeProgram, sessions, recentLogs] = await Promise.all([
      prisma.personalProgram.findFirst({
        where: {
          athleteProfileId: athleteProfile.id,
          status: ProgramStatus.ACTIVE,
        },
        orderBy: { startDate: "desc" },
        select: {
          id: true,
          name: true,
          phase: true,
          startDate: true,
          status: true,
        },
      }),
      prisma.scheduledSession.findMany({
        where: {
          personalProgram: {
            athleteProfileId: athleteProfile.id,
          },
        },
        orderBy: { scheduledDate: "asc" },
        select: {
          id: true,
          title: true,
          dayType: true,
          status: true,
          scheduledDate: true,
          coachNotes: true,
          personalProgram: {
            select: {
              id: true,
              name: true,
              phase: true,
              startDate: true,
            },
          },
        },
      }),
      prisma.sessionLog.findMany({
        where: { athleteProfileId: athleteProfile.id },
        orderBy: { createdAt: "desc" },
        take: 12,
        include: {
          scheduledSession: {
            select: {
              id: true,
              title: true,
              dayType: true,
              status: true,
              scheduledDate: true,
            },
          },
        },
      }),
    ]);

    const activeProgramId = activeProgram?.id ?? null;
    const activeProgramSessions = activeProgramId
      ? sessions.filter((s) => s.personalProgram?.id === activeProgramId)
      : sessions;

    const completedSessions = activeProgramSessions.filter(
      (s) => s.status === SessionStatus.COMPLETED,
    ).length;
    const skippedSessions = activeProgramSessions.filter(
      (s) => s.status === SessionStatus.SKIPPED,
    ).length;
    const rescheduledSessions = activeProgramSessions.filter(
      (s) => s.status === SessionStatus.RESCHEDULED,
    ).length;

    const nowDateStr = now.toISOString().slice(0, 10);
    const upcomingSessions = activeProgramSessions.filter(
      (s) =>
        new Date(s.scheduledDate).toISOString().slice(0, 10) >= nowDateStr &&
        (s.status === SessionStatus.PLANNED || s.status === SessionStatus.RESCHEDULED),
    );

    res.json({
      athlete: athleteProfile,
      activeProgram,
      progress: {
        completedSessions,
        skippedSessions,
        rescheduledSessions,
        totalSessions: activeProgramSessions.length,
        upcomingSessions,
      },
      sessions: activeProgramSessions,
      recentLogs,
    });
  } catch (error) {
    console.error("Failed to fetch athlete progress", error);
    res.status(500).json({ message: "Failed to fetch athlete progress" });
  }
});

// ── Sessions overview ───────────────────────────────────────────────────────

const sessionsQuerySchema = z.object({
  athleteId: z.string().optional(),
  status: z.enum(["PLANNED", "COMPLETED", "SKIPPED", "RESCHEDULED"]).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

coachRouter.get("/sessions", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const coachId = resolveCoachId(req);
    const query = sessionsQuerySchema.parse(req.query);

    if (!coachId) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const whereClause: Prisma.ScheduledSessionWhereInput = {
      personalProgram: {
        athleteProfile: {
          coachAssignments: {
            some: {
              coachId,
            },
          },
        },
      },
    };

    if (query.athleteId) {
      whereClause.personalProgram!.athleteProfile!.id = query.athleteId;
    }

    if (query.status) {
      whereClause.status = query.status as SessionStatus;
    }

    if (query.dateFrom || query.dateTo) {
      whereClause.scheduledDate = {};
      if (query.dateFrom) {
        whereClause.scheduledDate.gte = new Date(query.dateFrom);
      }
      if (query.dateTo) {
        whereClause.scheduledDate.lte = new Date(query.dateTo);
      }
    }

    const sessions = await prisma.scheduledSession.findMany({
      where: whereClause,
      orderBy: { scheduledDate: "desc" },
      select: {
        id: true,
        title: true,
        dayType: true,
        status: true,
        scheduledDate: true,
        coachNotes: true,
        personalProgram: {
          select: {
            id: true,
            name: true,
            phase: true,
            startDate: true,
            athleteProfile: {
              include: {
                user: {
                  select: coachUserSelect,
                },
              },
            },
          },
        },
      },
    });

    res.json({ sessions });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: "Invalid query parameters", issues: error.issues });
      return;
    }

    console.error("Failed to fetch coach sessions", error);
    res.status(500).json({ message: "Failed to fetch coach sessions" });
  }
});

const coachNotesSchema = z.object({
  coachNotes: z.string(),
});

coachRouter.post("/sessions/:sessionId/notes", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const coachId = resolveCoachId(req);
    const sessionId = getStringParam(req.params.sessionId);
    const payload = coachNotesSchema.parse(req.body);

    if (!coachId) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    if (!sessionId) {
      res.status(400).json({ message: "Session id is required" });
      return;
    }

    const session = await prisma.scheduledSession.findFirst({
      where: {
        id: sessionId,
        personalProgram: {
          athleteProfile: {
            coachAssignments: {
              some: {
                coachId,
              },
            },
          },
        },
      },
      select: { id: true },
    });

    if (!session) {
      res.status(404).json({ message: "Session not found" });
      return;
    }

    const updated = await prisma.scheduledSession.update({
      where: { id: sessionId },
      data: { coachNotes: payload.coachNotes },
    });

    res.json({ session: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: "Invalid request payload", issues: error.issues });
      return;
    }

    console.error("Failed to add coach notes", error);
    res.status(500).json({ message: "Failed to add coach notes" });
  }
});