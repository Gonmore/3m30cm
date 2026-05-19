/**
 * populate-exercise-gifs.ts
 *
 * Downloads a demonstration GIF from ExerciseDB (RapidAPI) for each exercise
 * in the local catalogue, uploads it to MinIO and upserts the primary
 * ExerciseMediaAsset record in the database.
 *
 * Usage (from workspace root, requires the Docker stack or a local .env):
 *   npm run populate:gifs --workspace @jump/api
 *
 * Or directly:
 *   tsx apps/api/src/scripts/populate-exercise-gifs.ts
 *
 * Required env vars (already in .env):
 *   DATABASE_URL, MINIO_ENDPOINT, MINIO_BUCKET, MINIO_REGION,
 *   MINIO_ACCESS_KEY_ID, MINIO_SECRET_ACCESS_KEY, MINIO_FORCE_PATH_STYLE,
 *   X_RAPIDAPI_KEY, X_RAPIDAPI_HOST
 */

import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Load .env from the workspace root before anything else validates env vars.
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, "../../../../.env") });

import { randomUUID } from "node:crypto";
import { MediaKind } from "@prisma/client";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "../config/env.js";
import { prisma } from "../config/prisma.js";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ExerciseDbEntry {
  id: string;
  name: string;
  gifUrl: string;
  bodyPart: string;
  equipment: string;
  target: string;
  secondaryMuscles: string[];
  instructions: string[];
}

// ── Config ────────────────────────────────────────────────────────────────────

const RAPIDAPI_KEY = process.env.X_RAPIDAPI_KEY ?? "";
const RAPIDAPI_HOST = process.env.X_RAPIDAPI_HOST ?? "exercisedb.p.rapidapi.com";
const BUCKET = env.MINIO_BUCKET;

/** Milliseconds to wait between consecutive API calls (avoids 429s). */
const RATE_LIMIT_DELAY_MS = 600;

// ── MinIO client ──────────────────────────────────────────────────────────────

const s3 = new S3Client({
  region: env.MINIO_REGION,
  endpoint: env.MINIO_ENDPOINT,
  credentials: {
    accessKeyId: env.MINIO_ACCESS_KEY_ID,
    secretAccessKey: env.MINIO_SECRET_ACCESS_KEY,
  },
  forcePathStyle: env.MINIO_FORCE_PATH_STYLE,
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * Searches ExerciseDB for exercises matching `name`.
 * Returns the first result or `null` when nothing is found.
 */
async function searchExerciseDb(name: string): Promise<ExerciseDbEntry | null> {
  const url = `https://${RAPIDAPI_HOST}/exercises/name/${encodeURIComponent(name.toLowerCase())}?limit=1&offset=0`;

  const res = await fetch(url, {
    headers: {
      "x-rapidapi-key": RAPIDAPI_KEY,
      "x-rapidapi-host": RAPIDAPI_HOST,
      "Content-Type": "application/json",
    },
  });

  if (res.status === 429) {
    throw new Error("Rate limit hit (429). Try increasing RATE_LIMIT_DELAY_MS.");
  }

  if (!res.ok) {
    throw new Error(`ExerciseDB API responded ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as ExerciseDbEntry[];
  return data[0] ?? null;
}

/** Downloads a remote GIF/image and returns its bytes as a Buffer. */
async function downloadFile(url: string): Promise<{ data: Buffer; contentType: string }> {
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Failed to download file (${res.status}): ${url}`);
  }

  const contentType = res.headers.get("content-type") ?? "image/gif";
  const arrayBuffer = await res.arrayBuffer();
  return { data: Buffer.from(arrayBuffer), contentType };
}

/**
 * Uploads a GIF buffer to MinIO under `exercises/{exerciseId}/`.
 * Returns the object key and the API proxy URL.
 */
async function uploadGif(exerciseId: string, data: Buffer, contentType: string) {
  const objectKey = `exercises/${exerciseId}/${Date.now()}-${randomUUID()}.gif`;

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: objectKey,
      Body: data,
      ContentType: contentType,
    }),
  );

  // Build the proxy URL consistent with buildMediaAssetUrl() in minio.ts
  const encodedKey = objectKey
    .split("/")
    .map((s) => encodeURIComponent(s))
    .join("/");
  const url = `/api/v1/assets/${encodeURIComponent(BUCKET)}/${encodedKey}`;

  return { objectKey, url };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (!RAPIDAPI_KEY) {
    throw new Error("X_RAPIDAPI_KEY is not set. Add it to your .env file.");
  }

  const exercises = await prisma.exercise.findMany({
    select: { id: true, slug: true, name: true },
    orderBy: { name: "asc" },
  });

  console.log(`\n📋 ${exercises.length} exercises found in the database.\n`);

  let ok = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < exercises.length; i++) {
    const exercise = exercises[i]!;
    const prefix = `[${String(i + 1).padStart(2, "0")}/${exercises.length}] ${exercise.slug}`;

    try {
      // 1 — Search ExerciseDB
      process.stdout.write(`${prefix} — searching "${exercise.name}" … `);
      const match = await searchExerciseDb(exercise.name);

      if (!match) {
        console.log("not found, skipped.");
        skipped++;
        await sleep(RATE_LIMIT_DELAY_MS);
        continue;
      }

      console.log(`matched "${match.name}"`);

      // 2 — Download GIF
      process.stdout.write(`  ↳ downloading gif … `);
      const { data, contentType } = await downloadFile(match.gifUrl);
      console.log(`${(data.length / 1024).toFixed(0)} KB`);

      // 3 — Upload to MinIO
      process.stdout.write(`  ↳ uploading to MinIO … `);
      const { objectKey, url } = await uploadGif(exercise.id, data, contentType);
      console.log(`ok (${objectKey})`);

      // 4 — Upsert ExerciseMediaAsset
      await prisma.$transaction([
        // Demote any existing primary GIF so there is only one primary per exercise
        prisma.exerciseMediaAsset.updateMany({
          where: { exerciseId: exercise.id, kind: MediaKind.GIF, isPrimary: true },
          data: { isPrimary: false },
        }),
        prisma.exerciseMediaAsset.create({
          data: {
            exerciseId: exercise.id,
            kind: MediaKind.GIF,
            bucket: BUCKET,
            objectKey,
            url,
            title: match.name,
            isPrimary: true,
          },
        }),
      ]);

      ok++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`\n  ⚠️  ERROR: ${msg}`);
      errors++;
    }

    await sleep(RATE_LIMIT_DELAY_MS);
  }

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ✅ Success : ${ok}
  ⏭️  Skipped : ${skipped}
  ❌ Errors  : ${errors}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
}

main()
  .catch((err) => {
    console.error("\nFatal error:", err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
