export type ExerciseEvolutionValue = "WEIGHT" | "TIME" | "VELOCITY" | "HYBRID";
export type ExerciseZoneValue = "LOWER" | "UPPER" | "CORE" | "FULL";

const headerAliases: Record<string, string> = {
  day: "day",
  dia: "day",
  "d\u00eda": "day",

  name: "name",
  nombre: "name",
  ejercicio: "name",

  sets: "sets",
  series: "sets",

  reps: "repsOrTime",
  tiempo: "repsOrTime",
  "reps/tiempo": "repsOrTime",
  "reps-tiempo": "repsOrTime",
  "repstime": "repsOrTime",

  description: "description",
  descripcion: "description",
  "descripci\u00f3n": "description",

  peso: "requiresWeight",
  "peso(y/n)": "requiresWeight",
  "weight(y/n)": "requiresWeight",
  weight: "requiresWeight",

  unilateral: "isUnilateral",
  "unilateral(y/n)": "isUnilateral",

  evolucion: "evolution",
  "evoluci\u00f3n": "evolution",
  evolution: "evolution",

  zona: "zone",
  zone: "zone",

  videourl: "videoUrl",
  video: "videoUrl",
  urlvideo: "videoUrl",
};

export interface ImportedExerciseTask {
  rowNumber: number;
  day: number;
  name: string;
  sets: number | null;
  repsOrTimeText: string | null;
  description: string | null;
  requiresWeight: boolean;
  isUnilateral: boolean;
  evolution: ExerciseEvolutionValue;
  zone: ExerciseZoneValue;
  videoUrl: string | null;
}

export interface ExerciseTaskImportIssue {
  rowNumber: number;
  column: string;
  message: string;
}

export interface ExerciseTaskImportResult {
  delimiter: string;
  tasks: ImportedExerciseTask[];
  issues: ExerciseTaskImportIssue[];
  warnings: string[];
}

