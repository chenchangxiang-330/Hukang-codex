import AsyncStorage from "@react-native-async-storage/async-storage";
const KEY="@hukang/scan-metrics/v1";
export type ScanMetrics={barcodeDetected:number;localHit:number;onlineHit:number;photoCaptured:number;photoValid:number;ocrText:number;nutritionParsed:number;visionSuccess:number};
export const emptyScanMetrics:ScanMetrics={barcodeDetected:0,localHit:0,onlineHit:0,photoCaptured:0,photoValid:0,ocrText:0,nutritionParsed:0,visionSuccess:0};
export async function getScanMetrics(){const raw=await AsyncStorage.getItem(KEY);try{return raw?{...emptyScanMetrics,...JSON.parse(raw)}:emptyScanMetrics}catch{return emptyScanMetrics}}
export async function countScanMetric(key:keyof ScanMetrics){try{const current=await getScanMetrics();current[key]++;await AsyncStorage.setItem(KEY,JSON.stringify(current))}catch(error){console.warn("scan metric write failed",key,error)}}

const DEBUG_KEY="@hukang/scan-debug/v1";
export type ScanDebugEvent={at:string;name:string;details?:unknown};
export type ScanDebugRecord={capturedAt:string;cameraUri?:string;originalUri?:string;stableUri?:string;bytes?:number;resolution?:string;orientation?:string|null;quality?:unknown;rawText?:string;detectedType?:string;parse?:unknown;provider?:string;network?:string;error?:string;events?:ScanDebugEvent[];ocr?:unknown;vision?:unknown;ab?:unknown};
// Serialize read-modify-write: parallel stage diagnostics must not erase raw text.
let debugWrites:Promise<void>=Promise.resolve();
function writeDebug(action:()=>Promise<void>){debugWrites=debugWrites.then(action).catch(error=>{console.warn("scan diagnostic write failed",error)});return debugWrites}
export function saveScanDebug(patch:Partial<ScanDebugRecord>){return writeDebug(async()=>{const prior=await loadScanDebug();await AsyncStorage.setItem(DEBUG_KEY,JSON.stringify({...prior,...patch,capturedAt:new Date().toISOString()}))})}
export async function loadScanDebug():Promise<ScanDebugRecord>{const raw=await AsyncStorage.getItem(DEBUG_KEY);try{return raw?JSON.parse(raw):{capturedAt:""}}catch{return{capturedAt:""}}}
export function resetScanDebug(){return writeDebug(()=>AsyncStorage.setItem(DEBUG_KEY,JSON.stringify({capturedAt:new Date().toISOString(),events:[]})))}
export function logScanEvent(name:string,details?:unknown){return writeDebug(async()=>{
  const prior=await loadScanDebug(),events=[...(prior.events??[]),{at:new Date().toISOString(),name,details}].slice(-160);
  await AsyncStorage.setItem(DEBUG_KEY,JSON.stringify({...prior,capturedAt:new Date().toISOString(),events}));
})}
export function scanErrorDetails(error:unknown){return{message:error instanceof Error?error.message:String(error),stack:error instanceof Error?error.stack:undefined}}
export async function logScanError(stage:string,error:unknown){const{message,stack}=scanErrorDetails(error);await logScanEvent("ERROR_STAGE",{value:stage});await logScanEvent("ERROR_MESSAGE",{value:message});if(stack)await logScanEvent("STACK_TRACE",{value:stack})}
