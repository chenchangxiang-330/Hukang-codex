import test from "node:test";
import assert from "node:assert/strict";
import { textInReadingRows } from "../src/ocrGeometry.ts";
import { parseNutritionLabel } from "../src/parser.ts";
import { mergeRecognitionResults } from "../src/recognitionMerge.ts";
const line=(text,left,top,width=50)=>({text,left,top,right:left+width,bottom:top+20,confidence:.9});
test("OCR geometry reconstructs rows from column blocks without changing text",()=>{
  const lines=[line("蛋白质",0,0),line("钠",0,40),line("3.2g",100,1),line("42mg",100,41),line("6%",180,0),line("2%",180,40)];
  const original=JSON.stringify(lines);
  assert.equal(textInReadingRows(lines),"蛋白质 3.2g 6%\n钠 42mg 2%");
  assert.equal(JSON.stringify(lines),original);
});
test("ambiguous thousands separators are null, not invented decimals",()=>{
  const parsed=parseNutritionLabel("每100g 能量1,200kJ 蛋白质3.2g 脂肪0g 碳水化合物5g 钠1,000mg");
  assert.equal(parsed.nutrients.energyKj,null);assert.equal(parsed.nutrients.sodiumMg,null);
  assert.ok(parsed.quality.ambiguousFields.includes("sodiumMg"));
});
test("corrected local OCR stays a candidate requiring confirmation when Vision is absent",()=>{
  const merged=mergeRecognitionResults(parseNutritionLabel("每100g 蛋白质32q 钠4Omq"));
  assert.equal(merged.fields.proteinG.local,32);assert.equal(merged.fields.proteinG.value,null);
  assert.equal(merged.fields.proteinG.status,"uncertain");assert.equal(merged.fields.sodiumMg.value,null);
});
