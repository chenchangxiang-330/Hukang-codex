import test from "node:test";
import assert from "node:assert/strict";
import { nutritionSaveEvidence, productSaveEvidence } from "../src/recognitionSaveEvidence.ts";

test("choosing Vision keeps exact OCR text and separate remote evidence", () => {
  const primary = {text:"蛋白质 36g\n449\n509"}, original = {text:"项目\n蛋白质\n36g"};
  const vision = {raw_text:"蛋白质 3.6g",nutrition:{protein_g:3.6}};
  const saved = nutritionSaveEvidence({primary,original,vision,choice:"vision",localChoice:null});
  assert.equal(saved.rawText, primary.text);
  assert.deepEqual(JSON.parse(saved.recognitionEvidenceJson), {schemaVersion:1,local:{primary,original},vision,selection:{basisSource:"vision",localSource:null}});
  assert.equal(nutritionSaveEvidence({primary,original,vision,choice:"local",localChoice:"original"}).rawText,original.text);
});
test("editing a saved product preserves OCR, source and independent evidence", () => {
  const existing = {ocrRawText:"原始 36g",dataSource:"mixed",recognitionEvidenceJson:'{"vision":{"protein_g":3.6}}'};
  assert.deepEqual(productSaveEvidence({},existing),existing);
  assert.deepEqual(productSaveEvidence({rawText:"新原文",source:"local_ocr"},existing),{...existing,ocrRawText:"新原文",dataSource:"local_ocr"});
  assert.equal(productSaveEvidence({rawText:""},existing).ocrRawText,null);
  assert.deepEqual(productSaveEvidence({},null),{ocrRawText:null,dataSource:"manual",recognitionEvidenceJson:null});
});

test("confirmed values stay separate from unchanged OCR geometry, image and engine metadata across rename", () => {
  const primary = {text:"蛋白质 36g",parserText:"蛋白质 36g",lines:[{text:"蛋白质 36g",confidence:.8,left:12,top:40,right:160,bottom:62,polygon:[{x:12,y:40},{x:160,y:42},{x:159,y:62},{x:13,y:61}]}],engine:"paddle",provider:"paddle-onnx",imageUri:"file:///files/cropped.jpg",imageSha256:"a".repeat(64),inputImage:{width:512,height:768,sourceWidth:1024,sourceHeight:1536,sampleSize:2,sourceOrientation:1,coordinateSpace:"decoded_image_pixels"},models:[{file:"recognition.onnx",sha256:"b".repeat(64),bytes:1234}],versions:{onnxRuntime:"test-runtime",opencv:"test-opencv",paddleSourceCommit:"test-source"},nativeDurationMs:321,durationMs:350,memory:{peakPssKb:12345},timings:{recognitionMs:210}};
  const original = {...primary,text:"未裁剪原始 36g",imageUri:"file:///files/original.jpg",imageSha256:"c".repeat(64)};
  const before=structuredClone({primary,original});
  const confirmation={kind:"user_confirmed",basisAmount:100,basisUnit:"mL",nutrients:{proteinG:null,fatG:4.4,transFatG:0}};
  const saved=nutritionSaveEvidence({primary,original,vision:{raw_text:"3.6g",nutrition:{protein_g:3.6}},choice:"vision",localChoice:null,images:{primaryUri:primary.imageUri,originalUri:original.imageUri},confirmation});
  const json=JSON.parse(saved.recognitionEvidenceJson);
  assert.deepEqual(json.local,before);assert.deepEqual(json.confirmed,confirmation);
  assert.equal(json.local.primary.lines[0].text,"蛋白质 36g");assert.equal(json.confirmed.nutrients.proteinG,null);
  assert.equal(json.vision.nutrition.protein_g,3.6);assert.equal(saved.rawText,primary.text);
  const existing={name:"识别商品",ocrRawText:saved.rawText,dataSource:"online_vision",recognitionEvidenceJson:saved.recognitionEvidenceJson};
  const renamed={...existing,name:"改名商品",...productSaveEvidence({},existing)};
  assert.equal(renamed.recognitionEvidenceJson,saved.recognitionEvidenceJson);
  assert.deepEqual({primary,original},before);
});

test("evidence capture without confirmed user values does not invent a confirmation", () => {
  const saved=nutritionSaveEvidence({primary:{text:"不完整原文"},original:null,vision:null,choice:null,localChoice:null});
  const json=JSON.parse(saved.recognitionEvidenceJson);
  assert.equal(Object.hasOwn(json,"confirmed"),false);assert.equal(Object.hasOwn(json,"images"),false);
});
