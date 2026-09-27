import type { Nutrients } from "./types";

export type ParsedLabel = { basisAmount:number|null; basisUnit:string|null; nutrients:Nutrients; rawText:string; quality:{confidence:number;issues:string[];correctedFields:string[];ambiguousFields:string[]} };
export type FoodImageType="nutrition_label"|"ingredients"|"expiry"|"general_packaging";
export const emptyParsedNutrients = ():Nutrients => ({energyKj:null,energyKcal:null,proteinG:null,fatG:null,carbohydrateG:null,totalSugarG:null,addedSugarG:null,fiberG:null,sodiumMg:null});
const coreKeys = ["proteinG","fatG","carbohydrateG","sodiumMg"] as const;
const normalizeBasisUnit = (unit:string) => /^(ml|毫升)$/i.test(unit)?"mL":/^(g|克)$/i.test(unit)?"g":unit;
function readBasis(text:string){
  const values = [...text.matchAll(/每\s*(?:(\d+(?:[.,]\d+)?)\s*(mL|毫升|g|克|份|包装)|([份]|包装))/gi)]
    .map(m=>({amount:m[1]?Number(m[1].replace(",",".")):1,unit:normalizeBasisUnit(m[2]??m[3])}))
    .filter(v=>Number.isFinite(v.amount)&&v.amount>0);
  const unique = [...new Map(values.map(v=>[`${v.amount}:${v.unit}`,v])).values()];
  return {value:unique.length===1?unique[0]:null,ambiguous:unique.length>1};
}
// Labels delimit their own values. A missing value must never borrow the next row.
const labelPattern = /能量|热量|蛋白质|单不饱和脂肪(?:酸)?|多不饱和脂肪(?:酸)?|饱和脂肪(?:酸)?|反式脂肪(?:酸)?|总脂肪|脂肪|碳水化合物|添加糖|总糖|膳食纤维|钠|糖/g;
const labelKeys:Record<string,keyof Nutrients|undefined> = {蛋白质:"proteinG",总脂肪:"fatG",脂肪:"fatG",碳水化合物:"carbohydrateG",总糖:"totalSugarG",糖:"totalSugarG",添加糖:"addedSugarG",膳食纤维:"fiberG",钠:"sodiumMg"};
const valuePattern = /([+-]?[0-9OoIl|]+(?:[.,][0-9OoIl|]+)?)\s*(千焦|千卡|毫克|kcal|kJ|mq|mg|g|q|克)(?![a-z])/gi;
function canonicalUnit(unit:string){return /^(kj|千焦)$/i.test(unit)?"kJ":/^(kcal|千卡)$/i.test(unit)?"kcal":/^(mg|mq|毫克)$/i.test(unit)?"mg":"g";}
function corePresent(nutrients:Nutrients){return Number(nutrients.energyKj!=null||nutrients.energyKcal!=null)+coreKeys.filter(k=>nutrients[k]!=null).length;}
export function parseNutritionLabel(rawText:string):ParsedLabel {
  const text=rawText.normalize("NFKC"),basis=readBasis(text),nutrients=emptyParsedNutrients();
  const issues:string[]=[],correctedFields=new Set<string>(),ambiguousFields=new Set<string>();
  const candidates:Partial<Record<keyof Nutrients,number[]>>={};
  if(!text.trim())issues.push("OCR_NO_TEXT");
  if(!basis.value)issues.push(basis.ambiguous?"MULTIPLE_BASIS":"BASIS_MISSING");
  const labels=[...text.matchAll(labelPattern)];
  for(let index=0;index<labels.length;index++){
    const label=labels[index],name=label[0],isEnergy=name==="能量"||name==="热量",key=labelKeys[name];
    if(!isEnergy&&!key)continue;
    // Do not interpret 糖 in 乳糖/蔗糖, or 钠 in a chemical ingredient, as a row.
    const preceding=text[(label.index??0)-1]??"";
    if((name==="糖"||name==="钠")&&/[\u4e00-\u9fff]/.test(preceding))continue;
    const body=text.slice((label.index??0)+name.length,labels[index+1]?.index??text.length);
    const found=[...body.matchAll(valuePattern)],values:RegExpMatchArray[]=[];
    if(!found.length||!/^[\s:：]*$/.test(body.slice(0,found[0].index)))continue;
    let previousEnd=0;
    for(const value of found){
      const gap=body.slice(previousEnd,value.index);
      // Unknown labels (e.g. 钙/维生素) terminate the row too; never borrow their values.
      if(values.length&&/[^\s0-9OoIl|.,%/;:()NRVnrv+-]/.test(gap))break;
      values.push(value);previousEnd=(value.index??0)+value[0].length;
    }
    const affected=new Set<keyof Nutrients>();
    for(const value of values){
      const unit=canonicalUnit(value[2]);
      const field=isEnergy?(unit==="kJ"?"energyKj":unit==="kcal"?"energyKcal":null):key!;
      if(!field||(!isEnergy&&unit!==(field==="sodiumMg"?"mg":"g")))continue;
      affected.add(field);
      // 1,000 may be a thousands grouping or a decimal. Neither interpretation is safe.
      if(/,\d{3}$/.test(value[1])){ambiguousFields.add(field);issues.push(`AMBIGUOUS_SEPARATOR:${field}`);continue;}
      const corrected=value[1].replace(/[Oo]/g,"0").replace(/[Il|]/g,"1").replace(",",".");
      const number=Number(corrected);
      if(!Number.isFinite(number)||number<0){ambiguousFields.add(field);issues.push(`INVALID_VALUE:${field}`);continue;}
      if(corrected!==value[1]||/q/i.test(value[2]))correctedFields.add(field);
      (candidates[field]??=[]).push(number);
    }
    // Bare second-column numbers (not NRV percentages) cannot be assigned safely.
    const remainder=body.slice((values[0].index??0)+values[0][0].length).split(/\r?\n/)[0]
      .replace(valuePattern,"").replace(/[0-9OoIl|]+(?:[.,][0-9OoIl|]+)?\s*%/g,"")
      .split(/[^\s0-9OoIl|.,%/;:()NRVnrv+-]/)[0];
    if(/\d/.test(remainder))for(const field of affected)ambiguousFields.add(field);
  }
  for(const key of Object.keys(nutrients) as (keyof Nutrients)[]){
    const values=candidates[key]??[];
    if(values.length>1)ambiguousFields.add(key);
    if(values.length===1&&!ambiguousFields.has(key)&&!basis.ambiguous)nutrients[key]=values[0];
  }
  if(basis.ambiguous)for(const key of Object.keys(candidates))ambiguousFields.add(key);
  for(const key of ambiguousFields)issues.push(`PARSER_AMBIGUOUS:${key}`);
  for(const key of correctedFields)issues.push(`CORRECTED:${key}`);
  if(nutrients.energyKj==null&&nutrients.energyKcal==null)issues.push("MISSING_CORE:energy");
  for(const key of coreKeys)if(nutrients[key]==null)issues.push(`MISSING_CORE:${key}`);
  // This measures structural completeness, NOT the accuracy of OCR against the image.
  const confidence=Math.max(0,Math.min(1,(corePresent(nutrients)+Number(!!basis.value))/6-correctedFields.size*.1-ambiguousFields.size*.15));
  return {basisAmount:basis.value?.amount??null,basisUnit:basis.value?.unit??null,nutrients,rawText,
    quality:{confidence,issues:[...new Set(issues)],correctedFields:[...correctedFields],ambiguousFields:[...ambiguousFields]}};
}
export const sugarKeywords=["白砂糖","蔗糖","果葡糖浆","葡萄糖","麦芽糖","蜂蜜"];
export function findSugarKeywords(text:string){ return sugarKeywords.filter(k=>text.includes(k)); }
export function parseIngredients(text:string){
  const body=(text.match(/(?:配料表?|ingredients?)\s*[:：]?\s*([\s\S]+)/i)?.[1]??text).replace(/[。\n]+/g,"、");
  return body.split(/[、,，;；]/).map(x=>x.trim()).filter(Boolean);
}
export function nutritionCompleteness(result:ParsedLabel){
  const count=corePresent(result.nutrients),basis=result.basisAmount!=null&&result.basisUnit!=null;
  const clean=result.quality.correctedFields.length===0&&result.quality.ambiguousFields.length===0;
  return{score:Math.round(result.quality.confidence*100),complete:basis&&count===5&&clean,fieldCount:count,basisFound:basis};
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
