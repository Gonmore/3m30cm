import { NutritionCategory, Role } from "@prisma/client";
import { type Request, type Response, Router } from "express";
import { z } from "zod";

import { prisma } from "../config/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const adminNutritionRouter = Router();

adminNutritionRouter.use(requireAuth, requireRole([Role.SUPERADMIN]));

// ── Validation schemas ────────────────────────────────────────────────────────

const articleSchema = z.object({
  title: z.string().trim().min(2),
  category: z.nativeEnum(NutritionCategory),
  content: z.string().trim().min(1),
  icon: z.string().trim().min(1).default("🥗"),
  orderIndex: z.number().int().default(0),
  isPublished: z.boolean().default(true),
});

const tipSchema = z.object({
  message: z.string().trim().min(2),
  isActive: z.boolean().default(true),
});

// ── Articles ─────────────────────────────────────────────────────────────────

adminNutritionRouter.get(
  "/nutrition/articles",
  async (_req: Request, res: Response) => {
    const articles = await prisma.nutritionArticle.findMany({
      orderBy: [{ category: "asc" }, { orderIndex: "asc" }],
    });
    res.json({ articles });
  },
);

adminNutritionRouter.post(
  "/nutrition/articles",
  async (req: Request, res: Response) => {
    try {
      const data = articleSchema.parse(req.body);
      const article = await prisma.nutritionArticle.create({ data });
      res.status(201).json({ article });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid article data", issues: error.issues });
        return;
      }
      console.error("Failed to create nutrition article", error);
      res.status(500).json({ message: "Failed to create article" });
    }
  },
);

adminNutritionRouter.put(
  "/nutrition/articles/:id",
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const data = articleSchema.parse(req.body);
      const article = await prisma.nutritionArticle.update({ where: { id }, data });
      res.json({ article });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid article data", issues: error.issues });
        return;
      }
      console.error("Failed to update nutrition article", error);
      res.status(500).json({ message: "Failed to update article" });
    }
  },
);

adminNutritionRouter.delete(
  "/nutrition/articles/:id",
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      await prisma.nutritionArticle.delete({ where: { id } });
      res.json({ ok: true });
    } catch (error) {
      console.error("Failed to delete nutrition article", error);
      res.status(500).json({ message: "Failed to delete article" });
    }
  },
);

// ── Tips ─────────────────────────────────────────────────────────────────────

adminNutritionRouter.get(
  "/nutrition/tips",
  async (_req: Request, res: Response) => {
    const tips = await prisma.nutritionTip.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.json({ tips });
  },
);

adminNutritionRouter.post(
  "/nutrition/tips",
  async (req: Request, res: Response) => {
    try {
      const data = tipSchema.parse(req.body);
      const tip = await prisma.nutritionTip.create({ data });
      res.status(201).json({ tip });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid tip data", issues: error.issues });
        return;
      }
      console.error("Failed to create nutrition tip", error);
      res.status(500).json({ message: "Failed to create tip" });
    }
  },
);

adminNutritionRouter.put(
  "/nutrition/tips/:id",
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const data = tipSchema.parse(req.body);
      const tip = await prisma.nutritionTip.update({ where: { id }, data });
      res.json({ tip });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid tip data", issues: error.issues });
        return;
      }
      console.error("Failed to update nutrition tip", error);
      res.status(500).json({ message: "Failed to update tip" });
    }
  },
);

adminNutritionRouter.delete(
  "/nutrition/tips/:id",
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      await prisma.nutritionTip.delete({ where: { id } });
      res.json({ ok: true });
    } catch (error) {
      console.error("Failed to delete nutrition tip", error);
      res.status(500).json({ message: "Failed to delete tip" });
    }
  },
);
