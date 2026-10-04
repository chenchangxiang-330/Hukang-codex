import React,{useState}from"react";
import{Alert,Linking,Platform,Pressable,Text,View}from"react-native";
import{File,Paths}from"expo-file-system";
import*as Sharing from"expo-sharing";
import{loadScanDebug,type ScanDebugRecord}from"./scanMetrics";
import{runRealNutritionBenchmark}from"./ocrBenchmark";
import{buildInfo}from"./buildInfo";

export default function RecognitionDiagnostics({debug,onRefresh}:{debug:ScanDebugRecord;onRefresh:(debug:ScanDebugRecord)=>void}){
  const[busy,setBusy]=useState(false),[status,setStatus]=useState("");
  const refresh=async()=>onRefresh(await loadScanDebug());
  const benchmark=async()=>{setBusy(true);try{await runRealNutritionBenchmark(setStatus);await refresh();setStatus("执行记录已保存。未配置 Vision 时会明确标注未执行。")}catch(error){setStatus(String(error))}finally{setBusy(false)}};
  const device={os:Platform.OS,version:Platform.Version,...(Platform.OS==="android"?{brand:Platform.constants.Brand,model:Platform.constants.Model,release:Platform.constants.Release}:{})};
  const exportEvidence=async()=>{try{const current=await loadScanDebug();const file=new File(Paths.cache,`HuKang-recognition-${Date.now()}.json`);file.write(JSON.stringify({...current,buildInfo,device,exportedAt:new Date().toISOString(),...(current.ab??{})},null,2));await Sharing.shareAsync(file.uri,{mimeType:"application/json"})}catch{Alert.alert("导出失败","请稍后重试。")}};
  return <View style={{gap:10}}>
    <Text selectable>版本 {buildInfo.version} · {buildInfo.channel} · 源码 {buildInfo.sourceCommit??"本地开发，未标定提交"}</Text>
    <Text selectable>{JSON.stringify(device)}</Text>
    <Text style={{fontWeight:"700"}}>OCR 原始文字（未被 Parser / Vision 改写）</Text>
    <Text selectable style={{padding:12,backgroundColor:"white"}}>{debug.rawText||"暂无原始文字；请查看 OCR_START / OCR_FAILED 事件"}</Text>
    <Pressable disabled={busy} onPress={refresh}><Text>刷新诊断</Text></Pressable>
    <Pressable disabled={busy} onPress={()=>Alert.alert("真实图片对照测试","运行两张内置中文食品照片，比较原图、裁剪图与实验灰度图。若已配置且允许联网，会上传这两张公开样本到你配置的服务。",[{text:"取消"},{text:"运行测试",onPress:benchmark}])}><Text>运行两张真实图片 A/B 测试</Text></Pressable>
    <Text>{status}</Text><Text>图片来源：Open Food Facts，贡献者 macrofactor / smoothie-app，CC BY-SA 3.0。实验裁剪/灰度为派生版本，原图保留。灰度增强不默认用于用户照片。</Text>
    <Text onPress={()=>Linking.openURL("https://creativecommons.org/licenses/by-sa/3.0/")}>查看 CC BY-SA 3.0 许可</Text>
    <Text onPress={()=>Linking.openURL("https://world.openfoodfacts.org/product/6923644266066")}>样本来源：macrofactor</Text>
    <Text onPress={()=>Linking.openURL("https://world.openfoodfacts.org/product/6937003117814")}>样本来源：smoothie-app</Text>
    <Pressable disabled={busy} onPress={exportEvidence}><Text>导出诊断 / Benchmark JSON</Text></Pressable>
  </View>;
}
