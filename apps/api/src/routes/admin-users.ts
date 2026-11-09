import { Prisma, Role } from "@prisma/client";
import { type Request, type Response, Router } from "express";
import { z } from "zod";

import { prisma } from "../config/prisma.js";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middleware/auth.js";

const listUsersQuerySchema = z.object({
  q: z.string().trim().min(1).optional(),
  role: z.nativeEnum(Role).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

const updateRoleSchema = z.object({
  platformRole: z.nativeEnum(Role).nullable(),
  confirmSelfDemotion: z.boolean().optional(),
});

function getStringParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export const adminUsersRouter = Router();

adminUsersRouter.use(requireAuth, requireRole([Role.SUPERADMIN]));

adminUsersRouter.get("/users", async (req: Request, res: Response) => {
  try {
    const query = listUsersQuerySchema.parse(req.query);
    const where: Prisma.UserWhereInput = {};

    if (query.role) {
      where.platformRole = query.role;
    }
    if (query.q) {
      where.OR = [
        { email: { contains: query.q, mode: "insensitive" } },
        { firstName: { contains: query.q, mode: "insensitive" } },
        { lastName: { contains: query.q, mode: "insensitive" } },
      ];
    }

    const [total, users] = await prisma.$transaction([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: [{ createdAt: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          platformRole: true,
          createdAt: true,
          updatedAt: true,
          memberships: {
            select: {
              role: true,
              team: { select: { id: true, name: true, slug: true } },
            },
          },
          athleteProfile: { select: { id: true, displayName: true } },
          _count: { select: { coachTemplates: true, programAssignments: true } },
        },
      }),
    ]);

    res.json({
      users,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: "Invalid query", issues: error.issues });
      return;
    }
    console.error("Failed to list users", error);
    res.status(500).json({ message: "Failed to list users" });
  }
});

adminUsersRouter.patch("/users/:userId/role", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = getStringParam(req.params.userId);
    if (!userId) {
      res.status(400).json({ message: "User id is required" });
      return;
    }

    const payload = updateRoleSchema.parse(req.body);
    const actorId = req.auth?.sub;

    if (actorId === userId && payload.platformRole !== Role.SUPERADMIN && !payload.confirmSelfDemotion) {
      res.status(409).json({
        message: "Confirm self-demotion from SUPERADMIN explicitly.",
        requiresConfirmation: true,
      });
      return;
    }

    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, platformRole: true },
    });
    if (!existing) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { platformRole: payload.platformRole },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        platformRole: true,
        updatedAt: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorUserId: actorId ?? null,
        entityType: "User",
        entityId: userId,
        action: "UPDATE_PLATFORM_ROLE",
        payload: {
          previousRole: existing.platformRole,
          nextRole: payload.platformRole,
          email: existing.email,
        } as Prisma.InputJsonValue,
      },
    });

    res.json({ user, requiresReauth: existing.id === actorId && payload.platformRole !== existing.platformRole });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: "Invalid payload", issues: error.issues });
      return;
    }
    console.error("Failed to update user role", error);
    res.status(500).json({ message: "Failed to update user role" });
  }
});
