import { Directory, File, Paths } from "expo-file-system";
import { NativeModules, Platform } from "react-native";
import { assertOcrImageIdentity, maxArchivedOcrImageBytes, ocrEvidenceArchiveRecord, type OcrEvidenceArchiveInput } from "./ocrEvidenceRecord";

export type OcrEvidenceArchiveResult = { evidenceUri: string; retainedImageUri: string; archivalDurationMs: number; archivalError?: string };

// This bridge method hashes app-private files with a bounded stream. It does
// not decode the image, initialize a model, rerun OCR or send any network request.
export async function readOcrImageFileEvidence(uri: string): Promise<{ sha256: string; bytes: number }> {
  const bridge = NativeModules.HuKangPaddleOcr;
  if (Platform.OS !== "android" || typeof bridge?.fileEvidence !== "function") throw new Error("OCR_ARCHIVE_FILE_EVIDENCE_MODULE_UNAVAILABLE");
  const result = await bridge.fileEvidence(uri);
  const identity = { uri, sha256: result?.sha256 ?? "", bytes: result?.bytes ?? 0 };
  assertOcrImageIdentity(identity);
  return { sha256: identity.sha256, bytes: identity.bytes };
}

export async function archiveOcrEvidence(input: OcrEvidenceArchiveInput): Promise<OcrEvidenceArchiveResult> {
  const started = Date.now(), source = new File(input.imageUri);
  if (!source.exists || source.size <= 0 || source.size > maxArchivedOcrImageBytes) throw new Error("OCR_ARCHIVE_IMAGE_MISSING_OR_TOO_LARGE");
  const before = await readOcrImageFileEvidence(source.uri);
  if (input.expectedImageSha256 && input.expectedImageSha256 !== before.sha256) throw new Error("OCR_ARCHIVE_INPUT_SHA_MISMATCH");
  const evidenceId = `ocr-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const directory = new Directory(Paths.document, "ocr-evidence", evidenceId);
  directory.create({ intermediates: true });
  const retained = new File(directory, "input-image.bin");
  await source.copy(retained);
  const copied = await readOcrImageFileEvidence(retained.uri);
  const record = ocrEvidenceArchiveRecord(input, { evidenceId, createdAt: new Date().toISOString(), source: { uri: source.uri, ...before }, retained: { uri: retained.uri, ...copied } });
  const pending = new File(directory, "evidence.pending.json"), output = new File(directory, "evidence.json");
  pending.write(JSON.stringify(record, null, 2));
  await pending.move(output);
  return { evidenceUri: output.uri, retainedImageUri: retained.uri, archivalDurationMs: Date.now() - started, ...(record.missingMetadata.length ? { archivalError: `OCR_ARCHIVE_NATIVE_METADATA_INCOMPLETE:${record.missingMetadata.join(",")}` } : {}) };
}
