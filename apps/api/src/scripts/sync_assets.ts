/**
 * sync_assets.ts
 *
 * Downloads exercise GIFs from the omercotkd/exercises-gifs GitHub CDN,
 * uploads them to MinIO, and upserts the ExerciseMediaAsset + English
 * ExerciseInstruction records in the database.
 *
 * This script replaces the RapidAPI-based populate-exercise-gifs approach
 * with a fully local, free CSV-based lookup.
 *
 * Data source:
 *   CSV  : media_help/exercises.csv  (included in the workspace root)
 *   GIFs : https://raw.githubusercontent.com/omercotkd/exercises-gifs/main/assets/{id}.gif
 *
 * Usage (from workspace root):
 *   npm run sync:assets --workspace @jump/api
 *
 * Or directly:
 *   tsx apps/api/src/scripts/sync_assets.ts
 *
 * Required env vars (already in .env):
 *   DATABASE_URL, MINIO_ENDPOINT, MINIO_BUCKET, MINIO_REGION,
 *   MINIO_ACCESS_KEY_ID, MINIO_SECRET_ACCESS_KEY, MINIO_FORCE_PATH_STYLE
 */

import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { readFileSync } from "node:fs";

// Load .env from the workspace root before anything else validates env vars.
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, "../../../../.env") });

import { MediaKind } from "@prisma/client";
import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { env } from "../config/env.js";
import { prisma } from "../config/prisma.js";

// ── EXERCISE_MAP: Spanish exercise name → English search keyword ───────────────
// Keys must match the `name` field of Exercise records in the database.

const EXERCISE_MAP: Record<string, string> = {
  // === FASE 1: ADAPTACIÓN Y SALUD TENDINOSA ===
  "Movilidad Dinámica": "world greatest stretch",
  "Depth Drops": "box jump down",
  "Bulgarian Split Squat": "dumbbell bulgarian split squat",
  "Push Ups Explosivas": "clap push up",
  "Nordic Curl Asistido": "self assisted nordic hamstring curl",
  "Plank con Toque de Hombros": "kneeling plank tap shoulder (male)",
  "Tibialis Raise": "tibialis anterior raise",
  "Estiramiento Estático": "subscapularis stretch",
  "Descanso Activo": "walk",
  "Pogo Jumps Nivel 1": "ankle hops plyo",
  "Goblet Squat": "dumbbell goblet squat",
  "Pull Ups": "pullup",
  "Deadlift Rumano": "barbell romanian deadlift",
  "Copenhague Plank": "copenhagen plank",
  "Calf Raises": "standing calf raise",
  "Face Pulls": "rope face pull",
  "Estiramiento y Movilidad": "yoga positions",
  "Saltos de Aproximación": "rocket jump",
  "Step Ups Explosivos": "box step up",
  "Dips": "triceps dip",
  "Glute Bridge Una Pierna": "single leg glute bridge",
  "Dead Bug": "dead bug",
  "Aterrizaje Monopodal": "single leg landing",

  // === FASE 2: RECLUTAMIENTO DE FUERZA MÁXIMA ===
  "Trap Bar Jump": "trap bar jump squat",
  "Sentadilla (Back Squat)": "barbell back squat",
  "Press Militar": "barbell standing overhead press",
  "Box Jump": "box jump",
  "Trap Bar Deadlift": "trap bar deadlift",
  "Pull Ups (Lastradas)": "weighted pullup",
  "Zancadas Caminando": "dumbbell walking lunge",
  "Step Up Cargado": "dumbbell box step up",
  "Press Banca": "barbell bench press",
  "Glute Bridge Barbell": "barbell glute bridge",
  "Aterrizaje Monopodal + Salto": "lateral bounds",

  // === FASE 3: CONVERSIÓN A EXPLOSIVIDAD ===
  "Max Approach Jump": "squat jump",
  "Depth Jumps (Reactivos)": "depth jump",
  "Power Clean": "barbell power clean",
  "Sprints de 10m": "run",
  "Assisted Jumps": "band assisted jump",
  "Push Press": "barbell push press",
  "Speed Deadlift": "barbell deadlift",
  "Single Leg Pogo Jumps": "single leg ankle hops",
  "Sprints de 20m": "run",
  "V-Ups Explosivos": "v-up",
};

// ── Config ────────────────────────────────────────────────────────────────────

