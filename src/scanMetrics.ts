import AsyncStorage from "@react-native-async-storage/async-storage";
const KEY="@hukang/scan-metrics/v1";
export type ScanMetrics={barcodeDetected:number;localHit:number;onlineHit:number;photoCaptured:number;photoValid:number;ocrText:number;nutritionParsed:number;visionSuccess:number};
export const emptyScanMetrics:ScanMetrics={barcodeDetected:0,localHit:0,onlineHit:0,photoCaptured:0,photoValid:0,ocrText:0,nutritionParsed:0,visionSuccess:0};
export async function getScanMetrics(){const raw=await AsyncStorage.getItem(KEY);try{return raw?{...emptyScanMetrics,...JSON.parse(raw)}:emptyScanMetrics}catch{return emptyScanMetrics}}
export async function countScanMetric(key:keyof ScanMetrics){const current=await getScanMetrics();current[key]++;await AsyncStorage.setItem(KEY,JSON.stringify(current))}

const DEBUG_KEY="@hukang/scan-debug/v1";
export type ScanDebugEvent={at:string;name:string;details?:unknown};
export type ScanDebugRecord={capturedAt:string;cameraUri?:string;stableUri?:string;bytes?:number;resolution?:string;orientation?:string|null;quality?:unknown;rawText?:string;detectedType?:string;parse?:unknown;provider?:string;network?:string;error?:string;events?:ScanDebugEvent[]};
export async function saveScanDebug(patch:Partial<ScanDebugRecord>){const prior=await loadScanDebug();await AsyncStorage.setItem(DEBUG_KEY,JSON.stringify({...prior,...patch,capturedAt:new Date().toISOString()}))}
export async function loadScanDebug():Promise<ScanDebugRecord>{const raw=await AsyncStorage.getItem(DEBUG_KEY);try{return raw?JSON.parse(raw):{capturedAt:""}}catch{return{capturedAt:""}}}
export async function resetScanDebug(){await AsyncStorage.setItem(DEBUG_KEY,JSON.stringify({capturedAt:new Date().toISOString(),events:[]}))}
export async function logScanEvent(name:string,details?:unknown){const prior=await loadScanDebug(),events=[...(prior.events??[]),{at:new Date().toISOString(),name,details}].slice(-80);await AsyncStorage.setItem(DEBUG_KEY,JSON.stringify({...prior,capturedAt:new Date().toISOString(),events}))}
