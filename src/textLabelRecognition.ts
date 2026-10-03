import {inspectImage,recognizeDetailed,type OcrResult} from "./ocr";
import {isLocalResultComplete,parseIngredientsLabel,parseDateLabel} from "./parser";
import {runVisionFallback} from "./visionFallback";
import {visionTextCandidate} from "./textRecognitionEvidence";
import {countScanMetric,loadScanDebug,logScanError,logScanEvent,saveScanDebug} from "./scanMetrics";

export async function recognizeTextLabel(photo:string,mode:"ingredients"|"date",onStatus:(status:string)=>void,isCancelled=()=>false){
  let warning=false,ocr:OcrResult|null=null;
  const task=mode==="date"?"expiry":"ingredients";
  // Image heuristics are advisory. A dark/glossy photo still gets a real OCR attempt.
  try{
    const quality=await inspectImage(photo);await saveScanDebug({quality});
    warning=quality.tooDark||quality.tooBright||quality.hasGlare||quality.tooBlurry||quality.tooSmall;
    if(warning)await logScanEvent("IMAGE_QUALITY_ADVISORY",{quality});
  }catch(error){await logScanError("text_image_quality_advisory",error)}
  onStatus(mode==="date"?"正在读取日期和保质期…":"正在读取完整配料表…");
  try{ocr=await recognizeDetailed(photo)}catch(error){await logScanEvent("OCR_CALL_FAILED",{task});await logScanError("text_label_ocr",error)}
  const localText=ocr?.text??"";
  if(localText.trim())await countScanMetric("ocrText");
  await logScanEvent("PARSER_INPUT",{value:localText,task,source:"native_raw_text"});
  const output=mode==="date"?parseDateLabel(localText):parseIngredientsLabel(localText);
  const complete=isLocalResultComplete(task,localText);
  await logScanEvent("PARSER_OUTPUT",{value:output,complete});
  await logScanEvent("PARSER_CONFIDENCE",{kind:"structural_not_measured_accuracy",complete});
  const needed=!complete||!ocr||ocr.lowConfidence||warning;
  const reason=!ocr?"OCR_FAILED":!localText.trim()?"OCR_NO_TEXT":needed?"OCR_LOW_CONFIDENCE":"LOCAL_RESULT_SUFFICIENT";
  if(needed&&!isCancelled())onStatus("正在尝试联网图片识别…");
  const vision=isCancelled()?null:await runVisionFallback(photo,task,needed,reason,isCancelled);
  if(vision)await countScanMetric("visionSuccess");
  const remoteText=vision?visionTextCandidate(vision,mode):"";
  const debug=await loadScanDebug();
  const diagnostic=debug.vision as {reason?:string}|undefined;
  await saveScanDebug({rawText:localText,detectedType:task,parse:{local:output,localText,remoteText,vision,requiresConfirmation:true}});
  await logScanEvent("RESULT_STATE_UPDATED",{task,localLength:localText.length,remoteLength:remoteText.length,visionUsed:!!vision,requiresConfirmation:true});
  return {ocr,localText,remoteText,vision,needsReview:needed||!!vision?.uncertain_fields.length,visionReason:needed&&!vision?diagnostic?.reason:undefined};
}
