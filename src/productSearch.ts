import NetInfo from"@react-native-community/netinfo";
import*as DB from"./database";
import{lookupBarcode}from"./productLookup";
import{normalizeBarcode}from"./barcode";
import{logScanEvent}from"./scanMetrics";
import{Nutrients,Product}from"./types";
import{scoreProductCandidate}from"./productSearchLogic";
import{buildPublicProductQuery,emptyOnlineNutrients,normalizeOnlineProduct,summarizeSearchNetwork,type SearchFailure}from"./productOnlineLogic";
import{requestProductJson}from"./productRequest";

export type ProductSearchInput={barcode?:string|null;brand?:string|null;productName?:string|null;variant?:string|null;quantity?:string|null;keywords?:string[]};
export type ProductCandidate={key:string;productId?:number;name:string;brand:string;variant:string;quantity:string;imageUri:string;barcode:string|null;ingredients:string;basisAmount:number;basisUnit:string;nutrients:Nutrients;source:"local"|"open_food_facts";score:number;warnings?:string[];needsConfirmation?:boolean;nutritionBasisKnown?:boolean};
export type ProductSearchResult={candidates:ProductCandidate[];query:string;network:"online"|SearchFailure|"not_requested";failures?:SearchFailure[];completedRequests?:number};
const clean=(v?:string|null)=>v?.trim().toLowerCase().replace(/\s+/g,"")||"";
function fromLocal(p:Product):ProductCandidate{return{key:`local-${p.id}`,productId:p.id,name:p.name,brand:p.brand||"",variant:p.variant||"",quantity:p.netContent?`${p.netContent}${p.netContentUnit||""}`:"",imageUri:p.imageUri||"",barcode:p.normalizedBarcode||p.barcode,ingredients:p.ingredients||"",basisAmount:p.basisAmount,basisUnit:p.basisUnit,nutrients:{...emptyOnlineNutrients(),energyKcal:p.energyKcal,energyKj:p.energyKj,proteinG:p.proteinG,fatG:p.fatG,saturatedFatG:p.saturatedFatG,transFatG:p.transFatG,carbohydrateG:p.carbohydrateG,totalSugarG:p.totalSugarG,addedSugarG:p.addedSugarG,fiberG:p.fiberG,sodiumMg:p.sodiumMg},source:"local",score:0}}
function fromOpenFoodFacts(p:any,index:number):ProductCandidate{const safe=normalizeOnlineProduct(p);return{key:`off-${p.code||index}`,name:safe.name,brand:safe.brand,variant:p.generic_name_zh||p.generic_name||"",quantity:safe.netContent,imageUri:safe.imageUri,barcode:p.code||null,ingredients:safe.ingredients,basisAmount:safe.basisAmount,basisUnit:safe.basisUnit,nutrients:safe.nutrients,warnings:safe.warnings,needsConfirmation:true,nutritionBasisKnown:safe.nutritionBasisKnown,source:"open_food_facts",score:0}}
function fromBarcodeOnline(p:ReturnType<typeof normalizeOnlineProduct>,barcode:string):ProductCandidate{return{key:`off-${barcode}`,name:p.name,brand:p.brand,variant:"",quantity:p.netContent,imageUri:p.imageUri,barcode,ingredients:p.ingredients,basisAmount:p.basisAmount,basisUnit:p.basisUnit,nutrients:p.nutrients,warnings:p.warnings,needsConfirmation:true,nutritionBasisKnown:p.nutritionBasisKnown,source:"open_food_facts",score:100}}
const failureFor=(code:string):SearchFailure=>code==="NO_NETWORK"?"offline":code==="ONLINE_TIMEOUT"?"timeout":code==="ONLINE_HTTP_ERROR"?"http_error":code==="ONLINE_INVALID_RESPONSE"?"invalid_response":"network_error";
async function requestProducts(url:string,source:string){const result=await requestProductJson(url,source,logScanEvent);if(!result.ok)return{ok:false as const,error:failureFor(result.error)};if(!Array.isArray(result.body.products)){await logScanEvent("PRODUCT_SEARCH_SOURCE_FAILED",{source,error:"ONLINE_INVALID_RESPONSE"});return{ok:false as const,error:"invalid_response" as const}}const products=result.body.products;await logScanEvent("SEARCH_RESULT_RECEIVED",{source,count:products.length});return{ok:true as const,products}}

