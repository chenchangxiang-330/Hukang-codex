import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {checkPaddleSwitchGate} from '../scripts/check-paddle-switch-gate.mjs';
import {validateOcrRun} from '../scripts/validate-ocr-run.mjs';
import {loadFixtures,scoreBenchmark} from '../scripts/score-ocr-benchmark.mjs';

// Synthetic records exercise acceptance and CLI guards only. No image OCR is executed.
const fixtures=loadFixtures();
const sample=()=>({status:'completed',engine:'paddle',runId:'ocr-paddle-fresh',
  startedAt:'2026-10-11T18:00:00Z',completedAt:'2026-10-11T18:01:00Z',
  runs:fixtures.map(fixture=>({fixtureId:fixture.fixtureId,platform:'android',evidence:'device_paddle_image_execution',stages:{
    original:{status:'ok',rawText:fixture.manualTranscription,fields:fixture.fields,basis:fixture.basis,
      ocr:{engine:'paddle',lines:[{text:fixture.manualTranscription}],imageSha256:'a'.repeat(64),models:[{file:'synthetic-model'}]}},
    preprocessed:{status:'ok',rawText:fixture.manualTranscription,fields:fixture.fields,basis:fixture.basis,
      ocr:{engine:'paddle',lines:[{text:fixture.manualTranscription}],imageSha256:'a'.repeat(64),models:[{file:'synthetic-model'}]}},
    production:{status:'ok',rawText:fixture.manualTranscription},
    merged:{status:'ok',fields:fixture.fields,basis:fixture.basis},
    vision:{status:'not_run',reason:'CI_NO_VISION_KEY'},
  }}))});
const score=result=>scoreBenchmark(fixtures,result.runs);
const withDefault=()=>{
  const result=sample();result.defaultEngine='paddle';
  for(const run of result.runs){
    const fixture=fixtures.find(item=>item.fixtureId===run.fixtureId);
    const ocr={engine:'paddle',nativeEngine:'paddle',provider:'synthetic-native-paddle',
      text:fixture.manualTranscription,parserText:fixture.manualTranscription,
      imageUri:`file:///fixtures/${fixture.fixtureId}-roi.jpg`,imageSha256:'a'.repeat(64),imageBytes:100,
      inputImage:{width:100,height:200,coordinateSpace:'upright_decoded_bitmap_pixels',sourceToInputMatrix:[1,0,0,0,1,0,0,0,1]},
      lines:[{text:fixture.manualTranscription,left:0,top:0,right:100,bottom:20,polygon:[{x:0,y:0},{x:100,y:0},{x:100,y:20},{x:0,y:20}]}],
      models:['detector.onnx','recognizer.onnx','detector.yml','inference.yml'].map(name=>({file:`models/paddleocr/v5-mobile/${name}`,sha256:'b'.repeat(64),bytes:100})),
      versions:{onnxRuntime:'synthetic-runtime',opencv:'synthetic-opencv',paddleSourceCommit:'synthetic-source'},
      nativeDurationMs:100,timings:{ocrMs:80},memory:{observedPeakPssKb:12345,sampleCount:3},
      evidenceUri:`file:///archive/${fixture.fixtureId}.json`,retainedImageUri:`file:///archive/${fixture.fixtureId}.bin`,
    };
    run.stages.preprocessed.ocr=structuredClone(ocr);
    run.stages.defaultProbe={status:'ok',scope:'local_only',defaultEngine:'paddle',requestedEngineProvided:false,
      overrideBefore:null,overrideAfter:null,expectedImageSha256:ocr.imageSha256,
      rawText:ocr.text,parserInput:ocr.parserText,fields:fixture.fields,basis:fixture.basis,ocr};
  }
  return result;
};
const requireDefault={requireDefault:true};

