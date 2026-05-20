import { Role, SeriesProtocol, type MediaKind, Prisma } from "@prisma/client";
import { type Request, type Response, Router } from "express";
import multer from "multer";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

import { env } from "../config/env.js";
import { prisma } from "../config/prisma.js";
import { deleteExerciseMedia, uploadExerciseMedia } from "../lib/minio.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const exerciseSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/),
  category: z.string().min(2),
  description: z.string().trim().optional(),
  equipment: z.string().trim().optional(),
  requiresLoad: z.boolean().default(false),
  perLeg: z.boolean().default(false),
  isBlock: z.boolean().default(false),
  defaultSeriesProtocol: z.nativeEnum(SeriesProtocol).default(SeriesProtocol.NONE),
  summary: z.string().min(2),
  steps: z.string().min(5),
  safetyNotes: z.string().trim().optional(),
});

const mediaSchema = z.object({
  kind: z.enum(["IMAGE", "GIF", "VIDEO"] satisfies [MediaKind, ...MediaKind[]]),
  title: z.string().trim().optional(),
  isPrimary: z.coerce.boolean().default(false),
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024,
  },
});

function getStringParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

export const adminExercisesRouter = Router();

adminExercisesRouter.use(requireAuth, requireRole([Role.SUPERADMIN]));

adminExercisesRouter.get("/exercises", async (_req: Request, res: Response) => {
  try {
    const exercises = await prisma.exercise.findMany({
      orderBy: { name: "asc" },
      include: {
        instructions: {
          orderBy: { locale: "asc" },
        },
        mediaAssets: {
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        },
        asBlock: {
          include: {
            items: {
              orderBy: { order: "asc" },
              include: {
                exercise: {
                  select: { id: true, name: true, slug: true, category: true },
                },
              },
            },
          },
        },
      },
    });

    res.json({ exercises });
  } catch (error) {
    console.error("Failed to fetch admin exercises", error);
    res.status(500).json({ message: "Failed to fetch exercises" });
  }
});

adminExercisesRouter.post("/exercises", async (req: Request, res: Response) => {
  try {
    const payload = exerciseSchema.parse(req.body);

    const exercise = await prisma.exercise.create({
      data: {
        slug: payload.slug,
        name: payload.name,
        category: payload.category,
        requiresLoad: payload.requiresLoad,
        perLeg: payload.perLeg,
        isBlock: payload.isBlock,
        defaultSeriesProtocol: payload.defaultSeriesProtocol,
        ...(payload.description ? { description: payload.description } : {}),
        ...(payload.equipment ? { equipment: payload.equipment } : {}),
        instructions: {
          create: {
            locale: "es",
            summary: payload.summary,
            steps: payload.steps,
            ...(payload.safetyNotes ? { safetyNotes: payload.safetyNotes } : {}),
          },
        },
      },
      include: {
        instructions: true,
        mediaAssets: true,
        asBlock: { include: { items: { orderBy: { order: "asc" }, include: { exercise: { select: { id: true, name: true, slug: true, category: true } } } } } },
      },
    });

    res.status(201).json({ exercise });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: "Invalid payload", issues: error.issues });
      return;
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      res.status(409).json({ message: "Exercise slug already exists" });
      return;
    }

    console.error("Failed to create exercise", error);
    res.status(500).json({ message: "Failed to create exercise" });
  }
});

