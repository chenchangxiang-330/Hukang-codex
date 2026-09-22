import React,{useEffect,useMemo,useState}from"react";
import{ActivityIndicator,Alert,Image,Pressable,ScrollView,StyleSheet,Text,TextInput,View}from"react-native";
import NetInfo from"@react-native-community/netinfo";
import{inspectImage}from"./ocr";
import{recognizeText}from"./ocr";
import{FoodImageType,isLocalResultComplete,expiryFromText,findSugarKeywords,nutritionCompleteness,parseDates,parseIngredients,parseNutritionLabel}from"./parser";
import{getVisionConfig,OpenAICompatibleFoodVisionProvider,StructuredResult}from"./vision";
import{loadScannerPreferences,saveScannerPreferences}from"./preferences";
import{countScanMetric,logScanError,logScanEvent,saveScanDebug}from"./scanMetrics";
import{nutrientFields}from"./types";

type CreateArgs={photo:string;barcode?:string;source:"local_ocr"|"online_vision"|"mixed";rawText:string;draft:Record<string,string>};
type RequestedMode="nutrition"|"ingredients"|"date";
type Props={photo:string;barcode?:string;scanMeta?:string;requestedMode:RequestedMode;back:()=>void;onCreate:(value:CreateArgs)=>void;onDate:(expiry?:string)=>void};
const teal="#168F86",deep="#163F3C",muted="#66817F";
const show=(v:number|null,u="")=>v==null?"未记录":`${Math.round(v*10)/10} ${u}`;

function onlineText(result:StructuredResult){
  if(result.detected_type==="nutrition_label"&&result.nutrition){const n=result.nutrition,b=result.basis;return`${result.raw_text||""}\n每${b?.amount??100}${b?.unit??"g"}\n能量 ${n.energy_kj??""} kJ\n能量 ${n.energy_kcal??""} kcal\n蛋白质 ${n.protein_g??""} g\n脂肪 ${n.fat_g??""} g\n碳水化合物 ${n.carbohydrate_g??""} g\n总糖 ${n.total_sugar_g??""} g\n添加糖 ${n.added_sugar_g??""} g\n膳食纤维 ${n.fiber_g??""} g\n钠 ${n.sodium_mg??""} mg`}
  if(result.detected_type==="ingredients")return`配料：${result.ingredients?.join("、")||result.raw_text}`;
  if(result.detected_type==="expiry")return result.dates?.join(" ")||result.raw_text;
  return result.raw_text;
}

async function requestConsent(){
  const current=await loadScannerPreferences();if(current.onlineConsentAsked)return current.onlineEnhancement;
  return new Promise<boolean>(resolve=>Alert.alert("联网增强识别","为了提高食品标签识别准确率，护康可以在本地识别不足时使用联网增强识别。届时仅上传当前食品标签图片用于识别。",[{text:"暂不开启",style:"cancel",onPress:async()=>{await saveScannerPreferences({...current,onlineConsentAsked:true,onlineEnhancement:false});resolve(false)}},{text:"允许",onPress:async()=>{await saveScannerPreferences({...current,onlineConsentAsked:true,onlineEnhancement:true});resolve(true)}}],{cancelable:false}));
}

