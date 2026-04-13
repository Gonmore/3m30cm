import process from "node:process";

import { Client } from "pg";

function escapeIdentifier(value) {
  return `"${value.replace(/"/g, '""')}"`;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const targetUrl = new URL(databaseUrl);
  const databaseName = targetUrl.pathname.replace(/^\//, "");

  if (!databaseName) {
    throw new Error("DATABASE_URL must include a database name");
  }

  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = "/postgres";
  adminUrl.searchParams.delete("schema");

  const client = new Client({
    connectionString: adminUrl.toString(),
  });

  await client.connect();

  try {
    const existingDatabase = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [databaseName]);

    if (existingDatabase.rowCount && existingDatabase.rowCount > 0) {
      console.log(`Database ${databaseName} already exists.`);
      return;
    }

    await client.query(`CREATE DATABASE ${escapeIdentifier(databaseName)}`);
    console.log(`Database ${databaseName} created.`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Failed to ensure database", error);
  process.exitCode = 1;
});