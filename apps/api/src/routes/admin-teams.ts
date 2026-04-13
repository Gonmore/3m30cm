import bcrypt from "bcryptjs";
import { Prisma, Role, SeasonPhase } from "@prisma/client";
import { type Request, type Response, Router } from "express";
import { z } from "zod";

import { prisma } from "../config/prisma.js";
import { buildTrainingDaysJson, buildWeekdaysJson } from "../lib/athlete-programs.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const teamSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/),
  description: z.string().trim().optional(),
});

const memberSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).optional(),
  firstName: z.string().trim().optional(),
  lastName: z.string().trim().optional(),
  role: z.enum([Role.COACH, Role.TEAM_ADMIN] satisfies [Role, ...Role[]]),
});

const athleteSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).optional(),
  firstName: z.string().trim().optional(),
  lastName: z.string().trim().optional(),
  displayName: z.string().trim().optional(),
  sport: z.string().trim().optional(),
  trainsSport: z.boolean().default(false),
  sportTrainingDays: z.array(z.number().int().min(0).max(6)).optional(),
  seasonPhase: z.nativeEnum(SeasonPhase).default(SeasonPhase.OFF_SEASON),
  availableWeekdays: z.array(z.number().int().min(0).max(6)).optional(),
  notes: z.string().trim().optional(),
});

const assignCoachSchema = z.object({
  coachUserId: z.string().min(1),
});

const membershipUserSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
} satisfies Prisma.UserSelect;

const athleteProfileInclude = {
  user: {
    select: membershipUserSelect,
  },
  team: {
    select: {
      id: true,
      name: true,
      slug: true,
    },
  },
  coachAssignments: {
    include: {
      coach: {
        select: membershipUserSelect,
      },
    },
    orderBy: { createdAt: "asc" },
  },
  personalPrograms: {
    select: {
      id: true,
      name: true,
      status: true,
      startDate: true,
    },
    orderBy: { createdAt: "desc" },
  },
} satisfies Prisma.AthleteProfileInclude;

function getStringParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function buildAvailabilityPayload(availableWeekdays?: number[]) {
  return buildWeekdaysJson(availableWeekdays);
}

async function hashPassword(password?: string) {
  if (!password) {
    return undefined;
  }

  return bcrypt.hash(password, 10);
}

async function ensureTeamExists(teamId: string) {
  return prisma.team.findUnique({
    where: { id: teamId },
    select: { id: true },
  });
}

export const adminTeamsRouter = Router();

adminTeamsRouter.use(requireAuth, requireRole([Role.SUPERADMIN]));

adminTeamsRouter.get("/teams", async (_req: Request, res: Response) => {
  try {
    const teams = await prisma.team.findMany({
      orderBy: { name: "asc" },
      include: {
        memberships: {
          orderBy: { createdAt: "asc" },
          include: {
            user: {
              select: membershipUserSelect,
            },
          },
        },
        athletes: {
          orderBy: { createdAt: "asc" },
          include: athleteProfileInclude,
        },
      },
    });

    res.json({ teams });
  } catch (error) {
    console.error("Failed to fetch teams", error);
    res.status(500).json({ message: "Failed to fetch teams" });
  }
});

adminTeamsRouter.get("/athletes", async (_req: Request, res: Response) => {
  try {
    const athletes = await prisma.athleteProfile.findMany({
      orderBy: [{ teamId: "asc" }, { createdAt: "asc" }],
      include: athleteProfileInclude,
    });

    res.json({ athletes });
  } catch (error) {
    console.error("Failed to fetch athletes", error);
    res.status(500).json({ message: "Failed to fetch athletes" });
  }
});

adminTeamsRouter.post("/teams", async (req: Request, res: Response) => {
  try {
    const payload = teamSchema.parse(req.body);

    const team = await prisma.team.create({
      data: {
        name: payload.name,
        slug: payload.slug,
        ...(payload.description ? { description: payload.description } : {}),
      },
    });

    res.status(201).json({ team });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: "Invalid team payload", issues: error.issues });
      return;
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      res.status(409).json({ message: "Team slug already exists" });
      return;
    }

    console.error("Failed to create team", error);
    res.status(500).json({ message: "Failed to create team" });
  }
});

