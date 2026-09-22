import { Directory, File, Paths } from "expo-file-system";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import{logScanEvent}from"./scanMetrics";
export type StableScanImage={scanId:string;originalUri:string;workUri:string;originalBytes:number;workBytes:number;width:number;height:number;orientation:string|null};

export async function persistScanImage(uri:string,meta?:{width?:number;height?:number;orientation?:unknown}):Promise<StableScanImage>{
  const dir=new Directory(Paths.document,"scans");dir.create({idempotent:true,intermediates:true});
  const scanId=`scan-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  const original=new File(dir,`${scanId}-original.jpg`);new File(uri).copy(original);
  await logScanEvent("PHOTO_CAPTURE_SUCCESS",{uri});
  await logScanEvent("URI",{value:uri});
  await logScanEvent("FILE_EXISTS",{value:original.exists});
  await logScanEvent("FILE_SIZE",{value:original.size??0});
  await logScanEvent("IMAGE_WIDTH",{value:meta?.width??0});
  await logScanEvent("IMAGE_HEIGHT",{value:meta?.height??0});
  await logScanEvent("EXIF_ORIENTATION",{value:meta?.orientation??null});
  await logScanEvent("PHOTO_FILE_VALIDATED",{exists:original.exists,size:original.size??0,width:meta?.width??0,height:meta?.height??0,orientation:meta?.orientation??null});
  if(!original.exists||!original.size){await logScanEvent("PHOTO_FILE_INVALID",{exists:original.exists,size:original.size??0});throw new Error("PHOTO_FILE_INVALID")}
  const orientation=Number(meta?.orientation??1),rotation=orientation===3?180:orientation===6?90:orientation===8?-90:0;
  const actions:Array<{resize:{width:number}}|{rotate:number}>=[];
  if(meta?.width&&meta.width>2400)actions.push({resize:{width:2400}});
  if(rotation)actions.push({rotate:rotation});
  const rendered=await manipulateAsync(original.uri,actions,{compress:.95,format:SaveFormat.JPEG});
  const work=new File(dir,`${scanId}-work.jpg`);new File(rendered.uri).copy(work);
  if(!work.exists||!work.size){await logScanEvent("PHOTO_FILE_INVALID",{stage:"work",exists:work.exists,size:work.size??0});throw new Error("PHOTO_FILE_INVALID")}
  await logScanEvent("VISION_INPUT_READY",{uri:work.uri,size:work.size??0,rotation});
  return{scanId,originalUri:original.uri,workUri:work.uri,originalBytes:original.size??0,workBytes:work.size??0,width:meta?.width??0,height:meta?.height??0,orientation:meta?.orientation==null?null:String(meta.orientation)};
}
