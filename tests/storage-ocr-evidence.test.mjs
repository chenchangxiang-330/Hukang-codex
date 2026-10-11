import test from "node:test";
import assert from "node:assert/strict";
import { storageOcrCandidates } from "../src/storageOcrEvidence.ts";

const runId="paddle-storage-test-20261012",sourceCommit="a".repeat(40);
const keys=["energyKcal","energyKj","proteinG","fatG","saturatedFatG","transFatG","carbohydrateG","totalSugarG","addedSugarG","fiberG","sodiumMg"];
function report() {
  return {status:"completed",engine:"paddle",runId,buildInfo:{sourceCommit},runs:["6923644266066","6937003117814"].map(fixtureId=>({fixtureId,stages:{production:{status:"ok",result:{
    ocr:{engine:"paddle",provider:"test-storage-only",text:`原始文字 ${fixtureId}`,parserText:`行重排文字 ${fixtureId}`,lines:[{text:"蛋白质36g",confidence:.8,left:0,top:1,right:20,bottom:10,polygon:[{x:0,y:1},{x:20,y:1},{x:20,y:10},{x:0,y:10}]}],imageUri:`file:///files/${fixtureId}.jpg`,imageSha256:"b".repeat(64),inputImage:{width:100,height:200,coordinateSpace:"decoded_image_pixels"},models:[{file:"model.onnx",sha256:"c".repeat(64),bytes:100}],versions:{onnxRuntime:"test-runtime",opencv:"test-opencv",paddleSourceCommit:"test-source"},durationMs:400,nativeDurationMs:350,timings:{recognitionMs:250},memory:{peakPssKb:12345},evidenceUri:`file:///files/archive-${fixtureId}.json`,retainedImageUri:`file:///files/archive-${fixtureId}.jpg`,archivalDurationMs:20},
    originalOcr:null,vision:null,merged:{basisAmount:125,basisUnit:"mL",basisConflict:false,nutrients:Object.fromEntries(keys.map(key=>[key,key==="transFatG"?0:key==="proteinG"?36:key==="sodiumMg"?58:null])),fields:Object.fromEntries(keys.map(key=>[key,{status:key==="proteinG"?"uncertain":"local_only"}]))},
  }}}}))};
}

test("matching completed public Paddle runs retain raw geometry/identity and suppress unresolved values for storage",()=>{
  const input=report(),before=structuredClone(input),candidates=storageOcrCandidates(input,runId,sourceCommit);
  assert.equal(candidates.length,2);assert.deepEqual(candidates[0].ocr,input.runs[0].stages.production.result.ocr);
  assert.equal(candidates[0].nutrients.proteinG,null);assert.equal(candidates[0].nutrients.transFatG,0);assert.equal(candidates[0].nutrients.sodiumMg,58);
  assert.equal(candidates[0].basisAmount,125);assert.equal(candidates[0].basisUnit,"mL");
  assert.deepEqual(input,before);
});

test("storage never accepts another run/build/engine, failed production or an unknown private fixture",()=>{
  for(const mutate of [value=>{value.runId="previous-run"},value=>{value.buildInfo.sourceCommit="d".repeat(40)},value=>{value.engine="mlkit"},value=>{value.status="error"},value=>{value.runs[0].fixtureId="private-photo"},value=>{value.runs[1].fixtureId=value.runs[0].fixtureId},value=>{value.runs[0].stages.production.status="error"},value=>{value.runs.pop()}]) {
    const input=report();mutate(input);assert.throws(()=>storageOcrCandidates(input,runId,sourceCommit),/STORAGE_REAL_OCR/);
  }
});

test("saving a real candidate requires its image/model hash, version, full line coordinates and valid basis",()=>{
  for(const mutate of [value=>{value.ocr.imageSha256="not-a-sha"},value=>{value.ocr.imageUri="https://private.example/photo"},value=>{value.ocr.models=[]},value=>{value.ocr.models[0].sha256=""},value=>{value.ocr.versions={}},value=>{value.ocr.lines[0].polygon=[]},value=>{value.ocr.lines[0].left=NaN},value=>{value.ocr.lines[0]=null},value=>{value.ocr.nativeDurationMs=-1},value=>{value.ocr.archivalError="COPY_FAILED"},value=>{delete value.ocr.evidenceUri},value=>{value.merged.basisAmount=null},value=>{value.merged.basisConflict=true},value=>{value.merged.nutrients.sodiumMg=-1}]) {
    const input=report();mutate(input.runs[0].stages.production.result);assert.throws(()=>storageOcrCandidates(input,runId,sourceCommit),/STORAGE_REAL_OCR/);
  }
});