adminTeamsRouter.put("/teams/:teamId", async (req: Request, res: Response) => {
  try {
    const teamId = getStringParam(req.params.teamId);

    if (!teamId) {
      res.status(400).json({ message: "Team id is required" });
      return;
    }

    const payload = teamSchema.parse(req.body);

    const team = await prisma.team.update({
      where: { id: teamId },
      data: {
        name: payload.name,
        slug: payload.slug,
        description: payload.description ?? null,
      },
    });

    res.json({ team });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: "Invalid team payload", issues: error.issues });
      return;
    }

    console.error("Failed to update team", error);
    res.status(500).json({ message: "Failed to update team" });
  }
});

adminTeamsRouter.post("/teams/:teamId/members", async (req: Request, res: Response) => {
  try {
    const teamId = getStringParam(req.params.teamId);

    if (!teamId) {
      res.status(400).json({ message: "Team id is required" });
      return;
    }

    const payload = memberSchema.parse(req.body);
    const passwordHash = await hashPassword(payload.password);
    const team = await ensureTeamExists(teamId);

    if (!team) {
      res.status(404).json({ message: "Team not found" });
      return;
    }

    const user = await prisma.user.upsert({
      where: { email: payload.email.toLowerCase() },
      update: {
        email: payload.email.toLowerCase(),
        ...(payload.firstName ? { firstName: payload.firstName } : {}),
        ...(payload.lastName ? { lastName: payload.lastName } : {}),
        ...(passwordHash ? { passwordHash } : {}),
      },
      create: {
        email: payload.email.toLowerCase(),
        ...(payload.firstName ? { firstName: payload.firstName } : {}),
        ...(payload.lastName ? { lastName: payload.lastName } : {}),
        ...(passwordHash ? { passwordHash } : {}),
      },
    });

    const membership = await prisma.membership.upsert({
      where: {
        userId_teamId: {
          userId: user.id,
          teamId,
        },
      },
      update: {
        role: payload.role,
      },
      create: {
        teamId,
        userId: user.id,
        role: payload.role,
      },
      include: {
        user: {
          select: membershipUserSelect,
        },
      },
    });

    res.status(201).json({ membership });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: "Invalid member payload", issues: error.issues });
      return;
    }

    console.error("Failed to create member", error);
    res.status(500).json({ message: "Failed to create member" });
  }
});

adminTeamsRouter.put("/teams/:teamId/members/:membershipId", async (req: Request, res: Response) => {
  try {
    const teamId = getStringParam(req.params.teamId);
    const membershipId = getStringParam(req.params.membershipId);

    if (!teamId || !membershipId) {
      res.status(400).json({ message: "Team id and membership id are required" });
      return;
    }

    const payload = memberSchema.parse(req.body);
    const passwordHash = await hashPassword(payload.password);
    const existingMembership = await prisma.membership.findUnique({
      where: { id: membershipId },
      select: {
        id: true,
        userId: true,
        teamId: true,
      },
    });

    if (!existingMembership || existingMembership.teamId !== teamId) {
      res.status(404).json({ message: "Membership not found in the selected team" });
      return;
    }

    await prisma.$transaction(async (transaction) => {
      await transaction.user.update({
        where: { id: existingMembership.userId },
        data: {
          email: payload.email.toLowerCase(),
          firstName: payload.firstName ?? null,
          lastName: payload.lastName ?? null,
          ...(passwordHash ? { passwordHash } : {}),
        },
      });

      await transaction.membership.update({
        where: { id: membershipId },
        data: {
          role: payload.role,
        },
      });
    });

    const membership = await prisma.membership.findUnique({
      where: { id: membershipId },
      include: {
        user: {
          select: membershipUserSelect,
        },
      },
    });

    res.json({ membership });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: "Invalid member payload", issues: error.issues });
      return;
    }

    console.error("Failed to update member", error);
    res.status(500).json({ message: "Failed to update member" });
  }
});

