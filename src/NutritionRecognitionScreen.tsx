import React,{useEffect,useMemo,useState}from"react";
import{ActivityIndicator,Alert,Image,Pressable,ScrollView,Text,TextInput,View}from"react-native";
import ImageCropper from"./ImageCropper";
import{recognizeNutrition}from"./nutritionRecognition";
import{mergeRecognitionResults}from"./recognitionMerge";
import{parseNutritionLabel}from"./parser";
import{logScanEvent,logScanError,saveScanDebug}from"./scanMetrics";
import{visionSkipMessage}from"./textRecognitionEvidence";
import type{Nutrients}from"./types";
type CreateArgs={photo:string;barcode?:string;source:"local_ocr"|"online_vision"|"mixed";rawText:string;draft:Record<string,string>};
type Props={photo:string;barcode?:string;scanMeta?:string;back:()=>void;onCreate:(value:CreateArgs)=>void};
type Recognition=Awaited<ReturnType<typeof recognizeNutrition>>;
const fields:[keyof Nutrients,string,string][]=[["energyKj","能量","kJ"],["energyKcal","能量","kcal"],["proteinG","蛋白质","g"],["fatG","脂肪","g"],["saturatedFatG","饱和脂肪","g"],["transFatG","反式脂肪","g"],["carbohydrateG","碳水化合物","g"],["sodiumMg","钠","mg"],["totalSugarG","总糖","g"],["addedSugarG","添加糖","g"],["fiberG","膳食纤维","g"]];
const blocked=new Set(["conflict","basis_conflict","basis_unverified","uncertain"]);
const color="#168F86";
export default function NutritionRecognitionScreen(props:Props){
  const[size,setSize]=useState<{width:number;height:number}|null>(null),[selected,setSelected]=useState<string|null>(null),[error,setError]=useState(false);
  useEffect(()=>{let active=true;Image.getSize(props.photo,(width,height)=>{if(active)setSize({width,height})},()=>{if(active)setError(true)});return()=>{active=false}},[props.photo]);
  if(selected)return <NutritionResult {...props} photo={selected}/>;
  if(error)return <View><Text>照片无法读取，请重新拍摄。</Text><Pressable onPress={props.back}><Text>重新拍摄</Text></Pressable></View>;
  if(!size)return <ActivityIndicator/>;
  return <ImageCropper image={{uri:props.photo,...size}} onCancel={props.back} onDone={async image=>{
    let originalUri=props.photo;try{originalUri=JSON.parse(props.scanMeta??"{}").originalUri||props.photo}catch{/* Metadata is optional; keep a readable original. */}
    await saveScanDebug({originalUri,stableUri:image.uri,resolution:`${image.width}×${image.height}`,orientation:"1"});setSelected(image.uri);
  }}/>;
}
function NutritionResult({photo,barcode,back,onCreate}:Props){
  const[result,setResult]=useState<Recognition|null>(null),[working,setWorking]=useState(true),[status,setStatus]=useState("正在识别…"),[failure,setFailure]=useState(false);
  const[choice,setChoice]=useState<"local"|"vision"|null>(null),[edits,setEdits]=useState<Partial<Record<keyof Nutrients,string>>>({}),[basisEdit,setBasisEdit]=useState<{amount:string;unit:string}|null>(null);
  useEffect(()=>{let cancelled=false;
    recognizeNutrition(photo,text=>{if(!cancelled)setStatus(text)},()=>cancelled).then(value=>{if(!cancelled)setResult(value)}).catch(async error=>{await logScanError("nutrition_result",error);if(!cancelled)setFailure(true)}).finally(()=>{if(!cancelled)setWorking(false)});
    return()=>{cancelled=true};
  },[photo]);
  const merged=useMemo(()=>!result?null:choice==="local"?mergeRecognitionResults(result.parsed):choice==="vision"?mergeRecognitionResults(parseNutritionLabel(""),result.vision):result.merged,[result,choice]);
  const selectBasis=(next:"local"|"vision")=>{setChoice(next);setEdits({});setBasisEdit(null)};
  const basis=basisEdit??{amount:merged?.basisAmount==null?"":String(merged.basisAmount),unit:merged?.basisUnit??""};
  const confirm=()=>{
    if(!result||!merged)return;
    if(merged.basisConflict){Alert.alert("请先确认计量基准","两次识别的基准不同，请按照片选择一整组结果。无需在两组之间混合数值。");return}
    if(!Number.isFinite(Number(basis.amount))||Number(basis.amount)<=0||!["g","mL","份","包装"].includes(basis.unit)){Alert.alert("请填写计量基准","例如每100 mL。包装没有写清时请重新拍摄，不会自动补成100g。");return}
    const unresolved=fields.filter(([key])=>blocked.has(merged.fields[key].status)&&edits[key]===undefined);
    if(unresolved.length){Alert.alert("部分数值需要确认","请对照照片选择本地/联网候选，或手动填写；留空表示未知。");return}
    const draft:Record<string,string>={basisAmount:basis.amount,basisUnit:basis.unit,name:choice==="local"?"":result.vision?.product_name??""};
    for(const[key]of fields){const value=edits[key]??(merged.nutrients[key]==null?"":String(merged.nutrients[key]));
      if(value.trim()&&(!/^\d+(?:\.\d+)?$/.test(value)||!Number.isFinite(Number(value)))){Alert.alert("请核对数字","营养值只能填写非负数字，未知请留空。");return}draft[key]=value;
    }
    void logScanEvent("USER_CONFIRMED",{draft,source:choice??"merged"});
    const source=choice==="local"||!result.vision?"local_ocr":choice==="vision"||!result.ocr?.text?"online_vision":"mixed";
    onCreate({photo,barcode,source,rawText:source==="online_vision"?result.vision?.raw_text??"":result.ocr?.text??"",draft});
  };
  const button=(label:string,action:()=>void)=><Pressable onPress={action} style={{padding:10}}><Text style={{color,fontWeight:"700"}}>{label}</Text></Pressable>;
  return <ScrollView contentContainerStyle={{padding:20,paddingBottom:48,gap:12,backgroundColor:"#F2FAF8"}}>
    {button("返回 / 重新拍摄",back)}<Image source={{uri:photo}} resizeMode="contain" style={{height:250,width:"100%"}}/>
    <Text style={{fontSize:20,fontWeight:"700"}}>营养成分 · 请对照照片确认</Text>
    {working?<><ActivityIndicator/><Text>{status}</Text></>:<>
      {(failure||result?.needsReview)&&<Text>{failure?"识别没有完成，请重新拍摄。":"部分内容没有识别清楚。你可以重新拍摄，或手动修改后确认。"}</Text>}
      {!!result?.visionReason&&<Text>{visionSkipMessage(result.visionReason)}</Text>}
      {result?.merged.basisConflict&&<View><Text>计量基准冲突，请选择与照片相符的一组（可重新选择）：</Text>{button(`本地：每${result?.parsed.basisAmount}${result?.parsed.basisUnit}`,()=>selectBasis("local"))}{button(`联网：每${result?.vision?.basis?.amount}${result?.vision?.basis?.unit}`,()=>selectBasis("vision"))}</View>}
      {merged&&<>
        <Text>计量基准（必须与照片一致）</Text><View style={{flexDirection:"row",gap:12}}>
          <TextInput accessibilityLabel="每份基准数量" placeholder="如100" keyboardType="decimal-pad" value={basis.amount} onChangeText={amount=>setBasisEdit({...basis,amount})} style={{flex:1,padding:10,backgroundColor:"white"}}/>
          <TextInput accessibilityLabel="每份基准单位" placeholder="g / mL / 份 / 包装" value={basis.unit} onChangeText={unit=>setBasisEdit({...basis,unit})} style={{flex:1,padding:10,backgroundColor:"white"}}/>
        </View>
        {fields.map(([key,label,unit])=>{const field=merged.fields[key],value=edits[key]??(field.value==null?"":String(field.value));return <View key={key} style={{gap:4,paddingVertical:5}}>
          <Text>{label} ({unit}){field.status==="agreed"?" · 两次识别一致":field.status==="vision_only"?" · 联网候选":blocked.has(field.status)?" · 需要确认":""}</Text>
          <TextInput accessibilityLabel={`${label} ${unit}`} placeholder="未记录" editable={!merged.basisConflict} keyboardType="decimal-pad" value={value} onChangeText={text=>setEdits(current=>({...current,[key]:text}))} style={{padding:10,backgroundColor:"white",borderWidth:blocked.has(field.status)&&edits[key]===undefined?1:0,borderColor:"#C68B36"}}/>
          {blocked.has(field.status)&&!merged.basisConflict&&<View style={{flexDirection:"row",flexWrap:"wrap"}}>
            {field.local!=null&&button(`本地 ${field.local}`,()=>setEdits(x=>({...x,[key]:String(field.local)})))}
            {field.vision!=null&&button(`联网 ${field.vision}`,()=>setEdits(x=>({...x,[key]:String(field.vision)})))}
            {button("留空",()=>setEdits(x=>({...x,[key]:""})))}
          </View>}
        </View>})}
        <Text>没有明确标注的添加糖不会推算。缺失项保持空白。</Text>
        {button("核对后继续",confirm)}
      </>}
    </>}
  </ScrollView>;
}
