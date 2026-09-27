import type { Nutrients } from "./types";
import type { ParsedLabel } from "./parser";

export const nutritionVisionKeys:Record<keyof Nutrients,string>={
  energyKj:"energy_kj",energyKcal:"energy_kcal",proteinG:"protein_g",fatG:"fat_g",
  carbohydrateG:"carbohydrate_g",totalSugarG:"total_sugar_g",addedSugarG:"added_sugar_g",
  fiberG:"fiber_g",sodiumMg:"sodium_mg",
};
export type VisionMergeInput={
  basis?:{amount:number;unit:string}|null;
  nutrition?:Record<string,number|null>|null;
  uncertain_fields?:string[];
  confidence?:Record<string,number|null>|null;
};
export type MergeFieldStatus="agreed"|"local_only"|"vision_only"|"conflict"|"unknown"|"basis_conflict"|"basis_unverified"|"uncertain";
export type RecognitionField={local:number|null;vision:number|null;value:number|null;status:MergeFieldStatus};
export type MergedRecognition={
  nutrients:Nutrients;
  basisAmount:number|null;
  basisUnit:string|null;
  fields:Record<keyof Nutrients,RecognitionField>;
  basisConflict:boolean;
  needsConfirmation:boolean;
};

const validNumber=(v:unknown):number|null=>typeof v==="number"&&Number.isFinite(v)&&v>=0?v:null;
function basis(amount:number|null|undefined,unit:string|null|undefined){
  if(amount==null||!Number.isFinite(amount)||amount<=0||!unit)return null;
  const normalized=/^(g|克)$/i.test(unit)?"g":/^(ml|毫升)$/i.test(unit)?"mL":/^(serving|份)$/i.test(unit)?"份":/^(package|包装)$/i.test(unit)?"包装":null;
  return normalized?{amount,unit:normalized}:null;
}

/** Preserve independent candidates. Missing or conflicting evidence never becomes a guessed value. */
export function mergeRecognitionResults(local:ParsedLabel,vision?:VisionMergeInput|null):MergedRecognition{
  const localBasis=basis(local.basisAmount,local.basisUnit),visionBasis=basis(vision?.basis?.amount,vision?.basis?.unit);
  const comparable=!!localBasis&&!!visionBasis&&localBasis.amount===visionBasis.amount&&localBasis.unit===visionBasis.unit;
  const basisConflict=!!localBasis&&!!visionBasis&&!comparable,selectedBasis=basisConflict?null:localBasis??visionBasis;
  const fields={} as Record<keyof Nutrients,RecognitionField>,nutrients={} as Nutrients;
  const uncertain=new Set(vision?.uncertain_fields??[]);
  let needsConfirmation=!selectedBasis||local.quality.correctedFields.length>0||local.quality.ambiguousFields.length>0;
  for(const key of Object.keys(nutritionVisionKeys) as (keyof Nutrients)[]){
    const remoteKey=nutritionVisionKeys[key],localValue=validNumber(local.nutrients[key]),visionValue=validNumber(vision?.nutrition?.[remoteKey]);
    const field:RecognitionField={local:localValue,vision:visionValue,value:null,status:"unknown"};
    const confidence=vision?.confidence?.[remoteKey]??vision?.confidence?.[`nutrition.${remoteKey}`];
    const remoteUncertain=uncertain.has(remoteKey)||uncertain.has(`nutrition.${remoteKey}`)||uncertain.has(key)||
      (typeof confidence==="number"&&(!Number.isFinite(confidence)||confidence<.75));
    if(basisConflict&&(localValue!=null||visionValue!=null))field.status="basis_conflict";
    else if(localValue!=null&&visionValue!=null){
      if(!comparable)field.status="basis_unverified";
      else if(remoteUncertain)field.status="uncertain";
      else if(localValue===visionValue){field.value=localValue;field.status="agreed";}
      else field.status="conflict";
    }else if(localValue!=null){
      // A Vision-only basis must not silently relabel existing local numbers.
      if(!localBasis&&visionBasis)field.status="basis_unverified";
      else if(local.quality.correctedFields.includes(key))field.status="uncertain";
      else{field.value=localValue;field.status="local_only";}
    }else if(visionValue!=null){
      if(remoteUncertain)field.status="uncertain";
      else if(!visionBasis)field.status="basis_unverified";
      else{field.value=visionValue;field.status="vision_only";}
    }
    if(["conflict","basis_conflict","basis_unverified","uncertain"].includes(field.status))needsConfirmation=true;
    fields[key]=field;nutrients[key]=field.value;
  }
  if((nutrients.energyKj==null&&nutrients.energyKcal==null)||
    [nutrients.proteinG,nutrients.fatG,nutrients.carbohydrateG,nutrients.sodiumMg].some(v=>v==null))needsConfirmation=true;
  return {nutrients,basisAmount:selectedBasis?.amount??null,basisUnit:selectedBasis?.unit??null,fields,basisConflict,needsConfirmation};
}
