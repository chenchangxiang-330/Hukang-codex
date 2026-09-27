import NetInfo from "@react-native-community/netinfo";
import { Alert } from "react-native";
import { loadScannerPreferences, saveScannerPreferences } from "./preferences";
import { getVisionConfig, OpenAICompatibleFoodVisionProvider, type VisionMode } from "./vision";
import { visionConfigIssue } from "./visionProtocol";
import { logScanEvent, saveScanDebug } from "./scanMetrics";

export async function requestVisionConsent(){
  const p=await loadScannerPreferences();if(p.onlineConsentAsked)return p.onlineEnhancement;
  return new Promise<boolean>(resolve=>Alert.alert("联网增强识别","本地识别不清时，可以将当前食品标签照片发送到你配置的识别服务。是否允许？",[
    {text:"暂不开启",style:"cancel",onPress:()=>{saveScannerPreferences({...p,onlineConsentAsked:true,onlineEnhancement:false}).then(()=>resolve(false),()=>resolve(false))}},
    {text:"允许",onPress:()=>{saveScannerPreferences({...p,onlineConsentAsked:true,onlineEnhancement:true}).then(()=>resolve(true),()=>resolve(false))}},
  ],{cancelable:false}));
}
export async function runVisionFallback(photo:string,mode:VisionMode,needed:boolean,reason:string,isCancelled=()=>false){
  await logScanEvent("VISION_TRIGGERED",{needed,reason});
  const skip=async(code:string)=>{await logScanEvent(code);await logScanEvent("VISION_NOT_SENT",{reason:code});await saveScanDebug({vision:{status:"not_sent",reason:code}});return null};
  if(!needed)return skip("LOCAL_RESULT_SUFFICIENT");
  try{
    const config=await getVisionConfig();const issue=visionConfigIssue(config);
    await logScanEvent("VISION_CONFIGURATION",{keyPresent:!!config.apiKey?.trim(),model:config.model,valid:!issue});
    if(issue)return skip(issue);
    if(isCancelled())return skip("SCAN_CANCELLED");
    if(!(await requestVisionConsent()))return skip("VISION_CONSENT_DECLINED");
    if(isCancelled())return skip("SCAN_CANCELLED");
    const network=await NetInfo.fetch();
    if(network.isConnected===false||network.isInternetReachable===false)return skip("VISION_OFFLINE");
    const provider=new OpenAICompatibleFoodVisionProvider(config);
    const result=mode==="nutrition_label"?await provider.analyzeNutrition(photo):mode==="ingredients"?await provider.analyzeIngredients(photo):mode==="expiry"?await provider.analyzeExpiry(photo):mode==="product_packaging"?await provider.analyzeProduct(photo):await provider.analyzeFoodImage(photo);
    await saveScanDebug({vision:{status:"response_received",result}});return result;
  }catch(error){
    const code=error instanceof Error&&error.message.startsWith("VISION_")?error.message:"VISION_NETWORK_ERROR";
    await logScanEvent("VISION_ERROR",{code});await saveScanDebug({vision:{status:"failed",reason:code}});return null;
  }
}
