import * as DB from "./database";
import { normalizeBarcode } from "./barcode";
import { lookupBarcode, OnlineProduct } from "./productLookup";
import { Product } from "./types";
import { logScanEvent, logScanError } from "./scanMetrics";

export type ProductLookupResult=
  |{kind:"local";barcode:string;product:Product}
  |{kind:"online";barcode:string;product:OnlineProduct}
  |{kind:"not_found"|"offline"|"timeout"|"http_error"|"network_error"|"invalid_response";barcode:string};

export async function findProductByBarcode(raw:string):Promise<ProductLookupResult>{
  const barcode=normalizeBarcode(raw).normalized;
  if(!barcode)return{kind:"not_found",barcode:""};
  let local:Product|null=null;
  try{local=await DB.findBarcode(barcode)}catch(error){await logScanError("barcode_local_database",error)}
  if(local)return{kind:"local",barcode,product:local};
  await logScanEvent("BARCODE_LOCAL_MISS",{barcode,next:"public_network_lookup"});
  const online=await lookupBarcode(barcode);
  if(online.ok)return{kind:"online",barcode,product:online.product};
  return{kind:online.error==="NO_NETWORK"?"offline":online.error==="ONLINE_TIMEOUT"?"timeout":online.error==="PRODUCT_NOT_ONLINE"?"not_found":online.error==="ONLINE_HTTP_ERROR"?"http_error":online.error==="ONLINE_INVALID_RESPONSE"?"invalid_response":"network_error",barcode};
}
