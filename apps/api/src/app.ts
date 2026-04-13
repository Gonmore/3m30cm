import cors from "cors";
import express, { type Request, type Response } from "express";
import helmet from "helmet";
import morgan from "morgan";

import { env } from "./config/env.js";
import { apiRouter } from "./routes/index.js";

export const app = express();

app.use(
  cors({
    origin: [env.WEB_URL],
    credentials: true,
  }),
);
app.use(helmet());
app.use(express.json({ limit: "1mb" }));
app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));

app.get("/", (_req: Request, res: Response) => {
  res.json({
    name: "3m30cm API",
    docs: "/api/v1/bootstrap/program-template",
  });
});

app.use("/api/v1", apiRouter);

app.use((_req: Request, res: Response) => {
  res.status(404).json({
    message: "Route not found",
  });
});
