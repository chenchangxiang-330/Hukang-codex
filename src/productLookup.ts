import NetInfo from "@react-native-community/netinfo";
import { classifyLookupBody, normalizeOnlineProduct } from "./productOnlineLogic";
import type { OnlineProduct } from "./productOnlineLogic";
import { requestProductJson, type ProductRequestError } from "./productRequest";
import { logScanEvent } from "./scanMetrics";
export type { OnlineProduct } from "./productOnlineLogic";
export type LookupError="NO_NETWORK"|"PRODUCT_NOT_ONLINE"|ProductRequestError;
export type LookupResult={ok:true;product:OnlineProduct}|{ok:false;error:LookupError};
export async function lookupBarcode(barcode:string):Promise<LookupResult>{
  try{
    const net=await NetInfo.fetch();
    await logScanEvent("NETWORK_STATUS",{scope:"barcode",connected:net.isConnected,internetReachable:net.isInternetReachable});
    if(net.isConnected===false||net.isInternetReachable===false){await logScanEvent("BARCODE_NETWORK_NOT_SENT",{reason:"NO_NETWORK"});return{ok:false,error:"NO_NETWORK"}}
    const fields="product_name,product_name_zh,brands,quantity,image_front_url,ingredients_text,ingredients_text_zh,nutrition_data_per,nutriments";
    const result=await requestProductJson(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${fields}`,"barcode",logScanEvent,{timeoutMs:7000,allowNotFound:true});
    if(!result.ok)return result;
    const kind=classifyLookupBody(result.body);
    await logScanEvent("BARCODE_LOOKUP_RESPONSE",{barcode,outcome:kind,httpStatus:result.status,durationMs:result.durationMs});
    if(kind!=="found")return{ok:false,error:kind==="not_found"?"PRODUCT_NOT_ONLINE":"ONLINE_INVALID_RESPONSE"};
    const product=normalizeOnlineProduct(result.body.product);
    await logScanEvent("ONLINE_PRODUCT_NORMALIZED",{barcode,warnings:product.warnings,nutritionBasisKnown:product.nutritionBasisKnown,basis:{amount:product.basisAmount,unit:product.basisUnit},nutrients:product.nutrients});
    return{ok:true,product};
  }catch(error){await logScanEvent("BARCODE_LOOKUP_FAILED",{code:"ONLINE_NETWORK_ERROR",error:error instanceof Error?error.name:"UNKNOWN"});return{ok:false,error:"ONLINE_NETWORK_ERROR"}}
}
