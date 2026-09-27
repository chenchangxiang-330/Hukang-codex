import { Directory, File, Paths } from "expo-file-system";
import { preprocessImageForOcr } from "./imagePreprocessing";
import{logScanError,logScanEvent}from"./scanMetrics";
export type StableScanImage={scanId:string;originalUri:string;workUri:string;originalBytes:number;workBytes:number;width:number;height:number;orientation:string|null};

export async function persistScanImage(uri:string,meta?:{width?:number;height?:number;orientation?:unknown}):Promise<StableScanImage>{
  let stage="create_scan_directory";
  try{
    const dir=new Directory(Paths.document,"scans");
    dir.create({idempotent:true,intermediates:true});
    const scanId=`scan-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    await logScanEvent("PHOTO_URI",{value:uri});

    stage="copy_original";
    const original=new File(dir,`${scanId}-original.jpg`);
    await new File(uri).copy(original);
    const originalExists=original.exists,originalSize=original.size??0;
    await logScanEvent("FILE_EXISTS",{stage:"original",value:originalExists});
    await logScanEvent("FILE_SIZE",{stage:"original",value:originalSize});
    await logScanEvent("IMAGE_WIDTH",{value:meta?.width??0});
    await logScanEvent("IMAGE_HEIGHT",{value:meta?.height??0});
    await logScanEvent("EXIF_ORIENTATION",{value:meta?.orientation??null});
    if(!originalExists||originalSize<=0){
      await logScanEvent("PHOTO_FILE_INVALID",{stage:"original",exists:originalExists,size:originalSize});
      throw new Error("PHOTO_FILE_INVALID:original");
    }

    stage="image_manipulation";
    await logScanEvent("IMAGE_PREPARE_STARTED",{uri:original.uri});
    // One native decoder owns EXIF, including mirrored cases. Keep detail until ROI selection.
    const rendered=await preprocessImageForOcr(original.uri);

    stage="copy_work";
    const work=new File(dir,`${scanId}-work.jpg`);
    await new File(rendered.uri).copy(work);
    const workExists=work.exists,workSize=work.size??0;
    await logScanEvent("FILE_EXISTS",{stage:"work",value:workExists});
    await logScanEvent("FILE_SIZE",{stage:"work",value:workSize});
    if(!workExists||workSize<=0){
      await logScanEvent("PHOTO_FILE_INVALID",{stage:"work",exists:workExists,size:workSize});
      throw new Error("PHOTO_FILE_INVALID:work");
    }
    await logScanEvent("IMAGE_PREPARE_SUCCESS",{uri:work.uri,size:workSize,width:rendered.width,height:rendered.height,steps:rendered.steps});
    await logScanEvent("OCR_INPUT_READY",{uri:work.uri,size:workSize});
    await logScanEvent("VISION_INPUT_READY",{uri:work.uri,size:workSize});
    return{scanId,originalUri:original.uri,workUri:work.uri,originalBytes:originalSize,workBytes:workSize,width:rendered.width,height:rendered.height,orientation:String(rendered.sourceOrientation)};
  }catch(error){
    await logScanError(stage,error);
    throw error;
  }
}
