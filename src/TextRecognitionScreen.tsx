import React,{useEffect,useMemo,useState} from "react";
import {ActivityIndicator,Alert,Image,Pressable,ScrollView,Text,TextInput,View} from "react-native";
import ImageCropper from "./ImageCropper";
import {recognizeTextLabel} from "./textLabelRecognition";
import {parseDateLabel,parseIngredientsLabel,findSugarKeywords} from "./parser";
import {sameTextEvidence,visionSkipMessage} from "./textRecognitionEvidence";
import {logScanEvent,logScanError,saveScanDebug} from "./scanMetrics";
import type {RecognitionProps} from "./RecognitionScreen";

type Props=Omit<RecognitionProps,"requestedMode">&{requestedMode:"ingredients"|"date"};
type Result=Awaited<ReturnType<typeof recognizeTextLabel>>;
const color="#168F86";

export default function TextRecognitionScreen(props:Props){
  const [size,setSize]=useState<{width:number;height:number}|null>(null),[selected,setSelected]=useState<string|null>(null),[error,setError]=useState(false);
  useEffect(()=>{let active=true;Image.getSize(props.photo,(width,height)=>{if(active)setSize({width,height})},()=>{if(active)setError(true)});return()=>{active=false}},[props.photo]);
  if(selected)return <TextResult {...props} photo={selected}/>;
  if(error)return <View><Text>照片无法读取，请重新拍摄。</Text><Pressable onPress={props.back}><Text>重新拍摄</Text></Pressable></View>;
  if(!size)return <ActivityIndicator/>;
  return <ImageCropper task={props.requestedMode} image={{uri:props.photo,...size}} onCancel={props.back} onDone={async image=>{
    await saveScanDebug({stableUri:image.uri,resolution:`${image.width}×${image.height}`,orientation:"1"});setSelected(image.uri);
  }}/>;
}

