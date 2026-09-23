/** Normalise a card name for comparisons, search and the 2-copies-per-name rule. */
export function nameKey(name: string): string {
  return name
    .normalize("NFKC")
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[‐-―]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Display form: straight apostrophes, single spaces. */
export function cleanName(name: string): string {
  return name.normalize("NFKC").replace(/[‘’ʼ]/g, "'").replace(/\s+/g, " ").trim();
}

/** "Stage1" → "Stage 1"; anything unknown → undefined. */
export function normaliseStage(stage: unknown): "Basic" | "Stage 1" | "Stage 2" | undefined {
  const s = String(stage ?? "").replace(/\s+/g, "").toLowerCase();
  if (s === "basic") return "Basic";
  if (s === "stage1") return "Stage 1";
  if (s === "stage2") return "Stage 2";
  return undefined;
}

/** Zero-pad a collector number: 81 → "081". */
export function padNumber(n: number | string): string {
  return String(Number(n)).padStart(3, "0");
}
