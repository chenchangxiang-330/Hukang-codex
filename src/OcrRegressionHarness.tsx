import React,{useEffect,useRef,useState} from "react";
import { ActivityIndicator,ScrollView,Text } from "react-native";
import { File,Paths } from "expo-file-system";
import { runRealNutritionBenchmark } from "./ocrBenchmark";
import { buildInfo } from "./buildInfo";

// MainActivity exposes this screen only for an explicit cloud Debug test intent.
// Recognition reads the real bundled photos; no annotated text or values enter the pipeline.
export default function OcrRegressionHarness({runId}:{runId:string}){
  const started=useRef(false),[status,setStatus]=useState("正在运行真实图片 OCR 回归测试…"),[done,setDone]=useState(false);
  useEffect(()=>{
    if(started.current)return;
    started.current=true;
    const run=async()=>{
      const startedAt=new Date().toISOString();
      const output=new File(Paths.document,"ocr-regression.json");
      const temporary=new File(Paths.document,"ocr-regression.pending.json");
      // Remove only this harness's previous result so a rerun cannot pass on stale evidence.
      if(output.exists)output.delete();
      try{
        const result=await runRealNutritionBenchmark(setStatus,{vision:false});
        const providers=[...new Set(result.runs.flatMap(run=>Object.values(run.stages)
          .map(stage=>stage.provider).filter((value):value is string=>typeof value==="string")))];
        temporary.write(JSON.stringify({...result,status:"completed",runId,startedAt,buildInfo,mode:"ci_local_only",providers,
          documentDirectory:Paths.document.uri,vision:{status:"not_run",reason:"CI_NO_VISION_KEY"}},null,2));
        await temporary.move(output,{overwrite:true});
        setStatus(`真实图片 OCR 执行记录已保存：${output.uri}`);
      }catch(error){
        temporary.write(JSON.stringify({schemaVersion:1,status:"error",runId,startedAt,buildInfo,mode:"ci_local_only",runs:[],
          error:error instanceof Error?error.message:String(error),completedAt:new Date().toISOString(),
          documentDirectory:Paths.document.uri,vision:{status:"not_run",reason:"CI_NO_VISION_KEY"}},null,2));
        await temporary.move(output,{overwrite:true});
        setStatus("OCR 回归测试没有完成，错误已写入执行记录。");
      }finally{setDone(true)}
    };
    void run().catch(error=>{setStatus(`执行记录无法保存：${String(error)}`);setDone(true)});
  },[]);
  return <ScrollView contentContainerStyle={{padding:24,paddingTop:48,gap:12}}>
    <Text>HuKang · 自动 OCR 回归测试</Text>{!done&&<ActivityIndicator/>}
    <Text selectable>{status}</Text><Text>Vision 未执行：CI_NO_VISION_KEY。此测试不发送联网识别请求。</Text>
  </ScrollView>;
}
