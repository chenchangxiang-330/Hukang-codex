import test from"node:test";
import assert from"node:assert/strict";
import{detectFoodImageType,isLocalResultComplete}from"../src/parser.ts";

test("automatically classifies nutrition, ingredients, expiry, and packaging text",()=>{
 assert.equal(detectFoodImageType("营养成分表 每100mL 蛋白质3.2g 脂肪3.6g 钠50mg"),"nutrition_label");
 assert.equal(detectFoodImageType("配料：生牛乳、白砂糖、乳酸菌"),"ingredients");
 assert.equal(detectFoodImageType("生产日期 2026.09.21 保质期6个月"),"expiry");
 assert.equal(detectFoodImageType("蒙牛 纯牛奶 巴氏杀菌乳"),"general_packaging");
});

test("requires meaningful local results before accepting recognition",()=>{
 assert.equal(isLocalResultComplete("nutrition_label","营养成分表 每100mL 蛋白质3.2g 脂肪3.6g 碳水化合物4.8g 钠50mg"),true);
 assert.equal(isLocalResultComplete("nutrition_label","营养成分表 蛋白质3.2g"),false);
 assert.equal(isLocalResultComplete("ingredients","配料：水、白砂糖"),true);
 assert.equal(isLocalResultComplete("expiry","EXP 2027.03.21"),true);
 assert.equal(isLocalResultComplete("general_packaging","牛奶"),false);
});
