import { Router } from "express";

import { assetsRouter } from "./assets.js";
import { adminRouter } from "./admin.js";
import { athleteRouter } from "./athlete.js";
import { coachRouter } from "./coach.js";
import { authRouter } from "./auth.js";
import { bootstrapRouter } from "./bootstrap.js";
import { catalogRouter } from "./catalog.js";
import { healthRouter } from "./health.js";
import { templatesRouter } from "./templates.js";

export const apiRouter = Router();

apiRouter.use(assetsRouter);
apiRouter.use(healthRouter);
apiRouter.use("/auth", authRouter);
apiRouter.use("/athlete", athleteRouter);
apiRouter.use("/coach", coachRouter);
apiRouter.use("/admin", adminRouter);
apiRouter.use("/bootstrap", bootstrapRouter);
apiRouter.use("/catalog", catalogRouter);
apiRouter.use("/templates", templatesRouter);
