import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function validateOcrRun(result, expectedRunId) {
  if (!expectedRunId || result.runId !== expectedRunId)
    throw new Error("OCR run identity mismatch: refusing stale evidence");
  if (result.status !== "completed") throw new Error("OCR execution did not complete");
  const started = Date.parse(result.startedAt), completed = Date.parse(result.completedAt);
  if (!Number.isFinite(started) || !Number.isFinite(completed) || completed < started)
    throw new Error("Invalid OCR execution timestamps");
  if (result.runs?.length !== 2) throw new Error("Expected both real nutrition images");
  for (const run of result.runs) {
    if (run.evidence !== "device_mlkit_image_execution") throw new Error("OCR evidence not from device");
    for (const name of ["original", "preprocessed", "production"])
      if (run.stages?.[name]?.status !== "ok" || !run.stages[name].rawText)
        throw new Error(`${run.fixtureId}/${name}: OCR did not return real text`);
    if (run.stages?.vision?.status !== "not_run" || run.stages.vision.reason !== "CI_NO_VISION_KEY")
      throw new Error("CI must not claim Vision execution without a real key");
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  validateOcrRun(JSON.parse(readFileSync(process.argv[2], "utf8")), process.argv[3]);
  console.log("Fresh OCR run identity and completion verified.");
}