function TextResult({photo,barcode,requestedMode,back,onCreate,onDate}:Props){
  const [result,setResult]=useState<Result|null>(null),[working,setWorking]=useState(true),[status,setStatus]=useState("正在读取照片…"),[failure,setFailure]=useState(false);
  const [text,setText]=useState(""),[choice,setChoice]=useState<"local"|"vision"|"manual"|null>(null),[editing,setEditing]=useState(false);
  useEffect(()=>{let cancelled=false;
    recognizeTextLabel(photo,requestedMode,label=>{if(!cancelled)setStatus(label)},()=>cancelled).then(value=>{
      if(cancelled)return;setResult(value);
      const conflict=!!value.remoteText&&!!value.localText&&!sameTextEvidence(value.localText,value.remoteText);
      setText(value.localText||value.remoteText);
      if(!conflict)setChoice(value.localText?"local":value.remoteText?"vision":null);
      if(!value.localText&&!value.remoteText)setEditing(true);
    }).catch(async error=>{await logScanError("text_label_result",error);if(!cancelled){setFailure(true);setEditing(true)}}).finally(()=>{if(!cancelled)setWorking(false)});
    return()=>{cancelled=true};
  },[photo,requestedMode]);
  const ingredients=useMemo(()=>parseIngredientsLabel(text),[text]);
  const dates=useMemo(()=>parseDateLabel(text),[text]);
  const conflict=!!result?.remoteText&&!!result.localText&&!sameTextEvidence(result.localText,result.remoteText);
  const choose=(source:"local"|"vision")=>{setChoice(source);setText(source==="local"?result?.localText??"":result?.remoteText??"");setEditing(false)};
  const confirm=()=>{
    if(conflict&&!choice){Alert.alert("两次识别不一致","请对照照片选择本地或联网的一组文字，或手动修改。不会自动覆盖。");return}
    if(!text.trim()){Alert.alert("还没有可确认的文字","请重新拍摄，或手动填写照片上可见的内容。");return}
    const finish=()=>{
      void logScanEvent("USER_CONFIRMED",{task:requestedMode,source:choice??"manual",text});
      if(requestedMode==="date"){onDate(dates.expiryDate??undefined,dates.productionDate??undefined);return}
      onCreate({photo,barcode,source:choice==="vision"?"online_vision":choice==="manual"&&result?.vision?"mixed":"local_ocr",
        rawText:result?.localText??"",draft:{name:choice==="vision"?result?.vision?.product_name??"":"",ingredients:ingredients.ingredients.join("、")}});
    };
    if(requestedMode==="date"&&!dates.expiryDate){
      Alert.alert("没有可靠的到期日","生产日期和批次不会当作到期日。下一页的到期日将留空，请手动确认。",[{text:"继续核对",style:"cancel"},{text:"保留已确认信息",onPress:finish}]);
    }else if((requestedMode==="ingredients"&&(ingredients.quality.needsConfirmation||result?.needsReview))||(requestedMode==="date"&&(dates.quality.needsConfirmation||result?.needsReview))){
      Alert.alert("请确认与照片一致",requestedMode==="date"?"计算到期日只是候选，请核对生产日期、保质期与储存条件。":"识别不确定。成分分析依赖文字准确性，请先核对顺序、括号和缺失内容。",[{text:"继续修改",style:"cancel"},{text:"已逐项核对",onPress:finish}]);
    }else finish();
  };
  const button=(label:string,action:()=>void)=><Pressable onPress={action} style={{padding:10}}><Text style={{color,fontWeight:"700"}}>{label}</Text></Pressable>;
  return <ScrollView contentContainerStyle={{padding:20,paddingBottom:48,gap:12,backgroundColor:"#F2FAF8"}}>
    {button("返回 / 重新拍摄",back)}<Image source={{uri:photo}} resizeMode="contain" style={{height:250,width:"100%"}}/>
    <Text style={{fontSize:20,fontWeight:"700"}}>{requestedMode==="ingredients"?"配料表 · 请对照照片确认":"包装日期 · 请确认用途"}</Text>
    {working?<><ActivityIndicator/><Text>{status}</Text></>:<>
      {(failure||result?.needsReview)&&<Text>{failure?"识别没有完成，可以重新拍摄或手动填写。":visionSkipMessage(result?.visionReason)}</Text>}
      {conflict&&<View><Text>本地与联网文字不同，请选一组后核对，或手动修改。</Text>
        <Text selectable>本地候选：{result?.localText}</Text>{button("使用本地候选",()=>choose("local"))}
        <Text selectable>联网候选：{result?.remoteText}</Text>{button("使用联网候选",()=>choose("vision"))}
      </View>}
      {requestedMode==="ingredients"?<>
        <Text selectable>{ingredients.ingredients.join("、")||"没有识别到可靠配料内容"}</Text>
        {(ingredients.quality.needsConfirmation||result?.needsReview)?<Text>文字仍待确认，暂不据此给出可靠成分分析。</Text>:<>
          {!!findSugarKeywords(text).length&&<Text>文字关键词：{findSugarKeywords(text).join("、")}。仅为关键词提示，请核对原文。</Text>}
        </>}
      </>:<>
        <Text>生产日期：{dates.productionDate??"未识别 / 用途不明"}</Text>
        <Text>明确有效期：{dates.explicitExpiryDate??"未识别"}</Text>
        <Text>保质期：{dates.shelfLife?.rawText??"未识别"}</Text>
        {!!dates.computedExpiryDate&&<Text>按生产日期与保质期计算的到期候选：{dates.computedExpiryDate}（需确认）</Text>}
        <Text>批次：{dates.batch??"未识别"}</Text>
        {!!dates.unclassifiedDates.length&&<Text>用途不明的日期：{dates.unclassifiedDates.join("、")}。不会自动填写有效期。</Text>}
      </>}
      {editing&&<TextInput accessibilityLabel="核对包装文字" value={text} onChangeText={value=>{setText(value);setChoice("manual")}} multiline style={{minHeight:160,padding:12,backgroundColor:"white",textAlignVertical:"top"}} placeholder="只填写图片上实际可见的文字与日期标签"/>}
      {button(editing?"完成修改":"信息不对？手动修改",()=>setEditing(value=>!value))}
      {button("核对后继续",confirm)}{button("重新拍摄",back)}
    </>}
  </ScrollView>;
}