adminExercisesRouter.put("/exercises/:id", async (req: Request, res: Response) => {
  try {
    const exerciseId = getStringParam(req.params.id);

    if (!exerciseId) {
      res.status(400).json({ message: "Exercise id is required" });
      return;
    }

    const payload = exerciseSchema.parse(req.body);
    const instructionCreateData = {
      locale: "es",
      summary: payload.summary,
      steps: payload.steps,
      ...(payload.safetyNotes ? { safetyNotes: payload.safetyNotes } : {}),
    };

    const existingInstruction = await prisma.exerciseInstruction.findFirst({
      where: {
        exerciseId,
        locale: "es",
      },
      select: { id: true },
    });

    const exercise = await prisma.exercise.update({
      where: { id: exerciseId },
      data: {
        slug: payload.slug,
        name: payload.name,
        category: payload.category,
        requiresLoad: payload.requiresLoad,
        perLeg: payload.perLeg,
        isBlock: payload.isBlock,
        defaultSeriesProtocol: payload.defaultSeriesProtocol,
        description: payload.description ?? null,
        equipment: payload.equipment ?? null,
        instructions: existingInstruction
          ? {
              update: {
                where: { id: existingInstruction.id },
                data: {
                  summary: payload.summary,
                  steps: payload.steps,
                  safetyNotes: payload.safetyNotes ?? null,
                },
              },
            }
          : {
              create: instructionCreateData,
            },
      },
      include: {
        instructions: true,
        mediaAssets: {
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        },
        asBlock: { include: { items: { orderBy: { order: "asc" }, include: { exercise: { select: { id: true, name: true, slug: true, category: true } } } } } },
      },
    });

    res.json({ exercise });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: "Invalid payload", issues: error.issues });
      return;
    }

    console.error("Failed to update exercise", error);
    res.status(500).json({ message: "Failed to update exercise" });
  }
});

adminExercisesRouter.delete("/exercises/:id", async (req: Request, res: Response) => {
  try {
    const exerciseId = getStringParam(req.params.id);

    if (!exerciseId) {
      res.status(400).json({ message: "Exercise id is required" });
      return;
    }

    const mediaAssets = await prisma.exerciseMediaAsset.findMany({
      where: { exerciseId },
      select: { objectKey: true },
    });

    await prisma.exercise.delete({
      where: { id: exerciseId },
    });

    await Promise.all(mediaAssets.map((asset) => deleteExerciseMedia(asset.objectKey).catch(() => undefined)));

    res.status(204).send();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025") {
        res.status(404).json({ message: "Exercise not found" });
        return;
      }

      if (error.code === "P2003") {
        res.status(409).json({ message: "Exercise is referenced by program data and cannot be deleted" });
        return;
      }
    }

    console.error("Failed to delete exercise", error);
    res.status(500).json({ message: "Failed to delete exercise" });
  }
});

adminExercisesRouter.post(
  "/exercises/:id/media",
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      const exerciseId = getStringParam(req.params.id);
      const file = req.file;

      if (!exerciseId) {
        res.status(400).json({ message: "Exercise id is required" });
        return;
      }

      if (!file) {
        res.status(400).json({ message: "File is required" });
        return;
      }

      const metadata = mediaSchema.parse(req.body);
      const exercise = await prisma.exercise.findUnique({
        where: { id: exerciseId },
        select: { id: true },
      });

      if (!exercise) {
        res.status(404).json({ message: "Exercise not found" });
        return;
      }

      const uploadResult = await uploadExerciseMedia({
        exerciseId,
        fileName: file.originalname,
        contentType: file.mimetype || "application/octet-stream",
        data: file.buffer,
      });

      if (metadata.isPrimary) {
        await prisma.exerciseMediaAsset.updateMany({
          where: { exerciseId },
          data: { isPrimary: false },
        });
      }

      const mediaAsset = await prisma.exerciseMediaAsset.create({
        data: {
          exerciseId,
          kind: metadata.kind,
          bucket: env.MINIO_BUCKET,
          objectKey: uploadResult.objectKey,
          url: uploadResult.url,
          title: metadata.title ?? null,
          isPrimary: metadata.isPrimary,
        },
      });

      res.status(201).json({ mediaAsset });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid media payload", issues: error.issues });
        return;
      }

      console.error("Failed to upload exercise media", error);
      res.status(500).json({ message: "Failed to upload exercise media" });
    }
  },
);

