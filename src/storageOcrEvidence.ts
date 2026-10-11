import type { OcrResult } from "./ocr";
import type { Nutrients } from "./types";

export type StorageOcrResult = OcrResult & {
  engine: "paddle"; imageUri: string; imageSha256: string; nativeDurationMs: number;
  models: Array<{ file: string; sha256: string; bytes: number }>;
  inputImage: { width: number; height: number; coordinateSpace: string };
  versions: Record<string, unknown>;
  evidenceUri: string; retainedImageUri: string; archivalDurationMs: number;
};
export type RealStorageOcrCandidate = {
  fixtureId: string; ocr: StorageOcrResult; originalOcr: StorageOcrResult | null;
  vision: unknown; basisAmount: number; basisUnit: string; nutrients: Nutrients;
};
const publicFixtureIds = new Set(["6923644266066", "6937003117814"]);
const keys: (keyof Nutrients)[] = ["energyKcal", "energyKj", "proteinG", "fatG", "saturatedFatG", "transFatG", "carbohydrateG", "totalSugarG", "addedSugarG", "fiberG", "sodiumMg"];
const blocked = new Set(["conflict", "basis_conflict", "basis_unverified", "uncertain"]);
const object = (value: unknown): Record<string, any> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("STORAGE_REAL_OCR_INVALID_RECORD");
  return value as Record<string, any>;
};

function detailedOcr(value: unknown): StorageOcrResult {
  const ocr = object(value);
  if (ocr.engine !== "paddle" || typeof ocr.text !== "string" || !ocr.text.trim() ||
      typeof ocr.parserText !== "string" || !Array.isArray(ocr.lines) || ocr.lines.length === 0 ||
      typeof ocr.imageUri !== "string" || !ocr.imageUri.startsWith("file://") ||
      typeof ocr.imageSha256 !== "string" || !/^[a-f0-9]{64}$/i.test(ocr.imageSha256) ||
      !Number.isFinite(ocr.nativeDurationMs) || ocr.nativeDurationMs < 0 ||
      !Number.isFinite(ocr.durationMs) || ocr.durationMs < 0) throw new Error("STORAGE_REAL_OCR_METADATA_MISSING");
  if (ocr.archivalError || typeof ocr.evidenceUri !== "string" || !ocr.evidenceUri.startsWith("file://") ||
      typeof ocr.retainedImageUri !== "string" || !ocr.retainedImageUri.startsWith("file://") ||
      !Number.isFinite(ocr.archivalDurationMs) || ocr.archivalDurationMs < 0) throw new Error("STORAGE_REAL_OCR_ARCHIVE_MISSING");
  if (!Array.isArray(ocr.models) || ocr.models.length === 0 || ocr.models.some((model: any) =>
    typeof model.file !== "string" || !model.file || !/^[a-f0-9]{64}$/i.test(model.sha256 ?? "") || !Number.isFinite(model.bytes) || model.bytes <= 0)) {
    throw new Error("STORAGE_REAL_OCR_MODEL_IDENTITY_MISSING");
  }
  const image = object(ocr.inputImage), versions = object(ocr.versions);
  if (!Number.isFinite(image.width) || !Number.isFinite(image.height) || !(image.width > 0 && image.height > 0) || typeof image.coordinateSpace !== "string" || !image.coordinateSpace || !Object.keys(versions).length) {
    throw new Error("STORAGE_REAL_OCR_COORDINATE_OR_VERSION_MISSING");
  }
  for (const lineValue of ocr.lines) {
    const line = object(lineValue);
    if (typeof line.text !== "string" || ![line.left, line.top, line.right, line.bottom].every(Number.isFinite) ||
        !Array.isArray(line.polygon) || line.polygon.length !== 4 ||
        line.polygon.some((point: any) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
      throw new Error("STORAGE_REAL_OCR_GEOMETRY_MISSING");
    }
  }
  return ocr as StorageOcrResult;
}

// Read only matching, completed public-fixture execution evidence. This is a
// storage gate, not an OCR scorer and never consults annotated ground truth.
export function storageOcrCandidates(reportValue: unknown, expectedRunId: string, expectedCommit: string): RealStorageOcrCandidate[] {
  const report = object(reportValue);
  if (report.status !== "completed" || report.engine !== "paddle" || report.runId !== expectedRunId ||
      report.buildInfo?.sourceCommit !== expectedCommit || !Array.isArray(report.runs) || report.runs.length !== 2) {
    throw new Error("STORAGE_REAL_OCR_STALE_OR_INCOMPLETE");
  }
  const seen = new Set<string>();
  return report.runs.map((runValue: unknown) => {
    const run = object(runValue);
    if (!publicFixtureIds.has(run.fixtureId) || seen.has(run.fixtureId)) throw new Error("STORAGE_REAL_OCR_UNKNOWN_OR_DUPLICATE_FIXTURE");
    seen.add(run.fixtureId);
    if (run.stages?.production?.status !== "ok") throw new Error("STORAGE_REAL_OCR_PRODUCTION_NOT_COMPLETE");
    const result = object(run.stages.production.result), merged = object(result.merged);
    if (merged.basisConflict || !Number.isFinite(merged.basisAmount) || merged.basisAmount <= 0 ||
        !["g", "mL", "份", "包装"].includes(merged.basisUnit)) throw new Error("STORAGE_REAL_OCR_BASIS_UNCONFIRMED");
    const candidates = object(merged.nutrients), fields = object(merged.fields), nutrients = {} as Nutrients;
    for (const key of keys) {
      const value = candidates[key], field = object(fields[key]);
      if (value != null && (!Number.isFinite(value) || value < 0)) throw new Error("STORAGE_REAL_OCR_INVALID_NUTRIENT");
      // Unresolved candidates stay empty; a storage test cannot stand in for
      // the user's choice in a field/basis conflict or uncertainty prompt.
      nutrients[key] = blocked.has(field.status) ? null : value ?? null;
    }
    return { fixtureId: run.fixtureId, ocr: detailedOcr(result.ocr), originalOcr: result.originalOcr == null ? null : detailedOcr(result.originalOcr), vision: result.vision ?? null, basisAmount: merged.basisAmount, basisUnit: merged.basisUnit, nutrients };
  });
}