function normalizeToken(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function splitLine(line: string, delimiter: string) {
  const output: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === delimiter) {
      output.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  output.push(current.trim());
  return output;
}

function detectDelimiter(sampleLine: string) {
  const candidates = [",", ";", "\t", "|"];
  let selected = ",";
  let score = -1;

  for (const candidate of candidates) {
    const pieces = splitLine(sampleLine, candidate);
    if (pieces.length > score) {
      score = pieces.length;
      selected = candidate;
    }
  }

  return selected;
}

function parseBooleanYN(value: string | undefined) {
  const normalized = normalizeToken(value ?? "");

  if (["y", "yes", "si", "s", "1", "true"].includes(normalized)) {
    return true;
  }

  if (["n", "no", "0", "false", ""].includes(normalized)) {
    return false;
  }

  return null;
}

function parseEvolution(value: string | undefined) {
  const normalized = normalizeToken(value ?? "");

  if (["peso", "weight"].includes(normalized)) {
    return "WEIGHT";
  }

  if (["tiempo", "time"].includes(normalized)) {
    return "TIME";
  }

  if (["velocidad", "velocity"].includes(normalized)) {
    return "VELOCITY";
  }

  if (["hibrido", "hibirido", "hybrid"].includes(normalized)) {
    return "HYBRID";
  }

  return null;
}

function parseZone(value: string | undefined) {
  const normalized = normalizeToken(value ?? "");

  if (["lower", "tren inferior", "inferior"].includes(normalized)) {
    return "LOWER";
  }

  if (["upper", "tren superior", "superior"].includes(normalized)) {
    return "UPPER";
  }

  if (["core", "tronco"].includes(normalized)) {
    return "CORE";
  }

  if (["full", "fullbody", "cuerpo completo", "completo"].includes(normalized)) {
    return "FULL";
  }

  return null;
}

export function parseExerciseTaskBlock(content: string): ExerciseTaskImportResult {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));

  if (!lines.length) {
    return {
      delimiter: ",",
      tasks: [],
      issues: [{ rowNumber: 0, column: "content", message: "Input is empty." }],
      warnings: [],
    };
  }

  const firstLine = lines[0];
  if (!firstLine) {
    return {
      delimiter: ",",
      tasks: [],
      issues: [{ rowNumber: 1, column: "content", message: "Header line is missing." }],
      warnings: [],
    };
  }

  const delimiter = detectDelimiter(firstLine);
  const rawHeaders = splitLine(firstLine, delimiter);
  const headers = rawHeaders.map((header) => headerAliases[normalizeToken(header)] ?? normalizeToken(header));

  const requiredHeaders = ["day", "name"];
  const missingHeaders = requiredHeaders.filter((header) => !headers.includes(header));

  const issues: ExerciseTaskImportIssue[] = [];
  const warnings: string[] = [];

  if (missingHeaders.length) {
    return {
      delimiter,
      tasks: [],
      issues: missingHeaders.map((header) => ({
        rowNumber: 1,
        column: header,
        message: `Missing required column: ${header}`,
      })),
      warnings,
    };
  }

  const tasks: ImportedExerciseTask[] = [];

  for (let index = 1; index < lines.length; index += 1) {
    const rowNumber = index + 1;
    const line = lines[index];
    if (!line) {
      continue;
    }

    const columns = splitLine(line, delimiter);
    const row: Record<string, string> = {};

    headers.forEach((header, columnIndex) => {
      row[header] = columns[columnIndex] ?? "";
    });

    const day = Number.parseInt(row.day ?? "", 10);
    if (!Number.isFinite(day) || day <= 0) {
      issues.push({ rowNumber, column: "day", message: "Day must be a positive integer." });
      continue;
    }

    const name = (row.name ?? "").trim();
    if (!name) {
      issues.push({ rowNumber, column: "name", message: "Name is required." });
      continue;
    }

    let sets: number | null = null;
    if ((row.sets ?? "").trim().length) {
      const parsedSets = Number.parseInt(row.sets ?? "", 10);
      if (!Number.isFinite(parsedSets) || parsedSets <= 0) {
        issues.push({ rowNumber, column: "sets", message: "Sets must be a positive integer when provided." });
        continue;
      }
      sets = parsedSets;
    }

    const requiresWeight = parseBooleanYN(row.requiresWeight);
    if (requiresWeight === null) {
      issues.push({ rowNumber, column: "requiresWeight", message: "Weight must be Y/N, Yes/No, or 1/0." });
      continue;
    }

    const isUnilateral = parseBooleanYN(row.isUnilateral);
    if (isUnilateral === null) {
      issues.push({ rowNumber, column: "isUnilateral", message: "Unilateral must be Y/N, Yes/No, or 1/0." });
      continue;
    }

    const evolution = parseEvolution(row.evolution);
    if (!evolution) {
      issues.push({ rowNumber, column: "evolution", message: "Evolution must be Weight, Time, Velocity, or Hybrid." });
      continue;
    }

    const zone = parseZone(row.zone);
    if (!zone) {
      issues.push({ rowNumber, column: "zone", message: "Zone must be Lower, Upper, Core, or Full." });
      continue;
    }

    const repsOrTimeText = (row.repsOrTime ?? "").trim() || null;
    const description = (row.description ?? "").trim() || null;
    const videoUrl = (row.videoUrl ?? "").trim() || null;

    tasks.push({
      rowNumber,
      day,
      name,
      sets,
      repsOrTimeText,
      description,
      requiresWeight,
      isUnilateral,
      evolution,
      zone,
      videoUrl,
    });
  }

  const unknownHeaders = rawHeaders.filter((header) => {
    const normalized = normalizeToken(header);
    return !headerAliases[normalized] && !["day", "name", "sets", "repsortime", "description", "requiresweight", "isunilateral", "evolution", "zone", "videourl"].includes(normalized.replace(/\s+/g, ""));
  });

  if (unknownHeaders.length) {
    warnings.push(`Unknown columns ignored: ${unknownHeaders.join(", ")}`);
  }

  return {
    delimiter,
    tasks,
    issues,
    warnings,
  };
}
