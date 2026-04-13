import { type Request, type Response, Router } from "express";

import { bootstrapProgramTemplate } from "../config/program-template.js";

export const bootstrapRouter = Router();

bootstrapRouter.get("/program-template", (_req: Request, res: Response) => {
  res.json({
    template: bootstrapProgramTemplate,
  });
});
