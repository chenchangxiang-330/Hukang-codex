import { inspectImage,recognizeDetailed,type OcrResult } from "./ocr";
import { parseNutritionLabel,nutritionCompleteness } from "./parser";
import { mergeRecognitionResults } from "./recognitionMerge";
import { runVisionFallback } from "./visionFallback";
import { logScanEvent,logScanError,saveScanDebug,countScanMetric,loadScanDebug } from "./scanMetrics";

export async function recognizeNutrition(photo:string,onStatus:(text:string)=>void,isCancelled=()=>false){
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
  const needed=!nutritionCompleteness(parsed).complete||!ocr||ocr.lowConfidence||qualityWarning;
  if(nutritionCompleteness(parsed).complete)await countScanMetric("nutritionParsed");
  const reason=!ocr?"OCR_FAILED":!input.trim()?"OCR_NO_TEXT":needed?"OCR_LOW_CONFIDENCE":"LOCAL_RESULT_SUFFICIENT";
  if(needed)await logScanEvent(reason);
  if(needed&&!isCancelled())onStatus("正在尝试进一步识别…");
  const vision=isCancelled()?null:await runVisionFallback(photo,"nutrition_label",needed,reason,isCancelled);
  const debug=await loadScanDebug(),diagnostic=debug.vision as {reason?:string}|undefined;
  if(vision)await countScanMetric("visionSuccess");
  const merged=mergeRecognitionResults(parsed,vision);
  await saveScanDebug({rawText:ocr?.text??"",parse:{input,local:parsed,merged},detectedType:"nutrition_label"});
  await logScanEvent("RESULT_STATE_UPDATED",{stage:"merged",value:merged,visionUsed:!!vision});
  return{ocr,parsed,vision,merged,needsReview:needed||merged.needsConfirmation,visionReason:needed&&!vision?diagnostic?.reason:undefined};
}
