import * as SQLite from "expo-sqlite";
import { InventoryItem, NutritionLog, Nutrients, Product, zeroNutrients } from "./types";
import { normalizeBarcode } from "./barcode";

let handle: Promise<SQLite.SQLiteDatabase> | null = null;
const db = () => (handle ??= SQLite.openDatabaseAsync("hukang.db"));
const now = () => new Date().toISOString();

const productSelect = `id,barcode,raw_barcode rawBarcode,normalized_barcode normalizedBarcode,name,brand,variant,category,net_content netContent,net_content_unit netContentUnit,
 nutrition_basis_amount basisAmount,nutrition_basis_unit basisUnit,energy_kcal energyKcal,energy_kj energyKj,
 protein_g proteinG,fat_g fatG,carbohydrate_g carbohydrateG,total_sugar_g totalSugarG,
 added_sugar_g addedSugarG,fiber_g fiberG,sodium_mg sodiumMg,ingredients,image_uri imageUri,ingredients_raw_text ingredientsRawText,ingredients_json ingredientsJson,ocr_raw_text ocrRawText,data_source dataSource,last_verified_at lastVerifiedAt,
 created_at createdAt,updated_at updatedAt`;

export async function initializeDatabase() {
  const d = await db();
  await d.execAsync(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY AUTOINCREMENT,barcode TEXT UNIQUE,name TEXT NOT NULL,brand TEXT,
      net_content REAL,net_content_unit TEXT,nutrition_basis_amount REAL NOT NULL DEFAULT 100,nutrition_basis_unit TEXT NOT NULL DEFAULT 'g',
      energy_kcal REAL,energy_kj REAL,protein_g REAL,fat_g REAL,carbohydrate_g REAL,total_sugar_g REAL,
      added_sugar_g REAL,fiber_g REAL,sodium_mg REAL,ingredients TEXT,image_uri TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS inventory(id INTEGER PRIMARY KEY AUTOINCREMENT,product_id INTEGER NOT NULL,quantity REAL NOT NULL DEFAULT 1,
      purchase_date TEXT,production_date TEXT,expiry_date TEXT,opened INTEGER NOT NULL DEFAULT 0,opened_at TEXT,storage_type TEXT NOT NULL DEFAULT '常温',photo_uri TEXT,
      FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS nutrition_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,product_id INTEGER NOT NULL,date TEXT NOT NULL,time TEXT NOT NULL,
      amount REAL NOT NULL,amount_unit TEXT NOT NULL,energy_kcal REAL,energy_kj REAL,protein_g REAL,fat_g REAL,carbohydrate_g REAL,
      total_sugar_g REAL,added_sugar_g REAL,fiber_g REAL,sodium_mg REAL,FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE RESTRICT);
    CREATE INDEX IF NOT EXISTS logs_date_idx ON nutrition_logs(date);
    CREATE INDEX IF NOT EXISTS inventory_expiry_idx ON inventory(expiry_date);`);
  const cols=await d.getAllAsync<{name:string}>("PRAGMA table_info(products)"),names=new Set(cols.map(x=>x.name));
  const migrations:Array<[string,string]>=[["raw_barcode","TEXT"],["normalized_barcode","TEXT"],["variant","TEXT"],["category","TEXT"],["ingredients_raw_text","TEXT"],["ingredients_json","TEXT"],["ocr_raw_text","TEXT"],["data_source","TEXT NOT NULL DEFAULT 'manual'"],["last_verified_at","TEXT"]];
  for(const [name,type] of migrations)if(!names.has(name))await d.execAsync(`ALTER TABLE products ADD COLUMN ${name} ${type}`);
  await d.execAsync("CREATE UNIQUE INDEX IF NOT EXISTS products_normalized_barcode_idx ON products(normalized_barcode) WHERE normalized_barcode IS NOT NULL");
  const legacy=await d.getAllAsync<{id:number;barcode:string}>("SELECT id,barcode FROM products WHERE barcode IS NOT NULL AND normalized_barcode IS NULL");
  for(const p of legacy){const n=normalizeBarcode(p.barcode);await d.runAsync("UPDATE products SET raw_barcode=?,normalized_barcode=? WHERE id=?",p.barcode,n.normalized,p.id)}
  const row = await d.getFirstAsync<{ count: number }>("SELECT COUNT(*) count FROM products");
  if (!row?.count) await seedProducts();
}

async function seedProducts() {
  await saveProduct({ barcode:"6900000000014",name:"原味纯牛奶",brand:"护康示例",netContent:250,netContentUnit:"mL",basisAmount:100,basisUnit:"mL",energyKcal:64,energyKj:268,proteinG:3.2,fatG:3.6,carbohydrateG:4.8,totalSugarG:null,addedSugarG:null,fiberG:0,sodiumMg:52,ingredients:"生牛乳",imageUri:null });
  await saveProduct({ barcode:"6900000000021",name:"全麦面包",brand:"护康示例",netContent:400,netContentUnit:"g",basisAmount:100,basisUnit:"g",energyKcal:247,energyKj:1033,proteinG:10.8,fatG:4.2,carbohydrateG:41.8,totalSugarG:5.1,addedSugarG:3.2,fiberG:6.5,sodiumMg:396,ingredients:"全麦粉、小麦粉、水、白砂糖、酵母、食用盐",imageUri:null });
  await saveProduct({ barcode:"6900000000038",name:"原味酸奶",brand:"护康示例",netContent:200,netContentUnit:"g",basisAmount:100,basisUnit:"g",energyKcal:78,energyKj:326,proteinG:3.1,fatG:3.4,carbohydrateG:8.8,totalSugarG:8.8,addedSugarG:null,fiberG:0,sodiumMg:65,ingredients:"生牛乳、乳酸菌、白砂糖",imageUri:null });
}

type ProductInput = Omit<Product,"id"|"createdAt"|"updatedAt"|"rawBarcode"|"normalizedBarcode"|"variant"|"category"|"ingredientsRawText"|"ingredientsJson"|"ocrRawText"|"dataSource"|"lastVerifiedAt"> & Partial<Pick<Product,"rawBarcode"|"normalizedBarcode"|"variant"|"category"|"ingredientsRawText"|"ingredientsJson"|"ocrRawText"|"dataSource"|"lastVerifiedAt">>;
export async function saveProduct(p: ProductInput, id?: number) {
  const d=await db(),t=now(),raw=p.rawBarcode??p.barcode??null,norm=p.normalizedBarcode??(raw?normalizeBarcode(raw).normalized:null);
  const vals=[p.barcode||raw,raw,norm,p.name,p.brand||null,p.variant||null,p.category||null,p.netContent,p.netContentUnit,p.basisAmount,p.basisUnit,p.energyKcal,p.energyKj,p.proteinG,p.fatG,p.carbohydrateG,p.totalSugarG,p.addedSugarG,p.fiberG,p.sodiumMg,p.ingredients||null,p.imageUri||null,p.ingredientsRawText??p.ingredients??null,p.ingredientsJson??null,p.ocrRawText??null,p.dataSource??"manual",p.lastVerifiedAt??t];
  if(id){await d.runAsync(`UPDATE products SET barcode=?,raw_barcode=?,normalized_barcode=?,name=?,brand=?,variant=?,category=?,net_content=?,net_content_unit=?,nutrition_basis_amount=?,nutrition_basis_unit=?,energy_kcal=?,energy_kj=?,protein_g=?,fat_g=?,carbohydrate_g=?,total_sugar_g=?,added_sugar_g=?,fiber_g=?,sodium_mg=?,ingredients=?,image_uri=?,ingredients_raw_text=?,ingredients_json=?,ocr_raw_text=?,data_source=?,last_verified_at=?,updated_at=? WHERE id=?`,...[...vals,t,id]);return id}
  const r=await d.runAsync(`INSERT INTO products(barcode,raw_barcode,normalized_barcode,name,brand,variant,category,net_content,net_content_unit,nutrition_basis_amount,nutrition_basis_unit,energy_kcal,energy_kj,protein_g,fat_g,carbohydrate_g,total_sugar_g,added_sugar_g,fiber_g,sodium_mg,ingredients,image_uri,ingredients_raw_text,ingredients_json,ocr_raw_text,data_source,last_verified_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,...[...vals,t,t]);return r.lastInsertRowId;
}
export async function getProducts(){ return (await db()).getAllAsync<Product>(`SELECT ${productSelect} FROM products ORDER BY updated_at DESC`); }
export async function getProduct(id:number){ return (await db()).getFirstAsync<Product>(`SELECT ${productSelect} FROM products WHERE id=?`,id); }
export async function findBarcode(code:string){const n=normalizeBarcode(code);if(!n.normalized)return null;return (await db()).getFirstAsync<Product>(`SELECT ${productSelect} FROM products WHERE normalized_barcode IN (${n.candidates.map(()=>"?").join(",")}) LIMIT 1`,...n.candidates)}

export async function addInventory(productId:number, expiryDate:string|null, productionDate:string|null, photoUri:string|null, quantity=1, storageType="常温"){
  return (await db()).runAsync("INSERT INTO inventory(product_id,quantity,purchase_date,production_date,expiry_date,storage_type,photo_uri) VALUES(?,?,?,?,?,?,?)",productId,quantity,new Date().toISOString().slice(0,10),productionDate,expiryDate,storageType,photoUri);
}
export async function getInventory(){ return (await db()).getAllAsync<InventoryItem>(`SELECT i.id,i.product_id productId,p.name productName,i.quantity,i.purchase_date purchaseDate,i.production_date productionDate,i.expiry_date expiryDate,i.opened,i.opened_at openedAt,i.storage_type storageType,i.photo_uri photoUri FROM inventory i JOIN products p ON p.id=i.product_id ORDER BY CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END,expiry_date`); }
export async function deleteInventory(id:number){ await (await db()).runAsync("DELETE FROM inventory WHERE id=?",id); }
export async function toggleOpened(id:number,opened:boolean){ await (await db()).runAsync("UPDATE inventory SET opened=?,opened_at=? WHERE id=?",opened?1:0,opened?now():null,id); }

export async function addLog(product:Product,amount:number,unit:string,date:string,time:string){
  const ratio=amount/product.basisAmount; const n=(v:number|null)=>v==null?null:Math.round(v*ratio*100)/100;
  await (await db()).runAsync(`INSERT INTO nutrition_logs(product_id,date,time,amount,amount_unit,energy_kcal,energy_kj,protein_g,fat_g,carbohydrate_g,total_sugar_g,added_sugar_g,fiber_g,sodium_mg) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,product.id,date,time,amount,unit,n(product.energyKcal),n(product.energyKj),n(product.proteinG),n(product.fatG),n(product.carbohydrateG),n(product.totalSugarG),n(product.addedSugarG),n(product.fiberG),n(product.sodiumMg));
}
export async function getLogs(date:string){ return (await db()).getAllAsync<NutritionLog>(`SELECT l.id,l.product_id productId,p.name productName,l.date,l.time,l.amount,l.amount_unit amountUnit,l.energy_kcal energyKcal,l.energy_kj energyKj,l.protein_g proteinG,l.fat_g fatG,l.carbohydrate_g carbohydrateG,l.total_sugar_g totalSugarG,l.added_sugar_g addedSugarG,l.fiber_g fiberG,l.sodium_mg sodiumMg FROM nutrition_logs l JOIN products p ON p.id=l.product_id WHERE date=? ORDER BY time DESC`,date); }
export async function updateLog(id:number,amount:number,unit:string,time:string){ const l=await (await db()).getFirstAsync<any>("SELECT * FROM nutrition_logs WHERE id=?",id); const p=l?await getProduct(l.product_id):null; if(!p)return; const ratio=amount/p.basisAmount,n=(v:number|null)=>v==null?null:Math.round(v*ratio*100)/100; await (await db()).runAsync("UPDATE nutrition_logs SET time=?,amount=?,amount_unit=?,energy_kcal=?,energy_kj=?,protein_g=?,fat_g=?,carbohydrate_g=?,total_sugar_g=?,added_sugar_g=?,fiber_g=?,sodium_mg=? WHERE id=?",time,amount,unit,n(p.energyKcal),n(p.energyKj),n(p.proteinG),n(p.fatG),n(p.carbohydrateG),n(p.totalSugarG),n(p.addedSugarG),n(p.fiberG),n(p.sodiumMg),id); }
export async function deleteLog(id:number){ await (await db()).runAsync("DELETE FROM nutrition_logs WHERE id=?",id); }
export function totalLogs(logs:NutritionLog[]):Nutrients { const out=zeroNutrients(); for(const l of logs) for(const k of Object.keys(out) as (keyof Nutrients)[]) if(l[k]!=null) out[k]=(out[k]??0)+(l[k]??0); return out; }
export async function exportAll(){ const d=await db(); return {version:1,exportedAt:now(),products:await d.getAllAsync("SELECT * FROM products"),inventory:await d.getAllAsync("SELECT * FROM inventory"),nutritionLogs:await d.getAllAsync("SELECT * FROM nutrition_logs")}; }
export async function clearDatabase(){ const d=await db(); await d.execAsync("DELETE FROM nutrition_logs; DELETE FROM inventory; DELETE FROM products;"); await seedProducts(); }
