import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { loadFixtures, scoreBenchmark, STAGES } from "../scripts/score-ocr-benchmark.mjs";

const fixtures = loadFixtures();
const unitFixture = {
  fixtureId: "scorer-unit-test-only", basis: { amount: 100, unit: "g" },
  fields: { energy_kj: 100, protein_g: 3.2, fat_g: 0, carbohydrate_g: 5.8, sodium_mg: 42 },
  notVisibleFields: ["added_sugar_g"],
};

test("real benchmark images retain source bytes, attribution and valid manual ROI", () => {
  assert.equal(fixtures.length, 2);
  for (const fixture of fixtures) {
    const bytes = readFileSync(new URL(`./fixtures/ocr/nutrition/${fixture.image}`, import.meta.url));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), fixture.sha256);
    assert.equal(fixture.source.license, "CC-BY-SA-3.0");
    assert.ok(fixture.source.uploader);
    assert.ok(fixture.manualTranscription.includes("营养成分表"));
    const { originX, originY, width, height } = fixture.roi;
    assert.ok(originX >= 0 && originY >= 0 && width > 0 && height > 0);
    assert.ok(originX + width <= fixture.width && originY + height <= fixture.height);
  }
});

test("unexecuted image OCR and Vision are not_run, never a fabricated zero percent", () => {
  const report = scoreBenchmark(fixtures);
  for (const stage of STAGES) {
    const score = report.summaries[stage];
    assert.equal(score.status, "not_run");
    assert.equal(score.possibleFields, 10);
    assert.equal(score.evaluatedFields, 0);
    assert.equal(score.fieldAccuracyPercent, null);
    assert.equal(score.fieldCoveragePercent, 0);
  }
});

test("scorer distinguishes correct, incorrect, missing, zero and unsupported claims", () => {
  const run = { fixtureId: unitFixture.fixtureId, evidence: "scorer_unit_test", stages: {
    original: { status: "ok", fields: { energy_kj: 100, protein_g: 32, fat_g: 0, sodium_mg: "42", added_sugar_g: 5 }, basis: unitFixture.basis },
    vision: { status: "not_run", reason: "VISION_NOT_CONFIGURED" },
  } };
  const score = scoreBenchmark([unitFixture], [run]);
  assert.equal(score.summaries.original.correct, 2);
  assert.equal(score.summaries.original.wrong, 2);
  assert.equal(score.summaries.original.missing, 1);
  assert.equal(score.summaries.original.fieldAccuracyPercent, 40);
  assert.equal(score.summaries.original.unsupportedVisibleClaims, 1);
  assert.equal(score.summaries.original.wrongBasisImages, 0);
  assert.equal(score.summaries.vision.fieldAccuracyPercent, null);
  assert.equal(score.details[0].stages.vision.reason, "VISION_NOT_CONFIGURED");
});

test("missing fixture execution reduces coverage but does not silently become recognition failure", () => {
  const run = { fixtureId: fixtures[0].fixtureId, stages: { merged: { status: "ok", fields: fixtures[0].fields, scope: "local_only" } } };
  const merged = scoreBenchmark(fixtures, [run]).summaries.merged;
  assert.equal(merged.status, "partial");
  assert.equal(merged.fieldAccuracyPercent, 100);
  assert.equal(merged.fieldCoveragePercent, 50);
  assert.equal(merged.evaluatedFields, 5);
  assert.equal(merged.localOnlyImages, 1);
});

test("explicit execution failure counts as attempted with missing fields", () => {
  const run = { fixtureId: unitFixture.fixtureId, stages: { original: { status: "error", error: "OCR_FAILED" } } };
  const original = scoreBenchmark([unitFixture], [run]).summaries.original;
  assert.equal(original.failedImages, 1);
  assert.equal(original.missing, 5);
  assert.equal(original.fieldCoveragePercent, 100);
  assert.equal(original.fieldAccuracyPercent, 0);
});

test("scorer rejects unknown fixtures, ambiguous duplicate runs, and invalid status", () => {
  const run = { fixtureId: unitFixture.fixtureId, stages: {} };
  assert.throws(() => scoreBenchmark([unitFixture], [{ fixtureId: "unknown" }]), /Unknown fixture/);
  assert.throws(() => scoreBenchmark([unitFixture], [run, run]), /Duplicate run/);
  assert.throws(() => scoreBenchmark([unitFixture], [{ ...run, stages: { original: { status: "success" } } }]), /Invalid/);
});
