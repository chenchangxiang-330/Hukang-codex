import React,{useEffect,useMemo,useState}from"react";
import{ActivityIndicator,Alert,Image,Pressable,ScrollView,Text,TextInput,View}from"react-native";
import ImageCropper from"./ImageCropper";
import{recognizeNutrition}from"./nutritionRecognition";
import{mergeRecognitionResults}from"./recognitionMerge";
import{preserveLocalOcrConflicts}from"./localOcrEvidence";
import{parseNutritionLabel}from"./parser";
import{logScanEvent,logScanError,saveScanDebug}from"./scanMetrics";
import{visionSkipMessage}from"./textRecognitionEvidence";
import type{Nutrients}from"./types";
import{nutritionSaveEvidence}from"./recognitionSaveEvidence";
type CreateArgs={photo:string;barcode?:string;source:"local_ocr"|"online_vision"|"mixed";rawText:string;recognitionEvidenceJson:string;draft:Record<string,string>};
type Props={photo:string;originalPhoto?:string;barcode?:string;scanMeta?:string;back:()=>void;onCreate:(value:CreateArgs)=>void};
type Recognition=Awaited<ReturnType<typeof recognizeNutrition>>;
const fields:[keyof Nutrients,string,string][]=[["energyKj","能量","kJ"],["energyKcal","能量","kcal"],["proteinG","蛋白质","g"],["fatG","脂肪","g"],["saturatedFatG","饱和脂肪","g"],["transFatG","反式脂肪","g"],["carbohydrateG","碳水化合物","g"],["sodiumMg","钠","mg"],["totalSugarG","总糖","g"],["addedSugarG","添加糖","g"],["fiberG","膳食纤维","g"]];
const blocked=new Set(["conflict","basis_conflict","basis_unverified","uncertain"]);
const color="#168F86";
export default function NutritionRecognitionScreen(props:Props){
  const[size,setSize]=useState<{width:number;height:number}|null>(null),[selected,setSelected]=useState<string|null>(null),[error,setError]=useState(false);
  useEffect(()=>{let active=true;Image.getSize(props.photo,(width,height)=>{if(active)setSize({width,height})},()=>{if(active)setError(true)});return()=>{active=false}},[props.photo]);
  let originalPhoto=props.photo;try{const meta=JSON.parse(props.scanMeta??"{}");if(Number(meta.orientation)===1)originalPhoto=meta.originalUri||props.photo}catch{/* use the already-upright uncropped image for EXIF/mirrored cases */}
  if(selected)return <NutritionResult {...props} photo={selected} originalPhoto={originalPhoto}/>;
  if(error)return <View><Text>照片无法读取，请重新拍摄。</Text><Pressable onPress={props.back}><Text>重新拍摄</Text></Pressable></View>;
  if(!size)return <ActivityIndicator/>;
  return <ImageCropper image={{uri:props.photo,...size}} onCancel={props.back} onDone={async image=>{
    let originalUri=props.photo;try{originalUri=JSON.parse(props.scanMeta??"{}").originalUri||props.photo}catch{/* Metadata is optional; keep a readable original. */}
    await saveScanDebug({originalUri,stableUri:image.uri,resolution:`${image.width}×${image.height}`,orientation:"1"});setSelected(image.uri);
  }}/>;
}
function NutritionResult({photo,originalPhoto,barcode,back,onCreate}:Props){
  const[result,setResult]=useState<Recognition|null>(null),[working,setWorking]=useState(true),[status,setStatus]=useState("正在识别…"),[failure,setFailure]=useState(false);
  const[choice,setChoice]=useState<"local"|"vision"|null>(null),[edits,setEdits]=useState<Partial<Record<keyof Nutrients,string>>>({}),[basisEdit,setBasisEdit]=useState<{amount:string;unit:string}|null>(null);
  const[localChoice,setLocalChoice]=useState<"primary"|"original"|null>(null);
  useEffect(()=>{let cancelled=false;
    recognizeNutrition(photo,text=>{if(!cancelled)setStatus(text)},()=>cancelled,{originalPhoto}).then(value=>{if(!cancelled)setResult(value)}).catch(async error=>{await logScanError("nutrition_result",error);if(!cancelled)setFailure(true)}).finally(()=>{if(!cancelled)setWorking(false)});
    return()=>{cancelled=true};
  },[photo,originalPhoto]);
  const selectedParsed=!result?null:localChoice==="primary"?result.primaryParsed:localChoice==="original"?result.originalParsed:result.parsed;
  const merged=useMemo(()=>{
    if(!result||!selectedParsed)return null;
    const value=choice==="local"?mergeRecognitionResults(selectedParsed):choice==="vision"?mergeRecognitionResults(parseNutritionLabel(""),result.vision):localChoice?mergeRecognitionResults(selectedParsed,result.vision):result.merged;
    return !localChoice&&choice!=="vision"?preserveLocalOcrConflicts(value,result.localEvidence):value;
  },[result,choice,selectedParsed,localChoice]);
  const selectBasis=(next:"local"|"vision")=>{setChoice(next);setEdits({});setBasisEdit(null)};
  const basis=basisEdit??{amount:merged?.basisAmount==null?"":String(merged.basisAmount),unit:merged?.basisUnit??""};
  const confirm=()=>{
    if(!result||!merged)return;
    if(result.localEvidence.basisConflict&&!localChoice&&choice!=="vision"){Alert.alert("原图与裁剪图基准不一致","请先选择照片上对应的完整本地结果，不会混合不同基准的数字。");return}
    if(merged.basisConflict){Alert.alert("请先确认计量基准","两次识别的基准不同，请按照片选择一整组结果。无需在两组之间混合数值。");return}
    if(!Number.isFinite(Number(basis.amount))||Number(basis.amount)<=0||!["g","mL","份","包装"].includes(basis.unit)){Alert.alert("请填写计量基准","例如每100 mL。包装没有写清时请重新拍摄，不会自动补成100g。");return}
    const unresolved=fields.filter(([key])=>blocked.has(merged.fields[key].status)&&edits[key]===undefined);
    if(unresolved.length){Alert.alert("部分数值需要确认","请对照照片选择本地/联网候选，或手动填写；留空表示未知。");return}
    const draft:Record<string,string>={basisAmount:basis.amount,basisUnit:basis.unit,name:choice==="local"?"":result.vision?.product_name??""};
    for(const[key]of fields){const value=edits[key]??(merged.nutrients[key]==null?"":String(merged.nutrients[key]));
      if(value.trim()&&(!/^\d+(?:\.\d+)?$/.test(value)||!Number.isFinite(Number(value)))){Alert.alert("请核对数字","营养值只能填写非负数字，未知请留空。");return}draft[key]=value;
    }
    const source=choice==="local"||!result.vision?"local_ocr":choice==="vision"||!result.ocr?.text?"online_vision":"mixed";
    const finish=()=>{void logScanEvent("USER_CONFIRMED",{draft,source:choice??"merged",localChoice});onCreate({photo,barcode,source,...nutritionSaveEvidence({primary:result.ocr,original:result.originalOcr,vision:result.vision,choice,localChoice}),draft})};
    if(result.needsReview)Alert.alert("请逐项对照照片","小数点可能丢失。原图补充也只是候选，不能当作第二个独立引擎验证。读不清的项目请留空，不要直接确认。",[{text:"继续核对",style:"cancel"},{text:"已逐项核对",onPress:finish}]);else finish();
  };
  const button=(label:string,action:()=>void)=><Pressable onPress={action} style={{padding:10}}><Text style={{color,fontWeight:"700"}}>{label}</Text></Pressable>;
  return <ScrollView contentContainerStyle={{padding:20,paddingBottom:48,gap:12,backgroundColor:"#F2FAF8"}}>
    {button("返回 / 重新拍摄",back)}<Image source={{uri:photo}} resizeMode="contain" style={{height:250,width:"100%"}}/>
    <Text style={{fontSize:20,fontWeight:"700"}}>营养成分 · 请对照照片确认</Text>
    {working?<><ActivityIndicator/><Text>{status}</Text></>:<>
      {(failure||result?.needsReview)&&<Text>{failure?"识别没有完成，请重新拍摄。":"部分内容没有识别清楚。你可以重新拍摄，或手动修改后确认。"}</Text>}
      {!!result?.visionReason&&<Text>{visionSkipMessage(result.visionReason)}</Text>}
      {result?.localEvidence.basisConflict&&<View><Text>原图与裁剪图的计量基准不同或不完整，请明确选择整组：</Text>
        {button(`裁剪：每${result.primaryParsed.basisAmount??"?"}${result.primaryParsed.basisUnit??"?"}`,()=>{setLocalChoice("primary");setChoice(null);setEdits({});setBasisEdit(null)})}
        {result.originalParsed&&button(`原图：每${result.originalParsed.basisAmount??"?"}${result.originalParsed.basisUnit??"?"}`,()=>{setLocalChoice("original");setChoice(null);setEdits({});setBasisEdit(null)})}
        {result.vision?.basis&&button(`联网：每${result.vision.basis.amount}${result.vision.basis.unit}`,()=>{setLocalChoice(null);selectBasis("vision")})}
      </View>}
      {merged?.basisConflict&&<View><Text>计量基准冲突，请选择与照片相符的一组（可重新选择）：</Text>{button(`本地：每${selectedParsed?.basisAmount}${selectedParsed?.basisUnit}`,()=>selectBasis("local"))}{button(`联网：每${result?.vision?.basis?.amount}${result?.vision?.basis?.unit}`,()=>selectBasis("vision"))}</View>}
      {merged&&<>
        <Text>计量基准（必须与照片一致）</Text><View style={{flexDirection:"row",gap:12}}>
          <TextInput accessibilityLabel="每份基准数量" placeholder="如100" keyboardType="decimal-pad" value={basis.amount} onChangeText={amount=>setBasisEdit({...basis,amount})} style={{flex:1,padding:10,backgroundColor:"white"}}/>
          <TextInput accessibilityLabel="每份基准单位" placeholder="g / mL / 份 / 包装" value={basis.unit} onChangeText={unit=>setBasisEdit({...basis,unit})} style={{flex:1,padding:10,backgroundColor:"white"}}/>
        </View>
        {fields.map(([key,label,unit])=>{const field=merged.fields[key],value=edits[key]??(field.value==null?"":String(field.value));return <View key={key} style={{gap:4,paddingVertical:5}}>
          <Text>{label} ({unit}){field.status==="agreed"?" · 本地与联网一致":field.status==="vision_only"?" · 联网候选":blocked.has(field.status)?" · 需要确认":!localChoice&&result?.localEvidence.fields[key].status==="original_only"?" · 原图补充候选":""}</Text>
          {selectedParsed?.quality.issues.includes(`NRV_INCONSISTENT:${key}`)&&<Text>数值与表内 NRV% 不一致，可能读错了小数点。请对照照片；不会用 NRV 反推数值。</Text>}
          <TextInput accessibilityLabel={`${label} ${unit}`} placeholder="未记录" editable={!merged.basisConflict} keyboardType="decimal-pad" value={value} onChangeText={text=>setEdits(current=>({...current,[key]:text}))} style={{padding:10,backgroundColor:"white",borderWidth:blocked.has(field.status)&&edits[key]===undefined?1:0,borderColor:"#C68B36"}}/>
          {blocked.has(field.status)&&!merged.basisConflict&&<View style={{flexDirection:"row",flexWrap:"wrap"}}>
            {field.local!=null&&button(`本地 ${field.local}`,()=>setEdits(x=>({...x,[key]:String(field.local)})))}
            {!localChoice&&result?.localEvidence.fields[key].primary!=null&&button(`裁剪 ${result.localEvidence.fields[key].primary}`,()=>setEdits(x=>({...x,[key]:String(result.localEvidence.fields[key].primary)})))}
            {!localChoice&&result?.localEvidence.fields[key].original!=null&&button(`原图 ${result.localEvidence.fields[key].original}`,()=>setEdits(x=>({...x,[key]:String(result.localEvidence.fields[key].original)})))}
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
