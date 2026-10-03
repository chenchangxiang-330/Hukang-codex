import React,{useState} from "react";
import { ActivityIndicator,Image,Pressable,Text,View,useWindowDimensions } from "react-native";
import { preprocessImageForOcr,type CropRegion,type PreparedImage } from "./imagePreprocessing";
import { logScanError } from "./scanMetrics";
type Props={image:{uri:string;width:number;height:number};onDone:(image:PreparedImage)=>void;onCancel:()=>void;task?:"nutrition"|"ingredients"|"date"};
export default function ImageCropper({image,onDone,onCancel,task="nutrition"}:Props){
  const [current,setCurrent]=useState(image),[first,setFirst]=useState<{x:number;y:number}|null>(null),[region,setRegion]=useState<CropRegion|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const window=useWindowDimensions();const scale=Math.min((window.width-40)/current.width,Math.max(160,window.height-260)/current.height);
  const action=async(kind:"rotate"|"crop"|"whole")=>{
    setBusy(true);setError("");
    try{const result=await preprocessImageForOcr(current.uri,{upright:current,rotate:kind==="rotate"?90:undefined,crop:kind==="crop"?region??undefined:undefined,maxEdge:kind==="rotate"?undefined:4096});
      if(kind==="rotate"){setCurrent(result);setRegion(null);setFirst(null)}else onDone(result);
    }catch(error){await logScanError("manual_crop",error);setError("照片处理没有完成，请重试或重新拍摄。")}finally{setBusy(false)}
  };
  const button=(label:string,press:()=>void,disabled=false)=><Pressable disabled={disabled||busy} onPress={press} style={{padding:12,opacity:disabled||busy?0.45:1}}><Text style={{color:"#168F86",fontWeight:"700"}}>{label}</Text></Pressable>;
  return <View style={{flex:1,padding:20,gap:10,alignItems:"center",backgroundColor:"#F2FAF8"}}>
    <Text style={{fontSize:20,fontWeight:"700"}}>{task==="nutrition"?"选取营养成分表":task==="ingredients"?"选取完整配料表":"选取日期 / 保质期区域"}</Text>
    <Text>{task==="nutrition"?"依次点选区域的两个对角，保留计量基准和全部行。":task==="ingredients"?"点选两个对角，保留配料标题、全部文字和括号。":"点选两个对角，同时保留生产日期、有效期等文字标签。"}</Text>
    <View style={{width:current.width*scale,height:current.height*scale}} onStartShouldSetResponder={()=>!busy} onResponderRelease={e=>{
      const x=Math.max(0,Math.min(current.width-1,Math.round(e.nativeEvent.locationX/scale))),y=Math.max(0,Math.min(current.height-1,Math.round(e.nativeEvent.locationY/scale)));
      if(!first||region){setFirst({x,y});setRegion(null)}else{const r={originX:Math.min(x,first.x),originY:Math.min(y,first.y),width:Math.abs(x-first.x),height:Math.abs(y-first.y)};if(r.width>=24&&r.height>=24)setRegion(r);else setError("选区太小，请重新选取两个对角。")}
    }}>
      <View pointerEvents="none" style={{width:"100%",height:"100%"}}><Image source={{uri:current.uri}} style={{width:"100%",height:"100%"}}/></View>
      {first&&!region&&<View pointerEvents="none" style={{position:"absolute",left:first.x*scale-4,top:first.y*scale-4,width:8,height:8,backgroundColor:"#18BFB0"}}/>}
      {region&&<View pointerEvents="none" style={{position:"absolute",left:region.originX*scale,top:region.originY*scale,width:region.width*scale,height:region.height*scale,borderWidth:2,borderColor:"#18BFB0",backgroundColor:"rgba(24,191,176,0.08)"}}/>}
    </View>
    {!!error&&<Text>{error}</Text>}{busy&&<ActivityIndicator/>}
    <View style={{flexDirection:"row",flexWrap:"wrap",justifyContent:"center"}}>
      {button("裁剪后识别",()=>action("crop"),!region)}{button("整张识别",()=>action("whole"))}
      {button("旋转90°",()=>action("rotate"))}{button("重新拍摄",onCancel)}
    </View>
  </View>;
}