adminExercisesRouter.delete("/exercises/:exerciseId/media/:mediaId", async (req: Request, res: Response) => {
  try {
    const exerciseId = getStringParam(req.params.exerciseId);
    const mediaId = getStringParam(req.params.mediaId);

    if (!exerciseId || !mediaId) {
      res.status(400).json({ message: "Exercise id and media id are required" });
      return;
    }

    const media = await prisma.exerciseMediaAsset.findUnique({
      where: { id: mediaId },
    });

    if (!media || media.exerciseId !== exerciseId) {
      res.status(404).json({ message: "Media asset not found" });
      return;
    }

    await prisma.exerciseMediaAsset.delete({
      where: { id: mediaId },
    });

    await deleteExerciseMedia(media.objectKey).catch(() => undefined);

    res.status(204).send();
  } catch (error) {
    console.error("Failed to delete exercise media", error);
    res.status(500).json({ message: "Failed to delete exercise media" });
  }
});

// ── Block items management ────────────────────────────────────────────────────
const blockItemsSchema = z.object({
  items: z.array(
    z.object({
      exerciseId: z.string().min(1),
      order: z.number().int().min(0),
      setsOverride: z.number().int().positive().nullable().optional(),
      repsOverride: z.string().trim().nullable().optional(),
      notes: z.string().trim().nullable().optional(),
    }),
  ),
});

adminExercisesRouter.put("/exercises/:id/block-items", async (req: Request, res: Response) => {
  try {
    const exerciseId = getStringParam(req.params.id);
    if (!exerciseId) {
      res.status(400).json({ message: "Exercise id is required" });
      return;
    }

    const exercise = await prisma.exercise.findUnique({
      where: { id: exerciseId },
      select: { id: true, isBlock: true },
    });

    if (!exercise) {
      res.status(404).json({ message: "Exercise not found" });
      return;
    }

    const { items } = blockItemsSchema.parse(req.body);

    // Upsert the block header and replace all items atomically
    // Also set isBlock=true on the exercise in case it wasn't saved yet
    const block = await prisma.$transaction(async (tx) => {
      await tx.exercise.update({
        where: { id: exerciseId },
        data: { isBlock: true },
      });

      const blockRecord = await tx.exerciseBlock.upsert({
        where: { exerciseId },
        create: { exerciseId },
        update: {},
        select: { id: true },
      });

      await tx.exerciseBlockItem.deleteMany({ where: { blockId: blockRecord.id } });

      if (items.length > 0) {
        await tx.exerciseBlockItem.createMany({
          data: items.map((item) => ({
            blockId: blockRecord.id,
            exerciseId: item.exerciseId,
            order: item.order,
            setsOverride: item.setsOverride ?? null,
            repsOverride: item.repsOverride ?? null,
            notes: item.notes ?? null,
          })),
        });
      }

      return tx.exerciseBlock.findUnique({
        where: { id: blockRecord.id },
        include: {
          items: {
            orderBy: { order: "asc" },
            include: {
              exercise: { select: { id: true, name: true, slug: true, category: true } },
            },
          },
        },
      });
    });

    res.json({ block });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: "Invalid payload", issues: error.issues });
      return;
    }
    console.error("Failed to update block items", error);
    res.status(500).json({ message: "Failed to update block items" });
  }
});

// ── Populate exercise GIFs from local CSV (omercotkd/exercises-gifs) ─────────

const GIF_CDN_BASE = "https://raw.githubusercontent.com/omercotkd/exercises-gifs/main/assets";

