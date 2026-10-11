export type OcrEvidenceArchiveInput = {
  imageUri: string; task: "general" | "nutrition";
  raw: Record<string, unknown>; parserInput: string;
  expectedImageSha256?: string;
};
export type OcrImageIdentity = { uri: string; sha256: string; bytes: number };
export const maxArchivedOcrImageBytes = 64 * 1024 * 1024;

export function assertOcrImageIdentity(identity: OcrImageIdentity) {
  if (!identity.uri.startsWith("file://") || !/^[a-f0-9]{64}$/i.test(identity.sha256) ||
      !Number.isFinite(identity.bytes) || identity.bytes <= 0 || identity.bytes > maxArchivedOcrImageBytes) {
    throw new Error("OCR_ARCHIVE_IMAGE_IDENTITY_INVALID");
  }
}

export function ocrEvidenceArchiveRecord(input: OcrEvidenceArchiveInput, context: {
  evidenceId: string; createdAt: string; source: OcrImageIdentity; retained: OcrImageIdentity;
}) {
  assertOcrImageIdentity(context.source); assertOcrImageIdentity(context.retained);
  if (context.source.sha256 !== context.retained.sha256 || context.source.bytes !== context.retained.bytes ||
      (input.expectedImageSha256 && input.expectedImageSha256 !== context.source.sha256)) throw new Error("OCR_ARCHIVE_IMAGE_CONTENT_MISMATCH");
  const missingMetadata: string[] = [];
  const markMissing = (key: string) => { if (!missingMetadata.includes(key)) missingMetadata.push(key); };
  for (const key of ["engine", "imageUri", "imageSha256", "inputImage", "models", "versions", "nativeDurationMs", "timings", "memory"] as const) {
    if (input.raw[key] == null) markMissing(key);
  }
  if (!Array.isArray(input.raw.lines)) markMissing("lines");
  if (input.raw.imageUri !== input.imageUri) markMissing("imageUri");
  if (input.raw.imageSha256 !== context.source.sha256) markMissing("imageSha256");
  if (!Array.isArray(input.raw.models) || input.raw.models.length === 0 || input.raw.models.some(model =>
    !model || typeof model.file !== "string" || !/^[a-f0-9]{64}$/i.test(model.sha256 ?? "") || !Number.isFinite(model.bytes) || model.bytes <= 0)) markMissing("models");
  if (!Number.isFinite(input.raw.nativeDurationMs) || Number(input.raw.nativeDurationMs) < 0) markMissing("nativeDurationMs");
  for (const key of ["inputImage", "versions", "timings", "memory"] as const) {
    const value = input.raw[key];
    if (!value || typeof value !== "object" || Array.isArray(value) || !Object.keys(value).length) markMissing(key);
  }
  return {
    schemaVersion: 1, status: missingMetadata.length ? "partial" : "completed",
    evidenceId: context.evidenceId, createdAt: context.createdAt, task: input.task,
    sourceInput: context.source, retainedInput: context.retained,
    // Raw/native and the exact parser input stay separate. There are no chosen
    // values, guessed decimals, annotation data or user confirmation in this file.
    raw: input.raw, parserInput: input.parserInput, missingMetadata,
  };
}
