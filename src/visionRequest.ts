import { buildVisionBody, validateVisionResult, visionConfigIssue } from "./visionProtocol.ts";
import type { VisionConfig, VisionMode, StructuredResult } from "./visionProtocol.ts";
type Event=(name:string,details?:unknown)=>Promise<void>;
export async function requestVision(config:VisionConfig,mode:VisionMode,readImage:()=>Promise<string>,event:Event,fetcher:typeof fetch=fetch):Promise<StructuredResult>{
  const started=Date.now();let timer:ReturnType<typeof setTimeout>|undefined;let sent=false;let phase="config";
  const issue=visionConfigIssue(config);
  await event("VISION_PROVIDER",{value:"openai-compatible",endpoint:issue?"invalid_or_unconfigured":new URL(config.endpoint).origin});
  await event("VISION_MODEL",{value:config.model});
  try{
    if(issue)throw new Error(issue);
    phase="image";
    const base64=await readImage();const body=buildVisionBody(config,base64,mode);
    const bytes=Math.floor(base64.length*3/4)-(base64.endsWith("==")?2:base64.endsWith("=")?1:0);
    if(bytes>20*1024*1024)throw new Error("VISION_IMAGE_TOO_LARGE");
    const controller=new AbortController();timer=setTimeout(()=>controller.abort(),45000);
    await event("VISION_REQUEST_START",{mode,imageBytes:bytes,imageIncluded:true,detail:"high"});
    phase="network";sent=true;
    const response=await fetcher(config.endpoint,{method:"POST",signal:controller.signal,headers:{"Content-Type":"application/json",Authorization:`Bearer ${config.apiKey.trim()}`},body:JSON.stringify(body)});
    await event("HTTP_STATUS",{scope:"vision",status:response.status});
    if(!response.ok)throw new Error(response.status===401||response.status===403?"VISION_AUTH_ERROR":`VISION_HTTP_ERROR:${response.status}`);
    phase="response";
    const data=await response.json();const raw=data?.choices?.[0]?.message?.content;
    if(typeof raw!=="string")throw new Error("VISION_INVALID_RESPONSE:missing_content");
    await event("VISION_RESPONSE_RAW",{value:raw.slice(0,65536),truncated:raw.length>65536});
    if(raw.length>65536)throw new Error("VISION_INVALID_RESPONSE:too_large");
    const result=validateVisionResult(JSON.parse(raw),mode);
    await event("VISION_STRUCTURED_RESULT",{value:result});
    const core=[result.nutrition?.energy_kj??result.nutrition?.energy_kcal,result.nutrition?.protein_g,result.nutrition?.fat_g,result.nutrition?.carbohydrate_g,result.nutrition?.sodium_mg];
    if((mode==="nutrition_label"&&(!result.basis||core.some(v=>v==null)))||result.uncertain_fields.length||Object.values(result.confidence??{}).some(n=>n<0.75))await event("VISION_LOW_CONFIDENCE");
    return result;
  }catch(error){
    // Do not persist fetch error bodies, authorization headers or the base64 image.
    const message=error instanceof Error?error.message:"";
    const aborted=error instanceof Error&&error.name==="AbortError";
    const code=message.startsWith("VISION_")?message:aborted?"VISION_TIMEOUT":phase==="response"?"VISION_INVALID_RESPONSE":phase==="image"?"VISION_IMAGE_UNREADABLE":"VISION_NETWORK_ERROR";
    if(!sent)await event("VISION_NOT_SENT",{reason:code});
    await event(code.split(":")[0]);await event("VISION_ERROR",{code,phase,sent});
    throw new Error(code);
  }finally{if(timer)clearTimeout(timer);await event("VISION_DURATION_MS",{value:Date.now()-started})}
}