// Spanish exercise name → English keyword used to search exercises.csv
const EXERCISE_MAP: Record<string, string> = {
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

type MediaSource = "exercisedb" | "fitnessprogramer" | "fitsw" | "master";

interface ExerciseDbCandidate {
  name: string;
  /** GIF URL — null for video-only sources */
  gifUrl: string | null;
  /** External video URL (YouTube) — null for GIF-only sources */
  videoUrl: string | null;
  bodyPart: string;
  target: string;
  secondaryMuscles: string[];
  instructions: string;
  source: MediaSource;
}

interface ExerciseSearchResult {
  exerciseId: string;
  slug: string;
  name: string;
  description: string | null;
  stepsEs: string | null;
  /** Best candidate if score is strong (≥ 0.7); null otherwise */
  autoMatch: ExerciseDbCandidate | null;
  /** Remaining candidates sorted by score — up to 4 */
  candidates: ExerciseDbCandidate[];
  hasMedia: boolean;
  existingUrls: string[];
}

// ── CSV helpers ────────────────────────────────────────────────────────────────

interface CsvRow {
  id: string;
  name: string;
  bodyPart: string;
  target: string;
  secondaryMuscles: string[];
  instructions: string[];
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === "," && !inQ) {
      fields.push(cur); cur = "";
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

let _csvRows: CsvRow[] | null = null;

function getCsvRows(): CsvRow[] {
  if (_csvRows) return _csvRows;
  const csvPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../data/exercises.csv",
  );
  const lines = readFileSync(csvPath, "utf-8").split(/\r?\n/).filter((l) => l.trim().length > 0);
  const header = parseCsvLine(lines[0]!);
  const idxId = header.indexOf("id");
  const idxName = header.indexOf("name");
  const idxBodyPart = header.indexOf("bodyPart");
  const idxTarget = header.indexOf("target");
  const instrCols = header
    .map((c, i) => (c.startsWith("instructions/") ? { i, n: parseInt(c.split("/")[1]!, 10) } : null))
    .filter((x): x is { i: number; n: number } => x !== null)
    .sort((a, b) => a.n - b.n);
  const secMusCols = header
    .map((c, i) => (c.startsWith("secondaryMuscles/") ? { i, n: parseInt(c.split("/")[1]!, 10) } : null))
    .filter((x): x is { i: number; n: number } => x !== null)
    .sort((a, b) => a.n - b.n);
  _csvRows = lines.slice(1).map((line) => {
    const f = parseCsvLine(line);
    return {
      id: f[idxId]?.trim() ?? "",
      name: f[idxName]?.trim() ?? "",
      bodyPart: f[idxBodyPart]?.trim() ?? "",
      target: f[idxTarget]?.trim() ?? "",
      secondaryMuscles: secMusCols.map(({ i }) => f[i]?.trim()).filter((v): v is string => !!v),
      instructions: instrCols.map(({ i }) => f[i]?.trim()).filter((v): v is string => !!v),
    };
  });
  return _csvRows;
}

function normWords(s: string): string[] {
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

function f1Score(keyword: string, rowName: string): number {
  const kw = normWords(keyword);
  const rw = normWords(rowName);
  if (kw.length === 0 || rw.length === 0) return 0;
  const rwSet = new Set(rw);
  const m = kw.filter((w) => rwSet.has(w)).length;
  if (m === 0) return 0;
  const p = m / kw.length;
  const r = m / rw.length;
  return (2 * p * r) / (p + r);
}

function csvRowToCandidate(r: CsvRow): ExerciseDbCandidate {
  return {
    name: r.name,
    gifUrl: `${GIF_CDN_BASE}/${r.id}.gif`,
    videoUrl: null,
    bodyPart: r.bodyPart,
    target: r.target,
    secondaryMuscles: r.secondaryMuscles,
    instructions: r.instructions.join(" "),
    source: "exercisedb",
  };
}

/**
 * Returns up to `limit` CSV candidates for `keyword`, sorted by score desc.
 * `auxText` is optional extra text (Spanish description + steps from DB) used as
 * secondary signal via cross-language cognate matching (gym terms like "squat",
 * "press", "curl" survive the language boundary).
 */
function searchCsvCandidates(keyword: string, limit = 5, auxText = "", threshold = 0.25): ExerciseDbCandidate[] {
  const rows = getCsvRows();

  // Multi-signal score: take the MAX of three signals so any strong match wins
  const scoreRow = (r: CsvRow): number => {
    // Primary: keyword vs CSV exercise name
    const nameScore = f1Score(keyword, r.name);
    // Secondary: keyword vs CSV instructions (EN-EN; helps when names differ but movements match)
    const keywordVsInstr = f1Score(keyword, r.instructions.join(" ")) * 0.55;
    // Tertiary: Spanish aux text vs CSV name (cross-lang cognates for gym terms)
    const auxVsName = auxText ? f1Score(auxText, r.name) * 0.5 : 0;
    return Math.max(nameScore, keywordVsInstr, auxVsName);
  };

  const THRESHOLD = threshold;

  // Exact match wins immediately
  const exact = rows.find((r) => r.name.toLowerCase() === keyword.toLowerCase());
  if (exact) {
    const top: ExerciseDbCandidate[] = [csvRowToCandidate(exact)];
    // Fill remaining slots with multi-signal matches (skip the exact row)
    const rest = rows
      .filter((r) => r !== exact)
      .map((r) => ({ r, s: scoreRow(r) }))
      .filter(({ s }) => s >= THRESHOLD)
      .sort((a, b) => b.s - a.s)
      .slice(0, limit - 1)
      .map(({ r }) => csvRowToCandidate(r));
    return [...top, ...rest];
  }
  return rows
    .map((r) => ({ r, s: scoreRow(r) }))
    .filter(({ s }) => s >= THRESHOLD)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map(({ r }) => csvRowToCandidate(r));
}

// ── Additional CSV sources ─────────────────────────────────────────────────────

// Source 2: fitnessprogramer gifs.csv  (targetMuscle, title, src)
type GifsRow = { title: string; targetMuscle: string; src: string };
let _gifsRows: GifsRow[] | null = null;
function getGifsRows(): GifsRow[] {
  if (_gifsRows) return _gifsRows;
  const csvPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../data/gifs.csv");
  const lines = readFileSync(csvPath, "utf-8").split(/\r?\n/).filter((l) => l.trim().length > 0);
  const header = parseCsvLine(lines[0] ?? "");
  const iTitle = header.indexOf("title");
  const iTgt = header.indexOf("targetMuscle");
  const iSrc = header.indexOf("src");
  const rows: GifsRow[] = lines.slice(1).map((line) => {
    const f = parseCsvLine(line);
    return { title: f[iTitle]?.trim() ?? "", targetMuscle: f[iTgt]?.trim() ?? "", src: f[iSrc]?.trim() ?? "" };
  }).filter((r) => r.title && r.src);
  _gifsRows = rows;
  return rows;
}

// Source 3: fitsw exercise_list.csv  (id, name, equipment, level, muscle, previewSrc, videoLink)
type ExListRow = { name: string; muscle: string; previewSrc: string; videoLink: string };
let _exListRows: ExListRow[] | null = null;
function getExListRows(): ExListRow[] {
  if (_exListRows) return _exListRows;
  const csvPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../data/exercise_list.csv");
  const lines = readFileSync(csvPath, "utf-8").split(/\r?\n/).filter((l) => l.trim().length > 0);
  const header = parseCsvLine(lines[0] ?? "");
  const iName = header.indexOf("name");
  const iMuscle = header.indexOf("muscle");
  const iPreview = header.indexOf("previewSrc");
  const iVideo = header.indexOf("videoLink");
  const rows: ExListRow[] = lines.slice(1).map((line) => {
    const f = parseCsvLine(line);
    return {
      name: f[iName]?.trim() ?? "",
      muscle: f[iMuscle]?.trim() ?? "",
      previewSrc: f[iPreview]?.trim() ?? "",
      videoLink: f[iVideo]?.trim() ?? "",
    };
  }).filter((r) => r.name && (r.previewSrc || r.videoLink));
  _exListRows = rows;
  return rows;
}

// Source 4: exercises-master.csv  (name, Category, videoUrl)
type MasterRow = { name: string; category: string; videoUrl: string };
let _masterRows: MasterRow[] | null = null;
function getMasterRows(): MasterRow[] {
  if (_masterRows) return _masterRows;
  const csvPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../data/exercises-master.csv");
  const lines = readFileSync(csvPath, "utf-8").split(/\r?\n/).filter((l) => l.trim().length > 0);
  const header = parseCsvLine(lines[0] ?? "");
  const iName = header.indexOf("name");
  const iCat = header.findIndex((h) => h.toLowerCase() === "category");
  const iUrl = header.indexOf("videoUrl");
  const rows: MasterRow[] = lines.slice(1).map((line) => {
    const f = parseCsvLine(line);
    return { name: f[iName]?.trim() ?? "", category: f[iCat]?.trim() ?? "", videoUrl: f[iUrl]?.trim() ?? "" };
  }).filter((r) => r.name && r.videoUrl);
  _masterRows = rows;
  return rows;
}

/**
 * Search all 4 sources and return up to `perSource` candidates per source,
 * sorted by name-F1 score descending within each source.
 * Sources 2–4 use name-only scoring (no instructions available).
 */
function searchAllSources(keyword: string, perSource = 3, auxText = "", threshold = 0.25): ExerciseDbCandidate[] {
  // Source 1: ExerciseDB (multi-signal scoring)
  const src1 = searchCsvCandidates(keyword, perSource, auxText, threshold);

  const nameScore = (name: string) => f1Score(keyword, name);

  // Source 2: fitnessprogramer
  const src2: ExerciseDbCandidate[] = getGifsRows()
    .map((r) => ({ r, s: nameScore(r.title) }))
    .filter(({ s }) => s >= threshold)
    .sort((a, b) => b.s - a.s)
    .slice(0, perSource)
    .map(({ r }) => ({
      name: r.title, gifUrl: r.src, videoUrl: null,
      bodyPart: "", target: r.targetMuscle, secondaryMuscles: [], instructions: "",
      source: "fitnessprogramer" as MediaSource,
    }));

  // Source 3: fitsw
  const src3: ExerciseDbCandidate[] = getExListRows()
    .map((r) => ({ r, s: nameScore(r.name) }))
    .filter(({ s }) => s >= threshold)
    .sort((a, b) => b.s - a.s)
    .slice(0, perSource)
    .map(({ r }) => ({
      name: r.name, gifUrl: r.previewSrc || null, videoUrl: r.videoLink || null,
      bodyPart: "", target: r.muscle, secondaryMuscles: [], instructions: "",
      source: "fitsw" as MediaSource,
    }));

  // Source 4: exercises-master (video only)
  const src4: ExerciseDbCandidate[] = getMasterRows()
    .map((r) => ({ r, s: nameScore(r.name) }))
    .filter(({ s }) => s >= threshold)
    .sort((a, b) => b.s - a.s)
    .slice(0, perSource)
    .map(({ r }) => ({
      name: r.name, gifUrl: null, videoUrl: r.videoUrl,
      bodyPart: "", target: r.category, secondaryMuscles: [], instructions: "",
      source: "master" as MediaSource,
    }));

  // Merge in priority order, dedup by (source, name)
  const seen = new Set<string>();
  const merged: ExerciseDbCandidate[] = [];
  for (const c of [...src1, ...src2, ...src3, ...src4]) {
    const key = `${c.source}:${c.name.toLowerCase()}`;
    if (!seen.has(key)) { seen.add(key); merged.push(c); }
  }
  return merged;
}

// GET /exercises/browse-gifs — paginated CSV search for a specific exercise
// Query params: exerciseId (to auto-use exercise name), q (custom keyword), page, pageSize
adminExercisesRouter.get("/exercises/browse-gifs", async (req: Request, res: Response) => {
  const exerciseId = typeof req.query.exerciseId === "string" ? req.query.exerciseId.trim() : "";
  const qParam = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 24));

  let keyword = qParam;
  if (!keyword && exerciseId) {
    const ex = await prisma.exercise.findUnique({ where: { id: exerciseId }, select: { name: true } });
    keyword = ex?.name ?? "";
  }
  if (!keyword) {
    res.status(400).json({ message: "exerciseId or q is required" });
    return;
  }

  // Use low threshold (0.1) and large per-source to surface more results
  const all = searchAllSources(keyword, 40, "", 0.1);
  const total = all.length;
  const results = all.slice((page - 1) * pageSize, page * pageSize);
  res.json({ keyword, total, page, pageSize, results });
});

