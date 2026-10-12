import { NativeModules, Platform } from "react-native";
import { logScanEvent, saveScanDebug } from "./scanMetrics";
import { textInReadingRows,textInNutritionRows, type OcrLine } from "./ocrGeometry";
import { getOcrEngineOverride } from "./ocrEngineSettings";
import { archiveOcrEvidence } from "./ocrEvidenceArchive";
export type OcrEngine="mlkit"|"paddle";
// Android 35 same-image acceptance passed; keep an explicit ML Kit override for comparison.
export const DEFAULT_OCR_ENGINE:OcrEngine="paddle";
export async function recognizeText(uri: string,engine?:OcrEngine): Promise<string> {
  return (await recognizeDetailed(uri,"general",engine)).text;
}
export type OcrInputImage={width:number;height:number;sourceWidth:number;sourceHeight:number;sampleSize:number|null;sourceOrientation:number;coordinateSpace:string;sourceToInputMatrix?:number[];rotationDegrees?:number};
export type OcrMemory={observedPeakPssKb:number;observedPeakJavaHeapBytes:number;observedPeakNativeHeapBytes:number;samplingIntervalMs:number;sampleCount:number};
export type OcrResult={text:string;parserText:string;lines:OcrLine[];provider:string;engine:OcrEngine;nativeEngine:OcrEngine|null;durationMs:number;nativeDurationMs?:number;bridgeDurationMs:number;lowConfidence:boolean;
  imageUri:string;imageSha256?:string;imageBytes?:number;inputImage?:OcrInputImage;
  models?:{file:string;sha256:string;bytes:number}[];versions?:Record<string,string>;memory?:OcrMemory;timings?:Record<string,number|number[]|number[][]>;modelVersion?:string;
  evidenceUri?:string;retainedImageUri?:string;archivalDurationMs?:number;archivalError?:string;[key:string]:unknown};
export async function recognizeDetailed(uri:string,task:"general"|"nutrition"="general",requestedEngine?:OcrEngine):Promise<OcrResult>{
  const started=Date.now();
  const engine=requestedEngine??await getOcrEngineOverride()??DEFAULT_OCR_ENGINE;
  await logScanEvent("OCR_START",{uri,engine});
  try{
    if(engine!=="mlkit"&&engine!=="paddle")throw new Error("OCR_ENGINE_INVALID");
    const native=engine==="paddle"?NativeModules.HuKangPaddleOcr:NativeModules.HuKangOcr;
    if(Platform.OS!=="android"||!native)throw new Error(`OCR_MODULE_UNAVAILABLE:${engine}`);
    // Explicit engine selection is also used by A/B evidence: never silently fallback.
    const result=native.recognizeDetailed?await native.recognizeDetailed(uri):engine==="mlkit"&&native.recognize?{text:await native.recognize(uri),lines:[],provider:"mlkit-chinese-legacy-bridge"}:null;
    if(!result||typeof result.text!=="string"||result.lines!==undefined&&!Array.isArray(result.lines))throw new Error("OCR_NATIVE_RESULT_INVALID");
    if(result.engine&&result.engine!==engine)throw new Error("OCR_NATIVE_ENGINE_MISMATCH");
    const lines:OcrLine[]=result.lines??[];
    const scores=lines.map(line=>line.confidence).filter((n):n is number=>typeof n==="number"&&n>0);
    // Routing heuristic, not a measured probability of correct nutrition values.
    const lowConfidence=scores.length===0||scores.length!==lines.length||scores.some(n=>n<0.75);
    const bridgeDurationMs=Date.now()-started;
    const nativeDurationMs=typeof result.nativeDurationMs==="number"?result.nativeDurationMs:typeof result.durationMs==="number"?result.durationMs:undefined;
    const nativeEngine=result.engine==="mlkit"||result.engine==="paddle"?result.engine:null;
    const output:OcrResult={...result,engine,nativeEngine,imageUri:result.imageUri??uri,lines,parserText:lines.length?(task==="nutrition"?textInNutritionRows(lines):textInReadingRows(lines)):result.text,durationMs:nativeDurationMs??bridgeDurationMs,nativeDurationMs,bridgeDurationMs,lowConfidence};
    try{
      Object.assign(output,await archiveOcrEvidence({imageUri:uri,task,raw:result,parserInput:output.parserText,expectedImageSha256:output.imageSha256}));
      if(output.archivalError)await logScanEvent("OCR_EVIDENCE_ARCHIVE_FAILED",{engine,error:output.archivalError});
    }catch(error){output.archivalError=String(error);await logScanEvent("OCR_EVIDENCE_ARCHIVE_FAILED",{engine,error:String(error)})}
    await logScanEvent("OCR_PROVIDER",{value:output.provider});
    await logScanEvent("OCR_RAW_TEXT",{value:output.text});
    await logScanEvent("OCR_TEXT_LENGTH",{value:output.text.length});
    await logScanEvent("OCR_DURATION_MS",{value:output.durationMs});
    await logScanEvent("OCR_SUCCESS",{hasText:!!output.text.trim()});
    if(!output.text.trim())await logScanEvent("OCR_NO_TEXT");
    else if(lowConfidence)await logScanEvent("OCR_LOW_CONFIDENCE",{lineScores:scores});
    await saveScanDebug({rawText:output.text,ocr:output,provider:output.provider});return output;
  }catch(error){
    await logScanEvent("OCR_FAILED",{engine,error:String(error)});
    await logScanEvent("OCR_DURATION_MS",{value:Date.now()-started});
    await saveScanDebug({rawText:"",ocr:{error:String(error)},error:"OCR_FAILED"});throw error;
  }
}
export type ImageQuality={brightness:number;sharpness:number;width:number;height:number;overexposedRatio:number;tooDark:boolean;tooBright:boolean;tooBlurry:boolean;tooSmall:boolean;hasGlare:boolean};
export async function inspectImage(uri:string):Promise<ImageQuality>{
  if(Platform.OS!=="android"||!NativeModules.HuKangOcr)throw new Error("OCR_MODULE_UNAVAILABLE");
  return NativeModules.HuKangOcr.inspectImage(uri);
}
