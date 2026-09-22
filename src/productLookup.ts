import NetInfo from "@react-native-community/netinfo";
import { Nutrients } from "./types";
export type LookupError="NO_NETWORK"|"PRODUCT_NOT_ONLINE"|"ONLINE_TIMEOUT"|"ONLINE_API_ERROR";
export type OnlineProduct={name:string;brand:string;netContent:string;ingredients:string;imageUri:string;basisAmount:number;basisUnit:string;nutrients:Nutrients};
export type LookupResult={ok:true;product:OnlineProduct}|{ok:false;error:LookupError};
const finite=(v:unknown)=>typeof v==="number"&&Number.isFinite(v)?v:null;
export async function lookupBarcode(barcode:string):Promise<LookupResult>{
  const net=await NetInfo.fetch();if(net.isConnected===false)return{ok:false,error:"NO_NETWORK"};
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),7000);
  try{
    const fields="product_name,product_name_zh,brands,quantity,image_front_url,ingredients_text,ingredients_text_zh,nutrition_data_per,nutriments";
    const r=await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${fields}`,{signal:controller.signal,headers:{"User-Agent":"HuKang/1.4 (Android; contact: local-test)"}});
    if(!r.ok)return{ok:false,error:"ONLINE_API_ERROR"};const j=await r.json(),p=j.product;if(j.status!==1||!p?.product_name&&!p?.product_name_zh)return{ok:false,error:"PRODUCT_NOT_ONLINE"};
    const n=p.nutriments??{},per=p.nutrition_data_per==="serving"?"份":/ml/i.test(p.nutrition_data_per)?"mL":"g";
    return{ok:true,product:{name:p.product_name_zh||p.product_name,brand:p.brands||"",netContent:p.quantity||"",ingredients:p.ingredients_text_zh||p.ingredients_text||"",imageUri:p.image_front_url||"",basisAmount:per==="份"?1:100,basisUnit:per,nutrients:{energyKj:finite(n["energy-kj_100g"]??n["energy-kj"]),energyKcal:finite(n["energy-kcal_100g"]??n["energy-kcal"]),proteinG:finite(n.proteins_100g),fatG:finite(n.fat_100g),carbohydrateG:finite(n.carbohydrates_100g),totalSugarG:finite(n.sugars_100g),addedSugarG:null,fiberG:finite(n.fiber_100g),sodiumMg:finite(n.sodium_100g)==null?null:(n.sodium_100g*1000)}}};
  }catch(e){return{ok:false,error:e instanceof Error&&e.name==="AbortError"?"ONLINE_TIMEOUT":"ONLINE_API_ERROR"}}finally{clearTimeout(timer)}
}
