import test from "node:test";
import assert from "node:assert/strict";
import { normalizeBarcode } from "../src/barcode.ts";
import { nutritionCompleteness, parseIngredients, parseNutritionLabel } from "../src/parser.ts";

test("normalizes whitespace and UPC/EAN variants while retaining raw input",()=>{
  const n=normalizeBarcode("  012345678905\n");
  assert.equal(n.raw,"  012345678905\n");
  assert.equal(n.normalized,"0012345678905");
  assert.ok(n.candidates.includes("012345678905"));
});

test("nutrition recognition requires a basis and all five core groups",()=>{
  const weak=nutritionCompleteness(parseNutritionLabel("蛋白质 3.2g"));
  assert.equal(weak.complete,false);
  const good=nutritionCompleteness(parseNutritionLabel("每100mL 能量261kJ 蛋白质3.2g 脂肪3.6g 碳水化合物4.8g"));
  assert.equal(good.complete,false); // Sodium is missing; do not suppress Vision.
  assert.equal(good.basisFound,true);
});

test("ingredient parser handles Chinese and English separators",()=>{
  assert.deepEqual(parseIngredients("配料：生牛乳、白砂糖,乳酸菌；食品用香精"),["生牛乳","白砂糖","乳酸菌","食品用香精"]);
});

test("parses five representative OCR label layouts",()=>{
  const samples=[
    "营养成分表\n每100mL\n能量261kJ 蛋白质3.2g 脂肪3.6g 碳水化合物4.8g 钠50mg",
    "每100 g: 能量 1680 kJ; 蛋白质 8.1 g; 脂肪 12.5 g; 碳水化合物 63.0 g; 钠 320 mg",
    "每份 能量 220kcal 蛋白质 6g 脂肪 9g 碳水化合物 31g 添加糖 8g",
    "每包装 能量:450kcal 蛋白质:12g 脂肪:18g 碳水化合物:62g 膳食纤维:5g",
    "每100克 能量900千焦 蛋白质5.5克 脂肪8克 碳水化合物30克 总糖4克 钠180毫克",
  ];
  for(const text of samples){
    const parsed=parseNutritionLabel(text);
    assert.notEqual(parsed.nutrients.proteinG,null,text);
    assert.equal(nutritionCompleteness(parsed).complete,parsed.nutrients.sodiumMg!=null,text);
  }
});
