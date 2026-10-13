import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import ts from "typescript";
import {textInReadingRows,textInNutritionRows} from "../src/ocrGeometry.ts";

// Bridge/settings tests only. These mocks do not execute image OCR or prove accuracy.
const compile=name=>ts.transpileModule(readFileSync(new URL(`../src/${name}.ts`,import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function load(code,imports){const module={exports:{}};new Function("require","module","exports",code)(name=>{if(!(name in imports))throw new Error(`Unexpected import ${name}`);return imports[name]},module,module.exports);return module.exports}
const settingsCode=compile("ocrEngineSettings"),ocrCode=compile("ocr");
function harness(){
  const values=new Map(),calls=[],archives=[];
  const storage={getItem:async key=>values.get(key)??null,setItem:async(key,value)=>values.set(key,value),removeItem:async key=>values.delete(key)};
  const settings=load(settingsCode,{"@react-native-async-storage/async-storage":{__esModule:true,default:storage}});
  const raw=engine=>({engine,text:"蛋白质 3.6g",lines:[{text:"蛋白质 3.6g",confidence:.9375,left:1,top:2,right:25,bottom:10,polygon:[{x:1,y:2},{x:25,y:2},{x:25,y:10},{x:1,y:10}]}],provider:engine,nativeDurationMs:27,durationMs:27,imageUri:"file:mock-input",imageSha256:"a".repeat(64),versions:{mock:"test-only"},memory:{observedPeakPssKb:123}});
  const native={HuKangOcr:{recognizeDetailed:async()=>{calls.push("mlkit");return raw("mlkit")}},HuKangPaddleOcr:{recognizeDetailed:async()=>{calls.push("paddle");return raw("paddle")}}};
  const ocr=load(ocrCode,{"react-native":{NativeModules:native,Platform:{OS:"android"}},"./ocrGeometry":{textInReadingRows,textInNutritionRows},"./scanMetrics":{logScanEvent:async()=>{},saveScanDebug:async()=>{}},"./ocrEngineSettings":settings,"./ocrEvidenceArchive":{archiveOcrEvidence:async input=>{archives.push(input);return{evidenceUri:"file:mock-evidence",retainedImageUri:"file:mock-copy",archivalDurationMs:2}}}});
  return{values,calls,archives,native,settings,ocr};
}
test("reversible override keeps a separate key and rejects invalid engines",async()=>{
  const {settings,values}=harness();
  assert.equal(await settings.getOcrEngineOverride(),null);
  await settings.setOcrEngineOverride("paddle");assert.equal(await settings.getOcrEngineOverride(),"paddle");
  assert.deepEqual([...values.keys()],["@hukang/ocr-engine-override"]);
  await settings.setOcrEngineOverride("mlkit");assert.equal(await settings.getOcrEngineOverride(),"mlkit");
  await settings.setOcrEngineOverride(null);assert.equal(values.size,0);
  values.set("@hukang/ocr-engine-override","future-unknown");assert.equal(await settings.getOcrEngineOverride(),null);
  await assert.rejects(settings.setOcrEngineOverride("unknown"),/OCR_ENGINE_OVERRIDE_INVALID/);
});
test("explicit benchmark engine ignores device override and retains native evidence",async()=>{
  const {settings,ocr,calls,archives}=harness();await settings.setOcrEngineOverride("paddle");
  const result=await ocr.recognizeDetailed("file:mock-input","nutrition","mlkit");
  assert.deepEqual(calls,["mlkit"]);assert.equal(result.engine,"mlkit");assert.equal(result.nativeEngine,"mlkit");assert.equal(result.durationMs,27);assert.equal(result.nativeDurationMs,27);
  assert.equal(result.text,"蛋白质 3.6g");assert.equal(result.evidenceUri,"file:mock-evidence");
  assert.deepEqual(result.lines,archives[0].raw.lines);assert.equal(archives[0].parserInput,result.parserText);assert.equal(archives[0].raw.parserText,undefined);
  assert.deepEqual(result.memory,archives[0].raw.memory);assert.equal(result.imageSha256,"a".repeat(64));
});
test("ordinary recognition without an override selects the Paddle default and preserves native identity",async()=>{
  const {ocr,settings,calls,archives}=harness();
  assert.equal(ocr.DEFAULT_OCR_ENGINE,"paddle");assert.equal(await settings.getOcrEngineOverride(),null);
  const result=await ocr.recognizeDetailed("file:mock-input","nutrition");
  assert.deepEqual(calls,["paddle"]);assert.equal(result.engine,"paddle");assert.equal(result.nativeEngine,"paddle");
  assert.equal(archives[0].raw.engine,"paddle");assert.equal(result.text,archives[0].raw.text);
});
test("a bridge missing native identity does not acquire it from JavaScript's selected engine",async()=>{
  const {ocr,native}=harness();native.HuKangPaddleOcr.recognizeDetailed=async()=>({text:"mock",lines:[],provider:"mock-no-native-identity"});
  const result=await ocr.recognizeDetailed("file:mock-input","nutrition");
  assert.equal(result.engine,"paddle");assert.equal(result.nativeEngine,null);
});
test("ordinary recognition honors override while explicit failed Paddle never calls ML Kit",async()=>{
  const {settings,ocr,calls,native}=harness();await settings.setOcrEngineOverride("paddle");
  assert.equal((await ocr.recognizeDetailed("file:mock-input")).engine,"paddle");
  native.HuKangPaddleOcr.recognizeDetailed=async()=>{calls.push("paddle-error");throw new Error("MOCK_MODEL_LOAD_FAILED")};
  await assert.rejects(ocr.recognizeDetailed("file:mock-input","nutrition","paddle"),/MOCK_MODEL_LOAD_FAILED/);
  assert.deepEqual(calls,["paddle","paddle-error"]);
  await settings.setOcrEngineOverride("mlkit");assert.equal((await ocr.recognizeDetailed("file:mock-input")).engine,"mlkit");
});
test("an unavailable or misreported requested engine fails instead of relabeling results",async()=>{
  const {ocr,native,calls}=harness();delete native.HuKangPaddleOcr;
  await assert.rejects(ocr.recognizeDetailed("file:mock-input","nutrition","paddle"),/OCR_MODULE_UNAVAILABLE:paddle/);assert.deepEqual(calls,[]);
  native.HuKangPaddleOcr={recognizeDetailed:async()=>({text:"mock",lines:[],engine:"mlkit"})};
  await assert.rejects(ocr.recognizeDetailed("file:mock-input","nutrition","paddle"),/OCR_NATIVE_ENGINE_MISMATCH/);
});
