import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateOcrRun } from "../scripts/validate-ocr-run.mjs";

const archived = JSON.parse(readFileSync(new URL("./fixtures/ocr/results/20261003-final-a49e85d.json", import.meta.url)));
const fresh = () => ({ ...structuredClone(archived), runId: "ocr-new", startedAt: "2026-10-04T01:00:00Z", completedAt: "2026-10-04T01:01:00Z" });
test("old completed files cannot satisfy a new OCR execution", () => {
  assert.throws(() => validateOcrRun(archived, "ocr-new"), /identity mismatch/);
  assert.throws(() => validateOcrRun({ ...fresh(), runId: "ocr-old" }, "ocr-new"), /identity mismatch/);
});
test("only a matching completed real-image run with ordered timestamps passes", () => {
  assert.doesNotThrow(() => validateOcrRun(fresh(), "ocr-new"));
  assert.throws(() => validateOcrRun({ ...fresh(), status: "error" }, "ocr-new"), /did not complete/);
  assert.throws(() => validateOcrRun({ ...fresh(), completedAt: "2026-10-03T01:00:00Z" }, "ocr-new"), /timestamps/);
  assert.throws(() => validateOcrRun({ ...fresh(), runs: [] }, "ocr-new"), /both real/);
});
