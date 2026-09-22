import { test } from "node:test";
import assert from "node:assert/strict";
import {
  freshState,
  parseState,
  totals,
  dateKey,
  validDate,
  daysLeft,
  foods,
} from "../src/model.ts";
test("摄入与库存分开、份量计算、隔日不累计", () => {
  const s = freshState(false);
  s.inventory.push({
    id: "a",
    foodId: "milk",
    expires: "2030-01-01",
    addedAt: dateKey(),
  });
  assert.equal(totals(s).kcal, 0);
  s.intakes.push({ id: "b", foodId: "milk", date: dateKey(), servings: 0.5 });
  assert.equal(totals(s).kcal, 80);
  assert.equal(totals(s).protein, 4);
  assert.equal(totals(s, "2000-01-01").kcal, 0);
  assert.equal(s.inventory.length, 1);
});
test("演示基线可关闭；序列化保留设置和摄入", () => {
  const s = freshState();
  assert.equal(totals(s).kcal, 820);
  s.sound = false;
  s.welcomed = true;
  s.intakes.push({ id: "a", foodId: "oats", date: dateKey(), servings: 2 });
  assert.deepEqual(parseState(JSON.stringify(s)), s);
  s.demo = false;
  assert.equal(totals(s).kcal, 304);
});
test("清空数据为空，日期边界和闰年有效", () => {
  const s = freshState(false);
  assert.equal(s.inventory.length, 0);
  assert.equal(s.intakes.length, 0);
  assert.equal(validDate("2026-02-30"), false);
  assert.equal(validDate("2028-02-29"), true);
  assert.equal(daysLeft("2026-10-01", "2026-09-30"), 1);
  assert.equal(daysLeft("2026-09-29", "2026-09-30"), -1);
  assert.equal(daysLeft("2026-09-30", "2026-09-30"), 0);
});
test("拒绝损坏或版本不兼容的存档，避免静默覆盖", () => {
  assert.throws(() => parseState("{"));
  assert.throws(() => parseState('{"version":9}'));
  const s = freshState();
  s.inventory[0].foodId = "unknown";
  assert.throws(() => parseState(JSON.stringify(s)));
});
test("食品和药品具有可用于库存筛选的分类，旧存档仍兼容", () => {
  assert.equal(foods.find((f) => f.id === "apple")?.category, "fruit");
  assert.equal(foods.find((f) => f.id === "tomato")?.category, "vegetable");
  assert.equal(foods.find((f) => f.id === "nuts")?.category, "snack");
  assert.equal(foods.find((f) => f.id === "medicine-demo")?.kind, "medicine");
  const oldState = freshState(false);
  oldState.welcomed = true;
  assert.deepEqual(parseState(JSON.stringify(oldState)), oldState);
});
test("药品不能被写入营养摄入记录", () => {
  const s = freshState(false);
  s.intakes.push({
    id: "medicine-intake",
    foodId: "medicine-demo",
    date: dateKey(),
    servings: 1,
  });
  assert.throws(() => parseState(JSON.stringify(s)));
});
