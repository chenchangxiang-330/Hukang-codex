import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const readSource = (name) =>
  readFileSync(new URL(`../src/${name}`, import.meta.url), "utf8");

test("photo persistence waits for both file copies before validation", () => {
  const source = readSource("scanning.ts");
  assert.match(source, /await new File\(uri\)\.copy\(original\)/);
  assert.match(source, /await new File\(rendered\.uri\)\.copy\(work\)/);
  assert.ok(
    source.indexOf("await new File(uri).copy(original)") <
      source.indexOf("const originalExists"),
  );
  assert.ok(
    source.indexOf("await new File(rendered.uri).copy(work)") <
      source.indexOf("const workExists"),
  );
});

test("photo pipeline records ready inputs and stage-aware errors", () => {
  const source = readSource("scanning.ts");
  for (const event of [
    "FILE_EXISTS",
    "FILE_SIZE",
    "IMAGE_PREPARE_SUCCESS",
    "OCR_INPUT_READY",
    "VISION_INPUT_READY",
  ]) {
    assert.ok(source.includes(`\"${event}\"`), event);
  }
  assert.match(source, /logScanError\(stage,error\)/);
});

test("OCR call failures are not swallowed", () => {
  for (const file of ["ProductRecognitionScreen.tsx", "RecognitionScreen.tsx"]) {
    const source = readSource(file);
    assert.match(source, /OCR_CALL_FAILED/, file);
    assert.match(source, /logScanError\([^\n]*ocr/i, file);
  }
});

