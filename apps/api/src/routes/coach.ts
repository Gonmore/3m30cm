import { Role, type Prisma } from "@prisma/client";
import { type Response, Router } from "express";

import { prisma } from "../config/prisma.js";
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