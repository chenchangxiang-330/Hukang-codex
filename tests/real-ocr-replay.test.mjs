import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {textInNutritionRows,estimateNutritionSlope} from '../src/ocrGeometry.ts';
import {parseNutritionLabel} from '../src/parser.ts';
import {mergeRecognitionResults} from '../src/recognitionMerge.ts';

// Archived actual Android ML Kit output, not a fabricated OCR fixture. Replay
// tests downstream geometry/parser only; they do not claim to rerun image OCR.
const baseline=JSON.parse(readFileSync(new URL('./fixtures/ocr/results/20261003-baseline-ba77a7e.json',import.meta.url),'utf8'));
const stage=(id,name)=>baseline.runs.find(run=>run.fixtureId===id).stages[name];
test('NRV is used only to flag contradictory candidates, never infer quantities',()=>{
  const valid=parseNutritionLabel('每100g NRV%\n蛋白质 3.6g 6%\n钠 58mg 3%');
  assert.deepEqual(valid.quality.suspectFields,[]);
  const bad=parseNutritionLabel('每100g NRV%\n蛋白质 36g 6%');
  assert.equal(bad.nutrients.proteinG,36); // faithful candidate, not fabricated 3.6
  assert.ok(bad.quality.suspectFields.includes('proteinG'));
  const missing=parseNutritionLabel('每100g NRV%\n蛋白质 6%');
  assert.equal(missing.nutrients.proteinG,null);
  assert.equal(parseNutritionLabel('每100g 蛋白质36g').nutrients.proteinG,36);
});
test('traditional sodium inside chemical names is not a nutrition row',()=>{
  for(const text of ['每100g 配料：谷氨酸钠100mg','每100g 配料：谷氨酸鈉100mg','每100g 配料：苯甲酸鈉25mg'])
    assert.equal(parseNutritionLabel(text).nutrients.sodiumMg,null);
  assert.equal(parseNutritionLabel('每100g 鈉42mg').nutrients.sodiumMg,42);
});
test('real skewed table rows retain the original OCR characters and native boxes',()=>{
  const source=stage('6923644266066','original'),before=JSON.stringify(source.lines);
  assert.ok(estimateNutritionSlope(source.lines)>.07);
  const text=textInNutritionRows(source.lines);
  assert.match(text,/蛋白质 36g 6%/);
  assert.match(text,/钠 58mg 3%\n120 mg 15%/);
  assert.equal(JSON.stringify(source.lines),before);
  const parsed=parseNutritionLabel(text);
  assert.equal(parsed.nutrients.sodiumMg,58);
  // Missing decimal points are an OCR defect, not permission to guess 3.6/4.4/5.
  assert.equal(parsed.nutrients.proteinG,36);
  assert.ok(parsed.quality.suspectFields.includes('proteinG'));
  const merged=mergeRecognitionResults(parsed);
  assert.equal(merged.nutrients.proteinG,null);
  assert.equal(merged.fields.proteinG.local,36);
  assert.equal(merged.fields.proteinG.status,'uncertain');
  assert.equal(parsed.nutrients.fatG,null);
  assert.equal(parsed.nutrients.carbohydrateG,null);
});
test('real original nutrition OCR parses explicit parenthesized units and traditional sodium',()=>{
  const source=stage('6937003117814','original');
  assert.equal(estimateNutritionSlope(source.lines),0);
  const parsed=parseNutritionLabel(textInNutritionRows(source.lines));
  assert.deepEqual([parsed.nutrients.energyKj,parsed.nutrients.proteinG,parsed.nutrients.fatG,parsed.nutrients.carbohydrateG,parsed.nutrients.sodiumMg],[2075,21,37.7,19,1248]);
  assert.equal(parsed.nutrients.addedSugarG,null);
  assert.equal(parsed.basisUnit,'g');
});
test('real cropped OCR extra digits are not deleted to manufacture correct values',()=>{
  const parsed=parseNutritionLabel(textInNutritionRows(stage('6937003117814','preprocessed').lines));
  assert.equal(parsed.nutrients.energyKj,null); // OCR says 干焦, not 千焦.
  assert.equal(parsed.nutrients.proteinG,null); // 21.0 3 (g)
  assert.equal(parsed.nutrients.fatG,null); // 37.7 5 (g)
  assert.equal(parsed.nutrients.carbohydrateG,19);
  assert.equal(parsed.nutrients.sodiumMg,1248);
});
