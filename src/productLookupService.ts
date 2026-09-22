import * as DB from "./database";
import { normalizeBarcode } from "./barcode";
import { lookupBarcode, OnlineProduct } from "./productLookup";
import { Product } from "./types";

export type ProductLookupResult=
  |{kind:"local";barcode:string;product:Product}
  |{kind:"online";barcode:string;product:OnlineProduct}
  |{kind:"not_found"|"offline"|"timeout"|"error";barcode:string};

export async function findProductByBarcode(raw:string):Promise<ProductLookupResult>{
  const barcode=normalizeBarcode(raw).normalized;
  if(!barcode)return{kind:"not_found",barcode:""};
  const local=await DB.findBarcode(barcode);
  if(local)return{kind:"local",barcode,product:local};
  const online=await lookupBarcode(barcode);
  if(online.ok)return{kind:"online",barcode,product:online.product};
  return{kind:online.error==="NO_NETWORK"?"offline":online.error==="ONLINE_TIMEOUT"?"timeout":online.error==="PRODUCT_NOT_ONLINE"?"not_found":"error",barcode};
}