test('candidate gate retains compatibility with older explicit Android comparisons without claiming default verification',()=>{
  const r=sample(),passed=checkPaddleSwitchGate(r,score(r));
  assert.equal(passed.status,'passed');assert.equal(passed.defaultProbe.status,'not_run');
  assert.throws(()=>checkPaddleSwitchGate(r,score(r),requireDefault),/DEFAULT_PROBE_NOT_CONFIGURED/);
  const reduced=score(r);reduced.summaries.merged.correct=7;reduced.summaries.merged.missing=3;
  assert.throws(()=>checkPaddleSwitchGate(r,reduced),/DEFAULT_GATE_NOT_MET/);
  const wrong=score(r);wrong.summaries.merged.wrong=1;
  assert.throws(()=>checkPaddleSwitchGate(r,wrong),/worsened/);
  const modelMissing=sample();delete modelMissing.runs[0].stages.original.ocr.models;
  assert.throws(()=>checkPaddleSwitchGate(modelMissing,score(modelMissing)),/identity/);
  const host=sample();host.runs[0].platform='mac';assert.throws(()=>checkPaddleSwitchGate(host,score(host)),/Android/);
});
test('correct candidate numbers cannot pass when milk decimals were fabricated after inference',()=>{
  const r=sample(),milk=r.runs.find(run=>run.fixtureId==='6923644266066');
  milk.stages.original.rawText='蛋白质36g 脂肪44g 碳水50g';milk.stages.preprocessed.rawText='same damaged OCR';
  assert.throws(()=>checkPaddleSwitchGate(r,score(r)),/DECIMAL_NOT_IN_NATIVE_RAW_OUTPUT/);
});
test('default verification requires two ordinary calls, native identities and separately scored ROI results',()=>{
  const r=withDefault(),s=score(r),before=structuredClone(r);
  const passed=checkPaddleSwitchGate(r,s,requireDefault);
  assert.equal(passed.status,'passed');assert.equal(passed.defaultProbe.correct,10);
  assert.deepEqual(r,before);assert.equal(s.summaries.defaultProbe.completedImages,2);
  assert.equal(s.summaries.defaultProbe.correct,10);assert.equal(s.summaries.merged.correct,10);
});
test('default metadata failures cannot be satisfied by correct explicit benchmark scores',()=>{
  for(const mutate of [
    run=>{delete run.stages.defaultProbe},
    run=>{run.stages.defaultProbe.status='not_run'},
    run=>{run.stages.defaultProbe.status='error';run.stages.defaultProbe.reason='MODEL_FAILURE'},
    run=>{run.stages.defaultProbe.requestedEngineProvided=true},
    run=>{run.stages.defaultProbe.overrideBefore='mlkit'},
    run=>{run.stages.defaultProbe.overrideAfter='paddle'},
    run=>{run.stages.defaultProbe.ocr.nativeEngine=null},
    run=>{run.stages.defaultProbe.ocr.nativeEngine='mlkit'},
    run=>{run.stages.defaultProbe.ocr.imageSha256='c'.repeat(64)},
    run=>{run.stages.defaultProbe.ocr.imageUri='file:///different-image.jpg'},
    run=>{run.stages.defaultProbe.ocr.imageBytes=0},
    run=>{run.stages.defaultProbe.ocr.inputImage.sourceToInputMatrix=[]},
    run=>{run.stages.defaultProbe.ocr.lines[0].polygon=[]},
    run=>{run.stages.defaultProbe.ocr.models.pop()},
    run=>{run.stages.defaultProbe.ocr.versions={}},
    run=>{run.stages.defaultProbe.ocr.nativeDurationMs=-1},
    run=>{run.stages.defaultProbe.ocr.memory.sampleCount=0},
    run=>{run.stages.defaultProbe.ocr.archivalError='COPY_FAILED'},
    run=>{delete run.stages.defaultProbe.ocr.evidenceUri},
    run=>{run.stages.defaultProbe.rawText=''},
  ]){
    const r=withDefault();mutate(r.runs[0]);
    assert.equal(score(r).summaries.merged.correct,10);
    assert.throws(()=>checkPaddleSwitchGate(r,score(r),requireDefault),/DEFAULT_PROBE/);
  }
});
test('default-only wrong, missing, invented or mismatched-basis fields fail independent scoring',()=>{
  for(const mutate of [
    stage=>{stage.fields={...stage.fields,protein_g:999}},
    stage=>{stage.fields={...stage.fields,sodium_mg:null}},
    stage=>{stage.fields={...stage.fields,added_sugar_g:2}},
    stage=>{stage.basis={amount:100,unit:'unknown'}},
  ]){
    const r=withDefault();mutate(r.runs[0].stages.defaultProbe);
    assert.equal(score(r).summaries.merged.correct,10);
    assert.throws(()=>checkPaddleSwitchGate(r,score(r),requireDefault),/DEFAULT_PROBE_SCORE_NOT_MET/);
  }
});
test('the default probe must itself retain milk decimals in native raw output',()=>{
  const r=withDefault(),probe=r.runs.find(run=>run.fixtureId==='6923644266066').stages.defaultProbe;
  probe.rawText=probe.ocr.text='蛋白质36g 脂肪44g 碳水50g';
  assert.throws(()=>checkPaddleSwitchGate(r,score(r),requireDefault),/DEFAULT_PROBE_MILK_DECIMAL/);
});
test('the cloud CLI flag strictly requires fresh default-probe evidence',()=>{
  const directory=mkdtempSync(join(tmpdir(),'hukang-default-gate-test-'));
  try{
    const raw=join(directory,'raw.json'),scored=join(directory,'score.json');
    const write=r=>{writeFileSync(raw,JSON.stringify(r));writeFileSync(scored,JSON.stringify(score(r)))};
    const call=flag=>spawnSync(process.execPath,[fileURLToPath(new URL('../scripts/check-paddle-switch-gate.mjs',import.meta.url)),raw,scored,...(flag?['--require-default']:[])],{encoding:'utf8'});
    write(sample());assert.equal(call(false).status,0);assert.notEqual(call(true).status,0);
    write(withDefault());const verified=call(true);assert.equal(verified.status,0,verified.stderr);
    assert.equal(JSON.parse(verified.stdout).defaultProbe.correct,10);
  }finally{rmSync(directory,{recursive:true,force:true})}
});
test('fresh Paddle runs cannot be satisfied by ML Kit or a stale run',()=>{
  assert.doesNotThrow(()=>validateOcrRun(sample(),'ocr-paddle-fresh','paddle'));
  assert.throws(()=>validateOcrRun(sample(),'ocr-old','paddle'),/identity mismatch/);
  assert.throws(()=>validateOcrRun(sample(),'ocr-paddle-fresh','mlkit'),/engine mismatch/);
});
