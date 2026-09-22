import * as SecureStore from "expo-secure-store";
import * as LegacyFS from "expo-file-system/legacy";
import{logScanEvent}from"./scanMetrics";

export type VisionMode="auto"|"product_packaging"|"nutrition_label"|"ingredients"|"expiry";
export type VisionConfig={endpoint:string;model:string;apiKey:string};
export type StructuredResult={
  detected_type:"nutrition_label"|"ingredients"|"expiry"|"general_packaging";
  brand?:string|null;
  product_name:string|null;
  variant?:string|null;
  quantity?:string|null;
  category?:string|null;
  visible_text?:string[];
  barcode?:string|null;
  raw_text:string;
  basis?:{amount:number;unit:string}|null;
  nutrition?:Record<string,number|null>|null;
  ingredients?:string[]|null;
  dates?:string[]|null;
  uncertain_fields:string[];
};

export interface FoodVisionProvider{
  analyzeProduct(imageUri:string):Promise<StructuredResult>;
  analyzeFoodImage(imageUri:string):Promise<StructuredResult>;
  analyzeNutrition(imageUri:string):Promise<StructuredResult>;
  analyzeIngredients(imageUri:string):Promise<StructuredResult>;
  analyzeExpiry(imageUri:string):Promise<StructuredResult>;
}

const KEY="hukang.vision.config";
const defaults={endpoint:"https://api.openai.com/v1/chat/completions",model:"gpt-4.1-mini",apiKey:""};
export async function getVisionConfig():Promise<VisionConfig>{const raw=await SecureStore.getItemAsync(KEY);try{return raw?{...defaults,...JSON.parse(raw)}:defaults}catch{return defaults}}
export async function saveVisionConfig(config:VisionConfig){await SecureStore.setItemAsync(KEY,JSON.stringify(config),{keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY})}

const schema=`Return one JSON object only. Never infer, estimate, or use common knowledge for a value that is not visibly present; use null and list its path in uncertain_fields. Schema: {"detected_type":"nutrition_label|ingredients|expiry|general_packaging","brand":null,"product_name":null,"variant":null,"quantity":null,"category":null,"visible_text":[],"barcode":null,"basis":{"amount":100,"unit":"g|ml|serving"},"nutrition":{"energy_kj":null,"energy_kcal":null,"protein_g":null,"fat_g":null,"carbohydrate_g":null,"total_sugar_g":null,"added_sugar_g":null,"fiber_g":null,"sodium_mg":null},"ingredients":null,"dates":null,"raw_text":"","uncertain_fields":[]}. For product_packaging, read only visible brand, product name, variant, flavor, category, quantity, barcode, and visible text. Keep carbohydrate, total sugar, and added sugar independent. If added sugar is not explicitly quantified, added_sugar_g must be null.`;
const allowedTypes=new Set(["nutrition_label","ingredients","expiry","general_packaging"]);
function nullableNumber(v:unknown){return typeof v==="number"&&Number.isFinite(v)?v:null}
function validate(value:any):StructuredResult{
  if(!value||typeof value!=="object")throw new Error("ONLINE_API_ERROR:invalid_result");
  const detected_type=allowedTypes.has(value.detected_type)?value.detected_type:"general_packaging";
  const nutrition=value.nutrition&&typeof value.nutrition==="object"?Object.fromEntries(["energy_kj","energy_kcal","protein_g","fat_g","carbohydrate_g","total_sugar_g","added_sugar_g","fiber_g","sodium_mg"].map(k=>[k,nullableNumber(value.nutrition[k])])):null;
  const basis=value.basis&&typeof value.basis==="object"&&typeof value.basis.amount==="number"&&typeof value.basis.unit==="string"?{amount:value.basis.amount,unit:value.basis.unit}:null;
  const stringOrNull=(v:unknown)=>typeof v==="string"&&v.trim()?v.trim():null;
  return{detected_type,brand:stringOrNull(value.brand),product_name:stringOrNull(value.product_name),variant:stringOrNull(value.variant),quantity:stringOrNull(value.quantity),category:stringOrNull(value.category),visible_text:Array.isArray(value.visible_text)?value.visible_text.filter((x:unknown)=>typeof x==="string"):[],barcode:stringOrNull(value.barcode),raw_text:typeof value.raw_text==="string"?value.raw_text:"",basis,nutrition,ingredients:Array.isArray(value.ingredients)?value.ingredients.filter((x:unknown)=>typeof x==="string"):null,dates:Array.isArray(value.dates)?value.dates.filter((x:unknown)=>typeof x==="string"):null,uncertain_fields:Array.isArray(value.uncertain_fields)?value.uncertain_fields.filter((x:unknown)=>typeof x==="string"):[]};
}

export class OpenAICompatibleFoodVisionProvider implements FoodVisionProvider{
  constructor(private config:VisionConfig){}
  protected async request(imageUri:string,mode:VisionMode){
    if(!this.config.apiKey)throw new Error("ONLINE_NOT_CONFIGURED");
    const base64=await LegacyFS.readAsStringAsync(imageUri,{encoding:LegacyFS.EncodingType.Base64});
    const imageBytes=Math.floor(base64.length*3/4);await logScanEvent("VISION_REQUEST_STARTED",{mode,endpoint:this.config.endpoint});await logScanEvent("IMAGE_BYTES_LENGTH",{value:imageBytes});if(!imageBytes)throw new Error("PHOTO_FILE_INVALID");
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    try{
      const response=await fetch(this.config.endpoint,{method:"POST",signal:controller.signal,headers:{"Content-Type":"application/json","Authorization":`Bearer ${this.config.apiKey}`},body:JSON.stringify({model:this.config.model,response_format:{type:"json_object"},messages:[{role:"system",content:schema},{role:"user",content:[{type:"text",text:`Read the food package image. Requested focus: ${mode}. Return only the schema JSON.`},{type:"image_url",image_url:{url:`data:image/jpeg;base64,${base64}`}}]}]})});
      await logScanEvent("HTTP_STATUS",{scope:"vision",status:response.status});if(!response.ok)throw new Error(`ONLINE_API_ERROR:${response.status}`);
      const json=await response.json(),content=json.choices?.[0]?.message?.content;
      if(typeof content!=="string")throw new Error("ONLINE_API_ERROR:empty");
      const result=validate(JSON.parse(content));await logScanEvent("VISION_RESPONSE_RECEIVED",{type:result.detected_type,uncertain:result.uncertain_fields});return result;
    }finally{clearTimeout(timer)}
  }
  analyzeFoodImage(uri:string){return this.request(uri,"auto")}
  analyzeProduct(uri:string){return this.request(uri,"product_packaging")}
  analyzeNutrition(uri:string){return this.request(uri,"nutrition_label")}
  analyzeIngredients(uri:string){return this.request(uri,"ingredients")}
  analyzeExpiry(uri:string){return this.request(uri,"expiry")}
}

// Kept as a compatibility adapter for older internal screens while V1.3 routes use FoodVisionProvider.
export class OpenAICompatibleVisionProvider extends OpenAICompatibleFoodVisionProvider{
  analyze(uri:string,mode:Exclude<VisionMode,"auto">){return mode==="nutrition_label"?this.analyzeNutrition(uri):mode==="ingredients"?this.analyzeIngredients(uri):this.analyzeExpiry(uri)}
}