const BUCKET = env.MINIO_BUCKET;
const PRODUCTION_BASE = "https://3m30cm.supernovatel.com";
const GIF_CDN_BASE =
  "https://raw.githubusercontent.com/omercotkd/exercises-gifs/main/assets";

/** Milliseconds to wait between GIF downloads (be kind to GitHub CDN). */
const DOWNLOAD_DELAY_MS = 250;

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

// ── CSV parsing ───────────────────────────────────────────────────────────────

interface CsvExercise {
  id: string;
  name: string;
  bodyPart: string;
  equipment: string;
  target: string;
  instructions: string[];
}

/** Parse a single CSV line, handling double-quoted fields (RFC 4180). */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote inside a quoted field
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      fields.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

function loadCsv(csvPath: string): CsvExercise[] {
  const content = readFileSync(csvPath, "utf-8");
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const header = parseCsvLine(lines[0]!);

  const idxId = header.indexOf("id");
  const idxName = header.indexOf("name");
  const idxBodyPart = header.indexOf("bodyPart");
  const idxEquipment = header.indexOf("equipment");
  const idxTarget = header.indexOf("target");

  // Collect all instruction column indices in order
  const instructionCols: Array<{ idx: number; num: number }> = [];
  for (let i = 0; i < header.length; i++) {
    const col = header[i]!;
    if (col.startsWith("instructions/")) {
      const num = parseInt(col.split("/")[1]!, 10);
      instructionCols.push({ idx: i, num });
    }
  }
  instructionCols.sort((a, b) => a.num - b.num);

  const rows: CsvExercise[] = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]!);
    const instructions = instructionCols
      .map(({ idx }) => fields[idx]?.trim())
      .filter((v): v is string => v !== undefined && v.length > 0);

    rows.push({
      id: fields[idxId]?.trim() ?? "",
      name: fields[idxName]?.trim() ?? "",
      bodyPart: fields[idxBodyPart]?.trim() ?? "",
      equipment: fields[idxEquipment]?.trim() ?? "",
      target: fields[idxTarget]?.trim() ?? "",
      instructions,
    });
  }
  return rows;
}

// ── Fuzzy matching ────────────────────────────────────────────────────────────

function normalizeWords(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((w) => w.length > 2);
}

/**
 * F1-like word overlap score: harmonic mean of precision and recall.
 * Returns 1.0 for identical normalized word sets, 0 for no overlap.
 */
function wordOverlapScore(keyword: string, rowName: string): number {
  const kw = normalizeWords(keyword);
  const rw = normalizeWords(rowName);
  if (kw.length === 0 || rw.length === 0) return 0;

  const rwSet = new Set(rw);
  const matches = kw.filter((w) => rwSet.has(w)).length;
  if (matches === 0) return 0;

  const precision = matches / kw.length;
  const recall = matches / rw.length;
  return (2 * precision * recall) / (precision + recall);
}

interface CsvMatchResult {
  row: CsvExercise;
  score: number;
  matchType: "exact" | "fuzzy";
}

/** Returns the best CSV row for `keyword`, or null if no match ≥ 0.40. */
function findBestCsvMatch(
  keyword: string,
  rows: CsvExercise[]
): CsvMatchResult | null {
  // Exact match wins immediately
  const exactRow = rows.find(
    (r) => r.name.toLowerCase() === keyword.toLowerCase()
  );
  if (exactRow) return { row: exactRow, score: 1.0, matchType: "exact" };

  // Fuzzy fallback
  let best: CsvMatchResult | null = null;
  for (const row of rows) {
    const score = wordOverlapScore(keyword, row.name);
    if (!best || score > best.score) {
      best = { row, score, matchType: "fuzzy" };
    }
  }
  return best && best.score >= 0.4 ? best : null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Converts a Spanish exercise name to a URL-safe slug. */
function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function ensureBucket(): Promise<void> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
  }
}

