import { type Request, type Response, Router } from "express";

import { prisma } from "../config/prisma.js";

export const templatesRouter = Router();

templatesRouter.get("/program-templates", async (_req: Request, res: Response) => {
  try {
    const templates = await prisma.programTemplate.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        techniqueTitle: true,
        techniqueDescription: true,
        cycleLengthDays: true,
        techniqueMediaAssets: {
          orderBy: [{ isPrimary: "desc" }, { orderIndex: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            kind: true,
            url: true,
            title: true,
            isPrimary: true,
          },
        },
      },
    });
    res.json({ templates });
  } catch (error) {
    console.error("Failed to list templates", error);
    res.status(500).json({ message: "Failed to list templates" });
  }
});

templatesRouter.get("/program-templates/:code", async (req: Request, res: Response) => {
  try {
    const code = Array.isArray(req.params.code) ? req.params.code[0] : req.params.code;

    if (!code) {
      res.status(400).json({ message: "Program template code is required" });
      return;
    }

    const template = await prisma.programTemplate.findUnique({
      where: { code },
      include: {
        techniqueMediaAssets: {
          orderBy: [{ isPrimary: "desc" }, { orderIndex: "asc" }, { createdAt: "asc" }],
        },
        days: {
          orderBy: { dayNumber: "asc" },
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
        },
      },
    });

    if (!template) {
      res.status(404).json({ message: "Program template not found" });
      return;
    }

    res.json({ template });
  } catch (error) {
    console.error("Failed to fetch program template", error);
    res.status(500).json({ message: "Failed to fetch program template" });
  }
});
