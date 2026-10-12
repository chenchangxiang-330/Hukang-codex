import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {checkOcrRegression} from './check-ocr-regression.mjs';

export function checkPaddleSwitchGate(result,score,{requireDefault=false}={}) {
  const s=checkOcrRegression(result,score,'paddle');
  if(s.correct!==10||s.wrong!==0||s.missing!==0||s.evaluatedFields!==10) throw new Error(`PADDLE_DEFAULT_GATE_NOT_MET: ${JSON.stringify(s)}`);
  let defaultScore;
  if(requireDefault){
  if(result.defaultEngine!=='paddle')throw new Error('PADDLE_DEFAULT_PROBE_NOT_CONFIGURED');
  const fail=(id,reason)=>{throw new Error(`PADDLE_DEFAULT_PROBE_INVALID:${id}:${reason}`)};
  const modelNames=['detector.onnx','recognizer.onnx','detector.yml','inference.yml'];
  for(const run of result.runs){
    const probe=run.stages.defaultProbe,ocr=probe?.ocr,reference=run.stages.preprocessed.ocr;
    if(probe?.status!=='ok'||probe.scope!=='local_only'||probe.defaultEngine!=='paddle'||
      probe.requestedEngineProvided!==false||probe.overrideBefore!==null||probe.overrideAfter!==null)
      fail(run.fixtureId,'default call missing, overridden or failed');
    if(ocr?.engine!=='paddle'||ocr.nativeEngine!=='paddle'||typeof ocr.provider!=='string'||!ocr.provider.trim())
      fail(run.fixtureId,'native engine identity');
    if(typeof ocr.text!=='string'||!ocr.text.trim()||probe.rawText!==ocr.text||
      typeof ocr.parserText!=='string'||!ocr.parserText.trim()||probe.parserInput!==ocr.parserText)
      fail(run.fixtureId,'raw or parser evidence');
    if(!/^[a-f0-9]{64}$/i.test(ocr.imageSha256??'')||ocr.imageSha256!==reference?.imageSha256||
      probe.expectedImageSha256!==ocr.imageSha256||ocr.imageUri!==reference?.imageUri||
      !Number.isFinite(ocr.imageBytes)||ocr.imageBytes<=0||ocr.imageBytes!==reference?.imageBytes)
      fail(run.fixtureId,'ROI input identity');
    const image=ocr.inputImage;
    if(!Number.isFinite(image?.width)||image.width<=0||!Number.isFinite(image?.height)||image.height<=0||
      image.coordinateSpace!=='upright_decoded_bitmap_pixels'||image.sourceToInputMatrix?.length!==9||
      !image.sourceToInputMatrix.every(Number.isFinite))fail(run.fixtureId,'image coordinate metadata');
    if(!Array.isArray(ocr.lines)||!ocr.lines.length||ocr.lines.some(line=>!line||typeof line.text!=='string'||
      ![line.left,line.top,line.right,line.bottom].every(Number.isFinite)||
      !Array.isArray(line.polygon)||line.polygon.length!==4||line.polygon.some(p=>!Number.isFinite(p?.x)||!Number.isFinite(p?.y))))
      fail(run.fixtureId,'line geometry');
    if(!Array.isArray(ocr.models)||ocr.models.length!==modelNames.length||modelNames.some(name=>
      !ocr.models.some(model=>model.file===`models/paddleocr/v5-mobile/${name}`&&/^[a-f0-9]{64}$/i.test(model.sha256??'')&&
        Number.isFinite(model.bytes)&&model.bytes>0)))fail(run.fixtureId,'model identity');
    if(['onnxRuntime','opencv','paddleSourceCommit'].some(key=>typeof ocr.versions?.[key]!=='string'||!ocr.versions[key].trim())||
      !Number.isFinite(ocr.nativeDurationMs)||ocr.nativeDurationMs<0||!Number.isFinite(ocr.timings?.ocrMs)||ocr.timings.ocrMs<0||
      !Number.isFinite(ocr.memory?.observedPeakPssKb)||ocr.memory.observedPeakPssKb<0||!(ocr.memory.sampleCount>0))
      fail(run.fixtureId,'runtime, timing or memory evidence');
    if(ocr.archivalError||!/^file:\/\//.test(ocr.evidenceUri??'')||!/^file:\/\//.test(ocr.retainedImageUri??''))
      fail(run.fixtureId,'persistent OCR evidence');
  }
  const d=score.summaries.defaultProbe;
  if(!d||d.completedImages!==2||d.failedImages!==0||d.notRunImages!==0||d.correct!==10||d.wrong!==0||d.missing!==0||
    d.evaluatedFields!==10||d.unsupportedVisibleClaims!==0||d.wrongBasisImages!==0||d.missingBasisImages!==0)
    throw new Error(`PADDLE_DEFAULT_PROBE_SCORE_NOT_MET: ${JSON.stringify(d)}`);
  defaultScore=d;
  }
  const milk=result.runs.find(run=>run.fixtureId==='6923644266066');
  // This is a post-inference QA assertion, never input to OCR or parsing.
  const outputs=['original','preprocessed'].map(name=>milk?.stages[name]?.rawText?.normalize('NFKC')??'');
  for(const decimal of ['3.6','4.4','5.0']) {
    const pattern=new RegExp(`(?<![0-9])${decimal.replace('.', '\\.')}([^0-9]|$)`);
    if(!outputs.some(text=>pattern.test(text))) throw new Error(`MILK_DECIMAL_NOT_IN_NATIVE_RAW_OUTPUT: ${decimal}`);
    if(requireDefault&&!pattern.test(milk.stages.defaultProbe.rawText.normalize('NFKC')))throw new Error(`DEFAULT_PROBE_MILK_DECIMAL_NOT_IN_NATIVE_RAW_OUTPUT:${decimal}`);
  }
  return {status:'passed',correct:s.correct,wrong:s.wrong,missing:s.missing,scope:'two_public_photos_10_fields_only',
    ...(requireDefault?{defaultEngine:'paddle',defaultProbe:{correct:defaultScore.correct,wrong:defaultScore.wrong,missing:defaultScore.missing,scope:'ordinary_default_dispatch_on_same_roi_files'}}:
      {defaultProbe:{status:'not_run',reason:'DEFAULT_PROBE_NOT_REQUIRED_FOR_CANDIDATE_GATE'}}),
    nativeMilkDecimals:['3.6','4.4','5.0']};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const [raw,scored]=process.argv.slice(2);
  const requireDefault=process.argv.slice(4).includes('--require-default');
  console.log(JSON.stringify(checkPaddleSwitchGate(JSON.parse(readFileSync(raw,'utf8')),JSON.parse(readFileSync(scored,'utf8')),{requireDefault}),null,2));
}
