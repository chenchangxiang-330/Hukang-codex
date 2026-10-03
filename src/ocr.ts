import { NativeModules, Platform } from "react-native";
import { logScanEvent, saveScanDebug } from "./scanMetrics";
import { textInReadingRows,textInNutritionRows, type OcrLine } from "./ocrGeometry";
export async function recognizeText(uri: string): Promise<string> {
  return (await recognizeDetailed(uri)).text;
}
export type OcrResult={text:string;parserText:string;lines:OcrLine[];provider:string;durationMs:number;lowConfidence:boolean};
export async function recognizeDetailed(uri:string,task:"general"|"nutrition"="general"):Promise<OcrResult>{
  const started=Date.now();
  await logScanEvent("OCR_START",{uri});
  try{
    if(Platform.OS!=="android"||!NativeModules.HuKangOcr)throw new Error("OCR_MODULE_UNAVAILABLE");
    const native=NativeModules.HuKangOcr;
    const result=native.recognizeDetailed?await native.recognizeDetailed(uri):{text:await native.recognize(uri),lines:[],provider:"mlkit-chinese-legacy-bridge"};
    const lines:OcrLine[]=result.lines??[];
    const scores=lines.map(line=>line.confidence).filter((n):n is number=>typeof n==="number"&&n>0);
    // Routing heuristic, not a measured probability of correct nutrition values.
    const lowConfidence=scores.length===0||scores.length!==lines.length||scores.some(n=>n<0.75);
    const output:OcrResult={...result,lines,parserText:lines.length?(task==="nutrition"?textInNutritionRows(lines):textInReadingRows(lines)):result.text,durationMs:Date.now()-started,lowConfidence};
    await logScanEvent("OCR_PROVIDER",{value:output.provider});
    await logScanEvent("OCR_RAW_TEXT",{value:output.text});
    await logScanEvent("OCR_TEXT_LENGTH",{value:output.text.length});
    await logScanEvent("OCR_DURATION_MS",{value:output.durationMs});
    await logScanEvent("OCR_SUCCESS",{hasText:!!output.text.trim()});
    if(!output.text.trim())await logScanEvent("OCR_NO_TEXT");
    else if(lowConfidence)await logScanEvent("OCR_LOW_CONFIDENCE",{lineScores:scores});
    await saveScanDebug({rawText:output.text,ocr:output,provider:output.provider});return output;
  }catch(error){
    await logScanEvent("OCR_FAILED",{error:String(error)});
    await logScanEvent("OCR_DURATION_MS",{value:Date.now()-started});
    await saveScanDebug({rawText:"",ocr:{error:String(error)},error:"OCR_FAILED"});throw error;
  }
}
export type ImageQuality={brightness:number;sharpness:number;width:number;height:number;overexposedRatio:number;tooDark:boolean;tooBright:boolean;tooBlurry:boolean;tooSmall:boolean;hasGlare:boolean};
export async function inspectImage(uri:string):Promise<ImageQuality>{
  if(Platform.OS!=="android"||!NativeModules.HuKangOcr)throw new Error("OCR_MODULE_UNAVAILABLE");
  return NativeModules.HuKangOcr.inspectImage(uri);
}
