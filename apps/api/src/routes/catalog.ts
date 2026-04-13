import { type Request, type Response, Router } from "express";

import { prisma } from "../config/prisma.js";

export const catalogRouter = Router();

catalogRouter.get("/exercises", async (_req: Request, res: Response) => {
  try {
    const exercises = await prisma.exercise.findMany({
      orderBy: { name: "asc" },
      include: {
        instructions: {
          orderBy: { locale: "asc" },
        },
        mediaAssets: {
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        },
      },
    });

    res.json({ exercises });
  } catch (error) {
    console.error("Failed to fetch exercise catalog", error);
    res.status(500).json({ message: "Failed to fetch exercise catalog" });
  }
});
