import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {stripTypeScriptTypes} from "node:module";
import {zeroNutrients} from "../src/types.ts";

// Run the actual pure aggregate from database.ts without loading Expo's native
// SQLite bridge into Node. No copied implementation or fake OCR is involved.
const dbSource=fs.readFileSync(new URL("../src/database.ts",import.meta.url),"utf8");
const aggregateSource=dbSource.match(/export function totalLogs\([\s\S]*?\n\}/)[0].replace(/^export /,"");
const totalLogs=Function("zeroNutrients",`${stripTypeScriptTypes(aggregateSource)}; return totalLogs;`)(zeroNutrients);
const appSource=fs.readFileSync(new URL("../App.tsx",import.meta.url),"utf8");

test("no intake records retains zero, not a fabricated missing-food total",()=>{
  assert.deepEqual(totalLogs([]),zeroNutrients());
});
test("unknown nutrition remains null, while an explicitly printed zero stays zero",()=>{
  const result=totalLogs([{...zeroNutrients(),energyKcal:null,energyKj:309,proteinG:null,fatG:0,carbohydrateG:null,sodiumMg:null,addedSugarG:null}]);
  assert.equal(result.energyKcal,null);assert.equal(result.energyKj,309);
  assert.equal(result.proteinG,null);assert.equal(result.fatG,0);
  assert.equal(result.carbohydrateG,null);assert.equal(result.sodiumMg,null);
  assert.equal(result.addedSugarG,null);
});
test("a partial recorded subtotal is not mislabelled as the complete daily total",()=>{
  const result=totalLogs([{...zeroNutrients(),proteinG:3.2,sodiumMg:42},{...zeroNutrients(),proteinG:null,sodiumMg:0}]);
  assert.equal(result.proteinG,null);assert.equal(result.sodiumMg,42);
  assert.equal(totalLogs([{...zeroNutrients(),proteinG:3.2},{...zeroNutrients(),proteinG:2}]).proteinG,5.2);
});
test("missing legacy or invalid numeric fields do not become a plausible zero",()=>{
  const result=totalLogs([{...zeroNutrients(),saturatedFatG:undefined,proteinG:NaN,sodiumMg:Infinity}]);
  assert.equal(result.saturatedFatG,null);assert.equal(result.proteinG,null);assert.equal(result.sodiumMg,null);
});
test("Today and prediction render unknown guards for every nutrient and suppress unknown protein advice",()=>{
  assert.match(appSource,/unknown=v==null/);
  assert.match(appSource,/energy==null\?'未记录':Math\.round\(energy\)/);
  assert.match(appSource,/cur==null\|\|add==null\?'未记录'/);
  assert.match(appSource,/if\(total\.proteinG!=null&&total\.proteinG<41&&logs\.length\)/);
  assert.doesNotMatch(appSource,/const cur=total\[m\.key\]\?\?0/);
});
