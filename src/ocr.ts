import { NativeModules, Platform } from "react-native";
export async function recognizeText(uri: string): Promise<string> {
  if (Platform.OS !== "android" || !NativeModules.HuKangOcr) throw new Error("当前设备不支持离线 OCR");
  return NativeModules.HuKangOcr.recognize(uri);
}
export type ImageQuality={brightness:number;sharpness:number;width:number;height:number;overexposedRatio:number;tooDark:boolean;tooBright:boolean;tooBlurry:boolean;tooSmall:boolean;hasGlare:boolean};
export async function inspectImage(uri:string):Promise<ImageQuality>{
  if(Platform.OS!=="android"||!NativeModules.HuKangOcr)return{brightness:128,sharpness:20,width:1000,height:1000,overexposedRatio:0,tooDark:false,tooBright:false,tooBlurry:false,tooSmall:false,hasGlare:false};
  return NativeModules.HuKangOcr.inspectImage(uri);
}
