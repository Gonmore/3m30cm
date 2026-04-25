import { type Request, type Response, Router } from "express";

import { prisma } from "../config/prisma.js";
import { ensureTemplateTechniqueStructure } from "../lib/program-template-techniques.js";

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
        techniques: {
          orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            title: true,
            description: true,
            measurementInstructions: true,
            comparisonEnabled: true,
            orderIndex: true,
            mediaAssets: {
              orderBy: [{ isPrimary: "desc" }, { orderIndex: "asc" }, { createdAt: "asc" }],
              select: {
                id: true,
                kind: true,
                url: true,
                title: true,
                isPrimary: true,
              },
            },
            measurementDefinitions: {
              orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
              select: {
                id: true,
                label: true,
                instructions: true,
                allowedUnits: true,
                orderIndex: true,
              },
            },
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

    const templateRef = await prisma.programTemplate.findUnique({
      where: { code },
      select: { id: true },
    });

    if (!templateRef) {
      res.status(404).json({ message: "Program template not found" });
      return;
    }

    await ensureTemplateTechniqueStructure(prisma, templateRef.id);

    const template = await prisma.programTemplate.findUnique({
      where: { id: templateRef.id },
      include: {
        techniqueMediaAssets: {
          orderBy: [{ isPrimary: "desc" }, { orderIndex: "asc" }, { createdAt: "asc" }],
        },
        techniques: {
          orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
          include: {
            mediaAssets: {
              orderBy: [{ isPrimary: "desc" }, { orderIndex: "asc" }, { createdAt: "asc" }],
            },
            measurementDefinitions: {
              orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
            },
          },
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

    const firstTechnique = template?.techniques[0] ?? null;

    if (template && firstTechnique) {
      template.techniqueTitle = firstTechnique.title;
      template.techniqueDescription = firstTechnique.description;
    }

    res.json({ template });
  } catch (error) {
    console.error("Failed to fetch program template", error);
    res.status(500).json({ message: "Failed to fetch program template" });
  }
});
