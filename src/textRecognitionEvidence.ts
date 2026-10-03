import type { StructuredResult } from "./visionProtocol";

// Keep local and remote evidence independent. The caller must explicitly choose
// between disagreeing candidates; remote output never overwrites native raw text.
export function visionTextCandidate(result:StructuredResult,mode:"ingredients"|"date"){
  if(result.raw_text.trim())return result.raw_text;
  if(mode==="ingredients"&&result.ingredients?.length)return `配料：${result.ingredients.join("、")}`;
  if(mode==="date"&&result.date_label){
    const roles=[["生产日期",result.date_label.production_date],["有效期",result.date_label.expiry_date],
      ["保质期",result.date_label.shelf_life],["批次",result.date_label.batch]];
    const labelled=roles.filter(([,value])=>value).map(([label,value])=>`${label}：${value}`).join("\n");
    if(labelled)return labelled;
  }
  // Unlabelled dates are visible candidates, not proof of production or expiry.
  return result.dates?.join("\n")??"";
}
export function sameTextEvidence(a:string,b:string){
  const compact=(value:string)=>value.normalize("NFKC").replace(/\s+/g,"");
  return compact(a)===compact(b);
}
export function visionSkipMessage(reason:string|undefined){
  if(reason==="VISION_NOT_CONFIGURED"||reason==="VISION_CONFIG_INVALID")return "联网图片识别尚未配置，本次没有发送照片。";
  if(reason==="VISION_OFFLINE")return "当前无法联网，本次没有发送照片。";
  if(reason==="VISION_CONSENT_DECLINED")return "联网图片识别未开启，本次没有发送照片。";
  if(reason==="VISION_TIMEOUT")return "联网图片识别超时，保留本地结果。";
  if(reason==="VISION_AUTH_ERROR")return "识别服务配置无效，保留本地结果。";
  if(reason?.startsWith("VISION_HTTP_ERROR")||reason==="VISION_NETWORK_ERROR")return "联网图片识别请求失败，保留本地结果。";
  if(reason?.startsWith("VISION_INVALID_RESPONSE"))return "联网返回的信息无法使用，保留本地结果。";
  return "部分内容没有识别清楚，请对照照片修改或重新拍摄。";
}