async function downloadGif(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Download failed (${res.status}): ${url}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function uploadGif(
  cleanName: string,
  data: Buffer
): Promise<{ objectKey: string; url: string }> {
  const objectKey = `exercises/${cleanName}.gif`;
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: objectKey,
      Body: data,
      ContentType: "image/gif",
    })
  );

  // Build absolute production URL (as requested for DB storage)
  const encodedKey = objectKey.split("/").map(encodeURIComponent).join("/");
  const url = `${PRODUCTION_BASE}/api/v1/assets/${encodeURIComponent(BUCKET)}/${encodedKey}`;
  return { objectKey, url };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const csvPath = resolve(__dirname, "../../data/exercises.csv");
  console.log(`\n📂 Loading CSV: ${csvPath}`);
  const csvRows = loadCsv(csvPath);
  console.log(`   ${csvRows.length} exercises loaded from CSV.\n`);

  await ensureBucket();

  const entries = Object.entries(EXERCISE_MAP);

  let ok = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < entries.length; i++) {
    const [spanishName, englishKeyword] = entries[i]!;
    const prefix = `[${String(i + 1).padStart(2, "0")}/${entries.length}] ${spanishName}`;

    try {
      // ── 1. Find exercise in DB by Spanish name ───────────────────────────
      const dbExercise = await prisma.exercise.findFirst({
        where: { name: spanishName },
        select: { id: true, slug: true, name: true },
      });

      if (!dbExercise) {
        console.log(`${prefix} — ⚠️  not found in DB, skipped.`);
        skipped++;
        continue;
      }

      // ── 2. Skip if this exact object key is already in MinIO ─────────────
      const cleanName = slugifyName(spanishName);
      const expectedKey = `exercises/${cleanName}.gif`;

      const alreadyUploaded = await prisma.exerciseMediaAsset.findFirst({
        where: { exerciseId: dbExercise.id, objectKey: expectedKey },
      });

      if (alreadyUploaded) {
        console.log(`${prefix} — ⏭️  already uploaded (${expectedKey}), skipped.`);
        skipped++;
        continue;
      }

      // ── 3. Find best match in CSV ─────────────────────────────────────────
      process.stdout.write(
        `${prefix} — searching CSV for "${englishKeyword}" … `
      );
      const matchResult = findBestCsvMatch(englishKeyword, csvRows);

      if (!matchResult) {
        console.log("❌ no CSV match.");
        skipped++;
        continue;
      }

      const { row: csvRow, score, matchType } = matchResult;
      const scoreLabel =
        matchType === "exact"
          ? "exact"
          : `fuzzy ${(score * 100).toFixed(0)}%`;
      console.log(`✅ "${csvRow.name}" [${scoreLabel}]`);

      // ── 4. Download GIF from GitHub CDN ───────────────────────────────────
      const gifUrl = `${GIF_CDN_BASE}/${csvRow.id}.gif`;
      process.stdout.write(`  ↳ downloading ${gifUrl} … `);
      const gifData = await downloadGif(gifUrl);
      console.log(`${(gifData.length / 1024).toFixed(0)} KB`);

      // ── 5. Upload to MinIO ────────────────────────────────────────────────
      process.stdout.write(`  ↳ uploading exercises/${cleanName}.gif … `);
      const { objectKey, url } = await uploadGif(cleanName, gifData);
      console.log(`ok`);
      console.log(`     → ${url}`);

      // ── 6. Upsert ExerciseMediaAsset ──────────────────────────────────────
      await prisma.$transaction([
        // Demote any existing primary GIF to non-primary
        prisma.exerciseMediaAsset.updateMany({
          where: {
            exerciseId: dbExercise.id,
            kind: MediaKind.GIF,
            isPrimary: true,
          },
          data: { isPrimary: false },
        }),
        prisma.exerciseMediaAsset.create({
          data: {
            exerciseId: dbExercise.id,
            kind: MediaKind.GIF,
            bucket: BUCKET,
            objectKey,
            url,
            title: csvRow.name,
            isPrimary: true,
          },
        }),
      ]);

      // ── 7. Upsert ExerciseInstruction (English) ───────────────────────────
      const englishSteps = csvRow.instructions.join(" ");
      if (englishSteps) {
        await prisma.exerciseInstruction.upsert({
          where: {
            exerciseId_locale: { exerciseId: dbExercise.id, locale: "en" },
          },
          create: {
            exerciseId: dbExercise.id,
            locale: "en",
            steps: englishSteps,
            summary: csvRow.name,
          },
          update: {
            steps: englishSteps,
            summary: csvRow.name,
          },
        });
      }

      ok++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`\n  ⚠️  ERROR: ${msg}`);
      errors++;
    }

    await sleep(DOWNLOAD_DELAY_MS);
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
