import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const STAGES = ["original", "preprocessed", "parser", "vision", "merged", "experimental_gray"];
export const CORE_FIELDS = ["energy_kj", "protein_g", "fat_g", "carbohydrate_g", "sodium_mg"];
const FIXTURE_DIRECTORY = resolve(dirname(fileURLToPath(import.meta.url)), "../tests/fixtures/ocr/nutrition");
const percentage = (numerator, denominator) => denominator ? Math.round(numerator / denominator * 10000) / 100 : null;
const numberMatches = (actual, expected) => typeof actual === "number" && Number.isFinite(actual) && Math.abs(actual - expected) < 0.000001;

export function loadFixtures(directory = FIXTURE_DIRECTORY) {
  return readdirSync(directory).filter(name => name.endsWith(".json")).sort()
    .map(name => JSON.parse(readFileSync(resolve(directory, name), "utf8")));
}

// This scorer never runs OCR and never substitutes ground truth for recognizer output.
export function scoreBenchmark(fixtures, runs = []) {
  const ids = new Set(fixtures.map(fixture => fixture.fixtureId));
  const byId = new Map();
  for (const run of runs) {
    if (!ids.has(run.fixtureId)) throw new Error(`Unknown fixture: ${run.fixtureId}`);
    if (byId.has(run.fixtureId)) throw new Error(`Duplicate run for ${run.fixtureId}; select one run explicitly`);
    byId.set(run.fixtureId, run);
  }
  const details = fixtures.map(fixture => {
    const run = byId.get(fixture.fixtureId);
    const stages = {};
    for (const name of STAGES) {
      const stage = run?.stages?.[name];
      const status = stage?.status ?? "not_run";
      if (!["ok", "error", "not_run"].includes(status)) throw new Error(`Invalid ${fixture.fixtureId}/${name} status: ${status}`);
      if (status === "not_run") {
        stages[name] = { status, reason: stage?.reason ?? "No execution record supplied", fields: [] };
        continue;
      }
      const values = status === "error" ? {} : (stage.fields ?? {});
      const fields = CORE_FIELDS.filter(key => fixture.fields[key] != null).map(key => {
        const actual = values[key] ?? null;
        const expected = fixture.fields[key];
        return { field: key, expected, actual, outcome: actual == null ? "missing" : numberMatches(actual, expected) ? "correct" : "wrong" };
      });
      const unsupportedFields = (fixture.notVisibleFields ?? []).filter(key => values[key] != null);
      const basis = stage.basis;
      const basisOutcome = basis == null ? "missing" : numberMatches(basis.amount, fixture.basis.amount) && basis.unit === fixture.basis.unit ? "correct" : "wrong";
      stages[name] = {
        status, scope: stage?.scope ?? null, reason: stage?.reason ?? stage?.error ?? null,
        fields, unsupportedFields, basisOutcome,
        // Keep raw evidence alongside score. It must come from the run, not the transcription.
        rawText: typeof stage?.rawText === "string" ? stage.rawText : null,
      };
    }
    return { fixtureId: fixture.fixtureId, evidence: run?.evidence ?? "not_supplied", stages };
  });
  const possibleFields = fixtures.reduce((total, fixture) => total + CORE_FIELDS.filter(key => fixture.fields[key] != null).length, 0);
  const summaries = {};
  for (const name of STAGES) {
    const stages = details.map(detail => detail.stages[name]);
    const attempted = stages.filter(stage => stage.status !== "not_run");
    const fields = attempted.flatMap(stage => stage.fields);
    const count = outcome => fields.filter(field => field.outcome === outcome).length;
    summaries[name] = {
      status: attempted.length === 0 ? "not_run" : attempted.length === fixtures.length ? "run" : "partial",
      totalImages: fixtures.length,
      attemptedImages: attempted.length,
      completedImages: stages.filter(stage => stage.status === "ok").length,
      failedImages: stages.filter(stage => stage.status === "error").length,
      notRunImages: stages.filter(stage => stage.status === "not_run").length,
      possibleFields, evaluatedFields: fields.length,
      correct: count("correct"), wrong: count("wrong"), missing: count("missing"),
      fieldAccuracyPercent: percentage(count("correct"), fields.length),
      fieldCoveragePercent: percentage(fields.length, possibleFields),
      unsupportedVisibleClaims: attempted.reduce((n, stage) => n + stage.unsupportedFields.length, 0),
      wrongBasisImages: attempted.filter(stage => stage.basisOutcome === "wrong").length,
      missingBasisImages: attempted.filter(stage => stage.basisOutcome === "missing").length,
      localOnlyImages: attempted.filter(stage => stage.scope === "local_only").length,
    };
  }
  return {
    schemaVersion: 1,
    metric: "Five visible core numeric fields; correct/evaluated. Missing stages are not evaluated. Explicit error attempts count as missing fields. Basis and unsupported claims reported separately.",
    warning: "A score is evidence only for the supplied execution records. Manual-transcription parser tests are not image OCR or Vision accuracy.",
    summaries, details,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const runs = process.argv.slice(2).flatMap(path => {
      const value = JSON.parse(readFileSync(path, "utf8"));
      return Array.isArray(value) ? value : Array.isArray(value.runs) ? value.runs : [value];
    });
    console.log(JSON.stringify(scoreBenchmark(loadFixtures(), runs), null, 2));
  } catch (error) {
    console.error(`Benchmark scoring failed: ${error.message}`);
    process.exitCode = 1;
  }
}