adminTeamsRouter.delete("/teams/:teamId/members/:membershipId", async (req: Request, res: Response) => {
  try {
    const teamId = getStringParam(req.params.teamId);
    const membershipId = getStringParam(req.params.membershipId);

    if (!teamId || !membershipId) {
      res.status(400).json({ message: "Team id and membership id are required" });
      return;
    }

    const membership = await prisma.membership.findUnique({
      where: { id: membershipId },
      select: {
        id: true,
        userId: true,
        teamId: true,
        role: true,
      },
    });

    if (!membership || membership.teamId !== teamId) {
      res.status(404).json({ message: "Membership not found in the selected team" });
      return;
    }

    await prisma.$transaction(async (transaction) => {
      if (membership.role === Role.COACH) {
        await transaction.coachAssignment.deleteMany({
          where: {
            coachId: membership.userId,
            athleteProfile: {
              is: {
                teamId,
              },
            },
          },
        });
      }

      await transaction.membership.delete({
        where: { id: membershipId },
      });
    });

    res.status(204).send();
  } catch (error) {
    console.error("Failed to delete membership", error);
    res.status(500).json({ message: "Failed to delete membership" });
  }
});

adminTeamsRouter.post("/teams/:teamId/athletes", async (req: Request, res: Response) => {
  try {
    const teamId = getStringParam(req.params.teamId);

    if (!teamId) {
      res.status(400).json({ message: "Team id is required" });
      return;
    }

    const payload = athleteSchema.parse(req.body);
    const passwordHash = await hashPassword(payload.password);
    const team = await ensureTeamExists(teamId);

    if (!team) {
      res.status(404).json({ message: "Team not found" });
      return;
    }

    const user = await prisma.user.upsert({
      where: { email: payload.email.toLowerCase() },
      update: {
        email: payload.email.toLowerCase(),
        ...(payload.firstName ? { firstName: payload.firstName } : {}),
        ...(payload.lastName ? { lastName: payload.lastName } : {}),
        ...(passwordHash ? { passwordHash } : {}),
      },
      create: {
        email: payload.email.toLowerCase(),
        ...(payload.firstName ? { firstName: payload.firstName } : {}),
        ...(payload.lastName ? { lastName: payload.lastName } : {}),
        ...(passwordHash ? { passwordHash } : {}),
      },
    });

    await prisma.membership.upsert({
      where: {
        userId_teamId: {
          userId: user.id,
          teamId,
        },
      },
      update: {
        role: Role.ATHLETE,
      },
      create: {
        teamId,
        userId: user.id,
        role: Role.ATHLETE,
      },
    });

    const athleteProfile = await prisma.athleteProfile.upsert({
      where: { userId: user.id },
      update: {
        teamId,
        displayName: payload.displayName ?? payload.firstName ?? payload.email,
        sport: payload.sport ?? null,
        trainsSport: payload.trainsSport,
        seasonPhase: payload.seasonPhase,
        weeklyAvailability: buildAvailabilityPayload(payload.availableWeekdays),
        sportTrainingDays: buildTrainingDaysJson(payload.trainsSport ? payload.sportTrainingDays : undefined),
        notes: payload.notes ?? null,
      },
      create: {
        userId: user.id,
        teamId,
        displayName: payload.displayName ?? payload.firstName ?? payload.email,
        ...(payload.sport ? { sport: payload.sport } : {}),
        trainsSport: payload.trainsSport,
        seasonPhase: payload.seasonPhase,
        weeklyAvailability: buildAvailabilityPayload(payload.availableWeekdays),
        sportTrainingDays: buildTrainingDaysJson(payload.trainsSport ? payload.sportTrainingDays : undefined),
        ...(payload.notes ? { notes: payload.notes } : {}),
      },
      include: athleteProfileInclude,
    });

    res.status(201).json({ athleteProfile });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: "Invalid athlete payload", issues: error.issues });
      return;
    }

    console.error("Failed to create athlete", error);
    res.status(500).json({ message: "Failed to create athlete" });
  }
});

