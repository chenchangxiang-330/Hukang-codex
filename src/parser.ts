import type { Nutrients } from "./types";

export type ParsedLabel = { basisAmount:number|null; basisUnit:string|null; nutrients:Nutrients; rawText:string; quality:{confidence:number;issues:string[];correctedFields:string[];ambiguousFields:string[]} };
export type FoodImageType="nutrition_label"|"ingredients"|"expiry"|"general_packaging";
export const emptyParsedNutrients = ():Nutrients => ({energyKj:null,energyKcal:null,proteinG:null,fatG:null,saturatedFatG:null,transFatG:null,carbohydrateG:null,totalSugarG:null,addedSugarG:null,fiberG:null,sodiumMg:null});
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
const labelPattern = /能量|热量|蛋白质|单不饱和脂肪(?:酸)?|多不饱和脂肪(?:酸)?|饱和脂肪(?:酸)?|反式脂肪(?:酸)?|总脂肪|脂肪|碳水化合物|添加糖|总糖|膳食纤维|钠|鈉|糖/g;
const labelKeys:Record<string,keyof Nutrients|undefined> = {蛋白质:"proteinG",总脂肪:"fatG",脂肪:"fatG",饱和脂肪:"saturatedFatG",饱和脂肪酸:"saturatedFatG",反式脂肪:"transFatG",反式脂肪酸:"transFatG",碳水化合物:"carbohydrateG",总糖:"totalSugarG",糖:"totalSugarG",添加糖:"addedSugarG",膳食纤维:"fiberG",钠:"sodiumMg"};
labelKeys["鈉"]="sodiumMg"; // Traditional spelling, not a guessed damaged glyph.
const valuePattern = /([+-]?[0-9OoIl|]+(?:[ \t]*[.,][ \t]*[0-9OoIl|]+)?)\s*(?:\(\s*)?(千焦|千卡|毫克|kcal|kJ|mq|mg|g|q|克)(?![a-z])(?:\s*\))?/gi;
function canonicalUnit(unit:string){return /^(kj|千焦)$/i.test(unit)?"kJ":/^(kcal|千卡)$/i.test(unit)?"kcal":/^(mg|mq|毫克)$/i.test(unit)?"mg":"g";}
function corePresent(nutrients:Nutrients){return Number(nutrients.energyKj!=null||nutrients.energyKcal!=null)+coreKeys.filter(k=>nutrients[k]!=null).length;}
export function parseNutritionLabel(rawText:string):ParsedLabel {
  let text=rawText.normalize("NFKC");
  const normalizedLabels=new Set<string>();
  // Remove layout whitespace only inside known intact row names, not damaged Chinese glyphs.
  for(const name of ["碳水化合物","饱和脂肪酸","反式脂肪酸","饱和脂肪","反式脂肪","膳食纤维","蛋白质","添加糖","总脂肪","总糖","脂肪","能量","热量"]){
    text=text.replace(new RegExp(name.split("").join("[ \\t]*") ,"g"),value=>{if(value!==name)normalizedLabels.add(name);return name});
  }
  const basis=readBasis(text),nutrients=emptyParsedNutrients();
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
    if((name==="糖"||name==="钠"||name==="鈉")&&/[\u4e00-\u9fff]/.test(preceding))continue;
    let body=text.slice((label.index??0)+name.length,labels[index+1]?.index??text.length);
    body=body.replace(/(千焦|千卡|毫克|克)\s*(?:\(\s*)?(kJ|kcal|mg|g)\s*\)/gi,(original,cn:string,latin:string)=>{
      if(canonicalUnit(cn)!==canonicalUnit(latin))return original;
      issues.push(`PRINTED_UNIT_ALIAS:${isEnergy?canonicalUnit(cn):key}`);return cn;
    });
    // A completed physical table row ending in NRV% cannot borrow the next row's
    // unlabelled quantity (e.g. a missed calcium label). Same-row extra numbers remain ambiguous.
    const firstBreak=body.indexOf("\n");
    if(firstBreak>=0&&/%/.test(body.slice(0,firstBreak)))body=body.slice(0,firstBreak);
    const headerUnit=body.match(/^\s*\(\s*(千焦|千卡|毫克|kcal|kJ|mq|mg|g|q|克)\s*\)\s*[:：]?\s*([+-]?[0-9OoIl|]+(?:[ \t]*[.,][ \t]*[0-9OoIl|]+)?)(?![0-9OoIl|.,])/i);
    if(headerUnit){const remaining=body.slice(headerUnit[0].length);body=headerUnit[2]+(/^[ \t]*(?:千焦|千卡|毫克|kcal|kJ|mq|mg|g|q|克)(?![a-z])/i.test(remaining)?"":headerUnit[1])+remaining}
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
      if(!field||(!isEnergy&&unit!=="mg"&&unit!=="g"))continue;
      if(normalizedLabels.has(name)||headerUnit)correctedFields.add(field);
      affected.add(field);
      // 1,000 may be a thousands grouping or a decimal. Neither interpretation is safe.
      if(/,\d{3}$/.test(value[1].replace(/[ \t]/g,""))){ambiguousFields.add(field);issues.push(`AMBIGUOUS_SEPARATOR:${field}`);continue;}
      const corrected=value[1].replace(/[ \t]/g,"").replace(/[Oo]/g,"0").replace(/[Il|]/g,"1").replace(",",".");
      let number=Number(corrected);
      if(!isEnergy){if(field==="sodiumMg"&&unit==="g")number*=1000;else if(field!=="sodiumMg"&&unit==="mg")number/=1000}
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
export type ParsedIngredientsLabel={rawText:string;bodyText:string;ingredients:string[];quality:{confidence:number;issues:string[];complete:boolean;needsConfirmation:boolean}};
export function parseIngredientsLabel(rawText:string):ParsedIngredientsLabel{
  const text=rawText.normalize("NFKC"),heading=/(?:配料表?|ingredients?)\s*[:：]?\s*/i.exec(text);
  let body=heading?text.slice(heading.index+heading[0].length):text;
  const issues:string[]=[];
  if(!heading)issues.push("INGREDIENTS_HEADING_MISSING");
  // A following label is not another ingredient. Never cut a nested compound list.
  const boundary=/营养成分表|营养信息|生产日期|制造日期|保质期|有效期|贮存条件|储存条件|储存方法|贮存方法|净含量|产品标准|执行标准|生产许可证|生产商|制造商|致敏原|过敏原|Nutrition\s*Facts|Best\s*Before|Storage/gi;
  for(const match of body.matchAll(boundary)){
    const prefix=body.slice(0,match.index),depth=[...prefix].reduce((n,c)=>/[([{【]/.test(c)?n+1:/[)\]}】]/.test(c)?n-1:n,0);
    if(depth===0){body=prefix;break}
  }
  body=body.trim().replace(/[。;；、,，\s]+$/,"");
  if(/\S[ \t]*\r?\n[ \t]*\S/.test(body))issues.push("INGREDIENTS_LINE_WRAP_REVIEW");
  // OCR line wraps are not proof of ingredient separators (e.g. 小\n麦粉).
  body=body.replace(/\r?\n/g,"").replace(/[ \t]+/g," ");
  const ingredients:string[]=[],stack:string[]=[],pairs:Record<string,string>={"(":")","[":"]","{":"}","【":"】"};
  let current="";
  for(const char of body){
    if(pairs[char])stack.push(pairs[char]);
    else if(/[)\]}】]/.test(char)){if(stack.pop()!==char)issues.push("INGREDIENTS_UNBALANCED_BRACKETS")}
    if(!stack.length&&/[、,，;；。]/.test(char)){if(current.trim())ingredients.push(current.trim());current=""}
    else current+=char;
  }
  if(current.trim())ingredients.push(current.trim());
  if(stack.length)issues.push("INGREDIENTS_UNBALANCED_BRACKETS");
  if(!ingredients.length)issues.push("OCR_NO_TEXT");
  if(ingredients.some(value=>!/[\u4e00-\u9fffA-Za-z]/.test(value)))issues.push("INGREDIENTS_INVALID_TOKEN");
  const unique=[...new Set(issues)],complete=ingredients.length>0&&unique.length===0;
  return{rawText,bodyText:body,ingredients,quality:{confidence:complete?1:ingredients.length?Math.max(.1,.7-unique.length*.2):0,issues:unique,complete,needsConfirmation:!complete}};
}
export function parseIngredients(text:string){return parseIngredientsLabel(text).ingredients}
export function nutritionCompleteness(result:ParsedLabel){
  const count=corePresent(result.nutrients),basis=result.basisAmount!=null&&result.basisUnit!=null;
  const clean=result.quality.correctedFields.length===0&&result.quality.ambiguousFields.length===0;
  return{score:Math.round(result.quality.confidence*100),complete:basis&&count===5&&clean,fieldCount:count,basisFound:basis};
}
const datePattern=/(?<!\d)20\d{2}(?:(?:年|[.\/-])\s*\d{1,2}(?:月|[.\/-])\s*\d{1,2}日?|\d{4})(?!\d)/g;
function dateString(y:number,m:number,d:number){return `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`}
export function normalizeDate(value:string){
  const v=value.normalize("NFKC").trim(),compact=/^(20\d{2})(\d{2})(\d{2})$/.exec(v),split=/^(20\d{2})(?:年|[.\/-])\s*(\d{1,2})(?:月|[.\/-])\s*(\d{1,2})日?$/.exec(v),parts=compact??split;
  if(!parts)return null;
  const y=Number(parts[1]),m=Number(parts[2]),d=Number(parts[3]),dt=new Date(y,m-1,d);
  return dt.getFullYear()===y&&dt.getMonth()===m-1&&dt.getDate()===d?dateString(y,m,d):null;
}
export function parseDates(text:string){return [...new Set([...text.normalize("NFKC").matchAll(datePattern)].map(match=>normalizeDate(match[0])).filter((v):v is string=>v!==null))]}
export type ParsedDateLabel={rawText:string;productionDate:string|null;explicitExpiryDate:string|null;computedExpiryDate:string|null;expiryDate:string|null;shelfLife:{amount:number;unit:"days"|"months"|"years";rawText:string}|null;batch:string|null;unclassifiedDates:string[];quality:{confidence:number;issues:string[];needsConfirmation:boolean}};
function addShelfLife(date:string,amount:number,unit:"days"|"months"|"years"){
  const [y,m,day]=date.split("-").map(Number);
  if(unit==="days"){const result=new Date(y,m-1,day);result.setDate(result.getDate()+amount);return dateString(result.getFullYear(),result.getMonth()+1,result.getDate())}
  const target=new Date(y,m-1+(unit==="years"?amount*12:amount),1),lastDay=new Date(target.getFullYear(),target.getMonth()+1,0).getDate();
  return dateString(target.getFullYear(),target.getMonth()+1,Math.min(day,lastDay));
}
export function parseDateLabel(rawText:string):ParsedDateLabel{
  const text=rawText.normalize("NFKC"),issues:string[]=[],production:string[]=[],expiry:string[]=[],unclassified:string[]=[];
  const rolePattern=/生产日期|制造日期|包装日期|生产|制造|(?:PRODUCTION|PROD|MFG)(?:\s*DATE)?|有效期(?:至|截止)?|到期日|失效日期|有效日期|截止日期|保质期至|EXP(?:IRY)?(?:\s*DATE)?|Best\s*Before|批次(?:号)?|批号|LOT(?:\s*NO)?/gi;
  let previousEnd=0;
  for(const match of text.matchAll(datePattern)){
    const value=normalizeDate(match[0]),start=match.index??0,context=text.slice(previousEnd,start),roleMatch=[...context.matchAll(rolePattern)].at(-1);
    // Only a directly adjacent label establishes a role. A distant heading is not evidence.
    const gap=roleMatch?context.slice((roleMatch.index??0)+roleMatch[0].length):"";
    const role=roleMatch&&gap.length<=32&&/^[\s:：#./为-]*$/.test(gap)?roleMatch[0]:"";
    previousEnd=start+match[0].length;
    if(!value){issues.push("DATE_INVALID_VALUE");continue}
    if(/批|LOT/i.test(role))continue;
    if(/包装/.test(role)){unclassified.push(value);issues.push("DATE_PACKAGING_NOT_PRODUCTION");continue}
    if(/生产|制造|PROD|MFG/i.test(role))production.push(value);
    else if(role)expiry.push(value);
    else unclassified.push(value);
  }
  const productionUnique=[...new Set(production)],expiryUnique=[...new Set(expiry)];
  if(productionUnique.length>1)issues.push("DATE_PRODUCTION_CONFLICT");
  if(expiryUnique.length>1)issues.push("DATE_EXPIRY_CONFLICT");
  const productionDate=productionUnique.length===1?productionUnique[0]:null,explicitExpiryDate=expiryUnique.length===1?expiryUnique[0]:null;
  const shelfMatches=[...text.matchAll(/(?:保质期|Shelf\s*Life)\s*[:：]?\s*(\d+)\s*(天|日|个?月|年|days?|months?|years?)/gi)];
  const shelves=shelfMatches.map(match=>({amount:Number(match[1]),unit:(/天|日|day/i.test(match[2])?"days":/月|month/i.test(match[2])?"months":"years") as "days"|"months"|"years",rawText:match[0]}));
  const shelfKeys=new Set(shelves.map(value=>`${value.amount}:${value.unit}`));
  if(shelfKeys.size>1)issues.push("DATE_SHELF_LIFE_CONFLICT");
  const shelfLife=shelfKeys.size===1&&shelves[0].amount>0?shelves[0]:null;
  const computedExpiryDate=productionDate&&shelfLife?addShelfLife(productionDate,shelfLife.amount,shelfLife.unit):null;
  if(explicitExpiryDate&&computedExpiryDate&&explicitExpiryDate!==computedExpiryDate)issues.push("DATE_EXPIRY_COMPUTATION_CONFLICT");
  if(productionDate&&explicitExpiryDate&&explicitExpiryDate<productionDate)issues.push("DATE_EXPIRY_BEFORE_PRODUCTION");
  if(unclassified.length)issues.push("DATE_ROLE_UNCLASSIFIED");
  const batch=text.match(/(?:批次(?:号)?|批号|LOT(?:\s*NO)?)\s*[:：.#]?\s*([A-Za-z0-9][A-Za-z0-9./_-]*)/i)?.[1]??null;
  const expiryDate=issues.some(value=>/CONFLICT|BEFORE_PRODUCTION/.test(value))?null:explicitExpiryDate??computedExpiryDate;
  if(!expiryDate)issues.push("DATE_EXPIRY_MISSING");
  const unique=[...new Set(issues)];
  return{rawText,productionDate,explicitExpiryDate,computedExpiryDate,expiryDate,shelfLife,batch,unclassifiedDates:[...new Set(unclassified)],quality:{confidence:expiryDate&&unique.length===0?1:(expiryDate?0.5:0),issues:unique,needsConfirmation:unique.length>0||!expiryDate||!!computedExpiryDate}};
}
export function expiryFromText(text:string){return parseDateLabel(text).expiryDate}
export function detectFoodImageType(text:string):FoodImageType{const nutrition=(text.match(/营养成分表|NRV|蛋白质|脂肪|碳水化合物|钠/g)||[]).length,ingredients=(text.match(/配料表?|ingredients?/gi)||[]).length,expiry=(text.match(/生产日期|制造日期|有效期|保质期|EXP|Best\s*Before/gi)||[]).length;if(nutrition>=2)return"nutrition_label";if(ingredients)return"ingredients";if(expiry||parseDates(text).length)return"expiry";return"general_packaging"}
export function isLocalResultComplete(type:FoodImageType,text:string){if(!text.trim())return false;if(type==="nutrition_label")return nutritionCompleteness(parseNutritionLabel(text)).complete;if(type==="ingredients")return parseIngredientsLabel(text).quality.complete;if(type==="expiry")return !parseDateLabel(text).quality.needsConfirmation;return text.trim().length>=24}
