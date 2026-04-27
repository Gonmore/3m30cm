import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, "..");
const workspaceRoot = path.resolve(appRoot, "..", "..");
const schemaPath = path.join(appRoot, "prisma", "schema.prisma");
const prismaBinaryName = process.platform === "win32" ? "prisma.cmd" : "prisma";

function resolvePrismaBinary() {
  const candidates = [
    path.join(appRoot, "node_modules", ".bin", prismaBinaryName),
    path.join(workspaceRoot, "node_modules", ".bin", prismaBinaryName),
  ];

  const match = candidates.find((candidate) => fs.existsSync(candidate));

  if (!match) {
    throw new Error(`No encontré el binario de Prisma en: ${candidates.join(", ")}`);
  }

  return match;
}

const baselineMigrationName = "20260427_000000_baseline_existing_schema";
const additiveMigrations = [
  {
    name: "20260427_add_athlete_profile_dimensions",
    table: "AthleteProfile",
    columns: ["heightCm", "weightKg"],
  },
  {
    name: "20260427_add_pro_biomechanics_fields_to_program_template_technique",
    table: "ProgramTemplateTechnique",
    columns: ["proVideoUrl", "proLandmarks"],
  },
];

function runPrisma(args) {
  const result = spawnSync(resolvePrismaBinary(), args, {
    cwd: appRoot,
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function openClient() {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error("DATABASE_URL no está definido para ejecutar las migraciones.");
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  return client;
}

async function tableExists(client, tableName) {
  const result = await client.query(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = $1
      ) AS "exists"
    `,
    [tableName],
  );

  return result.rows[0]?.exists === true;
}

async function getUserTableCount(client) {
  const result = await client.query(`
    SELECT COUNT(*)::int AS count
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name <> '_prisma_migrations'
  `);

  return result.rows[0]?.count ?? 0;
}

async function getAppliedMigrations(client) {
  if (!(await tableExists(client, "_prisma_migrations"))) {
    return new Set();
  }

  const result = await client.query(`SELECT migration_name FROM "_prisma_migrations"`);
  return new Set(result.rows.map((row) => row.migration_name));
}

async function columnsExist(client, tableName, columns) {
  const result = await client.query(
    `
      SELECT COUNT(*)::int AS count
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = ANY($2::text[])
    `,
    [tableName, columns],
  );

  return (result.rows[0]?.count ?? 0) === columns.length;
}

async function main() {
  let client = await openClient();

  try {
    const migrationsTablePresent = await tableExists(client, "_prisma_migrations");
    const userTableCount = await getUserTableCount(client);

    if (!migrationsTablePresent && userTableCount > 0) {
      console.log(
        `[migrate-prod] Base existente sin _prisma_migrations detectada. Marco baseline ${baselineMigrationName} como aplicada.`,
      );
      await client.end();
      runPrisma(["migrate", "resolve", "--applied", baselineMigrationName, "--schema", schemaPath]);
      client = await openClient();
    }

    let appliedMigrations = await getAppliedMigrations(client);

    for (const migration of additiveMigrations) {
      if (appliedMigrations.has(migration.name)) {
        continue;
      }

      if (await columnsExist(client, migration.table, migration.columns)) {
        console.log(
          `[migrate-prod] ${migration.name} ya está reflejada en la base. La marco como aplicada para alinear el historial.`,
        );
        await client.end();
        runPrisma(["migrate", "resolve", "--applied", migration.name, "--schema", schemaPath]);
        client = await openClient();
        appliedMigrations = await getAppliedMigrations(client);
      }
    }

    await client.end();
    runPrisma(["migrate", "deploy", "--schema", schemaPath]);
  } catch (error) {
    await client.end().catch(() => undefined);
    throw error;
  }
}

main().catch((error) => {
  console.error("[migrate-prod] Falló la preparación de migraciones:", error);
  process.exit(1);
});