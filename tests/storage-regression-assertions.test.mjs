import test from "node:test";
import assert from "node:assert/strict";
import { assertStorageValue, validateStorageRegressionRequest } from "../src/storageRegressionAssertions.ts";

test("storage regression rejects unsafe filenames and unspecified phases", () => {
  validateStorageRegressionRequest("write", "storage-20261004-123");
  validateStorageRegressionRequest("verify", "storage_20261004_123");
  for (const runId of ["", "short", "../user-data", "test/../../profile", "a".repeat(81), null]) {
    assert.throws(() => validateStorageRegressionRequest("write", runId), /STORAGE_RUN_ID_INVALID/);
  }
  assert.throws(() => validateStorageRegressionRequest("clear", "storage-123"), /STORAGE_PHASE_INVALID/);
});

test("native snapshot guard detects unknown-to-zero, basis, relationship and evidence loss", () => {
  const expected = { productId: 42, basisAmount: 125, basisUnit: "mL", nutrients: { proteinG: null, transFatG: 0, sodiumMg: 58 }, photoUri: "file:///files/marker.png", ocrRawText: "原始OCR\n蛋白质36g" };
  assertStorageValue("snapshot", { ocrRawText: expected.ocrRawText, photoUri: expected.photoUri, nutrients: { sodiumMg: 58, transFatG: 0, proteinG: null }, basisUnit: "mL", basisAmount: 125, productId: 42 }, expected);
  const changes = [
    { ...expected, nutrients: { ...expected.nutrients, proteinG: 0 } },
    { ...expected, basisAmount: 100 }, { ...expected, basisUnit: "g" },
    { ...expected, productId: 43 }, { ...expected, photoUri: null },
    { ...expected, ocrRawText: "Vision原文" },
  ];
  for (const actual of changes) assert.throws(() => assertStorageValue("snapshot", actual, expected), /STORAGE_ASSERTION_FAILED:snapshot/);
  assert.throws(() => assertStorageValue("snapshot", { ...expected, nutrients: { sodiumMg: 58, transFatG: 0 } }, expected), /STORAGE_ASSERTION_FAILED/);
});
