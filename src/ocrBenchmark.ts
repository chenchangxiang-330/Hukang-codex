import { Asset } from "expo-asset";
import { NativeModules,Platform } from "react-native";
import { recognizeDetailed } from "./ocr";
import {estimateNutritionSlope,type OcrLine} from "./ocrGeometry";
import { preprocessImageForOcr } from "./imagePreprocessing";
import { parseNutritionLabel } from "./parser";
import { nutritionVisionKeys } from "./recognitionMerge";
import {recognizeNutrition} from "./nutritionRecognition";
import { loadScanDebug,saveScanDebug } from "./scanMetrics";
import type { Nutrients } from "./types";

// Fixed, manually annotated regions. No ground-truth numbers or transcriptions enter recognition.
const fixtures=[
  {fixtureId:"6923644266066",asset:require("../tests/fixtures/ocr/nutrition/6923644266066.jpg"),width:1280,height:1700,roi:{originX:280,originY:700,width:590,height:420}},
  {fixtureId:"6937003117814",asset:require("../tests/fixtures/ocr/nutrition/6937003117814.jpg"),width:3024,height:4032,roi:{originX:300,originY:50,width:2350,height:1280}},
];
type Stage={status:"ok"|"error"|"not_run";reason?:string;rawText?:string;fields?:Record<string,number|null>;basis?:{amount:number|null;unit:string|null};scope?:string;[key:string]:unknown};
type Run={fixtureId:string;evidence:string;platform:string;stages:Record<string,Stage>};
const encodingContextExperiments=[
  {variant:"whole_png",stage:"experimental_whole_png",hypothesis:"Whole-image lossless export: does source decoding/normalization alone change OCR?"},
  {variant:"roi_png",stage:"experimental_roi_png",hypothesis:"Exact ROI versus whole PNG: does removing surrounding context change OCR without added JPEG loss?"},
  {variant:"roi_jpeg",stage:"experimental_roi_jpeg",hypothesis:"Exact ROI JPEG97 versus ROI PNG: does encoding the same decoded crop change OCR?"},
  {variant:"padded_roi_png",stage:"experimental_padded_roi_png",hypothesis:"ROI with 10 percent padding on each side versus exact ROI PNG: does nearby context change OCR?"},
] as const;
const mapped=(n:Nutrients)=>Object.fromEntries((Object.keys(nutritionVisionKeys) as (keyof Nutrients)[]).map(k=>[nutritionVisionKeys[k],n[k]??null]));
const errorText=(error:unknown)=>error instanceof Error?error.message:String(error);
export async function runRealNutritionBenchmark(progress:(label:string)=>void,options:{vision?:boolean}={}){
  const runs:Run[]=[];
  for(const fixture of fixtures){
    const stages:Record<string,Stage>=Object.fromEntries(["original","preprocessed","parser","production","vision","merged","experimental_gray","experimental_upscaled","experimental_deskew",...encodingContextExperiments.map(experiment=>experiment.stage)].map(name=>[name,{status:"not_run",reason:"Stage not reached"}]));
    if(options.vision===false)stages.vision={status:"not_run",reason:"CI_NO_VISION_KEY"};
    const run:Run={fixtureId:fixture.fixtureId,evidence:"device_mlkit_image_execution",platform:Platform.OS,stages};runs.push(run);
    try{
      const asset=Asset.fromModule(fixture.asset);
      // Bare RN Android drawable names render in <Image> but are not disk paths.
      // Force Expo's resource-stream copy before passing a real file URI to ML Kit.
      if(Platform.OS==="android"&&!asset.uri.includes(":")){asset.downloaded=false;asset.localUri=null}
      await asset.downloadAsync();const uri=asset.localUri??asset.uri;
      const read=async(imageUri:string,name:string)=>{
        progress(`${fixture.fixtureId} · ${name}`);
        try{const ocr=await recognizeDetailed(imageUri,"nutrition"),parsed=parseNutritionLabel(ocr.parserText);
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
      progress(`${fixture.fixtureId} · ${options.vision===false?"Vision 未执行（CI 无密钥）":"Vision（需有效配置与授权）"}`);
      // Exercise the same orchestration used by the nutrition confirmation UI,
      // including original/ROI evidence. Truth is never available to this call.
      const production=await recognizeNutrition(prepared.uri,progress,()=>false,{originalPhoto:uri,vision:options.vision});
      const vision=production.vision;
      stages.production={status:"ok",rawText:production.ocr?.text??"",fields:mapped(production.merged.nutrients),basis:{amount:production.merged.basisAmount,unit:production.merged.basisUnit},scope:vision?"ocr_plus_vision":"local_only",result:production};
      if(vision)stages.vision={status:"ok",rawText:vision.raw_text,fields:vision.nutrition??{},basis:vision.basis??undefined,result:vision};
      else if(options.vision===false)stages.vision={status:"not_run",reason:"CI_NO_VISION_KEY"};
      else{const debug=await loadScanDebug(),diagnostic=debug.vision as {status?:string;reason?:string}|undefined;stages.vision={status:diagnostic?.status==="failed"?"error":"not_run",reason:diagnostic?.reason??"No Vision execution"}}
      const merged=production.merged;
      stages.merged={status:"ok",fields:mapped(merged.nutrients),basis:{amount:merged.basisAmount,unit:merged.basisUnit},scope:vision?"ocr_plus_vision":"local_only",result:merged};
      // Hypothesis tests only. The native bridge decodes the source once and writes
      // exact ROI PNG/JPEG from the same pixels; no variant feeds production/merge.
      if(typeof NativeModules.HuKangOcr?.createBenchmarkImages!=="function"){
        for(const experiment of encodingContextExperiments)stages[experiment.stage]={status:"not_run",reason:"BENCHMARK_VARIANT_MODULE_UNAVAILABLE",hypothesis:experiment.hypothesis};
      }else{
        try{
          const variants=await NativeModules.HuKangOcr.createBenchmarkImages(uri,fixture.roi);
          for(const experiment of encodingContextExperiments){
            const variant=variants[experiment.variant];
            if(typeof variant?.uri!=="string"||!variant.uri){stages[experiment.stage]={status:"error",reason:"BENCHMARK_VARIANT_FILE_MISSING",hypothesis:experiment.hypothesis};continue}
            await read(variant.uri,experiment.stage);
            stages[experiment.stage].preprocessing=variant;
            stages[experiment.stage].hypothesis=experiment.hypothesis;
            stages[experiment.stage].scope="experimental_parser_only";
          }
        }catch(error){for(const experiment of encodingContextExperiments)stages[experiment.stage]={status:"error",reason:errorText(error),hypothesis:experiment.hypothesis}}
      }
      try{const variant=await NativeModules.HuKangOcr.createOcrVariant(prepared.uri);await read(variant.uri,"experimental_gray");stages.experimental_gray.preprocessing=variant}catch(error){stages.experimental_gray={status:"error",reason:errorText(error)}}
      try{const variant=await preprocessImageForOcr(prepared.uri,{upright:prepared,experimentalScale:2,maxEdge:4096});await read(variant.uri,"experimental_upscaled");stages.experimental_upscaled.preprocessing=variant}catch(error){stages.experimental_upscaled={status:"error",reason:errorText(error)}}
      const slope=estimateNutritionSlope(stages.preprocessed.lines as OcrLine[]??[]);
      if(Math.abs(slope)>.015){
        try{const variant=await preprocessImageForOcr(prepared.uri,{upright:prepared,rotate:-Math.atan(slope)*180/Math.PI,maxEdge:4096});await read(variant.uri,"experimental_deskew");stages.experimental_deskew.preprocessing=variant}catch(error){stages.experimental_deskew={status:"error",reason:errorText(error)}}
      }else stages.experimental_deskew={status:"not_run",reason:"NO_RELIABLE_TILT_DETECTED"};
    }catch(error){stages.preprocessed={status:"error",reason:errorText(error)}}
    await saveScanDebug({ab:{runs,completedAt:new Date().toISOString()}});
  }
  return{schemaVersion:1,runs,completedAt:new Date().toISOString()};
}
