import React,{useEffect,useState}from"react";
import{ActivityIndicator,Alert,Image,Pressable,ScrollView,StyleSheet,Text,View}from"react-native";
import{inspectImage,recognizeDetailed}from"./ocr";
import{runVisionFallback}from"./visionFallback";
import{productLookupMessage}from"./productOnlineLogic";
import{getVisionConfig,type StructuredResult}from"./vision";
import{loadScannerPreferences,saveScannerPreferences}from"./preferences";
import{ProductCandidate,ProductSearchInput,searchProducts}from"./productSearch";
import{mergeProductClues,resolveProductClues,type ProductClues,type ProductClueConflict,type ProductClueChoices}from"./productClueEvidence";
import{countScanMetric,loadScanDebug,logScanError,logScanEvent,saveScanDebug}from"./scanMetrics";

type Props={photo:string;barcode?:string;back:()=>void;onCandidate:(candidate:ProductCandidate)=>void;onContinue:(mode:"nutrition"|"ingredients")=>void;onManual:(draft:Record<string,string>)=>void};
type Clues=ProductClues;
const teal="#168F86",deep="#163F3C",muted="#66817F";
function localClues(text:string,barcode?:string):Clues{const lines=text.split(/\n+/).map(x=>x.trim()).filter(x=>x.length>=2&&!/^(净含量|配料|营养成分|生产日期|保质期)/.test(x)),quantity=text.match(/\b\d+(?:\.\d+)?\s*(?:mL|ml|L|克|kg|g)\b/i)?.[0]||"",visible=lines.filter(x=>!/^\d+$/.test(x)).slice(0,8),foundBarcode=barcode||"";return{brand:visible[0]||"",productName:visible[1]||visible[0]||"",variant:visible[2]||"",quantity,category:"",keywords:visible,barcode:foundBarcode}}
async function consent(){const p=await loadScannerPreferences();if(p.onlineConsentAsked)return p.onlineEnhancement;return new Promise<boolean>(resolve=>Alert.alert("联网识别商品","为了识别商品包装，护康可以将当前食品照片发送到你配置的联网识别服务进行分析。",[{text:"暂不开启",style:"cancel",onPress:()=>{saveScannerPreferences({...p,onlineConsentAsked:true,onlineEnhancement:false}).then(()=>resolve(false),()=>resolve(false))}},{text:"允许",onPress:()=>{saveScannerPreferences({...p,onlineConsentAsked:true,onlineEnhancement:true}).then(()=>resolve(true),()=>resolve(false))}}],{cancelable:false}))}
export default function ProductRecognitionScreen({photo,barcode,back,onCandidate,onContinue,onManual}:Props){const[status,setStatus]=useState("正在检查照片…"),[failure,setFailureState]=useState(""),[clues,setClues]=useState<Clues>({brand:"",productName:"",variant:"",quantity:"",category:"",keywords:[],barcode:barcode||""}),[candidates,setCandidates]=useState<ProductCandidate[]>([]),[working,setWorking]=useState(true),[searched,setSearched]=useState(false),[searchNotice,setSearchNotice]=useState("");
 const[conflicts,setConflicts]=useState<ProductClueConflict[]>([]),[choices,setChoices]=useState<ProductClueChoices>({});
 const setFailure=(message:string)=>setFailureState(message);
 useEffect(()=>{
  let cancelled=false;
  setWorking(true);setSearched(false);setCandidates([]);setConflicts([]);setChoices({});setSearchNotice("");setFailure("");
  (async()=>{
   const warnings:string[]=[];
   await logScanEvent("RESULT_SCREEN_RENDERED",{mode:"product",photo});
   try{
    try{
     const quality=await inspectImage(photo);await saveScanDebug({quality});
     if(quality.tooDark||quality.tooBright||quality.hasGlare||quality.tooBlurry||quality.tooSmall){warnings.push("部分内容可能没有识别清楚，请对照照片确认。");await logScanEvent("IMAGE_QUALITY_ADVISORY",{mode:"product",quality})}
    }catch(error){await logScanEvent("IMAGE_QUALITY_UNAVAILABLE",{mode:"product"});await logScanError("product_image_inspection",error)}
    await countScanMetric("photoValid");setStatus("正在读取包装文字…");
    await logScanEvent("OCR_INPUT_READY",{mode:"product",uri:photo});
    let raw="";try{raw=(await recognizeDetailed(photo)).text}catch(error){warnings.push("本地文字识别失败，将继续尝试商品查询。");await logScanEvent("OCR_CALL_FAILED",{mode:"product",error:String(error)});await logScanError("product_ocr",error)}
    if(raw.trim())await countScanMetric("ocrText");
    const local=localClues(raw,barcode);
    let merged=local,visionResult:StructuredResult|undefined,pendingConflicts:ProductClueConflict[]=[];
    if(cancelled)return;
    // Preserve the explicit photo-sharing permission gate. The shared fallback
    // verifies configuration, consent and connectivity again before sending.
    if(!barcode){
     const config=await getVisionConfig();
     if(!config.apiKey?.trim()){
      await logScanEvent("VISION_NOT_CONFIGURED");await logScanEvent("VISION_NOT_SENT",{reason:"VISION_NOT_CONFIGURED"});
      await saveScanDebug({vision:{status:"not_sent",reason:"VISION_NOT_CONFIGURED"}});
      warnings.push("联网图片识别尚未配置；本地文字与公开商品库查询仍会继续。");
     }else if(await consent()){
      if(cancelled)return;
      setStatus("正在识别商品包装…");
      visionResult=await runVisionFallback(photo,"product_packaging",true,raw.trim()?"PRODUCT_IDENTITY_NEEDS_CONFIRMATION":"OCR_NO_TEXT",()=>cancelled)??undefined;
      if(visionResult){
       const evidence=mergeProductClues(local,visionResult);merged=evidence.clues;pendingConflicts=evidence.conflicts;await countScanMetric("visionSuccess");
       if(pendingConflicts.length||visionResult.uncertain_fields?.length)warnings.push("商品文字存在不同候选，请对照照片确认。");
       await logScanEvent("PRODUCT_CLUE_CANDIDATES",{local,vision:visionResult,conflicts:pendingConflicts});
      }else{
       const debug=await loadScanDebug(),state=debug.vision as {status?:string;reason?:string}|undefined;
       if(state?.status==="failed")warnings.push("联网图片识别没有完成；本地文字与公开商品库查询仍会继续。");
      }
     }else{
      await logScanEvent("VISION_NOT_SENT",{reason:"VISION_CONSENT_DECLINED"});
      await saveScanDebug({vision:{status:"not_sent",reason:"VISION_CONSENT_DECLINED"}});
     }
    }else await logScanEvent("VISION_NOT_SENT",{reason:"SCANNER_BARCODE_PRIORITY"});
    if(cancelled)return;
    setClues(merged);await saveScanDebug({rawText:raw,detectedType:"product_packaging",parse:{local,vision:visionResult??null,searchClues:merged,needsUserConfirmation:true},provider:visionResult?"online+local":"local"});
    if(pendingConflicts.length){setConflicts(pendingConflicts);setChoices({});setFailure(warnings.join("\n"));await logScanEvent("PRODUCT_SEARCH_NOT_SENT",{reason:"CLUE_CONFLICT_NEEDS_CONFIRMATION",fields:pendingConflicts.map(c=>c.field)});return}
    if(!merged.barcode&&!merged.productName&&!merged.brand&&!merged.keywords.length){warnings.push("没有读到足够的商品文字，请重新拍摄或手动创建。");setFailure(warnings.join("\n"));setSearched(true);return}
    setStatus("正在查询公开商品库…");
    const input:ProductSearchInput={barcode:merged.barcode,brand:merged.brand,productName:merged.productName,variant:merged.variant,quantity:merged.quantity,keywords:merged.keywords};
    const result=await searchProducts(input);if(cancelled)return;
    setCandidates(result.candidates);setSearched(true);
    if(result.network!=="online"&&result.network!=="not_requested")setSearchNotice(productLookupMessage(result.network));
    else if(result.failures?.length)setSearchNotice("部分联网查询失败，已完成的查询仍需结合照片确认。");
    setFailure(warnings.join("\n"));
    await logScanEvent("RESULT_STATE_UPDATED",{stage:"product_candidates",candidateCount:result.candidates.length,network:result.network,completedRequests:result.completedRequests,failures:result.failures});
   }catch(error){if(!cancelled){setFailure("识别没有完成，请重新拍摄或手动修改。");setSearched(true)}await logScanError("product_recognition",error)}
   finally{if(!cancelled)setWorking(false)}
  })();return()=>{cancelled=true};
 },[photo,barcode]);
 useEffect(()=>{if(searched)logScanEvent("RESULT_STATE_UPDATED",{candidateCount:candidates.length}).catch(error=>console.warn("scan result log failed",error))},[searched,candidates.length]);
 const decision=resolveProductClues(clues,conflicts,choices);
 const makeDraft=(value:Clues)=>({brand:value.brand,name:value.productName,variant:value.variant,category:value.category,netContent:value.quantity.match(/[\d.]+/)?.[0]||"",netContentUnit:/ml/i.test(value.quantity)?"mL":/g|克/i.test(value.quantity)?"g":"",barcode:value.barcode,imageUri:photo});
 const draft=makeDraft(clues);
 const confirmAndSearch=async()=>{
  if(!decision.ready||working)return;
  const confirmed=decision.clues;setClues(confirmed);setConflicts([]);setWorking(true);setStatus("正在查询已确认的商品线索…");
  await logScanEvent("PRODUCT_CLUES_USER_CONFIRMED",{choices,clues:confirmed});
  try{
   const result=await searchProducts({barcode:confirmed.barcode,brand:confirmed.brand,productName:confirmed.productName,variant:confirmed.variant,quantity:confirmed.quantity,keywords:confirmed.keywords});
   setCandidates(result.candidates);setSearched(true);
   if(result.network!=="online"&&result.network!=="not_requested")setSearchNotice(productLookupMessage(result.network));
   else if(result.failures?.length)setSearchNotice("部分联网查询失败，已完成的查询仍需结合照片确认。");
  }catch(error){setFailure("商品查询没有完成，可以手动修改。");setSearched(true);await logScanError("product_confirmed_search",error)}finally{setWorking(false)}
 };
 return <ScrollView contentContainerStyle={p.page}><View style={p.header}><Pressable onPress={back} style={p.back}><Text style={p.backText}>‹</Text></Pressable><Text style={p.headerTitle}>识别商品</Text><View style={{width:40}}/></View><Image source={{uri:photo}} style={p.photo} resizeMode="contain"/><Text style={p.status}>{working?status:"刚才拍到的商品"}</Text>{working&&<ActivityIndicator color={teal}/>} {!!failure&&<View style={p.warning}><Text style={p.warningText}>{failure}</Text><Pressable onPress={back}><Text style={p.action}>重新拍摄</Text></Pressable></View>}{!working&&conflicts.length>0&&<View style={p.block}><Text style={p.title}>先确认有分歧的商品文字</Text><Text style={p.sub}>没有自动采用任何冲突值；选择后才会查询商品或填入草稿。</Text>{conflicts.map(c=><View key={c.field} style={{gap:7}}><Text style={p.candidateName}>{c.label}</Text><Text style={p.sub}>本地读取：{c.local}</Text><Text style={p.sub}>联网读取：{c.vision}</Text><View style={p.candidate}>{([["local","使用本地"],["vision","使用联网"],["blank","留空手动填"]] as const).map(([value,label])=><Pressable key={value} style={[p.choose,{opacity:choices[c.field]===value?1:.55}]} onPress={()=>setChoices(prior=>({...prior,[c.field]:value}))}><Text style={p.chooseText}>{choices[c.field]===value?"✓ ":""}{label}</Text></Pressable>)}</View></View>)}<Pressable disabled={!decision.ready} style={[p.main,{opacity:decision.ready?1:.45}]} onPress={confirmAndSearch}><Text style={p.mainText}>确认线索并查询</Text></Pressable><Pressable disabled={!decision.ready} onPress={()=>{if(decision.ready)onManual(makeDraft(decision.clues))}}><Text style={[p.action,{opacity:decision.ready?1:.45}]}>使用已确认线索手动创建</Text></Pressable></View>}{!working&&searched&&candidates.length>0&&<View style={p.block}><Text style={p.title}>{candidates.length===1?"找到一项候选商品资料":"我找到了几个可能的商品"}</Text>{candidates.map(c=><View key={c.key} style={p.candidate}>{!!c.imageUri&&<Image source={{uri:c.imageUri}} style={p.thumb}/>}<View style={{flex:1,gap:3}}><Text style={p.candidateName}>{c.brand} {c.name||"未命名商品（请核对）"}</Text><Text style={p.sub}>{[c.variant,c.quantity].filter(Boolean).join(" · ")||"规格未记录"}</Text>{!!c.warnings?.length&&<Text style={p.sub}>公开资料部分缺失或异常，请核对营养表后使用</Text>}</View><Pressable style={p.choose} onPress={()=>onCandidate(c)}><Text style={p.chooseText}>就是这个</Text></Pressable></View>)}<Pressable onPress={()=>setCandidates([])}><Text style={p.action}>都不是</Text></Pressable></View>}{!working&&searched&&candidates.length===0&&<View style={p.block}><Text style={p.title}>暂时没有找到完全匹配的商品</Text>{[["品牌",clues.brand],["商品名",clues.productName],["口味 / 款式",clues.variant],["规格",clues.quantity]].map(([a,b])=><View key={a} style={p.info}><Text style={p.sub}>{a}</Text><Text style={p.infoValue}>{b||"未识别"}</Text></View>)}{!!searchNotice&&<Text style={p.network}>{searchNotice}</Text>}<Pressable style={p.main} onPress={()=>onContinue("nutrition")}><Text style={p.mainText}>继续拍营养成分表</Text></Pressable><Pressable style={p.light} onPress={()=>onContinue("ingredients")}><Text style={p.lightText}>继续拍配料表</Text></Pressable><Pressable onPress={()=>onManual(draft)}><Text style={p.action}>手动创建</Text></Pressable></View>}</ScrollView>}
