import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {parseNutritionLabel} from "../src/parser.ts";
import {textInNutritionRows} from "../src/ocrGeometry.ts";
import {mergeLocalOcrCandidates} from "../src/localOcrEvidence.ts";

// Replay archived Android ML Kit outputs. This tests evidence handling; it does
// not claim new on-device OCR execution or feed ground truth into recognition.
const baseline=JSON.parse(fs.readFileSync(new URL("./fixtures/ocr/results/20261003-baseline-ba77a7e.json",import.meta.url),"utf8"));
const sample=(id,stage)=>parseNutritionLabel(textInNutritionRows(baseline.runs.find(run=>run.fixtureId===id).stages[stage].lines));
const core=["energyKj","proteinG","fatG","carbohydrateG","sodiumMg"];

test("same-basis original image fills real cropped-table gaps as review candidates",()=>{
  const primary=sample("6937003117814","preprocessed"),original=sample("6937003117814","original");
  const before=JSON.stringify({primary,original}),merged=mergeLocalOcrCandidates(primary,original);
  assert.equal(merged.basisConflict,false);
  assert.deepEqual(core.map(key=>merged.parsed.nutrients[key]),[2075,21,37.7,19,1248]);
  for(const key of ["energyKj","proteinG","fatG"]){
    assert.equal(merged.fields[key].status,"original_only");
    assert.equal(merged.fields[key].primary,null);assert.equal(merged.fields[key].source,"original");
  }
  assert.ok(merged.parsed.quality.issues.includes("LOCAL_ORIGINAL_CANDIDATE"));
  assert.equal(merged.parsed.rawText,primary.rawText);
  assert.equal(JSON.stringify({primary,original}),before);
  assert.notEqual(merged.parsed.nutrients,primary.nutrients);
  assert.notEqual(merged.parsed.quality.issues,primary.quality.issues);
});
test("same-engine agreement can repeat real wrong 36g and never repairs it or boosts confidence",()=>{
  const original=sample("6923644266066","original"),primary={...original,nutrients:{...original.nutrients}};
  const merged=mergeLocalOcrCandidates(primary,original);
  assert.equal(merged.fields.proteinG.status,"agreed");assert.equal(merged.fields.proteinG.value,36);
  assert.equal(merged.parsed.nutrients.proteinG,36);
  assert.equal(merged.parsed.quality.suspectFields.includes("proteinG"),[...(original.quality.suspectFields??[]),...original.quality.correctedFields,...original.quality.ambiguousFields].includes("proteinG"));
  assert.equal(merged.fields.proteinG.source,"both");
  assert.equal(merged.parsed.quality.confidence,primary.quality.confidence);
});
test("numeric conflicts preserve both raw values and never guess a decimal or choose a winner",()=>{
  const primary=parseNutritionLabel("每100g 蛋白质32g"),original=parseNutritionLabel("每100g 蛋白质3.2g");
  const merged=mergeLocalOcrCandidates(primary,original);
  assert.deepEqual(merged.fields.proteinG,{primary:32,original:3.2,value:null,status:"conflict",source:null});
  assert.equal(merged.parsed.nutrients.proteinG,null);
  assert.ok(merged.parsed.quality.ambiguousFields.includes("proteinG"));
});
test("different or missing bases cannot mix fields or silently pick a table",()=>{
  const primary=parseNutritionLabel("每100g 蛋白质3.2g"),original=parseNutritionLabel("每30g 钠42mg");
  const different=mergeLocalOcrCandidates(primary,original);
  assert.equal(different.basisConflict,true);assert.equal(different.parsed.basisAmount,null);
  assert.equal(different.parsed.nutrients.proteinG,null);assert.equal(different.parsed.nutrients.sodiumMg,null);
  assert.deepEqual(different.fields.proteinG,{primary:3.2,original:null,value:null,status:"basis_conflict",source:null});
  const missing=mergeLocalOcrCandidates(primary,parseNutritionLabel("钠42mg"));
  assert.equal(missing.basisConflict,true);assert.equal(missing.fields.sodiumMg.original,42);
  assert.equal(missing.parsed.nutrients.sodiumMg,null);
});
test("normal equivalent g/mL basis spellings can compare, but original-unavailable preserves primary",()=>{
  const primary=parseNutritionLabel("每100mL 蛋白质3.2g");
  const original={...parseNutritionLabel("每100毫升 钠42mg"),basisUnit:"ml"};
  assert.equal(mergeLocalOcrCandidates(primary,original).basisConflict,false);
  const unavailable=mergeLocalOcrCandidates(primary,null);
  assert.equal(unavailable.basisConflict,false);
  assert.equal(unavailable.fields.proteinG.status,"primary_only");
  assert.equal(unavailable.parsed.nutrients.proteinG,3.2);
});
test("corrected, ambiguous or externally suspect evidence stays suspect even when values agree",()=>{
  const primary=parseNutritionLabel("每100g 蛋白质3.2g");
  const original=parseNutritionLabel("每100g 蛋白质3.2q");
  const merged=mergeLocalOcrCandidates(primary,original);
  assert.equal(merged.fields.proteinG.status,"agreed");
  assert.ok(merged.parsed.quality.suspectFields.includes("proteinG"));
  const prior={...primary,quality:{...primary.quality,suspectFields:["sodiumMg"]}};
  assert.ok(mergeLocalOcrCandidates(prior,null).parsed.quality.suspectFields.includes("sodiumMg"));
});
test("unknown in both images stays null, including unprinted added sugar",()=>{
  const primary=parseNutritionLabel("每100g 蛋白质3.2g"),original=parseNutritionLabel("每100g 蛋白质3.2g");
  const merged=mergeLocalOcrCandidates(primary,original);
  assert.deepEqual(merged.fields.addedSugarG,{primary:null,original:null,value:null,status:"unknown",source:null});
  assert.equal(merged.parsed.nutrients.addedSugarG,null);assert.equal(merged.parsed.nutrients.totalSugarG,null);
  assert.equal(merged.parsed.quality.suspectFields.includes("proteinG"),false);
  assert.equal(merged.parsed.quality.confidence,primary.quality.confidence);
});
