import test from "node:test";
import assert from "node:assert/strict";
import { expiryFromText, findSugarKeywords, normalizeDate, parseDates, parseNutritionLabel } from "../src/parser.ts";

test("parses Chinese nutrition label without inventing added sugar", () => {
  const p = parseNutritionLabel("营养成分表 每100mL 能量 261kJ 蛋白质 3.2g 脂肪 3.6g 碳水化合物 4.8g 钠 50mg");
  assert.equal(p.basisAmount, 100);
  assert.equal(p.basisUnit, "mL");
  assert.equal(p.nutrients.proteinG, 3.2);
  assert.equal(p.nutrients.carbohydrateG, 4.8);
  assert.equal(p.nutrients.sodiumMg, 50);
  assert.equal(p.nutrients.addedSugarG, null);
});

test("normalizes supported date formats", () => {
  assert.equal(normalizeDate("2026.09.21"), "2026-09-21");
  assert.deepEqual(parseDates("生产 20260921 EXP 2027/03/21"), ["2026-09-21", "2027-03-21"]);
});

test("calculates expiry from production date and shelf life", () => {
  assert.equal(expiryFromText("生产日期 2026.09.21 保质期6个月"), "2027-03-21");
  assert.equal(expiryFromText("EXP 2027/03/21"), "2027-03-21");
});

test("ingredient scan reports keyword matches only", () => {
  assert.deepEqual(findSugarKeywords("水、果葡糖浆、蜂蜜、香料"), ["果葡糖浆", "蜂蜜"]);
});
