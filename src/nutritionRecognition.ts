import { inspectImage,recognizeDetailed,type OcrResult } from "./ocr";
import { parseNutritionLabel,nutritionCompleteness } from "./parser";
import { mergeRecognitionResults } from "./recognitionMerge";
import {mergeLocalOcrCandidates,preserveLocalOcrConflicts} from "./localOcrEvidence";
import { runVisionFallback } from "./visionFallback";
import { logScanEvent,logScanError,saveScanDebug,countScanMetric,loadScanDebug } from "./scanMetrics";

export async function recognizeNutrition(photo:string,onStatus:(text:string)=>void,isCancelled=()=>false,options:{originalPhoto?:string;vision?:boolean}={}){
  let qualityWarning=false,ocr:OcrResult|null=null;
  onStatus("正在读取营养成分表…");
  try{const quality=await inspectImage(photo);await saveScanDebug({quality});await countScanMetric("photoValid");
    qualityWarning=quality.tooDark||quality.tooBright||quality.hasGlare||quality.tooBlurry||quality.tooSmall;
    if(qualityWarning)await logScanEvent("IMAGE_QUALITY_ADVISORY",{quality});
  }catch(error){await logScanError("image_quality_advisory",error)}
  // Quality heuristics must never prevent OCR or prevent Vision from seeing the image.
  try{ocr=await recognizeDetailed(photo,"nutrition")}catch(error){await logScanEvent("OCR_CALL_FAILED");await logScanError("nutrition_ocr",error)}
  const input=ocr?.parserText??"";
  if(ocr?.text.trim())await countScanMetric("ocrText");
  await logScanEvent("PARSER_INPUT",{value:input,source:"ocr_geometry_rows"});
  let parsed=parseNutritionLabel("");
  try{parsed=parseNutritionLabel(input)}catch(error){await logScanEvent("PARSER_FAILED",{error:String(error)})}
  await logScanEvent("PARSER_OUTPUT",{value:parsed});
  await logScanEvent("PARSER_CONFIDENCE",{value:parsed.quality.confidence,kind:"structural_heuristic_not_accuracy"});
  const primaryParsed=parsed;
  let originalOcr:OcrResult|null=null,originalParsed:ReturnType<typeof parseNutritionLabel>|null=null;
  if(options.originalPhoto&&options.originalPhoto!==photo&&!isCancelled()&&(!nutritionCompleteness(parsed).complete||!ocr||ocr.lowConfidence)){
    onStatus("正在对照未裁剪的原图…");
    try{
      originalOcr=await recognizeDetailed(options.originalPhoto,"nutrition");originalParsed=parseNutritionLabel(originalOcr.parserText);
      await logScanEvent("ORIGINAL_OCR_EVIDENCE",{uri:options.originalPhoto,ocr:originalOcr,parsed:originalParsed});
    }catch(error){await logScanError("original_nutrition_ocr",error)}
  }
  const localEvidence=mergeLocalOcrCandidates(primaryParsed,originalParsed);parsed=localEvidence.parsed;
  await logScanEvent("LOCAL_OCR_CANDIDATES",{value:localEvidence});
  const originalSupplemented=Object.values(localEvidence.fields).some(field=>field.status==="original_only"||field.status==="conflict");
  const needed=!nutritionCompleteness(parsed).complete||!ocr||ocr.lowConfidence||qualityWarning||originalSupplemented;
  if(nutritionCompleteness(parsed).complete)await countScanMetric("nutritionParsed");
  const reason=!ocr?"OCR_FAILED":!input.trim()?"OCR_NO_TEXT":needed?"OCR_LOW_CONFIDENCE":"LOCAL_RESULT_SUFFICIENT";
  if(needed)await logScanEvent(reason);
  if(needed&&!isCancelled())onStatus("正在尝试进一步识别…");
  const vision=isCancelled()||options.vision===false?null:await runVisionFallback(photo,"nutrition_label",needed,reason,isCancelled);
  const debug=await loadScanDebug(),diagnostic=debug.vision as {reason?:string}|undefined;
  if(vision)await countScanMetric("visionSuccess");
  // A third candidate must not erase an unresolved original/ROI disagreement.
  const merged=preserveLocalOcrConflicts(mergeRecognitionResults(parsed,vision),localEvidence);
  await saveScanDebug({rawText:ocr?.text??"",parse:{input,local:parsed,merged},detectedType:"nutrition_label"});
  await logScanEvent("RESULT_STATE_UPDATED",{stage:"merged",value:merged,visionUsed:!!vision});
  return{ocr,originalOcr,primaryParsed,originalParsed,localEvidence,parsed,vision,merged,needsReview:needed||merged.needsConfirmation||localEvidence.basisConflict,visionReason:needed&&!vision?diagnostic?.reason:undefined};
}