const p=StyleSheet.create({page:{padding:20,paddingBottom:44,gap:13,backgroundColor:"#F2FAF8",minHeight:"100%"},header:{flexDirection:"row",alignItems:"center",justifyContent:"space-between"},back:{width:40,height:40,borderRadius:20,backgroundColor:"white",alignItems:"center",justifyContent:"center"},backText:{fontSize:28,color:deep,marginTop:-3},headerTitle:{fontSize:20,fontWeight:"900",color:deep},photo:{width:"100%",height:250,borderRadius:24,backgroundColor:"#DDEAE7"},status:{fontSize:13,color:muted,textAlign:"center"},warning:{backgroundColor:"#FFF3DF",borderRadius:20,padding:18,gap:10},warningText:{fontSize:15,color:deep,lineHeight:22},block:{backgroundColor:"white",borderRadius:24,padding:18,gap:12},title:{fontSize:20,fontWeight:"900",color:deep},candidate:{flexDirection:"row",alignItems:"center",gap:10,paddingVertical:10,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:"#D8E8E5"},thumb:{width:54,height:54,borderRadius:12,backgroundColor:"#EAF2F0"},candidateName:{fontSize:14,fontWeight:"800",color:deep},sub:{fontSize:12,color:muted},choose:{backgroundColor:"#DFF4F0",borderRadius:13,paddingHorizontal:11,paddingVertical:9},chooseText:{fontSize:12,color:teal,fontWeight:"800"},action:{textAlign:"center",color:teal,fontWeight:"800",padding:7},info:{flexDirection:"row",justifyContent:"space-between",gap:12},infoValue:{fontSize:14,fontWeight:"700",color:deep,flex:1,textAlign:"right"},network:{fontSize:13,color:"#8A5A13",backgroundColor:"#FFF3DA",padding:10,borderRadius:12},main:{minHeight:50,borderRadius:16,backgroundColor:teal,alignItems:"center",justifyContent:"center"},mainText:{color:"white",fontWeight:"900"},light:{minHeight:48,borderRadius:16,backgroundColor:"#DFF4F0",alignItems:"center",justifyContent:"center"},lightText:{color:teal,fontWeight:"800"}});
