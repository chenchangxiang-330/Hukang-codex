import test from "node:test";
import assert from "node:assert/strict";
import {parseNutritionLabel,parseIngredientsLabel,parseIngredients,parseDateLabel,expiryFromText,isLocalResultComplete} from "../src/parser.ts";
import {mergeRecognitionResults} from "../src/recognitionMerge.ts";

test("nutrition tolerates intact spaced labels, split decimal whitespace and leading printed units",()=>{
  const parsed=parseNutritionLabel("每100g 蛋 白 质(g) 3 . 2 脂肪(g)0 g 碳水化合物 5.8 g 钠(mg)42");
  assert.equal(parsed.nutrients.proteinG,3.2);
  assert.equal(parsed.nutrients.fatG,0);
  assert.equal(parsed.nutrients.carbohydrateG,5.8);
  assert.equal(parsed.nutrients.sodiumMg,42);
  assert.ok(parsed.quality.correctedFields.includes("proteinG"));
  assert.equal(parsed.rawText,"每100g 蛋 白 质(g) 3 . 2 脂肪(g)0 g 碳水化合物 5.8 g 钠(mg)42");
});
test("printed gram/milligram units are explicitly converted, not inferred",()=>{
  const parsed=parseNutritionLabel("每100g 钠0.042g 蛋白质3200mg 脂肪0g");
  assert.equal(parsed.nutrients.sodiumMg,42);
  assert.equal(parsed.nutrients.proteinG,3.2);
  assert.equal(parseNutritionLabel("每100g 钠42 蛋白质3.2").nutrients.sodiumMg,null);
});
test("saturated and trans fat remain independent and missing rows stay null",()=>{
  const parsed=parseNutritionLabel("每100g 脂肪3.6g 饱和脂肪酸2.1g 反式脂肪0g");
  assert.equal(parsed.nutrients.fatG,3.6);
  assert.equal(parsed.nutrients.saturatedFatG,2.1);
  assert.equal(parsed.nutrients.transFatG,0);
  assert.equal(parseNutritionLabel("每100g 脂肪3.6g").nutrients.saturatedFatG,null);
  const merged=mergeRecognitionResults(parsed,{basis:{amount:100,unit:"g"},nutrition:{saturated_fat_g:2.2,trans_fat_g:0}});
  assert.equal(merged.fields.saturatedFatG.status,"conflict");
  assert.equal(merged.nutrients.saturatedFatG,null);
  assert.equal(merged.fields.transFatG.status,"agreed");
});
test("ambiguous thousands separators and missing decimal points are never repaired by guessing",()=>{
  assert.equal(parseNutritionLabel("每100g 钠1, 000mg").nutrients.sodiumMg,null);
  assert.equal(parseNutritionLabel("每100g 蛋白质32g").nutrients.proteinG,32);
  assert.equal(parseNutritionLabel("每100g 蛋自质32q").nutrients.proteinG,null);
});
test("ingredient order, nested compounds and printed percentages survive splitting",()=>{
  const parsed=parseIngredientsLabel("配料表：水，复合调味料（食用盐、白砂糖、香辛料（胡椒、姜）），小麦粉（20%），酵母。营养成分表 每100g 蛋白质3.2g");
  assert.deepEqual(parsed.ingredients,["水","复合调味料(食用盐、白砂糖、香辛料(胡椒、姜))","小麦粉(20%)","酵母"]);
  assert.equal(parsed.quality.complete,true);
});
test("single explicitly labelled ingredient is complete but arbitrary OCR fragments are not",()=>{
  assert.equal(parseIngredientsLabel("配料：生牛乳").quality.complete,true);
  assert.equal(isLocalResultComplete("ingredients","配料：生牛乳"),true);
  assert.equal(parseIngredientsLabel("商品名称、地址").quality.complete,false);
  assert.equal(isLocalResultComplete("ingredients","商品名称、地址"),false);
});
test("OCR line wraps are preserved as word continuation with explicit review, not false separators",()=>{
  const parsed=parseIngredientsLabel("配料：小\n麦粉、复合调味料（盐、糖）\n保质期180天");
  assert.deepEqual(parsed.ingredients,["小麦粉","复合调味料(盐、糖)"]);
  assert.equal(parsed.quality.needsConfirmation,true);
  assert.ok(parsed.quality.issues.includes("INGREDIENTS_LINE_WRAP_REVIEW"));
  assert.deepEqual(parseIngredients("配料：水、糖 保质期6个月"),["水","糖"]);
});
test("damaged compound brackets require review instead of claiming reliable ingredients",()=>{
  const parsed=parseIngredientsLabel("配料：复合调味料（盐、糖、水");
  assert.equal(parsed.quality.complete,false);
  assert.ok(parsed.quality.issues.includes("INGREDIENTS_UNBALANCED_BRACKETS"));
});
test("production date and batch never become expiry by themselves",()=>{
  assert.equal(expiryFromText("包装日期2026-10-01 保质期30天"),null);
  assert.equal(expiryFromText("生产日期2026/10/1"),null);
  const parsed=parseDateLabel("批号20261001");
  assert.equal(parsed.batch,"20261001");
  assert.equal(parsed.expiryDate,null);
  assert.deepEqual(parsed.unclassifiedDates,[]);
  assert.equal(isLocalResultComplete("expiry","20261001"),false);
});
test("date roles are retained regardless of OCR row order",()=>{
  const parsed=parseDateLabel("有效期至2027/3/21 生产日期2026年9月21日 批次ABC123");
  assert.equal(parsed.productionDate,"2026-09-21");
  assert.equal(parsed.explicitExpiryDate,"2027-03-21");
  assert.equal(parsed.expiryDate,"2027-03-21");
  assert.equal(parsed.batch,"ABC123");
});
test("shelf-life days, months and years use production evidence and clamp month ends",()=>{
  assert.equal(expiryFromText("生产日期2026.01.31 保质期1个月"),"2026-02-28");
  assert.equal(expiryFromText("生产日期2024-02-29 保质期1年"),"2025-02-28");
  assert.equal(expiryFromText("生产日期2026/1/1 保质期180天"),"2026-06-30");
  assert.equal(expiryFromText("2026/1/1 保质期180天"),null);
  assert.equal(parseDateLabel("生产日期2026.01.31 保质期1个月").quality.needsConfirmation,true);
});
test("conflicting, invalid or unclassified date evidence cannot silently select an expiry",()=>{
  const conflict=parseDateLabel("生产日期2026-01-01 保质期6个月 有效期2026-08-01");
  assert.equal(conflict.expiryDate,null);
  assert.ok(conflict.quality.issues.includes("DATE_EXPIRY_COMPUTATION_CONFLICT"));
  assert.equal(parseDateLabel("EXP2026/2/30").expiryDate,null);
  assert.equal(parseDateLabel("20261001").expiryDate,null);
  assert.equal(parseDateLabel("生产日期2026-10-01 EXP2026-09-01").expiryDate,null);
  assert.equal(parseDateLabel("有效期见瓶盖\n说明请冷藏并及时食用\n2027/03/21").expiryDate,null);
  assert.equal(parseDateLabel("生产日期2026-10-01\n批次ABC123\n2027/03/21").expiryDate,null);
});
