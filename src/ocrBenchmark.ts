import { Asset } from "expo-asset";
import { NativeModules,Platform } from "react-native";
import { recognizeDetailed } from "./ocr";
import { preprocessImageForOcr } from "./imagePreprocessing";
import { parseNutritionLabel } from "./parser";
import { mergeRecognitionResults,nutritionVisionKeys } from "./recognitionMerge";
import { runVisionFallback } from "./visionFallback";
import { loadScanDebug,saveScanDebug } from "./scanMetrics";
import type { Nutrients } from "./types";

// Fixed, manually annotated regions. No ground-truth numbers or transcriptions enter recognition.
const fixtures=[
  {fixtureId:"6923644266066",asset:require("../tests/fixtures/ocr/nutrition/6923644266066.jpg"),width:1280,height:1700,roi:{originX:280,originY:700,width:590,height:420}},
  {fixtureId:"6937003117814",asset:require("../tests/fixtures/ocr/nutrition/6937003117814.jpg"),width:3024,height:4032,roi:{originX:300,originY:50,width:2350,height:1280}},
];
type Stage={status:"ok"|"error"|"not_run";reason?:string;rawText?:string;fields?:Record<string,number|null>;basis?:{amount:number|null;unit:string|null};scope?:string;[key:string]:unknown};
type Run={fixtureId:string;evidence:string;platform:string;stages:Record<string,Stage>};
const mapped=(n:Nutrients)=>Object.fromEntries((Object.keys(nutritionVisionKeys) as (keyof Nutrients)[]).map(k=>[nutritionVisionKeys[k],n[k]]));
const errorText=(error:unknown)=>error instanceof Error?error.message:String(error);
export async function runRealNutritionBenchmark(progress:(label:string)=>void){
  const runs:Run[]=[];
  for(const fixture of fixtures){
    const stages:Record<string,Stage>=Object.fromEntries(["original","preprocessed","parser","vision","merged","experimental_gray"].map(name=>[name,{status:"not_run",reason:"Stage not reached"}]));
    const run:Run={fixtureId:fixture.fixtureId,evidence:"device_mlkit_image_execution",platform:Platform.OS,stages};runs.push(run);
    try{
      const asset=await Asset.fromModule(fixture.asset).downloadAsync();const uri=asset.localUri??asset.uri;
      const read=async(imageUri:string,name:string)=>{
        progress(`${fixture.fixtureId} · ${name}`);
        try{const ocr=await recognizeDetailed(imageUri),parsed=parseNutritionLabel(ocr.parserText);
          stages[name]={status:"ok",rawText:ocr.text,parserInput:ocr.parserText,fields:mapped(parsed.nutrients),basis:{amount:parsed.basisAmount,unit:parsed.basisUnit},durationMs:ocr.durationMs,provider:ocr.provider,lines:ocr.lines};return parsed;
        }catch(error){stages[name]={status:"error",reason:errorText(error)};return null}
      };
      await read(uri,"original");
      const upright=await preprocessImageForOcr(uri);
      // Account for native memory-limit sampling before applying source-pixel ROI coordinates.
      const sx=upright.width/fixture.width,sy=upright.height/fixture.height;
      const crop={originX:Math.floor(fixture.roi.originX*sx),originY:Math.floor(fixture.roi.originY*sy),width:Math.floor(fixture.roi.width*sx),height:Math.floor(fixture.roi.height*sy)};
      const prepared=await preprocessImageForOcr(upright.uri,{upright,crop,maxEdge:4096});
      const parsed=await read(prepared.uri,"preprocessed");
      stages.preprocessed.preprocessing=prepared;
      if(parsed)stages.parser={status:"ok",rawText:parsed.rawText,fields:mapped(parsed.nutrients),basis:{amount:parsed.basisAmount,unit:parsed.basisUnit},quality:parsed.quality};
      progress(`${fixture.fixtureId} · Vision（需有效配置与授权）`);
      const vision=await runVisionFallback(prepared.uri,"nutrition_label",true,"BENCHMARK_FORCED");
      if(vision)stages.vision={status:"ok",rawText:vision.raw_text,fields:vision.nutrition??{},basis:vision.basis??undefined,result:vision};
      else{const debug=await loadScanDebug(),diagnostic=debug.vision as {status?:string;reason?:string}|undefined;stages.vision={status:diagnostic?.status==="failed"?"error":"not_run",reason:diagnostic?.reason??"No Vision execution"}}
      const merged=mergeRecognitionResults(parsed??parseNutritionLabel(""),vision);
      stages.merged={status:"ok",fields:mapped(merged.nutrients),basis:{amount:merged.basisAmount,unit:merged.basisUnit},scope:vision?"ocr_plus_vision":"local_only",result:merged};
      try{const variant=await NativeModules.HuKangOcr.createOcrVariant(prepared.uri);await read(variant.uri,"experimental_gray");stages.experimental_gray.preprocessing=variant}catch(error){stages.experimental_gray={status:"error",reason:errorText(error)}}
    }catch(error){stages.preprocessed={status:"error",reason:errorText(error)}}
    await saveScanDebug({ab:{runs,completedAt:new Date().toISOString()}});
  }
  return{schemaVersion:1,runs,completedAt:new Date().toISOString()};
}
