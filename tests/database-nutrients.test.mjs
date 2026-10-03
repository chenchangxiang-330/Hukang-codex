import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {DatabaseSync} from "node:sqlite";

// Execute the app's actual SQL against SQLite. This checks schema/column order,
// not Expo bridge behaviour; the cloud APK remains the native runtime check.
const source=fs.readFileSync(new URL("../src/database.ts",import.meta.url),"utf8");
const schema=source.match(/await d\.execAsync\(`(PRAGMA[\s\S]*?)`\);/)[1];
const productInsert=source.match(/`(INSERT INTO products\([\s\S]*?)`/)[1];
const productUpdate=source.match(/`(UPDATE products SET barcode=[\s\S]*?)`/)[1];
const logInsert=source.match(/`(INSERT INTO nutrition_logs\([\s\S]*?)`/)[1];
const logUpdate=source.match(/"(UPDATE nutrition_logs SET time=[^"]*)"/)[1];
const migrations=JSON.parse(source.match(/const migrations:Array<\[string,string\]>=([\s\S]*?);/)[1]);
const productSelect=source.match(/const productSelect = `([\s\S]*?)`;/)[1];
const logSelect=source.match(/getAllAsync<NutritionLog>\(`([\s\S]*?)`/)[1];
const newColumns=["saturated_fat_g","trans_fat_g"];
const columnNames=db=>new Set(db.prepare("PRAGMA table_info(products)").all().map(value=>value.name));
function migrate(db){
  const names=columnNames(db);
  for(const[name,type] of migrations)if(!names.has(name))db.exec(`ALTER TABLE products ADD COLUMN ${name} ${type}`);
  const logNames=new Set(db.prepare("PRAGMA table_info(nutrition_logs)").all().map(value=>value.name));
  for(const name of newColumns)if(!logNames.has(name))db.exec(`ALTER TABLE nutrition_logs ADD COLUMN ${name} REAL`);
}
const productValues=[null,null,null,"回归食品",null,null,null,null,null,100,"g",null,1000,3.2,4,1.1,0,5.8,null,null,null,42,"水、糖",null,"配料：水、糖",'["水","糖"]',"营养 OCR 原文","local_ocr","2026-10-03T00:00:00Z","2026-10-03T00:00:00Z","2026-10-03T00:00:00Z"];

test("fresh SQLite stores and reads saturated/trans fat without shifting nutrient values",()=>{
  const db=new DatabaseSync(":memory:");
  db.exec(schema);migrate(db);
  const insert=db.prepare(productInsert).run(...productValues),id=Number(insert.lastInsertRowid);
  let product=db.prepare(`SELECT ${productSelect} FROM products WHERE id=?`).get(id);
  assert.equal(product.saturatedFatG,1.1);assert.equal(product.transFatG,0);
  assert.equal(product.carbohydrateG,5.8);assert.equal(product.sodiumMg,42);
  assert.equal(product.ocrRawText,"营养 OCR 原文");
  const updated=productValues.slice(0,-1);updated[15]=1.2;
  db.prepare(productUpdate).run(...updated,id);
  product=db.prepare(`SELECT ${productSelect} FROM products WHERE id=?`).get(id);
  assert.equal(product.saturatedFatG,1.2);assert.equal(product.transFatG,0);
  db.prepare(logInsert).run(id,"2026-10-03","12:00",50,"g",null,500,1.6,2,.6,0,2.9,null,null,null,21);
  let log=db.prepare(logSelect).get("2026-10-03");
  assert.equal(log.saturatedFatG,.6);assert.equal(log.transFatG,0);assert.equal(log.sodiumMg,21);
  db.prepare(logUpdate).run("13:00",100,"g",null,1000,3.2,4,1.2,0,5.8,null,null,null,42,log.id);
  log=db.prepare(logSelect).get("2026-10-03");
  assert.equal(log.saturatedFatG,1.2);assert.equal(log.carbohydrateG,5.8);assert.equal(log.sodiumMg,42);
  db.close();
});
test("legacy SQLite migration preserves existing products and unknown new nutrients as null",()=>{
  const db=new DatabaseSync(":memory:");
  db.exec(schema.replaceAll(",saturated_fat_g REAL,trans_fat_g REAL",""));
  db.prepare("INSERT INTO products(name,nutrition_basis_amount,nutrition_basis_unit,protein_g,sodium_mg,created_at,updated_at) VALUES(?,?,?,?,?,?,?)").run("旧食品",100,"mL",3.2,42,"2026-09-21","2026-09-21");
  migrate(db);migrate(db);
  const product=db.prepare(`SELECT ${productSelect} FROM products`).get();
  assert.equal(product.name,"旧食品");assert.equal(product.proteinG,3.2);
  assert.equal(product.sodiumMg,42);assert.equal(product.saturatedFatG,null);assert.equal(product.transFatG,null);
  assert.equal(db.prepare("SELECT COUNT(*) count FROM products").get().count,1);
  db.close();
});
