import AsyncStorage from "@react-native-async-storage/async-storage";
import type { OcrEngine } from "./ocr";

const KEY="@hukang/ocr-engine-override";
// A separate reversible engine override; benchmark callers explicitly select their engine.
export async function getOcrEngineOverride():Promise<OcrEngine|null>{
  try{const value=await AsyncStorage.getItem(KEY);return value==="mlkit"||value==="paddle"?value:null}
  catch{return null}
}
export async function setOcrEngineOverride(engine:OcrEngine|null):Promise<void>{
  if(engine!==null&&engine!=="mlkit"&&engine!=="paddle")throw new Error("OCR_ENGINE_OVERRIDE_INVALID");
  if(engine===null)await AsyncStorage.removeItem(KEY);else await AsyncStorage.setItem(KEY,engine);
}