// POST /exercises/populate-gifs/search — dry-run: find candidates per exercise (CSV-based, no DB writes)
adminExercisesRouter.post("/exercises/populate-gifs/search", async (_req: Request, res: Response) => {
  const exercises = await prisma.exercise.findMany({
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      mediaAssets: { select: { url: true } },
      instructions: { where: { locale: "es" }, select: { steps: true }, take: 1 },
    },
    orderBy: { name: "asc" },
  });

  const results: ExerciseSearchResult[] = [];

  for (const ex of exercises) {
    const keyword = EXERCISE_MAP[ex.name] ?? ex.name;
    // Combine description + Spanish steps as auxiliary text for cross-language scoring
    const auxText = [ex.description ?? "", ex.instructions[0]?.steps ?? ""].filter(Boolean).join(" ");
    const all = searchAllSources(keyword, 3, auxText);
    const first = all[0] ?? null;
    // Auto-match only for ExerciseDB source with strong name overlap (F1 ≥ 0.7) or exact hit
    const autoMatch =
      first &&
      first.source === "exercisedb" &&
      (first.name.toLowerCase() === keyword.toLowerCase() || f1Score(keyword, first.name) >= 0.7)
        ? first
        : null;
    const rest = autoMatch ? all.slice(1, 5) : all.slice(0, 4);
    results.push({
      exerciseId: ex.id,
      slug: ex.slug,
      name: ex.name,
      description: ex.description ?? null,
      stepsEs: ex.instructions[0]?.steps ?? null,
      autoMatch,
      candidates: rest,
      hasMedia: ex.mediaAssets.length > 0,
      existingUrls: ex.mediaAssets.map((m) => m.url).filter((u): u is string => u !== null),
    });
  }

  res.json({ results });
});

