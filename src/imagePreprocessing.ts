import { NativeModules, Platform } from "react-native";
import { File, Directory, Paths } from "expo-file-system";
import { manipulateAsync, SaveFormat, type Action } from "expo-image-manipulator";
import { logScanEvent } from "./scanMetrics";

export type CropRegion={originX:number;originY:number;width:number;height:number};
export type PreparedImage={uri:string;width:number;height:number;sourceOrientation:number;orientation:1;steps:string[]};
export async function preprocessImageForOcr(uri:string,options:{upright?:{width:number;height:number};crop?:CropRegion;rotate?:number;maxEdge?:number}={}):Promise<PreparedImage>{
  let image:PreparedImage;
  if(options.upright)image={uri,...options.upright,sourceOrientation:1,orientation:1,steps:[]};
  else{
    if(Platform.OS!=="android"||!NativeModules.HuKangOcr?.normalizeImage)throw new Error("IMAGE_PREPROCESS_MODULE_UNAVAILABLE");
    image=await NativeModules.HuKangOcr.normalizeImage(uri);
  }
  const actions:Action[]=[];
  if(options.crop){const c=options.crop;
    if(!Object.values(c).every(Number.isFinite)||c.originX<0||c.originY<0||c.width<1||c.height<1||c.originX+c.width>image.width||c.originY+c.height>image.height)throw new Error("IMAGE_CROP_INVALID");
    actions.push({crop:c});image.steps.push("manual_crop");
  }
  if(options.rotate){actions.push({rotate:options.rotate});image.steps.push(`manual_rotate_${options.rotate}`)}
  if(actions.length){const transformed=await manipulateAsync(image.uri,actions,{compress:0.98,format:SaveFormat.JPEG});image={...image,...transformed}}
  // Only limit dimensions after ROI selection. Upscaling cannot restore missing strokes.
  const limit=options.maxEdge;
  if(limit&&Math.max(image.width,image.height)>limit){const factor=limit/Math.max(image.width,image.height);
    const resized=await manipulateAsync(image.uri,[{resize:{width:Math.round(image.width*factor),height:Math.round(image.height*factor)}}],{compress:0.98,format:SaveFormat.JPEG});
    image={...image,...resized};image.steps.push(`max_edge_${limit}`);
  }
  const dir=new Directory(Paths.document,"scans");dir.create({idempotent:true,intermediates:true});
  const output=new File(dir,`prepared-${Date.now()}-${Math.random().toString(36).slice(2,8)}.jpg`);
  await new File(image.uri).copy(output);
  if(!output.exists||!output.size)throw new Error("PHOTO_FILE_INVALID:preprocessed");image.uri=output.uri;
  await logScanEvent("IMAGE_WIDTH",{value:image.width});await logScanEvent("IMAGE_HEIGHT",{value:image.height});
  await logScanEvent("IMAGE_FILE_SIZE",{value:output.size});await logScanEvent("IMAGE_ORIENTATION",{source:image.sourceOrientation,output:1,steps:image.steps});
  return image;
}
