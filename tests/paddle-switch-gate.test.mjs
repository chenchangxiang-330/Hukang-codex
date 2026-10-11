import test from 'node:test';
import assert from 'node:assert/strict';
import {checkPaddleSwitchGate} from '../scripts/check-paddle-switch-gate.mjs';
import {validateOcrRun} from '../scripts/validate-ocr-run.mjs';
// Synthetic data exercise acceptance guards only, never count as OCR evidence.
const sample=()=>({status:'completed',engine:'paddle',runId:'ocr-paddle-fresh',startedAt:'2026-10-11T18:00:00Z',completedAt:'2026-10-11T18:01:00Z',runs:['6923644266066','6937003117814'].map(fixtureId=>({fixtureId,platform:'android',evidence:'device_paddle_image_execution',stages:{
 original:{status:'ok',rawText:'蛋白质 3.6g 脂肪 4.4g 碳水化合物 5.0g',ocr:{engine:'paddle',lines:[{text:'3.6g'}],imageSha256:'hash',models:[{file:'model'}]}},
 preprocessed:{status:'ok',rawText:'raw ROI',ocr:{engine:'paddle',lines:[{text:'raw ROI'}],imageSha256:'hash',models:[{file:'model'}]}},
 production:{status:'ok',rawText:'raw ROI'},vision:{status:'not_run',reason:'CI_NO_VISION_KEY'}
}}))});
const score=()=>({summaries:{merged:{correct:10,wrong:0,missing:0,evaluatedFields:10,unsupportedVisibleClaims:0,wrongBasisImages:0,missingBasisImages:0}}});
test('default gate requires Android Paddle output plus exact numeric and basis checks',()=>{
 assert.equal(checkPaddleSwitchGate(sample(),score()).status,'passed');
 const reduced=score();reduced.summaries.merged.correct=7;reduced.summaries.merged.missing=3;
 assert.throws(()=>checkPaddleSwitchGate(sample(),reduced),/DEFAULT_GATE_NOT_MET/);
 const wrong=score();wrong.summaries.merged.wrong=1;
 assert.throws(()=>checkPaddleSwitchGate(sample(),wrong),/worsened/);
 const modelMissing=sample();delete modelMissing.runs[0].stages.original.ocr.models;
 assert.throws(()=>checkPaddleSwitchGate(modelMissing,score()),/identity/);
 const host=sample();host.runs[0].platform='mac';assert.throws(()=>checkPaddleSwitchGate(host,score()),/Android/);
});
test('correct candidate numbers cannot pass if decimals were fabricated after inference',()=>{
 const r=sample();r.runs[0].stages.original.rawText='蛋白质36g 脂肪44g 碳水50g';
 assert.throws(()=>checkPaddleSwitchGate(r,score()),/DECIMAL_NOT_IN_NATIVE_RAW_OUTPUT/);
});
test('fresh Paddle run cannot be satisfied by ML Kit or a stale run',()=>{
 assert.doesNotThrow(()=>validateOcrRun(sample(),'ocr-paddle-fresh','paddle'));
 assert.throws(()=>validateOcrRun(sample(),'ocr-old','paddle'),/identity mismatch/);
 assert.throws(()=>validateOcrRun(sample(),'ocr-paddle-fresh','mlkit'),/engine mismatch/);
});
