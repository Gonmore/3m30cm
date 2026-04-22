import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { defineConfig } from "prisma/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "../..");

function loadEnvFile(filePath: string) {
  dotenv.config({ path: filePath });
}

loadEnvFile(path.join(workspaceRoot, ".env"));
loadEnvFile(path.join(workspaceRoot, ".env.local"));
loadEnvFile(path.join(__dirname, ".env"));
loadEnvFile(path.join(__dirname, ".env.local"));

export default defineConfig({
  schema: path.join(__dirname, "prisma", "schema.prisma"),
});