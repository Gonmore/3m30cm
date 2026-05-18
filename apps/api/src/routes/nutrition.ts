import { type Request, type Response, Router } from "express";

import { prisma } from "../config/prisma.js";
import { requireAuth } from "../middleware/auth.js";

export const nutritionRouter = Router();

nutritionRouter.use(requireAuth);

// Returns all published articles, optionally filtered by ?category=
nutritionRouter.get(
  "/articles",
  async (req: Request, res: Response) => {
    const category = typeof req.query["category"] === "string" ? req.query["category"] : undefined;

    const articles = await prisma.nutritionArticle.findMany({
      where: {
        isPublished: true,
        ...(category ? { category: category as never } : {}),
      },
      select: {
        id: true,
        title: true,
        category: true,
        content: true,
        icon: true,
        orderIndex: true,
      },
      orderBy: [{ category: "asc" }, { orderIndex: "asc" }],
    });

    res.json({ articles });
  },
);

// Returns a single published article by id
nutritionRouter.get(
  "/articles/:id",
  async (req: Request, res: Response) => {
    const id = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
    if (!id) { res.status(400).json({ message: "Missing id" }); return; }
    const article = await prisma.nutritionArticle.findFirst({
      where: { id, isPublished: true },
      select: {
        id: true,
        title: true,
        category: true,
        content: true,
        icon: true,
        orderIndex: true,
      },
    });

    if (!article) {
      res.status(404).json({ message: "Article not found" });
      return;
    }

    res.json({ article });
  },
);

// Returns one random active tip
nutritionRouter.get(
  "/tips/random",
  async (_req: Request, res: Response) => {
    const count = await prisma.nutritionTip.count({ where: { isActive: true } });

    if (count === 0) {
      res.json({ tip: null });
      return;
    }

    const skip = Math.floor(Math.random() * count);
    const tip = await prisma.nutritionTip.findFirst({
      where: { isActive: true },
      skip,
      select: { id: true, message: true },
    });

    res.json({ tip });
  },
);
