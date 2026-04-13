import { Role } from "@prisma/client";
import { type Response, Router } from "express";

import { prisma } from "../config/prisma.js";
import { adminExercisesRouter } from "./admin-exercises.js";
import { adminProgramsRouter } from "./admin-programs.js";
import { adminTeamsRouter } from "./admin-teams.js";
import { adminTemplatesRouter } from "./admin-templates.js";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middleware/auth.js";

export const adminRouter = Router();

adminRouter.use(adminExercisesRouter);
adminRouter.use(adminProgramsRouter);
adminRouter.use(adminTeamsRouter);
adminRouter.use(adminTemplatesRouter);

adminRouter.get(
  "/summary",
  requireAuth,
  requireRole([Role.SUPERADMIN]),
  async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const [users, teams, athletes, exercises, templates, programs, sessions] = await Promise.all([
        prisma.user.count(),
        prisma.team.count(),
        prisma.athleteProfile.count(),
        prisma.exercise.count(),
        prisma.programTemplate.count(),
        prisma.personalProgram.count(),
        prisma.scheduledSession.count(),
      ]);

      res.json({
        metrics: {
          users,
          teams,
          athletes,
          exercises,
          templates,
          programs,
          sessions,
        },
      });
    } catch (error) {
      console.error("Failed to fetch admin summary", error);
      res.status(500).json({ message: "Failed to fetch admin summary" });
    }
  },
);