adminTeamsRouter.put("/teams/:teamId/athletes/:athleteProfileId", async (req: Request, res: Response) => {
  try {
    const teamId = getStringParam(req.params.teamId);
    const athleteProfileId = getStringParam(req.params.athleteProfileId);

    if (!teamId || !athleteProfileId) {
      res.status(400).json({ message: "Team id and athlete profile id are required" });
      return;
    }

    const payload = athleteSchema.parse(req.body);
    const passwordHash = await hashPassword(payload.password);
    const existingAthlete = await prisma.athleteProfile.findUnique({
      where: { id: athleteProfileId },
      select: {
        id: true,
        teamId: true,
        userId: true,
      },
    });

    if (!existingAthlete || existingAthlete.teamId !== teamId) {
      res.status(404).json({ message: "Athlete not found in the selected team" });
      return;
    }

    await prisma.$transaction(async (transaction) => {
      await transaction.user.update({
        where: { id: existingAthlete.userId },
        data: {
          email: payload.email.toLowerCase(),
          firstName: payload.firstName ?? null,
          lastName: payload.lastName ?? null,
          ...(passwordHash ? { passwordHash } : {}),
        },
      });

      await transaction.athleteProfile.update({
        where: { id: athleteProfileId },
        data: {
          displayName: payload.displayName ?? payload.firstName ?? payload.email,
          sport: payload.sport ?? null,
          trainsSport: payload.trainsSport,
          seasonPhase: payload.seasonPhase,
          weeklyAvailability: buildAvailabilityPayload(payload.availableWeekdays),
          sportTrainingDays: buildTrainingDaysJson(payload.trainsSport ? payload.sportTrainingDays : undefined),
          notes: payload.notes ?? null,
        },
      });
    });

    const athleteProfile = await prisma.athleteProfile.findUnique({
      where: { id: athleteProfileId },
      include: athleteProfileInclude,
    });

    res.json({ athleteProfile });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: "Invalid athlete payload", issues: error.issues });
      return;
    }

    console.error("Failed to update athlete", error);
    res.status(500).json({ message: "Failed to update athlete" });
  }
});

adminTeamsRouter.delete("/teams/:teamId/athletes/:athleteProfileId", async (req: Request, res: Response) => {
  try {
    const teamId = getStringParam(req.params.teamId);
    const athleteProfileId = getStringParam(req.params.athleteProfileId);

    if (!teamId || !athleteProfileId) {
      res.status(400).json({ message: "Team id and athlete profile id are required" });
      return;
    }

    const athlete = await prisma.athleteProfile.findUnique({
      where: { id: athleteProfileId },
      select: {
        id: true,
        teamId: true,
        userId: true,
      },
    });

    if (!athlete || athlete.teamId !== teamId) {
      res.status(404).json({ message: "Athlete not found in the selected team" });
      return;
    }

    await prisma.$transaction(async (transaction) => {
      await transaction.coachAssignment.deleteMany({
        where: {
          athleteProfileId,
        },
      });

      await transaction.membership.deleteMany({
        where: {
          userId: athlete.userId,
          teamId,
          role: Role.ATHLETE,
        },
      });

      await transaction.athleteProfile.update({
        where: { id: athleteProfileId },
        data: {
          teamId: null,
        },
      });
    });

    res.status(204).send();
  } catch (error) {
    console.error("Failed to remove athlete from team", error);
    res.status(500).json({ message: "Failed to remove athlete from team" });
  }
});