export default function RecognitionScreen({photo,barcode,requestedMode,back,onCreate,onDate}:Props){
  const requestedType:FoodImageType=requestedMode==="nutrition"?"nutrition_label":requestedMode==="date"?"expiry":"ingredients";
  const[text,setText]=useState(""),[type,setType]=useState<FoodImageType>(requestedType),[status,setStatus]=useState("正在查看照片…"),[failure,setFailure]=useState(""),[working,setWorking]=useState(true),[editing,setEditing]=useState(false),[enhanced,setEnhanced]=useState(false),[productName,setProductName]=useState("");
  const analyzeOnline=async(localText:string)=>{
    const net=await NetInfo.fetch();await logScanEvent("NETWORK_STATUS",{connected:net.isConnected});
    if(net.isConnected===false)return false;
    const allowed=await requestConsent();if(!allowed)return false;
    const config=await getVisionConfig();
    if(!config.apiKey){await logScanEvent("VISION_NOT_CONFIGURED",{mode:requestedMode});Alert.alert("联网识别未配置","联网图像识别尚未配置，将保留本地识别结果。");return false}
    setStatus("正在进一步识别…");
    try{
      const provider=new OpenAICompatibleFoodVisionProvider(config),result=requestedMode==="nutrition"?await provider.analyzeNutrition(photo):requestedMode==="ingredients"?await provider.analyzeIngredients(photo):await provider.analyzeExpiry(photo),nextText=onlineText(result);
      setText(nextText||localText);setType(requestedType);setProductName(result.product_name||"");
      setEnhanced(true);
      await countScanMetric("visionSuccess");
      await logScanEvent("RESULT_STATE_UPDATED",{stage:"vision_result",mode:requestedMode,textLength:(nextText||localText).length});
      await saveScanDebug({provider:"online",rawText:nextText,detectedType:requestedType,parse:result,network:"connected",error:""});
      return true;
    }catch(error){
      await logScanEvent("VISION_REQUEST_FAILED",{error:String(error)});
      await logScanError("label_vision",error);
      await saveScanDebug({provider:"online",network:"connected",error:String(error)});
      Alert.alert("联网识别失败","本地识别结果会保留，请检查网络或稍后重试。");
      return false;
    }
  };
  useEffect(()=>{let cancelled=false;(async()=>{await logScanEvent("RESULT_SCREEN_RENDERED",{mode:requestedMode,photo});await new Promise(r=>setTimeout(r,260));try{setStatus("正在检查照片…");const quality=await inspectImage(photo);await saveScanDebug({quality});if(cancelled)return;if(quality.tooDark){setFailure("光线有点暗，换个亮一点的位置。");return}if(quality.tooBright){setFailure("照片有些过亮，降低光线再拍。");return}if(quality.hasGlare){setFailure("包装反光较强，换个角度试试。");return}if(quality.tooBlurry){setFailure("照片有点糊，再靠近一点。");return}if(quality.tooSmall){setFailure("包装文字太小，再靠近一点。");return}await countScanMetric("photoValid");setStatus(requestedMode==="nutrition"?"正在读取营养成分表…":requestedMode==="ingredients"?"正在读取配料文字…":"正在读取包装日期…");await logScanEvent("OCR_INPUT_READY",{mode:requestedMode,uri:photo});await logScanEvent("OCR_STARTED",{mode:requestedMode});let raw="";try{raw=await recognizeText(photo)}catch(error){await logScanEvent("OCR_CALL_FAILED",{error:String(error)});await logScanError("label_ocr",error)}if(cancelled)return;await logScanEvent("OCR_TEXT_LENGTH",{value:raw.length});if(raw.trim())await countScanMetric("ocrText");else await logScanEvent("OCR_NO_TEXT",{mode:requestedMode});setText(raw);setType(requestedType);await logScanEvent("RESULT_STATE_UPDATED",{stage:"local_ocr",mode:requestedMode,textLength:raw.length});const complete=isLocalResultComplete(requestedType,raw);if(requestedType==="nutrition_label"&&complete)await countScanMetric("nutritionParsed");await saveScanDebug({rawText:raw,detectedType:requestedType,parse:requestedType==="nutrition_label"?nutritionCompleteness(parseNutritionLabel(raw)):{complete},provider:"local",error:raw?"":"OCR_NO_TEXT"});if(!complete){const upgraded=await analyzeOnline(raw);if(!upgraded)setFailure(raw?(requestedMode==="nutrition"?"看到了文字，但营养信息不完整，你可以修改后确认。":requestedMode==="ingredients"?"没有完整读出配料文字，你可以修改后确认。":"没有找到清晰的日期，你可以修改后确认。"):(requestedMode==="nutrition"?"没有看清营养成分表，请重新拍摄。":requestedMode==="ingredients"?"没有看清配料文字，请靠近一点重新拍。":"没有找到清晰的日期。"))}else setStatus("认出来啦")}catch(error){setFailure(requestedMode==="nutrition"?"没有看清营养成分表，请重新拍摄。":requestedMode==="ingredients"?"没有看清配料文字，请靠近一点重新拍。":"没有找到清晰的日期。");await logScanError("label_recognition",error);await saveScanDebug({error:String(error)})}finally{if(!cancelled){setWorking(false);await logScanEvent("RESULT_SCREEN_RENDERED",{mode:`${requestedMode}_result`})}}})();return()=>{cancelled=true}},[photo]);
  const parsed=useMemo(()=>parseNutritionLabel(text),[text]),dates=useMemo(()=>parseDates(text),[text]),ingredients=useMemo(()=>parseIngredients(text),[text]),keys=useMemo(()=>findSugarKeywords(text),[text]),complete=isLocalResultComplete(type,text);
  const confirm=()=>{if(type==="expiry"){onDate(expiryFromText(text)||dates.at(-1));return}const n=parsed.nutrients;onCreate({photo,barcode,source:enhanced?"mixed":"local_ocr",rawText:text,draft:type==="nutrition_label"?{name:productName,basisAmount:String(parsed.basisAmount),basisUnit:parsed.basisUnit,energyKcal:n.energyKcal==null?"":String(n.energyKcal),energyKj:n.energyKj==null?"":String(n.energyKj),proteinG:n.proteinG==null?"":String(n.proteinG),fatG:n.fatG==null?"":String(n.fatG),carbohydrateG:n.carbohydrateG==null?"":String(n.carbohydrateG),totalSugarG:n.totalSugarG==null?"":String(n.totalSugarG),addedSugarG:n.addedSugarG==null?"":String(n.addedSugarG),fiberG:n.fiberG==null?"":String(n.fiberG),sodiumMg:n.sodiumMg==null?"":String(n.sodiumMg)}:{name:productName,ingredients:text}})};
  const title=type==="nutrition_label"?"营养成分":type==="ingredients"?"配料信息":type==="expiry"?"包装日期":"包装文字";
  return <ScrollView contentContainerStyle={r.page}><View style={r.header}><Pressable onPress={back} style={r.back}><Text style={r.backText}>‹</Text></Pressable><Text style={r.headerTitle}>识别结果</Text><View style={{width:40}}/></View><Image source={{uri:photo}} style={r.photo} resizeMode="contain"/><Text style={r.previewHint}>{working?status:"刚才拍到的照片"}</Text>{working&&<ActivityIndicator color={teal}/>} {!!failure&&<View style={r.warning}><View style={r.mascot}><Text style={r.face}>•  •{`\n`}⌣</Text></View><Text style={r.warningText}>{failure}</Text></View>}{!working&&<View style={r.result}><Text style={r.resultTitle}>{title}</Text>{type==="nutrition_label"&&<><Text style={r.basis}>每 {parsed.basisAmount} {parsed.basisUnit}</Text>{nutrientFields.map(item=><View key={item.key} style={r.row}><Text style={r.label}>{item.label}</Text><Text style={r.value}>{show(parsed.nutrients[item.key],item.unit)}</Text></View>)}<View style={r.row}><Text style={r.label}>总糖</Text><Text style={r.value}>{show(parsed.nutrients.totalSugarG,"g")}</Text></View><Text style={r.note}>包装未明确提供添加糖时显示“未记录”。</Text></>}{type==="ingredients"&&<><Text style={r.body}>{ingredients.join("、")||"没有识别到配料内容"}</Text>{keys.length>0&&<Text style={r.sugar}>配料中含添加糖来源：{keys.join("、")}</Text>}</>}{type==="expiry"&&<Text style={r.body}>{dates.length?dates.join("、"):"没有识别到有效日期"}</Text>}{type==="general_packaging"&&<Text style={r.body}>{text||"没有识别到包装文字"}</Text>}{editing&&<TextInput value={text} onChangeText={setText} multiline style={r.editor} placeholder="输入包装上的文字"/>}<Pressable style={r.confirm} onPress={confirm}><Text style={r.confirmText}>确认</Text></Pressable><Pressable onPress={()=>setEditing(v=>!v)}><Text style={r.secondary}>{editing?"完成修改":"信息不对？"}</Text></Pressable><Pressable onPress={back}><Text style={r.secondary}>重新拍摄</Text></Pressable>{!complete&&!editing&&<Pressable onPress={()=>setEditing(true)}><Text style={r.secondary}>手动填写</Text></Pressable>}</View>}</ScrollView>;
}

