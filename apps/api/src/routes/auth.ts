import bcrypt from "bcryptjs";
import { Prisma, SeasonPhase } from "@prisma/client";
import { type Request, type Response, Router } from "express";
import { z } from "zod";

import { prisma } from "../config/prisma.js";
import { buildTrainingDaysJson, buildWeekdaysJson } from "../lib/athlete-programs.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { createAccessToken } from "../lib/auth.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const athleteRegistrationSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
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

export const authRouter = Router();

authRouter.post("/register/athlete", async (req: Request, res: Response) => {
  try {
    const payload = athleteRegistrationSchema.parse(req.body);
    const email = payload.email.toLowerCase();
    const passwordHash = await bcrypt.hash(payload.password, 10);

    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingUser) {
      res.status(409).json({ message: "Ya existe una cuenta con este email" });
      return;
    }

    const user = await prisma.user.create({
      data: {
        email,
        firstName: payload.firstName ?? null,
        lastName: payload.lastName ?? null,
        passwordHash,
      },
      include: {
        memberships: {
          select: {
            role: true,
            teamId: true,
          },
        },
      },
    });

    const athleteProfile = await prisma.athleteProfile.create({
      data: {
        userId: user.id,
        displayName: payload.displayName ?? payload.firstName ?? email,
        sport: payload.sport ?? null,
        trainsSport: payload.trainsSport,
        seasonPhase: payload.seasonPhase,
        weeklyAvailability: buildWeekdaysJson(payload.availableWeekdays),
        sportTrainingDays: buildTrainingDaysJson(payload.trainsSport ? payload.sportTrainingDays : undefined),
        notes: payload.notes ?? null,
      },
      select: {
        id: true,
        displayName: true,
        sport: true,
        trainsSport: true,
        seasonPhase: true,
        weeklyAvailability: true,
        sportTrainingDays: true,
        notes: true,
      },
    });

    const token = createAccessToken({
      sub: user.id,
      email: user.email,
      platformRole: user.platformRole,
      teamRoles: user.memberships.map((membership) => membership.role),
    });

    res.status(201).json({
      accessToken: token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        platformRole: user.platformRole,
        teamRoles: user.memberships.map((membership) => membership.role),
      },
      athleteProfile,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: "Invalid payload", issues: error.issues });
      return;
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      res.status(409).json({ message: "Ya existe una cuenta con este email" });
      return;
    }

    console.error("Athlete registration failed", error);
    res.status(500).json({ message: "Athlete registration failed" });
  }
});

authRouter.post("/login", async (req: Request, res: Response) => {
  try {
    const credentials = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { email: credentials.email.toLowerCase() },
      include: {
        memberships: {
          select: {
            role: true,
            teamId: true,
          },
        },
      },
    });

    if (!user?.passwordHash) {
      res.status(401).json({ message: "Invalid credentials" });
      return;
    }

    const isPasswordValid = await bcrypt.compare(credentials.password, user.passwordHash);

    if (!isPasswordValid) {
      res.status(401).json({ message: "Invalid credentials" });
      return;
    }

    const token = createAccessToken({
      sub: user.id,
      email: user.email,
      platformRole: user.platformRole,
      teamRoles: user.memberships.map((membership) => membership.role),
    });

    res.json({
      accessToken: token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        platformRole: user.platformRole,
        teamRoles: user.memberships.map((membership) => membership.role),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: "Invalid payload", issues: error.issues });
      return;
    }

    console.error("Login failed", error);
    res.status(500).json({ message: "Login failed" });
  }
});

authRouter.get("/me", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.auth?.sub;

    if (!userId) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          include: {
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

    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        platformRole: user.platformRole,
        memberships: user.memberships,
      },
    });
  } catch (error) {
    console.error("Failed to fetch current user", error);
    res.status(500).json({ message: "Failed to fetch current user" });
  }
});
