import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

// These mocks verify benchmark isolation and failure reporting only. They do not
// execute native image processing or measure OCR quality; Android evidence does.
const source = readFileSync(new URL("../src/ocrBenchmark.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const experiments = ["whole_png", "roi_png", "roi_jpeg", "padded_roi_png"];
const productionValues = { energyKj: 123, proteinG: null, fatG: null, carbohydrateG: null, sodiumMg: null };
function loadBenchmark({ unavailable = false, creationError = false, failOcr = null, missingVariant = null } = {}) {
  const calls = { native: [], production: [], ocr: [] };
  const native = {
    createOcrVariant: async () => ({ uri: "mock:gray" }),
    ...(!unavailable && { createBenchmarkImages: async (uri, crop) => {
      calls.native.push({ uri, crop });
      if (creationError) throw new Error("MOCK_BENCHMARK_DECODE_FAILED");
      return Object.fromEntries(experiments.filter(name => name !== missingVariant)
        .map(name => [name, { uri: `mock:${name}`, sampleSize: 1, encoding: name === "roi_jpeg" ? "jpeg_quality_97" : "png_lossless" }]));
    } }),
  };
  const imports = {
    "expo-asset": { Asset: { fromModule: name => ({ uri: `file:${name}`, downloadAsync: async () => {} }) } },
    "react-native": { NativeModules: { HuKangOcr: native }, Platform: { OS: "android" } },
    "./ocr": { recognizeDetailed: async uri => {
      calls.ocr.push(uri);
      if (uri === `mock:${failOcr}`) throw new Error("MOCK_OCR_FAILED");
      return { text: `unchanged raw ${uri}`, parserText: `parser input ${uri}`, lines: [], durationMs: 1, provider: "test-mock" };
    } },
    "./ocrGeometry": { estimateNutritionSlope: () => 0 },
    "./imagePreprocessing": { preprocessImageForOcr: async (uri, options = {}) => ({ uri: options.crop ? "mock:production_roi" : options.experimentalScale ? "mock:upscaled" : "mock:upright", width: 1280, height: 1700, steps: [] }) },
    "./parser": { parseNutritionLabel: rawText => ({ nutrients: { proteinG: 17 }, basisAmount: 25, basisUnit: "g", rawText, quality: {} }) },
    "./recognitionMerge": { nutritionVisionKeys: { energyKj: "energy_kj", proteinG: "protein_g", fatG: "fat_g", carbohydrateG: "carbohydrate_g", sodiumMg: "sodium_mg" } },
    "./nutritionRecognition": { recognizeNutrition: async (...args) => {
      calls.production.push(args);
      return { ocr: { text: "unchanged production raw" }, merged: { nutrients: productionValues, basisAmount: 100, basisUnit: "g" } };
    } },
    "./scanMetrics": { loadScanDebug: async () => ({}), saveScanDebug: async () => {} },
  };
  const module = { exports: {} };
  const mockRequire = name => {
    if (name.endsWith(".jpg")) return name;
    if (!(name in imports)) throw new Error(`Unexpected benchmark import ${name}`);
    return imports[name];
  };
  new Function("require", "module", "exports", compiled)(mockRequire, module, module.exports);
  return { run: () => module.exports.runRealNutritionBenchmark(() => {}, { vision: false }), calls };
}

test("encoding/context experiments keep independent raw evidence and cannot feed production", async () => {
  const { run, calls } = loadBenchmark();
  const result = await run();
  assert.equal(result.runs.length, 2);
  assert.equal(calls.native.length, 2);
  assert.deepEqual(calls.native.map(call => call.crop), [
    { originX: 280, originY: 700, width: 590, height: 420 },
    { originX: 300, originY: 50, width: 2350, height: 1280 },
  ]);
  assert.ok(calls.native.every(call => call.uri.endsWith(".jpg")));
  assert.ok(calls.production.every(args => args[0] === "mock:production_roi" && args[3].vision === false));
  for (const { stages } of result.runs) {
    assert.equal(stages.production.fields.energy_kj, 123);
    assert.equal(stages.production.fields.protein_g, null);
    assert.equal(stages.merged.fields.protein_g, null);
    for (const name of experiments) {
      const stage = stages[`experimental_${name}`];
      assert.equal(stage.status, "ok");
      assert.equal(stage.rawText, `unchanged raw mock:${name}`);
      assert.equal(stage.parserInput, `parser input mock:${name}`);
      assert.equal(stage.fields.protein_g, 17);
      assert.equal(stage.scope, "experimental_parser_only");
    }
  }
});

test("older bridge marks unexecuted encoding/context experiments not_run", async () => {
  const result = await loadBenchmark({ unavailable: true }).run();
  for (const { stages } of result.runs) {
    assert.equal(stages.production.status, "ok");
    for (const name of experiments) {
      assert.equal(stages[`experimental_${name}`].status, "not_run");
      assert.equal(stages[`experimental_${name}`].reason, "BENCHMARK_VARIANT_MODULE_UNAVAILABLE");
    }
  }
});

test("failed experimental decode preserves production and does not abort other controls", async () => {
  const result = await loadBenchmark({ creationError: true }).run();
  for (const { stages } of result.runs) {
    assert.equal(stages.production.status, "ok");
    assert.equal(stages.experimental_gray.status, "ok");
    for (const name of experiments) {
      assert.equal(stages[`experimental_${name}`].status, "error");
      assert.equal(stages[`experimental_${name}`].reason, "MOCK_BENCHMARK_DECODE_FAILED");
    }
  }
});

test("one failed or missing variant is separate from remaining image executions", async () => {
  const result = await loadBenchmark({ failOcr: "roi_jpeg", missingVariant: "whole_png" }).run();
  for (const { stages } of result.runs) {
    assert.equal(stages.experimental_whole_png.status, "error");
    assert.equal(stages.experimental_whole_png.reason, "BENCHMARK_VARIANT_FILE_MISSING");
    assert.equal(stages.experimental_roi_jpeg.status, "error");
    assert.equal(stages.experimental_roi_jpeg.reason, "MOCK_OCR_FAILED");
    assert.equal(stages.experimental_roi_png.status, "ok");
    assert.equal(stages.experimental_padded_roi_png.status, "ok");
    assert.equal(stages.production.status, "ok");
  }
});
