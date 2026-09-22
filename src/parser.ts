import type { Nutrients } from "./types";

export type ParsedLabel = { basisAmount:number; basisUnit:string; nutrients:Nutrients; rawText:string };
export type FoodImageType="nutrition_label"|"ingredients"|"expiry"|"general_packaging";
const num=(s:string)=>Number(s.replace(",","."));
const find=(text:string,names:string[],unit:string)=>{ const pattern=new RegExp(`(?:${names.join("|")})[^\\d]{0,12}(\\d+(?:[.,]\\d+)?)\\s*(?:${unit})`,"i"); const m=text.match(pattern); return m?num(m[1]):null; };
export function parseNutritionLabel(rawText:string):ParsedLabel {
  const text=rawText.replace(/／/g,"/").replace(/，/g,",");
  const basis=text.match(/每\s*(?:(\d+(?:\.\d+)?)\s*)?(mL|ml|毫升|g|克|份|包装)/i);
  const energyKj=find(text,["能量"],"kJ|千焦"); const energyKcal=find(text,["能量"],"kcal|千卡");
  const unit=basis?.[2]??"g",basisAmount=basis?.[1]?num(basis[1]):/份|包装/.test(unit)?1:100;
  const totalSugar=find(text,["总糖"],"g|克")??(()=>{const m=text.match(/(?:^|[\s\n,，;；])糖[^\d]{0,12}(\d+(?:[.,]\d+)?)\s*(?:g|克)/i);return m?num(m[1]):null})();
  return {basisAmount,basisUnit:/ml|毫升/i.test(unit)?"mL":/包装/.test(unit)?"包装":/份/.test(unit)?"份":"g",rawText,
    nutrients:{energyKj,energyKcal:energyKcal??(energyKj==null?null:Math.round(energyKj/4.184*10)/10),proteinG:find(text,["蛋白质"],"g|克"),fatG:find(text,["脂肪"],"g|克"),carbohydrateG:find(text,["碳水化合物"],"g|克"),totalSugarG:totalSugar,addedSugarG:find(text,["添加糖"],"g|克"),fiberG:find(text,["膳食纤维"],"g|克"),sodiumMg:find(text,["钠"],"mg|毫克")}};
}
export const sugarKeywords=["白砂糖","蔗糖","果葡糖浆","葡萄糖","麦芽糖","蜂蜜"];
export function findSugarKeywords(text:string){ return sugarKeywords.filter(k=>text.includes(k)); }
export function parseIngredients(text:string){
  const body=(text.match(/(?:配料表?|ingredients?)\s*[:：]?\s*([\s\S]+)/i)?.[1]??text).replace(/[。\n]+/g,"、");
  return body.split(/[、,，;；]/).map(x=>x.trim()).filter(Boolean);
}
export function nutritionCompleteness(result:ParsedLabel){
  const fields=[result.nutrients.energyKcal,result.nutrients.energyKj,result.nutrients.proteinG,result.nutrients.fatG,result.nutrients.carbohydrateG,result.nutrients.totalSugarG,result.nutrients.addedSugarG,result.nutrients.fiberG,result.nutrients.sodiumMg];
  const count=fields.filter(v=>v!=null).length,basis=/(每\s*(?:\d+(?:\.\d+)?\s*)?(?:g|克|mL|ml|毫升|份|包装))/i.test(result.rawText);
  return{score:Math.min(100,(basis?30:0)+count*14),complete:basis&&count>=3,fieldCount:count,basisFound:basis};
}
export function normalizeDate(v:string){ const digits=v.replace(/[^\d]/g,""); if(digits.length!==8)return null; const y=Number(digits.slice(0,4)),m=Number(digits.slice(4,6)),d=Number(digits.slice(6,8)); const dt=new Date(y,m-1,d); return dt.getFullYear()===y&&dt.getMonth()===m-1&&dt.getDate()===d?`${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`:null; }
export function parseDates(text:string){ const matches=text.match(/(?:20\d{2})[.\/-]?\d{2}[.\/-]?\d{2}/g)??[]; return [...new Set(matches.map(normalizeDate).filter(Boolean))] as string[]; }
export function expiryFromText(text:string){
  const dates=parseDates(text),months=Number(text.match(/保质期\s*(\d+)\s*个?月/)?.[1]||0);
  if(!dates.length)return null;if(!months)return dates.at(-1)!;
  const [y,m,d]=dates[0].split("-").map(Number),result=new Date(y,m-1,d);
  result.setMonth(result.getMonth()+months);
  return `${result.getFullYear()}-${String(result.getMonth()+1).padStart(2,"0")}-${String(result.getDate()).padStart(2,"0")}`;
}
export function detectFoodImageType(text:string):FoodImageType{const nutrition=(text.match(/营养成分表|NRV|蛋白质|脂肪|碳水化合物|钠/g)||[]).length,ingredients=(text.match(/配料表?|ingredients?/gi)||[]).length,expiry=(text.match(/生产日期|制造日期|有效期|保质期|EXP|Best\s*Before/gi)||[]).length;if(nutrition>=2)return"nutrition_label";if(ingredients)return"ingredients";if(expiry||parseDates(text).length)return"expiry";return"general_packaging"}
export function isLocalResultComplete(type:FoodImageType,text:string){if(!text.trim())return false;if(type==="nutrition_label")return nutritionCompleteness(parseNutritionLabel(text)).complete;if(type==="ingredients")return parseIngredients(text).length>=2;if(type==="expiry")return parseDates(text).length>0||!!expiryFromText(text);return text.trim().length>=24}
