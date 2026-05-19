import { Role } from "@prisma/client";
import { type Request, type Response, Router } from "express";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

import { prisma } from "../config/prisma.js";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middleware/auth.js";

// ── Public router ──────────────────────────────────────────────────────────────

export const appConfigRouter = Router();

/**
 * GET /api/v1/app-config/:appSlug
 * Returns the template code and welcome video URL configured for a mobile app.
 * No authentication required (called at app startup before login).
 */
appConfigRouter.get("/:appSlug", async (req: Request, res: Response) => {
  try {
    const appSlug = typeof req.params.appSlug === "string" ? req.params.appSlug.trim() : "";
    if (!appSlug) {
      res.status(400).json({ message: "appSlug is required" });
      return;
    }

    const config = await prisma.mobileAppConfig.findUnique({
      where: { appSlug },
    });

    if (!config) {
      res.status(404).json({ message: "App config not found" });
      return;
    }

    // Fetch the welcome video URL from the associated template.
    const template = await prisma.programTemplate.findUnique({
      where: { code: config.templateCode },
      select: { welcomeVideoUrl: true },
    });

    res.json({
      templateCode: config.templateCode,
      welcomeVideoUrl: template?.welcomeVideoUrl ?? null,
    });
  } catch (error) {
    console.error("Failed to fetch app config", error);
    res.status(500).json({ message: "Failed to fetch app config" });
  }
});

// ── Admin router ───────────────────────────────────────────────────────────────

export const adminAppConfigRouter = Router();

const upsertAppConfigSchema = z.object({
  displayName: z.string().trim().min(1),
  templateCode: z.string().trim().min(1),
});

/**
 * GET /api/v1/admin/app-configs
 * Lists all mobile app configurations.
 */
adminAppConfigRouter.get(
  "/app-configs",
  requireAuth,
  requireRole([Role.SUPERADMIN]),
  async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const appConfigs = await prisma.mobileAppConfig.findMany({
        orderBy: { createdAt: "asc" },
      });
      res.json({ appConfigs });
    } catch (error) {
      console.error("Failed to list app configs", error);
      res.status(500).json({ message: "Failed to list app configs" });
    }
  },
);

/**
 * PUT /api/v1/admin/app-configs/:appSlug
 * Creates or updates the app config for the given slug.
 */
adminAppConfigRouter.put(
  "/app-configs/:appSlug",
  requireAuth,
  requireRole([Role.SUPERADMIN]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const appSlug = typeof req.params.appSlug === "string" ? req.params.appSlug.trim() : "";
      if (!appSlug) {
        res.status(400).json({ message: "appSlug is required" });
        return;
      }

      const payload = upsertAppConfigSchema.parse(req.body);

      const appConfig = await prisma.mobileAppConfig.upsert({
        where: { appSlug },
        create: {
          appSlug,
          displayName: payload.displayName,
          templateCode: payload.templateCode,
        },
        update: {
          displayName: payload.displayName,
          templateCode: payload.templateCode,
        },
      });

      res.json({ appConfig });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid payload", issues: error.issues });
        return;
      }
      console.error("Failed to upsert app config", error);
      res.status(500).json({ message: "Failed to upsert app config" });
    }
  },
);

// ── Available apps (workspace discovery) ──────────────────────────────────────

/**
 * GET /api/v1/admin/available-apps
 * Scans the workspace for mobile app directories (apps/mobile*) and returns
 * their app.json metadata (slug, name) for use in the admin UI.
 */
adminAppConfigRouter.get(
  "/available-apps",
  requireAuth,
  requireRole([Role.SUPERADMIN]),
  async (_req: AuthenticatedRequest, res: Response) => {
    try {
      // Resolve workspace root: this file is at apps/api/src/routes/app-config.ts
      // so ../../../../ gets us to the monorepo root.
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      const workspaceRoot = resolve(__dirname, "../../../../");
      const appsDir = join(workspaceRoot, "apps");

      let dirs: string[] = [];
      try {
        dirs = readdirSync(appsDir, { withFileTypes: true })
          .filter((d) => d.isDirectory() && /^mobile/.test(d.name))
          .map((d) => d.name);
      } catch {
        // apps dir not found – return empty list
      }

      const availableApps = dirs.map((dirName) => {
        const appJsonPath = join(appsDir, dirName, "app.json");
        let appSlug = dirName;
        let displayName = dirName;

        if (existsSync(appJsonPath)) {
          try {
            const raw = JSON.parse(readFileSync(appJsonPath, "utf-8")) as Record<string, unknown>;
            const expo = (raw.expo ?? raw) as Record<string, unknown>;
            if (typeof expo.slug === "string") appSlug = expo.slug;
            if (typeof expo.name === "string") displayName = expo.name;
          } catch {
            // ignore parse errors
          }
        }

        return { directory: dirName, appSlug, displayName };
      });

      res.json({ availableApps });
    } catch (error) {
      console.error("Failed to list available apps", error);
      res.status(500).json({ message: "Failed to list available apps" });
    }
  },
);
