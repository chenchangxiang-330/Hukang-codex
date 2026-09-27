import test from "node:test";
import assert from "node:assert/strict";
import { parseNutritionLabel, nutritionCompleteness, isLocalResultComplete } from "../src/parser.ts";
import { mergeRecognitionResults } from "../src/recognitionMerge.ts";

const complete="营养成分表 每100mL 能量261kJ 蛋白质3.2g 脂肪3.6g 碳水化合物4.8g 钠50mg";
const remote=(nutrition,extra={})=>({basis:{amount:100,unit:"ml"},nutrition,uncertain_fields:[],...extra});

test("missing basis and unprinted energy units stay null",()=>{
  const p=parseNutritionLabel("能量261kJ 蛋白质3.2g");
  assert.equal(p.basisAmount,null);assert.equal(p.basisUnit,null);assert.equal(p.nutrients.energyKcal,null);
  assert.equal(nutritionCompleteness(p).complete,false);
});
test("values cannot leak from a following nutrient label",()=>{
  const p=parseNutritionLabel("每100g 能量 蛋白质\n脂肪3.6g 碳水化合物5.8g 钠42mg");
  assert.equal(p.nutrients.energyKj,null);assert.equal(p.nutrients.proteinG,null);
  assert.equal(p.nutrients.fatG,3.6);
});
test("NRV percentages alone are not nutrient quantities",()=>{
  const p=parseNutritionLabel("每100g 蛋白质6% 脂肪3.6g 6% 钠2%");
  assert.equal(p.nutrients.proteinG,null);assert.equal(p.nutrients.fatG,3.6);assert.equal(p.nutrients.sodiumMg,null);
});
test("unknown following nutrients do not contaminate the sodium row",()=>{
  const p=parseNutritionLabel("每100mL 钠58mg 3%\n钙120mg 15%");
  assert.equal(p.nutrients.sodiumMg,58);assert.deepEqual(p.quality.ambiguousFields,[]);
  assert.equal(parseNutritionLabel("每100mL 钠58mg 3% 钙120mg 15%").nutrients.sodiumMg,58);
  assert.equal(parseNutritionLabel("每100mL 钠\n钙120mg 15%").nutrients.sodiumMg,null);
});
test("saturated and trans fat rows cannot be mistaken for total fat",()=>{
  const p=parseNutritionLabel("每100g 脂肪3.6g 饱和脂肪2.1g 反式脂肪0g 碳水化合物4.8g");
  assert.equal(p.nutrients.fatG,3.6);
  assert.equal(parseNutritionLabel("每100g 饱和脂肪2.1g").nutrients.fatG,null);
});
test("bounded unit and digit correction is recorded and triggers fallback",()=>{
  const p=parseNutritionLabel(complete.replace("3.2g","3.2q").replace("50mg","5Omq"));
  assert.equal(p.nutrients.proteinG,3.2);assert.equal(p.nutrients.sodiumMg,50);
  assert.deepEqual(p.quality.correctedFields,["proteinG","sodiumMg"]);
  assert.equal(isLocalResultComplete("nutrition_label",p.rawText),false);
});
test("parser never guesses missing decimals or damaged Chinese labels",()=>{
  const p=parseNutritionLabel("每100g 蛋自质32q 碳水化台物58q 纳4Zmg");
  assert.equal(p.nutrients.proteinG,null);assert.equal(p.nutrients.carbohydrateG,null);assert.equal(p.nutrients.sodiumMg,null);
  const q=parseNutritionLabel("每100g 蛋白质32q");
  assert.equal(q.nutrients.proteinG,32);assert.ok(q.quality.correctedFields.includes("proteinG"));
});
test("negative values and unexplained numbers require confirmation",()=>{
  assert.equal(parseNutritionLabel("每100g 蛋白质-3.2g").nutrients.proteinG,null);
  assert.equal(parseNutritionLabel("每100g 蛋白质3.2g 6.4").nutrients.proteinG,null);
  assert.equal(parseNutritionLabel("每100g 蛋白质≤3.2g").nutrients.proteinG,null);
});
test("multiple nutrition columns are not automatically selected",()=>{
  const p=parseNutritionLabel("每100g 蛋白质3.2g 6% 6.4g 12%");
  assert.equal(p.nutrients.proteinG,null);assert.ok(p.quality.ambiguousFields.includes("proteinG"));
});
test("conflicting bases invalidate column assignment",()=>{
  const p=parseNutritionLabel("每100g 每30g 能量1200kJ 蛋白质8g");
  assert.equal(p.basisAmount,null);assert.equal(p.nutrients.energyKj,null);assert.equal(p.nutrients.proteinG,null);
  assert.ok(p.quality.issues.includes("MULTIPLE_BASIS"));
});
test("energy counts once and all five core groups plus basis are required",()=>{
  const p=parseNutritionLabel("每100g 能量261kJ / 62kcal 蛋白质3.2g");
  assert.equal(p.nutrients.energyKj,261);assert.equal(p.nutrients.energyKcal,62);
  assert.equal(nutritionCompleteness(p).fieldCount,2);assert.equal(nutritionCompleteness(p).complete,false);
  assert.equal(nutritionCompleteness(parseNutritionLabel(complete)).fieldCount,5);
  assert.equal(nutritionCompleteness(parseNutritionLabel(complete)).complete,true);
});
test("line breaks between row name and quantity are allowed without borrowing names",()=>{
  const p=parseNutritionLabel("营养成分表\n每100克\n蛋白质\n3.2 g\n6%\n脂肪\n0 g\n0%\n钠\n42 mg\n2%");
  assert.equal(p.nutrients.proteinG,3.2);assert.equal(p.nutrients.fatG,0);assert.equal(p.nutrients.sodiumMg,42);
});
test("sugar categories are independent; ingredient sugar is not a quantified row",()=>{
  const p=parseNutritionLabel("每100g 碳水化合物5.8g 总糖3g 配料：乳糖2g");
  assert.equal(p.nutrients.carbohydrateG,5.8);assert.equal(p.nutrients.totalSugarG,3);assert.equal(p.nutrients.addedSugarG,null);
});
test("explicit per-serving basis is retained without guessing grams",()=>{
  const p=parseNutritionLabel("每份 能量100kJ 蛋白质2g");
  assert.equal(p.basisAmount,1);assert.equal(p.basisUnit,"份");
  assert.equal(parseNutritionLabel("每g 蛋白质2g").basisAmount,null);
});
test("merge preserves agreeing evidence and fills missing candidates only",()=>{
  const local=parseNutritionLabel(complete.replace("钠50mg",""));
  const merged=mergeRecognitionResults(local,remote({protein_g:3.2,sodium_mg:50}));
  assert.equal(merged.fields.proteinG.status,"agreed");assert.equal(merged.nutrients.proteinG,3.2);
  assert.equal(merged.fields.sodiumMg.status,"vision_only");assert.equal(merged.nutrients.sodiumMg,50);
  assert.equal(merged.nutrients.fatG,3.6);assert.equal(merged.nutrients.addedSugarG,null);
});
test("conflicting values are exposed without selecting either source",()=>{
  const merged=mergeRecognitionResults(parseNutritionLabel(complete),remote({protein_g:32}));
  assert.deepEqual(merged.fields.proteinG,{local:3.2,vision:32,value:null,status:"conflict"});
  assert.equal(merged.needsConfirmation,true);
});
test("different bases never mix numbers",()=>{
  const merged=mergeRecognitionResults(parseNutritionLabel(complete),remote({protein_g:3.2},{basis:{amount:30,unit:"g"}}));
  assert.equal(merged.basisConflict,true);assert.equal(merged.basisAmount,null);
  assert.ok(Object.values(merged.nutrients).every(value=>value===null));
});
test("Vision numbers with no basis are retained as unverified candidates",()=>{
  const merged=mergeRecognitionResults(parseNutritionLabel(complete),remote({protein_g:3.2,fiber_g:2},{basis:null}));
  assert.equal(merged.fields.proteinG.status,"basis_unverified");assert.equal(merged.nutrients.proteinG,null);
  assert.equal(merged.fields.fiberG.vision,2);assert.equal(merged.nutrients.fiberG,null);
  assert.equal(merged.nutrients.fatG,3.6);
});
test("Vision basis cannot silently relabel local values with unknown basis",()=>{
  const merged=mergeRecognitionResults(parseNutritionLabel("蛋白质3.2g"),remote({sodium_mg:50}));
  assert.equal(merged.basisAmount,100);assert.equal(merged.fields.proteinG.status,"basis_unverified");
  assert.equal(merged.nutrients.proteinG,null);assert.equal(merged.nutrients.sodiumMg,50);
});
test("uncertain or low-confidence Vision values need explicit confirmation",()=>{
  const a=mergeRecognitionResults(parseNutritionLabel(complete),remote({protein_g:3.2},{uncertain_fields:["nutrition.protein_g"]}));
  assert.equal(a.fields.proteinG.status,"uncertain");assert.equal(a.nutrients.proteinG,null);
  const b=mergeRecognitionResults(parseNutritionLabel(complete),remote({fiber_g:2},{confidence:{fiber_g:.4}}));
  assert.equal(b.fields.fiberG.status,"uncertain");assert.equal(b.nutrients.fiberG,null);
});
test("missing Vision preserves local evidence and never creates missing nutrients",()=>{
  const merged=mergeRecognitionResults(parseNutritionLabel(complete),null);
  assert.equal(merged.nutrients.proteinG,3.2);assert.equal(merged.nutrients.energyKcal,null);
  assert.equal(merged.nutrients.addedSugarG,null);assert.equal(merged.basisUnit,"mL");
});