adminTeamsRouter.post("/teams/:teamId/athletes/:athleteProfileId/assign-coach", async (req: Request, res: Response) => {
  try {
    const teamId = getStringParam(req.params.teamId);
    const athleteProfileId = getStringParam(req.params.athleteProfileId);

    if (!teamId || !athleteProfileId) {
      res.status(400).json({ message: "Team id and athlete profile id are required" });
      return;
    }

    const payload = assignCoachSchema.parse(req.body);

    const [athlete, coachMembership] = await Promise.all([
      prisma.athleteProfile.findUnique({
        where: { id: athleteProfileId },
        select: { id: true, teamId: true },
      }),
      prisma.membership.findUnique({
        where: {
          userId_teamId: {
            userId: payload.coachUserId,
            teamId,
          },
        },
        select: { role: true },
      }),
    ]);

    if (!athlete || athlete.teamId !== teamId) {
      res.status(404).json({ message: "Athlete not found in the selected team" });
      return;
    }

    if (!coachMembership || coachMembership.role !== Role.COACH) {
      res.status(400).json({ message: "Selected user is not a coach in this team" });
      return;
    }

    const assignment = await prisma.coachAssignment.upsert({
      where: {
        coachId_athleteProfileId: {
          coachId: payload.coachUserId,
          athleteProfileId,
        },
      },
      update: {},
      create: {
        coachId: payload.coachUserId,
        athleteProfileId,
      },
      include: {
        coach: {
          select: membershipUserSelect,
        },
      },
    });

    res.status(201).json({ assignment });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: "Invalid coach assignment payload", issues: error.issues });
      return;
    }

    console.error("Failed to assign coach", error);
    res.status(500).json({ message: "Failed to assign coach" });
  }
});

adminTeamsRouter.delete(
  "/teams/:teamId/athletes/:athleteProfileId/assignments/:assignmentId",
  async (req: Request, res: Response) => {
    try {
      const teamId = getStringParam(req.params.teamId);
      const athleteProfileId = getStringParam(req.params.athleteProfileId);
      const assignmentId = getStringParam(req.params.assignmentId);

      if (!teamId || !athleteProfileId || !assignmentId) {
        res.status(400).json({ message: "Team id, athlete profile id and assignment id are required" });
        return;
      }

      const assignment = await prisma.coachAssignment.findUnique({
        where: { id: assignmentId },
        include: {
          athleteProfile: {
            select: {
              id: true,
              teamId: true,
            },
          },
        },
      });

      if (!assignment || assignment.athleteProfileId !== athleteProfileId || assignment.athleteProfile.teamId !== teamId) {
        res.status(404).json({ message: "Coach assignment not found" });
        return;
      }

      await prisma.coachAssignment.delete({
        where: { id: assignmentId },
      });

      res.status(204).send();
    } catch (error) {
      console.error("Failed to remove coach assignment", error);
      res.status(500).json({ message: "Failed to remove coach assignment" });
    }
  },
);

const exclusionsSchema = z.object({
  exerciseIds: z.array(z.string()).max(200),
});

adminTeamsRouter.put(
  "/teams/:teamId/athletes/:athleteProfileId/exclusions",
  async (req: Request, res: Response) => {
    try {
      const teamId = getStringParam(req.params.teamId);
      const athleteProfileId = getStringParam(req.params.athleteProfileId);

      if (!teamId || !athleteProfileId) {
        res.status(400).json({ message: "Team id and athlete profile id are required" });
        return;
      }

      const payload = exclusionsSchema.parse(req.body);

      const profile = await prisma.athleteProfile.findUnique({
        where: { id: athleteProfileId },
        select: { id: true, teamId: true },
      });

      if (!profile || profile.teamId !== teamId) {
        res.status(404).json({ message: "Athlete not found in this team" });
        return;
      }

      const updated = await prisma.athleteProfile.update({
        where: { id: athleteProfileId },
        data: { exerciseExclusions: payload.exerciseIds },
        select: { id: true, exerciseExclusions: true },
      });

      res.json({ athleteProfile: updated });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid exclusions payload", issues: error.issues });
        return;
      }
      console.error("Failed to update exercise exclusions", error);
      res.status(500).json({ message: "Failed to update exercise exclusions" });
    }
  },
);