export async function searchProducts(input:ProductSearchInput):Promise<ProductSearchResult>{
  const query=buildPublicProductQuery(input);
  await logScanEvent("PRODUCT_SEARCH_STARTED",{input});await logScanEvent("SEARCH_QUERY",{query});
  const local=input.barcode?await DB.findBarcode(normalizeBarcode(input.barcode).normalized):null;if(local){const candidate=fromLocal(local);candidate.score=scoreProductCandidate(candidate,input);await logScanEvent("PRODUCT_SEARCH_LOCAL_HIT",{count:1});await logScanEvent("SEARCH_RESULT_COUNT",{source:"local_barcode",value:1});return{candidates:[candidate],query,network:"not_requested"}}
  const all=await DB.getProducts(),localMatches=all.map(fromLocal).map(c=>({...c,score:scoreProductCandidate(c,input)})).filter(c=>c.score>=25).sort((a,b)=>b.score-a.score);
  if(!input.barcode&&localMatches[0]?.score>=60){await logScanEvent("PRODUCT_SEARCH_LOCAL_HIT",{count:localMatches.length});await logScanEvent("SEARCH_RESULT_COUNT",{source:"local_text",value:Math.min(localMatches.length,5)});return{candidates:localMatches.slice(0,5),query,network:"not_requested"}}
  const results=[...localMatches];
  const failures:SearchFailure[]=[];let completedRequests=0;
  try{
    const network=await NetInfo.fetch();await logScanEvent("NETWORK_STATUS",{connected:network.isConnected,internetReachable:network.isInternetReachable});if(network.isConnected===false||network.isInternetReachable===false){await logScanEvent("PRODUCT_NETWORK_NOT_SENT",{reason:"NO_NETWORK"});return{candidates:localMatches.slice(0,5),query,network:"offline",failures:["offline"],completedRequests:0}}
    if(input.barcode){const barcode=normalizeBarcode(input.barcode).normalized,found=await lookupBarcode(barcode);if(found.ok){await logScanEvent("PRODUCT_SEARCH_RESULT_RECEIVED",{source:"barcode",count:1});return{candidates:[fromBarcodeOnline(found.product,barcode)],query,network:"online",failures,completedRequests:1}}if(found.error==="PRODUCT_NOT_ONLINE")completedRequests++;else failures.push(failureFor(found.error))}
    if(query){
      const fields="code,product_name,product_name_zh,generic_name,generic_name_zh,brands,quantity,image_front_url,ingredients_text,ingredients_text_zh,nutrition_data_per,nutriments";
      let products:any[]=[];
      const textResult=await requestProducts(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=10&fields=${fields}`,"text");
      if(textResult.ok){completedRequests++;products=textResult.products}else failures.push(textResult.error);
      if(!products.length&&input.brand){const brandResult=await requestProducts(`https://world.openfoodfacts.org/api/v2/search?brands_tags=${encodeURIComponent(input.brand)}&page_size=20&fields=${fields}`,"brand");if(brandResult.ok){completedRequests++;products=brandResult.products}else failures.push(brandResult.error)}
      for(let i=0;i<products.length;i++){const c=fromOpenFoodFacts(products[i],i);c.score=scoreProductCandidate(c,input);if(c.score>=12)results.push(c)}
    }
    const seen=new Set<string>(),unique=results.sort((a,b)=>b.score-a.score).filter(c=>{const key=c.barcode||`${clean(c.brand)}-${clean(c.name)}-${clean(c.quantity)}`;if(seen.has(key))return false;seen.add(key);return true}).slice(0,5);
    const networkStatus=summarizeSearchNetwork(completedRequests,failures);
    await logScanEvent("PRODUCT_SEARCH_COMPLETED",{count:unique.length,network:networkStatus,completedRequests,failures});await logScanEvent("SEARCH_RESULT_COUNT",{source:"merged",value:unique.length});
    return{candidates:unique,query,network:networkStatus,failures,completedRequests};
  }catch(e){await logScanEvent("PRODUCT_SEARCH_FAILED",{error:e instanceof Error?e.name:"UNKNOWN",code:"ONLINE_NETWORK_ERROR"});return{candidates:localMatches.slice(0,5),query,network:"network_error",failures:[...failures,"network_error"],completedRequests}}
}
