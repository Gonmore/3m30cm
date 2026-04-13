import { type Request, type Response, Router } from "express";

import { env } from "../config/env.js";

export const healthRouter = Router();

healthRouter.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    service: "3m30cm-api",
    version: env.APP_VERSION,
    timestamp: new Date().toISOString(),
  });
});
