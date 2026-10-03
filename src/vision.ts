import * as SecureStore from "expo-secure-store";
import * as LegacyFS from "expo-file-system/legacy";
import{logScanEvent}from"./scanMetrics";
import{requestVision}from"./visionRequest";

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
  date_label?:{production_date:string|null;expiry_date:string|null;shelf_life:string|null;batch:string|null}|null;
  uncertain_fields:string[];
  confidence?:Record<string,number>;
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


export class OpenAICompatibleFoodVisionProvider implements FoodVisionProvider{
  constructor(private config:VisionConfig){}
  protected async request(imageUri:string,mode:VisionMode){
    return requestVision(this.config,mode,()=>LegacyFS.readAsStringAsync(imageUri,{encoding:LegacyFS.EncodingType.Base64}),logScanEvent);
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
