import type {ParsedLabel} from "./parser";
import type {Nutrients} from "./types";

export type LocalOcrFieldStatus="agreed"|"primary_only"|"original_only"|"conflict"|"unknown"|"basis_conflict";
export type LocalOcrField={primary:number|null;original:number|null;value:number|null;status:LocalOcrFieldStatus;source:"primary"|"original"|"both"|null};
export type LocalOcrEvidence={parsed:ParsedLabel;fields:Record<keyof Nutrients,LocalOcrField>;basisConflict:boolean};
const keys:(keyof Nutrients)[]=["energyKj","energyKcal","proteinG","fatG","saturatedFatG","transFatG","carbohydrateG","totalSugarG","addedSugarG","fiberG","sodiumMg"];
const validNumber=(value:unknown)=>typeof value==="number"&&Number.isFinite(value)&&value>=0?value:null;
function basis(parsed:ParsedLabel){
  const amount=parsed.basisAmount,rawUnit=parsed.basisUnit?.normalize("NFKC").trim();
  if(amount==null||!Number.isFinite(amount)||amount<=0||!rawUnit)return null;
  const unit=/^(g|克)$/i.test(rawUnit)?"g":/^(ml|毫升)$/i.test(rawUnit)?"mL":/^(份|serving)$/i.test(rawUnit)?"份":/^(包装|package)$/i.test(rawUnit)?"包装":null;
  return unit?{amount,unit}:null;
}
function suspects(parsed:ParsedLabel){return new Set([...(parsed.quality.suspectFields??[]),...parsed.quality.correctedFields,...parsed.quality.ambiguousFields])}

/** Compare two image variants of the SAME OCR engine, not two independent witnesses.
 * Never increase confidence, guess decimals, change source raw text, or mutate inputs.
 */
export function mergeLocalOcrCandidates(primary:ParsedLabel,original?:ParsedLabel|null):LocalOcrEvidence{
  const primaryBasis=basis(primary),originalBasis=original?basis(original):null;
  const comparable=!!original&&!!primaryBasis&&!!originalBasis&&primaryBasis.amount===originalBasis.amount&&primaryBasis.unit===originalBasis.unit;
  const basisConflict=!!original&&!comparable;
  const fields={} as Record<keyof Nutrients,LocalOcrField>,nutrients={...primary.nutrients};
  const suspectFields=suspects(primary),originalSuspects=original?suspects(original):new Set<string>();
  const ambiguousFields=new Set(primary.quality.ambiguousFields),issues=new Set(primary.quality.issues);
  if(basisConflict)issues.add(primaryBasis&&originalBasis?"LOCAL_OCR_BASIS_CONFLICT":"LOCAL_OCR_BASIS_UNVERIFIED");
  for(const key of keys){
    const primaryValue=validNumber(primary.nutrients[key]),originalValue=validNumber(original?.nutrients[key]);
    const field:LocalOcrField={primary:primaryValue,original:originalValue,value:null,status:"unknown",source:null};
    if(originalSuspects.has(key))suspectFields.add(key);
    if(basisConflict&&(primaryValue!=null||originalValue!=null)){
      field.status="basis_conflict";suspectFields.add(key);
    }else if(primaryValue!=null&&originalValue!=null){
      if(primaryValue===originalValue){
        field.status="agreed";field.value=primaryValue;field.source="both";
        // Repeated OCR can repeat the same missing decimal. This is a candidate,
        // not accuracy validation or permission to label it high-confidence.
      }else{
        field.status="conflict";suspectFields.add(key);ambiguousFields.add(key);issues.add(`LOCAL_OCR_CONFLICT:${key}`);
      }
    }else if(primaryValue!=null){field.status="primary_only";field.value=primaryValue;field.source="primary"}
    else if(originalValue!=null){
      field.status="original_only";field.value=originalValue;field.source="original";issues.add("LOCAL_ORIGINAL_CANDIDATE");issues.add(`LOCAL_ORIGINAL_CANDIDATE:${key}`);
    }
    fields[key]=field;nutrients[key]=field.value;
  }
  const parsed:ParsedLabel={...primary,nutrients,
    basisAmount:basisConflict?null:primary.basisAmount,basisUnit:basisConflict?null:primary.basisUnit,
    quality:{...primary.quality,issues:[...issues],correctedFields:[...primary.quality.correctedFields],ambiguousFields:[...ambiguousFields],suspectFields:[...suspectFields]}};
  return{parsed,fields,basisConflict};
}
