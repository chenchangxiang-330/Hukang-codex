import test from "node:test";
import assert from "node:assert/strict";
import { parseNutritionLabel } from "../src/parser.ts";
import { loadFixtures } from "../scripts/score-ocr-benchmark.mjs";

const mapping = { energy_kj: "energyKj", protein_g: "proteinG", fat_g: "fatG", carbohydrate_g: "carbohydrateG", sodium_mg: "sodiumMg" };
for (const fixture of loadFixtures()) {
  test(`Parser-only, manual transcription (NOT image OCR): ${fixture.fixtureId}`, () => {
    const parsed = parseNutritionLabel(fixture.manualTranscription);
    assert.equal(parsed.basisAmount, fixture.basis.amount);
    assert.equal(parsed.basisUnit, fixture.basis.unit);
    for (const [key, expected] of Object.entries(fixture.fields)) assert.equal(parsed.nutrients[mapping[key]], expected, key);
    assert.equal(parsed.nutrients.totalSugarG, null);
    assert.equal(parsed.nutrients.addedSugarG, null);
  });
}
