import { config } from "dotenv";
import { z } from "zod";

config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4100),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  WEB_URL: z.string().url().default("http://localhost:4173"),
  MINIO_ENDPOINT: z.string().url().default("http://localhost:9000"),
  MINIO_PUBLIC_BASE_URL: z.string().url().default("http://localhost:9000"),
  MINIO_BUCKET: z.string().min(1).default("jump-assets"),
  MINIO_REGION: z.string().min(1).default("us-east-1"),
  MINIO_ACCESS_KEY_ID: z.string().min(1).default("minioadmin"),
  MINIO_SECRET_ACCESS_KEY: z.string().min(1).default("minioadmin"),
  MINIO_FORCE_PATH_STYLE: z.coerce.boolean().default(true),
  JWT_ACCESS_SECRET: z.string().min(16).default("change-me-super-secret"),
  JWT_ACCESS_EXPIRES_IN: z.string().min(2).default("7d"),
  SEED_SUPERADMIN_EMAIL: z.string().email().default("admin@3m30cm.local"),
  SEED_SUPERADMIN_PASSWORD: z.string().min(8).default("Admin123!"),
  APP_VERSION: z.string().min(1).default("dev"),
});

export const env = envSchema.parse(process.env);