const r=StyleSheet.create({page:{padding:20,paddingBottom:44,gap:13,backgroundColor:"#F2FAF8",minHeight:"100%"},header:{flexDirection:"row",alignItems:"center",justifyContent:"space-between"},back:{width:40,height:40,borderRadius:20,backgroundColor:"white",alignItems:"center",justifyContent:"center"},backText:{fontSize:28,color:deep,marginTop:-3},headerTitle:{fontSize:20,fontWeight:"900",color:deep},photo:{width:"100%",height:270,borderRadius:24,backgroundColor:"#DDEAE7"},previewHint:{textAlign:"center",fontSize:13,color:muted},warning:{flexDirection:"row",alignItems:"center",gap:12,padding:14,borderRadius:18,backgroundColor:"#FFF3DF"},warningText:{flex:1,color:deep,lineHeight:20},mascot:{width:44,height:44,borderRadius:22,backgroundColor:"#D7F0D1",alignItems:"center",justifyContent:"center"},face:{textAlign:"center",color:teal,fontWeight:"900",lineHeight:13},result:{backgroundColor:"white",borderRadius:24,padding:19,gap:10},resultTitle:{fontSize:22,fontWeight:"900",color:deep},basis:{fontSize:13,color:muted,marginBottom:4},row:{flexDirection:"row",justifyContent:"space-between",paddingVertical:8,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:"#D9E8E5"},label:{color:deep},value:{fontWeight:"800",color:deep},note:{fontSize:12,color:muted,lineHeight:18},body:{color:deep,fontSize:15,lineHeight:24},sugar:{fontSize:13,color:"#875D15",backgroundColor:"#FFF3D6",padding:10,borderRadius:12},editor:{height:145,borderWidth:1,borderColor:"#BFDAD5",borderRadius:15,padding:12,textAlignVertical:"top",color:deep},confirm:{minHeight:50,borderRadius:16,backgroundColor:teal,alignItems:"center",justifyContent:"center",marginTop:5},confirmText:{color:"white",fontWeight:"900"},secondary:{textAlign:"center",color:teal,fontWeight:"700",padding:5}});
