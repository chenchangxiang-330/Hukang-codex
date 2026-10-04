import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {DatabaseSync} from "node:sqlite";
import {nutritionSaveEvidence,productSaveEvidence} from "../src/recognitionSaveEvidence.ts";

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
const productValues=[null,null,null,"回归食品",null,null,null,null,null,100,"g",null,1000,3.2,4,1.1,0,5.8,null,null,null,42,"水、糖",null,"配料：水、糖",'["水","糖"]',"营养 OCR 原文",'{"local":{"rawText":"营养 OCR 原文"},"vision":{"status":"not_run"}}',"local_ocr","2026-10-03T00:00:00Z","2026-10-03T00:00:00Z","2026-10-03T00:00:00Z"];

test("fresh SQLite stores and reads saturated/trans fat without shifting nutrient values",()=>{
  const db=new DatabaseSync(":memory:");
  db.exec(schema);migrate(db);
  const insert=db.prepare(productInsert).run(...productValues),id=Number(insert.lastInsertRowid);
  let product=db.prepare(`SELECT ${productSelect} FROM products WHERE id=?`).get(id);
  assert.equal(product.saturatedFatG,1.1);assert.equal(product.transFatG,0);
  assert.equal(product.carbohydrateG,5.8);assert.equal(product.sodiumMg,42);
  assert.equal(product.ocrRawText,"营养 OCR 原文");
  assert.deepEqual(JSON.parse(product.recognitionEvidenceJson),{local:{rawText:"营养 OCR 原文"},vision:{status:"not_run"}});
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
  assert.equal(product.recognitionEvidenceJson,null);
  assert.equal(product.name,"旧食品");assert.equal(product.proteinG,3.2);
  assert.equal(product.sodiumMg,42);assert.equal(product.saturatedFatG,null);assert.equal(product.transFatG,null);
  assert.equal(db.prepare("SELECT COUNT(*) count FROM products").get().count,1);
  db.close();
});

test("recognition evidence migration preserves the existing V1.4 OCR/source and is idempotent",()=>{
  const db=new DatabaseSync(":memory:");
  try{
    db.exec(schema);
    const existingNames=columnNames(db);
    for(const[name,type]of migrations)if(name!=="recognition_evidence_json"&&!existingNames.has(name))db.exec(`ALTER TABLE products ADD COLUMN ${name} ${type}`);
    db.prepare("INSERT INTO products(name,nutrition_basis_amount,nutrition_basis_unit,ocr_raw_text,data_source,created_at,updated_at) VALUES(?,?,?,?,?,?,?)")
      .run("已有识别商品",125,"mL","原始OCR 36g","mixed","2026-10-03","2026-10-03");
    migrate(db);migrate(db);
    const product=db.prepare(`SELECT ${productSelect} FROM products`).get();
    assert.equal(product.ocrRawText,"原始OCR 36g");assert.equal(product.dataSource,"mixed");
    assert.equal(product.basisAmount,125);assert.equal(product.basisUnit,"mL");assert.equal(product.recognitionEvidenceJson,null);
    const column=db.prepare("PRAGMA table_info(products)").all().filter(value=>value.name==="recognition_evidence_json");
    assert.equal(column.length,1);assert.equal(column[0].type,"TEXT");assert.equal(column[0].notnull,0);assert.equal(column[0].dflt_value,null);
  }finally{db.close()}
});

test("on-disk SQLite close/reopen preserves selected Vision evidence, edit source, unknowns and relationships",()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),"hukang-storage-sql-")),dbPath=path.join(directory,"storage.db");
  let db;
  try{
    db=new DatabaseSync(dbPath);db.exec(schema);migrate(db);
    const primary={text:"蛋白质36g\n原始OCR"},original={text:"未裁剪原始OCR"};
    const vision={mock:true,raw_text:"MOCK Vision 蛋白质不可读",nutrition:{protein_g:null}};
    const confirmation=nutritionSaveEvidence({primary,original,vision,choice:"vision",localChoice:null});
    const chosen=productSaveEvidence({rawText:confirmation.rawText,source:"online_vision",recognitionEvidenceJson:confirmation.recognitionEvidenceJson},null);
    const values=[...productValues];
    values[9]=125;values[10]="mL";values[13]=null;values[14]=null;values[17]=null;
    values[23]="file:///data/user/0/com.hukang.local/files/confirmed-photo.jpg";
    values[26]=chosen.ocrRawText;values[27]=chosen.recognitionEvidenceJson;values[28]=chosen.dataSource;
    const id=Number(db.prepare(productInsert).run(...values).lastInsertRowid);
    const saved=db.prepare(`SELECT ${productSelect} FROM products WHERE id=?`).get(id);
    const edited=productSaveEvidence({},saved),updates=values.slice(0,-1);
    updates[3]="确认后编辑";updates[26]=edited.ocrRawText;updates[27]=edited.recognitionEvidenceJson;updates[28]=edited.dataSource;
    db.prepare(productUpdate).run(...updates,id);
    const photoUri=values[23];
    db.prepare("INSERT INTO inventory(product_id,quantity,production_date,expiry_date,photo_uri) VALUES(?,?,?,?,?)").run(id,2.5,"2026-10-03",null,photoUri);
    db.prepare(logInsert).run(id,"2026-10-04","12:30",62.5,"mL",null,500,null,null,.55,0,null,null,null,null,21);
    db.close();db=new DatabaseSync(dbPath);db.exec("PRAGMA foreign_keys=ON");migrate(db);
    const reopened=db.prepare(`SELECT ${productSelect} FROM products WHERE id=?`).get(id);
    assert.equal(reopened.name,"确认后编辑");assert.equal(reopened.basisAmount,125);assert.equal(reopened.basisUnit,"mL");
    assert.equal(reopened.ocrRawText,primary.text);assert.equal(reopened.dataSource,"online_vision");
    assert.deepEqual(JSON.parse(reopened.recognitionEvidenceJson).vision,vision);
    assert.deepEqual(JSON.parse(reopened.recognitionEvidenceJson).local,{primary,original});
    assert.equal(reopened.proteinG,null);assert.equal(reopened.fatG,null);assert.equal(reopened.carbohydrateG,null);
    assert.equal(reopened.addedSugarG,null);assert.equal(reopened.transFatG,0);assert.equal(reopened.imageUri,photoUri);
    const inventory=db.prepare("SELECT * FROM inventory WHERE product_id=?").get(id),log=db.prepare(logSelect).get("2026-10-04");
    assert.equal(inventory.product_id,id);assert.equal(inventory.quantity,2.5);assert.equal(inventory.expiry_date,null);assert.equal(inventory.photo_uri,photoUri);
    assert.equal(log.productId,id);assert.equal(log.proteinG,null);assert.equal(log.fatG,null);assert.equal(log.carbohydrateG,null);assert.equal(log.transFatG,0);
    assert.throws(()=>db.prepare("DELETE FROM products WHERE id=?").run(id),/FOREIGN KEY/);
    assert.equal(db.prepare("SELECT COUNT(*) count FROM products").get().count,1);
    assert.equal(db.prepare("SELECT COUNT(*) count FROM inventory").get().count,1);
    assert.equal(db.prepare("SELECT COUNT(*) count FROM nutrition_logs").get().count,1);
  }finally{db?.close();fs.rmSync(directory,{recursive:true,force:true})}
});
