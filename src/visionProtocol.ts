export type VisionMode="auto"|"product_packaging"|"nutrition_label"|"ingredients"|"expiry";
export type VisionConfig={endpoint:string;model:string;apiKey:string};
export type StructuredResult={
  detected_type:"nutrition_label"|"ingredients"|"expiry"|"general_packaging";
  product_name:string|null;brand?:string|null;variant?:string|null;quantity?:string|null;category?:string|null;
  visible_text?:string[];barcode?:string|null;raw_text:string;
  basis?:{amount:number;unit:string}|null;nutrition?:Record<string,number|null>|null;
  ingredients?:string[]|null;dates?:string[]|null;uncertain_fields:string[];confidence?:Record<string,number>;
};
export const nutritionKeys=["energy_kj","energy_kcal","protein_g","fat_g","carbohydrate_g","total_sugar_g","added_sugar_g","fiber_g","sodium_mg"];
const schema=`只返回一个JSON对象，不要Markdown。只读图片明确可见的信息；看不清或没出现返回null，禁止猜测或单位换算。
结构：{"detected_type":"nutrition_label|ingredients|expiry|general_packaging","brand":null,"product_name":null,"variant":null,"quantity":null,"category":null,"visible_text":[],"barcode":null,"basis":null,"nutrition":null,"ingredients":null,"dates":null,"raw_text":"","uncertain_fields":[],"confidence":{}}。
basis只在图片明确写出基准时返回{"amount":数字,"unit":"g|mL|份|包装"}，不默认100g。
nutrition中的字段为energy_kj,energy_kcal,protein_g,fat_g,carbohydrate_g,total_sugar_g,added_sugar_g,fiber_g,sodium_mg，数值或null。
不要从NRV%取值。多个基准列无法明确区分时相应值返回null。added_sugar_g只有明确写出添加糖数值才可填写，不能由总糖或配料推算。raw_text忠实抄录可见文字，保留小数点、单位和行。confidence记录每个字段0到1的自评，uncertain_fields列出不确定字段。`;
const focus:Record<VisionMode,string>={
  nutrition_label:"这是一张中国食品包装营养成分表。只提取明确可见的营养字段和计量基准。能量的kJ和kcal各自独立，禁止换算、补全或从常识估计。",
  ingredients:"这是食品配料表。按原文顺序逐项抄录配料，无法读出的部分保留不确定标记；不要用常见配方补齐。",
  expiry:"这是食品包装的日期或喷码。只抄录明确可见的生产日期、保质期或到期日期，不推算到期日，不把批号当日期。",
  product_packaging:"这是食品包装。只提取可见品牌、商品名、规格、口味和条码。不要把背景或广告词当商品名，不根据包装推测营养值。",
  auto:"识别这是营养表、配料表、日期还是一般食品包装，再提取对应可见字段。",
};
export function visionConfigIssue(config:VisionConfig):string|null{
  if(typeof config.apiKey!=="string"||!config.apiKey.trim())return"VISION_NOT_CONFIGURED";
  if(typeof config.endpoint!=="string"||typeof config.model!=="string")return"VISION_CONFIG_INVALID";
  try{const u=new URL(config.endpoint);if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||!config.model.trim())return"VISION_CONFIG_INVALID"}catch{return"VISION_CONFIG_INVALID"}
  return null;
}
export function buildVisionBody(config:VisionConfig,base64:string,mode:VisionMode){
  if(!base64||!/^[A-Za-z0-9+/]+={0,2}$/.test(base64))throw new Error("VISION_IMAGE_INVALID");
  return {model:config.model,response_format:{type:"json_object"},messages:[{role:"system",content:schema},{role:"user",content:[{type:"text",text:focus[mode]},{type:"image_url",image_url:{url:`data:image/jpeg;base64,${base64}`,detail:"high"}}]}]};
}
const stringValue=(v:unknown)=>typeof v==="string"&&v.trim()?v.trim():null;
const strings=(v:unknown)=>Array.isArray(v)?v.filter((x):x is string=>typeof x==="string"):[];
export function validateVisionResult(value:unknown,mode:VisionMode):StructuredResult{
  if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("VISION_INVALID_RESPONSE");
  const v=value as Record<string,any>;
  const expected=mode==="product_packaging"?"general_packaging":mode;
  if(!["nutrition_label","ingredients","expiry","general_packaging"].includes(v.detected_type)||typeof v.raw_text!=="string"||!Array.isArray(v.uncertain_fields))throw new Error("VISION_INVALID_RESPONSE");
  if(mode!=="auto"&&v.detected_type!==expected)throw new Error("VISION_INVALID_RESPONSE:wrong_task");
  const uncertain=strings(v.uncertain_fields);
  let basis:StructuredResult["basis"]=null;
  if(v.basis!=null){
    if(typeof v.basis.amount!=="number"||!Number.isFinite(v.basis.amount)||v.basis.amount<=0||!["g","ml","mL","份","包装","serving"].includes(v.basis.unit))throw new Error("VISION_INVALID_RESPONSE:basis");
    basis={amount:v.basis.amount,unit:v.basis.unit==="ml"?"mL":v.basis.unit==="serving"?"份":v.basis.unit};
  }
  let nutrition:StructuredResult["nutrition"]=null;
  if(v.nutrition!=null){
    if(typeof v.nutrition!=="object"||Array.isArray(v.nutrition))throw new Error("VISION_INVALID_RESPONSE:nutrition");
    nutrition={};
    for(const key of nutritionKeys){const n=v.nutrition[key];
      if(n!=null&&(typeof n!=="number"||!Number.isFinite(n)||n<0))throw new Error(`VISION_INVALID_RESPONSE:${key}`);
      nutrition[key]=n??null;
    }
    // Reject invented added sugar unless the response also transcribes explicit evidence.
    const addedEvidence=v.raw_text.match(/(?:添加糖|added\s+sugars?)\s*[:：]?\s*(\d+(?:[.,]\d+)?)\s*(?:g|克)/i);
    if(nutrition.added_sugar_g!=null&&(!addedEvidence||Number(addedEvidence[1].replace(",","."))!==nutrition.added_sugar_g)){
      nutrition.added_sugar_g=null;uncertain.push("added_sugar_g");
    }
  }
  const confidence:Record<string,number>={};
  if(v.confidence&&typeof v.confidence==="object")for(const key of nutritionKeys){const n=v.confidence[key];if(typeof n==="number"&&n>=0&&n<=1)confidence[key]=n}
  return{detected_type:v.detected_type,raw_text:v.raw_text,basis,nutrition,confidence,uncertain_fields:[...new Set(uncertain)],
    product_name:stringValue(v.product_name),brand:stringValue(v.brand),variant:stringValue(v.variant),quantity:stringValue(v.quantity),category:stringValue(v.category),barcode:stringValue(v.barcode),visible_text:strings(v.visible_text),ingredients:v.ingredients==null?null:strings(v.ingredients),dates:v.dates==null?null:strings(v.dates)};
}