// POST /exercises/populate-gifs/translate — proxy to MyMemory free translation (ES→EN)
adminExercisesRouter.post("/exercises/populate-gifs/translate", async (req: Request, res: Response) => {
  const schema = z.object({ text: z.string().min(1).max(1000) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid payload" });
    return;
  }
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(parsed.data.text)}&langpair=es|en`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!resp.ok) { res.status(502).json({ message: "Translation service error" }); return; }
    const data = await resp.json() as { responseData?: { translatedText?: string }; responseStatus?: number };
    if (data.responseStatus === 200 && data.responseData?.translatedText) {
      res.json({ translated: data.responseData.translatedText });
    } else {
      res.status(502).json({ message: "Translation failed" });
    }
  } catch {
    res.status(502).json({ message: "Translation service unavailable" });
  }
});

// POST /exercises/populate-gifs/apply — download + upload + save chosen media (GIFs and/or videos)
adminExercisesRouter.post("/exercises/populate-gifs/apply", async (req: Request, res: Response) => {
  const schema = z.array(
    z.object({
      exerciseId: z.string(),
      /** GIF URL to download and upload to MinIO. Null for video-only items. */
      gifUrl: z.string().url().nullable().optional(),
      /** External video URL to save directly (no download). Null for GIF-only items. */
      videoUrl: z.string().url().nullable().optional(),
      candidateName: z.string(),
    }).refine((d) => d.gifUrl || d.videoUrl, { message: "gifUrl or videoUrl is required" }),
  );

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid payload", issues: parsed.error.issues });
    return;
  }

  const items = parsed.data;
  const results: {
    exerciseId: string;
    status: "ok" | "skipped" | "error";
    message?: string;
    objectKey?: string;
  }[] = [];
  let ok = 0;
  let skipped = 0;
  let errors = 0;

  for (const item of items) {
    try {
      // Determine the canonical URL for duplicate-check
      const canonicalUrl = item.gifUrl ?? item.videoUrl ?? "";

      // Skip if this exact URL is already saved for this exercise
      const existing = await prisma.exerciseMediaAsset.findFirst({
        where: { exerciseId: item.exerciseId, url: canonicalUrl },
      });
      if (existing) {
        results.push({ exerciseId: item.exerciseId, status: "skipped", message: "URL already saved" });
        skipped++;
        continue;
      }

      // ── Video-only path (external URL, no MinIO upload) ─────────────────
      if (!item.gifUrl && item.videoUrl) {
        const hasPrimaryVideo = await prisma.exerciseMediaAsset.findFirst({
          where: { exerciseId: item.exerciseId, kind: "VIDEO", isPrimary: true },
        });
        await prisma.exerciseMediaAsset.create({
          data: {
            exerciseId: item.exerciseId,
            kind: "VIDEO",
            bucket: "external",
            objectKey: item.videoUrl,
            url: item.videoUrl,
            title: item.candidateName,
            isPrimary: !hasPrimaryVideo,
          },
        });
        results.push({ exerciseId: item.exerciseId, status: "ok", objectKey: item.videoUrl });
        ok++;
        console.log(`populate-gifs apply [${item.exerciseId}]: video saved → ${item.videoUrl}`);
        continue;
      }

      // ── GIF path (download + MinIO upload) ──────────────────────────────

      // Does the exercise already have a primary GIF?
      const hasPrimaryGif = await prisma.exerciseMediaAsset.findFirst({
        where: { exerciseId: item.exerciseId, kind: "GIF", isPrimary: true },
      });

      // Download GIF
      const gifRes = await fetch(item.gifUrl!);
      if (!gifRes.ok) throw new Error(`Download failed: ${gifRes.status}`);
      const data = Buffer.from(await gifRes.arrayBuffer());
      const contentType = gifRes.headers.get("content-type") ?? "image/gif";

      // Upload to MinIO
      const { objectKey, url } = await uploadExerciseMedia({
        exerciseId: item.exerciseId,
        fileName: "image.gif",
        contentType,
        data,
      });

      if (!hasPrimaryGif) {
        // No primary yet — demote any existing and mark this one primary
        await prisma.$transaction([
          prisma.exerciseMediaAsset.updateMany({
            where: { exerciseId: item.exerciseId, kind: "GIF", isPrimary: true },
            data: { isPrimary: false },
          }),
          prisma.exerciseMediaAsset.create({
            data: {
              exerciseId: item.exerciseId,
              kind: "GIF",
              bucket: env.MINIO_BUCKET,
              objectKey,
              url,
              title: item.candidateName,
              isPrimary: true,
            },
          }),
        ]);
      } else {
        // Already has a primary GIF — add this as extra (non-primary)
        await prisma.exerciseMediaAsset.create({
          data: {
            exerciseId: item.exerciseId,
            kind: "GIF",
            bucket: env.MINIO_BUCKET,
            objectKey,
            url,
            title: item.candidateName,
            isPrimary: false,
          },
        });
      }

      results.push({ exerciseId: item.exerciseId, status: "ok", objectKey });
      ok++;
      console.log(`populate-gifs apply [${item.exerciseId}]: ok → ${objectKey}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ exerciseId: item.exerciseId, status: "error", message });
      errors++;
      console.error(`populate-gifs apply [${item.exerciseId}]:`, err);
    }
  }

  res.json({ ok, skipped, errors, results });
});
